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
    assert.match(launcherScript, /fetchGptImageArtifactJob/);
    assert.match(launcherScript, /persistGptImageArtifactJob/);
    assert.match(launcherScript, /processSeedanceVideoSubmitJob/);
    assert.match(launcherScript, /processSeedanceVideoPollJob/);
    assert.match(launcherScript, /persistSeedanceVideoArtifactJob/);
    assert.match(launcherScript, /fetchSeedanceVideoArtifactJob/);
    assert.match(launcherScript, /fetchAudioGenerationArtifactJob/);
    assert.match(launcherScript, /persistAudioGenerationArtifactJob/);
    assert.match(launcherScript, /data\.artifactStage === "fetch"/);
    assert.match(launcherScript, /createRedisProviderRateLimiter/);
    assert.match(launcherScript, /rateLimiter/);
    assert.match(launcherScript, /finalizeRateLimiter: rateLimiter/);
    assert.match(launcherScript, /withDefaultStorageBucket\(job, storageRuntime\.bucket\)/);
    assert.match(launcherScript, /failGenerationTaskAfterQueueError/);
    assert.match(launcherScript, /handleGptImageArtifactQueueExhaustion/);
    assert.match(launcherScript, /resolveGenerationArtifactQueueExhaustionFailureCode/);
    assert.match(launcherScript, /artifactQueueFailure && job\?\.data\?\.mediaType === "image"/);
    assert.match(launcherScript, /const attemptId = typeof job\?\.data\?\.attemptId === "string"/);
    assert.match(launcherScript, /handleGptImageArtifactQueueExhaustion\(db, \{[\s\S]*expectedAttemptId: attemptId \?\? null/);
    assert.match(launcherScript, /failGenerationTaskAfterQueueError\(db, \{[\s\S]*expectedAttemptId: attemptId \?\? null/);
    assert.match(launcherScript, /scheduleGenerationProviderPoll\(db, \{[\s\S]*expectedAttemptId: attemptId \?\? null/);
    assert.match(launcherScript, /handleGptImageArtifactQueueExhaustion\(db, \{[\s\S]*taskId,[\s\S]*error,[\s\S]*now: failedAt/);
    assert.match(launcherScript, /handled = imageRecoveryOutcome !== "skipped"/);
    assert.match(launcherScript, /shouldKeepGenerationDeadLetterForTask/);
    assert.match(launcherScript, /job\.attemptsMade/);
    assert.match(launcherScript, /job\?\.opts\?\.attempts/);
    assert.doesNotMatch(launcherScript, /SUBMIT_IMAGE_WORKER_CAPACITY/);
    assert.doesNotMatch(launcherScript, /SUBMIT_VIDEO_WORKER_CAPACITY/);
    assert.match(launcherScript, /config\.submit\.image\.concurrency/);
    assert.match(launcherScript, /config\.submit\.image\.limiter\.max/);
    assert.match(launcherScript, /config\.submit\.video\.concurrency/);
    assert.match(launcherScript, /config\.submit\.video\.limiter\.max/);
    assert.match(launcherScript, /config\.poll\.video\.concurrency/);
    assert.match(launcherScript, /config\.poll\.video\.limiter\.max/);
    assert.match(launcherScript, /trackGenerationAssignmentRelease\(job, "completed"\)/);
    assert.match(launcherScript, /trackGenerationAssignmentRelease\(job, "failed"\)/);
    assert.match(launcherScript, /shouldSettleGenerationTaskAfterQueueError/);
    assert.match(launcherScript, /if \(!taskId \|\| !shouldSettleGenerationTaskAfterQueueError\(/);
    assert.match(launcherScript, /reserveGenerationQueueStageForPublish/);
    assert.match(launcherScript, /hasReleasedGenerationQueueStageAssignment/);
    assert.match(launcherScript, /sourceAssignmentKey/);
    assert.match(launcherScript, /failGenerationTaskAfterQueueError\(db, \{[\s\S]*sourceAssignmentKey/);
    assert.match(
      launcherScript,
      /failureCode: artifactQueueFailure[\s\S]*resolveGenerationArtifactQueueExhaustionFailureCode/,
    );
    assert.match(launcherScript, /requireProviderSubmissionNotStarted: true/);
    assert.match(launcherScript, /generation_queue_assignment_already_released/);
    assert.match(launcherScript, /publishReservedGenerationJob\(\{[\s\S]*?\}\)\.catch\(async \(error\) => \{[\s\S]*?generation_queue_assignment_already_released[\s\S]*?hasReleasedGenerationQueueStageAssignment/);
    assert.match(launcherScript, /publishReservedGenerationJob/);
    assert.match(launcherScript, /markGenerationQueueStagePublished/);
    assert.doesNotMatch(launcherScript, /runGenerationAssignedJob/);
    assert.match(launcherScript, /reconcileGenerationQueueWorkerLeases/);
    assert.match(launcherScript, /dynamicWorkerReadyCallbacks/);
    assert.match(launcherScript, /generationWorkerLeaseMs = 20_000/);
    assert.match(launcherScript, /markGenerationQueueWorkerReady/);
    assert.match(launcherScript, /markGenerationQueueWorkerNotReady/);
    assert.match(launcherScript, /worker\.on\("ready", markWorkerReady\)/);
    assert.match(
      launcherScript,
      /config\.workerEnvironment === "production"[\s\S]*reconcileGenerationQueueWorkerLeases[\s\S]*prioritizedQueueNames\.slice/,
    );
    assert.match(launcherScript, /releaseGenerationQueueWorkerLeases/);
    assert.match(launcherScript, /prioritizeGenerationShards/);
    assert.match(launcherScript, /closeWorkersOnDiscoveryFailure: false/);
    assert.match(launcherScript, /onRefreshError/);
    assert.match(launcherScript, /runWithRedisStartupRetry/);
    assert.match(launcherScript, /const runnableCounts = await runWithRedisStartupRetry\(\{[\s\S]*readGenerationQueueRunnableCounts/);
    assert.match(launcherScript, /commandTimeout: 5_000/);
    assert.match(launcherScript, /maxRetriesPerRequest: 2/);
    assert.match(launcherScript, /readGenerationQueueRunnableCounts/);
    assert.match(launcherScript, /pipeline\.llen/);
    assert.match(launcherScript, /pipeline\.zcard/);
    assert.match(launcherScript, /Redis remained unavailable for 10s; shutting down this worker/);
    assert.match(launcherScript, /void requestShutdown\(`\$\{scope\}:redis_unavailable`\)/);
    assert.doesNotMatch(launcherScript, /Redis remained unavailable[\s\S]*process\.exit\(1\)/);
    assert.doesNotMatch(launcherScript, /GENERATION_WORKER_PROCESS_COUNT/);
    assert.doesNotMatch(launcherScript, /void releaseGenerationAssignment\(job/);

    const closeWorkersAt = launcherScript.indexOf("dynamicShardRunner?.close()");
    const drainReleasesAt = launcherScript.indexOf("await generationAssignmentReleases.drain()");
    const closeDatabaseAt = launcherScript.indexOf("db.close()");
    assert.ok(closeWorkersAt >= 0 && closeWorkersAt < drainReleasesAt);
    assert.ok(drainReleasesAt < closeDatabaseAt);
  });
});
