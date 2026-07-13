import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  submitProviderRequest,
} from "../provider-request.service.ts";
import type { ProviderAdapter } from "../provider-adapter.contract.ts";

describe("provider request crash before external start", () => {
  it("reuses the pre-call record and safely submits only once", async () => {
    const db = await createMigratedTestDb();
    const adapter = new RecordingProviderAdapter();

    try {
      const preCall = await createOrReuseProviderRequest(db, providerInput());

      const submitted = await submitProviderRequest(db, {
        ...providerInput(),
        adapter,
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      assert.equal(preCall.kind, "created");
      assert.equal(submitted.kind, "submitted");
      assert.equal(submitted.request.id, preCall.request.id);
      assert.equal(submitted.request.status, "accepted");
      assert.equal(submitted.request.externalRequestId, "external-1");
      assert.equal(adapter.calls.length, 1);
    } finally {
      await db.close();
    }
  });
});

class RecordingProviderAdapter implements ProviderAdapter {
  readonly calls: Array<{ providerRequestId: string; payloadRef: string }> = [];

  async submit(input: { providerRequestId: string; payloadRef: string }) {
    this.calls.push(input);
    return {
      externalRequestId: `external-${this.calls.length}`,
      status: "accepted" as const,
      redactedResponse: { accepted: true },
    };
  }
}

function providerInput() {
  return {
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-1:attempt-1",
    requestHash: "hash-1",
    payloadRef: "payloads/task-1.json",
    payloadHash: "payload-hash-1",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}
