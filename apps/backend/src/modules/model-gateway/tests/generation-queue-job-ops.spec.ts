import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { createGenerationQueueJobOpsService } from "../generation-queue-job-ops.service.ts";

describe("generation queue job ops service", () => {
  const config = loadGenerationQueueConfig({
    GENERATION_SUBMIT_QUEUE_COUNT: "3",
    GENERATION_POLL_QUEUE_COUNT: "3",
    GENERATION_RESULT_QUEUE_COUNT: "3",
  });

  it("retries a failed job on a configured fixed queue", async () => {
    const calls: string[] = [];
    const service = createGenerationQueueJobOpsService({
      config,
      queueFactory: (name) => ({
        name,
        async getJob() {
          return {
            name: "generation.task.created",
            attemptsMade: 2,
            async getState() { return "failed"; },
            async retry() { calls.push("retry"); },
          };
        },
        async close() { calls.push("close"); },
      }),
    });

    const result = await service.operate({
      queueName: config.queueNames.submit[0]!,
      jobId: "submit-job",
      action: "retry",
    });

    assert.equal(result.status, 200);
    assert.deepEqual(calls, ["retry", "close"]);
  });

  it("promotes delayed jobs and removes inactive jobs with state guards", async () => {
    const calls: string[] = [];
    const jobs = new Map([
      ["delayed", {
        name: "generation.video.poll.repair",
        async getState() { return "delayed"; },
        async promote() { calls.push("promote"); },
      }],
      ["waiting", {
        name: "generation.task.finalize_requested",
        async getState() { return "waiting"; },
        async remove() { calls.push("remove"); },
      }],
    ]);
    const service = createGenerationQueueJobOpsService({
      config,
      queueFactory: (name) => ({
        name,
        async getJob(jobId) { return jobs.get(jobId) ?? null; },
        async close() { calls.push("close"); },
      }),
    });

    assert.equal((await service.operate({
      queueName: config.queueNames.poll[1]!, jobId: "delayed", action: "promote",
    })).status, 200);
    assert.equal((await service.operate({
      queueName: config.queueNames.result[2]!, jobId: "waiting", action: "remove",
    })).status, 200);
    assert.deepEqual(calls, ["promote", "close", "remove", "close"]);
  });

  it("rejects unconfigured queue names, stale state, and unsupported replay", async () => {
    let opened = false;
    const service = createGenerationQueueJobOpsService({
      config,
      queueFactory: (name) => ({
        name,
        async getJob() {
          return { async getState() { return "waiting"; } };
        },
        async close() { opened = true; },
      }),
    });

    assert.deepEqual(await service.operate({
      queueName: "generation-video-submit-route-001", jobId: "job", action: "retry",
    }), { status: 400, body: { error: "generation_queue_not_allowed" } });
    assert.equal(opened, false);
    assert.deepEqual(await service.operate({
      queueName: config.queueNames.submit[0]!, jobId: "job", action: "retry",
    }), { status: 409, body: { error: "generation_queue_job_state_mismatch", state: "waiting" } });
    assert.deepEqual(await service.operate({
      queueName: config.queueNames.submit[0]!, jobId: "job", action: "replay",
    }), { status: 409, body: { error: "generation_queue_job_action_unsupported" } });
  });

  it("does not repeat a completed action after a durable checkpoint", async () => {
    const calls: string[] = [];
    const service = createGenerationQueueJobOpsService({
      config,
      queueFactory: (name) => ({
        name,
        async getJob() { return null; },
        async close() { calls.push("close"); },
      }),
    });
    const result = await service.operate({
      queueName: config.queueNames.submit[0]!,
      jobId: "submit-job",
      action: "retry",
      journal: {
        async load() {
          return {
            source: {
              queueName: config.queueNames.submit[0]!, jobId: "submit-job", jobName: "generation.task.created",
              state: "failed", attemptsMade: 2, failedReason: null, data: {}, options: {},
            },
            actionApplied: true,
          };
        },
        async save() { calls.push("save"); },
      },
    });
    assert.equal(result.status, 200);
    assert.deepEqual(calls, ["close"]);
  });
});
