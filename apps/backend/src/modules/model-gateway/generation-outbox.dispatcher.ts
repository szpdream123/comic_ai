import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  claimOutboxEventsForDispatch,
  markOutboxEventFailed,
  markOutboxEventProcessed,
} from "../shared/outbox/outbox-dispatch-repair.service.ts";
import {
  publishGenerationTaskCreatedToBullMQ,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";

const generationTaskCreatedEventType = "generation.task.created";
const generationTaskFinalizeRequestedEventType = "generation.task.finalize_requested";
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

export async function dispatchGenerationOutboxBatch(
  db: SqlDatabase,
  input: DispatchGenerationOutboxBatchInput,
): Promise<DispatchGenerationOutboxBatchResult> {
  const events = await claimOutboxEventsForDispatch(db, {
    now: input.now,
    limit: input.limit,
    eventTypes: [generationTaskCreatedEventType, generationTaskFinalizeRequestedEventType],
  });
  const processedEventIds: string[] = [];
  const failedEventIds: string[] = [];

  for (const event of events) {
    try {
      await publishGenerationTaskCreatedToBullMQ(event, {
        config: input.config,
        publisher: input.publisher,
      });
      await markOutboxEventProcessed(db, {
        outboxEventId: event.id,
        now: input.now,
      });
      processedEventIds.push(event.id);
    } catch (error) {
      await markOutboxEventFailed(db, {
        outboxEventId: event.id,
        errorMessage: errorMessageFromUnknown(error),
        retryAt: new Date(input.now.getTime() + (input.retryDelayMs ?? defaultRetryDelayMs)),
        now: input.now,
      });
      failedEventIds.push(event.id);
    }
  }

  return { processedEventIds, failedEventIds };
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
