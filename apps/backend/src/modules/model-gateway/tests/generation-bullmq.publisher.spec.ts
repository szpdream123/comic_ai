import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OutboxEventRecord } from "../../shared/outbox/outbox-dispatch-repair.service.ts";
import {
  buildGenerationBullMQJob,
  publishGenerationTaskCreatedToBullMQ,
} from "../generation-bullmq.publisher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation BullMQ publisher", () => {
  it("builds a stable submit job from generation task outbox payload", () => {
    const config = loadGenerationQueueConfig({
      BULLMQ_QUEUE_PREFIX: "comic-ai-test",
      GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
    });
    const event = generationTaskCreatedEvent({
      taskId: "task-1",
      mediaType: "video",
      queueName: "generation-submit-video",
    });

    const job = buildGenerationBullMQJob(event, config);

    assert.deepEqual(job, {
      queueName: "generation-submit-video",
      jobName: "generation.task.created",
      jobId: "generation.task.created__task-1__submit",
      data: {
        outboxEventId: "outbox-1",
        organizationId: "org-1",
        taskId: "task-1",
        workflowId: "workflow-1",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
      },
      options: {
        jobId: "generation.task.created__task-1__submit",
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: {
          age: 86400,
          count: 10000,
        },
        removeOnFail: {
          age: 604800,
          count: 50000,
        },
      },
    });
  });

  it("publishes the built job to the selected BullMQ queue", async () => {
    const config = loadGenerationQueueConfig({
      GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
    });
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const publisher = {
      async add(queueName: string, name: string, data: unknown, options: unknown) {
        added.push({ queueName, name, data, options });
      },
    };

    await publishGenerationTaskCreatedToBullMQ(
      generationTaskCreatedEvent({
        taskId: "task-2",
        mediaType: "video",
        queueName: "generation-submit-video",
      }),
      {
        config,
        publisher,
      },
    );

    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-submit-video");
    assert.equal(added[0]?.name, "generation.task.created");
    assert.deepEqual(added[0]?.data, {
      outboxEventId: "outbox-1",
      organizationId: "org-1",
      taskId: "task-2",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
    });
  });

  it("builds a stable finalize job without reusing the submit queue", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({
        taskId: "task-3",
        mediaType: "video",
        artifactKind: "video",
        finalizeMode: "retry_persist_asset",
        storageBucket: "creator-test",
      }, "generation.task.finalize_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-finalize-artifact");
    assert.equal(job.jobName, "generation.task.finalize_requested");
    assert.equal(job.jobId, "generation.task.finalize_requested__task-3__retry_persist_asset");
    assert.deepEqual(job.data, {
      outboxEventId: "outbox-1",
      organizationId: "org-1",
      taskId: "task-3",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      artifactKind: "video",
      storageBucket: "creator-test",
      finalizeMode: "retry_persist_asset",
    });
  });
});

function generationTaskCreatedEvent(
  payload: Partial<OutboxEventRecord["payload"]>,
  eventType = "generation.task.created",
): OutboxEventRecord {
  const now = new Date("2026-06-03T00:00:00.000Z");
  return {
    id: "outbox-1",
    organizationId: "org-1",
    eventType,
    payload: {
      workflowId: "workflow-1",
      taskId: "task-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      queueName: "generation-submit-video",
      providerExecutor: "seedance",
      ...payload,
    },
    status: "processing",
    availableAt: now,
    processedAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}
