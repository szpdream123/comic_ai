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
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

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
    taskEnvironment: input.config.workerEnvironment,
    fairnessScope: "generation",
    membershipQuantum: input.config.outbox.membershipQuantum,
  });
  return dispatchClaimedGenerationOutboxEvents(db, {
    events,
    now: input.now,
    retryDelayMs: input.retryDelayMs,
    config: input.config,
    publisher: input.publisher,
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
    32,
    async (event) => {
    try {
      const taskId = readString(event.payload.taskId);
      console.log(`[generation-outbox] Processing event ${event.id} for task ${taskId}`);

      await publish(event, {
        config: input.config,
        publisher: input.publisher,
      });
    } catch (error) {
      const errorMessage = errorMessageFromUnknown(error);
      console.log(`[generation-outbox] Event ${event.id} failed: ${errorMessage}`);
      await markFailed(db, {
        outboxEventId: event.id,
        errorMessage,
        retryAt: new Date(input.now.getTime() + retryDelayMs(event, input.retryDelayMs)),
        now: input.now,
      });
      return { status: "failed" as const, eventId: event.id };
    }
    console.log(`[generation-outbox] Event ${event.id} processed successfully`);
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
