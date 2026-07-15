-- Source: 0007_ai_model_configs.sql
CREATE TABLE IF NOT EXISTS ai_model_configs (
  id uuid PRIMARY KEY,
  model_code text NOT NULL,
  display_name text NOT NULL,
  provider_name text NOT NULL,
  provider_model text NOT NULL,
  provider_protocol text NOT NULL,
  invocation_mode text NOT NULL,
  media_type text NOT NULL,
  task_modes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameter_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  pricing_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  limits_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ui_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  remark text NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_code),
  CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'lingdong_api',
    'custom_http'
  )),
  CHECK (invocation_mode IN (
    'sync',
    'async_polling',
    'stream',
    'webhook'
  )),
  CHECK (media_type IN (
    'text',
    'image',
    'video',
    'audio',
    'multimodal'
  )),
  CHECK (status IN (
    'active',
    'disabled',
    'archived'
  ))
);

CREATE INDEX IF NOT EXISTS ai_model_configs_lookup_idx
  ON ai_model_configs (status, media_type, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_model_configs_provider_idx
  ON ai_model_configs (provider_name, provider_protocol, status);

CREATE INDEX IF NOT EXISTS ai_model_configs_task_modes_gin_idx
  ON ai_model_configs USING gin (task_modes_json);

CREATE TABLE IF NOT EXISTS ai_model_dispatch_policies (
  id uuid PRIMARY KEY,
  model_config_id uuid NOT NULL REFERENCES ai_model_configs(id),
  queue_backend text NOT NULL DEFAULT 'bullmq',
  submit_queue_name text NOT NULL,
  poll_queue_name text NULL,
  finalize_queue_name text NULL,
  dead_letter_queue_name text NOT NULL DEFAULT 'generation-dead-letter',
  job_id_template text NOT NULL DEFAULT 'generation:{stage}:{taskId}',
  bullmq_job_options_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  submit_concurrency_limit integer NOT NULL DEFAULT 5 CHECK (submit_concurrency_limit > 0),
  provider_rpm_limit integer NOT NULL DEFAULT 60 CHECK (provider_rpm_limit > 0),
  provider_concurrent_limit integer NOT NULL DEFAULT 5 CHECK (provider_concurrent_limit > 0),
  polling_interval_ms integer NOT NULL DEFAULT 15000 CHECK (polling_interval_ms >= 1000),
  polling_concurrency_limit integer NOT NULL DEFAULT 20 CHECK (polling_concurrency_limit > 0),
  polling_backoff_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  circuit_breaker_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_config_id),
  CHECK (queue_backend IN ('bullmq')),
  CHECK (status IN ('active', 'disabled', 'archived'))
);

CREATE INDEX IF NOT EXISTS ai_model_dispatch_policies_model_idx
  ON ai_model_dispatch_policies (model_config_id, status);

CREATE INDEX IF NOT EXISTS ai_model_dispatch_policies_queue_idx
  ON ai_model_dispatch_policies (queue_backend, submit_queue_name, status);

COMMENT ON TABLE ai_model_configs IS
'AI模型通用配置表。统一管理图片、视频、文本、音频等模型的前端展示、后端路由、供应商协议、参数限制、计费和能力声明。新增同协议模型时优先新增配置记录，只有遇到新的供应商协议时才新增 adapter。';

COMMENT ON COLUMN ai_model_configs.id IS '配置主键。';
COMMENT ON COLUMN ai_model_configs.model_code IS '平台内部模型编码。前端和业务接口只传该编码，例如 gpt-image-2-cn、seedance-i2v-pro。';
COMMENT ON COLUMN ai_model_configs.display_name IS '前端展示名称，例如 GPT Image 2、Seedance 图生视频。';
COMMENT ON COLUMN ai_model_configs.provider_name IS '供应商名称，例如 openai、volcengine、jimeng、keling、creator-dev。';
COMMENT ON COLUMN ai_model_configs.provider_model IS '供应商真实模型名，提交给上游 API 使用。';
COMMENT ON COLUMN ai_model_configs.provider_protocol IS '供应商协议类型。后端根据该字段选择对应 adapter。';
COMMENT ON COLUMN ai_model_configs.invocation_mode IS '调用模式：sync 同步、async_polling 异步轮询、stream 流式、webhook 回调。';
COMMENT ON COLUMN ai_model_configs.media_type IS '模型主输出类型：text、image、video、audio、multimodal。';
COMMENT ON COLUMN ai_model_configs.task_modes_json IS '模型支持的业务任务模式数组，例如 ["image.generate","image.edit","video.image_to_video"]。';
COMMENT ON COLUMN ai_model_configs.capabilities_json IS '能力声明，例如是否支持参考图、首帧、尾帧、音频、口型、透明背景、批量生成。';
COMMENT ON COLUMN ai_model_configs.parameter_schema_json IS '参数白名单和校验规则。前后端都应基于该字段限制用户可选参数。';
COMMENT ON COLUMN ai_model_configs.default_params_json IS '默认参数，例如默认比例、分辨率、时长、生成数量。';
COMMENT ON COLUMN ai_model_configs.provider_config_json IS '供应商路由配置，例如 baseURL、endpoint、apiKeyEnv、region、pollIntervalMs。禁止存储明文 API Key。';
COMMENT ON COLUMN ai_model_configs.pricing_json IS '计费配置，例如基础积分、按秒计费、按张计费、不同清晰度倍率。';
COMMENT ON COLUMN ai_model_configs.limits_json IS '限制配置，例如最大参考图数量、最大 prompt 长度、最大视频秒数、允许的 MIME 类型。';
COMMENT ON COLUMN ai_model_configs.ui_config_json IS '前端展示配置，例如标签、推荐标识、默认是否显示、按钮文案、排序分组。';
COMMENT ON COLUMN ai_model_configs.status IS '状态：active 可用，disabled 暂停使用，archived 归档隐藏。';
COMMENT ON COLUMN ai_model_configs.sort_order IS '前端排序权重，数值越小越靠前。';
COMMENT ON COLUMN ai_model_configs.remark IS '中文备注，记录接入说明、限制、供应商注意事项。';
COMMENT ON COLUMN ai_model_configs.created_by_user_id IS '创建配置的后台操作人。系统初始化写入时可以为空。';
COMMENT ON COLUMN ai_model_configs.updated_by_user_id IS '最后更新配置的后台操作人。';
COMMENT ON COLUMN ai_model_configs.created_at IS '创建时间。';
COMMENT ON COLUMN ai_model_configs.updated_at IS '最后更新时间。';

COMMENT ON TABLE ai_model_dispatch_policies IS
'AI模型调度策略表。用于配置每个模型进入哪个队列、允许多少并发、每分钟最多请求多少次、如何轮询、如何重试、何时熔断以及队列拥塞时如何降级。它解决高并发削峰和供应商限流保护问题。';

COMMENT ON COLUMN ai_model_dispatch_policies.id IS '调度策略主键。';
COMMENT ON COLUMN ai_model_dispatch_policies.model_config_id IS '关联 AI 模型配置。每个模型默认一条调度策略。';
COMMENT ON COLUMN ai_model_dispatch_policies.queue_backend IS '队列后端类型。第一版固定为 bullmq，表示由 BullMQ/Redis 执行生成任务、延迟轮询、重试和死信处理。';
COMMENT ON COLUMN ai_model_dispatch_policies.submit_queue_name IS '提交供应商任务的 BullMQ 队列名。';
COMMENT ON COLUMN ai_model_dispatch_policies.poll_queue_name IS '异步供应商轮询队列名。同步模型可为空，异步视频模型建议单独队列，避免提交 Worker 被轮询占满。';
COMMENT ON COLUMN ai_model_dispatch_policies.finalize_queue_name IS '产物下载、对象存储写入、asset_versions 创建和积分结算的最终化队列名。';
COMMENT ON COLUMN ai_model_dispatch_policies.dead_letter_queue_name IS '死信队列名。超过重试次数、持续失败或人工排查任务进入该队列。';
COMMENT ON COLUMN ai_model_dispatch_policies.job_id_template IS 'BullMQ jobId 模板。用于生成稳定 jobId，避免 outbox 重放或 Worker 重试导致同一阶段重复入队。';
COMMENT ON COLUMN ai_model_dispatch_policies.bullmq_job_options_json IS 'BullMQ JobOptions 配置，例如 attempts、backoff、removeOnComplete、removeOnFail、delay、priority。';
COMMENT ON COLUMN ai_model_dispatch_policies.submit_concurrency_limit IS '提交供应商任务的 Worker 并发上限。';
COMMENT ON COLUMN ai_model_dispatch_policies.provider_rpm_limit IS '供应商每分钟请求数上限，用于令牌桶限流。';
COMMENT ON COLUMN ai_model_dispatch_policies.provider_concurrent_limit IS '供应商同时运行请求上限，用于保护上游并发限制。';
COMMENT ON COLUMN ai_model_dispatch_policies.polling_interval_ms IS '异步任务轮询间隔。供应商建议 5 秒轮询时不要配置成 1 秒。';
COMMENT ON COLUMN ai_model_dispatch_policies.polling_concurrency_limit IS '异步轮询并发上限。防止大量视频任务轮询压垮本系统或供应商查询接口。';
COMMENT ON COLUMN ai_model_dispatch_policies.polling_backoff_json IS '轮询退避策略，例如前 3 次 5 秒、之后 15 秒、30 秒、60 秒，并加入 jitter 避免同一秒大量任务同时醒来。';
COMMENT ON COLUMN ai_model_dispatch_policies.retry_policy_json IS '提交和最终化阶段的重试策略。';
COMMENT ON COLUMN ai_model_dispatch_policies.circuit_breaker_json IS '熔断策略，例如连续失败次数、失败率窗口、熔断持续时间、半开探测数量。';
COMMENT ON COLUMN ai_model_dispatch_policies.status IS '策略状态：active 可用，disabled 暂停，archived 归档。';
COMMENT ON COLUMN ai_model_dispatch_policies.created_at IS '创建时间。';
COMMENT ON COLUMN ai_model_dispatch_policies.updated_at IS '最后更新时间。';

ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'lingdong_api',
    'custom_http'
  ));

INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
) VALUES
(
  '70000000-0000-4000-8000-000000000001',
  'gpt-image-2-cn',
  'GPT Image 2',
  'openai',
  'gpt-image-2',
  'openai_images',
  'sync',
  'image',
  '["image.generate","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{"prompt":{"type":"string","maxLength":4000},"aspectRatio":{"type":"enum","label":"比例","enum":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"],"options":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"]},"quality":{"type":"enum","label":"清晰度","enum":["standard","hd","2K"],"options":["standard","hd","2K"]},"count":{"type":"integer","label":"数量","minimum":1,"maximum":4}}'::jsonb,
  '{"quality":"2K","count":1,"aspectRatio":"9:16"}'::jsonb,
  '{"baseURL":"https://code.shoestravel.xin","endpoint":"/v1/images/generations","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json","requestFormat":"openai_images","timeoutMs":600000}'::jsonb,
  '{"baseCredits":90,"unit":"image","qualityMultipliers":{"standard":1,"hd":1.2,"2K":1.5}}'::jsonb,
  '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  '{"label":"GPT Image 2","group":"OpenAI","recommended":true,"visible":true,"pipeline":"G","supportedModes":["text_to_image","multi_reference","image_to_image"]}'::jsonb,
  'active',
  10,
  '用于图二生图和参考图生图。国内中转站只需要覆盖 provider_config_json.baseURL、endpoint 和 apiKeyEnv。'
),
(
  '70000000-0000-4000-8000-000000000002',
  'seedance-i2v-pro',
  'Seedance 图生视频',
  'volcengine',
  'seedance-2-0-i2v',
  'volcengine_ark_video',
  'async_polling',
  'video',
  '["video.image_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"lastFrame":false,"audio":false,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
  '{"prompt":{"type":"string","maxLength":2000},"durationSec":{"enum":[5,10]},"resolution":{"enum":["720p","1080p","2K"]},"aspectRatio":{"enum":["16:9","9:16","1:1"]}}'::jsonb,
  '{"durationSec":5,"resolution":"1080p","aspectRatio":"9:16"}'::jsonb,
  '{"baseURL":"https://ark.cn-beijing.volces.com","createTaskEndpoint":"/api/v3/contents/generations/tasks","queryTaskEndpoint":"/api/v3/contents/generations/tasks/{taskId}","apiKeyEnv":"VOLCENGINE_ARK_API_KEY","timeoutMs":120000}'::jsonb,
  '{"baseCredits":120,"unit":"video","durationMultipliers":{"5":1,"10":1.8},"qualityMultipliers":{"720p":1,"1080p":1.2,"2K":1.8}}'::jsonb,
  '{"maxPromptLength":2000,"maxReferences":1,"requiresFirstFrame":true,"maxDurationSec":10,"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
  '{"label":"Seedance 图生视频","group":"Volcengine Ark","recommended":true,"visible":true,"pipeline":"video","supportedModes":["first_frame","image_to_video","reference_video"]}'::jsonb,
  'active',
  20,
  '用于图一做视频。当前分镜图作为首帧，异步创建任务后轮询结果并落入对象存储。'
)
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
) VALUES
(
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  10,
  120,
  10,
  15000,
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
),
(
  '71000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000002',
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":5000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  40,
  '{"initialDelayMs":5000,"steps":[5000,15000,30000,60000],"jitterRatio":0.2}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":120,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":120}'::jsonb,
  'active'
)
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


-- Source: 0020_seedance_video_model_configs.sql
WITH seedance_configs AS (
  SELECT
    *
  FROM (
    VALUES
      (
        'Doubao-Seedance-2.0-fast',
        'Seedance 2.0 Fast',
        '火山引擎',
        'doubao-seedance-2-0-fast-260128',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":110,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Fast","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        20,
        '火山 Ark 视频生成 fast 模型。配置按官方 CreateContentsGenerationsTasks 文档，fast 不配置 1080p。'
      ),
      (
        'Doubao-Seedance-2.0',
        'Seedance 2.0',
        '火山引擎',
        'doubao-seedance-2-0-260128',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":4,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"Seedance 2.0","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_last_frame","videoCategoryLabel":"首尾帧","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        21,
        '火山 Ark 视频生成标准模型。支持多模态参考内容，后端会按 role 发送 first_frame、last_frame、reference_image、reference_video、reference_audio。'
      ),
      (
        'doubao-seedance-1-0-pro-250528',
        'Seedance 1.0 Pro',
        '火山引擎',
        'doubao-seedance-1-0-pro-250528',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"audio":false,"asyncPolling":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["16:9","9:16","1:1"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","required":false,"options":[5,10]},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5,"cameraFixed":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":180,"durationMultipliers":{"5":1,"10":1.8},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":5,"maxDurationSec":10,"supportedRatios":["16:9","9:16","1:1"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif"]}'::jsonb,
        '{"label":"Seedance 1.0 Pro","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        22,
        '保留旧版 Seedance 1.0 Pro。按文档示例配置 Ark 内容生成任务接口。'
      )
  ) AS v(model_code, display_name, provider_name, provider_model, task_modes_json, capabilities_json, parameter_schema_json, default_params_json, pricing_json, limits_json, ui_config_json, sort_order, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  seedance_configs.model_code,
  seedance_configs.display_name,
  seedance_configs.provider_name,
  seedance_configs.provider_model,
  'volcengine_ark_video',
  'async_polling',
  'video',
  seedance_configs.task_modes_json,
  seedance_configs.capabilities_json,
  seedance_configs.parameter_schema_json,
  seedance_configs.default_params_json,
  jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', COALESCE(NULLIF(existing.provider_config_json->>'apiKeyEnv', ''), 'SEEDANCE_API_KEY'),
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000
  ),
  seedance_configs.pricing_json,
  seedance_configs.limits_json,
  seedance_configs.ui_config_json,
  'active',
  seedance_configs.sort_order,
  seedance_configs.remark
