UPDATE ai_model_configs
SET provider_config_json = jsonb_set(
      provider_config_json,
      '{inputSchema,source,createEndpoint}',
      '"POST https://www.lingdongapi.com/v1/video/generations"'::jsonb,
      false
    ),
    updated_at = now()
WHERE model_code = 'cvk'
  AND provider_protocol = 'lingdong_api';
