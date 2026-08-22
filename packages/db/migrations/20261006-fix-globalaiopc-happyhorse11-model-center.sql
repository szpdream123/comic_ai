UPDATE ai_model_configs
SET provider_name = 'GlobalAiOpc',
    provider_model = 'happyhorse-1.1-r2v',
    provider_protocol = 'globalaiopc_video',
    invocation_mode = 'async_polling',
    media_type = 'video',
    provider_config_json = jsonb_build_object(
      'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
      'createTaskEndpoint', '/v2/model-center/tasks',
      'queryTaskEndpoint', '/v2/model-center/tasks/{taskId}',
      'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
      'requestFormat', 'globalaiopc_model_center_video'
    ),
    parameter_schema_json = jsonb_build_object(
      'prompt', jsonb_build_object('type', 'string', 'required', true, 'maxLength', 2500),
      'referenceImages', jsonb_build_object('type', 'file[]', 'required', true, 'minimum', 1, 'maximum', 9),
      'aspectRatio', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4', '9:21', '21:9')),
      'resolution', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('720P', '1080P')),
      'durationSec', jsonb_build_object('type', 'integer', 'minimum', 3, 'maximum', 15),
      'seed', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 2147483647),
      'watermark', jsonb_build_object('type', 'enum', 'options', jsonb_build_array('true', 'false'))
    ),
    default_params_json = jsonb_build_object('aspectRatio', '16:9', 'resolution', '1080P', 'durationSec', 5, 'seed', 0, 'watermark', 'false'),
    limits_json = jsonb_build_object(
      'maxPromptLength', 2500,
      'maxReferences', 9,
      'minDurationSec', 3,
      'maxDurationSec', 15,
      'supportedRatios', jsonb_build_array('16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4', '9:21', '21:9'),
      'supportedResolutions', jsonb_build_array('720P', '1080P')
    ),
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
      'label', 'HappyHorse 1.1 参考生视频',
      'group', 'GlobalAiOpc Model Center',
      'providerDocUrl', 'https://docs.globalaiopc.com/api-reference/model-center/video-gen/happyhorse-1.1-r2v',
      'pipeline', 'video',
      'modelKind', 'video.reference',
      'modelKindLabel', '参考生视频',
      'videoCategory', 'reference',
      'videoCategoryLabel', '参考生视频',
      'supportedModes', jsonb_build_array('image_to_video', 'reference_image_to_video')
    ),
    updated_at = now()
WHERE model_code = 'happyhorse-1.1-r2v';

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
WHERE model.model_code = 'happyhorse-1.1-r2v'
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
