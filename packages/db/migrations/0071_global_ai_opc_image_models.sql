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
    'global_ai_opc_image',
    'custom_http'
  ));

WITH global_ai_opc_configs AS (
  SELECT *
  FROM (VALUES
    (
      'global-ai-opc-gpt-image-2',
      'GPT Image 2（GlobalAiOpc）',
      'gpt-image-2',
      '/v1/image2/images',
      'global_ai_opc_gpt_image2',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "quality":{"label":"画质档位","type":"enum","required":false,"options":["low","medium","high"],"enum":["low","medium","high"],"adminEditableOptions":true},
        "ratio":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","2:1","1:2","21:9","9:21"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","2:1","1:2","21:9","9:21"],"adminEditableOptions":true},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"精确尺寸","type":"enum","required":false,"options":["1024x1024","1536x1024","1024x1536","2048x2048","2048x1152","3840x2160","2160x3840"],"enum":["1024x1024","1536x1024","1024x1536","2048x2048","2048x1152","3840x2160","2160x3840"],"adminEditableOptions":true}
      }'::jsonb,
      '{"quality":"low","resolution":"1k","ratio":"1:1"}'::jsonb,
      90,
      7,
      true,
      'https://docs.globalaiopc.com/api-reference/image/gpt-image2/gpt-image2-create',
      'GlobalAiOpc GPT Image 2 图片模型。创建任务使用 /v1/image2/images；size 与 resolution/ratio 二选一，传 size 时以 size 为准。'
    ),
    (
      'global-ai-opc-nano-banana-2',
      'Nano Banana 2（GlobalAiOpc）',
      'nano-banana-2',
      '/v1/banana/images',
      'global_ai_opc_banana_image',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"adminEditableOptions":true}
      }'::jsonb,
      '{"resolution":"1k","size":"1:1"}'::jsonb,
      100,
      8,
      true,
      'https://docs.globalaiopc.com/api-reference/image/nano-banana-create',
      'GlobalAiOpc Nano Banana 2 图片模型。创建任务使用 /v1/banana/images；文档中的 size 表示宽高比。'
    ),
    (
      'global-ai-opc-nano-banana-pro',
      'Nano Banana Pro（GlobalAiOpc）',
      'nano-banana-pro',
      '/v1/banana/images',
      'global_ai_opc_banana_image',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"adminEditableOptions":true}
      }'::jsonb,
      '{"resolution":"2k","size":"1:1"}'::jsonb,
      130,
      9,
      false,
      'https://docs.globalaiopc.com/api-reference/image/nano-banana-create',
      'GlobalAiOpc Nano Banana Pro 图片模型。创建任务使用 /v1/banana/images；支持 resolution 与 size（宽高比）参数。'
    )
  ) AS v(model_code, display_name, provider_model, endpoint, request_format, parameter_schema, default_params, base_credits, sort_order, recommended, doc_url, remark)
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
  'GlobalAiOpc（壹嘉云）',
  provider_model,
  'global_ai_opc_image',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  parameter_schema,
  default_params,
  jsonb_build_object(
    'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
    'requestPath', endpoint,
    'endpoint', endpoint,
    'createTaskEndpoint', endpoint,
    'queryTaskEndpoint', '/v1/result/{taskId}',
    'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
    'requestFormat', request_format,
    'timeoutMs', 120000,
    'pollIntervalMs', 2000,
    'maxPollAttempts', 180,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object('provider', 'GlobalAiOpc image generation', 'docUrl', doc_url, 'endpoint', endpoint)
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object('provider', 'GlobalAiOpc image generation', 'docUrl',
        CASE WHEN request_format = 'global_ai_opc_banana_image'
          THEN 'https://docs.globalaiopc.com/api-reference/image/nano-banana-query'
          ELSE 'https://docs.globalaiopc.com/api-reference/image/gpt-image2/gpt-image2-query'
        END),
      'response', '{"id":{"type":"string","required":true},"status":{"type":"string","required":true},"image_url":{"type":"string","required":false},"amount":{"type":"number","required":false},"error":{"type":"string","required":false}}'::jsonb
    )
  ),
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'resolutionCredits', jsonb_build_object(
      '1k', base_credits,
      '2k', ROUND(base_credits * 1.5),
      '4k', ROUND(base_credits * 2)
    )
  ),
  '{"maxPromptLength":4000,"promptLengthUnit":"characters","maxReferences":6,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', 'GlobalAiOpc',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'image',
    'modelKind', 'image.generation',
    'modelKindLabel', '图片生成',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', doc_url,
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM global_ai_opc_configs
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
WHERE model.model_code IN ('global-ai-opc-gpt-image-2', 'global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro')
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
SET request_domain = 'https://zcbservice.aizfw.cn/kyyReactApiServer'
WHERE secret_key = 'GLOBAL_AI_OPC_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';
