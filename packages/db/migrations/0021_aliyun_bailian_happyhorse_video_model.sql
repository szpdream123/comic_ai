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
VALUES (
  gen_random_uuid(),
  'happyhorse-1.0-r2v',
  '快乐马1.0',
  'aliyun-bailian',
  'happyhorse-1.0-r2v',
  'aliyun_bailian_video',
  'async_polling',
  'video',
  '["video.image_to_video","video.reference_image_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true}'::jsonb,
  '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":800},"firstFrame":{"label":"参考图","type":"file","required":true},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":1},"aspectRatio":{"label":"视频比例","type":"enum","required":true,"options":["16:9","9:16"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720P"]},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":5,"maximum":5},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
  '{"aspectRatio":"16:9","resolution":"720P","durationSec":5,"watermark":false}'::jsonb,
  '{"baseURL":"https://dashscope.aliyuncs.com","createTaskEndpoint":"/api/v1/services/aigc/video-generation/video-synthesis","queryTaskEndpoint":"/api/v1/tasks/{taskId}","apiKeyEnv":"ALIYUNBAILIAN_API_KEY","requestFormat":"dashscope_video_synthesis","timeoutMs":120000}'::jsonb,
  '{"unit":"video","baseCredits":120}'::jsonb,
  '{"maxPromptLength":800,"maxReferences":1,"supportsFirstFrame":true,"supportsReferenceImages":true,"minDurationSec":5,"maxDurationSec":5,"supportedRatios":["16:9","9:16"],"supportedResolutions":["720P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
  '{"label":"快乐马1.0","group":"阿里云百炼","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"全能参考","supportedModes":["image_to_video","reference_image_to_video"],"providerDocUrl":"https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference","parameterDisplayLanguage":"zh-CN"}'::jsonb,
  'active',
  23,
  '阿里云百炼 HappyHorse 参考图角色一致性视频模型，使用 DashScope 异步视频合成接口。'
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
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code = 'happyhorse-1.0-r2v'
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
