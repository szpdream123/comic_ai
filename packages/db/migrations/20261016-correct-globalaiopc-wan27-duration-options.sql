UPDATE ai_model_configs
SET parameter_schema_json = jsonb_set(
      parameter_schema_json,
      '{durationSec,options}',
      '["4","5","6","7","8","9","10","11","12","13","14","15"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'wan2.7-r2v';
