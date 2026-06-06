import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface AdminModelConfigView {
  id: string;
  modelCode: string;
  displayName: string;
  providerName: string;
  providerModel: string;
  providerProtocol: string;
  invocationMode: string;
  mediaType: string;
  taskModes: string[];
  capabilities: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  providerConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  limits: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  status: string;
  sortOrder: number;
  remark: string | null;
  dispatchPolicy: AdminModelDispatchPolicyView | null;
}

export interface AdminModelDispatchPolicyView {
  id: string;
  submitQueueName: string;
  pollQueueName: string | null;
  finalizeQueueName: string | null;
  providerRpmLimit: number;
  providerConcurrentLimit: number;
  submitConcurrencyLimit: number;
  pollingIntervalMs: number;
  pollingConcurrencyLimit: number;
  status: string;
}

export interface AdminModelTemplateView {
  id: string;
  name: string;
  providerName: string;
  providerProtocol: string;
  invocationMode: string;
  mediaType: string;
  family: string;
  adapterMode: "native" | "standard_http_proxy";
  modelCodeHint: string;
  providerModelHint: string;
  allowedTaskModes: string[];
  defaultTaskModes: string[];
  promptLimit: AdminModelPromptLimitView;
  providerConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
  defaultParams: Record<string, unknown>;
  limits: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
  dispatchPolicy: Omit<AdminModelDispatchPolicyView, "id" | "status">;
}

export interface AdminModelPromptLimitView {
  maxLength: number;
  unit: "characters" | "tokens";
  label: string;
  source: "official" | "provider_proxy" | "platform_default";
  sourceName: string;
  sourceUrl: string;
  note: string;
}

const IMAGE_MARKET_TASK_MODES = ["image.generate", "image.image_to_image", "image.edit", "image.reference_generate"];
const VIDEO_MARKET_TASK_MODES = [
  "video.text_to_video",
  "video.image_to_video",
  "video.first_last_frame_to_video",
  "video.reference_image_to_video",
  "video.video_to_video",
  "video.image_video_to_video",
];
const VIDEO_TEXT_ONLY = ["video.text_to_video"];
const VIDEO_TEXT_IMAGE = ["video.text_to_video", "video.image_to_video"];
const VIDEO_TEXT_IMAGE_LAST = ["video.text_to_video", "video.image_to_video", "video.first_last_frame_to_video"];
const VIDEO_IMAGE_ONLY = ["video.image_to_video"];
const VIDEO_IMAGE_LAST = ["video.image_to_video", "video.first_last_frame_to_video"];
const VIDEO_FULL_IMAGE_REFERENCE = ["video.text_to_video", "video.image_to_video", "video.first_last_frame_to_video", "video.reference_image_to_video"];
const VIDEO_WITH_SOURCE_VIDEO = ["video.text_to_video", "video.image_to_video", "video.video_to_video"];
const VIDEO_WITH_IMAGE_AND_VIDEO = ["video.image_to_video", "video.video_to_video", "video.image_video_to_video"];
const PROMPT_LIMITS = {
  openAiImage: promptLimit(32000, "characters", "OpenAI Images API", "official", "https://platform.openai.com/docs/api-reference/images"),
  imagen4: promptLimit(480, "tokens", "Google Vertex AI Imagen 4", "official", "https://cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/4-0-generate-preview-06-06"),
  fluxKontext: promptLimit(2083, "characters", "Black Forest Labs FLUX Kontext API", "official", "https://docs.bfl.ml/api-reference/tasks/edit-or-create-an-image-with-flux-kontext-max"),
  runwayVideo: promptLimit(1000, "characters", "Runway API", "official", "https://docs.dev.runwayml.com/api"),
  seedanceCloudflare: promptLimit(2000, "characters", "Cloudflare Workers AI Seedance 2.0", "provider_proxy", "https://developers.cloudflare.com/ai/models/bytedance/seedance-2.0/"),
  pixverseCloudflare: promptLimit(2048, "characters", "Cloudflare Workers AI PixVerse V6", "provider_proxy", "https://developers.cloudflare.com/ai/models/pixverse/v6/"),
  hailuoCloudflare: promptLimit(2000, "characters", "Cloudflare Workers AI MiniMax Hailuo", "provider_proxy", "https://developers.cloudflare.com/ai/models/minimax/hailuo-2.3/"),
  lumaAgents: promptLimit(6000, "characters", "Luma Agents API", "provider_proxy", "https://docs.agents.lumalabs.ai/api/resources/generations/methods/create"),
  klingProxy: promptLimit(2500, "characters", "Kling 3.0 API 代理文档", "provider_proxy", "https://aivideoapi.ai/docs/video-generation/kling-3"),
  soraProxy: promptLimit(6000, "characters", "Sora 2 API 代理文档", "provider_proxy", "https://runware.ai/docs/models/openai-sora-2"),
  wanProxy: promptLimit(800, "characters", "Wan 2.2 API 代理文档", "provider_proxy", "https://mule.mintlify.app/api-reference/endpoint/alibaba/wan2.2-t2v-plus/generation"),
  imageDefault: promptLimit(4000, "characters", "平台默认图片提示词限制", "platform_default", "", "官方未公开精确上限，按平台保守默认值限制。"),
  videoDefault: promptLimit(2000, "characters", "平台默认视频提示词限制", "platform_default", "", "官方未公开精确上限，按平台保守默认值限制。"),
};

function promptLimit(
  maxLength: number,
  unit: "characters" | "tokens",
  sourceName: string,
  source: AdminModelPromptLimitView["source"],
  sourceUrl: string,
  note = "",
): AdminModelPromptLimitView {
  return {
    maxLength,
    unit,
    label: `${maxLength.toLocaleString("zh-CN")} ${unit === "tokens" ? "tokens" : "字符"}`,
    source,
    sourceName,
    sourceUrl,
    note,
  };
}

