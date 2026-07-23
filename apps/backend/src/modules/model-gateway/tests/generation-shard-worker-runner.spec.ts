import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createGenerationShardWorkerRunner,
  selectOwnedShards,
  type GenerationShardWorkerSpec,
} from "../generation-shard-worker-runner.ts";

function spec(queueName: string): GenerationShardWorkerSpec {
  return {
    queueName,
    mediaType: "image",
    stage: "submit",
    routeCode: "r1",
    shardNo: 0,
  };
}

describe("generation shard worker runner", () => {
  it("selects deterministic, unique shards and enforces the per-process bound", () => {
    const selected = selectOwnedShards(
      [spec("generation-image-submit-r1-002"), spec("generation-image-submit-r1-001"), spec("generation-image-submit-r1-001")],
      { maxQueuesPerProcess: 1, processIndex: 0, processCount: 2 },
    );
    assert.deepEqual(selected.map((item) => item.queueName), ["generation-image-submit-r1-001"]);
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
});
