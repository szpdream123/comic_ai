WITH seed_reference_video_models AS (
  SELECT *
  FROM (VALUES
    ('doubao-seed-2-0-pro-260215', 'Doubao Seed 2.0 Pro', 'doubao-seed-2-0-pro-260215', 131, 35, true),
    ('doubao-seed-2-0-lite-260428', 'Doubao Seed 2.0 Lite', 'doubao-seed-2-0-lite-260428', 132, 18, false),
    ('doubao-seed-2-0-mini-260428', 'Doubao Seed 2.0 Mini', 'doubao-seed-2-0-mini-260428', 133, 8, false)
  ) AS v(model_code, display_name, provider_model, sort_order, base_credits, recommended)
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
  'volcengine',
  provider_model,
  'volcengine_ark_video',
  'async_polling',
  'video',
  '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
  '{
    "prompt": true,
    "firstFrame": true,
    "referenceImages": true,
    "referenceVideo": true,
    "referenceAudio": true,
    "audio": true,
    "asyncPolling": true,
    "modelFamily": "seed",
    "membershipPriorityEligible": true
  }'::jsonb,
  '{
    "prompt": { "label": "提示词", "type": "string", "required": true, "maxLength": 2000 },
    "firstFrame": { "label": "首帧图", "type": "file", "required": false },
    "referenceImages": { "label": "参考图", "type": "file[]", "required": false, "maximum": 4 },
    "sourceVideo": { "label": "参考视频", "type": "file", "required": false },
    "referenceAudio": { "label": "参考音频", "type": "file", "required": false },
    "aspectRatio": { "label": "视频比例", "type": "enum", "providerKey": "ratio", "required": false, "options": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"], "adminEditableOptions": true },
    "resolution": { "label": "分辨率", "type": "enum", "required": false, "options": ["480p","720p","1080p"], "adminEditableOptions": true },
    "durationSec": { "label": "视频时长", "type": "enum", "providerKey": "duration", "required": false, "options": [4,5,10,15], "minimum": 4, "maximum": 15, "adminEditableOptions": true },
    "seed": { "label": "随机种子", "type": "integer", "required": false, "minimum": 0 },
    "generateAudio": { "label": "生成音频", "type": "boolean", "providerKey": "generate_audio", "required": false },
    "returnLastFrame": { "label": "返回尾帧", "type": "boolean", "providerKey": "return_last_frame", "required": false },
    "watermark": { "label": "水印", "type": "boolean", "required": false }
  }'::jsonb,
  '{
    "aspectRatio": "adaptive",
    "resolution": "720p",
    "durationSec": 5,
    "generateAudio": true,
    "returnLastFrame": false,
    "watermark": false
  }'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', 'VOLCENGINE_ARK_API_KEY',
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000,
    'inputSchema', '{
      "source": {
        "provider": "Volcengine Ark video generation",
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
            "role": { "type": "string", "required": false, "enum": ["first_frame","reference_image","reference_video","reference_audio"] }
          }
        },
        "ratio": { "type": "string", "required": false, "enum": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] },
        "resolution": { "type": "string", "required": false, "enum": ["480p","720p","1080p"] },
        "duration": { "type": "integer", "required": false, "enum": [4,5,10,15] },
        "seed": { "type": "integer", "required": false, "minimum": 0 },
        "generate_audio": { "type": "boolean", "required": false },
        "return_last_frame": { "type": "boolean", "required": false },
        "watermark": { "type": "boolean", "required": false, "default": false }
      }
    }'::jsonb,
    'outputSchema', '{
      "source": {
        "provider": "Volcengine Ark video generation",
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
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits,
    'durationMultipliers', '{"4":0.9,"5":1,"10":1.8,"15":2.6}'::jsonb,
    'resolutionMultipliers', '{"480p":0.8,"720p":1,"1080p":1.35}'::jsonb
  ),
  '{
    "maxPromptLength": 2000,
    "maxReferences": 4,
    "supportsFirstFrame": true,
    "supportsReferenceImages": true,
    "supportsSourceVideo": true,
    "supportsReferenceAudio": true,
    "supportsAudio": true,
    "minDurationSec": 4,
    "maxDurationSec": 15,
    "supportedDurations": [4,5,10,15],
    "supportedRatios": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],
    "supportedResolutions": ["480p","720p","1080p"],
    "allowedMimeTypes": ["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]
  }'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', 'Volcengine Ark Seed',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '参考生视频',
    'supportedModes', '["reference","reference_image_to_video","image_to_video","video_to_video","image_video_to_video"]'::jsonb,
    'providerDocUrl', 'https://www.volcengine.com/docs/82379/1520757?lang=zh',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  'Volcengine Ark reference video generation model configured from the official Create Contents Generations Tasks API.'
FROM seed_reference_video_models
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

UPDATE ai_model_configs
SET provider_name = 'volcengine',
    provider_model = 'doubao-seedance-2-0-260128',
    provider_protocol = 'volcengine_ark_video',
    invocation_mode = 'async_polling',
    media_type = 'video',
    task_modes_json = '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
    capabilities_json = '{
      "prompt": true,
      "firstFrame": true,
      "lastFrame": true,
      "referenceImages": true,
      "referenceVideo": true,
      "referenceAudio": true,
      "audio": true,
      "asyncPolling": true,
      "modelFamily": "seedance",
      "membershipPriorityEligible": true
    }'::jsonb,
    parameter_schema_json = parameter_schema_json - 'cameraFixed',
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{
      "label": "Seedance 2.0",
      "group": "Volcengine Ark Seedance",
      "visible": true,
      "pipeline": "video",
      "videoCategory": "reference",
      "videoCategoryLabel": "参考生视频",
      "modelKind": "video.reference",
      "modelKindLabel": "参考生视频",
      "supportedModes": ["reference","reference_image_to_video","image_to_video","first_last_frame_to_video","video_to_video","image_video_to_video"],
      "providerDocUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh",
      "parameterDisplayLanguage": "zh-CN"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'Doubao-Seedance-2.0'
   OR provider_model = 'doubao-seedance-2-0-260128';

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
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260428',
  'doubao-seed-2-0-mini-260428'
)
   OR model.provider_model = 'doubao-seedance-2-0-260128'
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
