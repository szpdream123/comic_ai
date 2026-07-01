WITH lingdong_current_image_models AS (
  SELECT *
  FROM (VALUES
    (
      'gpt-image-2',
      'gpt-image-2',
      0.06::numeric,
      6,
      '1024x1024',
      '["1024x1024","1040x832","720x1280","1280x720","1024x768","1008x672","832x1040","768x1024","672x1008","1344x576"]'::jsonb,
      210,
      '灵动图片模型，按 20260517 文档接入，默认禁用供后台单独编辑。'
    )
  ) AS v(model_code, display_name, base_credits, max_references, default_size, size_options_json, sort_order, remark)
)
UPDATE ai_model_configs AS model
SET display_name = source.display_name,
  provider_model = source.model_code,
  invocation_mode = 'sync',
  media_type = 'image',
  task_modes_json = '["image.generate","image.image_to_image","image.reference_generate"]'::jsonb,
  capabilities_json =
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'batch', true,
    'providerFamily', 'lingdong'
  ),
  parameter_schema_json =
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', source.max_references),
    'size', jsonb_build_object('label', '图片尺寸', 'type', 'enum', 'required', false, 'visible', true, 'options', source.size_options_json, 'adminEditableOptions', true),
    'count', jsonb_build_object('label', '数量', 'type', 'integer', 'required', false, 'minimum', 1, 'maximum', 4),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0),
    'responseFormat', jsonb_build_object('label', '响应格式', 'type', 'enum', 'required', false, 'options', '["url"]'::jsonb, 'adminEditableOptions', true)
  ),
  default_params_json =
  jsonb_build_object(
    'size', source.default_size,
    'count', 1,
    'responseFormat', 'url'
  ),
  provider_config_json =
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'image',
    'requestPath', '/v1/images/generations',
    'endpoint', '/v1/images/generations',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_image',
    'resultFormat', 'url',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
        'endpoint', 'POST https://www.lingdongapi.com/v1/images/generations'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false),
        'reference_images', jsonb_build_object('type', 'array', 'required', false),
        'image_url', jsonb_build_object('type', 'string', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false),
        'n', jsonb_build_object('type', 'integer', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models'
      ),
      'response', jsonb_build_object(
        'url', jsonb_build_object('type', 'string', 'required', false),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'data', jsonb_build_object('type', 'array', 'required', false)
      )
    )
  ),
  pricing_json =
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', source.base_credits
  ),
  limits_json =
  jsonb_build_object(
    'maxReferences', source.max_references,
    'maxCount', 4,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","image/avif"]'::jsonb
  ),
  ui_config_json =
  jsonb_build_object(
    'label', source.display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'image',
    'modelKind', 'image.reference_image',
    'modelKindLabel', '参考生图',
    'supportedModes', '["text_to_image","reference_image","image_to_image"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  status = 'disabled',
  sort_order = source.sort_order,
  remark = source.remark,
  updated_at = now()
FROM lingdong_current_image_models AS source
WHERE model.provider_name = 'lingdong'
  AND model.provider_protocol = 'lingdong_api'
  AND model.model_code = source.model_code;

WITH lingdong_current_video_models AS (
  SELECT *
  FROM (VALUES
    ('sora-2', 'sora-2', 0.80::numeric, 1, 0, 0, 4, 12, 4, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'first_frame', '首帧生视频', 242, 'Sora 2 视频生成，支持文本生成视频，也支持 1 张参考图。'),
    ('sd-2-1', 'sd-2-1', 5.00::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 220, 'Seedance 2.0 九参素材 480p，支持多图、多视频、多音频参考。'),
    ('sd-2-2', 'sd-2-2', 7.00::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 221, 'Seedance 2.0 九参素材 720p，支持多图、多视频、多音频参考。'),
    ('sd-2-3', 'sd-2-3', 3.30::numeric, 4, 3, 1, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 222, 'Seedance 2.0 快速版，支持文生视频、首帧图生视频和参考图生视频。'),
    ('sd-2-4', 'sd-2-4', 5.20::numeric, 4, 3, 0, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 223, 'Seedance 2.0 四图 720P，支持图片和视频参考。'),
    ('sd-2-7', 'sd-2-7', 7.25::numeric, 9, 0, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, 'reference', '全能参考生视频', 226, 'Seedance 2.0 官方满血 720p-930，支持多图片和音频参考。'),
    ('sd-2-11', 'sd-2-11', 5.00::numeric, 4, 3, 3, 4, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 230, 'Seedance 2.0 满血不卡人脸 720P，支持参考图、参考视频和音频。'),
    ('sd-2-17', 'sd-2-17', 4.99::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 231, 'Seedance 2.0 720p 稳定版，支持图片、视频、音频多素材参考。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, max_video_refs, max_audio_refs, duration_min, duration_max, duration_default, task_modes_json, supported_modes_json, video_category, video_category_label, sort_order, remark)
),
lingdong_current_video_models_without_conflicts AS (
  SELECT source.*
  FROM lingdong_current_video_models AS source
  LEFT JOIN ai_model_configs AS existing
    ON existing.model_code = source.model_code
  WHERE existing.id IS NULL
     OR (
      existing.provider_name = 'lingdong'
      AND existing.provider_protocol = 'lingdong_api'
    )
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
  'lingdong',
  model_code,
  'lingdong_api',
  'async_polling',
  'video',
  task_modes_json,
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', true,
    'firstFrame', max_image_refs > 0,
    'referenceImages', max_image_refs > 0,
    'referenceVideo', max_video_refs > 0,
    'referenceAudio', max_audio_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsAudio', max_audio_refs > 0,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_image_refs) END,
    'sourceVideo', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('label', '参考/源视频', 'type', 'file', 'required', false) END,
    'referenceAudio', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('label', '参考音频', 'type', 'file[]', 'required', false, 'maximum', max_audio_refs) END,
    'ratio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4","21:9","auto"]'::jsonb, 'adminEditableOptions', true),
    'aspectRatio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4"]'::jsonb, 'adminEditableOptions', true),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', CASE WHEN model_code = 'sora-2' THEN jsonb_build_object('label', '尺寸', 'type', 'enum', 'required', false, 'visible', true, 'options', '["large","small"]'::jsonb, 'adminEditableOptions', true) ELSE jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false) END,
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'visible', true, 'minimum', duration_min, 'maximum', duration_max),
    'resolution', CASE WHEN model_code = 'sd-2-7' THEN jsonb_build_object('label', '分辨率', 'type', 'enum', 'required', false, 'options', '["720p"]'::jsonb, 'adminEditableOptions', true) END,
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'ratio', CASE WHEN model_code = 'sora-2' THEN NULL ELSE '9:16' END,
    'durationSec', duration_default,
    'size', CASE WHEN model_code = 'sora-2' THEN 'large' END
  )),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/video/generations',
    'createTaskEndpoint', '/v1/video/generations',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/video/generations',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'GET https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_strip_nulls(jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'image_url', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'string', 'required', false) END,
        'reference_images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'videos', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'audios', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'duration', jsonb_build_object('type', 'integer', 'required', false),
        'ratio', jsonb_build_object('type', 'string', 'required', false),
        'aspect_ratio', jsonb_build_object('type', 'string', 'required', false),
        'orientation', jsonb_build_object('type', 'string', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false)
      ))
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models'
      ),
      'queryResponse', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'required', false),
        'status', jsonb_build_object('type', 'string', 'required', true),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'url', jsonb_build_object('type', 'string', 'required', false),
        'video_url', jsonb_build_object('type', 'string', 'required', false),
        'result_url', jsonb_build_object('type', 'string', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'maxReferences', max_image_refs,
    'maxReferenceVideos', CASE WHEN max_video_refs > 0 THEN max_video_refs END,
    'maxReferenceAudios', CASE WHEN max_audio_refs > 0 THEN max_audio_refs END,
    'supportsFirstFrame', max_image_refs > 0,
    'supportsReferenceImages', max_image_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsReferenceAudio', max_audio_refs > 0,
    'allowedMimeTypes', CASE
      WHEN max_video_refs > 0 AND max_audio_refs > 0 THEN '["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]'::jsonb
      WHEN max_audio_refs > 0 THEN '["image/jpeg","image/png","image/webp","audio/mpeg","audio/wav"]'::jsonb
      WHEN max_video_refs > 0 THEN '["image/jpeg","image/png","image/webp","video/mp4"]'::jsonb
      ELSE '["image/jpeg","image/png","image/webp"]'::jsonb
    END
  )),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', video_category,
    'videoCategoryLabel', video_category_label,
    'modelKind', CASE WHEN video_category = 'first_frame' THEN 'video.first_frame' ELSE 'video.reference' END,
    'modelKindLabel', video_category_label,
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  sort_order,
  '灵动视频模型，按 20260517 文档接入，默认禁用供后台单独编辑。' || remark
