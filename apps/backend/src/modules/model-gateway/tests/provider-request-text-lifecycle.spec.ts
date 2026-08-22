import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createOrReuseProviderRequest,
  markExternalSubmissionStarted,
  markProviderRequestCanceled,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  recordProviderRequestRedactedBody,
  submitProviderRequest,
} from "../provider-request.service.ts";
import { recordProviderAdapterRequest } from "../provider-adapter.contract.ts";
import { attachProviderRawResponse, compactProviderAuditValue, providerResponseDiagnostics } from "../provider-response-diagnostics.ts";
import { completeUserModelRequestLog, createUserModelRequestLog } from "../user-model-request-log.service.ts";

describe("provider request text lifecycle", () => {
  it("marks a streaming provider request as succeeded with redacted usage", async () => {
    const db = await createMigratedTestDb();

    try {
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

  it("records a failure for a prepared request that never reached the provider", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createOrReuseProviderRequest(db, providerInput("pre-submit-failed"));
      const failed = await markProviderRequestFailed(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_api_key_missing",
        redactedResponse: {
          failureCode: "provider_api_key_missing",
          phase: "submit",
          errorMessage: "provider credential is not configured",
        },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(failed.status, "failed");
      assert.equal(failed.externalSubmissionStartedAt, null);
      assert.equal(failed.failureCode, "provider_api_key_missing");
      assert.equal(failed.redactedResponse?.["phase"], "submit");
    } finally {
      await db.close();
    }
  });

  it("does not overwrite a provider request with a different terminal status", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createStartedRequest(db, "terminal-conflict");
      await markProviderRequestCanceled(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_poll_timeout",
        redactedResponse: { cancelStatus: "canceled" },
        now: new Date("2026-06-01T10:02:00.000Z"),
      });
      const replayedCancellation = await markProviderRequestCanceled(db, {
        providerRequestId: prepared.request.id,
        failureCode: "provider_poll_timeout",
        redactedResponse: { cancelStatus: "canceled" },
        now: new Date("2026-06-01T10:02:30.000Z"),
      });
      assert.equal(replayedCancellation.status, "canceled");

      await assert.rejects(
        () => markProviderRequestSucceeded(db, {
          providerRequestId: prepared.request.id,
          externalRequestId: "late-result-1",
          redactedResponse: { status: "succeeded" },
          now: new Date("2026-06-01T10:03:00.000Z"),
        }),
        /provider_request_terminal_state_conflict/,
      );

      const stored = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        [prepared.request.id],
      );
      assert.equal(stored.rows[0]?.status, "canceled");
      assert.equal(stored.rows[0]?.failure_code, "provider_poll_timeout");
    } finally {
      await db.close();
    }
  });

  it("stores provider response diagnostics when submission returns an error", async () => {
    const db = await createMigratedTestDb();

    try {

      await assert.rejects(
        () => submitProviderRequest(db, {
          ...providerInput("diagnostics"),
          providerName: "openai",
          providerOperation: "episode.image.generate",
          adapter: {
            async submit(input) {
              await recordProviderAdapterRequest(input, {
                model: "gpt-image-1",
                prompt: "[redacted]",
              });
              const rawResponse = '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}';
              throw Object.assign(new Error("image_provider_503"), {
                failureCode: "image_provider_503",
                providerDiagnostics: providerResponseDiagnostics(new Response(rawResponse, {
                  status: 503,
                  statusText: "Service Unavailable",
                  headers: {
                    "content-type": "application/json",
                    "x-request-id": "req_gateway_503",
                  },
                }), rawResponse),
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
        task_center_diagnostics_json: Record<string, unknown> | null;
      }>(
        `
          SELECT status, failure_code, response_redacted_json, task_center_diagnostics_json
          FROM provider_requests
          WHERE request_key = $1
          LIMIT 1
        `,
        ["text-diagnostics"],
      );

      assert.equal(stored.rows[0]?.status, "failed");
      assert.equal(stored.rows[0]?.failure_code, "image_provider_503");
      assert.equal(
        stored.rows[0]?.response_redacted_json?.providerRawResponse,
        '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}',
      );
      assert.deepEqual(stored.rows[0]?.response_redacted_json, {
        displayMessage: "模型服务繁忙或暂时不可用，请稍后重试。",
        errorCode: "model_service_unavailable",
        failureCode: "image_provider_503",
        providerErrorCode: "temporarily_unavailable",
        providerMessage: "模型服务繁忙或暂时不可用，请稍后重试。",
        providerRawResponse: '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}',
        redactedRequest: {
          model: "gpt-image-1",
          prompt: "[redacted]",
        },
        diagnostics: {
          httpStatus: 503,
          statusText: "Service Unavailable",
          contentType: "application/json",
          requestId: "req_gateway_503",
          responseBodyLength: 122,
          responseBodyPreview: '{"error":{"message":"[provider] upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}',
        },
      });
      assert.deepEqual(stored.rows[0]?.task_center_diagnostics_json, {
        diagnostics: {
          httpStatus: 503,
          statusText: "Service Unavailable",
          contentType: "application/json",
          requestId: "req_gateway_503",
          responseBodyPreview: '{"error":{"message":"[provider] upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}',
        },
        providerMessage: "模型服务繁忙或暂时不可用，请稍后重试。",
        displayMessage: "模型服务繁忙或暂时不可用，请稍后重试。",
        providerErrorCode: "temporarily_unavailable",
        errorCode: "model_service_unavailable",
        failureCode: "image_provider_503",
        providerRawResponse: '{"error":{"message":"OpenAI upstream overloaded","code":"temporarily_unavailable","details":"complete provider response"}}',
      });
    } finally {
      await db.close();
    }
  });

  it("compacts binary and oversized provider raw responses before persistence", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createStartedRequest(db, "large-raw-response");
      const completed = await markProviderRequestSucceeded(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "image-large-1",
        redactedResponse: attachProviderRawResponse({
          model: "gpt-image-2",
          imageCount: 1,
        }, {
          data: [{
            b64_json: "A".repeat(100_000),
            image_url: `data:image/png;base64,${"B".repeat(100_000)}`,
            revised_prompt: "保留可审计的文本字段",
          }],
          oversized_note: "C".repeat(100_000),
        }),
        now: new Date("2026-06-01T10:02:00.000Z"),
      });
      const storedRaw = completed.redactedResponse?.providerRawResponse as {
        data?: Array<Record<string, unknown>>;
        oversized_note?: string;
      };
      assert.equal(storedRaw.data?.[0]?.b64_json, "[binary omitted: base64, 100000 chars]");
      assert.equal(storedRaw.data?.[0]?.image_url, "[binary omitted: data URL, 100022 chars]");
      assert.equal(storedRaw.data?.[0]?.revised_prompt, "保留可审计的文本字段");
      assert.match(storedRaw.oversized_note ?? "", /\[truncated: 100000 chars total\]$/);
      assert.ok(JSON.stringify(storedRaw).length < 40_000);
    } finally {
      await db.close();
    }
  });

  it("preserves user model request content while compacting provider responses", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createStartedRequest(db, "large-user-log");
      const dataUrl = `data:image/png;base64,${"A".repeat(100_000)}`;
      await createUserModelRequestLog(db, {
        providerRequestId: prepared.request.id,
        userId: prepared.request.userId,
        providerName: prepared.request.providerName,
        providerOperation: prepared.request.providerOperation,
        modelId: "gpt-image-2",
        providerModel: "gpt-image-2",
        requestKey: prepared.request.requestKey,
        requestHash: prepared.request.requestHash,
        payloadHash: prepared.request.payloadHash,
        requestBody: { prompt: "保留请求", reference: dataUrl },
        requestText: JSON.stringify({ prompt: "保留请求", reference: dataUrl }),
        now: new Date("2026-06-01T10:01:30.000Z"),
      });
      const completed = await completeUserModelRequestLog(db, {
        providerRequestId: prepared.request.id,
        status: "succeeded",
        responseText: JSON.stringify({ data: [{ b64_json: "B".repeat(100_000), revised_prompt: "保留响应" }] }),
        now: new Date("2026-06-01T10:02:00.000Z"),
      });

      assert.equal(completed?.requestBody.reference, dataUrl);
      assert.match(completed?.requestText ?? "", /data:image\/png;base64,A{100}/);
      assert.match(completed?.responseText ?? "", /\[binary omitted: base64, 100000 chars\]/);
      assert.ok((completed?.requestText?.length ?? 0) > 100_000);
      assert.ok((completed?.responseText?.length ?? Infinity) < 5_000);
    } finally {
      await db.close();
    }
  });

  it("bounds aggregate provider audit records and redacted request bodies", async () => {
    const compacted = compactProviderAuditValue({
      entries: Array.from({ length: 100_000 }, (_, index) => `entry-${index}`),
    });
    assert.ok(JSON.stringify(compacted).length < 70_000);
    assert.match(JSON.stringify(compacted), /omittedEntries/);
    const oversizedKey = compactProviderAuditValue({ ["K".repeat(1_000_000)]: "value" });
    assert.ok(Buffer.byteLength(JSON.stringify(oversizedKey), "utf8") <= 65_536);
    assert.match(JSON.stringify(oversizedKey), /oversized_audit_value/);
    const multibyte = compactProviderAuditValue({
      first: "中".repeat(16_000),
      second: "中".repeat(16_000),
      third: "中".repeat(16_000),
      fourth: "中".repeat(16_000),
    });
    assert.ok(Buffer.byteLength(JSON.stringify(multibyte), "utf8") <= 65_536);

    const db = await createMigratedTestDb();
    try {
      const prepared = await createStartedRequest(db, "large-redacted-request");
      const updated = await recordProviderRequestRedactedBody(db, {
        providerRequestId: prepared.request.id,
        request: {
          prompt: "保留请求",
          image: `data:image/png;base64,${"A".repeat(100_000)}`,
        },
        now: new Date("2026-06-01T10:01:30.000Z"),
      });
      const redactedRequest = updated.redactedResponse?.redactedRequest as Record<string, unknown>;
      assert.equal(redactedRequest.prompt, "保留请求");
      assert.equal(redactedRequest.image, `data:image/png;base64,${"A".repeat(100_000)}`);
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
