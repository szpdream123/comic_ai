import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { loadSqlMigrations } from "../../shared/db/migrations.ts";

describe("CosyVoice V2 contract migration", () => {
  it("loads the correction after the immutable V1 migration", async () => {
    const names = (await loadSqlMigrations()).map((migration) => migration.name);
    assert.ok(
      names.indexOf("20260720-correct-cosyvoice-v2-contract.sql")
        > names.indexOf("20260720-add-aliyun-bailian-audio-model.sql"),
    );
  });

  it("leaves a freshly migrated schema on the synchronous V2 contract", async () => {
    const db = await createMigratedTestDb();
    try {
      const model = await db.query<{
        model_code: string;
        provider_model: string;
        invocation_mode: string;
        provider_config_json: Record<string, unknown>;
        default_params_json: Record<string, unknown>;
      }>(`
        SELECT model_code, provider_model, invocation_mode, provider_config_json, default_params_json
        FROM ai_model_configs
        WHERE id = '70000000-0000-4000-8000-00000000a001'
      `);
      assert.deepEqual(model.rows[0], {
        model_code: "cosyvoice-v2",
        provider_model: "cosyvoice-v2",
        invocation_mode: "sync",
        provider_config_json: {
          baseURL: "https://dashscope.aliyuncs.com",
          createTaskEndpoint: "/api/v1/services/audio/tts/SpeechSynthesizer",
          apiKeyEnv: "ALIYUNBAILIAN_API_KEY",
          timeoutMs: 120000,
        },
        default_params_json: {
          voice: "longxiaochun_v2",
          format: "mp3",
          sampleRate: 22050,
          volume: 50,
          rate: 1,
          pitch: 1,
        },
      });

      const legacy = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM ai_model_configs WHERE model_code = 'cosyvoice-v1'",
      );
      assert.equal(legacy.rows[0]?.count, 0);

      const policy = await db.query<{
        poll_queue_name: string | null;
        polling_backoff_json: Record<string, unknown>;
        retry_policy_json: Record<string, unknown>;
      }>(`
        SELECT poll_queue_name, polling_backoff_json, retry_policy_json
        FROM ai_model_dispatch_policies
        WHERE model_config_id = '70000000-0000-4000-8000-00000000a001'
      `);
      assert.deepEqual(policy.rows[0], {
        poll_queue_name: null,
        polling_backoff_json: {},
        retry_policy_json: { submitAttempts: 3, finalizeAttempts: 3 },
      });
    } finally {
      await db.close();
    }
  });
});
