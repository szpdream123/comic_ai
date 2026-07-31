import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import {
  isRetryableRedisAvailabilityError,
  runWithRedisStartupRetry,
  waitForRedisReady,
} from "../redis-readiness.ts";

class FakeRedis extends EventEmitter {
  status = "connecting";

  ready() {
    this.status = "ready";
    this.emit("ready");
  }
}

describe("Redis readiness", () => {
  it("waits through a transient connection reset until ready", async () => {
    const redis = new FakeRedis();
    const waiting = waitForRedisReady(redis, { timeoutMs: 100 });
    redis.emit("error", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
    redis.ready();
    await waiting;
  });

  it("retries command timeouts with bounded backoff", async () => {
    const redis = new FakeRedis();
    redis.status = "ready";
    let attempts = 0;
    const result = await runWithRedisStartupRetry({
      redis,
      timeoutMs: 200,
      maxAttempts: 3,
      baseDelayMs: 1,
      async run() {
        attempts += 1;
        if (attempts < 3) throw new Error("Command timed out");
        return "ready";
      },
    });
    assert.equal(result, "ready");
    assert.equal(attempts, 3);
    assert.equal(isRetryableRedisAvailabilityError(new Error("Command timed out")), true);
  });

  it("fails immediately for authentication errors", async () => {
    const redis = new FakeRedis();
    const waiting = waitForRedisReady(redis, { timeoutMs: 100 });
    redis.emit("error", new Error("WRONGPASS invalid username-password pair"));
    await assert.rejects(waiting, /WRONGPASS/);
  });

  it("fails when Redis never becomes ready", async () => {
    const redis = new FakeRedis();
    await assert.rejects(
      waitForRedisReady(redis, { timeoutMs: 10 }),
      (error: unknown) => (error as { code?: string }).code === "REDIS_READY_TIMEOUT",
    );
  });
});
