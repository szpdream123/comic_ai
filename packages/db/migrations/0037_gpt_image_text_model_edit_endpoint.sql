UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb)
      || jsonb_build_object(
        'editEndpoint', 'https://image.shoestravel.xin/v1/images/edits',
        'requestFormat', 'openai_images',
        'resultFormat', 'b64_json',
        'timeoutMs', 600000
      ),
    updated_at = now()
WHERE model_code = 'gpt-image-2-cn';
