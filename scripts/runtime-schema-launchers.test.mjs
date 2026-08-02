import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("runtime schema migration launchers", () => {
  it("runs pending migrations before any API or worker process starts", async () => {
    for (const relativePath of [
      "run-phone-auth-production.mjs",
      "run-creator-dev-stack.mjs",
      "run-phone-auth-dev-server.mjs",
    ]) {
      const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
      const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
      const firstSpawnOffset = source.indexOf("supervisor.start(") >= 0
        ? source.indexOf("supervisor.start(")
        : source.indexOf("spawn(runtime, serverArgs");

      assert.ok(migrationOffset >= 0, `${relativePath} must run schema migrations`);
      assert.ok(firstSpawnOffset >= 0, `${relativePath} must start a runtime process`);
      assert.ok(
        migrationOffset < firstSpawnOffset,
        `${relativePath} must migrate before starting runtime processes`,
      );
    }
  });

  it("rejects the development launcher in production before touching the schema", async () => {
    const source = await readFile(new URL("run-phone-auth-dev-server.mjs", import.meta.url), "utf8");
    const productionGuardOffset = source.indexOf('if (process.env.NODE_ENV === "production")');
    const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");

    assert.ok(productionGuardOffset >= 0, "development launcher must reject production mode");
    assert.ok(migrationOffset >= 0, "development launcher must run schema migrations");
    assert.ok(
      productionGuardOffset < migrationOffset,
      "development launcher must reject production mode before running schema migrations",
    );
  });

  it("runs the migration gate only once when the development launcher hands off to the full stack", async () => {
    const source = await readFile(new URL("run-phone-auth-dev-server.mjs", import.meta.url), "utf8");
    const stackHandoffOffset = source.indexOf("spawnSync(runtime, [stackEntrypoint]");
    const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
    const apiSpawnOffset = source.indexOf("spawn(runtime, serverArgs");

    assert.ok(stackHandoffOffset >= 0, "development launcher must support full-stack handoff");
    assert.ok(
      stackHandoffOffset < migrationOffset,
      "full-stack handoff must let the stack own the migration gate",
    );
    assert.ok(migrationOffset < apiSpawnOffset, "direct API startup must still migrate first");
  });

  it("bounds both migration lock waiting and the migration child process", async () => {
    const helperSource = await readFile(new URL("runtime-schema-migrations.mjs", import.meta.url), "utf8");
    const runnerSource = await readFile(new URL("migrate-user-scope.mjs", import.meta.url), "utf8");

    assert.match(helperSource, /timeout:\s*RUNTIME_SCHEMA_MIGRATION_TIMEOUT_MS/);
    assert.match(runnerSource, /pg_try_advisory_lock/);
    assert.match(runnerSource, /current_database\(\)/);
    assert.match(runnerSource, /current_schema\(\)/);
    assert.doesNotMatch(runnerSource, /SELECT pg_advisory_lock/);
  });

  it("gates every standalone worker without rerunning the gate under a supervisor", async () => {
    for (const relativePath of [
      "run-generation-outbox-dispatcher.mjs",
      "run-generation-queue-maintenance.mjs",
      "run-generation-video-worker.mjs",
      "run-canvas-agent-worker.mjs",
      "run-membership-maintenance.mjs",
    ]) {
      const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
      const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
      const firstRuntimeImportOffset = source.indexOf("await Promise.all(");

      assert.ok(migrationOffset >= 0, `${relativePath} must gate standalone startup`);
      assert.ok(
        migrationOffset < firstRuntimeImportOffset,
        `${relativePath} must migrate before loading worker services`,
      );
      assert.match(source, /CREATOR_DEV_STACK_MANAGED/);
    }

    const productionSource = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    assert.match(productionSource, /CREATOR_DEV_STACK_MANAGED:\s*"true"/);
  });

  it("keeps rollout-unsafe data flips out of the runtime startup gate", async () => {
    const helperSource = await readFile(new URL("runtime-schema-migrations.mjs", import.meta.url), "utf8");
    const runnerSource = await readFile(new URL("migrate-user-scope.mjs", import.meta.url), "utf8");

    assert.match(helperSource, /"--runtime-safe"/);
    assert.match(runnerSource, /runtimeSafeMigrationNames/);
    assert.match(runnerSource, /20260825-bananarouter-image-async-recovery\.sql/);
    const runtimeSafeBlock = runnerSource.slice(
      runnerSource.indexOf("const runtimeSafeMigrationNames"),
      runnerSource.indexOf("const runtimeRequiredPostconditionMigrationNames"),
    );
    assert.doesNotMatch(runtimeSafeBlock, /20260823-canvas-agent-queue-shards\.sql/);
    assert.match(runnerSource, /runtimeRequiredPostconditionMigrationNames/);
    assert.match(runnerSource, /indisvalid/);
    assert.match(runnerSource, /indisready/);
    assert.match(runnerSource, /pg_get_indexdef/);
    assert.match(runnerSource, /pg_get_constraintdef/);
  });
});
