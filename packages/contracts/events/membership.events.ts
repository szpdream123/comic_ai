import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const membershipPeriodStartedEvent: EventContract = {
  eventType: eventTypes.membershipPeriodStarted,
  schemaVersion: 1,
  producer: "membership",
  envelopeFields: [...baseEnvelopeFields],
  sourceIds: ["membership_period_id", "order_id", "plan_id", "gift_credits", "period_end_at"],
  deduplicationKeys: ["membership_period_id", "order_id"],
  payloadShape: {
    membership_period_id: "uuid",
    order_id: "uuid",
    plan_id: "uuid",
    gift_credits: "integer",
    period_end_at: "iso8601",
  },
  consumers: ["credit-billing", "audit", "admin-ops"],
};

export const membershipEventContracts = [membershipPeriodStartedEvent];
