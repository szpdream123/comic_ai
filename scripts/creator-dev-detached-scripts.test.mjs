import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("creator dev detached scripts", () => {
  it("loads .env and validates process ownership before replacing listeners", () => {
    const source = readFileSync(join(process.cwd(), "scripts/start-dev-detached.mjs"), "utf8");
    assert.match(source, /loadDotEnvFile/);
    assert.match(source, /configuredPort/);
    assert.match(source, /isProjectProcess/);
    assert.match(source, /outside this project/);
    assert.match(source, /rotateLog/);
    assert.match(source, /waitForStackReady/);
    assert.match(source, /status-dev-detached\.mjs/);
    assert.match(source, /already running but unhealthy/);
    assert.match(source, /startup readiness markers are incomplete/);
    assert.match(source, /terminateProcessTree\(child\.pid\)/);
  });

  it("requests graceful stop before the force-kill fallback", () => {
    const source = readFileSync(join(process.cwd(), "scripts/stop-dev-detached.mjs"), "utf8");
    const requestAt = source.indexOf("writeFileSync(stopRequestFile");
    const forceAt = source.indexOf('"taskkill"');
    assert.ok(requestAt >= 0 && requestAt < forceAt);
    assert.match(source, /isProjectProcess/);
    assert.match(source, /waitForExit/);
  });

  it("checks every expected child service and project-owned listener", () => {
    const source = readFileSync(join(process.cwd(), "scripts/status-dev-detached.mjs"), "utf8");
    assert.match(source, /loadDotEnvFile/);
    assert.match(source, /run-generation-outbox-dispatcher\.mjs/);
    assert.match(source, /run-generation-queue-maintenance\.mjs/);
    assert.match(source, /run-generation-video-worker\.mjs/);
    assert.match(source, /run-canvas-agent-worker\.mjs/);
    assert.match(source, /isProjectProcess/);
    assert.match(source, /DATABASE_URL\(PostgreSQL\)/);
    assert.match(source, /REDIS_URL\(Redis\)/);
    assert.match(source, /await client\.query\("SELECT 1"\)/);
    assert.match(source, /await redis\.ping\(\)/);
  });
});
