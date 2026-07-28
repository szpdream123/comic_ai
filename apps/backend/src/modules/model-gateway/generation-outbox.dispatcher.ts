import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  claimOutboxEventsForDispatch,
  markOutboxEventFailed,
  markOutboxEventProcessed,
  type OutboxEventRecord,
} from "../shared/outbox/outbox-dispatch-repair.service.ts";
import {
  buildGenerationBullMQJob,
  publishGenerationTaskCreatedToBullMQ,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import { createGenerationProviderRouteIdentity } from "./generation-model-config-snapshot.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import {
  markGenerationQueueStagePublished,
  reserveGenerationQueueStageForPublish,
} from "./generation-queue-shard.store.ts";

const generationTaskCreatedEventType = "generation.task.created";
const generationTaskFinalizeRequestedEventType = "generation.task.finalize_requested";
const generationTaskPollRequestedEventType = "generation.task.poll_requested";
const defaultRetryDelayMs = 30_000;
const maximumRetryDelayMs = 15 * 60_000;

export interface DispatchGenerationOutboxBatchInput {
  now: Date;
  limit: number;
  retryDelayMs?: number;
  config: GenerationQueueConfig;
  publisher: GenerationBullMQPublisher;
  shardStore?: GenerationQueueShardStore;
}

export interface GenerationQueueShardStore {
  reserve(
    db: SqlDatabase,
    input: Parameters<typeof reserveGenerationQueueStageForPublish>[1],
  ): ReturnType<typeof reserveGenerationQueueStageForPublish>;
  markPublished(
    db: SqlDatabase,
    input: Parameters<typeof markGenerationQueueStagePublished>[1],
  ): ReturnType<typeof markGenerationQueueStagePublished>;
}

export interface DispatchGenerationOutboxBatchResult {
  processedEventIds: string[];
  failedEventIds: string[];
}

interface DispatchClaimedGenerationOutboxEventsInput {
  events: OutboxEventRecord[];
  now: Date;
  retryDelayMs?: number;
  config: GenerationQueueConfig;
  publisher: GenerationBullMQPublisher;
  shardStore?: GenerationQueueShardStore;
}

interface DispatchClaimedGenerationOutboxEventsDeps {
  publish?: typeof publishGenerationTaskCreatedToBullMQ;
  markProcessed?: typeof markOutboxEventProcessed;
  markFailed?: typeof markOutboxEventFailed;
}

export async function dispatchGenerationOutboxBatch(
  db: SqlDatabase,
  input: DispatchGenerationOutboxBatchInput,
): Promise<DispatchGenerationOutboxBatchResult> {
  const events = await claimOutboxEventsForDispatch(db, {
    now: input.now,
    limit: input.limit,
    eventTypes: [
      generationTaskCreatedEventType,
      generationTaskFinalizeRequestedEventType,
      generationTaskPollRequestedEventType,
    ],
    fairnessScope: "generation",
    membershipQuantum: input.config.outbox.membershipQuantum,
  });
  return dispatchClaimedGenerationOutboxEvents(db, {
    events,
    now: input.now,
    retryDelayMs: input.retryDelayMs,
    config: input.config,
    publisher: input.publisher,
    shardStore: input.shardStore,
  });
}

export async function dispatchClaimedGenerationOutboxEvents(
  db: SqlDatabase,
  input: DispatchClaimedGenerationOutboxEventsInput,
  deps: DispatchClaimedGenerationOutboxEventsDeps = {},
): Promise<DispatchGenerationOutboxBatchResult> {
  const publish = deps.publish ?? publishGenerationTaskCreatedToBullMQ;
  const markProcessed = deps.markProcessed ?? markOutboxEventProcessed;
  const markFailed = deps.markFailed ?? markOutboxEventFailed;
  const outcomes = await mapWithConcurrency(
    input.events,
    input.config.sharding.publishConcurrency,
    async (event) => {
    try {
      const routedEvent = await routeGenerationOutboxEvent(db, event, input);
      await publish(routedEvent, {
        config: input.config,
        publisher: input.publisher,
      });
      const assignmentKey = readString(routedEvent.payload.queueAssignmentKey);
      if (assignmentKey && input.shardStore) {
        try {
          await input.shardStore.markPublished(db, {
            assignmentKey,
            redisJobId: buildGenerationBullMQJob(routedEvent, input.config).jobId,
            now: input.now,
          });
        } catch {
          // Redis accepted the job; assignment reconciliation owns DB repair.
        }
      }
    } catch (error) {
      const errorMessage = errorMessageFromUnknown(error);
      await markFailed(db, {
        outboxEventId: event.id,
        errorMessage,
        retryAt: new Date(input.now.getTime() + retryDelayMs(event, input.retryDelayMs)),
        now: input.now,
      });
      return { status: "failed" as const, eventId: event.id };
    }
    await markProcessed(db, {
      outboxEventId: event.id,
      now: input.now,
    });
    return { status: "processed" as const, eventId: event.id };
    },
  );

  return {
    processedEventIds: outcomes
      .filter((outcome) => outcome.status === "processed")
      .map((outcome) => outcome.eventId),
    failedEventIds: outcomes
      .filter((outcome) => outcome.status === "failed")
      .map((outcome) => outcome.eventId),
  };
}

