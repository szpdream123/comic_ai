import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createModelService } from "./service.ts";
import { createRequestStore } from "./request-store.ts";
import { signComicAiIntegrationRequest } from "../../backend/src/modules/integrations/comic-ai-integration-hmac.ts";
import type { ModelConfig, ProviderExecutor } from "./contracts.ts";
import { createProviderExecutor } from "./provider-executor.ts";

const secret = "offline-only-service-key-with-at-least-32-characters";
const prefix = "/api/integrations/promo-agent";
const model = (code = "text", mediaType = "text"): ModelConfig => ({ id: code, modelCode: code, displayName: code,
  providerName: mediaType === "video" ? "GlobalAiOpc" : "Existing", providerModel: code,
  providerProtocol: mediaType === "video" ? "globalaiopc_video" : "openai_compatible_chat", invocationMode: "async_polling",
  mediaType, taskModes: [], capabilities: {}, parameterSchema: {}, defaultParams: {},
  providerConfig: { apiKey: "NEVER-PERSIST-THIS", apiKeyEnv: "PROVIDER_KEY" }, pricing: {}, limits: {}, uiConfig: {}, status: "active", sortOrder: 0, remark: null });
async function fixture(t: any, override: Partial<ProviderExecutor> = {}) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
  let submits = 0;
  const executor: ProviderExecutor = { supports: () => true,
    submit: async (_m, operation) => { submits++; return operation === "video"
      ? { status: "running", externalId: "provider-id", result: { usage: null } }
      : { status: "succeeded", result: { content: "完成", usage: { inputTokens: 3, outputTokens: 1 } } }; },
    poll: async () => ({ status: "succeeded", result: { videoUrl: "https://results.example/video.mp4", usage: null } }), ...override };
  const store = createRequestStore(db);
  const env = { MODEL_SERVICE_HMAC_KEYS_JSON: JSON.stringify({ test: { workerId: "promo-agent", secret }, other: { workerId: "other", secret } }),
    MODEL_SERVICE_PRODUCTS_JSON: JSON.stringify(Object.fromEntries(["promo-agent", "other"].map(id => [id, {
      models: { text: ["text"], video: ["video"], speech: [], transcription: [] }, mediaOrigins: ["https://assets.example"] }]))) };
  const catalog = [model(), model("video", "video")];
  const service = createModelService({ store, executor, env, listModels: async () => catalog });
  const call = async (path: string, body?: Record<string, unknown>, productId = "promo-agent", headerKey?: string) => {
    const method = body ? "POST" : "GET"; const bytes = Buffer.from(body ? JSON.stringify(body) : "");
    const timestamp = String(Date.now()); const nonce = randomUUID(); const keyId = productId === "promo-agent" ? "test" : "other";
    const signed = signComicAiIntegrationRequest({ secret, method, pathWithQuery: prefix + path, workerId: productId, keyId, timestamp, nonce, body: bytes });
    return service.handle({ method, url: new URL("https://service.example" + prefix + path), body: bytes,
      headers: { "x-comic-ai-version": "v1", "x-comic-ai-worker-id": productId, "x-comic-ai-key-id": keyId,
        "x-comic-ai-timestamp": timestamp, "x-comic-ai-nonce": nonce, "x-comic-ai-content-sha256": signed.bodySha256,
        "x-comic-ai-signature": signed.signature, "idempotency-key": headerKey ?? body?.requestKey as string } });
  };
  return { db, store, service, call, catalog, submits: () => submits };
}
const textBody = (requestKey = "text-1") => ({ model: "text", subjectId: "new-product-user", requestKey, prompt: "你好" });

