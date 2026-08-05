ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev','openai_images','openai_compatible_chat','cumob_chat','modelflare_responses',
    'volcengine_ark_image','volcengine_ark_video','aliyun_bailian_video','aliyun_bailian_audio',
    'apimart_audio','globalaiopc_video','lingdong_api','cumob_image','global_ai_opc_image',
    'extra_token_video','saier_video','banana_router','custom_http'
  ));

INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
  default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
  status, sort_order, remark
)
VALUES (
  gen_random_uuid(),
  'modelflare-gpt-5-6-sol',
  'GPT-5.6 Sol（ModelFlare）',
  'ModelFlare',
  'gpt-5.6-sol',
  'modelflare_responses',
  'stream',
  'text',
  '["text.script"]'::jsonb,
  '{"input":["prompt","image_url","input_file"],"output":["text","json"],"stream":true}'::jsonb,
  '{"scriptPrompt":{"label":"提示词","type":"string","required":true,"visible":true}}'::jsonb,
  '{}'::jsonb,
  '{
    "baseURL":"https://modelflare.dev/v1",
    "requestPath":"/responses",
    "apiKeyEnv":"MODELFLARE_API_KEY",
    "requestFormat":"responses",
    "timeoutMs":120000
  }'::jsonb,
  '{"unit":"text","baseCredits":200,"billingMode":"fixed"}'::jsonb,
  '{"maxPromptLength":32000}'::jsonb,
  '{
    "label":"GPT-5.6 Sol（ModelFlare）",
    "group":"ModelFlare",
    "modelKind":"text.script",
    "modelKindLabel":"文本模型",
    "supportedModes":["script"],
    "providerDocUrl":"https://origin.modelflare.dev/zh/docs/codex",
    "toolboxTools":["prompt-reverse"],
    "visible":true
  }'::jsonb,
  'active',
  134,
  'ModelFlare Responses API 模型。供应商未公开确认 MP4 输入能力，因此默认不启用视频 URL 输入。'
)
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
WHERE model.model_code = 'modelflare-gpt-5-6-sol'
ON CONFLICT (model_config_id) DO UPDATE SET
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  provider_rpm_limit = EXCLUDED.provider_rpm_limit,
  provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
  submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
  polling_interval_ms = EXCLUDED.polling_interval_ms,
  polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
  status = EXCLUDED.status,
  updated_at = now();
