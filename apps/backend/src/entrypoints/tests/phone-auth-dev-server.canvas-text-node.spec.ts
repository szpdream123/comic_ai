import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import type { TextChatGatewayLike } from "../../modules/ai-storyboard/ai-storyboard-preview.service.ts";
import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import { createPromptMarketplaceService } from "../../modules/prompt-marketplace/prompt-marketplace.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("runs authenticated ai-text and ai-markdown canvas nodes through the text gateway", async () => {
  const db = await createMigratedTestDb();
  const gateway = new TextGateway();
  const server = createPhoneAuthDevServer({
    db,
    textChatGateway: gateway,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const phone = "13900000063";
  const userId = randomUUID();
  const skillOwnerId = randomUUID();
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await db.query(
      "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13900000065', 'active')",
      [skillOwnerId],
    );
    const paidSkill = await createPromptMarketplaceService({ db }).createItem({
      userId: skillOwnerId,
      title: "付费悬疑改写",
      category: "script",
      content: "优先加强悬疑节奏。",
      priceCredits: 8,
      publish: true,
      now: new Date(),
    });
    await createPromptMarketplaceService({ db }).purchaseItem({
      userId,
      itemId: paidSkill.item.id,
      now: new Date(),
    });
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const create = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-canvas" },
      body: { title: "AI text node HTTP" },
    });
    assert.equal(create.status, 201);
    const canvasProjectId = String(create.body.data.project.id);
    const save = await api(server.origin, `/api/creator/canvas-projects/${canvasProjectId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [
            {
              id: "source-1",
              type: "source-text",
              position: { x: 0, y: 0 },
              size: { width: 320, height: 180 },
              data: {
                text: "旧剧院的雨夜开场。",
                ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
              },
            },
            {
              id: "ai-text-1",
              type: "ai-text",
              position: { x: 400, y: 0 },
              size: { width: 360, height: 220 },
              data: {
                mediaKind: "text",
                ports: {
                  inputs: [{ id: "in_text", kind: "text" }],
                  outputs: [{ id: "out_text", kind: "text" }],
                },
              },
            },
            {
              id: "ai-markdown-1",
              type: "ai-markdown",
              position: { x: 400, y: 300 },
              size: { width: 360, height: 220 },
              data: {
                mediaKind: "text",
                ports: {
                  inputs: [{ id: "in_text", kind: "text" }],
                  outputs: [{ id: "out_text", kind: "text" }],
                },
              },
            },
          ],
          edges: [
            {
              id: "edge-text",
              sourceNodeId: "source-1",
              sourcePortId: "out_text",
              targetNodeId: "ai-text-1",
              targetPortId: "in_text",
              data: { kind: "text" },
            },
            {
              id: "edge-markdown",
              sourceNodeId: "source-1",
              sourcePortId: "out_text",
              targetNodeId: "ai-markdown-1",
              targetPortId: "in_text",
              data: { kind: "text" },
            },
          ],
          groups: [],
        },
      },
    });
    assert.equal(save.status, 200);

    const textRun = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-text-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-run" },
      body: {
        kind: "text",
        mediaKind: "text",
        prompt: "改写为悬疑风格",
        skill: { id: paidSkill.item.id, category: "script" },
      },
    });
    assert.equal(textRun.status, 200);
    assert.equal(textRun.body.data.status, "succeeded");
    assert.equal(textRun.body.data.result.text, "AI 文本结果");
    assert.equal(textRun.body.data.result.format, "text");
    assert.equal(textRun.body.data.artifact.artifactKind, "text");
    const textReplay = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-text-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-run" },
      body: {
        kind: "text",
        mediaKind: "text",
        prompt: "改写为悬疑风格",
        skill: { id: paidSkill.item.id, category: "script" },
      },
    });
    assert.equal(textReplay.status, 200);
    assert.equal(textReplay.body.data.runId, textRun.body.data.runId);
    assert.equal(textReplay.body.data.replayed, true);
    assert.equal(gateway.calls.length, 1);

    const markdownRun = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-markdown-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-markdown-http-run" },
      body: { mediaKind: "text", instructions: "整理为提纲" },
    });
    assert.equal(markdownRun.status, 200);
    assert.equal(markdownRun.body.data.result.text, "# AI Markdown 结果");
    assert.equal(markdownRun.body.data.result.format, "markdown");
    assert.equal(gateway.calls.length, 2);
    assert.match(gateway.calls[0]?.prompt ?? "", /^优先加强悬疑节奏。/);
    assert.match(gateway.calls[0]?.prompt ?? "", /优先加强悬疑节奏/);
    assert.equal(gateway.calls[0]?.responseFormat, "text");
    assert.match(gateway.calls[0]?.prompt ?? "", /旧剧院的雨夜开场/);
    assert.match(gateway.calls[1]?.prompt ?? "", /Markdown/);
    const balances = await db.query<{ id: string; credit_balance_cached: number | string }>(
      "SELECT id, credit_balance_cached FROM users WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[userId, skillOwnerId]],
    );
    const balanceByUser = new Map(balances.rows.map((row) => [row.id, Number(row.credit_balance_cached)]));
    assert.equal(balanceByUser.get(userId), 492);
    assert.equal(balanceByUser.get(skillOwnerId), 8);
    const skillUsage = await db.query<{ usage_count: number }>(
      "SELECT usage_count::int AS usage_count FROM prompts WHERE id = $1",
      [paidSkill.item.id],
    );
    assert.equal(skillUsage.rows[0]?.usage_count, 1);

    const failedRun = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-text-1/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": "canvas-text-http-failure" },
      body: {
        kind: "text",
        mediaKind: "text",
        prompt: "触发失败",
        skill: { id: paidSkill.item.id, category: "script" },
      },
    });
    assert.equal(failedRun.status, 502);
    const balancesAfterFailure = await db.query<{ id: string; credit_balance_cached: number | string }>(
      "SELECT id, credit_balance_cached FROM users WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[userId, skillOwnerId]],
    );
    const balanceAfterFailureByUser = new Map(
      balancesAfterFailure.rows.map((row) => [row.id, Number(row.credit_balance_cached)]),
    );
    assert.equal(balanceAfterFailureByUser.get(userId), 492);
    assert.equal(balanceAfterFailureByUser.get(skillOwnerId), 8);

    const streamResponse = await fetch(
      `${server.origin}/api/canvas/${canvasProjectId}/nodes/ai-markdown-1/run?stream=1`,
      {
        method: "POST",
        headers: {
          cookie,
          accept: "text/event-stream",
          "content-type": "application/json",
          "idempotency-key": "canvas-markdown-http-stream",
        },
        body: JSON.stringify({ mediaKind: "text", instructions: "流式整理为提纲" }),
      },
    );
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    const streamEvents = parseSseData(await streamResponse.text());
    assert.deepEqual(streamEvents.filter((event) => event.type === "delta").map((event) => event.delta), [
      "# AI Markdown ",
      "流式结果",
    ]);
    const completed = streamEvents.find((event) => event.type === "complete");
    assert.equal(completed?.run?.status, "succeeded");
    assert.equal(completed?.run?.result?.text, "# AI Markdown 流式结果");
  } finally {
    await server.close().catch(() => undefined);
    await db.close();
  }
});

it("resolves Canvas text models from the active admin model configuration", async () => {
  const db = await createMigratedTestDb();
  const providerBaseUrl = "https://canvas-text-provider.test/v1";
  const modelCode = `canvas-text-${randomUUID()}`;
  const providerModel = "configured-text-model";
  const originalFetch = globalThis.fetch;
  const providerRequests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(providerBaseUrl)) return originalFetch(input, init);
    providerRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response([
      `data: ${JSON.stringify({
        id: "canvas-text-provider-request",
        object: "chat.completion.chunk",
        created: 1,
        model: providerModel,
        choices: [{ index: 0, delta: { content: "# 后台模型结果" }, finish_reason: null }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "canvas-text-provider-request",
        object: "chat.completion.chunk",
        created: 1,
        model: providerModel,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };
  const server = createPhoneAuthDevServer({
    db,
    env: { NODE_ENV: "test", AUTH_SESSION_REDIS_CACHE_ENABLED: "false" },
    repairScheduler: { enabled: false },
  });
  const phone = "13900000064";
  const userId = randomUUID();
  try {
    await db.query(
      "INSERT INTO users (id, phone_e164, password_hash, status) VALUES ($1, $2, $3, 'active')",
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await seedGenerationAccess(db, userId);
    await db.query(
      `
        INSERT INTO ai_model_configs (
          id, model_code, display_name, provider_name, provider_model,
          provider_protocol, invocation_mode, media_type, task_modes_json,
          capabilities_json, parameter_schema_json, default_params_json,
          provider_config_json, pricing_json, limits_json, ui_config_json,
          status, sort_order, created_at, updated_at
        ) VALUES (
          $1, $2, 'Canvas configured text', 'configured-provider', $3,
          'openai_compatible_chat', 'stream', 'text', '["text.script"]'::jsonb,
          '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
          $4::jsonb, '{"baseCredits":1}'::jsonb, '{}'::jsonb, '{}'::jsonb,
          'active', 1, now(), now()
        )
      `,
      [randomUUID(), modelCode, providerModel, JSON.stringify({ baseURL: providerBaseUrl, apiKey: "test-key" })],
    );
    await server.listen(0);
    const cookie = await passwordLogin(server.origin, phone);
    const create = await api(server.origin, "/api/creator/canvas-projects", cookie, {
      method: "POST",
      headers: { "idempotency-key": `canvas-configured-text-${randomUUID()}` },
      body: { title: "Configured text model Canvas" },
    });
    assert.equal(create.status, 201, JSON.stringify(create.body));
    const canvasProjectId = String(create.body.data.project.id);
    const save = await api(server.origin, `/api/creator/canvas-projects/${canvasProjectId}/canvas`, cookie, {
      method: "PUT",
      body: {
        clientRevision: 1,
        document: {
          version: 2,
          canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [{
            id: "ai-markdown-configured",
            type: "ai-markdown",
            position: { x: 0, y: 0 },
            size: { width: 360, height: 220 },
            data: {
              mediaKind: "text",
              prompt: "整理为表格",
              modelCode,
              ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
            },
          }],
          edges: [],
          groups: [],
        },
      },
    });
    assert.equal(save.status, 200, JSON.stringify(save.body));

    const run = await api(server.origin, `/api/canvas/${canvasProjectId}/nodes/ai-markdown-configured/run`, cookie, {
      method: "POST",
      headers: { "idempotency-key": `canvas-configured-text-run-${randomUUID()}` },
      body: { kind: "text", mediaKind: "text", prompt: "整理为表格", model: modelCode },
    });

    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.data.status, "succeeded");
    assert.equal(run.body.data.result.text, "# 后台模型结果");
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0]?.model, providerModel);
    const requestLog = await db.query<{ model_id: string; provider_model: string; status: string }>(
      "SELECT model_id, provider_model, status FROM user_model_request_logs WHERE model_id=$1 ORDER BY created_at DESC LIMIT 1",
      [modelCode],
    );
    assert.deepEqual(requestLog.rows[0], { model_id: modelCode, provider_model: providerModel, status: "succeeded" });
  } finally {
    globalThis.fetch = originalFetch;
    await server.close().catch(() => undefined);
    await db.close();
  }
});

