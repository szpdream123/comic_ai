UPDATE ai_model_configs
SET display_name = 'GPT Image 2',
    provider_model = 'gpt-image2',
    parameter_schema_json = '{
      "aspectRatio":{"label":"画面比例","type":"enum","options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"]},
      "resolution":{"label":"清晰度","type":"enum","options":["普通","1K","2K","4K"]},
      "quality":{"label":"质量","type":"string","visible":false}
    }'::jsonb,
    default_params_json = '{"aspectRatio":"1:1","resolution":"普通","quality":"high"}'::jsonb,
    provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || '{
      "modelVariants":{
        "普通":"gpt-image2",
        "1K":"gpt-image2-1K",
        "2K":"gpt-image2-2K",
        "4K":"gpt-image2-4K"
      }
    }'::jsonb,
    pricing_json = ('{
      "unit":"image",
      "billingMode":"fixed",
      "baseCredits":90,
      "resolutionCredits":{"普通":90,"1K":110,"2K":130,"4K":130}
    }'::jsonb || COALESCE(pricing_json, '{}'::jsonb))
      || jsonb_build_object(
        'baseCredits',
        CASE
          WHEN jsonb_typeof(pricing_json -> 'baseCredits') = 'number'
            AND (pricing_json ->> 'baseCredits')::numeric > 0
            THEN pricing_json -> 'baseCredits'
          ELSE '90'::jsonb
        END,
        'resolutionCredits',
        '{"普通":90,"1K":110,"2K":130,"4K":130}'::jsonb
          || CASE
            WHEN jsonb_typeof(pricing_json -> 'resolutionCredits') = 'object'
              THEN pricing_json -> 'resolutionCredits'
            ELSE '{}'::jsonb
          END
      ),
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{"label":"GPT Image 2","group":"三宝影像","visible":true}'::jsonb,
    remark = '前台统一展示 GPT Image 2；后端按清晰度选择三宝实际模型，质量固定默认 high 且不展示。',
    updated_at = now()
WHERE model_code = 'sanbao-gpt-image2';

UPDATE ai_model_configs
SET status = 'disabled',
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{"visible":false}'::jsonb,
    remark = '历史兼容模型；前台已合并到 GPT Image 2，不再单独展示。',
    updated_at = now()
WHERE model_code IN (
  'sanbao-gpt-image2-1k',
  'sanbao-gpt-image2-2k',
  'sanbao-gpt-image2-4k'
);

UPDATE ai_model_dispatch_policies policy
SET status = CASE WHEN model.model_code = 'sanbao-gpt-image2' THEN 'active' ELSE 'disabled' END,
    updated_at = now()
FROM ai_model_configs model
WHERE policy.model_config_id = model.id
  AND model.model_code IN (
    'sanbao-gpt-image2',
    'sanbao-gpt-image2-1k',
    'sanbao-gpt-image2-2k',
    'sanbao-gpt-image2-4k'
  );

UPDATE ai_model_configs
SET status = 'disabled',
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{"visible":false}'::jsonb,
    remark = '三宝公开可用模型列表当前未返回该模型，保留历史配置但不再展示。',
    updated_at = now()
WHERE model_code = 'sanbao-sd2-limited-line3';

UPDATE ai_model_dispatch_policies policy
SET status = 'disabled',
    updated_at = now()
FROM ai_model_configs model
WHERE policy.model_config_id = model.id
  AND model.model_code = 'sanbao-sd2-limited-line3';
