import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SqlDatabase } from "./sql.ts";

const CURRENT_SCHEMA_RELATIVE_PATH = ["packages", "db", "baseline", "user-centric-schema.sql"];
const REFERENCE_SEED_RELATIVE_PATH = ["packages", "db", "baseline", "model-reference-seed.sql"];
const DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-director-desks.sql"];
const TEAM_MEMBER_DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-team-member-director-desks.sql"];

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
