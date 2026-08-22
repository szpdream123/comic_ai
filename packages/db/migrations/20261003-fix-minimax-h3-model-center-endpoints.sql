UPDATE ai_model_configs
SET provider_config_json = (
      COALESCE(provider_config_json, '{}'::jsonb)
      - 'requestPath'
      - 'endpoint'
    ) || '{"baseURL":"https://zcbservice.aizfw.cn/kyyReactApiServer","createTaskEndpoint":"/v2/model-center/tasks","queryTaskEndpoint":"/v2/model-center/tasks/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"globalaiopc_model_center_video"}'::jsonb,
    updated_at = now()
WHERE model_code = 'MiniMax-H3-768p';
