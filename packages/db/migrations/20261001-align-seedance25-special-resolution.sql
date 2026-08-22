UPDATE ai_model_configs
SET provider_model = 'sd_2.5_special',
    parameter_schema_json = CASE
      WHEN jsonb_typeof(parameter_schema_json->'resolution') = 'object'
        THEN jsonb_set(
          parameter_schema_json,
          '{resolution,options}',
          '["720p","1080p"]'::jsonb,
          false
        )
      ELSE parameter_schema_json
    END,
    default_params_json = jsonb_set(
      default_params_json,
      '{resolution}',
      '"720p"'::jsonb,
      true
    ),
    limits_json = jsonb_set(
      limits_json,
      '{supportedResolutions}',
      '["720p","1080p"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'seedance-2.5-c1';
