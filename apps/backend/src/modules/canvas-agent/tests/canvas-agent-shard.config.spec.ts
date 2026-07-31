import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasAgentShardQueueName,
  loadCanvasAgentShardConfig,
} from "../canvas-agent-shard.config.ts";

test("Canvas Agent shard configuration uses the 300-concurrency baseline", () => {
  assert.deepEqual(loadCanvasAgentShardConfig({}), {
    enabled: true,
    baseQueueName: "canvas-agent",
    minimumShardCount: 16,
    shardCapacity: 100,
    maxActiveShards: 32,
    workerConcurrency: 20,
    workerTotalConcurrency: 320,
    discoveryIntervalMs: 10_000,
  });
});

test("Canvas Agent shard queues have stable names", () => {
  assert.equal(canvasAgentShardQueueName("canvas-agent", 0), "canvas-agent-shard-000");
  assert.equal(canvasAgentShardQueueName("canvas-agent", 16), "canvas-agent-shard-016");
  assert.equal(canvasAgentShardQueueName("canvas-agent", 0, false), "canvas-agent");
});

test("Canvas Agent shard configuration rejects invalid values", () => {
  assert.throws(
    () => loadCanvasAgentShardConfig({ CANVAS_AGENT_SHARD_CAPACITY: "0" }),
    /CANVAS_AGENT_SHARD_CAPACITY/,
  );
  assert.throws(
    () => loadCanvasAgentShardConfig({ CANVAS_AGENT_SHARDING_ENABLED: "yes" }),
    /CANVAS_AGENT_SHARDING_ENABLED/,
  );
  assert.throws(() => canvasAgentShardQueueName("canvas-agent", -1), /invalid_canvas_agent_shard_id/);
});
