import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import {
  fingerprintSnapshot,
  readSchemaSnapshot,
} from "./verify-user-centric-baseline.mjs";
import { connectPostgresClientWithRetry } from "./postgres-startup-retry.mjs";

const migrations = [
  ["user-centric-schema.sql", "packages/db/baseline/user-centric-schema.sql"],
  ["model-reference-seed.sql", "packages/db/baseline/model-reference-seed.sql"],
  ["20260718-create-director-desks.sql", "packages/db/migrations/20260718-create-director-desks.sql"],
  ["20260718-create-team-member-director-desks.sql", "packages/db/migrations/20260718-create-team-member-director-desks.sql"],
  ["20260720-add-aliyun-bailian-audio-model.sql", "packages/db/migrations/20260720-add-aliyun-bailian-audio-model.sql"],
  ["20260720-correct-cosyvoice-v2-contract.sql", "packages/db/migrations/20260720-correct-cosyvoice-v2-contract.sql"],
  ["20260720-enable-project-multi-canvases.sql", "packages/db/migrations/20260720-enable-project-multi-canvases.sql"],
  ["20260720-create-creator-agent-assets.sql", "packages/db/migrations/20260720-create-creator-agent-assets.sql"],
  ["20260720-create-creator-brand-kits.sql", "packages/db/migrations/20260720-create-creator-brand-kits.sql"],
  ["20260721-align-globalaiopc-video-doc-contract.sql", "packages/db/migrations/20260721-align-globalaiopc-video-doc-contract.sql"],
  ["20260721-align-lingdong-api-doc-contract.sql", "packages/db/migrations/20260721-align-lingdong-api-doc-contract.sql"],
  ["20260721-align-cumob-image-contract.sql", "packages/db/migrations/20260721-align-cumob-image-contract.sql"],
  ["20260721-create-creator-tool-presets.sql", "packages/db/migrations/20260721-create-creator-tool-presets.sql"],
  ["20260721-generation-outbox-reliability.sql", "packages/db/migrations/20260721-generation-outbox-reliability.sql"],
  ["20260721-unify-generation-timeout-policy.sql", "packages/db/migrations/20260721-unify-generation-timeout-policy.sql"],
  ["20260721-z-remove-legacy-generation-strategy-overrides.sql", "packages/db/migrations/20260721-z-remove-legacy-generation-strategy-overrides.sql"],
  ["20260721-zz-remove-legacy-provider-configs.sql", "packages/db/migrations/20260721-zz-remove-legacy-provider-configs.sql"],
  ["20260722-align-cumob-async-polling.sql", "packages/db/migrations/20260722-align-cumob-async-polling.sql"],
  ["20260722-canvas-generation-scope.sql", "packages/db/migrations/20260722-canvas-generation-scope.sql"],
  ["20260722-cleanup-standalone-canvas-project-shells.sql", "packages/db/migrations/20260722-cleanup-standalone-canvas-project-shells.sql"],
  ["20260722-create-project-source-documents.sql", "packages/db/migrations/20260722-create-project-source-documents.sql"],
  ["20260722-decouple-canvases-from-projects.sql", "packages/db/migrations/20260722-decouple-canvases-from-projects.sql"],
  ["20260722-decouple-scripts-from-projects.sql", "packages/db/migrations/20260722-decouple-scripts-from-projects.sql"],
  ["20260722-generation-due-poll.sql", "packages/db/migrations/20260722-generation-due-poll.sql"],
  ["20260722-generation-outbox-fair-dispatch.sql", "packages/db/migrations/20260722-generation-outbox-fair-dispatch.sql"],
  ["20260722-generation-provider-route-snapshots.sql", "packages/db/migrations/20260722-generation-provider-route-snapshots.sql"],
  ["20260722-generation-queue-elastic-shards.sql", "packages/db/migrations/20260722-generation-queue-elastic-shards.sql"],
  ["20260722-generation-stage-successors.sql", "packages/db/migrations/20260722-generation-stage-successors.sql"],
  ["20260722-generation-webhook-inbox.sql", "packages/db/migrations/20260722-generation-webhook-inbox.sql"],
  ["20260722-task-center-incremental-indexes.sql", "packages/db/migrations/20260722-task-center-incremental-indexes.sql"],
  ["20260722-zzz-normalize-generation-task-snapshot-timeouts.sql", "packages/db/migrations/20260722-zzz-normalize-generation-task-snapshot-timeouts.sql"],
  ["20260723-correct-generation-queue-lifecycle.sql", "packages/db/migrations/20260723-correct-generation-queue-lifecycle.sql"],
  ["20260724-durable-generation-queue-assignment-lifecycle.sql", "packages/db/migrations/20260724-durable-generation-queue-assignment-lifecycle.sql"],
  ["20260725-create-canvas-agent-runtime.sql", "packages/db/migrations/20260725-create-canvas-agent-runtime.sql"],
  ["20260725-generation-queue-worker-leases.sql", "packages/db/migrations/20260725-generation-queue-worker-leases.sql"],
  ["20260725-z-generation-queue-admin-commands.sql", "packages/db/migrations/20260725-z-generation-queue-admin-commands.sql"],
  ["20260726-generation-queue-job-cancellations.sql", "packages/db/migrations/20260726-generation-queue-job-cancellations.sql"],
  ["20260727-generation-queue-publish-cancellation-fencing.sql", "packages/db/migrations/20260727-generation-queue-publish-cancellation-fencing.sql"],
  ["20260727-generation-queue-worker-lease-db-clock.sql", "packages/db/migrations/20260727-generation-queue-worker-lease-db-clock.sql"],
  ["20260728-canvas-actor-principals.sql", "packages/db/migrations/20260728-canvas-actor-principals.sql"],
  ["20260728-comfyui-workflow-library.sql", "packages/db/migrations/20260728-comfyui-workflow-library.sql"],
  ["20260728-z-remove-legacy-workflow-runtime.sql", "packages/db/migrations/20260728-z-remove-legacy-workflow-runtime.sql"],
  ["20260728-add-bananarouter-models.sql", "packages/db/migrations/20260728-add-bananarouter-models.sql"],
  ["20260729-canvas-generation-runtime.sql", "packages/db/migrations/20260729-canvas-generation-runtime.sql"],
  ["20260729-canvas-user-config-library.sql", "packages/db/migrations/20260729-canvas-user-config-library.sql"],
  ["20260729-create-prompt-marketplace.sql", "packages/db/migrations/20260729-create-prompt-marketplace.sql"],
  ["20260730-canvas-media-derivations.sql", "packages/db/migrations/20260730-canvas-media-derivations.sql"],
  ["20260730-z-unify-prompt-storage.sql", "packages/db/migrations/20260730-z-unify-prompt-storage.sql"],
  ["20260730-zz-prompt-cover-storage.sql", "packages/db/migrations/20260730-zz-prompt-cover-storage.sql"],
  ["20260731-canvas-generation-batch-billing.sql", "packages/db/migrations/20260731-canvas-generation-batch-billing.sql"],
  ["20260731-failed-image-submission-active-repair-index.sql", "packages/db/migrations/20260731-failed-image-submission-active-repair-index.sql"],
  ["20260731-failed-image-submission-snapshot-repair-index.sql", "packages/db/migrations/20260731-failed-image-submission-snapshot-repair-index.sql"],
  ["20260731-z-canvas-agent-model-compatibility-probes.sql", "packages/db/migrations/20260731-z-canvas-agent-model-compatibility-probes.sql"],
  ["20260801-z-create-prompt-ratings.sql", "packages/db/migrations/20260801-z-create-prompt-ratings.sql"],
  ["20260801-zz-store-prompt-rating-score.sql", "packages/db/migrations/20260801-zz-store-prompt-rating-score.sql"],
  ["20260802-canvas-settings.sql", "packages/db/migrations/20260802-canvas-settings.sql"],
  ["20260803-canvas-agent-conversation-pins.sql", "packages/db/migrations/20260803-canvas-agent-conversation-pins.sql"],
  ["20260804-canvas-prompt-directive-configs.sql", "packages/db/migrations/20260804-canvas-prompt-directive-configs.sql"],
  ["20260804-z-redact-sms-send-record-secrets.sql", "packages/db/migrations/20260804-z-redact-sms-send-record-secrets.sql"],
  ["20260805-canvas-agent-conversation-locks.sql", "packages/db/migrations/20260805-canvas-agent-conversation-locks.sql"],
  ["20260806-backfill-prompt-summaries.sql", "packages/db/migrations/20260806-backfill-prompt-summaries.sql"],
  ["20260807-canvas-agent-provider-config-drafts.sql", "packages/db/migrations/20260807-canvas-agent-provider-config-drafts.sql"],
  ["20260808-canvas-agent-media-prompt-preferences.sql", "packages/db/migrations/20260808-canvas-agent-media-prompt-preferences.sql"],
  ["20260809-canvas-character-library.sql", "packages/db/migrations/20260809-canvas-character-library.sql"],
  ["20260809-z-enable-canvas-agent-text-model.sql", "packages/db/migrations/20260809-z-enable-canvas-agent-text-model.sql"],
  ["20260809-zz-canvas-agent-structured-json-fallback.sql", "packages/db/migrations/20260809-zz-canvas-agent-structured-json-fallback.sql"],
  ["20260810-canvas-agent-knowledge-boundary-tables.sql", "packages/db/migrations/20260810-canvas-agent-knowledge-boundary-tables.sql"],
  ["20260810-z-canvas-agent-step-input-json.sql", "packages/db/migrations/20260810-z-canvas-agent-step-input-json.sql"],
  ["20260811-prompt-skill-defaults.sql", "packages/db/migrations/20260811-prompt-skill-defaults.sql"],
  ["20260812-canvas-agent-step-skip.sql", "packages/db/migrations/20260812-canvas-agent-step-skip.sql"],
  ["20260812-expand-prompt-skill-default-categories.sql", "packages/db/migrations/20260812-expand-prompt-skill-default-categories.sql"],
  ["20260813-seed-other-prompt-default.sql", "packages/db/migrations/20260813-seed-other-prompt-default.sql"],
  ["20260814-require-project-style.sql", "packages/db/migrations/20260814-require-project-style.sql"],
  ["20260815-canvas-generation-batch-text.sql", "packages/db/migrations/20260815-canvas-generation-batch-text.sql"],
  ["20260816-canvas-style-reference-enabled.sql", "packages/db/migrations/20260816-canvas-style-reference-enabled.sql"],
  ["20260817-team-assets-storage-object.sql", "packages/db/migrations/20260817-team-assets-storage-object.sql"],
  ["20260818-team-assets-tags.sql", "packages/db/migrations/20260818-team-assets-tags.sql"],
  ["20260819-team-assets-folders.sql", "packages/db/migrations/20260819-team-assets-folders.sql"],
  ["20260820-add-cumob-text-models.sql", "packages/db/migrations/20260820-add-cumob-text-models.sql"],
  ["20260821-append-script-output-rules.sql", "packages/db/migrations/20260821-append-script-output-rules.sql"],
  ["20260822-canvas-agent-worker-indexes.sql", "packages/db/migrations/20260822-canvas-agent-worker-indexes.sql"],
  ["20260823-canvas-agent-queue-shards.sql", "packages/db/migrations/20260823-canvas-agent-queue-shards.sql"],
  ["20260824-task-center-provider-diagnostics.sql", "packages/db/migrations/20260824-task-center-provider-diagnostics.sql"],
  ["20260824-z-task-center-provider-diagnostics-index.sql", "packages/db/migrations/20260824-z-task-center-provider-diagnostics-index.sql"],
  ["20260825-bananarouter-image-async-recovery.sql", "packages/db/migrations/20260825-bananarouter-image-async-recovery.sql"],
  ["20260826-converge-provider-protocol-constraint.sql", "packages/db/migrations/20260826-converge-provider-protocol-constraint.sql"],
  ["20260827-converge-canvas-agent-shard-constraint.sql", "packages/db/migrations/20260827-converge-canvas-agent-shard-constraint.sql"],
  ["20260828-bananarouter-image-async-config-convergence.sql", "packages/db/migrations/20260828-bananarouter-image-async-config-convergence.sql"],
  ["20260829-enable-prompt-reverse-tool-model.sql", "packages/db/migrations/20260829-enable-prompt-reverse-tool-model.sql"],
  ["20260830-add-modelflare-responses-model.sql", "packages/db/migrations/20260830-add-modelflare-responses-model.sql"],
  ["20260831-canvas-agent-outbox-wakeup.sql", "packages/db/migrations/20260831-canvas-agent-outbox-wakeup.sql"],
  ["20260901-add-san-bao-media-models.sql", "packages/db/migrations/20260901-add-san-bao-media-models.sql"],
  ["20260902-merge-san-bao-gpt-image2-variants.sql", "packages/db/migrations/20260902-merge-san-bao-gpt-image2-variants.sql"],
  ["20260903-add-globalaiopc-model-center-and-soundclone.sql", "packages/db/migrations/20260903-add-globalaiopc-model-center-and-soundclone.sql"],
  ["20260904-create-provider-material-assets.sql", "packages/db/migrations/20260904-create-provider-material-assets.sql"],
  ["20260905-create-geo-operations.sql", "packages/db/migrations/20260905-create-geo-operations.sql"],
];
const requiredBaselineMigrationNames = ["user-centric-schema.sql", "model-reference-seed.sql"];
const mutableSnapshotMigrationNames = new Set(requiredBaselineMigrationNames);
const nonTransactionalMigrationIndexes = new Map([
  ["20260731-failed-image-submission-active-repair-index.sql", "tasks_failed_image_submission_active_repair_idx"],
  ["20260731-failed-image-submission-snapshot-repair-index.sql", "generation_snapshots_failed_image_submission_repair_idx"],
  ["20260824-z-task-center-provider-diagnostics-index.sql", "provider_requests_task_center_diagnostics_idx"],
]);
const nonTransactionalMigrationNames = new Set(nonTransactionalMigrationIndexes.keys());
const runtimeSafeMigrationNames = new Set([
  "20260824-task-center-provider-diagnostics.sql",
  "20260824-z-task-center-provider-diagnostics-index.sql",
  "20260826-converge-provider-protocol-constraint.sql",
  "20260804-z-redact-sms-send-record-secrets.sql",
  "20260831-canvas-agent-outbox-wakeup.sql",
]);
const runtimeRequiredPostconditionMigrationNames = new Set([
  "20260823-canvas-agent-queue-shards.sql",
]);
const taskCenterProviderDiagnosticsMigrationName = "20260824-task-center-provider-diagnostics.sql";
const compatibleChecksumTransitions = new Map([
  ["20260720-add-aliyun-bailian-audio-model.sql", {
    recorded: [
      "e15713b3f69203ec2688d5bc347535f26853dc8024f7cf2f436d04365fa0b67e",
      "eb9e734607ef21304fcedc7ab9a3c9cdaddb54adc6cbd03c2dfa4f23c5a82f7b",
    ],
    current: "8aebc45d265f756457fdcf58469b9a62dd0752609f2af61521321aba5a968742",
  }],
  ["20260728-comfyui-workflow-library.sql", {
    recorded: [
      "11823cfc09173a497118a2f1853d11af5b536b9ac993998465e44602ab139322",
      "c2152426c20d067dd408faec0ee553040e9b034be3caf6c8dc80c1fd8e06171b",
    ],
    current: "4f8b3ed655fac6c425f67d74e30d371f83ef6b2da2359b89ddaef0848ccc2f18",
  }],
  ["20260728-z-remove-legacy-workflow-runtime.sql", {
    recorded: [
      "ae743bc08f71c4103536b0a52f4a278b92b60cb34e44b3a693cf59013b711726",
      "2353cb5b3744d6754925e3a376bb70e30e82cba0f8f946f6b1dce1d3cb49265c",
      "3bdd5a635d991506f9e666f1b4f408ab8acca1e9fbb6a25d0f1c2b8198b49b9e",
      "7629102ae1825ee04fb31b814a14419a934076c80c880c4596192405decfda69",
    ],
    current: "244c1b08740bd86bc5cd96c5206d06e6d55456eee2317784405245b79fb493e4",
  }],
  ["20260728-add-bananarouter-models.sql", {
    recorded: [
      "c34889dfd4cae6f8cef5c179dfaddad87bb0384b9d8f5fe10a50054fb26d5a4c",
      "99a6a8111f77709b887d65cf71df83b9a0ad1c8f6bb7037319ae3b29ac3b433a",
    ],
    current: "9b555fbef017f23accf2986a7ee1542be091f8b022560aba955828c95566542a",
  }],
  ["20260725-create-canvas-agent-runtime.sql", {
    recorded: "e8bda0ec7ec8d507b7dc3156406787e346e07029330c2980e8a09cb048f93e4a",
    current: "28ffba53b3940b5d9cf993662b8b3f523c7c8d6876ae21405b420990fc545345",
  }],
  ["20260720-enable-project-multi-canvases.sql", {
    recorded: "5984810d4b1fd7e6f1aecf6b5413536a28ae7e936794d36dd9581f8db8a25f17",
    current: "56a92229a07dcb0abc46ec88416ca27ddb7fe4ecc32f7a3833033127bf1b9bc9",
  }],
  ["20260802-canvas-settings.sql", {
    recorded: "0ad891fddcf504214b574bddaa344056e1b326f832a410eca5acc5c72e0f630f",
    current: "6c3710c955e9de656dc66bbe0f513037221c5ea4680b5f4b773f4c6b42231602",
  }],
]);
const expectedSchemaFingerprint = "b30b8b3f4c5030d2f2c1b62b8ac9ead6cdad38d4529dd417c45e0e15ae59e7a5";
const migrationLockTimeoutMs = 60_000;
const migrationLockRetryMs = 250;
const mode = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--apply") ? "apply" : null;
const registerExisting = process.argv.includes("--register-existing");
const runtimeSafe = process.argv.includes("--runtime-safe");
if (!mode) throw new Error("usage: migrate-user-scope.mjs --dry-run|--apply [--register-existing]");

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");
const configuredSchemaName = process.env.DATABASE_SCHEMA?.trim() || null;

