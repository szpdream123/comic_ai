import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRedisProviderRateLimiter } from "../provider-rate-limiter.ts";

describe("provider Redis rate limiter", () => {
  it("acquires provider, model, and tenant submit permits with namespaced Redis keys", async () => {
    const calls: Array<{ keyCount: number; args: unknown[] }> = [];
    const limiter = createRedisProviderRateLimiter({
      async eval(_script, keyCount, ...args) {
        calls.push({ keyCount, args });
        return [1, 0, "granted"];
      },
    }, {
      keyPrefix: "comic-ai:test",
    });

    const grant = await limiter.acquireSubmitPermit({
      providerName: "volcengine",
      modelCode: "seedance-i2v-pro",
      organizationId: "org-1",
      rpmLimit: 60,
      providerConcurrentLimit: 5,
      modelConcurrentLimit: 5,
      tenantConcurrentLimit: 5,
      leaseMs: 120_000,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(grant.granted, true);
    assert.equal(calls[0]?.keyCount, 6);
    assert.deepEqual(calls[0]?.args.slice(0, 6), [
      "comic-ai:test:rate:provider:volcengine:submit:rpm",
      "comic-ai:test:rate:model:seedance-i2v-pro:submit:rpm",
      "comic-ai:test:rate:tenant:org-1:submit:rpm",
      "comic-ai:test:concurrency:provider:volcengine:submit",
      "comic-ai:test:concurrency:model:seedance-i2v-pro:submit",
      "comic-ai:test:concurrency:tenant:org-1:submit",
    ]);
  });

  it("returns a retry delay when Redis reports an exhausted bucket", async () => {
    const limiter = createRedisProviderRateLimiter({
      async eval() {
        return [0, 3500, "rate:provider"];
      },
    }, {
      keyPrefix: "comic-ai:test",
    });

    const grant = await limiter.acquireSubmitPermit({
      providerName: "volcengine",
      modelCode: "seedance-i2v-pro",
      organizationId: "org-1",
      rpmLimit: 60,
      providerConcurrentLimit: 5,
      modelConcurrentLimit: 5,
      tenantConcurrentLimit: 5,
      leaseMs: 120_000,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(grant, {
      granted: false,
      retryAfterMs: 3500,
      reason: "rate:provider",
    });
  });

  it("acquires provider, model, and tenant poll permits with poll-scoped Redis keys", async () => {
    const calls: Array<{ keyCount: number; args: unknown[] }> = [];
    const limiter = createRedisProviderRateLimiter({
      async eval(_script, keyCount, ...args) {
        calls.push({ keyCount, args });
        return [1, 0, "granted"];
      },
    }, {
      keyPrefix: "comic-ai:test",
    });

    const grant = await limiter.acquirePollPermit({
      providerName: "volcengine",
      modelCode: "seedance-i2v-pro",
      organizationId: "org-1",
      rpmLimit: 60,
      providerConcurrentLimit: 5,
      modelConcurrentLimit: 40,
      tenantConcurrentLimit: 40,
      leaseMs: 60_000,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(grant.granted, true);
    assert.equal(calls[0]?.keyCount, 6);
    assert.deepEqual(calls[0]?.args.slice(0, 6), [
      "comic-ai:test:rate:provider:volcengine:poll:rpm",
      "comic-ai:test:rate:model:seedance-i2v-pro:poll:rpm",
      "comic-ai:test:rate:tenant:org-1:poll:rpm",
      "comic-ai:test:concurrency:provider:volcengine:poll",
      "comic-ai:test:concurrency:model:seedance-i2v-pro:poll",
      "comic-ai:test:concurrency:tenant:org-1:poll",
    ]);
    assert.equal(calls[0]?.args[7], 60_000);
  });

  it("acquires storage bucket finalize permits with storage-scoped Redis keys", async () => {
    const calls: Array<{ keyCount: number; args: unknown[] }> = [];
    const limiter = createRedisProviderRateLimiter({
      async eval(_script, keyCount, ...args) {
        calls.push({ keyCount, args });
        return [1, 0, "granted"];
      },
    }, {
      keyPrefix: "comic-ai:test",
    });

    const grant = await limiter.acquireFinalizePermit({
      bucket: "creator-test",
      organizationId: "org-1",
      mediaType: "video",
      leaseMs: 120_000,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(grant.granted, true);
    assert.equal(calls[0]?.keyCount, 6);
    assert.deepEqual(calls[0]?.args.slice(0, 6), [
      "comic-ai:test:rate:storage:creator-test:finalize",
      "comic-ai:test:rate:storage:creator-test:video:finalize",
      "comic-ai:test:rate:tenant:org-1:finalize",
      "comic-ai:test:concurrency:storage:creator-test:finalize",
      "comic-ai:test:concurrency:storage:creator-test:video:finalize",
      "comic-ai:test:concurrency:tenant:org-1:finalize",
    ]);
  });
});
