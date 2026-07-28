import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import pg from "pg";

describe("user-centric migration runner", { concurrency: false }, () => {
  it("rolls back the migration ledger and baseline during an empty-schema dry run", { concurrency: false }, async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");

    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    assert.match(schema, /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/);
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
      const result = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--dry-run"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const tables = await client.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
        [schema],
      );
      assert.equal(tables.rows[0]?.count, 0);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

  it("initializes an empty schema and records all migrations", { concurrency: false }, async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");

    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    assert.match(schema, /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/);
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
      const result = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );

      assert.equal(result.status, 0, result.stderr || result.stdout);
      const migrations = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."app_schema_migrations"`,
      );
      const users = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'users'`,
        [schema],
      );
      assert.equal(migrations.rows[0]?.count, 44);
      assert.equal(users.rows[0]?.count, 1);
      const characterLibraryTables = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name IN ('canvas_character_assets','canvas_character_asset_references')`,
        [schema],
      );
      assert.equal(characterLibraryTables.rows[0]?.count, 2);
      const agentAssets = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_agent_assets"`,
      );
      assert.equal(agentAssets.rows[0]?.count, 0);
      const brandKits = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_brand_kits"`,
      );
      const brandKitAssets = await client.query(
        `SELECT count(*)::int AS count FROM "${schema}"."creator_brand_kit_assets"`,
      );
      const projectBrandKitColumn = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'projects' AND column_name = 'brand_kit_id'`,
        [schema],
      );
      assert.equal(brandKits.rows[0]?.count, 0);
      assert.equal(brandKitAssets.rows[0]?.count, 0);
      assert.equal(projectBrandKitColumn.rows[0]?.count, 1);
      const generationQueueLifecycle = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'generation_queue_stage_assignments'
          AND column_name IN ('redis_job_id', 'published_at')
        ORDER BY column_name
      `, [schema]);
      assert.deepEqual(
        generationQueueLifecycle.rows.map((row) => row.column_name),
        ["published_at", "redis_job_id"],
      );
      const durableQueueTables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name IN (
            'generation_queue_admin_commands',
            'generation_queue_job_cancellations',
            'generation_queue_worker_leases'
          )
        ORDER BY table_name
      `, [schema]);
      assert.deepEqual(durableQueueTables.rows.map((row) => row.table_name), [
        "generation_queue_admin_commands",
        "generation_queue_job_cancellations",
        "generation_queue_worker_leases",
      ]);
      const lifecycleLedger = await client.query(`
        SELECT migration_name
        FROM "${schema}"."app_schema_migrations"
        WHERE migration_name = ANY($1::text[])
        ORDER BY migration_name
      `, [[
        "20260722-generation-queue-elastic-shards.sql",
        "20260723-correct-generation-queue-lifecycle.sql",
        "20260724-durable-generation-queue-assignment-lifecycle.sql",
        "20260725-create-canvas-agent-runtime.sql",
        "20260725-generation-queue-worker-leases.sql",
        "20260725-z-generation-queue-admin-commands.sql",
        "20260726-generation-queue-job-cancellations.sql",
        "20260727-generation-queue-publish-cancellation-fencing.sql",
        "20260727-generation-queue-worker-lease-db-clock.sql",
        "20260728-canvas-actor-principals.sql",
        "20260728-comfyui-workflow-library.sql",
        "20260728-z-remove-legacy-workflow-runtime.sql",
      ]]);
      assert.deepEqual(lifecycleLedger.rows.map((row) => row.migration_name), [
        "20260722-generation-queue-elastic-shards.sql",
        "20260723-correct-generation-queue-lifecycle.sql",
        "20260724-durable-generation-queue-assignment-lifecycle.sql",
        "20260725-create-canvas-agent-runtime.sql",
        "20260725-generation-queue-worker-leases.sql",
        "20260725-z-generation-queue-admin-commands.sql",
        "20260726-generation-queue-job-cancellations.sql",
        "20260727-generation-queue-publish-cancellation-fencing.sql",
        "20260727-generation-queue-worker-lease-db-clock.sql",
        "20260728-canvas-actor-principals.sql",
        "20260728-comfyui-workflow-library.sql",
        "20260728-z-remove-legacy-workflow-runtime.sql",
      ]);
      const audioModel = await client.query(
        `SELECT media_type, provider_protocol, invocation_mode, provider_model, status FROM "${schema}"."ai_model_configs" WHERE model_code = 'cosyvoice-v2'`,
      );
      assert.deepEqual(audioModel.rows[0], {
        media_type: "audio",
        provider_protocol: "aliyun_bailian_audio",
        invocation_mode: "sync",
        provider_model: "cosyvoice-v2",
        status: "active",
      });
      const audioPolicy = await client.query(
        `SELECT poll_queue_name, polling_backoff_json, retry_policy_json FROM "${schema}"."ai_model_dispatch_policies" WHERE model_config_id = '70000000-0000-4000-8000-00000000a001'`,
      );
      assert.deepEqual(audioPolicy.rows[0], {
        poll_queue_name: null,
        polling_backoff_json: {},
        retry_policy_json: { submitAttempts: 3, finalizeAttempts: 3 },
      });

      await client.query(`
        UPDATE "${schema}"."app_schema_migrations"
        SET checksum = CASE migration_name
          WHEN 'user-centric-schema.sql' THEN 'd8b1d9a272896aaa46c3473ebf8161973dfa589c1eb78af687a5b7bbe1cb3a9f'
          WHEN 'model-reference-seed.sql' THEN '3d584b47e1bb425356d77c85076aedf7060cc2e66bd473110b4ae8cf0be975b3'
          WHEN '20260720-enable-project-multi-canvases.sql' THEN '5984810d4b1fd7e6f1aecf6b5413536a28ae7e936794d36dd9581f8db8a25f17'
          ELSE checksum
        END
        WHERE migration_name IN (
          'user-centric-schema.sql',
          'model-reference-seed.sql',
          '20260720-enable-project-multi-canvases.sql'
        )
      `);
      const compatibilityResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(
        compatibilityResult.status,
        0,
        compatibilityResult.stderr || compatibilityResult.stdout,
      );

      await client.query(`
        DELETE FROM "${schema}"."app_schema_migrations"
        WHERE migration_name IN (
          '20260718-create-director-desks.sql',
          '20260718-create-team-member-director-desks.sql'
        )
      `);
      await client.query(`DROP TABLE "${schema}"."team_member_director_desks"`);
      await client.query(`DROP TABLE "${schema}"."director_desks"`);
      const incrementalResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(incrementalResult.status, 0, incrementalResult.stderr || incrementalResult.stdout);
      const directorDesks = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'director_desks'`,
        [schema],
      );
      assert.equal(directorDesks.rows[0]?.count, 1);
      const teamMemberDirectorDesks = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'team_member_director_desks'`,
        [schema],
      );
      assert.equal(teamMemberDirectorDesks.rows[0]?.count, 1);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

});
