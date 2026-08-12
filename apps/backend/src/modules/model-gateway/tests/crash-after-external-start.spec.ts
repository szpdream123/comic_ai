import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestResultUnknown,
} from "../provider-request.service.ts";

describe("provider request crash after external start", () => {
  it("marks ambiguous externally-started requests as result_unknown for repair/manual review", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createOrReuseProviderRequest(db, providerInput());
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: null,
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      const unknown = await markProviderRequestResultUnknown(db, {
        providerRequestId: prepared.request.id,
        failureCode: "worker_crashed_after_external_start",
        now: new Date("2026-05-09T10:05:00.000Z"),
      });

      assert.equal(unknown.status, "result_unknown");
      assert.equal(unknown.failureCode, "worker_crashed_after_external_start");
      assert.equal(
        unknown.externalSubmissionStartedAt?.toISOString(),
        "2026-05-09T10:01:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("does not downgrade a terminal provider result to result_unknown", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createOrReuseProviderRequest(db, {
        ...providerInput(),
        requestKey: "task-3:terminal",
      });
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'succeeded',
              external_submission_started_at = $2,
              external_request_id = 'external-terminal'
          WHERE id = $1
        `,
        [prepared.request.id, new Date("2026-05-09T10:01:00.000Z")],
      );

      const terminal = await markProviderRequestResultUnknown(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_poll_timeout",
        now: new Date("2026-05-09T10:05:00.000Z"),
      });

      assert.equal(terminal.status, "succeeded");
      assert.equal(terminal.failureCode, null);
    } finally {
      await db.close();
    }
  });
});

function providerInput() {
  return {
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-3:attempt-1",
    requestHash: "hash-3",
    payloadRef: "payloads/task-3.json",
    payloadHash: "payload-hash-3",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}
