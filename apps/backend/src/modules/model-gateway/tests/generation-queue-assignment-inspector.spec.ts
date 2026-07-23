import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import { createBullMQGenerationQueueAssignmentInspector } from "../generation-queue-assignment-inspector.ts";

describe("generation queue assignment inspector", () => {
  it("reads an exact BullMQ job state by deterministic job id", async () => {
    const requestedJobIds: string[] = [];
    let closeCount = 0;
    const inspector = createBullMQGenerationQueueAssignmentInspector(
      loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      {
        queueFactory: () => ({
          async getJobs() { return []; },
          async getJob(jobId) {
            requestedJobIds.push(jobId);
            return { async getState() { return "failed"; } };
          },
          async close() { closeCount += 1; },
        }),
      },
    );

    assert.equal(await inspector.inspectJobState?.("queue-a", "job-123"), "failed");
    assert.deepEqual(requestedJobIds, ["job-123"]);
    assert.equal(closeCount, 1);
  });

  it("reports a missing exact job without treating Redis as unavailable", async () => {
    const inspector = createBullMQGenerationQueueAssignmentInspector(
      loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      {
        queueFactory: () => ({
          async getJobs() { return []; },
          async getJob() { return undefined; },
          async close() {},
        }),
      },
    );

    assert.equal(await inspector.inspectJobState?.("queue-a", "missing-job"), "missing");
  });

  it("removes a job by deterministic id and closes the queue client", async () => {
    let removed = false;
    let closed = false;
    const inspector = createBullMQGenerationQueueAssignmentInspector(
      loadGenerationQueueConfig({ REDIS_URL: "redis://127.0.0.1:6379/0" }),
      {
        queueFactory: () => ({
          async getJobs() { return []; },
          async getJob() {
            return { async remove() { removed = true; } };
          },
          async close() { closed = true; },
        }),
      },
    );

    assert.equal(await inspector.removeJob("queue-a", "job-123"), "removed");
    assert.equal(removed, true);
    assert.equal(closed, true);
  });
});
