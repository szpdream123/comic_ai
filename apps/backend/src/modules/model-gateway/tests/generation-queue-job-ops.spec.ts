import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { createGenerationQueueJobOpsService } from "../generation-queue-job-ops.service.ts";

describe("generation queue job ops service", () => {
  it("retries a failed BullMQ job from an allowed generation queue", async () => {
    const calls: string[] = [];
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueFactory: (queueName) => fakeQueue(queueName, {
        id: "job-1",
        name: "generation.video.submit",
        failedReason: "provider timeout",
        attemptsMade: 3,
        async getState() {
          return "failed";
        },
        async retry(state) {
          calls.push(`retry:${state}`);
        },
      }),
    });

    const result = await service.operate({
      queueName: "generation-submit-video",
      jobId: "job-1",
      action: "retry",
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      queueName: "generation-submit-video",
      jobId: "job-1",
      jobName: "generation.video.submit",
      action: "retry",
      previousState: "failed",
      attemptsMade: 3,
      failedReason: "provider timeout",
    });
    assert.deepEqual(calls, ["retry:failed"]);
  });

  it("promotes delayed jobs and removes inactive jobs with state guards", async () => {
    const calls: string[] = [];
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueFactory: (queueName) => fakeQueue(queueName, {
        id: "poll-1",
        name: "generation.video.poll",
        attemptsMade: 1,
        failedReason: null,
        async getState() {
          return "delayed";
        },
        async promote() {
          calls.push("promote");
        },
        async remove() {
          calls.push("remove");
        },
      }),
    });

    const promoted = await service.operate({
      queueName: "generation-poll-video",
      jobId: "poll-1",
      action: "promote",
    });
    const removed = await service.operate({
      queueName: "generation-poll-video",
      jobId: "poll-1",
      action: "remove",
    });

    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.action, "promote");
    assert.equal(removed.status, 200);
    assert.equal(removed.body.action, "remove");
    assert.deepEqual(calls, ["promote", "remove"]);
  });

  it("rejects unknown queues, missing jobs, and invalid actions for the current state", async () => {
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueFactory: (queueName) => fakeQueue(queueName, {
        id: "active-1",
        name: "generation.video.poll",
        attemptsMade: 1,
        failedReason: null,
        async getState() {
          return "active";
        },
      }),
    });

    const unknownQueue = await service.operate({
      queueName: "not-generation",
      jobId: "job-1",
      action: "retry",
    });
    const missingJob = await createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueFactory: (queueName) => fakeQueue(queueName, null),
    }).operate({
      queueName: "generation-submit-video",
      jobId: "missing",
      action: "retry",
    });
    const invalidState = await service.operate({
      queueName: "generation-poll-video",
      jobId: "active-1",
      action: "remove",
    });

    assert.deepEqual(unknownQueue, {
      status: 400,
      body: { error: "generation_queue_not_allowed" },
    });
    assert.deepEqual(missingJob, {
      status: 404,
      body: { error: "generation_queue_job_not_found" },
    });
    assert.deepEqual(invalidState, {
      status: 409,
      body: {
        error: "generation_queue_job_state_mismatch",
        state: "active",
      },
    });
  });

  it("rejects unsupported action names before touching the queue", async () => {
    let touchedQueue = false;
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueFactory: () => {
        touchedQueue = true;
        return fakeQueue("generation-submit-video", null);
      },
    });

    const result = await service.operate({
      queueName: "generation-submit-video",
      jobId: "job-1",
      action: "pause" as never,
    });

    assert.deepEqual(result, {
      status: 400,
      body: { error: "generation_queue_job_action_invalid" },
    });
    assert.equal(touchedQueue, false);
  });
});

function fakeQueue(
  name: string,
  job: FakeJob | null,
) {
  return {
    name,
    async getJob(jobId: string) {
      return job && job.id === jobId ? job : null;
    },
    async close() {},
  };
}

interface FakeJob {
  id: string;
  name: string;
  failedReason?: string | null;
  attemptsMade?: number;
  getState(): Promise<string>;
  retry?(state?: "failed" | "completed"): Promise<void>;
  promote?(): Promise<void>;
  remove?(): Promise<void>;
}
