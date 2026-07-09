UPDATE ai_model_configs
SET provider_config_json = provider_config_json
  || jsonb_build_object(
    'requestPath', '/v1/video/generations',
    'createTaskEndpoint', '/v1/video/generations',
    'queryTaskEndpoint', COALESCE(provider_config_json->>'queryTaskEndpoint', '/v1/video/generations/{taskId}')
  ),
  updated_at = now()
WHERE provider_protocol = 'lingdong_api'
  AND media_type = 'video';
