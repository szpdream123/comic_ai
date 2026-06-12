import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { applySqlMigrations } from "./migrations.ts";
import { createPostgresDatabase } from "./dev-db.ts";
import type { DevDatabase } from "./dev-db.ts";
import type { SqlDatabase } from "./sql.ts";

export type TestDatabase = DevDatabase;

export async function createMigratedTestDb(): Promise<TestDatabase> {
  const db = await createEmptyTestDb();
  await applySqlMigrations(db);
  return db;
}

export async function createEmptyTestDb(): Promise<TestDatabase> {
  const connectionString = requiredTestDatabaseUrl();
  const schemaName = `test_${randomUUID().replaceAll("-", "_")}`;
  const pool = new Pool({ connectionString });

  try {
    await pool.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }

  const db = createPostgresDatabase(pool, schemaName);
  const closePool = db.close.bind(db);
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      return db.query<T>(sql, params);
    },
    async close() {
      try {
        await db.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      } finally {
        await closePool();
      }
    },
  };
}

export async function listTableNames(db: SqlDatabase): Promise<string[]> {
  const result = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
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
      WHERE table_schema = current_schema() AND table_name = $1
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
      WHERE schemaname = current_schema() AND tablename = $1
      ORDER BY indexname
    `,
    [tableName],
  );

  return result.rows.map((row) => row.indexname);
}

function requiredTestDatabaseUrl() {
  const connectionString = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL tests");
  }
  return connectionString;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
