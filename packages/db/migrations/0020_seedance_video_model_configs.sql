WITH seedance_configs AS (
  SELECT
    *
  FROM (
    VALUES
      (
        'Doubao-Seedance-2.0-fast',
        'Seedance 2.0 Fast',
        '火山引擎',
        'doubao-seedance-2-0-fast-260128',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":110,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Fast","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        20,
        '火山 Ark 视频生成 fast 模型。配置按官方 CreateContentsGenerationsTasks 文档，fast 不配置 1080p。'
      ),
      (
        'Doubao-Seedance-2.0',
        'Seedance 2.0',
        '火山引擎',
        'doubao-seedance-2-0-260128',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":4,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"Seedance 2.0","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_last_frame","videoCategoryLabel":"首尾帧","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        21,
        '火山 Ark 视频生成标准模型。支持多模态参考内容，后端会按 role 发送 first_frame、last_frame、reference_image、reference_video、reference_audio。'
      ),
      (
        'doubao-seedance-1-0-pro-250528',
        'Seedance 1.0 Pro',
        '火山引擎',
        'doubao-seedance-1-0-pro-250528',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"audio":false,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["16:9","9:16","1:1"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","required":false,"options":[5,10]},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5,"cameraFixed":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":180,"durationMultipliers":{"5":1,"10":1.8},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":5,"maxDurationSec":10,"supportedRatios":["16:9","9:16","1:1"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif"]}'::jsonb,
        '{"label":"Seedance 1.0 Pro","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        22,
        '保留旧版 Seedance 1.0 Pro。按文档示例配置 Ark 内容生成任务接口。'
      )
  ) AS v(model_code, display_name, provider_name, provider_model, task_modes_json, capabilities_json, parameter_schema_json, default_params_json, pricing_json, limits_json, ui_config_json, sort_order, remark)
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
  seedance_configs.model_code,
  seedance_configs.display_name,
  seedance_configs.provider_name,
  seedance_configs.provider_model,
  'volcengine_ark_video',
  'async_polling',
  'video',
  seedance_configs.task_modes_json,
  seedance_configs.capabilities_json,
  seedance_configs.parameter_schema_json,
  seedance_configs.default_params_json,
  jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', COALESCE(NULLIF(existing.provider_config_json->>'apiKeyEnv', ''), 'SEEDANCE_API_KEY'),
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000
  ),
  seedance_configs.pricing_json,
  seedance_configs.limits_json,
  seedance_configs.ui_config_json,
  'active',
  seedance_configs.sort_order,
  seedance_configs.remark
FROM seedance_configs
LEFT JOIN ai_model_configs AS existing
  ON existing.model_code = seedance_configs.model_code
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
WHERE model.model_code IN ('Doubao-Seedance-2.0-fast', 'Doubao-Seedance-2.0', 'doubao-seedance-1-0-pro-250528')
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
