WITH replacements AS (
  SELECT *
  FROM (VALUES
    (
      'global-ai-opc-nano-banana-2',
      'Seedream 5.0（GlobalAiOpc）',
      'seedream-5.0',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":10},
        "aspectRatio":{"label":"图片比例","type":"enum","required":false,"options":["1:1","3:4","4:3","16:9","9:16","3:2","2:3","21:9"],"enum":["1:1","3:4","4:3","16:9","9:16","3:2","2:3","21:9"],"adminEditableOptions":true},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["2K","3K","4K"],"enum":["2K","3K","4K"],"adminEditableOptions":true},
        "size":{"label":"精确尺寸","type":"string","required":false},
        "watermark":{"label":"添加水印","type":"boolean","required":false}
      }'::jsonb,
      '{"aspectRatio":"1:1","resolution":"2K","watermark":false}'::jsonb,
      'https://docs.globalaiopc.com/api-reference/model-center/image-gen/seedream-5.0',
      'GlobalAiOpc Seedream 5.0 图片模型。创建和查询任务使用 Model Center v2 异步接口。'
    ),
    (
      'global-ai-opc-nano-banana-pro',
      'Seedream 5.0 Pro（GlobalAiOpc）',
      'seedream_5.0Pro',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":10},
        "aspectRatio":{"label":"图片比例","type":"enum","required":false,"options":["1:1","3:4","4:3","16:9","9:16","3:2","2:3","21:9"],"enum":["1:1","3:4","4:3","16:9","9:16","3:2","2:3","21:9"],"adminEditableOptions":true},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1K","2K"],"enum":["1K","2K"],"adminEditableOptions":true},
        "watermark":{"label":"添加水印","type":"boolean","required":false}
      }'::jsonb,
      '{"aspectRatio":"1:1","resolution":"1K","watermark":false}'::jsonb,
      'https://docs.globalaiopc.com/api-reference/model-center/image-gen/seedream_5.0pro',
      'GlobalAiOpc Seedream 5.0 Pro 图片模型。创建和查询任务使用 Model Center v2 异步接口。'
    )
  ) AS rows(model_code, display_name, provider_model, parameter_schema, default_params, doc_url, remark)
)
UPDATE ai_model_configs AS model
SET display_name = replacement.display_name,
    provider_name = 'GlobalAiOpc（壹嘉云）',
    provider_model = replacement.provider_model,
    provider_protocol = 'global_ai_opc_image',
    invocation_mode = 'async_polling',
    media_type = 'image',
    task_modes_json = '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
    capabilities_json = COALESCE(model.capabilities_json, '{}'::jsonb) || '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true,"asyncPolling":true}'::jsonb,
    parameter_schema_json = replacement.parameter_schema,
    default_params_json = replacement.default_params,
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
          'docUrl', replacement.doc_url,
          'endpoint', '/v2/model-center/tasks'
        )
      ),
      'outputSchema', jsonb_build_object(
        'source', jsonb_build_object(
          'provider', 'GlobalAiOpc Model Center image generation',
          'docUrl', replacement.doc_url,
          'endpoint', '/v2/model-center/tasks/{taskId}'
        ),
        'response', '{"id":{"type":"string","required":true},"status":{"type":"string","required":true,"enum":["queued","processing","completed","failed"]},"result_url":{"type":"string","required":false},"image_url":{"type":"string","required":false},"amount":{"type":"number","required":false},"error":{"required":false}}'::jsonb
      )
    ),
    limits_json = COALESCE(model.limits_json, '{}'::jsonb) || '{"maxPromptLength":4000,"promptLengthUnit":"characters","maxReferences":10,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
    ui_config_json = COALESCE(model.ui_config_json, '{}'::jsonb) || jsonb_build_object(
      'label', replacement.display_name,
      'group', 'GlobalAiOpc',
      'pipeline', 'image',
      'modelKind', 'image.generation',
      'modelKindLabel', '图片生成',
      'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
      'providerDocUrl', replacement.doc_url,
      'parameterDisplayLanguage', 'zh-CN'
    ),
    remark = replacement.remark,
    updated_at = now()
FROM replacements AS replacement
WHERE model.model_code = replacement.model_code;

UPDATE ai_model_dispatch_policies AS policy
SET poll_queue_name = 'generation-poll-image',
    finalize_queue_name = COALESCE(policy.finalize_queue_name, 'generation-finalize-artifact'),
    polling_interval_ms = CASE WHEN policy.polling_interval_ms > 0 THEN policy.polling_interval_ms ELSE 10000 END,
    polling_backoff_json = CASE
      WHEN policy.polling_backoff_json = '{}'::jsonb
        THEN '{"strategy":"fixed","intervalMs":10000,"maxAttempts":360}'::jsonb
      ELSE policy.polling_backoff_json
    END,
    updated_at = now()
FROM ai_model_configs AS model
WHERE policy.model_config_id = model.id
  AND model.model_code IN ('global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro');
