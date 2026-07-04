WITH seedance_configs AS (
  SELECT
    *
  FROM (
    VALUES
      (
        'doubao-seedance-2-0-mini-260615',
        'Seedance 2.0 Mini',
        '火山引擎',
        'doubao-seedance-2-0-mini-260615',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":70,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Mini","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        18,
        '火山 Ark 视频生成 2.0 mini 模型。按秒计费，支持 480p/720p、4-15 秒。'
      ),
      (
        'doubao-seedance-2-0-fast-260128',
        'Seedance 2.0 Fast',
        '火山引擎',
        'doubao-seedance-2-0-fast-260128',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":110,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Fast","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        19,
        '火山 Ark 视频生成 2.0 fast 模型。按秒计费，支持 480p/720p、4-15 秒。'
      ),
      (
        'doubao-seedance-2-0-260128',
        'Seedance 2.0',
        '火山引擎',
        'doubao-seedance-2-0-260128',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[4,5,10,15],"minimum":4,"maximum":15,"adminEditableOptions":true},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"generateAudio":{"label":"生成音频","type":"boolean","providerKey":"generate_audio","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","providerKey":"return_last_frame","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":4,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedDurations":[4,5,10,15],"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"Seedance 2.0","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["reference","reference_image_to_video","image_to_video","first_last_frame_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        20,
        '火山 Ark 视频生成 2.0 标准模型。按秒计费，支持 720p/1080p、4-15 秒与参考图。'
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
  jsonb_strip_nulls(jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', 'Extra Token',
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000,
    'inputSchema', CASE
      WHEN seedance_configs.model_code = 'doubao-seedance-2-0-260128' THEN '{
        "source": {
          "provider": "Volcengine Ark Seedance video generation",
          "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh",
          "endpoint": "/api/v3/contents/generations/tasks"
        },
        "createTaskRequest": {
          "model": { "type": "string", "required": true },
          "content": {
            "type": "array",
            "required": true,
            "items": {
              "type": { "type": "string", "enum": ["text","image_url","video_url","audio_url"] },
              "role": { "type": "string", "required": false, "enum": ["first_frame","last_frame","reference_image","reference_video","reference_audio"] }
            }
          },
          "ratio": { "type": "string", "required": false, "enum": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] },
          "resolution": { "type": "string", "required": false, "enum": ["720p","1080p"] },
          "duration": { "type": "integer", "required": false, "enum": [4,5,10,15] },
          "seed": { "type": "integer", "required": false, "minimum": 0 },
          "generate_audio": { "type": "boolean", "required": false },
          "return_last_frame": { "type": "boolean", "required": false },
          "watermark": { "type": "boolean", "required": false, "default": false }
        }
      }'::jsonb
      ELSE NULL
    END,
    'outputSchema', CASE
      WHEN seedance_configs.model_code = 'doubao-seedance-2-0-260128' THEN '{
        "source": {
          "provider": "Volcengine Ark Seedance video generation",
          "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh"
        },
        "createTaskResponse": {
          "id": { "type": "string", "required": false },
          "task_id": { "type": "string", "required": false },
          "data": { "type": "object", "required": false }
        },
        "queryTaskResponse": {
          "id": { "type": "string", "required": false },
          "task_id": { "type": "string", "required": false },
          "status": { "type": "string", "required": true },
          "video_url": { "type": "string", "required": false },
          "data": { "type": "object", "required": false }
        }
      }'::jsonb
      ELSE NULL
    END
  )),
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
WHERE model.model_code IN (
  'doubao-seedance-2-0-mini-260615',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-260128'
)
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
