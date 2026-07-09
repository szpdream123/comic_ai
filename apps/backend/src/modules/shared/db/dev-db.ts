import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import { Pool, type PoolClient } from "pg";

import type { SqlDatabase, SqlQueryResult } from "./sql.ts";
import { applySqlMigration, applySqlMigrations } from "./migrations.ts";

export interface DevDatabase extends SqlDatabase {
  close(): Promise<void>;
}

export async function createDevDb(): Promise<DevDatabase> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required; configure PostgreSQL before starting the backend");
  }

  const pool = new Pool({
    connectionString,
  });
  const schemaName = process.env.DATABASE_SCHEMA?.trim() || undefined;

  try {
    if (schemaName) {
      await prepareSchema(pool, schemaName);
    }
    const db = createPostgresDatabase(pool, schemaName);
    await ensureFoundationSchema(db);
    return db;
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw new Error(
      `PostgreSQL database initialization failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

interface TransactionState {
  client: PoolClient | PooledDevDatabaseClient | null;
  clientPromise: Promise<PoolClient | PooledDevDatabaseClient>;
}

interface DatabaseExecutionContext {
  transactionState: TransactionState | null;
}

const databaseExecutionStorage = new AsyncLocalStorage<DatabaseExecutionContext>();

export async function runWithDatabaseContext<T>(run: () => Promise<T>): Promise<T> {
  const context: DatabaseExecutionContext = { transactionState: null };
  return databaseExecutionStorage.run(context, async () => {
    try {
      return await run();
    } finally {
      await releaseTransactionState(context);
    }
  });
}

export function createPostgresDatabase(pool: Pool, schemaName?: string): DevDatabase {
  const fallbackContext: DatabaseExecutionContext = { transactionState: null };

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      const command = transactionSqlCommand(sql);
      const context = databaseExecutionStorage.getStore() ?? fallbackContext;
      const existingTransaction = context.transactionState;
      if (existingTransaction) {
        const transactionClient = await existingTransaction.clientPromise;
        try {
          const result = await transactionClient.query(sql, params);
          if (command === "commit" || command === "rollback") {
            transactionClient.release();
            context.transactionState = null;
          }
          return {
            rows: result.rows as T[],
          };
        } catch (error) {
          if (command === "commit" || command === "rollback") {
            transactionClient.release();
            context.transactionState = null;
          }
          throw error;
        }
      }

      if (command === "begin") {
        const transactionState: TransactionState = {
          client: null,
          clientPromise: pool.connect().then(async (client) => {
            try {
              await setSearchPathIfNeeded(client, schemaName);
              transactionState.client = client;
              return client;
            } catch (error) {
              client.release();
              throw error;
            }
          }),
        };
        context.transactionState = transactionState;
        try {
          const transactionClient = await transactionState.clientPromise;
          const result = await transactionClient.query(sql, params);
          return {
            rows: result.rows as T[],
          };
        } catch (error) {
          transactionState.client?.release();
          context.transactionState = null;
          throw error;
        }
      }

      if (!schemaName) {
        const result = await pool.query(sql, params);
        return {
          rows: result.rows as T[],
        };
      }

      const client = await pool.connect();
      try {
        await setSearchPathIfNeeded(client, schemaName);
        const result = await client.query(sql, params);
        return {
          rows: result.rows as T[],
        };
      } finally {
        client.release();
      }
    },
    async close() {
      await releaseTransactionState(fallbackContext);
      await pool.end();
    },
  };
}

async function releaseTransactionState(context: DatabaseExecutionContext) {
  const transactionState = context.transactionState;
  if (!transactionState) {
    return;
  }
  context.transactionState = null;
  const transactionClient = await transactionState.clientPromise.catch(() => null);
  if (!transactionClient) {
    return;
  }
  try {
    await transactionClient.query("ROLLBACK");
  } catch {
    // The transaction may already have been closed by the caller.
  } finally {
    transactionClient.release();
  }
}

export function createPooledDevDatabaseForTests(pool: PooledDevDatabasePool): DevDatabase {
  return createPostgresDatabase(pool as unknown as Pool);
}

interface PooledDevDatabasePool {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  connect(): Promise<PooledDevDatabaseClient>;
  end(): Promise<void>;
}

interface PooledDevDatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  release(): void;
}

async function setSearchPathIfNeeded(client: PoolClient, schemaName?: string) {
  if (!schemaName) {
    return;
  }
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
}

function transactionSqlCommand(sql: string) {
  const normalized = sql.trim().replace(/;+$/, "").trim().replace(/\s+/g, " ").toLowerCase();
  if (normalized === "begin" || normalized.startsWith("begin ") || normalized === "start transaction") {
    return "begin";
  }
  if (normalized === "commit") {
    return "commit";
  }
  if (normalized === "rollback") {
    return "rollback";
  }
  return "other";
}

async function prepareSchema(pool: Pool, schemaName: string) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
}

function withSchemaCleanup(db: DevDatabase, schemaName: string): DevDatabase {
  const close = db.close.bind(db);
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
      return db.query<T>(sql, params);
    },
    async close() {
      try {
        await db.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      } finally {
        await close();
      }
    },
  };
}

export async function ensureFoundationSchema(db: SqlDatabase) {
  const hasUsersTable = await tableExists(db, "users");

  if (!hasUsersTable) {
    await applySqlMigrations(db);
    await ensurePaymentProviderConstraints(db);
    return;
  }

  await ensurePaymentProviderConstraints(db);
  await ensureFoundationBaseSchema(db);
  await ensureAdminManagementBaseSchema(db);

  if (!(await tableExists(db, "sms_send_records"))) {
    await applySqlMigration(db, process.cwd(), "0009_sms_send_records_backfill.sql");
  } else if (
    !(await columnExists(db, "sms_send_records", "verification_code")) ||
    !(await columnExists(db, "sms_send_records", "sms_content")) ||
    !(await columnExists(db, "sms_send_records", "ip_address"))
  ) {
    await applySqlMigration(db, process.cwd(), "0045_sms_send_records_audit_fields.sql");
  }

  if (!(await columnExists(db, "users", "wechat_openid"))) {
    await applySqlMigration(db, process.cwd(), "0024_wechat_login_user_fields.sql");
  }

  if (!(await tableExists(db, "storage_upload_sessions"))) {
    await applySqlMigration(db, process.cwd(), "0002_storage_uploads.sql");
  }

  if ((await tableExists(db, "scripts")) && !(await columnExists(db, "scripts", "deleted_at"))) {
    await applySqlMigration(db, process.cwd(), "0023_script_card_metadata.sql");
  }

  if (!(await tableExists(db, "script_reader_sections"))) {
    await applySqlMigration(db, process.cwd(), "0022_script_reader_sections.sql");
  }

  if (!(await tableExists(db, "episode_generation_drafts"))) {
    await applySqlMigration(db, process.cwd(), "0004_episode_workbench_hardening.sql");
  } else if (
    (await episodeGenerationDraftColumnsExist(db)) &&
    ((await uniqueConstraintForColumnsExists(db, "episode_generation_drafts", [
      "organization_id",
      "episode_id",
      "target_type",
      "target_id",
    ])) ||
      !(await uniqueConstraintForColumnsExists(db, "episode_generation_drafts", [
        "organization_id",
        "episode_id",
        "target_type",
        "target_id",
        "mode",
      ])))
  ) {
    await ensureEpisodeGenerationDraftModeConstraint(db);
  }

  if (!(await tableExists(db, "episode_asset_conversation_threads"))) {
    await applySqlMigration(db, process.cwd(), "0005_episode_asset_conversations.sql");
  }

  if (!(await tableExists(db, "project_upload_records"))) {
    await applySqlMigration(db, process.cwd(), "0006_project_upload_records.sql");
  }

  if (
    (await tableExists(db, "project_upload_records")) &&
    !(await indexExists(db, "project_upload_records_upload_session_unique_idx"))
  ) {
    await applySqlMigration(db, process.cwd(), "0070_project_upload_records_upload_session_unique.sql");
  }

  if (
    !(await tableExists(db, "ai_model_configs")) ||
    !(await tableExists(db, "ai_model_dispatch_policies")) ||
    !(await tableExists(db, "ai_model_config_revisions"))
  ) {
    await applySqlMigration(db, process.cwd(), "0007_ai_model_configs.sql");
  } else {
    if (!(await constraintAllowsValue(db, "ai_model_configs", "ai_model_configs_provider_protocol_check", "lingdong_api"))) {
      await applySqlMigration(db, process.cwd(), "0047_lingdong_api_provider_protocol.sql");
    }
    if (!(await aiModelConfigExists(db, "happyhorse-1.0-r2v"))) {
      await applySqlMigration(db, process.cwd(), "0021_aliyun_bailian_happyhorse_video_model.sql");
    }
    if (
      !(await constraintAllowsValue(db, "ai_model_configs", "ai_model_configs_provider_protocol_check", "globalaiopc_video")) ||
      !(await aiModelConfigExists(db, "sd2_manxue"))
    ) {
      await applySqlMigration(db, process.cwd(), "0070_globalaiopc_video_model_configs.sql");
    }
    if (!(await aiModelConfigExists(db, "jimeng-5-image"))) {
      await applySqlMigration(db, process.cwd(), "0025_jimeng_image_model_configs.sql");
    }
  }

  if (!(await tableExists(db, "ai_generation_task_snapshots"))) {
    await applySqlMigration(db, process.cwd(), "0008_ai_generation_task_snapshots.sql");
  }

  if (!(await tableExists(db, "user_model_request_logs"))) {
    await applySqlMigration(db, process.cwd(), "0041_user_model_request_logs.sql");
  }

  if (
    (await columnExists(db, "provider_requests", "organization_id")) ||
    !(await uniqueConstraintForColumnsExists(db, "provider_requests", [
      "provider_name",
      "provider_operation",
      "request_key",
    ]))
  ) {
    await applySqlMigration(db, process.cwd(), "0068_remove_provider_requests_organization_id.sql");
  }

  if (await columnExists(db, "user_model_request_logs", "organization_id")) {
    await applySqlMigration(db, process.cwd(), "0069_remove_user_model_request_logs_organization_id.sql");
  }

  if (
    !(await tableExists(db, "organization_entitlements")) ||
    !(await tableExists(db, "library_assets")) ||
    !(await tableExists(db, "library_asset_versions")) ||
    !(await tableExists(db, "team_member_groups")) ||
    !(await tableExists(db, "team_member_profiles")) ||
    !(await tableExists(db, "team_project_assignments")) ||
    !(await tableExists(db, "team_project_ownerships")) ||
    !(await tableExists(db, "team_credit_adjustments")) ||
    !(await tableExists(db, "team_plan_limits"))
  ) {
    await ensureLegacyTenantUniqueConstraints(db);
    await ensureLibraryAssetTables(db);
    await ensureTeamCollaborationTables(db);
  }
  if (
    !(await columnExists(db, "team_member_profiles", "script_ids")) ||
    !(await columnExists(db, "team_member_profiles", "canvas_ids"))
  ) {
    await applySqlMigration(db, process.cwd(), "0059_team_member_resource_visibility.sql");
  }
  await ensureTeamMemberProfilesBusinessRoleCompatibility(db);

  if (!(await tableExists(db, "admin_accounts"))) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0010_admin_management_platform.sql" });
  } else if (
    !(await columnExists(db, "admin_accounts", "failed_login_count")) ||
    !(await columnExists(db, "admin_accounts", "locked_until"))
  ) {
    await applySqlMigrations(db, process.cwd(), { fromName: "0010_admin_management_platform.sql" });
  }

  if (
    !(await tableExists(db, "membership_plans")) ||
    !(await tableExists(db, "membership_plan_revisions")) ||
    !(await tableExists(db, "organization_membership_subscriptions")) ||
    !(await tableExists(db, "membership_periods")) ||
    !(await tableExists(db, "credit_lots")) ||
    !(await tableExists(db, "credit_reservation_lot_allocations")) ||
    !(await tableExists(db, "membership_reminders")) ||
    !(await columnExists(db, "billing_orders", "product_type")) ||
    !(await constraintExists(db, "billing_orders", "billing_orders_credits_product_shape_check")) ||
    !(await constraintExists(
      db,
      "organization_membership_subscriptions",
      "organization_membership_subscriptions_latest_order_fk",
    )) ||
    !(await constraintExists(db, "membership_periods", "membership_periods_order_fk")) ||
    !(await constraintExists(db, "credit_lots", "credit_lots_grant_ledger_entry_fk"))
  ) {
    await applySqlMigration(db, process.cwd(), "0016_membership_subscription_payment.sql");
  }

  if (
    !(await tableExists(db, "credit_wallet_transfers")) ||
    !(await columnExists(db, "credit_packages", "gift_credits")) ||
    !(await columnExists(db, "credit_packages", "sort_order")) ||
    !(await constraintAllowsValue(db, "credit_ledger_entries", "credit_ledger_entries_entry_type_check", "transfer_in"))
  ) {
    await applySqlMigration(db, process.cwd(), "0041_credit_recharge_center.sql");
  }

  if (!(await constraintAllowsNumericValue(db, "membership_plans", "membership_plans_seat_limit_check", "seat_limit", 0))) {
    await applySqlMigration(db, process.cwd(), "0042_membership_plan_zero_seats.sql");
  }

  if (
    !(await columnExists(db, "membership_plans", "visibility")) ||
    !(await columnExists(db, "membership_plans", "usage_scene")) ||
    !(await tableExists(db, "invite_reward_configs")) ||
    !(await tableExists(db, "user_invite_bindings")) ||
    !(await tableExists(db, "invite_reward_grants"))
  ) {
    await applySqlMigration(db, process.cwd(), "0066_user_invite_rewards.sql");
  }

  if (!(await tableExists(db, "announcements"))) {
    await applySqlMigration(db, process.cwd(), "0067_announcements.sql");
  }

  if (
    !(await constraintAllowsValue(
      db,
      "organization_entitlements",
      "organization_entitlements_entitlement_key_check",
      "canvas_access",
    )) ||
    !(await constraintAllowsValue(
      db,
      "organization_entitlements",
      "organization_entitlements_entitlement_key_check",
      "full_flow_agent",
    ))
  ) {
    await applySqlMigration(db, process.cwd(), "0043_membership_entitlement_keys.sql");
  }

  if (
    !(await columnExists(db, "memberships", "membership_tier")) ||
    !(await columnExists(db, "memberships", "purchase_at")) ||
    !(await columnExists(db, "memberships", "expires_at")) ||
    !(await columnExists(db, "memberships", "gift_credits"))
  ) {
    await applySqlMigration(db, process.cwd(), "0052_user_membership_subscription.sql");
  }

  if (
    !(await tableExists(db, "team_members")) ||
    !(await tableExists(db, "team_member_projects"))
  ) {
    await applySqlMigration(db, process.cwd(), "0053_simple_team_members.sql");
  } else if (
    await constraintExistsOnCurrentSchema(db, "team_members", "team_members_user_id_member_account_key")
  ) {
    await applySqlMigration(db, process.cwd(), "0062_team_member_login_account_only_unique.sql");
  }
  if (
    !(await tableExists(db, "team_member_scripts")) ||
    !(await tableExists(db, "team_member_canvases"))
  ) {
    await applySqlMigration(db, process.cwd(), "0059_team_member_resource_visibility.sql");
  } else if (
    await needsTeamMemberResourceProjectNullabilityUpdate(db)
  ) {
    await applySqlMigration(db, process.cwd(), "0060_team_member_resource_project_nullable.sql");
  }

  if (
    !(await tableExists(db, "team_member_auth_sessions")) ||
    !(await tableExists(db, "team_member_project_records"))
  ) {
    await applySqlMigration(db, process.cwd(), "0054_simple_team_member_access.sql");
  } else if (
    await constraintExistsOnCurrentSchema(db, "team_member_project_records", "team_member_project_records_member_id_project_id_fkey")
  ) {
    await applySqlMigration(db, process.cwd(), "0061_team_member_project_records_detach_project_fk.sql");
  }

  if (
    !(await columnExists(db, "users", "team_account_suffix")) ||
    !(await constraintExists(db, "users", "users_team_account_suffix_format_check")) ||
    !(await indexExists(db, "users_team_account_suffix_key"))
  ) {
    await applySqlMigration(db, process.cwd(), "0055_user_team_account_suffix.sql");
  }

  if (
    !(await constraintAllowsValue(
      db,
      "memberships",
      "memberships_role_check",
      "sub_account",
    ))
  ) {
    await applySqlMigration(db, process.cwd(), "0057_memberships_sub_account_role.sql");
  }

  if (
    !(await columnExists(db, "organizations", "credit_frozen_cached")) ||
    !(await columnExists(db, "credit_lots", "status")) ||
    !(await constraintAllowsValue(db, "credit_ledger_entries", "credit_ledger_entries_entry_type_check", "freeze")) ||
    !(await constraintAllowsValue(db, "credit_ledger_entries", "credit_ledger_entries_entry_type_check", "restore"))
  ) {
    await applySqlMigration(db, process.cwd(), "0044_credit_direct_recharge_wallet_freeze.sql");
  }

  if (!(await constraintExists(db, "users", "users_phone_e164_format_check"))) {
    await applySqlMigration(db, process.cwd(), "0047_users_phone_numeric_constraint.sql");
  }

  if (
    !(await columnExists(db, "users", "invite_code")) ||
    !(await constraintExists(db, "users", "users_invite_code_format_check")) ||
    !(await indexExists(db, "users_invite_code_key"))
  ) {
    await applySqlMigration(db, process.cwd(), "0048_user_invite_codes.sql");
  }

  if (await inviteCodeGeneratorNeedsRefresh(db)) {
    await applySqlMigration(db, process.cwd(), "0050_random_user_invite_codes.sql");
  }

  if (
    !(await columnExists(db, "users", "credit_balance_cached")) ||
    !(await columnExists(db, "users", "credit_reserved_cached")) ||
    !(await columnExists(db, "users", "credit_frozen_cached")) ||
    !(await columnExists(db, "credit_ledger_entries", "user_id")) ||
    !(await columnExists(db, "credit_reservations", "user_id")) ||
    !(await columnExists(db, "credit_lots", "user_id")) ||
    !(await columnExists(db, "credit_reservation_lot_allocations", "user_id")) ||
    !(await columnAllowsNull(db, "credit_reservation_lot_allocations", "organization_id"))
  ) {
    await applySqlMigration(db, process.cwd(), "0051_user_credit_wallets.sql");
  }

  if (!(await tableExists(db, "storyboard_prompt_packages"))) {
    await applySqlMigration(db, process.cwd(), "0011_storyboard_prompt_management.sql");
  } else {
    if (!(await columnExists(db, "storyboard_prompt_packages", "cover_image_url"))) {
      await db.query("ALTER TABLE storyboard_prompt_packages ADD COLUMN cover_image_url text NULL");
    }
    if (await needsStoryboardPromptCleanup(db)) {
      await applySqlMigration(db, process.cwd(), "0017_remove_deprecated_prompt_categories.sql");
    }
  }

  if (!(await tableExists(db, "image_prompt_styles"))) {
    await applySqlMigration(db, process.cwd(), "0012_image_prompt_styles.sql");
  } else {
    if (!(await columnExists(db, "image_prompt_styles", "cover_image_url"))) {
      await db.query("ALTER TABLE image_prompt_styles ADD COLUMN cover_image_url text NULL");
    }
    if (!(await columnExists(db, "image_prompt_styles", "is_default"))) {
      await db.query("ALTER TABLE image_prompt_styles ADD COLUMN is_default boolean NOT NULL DEFAULT false");
    }
    await ensureCategoryConstraint(db, {
      tableName: "image_prompt_styles",
      constraintName: "image_prompt_styles_category_check",
      columnName: "category",
      allowedValues: ["official", "batch", "custom"],
    });
  }

  if (!(await tableExists(db, "character_prompt_templates"))) {
    await applySqlMigration(db, process.cwd(), "0014_character_prompt_templates.sql");
  }

  if (!(await tableExists(db, "scene_prompt_templates"))) {
    await applySqlMigration(db, process.cwd(), "0015_scene_prompt_templates.sql");
  }

  if (!(await tableExists(db, "shot_prompt_templates"))) {
    await applySqlMigration(db, process.cwd(), "0016_shot_prompt_templates.sql");
  }

  if (!(await tableExists(db, "prop_prompt_templates"))) {
    await applySqlMigration(db, process.cwd(), "0018_prop_prompt_templates.sql");
  }

  if (!(await tableExists(db, "creator_canvas_projects"))) {
    await applySqlMigration(db, process.cwd(), "0026_creator_canvas_projects.sql");
  } else {
    await ensureStandaloneCanvasProjectSchema(db);
  }
}

async function ensureAdminManagementBaseSchema(db: SqlDatabase) {
  if (await tableExists(db, "admin_accounts")) {
    if (!(await columnExists(db, "admin_accounts", "failed_login_count"))) {
      await db.query("ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0");
    }
    if (!(await columnExists(db, "admin_accounts", "locked_until"))) {
      await db.query("ALTER TABLE admin_accounts ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL");
    }
  } else {
    await db.query(`
      CREATE TABLE admin_accounts (
        id uuid PRIMARY KEY,
        user_id uuid NULL REFERENCES users(id),
        login_name text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        display_name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        failed_login_count integer NOT NULL DEFAULT 0,
        locked_until timestamptz NULL,
        remark text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (status IN ('active', 'disabled', 'archived'))
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS admin_accounts_status_login_idx
        ON admin_accounts (status, login_name)
    `);
  }

  if (!(await tableExists(db, "admin_account_roles"))) {
    await db.query(`
      CREATE TABLE admin_account_roles (
        id uuid PRIMARY KEY,
        admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
        role_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (admin_account_id, role_code),
        CHECK (role_code IN (
          'super_admin',
          'ops_admin',
          'model_admin',
          'finance_admin',
          'support_admin',
          'audit_viewer'
        ))
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS admin_account_roles_account_idx
        ON admin_account_roles (admin_account_id, role_code)
    `);
  }

  if (!(await tableExists(db, "admin_auth_sessions"))) {
    await db.query(`
      CREATE TABLE admin_auth_sessions (
        id uuid PRIMARY KEY,
        admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
        session_token_hash text NOT NULL UNIQUE,
        ip_address text NULL,
        user_agent text NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS admin_auth_sessions_account_expiry_idx
        ON admin_auth_sessions (admin_account_id, expires_at, revoked_at)
    `);
  }

  if (!(await tableExists(db, "runtime_config_entries"))) {
    await db.query(`
      CREATE TABLE runtime_config_entries (
        key text PRIMARY KEY,
        value_json jsonb NOT NULL,
        value_type text NOT NULL,
        scope text NOT NULL DEFAULT 'global',
        description text NULL,
        updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'string_array')),
        CHECK (scope IN ('global', 'admin', 'creator', 'model', 'billing', 'risk'))
      )
    `);
  }

  if (!(await tableExists(db, "runtime_config_revisions"))) {
    await db.query(`
      CREATE TABLE runtime_config_revisions (
        id uuid PRIMARY KEY,
        config_key text NOT NULL,
        previous_value_json jsonb NULL,
        next_value_json jsonb NOT NULL,
        changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
        reason text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS runtime_config_revisions_key_created_idx
        ON runtime_config_revisions (config_key, created_at DESC)
    `);
  }

  if (!(await tableExists(db, "admin_secret_references"))) {
    await db.query(`
      CREATE TABLE admin_secret_references (
        id uuid PRIMARY KEY,
        secret_ref text NOT NULL UNIQUE,
        env_name text NOT NULL UNIQUE,
        purpose text NOT NULL,
        provider_name text NULL,
        status text NOT NULL DEFAULT 'unknown',
        last_checked_at timestamptz NULL,
        created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (status IN ('configured', 'missing', 'unknown'))
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS admin_secret_references_env_status_idx
        ON admin_secret_references (env_name, status)
    `);
  }

  if (!(await tableExists(db, "ai_model_config_revisions")) && (await tableExists(db, "ai_model_configs"))) {
    await db.query(`
      CREATE TABLE ai_model_config_revisions (
        id uuid PRIMARY KEY,
        model_config_id uuid NOT NULL REFERENCES ai_model_configs(id),
        snapshot_json jsonb NOT NULL,
        changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
        reason text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS ai_model_config_revisions_model_created_idx
        ON ai_model_config_revisions (model_config_id, created_at DESC)
    `);
  }
}

async function ensureFoundationBaseSchema(db: SqlDatabase) {
  if (
    (await tableExists(db, "login_challenges")) &&
    (await tableExists(db, "auth_sessions")) &&
    (await tableExists(db, "storage_objects")) &&
    (await tableExists(db, "provider_requests")) &&
    (await tableExists(db, "billing_orders")) &&
    (await tableExists(db, "projects"))
  ) {
    return;
  }

  await applySqlMigration(db, process.cwd(), "0001_foundation.sql");
}

async function ensureStandaloneCanvasProjectSchema(db: SqlDatabase) {
  await db.query("ALTER TABLE creator_canvas_projects ALTER COLUMN project_id DROP NOT NULL");
  await db.query("ALTER TABLE creator_canvas_documents ALTER COLUMN project_id DROP NOT NULL");
  if (await creatorCanvasProjectIndexCurrent(db)) {
    return;
  }

  await db.query("SELECT pg_advisory_lock(hashtext('creator_canvas_projects_project_uidx_repair'))");
  try {
    if (await creatorCanvasProjectIndexCurrent(db)) {
      return;
    }
    await db.query("DROP INDEX IF EXISTS creator_canvas_projects_project_uidx");
    await db.query(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_projects_project_uidx
        ON creator_canvas_projects (organization_id, project_id)
        WHERE deleted_at IS NULL AND project_id IS NOT NULL
      `,
    );
  } finally {
    await db.query("SELECT pg_advisory_unlock(hashtext('creator_canvas_projects_project_uidx_repair'))");
  }
}

async function creatorCanvasProjectIndexCurrent(db: SqlDatabase) {
  const result = await db.query<{ indexdef: string }>(
    `
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'creator_canvas_projects'
        AND indexname = 'creator_canvas_projects_project_uidx'
      LIMIT 1
    `,
  );
  const indexDef = result.rows[0]?.indexdef ?? "";
  return /\bdeleted_at IS NULL\b/i.test(indexDef) && /\bproject_id IS NOT NULL\b/i.test(indexDef);
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

async function ensureCategoryConstraint(
  db: SqlDatabase,
  input: {
    tableName: string;
    constraintName: string;
    columnName: string;
    allowedValues: string[];
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
  const hasExpectedValues = input.allowedValues.every((value) => definition.includes(value));
  if (hasExpectedValues) {
    return;
  }

  const allowedSql = input.allowedValues.map((value) => `'${value}'`).join(", ");
  await db.query(`ALTER TABLE ${input.tableName} DROP CONSTRAINT IF EXISTS ${input.constraintName}`);
  await db.query(
    `ALTER TABLE ${input.tableName} ADD CONSTRAINT ${input.constraintName} CHECK (${input.columnName} IN (${allowedSql}))`,
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
          'canvas_access',
          'priority_generation',
          'team_asset_library',
          'team_member_management',
          'team_dashboard',
          'full_flow_agent'
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
      member_group_id uuid NULL REFERENCES team_member_groups(id),
      credit_balance_cached integer NOT NULL DEFAULT 0 CHECK (credit_balance_cached >= 0),
      credit_used_cached integer NOT NULL DEFAULT 0 CHECK (credit_used_cached >= 0),
      last_credit_consumed_at timestamptz NULL,
      remark text NULL,
      script_ids text[] NOT NULL DEFAULT '{}'::text[],
      canvas_ids text[] NOT NULL DEFAULT '{}'::text[],
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
      ON team_member_profiles (organization_id, workspace_id, member_group_id);

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

async function ensureLibraryAssetTables(db: SqlDatabase) {
  await executeSchemaPatch(db, `
    CREATE TABLE IF NOT EXISTS library_assets (
      id uuid PRIMARY KEY,
      scope text NOT NULL CHECK (scope IN ('official', 'team', 'personal')),
      organization_id uuid NULL REFERENCES organizations(id),
      workspace_id uuid NULL REFERENCES workspaces(id),
      created_by_user_id uuid NULL REFERENCES users(id),
      asset_type text NOT NULL CHECK (asset_type IN ('character', 'scene', 'prop', 'image', 'video')),
      category text NOT NULL CHECK (category IN ('character', 'scene', 'prop', 'image', 'video')),
      folder text NOT NULL,
      name text NOT NULL,
      description text NULL,
      tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
      status text NOT NULL CHECK (status IN ('active', 'archived')),
      requires_pro_entitlement boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (
        (scope = 'official' AND organization_id IS NULL AND workspace_id IS NULL AND created_by_user_id IS NULL)
        OR (scope = 'team' AND organization_id IS NOT NULL AND workspace_id IS NOT NULL)
        OR (scope = 'personal' AND organization_id IS NOT NULL AND workspace_id IS NOT NULL AND created_by_user_id IS NOT NULL)
      ),
      FOREIGN KEY (organization_id, workspace_id)
        REFERENCES workspaces (organization_id, id)
    );

    CREATE INDEX IF NOT EXISTS library_assets_scope_idx
      ON library_assets (scope, organization_id, workspace_id, category, folder, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS library_asset_versions (
      id uuid PRIMARY KEY,
      library_asset_id uuid NOT NULL REFERENCES library_assets(id),
      version_number integer NOT NULL CHECK (version_number >= 1),
      storage_object_key text NOT NULL,
      preview_url text NULL,
      mime_type text NOT NULL,
      width integer NOT NULL CHECK (width >= 1),
      height integer NOT NULL CHECK (height >= 1),
      metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (library_asset_id, version_number)
    );

    CREATE INDEX IF NOT EXISTS library_asset_versions_asset_idx
      ON library_asset_versions (library_asset_id, version_number DESC);
  `);
}

async function executeSchemaPatch(db: SqlDatabase, sql: string) {
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, sql);
    return;
  }

  await db.query(sql);
}

async function ensureEpisodeGenerationDraftModeConstraint(db: SqlDatabase) {
  const legacyConstraints = await uniqueConstraintNamesForColumns(db, "episode_generation_drafts", [
    "organization_id",
    "episode_id",
    "target_type",
    "target_id",
  ]);

  for (const constraintName of legacyConstraints) {
    await db.query(`ALTER TABLE episode_generation_drafts DROP CONSTRAINT ${quoteIdentifier(constraintName)}`);
  }

  if (
    !(await uniqueConstraintForColumnsExists(db, "episode_generation_drafts", [
      "organization_id",
      "episode_id",
      "target_type",
      "target_id",
      "mode",
    ]))
  ) {
    await db.query(`
      ALTER TABLE episode_generation_drafts
      ADD CONSTRAINT episode_generation_drafts_mode_unique
      UNIQUE (organization_id, episode_id, target_type, target_id, mode)
    `);
  }
}

async function needsStoryboardPromptCleanup(db: SqlDatabase) {
  if (!(await tableExists(db, "storyboard_prompt_templates"))) return false;

  const columnCheck = await db.query<{ is_nullable: string }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'storyboard_prompt_templates'
        AND column_name = 'output_package_id'
    `,
  );
  if (columnCheck.rows[0]?.is_nullable === "NO") return true;

  const deprecatedPackages = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM storyboard_prompt_packages
        WHERE package_type IN ('camera', 'output')
          AND deleted_at IS NULL
      ) AS exists
    `,
  );
  return deprecatedPackages.rows[0]?.exists === true;
}

async function tableExists(db: SqlDatabase, tableName: string) {
  const tableCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );

  return tableCheck.rows[0]?.exists === true;
}

async function aiModelConfigExists(db: SqlDatabase, modelCode: string) {
  if (!(await tableExists(db, "ai_model_configs"))) {
    return false;
  }

  const result = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM ai_model_configs
        WHERE model_code = $1
      ) AS exists
    `,
    [modelCode],
  );

  return result.rows[0]?.exists === true;
}

async function needsTeamMemberResourceProjectNullabilityUpdate(db: SqlDatabase) {
  if (!(await tableExists(db, "team_member_scripts")) || !(await tableExists(db, "team_member_canvases"))) {
    return false;
  }

  const scriptColumn = await db.query<{ is_nullable: string }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'team_member_scripts'
        AND column_name = 'project_id'
    `,
  );
  const canvasColumn = await db.query<{ is_nullable: string }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'team_member_canvases'
        AND column_name = 'project_id'
    `,
  );
  return scriptColumn.rows[0]?.is_nullable === "NO" || canvasColumn.rows[0]?.is_nullable === "NO";
}

async function currentSchemaName(db: SqlDatabase) {
  const schema = await db.query<{ schema_name: string }>(`
    SELECT current_schema() AS schema_name
  `);

  return schema.rows[0]?.schema_name ?? "public";
}

async function constraintExists(db: SqlDatabase, tableName: string, constraintName: string) {
  return constraintExistsOnSchema(db, await currentSchemaName(db), tableName, constraintName);
}

async function constraintExistsOnCurrentSchema(db: SqlDatabase, tableName: string, constraintName: string) {
  return constraintExistsOnSchema(db, await currentSchemaName(db), tableName, constraintName);
}

async function constraintExistsOnSchema(
  db: SqlDatabase,
  schemaName: string,
  tableName: string,
  constraintName: string,
) {
  const constraintCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = $1
          AND table_name = $2
          AND constraint_name = $3
      ) AS exists
    `,
    [schemaName, tableName, constraintName],
  );

  return constraintCheck.rows[0]?.exists === true;
}

