import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGenerationShardWorkerRunner,
  prioritizeGenerationShards,
  selectOwnedShards,
  type GenerationShardWorkerSpec,
} from "../generation-shard-worker-runner.ts";

function spec(
  queueName: string,
  input: { admittedCount?: number; oldestAdmittedAtMs?: number | null; runnableCount?: number } = {},
): GenerationShardWorkerSpec {
  return {
    queueName,
    mediaType: "image",
    stage: "submit",
    routeCode: "r1",
    shardNo: 0,
    admittedCount: input.admittedCount,
    oldestAdmittedAtMs: input.oldestAdmittedAtMs,
    runnableCount: input.runnableCount,
  };
}

describe("generation shard worker runner", () => {
  it("provides a global priority order for lease candidates", () => {
    const prioritized = prioritizeGenerationShards([
      spec("generation-image-submit-r1-000"),
      spec("generation-image-submit-r2-000", { admittedCount: 1, oldestAdmittedAtMs: 2_000 }),
      spec("generation-image-submit-r3-000", { admittedCount: 1, oldestAdmittedAtMs: 1_000 }),
    ]);
    assert.deepEqual(prioritized.map((item) => item.queueName), [
      "generation-image-submit-r3-000",
      "generation-image-submit-r2-000",
      "generation-image-submit-r1-000",
    ]);
  });

  it("selects deterministic, unique shards and enforces the per-process bound", () => {
    const selected = selectOwnedShards(
      [spec("generation-image-submit-r1-002"), spec("generation-image-submit-r1-001"), spec("generation-image-submit-r1-001")],
      { maxQueuesPerProcess: 1, processIndex: 0, processCount: 1 },
    );
    assert.deepEqual(selected.map((item) => item.queueName), ["generation-image-submit-r1-001"]);
  });

  it("prioritizes shards with queued work and serves the oldest work first", () => {
    const selected = selectOwnedShards(
      [
        spec("generation-image-submit-r1-000"),
        spec("generation-image-submit-r2-000", { admittedCount: 2, oldestAdmittedAtMs: 2_000 }),
        spec("generation-image-submit-r3-000", { admittedCount: 1, oldestAdmittedAtMs: 1_000 }),
        spec("generation-image-submit-r4-000"),
      ],
      { maxQueuesPerProcess: 2, processIndex: 0, processCount: 1 },
    );

    assert.deepEqual(selected.map((item) => item.queueName), [
      "generation-image-submit-r3-000",
      "generation-image-submit-r2-000",
    ]);
  });

  it("prioritizes runnable jobs over older delayed or publishing assignments", () => {
    const prioritized = prioritizeGenerationShards([
      spec("generation-image-submit-r1-000", {
        admittedCount: 20,
        oldestAdmittedAtMs: 1_000,
        runnableCount: 0,
      }),
      spec("generation-image-submit-r2-000", {
        admittedCount: 1,
        oldestAdmittedAtMs: 2_000,
        runnableCount: 1,
      }),
    ]);
    assert.deepEqual(prioritized.map((item) => item.queueName), [
      "generation-image-submit-r2-000",
      "generation-image-submit-r1-000",
    ]);
  });

  it("balances active shards across process capacity before assigning idle shards", () => {
    const shards = [
      spec("generation-image-submit-r1-000", { admittedCount: 1, oldestAdmittedAtMs: 1_000 }),
      spec("generation-image-submit-r2-000"),
      spec("generation-image-submit-r3-000", { admittedCount: 1, oldestAdmittedAtMs: 2_000 }),
    ];
    const selected = [0, 1].flatMap((processIndex) => selectOwnedShards(
      shards,
      { maxQueuesPerProcess: 1, processIndex, processCount: 2 },
    ));

    assert.deepEqual(selected.map((item) => item.queueName).sort(), [
      "generation-image-submit-r1-000",
      "generation-image-submit-r3-000",
    ]);
  });

  it("creates workers for discovered shards, applies a 5/s default limiter, and closes removed shards", async () => {
    let discovered = [spec("generation-image-submit-r1-000"), spec("generation-image-submit-r1-001")];
    const created: Array<{ queueName: string; rateLimitMax: number; rateLimitDurationMs: number }> = [];
    const closed: string[] = [];
    const runner = createGenerationShardWorkerRunner({
      discover: async () => discovered,
      maxQueuesPerProcess: 16,
      refreshIntervalMs: 0,
      createWorker: (item) => {
        created.push(item);
        return {
          async close() {
            closed.push(item.queueName);
          },
        };
      },
    });

    await runner.start();
    assert.deepEqual(runner.activeQueueNames(), [
      "generation-image-submit-r1-000",
      "generation-image-submit-r1-001",
    ]);
    assert.deepEqual(created.map((item) => [item.rateLimitMax, item.rateLimitDurationMs]), [[5, 1000], [5, 1000]]);

    discovered = [spec("generation-image-submit-r1-001"), spec("generation-image-submit-r1-002")];
    await runner.refresh();
    assert.deepEqual(runner.activeQueueNames(), [
      "generation-image-submit-r1-001",
      "generation-image-submit-r1-002",
    ]);
    assert.deepEqual(closed, ["generation-image-submit-r1-000"]);

    await runner.close();
    assert.deepEqual(closed.sort(), [
      "generation-image-submit-r1-000",
      "generation-image-submit-r1-001",
      "generation-image-submit-r1-002",
    ]);
  });

  it("coalesces overlapping refresh calls so discovery cannot create duplicate workers", async () => {
    let release!: () => void;
    const discover = () => new Promise<GenerationShardWorkerSpec[]>((resolve) => {
      release = () => resolve([spec("generation-image-submit-r1-000")]);
    });
    let createCount = 0;
    const runner = createGenerationShardWorkerRunner({
      discover,
      maxQueuesPerProcess: 1,
      refreshIntervalMs: 0,
      createWorker: () => {
        createCount += 1;
        return { async close() {} };
      },
    });
    const first = runner.refresh();
    const second = runner.refresh();
    release();
    await Promise.all([first, second]);
    assert.equal(createCount, 1);
    await runner.close();
  });

  it("starts newly active workers without waiting for removed workers to drain", async () => {
    let discovered = [spec("generation-image-submit-r1-000")];
    let finishClosing!: () => void;
    const runner = createGenerationShardWorkerRunner({
      discover: async () => discovered,
      maxQueuesPerProcess: 1,
      refreshIntervalMs: 0,
      createWorker: (item) => ({
        async close() {
          if (item.queueName === "generation-image-submit-r1-000") {
            await new Promise<void>((resolve) => {
              finishClosing = resolve;
            });
          }
        },
      }),
    });
    await runner.start();
    discovered = [spec("generation-image-submit-r2-000", { admittedCount: 1 })];

    await runner.refresh();
    assert.deepEqual(runner.activeQueueNames(), ["generation-image-submit-r2-000"]);

    finishClosing();
    await runner.close();
  });

  it("closes active workers when lease discovery cannot confirm ownership", async () => {
    let failDiscovery = false;
    let closed = 0;
    const runner = createGenerationShardWorkerRunner({
      discover: async () => {
        if (failDiscovery) throw new Error("lease renewal failed");
        return [spec("generation-image-submit-r1-000", { admittedCount: 1 })];
      },
      maxQueuesPerProcess: 1,
      refreshIntervalMs: 0,
      closeWorkersOnDiscoveryFailure: true,
      createWorker: () => ({ async close() { closed += 1; } }),
    });
    await runner.start();
    failDiscovery = true;

    await assert.rejects(() => runner.refresh(), /lease renewal failed/);
    assert.deepEqual(runner.activeQueueNames(), []);
    assert.equal(closed, 1);
    await runner.close();
  });

  it("keeps active workers and reports periodic discovery failures", async () => {
    const timers: Array<() => void> = [];
    const closed: string[] = [];
    const errors: string[] = [];
    let failDiscovery = false;
    const runner = createGenerationShardWorkerRunner({
      maxQueuesPerProcess: 1,
      refreshIntervalMs: 10,
      setInterval(run) {
        timers.push(run);
        return timers.length as unknown as ReturnType<typeof setInterval>;
      },
      clearInterval() {},
      async discover() {
        if (failDiscovery) throw new Error("redis_temporarily_unavailable");
        return [{ queueName: "queue-a", mediaType: "image", stage: "submit", routeCode: "route", shardNo: 0 }];
      },
      createWorker(spec) {
        return { async close() { closed.push(spec.queueName); } };
      },
      onRefreshError(error) {
        errors.push(error instanceof Error ? error.message : String(error));
      },
    });

    await runner.start();
    failDiscovery = true;
    timers[0]();
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(runner.activeQueueNames(), ["queue-a"]);
    assert.deepEqual(closed, []);
    assert.deepEqual(errors, ["redis_temporarily_unavailable"]);
    await runner.close();
  });
});
