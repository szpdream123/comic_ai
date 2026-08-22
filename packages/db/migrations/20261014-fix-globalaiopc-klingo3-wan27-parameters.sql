UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) ||
      CASE model_code
        WHEN 'kling-o3' THEN jsonb_build_object(
          'defaultRequestParams', jsonb_build_object(
            'aspectRatio', '16:9',
            'resolution', '720p',
            'durationSec', 6,
            'generateAudio', false,
            'referenceMode', 'image'
          )
        )
        WHEN 'wan2.7-r2v' THEN jsonb_build_object(
          'defaultRequestParams', jsonb_build_object(
            'aspectRatio', '16:9',
            'resolution', '1080P',
            'durationSec', 5,
            'seed', 0,
            'watermark', false
          )
        )
        ELSE '{}'::jsonb
      END,
    updated_at = now()
WHERE model_code IN ('kling-o3', 'wan2.7-r2v');
