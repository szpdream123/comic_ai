import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { ensureFoundationSchema } from "./dev-db.ts";
import { createEmptyTestDb } from "./test-db.ts";

test("ensureFoundationSchema applies admin management migration to existing foundation databases", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0010_admin_management_platform.sql", db);

  await ensureFoundationSchema(db);

  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('admin_accounts', 'admin_auth_sessions', 'runtime_config_entries')
    ORDER BY table_name
  `);

  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ["admin_accounts", "admin_auth_sessions", "runtime_config_entries"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs legacy admin account tables missing lock columns", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0010_admin_management_platform.sql", db);
  await db.query(`
    CREATE TABLE admin_accounts (
      id uuid PRIMARY KEY,
      login_name text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      status text NOT NULL DEFAULT 'active'
    );
  `);

  await ensureFoundationSchema(db);

  const columns = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'admin_accounts'
      AND column_name IN ('failed_login_count', 'locked_until')
    ORDER BY column_name
  `);

  assert.deepEqual(
    columns.rows.map((row) => row.column_name),
    ["failed_login_count", "locked_until"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs legacy foundation databases missing team member tables", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0010_admin_management_platform.sql", db);
  await db.query(`
    DROP TABLE IF EXISTS team_plan_limits CASCADE;
    DROP TABLE IF EXISTS team_credit_adjustments CASCADE;
    DROP TABLE IF EXISTS team_project_ownerships CASCADE;
    DROP TABLE IF EXISTS team_project_assignments CASCADE;
    DROP TABLE IF EXISTS team_member_profiles CASCADE;
    DROP TABLE IF EXISTS team_member_groups CASCADE;
    DROP TABLE IF EXISTS organization_entitlements CASCADE;
  `);

  await ensureFoundationSchema(db);

  const tables = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('team_member_groups', 'team_member_profiles')
    ORDER BY table_name
  `);

  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ["team_member_groups", "team_member_profiles"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs legacy storyboard prompt schema cleanup", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0017_remove_deprecated_prompt_categories.sql", db);
  await db.query(`
    ALTER TABLE storyboard_prompt_packages
      DROP CONSTRAINT IF EXISTS storyboard_prompt_packages_package_type_check,
      ADD CONSTRAINT storyboard_prompt_packages_package_type_check
        CHECK (package_type IN ('genre', 'emotion', 'camera', 'output', 'taboo'));

    INSERT INTO storyboard_prompt_packages (
      id, name, code, package_type, prompt_content, status
    )
    VALUES
      ('10000000-0000-4000-8000-000000000001', 'Camera', 'legacy_camera', 'camera', 'legacy camera prompt', 'enabled'),
      ('10000000-0000-4000-8000-000000000002', 'Output', 'legacy_output', 'output', 'legacy output prompt', 'enabled');

    ALTER TABLE storyboard_prompt_templates
      ALTER COLUMN output_package_id SET NOT NULL;
  `);

  await ensureFoundationSchema(db);

  const outputColumn = await db.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'storyboard_prompt_templates'
      AND column_name = 'output_package_id'
  `);
  const deprecatedPackages = await db.query(`
    SELECT COUNT(*)::int AS count
    FROM storyboard_prompt_packages
    WHERE package_type IN ('camera', 'output')
      AND deleted_at IS NULL
  `);

  assert.equal(outputColumn.rows[0]?.is_nullable, "YES");
  assert.equal(deprecatedPackages.rows[0]?.count, 0);

  await db.close();
});

test("ensureFoundationSchema repairs legacy storyboard prompt packages missing cover image column", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0013_prompt_cover_images.sql", db);

  await ensureFoundationSchema(db);

  const columns = await db.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'storyboard_prompt_packages'
      AND column_name = 'cover_image_url'
  `);

  assert.deepEqual(
    columns.rows.map((row) => row.column_name),
    ["cover_image_url"],
  );

  await db.close();
});

test("ensureFoundationSchema repairs episode generation draft mode uniqueness on existing databases", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0019_episode_generation_draft_modes.sql", db);

  await db.query(`
    ALTER TABLE episode_generation_drafts
      DROP CONSTRAINT IF EXISTS episode_generation_drafts_mode_unique;
    ALTER TABLE episode_generation_drafts
      DROP CONSTRAINT IF EXISTS episode_generation_drafts_organization_id_episode_id_target_type_target_id_key;
    ALTER TABLE episode_generation_drafts
      ADD CONSTRAINT episode_generation_drafts_organization_id_episode_id_target_type_target_id_key
      UNIQUE (organization_id, episode_id, target_type, target_id);
  `);

  await ensureFoundationSchema(db);

  const constraints = await db.query(`
    SELECT
      con.conname AS constraint_name,
      (
        SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
      ) AS column_names
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = current_schema()
      AND rel.relname = 'episode_generation_drafts'
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname::text ORDER BY keys.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
      ) IN (
        ARRAY['organization_id', 'episode_id', 'target_type', 'target_id']::text[],
        ARRAY['organization_id', 'episode_id', 'target_type', 'target_id', 'mode']::text[]
      )
    ORDER BY con.conname
  `);

  assert.deepEqual(
    constraints.rows.map((row) => row.column_names),
    [["organization_id", "episode_id", "target_type", "target_id", "mode"]],
  );

  await db.close();
});

test("ensureFoundationSchema repairs and enables Seedance model configs on existing databases", async () => {
  const db = await createEmptyTestDb();

  await applyMigrationsBefore("0020_seedance_video_model_configs.sql", db);
  await db.query(`
    UPDATE ai_model_configs
    SET status = 'disabled',
        provider_model = 'legacy-seedance-2-0'
    WHERE model_code = 'seedance-i2v-pro';
  `);

  await ensureFoundationSchema(db);

  const seedanceModels = await db.query(`
    SELECT model_code, provider_model, status
    FROM ai_model_configs
    WHERE model_code IN (
      'Doubao-Seedance-2.0-fast',
      'Doubao-Seedance-2.0',
      'doubao-seedance-1-0-pro-250528'
    )
    ORDER BY lower(model_code), model_code
  `);

  assert.deepEqual(seedanceModels.rows, [
    {
      model_code: "doubao-seedance-1-0-pro-250528",
      provider_model: "doubao-seedance-1-0-pro-250528",
      status: "active",
    },
    {
      model_code: "Doubao-Seedance-2.0",
      provider_model: "doubao-seedance-2-0-260128",
      status: "active",
    },
    {
      model_code: "Doubao-Seedance-2.0-fast",
      provider_model: "doubao-seedance-2-0-fast-260128",
      status: "active",
    },
  ]);

  await db.close();
});

async function applyMigrationsBefore(stopName, db) {
  const migrationDir = resolve(process.cwd(), "packages", "db", "migrations");
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql") && file.localeCompare(stopName) < 0)
    .sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    await db.query(await readFile(join(migrationDir, file), "utf8"));
  }
}
