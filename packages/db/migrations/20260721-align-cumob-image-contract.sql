UPDATE ai_model_configs
SET
  capabilities_json = jsonb_set(capabilities_json, '{batch}', 'false'::jsonb, true),
  parameter_schema_json = parameter_schema_json
    - 'negativePrompts'
    - 'style'
    - 'seed'
    - 'count',
  default_params_json = default_params_json - 'count',
  provider_config_json = jsonb_set(
    jsonb_set(
      provider_config_json,
      '{defaultRequestParams}',
      '{"stream":false,"async":false}'::jsonb,
      true
    ),
    '{inputSchema,request}',
    (
      (provider_config_json #> '{inputSchema,request}')
        - 'negative_prompts'
        - 'style'
        - 'seed'
    ) || '{"stream":{"type":"boolean","required":false,"const":false},"async":{"type":"boolean","required":false,"const":false}}'::jsonb,
    false
  ),
  limits_json = jsonb_set(limits_json, '{maxCount}', '1'::jsonb, true),
  remark = CASE provider_model
    WHEN 'gpt-image-2-pro' THEN 'Cumob 图像生成 API 的 GPT Image 2 Pro 模型。当前链路按官方文档使用 /v1/images/generations 的同步非流式模式，参数为 model、prompt、size、aspect_ratio、images、quality。'
    ELSE 'Cumob 图像生成 API 的 GPT Image 2 模型。当前链路按官方文档使用 /v1/images/generations 的同步非流式模式，参数为 model、prompt、size、aspect_ratio、images、quality。'
  END,
  updated_at = now()
WHERE model_code IN (
  'cumob-gpt-image-2-pro',
  'cumob-gpt-image-2-vip',
  'cumob-gpt-image-2'
);
