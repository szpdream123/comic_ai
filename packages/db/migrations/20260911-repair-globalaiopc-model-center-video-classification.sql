WITH canonical_models AS (
  SELECT * FROM (VALUES
    (
      'seedance-2.5-c1',
      'seedance-2.5-c1',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb,
      '{"maxPromptLength":5000,"maxReferences":30,"maxReferenceVideos":10,"maxReferenceAudios":10,"minDurationSec":4,"maxDurationSec":30,"supportedRatios":["9:16","16:9","1:1"],"supportedResolutions":["720p","480p"]}'::jsonb,
      '{"label":"Seedance 2.5 C1","group":"客易云 Model Center","recommended":true,"visible":true,"pipeline":"video","modelKind":"video.reference","modelKindLabel":"参考生视频","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/zh/api-reference/model-center/video-gen/seedance-2.5-c1"}'::jsonb
    ),
    (
      'MiniMax-H3-c4',
      'MiniMax-H3-c4',
      '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_guided_video"]'::jsonb,
      '{"maxReferences":5,"maxReferenceAudios":3,"minDurationSec":5,"maxDurationSec":15,"supportedRatios":["16:9","9:16"],"supportedResolutions":["1440P"]}'::jsonb,
      '{"label":"MiniMax H3 C4","group":"客易云 Model Center","recommended":true,"visible":true,"pipeline":"video","modelKind":"video.reference","modelKindLabel":"参考生视频","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/zh/api-reference/model-center/video-gen/minimax-h3-c4"}'::jsonb
    )
  ) AS rows(model_code, provider_model, task_modes, limits, ui_config)
)
UPDATE ai_model_configs AS model
SET provider_name = 'GlobalAiOpc',
    provider_model = canonical.provider_model,
    provider_protocol = 'globalaiopc_video',
    invocation_mode = 'async_polling',
    media_type = 'video',
    task_modes_json = canonical.task_modes,
    capabilities_json = '{"prompt":true,"asyncPolling":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"voice":false}'::jsonb,
    provider_config_json = '{"baseURL":"https://zcbservice.aizfw.cn/kyyReactApiServer","createTaskEndpoint":"/v2/model-center/tasks","queryTaskEndpoint":"/v2/model-center/tasks/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"globalaiopc_model_center_video"}'::jsonb,
    pricing_json = COALESCE(model.pricing_json, '{}'::jsonb) || '{"unit":"video"}'::jsonb,
    limits_json = canonical.limits,
    ui_config_json = (
      COALESCE(model.ui_config_json, '{}'::jsonb)
      - 'pipeline'
      - 'modelKind'
      - 'modelKindLabel'
      - 'videoCategory'
      - 'videoCategoryLabel'
      - 'supportedModes'
    ) || canonical.ui_config,
    remark = '客易云 Model Center 异步视频模型；平台默认积分仅为可配置保守值，不代表供应商货币报价。',
    updated_at = now()
FROM canonical_models AS canonical
WHERE model.model_code = canonical.model_code;

INSERT INTO ai_model_dispatch_policies (
  id, model_config_id, queue_backend, submit_queue_name, poll_queue_name,
  finalize_queue_name, dead_letter_queue_name, job_id_template,
  bullmq_job_options_json, submit_concurrency_limit, provider_rpm_limit,
  provider_concurrent_limit, polling_interval_ms, polling_concurrency_limit,
  polling_backoff_json, retry_policy_json, circuit_breaker_json, status
)
SELECT
  gen_random_uuid(), model.id, 'bullmq', 'generation-submit-video', 'generation-poll-video',
  'generation-finalize-artifact', 'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000}}'::jsonb,
  5, 60, 5, 10000, 20,
  '{"strategy":"fixed","intervalMs":10000,"maxAttempts":360}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":360,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('seedance-2.5-c1', 'MiniMax-H3-c4')
ON CONFLICT (model_config_id) DO UPDATE SET
  queue_backend = EXCLUDED.queue_backend,
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  finalize_queue_name = EXCLUDED.finalize_queue_name,
  job_id_template = EXCLUDED.job_id_template,
  updated_at = now();
