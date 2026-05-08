import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const paymentSucceededEvent: EventContract = {
  eventType: eventTypes.paymentSucceeded,
  schemaVersion: 1,
  producer: "commerce-payment",
  envelopeFields: [...baseEnvelopeFields],
  sourceIds: [
    "order_id",
    "payment_intent_id",
    "payment_provider_event_id",
    "amount_minor",
    "currency",
  ],
  deduplicationKeys: ["payment_intent_id", "order_id"],
  payloadShape: {
    order_id: "uuid",
    payment_intent_id: "uuid",
    payment_provider_event_id: "uuid",
    amount_minor: "integer",
    currency: "CNY",
  },
  consumers: ["credit-billing", "audit", "admin-ops"],
};

export const paymentRefundSucceededEvent: EventContract = {
  eventType: eventTypes.paymentRefundSucceeded,
  schemaVersion: 1,
  producer: "commerce-payment",
  envelopeFields: [...baseEnvelopeFields],
  sourceIds: ["refund_id", "order_id", "payment_intent_id", "amount_minor", "currency"],
  deduplicationKeys: ["refund_id"],
  payloadShape: {
    refund_id: "uuid",
    order_id: "uuid",
    payment_intent_id: "uuid",
    amount_minor: "integer",
    currency: "CNY",
  },
  consumers: ["credit-billing", "audit", "admin-ops"],
};

export const invoiceIssuedEvent: EventContract = {
  eventType: eventTypes.invoiceIssued,
  schemaVersion: 1,
  producer: "commerce-payment",
  envelopeFields: [...baseEnvelopeFields],
  sourceIds: ["invoice_record_id", "invoice_request_id", "order_id"],
  deduplicationKeys: ["invoice_record_id"],
  payloadShape: {
    invoice_record_id: "uuid",
    invoice_request_id: "uuid",
    order_id: "uuid",
  },
  consumers: ["admin-ops"],
};

export const paymentEventContracts = [
  paymentSucceededEvent,
  paymentRefundSucceededEvent,
  invoiceIssuedEvent,
];
