WITH candidate AS (
  UPDATE ai_model_configs
  SET capabilities_json = COALESCE(capabilities_json, '{}'::jsonb) || jsonb_build_object(
        'stream', true,
        'toolCalling', false,
        'jsonSchema', false,
        'structuredJsonPrompt', true,
        'contextWindow', CASE
          WHEN capabilities_json->>'contextWindow' ~ '^[0-9]+$'
            AND (capabilities_json->>'contextWindow')::integer > 0
          THEN (capabilities_json->>'contextWindow')::integer
          ELSE 65536
        END
      ),
      updated_at = now()
  WHERE model_code = 'deepseek-noval'
    AND status = 'active'
    AND media_type = 'text'
    AND provider_protocol = 'openai_compatible_chat'
    AND invocation_mode = 'stream'
    AND provider_model = 'deepseek-v4-pro'
  RETURNING id
)
INSERT INTO canvas_agent_model_compatibility_probes (
  model_config_id,status,failure_code,latency_ms,checks_json,
  checked_by_admin_id,checked_at,updated_at
)
SELECT
  id,
  'failed',
  'canvas_agent_model_probe_required',
  0,
  '[{"key":"resolution","status":"failed","message":"真实兼容性探测尚未执行"}]'::jsonb,
  NULL,
  now(),
  now()
FROM candidate
ON CONFLICT (model_config_id) DO UPDATE
SET status = EXCLUDED.status,
    failure_code = EXCLUDED.failure_code,
    latency_ms = EXCLUDED.latency_ms,
    checks_json = EXCLUDED.checks_json,
    checked_by_admin_id = EXCLUDED.checked_by_admin_id,
    checked_at = EXCLUDED.checked_at,
    updated_at = EXCLUDED.updated_at;