export const ADMIN_MODEL_TEMPLATES: AdminModelTemplateView[] = [
  imageTemplate({
    id: "google-nano-banana-image",
    name: "Google · Nano Banana",
    providerName: "google",
    modelCodeHint: "nano-banana-image",
    providerModelHint: "nano-banana",
    baseCredits: 80,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "Nano Banana",
  }),
  imageTemplate({
    id: "google-nano-banana-2-image",
    name: "Google · Nano Banana 2",
    providerName: "google",
    modelCodeHint: "nano-banana-2-image",
    providerModelHint: "nano-banana-2",
    baseCredits: 100,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "Nano Banana",
  }),
  imageTemplate({
    id: "google-nano-banana-fast-image",
    name: "Google · Nano Banana Fast",
    providerName: "google",
    modelCodeHint: "nano-banana-fast-image",
    providerModelHint: "nano-banana-fast",
    baseCredits: 60,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "Nano Banana",
  }),
  imageTemplate({
    id: "jimeng-5-image",
    name: "火山引擎 · 即梦 5.0 图片",
    providerName: "volcengine",
    modelCodeHint: "jimeng-5-image",
    providerModelHint: "jimeng-5.0",
    baseCredits: 110,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "即梦",
  }),
  imageTemplate({
    id: "jimeng-45-image",
    name: "火山引擎 · 即梦 4.5 图片",
    providerName: "volcengine",
    modelCodeHint: "jimeng-4-5-image",
    providerModelHint: "jimeng-4.5",
    baseCredits: 95,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "即梦",
  }),
  imageTemplate({
    id: "jimeng-40-image",
    name: "火山引擎 · 即梦 4.0 图片",
    providerName: "volcengine",
    modelCodeHint: "jimeng-4-0-image",
    providerModelHint: "jimeng-4.0",
    baseCredits: 80,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "即梦",
  }),
  {
    ...imageTemplate({
      id: "openai-image2",
      name: "OpenAI · Image 2",
      providerName: "openai",
      modelCodeHint: "image2",
      providerModelHint: "gpt-image-2",
      baseCredits: 90,
      defaultTaskModes: IMAGE_MARKET_TASK_MODES,
      promptLimit: PROMPT_LIMITS.openAiImage,
      group: "OpenAI",
    }),
    providerProtocol: "openai_images",
    adapterMode: "native",
    providerConfig: {
      baseURL: "https://api.openai.com",
      endpoint: "/v1/images/generations",
      editEndpoint: "/v1/images/edits",
      apiKeyEnv: "",
      requestFormat: "openai_images",
      resultFormat: "b64_json",
    },
  },
  imageTemplate({
    id: "google-imagen-4-image",
    name: "Google · Imagen 4",
    providerName: "google",
    modelCodeHint: "imagen-4-image",
    providerModelHint: "imagen-4",
    baseCredits: 95,
    defaultTaskModes: ["image.generate", "image.image_to_image", "image.reference_generate"],
    promptLimit: PROMPT_LIMITS.imagen4,
    group: "Google",
  }),
  imageTemplate({
    id: "qwen-image-image",
    name: "通义千问 · Qwen Image",
    providerName: "alibaba",
    modelCodeHint: "qwen-image",
    providerModelHint: "qwen-image",
    baseCredits: 70,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.imageDefault,
    group: "Qwen",
  }),
  imageTemplate({
    id: "flux-kontext-image",
    name: "Black Forest Labs · Flux Kontext",
    providerName: "bfl",
    modelCodeHint: "flux-kontext-image",
    providerModelHint: "flux-kontext",
    baseCredits: 90,
    defaultTaskModes: IMAGE_MARKET_TASK_MODES,
    promptLimit: PROMPT_LIMITS.fluxKontext,
    group: "Flux",
  }),
  videoTemplate({
    id: "kling-30-video",
    name: "可灵 · 3.0 视频",
    providerName: "kling",
    modelCodeHint: "kling-3-0-video",
    providerModelHint: "kling-3.0",
    baseCredits: 220,
    taskModes: VIDEO_FULL_IMAGE_REFERENCE,
    promptLimit: PROMPT_LIMITS.klingProxy,
    group: "可灵",
  }),
  videoTemplate({
    id: "kling-26-video",
    name: "可灵 · 2.6 视频",
    providerName: "kling",
    modelCodeHint: "kling-2-6-video",
    providerModelHint: "kling-2.6",
    baseCredits: 190,
    taskModes: VIDEO_IMAGE_LAST,
    promptLimit: PROMPT_LIMITS.klingProxy,
    group: "可灵",
  }),
  videoTemplate({
    id: "kling-25-video",
    name: "可灵 · 2.5 视频",
    providerName: "kling",
    modelCodeHint: "kling-2-5-video",
    providerModelHint: "kling-2.5",
    baseCredits: 170,
    taskModes: VIDEO_IMAGE_LAST,
    promptLimit: PROMPT_LIMITS.klingProxy,
    group: "可灵",
  }),
  videoTemplate({
    id: "grok-video",
    name: "Grok · 视频",
    providerName: "xai",
    modelCodeHint: "grok-video",
    providerModelHint: "grok-video",
    baseCredits: 220,
    taskModes: VIDEO_TEXT_IMAGE,
    promptLimit: PROMPT_LIMITS.videoDefault,
    group: "Grok",
  }),
  {
    ...videoTemplate({
      id: "seedance-20-video",
      name: "火山引擎 · Seedance 2.0",
      providerName: "volcengine",
      modelCodeHint: "seedance-2-0-video",
      providerModelHint: "seedance-2-0",
      baseCredits: 140,
      taskModes: VIDEO_FULL_IMAGE_REFERENCE,
      promptLimit: PROMPT_LIMITS.seedanceCloudflare,
      group: "Seedance",
    }),
    providerProtocol: "volcengine_ark_video",
    adapterMode: "native",
    providerConfig: volcengineVideoProviderConfig(),
  },
  {
    ...videoTemplate({
      id: "seedance-20-pro-video",
      name: "火山引擎 · Seedance 2.0 Pro",
      providerName: "volcengine",
      modelCodeHint: "seedance-2-0-pro-video",
      providerModelHint: "seedance-2-0-pro",
      baseCredits: 180,
      taskModes: VIDEO_FULL_IMAGE_REFERENCE,
      promptLimit: PROMPT_LIMITS.seedanceCloudflare,
      group: "Seedance",
    }),
    providerProtocol: "volcengine_ark_video",
    adapterMode: "native",
    providerConfig: volcengineVideoProviderConfig(),
  },
  {
    ...videoTemplate({
      id: "seedance-fast-video",
      name: "火山引擎 · Seedance Fast",
      providerName: "volcengine",
      modelCodeHint: "seedance-fast-video",
      providerModelHint: "seedance-fast",
      baseCredits: 110,
      taskModes: VIDEO_TEXT_IMAGE,
      promptLimit: PROMPT_LIMITS.seedanceCloudflare,
      group: "Seedance",
    }),
    providerProtocol: "volcengine_ark_video",
    adapterMode: "native",
    providerConfig: volcengineVideoProviderConfig(),
  },
  videoTemplate({
    id: "happy-horse-video",
    name: "Happy Horse · 视频",
    providerName: "happy-horse",
    modelCodeHint: "happy-horse-video",
    providerModelHint: "happy-horse-video",
    baseCredits: 160,
    taskModes: VIDEO_WITH_IMAGE_AND_VIDEO,
    promptLimit: PROMPT_LIMITS.videoDefault,
    group: "Happy Horse",
  }),
  videoTemplate({
    id: "google-veo-31-video",
    name: "Google · Veo 3.1",
    providerName: "google",
    modelCodeHint: "veo-3-1-video",
    providerModelHint: "veo-3.1",
    baseCredits: 260,
    taskModes: VIDEO_TEXT_IMAGE_LAST,
    promptLimit: PROMPT_LIMITS.runwayVideo,
    group: "Veo",
  }),
  videoTemplate({
    id: "openai-sora-2-video",
    name: "OpenAI · Sora 2",
    providerName: "openai",
    modelCodeHint: "sora-2-video",
    providerModelHint: "sora-2",
    baseCredits: 280,
    taskModes: VIDEO_WITH_SOURCE_VIDEO,
    promptLimit: PROMPT_LIMITS.soraProxy,
    group: "Sora",
  }),
  videoTemplate({
    id: "runway-gen4-video",
    name: "Runway · Gen-4",
    providerName: "runway",
    modelCodeHint: "runway-gen-4-video",
    providerModelHint: "gen-4",
    baseCredits: 240,
    taskModes: VIDEO_IMAGE_ONLY,
    promptLimit: PROMPT_LIMITS.runwayVideo,
    group: "Runway",
  }),
  videoTemplate({
    id: "luma-ray3-video",
    name: "Luma · Ray 3",
    providerName: "luma",
    modelCodeHint: "luma-ray-3-video",
    providerModelHint: "ray-3",
    baseCredits: 230,
    taskModes: VIDEO_TEXT_IMAGE_LAST,
    promptLimit: PROMPT_LIMITS.lumaAgents,
    group: "Luma",
  }),
  videoTemplate({
    id: "pixverse-5-video",
    name: "PixVerse · 5.0",
    providerName: "pixverse",
    modelCodeHint: "pixverse-5-video",
    providerModelHint: "pixverse-5",
    baseCredits: 180,
    taskModes: VIDEO_FULL_IMAGE_REFERENCE,
    promptLimit: PROMPT_LIMITS.pixverseCloudflare,
    group: "PixVerse",
  }),
  videoTemplate({
    id: "pika-25-video",
    name: "Pika · 2.5",
    providerName: "pika",
    modelCodeHint: "pika-2-5-video",
    providerModelHint: "pika-2.5",
    baseCredits: 170,
    taskModes: VIDEO_WITH_SOURCE_VIDEO,
    promptLimit: PROMPT_LIMITS.videoDefault,
    group: "Pika",
  }),
  videoTemplate({
    id: "hailuo-02-video",
    name: "MiniMax · Hailuo 02",
    providerName: "minimax",
    modelCodeHint: "hailuo-02-video",
    providerModelHint: "hailuo-02",
    baseCredits: 170,
    taskModes: VIDEO_TEXT_IMAGE,
    promptLimit: PROMPT_LIMITS.hailuoCloudflare,
    group: "Hailuo",
  }),
  videoTemplate({
    id: "wan-22-video",
    name: "通义万相 · Wan 2.2",
    providerName: "alibaba",
    modelCodeHint: "wan-2-2-video",
    providerModelHint: "wan-2.2",
    baseCredits: 150,
    taskModes: VIDEO_TEXT_IMAGE,
    promptLimit: PROMPT_LIMITS.wanProxy,
    group: "Wan",
  }),
];

