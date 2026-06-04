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
    throw new Error("DATABASE_URL is required for dev server; PGlite fallback is disabled.");
  }

  const pool = new Pool({
    connectionString,
  });

  try {
    await ensureFoundationSchema(pool);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw new Error(
      `[dev-db] DATABASE_URL is configured but unavailable. ${error instanceof Error ? error.message : String(error)}`,
    );
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

export async function ensureFoundationSchema(db: SqlDatabase) {
  const hasUsersTable = await tableExists(db, "users");

  if (!hasUsersTable) {
    await applySqlMigrations(db);
    await ensurePaymentProviderConstraints(db);
    return;
  }

  if (!(await tableExists(db, "sms_send_records"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0009_sms_send_records_backfill.sql" });
  }

  if (!(await tableExists(db, "storage_upload_sessions"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0002_storage_uploads.sql" });
  }

  if (!(await tableExists(db, "episode_generation_drafts"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0004_episode_workbench_hardening.sql" });
  }

  if (!(await tableExists(db, "episode_asset_conversation_threads"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0005_episode_asset_conversations.sql" });
  }

  if (!(await tableExists(db, "project_upload_records"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0006_project_upload_records.sql" });
  }

  if (!(await tableExists(db, "ai_generation_task_snapshots"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0008_ai_generation_task_snapshots.sql" });
  }
}

async function tableExists(db: SqlDatabase, tableName: string) {
  const tableCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );

  return tableCheck.rows[0]?.exists === true;
}
