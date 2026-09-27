import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, it } from "node:test";
import { createMigratedTestDb, type TestDatabase } from "../../shared/db/test-db.ts";
import type { AiModelConfigRecord } from "../../model-catalog/ai-model-config.store.ts";
import { normalizeProviderPrompt, prepareGenerationPrompt } from "../generation-prompt-preparation.service.ts";
import { validateGenerationModelRequest } from "../../model-catalog/generation-model-request.validator.ts";
import { buildSanBaoVideoPayload } from "../san-bao.provider-adapter.ts";
import { composeGenerationPrompt } from "../../../../../web/src/shared/generation-prompt-policy.js";

let db: TestDatabase;
const userId = randomUUID();
before(async () => {
  db = await createMigratedTestDb();
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
});
after(async () => { await db?.close(); });

function input(requestKey = randomUUID()) {
  return { userId, requestKey, env: {}, now: new Date(), allowRewrite: true,
    prompt: "人物抬头后转身，镜头缓慢推进。".repeat(30),
    model: { modelCode: "generic-video", providerName: "test-provider", providerModel: "test-video",
      mediaType: "video", parameterSchema: { prompt: { maxLength: 60 } }, limits: {},
    } as AiModelConfigRecord,
  };
}
const prompt = "人物抬头后转身，镜头缓慢推进。";
const answers = () => {
  let calls = 0;
  return async () => ++calls === 1 ? JSON.stringify({ prompt }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
};

it("prepares a manual suggestion with no known limit but never rewrites ordinary generation", async () => {
  for (const schema of [{}, { prompt: { maxLength: 5000 } }, { prompt: { maxLength: 100, limitUnit: "tokens" } }]) {
    const request = input();
    request.model.parameterSchema = schema;
    let calls = 0;
    const complete = async () => ++calls === 1 ? JSON.stringify({ prompt }) : JSON.stringify({ equivalent: true, lost: [], added: [] });
    const ordinary = await prepareGenerationPrompt(db, { ...request, allowRewrite: false, complete });
    assert.equal(ordinary.prompt, request.prompt);
    assert.equal(calls, 0);
    const simplified = await prepareGenerationPrompt(db, { ...request, complete });
    assert.equal(simplified.prompt, prompt);
    assert.equal(calls, 2);
    const replay = await prepareGenerationPrompt(db, { ...request, complete });
    assert.equal(replay.prompt, prompt);
    assert.equal(calls, 2);
    assert.equal((await prepareGenerationPrompt(db, { ...request, allowRewrite: false, complete })).prompt, request.prompt);
  }
});

it("removes only Wan 3.0's undocumented legacy cap on fresh installs and upgrades", async () => {
  const read = async () => (await db.query(`SELECT model_code, parameter_schema_json, limits_json, pricing_json, status
    FROM ai_model_configs WHERE model_code IN ('wan3.0-r2v','wan2.7-r2v') ORDER BY model_code`)).rows;
  const seeded = await read();
  const wan = seeded.find(row => row.model_code === 'wan3.0-r2v')!;
  assert.equal(wan.parameter_schema_json.prompt.maxLength, 5000);
  assert.equal(wan.limits_json.maxPromptLength, 5000);
  delete wan.parameter_schema_json.prompt.maxLength;
  delete wan.limits_json.maxPromptLength;
  const sql = await readFile('packages/db/migrations/20261113-remove-undocumented-wan30-prompt-limit.sql', 'utf8');
  await db.query(`UPDATE ai_model_configs SET parameter_schema_json=jsonb_set(parameter_schema_json, '{prompt,maxLength}', '2500'),
    limits_json=jsonb_set(limits_json, '{maxPromptLength}', '2500') WHERE model_code='wan3.0-r2v'`);
  await db.query(sql);
  assert.deepEqual(await read(), seeded);
  await db.query(sql);
  assert.deepEqual(await read(), seeded);
  await db.query(`UPDATE ai_model_configs SET parameter_schema_json=jsonb_set(parameter_schema_json, '{prompt,maxLength}', '7000'),
    limits_json=jsonb_set(limits_json, '{maxPromptLength}', '7000') WHERE model_code='wan3.0-r2v'`);
  const customized = await read();
  await db.query(sql);
  assert.deepEqual(await read(), customized);
});

it("sets the chosen Wan 3.0 platform cap to 5000 characters including composed content", async () => {
  const rows = (await db.query(`SELECT model_code, parameter_schema_json, limits_json, pricing_json, status
    FROM ai_model_configs ORDER BY model_code`)).rows;
  // The preceding test customized the limit; the new migration must apply the
  // explicitly requested platform policy to that model only.
  const sql = await readFile('packages/db/migrations/20261114-wan30-platform-prompt-limit.sql', 'utf8');
  await db.query(sql);
  const updated = (await db.query(`SELECT model_code, parameter_schema_json, limits_json, pricing_json, status
    FROM ai_model_configs ORDER BY model_code`)).rows;
  const expected = structuredClone(rows);
  const wan = expected.find(row => row.model_code === 'wan3.0-r2v')!;
  Object.assign(wan.parameter_schema_json.prompt, { maxLength: 5000, limitUnit: 'characters' });
  Object.assign(wan.limits_json, { maxPromptLength: 5000, promptLengthUnit: 'characters' });
  assert.deepEqual(updated, expected);
  await db.query(sql);
  assert.deepEqual((await db.query(`SELECT model_code, parameter_schema_json, limits_json, pricing_json, status
    FROM ai_model_configs ORDER BY model_code`)).rows, expected);
  const model = { ...input().model, parameterSchema: wan.parameter_schema_json, limits: wan.limits_json };
  const style = { mediaType: 'video', style: '电影写实' };
  const overhead = [...composeGenerationPrompt('', style)].length + 1;
  const body = '🎬'.repeat(5000 - overhead);
  const execution = composeGenerationPrompt(body, style);
  const request = { ...input(), model, allowRewrite: false, prompt: execution,
    complete: async () => { throw new Error('ordinary generation must not rewrite'); } };
  assert.equal([...execution].length, 5000);
  assert.equal((await prepareGenerationPrompt(db, request)).prompt, execution);
  await assert.rejects(prepareGenerationPrompt(db, { ...request, prompt: execution + '字' }), { code: 'model_prompt_too_long' });
});

it("revalidates the adopted draft with full style composition and does not replay a result for a changed style", async () => {
  const request = input();
  const promptComposition = { mediaType: "video", style: "日系动漫\n保留人物特征" };
  const result = await prepareGenerationPrompt(db, { ...request, parameters: { promptComposition }, complete: answers() });
  const finalPrompt = composeGenerationPrompt(result.prompt, promptComposition);
  const checked = await prepareGenerationPrompt(db, { ...request, prompt: finalPrompt, allowRewrite: false,
    complete: async () => { throw new Error("generation must not simplify"); } });
  assert.equal(checked.prompt, finalPrompt);
  const changedStyle = { ...promptComposition, style: "风格".repeat(40) };
  await assert.rejects(prepareGenerationPrompt(db, { ...request, parameters: { promptComposition: changedStyle }, complete: answers() }),
    { adaptationReason: "system_content_exceeds_limit" });
  assert.equal(Number((await db.query("SELECT count(*) FROM credit_reservations")).rows[0].count), 0);
});

it("never rewrites a generation submission or consumes a cached suggestion without user choice", async () => {
  const request = input();
  await prepareGenerationPrompt(db, { ...request, complete: answers() });
  let calls = 0;
  await assert.rejects(prepareGenerationPrompt(db, { ...request, allowRewrite: false,
    complete: async () => { calls++; return JSON.stringify({ prompt }); },
  }), { code: "model_prompt_too_long" });
  assert.equal(calls, 0);
  const record = (await db.query("SELECT status, request_format FROM user_model_request_logs WHERE request_key LIKE $1 AND request_format='generation_prompt_validation'", [`%:${request.requestKey}:%`])).rows[0];
  assert.equal(record.status, "failed");
  assert.equal(Number((await db.query("SELECT count(*) FROM credit_reservations")).rows[0].count), 0);
});

it("persists execution text and replays it without another model call or generation charge", async () => {
  const request = input();
  const result = await prepareGenerationPrompt(db, { ...request, complete: answers() });
  const replayed = await prepareGenerationPrompt(db, { ...request, complete: async () => { throw new Error("replayed adaptation called model"); } });
  assert.equal(result.prompt, prompt);
  assert.deepEqual(replayed, result);
  const record = (await db.query("SELECT * FROM provider_requests WHERE payload_hash = (SELECT payload_hash FROM user_model_request_logs WHERE user_id=$1 AND request_body_json->>'originalPrompt'=$2 LIMIT 1)", [userId, request.prompt])).rows[0];
  assert.equal(record.status, "succeeded");
  assert.equal(record.external_submission_started_at, null);
  assert.equal(record.response_redacted_json.promptAdaptation.originalPrompt, request.prompt);
  assert.equal(Number((await db.query("SELECT count(*) FROM tasks")).rows[0].count), 0);
  assert.equal(Number((await db.query("SELECT count(*) FROM credit_reservations")).rows[0].count), 0);
});

it("records a local rejection with both length and limit and never claims provider submission", async () => {
  const request = input();
  await assert.rejects(prepareGenerationPrompt(db, { ...request, complete: async () => "not json" }), { code: "model_prompt_too_long" });
  const record = (await db.query(`SELECT logs.status, logs.failure_code, logs.request_body_json, requests.external_submission_started_at
    FROM user_model_request_logs logs JOIN provider_requests requests ON requests.id=logs.provider_request_id
    WHERE logs.request_key LIKE $1`, [`%:${request.requestKey}:%`])).rows[0];
  assert.equal(record.status, "failed");
  assert.equal(record.failure_code, "model_prompt_too_long");
  assert.equal(record.request_body_json.limit.maximum, 60);
  assert.ok(record.request_body_json.actualLength > 60);
  assert.equal(record.external_submission_started_at, null);
});

it("claims concurrent adaptation once and allows replay after completion", async () => {
  const request = input();
  let release!: () => void;
  let started!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const complete = answers();
  const pending = prepareGenerationPrompt(db, { ...request, complete: async () => { started(); await barrier; return complete(); } });
  await ready;
  try {
    await assert.rejects(prepareGenerationPrompt(db, { ...request, complete: async () => { throw new Error("duplicate call"); } }), { code: "model_prompt_adaptation_pending" });
  } finally { release(); }
  assert.equal((await pending).prompt, prompt);
});

it("does not share adaptation audit records across users", async () => {
  const anotherUser = randomUUID();
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [anotherUser]);
  const request = input();
  await prepareGenerationPrompt(db, { ...request, complete: answers() });
  await prepareGenerationPrompt(db, { ...request, userId: anotherUser, complete: answers() });
  const records = (await db.query("SELECT user_id FROM user_model_request_logs WHERE request_key LIKE $1", [`%:${request.requestKey}:%`])).rows;
  assert.deepEqual(new Set(records.map((row) => row.user_id)), new Set([userId, anotherUser]));
});

