-- Add GlobalAiOpc Model Center video models. New entries stay disabled until
-- an administrator explicitly enables them in the backend model console.
WITH configs AS (
  SELECT *
  FROM (VALUES
    (
      'kling-o3',
      'Kling O3 视频生成',
      'KlingO3',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video"]'::jsonb,
      '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"audio":true,"asyncPolling":true,"modelFamily":"kling-o3"}'::jsonb,
      '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2500},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":3},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":3,"maximum":15},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16","1:1"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"]},"generateAudio":{"label":"生成音频","type":"boolean","providerKey":"generate_audio","required":false},"referenceMode":{"label":"参考模式","type":"enum","providerKey":"reference_mode","required":false,"options":["image","frame"]}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"720p","durationSec":6,"generateAudio":false,"referenceMode":"image"}'::jsonb,
      '{"unit":"video","baseCredits":0}'::jsonb,
      '{"maxPromptLength":2500,"maxReferences":3,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"minDurationSec":3,"maxDurationSec":15,"supportedRatios":["16:9","9:16","1:1"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
      '{"label":"Kling O3 视频生成","group":"GlobalAiOpc Kling","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/model-center/video-gen/klingo3","parameterDisplayLanguage":"zh-CN"}'::jsonb,
      600,
      'GlobalAiOpc Kling O3，Model Center 异步视频接口，默认禁用。'
    ),
    (
      'wan2.7-r2v',
      'Wan2.7 参考生视频',
      'wan2.7-r2v',
      '["video.image_to_video","video.reference_image_to_video"]'::jsonb,
      '{"prompt":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"wan2.7"}'::jsonb,
      '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2500},"referenceImages":{"label":"参考图","type":"file[]","required":true,"minimum":1,"maximum":3},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16","1:1","4:3","3:4"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720P","1080P"]},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":true,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0,"maximum":2147483647},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"1080P","durationSec":5,"seed":0,"watermark":false}'::jsonb,
      '{"unit":"video","baseCredits":0}'::jsonb,
      '{"maxPromptLength":2500,"maxReferences":3,"requiresReferenceImages":true,"supportsReferenceImages":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["16:9","9:16","1:1","4:3","3:4"],"supportedResolutions":["720P","1080P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
      '{"label":"Wan2.7 参考生视频","group":"GlobalAiOpc Wan2.7","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/model-center/video-gen/wan2.7-r2v","parameterDisplayLanguage":"zh-CN"}'::jsonb,
      601,
      'GlobalAiOpc Wan2.7 参考生视频，Model Center 异步视频接口，默认禁用。'
    )
  ) AS v(model_code, display_name, provider_model, task_modes_json, capabilities_json, parameter_schema_json, default_params_json, pricing_json, limits_json, ui_config_json, sort_order, remark)
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
  COALESCE(existing.status, 'disabled'),
  config.sort_order,
  config.remark
FROM configs AS config
LEFT JOIN ai_model_configs AS existing ON existing.model_code = config.model_code
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
WHERE model.model_code IN ('kling-o3', 'wan2.7-r2v')
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
