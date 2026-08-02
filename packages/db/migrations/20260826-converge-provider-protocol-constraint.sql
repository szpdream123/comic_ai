ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'cumob_chat',
    'volcengine_ark_image',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'aliyun_bailian_audio',
    'apimart_audio',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'banana_router',
    'custom_http'
  ));
