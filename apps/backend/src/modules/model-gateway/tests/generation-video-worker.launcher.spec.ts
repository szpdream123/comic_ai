import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("generation video worker launcher", () => {
  it("exposes a BullMQ media worker script for GPT Image and Seedance queues", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-video-worker.mjs");

    assert.match(packageJson, /"worker:generation-video"/);
    assert.equal(existsSync(launcherPath), true);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /new Worker/);
    assert.match(launcherScript, /GENERATION_SUBMIT_IMAGE_QUEUE/);
    assert.match(launcherScript, /GENERATION_SUBMIT_VIDEO_QUEUE/);
    assert.match(launcherScript, /GENERATION_POLL_VIDEO_QUEUE/);
    assert.match(launcherScript, /handleGenerationSubmitImageJob/);
    assert.match(launcherScript, /handleGenerationSubmitVideoJob/);
    assert.match(launcherScript, /handleGenerationPollVideoJob/);
    assert.match(launcherScript, /processGptImageSubmitJob/);
    assert.match(launcherScript, /finalizeGptImageArtifactJob/);
    assert.match(launcherScript, /persistGptImageArtifactJob/);
    assert.match(launcherScript, /processSeedanceVideoSubmitJob/);
    assert.match(launcherScript, /processSeedanceVideoPollJob/);
    assert.match(launcherScript, /persistSeedanceVideoArtifactJob/);
    assert.match(launcherScript, /createRedisProviderRateLimiter/);
    assert.match(launcherScript, /rateLimiter/);
    assert.match(launcherScript, /finalizeRateLimiter: rateLimiter/);
    assert.match(launcherScript, /withDefaultStorageBucket\(job, storageRuntime\.bucket\)/);
    assert.match(launcherScript, /failGenerationTaskAfterQueueError/);
    assert.match(launcherScript, /job\.attemptsMade/);
    assert.match(launcherScript, /job\?\.opts\?\.attempts/);
    assert.match(launcherScript, /const SUBMIT_IMAGE_WORKER_CAPACITY = 20_000/);
    assert.match(launcherScript, /const SUBMIT_VIDEO_WORKER_CAPACITY = 10_000/);
    assert.doesNotMatch(launcherScript, /config\.submit\.image\.concurrency/);
    assert.doesNotMatch(launcherScript, /config\.submit\.image\.limiter/);
    assert.doesNotMatch(launcherScript, /config\.submit\.video\.concurrency/);
    assert.doesNotMatch(launcherScript, /config\.submit\.video\.limiter/);
    assert.match(launcherScript, /config\.poll\.video\.concurrency/);
    assert.match(launcherScript, /config\.poll\.video\.limiter\.max/);
  });
});
