import assert from "node:assert/strict";
import test from "node:test";

import { selectCanvasAgentShardId } from "../canvas-agent-shard.service.ts";

test("Canvas Agent assigns new conversations to the least loaded shard below capacity", () => {
  assert.equal(selectCanvasAgentShardId([
    { shardId: 0, activeTaskCount: 100 },
    { shardId: 1, activeTaskCount: 40 },
    { shardId: 2, activeTaskCount: 40 },
  ], { shardCapacity: 100, maxActiveShards: 256 }), 1);
});

test("Canvas Agent creates the next shard after all current shards reach 100 active tasks", () => {
  assert.equal(selectCanvasAgentShardId([
    { shardId: 0, activeTaskCount: 100 },
    { shardId: 1, activeTaskCount: 101 },
    { shardId: 15, activeTaskCount: 100 },
  ], { shardCapacity: 100, maxActiveShards: 256 }), 16);
});

test("Canvas Agent uses the least loaded existing shard after reaching the shard limit", () => {
  assert.equal(selectCanvasAgentShardId([
    { shardId: 0, activeTaskCount: 105 },
    { shardId: 1, activeTaskCount: 100 },
  ], { shardCapacity: 100, maxActiveShards: 2 }), 1);
});