interface AdminModelConfigRow {
  id: string;
  model_code: string;
  display_name: string;
  provider_name: string;
  provider_model: string;
  provider_protocol: string;
  invocation_mode: string;
  media_type: string;
  task_modes_json: unknown;
  capabilities_json: unknown;
  parameter_schema_json: unknown;
  default_params_json: unknown;
  provider_config_json: unknown;
  pricing_json: unknown;
  limits_json: unknown;
  ui_config_json: unknown;
  status: string;
  sort_order: number | string;
  remark: string | null;
  dispatch_policy_json: unknown;
}

export function createAdminModelConfigService(deps: { db: SqlDatabase }) {
  function listModelTemplates() {
    return {
      data: ADMIN_MODEL_TEMPLATES.map((template) => cloneJson(template) as AdminModelTemplateView),
      meta: {
        total: ADMIN_MODEL_TEMPLATES.length,
        nativeAdapterCount: ADMIN_MODEL_TEMPLATES.filter((template) => template.adapterMode === "native").length,
      },
    };
  }

  async function validateModelDraft(input: AdminModelWriteInput & { id?: string }) {
    const failedItems = validateModelDraftFailedItems(input);
    const modelCode = readString(input.modelCode);
    if (modelCode) {
      const existing = await queryOne<{ id: string }>(
        deps.db,
        "SELECT id FROM ai_model_configs WHERE model_code = $1 LIMIT 1",
        [modelCode],
      );
      if (existing && existing.id !== input.id) {
        failedItems.push({
          step: "business",
          field: "modelCode",
          message: "模型编码已存在，请换一个唯一编码。",
        });
      }
    }
    return {
      status: 200,
      body: {
        data: {
          ok: failedItems.length === 0,
          failedItems,
        },
      },
    };
  }

  async function probeModelConfig(input: {
    id: string;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const model = await getModel(input.id);
    if (!model) return error(404, "admin_model_not_found", "模型不存在");
    const launchCheck = modelLaunchCheck(model);
    const checks = launchCheck.ok
      ? [
          { key: "static", label: "静态配置", status: "passed" },
          { key: "adapter", label: "后端适配器", status: hasSupportedAdapter(model.providerProtocol) ? "passed" : "warning" },
        ]
      : launchCheck.failedItems.map((item) => ({
          key: item.key,
          label: item.label,
          status: "failed",
          message: item.message,
        }));
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: "admin.model.probed",
      targetType: "ai_model_config",
      targetId: model.id,
      reason,
      sensitive: true,
      metadata: {
        modelCode: model.modelCode,
        providerName: model.providerName,
        providerProtocol: model.providerProtocol,
        ok: launchCheck.ok,
        failedKeys: launchCheck.failedItems.map((item) => item.key),
        actorAdminAccountId: input.actorAdminAccountId,
      },
    });
    return {
      status: 200,
      body: {
        data: {
          ok: launchCheck.ok,
          checks,
          checkedAt: input.now.toISOString(),
        },
      },
    };
  }

  async function listModels(input: {
    keyword?: string | null;
    status?: string | null;
    mediaType?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;
    const filters: string[] = [];
    const params: unknown[] = [];

    const keyword = input.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      filters.push(`(
        m.model_code ILIKE $${params.length}
        OR m.display_name ILIKE $${params.length}
        OR m.provider_name ILIKE $${params.length}
      )`);
    }

    const status = input.status?.trim();
    if (status) {
      params.push(status);
      filters.push(`m.status = $${params.length}`);
    }

    const mediaType = input.mediaType?.trim();
    if (mediaType) {
      params.push(mediaType);
      filters.push(`m.media_type = $${params.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM ai_model_configs m
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminModelConfigRow>(
      `
        SELECT
          m.*,
          CASE
            WHEN p.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', p.id,
              'submitQueueName', p.submit_queue_name,
              'pollQueueName', p.poll_queue_name,
              'finalizeQueueName', p.finalize_queue_name,
              'providerRpmLimit', p.provider_rpm_limit,
              'providerConcurrentLimit', p.provider_concurrent_limit,
              'submitConcurrencyLimit', p.submit_concurrency_limit,
              'pollingIntervalMs', p.polling_interval_ms,
              'pollingConcurrencyLimit', p.polling_concurrency_limit,
              'status', p.status
            )
          END AS dispatch_policy_json
        FROM ai_model_configs m
        LEFT JOIN ai_model_dispatch_policies p
          ON p.model_config_id = m.id
        ${whereSql}
        ORDER BY m.sort_order ASC, m.updated_at DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset],
    );

    return {
      data: result.rows.map(modelFromRow),
      meta: {
        page,
        pageSize,
        total: Number(total.rows[0]?.count ?? 0),
      },
    };
  }

  async function getModel(id: string) {
    const row = await queryOne<AdminModelConfigRow>(
      deps.db,
      `
        SELECT
          m.*,
          CASE
            WHEN p.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'id', p.id,
              'submitQueueName', p.submit_queue_name,
              'pollQueueName', p.poll_queue_name,
              'finalizeQueueName', p.finalize_queue_name,
              'providerRpmLimit', p.provider_rpm_limit,
              'providerConcurrentLimit', p.provider_concurrent_limit,
              'submitConcurrencyLimit', p.submit_concurrency_limit,
              'pollingIntervalMs', p.polling_interval_ms,
              'pollingConcurrencyLimit', p.polling_concurrency_limit,
              'status', p.status
            )
          END AS dispatch_policy_json
        FROM ai_model_configs m
        LEFT JOIN ai_model_dispatch_policies p
          ON p.model_config_id = m.id
        WHERE m.id = $1
        LIMIT 1
      `,
      [id],
    );

    return row ? modelFromRow(row) : undefined;
  }

  async function createModel(input: AdminModelWriteInput & AdminModelWriteContext) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const validation = validateModelWriteInput(input, true);
    if (validation) return validation;

    const id = uuidFromIdempotencyKey(input.idempotencyKey);
    const now = input.now;
    await deps.db.query(
      `
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
          remark,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb,
          $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19, $20, $20
        )
      `,
      [
        id,
        input.modelCode!.trim(),
        input.displayName!.trim(),
        input.providerName!.trim(),
        input.providerModel!.trim(),
        input.providerProtocol!.trim(),
        input.invocationMode!.trim(),
        input.mediaType!.trim(),
        JSON.stringify(input.taskModes ?? []),
        JSON.stringify(input.capabilities ?? {}),
        JSON.stringify(input.parameterSchema ?? {}),
        JSON.stringify(input.defaultParams ?? {}),
        JSON.stringify(input.providerConfig ?? {}),
        JSON.stringify(input.pricing ?? {}),
        JSON.stringify(input.limits ?? {}),
        JSON.stringify(input.uiConfig ?? {}),
        input.status?.trim() || "disabled",
        Number(input.sortOrder ?? 100),
        input.remark?.trim() || null,
        now,
      ],
    );
    await upsertDispatchPolicy(id, input.dispatchPolicy, now);
    const model = (await getModel(id))!;
    await recordRevisionAndAudit({
      model,
      eventType: input.auditEventType ?? "admin.model.created",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now,
    });
    return { status: 200, body: { data: model } };
  }

  async function updateModel(input: {
    id: string;
    patch: Partial<AdminModelWriteInput>;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");

    const merged: AdminModelWriteInput = {
      ...existing,
      ...input.patch,
      modelCode: input.patch.modelCode ?? existing.modelCode,
      displayName: input.patch.displayName ?? existing.displayName,
      providerName: input.patch.providerName ?? existing.providerName,
      providerModel: input.patch.providerModel ?? existing.providerModel,
      providerProtocol: input.patch.providerProtocol ?? existing.providerProtocol,
      invocationMode: input.patch.invocationMode ?? existing.invocationMode,
      mediaType: input.patch.mediaType ?? existing.mediaType,
      taskModes: input.patch.taskModes ?? existing.taskModes,
      dispatchPolicy: input.patch.dispatchPolicy ?? existing.dispatchPolicy ?? undefined,
      reason,
    };
    const validation = validateModelWriteInput(merged, true);
    if (validation) return validation;
    await deps.db.query(
      `
        UPDATE ai_model_configs
        SET display_name = $2,
            provider_name = $3,
            provider_model = $4,
            provider_protocol = $5,
            invocation_mode = $6,
            media_type = $7,
            task_modes_json = $8::jsonb,
            capabilities_json = $9::jsonb,
            parameter_schema_json = $10::jsonb,
            default_params_json = $11::jsonb,
            provider_config_json = $12::jsonb,
            pricing_json = $13::jsonb,
            limits_json = $14::jsonb,
            ui_config_json = $15::jsonb,
            sort_order = $16,
            remark = $17,
            updated_at = $18
        WHERE id = $1
      `,
      [
        input.id,
        merged.displayName,
        merged.providerName,
        merged.providerModel,
        merged.providerProtocol,
        merged.invocationMode,
        merged.mediaType,
        JSON.stringify(merged.taskModes ?? []),
        JSON.stringify(merged.capabilities ?? {}),
        JSON.stringify(merged.parameterSchema ?? {}),
        JSON.stringify(merged.defaultParams ?? {}),
        JSON.stringify(merged.providerConfig ?? {}),
        JSON.stringify(merged.pricing ?? {}),
        JSON.stringify(merged.limits ?? {}),
        JSON.stringify(merged.uiConfig ?? {}),
        Number(merged.sortOrder ?? existing.sortOrder),
        merged.remark ?? null,
        input.now,
      ],
    );
    await upsertDispatchPolicy(input.id, merged.dispatchPolicy, input.now);
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.updated",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  async function duplicateModel(input: {
    id: string;
    modelCode: string;
    displayName: string;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    return createModel({
      ...existing,
      id: undefined,
      modelCode: input.modelCode,
      displayName: input.displayName,
      status: "disabled",
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
      dispatchPolicy: existing.dispatchPolicy
        ? {
            ...existing.dispatchPolicy,
            id: undefined,
            submitQueueName: `${existing.dispatchPolicy.submitQueueName}-copy`,
            pollQueueName: existing.dispatchPolicy.pollQueueName
              ? `${existing.dispatchPolicy.pollQueueName}-copy`
              : null,
          }
        : undefined,
      auditEventType: "admin.model.duplicated",
    });
  }

  async function changeStatus(input: {
    id: string;
    status: string;
  } & AdminModelWriteContext) {
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    if (!["active", "disabled", "archived"].includes(input.status)) {
      return error(400, "invalid_model_status", "模型状态不支持");
    }
    if (input.status === "active") {
      const launchCheck = modelLaunchCheck(existing);
      if (!launchCheck.ok) {
        return {
          status: 400,
          body: {
            error: {
              code: "admin_model_launch_check_failed",
              message: "模型上线检查未通过",
              details: { failedItems: launchCheck.failedItems },
            },
          },
        };
      }
    }
    await deps.db.query(
      "UPDATE ai_model_configs SET status = $2, updated_at = $3 WHERE id = $1",
      [input.id, input.status, input.now],
    );
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.status_changed",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  async function listRevisions(input: { id: string; pageSize?: number }) {
    const model = await getModel(input.id);
    if (!model) return error(404, "admin_model_not_found", "模型不存在");
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const result = await deps.db.query<{
      id: string;
      model_config_id: string;
      snapshot_json: unknown;
      changed_by_admin_id: string | null;
      reason: string | null;
      created_at: Date | string;
    }>(
      `
        SELECT id, model_config_id, snapshot_json, changed_by_admin_id, reason, created_at
        FROM ai_model_config_revisions
        WHERE model_config_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [input.id, pageSize],
    );
    return {
      status: 200,
      body: {
        data: result.rows.map((row) => {
          const snapshot = parseJsonObject(row.snapshot_json) as Partial<AdminModelConfigView>;
          return {
            id: row.id,
            modelConfigId: row.model_config_id,
            reason: row.reason,
            changedByAdminId: row.changed_by_admin_id,
            createdAt: new Date(row.created_at).toISOString(),
            snapshot: {
              modelCode: snapshot.modelCode,
              displayName: snapshot.displayName,
              providerModel: snapshot.providerModel,
              status: snapshot.status,
              pricing: snapshot.pricing ?? {},
            },
          };
        }),
        meta: { total: result.rows.length },
      },
    };
  }

  async function rollbackModel(input: {
    id: string;
    revisionId: string;
  } & AdminModelWriteContext) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const existing = await getModel(input.id);
    if (!existing) return error(404, "admin_model_not_found", "模型不存在");
    const revision = await queryOne<{
      id: string;
      snapshot_json: unknown;
    }>(
      deps.db,
      `
        SELECT id, snapshot_json
        FROM ai_model_config_revisions
        WHERE id = $1
          AND model_config_id = $2
        LIMIT 1
      `,
      [input.revisionId, input.id],
    );
    if (!revision) return error(404, "admin_model_revision_not_found", "模型修订不存在");
    const snapshot = parseJsonObject(revision.snapshot_json) as Partial<AdminModelConfigView>;
    const validation = validateModelWriteInput(snapshot as AdminModelWriteInput, true);
    if (validation) return validation;
    await deps.db.query(
      `
        UPDATE ai_model_configs
        SET display_name = $2,
            provider_name = $3,
            provider_model = $4,
            provider_protocol = $5,
            invocation_mode = $6,
            media_type = $7,
            task_modes_json = $8::jsonb,
            capabilities_json = $9::jsonb,
            parameter_schema_json = $10::jsonb,
            default_params_json = $11::jsonb,
            provider_config_json = $12::jsonb,
            pricing_json = $13::jsonb,
            limits_json = $14::jsonb,
            ui_config_json = $15::jsonb,
            status = $16,
            sort_order = $17,
            remark = $18,
            updated_at = $19
        WHERE id = $1
      `,
      [
        input.id,
        snapshot.displayName,
        snapshot.providerName,
        snapshot.providerModel,
        snapshot.providerProtocol,
        snapshot.invocationMode,
        snapshot.mediaType,
        JSON.stringify(snapshot.taskModes ?? []),
        JSON.stringify(snapshot.capabilities ?? {}),
        JSON.stringify(snapshot.parameterSchema ?? {}),
        JSON.stringify(snapshot.defaultParams ?? {}),
        JSON.stringify(snapshot.providerConfig ?? {}),
        JSON.stringify(snapshot.pricing ?? {}),
        JSON.stringify(snapshot.limits ?? {}),
        JSON.stringify(snapshot.uiConfig ?? {}),
        snapshot.status ?? "disabled",
        Number(snapshot.sortOrder ?? existing.sortOrder),
        snapshot.remark ?? null,
        input.now,
      ],
    );
    await upsertDispatchPolicy(input.id, snapshot.dispatchPolicy ?? undefined, input.now);
    const model = (await getModel(input.id))!;
    await recordRevisionAndAudit({
      model,
      eventType: "admin.model.rolled_back",
      reason,
      actorAdminAccountId: input.actorAdminAccountId,
      auditOrganizationId: input.auditOrganizationId,
      auditWorkspaceId: input.auditWorkspaceId,
      now: input.now,
    });
    return { status: 200, body: { data: model } };
  }

  return {
    listModelTemplates,
    validateModelDraft,
    probeModelConfig,
    listModels,
    getModel,
    createModel,
    updateModel,
    duplicateModel,
    changeStatus,
    listRevisions,
    rollbackModel,
  };

  async function upsertDispatchPolicy(
    modelConfigId: string,
    policy: AdminModelWriteInput["dispatchPolicy"],
    now: Date,
  ) {
    if (!policy) return;
    await deps.db.query(
      `
        INSERT INTO ai_model_dispatch_policies (
          id,
          model_config_id,
          submit_queue_name,
          poll_queue_name,
          finalize_queue_name,
          provider_rpm_limit,
          provider_concurrent_limit,
          submit_concurrency_limit,
          polling_interval_ms,
          polling_concurrency_limit,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $11)
        ON CONFLICT (model_config_id)
        DO UPDATE SET
          submit_queue_name = EXCLUDED.submit_queue_name,
          poll_queue_name = EXCLUDED.poll_queue_name,
          finalize_queue_name = EXCLUDED.finalize_queue_name,
          provider_rpm_limit = EXCLUDED.provider_rpm_limit,
          provider_concurrent_limit = EXCLUDED.provider_concurrent_limit,
          submit_concurrency_limit = EXCLUDED.submit_concurrency_limit,
          polling_interval_ms = EXCLUDED.polling_interval_ms,
          polling_concurrency_limit = EXCLUDED.polling_concurrency_limit,
          updated_at = EXCLUDED.updated_at
      `,
      [
        policy.id ?? randomUUID(),
        modelConfigId,
        policy.submitQueueName,
        policy.pollQueueName ?? null,
        policy.finalizeQueueName ?? null,
        Number(policy.providerRpmLimit ?? 60),
        Number(policy.providerConcurrentLimit ?? 5),
        Number(policy.submitConcurrencyLimit ?? 5),
        Number(policy.pollingIntervalMs ?? 15000),
        Number(policy.pollingConcurrencyLimit ?? 20),
        now,
      ],
    );
  }

  async function recordRevisionAndAudit(input: {
    model: AdminModelConfigView;
    eventType: string;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    await deps.db.query(
      `
        INSERT INTO ai_model_config_revisions (
          id, model_config_id, snapshot_json, changed_by_admin_id, reason, created_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      `,
      [
        randomUUID(),
        input.model.id,
        JSON.stringify(input.model),
        input.actorAdminAccountId,
        input.reason,
        input.now,
      ],
    );
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: input.eventType,
      targetType: "ai_model_config",
      targetId: input.model.id,
      reason: input.reason,
      sensitive: true,
      metadata: {
        modelCode: input.model.modelCode,
        actorAdminAccountId: input.actorAdminAccountId,
        status: input.model.status,
      },
    });
  }
}

interface AdminModelWriteContext {
  reason: string;
  idempotencyKey: string;
  actorAdminAccountId: string;
  auditOrganizationId: string;
  auditWorkspaceId: string;
  now: Date;
  auditEventType?: string;
}

interface AdminModelWriteInput {
  id?: string;
  modelCode?: string;
  displayName?: string;
  providerName?: string;
  providerModel?: string;
  providerProtocol?: string;
  invocationMode?: string;
  mediaType?: string;
  taskModes?: string[];
  capabilities?: Record<string, unknown>;
  parameterSchema?: Record<string, unknown>;
  defaultParams?: Record<string, unknown>;
  providerConfig?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  limits?: Record<string, unknown>;
  uiConfig?: Record<string, unknown>;
  status?: string;
  sortOrder?: number;
  remark?: string | null;
  dispatchPolicy?: Partial<AdminModelDispatchPolicyView> & {
    submitQueueName?: string;
  };
}

function modelFromRow(row: AdminModelConfigRow): AdminModelConfigView {
  return {
    id: row.id,
    modelCode: row.model_code,
    displayName: row.display_name,
    providerName: row.provider_name,
    providerModel: row.provider_model,
    providerProtocol: row.provider_protocol,
    invocationMode: row.invocation_mode,
    mediaType: row.media_type,
    taskModes: parseJsonArray(row.task_modes_json),
    capabilities: parseJsonObject(row.capabilities_json),
    parameterSchema: parseJsonObject(row.parameter_schema_json),
    defaultParams: parseJsonObject(row.default_params_json),
    providerConfig: parseJsonObject(row.provider_config_json),
    pricing: parseJsonObject(row.pricing_json),
    limits: parseJsonObject(row.limits_json),
    uiConfig: parseJsonObject(row.ui_config_json),
    status: row.status,
    sortOrder: Number(row.sort_order),
    remark: row.remark,
    dispatchPolicy: dispatchPolicyFromJson(row.dispatch_policy_json),
  };
}

function dispatchPolicyFromJson(value: unknown): AdminModelDispatchPolicyView | null {
  const policy = parseJsonObject(value);
  const id = readString(policy.id);
  if (!id) {
    return null;
  }
  return {
    id,
    submitQueueName: readString(policy.submitQueueName) ?? "",
    pollQueueName: readString(policy.pollQueueName),
    finalizeQueueName: readString(policy.finalizeQueueName),
    providerRpmLimit: Number(policy.providerRpmLimit ?? 0),
    providerConcurrentLimit: Number(policy.providerConcurrentLimit ?? 0),
    submitConcurrencyLimit: Number(policy.submitConcurrencyLimit ?? 0),
    pollingIntervalMs: Number(policy.pollingIntervalMs ?? 0),
    pollingConcurrencyLimit: Number(policy.pollingConcurrencyLimit ?? 0),
    status: readString(policy.status) ?? "disabled",
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return parseJsonObject(JSON.parse(value) as unknown);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    return parseJsonArray(JSON.parse(value) as unknown);
  }
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cloneJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function imageTemplate(input: {
  id: string;
  name: string;
  providerName: string;
  modelCodeHint: string;
  providerModelHint: string;
  baseCredits: number;
  defaultTaskModes: string[];
  promptLimit: AdminModelPromptLimitView;
  group: string;
}): AdminModelTemplateView {
  return {
    id: input.id,
    name: input.name,
    providerName: input.providerName,
    providerProtocol: "custom_http",
    invocationMode: "sync",
    mediaType: "image",
    family: input.group,
    adapterMode: "standard_http_proxy",
    modelCodeHint: input.modelCodeHint,
    providerModelHint: input.providerModelHint,
    allowedTaskModes: IMAGE_MARKET_TASK_MODES,
    defaultTaskModes: input.defaultTaskModes,
    promptLimit: input.promptLimit,
    providerConfig: {
      endpoint: `/api/provider-proxy/${input.providerName}/image`,
      apiKeyEnv: "",
      requestFormat: "standard_image_generation",
      resultFormat: "url_or_b64_json",
    },
    pricing: {
      unit: "image",
      baseCredits: input.baseCredits,
      qualityMultipliers: { standard: 1, hd: 1.2, "2K": 1.5 },
    },
    parameterSchema: {
      prompt: { label: "提示词", type: "string", required: true, maxLength: input.promptLimit.maxLength, limitUnit: input.promptLimit.unit },
      negativePrompt: { label: "反向提示词", type: "string", required: false, maxLength: 2000 },
      referenceImages: { label: "参考图", type: "file[]", required: false, maximum: 8 },
      editInstruction: { label: "编辑说明", type: "string", required: false, maxLength: 2000 },
      aspectRatio: { label: "图片比例", type: "enum", required: true, options: ["1:1", "16:9", "9:16", "4:3", "3:4"] },
      quality: { label: "质量", type: "enum", required: false, options: ["standard", "hd", "2K"] },
      count: { label: "数量", type: "integer", required: false, minimum: 1, maximum: 4 },
      seed: { label: "随机种子", type: "integer", required: false, minimum: 0 },
    },
    defaultParams: { aspectRatio: "1:1", quality: "standard", count: 1 },
    limits: {
      maxPromptLength: input.promptLimit.maxLength,
      promptLengthUnit: input.promptLimit.unit,
      promptLimitLabel: input.promptLimit.label,
      promptLimitSource: input.promptLimit.source,
      promptLimitSourceName: input.promptLimit.sourceName,
      promptLimitSourceUrl: input.promptLimit.sourceUrl,
      promptLimitNote: input.promptLimit.note,
      maxReferences: 8,
      maxCount: 4,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    },
    uiConfig: {
      label: input.name,
      group: input.group,
      visible: true,
      pipeline: "image",
      supportedModes: input.defaultTaskModes,
      marketPreset: "文生图 / 图生图 / 图片编辑 / 参考生图",
    },
    dispatchPolicy: {
      submitQueueName: "generation-submit-image",
      pollQueueName: null,
      finalizeQueueName: null,
      providerRpmLimit: 60,
      providerConcurrentLimit: 5,
      submitConcurrencyLimit: 5,
      pollingIntervalMs: 15000,
      pollingConcurrencyLimit: 20,
    },
  };
}

function videoTemplate(input: {
  id: string;
  name: string;
  providerName: string;
  modelCodeHint: string;
  providerModelHint: string;
  baseCredits: number;
  taskModes?: string[];
  promptLimit: AdminModelPromptLimitView;
  group: string;
}): AdminModelTemplateView {
  const taskModes = input.taskModes ?? VIDEO_TEXT_IMAGE;
  const parameterSchema = videoParameterSchema(taskModes, input.promptLimit);
  const assetCapabilities = videoAssetCapabilities(taskModes);
  return {
    id: input.id,
    name: input.name,
    providerName: input.providerName,
    providerProtocol: "custom_http",
    invocationMode: "async_polling",
    mediaType: "video",
    family: input.group,
    adapterMode: "standard_http_proxy",
    modelCodeHint: input.modelCodeHint,
    providerModelHint: input.providerModelHint,
    allowedTaskModes: taskModes,
    defaultTaskModes: taskModes,
    promptLimit: input.promptLimit,
    providerConfig: {
      endpoint: `/api/provider-proxy/${input.providerName}/video`,
      createTaskEndpoint: `/api/provider-proxy/${input.providerName}/video/tasks`,
      queryTaskEndpoint: `/api/provider-proxy/${input.providerName}/video/tasks/{taskId}`,
      apiKeyEnv: "",
      requestFormat: "standard_video_generation",
    },
    pricing: {
      unit: "video",
      baseCredits: input.baseCredits,
      durationMultipliers: { "5": 1, "10": 1.8 },
      resolutionMultipliers: { "720p": 1, "1080p": 1.2, "2K": 1.8 },
    },
    parameterSchema,
    defaultParams: { aspectRatio: "9:16", durationSec: 5, resolution: "1080p" },
    limits: {
      maxPromptLength: input.promptLimit.maxLength,
      promptLengthUnit: input.promptLimit.unit,
      promptLimitLabel: input.promptLimit.label,
      promptLimitSource: input.promptLimit.source,
      promptLimitSourceName: input.promptLimit.sourceName,
      promptLimitSourceUrl: input.promptLimit.sourceUrl,
      promptLimitNote: input.promptLimit.note,
      maxReferences: 4,
      ...assetCapabilities,
      maxDurationSec: 10,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
    },
    uiConfig: {
      label: input.name,
      group: input.group,
      visible: true,
      pipeline: "video",
      supportedModes: taskModes.map((taskMode) => taskMode.replace("video.", "")),
      marketPreset: videoMarketPreset(taskModes),
    },
    dispatchPolicy: {
      submitQueueName: "generation-submit-video",
      pollQueueName: "generation-poll-video",
      finalizeQueueName: "generation-finalize-artifact",
      providerRpmLimit: 60,
      providerConcurrentLimit: 5,
      submitConcurrencyLimit: 5,
      pollingIntervalMs: 15000,
      pollingConcurrencyLimit: 20,
    },
  };
}

function volcengineVideoProviderConfig() {
  return {
    baseURL: "https://ark.cn-beijing.volces.com",
    createTaskEndpoint: "/api/v3/contents/generations/tasks",
    queryTaskEndpoint: "/api/v3/contents/generations/tasks/{taskId}",
    apiKeyEnv: "",
    requestFormat: "volcengine_ark_contents_generation",
  };
}

function videoParameterSchema(taskModes: string[], promptLimit: AdminModelPromptLimitView) {
  const schema: Record<string, unknown> = {
    prompt: { label: "提示词", type: "string", required: true, maxLength: promptLimit.maxLength, limitUnit: promptLimit.unit },
    negativePrompt: { label: "反向提示词", type: "string", required: false, maxLength: 1200 },
    aspectRatio: { label: "视频比例", type: "enum", required: true, options: ["16:9", "9:16", "1:1"] },
    durationSec: { label: "时长", type: "enum", required: true, options: [5, 10] },
    resolution: { label: "分辨率", type: "enum", required: false, options: ["720p", "1080p", "2K"] },
    cameraControl: { label: "镜头运动", type: "enum", required: false, options: ["auto", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down"] },
    motionStrength: { label: "运动强度", type: "enum", required: false, options: ["low", "medium", "high"] },
    seed: { label: "随机种子", type: "integer", required: false, minimum: 0 },
  };
  if (taskModes.includes("video.image_to_video") || taskModes.includes("video.first_last_frame_to_video") || taskModes.includes("video.image_video_to_video")) {
    schema.firstFrame = { label: "首帧图", type: "file", required: taskModes.length === 1 || taskModes.includes("video.image_video_to_video") };
  }
  if (taskModes.includes("video.first_last_frame_to_video")) {
    schema.lastFrame = { label: "尾帧图", type: "file", required: true };
  }
  if (taskModes.includes("video.reference_image_to_video")) {
    schema.referenceImages = { label: "参考图", type: "file[]", required: true, minimum: 1, maximum: 4 };
  }
  if (taskModes.includes("video.video_to_video") || taskModes.includes("video.image_video_to_video")) {
    schema.sourceVideo = { label: "参考/源视频", type: "file", required: true };
  }
  if (taskModes.includes("video.image_video_to_video")) {
    schema.sourceVideoRole = { label: "视频用途", type: "enum", required: false, options: ["reference_motion", "extend", "edit"] };
  }
  return schema;
}

function videoAssetCapabilities(taskModes: string[]) {
  return {
    requiresFirstFrame: taskModes.length === 1 && taskModes.includes("video.image_to_video"),
    supportsFirstFrame: taskModes.includes("video.image_to_video") || taskModes.includes("video.first_last_frame_to_video") || taskModes.includes("video.image_video_to_video"),
    supportsLastFrame: taskModes.includes("video.first_last_frame_to_video"),
    supportsReferenceImages: taskModes.includes("video.reference_image_to_video"),
    supportsSourceVideo: taskModes.includes("video.video_to_video") || taskModes.includes("video.image_video_to_video"),
    supportsImageAndVideoInput: taskModes.includes("video.image_video_to_video"),
    assetRequirementSummary: videoMarketPreset(taskModes),
  };
}

function videoMarketPreset(taskModes: string[]) {
  const labels: string[] = [];
  if (taskModes.includes("video.text_to_video")) labels.push("文生视频");
  if (taskModes.includes("video.image_to_video")) labels.push("首帧图生视频");
  if (taskModes.includes("video.first_last_frame_to_video")) labels.push("首尾帧生视频");
  if (taskModes.includes("video.reference_image_to_video")) labels.push("参考图生视频");
  if (taskModes.includes("video.video_to_video")) labels.push("参考/源视频");
  if (taskModes.includes("video.image_video_to_video")) labels.push("图+视频输入");
  return labels.join(" / ");
}

function validateModelDraftFailedItems(input: AdminModelWriteInput) {
  const failedItems: Array<{ step: string; field: string; message: string }> = [];
  const requiredFields: Array<[keyof AdminModelWriteInput, string, string]> = [
    ["modelCode", "business", "请填写模型编码。"],
    ["displayName", "business", "请填写中文名称。"],
    ["providerName", "template", "请选择供应商模板。"],
    ["providerModel", "business", "请填写供应商真实模型名。"],
    ["providerProtocol", "template", "请选择供应商协议。"],
    ["invocationMode", "template", "请选择调用方式。"],
    ["mediaType", "capability", "请选择模型媒体类型。"],
  ];
  for (const [field, step, message] of requiredFields) {
    if (!readString(input[field])) failedItems.push({ step, field, message });
  }
  const staticValidation = validateModelWriteInput(input, false);
  if (staticValidation) {
    failedItems.push({
      step: "review",
      field: "model",
      message: staticValidation.body.error.message,
    });
  }
  const providerConfig = input.providerConfig ?? {};
  const apiKeyEnv = readString(providerConfig.apiKeyEnv);
  if (!apiKeyEnv) {
    failedItems.push({ step: "business", field: "apiKeyEnv", message: "请选择密钥引用。" });
  } else if (looksLikeSecretValue(apiKeyEnv)) {
    failedItems.push({ step: "business", field: "apiKeyEnv", message: "密钥引用只能保存环境变量名，不能填写明文密钥。" });
  }
  if (input.invocationMode === "async_polling" && !isValidOptionalProviderEndpoint(providerConfig.queryTaskEndpoint)) {
    failedItems.push({ step: "template", field: "queryTaskEndpoint", message: "异步视频模型必须配置合法的轮询接口。" });
  }
  if (input.providerProtocol === "custom_http" && !hasValidProviderEndpoint(providerConfig)) {
    failedItems.push({ step: "template", field: "endpoint", message: "标准 HTTP 代理模型必须配置 endpoint 或 createTaskEndpoint。" });
  }
  if (!input.pricing || !Number.isFinite(Number(input.pricing.baseCredits)) || Number(input.pricing.baseCredits) <= 0) {
    failedItems.push({ step: "pricing", field: "baseCredits", message: "基础积分必须大于 0。" });
  }
  if (!input.parameterSchema || Object.keys(input.parameterSchema).length === 0) {
    failedItems.push({ step: "pricing", field: "parameterSchema", message: "请至少配置一个参数。" });
  }
  return failedItems;
}

function hasSupportedAdapter(providerProtocol: string) {
  return ["creator_dev", "openai_images", "volcengine_ark_video", "custom_http"].includes(providerProtocol);
}

function looksLikeSecretValue(value: string) {
  return /^(sk-|ak-|AIza|xai-|eyJ|Bearer\s+)/i.test(value) || value.length > 80;
}

function validateModelWriteInput(input: AdminModelWriteInput, requireAll: boolean) {
  const requiredFields: Array<keyof AdminModelWriteInput> = [
    "modelCode",
    "displayName",
    "providerName",
    "providerModel",
    "providerProtocol",
    "invocationMode",
    "mediaType",
  ];
  if (requireAll) {
    const missing = requiredFields.find((field) => !readString(input[field]));
    if (missing) {
      return error(400, "admin_model_required", "请填写模型基础信息");
    }
  }
  if (input.providerProtocol && !["creator_dev", "openai_images", "openai_compatible_chat", "volcengine_ark_video", "custom_http"].includes(input.providerProtocol)) {
    return error(400, "invalid_provider_protocol", "供应商协议不支持");
  }
  if (input.invocationMode && !["sync", "async_polling", "stream", "webhook"].includes(input.invocationMode)) {
    return error(400, "invalid_invocation_mode", "调用方式不支持");
  }
  if (input.mediaType && !["text", "image", "video", "audio", "multimodal"].includes(input.mediaType)) {
    return error(400, "invalid_media_type", "媒体类型不支持");
  }
  if (input.status && !["active", "disabled", "archived"].includes(input.status)) {
    return error(400, "invalid_model_status", "模型状态不支持");
  }
  if (!Array.isArray(input.taskModes) || input.taskModes.length === 0) {
    return error(400, "task_modes_required", "至少需要一个任务模式");
  }
  if (input.mediaType === "image" && input.taskModes.some((taskMode) => !taskMode.startsWith("image."))) {
    return error(400, "task_modes_media_mismatch", "图片模型只能选择图片能力");
  }
  if (input.mediaType === "video" && input.taskModes.some((taskMode) => !taskMode.startsWith("video."))) {
    return error(400, "task_modes_media_mismatch", "视频模型只能选择视频能力");
  }
  const apiKeyEnv = readString(input.providerConfig?.apiKeyEnv);
  if (apiKeyEnv && looksLikeSecretValue(apiKeyEnv)) {
    return error(400, "api_key_env_must_be_reference", "密钥引用不能保存明文密钥");
  }
  if (input.dispatchPolicy && !readString(input.dispatchPolicy.submitQueueName)) {
    return error(400, "dispatch_submit_queue_required", "请配置提交队列");
  }
  return null;
}

function modelLaunchCheck(model: AdminModelConfigView) {
  const failedItems: Array<{ key: string; label: string; message: string }> = [];
  if (!readString(model.providerConfig?.apiKeyEnv)) {
    failedItems.push({
      key: "apiKeyEnv",
      label: "密钥引用",
      message: "供应商配置必须填写 apiKeyEnv，且只能保存密钥引用名。",
    });
  }
  if (!hasValidProviderEndpoint(model.providerConfig)) {
    failedItems.push({
      key: "endpoint",
      label: "Endpoint",
      message: "供应商 endpoint 必须是 http/https URL，或以 / 开头的接口路径。",
    });
  }
  if (model.invocationMode === "async_polling" && !isValidOptionalProviderEndpoint(model.providerConfig?.queryTaskEndpoint)) {
    failedItems.push({
      key: "queryTaskEndpoint",
      label: "轮询 Endpoint",
      message: "异步轮询模型必须配置合法 queryTaskEndpoint，用于查询任务结果。",
    });
  }
  if (Object.keys(model.parameterSchema ?? {}).length === 0) {
    failedItems.push({
      key: "parameterSchema",
      label: "参数校验",
      message: "模型参数 schema 不能为空。",
    });
  }
  if (!Number.isFinite(Number(model.pricing?.baseCredits)) || Number(model.pricing?.baseCredits) <= 0) {
    failedItems.push({
      key: "pricing",
      label: "计费规则",
      message: "模型定价必须配置大于 0 的 baseCredits。",
    });
  }
  if (!model.dispatchPolicy || !readString(model.dispatchPolicy.submitQueueName)) {
    failedItems.push({
      key: "dispatchPolicy",
      label: "调度策略",
      message: "调度策略必须配置提交队列。",
    });
  }
  return { ok: failedItems.length === 0, failedItems };
}

function hasValidProviderEndpoint(providerConfig: Record<string, unknown>) {
  const candidates = [
    readString(providerConfig.endpoint),
    readString(providerConfig.createTaskEndpoint),
  ].filter(Boolean) as string[];
  return candidates.some(isValidProviderEndpoint);
}

function isValidProviderEndpoint(endpoint: string) {
  if (endpoint.startsWith("/")) {
    return !endpoint.startsWith("//") && !/\s/.test(endpoint);
  }
  try {
    const parsed = new URL(endpoint);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

function isValidOptionalProviderEndpoint(endpoint: unknown) {
  const value = readString(endpoint);
  return value ? isValidProviderEndpoint(value) : false;
}

function uuidFromIdempotencyKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function error(status: number, code: string, message: string) {
  return {
    status,
    body: { error: { code, message } },
  };
}