FROM seedance_configs
LEFT JOIN ai_model_configs AS existing
  ON existing.model_code = seedance_configs.model_code
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('Doubao-Seedance-2.0-fast', 'Doubao-Seedance-2.0', 'doubao-seedance-1-0-pro-250528')
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0021_aliyun_bailian_happyhorse_video_model.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'lingdong_api',
    'custom_http'
  ));

INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
VALUES (
  gen_random_uuid(),
  'happyhorse-1.0-r2v',
  '快乐马1.0',
  'aliyun-bailian',
  'happyhorse-1.0-r2v',
  'aliyun_bailian_video',
  'async_polling',
  'video',
  '["video.image_to_video","video.reference_image_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true}'::jsonb,
  '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":800},"firstFrame":{"label":"参考图","type":"file","required":true},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":1},"aspectRatio":{"label":"视频比例","type":"enum","required":true,"options":["16:9","9:16"]},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720P"]},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":5,"maximum":5},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
  '{"aspectRatio":"16:9","resolution":"720P","durationSec":5,"watermark":false}'::jsonb,
  '{"baseURL":"https://dashscope.aliyuncs.com","createTaskEndpoint":"/api/v1/services/aigc/video-generation/video-synthesis","queryTaskEndpoint":"/api/v1/tasks/{taskId}","apiKeyEnv":"ALIYUNBAILIAN_API_KEY","requestFormat":"dashscope_video_synthesis","timeoutMs":120000}'::jsonb,
  '{"unit":"video","baseCredits":120}'::jsonb,
  '{"maxPromptLength":800,"maxReferences":1,"supportsFirstFrame":true,"supportsReferenceImages":true,"minDurationSec":5,"maxDurationSec":5,"supportedRatios":["16:9","9:16"],"supportedResolutions":["720P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
  '{"label":"快乐马1.0","group":"阿里云百炼","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"全能参考","supportedModes":["image_to_video","reference_image_to_video"],"providerDocUrl":"https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference","parameterDisplayLanguage":"zh-CN"}'::jsonb,
  'active',
  23,
  '阿里云百炼 HappyHorse 参考图角色一致性视频模型，使用 DashScope 异步视频合成接口。'
)
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code = 'happyhorse-1.0-r2v'
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0025_jimeng_image_model_configs.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'lingdong_api',
    'custom_http'
  ));

WITH jimeng_configs AS (
  SELECT *
  FROM (VALUES
    (
      'jimeng-5-image',
      '即梦 5.0 图片',
      'volcengine',
      'doubao-seedream-5-0-260128',
      110,
      11,
      true,
      '火山引擎即梦 5.0 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    ),
    (
      'jimeng-4-5-image',
      '即梦 4.5 图片',
      'volcengine',
      'doubao-seedream-4-5-251128',
      95,
      12,
      false,
      '火山引擎即梦 4.5 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    ),
    (
      'jimeng-4-0-image',
      '即梦 4.0 图片',
      'volcengine',
      'doubao-seedream-4-0',
      80,
      13,
      false,
      '火山引擎即梦 4.0 图片模型，支持文生图、图生图、图片编辑和参考生图。'
    )
  ) AS v(model_code, display_name, provider_name, provider_model, base_credits, sort_order, recommended, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  provider_name,
  provider_model,
  'custom_http',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
    "negativePrompt":{"label":"反向提示词","type":"string","required":false,"maxLength":2000},
    "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":8},
    "editInstruction":{"label":"编辑说明","type":"string","required":false,"maxLength":2000},
    "aspectRatio":{"label":"图片比例","type":"enum","required":true,"options":["1:1","16:9","9:16","4:3","3:4"]},
    "quality":{"label":"清晰度","type":"enum","required":true,"options":["1K","2K","4K"]},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":4},
    "seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},
    "watermark":{"label":"水印","type":"boolean","required":false}
  }'::jsonb,
  '{"aspectRatio":"1:1","quality":"2K","count":1,"watermark":false}'::jsonb,
  '{"baseURL":"https://ark.cn-beijing.volces.com","endpoint":"/api/v3/images/generations","apiKeyEnv":"VOLCENGINE_ARK_API_KEY","requestFormat":"volcengine_ark_images_generation","timeoutMs":120000}'::jsonb,
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'qualityMultipliers', '{"1K":1,"2K":1.5,"4K":2}'::jsonb
  ),
  '{"maxPromptLength":4000,"promptLengthUnit":"characters","maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', '即梦',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'image',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', 'https://www.volcengine.com/docs/82379',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM jimeng_configs
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"none"}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":0,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image')
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0027_gpt_image_reference_model_config.sql
UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
      'baseURL', 'https://code.shoestravel.xin',
      'endpoint', '/v1/images/generations',
      'requestPath', '/v1/images/generations',
      'editEndpoint', 'https://image.shoestravel.xin/v1/images/edits',
      'apiKeyEnv', 'GPT_IMAGE2_API_KEY',
      'resultFormat', 'b64_json',
      'requestFormat', 'openai_images',
      'timeoutMs', 600000
    ),
    task_modes_json = '["image.generate","image.edit","image.reference_generate"]'::jsonb,
    capabilities_json = COALESCE(capabilities_json, '{}'::jsonb)
      || '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
    limits_json = COALESCE(limits_json, '{}'::jsonb)
      || '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb)
      || jsonb_build_object(
        'providerDocUrl', 'https://code.shoestravel.xin/custom/a99e495b4c5372d7',
        'supportedModes', '["text_to_image","multi_reference","image_to_image"]'::jsonb
      ),
    updated_at = now()
WHERE model_code = 'gpt-image-2-cn';

INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
) VALUES (
  '70000000-0000-4000-8000-000000000003',
  'gpt-image-2-reference-cn',
  'GPT Image 2 参考生图',
  'openai',
  'gpt-image-2',
  'openai_images',
  'sync',
  'image',
  '["image.edit","image.reference_generate","image.image_to_image"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
    "referenceImages":{"label":"参考图","type":"file[]","required":true,"minimum":1,"maximum":8},
    "aspectRatio":{"label":"图片比例","type":"enum","required":true,"enum":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"],"options":["auto","1:1","16:9","3:2","9:16","2:3","1536x768 1K VR","768x1536 1K VR"]},
    "quality":{"label":"清晰度","type":"enum","required":true,"enum":["standard","hd","2K"],"options":["standard","hd","2K"]},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":4}
  }'::jsonb,
  '{"quality":"2K","count":1,"aspectRatio":"9:16"}'::jsonb,
  '{"baseURL":"https://code.shoestravel.xin","endpoint":"/v1/images/generations","requestPath":"/v1/images/generations","editEndpoint":"https://image.shoestravel.xin/v1/images/edits","apiKeyEnv":"GPT_IMAGE2_API_KEY","resultFormat":"b64_json","requestFormat":"openai_images","timeoutMs":600000}'::jsonb,
  '{"baseCredits":99,"unit":"image","qualityMultipliers":{"standard":1,"hd":1.2,"2K":1.5}}'::jsonb,
  '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  '{"label":"GPT Image 2 参考生图","group":"TravelToken","recommended":false,"visible":true,"pipeline":"G","supportedModes":["multi_reference","image_to_image"],"providerDocUrl":"https://code.shoestravel.xin/custom/a99e495b4c5372d7","parameterDisplayLanguage":"zh-CN"}'::jsonb,
  'active',
  11,
  'TravelToken OpenAI Images 兼容网关参考图生图配置。文本生图走 /v1/images/generations，带参考图时走 /v1/images/edits。'
)
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
    provider_config_json = COALESCE(ai_model_configs.provider_config_json, '{}'::jsonb) || EXCLUDED.provider_config_json,
  pricing_json = EXCLUDED.pricing_json,
  limits_json = EXCLUDED.limits_json,
  ui_config_json = EXCLUDED.ui_config_json,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order,
  remark = EXCLUDED.remark,
  updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  '71000000-0000-4000-8000-000000000003',
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  10,
  120,
  10,
  15000,
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code = 'gpt-image-2-reference-cn'
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


-- Source: 0034_script_model_config.sql
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
VALUES (
  gen_random_uuid(),
  'deepseek-script',
  'DeepSeek 剧本模型',
  'deepseek',
  'deepseek-v4-pro',
  'openai_compatible_chat',
  'stream',
  'text',
  '["text.script"]'::jsonb,
  '{"input":["prompt","outline"],"output":["text","json"]}'::jsonb,
  '{
    "scriptPrompt": { "label": "剧本需求", "type": "string", "required": true, "visible": true },
    "scriptGenre": { "label": "剧本题材", "type": "enum", "required": false, "visible": true, "options": ["都市","玄幻","科幻","悬疑","爱情","喜剧"] },
    "episodeCount": { "label": "集数", "type": "integer", "required": false, "visible": true, "options": ["1","3","5","10"] },
    "scriptStyle": { "label": "剧本风格", "type": "string", "required": false, "visible": true }
  }'::jsonb,
  '{"episodeCount":1}'::jsonb,
  '{
    "baseURL": "https://api.deepseek.com",
    "requestPath": "/chat/completions",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "requestFormat": "openai_compatible_chat",
    "timeoutMs": 120000,
    "inputSchema": {
      "source": {
        "provider": "DeepSeek OpenAI-compatible Chat API",
        "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion",
        "endpoint": "/chat/completions"
      },
      "request": {
    "model": { "type": "string", "required": true, "example": "deepseek-v4-pro" },
        "messages": {
          "type": "array",
          "required": true,
          "items": {
            "role": { "type": "string", "enum": ["system","user","assistant"] },
            "content": { "type": "string", "required": true }
          }
        },
        "temperature": { "type": "number", "required": false, "minimum": 0, "maximum": 2 },
        "max_tokens": { "type": "integer", "required": false, "minimum": 1 },
        "stream": { "type": "boolean", "required": false, "default": true },
        "response_format": { "type": "object", "required": false, "description": "Use json_object when the script pipeline expects structured JSON." }
      },
      "scriptConfig": {
        "scriptPrompt": { "type": "string", "required": true },
        "scriptGenre": { "type": "string", "required": false },
        "episodeCount": { "type": "integer", "required": false },
        "scriptStyle": { "type": "string", "required": false }
      }
    },
    "outputSchema": {
      "source": {
        "provider": "DeepSeek OpenAI-compatible Chat API",
        "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion"
      },
      "streamChunk": {
        "id": { "type": "string", "required": false },
        "model": { "type": "string", "required": false },
        "choices": {
          "type": "array",
          "required": true,
          "items": {
            "delta": {
              "type": "object",
              "properties": {
                "role": { "type": "string", "required": false },
                "content": { "type": "string", "required": false }
              }
            },
            "finish_reason": { "type": "string", "required": false }
          }
        },
        "usage": { "type": "object", "required": false }
      },
      "scriptResult": {
        "title": { "type": "string", "required": false },
        "summary": { "type": "string", "required": false },
        "episodes": {
          "type": "array",
          "required": false,
          "items": {
            "title": { "type": "string", "required": false },
            "content": { "type": "string", "required": true }
          }
        }
      }
    }
  }'::jsonb,
  '{"unit":"text","baseCredits":20}'::jsonb,
  '{"maxPromptLength":32000}'::jsonb,
  '{"modelKind":"text.script","modelKindLabel":"剧本模型","supportedModes":["script"]}'::jsonb,
  'disabled',
  130,
  '后台默认剧本模型配置，启用前请确认密钥引用和请求域名。'
)
ON CONFLICT (model_code) DO UPDATE
SET display_name = EXCLUDED.display_name,
    provider_name = EXCLUDED.provider_name,
    provider_model = EXCLUDED.provider_model,
    provider_protocol = EXCLUDED.provider_protocol,
    invocation_mode = EXCLUDED.invocation_mode,
    media_type = EXCLUDED.media_type,
    task_modes_json = EXCLUDED.task_modes_json,
    capabilities_json = EXCLUDED.capabilities_json,
    parameter_schema_json = EXCLUDED.parameter_schema_json,
    default_params_json = EXCLUDED.default_params_json,
    provider_config_json = COALESCE(ai_model_configs.provider_config_json, '{}'::jsonb) || EXCLUDED.provider_config_json,
    pricing_json = COALESCE(ai_model_configs.pricing_json, '{}'::jsonb) || EXCLUDED.pricing_json,
    limits_json = COALESCE(ai_model_configs.limits_json, '{}'::jsonb) || EXCLUDED.limits_json,
    ui_config_json = COALESCE(ai_model_configs.ui_config_json, '{}'::jsonb) || EXCLUDED.ui_config_json,
    sort_order = EXCLUDED.sort_order,
    remark = EXCLUDED.remark,
    updated_at = now();

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  submit_queue_name,
  poll_queue_name,
  provider_rpm_limit,
  provider_concurrent_limit,
  submit_concurrency_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'generation-submit-text',
  NULL,
  60,
  5,
  5,
  15000,
  20,
  'disabled'
FROM ai_model_configs model
WHERE model.model_code = 'deepseek-script'
ON CONFLICT (model_config_id) DO UPDATE
SET submit_queue_name = EXCLUDED.submit_queue_name,
    poll_queue_name = EXCLUDED.poll_queue_name,
    provider_rpm_limit = EXCLUDED.provider_rpm_limit,
    provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
    submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
    polling_interval_ms = EXCLUDED.polling_interval_ms,
    polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
    updated_at = now();


-- Source: 0035_deepseek_script_model_request_defaults.sql
UPDATE ai_model_configs
SET provider_name = 'deepseek',
    provider_model = 'deepseek-v4-pro',
    provider_protocol = 'openai_compatible_chat',
    invocation_mode = 'stream',
    media_type = 'text',
    task_modes_json = '["text.script"]'::jsonb,
    capabilities_json = COALESCE(NULLIF(capabilities_json, '{}'::jsonb), '{"input":["prompt","outline"],"output":["text","json"]}'::jsonb),
    provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
      'baseURL', 'https://api.deepseek.com',
      'requestPath', '/chat/completions',
      'apiKeyEnv', 'DEEPSEEK_API_KEY',
      'requestFormat', 'openai_compatible_chat',
      'timeoutMs', 120000,
      'inputSchema', COALESCE(provider_config_json->'inputSchema', '{
        "source": {
          "provider": "DeepSeek OpenAI-compatible Chat API",
          "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion",
          "endpoint": "/chat/completions"
        },
        "request": {
          "model": { "type": "string", "required": true, "example": "deepseek-v4-pro" },
          "messages": {
            "type": "array",
            "required": true,
            "items": {
              "role": { "type": "string", "enum": ["system","user","assistant"] },
              "content": { "type": "string", "required": true }
            }
          },
          "temperature": { "type": "number", "required": false, "minimum": 0, "maximum": 2 },
          "max_tokens": { "type": "integer", "required": false, "minimum": 1 },
          "stream": { "type": "boolean", "required": false, "default": true },
          "response_format": { "type": "object", "required": false }
        }
      }'::jsonb),
      'outputSchema', COALESCE(provider_config_json->'outputSchema', '{
        "source": {
          "provider": "DeepSeek OpenAI-compatible Chat API",
          "docUrl": "https://api-docs.deepseek.com/api/create-chat-completion"
        },
        "streamChunk": {
          "id": { "type": "string", "required": false },
          "model": { "type": "string", "required": false },
          "choices": { "type": "array", "required": true },
          "usage": { "type": "object", "required": false }
        },
        "scriptResult": {
          "title": { "type": "string", "required": false },
          "summary": { "type": "string", "required": false },
          "episodes": { "type": "array", "required": false }
        }
      }'::jsonb)
    ),
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
      'modelKind', 'text.script',
      'modelKindLabel', '剧本模型',
      'supportedModes', '["script"]'::jsonb
    ),
    updated_at = now()
