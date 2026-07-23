import assert from "node:assert/strict";
import { test } from "node:test";

import { generationQueueLoadScenarios } from "./benchmark-generation-queue-shards.mjs";

test("generation load scenarios match the 2000-user workloads", () => {
  assert.deepEqual(generationQueueLoadScenarios["60000"], { image: 40_000, video: 20_000 });
  assert.deepEqual(generationQueueLoadScenarios["80000"], { image: 60_000, video: 20_000 });
  assert.equal(Object.values(generationQueueLoadScenarios["80000"]).reduce((sum, count) => sum + count, 0), 80_000);
});
