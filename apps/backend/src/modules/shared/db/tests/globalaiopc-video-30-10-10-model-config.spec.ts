import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it } from "node:test";

import { applySqlMigration, loadSqlMigrations } from "../migrations.ts";
import { createMigratedTestDb } from "../test-db.ts";

const migrationName = "20261028-add-globalaiopc-video-30-10-10.sql";

describe("GlobalAiOpc video_30_10_10 model configuration", { concurrency: false }, () => {
  it("registers the migration in runtime and production migration chains", async () => {
    const migrationNames = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(migrationNames.includes(migrationName));

    const productionMigrationScript = await readFile(
      join(process.cwd(), "scripts", "migrate-user-scope.mjs"),
      "utf8",
    );
    assert.match(productionMigrationScript, /20261028-add-globalaiopc-video-30-10-10\.sql/);
    assert.match(
      productionMigrationScript,
      /runtimeSafeMigrationNames = new Set\(\[[\s\S]*"20261028-add-globalaiopc-video-30-10-10\.sql"[\s\S]*\]\);/,
    );
    assert.match(
      productionMigrationScript,
      /\["20261028-add-globalaiopc-video-30-10-10\.sql", \{\s*recorded: "a16ce46ab9ab709bfb664432f92c8b5df75cf18b702a4fe03ebb14aec47e573a",\s*current: "950fc2c90e424f0d90a9698d76a356d6abd381fb512d4ba3cd5331e780f147c8",\s*\}\]/,
    );
  });

  it("uses the documented contract and the existing Seedance 2.5 execution chain", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        DELETE FROM ai_model_dispatch_policies
        WHERE model_config_id IN (
          SELECT id FROM ai_model_configs WHERE model_code = 'video_30_10_10'
        );
        DELETE FROM ai_model_configs WHERE model_code = 'video_30_10_10';
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":700,"administratorNote":"source"}'::jsonb,
            status = 'active'
        WHERE model_code = 'seedance-2.5-c1';
      `);

      await applySqlMigration(db, process.cwd(), migrationName);

      const modelResult = await db.query<{
        model_code: string;
        display_name: string;
        provider_model: string;
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
        status: string;
      }>(`
        SELECT model_code, display_name, provider_model, provider_protocol,
               invocation_mode, media_type, task_modes_json, capabilities_json,
               parameter_schema_json, default_params_json, provider_config_json,
               pricing_json, limits_json, ui_config_json, status
        FROM ai_model_configs
        WHERE model_code = 'video_30_10_10'
      `);

      assert.deepEqual(modelResult.rows[0], {
        model_code: "video_30_10_10",
        display_name: "Seedance 2.5（30图/10视频/10音频）",
        provider_model: "video_30_10_10",
        provider_protocol: "globalaiopc_video",
        invocation_mode: "async_polling",
        media_type: "video",
        task_modes_json: [
          "video.text_to_video",
          "video.image_to_video",
          "video.reference_guided_video",
          "video.video_to_video",
        ],
        capabilities_json: {
          voice: false,
          prompt: true,
          asyncPolling: true,
          referenceAudio: true,
          referenceVideo: true,
          referenceImages: true,
        },
        parameter_schema_json: {
          prompt: { type: "string", required: true, minLength: 1, maxLength: 5000 },
          resolution: { type: "enum", required: true, options: ["720p"] },
          aspectRatio: { type: "enum", options: ["16:9", "9:16", "1:1", "21:9", "4:3", "3:4"] },
          durationSec: { type: "integer", minimum: 4, maximum: 30 },
          referenceAudio: { type: "file[]", maximum: 10 },
          referenceImages: { type: "file[]", maximum: 30 },
          referenceVideos: { type: "file[]", maximum: 10 },
        },
        default_params_json: { resolution: "720p", aspectRatio: "16:9", durationSec: 5 },
        provider_config_json: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
          requestFormat: "globalaiopc_model_center_video",
          queryTaskEndpoint: "/v2/model-center/tasks/{taskId}",
          createTaskEndpoint: "/v2/model-center/tasks",
        },
        pricing_json: { unit: "video", baseCredits: 700, administratorNote: "source" },
        limits_json: {
          maxReferences: 30,
          maxDurationSec: 30,
          minDurationSec: 4,
          maxPromptLength: 5000,
          supportedRatios: ["16:9", "9:16", "1:1", "21:9", "4:3", "3:4"],
          maxReferenceAudios: 10,
          maxReferenceVideos: 10,
          supportedResolutions: ["720p"],
        },
        ui_config_json: {
          group: "客易云 Model Center",
          label: "Seedance 2.5（30图/10视频/10音频）",
          visible: true,
          pipeline: "video",
          modelKind: "video.reference",
          recommended: false,
          videoCategory: "reference",
          modelKindLabel: "参考生视频",
          providerDocUrl: "https://docs.globalaiopc.com/api-reference/model-center/video-gen/video_30_10_10",
          supportedModes: ["text_to_video", "image_to_video", "reference_image_to_video", "video_to_video"],
          videoCategoryLabel: "参考生视频",
        },
        status: "active",
      });

      const policyResult = await db.query<Record<string, unknown>>(`
        SELECT policy.queue_backend, policy.submit_queue_name, policy.poll_queue_name,
               policy.finalize_queue_name, policy.dead_letter_queue_name,
               policy.job_id_template, policy.bullmq_job_options_json,
               policy.submit_concurrency_limit, policy.provider_rpm_limit,
               policy.provider_concurrent_limit, policy.polling_interval_ms,
               policy.polling_concurrency_limit, policy.polling_backoff_json,
               policy.retry_policy_json, policy.circuit_breaker_json, policy.status
        FROM ai_model_dispatch_policies AS policy
        JOIN ai_model_configs AS model ON model.id = policy.model_config_id
        WHERE model.model_code IN ('seedance-2.5-c1', 'video_30_10_10')
        ORDER BY model.model_code
      `);
      assert.equal(policyResult.rows.length, 2);
      assert.deepEqual(policyResult.rows[0], policyResult.rows[1]);

      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":999,"administratorNote":"keep"}'::jsonb,
            status = 'disabled'
        WHERE model_code = 'video_30_10_10'
      `);
      await applySqlMigration(db, process.cwd(), migrationName);
      const preserved = await db.query<{ pricing_json: Record<string, unknown>; status: string }>(`
        SELECT pricing_json, status
        FROM ai_model_configs
        WHERE model_code = 'video_30_10_10'
      `);
      assert.deepEqual(preserved.rows[0], {
        pricing_json: { unit: "video", baseCredits: 999, administratorNote: "keep" },
        status: "disabled",
      });
    } finally {
      await db.close();
    }
  });

  it("fails atomically when no eligible source model and dispatch policy exist", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        DELETE FROM ai_model_dispatch_policies
        WHERE model_config_id IN (
          SELECT id
          FROM ai_model_configs
          WHERE model_code IN ('video_30_10_10', 'sd_2.5_special', 'seedance-2.5-c1')
             OR provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1')
        );
        DELETE FROM ai_model_configs
        WHERE model_code IN ('video_30_10_10', 'sd_2.5_special', 'seedance-2.5-c1')
           OR provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1');
      `);

      await assert.rejects(
        applySqlMigration(db, process.cwd(), migrationName),
        /globalaiopc_video_30_10_10_source_policy_missing/,
      );

      const target = await db.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM ai_model_configs
        WHERE model_code = 'video_30_10_10'
      `);
      assert.equal(target.rows[0]?.count, "0");
    } finally {
      await db.close();
    }
  });

  it("fails atomically when eligible source models have no dispatch policy", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        DELETE FROM ai_model_dispatch_policies
        WHERE model_config_id IN (
          SELECT id
          FROM ai_model_configs
          WHERE model_code IN ('video_30_10_10', 'sd_2.5_special', 'seedance-2.5-c1')
             OR provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1')
        );
        DELETE FROM ai_model_configs WHERE model_code = 'video_30_10_10';
      `);

      await assert.rejects(
        applySqlMigration(db, process.cwd(), migrationName),
        /globalaiopc_video_30_10_10_source_policy_missing/,
      );

      const target = await db.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM ai_model_configs
        WHERE model_code = 'video_30_10_10'
      `);
      assert.equal(target.rows[0]?.count, "0");
    } finally {
      await db.close();
    }
  });
});