async function routeGenerationOutboxEvent(
  db: SqlDatabase,
  event: OutboxEventRecord,
  input: DispatchClaimedGenerationOutboxEventsInput,
) {
  if (!input.config.sharding.enabled || !input.shardStore) return event;
  const mediaType = readMediaType(event.payload.mediaType);
  const artifactStage = readString(event.payload.artifactStage);
  const stage = event.eventType === generationTaskCreatedEventType
    ? "submit"
    : event.eventType === generationTaskPollRequestedEventType
      ? "poll"
      : artifactStage === "fetch" ? "fetch" : "persist";
  const taskId = readRequiredString(event.payload.taskId);
  const providerRouteIdentity = readString(event.payload.providerRouteIdentity)
    || await readTaskProviderRouteIdentity(db, taskId);
  const routeKey = [
    readString(event.payload.providerExecutor) || "model-gateway",
    readString(event.payload.modelCode),
    providerRouteIdentity,
    stage === "persist" ? readString(event.payload.storageBucket) : "",
  ].filter(Boolean).join(":");
  const assignmentDiscriminator = event.eventType === generationTaskFinalizeRequestedEventType
      && readString(event.payload.finalizeMode) !== "retry_persist_asset"
    ? event.id
    : readPositiveInteger(event.payload.pollAttempt) ?? 0;
  const assignmentKey = `${event.eventType}:${taskId}:${stage}:${assignmentDiscriminator}`;
  const redisJobId = buildGenerationBullMQJob(event, input.config).jobId;
  let assignment: {
    assignmentKey: string;
    queueName: string;
    shardId: string;
    shardNo: number;
    routeCode: string;
  };
  try {
    assignment = await input.shardStore.reserve(db, {
      assignmentKey,
      taskId,
      mediaType,
      stage,
      routeKey,
      redisJobId,
      now: input.now,
      maxActiveShardsPerStage: input.config.sharding.maxActiveShardsPerStage,
      reopenThreshold: input.config.sharding.reopenThreshold,
    });
  } catch (error) {
    if (errorMessageFromUnknown(error) !== "generation_queue_assignment_already_released") throw error;
    const released = await queryOneReleasedAssignment(db, { assignmentKey, taskId, redisJobId });
    if (!released) throw error;
    assignment = released;
  }
  return {
    ...event,
    payload: {
      ...event.payload,
      queueName: assignment.queueName,
      shardId: assignment.shardId,
      shardNo: assignment.shardNo,
      routeCode: assignment.routeCode,
      queueAssignmentKey: assignment.assignmentKey,
    },
  };
}

async function queryOneReleasedAssignment(
  db: SqlDatabase,
  input: { assignmentKey: string; taskId: string; redisJobId: string },
) {
  const result = await db.query<{
    assignment_key: string;
    queue_name: string;
    shard_id: string;
    shard_no: number;
    route_code: string;
  }>(
    `
      SELECT assignment.assignment_key,
             shard.queue_name,
             shard.id AS shard_id,
             shard.shard_no,
             shard.route_code
      FROM generation_queue_stage_assignments assignment
      JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
      WHERE assignment.assignment_key = $1
        AND assignment.task_id = $2::uuid
        AND assignment.redis_job_id = $3
        AND assignment.status = 'released'
        AND assignment.release_reason IN ('completed', 'failed')
      LIMIT 1
    `,
    [input.assignmentKey, input.taskId, input.redisJobId],
  );
  const row = result.rows[0];
  return row ? {
    assignmentKey: row.assignment_key,
    queueName: row.queue_name,
    shardId: row.shard_id,
    shardNo: row.shard_no,
    routeCode: row.route_code,
  } : null;
}

async function readTaskProviderRouteIdentity(db: SqlDatabase, taskId: string) {
  // Tasks are UUID-backed. Keep compatibility for legacy/manual outbox rows
  // whose task identifier cannot be looked up safely.
  if (!isUuid(taskId)) return "";
  const result = await db.query<{ input_snapshot_json: Record<string, unknown> | string }>(
    "SELECT input_snapshot_json FROM tasks WHERE id = $1 LIMIT 1",
    [taskId],
  );
  const value = result.rows[0]?.input_snapshot_json;
  if (!value) return "";
  const snapshot = typeof value === "string" ? parseJsonRecord(value) : value;
  return createGenerationProviderRouteIdentity(snapshot) ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : undefined;
}

function readRequiredString(value: unknown) {
  const text = readString(value);
  if (!text) throw new Error("generation_outbox_missing_taskId");
  return text;
}

function readMediaType(value: unknown): "image" | "video" | "audio" {
  const text = readString(value);
  if (text === "image" || text === "video" || text === "audio") return text;
  throw new Error("generation_outbox_invalid_mediaType");
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  map: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) return [];
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index]!);
    }
  }));
  return results;
}

function retryDelayMs(event: OutboxEventRecord, configuredBaseDelayMs?: number) {
  const baseDelayMs = Math.max(1_000, configuredBaseDelayMs ?? defaultRetryDelayMs);
  const attemptCount = Math.max(0, Math.floor(event.attemptCount ?? 0));
  return Math.min(maximumRetryDelayMs, baseDelayMs * (2 ** Math.min(attemptCount, 10)));
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
