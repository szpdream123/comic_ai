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
const CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-create-creator-tool-presets.sql"];

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
      name: "20260721-create-creator-tool-presets.sql",
      sql: await readFile(join(rootDir, ...CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH), "utf8"),
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