class TextGateway implements TextChatGatewayLike {
  readonly calls: Array<{
    model: string;
    prompt: string;
    responseFormat?: "json_object" | "text";
  }> = [];

  async completeJson(input: {
    model: string;
    prompt: string;
    responseFormat?: "json_object" | "text";
  }) {
    this.calls.push(input);
    if (input.prompt.includes("触发失败")) throw new Error("provider unavailable");
    return input.prompt.includes("Markdown") ? "# AI Markdown 结果" : "AI 文本结果";
  }

  async *streamJson(input: {
    model: string;
    prompt: string;
    responseFormat?: "json_object" | "text";
  }) {
    this.calls.push(input);
    yield "# AI Markdown ";
    yield "流式结果";
  }
}

function parseSseData(value: string) {
  return value.split(/\r?\n\r?\n/)
    .map((chunk) => chunk.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n"))
    .filter(Boolean)
    .map((data) => JSON.parse(data) as Record<string, any>);
}

async function passwordLogin(origin: string, phone: string) {
  const response = await fetch(`${origin}/api/auth/password/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: phone, password: defaultPasswordFromPhone(phone) }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

async function seedGenerationAccess(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string) {
  const now = new Date();
  await db.query(`
    INSERT INTO user_memberships
      (id,user_id,membership_tier,purchase_at,expires_at,gift_credits,status,created_at,updated_at)
    VALUES ($1,$2,'professional',$3,$4,0,'active',$3,$3)
  `, [randomUUID(), userId, now, new Date(now.getTime() + 86_400_000)]);
  await grantCredits(db, {
    userId,
    amount: 500,
    sourceType: "test_credit_seed",
    sourceId: randomUUID(),
    reason: "Canvas text HTTP integration",
    createdByUserId: userId,
    now,
  });
}

async function api(
  origin: string,
  path: string,
  cookie: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await fetch(`${origin}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}
