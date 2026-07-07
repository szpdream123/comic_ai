ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'custom_http'
  ));

WITH cumob_configs AS (
  SELECT *
  FROM (VALUES
    (
      'cumob-gpt-image-2-pro',
      'GPT Image 2 Pro（Cumob）',
      'gpt-image-2-pro',
      120,
      8,
      true,
      'Cumob 图像生成 API 的 GPT Image 2 Pro 模型。按文档使用 /v1/images/generations，参数为 model、prompt、size、aspect_ratio、images、quality、negative_prompts、style、seed、stream、async。'
    ),
    (
      'cumob-gpt-image-2',
      'GPT Image 2（Cumob）',
      'gpt-image-2',
      90,
      9,
      false,
      'Cumob 图像生成 API 的 GPT Image 2 模型。按文档使用 /v1/images/generations，参数为 model、prompt、size、aspect_ratio、images、quality、negative_prompts、style、seed、stream、async。'
    )
  ) AS v(model_code, display_name, provider_model, base_credits, sort_order, recommended, remark)
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
  '酷模智多星',
  provider_model,
  'cumob_image',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":1024},
    "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":14},
    "aspectRatio":{"label":"图片比例","type":"enum","required":false,"options":["auto","1:1","3:2","2:3"],"enum":["auto","1:1","3:2","2:3"],"adminEditableOptions":true},
    "size":{"label":"图片尺寸","type":"enum","required":false,"options":["1K","2K","4K"],"enum":["1K","2K","4K"],"adminEditableOptions":true},
    "quality":{"label":"质量","type":"enum","required":false,"options":["auto","low","medium","high"],"enum":["auto","low","medium","high"],"adminEditableOptions":true},
    "negativePrompts":{"label":"反向提示词","type":"string","required":false,"maxLength":1024},
    "style":{"label":"风格","type":"enum","required":false,"options":["natural","vivid"],"enum":["natural","vivid"],"adminEditableOptions":true},
    "seed":{"label":"随机种子","type":"string","required":false},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":2}
  }'::jsonb,
  '{"size":"2K","quality":"auto","aspectRatio":"auto","count":1}'::jsonb,
  '{
    "baseURL":"https://api.cumob.com",
    "endpoint":"/v1/images/generations",
    "apiKeyEnv":"CUMOB_API_KEY",
    "requestFormat":"cumob_image",
    "timeoutMs":600000,
    "defaultRequestParams":{"stream":false,"async":false},
    "inputSchema":{
      "source":{"provider":"Cumob image generation","docUrl":"https://api.cumob.com/docs/api-image","endpoint":"/v1/images/generations"},
      "request":{"model":{"type":"string","required":true},"prompt":{"type":"string","required":true},"size":{"type":"string","required":false,"enum":["1K","2K","4K"]},"aspect_ratio":{"type":"string","required":false,"enum":["auto","1:1","3:2","2:3"]},"images":{"type":"array","required":false,"items":{"type":"string"}},"quality":{"type":"string","required":false,"enum":["auto","low","medium","high"]},"negative_prompts":{"type":"string","required":false},"style":{"type":"string","required":false,"enum":["natural","vivid"]},"seed":{"type":"string","required":false},"stream":{"type":"boolean","required":false},"async":{"type":"boolean","required":false}}
    },
    "outputSchema":{
      "source":{"provider":"Cumob image generation","docUrl":"https://api.cumob.com/docs/api-image"},
      "response":{"id":{"type":"string","required":false},"created":{"type":"integer","required":false},"progress":{"type":"integer","required":false},"status":{"type":"string","required":false},"data":{"type":"array","required":true,"items":{"url":{"type":"string","required":true},"revised_prompt":{"type":"string","required":false}}},"error":{"type":"string","required":false},"failure_reason":{"type":"string","required":false}}
    }
  }'::jsonb,
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'sizeMultipliers', '{"1K":1,"2K":1.5,"4K":2}'::jsonb,
    'qualityMultipliers', '{"auto":1,"low":0.8,"medium":1,"high":1.3}'::jsonb
  ),
  '{"maxPromptLength":1024,"promptLengthUnit":"characters","maxReferences":14,"maxCount":2,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', '酷模智多星',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'G',
    'modelKind', 'image.generation',
    'modelKindLabel', '图片生成',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', 'https://api.cumob.com/docs/api-image',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM cumob_configs
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
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2')
ON CONFLICT (model_config_id) DO UPDATE SET
  queue_backend = EXCLUDED.queue_backend,
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

UPDATE admin_secret_values
SET request_domain = 'https://api.cumob.com'
WHERE secret_key = 'CUMOB_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';
