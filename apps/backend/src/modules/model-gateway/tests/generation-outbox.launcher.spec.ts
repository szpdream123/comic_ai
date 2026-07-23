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
    assert.doesNotMatch(launcherScript, /repairQueuedGenerationTaskOutbox/);
    assert.doesNotMatch(launcherScript, /repairRunningSeedancePollJobs/);
    assert.doesNotMatch(launcherScript, /enqueueDueGenerationPolls/);
  });

  it("exposes repair, due-poll, and shard lifecycle as an independent worker", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-queue-maintenance.mjs");
    const devStack = readFileSync(join(process.cwd(), "scripts", "run-creator-dev-stack.mjs"), "utf8");

    assert.match(packageJson, /"worker:generation-repair"/);
    assert.equal(existsSync(launcherPath), true);
    assert.match(devStack, /startService\("generation-repair"/);
    assert.match(devStack, /run-generation-queue-maintenance\.mjs/);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /failStaleGenerationTasksBeforeProviderSubmission/);
    assert.match(launcherScript, /repairExpiredGenerationSubmitLeases/);
    assert.match(launcherScript, /repairQueuedGenerationTaskOutbox/);
    assert.match(launcherScript, /repairRunningSeedancePollJobs/);
    assert.match(launcherScript, /enqueueDueGenerationPolls/);
    assert.match(launcherScript, /retireIdleGenerationQueueShards/);
    assert.doesNotMatch(launcherScript, /dispatchGenerationOutboxBatch/);
  });
});
