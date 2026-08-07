import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  canvasAgentOutboxWakeChannel,
  createCanvasAgentOutboxWakeSignal,
} from "../canvas-agent-outbox-wakeup.ts";

describe("Canvas Agent outbox wakeup", () => {
  it("coalesces notifications and retains a timeout fallback", async () => {
    const signal = createCanvasAgentOutboxWakeSignal();
    signal.notify();
    signal.notify();

    assert.equal(await signal.wait(100), "notified");
    assert.equal(await signal.wait(1), "timeout");
    signal.close();
    assert.equal(await signal.wait(100), "closed");
  });

  it("installs a PostgreSQL trigger for pending Canvas Agent events", () => {
    const migration = readFileSync(
      join(process.cwd(), "packages", "db", "migrations", "20260831-canvas-agent-outbox-wakeup.sql"),
      "utf8",
    );
    assert.match(migration, new RegExp(`pg_notify\\('${canvasAgentOutboxWakeChannel}'`));
    assert.match(migration, /AFTER INSERT OR UPDATE OF status, available_at ON canvas_agent_outbox/);
    const productionMigrations = readFileSync(join(process.cwd(), "scripts", "migrate-user-scope.mjs"), "utf8");
    assert.match(productionMigrations, /20260831-canvas-agent-outbox-wakeup\.sql/);
    const runtimeSafeBlock = productionMigrations.slice(
      productionMigrations.indexOf("const runtimeSafeMigrationNames"),
      productionMigrations.indexOf("const runtimeRequiredPostconditionMigrationNames"),
    );
    assert.match(runtimeSafeBlock, /20260831-canvas-agent-outbox-wakeup\.sql/);
  });
});
