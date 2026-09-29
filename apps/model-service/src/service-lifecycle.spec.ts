import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test, { type TestContext } from "node:test";
import { createModelService } from "./service.ts";
import type { ExecutionResult, ModelConfig, RequestStore, StoredRequest } from "./contracts.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(t: TestContext, overrides: Partial<RequestStore> = {}) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const now = new Date("2026-09-29T00:00:00.000Z");
  const model: ModelConfig = {
    id: "model", modelCode: "text", displayName: "Text", providerName: "supplier",
    providerModel: "pinned-model", providerProtocol: "openai_compatible_chat", invocationMode: "sync",
    mediaType: "text", taskModes: [], capabilities: {}, parameterSchema: {}, defaultParams: {},
    providerConfig: {}, pricing: {}, limits: {}, uiConfig: {}, status: "active", sortOrder: 0, remark: null,
  };
  const request: StoredRequest = {
    id: "request", productId: "product", subjectId: "subject", requestKey: "key", requestHash: "hash",
    operation: "text", model, payload: { messages: [{ role: "user", content: "hello" }] },
    status: "submitting", externalId: null, result: null, error: null,
    leaseToken: "owned-token", leaseUntil: new Date(now.getTime() + 180_000),
    nextRunAt: now, createdAt: now, updatedAt: now,
  };
  const started = deferred<void>();
  const provider = deferred<ExecutionResult>();
  let finishes = 0;
  const store: RequestStore = {
    rememberNonce: async () => true,
    create: async () => ({ request, created: true }),
    findByKey: async () => request,
    get: async () => request,
    recoverExpired: async () => {},
    claim: async () => request,
    renew: async (_id, token) => request.leaseToken === token,
    finish: async (_id, token, update) => {
      finishes++;
      if (request.leaseToken !== token) return false;
      request.status = update.status;
      request.leaseToken = null;
      request.leaseUntil = null;
      return true;
    },
    ...overrides,
  };
  const service = createModelService({ store, now: () => now,
    env: {
      MODEL_SERVICE_HMAC_KEYS_JSON: JSON.stringify({ key: { workerId: "product", secret: "offline".repeat(8) } }),
      MODEL_SERVICE_PRODUCTS_JSON: JSON.stringify({ product: { models: { text: ["text"] } } }),
    },
    listModels: async () => [model],
    executor: {
      supports: () => true,
      submit: async () => { started.resolve(); return provider.promise; },
      poll: async () => { throw new Error("unexpected_poll"); },
    },
  });
  return { service, request, started, provider, finishes: () => finishes };
}

const success: ExecutionResult = { status: "succeeded", result: { content: "done", usage: null } };

test("completion waits for an in-flight heartbeat before clearing its lease", async t => {
  const renewalStarted = deferred<void>();
  const renewalRelease = deferred<void>();
  const f = fixture(t, { renew: async (_id, token) => {
    renewalStarted.resolve();
    await renewalRelease.promise;
    return f.request.leaseToken === token;
  } });
  const work = f.service.tick();
  // Attach rejection observation immediately so the pre-fix race cannot escape the test.
  const observed = work.then(() => undefined, error => error);
  await f.started.promise;
  t.mock.timers.tick(60_000);
  await renewalStarted.promise;
  f.provider.resolve(success);
  await setImmediate();
  const finishedBeforeRenewal = f.finishes();
  renewalRelease.resolve();
  assert.equal(await observed, undefined, "successful completion must not report lease_lost");
  assert.equal(finishedBeforeRenewal, 0, "finish must wait until renewal settles");
  assert.equal(f.finishes(), 1);
  assert.equal(f.request.status, "succeeded");
  t.mock.timers.tick(60_000);
  assert.equal(f.finishes(), 1);
});

test("a real heartbeat SQL error propagates without finalizing the request", async t => {
  const databaseError = Object.assign(new Error("offline_database_failure"), { code: "08006" });
  const f = fixture(t, { renew: async () => { throw databaseError; } });
  const work = f.service.tick();
  const rejected = assert.rejects(work, error => error === databaseError);
  await f.started.promise;
  t.mock.timers.tick(60_000);
  await setImmediate();
  f.provider.resolve(success);
  await rejected;
  assert.equal(f.finishes(), 0);
  assert.equal(f.request.status, "submitting");
});

test("losing a lease leaves the other worker's state intact and does not reject the tick", async t => {
  const f = fixture(t, { renew: async () => {
    f.request.leaseToken = "other-worker-token";
    f.request.status = "running";
    return false;
  } });
  const work = f.service.tick();
  const observed = work.then(() => undefined, error => error);
  await f.started.promise;
  t.mock.timers.tick(60_000);
  await setImmediate();
  f.provider.resolve(success);
  assert.equal(await observed, undefined);
  assert.equal(f.finishes(), 0);
  assert.equal(f.request.leaseToken, "other-worker-token");
  assert.equal(f.request.status, "running");
});

test("a real completion SQL error still propagates after the heartbeat stops", async t => {
  const databaseError = Object.assign(new Error("offline_completion_failure"), { code: "08006" });
  const f = fixture(t, { finish: async () => { throw databaseError; } });
  const work = f.service.tick();
  const rejected = assert.rejects(work, error => error === databaseError);
  await f.started.promise;
  f.provider.resolve(success);
  await rejected;
  assert.equal(f.request.status, "submitting");
});
