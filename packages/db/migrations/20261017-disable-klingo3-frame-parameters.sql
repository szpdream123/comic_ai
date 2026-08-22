-- Kling O3 Model Center accepts reference images, not first/last-frame inputs.
UPDATE ai_model_configs
SET task_modes_json = COALESCE(task_modes_json, '[]'::jsonb) - 'video.first_last_frame_to_video',
    capabilities_json = COALESCE(capabilities_json, '{}'::jsonb)
      - 'firstFrame' - 'lastFrame',
    parameter_schema_json = COALESCE(parameter_schema_json, '{}'::jsonb)
      - 'firstFrame' - 'lastFrame',
    limits_json = COALESCE(limits_json, '{}'::jsonb) ||
      '{"supportsFirstFrame":false,"supportsLastFrame":false}'::jsonb,
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) ||
      '{"videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["reference","text_to_video","image_to_video","reference_image_to_video"]}'::jsonb,
    updated_at = now()
WHERE model_code = 'kling-o3';