test("new product text call needs no legacy user/member/wallet tables and reuses one result", async t => {
  const f = await fixture(t);
  const result = await f.call("/text-completions", textBody());
  assert.equal(result.status, 200); assert.equal(result.body.content, "完成");
  const again = await f.call("/text-completions", textBody());
  assert.deepEqual(again.body, result.body); assert.equal(f.submits(), 1);
  assert.equal(JSON.stringify(await f.db.query("SELECT model_json FROM model_service_requests")).includes("NEVER-PERSIST"), false);
  const conflict = await f.call("/text-completions", { ...textBody(), prompt: "different" });
  assert.equal(conflict.status, 409);
});
test("signed requestKey binding rejects changed idempotency header, identity and route escape", async t => {
  const f = await fixture(t);
  assert.equal((await f.call("/text-completions", textBody(), "promo-agent", "tampered")).status, 400);
  assert.equal((await f.call("/text-completions", { ...textBody(), userId: "legacy-user" })).status, 400);
  const denied = await f.service.handle({ method: "POST", url: new URL("https://service.example" + prefix + "/text-completions"), headers: {}, body: Buffer.from("{}") });
  assert.equal(denied.status, 401); assert.equal(f.submits(), 0);
});
test("video queue persists then polls independently; reads isolate product and subject", async t => {
  const f = await fixture(t);
  const submitted = await f.call("/video-generations", { model: "video", subjectId: "u1", requestKey: "v1", prompt: "shot", parameters: {} });
  assert.equal(submitted.status, 202); const id = submitted.body.taskId;
  assert.equal(f.submits(), 0);
  await f.service.tick();
  assert.equal((await f.call(`/video-generations/${id}?subjectId=u2`)).status, 404);
  assert.equal((await f.call(`/video-generations/${id}?subjectId=u1`, undefined, "other")).status, 404);
  await f.db.query("UPDATE model_service_requests SET next_run_at = now() - interval '1 minute'");
  await f.service.tick();
  const result = await f.call(`/video-generations/${id}?subjectId=u1`);
  assert.equal(result.body.status, "succeeded"); assert.equal(result.body.videoUrl, "https://results.example/video.mp4");
  assert.equal(f.submits(), 1);
});
test("ambiguous submission remains unknown and cannot be retried as a new provider call", async t => {
  let calls = 0;
  const f = await fixture(t, { submit: async () => { calls++; throw new Error("provider secret timeout"); } });
  const first = await f.call("/text-completions", textBody());
  assert.equal(first.body.status, "result_unknown"); assert.equal(first.status, 202);
  await f.call("/text-completions", textBody()); await f.service.tick();
  assert.equal(calls, 1); assert.equal(JSON.stringify(first).includes("secret timeout"), false);
});
test("multimodal material access is explicit and rejects unapproved/private URLs", async t => {
  const f = await fixture(t);
  for (const url of ["https://127.0.0.1/a", "http://assets.example/a", "https://evil.example/a", "https://user:password@assets.example/a"]) {
    const denied = await f.call("/text-completions", { model: "text", subjectId: "u", requestKey: randomUUID(), messages: [{ role: "user", content: [{ type: "image_url", image_url: { url } }] }] });
    assert.equal(denied.status, 400);
  }
  const accepted = await f.call("/text-completions", { model: "text", subjectId: "u", requestKey: "vision", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://assets.example/image.jpg?signature=allowed" } }] }] });
  assert.equal(accepted.status, 200);
});

test("legacy prompt and catalog defaults reach reused text adapter", async t => {
  let called = false;
  const executor = createProviderExecutor({ env: { PROVIDER_KEY: "offline" }, fetchImpl: async (_url, init) => {
    called = true;
    assert.deepEqual(JSON.parse(String(init?.body)).messages, [{ role: "user", content: "你好" }]);
    assert.equal(JSON.parse(String(init?.body)).temperature, 0.1);
    assert.equal(JSON.parse(String(init?.body)).max_tokens, 50);
    assert.deepEqual(JSON.parse(String(init?.body)).thinking, { type: "disabled" });
    return new Response('data: {"id":"r","choices":[{"index":0,"delta":{"content":"完成"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
  } });
  const f = await fixture(t, executor);
  // Route information comes from the model catalog, never the caller.
  const service = createModelService({ store: f.store, executor,
    env: { MODEL_SERVICE_HMAC_KEYS_JSON: JSON.stringify({ test: { workerId: "promo-agent", secret } }), MODEL_SERVICE_PRODUCTS_JSON: JSON.stringify({ "promo-agent": { models: { text: ["text"] } } }) },
    listModels: async () => [{ ...model(), defaultParams: { temperature: 0.1, max_tokens: 50, thinking: { type: "disabled" } }, providerConfig: { apiKeyEnv: "PROVIDER_KEY", baseURL: "https://supplier.example/v1" } }] });
  const bytes = Buffer.from(JSON.stringify(textBody())); const timestamp = String(Date.now()); const nonce = randomUUID();
  const path = prefix + "/text-completions";
  const signed = signComicAiIntegrationRequest({ secret, method: "POST", pathWithQuery: path, workerId: "promo-agent", keyId: "test", timestamp, nonce, body: bytes });
  const response = await service.handle({ method: "POST", url: new URL("https://service.example" + path), body: bytes,
    headers: { "x-comic-ai-version": "v1", "x-comic-ai-worker-id": "promo-agent", "x-comic-ai-key-id": "test", "x-comic-ai-timestamp": timestamp,
      "x-comic-ai-nonce": nonce, "x-comic-ai-content-sha256": signed.bodySha256, "x-comic-ai-signature": signed.signature, "idempotency-key": "text-1" } });
  assert.equal(response.body.status, "succeeded"); assert.equal(called, true);
});

test("concurrent text retries share one provider submission and recover its result", async t => {
  let entered!: () => void; let release!: () => void; let calls = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, { submit: async () => { calls++; entered(); await finish; return { status: "succeeded", result: { content: "one", usage: null } }; } });
  const first = f.call("/text-completions", textBody());
  await started;
  try {
    const retry = await f.call("/text-completions", textBody());
    assert.equal(retry.status, 202); assert.equal(calls, 1);
  } finally { release(); }
  const completed = await first;
  assert.equal(completed.body.content, "one");
  assert.equal((await f.call(`/requests/${completed.body.requestId}?subjectId=new-product-user`)).body.content, "one");
});

test("queued model revocation stops dispatch but never hides an accepted result", async t => {
  const f = await fixture(t);
  const done = await f.call("/text-completions", textBody());
  const queued = await f.call("/video-generations", { model: "video", subjectId: "u", requestKey: "v", prompt: "shot" });
  f.catalog.length = 0;
  await f.service.tick();
  assert.equal((await f.call(`/requests/${queued.body.requestId}?subjectId=u`)).body.error, "model_not_allowed");
  assert.equal((await f.call("/text-completions", textBody())).body.content, done.body.content);
  assert.equal(f.submits(), 1);
});

test("poll transport failure never re-submits or declares a paid generation failed", async t => {
  let polls = 0;
  const f = await fixture(t, { poll: async (_model, _op, _payload, id) => {
    assert.equal(id, "provider-id");
    if (++polls === 1) throw new Error("private supplier diagnostics");
    return { status: "succeeded", result: { videoUrl: "https://results.example/a.mp4", usage: null } };
  } });
  const queued = await f.call("/video-generations", { model: "video", subjectId: "u", requestKey: "v", prompt: "shot" });
  await f.service.tick();
  const due = () => f.db.query("UPDATE model_service_requests SET next_run_at = now() - interval '1 minute'");
  await due(); await f.service.tick();
  const pending = await f.call(`/requests/${queued.body.requestId}?subjectId=u`);
  assert.equal(pending.body.status, "running"); assert.equal(pending.body.error, "provider_poll_unavailable");
  await due(); await f.service.tick();
  assert.equal((await f.call(`/requests/${queued.body.requestId}?subjectId=u`)).body.status, "succeeded");
  assert.equal(f.submits(), 1);
});

test("deep model schemas fail validation without crashing the service", async t => {
  const f = await fixture(t);
  let schema: any = { type: "string" };
  for (let i = 0; i < 80; i++) schema = { properties: { child: schema } };
  const result = await f.call("/text-completions", { ...textBody(), response_format: { type: "json_schema", json_schema: { name: "deep", schema } } });
  assert.equal(result.status, 400); assert.equal(f.submits(), 0);
});
test("PostgreSQL-invalid Unicode is rejected before input or query parameters reach SQL", async t => {
  const f = await fixture(t);
  for (const prompt of ["nul\u0000byte", "unpaired\ud800", "unpaired\udc00"]) {
    const result = await f.call("/text-completions", { ...textBody(randomUUID()), prompt });
    assert.equal(result.status, 400);
  }
  assert.equal((await f.call("/requests/11111111-1111-4111-8111-111111111111?subjectId=a%00b")).status, 400);
  assert.equal(f.submits(), 0);
});
test("invalid provider Unicode cannot crash persistence or cause a second paid submission", async t => {
  let calls = 0;
  const f = await fixture(t, { submit: async () => { calls++; return { status: "succeeded", result: { content: "bad\u0000output", usage: null } }; } });
  const result = await f.call("/text-completions", textBody());
  assert.equal(result.body.status, "result_unknown");
  assert.equal(result.body.error, "provider_result_invalid");
  await f.call("/text-completions", textBody()); assert.equal(calls, 1);
});
