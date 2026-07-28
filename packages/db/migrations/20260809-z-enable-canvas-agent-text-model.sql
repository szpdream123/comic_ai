WITH candidate AS (
  UPDATE ai_model_configs
  SET task_modes_json = CASE
        WHEN task_modes_json ? 'text.canvas_agent' THEN task_modes_json
        ELSE task_modes_json || '["text.canvas_agent"]'::jsonb
      END,
      capabilities_json = COALESCE(capabilities_json, '{}'::jsonb) || jsonb_build_object(
        'stream', true,
        'toolCalling', true,
        'jsonSchema', true,
        'contextWindow', CASE
          WHEN capabilities_json->>'contextWindow' ~ '^[0-9]+$'
            AND (capabilities_json->>'contextWindow')::integer > 0
          THEN (capabilities_json->>'contextWindow')::integer
          ELSE 65536
        END
      ),
      ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{"agentEligible":true}'::jsonb,
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
ON CONFLICT (model_config_id) DO NOTHING;