const client = await connectPostgresClientWithRetry({
  connectionString,
  env: process.env,
  envKey: "DATABASE_URL",
  serviceName: "schema",
});
let transactionOpen = false;
try {
  if (configuredSchemaName) {
    const schema = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists",
      [configuredSchemaName],
    );
    if (schema.rows[0]?.exists !== true) {
      throw new Error(`database_schema_not_found:${configuredSchemaName}`);
    }
    await client.query(
      "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)",
      [configuredSchemaName],
    );
  }
  await acquireMigrationLock(client);
  const target = await client.query("SELECT current_database() AS database_name, current_schema() AS schema_name");
  console.log(`target=${target.rows[0].database_name}/${target.rows[0].schema_name}`);
  const loaded = await loadMigrations();

  if (mode === "dry-run") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15min'");
    await applyOrValidate(client, loaded, false, registerExisting);
    await assertCleanSchema(client);
    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log("dry-run rolled back");
  } else {
    await applyOrValidate(client, loaded, true, registerExisting);
    await client.query("DISCARD PLANS");
    await assertCleanSchema(client);
    console.log("migration complete");
  }
} finally {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
  await client.query(`
    SELECT pg_advisory_unlock(
      hashtextextended(
        'comic_ai:user_schema_baseline:' || current_database() || ':' || current_schema(),
        0
      )
    )
  `).catch(() => undefined);
  await client.end().catch(() => undefined);
}

