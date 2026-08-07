ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev', 'openai_images', 'openai_compatible_chat', 'cumob_chat',
    'modelflare_responses', 'volcengine_ark_image', 'volcengine_ark_video',
    'aliyun_bailian_video', 'aliyun_bailian_audio', 'apimart_audio',
    'globalaiopc_video', 'lingdong_api', 'cumob_image', 'global_ai_opc_image',
    'extra_token_video', 'saier_video', 'banana_router', 'san_bao', 'custom_http'
  ));

WITH seed (
  id, model_code, display_name, provider_model, media_type, task_modes, parameter_schema,
  default_params, limits, ui_config, remark
) AS (
  VALUES
  ('8a000000-0000-4000-8000-000000000001'::uuid, 'sanbao-gpt-image2', '三宝影像 · gpt-image2', 'gpt-image2', 'image', '["image.generate","image.reference_generate"]'::jsonb, '{"aspectRatio":{"type":"enum","options":["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"]},"quality":{"type":"enum","options":["high","medium","low"]}}'::jsonb, '{"aspectRatio":"auto","quality":"high"}'::jsonb, '{"maxReferences":5,"maxImageSizeMb":20,"maxPromptLength":10000}'::jsonb, '{"label":"gpt-image2","group":"三宝影像","visible":true,"pipeline":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开图片模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000002'::uuid, 'sanbao-gpt-image2-1k', '三宝影像 · gpt-image2-1K', 'gpt-image2-1K', 'image', '["image.generate","image.reference_generate"]'::jsonb, '{"aspectRatio":{"type":"enum","options":["auto","1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9","9:21"]},"quality":{"type":"enum","options":["high","medium","low"]}}'::jsonb, '{"aspectRatio":"auto","quality":"high"}'::jsonb, '{"maxReferences":5,"maxImageSizeMb":20,"maxPromptLength":10000}'::jsonb, '{"label":"gpt-image2-1K","group":"三宝影像","visible":true,"pipeline":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开图片模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000003'::uuid, 'sanbao-gpt-image2-2k', '三宝影像 · gpt-image2-2K', 'gpt-image2-2K', 'image', '["image.generate","image.reference_generate"]'::jsonb, '{"aspectRatio":{"type":"enum","options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"]},"quality":{"type":"enum","options":["high","medium","low"]}}'::jsonb, '{"aspectRatio":"9:16","quality":"high"}'::jsonb, '{"maxReferences":5,"maxImageSizeMb":20,"maxPromptLength":10000}'::jsonb, '{"label":"gpt-image2-2K","group":"三宝影像","visible":true,"pipeline":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开图片模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000004'::uuid, 'sanbao-gpt-image2-4k', '三宝影像 · gpt-image2-4K', 'gpt-image2-4K', 'image', '["image.generate","image.reference_generate"]'::jsonb, '{"aspectRatio":{"type":"enum","options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"]},"quality":{"type":"enum","options":["high","medium","low"]}}'::jsonb, '{"aspectRatio":"9:16","quality":"high"}'::jsonb, '{"maxReferences":5,"maxImageSizeMb":20,"maxPromptLength":10000}'::jsonb, '{"label":"gpt-image2-4K","group":"三宝影像","visible":true,"pipeline":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开图片模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000005'::uuid, 'sanbao-sd2-5-official-real', '三宝影像 · SD2.5-官转-过真人', 'sd2_5_official_real', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","21:9","1:1","4:3"]},"resolution":{"type":"enum","options":["480p","720p"]},"durationSec":{"type":"integer","minimum":4,"maximum":30},"concurrency":{"type":"enum","options":[1,2,4]},"reference":{"type":"enum","options":["all","startEnd","face"]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":10,"concurrency":1,"reference":"all"}'::jsonb, '{"maxReferences":30,"maxReferenceVideos":0,"maxReferenceAudios":10,"maxMediaFiles":40,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.5-官转-过真人","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000006'::uuid, 'sanbao-sd2-9img-full', '三宝影像 · SD2.0-9图满血', 'sd2_9img_full', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","1:1","3:4","4:3","21:9"]},"resolution":{"type":"enum","options":["720p","1080p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]},"reference":{"type":"enum","options":["all","startEnd","face"]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1,"reference":"all"}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":6000}'::jsonb, '{"label":"SD2.0-9图满血","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000007'::uuid, 'sanbao-sd2-4img-real-720p', '三宝影像 · SD2.0-4图-过真人', 'sd2_4img_real_720p', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["21:9","16:9","4:3","1:1","3:4","9:16"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1}'::jsonb, '{"maxReferences":4,"maxReferenceVideos":3,"maxReferenceAudios":1,"maxMediaFiles":8,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-4图-过真人","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000008'::uuid, 'sanbao-sd2-fast-4img-real', '三宝影像 · SD2.0-fast-9图-过真人', 'sd2_fast_4img_real', 'video', '["video.text_to_video","video.image_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","1:1"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[5,10,15]},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":0,"maxReferenceAudios":0,"maxMediaFiles":9,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-fast-9图-过真人","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000009'::uuid, 'sanbao-sd2-fast-4img', '三宝影像 · SD2.0-fast-9图', 'sd2_fast_4img', 'video', '["video.image_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[5,10,15]},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1}'::jsonb, '{"minReferences":1,"maxReferences":9,"maxMediaFiles":9,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-fast-9图","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000010'::uuid, 'sanbao-sd2-fast-9img-line2', '三宝影像 · SD2.0-fast-9图-线路2', 'sd2_fast_9img_line2', 'video', '["video.image_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["9:16","1:1","16:9"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"integer","minimum":5,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"9:16","resolution":"720p","durationSec":15,"concurrency":1}'::jsonb, '{"minReferences":1,"maxReferences":9,"maxMediaFiles":9,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-fast-9图-线路2","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000011'::uuid, 'sanbao-sd2-limited-line3', '三宝影像 · SD2.0-限时特价-线路3', 'sd2_limited_line3', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["9:16","1:1","16:9"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"9:16","resolution":"720p","durationSec":15,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-限时特价-线路3","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000012'::uuid, 'sanbao-sd2-limited-line2', '三宝影像 · SD2.0-限时特价-线路2', 'sd2_limited_line2', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["1:1","3:4","4:3","9:16","16:9"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[10,15]},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":10,"concurrency":1}'::jsonb, '{"maxReferences":4,"maxReferenceVideos":3,"maxReferenceAudios":1,"maxMediaFiles":8,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-限时特价-线路2","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000013'::uuid, 'sanbao-sd2-9img-limited-special', '三宝影像 · SD2.0-9图-限时特价', 'sd2_9img_limited_special', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","1:1"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[10,15]},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":10,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-9图-限时特价","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000014'::uuid, 'sanbao-sd2-9img-seconds-720p-real', '三宝影像 · SD2.0-9图-按秒-720P', 'sd2_9img_seconds_720p_real', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","1:1"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-9图-按秒-720P","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000015'::uuid, 'sanbao-sd2-full-no-real-multi-res', '三宝影像 · SD2.0满血-过不了真人', 'sd2_full_no_real_multi_res', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["1:1","3:4","4:3","9:16","16:9","21:9"]},"resolution":{"type":"enum","options":["480p","720p","1080p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"480p","durationSec":10,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0满血-过不了真人","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000016'::uuid, 'sanbao-sd2-full-no-real-line2', '三宝影像 · SD2.0-满血-过不了真人-线路2', 'sd2_full_no_real_line2', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video","video.video_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["1:1","3:4","4:3","9:16","16:9","21:9"]},"resolution":{"type":"enum","options":["720p","1080p"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":10,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":3,"maxReferenceAudios":3,"maxMediaFiles":15,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-满血-过不了真人-线路2","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000017'::uuid, 'sanbao-sd2-9img-special-full', '三宝影像 · SD2.0-9图-特价满血', 'sd2_9img_special_full', 'video', '["video.text_to_video","video.image_to_video","video.reference_guided_video"]'::jsonb, '{"ratio":{"type":"enum","options":["1:1","3:4","4:3","9:16","16:9","21:9","adaptive"]},"resolution":{"type":"enum","options":["720p","1080p","4k"]},"durationSec":{"type":"integer","minimum":4,"maximum":15},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":5,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":0,"maxReferenceAudios":3,"maxMediaFiles":12,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-9图-特价满血","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"reference","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。'),
  ('8a000000-0000-4000-8000-000000000018'::uuid, 'sanbao-sd2-fast-9img-seconds-10-15-720p', '三宝影像 · SD2.0-fast-9图-线路3', 'sd2_fast_9img_seconds_10_15_720p', 'video', '["video.text_to_video","video.image_to_video"]'::jsonb, '{"ratio":{"type":"enum","options":["16:9","9:16","1:1"]},"resolution":{"type":"enum","options":["720p"]},"durationSec":{"type":"enum","options":[15]},"concurrency":{"type":"enum","options":[1,2,4]}}'::jsonb, '{"ratio":"16:9","resolution":"720p","durationSec":15,"concurrency":1}'::jsonb, '{"maxReferences":9,"maxReferenceVideos":0,"maxReferenceAudios":0,"maxMediaFiles":9,"maxPromptLength":5000}'::jsonb, '{"label":"SD2.0-fast-9图-线路3","group":"三宝影像","visible":true,"pipeline":"video","videoCategory":"image","providerDocUrl":"https://sanbaobeauty.com/docs.html"}'::jsonb, '三宝影像公开视频模型；默认禁用，管理员确认平台积分定价后启用。')
)
INSERT INTO ai_model_configs (
  id, model_code, display_name, provider_name, provider_model, provider_protocol,
  invocation_mode, media_type, task_modes_json, capabilities_json,
  parameter_schema_json, default_params_json, provider_config_json, pricing_json,
  limits_json, ui_config_json, status, sort_order, remark
)
SELECT
  id, model_code, display_name, '三宝影像', provider_model, 'san_bao',
  'async_polling', media_type, task_modes,
  jsonb_build_object('prompt', true, 'asyncPolling', true, 'referenceImages', true, 'referenceVideo', media_type = 'video', 'referenceAudio', media_type = 'video'),
  parameter_schema, default_params,
  jsonb_build_object('baseURL', 'https://sanbaobeauty.com', 'requestPath', CASE WHEN media_type = 'image' THEN '/openapi/v1/images' ELSE '/openapi/v1/videos' END, 'createTaskEndpoint', CASE WHEN media_type = 'image' THEN '/openapi/v1/images' ELSE '/openapi/v1/videos' END, 'queryTaskEndpoint', CASE WHEN media_type = 'image' THEN '/openapi/v1/images/{taskId}' ELSE '/openapi/v1/videos/{taskId}' END, 'apiKeyEnv', 'SAN_BAO_API_KEY', 'requestFormat', CASE WHEN media_type = 'image' THEN 'san_bao_image' ELSE 'san_bao_video' END),
  jsonb_build_object('unit', media_type, 'baseCredits', 0, 'billingMode', 'fixed'),
  limits, ui_config, 'disabled', 500 + row_number() OVER (ORDER BY model_code), remark
FROM seed
ON CONFLICT (model_code) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  provider_name = EXCLUDED.provider_name,
  provider_model = EXCLUDED.provider_model,
  provider_protocol = EXCLUDED.provider_protocol,
  invocation_mode = EXCLUDED.invocation_mode,
  media_type = EXCLUDED.media_type,
  task_modes_json = EXCLUDED.task_modes_json,
  capabilities_json = EXCLUDED.capabilities_json,
  parameter_schema_json = EXCLUDED.parameter_schema_json,
  default_params_json = EXCLUDED.default_params_json,
  provider_config_json = EXCLUDED.provider_config_json,
  pricing_json = EXCLUDED.pricing_json,
  limits_json = EXCLUDED.limits_json,
  ui_config_json = EXCLUDED.ui_config_json,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id, model_config_id, queue_backend, submit_queue_name, poll_queue_name,
  finalize_queue_name, dead_letter_queue_name, job_id_template,
  bullmq_job_options_json, submit_concurrency_limit, provider_rpm_limit,
  provider_concurrent_limit, polling_interval_ms, polling_concurrency_limit,
  polling_backoff_json, retry_policy_json, circuit_breaker_json, status
)
SELECT
  ('9a' || substr(model.id::text, 3))::uuid, model.id, 'bullmq',
  CASE WHEN model.media_type = 'image' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'image' THEN 'generation-poll-image' ELSE 'generation-poll-video' END,
  'generation-finalize-artifact', 'generation-dead-letter',
  'generation:' || model.media_type || ':{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000}}'::jsonb,
  5, 60, 5, 30000, 20, '{}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":360,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs model
WHERE model.provider_protocol = 'san_bao'
ON CONFLICT (model_config_id) DO UPDATE SET
  queue_backend = EXCLUDED.queue_backend,
  submit_queue_name = EXCLUDED.submit_queue_name,
  poll_queue_name = EXCLUDED.poll_queue_name,
  finalize_queue_name = EXCLUDED.finalize_queue_name,
  dead_letter_queue_name = EXCLUDED.dead_letter_queue_name,
  job_id_template = EXCLUDED.job_id_template,
  bullmq_job_options_json = EXCLUDED.bullmq_job_options_json,
  submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
  provider_rpm_limit = EXCLUDED.provider_rpm_limit,
  provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
  polling_interval_ms = EXCLUDED.polling_interval_ms,
  polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
  polling_backoff_json = EXCLUDED.polling_backoff_json,
  retry_policy_json = EXCLUDED.retry_policy_json,
  circuit_breaker_json = EXCLUDED.circuit_breaker_json,
  status = EXCLUDED.status,
  updated_at = now();
