ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev','openai_images','openai_compatible_chat','cumob_chat','modelflare_responses',
    'volcengine_ark_image','volcengine_ark_video','aliyun_bailian_video','aliyun_bailian_audio',
    'apimart_audio','globalaiopc_video','globalaiopc_sound_clone','lingdong_api','cumob_image',
    'global_ai_opc_image','extra_token_video','saier_video','banana_router','san_bao','custom_http'
  ));

WITH models AS (
  SELECT * FROM (VALUES
    (
      'seedance-2.5-c1', 'Seedance 2.5 C1', 'seedance-2.5-c1', 'globalaiopc_video', 'video',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb,
      '{"prompt":{"type":"string","required":true,"maxLength":5000},"aspectRatio":{"type":"enum","options":["9:16","16:9","1:1"]},"resolution":{"type":"enum","options":["720p","480p"]},"durationSec":{"type":"integer","minimum":4,"maximum":30},"referenceImages":{"type":"file[]","maximum":30},"referenceVideos":{"type":"file[]","maximum":10},"referenceAudio":{"type":"file[]","maximum":10},"firstFrame":{"type":"file"},"lastFrame":{"type":"file"}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"720p","durationSec":4}'::jsonb,
      '{"maxPromptLength":5000,"maxReferences":30,"maxReferenceVideos":10,"maxReferenceAudios":10,"minDurationSec":4,"maxDurationSec":30,"supportedRatios":["9:16","16:9","1:1"],"supportedResolutions":["720p","480p"]}'::jsonb,
      '{"label":"Seedance 2.5 C1","group":"客易云 Model Center","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/zh/api-reference/model-center/video-gen/seedance-2.5-c1"}'::jsonb,
      151
    ),
    (
      'MiniMax-H3-c4', 'MiniMax H3 C4', 'MiniMax-H3-c4', 'globalaiopc_video', 'video',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_guided_video"]'::jsonb,
      '{"prompt":{"type":"string","required":true},"aspectRatio":{"type":"enum","options":["16:9","9:16"]},"resolution":{"type":"enum","options":["1440P"]},"durationSec":{"type":"integer","minimum":5,"maximum":15},"referenceImages":{"type":"file[]","maximum":5},"referenceAudio":{"type":"file[]","maximum":3},"firstFrame":{"type":"file"},"lastFrame":{"type":"file"}}'::jsonb,
      '{"aspectRatio":"16:9","resolution":"1440P","durationSec":5}'::jsonb,
      '{"maxReferences":5,"maxReferenceAudios":3,"minDurationSec":5,"maxDurationSec":15,"supportedRatios":["16:9","9:16"],"supportedResolutions":["1440P"]}'::jsonb,
      '{"label":"MiniMax H3 C4","group":"客易云 Model Center","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/zh/api-reference/model-center/video-gen/minimax-h3-c4"}'::jsonb,
      152
    ),
    (
      'soundclone', 'SoundClone', 'soundCloningAudio', 'globalaiopc_sound_clone', 'audio',
      '["audio.text_to_speech"]'::jsonb,
      '{"voiceId":{"label":"声音模型 ID","type":"string","required":true},"soundVersion":{"type":"enum","options":["v1","v2"]},"language":{"type":"string"},"emotion":{"type":"enum","options":["happy","sad","angry","fearful","disgusted","surprised","neutral"]},"speed":{"type":"number","minimum":0.5,"maximum":2},"vol":{"type":"number","minimum":0.01,"maximum":10},"pitch":{"type":"integer","minimum":-12,"maximum":12},"subtitleEnable":{"type":"boolean"},"subtitleType":{"type":"enum","options":["word"]}}'::jsonb,
      '{"soundVersion":"v1","language":"auto","emotion":"neutral","speed":1,"vol":1,"pitch":0,"subtitleEnable":false}'::jsonb,
      '{"maxPromptLength":9999,"maxTextLength":9999}'::jsonb,
      '{"label":"SoundClone","group":"客易云声音克隆","recommended":true,"visible":true,"pipeline":"audio","supportedModes":["text_to_speech"],"providerDocUrl":"https://docs.globalaiopc.com/zh/api-reference/sound-clone/SoundClone/sound-clone-audio-create"}'::jsonb,
      153
    )
  ) AS rows(model_code, display_name, provider_model, provider_protocol, media_type, task_modes, parameter_schema, default_params, limits, ui_config, sort_order)
)
INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
)
SELECT
  gen_random_uuid(), model.model_code, model.display_name, 'GlobalAiOpc', model.provider_model,
  model.provider_protocol, 'async_polling', model.media_type, model.task_modes,
  jsonb_build_object('prompt', true, 'asyncPolling', true, 'referenceImages', model.media_type = 'video', 'referenceVideo', model.media_type = 'video', 'referenceAudio', model.media_type = 'video', 'voice', model.media_type = 'audio'),
  model.parameter_schema, model.default_params,
  CASE WHEN model.media_type = 'video' THEN jsonb_build_object(
    'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
    'createTaskEndpoint', '/v2/model-center/tasks',
    'queryTaskEndpoint', '/v2/model-center/tasks/{taskId}',
    'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
    'requestFormat', 'globalaiopc_model_center_video'
  ) ELSE jsonb_build_object(
    'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
    'createTaskEndpoint', '/v1/soundCloning/audios',
    'queryTaskEndpoint', '/v1/result/{taskId}',
    'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
    'requestFormat', 'globalaiopc_sound_clone_audio'
  ) END,
  COALESCE(existing.pricing_json, jsonb_build_object(
    'baseCredits', CASE WHEN model.media_type = 'video' THEN 150 ELSE 30 END,
    'unit', CASE WHEN model.media_type = 'video' THEN 'video' ELSE 'audio_task' END,
    'source', 'platform_configurable_conservative_default'
  )),
  model.limits, model.ui_config, COALESCE(existing.status, 'active'),
  COALESCE(existing.sort_order, model.sort_order),
  CASE WHEN model.media_type = 'video'
    THEN '客易云 Model Center 异步视频模型；平台默认积分仅为可配置保守值，不代表供应商货币报价。'
    ELSE '客易云 SoundClone 正式音频生成接口；voiceId 对应克隆试听结果中的 modelId。平台默认积分仅为可配置保守值。'
  END
FROM models AS model
LEFT JOIN ai_model_configs AS existing ON existing.model_code = model.model_code
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
  gen_random_uuid(), model.id, 'bullmq',
  CASE WHEN model.media_type = 'audio' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'audio' THEN 'generation-poll-audio' ELSE 'generation-poll-video' END,
  'generation-finalize-artifact', 'generation-dead-letter',
  'generation:' || model.media_type || ':{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000}}'::jsonb,
  5, 60, 5, 10000, 20, '{"strategy":"fixed","intervalMs":10000,"maxAttempts":360}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":360,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('seedance-2.5-c1', 'MiniMax-H3-c4', 'soundclone')
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
