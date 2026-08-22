UPDATE ai_model_configs AS model
SET display_name = 'Seedream 5.0',
    provider_name = 'GlobalAiOpc（壹嘉云）',
    provider_model = 'seedream-5.0',
    provider_protocol = 'global_ai_opc_image',
    invocation_mode = 'async_polling',
    media_type = 'image',
    task_modes_json = '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
    capabilities_json = COALESCE(model.capabilities_json, '{}'::jsonb) || '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true,"asyncPolling":true}'::jsonb,
    provider_config_json = (
      COALESCE(model.provider_config_json, '{}'::jsonb)
        - 'requestPath'
        - 'endpoint'
        - 'createTaskEndpoint'
        - 'queryTaskEndpoint'
        - 'requestFormat'
        - 'inputSchema'
        - 'outputSchema'
    ) || jsonb_build_object(
      'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
      'createTaskEndpoint', '/v2/model-center/tasks',
      'queryTaskEndpoint', '/v2/model-center/tasks/{taskId}',
      'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
      'requestFormat', 'global_ai_opc_model_center_seedream_image',
      'inputSchema', jsonb_build_object(
        'source', jsonb_build_object(
          'provider', 'GlobalAiOpc Model Center image generation',
          'docUrl', 'https://docs.globalaiopc.com/api-reference/model-center/image-gen/seedream-5.0',
          'endpoint', '/v2/model-center/tasks'
        )
      ),
      'outputSchema', jsonb_build_object(
        'source', jsonb_build_object(
          'provider', 'GlobalAiOpc Model Center image generation',
          'docUrl', 'https://docs.globalaiopc.com/api-reference/model-center/image-gen/seedream-5.0',
          'endpoint', '/v2/model-center/tasks/{taskId}'
        ),
        'response', '{"id":{"type":"string","required":true},"status":{"type":"string","required":true,"enum":["queued","processing","completed","failed"]},"result_url":{"type":"string","required":false},"image_url":{"type":"string","required":false},"amount":{"type":"number","required":false},"error":{"required":false}}'::jsonb
      )
    ),
    status = 'active',
    updated_at = now()
WHERE model.model_code = 'seedream-5.0';

UPDATE ai_model_configs
SET display_name = 'Seedream 5.0 Pro',
    updated_at = now()
WHERE model_code = 'global-ai-opc-nano-banana-pro';

UPDATE ai_model_dispatch_policies AS policy
SET poll_queue_name = 'generation-poll-image',
    finalize_queue_name = COALESCE(policy.finalize_queue_name, 'generation-finalize-artifact'),
    polling_interval_ms = CASE WHEN policy.polling_interval_ms > 0 THEN policy.polling_interval_ms ELSE 10000 END,
    polling_backoff_json = CASE
      WHEN policy.polling_backoff_json = '{}'::jsonb
        THEN '{"strategy":"fixed","intervalMs":10000,"maxAttempts":360}'::jsonb
      ELSE policy.polling_backoff_json
    END,
    status = 'active',
    updated_at = now()
FROM ai_model_configs AS model
WHERE policy.model_config_id = model.id
  AND model.model_code = 'seedream-5.0';
