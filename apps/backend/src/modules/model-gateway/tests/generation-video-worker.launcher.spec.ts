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
    assert.match(launcherScript, /config\.finalize\.image\.concurrency/);
    assert.match(launcherScript, /config\.finalize\.image\.limiter\.max/);
    assert.match(launcherScript, /config\.submit\.video\.concurrency/);
    assert.match(launcherScript, /config\.submit\.video\.limiter\.max/);
    assert.match(launcherScript, /config\.poll\.video\.concurrency/);
    assert.match(launcherScript, /config\.poll\.video\.limiter\.max/);
  });
});
