import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createDevDb } from "../dev-db.ts";

describe("createDevDb", () => {
  it("uses persistent local storage when DATABASE_URL is not configured", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

      const db = await createDevDb();
      await db.query("INSERT INTO organizations (id, name, status) VALUES ($1, $2, 'active')", [
        "10000000-0000-4000-8000-000000000999",
        "Local persistence",
      ]);
      await db.close();

      const reopenedDb = await createDevDb();
      const result = await reopenedDb.query<{ name: string }>(
        "SELECT name FROM organizations WHERE id = $1",
        ["10000000-0000-4000-8000-000000000999"],
      );
      await reopenedDb.close();

      assert.equal(result.rows[0]?.name, "Local persistence");
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
    }
  });

  it("creates the default local database parent directory when it is missing", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localRoot = await mkdtemp(join(tmpdir(), "comic-ai-local-db-root-"));
    const localDatabaseDir = join(localRoot, "missing-parent", "dev-db");

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

      const db = await createDevDb();
      const result = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'users'
          ) AS exists
        `,
      );
      await db.close();

      assert.equal(result.rows[0]?.exists, true);
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
      await rm(localRoot, { recursive: true, force: true });
    }
  });

  it("falls back to local storage when DATABASE_URL is configured but unavailable", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      process.env.DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:1/comic_ai_unavailable";
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

      const db = await createDevDb();
      const result = await db.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'users'
          ) AS exists
        `,
      );
      await db.close();

      assert.equal(result.rows[0]?.exists, true);
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
    }
  });

  it("repairs existing local payment provider constraints to include PayLab", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

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
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
      await rm(localDatabaseDir, { recursive: true, force: true });
    }
  });

  it("repairs existing local databases missing model configuration tables", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

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
            WHERE table_schema = 'public'
              AND table_name = 'ai_generation_task_snapshots'
          ) AS exists
        `,
      );
      await repairedDb.close();

      assert.deepEqual(models.rows.map((row) => row.model_code), ["gpt-image-2-cn", "seedance-i2v-pro"]);
      assert.equal(snapshots.rows[0]?.exists, true);
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
      await rm(localDatabaseDir, { recursive: true, force: true });
    }
  });

  it("repairs existing local databases missing team collaboration tables", async () => {
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousLocalDatabaseDir = process.env.LOCAL_DATABASE_DIR;
    const localDatabaseDir = await mkdtemp(join(tmpdir(), "comic-ai-local-db-"));

    try {
      delete process.env.DATABASE_URL;
      process.env.LOCAL_DATABASE_DIR = localDatabaseDir;

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
          WHERE table_schema = 'public'
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
    } finally {
      restoreEnv("DATABASE_URL", previousDatabaseUrl);
      restoreEnv("LOCAL_DATABASE_DIR", previousLocalDatabaseDir);
      await rm(localDatabaseDir, { recursive: true, force: true });
    }
  });

});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
