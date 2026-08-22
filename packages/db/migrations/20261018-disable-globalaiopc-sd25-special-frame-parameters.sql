UPDATE ai_model_configs
SET parameter_schema_json = parameter_schema_json
  - 'firstFrame'
  - 'lastFrame',
    updated_at = now()
WHERE model_code = 'sd_2.5_special'
  AND provider_model = 'sd_2.5_special_v1';
