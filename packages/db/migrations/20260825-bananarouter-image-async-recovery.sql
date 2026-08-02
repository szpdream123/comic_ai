UPDATE ai_model_configs
SET invocation_mode = 'async_polling',
    capabilities_json = COALESCE(capabilities_json, '{}'::jsonb) || '{"asyncPolling":true}'::jsonb,
    provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || '{
      "requestPath":"/v1/images/generations/async",
      "endpoint":"/v1/images/generations/async",
      "createTaskEndpoint":"/v1/images/generations/async",
      "editEndpoint":"/v1/images/generations/async",
      "queryTaskEndpoint":"/v1/async-tasks/{taskId}",
      "resultFormat":"url"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'bananarouter-gpt-image-2'
  AND provider_protocol = 'banana_router'
  AND media_type = 'image';

UPDATE ai_model_dispatch_policies AS policy
SET poll_queue_name = 'generation-poll-image',
    updated_at = now()
FROM ai_model_configs AS model
WHERE policy.model_config_id = model.id
  AND model.model_code = 'bananarouter-gpt-image-2'
  AND model.provider_protocol = 'banana_router'
  AND model.media_type = 'image';
