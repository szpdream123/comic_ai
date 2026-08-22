UPDATE ai_model_configs
SET status = 'active',
    provider_model = 'sd_2.5_special_v1',
    parameter_schema_json = CASE
      WHEN jsonb_typeof(parameter_schema_json->'resolution') = 'object'
        THEN jsonb_set(
          jsonb_set(
            parameter_schema_json,
            '{resolution,options}',
            '["720p","1080p"]'::jsonb,
            false
          ),
          '{durationSec,options}',
          '["4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30"]'::jsonb,
          false
        )
      ELSE parameter_schema_json
    END,
    default_params_json = jsonb_set(
      jsonb_set(default_params_json, '{resolution}', '"720p"'::jsonb, true),
      '{durationSec}',
      '5'::jsonb,
      true
    ),
    limits_json = jsonb_set(
      limits_json,
      '{supportedResolutions}',
      '["720p","1080p"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'sd_2.5_special';