WHERE media_type = 'text'
  AND (
    model_code IN ('deepseek-script', 'deepseek_script', 'deepseek_novel_text')
    OR provider_name = 'deepseek'
    OR model_code LIKE 'deepseek%'
  );

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  submit_queue_name,
  poll_queue_name,
  provider_rpm_limit,
  provider_concurrent_limit,
  submit_concurrency_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'generation-submit-text',
  NULL,
  60,
  5,
  5,
  15000,
  20,
  model.status
FROM ai_model_configs model
WHERE model.media_type = 'text'
  AND (
    model.model_code IN ('deepseek-script', 'deepseek_script', 'deepseek_novel_text')
    OR model.provider_name = 'deepseek'
    OR model.model_code LIKE 'deepseek%'
  )
ON CONFLICT (model_config_id) DO UPDATE
SET submit_queue_name = EXCLUDED.submit_queue_name,
    poll_queue_name = EXCLUDED.poll_queue_name,
    provider_rpm_limit = EXCLUDED.provider_rpm_limit,
    provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
    submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
    polling_interval_ms = EXCLUDED.polling_interval_ms,
    polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
    updated_at = now();


-- Source: 0039_volcengine_seed_2_models.sql
WITH seed_reference_video_models AS (
  SELECT *
  FROM (VALUES
    ('doubao-seed-2-0-pro-260215', 'Doubao Seed 2.0 Pro', 'doubao-seed-2-0-pro-260215', 131, 35, true),
    ('doubao-seed-2-0-lite-260428', 'Doubao Seed 2.0 Lite', 'doubao-seed-2-0-lite-260428', 132, 18, false),
    ('doubao-seed-2-0-mini-260428', 'Doubao Seed 2.0 Mini', 'doubao-seed-2-0-mini-260428', 133, 8, false)
  ) AS v(model_code, display_name, provider_model, sort_order, base_credits, recommended)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'volcengine',
  provider_model,
  'volcengine_ark_video',
  'async_polling',
  'video',
  '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
  '{
    "prompt": true,
    "firstFrame": true,
    "referenceImages": true,
    "referenceVideo": true,
    "referenceAudio": true,
    "audio": true,
    "asyncPolling": true,
    "modelFamily": "seed",
    "membershipPriorityEligible": true
  }'::jsonb,
  '{
    "prompt": { "label": "提示词", "type": "string", "required": true, "maxLength": 2000 },
    "firstFrame": { "label": "首帧图", "type": "file", "required": false },
    "referenceImages": { "label": "参考图", "type": "file[]", "required": false, "maximum": 4 },
    "sourceVideo": { "label": "参考视频", "type": "file", "required": false },
    "referenceAudio": { "label": "参考音频", "type": "file", "required": false },
    "aspectRatio": { "label": "视频比例", "type": "enum", "providerKey": "ratio", "required": false, "options": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"], "adminEditableOptions": true },
    "resolution": { "label": "分辨率", "type": "enum", "required": false, "options": ["480p","720p","1080p"], "adminEditableOptions": true },
    "durationSec": { "label": "视频时长", "type": "enum", "providerKey": "duration", "required": false, "options": [4,5,10,15], "minimum": 4, "maximum": 15, "adminEditableOptions": true },
    "seed": { "label": "随机种子", "type": "integer", "required": false, "minimum": 0 },
    "generateAudio": { "label": "生成音频", "type": "boolean", "providerKey": "generate_audio", "required": false },
    "returnLastFrame": { "label": "返回尾帧", "type": "boolean", "providerKey": "return_last_frame", "required": false },
    "watermark": { "label": "水印", "type": "boolean", "required": false }
  }'::jsonb,
  '{
    "aspectRatio": "adaptive",
    "resolution": "720p",
    "durationSec": 5,
    "generateAudio": true,
    "returnLastFrame": false,
    "watermark": false
  }'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', 'VOLCENGINE_ARK_API_KEY',
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000,
    'inputSchema', '{
      "source": {
        "provider": "Volcengine Ark video generation",
        "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh",
        "endpoint": "/api/v3/contents/generations/tasks"
      },
      "createTaskRequest": {
        "model": { "type": "string", "required": true },
        "content": {
          "type": "array",
          "required": true,
          "items": {
            "type": { "type": "string", "enum": ["text","image_url","video_url","audio_url"] },
            "role": { "type": "string", "required": false, "enum": ["first_frame","reference_image","reference_video","reference_audio"] }
          }
        },
        "ratio": { "type": "string", "required": false, "enum": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] },
        "resolution": { "type": "string", "required": false, "enum": ["480p","720p","1080p"] },
        "duration": { "type": "integer", "required": false, "enum": [4,5,10,15] },
        "seed": { "type": "integer", "required": false, "minimum": 0 },
        "generate_audio": { "type": "boolean", "required": false },
        "return_last_frame": { "type": "boolean", "required": false },
        "watermark": { "type": "boolean", "required": false, "default": false }
      }
    }'::jsonb,
    'outputSchema', '{
      "source": {
        "provider": "Volcengine Ark video generation",
        "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh"
      },
      "createTaskResponse": {
        "id": { "type": "string", "required": false },
        "task_id": { "type": "string", "required": false },
        "data": { "type": "object", "required": false }
      },
      "queryTaskResponse": {
        "id": { "type": "string", "required": false },
        "task_id": { "type": "string", "required": false },
        "status": { "type": "string", "required": true },
        "video_url": { "type": "string", "required": false },
        "data": { "type": "object", "required": false }
      }
    }'::jsonb
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits,
    'durationMultipliers', '{"4":0.9,"5":1,"10":1.8,"15":2.6}'::jsonb,
    'resolutionMultipliers', '{"480p":0.8,"720p":1,"1080p":1.35}'::jsonb
  ),
  '{
    "maxPromptLength": 2000,
    "maxReferences": 4,
    "supportsFirstFrame": true,
    "supportsReferenceImages": true,
    "supportsSourceVideo": true,
    "supportsReferenceAudio": true,
    "supportsAudio": true,
    "minDurationSec": 4,
    "maxDurationSec": 15,
    "supportedDurations": [4,5,10,15],
    "supportedRatios": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],
    "supportedResolutions": ["480p","720p","1080p"],
    "allowedMimeTypes": ["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]
  }'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', 'Volcengine Ark Seed',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '参考生视频',
    'supportedModes', '["reference","reference_image_to_video","image_to_video","video_to_video","image_video_to_video"]'::jsonb,
    'providerDocUrl', 'https://www.volcengine.com/docs/82379/1520757?lang=zh',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  'Volcengine Ark reference video generation model configured from the official Create Contents Generations Tasks API.'
FROM seed_reference_video_models
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

UPDATE ai_model_configs
SET provider_name = 'volcengine',
    provider_model = 'doubao-seedance-2-0-260128',
    provider_protocol = 'volcengine_ark_video',
    invocation_mode = 'async_polling',
    media_type = 'video',
    task_modes_json = '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
    capabilities_json = '{
      "prompt": true,
      "firstFrame": true,
      "lastFrame": true,
      "referenceImages": true,
      "referenceVideo": true,
      "referenceAudio": true,
      "audio": true,
      "asyncPolling": true,
      "modelFamily": "seedance",
      "membershipPriorityEligible": true
    }'::jsonb,
    parameter_schema_json = parameter_schema_json - 'cameraFixed',
    ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || '{
      "label": "Seedance 2.0",
      "group": "Volcengine Ark Seedance",
      "visible": true,
      "pipeline": "video",
      "videoCategory": "reference",
      "videoCategoryLabel": "参考生视频",
      "modelKind": "video.reference",
      "modelKindLabel": "参考生视频",
      "supportedModes": ["reference","reference_image_to_video","image_to_video","first_last_frame_to_video","video_to_video","image_video_to_video"],
      "providerDocUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh",
      "parameterDisplayLanguage": "zh-CN"
    }'::jsonb,
    updated_at = now()
