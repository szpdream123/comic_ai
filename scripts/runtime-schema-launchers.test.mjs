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

  it("locks the production launcher before migrations or child services start", async () => {
    const source = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    const lockOffset = source.indexOf("acquireProcessInstanceLock(");
    const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
    const firstSpawnOffset = source.indexOf("supervisor.start(");

    assert.ok(lockOffset >= 0, "production launcher must acquire an instance lock");
    assert.ok(lockOffset < migrationOffset, "production launcher must lock before migrations");
    assert.ok(lockOffset < firstSpawnOffset, "production launcher must lock before child services");
  });

  it("prepares the foundation schema once before every managed production child starts", async () => {
    const source = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    const databaseSource = await readFile(
      new URL("../apps/backend/src/modules/shared/db/dev-db.ts", import.meta.url),
      "utf8",
    );
    const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
    const foundationOffset = source.indexOf("runProductionFoundationSchema({");
    const firstSpawnOffset = source.indexOf("supervisor.start(");

    assert.ok(foundationOffset > migrationOffset, "foundation preparation must follow runtime migrations");
    assert.ok(foundationOffset < firstSpawnOffset, "foundation preparation must finish before child services start");
    assert.match(source, /CREATOR_DEV_STACK_MANAGED:\s*"true",\s*CREATOR_DEV_SCHEMA_READY:\s*"true"/);
    assert.doesNotMatch(source, /name === "phone-auth"[^\n]*CREATOR_DEV_SCHEMA_READY/);
    assert.match(source, /timeout:\s*productionFoundationSchemaTimeoutMs/);
    assert.match(databaseSource, /CREATOR_DEV_STACK_MANAGED === "true"[\s\S]*CREATOR_DEV_SCHEMA_READY === "true"/);
  });

  it("prepares the foundation schema once before every managed development child starts", async () => {
    const source = await readFile(new URL("run-creator-dev-stack.mjs", import.meta.url), "utf8");
    const migrationOffset = source.indexOf("runRuntimeSchemaMigrations(");
    const foundationOffset = source.indexOf("runDevFoundationSchema({");
    const firstSpawnOffset = source.indexOf("supervisor.start(");

    assert.ok(foundationOffset > migrationOffset, "foundation preparation must follow runtime migrations");
    assert.ok(foundationOffset < firstSpawnOffset, "foundation preparation must finish before child services start");
    assert.match(source, /production-foundation-schema\.ts/);
    assert.match(source, /CREATOR_DEV_STACK_MANAGED:\s*"true",\s*CREATOR_DEV_SCHEMA_READY:\s*"true"/);
    assert.match(source, /timeout:\s*devFoundationSchemaTimeoutMs/);
  });

  it("bounds production shutdown so a stuck worker cannot block a restart forever", async () => {
    const source = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    assert.match(source, /function requestStop\(signal\)/);
    assert.match(source, /supervisor\.forceStop\(signal\)/);
    assert.match(source, /Graceful shutdown exceeded 10s/);
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
    const databaseSource = await readFile(
      new URL("../apps/backend/src/modules/shared/db/dev-db.ts", import.meta.url),
      "utf8",
    );

    assert.match(helperSource, /timeout:\s*RUNTIME_SCHEMA_MIGRATION_TIMEOUT_MS/);
    assert.match(runnerSource, /pg_try_advisory_lock/);
    assert.match(runnerSource, /current_database\(\)/);
    assert.match(runnerSource, /current_schema\(\)/);
    assert.doesNotMatch(runnerSource, /SELECT pg_advisory_lock/);
    assert.match(runnerSource, /connectPostgresClientWithRetry/);
    assert.doesNotMatch(runnerSource, /new pg\.Client/);
    assert.match(databaseSource, /ECONNABORTED/);
  });

  it("retries PostgreSQL LISTEN connections before supervised workers exit", async () => {
    for (const relativePath of [
      "run-generation-outbox-dispatcher.mjs",
      "run-canvas-agent-worker.mjs",
    ]) {
      const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
      assert.match(source, /connectPostgresClientWithRetry/);
      assert.match(source, /envKey:\s*"DATABASE_URL"/);
      assert.doesNotMatch(source, /new Client\(/);
    }
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
    assert.match(productionSource, /MEDIA_CRAWLER_MANAGED/);
    assert.match(productionSource, /MediaCrawler must run outside this server/);
  });

  it("does not auto-start the HTTP entrypoint from a supervised worker bundle", async () => {
    const source = await readFile(
      new URL("../apps/backend/src/entrypoints/phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const directExecutionBlock = source.slice(source.lastIndexOf("if (\n  process.env.CREATOR_DEV_STACK_MANAGED"));

    assert.match(directExecutionBlock, /CREATOR_DEV_STACK_MANAGED !== "true"/);
    assert.match(directExecutionBlock, /import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/);
  });

  it("builds production runtime entries once and starts children with Node directly", async () => {
    const productionSource = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    const buildSource = await readFile(new URL("build-production-runtime.mjs", import.meta.url), "utf8");

    assert.match(productionSource, /buildProductionRuntime/);
    assert.match(productionSource, /productionRuntime\.generationWorker/);
    assert.doesNotMatch(productionSource, /resolveTsxRuntimeArgs\(runtime\)/);
    assert.match(buildSource, /bundle:\s*true/);
    assert.match(buildSource, /packages:\s*"external"/);
    assert.match(buildSource, /target:\s*"node18"/);
    assert.match(buildSource, /Reusing cached production runtime/);
    assert.match(buildSource, /metafile:\s*true/);
    assert.match(buildSource, /package-lock\.json/);
    assert.match(buildSource, /split\(sep\)\.join\("\/"\)/);
    assert.match(buildSource, /run-generation-outbox-dispatcher\.mjs/);
    assert.match(buildSource, /run-generation-queue-maintenance\.mjs/);
    assert.match(buildSource, /run-generation-video-worker\.mjs/);
    assert.match(buildSource, /run-canvas-agent-worker\.mjs/);
    assert.match(buildSource, /run-media-crawler-api\.mjs/);
    assert.match(buildSource, /run-marketing-competitor-collection-worker\.mjs/);
    assert.match(buildSource, /production-foundation-schema\.ts/);
  });

  it("builds the production web bundle before supervised services start", async () => {
    const productionSource = await readFile(new URL("run-phone-auth-production.mjs", import.meta.url), "utf8");
    const webBuildOffset = productionSource.indexOf("await buildProductionWeb");
    const firstServiceStartOffset = productionSource.indexOf('supervisor.start("phone-auth"');

    assert.match(productionSource, /import \{ buildProductionWeb \} from "\.\/build-production-web\.mjs"/);
    assert.ok(webBuildOffset >= 0);
    assert.ok(webBuildOffset < firstServiceStartOffset);
    assert.match(productionSource, /PRODUCTION_WEB_ENTRY_URL\s*=\s*productionWeb\.entryUrl/);
  });

  it("retries only a transient generation maintenance database connection timeout", async () => {
    const source = await readFile(new URL("run-generation-queue-maintenance.mjs", import.meta.url), "utf8");
    const retryHelper = source.slice(
      source.indexOf("async function createGenerationMaintenanceDb"),
      source.indexOf("\ntry {", source.indexOf("async function createGenerationMaintenanceDb")),
    );

    assert.match(retryHelper, /Connection terminated due to connection timeout/);
    assert.match(retryHelper, /await sleep\(500\)/);
    assert.equal((retryHelper.match(/createDevDb\(\)/g) ?? []).length, 2);
    assert.match(retryHelper, /throw error/);
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
    assert.doesNotMatch(runtimeSafeBlock, /20260828-bananarouter-image-async-config-convergence\.sql/);
    assert.match(runnerSource, /runtimeRequiredPostconditionMigrationNames/);
    assert.match(runnerSource, /indisvalid/);
    assert.match(runnerSource, /indisready/);
    assert.match(runnerSource, /pg_get_indexdef/);
    assert.match(runnerSource, /pg_get_constraintdef/);
  });
});
