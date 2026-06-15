import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

describe("generation queue config", () => {
  it("defaults Seedance video polling to 3 hours at the 5 second interval", () => {
    const config = loadGenerationQueueConfig({});

    assert.equal(config.poll.video.intervalMs, 5000);
    assert.equal(config.poll.video.maxAttempts, 2160);
  });

  it("loads BullMQ finalize concurrency, limiter, and artifact upload retry settings from env", () => {
    const config = loadGenerationQueueConfig({
      REDIS_URL: "redis://127.0.0.1:6379/0",
      BULLMQ_QUEUE_PREFIX: "comic-ai-test",
      GENERATION_FINALIZE_VIDEO_CONCURRENCY: "40",
      GENERATION_FINALIZE_IMAGE_CONCURRENCY: "100",
      GENERATION_FINALIZE_VIDEO_RATE_LIMIT_MAX: "40",
      GENERATION_FINALIZE_VIDEO_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_FINALIZE_IMAGE_RATE_LIMIT_MAX: "100",
      GENERATION_FINALIZE_IMAGE_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS: "3",
      GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS: "1000",
      GENERATION_OUTBOX_DISPATCH_BATCH_SIZE: "25",
      GENERATION_OUTBOX_DISPATCH_INTERVAL_MS: "1500",
      GENERATION_OUTBOX_RETRY_DELAY_MS: "45000",
      GENERATION_REDIS_REPAIR_STALE_DISPATCH_MS: "180000",
      GENERATION_SUBMIT_VIDEO_CONCURRENCY: "12",
      GENERATION_SUBMIT_VIDEO_RATE_LIMIT_MAX: "24",
      GENERATION_SUBMIT_VIDEO_RATE_LIMIT_DURATION_MS: "1000",
      GENERATION_POLL_VIDEO_INTERVAL_MS: "5000",
      GENERATION_POLL_VIDEO_MAX_ATTEMPTS: "120",
      GENERATION_POLL_VIDEO_CONCURRENCY: "40",
      GENERATION_POLL_VIDEO_RATE_LIMIT_MAX: "40",
      GENERATION_POLL_VIDEO_RATE_LIMIT_DURATION_MS: "1000",
    });

    assert.equal(config.redisUrl, "redis://127.0.0.1:6379/0");
    assert.equal(config.queuePrefix, "comic-ai-test");
    assert.deepEqual(config.finalize.video, {
      concurrency: 40,
      limiter: { max: 40, durationMs: 1000 },
    });
    assert.deepEqual(config.finalize.image, {
      concurrency: 100,
      limiter: { max: 100, durationMs: 1000 },
    });
    assert.deepEqual(config.artifactUpload, {
      retryAttempts: 3,
      retryDelayMs: 1000,
    });
    assert.deepEqual(config.outbox, {
      dispatchBatchSize: 25,
      dispatchIntervalMs: 1500,
      retryDelayMs: 45000,
    });
    assert.deepEqual(config.repair, {
      staleDispatchMs: 180000,
    });
    assert.deepEqual(config.submit.video, {
      concurrency: 12,
      limiter: { max: 24, durationMs: 1000 },
    });
    assert.deepEqual(config.poll.video, {
      intervalMs: 5000,
      maxAttempts: 120,
      concurrency: 40,
      limiter: { max: 40, durationMs: 1000 },
    });
  });
});
