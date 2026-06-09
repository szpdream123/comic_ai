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
  '{"prompt":true,"firstFrame":true,"lastFrame":false,"audio":false,"asyncPolling":true}'::jsonb,
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