WHERE model_code = 'Doubao-Seedance-2.0'
   OR provider_model = 'doubao-seedance-2-0-260128';

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN (
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260428',
  'doubao-seed-2-0-mini-260428'
)
   OR model.provider_model = 'doubao-seedance-2-0-260128'
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0049_lingdong_model_configs.sql
WITH lingdong_image_models AS (
  SELECT *
  FROM (VALUES
    (
      'gpt-image-2',
      'gpt-image-2',
      0.06::numeric,
      6,
      '1024x1024',
      '["1024x1024","1040x832","720x1280","1280x720","1024x768","1008x672","832x1040","768x1024","672x1008","1344x576"]'::jsonb,
      '灵动图片模型，按文档接入，默认禁用供后台单独编辑。'
    ),
    (
      'gpt-image-2pro',
      'gpt-image-2pro',
      0.25::numeric,
      4,
      '2048x2048',
      '["2048x2048","2880x2880","2080x1664","3200x2560","1152x2048","2160x3840","2048x1152","3840x2160","2048x1536","3264x2448","2016x1344","3504x2336","1664x2080","2560x3200","1536x2048","2448x3264","1344x2016","2336x3504","2016x864","3696x1584"]'::jsonb,
      '灵动高质量图片模型，按文档接入，默认禁用供后台单独编辑。'
    )
  ) AS v(model_code, display_name, base_credits, max_references, default_size, size_options_json, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'lingdong',
  model_code,
  'lingdong_api',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.reference_generate"]'::jsonb,
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'batch', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_references),
    'size', jsonb_build_object('label', '图片尺寸', 'type', 'enum', 'required', false, 'options', size_options_json, 'adminEditableOptions', true),
    'count', jsonb_build_object('label', '数量', 'type', 'integer', 'required', false, 'minimum', 1, 'maximum', 4),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0),
    'responseFormat', jsonb_build_object('label', '响应格式', 'type', 'enum', 'required', false, 'options', '["url"]'::jsonb, 'adminEditableOptions', true)
  ),
  jsonb_build_object(
    'size', default_size,
    'count', 1,
    'responseFormat', 'url'
  ),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'image',
    'requestPath', '/v1/images/generations',
    'endpoint', '/v1/images/generations',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_image',
    'resultFormat', 'url',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
        'endpoint', 'POST https://www.lingdongapi.com/v1/images/generations'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'reference_images', jsonb_build_object('type', 'array', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models'
      ),
      'response', jsonb_build_object(
        'url', jsonb_build_object('type', 'string', 'required', false),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'data', jsonb_build_object('type', 'array', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits
  ),
  jsonb_build_object(
    'maxReferences', max_references,
    'maxCount', 4,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","image/avif"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'image',
    'modelKind', CASE WHEN max_references > 0 THEN 'image.reference_image' ELSE 'image.text_to_image' END,
    'modelKindLabel', CASE WHEN max_references > 0 THEN '参考生图' ELSE '文生图' END,
    'supportedModes', '["text_to_image","reference_image","image_to_image"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'gpt-image-2' THEN 210
    ELSE 211
  END,
  remark
FROM lingdong_image_models
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

WITH lingdong_reference_video_models AS (
  SELECT *
  FROM (VALUES
    ('sd-2-1', 'sd-2-1', 5.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '九参素材 480p，支持多图、多视频、多音频参考。'),
    ('sd-2-2', 'sd-2-2', 7.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '九参素材 720p，支持多图、多视频、多音频参考。'),
    ('sd-2-fast', 'sd-2-fast', 3.30::numeric, 4, 3, 1, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 快速版，支持图、视频、音频综合参考。'),
    ('sd-2-4', 'sd-2-4', 5.20::numeric, 4, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '四参 720 版本，支持图片和视频参考。'),
    ('sd-2-5', 'sd-2-5', 4.75::numeric, 4, 3, 1, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '慢速 720p，支持图片、视频、音频参考。'),
    ('sd-2-6', 'sd-2-6', 6.05::numeric, 4, 1, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720p 稳定版，支持图像、音频和单视频参考。'),
    ('sd-2-7', 'sd-2-7', 7.25::numeric, 9, 0, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, '满血 720p-930，支持多图与音频参考。'),
    ('sd-2-8', 'sd-2-8', 8.13::numeric, 4, 1, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 1080p 稳定版，支持图片、音频和单视频参考。'),
    ('sd-2-9', 'sd-2-9', 8.50::numeric, 9, 0, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, '满血 720p，支持多图与音频参考。'),
    ('sd-2-10', 'sd-2-10', 5.00::numeric, 9, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图、参考视频和音频。'),
    ('sd-2-11', 'sd-2-11', 5.00::numeric, 4, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图、参考视频和音频。'),
    ('sd-2-12', 'sd-2-12', 4.50::numeric, 4, 3, 3, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 720P，支持参考图、参考视频和音频。'),
    ('sd-2-13', 'sd-2-13', 2.50::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 480P，支持参考图和参考视频。'),
    ('sd-2-14', 'sd-2-14', 3.75::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, '满血 720P，支持参考图和参考视频。'),
    ('sd-2-15', 'sd-2-15', 2.00::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 480P，支持参考图和参考视频。'),
    ('sd-2-16', 'sd-2-16', 3.13::numeric, 9, 3, 0, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'FAST 720P，支持参考图和参考视频。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, max_video_refs, max_audio_refs, task_modes_json, supported_modes_json, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'lingdong',
  model_code,
  'lingdong_api',
  'async_polling',
  'video',
  task_modes_json,
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', true,
    'firstFrame', max_image_refs > 0,
    'referenceImages', max_image_refs > 0,
    'referenceVideo', max_video_refs > 0,
    'referenceAudio', max_audio_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsAudio', max_audio_refs > 0,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_image_refs) END,
    'sourceVideo', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('label', '参考/源视频', 'type', 'file', 'required', false) END,
    'referenceAudio', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('label', '参考音频', 'type', 'file[]', 'required', false, 'maximum', max_audio_refs) END,
    'ratio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4","21:9","auto"]'::jsonb, 'adminEditableOptions', true),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'minimum', 4, 'maximum', 15),
    'resolution', jsonb_build_object('label', '分辨率', 'type', 'enum', 'required', false, 'options', '["480p","720p","1080p"]'::jsonb, 'adminEditableOptions', true),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  )),
  jsonb_build_object(
    'ratio', '9:16',
    'durationSec', 5
  ),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_strip_nulls(jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'videos', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'audios', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END
      ))
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models'
      ),
      'queryResponse', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'required', false),
        'status', jsonb_build_object('type', 'string', 'required', true),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'url', jsonb_build_object('type', 'string', 'required', false),
        'video_url', jsonb_build_object('type', 'string', 'required', false),
        'result_url', jsonb_build_object('type', 'string', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'maxReferences', max_image_refs,
    'maxReferenceVideos', CASE WHEN max_video_refs > 0 THEN max_video_refs END,
    'maxReferenceAudios', CASE WHEN max_audio_refs > 0 THEN max_audio_refs END,
    'supportsFirstFrame', max_image_refs > 0,
    'supportsReferenceImages', max_image_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsReferenceAudio', max_audio_refs > 0,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]'::jsonb
  )),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '全能参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '全能参考生视频',
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'sd-2-1' THEN 220
    WHEN 'sd-2-2' THEN 221
    WHEN 'sd-2-fast' THEN 222
    WHEN 'sd-2-4' THEN 223
    WHEN 'sd-2-5' THEN 224
    WHEN 'sd-2-6' THEN 225
    WHEN 'sd-2-7' THEN 226
    WHEN 'sd-2-8' THEN 227
    WHEN 'sd-2-9' THEN 228
    WHEN 'sd-2-10' THEN 229
    WHEN 'sd-2-11' THEN 230
    WHEN 'sd-2-12' THEN 231
    WHEN 'sd-2-13' THEN 232
    WHEN 'sd-2-14' THEN 233
    WHEN 'sd-2-15' THEN 234
    ELSE 235
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_reference_video_models
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

WITH lingdong_first_frame_video_models AS (
  SELECT *
  FROM (VALUES
    ('omni_flash', 'omni_flash', 0.67::numeric, 5, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Omni Flash 图生视频。'),
    ('omni_flash_nowater', 'omni_flash_nowater', 0.80::numeric, 5, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Omni Flash 无水印图生视频。'),
    ('sora-2', 'sora-2', 0.80::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 文生视频，可选 1 张图片参考。'),
    ('sora-2-openai-12s', 'sora-2-openai-12s', 0.78::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 12 秒视频，可选图片参考。'),
    ('sora-2-openai-4s', 'sora-2-openai-4s', 0.29::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 4 秒视频，可选图片参考。'),
    ('sora-2-openai-8s', 'sora-2-openai-8s', 0.56::numeric, 1, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'Sora 2 官方 8 秒视频，可选图片参考。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, task_modes_json, supported_modes_json, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'lingdong',
  model_code,
  'lingdong_api',
  'async_polling',
  'video',
  task_modes_json,
  jsonb_build_object(
    'prompt', true,
    'firstFrame', true,
    'referenceImages', max_image_refs > 0,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_image_refs),
    'ratio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4"]'::jsonb, 'adminEditableOptions', true),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'minimum', 4, 'maximum', 12),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  ),
  jsonb_build_object(
    'ratio', '9:16'
  ),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models'
      ),
      'queryResponse', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'required', false),
        'status', jsonb_build_object('type', 'string', 'required', true),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'url', jsonb_build_object('type', 'string', 'required', false),
        'video_url', jsonb_build_object('type', 'string', 'required', false),
        'result_url', jsonb_build_object('type', 'string', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits
  ),
  jsonb_build_object(
    'maxReferences', max_image_refs,
    'supportsFirstFrame', true,
    'supportsReferenceImages', true,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'first_frame',
    'videoCategoryLabel', '首帧生视频',
    'modelKind', 'video.first_frame',
    'modelKindLabel', '首帧生视频',
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'omni_flash' THEN 240
    WHEN 'omni_flash_nowater' THEN 241
    WHEN 'sora-2' THEN 242
    WHEN 'sora-2-openai-12s' THEN 243
    WHEN 'sora-2-openai-4s' THEN 244
    ELSE 245
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_first_frame_video_models
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

WITH lingdong_video_to_video_models AS (
  SELECT *
  FROM (VALUES
    ('omni_flash-v2v', 'omni_flash-v2v', 0.91::numeric, 'Omni Flash 视频参考生成。'),
    ('omni_flash_nowater-v2v', 'omni_flash_nowater-v2v', 1.04::numeric, 'Omni Flash 无水印视频参考生成。')
  ) AS v(model_code, display_name, base_credits, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'lingdong',
  model_code,
  'lingdong_api',
  'async_polling',
  'video',
  '["video.video_to_video","video.image_video_to_video"]'::jsonb,
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'referenceVideo', true,
    'supportsSourceVideo', true,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  ),
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false),
    'sourceVideo', jsonb_build_object('label', '参考/源视频', 'type', 'file', 'required', true),
    'size', jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  ),
  '{}'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/videos',
    'createTaskEndpoint', '/v1/videos',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/videos',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'videos', jsonb_build_object('type', 'array', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models'
      ),
      'queryResponse', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'required', false),
        'status', jsonb_build_object('type', 'string', 'required', true),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'url', jsonb_build_object('type', 'string', 'required', false),
        'video_url', jsonb_build_object('type', 'string', 'required', false),
        'result_url', jsonb_build_object('type', 'string', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits
  ),
  jsonb_build_object(
    'maxReferenceVideos', 1,
    'supportsReferenceImages', true,
    'supportsSourceVideo', true,
    'supportsImageAndVideoInput', true,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","video/mp4"]'::jsonb
  ),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '全能参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '全能参考生视频',
    'supportedModes', '["reference","video_to_video","image_video_to_video"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  CASE model_code
    WHEN 'omni_flash-v2v' THEN 246
    ELSE 247
  END,
  '灵动视频模型，默认禁用供后台单独编辑。' || remark
FROM lingdong_video_to_video_models
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  CASE WHEN model.media_type = 'image' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'video' THEN 'generation-poll-video' ELSE NULL END,
  CASE WHEN model.media_type = 'video' THEN 'generation-finalize-artifact' ELSE NULL END,
  'generation-dead-letter',
  CASE WHEN model.media_type = 'image' THEN 'generation:image:submit:{taskId}' ELSE 'generation:video:{stage}:{taskId}' END,
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  CASE WHEN model.media_type = 'video'
    THEN '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb
    ELSE '{"strategy":"none"}'::jsonb
  END,
  CASE WHEN model.media_type = 'video'
    THEN '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb
    ELSE '{"submitAttempts":3,"pollAttempts":0,"finalizeAttempts":3}'::jsonb
  END,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.provider_protocol = 'lingdong_api'
  AND model.model_code IN (
    'gpt-image-2',
    'gpt-image-2pro',
    'sd-2-1',
    'sd-2-2',
    'sd-2-fast',
    'sd-2-4',
    'sd-2-5',
    'sd-2-6',
    'sd-2-7',
    'sd-2-8',
    'sd-2-9',
    'sd-2-10',
    'sd-2-11',
    'sd-2-12',
    'sd-2-13',
    'sd-2-14',
    'sd-2-15',
    'sd-2-16',
    'omni_flash',
    'omni_flash-v2v',
    'omni_flash_nowater',
    'omni_flash_nowater-v2v',
    'sora-2',
    'sora-2-openai-12s',
    'sora-2-openai-4s',
    'sora-2-openai-8s'
  )
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0065_lingdong_20260517_model_catalog.sql
WITH lingdong_current_image_models AS (
  SELECT *
  FROM (VALUES
    (
      'gpt-image-2',
      'gpt-image-2',
      0.06::numeric,
      6,
      '1024x1024',
      '["1024x1024","1040x832","720x1280","1280x720","1024x768","1008x672","832x1040","768x1024","672x1008","1344x576"]'::jsonb,
      210,
      '灵动图片模型，按 20260517 文档接入，默认禁用供后台单独编辑。'
    )
  ) AS v(model_code, display_name, base_credits, max_references, default_size, size_options_json, sort_order, remark)
)
UPDATE ai_model_configs AS model
SET display_name = source.display_name,
  provider_model = source.model_code,
  invocation_mode = 'sync',
  media_type = 'image',
  task_modes_json = '["image.generate","image.image_to_image","image.reference_generate"]'::jsonb,
  capabilities_json =
  jsonb_build_object(
    'prompt', true,
    'referenceImages', true,
    'batch', true,
    'providerFamily', 'lingdong'
  ),
  parameter_schema_json =
  jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', source.max_references),
    'size', jsonb_build_object('label', '图片尺寸', 'type', 'enum', 'required', false, 'visible', true, 'options', source.size_options_json, 'adminEditableOptions', true),
    'count', jsonb_build_object('label', '数量', 'type', 'integer', 'required', false, 'minimum', 1, 'maximum', 4),
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0),
    'responseFormat', jsonb_build_object('label', '响应格式', 'type', 'enum', 'required', false, 'options', '["url"]'::jsonb, 'adminEditableOptions', true)
  ),
  default_params_json =
  jsonb_build_object(
    'size', source.default_size,
    'count', 1,
    'responseFormat', 'url'
  ),
  provider_config_json =
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'image',
    'requestPath', '/v1/images/generations',
    'endpoint', '/v1/images/generations',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_image',
    'resultFormat', 'url',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
        'endpoint', 'POST https://www.lingdongapi.com/v1/images/generations'
      ),
      'createRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', jsonb_build_object('type', 'array', 'required', false),
        'reference_images', jsonb_build_object('type', 'array', 'required', false),
        'image_url', jsonb_build_object('type', 'string', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false),
        'n', jsonb_build_object('type', 'integer', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 图片生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models'
      ),
      'response', jsonb_build_object(
        'url', jsonb_build_object('type', 'string', 'required', false),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'data', jsonb_build_object('type', 'array', 'required', false)
      )
    )
  ),
  pricing_json =
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', source.base_credits
  ),
  limits_json =
  jsonb_build_object(
    'maxReferences', source.max_references,
    'maxCount', 4,
    'allowedMimeTypes', '["image/jpeg","image/png","image/webp","image/avif"]'::jsonb
  ),
  ui_config_json =
  jsonb_build_object(
    'label', source.display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'image',
    'modelKind', 'image.reference_image',
    'modelKindLabel', '参考生图',
    'supportedModes', '["text_to_image","reference_image","image_to_image"]'::jsonb,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#image-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  status = 'disabled',
  sort_order = source.sort_order,
  remark = source.remark,
  updated_at = now()
FROM lingdong_current_image_models AS source
WHERE model.provider_name = 'lingdong'
  AND model.provider_protocol = 'lingdong_api'
  AND model.model_code = source.model_code;

WITH lingdong_current_video_models AS (
  SELECT *
  FROM (VALUES
    ('sora-2', 'sora-2', 0.80::numeric, 1, 0, 0, 4, 12, 4, '["video.text_to_video","video.image_to_video"]'::jsonb, '["first_frame","text_to_video","image_to_video"]'::jsonb, 'first_frame', '首帧生视频', 242, 'Sora 2 视频生成，支持文本生成视频，也支持 1 张参考图。'),
    ('sd-2-1', 'sd-2-1', 5.00::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 220, 'Seedance 2.0 九参素材 480p，支持多图、多视频、多音频参考。'),
    ('sd-2-2', 'sd-2-2', 7.00::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 221, 'Seedance 2.0 九参素材 720p，支持多图、多视频、多音频参考。'),
    ('sd-2-3', 'sd-2-3', 3.30::numeric, 4, 3, 1, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 222, 'Seedance 2.0 快速版，支持文生视频、首帧图生视频和参考图生视频。'),
    ('sd-2-4', 'sd-2-4', 5.20::numeric, 4, 3, 0, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 223, 'Seedance 2.0 四图 720P，支持图片和视频参考。'),
    ('sd-2-7', 'sd-2-7', 7.25::numeric, 9, 0, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video"]'::jsonb, 'reference', '全能参考生视频', 226, 'Seedance 2.0 官方满血 720p-930，支持多图片和音频参考。'),
    ('sd-2-11', 'sd-2-11', 5.00::numeric, 4, 3, 3, 4, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 230, 'Seedance 2.0 满血不卡人脸 720P，支持参考图、参考视频和音频。'),
    ('sd-2-17', 'sd-2-17', 4.99::numeric, 9, 3, 3, 5, 15, 5, '["video.text_to_video","video.image_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb, '["reference","text_to_video","image_to_video","reference_image_to_video","video_to_video","image_video_to_video"]'::jsonb, 'reference', '全能参考生视频', 231, 'Seedance 2.0 720p 稳定版，支持图片、视频、音频多素材参考。')
  ) AS v(model_code, display_name, base_credits, max_image_refs, max_video_refs, max_audio_refs, duration_min, duration_max, duration_default, task_modes_json, supported_modes_json, video_category, video_category_label, sort_order, remark)
),
lingdong_current_video_models_without_conflicts AS (
  SELECT source.*
  FROM lingdong_current_video_models AS source
  LEFT JOIN ai_model_configs AS existing
    ON existing.model_code = source.model_code
  WHERE existing.id IS NULL
     OR (
      existing.provider_name = 'lingdong'
      AND existing.provider_protocol = 'lingdong_api'
    )
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'lingdong',
  model_code,
  'lingdong_api',
  'async_polling',
  'video',
  task_modes_json,
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', true,
    'firstFrame', max_image_refs > 0,
    'referenceImages', max_image_refs > 0,
    'referenceVideo', max_video_refs > 0,
    'referenceAudio', max_audio_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsAudio', max_audio_refs > 0,
    'asyncPolling', true,
    'providerFamily', 'lingdong'
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true),
    'referenceImages', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', max_image_refs) END,
    'sourceVideo', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('label', '参考/源视频', 'type', 'file', 'required', false) END,
    'referenceAudio', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('label', '参考音频', 'type', 'file[]', 'required', false, 'maximum', max_audio_refs) END,
    'ratio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4","21:9","auto"]'::jsonb, 'adminEditableOptions', true),
    'aspectRatio', jsonb_build_object('label', '画面比例', 'type', 'enum', 'required', false, 'options', '["1:1","16:9","9:16","4:3","3:4"]'::jsonb, 'adminEditableOptions', true),
    'orientation', jsonb_build_object('label', '方向', 'type', 'enum', 'required', false, 'options', '["portrait","landscape","square"]'::jsonb, 'adminEditableOptions', true),
    'size', CASE WHEN model_code = 'sora-2' THEN jsonb_build_object('label', '尺寸', 'type', 'enum', 'required', false, 'visible', true, 'options', '["large","small"]'::jsonb, 'adminEditableOptions', true) ELSE jsonb_build_object('label', '尺寸', 'type', 'string', 'required', false) END,
    'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'required', false, 'visible', true, 'minimum', duration_min, 'maximum', duration_max),
    'resolution', CASE WHEN model_code = 'sd-2-7' THEN jsonb_build_object('label', '分辨率', 'type', 'enum', 'required', false, 'options', '["720p"]'::jsonb, 'adminEditableOptions', true) END,
    'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0)
  )),
  jsonb_strip_nulls(jsonb_build_object(
    'ratio', CASE WHEN model_code = 'sora-2' THEN NULL ELSE '9:16' END,
    'durationSec', duration_default,
    'size', CASE WHEN model_code = 'sora-2' THEN 'large' END
  )),
  jsonb_build_object(
    'baseURL', 'https://www.lingdongapi.com',
    'mediaType', 'video',
    'requestPath', '/v1/video/generations',
    'createTaskEndpoint', '/v1/video/generations',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'apiKeyEnv', '',
    'requestFormat', 'lingdong_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
        'createEndpoint', 'POST https://www.lingdongapi.com/v1/video/generations',
        'queryEndpoint', 'GET https://www.lingdongapi.com/v1/video/generations/{task_id}',
        'contentEndpoint', 'GET https://www.lingdongapi.com/v1/videos/{task_id}/content'
      ),
      'createRequest', jsonb_strip_nulls(jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'image_url', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'string', 'required', false) END,
        'reference_images', CASE WHEN max_image_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'videos', CASE WHEN max_video_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'audios', CASE WHEN max_audio_refs > 0 THEN jsonb_build_object('type', 'array', 'required', false) END,
        'duration', jsonb_build_object('type', 'integer', 'required', false),
        'ratio', jsonb_build_object('type', 'string', 'required', false),
        'aspect_ratio', jsonb_build_object('type', 'string', 'required', false),
        'orientation', jsonb_build_object('type', 'string', 'required', false),
        'size', jsonb_build_object('type', 'string', 'required', false)
      ))
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object(
        'provider', '灵动 API 视频生成',
        'docUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models'
      ),
      'queryResponse', jsonb_build_object(
        'task_id', jsonb_build_object('type', 'string', 'required', false),
        'status', jsonb_build_object('type', 'string', 'required', true),
        'content_url', jsonb_build_object('type', 'string', 'required', false),
        'url', jsonb_build_object('type', 'string', 'required', false),
        'video_url', jsonb_build_object('type', 'string', 'required', false),
        'result_url', jsonb_build_object('type', 'string', 'required', false)
      )
    )
  ),
  jsonb_build_object(
    'unit', 'video',
    'baseCredits', base_credits
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'maxReferences', max_image_refs,
    'maxReferenceVideos', CASE WHEN max_video_refs > 0 THEN max_video_refs END,
    'maxReferenceAudios', CASE WHEN max_audio_refs > 0 THEN max_audio_refs END,
    'supportsFirstFrame', max_image_refs > 0,
    'supportsReferenceImages', max_image_refs > 0,
    'supportsSourceVideo', max_video_refs > 0,
    'supportsReferenceAudio', max_audio_refs > 0,
    'allowedMimeTypes', CASE
      WHEN max_video_refs > 0 AND max_audio_refs > 0 THEN '["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]'::jsonb
      WHEN max_audio_refs > 0 THEN '["image/jpeg","image/png","image/webp","audio/mpeg","audio/wav"]'::jsonb
      WHEN max_video_refs > 0 THEN '["image/jpeg","image/png","image/webp","video/mp4"]'::jsonb
      ELSE '["image/jpeg","image/png","image/webp"]'::jsonb
    END
  )),
  jsonb_build_object(
    'label', display_name,
    'group', '灵动',
    'recommended', false,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', video_category,
    'videoCategoryLabel', video_category_label,
    'modelKind', CASE WHEN video_category = 'first_frame' THEN 'video.first_frame' ELSE 'video.reference' END,
    'modelKindLabel', video_category_label,
    'supportedModes', supported_modes_json,
    'providerDocUrl', 'https://www.lingdongapi.com/docs/api/?v=20260517#video-models',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'disabled',
  sort_order,
  '灵动视频模型，按 20260517 文档接入，默认禁用供后台单独编辑。' || remark
FROM lingdong_current_video_models_without_conflicts
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

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
UPDATE ai_generation_task_snapshots
SET model_config_id = NULL,
    updated_at = now()
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
DELETE FROM ai_model_dispatch_policies
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

WITH stale_lingdong_models AS (
  SELECT id
  FROM ai_model_configs
  WHERE provider_name = 'lingdong'
    AND provider_protocol = 'lingdong_api'
    AND media_type IN ('image', 'video')
    AND model_code NOT IN (
      'gpt-image-2',
      'sora-2',
      'sd-2-1',
      'sd-2-2',
      'sd-2-3',
      'sd-2-4',
      'sd-2-7',
      'sd-2-11',
      'sd-2-17'
    )
)
DELETE FROM ai_model_config_revisions
WHERE model_config_id IN (SELECT id FROM stale_lingdong_models);

DELETE FROM ai_model_configs
WHERE provider_name = 'lingdong'
  AND provider_protocol = 'lingdong_api'
  AND media_type IN ('image', 'video')
  AND model_code NOT IN (
    'gpt-image-2',
    'sora-2',
    'sd-2-1',
    'sd-2-2',
    'sd-2-3',
    'sd-2-4',
    'sd-2-7',
    'sd-2-11',
    'sd-2-17'
  );

INSERT INTO ai_model_dispatch_policies (
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  CASE WHEN model.media_type = 'image' THEN 'generation-submit-image' ELSE 'generation-submit-video' END,
  CASE WHEN model.media_type = 'video' THEN 'generation-poll-video' ELSE NULL END,
  CASE WHEN model.media_type = 'video' THEN 'generation-finalize-artifact' ELSE NULL END,
  'generation-dead-letter',
  CASE WHEN model.media_type = 'image' THEN 'generation:image:submit:{taskId}' ELSE 'generation:video:{stage}:{taskId}' END,
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  CASE WHEN model.media_type = 'video'
    THEN '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb
    ELSE '{"strategy":"none"}'::jsonb
  END,
  CASE WHEN model.media_type = 'video'
    THEN '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb
    ELSE '{"submitAttempts":3,"pollAttempts":0,"finalizeAttempts":3}'::jsonb
  END,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.provider_name = 'lingdong'
  AND model.provider_protocol = 'lingdong_api'
  AND model.model_code IN (
    'gpt-image-2',
    'sora-2',
    'sd-2-1',
    'sd-2-2',
    'sd-2-3',
    'sd-2-4',
    'sd-2-7',
    'sd-2-11',
    'sd-2-17'
  )
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0067_seedance_20260128_20260615_model_configs.sql
WITH seedance_configs AS (
  SELECT
    *
  FROM (
    VALUES
      (
        'doubao-seedance-2-0-mini-260615',
        'Seedance 2.0 Mini',
        '火山引擎',
        'doubao-seedance-2-0-mini-260615',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":70,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Mini","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        18,
        '火山 Ark 视频生成 2.0 mini 模型。按秒计费，支持 480p/720p、4-15 秒。'
      ),
      (
        'doubao-seedance-2-0-fast-260128',
        'Seedance 2.0 Fast',
        '火山引擎',
        'doubao-seedance-2-0-fast-260128',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":false,"referenceImages":false,"referenceVideo":false,"referenceAudio":false,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","required":false,"minimum":4,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"cameraFixed":{"label":"固定镜头","type":"boolean","required":false},"generateAudio":{"label":"生成音频","type":"boolean","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":110,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif"]}'::jsonb,
        '{"label":"Seedance 2.0 Fast","group":"火山引擎 Seedance","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        19,
        '火山 Ark 视频生成 2.0 fast 模型。按秒计费，支持 480p/720p、4-15 秒。'
      ),
      (
        'doubao-seedance-2-0-260128',
        'Seedance 2.0',
        '火山引擎',
        'doubao-seedance-2-0-260128',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":4},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[4,5,10,15],"minimum":4,"maximum":15,"adminEditableOptions":true},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0},"generateAudio":{"label":"生成音频","type":"boolean","providerKey":"generate_audio","required":false},"returnLastFrame":{"label":"返回尾帧","type":"boolean","providerKey":"return_last_frame","required":false},"watermark":{"label":"水印","type":"boolean","required":false}}'::jsonb,
        '{"aspectRatio":"adaptive","resolution":"720p","durationSec":5,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":4,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"supportsAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedDurations":[4,5,10,15],"supportedRatios":["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"Seedance 2.0","group":"火山引擎 Seedance","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["reference","reference_image_to_video","image_to_video","first_last_frame_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://www.volcengine.com/docs/82379/1520757?lang=zh","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        20,
        '火山 Ark 视频生成 2.0 标准模型。按秒计费，支持 720p/1080p、4-15 秒与参考图。'
      )
  ) AS v(model_code, display_name, provider_name, provider_model, task_modes_json, capabilities_json, parameter_schema_json, default_params_json, pricing_json, limits_json, ui_config_json, sort_order, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  seedance_configs.model_code,
  seedance_configs.display_name,
  seedance_configs.provider_name,
  seedance_configs.provider_model,
  'volcengine_ark_video',
  'async_polling',
  'video',
  seedance_configs.task_modes_json,
  seedance_configs.capabilities_json,
  seedance_configs.parameter_schema_json,
  seedance_configs.default_params_json,
  jsonb_strip_nulls(jsonb_build_object(
    'baseURL', 'https://ark.cn-beijing.volces.com',
    'createTaskEndpoint', '/api/v3/contents/generations/tasks',
    'queryTaskEndpoint', '/api/v3/contents/generations/tasks/{taskId}',
    'apiKeyEnv', 'Extra Token',
    'requestFormat', 'volcengine_ark_contents_generation',
    'timeoutMs', 120000,
    'inputSchema', CASE
      WHEN seedance_configs.model_code = 'doubao-seedance-2-0-260128' THEN '{
        "source": {
          "provider": "Volcengine Ark Seedance video generation",
          "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh",
          "endpoint": "/api/v3/contents/generations/tasks"
        },
        "createTaskRequest": {
          "model": { "type": "string", "required": true },
          "content": {
            "type": "array",
            "required": true,
            "items": {
              "type": { "type": "string", "enum": ["text","image_url","video_url","audio_url"] },
              "role": { "type": "string", "required": false, "enum": ["first_frame","last_frame","reference_image","reference_video","reference_audio"] }
            }
          },
          "ratio": { "type": "string", "required": false, "enum": ["adaptive","21:9","16:9","4:3","1:1","3:4","9:16"] },
          "resolution": { "type": "string", "required": false, "enum": ["720p","1080p"] },
          "duration": { "type": "integer", "required": false, "enum": [4,5,10,15] },
          "seed": { "type": "integer", "required": false, "minimum": 0 },
          "generate_audio": { "type": "boolean", "required": false },
          "return_last_frame": { "type": "boolean", "required": false },
          "watermark": { "type": "boolean", "required": false, "default": false }
        }
      }'::jsonb
      ELSE NULL
    END,
    'outputSchema', CASE
      WHEN seedance_configs.model_code = 'doubao-seedance-2-0-260128' THEN '{
        "source": {
          "provider": "Volcengine Ark Seedance video generation",
          "docUrl": "https://www.volcengine.com/docs/82379/1520757?lang=zh"
        },
        "createTaskResponse": {
          "id": { "type": "string", "required": false },
          "task_id": { "type": "string", "required": false },
          "data": { "type": "object", "required": false }
        },
        "queryTaskResponse": {
          "id": { "type": "string", "required": false },
          "task_id": { "type": "string", "required": false },
          "status": { "type": "string", "required": true },
          "video_url": { "type": "string", "required": false },
          "data": { "type": "object", "required": false }
        }
      }'::jsonb
      ELSE NULL
    END
  )),
  seedance_configs.pricing_json,
  seedance_configs.limits_json,
  seedance_configs.ui_config_json,
  'active',
  seedance_configs.sort_order,
  seedance_configs.remark
FROM seedance_configs
LEFT JOIN ai_model_configs AS existing
  ON existing.model_code = seedance_configs.model_code
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN (
  'doubao-seedance-2-0-mini-260615',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-260128'
)
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0070_cumob_gpt_image_models.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'custom_http'
  ));

WITH cumob_configs AS (
  SELECT *
  FROM (VALUES
    (
      'cumob-gpt-image-2-pro',
      'GPT Image 2 Pro（Cumob）',
      'gpt-image-2-pro',
      120,
      8,
      true,
      'Cumob 图像生成 API 的 GPT Image 2 Pro 模型。按文档使用 /v1/images/generations，参数为 model、prompt、size、aspect_ratio、images、quality、negative_prompts、style、seed、stream、async。'
    ),
    (
      'cumob-gpt-image-2',
      'GPT Image 2（Cumob）',
      'gpt-image-2',
      90,
      9,
      false,
      'Cumob 图像生成 API 的 GPT Image 2 模型。按文档使用 /v1/images/generations，参数为 model、prompt、size、aspect_ratio、images、quality、negative_prompts、style、seed、stream、async。'
    )
  ) AS v(model_code, display_name, provider_model, base_credits, sort_order, recommended, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  '酷模智多星',
  provider_model,
  'cumob_image',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  '{
    "prompt":{"label":"提示词","type":"string","required":true,"maxLength":1024},
    "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":14},
    "aspectRatio":{"label":"图片比例","type":"enum","required":false,"options":["auto","1:1","3:2","2:3"],"enum":["auto","1:1","3:2","2:3"],"adminEditableOptions":true},
    "size":{"label":"图片尺寸","type":"enum","required":false,"options":["1K","2K","4K"],"enum":["1K","2K","4K"],"adminEditableOptions":true},
    "quality":{"label":"质量","type":"enum","required":false,"options":["auto","low","medium","high"],"enum":["auto","low","medium","high"],"adminEditableOptions":true},
    "negativePrompts":{"label":"反向提示词","type":"string","required":false,"maxLength":1024},
    "style":{"label":"风格","type":"enum","required":false,"options":["natural","vivid"],"enum":["natural","vivid"],"adminEditableOptions":true},
    "seed":{"label":"随机种子","type":"string","required":false},
    "count":{"label":"数量","type":"integer","required":false,"minimum":1,"maximum":2}
  }'::jsonb,
  '{"size":"2K","quality":"auto","aspectRatio":"auto","count":1}'::jsonb,
  '{
    "baseURL":"https://api.cumob.com",
    "endpoint":"/v1/images/generations",
    "apiKeyEnv":"CUMOB_API_KEY",
    "requestFormat":"cumob_image",
    "timeoutMs":3600000,
    "defaultRequestParams":{"stream":false,"async":false},
    "inputSchema":{
      "source":{"provider":"Cumob image generation","docUrl":"https://api.cumob.com/docs/api-image","endpoint":"/v1/images/generations"},
      "request":{"model":{"type":"string","required":true},"prompt":{"type":"string","required":true},"size":{"type":"string","required":false,"enum":["1K","2K","4K"]},"aspect_ratio":{"type":"string","required":false,"enum":["auto","1:1","3:2","2:3"]},"images":{"type":"array","required":false,"items":{"type":"string"}},"quality":{"type":"string","required":false,"enum":["auto","low","medium","high"]},"negative_prompts":{"type":"string","required":false},"style":{"type":"string","required":false,"enum":["natural","vivid"]},"seed":{"type":"string","required":false},"stream":{"type":"boolean","required":false},"async":{"type":"boolean","required":false}}
    },
    "outputSchema":{
      "source":{"provider":"Cumob image generation","docUrl":"https://api.cumob.com/docs/api-image"},
      "response":{"id":{"type":"string","required":false},"created":{"type":"integer","required":false},"progress":{"type":"integer","required":false},"status":{"type":"string","required":false},"data":{"type":"array","required":true,"items":{"url":{"type":"string","required":true},"revised_prompt":{"type":"string","required":false}}},"error":{"type":"string","required":false},"failure_reason":{"type":"string","required":false}}
    }
  }'::jsonb,
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'sizeMultipliers', '{"1K":1,"2K":1.5,"4K":2}'::jsonb,
    'qualityMultipliers', '{"auto":1,"low":0.8,"medium":1,"high":1.3}'::jsonb
  ),
  '{"maxPromptLength":1024,"promptLengthUnit":"characters","maxReferences":14,"maxCount":2,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', '酷模智多星',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'G',
    'modelKind', 'image.generation',
    'modelKindLabel', '图片生成',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', 'https://api.cumob.com/docs/api-image',
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM cumob_configs
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('cumob-gpt-image-2-pro', 'cumob-gpt-image-2')
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

