INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
VALUES (
  gen_random_uuid(),
  'deepseek-script',
  'DeepSeek 剧本模型',
  'deepseek',
  'deepseek-v4-pro',
  'openai_compatible_chat',
  'stream',
  'text',
  '["text.script"]'::jsonb,
  '{"input":["prompt","outline"],"output":["text","json"]}'::jsonb,
  '{
    "scriptPrompt": { "label": "剧本需求", "type": "string", "required": true, "visible": true },
    "scriptGenre": { "label": "剧本题材", "type": "enum", "required": false, "visible": true, "options": ["都市","玄幻","科幻","悬疑","爱情","喜剧"] },
    "episodeCount": { "label": "集数", "type": "integer", "required": false, "visible": true, "options": ["1","3","5","10"] },
    "scriptStyle": { "label": "剧本风格", "type": "string", "required": false, "visible": true }
  }'::jsonb,
  '{"episodeCount":1}'::jsonb,
  '{
    "baseURL": "https://api.deepseek.com",
    "requestPath": "/chat/completions",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "requestFormat": "openai_compatible_chat",
    "timeoutMs": 120000,
    "inputSchema": {
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
        "response_format": { "type": "object", "required": false, "description": "Use json_object when the script pipeline expects structured JSON." }
      },
      "scriptConfig": {
        "scriptPrompt": { "type": "string", "required": true },
        "scriptGenre": { "type": "string", "required": false },
        "episodeCount": { "type": "integer", "required": false },
        "scriptStyle": { "type": "string", "required": false }
      }
    },
    "outputSchema": {
      "source": {
        "provider": "DeepSeek OpenAI-compatible Chat API",
        "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion"
      },
      "streamChunk": {
        "id": { "type": "string", "required": false },
        "model": { "type": "string", "required": false },
        "choices": {
          "type": "array",
          "required": true,
          "items": {
            "delta": {
              "type": "object",
              "properties": {
                "role": { "type": "string", "required": false },
                "content": { "type": "string", "required": false }
              }
            },
            "finish_reason": { "type": "string", "required": false }
          }
        },
        "usage": { "type": "object", "required": false }
      },
      "scriptResult": {
        "title": { "type": "string", "required": false },
        "summary": { "type": "string", "required": false },
        "episodes": {
          "type": "array",
          "required": false,
          "items": {
            "title": { "type": "string", "required": false },
            "content": { "type": "string", "required": true }
          }
        }
      }
    }
  }'::jsonb,
  '{"unit":"text","baseCredits":20}'::jsonb,
  '{"maxPromptLength":32000}'::jsonb,
  '{"modelKind":"text.script","modelKindLabel":"剧本模型","supportedModes":["script"]}'::jsonb,
  'disabled',
  130,
  '后台默认剧本模型配置，启用前请确认密钥引用和请求域名。'
)
ON CONFLICT (model_code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    provider_name = EXCLUDED.provider_name,
    provider_model = EXCLUDED.provider_model,
    provider_protocol = EXCLUDED.provider_protocol,
    invocation_mode = EXCLUDED.invocation_mode,
    media_type = EXCLUDED.media_type,
    task_modes_json = EXCLUDED.task_modes_json,
    capabilities_json = EXCLUDED.capabilities_json,
    parameter_schema_json = EXCLUDED.parameter_schema_json,
    default_params_json = EXCLUDED.default_params_json,
    provider_config_json = COALESCE(ai_model_configs.provider_config_json, '{}'::jsonb) || EXCLUDED.provider_config_json,
    pricing_json = COALESCE(ai_model_configs.pricing_json, '{}'::jsonb) || EXCLUDED.pricing_json,
    limits_json = COALESCE(ai_model_configs.limits_json, '{}'::jsonb) || EXCLUDED.limits_json,
    ui_config_json = COALESCE(ai_model_configs.ui_config_json, '{}'::jsonb) || EXCLUDED.ui_config_json,
    sort_order = EXCLUDED.sort_order,
    remark = EXCLUDED.remark,
    updated_at = now();

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
  'disabled'
FROM ai_model_configs model
WHERE model.model_code = 'deepseek-script'
ON CONFLICT (model_config_id) DO UPDATE
SET submit_queue_name = EXCLUDED.submit_queue_name,
    poll_queue_name = EXCLUDED.poll_queue_name,
    provider_rpm_limit = EXCLUDED.provider_rpm_limit,
    provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
    submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
    polling_interval_ms = EXCLUDED.polling_interval_ms,
    polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
    updated_at = now();
