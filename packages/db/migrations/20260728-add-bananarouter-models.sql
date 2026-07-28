ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_image',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'aliyun_bailian_audio',
    'apimart_audio',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'banana_router',
    'custom_http'
  ));

UPDATE ai_model_configs
SET model_code = 'bananarouter-gpt-image-2',
    updated_at = now()
WHERE id = '78000000-0000-4000-8000-00000000b001'
  AND model_code = 'gpt-image-2'
  AND provider_protocol = 'banana_router';

UPDATE ai_model_configs
SET model_code = CASE id
      WHEN '78000000-0000-4000-8000-00000000b002' THEN 'bananarouter-sora2'
      WHEN '78000000-0000-4000-8000-00000000b003' THEN 'bananarouter-seedance-2.0'
      WHEN '78000000-0000-4000-8000-00000000b004' THEN 'bananarouter-seedance-2.0-sp'
    END,
    updated_at = now()
WHERE provider_protocol = 'banana_router'
  AND (id, model_code) IN (
    ('78000000-0000-4000-8000-00000000b002', 'sora2'),
    ('78000000-0000-4000-8000-00000000b003', 'seedance-2.0'),
    ('78000000-0000-4000-8000-00000000b004', 'seedance-2.0-sp')
  );

INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
) VALUES
(
  '78000000-0000-4000-8000-00000000b001',
  'bananarouter-gpt-image-2',
  'GPT Image 2',
  'BananaRouter',
  'gpt-image-2',
  'banana_router',
  'sync',
  'image',
  '["image.generate","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEditing":true}'::jsonb,
  '{"size":{"type":"enum","options":["auto","1024x1024","1536x1024","1024x1536","2048x2048","2048x1152","3840x2160","2160x3840"]},"quality":{"type":"enum","options":["auto","low","medium","high"]}}'::jsonb,
  '{"size":"1024x1024","quality":"auto"}'::jsonb,
  '{"baseURL":"https://api.bananarouter.com","requestPath":"/v1/images/generations","endpoint":"/v1/images/generations","editEndpoint":"/v1/images/edits","apiKeyEnv":"BananaRouter_API_KEY","requestFormat":"banana_router_openai_images","resultFormat":"b64_json"}'::jsonb,
  '{"unit":"image","baseCredits":0,"billingMode":"fixed"}'::jsonb,
  '{"maxReferences":5}'::jsonb,
  '{"label":"GPT Image 2","group":"BananaRouter","visible":true,"supportedModes":["single-image","multi-image"],"providerDocUrl":"https://bananarouter.com/docs/gpt-image-2"}'::jsonb,
  'disabled',
  310,
  'BananaRouter 图片模型。定价未配置，默认禁用。'
),
(
  '78000000-0000-4000-8000-00000000b002',
  'bananarouter-sora2',
  'Sora2',
  'BananaRouter',
  'sora-2',
  'banana_router',
  'async_polling',
  'video',
  '["video.text_to_video","video.image_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"asyncPolling":true}'::jsonb,
  '{"size":{"type":"enum","options":["1280x720","720x1280"]},"durationSec":{"type":"enum","options":[4,8,12]}}'::jsonb,
  '{"size":"1280x720","durationSec":8}'::jsonb,
  '{"baseURL":"https://api.bananarouter.com","requestPath":"/v1/videos","createTaskEndpoint":"/v1/videos","queryTaskEndpoint":"/v1/videos/{taskId}","apiKeyEnv":"BananaRouter_API_KEY","requestFormat":"banana_router_sora_video"}'::jsonb,
  '{"unit":"video","baseCredits":0,"billingMode":"fixed"}'::jsonb,
  '{"maxReferences":1}'::jsonb,
  '{"label":"Sora2","group":"BananaRouter","visible":true,"videoCategory":"first_frame","videoCategoryLabel":"首帧视频","providerDocUrl":"https://bananarouter.com/docs/sora-2"}'::jsonb,
  'disabled',
  320,
  'BananaRouter Sora2 视频模型。定价未配置，默认禁用。'
),
(
  '78000000-0000-4000-8000-00000000b003',
  'bananarouter-seedance-2.0',
  'Seedance 2.0',
  'BananaRouter',
  'doubao-seedance-2.0',
  'banana_router',
  'async_polling',
  'video',
  '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"generateAudio":true,"asyncPolling":true}'::jsonb,
  '{"ratio":{"type":"enum","options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"]},"resolution":{"type":"enum","options":["480p","720p","1080p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"generateAudio":{"type":"boolean"},"watermark":{"type":"boolean"}}'::jsonb,
  '{"ratio":"adaptive","resolution":"720p","durationSec":5,"generateAudio":true,"watermark":false}'::jsonb,
  '{"baseURL":"https://api.bananarouter.com","requestPath":"/api/v3/contents/generations/tasks","createTaskEndpoint":"/api/v3/contents/generations/tasks","queryTaskEndpoint":"/api/v3/contents/generations/tasks/{taskId}","apiKeyEnv":"BananaRouter_API_KEY","requestFormat":"banana_router_seedance_video"}'::jsonb,
  '{"unit":"video","baseCredits":0,"billingMode":"fixed"}'::jsonb,
  '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3}'::jsonb,
  '{"label":"Seedance 2.0","group":"BananaRouter","visible":true,"videoCategory":"reference","videoCategoryLabel":"参考生视频","providerDocUrl":"https://bananarouter.com/docs/doubao-seedance-2-0"}'::jsonb,
  'disabled',
  330,
  'BananaRouter Seedance 2.0 多模态视频模型。定价未配置，默认禁用。'
),
(
  '78000000-0000-4000-8000-00000000b004',
  'bananarouter-seedance-2.0-sp',
  'Seedance 2.0 SP',
  'BananaRouter',
  'seedance-2.0',
  'banana_router',
  'async_polling',
  'video',
  '["video.text_to_video"]'::jsonb,
  '{"prompt":true,"asyncPolling":true}'::jsonb,
  '{"ratio":{"type":"enum","options":["9:16"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[4]}}'::jsonb,
  '{"ratio":"9:16","resolution":"720p","durationSec":4}'::jsonb,
  '{"baseURL":"https://api.bananarouter.com","requestPath":"/api/v3/contents/generations/tasks","createTaskEndpoint":"/api/v3/contents/generations/tasks","queryTaskEndpoint":"/api/v3/contents/generations/tasks/{taskId}","apiKeyEnv":"BananaRouter_API_KEY","requestFormat":"banana_router_seedance_video"}'::jsonb,
  '{"unit":"video","baseCredits":0,"billingMode":"fixed"}'::jsonb,
  '{}'::jsonb,
  '{"label":"Seedance 2.0 SP","group":"BananaRouter","visible":true,"videoCategory":"text","videoCategoryLabel":"文生视频","providerDocUrl":"https://bananarouter.com/docs/Seedance-2.0-SP"}'::jsonb,
  'disabled',
  340,
  'BananaRouter Seedance 2.0 SP 文生视频模型。定价未配置，默认禁用。'
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
  CASE WHEN model.media_type = 'image' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'video' THEN 'generation-poll-video' ELSE NULL END,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:' || model.media_type || ':{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  30000,
  20,
  '{"initialDelayMs":10000,"steps":[10000,20000,30000,60000],"jitterRatio":0.2}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":360,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM (
  VALUES
    ('bananarouter-gpt-image-2', '79000000-0000-4000-8000-00000000b001'),
    ('bananarouter-sora2', '79000000-0000-4000-8000-00000000b002'),
    ('bananarouter-seedance-2.0', '79000000-0000-4000-8000-00000000b003'),
    ('bananarouter-seedance-2.0-sp', '79000000-0000-4000-8000-00000000b004')
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
  status = EXCLUDED.status,
  updated_at = now();

CREATE INDEX IF NOT EXISTS credit_reservation_allocations_provider_request_idx
  ON credit_reservation_allocations (provider_request_id)
  WHERE provider_request_id IS NOT NULL;