UPDATE admin_secret_values
SET request_domain = 'https://api.cumob.com'
WHERE secret_key = 'CUMOB_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';


-- Source: 0070_globalaiopc_video_model_configs.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'custom_http'
  ));

WITH globalaiopc_configs AS (
  SELECT
    *
  FROM (
    VALUES
      (
        'sd2_manxue',
        'sd2_manxue 满血版',
        'sd2_manxue',
        'globalaiopc_sd2_manxue',
        '/v1/sd2_manxue/videos',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":false,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"sd2_manxue","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":9},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p","2k","4k"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":4,"maximum":15}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5}'::jsonb,
        '{"unit":"video","baseCredits":160,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35,"2k":1.8,"4k":2.6}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":9,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsReferenceAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p","2k","4k"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"sd2_manxue 满血版","group":"GlobalAiOpc","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sd2-manxue/sd2-manxue-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        30,
        'GlobalAiOpc sd2_manxue 普通系列。平台配置使用统一模型名，适配器按 resolution 拼接 sd2_manxue_720p/1080p/2k/4k。'
      ),
      (
        'sd2_manxue_fast',
        'sd2_manxue Fast',
        'sd2_manxue_fast',
        'globalaiopc_sd2_manxue',
        '/v1/sd2_manxue/videos',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":false,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"sd2_manxue","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":9},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":4,"maximum":15}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5}'::jsonb,
        '{"unit":"video","baseCredits":120,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":9,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsReferenceAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"sd2_manxue Fast","group":"GlobalAiOpc","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sd2-manxue/sd2-manxue-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        31,
        'GlobalAiOpc sd2_manxue fast 系列。平台配置使用统一模型名，适配器按 resolution 拼接 sd2_manxue_fast_720p/1080p。'
      ),
      (
        'sd2_manxue_video',
        'sd2_manxue 视频参考',
        'sd2_manxue_video',
        'globalaiopc_sd2_manxue',
        '/v1/sd2_manxue/videos',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"sd2_manxue","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":9},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p","2k","4k"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":4,"maximum":15}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5}'::jsonb,
        '{"unit":"video","baseCredits":180,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35,"2k":1.8,"4k":2.6}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":9,"maxReferenceVideos":3,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p","2k","4k"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"sd2_manxue 视频参考","group":"GlobalAiOpc","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sd2-manxue/sd2-manxue-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        32,
        'GlobalAiOpc sd2_manxue video 系列。平台配置使用统一模型名，适配器按 resolution 拼接 sd2_manxue_video_720p/1080p/2k/4k。'
      ),
      (
        'sd2_manxue_video_fast',
        'sd2_manxue 视频参考 Fast',
        'sd2_manxue_video_fast',
        'globalaiopc_sd2_manxue',
        '/v1/sd2_manxue/videos',
        '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"sd2_manxue","membershipPriorityEligible":true}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"首帧图","type":"file","required":false},"lastFrame":{"label":"尾帧图","type":"file","required":false},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":9},"sourceVideo":{"label":"参考视频","type":"file","required":false},"referenceAudio":{"label":"参考音频","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["21:9","16:9","4:3","1:1","3:4","9:16"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p","1080p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":4,"maximum":15}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":5}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"4":0.9,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720p":1,"1080p":1.35}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":9,"maxReferenceVideos":3,"supportsFirstFrame":true,"supportsLastFrame":true,"supportsReferenceImages":true,"supportsSourceVideo":true,"supportsReferenceAudio":true,"minDurationSec":4,"maxDurationSec":15,"supportedRatios":["21:9","16:9","4:3","1:1","3:4","9:16"],"supportedResolutions":["720p","1080p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp","video/mp4","audio/mpeg","audio/wav"]}'::jsonb,
        '{"label":"sd2_manxue 视频参考 Fast","group":"GlobalAiOpc","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","first_last_frame_to_video","reference_image_to_video","video_to_video","image_video_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sd2-manxue/sd2-manxue-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        33,
        'GlobalAiOpc sd2_manxue video fast 系列。平台配置使用统一模型名，适配器按 resolution 拼接 sd2_manxue_video_fast_720p/1080p。'
      ),
      (
        'openAiSora2Plus',
        'Sora 2 Plus',
        'openAiSora2Plus',
        'globalaiopc_sora',
        '/v1/sora/videos',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"sora"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"参考图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"seconds","required":false,"options":[4,8,12]},"size":{"label":"视频尺寸","type":"enum","required":false,"options":["1280x720","720x1280"]}}'::jsonb,
        '{"aspectRatio":"16:9","durationSec":8}'::jsonb,
        '{"unit":"video","baseCredits":220,"durationMultipliers":{"4":0.8,"8":1,"12":1.4}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":4,"maxDurationSec":12,"supportedDurations":[4,8,12],"supportedRatios":["16:9","9:16"],"supportedSizes":["1280x720","720x1280"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Sora 2 Plus","group":"GlobalAiOpc Sora","recommended":true,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sora/sora-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        34,
        'GlobalAiOpc Sora 2 Plus，支持 4/8/12 秒与最多 1 张参考图。'
      ),
      (
        'openAiSora2Pro',
        'Sora 2 Pro',
        'openAiSora2Pro',
        'globalaiopc_sora',
        '/v1/sora/videos',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"sora"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"参考图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"seconds","required":false,"options":[4,8,12]},"size":{"label":"视频尺寸","type":"enum","required":false,"options":["1280x720","720x1280"]}}'::jsonb,
        '{"aspectRatio":"16:9","durationSec":8}'::jsonb,
        '{"unit":"video","baseCredits":260,"durationMultipliers":{"4":0.8,"8":1,"12":1.4}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":4,"maxDurationSec":12,"supportedDurations":[4,8,12],"supportedRatios":["16:9","9:16"],"supportedSizes":["1280x720","720x1280"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Sora 2 Pro","group":"GlobalAiOpc Sora","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/sora/sora-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        35,
        'GlobalAiOpc Sora 2 Pro，支持 4/8/12 秒与最多 1 张参考图。'
      ),
      (
        'grok_video3',
        'Grok Video 3',
        'grok_video3',
        'globalaiopc_grok',
        '/v1/grok/videos',
        '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"grok"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":7},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16","1:1","3:2","2:3"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":6,"maximum":30}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":10}'::jsonb,
        '{"unit":"video","baseCredits":180,"durationMultipliers":{"6":0.8,"10":1,"12":1.2,"16":1.6,"20":2,"30":3},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":7,"supportsFirstFrame":true,"supportsReferenceImages":true,"minDurationSec":6,"maxDurationSec":30,"supportedRatios":["16:9","9:16","1:1","3:2","2:3"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Grok Video 3","group":"GlobalAiOpc Grok","recommended":true,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/grok/grok-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        36,
        'GlobalAiOpc Grok Video 3，支持文生视频和图生视频。'
      ),
      (
        'grok_video3_pro',
        'Grok Video 3 Pro',
        'grok_video3_pro',
        'globalaiopc_grok',
        '/v1/grok/videos',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"grok"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"参考图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[10]}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":10}'::jsonb,
        '{"unit":"video","baseCredits":220}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":10,"maxDurationSec":10,"supportedDurations":[10],"supportedRatios":["16:9"],"supportedResolutions":["720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Grok Video 3 Pro","group":"GlobalAiOpc Grok","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/grok/grok-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        37,
        'GlobalAiOpc Grok Video 3 Pro，固定 10 秒。'
      ),
      (
        'grok_video3_max',
        'Grok Video 3 Max',
        'grok_video3_max',
        'globalaiopc_grok',
        '/v1/grok/videos',
        '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"grok"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":5},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16","1:1"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["480p","720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[6,10,12,16,20,30]}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":10}'::jsonb,
        '{"unit":"video","baseCredits":260,"durationMultipliers":{"6":0.8,"10":1,"12":1.2,"16":1.6,"20":2,"30":3},"resolutionMultipliers":{"480p":0.8,"720p":1}}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":5,"supportsFirstFrame":true,"supportsReferenceImages":true,"supportedDurations":[6,10,12,16,20,30],"supportedRatios":["16:9","9:16","1:1"],"supportedResolutions":["480p","720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Grok Video 3 Max","group":"GlobalAiOpc Grok","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/grok/grok-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        38,
        'GlobalAiOpc Grok Video 3 Max，支持 6/10/12/16/20/30 秒。'
      ),
      (
        'grok_video1.5_pro',
        'Grok Video 1.5 Pro',
        'grok_video1.5_pro',
        'globalaiopc_grok',
        '/v1/grok/videos',
        '["video.text_to_video","video.image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"grok"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"firstFrame":{"label":"参考图","type":"file","required":false},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[10]}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":10}'::jsonb,
        '{"unit":"video","baseCredits":220}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":1,"supportsFirstFrame":true,"minDurationSec":10,"maxDurationSec":10,"supportedDurations":[10],"supportedRatios":["16:9"],"supportedResolutions":["720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Grok Video 1.5 Pro","group":"GlobalAiOpc Grok","recommended":false,"visible":true,"pipeline":"video","videoCategory":"first_frame","videoCategoryLabel":"首帧视频","supportedModes":["text_to_video","image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/grok/grok-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        39,
        'GlobalAiOpc Grok Video 1.5 Pro，固定 10 秒。'
      ),
      (
        'grok_video3_stable',
        'Grok Video 3 Stable',
        'grok_video3_stable',
        'globalaiopc_grok',
        '/v1/grok/videos',
        '["video.text_to_video","video.image_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"grok"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2000},"referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":7},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"aspect_ratio","required":false,"options":["16:9","9:16","3:2","2:3","1:1"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720p"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"enum","providerKey":"duration","required":false,"options":[10]}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720p","durationSec":10}'::jsonb,
        '{"unit":"video","baseCredits":180}'::jsonb,
        '{"maxPromptLength":2000,"maxReferences":7,"supportsFirstFrame":true,"supportsReferenceImages":true,"minDurationSec":10,"maxDurationSec":10,"supportedDurations":[10],"supportedRatios":["16:9","9:16","3:2","2:3","1:1"],"supportedResolutions":["720p"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Grok Video 3 Stable","group":"GlobalAiOpc Grok","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","supportedModes":["text_to_video","image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/grok/grok-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        40,
        'GlobalAiOpc Grok Video 3 Stable，固定 10 秒，仅 720p。'
      ),
      (
        'globalaiopc-happyhorse-r2v',
        'Happy Horse 参考生视频',
        'happyhorse-1.0-r2v',
        'globalaiopc_happyhorse_r2v',
        '/v1/happyhorse-r2v/videos',
        '["video.image_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"happyhorse"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2500},"referenceImages":{"label":"参考图","type":"file[]","required":true,"minimum":1,"maximum":9},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["16:9","9:16","1:1","4:3","3:4","4:5","5:4","9:21","21:9"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720P","1080P"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":3,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0,"maximum":2147483647}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720P","durationSec":5,"seed":0}'::jsonb,
        '{"unit":"video","baseCredits":140,"durationMultipliers":{"3":0.8,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720P":1,"1080P":1.35}}'::jsonb,
        '{"maxPromptLength":2500,"maxReferences":9,"requiresReferenceImages":true,"supportsReferenceImages":true,"minDurationSec":3,"maxDurationSec":15,"supportedRatios":["16:9","9:16","1:1","4:3","3:4","4:5","5:4","9:21","21:9"],"supportedResolutions":["720P","1080P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Happy Horse 参考生视频","group":"GlobalAiOpc Happy Horse","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/happyhorse/happyhorse-r2v-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        41,
        'GlobalAiOpc Happy Horse 参考生视频标准版。为避免覆盖阿里百炼同名模型，平台模型编码使用 globalaiopc-happyhorse-r2v。'
      ),
      (
        'globalaiopc-happyhorse-r2v-economy',
        'Happy Horse 参考生视频 Economy',
        'happyhorse-1.0-r2v-economy',
        'globalaiopc_happyhorse_r2v',
        '/v1/happyhorse-r2v/videos',
        '["video.image_to_video","video.reference_image_to_video"]'::jsonb,
        '{"prompt":true,"firstFrame":true,"referenceImages":true,"audio":false,"asyncPolling":true,"modelFamily":"happyhorse"}'::jsonb,
        '{"prompt":{"label":"提示词","type":"string","required":true,"maxLength":2500},"referenceImages":{"label":"参考图","type":"file[]","required":true,"minimum":1,"maximum":9},"aspectRatio":{"label":"视频比例","type":"enum","providerKey":"ratio","required":false,"options":["16:9","9:16","1:1","4:3","3:4","4:5","5:4","9:21","21:9"],"adminEditableOptions":true},"resolution":{"label":"分辨率","type":"enum","required":false,"options":["720P","1080P"],"adminEditableOptions":true},"durationSec":{"label":"视频时长","type":"integer","providerKey":"duration","required":false,"minimum":3,"maximum":15},"seed":{"label":"随机种子","type":"integer","required":false,"minimum":0,"maximum":2147483647}}'::jsonb,
        '{"aspectRatio":"16:9","resolution":"720P","durationSec":5,"seed":0}'::jsonb,
        '{"unit":"video","baseCredits":110,"durationMultipliers":{"3":0.8,"5":1,"10":1.8,"15":2.6},"resolutionMultipliers":{"720P":1,"1080P":1.35}}'::jsonb,
        '{"maxPromptLength":2500,"maxReferences":9,"requiresReferenceImages":true,"supportsReferenceImages":true,"minDurationSec":3,"maxDurationSec":15,"supportedRatios":["16:9","9:16","1:1","4:3","3:4","4:5","5:4","9:21","21:9"],"supportedResolutions":["720P","1080P"],"allowedMimeTypes":["image/jpeg","image/png","image/webp"]}'::jsonb,
        '{"label":"Happy Horse 参考生视频 Economy","group":"GlobalAiOpc Happy Horse","recommended":false,"visible":true,"pipeline":"video","videoCategory":"reference","videoCategoryLabel":"参考生视频","modelKind":"video.reference","modelKindLabel":"参考生视频","supportedModes":["image_to_video","reference_image_to_video"],"providerDocUrl":"https://docs.globalaiopc.com/api-reference/video/happyhorse/happyhorse-r2v-create","parameterDisplayLanguage":"zh-CN"}'::jsonb,
        42,
        'GlobalAiOpc Happy Horse 参考生视频实惠版。'
      )
  ) AS v(model_code, display_name, provider_model, request_format, create_task_endpoint, task_modes_json, capabilities_json, parameter_schema_json, default_params_json, pricing_json, limits_json, ui_config_json, sort_order, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  globalaiopc_configs.model_code,
  globalaiopc_configs.display_name,
  'GlobalAiOpc',
  globalaiopc_configs.provider_model,
  'globalaiopc_video',
  'async_polling',
  'video',
  globalaiopc_configs.task_modes_json,
  globalaiopc_configs.capabilities_json,
  globalaiopc_configs.parameter_schema_json,
  globalaiopc_configs.default_params_json,
  jsonb_build_object(
    'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
    'createTaskEndpoint', globalaiopc_configs.create_task_endpoint,
    'queryTaskEndpoint', '/v1/result/{taskId}',
    'apiKeyEnv', COALESCE(NULLIF(existing.provider_config_json->>'apiKeyEnv', ''), 'GLOBAL_AI_OPC_API_KEY'),
    'requestFormat', globalaiopc_configs.request_format,
    'timeoutMs', 120000
  ),
  globalaiopc_configs.pricing_json,
  globalaiopc_configs.limits_json,
  globalaiopc_configs.ui_config_json,
  'active',
  globalaiopc_configs.sort_order,
  globalaiopc_configs.remark
FROM globalaiopc_configs
LEFT JOIN ai_model_configs AS existing
  ON existing.model_code = globalaiopc_configs.model_code
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN (
  'sd2_manxue',
  'sd2_manxue_fast',
  'sd2_manxue_video',
  'sd2_manxue_video_fast',
  'openAiSora2Plus',
  'openAiSora2Pro',
  'grok_video3',
  'grok_video3_pro',
  'grok_video3_max',
  'grok_video1.5_pro',
  'grok_video3_stable',
  'globalaiopc-happyhorse-r2v',
  'globalaiopc-happyhorse-r2v-economy'
)
ON CONFLICT (model_config_id) DO UPDATE SET
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


-- Source: 0071_global_ai_opc_image_models.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'custom_http'
  ));

