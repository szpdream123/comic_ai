ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'custom_http'
  ));

WITH jimeng_configs AS (
  SELECT *
  FROM (VALUES
    (
      'jimeng-5-image',
      '即梦 5.0 图片',
      'volcengine',
      'doubao-seedream-5-0-260128',
      110,
      11,
      true,
      '火山引擎即梦 5.0 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    ),
    (
      'jimeng-4-5-image',
      '即梦 4.5 图片',
      'volcengine',
      'doubao-seedream-4-5-251128',
      95,
      12,
      false,
      '火山引擎即梦 4.5 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    ),
    (
      'jimeng-4-0-image',
      '即梦 4.0 图片',
      'volcengine',
      'doubao-seedream-4-0',
      80,
      13,
      false,
      '火山引擎即梦 4.0 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    )
  ) AS v(model_code, display_name, provider_name, provider_model, base_credits, sort_order, recommended, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  provider_name,
  provider_model,
  'custom_http',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
    "negativePrompt":{"label":"反向提示词","type":"string","required":false,"maxLength":2000},
    "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":8},
    "editInstruction":{"label":"编辑说明","type":"string","required":false,"maxLength":2000},
    "aspectRatio":{"label":"图片比例","type":"enum","required":true,"options":["1:1","16:9","9:16","4:3","3:4"]},
    "quality":{"label":"清晰度","type":"enum","required":true,"options":["1K","2K","4K"]},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":4},
    "seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},
    "watermark":{"label":"水印","type":"boolean","required":false}
  }'::jsonb,
  '{"aspectRatio":"1:1","quality":"2K","count":1,"watermark":false}'::jsonb,
  '{"baseURL":"https://ark.cn-beijing.volces.com","endpoint":"/api/v3/images/generations","apiKeyEnv":"VOLCENGINE_ARK_API_KEY","requestFormat":"volcengine_ark_images_generation","timeoutMs":120000}'::jsonb,
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'qualityMultipliers', '{"1K":1,"2K":1.5,"4K":2}'::jsonb
  ),
  '{"maxPromptLength":4000,"promptLengthUnit":"characters","maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', '即梦',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'image',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', 'https://www.volcengine.com/docs/82379',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM jimeng_configs
ON CONFLICT (model_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_name = EXCLUDED.provider_name,
  provider_model = EXCLUDED.provider_model,
  provider_protocol = EXCLUDED.provider_protocol,
  invocation_mode = EXCLUDED.invocation_mode,
  media_type = EXCLUDED.media_type,
  task_modes_json = EXCLUDED.task_modes_json,
  capabilities_json = EXCLUDED.capabilities_json,
  parameter_schema_json = EXCLUDED.parameter_schema_json,
  default_params_json = EXCLUDED.default_params_json,
  provider_config_json = EXCLUDED.provider_config_json,
  pricing_json = EXCLUDED.pricing_json,
  limits_json = EXCLUDED.limits_json,
  ui_config_json = EXCLUDED.ui_config_json,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"none"}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":0,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
ON CONFLICT (model_config_id) DO UPDATE SET
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  finalize_queue_name = EXCLUDED.finalize_queue_name,
  dead_letter_queue_name = EXCLUDED.dead_letter_queue_name,
  job_id_template = EXCLUDED.job_id_template,
  bullmq_job_options_json = EXCLUDED.bullmq_job_options_json,
  submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
  provider_rpm_limit = EXCLUDED.provider_rpm_limit,
  provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
  polling_interval_ms = EXCLUDED.polling_interval_ms,
  polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
  polling_backoff_json = EXCLUDED.polling_backoff_json,
  retry_policy_json = EXCLUDED.retry_policy_json,
  circuit_breaker_json = EXCLUDED.circuit_breaker_json,
  status = EXCLUDED.status,
  updated_at = now();
