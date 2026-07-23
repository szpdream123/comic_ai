UPDATE ai_model_configs
SET provider_protocol = 'cumob_image',
    provider_config_json = (
      provider_config_json
        - 'requestPath'
        - 'createTaskEndpoint'
        - 'queryTaskEndpoint'
        - 'pollIntervalMs'
        - 'timeoutMs'
        - 'maxPollAttempts'
    ) || '{
      "baseURL":"https://api.cumob.com",
      "endpoint":"/v1/images/generations",
      "apiKeyEnv":"CUMOB_API_KEY",
      "requestFormat":"cumob_image",
      "defaultRequestParams":{"stream":false,"async":false}
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'cumob-gpt-image-2-pro'
  AND provider_protocol = 'custom_http';

UPDATE ai_model_configs
SET provider_config_json = (
      provider_config_json
        - 'requestPath'
        - 'endpoint'
        - 'timeoutMs'
        - 'maxPollAttempts'
    ) || '{
      "baseURL":"https://www.lingdongapi.com",
      "mediaType":"video",
      "createTaskEndpoint":"/v1/video/generations",
      "queryTaskEndpoint":"/v1/video/generations/{taskId}",
      "requestFormat":"lingdong_video"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'cvk'
  AND provider_protocol = 'lingdong_api';

UPDATE ai_model_configs
SET provider_config_json = provider_config_json
      - 'requestPath'
      - 'endpoint'
      - 'pollIntervalMs'
      - 'timeoutMs'
      - 'maxPollAttempts',
    updated_at = now()
WHERE provider_protocol = 'global_ai_opc_image';

DELETE FROM ai_model_dispatch_policies AS policy
USING ai_model_configs AS model
WHERE policy.model_config_id = model.id
  AND model.id IN (
    '860670ea-c713-4c4c-9040-37ce56c697f8'::uuid,
    '23882736-9141-458a-8635-bc3052ce7459'::uuid
  )
  AND model.provider_protocol = 'custom_http'
  AND model.model_code IN ('sd2_manxue_video', 'sd2_manxue_video_fast')
  AND NOT EXISTS (
    SELECT 1
    FROM ai_generation_task_snapshots AS snapshot
    WHERE snapshot.model_config_id = model.id
  );

DELETE FROM ai_model_configs AS model
WHERE model.id IN (
    '860670ea-c713-4c4c-9040-37ce56c697f8'::uuid,
    '23882736-9141-458a-8635-bc3052ce7459'::uuid
  )
  AND model.provider_protocol = 'custom_http'
  AND model.model_code IN ('sd2_manxue_video', 'sd2_manxue_video_fast')
  AND NOT EXISTS (
    SELECT 1
    FROM ai_generation_task_snapshots AS snapshot
    WHERE snapshot.model_config_id = model.id
  );
