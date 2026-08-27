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
    assert.match(source, /run-media-crawler-api\.mjs/);
    assert.match(source, /isProjectProcess/);
    assert.match(source, /DATABASE_URL\(PostgreSQL\)/);
    assert.match(source, /REDIS_URL\(Redis\)/);
    assert.match(source, /await client\.query\("SELECT 1"\)/);
    assert.match(source, /await redis\.ping\(\)/);
    assert.match(source, /MEDIA_CRAWLER_MANAGED/);
  });

  it("gates MediaCrawler startup and readiness on MEDIA_CRAWLER_MANAGED", () => {
    const stackSource = readFileSync(join(process.cwd(), "scripts/run-creator-dev-stack.mjs"), "utf8");
    const startSource = readFileSync(join(process.cwd(), "scripts/start-dev-detached.mjs"), "utf8");
    assert.match(stackSource, /const mediaCrawlerManaged = isEnabled\(process\.env\.MEDIA_CRAWLER_MANAGED \?\? "true"\)/);
    assert.match(stackSource, /if \(mediaCrawlerManaged\) \{[\s\S]*supervisor\.start\("media-crawler"/);
    assert.match(startSource, /if \(isEnabled\(process\.env\.MEDIA_CRAWLER_MANAGED \?\? "true"\)\) \{[\s\S]*requiredLogMarkers\.push/);
  });

  it("hides Windows command windows for startup, status, and stop subprocesses", () => {
    for (const relativePath of [
      "runtime-schema-migrations.mjs",
      "run-creator-dev-stack.mjs",
      "run-phone-auth-dev-server.mjs",
      "run-phone-auth-http-only.mjs",
      "run-phone-auth-production.mjs",
      "start-dev-detached.mjs",
      "start-http-only-detached.mjs",
      "status-http-only-detached.mjs",
      "stop-dev-detached.mjs",
      "stop-http-only-detached.mjs",
    ]) {
      const source = readFileSync(join(process.cwd(), "scripts", relativePath), "utf8");
      const childProcessCalls = source.match(/\bspawnSync\(/g) ?? [];
      const hiddenWindows = source.match(/windowsHide:\s*true/g) ?? [];

      assert.ok(
        hiddenWindows.length >= childProcessCalls.length,
        `${relativePath} must hide every synchronous startup subprocess on Windows`,
      );
    }
  });
});
