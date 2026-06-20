UPDATE ai_model_configs
SET provider_config_json = jsonb_build_object(
      'baseURL', 'https://image.shoestravel.xin',
      'requestPath', '/v1/images/edits',
      'endpoint', '/v1/images/edits',
      'editEndpoint', 'https://image.shoestravel.xin/v1/images/edits',
      'apiKeyEnv', 'GPT_IMAGE2_API_KEY',
      'resultFormat', 'b64_json',
      'requestFormat', 'openai_images',
      'contentType', 'multipart/form-data',
      'timeoutMs', 600000
    ),
    parameter_schema_json = '{
      "prompt": {"label": "提示词", "type": "string", "required": true, "maxLength": 4000},
      "referenceImages": {"label": "参考图", "type": "file[]", "required": true, "minimum": 1, "maximum": 4, "providerField": "image[]"},
      "n": {"label": "数量", "type": "integer", "required": false, "minimum": 1, "maximum": 1, "providerField": "n"},
      "size": {"label": "图片尺寸", "type": "enum", "required": false, "options": ["1024x1024", "1024x1536", "1536x1024"], "providerField": "size"},
      "quality": {"label": "质量", "type": "enum", "required": false, "options": ["high", "medium", "low"], "providerField": "quality"},
      "moderation": {"label": "审核", "type": "enum", "required": false, "options": ["auto"], "providerField": "moderation"}
    }'::jsonb,
    default_params_json = '{"n": 1, "size": "1024x1536", "quality": "high", "moderation": "auto"}'::jsonb,
    limits_json = COALESCE(limits_json, '{}'::jsonb)
      || '{"maxPromptLength":4000,"maxReferences":4,"maxCount":1,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
    remark = 'TravelToken OpenAI Images 兼容网关参考图生图配置。参考生图固定走 /v1/images/edits，multipart/form-data 使用 image[] 上传参考图。',
    updated_at = now()
WHERE model_code = 'gpt-image-2-reference-cn';

UPDATE admin_secret_values
SET request_domain = 'https://image.shoestravel.xin',
    provider_name = COALESCE(NULLIF(provider_name, ''), 'openai'),
    updated_at = now()
WHERE secret_key = 'GPT_IMAGE2_API_KEY';
