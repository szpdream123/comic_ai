import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { allEventContracts } from "./index.ts";

const requiredEnvelopeFields = [
  "event_id",
  "event_type",
  "schema_version",
  "producer",
  "occurred_at",
  "organization_id",
];

describe("event contracts", () => {
  it("declares replay-safe envelope fields for every event", () => {
    assert.ok(allEventContracts.length >= 6);

    for (const event of allEventContracts) {
      for (const field of requiredEnvelopeFields) {
        assert.ok(event.envelopeFields.includes(field), `${event.eventType}:${field}`);
      }
      assert.ok(event.sourceIds.length > 0, event.eventType);
      assert.equal(typeof event.schemaVersion, "number", event.eventType);
      assert.equal(typeof event.producer, "string", event.eventType);
    }
  });

  it("keeps payment success replayable into credit grant", () => {
    const paymentSucceeded = allEventContracts.find(
      (event) => event.eventType === "payment.succeeded",
    );

    assert.ok(paymentSucceeded);
    assert.ok(paymentSucceeded.sourceIds.includes("order_id"));
    assert.ok(paymentSucceeded.sourceIds.includes("payment_intent_id"));
    assert.ok(paymentSucceeded.deduplicationKeys.includes("payment_intent_id"));
  });
});
