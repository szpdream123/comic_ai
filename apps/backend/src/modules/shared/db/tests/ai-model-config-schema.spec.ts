import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  createMigratedTestDb,
  listColumnNames,
  listIndexNames,
  listTableNames,
} from "../test-db.ts";

describe("ai model configuration schema", () => {
  it("adds configurable model catalog and dispatch policy tables", async () => {
    const db = await createMigratedTestDb();

    try {
      const tables = await listTableNames(db);
      assert.ok(tables.includes("ai_model_configs"));
      assert.ok(tables.includes("ai_model_dispatch_policies"));
      assert.ok(tables.includes("ai_generation_task_snapshots"));

      assert.deepEqual(await listColumnNames(db, "ai_model_configs"), [
        "id",
        "model_code",
        "display_name",
        "provider_name",
        "provider_model",
        "provider_protocol",
        "invocation_mode",
        "media_type",
        "task_modes_json",
        "capabilities_json",
        "parameter_schema_json",
        "default_params_json",
        "provider_config_json",
        "pricing_json",
        "limits_json",
        "ui_config_json",
        "status",
        "sort_order",
        "remark",
        "created_by_user_id",
        "updated_by_user_id",
        "created_at",
        "updated_at",
      ]);

      assert.deepEqual(await listColumnNames(db, "ai_model_dispatch_policies"), [
        "id",
        "model_config_id",
        "queue_backend",
        "submit_queue_name",
        "poll_queue_name",
        "finalize_queue_name",
        "dead_letter_queue_name",
        "job_id_template",
        "bullmq_job_options_json",
        "submit_concurrency_limit",
        "provider_rpm_limit",
        "provider_concurrent_limit",
        "polling_interval_ms",
        "polling_concurrency_limit",
        "polling_backoff_json",
        "retry_policy_json",
        "circuit_breaker_json",
        "status",
        "created_at",
        "updated_at",
      ]);

      const modelIndexes = await listIndexNames(db, "ai_model_configs");
      assert.ok(modelIndexes.includes("ai_model_configs_lookup_idx"));
      assert.ok(modelIndexes.includes("ai_model_configs_provider_idx"));
      assert.ok(modelIndexes.includes("ai_model_configs_task_modes_gin_idx"));

      const policyIndexes = await listIndexNames(db, "ai_model_dispatch_policies");
      assert.ok(policyIndexes.includes("ai_model_dispatch_policies_model_idx"));
      assert.ok(policyIndexes.includes("ai_model_dispatch_policies_queue_idx"));

      assert.deepEqual(await listColumnNames(db, "ai_generation_task_snapshots"), [
        "id",
        "organization_id",
        "workspace_id",
        "project_id",
        "episode_id",
        "target_type",
        "target_id",
        "workflow_id",
        "task_id",
        "attempt_id",
        "provider_request_id",
        "model_config_id",
        "credit_reservation_id",
        "model_code",
        "media_type",
        "task_mode",
        "status",
        "progress_stage",
        "progress_percent",
        "request_summary_json",
        "provider_status_json",
        "result_assets_json",
        "failure_json",
        "estimated_credits",
        "credit_status",
        "credit_summary_json",
        "submitted_at",
        "started_at",
        "completed_at",
        "failed_at",
        "last_polled_at",
        "created_at",
        "updated_at",
      ]);

      const snapshotIndexes = await listIndexNames(db, "ai_generation_task_snapshots");
      assert.ok(snapshotIndexes.includes("ai_generation_task_snapshots_task_uidx"));
      assert.ok(snapshotIndexes.includes("ai_generation_task_snapshots_target_idx"));
      assert.ok(snapshotIndexes.includes("ai_generation_task_snapshots_status_idx"));
    } finally {
      await db.close();
    }
  });

  it("seeds GPT Image 2 and Seedance as active configurable models", async () => {
    const db = await createMigratedTestDb();

    try {
      const result = await db.query<{
        model_code: string;
        provider_model: string;
        provider_protocol: string;
        invocation_mode: string;
        media_type: string;
        provider_config_json: Record<string, unknown>;
        pricing_json: Record<string, unknown>;
        ui_config_json: Record<string, unknown>;
      }>(
        `
          SELECT
            model_code,
            provider_model,
            provider_protocol,
            invocation_mode,
            media_type,
            provider_config_json,
            pricing_json,
            ui_config_json
          FROM ai_model_configs
          WHERE model_code IN ('gpt-image-2-cn', 'seedance-i2v-pro')
          ORDER BY model_code
        `,
      );

      assert.deepEqual(result.rows.map((row) => row.model_code), [
        "gpt-image-2-cn",
        "seedance-i2v-pro",
      ]);
      assert.equal(result.rows[0]?.provider_protocol, "openai_images");
      assert.equal(result.rows[0]?.media_type, "image");
      assert.equal(result.rows[0]?.provider_config_json.apiKeyEnv, "GPT_IMAGE2_API_KEY");
      assert.deepEqual(result.rows[0]?.ui_config_json.supportedModes, [
        "text_to_image",
        "multi_reference",
        "image_to_image",
      ]);
      assert.equal(result.rows[1]?.provider_protocol, "volcengine_ark_video");
      assert.equal(result.rows[1]?.provider_model, "seedance-2-0-i2v");
      assert.equal(result.rows[1]?.invocation_mode, "async_polling");
      assert.equal(result.rows[1]?.media_type, "video");
      assert.equal(result.rows[1]?.provider_config_json.apiKeyEnv, "VOLCENGINE_ARK_API_KEY");
      assert.equal(result.rows[1]?.pricing_json.baseCredits, 120);

      const policies = await db.query<{ model_code: string; submit_queue_name: string; poll_queue_name: string | null }>(
        `
          SELECT c.model_code, p.submit_queue_name, p.poll_queue_name
          FROM ai_model_dispatch_policies p
          JOIN ai_model_configs c ON c.id = p.model_config_id
          WHERE c.model_code IN ('gpt-image-2-cn', 'seedance-i2v-pro')
          ORDER BY c.model_code
        `,
      );
      assert.deepEqual(policies.rows, [
        {
          model_code: "gpt-image-2-cn",
          submit_queue_name: "generation-submit-image",
          poll_queue_name: null,
        },
        {
          model_code: "seedance-i2v-pro",
          submit_queue_name: "generation-submit-video",
          poll_queue_name: "generation-poll-video",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("seeds Aliyun Bailian HappyHorse as an active async video model", async () => {
    const db = await createMigratedTestDb();

    try {
      const result = await db.query<{
        model_code: string;
        provider_name: string;
        provider_model: string;
        provider_protocol: string;
        invocation_mode: string;
        media_type: string;
        provider_config_json: Record<string, unknown>;
        default_params_json: Record<string, unknown>;
        pricing_json: Record<string, unknown>;
      }>(
        `
          SELECT
            model_code,
            provider_name,
            provider_model,
            provider_protocol,
            invocation_mode,
            media_type,
            provider_config_json,
            default_params_json,
            pricing_json
          FROM ai_model_configs
          WHERE model_code = 'happyhorse-1.0-r2v'
          LIMIT 1
        `,
      );

      assert.equal(result.rows[0]?.model_code, "happyhorse-1.0-r2v");
      assert.equal(result.rows[0]?.provider_name, "aliyun-bailian");
      assert.equal(result.rows[0]?.provider_model, "happyhorse-1.0-r2v");
      assert.equal(result.rows[0]?.provider_protocol, "aliyun_bailian_video");
      assert.equal(result.rows[0]?.invocation_mode, "async_polling");
      assert.equal(result.rows[0]?.media_type, "video");
      assert.equal(result.rows[0]?.provider_config_json.baseURL, "https://dashscope.aliyuncs.com");
      assert.equal(result.rows[0]?.provider_config_json.apiKeyEnv, "ALIYUNBAILIAN_API_KEY");
      assert.equal(result.rows[0]?.default_params_json.aspectRatio, "16:9");
      assert.equal(result.rows[0]?.pricing_json.baseCredits, 120);

      const policies = await db.query<{ submit_queue_name: string; poll_queue_name: string | null }>(
        `
          SELECT p.submit_queue_name, p.poll_queue_name
          FROM ai_model_dispatch_policies p
          JOIN ai_model_configs c ON c.id = p.model_config_id
          WHERE c.model_code = 'happyhorse-1.0-r2v'
          LIMIT 1
        `,
      );
      assert.equal(policies.rows[0]?.submit_queue_name, "generation-submit-video");
      assert.equal(policies.rows[0]?.poll_queue_name, "generation-poll-video");
    } finally {
      await db.close();
    }
  });

  it("documents the model configuration tables with Chinese comments", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "packages/db/migrations/0007_ai_model_configs.sql"),
      "utf8",
    );

    assert.match(migration, /COMMENT ON TABLE ai_model_configs IS\s+'AI模型通用配置表/);
    assert.match(migration, /COMMENT ON COLUMN ai_model_configs.model_code IS '平台内部模型编码/);
    assert.match(migration, /COMMENT ON TABLE ai_model_dispatch_policies IS\s+'AI模型调度策略表/);
    assert.match(migration, /COMMENT ON COLUMN ai_model_dispatch_policies.polling_interval_ms IS '异步任务轮询间隔/);
  });
});
