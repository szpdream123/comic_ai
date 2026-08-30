-- Add the 客易云 Seedance 2.5 video_30_10_10 model by reusing the existing
-- Seedance 2.5 provider and dispatch chain. Provider contract source:
-- https://docs.globalaiopc.com/api-reference/model-center/video-gen/video_30_10_10
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ai_model_configs AS model
    JOIN ai_model_dispatch_policies AS policy ON policy.model_config_id = model.id
    WHERE model.model_code IN ('sd_2.5_special', 'seedance-2.5-c1')
       OR model.provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1')
  ) THEN
    RAISE EXCEPTION 'globalaiopc_video_30_10_10_source_policy_missing';
  END IF;
END;
$$;

WITH source_model AS (
  SELECT model.*
  FROM ai_model_configs AS model
  WHERE (
      model.model_code IN ('sd_2.5_special', 'seedance-2.5-c1')
      OR model.provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1')
    )
    AND EXISTS (
      SELECT 1
      FROM ai_model_dispatch_policies AS policy
      WHERE policy.model_config_id = model.id
    )
  ORDER BY CASE model.model_code
    WHEN 'sd_2.5_special' THEN 0
    WHEN 'seedance-2.5-c1' THEN 1
    ELSE 2
  END
  LIMIT 1
)
INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
)
SELECT
  gen_random_uuid(),
  'video_30_10_10',
  'Seedance 2.5（30图/10视频/10音频）',
  source.provider_name,
  'video_30_10_10',
  source.provider_protocol,
  source.invocation_mode,
  source.media_type,
  '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb,
  source.capabilities_json,
  '{"prompt":{"type":"string","required":true,"minLength":1,"maxLength":5000},"aspectRatio":{"type":"enum","options":["16:9","9:16","1:1","21:9","4:3","3:4"]},"resolution":{"type":"enum","required":true,"options":["720p"]},"durationSec":{"type":"integer","minimum":4,"maximum":30},"referenceImages":{"type":"file[]","maximum":30},"referenceVideos":{"type":"file[]","maximum":10},"referenceAudio":{"type":"file[]","maximum":10}}'::jsonb,
  '{"aspectRatio":"16:9","resolution":"720p","durationSec":5}'::jsonb,
  source.provider_config_json,
  source.pricing_json,
  '{"maxPromptLength":5000,"maxReferences":30,"maxReferenceVideos":10,"maxReferenceAudios":10,"minDurationSec":4,"maxDurationSec":30,"supportedRatios":["16:9","9:16","1:1","21:9","4:3","3:4"],"supportedResolutions":["720p"]}'::jsonb,
  source.ui_config_json || '{"label":"Seedance 2.5（30图/10视频/10音频）","recommended":false,"supportedModes":["text_to_video","image_to_video","reference_image_to_video","video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/model-center/video-gen/video_30_10_10"}'::jsonb,
  source.status,
  source.sort_order + 1,
  '客易云 Seedance 2.5 video_30_10_10；复用现有官方版 Model Center 异步接入链路。'
FROM source_model AS source
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

WITH source_policy AS (
  SELECT policy.*
  FROM ai_model_dispatch_policies AS policy
  JOIN ai_model_configs AS model ON model.id = policy.model_config_id
  WHERE model.model_code IN ('sd_2.5_special', 'seedance-2.5-c1')
     OR model.provider_model IN ('sd_2.5_special', 'sd_2.5_special_v1')
  ORDER BY CASE model.model_code
    WHEN 'sd_2.5_special' THEN 0
    WHEN 'seedance-2.5-c1' THEN 1
    ELSE 2
  END
  LIMIT 1
)
INSERT INTO ai_model_dispatch_policies (
  id, model_config_id, queue_backend, submit_queue_name, poll_queue_name,
  finalize_queue_name, dead_letter_queue_name, job_id_template,
  bullmq_job_options_json, submit_concurrency_limit, provider_rpm_limit,
  provider_concurrent_limit, polling_interval_ms, polling_concurrency_limit,
  polling_backoff_json, retry_policy_json, circuit_breaker_json, status
)
SELECT
  gen_random_uuid(), target.id, source.queue_backend, source.submit_queue_name,
  source.poll_queue_name, source.finalize_queue_name, source.dead_letter_queue_name,
  source.job_id_template, source.bullmq_job_options_json,
  source.submit_concurrency_limit, source.provider_rpm_limit,
  source.provider_concurrent_limit, source.polling_interval_ms,
  source.polling_concurrency_limit, source.polling_backoff_json,
  source.retry_policy_json, source.circuit_breaker_json, source.status
FROM source_policy AS source
JOIN ai_model_configs AS target ON target.model_code = 'video_30_10_10'
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ai_model_configs AS model
    JOIN ai_model_dispatch_policies AS policy ON policy.model_config_id = model.id
    WHERE model.model_code = 'video_30_10_10'
  ) THEN
    RAISE EXCEPTION 'globalaiopc_video_30_10_10_postcondition_failed';
  END IF;
END;
$$;
