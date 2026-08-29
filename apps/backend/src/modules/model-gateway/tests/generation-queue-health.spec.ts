import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGenerationQueueHealthService } from "../generation-queue-health.service.ts";
import type { GenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation queue health service", () => {
  it("reports healthy Redis and BullMQ queue counts", async () => {
    const closedQueues: string[] = [];
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() {
          return "PONG";
        },
        async get() {
          return new Date().toISOString();
        },
      },
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts(...statuses) {
          assert.deepEqual(statuses, [
            "waiting",
            "delayed",
            "active",
            "completed",
            "failed",
            "paused",
          ]);
          return {
            waiting: queueName === "generation-submit-video" ? 8 : 0,
            delayed: queueName === "generation-poll-video" ? 12 : 0,
            active: queueName === "generation-finalize-artifact" ? 3 : 0,
            completed: 5,
            failed: 0,
            ...(queueName === "generation-dead-letter" ? { waiting: 2 } : {}),
            paused: 0,
          };
        },
        async getWorkersCount() {
          return queueName === "generation-dead-letter" ? 0 : 1;
        },
        async getJobs(types, start, end, asc) {
          if (types[0] === "waiting" && types[1] === "delayed" && end === 0) {
            return [{
              id: `oldest-${queueName}`,
              name: "generation.pending",
              timestamp: Date.now(),
            }];
          }
          assert.deepEqual(types, queueName === "generation-dead-letter"
            ? ["waiting", "delayed", "failed"]
            : ["failed"]);
          assert.equal(start, 0);
          assert.equal(end, 4);
          assert.equal(asc, false);
          return queueName === "generation-dead-letter"
            ? [
                {
                  id: "failed-job-1",
                  name: "generation.video.poll",
                  data: {
                    taskId: "task-1",
                    failureCode: "provider_output_persist_failed",
                    failedReason: "provider_timeout",
                  },
                  failedReason: null,
                  attemptsMade: 3,
                  timestamp: 1_717_200_000_000,
                  processedOn: 1_717_200_001_000,
                  finishedOn: 1_717_200_002_000,
                },
              ]
            : [];
        },
        async close() {
          closedQueues.push(queueName);
        },
      }),
    });

    const health = await service.inspect({ failedSampleSize: 5 });

    assert.equal(health.status, "degraded");
    assert.equal(health.redis.status, "healthy");
    assert.equal(health.queues.length, 7);
    assert.deepEqual(
      health.queues.map((queue) => queue.name),
      [
        "generation-submit-image",
        "generation-submit-video",
        "generation-poll-image",
        "generation-poll-video",
        "generation-poll-audio",
        "generation-finalize-artifact",
        "generation-dead-letter",
      ],
    );
    assert.equal(health.queues[1].counts.waiting, 8);
    assert.equal(health.queues[1].workerCount, 1);
    assert.equal(health.queues[3].counts.delayed, 12);
    assert.equal(health.queues[5].counts.active, 3);
    assert.equal(health.queues[6].failedJobs[0].failureReason, "provider_timeout");
    assert.equal(health.queues[6].status, "degraded");
    assert.match(health.queues[6].error ?? "", /dead_letter_count:2/);
    assert.deepEqual(health.queues[6].failedJobs[0].data, {
      taskId: "task-1",
      failureCode: "provider_output_persist_failed",
      failedReason: "provider_timeout",
    });
    assert.deepEqual(closedQueues.sort(), health.queues.map((queue) => queue.name).sort());
  });

  it("marks the snapshot degraded when one queue cannot be inspected", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() {
          return "PONG";
        },
        async get() {
          return new Date().toISOString();
        },
      },
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          if (queueName === "generation-poll-video") {
            throw new Error("bullmq_count_failed");
          }
          return {
            waiting: 0,
            delayed: 0,
            active: 0,
            completed: 0,
            failed: 0,
            paused: 0,
          };
        },
        async getJobs() {
          return [];
        },
        async close() {},
      }),
    });

    const health = await service.inspect();

    assert.equal(health.status, "degraded");
    assert.equal(health.redis.status, "healthy");
    const pollQueue = health.queues.find((queue) => queue.name === "generation-poll-video");
    assert.equal(pollQueue?.status, "unavailable");
    assert.equal(pollQueue?.error, "bullmq_count_failed");
  });

  it("marks a queue degraded when pending jobs exceed age or count thresholds", async () => {
    const now = Date.now();
    const service = createGenerationQueueHealthService({
      config: {
        ...testConfig(),
        health: {
          waitingCountThreshold: 10,
          failedCountThreshold: 5,
          oldestJobAgeMs: 60_000,
        },
      },
      redis: {
        async ping() { return "PONG"; },
        async get() { return new Date().toISOString(); },
      },
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          return queueName === "generation-submit-image"
            ? { waiting: 10, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 }
            : { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
        },
        async getJobs(types) {
          return types.includes("waiting")
            ? [{ id: "oldest", name: "generation.image.submit", timestamp: now - 120_000 }]
            : [];
        },
        async close() {},
      }),
    });

    const health = await service.inspect();
    const imageQueue = health.queues.find((queue) => queue.role === "submit_image");

    assert.equal(health.status, "degraded");
    assert.equal(imageQueue?.status, "degraded");
    assert.match(imageQueue?.error ?? "", /waiting_count:10/);
    assert.match(imageQueue?.error ?? "", /oldest_pending_age_ms:/);
  });

  it("marks a work queue degraded when BullMQ has no registered consumer", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return new Date().toISOString(); },
      },
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
        },
        async getWorkersCount() {
          return queueName === "generation-submit-image" ? 0 : 1;
        },
        async getJobs() { return []; },
        async close() {},
      }),
    });

    const health = await service.inspect();
    const imageQueue = health.queues.find((queue) => queue.role === "submit_image");

    assert.equal(health.status, "degraded");
    assert.equal(imageQueue?.workerCount, 0);
    assert.equal(imageQueue?.status, "degraded");
    assert.match(imageQueue?.error ?? "", /worker_count:0/);
  });

  it("marks the snapshot degraded when the outbox dispatcher heartbeat is missing", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return null; },
      },
      queueFactory: healthyQueue,
    });

    const health = await service.inspect();

    assert.equal(health.status, "degraded");
    assert.equal(health.outboxDispatcher.status, "unavailable");
    assert.equal(health.outboxDispatcher.error, "dispatcher_heartbeat_missing");
  });

  it("marks the snapshot degraded when the outbox dispatcher heartbeat is stale", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return "2020-01-01T00:00:00.000Z"; },
      },
      queueFactory: healthyQueue,
    });

    const health = await service.inspect();

    assert.equal(health.status, "degraded");
    assert.equal(health.outboxDispatcher.status, "unavailable");
    assert.match(health.outboxDispatcher.error ?? "", /dispatcher_heartbeat_stale:/);
  });

  it("reports unavailable when Redis ping fails and skips queue inspection", async () => {
    let queueFactoryCalled = false;
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() {
          throw new Error("redis_down");
        },
        async get() {
          throw new Error("redis_down");
        },
      },
      queueFactory: () => {
        queueFactoryCalled = true;
        throw new Error("queue_factory_should_not_be_called");
      },
    });

    const health = await service.inspect();

    assert.equal(health.status, "unavailable");
    assert.equal(health.redis.status, "unavailable");
    assert.equal(health.redis.error, "redis_down");
    assert.deepEqual(health.queues, []);
    assert.equal(queueFactoryCalled, false);
  });

  it("does not let a Redis timeout while closing a queue turn health into a server error", async () => {
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return new Date().toISOString(); },
      },
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
        },
        async getJobs() { return []; },
        async close() { throw new Error("Command timed out"); },
      }),
    });

    const health = await service.inspect();

    assert.equal(health.redis.status, "healthy");
    assert.equal(health.queues.length, 7);
    assert.equal(health.queues.every((queue) => queue.status === "healthy"), true);
  });

  it("inspects dynamically discovered shards and keeps the dead-letter queue visible", async () => {
    const queueNames: string[] = [];
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return new Date().toISOString(); },
      },
      queueDiscovery: async () => [
        { role: "submit_image", name: "generation-image-submit-r1-000" },
        { role: "submit_image", name: "generation-image-submit-r1-001" },
      ],
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          queueNames.push(queueName);
          return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
        },
        async getJobs() { return []; },
        async close() {},
      }),
    });

    const health = await service.inspect();
    assert.deepEqual(health.queues.map((queue) => queue.name), [
      "generation-image-submit-r1-000",
      "generation-image-submit-r1-001",
      "generation-dead-letter",
    ]);
    assert.deepEqual(queueNames.sort(), health.queues.map((queue) => queue.name).sort());
  });

  it("falls back to configured queues when no active shards are discovered", async () => {
    const queueNames: string[] = [];
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() { return "PONG"; },
        async get() { return new Date().toISOString(); },
      },
      queueDiscovery: async () => [],
      queueFactory: (queueName) => ({
        name: queueName,
        async getJobCounts() {
          queueNames.push(queueName);
          return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
        },
        async getJobs() { return []; },
        async close() {},
      }),
    });

    const health = await service.inspect();
    assert.deepEqual(health.queues.map((queue) => queue.name), [
      "generation-submit-image",
      "generation-submit-video",
      "generation-poll-image",
      "generation-poll-video",
      "generation-poll-audio",
      "generation-finalize-artifact",
      "generation-dead-letter",
    ]);
    assert.deepEqual(queueNames.sort(), health.queues.map((queue) => queue.name).sort());
  });
});

