UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'image.text_to_image',
  'modelKindLabel', '文生图',
  'supportedModes', '["text_to_image"]'::jsonb
)
WHERE media_type = 'image'
  AND model_code IN ('gpt-image-2-cn');

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'image.reference_image',
  'modelKindLabel', '参考生图',
  'supportedModes', '["reference_image","multi_reference","image_to_image"]'::jsonb
)
WHERE media_type = 'image'
  AND (
    model_code IN ('gpt-image-2-reference-cn')
    OR model_code LIKE 'jimeng-%-image'
    OR model_code LIKE 'doubao-seedream-%'
  );

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.first_frame',
  'modelKindLabel', '首帧生视频',
  'videoCategory', 'first_frame',
  'videoCategoryLabel', '首帧生视频',
  'supportedModes', '["first_frame","image_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND (
    COALESCE(ui_config_json->>'videoCategory', '') = 'first_frame'
    OR COALESCE(ui_config_json->>'videoCategory', '') = ''
  )
  AND model_code <> 'happyhorse-1.0-r2v';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.first_last_frame',
  'modelKindLabel', '首尾帧生视频',
  'videoCategory', 'first_last_frame',
  'videoCategoryLabel', '首尾帧生视频',
  'supportedModes', '["first_last_frame","first_last_frame_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND COALESCE(ui_config_json->>'videoCategory', '') = 'first_last_frame';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.reference',
  'modelKindLabel', '参考生视频',
  'videoCategory', 'reference',
  'videoCategoryLabel', '参考生视频',
  'supportedModes', '["reference","reference_image_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND (
    COALESCE(ui_config_json->>'videoCategory', '') = 'reference'
    OR model_code = 'happyhorse-1.0-r2v'
  );
