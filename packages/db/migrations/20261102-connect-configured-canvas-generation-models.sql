-- Route canvas image/video generation defaults to in-project models that already have
-- configured admin secrets, so blank/new canvases do not select unconfigured relays.

UPDATE ai_model_configs
SET
  status = 'active',
  sort_order = CASE model_code
    WHEN 'seedream-5.0' THEN 1
    WHEN 'global-ai-opc-nano-banana-pro' THEN 2
    ELSE sort_order
  END,
  task_modes_json = (
    SELECT jsonb_agg(DISTINCT mode ORDER BY mode)
    FROM jsonb_array_elements_text(
      COALESCE(task_modes_json, '[]'::jsonb) || '["image.generate"]'::jsonb
    ) AS modes(mode)
  ),
  provider_config_json = COALESCE(provider_config_json, '{}'::jsonb)
    || jsonb_build_object('apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY'),
  updated_at = now()
WHERE model_code IN ('seedream-5.0', 'global-ai-opc-nano-banana-pro')
  AND provider_protocol = 'global_ai_opc_image';

UPDATE ai_model_configs
SET
  status = 'active',
  sort_order = CASE model_code
    WHEN 'sd_2.0_special' THEN 1
    ELSE sort_order
  END,
  provider_config_json = COALESCE(provider_config_json, '{}'::jsonb)
    || jsonb_build_object('apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY'),
  updated_at = now()
WHERE model_code = 'sd_2.0_special'
  AND provider_protocol = 'globalaiopc_video';

UPDATE creator_canvas_projects
SET
  settings_json = jsonb_set(
    jsonb_set(
      COALESCE(settings_json, '{}'::jsonb),
      '{defaultModels,image}',
      to_jsonb('seedream-5.0'::text),
      true
    ),
    '{defaultModels,video}',
    to_jsonb('sd_2.0_special'::text),
    true
  ),
  settings_revision = settings_revision + 1,
  updated_at = now()
WHERE deleted_at IS NULL
  AND (
    NULLIF(settings_json #>> '{defaultModels,image}', '') IS NULL
    OR settings_json #>> '{defaultModels,image}' IN (
      'cumob-gpt-image-2-pro',
      'cumob-gpt-image-2-vip',
      'bananarouter-gpt-image-2',
      'gpt-image-2-cn'
    )
    OR NULLIF(settings_json #>> '{defaultModels,video}', '') IS NULL
  );

UPDATE creator_canvas_nodes
SET
  model_code = 'seedream-5.0',
  data_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(data_json, '{}'::jsonb),
        '{model}',
        to_jsonb('general/comic-ai/image/seedream-5.0'::text),
        true
      ),
      '{modelCode}',
      to_jsonb('seedream-5.0'::text),
      true
    ),
    '{modelLabel}',
    to_jsonb('即梦 5.0'::text),
    true
  ),
  updated_at = now()
WHERE deleted_at IS NULL
  AND node_type IN ('send', 'ai-image', 'ai-animation', 'ai-panorama', 'ai-storyboard')
  AND status IN ('idle', 'error', 'empty', 'ready')
  AND (
    model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'bananarouter-gpt-image-2', 'gpt-image-2-cn')
    OR data_json->>'modelCode' IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2-vip', 'bananarouter-gpt-image-2', 'gpt-image-2-cn')
    OR data_json->>'model' IN (
      'general/comic-ai/image/cumob-gpt-image-2-pro',
      'general/comic-ai/image/cumob-gpt-image-2-vip',
      'general/comic-ai/image/bananarouter-gpt-image-2',
      'general/comic-ai/image/gpt-image-2-cn'
    )
  );
