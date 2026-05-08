import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const creditGrantCreatedEvent: EventContract = {
  eventType: eventTypes.creditGrantCreated,
  schemaVersion: 1,
  producer: "credit-billing",
  envelopeFields: [...baseEnvelopeFields],
  sourceIds: ["ledger_entry_id", "source_type", "source_id", "amount"],
  deduplicationKeys: ["ledger_entry_id", "source_type", "source_id"],
  payloadShape: {
    ledger_entry_id: "uuid",
    source_type: "payment_order|admin_adjustment",
    source_id: "uuid",
    amount: "integer",
  },
  consumers: ["commerce-payment", "admin-ops"],
};

export const creditEventContracts = [creditGrantCreatedEvent];
