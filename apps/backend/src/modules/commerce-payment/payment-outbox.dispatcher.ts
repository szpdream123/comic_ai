import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import { consumePaymentSucceededCreditGrant } from "../credit-billing/payment-succeeded-credit-consumer.service.ts";
import { consumePaymentSucceededMembershipActivation } from "../membership/payment-succeeded-membership-consumer.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  claimOutboxEventsForDispatch,
  markOutboxEventFailed,
  markOutboxEventProcessed,
} from "../shared/outbox/outbox-dispatch-repair.service.ts";

const defaultRetryDelayMs = 30_000;

export async function dispatchPaymentOutboxBatch(
  db: SqlDatabase,
  input: { now: Date; limit: number; retryDelayMs?: number },
) {
  const events = await claimOutboxEventsForDispatch(db, {
    now: input.now,
    limit: input.limit,
    eventTypes: [eventTypes.paymentSucceeded],
  });
  const processedEventIds: string[] = [];
  const failedEventIds: string[] = [];

  for (const event of events) {
    try {
      await consumePaymentSucceededMembershipActivation(db, {
        event,
        now: input.now,
      });
      await consumePaymentSucceededCreditGrant(db, {
        event,
        now: input.now,
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
