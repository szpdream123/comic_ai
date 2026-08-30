import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("generation queue launchers", () => {
  it("keeps the existing worker command focused on hot outbox dispatch", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-outbox-dispatcher.mjs");

    assert.match(packageJson, /"worker:generation-outbox"/);
    assert.equal(existsSync(launcherPath), true);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /createDevDb/);
    assert.match(launcherScript, /loadGenerationQueueConfig/);
    assert.match(launcherScript, /createBullMQGenerationPublisher/);
    assert.match(launcherScript, /dispatchGenerationOutboxBatch/);
    assert.match(launcherScript, /LISTEN.*generationOutboxWakeChannel/);
    assert.match(launcherScript, /wakeSignal\.wait/);
    assert.match(launcherScript, /dispatchIntervalMs/);
    assert.match(launcherScript, /generationOutboxDispatcherHeartbeatKey/);
    assert.match(launcherScript, /writeDispatcherHeartbeat/);
    assert.match(launcherScript, /runWithRedisStartupRetry/);
    assert.match(launcherScript, /writeDispatcherHeartbeatWithRetry/);
    assert.match(launcherScript, /connectTimeout:\s*2_000/);
    assert.match(launcherScript, /commandTimeout:\s*5_000/);
    assert.match(launcherScript, /keepAlive:\s*30_000/);
    assert.match(launcherScript, /maxRetriesPerRequest:\s*1/);
    assert.match(launcherScript, /enableOfflineQueue:\s*false/);
    assert.match(launcherScript, /Dispatcher stalled/);
    assert.match(launcherScript, /Math\.max\(120_000, heartbeatTtlMs \* 2\)/);
    assert.match(launcherScript, /process\.exit\(1\)/);
    assert.doesNotMatch(launcherScript, /repairQueuedGenerationTaskOutbox/);
    assert.doesNotMatch(launcherScript, /repairRunningSeedancePollJobs/);
    assert.doesNotMatch(launcherScript, /enqueueDueGenerationPolls/);
  });

  it("exposes repair and due-poll handling as an independent worker", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-queue-maintenance.mjs");
    const devStack = readFileSync(join(process.cwd(), "scripts", "run-creator-dev-stack.mjs"), "utf8");

    assert.match(packageJson, /"worker:generation-repair"/);
    assert.equal(existsSync(launcherPath), true);
    assert.match(devStack, /run-comic-ai-shared-runtime\.mjs/);
    assert.match(devStack, /restartOnFailure: true/);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /failStaleGenerationTasksBeforeProviderSubmission/);
    assert.match(launcherScript, /repairFailedGptImageSubmissions/);
    assert.match(launcherScript, /"failed_image_submission_repair"/);
    assert.match(launcherScript, /failedImageSubmissionRepairBatchLimit = 100/);
    assert.match(launcherScript, /limit:\s*Math\.min\(config\.outbox\.dispatchBatchSize, failedImageSubmissionRepairBatchLimit\)/);
    assert.match(launcherScript, /repairExpiredGenerationSubmitLeases/);
    assert.match(launcherScript, /repairQueuedGenerationTaskOutbox/);
    assert.match(launcherScript, /repairRunningSeedancePollJobs/);
    assert.match(launcherScript, /enqueueDueGenerationPolls/);
    assert.match(launcherScript, /reconcileActiveCanvasGenerationBatches/);
    assert.match(launcherScript, /createCanvasGenerationBatchDispatch/);
    assert.match(launcherScript, /restoreCanvasActorScope/);
    assert.match(launcherScript, /reconcileCanvasMediaDerivations/);
    assert.match(launcherScript, /findGenerationArtifactHandoff/);
    assert.match(launcherScript, /runMaintenanceStep/);
    assert.match(launcherScript, /stepFailed=/);
    assert.match(launcherScript, /GenerationMaintenanceStepTimeoutError/);
    assert.match(launcherScript, /cleanupDeadlineExceeded=true forcingExit=1/);
    assert.match(launcherScript, /process\.exit\(1\)/);
    assert.match(launcherScript, /clearTimeout\(forcedExitTimer\)/);
    assert.doesNotMatch(launcherScript, /dispatchGenerationOutboxBatch/);
  });
});
