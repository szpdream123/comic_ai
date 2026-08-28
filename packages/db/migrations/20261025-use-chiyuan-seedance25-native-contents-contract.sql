UPDATE ai_model_configs
SET provider_config_json = provider_config_json || '{
      "requestPath": "/api/v3/contents/generations/tasks",
      "createTaskEndpoint": "/api/v3/contents/generations/tasks",
      "queryTaskEndpoint": "/api/v3/contents/generations/tasks/{taskId}"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'chiyuan-seedance-2.5-super-resolution'
  AND provider_protocol = 'chiyuan_video';
