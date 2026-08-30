import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGenerationBullMQJob } from "../generation-bullmq.publisher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation outbox dispatcher", () => {
  it("routes submit events to one of the configured fixed submit queues", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_SUBMIT_QUEUE_COUNT: "3",
      GENERATION_POLL_QUEUE_COUNT: "3",
      GENERATION_RESULT_QUEUE_COUNT: "3",
    });
    const job = buildGenerationBullMQJob({
      id: "event-1",
      eventType: "generation.task.created",
      payload: {
        taskId: "task-1", workflowId: "workflow-1", mediaType: "image",
        modelCode: "gpt-image-2", providerExecutor: "gpt-image-2",
      },
    } as never, config);
    assert.equal(config.queueNames.submit.includes(job.queueName), true);
    assert.equal("queueAssignmentKey" in job.data, false);
  });

  it("routes poll and result events to their fixed queue groups", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_SUBMIT_QUEUE_COUNT: "3",
      GENERATION_POLL_QUEUE_COUNT: "3",
      GENERATION_RESULT_QUEUE_COUNT: "3",
    });
    const basePayload = {
      taskId: "task-1", workflowId: "workflow-1", mediaType: "video",
      modelCode: "seedance-i2v-pro", providerExecutor: "seedance",
    };
    const poll = buildGenerationBullMQJob({ id: "event-2", eventType: "generation.task.poll_requested", payload: basePayload } as never, config);
    const result = buildGenerationBullMQJob({ id: "event-3", eventType: "generation.task.finalize_requested", payload: basePayload } as never, config);
    assert.equal(config.queueNames.poll.includes(poll.queueName), true);
    assert.equal(config.queueNames.result.includes(result.queueName), true);
  });
});
