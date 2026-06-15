UPDATE ai_model_configs
SET provider_config_json = jsonb_build_object(
      'baseURL', 'https://code.shoestravel.xin',
      'endpoint', '/v1/images/generations',
      'editEndpoint', '/v1/images/edits',
      'apiKeyEnv', 'GPT_IMAGE2_API_KEY',
      'resultFormat', 'b64_json',
      'requestFormat', 'openai_images',
      'timeoutMs', 600000
    ),
    task_modes_json = '["image.generate","image.edit","image.reference_generate"]'::jsonb,
    capabilities_json = COALESCE(capabilities_json, '{}'::jsonb)
      || '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
    limits_json = COALESCE(limits_json, '{}'::jsonb)
      || '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb)
      || jsonb_build_object(
        'providerDocUrl', 'https://code.shoestravel.xin/custom/a99e495b4c5372d7',
        'supportedModes', '["text_to_image","multi_reference","image_to_image"]'::jsonb
      ),
    updated_at = now()
WHERE model_code = 'gpt-image-2-cn';

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
) VALUES (
  '70000000-0000-4000-8000-000000000003',
  'gpt-image-2-reference-cn',
  'GPT Image 2 参考生图',
  'openai',
  'gpt-image-2',
  'openai_images',
  'sync',
  'image',
  '["image.edit","image.reference_generate","image.image_to_image"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
    "referenceImages":{"label":"参考图","type":"file[]","required":true,"minimum":1,"maximum":8},
    "aspectRatio":{"label":"图片比例","type":"enum","required":true,"enum":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"],"options":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"]},
    "quality":{"label":"清晰度","type":"enum","required":true,"enum":["standard","hd","2K"],"options":["standard","hd","2K"]},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":4}
  }'::jsonb,
  '{"quality":"2K","count":1,"aspectRatio":"9:16"}'::jsonb,
  '{"baseURL":"https://code.shoestravel.xin","endpoint":"/v1/images/generations","editEndpoint":"/v1/images/edits","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json","requestFormat":"openai_images","timeoutMs":600000}'::jsonb,
  '{"baseCredits":99,"unit":"image","qualityMultipliers":{"standard":1,"hd":1.2,"2K":1.5}}'::jsonb,
  '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  '{"label":"GPT Image 2 参考生图","group":"TravelToken","recommended":false,"visible":true,"pipeline":"G","supportedModes":["multi_reference","image_to_image"],"providerDocUrl":"https://code.shoestravel.xin/custom/a99e495b4c5372d7","parameterDisplayLanguage":"zh-CN"}'::jsonb,
  'active',
  11,
  'TravelToken OpenAI Images 兼容网关参考图生图配置。文本生图走 /v1/images/generations，带参考图时走 /v1/images/edits。'
)
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
  '71000000-0000-4000-8000-000000000003',
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  10,
  120,
  10,
  15000,
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code = 'gpt-image-2-reference-cn'
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
