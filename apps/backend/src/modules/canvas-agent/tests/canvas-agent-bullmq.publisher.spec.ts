import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_AGENT_WAKEUP_RETRY_OPTIONS,
  assertCanvasAgentQueueName,
  canvasAgentRedisConnectionFromUrl,
  canvasAgentWakeupJobId,
} from "../canvas-agent-bullmq.publisher.ts";

test("Canvas Agent wakeup job ids are deterministic and contain no BullMQ separators", () => {
  const first = canvasAgentWakeupJobId("canvas-agent:task-1:created");
  const second = canvasAgentWakeupJobId("canvas-agent:task-1:created");

  assert.equal(first, second);
  assert.doesNotMatch(first, /:/);
  assert.notEqual(first, canvasAgentWakeupJobId("canvas-agent:task-2:created"));
});

test("Canvas Agent wakeups retry quickly without changing generation queue policy", () => {
  assert.deepEqual(CANVAS_AGENT_WAKEUP_RETRY_OPTIONS, {
    attempts: 300,
    backoff: { type: "fixed", delay: 1_000 },
  });
});

test("Canvas Agent BullMQ configuration validates queue names and REDIS_URL", () => {
  assert.equal(assertCanvasAgentQueueName("canvas-agent"), "canvas-agent");
  assert.throws(() => assertCanvasAgentQueueName("Canvas Agent"), /invalid_canvas_agent_queue_name/);
  assert.deepEqual(
    canvasAgentRedisConnectionFromUrl("rediss://worker:secret@example.test:6380/2"),
    {
      host: "example.test",
      port: 6380,
      username: "worker",
      password: "secret",
      db: 2,
      tls: {},
    },
  );
});
