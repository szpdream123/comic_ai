-- Add the GlobalAiOpc Model Center wan3.0-r2v reference-to-video model.
-- Keep the model disabled until an administrator sets pricing and enables it.
WITH config AS (
  SELECT
    'wan3.0-r2v'::text AS model_code,
    'Wan3.0 参考生视频'::text AS display_name,
    'wan3.0-r2v'::text AS provider_model,
    '["video.reference_image_to_video"]'::jsonb AS task_modes_json,
    '{"prompt":true,"referenceImages":true,"referenceVideos":true,"referenceAudios":true,"audio":true,"asyncPolling":true,"modelFamily":"wan3.0-r2v"}'::jsonb AS capabilities_json,
    '{"prompt":{"label":"提示词","type":"string","required":true,"minLength":1,"maxLength":2500},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":10},"referenceVideos":{"label":"参考视频","type":"file[]","required":false,"maximum":5},"referenceAudios":{"label":"参考音频","type":"file[]","required":false,"maximum":5},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":3,"maximum":30},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480P","720P","1080P"]}}'::jsonb AS parameter_schema_json,
    '{"aspectRatio":"16:9","resolution":"480P","durationSec":5}'::jsonb AS default_params_json,
    '{"unit":"video","baseCredits":0}'::jsonb AS pricing_json,
    '{"maxPromptLength":2500,"maxReferences":10,"maxReferenceVideos":5,"maxReferenceAudios":5,"supportsReferenceImages":true,"supportsReferenceVideos":true,"supportsReferenceAudios":true,"minDurationSec":3,"maxDurationSec":30,"supportedRatios":["16:9","9:16"],"supportedResolutions":["480P","720P","1080P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav","audio/mp4"]}'::jsonb AS limits_json,
    '{"label":"Wan3.0 参考生视频","group":"GlobalAiOpc Wan3.0","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["reference","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/model-center/video-gen/wan3.0-r2v","parameterDisplayLanguage":"zh-CN"}'::jsonb AS ui_config_json,
    602::integer AS sort_order,
    'GlobalAiOpc Wan3.0 参考生视频，Model Center 异步视频接口，默认禁用。'::text AS remark
)
INSERT INTO ai_model_configs (
    id, model_code, display_name, provider_name, provider_model, provider_protocol,
    invocation_mode, media_type, task_modes_json, capabilities_json, parameter_schema_json,
    default_params_json, provider_config_json, pricing_json, limits_json, ui_config_json,
    status, sort_order, remark
)
SELECT
    gen_random_uuid(),
    config.model_code,
    config.display_name,
    'GlobalAiOpc',
    config.provider_model,
    'globalaiopc_video',
    'async_polling',
    'video',
    config.task_modes_json,
    config.capabilities_json,
    config.parameter_schema_json,
    config.default_params_json,
    jsonb_build_object(
      'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
      'createTaskEndpoint', '/v2/model-center/tasks',
      'queryTaskEndpoint', '/v2/model-center/tasks/{taskId}',
      'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
      'requestFormat', 'globalaiopc_model_center_video',
      'timeoutMs', 120000
    ),
    config.pricing_json,
    config.limits_json,
    config.ui_config_json,
    'disabled',
    config.sort_order,
  config.remark
FROM config
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
  sort_order = EXCLUDED.sort_order,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id, model_config_id, queue_backend, submit_queue_name, poll_queue_name,
  finalize_queue_name, dead_letter_queue_name, job_id_template,
  bullmq_job_options_json, submit_concurrency_limit, provider_rpm_limit,
  provider_concurrent_limit, polling_interval_ms, polling_concurrency_limit,
  polling_backoff_json, retry_policy_json, circuit_breaker_json, status
)
SELECT
  gen_random_uuid(), model.id, 'bullmq', 'generation-submit-video', 'generation-poll-video',
  'generation-finalize-artifact', 'generation-dead-letter', 'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000}}'::jsonb,
  5, 60, 5, 10000, 20,
  '{"strategy":"fixed","intervalMs":10000,"maxAttempts":360}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":360,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code = 'wan3.0-r2v'
ON CONFLICT (model_config_id) DO UPDATE SET
  queue_backend = EXCLUDED.queue_backend,
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  finalize_queue_name = EXCLUDED.finalize_queue_name,
  dead_letter_queue_name = EXCLUDED.dead_letter_queue_name,
  job_id_template = EXCLUDED.job_id_template,
  bullmq_job_options_json = EXCLUDED.bullmq_job_options_json,
  polling_interval_ms = EXCLUDED.polling_interval_ms,
  polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
  polling_backoff_json = EXCLUDED.polling_backoff_json,
  retry_policy_json = EXCLUDED.retry_policy_json,
  circuit_breaker_json = EXCLUDED.circuit_breaker_json,
  status = EXCLUDED.status,
  updated_at = now();
