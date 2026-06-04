import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("generation outbox dispatcher launcher", () => {
  it("exposes a worker script that loads env, database, BullMQ publisher, and dispatcher", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const launcherPath = join(process.cwd(), "scripts", "run-generation-outbox-dispatcher.mjs");

    assert.match(packageJson, /"worker:generation-outbox"/);
    assert.equal(existsSync(launcherPath), true);

    const launcherScript = readFileSync(launcherPath, "utf8");
    assert.match(launcherScript, /loadDotEnvFile/);
    assert.match(launcherScript, /createDevDb/);
    assert.match(launcherScript, /loadGenerationQueueConfig/);
    assert.match(launcherScript, /createBullMQGenerationPublisher/);
    assert.match(launcherScript, /repairQueuedGenerationTaskOutbox/);
    assert.match(launcherScript, /repairRunningSeedancePollJobs/);
    assert.match(launcherScript, /dispatchGenerationOutboxBatch/);
  });
});
