import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ModelServiceError, type ModelConfig, type NewRequest } from "./contracts.ts";
import { createRequestStore } from "./request-store.ts";

const now = new Date("2026-09-29T00:00:00.000Z");
const later = (ms: number) => new Date(now.getTime() + ms);
const model: ModelConfig = {
  id: "model-1", modelCode: "text-1", displayName: "Text", providerName: "provider",
  providerModel: "pinned-model", providerProtocol: "openai", invocationMode: "sync",
  mediaType: "text", taskModes: [], capabilities: {}, parameterSchema: {}, defaultParams: {},
  providerConfig: { baseUrl: "https://provider.example" }, pricing: {}, limits: {}, uiConfig: {},
  status: "active", sortOrder: 0, remark: null,
};
const input = (overrides: Partial<NewRequest> = {}): NewRequest => ({
  productId: "promo", subjectId: "person-1", requestKey: "key-1", requestHash: "hash-1",
  operation: "text", model, payload: { prompt: "hello" }, ...overrides,
});
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await readFile(new URL("../schema.sql", import.meta.url), "utf8"));
  return { db, store: createRequestStore(db) };
}

test("concurrent identical creates share one immutable request; mismatched bodies conflict", async (t) => {
  const { store } = await fixture(t);
  const creates = await Promise.all(Array.from({ length: 20 }, () => store.create(input(), now)));
  assert.equal(creates.filter((value) => value.created).length, 1);
  assert.equal(new Set(creates.map((value) => value.request.id)).size, 1);
  const first = creates[0].request;
  assert.equal(first.status, "queued");
  assert.deepEqual(first.model, model);
  assert.deepEqual(first.createdAt, now);
  await assert.rejects(store.create(input({ requestHash: "different" }), later(1)),
    (error) => error instanceof ModelServiceError && error.status === 409 && error.code === "idempotency_conflict");
  assert.deepEqual((await store.findByKey("promo", "person-1", "key-1"))?.model, model);
});

test("request reads and idempotency scope isolate both product and subject", async (t) => {
  const { store } = await fixture(t);
  const first = (await store.create(input(), now)).request;
  const otherSubject = await store.create(input({ subjectId: "person-2" }), now);
  const otherProduct = await store.create(input({ productId: "other" }), now);
  assert.equal(otherSubject.created, true);
  assert.equal(otherProduct.created, true);
  assert.equal(await store.get(first.id, "promo", "person-2"), null);
  assert.equal(await store.get(first.id, "other", "person-1"), null);
  assert.equal(await store.findByKey("absent", "person-1", "key-1"), null);
  assert.equal((await store.get(first.id, "promo", "person-1"))?.id, first.id);
});

test("concurrent workers claim once, persist completion across store restart, and ignore arbitrary finish fields", async (t) => {
  const { store, db } = await fixture(t);
  const first = (await store.create(input(), now)).request;
  const claims = await Promise.all(Array.from({ length: 12 }, () => store.claim(now, 1000, first.id)));
  assert.equal(claims.filter(Boolean).length, 1);
  const claimed = claims.find(Boolean)!;
  assert.equal(claimed.status, "submitting");
  assert.deepEqual(claimed.leaseUntil, later(1000));
  assert.equal(await store.finish(first.id, "wrong-token", { status: "failed", nextRunAt: now }, now), false);
  assert.equal(await store.finish(first.id, claimed.leaseToken!, {
    status: "succeeded", result: { content: "done", usage: { totalTokens: 2 } }, nextRunAt: later(1),
    ...{ productId: "attacker", model: { providerModel: "changed" } },
  }, later(1)), true);
  const restarted = createRequestStore(db);
  const saved = await restarted.get(first.id, "promo", "person-1");
  assert.equal(saved?.status, "succeeded");
  assert.deepEqual(saved?.result, { content: "done", usage: { totalTokens: 2 } });
  assert.deepEqual(saved?.model, model);
  assert.equal(saved?.leaseToken, null);
  assert.equal(await restarted.claim(later(2), 1000), null);
  assert.equal(await restarted.renew(first.id, claimed.leaseToken!, later(2), 1000), false);
  assert.equal(await restarted.finish(first.id, claimed.leaseToken!, { status: "failed", nextRunAt: now }, later(2)), false);
});

test("expired submissions become result_unknown and never submit again", async (t) => {
  const { store, db } = await fixture(t);
  const { request } = await store.create(input(), now);
  const claimed = (await store.claim(now, 1000))!;
  assert.equal(await store.renew(request.id, claimed.leaseToken!, later(1000), 1000), false);
  assert.equal(await store.finish(request.id, claimed.leaseToken!, { status: "succeeded", nextRunAt: now }, later(1000)), false);
  assert.equal(await store.claim(later(1001), 1000), null);
  const restarted = createRequestStore(db);
  await restarted.recoverExpired(later(1001));
  const saved = await restarted.get(request.id, "promo", "person-1");
  assert.equal(saved?.status, "result_unknown");
  assert.equal(saved?.leaseToken, null);
  assert.equal(await restarted.claim(later(1002), 1000), null);
});

