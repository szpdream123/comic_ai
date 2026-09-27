-- Product policy requested by the platform owner: Wan 3.0 accepts at most
-- 5000 Unicode characters in the final composed prompt (including additions).
-- This is our platform limit, NOT a documented GlobalAiOpc provider maximum.
UPDATE ai_model_configs
SET parameter_schema_json = jsonb_set(parameter_schema_json, '{prompt}',
      coalesce(parameter_schema_json->'prompt', '{}'::jsonb)
        || '{"maxLength":5000,"limitUnit":"characters"}'::jsonb),
    limits_json = limits_json || '{"maxPromptLength":5000,"promptLengthUnit":"characters"}'::jsonb,
    updated_at = now()
WHERE model_code = 'wan3.0-r2v'
  AND provider_model = 'wan3.0-r2v'
  AND provider_protocol = 'globalaiopc_video'
  AND (parameter_schema_json #>> '{prompt,maxLength}' IS DISTINCT FROM '5000'
    OR parameter_schema_json #>> '{prompt,limitUnit}' IS DISTINCT FROM 'characters'
    OR limits_json ->> 'maxPromptLength' IS DISTINCT FROM '5000'
    OR limits_json ->> 'promptLengthUnit' IS DISTINCT FROM 'characters');
