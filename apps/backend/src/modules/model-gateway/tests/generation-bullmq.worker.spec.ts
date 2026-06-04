import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleGenerationFinalizeArtifactJob,
  handleGenerationSubmitImageJob,
  handleGenerationPollVideoJob,
  handleGenerationSubmitVideoJob,
} from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation BullMQ worker handlers", () => {
  it("queues finalize-artifact after a GPT Image 2 submit job succeeds", async () => {
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
        async submitGptImage({ taskId }) {
          assert.equal(taskId, "task-image-1");
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

    assert.deepEqual(result, { status: "submitted", queuedFinalize: true });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.queueName, "generation-finalize-artifact");
    assert.equal(added[0]?.name, "generation.image.finalize");
    assert.deepEqual(added[0]?.data, {
      taskId: "task-image-1",
      workflowId: "workflow-1",
      mediaType: "image",
      modelCode: "gpt-image-2-cn",
      providerExecutor: "gpt-image-2",
      artifactKind: "image",
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.image.finalize__task-image-1",
      attempts: 1,
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
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
        },
      },
      config: loadGenerationQueueConfig({
        GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        GENERATION_POLL_VIDEO_INTERVAL_MS: "5000",
      }),
      publisher: {
        async add(queueName, name, data, options) {
          added.push({ queueName, name, data, options });
        },
      },
      processors: {
        async submitSeedanceVideo() {
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
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.poll__task-1__1",
      delay: 5000,
      attempts: 1,
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
    });
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
          organizationId: "org-1",
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
      organizationId: "org-1",
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.submit.retry__task-1__1780444800000",
      delay: 2500,
      attempts: 1,
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
      config: loadGenerationQueueConfig({
        GENERATION_POLL_VIDEO_QUEUE: "generation-poll-video",
        GENERATION_POLL_VIDEO_INTERVAL_MS: "7000",
        GENERATION_POLL_VIDEO_MAX_ATTEMPTS: "3",
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
      delay: 7000,
      attempts: 1,
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
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.poll.rate-limit-retry__task-1__2__1780444800000",
      delay: 2500,
      attempts: 1,
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
        config: loadGenerationQueueConfig({
          GENERATION_POLL_VIDEO_MAX_ATTEMPTS: "3",
        }),
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
    });
    assert.deepEqual(added[0]?.options, {
      jobId: "generation.video.finalize__task-1",
      attempts: 1,
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 604800, count: 50000 },
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
          organizationId: "org-1",
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
            organizationId: "org-1",
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
      organizationId: "org-1",
      storageBucket: "creator-test",
    });
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
});