WITH global_ai_opc_configs AS (
  SELECT *
  FROM (VALUES
    (
      'global-ai-opc-gpt-image-2',
      'GPT Image 2（GlobalAiOpc）',
      'gpt-image-2',
      '/v1/image2/images',
      'global_ai_opc_gpt_image2',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "quality":{"label":"画质档位","type":"enum","required":false,"options":["low","medium","high"],"enum":["low","medium","high"],"adminEditableOptions":true},
        "ratio":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","2:1","1:2","21:9","9:21"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","2:1","1:2","21:9","9:21"],"adminEditableOptions":true},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"精确尺寸","type":"enum","required":false,"options":["1024x1024","1536x1024","1024x1536","2048x2048","2048x1152","3840x2160","2160x3840"],"enum":["1024x1024","1536x1024","1024x1536","2048x2048","2048x1152","3840x2160","2160x3840"],"adminEditableOptions":true}
      }'::jsonb,
      '{"quality":"low","resolution":"1k","ratio":"1:1"}'::jsonb,
      90,
      7,
      true,
      'https://docs.globalaiopc.com/api-reference/image/gpt-image2/gpt-image2-create',
      'GlobalAiOpc GPT Image 2 图片模型。创建任务使用 /v1/image2/images；size 与 resolution/ratio 二选一，传 size 时以 size 为准。'
    ),
    (
      'global-ai-opc-nano-banana-2',
      'Nano Banana 2（GlobalAiOpc）',
      'nano-banana-2',
      '/v1/banana/images',
      'global_ai_opc_banana_image',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"adminEditableOptions":true}
      }'::jsonb,
      '{"resolution":"1k","size":"1:1"}'::jsonb,
      100,
      8,
      true,
      'https://docs.globalaiopc.com/api-reference/image/nano-banana-create',
      'GlobalAiOpc Nano Banana 2 图片模型。创建任务使用 /v1/banana/images；文档中的 size 表示宽高比。'
    ),
    (
      'global-ai-opc-nano-banana-pro',
      'Nano Banana Pro（GlobalAiOpc）',
      'nano-banana-pro',
      '/v1/banana/images',
      'global_ai_opc_banana_image',
      '{
        "prompt":{"label":"提示词","type":"string","required":true,"maxLength":4000},
        "referenceImages":{"label":"参考图","type":"file[]","required":false,"maximum":6},
        "resolution":{"label":"分辨率","type":"enum","required":false,"options":["1k","2k","4k"],"enum":["1k","2k","4k"],"adminEditableOptions":true},
        "size":{"label":"图片比例","type":"enum","required":false,"options":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"enum":["1:1","16:9","9:16","4:3","3:4","3:2","2:3","5:4","4:5","21:9"],"adminEditableOptions":true}
      }'::jsonb,
      '{"resolution":"2k","size":"1:1"}'::jsonb,
      130,
      9,
      false,
      'https://docs.globalaiopc.com/api-reference/image/nano-banana-create',
      'GlobalAiOpc Nano Banana Pro 图片模型。创建任务使用 /v1/banana/images；支持 resolution 与 size（宽高比）参数。'
    )
  ) AS v(model_code, display_name, provider_model, endpoint, request_format, parameter_schema, default_params, base_credits, sort_order, recommended, doc_url, remark)
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  model_code,
  display_name,
  'GlobalAiOpc（壹嘉云）',
  provider_model,
  'global_ai_opc_image',
  'sync',
  'image',
  '["image.generate","image.image_to_image","image.edit","image.reference_generate"]'::jsonb,
  '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
  parameter_schema,
  default_params,
  jsonb_build_object(
    'baseURL', 'https://zcbservice.aizfw.cn/kyyReactApiServer',
    'requestPath', endpoint,
    'endpoint', endpoint,
    'createTaskEndpoint', endpoint,
    'queryTaskEndpoint', '/v1/result/{taskId}',
    'apiKeyEnv', 'GLOBAL_AI_OPC_API_KEY',
    'requestFormat', request_format,
    'timeoutMs', 120000,
    'pollIntervalMs', 2000,
    'maxPollAttempts', 180,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object('provider', 'GlobalAiOpc image generation', 'docUrl', doc_url, 'endpoint', endpoint)
    ),
    'outputSchema', jsonb_build_object(
      'source', jsonb_build_object('provider', 'GlobalAiOpc image generation', 'docUrl',
        CASE WHEN request_format = 'global_ai_opc_banana_image'
          THEN 'https://docs.globalaiopc.com/api-reference/image/nano-banana-query'
          ELSE 'https://docs.globalaiopc.com/api-reference/image/gpt-image2/gpt-image2-query'
        END),
      'response', '{"id":{"type":"string","required":true},"status":{"type":"string","required":true},"image_url":{"type":"string","required":false},"amount":{"type":"number","required":false},"error":{"type":"string","required":false}}'::jsonb
    )
  ),
  jsonb_build_object(
    'unit', 'image',
    'baseCredits', base_credits,
    'resolutionCredits', jsonb_build_object(
      '1k', base_credits,
      '2k', ROUND(base_credits * 1.5),
      '4k', ROUND(base_credits * 2)
    )
  ),
  '{"maxPromptLength":4000,"promptLengthUnit":"characters","maxReferences":6,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
  jsonb_build_object(
    'label', display_name,
    'group', 'GlobalAiOpc',
    'recommended', recommended,
    'visible', true,
    'pipeline', 'image',
    'modelKind', 'image.generation',
    'modelKindLabel', '图片生成',
    'supportedModes', '["text_to_image","image_to_image","image_edit","multi_reference"]'::jsonb,
    'providerDocUrl', doc_url,
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  sort_order,
  remark
FROM global_ai_opc_configs
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-image',
  NULL,
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:image:submit:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  10,
  '{}'::jsonb,
  '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  '{"failureRateWindowSeconds":60,"openAfterFailures":10,"openForSeconds":60}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN ('global-ai-opc-gpt-image-2', 'global-ai-opc-nano-banana-2', 'global-ai-opc-nano-banana-pro')
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

UPDATE admin_secret_values
SET request_domain = 'https://zcbservice.aizfw.cn/kyyReactApiServer'
WHERE secret_key = 'GLOBAL_AI_OPC_API_KEY'
  AND COALESCE(NULLIF(request_domain, ''), '') = '';

-- Final user-centric reference-model normalization.
-- Retains the final effects of the former provider IO schema updates without depending on migration filenames.
UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "OpenAI Images API",
      "docUrl": "https://platform.openai.com/docs/guides/image-generation",
      "endpoints": ["/v1/images/generations", "/v1/images/edits"]
    },
    "generationRequest": {
      "model": { "type": "string", "required": true, "example": "gpt-image-2" },
      "prompt": { "type": "string", "required": true, "maxLength": 32000 },
      "size": { "type": "string", "required": false, "default": "1024x1536", "description": "gpt-image-2 supports standard sizes and flexible WIDTHxHEIGHT sizes within official limits." },
      "quality": { "type": "string", "required": false, "enum": ["low", "medium", "high"] },
      "output_format": { "type": "string", "required": false, "enum": ["png", "webp", "jpeg"] },
      "n": { "type": "integer", "required": false, "minimum": 1, "maximum": 4, "default": 1 },
      "response_format": { "type": "string", "required": false, "supported": false, "description": "Not supported for GPT image models; GPT image models return base64-encoded images." }
    },
    "editRequest": {
      "model": { "type": "string", "required": true, "example": "gpt-image-2" },
      "image[]": { "type": "file[]", "required": true, "maximum": 8, "contentTypes": ["image/jpeg", "image/png", "image/webp"] },
      "prompt": { "type": "string", "required": true, "maxLength": 32000 },
      "size": { "type": "string", "required": false, "default": "1024x1536" },
      "output_format": { "type": "string", "required": false, "enum": ["png", "webp", "jpeg"] },
      "response_format": { "type": "string", "required": false, "supported": false, "description": "Not supported for GPT image models; GPT image models return base64-encoded images." }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "OpenAI Images API",
      "docUrl": "https://platform.openai.com/docs/api-reference/images"
    },
    "response": {
      "created": { "type": "integer", "required": false },
      "data": {
        "type": "array",
        "required": true,
        "items": {
          "b64_json": { "type": "string", "required": true, "description": "Base64 encoded image returned by GPT image models." },
          "url": { "type": "string", "required": false, "supported": false, "description": "URL output is not supported for GPT image models." },
          "revised_prompt": { "type": "string", "required": false }
        }
      }
    }
  }'::jsonb
)
WHERE model_code IN ('gpt-image-2-cn', 'gpt-image-2-reference-cn');

UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "Volcengine Ark / Seedream image generation",
      "docUrl": "https://www.volcengine.com/docs/82379/1541523",
      "endpoint": "/api/v3/images/generations"
    },
    "request": {
      "model": { "type": "string", "required": true, "examples": ["doubao-seedream-5-0-260128", "doubao-seedream-4-5-251128", "doubao-seedream-4-0"] },
      "prompt": { "type": "string", "required": true, "maxLength": 4000 },
      "content": {
        "type": "array",
        "required": false,
        "description": "Use text plus image_url items for image-to-image, edit, and multi-reference generation.",
        "items": {
          "type": { "type": "string", "enum": ["text", "image_url"] },
          "text": { "type": "string", "required": false },
          "image_url": {
            "type": "object",
            "required": false,
            "properties": { "url": { "type": "string", "format": "uri" } }
          }
        }
      },
      "size": { "type": "string", "required": false, "description": "Seedream image size or quality setting, for example 1K/2K/4K or a supported pixel size." },
      "ratio": { "type": "string", "required": false, "enum": ["1:1", "16:9", "9:16", "4:3", "3:4"] },
      "negative_prompt": { "type": "string", "required": false, "maxLength": 2000 },
      "response_format": { "type": "string", "required": false, "enum": ["url", "b64_json"] },
      "output_format": { "type": "string", "required": false, "enum": ["jpeg", "png", "webp"], "description": "Supported by Seedream 5.x models." },
      "seed": { "type": "integer", "required": false, "minimum": 0 },
      "watermark": { "type": "boolean", "required": false, "default": false }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "Volcengine Ark / Seedream image generation",
      "docUrl": "https://www.volcengine.com/docs/82379/1541523"
    },
    "syncResponse": {
      "id": { "type": "string", "required": false },
      "created": { "type": "integer", "required": false },
      "data": {
        "type": "array",
        "required": false,
        "items": {
          "url": { "type": "string", "required": false, "format": "uri" },
          "b64_json": { "type": "string", "required": false },
          "revised_prompt": { "type": "string", "required": false }
        }
      }
    },
    "asyncResponse": {
      "id": { "type": "string", "required": false },
      "task_id": { "type": "string", "required": false },
      "status": { "type": "string", "required": false },
      "data": { "type": "object", "required": false }
    }
  }'::jsonb
)
WHERE model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image');

UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "Alibaba Cloud Model Studio / DashScope HappyHorse",
      "docUrl": "https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference",
      "createTaskEndpoint": "/api/v1/services/aigc/video-generation/video-synthesis",
      "queryTaskEndpoint": "/api/v1/tasks/{taskId}"
    },
    "createTaskRequest": {
      "model": { "type": "string", "required": true, "example": "happyhorse-1.0-r2v" },
      "input": {
        "type": "object",
        "required": true,
        "properties": {
          "prompt": { "type": "string", "required": true, "maxLength": 800 },
          "media": {
            "type": "array",
            "required": true,
            "minItems": 1,
            "maxItems": 9,
            "items": {
              "type": { "type": "string", "required": true, "enum": ["reference_image"] },
              "url": { "type": "string", "required": true, "format": "uri" }
            }
          }
        }
      },
      "parameters": {
        "type": "object",
        "required": false,
        "properties": {
          "ratio": { "type": "string", "required": false, "enum": ["16:9", "9:16", "3:4", "4:3", "4:5", "5:4", "1:1", "9:21", "21:9"], "default": "16:9" },
          "duration": { "type": "integer", "required": false, "minimum": 3, "maximum": 15, "default": 5 },
          "resolution": { "type": "string", "required": false, "enum": ["720P", "1080P"], "default": "1080P" },
          "seed": { "type": "integer", "required": false, "minimum": 0, "maximum": 2147483647 },
          "watermark": { "type": "boolean", "required": false, "default": true }
        }
      }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "Alibaba Cloud Model Studio / DashScope HappyHorse",
      "docUrl": "https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference"
    },
    "createTaskResponse": {
      "request_id": { "type": "string", "required": false },
      "output": {
        "type": "object",
        "required": true,
        "properties": {
          "task_id": { "type": "string", "required": true },
          "task_status": { "type": "string", "required": true }
        }
      }
    },
    "queryTaskResponse": {
      "request_id": { "type": "string", "required": false },
      "output": {
        "type": "object",
        "required": true,
        "properties": {
          "task_id": { "type": "string", "required": false },
          "task_status": { "type": "string", "required": true },
          "video_url": { "type": "string", "required": false, "format": "uri" },
          "code": { "type": "string", "required": false },
          "message": { "type": "string", "required": false }
        }
      }
    }
  }'::jsonb
)
WHERE model_code = 'happyhorse-1.0-r2v';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'image.text_to_image',
  'modelKindLabel', '文生图',
  'supportedModes', '["text_to_image"]'::jsonb
)
WHERE media_type = 'image'
  AND model_code = 'gpt-image-2-cn';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'image.reference_image',
  'modelKindLabel', '参考生图',
  'supportedModes', '["reference_image","multi_reference","image_to_image"]'::jsonb
)
WHERE media_type = 'image'
  AND (
    model_code = 'gpt-image-2-reference-cn'
    OR model_code LIKE 'jimeng-%-image'
    OR model_code LIKE 'doubao-seedream-%'
  );

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.first_frame',
  'modelKindLabel', '首帧生视频',
  'videoCategory', 'first_frame',
  'videoCategoryLabel', '首帧生视频',
  'supportedModes', '["first_frame","image_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND (
    COALESCE(ui_config_json->>'videoCategory', '') = 'first_frame'
    OR COALESCE(ui_config_json->>'videoCategory', '') = ''
  )
  AND model_code <> 'happyhorse-1.0-r2v';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.first_last_frame',
  'modelKindLabel', '首尾帧生视频',
  'videoCategory', 'first_last_frame',
  'videoCategoryLabel', '首尾帧生视频',
  'supportedModes', '["first_last_frame","first_last_frame_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND COALESCE(ui_config_json->>'videoCategory', '') = 'first_last_frame';

