SELECT model.id
FROM ai_model_configs model
WHERE model.provider_protocol = 'banana_router'
  AND model.media_type = 'image'
FOR UPDATE;

SELECT policy.id
FROM ai_model_dispatch_policies policy
JOIN ai_model_configs model ON model.id = policy.model_config_id
WHERE model.provider_protocol = 'banana_router'
  AND model.media_type = 'image'
FOR UPDATE OF policy;

UPDATE ai_model_configs
SET invocation_mode = 'async_polling',
    capabilities_json = COALESCE(capabilities_json, '{}'::jsonb) || '{"asyncPolling":true}'::jsonb,
    provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || '{
      "baseURL":"https://api.bananarouter.com",
      "requestPath":"/v1/images/generations/async",
      "endpoint":"/v1/images/generations/async",
      "createTaskEndpoint":"/v1/images/generations/async",
      "editEndpoint":"/v1/images/edits/async",
      "queryTaskEndpoint":"/v1/async-tasks/{taskId}",
      "requestFormat":"banana_router_openai_images",
      "resultFormat":"url"
    }'::jsonb,
    updated_at = now()
WHERE provider_protocol = 'banana_router'
  AND media_type = 'image';

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  submit_queue_name,
  poll_queue_name,
  updated_at
)
SELECT
  gen_random_uuid(),
  model.id,
  'generation-submit-image',
  'generation-poll-image',
  now()
FROM ai_model_configs model
WHERE model.provider_protocol = 'banana_router'
  AND model.media_type = 'image'
ON CONFLICT (model_config_id)
DO UPDATE SET
  poll_queue_name = EXCLUDED.poll_queue_name,
  updated_at = EXCLUDED.updated_at;
