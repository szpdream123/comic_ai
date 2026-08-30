import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGenerationQueueHealthService } from "../generation-queue-health.service.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation queue health service", () => {
  it("inspects all nine fixed generation queues", async () => {
    const closedQueues: string[] = [];
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: healthyRedis,
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts(...statuses) {
          assert.deepEqual(statuses, ["waiting", "delayed", "active", "completed", "failed", "paused"]);
          return {
            waiting: queueName === "generation-submit-002" ? 8 : 0,
            delayed: queueName === "generation-poll-003" ? 12 : 0,
            active: queueName === "generation-result-001" ? 3 : 0,
            completed: 5,
            failed: 0,
            paused: 0,
          };
        },
        async getJobs(types, _start, end) {
          if (types.includes("waiting") && end === 0) {
            return [{ id: `oldest-${queueName}`, name: "generation.pending", timestamp: Date.now() }];
          }
          return [];
        },
        async close() { closedQueues.push(queueName); },
      }),
    });

    const health = await service.inspect();

    assert.equal(health.status, "healthy");
    assert.deepEqual(health.queues.map((queue) => queue.name), [
      "generation-submit-001", "generation-submit-002", "generation-submit-003",
      "generation-poll-001", "generation-poll-002", "generation-poll-003",
      "generation-result-001", "generation-result-002", "generation-result-003",
    ]);
    assert.equal(health.queues[1].counts.waiting, 8);
    assert.equal(health.queues[5].counts.delayed, 12);
    assert.equal(health.queues[6].counts.active, 3);
    assert.deepEqual(closedQueues.sort(), health.queues.map((queue) => queue.name).sort());
  });

  it("marks the snapshot degraded when a fixed queue cannot be inspected", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: healthyRedis,
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          if (queueName === "generation-poll-002") throw new Error("bullmq_count_failed");
          return emptyCounts();
        },
        async getJobs() { return []; },
        async close() {},
      }),
    });

    const health = await service.inspect();
    const pollQueue = health.queues.find((queue) => queue.name === "generation-poll-002");

    assert.equal(health.status, "degraded");
    assert.equal(pollQueue?.status, "unavailable");
    assert.equal(pollQueue?.error, "bullmq_count_failed");
  });

  it("marks a fixed queue degraded when pending jobs reach its health threshold", async () => {
    const service = createGenerationQueueHealthService({
      config: {
        ...testConfig(),
        health: { waitingCountThreshold: 10, failedCountThreshold: 5, oldestJobAgeMs: 60_000 },
      },
      redis: healthyRedis,
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          return queueName === "generation-submit-001"
            ? { ...emptyCounts(), waiting: 10 }
            : emptyCounts();
        },
        async getJobs(types) {
          return types.includes("waiting")
            ? [{ id: "oldest", name: "generation.submit", timestamp: Date.now() - 120_000 }]
            : [];
        },
        async close() {},
      }),
    });

    const health = await service.inspect();
    const queue = health.queues.find((item) => item.name === "generation-submit-001");

    assert.equal(health.status, "degraded");
    assert.match(queue?.error ?? "", /waiting_count:10/);
    assert.match(queue?.error ?? "", /oldest_pending_age_ms:/);
  });

  it("reports unavailable when Redis is unavailable without opening any queue", async () => {
    let queueFactoryCalled = false;
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { throw new Error("redis_down"); },
        async get() { throw new Error("redis_down"); },
      },
      queueFactory: () => {
        queueFactoryCalled = true;
        throw new Error("queue_factory_should_not_be_called");
      },
    });

    const health = await service.inspect();

    assert.equal(health.status, "unavailable");
    assert.equal(health.redis.error, "redis_down");
    assert.deepEqual(health.queues, []);
    assert.equal(queueFactoryCalled, false);
  });
});

function testConfig() {
  return loadGenerationQueueConfig({
    BULLMQ_WORKERS_ENABLED: "true",
    BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true",
    GENERATION_SUBMIT_QUEUE_COUNT: "3",
    GENERATION_POLL_QUEUE_COUNT: "3",
    GENERATION_RESULT_QUEUE_COUNT: "3",
  });
}

const healthyRedis = {
  async ping() { return "PONG"; },
  async get() { return new Date(Date.now() - 1_000).toISOString(); },
};

function emptyCounts() {
  return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
}
