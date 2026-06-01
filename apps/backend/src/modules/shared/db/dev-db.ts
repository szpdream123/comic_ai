import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

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
  await mkdir(dirname(localDbPath), { recursive: true });
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
    await ensurePaymentProviderConstraints(db);
    return;
  }

  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "0001_foundation.sql"),
    "utf8",
  );
  await executeMigration(db, migration);
  await ensurePaymentProviderConstraints(db);
}

async function ensurePaymentProviderConstraints(db: SqlDatabase) {
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_intents
        DROP CONSTRAINT IF EXISTS payment_intents_provider_check
    `,
  );
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_intents
        ADD CONSTRAINT payment_intents_provider_check
        CHECK (provider IN ('paylab', 'wechat_pay', 'alipay'))
    `,
  );
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_provider_events
        DROP CONSTRAINT IF EXISTS payment_provider_events_provider_check
    `,
  );
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_provider_events
        ADD CONSTRAINT payment_provider_events_provider_check
        CHECK (provider IN ('paylab', 'wechat_pay', 'alipay'))
    `,
  );
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_reconciliation_runs
        DROP CONSTRAINT IF EXISTS payment_reconciliation_runs_provider_check
    `,
  );
  await db.query(
    `
      ALTER TABLE IF EXISTS payment_reconciliation_runs
        ADD CONSTRAINT payment_reconciliation_runs_provider_check
        CHECK (provider IN ('paylab', 'wechat_pay', 'alipay', 'all'))
    `,
  );
}

async function executeMigration(db: SqlDatabase, migration: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, migration);
    return;
  }

  await db.query(migration);
}