async function indexExists(db: SqlDatabase, indexName: string) {
  const indexCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = $1
      ) AS exists
    `,
    [indexName],
  );

  return indexCheck.rows[0]?.exists === true;
}

async function inviteCodeGeneratorNeedsRefresh(db: SqlDatabase) {
  const functionCheck = await db.query<{ definition: string }>(
    `
      SELECT pg_get_functiondef(proc.oid) AS definition
      FROM pg_proc proc
      JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = current_schema()
        AND proc.proname = 'generate_user_invite_code'
      LIMIT 1
    `,
  );

  const definition = String(functionCheck.rows[0]?.definition ?? "");
  if (!definition) {
    return true;
  }

  return definition.includes("nextval('user_invite_code_seq'");
}

async function constraintAllowsValue(
  db: SqlDatabase,
  tableName: string,
  constraintName: string,
  value: string,
) {
  const constraintCheck = await db.query<{ definition: string }>(
    `
      SELECT pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = $1
        AND con.conname = $2
      LIMIT 1
    `,
    [tableName, constraintName],
  );
  return String(constraintCheck.rows[0]?.definition ?? "").includes(value);
}

async function constraintAllowsNumericValue(
  db: SqlDatabase,
  tableName: string,
  constraintName: string,
  columnName: string,
  value: number,
) {
  const constraintCheck = await db.query<{ definition: string }>(
    `
      SELECT pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = $1
        AND con.conname = $2
      LIMIT 1
    `,
    [tableName, constraintName],
  );
  const definition = String(constraintCheck.rows[0]?.definition ?? "").trim();
  if (!definition) {
    return false;
  }

  const tempTable = `tmp_constraint_probe_${randomUUID().replace(/-/g, "")}`;
  const safeColumnName = columnName.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeColumnName) {
    return false;
  }
  try {
    await db.query(`CREATE TEMP TABLE ${tempTable} (${safeColumnName} integer, CONSTRAINT ${constraintName} ${definition}) ON COMMIT DROP`);
    await db.query(`INSERT INTO ${tempTable} (${safeColumnName}) VALUES ($1)`, [value]);
    return true;
  } catch {
    return false;
  } finally {
    await db.query(`DROP TABLE IF EXISTS ${tempTable}`).catch(() => undefined);
  }
}

async function uniqueConstraintForColumnsExists(db: SqlDatabase, tableName: string, columnNames: string[]) {
  const constraintCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = current_schema()
          AND rel.relname = $1
          AND con.contype = 'u'
          AND (
            SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
            FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
          ) = $2::text[]
      ) AS exists
    `,
    [tableName, columnNames],
  );

  return constraintCheck.rows[0]?.exists === true;
}

