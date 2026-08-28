import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadGenerationQueueConfig } from "../generation-queue.config.ts";
import {
  generationPollMaxAttempts,
  generationTimeoutMsFor,
  generationTimeoutMsForEnv,
} from "../generation-timeout.policy.ts";

describe("generation queue config", () => {
  it("defaults Seedance video polling to 3 hours at the 20 second interval", () => {
    const config = loadGenerationQueueConfig({});

    assert.equal(config.poll.video.intervalMs, 20_000);
    assert.equal(config.poll.video.maxAttempts, 540);
    assert.equal(config.queues.pollImage, "generation-poll-image");
    assert.equal(config.queues.pollAudio, "generation-poll-audio");
    assert.deepEqual(config.sharding, {
      enabled: false,
      capacity: 600,
      rateLimitMax: 5,
      rateLimitDurationMs: 1000,
      reopenThreshold: 300,
      maxActiveShardsPerStage: 256,
      workerQueuesPerProcess: 16,
      publishConcurrency: 32,
    });
    assert.equal(config.poll.image.intervalMs, 20_000);
    assert.equal(config.poll.image.maxAttempts, 180);
    assert.equal(config.poll.audio.intervalMs, 20_000);
    assert.equal(config.poll.audio.maxAttempts, 180);
    assert.equal(config.finalize.artifact.concurrency, 40);
    assert.deepEqual(config.submit.image, {
      concurrency: 20,
      limiter: { max: 0, durationMs: 1000 },
      userConcurrencyLimit: 20,
    });
    assert.deepEqual(config.submit.video, {
      concurrency: 10,
      limiter: { max: 0, durationMs: 1000 },
      userConcurrencyLimit: 10,
    });
    assert.deepEqual(config.health, {
      waitingCountThreshold: 1_000,
      failedCountThreshold: 100,
      oldestJobAgeMs: 300_000,
    });
    assert.deepEqual(config.retry, {
      submit: { attempts: 3, backoffMs: 5_000 },
      poll: { attempts: 20, backoffMs: 30_000 },
      finalize: { attempts: 3, backoffMs: 5_000 },
    });
    assert.deepEqual(config.artifactUpload, {
      retryAttempts: 10,
      retryDelayMs: 3000,
    });
  });

  it("uses one timeout policy for image, audio, and video generation", () => {
    assert.equal(generationTimeoutMsFor("image"), 60 * 60 * 1000);
    assert.equal(generationTimeoutMsFor("audio"), 60 * 60 * 1000);
    assert.equal(generationTimeoutMsFor("video"), 3 * 60 * 60 * 1000);
    assert.equal(generationPollMaxAttempts("audio"), 180);
    assert.equal(generationPollMaxAttempts("video"), 540);
  });

  it("configures the image polling window without changing the 60 minute default", () => {
    assert.equal(generationTimeoutMsForEnv("image", {}), 60 * 60 * 1000);
    assert.equal(generationTimeoutMsForEnv("image", {
      GENERATION_IMAGE_TIMEOUT_MS: String(2 * 60 * 60 * 1000),
    }), 2 * 60 * 60 * 1000);
    assert.equal(loadGenerationQueueConfig({
      GENERATION_IMAGE_TIMEOUT_MS: String(2 * 60 * 60 * 1000),
    }).poll.image.maxAttempts, 360);
  });

  it("loads active BullMQ queue and per-account generation settings from env", () => {
    const config = loadGenerationQueueConfig({
      REDIS_URL: "redis://127.0.0.1:6379/0",
      BULLMQ_QUEUE_PREFIX: "comic-ai-test",
      GENERATION_FINALIZE_ARTIFACT_CONCURRENCY: "40",
      GENERATION_FINALIZE_ARTIFACT_RATE_LIMIT_MAX: "40",
      GENERATION_FINALIZE_ARTIFACT_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "1000",
      GENERATION_OUTBOX_DISPATCH_BATCH_SIZE: "25",
      GENERATION_OUTBOX_DISPATCH_INTERVAL_MS: "1500",
      GENERATION_OUTBOX_RETRY_DELAY_MS: "45000",
      GENERATION_OUTBOX_MEMBERSHIP_QUANTUM: "3",
      GENERATION_REDIS_REPAIR_STALE_DISPATCH_MS: "180000",
      GENERATION_SUBMIT_IMAGE_USER_CONCURRENCY_LIMIT: "20",
      GENERATION_SUBMIT_VIDEO_USER_CONCURRENCY_LIMIT: "10",
      GENERATION_SUBMIT_IMAGE_CONCURRENCY: "12",
      GENERATION_SUBMIT_IMAGE_RATE_LIMIT_MAX: "9",
      GENERATION_SUBMIT_IMAGE_RATE_LIMIT_DURATION_MS: "2000",
      GENERATION_SUBMIT_VIDEO_CONCURRENCY: "6",
      GENERATION_SUBMIT_VIDEO_RATE_LIMIT_MAX: "5",
      GENERATION_SUBMIT_VIDEO_RATE_LIMIT_DURATION_MS: "3000",
      GENERATION_POLL_VIDEO_CONCURRENCY: "40",
      GENERATION_POLL_VIDEO_RATE_LIMIT_MAX: "40",
      GENERATION_POLL_VIDEO_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_POLL_IMAGE_QUEUE: "generation-poll-image-custom",
      GENERATION_POLL_IMAGE_CONCURRENCY: "30",
      GENERATION_POLL_IMAGE_RATE_LIMIT_MAX: "25",
      GENERATION_POLL_IMAGE_RATE_LIMIT_DURATION_MS: "1500",
      GENERATION_POLL_AUDIO_QUEUE: "generation-poll-audio-custom",
      GENERATION_POLL_AUDIO_CONCURRENCY: "22",
      GENERATION_POLL_AUDIO_RATE_LIMIT_MAX: "18",
      GENERATION_POLL_AUDIO_RATE_LIMIT_DURATION_MS: "1700",
      GENERATION_QUEUE_HEALTH_WAITING_COUNT_THRESHOLD: "500",
      GENERATION_QUEUE_HEALTH_FAILED_COUNT_THRESHOLD: "25",
      GENERATION_QUEUE_HEALTH_OLDEST_JOB_AGE_MS: "240000",
      GENERATION_POLL_RETRY_ATTEMPTS: "25",
      GENERATION_POLL_RETRY_BACKOFF_MS: "45000",
      GENERATION_QUEUE_SHARDING_ENABLED: "true",
      GENERATION_QUEUE_SHARD_CAPACITY: "600",
      GENERATION_QUEUE_SHARD_RATE_LIMIT_MAX: "5",
      GENERATION_QUEUE_SHARD_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_QUEUE_SHARD_REOPEN_THRESHOLD: "300",
      GENERATION_MAX_ACTIVE_SHARDS_PER_STAGE: "256",
      GENERATION_WORKER_QUEUES_PER_PROCESS: "16",
      GENERATION_DISPATCH_PUBLISH_CONCURRENCY: "32",
    });

    assert.equal(config.redisUrl, "redis://127.0.0.1:6379/0");
    assert.equal(config.queuePrefix, "comic-ai-test");
    assert.deepEqual(config.finalize.artifact, {
      concurrency: 40,
      limiter: { max: 40, durationMs: 1000 },
    });
    assert.deepEqual(config.artifactUpload, {
      retryAttempts: 3,
      retryDelayMs: 1000,
    });
    assert.deepEqual(config.outbox, {
      dispatchBatchSize: 25,
      dispatchIntervalMs: 1500,
      retryDelayMs: 45000,
      membershipQuantum: 3,
    });
    assert.deepEqual(config.sharding, {
      enabled: true,
      capacity: 600,
      rateLimitMax: 5,
      rateLimitDurationMs: 1000,
      reopenThreshold: 300,
      maxActiveShardsPerStage: 256,
      workerQueuesPerProcess: 16,
      publishConcurrency: 32,
    });
    assert.deepEqual(config.repair, {
      staleDispatchMs: 180000,
    });
    assert.deepEqual(config.submit.image, {
      concurrency: 12,
      limiter: { max: 9, durationMs: 2000 },
      userConcurrencyLimit: 20,
    });
    assert.deepEqual(config.submit.video, {
      concurrency: 6,
      limiter: { max: 5, durationMs: 3000 },
      userConcurrencyLimit: 10,
    });
    assert.deepEqual(config.health, {
      waitingCountThreshold: 500,
      failedCountThreshold: 25,
      oldestJobAgeMs: 240000,
    });
    assert.deepEqual(config.retry.poll, { attempts: 25, backoffMs: 45_000 });
    assert.deepEqual(config.poll.video, {
      intervalMs: 20_000,
      maxAttempts: 540,
      concurrency: 40,
      limiter: { max: 40, durationMs: 1000 },
    });
    assert.equal(config.queues.pollImage, "generation-poll-image-custom");
    assert.deepEqual(config.poll.image, {
      intervalMs: 20_000,
      maxAttempts: 180,
      concurrency: 30,
      limiter: { max: 25, durationMs: 1500 },
    });
    assert.equal(config.queues.pollAudio, "generation-poll-audio-custom");
    assert.deepEqual(config.poll.audio, {
      intervalMs: 20_000,
      maxAttempts: 180,
      concurrency: 22,
      limiter: { max: 18, durationMs: 1700 },
    });
  });

  it("defaults submit queues to bounded global and per-user concurrency", () => {
    const config = loadGenerationQueueConfig({});

    assert.deepEqual(config.submit.video, {
      concurrency: 10,
      limiter: { max: 0, durationMs: 1000 },
      userConcurrencyLimit: 10,
    });
    assert.deepEqual(config.submit.image, {
      concurrency: 20,
      limiter: { max: 0, durationMs: 1000 },
      userConcurrencyLimit: 20,
    });
    assert.equal(config.outbox.dispatchBatchSize, 20_000);
  });
});
