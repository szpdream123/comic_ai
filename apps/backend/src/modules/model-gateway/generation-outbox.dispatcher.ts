import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  claimOutboxEventsForDispatch,
  markOutboxEventFailed,
  markOutboxEventProcessed,
  type OutboxEventRecord,
} from "../shared/outbox/outbox-dispatch-repair.service.ts";
import {
  publishGenerationTaskCreatedToBullMQ,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import { failGenerationTaskAfterQueueError } from "./generation-redis-repair.service.ts";

const generationTaskCreatedEventType = "generation.task.created";
const generationTaskFinalizeRequestedEventType = "generation.task.finalize_requested";
const generationTaskPollRequestedEventType = "generation.task.poll_requested";
const defaultRetryDelayMs = 30_000;

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
  failTaskAfterQueueError?: typeof failGenerationTaskAfterQueueError;
  markTerminalFailure?: typeof markGenerationOutboxEventTerminalFailure;
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
  const failTaskAfterQueueError = deps.failTaskAfterQueueError ?? failGenerationTaskAfterQueueError;
  const markTerminalFailure = deps.markTerminalFailure ?? markGenerationOutboxEventTerminalFailure;
  const outcomes = await Promise.all(input.events.map(async (event) => {
    try {
      await publish(event, {
        config: input.config,
        publisher: input.publisher,
      });
    } catch (error) {
      const errorMessage = errorMessageFromUnknown(error);
      try {
        const taskId = readUuid(event.payload.taskId);
        if (taskId) {
          const requiresManualReview = event.eventType !== generationTaskCreatedEventType;
          await failTaskAfterQueueError(db, {
            taskId,
            failureCode: "generation_queue_publish_failed",
            displayMessage: requiresManualReview
              ? "生成队列发布失败，系统已停止自动重试，请联系后台管理员处理。"
              : "生成队列发布失败，任务已停止自动重试并按失败处理，积分已返还。",
            creditOutcome: requiresManualReview ? "manual_review_required" : "released",
            now: input.now,
          });
        }
        await markTerminalFailure(db, {
          outboxEventId: event.id,
          errorMessage,
          now: input.now,
        });
      } catch (settlementError) {
        await markFailed(db, {
          outboxEventId: event.id,
          errorMessage: errorMessageFromUnknown(settlementError),
          retryAt: new Date(input.now.getTime() + (input.retryDelayMs ?? defaultRetryDelayMs)),
          now: input.now,
        });
      }
      return { status: "failed" as const, eventId: event.id };
    }
    await markProcessed(db, {
      outboxEventId: event.id,
      now: input.now,
    });
    return { status: "processed" as const, eventId: event.id };
  }));

  return {
    processedEventIds: outcomes
      .filter((outcome) => outcome.status === "processed")
      .map((outcome) => outcome.eventId),
    failedEventIds: outcomes
      .filter((outcome) => outcome.status === "failed")
      .map((outcome) => outcome.eventId),
  };
}

async function markGenerationOutboxEventTerminalFailure(
  db: SqlDatabase,
  input: { outboxEventId: string; errorMessage: string; now: Date },
) {
  await db.query(
    `
      UPDATE outbox_events
      SET status = 'processed',
          processed_at = $2,
          error_message = $3,
          updated_at = $2
      WHERE id = $1
    `,
    [input.outboxEventId, input.now, input.errorMessage],
  );
}

function readUuid(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
