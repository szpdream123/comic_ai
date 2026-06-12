import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { Pool } from "pg";

import { createDevDb } from "../dev-db.ts";

describe("createDevDb", () => {
  it("requires DATABASE_URL instead of falling back to embedded storage", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDatabaseSchema = process.env.DATABASE_SCHEMA;

    try {
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_SCHEMA;

      await assert.rejects(
        () => createDevDb(),
        /DATABASE_URL is required/,
      );
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("DATABASE_SCHEMA", previousDatabaseSchema);
    }
  });

  it("uses the configured PostgreSQL schema persistently", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("INSERT INTO organizations (id, name, status) VALUES ($1, $2, 'active')", [
        "10000000-0000-4000-8000-000000000999",
        "PostgreSQL persistence",
      ]);
      await db.close();

      const reopenedDb = await createDevDb();
      const result = await reopenedDb.query<{ name: string }>(
        "SELECT name FROM organizations WHERE id = $1",
        ["10000000-0000-4000-8000-000000000999"],
      );
      await reopenedDb.close();

      assert.equal(result.rows[0]?.name, "PostgreSQL persistence");
    });
  });

  it("does not fall back when DATABASE_URL is configured but unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousDatabaseSchema = process.env.DATABASE_SCHEMA;

    try {
      process.env.DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/comic_ai_unavailable";
      delete process.env.DATABASE_SCHEMA;

      await assert.rejects(
        () => createDevDb(),
        /PostgreSQL database initialization failed/,
      );
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("DATABASE_SCHEMA", previousDatabaseSchema);
    }
  });

  it("repairs existing PostgreSQL payment provider constraints to include PayLab", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("ALTER TABLE payment_intents DROP CONSTRAINT payment_intents_provider_check");
      await db.query(
        "ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_provider_check CHECK (provider IN ('wechat_pay', 'alipay'))",
      );
      await db.close();

      const repairedDb = await createDevDb();
      const constraint = await repairedDb.query<{ definition: string }>(
        `
          SELECT pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conname = 'payment_intents_provider_check'
        `,
      );
      await repairedDb.close();

      assert.match(constraint.rows[0]?.definition ?? "", /paylab/);
    });
  });

  it("repairs existing PostgreSQL databases missing model configuration tables", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("DROP TABLE IF EXISTS ai_generation_task_snapshots CASCADE");
      await db.query("DROP TABLE IF EXISTS ai_model_dispatch_policies CASCADE");
      await db.query("DROP TABLE IF EXISTS ai_model_configs CASCADE");
      await db.close();

      const repairedDb = await createDevDb();
      const models = await repairedDb.query<{ model_code: string }>(
        `
          SELECT model_code
          FROM ai_model_configs
          WHERE model_code IN ('gpt-image-2-cn', 'seedance-i2v-pro')
          ORDER BY model_code
        `,
      );
      const snapshots = await repairedDb.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = 'ai_generation_task_snapshots'
          ) AS exists
        `,
      );
      await repairedDb.close();

      assert.deepEqual(models.rows.map((row) => row.model_code), ["gpt-image-2-cn", "seedance-i2v-pro"]);
      assert.equal(snapshots.rows[0]?.exists, true);
    });
  });

  it("repairs existing PostgreSQL databases missing Jimeng image model configs", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query(
        `
          DELETE FROM ai_model_dispatch_policies
          WHERE model_config_id IN (
            SELECT id
            FROM ai_model_configs
            WHERE model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
          )
        `,
      );
      await db.query(
        `
          DELETE FROM ai_model_configs
          WHERE model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
        `,
      );
      await db.close();

      const repairedDb = await createDevDb();
      const models = await repairedDb.query<{ model_code: string; media_type: string; status: string }>(
        `
          SELECT model_code, media_type, status
          FROM ai_model_configs
          WHERE model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
          ORDER BY sort_order ASC
        `,
      );
      const policies = await repairedDb.query<{ count: number }>(
        `
          SELECT COUNT(*)::int AS count
          FROM ai_model_dispatch_policies p
          JOIN ai_model_configs c ON c.id = p.model_config_id
          WHERE c.model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
            AND p.submit_queue_name = 'generation-submit-image'
        `,
      );
      await repairedDb.close();

      assert.deepEqual(models.rows, [
        { model_code: "jimeng-5-image", media_type: "image", status: "active" },
        { model_code: "jimeng-4-5-image", media_type: "image", status: "active" },
        { model_code: "jimeng-4-0-image", media_type: "image", status: "active" },
      ]);
      assert.equal(policies.rows[0]?.count, 3);
    });
  });

  it("repairs existing PostgreSQL databases missing team collaboration tables", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("DROP TABLE IF EXISTS team_plan_limits CASCADE");
      await db.query("DROP TABLE IF EXISTS team_credit_adjustments CASCADE");
      await db.query("DROP TABLE IF EXISTS team_project_ownerships CASCADE");
      await db.query("DROP TABLE IF EXISTS team_project_assignments CASCADE");
      await db.query("DROP TABLE IF EXISTS team_member_profiles CASCADE");
      await db.query("DROP TABLE IF EXISTS team_member_groups CASCADE");
      await db.query("DROP TABLE IF EXISTS organization_entitlements CASCADE");
      await db.close();

      const repairedDb = await createDevDb();
      const tables = await repairedDb.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name IN (
              'organization_entitlements',
              'team_member_groups',
              'team_member_profiles',
              'team_project_assignments',
              'team_project_ownerships',
              'team_credit_adjustments',
              'team_plan_limits'
            )
          ORDER BY table_name
        `,
      );
      await repairedDb.close();

      assert.deepEqual(tables.rows.map((row) => row.table_name), [
        "organization_entitlements",
        "team_credit_adjustments",
        "team_member_groups",
        "team_member_profiles",
        "team_plan_limits",
        "team_project_assignments",
        "team_project_ownerships",
      ]);
    });
  });

  it("repairs existing PostgreSQL databases missing library asset tables", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("DROP TABLE IF EXISTS library_asset_versions CASCADE");
      await db.query("DROP TABLE IF EXISTS library_assets CASCADE");
      await db.close();

      const repairedDb = await createDevDb();
      const tables = await repairedDb.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name IN ('library_assets', 'library_asset_versions')
          ORDER BY table_name
        `,
      );
      await repairedDb.close();

      assert.deepEqual(tables.rows.map((row) => row.table_name), [
        "library_asset_versions",
        "library_assets",
      ]);
    });
  });

  it("repairs existing PostgreSQL databases missing script reader sections table", async () => {
    await withIsolatedDevSchema(async () => {
      const db = await createDevDb();
      await db.query("DROP TABLE IF EXISTS script_reader_sections CASCADE");
      await db.close();

      const repairedDb = await createDevDb();
      const table = await repairedDb.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = 'script_reader_sections'
          ) AS exists
        `,
      );
      await repairedDb.close();

      assert.equal(table.rows[0]?.exists, true);
    });
  });
});

async function withIsolatedDevSchema(run: () => Promise<void>) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousDatabaseSchema = process.env.DATABASE_SCHEMA;
  const connectionString = requiredPostgresConnectionString();
  const schemaName = `test_${randomUUID().replaceAll("-", "_")}`;

  process.env.DATABASE_URL = connectionString;
  process.env.DATABASE_SCHEMA = schemaName;

  try {
    await run();
  } finally {
    restoreEnv("DATABASE_URL", previousDatabaseUrl);
    restoreEnv("DATABASE_SCHEMA", previousDatabaseSchema);
    await dropSchema(connectionString, schemaName);
  }
}

async function dropSchema(connectionString: string, schemaName: string) {
  const pool = new Pool({ connectionString });
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
  } finally {
    await pool.end();
  }
}

function requiredPostgresConnectionString() {
  const connectionString = process.env.TEST_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL database tests");
  }
  return connectionString;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
