import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SqlDatabase } from "./sql.ts";

const CURRENT_SCHEMA_RELATIVE_PATH = ["packages", "db", "baseline", "user-centric-schema.sql"];
const REFERENCE_SEED_RELATIVE_PATH = ["packages", "db", "baseline", "model-reference-seed.sql"];
const DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-director-desks.sql"];
const TEAM_MEMBER_DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-team-member-director-desks.sql"];
const ALIYUN_BAILIAN_AUDIO_MODEL_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-add-aliyun-bailian-audio-model.sql"];
const COSYVOICE_V2_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-correct-cosyvoice-v2-contract.sql"];
const PROJECT_MULTI_CANVAS_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-enable-project-multi-canvases.sql"];
const CREATOR_AGENT_ASSETS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-create-creator-agent-assets.sql"];
const CREATOR_BRAND_KITS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-create-creator-brand-kits.sql"];
const GLOBALAIOPC_VIDEO_DOC_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-globalaiopc-video-doc-contract.sql"];
const LINGDONG_API_DOC_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-lingdong-api-doc-contract.sql"];
const CUMOB_IMAGE_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-cumob-image-contract.sql"];
const CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-create-creator-tool-presets.sql"];
const GENERATION_OUTBOX_RELIABILITY_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-generation-outbox-reliability.sql"];
const GENERATION_TIMEOUT_POLICY_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-unify-generation-timeout-policy.sql"];
const LEGACY_PROVIDER_CONFIG_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-zz-remove-legacy-provider-configs.sql"];
const GENERATION_STRATEGY_OVERRIDE_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-z-remove-legacy-generation-strategy-overrides.sql"];
const CUMOB_ASYNC_POLLING_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-align-cumob-async-polling.sql"];
const GENERATION_QUEUE_ELASTIC_SHARDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-queue-elastic-shards.sql"];
const TASK_CENTER_INCREMENTAL_INDEXES_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-task-center-incremental-indexes.sql"];
const GENERATION_OUTBOX_FAIR_DISPATCH_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-outbox-fair-dispatch.sql"];
const GENERATION_DUE_POLL_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-due-poll.sql"];
const GENERATION_PROVIDER_ROUTE_SNAPSHOTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-provider-route-snapshots.sql"];
const GENERATION_STAGE_SUCCESSORS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-stage-successors.sql"];
const GENERATION_WEBHOOK_INBOX_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-webhook-inbox.sql"];
const CANVAS_GENERATION_SCOPE_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-canvas-generation-scope.sql"];
const STANDALONE_CANVAS_PROJECT_SHELL_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-cleanup-standalone-canvas-project-shells.sql"];
const PROJECT_SOURCE_DOCUMENTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-create-project-source-documents.sql"];
const DECOUPLE_SCRIPTS_FROM_PROJECTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-decouple-scripts-from-projects.sql"];
const DECOUPLE_CANVASES_FROM_PROJECTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-decouple-canvases-from-projects.sql"];
const GENERATION_TASK_SNAPSHOT_TIMEOUTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql"];

export async function loadCurrentSchemaSql(rootDir = process.cwd()) {
  return readFile(join(rootDir, ...CURRENT_SCHEMA_RELATIVE_PATH), "utf8");
}

export async function loadReferenceSeedSql(rootDir = process.cwd()) {
  return readFile(join(rootDir, ...REFERENCE_SEED_RELATIVE_PATH), "utf8");
}

