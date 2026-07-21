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
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'custom_http'
  ));

INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
) VALUES (
  '70000000-0000-4000-8000-00000000a001',
  'cosyvoice-v1',
  'CosyVoice V1',
  'aliyun-bailian',
  'cosyvoice-v1',
  'aliyun_bailian_audio',
  'async_polling',
  'audio',
  '["audio.text_to_speech"]'::jsonb,
  '{"text":true,"voice":true,"asyncPolling":true}'::jsonb,
  '{"text":{"type":"string","required":true,"maxLength":50000},"voice":{"type":"string","required":false},"format":{"type":"enum","options":["mp3","wav","pcm","opus","ogg"]},"sampleRate":{"type":"enum","options":[8000,16000,22050,24000,48000]},"volume":{"type":"number","minimum":0.01,"maximum":10},"rate":{"type":"number","minimum":0.5,"maximum":2},"pitch":{"type":"number","minimum":-12,"maximum":12}}'::jsonb,
  '{"format":"mp3","sampleRate":24000,"volume":1,"rate":1,"pitch":0}'::jsonb,
  '{"baseURL":"https://dashscope.aliyuncs.com","createTaskEndpoint":"/api/v1/services/aigc/multimodal-generation/generation","queryTaskEndpoint":"/api/v1/tasks/{taskId}","apiKeyEnv":"ALIYUNBAILIAN_API_KEY","timeoutMs":120000}'::jsonb,
  '{"baseCredits":30,"unit":"audio_task","source":"platform_configurable_conservative_default"}'::jsonb,
  '{"maxPromptLength":50000,"maxTextLength":50000,"allowedFormats":["mp3","wav","pcm","opus","ogg"]}'::jsonb,
  '{"label":"CosyVoice V1","group":"阿里云百炼","recommended":true,"visible":true,"pipeline":"audio","supportedModes":["text_to_speech"]}'::jsonb,
  'active',
  30,
  '平台保守默认计费 30 积分/任务，可由管理员配置；不是供应商货币报价。只启用已真实透传的 text、voice、format、sampleRate、volume、rate、pitch。'
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
) VALUES (
  '71000000-0000-4000-8000-00000000a001',
  '70000000-0000-4000-8000-00000000a001',
  'bullmq',
  'generation-submit-image',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:audio:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  10,
  60,
  10,
  5000,
  40,
  '{"initialDelayMs":5000,"steps":[5000,15000,30000,60000],"jitterRatio":0.2}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":720,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
)
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