FROM lingdong_current_video_models_without_conflicts
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

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
UPDATE ai_generation_task_snapshots
SET model_config_id = NULL,
    updated_at = now()
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
DELETE FROM ai_model_dispatch_policies
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
DELETE FROM ai_model_config_revisions
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

DELETE FROM ai_model_configs
WHERE provider_name = 'lingdong'
  AND provider_protocol = 'lingdong_api'
  AND media_type IN ('image', 'video')
  AND model_code NOT IN (
    'gpt-image-2',
    'sora-2',
    'sd-2-1',
    'sd-2-2',
    'sd-2-3',
    'sd-2-4',
    'sd-2-7',
    'sd-2-11',
    'sd-2-17'
  );

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
  CASE WHEN model.media_type = 'image' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'video' THEN 'generation-poll-video' ELSE NULL END,
  CASE WHEN model.media_type = 'video' THEN 'generation-finalize-artifact' ELSE NULL END,
  'generation-dead-letter',
  CASE WHEN model.media_type = 'image' THEN 'generation:image:submit:{taskId}' ELSE 'generation:video:{stage}:{taskId}' END,
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  CASE WHEN model.media_type = 'video'
    THEN '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb
    ELSE '{"strategy":"none"}'::jsonb
  END,
  CASE WHEN model.media_type = 'video'
    THEN '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb
    ELSE '{"submitAttempts":3,"pollAttempts":0,"finalizeAttempts":3}'::jsonb
  END,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.provider_name = 'lingdong'
  AND model.provider_protocol = 'lingdong_api'
  AND model.model_code IN (
    'gpt-image-2',
    'sora-2',
    'sd-2-1',
    'sd-2-2',
    'sd-2-3',
    'sd-2-4',
    'sd-2-7',
    'sd-2-11',
    'sd-2-17'
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
