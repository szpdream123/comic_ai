UPDATE ai_model_configs
SET provider_name = 'deepseek',
    provider_model = 'deepseek-v4-pro',
    provider_protocol = 'openai_compatible_chat',
    invocation_mode = 'stream',
    media_type = 'text',
    task_modes_json = '["text.script"]'::jsonb,
    capabilities_json = COALESCE(NULLIF(capabilities_json, '{}'::jsonb), '{"input":["prompt","outline"],"output":["text","json"]}'::jsonb),
    provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
      'baseURL', 'https://api.deepseek.com',
      'requestPath', '/chat/completions',
      'apiKeyEnv', 'DEEPSEEK_API_KEY',
      'requestFormat', 'openai_compatible_chat',
      'timeoutMs', 120000,
      'inputSchema', COALESCE(provider_config_json->'inputSchema', '{
        "source": {
          "provider": "DeepSeek OpenAI-compatible Chat API",
          "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion",
          "endpoint": "/chat/completions"
        },
        "request": {
          "model": { "type": "string", "required": true, "example": "deepseek-v4-pro" },
          "messages": {
            "type": "array",
            "required": true,
            "items": {
              "role": { "type": "string", "enum": ["system","user","assistant"] },
              "content": { "type": "string", "required": true }
            }
          },
          "temperature": { "type": "number", "required": false, "minimum": 0, "maximum": 2 },
          "max_tokens": { "type": "integer", "required": false, "minimum": 1 },
          "stream": { "type": "boolean", "required": false, "default": true },
          "response_format": { "type": "object", "required": false }
        }
      }'::jsonb),
      'outputSchema', COALESCE(provider_config_json->'outputSchema', '{
        "source": {
          "provider": "DeepSeek OpenAI-compatible Chat API",
          "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion"
        },
        "streamChunk": {
          "id": { "type": "string", "required": false },
          "model": { "type": "string", "required": false },
          "choices": { "type": "array", "required": true },
          "usage": { "type": "object", "required": false }
        },
        "scriptResult": {
          "title": { "type": "string", "required": false },
          "summary": { "type": "string", "required": false },
          "episodes": { "type": "array", "required": false }
        }
      }'::jsonb)
    ),
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
      'modelKind', 'text.script',
      'modelKindLabel', '剧本模型',
      'supportedModes', '["script"]'::jsonb
    ),
    updated_at = now()
WHERE media_type = 'text'
  AND (
    model_code IN ('deepseek-script', 'deepseek_script', 'deepseek_novel_text')
    OR provider_name = 'deepseek'
    OR model_code LIKE 'deepseek%'
  );

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  submit_queue_name,
  poll_queue_name,
  provider_rpm_limit,
  provider_concurrent_limit,
  submit_concurrency_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'generation-submit-text',
  NULL,
  60,
  5,
  5,
  15000,
  20,
  model.status
FROM ai_model_configs model
WHERE model.media_type = 'text'
  AND (
    model.model_code IN ('deepseek-script', 'deepseek_script', 'deepseek_novel_text')
    OR model.provider_name = 'deepseek'
    OR model.model_code LIKE 'deepseek%'
  )
ON CONFLICT (model_config_id) DO UPDATE
SET submit_queue_name = EXCLUDED.submit_queue_name,
    poll_queue_name = EXCLUDED.poll_queue_name,
    provider_rpm_limit = EXCLUDED.provider_rpm_limit,
    provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
    submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
    polling_interval_ms = EXCLUDED.polling_interval_ms,
    polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
    updated_at = now();
