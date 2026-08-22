UPDATE ai_model_configs
SET status = 'active',
    provider_model = 'sd_2.5_discount_v1',
    parameter_schema_json = CASE
      WHEN jsonb_typeof(parameter_schema_json->'resolution') = 'object'
        THEN jsonb_set(
          parameter_schema_json,
          '{resolution,options}',
          '["480p","720p"]'::jsonb,
          false
        )
      ELSE parameter_schema_json
    END,
    default_params_json = jsonb_set(
      default_params_json,
      '{resolution}',
      '"720p"'::jsonb,
      true
    ),
    limits_json = jsonb_set(
      limits_json,
      '{supportedResolutions}',
      '["480p","720p"]'::jsonb,
      true
    ),
    provider_config_json = (
      COALESCE(provider_config_json, '{}'::jsonb)
      - 'requestPath'
      - 'endpoint'
    ) || '{"baseURL":"https://zcbservice.aizfw.cn/kyyReactApiServer","createTaskEndpoint":"/v2/model-center/tasks","queryTaskEndpoint":"/v2/model-center/tasks/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"globalaiopc_model_center_video"}'::jsonb,
    updated_at = now()
WHERE model_code = 'sd_2.5_special';
