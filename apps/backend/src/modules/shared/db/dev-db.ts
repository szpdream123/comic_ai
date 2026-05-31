import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { applySqlMigrations } from "./migrations.ts";
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
  const configuredLocalDir = process.env.LOCAL_DATABASE_DIR?.trim();
  const callerFile = process.argv[1]?.replaceAll("\\", "/") ?? "";
  const runningFromSpecFile = /(?:^|\/)[^/]+(?:\.spec|\.test)\.[cm]?[jt]s$/i.test(callerFile);
  const ephemeralLocalDir = !configuredLocalDir &&
      (process.env.NODE_ENV === "test" || runningFromSpecFile)
    ? `.local/dev-db/test-${randomUUID()}`
    : null;
  const localDbPath = resolve(
    process.cwd(),
    configuredLocalDir || ephemeralLocalDir || ".local/dev-db/default",
  );
  await mkdir(dirname(localDbPath), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(localDbPath) as DevDatabase;
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

  if (!tableCheck.rows[0]?.exists) {
    await applySqlMigrations(db);
    return;
  }

  const sessionTableCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'storage_upload_sessions'
      ) AS exists
    `,
  );
  if (!sessionTableCheck.rows[0]?.exists) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0002_storage_uploads.sql" });
  }

  const hardeningTableCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'episode_generation_drafts'
      ) AS exists
    `,
  );
  if (!hardeningTableCheck.rows[0]?.exists) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0004_episode_workbench_hardening.sql" });
  }
}