it("budgets the final provider reference tags and replays the same execution payload", async () => {
  const request = input();
  request.model.providerProtocol = "san_bao";
  const tag = "身穿灰色长袍的主角参考素材";
  request.prompt = `@${tag} 与 @图1 保持一致，` + "人物抬头后转身。".repeat(20);
  const parameters = { referenceImages: [{ tag, url: "https://example.test/hero.png" }] };
  const adaptedPrompt = `@${tag} 与 @图1 一致，人物抬头后转身。`;
  let calls = 0;
  const prepared = await prepareGenerationPrompt(db, { ...request, parameters,
    complete: async () => ++calls === 1 ? JSON.stringify({ prompt: adaptedPrompt })
      : JSON.stringify({ equivalent: true, lost: [], added: [] }),
  });
  const payload = buildSanBaoVideoPayload({ providerRequestId: "test", providerName: "test", providerOperation: "video.generate",
    requestKey: "test", payloadHash: "test", payloadRef: "test", redactedPayload: { prompt: prepared.prompt, parameters } });
  assert.equal(prepared.prompt, adaptedPrompt);
  assert.doesNotMatch(String(payload.prompt), /@图1/);
  assert.ok([...String(payload.prompt)].length <= 60);
  assert.match(String(payload.prompt), new RegExp(tag));
  assert.deepEqual(await prepareGenerationPrompt(db, { ...request, parameters, complete: async () => { throw new Error("unexpected replay"); } }), prepared);
  assert.equal(calls, 2);
});

