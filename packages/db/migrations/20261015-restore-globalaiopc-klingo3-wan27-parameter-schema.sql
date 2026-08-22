UPDATE ai_model_configs
SET parameter_schema_json = COALESCE(parameter_schema_json, '{}'::jsonb) ||
      CASE model_code
        WHEN 'kling-o3' THEN jsonb_build_object(
          'generateAudio', jsonb_build_object(
            'label', '生成音频', 'type', 'boolean', 'providerKey', 'generate_audio', 'required', false,
            'visible', true
          ),
          'referenceMode', jsonb_build_object(
            'label', '参考模式', 'type', 'enum', 'providerKey', 'reference_mode', 'required', false,
            'options', jsonb_build_array('image', 'frame'), 'visible', true
          )
        )
        WHEN 'wan2.7-r2v' THEN jsonb_build_object(
          'watermark', jsonb_build_object(
            'label', '水印', 'type', 'boolean', 'required', false, 'visible', true
          ),
          'durationSec', COALESCE(parameter_schema_json->'durationSec', '{}'::jsonb) ||
            jsonb_build_object('minimum', 4, 'maximum', 15, 'required', true, 'visible', true)
        )
        ELSE '{}'::jsonb
      END,
    default_params_json = COALESCE(default_params_json, '{}'::jsonb) ||
      CASE model_code
        WHEN 'kling-o3' THEN '{"generateAudio":false,"referenceMode":"image"}'::jsonb
        WHEN 'wan2.7-r2v' THEN '{"watermark":false}'::jsonb
        ELSE '{}'::jsonb
      END,
    updated_at = now()
WHERE model_code IN ('kling-o3', 'wan2.7-r2v');
