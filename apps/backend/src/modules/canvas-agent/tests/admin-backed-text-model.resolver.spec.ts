import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { TextModelGatewayError } from "../../model-gateway/text-model-gateway.errors.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  AdminBackedTextModelResolver,
  listAvailableCanvasAgentModels,
} from "../admin-backed-text-model.resolver.ts";

describe("admin-backed Canvas Agent model compatibility isolation", { concurrency: false }, () => {
  it("lists and resolves an active backend text model without Agent-only metadata", async () => {
    const db = await createMigratedTestDb();
    const modelConfigId = randomUUID();
    const modelCode = `canvas-text-${randomUUID()}`;
    try {
      await db.query(
        `
          INSERT INTO ai_model_configs (
            id, model_code, display_name, provider_name, provider_model,
            provider_protocol, invocation_mode, media_type, task_modes_json,
            capabilities_json, parameter_schema_json, default_params_json,
            provider_config_json, pricing_json, limits_json, ui_config_json,
            status, sort_order, created_at, updated_at
          ) VALUES (
            $1, $2, 'Configured Text Model', 'test-provider', 'text-model',
            'openai_compatible_chat', 'stream', 'text', '["text.script"]'::jsonb,
            '{"input":["prompt"],"output":["text","json"]}'::jsonb,
            '{}'::jsonb, '{}'::jsonb,
            '{"baseURL":"https://provider.example/v1","apiKey":"must-not-leak"}'::jsonb,
            '{"unit":"text","baseCredits":1}'::jsonb, '{}'::jsonb,
            '{"modelKind":"text.script"}'::jsonb, 'active', 1, now(), now()
          )
        `,
        [modelConfigId, modelCode],
      );

      assert.equal((await listAvailableCanvasAgentModels(db)).some((model) => model.modelCode === modelCode), true);
      const resolution = await new AdminBackedTextModelResolver(db).resolve(modelCode);
      assert.equal(resolution.id, modelCode);
      assert.equal("apiKey" in resolution.snapshot.providerConfig, false);
    } finally {
      await db.close();
    }
  });

  it("hides and rejects a model after a failed probe while allowing an explicit re-probe", async () => {
    const db = await createMigratedTestDb();
    const modelConfigId = randomUUID();
    const modelCode = `canvas-agent-probe-${randomUUID()}`;
    try {
      await db.query(
        `
          INSERT INTO ai_model_configs (
            id, model_code, display_name, provider_name, provider_model,
            provider_protocol, invocation_mode, media_type, task_modes_json,
            capabilities_json, parameter_schema_json, default_params_json,
            provider_config_json, pricing_json, limits_json, ui_config_json,
            status, sort_order, created_at, updated_at
          ) VALUES (
            $1, $2, 'Canvas Agent Probe', 'test-provider', 'agent-model',
            'openai_compatible_chat', 'stream', 'text', '["text.canvas_agent"]'::jsonb,
            '{"stream":true,"toolCalling":true,"jsonSchema":true,"contextWindow":32000}'::jsonb,
            '{}'::jsonb, '{}'::jsonb,
            '{"baseURL":"https://provider.example/v1","apiKey":"must-not-leak"}'::jsonb,
            '{"unit":"token","baseCredits":1}'::jsonb, '{}'::jsonb,
            '{"agentEligible":true}'::jsonb, 'active', 1, now(), now()
          )
        `,
        [modelConfigId, modelCode],
      );

      assert.equal((await listAvailableCanvasAgentModels(db)).some((model) => model.modelCode === modelCode), true);

      await db.query(
        `
          INSERT INTO canvas_agent_model_compatibility_probes (
            model_config_id, status, failure_code, latency_ms, checks_json,
            checked_at, updated_at
          ) VALUES ($1, 'failed', 'canvas_agent_model_json_schema_failed', 18,
            '[{"key":"json_schema","status":"failed","message":"schema mismatch"}]'::jsonb,
            now(), now())
        `,
        [modelConfigId],
      );

      assert.equal((await listAvailableCanvasAgentModels(db)).some((model) => model.modelCode === modelCode), false);
      await assert.rejects(
        () => new AdminBackedTextModelResolver(db).resolve(modelCode),
        (error) => error instanceof TextModelGatewayError && error.code === "model_disabled",
      );

      const probeResolution = await new AdminBackedTextModelResolver(db, {
        allowFailedCompatibilityProbe: true,
      }).resolve(modelCode);
      assert.equal(probeResolution.id, modelCode);
      assert.equal("apiKey" in probeResolution.snapshot.providerConfig, false);
    } finally {
      await db.close();
    }
  });
});
