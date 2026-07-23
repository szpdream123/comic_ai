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

  it("authorizes jobs from a dynamically discovered shard", async () => {
    const calls: string[] = [];
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      queueDiscovery: async () => ["generation-image-submit-r1-003"],
      queueFactory: (queueName) => fakeQueue(queueName, {
        id: "job-1",
        name: "generation.image.submit",
        attemptsMade: 1,
        async getState() { return "failed"; },
        async retry() { calls.push(queueName); },
      }),
    });

    const result = await service.operate({
      queueName: "generation-image-submit-r1-003",
      jobId: "job-1",
      action: "retry",
    });
    assert.equal(result.status, 200);
    assert.deepEqual(calls, ["generation-image-submit-r1-003"]);
  });

  it("applies replay validation to dynamic submit and poll shards", async () => {
    const calls: string[] = [];
    const deadLetterJob: FakeJob = {
      id: "dlq-1",
      name: "generation.dead_letter",
      data: {
        sourceQueueName: "generation-video-poll-r2-004",
        sourceJobId: "poll-1",
        sourceJobName: "generation.video.poll",
        sourceJobData: { taskId: "task-1" },
      },
      async getState() { return "waiting"; },
      async remove() { calls.push("remove"); },
    };
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({}),
      queueDiscovery: async () => ["generation-video-poll-r2-004"],
      validateReplay: async () => {
        calls.push("validate");
        return false;
      },
      queueFactory: (queueName) => queueName === "generation-dead-letter"
        ? fakeQueue(queueName, deadLetterJob)
        : fakeQueue(queueName, null),
    });
    const result = await service.operate({
      queueName: "generation-dead-letter",
      jobId: "dlq-1",
      action: "replay",
    });
    assert.deepEqual(result, { status: 409, body: { error: "generation_queue_job_replay_not_ready" } });
    assert.deepEqual(calls, ["validate"]);
  });

  it("replays a dead-letter snapshot to its original queue and removes the DLQ entry", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const deadLetterJob: FakeJob = {
      id: "generation.dead_letter__generation-poll-video__poll-1",
      name: "generation.dead_letter",
      attemptsMade: 0,
      failedReason: null,
      data: {
        sourceQueueName: "generation-poll-video",
        sourceJobId: "poll-1",
        sourceJobName: "generation.video.poll",
        sourceJobData: { taskId: "task-1", pollAttempt: 8 },
        sourceJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          priority: 1,
        },
        failedAt: "2026-07-21T00:00:00.000Z",
      },
      async getState() {
        return "waiting";
      },
      async remove() {
        calls.push({ action: "remove_dlq" });
      },
    };
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({}),
      async validateReplay(input) {
        calls.push({ action: "validate", ...input });
        return true;
      },
      queueFactory: (queueName) => queueName === "generation-dead-letter"
        ? fakeQueue(queueName, deadLetterJob)
        : {
            name: queueName,
            async getJob() { return null; },
            async add(name, data, options) {
              calls.push({ action: "add", queueName, name, data, options });
              return { id: options.jobId };
            },
            async close() {},
          },
    });

    const result = await service.operate({
      queueName: "generation-dead-letter",
      jobId: deadLetterJob.id,
      action: "replay",
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.replayedQueueName, "generation-poll-video");
    assert.match(result.body.replayedJobId ?? "", /poll-1__dlq_replay__/);
    assert.equal(calls[0]?.action, "validate");
    assert.equal(calls[1]?.action, "add");
    assert.equal(calls[2]?.action, "remove_dlq");
  });

  it("keeps the DLQ entry when business state rejects submit or poll replay", async () => {
    const calls: string[] = [];
    const deadLetterJob: FakeJob = {
      id: "generation.dead_letter__generation-submit-video__submit-1",
      name: "generation.dead_letter",
      data: {
        sourceQueueName: "generation-submit-video",
        sourceJobId: "submit-1",
        sourceJobName: "generation.video.submit",
        sourceJobData: { taskId: "task-1" },
      },
      async getState() {
        return "waiting";
      },
      async remove() {
        calls.push("remove_dlq");
      },
    };
    const service = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({}),
      async validateReplay(input) {
        calls.push(`validate:${input.sourceJobData.taskId}`);
        return false;
      },
      queueFactory: (queueName) => queueName === "generation-dead-letter"
        ? fakeQueue(queueName, deadLetterJob)
        : {
            name: queueName,
            async getJob() { return null; },
            async add() {
              calls.push("add");
              return { id: "unexpected" };
            },
            async close() {},
          },
    });

    const result = await service.operate({
      queueName: "generation-dead-letter",
      jobId: deadLetterJob.id,
      action: "replay",
    });

    assert.deepEqual(result, {
      status: 409,
      body: { error: "generation_queue_job_replay_not_ready" },
    });
    assert.deepEqual(calls, ["validate:task-1"]);

    const withoutValidator = createGenerationQueueJobOpsService({
      config: loadGenerationQueueConfig({}),
      queueFactory: (queueName) => fakeQueue(queueName, deadLetterJob),
    });
    assert.deepEqual(await withoutValidator.operate({
      queueName: "generation-dead-letter",
      jobId: deadLetterJob.id,
      action: "replay",
    }), {
      status: 409,
      body: { error: "generation_queue_job_replay_not_ready" },
    });
    assert.deepEqual(calls, ["validate:task-1"]);
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
  data?: Record<string, unknown>;
  getState(): Promise<string>;
  retry?(state?: "failed" | "completed"): Promise<void>;
  promote?(): Promise<void>;
  remove?(): Promise<void>;
}
