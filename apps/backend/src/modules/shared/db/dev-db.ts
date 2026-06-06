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

  if (!(await tableExists(db, "team_member_groups")) || !(await tableExists(db, "team_member_profiles"))) {
    await ensureLegacyTenantUniqueConstraints(db);
    await ensureTeamMemberProfileTables(db);
  }

  if (!(await tableExists(db, "admin_accounts"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0010_admin_management_platform.sql" });
  } else if (
    !(await columnExists(db, "admin_accounts", "failed_login_count")) ||
    !(await columnExists(db, "admin_accounts", "locked_until"))
  ) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0010_admin_management_platform.sql" });
  }

  if (!(await tableExists(db, "storyboard_prompt_packages"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0011_storyboard_prompt_management.sql" });
  }

  if (!(await tableExists(db, "image_prompt_styles"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0012_image_prompt_styles.sql" });
  }

  if (!(await tableExists(db, "character_prompt_templates"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0014_character_prompt_templates.sql" });
  }

  if (!(await tableExists(db, "scene_prompt_templates"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0015_scene_prompt_templates.sql" });
  }
}

async function ensureLegacyTenantUniqueConstraints(db: SqlDatabase) {
  if (
    (await tableExists(db, "workspaces")) &&
    !(await constraintExists(db, "workspaces", "workspaces_organization_id_id_key"))
  ) {
    await db.query(`
      ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_organization_id_id_key
      UNIQUE (organization_id, id)
    `);
  }

  if (
    (await tableExists(db, "memberships")) &&
    !(await constraintExists(db, "memberships", "memberships_organization_id_id_key"))
  ) {
    await db.query(`
      ALTER TABLE memberships
      ADD CONSTRAINT memberships_organization_id_id_key
      UNIQUE (organization_id, id)
    `);
  }
}

async function ensureTeamMemberProfileTables(db: SqlDatabase) {
  await executeSchemaPatch(db, `
    CREATE TABLE IF NOT EXISTS team_member_groups (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      name text NOT NULL,
      status text NOT NULL CHECK (status IN ('active', 'archived')),
      created_by_user_id uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, workspace_id, name),
      UNIQUE (organization_id, id),
      UNIQUE (organization_id, workspace_id, id),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS team_member_groups_scope_idx
      ON team_member_groups (organization_id, workspace_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS team_member_profiles (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      membership_id uuid NOT NULL REFERENCES memberships(id),
      team_account text NOT NULL,
      display_name text NOT NULL,
      business_role text NOT NULL CHECK (
        business_role IN (
          'admin',
          'group_admin',
          'director_plus',
          'animator_plus',
          'director',
          'animator',
          'screenwriter',
          'editor'
        )
      ),
      member_group_id uuid NULL REFERENCES team_member_groups(id),
      credit_balance_cached integer NOT NULL DEFAULT 0 CHECK (credit_balance_cached >= 0),
      credit_used_cached integer NOT NULL DEFAULT 0 CHECK (credit_used_cached >= 0),
      last_credit_consumed_at timestamptz NULL,
      remark text NULL,
      created_by_user_id uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, workspace_id, membership_id),
      UNIQUE (organization_id, workspace_id, team_account),
      UNIQUE (organization_id, id),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id),
      FOREIGN KEY (organization_id, workspace_id, member_group_id)
        REFERENCES team_member_groups (organization_id, workspace_id, id),
      FOREIGN KEY (organization_id, membership_id)
        REFERENCES memberships (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS team_member_profiles_scope_idx
      ON team_member_profiles (organization_id, workspace_id, business_role, member_group_id);
  `);
}

async function executeSchemaPatch(db: SqlDatabase, sql: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, sql);
    return;
  }

  for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean)) {
    await db.query(`${statement};`);
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

async function constraintExists(db: SqlDatabase, tableName: string, constraintName: string) {
  const constraintCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = $1
          AND constraint_name = $2
      ) AS exists
    `,
    [tableName, constraintName],
  );

  return constraintCheck.rows[0]?.exists === true;
}

async function columnExists(db: SqlDatabase, tableName: string, columnName: string) {
  const columnCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  );

  return columnCheck.rows[0]?.exists === true;
}
