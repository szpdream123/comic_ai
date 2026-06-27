UPDATE ai_model_configs
SET parameter_schema_json = jsonb_set(
      COALESCE(parameter_schema_json, '{}'::jsonb),
      '{size}',
      jsonb_build_object(
        'label', '图片尺寸',
        'type', 'enum',
        'required', false,
        'visible', true,
        'options', '["1024x1024","1040x832","720x1280","1280x720","1024x768","1008x672","832x1040","768x1024","672x1008","1344x576"]'::jsonb,
        'adminEditableOptions', true
      ),
      true
    ),
    default_params_json = jsonb_set(
      COALESCE(default_params_json, '{}'::jsonb),
      '{size}',
      to_jsonb('1024x1024'::text),
      true
    ),
    updated_at = now()
WHERE model_code = 'gpt-image-2'
  AND provider_protocol = 'lingdong_api';

UPDATE ai_model_configs
SET parameter_schema_json = jsonb_set(
      COALESCE(parameter_schema_json, '{}'::jsonb) - 'durationSec',
      '{size}',
      jsonb_build_object(
        'label', '尺寸',
        'type', 'enum',
        'required', false,
        'visible', true,
        'options', '["1280x720","720x1280"]'::jsonb,
        'adminEditableOptions', true
      ),
      true
    ),
    default_params_json = COALESCE(default_params_json, '{}'::jsonb) - 'durationSec',
    updated_at = now()
WHERE model_code IN (
    'omni_flash',
    'omni_flash_nowater',
    'omni_flash-v2v',
    'omni_flash_nowater-v2v',
    'sora-2-openai-12s',
    'sora-2-openai-4s',
    'sora-2-openai-8s'
  )
  AND provider_protocol = 'lingdong_api';

UPDATE ai_model_configs
SET parameter_schema_json = jsonb_set(
      jsonb_set(
        COALESCE(parameter_schema_json, '{}'::jsonb),
        '{size}',
        jsonb_build_object(
          'label', '尺寸',
          'type', 'enum',
          'required', false,
          'visible', true,
          'options', '["large","small"]'::jsonb,
          'adminEditableOptions', true
        ),
        true
      ),
      '{durationSec}',
      jsonb_build_object(
        'label', '视频时长',
        'type', 'integer',
        'required', false,
        'visible', true,
        'minimum', 4,
        'maximum', 12,
        'options', '["4","8","12"]'::jsonb,
        'adminEditableOptions', true
      ),
      true
    ),
    default_params_json = jsonb_set(
      jsonb_set(
        COALESCE(default_params_json, '{}'::jsonb),
        '{durationSec}',
        to_jsonb(4),
        true
      ),
      '{size}',
      to_jsonb('large'::text),
      true
    ),
    updated_at = now()
WHERE model_code = 'sora-2'
  AND provider_protocol = 'lingdong_api';
