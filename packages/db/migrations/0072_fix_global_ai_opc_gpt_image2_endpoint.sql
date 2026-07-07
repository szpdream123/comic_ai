UPDATE ai_model_configs
SET provider_config_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          provider_config_json,
          '{requestPath}',
          '"/v1/image2/images"'::jsonb,
          true
        ),
        '{endpoint}',
        '"/v1/image2/images"'::jsonb,
        true
      ),
      '{createTaskEndpoint}',
      '"/v1/image2/images"'::jsonb,
      true
    ),
    updated_at = now()
WHERE model_code = 'global-ai-opc-gpt-image-2'
  AND (
    provider_config_json->>'requestPath' = '/v1/gpt-image2/images'
    OR provider_config_json->>'endpoint' = '/v1/gpt-image2/images'
    OR provider_config_json->>'createTaskEndpoint' = '/v1/gpt-image2/images'
  );
