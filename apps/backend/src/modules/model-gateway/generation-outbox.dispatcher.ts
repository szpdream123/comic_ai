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
    eventTypes: [generationTaskCreatedEventType, generationTaskFinalizeRequestedEventType],
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
  const outcomes = await Promise.all(input.events.map(async (event) => {
    try {
      await publish(event, {
        config: input.config,
        publisher: input.publisher,
      });
      await markProcessed(db, {
        outboxEventId: event.id,
        now: input.now,
      });
      return { status: "processed" as const, eventId: event.id };
    } catch (error) {
      await markFailed(db, {
        outboxEventId: event.id,
        errorMessage: errorMessageFromUnknown(error),
        retryAt: new Date(input.now.getTime() + (input.retryDelayMs ?? defaultRetryDelayMs)),
        now: input.now,
      });
      return { status: "failed" as const, eventId: event.id };
    }
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

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}
