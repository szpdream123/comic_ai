ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check_chiyuan;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check_chiyuan CHECK (provider_protocol IN (
    'creator_dev','openai_images','openai_compatible_chat','cumob_chat','modelflare_responses',
    'volcengine_ark_image','volcengine_ark_video','aliyun_bailian_video','aliyun_bailian_audio',
    'apimart_audio','globalaiopc_video','globalaiopc_sound_clone','lingdong_api','cumob_image',
    'global_ai_opc_image','extra_token_video','saier_video','banana_router','san_bao','chiyuan_video',
    'custom_http'
  )) NOT VALID;

ALTER TABLE ai_model_configs
  VALIDATE CONSTRAINT ai_model_configs_provider_protocol_check_chiyuan;

ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  RENAME CONSTRAINT ai_model_configs_provider_protocol_check_chiyuan
  TO ai_model_configs_provider_protocol_check;

WITH configs AS (
  SELECT *
  FROM (VALUES
    (
      '7c000000-0000-4000-8000-000000000001'::uuid,
      'chiyuan-seedance-2.0-mini',
      'Seedance 2.0 Mini（驰源官方兼容）',
      'doubao-seedance-2-0-mini-260615',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video"]'::jsonb,
      '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"generateAudio":true,"asyncPolling":true}'::jsonb,
      '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"]},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"watermark":{"label":"添加水印","type":"boolean","required":false},"seed":{"label":"随机种子","type":"integer","required":false}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"720p","durationSec":5,"generateAudio":false,"watermark":false}'::jsonb,
      '{"baseURL":"https://cy.apistudio.cc","requestPath":"/api/v3/contents/generations/tasks","createTaskEndpoint":"/api/v3/contents/generations/tasks","queryTaskEndpoint":"/api/v3/contents/generations/tasks/{taskId}","apiKeyEnv":"ChiYuan_API_KEY","requestFormat":"chiyuan_seedance_official"}'::jsonb,
      '{"maxPromptLength":2000,"maxReferences":4,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
      '{"label":"Seedance 2.0 Mini（驰源官方兼容）","group":"驰源 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://chiyuan86.com/docs/api/","parameterDisplayLanguage":"zh-CN"}'::jsonb,
      520,
      '驰源 Seedance 官方兼容视频接口。积分待管理员配置，默认禁用。'
    ),
    (
      '7c000000-0000-4000-8000-000000000002'::uuid,
      'chiyuan-seedance-2.5-super-resolution',
      'Seedance 2.5（驰源自动超分）',
      'doubao-seedance-2-5-260628',
      '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb,
      '{"prompt":true,"firstFrame":true,"referenceImages":true,"asyncPolling":true}'::jsonb,
      '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p","2k","4k"]},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":30},"watermark":{"label":"添加水印","type":"boolean","required":false},"seed":{"label":"随机种子","type":"integer","required":false}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"1080p","durationSec":5,"watermark":false}'::jsonb,
      '{"baseURL":"https://cy.apistudio.cc","requestPath":"/v1/videos","createTaskEndpoint":"/v1/videos","queryTaskEndpoint":"/v1/videos/{taskId}","apiKeyEnv":"ChiYuan_API_KEY","requestFormat":"chiyuan_seedance_super_resolution"}'::jsonb,
      '{"maxPromptLength":2000,"maxReferences":4,"minDurationSec":4,"maxDurationSec":30,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p","2k","4k"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
      '{"label":"Seedance 2.5（驰源自动超分）","group":"驰源 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","reference_image_to_video"],"providerDocUrl":"https://chiyuan86.com/docs/api/","parameterDisplayLanguage":"zh-CN"}'::jsonb,
      521,
      '驰源 Seedance 自动超分视频接口。积分待管理员配置，默认禁用。'
    )
  ) AS rows(
    id, model_code, display_name, provider_model, task_modes_json, capabilities_json,
    parameter_schema_json, default_params_json, provider_config_json, limits_json,
    ui_config_json, sort_order, remark
  )
)
INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
)
SELECT
  id, model_code, display_name, 'ChiYuan', provider_model, 'chiyuan_video',
  'async_polling', 'video', task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json,
  '{"unit":"video","baseCredits":0,"billingMode":"fixed"}'::jsonb,
  limits_json, ui_config_json, 'disabled', sort_order, remark
FROM configs
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
  policy.id::uuid,
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
  30000,
  20,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM (VALUES
  ('chiyuan-seedance-2.0-mini', '7d000000-0000-4000-8000-000000000001'),
  ('chiyuan-seedance-2.5-super-resolution', '7d000000-0000-4000-8000-000000000002')
) AS policy(model_code, id)
JOIN ai_model_configs model ON model.model_code = policy.model_code
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
  updated_at = now();