UPDATE ai_model_configs
SET ui_config_json = COALESCE(ui_config_json, '{}'::jsonb) || jsonb_build_object(
  'modelKind', 'video.reference',
  'modelKindLabel', '参考生视频',
  'videoCategory', 'reference',
  'videoCategoryLabel', '参考生视频',
  'supportedModes', '["reference","reference_image_to_video"]'::jsonb
)
WHERE media_type = 'video'
  AND (
    COALESCE(ui_config_json->>'videoCategory', '') = 'reference'
    OR model_code = 'happyhorse-1.0-r2v'
  );

UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
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

WITH option_sets AS (
  SELECT
    '[
      "auto",
      "1:1", "1024x1024", "2048x2048", "2880x2880",
      "2:3", "1024x1536", "2048x3072", "2336x3504",
      "3:2", "1536x1024", "3072x2048", "3504x2336",
      "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
      "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
      "4:5", "1024x1280", "2048x2560", "2560x3200",
      "5:4", "1280x1024", "2560x2048", "3200x2560",
      "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
      "16:9", "1824x1024", "3840x1280", "3840x2160",
      "21:9"
    ]'::jsonb AS aspect_options,
    '["standard", "hd", "2K", "high", "medium", "low", "auto"]'::jsonb AS quality_options
)
UPDATE ai_model_configs AS config
SET parameter_schema_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(config.parameter_schema_json, '{}'::jsonb),
              '{aspectRatio}',
              COALESCE(config.parameter_schema_json->'aspectRatio', '{}'::jsonb)
                || jsonb_build_object(
                  'label', COALESCE(config.parameter_schema_json->'aspectRatio'->>'label', '画面比例'),
                  'type', 'enum',
                  'required', COALESCE((config.parameter_schema_json->'aspectRatio'->>'required')::boolean, false),
                  'options', option_sets.aspect_options,
                  'enum', option_sets.aspect_options
                ),
              true
            ),
            '{aspectRatio,options}',
            option_sets.aspect_options,
            true
          ),
          '{aspectRatio,enum}',
          option_sets.aspect_options,
          true
        ),
        '{quality,options}',
        option_sets.quality_options,
        true
      ),
      '{quality,enum}',
      option_sets.quality_options,
      true
    ),
    updated_at = now()
FROM option_sets
WHERE config.model_code IN ('gpt-image-2-cn', 'gpt-image-2-reference-cn');

WITH option_sets AS (
  SELECT '[
    "auto",
    "1:1", "1024x1024", "2048x2048", "2880x2880",
    "2:3", "1024x1536", "2048x3072", "2336x3504",
    "3:2", "1536x1024", "3072x2048", "3504x2336",
    "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
    "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
    "4:5", "1024x1280", "2048x2560", "2560x3200",
    "5:4", "1280x1024", "2560x2048", "3200x2560",
    "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
    "16:9", "1824x1024", "3840x1280", "3840x2160",
    "21:9"
  ]'::jsonb AS aspect_options
)
UPDATE ai_model_configs AS config
SET parameter_schema_json = jsonb_set(
      COALESCE(config.parameter_schema_json, '{}'::jsonb),
      '{size,options}',
      option_sets.aspect_options,
      true
    ),
    updated_at = now()
FROM option_sets
WHERE config.model_code = 'gpt-image-2-reference-cn'
  AND config.parameter_schema_json ? 'size';

WITH option_sets AS (
  SELECT
    '[
      "auto",
      "1:1", "1024x1024", "2048x2048", "2880x2880",
      "2:3", "1024x1536", "2048x3072", "2336x3504",
      "3:2", "1536x1024", "3072x2048", "3504x2336",
      "3:4", "768x1024", "1536x2048", "2304x3072", "2448x3264",
      "4:3", "1024x768", "2048x1536", "3072x2304", "3264x2448",
      "4:5", "1024x1280", "2048x2560", "2560x3200",
      "5:4", "1280x1024", "2560x2048", "3200x2560",
      "9:16", "1024x1824", "1280x3840", "1920x3840", "2160x3840",
      "16:9", "1824x1024", "3840x1280", "3840x2160",
      "21:9"
    ]'::jsonb AS aspect_options,
    '["standard", "hd", "2K", "high", "medium", "low", "auto"]'::jsonb AS quality_options
)
UPDATE runtime_config_entries AS config
SET value_json = jsonb_set(
      jsonb_set(
        config.value_json,
        '{templates}',
        (
          SELECT jsonb_agg(
            CASE template->>'key'
              WHEN 'aspectRatio' THEN jsonb_set(template, '{options}', option_sets.aspect_options, true)
              WHEN 'quality' THEN jsonb_set(template, '{options}', option_sets.quality_options, true)
              ELSE template
            END
          )
          FROM jsonb_array_elements(COALESCE(config.value_json->'templates', '[]'::jsonb)) AS template
        ),
        true
      ),
      '{updatedByBaseline}',
      to_jsonb('user-centric-reference-seed'::text),
      true
    ),
    updated_at = now()
FROM option_sets
WHERE config.key = 'model.parameter_templates';


-- Source: 0072_saier_seedance_video_models.sql
ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_image',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'custom_http'
  ));

WITH saier_configs AS (
  SELECT *
  FROM (VALUES
    (
      'doubao-seedance-2-0',
      'Seedance 2.0（塞尔）',
      'doubao-seedance-2-0',
      '["480p","720p","1080p"]'::jsonb,
      140,
      21,
      false
    ),
    (
      'doubao-seedance-2-0-fast',
      'Seedance 2.0 Fast（塞尔）',
      'doubao-seedance-2-0-fast',
      '["480p","720p"]'::jsonb,
      110,
      22,
      true
    ),
    (
      'doubao-seedance-2.0-mini',
      'Seedance 2.0 Mini（塞尔）',
      'doubao-seedance-2.0-mini',
      '["480p","720p"]'::jsonb,
      70,
      23,
      false
    )
  ) AS v(model_code, display_name, provider_model, resolutions, base_credits, sort_order, recommended)
), prepared AS (
  SELECT
    saier_configs.*,
    jsonb_build_object(
      'prompt', jsonb_build_object('label', '提示词', 'type', 'string', 'required', true, 'maxLength', 2000),
      'firstFrame', jsonb_build_object('label', '首帧图', 'type', 'file', 'required', false),
      'lastFrame', jsonb_build_object('label', '尾帧图', 'type', 'file', 'required', false),
      'referenceImages', jsonb_build_object('label', '参考图', 'type', 'file[]', 'required', false, 'maximum', 9),
      'sourceVideo', jsonb_build_object('label', '参考视频', 'type', 'file', 'required', false),
      'referenceAudio', jsonb_build_object('label', '参考音频', 'type', 'file', 'required', false),
      'aspectRatio', jsonb_build_object('label', '视频比例', 'type', 'enum', 'providerKey', 'ratio', 'required', false, 'options', '["16:9","9:16","1:1","4:3","3:4"]'::jsonb, 'adminEditableOptions', true),
      'resolution', jsonb_build_object('label', '分辨率', 'type', 'enum', 'required', false, 'options', resolutions, 'adminEditableOptions', true),
      'durationSec', jsonb_build_object('label', '视频时长', 'type', 'integer', 'providerKey', 'seconds', 'required', false, 'minimum', -1, 'maximum', 15),
      'seed', jsonb_build_object('label', '随机种子', 'type', 'integer', 'required', false, 'minimum', 0),
      'cameraFixed', jsonb_build_object('label', '固定镜头', 'type', 'boolean', 'providerKey', 'camera_fixed', 'required', false),
      'generateAudio', jsonb_build_object('label', '生成音频', 'type', 'boolean', 'providerKey', 'generate_audio', 'required', false),
      'returnLastFrame', jsonb_build_object('label', '返回尾帧', 'type', 'boolean', 'providerKey', 'return_last_frame', 'required', false),
      'watermark', jsonb_build_object('label', '水印', 'type', 'boolean', 'required', false)
    ) AS parameter_schema,
    jsonb_build_object(
      'maxPromptLength', 2000,
      'maxReferences', 9,
      'supportsFirstFrame', true,
      'supportsLastFrame', true,
      'supportsReferenceImages', true,
      'supportsSourceVideo', true,
      'supportsReferenceAudio', true,
      'supportsAudio', true,
      'minDurationSec', 4,
      'maxDurationSec', 15,
      'supportedRatios', '["16:9","9:16","1:1","4:3","3:4"]'::jsonb,
      'supportedResolutions', resolutions,
      'allowedMimeTypes', '["image/jpeg","image/png","image/webp","image/bmp","image/tiff","image/gif","image/heic","image/heif","video/mp4","video/quicktime","audio/mpeg","audio/wav"]'::jsonb
    ) AS limits
  FROM saier_configs
)
INSERT INTO ai_model_configs (
  id,
  model_code,
  display_name,
  provider_name,
  provider_model,
  provider_protocol,
  invocation_mode,
  media_type,
  task_modes_json,
  capabilities_json,
  parameter_schema_json,
  default_params_json,
  provider_config_json,
  pricing_json,
  limits_json,
  ui_config_json,
  status,
  sort_order,
  remark
)
SELECT
  gen_random_uuid(),
  prepared.model_code,
  prepared.display_name,
  '塞尔',
  prepared.provider_model,
  'saier_video',
  'async_polling',
  'video',
  '["video.text_to_video","video.image_to_video","video.first_last_frame_to_video","video.reference_image_to_video","video.video_to_video","video.image_video_to_video"]'::jsonb,
  '{"prompt":true,"firstFrame":true,"lastFrame":true,"referenceImages":true,"referenceVideo":true,"referenceAudio":true,"audio":true,"asyncPolling":true,"modelFamily":"seedance","membershipPriorityEligible":true}'::jsonb,
  prepared.parameter_schema,
  '{"aspectRatio":"16:9","resolution":"720p","durationSec":5,"cameraFixed":false,"generateAudio":true,"returnLastFrame":false,"watermark":false}'::jsonb,
  jsonb_build_object(
    'baseURL', 'https://saierapi.cn',
    'createTaskEndpoint', '/v1/video/generations',
    'queryTaskEndpoint', '/v1/video/generations/{taskId}',
    'downloadTaskEndpoint', '/v1/videos/{taskId}/content',
    'apiKeyEnv', 'SAI_ER_API_KEY',
    'requestFormat', 'saier_openai_video',
    'timeoutMs', 600000,
    'inputSchema', jsonb_build_object(
      'source', jsonb_build_object('provider', 'Saier OpenAI-compatible Seedance video generation', 'endpoint', '/v1/video/generations'),
      'createTaskRequest', jsonb_build_object(
        'model', jsonb_build_object('type', 'string', 'required', true),
        'prompt', jsonb_build_object('type', 'string', 'required', true),
        'seconds', jsonb_build_object('type', 'string', 'required', false),
        'metadata', jsonb_build_object('type', 'object', 'required', false)
      )
    ),
    'outputSchema', jsonb_build_object(
      'createTaskResponse', jsonb_build_object('id', jsonb_build_object('type', 'string', 'required', false), 'task_id', jsonb_build_object('type', 'string', 'required', false)),
      'queryTaskResponse', jsonb_build_object('status', jsonb_build_object('type', 'string', 'required', true), 'metadata', jsonb_build_object('type', 'object', 'required', false), 'content', jsonb_build_object('type', 'object', 'required', false))
    )
  ),
  jsonb_build_object('unit', 'video', 'baseCredits', prepared.base_credits, 'durationMultipliers', '{"4":0.9,"5":1,"10":1.8,"15":2.6}'::jsonb, 'resolutionMultipliers', CASE WHEN prepared.resolutions ? '1080p' THEN '{"480p":0.8,"720p":1,"1080p":1.35}'::jsonb ELSE '{"480p":0.8,"720p":1}'::jsonb END),
  prepared.limits,
  jsonb_build_object(
    'label', prepared.display_name,
    'group', '塞尔 Seedance',
    'recommended', prepared.recommended,
    'visible', true,
    'pipeline', 'video',
    'videoCategory', 'reference',
    'videoCategoryLabel', '参考生视频',
    'modelKind', 'video.reference',
    'modelKindLabel', '参考生视频',
    'supportedModes', '["reference","reference_image_to_video","image_to_video","first_last_frame_to_video","video_to_video","image_video_to_video"]'::jsonb,
    'parameterDisplayLanguage', 'zh-CN'
  ),
  'active',
  prepared.sort_order,
  '塞尔 OpenAI 兼容视频接口。参考图统一通过 metadata.content 的 reference_image 角色提交。'
FROM prepared
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
  id,
  model_config_id,
  queue_backend,
  submit_queue_name,
  poll_queue_name,
  finalize_queue_name,
  dead_letter_queue_name,
  job_id_template,
  bullmq_job_options_json,
  submit_concurrency_limit,
  provider_rpm_limit,
  provider_concurrent_limit,
  polling_interval_ms,
  polling_concurrency_limit,
  polling_backoff_json,
  retry_policy_json,
  circuit_breaker_json,
  status
)
SELECT
  gen_random_uuid(),
  model.id,
  'bullmq',
  'generation-submit-video',
  'generation-poll-video',
  'generation-finalize-artifact',
  'generation-dead-letter',
  'generation:video:{stage}:{taskId}',
  '{"attempts":3,"backoff":{"type":"exponential","delay":3000},"removeOnComplete":{"age":86400,"count":10000},"removeOnFail":{"age":604800,"count":50000}}'::jsonb,
  5,
  60,
  5,
  15000,
  20,
  '{"strategy":"fixed","intervalMs":15000,"maxAttempts":240}'::jsonb,
  '{"submitAttempts":3,"pollAttempts":240,"finalizeAttempts":3}'::jsonb,
  '{"failureThreshold":5,"windowMs":60000,"cooldownMs":120000}'::jsonb,
  'active'
FROM ai_model_configs AS model
WHERE model.model_code IN (
  'doubao-seedance-2-0',
  'doubao-seedance-2-0-fast',
  'doubao-seedance-2.0-mini'
)
ON CONFLICT (model_config_id) DO UPDATE SET
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

-- End Source: 0072_saier_seedance_video_models.sql

UPDATE ai_model_configs
SET provider_config_json = jsonb_set(
      provider_config_json,
      '{timeoutMs}',
      to_jsonb(CASE media_type
        WHEN 'video' THEN 10800000
        ELSE 3600000
      END),
      true
    ),
    updated_at = now()
WHERE media_type IN ('image', 'video');