async function uniqueConstraintNamesForColumns(db: SqlDatabase, tableName: string, columnNames: string[]) {
  const constraints = await db.query<{ constraint_name: string }>(
    `
      SELECT con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = current_schema()
        AND rel.relname = $1
        AND con.contype = 'u'
        AND (
          SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
          FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
        ) = $2::text[]
    `,
    [tableName, columnNames],
  );

  return constraints.rows.map((row) => row.constraint_name);
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function episodeGenerationDraftColumnsExist(db: SqlDatabase) {
  const requiredColumns = ["organization_id", "episode_id", "target_type", "target_id", "mode"];
  const columnCheck = await db.query<{ count: string | number }>(
    `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'episode_generation_drafts'
        AND column_name = ANY($1::text[])
    `,
    [requiredColumns],
  );

  return Number(columnCheck.rows[0]?.count ?? 0) === requiredColumns.length;
}

async function columnExists(db: SqlDatabase, tableName: string, columnName: string) {
  const columnCheck = await db.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  );

  return columnCheck.rows[0]?.exists === true;
}

async function columnAllowsNull(db: SqlDatabase, tableName: string, columnName: string) {
  const columnCheck = await db.query<{ is_nullable: string }>(
    `
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName],
  );

  return columnCheck.rows[0]?.is_nullable === "YES";
}

async function ensureTeamMemberProfilesBusinessRoleCompatibility(db: SqlDatabase) {
  if (!(await tableExists(db, "team_member_profiles"))) {
    return;
  }
  if (!(await columnExists(db, "team_member_profiles", "business_role"))) {
    return;
  }

  await db.query("UPDATE team_member_profiles SET business_role = 'director' WHERE business_role IS NULL");
  await db.query("ALTER TABLE team_member_profiles ALTER COLUMN business_role DROP NOT NULL");
}