function testConfig(): GenerationQueueConfig {
  return {
    redisUrl: "redis://127.0.0.1:6379/0",
    queuePrefix: "test-prefix",
    workersEnabled: true,
    outboxDispatcherEnabled: true,
    health: {
      waitingCountThreshold: 1_000,
      failedCountThreshold: 100,
      oldestJobAgeMs: 300_000,
    },
    queues: {
      submitImage: "generation-submit-image",
      submitVideo: "generation-submit-video",
      pollImage: "generation-poll-image",
      pollVideo: "generation-poll-video",
      pollAudio: "generation-poll-audio",
      finalizeArtifact: "generation-finalize-artifact",
      deadLetter: "generation-dead-letter",
    },
    finalize: {
      video: { concurrency: 40, limiter: { max: 40, durationMs: 1000 } },
      image: { concurrency: 100, limiter: { max: 100, durationMs: 1000 } },
    },
    submit: {
      image: {
        concurrency: 20_000,
        userConcurrencyLimit: 20,
        limiter: { max: 20_000, durationMs: 1000 },
      },
      video: {
        concurrency: 10_000,
        userConcurrencyLimit: 10,
        limiter: { max: 10_000, durationMs: 1000 },
      },
    },
    artifactUpload: {
      retryAttempts: 3,
      retryDelayMs: 1000,
    },
    outbox: {
      dispatchBatchSize: 20_000,
      dispatchIntervalMs: 1000,
      retryDelayMs: 30_000,
      membershipQuantum: 2,
    },
    repair: {
      staleDispatchMs: 120_000,
    },
    retry: {
      submit: { attempts: 3, backoffMs: 5_000 },
      poll: { attempts: 3, backoffMs: 5_000 },
      finalize: { attempts: 3, backoffMs: 5_000 },
    },
    poll: {
      image: {
        concurrency: 40,
        limiter: { max: 40, durationMs: 1000 },
        intervalMs: 30_000,
        maxAttempts: 120,
      },
      video: {
        concurrency: 40,
        limiter: { max: 40, durationMs: 1000 },
        intervalMs: 5000,
        maxAttempts: 120,
      },
      audio: {
        concurrency: 40,
        limiter: { max: 40, durationMs: 1000 },
        intervalMs: 30_000,
        maxAttempts: 120,
      },
    },
  };
}

function healthyQueue(queueName: string) {
  return {
    name: queueName,
    async getJobCounts() {
      return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, paused: 0 };
    },
    async getWorkersCount() { return queueName === "generation-dead-letter" ? 0 : 1; },
    async getJobs() { return []; },
    async close() {},
  };
}
