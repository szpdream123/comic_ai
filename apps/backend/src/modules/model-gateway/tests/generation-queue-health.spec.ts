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
            failed: queueName === "generation-dead-letter" ? 2 : 0,
            paused: 0,
          };
        },
        async getJobs(types, start, end, asc) {
          assert.deepEqual(types, ["failed"]);
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
                  },
                  failedReason: "provider_timeout",
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

    assert.equal(health.status, "healthy");
    assert.equal(health.redis.status, "healthy");
    assert.equal(health.queues.length, 5);
    assert.deepEqual(
      health.queues.map((queue) => queue.name),
      [
        "generation-submit-image",
        "generation-submit-video",
        "generation-poll-video",
        "generation-finalize-artifact",
        "generation-dead-letter",
      ],
    );
    assert.equal(health.queues[1].counts.waiting, 8);
    assert.equal(health.queues[2].counts.delayed, 12);
    assert.equal(health.queues[3].counts.active, 3);
    assert.equal(health.queues[4].failedJobs[0].failureReason, "provider_timeout");
    assert.deepEqual(health.queues[4].failedJobs[0].data, {
      taskId: "task-1",
      failureCode: "provider_output_persist_failed",
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

  it("reports unavailable when Redis ping fails and skips queue inspection", async () => {
    let queueFactoryCalled = false;
    const service = createGenerationQueueHealthService({
      config: testConfig(),
      redis: {
        async ping() {
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
});

function testConfig(): GenerationQueueConfig {
  return {
    redisUrl: "redis://127.0.0.1:6379/0",
    queuePrefix: "test-prefix",
    workersEnabled: true,
    outboxDispatcherEnabled: true,
    queues: {
      submitImage: "generation-submit-image",
      submitVideo: "generation-submit-video",
      pollVideo: "generation-poll-video",
      finalizeArtifact: "generation-finalize-artifact",
      deadLetter: "generation-dead-letter",
    },
    finalize: {
      video: { concurrency: 40, limiter: { max: 40, durationMs: 1000 } },
      image: { concurrency: 100, limiter: { max: 100, durationMs: 1000 } },
    },
    submit: {
      video: { concurrency: 10, limiter: { max: 10, durationMs: 1000 } },
    },
    artifactUpload: {
      retryAttempts: 3,
      retryDelayMs: 1000,
    },
    outbox: {
      dispatchBatchSize: 50,
      dispatchIntervalMs: 1000,
      retryDelayMs: 30_000,
    },
    repair: {
      staleDispatchMs: 120_000,
    },
    poll: {
      video: {
        concurrency: 40,
        limiter: { max: 40, durationMs: 1000 },
        intervalMs: 5000,
        maxAttempts: 120,
      },
    },
  };
}
