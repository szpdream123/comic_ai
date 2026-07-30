ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev','openai_images','openai_compatible_chat','cumob_chat','volcengine_ark_image','volcengine_ark_video',
    'aliyun_bailian_video','aliyun_bailian_audio','globalaiopc_video','lingdong_api','cumob_image',
    'global_ai_opc_image','extra_token_video','saier_video','banana_router','custom_http'
  ));

WITH cumob_text_models AS (
  SELECT *
  FROM (VALUES
    ('cumob-gpt-5-6-sol', 'GPT-5.6 Sol（酷模）', 'gpt-5.6-sol', 131),
    ('cumob-deepseek-v4-pro', 'DeepSeek V4 Pro（酷模）', 'deepseek-v4-pro', 132),
    ('cumob-claude-opus-4-8', 'Claude Opus 4.8（酷模）', 'claude-opus-4.8', 133)
  ) AS rows(model_code, display_name, provider_model, sort_order)
)
INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
  default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
  status, sort_order, remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  '酷模智多星',
  provider_model,
  'cumob_chat',
  'stream',
  'text',
  '["text.script"]'::jsonb,
  '{"input":["prompt","outline"],"output":["text","json"],"stream":true}'::jsonb,
  '{
    "scriptPrompt":{"label":"剧本需求","type":"string","required":true,"visible":true},
    "scriptGenre":{"label":"剧本题材","type":"enum","required":false,"visible":true,"options":["都市","玄幻","科幻","悬疑","爱情","喜剧"]},
    "episodeCount":{"label":"集数","type":"integer","required":false,"visible":true,"options":["1","3","5","10"]},
    "scriptStyle":{"label":"剧本风格","type":"string","required":false,"visible":true}
  }'::jsonb,
  '{"episodeCount":1}'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://api.cumob.com',
    'requestPath', '/v1/chat/completions',
    'apiKeyEnv', 'CUMOB_API_KEY',
    'requestFormat', 'cumob_chat',
    'timeoutMs', 120000,
    'inputSchema', '{
      "source":{"provider":"Cumob chat completions","docUrl":"https://api.cumob.com/docs/api-chat","endpoint":"/v1/chat/completions"},
      "request":{"model":{"type":"string","required":true},"messages":{"type":"array","required":true},"temperature":{"type":"number","required":false,"minimum":0,"maximum":2},"max_tokens":{"type":"integer","required":false,"minimum":1},"stream":{"type":"boolean","required":false,"default":true},"response_format":{"type":"object","required":false}}
    }'::jsonb,
    'outputSchema', '{
      "source":{"provider":"Cumob chat completions","docUrl":"https://api.cumob.com/docs/api-chat"},
      "streamChunk":{"id":{"type":"string","required":false},"model":{"type":"string","required":false},"choices":{"type":"array","required":true},"usage":{"type":"object","required":false}}
    }'::jsonb
  ),
  '{"unit":"text","baseCredits":200,"billingMode":"fixed"}'::jsonb,
  '{"maxPromptLength":32000}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', '酷模智多星',
    'modelKind', 'text.script',
    'modelKindLabel', '剧本模型',
    'supportedModes', '["script"]'::jsonb,
    'providerDocUrl', 'https://api.cumob.com/docs/api-chat',
    'visible', true
  ),
  'active',
  sort_order,
  '酷模文本生成 API 模型，使用独立 cumob_chat 适配器与酷模智多星密钥。'
FROM cumob_text_models
ON CONFLICT (model_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_name = EXCLUDED.provider_name,
  provider_model = EXCLUDED.provider_model,
  provider_protocol = EXCLUDED.provider_protocol,
  invocation_mode = EXCLUDED.invocation_mode,
  media_type = EXCLUDED.media_type,
  task_modes_json = EXCLUDED.task_modes_json,
  capabilities_json = COALESCE(ai_model_configs.capabilities_json, '{}'::jsonb) || EXCLUDED.capabilities_json,
  parameter_schema_json = EXCLUDED.parameter_schema_json,
  default_params_json = COALESCE(ai_model_configs.default_params_json, '{}'::jsonb) || EXCLUDED.default_params_json,
  provider_config_json = COALESCE(ai_model_configs.provider_config_json, '{}'::jsonb) || EXCLUDED.provider_config_json,
  pricing_json = CASE WHEN COALESCE(ai_model_configs.pricing_json, '{}'::jsonb) = '{}'::jsonb THEN EXCLUDED.pricing_json ELSE ai_model_configs.pricing_json END,
  limits_json = COALESCE(ai_model_configs.limits_json, '{}'::jsonb) || EXCLUDED.limits_json,
  ui_config_json = COALESCE(ai_model_configs.ui_config_json, '{}'::jsonb) || EXCLUDED.ui_config_json,
  sort_order = EXCLUDED.sort_order,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id, model_config_id, submit_queue_name, poll_queue_name,
  provider_rpm_limit, provider_concurrent_limit, submit_concurrency_limit,
  polling_interval_ms, polling_concurrency_limit, status
)
SELECT
  gen_random_uuid(), model.id, 'generation-submit-text', NULL,
  60, 5, 5, 15000, 20, model.status
FROM ai_model_configs model
WHERE model.model_code IN (
  'cumob-gpt-5-6-sol',
  'cumob-deepseek-v4-pro',
  'cumob-claude-opus-4-8'
)
ON CONFLICT (model_config_id) DO UPDATE SET
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  provider_rpm_limit = EXCLUDED.provider_rpm_limit,
  provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
  submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
  polling_interval_ms = EXCLUDED.polling_interval_ms,
  polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
  updated_at = now();
