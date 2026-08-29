import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySqlMigration } from "../migrations.ts";
import { createMigratedTestDb } from "../test-db.ts";

describe("ChiYuan video model configuration", () => {
  it("seeds only the two requested Seedance video models as disabled", async () => {
    const db = await createMigratedTestDb();
    try {
      const result = await db.query<{
        model_code: string;
        provider_model: string;
        provider_protocol: string;
        media_type: string;
        status: string;
        provider_config_json: Record<string, unknown>;
        pricing_json: Record<string, unknown>;
      }>(`
        SELECT model_code, provider_model, provider_protocol, media_type, status,
               provider_config_json, pricing_json
        FROM ai_model_configs
        WHERE provider_name = 'ChiYuan'
        ORDER BY model_code
      `);

      assert.deepEqual(result.rows, [
        {
          model_code: "chiyuan-seedance-2.0-mini",
          provider_model: "doubao-seedance-2-0-mini-260615",
          provider_protocol: "chiyuan_video",
          media_type: "video",
          status: "disabled",
          provider_config_json: {
            baseURL: "https://cy.apistudio.cc",
            requestPath: "/api/v3/contents/generations/tasks",
            createTaskEndpoint: "/api/v3/contents/generations/tasks",
            queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
            apiKeyEnv: "ChiYuan_API_KEY",
            requestFormat: "chiyuan_seedance_official",
          },
          pricing_json: { unit: "video", baseCredits: 0, billingMode: "fixed" },
        },
        {
          model_code: "chiyuan-seedance-2.5-super-resolution",
          provider_model: "doubao-seedance-2-5-260628",
          provider_protocol: "chiyuan_video",
          media_type: "video",
          status: "disabled",
          provider_config_json: {
            baseURL: "https://cy.apistudio.cc",
            requestPath: "/api/v3/contents/generations/tasks",
            createTaskEndpoint: "/api/v3/contents/generations/tasks",
            queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
            apiKeyEnv: "ChiYuan_API_KEY",
            requestFormat: "chiyuan_seedance_super_resolution",
          },
          pricing_json: { unit: "video", baseCredits: 0, billingMode: "fixed" },
        },
      ]);

      const durationOptions = await db.query<{ duration_options: string[] | null }>(`
        SELECT parameter_schema_json #> '{durationSec,options}' AS duration_options
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);
      assert.deepEqual(
        durationOptions.rows[0]?.duration_options,
        Array.from({ length: 26 }, (_, index) => String(index + 5)),
      );

      const policies = await db.query<{
        model_code: string;
        submit_queue_name: string;
        poll_queue_name: string | null;
        polling_interval_ms: number;
        polling_backoff_json: Record<string, unknown>;
        retry_policy_json: Record<string, unknown>;
      }>(`
        SELECT config.model_code, policy.submit_queue_name, policy.poll_queue_name,
               policy.polling_interval_ms, policy.polling_backoff_json, policy.retry_policy_json
        FROM ai_model_dispatch_policies policy
        JOIN ai_model_configs config ON config.id = policy.model_config_id
        WHERE config.provider_name = 'ChiYuan'
        ORDER BY config.model_code
      `);
      assert.deepEqual(policies.rows, [
        {
          model_code: "chiyuan-seedance-2.0-mini",
          submit_queue_name: "generation-submit-video",
          poll_queue_name: "generation-poll-video",
          polling_interval_ms: 30000,
          polling_backoff_json: {},
          retry_policy_json: { submitAttempts: 3, finalizeAttempts: 3 },
        },
        {
          model_code: "chiyuan-seedance-2.5-super-resolution",
          submit_queue_name: "generation-submit-video",
          poll_queue_name: "generation-poll-video",
          polling_interval_ms: 30000,
          polling_backoff_json: {},
          retry_policy_json: { submitAttempts: 3, finalizeAttempts: 3 },
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("preserves administrator pricing and status when the migration is reapplied", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":880,"billingMode":"fixed"}'::jsonb,
            status = 'active'
        WHERE model_code = 'chiyuan-seedance-2.0-mini'
      `);

      await applySqlMigration(db, process.cwd(), "20261023-add-chiyuan-video-models.sql");

      const result = await db.query<{ status: string; pricing_json: Record<string, unknown> }>(`
        SELECT status, pricing_json
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.0-mini'
      `);
      assert.deepEqual(result.rows[0], {
        status: "active",
        pricing_json: { unit: "video", baseCredits: 880, billingMode: "fixed" },
      });
    } finally {
      await db.close();
    }
  });

  it("corrects the Seedance 2.5 endpoint without changing administrator pricing or status", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":5000,"billingMode":"fixed"}'::jsonb,
            status = 'active'
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);

      await applySqlMigration(db, process.cwd(), "20261024-fix-chiyuan-seedance25-api-contract.sql");

      const result = await db.query<{
        status: string;
        pricing_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
      }>(`
        SELECT status, pricing_json, provider_config_json
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);
      assert.deepEqual(result.rows[0], {
        status: "active",
        pricing_json: { unit: "video", baseCredits: 5000, billingMode: "fixed" },
        provider_config_json: {
          baseURL: "https://cy.apistudio.cc",
          requestPath: "/v1/video/generations",
          createTaskEndpoint: "/v1/video/generations",
          queryTaskEndpoint: "/v1/video/generations/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      });
    } finally {
      await db.close();
    }
  });

  it("moves Seedance 2.5 to the native contents contract without changing administrator pricing or status", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":5000,"billingMode":"fixed"}'::jsonb,
            status = 'active',
            provider_config_json = provider_config_json || '{
              "requestPath":"/v1/video/generations",
              "createTaskEndpoint":"/v1/video/generations",
              "queryTaskEndpoint":"/v1/video/generations/{taskId}"
            }'::jsonb
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);

      await applySqlMigration(db, process.cwd(), "20261025-use-chiyuan-seedance25-native-contents-contract.sql");

      const result = await db.query<{
        status: string;
        pricing_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
      }>(`
        SELECT status, pricing_json, provider_config_json
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);
      assert.deepEqual(result.rows[0], {
        status: "active",
        pricing_json: { unit: "video", baseCredits: 5000, billingMode: "fixed" },
        provider_config_json: {
          baseURL: "https://cy.apistudio.cc",
          requestPath: "/api/v3/contents/generations/tasks",
          createTaskEndpoint: "/api/v3/contents/generations/tasks",
          queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
          apiKeyEnv: "ChiYuan_API_KEY",
          requestFormat: "chiyuan_seedance_super_resolution",
        },
      });
    } finally {
      await db.close();
    }
  });

  it("expands Seedance 2.5 duration choices through 30 seconds without changing administrator configuration", async () => {
    const db = await createMigratedTestDb();
    try {
      await db.query(`
        UPDATE ai_model_configs
        SET pricing_json = '{"unit":"video","baseCredits":5000,"billingMode":"fixed"}'::jsonb,
            status = 'active',
            parameter_schema_json = jsonb_set(
              parameter_schema_json,
              '{durationSec}',
              '{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":30,"options":["5","6","7","8","9","10","11","12","13","14","15"],"providerKey":"duration"}'::jsonb
            ),
            default_params_json = jsonb_set(default_params_json, '{durationSec}', '12'::jsonb)
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);

      const before = await db.query<{
        status: string;
        pricing_json: Record<string, unknown>;
        parameter_schema_json: Record<string, Record<string, unknown>>;
        default_params_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
        limits_json: Record<string, unknown>;
        ui_config_json: Record<string, unknown>;
      }>(`
        SELECT status, pricing_json, parameter_schema_json, default_params_json,
               provider_config_json, limits_json, ui_config_json
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);
      await applySqlMigration(db, process.cwd(), "20261027-expand-chiyuan-seedance25-duration-options.sql");

      const result = await db.query<{
        status: string;
        pricing_json: Record<string, unknown>;
        parameter_schema_json: Record<string, Record<string, unknown>>;
        default_params_json: Record<string, unknown>;
        provider_config_json: Record<string, unknown>;
        limits_json: Record<string, unknown>;
        ui_config_json: Record<string, unknown>;
      }>(`
        SELECT status, pricing_json, parameter_schema_json, default_params_json,
               provider_config_json, limits_json, ui_config_json
        FROM ai_model_configs
        WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
      `);
      const previous = before.rows[0];
      assert.ok(previous);
      assert.deepEqual(result.rows[0], {
        ...previous,
        parameter_schema_json: {
          ...previous.parameter_schema_json,
          durationSec: {
            ...previous.parameter_schema_json.durationSec,
            options: Array.from({ length: 26 }, (_, index) => String(index + 5)),
          },
        },
      });
    } finally {
      await db.close();
    }
  });
});
