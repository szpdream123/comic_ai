import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { applySqlMigrations } from "./migrations.ts";

export interface DevDatabase extends SqlDatabase {
  close(): Promise<void>;
}

export async function createDevDb(): Promise<DevDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
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

export async function ensureFoundationSchema(db: SqlDatabase) {
  const hasUsersTable = await tableExists(db, "users");

  if (!hasUsersTable) {
    await applySqlMigrations(db);
    await ensurePaymentProviderConstraints(db);
    return;
  }

  await ensurePaymentProviderConstraints(db);

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

  if (
    !(await tableExists(db, "ai_model_configs")) ||
    !(await tableExists(db, "ai_model_dispatch_policies")) ||
    !(await tableExists(db, "ai_model_config_revisions"))
  ) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0007_ai_model_configs.sql" });
  }

  if (!(await tableExists(db, "ai_generation_task_snapshots"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0008_ai_generation_task_snapshots.sql" });
  }

  if (
    !(await tableExists(db, "organization_entitlements")) ||
    !(await tableExists(db, "team_member_groups")) ||
    !(await tableExists(db, "team_member_profiles")) ||
    !(await tableExists(db, "team_project_assignments")) ||
    !(await tableExists(db, "team_project_ownerships")) ||
    !(await tableExists(db, "team_credit_adjustments")) ||
    !(await tableExists(db, "team_plan_limits"))
  ) {
    await ensureLegacyTenantUniqueConstraints(db);
    await ensureTeamCollaborationTables(db);
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

async function ensurePaymentProviderConstraints(db: SqlDatabase) {
  await ensureProviderConstraint(db, {
    tableName: "payment_intents",
    constraintName: "payment_intents_provider_check",
    allowedProviders: ["paylab", "wechat_pay", "alipay"],
  });
  await ensureProviderConstraint(db, {
    tableName: "payment_provider_events",
    constraintName: "payment_provider_events_provider_check",
    allowedProviders: ["paylab", "wechat_pay", "alipay"],
  });
  await ensureProviderConstraint(db, {
    tableName: "payment_reconciliation_runs",
    constraintName: "payment_reconciliation_runs_provider_check",
    allowedProviders: ["paylab", "wechat_pay", "alipay", "all"],
  });
}

async function ensureProviderConstraint(
  db: SqlDatabase,
  input: {
    tableName: string;
    constraintName: string;
    allowedProviders: string[];
  },
) {
  if (!(await tableExists(db, input.tableName))) {
    return;
  }

  const current = await db.query<{ definition: string }>(
    `
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = $1
      LIMIT 1
    `,
    [input.constraintName],
  );
  const definition = current.rows[0]?.definition ?? "";
  const hasExpectedProviders = input.allowedProviders.every((provider) => definition.includes(provider));
  if (hasExpectedProviders) {
    return;
  }

  const allowedSql = input.allowedProviders.map((provider) => `'${provider}'`).join(", ");
  await db.query(`ALTER TABLE ${input.tableName} DROP CONSTRAINT IF EXISTS ${input.constraintName}`);
  await db.query(
    `ALTER TABLE ${input.tableName} ADD CONSTRAINT ${input.constraintName} CHECK (provider IN (${allowedSql}))`,
  );
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

async function ensureTeamCollaborationTables(db: SqlDatabase) {
  await executeSchemaPatch(db, `
    CREATE TABLE IF NOT EXISTS organization_entitlements (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      entitlement_key text NOT NULL CHECK (
        entitlement_key IN (
          'team_asset_library',
          'team_member_management',
          'team_dashboard',
          'priority_generation'
        )
      ),
      status text NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
      source text NOT NULL CHECK (source IN ('manual', 'payment', 'trial', 'dev_seed')),
      expires_at timestamptz NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, entitlement_key)
    );

    CREATE INDEX IF NOT EXISTS organization_entitlements_active_idx
      ON organization_entitlements (organization_id, entitlement_key, status, expires_at);

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

    CREATE TABLE IF NOT EXISTS team_project_assignments (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      membership_id uuid NOT NULL REFERENCES memberships(id),
      project_id uuid NOT NULL REFERENCES projects(id),
      assigned_by_user_id uuid NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, workspace_id, membership_id, project_id),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id),
      FOREIGN KEY (organization_id, membership_id)
        REFERENCES memberships (organization_id, id),
      FOREIGN KEY (organization_id, project_id)
        REFERENCES projects (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS team_project_assignments_member_idx
      ON team_project_assignments (organization_id, workspace_id, membership_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS team_project_ownerships (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      project_id uuid NOT NULL REFERENCES projects(id),
      member_group_id uuid NULL REFERENCES team_member_groups(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, workspace_id, project_id),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id),
      FOREIGN KEY (organization_id, workspace_id, member_group_id)
        REFERENCES team_member_groups (organization_id, workspace_id, id),
      FOREIGN KEY (organization_id, project_id)
        REFERENCES projects (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS team_project_ownerships_group_idx
      ON team_project_ownerships (organization_id, workspace_id, member_group_id);

    CREATE TABLE IF NOT EXISTS team_credit_adjustments (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      operator_user_id uuid NOT NULL REFERENCES users(id),
      target_membership_id uuid NOT NULL REFERENCES memberships(id),
      adjustment_type text NOT NULL CHECK (
        adjustment_type IN ('allocate', 'recover', 'reset', 'expire')
      ),
      amount integer NOT NULL CHECK (amount > 0),
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, id),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id),
      FOREIGN KEY (organization_id, target_membership_id)
        REFERENCES memberships (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS team_credit_adjustments_scope_idx
      ON team_credit_adjustments (organization_id, workspace_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS team_plan_limits (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id),
      seat_limit integer NOT NULL DEFAULT 5 CHECK (seat_limit >= 0),
      single_account_concurrency_limit integer NOT NULL DEFAULT 1 CHECK (single_account_concurrency_limit >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id)
    );
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
