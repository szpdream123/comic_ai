import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { applySqlMigration, loadSqlMigrations } from "../migrations.ts";
import { createEmptyTestDb, createMigratedTestDb } from "../test-db.ts";

describe("20260722 generation migrations", { concurrency: false }, () => {
  it("registers the BananaRouter model migration", async () => {
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(names.includes("20260728-add-bananarouter-models.sql"));
    assert.ok(names.includes("20260825-bananarouter-image-async-recovery.sql"));
    assert.ok(names.includes("20260828-bananarouter-image-async-config-convergence.sql"));
    assert.ok(names.includes("20260904-create-skill-favorites.sql"));
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    assert.match(productionMigrationScript, /20260825-bananarouter-image-async-recovery\.sql/);
    assert.match(productionMigrationScript, /20260828-bananarouter-image-async-config-convergence\.sql/);
    assert.match(
      productionMigrationScript,
      /\["20260904-create-skill-favorites\.sql", "packages\/db\/migrations\/20260904-create-skill-favorites\.sql"\]/,
    );
    assert.match(
      productionMigrationScript,
      /const runtimeSafeMigrationNames = new Set\(\[[\s\S]*"20260904-create-skill-favorites\.sql"[\s\S]*\]\);/,
    );
  });

  it("preserves administrator SanBao image pricing while filling missing resolution defaults", async () => {
    const db = await createMigratedTestDb();
    try {
      const defaults = await db.query<{ pricing_json: Record<string, unknown> }>(`
        SELECT pricing_json
        FROM ai_model_configs
        WHERE model_code = 'sanbao-gpt-image2'
      `);
      assert.deepEqual(defaults.rows[0]?.pricing_json, {
        unit: "image",
        billingMode: "fixed",
        baseCredits: 90,
        resolutionCredits: { "普通": 90, "1K": 110, "2K": 130, "4K": 130 },
      });

      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{
          "unit":"image",
          "billingMode":"duration",
          "baseCredits":135,
          "resolutionCredits":{"普通":95,"4K":260},
          "administratorNote":"keep"
        }'::jsonb
        WHERE model_code = 'sanbao-gpt-image2'
      `);

      await applySqlMigration(
        db,
        process.cwd(),
        "20260902-merge-san-bao-gpt-image2-variants.sql",
        "20260903-add-globalaiopc-model-center-and-soundclone.sql",
        "20260904-create-provider-material-assets.sql",
      );

      const result = await db.query<{ pricing_json: Record<string, unknown> }>(`
        SELECT pricing_json
        FROM ai_model_configs
        WHERE model_code = 'sanbao-gpt-image2'
      `);
      assert.deepEqual(result.rows[0]?.pricing_json, {
        unit: "image",
        billingMode: "duration",
        baseCredits: 135,
        resolutionCredits: { "普通": 95, "1K": 110, "2K": 130, "4K": 260 },
        administratorNote: "keep",
      });
    } finally {
      await db.close();
    }
  });

  it("converges an existing mixed BananaRouter image config without a synchronous rollback", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO ai_model_configs (
          id, model_code, display_name, provider_name, provider_model, provider_protocol,
          invocation_mode, media_type, task_modes_json, capabilities_json,
          parameter_schema_json, default_params_json, provider_config_json, pricing_json,
          limits_json, ui_config_json, status, sort_order, remark
        )
        SELECT
          gen_random_uuid(), 'bananarouter-custom-image', 'BananaRouter Custom Image',
          provider_name, 'custom-image-model', provider_protocol,
          'sync', media_type, task_modes_json, capabilities_json - 'asyncPolling',
          parameter_schema_json, default_params_json,
          provider_config_json || '{
            "baseURL":"https://legacy.example.com",
            "requestPath":"/v1/images/generations",
            "endpoint":"/v1/images/generations",
            "createTaskEndpoint":"/v1/images/generations",
            "editEndpoint":"/v1/images/edits",
            "resultFormat":"b64_json",
            "apiKeyEnv":"CUSTOM_BANANA_KEY",
            "timeoutMs":4242,
            "vendorExtension":{"mode":"keep"}
          }'::jsonb,
          pricing_json, limits_json, ui_config_json, status, sort_order + 1,
          'migration coverage for copied BananaRouter image models'
        FROM ai_model_configs
        WHERE model_code = 'bananarouter-gpt-image-2';

        UPDATE ai_model_configs
        SET provider_config_json = provider_config_json || '{
          "migrationSentinel":"banana-video",
          "timeoutMs":8765
        }'::jsonb
        WHERE model_code = 'bananarouter-sora2';

        INSERT INTO ai_model_configs (
          id, model_code, display_name, provider_name, provider_model, provider_protocol,
          invocation_mode, media_type, task_modes_json, capabilities_json,
          parameter_schema_json, default_params_json, provider_config_json, pricing_json,
          limits_json, ui_config_json, status, sort_order, remark
        )
        SELECT
          gen_random_uuid(), 'other-provider-image', 'Other Provider Image',
          'OtherProvider', provider_model, 'openai_images',
          'sync', media_type, task_modes_json, capabilities_json,
          parameter_schema_json, default_params_json,
          '{"migrationSentinel":"other-provider","timeoutMs":9876}'::jsonb,
          pricing_json, limits_json, ui_config_json, status, sort_order + 2,
          'migration boundary coverage for another image provider'
        FROM ai_model_configs
        WHERE model_code = 'bananarouter-gpt-image-2';

        UPDATE ai_model_configs
        SET invocation_mode = 'sync',
            capabilities_json = capabilities_json - 'asyncPolling',
            provider_config_json = provider_config_json || '{
              "requestPath":"/v1/images/generations/async",
              "endpoint":"/v1/images/generations/async",
              "createTaskEndpoint":"/v1/images/generations/async",
              "editEndpoint":"/v1/images/generations/async",
              "queryTaskEndpoint":"/v1/async-tasks/{taskId}",
              "resultFormat":"url"
            }'::jsonb
        WHERE model_code = 'bananarouter-gpt-image-2';

        DELETE FROM ai_model_config_revisions
        WHERE model_config_id = (
          SELECT id FROM ai_model_configs WHERE model_code = 'bananarouter-gpt-image-2'
        )
          AND reason = 'BananaRouter 图片异步配置收敛前同步回滚快照';

        DELETE FROM ai_model_dispatch_policies
        WHERE model_config_id = (
          SELECT id FROM ai_model_configs WHERE model_code = 'bananarouter-gpt-image-2'
        );
      `);

      await applySqlMigration(db, process.cwd(), "20260828-bananarouter-image-async-config-convergence.sql");
      await applySqlMigration(db, process.cwd(), "20260828-bananarouter-image-async-config-convergence.sql");

      const model = await db.query<{
        invocation_mode: string;
        capabilities_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
        poll_queue_name: string | null;
      }>(`
        SELECT
          model.invocation_mode,
          model.capabilities_json,
          model.provider_config_json,
          policy.poll_queue_name
        FROM ai_model_configs model
        LEFT JOIN ai_model_dispatch_policies policy ON policy.model_config_id = model.id
        WHERE model.model_code = 'bananarouter-gpt-image-2'
      `);
      const revisions = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM ai_model_config_revisions
        WHERE model_config_id = (
          SELECT id FROM ai_model_configs WHERE model_code = 'bananarouter-gpt-image-2'
        )
          AND reason = 'BananaRouter 图片异步配置收敛前同步回滚快照'
      `);
      const copiedModel = await db.query<{
        invocation_mode: string;
        capabilities_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
        poll_queue_name: string | null;
      }>(`
        SELECT
          model.invocation_mode,
          model.capabilities_json,
          model.provider_config_json,
          policy.poll_queue_name
        FROM ai_model_configs model
        LEFT JOIN ai_model_dispatch_policies policy ON policy.model_config_id = model.id
        WHERE model.model_code = 'bananarouter-custom-image'
      `);
      const unaffectedModels = await db.query<{
        model_code: string;
        invocation_mode: string;
        provider_config_json: Record<string, unknown>;
      }>(`
        SELECT model_code, invocation_mode, provider_config_json
        FROM ai_model_configs
        WHERE model_code IN ('bananarouter-sora2', 'other-provider-image')
        ORDER BY model_code
      `);

      assert.equal(model.rows[0]?.invocation_mode, "async_polling");
      assert.equal(model.rows[0]?.capabilities_json.asyncPolling, true);
      assert.equal(model.rows[0]?.provider_config_json.requestPath, "/v1/images/generations/async");
      assert.equal(model.rows[0]?.provider_config_json.editEndpoint, "/v1/images/edits/async");
      assert.equal(model.rows[0]?.provider_config_json.queryTaskEndpoint, "/v1/async-tasks/{taskId}");
      assert.equal(model.rows[0]?.provider_config_json.resultFormat, "url");
      assert.equal(model.rows[0]?.poll_queue_name, "generation-poll-image");
      assert.equal(revisions.rows[0]?.count, 0);
      assert.equal(copiedModel.rows[0]?.invocation_mode, "async_polling");
      assert.equal(copiedModel.rows[0]?.capabilities_json.asyncPolling, true);
      assert.equal(copiedModel.rows[0]?.provider_config_json.baseURL, "https://api.bananarouter.com");
      assert.equal(copiedModel.rows[0]?.provider_config_json.requestPath, "/v1/images/generations/async");
      assert.equal(copiedModel.rows[0]?.provider_config_json.editEndpoint, "/v1/images/edits/async");
      assert.equal(copiedModel.rows[0]?.provider_config_json.queryTaskEndpoint, "/v1/async-tasks/{taskId}");
      assert.equal(copiedModel.rows[0]?.provider_config_json.requestFormat, "banana_router_openai_images");
      assert.equal(copiedModel.rows[0]?.provider_config_json.resultFormat, "url");
      assert.equal(copiedModel.rows[0]?.provider_config_json.apiKeyEnv, "CUSTOM_BANANA_KEY");
      assert.equal(copiedModel.rows[0]?.provider_config_json.timeoutMs, 4242);
      assert.deepEqual(copiedModel.rows[0]?.provider_config_json.vendorExtension, { mode: "keep" });
      assert.equal(copiedModel.rows[0]?.poll_queue_name, "generation-poll-image");
      const bananaVideo = unaffectedModels.rows.find((row) => row.model_code === "bananarouter-sora2");
      const otherProviderImage = unaffectedModels.rows.find((row) => row.model_code === "other-provider-image");
      assert.equal(bananaVideo?.provider_config_json.migrationSentinel, "banana-video");
      assert.equal(bananaVideo?.provider_config_json.timeoutMs, 8765);
      assert.equal(otherProviderImage?.invocation_mode, "sync");
      assert.equal(otherProviderImage?.provider_config_json.migrationSentinel, "other-provider");
      assert.equal(otherProviderImage?.provider_config_json.timeoutMs, 9876);
    } finally {
      await db.close();
    }
  });

  it("registers bounded task-center diagnostics in application and production migrations", async () => {
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    for (const migrationName of [
      "20260824-task-center-provider-diagnostics.sql",
      "20260824-z-task-center-provider-diagnostics-index.sql",
    ]) {
      assert.ok(names.includes(migrationName));
      assert.match(productionMigrationScript, new RegExp(migrationName.replaceAll(".", "\\.")));
    }
    assert.match(productionMigrationScript, /backfill_provider_request_task_center_diagnostics_batch/);
    assert.match(productionMigrationScript, /backfill_generation_snapshot_task_center_diagnostics_batch/);
    assert.match(productionMigrationScript, /cursor = batch\.rows\[0\]\?\.next_id/);
  });

  it("registers generation queue worker readiness in application and production runtime migrations", async () => {
    const migrationName = "20260827-generation-queue-worker-readiness.sql";
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );

    assert.ok(names.includes(migrationName));
    assert.match(
      productionMigrationScript,
      /\["20260827-generation-queue-worker-readiness\.sql", "packages\/db\/migrations\/20260827-generation-queue-worker-readiness\.sql"\]/,
    );
    assert.match(
      productionMigrationScript,
      /runtimeSafeMigrationNames = new Set\(\[[\s\S]*"20260827-generation-queue-worker-readiness\.sql"/,
    );
  });

  it("registers failed image submission repair indexes in application and production migrations", async () => {
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    for (const name of [
      "20260731-failed-image-submission-active-repair-index.sql",
      "20260731-failed-image-submission-snapshot-repair-index.sql",
    ]) {
      assert.ok(names.includes(name));
      assert.match(productionMigrationScript, new RegExp(name.replaceAll(".", "\\.")));
    }
    assert.match(productionMigrationScript, /nonTransactionalMigrationNames/);
  });

  it("applies failed image submission repair indexes idempotently", async () => {
    const db = await createEmptyTestDb();
    try {
      await db.query(`
        CREATE TABLE tasks (
          id uuid PRIMARY KEY,
          task_type text NOT NULL,
          status text NOT NULL,
          input_snapshot_json jsonb NOT NULL,
          updated_at timestamptz NOT NULL
        );
        CREATE TABLE ai_generation_task_snapshots (
          task_id uuid NOT NULL,
          status text NOT NULL,
          updated_at timestamptz NOT NULL
        );
      `);
      for (const name of [
        "20260731-failed-image-submission-active-repair-index.sql",
        "20260731-failed-image-submission-snapshot-repair-index.sql",
      ]) {
        await applySqlMigration(db, process.cwd(), name);
        await applySqlMigration(db, process.cwd(), name);
      }
      const indexes = await db.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])
        ORDER BY indexname
      `, [[
        "generation_snapshots_failed_image_submission_repair_idx",
        "tasks_failed_image_submission_active_repair_idx",
      ]]);
      assert.deepEqual(indexes.rows.map((row) => row.indexname), [
        "generation_snapshots_failed_image_submission_repair_idx",
        "tasks_failed_image_submission_active_repair_idx",
      ]);
    } finally {
      await db.close();
    }
  });

  it("seeds the four disabled BananaRouter models with dedicated adapter contracts", async () => {
    const db = await createMigratedTestDb();
    try {
      await applySqlMigration(db, process.cwd(), "20260728-add-bananarouter-models.sql");
      await applySqlMigration(db, process.cwd(), "20260728-add-bananarouter-models.sql");
      await applySqlMigration(db, process.cwd(), "20260825-bananarouter-image-async-recovery.sql");
      const models = await db.query<{
        model_code: string;
        provider_model: string;
        provider_protocol: string;
        invocation_mode: string;
        media_type: string;
        status: string;
        request_format: string;
        api_key_env: string;
        base_credits: number;
      }>(`
        SELECT
          model_code,
          provider_model,
          provider_protocol,
          invocation_mode,
          media_type,
          status,
          provider_config_json->>'requestFormat' AS request_format,
          provider_config_json->>'apiKeyEnv' AS api_key_env,
          (pricing_json->>'baseCredits')::integer AS base_credits
        FROM ai_model_configs
        WHERE model_code = ANY($1::text[])
        ORDER BY sort_order
      `, [["bananarouter-gpt-image-2", "bananarouter-sora2", "bananarouter-seedance-2.0", "bananarouter-seedance-2.0-sp"]]);

      assert.deepEqual(models.rows, [
        {
          model_code: "bananarouter-gpt-image-2",
          provider_model: "gpt-image-2",
          provider_protocol: "banana_router",
          invocation_mode: "async_polling",
          media_type: "image",
          status: "disabled",
          request_format: "banana_router_openai_images",
          api_key_env: "BananaRouter_API_KEY",
          base_credits: 0,
        },
        {
          model_code: "bananarouter-sora2",
          provider_model: "sora-2",
          provider_protocol: "banana_router",
          invocation_mode: "async_polling",
          media_type: "video",
          status: "disabled",
          request_format: "banana_router_sora_video",
          api_key_env: "BananaRouter_API_KEY",
          base_credits: 0,
        },
        {
          model_code: "bananarouter-seedance-2.0",
          provider_model: "doubao-seedance-2.0",
          provider_protocol: "banana_router",
          invocation_mode: "async_polling",
          media_type: "video",
          status: "disabled",
          request_format: "banana_router_seedance_video",
          api_key_env: "BananaRouter_API_KEY",
          base_credits: 0,
        },
        {
          model_code: "bananarouter-seedance-2.0-sp",
          provider_model: "seedance-2.0",
          provider_protocol: "banana_router",
          invocation_mode: "async_polling",
          media_type: "video",
          status: "disabled",
          request_format: "banana_router_seedance_video",
          api_key_env: "BananaRouter_API_KEY",
          base_credits: 0,
        },
      ]);

      const imageAsyncContract = await db.query<{
        create_task_endpoint: string;
        edit_endpoint: string;
        query_task_endpoint: string;
        result_format: string;
        async_polling: boolean;
      }>(`
        SELECT
          provider_config_json->>'createTaskEndpoint' AS create_task_endpoint,
          provider_config_json->>'editEndpoint' AS edit_endpoint,
          provider_config_json->>'queryTaskEndpoint' AS query_task_endpoint,
          provider_config_json->>'resultFormat' AS result_format,
          (capabilities_json->>'asyncPolling')::boolean AS async_polling
        FROM ai_model_configs
        WHERE model_code = 'bananarouter-gpt-image-2'
      `);
      assert.deepEqual(imageAsyncContract.rows, [{
        create_task_endpoint: "/v1/images/generations/async",
        edit_endpoint: "/v1/images/generations/async",
        query_task_endpoint: "/v1/async-tasks/{taskId}",
        result_format: "url",
        async_polling: true,
      }]);

      const policies = await db.query<{
        model_code: string;
        submit_queue_name: string;
        poll_queue_name: string | null;
      }>(`
        SELECT model.model_code, policy.submit_queue_name, policy.poll_queue_name
        FROM ai_model_dispatch_policies policy
        JOIN ai_model_configs model ON model.id = policy.model_config_id
        WHERE model.model_code = ANY($1::text[])
        ORDER BY model.sort_order
      `, [["bananarouter-gpt-image-2", "bananarouter-sora2", "bananarouter-seedance-2.0", "bananarouter-seedance-2.0-sp"]]);
      assert.deepEqual(policies.rows, [
        { model_code: "bananarouter-gpt-image-2", submit_queue_name: "generation-submit-image", poll_queue_name: "generation-poll-image" },
        { model_code: "bananarouter-sora2", submit_queue_name: "generation-submit-video", poll_queue_name: "generation-poll-video" },
        { model_code: "bananarouter-seedance-2.0", submit_queue_name: "generation-submit-video", poll_queue_name: "generation-poll-video" },
        { model_code: "bananarouter-seedance-2.0-sp", submit_queue_name: "generation-submit-video", poll_queue_name: "generation-poll-video" },
      ]);
      const schemas = await db.query<{ model_code: string; parameter_schema_json: Record<string, unknown> }>(`
        SELECT model_code, parameter_schema_json
        FROM ai_model_configs
        WHERE model_code IN ('bananarouter-sora2', 'bananarouter-seedance-2.0-sp')
        ORDER BY model_code
      `);
      assert.deepEqual(schemas.rows, [
        {
          model_code: "bananarouter-seedance-2.0-sp",
          parameter_schema_json: {
            durationSec: { options: [4], type: "enum" },
            ratio: { options: ["9:16"], type: "enum" },
            resolution: { options: ["720p"], type: "enum" },
          },
        },
        {
          model_code: "bananarouter-sora2",
          parameter_schema_json: {
            durationSec: { options: [4, 8, 12], type: "enum" },
            size: { options: ["1280x720", "720x1280"], type: "enum" },
          },
        },
      ]);
      const allocationIndex = await db.query<{ count: number }>(`
        SELECT count(*)::int AS count
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'credit_reservation_allocations_provider_request_idx'
      `);
      assert.equal(allocationIndex.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("registers every migration in lexical order", async () => {
    const migrationDirectory = join(process.cwd(), "packages", "db", "migrations");
    const files = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("20260722-") && name.endsWith(".sql"))
      .sort();
    const registered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260722-"));

    assert.deepEqual(registered, files);
    const lifecycleMigrations = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260723-") || name.startsWith("20260724-"));
    assert.deepEqual(lifecycleMigrations, [
      "20260723-correct-generation-queue-lifecycle.sql",
      "20260724-durable-generation-queue-assignment-lifecycle.sql",
    ]);
    const currentCanvasFiles = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("20260729-") && name.endsWith(".sql"))
      .sort();
    const currentCanvasRegistered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260729-"));
    assert.deepEqual(currentCanvasRegistered, currentCanvasFiles);
    const mediaFiles = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("20260730-") && name.endsWith(".sql"))
      .sort();
    const mediaRegistered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260730-"));
    assert.deepEqual(mediaRegistered, mediaFiles);
    const canvasBillingFiles = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("20260731-") && name.endsWith(".sql"))
      .sort();
    const canvasBillingRegistered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("20260731-"));
    assert.deepEqual(canvasBillingRegistered, canvasBillingFiles);
    const promptManagementFiles = (await readdir(migrationDirectory))
      .filter((name) => name.startsWith("202608") && name.endsWith(".sql"))
      .sort();
    const promptManagementRegistered = (await loadSqlMigrations())
      .map((migration) => migration.name)
      .filter((name) => name.startsWith("202608"));
    assert.deepEqual(promptManagementRegistered, promptManagementFiles);
  });

  it("adds Canvas Agent queue and external-wait indexes", async () => {
    const db = await createEmptyTestDb();
    try {
      await db.query(`
        CREATE TABLE canvas_agent_tasks (
          id uuid PRIMARY KEY,
          status text NOT NULL,
          lease_owner text NULL,
          current_step_id uuid NULL,
          conversation_id uuid NOT NULL,
          created_at timestamptz NOT NULL,
          updated_at timestamptz NOT NULL
        )
      `);
      await applySqlMigration(db, process.cwd(), "20260822-canvas-agent-worker-indexes.sql");
      const indexes = await db.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname IN (
            'canvas_agent_tasks_queue_idx',
            'canvas_agent_tasks_waiting_external_idx'
          )
        ORDER BY indexname
      `);
      assert.deepEqual(indexes.rows.map((row) => row.indexname), [
        "canvas_agent_tasks_queue_idx",
        "canvas_agent_tasks_waiting_external_idx",
      ]);
    } finally {
      await db.close();
    }
  });

  it("adds a durable shard assignment to Canvas Agent conversations", async () => {
    const db = await createEmptyTestDb();
    try {
      await db.query(`
        CREATE TABLE canvas_agent_conversations (
          id uuid PRIMARY KEY,
          updated_at timestamptz NOT NULL
        );
        INSERT INTO canvas_agent_conversations (id, updated_at)
        VALUES ('10000000-0000-4000-8000-000000000001', now());
      `);
      await applySqlMigration(db, process.cwd(), "20260823-canvas-agent-queue-shards.sql");
      const result = await db.query<{ shard_id: number }>(
        "SELECT shard_id FROM canvas_agent_conversations",
      );
      assert.equal(Number.isInteger(Number(result.rows[0]?.shard_id)), true);
      assert.equal(Number(result.rows[0]?.shard_id) >= 0 && Number(result.rows[0]?.shard_id) < 16, true);
    } finally {
      await db.close();
    }
  });

  it("creates the stable team asset storage association without guessing historical URLs", async () => {
    const db = await createMigratedTestDb();
    try {
      const result = await db.query<{
        is_nullable: string;
        delete_action: string;
        index_is_unique: boolean;
      }>(`
        SELECT column_info.is_nullable,
               constraint_info.confdeltype AS delete_action,
               index_info.indisunique AS index_is_unique
        FROM information_schema.columns column_info
        JOIN pg_constraint constraint_info
          ON constraint_info.conrelid='team_assets'::regclass
         AND constraint_info.conname='team_assets_storage_object_id_fkey'
        JOIN pg_class index_class ON index_class.relname='team_assets_storage_object_uidx'
        JOIN pg_index index_info ON index_info.indexrelid=index_class.oid
        WHERE column_info.table_schema=current_schema()
          AND index_class.relnamespace=to_regnamespace(current_schema())
          AND column_info.table_name='team_assets'
          AND column_info.column_name='storage_object_id'
      `);
      assert.deepEqual(result.rows, [{
        is_nullable: "YES",
        delete_action: "r",
        index_is_unique: true,
      }]);
    } finally {
      await db.close();
    }
  });

  it("adds a JSON-array tag field for team assets", async () => {
    const db = await createMigratedTestDb();
    try {
      const column = await db.query<{ is_nullable: string; column_default: string | null }>(`
        SELECT is_nullable,column_default
        FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='team_assets'
          AND column_name='tags_json'
      `);
      assert.deepEqual(column.rows, [{ is_nullable: "NO", column_default: "'[]'::jsonb" }]);
      const constraint = await db.query<{ conname: string }>(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid='team_assets'::regclass
          AND conname='team_assets_tags_json_array_check'
      `);
      assert.deepEqual(constraint.rows, [{ conname: "team_assets_tags_json_array_check" }]);
    } finally {
      await db.close();
    }
  });

  it("adds a bounded virtual folder field for team assets", async () => {
    const db = await createMigratedTestDb();
    try {
      const column = await db.query<{ is_nullable: string; column_default: string | null }>(`
        SELECT is_nullable,column_default
        FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='team_assets'
          AND column_name='folder_name'
      `);
      assert.deepEqual(column.rows, [{ is_nullable: "NO", column_default: "''::text" }]);
      const constraint = await db.query<{ conname: string }>(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid='team_assets'::regclass
          AND conname='team_assets_folder_name_length_check'
      `);
      assert.deepEqual(constraint.rows, [{ conname: "team_assets_folder_name_length_check" }]);
    } finally {
      await db.close();
    }
  });

  it("reapplies the durable generation queue lifecycle migration safely", async () => {
    const db = await createMigratedTestDb();
    try {
      await applySqlMigration(
        db,
        process.cwd(),
        "20260724-durable-generation-queue-assignment-lifecycle.sql",
      );
      await applySqlMigration(
        db,
        process.cwd(),
        "20260724-durable-generation-queue-assignment-lifecycle.sql",
      );
      const functions = await db.query<{ reserve: string | null; publish: string | null }>(`
        SELECT
          to_regprocedure(
            'reserve_generation_queue_stage_for_publish(text,uuid,text,text,text,text,text,timestamp with time zone,integer,integer)'
          )::text AS reserve,
          to_regprocedure(
            'mark_generation_queue_stage_published(text,text,timestamp with time zone)'
          )::text AS publish
      `);
      assert.ok(functions.rows[0]?.reserve);
      assert.ok(functions.rows[0]?.publish);
    } finally {
      await db.close();
    }
  });

  it("keeps the Canvas Agent text candidate quarantined until a real probe passes", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO ai_model_configs (
          id,model_code,display_name,provider_name,provider_model,
          provider_protocol,invocation_mode,media_type,task_modes_json
        ) VALUES (
          'a9000000-0000-4000-8000-000000000001','deepseek-noval','DeepSeek Novel',
          'deepseek','deepseek-v4-pro','openai_compatible_chat','stream','text','["text.script"]'::jsonb
        )
      `);
      await applySqlMigration(db, process.cwd(), "20260809-z-enable-canvas-agent-text-model.sql");
      const enabled = await db.query<{
        capabilities_json: Record<string, unknown>;
      }>(`
        SELECT capabilities_json
        FROM ai_model_configs
        WHERE model_code='deepseek-noval'
      `);
      assert.equal(enabled.rows[0]?.capabilities_json.toolCalling, true);
      assert.equal(enabled.rows[0]?.capabilities_json.jsonSchema, true);
      assert.equal(Object.hasOwn(enabled.rows[0]?.capabilities_json ?? {}, "structuredJsonPrompt"), false);

      await applySqlMigration(db, process.cwd(), "20260809-zz-canvas-agent-structured-json-fallback.sql");
      const result = await db.query<{
        task_modes_json: string[];
        capabilities_json: Record<string, unknown>;
        ui_config_json: Record<string, unknown>;
        probe_status: string | null;
        failure_code: string | null;
      }>(`
        SELECT model.task_modes_json,model.capabilities_json,model.ui_config_json,
               probe.status AS probe_status,probe.failure_code
        FROM ai_model_configs model
        LEFT JOIN canvas_agent_model_compatibility_probes probe ON probe.model_config_id=model.id
        WHERE model.model_code='deepseek-noval'
      `);
      const row = result.rows[0];
      assert.ok(row?.task_modes_json.includes("text.canvas_agent"));
      assert.equal(row?.capabilities_json.stream, true);
      assert.equal(row?.capabilities_json.toolCalling, false);
      assert.equal(row?.capabilities_json.jsonSchema, false);
      assert.equal(row?.capabilities_json.structuredJsonPrompt, true);
      assert.equal(row?.ui_config_json.agentEligible, true);
      assert.equal(row?.probe_status, "failed");
      assert.equal(row?.failure_code, "canvas_agent_model_probe_required");
    } finally {
      await db.close();
    }
  });

  it("repairs Canvas Agent knowledge and external-boundary tables missing from an older runtime migration", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        DROP TABLE IF EXISTS canvas_agent_external_tool_policies;
        DROP TABLE IF EXISTS canvas_agent_provider_documents;
        DROP TABLE IF EXISTS canvas_agent_citations;
        DROP TABLE IF EXISTS canvas_agent_memories;
      `);

      await applySqlMigration(db, process.cwd(), "20260810-canvas-agent-knowledge-boundary-tables.sql");

      const relations = await db.query<{ name: string | null }>(`
        SELECT to_regclass(name)::text AS name
        FROM unnest(ARRAY[
          'canvas_agent_memories',
          'canvas_agent_citations',
          'canvas_agent_provider_documents',
          'canvas_agent_external_tool_policies'
        ]) name
      `);
      assert.equal(relations.rows.every((row) => row.name !== null), true);

      const indexes = await db.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])
      `, [[
        "canvas_agent_memories_actor_key_unique",
        "canvas_agent_memories_context_idx",
        "canvas_agent_citations_conversation_idx",
      ]]);
      assert.equal(indexes.rows.length, 3);
    } finally {
      await db.close();
    }
  });

  it("repairs the Canvas Agent step input payload column missing from an older runtime migration", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query("ALTER TABLE canvas_agent_steps DROP COLUMN input_json");
      await applySqlMigration(db, process.cwd(), "20260810-z-canvas-agent-step-input-json.sql");
      const column = await db.query<{ column_name: string; is_nullable: string }>(`
        SELECT column_name,is_nullable
        FROM information_schema.columns
        WHERE table_schema=current_schema()
          AND table_name='canvas_agent_steps'
          AND column_name='input_json'
      `);
      assert.deepEqual(column.rows, [{ column_name: "input_json", is_nullable: "NO" }]);
    } finally {
      await db.close();
    }
  });

  it("backfills only official placeholder prompt summaries", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO prompts (id, prompt_category, name, summary, prompt_content, is_official)
        VALUES
          ('98000000-0000-4000-8000-000000000001', 'script', '反转剧本', '官方发布的剧本提示词，可直接添加到私人提示词库使用。', 'prompt', true),
          ('98000000-0000-4000-8000-000000000002', 'image_style', '伦勃朗', '豆包生图风格预设', 'prompt', true),
          ('98000000-0000-4000-8000-000000000003', 'script', '人工简介', '保留这段人工简介', 'prompt', true),
          ('98000000-0000-4000-8000-000000000004', 'script', '私人提示词', '官方发布的剧本提示词，可直接添加到私人提示词库使用。', 'prompt', false)
      `);

      await applySqlMigration(db, process.cwd(), "20260806-backfill-prompt-summaries.sql");

      const result = await db.query<{ id: string; summary: string }>(`
        SELECT id, summary
        FROM prompts
        WHERE id::text LIKE '98000000-%'
        ORDER BY id
      `);
      assert.deepEqual(result.rows.map((row) => row.summary), [
        "强化开篇钩子、信息误导与层层反转，生成具有悬念和爆点的短剧剧本。",
        "将画面转换为「伦勃朗」视觉风格，统一构图、色彩、光影、材质与细节表现。",
        "保留这段人工简介",
        "官方发布的剧本提示词，可直接添加到私人提示词库使用。",
      ]);
    } finally {
      await db.close();
    }
  });

  it("normalizes only media model snapshots without changing task state", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        INSERT INTO workflows (id, workflow_type, status, input_snapshot_json, created_at, updated_at)
        VALUES (
          '99000000-0000-4000-8000-000000000001',
          'snapshot_timeout_test',
          'running',
          '{}'::jsonb,
          '2026-07-23T00:00:00.000Z',
          '2026-07-23T00:00:00.000Z'
        )
      `);
      await db.query(`
        INSERT INTO tasks (
          id, workflow_id, task_type, status, queue_name, input_snapshot_json,
          target_entity_type, target_entity_id, created_at, updated_at
        ) VALUES
        (
          '99000000-0000-4000-8000-000000000011',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_image', 'failed', 'generation-submit-image',
          '{"billing":{"reserved":7},"modelConfigSnapshot":{"config":{"mediaType":"image","providerConfig":{"endpoint":"/image","timeoutMs":80000,"requestTimeoutMs":81000,"pollIntervalMs":82000,"maxPollAttempts":3,"keep":"image"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000101',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000012',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_audio', 'succeeded', 'generation-submit-audio',
          '{"billing":{"reserved":8},"modelConfigSnapshot":{"config":{"mediaType":"audio","providerConfig":{"endpoint":"/audio","timeoutMs":120000,"pollIntervalMs":3000,"keep":"audio"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000102',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000013',
          '99000000-0000-4000-8000-000000000001',
          'episode_generate_video', 'canceled', 'generation-submit-video',
          '{"billing":{"reserved":9},"modelConfigSnapshot":{"config":{"mediaType":"video","providerConfig":{"endpoint":"/video","timeoutMs":600000,"maxPollAttempts":10,"keep":"video"}}}}'::jsonb,
          'episode', '99000000-0000-4000-8000-000000000103',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000014',
          '99000000-0000-4000-8000-000000000001',
          'unrelated_task', 'running', 'unrelated',
          '{"modelConfigSnapshot":{"config":{"mediaType":"video","providerConfig":{"timeoutMs":600000,"keep":"unrelated"}}}}'::jsonb,
          'team_asset', '99000000-0000-4000-8000-000000000104',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        ),
        (
          '99000000-0000-4000-8000-000000000015',
          '99000000-0000-4000-8000-000000000001',
          'no_model_snapshot_task', 'running', 'unrelated',
          '{"other":{"timeoutMs":600000,"keep":"no-snapshot"}}'::jsonb,
          'team_asset', '99000000-0000-4000-8000-000000000105',
          '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z'
        )
      `);

      await applySqlMigration(
        db,
        process.cwd(),
        "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql",
      );
      const rows = await db.query<{
        task_type: string;
        status: string;
        updated_at: Date | string;
        input_snapshot_json: Record<string, unknown>;
      }>(`
        SELECT task_type, status, updated_at, input_snapshot_json
        FROM tasks
        WHERE workflow_id = '99000000-0000-4000-8000-000000000001'
        ORDER BY task_type
      `);
      const byType = new Map(rows.rows.map((row) => [row.task_type, row]));
      for (const [taskType, expectedStatus, expectedTimeout, expectedKeep, expectedReserved] of [
        ["episode_generate_image", "failed", 3600000, "image", 7],
        ["episode_generate_audio", "succeeded", 3600000, "audio", 8],
        ["episode_generate_video", "canceled", 10800000, "video", 9],
        ["unrelated_task", "running", 10800000, "unrelated", undefined],
      ] as const) {
        const row = byType.get(taskType);
        const snapshot = row?.input_snapshot_json as {
          billing?: { reserved?: number };
          modelConfigSnapshot?: { config?: { providerConfig?: Record<string, unknown> } };
        };
        const providerConfig = snapshot.modelConfigSnapshot?.config?.providerConfig ?? {};
        assert.equal(row?.status, expectedStatus);
        assert.equal(new Date(row?.updated_at ?? 0).toISOString(), "2026-07-23T00:00:00.000Z");
        assert.equal(snapshot.billing?.reserved, expectedReserved);
        assert.equal(providerConfig.timeoutMs, expectedTimeout);
        assert.equal(providerConfig.keep, expectedKeep);
        assert.equal("requestTimeoutMs" in providerConfig, false);
        assert.equal("pollIntervalMs" in providerConfig, false);
        assert.equal("maxPollAttempts" in providerConfig, false);
      }
      const noSnapshot = byType.get("no_model_snapshot_task")?.input_snapshot_json as {
        other?: Record<string, unknown>;
      };
      assert.deepEqual(noSnapshot, { other: { timeoutMs: 600000, keep: "no-snapshot" } });
    } finally {
      await db.close();
    }
  });

  it("creates the required tables, columns, indexes, and constraints", async () => {
    const db = await createMigratedTestDb();
    try {
      const relations = await db.query<{ name: string | null }>(`
        SELECT to_regclass(name)::text AS name
        FROM unnest(ARRAY[
          'outbox_dispatch_fair_cursors',
          'generation_queue_admin_commands',
          'generation_queue_job_cancellations',
          'generation_queue_shards',
          'generation_queue_stage_assignments',
          'generation_queue_worker_leases',
          'generation_task_credit_reservations',
          'generation_stage_successors',
          'provider_webhook_inbox'
        ]) name
        ORDER BY name
      `);
      assert.equal(relations.rows.every((row) => row.name !== null), true);

      const columns = await db.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (table_name, column_name) IN (
            ('provider_requests', 'next_poll_at'),
            ('provider_requests', 'poll_deadline_at'),
            ('provider_requests', 'provider_config_revision_id'),
            ('provider_requests', 'credential_version_ref'),
            ('outbox_events', 'provider_route_key'),
            ('ai_generation_task_snapshots', 'provider_config_revision_id'),
            ('generation_queue_stage_assignments', 'redis_job_id'),
            ('generation_queue_stage_assignments', 'published_at'),
            ('generation_queue_job_cancellations', 'origin_assignment_status'),
            ('generation_queue_job_cancellations', 'publish_fence_until')
          )
      `);
      assert.equal(columns.rows.length, 10);

      const indexes = await db.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = ANY($1::text[])
      `, [[
        "provider_requests_due_poll_idx",
        "outbox_events_generation_route_stage_idx",
        "generation_queue_shards_accepting_idx",
        "generation_queue_stage_assignments_active_idx",
        "generation_stage_successors_orphan_idx",
        "provider_webhook_inbox_pending_idx",
        "ai_generation_task_snapshots_user_updated_task_idx",
        "tasks_failed_image_submission_active_repair_idx",
        "generation_snapshots_failed_image_submission_repair_idx",
      ]]);
      assert.equal(indexes.rows.length, 9);

      const constraints = await db.query<{ conname: string }>(`
        SELECT conname
        FROM pg_constraint
        WHERE connamespace = current_schema()::regnamespace
          AND conname = ANY($1::text[])
      `, [[
        "provider_requests_poll_sequence_check",
        "generation_queue_shards_admitted_count_check",
        "generation_queue_stage_assignments_task_id_fkey",
        "generation_stage_successors_unique_stage",
        "provider_webhook_inbox_provider_event_key",
        "scripts_owner_user_id_fkey",
      ]]);
      assert.equal(constraints.rows.length, 6);

      const cumobModels = await db.query<{
        invocation_mode: string;
        query_task_endpoint: string | null;
        async_request: boolean | null;
        timeout_ms: string | null;
      }>(`
        SELECT
          invocation_mode,
          provider_config_json->>'queryTaskEndpoint' AS query_task_endpoint,
          (provider_config_json->'defaultRequestParams'->>'async')::boolean AS async_request,
          provider_config_json->>'timeoutMs' AS timeout_ms
        FROM ai_model_configs
        WHERE model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'cumob-gpt-image-2')
      `);
      assert.ok(cumobModels.rows.length >= 2);
      assert.equal(cumobModels.rows.every((row) => row.invocation_mode === "async_polling"), true);
      assert.equal(cumobModels.rows.every((row) => row.query_task_endpoint === "/v1/status/{taskId}"), true);
      assert.equal(cumobModels.rows.every((row) => row.async_request === true), true);
      assert.equal(cumobModels.rows.every((row) => row.timeout_ms === null), true);

      const cumobPolicies = await db.query<{
        poll_queue_name: string | null;
        polling_interval_ms: number;
      }>(`
        SELECT policy.poll_queue_name, policy.polling_interval_ms
        FROM ai_model_dispatch_policies policy
        JOIN ai_model_configs model ON model.id = policy.model_config_id
        WHERE model.model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'cumob-gpt-image-2')
      `);
      assert.equal(cumobPolicies.rows.every((row) => row.poll_queue_name === "generation-poll-image"), true);
      assert.equal(cumobPolicies.rows.every((row) => Number(row.polling_interval_ms) === 30000), true);
    } finally {
      await db.close();
    }
  });

  it("registers the GlobalAiOpc Model Center and SoundClone models", async () => {
    const db = await createMigratedTestDb();
    try {
      const models = await db.query<{
        model_code: string;
        provider_model: string;
        provider_protocol: string;
        media_type: string;
        create_endpoint: string;
        query_endpoint: string;
        api_key_env: string;
        request_format: string;
        submit_queue_name: string;
        poll_queue_name: string;
      }>(`
        SELECT model.model_code, model.provider_model, model.provider_protocol, model.media_type,
               model.provider_config_json->>'createTaskEndpoint' AS create_endpoint,
               model.provider_config_json->>'queryTaskEndpoint' AS query_endpoint,
               model.provider_config_json->>'apiKeyEnv' AS api_key_env,
               model.provider_config_json->>'requestFormat' AS request_format,
               policy.submit_queue_name, policy.poll_queue_name
        FROM ai_model_configs model
        JOIN ai_model_dispatch_policies policy ON policy.model_config_id=model.id
        WHERE model.model_code IN ('seedance-2.5-c1','MiniMax-H3-768p','soundclone')
        ORDER BY model.model_code
      `);

      assert.deepEqual(models.rows, [
        {
          model_code: "MiniMax-H3-768p",
          provider_model: "MiniMax-H3-768p",
          provider_protocol: "globalaiopc_video",
          media_type: "video",
          create_endpoint: "/v2/model-center/tasks",
          query_endpoint: "/v2/model-center/tasks/{taskId}",
          api_key_env: "GLOBAL_AI_OPC_API_KEY",
          request_format: "globalaiopc_model_center_video",
          submit_queue_name: "generation-submit-video",
          poll_queue_name: "generation-poll-video",
        },
        {
          model_code: "seedance-2.5-c1",
          provider_model: "sd_2.5_special",
          provider_protocol: "globalaiopc_video",
          media_type: "video",
          create_endpoint: "/v2/model-center/tasks",
          query_endpoint: "/v2/model-center/tasks/{taskId}",
          api_key_env: "GLOBAL_AI_OPC_API_KEY",
          request_format: "globalaiopc_model_center_video",
          submit_queue_name: "generation-submit-video",
          poll_queue_name: "generation-poll-video",
        },
        {
          model_code: "soundclone",
          provider_model: "soundCloningAudio",
          provider_protocol: "globalaiopc_sound_clone",
          media_type: "audio",
          create_endpoint: "/v1/soundCloning/audios",
          query_endpoint: "/v1/result/{taskId}",
          api_key_env: "GLOBAL_AI_OPC_API_KEY",
          request_format: "globalaiopc_sound_clone_audio",
          submit_queue_name: "generation-submit-image",
          poll_queue_name: "generation-poll-audio",
        },
      ]);

      const soundCloneSchema = await db.query<{ parameter_schema_json: Record<string, { visible?: boolean }> }>(`
        SELECT parameter_schema_json
        FROM ai_model_configs
        WHERE model_code = 'soundclone'
      `);
      assert.deepEqual(
        Object.values(soundCloneSchema.rows[0]?.parameter_schema_json ?? {}).map((parameter) => parameter.visible),
        [false, false, false, false, false, false, false, false, false],
      );
    } finally {
      await db.close();
    }
  });

  it("replaces MiniMax H3 C4 with the documented 768p model contract", async () => {
    const migrationNames = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(migrationNames.includes("20261001-replace-minimax-h3-c4-with-768p.sql"));

    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET model_code = 'MiniMax-H3-c4',
            display_name = 'MiniMax H3 C4',
            provider_model = 'MiniMax-H3-c4'
        WHERE model_code = 'MiniMax-H3-768p'
      `);
      await applySqlMigration(db, process.cwd(), "20261001-replace-minimax-h3-c4-with-768p.sql");

      const models = await db.query<{
        model_code: string;
        display_name: string;
        provider_model: string;
        task_modes_json: string[];
        parameter_schema_json: Record<string, { options?: string[]; minimum?: number; maximum?: number }>;
        default_params_json: Record<string, unknown>;
        limits_json: Record<string, unknown>;
        provider_doc_url: string;
      }>(`
        SELECT model_code, display_name, provider_model, task_modes_json,
               parameter_schema_json, default_params_json, limits_json,
               ui_config_json->>'providerDocUrl' AS provider_doc_url
        FROM ai_model_configs
        WHERE model_code IN ('MiniMax-H3-c4', 'MiniMax-H3-768p')
      `);

      assert.equal(models.rows.length, 1);
      assert.deepEqual(models.rows[0], {
        model_code: "MiniMax-H3-768p",
        display_name: "MiniMax H3 768p",
        provider_model: "MiniMax-H3-768p",
        task_modes_json: [
          "video.text_to_video",
          "video.image_to_video",
          "video.reference_guided_video",
          "video.video_to_video",
        ],
        parameter_schema_json: {
          prompt: { type: "string", required: true },
          aspectRatio: { type: "enum", options: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3"] },
          resolution: { type: "enum", options: ["768p"] },
          durationSec: { type: "integer", minimum: 10, maximum: 15 },
          referenceImages: { type: "file[]", maximum: 9 },
          referenceVideos: { type: "file[]", maximum: 3 },
          referenceAudio: { type: "file[]", maximum: 3 },
        },
        default_params_json: { aspectRatio: "16:9", resolution: "768p", durationSec: 10 },
        limits_json: {
          maxReferences: 9,
          maxReferenceVideos: 3,
          maxReferenceAudios: 3,
          minDurationSec: 10,
          maxDurationSec: 15,
          supportedRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "3:2", "2:3"],
          supportedResolutions: ["768p"],
        },
        provider_doc_url: "https://docs.globalaiopc.com/api-reference/model-center/video-gen/minimax-h3-768p",
      });
    } finally {
      await db.close();
    }
  });

  it("aligns only the Seedance 2.5 real model and resolution configuration", async () => {
    const migrationNames = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(migrationNames.includes("20261001-align-seedance25-special-resolution.sql"));
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    assert.match(productionMigrationScript, /20261001-align-seedance25-special-resolution\.sql/);

    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET provider_model = 'seedance-2.5-c1',
            parameter_schema_json = jsonb_set(
              parameter_schema_json,
              '{resolution,options}',
              '["720p","480p"]'::jsonb,
              false
            ),
            default_params_json = jsonb_set(default_params_json, '{resolution}', '"480p"'::jsonb, true),
            limits_json = limits_json - 'supportedResolutions',
            provider_config_json = '{"createTaskEndpoint":"/keep/path","requestFormat":"keep_format"}'::jsonb,
            display_name = 'Keep display name'
        WHERE model_code = 'seedance-2.5-c1'
      `);

      await applySqlMigration(
        db,
        process.cwd(),
        "20261001-align-seedance25-special-resolution.sql",
      );

      const result = await db.query<{
        provider_model: string;
        resolution_options: string[];
        default_resolution: string;
        supported_resolutions: string[];
        provider_config_json: Record<string, unknown>;
        display_name: string;
      }>(`
        SELECT provider_model,
               parameter_schema_json->'resolution'->'options' AS resolution_options,
               default_params_json->>'resolution' AS default_resolution,
               limits_json->'supportedResolutions' AS supported_resolutions,
               provider_config_json,
               display_name
        FROM ai_model_configs
        WHERE model_code = 'seedance-2.5-c1'
      `);

      assert.deepEqual(result.rows, [{
        provider_model: "sd_2.5_special",
        resolution_options: ["720p", "1080p"],
        default_resolution: "720p",
        supported_resolutions: ["720p", "1080p"],
        provider_config_json: {
          createTaskEndpoint: "/keep/path",
          requestFormat: "keep_format",
        },
        display_name: "Keep display name",
      }]);
    } finally {
      await db.close();
    }
  });

  it("replaces the two GlobalAiOpc Banana models with Seedream 5 while preserving operator settings", async () => {
    const migrationName = "20261002-replace-globalaiopc-banana-with-seedream5.sql";
    const migrationNames = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(migrationNames.includes(migrationName));
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    assert.match(productionMigrationScript, /20261002-replace-globalaiopc-banana-with-seedream5\.sql/);

    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET display_name = CASE model_code
              WHEN 'global-ai-opc-nano-banana-2' THEN 'Nano Banana 2'
              ELSE 'Nano Banana Pro'
            END,
            provider_model = CASE model_code
              WHEN 'global-ai-opc-nano-banana-2' THEN 'nano-banana-2'
              ELSE 'nano-banana-pro'
            END,
            invocation_mode = 'sync',
            provider_config_json = '{"baseURL":"https://keep.example.test","createTaskEndpoint":"/v1/banana/images","queryTaskEndpoint":"/v1/result/{taskId}","apiKeyEnv":"CUSTOM_GLOBAL_KEY","requestFormat":"global_ai_opc_banana_image","operatorNote":"keep"}'::jsonb,
            pricing_json = '{"unit":"image","baseCredits":300,"operatorNote":"keep"}'::jsonb,
            status = 'disabled',
            sort_order = CASE model_code
              WHEN 'global-ai-opc-nano-banana-2' THEN 91
              ELSE 92
            END
        WHERE model_code IN ('global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro');

        UPDATE ai_model_dispatch_policies AS policy
        SET poll_queue_name = NULL,
            provider_rpm_limit = 17
        FROM ai_model_configs AS model
        WHERE policy.model_config_id = model.id
          AND model.model_code IN ('global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro')
      `);

      await applySqlMigration(db, process.cwd(), migrationName);

      const models = await db.query<{
        model_code: string;
        display_name: string;
        provider_model: string;
        invocation_mode: string;
        create_endpoint: string;
        query_endpoint: string;
        api_key_env: string;
        request_format: string;
        operator_note: string;
        base_credits: number;
        status: string;
        sort_order: number;
        resolution_options: string[];
        max_references: number;
        poll_queue_name: string;
        provider_rpm_limit: number;
      }>(`
        SELECT model.model_code,
               model.display_name,
               model.provider_model,
               model.invocation_mode,
               model.provider_config_json->>'createTaskEndpoint' AS create_endpoint,
               model.provider_config_json->>'queryTaskEndpoint' AS query_endpoint,
               model.provider_config_json->>'apiKeyEnv' AS api_key_env,
               model.provider_config_json->>'requestFormat' AS request_format,
               model.provider_config_json->>'operatorNote' AS operator_note,
               (model.pricing_json->>'baseCredits')::int AS base_credits,
               model.status,
               model.sort_order,
               model.parameter_schema_json->'resolution'->'options' AS resolution_options,
               (model.limits_json->>'maxReferences')::int AS max_references,
               policy.poll_queue_name,
               policy.provider_rpm_limit
        FROM ai_model_configs AS model
        JOIN ai_model_dispatch_policies AS policy ON policy.model_config_id = model.id
        WHERE model.model_code IN ('global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro')
        ORDER BY model.model_code
      `);

      assert.deepEqual(models.rows, [
        {
          model_code: "global-ai-opc-nano-banana-2",
          display_name: "Seedream 5.0（GlobalAiOpc）",
          provider_model: "seedream-5.0",
          invocation_mode: "async_polling",
          create_endpoint: "/v2/model-center/tasks",
          query_endpoint: "/v2/model-center/tasks/{taskId}",
          api_key_env: "GLOBAL_AI_OPC_API_KEY",
          request_format: "global_ai_opc_model_center_seedream_image",
          operator_note: "keep",
          base_credits: 300,
          status: "disabled",
          sort_order: 91,
          resolution_options: ["2K", "3K", "4K"],
          max_references: 10,
          poll_queue_name: "generation-poll-image",
          provider_rpm_limit: 17,
        },
        {
          model_code: "global-ai-opc-nano-banana-pro",
          display_name: "Seedream 5.0 Pro（GlobalAiOpc）",
          provider_model: "seedream_5.0Pro",
          invocation_mode: "async_polling",
          create_endpoint: "/v2/model-center/tasks",
          query_endpoint: "/v2/model-center/tasks/{taskId}",
          api_key_env: "GLOBAL_AI_OPC_API_KEY",
          request_format: "global_ai_opc_model_center_seedream_image",
          operator_note: "keep",
          base_credits: 300,
          status: "disabled",
          sort_order: 92,
          resolution_options: ["1K", "2K"],
          max_references: 10,
          poll_queue_name: "generation-poll-image",
          provider_rpm_limit: 17,
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("repairs GlobalAiOpc Model Center videos overwritten as image models", async () => {
    const migrationNames = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(migrationNames.includes("20260911-repair-globalaiopc-model-center-video-classification.sql"));
    assert.ok(
      migrationNames.indexOf("20260911-repair-globalaiopc-model-center-video-classification.sql")
        > migrationNames.indexOf("20260910-allow-bound-team-asset-proxy-urls.sql"),
    );
    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    assert.match(
      productionMigrationScript,
      /const migrations = \[[\s\S]*\["20260911-repair-globalaiopc-model-center-video-classification\.sql", "packages\/db\/migrations\/20260911-repair-globalaiopc-model-center-video-classification\.sql"\][\s\S]*const requiredBaselineMigrationNames/,
    );
    assert.match(
      productionMigrationScript,
      /const runtimeSafeMigrationNames = new Set\(\[[\s\S]*"20260911-repair-globalaiopc-model-center-video-classification\.sql"[\s\S]*\]\);\s*const runtimeRequiredPostconditionMigrationNames/,
    );

    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET model_code = 'MiniMax-H3-c4',
            provider_model = 'MiniMax-H3-c4'
        WHERE model_code = 'MiniMax-H3-768p';

        UPDATE ai_model_configs
        SET provider_protocol = 'global_ai_opc_image',
            invocation_mode = 'sync',
            media_type = 'image',
            task_modes_json = '["image.edit","image.reference_generate","image.image_to_image"]'::jsonb,
            capabilities_json = '{"prompt":true,"referenceImages":true}'::jsonb,
            parameter_schema_json = parameter_schema_json || '{"adminOnly":{"type":"string","visible":false}}'::jsonb,
            default_params_json = default_params_json || '{"durationSec":15,"adminOnly":"keep"}'::jsonb,
            provider_config_json = '{"requestPath":"/v1/images/generations","requestFormat":"global_ai_opc_image","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY"}'::jsonb,
            pricing_json = '{"baseCredits":150,"unit":"image","administratorNote":"keep"}'::jsonb,
            limits_json = '{"maxReferences":10}'::jsonb,
            ui_config_json = '{"modelKind":"image.reference_image","modelKindLabel":"参考生图","pipeline":"image","toolboxTools":["prompt-reverse"]}'::jsonb
        WHERE model_code IN ('seedance-2.5-c1', 'MiniMax-H3-c4');

        UPDATE ai_model_dispatch_policies
        SET submit_queue_name = 'generation-submit-image',
            poll_queue_name = NULL,
            finalize_queue_name = NULL,
            job_id_template = 'generation:image:submit:{taskId}',
            bullmq_job_options_json = '{"attempts":7}'::jsonb,
            submit_concurrency_limit = 7,
            provider_rpm_limit = 17,
            provider_concurrent_limit = 3,
            polling_interval_ms = 42000,
            polling_concurrency_limit = 9,
            polling_backoff_json = '{"strategy":"fixed","intervalMs":42000}'::jsonb,
            retry_policy_json = '{"submitAttempts":7}'::jsonb,
            circuit_breaker_json = '{"openAfterFailures":99}'::jsonb,
            status = 'disabled'
        WHERE model_config_id IN (
          SELECT id
          FROM ai_model_configs
          WHERE model_code IN ('seedance-2.5-c1', 'MiniMax-H3-c4')
        );
      `);

      await applySqlMigration(
        db,
        process.cwd(),
        "20260911-repair-globalaiopc-model-center-video-classification.sql",
      );

      const models = await db.query<{
        model_code: string;
        provider_protocol: string;
        invocation_mode: string;
        media_type: string;
        task_modes_json: string[];
        capabilities_json: Record<string, unknown>;
        parameter_schema_json: Record<string, unknown>;
        default_params_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
        pricing_json: Record<string, unknown>;
        limits_json: Record<string, unknown>;
        ui_config_json: Record<string, unknown>;
        submit_queue_name: string;
        poll_queue_name: string | null;
        finalize_queue_name: string | null;
        job_id_template: string;
        bullmq_job_options_json: Record<string, unknown>;
        submit_concurrency_limit: number;
        provider_rpm_limit: number;
        provider_concurrent_limit: number;
        polling_interval_ms: number;
        polling_concurrency_limit: number;
        polling_backoff_json: Record<string, unknown>;
        retry_policy_json: Record<string, unknown>;
        circuit_breaker_json: Record<string, unknown>;
        policy_status: string;
      }>(`
        SELECT model.model_code, model.provider_protocol, model.invocation_mode,
               model.media_type, model.task_modes_json, model.capabilities_json,
               model.parameter_schema_json, model.default_params_json,
               model.provider_config_json, model.pricing_json, model.limits_json,
               model.ui_config_json, policy.submit_queue_name, policy.poll_queue_name,
               policy.finalize_queue_name, policy.job_id_template,
               policy.bullmq_job_options_json, policy.submit_concurrency_limit,
               policy.provider_rpm_limit, policy.provider_concurrent_limit,
               policy.polling_interval_ms, policy.polling_concurrency_limit,
               policy.polling_backoff_json, policy.retry_policy_json,
               policy.circuit_breaker_json, policy.status AS policy_status
        FROM ai_model_configs model
        JOIN ai_model_dispatch_policies policy ON policy.model_config_id = model.id
        WHERE model.model_code IN ('seedance-2.5-c1', 'MiniMax-H3-c4')
        ORDER BY model.model_code
      `);

      assert.deepEqual(models.rows.map((model) => ({
        modelCode: model.model_code,
        providerProtocol: model.provider_protocol,
        invocationMode: model.invocation_mode,
        mediaType: model.media_type,
        taskModes: model.task_modes_json,
        capabilities: model.capabilities_json,
        administratorParameter: model.parameter_schema_json.adminOnly,
        administratorDefault: model.default_params_json.adminOnly,
        durationSec: model.default_params_json.durationSec,
        createTaskEndpoint: model.provider_config_json.createTaskEndpoint,
        queryTaskEndpoint: model.provider_config_json.queryTaskEndpoint,
        requestFormat: model.provider_config_json.requestFormat,
        pricingUnit: model.pricing_json.unit,
        administratorNote: model.pricing_json.administratorNote,
        limits: model.limits_json,
        modelKind: model.ui_config_json.modelKind,
        pipeline: model.ui_config_json.pipeline,
        toolboxTools: model.ui_config_json.toolboxTools,
        submitQueueName: model.submit_queue_name,
        pollQueueName: model.poll_queue_name,
        finalizeQueueName: model.finalize_queue_name,
        jobIdTemplate: model.job_id_template,
        bullmqJobOptions: model.bullmq_job_options_json,
        submitConcurrencyLimit: model.submit_concurrency_limit,
        providerRpmLimit: model.provider_rpm_limit,
        providerConcurrentLimit: model.provider_concurrent_limit,
        pollingIntervalMs: model.polling_interval_ms,
        pollingConcurrencyLimit: model.polling_concurrency_limit,
        pollingBackoff: model.polling_backoff_json,
        retryPolicy: model.retry_policy_json,
        circuitBreaker: model.circuit_breaker_json,
        policyStatus: model.policy_status,
      })), [
        {
          modelCode: "MiniMax-H3-c4",
          providerProtocol: "globalaiopc_video",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: [
            "video.text_to_video",
            "video.image_to_video",
            "video.first_last_frame_to_video",
            "video.reference_guided_video",
          ],
          capabilities: {
            prompt: true,
            asyncPolling: true,
            referenceImages: true,
            referenceVideo: true,
            referenceAudio: true,
            voice: false,
          },
          administratorParameter: { type: "string", visible: false },
          administratorDefault: "keep",
          durationSec: 15,
          createTaskEndpoint: "/v2/model-center/tasks",
          queryTaskEndpoint: "/v2/model-center/tasks/{taskId}",
          requestFormat: "globalaiopc_model_center_video",
          pricingUnit: "video",
          administratorNote: "keep",
          limits: {
            maxReferences: 5,
            maxReferenceAudios: 3,
            minDurationSec: 5,
            maxDurationSec: 15,
            supportedRatios: ["16:9", "9:16"],
            supportedResolutions: ["1440P"],
          },
          modelKind: "video.reference",
          pipeline: "video",
          toolboxTools: ["prompt-reverse"],
          submitQueueName: "generation-submit-video",
          pollQueueName: "generation-poll-video",
          finalizeQueueName: "generation-finalize-artifact",
          jobIdTemplate: "generation:video:{stage}:{taskId}",
          bullmqJobOptions: { attempts: 7 },
          submitConcurrencyLimit: 7,
          providerRpmLimit: 17,
          providerConcurrentLimit: 3,
          pollingIntervalMs: 42000,
          pollingConcurrencyLimit: 9,
          pollingBackoff: { strategy: "fixed", intervalMs: 42000 },
          retryPolicy: { submitAttempts: 7 },
          circuitBreaker: { openAfterFailures: 99 },
          policyStatus: "disabled",
        },
        {
          modelCode: "seedance-2.5-c1",
          providerProtocol: "globalaiopc_video",
          invocationMode: "async_polling",
          mediaType: "video",
          taskModes: [
            "video.text_to_video",
            "video.image_to_video",
            "video.first_last_frame_to_video",
            "video.reference_guided_video",
            "video.video_to_video",
          ],
          capabilities: {
            prompt: true,
            asyncPolling: true,
            referenceImages: true,
            referenceVideo: true,
            referenceAudio: true,
            voice: false,
          },
          administratorParameter: { type: "string", visible: false },
          administratorDefault: "keep",
          durationSec: 15,
          createTaskEndpoint: "/v2/model-center/tasks",
          queryTaskEndpoint: "/v2/model-center/tasks/{taskId}",
          requestFormat: "globalaiopc_model_center_video",
          pricingUnit: "video",
          administratorNote: "keep",
          limits: {
            maxPromptLength: 5000,
            maxReferences: 30,
            maxReferenceVideos: 10,
            maxReferenceAudios: 10,
            minDurationSec: 4,
            maxDurationSec: 30,
            supportedRatios: ["9:16", "16:9", "1:1"],
            supportedResolutions: ["720p", "480p"],
          },
          modelKind: "video.reference",
          pipeline: "video",
          toolboxTools: ["prompt-reverse"],
          submitQueueName: "generation-submit-video",
          pollQueueName: "generation-poll-video",
          finalizeQueueName: "generation-finalize-artifact",
          jobIdTemplate: "generation:video:{stage}:{taskId}",
          bullmqJobOptions: { attempts: 7 },
          submitConcurrencyLimit: 7,
          providerRpmLimit: 17,
          providerConcurrentLimit: 3,
          pollingIntervalMs: 42000,
          pollingConcurrencyLimit: 9,
          pollingBackoff: { strategy: "fixed", intervalMs: 42000 },
          retryPolicy: { submitAttempts: 7 },
          circuitBreaker: { openAfterFailures: 99 },
          policyStatus: "disabled",
        },
      ]);
    } finally {
      await db.close();
    }
  });
});
