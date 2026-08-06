import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import type { TextGatewayChatCompletionRequest } from "../../modules/model-gateway/openai-compatible-text.adapter.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("phone auth prompt reverse video input", { concurrency: false }, () => {
  const phone = "13800138901";
  const modelCode = "prompt-reverse-frame-sheet-test";
  const modelDisplayName = "联系表测试模型";
  const gatewayCalls: Array<{ messages?: TextGatewayChatCompletionRequest["messages"] }> = [];
  let db: Awaited<ReturnType<typeof createMigratedTestDb>>;
  let server: ReturnType<typeof createPhoneAuthDevServer>;
  let cookie = "";
  let userId = "";

  before(async () => {
    db = await createMigratedTestDb();
    userId = randomUUID();
    await db.query(
      `INSERT INTO users (id, phone_e164, password_hash, status)
       VALUES ($1, $2, $3, 'active')`,
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(
      `INSERT INTO user_memberships (
         id, user_id, membership_tier, purchase_at, expires_at,
         gift_credits, status, created_at, updated_at
       ) VALUES ($1, $2, 'professional', NOW(), '2099-01-01T00:00:00.000Z', 0, 'active', NOW(), NOW())`,
      [randomUUID(), userId],
    );
    await grantCredits(db, {
      userId,
      amount: 300,
      sourceType: "test_credit_seed",
      sourceId: randomUUID(),
      reason: "prompt reverse test credit",
      createdByUserId: userId,
      now: new Date(),
    });
    await db.query(
      `INSERT INTO ai_model_configs (
         id, model_code, display_name, provider_name, provider_model,
         provider_protocol, invocation_mode, media_type, task_modes_json,
         capabilities_json, parameter_schema_json, default_params_json,
         provider_config_json, pricing_json, limits_json, ui_config_json,
         status, sort_order, remark, created_at, updated_at
       ) VALUES (
         $1, $2, $3, 'test', 'test-vision',
         'openai_compatible_chat', 'stream', 'text', '["text.chat"]'::jsonb,
         '{"imageInput":true,"contextWindow":32000}'::jsonb, '{}'::jsonb, '{}'::jsonb,
         '{}'::jsonb, '{"minimumCredits":1,"tokenCreditsPerMillion":1000}'::jsonb, '{}'::jsonb,
         '{"toolboxTools":["prompt-reverse"]}'::jsonb,
         'active', -1000, '', NOW(), NOW()
       )`,
      [randomUUID(), modelCode, modelDisplayName],
    );
    server = createPhoneAuthDevServer({
      db,
      env: { NODE_ENV: "test", PAYMENT_MERCHANT_ID: "prompt-reverse-test" },
      textChatGateway: {
        async completeJson(input) {
          gatewayCalls.push(input);
          return JSON.stringify({
            description: "完整视频描述",
            positivePrompt: "完整视频提示词，画面内容无字幕，人物无纹身",
            tags: ["video"],
            negativePrompt: "",
          });
        },
        async completeJsonWithUsage(input) {
          gatewayCalls.push(input);
          return {
            content: JSON.stringify({
              description: "完整视频描述",
              positivePrompt: "完整视频提示词，画面内容无字幕，人物无纹身",
              tags: ["video"],
              negativePrompt: "",
            }),
            usage: { prompt_tokens: 9000, completion_tokens: 3000, total_tokens: 12000 },
            providerRequestId: null,
          };
        },
      },
    });
    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: "13800138901", password: defaultPasswordFromPhone(phone) }),
    });
    assert.equal(loginResponse.status, 200);
    cookie = loginResponse.headers.get("set-cookie") ?? "";
  });

  after(async () => {
    await server.close();
  });

  it("returns prompt reverse models by display name only", async () => {
    const response = await fetch(`${server.origin}/api/toolbox/prompt-reverse/models`, {
      headers: { cookie },
    });
    const envelope = await response.json();

    assert.equal(response.status, 200, JSON.stringify(envelope));
    assert.ok(envelope.data.models.some((model: { displayName?: string }) => model.displayName === modelDisplayName));
    for (const model of envelope.data.models) {
      assert.deepEqual(Object.keys(model), ["displayName"]);
    }
    assert.equal(JSON.stringify(envelope.data).includes(modelCode), false);
  });

  it("sends ordered 6 FPS frame sheets to a vision model without video URL capability", async () => {
    const frameSheetDataUrls = [
      "data:image/jpeg;base64,AQIDBA==",
      "data:image/webp;base64,BQYHCA==",
    ];
    const response = await postPromptReverse("frame-sheets-success", {
      mode: "video",
      displayName: modelDisplayName,
      frameSheetDataUrls,
      samplingMetadata: {
        frameRate: 6,
        frameCount: 72,
        durationMs: 12_000,
        sheetCount: 2,
        columns: 6,
        rows: 6,
        framesPerSheet: 36,
      },
    });
    const envelope = await response.json();

    assert.equal(response.status, 200, JSON.stringify(envelope));
    assert.equal(envelope.data.mode, "video");
    assert.equal(envelope.data.displayName, modelDisplayName);
    assert.equal(JSON.stringify(envelope.data).includes(modelCode), false);
    assert.equal(envelope.data.frameSheetCount, 2);
    assert.equal(envelope.data.sampling.frameRate, 6);
    assert.deepEqual(envelope.data.usage, {
      promptTokens: 9000,
      completionTokens: 3000,
      cachedTokens: 0,
      totalTokens: 12000,
    });
    assert.equal(envelope.data.credit.consumed, 12);
    assert.equal(envelope.data.credit.released, 20);
    const content = gatewayCalls.at(-1)?.messages?.[1]?.content;
    assert.ok(Array.isArray(content));
    assert.match(String(content[0]?.type === "text" ? content[0].text : ""), /完整时间线/);
    assert.deepEqual(
      content.slice(1).map((part) => part.type === "image_url" ? part.image_url.url : null),
      frameSheetDataUrls,
    );
    assert.equal(content.some((part) => part.type === "video_url"), false);
    const reservation = await db.query<{ reason: string; amount_consumed: number | string }>(
      `SELECT reason, amount_consumed
       FROM credit_reservations
       WHERE user_id = $1 AND source_type = 'canvas_agent_text_round'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    assert.equal(reservation.rows[0]?.reason, "工具箱视频反推消耗积分");
    assert.equal(Number(reservation.rows[0]?.amount_consumed), 12);
  });

  it("accepts video frame sheets when the browser cannot report duration metadata", async () => {
    const response = await postPromptReverse("frame-sheets-unknown-duration", {
      mode: "video",
      displayName: modelDisplayName,
      frameSheetDataUrls: ["data:image/webp;base64,AQIDBA=="],
      samplingMetadata: {
        frameRate: 6,
        frameCount: 48,
        durationMs: 0,
        sheetCount: 1,
        columns: 8,
        rows: 6,
        framesPerSheet: 48,
      },
    });
    const envelope = await response.json();

    assert.equal(response.status, 200, JSON.stringify(envelope));
    assert.equal(envelope.data.sampling.durationMs, null);
  });

  it("charges image prompt reverse through the token billing flow", async () => {
    const response = await postPromptReverse("image-billing-success", {
      mode: "image",
      displayName: modelDisplayName,
      imageDataUrl: "data:image/jpeg;base64,AQIDBA==",
    });
    const envelope = await response.json();

    assert.equal(response.status, 200, JSON.stringify(envelope));
    assert.equal(envelope.data.mode, "image");
    const reservation = await db.query<{ reason: string; amount_consumed: number | string }>(
      `SELECT reason, amount_consumed
       FROM credit_reservations
       WHERE user_id = $1 AND source_type = 'canvas_agent_text_round'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    assert.equal(reservation.rows[0]?.reason, "工具箱图片反推消耗积分");
    assert.equal(Number(reservation.rows[0]?.amount_consumed), 12);
  });

  it("uses the separately managed image and video prompt reverse instructions", async () => {
    await db.query(
      `INSERT INTO runtime_config_entries (key, value_json, value_type, scope, description, updated_at)
       VALUES ($1, $2::jsonb, 'json', 'creator', 'toolbox prompt reverse test', NOW())
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
      [
        "creator.toolbox_prompt_reverse",
        JSON.stringify({
          imageInstruction: "后台图片反推指令",
          videoInstruction: "后台视频反推指令：{{segmentDurationSeconds}} 秒，{{segmentDurationMs}} 毫秒",
        }),
      ],
    );

    const imageResponse = await postPromptReverse("image-custom-instruction", {
      mode: "image",
      displayName: modelDisplayName,
      imageDataUrl: "data:image/jpeg;base64,AQIDBA==",
    });
    assert.equal(imageResponse.status, 200);
    assert.equal(gatewayCalls.at(-1)?.messages?.[0]?.content, "后台图片反推指令");

    const videoResponse = await postPromptReverse("video-custom-instruction", {
      mode: "video",
      displayName: modelDisplayName,
      frameSheetDataUrls: ["data:image/jpeg;base64,AQIDBA=="],
      samplingMetadata: { frameRate: 6, frameCount: 90, durationMs: 15_000, sheetCount: 1 },
    });
    assert.equal(videoResponse.status, 200);
    assert.equal(gatewayCalls.at(-1)?.messages?.[0]?.content, "后台视频反推指令：15 秒，15000 毫秒");
  });

  it("rejects video sampling below 6 FPS before model invocation", async () => {
    const callsBefore = gatewayCalls.length;
    const response = await postPromptReverse("frame-sheets-low-fps", {
      mode: "video",
      displayName: modelDisplayName,
      frameSheetDataUrls: ["data:image/jpeg;base64,AQIDBA=="],
      samplingMetadata: { frameRate: 5, frameCount: 10, sheetCount: 1 },
    });
    const envelope = await response.json();

    assert.equal(response.status, 400);
    assert.equal(envelope.errorCode, "prompt_reverse_video_sampling_invalid");
    assert.equal(gatewayCalls.length, callsBefore);
  });

  it("rejects more than 64 frame sheets before model invocation", async () => {
    const callsBefore = gatewayCalls.length;
    const response = await postPromptReverse("frame-sheets-count", {
      mode: "video",
      displayName: modelDisplayName,
      frameSheetDataUrls: Array.from({ length: 65 }, () => "data:image/jpeg;base64,AQIDBA=="),
      samplingMetadata: { frameRate: 6, frameCount: 65, sheetCount: 65 },
    });
    const envelope = await response.json();

    assert.equal(response.status, 400);
    assert.equal(envelope.errorCode, "prompt_reverse_video_frame_sheet_count_invalid");
    assert.equal(gatewayCalls.length, callsBefore);
  });

  it("requires at least 200 available credits before prompt reverse", async () => {
    await db.query(
      "UPDATE users SET credit_balance_cached = 199 WHERE id = $1",
      [userId],
    );
    const callsBefore = gatewayCalls.length;
    const response = await postPromptReverse("insufficient-reserved-credits", {
      mode: "image",
      displayName: modelDisplayName,
      imageDataUrl: "data:image/jpeg;base64,AQIDBA==",
    });
    const envelope = await response.json();

    assert.equal(response.status, 402);
    assert.equal(envelope.errorCode, "prompt_reverse_credit_reserve_insufficient");
    assert.equal(envelope.message, "积分余额预留不足，请前往充值");
    assert.equal(gatewayCalls.length, callsBefore);
  });

  it("requires an active membership before prompt reverse", async () => {
    await db.query(
      "UPDATE user_memberships SET status = 'expired' WHERE user_id = $1",
      [userId],
    );
    const callsBefore = gatewayCalls.length;
    const response = await postPromptReverse("membership-required", {
      mode: "image",
      displayName: modelDisplayName,
      imageDataUrl: "data:image/jpeg;base64,AQIDBA==",
    });
    const envelope = await response.json();

    assert.equal(response.status, 403);
    assert.equal(envelope.errorCode, "membership_required");
    assert.equal(envelope.message, "请先开通会员后再使用提示词反推。");
    assert.equal(gatewayCalls.length, callsBefore);
  });

  function postPromptReverse(idempotencyKey: string, body: Record<string, unknown>) {
    return fetch(`${server.origin}/api/toolbox/prompt-reverse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        cookie,
      },
      body: JSON.stringify(body),
    });
  }
});
