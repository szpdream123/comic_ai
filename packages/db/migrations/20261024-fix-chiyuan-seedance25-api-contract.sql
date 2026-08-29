UPDATE ai_model_configs
SET provider_config_json = provider_config_json || '{
      "requestPath": "/v1/video/generations",
      "createTaskEndpoint": "/v1/video/generations",
      "queryTaskEndpoint": "/v1/video/generations/{taskId}"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
  AND provider_protocol = 'chiyuan_video';
