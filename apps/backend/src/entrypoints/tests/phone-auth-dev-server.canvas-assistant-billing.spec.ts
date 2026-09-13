import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import type { TextGatewayChatCompletionChunk } from "../../modules/model-gateway/openai-compatible-text.adapter.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("canvas assistant completion billing", { concurrency: false }, () => {
  const phone = "13800138911";
  const modelCode = "canvas-assistant-billing-model";
  const userId = randomUUID();
  let db: Awaited<ReturnType<typeof createMigratedTestDb>>;
  let server: ReturnType<typeof createPhoneAuthDevServer>;
  let cookie = "";
  let canvasProjectId = "";
  let nextCompletion: "success" | "stream_error" = "success";

  before(async () => {
    db = await createMigratedTestDb();
    await db.query(
      `INSERT INTO users (id, phone_e164, password_hash, status)
       VALUES ($1, $2, $3, 'active')`,
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await grantCredits(db, {
      userId,
      amount: 100,
      sourceType: "test_credit_seed",
      sourceId: randomUUID(),
      reason: "canvas assistant billing test",
      createdByUserId: userId,
      now: new Date(),
    });
    await db.query(`
      INSERT INTO admin_secret_values (
        id,secret_ref,secret_key,secret_value,purpose,provider_name,request_domain,status,created_at,updated_at
      ) VALUES ($1,'ASSISTANT_TEST_API_KEY','ASSISTANT_TEST_API_KEY','test-assistant-key','canvas_assistant','test','https://assistant.example.test','configured',now(),now())
    `, [randomUUID()]);
    await db.query(
      `INSERT INTO ai_model_configs (
         id, model_code, display_name, provider_name, provider_model,
         provider_protocol, invocation_mode, media_type, task_modes_json,
         capabilities_json, parameter_schema_json, default_params_json,
         provider_config_json, pricing_json, limits_json, ui_config_json,
         status, sort_order, remark, created_at, updated_at
       ) VALUES (
         $1, $2, 'Canvas Assistant Billing', 'test', 'test-chat',
         'openai_compatible_chat', 'stream', 'text', '["text.chat"]'::jsonb,
         '{"stream":true,"contextWindow":8192}'::jsonb, '{}'::jsonb, '{}'::jsonb,
         '{"baseURL":"https://assistant.example.test","apiKeyEnv":"ASSISTANT_TEST_API_KEY"}'::jsonb,
         '{"canvasAgentBillingMode":"token","canvasAgentTokenCreditsPerMillion":4000}'::jsonb,
         '{}'::jsonb, '{}'::jsonb,
         'active', -1000, '', NOW(), NOW()
       )`,
      [randomUUID(), modelCode],
    );
    server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false", NEW_CANVAS_ENABLED: "true" },
      repairScheduler: { enabled: false },
      textChatGateway: {
        async completeJson() {
          return "unused";
        },
        async streamCompletions(input) {
          if (nextCompletion === "stream_error") {
            return {
              providerRequestId: randomUUID(),
              abort() {},
              stream: emitChunks([]),
              completed: Promise.resolve({
                status: "failed" as const,
                failureCode: "provider_stream_error",
                usage: null,
                usageSource: "provider_missing" as const,
              }),
            };
          }
          return {
            providerRequestId: null as unknown as string,
            abort() {},
            stream: emitChunks([
              {
                id: "assistant-chunk",
                object: "chat.completion.chunk",
                created: 1,
                model: input.model,
                choices: [{ index: 0, delta: { content: "已根据原著整理" }, finish_reason: null }],
              },
              {
                id: "assistant-chunk",
                object: "chat.completion.chunk",
                created: 1,
                model: input.model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
              },
            ]),
            completed: Promise.resolve({
              status: "succeeded" as const,
              usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
              usageSource: "provider" as const,
            }),
          };
        },
      },
    });
    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
    });
    assert.equal(loginResponse.status, 200);
    cookie = loginResponse.headers.get("set-cookie") ?? "";
    const created = await fetch(`${server.origin}/api/creator/canvas-projects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Assistant billing canvas" }),
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    canvasProjectId = createdBody.data.project.id;
  });

  after(async () => {
    await server.close();
    await db.close();
  });

  it("settles canvas assistant tokens with the admin token unit price", async () => {
    nextCompletion = "success";
    const response = await postAssistant("assistant-billing-success");
    const payload = await readSsePayload(response);

    assert.equal(response.status, 200, payload);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.equal(payload.includes("已根据原著整理"), true);
    assert.equal(payload.includes("data: [DONE]"), true);

    const user = await db.query<{ credit_balance_cached: number | string }>(
      "SELECT credit_balance_cached FROM users WHERE id=$1",
      [userId],
    );
    const reservation = await db.query<{ reason: string; amount_consumed: number | string; amount_released: number | string }>(
      `SELECT reason, amount_consumed, amount_released
       FROM credit_reservations
       WHERE user_id = $1 AND source_type = 'canvas_agent_text_round'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    assert.equal(reservation.rows[0]?.reason, "会话消息积分消耗");
    assert.equal(Number(reservation.rows[0]?.amount_consumed), 6);
    assert.equal(Number(reservation.rows[0]?.amount_released), 27);
    assert.equal(Number(user.rows[0]?.credit_balance_cached), 94);
  });

  it("releases the reserved credits when the assistant stream fails", async () => {
    nextCompletion = "stream_error";
    const balanceBefore = await readBalance();
    const response = await postAssistant("assistant-billing-stream-error");
    const payload = await readSsePayload(response);

    assert.equal(response.status, 200);
    assert.match(payload, /provider_stream_error/);
    assert.equal(payload.includes("data: [DONE]"), true);
    assert.equal(await readBalance(), balanceBefore);
  });

  async function postAssistant(idempotencyKey: string) {
    return fetch(`${server.origin}/api/canvas/${canvasProjectId}/assistant/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        cookie,
      },
      body: JSON.stringify({
        model: modelCode,
        stream: true,
        messages: [{ role: "user", content: "请继续整理原著" }],
      }),
    });
  }

  async function readBalance() {
    const user = await db.query<{ credit_balance_cached: number | string }>(
      "SELECT credit_balance_cached FROM users WHERE id=$1",
      [userId],
    );
    return Number(user.rows[0]?.credit_balance_cached);
  }
});

async function readSsePayload(response: Response) {
  return response.text();
}

async function* emitChunks(chunks: TextGatewayChatCompletionChunk[]) {
  for (const chunk of chunks) yield chunk;
}