export async function loadSqlMigrations(rootDir = process.cwd(), options = {}) {
  const { fromName = null } = options;
  const migrations = [
    { name: "user-centric-schema.sql", sql: await loadCurrentSchemaSql(rootDir) },
    { name: "model-reference-seed.sql", sql: await loadReferenceSeedSql(rootDir) },
    {
      name: "20260718-create-director-desks.sql",
      sql: await readFile(join(rootDir, ...DIRECTOR_DESK_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260718-create-team-member-director-desks.sql",
      sql: await readFile(join(rootDir, ...TEAM_MEMBER_DIRECTOR_DESK_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-add-aliyun-bailian-audio-model.sql",
      sql: await readFile(join(rootDir, ...ALIYUN_BAILIAN_AUDIO_MODEL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-correct-cosyvoice-v2-contract.sql",
      sql: await readFile(join(rootDir, ...COSYVOICE_V2_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-enable-project-multi-canvases.sql",
      sql: await readFile(join(rootDir, ...PROJECT_MULTI_CANVAS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-create-creator-agent-assets.sql",
      sql: await readFile(join(rootDir, ...CREATOR_AGENT_ASSETS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-create-creator-brand-kits.sql",
      sql: await readFile(join(rootDir, ...CREATOR_BRAND_KITS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-globalaiopc-video-doc-contract.sql",
      sql: await readFile(join(rootDir, ...GLOBALAIOPC_VIDEO_DOC_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-lingdong-api-doc-contract.sql",
      sql: await readFile(join(rootDir, ...LINGDONG_API_DOC_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-cumob-image-contract.sql",
      sql: await readFile(join(rootDir, ...CUMOB_IMAGE_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-create-creator-tool-presets.sql",
      sql: await readFile(join(rootDir, ...CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-generation-outbox-reliability.sql",
      sql: await readFile(join(rootDir, ...GENERATION_OUTBOX_RELIABILITY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-unify-generation-timeout-policy.sql",
      sql: await readFile(join(rootDir, ...GENERATION_TIMEOUT_POLICY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-z-remove-legacy-generation-strategy-overrides.sql",
      sql: await readFile(join(rootDir, ...GENERATION_STRATEGY_OVERRIDE_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-zz-remove-legacy-provider-configs.sql",
      sql: await readFile(join(rootDir, ...LEGACY_PROVIDER_CONFIG_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-align-cumob-async-polling.sql",
      sql: await readFile(join(rootDir, ...CUMOB_ASYNC_POLLING_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-canvas-generation-scope.sql",
      sql: await readFile(join(rootDir, ...CANVAS_GENERATION_SCOPE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-cleanup-standalone-canvas-project-shells.sql",
      sql: await readFile(join(rootDir, ...STANDALONE_CANVAS_PROJECT_SHELL_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-create-project-source-documents.sql",
      sql: await readFile(join(rootDir, ...PROJECT_SOURCE_DOCUMENTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-decouple-canvases-from-projects.sql",
      sql: await readFile(join(rootDir, ...DECOUPLE_CANVASES_FROM_PROJECTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-decouple-scripts-from-projects.sql",
      sql: await readFile(join(rootDir, ...DECOUPLE_SCRIPTS_FROM_PROJECTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-due-poll.sql",
      sql: await readFile(join(rootDir, ...GENERATION_DUE_POLL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-outbox-fair-dispatch.sql",
      sql: await readFile(join(rootDir, ...GENERATION_OUTBOX_FAIR_DISPATCH_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-provider-route-snapshots.sql",
      sql: await readFile(join(rootDir, ...GENERATION_PROVIDER_ROUTE_SNAPSHOTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-queue-elastic-shards.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_ELASTIC_SHARDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-stage-successors.sql",
      sql: await readFile(join(rootDir, ...GENERATION_STAGE_SUCCESSORS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-webhook-inbox.sql",
      sql: await readFile(join(rootDir, ...GENERATION_WEBHOOK_INBOX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-task-center-incremental-indexes.sql",
      sql: await readFile(join(rootDir, ...TASK_CENTER_INCREMENTAL_INDEXES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql",
      sql: await readFile(join(rootDir, ...GENERATION_TASK_SNAPSHOT_TIMEOUTS_RELATIVE_PATH), "utf8"),
    },
  ];
  return fromName
    ? migrations.filter((migration) => migration.name.localeCompare(fromName) >= 0)
    : migrations;
}

export async function applySqlMigrations(db: SqlDatabase, rootDir = process.cwd(), options = {}) {
  const migrations = await loadSqlMigrations(rootDir, options);
  for (const migration of migrations) {
    await executeMigration(db, migration.sql);
  }
}

export async function applySqlMigration(
  db: SqlDatabase,
  rootDir = process.cwd(),
  migrationName: string,
) {
  const migrations = await loadSqlMigrations(rootDir);
  const migration = migrations.find((candidate) => candidate.name === migrationName);
  if (!migration) {
    throw new Error(`unknown_current_schema_migration:${migrationName}`);
  }
  const sql = migration.sql;
  await executeMigration(db, sql);
}

async function executeMigration(db: SqlDatabase, migration: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, migration);
    return;
  }

  await db.query(migration);
}
