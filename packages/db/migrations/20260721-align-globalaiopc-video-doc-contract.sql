UPDATE ai_model_configs
SET parameter_schema_json = CASE
      WHEN parameter_schema_json ? 'resolution'
        THEN jsonb_set(parameter_schema_json, '{resolution,options}', '["720p","1080p"]'::jsonb, false)
      ELSE parameter_schema_json
    END,
    limits_json = jsonb_set(
      jsonb_set(
        limits_json,
        '{supportedResolutions}',
        '["720p","1080p"]'::jsonb,
        true
      ),
      '{supportedRatios}',
      '["21:9","16:9","4:3","1:1","3:4","9:16"]'::jsonb,
      true
    ),
    pricing_json = CASE
      WHEN pricing_json->'resolutionMultipliers' IS NOT NULL
        THEN jsonb_set(
          pricing_json,
          '{resolutionMultipliers}',
          (pricing_json->'resolutionMultipliers') - '2k' - '4k',
          false
        )
      ELSE pricing_json
    END,
    updated_at = now()
WHERE model_code IN (
  'sd2_manxue',
  'sd2_manxue_fast',
  'sd2_manxue_video',
  'sd2_manxue_video_fast'
);

UPDATE ai_model_configs
SET parameter_schema_json = CASE
      WHEN parameter_schema_json ? 'ratio'
        THEN jsonb_set(
          parameter_schema_json,
          '{ratio,options}',
          '["21:9","16:9","4:3","1:1","3:4","9:16"]'::jsonb,
          false
        )
      WHEN parameter_schema_json ? 'aspectRatio'
        THEN jsonb_set(
          parameter_schema_json,
          '{aspectRatio,options}',
          '["21:9","16:9","4:3","1:1","3:4","9:16"]'::jsonb,
          false
        )
      ELSE parameter_schema_json
    END,
    default_params_json = CASE
      WHEN default_params_json->>'ratio' = 'auto'
        THEN jsonb_set(default_params_json, '{ratio}', '"16:9"'::jsonb, false)
      WHEN default_params_json->>'aspectRatio' = 'auto'
        THEN jsonb_set(default_params_json, '{aspectRatio}', '"16:9"'::jsonb, false)
      ELSE default_params_json
    END,
    updated_at = now()
WHERE model_code IN (
  'sd2_manxue',
  'sd2_manxue_fast',
  'sd2_manxue_video',
  'sd2_manxue_video_fast'
);
