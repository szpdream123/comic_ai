import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleGenerationFetchArtifactJob,
  handleGenerationFinalizeArtifactJob,
  handleGenerationPersistArtifactJob,
  handleGenerationPollImageJob,
  handleGenerationSubmitAudioJob,
  handleGenerationSubmitImageJob,
  handleGenerationPollVideoJob,
  handleGenerationSubmitVideoJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

function generationQueueConfigWithMaxPollAttempts(
  maxAttempts: number,
  env: NodeJS.ProcessEnv = {},
) {
  const config = loadGenerationQueueConfig(env);
  config.poll.video.maxAttempts = maxAttempts;
  return config;
}

describe("generation BullMQ worker handlers", () => {
  it("queues a delayed image poll job after a GPT Image submit job succeeds", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationSubmitImageJob({
      job: {
        data: {
          taskId: "task-image-1",
          workflowId: "workflow-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          outboxEventId: "outbox-1",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitGptImage({ taskId, userConcurrencyLimit }) {
          assert.equal(taskId, "task-image-1");
          assert.equal(userConcurrencyLimit, 20);
          return { status: "submitted" };
        },
        async submitSeedanceVideo() {
          throw new Error("video submit should not run for image jobs");
        },
        async pollSeedanceVideo() {
          throw new Error("video poll should not run for image jobs");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "submitted", queuedPoll: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-poll-image");
    assert.equal(added[0]?.name, "generation.image.poll");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-image-1",
      workflowId: "workflow-1",
      mediaType: "image",
      modelCode: "gpt-image-2-cn",
      providerExecutor: "gpt-image-2",
      pollAttempt: 1,
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.image.poll__task-image-1__1",
      delay: 30_000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("queues image finalization after the image poll reaches a terminal result", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollImageJob({
      job: {
        data: {
          taskId: "task-image-1",
          workflowId: "workflow-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          pollAttempt: 1,
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("video submit should not run for image poll jobs");
        },
        async pollSeedanceVideo() {
          throw new Error("video poll should not run for image poll jobs");
        },
        async pollGptImage() {
          return { status: "succeeded" };
        },
      },
      now: new Date("2026-06-03T00:00:30.000Z"),
    });

    assert.deepEqual(result, { status: "succeeded", queuedPoll: false, queuedFinalize: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-finalize-artifact");
    assert.equal(added[0]?.name, "generation.image.finalize");
  });

  it("continues a skipped image submit through the delayed poll queue", async () => {
    const added: Array<{ queueName: string; name: string; options: unknown }> = [];
    const result = await handleGenerationSubmitImageJob({
      job: { data: {
        taskId: "task-image-skipped",
        workflowId: "workflow-1",
        mediaType: "image",
        modelCode: "gpt-image-2-cn",
        providerExecutor: "gpt-image-2",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(queueName, name, _data, options) {
          added.push({ queueName, name, options });
        },
      },
      processors: {
        async submitGptImage() { return { status: "skipped" }; },
        async submitSeedanceVideo() { throw new Error("video submit should not run"); },
        async pollSeedanceVideo() { throw new Error("video poll should not run"); },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: true });
    assert.equal(added[0]?.queueName, "generation-poll-image");
    assert.equal(added[0]?.name, "generation.image.poll");
    assert.equal(
      (added[0]?.options as { jobId?: string }).jobId,
      "generation.image.poll__task-image-skipped__1",
    );
  });

  it("does not poll when image submission has no durable external id", async () => {
    const added: Array<unknown> = [];
    const result = await handleGenerationSubmitImageJob({
      job: { data: {
        taskId: "task-image-without-external-id",
        workflowId: "workflow-1",
        mediaType: "image",
        modelCode: "cumob-gpt-image-2-pro",
        providerExecutor: "gpt-image-2",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(...args) {
          added.push(args);
        },
      },
      processors: {
        async submitGptImage() {
          return { status: "skipped", nextAction: "stop" };
        },
        async submitSeedanceVideo() { throw new Error("video submit should not run"); },
        async pollSeedanceVideo() { throw new Error("video poll should not run"); },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: false });
    assert.deepEqual(added, []);
  });

  it("continues a skipped image poll with the next unique delayed attempt", async () => {
    const added: Array<{ data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollImageJob({
      job: { data: {
        taskId: "task-image-skipped",
        workflowId: "workflow-1",
        mediaType: "image",
        modelCode: "gpt-image-2-cn",
        providerExecutor: "gpt-image-2",
        pollAttempt: 1,
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(_queueName, _name, data, options) { added.push({ data, options }); },
      },
      processors: {
        async submitSeedanceVideo() { throw new Error("video submit should not run"); },
        async pollSeedanceVideo() { throw new Error("video poll should not run"); },
        async pollGptImage() { return { status: "skipped" }; },
      },
      now: new Date("2026-06-03T00:00:30.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: true });
    assert.equal((added[0]?.data as { pollAttempt?: number }).pollAttempt, 2);
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.image.poll__task-image-skipped__2",
      delay: 30_000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("routes a skipped image poll back to submit only when the durable coordinator allows it", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollImageJob({
      job: { data: {
        taskId: "task-image-submit-recovery",
        workflowId: "workflow-1",
        mediaType: "image",
        modelCode: "gpt-image-2-cn",
        providerExecutor: "gpt-image-2",
        pollAttempt: 1,
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(queueName, name, data, options) { added.push({ queueName, name, data, options }); },
      },
      processors: {
        async pollGptImage() { return { status: "skipped", nextAction: "submit" as const }; },
      },
      now: new Date("2026-06-03T00:00:30.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: false, queuedSubmit: true });
    assert.equal(added[0]?.queueName, "generation-submit-image");
    assert.equal(added[0]?.name, "generation.image.submit.retry");
    assert.equal((added[0]?.options as { delay?: number }).delay, 30_000);
  });

  it("finalizes an image that completed during provider submission", async () => {
    const added: Array<{ queueName: string; name: string }> = [];
    const result = await handleGenerationSubmitImageJob({
      job: {
        data: {
          taskId: "task-image-sync",
          workflowId: "workflow-sync",
          mediaType: "image",
          modelCode: "seedream-5",
          providerExecutor: "gpt-image-2",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(queueName, name) {
          added.push({ queueName, name });
        },
      },
      processors: {
        async submitGptImage() {
          return { status: "submitted", providerStatus: "succeeded" };
        },
        async submitSeedanceVideo() {
          throw new Error("video submit should not run for synchronous image jobs");
        },
        async pollSeedanceVideo() {
          throw new Error("video poll should not run for synchronous image jobs");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "submitted", queuedFinalize: true });
    assert.deepEqual(added, [{
      queueName: "generation-finalize-artifact",
      name: "generation.image.finalize",
    }]);
  });

  it("queues a delayed video poll job after a Seedance submit job succeeds", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationSubmitVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          outboxEventId: "outbox-1",
          membershipPriority: true,
          queuePriority: 2,
          priorityReason: "membership_priority",
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo({ userConcurrencyLimit }) {
          assert.equal(userConcurrencyLimit, 10);
          return { status: "submitted", externalRequestId: "seedance-task-1" };
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during submit");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "submitted", queuedPoll: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-poll-video");
    assert.equal(added[0]?.name, "generation.video.poll");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      pollAttempt: 1,
      membershipPriority: true,
      queuePriority: 2,
      priorityReason: "membership_priority",
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.poll__task-1__1",
      delay: 30_000,
      priority: 2,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("does not poll when video submission has no durable external id", async () => {
    const added: Array<unknown> = [];
    const result = await handleGenerationSubmitVideoJob({
      job: { data: {
        taskId: "task-video-without-external-id",
        workflowId: "workflow-1",
        mediaType: "video",
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(...args) {
          added.push(args);
        },
      },
      processors: {
        async submitSeedanceVideo() {
          return { status: "already_started", externalRequestId: null };
        },
        async pollSeedanceVideo() { throw new Error("video poll should not run"); },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "already_started", queuedPoll: false });
    assert.deepEqual(added, []);
  });

  it("does not poll when audio submission has no durable external id", async () => {
    const added: Array<unknown> = [];
    const result = await handleGenerationSubmitAudioJob({
      job: { data: {
        taskId: "task-audio-without-external-id",
        workflowId: "workflow-1",
        mediaType: "audio",
        modelCode: "cosyvoice-v2",
        providerExecutor: "aliyun-bailian-audio",
      } },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(...args) {
          added.push(args);
        },
      },
      processors: {
        async submitAudio() {
          return { status: "skipped", nextAction: "stop" };
        },
        async submitSeedanceVideo() { throw new Error("video submit should not run"); },
        async pollSeedanceVideo() { throw new Error("video poll should not run"); },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: false });
    assert.deepEqual(added, []);
  });

  it("requeues a Seedance submit job when provider rate limits are exhausted", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationSubmitVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          outboxEventId: "outbox-1",
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          return { status: "rate_limited", retryAfterMs: 2500, reason: "provider_rpm_exhausted" };
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during submit");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "rate_limited", queuedPoll: false });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-submit-video");
    assert.equal(added[0]?.name, "generation.video.submit.retry");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      outboxEventId: "outbox-1",
      retrySequence: 1,
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.submit.retry__task-1__1",
      delay: 2500,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("requeues a Seedance submit job when the task remains retryable", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationSubmitVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          outboxEventId: "outbox-1",
          retrySequence: 4,
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_SUBMIT_VIDEO_QUEUE: "generation-submit-video",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          return { status: "retryable", retryAfterMs: 1000, reason: "task_not_claimable" };
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during submit");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "retryable", queuedPoll: false });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-submit-video");
    assert.equal(added[0]?.name, "generation.video.submit.retry");
    assert.equal((added[0]?.data as Record<string, unknown>).retrySequence, 5);
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.submit.retry__task-1__5",
      delay: 1000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("requeues a GPT Image submit job when the user's image concurrency is exhausted", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationSubmitImageJob({
      job: {
        data: {
          taskId: "task-image-1",
          workflowId: "workflow-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          outboxEventId: "outbox-1",
          retrySequence: 3,
          dispatchToken: "cumob-429-repair-3",
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_SUBMIT_IMAGE_QUEUE: "generation-submit-image",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitGptImage({ userConcurrencyLimit }) {
          assert.equal(userConcurrencyLimit, 20);
          return { status: "rate_limited", retryAfterMs: 3000, reason: "concurrency:user:user-1:submit" };
        },
        async submitSeedanceVideo() {
          throw new Error("video submit should not run for image jobs");
        },
        async pollSeedanceVideo() {
          throw new Error("video poll should not run for image jobs");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "rate_limited" });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-submit-image");
    assert.equal(added[0]?.name, "generation.image.submit.retry");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-image-1",
      workflowId: "workflow-1",
      mediaType: "image",
      modelCode: "gpt-image-2-cn",
      providerExecutor: "gpt-image-2",
      outboxEventId: "outbox-1",
      retrySequence: 4,
      dispatchToken: "cumob-429-repair-3",
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.image.submit.retry__task-image-1__cumob-429-repair-3__4",
      delay: 3000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("requeues waiting video poll jobs until the configured max attempt", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 2,
        },
      },
      config: generationQueueConfigWithMaxPollAttempts(3, {
        GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during poll");
        },
        async pollSeedanceVideo() {
          return { status: "waiting" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "waiting", queuedPoll: true });
    assert.equal(added.length, 1);
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      pollAttempt: 3,
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.poll__task-1__3",
      delay: 30_000,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("requeues rate-limited video poll jobs without consuming a poll attempt", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 2,
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during poll");
        },
        async pollSeedanceVideo() {
          return { status: "rate_limited", retryAfterMs: 2500, reason: "rate:provider:volcengine:poll" };
        },
        async expireSeedanceVideo() {
          throw new Error("rate-limited poll jobs should not expire the task");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "rate_limited", queuedPoll: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-poll-video");
    assert.equal(added[0]?.name, "generation.video.poll.rate-limit-retry");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      pollAttempt: 2,
      retrySequence: 1,
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.poll.rate-limit-retry__task-1__2__1",
      delay: 2500,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("expires the running video task when a poll job is still waiting after the max attempt", async () => {
    let expiredTaskId = "";
    const result = await handleGenerationPollVideoJob({
        job: {
          data: {
            taskId: "task-1",
            workflowId: "workflow-1",
            mediaType: "video",
            modelCode: "seedance-i2v-pro",
            providerExecutor: "seedance",
            pollAttempt: 3,
          },
        },
        config: generationQueueConfigWithMaxPollAttempts(3),
        publisher: {
          async add() {
            throw new Error("should not queue another poll");
          },
        },
        processors: {
          async submitSeedanceVideo() {
            throw new Error("submit should not run during poll");
          },
          async pollSeedanceVideo() {
            return { status: "waiting" };
          },
          async expireSeedanceVideo({ taskId }) {
            expiredTaskId = taskId;
            return { status: "failed", failureCode: "provider_poll_timeout" };
          },
        },
        now: new Date("2026-06-03T00:00:00.000Z"),
      });

    assert.equal(expiredTaskId, "task-1");
    assert.deepEqual(result, {
      status: "failed",
      queuedPoll: false,
      failureCode: "provider_poll_timeout",
    });
  });

  it("queues finalize-artifact after a Seedance poll job succeeds", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 1,
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during poll");
        },
        async pollSeedanceVideo() {
          return { status: "succeeded" };
        },
        async finalizeSeedanceVideoArtifact() {
          throw new Error("finalize should be deferred to the finalize queue");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "succeeded", queuedPoll: false, queuedFinalize: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-finalize-artifact");
    assert.equal(added[0]?.name, "generation.video.finalize");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      artifactKind: "video",
      artifactStage: "fetch",
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.finalize__task-1",
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
  });

  it("continues a skipped Seedance poll with the next unique delayed attempt", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 1,
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during poll");
        },
        async pollSeedanceVideo() {
          return { status: "skipped" };
        },
        async finalizeSeedanceVideoArtifact() {
          throw new Error("finalize should be deferred only after success");
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.name, "generation.video.poll");
    assert.equal((added[0]?.data as { pollAttempt?: number }).pollAttempt, 2);
    assert.equal(
      (added[0]?.options as { jobId?: string }).jobId,
      "generation.video.poll__task-1__2",
    );
    assert.equal((added[0]?.options as { delay?: number }).delay, 30_000);
  });

  it("records a skipped successor without publishing a delayed job when poll scheduling is durable", async () => {
    const scheduled: Array<Record<string, unknown>> = [];
    const successors: Array<Record<string, unknown>> = [];
    const now = new Date("2026-06-03T00:00:00.000Z");
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-durable-poll-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 1,
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add() {
          throw new Error("durably scheduled polls must not publish BullMQ delayed jobs");
        },
      },
      processors: {
        async submitSeedanceVideo() { throw new Error("submit should not run during poll"); },
        async pollSeedanceVideo() { return { status: "skipped" as const }; },
        async schedulePoll(input) {
          scheduled.push(input);
          return true;
        },
        async recordSkippedSuccessor(input) {
          successors.push(input);
        },
      },
      now,
    });

    assert.deepEqual(result, { status: "skipped", queuedPoll: true });
    assert.deepEqual(scheduled, [{
      taskId: "task-durable-poll-1",
      mediaType: "video",
      nextPollAttempt: 2,
      delayMs: 30_000,
      now,
    }]);
    assert.deepEqual(successors, [{
      taskId: "task-durable-poll-1",
      stage: "poll",
      pollAttempt: 1,
      skipReason: "durable_state_poll",
      nextAction: "poll",
      successorAssignmentKey: "generation.due-poll:task-durable-poll-1:2",
      now,
    }]);
  });

  it("expires a skipped Seedance poll job at the configured max attempt", async () => {
    let expiredTaskId = "";
    const result = await handleGenerationPollVideoJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          pollAttempt: 3,
        },
      },
      config: generationQueueConfigWithMaxPollAttempts(3),
      publisher: {
        async add() {
          throw new Error("expired skipped poll jobs should not queue another poll");
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during poll");
        },
        async pollSeedanceVideo() {
          return { status: "skipped" };
        },
        async expireSeedanceVideo({ taskId }) {
          expiredTaskId = taskId;
          return { status: "failed", failureCode: "provider_poll_timeout" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(expiredTaskId, "task-1");
    assert.deepEqual(result, {
      status: "failed",
      queuedPoll: false,
      failureCode: "provider_poll_timeout",
    });
  });

  it("runs finalize-artifact jobs through the dedicated processor", async () => {
    let finalizedTaskId = "";
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add() {
          throw new Error("finalize jobs should not enqueue follow-up jobs here");
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during finalize");
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during finalize");
        },
        async finalizeSeedanceVideoArtifact({ taskId }) {
          finalizedTaskId = taskId;
          return { status: "succeeded" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(finalizedTaskId, "task-1");
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("throws retryable Seedance finalize transfer failures for BullMQ backoff", async () => {
    await assert.rejects(() => handleGenerationFinalizeArtifactJob({
        job: {
          data: {
            taskId: "task-1",
            workflowId: "workflow-1",
            mediaType: "video",
            modelCode: "seedance-i2v-pro",
            providerExecutor: "seedance",
            artifactKind: "video",
          },
        },
        config: loadGenerationQueueConfig({}),
        publisher: {
          async add() {
            throw new Error("retryable finalize failures should use BullMQ attempts");
          },
        },
        processors: {
          async submitSeedanceVideo() {
            throw new Error("submit should not run during finalize");
          },
          async pollSeedanceVideo() {
            throw new Error("poll should not run during finalize");
          },
          async finalizeSeedanceVideoArtifact() {
            return { status: "failed", failureCode: "provider_output_download_failed" };
          },
        },
        now: new Date("2026-06-03T00:00:00.000Z"),
      }), /provider_output_download_failed/);
  });

  it("keeps terminal Seedance finalize failures as settled processor results", async () => {
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
      processors: {
        async submitSeedanceVideo() { return { status: "settled" }; },
        async pollSeedanceVideo() { return { status: "skipped" }; },
        async finalizeSeedanceVideoArtifact() {
          return { status: "failed", failureCode: "provider_output_storage_failed" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, {
      status: "failed",
      failureCode: "provider_output_storage_failed",
    });
  });

  it("requeues finalize-artifact jobs when storage finalize capacity is exhausted", async () => {
    const added: Array<{ queueName: string; name: string; data: unknown; options: unknown }> = [];
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video",
          storageBucket: "creator-test",
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during finalize");
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during finalize");
        },
        async finalizeSeedanceVideoArtifact() {
          throw new Error("rate-limited finalize jobs should not run finalizer");
        },
      },
      finalizeRateLimiter: {
        async acquireFinalizePermit(input) {
          assert.deepEqual(input, {
            bucket: "creator-test",
            mediaType: "video",
            leaseMs: 120000,
            now: new Date("2026-06-03T00:00:00.000Z"),
          });
          return { granted: false, retryAfterMs: 4000, reason: "concurrency:storage:creator-test:finalize" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(result, {
      status: "rate_limited",
      failureCode: "concurrency:storage:creator-test:finalize",
    });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-finalize-artifact");
    assert.equal(added[0]?.name, "generation.artifact.finalize.rate-limit-retry");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-1",
      workflowId: "workflow-1",
      mediaType: "video",
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      artifactKind: "video",
      storageBucket: "creator-test",
      retrySequence: 1,
    });
    assert.equal(
      (added[0]?.options as { jobId?: string }).jobId,
      "generation.artifact.finalize.rate-limit-retry__task-1__1",
    );
  });

  it("runs GPT Image 2 finalize-artifact jobs through the dedicated processor", async () => {
    let finalizedTaskId = "";
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-image-1",
          workflowId: "workflow-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          artifactKind: "image",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add() {
          throw new Error("finalize jobs should not enqueue follow-up jobs here");
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during finalize");
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during finalize");
        },
        async finalizeGptImageArtifact({ taskId }) {
          finalizedTaskId = taskId;
          return { status: "succeeded" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(finalizedTaskId, "task-image-1");
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("routes retry_persist_asset finalize jobs to persist-only processors", async () => {
    let persistOnlyTaskId = "";
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-image-persist-1",
          workflowId: "workflow-1",
          mediaType: "image",
          modelCode: "gpt-image-2-cn",
          providerExecutor: "gpt-image-2",
          artifactKind: "image",
          finalizeMode: "retry_persist_asset",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add() {
          throw new Error("persist-only finalize jobs should not enqueue follow-up jobs here");
        },
      },
      processors: {
        async submitSeedanceVideo() {
          throw new Error("submit should not run during finalize");
        },
        async pollSeedanceVideo() {
          throw new Error("poll should not run during finalize");
        },
        async finalizeGptImageArtifact() {
          throw new Error("retry_persist_asset must not download or upload provider artifacts");
        },
        async persistGptImageArtifact({ taskId }) {
          persistOnlyTaskId = taskId;
          return { status: "succeeded" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(persistOnlyTaskId, "task-image-persist-1");
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("routes explicit persist-stage jobs to persist-only processors", async () => {
    let persistedTaskId = "";
    const result = await handleGenerationFinalizeArtifactJob({
      job: {
        data: {
          taskId: "task-explicit-persist-1",
          workflowId: "workflow-1",
          mediaType: "video",
          modelCode: "seedance-i2v-pro",
          providerExecutor: "seedance",
          artifactKind: "video",
          artifactStage: "persist",
          finalizeMode: "retry_finalize",
        },
      },
      config: loadGenerationQueueConfig({}),
      publisher: { async add() {} },
      processors: {
        async submitSeedanceVideo() { return { status: "settled" }; },
        async pollSeedanceVideo() { return { status: "skipped" }; },
        async finalizeSeedanceVideoArtifact() {
          throw new Error("explicit persist stage must not invoke combined finalizer");
        },
        async persistSeedanceVideoArtifact({ taskId }) {
          persistedTaskId = taskId;
          return { status: "succeeded" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.equal(persistedTaskId, "task-explicit-persist-1");
    assert.deepEqual(result, { status: "succeeded" });
  });

  it("hands fetched artifacts to a separate persist job without rerunning fetch", async () => {
    const added: Array<{ queueName: string; name: string; data: Record<string, unknown>; options: unknown }> = [];
    let fetchCalls = 0;
    let persistCalls = 0;
    const job = {
      data: {
        taskId: "task-split-1",
        workflowId: "workflow-split-1",
        mediaType: "video" as const,
        modelCode: "seedance-i2v-pro",
        providerExecutor: "seedance",
        artifactKind: "video" as const,
        artifactStage: "fetch" as const,
      },
    };
    const config = loadGenerationQueueConfig({
      GENERATION_FINALIZE_ARTIFACT_QUEUE: "generation-finalize-artifact",
    });
    const processors = {
      async submitSeedanceVideo() { return { status: "settled" as const }; },
      async pollSeedanceVideo() { return { status: "skipped" as const }; },
      async fetchSeedanceVideoArtifact() {
        fetchCalls += 1;
        return { status: "succeeded" as const };
      },
      async persistSeedanceVideoArtifact() {
        persistCalls += 1;
        return { status: "succeeded" as const };
      },
      async finalizeSeedanceVideoArtifact() {
        throw new Error("split jobs must not invoke the legacy combined finalizer");
      },
    };
    const fetchResult = await handleGenerationFetchArtifactJob({
      job,
      config,
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors,
      now: new Date("2026-06-03T00:00:00.000Z"),
    });

    assert.deepEqual(fetchResult, { status: "succeeded", queuedPersist: true });
    assert.equal(fetchCalls, 1);
    assert.equal(persistCalls, 0);
    assert.equal(added[0]?.name, "generation.video.persist");
    assert.equal(added[0]?.data.artifactStage, "persist");
    assert.equal((added[0]?.options as { jobId?: string }).jobId, "generation.video.persist__task-split-1");

    const persistResult = await handleGenerationPersistArtifactJob({
      job: { data: added[0]!.data as typeof job.data },
      config,
      publisher: { async add() { throw new Error("persist must not enqueue another transfer"); } },
      processors: {
        ...processors,
        async fetchSeedanceVideoArtifact() {
          throw new Error("persist retry must not fetch or download again");
        },
      },
      now: new Date("2026-06-03T00:00:01.000Z"),
    });
    assert.deepEqual(persistResult, { status: "succeeded" });
    assert.equal(fetchCalls, 1);
    assert.equal(persistCalls, 1);
  });

  it("keeps fetch and persist rate-limit retries in distinct BullMQ jobs", async () => {
    const jobIds: string[] = [];
    const baseData = {
      taskId: "task-stage-rate-limit-1",
      workflowId: "workflow-1",
      mediaType: "video" as const,
      modelCode: "seedance-i2v-pro",
      providerExecutor: "seedance",
      artifactKind: "video" as const,
    };
    const input = {
      config: loadGenerationQueueConfig({}),
      publisher: {
        async add(_queueName: string, _name: string, _data: Record<string, unknown>, options: { jobId?: string }) {
          jobIds.push(String(options.jobId));
        },
      },
      processors: {
        async submitSeedanceVideo() { return { status: "settled" as const }; },
        async pollSeedanceVideo() { return { status: "skipped" as const }; },
      },
      finalizeRateLimiter: {
        async acquireFinalizePermit() {
          return { granted: false as const, retryAfterMs: 1000, reason: "storage_busy" };
        },
      },
      now: new Date("2026-06-03T00:00:00.000Z"),
    };
    await handleGenerationFetchArtifactJob({ ...input, job: { data: { ...baseData, artifactStage: "fetch" as const } } });
    await handleGenerationPersistArtifactJob({ ...input, job: { data: { ...baseData, artifactStage: "persist" as const } } });

    assert.deepEqual(jobIds, [
      "generation.artifact.finalize.rate-limit-retry__task-stage-rate-limit-1__fetch__1",
      "generation.artifact.finalize.rate-limit-retry__task-stage-rate-limit-1__persist__1",
    ]);
  });
});
