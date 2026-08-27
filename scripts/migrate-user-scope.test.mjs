import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import pg from "pg";

import { loadSqlMigrations } from "../apps/backend/src/modules/shared/db/migrations.ts";

describe("user-centric migration runner", { concurrency: false }, () => {
  it("tracks the complete application migration manifest in the same order", async () => {
    const runnerSource = await readFile(new URL("migrate-user-scope.mjs", import.meta.url), "utf8");
    const manifestSource = runnerSource.slice(
      runnerSource.indexOf("const migrations = ["),
      runnerSource.indexOf("const requiredBaselineMigrationNames"),
    );
    const runnerNames = [...manifestSource.matchAll(/^\s+\["([^"]+\.sql)",\s*"[^"]+"\],/gm)]
      .map((match) => match[1]);
    const applicationNames = (await loadSqlMigrations()).map((migration) => migration.name);

    assert.deepEqual(runnerNames, applicationNames);
    assert.ok(
      applicationNames.includes("20260826-converge-provider-protocol-constraint.sql"),
      "semantic edits to historical provider migrations require a forward convergence migration",
    );
    assert.ok(
      applicationNames.includes("20260827-converge-canvas-agent-shard-constraint.sql"),
      "schema-scoped constraint repair requires a forward convergence migration",
    );
  });

  it("fails closed before runtime-safe startup can mutate an uninitialized database", async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");
    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    const urlSchema = `test_${randomUUID().replaceAll("-", "_")}`;
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(
        "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)",
        [schema],
      );
      await client.query(`CREATE SCHEMA "${urlSchema}"`);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${urlSchema}`);
      const result = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply", "--runtime-safe"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            DATABASE_URL: isolatedUrl.toString(),
            DATABASE_SCHEMA: schema,
          },
        },
      );

      assert.equal(result.status, 1);
      assert.match(result.stderr, /runtime_schema_baseline_required/);
      assert.match(result.stdout, new RegExp(`target=[^/]+/${schema}`));
      const tables = await client.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
        [schema],
      );
      assert.equal(tables.rows[0]?.count, 0);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.query(`DROP SCHEMA "${urlSchema}" CASCADE`);
      await client.end();
    }
  });

  it("applies the GEO schema through the runtime-safe startup path", async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");
    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(
        "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)",
        [schema],
      );
      const baselineSql = await readFile(
        new URL("../packages/db/baseline/user-centric-schema.sql", import.meta.url),
        "utf8",
      );
      await client.query(baselineSql);
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_schema_migrations (
          migration_name text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        );
        TRUNCATE app_schema_migrations;
        INSERT INTO app_schema_migrations (migration_name, checksum) VALUES
          ('user-centric-schema.sql', 'baseline-test'),
          ('model-reference-seed.sql', 'seed-test');
        DROP TABLE IF EXISTS
          geo_audit_events,
          geo_content_evidence_links,
          geo_content_question_links,
          geo_content_versions,
          geo_generation_runs,
          geo_content_items,
          geo_evidence_items,
          geo_questions
        CASCADE;
      `);
      const isolatedUrl = new URL(connectionString);
      isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
      for (const migrationName of [
        "20260905-create-geo-operations.sql",
        "20260906-add-geo-generation-leases.sql",
      ]) {
        const result = spawnSync(
          process.execPath,
          ["scripts/migrate-user-scope.mjs", "--apply", "--runtime-safe", "--only", migrationName],
          {
            cwd: process.cwd(),
            encoding: "utf8",
            env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
          },
        );
        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.doesNotMatch(result.stdout, new RegExp(`runtime defer ${migrationName.replaceAll(".", "\\.")}`));
      }
      const tables = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.tables
         WHERE table_schema=$1 AND table_name IN ('geo_questions','geo_evidence_items','geo_content_items','geo_content_versions','geo_generation_runs','geo_audit_events')`,
        [schema],
      );
      const leaseColumns = await client.query(
        `SELECT count(*)::int AS count FROM information_schema.columns
         WHERE table_schema=$1 AND table_name='geo_generation_runs'
           AND column_name IN ('heartbeat_at','lease_expires_at','lease_token')`,
        [schema],
      );
      assert.equal(tables.rows[0]?.count, 6);
      assert.equal(leaseColumns.rows[0]?.count, 3);
    } finally {
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      await client.end();
    }
  });

  it("rolls back the migration ledger and baseline during an empty-schema dry run", { concurrency: false }, async () => {
    const connectionString = process.env.DATABASE_URL?.trim();
    assert.ok(connectionString, "DATABASE_URL is required");

    const schema = `test_${randomUUID().replaceAll("-", "_")}`;
    assert.match(schema, /^test_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/);
    const client = new pg.Client({ connectionString });

    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(
        "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)",
        [schema],
      );
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
      await client.query(
        "SELECT set_config('search_path', format('%I, pg_catalog', $1::text), false)",
        [schema],
      );
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
      const marketingTables = await client.query(
        `SELECT count(*)::int AS count
         FROM information_schema.tables
         WHERE table_schema = $1 AND left(table_name, 10) = 'marketing_'`,
        [schema],
      );
      assert.equal(migrations.rows[0]?.count, (await loadSqlMigrations()).length);
      assert.equal(marketingTables.rows[0]?.count, 0);
      await client.query(`DROP INDEX "${schema}".canvas_agent_conversations_shard_idx`);
      const missingRequiredRuntimeSchema = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply", "--runtime-safe"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(missingRequiredRuntimeSchema.status, 1);
      assert.match(
        missingRequiredRuntimeSchema.stderr,
        /runtime_schema_postcondition_missing:20260823-canvas-agent-queue-shards\.sql/,
      );
      await client.query(`
        CREATE INDEX canvas_agent_conversations_shard_idx
        ON "${schema}".canvas_agent_conversations (shard_id, id)
        WHERE shard_id IS NOT NULL
      `);
      await client.query(`
        ALTER TABLE "${schema}".canvas_agent_conversations
          DROP CONSTRAINT canvas_agent_conversations_shard_id_check,
          ADD CONSTRAINT canvas_agent_conversations_shard_id_check
          CHECK (shard_id IS NULL OR shard_id >= -1)
      `);
      const wrongRequiredRuntimeSchema = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply", "--runtime-safe"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(wrongRequiredRuntimeSchema.status, 1);
      assert.match(
        wrongRequiredRuntimeSchema.stderr,
        /runtime_schema_postcondition_missing:20260823-canvas-agent-queue-shards\.sql/,
      );
      const canvasAgentShardConstraintConvergenceSql = await readFile(
        new URL(
          "../packages/db/migrations/20260827-converge-canvas-agent-shard-constraint.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await client.query(canvasAgentShardConstraintConvergenceSql);
      const repairIndexMigrations = await client.query(`
        SELECT migration_name
        FROM "${schema}"."app_schema_migrations"
        WHERE migration_name IN (
          '20260731-failed-image-submission-active-repair-index.sql',
          '20260731-failed-image-submission-snapshot-repair-index.sql'
        )
        ORDER BY migration_name
      `);
      assert.deepEqual(repairIndexMigrations.rows.map((row) => row.migration_name), [
        "20260731-failed-image-submission-active-repair-index.sql",
        "20260731-failed-image-submission-snapshot-repair-index.sql",
      ]);
      assert.equal(users.rows[0]?.count, 1);
      await client.query(`
        CREATE TABLE "${schema}"."task_center_backfill_probe" (function_name text PRIMARY KEY);
        CREATE OR REPLACE FUNCTION "${schema}".backfill_provider_request_task_center_diagnostics_batch(
          after_id uuid,
          batch_size integer
        ) RETURNS TABLE(processed_count integer, next_id uuid)
        LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO "${schema}"."task_center_backfill_probe" VALUES ('provider');
          RETURN QUERY SELECT 0, NULL::uuid;
        END
        $$;
        CREATE OR REPLACE FUNCTION "${schema}".backfill_generation_snapshot_task_center_diagnostics_batch(
          after_id uuid,
          batch_size integer
        ) RETURNS TABLE(processed_count integer, next_id uuid)
        LANGUAGE plpgsql AS $$
        BEGIN
          INSERT INTO "${schema}"."task_center_backfill_probe" VALUES ('snapshot');
          RETURN QUERY SELECT 0, NULL::uuid;
        END
        $$;
        DELETE FROM "${schema}"."app_schema_migrations"
        WHERE migration_name = '20260824-task-center-provider-diagnostics.sql';
      `);
      const resumedBackfillResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply", "--runtime-safe"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(
        resumedBackfillResult.status,
        0,
        resumedBackfillResult.stderr || resumedBackfillResult.stdout,
      );
      const resumedBackfills = await client.query(
        `SELECT function_name FROM "${schema}"."task_center_backfill_probe" ORDER BY function_name`,
      );
      assert.deepEqual(resumedBackfills.rows.map((row) => row.function_name), ["provider", "snapshot"]);
      const taskCenterProviderDiagnosticsSql = await readFile(
        new URL("../packages/db/migrations/20260824-task-center-provider-diagnostics.sql", import.meta.url),
        "utf8",
      );
      await client.query(taskCenterProviderDiagnosticsSql);
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
        "20260728-add-bananarouter-models.sql",
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
        "20260728-add-bananarouter-models.sql",
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
          WHEN '20260720-add-aliyun-bailian-audio-model.sql' THEN 'e15713b3f69203ec2688d5bc347535f26853dc8024f7cf2f436d04365fa0b67e'
          WHEN '20260720-enable-project-multi-canvases.sql' THEN '5984810d4b1fd7e6f1aecf6b5413536a28ae7e936794d36dd9581f8db8a25f17'
          WHEN '20260728-comfyui-workflow-library.sql' THEN '11823cfc09173a497118a2f1853d11af5b536b9ac993998465e44602ab139322'
          WHEN '20260728-z-remove-legacy-workflow-runtime.sql' THEN '3bdd5a635d991506f9e666f1b4f408ab8acca1e9fbb6a25d0f1c2b8198b49b9e'
          WHEN '20260728-add-bananarouter-models.sql' THEN 'c34889dfd4cae6f8cef5c179dfaddad87bb0384b9d8f5fe10a50054fb26d5a4c'
          WHEN '20260802-canvas-settings.sql' THEN '0ad891fddcf504214b574bddaa344056e1b326f832a410eca5acc5c72e0f630f'
          ELSE checksum
        END
        WHERE migration_name IN (
          'user-centric-schema.sql',
          'model-reference-seed.sql',
          '20260720-add-aliyun-bailian-audio-model.sql',
          '20260720-enable-project-multi-canvases.sql',
          '20260728-comfyui-workflow-library.sql',
          '20260728-z-remove-legacy-workflow-runtime.sql',
          '20260728-add-bananarouter-models.sql',
          '20260802-canvas-settings.sql'
        )
      `);
      await client.query(`
        ALTER TABLE "${schema}"."ai_model_configs"
          DROP CONSTRAINT ai_model_configs_provider_protocol_check,
          ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IS NOT NULL);
        DELETE FROM "${schema}"."app_schema_migrations"
        WHERE migration_name = '20260903-add-globalaiopc-model-center-and-soundclone.sql'
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
      const convergedProviderConstraint = await client.query(`
        SELECT pg_get_constraintdef(constraint_record.oid) AS definition
        FROM pg_constraint constraint_record
        WHERE constraint_record.conrelid = '"${schema}"."ai_model_configs"'::regclass
          AND constraint_record.conname = 'ai_model_configs_provider_protocol_check'
      `);
      assert.match(convergedProviderConstraint.rows[0]?.definition ?? "", /cumob_chat/);
      assert.match(convergedProviderConstraint.rows[0]?.definition ?? "", /apimart_audio/);
      assert.match(convergedProviderConstraint.rows[0]?.definition ?? "", /banana_router/);
      await client.query(`
        UPDATE "${schema}"."app_schema_migrations"
        SET checksum = CASE migration_name
          WHEN '20260720-add-aliyun-bailian-audio-model.sql' THEN 'eb9e734607ef21304fcedc7ab9a3c9cdaddb54adc6cbd03c2dfa4f23c5a82f7b'
          WHEN '20260728-comfyui-workflow-library.sql' THEN 'c2152426c20d067dd408faec0ee553040e9b034be3caf6c8dc80c1fd8e06171b'
          WHEN '20260728-z-remove-legacy-workflow-runtime.sql' THEN '7629102ae1825ee04fb31b814a14419a934076c80c880c4596192405decfda69'
          ELSE checksum
        END
        WHERE migration_name IN (
          '20260720-add-aliyun-bailian-audio-model.sql',
          '20260728-comfyui-workflow-library.sql',
          '20260728-z-remove-legacy-workflow-runtime.sql'
        )
      `);
      const cleanupCrlfCompatibilityResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(
        cleanupCrlfCompatibilityResult.status,
        0,
        cleanupCrlfCompatibilityResult.stderr || cleanupCrlfCompatibilityResult.stdout,
      );
      await client.query(`
        UPDATE "${schema}"."app_schema_migrations"
        SET checksum = '99a6a8111f77709b887d65cf71df83b9a0ad1c8f6bb7037319ae3b29ac3b433a'
        WHERE migration_name = '20260728-add-bananarouter-models.sql'
      `);
      const crlfCompatibilityResult = spawnSync(
        process.execPath,
        ["scripts/migrate-user-scope.mjs", "--apply"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        },
      );
      assert.equal(
        crlfCompatibilityResult.status,
        0,
        crlfCompatibilityResult.stderr || crlfCompatibilityResult.stdout,
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
