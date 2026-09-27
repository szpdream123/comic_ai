-- The published GlobalAiOpc wan3.0-r2v contract specifies a required prompt
-- with minimum length 1, but no maximum. Verified 2026-09-27:
-- https://docs.globalaiopc.com/api-reference/model-center/video-gen/wan3.0-r2v
-- Remove only our legacy 2500 defaults; preserve other administrator limits,
-- every other model, and all pricing/status/reference constraints.
UPDATE ai_model_configs
SET parameter_schema_json = CASE
      WHEN parameter_schema_json #>> '{prompt,maxLength}' = '2500'
      THEN parameter_schema_json #- '{prompt,maxLength}'
      ELSE parameter_schema_json END,
    limits_json = CASE
      WHEN limits_json ->> 'maxPromptLength' = '2500'
      THEN limits_json - 'maxPromptLength'
      ELSE limits_json END,
    updated_at = now()
WHERE model_code = 'wan3.0-r2v'
  AND provider_model = 'wan3.0-r2v'
  AND provider_protocol = 'globalaiopc_video'
  AND (parameter_schema_json #>> '{prompt,maxLength}' = '2500'
    OR limits_json ->> 'maxPromptLength' = '2500');
