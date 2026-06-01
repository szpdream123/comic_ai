import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { applySqlMigrations } from "./migrations.ts";
import type { SqlDatabase } from "./sql.ts";

export type TestDatabase = SqlDatabase;

export async function createMigratedTestDb(): Promise<TestDatabase> {
  const { PGlite } = await import("@electric-sql/pglite");
  const localTestDbPath = resolve(
    process.cwd(),
    ".local",
    "test-db",
    randomUUID(),
  );
  await mkdir(dirname(localTestDbPath), { recursive: true });
  const db = new PGlite(localTestDbPath) as TestDatabase;
  await applySqlMigrations(db);
  return db;
}

export async function listTableNames(db: SqlDatabase): Promise<string[]> {
  const result = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `,
  );

  return result.rows.map((row) => row.table_name);
}

export async function listColumnNames(
  db: SqlDatabase,
  tableName: string,
): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return result.rows.map((row) => row.column_name);
}

export async function listIndexNames(
  db: SqlDatabase,
  tableName: string,
): Promise<string[]> {
  const result = await db.query<{ indexname: string }>(
    `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `,
    [tableName],
  );

  return result.rows.map((row) => row.indexname);
}
