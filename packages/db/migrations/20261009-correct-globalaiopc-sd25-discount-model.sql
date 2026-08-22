UPDATE ai_model_configs
SET status = 'active',
    provider_model = 'sd_2.5_discount_v1',
    parameter_schema_json = CASE
      WHEN jsonb_typeof(parameter_schema_json->'resolution') = 'object'
        THEN jsonb_set(
          parameter_schema_json,
          '{resolution,options}',
          '["480p","720p"]'::jsonb,
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
      '["480p","720p"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'sd_2.5_special';
