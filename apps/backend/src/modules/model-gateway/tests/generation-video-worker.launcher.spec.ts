import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("generation worker launcher", () => {
  it("starts the nine fixed queues with the configured per-queue limiter", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-video-worker.mjs");

    assert.match(packageJson, /"worker:generation-video"/);
    assert.equal(existsSync(launcherPath), true);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /new Worker/);
    assert.match(launcherScript, /config\.queueNames\.submit\.map/);
    assert.match(launcherScript, /config\.queueNames\.poll\.map/);
    assert.match(launcherScript, /config\.queueNames\.result\.map/);
    assert.match(launcherScript, /max: config\.queueLimits\.dequeueRateLimitMax/);
    assert.match(launcherScript, /duration: config\.queueLimits\.dequeueRateLimitDurationMs/);
    assert.match(launcherScript, /keepAlive:\s*30_000/);
    assert.match(launcherScript, /handleGenerationSubmitImageJob/);
    assert.match(launcherScript, /handleGenerationSubmitVideoJob/);
    assert.match(launcherScript, /handleGenerationSubmitAudioJob/);
    assert.match(launcherScript, /handleGenerationPollImageJob/);
    assert.match(launcherScript, /handleGenerationPollVideoJob/);
    assert.match(launcherScript, /handleGenerationPollAudioJob/);
    assert.match(launcherScript, /handleGenerationFinalizeArtifactJob/);
    assert.match(launcherScript, /config\.queueNames\.result\.includes\(queueName\)/);
    assert.doesNotMatch(launcherScript, /dynamicShardRunner/);
    assert.doesNotMatch(launcherScript, /GENERATION_SUBMIT_IMAGE_QUEUE/);
    assert.doesNotMatch(launcherScript, /GENERATION_SUBMIT_VIDEO_QUEUE/);
    assert.doesNotMatch(launcherScript, /GENERATION_POLL_IMAGE_QUEUE/);
    assert.doesNotMatch(launcherScript, /GENERATION_POLL_VIDEO_QUEUE/);
    assert.doesNotMatch(launcherScript, /GENERATION_POLL_AUDIO_QUEUE/);
  });
});