test("running requests wait for poll time and expired polling leases can retry with stale workers fenced", async (t) => {
  const { store } = await fixture(t);
  const { request } = await store.create(input({ operation: "video" }), now);
  const submit = (await store.claim(now, 1000))!;
  assert.equal(await store.finish(request.id, submit.leaseToken!, {
    status: "running", externalId: "provider-task-1", nextRunAt: later(500),
  }, later(1)), true);
  assert.equal(await store.claim(later(499), 1000), null);
  const poll = (await store.claim(later(500), 1000))!;
  assert.equal(poll.status, "running");
  assert.equal(poll.externalId, "provider-task-1");
  assert.equal(await store.renew(request.id, poll.leaseToken!, later(600), 1000), true);
  await store.recoverExpired(later(1500));
  assert.equal(await store.claim(later(1500), 1000), null);
  await store.recoverExpired(later(1600));
  const nextPoll = (await store.claim(later(1600), 1000))!;
  assert.equal(nextPoll.status, "running");
  assert.notEqual(nextPoll.leaseToken, poll.leaseToken);
  assert.equal(await store.renew(request.id, poll.leaseToken!, later(1601), 1000), false);
  assert.equal(await store.finish(request.id, poll.leaseToken!, { status: "failed", nextRunAt: now }, later(1601)), false);
  assert.equal(await store.finish(request.id, nextPoll.leaseToken!, {
    status: "succeeded", result: { videoUrl: "https://media.example/video.mp4", usage: null }, nextRunAt: later(1601),
  }, later(1601)), true);
  assert.equal((await store.get(request.id, "promo", "person-1"))?.externalId, "provider-task-1");
});

test("nonce replay is durable, atomically unique, scoped and reusable only after expiration", async (t) => {
  const { store, db } = await fixture(t);
  const accepted = await Promise.all(Array.from({ length: 20 }, () => store.rememberNonce("promo", "key", "nonce", later(1000), now)));
  assert.equal(accepted.filter(Boolean).length, 1);
  assert.equal(await createRequestStore(db).rememberNonce("promo", "key", "nonce", later(2000), later(1)), false);
  assert.equal(await store.rememberNonce("other", "key", "nonce", later(1000), now), true);
  assert.equal(await store.rememberNonce("promo", "other-key", "nonce", later(1000), now), true);
  assert.equal(await store.rememberNonce("promo", "key", "nonce", later(2000), later(1000)), true);
  assert.equal(await store.rememberNonce("promo", "key", "expired", now, now), false);
});

test("nonce cleanup is bounded while an expired conflicting nonce can always be reused", async (t) => {
  const { store, db } = await fixture(t);
  await db.query(`INSERT INTO model_service_nonces(product_id,key_id,nonce,expires_at)
    SELECT 'promo','key', n::text, $1 FROM generate_series(1, 500) AS n`, [now]);
  assert.equal(await store.rememberNonce("promo", "key", "500", later(2000), later(1)), true);
  const rows = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM model_service_nonces");
  assert.ok(rows.rows[0].count >= 372 && rows.rows[0].count < 500);
});

test("a new database engine loaded from persisted data retains snapshots, results, nonce and recovery state", async (t) => {
  const { store, db } = await fixture(t);
  const completed = (await store.create(input(), now)).request;
  const completeLease = (await store.claim(now, 1000, completed.id))!;
  await store.finish(completed.id, completeLease.leaseToken!, {
    status: "succeeded", result: { content: "persisted", usage: null }, nextRunAt: now,
  }, later(1));
  const uncertain = (await store.create(input({ requestKey: "uncertain" }), now)).request;
  await store.claim(now, 1000, uncertain.id);
  const pending = (await store.create(input({ requestKey: "poll", operation: "video" }), now)).request;
  const pendingLease = (await store.claim(now, 1000, pending.id))!;
  await store.finish(pending.id, pendingLease.leaseToken!, {
    status: "running", externalId: "external-persisted", nextRunAt: later(500),
  }, later(1));
  await store.claim(later(500), 1000, pending.id);
  await store.rememberNonce("promo", "key", "survive-restart", later(5000), now);

  const restoredDb = new PGlite({ loadDataDir: await db.dumpDataDir() });
  t.after(() => restoredDb.close());
  const restored = createRequestStore(restoredDb);
  const saved = await restored.get(completed.id, "promo", "person-1");
  assert.deepEqual(saved?.result, { content: "persisted", usage: null });
  assert.deepEqual(saved?.model, model);
  assert.deepEqual(saved?.payload, { prompt: "hello" });
  assert.equal(await restored.rememberNonce("promo", "key", "survive-restart", later(5000), later(2000)), false);
  await restored.recoverExpired(later(2000));
  assert.equal((await restored.get(uncertain.id, "promo", "person-1"))?.status, "result_unknown");
  assert.equal(await restored.claim(later(2000), 1000, uncertain.id), null);
  assert.equal((await restored.claim(later(2000), 1000, pending.id))?.externalId, "external-persisted");
});

test("nonpositive and invalid leases cannot claim requests", async (t) => {
  const { store } = await fixture(t);
  await store.create(input(), now);
  for (const leaseMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => store.claim(now, leaseMs),
      (error) => error instanceof ModelServiceError && error.code === "invalid_lease");
  }
  assert.equal((await store.claim(now, 1000))?.status, "submitting");
});
