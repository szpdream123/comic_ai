UPDATE ai_model_configs
SET model_code = 'MiniMax-H3-768p'
WHERE model_code = 'MiniMax-H3-c4'
  AND NOT EXISTS (
    SELECT 1 FROM ai_model_configs WHERE model_code = 'MiniMax-H3-768p'
  );

UPDATE ai_model_configs
SET display_name = 'MiniMax H3 768p',
    provider_name = 'GlobalAiOpc',
    provider_model = 'MiniMax-H3-768p',
    provider_protocol = 'globalaiopc_video',
    invocation_mode = 'async_polling',
    media_type = 'video',
    task_modes_json = '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb,
    capabilities_json = '{"prompt":true,"asyncPolling":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"voice":false}'::jsonb,
    parameter_schema_json = (
      COALESCE(parameter_schema_json, '{}'::jsonb)
      - 'aspectRatio' - 'resolution' - 'durationSec'
      - 'referenceImages' - 'referenceVideos' - 'referenceAudio'
      - 'firstFrame' - 'lastFrame'
    ) || '{"aspectRatio":{"type":"enum","options":["16:9","9:16","1:1","4:3","3:4","21:9","3:2","2:3"]},"resolution":{"type":"enum","options":["768p"]},"durationSec":{"type":"integer","minimum":10,"maximum":15},"referenceImages":{"type":"file[]","maximum":9},"referenceVideos":{"type":"file[]","maximum":3},"referenceAudio":{"type":"file[]","maximum":3}}'::jsonb,
    default_params_json = (
      COALESCE(default_params_json, '{}'::jsonb)
      - 'aspectRatio' - 'resolution' - 'durationSec'
    ) || '{"aspectRatio":"16:9","resolution":"768p","durationSec":10}'::jsonb,
    provider_config_json = (COALESCE(provider_config_json, '{}'::jsonb) - 'requestPath' - 'endpoint') || '{"baseURL":"https://zcbservice.aizfw.cn/kyyReactApiServer","createTaskEndpoint":"/v2/model-center/tasks","queryTaskEndpoint":"/v2/model-center/tasks/{taskId}","apiKeyEnv":"GLOBAL_AI_OPC_API_KEY","requestFormat":"globalaiopc_model_center_video"}'::jsonb,
    pricing_json = COALESCE(pricing_json, '{}'::jsonb) || '{"unit":"video"}'::jsonb,
    limits_json = '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"minDurationSec":10,"maxDurationSec":15,"supportedRatios":["16:9","9:16","1:1","4:3","3:4","21:9","3:2","2:3"],"supportedResolutions":["768p"]}'::jsonb,
    ui_config_json = (
      COALESCE(ui_config_json, '{}'::jsonb)
      - 'label' - 'providerDocUrl' - 'supportedModes'
    ) || '{"label":"MiniMax H3 768p","group":"客易云 Model Center","recommended":true,"visible":true,"pipeline":"video","modelKind":"video.reference","modelKindLabel":"参考生视频","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","reference_image_to_video","video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/model-center/video-gen/minimax-h3-768p"}'::jsonb,
    remark = '客易云 Model Center MiniMax H3 768p 异步视频模型；平台默认积分仅为可配置保守值，不代表供应商货币报价。',
    updated_at = now()
WHERE model_code = 'MiniMax-H3-768p';
