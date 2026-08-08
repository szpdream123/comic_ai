import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  ProviderRequestConflictError,
  createOrReuseProviderRequest,
  submitProviderRequest,
} from "../provider-request.service.ts";
import { ModelError } from "../model-error.ts";

describe("provider request deterministic upsert", { concurrency: false }, () => {
  it("reuses the same request key under concurrent duplicate callers", async () => {
    const db = await createMigratedTestDb();

    try {

      const results = await Promise.all([
        createOrReuseProviderRequest(db, providerInput()),
        createOrReuseProviderRequest(db, providerInput()),
      ]);
      const count = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM provider_requests",
      );

      assert.equal(results[0]?.request.id, results[1]?.request.id);
      assert.deepEqual(
        results.map((result) => result.kind).sort(),
        ["created", "reused"],
      );
      assert.equal(count.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("returns a deterministic conflict for the same key with a different payload", async () => {
    const db = await createMigratedTestDb();

    try {
      await createOrReuseProviderRequest(db, providerInput());

      await assert.rejects(
        createOrReuseProviderRequest(db, {
          ...providerInput(),
          payloadHash: "payload-hash-2",
        }),
        ProviderRequestConflictError,
      );
    } finally {
      await db.close();
    }
  });

  it("treats a SanBao invalid response as a definitive submission failure", async () => {
    const db = await createMigratedTestDb();

    try {
      await assert.rejects(
        submitProviderRequest(db, {
          ...providerInput(),
          providerName: "san-bao",
          requestKey: "san-bao-invalid-response",
          adapter: {
            async submit() {
              throw ModelError.fromUnknown("invalid response", {
                failureCode: "san_bao_invalid_response",
                mediaType: "video",
                phase: "submit",
              });
            },
          },
        }),
      );

      const result = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE request_key = $1",
        ["san-bao-invalid-response"],
      );
      assert.equal(result.rows[0]?.status, "failed");
      assert.equal(result.rows[0]?.failure_code, "san_bao_invalid_response");
    } finally {
      await db.close();
    }
  });

  it("treats a SanBao HTTP parameter error as a definitive submission failure", async () => {
    const db = await createMigratedTestDb();

    try {
      await assert.rejects(
        submitProviderRequest(db, {
          ...providerInput(),
          providerName: "san-bao",
          requestKey: "san-bao-bad-request",
          adapter: {
            async submit() {
              throw ModelError.fromUnknown("invalid reference asset", {
                failureCode: "san_bao_bad_request",
                mediaType: "image",
                phase: "submit",
              });
            },
          },
        }),
      );

      const result = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE request_key = $1",
        ["san-bao-bad-request"],
      );
      assert.equal(result.rows[0]?.status, "failed");
      assert.equal(result.rows[0]?.failure_code, "san_bao_bad_request");
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
    requestKey: "task-1:attempt-1",
    requestHash: "hash-1",
    payloadRef: "payloads/task-1.json",
    payloadHash: "payload-hash-1",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}