it("repairs a missing display log from a saved successful adaptation without calling a model", async () => {
  const request = input();
  const prepared = await prepareGenerationPrompt(db, { ...request, complete: answers() });
  await db.query("DELETE FROM user_model_request_logs WHERE request_key LIKE $1", [`%:${request.requestKey}:%`]);
  assert.deepEqual(await prepareGenerationPrompt(db, { ...request, complete: async () => { throw new Error("unexpected replay"); } }), prepared);
  const record = (await db.query("SELECT status FROM user_model_request_logs WHERE request_key LIKE $1", [`%:${request.requestKey}:%`])).rows[0];
  assert.equal(record.status, "succeeded");
});

it("returns an editable suggestion with mention tokens intact while budgeting provider-normalized text", async () => {
  const request = input();
  request.model.providerProtocol = "san_bao";
  request.prompt = "【@主角】抬头，" + "镜头缓慢推进。".repeat(30);
  const parameters = { referenceImages: [{ tag: "主角", url: "https://example.test/hero.png" }] };
  const editorPrompt = "【@主角】抬头，镜头缓慢推进。";
  let calls = 0;
  const prepared = await prepareGenerationPrompt(db, { ...request, parameters,
    complete: async () => ++calls === 1 ? JSON.stringify({ prompt: editorPrompt })
      : JSON.stringify({ equivalent: true, lost: [], added: [] }),
  });
  assert.equal(prepared.prompt, editorPrompt);
  assert.deepEqual(await prepareGenerationPrompt(db, { ...request, parameters,
    complete: async () => { throw new Error("unexpected replay"); },
  }), prepared);
  const execution = await prepareGenerationPrompt(db, { ...request, parameters, prompt: prepared.prompt,
    allowRewrite: false, complete: async () => { throw new Error("generation must not rewrite"); },
  });
  assert.equal(execution.prompt, editorPrompt);
  assert.equal(execution.originalPrompt, editorPrompt);
  assert.equal(calls, 2);
});

