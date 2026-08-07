import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasAgentShardQueueName,
  loadCanvasAgentShardConfig,
} from "../canvas-agent-shard.config.ts";

test("Canvas Agent shard configuration keeps a 16-shard ceiling", () => {
  assert.deepEqual(loadCanvasAgentShardConfig({}), {
    enabled: true,
    baseQueueName: "canvas-agent",
    shardCapacity: 100,
    maxActiveShards: 16,
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
  assert.throws(
    () => loadCanvasAgentShardConfig({ CANVAS_AGENT_SHARD_COUNT: "17" }),
    /CANVAS_AGENT_SHARD_COUNT/,
  );
  assert.throws(() => canvasAgentShardQueueName("canvas-agent", -1), /invalid_canvas_agent_shard_id/);
});
