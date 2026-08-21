import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSessionCache } from "../auth-session-cache.service.ts";
import { createAuthSession } from "../session.service.ts";

class MemoryRedis {
  values = new Map<string, string>();
  sets = new Map<string, Set<string>>();

  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); return "OK"; }
  async del(...keys: string[]) {
    let count = 0;
    for (const key of keys) {
      count += Number(this.values.delete(key));
      count += Number(this.sets.delete(key));
    }
    return count;
  }
  async sadd(key: string, ...members: string[]) {
    const values = this.sets.get(key) ?? new Set<string>();
    members.forEach((member) => values.add(member));
    this.sets.set(key, values);
    return members.length;
  }
  async smembers(key: string) { return [...(this.sets.get(key) ?? [])]; }
  async expire() { return 1; }
}

describe("auth session Redis cache", () => {
  it("keeps each token bound to its own user and session", async () => {
    const redis = new MemoryRedis();
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const first = await createAuthSession({ userId: "user-1", now, token: "token-1" });
    const second = await createAuthSession({ userId: "user-2", now, token: "token-2" });

    await cache.set(first.token, { session: first.session, user: { id: "user-1", phone: "13800000001" } }, now);
    await cache.set(second.token, { session: second.session, user: { id: "user-2", phone: "13800000002" } }, now);

    const firstCached = await cache.get("token-1", now);
    assert.equal(firstCached?.user.id, "user-1");
    assert.ok(firstCached?.session.expiresAt instanceof Date);
    assert.equal((await cache.get("token-2", now))?.user.id, "user-2");
    assert.equal(await cache.get("unknown-token", now), undefined);
  });

  it("rejects a polluted cache entry whose session user does not match the cached user", async () => {
    const redis = new MemoryRedis();
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });

    await cache.set(created.token, { session: created.session, user: { id: "user-2", phone: null } }, now);

    assert.equal(await cache.get(created.token, now), undefined);
  });

  it("denies a revoked token before any cached identity can be returned", async () => {
    const redis = new MemoryRedis();
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });
    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);

    await cache.denySession(created.token, created.session.expiresAt, now);

    assert.equal(await cache.get(created.token, now), null);
  });

  it("does not share a session read started before the token was denied", async () => {
    const redis = new MemoryRedis();
    let evalCalls = 0;
    let markFirstReadStarted!: () => void;
    let releaseFirstRead!: () => void;
    const firstReadStarted = new Promise<void>((resolve) => {
      markFirstReadStarted = resolve;
    });
    const firstReadGate = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    redis.eval = async (_script: string, _numberOfKeys: number, ...keys: string[]) => {
      evalCalls += 1;
      const denied = await redis.get(keys[0]!);
      const raw = await redis.get(keys[1]!);
      if (evalCalls === 1) {
        markFirstReadStarted();
        await firstReadGate;
      }
      if (denied) return [1];
      return raw ? [2, raw] : [0];
    };
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });
    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);

    const readBeforeDeny = cache.get(created.token, now);
    await firstReadStarted;
    await cache.denySession(created.token, created.session.expiresAt, now);
    const readAfterDeny = cache.get(created.token, now);
    releaseFirstRead();

    await readBeforeDeny;
    assert.equal(await readAfterDeny, null);
    assert.equal(evalCalls, 2);
  });

  it("does not retain a session read started while the token is being denied", async () => {
    const redis = new MemoryRedis();
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });
    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);

    let markDenyWriteStarted!: () => void;
    let releaseDenyWrite!: () => void;
    let markReadStarted!: () => void;
    let releaseRead!: () => void;
    const denyWriteStarted = new Promise<void>((resolve) => { markDenyWriteStarted = resolve; });
    const denyWriteGate = new Promise<void>((resolve) => { releaseDenyWrite = resolve; });
    const readStarted = new Promise<void>((resolve) => { markReadStarted = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });
    const rawSet = redis.set.bind(redis);
    redis.set = async (key: string, value: string) => {
      markDenyWriteStarted();
      await denyWriteGate;
      return rawSet(key, value);
    };
    redis.eval = async (_script: string, _numberOfKeys: number, ...keys: string[]) => {
      const denied = await redis.get(keys[0]!);
      const raw = await redis.get(keys[1]!);
      markReadStarted();
      await readGate;
      if (denied) return [1];
      return raw ? [2, raw] : [0];
    };

    const deny = cache.denySession(created.token, created.session.expiresAt, now);
    await denyWriteStarted;
    const readDuringDeny = cache.get(created.token, now);
    await readStarted;
    releaseDenyWrite();
    await deny;
    const readAfterDeny = cache.get(created.token, now);
    releaseRead();

    assert.equal(await readDuringDeny, null);
    assert.equal(await readAfterDeny, null);
  });

  it("checks independent session cache keys concurrently", async () => {
    const redis = new MemoryRedis();
    let activeReads = 0;
    let maximumActiveReads = 0;
    redis.get = async function get(key: string) {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeReads -= 1;
      return this.values.get(key) ?? null;
    };
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });

    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);
    maximumActiveReads = 0;
    assert.equal((await cache.get(created.token, now))?.user.id, "user-1");
    assert.equal(maximumActiveReads, 2);
  });

  it("uses the atomic Redis read when the client supports scripts", async () => {
    const redis = new MemoryRedis();
    let evalCalls = 0;
    redis.eval = async (_script: string, numberOfKeys: number, ...keys: string[]) => {
      evalCalls += 1;
      assert.equal(numberOfKeys, 2);
      assert.equal(keys.length, 2);
      assert.match(_script, /type\(member\) == 'table'/);
      const raw = await redis.get(keys[1]!);
      return raw ? [2, raw] : [0];
    };
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });

    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);

    assert.equal((await cache.get(created.token, now))?.user.id, "user-1");
    assert.equal(evalCalls, 1);
  });

  it("shares only concurrent reads for the same session token", async () => {
    const redis = new MemoryRedis();
    let evalCalls = 0;
    redis.eval = async (_script: string, _numberOfKeys: number, ...keys: string[]) => {
      evalCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      const raw = await redis.get(keys[1]!);
      return raw ? [2, raw] : [0];
    };
    const cache = createAuthSessionCache(redis);
    const now = new Date("2026-07-11T10:00:00.000Z");
    const created = await createAuthSession({ userId: "user-1", now, token: "token-1" });

    await cache.set(created.token, { session: created.session, user: { id: "user-1", phone: null } }, now);

    const identities = await Promise.all([
      cache.get(created.token, now),
      cache.get(created.token, now),
      cache.get(created.token, now),
    ]);
    assert.deepEqual(identities.map((identity) => identity?.user.id), ["user-1", "user-1", "user-1"]);
    assert.equal(evalCalls, 1);

    assert.equal((await cache.get(created.token, now))?.user.id, "user-1");
    assert.equal(evalCalls, 2);

    const [validIdentity, expiredIdentity] = await Promise.all([
      cache.get(created.token, now),
      cache.get(created.token, new Date(created.session.expiresAt.getTime() + 1)),
    ]);
    assert.equal(validIdentity?.user.id, "user-1");
    assert.equal(expiredIdentity, undefined);
    assert.equal(evalCalls, 3);
  });
});