it("keeps reference bindings through intake and budgets only the provider-normalized copy", async () => {
  const request = input();
  request.model.providerProtocol = "san_bao";
  request.model.capabilities = {};
  request.prompt = "使用【@视频1】和【@音频1】生成视频";
  const parameters = {
    videos: [{ url: "https://example.test/reference.mp4" }],
    videoFilePaths: ["https://example.test/reference.mp4"],
    audios: [{ url: "https://example.test/reference.mp3" }],
    audioFilePaths: ["https://example.test/reference.mp3"],
  };
  const normalized = normalizeProviderPrompt(request.model, request.prompt, parameters);
  request.model.parameterSchema.prompt = { maxLength: [...normalized].length };
  assert.ok([...request.prompt].length > [...normalized].length);
  const prepared = await prepareGenerationPrompt(db, { ...request, parameters, allowRewrite: false,
    complete: async () => { throw new Error("generation must not rewrite"); },
  });
  assert.equal(prepared.prompt, request.prompt);
  assert.doesNotThrow(() => validateGenerationModelRequest({ kind: "video", modelCode: request.model.modelCode,
    modelConfig: request.model, parameters, prompt: normalizeProviderPrompt(request.model, prepared.prompt, parameters) }));
  const payload = buildSanBaoVideoPayload({ providerRequestId: "test", providerName: "test", providerOperation: "video.generate",
    requestKey: "test", payloadHash: "test", payloadRef: "test", redactedPayload: { prompt: prepared.prompt, parameters } });
  assert.equal(payload.prompt, "使用@视频1和@音频1生成视频");
  assert.deepEqual(payload.videos, [{ tag: "视频1", url: parameters.videoFilePaths[0] }]);
  assert.deepEqual(payload.audios, [{ tag: "音频1", url: parameters.audioFilePaths[0] }]);
});
