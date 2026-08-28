import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import type { OutboxEventRecord } from "../../shared/outbox/outbox-dispatch-repair.service.ts";
import {
  assertGenerationQueueName,
  buildGenerationBullMQJob,
  confirmGenerationBullMQJob,
  publishGenerationBullMQJobWithConfirmation,
  publishGenerationDeadLetter,
  publishGenerationTaskCreatedToBullMQ,
} from "../generation-bullmq.publisher.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation BullMQ publisher", () => {
  it("confirms the exact published job is still present", async () => {
    const confirmed = await confirmGenerationBullMQJob(
      "generation-submit-video",
      "job-1",
      async (jobId) => ({ id: jobId }),
    );
    assert.deepEqual(confirmed, { id: "job-1" });
  });

  it("keeps publication retryable when Redis cannot confirm the job", async () => {
    await assert.rejects(
      () => confirmGenerationBullMQJob("generation-submit-video", "job-2", async () => undefined),
      /generation_queue_publish_unconfirmed:generation-submit-video:job-2/,
    );
    await assert.rejects(
      () => confirmGenerationBullMQJob("generation-submit-video", "job-3", async () => {
        throw new Error("ECONNRESET");
      }),
      /ECONNRESET/,
    );
  });

  it("re-publishes the same stable job until Redis confirms it", async () => {
    let addCalls = 0;
    let getJobCalls = 0;
    const job = await publishGenerationBullMQJobWithConfirmation({
      queueName: "generation-submit-video",
      retryDelayMs: 0,
      add: async () => {
        addCalls += 1;
        return { id: "job-retry" };
      },
      getJob: async () => {
        getJobCalls += 1;
        return getJobCalls < 2 ? undefined : { id: "job-retry" };
      },
    });
    assert.deepEqual(job, { id: "job-retry" });
    assert.equal(addCalls, 2);
    assert.equal(getJobCalls, 2);
  });

  it("bounds connected Redis commands within the publish cancellation fence", async () => {
    const source = await readFile(new URL("../generation-bullmq.publisher.ts", import.meta.url), "utf8");
    assert.match(source, /connectTimeout:\s*2_000/);
    assert.match(source, /commandTimeout:\s*5_000/);
    assert.match(source, /maxRetriesPerRequest:\s*1/);
  });

  it("rejects BullMQ queue names with reserved separators or unsafe route data", () => {
    assert.equal(
      assertGenerationQueueName("generation-video-submit-r9b814-001"),
      "generation-video-submit-r9b814-001",
    );
    assert.throws(
      () => assertGenerationQueueName("generation:video:submit:r9b814:001"),
      /invalid_generation_queue_name/,
    );
    assert.throws(
      () => assertGenerationQueueName("generation-video-submit-user@example.com-001"),
      /invalid_generation_queue_name/,
    );
  });

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
      jobId: "generation.task.created__task-1__submit__outbox-1",
      data: {
        outboxEventId: "outbox-1",
        taskId: "task-1",
        workflowId: "workflow-1",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
        dispatchToken: "outbox-1",
      },
      options: {
        jobId: "generation.task.created__task-1__submit__outbox-1",
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
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
      taskId: "task-2",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      dispatchToken: "outbox-1",
    });
  });

  it("applies membership queue priority from the generation outbox payload", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
    });
    const event = generationTaskCreatedEvent({
      taskId: "task-priority-1",
      mediaType: "video",
      queueName: "generation-submit-video",
      membershipPriority: true,
      queuePriority: 1,
      priorityReason: "professional_membership_model_family_priority",
    });

    const job = buildGenerationBullMQJob(event, config);

    assert.deepEqual(job.data, {
      outboxEventId: "outbox-1",
      taskId: "task-priority-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      dispatchToken: "outbox-1",
      membershipPriority: true,
      queuePriority: 1,
      priorityReason: "professional_membership_model_family_priority",
    });
    assert.equal(job.options.priority, 1);
  });

  it("builds a persist-only finalize job isolated by its outbox recovery wave", () => {
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
    assert.equal(job.jobId, "generation.task.finalize_requested__task-3__retry_persist_asset__outbox-1");
    assert.deepEqual(job.data, {
      outboxEventId: "outbox-1",
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

  it("builds retry finalize jobs with the outbox id so failed stale jobs do not block compensation", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({
        taskId: "task-4",
        mediaType: "video",
        artifactKind: "video",
        finalizeMode: "retry_finalize",
      }, "generation.task.finalize_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-finalize-artifact");
    assert.equal(job.jobName, "generation.task.finalize_requested");
    assert.equal(job.jobId, "generation.task.finalize_requested__task-4__retry_finalize__outbox-1");
  });

  it("preserves explicit persist stage and dynamic shard queue for finalize jobs", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
    });
    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({
        taskId: "task-persist-stage-1",
        artifactKind: "video",
        artifactStage: "persist",
        queueName: "generation-video-persist-rabc123-001",
        finalizeMode: "retry_finalize",
      }, "generation.task.finalize_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-video-persist-rabc123-001");
    assert.equal(job.data.artifactStage, "persist");
    assert.equal(job.data.finalizeMode, "retry_finalize");
  });

  it("builds provider poll recovery jobs on the poll queue without a new submission", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({ taskId: "task-poll-1" }, "generation.task.poll_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-poll-video");
    assert.equal(job.jobName, "generation.video.poll.repair");
    assert.equal(job.jobId, "generation.video.poll__task-poll-1__1__outbox-1");
    assert.deepEqual(job.data, {
      outboxEventId: "outbox-1",
      taskId: "task-poll-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      pollAttempt: 1,
    });
  });

  it("routes image poll recovery jobs to the dedicated image queue", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_POLL_IMAGE_QUEUE: "generation-poll-image",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({
        taskId: "task-image-poll-1",
        mediaType: "image",
        modelCode: "gpt-image-2-cn",
        queueName: "generation-submit-image",
        providerExecutor: "gpt-image-2",
        pollAttempt: 2,
      }, "generation.task.poll_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-poll-image");
    assert.equal(job.jobName, "generation.image.poll.repair");
    assert.equal(job.jobId, "generation.image.poll__task-image-poll-1__2__outbox-1");
    assert.equal(job.data.mediaType, "image");
    assert.equal(job.data.pollAttempt, 2);
  });

  it("routes audio poll recovery jobs to the dedicated audio queue", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_POLL_AUDIO_QUEUE: "generation-poll-audio",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({
        taskId: "task-audio-poll-1",
        mediaType: "audio",
        modelCode: "qwen3-tts",
        queueName: "generation-submit-audio",
        providerExecutor: "aliyun-bailian-audio",
        pollAttempt: 2,
      }, "generation.task.poll_requested"),
      config,
    );

    assert.equal(job.queueName, "generation-poll-audio");
    assert.equal(job.jobName, "generation.audio.poll.repair");
    assert.equal(job.jobId, "generation.audio.poll__task-audio-poll-1__2__outbox-1");
    assert.equal(job.data.mediaType, "audio");
    assert.equal(job.data.pollAttempt, 2);
  });

  it("isolates separate poll recovery waves while keeping each outbox retry stable", () => {
    const config = loadGenerationQueueConfig({});
    const firstEvent = generationTaskCreatedEvent(
      { taskId: "task-poll-dedup", pollAttempt: 3 },
      "generation.task.poll_requested",
    );
    const secondEvent = { ...firstEvent, id: "outbox-2" };

    const firstJob = buildGenerationBullMQJob(firstEvent, config);
    const secondJob = buildGenerationBullMQJob(secondEvent, config);

    assert.equal(firstJob.jobId, "generation.video.poll__task-poll-dedup__3__outbox-1");
    assert.equal(secondJob.jobId, "generation.video.poll__task-poll-dedup__3__outbox-2");
    assert.notEqual(secondJob.jobId, firstJob.jobId);
    assert.equal(buildGenerationBullMQJob(firstEvent, config).jobId, firstJob.jobId);
    assert.equal(secondJob.data.pollAttempt, 3);
  });

  it("uses an admin redispatch token to avoid stale BullMQ job deduplication", () => {
    const config = loadGenerationQueueConfig({
      GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
    });

    const job = buildGenerationBullMQJob(
      generationTaskCreatedEvent({ taskId: "task-requeue-1", dispatchToken: "ops-requeue-1" }),
      config,
    );

    assert.equal(job.jobId, "generation.task.created__task-requeue-1__submit__ops-requeue-1");
    assert.equal(job.data.dispatchToken, "ops-requeue-1");
  });

  it("writes an exhausted job snapshot to the dead-letter queue", async () => {
    const config = loadGenerationQueueConfig({});
    const added: Array<{ queueName: string; name: string; data: Record<string, unknown>; options: unknown }> = [];

    const result = await publishGenerationDeadLetter({
      sourceQueueName: config.queues.pollVideo,
      sourceJobId: "poll-job-1",
      sourceJobName: "generation.video.poll",
      sourceJobData: { taskId: "task-dlq-1", pollAttempt: 4 },
      sourceJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnFail: { age: 604800, count: 50000 },
      },
      failedReason: "provider timeout",
      attemptsMade: 3,
      failedAt: new Date("2026-07-21T00:00:00.000Z"),
    }, {
      config,
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
    });

    assert.deepEqual(result, {
      queueName: "generation-dead-letter",
      jobId: "generation.dead_letter__generation-poll-video__poll-job-1",
    });
    assert.equal(added[0]?.queueName, "generation-dead-letter");
    assert.equal(added[0]?.name, "generation.dead_letter");
    assert.deepEqual(added[0]?.data, {
      sourceQueueName: "generation-poll-video",
      sourceJobId: "poll-job-1",
      sourceJobName: "generation.video.poll",
      sourceJobData: { taskId: "task-dlq-1", pollAttempt: 4 },
      sourceJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: undefined,
        removeOnFail: { age: 604800, count: 50000 },
        priority: undefined,
      },
      failedReason: "provider timeout",
      attemptsMade: 3,
      failedAt: "2026-07-21T00:00:00.000Z",
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
