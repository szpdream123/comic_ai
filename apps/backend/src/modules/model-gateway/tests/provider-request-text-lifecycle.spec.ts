import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "../provider-request.service.ts";

describe("provider request text lifecycle", () => {
  it("marks a streaming provider request as succeeded with redacted usage", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "success");

      const completed = await markProviderRequestSucceeded(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "chatcmpl-1",
        redactedResponse: {
          model: "deepseek-chat",
          providerName: "deepseek",
          provider: "deepseek",
          providerLabel: "DeepSeek",
          chunkCount: 2,
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14,
            provider: "deepseek",
          },
        },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(completed.status, "succeeded");
      assert.equal(completed.externalRequestId, "chatcmpl-1");
      assert.equal(completed.redactedResponse?.["chunkCount"], 2);
      assert.equal(completed.redactedResponse?.["providerName"], undefined);
      assert.equal(completed.redactedResponse?.["provider"], undefined);
      assert.deepEqual(completed.redactedResponse?.["usage"], {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
      });
    } finally {
      await db.close();
    }
  });

  it("marks a streaming provider request as failed with a failure code", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "failed");

      const failed = await markProviderRequestFailed(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_stream_error",
        redactedResponse: { model: "deepseek-chat", chunkCount: 1 },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(failed.status, "failed");
      assert.equal(failed.failureCode, "provider_stream_error");
    } finally {
      await db.close();
    }
  });

  it("marks an aborted streaming provider request as canceled", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);
      const prepared = await createStartedRequest(db, "canceled");

      const canceled = await markProviderRequestCanceled(db, {
        providerRequestId: prepared.request.id,
        failureCode: "client_aborted_stream",
        redactedResponse: { model: "qwen-plus", chunkCount: 0 },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(canceled.status, "canceled");
      assert.equal(canceled.failureCode, "client_aborted_stream");
    } finally {
      await db.close();
    }
  });

  it("stores provider response diagnostics when submission returns an error", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedScope(db);

      await assert.rejects(
        () => submitProviderRequest(db, {
          ...providerInput("diagnostics"),
          providerName: "openai",
          providerOperation: "episode.image.generate",
          adapter: {
            async submit() {
              throw Object.assign(new Error("image_provider_503"), {
                failureCode: "image_provider_503",
                providerDiagnostics: {
                  httpStatus: 503,
                  statusText: "Service Unavailable",
                  contentType: "application/json",
                  requestId: "req_gateway_503",
                  responseBodyLength: 72,
                  responseBodyPreview: '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable"}}',
                },
              });
            },
          },
        }),
        /image_provider_503/,
      );

      const stored = await db.query<{
        status: string;
        failure_code: string | null;
        response_redacted_json: Record<string, unknown> | null;
      }>(
        `
          SELECT status, failure_code, response_redacted_json
          FROM provider_requests
          WHERE request_key = $1
          LIMIT 1
        `,
        ["text-diagnostics"],
      );

      assert.equal(stored.rows[0]?.status, "failed");
      assert.equal(stored.rows[0]?.failure_code, "image_provider_503");
      assert.deepEqual(stored.rows[0]?.response_redacted_json, {
        diagnostics: {
          httpStatus: 503,
          statusText: "模型服务繁忙或暂时不可用，请稍后重试。",
          contentType: "application/json",
          requestId: "req_gateway_503",
          responseBodyLength: 72,
          responseBodyPreview: '{"error":{"message":"[provider] upstream overloaded","code":"temporarily_unavailable"}}',
        },
      });
    } finally {
      await db.close();
    }
  });
});

async function createStartedRequest(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  suffix: string,
) {
  const prepared = await createOrReuseProviderRequest(db, providerInput(suffix));
  await markExternalSubmissionStarted(db, {
    providerRequestId: prepared.request.id,
    externalRequestId: null,
    now: new Date("2026-06-01T10:01:00.000Z"),
  });
  return prepared;
}

function providerInput(suffix: string) {
  return {
    workspaceId: "20000000-0000-4000-8000-000000000001",
    projectId: null,
    providerName: "deepseek",
    providerOperation: "llm.chat.completions",
    requestKey: `text-${suffix}`,
    requestHash: `request-hash-${suffix}`,
    payloadRef: `text-gateway://${suffix}`,
    payloadHash: `payload-hash-${suffix}`,
    redactedPayload: { model: "deepseek-chat", messageCount: 1 },
    createdByUserId: null,
    now: new Date("2026-06-01T10:00:00.000Z"),
  };
}

async function seedScope(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Org', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Workspace',
        'active'
      )
    `,
  );
}
