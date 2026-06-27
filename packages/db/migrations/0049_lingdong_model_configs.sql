WITH lingdong_image_models AS (
  SELECT *
  FROM (VALUES
    (
      'gpt-image-2',
      'gpt-image-2',
      0.06::numeric,
      6,
      '1024x1024',
      '["1024x1024","1040x832","720x1280","1280x720","1024x768","1008x672","832x1040","768x1024","672x1008","1344x576"]'::jsonb,
      '灵动图片模型，按文档接入，默认禁用供后台单独编辑。'
    ),
    (
      'gpt-image-2pro',
      'gpt-image-2pro',
      0.25::numeric,
      4,
      '2048x2048',
      '["2048x2048","2880x2880","2080x1664","3200x2560","1152x2048","2160x3840","2048x1152","3840x2160","2048x1536","3264x2448","2016x1344","3504x2336","1664x2080","2560x3200","1536x2048","2448x3264","1344x2016","2336x3504","2016x864","3696x1584"]'::jsonb,
      '灵动高质量图片模型，按文档接入，默认禁用供后台单独编辑。'
    )
  ) AS v(model_code, display_name, base_credits, max_references, default_size, size_options_json, remark)
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
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.reference_generate"]'::jsonb,
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'batch', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_references),
    'size', jsonb_build_object('label', '图片尺寸', 'type', 'enum', 'required', false, 'options', size_options_json, 'adminEditableOptions', true),
    'count', jsonb_build_object('label', '数量', 'type', 'integer', 'required', false, 'minimum', 1, 'maximum', 4),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0),
    'responseFormat', jsonb_build_object('label', '响应格式', 'type', 'enum', 'required', false, 'options', '["url"]'::jsonb, 'adminEditableOptions', true)
  ),
  jsonb_build_object(
    'size', default_size,
    'count', 1,
    'responseFormat', 'url'
  ),
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
        'reference_images', jsonb_build_object('type', 'array', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false)
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
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits
  ),
  jsonb_build_object(
    'maxReferences', max_references,
    'maxCount', 4,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","image/avif"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'image',
    'modelKind', CASE WHEN max_references > 0 THEN 'image.reference_image' ELSE 'image.text_to_image' END,
    'modelKindLabel', CASE WHEN max_references > 0 THEN '参考生图' ELSE '文生图' END,
    'supportedModes', '["text_to_image","reference_image","image_to_image"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'gpt-image-2' THEN 210
    ELSE 211
  END,
  remark
FROM lingdong_image_models
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

WITH lingdong_reference_video_models AS (
  SELECT *
  FROM (VALUES
    ('sd-2-1', 'sd-2-1', 5.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '九参素材 480p，支持多图、多视频、多音频参考。'),
    ('sd-2-2', 'sd-2-2', 7.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '九参素材 720p，支持多图、多视频、多音频参考。'),
    ('sd-2-fast', 'sd-2-fast', 3.30::numeric, 4, 3, 1, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 快速版，支持图、视频、音频综合参考。'),
    ('sd-2-4', 'sd-2-4', 5.20::numeric, 4, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '四参 720 版本，支持图片和视频参考。'),
    ('sd-2-5', 'sd-2-5', 4.75::numeric, 4, 3, 1, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '慢速 720p，支持图片、视频、音频参考。'),
    ('sd-2-6', 'sd-2-6', 6.05::numeric, 4, 1, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720p 稳定版，支持图像、音频和单视频参考。'),
    ('sd-2-7', 'sd-2-7', 7.25::numeric, 9, 0, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, '满血 720p-930，支持多图与音频参考。'),
    ('sd-2-8', 'sd-2-8', 8.13::numeric, 4, 1, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 1080p 稳定版，支持图片、音频和单视频参考。'),
    ('sd-2-9', 'sd-2-9', 8.50::numeric, 9, 0, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, '满血 720p，支持多图与音频参考。'),
    ('sd-2-10', 'sd-2-10', 5.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图、参考视频和音频。'),
    ('sd-2-11', 'sd-2-11', 5.00::numeric, 4, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图、参考视频和音频。'),
    ('sd-2-12', 'sd-2-12', 4.50::numeric, 4, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 720P，支持参考图、参考视频和音频。'),
    ('sd-2-13', 'sd-2-13', 2.50::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 480P，支持参考图和参考视频。'),
    ('sd-2-14', 'sd-2-14', 3.75::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图和参考视频。'),
    ('sd-2-15', 'sd-2-15', 2.00::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 480P，支持参考图和参考视频。'),
    ('sd-2-16', 'sd-2-16', 3.13::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 720P，支持参考图和参考视频。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, max_video_refs, max_audio_refs, task_modes_json, supported_modes_json, remark)
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
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'minimum', 4, 'maximum', 15),
    'resolution', jsonb_build_object('label', '分辨率', 'type', 'enum', 'required', false, 'options', '["480p","720p","1080p"]'::jsonb, 'adminEditableOptions', true),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  )),
  jsonb_build_object(
    'ratio', '9:16',
    'durationSec', 5
  ),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_strip_nulls(jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'videos', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'audios', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END
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
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]'::jsonb
  )),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '全能参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '全能参考生视频',
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'sd-2-1' THEN 220
    WHEN 'sd-2-2' THEN 221
    WHEN 'sd-2-fast' THEN 222
    WHEN 'sd-2-4' THEN 223
    WHEN 'sd-2-5' THEN 224
    WHEN 'sd-2-6' THEN 225
    WHEN 'sd-2-7' THEN 226
    WHEN 'sd-2-8' THEN 227
    WHEN 'sd-2-9' THEN 228
    WHEN 'sd-2-10' THEN 229
    WHEN 'sd-2-11' THEN 230
    WHEN 'sd-2-12' THEN 231
    WHEN 'sd-2-13' THEN 232
    WHEN 'sd-2-14' THEN 233
    WHEN 'sd-2-15' THEN 234
    ELSE 235
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_reference_video_models
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

WITH lingdong_first_frame_video_models AS (
  SELECT *
  FROM (VALUES
    ('omni_flash', 'omni_flash', 0.67::numeric, 5, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Omni Flash 图生视频。'),
    ('omni_flash_nowater', 'omni_flash_nowater', 0.80::numeric, 5, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Omni Flash 无水印图生视频。'),
    ('sora-2', 'sora-2', 0.80::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 文生视频，可选 1 张图片参考。'),
    ('sora-2-openai-12s', 'sora-2-openai-12s', 0.78::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 12 秒视频，可选图片参考。'),
    ('sora-2-openai-4s', 'sora-2-openai-4s', 0.29::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 4 秒视频，可选图片参考。'),
    ('sora-2-openai-8s', 'sora-2-openai-8s', 0.56::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 8 秒视频，可选图片参考。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, task_modes_json, supported_modes_json, remark)
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
  jsonb_build_object(
    'prompt', true,
    'firstFrame', true,
    'referenceImages', max_image_refs > 0,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_image_refs),
    'ratio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4"]'::jsonb, 'adminEditableOptions', true),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'minimum', 4, 'maximum', 12),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  ),
  jsonb_build_object(
    'ratio', '9:16'
  ),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false)
      )
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
  jsonb_build_object(
    'maxReferences', max_image_refs,
    'supportsFirstFrame', true,
    'supportsReferenceImages', true,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'first_frame',
    'videoCategoryLabel', '首帧生视频',
    'modelKind', 'video.first_frame',
    'modelKindLabel', '首帧生视频',
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'omni_flash' THEN 240
    WHEN 'omni_flash_nowater' THEN 241
    WHEN 'sora-2' THEN 242
    WHEN 'sora-2-openai-12s' THEN 243
    WHEN 'sora-2-openai-4s' THEN 244
    ELSE 245
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_first_frame_video_models
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

WITH lingdong_video_to_video_models AS (
  SELECT *
  FROM (VALUES
    ('omni_flash-v2v', 'omni_flash-v2v', 0.91::numeric, 'Omni Flash 视频参考生成。'),
    ('omni_flash_nowater-v2v', 'omni_flash_nowater-v2v', 1.04::numeric, 'Omni Flash 无水印视频参考生成。')
  ) AS v(model_code, display_name, base_credits, remark)
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
  '["video.video_to_video","video.image_video_to_video"]'::jsonb,
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'referenceVideo', true,
    'supportsSourceVideo', true,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false),
    'sourceVideo', jsonb_build_object('label', '参考/源视频', 'type', 'file', 'required', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  ),
  '{}'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'videos', jsonb_build_object('type', 'array', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false)
      )
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
  jsonb_build_object(
    'maxReferenceVideos', 1,
    'supportsReferenceImages', true,
    'supportsSourceVideo', true,
    'supportsImageAndVideoInput', true,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","video/mp4"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '全能参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '全能参考生视频',
    'supportedModes', '["reference","video_to_video","image_video_to_video"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'omni_flash-v2v' THEN 246
    ELSE 247
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_video_to_video_models
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
WHERE model.provider_protocol = 'lingdong_api'
  AND model.model_code IN (
    'gpt-image-2',
    'gpt-image-2pro',
    'sd-2-1',
    'sd-2-2',
    'sd-2-fast',
    'sd-2-4',
    'sd-2-5',
    'sd-2-6',
    'sd-2-7',
    'sd-2-8',
    'sd-2-9',
    'sd-2-10',
    'sd-2-11',
    'sd-2-12',
    'sd-2-13',
    'sd-2-14',
    'sd-2-15',
    'sd-2-16',
    'omni_flash',
    'omni_flash-v2v',
    'omni_flash_nowater',
    'omni_flash_nowater-v2v',
    'sora-2',
    'sora-2-openai-12s',
    'sora-2-openai-4s',
    'sora-2-openai-8s'
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