async function loadMigrations() {
  return Promise.all(migrations.map(async ([name, relativePath]) => {
    const sql = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
    return {
      name,
      sql,
      checksum: createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex"),
      legacyChecksum: createHash("sha256").update(sql).digest("hex"),
    };
  }));
}

async function acquireMigrationLock(db) {
  const deadline = Date.now() + migrationLockTimeoutMs;
  while (true) {
    const result = await db.query(
      `SELECT pg_try_advisory_lock(
        hashtextextended(
          'comic_ai:user_schema_baseline:' || current_database() || ':' || current_schema(),
          0
        )
      ) AS locked`,
    );
    if (result.rows[0]?.locked === true) return;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error("migration_lock_timeout");
    await delay(Math.min(migrationLockRetryMs, remainingMs));
  }
}

async function ensureLedger(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      migration_name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applyOrValidate(db, loaded, apply, allowRegistration) {
  const hasUsers = await tableExists(db, "users");
  const hasLedger = await tableExists(db, "app_schema_migrations");
  const rows = hasLedger
    ? await db.query("SELECT migration_name, checksum FROM app_schema_migrations")
    : { rows: [] };
  const applied = new Map(rows.rows.map((row) => [row.migration_name, row.checksum]));

  if (
    runtimeSafe
    && (
      !hasUsers
      || !hasLedger
      || requiredBaselineMigrationNames.some((name) => !applied.has(name))
    )
  ) {
    throw new Error("runtime_schema_baseline_required");
  }

  if (hasUsers && !allowRegistration && requiredBaselineMigrationNames.some((name) => !applied.has(name))) {
    throw new Error("baseline_registration_required");
  }

  if (hasUsers && allowRegistration) {
    await assertExpectedExistingSchema(db);
    if (apply) await db.query("BEGIN");
    try {
      await ensureLedger(db);
      await db.query("DELETE FROM app_schema_migrations");
      for (const migration of loaded.filter(({ name }) => requiredBaselineMigrationNames.includes(name))) {
        await db.query(
          "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        applied.set(migration.name, migration.checksum);
        console.log(`${apply ? "registered" : "dry-run register"} ${migration.name}`);
      }
      if (apply) await db.query("COMMIT");
    } catch (error) {
      if (apply) await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  for (const migration of loaded) {
    const recorded = applied.get(migration.name);
    if (
      recorded
      && recorded !== migration.checksum
      && recorded !== migration.legacyChecksum
      && !isCompatibleChecksum(
        migration.name,
        recorded,
        migration.checksum,
      )
    ) {
      throw new Error(`migration_checksum_mismatch:${migration.name}`);
    }
    if (runtimeSafe && runtimeRequiredPostconditionMigrationNames.has(migration.name)) {
      if (!await runtimeMigrationPostconditionSatisfied(db, migration.name)) {
        throw new Error(`runtime_schema_postcondition_missing:${migration.name}`);
      }
      if (!recorded) {
        await db.query(
          "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        applied.set(migration.name, migration.checksum);
        console.log(`registered existing ${migration.name}`);
      } else {
        console.log(`${apply ? "skip" : "dry-run skip"} ${migration.name}`);
      }
      continue;
    }
    if (recorded) {
      console.log(`${apply ? "skip" : "dry-run skip"} ${migration.name}`);
      continue;
    }
    if (runtimeSafe && !runtimeSafeMigrationNames.has(migration.name)) {
      console.log(`runtime defer ${migration.name}`);
      continue;
    }
    if (runtimeSafe && await runtimeMigrationPostconditionSatisfied(db, migration.name)) {
      if (migration.name === taskCenterProviderDiagnosticsMigrationName) {
        await backfillTaskCenterProviderDiagnostics(db);
        await assertTaskCenterProviderDiagnosticsBackfillComplete(db);
      }
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      applied.set(migration.name, migration.checksum);
      console.log(`registered existing ${migration.name}`);
      continue;
    }

    // A prior deployment may have completed prompt consolidation before the
    // migration ledger write. Preserve that data and repair only the ledger.
    if (
      migration.name === "20260730-z-unify-prompt-storage.sql" &&
      await tableExists(db, "prompts") &&
      await tableExists(db, "prompt_user_links")
    ) {
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      applied.set(migration.name, migration.checksum);
      console.log(`${apply ? "registered existing" : "dry-run register existing"} ${migration.name}`);
      continue;
    }

    if (apply && migration.name === taskCenterProviderDiagnosticsMigrationName) {
      await applyTaskCenterProviderDiagnosticsMigration(db, migration);
    } else if (!apply && migration.name === taskCenterProviderDiagnosticsMigrationName) {
      await db.query(migration.sql);
      await backfillTaskCenterProviderDiagnostics(db);
      await assertTaskCenterProviderDiagnosticsBackfillComplete(db);
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      console.log(`dry-run ok ${migration.name}`);
    } else if (!apply && nonTransactionalMigrationNames.has(migration.name)) {
      if (!/^CREATE INDEX CONCURRENTLY IF NOT EXISTS\s+/i.test(migration.sql.trim())) {
        throw new Error(`invalid_non_transactional_migration:${migration.name}`);
      }
      console.log(`dry-run checked ${migration.name}`);
    } else if (apply && nonTransactionalMigrationNames.has(migration.name)) {
      const indexName = nonTransactionalMigrationIndexes.get(migration.name);
      if (!indexName) throw new Error(`non_transactional_index_missing:${migration.name}`);
      await db.query("SET statement_timeout = '15min'");
      try {
        await removeInvalidConcurrentIndex(db, indexName);
        await db.query(migration.sql);
        await assertIndexValid(db, indexName);
      } finally {
        await db.query("RESET statement_timeout").catch(() => undefined);
      }
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      console.log(`applied ${migration.name}`);
    } else if (apply) {
      await db.query("BEGIN");
      try {
        await db.query("SET LOCAL statement_timeout = '15min'");
        await db.query(migration.sql);
        await db.query(
          "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
          [migration.name, migration.checksum],
        );
        await db.query("COMMIT");
        console.log(`applied ${migration.name}`);
      } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    } else {
      await db.query(migration.sql);
      await db.query(
        "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      console.log(`dry-run ok ${migration.name}`);
    }
  }
}

async function removeInvalidConcurrentIndex(db, indexName) {
  const result = await db.query(
    `
      SELECT index_record.indisvalid AS is_valid
      FROM pg_index index_record
      JOIN pg_class relation ON relation.oid = index_record.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = $1
    `,
    [indexName],
  );
  if (result.rows[0]?.is_valid === false) {
    await db.query(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(indexName)}`);
  }
}

async function assertIndexValid(db, indexName) {
  const result = await db.query(
    `
      SELECT index_record.indisvalid AS is_valid
      FROM pg_index index_record
      JOIN pg_class relation ON relation.oid = index_record.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = $1
    `,
    [indexName],
  );
  if (result.rows[0]?.is_valid !== true) {
    throw new Error(`concurrent_index_invalid:${indexName}`);
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function isCompatibleChecksum(name, recorded, current) {
  if (mutableSnapshotMigrationNames.has(name)) return true;
  const transition = compatibleChecksumTransitions.get(name);
  const recordedChecksums = Array.isArray(transition?.recorded)
    ? transition.recorded
    : [transition?.recorded];
  const currentChecksums = Array.isArray(transition?.current)
    ? transition.current
    : [transition?.current];
  return recordedChecksums.includes(recorded) && currentChecksums.includes(current);
}

async function applyTaskCenterProviderDiagnosticsMigration(db, migration) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL statement_timeout = '15min'");
    await db.query(migration.sql);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }

  const { providerBackfilled, snapshotBackfilled } = await backfillTaskCenterProviderDiagnostics(db);
  await assertTaskCenterProviderDiagnosticsBackfillComplete(db);

  await db.query(
    "INSERT INTO app_schema_migrations (migration_name, checksum) VALUES ($1, $2)",
    [migration.name, migration.checksum],
  );
  console.log(
    `applied ${migration.name} (provider summaries: ${providerBackfilled}, snapshot summaries: ${snapshotBackfilled})`,
  );
}

async function backfillTaskCenterProviderDiagnostics(db) {
  const totals = {
    providerBackfilled: 0,
    snapshotBackfilled: 0,
  };
  await db.query("SET statement_timeout = '2min'");
  try {
    for (const [functionName, totalKey] of [
      ["backfill_provider_request_task_center_diagnostics_batch", "providerBackfilled"],
      ["backfill_generation_snapshot_task_center_diagnostics_batch", "snapshotBackfilled"],
    ]) {
      let cursor = null;
      while (true) {
        const batch = await db.query(
          `SELECT processed_count, next_id FROM ${functionName}($1::uuid, 250)`,
          [cursor],
        );
        const processedCount = Number(batch.rows[0]?.processed_count ?? 0);
        cursor = batch.rows[0]?.next_id ?? null;
        totals[totalKey] += processedCount;
        if (processedCount === 0 || !cursor) break;
      }
    }
  } finally {
    await db.query("RESET statement_timeout").catch(() => undefined);
  }
  return totals;
}

async function assertTaskCenterProviderDiagnosticsBackfillComplete(db) {
  const result = await db.query(`
    SELECT
      NOT EXISTS (
        SELECT 1
        FROM provider_requests
        WHERE task_center_diagnostics_backfilled_at IS NULL
          AND task_center_diagnostics_json IS NULL
          AND response_redacted_json IS NOT NULL
          AND status IN ('failed', 'result_unknown', 'manual_review_required', 'canceled')
      ) AS providers_complete,
      NOT EXISTS (
        SELECT 1
        FROM ai_generation_task_snapshots
        WHERE task_center_diagnostics_backfilled_at IS NULL
          AND task_center_diagnostics_json = '{}'::jsonb
          AND provider_status_json <> '{}'::jsonb
      ) AS snapshots_complete
  `);
  if (
    result.rows[0]?.providers_complete !== true
    || result.rows[0]?.snapshots_complete !== true
  ) {
    throw new Error("task_center_provider_diagnostics_backfill_incomplete");
  }
}

async function assertExpectedExistingSchema(db) {
  const target = await db.query("SELECT current_schema() AS schema_name");
  const snapshot = await readSchemaSnapshot(db, target.rows[0].schema_name);
  const fingerprint = fingerprintSnapshot(snapshot);
  if (fingerprint !== expectedSchemaFingerprint) {
    throw new Error(`existing_schema_fingerprint_mismatch:${fingerprint}`);
  }
}

async function assertCleanSchema(db) {
  const first = ["organ", "ization"].join("");
  const second = ["work", "space"].join("");
  const result = await db.query(`
    WITH findings AS (
      SELECT 'column'::text AS object_type, table_name || '.' || column_name AS object_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          column_name ILIKE '%' || $1 || '%'
          OR column_name ILIKE '%' || $2 || '%'
          OR coalesce(column_default, '') ILIKE '%' || $1 || '%'
          OR coalesce(column_default, '') ILIKE '%' || $2 || '%'
          OR coalesce(generation_expression, '') ILIKE '%' || $1 || '%'
          OR coalesce(generation_expression, '') ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'table', table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND (table_name ILIKE '%' || $1 || '%' OR table_name ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'constraint', constraint_record.conname
      FROM pg_constraint constraint_record
      JOIN pg_namespace namespace ON namespace.oid = constraint_record.connamespace
      WHERE namespace.nspname = current_schema()
        AND (
          constraint_record.conname ILIKE '%' || $1 || '%'
          OR constraint_record.conname ILIKE '%' || $2 || '%'
          OR pg_get_constraintdef(constraint_record.oid) ILIKE '%' || $1 || '%'
          OR pg_get_constraintdef(constraint_record.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'index', indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND (
          indexname ILIKE '%' || $1 || '%'
          OR indexname ILIKE '%' || $2 || '%'
          OR indexdef ILIKE '%' || $1 || '%'
          OR indexdef ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'view', viewname
      FROM pg_views
      WHERE schemaname = current_schema()
        AND (
          viewname ILIKE '%' || $1 || '%'
          OR viewname ILIKE '%' || $2 || '%'
          OR definition ILIKE '%' || $1 || '%'
          OR definition ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'materialized_view', matviewname
      FROM pg_matviews
      WHERE schemaname = current_schema()
        AND (
          matviewname ILIKE '%' || $1 || '%'
          OR matviewname ILIKE '%' || $2 || '%'
          OR definition ILIKE '%' || $1 || '%'
          OR definition ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'routine', procedure.proname
      FROM pg_proc procedure
      JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = current_schema()
        AND procedure.prokind IN ('f', 'p')
        AND (
          procedure.proname ILIKE '%' || $1 || '%'
          OR procedure.proname ILIKE '%' || $2 || '%'
          OR pg_get_functiondef(procedure.oid) ILIKE '%' || $1 || '%'
          OR pg_get_functiondef(procedure.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'trigger', trigger_record.tgname
      FROM pg_trigger trigger_record
      JOIN pg_class relation ON relation.oid = trigger_record.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND NOT trigger_record.tgisinternal
        AND (
          trigger_record.tgname ILIKE '%' || $1 || '%'
          OR trigger_record.tgname ILIKE '%' || $2 || '%'
          OR pg_get_triggerdef(trigger_record.oid) ILIKE '%' || $1 || '%'
          OR pg_get_triggerdef(trigger_record.oid) ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'policy', policyname
      FROM pg_policies
      WHERE schemaname = current_schema()
        AND (
          policyname ILIKE '%' || $1 || '%'
          OR policyname ILIKE '%' || $2 || '%'
          OR coalesce(qual, '') ILIKE '%' || $1 || '%'
          OR coalesce(qual, '') ILIKE '%' || $2 || '%'
          OR coalesce(with_check, '') ILIKE '%' || $1 || '%'
          OR coalesce(with_check, '') ILIKE '%' || $2 || '%'
        )

      UNION ALL
      SELECT 'sequence', sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = current_schema()
        AND (sequence_name ILIKE '%' || $1 || '%' OR sequence_name ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'type', type_record.typname
      FROM pg_type type_record
      JOIN pg_namespace namespace ON namespace.oid = type_record.typnamespace
      WHERE namespace.nspname = current_schema()
        AND (type_record.typname ILIKE '%' || $1 || '%' OR type_record.typname ILIKE '%' || $2 || '%')

      UNION ALL
      SELECT 'comment', relation.relname || coalesce('.' || attribute.attname, '')
      FROM pg_description description_record
      JOIN pg_class relation ON relation.oid = description_record.objoid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_attribute attribute
        ON attribute.attrelid = relation.oid
       AND attribute.attnum = description_record.objsubid
      WHERE namespace.nspname = current_schema()
        AND (
          description_record.description ILIKE '%' || $1 || '%'
          OR description_record.description ILIKE '%' || $2 || '%'
        )
    )
    SELECT object_type, object_name
    FROM findings
    ORDER BY object_type, object_name
  `, [first, second]);
  if (result.rows.length > 0) throw new Error(`legacy_schema_objects_remain:${JSON.stringify(result.rows)}`);
}

async function tableExists(db, tableName) {
  const result = await db.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1) AS exists",
    [tableName],
  );
  return result.rows[0]?.exists === true;
}

async function columnExists(db, tableName, columnName) {
  const result = await db.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    ) AS exists`,
    [tableName, columnName],
  );
  return result.rows[0]?.exists === true;
}

async function runtimeMigrationPostconditionSatisfied(db, migrationName) {
  if (migrationName === "20260823-canvas-agent-queue-shards.sql") {
    if (!await columnExists(db, "canvas_agent_conversations", "shard_id")) return false;
    const result = await db.query(`
      SELECT
        EXISTS (
          SELECT 1
          FROM pg_index index_record
          WHERE index_record.indexrelid = to_regclass(
              current_schema() || '.canvas_agent_conversations_shard_idx'
            )
            AND index_record.indrelid = to_regclass(
              current_schema() || '.canvas_agent_conversations'
            )
            AND index_record.indisvalid
            AND index_record.indisready
            AND index_record.indnkeyatts = 2
            AND pg_get_indexdef(index_record.indexrelid, 1, true) = 'shard_id'
            AND pg_get_indexdef(index_record.indexrelid, 2, true) = 'id'
            AND pg_get_expr(index_record.indpred, index_record.indrelid, true) = 'shard_id IS NOT NULL'
        ) AS has_index,
        EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = to_regclass(current_schema() || '.canvas_agent_conversations')
            AND conname = 'canvas_agent_conversations_shard_id_check'
            AND convalidated
            AND pg_get_constraintdef(oid, true) = 'CHECK (shard_id IS NULL OR shard_id >= 0)'
        ) AS has_constraint
    `);
    return result.rows[0]?.has_index === true
      && result.rows[0]?.has_constraint === true;
  }
  if (migrationName === "20260824-task-center-provider-diagnostics.sql") {
    const result = await db.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'provider_requests'
            AND column_name = 'task_center_diagnostics_json'
        ) AS has_provider_column,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'ai_generation_task_snapshots'
            AND column_name = 'task_center_diagnostics_json'
        ) AS has_snapshot_column,
        to_regprocedure('task_center_provider_diagnostics_summary(jsonb)') IS NOT NULL AS has_summary_function,
        to_regprocedure('backfill_provider_request_task_center_diagnostics_batch(uuid,integer)') IS NOT NULL
          AS has_provider_backfill_function,
        to_regprocedure('backfill_generation_snapshot_task_center_diagnostics_batch(uuid,integer)') IS NOT NULL
          AS has_snapshot_backfill_function,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'provider_requests'::regclass
            AND tgname = 'provider_requests_task_center_diagnostics_sync'
            AND NOT tgisinternal
        ) AS has_provider_trigger,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'ai_generation_task_snapshots'::regclass
            AND tgname = 'generation_snapshots_task_center_diagnostics_sync'
            AND NOT tgisinternal
        ) AS has_snapshot_trigger
    `);
    return result.rows[0]?.has_provider_column === true
      && result.rows[0]?.has_snapshot_column === true
      && result.rows[0]?.has_summary_function === true
      && result.rows[0]?.has_provider_backfill_function === true
      && result.rows[0]?.has_snapshot_backfill_function === true
      && result.rows[0]?.has_provider_trigger === true
      && result.rows[0]?.has_snapshot_trigger === true;
  }
  if (migrationName === "20260824-z-task-center-provider-diagnostics-index.sql") {
    const result = await db.query(`
      SELECT COALESCE(index_record.indisvalid, false) AS is_valid
      FROM pg_class relation
      JOIN pg_index index_record ON index_record.indexrelid = relation.oid
      WHERE relation.oid = to_regclass(current_schema() || '.provider_requests_task_center_diagnostics_idx')
    `);
    return result.rows[0]?.is_valid === true;
  }
  if (migrationName === "20260826-converge-provider-protocol-constraint.sql") {
    const result = await db.query(`
      SELECT pg_get_constraintdef(constraint_record.oid) AS definition
      FROM pg_constraint constraint_record
      WHERE constraint_record.conrelid = 'ai_model_configs'::regclass
        AND constraint_record.conname = 'ai_model_configs_provider_protocol_check'
    `);
    const definition = result.rows[0]?.definition ?? "";
    return ["cumob_chat", "apimart_audio", "banana_router"]
      .every((protocol) => definition.includes(protocol));
  }
  return false;
}
