import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SqlDatabase } from "./sql.ts";

export async function loadSqlMigrations(rootDir = process.cwd(), options = {}) {
  const { fromName = null } = options;
  const migrationDir = join(rootDir, "packages", "db", "migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));
  const filteredFiles = fromName
    ? files.filter((file) => file.localeCompare(fromName) >= 0)
    : files;

  return Promise.all(
    filteredFiles.map(async (file) => ({
      name: file,
      sql: await readFile(join(migrationDir, file), "utf8"),
    })),
  );
}

export async function applySqlMigrations(db: SqlDatabase, rootDir = process.cwd(), options = {}) {
  const migrations = await loadSqlMigrations(rootDir, options);
  for (const migration of migrations) {
    await executeMigration(db, migration.sql);
  }
}

async function executeMigration(db: SqlDatabase, migration: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, migration);
    return;
  }

  await db.query(migration);
}
