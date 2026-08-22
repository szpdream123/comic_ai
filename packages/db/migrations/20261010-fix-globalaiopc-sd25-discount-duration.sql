UPDATE ai_model_configs
SET default_params_json = jsonb_set(
      default_params_json,
      '{durationSec}',
      '5'::jsonb,
      true
    ),
    parameter_schema_json = jsonb_set(
      parameter_schema_json,
      '{durationSec,options}',
      '[4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]'::jsonb,
      false
    ),
    updated_at = now()
WHERE model_code = 'sd_2.5_special';
