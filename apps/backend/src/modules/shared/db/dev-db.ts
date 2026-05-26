import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { createMigratedTestDb } from "./test-db.ts";

export interface DevDatabase extends SqlDatabase {
  close(): Promise<void>;
}

export async function createDevDb(): Promise<DevDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    if (process.env.NODE_ENV === "test" && !process.env.LOCAL_DATABASE_DIR?.trim()) {
      return createMigratedTestDb();
    }
    return createLocalDevDb();
  }

  const pool = new Pool({
    connectionString,
  });

  try {
    await ensureFoundationSchema(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    console.warn(
      `[dev-db] DATABASE_URL is configured but unavailable; falling back to local PGlite storage. ${error instanceof Error ? error.message : String(error)}`,
    );
    return createLocalDevDb();
  }

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      const result = await pool.query(sql, params);
      return {
        rows: result.rows as T[],
      };
    },
    async close() {
      await pool.end();
    },
  };
}

async function createLocalDevDb(): Promise<DevDatabase> {
  const localDbPath = resolve(process.cwd(), process.env.LOCAL_DATABASE_DIR?.trim() || ".local/dev-db");
  const db = new PGlite(localDbPath) as PGlite & DevDatabase;
  await ensureFoundationSchema(db);
  console.info(`[dev-db] Using local PGlite storage at ${localDbPath}`);
  return db;
}

async function ensureFoundationSchema(db: SqlDatabase) {
  const tableCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'users'
      ) AS exists
    `,
  );

  if (tableCheck.rows[0]?.exists) {
    return;
  }

  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "0001_foundation.sql"),
    "utf8",
  );
  await executeMigration(db, migration);
}

async function executeMigration(db: SqlDatabase, migration: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, migration);
    return;
  }

  await db.query(migration);
}
