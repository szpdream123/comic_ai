import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { maskCnPhone } from "../modules/identity/phone-auth.utils.ts";
import { createAdminOpsService } from "../modules/admin-ops/admin-ops.service.ts";
import {
  createCommercePaymentService,
  ensureDefaultCreditPackage,
} from "../modules/commerce-payment/commerce-payment.service.ts";
import {
  createDefaultPaymentProviderRegistry,
  createLocalPaymentProviderAdapter,
  createPayLabAdapter,
  createStaticPaymentProviderRegistry,
  isPaymentProvider,
  type PaymentProvider,
} from "../modules/commerce-payment/payment-provider-adapter.ts";
import {
  findPersistentAuthSessionByToken,
  requestPersistentLoginCode,
  revokePersistentAuthSession,
  verifyPersistentLoginChallenge,
} from "../modules/identity/persistent-auth.service.ts";
import { createSmsProviderFromEnv } from "../modules/identity/sms-provider.ts";
import { CreatorDevApp } from "../modules/project/creator-dev-app.ts";
import {
  createCreatorApplication,
} from "../modules/project/creator-application.service.ts";
import {
  completeProjectUploadRecord,
  createProjectUploadRecord,
} from "../modules/project/project-upload-record.service.ts";
import { AuthorizationError, resolveActorContext } from "../modules/organization/actor-context.service.ts";
import { queryOne } from "../modules/shared/db/sql.ts";
import { createDevDb } from "../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../modules/shared/db/test-db.ts";
import { beginOrReplayCommand, IdempotencyConflictError, IdempotencyProcessingError } from "../modules/shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../modules/shared/idempotency/persistent-idempotency.store.ts";
import { createLocalUploadStore } from "../modules/shared/uploads/upload-store.ts";
import { createStorageAdapterFromEnv } from "../modules/storage/storage-adapter.factory.ts";
import {
  buildSignedObjectUrls,
  createScopedStorageObject,
  deleteStorageObjectRecord,
  markStorageObjectAvailable,
  markStorageObjectFailed,
  type StorageObjectRecord,
} from "../modules/storage/storage.service.ts";
import {
  abortUploadSession,
  buildStorageObjectPublicUrl,
  completeUploadSession,
  createUploadSession,
  findUploadSession,
  runStorageRepairJob,
  type UploadSessionRuntime,
} from "../modules/storage/upload-session.service.ts";
import { createAssetVersionSnapshot } from "../modules/project/asset-version-record.service.ts";
import {
  buildAssetConversationEntries,
  deleteAssetConversationTurn,
  findAssetConversationThread,
  listAssetConversationMessages,
  upsertAssetConversationMessages,
  upsertAssetConversationThread,
  type AssetConversationMediaMode,
  type AssetConversationMessageType,
  type AssetConversationStatus,
} from "../modules/project/asset-conversation-record.service.ts";
import type { AssetType } from "../modules/project/asset.service.ts";
import { createExportRecord } from "../modules/project/export-record.service.ts";
import { upsertEpisodeGenerationDraft } from "../modules/project/episode-generation-draft.service.ts";
import { InsufficientCreditsError, reserveCredits, settleReservationAllocation } from "../modules/credit-billing/credit-ledger.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../modules/workflow-task/workflow-task.service.ts";
import { createProviderAdapterFromModelConfig } from "../modules/model-gateway/provider-adapter.factory.ts";
import { SeedanceVideoProviderAdapter } from "../modules/model-gateway/seedance-video.provider-adapter.ts";
import {
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "../modules/model-gateway/provider-request.service.ts";
import {
  findActiveAiModelConfigByCode,
  listActiveAiModelConfigs,
  type AiModelConfigRecord,
} from "../modules/model-catalog/ai-model-config.store.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "../modules/model-gateway/generation-outbox.service.ts";
import { loadGenerationQueueConfig } from "../modules/model-gateway/generation-queue.config.ts";
import { createBullMQGenerationQueueHealthService } from "../modules/model-gateway/generation-queue-health.service.ts";
import {
  createBullMQGenerationQueueJobOpsService,
  type GenerationQueueJobAction,
  type GenerationQueueJobOpsService,
} from "../modules/model-gateway/generation-queue-job-ops.service.ts";
import type { MediaGenerationArtifact } from "../modules/model-gateway/provider-adapter.contract.ts";
import {
  persistGptImageArtifact,
  serializeGptImageArtifactForProviderResponse,
} from "../modules/model-gateway/gpt-image.artifact-finalizer.ts";
import {
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotSucceeded,
  upsertQueuedGenerationTaskSnapshot,
} from "../modules/model-gateway/generation-task-snapshot.service.ts";
import { runIdempotentCommand } from "../modules/shared/command/platform-command-runtime.ts";
import { capabilities } from "../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../packages/contracts/domain/operation-names.ts";

const webRoot = join(process.cwd(), "apps", "web");
const nodeModulesRoot = join(process.cwd(), "node_modules");
const uploadRoot = resolve(process.cwd(), ".local", "creator-uploads");
const episodeEventLogPath = resolve(process.cwd(), ".local", "episode-workbench-events.jsonl");
const vendorRoot = join(process.cwd(), "node_modules");
const devOrganizationId = "10000000-0000-4000-8000-000000000001";
const devWorkspaceId = "20000000-0000-4000-8000-000000000001";
const devPaymentCallbackSecret = "dev-payment-secret";
const devPaymentProviderRegistry = createDevPaymentProviderRegistry();
const devInitialCreditBalance = 10000;
const generationTaskTimeoutMs = 15 * 60 * 1000;
const fallbackMockImageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);
const fallbackMockVideoBytes = Buffer.from("mock episode video\n", "utf8");
const mockEpisodeStoryboardVideoUrl =
  "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/660b682f-d13a-49d0-b15b-1e6c57ffdd0e-storyboard-ui-video.mp4";
const mockEpisodeImageUrls = [
  "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/1ee6f1a1-8bb8-4424-9ce3-e1361075b234-d256255d69a702a1f2095159c5aa1b1.png",
  "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260527/%E7%99%BD%E9%87%8E.png",
] as const;
const episodeUploadLimits = {
  image: {
    label: "图片",
    maxBytes: 20 * 1024 * 1024,
    maxReferencesPerTask: 30,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".avif"],
  },
  video: {
    label: "视频",
    maxBytes: 500 * 1024 * 1024,
    recommendedMaxDurationSeconds: 15 * 60,
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    extensions: [".mp4", ".webm", ".mov"],
  },
  audio: {
    label: "音频",
    maxBytes: 100 * 1024 * 1024,
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"],
    extensions: [".mp3", ".wav", ".m4a"],
  },
  blockedExtensions: [
    ".7z",
    ".bat",
    ".cmd",
    ".com",
    ".dmg",
    ".exe",
    ".gz",
    ".html",
    ".js",
    ".msi",
    ".ps1",
    ".rar",
    ".sh",
    ".tar",
    ".zip",
  ],
};

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

function createDevPaymentProviderRegistry() {
  const paylabBaseUrl = process.env.PAYLAB_BASE_URL?.trim();
  if (!paylabBaseUrl) {
    return createDefaultPaymentProviderRegistry();
  }

  return createStaticPaymentProviderRegistry({
    paylab: createPayLabAdapter({
      baseUrl: paylabBaseUrl,
      apiKey: process.env.PAYLAB_API_KEY?.trim(),
      webhookSigningSecret: process.env.PAYLAB_WEBHOOK_SIGNING_SECRET?.trim(),
      dashboardBaseUrl: process.env.PAYLAB_DASHBOARD_BASE_URL?.trim(),
    }),
    wechat_pay: createLocalPaymentProviderAdapter("wechat_pay"),
    alipay: createLocalPaymentProviderAdapter("alipay"),
  });
}

interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}

class GenerationQueueJobOpsRouteError extends Error {
  constructor(readonly response: AuthHttpResponse<unknown>) {
    super("generation_queue_job_ops_failed");
  }
}

class GenerationRequestValidationError extends Error {
  constructor(
    readonly code: string,
    readonly message: string,
  ) {
    super(code);
  }
}

interface AuthenticatedUser {
  id: string;
  phone: string;
}

export interface PhoneAuthDevServer {
  origin: string;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}

export interface PhoneAuthDevServerRepairSchedulerOptions {
  enabled?: boolean;
  intervalMs?: number;
  limit?: number;
}

export interface PhoneAuthDevServerOptions {
  db?: Awaited<ReturnType<typeof createDevDb>>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  repairScheduler?: PhoneAuthDevServerRepairSchedulerOptions;
  storageRuntime?: Partial<UploadSessionRuntime>;
  seedTeamEntitlements?: boolean;
  generationQueueJobOpsService?: GenerationQueueJobOpsService;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
}

async function readJsonBody(request: AsyncIterable<Buffer | string>): Promise<unknown> {
  const body = await readTextBody(request);
  return body ? JSON.parse(body) : {};
}

async function readTextBody(request: AsyncIterable<Buffer | string>): Promise<string> {
  let body = "";

  for await (const chunk of request) {
    body += String(chunk);
  }

  return body;
}

async function readMultipartFormData(
  request: Parameters<typeof createServer>[0],
  origin: string,
) {
  const url = new URL(request.url ?? "/", origin);
  const webRequest = new Request(url, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: request as unknown as BodyInit,
    duplex: "half",
  });
  return webRequest.formData();
}

const sessionCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}`;
}

function clearSessionCookie(): string {
  return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function requestIpAddress(request: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || request.socket?.remoteAddress;
}

function requiredIdempotencyKeyFromRequest(request: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const header = request.headers["idempotency-key"];
  const value = Array.isArray(header) ? header[0] : header;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function writeIdempotencyKeyRequired(response: ServerResponse) {
  return writeJson(response, {
    status: 400,
    body: { error: "idempotency_key_required" },
  });
}

function singleValueHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      const first = Array.isArray(value) ? value[0] : value;
      return first ? [[key, first]] : [];
    }),
  );
}

function writeKnownError(response: ServerResponse, error: unknown): boolean {
  if (error instanceof SyntaxError) {
    writeJson(response, {
      status: 400,
      body: { error: "invalid_json" },
    });
    return true;
  }

  if (error instanceof AuthorizationError) {
    const status =
      error.code === "unauthenticated"
        ? 401
        : error.code === "project_not_found" ||
            error.code === "workspace_not_found" ||
            error.code === "organization_not_found" ||
            error.code === "membership_missing" ||
            error.code === "tenant_scope_required"
          ? 404
          : 403;
    const errorCode =
      status === 401
        ? "unauthenticated"
        : status === 404
          ? "resource_not_found"
          : "permission_denied";
    const message =
      status === 401
        ? "登录已过期，请重新登录"
        : status === 404
          ? "资源不存在或无权限访问"
          : "没有权限执行该操作，请确认项目成员角色";
    writeJson(response, envelopedError(status, errorCode, message, { reason: error.code }));
    return true;
  }

  if (error instanceof GenerationRequestValidationError) {
    writeJson(response, envelopedError(400, error.code, error.message));
    return true;
  }

  return false;
}

function writeJson(response: ServerResponse, payload: AuthHttpResponse<unknown>) {
  response.statusCode = payload.status;
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (payload.cookies?.length) {
    response.setHeader("set-cookie", payload.cookies);
  }

  response.end(JSON.stringify(payload.body));
}

function writeText(
  response: ServerResponse,
  input: {
    status: number;
    contentType: string;
    body: string;
    fileName?: string | null;
  },
) {
  response.statusCode = input.status;
  response.setHeader("content-type", input.contentType);
  if (input.fileName) {
    response.setHeader("content-disposition", `attachment; filename="${input.fileName}"`);
  }
  response.end(input.body);
}

function requestId() {
  return randomUUID();
}

function enveloped(status: number, data: unknown): AuthHttpResponse<unknown> {
  return {
    status,
    body: {
      requestId: requestId(),
      data,
    },
  };
}

function envelopedError(
  status: number,
  errorCode: string,
  message: string,
  details: Record<string, unknown> = {},
): AuthHttpResponse<unknown> {
  return {
    status,
    body: {
      requestId: requestId(),
      errorCode,
      message,
      details,
    },
  };
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseRuntimePositiveInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseRuntimeNonNegativeInt(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    hasNext: start + pageSize < items.length,
  };
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function joinProviderUrl(baseURL: string, endpoint: string) {
  return `${baseURL.replace(/\/+$/, "")}/${endpoint.replace(/^\/+/, "")}`;
}

function normalizeTaskStatus(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return "succeeded";
  }
  if (normalized === "cancel_requested") {
    return "canceled";
  }
  return [
    "queued",
    "running",
    "succeeded",
    "failed",
    "canceled",
    "result_unknown",
    "manual_review_required",
  ].includes(normalized)
    ? normalized
    : "running";
}

function isEnabled(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function requestModelCode(value: unknown) {
  const modelCode = String(value ?? "").trim();
  if (modelCode === "seedance-2-0-vip" || modelCode === "seedance-2.0") {
    return "seedance-i2v-pro";
  }
  return modelCode;
}

function readMediaReferenceUrl(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const key of ["url", "sourceUrl", "downloadUrl", "previewUrl", "publicUrl", "src"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function resolveFirstFrameUrl(body: Record<string, unknown>): string {
  const parameters = body.parameters && typeof body.parameters === "object"
    ? body.parameters as Record<string, unknown>
    : {};
  return (
    readMediaReferenceUrl(body.firstFrameUrl) ||
    readMediaReferenceUrl(body.imageUrl) ||
    readMediaReferenceUrl(body.referenceImageUrl) ||
    readMediaReferenceUrl(body.firstFrame) ||
    readMediaReferenceUrl(parameters.firstFrame) ||
    readMediaReferenceUrl(parameters.imageReference)
  );
}

function classifyEpisodeAssetType(input: {
  purpose?: string | null;
  targetType?: string | null;
  mediaKind?: string | null;
  contentType?: string | null;
}): AssetType | null {
  const purpose = String(input.purpose ?? "").toLowerCase();
  const targetType = String(input.targetType ?? "").toLowerCase();
  const mediaKind = String(input.mediaKind ?? "").toLowerCase();
  const contentType = String(input.contentType ?? "").toLowerCase();

  if (mediaKind === "video" || contentType.startsWith("video/") || purpose.includes("video")) {
    return targetType === "storyboard" || purpose.includes("storyboard")
      ? "shot_video"
      : null;
  }
  if (mediaKind === "image" || contentType.startsWith("image/") || purpose.includes("image")) {
    if (targetType === "storyboard" || purpose.includes("storyboard")) {
      return "shot_image";
    }
    if (targetType === "asset" || purpose.includes("role") || purpose.includes("character")) {
      return "character_sheet";
    }
    if (purpose.includes("scene")) {
      return "scene_reference";
    }
    if (purpose.includes("prop")) {
      return "prop_reference";
    }
    return "character_sheet";
  }
  return null;
}

function isUuid(value: unknown) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getUploadExtension(fileName: unknown) {
  return extname(String(fileName ?? "").trim()).toLowerCase();
}

function getUploadLimitKind(contentType: unknown, fileName: unknown) {
  const normalizedContentType = String(contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = getUploadExtension(fileName);
  for (const [kind, rule] of Object.entries(episodeUploadLimits)) {
    if (kind === "blockedExtensions") {
      continue;
    }
    if (
      typeof rule === "object" &&
      "mimeTypes" in rule &&
      (rule.mimeTypes.includes(normalizedContentType) || rule.extensions.includes(extension))
    ) {
      return kind as "image" | "video" | "audio";
    }
  }
  return null;
}

function validateUploadPolicy(input: {
  fileName: unknown;
  contentType: unknown;
  sizeBytes?: unknown;
}) {
  const extension = getUploadExtension(input.fileName);
  const normalizedContentType = String(input.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (!extension || episodeUploadLimits.blockedExtensions.includes(extension)) {
    return {
      ok: false as const,
      errorCode: "upload_type_not_allowed",
      message: "不支持上传该文件类型",
    };
  }
  const kind = getUploadLimitKind(normalizedContentType, input.fileName);
  if (!kind) {
    return {
      ok: false as const,
      errorCode: "upload_type_not_allowed",
      message: "仅支持图片、视频或音频文件",
    };
  }
  const rule = episodeUploadLimits[kind];
  if (!rule.mimeTypes.includes(normalizedContentType)) {
    return {
      ok: false as const,
      errorCode: "upload_mime_not_allowed",
      message: `${rule.label} MIME 类型不在允许列表中`, 
    };
  }
  const sizeBytes = Number(input.sizeBytes ?? 0);
  if (Number.isFinite(sizeBytes) && sizeBytes > rule.maxBytes) {
    return {
      ok: false as const,
      errorCode: "upload_file_too_large",
      message: `${rule.label}文件超过上传大小限制`,
      details: {
        kind,
        maxBytes: rule.maxBytes,
        sizeBytes,
      },
    };
  }
  return { ok: true as const, kind, rule };
}

function normalizeGenerationKind(kind: "image" | "video") {
  return kind === "video"
    ? {
        operationName: operationNames.episodeVideoGenerate,
        workflowType: operationNames.episodeVideoGenerate,
        taskType: "episode_generate_video",
        queueName: "episode-generation",
        mediaKind: "video",
        contentType: "video/mp4",
        fileExtension: "mp4",
        sourcePath: process.env.MOCK_VIDEO_SOURCE_PATH?.trim() || null,
        configuredStorageObjectId: process.env.MOCK_VIDEO_STORAGE_OBJECT_ID?.trim() || null,
        objectNamePrefix: "mock-video",
        cost: Number(process.env.EPISODE_VIDEO_GENERATION_COST ?? 120),
      }
    : {
        operationName: operationNames.episodeImageGenerate,
        workflowType: operationNames.episodeImageGenerate,
        taskType: "episode_generate_image",
        queueName: "episode-generation",
        mediaKind: "image",
        contentType: "image/avif",
        fileExtension: "avif",
        sourcePath: process.env.MOCK_IMAGE_SOURCE_PATH?.trim() || null,
        configuredStorageObjectId: process.env.MOCK_IMAGE_STORAGE_OBJECT_ID?.trim() || null,
        objectNamePrefix: "mock-image",
        cost: Number(process.env.EPISODE_IMAGE_GENERATION_COST ?? 90),
      };
}

function generationCostFromModelConfig(
  fallbackCost: number,
  modelConfig?: AiModelConfigRecord,
) {
  const baseCredits = Number(modelConfig?.pricing.baseCredits);
  return Number.isFinite(baseCredits) && baseCredits >= 0
    ? Math.round(baseCredits)
    : fallbackCost;
}

function modelConfigToGenerationConfigModel(modelConfig: AiModelConfigRecord) {
  const supportedModes = readStringArray(modelConfig.uiConfig.supportedModes);
  const schemaRatios = readEnumValues(modelConfig.parameterSchema.aspectRatio);
  const defaultRatios = readStringArray(modelConfig.defaultParams.aspectRatio);
  const schemaQuality =
    readEnumValues(modelConfig.parameterSchema.quality).length
      ? readEnumValues(modelConfig.parameterSchema.quality)
      : readEnumValues(modelConfig.parameterSchema.resolution);
  const supportedRatios = schemaRatios.length ? schemaRatios : defaultRatios;
  return {
    modelCode: modelConfig.modelCode,
    modelLabel: modelConfig.displayName,
    providerGroup: readString(modelConfig.uiConfig.group) || modelConfig.providerName,
    pipeline: readString(modelConfig.uiConfig.pipeline) || modelConfig.mediaType,
    supportedModes: supportedModes.length ? supportedModes : modelConfig.taskModes,
    supportedRatios: supportedRatios.length ? supportedRatios : ["16:9", "9:16"],
    supportedQuality: schemaQuality.length ? schemaQuality : ["1080p"],
    displayBaseCost: generationCostFromModelConfig(0, modelConfig),
    disabled: modelConfig.status !== "active",
  };
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  }
  return typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return [];
  }
  const parsed = typeof value === "string"
    ? JSON.parse(value) as unknown
    : value;
  return Array.isArray(parsed)
    ? parsed.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : [];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readEnumValues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return readStringArray((value as Record<string, unknown>).enum);
}

function createSeedancePollAdapterFromModelConfig(
  modelConfig: AiModelConfigRecord | undefined,
  env: NodeJS.ProcessEnv,
  fetchImpl?: typeof fetch,
) {
  if (modelConfig) {
    const adapter = createProviderAdapterFromModelConfig(
      {
        providerProtocol: modelConfig.providerProtocol,
        providerModel: modelConfig.providerModel,
        providerConfig: modelConfig.providerConfig,
      },
      env,
      fetchImpl,
    );
    if (adapter instanceof SeedanceVideoProviderAdapter) {
      return adapter;
    }
  }

  return new SeedanceVideoProviderAdapter({
    apiKey: env[env.SEEDANCE_API_KEY_ENV?.trim() || "VOLCENGINE_ARK_API_KEY"]?.trim() ?? "",
    model: env.SEEDANCE_PROVIDER_MODEL?.trim() || "seedance-1-0-pro",
    createTaskEndpoint: "unused://create",
    queryTaskEndpoint: joinProviderUrl(
      env.SEEDANCE_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com",
      env.SEEDANCE_QUERY_TASK_ENDPOINT?.trim() ||
        "/api/v3/contents/generations/tasks/{taskId}",
    ),
    fetchImpl,
  });
}

async function readMockGenerationMedia(config: {
  mediaKind: "image" | "video";
  sourcePath: string | null;
  contentType: string;
  fileExtension: string;
}) {
  if (config.sourcePath) {
    try {
      const bytes = await readFile(resolve(config.sourcePath));
      return {
        bytes,
        contentType: config.contentType,
        fileExtension: config.fileExtension,
        usedFallback: false,
      };
    } catch {}
  }
  return {
    bytes: config.mediaKind === "video" ? fallbackMockVideoBytes : fallbackMockImageBytes,
    contentType: config.contentType,
    fileExtension: config.fileExtension,
    usedFallback: true,
  };
}

function resolveEpisodeGenerationAssetType(input: {
  kind: "image" | "video";
  targetType?: unknown;
  assetType?: unknown;
}) {
  if (input.kind === "video") {
    return "shot_video" as const;
  }
  if (String(input.targetType ?? "") === "asset") {
    return normalizeEpisodeAssetType(String(input.assetType ?? "role")).assetType;
  }
  return "shot_image" as const;
}

async function resolveEpisodeGenerationTargetAsset(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    episodeId: string;
    targetType: string;
    targetId: string;
    assetType: AssetType;
  },
) {
  if (input.targetType !== "asset" || !isUuid(input.targetId)) {
    return null;
  }
  const row = await queryOne<{
    asset_key: string;
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT a.asset_key, v.metadata_json
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT metadata_json
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
        AND a.asset_type = $4
      LIMIT 1
    `,
    [input.organizationId, input.projectId, input.targetId, input.assetType],
  );
  if (!row) {
    return null;
  }
  const metadata =
    typeof row.metadata_json === "string"
      ? JSON.parse(row.metadata_json) as Record<string, unknown>
      : row.metadata_json ?? {};
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  return {
    assetKey: row.asset_key,
    metadata,
  };
}

function normalizeProjectDetailForEpisodeContract(detail: Record<string, unknown>) {
  const project = detail.project && typeof detail.project === "object"
    ? detail.project as Record<string, unknown>
    : {};
  const episodes = Array.isArray(detail.episodes) ? detail.episodes : [];
  return {
    ...detail,
    project: {
      ...project,
      projectId: project.projectId ?? project.id ?? null,
      status: project.status ?? project.phase ?? null,
    },
    episodes: episodes.map((episode) => {
      const item = episode && typeof episode === "object" ? episode as Record<string, unknown> : {};
      const previewUrl = item.previewUrl ?? null;
      return {
        ...item,
        episodeId: item.episodeId ?? item.id ?? null,
        previewMedia: previewUrl
          ? {
              kind: String(previewUrl).match(/\.(mp4|webm|mov)(\?|$)/i) ? "video" : "image",
              url: previewUrl,
            }
          : null,
      };
    }),
  };
}

async function getOrganizationCreditBalance(
  db: Awaited<ReturnType<typeof createDevDb>>,
  organizationId: string,
) {
  const row = await queryOne<{
    credit_balance_cached: number | string;
  }>(
    db,
    "SELECT credit_balance_cached FROM organizations WHERE id = $1",
    [organizationId],
  );
  return Number(row?.credit_balance_cached ?? 0);
}

async function getEpisodeContext(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    sessionToken: string;
    userId: string;
    capability?: (typeof capabilities)[keyof typeof capabilities];
    now: Date;
  },
) {
  const episode = await queryOne<{
    id: string;
    organization_id: string;
    project_id: string;
    title: string;
    sequence: number;
    status: string;
  }>(
    db,
    "SELECT id, organization_id, project_id, title, sequence, status FROM episodes WHERE id = $1",
    [input.episodeId],
  );
  if (!episode) {
    return null;
  }

  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: episode.project_id,
    capability: input.capability,
    now: input.now,
  });
  if (!actor.workspaceId) {
    return null;
  }

  const project = await queryOne<{
    id: string;
    organization_id: string;
    workspace_id: string;
    name: string;
    phase: string;
  }>(
    db,
    "SELECT id, organization_id, workspace_id, name, phase FROM projects WHERE id = $1",
    [episode.project_id],
  );
  if (!project || project.organization_id !== actor.organizationId) {
    return null;
  }

  return {
    actor,
    episode,
    project,
    creditBalance: await getOrganizationCreditBalance(db, actor.organizationId),
    userId: input.userId,
  };
}

async function resolveTaskContext(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    sessionToken: string;
    now: Date;
  },
) {
  const task = await queryOne<{
    id: string;
    project_id: string | null;
    workflow_id: string;
    task_type: string;
    status: string;
    failure_code: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    target_entity_type: string;
    target_entity_id: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    db,
    `
      SELECT id, project_id, workflow_id, task_type, status, failure_code,
             input_snapshot_json, target_entity_type, target_entity_id, created_at, updated_at
      FROM tasks
      WHERE id = $1
    `,
    [input.taskId],
  );
  if (!task?.project_id) {
    return null;
  }
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: task.project_id,
    now: input.now,
  });
  return { task, actor };
}

async function ensureMockGenerationStorageObject(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    kind: "image" | "video";
    organizationId: string;
    workspaceId: string;
    projectId: string;
    episodeId: string;
    taskId: string;
    userId: string;
    now: Date;
    runtime: UploadSessionRuntime;
  },
) {
  const config = normalizeGenerationKind(input.kind);
  if (config.configuredStorageObjectId) {
    const existing = await queryOne<{
      id: string;
      bucket: string;
      object_key: string;
      content_type: string;
    }>(
      db,
      "SELECT id, bucket, object_key, content_type FROM storage_objects WHERE id = $1",
      [config.configuredStorageObjectId],
    );
    if (existing) {
      return existing;
    }
  }

  const media = await readMockGenerationMedia(config);
  const objectName = `episodes/${input.episodeId}/mock/${config.objectNamePrefix}-${input.taskId}.${media.fileExtension}`;
  const storageObject = await createScopedStorageObject(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    bucket: input.runtime.bucket,
    objectName,
    contentType: media.contentType,
    sizeBytes: media.bytes.byteLength,
    provider: input.runtime.provider,
    status: "available",
    metadata: {
      episodeId: input.episodeId,
      taskId: input.taskId,
      mockSource: config.mediaKind,
      mockFallback: media.usedFallback,
    },
    createdByUserId: input.userId,
    now: input.now,
  });

  if (
    (input.runtime.mode === "cos" || input.runtime.mode === "s3_compatible") &&
    typeof input.runtime.adapter.putObject === "function"
  ) {
    await input.runtime.adapter.putObject({
      bucket: storageObject.bucket,
      objectKey: storageObject.objectKey,
      body: media.bytes,
      contentType: media.contentType,
    });
  } else {
    await writeLocalStorageObject({
      bucket: storageObject.bucket,
      objectKey: storageObject.objectKey,
      bytes: media.bytes,
    });
  }

  return {
    id: storageObject.id,
    bucket: storageObject.bucket,
    object_key: storageObject.objectKey,
    content_type: storageObject.contentType,
  };
}

async function signedUrlsForStorageObject(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    sessionToken: string;
    storageObjectId: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  return buildSignedObjectUrls(db, {
    sessionToken: input.sessionToken,
    storageObjectId: input.storageObjectId,
    adapter: input.runtime.adapter,
    now: input.now,
    expiresInSeconds: input.signedUrlExpiresInSeconds,
  });
}

async function mapGenerationTaskResponse(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    sessionToken: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const row = await queryOne<{
    task_id: string;
    workflow_id: string;
    task_type: string;
    status: string;
    failure_code: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    target_entity_type: string;
    target_entity_id: string;
    project_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
    workflow_status: string;
    reservation_id: string | null;
    amount_total: number | string | null;
    amount_reserved: number | string | null;
    amount_consumed: number | string | null;
    amount_released: number | string | null;
    asset_id: string | null;
    asset_version_id: string | null;
    storage_object_id: string | null;
    storage_object_key: string | null;
    metadata_json: Record<string, unknown> | string | null;
    provider_request_id: string | null;
    provider_request_status: string | null;
    provider_failure_code: string | null;
    provider_response_redacted_json: Record<string, unknown> | string | null;
    snapshot_failure_json: Record<string, unknown> | string | null;
    snapshot_result_assets_json: Record<string, unknown>[] | string | null;
    credit_balance_cached: number | string | null;
  }>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.task_type,
        t.status,
        t.failure_code,
        t.input_snapshot_json,
        t.target_entity_type,
        t.target_entity_id,
        t.project_id,
        t.created_at,
        t.updated_at,
        w.status AS workflow_status,
        r.id AS reservation_id,
        r.amount_total,
        r.amount_reserved,
        r.amount_consumed,
        r.amount_released,
        a.id AS asset_id,
        v.id AS asset_version_id,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        pr.id AS provider_request_id,
        pr.status AS provider_request_status,
        pr.failure_code AS provider_failure_code,
        pr.response_redacted_json AS provider_response_redacted_json,
        s.failure_json AS snapshot_failure_json,
        s.result_assets_json AS snapshot_result_assets_json,
        o.credit_balance_cached
      FROM tasks t
      JOIN workflows w
        ON w.organization_id = t.organization_id
       AND w.id = t.workflow_id
      JOIN organizations o
        ON o.id = t.organization_id
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      LEFT JOIN asset_versions v
        ON v.organization_id = t.organization_id
       AND v.source_task_id = t.id
      LEFT JOIN assets a
        ON a.organization_id = v.organization_id
       AND a.id = v.asset_id
      LEFT JOIN LATERAL (
        SELECT
          pr_latest.id,
          pr_latest.status,
          pr_latest.failure_code,
          pr_latest.response_redacted_json
        FROM provider_requests pr_latest
        WHERE pr_latest.organization_id = t.organization_id
          AND pr_latest.task_id = t.id
        ORDER BY pr_latest.updated_at DESC NULLS LAST, pr_latest.created_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN ai_generation_task_snapshots s
        ON s.organization_id = t.organization_id
       AND s.task_id = t.id
      WHERE t.id = $1
      ORDER BY v.created_at DESC NULLS LAST
      LIMIT 1
    `,
    [input.taskId],
  );
  if (!row) {
    return null;
  }

  const snapshot =
    typeof row.input_snapshot_json === "string"
      ? JSON.parse(row.input_snapshot_json) as Record<string, unknown>
      : row.input_snapshot_json;
  const metadata =
    typeof row.metadata_json === "string"
      ? JSON.parse(row.metadata_json) as Record<string, unknown>
      : row.metadata_json ?? {};
  const kind = String(snapshot.kind ?? (row.task_type.includes("video") ? "video" : "image"));
  const providerResponse = readJsonRecord(row.provider_response_redacted_json);
  const snapshotFailure = readJsonRecord(row.snapshot_failure_json);
  const snapshotResultAssets = readRecordArray(row.snapshot_result_assets_json);
  const snapshotResultAsset =
    snapshotResultAssets.find((asset) => readString(asset.mediaKind) === kind) ??
    snapshotResultAssets[0] ??
    null;
  const failureCode =
    readString(snapshotFailure.failureCode) ||
    readString(snapshotFailure.code) ||
    row.failure_code;
  const providerMessage =
    readString(snapshotFailure.providerMessage) ||
    readString(providerResponse.providerMessage) ||
    readString(providerResponse.errorMessage) ||
    readString(providerResponse.message) ||
    null;
  const providerErrorCode =
    readString(snapshotFailure.providerErrorCode) ||
    readString(providerResponse.providerErrorCode) ||
    readString(providerResponse.errorCode) ||
    readString(row.provider_failure_code) ||
    null;
  const providerStatus =
    readString(snapshotFailure.providerStatus) ||
    readString(providerResponse.providerStatus) ||
    readString(row.provider_request_status) ||
    null;
  let urls: Awaited<ReturnType<typeof signedUrlsForStorageObject>> | null = null;
  if (row.storage_object_id) {
    urls = await signedUrlsForStorageObject(db, {
      sessionToken: input.sessionToken,
      storageObjectId: row.storage_object_id,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
  }
  const lipSyncConfig =
    snapshot.parameters &&
    typeof snapshot.parameters === "object" &&
    (snapshot.parameters as Record<string, unknown>).lipSyncConfig &&
    typeof (snapshot.parameters as Record<string, unknown>).lipSyncConfig === "object"
      ? (snapshot.parameters as Record<string, unknown>).lipSyncConfig as Record<string, unknown>
      : null;
  const generatedAudioItems =
    kind === "video" &&
    (snapshot.lipSyncEnabled === true || String((snapshot.parameters as Record<string, unknown> | undefined)?.mode ?? "") === "lip-sync") &&
    lipSyncConfig
      ? [{
          id: `${row.task_id}-audio-1`,
          type: "audio",
          kind: "audio",
          name: "闊抽 1",
          summary: String(lipSyncConfig.text ?? snapshot.prompt ?? "").trim().slice(0, 48),
          voiceId: lipSyncConfig.voiceId ?? null,
          voiceName: String(lipSyncConfig.voiceName ?? "").trim(),
          voiceSource: lipSyncConfig.voiceSource ?? null,
          audioUrl: buildMockVoicePreviewDataUrl(
            `${String(lipSyncConfig.voiceName ?? "").trim()}:${String(lipSyncConfig.text ?? snapshot.prompt ?? "").trim().slice(0, 24)}`,
          ),
          status: "ready",
        }]
      : [];
  const mockImageUrl = kind === "image" ? pickMockEpisodeImageUrl(row.task_id) : null;
  const storyboardVideoUrl = kind === "video" ? mockEpisodeStoryboardVideoUrl : null;

  const snapshotResult = snapshotResultAsset
    ? generationResultFromSnapshotAsset(snapshotResultAsset, kind, generatedAudioItems)
    : null;

  const result =
    snapshotResult ??
    (row.asset_version_id && urls
      ? {
          assetId: row.asset_id,
          assetVersionId: row.asset_version_id,
          storageObjectId: row.storage_object_id,
          fileId: row.storage_object_id,
          storageObjectKey: row.storage_object_key,
          mediaKind: kind,
          imageUrl:
            kind === "image" && typeof metadata.sourceUrl === "string"
              ? metadata.sourceUrl
              : mockImageUrl,
          videoUrl: typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : storyboardVideoUrl,
          thumbnailUrl:
            metadata.thumbnailUrl ??
            (kind === "image" && typeof metadata.previewUrl === "string" ? metadata.previewUrl : kind === "image" ? mockImageUrl : null),
          coverImageUrl:
            metadata.coverImageUrl ??
            (kind === "image" && typeof metadata.previewUrl === "string" ? metadata.previewUrl : kind === "image" ? mockImageUrl : null),
          sourceUrl:
            kind === "image"
              ? typeof metadata.sourceUrl === "string"
                ? metadata.sourceUrl
                : mockImageUrl
              : typeof metadata.sourceUrl === "string"
                ? metadata.sourceUrl
                : storyboardVideoUrl,
          downloadUrl:
            kind === "image"
              ? typeof metadata.downloadUrl === "string"
                ? metadata.downloadUrl
                : mockImageUrl
              : typeof metadata.downloadUrl === "string"
                ? metadata.downloadUrl
                : storyboardVideoUrl,
          expiresAt: urls.expiresAt,
          generatedAudioItems,
        }
      : null);

  return {
    taskId: row.task_id,
    workflowId: row.workflow_id,
    kind,
    status: normalizeTaskStatus(row.status),
    workflowStatus: normalizeTaskStatus(row.workflow_status),
    failureCode,
    failure: failureCode
      ? {
          code: failureCode,
          failureCode,
          noticeType: readString(snapshotFailure.noticeType) || generationFailureNoticeType(failureCode),
          displayMessage: generationFailureDisplayMessage({
            failureCode,
            snapshotFailure,
            providerMessage,
            providerErrorCode,
          }),
          storageObjectKey: readString(snapshotFailure.storageObjectKey) || null,
          providerRequestId: row.provider_request_id,
          providerStatus,
          providerErrorCode,
          providerMessage,
          details:
            snapshotFailure.details &&
            typeof snapshotFailure.details === "object" &&
            !Array.isArray(snapshotFailure.details)
              ? snapshotFailure.details
              : providerResponse,
        }
      : null,
    episodeId: snapshot.episodeId ?? null,
    projectId: row.project_id,
    targetType: snapshot.targetType ?? row.target_entity_type,
    targetId: snapshot.targetId ?? row.target_entity_id,
    model: snapshot.model ?? null,
    prompt: snapshot.prompt ?? null,
    parameters: snapshot.parameters ?? {},
    timeoutAt: snapshot.timeoutAt ?? null,
    cost: Number(row.amount_total ?? snapshot.cost ?? 0),
    credit: row.reservation_id
      ? {
          reservationId: row.reservation_id,
          reserved: Number(row.amount_reserved ?? 0),
          consumed: Number(row.amount_consumed ?? 0),
          released: Number(row.amount_released ?? 0),
        }
      : null,
    creditBalance: Number(row.credit_balance_cached ?? 0),
    generatedAudioItems,
    result,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function generationResultFromSnapshotAsset(
  asset: Record<string, unknown>,
  kind: string,
  generatedAudioItems: Array<Record<string, unknown>>,
) {
  const url =
    readString(asset.sourceUrl) ||
    readString(asset.url) ||
    readString(asset.previewUrl) ||
    readString(asset.downloadUrl);
  const previewUrl = readString(asset.previewUrl) || url || null;
  const downloadUrl = readString(asset.downloadUrl) || url || null;
  return {
    assetId: readString(asset.assetId) || null,
    assetVersionId: readString(asset.assetVersionId) || null,
    storageObjectId: readString(asset.storageObjectId) || null,
    fileId: readString(asset.storageObjectId) || null,
    storageObjectKey: readString(asset.storageObjectKey) || null,
    mediaKind: readString(asset.mediaKind) || kind,
    imageUrl: kind === "image" ? url || null : null,
    videoUrl: kind === "video" ? url || null : null,
    thumbnailUrl: readString(asset.thumbnailUrl) || previewUrl,
    coverImageUrl: readString(asset.coverImageUrl) || previewUrl,
    sourceUrl: url || null,
    downloadUrl,
    generatedAudioItems,
  };
}

function buildMockVoicePreviewDataUrl(seedValue: string) {
  const seed = [...String(seedValue ?? "")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const sampleRate = 8000;
  const durationSec = 0.45;
  const samples = Math.floor(sampleRate * durationSec);
  const frequency = 300 + (seed % 220);
  const pcmBytes = new Uint8Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const envelope = Math.min(1, index / 600) * Math.min(1, (samples - index) / 600);
    const sample = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5 * envelope;
    pcmBytes[index] = Math.max(0, Math.min(255, Math.round(128 + sample * 127)));
  }
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes.length, true);
  const wavBytes = new Uint8Array(header.byteLength + pcmBytes.length);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(pcmBytes, header.byteLength);
  return `data:audio/wav;base64,${Buffer.from(wavBytes).toString("base64")}`;
}

function pickMockEpisodeImageUrl(taskId: string) {
  const seed = [...String(taskId ?? "mock-image")]
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return mockEpisodeImageUrls[seed % mockEpisodeImageUrls.length];
}

function isMockEpisodeImageUrl(value: unknown) {
  return /mock-image-[^?]+\.(?:avif|png|webp)(?:\?|$)/i.test(String(value ?? "").trim());
}

function readErrorFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as { failureCode?: unknown }).failureCode;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readErrorStorageObjectId(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as { storageObjectId?: unknown }).storageObjectId;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function generationFailureNoticeType(failureCode: string | null | undefined): string {
  const code = String(failureCode ?? "").trim();
  if (
    code === "provider_output_persist_failed" ||
    code === "provider_result_unknown" ||
    code === "worker_crashed_after_external_start"
  ) {
    return "manual_review";
  }
  if (
    code === "provider_api_key_env_required" ||
    code === "provider_api_key_missing" ||
    code === "provider_adapter_missing" ||
    code === "provider_circuit_open" ||
    code === "storage_put_object_required"
  ) {
    return "admin_action_required";
  }
  if (code === "insufficient_credits" || code.startsWith("model_")) {
    return "warning";
  }
  return "error";
}

function generationFailureDisplayMessage(input: {
  failureCode: string | null | undefined;
  snapshotFailure?: Record<string, unknown>;
  providerMessage?: string | null;
  providerErrorCode?: string | null;
}): string {
  const failureCode = String(input.failureCode ?? "").trim();
  const explicit = readString(input.snapshotFailure?.displayMessage);
  if (explicit && explicit !== failureCode && !/^[a-z0-9_:-]+$/i.test(explicit)) {
    return explicit;
  }
  const providerMessage = String(input.providerMessage ?? "").trim();
  if (failureCode === "provider_failed" && providerMessage) {
    return generationProviderFailureDisplayMessage(providerMessage) ||
      `模型供应商返回失败：${providerMessage}`;
  }
  const providerErrorCode = String(input.providerErrorCode ?? "").trim();
  if (failureCode === "provider_failed" && providerErrorCode) {
    return generationProviderFailureDisplayMessage(providerErrorCode) ||
      `模型供应商返回失败：${providerErrorCode}`;
  }
  return generationFailureDisplayMessageByCode(failureCode);
}

function generationProviderFailureDisplayMessage(value: string): string {
  const code = value.trim();
  if (code === "provider_submission_ambiguous") {
    return "模型请求已发出，但供应商没有返回明确提交结果。系统已停止继续处理并返还积分，请稍后重试；如果供应商侧实际生成了结果，需要后台复核。";
  }
  const openAiImagesStatus = /^openai_images_(\d{3})$/i.exec(code)?.[1];
  if (openAiImagesStatus === "504") {
    return "GPT Image 2 中转站或供应商响应超时（HTTP 504），任务没有拿到生成结果，积分已返还。请稍后重试或检查中转站稳定性。";
  }
  if (openAiImagesStatus === "429") {
    return "GPT Image 2 中转站或供应商触发限流（HTTP 429），积分已返还。请稍后重试。";
  }
  if (openAiImagesStatus === "401" || openAiImagesStatus === "403") {
    return "GPT Image 2 中转站或供应商鉴权失败，请联系管理员检查 API Key 和中转站权限。";
  }
  if (openAiImagesStatus === "400") {
    return "GPT Image 2 中转站或供应商拒绝了本次请求，请检查提示词、参考图或模型参数。";
  }
  if (openAiImagesStatus && Number(openAiImagesStatus) >= 500) {
    return `GPT Image 2 中转站或供应商服务异常（HTTP ${openAiImagesStatus}），积分已返还。请稍后重试。`;
  }
  return "";
}

function generationFailureDisplayMessageByCode(failureCode: string): string {
  return (
    {
      task_timeout: "生成任务超过 15 分钟未完成，已自动标记失败并返还积分。",
      provider_failed: "模型供应商返回失败，积分已返还。请调整提示词或稍后重试。",
      provider_submission_ambiguous: "模型请求已发出，但供应商没有返回明确提交结果。系统已停止继续处理并返还积分，请稍后重试；如果供应商侧实际生成了结果，需要后台复核。",
      openai_images_504: "GPT Image 2 中转站或供应商响应超时（HTTP 504），任务没有拿到生成结果，积分已返还。请稍后重试或检查中转站稳定性。",
      provider_poll_timeout: "模型生成结果查询超时，任务已失败并返还积分。",
      provider_result_unknown: "模型生成状态暂不确定，请稍后刷新或联系后台复核。",
      provider_output_download_failed: "模型已生成结果，但从供应商下载产物失败，积分已返还。",
      provider_output_upload_failed: "模型已生成结果，但上传到平台存储失败，积分已返还。",
      provider_output_persist_failed: "产物已上传到平台存储，但写入资产记录或绑定分镜失败，正在等待后台补写。",
      provider_api_key_env_required: "模型供应商密钥环境变量未配置，请联系管理员。",
      provider_api_key_missing: "模型供应商密钥为空，请联系管理员检查环境配置。",
      provider_adapter_missing: "当前模型供应商适配器不可用，请联系管理员检查模型配置。",
      provider_circuit_open: "模型供应商熔断保护中，请稍后重试或联系管理员。",
      worker_crashed_after_external_start: "任务已提交到模型供应商，但本地 worker 中断，结果需要后台复核。",
      storage_put_object_required: "平台存储上传能力未启用，请联系管理员检查 COS 配置。",
      model_not_configured: "当前模型未配置，请切换模型或联系管理员。",
      model_disabled: "当前模型维护中，请切换模型后重试。",
      model_task_mode_unsupported: "当前模型不支持这类生成方式，请切换模型或生成模式。",
      model_media_type_mismatch: "当前模型类型与生成内容不匹配，请切换模型。",
      model_reference_limit_exceeded: "参考素材数量超出模型限制，请减少参考图后重试。",
      model_reference_not_found: "参考素材不存在或无权访问，请重新选择参考图。",
      model_reference_unavailable: "参考素材尚未准备好，请重新选择或稍后重试。",
      model_reference_mime_not_allowed: "当前模型不支持该参考素材格式，请更换参考图。",
      model_prompt_too_long: "提示词过长，请缩短后重试。",
      insufficient_credits: "积分不足，任务未提交到模型供应商。",
    }[failureCode] ?? `生成任务失败：${failureCode || "unknown_failure"}`
  );
}

function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parseRuntimePositiveInt(
      env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS,
      3,
      10,
    ),
    retryDelayMs: parseRuntimeNonNegativeInt(
      env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS,
      1000,
      60_000,
    ),
  };
}

function parseContentLength(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function delay(ms: number) {
  return ms > 0 ? new Promise((resolvePromise) => setTimeout(resolvePromise, ms)) : Promise.resolve();
}

function createCountingUploadStream(body: ReadableStream<Uint8Array>) {
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : Buffer.byteLength(chunk);
      callback(null, chunk);
    },
  });
  return {
    stream: Readable.fromWeb(body as never).pipe(counter),
    getSizeBytes: () => sizeBytes,
  };
}

async function uploadProviderArtifactToStorage(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    artifactUrl: string;
    objectName: string;
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
    runtime: UploadSessionRuntime;
    metadata: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number | null;
  uploadResult?: { eTag?: string | null; versionId?: string | null } | undefined;
}> {
  const { retryAttempts, retryDelayMs } = readGenerationArtifactUploadConfig(input.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const artifactResponse = await fetchImpl(input.artifactUrl);
    if (!artifactResponse.ok || !artifactResponse.body) {
      throw Object.assign(new Error(`provider_artifact_download_${artifactResponse.status}`), {
        failureCode: "provider_output_download_failed",
        storageObjectId: storageObject?.id,
      });
    }

    contentType =
      artifactResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
      contentType;
    knownSizeBytes =
      parseContentLength(artifactResponse.headers.get("content-length")) ??
      knownSizeBytes;

    if (!storageObject) {
      storageObject = await createScopedStorageObject(db, {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        bucket: input.runtime.bucket,
        objectName: input.objectName,
        contentType,
        sizeBytes: knownSizeBytes,
        provider: input.runtime.provider,
        status: "pending_upload",
        metadata: input.metadata,
        createdByUserId: input.createdByUserId ?? null,
        now: input.now,
      });
    }

    const counted = createCountingUploadStream(artifactResponse.body);
    try {
      let uploadResult: { eTag?: string | null; versionId?: string | null } | undefined;
      if (
        (input.runtime.mode === "cos" || input.runtime.mode === "s3_compatible") &&
        typeof input.runtime.adapter.putObject === "function"
      ) {
        uploadResult = await input.runtime.adapter.putObject({
          bucket: storageObject.bucket,
          objectKey: storageObject.objectKey,
          body: counted.stream,
          contentType,
        });
      } else {
        await writeLocalStorageObjectFromStream({
          bucket: storageObject.bucket,
          objectKey: storageObject.objectKey,
          body: counted.stream,
        });
      }

      return {
        storageObject,
        contentType,
        sizeBytes: knownSizeBytes ?? counted.getSizeBytes(),
        uploadResult,
      };
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode: "provider_output_upload_failed",
          storageObjectId: storageObject.id,
        });
      }
      await delay(retryDelayMs);
    }
  }

  throw Object.assign(new Error("provider_artifact_upload_retry_exhausted"), {
    failureCode: "provider_output_upload_failed",
    storageObjectId: storageObject?.id,
  });
}

async function uploadProviderArtifactBytesToStorage(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    bytes: Uint8Array;
    contentType: string;
    objectName: string;
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
    runtime: UploadSessionRuntime;
    metadata: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number;
  uploadResult?: { eTag?: string | null; versionId?: string | null } | undefined;
}> {
  const { retryAttempts, retryDelayMs } = readGenerationArtifactUploadConfig(input.env);
  const storageObject = await createScopedStorageObject(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    bucket: input.runtime.bucket,
    objectName: input.objectName,
    contentType: input.contentType,
    sizeBytes: input.bytes.byteLength,
    provider: input.runtime.provider,
    status: "pending_upload",
    metadata: input.metadata,
    createdByUserId: input.createdByUserId ?? null,
    now: input.now,
  });

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      let uploadResult: { eTag?: string | null; versionId?: string | null } | undefined;
      if (
        (input.runtime.mode === "cos" || input.runtime.mode === "s3_compatible") &&
        typeof input.runtime.adapter.putObject === "function"
      ) {
        uploadResult = await input.runtime.adapter.putObject({
          bucket: storageObject.bucket,
          objectKey: storageObject.objectKey,
          body: input.bytes,
          contentType: input.contentType,
        });
      } else {
        await writeLocalStorageObject({
          bucket: storageObject.bucket,
          objectKey: storageObject.objectKey,
          bytes: input.bytes,
        });
      }

      return {
        storageObject,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        uploadResult,
      };
    } catch (error) {
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode: "provider_output_upload_failed",
          storageObjectId: storageObject.id,
        });
      }
      await delay(retryDelayMs);
    }
  }

  throw Object.assign(new Error("provider_artifact_upload_retry_exhausted"), {
    failureCode: "provider_output_upload_failed",
    storageObjectId: storageObject.id,
  });
}

function decodeImageArtifactBytes(artifact: MediaGenerationArtifact) {
  if (artifact.b64Json && artifact.b64Json.trim()) {
    return new Uint8Array(Buffer.from(artifact.b64Json, "base64"));
  }
  return null;
}

function resolvePreferredEpisodeImageUrl(...candidates: unknown[]) {
  const normalized = candidates.map((value) => String(value ?? "").trim()).filter(Boolean);
  return normalized.find((value) => !isMockEpisodeImageUrl(value)) ?? normalized[0] ?? null;
}

function replaceMockImageUrlsInValue(value: unknown, taskId: string | null | undefined): unknown {
  if (!taskId) {
    return value;
  }
  const mockImageUrl = pickMockEpisodeImageUrl(taskId);
  if (Array.isArray(value)) {
    return value.map((item) => replaceMockImageUrlsInValue(item, taskId));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const next = { ...record };
  for (const [key, current] of Object.entries(record)) {
    if (typeof current === "string" && /mock-image-[^?]+\.(avif|png|webp)(\?|$)/i.test(current)) {
      next[key] = mockImageUrl;
      continue;
    }
    if (current && typeof current === "object") {
      next[key] = replaceMockImageUrlsInValue(current, taskId);
    }
  }
  return next;
}

async function settleTimedOutEpisodeGenerationTask(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    now: Date;
  },
) {
  const row = await queryOne<{
    task_id: string;
    workflow_id: string;
    status: string;
    organization_id: string;
    current_attempt_id: string | null;
    input_snapshot_json: Record<string, unknown> | string;
    reservation_id: string | null;
    amount_reserved: number | string | null;
  }>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.status,
        t.organization_id,
        t.current_attempt_id,
        t.input_snapshot_json,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
       AND r.status IN ('active', 'partially_settled')
      WHERE t.id = $1
        AND t.task_type IN ('episode_generate_image', 'episode_generate_video')
      LIMIT 1
    `,
    [input.taskId],
  );
  if (!row || !["queued", "running"].includes(row.status)) {
    return false;
  }
  const snapshot =
    typeof row.input_snapshot_json === "string"
      ? JSON.parse(row.input_snapshot_json) as Record<string, unknown>
      : row.input_snapshot_json;
  const timeoutAt = snapshot.timeoutAt ? new Date(String(snapshot.timeoutAt)) : null;
  const createdAtTimeout = snapshot.requestedAt
    ? new Date(new Date(String(snapshot.requestedAt)).getTime() + generationTaskTimeoutMs)
    : null;
  const effectiveTimeoutAt = timeoutAt && !Number.isNaN(timeoutAt.getTime()) ? timeoutAt : createdAtTimeout;
  if (!effectiveTimeoutAt || input.now.getTime() <= effectiveTimeoutAt.getTime()) {
    return false;
  }

  await db.query(
    `
      UPDATE tasks
      SET status = 'failed',
          failure_code = 'task_timeout',
          locked_by = NULL,
          locked_until = NULL,
          updated_at = $2
      WHERE id = $1
        AND status IN ('queued', 'running')
    `,
    [row.task_id, input.now],
  );
  await aggregateWorkflowStatus(db, row.workflow_id);

  const amount = Number(row.amount_reserved ?? 0);
  if (row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
      reservationId: row.reservation_id,
      allocationKey: "task-timeout",
      amount,
      outcome: "released",
      taskId: row.task_id,
      attemptId: row.current_attempt_id,
      metadata: {
        failureCode: "task_timeout",
        episodeId: snapshot.episodeId ?? null,
        kind: snapshot.kind ?? null,
      },
      now: input.now,
    });
  }
  await markGenerationTaskSnapshotFailed(db, {
    taskId: row.task_id,
    attemptId: row.current_attempt_id,
    failure: {
      failureCode: "task_timeout",
      displayMessage: generationFailureDisplayMessageByCode("task_timeout"),
    },
    creditSummary: {
      released: amount,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
  return true;
}

async function repairTimedOutEpisodeGenerationTasks(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    now: Date;
    limit?: number;
  },
) {
  const candidates = await db.query<{ id: string }>(
    `
      SELECT id
      FROM tasks
      WHERE task_type IN ('episode_generate_image', 'episode_generate_video')
        AND status IN ('queued', 'running')
        AND (
          (
            input_snapshot_json->>'timeoutAt' IS NOT NULL
            AND (input_snapshot_json->>'timeoutAt')::timestamptz < $1
          )
          OR (
            input_snapshot_json->>'timeoutAt' IS NULL
            AND input_snapshot_json->>'requestedAt' IS NOT NULL
            AND (input_snapshot_json->>'requestedAt')::timestamptz < ($1::timestamptz - interval '15 minutes')
          )
          OR (
            input_snapshot_json->>'timeoutAt' IS NULL
            AND input_snapshot_json->>'requestedAt' IS NULL
            AND created_at < ($1::timestamptz - interval '15 minutes')
          )
        )
      ORDER BY created_at ASC, id ASC
      LIMIT $2
    `,
    [input.now, input.limit ?? 100],
  );
  const timedOutTaskIds: string[] = [];
  for (const row of candidates.rows) {
    const settled = await settleTimedOutEpisodeGenerationTask(db, {
      taskId: row.id,
      now: input.now,
    });
    if (settled) {
      timedOutTaskIds.push(row.id);
    }
  }
  return { timedOutTaskIds };
}

async function syncSeedanceVideoTaskOnRead(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    sessionToken: string;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
  },
) {
  if (!isEnabled(input.env.SEEDANCE_PROVIDER_ENABLED)) {
    return false;
  }

  const row = await queryOne<{
    task_id: string;
    workflow_id: string;
    attempt_id: string | null;
    organization_id: string;
    workspace_id: string;
    project_id: string;
    input_snapshot_json: Record<string, unknown> | string;
    provider_request_id: string | null;
    external_request_id: string | null;
    reservation_id: string | null;
    amount_reserved: number | string | null;
  }>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.current_attempt_id AS attempt_id,
        t.organization_id,
        t.workspace_id,
        t.project_id,
        t.input_snapshot_json,
        pr.id AS provider_request_id,
        pr.external_request_id,
        r.id AS reservation_id,
        r.amount_reserved
      FROM tasks t
      LEFT JOIN provider_requests pr
        ON pr.organization_id = t.organization_id
       AND pr.task_id = t.id
       AND pr.provider_name = 'volcengine'
      LEFT JOIN credit_reservations r
        ON r.organization_id = t.organization_id
       AND r.task_id = t.id
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status = 'running'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
      LIMIT 1
    `,
    [input.taskId],
  );
  if (!row?.provider_request_id || !row.external_request_id) {
    return false;
  }

  const snapshot =
    typeof row.input_snapshot_json === "string"
      ? JSON.parse(row.input_snapshot_json) as Record<string, unknown>
      : row.input_snapshot_json;
  const modelConfig = await findActiveAiModelConfigByCode(db, "seedance-i2v-pro");
  const adapter = createSeedancePollAdapterFromModelConfig(modelConfig, input.env, input.fetchImpl);
  const poll = await adapter.poll({ externalRequestId: row.external_request_id });

  if (poll.status === "running" || poll.status === "accepted") {
    return false;
  }

  if (poll.status === "failed") {
    await markProviderRequestFailed(db, {
      providerRequestId: row.provider_request_id,
      failureCode: "provider_failed",
      redactedResponse: poll.redactedResponse,
      now: input.now,
    });
    await finalizeTaskAttempt(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id!,
      status: "failed",
      failureCode: "provider_failed",
      now: input.now,
    });
    await aggregateWorkflowStatus(db, row.workflow_id);
    const amount = Number(row.amount_reserved ?? 0);
    if (row.reservation_id && amount > 0) {
      await settleReservationAllocation(db, {
        reservationId: row.reservation_id,
        allocationKey: "seedance-provider-failed",
        amount,
        outcome: "released",
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        metadata: poll.redactedResponse,
        now: input.now,
      });
    }
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      providerStatus: poll.redactedResponse,
      failure: {
        failureCode: "provider_failed",
        providerStatus: readString(poll.redactedResponse.providerStatus),
        providerErrorCode: readString(poll.redactedResponse.providerErrorCode),
        providerMessage: readString(poll.redactedResponse.providerMessage),
        displayMessage: generationFailureDisplayMessage({
          failureCode: "provider_failed",
          providerMessage: readString(poll.redactedResponse.providerMessage),
          providerErrorCode: readString(poll.redactedResponse.providerErrorCode),
        }),
      },
      creditSummary: {
        released: amount,
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return true;
  }

  if (!poll.videoUrl) {
    return false;
  }

  await markProviderRequestSucceeded(db, {
    providerRequestId: row.provider_request_id,
    externalRequestId: row.external_request_id,
    redactedResponse: poll.redactedResponse,
    now: input.now,
  });

  const artifactMetadata = {
    episodeId: snapshot.episodeId ?? null,
    taskId: row.task_id,
    provider: "seedance",
    externalRequestId: row.external_request_id,
  };
  let pendingStorageObjectId: string | null = null;
  try {
    const objectName = `episodes/${String(snapshot.episodeId ?? row.task_id)}/seedance/seedance-video-${row.task_id}.mp4`;
    const uploadedArtifact = await uploadProviderArtifactToStorage(db, {
      artifactUrl: poll.videoUrl,
      objectName,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      runtime: input.runtime,
      metadata: artifactMetadata,
      env: input.env,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
    const storageObject = uploadedArtifact.storageObject;
    pendingStorageObjectId = storageObject.id;
    const availableStorageObject = await markStorageObjectAvailable(db, {
      storageObjectId: storageObject.id,
      contentType: uploadedArtifact.contentType,
      sizeBytes: uploadedArtifact.sizeBytes,
      eTag: uploadedArtifact.uploadResult?.eTag ?? null,
      versionId: uploadedArtifact.uploadResult?.versionId ?? null,
      metadata: artifactMetadata,
      now: input.now,
    });
    if (!availableStorageObject) {
      throw Object.assign(new Error("seedance_storage_object_missing_after_upload"), {
        failureCode: "provider_output_persist_failed",
      });
    }
    const urls = await signedUrlsForStorageObject(db, {
      sessionToken: input.sessionToken,
      storageObjectId: availableStorageObject.id,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: 900,
      now: input.now,
    });
    const targetAsset = await resolveEpisodeGenerationTargetAsset(db, {
      organizationId: row.organization_id,
      projectId: row.project_id,
      episodeId: String(snapshot.episodeId ?? ""),
      targetType: String(snapshot.targetType ?? "episode"),
      targetId: String(snapshot.targetId ?? snapshot.episodeId ?? row.task_id),
      assetType: "shot_video",
    });
    await createAssetVersionSnapshot(db, {
      organizationId: row.organization_id,
      projectId: row.project_id,
      assetType: "shot_video",
      assetKey: targetAsset?.assetKey ?? `video:${String(snapshot.episodeId ?? row.project_id)}:${row.task_id}`,
      createdByUserId: null,
      storageObjectId: availableStorageObject.id,
      storageObjectKey: availableStorageObject.objectKey,
      metadata: {
        ...(targetAsset?.metadata ?? {}),
        mimeType: uploadedArtifact.contentType,
        label: "Seedance episode video",
        episodeId: snapshot.episodeId ?? null,
        taskId: row.task_id,
        targetType: snapshot.targetType ?? "episode",
        targetId: snapshot.targetId ?? snapshot.episodeId ?? null,
        previewUrl: urls.previewUrl,
        sourceUrl: urls.sourceUrl,
        downloadUrl: urls.downloadUrl,
        provider: "seedance",
        externalRequestId: row.external_request_id,
      },
      sourceTaskId: row.task_id,
      sourceAttemptId: row.attempt_id,
      now: input.now,
    });
  } catch (error) {
    const failedStorageObjectId = pendingStorageObjectId ?? readErrorStorageObjectId(error) ?? null;
    if (failedStorageObjectId) {
      await markStorageObjectFailed(db, {
        storageObjectId: failedStorageObjectId,
        status: "failed",
        now: input.now,
      });
    }
    const failureCode = readErrorFailureCode(error) ?? "provider_output_persist_failed";
    await finalizeTaskAttempt(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id!,
      status: "failed",
      failureCode,
      now: input.now,
    });
    await aggregateWorkflowStatus(db, row.workflow_id);
    const amount = Number(row.amount_reserved ?? 0);
    if (row.reservation_id && amount > 0) {
      await settleReservationAllocation(db, {
        reservationId: row.reservation_id,
        allocationKey: failureCode,
        amount,
        outcome: "released",
        taskId: row.task_id,
        attemptId: row.attempt_id,
        providerRequestId: row.provider_request_id,
        metadata: {
          provider: "seedance",
          externalRequestId: row.external_request_id,
          failureCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        now: input.now,
      });
    }
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      failure: {
        failureCode,
        displayMessage: generationFailureDisplayMessage({
          failureCode,
          providerMessage: error instanceof Error ? error.message : String(error),
        }),
        providerMessage: error instanceof Error ? error.message : String(error),
      },
      creditSummary: {
        released: amount,
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    return true;
  }
  await finalizeTaskAttempt(db, {
    taskId: row.task_id,
    attemptId: row.attempt_id!,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, row.workflow_id);
  const amount = Number(row.amount_reserved ?? 0);
  if (row.reservation_id && amount > 0) {
    await settleReservationAllocation(db, {
      reservationId: row.reservation_id,
      allocationKey: "seedance-result",
      amount,
      outcome: "consumed",
      taskId: row.task_id,
      attemptId: row.attempt_id,
      providerRequestId: row.provider_request_id,
      metadata: {
        provider: "seedance",
        externalRequestId: row.external_request_id,
      },
      now: input.now,
    });
  }
  return true;
}

async function runCreatorRepairMaintenance(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    runtime: UploadSessionRuntime;
    now: Date;
    limit?: number;
  },
) {
  const storage = await runStorageRepairJob(db, {
    runtime: input.runtime,
    now: input.now,
  });
  const episodeGeneration = await repairTimedOutEpisodeGenerationTasks(db, {
    now: input.now,
    limit: input.limit,
  });
  return {
    storage,
    episodeGeneration,
  };
}

async function createEpisodeGenerationTask(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    kind: "image" | "video";
    episodeId: string;
    body: Record<string, unknown>;
    idempotencyKey: string;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return { status: 404 as const, body: null };
  }

  const config = normalizeGenerationKind(input.kind);
  const requestedModelCode = requestModelCode(input.body.model);
  const modelConfig = requestedModelCode
    ? await findActiveAiModelConfigByCode(db, requestedModelCode)
    : undefined;
  const estimatedCost = generationCostFromModelConfig(config.cost, modelConfig);
  const generationQueueConfig = loadGenerationQueueConfig(input.env);
  const shouldUseBullMQDispatch = generationQueueConfig.outboxDispatcherEnabled;
  const bullMqSubmitQueueName = input.kind === "video"
    ? generationQueueConfig.queues.submitVideo
    : generationQueueConfig.queues.submitImage;
  const shouldUseSeedanceProvider =
    input.kind === "video" &&
    requestedModelCode === "seedance-i2v-pro" &&
    isEnabled(input.env.SEEDANCE_PROVIDER_ENABLED);
  const shouldUseGptImageProvider =
    input.kind === "image" &&
    requestedModelCode === "gpt-image-2-cn" &&
    isEnabled(input.env.GPT_IMAGE2_PROVIDER_ENABLED);
  const rawParameters = input.body.parameters && typeof input.body.parameters === "object"
    ? input.body.parameters as Record<string, unknown>
    : {};
  const referenceAssetVersionIds = input.kind === "image"
    ? readGenerationReferenceAssetVersionIds(input.body, rawParameters)
    : [];
  validateGenerationReferenceLimit(referenceAssetVersionIds, modelConfig);
  const resolvedReferenceImages = input.kind === "image"
    ? await resolveGenerationReferenceImages(db, {
        organizationId: context.actor.organizationId,
        projectId: context.project.id,
        assetVersionIds: referenceAssetVersionIds,
        modelConfig,
        runtime: input.runtime,
      })
    : [];
  const parameters = resolvedReferenceImages.length
    ? {
        ...rawParameters,
        referenceImages: [
          ...readArray(rawParameters.referenceImages),
          ...resolvedReferenceImages,
        ],
      }
    : rawParameters;
  const requestSnapshot = {
    kind: input.kind,
    episodeId: input.episodeId,
    targetType: String(input.body.targetType ?? (input.body.shotId ? "storyboard" : "episode")),
    targetId: String(input.body.targetId ?? input.body.shotId ?? input.episodeId),
    prompt: String(input.body.prompt ?? input.body.promptOverride ?? input.body.motionPrompt ?? ""),
    model: requestedModelCode,
    referenceAssetVersionIds,
    firstFrameUrl: resolveFirstFrameUrl(input.body),
    parameters,
    audioEnabled: Boolean(input.body.audioEnabled),
    musicEnabled: Boolean(input.body.musicEnabled),
    lipSyncEnabled: Boolean(input.body.lipSyncEnabled),
  };
  const store = new SqlIdempotencyRecordStore(db);
  const started = await beginOrReplayCommand(store, {
    organizationId: context.actor.organizationId,
    operationName: config.operationName,
    idempotencyKey: input.idempotencyKey,
    requestHash: hashJson(requestSnapshot),
  });

  if (started.kind === "replayed" && started.record.responseResourceId) {
    const replayed = await mapGenerationTaskResponse(db, {
      taskId: started.record.responseResourceId,
      sessionToken: input.authenticated.sessionToken,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
    return { status: 200 as const, body: replayed };
  }
  if (started.kind === "processing") {
    throw new IdempotencyProcessingError(started.record);
  }

  const targetEntityType =
    requestSnapshot.targetType === "storyboard" && isUuid(requestSnapshot.targetId)
      ? "shot"
      : "episode";
  const targetEntityId =
    targetEntityType === "shot" && isUuid(requestSnapshot.targetId)
      ? requestSnapshot.targetId
      : input.episodeId;
  const timeoutAt = new Date(input.now.getTime() + generationTaskTimeoutMs);
  const workflow = await createWorkflowWithTasks(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId!,
    projectId: context.project.id,
    workflowType: config.workflowType,
    inputSnapshot: {
      ...requestSnapshot,
      requestedAt: input.now.toISOString(),
      timeoutAt: timeoutAt.toISOString(),
      mockExecutor: !(shouldUseSeedanceProvider || shouldUseGptImageProvider),
      providerExecutor: shouldUseSeedanceProvider ? "seedance" : shouldUseGptImageProvider ? "gpt-image-2" : "mock",
    },
    createdByUserId: context.userId,
    tasks: [
      {
        taskType: config.taskType,
        queueName: shouldUseBullMQDispatch ? bullMqSubmitQueueName : config.queueName,
        targetEntityType,
        targetEntityId,
        inputSnapshot: {
          ...requestSnapshot,
          cost: estimatedCost,
          requestedAt: input.now.toISOString(),
          timeoutAt: timeoutAt.toISOString(),
          mockExecutor: !(shouldUseSeedanceProvider || shouldUseGptImageProvider),
          providerExecutor: shouldUseSeedanceProvider ? "seedance" : shouldUseGptImageProvider ? "gpt-image-2" : "mock",
        },
      },
    ],
  });
  const task = workflow.tasks[0]!;

  await db.query(
    `
      UPDATE workflows
      SET idempotency_record_id = $2,
          idempotency_key = $3
      WHERE id = $1
    `,
    [workflow.workflow.id, started.record.id, input.idempotencyKey],
  );
  await db.query(
    `
      UPDATE tasks
      SET idempotency_record_id = $2,
          idempotency_key = $3
      WHERE id = $1
    `,
    [task.id, started.record.id, input.idempotencyKey],
  );

  const reservation = await reserveCredits(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId,
    projectId: context.project.id,
    workflowId: workflow.workflow.id,
    taskId: task.id,
    amount: estimatedCost,
    sourceType: "episode_generation_task",
    sourceId: task.id,
    reason: `${input.kind} generation`,
    metadata: {
      episodeId: input.episodeId,
      kind: input.kind,
    },
    createdByUserId: context.userId,
    now: input.now,
  });

  await upsertQueuedGenerationTaskSnapshot(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    targetType: requestSnapshot.targetType,
    targetId: requestSnapshot.targetId,
    workflowId: workflow.workflow.id,
    taskId: task.id,
    modelConfigId: modelConfig?.id ?? null,
    creditReservationId: reservation.reservation.id,
    modelCode: requestedModelCode || (input.kind === "video" ? "mock-video" : "mock-image"),
    mediaType: input.kind,
    taskMode: input.kind === "video" ? "video.image_to_video" : "image.generate",
    estimatedCredits: estimatedCost,
    requestSummary: {
      prompt: requestSnapshot.prompt,
      parameters: requestSnapshot.parameters,
      targetType: requestSnapshot.targetType,
      targetId: requestSnapshot.targetId,
      referenceCount: input.kind === "image" ? referenceAssetVersionIds.length : 0,
    },
    creditSummary: {
      reservationId: reservation.reservation.id,
      reserved: estimatedCost,
    },
    now: input.now,
  });

  if (shouldUseBullMQDispatch) {
    await appendGenerationTaskCreatedOutboxEvent(db, {
      organizationId: context.actor.organizationId,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      kind: input.kind,
      modelCode: requestedModelCode || null,
      queueName: bullMqSubmitQueueName,
      targetType: requestSnapshot.targetType,
      targetId: requestSnapshot.targetId,
      providerExecutor: shouldUseSeedanceProvider ? "seedance" : shouldUseGptImageProvider ? "gpt-image-2" : "mock",
      availableAt: input.now,
    });

    const responseBody = await mapGenerationTaskResponse(db, {
      taskId: task.id,
      sessionToken: input.authenticated.sessionToken,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
    await store.update({
      ...started.record,
      responseResourceType: "generation_task",
      responseResourceId: task.id,
      responseSnapshot: responseBody as Record<string, unknown>,
      status: "succeeded",
      updatedAt: input.now,
    });

    return { status: 200 as const, body: responseBody };
  }

  if (shouldUseGptImageProvider) {
    const claim = await claimQueuedTask(db, {
      taskId: task.id,
      workerId: "episode-gpt-image-submit-worker",
      now: input.now,
      leaseMs: 5 * 60_000,
    });
    if (!claim) {
      throw new Error("task_claim_failed");
    }

    let providerRequestId: string | null = null;
    try {
      if (!modelConfig) {
        throw new Error("gpt_image_model_config_missing");
      }
      const payloadRef = `creator://episodes/${input.episodeId}/image/${task.id}`;
      const payloadHash = sha256(`${payloadRef}:${requestSnapshot.prompt}`);
      const adapter = createProviderAdapterFromModelConfig(
        {
          providerProtocol: modelConfig.providerProtocol,
          providerModel: modelConfig.providerModel,
          providerConfig: modelConfig.providerConfig,
        },
        input.env,
        input.fetchImpl,
      );
      const submitted = await submitProviderRequest(db, {
        organizationId: context.actor.organizationId,
        workspaceId: context.actor.workspaceId,
        projectId: context.project.id,
        workflowId: workflow.workflow.id,
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerName: modelConfig.providerName,
        providerOperation: operationNames.episodeImageGenerate,
        requestKey: `${workflow.workflow.id}:${task.id}`,
        requestHash: sha256(`${task.id}:${requestSnapshot.model}:${requestSnapshot.prompt}`),
        payloadRef,
        payloadHash,
        redactedPayload: {
          prompt: requestSnapshot.prompt,
          parameters: requestSnapshot.parameters,
          episodeId: input.episodeId,
          targetType: requestSnapshot.targetType,
          targetId: requestSnapshot.targetId,
        },
        createdByUserId: context.userId,
        now: input.now,
        adapter,
      });
      providerRequestId = submitted.request.id;
      if (submitted.kind !== "submitted" || !submitted.artifacts?.length) {
        throw Object.assign(new Error("gpt_image_artifact_missing"), {
          failureCode: "provider_output_download_failed",
        });
      }

      const artifact = submitted.artifacts.find((item) => item.mediaType === "image");
      if (!artifact) {
        throw Object.assign(new Error("gpt_image_image_artifact_missing"), {
          failureCode: "provider_output_download_failed",
        });
      }
      await markProviderRequestSucceeded(db, {
        providerRequestId,
        externalRequestId: submitted.request.externalRequestId,
        redactedResponse: {
          ...(submitted.request.redactedResponse ?? {}),
          artifact: serializeGptImageArtifactForProviderResponse(artifact),
        },
        now: input.now,
      });
      const resultAssetType = resolveEpisodeGenerationAssetType({
        kind: "image",
        targetType: requestSnapshot.targetType,
        assetType: input.body.assetType,
      });
      const targetAsset = await resolveEpisodeGenerationTargetAsset(db, {
        organizationId: context.actor.organizationId,
        projectId: context.project.id,
        episodeId: input.episodeId,
        targetType: requestSnapshot.targetType,
        targetId: requestSnapshot.targetId,
        assetType: resultAssetType,
      });
      const persisted = await persistGptImageArtifact(db, {
        task: {
          organizationId: context.actor.organizationId,
          workspaceId: context.actor.workspaceId,
          projectId: context.project.id,
          taskId: task.id,
          attemptId: claim.attempt.id,
          createdByUserId: context.userId,
        },
        snapshot: {
          episodeId: input.episodeId,
          targetType: requestSnapshot.targetType,
          targetId: requestSnapshot.targetId,
        },
        artifact,
        externalRequestId: submitted.request.externalRequestId,
        runtime: input.runtime,
        env: input.env,
        fetchImpl: input.fetchImpl,
        now: input.now,
        assetType: resultAssetType,
        assetKey: targetAsset?.assetKey ?? `image:${input.episodeId}:${task.id}`,
        assetMetadata: targetAsset?.metadata ?? {},
        label: "GPT Image 2 episode image",
        resolveUrls: async (storageObject) =>
          signedUrlsForStorageObject(db, {
            sessionToken: input.authenticated.sessionToken,
            storageObjectId: storageObject.id,
            runtime: input.runtime,
            signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
            now: input.now,
          }),
      });

      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "succeeded",
        now: input.now,
      });
      await aggregateWorkflowStatus(db, workflow.workflow.id);
      await settleReservationAllocation(db, {
        reservationId: reservation.reservation.id,
        allocationKey: "gpt-image-2-result",
        amount: estimatedCost,
        outcome: "consumed",
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerRequestId,
        metadata: {
          provider: "gpt-image-2",
          episodeId: input.episodeId,
        },
        now: input.now,
      });
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerRequestId,
        resultAssets: [persisted],
        providerStatus: {
          provider: "gpt-image-2",
          externalRequestId: submitted.request.externalRequestId,
        },
        creditSummary: {
          consumed: estimatedCost,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });

      const responseBody = await mapGenerationTaskResponse(db, {
        taskId: task.id,
        sessionToken: input.authenticated.sessionToken,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      });
      await store.update({
        ...started.record,
        responseResourceType: "generation_task",
        responseResourceId: task.id,
        responseSnapshot: responseBody as Record<string, unknown>,
        status: "succeeded",
        updatedAt: input.now,
      });

      return { status: 200 as const, body: responseBody };
    } catch (error) {
      const failureCode = readErrorFailureCode(error) ?? "provider_failed";
      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "failed",
        failureCode,
        now: input.now,
      });
      await aggregateWorkflowStatus(db, workflow.workflow.id);
      await settleReservationAllocation(db, {
        reservationId: reservation.reservation.id,
        allocationKey: failureCode,
        amount: estimatedCost,
        outcome: "released",
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerRequestId,
        metadata: {
          provider: "gpt-image-2",
          failureCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        now: input.now,
      });
      await markGenerationTaskSnapshotFailed(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerRequestId,
        failure: {
          failureCode,
          displayMessage: generationFailureDisplayMessage({
            failureCode,
            providerMessage: error instanceof Error ? error.message : String(error),
          }),
          providerMessage: error instanceof Error ? error.message : String(error),
        },
        creditSummary: {
          released: estimatedCost,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      const responseBody = await mapGenerationTaskResponse(db, {
        taskId: task.id,
        sessionToken: input.authenticated.sessionToken,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      });
      await store.update({
        ...started.record,
        responseResourceType: "generation_task",
        responseResourceId: task.id,
        responseSnapshot: responseBody as Record<string, unknown>,
        status: "succeeded",
        updatedAt: input.now,
      });

      return { status: 200 as const, body: responseBody };
    }
  }

  if (shouldUseSeedanceProvider && !shouldUseBullMQDispatch) {
    const claim = await claimQueuedTask(db, {
      taskId: task.id,
      workerId: "episode-seedance-submit-worker",
      now: input.now,
      leaseMs: 15 * 60_000,
    });
    if (!claim) {
      throw new Error("task_claim_failed");
    }

    const payloadRef = `creator://episodes/${input.episodeId}/video/${task.id}`;
    const payloadHash = sha256(`${payloadRef}:${requestSnapshot.prompt}:${requestSnapshot.firstFrameUrl}`);
    const adapter = createProviderAdapterFromModelConfig(
      modelConfig
        ? {
            providerProtocol: modelConfig.providerProtocol,
            providerModel: modelConfig.providerModel,
            providerConfig: modelConfig.providerConfig,
          }
        : {
            providerProtocol: "volcengine_ark_video",
            providerModel: input.env.SEEDANCE_PROVIDER_MODEL?.trim() || "seedance-1-0-pro",
            providerConfig: {
              baseURL: input.env.SEEDANCE_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com",
              createTaskEndpoint:
                input.env.SEEDANCE_CREATE_TASK_ENDPOINT?.trim() ||
                "/api/v3/contents/generations/tasks",
              queryTaskEndpoint:
                input.env.SEEDANCE_QUERY_TASK_ENDPOINT?.trim() ||
                "/api/v3/contents/generations/tasks/{taskId}",
              apiKeyEnv: input.env.SEEDANCE_API_KEY_ENV?.trim() || "VOLCENGINE_ARK_API_KEY",
            },
          },
      input.env,
      input.fetchImpl,
    );
    await submitProviderRequest(db, {
      organizationId: context.actor.organizationId,
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerName: "volcengine",
      providerOperation: operationNames.episodeVideoGenerate,
      requestKey: `${workflow.workflow.id}:${task.id}`,
      requestHash: sha256(`${task.id}:${requestSnapshot.model}:${requestSnapshot.prompt}`),
      payloadRef,
      payloadHash,
      redactedPayload: {
        prompt: requestSnapshot.prompt,
        motionPrompt: requestSnapshot.prompt,
        firstFrameUrl: requestSnapshot.firstFrameUrl,
        parameters: requestSnapshot.parameters,
        episodeId: input.episodeId,
        targetType: requestSnapshot.targetType,
        targetId: requestSnapshot.targetId,
      },
      createdByUserId: context.userId,
      now: input.now,
      adapter,
    });

    const responseBody = await mapGenerationTaskResponse(db, {
      taskId: task.id,
      sessionToken: input.authenticated.sessionToken,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
    await store.update({
      ...started.record,
      responseResourceType: "generation_task",
      responseResourceId: task.id,
      responseSnapshot: responseBody as Record<string, unknown>,
      status: "succeeded",
      updatedAt: input.now,
    });

    return { status: 200 as const, body: responseBody };
  }

  const claim = await claimQueuedTask(db, {
    taskId: task.id,
    workerId: "episode-mock-generator",
    now: input.now,
    leaseMs: 60_000,
  });
  if (!claim) {
    throw new Error("task_claim_failed");
  }

  const storageObject = await ensureMockGenerationStorageObject(db, {
    kind: input.kind,
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId!,
    projectId: context.project.id,
    episodeId: input.episodeId,
    taskId: task.id,
    userId: context.userId,
    now: input.now,
    runtime: input.runtime,
  });
  const urls = await signedUrlsForStorageObject(db, {
    sessionToken: input.authenticated.sessionToken,
    storageObjectId: storageObject.id,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });

  const resultAssetType = resolveEpisodeGenerationAssetType({
    kind: input.kind,
    targetType: requestSnapshot.targetType,
    assetType: input.body.assetType,
  });
  const targetAsset = await resolveEpisodeGenerationTargetAsset(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    targetType: requestSnapshot.targetType,
    targetId: requestSnapshot.targetId,
    assetType: resultAssetType,
  });
  const targetMetadata = targetAsset?.metadata ?? {};
  const createdAssetVersion = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: resultAssetType,
    assetKey: targetAsset?.assetKey ?? `${input.kind}:${input.episodeId}:${task.id}`,
    createdByUserId: context.userId,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.object_key,
    metadata: {
      ...targetMetadata,
      mimeType: config.contentType,
      width: input.kind === "video" ? 1280 : 1024,
      height: input.kind === "video" ? 720 : 1024,
      label:
        typeof targetMetadata.label === "string" && targetMetadata.label.trim()
          ? targetMetadata.label
          : input.kind === "video" ? "Mock episode video" : "Mock episode image",
      episodeId: input.episodeId,
      taskId: task.id,
      targetType: requestSnapshot.targetType,
      targetId: requestSnapshot.targetId,
      previewUrl: urls.previewUrl,
      sourceUrl: urls.sourceUrl,
      downloadUrl: urls.downloadUrl,
    },
    sourceTaskId: task.id,
    sourceAttemptId: claim.attempt.id,
    now: input.now,
  });

  await finalizeTaskAttempt(db, {
    taskId: task.id,
    attemptId: claim.attempt.id,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, workflow.workflow.id);
  await settleReservationAllocation(db, {
    reservationId: reservation.reservation.id,
    allocationKey: "mock-result",
    amount: estimatedCost,
    outcome: "consumed",
    taskId: task.id,
    attemptId: claim.attempt.id,
    metadata: {
      episodeId: input.episodeId,
      kind: input.kind,
    },
    now: input.now,
  });
  await markGenerationTaskSnapshotSucceeded(db, {
    taskId: task.id,
    attemptId: claim.attempt.id,
    resultAssets: [
      {
        assetId: createdAssetVersion.asset.id,
        assetVersionId: createdAssetVersion.version.id,
        storageObjectId: storageObject.id,
        storageObjectKey: storageObject.object_key,
        mediaKind: input.kind,
        mimeType: config.contentType,
        url: urls.previewUrl,
        previewUrl: urls.previewUrl,
        sourceUrl: urls.sourceUrl,
        downloadUrl: urls.downloadUrl,
      },
    ],
    providerStatus: {
      provider: "mock",
    },
    creditSummary: {
      consumed: estimatedCost,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });

  const responseBody = await mapGenerationTaskResponse(db, {
    taskId: task.id,
    sessionToken: input.authenticated.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  await store.update({
    ...started.record,
    responseResourceType: "generation_task",
    responseResourceId: task.id,
    responseSnapshot: responseBody as Record<string, unknown>,
    status: "succeeded",
    updatedAt: input.now,
  });

  return { status: 200 as const, body: responseBody };
}

function readGenerationReferenceAssetVersionIds(
  body: Record<string, unknown>,
  parameters: Record<string, unknown>,
) {
  return Array.from(new Set([
    ...readStringArray(body.referenceAssetVersionIds),
    ...readStringArray(parameters.referenceAssetVersionIds),
  ])).filter(isUuid);
}

function validateGenerationReferenceLimit(
  assetVersionIds: string[],
  modelConfig: AiModelConfigRecord | undefined,
) {
  const maxReferences = Number(modelConfig?.limits.maxReferences);
  if (
    Number.isFinite(maxReferences) &&
    maxReferences >= 0 &&
    assetVersionIds.length > Math.floor(maxReferences)
  ) {
    throw new GenerationRequestValidationError(
      "model_reference_limit_exceeded",
      "参考素材数量超出模型限制",
    );
  }
}

async function resolveGenerationReferenceImages(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    assetVersionIds: string[];
    modelConfig: AiModelConfigRecord | undefined;
    runtime: UploadSessionRuntime;
  },
) {
  if (!input.assetVersionIds.length) {
    return [];
  }
  const result = await db.query<{
    id: string;
    storage_object_key: string;
    metadata_json: Record<string, unknown> | string;
    storage_bucket: string | null;
    storage_object_key_from_object: string | null;
    storage_content_type: string | null;
    storage_status: string | null;
  }>(
    `
      SELECT
        av.id,
        av.storage_object_key,
        av.metadata_json,
        so.bucket AS storage_bucket,
        so.object_key AS storage_object_key_from_object,
        so.content_type AS storage_content_type,
        so.status AS storage_status
      FROM asset_versions av
      JOIN assets a
        ON a.organization_id = av.organization_id
       AND a.id = av.asset_id
      LEFT JOIN storage_objects so
        ON so.organization_id = av.organization_id
       AND so.id = av.storage_object_id
      WHERE av.organization_id = $1
        AND a.project_id = $2
        AND av.id = ANY($3::uuid[])
    `,
    [input.organizationId, input.projectId, input.assetVersionIds],
  );
  const rowsById = new Map(result.rows.map((row) => [row.id, row]));
  const allowedMimeTypes = new Set(
    readStringArray(input.modelConfig?.limits.allowedMimeTypes).map((mimeType) =>
      mimeType.toLowerCase(),
    ),
  );

  return input.assetVersionIds.flatMap((assetVersionId) => {
    const row = rowsById.get(assetVersionId);
    if (!row) {
      throw new GenerationRequestValidationError(
        "model_reference_not_found",
        "参考素材不存在或无权访问",
      );
    }
    if (row.storage_status && row.storage_status !== "available") {
      throw new GenerationRequestValidationError(
        "model_reference_unavailable",
        "参考素材尚未可用或已失效",
      );
    }
    const metadata = parseMetadataJson(row.metadata_json);
    const mimeType =
      readString(row.storage_content_type) ||
      readString(metadata.mimeType) ||
      "image/png";
    const normalizedMimeType = mimeType.toLowerCase();
    if (
      !normalizedMimeType.startsWith("image/") ||
      (allowedMimeTypes.size > 0 && !allowedMimeTypes.has(normalizedMimeType))
    ) {
      throw new GenerationRequestValidationError(
        "model_reference_mime_not_allowed",
        "参考素材格式不符合当前模型配置",
      );
    }
    const objectKey = readString(row.storage_object_key_from_object) || row.storage_object_key;
    const bucket = readString(row.storage_bucket) || input.runtime.bucket;
    return [{
      assetVersionId,
      url: buildGenerationReferenceObjectUrl(input.runtime, bucket, objectKey),
      mimeType,
      name: readString(metadata.label) || `reference-${assetVersionId}.png`,
    }];
  });
}

function parseMetadataJson(value: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof value !== "string") {
    return value ?? {};
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildGenerationReferenceObjectUrl(
  runtime: UploadSessionRuntime,
  bucket: string,
  objectKey: string,
) {
  const publicBaseUrl = runtime.publicBaseUrl?.trim().replace(/\/+$/g, "") || "";
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${objectKey}`;
  }
  if (bucket && runtime.region) {
    return `https://${bucket}.cos.${runtime.region}.myqcloud.com/${objectKey}`;
  }
  return objectKey;
}

async function resolveEpisodeAssetVersion(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetVersionId?: string | null;
    storageObjectId?: string | null;
    sessionToken: string;
    userId: string;
    capability?: (typeof capabilities)[keyof typeof capabilities];
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.sessionToken,
    userId: input.userId,
    capability: input.capability,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const row = await queryOne<{
    asset_id: string;
    asset_type: string;
    asset_key: string;
    version_id: string;
    storage_object_id: string | null;
    storage_object_key: string;
    metadata_json: Record<string, unknown> | string;
    content_type: string | null;
    object_status: string | null;
  }>(
    db,
    `
      SELECT
        a.id AS asset_id,
        a.asset_type,
        a.asset_key,
        v.id AS version_id,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        s.content_type,
        s.status AS object_status
      FROM asset_versions v
      JOIN assets a
        ON a.organization_id = v.organization_id
       AND a.id = v.asset_id
      LEFT JOIN storage_objects s
        ON s.organization_id = v.organization_id
       AND s.id = v.storage_object_id
      WHERE v.organization_id = $1
        AND a.project_id = $2
        AND ($3::uuid IS NULL OR v.id = $3)
        AND ($4::uuid IS NULL OR v.storage_object_id = $4)
      ORDER BY v.created_at DESC
      LIMIT 1
    `,
    [
      context.actor.organizationId,
      context.project.id,
      input.assetVersionId && isUuid(input.assetVersionId) ? input.assetVersionId : null,
      input.storageObjectId && isUuid(input.storageObjectId) ? input.storageObjectId : null,
    ],
  );
  if (!row) {
    return null;
  }
  const metadata =
    typeof row.metadata_json === "string"
      ? JSON.parse(row.metadata_json) as Record<string, unknown>
      : row.metadata_json;
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  return {
    context,
    assetVersion: {
      assetId: row.asset_id,
      assetType: row.asset_type,
      assetKey: row.asset_key,
      versionId: row.version_id,
      storageObjectId: row.storage_object_id,
      storageObjectKey: row.storage_object_key,
      metadata,
      contentType: row.content_type ?? String(metadata.mimeType ?? ""),
      objectStatus: row.object_status,
    },
  };
}

async function signedAssetVersionFragment(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    version: {
      assetId: string;
      assetType: string;
      assetKey: string;
      versionId: string;
      storageObjectId: string | null;
      storageObjectKey: string;
      metadata: Record<string, unknown>;
      contentType: string;
      objectStatus: string | null;
    };
    sessionToken: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const urls = input.version.storageObjectId
    ? await signedUrlsForStorageObject(db, {
        sessionToken: input.sessionToken,
        storageObjectId: input.version.storageObjectId,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      })
    : null;
  const preferMetadataUrl = input.version.assetType === "shot_video";
  const metadataSourceUrl =
    typeof input.version.metadata.sourceUrl === "string" && input.version.metadata.sourceUrl.trim()
      ? input.version.metadata.sourceUrl.trim()
      : null;
  const metadataDownloadUrl =
    typeof input.version.metadata.downloadUrl === "string" && input.version.metadata.downloadUrl.trim()
      ? input.version.metadata.downloadUrl.trim()
      : null;
  const metadataPreviewUrl =
    typeof input.version.metadata.previewUrl === "string" && input.version.metadata.previewUrl.trim()
      ? input.version.metadata.previewUrl.trim()
      : null;
  return {
    assetId: input.version.assetId,
    assetType: input.version.assetType,
    assetVersionId: input.version.versionId,
    storageObjectId: input.version.storageObjectId,
    fileId: input.version.storageObjectId,
    storageObjectKey: input.version.storageObjectKey,
    contentType: input.version.contentType,
    previewUrl:
      urls?.previewUrl ??
      input.version.metadata.previewUrl ??
      input.version.metadata.imageUrl ??
      input.version.metadata.fixedImageUrl ??
      null,
    sourceUrl:
      (preferMetadataUrl ? metadataSourceUrl : null) ??
      urls?.sourceUrl ??
      metadataSourceUrl ??
      input.version.metadata.imageUrl ??
      metadataPreviewUrl ??
      null,
    downloadUrl:
      (preferMetadataUrl ? metadataDownloadUrl ?? metadataSourceUrl : null) ??
      urls?.downloadUrl ??
      metadataDownloadUrl ??
      metadataSourceUrl ??
      input.version.metadata.imageUrl ??
      metadataPreviewUrl ??
      null,
    thumbnailUrl:
      input.version.metadata.thumbnailUrl ??
      input.version.metadata.coverImageUrl ??
      null,
  };
}

function normalizeEpisodeAssetType(value: string) {
  if (value === "role" || value === "character") {
    return { assetType: "character_sheet" as const, kind: "role" as const };
  }
  if (value === "scene") {
    return { assetType: "scene_reference" as const, kind: "scene" as const };
  }
  return { assetType: "prop_reference" as const, kind: "prop" as const };
}

function defaultEpisodeAssetDescription(kind: "role" | "scene" | "prop") {
  if (kind === "role") {
    return "自己的角色描述，随意更改";
  }
  if (kind === "scene") {
    return "这是刚添加的场景选项";
  }
  return "这是刚添加的道具选项";
}

function matchesEpisodeScopedAsset(
  metadata: Record<string, unknown> | null | undefined,
  episodeId: string,
) {
  return typeof metadata?.episodeId === "string" && metadata.episodeId === episodeId;
}

async function listEpisodeAssetsFromDb(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetType: "role" | "scene" | "prop";
    sessionToken: string;
    userId: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
    capability?: (typeof capabilities)[keyof typeof capabilities] | null;
  },
) {
  const normalized = normalizeEpisodeAssetType(input.assetType);
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.sessionToken,
    userId: input.userId,
    capability: input.capability === null ? undefined : input.capability ?? capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const assetVersionRows = await db.query<{
    asset_id: string;
    version_id: string;
    metadata_json: Record<string, unknown> | string | null;
    version_number: number | string | null;
    created_at: Date | string | null;
  }>(
    `
      SELECT
        v.asset_id,
        v.id AS version_id,
        v.metadata_json,
        v.version_number,
        v.created_at
      FROM asset_versions v
      JOIN assets a
        ON a.organization_id = v.organization_id
       AND a.id = v.asset_id
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.asset_type = $3
      ORDER BY v.asset_id ASC, v.version_number DESC, v.created_at DESC, v.id DESC
    `,
    [context.actor.organizationId, context.project.id, normalized.assetType],
  );
  const episodeScopedAssetMetadataByAssetId = new Map<string, Record<string, unknown>>();
  for (const row of assetVersionRows.rows) {
    const metadata =
      typeof row.metadata_json === "string"
        ? JSON.parse(row.metadata_json) as Record<string, unknown>
        : row.metadata_json ?? {};
    if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
      continue;
    }
    if (!episodeScopedAssetMetadataByAssetId.has(row.asset_id)) {
      episodeScopedAssetMetadataByAssetId.set(row.asset_id, metadata);
    }
  }
  const rows = await db.query<{
    asset_id: string;
    asset_key: string;
    asset_type: string;
    asset_created_at: Date | string;
    asset_updated_at: Date | string;
    version_id: string | null;
    storage_object_id: string | null;
    storage_object_key: string | null;
    metadata_json: Record<string, unknown> | string | null;
    version_created_at: Date | string | null;
  }>(
    `
      SELECT
        a.id AS asset_id,
        a.asset_key,
        a.asset_type,
        a.created_at AS asset_created_at,
        a.updated_at AS asset_updated_at,
        v.id AS version_id,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        v.created_at AS version_created_at
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.asset_type = $3
      ORDER BY a.updated_at DESC, a.id DESC
    `,
    [context.actor.organizationId, context.project.id, normalized.assetType],
  );
  const items = await Promise.all(
    rows.rows
      .map(async (row) => {
        const metadata =
          episodeScopedAssetMetadataByAssetId.get(row.asset_id) ??
          (typeof row.metadata_json === "string"
            ? JSON.parse(row.metadata_json) as Record<string, unknown>
            : row.metadata_json ?? {});
        if (!metadata || !matchesEpisodeScopedAsset(metadata, input.episodeId)) {
          return null;
        }
        const fixedImageFileId = typeof metadata.fixedImageFileId === "string" ? metadata.fixedImageFileId : null;
        const fixedImageStorageObjectId =
          typeof metadata.fixedImageStorageObjectId === "string" ? metadata.fixedImageStorageObjectId : null;
        const fixedImageVersion =
          fixedImageFileId || fixedImageStorageObjectId
            ? await resolveEpisodeAssetVersion(db, {
                episodeId: input.episodeId,
                assetVersionId: fixedImageFileId,
                storageObjectId: fixedImageStorageObjectId,
                sessionToken: input.sessionToken,
                userId: input.userId,
                capability: input.capability === null ? undefined : input.capability ?? capabilities.generationStart,
                now: input.now,
              })
            : null;
        const fixedImageStorageObjectIdForUrls =
          fixedImageVersion?.assetVersion.storageObjectId ?? fixedImageStorageObjectId ?? row.storage_object_id;
        const urls = fixedImageStorageObjectIdForUrls
          ? await signedUrlsForStorageObject(db, {
              sessionToken: input.sessionToken,
              storageObjectId: fixedImageStorageObjectIdForUrls,
              runtime: input.runtime,
              signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
              now: input.now,
            })
          : null;
        const persistedFixedPreviewUrl =
          resolvePreferredEpisodeImageUrl(
            metadata.fixedImageUrl,
            metadata.previewUrl,
            fixedImageVersion?.assetVersion.previewUrl,
            fixedImageVersion?.assetVersion.metadata?.previewUrl,
          ) ?? "";
        return {
          assetId: row.asset_id,
          assetType: normalized.kind,
          name: String(metadata.label ?? row.asset_key ?? "未命名资产"),
          description: String(metadata.description ?? ""),
          fixedImageFileId: fixedImageVersion?.assetVersion.versionId ?? fixedImageFileId ?? row.version_id,
          fixedImageStorageObjectId:
            fixedImageVersion?.assetVersion.storageObjectId ?? fixedImageStorageObjectId ?? row.storage_object_id,
          fixedImageUrl: persistedFixedPreviewUrl || urls?.previewUrl || String(metadata.fixedImageUrl ?? metadata.previewUrl ?? ""),
          voiceId: typeof metadata.voiceId === "string" ? metadata.voiceId : null,
          voiceName: typeof metadata.voiceName === "string" ? metadata.voiceName : null,
          dubbingConfig:
            metadata.dubbingConfig && typeof metadata.dubbingConfig === "object"
              ? metadata.dubbingConfig
              : null,
          sortOrder: Number(metadata.sortOrder ?? 0),
          updatedAt: new Date(row.asset_updated_at).toISOString(),
          createdAt: new Date(row.asset_created_at).toISOString(),
        };
      }),
  );
  return items.filter(Boolean);
}

async function createEpisodeAssetRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const typeValue = String(input.body.assetType ?? input.body.type ?? "role").trim();
  const name = String(input.body.name ?? "").trim();
  if (!name) {
    return { error: "asset_name_required" as const };
  }
  const normalized = normalizeEpisodeAssetType(typeValue);
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const assetKey = `episode-${normalized.kind}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-") || "asset"}-${randomUUID().slice(0, 8)}`;
  const description = String(input.body.description ?? defaultEpisodeAssetDescription(normalized.kind)).trim();
  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: normalized.assetType,
    assetKey,
    createdByUserId: input.authenticated.user.id,
    storageObjectId: null,
    storageObjectKey: `episodes/${input.episodeId}/assets/${normalized.kind}/${assetKey}`,
    metadata: {
      mimeType: "application/json",
      width: 1,
      height: 1,
      episodeId: input.episodeId,
      label: name,
      description,
      source: "manual",
      voiceId: null,
      voiceName: null,
    },
    sourceTaskId: null,
    sourceAttemptId: null,
    now: input.now,
  });
  return {
    asset: {
      assetId: snapshot.asset.id,
      assetType: normalized.kind,
      name,
      description,
      fixedImageFileId: null,
      fixedImageStorageObjectId: null,
      fixedImageUrl: null,
      voiceId: null,
      voiceName: null,
      dubbingConfig: null,
      sortOrder: 0,
      updatedAt: snapshot.asset.updatedAt.toISOString(),
      createdAt: snapshot.asset.createdAt.toISOString(),
    },
  };
}

async function importEpisodeAssetRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const typeValue = String(input.body.assetType ?? input.body.type ?? "role").trim();
  const name = String(input.body.name ?? "").trim();
  if (!name) {
    return { error: "asset_name_required" as const };
  }
  const normalized = normalizeEpisodeAssetType(typeValue);
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const sourceUrl = String(input.body.sourceUrl ?? input.body.previewUrl ?? "").trim() || null;
  const storageObjectId = String(input.body.storageObjectId ?? "").trim();
  const storageObjectKey = String(input.body.storageObjectKey ?? "").trim();
  const uploadSessionId = String(input.body.uploadSessionId ?? "").trim() || null;
  const mimeType = String(input.body.mimeType ?? "image/png").trim() || "image/png";
  const width = Number(input.body.width ?? 0);
  const height = Number(input.body.height ?? 0);
  if (!storageObjectId && !sourceUrl) {
    return { error: "asset_preview_required" as const };
  }
  if (storageObjectId && !isUuid(storageObjectId)) {
    return { error: "storage_object_not_found" as const };
  }
  const description = String(input.body.description ?? defaultEpisodeAssetDescription(normalized.kind)).trim();
  const assetKey = `episode-${normalized.kind}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-") || "asset"}-${randomUUID().slice(0, 8)}`;
  let resolvedStorageObjectKey = storageObjectKey;
  let resolvedSourceUrl = sourceUrl;
  if (storageObjectId) {
    const objectRow = await queryOne<{
      id: string;
      object_key: string;
      status: string;
      content_type: string;
    }>(
      db,
      `
        SELECT id, object_key, status, content_type
        FROM storage_objects
        WHERE organization_id = $1
          AND id = $2
      `,
      [context.actor.organizationId, storageObjectId],
    );
    if (!objectRow) {
      return { error: "storage_object_not_found" as const };
    }
    if (objectRow.status !== "available") {
      return { error: "storage_object_not_available" as const };
    }
    resolvedStorageObjectKey = objectRow.object_key;
    const urls = await signedUrlsForStorageObject(db, {
      sessionToken: input.authenticated.sessionToken,
      storageObjectId,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
    resolvedSourceUrl = urls.previewUrl ?? urls.sourceUrl ?? resolvedSourceUrl;
  }
  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: normalized.assetType,
    assetKey,
    createdByUserId: input.authenticated.user.id,
    storageObjectId: storageObjectId || null,
    storageObjectKey:
      resolvedStorageObjectKey || `episodes/${input.episodeId}/assets/${normalized.kind}/${assetKey}`,
    metadata: {
      mimeType,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
      episodeId: input.episodeId,
      label: name,
      description,
      source: String(input.body.source ?? "import"),
      sourceUrl: resolvedSourceUrl,
      previewUrl: resolvedSourceUrl,
      uploadSessionId,
      voiceId: null,
      voiceName: null,
    },
    sourceTaskId: null,
    sourceAttemptId: null,
    now: input.now,
  });
  const assets = await listEpisodeAssetsFromDb(db, {
    episodeId: input.episodeId,
    assetType: normalized.kind,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  return {
    asset: assets?.find((item) => item.assetId === snapshot.asset.id) ?? null,
  };
}

async function updateEpisodeAssetRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const latestVersion = await queryOne<{
    version_id: string;
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT v.id AS version_id, v.metadata_json
      FROM assets a
      JOIN asset_versions v
        ON v.organization_id = a.organization_id
       AND v.asset_id = a.id
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
      ORDER BY v.version_number DESC
      LIMIT 1
    `,
    [context.actor.organizationId, context.project.id, input.assetId],
  );
  if (!latestVersion) {
    return null;
  }
  const metadata =
    typeof latestVersion.metadata_json === "string"
      ? JSON.parse(latestVersion.metadata_json) as Record<string, unknown>
      : { ...(latestVersion.metadata_json ?? {}) };
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  if (input.body.name != null) {
    metadata.label = String(input.body.name).trim();
  }
  if (input.body.description != null) {
    metadata.description = String(input.body.description).trim();
  }
  if (Object.prototype.hasOwnProperty.call(input.body, "voiceId")) {
    metadata.voiceId = input.body.voiceId == null ? null : String(input.body.voiceId);
  }
  if (Object.prototype.hasOwnProperty.call(input.body, "voiceName")) {
    metadata.voiceName = input.body.voiceName == null ? null : String(input.body.voiceName);
  }
  if (Object.prototype.hasOwnProperty.call(input.body, "dubbingConfig")) {
    metadata.dubbingConfig =
      input.body.dubbingConfig && typeof input.body.dubbingConfig === "object"
        ? input.body.dubbingConfig
        : null;
  }
  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $3::jsonb
      WHERE organization_id = $1
        AND id = $2
    `,
    [context.actor.organizationId, latestVersion.version_id, JSON.stringify(metadata)],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [context.actor.organizationId, input.assetId, input.now],
  );
  const assetType = await queryOne<{ asset_type: string }>(
    db,
    `
      SELECT asset_type
      FROM assets
      WHERE organization_id = $1
        AND id = $2
        AND project_id = $3
    `,
    [context.actor.organizationId, input.assetId, context.project.id],
  );
  const kind = normalizeEpisodeAssetType(
    assetType?.asset_type === "character_sheet"
      ? "role"
      : assetType?.asset_type === "scene_reference"
        ? "scene"
        : "prop",
  ).kind;
  const updatedItems = await listEpisodeAssetsFromDb(db, {
    episodeId: input.episodeId,
    assetType: kind,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  const updated = updatedItems?.find((item) => item.assetId === input.assetId) ?? null;
  return { asset: updated ?? null };
}

async function deleteEpisodeAssetRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const latestVersion = await queryOne<{
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT v.metadata_json
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT metadata_json
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
    `,
    [context.actor.organizationId, context.project.id, input.assetId],
  );
  if (!latestVersion) {
    return null;
  }
  const metadata =
    typeof latestVersion.metadata_json === "string"
      ? JSON.parse(latestVersion.metadata_json) as Record<string, unknown>
      : latestVersion.metadata_json ?? {};
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  await db.query(
    `
      DELETE FROM asset_versions
      WHERE organization_id = $1
        AND asset_id = $2
    `,
    [context.actor.organizationId, input.assetId],
  );
  await db.query(
    `
      DELETE FROM assets
      WHERE organization_id = $1
        AND id = $2
        AND project_id = $3
    `,
    [context.actor.organizationId, input.assetId, context.project.id],
  );
  return { deleted: true };
}

async function saveEpisodeAssetToProjectLibrary(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const asset = await queryOne<{
    asset_id: string;
    asset_type: string;
    asset_key: string;
    latest_version_id: string | null;
    latest_storage_object_id: string | null;
    latest_storage_object_key: string | null;
    latest_metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT
        a.id AS asset_id,
        a.asset_key,
        a.asset_type,
        v.id AS latest_version_id,
        v.storage_object_id AS latest_storage_object_id,
        v.storage_object_key AS latest_storage_object_key,
        v.metadata_json AS latest_metadata_json
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT id, storage_object_id, storage_object_key, metadata_json
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
    `,
    [context.actor.organizationId, context.project.id, input.assetId],
  );
  if (!asset) {
    return null;
  }
  const metadata =
    typeof asset.latest_metadata_json === "string"
      ? JSON.parse(asset.latest_metadata_json) as Record<string, unknown>
      : { ...(asset.latest_metadata_json ?? {}) };
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  const fixedVersionId = typeof metadata.fixedImageFileId === "string" ? metadata.fixedImageFileId : null;
  const fixedStorageObjectId =
    typeof metadata.fixedImageStorageObjectId === "string" ? metadata.fixedImageStorageObjectId : null;
  const resolvedLibraryMedia = fixedVersionId || fixedStorageObjectId
    ? await resolveEpisodeAssetVersion(db, {
        episodeId: input.episodeId,
        assetVersionId: fixedVersionId,
        storageObjectId: fixedStorageObjectId,
        sessionToken: input.authenticated.sessionToken,
        userId: input.authenticated.user.id,
        capability: capabilities.generationStart,
        now: input.now,
      })
    : null;
  const sourceVersion = resolvedLibraryMedia?.assetVersion ?? null;
  const name = String(metadata.label ?? asset.asset_key ?? "").trim();
  if (!name) {
    return { error: "asset_name_required" as const };
  }
  const libraryStorageObjectId = sourceVersion?.storageObjectId ?? asset.latest_storage_object_id;
  const libraryStorageObjectKey = sourceVersion?.storageObjectKey ?? asset.latest_storage_object_key;
  const libraryPreviewUrl =
    String(sourceVersion?.metadata?.previewUrl ?? metadata.previewUrl ?? "").trim() || null;
  const librarySourceUrl =
    String(sourceVersion?.metadata?.sourceUrl ?? metadata.sourceUrl ?? "").trim() || null;
  const libraryContentType =
    String(sourceVersion?.contentType ?? metadata.mimeType ?? "image/png").trim() || "image/png";
  if (!libraryStorageObjectId && !libraryPreviewUrl) {
    return { error: "asset_preview_required" as const };
  }
  const libraryAssets = await listEpisodeAssetsFromDb(db, {
    episodeId: input.episodeId,
    assetType:
      asset.asset_type === "character_sheet"
        ? "role"
        : asset.asset_type === "scene_reference"
          ? "scene"
          : "prop",
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  void libraryAssets;
  const duplicate = await queryOne<{ id: string }>(
    db,
    `
      SELECT a.id
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT metadata_json
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.asset_type = $3
        AND COALESCE((v.metadata_json->>'episodeId'), '') = ''
        AND COALESCE((v.metadata_json->>'label'), a.asset_key) = $4
      LIMIT 1
    `,
    [context.actor.organizationId, context.project.id, asset.asset_type, name],
  );
  if (duplicate) {
    return { error: "asset_library_duplicate" as const };
  }
  const libraryKey = `library-${asset.asset_type}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-") || "asset"}-${randomUUID().slice(0, 8)}`;
  const libraryMetadata = {
    ...metadata,
    label: name,
    description: String(metadata.description ?? "").trim() || null,
    mimeType: libraryContentType,
    previewUrl: libraryPreviewUrl,
    sourceUrl: librarySourceUrl,
  };
  delete libraryMetadata.episodeId;
  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: asset.asset_type as AssetType,
    assetKey: libraryKey,
    createdByUserId: input.authenticated.user.id,
    storageObjectId: libraryStorageObjectId,
    storageObjectKey:
      libraryStorageObjectKey ??
      `library/${context.project.id}/${asset.asset_type}/${libraryKey}`,
    metadata: libraryMetadata,
    sourceTaskId: null,
    sourceAttemptId: null,
    now: input.now,
  });
  const savedUrls = libraryStorageObjectId
    ? await signedUrlsForStorageObject(db, {
        sessionToken: input.authenticated.sessionToken,
        storageObjectId: libraryStorageObjectId,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      })
    : null;
  return {
    asset: {
      id: snapshot.asset.id,
      label: String(libraryMetadata.label ?? name),
      assetType: snapshot.asset.assetType,
      latestVersion: {
        id: snapshot.version.id,
        storageObjectId: snapshot.version.storageObjectId,
        previewUrl: savedUrls?.previewUrl ?? libraryPreviewUrl ?? "",
        metadata: libraryMetadata,
      },
      previewUrl: savedUrls?.previewUrl ?? libraryPreviewUrl ?? "",
    },
  };
}

async function bindEpisodeFileResource(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const uploadSessionId = String(input.body.uploadSessionId ?? "");
  const storageObjectId = String(input.body.storageObjectId ?? "");
  const targetType = String(input.body.targetType ?? "asset");
  const targetId = String(input.body.targetId ?? input.episodeId);
  if (!isUuid(uploadSessionId) || !isUuid(storageObjectId)) {
    return { error: "invalid_upload_reference" as const };
  }
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const row = await queryOne<{
    session_id: string;
    session_status: string;
    purpose: string;
    content_type: string;
    original_file_name: string;
    expected_size_bytes: number | string | null;
    storage_object_id: string;
    object_key: string;
    object_status: string;
    object_project_id: string | null;
    object_workspace_id: string | null;
    size_bytes: number | string | null;
    checksum: string | null;
  }>(
    db,
    `
      SELECT
        s.id AS session_id,
        s.status AS session_status,
        s.purpose,
        s.content_type,
        s.original_file_name,
        s.expected_size_bytes,
        o.id AS storage_object_id,
        o.object_key,
        o.status AS object_status,
        o.project_id AS object_project_id,
        o.workspace_id AS object_workspace_id,
        o.size_bytes,
        o.checksum
      FROM storage_upload_sessions s
      JOIN storage_objects o
        ON o.organization_id = s.organization_id
       AND o.id = s.storage_object_id
      WHERE s.organization_id = $1
        AND s.id = $2
        AND s.storage_object_id = $3
        AND (s.project_id IS NULL OR s.project_id = $4)
        AND (s.created_by_user_id IS NULL OR s.created_by_user_id = $5)
      LIMIT 1
    `,
    [
      context.actor.organizationId,
      uploadSessionId,
      storageObjectId,
      context.project.id,
      context.userId,
    ],
  );
  if (!row) {
    return null;
  }
  if (row.session_status !== "uploaded" || row.object_status !== "available") {
    return { error: "storage_upload_not_ready" as const };
  }
  if (row.object_project_id && row.object_project_id !== context.project.id) {
    return null;
  }

  const assetType = classifyEpisodeAssetType({
    purpose: row.purpose,
    targetType,
    mediaKind: String(input.body.mediaKind ?? ""),
    contentType: row.content_type,
  });
  if (!assetType) {
    return { error: "invalid_media_type" as const };
  }
  if (assetType === "shot_video" && !row.content_type.startsWith("video/")) {
    return { error: "invalid_media_type" as const };
  }
  if (assetType !== "shot_video" && !row.content_type.startsWith("image/")) {
    return { error: "invalid_media_type" as const };
  }
  if (targetType === "storyboard") {
    const shot = await queryOne<{ id: string }>(
      db,
      "SELECT id FROM shots WHERE id = $1 AND episode_id = $2 AND project_id = $3",
      [targetId, input.episodeId, context.project.id],
    );
    if (!shot) {
      return null;
    }
  }

  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType,
    assetKey: `upload:${input.episodeId}:${targetType}:${targetId}:${storageObjectId}`,
    createdByUserId: context.userId,
    storageObjectId,
    storageObjectKey: row.object_key,
    metadata: {
      mimeType: row.content_type,
      width: Number(input.body.width ?? 0),
      height: Number(input.body.height ?? 0),
      durationMs: input.body.durationMs ?? null,
      episodeId: input.episodeId,
      targetType,
      targetId,
      purpose: row.purpose,
      uploadSessionId,
      originalFileName: row.original_file_name,
      sizeBytes: Number(row.size_bytes ?? row.expected_size_bytes ?? 0),
      checksum: row.checksum,
    },
    sourceTaskId: null,
    sourceAttemptId: null,
    now: input.now,
  });
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId: snapshot.version.id,
    storageObjectId,
    sessionToken: input.authenticated.sessionToken,
    userId: context.userId,
    now: input.now,
  });
  if (!resolved) {
    return null;
  }
  const file = await signedAssetVersionFragment(db, {
    version: resolved.assetVersion,
    sessionToken: input.authenticated.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  return {
    fileResource: {
      fileId: storageObjectId,
      storageObjectId,
      assetId: snapshot.asset.id,
      assetVersionId: snapshot.version.id,
      ownerType: targetType,
      ownerId: targetId,
      fileKind: assetType === "shot_video" ? "video" : "image",
      purpose: row.purpose,
      status: "available",
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes ?? row.expected_size_bytes ?? 0),
      originalFileName: row.original_file_name,
    },
    file,
  };
}

async function setEpisodeAssetFixedImage(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId: String(input.body.assetVersionId ?? input.body.fileId ?? ""),
    storageObjectId: String(input.body.storageObjectId ?? ""),
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  const sourceUrl = String(input.body.sourceUrl ?? input.body.previewUrl ?? "").trim();
  const resolvedIsImage =
    resolved &&
    ["character_sheet", "scene_reference", "prop_reference", "shot_image"].includes(resolved.assetVersion.assetType) &&
    resolved.assetVersion.contentType.startsWith("image/");
  const fallbackResolved = !resolvedIsImage && sourceUrl
    ? await createEpisodeAssetFixedImageVersionFromUrl(db, {
        context,
        episodeId: input.episodeId,
        assetId: input.assetId,
        sourceUrl,
        authenticated: input.authenticated,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      })
    : null;
  const fixedResolved = resolvedIsImage ? resolved : fallbackResolved;
  if (!fixedResolved) {
    return { error: "invalid_media_type" as const };
  }
  if (fixedResolved.assetVersion.objectStatus && fixedResolved.assetVersion.objectStatus !== "available") {
    return { error: "storage_object_not_available" as const };
  }
  const file = await signedAssetVersionFragment(db, {
    version: fixedResolved.assetVersion,
    sessionToken: input.authenticated.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  const persistedPreviewUrl = resolvePreferredEpisodeImageUrl(
    input.body.previewUrl,
    input.body.sourceUrl,
    fixedResolved.assetVersion.previewUrl,
    fixedResolved.assetVersion.metadata?.previewUrl,
    file.previewUrl,
  );
  const persistedSourceUrl = resolvePreferredEpisodeImageUrl(
    input.body.sourceUrl,
    input.body.previewUrl,
    fixedResolved.assetVersion.sourceUrl,
    fixedResolved.assetVersion.metadata?.sourceUrl,
    file.sourceUrl,
  );
  const persistedDownloadUrl = resolvePreferredEpisodeImageUrl(
    fixedResolved.assetVersion.downloadUrl,
    fixedResolved.assetVersion.metadata?.downloadUrl,
    persistedSourceUrl,
    file.downloadUrl,
  );
  const latestVersion = await queryOne<{
    version_id: string;
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT v.id AS version_id, v.metadata_json
      FROM assets a
      JOIN asset_versions v
        ON v.organization_id = a.organization_id
       AND v.asset_id = a.id
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
      ORDER BY v.version_number DESC
      LIMIT 1
    `,
    [context.actor.organizationId, context.project.id, input.assetId],
  );
  if (!latestVersion) {
    return null;
  }
  const metadata =
    typeof latestVersion.metadata_json === "string"
      ? JSON.parse(latestVersion.metadata_json) as Record<string, unknown>
      : { ...(latestVersion.metadata_json ?? {}) };
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  metadata.fixedImageFileId = fixedResolved.assetVersion.versionId;
  metadata.fixedImageStorageObjectId = fixedResolved.assetVersion.storageObjectId;
  metadata.fixedImageUrl = persistedPreviewUrl;
  metadata.previewUrl = persistedPreviewUrl;
  metadata.sourceUrl = persistedSourceUrl;
  metadata.downloadUrl = persistedDownloadUrl;
  metadata.mimeType = fixedResolved.assetVersion.contentType;
  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $3::jsonb
      WHERE organization_id = $1
        AND id = $2
    `,
    [context.actor.organizationId, latestVersion.version_id, JSON.stringify(metadata)],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [context.actor.organizationId, input.assetId, input.now],
  );
  return {
    asset: {
      assetId: input.assetId,
      episodeId: input.episodeId,
      fixedImageFileId: fixedResolved.assetVersion.versionId,
      fixedImageStorageObjectId: fixedResolved.assetVersion.storageObjectId,
      fixedImageUrl: persistedPreviewUrl,
      status: "ready",
      isPinned: true,
      updatedAt: input.now.toISOString(),
    },
    file,
  };
}

async function createEpisodeAssetFixedImageVersionFromUrl(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    context: Awaited<ReturnType<typeof getEpisodeContext>>;
    episodeId: string;
    assetId: string;
    sourceUrl: string;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  if (!input.context) {
    return null;
  }
  const assetRow = await queryOne<{
    asset_id: string;
    asset_key: string;
    asset_type: string;
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT a.id AS asset_id, a.asset_key, a.asset_type, v.metadata_json
      FROM assets a
      JOIN asset_versions v
        ON v.organization_id = a.organization_id
       AND v.asset_id = a.id
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.id = $3
      ORDER BY v.version_number DESC
      LIMIT 1
    `,
    [input.context.actor.organizationId, input.context.project.id, input.assetId],
  );
  if (!assetRow) {
    return null;
  }
  const metadata =
    typeof assetRow.metadata_json === "string"
      ? JSON.parse(assetRow.metadata_json) as Record<string, unknown>
      : assetRow.metadata_json ?? {};
  if (!matchesEpisodeScopedAsset(metadata, input.episodeId)) {
    return null;
  }
  const contentType = inferImageContentTypeFromUrl(input.sourceUrl);
  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: input.context.actor.organizationId,
    projectId: input.context.project.id,
    assetType: assetRow.asset_type as AssetType,
    assetKey: assetRow.asset_key,
    createdByUserId: input.authenticated.user.id,
    storageObjectId: null,
    storageObjectKey: `episodes/${input.episodeId}/assets/fixed-image/${randomUUID()}`,
    metadata: {
      ...metadata,
      mimeType: contentType,
      episodeId: input.episodeId,
      source: "legacy-generated-url",
      sourceUrl: input.sourceUrl,
      previewUrl: input.sourceUrl,
      downloadUrl: input.sourceUrl,
    },
    sourceTaskId: null,
    sourceAttemptId: null,
    now: input.now,
  });
  return {
    context: input.context,
    assetVersion: {
      assetId: snapshot.asset.id,
      assetType: snapshot.asset.assetType,
      assetKey: snapshot.asset.assetKey,
      versionId: snapshot.version.id,
      storageObjectId: snapshot.version.storageObjectId,
      storageObjectKey: snapshot.version.storageObjectKey,
      metadata: snapshot.version.metadata,
      contentType,
      objectStatus: null,
    },
  };
}

async function createEpisodeStoryboardImageVersionFromGeneratedResult(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    storyboardId: string;
    sourceUrl: string;
    storageObjectId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const shot = await queryOne<{ id: string; episode_id: string | null; project_id: string }>(
    db,
    `
      SELECT id, episode_id, project_id
      FROM shots
      WHERE id = $1
        AND episode_id = $2
        AND project_id = $3
      LIMIT 1
    `,
    [input.storyboardId, input.episodeId, context.project.id],
  );
  if (!shot) {
    return null;
  }
  let storageObjectKey = String(input.body.storageObjectKey ?? "").trim();
  let contentType = String(input.body.mimeType ?? "").trim() || inferImageContentTypeFromUrl(input.sourceUrl);
  let resolvedSourceUrl = input.sourceUrl;
  if (input.storageObjectId) {
    if (!isUuid(input.storageObjectId)) {
      return null;
    }
    const objectRow = await queryOne<{
      id: string;
      object_key: string;
      status: string;
      content_type: string | null;
    }>(
      db,
      `
        SELECT id, object_key, status, content_type
        FROM storage_objects
        WHERE organization_id = $1
          AND project_id = $2
          AND id = $3
        LIMIT 1
      `,
      [context.actor.organizationId, context.project.id, input.storageObjectId],
    );
    if (!objectRow) {
      return null;
    }
    if (objectRow.status !== "available") {
      return null;
    }
    storageObjectKey = objectRow.object_key;
    contentType = objectRow.content_type || contentType;
    const urls = await signedUrlsForStorageObject(db, {
      sessionToken: input.authenticated.sessionToken,
      storageObjectId: input.storageObjectId,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
    resolvedSourceUrl = urls.previewUrl ?? urls.sourceUrl ?? resolvedSourceUrl;
  }
  if (!resolvedSourceUrl && !input.storageObjectId) {
    return null;
  }
  const snapshot = await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: "shot_image",
    assetKey: `storyboard-image:${input.episodeId}:${input.storyboardId}`,
    createdByUserId: input.authenticated.user.id,
    storageObjectId: input.storageObjectId || null,
    storageObjectKey: storageObjectKey || `episodes/${input.episodeId}/storyboards/${input.storyboardId}/${randomUUID()}`,
    metadata: {
      mimeType: contentType,
      episodeId: input.episodeId,
      targetType: "storyboard",
      targetId: input.storyboardId,
      storyboardId: input.storyboardId,
      source: "generated-result-manual-set",
      sourceUrl: resolvedSourceUrl,
      previewUrl: resolvedSourceUrl,
      downloadUrl: resolvedSourceUrl,
    },
    sourceTaskId: typeof input.body.taskId === "string" && isUuid(input.body.taskId) ? input.body.taskId : null,
    sourceAttemptId: null,
    now: input.now,
  });
  return {
    context,
    assetVersion: {
      assetId: snapshot.asset.id,
      assetType: snapshot.asset.assetType,
      assetKey: snapshot.asset.assetKey,
      versionId: snapshot.version.id,
      storageObjectId: snapshot.version.storageObjectId,
      storageObjectKey: snapshot.version.storageObjectKey,
      metadata: snapshot.version.metadata,
      contentType,
      objectStatus: input.storageObjectId ? "available" : null,
    },
  };
}

function inferImageContentTypeFromUrl(value: string) {
  const path = value.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".avif")) {
    return "image/avif";
  }
  if (path.endsWith(".webp")) {
    return "image/webp";
  }
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "image/png";
}

async function deleteEpisodeFileResource(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    fileId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    now: Date;
  },
) {
  const storageObjectId = String(input.body.storageObjectId ?? input.fileId ?? "");
  const assetVersionId = String(input.body.assetVersionId ?? input.fileId ?? "");
  if (!isUuid(storageObjectId) && !isUuid(assetVersionId)) {
    return { error: "invalid_file_reference" as const };
  }
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId,
    storageObjectId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!resolved?.assetVersion.storageObjectId) {
    return null;
  }
  const versionId = resolved.assetVersion.versionId;
  const objectId = resolved.assetVersion.storageObjectId;
  const usage = await queryOne<{
    current_image_count: number | string;
    current_video_count: number | string;
    export_count: number | string;
  }>(
    db,
    `
      SELECT
        (
          SELECT count(*)::int
          FROM shots
          WHERE organization_id = $1
            AND episode_id = $2
            AND current_image_asset_version_id = $3
        ) AS current_image_count,
        (
          SELECT count(*)::int
          FROM shots
          WHERE organization_id = $1
            AND episode_id = $2
            AND current_video_asset_version_id = $3
        ) AS current_video_count,
        (
          SELECT count(*)::int
          FROM export_records
          WHERE organization_id = $1
            AND project_id = $4
            AND storage_object_id = $5
        ) AS export_count
    `,
    [
      resolved.context.actor.organizationId,
      input.episodeId,
      versionId,
      resolved.context.project.id,
      objectId,
    ],
  );
  const currentImageCount = Number(usage?.current_image_count ?? 0);
  const currentVideoCount = Number(usage?.current_video_count ?? 0);
  const exportCount = Number(usage?.export_count ?? 0);
  if (currentImageCount || currentVideoCount || exportCount) {
    return {
      error: "file_in_use" as const,
      details: {
        currentImageCount,
        currentVideoCount,
        exportCount,
      },
    };
  }

  const deleted = await deleteStorageObjectRecord(db, {
    storageObjectId: objectId,
    adapter: input.runtime.adapter,
    localObjectStore: input.runtime.localObjectStore,
    now: input.now,
  });
  if (!deleted || deleted.status !== "deleted") {
    return { error: "delete_failed" as const };
  }
  return {
    deleted: true,
    fileId: objectId,
    storageObjectId: objectId,
    assetVersionId: versionId,
    status: deleted.status,
  };
}

async function setEpisodeStoryboardMedia(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    storyboardId: string;
    mediaKind: "image" | "video";
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const sourceUrl =
    readMediaReferenceUrl(input.body.sourceUrl) ||
    readMediaReferenceUrl(input.body.previewUrl) ||
    readMediaReferenceUrl(input.body.downloadUrl) ||
    readMediaReferenceUrl(input.body.url);
  const storageObjectId = String(input.body.storageObjectId ?? "").trim();
  let resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId: String(input.body.assetVersionId ?? input.body.fileId ?? ""),
    storageObjectId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!resolved && input.mediaKind === "image" && (sourceUrl || storageObjectId)) {
    resolved = await createEpisodeStoryboardImageVersionFromGeneratedResult(db, {
      episodeId: input.episodeId,
      storyboardId: input.storyboardId,
      sourceUrl,
      storageObjectId,
      body: input.body,
      authenticated: input.authenticated,
      runtime: input.runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      now: input.now,
    });
  }
  if (!resolved) {
    return null;
  }
  const expectedAssetType = input.mediaKind === "video" ? "shot_video" : "shot_image";
  if (resolved.assetVersion.assetType !== expectedAssetType) {
    return { error: "invalid_media_type" as const };
  }
  if (resolved.assetVersion.objectStatus && resolved.assetVersion.objectStatus !== "available") {
    return { error: "storage_object_not_available" as const };
  }
  let assetVersion = resolved.assetVersion;
  if (input.mediaKind === "video") {
    const submittedVideoUrl =
      readMediaReferenceUrl(input.body.sourceUrl) ||
      readMediaReferenceUrl(input.body.videoUrl) ||
      readMediaReferenceUrl(input.body.url);
    const submittedThumbnailUrl =
      readMediaReferenceUrl(input.body.thumbnailUrl) ||
      readMediaReferenceUrl(input.body.coverImageUrl);
    const metadataPatch: Record<string, unknown> = {};
    if (submittedVideoUrl) {
      metadataPatch.sourceUrl = submittedVideoUrl;
      metadataPatch.downloadUrl = submittedVideoUrl;
      metadataPatch.videoUrl = submittedVideoUrl;
    }
    if (submittedThumbnailUrl) {
      metadataPatch.thumbnailUrl = submittedThumbnailUrl;
      metadataPatch.coverImageUrl = submittedThumbnailUrl;
    }
    if (Object.keys(metadataPatch).length > 0) {
      await db.query(
        `
          UPDATE asset_versions
          SET metadata_json = metadata_json || $3::jsonb
          WHERE organization_id = $1
            AND id = $2
        `,
        [
          resolved.context.actor.organizationId,
          assetVersion.versionId,
          JSON.stringify(metadataPatch),
        ],
      );
      assetVersion = {
        ...assetVersion,
        metadata: {
          ...assetVersion.metadata,
          ...metadataPatch,
        },
      };
    }
  }
  const shot = await queryOne<{
    id: string;
    episode_id: string | null;
    project_id: string;
    title: string;
    description: string;
    sort_order: number | string;
    image_status: string;
    video_status: string;
    current_image_asset_version_id: string | null;
    current_video_asset_version_id: string | null;
  }>(
    db,
    input.mediaKind === "image"
      ? `
        UPDATE shots
        SET current_image_asset_version_id = $4,
            image_status = 'completed',
            video_status = CASE WHEN video_status = 'not_ready' THEN 'ready' ELSE video_status END,
            updated_at = $5
        WHERE id = $1
          AND episode_id = $2
          AND project_id = $3
        RETURNING id, episode_id, project_id, title, description, sort_order,
                  image_status, video_status, current_image_asset_version_id, current_video_asset_version_id
      `
      : `
        UPDATE shots
        SET current_video_asset_version_id = $4,
            video_status = 'completed',
            updated_at = $5
        WHERE id = $1
          AND episode_id = $2
          AND project_id = $3
        RETURNING id, episode_id, project_id, title, description, sort_order,
                  image_status, video_status, current_image_asset_version_id, current_video_asset_version_id
      `,
    [
      input.storyboardId,
      input.episodeId,
      resolved.context.project.id,
      assetVersion.versionId,
      input.now,
    ],
  );
  if (!shot) {
    return null;
  }
  const file = await signedAssetVersionFragment(db, {
    version: assetVersion,
    sessionToken: input.authenticated.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  return {
    storyboard: {
      storyboardId: shot.id,
      episodeId: shot.episode_id,
      indexNo: Number(shot.sort_order) + 1,
      sceneAnalysis: shot.description ?? "",
      plotPreview: shot.title ?? "",
      currentImageFileId: shot.current_image_asset_version_id,
      currentImageUrl: input.mediaKind === "image" ? file.previewUrl : null,
      currentVideoFileId: shot.current_video_asset_version_id,
      currentVideoUrl:
        input.mediaKind === "video"
          ? file.sourceUrl ?? file.downloadUrl ?? file.previewUrl ?? null
          : null,
      currentVideoThumbnailUrl: input.mediaKind === "video" ? file.thumbnailUrl ?? null : null,
      imageStatus: normalizeTaskStatus(shot.image_status),
      videoStatus: normalizeTaskStatus(shot.video_status),
    },
    file,
  };
}

async function createEpisodeOriginalVideoExport(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const storageObjectId = String(input.body.storageObjectId ?? input.body.fileId ?? "");
  const assetVersionId = String(input.body.assetVersionId ?? "");
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId,
    storageObjectId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.exportCreate,
    now: input.now,
  });
  if (!resolved || resolved.assetVersion.assetType !== "shot_video" || !resolved.assetVersion.storageObjectId) {
    return null;
  }
  const workflow = await createWorkflowWithTasks(db, {
    organizationId: resolved.context.actor.organizationId,
    workspaceId: resolved.context.actor.workspaceId!,
    projectId: resolved.context.project.id,
    workflowType: operationNames.exportCreate,
    inputSnapshot: {
      episodeId: input.episodeId,
      mode: "original_video",
      storageObjectId: resolved.assetVersion.storageObjectId,
    },
    createdByUserId: input.authenticated.user.id,
    tasks: [
      {
        taskType: "episode_export_original_video",
        queueName: "episode-export",
        targetEntityType: "episode",
        targetEntityId: input.episodeId,
        inputSnapshot: {
          episodeId: input.episodeId,
          storageObjectId: resolved.assetVersion.storageObjectId,
        },
      },
    ],
  });
  const task = workflow.tasks[0]!;
  const claim = await claimQueuedTask(db, {
    taskId: task.id,
    workerId: "episode-original-video-export",
    now: input.now,
    leaseMs: 60_000,
  });
  if (!claim) {
    throw new Error("task_claim_failed");
  }
  await finalizeTaskAttempt(db, {
    taskId: task.id,
    attemptId: claim.attempt.id,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, workflow.workflow.id);
  const urls = await signedUrlsForStorageObject(db, {
    sessionToken: input.authenticated.sessionToken,
    storageObjectId: resolved.assetVersion.storageObjectId,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
    const record = await createExportRecord(db, {
      organizationId: resolved.context.actor.organizationId,
      workspaceId: resolved.context.actor.workspaceId!,
      projectId: resolved.context.project.id,
      episodeId: input.episodeId,
      workflowId: workflow.workflow.id,
      storageObjectId: resolved.assetVersion.storageObjectId,
    manifestStatus: "ready",
    allowPartialExport: false,
    itemCount: 1,
    missingAssetCount: 0,
    latestSignedUrlExpiresAt: urls.expiresAt,
    createdByUserId: input.authenticated.user.id,
    now: input.now,
  });
  return {
    exportTask: {
      id: record.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      episodeId: input.episodeId,
      status: "succeeded",
      mode: "original_video",
      storageObjectId: resolved.assetVersion.storageObjectId,
      downloadUrl: urls.downloadUrl,
      sourceUrl: urls.sourceUrl,
      expiresAt: urls.expiresAt,
      createdAt: record.createdAt,
    },
  };
}

async function saveEpisodeGenerationDraftRoute(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    targetType: "asset" | "storyboard";
    targetId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const modeRaw = String(input.body.mode ?? "image").trim().toLowerCase();
  const mode = modeRaw === "video" || modeRaw === "lip_sync" || modeRaw === "image"
    ? modeRaw
    : "image";
  const draft = await upsertEpisodeGenerationDraft(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId!,
    projectId: context.project.id,
    episodeId: input.episodeId,
    targetType: input.targetType,
    targetId: input.targetId,
    prompt: String(input.body.prompt ?? ""),
    mode,
    payload:
      input.body.payload && typeof input.body.payload === "object"
        ? input.body.payload as Record<string, unknown>
        : {},
    createdByUserId: input.authenticated.user.id,
    now: input.now,
  });
  return {
    draft,
  };
}

async function saveEpisodeAssetConversationMessagesRoute(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    body: Record<string, unknown>;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const mediaModeRaw = String(input.body.mediaMode ?? "image").trim().toLowerCase();
  const mediaMode: AssetConversationMediaMode = mediaModeRaw === "video" ? "video" : "image";
  const inputMessages = Array.isArray(input.body.messages) ? input.body.messages : [];
  const normalizedMessages = inputMessages
    .map((item, index) => normalizeAssetConversationMessageInput(item, index))
    .filter(Boolean) as Array<{
      turnId: string;
      messageKey: string;
      messageType: AssetConversationMessageType;
      status: AssetConversationStatus;
      taskId: string | null;
      payload: Record<string, unknown>;
    }>;
  if (!normalizedMessages.length) {
    return {
      thread: null,
      messages: [],
      entries: [],
    };
  }

  const thread = await upsertAssetConversationThread(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId!,
    projectId: context.project.id,
    episodeId: input.episodeId,
    assetId: input.assetId,
    mediaMode,
    createdByUserId: input.authenticated.user.id,
    latestMessageAt: input.now,
    now: input.now,
  });
  const messages = await upsertAssetConversationMessages(db, {
    threadId: thread.threadId,
    createdByUserId: input.authenticated.user.id,
    now: input.now,
    messages: normalizedMessages,
  });
  const allMessages = await listAssetConversationMessages(db, {
    threadId: thread.threadId,
  });
  const normalizedAllMessages = allMessages.map((message) => ({
    ...message,
    payload: replaceMockImageUrlsInValue(message.payload, message.taskId ?? message.turnId) as Record<string, unknown>,
  }));
  return {
    thread,
    messages,
    entries: buildAssetConversationEntries(thread, normalizedAllMessages),
  };
}

async function getEpisodeAssetConversationRoute(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    mediaMode: AssetConversationMediaMode;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const thread = await findAssetConversationThread(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    assetId: input.assetId,
    mediaMode: input.mediaMode,
  });
  if (!thread) {
    return {
      thread: null,
      messages: [],
      entries: [],
    };
  }
  const messages = await listAssetConversationMessages(db, {
    threadId: thread.threadId,
  });
  const normalizedMessages = messages.map((message) => ({
    ...message,
    payload: replaceMockImageUrlsInValue(message.payload, message.taskId ?? message.turnId) as Record<string, unknown>,
  }));
  return {
    thread,
    messages,
    entries: buildAssetConversationEntries(thread, normalizedMessages),
  };
}

async function deleteEpisodeAssetConversationTurnRoute(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    assetId: string;
    taskId: string;
    mediaMode: AssetConversationMediaMode;
    authenticated: { sessionToken: string; user: AuthenticatedUser };
    now: Date;
  },
) {
  const context = await getEpisodeContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!context) {
    return null;
  }
  const thread = await findAssetConversationThread(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    assetId: input.assetId,
    mediaMode: input.mediaMode,
  });
  if (!thread) {
    return {
      deleted: false,
      deletedCount: 0,
      thread: null,
      messages: [],
      entries: [],
    };
  }

  const deleted = await deleteAssetConversationTurn(db, {
    threadId: thread.threadId,
    turnIdOrTaskId: input.taskId,
    now: input.now,
  });
  const nextThread = deleted.remainingMessages.length
    ? await findAssetConversationThread(db, {
        organizationId: context.actor.organizationId,
        projectId: context.project.id,
        episodeId: input.episodeId,
        assetId: input.assetId,
        mediaMode: input.mediaMode,
      })
    : null;
  return {
    deleted: (deleted.deletedCount ?? 0) > 0,
    deletedCount: deleted.deletedCount ?? 0,
    thread: nextThread,
    messages: deleted.remainingMessages,
    entries: nextThread ? buildAssetConversationEntries(nextThread, deleted.remainingMessages) : [],
  };
}

function normalizeAssetConversationMessageInput(item: unknown, index: number) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const messageTypeRaw = String((item as { messageType?: unknown }).messageType ?? "").trim().toLowerCase();
  const messageType: AssetConversationMessageType | null =
    messageTypeRaw === "user_request" || messageTypeRaw === "task_status" || messageTypeRaw === "result"
      ? messageTypeRaw
      : null;
  if (!messageType) {
    return null;
  }
  const turnId = String(
    (item as { turnId?: unknown; taskId?: unknown }).turnId ??
      (item as { taskId?: unknown }).taskId ??
      `asset-conversation-turn-${index + 1}`,
  ).trim();
  const messageKey = String(
    (item as { messageKey?: unknown }).messageKey ??
      `${turnId}:${messageType}`,
  ).trim();
  const statusRaw = String((item as { status?: unknown }).status ?? "running").trim().toLowerCase();
  const status: AssetConversationStatus =
    statusRaw === "queued" ||
    statusRaw === "completed" ||
    statusRaw === "failed" ||
    statusRaw === "canceled"
      ? statusRaw
      : "running";
  const payload =
    (item as { payload?: unknown }).payload && typeof (item as { payload?: unknown }).payload === "object"
      ? (item as { payload: Record<string, unknown> }).payload
      : {};
  return {
    turnId,
    messageKey,
    messageType,
    status,
    taskId: String((item as { taskId?: unknown }).taskId ?? "").trim() || null,
    payload,
  };
}

function applyDevCorsHeaders(
  request: Parameters<typeof createServer>[0],
  response: ServerResponse,
) {
  const origin = request.headers.origin;
  if (typeof origin !== "string") {
    return;
  }

  const isAllowedOrigin =
    origin === "null" ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (!isAllowedOrigin) {
    return;
  }

  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    request.headers["access-control-request-headers"] ?? "content-type,idempotency-key",
  );
  response.setHeader("vary", "Origin");
}

function isForbiddenCorsRequest(request: Parameters<typeof createServer>[0]) {
  const origin = request.headers.origin;
  if (typeof origin !== "string") {
    return false;
  }
  if (origin === "null") {
    return false;
  }
  return !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

async function serveStatic(pathname: string, response: ServerResponse) {
  if (pathname === "/favicon.ico") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (pathname === "/vendor/three.module.js" || pathname === "/vendor/three.core.js") {
    const vendorFile = pathname === "/vendor/three.module.js" ? "three.module.js" : "three.core.js";
    const file = await readFile(join(nodeModulesRoot, "three", "build", vendorFile), "utf8");
    response.statusCode = 200;
    response.setHeader("content-type", "text/javascript; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(file);
    return;
  }

  const normalizedPath =
    pathname === "/" ? "/login.html" : pathname === "/login" ? "/login.html" : pathname;
  let filePath = join(webRoot, normalizedPath.replace(/^\/+/, ""));
  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch (error) {
    const extension = extname(normalizedPath);
    if (extension) {
      throw error;
    }
    filePath = join(webRoot, "app.html");
    file = await readFile(filePath);
  }

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "text/plain; charset=utf-8",
  );
  response.setHeader("cache-control", "no-store");
  response.end(file);
}

async function serveVendorFile(pathname: string, response: ServerResponse) {
  const normalizedPath = pathname.replace(/^\/vendor\/+/, "");
  const filePath =
    normalizedPath === "three.module.js" || normalizedPath === "three.core.js"
      ? join(vendorRoot, "three", "build", normalizedPath)
      : join(vendorRoot, normalizedPath);
  const file = await readFile(filePath);

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "application/octet-stream",
  );
  response.setHeader("cache-control", "no-store");
  response.end(file);
}

async function appendEpisodeWorkbenchEvent(body: unknown, user: AuthenticatedUser) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const event = {
    id: randomUUID(),
    serverReceivedAt: new Date().toISOString(),
    userId: user.id,
    userPhone: user.phone,
    eventType: typeof input.eventType === "string" ? input.eventType : "unknown",
    projectId: typeof input.projectId === "string" ? input.projectId : null,
    episodeId: typeof input.episodeId === "string" ? input.episodeId : null,
    storyboardId: typeof input.storyboardId === "string" ? input.storyboardId : null,
    shotId: typeof input.shotId === "string" ? input.shotId : null,
    mediaMode: typeof input.mediaMode === "string" ? input.mediaMode : null,
    model: typeof input.model === "string" ? input.model : null,
    clientCreatedAt: typeof input.clientCreatedAt === "string" ? input.clientCreatedAt : null,
    payload: input.payload ?? {},
  };

  await mkdir(dirname(episodeEventLogPath), { recursive: true });
  await appendFile(episodeEventLogPath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

async function serveUploadedFile(
  request: Parameters<typeof createServer>[0],
  pathname: string,
  response: ServerResponse,
) {
  const relativePath = pathname.replace(/^\/uploads\/+/, "");
  const absolutePath = resolve(uploadRoot, relativePath);
  if (!absolutePath.startsWith(uploadRoot)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  const file = await readFile(absolutePath);
  const fileStats = await stat(absolutePath);
  const contentType =
    contentTypes[extname(absolutePath).toLowerCase()] ?? "application/octet-stream";
  const rangeHeader = request.headers.range;

  response.setHeader("content-type", contentType);
  response.setHeader("accept-ranges", "bytes");

  if (typeof rangeHeader === "string" && rangeHeader.startsWith("bytes=")) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    const start = match?.[1] ? Number(match[1]) : 0;
    const requestedEnd = match?.[2] ? Number(match[2]) : fileStats.size - 1;
    const end = Math.min(requestedEnd, fileStats.size - 1);

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
      response.statusCode = 416;
      response.setHeader("content-range", `bytes */${fileStats.size}`);
      response.end();
      return;
    }

    const chunk = file.subarray(start, end + 1);
    response.statusCode = 206;
    response.setHeader("content-range", `bytes ${start}-${end}/${fileStats.size}`);
    response.setHeader("content-length", String(chunk.byteLength));
    response.end(chunk);
    return;
  }

  response.statusCode = 200;
  response.setHeader("content-length", String(file.byteLength));
  response.end(file);
}

function resolveLocalStorageObjectPath(bucket: string, objectKey: string) {
  const absolutePath = resolve(uploadRoot, "storage", bucket, objectKey);
  const expectedRoot = resolve(uploadRoot, "storage");
  if (!absolutePath.startsWith(expectedRoot)) {
    throw new Error("upload_path_outside_root");
  }
  return absolutePath;
}

async function readBinaryBody(request: AsyncIterable<Buffer | string>) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

async function writeLocalStorageObject(input: {
  bucket: string;
  objectKey: string;
  bytes: Uint8Array;
}) {
  const absolutePath = resolveLocalStorageObjectPath(input.bucket, input.objectKey);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.bytes);
  return absolutePath;
}

async function writeLocalStorageObjectFromStream(input: {
  bucket: string;
  objectKey: string;
  body: NodeJS.ReadableStream;
}) {
  const absolutePath = resolveLocalStorageObjectPath(input.bucket, input.objectKey);
  await mkdir(dirname(absolutePath), { recursive: true });
  await pipeline(input.body, createWriteStream(absolutePath));
  return absolutePath;
}

async function headLocalStorageObject(input: {
  bucket: string;
  objectKey: string;
}) {
  try {
    const absolutePath = resolveLocalStorageObjectPath(input.bucket, input.objectKey);
    const fileStats = await stat(absolutePath);
    return {
      exists: true,
      contentLength: fileStats.size,
    };
  } catch {
    return { exists: false };
  }
}

async function deleteLocalStorageObject(input: {
  bucket: string;
  objectKey: string;
}) {
  try {
    await unlink(resolveLocalStorageObjectPath(input.bucket, input.objectKey));
  } catch {
    // Ignore missing local upload artifacts.
  }
}

function serverOriginFromRequest(request: Parameters<typeof createServer>[0]) {
  const host = request.headers.host ?? "127.0.0.1:4310";
  return `http://${host}`;
}

function proxyRemoteMedia(
  response: ServerResponse,
  targetUrl: string,
  headers: Record<string, string> = {},
) {
  return new Promise<void>((resolvePromise) => {
    const upstream = httpsRequest(
      targetUrl,
      {
        method: "GET",
        headers,
      },
      (upstreamResponse) => {
        response.statusCode = upstreamResponse.statusCode ?? 502;
        const passthroughHeaders = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "cache-control",
          "etag",
          "last-modified",
        ];
        for (const headerName of passthroughHeaders) {
          const headerValue = upstreamResponse.headers[headerName];
          if (headerValue) {
            response.setHeader(headerName, headerValue);
          }
        }
        response.setHeader("access-control-allow-origin", "*");
        upstreamResponse.pipe(response);
        upstreamResponse.on("end", () => resolvePromise());
        upstreamResponse.on("error", () => {
          if (!response.headersSent) {
            response.statusCode = 502;
          }
          response.end();
          resolvePromise();
        });
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader("content-type", "application/json; charset=utf-8");
      }
      response.end(JSON.stringify({ ok: false, error: "remote_media_unavailable" }));
      resolvePromise();
    });
    upstream.end();
  });
}

async function ensureDevWorkspaceAccess(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
  options: PhoneAuthDevServerOptions = {},
) {
  const user = await queryOne<{ phone_e164: string }>(
    db,
    "SELECT phone_e164 FROM users WHERE id = $1",
    [userId],
  );
  const role = user?.phone_e164 === "+8613800138001" ? "owner_admin" : "creator";

  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Comic AI Studio', 'active', $2)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          credit_balance_cached = CASE
            WHEN organizations.credit_balance_cached <= 0
            THEN $2
            ELSE organizations.credit_balance_cached
          END
    `,
    [devOrganizationId, devInitialCreditBalance],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Creator Workspace', 'active')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `,
    [devWorkspaceId, devOrganizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (organization_id, workspace_id, user_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'active'
    `,
    [randomUUID(), devOrganizationId, devWorkspaceId, userId, role],
  );

  if (role === "owner_admin" && options.seedTeamEntitlements) {
    await db.query(
      `
        INSERT INTO organization_entitlements (
          id,
          organization_id,
          entitlement_key,
          status,
          source
        )
        VALUES
          ($1, $2, 'team_member_management', 'active', 'dev_seed'),
          ($3, $2, 'team_asset_library', 'active', 'dev_seed'),
          ($4, $2, 'team_dashboard', 'active', 'dev_seed')
        ON CONFLICT (organization_id, entitlement_key)
        DO UPDATE SET status = 'active', source = EXCLUDED.source
      `,
      [randomUUID(), devOrganizationId, randomUUID(), randomUUID()],
    );
    await db.query(
      `
        INSERT INTO team_plan_limits (
          id,
          organization_id,
          seat_limit,
          single_account_concurrency_limit
        )
        VALUES ($1, $2, 5, 1)
        ON CONFLICT (organization_id)
        DO UPDATE SET
          seat_limit = EXCLUDED.seat_limit,
          single_account_concurrency_limit = EXCLUDED.single_account_concurrency_limit
      `,
      [randomUUID(), devOrganizationId],
    );
  }
}

async function findAuthenticatedUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  cookieHeader: string | undefined,
  now: Date,
): Promise<{ sessionToken: string; user: AuthenticatedUser } | undefined> {
  const sessionToken = parseCookies(cookieHeader).auth_session;
  if (!sessionToken) {
    return undefined;
  }

  const session = await findPersistentAuthSessionByToken(db, {
    token: sessionToken,
    now,
  });
  if (!session) {
    return undefined;
  }

  const user = await queryOne<{
    id: string;
    phone_e164: string;
    status: "active" | "disabled";
  }>(db, "SELECT id, phone_e164, status FROM users WHERE id = $1", [session.userId]);

  if (!user || user.status !== "active") {
    return undefined;
  }

  return {
    sessionToken,
    user: {
      id: user.id,
      phone: user.phone_e164,
    },
  };
}

function parseRepairSchedulerOptions(
  input?: PhoneAuthDevServerRepairSchedulerOptions,
): Required<PhoneAuthDevServerRepairSchedulerOptions> {
  const intervalFromEnv = Number(
    process.env.STORAGE_REPAIR_INTERVAL_MS ??
      process.env.CREATOR_REPAIR_INTERVAL_MS ??
      60_000,
  );
  const limitFromEnv = Number(
    process.env.STORAGE_REPAIR_TASK_LIMIT ??
      process.env.CREATOR_REPAIR_TASK_LIMIT ??
      100,
  );
  const enabledFromEnv =
    process.env.STORAGE_REPAIR_SCHEDULER_ENABLED ??
    process.env.CREATOR_REPAIR_SCHEDULER_ENABLED;
  const enabled =
    input?.enabled ??
    (enabledFromEnv == null
      ? true
      : !["0", "false", "off", "no"].includes(enabledFromEnv.trim().toLowerCase()));
  const intervalMs = Math.max(
    250,
    Number.isFinite(input?.intervalMs)
      ? Number(input?.intervalMs)
      : Number.isFinite(intervalFromEnv)
        ? intervalFromEnv
        : 60_000,
  );
  const limit = Math.max(
    1,
    Math.floor(
      Number.isFinite(input?.limit)
        ? Number(input?.limit)
        : Number.isFinite(limitFromEnv)
          ? limitFromEnv
          : 100,
    ),
  );
  return { enabled, intervalMs, limit };
}

export function createPhoneAuthDevServer(
  options: PhoneAuthDevServerOptions = {},
): PhoneAuthDevServer {
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options.env ?? {}),
  };
  const dbPromise = options.db
    ? Promise.resolve(options.db)
    : runtimeEnv.NODE_ENV === "test"
      ? createMigratedTestDb()
      : createDevDb();
  let resolvedDb: Awaited<typeof dbPromise> | null = null;
  void dbPromise
    .then((db) => {
      resolvedDb = db;
    })
    .catch(() => undefined);
  const repairSchedulerOptions = parseRepairSchedulerOptions(options.repairScheduler);
  let repairSchedulerTimer: ReturnType<typeof setInterval> | null = null;
  let repairSchedulerRunning = false;
  const debugChallengeCodes = new Map<string, string>();
  const smsProvider = createSmsProviderFromEnv(runtimeEnv);
  const creatorApps = new Map<string, CreatorDevApp>();
  const creatorSqlStates = new Map<
    string,
    { projectId: string | null; scriptId: string | null }
  >();
  const uploadStore = createLocalUploadStore({ rootDir: uploadRoot });
  const storageMode = (runtimeEnv.STORAGE_ADAPTER_MODE ?? "dev").trim();
  const storageRegion = (runtimeEnv.STORAGE_REGION ?? "ap-shanghai").trim();
  const storageBucket = (
    runtimeEnv.STORAGE_BUCKET?.trim() ||
    (storageMode === "dev" ? "creator-dev" : `creator-${storageMode}`)
  );
  const signedUrlExpiresInSeconds = Number(
    runtimeEnv.STORAGE_SIGNED_URL_EXPIRES_SECONDS ??
    runtimeEnv.CREATOR_SIGNED_URL_EXPIRES_SECONDS ??
    900,
  );
  const storageAdapter = (() => {
    try {
      return createStorageAdapterFromEnv(runtimeEnv);
    } catch (error) {
      console.warn(
        `[storage] Falling back to dev adapter. ${error instanceof Error ? error.message : String(error)}`,
      );
      return createStorageAdapterFromEnv({
        ...runtimeEnv,
        STORAGE_ADAPTER_MODE: "dev",
      });
    }
  })();
  const defaultStorageRuntime: UploadSessionRuntime = {
    mode: storageMode,
    provider: storageMode === "cos" ? "tencent_cos" : storageMode === "s3_compatible" ? "s3_compatible" : "creator-dev",
    bucket: storageBucket,
    region: storageRegion,
    publicBaseUrl:
      runtimeEnv.STORAGE_PUBLIC_BASE_URL?.trim() ||
      runtimeEnv.STORAGE_ENDPOINT?.trim() ||
      null,
    adapter: storageAdapter,
    stsSecretId: runtimeEnv.STORAGE_COS_SECRET_ID?.trim() ?? null,
    stsSecretKey: runtimeEnv.STORAGE_COS_SECRET_KEY?.trim() ?? null,
    stsDurationSeconds: Number(runtimeEnv.STORAGE_COS_STS_DURATION_SECONDS ?? 1800),
    localUploadUrlPath: "/api/storage/upload-sessions",
    localObjectStore: {
      headObject: headLocalStorageObject,
      deleteObject: deleteLocalStorageObject,
    },
  };
  const storageRuntime: UploadSessionRuntime = {
    ...defaultStorageRuntime,
    ...(options.storageRuntime ?? {}),
    localObjectStore:
      options.storageRuntime?.localObjectStore ?? defaultStorageRuntime.localObjectStore,
  };
  const httpServer = createServer(async (request, response) => {
    try {
      applyDevCorsHeaders(request, response);
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;
      if (pathname.startsWith("/api/") && isForbiddenCorsRequest(request)) {
        return writeJson(
          response,
          envelopedError(403, "origin_forbidden", "Origin is not allowed"),
        );
      }
      if (request.method === "OPTIONS") {
        if (isForbiddenCorsRequest(request)) {
          return writeJson(
            response,
            envelopedError(403, "origin_forbidden", "Origin is not allowed"),
          );
        }
        response.statusCode = 204;
        response.end();
        return;
      }

      const db = await dbPromise;
      const creatorApplication = createCreatorApplication({
        db,
        workspaceId: devWorkspaceId,
        creatorApps,
        creatorSqlStates,
        storageRuntime,
        signedUrlExpiresInSeconds,
      });
      if (pathname.startsWith("/uploads/")) {
        return await serveUploadedFile(request, pathname, response);
      }

      if (pathname.startsWith("/vendor/")) {
        return await serveVendorFile(pathname, response);
      }

      if (request.method === "POST" && pathname === "/api/auth/code/request") {
        const body = (await readJsonBody(request)) as { phone: string };
        const result = await requestPersistentLoginCode(db, {
          phone: body.phone,
          now: new Date(),
          ipAddress: requestIpAddress(request),
          userAgent: String(request.headers["user-agent"] ?? ""),
          smsProvider,
        });

        if (result.kind !== "sent") {
          return writeJson(response, {
            status: result.kind === "sms_send_failed" ? 502 : 429,
            body: {
              error: result.kind,
              retryAfterSeconds:
                "retryAfterSeconds" in result ? result.retryAfterSeconds : 60,
            },
          });
        }

        debugChallengeCodes.set(result.challengeId, result.plainCode);
        return writeJson(response, {
          status: 200,
          body: {
            challengeId: result.challengeId,
            maskedPhone: maskCnPhone(result.phoneE164),
            expiresAt: result.expiresAt.toISOString(),
            retryAfterSeconds: result.retryAfterSeconds,
            remainingToday: result.remainingToday,
            ...(smsProvider.providerName === "dev"
              ? { devCode: result.plainCode }
              : {}),
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/code/verify") {
        const body = (await readJsonBody(request)) as {
          challengeId: string;
          phone: string;
          code: string;
        };
        const verified = await verifyPersistentLoginChallenge(db, {
          challengeId: body.challengeId,
          phone: body.phone,
          code: body.code,
          now: new Date(),
        });

        if (verified.kind !== "verified") {
          const error =
            verified.kind === "challenge_not_found"
              ? "challenge_not_found"
              : verified.kind === "expired"
                ? "challenge_expired"
                : verified.kind === "consumed"
                  ? "challenge_consumed"
                  : verified.kind === "locked"
                    ? "verify_locked"
                    : verified.kind === "phone_mismatch"
                      ? "invalid_phone"
                      : verified.kind === "user_disabled"
                        ? "user_disabled"
                        : "code_invalid";

          return writeJson(response, {
            status:
              error === "challenge_not_found"
                ? 404
                : error === "invalid_phone"
                  ? 400
                  : error === "user_disabled"
                    ? 403
                    : 409,
            body: { error },
          });
        }

        await ensureDevWorkspaceAccess(db, verified.user.id, options);

        return writeJson(response, {
          status: 200,
          body: {
            user: {
              id: verified.user.id,
              phone: verified.user.phone,
            },
            session: {
              id: verified.session.id,
              expiresAt: verified.session.expiresAt.toISOString(),
            },
          },
          cookies: [sessionCookie(verified.token)],
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/session") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        const session = await findPersistentAuthSessionByToken(db, {
          token: authenticated.sessionToken,
          now: new Date(),
        });
        return writeJson(response, {
          status: 200,
          body: {
            authenticated: true,
            user: authenticated.user,
            session: {
              id: session!.id,
              expiresAt: session!.expiresAt.toISOString(),
            },
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/logout") {
        const sessionToken = parseCookies(request.headers.cookie).auth_session;
        if (sessionToken) {
          await revokePersistentAuthSession(db, {
            token: sessionToken,
            now: new Date(),
          });
        }

        return writeJson(response, {
          status: 204,
          body: {},
          cookies: [clearSessionCookie()],
        });
      }

      if (
        request.method === "GET" &&
        pathname.startsWith("/api/auth/dev/challenges/")
      ) {
        const challengeId = pathname.split("/").at(-1) ?? "";
        const code = debugChallengeCodes.get(challengeId);

        if (!code) {
          return writeJson(response, {
            status: 404,
            body: { error: "challenge_not_found" },
          });
        }

        const challenge = await queryOne<{
          phone_e164: string;
          expires_at: Date;
          status: string;
        }>(
          db,
          `
            SELECT phone_e164, expires_at, status
            FROM login_challenges
            WHERE id = $1
          `,
          [challengeId],
        );

        if (!challenge) {
          return writeJson(response, {
            status: 404,
            body: { error: "challenge_not_found" },
          });
        }

        return writeJson(response, {
          status: 200,
          body: {
            challengeId,
            phone: challenge.phone_e164,
            code,
            expiresAt: challenge.expires_at.toISOString(),
            status: challenge.status,
          },
        });
      }

      if (
        request.method === "POST" &&
        pathname.startsWith("/api/payment-provider-callbacks/")
      ) {
        const provider = decodeURIComponent(
          pathname.slice("/api/payment-provider-callbacks/".length),
        );
        if (!isPaymentProvider(provider)) {
          return writeJson(response, {
            status: 400,
            body: { error: "invalid_payment_provider" },
          });
        }
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: devWorkspaceId,
          callbackSecret: devPaymentCallbackSecret,
          providerRegistry: devPaymentProviderRegistry,
        });
        return writeJson(
          response,
          await commercePayment.processProviderCallback({
            provider,
            rawBody: await readTextBody(request),
            headers: singleValueHeaders(request.headers),
            now: new Date(),
          }),
        );
      }

      if (
        request.method === "POST" &&
        pathname === "/api/billing/payment-callback/mock"
      ) {
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: devWorkspaceId,
          callbackSecret: devPaymentCallbackSecret,
          providerRegistry: devPaymentProviderRegistry,
        });
        const body = (await readJsonBody(request)) as {
          provider: PaymentProvider;
          providerEventDedupKey: string;
          merchantOrderNo: string;
          providerTradeId: string;
          eventType:
            | "payment_succeeded"
            | "payment_failed"
            | "payment_closed"
            | "refund_succeeded"
            | "unknown";
          amountMinor: number;
          currency: string;
          merchantId: string;
          signature: string;
        };
        return writeJson(
          response,
          await commercePayment.processPaymentCallback({
            body,
            now: new Date(),
          }),
        );
      }

      if (pathname.startsWith("/api/billing/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        await ensureDefaultCreditPackage(db, { now: new Date() });
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: devWorkspaceId,
          callbackSecret: devPaymentCallbackSecret,
          providerRegistry: devPaymentProviderRegistry,
          providerCallbackBaseUrl: request.headers.host
            ? `http://${request.headers.host}`
            : undefined,
        });

        if (request.method === "GET" && pathname === "/api/billing/packages") {
          return writeJson(response, await commercePayment.listCreditPackages());
        }

        const paymentIntentMatch = pathname.match(/^\/api\/billing\/payment-intents\/([^/]+)$/);
        if (request.method === "GET" && paymentIntentMatch) {
          return writeJson(
            response,
            await commercePayment.getPaymentIntent({
              user: { sessionToken: authenticated.sessionToken },
              paymentIntentId: decodeURIComponent(paymentIntentMatch[1]),
              now: new Date(),
            }),
          );
        }

        const orderMatch = pathname.match(/^\/api\/billing\/orders\/([^/]+)$/);
        if (request.method === "GET" && orderMatch) {
          return writeJson(
            response,
            await commercePayment.getBillingOrder({
              user: { sessionToken: authenticated.sessionToken },
              orderId: decodeURIComponent(orderMatch[1]),
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/billing/orders") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            creditPackageId: string;
          };
          return writeJson(
            response,
            await commercePayment.createBillingOrder({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname === "/api/billing/payment-intents"
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            orderId: string;
            provider: PaymentProvider;
            productMode: string;
          };
          return writeJson(
            response,
            await commercePayment.createPaymentIntent({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/billing/enterprise-contact-requests") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            source?: string | null;
            note?: string | null;
          };
          return writeJson(
            response,
            await commercePayment.requestEnterpriseContact({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }
      }

      if (pathname.startsWith("/api/storage/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        if (request.method === "POST" && pathname === "/api/storage/upload-sessions") {
          if (!process.env.DATABASE_URL?.trim()) {
            return writeJson(
              response,
              envelopedError(500, "database_url_required", "未配置真实数据库，禁止上传。"),
            );
          }
          if (storageRuntime.mode === "creator-dev") {
            return writeJson(
              response,
              envelopedError(500, "cloud_storage_required", "未配置云存储，项目上传必须走云存储。"),
            );
          }
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            purpose: string;
            fileName: string;
            contentType: string;
            sizeBytes?: number | null;
            checksum?: string | null;
            multipart?: boolean | null;
          };
          const uploadPolicy = validateUploadPolicy({
            fileName: body.fileName,
            contentType: body.contentType,
            sizeBytes: body.sizeBytes ?? null,
          });
          if (!uploadPolicy.ok) {
            return writeJson(
              response,
              envelopedError(
                uploadPolicy.errorCode === "upload_file_too_large" ? 413 : 400,
                uploadPolicy.errorCode,
                uploadPolicy.message,
                "details" in uploadPolicy ? uploadPolicy.details : {},
              ),
            );
          }
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            ...(body.projectId?.trim() ? { projectId: body.projectId.trim() } : { workspaceId: devWorkspaceId }),
            now: new Date(),
          });
          const prepared = await createUploadSession(db, {
            actor,
            sessionToken: authenticated.sessionToken,
            projectId: body.projectId?.trim() || null,
            purpose: body.purpose,
            fileName: body.fileName,
            contentType: body.contentType,
            sizeBytes: body.sizeBytes ?? null,
            checksum: body.checksum ?? null,
            multipart: body.multipart ?? null,
            idempotencyKey,
            now: new Date(),
            runtime: storageRuntime,
          });
          const userRecord = await queryOne<{ display_name: string | null; phone_e164: string | null }>(
            db,
            "SELECT display_name, phone_e164 FROM users WHERE id = $1",
            [actor.actorId],
          );
          const projectRecord = body.projectId?.trim()
            ? await queryOne<{ name: string | null }>(db, "SELECT name FROM projects WHERE id = $1", [body.projectId.trim()])
            : null;
          await createProjectUploadRecord(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? null,
            projectId: body.projectId?.trim() || null,
            storageObjectId: prepared.storageObjectId ?? null,
            uploadSessionId: prepared.uploadSessionId,
            actorUserId: actor.actorId,
            actorDisplayName: userRecord?.display_name ?? null,
            actorPhoneE164: userRecord?.phone_e164 ?? null,
            projectName: projectRecord?.name ?? null,
            pageKey: "project",
            pageUrl: serverOriginFromRequest(request) + (request.url ?? "/"),
            sourceAction: body.purpose,
            fileName: body.fileName,
            objectKey: prepared.objectKey ?? null,
            bucket: prepared.bucket ?? null,
            provider: prepared.provider ?? null,
            contentType: body.contentType,
            sizeBytes: body.sizeBytes ?? null,
            publicUrl: null,
            status: "created",
            errorMessage: null,
            now: new Date(),
          });
          return writeJson(response, {
            status: 200,
            body: prepared,
          });
        }

        if (
          request.method === "PUT" &&
          pathname.startsWith("/api/storage/upload-sessions/") &&
          pathname.endsWith("/blob")
        ) {
          const uploadSessionId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const bytes = await readBinaryBody(request);
          const session = await findUploadSession(db, uploadSessionId);
          if (!session) {
            response.statusCode = 404;
            response.end("upload_session_not_found");
            return;
          }
          const object = await queryOne<{ bucket: string; object_key: string }>(
            db,
            "SELECT bucket, object_key FROM storage_objects WHERE id = $1",
            [session.storageObjectId],
          );
          if (!object) {
            response.statusCode = 404;
            response.end("storage_object_not_found");
            return;
          }
          const uploadPolicy = validateUploadPolicy({
            fileName: session.originalFileName,
            contentType: request.headers["content-type"] ?? session.contentType,
            sizeBytes: bytes.byteLength,
          });
          if (!uploadPolicy.ok) {
            response.statusCode = uploadPolicy.errorCode === "upload_file_too_large" ? 413 : 400;
            response.setHeader("content-type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              errorCode: uploadPolicy.errorCode,
              message: uploadPolicy.message,
              details: "details" in uploadPolicy ? uploadPolicy.details : {},
            }));
            return;
          }
          if (
            (storageRuntime.mode === "cos" || storageRuntime.mode === "s3_compatible") &&
            typeof storageRuntime.adapter.putObject === "function"
          ) {
            await storageRuntime.adapter.putObject({
              bucket: object.bucket,
              objectKey: object.object_key,
              body: bytes,
              contentType: request.headers["content-type"] ?? null,
            });
          } else {
            await writeLocalStorageObject({
              bucket: object.bucket,
              objectKey: object.object_key,
              bytes,
            });
          }
          response.statusCode = 200;
          response.end("ok");
          return;
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/storage/upload-sessions/") &&
          pathname.endsWith("/complete")
        ) {
          const uploadSessionId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as {
            checksum?: string | null;
            eTag?: string | null;
          };
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: devWorkspaceId,
            now: new Date(),
          });
          const completed = await completeUploadSession(db, {
            actor,
            sessionToken: authenticated.sessionToken,
            uploadSessionId,
            checksum: body.checksum ?? null,
            eTag: body.eTag ?? null,
            now: new Date(),
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
          });
          const publicUrl = buildStorageObjectPublicUrl(storageRuntime, {
            bucket: completed.storageObject.bucket,
            objectKey: completed.storageObject.objectKey,
          });
          const uploadRecord = await completeProjectUploadRecord(db, {
            uploadSessionId,
            storageObjectId: completed.storageObject.id,
            objectKey: completed.storageObject.objectKey,
            bucket: completed.storageObject.bucket,
            provider: completed.storageObject.provider,
            contentType: completed.storageObject.contentType,
            sizeBytes: completed.storageObject.sizeBytes ?? null,
            publicUrl,
            status: "uploaded",
            errorMessage: null,
            now: new Date(),
          });
          return writeJson(response, {
            status: 200,
            body: {
              ...completed,
              uploadRecord,
            },
          });
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/storage/upload-sessions/") &&
          pathname.endsWith("/abort")
        ) {
          const uploadSessionId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: devWorkspaceId,
            now: new Date(),
          });
          return writeJson(response, {
            status: 200,
            body: {
              uploadSession: await abortUploadSession(db, {
                actor,
                uploadSessionId,
                now: new Date(),
                runtime: storageRuntime,
              }),
            },
          });
        }

        if (request.method === "POST" && pathname === "/api/storage/repair") {
          const repair = await runCreatorRepairMaintenance(db, {
            runtime: storageRuntime,
            now: new Date(),
            limit: repairSchedulerOptions.limit,
          });
          return writeJson(response, {
            status: 200,
            body: {
              ...repair.storage,
              episodeGeneration: repair.episodeGeneration,
            },
          });
        }
      }

      if (
        pathname.startsWith("/api/projects/") ||
        pathname.startsWith("/api/episodes/") ||
        pathname.startsWith("/api/generation-tasks/")
      ) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(
            response,
            envelopedError(401, "unauthenticated", "登录已过期，请重新登录"),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/projects/") &&
          pathname.endsWith("/detail")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const result = await creatorApplication.getProjectDetail({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId,
            now: new Date(),
          });
          if (result.status !== 200) {
            const body = result.body as Record<string, unknown>;
            return writeJson(
              response,
              envelopedError(
                result.status,
                String(body.error ?? "project_detail_failed"),
                "项目详情加载失败",
              ),
            );
          }
          return writeJson(
            response,
            enveloped(200, normalizeProjectDetailForEpisodeContract(result.body as Record<string, unknown>)),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/projects/") &&
          pathname.endsWith("/export-tasks")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const result = await creatorApplication.getProjectDetail({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId,
            now: new Date(),
          });
          if (result.status !== 200) {
            return writeJson(response, envelopedError(result.status, "project_not_found", "项目不存在或无权限访问"));
          }
          const detail = result.body as Record<string, unknown>;
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(
            response,
            enveloped(200, paginateItems(Array.isArray(detail.exportHistory) ? detail.exportHistory : [], page, pageSize)),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/projects/") &&
          pathname.endsWith("/episodes")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as { title?: string | null };
          const result = await creatorApplication.createEpisode({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            body: {
              projectId,
              title: body.title ?? null,
            },
            now: new Date(),
          });
          if (result.status !== 200) {
            const legacyBody = result.body as Record<string, unknown>;
            return writeJson(
              response,
              envelopedError(result.status, String(legacyBody.error ?? "episode_create_failed"), "剧集创建失败"),
            );
          }
          return writeJson(response, enveloped(200, result.body));
        }

        if (
          request.method === "PATCH" &&
          pathname.startsWith("/api/projects/") &&
          pathname.includes("/episodes/")
        ) {
          const parts = pathname.split("/");
          const projectId = decodeURIComponent(parts.at(3) ?? "");
          const episodeId = decodeURIComponent(parts.at(5) ?? "");
          const body = (await readJsonBody(request)) as {
            title?: string | null;
            status?: "draft" | "ready" | "archived" | null;
          };
          const result = await creatorApplication.updateEpisode({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            body: {
              projectId,
              episodeId,
              title: body.title,
              status: body.status,
            },
            now: new Date(),
          });
          if (result.status !== 200) {
            const legacyBody = result.body as Record<string, unknown>;
            return writeJson(
              response,
              envelopedError(result.status, String(legacyBody.error ?? "episode_update_failed"), "剧集更新失败"),
            );
          }
          return writeJson(response, enveloped(200, result.body));
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/projects/") &&
          pathname.includes("/episodes/")
        ) {
          const parts = pathname.split("/");
          const projectId = decodeURIComponent(parts.at(3) ?? "");
          const episodeId = decodeURIComponent(parts.at(5) ?? "");
          const result = await creatorApplication.deleteEpisode({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            body: {
              projectId,
              episodeId,
            },
            now: new Date(),
          });
          if (result.status !== 200) {
            const legacyBody = result.body as Record<string, unknown>;
            return writeJson(
              response,
              envelopedError(result.status, String(legacyBody.error ?? "episode_delete_failed"), "剧集删除失败"),
            );
          }
          return writeJson(response, enveloped(200, result.body));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/workbench")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const episode = await queryOne<{
            id: string;
            organization_id: string;
            project_id: string;
            title: string;
            sequence: number;
            status: string;
          }>(
            db,
            "SELECT id, organization_id, project_id, title, sequence, status FROM episodes WHERE id = $1",
            [episodeId],
          );
          if (!episode) {
            return writeJson(response, envelopedError(404, "resource_not_found", "剧集不存在或已被删除"));
          }
          const result = await creatorApplication.getProjectDetail({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId: episode.project_id,
            now: new Date(),
          });
          if (result.status !== 200) {
            return writeJson(response, envelopedError(result.status, "resource_not_found", "资源不存在或已被删除"));
          }
          const detail = normalizeProjectDetailForEpisodeContract(result.body as Record<string, unknown>);
          const project = detail.project as Record<string, unknown>;
          const now = new Date();
          const [roleAssets, sceneAssets, propAssets] = await Promise.all([
            listEpisodeAssetsFromDb(db, {
              episodeId: episode.id,
              assetType: "role",
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
              now,
              capability: null,
            }),
            listEpisodeAssetsFromDb(db, {
              episodeId: episode.id,
              assetType: "scene",
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
              now,
              capability: null,
            }),
            listEpisodeAssetsFromDb(db, {
              episodeId: episode.id,
              assetType: "prop",
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
              now,
              capability: null,
            }),
          ]);
          const assetsByType = {
            role: roleAssets ?? [],
            character: roleAssets ?? [],
            scene: sceneAssets ?? [],
            prop: propAssets ?? [],
          };
          return writeJson(
            response,
            enveloped(200, {
              episode: {
                episodeId: episode.id,
                title: episode.title,
                sequence: episode.sequence,
                status: episode.status,
                projectId: episode.project_id,
              },
              project: {
                projectId: project.projectId ?? episode.project_id,
                name: project.name ?? "",
                status: project.status ?? null,
              },
              navigation: {
                backTarget: "project_episodes",
                projectDetailUrl: `/project/${episode.project_id}`,
                episodeWorkbenchUrl: `/project/${episode.project_id}/episodes/${episode.id}`,
              },
              permissions: {
                canEdit: true,
                canGenerate: true,
                canExport: true,
                canDeleteEpisode: true,
              },
              defaultScopeMode: "storyboard",
              creditBalance: await getOrganizationCreditBalance(db, episode.organization_id),
              assetsByType,
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/assets")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const items = await listEpisodeAssetsFromDb(db, {
            episodeId,
            assetType: url.searchParams.get("assetType"),
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!items) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(response, enveloped(200, paginateItems(items, page, pageSize)));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/assets")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await createEpisodeAssetRecord(db, {
            episodeId,
            body,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "Asset name is required"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/assets/import")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-3) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await importEpisodeAssetRecord(db, {
            episodeId,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            const message =
              result.error === "asset_name_required"
                ? "Asset name is required"
                : result.error === "asset_preview_required"
                  ? "A previewable file is required before importing"
                  : result.error === "storage_object_not_available"
                    ? "The selected file is not available yet"
                    : "The selected file could not be found";
            return writeJson(response, envelopedError(400, result.error, message));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "PATCH" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await updateEpisodeAssetRecord(db, {
            episodeId,
            assetId,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result?.asset) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          !pathname.includes("/conversation/messages/")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          const result = await deleteEpisodeAssetRecord(db, {
            episodeId,
            assetId,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          pathname.endsWith("/save-to-library")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          const result = await saveEpisodeAssetToProjectLibrary(db, {
            episodeId,
            assetId,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            const status = result.error === "asset_library_duplicate" ? 409 : 400;
            const message =
              result.error === "asset_library_duplicate"
                ? "Asset already exists in library"
                : result.error === "asset_preview_required"
                  ? "Asset needs a fixed image before saving"
                  : "Asset name is required";
            return writeJson(response, envelopedError(status, result.error, message));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/storyboards")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const episode = await queryOne<{ project_id: string }>(
            db,
            "SELECT project_id FROM episodes WHERE id = $1",
            [episodeId],
          );
          if (!episode) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          const result = await creatorApplication.getProjectDetail({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId: episode.project_id,
            now: new Date(),
          });
          if (result.status !== 200) {
            return writeJson(response, envelopedError(result.status, "resource_not_found", "资源不存在或已被删除"));
          }
          const detail = result.body as Record<string, unknown>;
          const shots = Array.isArray(detail.shots) ? detail.shots : [];
          const items = shots
            .map((shot) => shot && typeof shot === "object" ? shot as Record<string, unknown> : {})
            .filter((shot) => shot.episodeId === episodeId)
            .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
            .map((shot, index) => {
              const videoVersions = Array.isArray(shot.videoVersions) ? shot.videoVersions : [];
              const currentVideoFileId = shot.currentVideoAssetVersionId ?? null;
              const currentVideoVersion = currentVideoFileId
                ? videoVersions.find((version) => version?.id === currentVideoFileId) ?? null
                : null;
              return {
                storyboardId: shot.id ?? null,
                episodeId,
                indexNo: index + 1,
                sceneAnalysis: shot.sceneAnalysis ?? shot.description ?? "",
                plotPreview: shot.plotPreview ?? shot.title ?? "",
                currentImageFileId: shot.currentImageAssetVersionId ?? null,
                currentImageUrl: shot.previewImageUrl ?? null,
                currentVideoFileId,
                currentVideoUrl:
                  currentVideoVersion?.metadata?.sourceUrl ??
                  currentVideoVersion?.metadata?.downloadUrl ??
                  currentVideoVersion?.metadata?.previewUrl ??
                  currentVideoVersion?.sourceUrl ??
                  currentVideoVersion?.downloadUrl ??
                  currentVideoVersion?.previewUrl ??
                  shot.previewVideoUrl ??
                  null,
                currentVideoThumbnailUrl:
                  currentVideoVersion?.metadata?.thumbnailUrl ??
                  currentVideoVersion?.thumbnailUrl ??
                  shot.previewVideoThumbnailUrl ??
                  null,
                imageStatus: shot.imageStatus === "completed" || shot.imageStatus === "ready" ? "succeeded" : shot.imageStatus ?? "draft",
                videoStatus: shot.videoStatus === "completed" || shot.videoStatus === "ready" ? "succeeded" : shot.videoStatus ?? "not_ready",
                assetRefs: Array.isArray(shot.references) ? shot.references : [],
                sortOrder: shot.sortOrder ?? index,
              };
            });
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(response, enveloped(200, paginateItems(items, page, pageSize)));
        }

        if (
          request.method === "GET" &&
          pathname === "/api/dev-proxy/storyboard-video"
        ) {
          await proxyRemoteMedia(
            response,
            mockEpisodeStoryboardVideoUrl,
            typeof request.headers.range === "string"
              ? { Range: request.headers.range }
              : {},
          );
          return;
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/generation-config")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const context = await getEpisodeContext(db, {
            episodeId,
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            capability: capabilities.generationStart,
            now: new Date(),
          });
          if (!context) {
            return writeJson(response, envelopedError(404, "resource_not_found", "剧集不存在或已被删除"));
          }
          const seedanceEnabled = isEnabled(runtimeEnv.SEEDANCE_PROVIDER_ENABLED);
          const activeImageModels = await listActiveAiModelConfigs(db, { mediaType: "image" });
          const seedanceModelConfig = seedanceEnabled
            ? await findActiveAiModelConfigByCode(db, "seedance-i2v-pro")
            : undefined;
          const imageModels = activeImageModels.length
            ? activeImageModels.map(modelConfigToGenerationConfigModel)
            : [
                {
                  modelCode: "nano_banana_2",
                  modelLabel: "nano banana 2（链路G）",
                  providerGroup: "Nano banana",
                  pipeline: "G",
                  supportedModes: ["text_to_image", "multi_reference", "image_to_image"],
                  supportedRatios: ["16:9", "9:16", "1:1"],
                  supportedQuality: ["2K"],
                  displayBaseCost: 90,
                  disabled: false,
                },
              ];
          const videoModel = seedanceEnabled && seedanceModelConfig
            ? modelConfigToGenerationConfigModel(seedanceModelConfig)
            : {
                modelCode: "video_mock_1",
                modelLabel: "固定视频 Mock",
                providerGroup: "Mock",
                pipeline: "mock",
                supportedModes: ["video"],
                supportedRatios: ["16:9", "9:16"],
                supportedQuality: ["720p"],
                displayBaseCost: Number(runtimeEnv.EPISODE_VIDEO_GENERATION_COST ?? 120),
                disabled: false,
              };
          return writeJson(
            response,
            enveloped(200, {
              models: [
                ...imageModels,
                videoModel,
              ],
              presets: [],
              uploadLimits: episodeUploadLimits,
              defaultImageModelCode: imageModels[0]?.modelCode ?? "nano_banana_2",
              defaultVideoModelCode: videoModel.modelCode,
              creditBalance: context.creditBalance,
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          (pathname.endsWith("/generation/image-tasks") || pathname.endsWith("/generation/video-tasks"))
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeJson(response, envelopedError(400, "idempotency_key_required", "缺少 Idempotency-Key"));
          }
          const episodeId = decodeURIComponent(pathname.split("/").at(3) ?? "");
          const kind = pathname.endsWith("/generation/video-tasks") ? "video" : "image";
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          try {
            const result = await createEpisodeGenerationTask(db, {
              kind,
              episodeId,
              body,
              idempotencyKey,
              authenticated,
              runtime: storageRuntime,
              env: runtimeEnv,
              fetchImpl: options.fetchImpl,
              signedUrlExpiresInSeconds,
              now: new Date(),
            });
            if (!result.body) {
              return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
            }
            return writeJson(response, enveloped(result.status, result.body));
          } catch (error) {
            if (error instanceof IdempotencyConflictError) {
              return writeJson(response, envelopedError(409, error.code, "幂等键已用于不同请求"));
            }
            if (error instanceof IdempotencyProcessingError) {
              return writeJson(response, envelopedError(202, error.code, "任务正在处理中"));
            }
            if (error instanceof InsufficientCreditsError) {
              return writeJson(response, envelopedError(402, "insufficient_credits", "积分不足"));
            }
            throw error;
          }
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/file-resources/bind")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(3) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await bindEpisodeFileResource(db, {
            episodeId,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "上传文件不能绑定到当前目标"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          pathname.endsWith("/set-fixed-image")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await setEpisodeAssetFixedImage(db, {
            episodeId,
            assetId,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "媒体文件不符合当前操作要求"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          pathname.endsWith("/conversation")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          if (!isUuid(episodeId) || !isUuid(assetId)) {
            return writeJson(
              response,
              envelopedError(400, "invalid_asset_conversation_target", "资产对话目标无效"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const result = await getEpisodeAssetConversationRoute(db, {
            episodeId,
            assetId,
            mediaMode,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/storyboards/") &&
          pathname.endsWith("/conversation")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const storyboardId = decodeURIComponent(parts.at(5) ?? "");
          if (!isUuid(episodeId) || !isUuid(storyboardId)) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "分镜对话目标无效"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const result = await getEpisodeAssetConversationRoute(db, {
            episodeId,
            assetId: storyboardId,
            mediaMode,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          pathname.endsWith("/conversation/messages")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          if (!isUuid(episodeId) || !isUuid(assetId)) {
            return writeJson(
              response,
              envelopedError(400, "invalid_asset_conversation_target", "资产对话目标无效"),
            );
          }
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await saveEpisodeAssetConversationMessagesRoute(db, {
            episodeId,
            assetId,
            body,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/storyboards/") &&
          pathname.endsWith("/conversation/messages")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const storyboardId = decodeURIComponent(parts.at(5) ?? "");
          if (!isUuid(episodeId) || !isUuid(storyboardId)) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "分镜对话目标无效"),
            );
          }
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await saveEpisodeAssetConversationMessagesRoute(db, {
            episodeId,
            assetId: storyboardId,
            body,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/assets/") &&
          pathname.includes("/conversation/messages/")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const assetId = decodeURIComponent(parts.at(5) ?? "");
          const taskId = decodeURIComponent(parts.at(8) ?? "");
          if (!isUuid(episodeId) || !isUuid(assetId) || !taskId.trim()) {
            return writeJson(
              response,
              envelopedError(400, "invalid_asset_conversation_target", "璧勪骇瀵硅瘽鐩爣鏃犳晥"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const result = await deleteEpisodeAssetConversationTurnRoute(db, {
            episodeId,
            assetId,
            taskId,
            mediaMode,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "璧勬簮涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/storyboards/") &&
          pathname.includes("/conversation/messages/")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const storyboardId = decodeURIComponent(parts.at(5) ?? "");
          const taskId = decodeURIComponent(parts.at(8) ?? "");
          if (!isUuid(episodeId) || !isUuid(storyboardId) || !taskId.trim()) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "分镜对话目标无效"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const result = await deleteEpisodeAssetConversationTurnRoute(db, {
            episodeId,
            assetId: storyboardId,
            taskId,
            mediaMode,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.includes("/file-resources/")
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const fileId = decodeURIComponent(parts.at(5) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await deleteEpisodeFileResource(db, {
            episodeId,
            fileId,
            body,
            authenticated,
            runtime: storageRuntime,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            const status = result.error === "file_in_use" ? 409 : 400;
            return writeJson(
              response,
              envelopedError(status, result.error, "文件仍在使用或删除失败", "details" in result ? result.details : undefined),
            );
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          (pathname.includes("/storyboards/") && (pathname.endsWith("/set-current-image") || pathname.endsWith("/set-current-video")))
        ) {
          const parts = pathname.split("/");
          const episodeId = decodeURIComponent(parts.at(3) ?? "");
          const storyboardId = decodeURIComponent(parts.at(5) ?? "");
          const mediaKind = pathname.endsWith("/set-current-video") ? "video" : "image";
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await setEpisodeStoryboardMedia(db, {
            episodeId,
            storyboardId,
            mediaKind,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "媒体文件不符合当前操作要求"));
          }
          return writeJson(response, enveloped(200, result));
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/export-tasks")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(3) ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const result = await createEpisodeOriginalVideoExport(db, {
            episodeId,
            body,
            authenticated,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "可导出的原视频不存在"));
          }
          return writeJson(response, enveloped(200, result));
        }

          if (
            request.method === "GET" &&
            pathname.startsWith("/api/episodes/") &&
            pathname.endsWith("/generation-tasks")
          ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const context = await getEpisodeContext(db, {
            episodeId,
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            now: new Date(),
          });
          if (!context) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          const taskRows = await db.query<{ id: string }>(
            `
              SELECT id
              FROM tasks
              WHERE organization_id = $1
                AND project_id = $2
                AND input_snapshot_json->>'episodeId' = $3
                AND task_type IN ('episode_generate_image', 'episode_generate_video')
                AND ($4::text IS NULL OR input_snapshot_json->>'targetType' = $4)
                AND ($5::text IS NULL OR input_snapshot_json->>'targetId' = $5)
              ORDER BY created_at DESC
            `,
            [
              context.actor.organizationId,
              context.project.id,
              episodeId,
              url.searchParams.get("targetType"),
              url.searchParams.get("targetId"),
            ],
          );
          const items = [];
          for (const row of taskRows.rows) {
            const item = await mapGenerationTaskResponse(db, {
              taskId: row.id,
              sessionToken: authenticated.sessionToken,
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
              now: new Date(),
            });
            if (item) {
              items.push(item);
            }
          }
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(response, enveloped(200, paginateItems(items, page, pageSize)));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/generation-tasks/")
        ) {
          const taskId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const taskContext = await resolveTaskContext(db, {
            taskId,
            sessionToken: authenticated.sessionToken,
            now: new Date(),
          });
          if (!taskContext) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          const now = new Date();
          await settleTimedOutEpisodeGenerationTask(db, {
            taskId,
            now,
          });
          const generationQueueConfig = loadGenerationQueueConfig(runtimeEnv);
          if (!generationQueueConfig.outboxDispatcherEnabled && !generationQueueConfig.workersEnabled) {
            await syncSeedanceVideoTaskOnRead(db, {
              taskId,
              sessionToken: authenticated.sessionToken,
              runtime: storageRuntime,
              env: runtimeEnv,
              fetchImpl: options.fetchImpl,
              now,
            });
          }
          const task = await mapGenerationTaskResponse(db, {
            taskId,
            sessionToken: authenticated.sessionToken,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now,
          });
          if (!task) {
            return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
          }
          return writeJson(response, enveloped(200, task));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/generation-tasks")
        ) {
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
            return writeJson(response, enveloped(200, paginateItems([], page, pageSize)));
          }

          if (
            request.method === "PATCH" &&
            pathname.startsWith("/api/episodes/") &&
            pathname.includes("/generation-drafts/")
          ) {
            const parts = pathname.split("/");
            const episodeId = decodeURIComponent(parts.at(3) ?? "");
            const targetType = decodeURIComponent(parts.at(5) ?? "") as "asset" | "storyboard";
            const targetId = decodeURIComponent(parts.at(6) ?? "");
            if (!isUuid(episodeId) || (targetType !== "asset" && targetType !== "storyboard") || !targetId) {
              return writeJson(
                response,
                envelopedError(400, "invalid_generation_draft_target", "草稿目标无效"),
              );
            }
            const body = (await readJsonBody(request)) as Record<string, unknown>;
            const result = await saveEpisodeGenerationDraftRoute(db, {
              episodeId,
              targetType,
              targetId,
              body,
              authenticated,
              now: new Date(),
            });
            if (!result) {
              return writeJson(
                response,
                envelopedError(404, "resource_not_found", "资源不存在或无权限访问"),
              );
            }
            return writeJson(response, enveloped(200, result));
          }

          if (
            request.method === "GET" &&
            pathname.startsWith("/api/generation-tasks/")
          ) {
          return writeJson(response, envelopedError(404, "resource_not_found", "资源不存在或已被删除"));
        }
      }

      if (pathname.startsWith("/api/creator/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        if (request.method === "GET" && pathname === "/api/creator/team/overview") {
          return writeJson(
            response,
            await creatorApplication.getTeamOverview({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/team/members") {
          return writeJson(
            response,
            await creatorApplication.listTeamMembers({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/team/members") {
          const body = (await readJsonBody(request)) as {
            teamAccount?: string | null;
            displayName?: string | null;
            businessRole?: string | null;
            memberGroupId?: string | null;
            projectIds?: string[] | null;
            initialCredits?: number | null;
            remark?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.createTeamMember({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/state") {
          return writeJson(
            response,
            await creatorApplication.getState({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/episode-events") {
          const body = await readJsonBody(request);
          const event = await appendEpisodeWorkbenchEvent(body, authenticated.user);
          return writeJson(response, {
            status: 202,
            body: {
              ok: true,
              event,
            },
          });
        }

        if (request.method === "GET" && pathname === "/api/creator/episode-events") {
          let records: unknown[] = [];
          try {
            const file = await readFile(episodeEventLogPath, "utf8");
            records = file
              .trim()
              .split("\n")
              .filter(Boolean)
              .slice(-100)
              .map((line) => JSON.parse(line));
          } catch {
            records = [];
          }
          return writeJson(response, {
            status: 200,
            body: {
              records,
              logPath: episodeEventLogPath,
            },
          });
        }

        if (request.method === "GET" && pathname === "/api/creator/projects") {
          return writeJson(
            response,
            await creatorApplication.listProjects({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/creator/projects/") &&
          pathname.endsWith("/detail")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          return writeJson(
            response,
            await creatorApplication.getProjectDetail({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/creator/projects/") &&
          pathname.endsWith("/episodes")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          return writeJson(
            response,
            await creatorApplication.listProjectEpisodes({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/project/select") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.selectProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId: body.projectId ?? "",
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/project/create") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            name: string;
            scriptInput: string;
            aspectRatio: string;
            resolution: string;
          };
          return writeJson(
            response,
            await creatorApplication.createProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "PATCH" && pathname === "/api/creator/project") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            name?: string | null;
            phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
            coverImageUrl?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "DELETE" && pathname === "/api/creator/project") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.deleteProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/project/cover") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            coverImageUrl?: string | null;
            uploadSessionId?: string | null;
            storageObjectId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/parse") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          return writeJson(
            response,
            await creatorApplication.parseScript({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/assets/library") {
          return writeJson(
            response,
            await creatorApplication.listAssetLibrary({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/library/assets") {
          return writeJson(
            response,
            await creatorApplication.listReusableAssetLibrary({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              query: {
                scope: url.searchParams.get("scope"),
                category: url.searchParams.get("category"),
                folder: url.searchParams.get("folder"),
                q: url.searchParams.get("q"),
                query: url.searchParams.get("query"),
              },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "PATCH" &&
          pathname.startsWith("/api/creator/assets/") &&
          !pathname.includes("/versions/")
        ) {
          const assetId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const body = (await readJsonBody(request)) as {
            name?: string | null;
            description?: string | null;
            isMain?: boolean | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProjectAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              assetId,
              body,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/creator/assets/") &&
          !pathname.includes("/versions/")
        ) {
          const assetId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          return writeJson(
            response,
            await creatorApplication.deleteProjectAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              assetId,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/import") {
          const body = (await readJsonBody(request)) as {
            kind: "character" | "scene" | "prop" | "image" | "video";
            name?: string | null;
            description?: string | null;
            uploadSessionId?: string | null;
            storageObjectId?: string | null;
            storageObjectKey?: string | null;
            sourceUrl?: string | null;
            mimeType?: string | null;
            width?: number | null;
            height?: number | null;
          };
          return writeJson(
            response,
            await creatorApplication.importAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/uploads") {
          const formData = await readMultipartFormData(request, serverOriginFromRequest(request));
          const category = String(formData.get("category") ?? "misc");
          const projectId = String(formData.get("projectId") ?? "").trim() || null;
          const file = formData.get("file");
          if (!(file instanceof File)) {
            return writeJson(response, {
              status: 400,
              body: { error: "upload_file_required" },
            });
          }

          const upload = await uploadStore.save({
            category,
            fileName: file.name,
            bytes: new Uint8Array(await file.arrayBuffer()),
            mimeType: file.type,
          });

          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            ...(projectId ? { projectId } : { workspaceId: devWorkspaceId }),
            now,
          });
          const storageObject = await createScopedStorageObject(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? devWorkspaceId,
            projectId,
            bucket: "creator-uploads",
            objectName: upload.storageObjectKey,
            contentType: upload.mimeType,
            sizeBytes: upload.byteSize,
            metadata: {
              provider: upload.provider,
              category,
              localStorageObjectKey: upload.storageObjectKey,
              publicUrl: upload.publicUrl,
              originalFileName: upload.originalFileName,
            },
            createdByUserId: actor.actorId,
            now,
          });

          return writeJson(response, {
            status: 200,
            body: {
              upload: {
                ...upload,
                storageObjectId: storageObject.id,
              },
              storageObject,
            },
          });
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/creator/projects/") &&
          pathname.endsWith("/members")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          return writeJson(
            response,
            await creatorApplication.listProjectMembers({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/creator/projects/") &&
          pathname.endsWith("/members")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as {
            phone?: string | null;
            role?: "producer" | "creator" | "viewer" | null;
            note?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.createProjectMember({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              body,
              now: new Date(),
            }),
          );
        }

        const projectMemberMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/members\/([^/]+)$/);
        if (request.method === "PATCH" && projectMemberMatch) {
          const projectId = decodeURIComponent(projectMemberMatch[1] ?? "");
          const memberId = decodeURIComponent(projectMemberMatch[2] ?? "");
          const body = (await readJsonBody(request)) as {
            role?: "producer" | "creator" | "viewer" | null;
            note?: string | null;
            status?: "active" | "disabled" | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateProjectMember({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              memberId,
              body,
              now: new Date(),
            }),
          );
        }

        const projectTeamDashboardExportMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/team-dashboard\/export$/);
        if (request.method === "GET" && projectTeamDashboardExportMatch) {
          const projectId = decodeURIComponent(projectTeamDashboardExportMatch[1] ?? "");
          const memberResponse = await creatorApplication.listProjectMembers({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId,
            now: new Date(),
          });
          if (memberResponse.status !== 200) {
            return writeJson(response, memberResponse);
          }
          const statsResponse = await creatorApplication.getProjectStats({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            projectId,
            now: new Date(),
          });
          if (statsResponse.status !== 200) {
            return writeJson(response, statsResponse);
          }
          const queryUrl = new URL(request.url ?? "/", "http://127.0.0.1");
          const roleFilter = queryUrl.searchParams.get("role") ?? "all";
          const statusFilter = queryUrl.searchParams.get("status") ?? "all";
          const dashboardTab = queryUrl.searchParams.get("tab") ?? "member-consumption";
          const dateShortcut = queryUrl.searchParams.get("dateShortcut") ?? "今天";
          const members = Array.isArray((memberResponse.body as Record<string, unknown>).members)
            ? ((memberResponse.body as Record<string, unknown>).members as Array<Record<string, unknown>>)
            : [];
          const filteredMembers = members.filter((member) => {
            if (roleFilter !== "all" && String(member.role ?? "") !== roleFilter) {
              return false;
            }
            if (statusFilter !== "all" && String(member.status ?? "") !== statusFilter) {
              return false;
            }
            return true;
          });
          const stats = ((statsResponse.body as Record<string, unknown>).stats ?? {}) as Record<string, unknown>;
          const rows = [
            ["tab", "dateShortcut", "phone", "role", "status", "creditQuota", "projectScope", "memberGroup", "note"],
            ...filteredMembers.map((member) => [
              dashboardTab,
              dateShortcut,
              String(member.phone ?? ""),
              String(member.role ?? ""),
              String(member.status ?? ""),
              String(member.creditQuota ?? member.consumedCredits ?? ""),
              String(member.projectScope ?? ""),
              String(member.memberGroup ?? ""),
              String(member.note ?? ""),
            ]),
            [],
            ["memberCount", "episodeCount", "generatedVideoCount", "generatedImageCount", "assetCount", "exportCount"],
            [
              String(stats.memberCount ?? 0),
              String(stats.episodeCount ?? 0),
              String(stats.generatedVideoCount ?? 0),
              String(stats.generatedImageCount ?? 0),
              String(stats.assetCount ?? 0),
              String(stats.exportCount ?? 0),
            ],
          ];
          const csv = rows
            .map((row) =>
              row
                .map((cell) => `"${String(cell ?? "").replaceAll(`"`, `""`)}"`)
                .join(","))
            .join("\n");
          return writeText(response, {
            status: 200,
            contentType: "text/csv; charset=utf-8",
            fileName: `team-dashboard-${projectId}.csv`,
            body: csv,
          });
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/creator/projects/") &&
          pathname.endsWith("/stats")
        ) {
          const projectId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          return writeJson(
            response,
            await creatorApplication.getProjectStats({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              projectId,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/episodes") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            title?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.createEpisode({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "PATCH" && pathname === "/api/creator/episodes") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            episodeId?: string | null;
            title?: string | null;
            status?: "draft" | "ready" | "archived" | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateEpisode({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "DELETE" && pathname === "/api/creator/episodes") {
          const body = (await readJsonBody(request)) as {
            projectId?: string | null;
            episodeId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.deleteEpisode({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/generate") {
          const body = (await readJsonBody(request)) as {
            kind: "character" | "scene" | "prop" | "image" | "video";
            name?: string | null;
            prompt?: string | null;
            model?: string | null;
            width?: number | null;
            height?: number | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname.startsWith("/api/creator/assets/versions/")) {
          const assetId = pathname.split("/").at(-1) ?? "";
          return writeJson(
            response,
            await creatorApplication.listAssetVersions({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              assetId,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/confirm-all") {
          return writeJson(
            response,
            await creatorApplication.confirmAllAssets({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/confirm") {
          const body = (await readJsonBody(request)) as {
            group: "character" | "scene" | "prop";
            assetKey: string;
          };
          return writeJson(
            response,
            await creatorApplication.confirmAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/assets/update-label") {
          const body = (await readJsonBody(request)) as {
            group: "character" | "scene" | "prop";
            assetKey: string;
            label: string;
          };
          return writeJson(
            response,
            await creatorApplication.updateAssetLabel({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/run") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          return writeJson(
            response,
            await creatorApplication.runCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/skip") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            reason: string;
          };
          return writeJson(
            response,
            await creatorApplication.skipCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/calibration/override") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            reason?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.overrideCalibration({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            title?: string | null;
            description?: string | null;
            episodeId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.createShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "PATCH" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            shotId: string;
            title?: string | null;
            description?: string | null;
            currentImageAssetVersionId?: string | null;
            currentVideoAssetVersionId?: string | null;
          };
          return writeJson(
            response,
            await creatorApplication.updateShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "DELETE" && pathname === "/api/creator/shots") {
          const body = (await readJsonBody(request)) as {
            shotId: string;
          };
          return writeJson(
            response,
            await creatorApplication.deleteShot({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/shots/reorder") {
          const body = (await readJsonBody(request)) as {
            shotIds: string[];
          };
          return writeJson(
            response,
            await creatorApplication.reorderShots({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.endsWith("/media/import")
        ) {
          const shotId = decodeURIComponent(pathname.split("/").at(-3) ?? "");
          const body = (await readJsonBody(request)) as {
            kind: "image" | "video";
            name?: string | null;
            uploadSessionId?: string | null;
            storageObjectId?: string | null;
            storageObjectKey?: string | null;
            sourceUrl?: string | null;
            mimeType?: string | null;
            width?: number | null;
            height?: number | null;
            durationMs?: number | null;
          };
          return writeJson(
            response,
            await creatorApplication.importShotMedia({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { ...body, shotId },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.includes("/media/") &&
          !pathname.endsWith("/media/import")
        ) {
          const shotId = decodeURIComponent(pathname.split("/").at(-3) ?? "");
          const assetVersionId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const kindParam = url.searchParams.get("kind");
          const kind = kindParam === "image" ? "image" : "video";
          return writeJson(
            response,
            await creatorApplication.deleteShotMedia({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { shotId, kind, assetVersionId },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "DELETE" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.endsWith("/media")
        ) {
          const shotId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as {
            kind: "image" | "video";
            assetVersionId: string;
          };
          return writeJson(
            response,
            await creatorApplication.deleteShotMedia({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { ...body, shotId },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.endsWith("/references")
        ) {
          const shotId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const body = (await readJsonBody(request)) as {
            items?: Array<{
              role: string;
              assetId: string;
              assetVersionId?: string | null;
              sortOrder?: number | null;
            }> | null;
          };
          return writeJson(
            response,
            await creatorApplication.replaceShotReferences({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { shotId, items: body.items ?? [] },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/images/generate") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            shotId?: string | null;
            promptOverride?: string | null;
            model?: string | null;
            parameters?: Record<string, unknown> | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateImages({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.endsWith("/image/retry")
        ) {
          const shotId = pathname.split("/").at(-3) ?? "";
          return writeJson(
            response,
            await creatorApplication.retryShotImage({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { shotId },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/videos/generate") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            shotId?: string | null;
            motionPrompt?: string | null;
            model?: string | null;
            parameters?: Record<string, unknown> | null;
            audioEnabled?: boolean | null;
            musicEnabled?: boolean | null;
            lipSyncEnabled?: boolean | null;
          };
          return writeJson(
            response,
            await creatorApplication.generateVideos({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname.startsWith("/api/creator/shots/") &&
          pathname.endsWith("/video/retry")
        ) {
          const shotId = pathname.split("/").at(-3) ?? "";
          return writeJson(
            response,
            await creatorApplication.retryShotVideo({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: { shotId },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/export/preview") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          return writeJson(
            response,
            await creatorApplication.previewExport({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/export/history") {
          return writeJson(
            response,
            await creatorApplication.listExportHistory({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }
      }

      if (pathname.startsWith("/api/admin/ops/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        const adminOps = createAdminOpsService({
          db,
          workspaceId: devWorkspaceId,
        });

        if (request.method === "GET" && pathname === "/api/admin/ops/items") {
          return writeJson(
            response,
            await adminOps.listItems({
              user: { sessionToken: authenticated.sessionToken },
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname === "/api/admin/ops/generation-queues"
        ) {
          const authorized = await adminOps.listItems({
            user: { sessionToken: authenticated.sessionToken },
            now: new Date(),
          });
          if (authorized.status !== 200) {
            return writeJson(response, authorized);
          }

          const queueHealth = createBullMQGenerationQueueHealthService(
            loadGenerationQueueConfig(runtimeEnv),
          );
          let healthSnapshot: Awaited<ReturnType<typeof queueHealth.inspect>>;
          try {
            healthSnapshot = await queueHealth.inspect();
          } finally {
            await queueHealth.close().catch(() => undefined);
          }
          return writeJson(response, {
            status: 200,
            body: healthSnapshot,
          });
        }

        if (
          request.method === "POST" &&
          pathname === "/api/admin/ops/generation-queues/jobs"
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            queueName?: string;
            jobId?: string;
            action?: GenerationQueueJobAction;
            reason?: string;
          };
          const reason = body.reason?.trim() ?? "";
          if (!reason) {
            return writeJson(response, {
              status: 400,
              body: { error: "reason_required" },
            });
          }

          try {
            const operated = await runIdempotentCommand({
              db,
              operationName: operationNames.opsGenerationQueueJobOperate,
              capability: capabilities.opsSettle,
              idempotencyKey,
              requestHash: hashJson({
                queueName: body.queueName,
                jobId: body.jobId,
                action: body.action,
                reason,
              }),
              now: new Date(),
              resolveActor: (commandDb) =>
                resolveActorContext(commandDb, {
                  sessionToken: authenticated.sessionToken,
                  workspaceId: devWorkspaceId,
                  capability: capabilities.opsSettle,
                  now: new Date(),
                }),
              replay: async ({ idempotencyRecord }) => {
                if (!idempotencyRecord.responseSnapshot) {
                  throw new IdempotencyProcessingError(idempotencyRecord);
                }
                return idempotencyRecord.responseSnapshot;
              },
              execute: async () => {
                const queueJobOps =
                  options.generationQueueJobOpsService ??
                  createBullMQGenerationQueueJobOpsService(
                    loadGenerationQueueConfig(runtimeEnv),
                  );
                const queueResult = await queueJobOps.operate({
                  queueName: body.queueName ?? "",
                  jobId: body.jobId ?? "",
                  action: body.action ?? "retry",
                });
                if (queueResult.status !== 200) {
                  throw new GenerationQueueJobOpsRouteError(queueResult);
                }

                const operationId = randomUUID();
                return {
                  result: queueResult.body,
                  responseResourceType: "generation_queue_job",
                  responseResourceId: operationId,
                  responseSnapshot: queueResult.body,
                  audit: {
                    eventType: "ops.generation_queue_job_operated",
                    targetType: "generation_queue_job",
                    targetId: operationId,
                    workspaceId: devWorkspaceId,
                    reason,
                    sensitive: true,
                    metadata: queueResult.body,
                  },
                };
              },
            });

            return writeJson(response, {
              status: 200,
              body: operated.result,
            });
          } catch (error) {
            if (error instanceof GenerationQueueJobOpsRouteError) {
              return writeJson(response, error.response);
            }
            if (error instanceof AuthorizationError) {
              return writeJson(response, {
                status: error.code === "unauthenticated" ? 401 : 403,
                body: { error: "ops_forbidden" },
              });
            }
            if (error instanceof IdempotencyConflictError) {
              return writeJson(response, {
                status: 409,
                body: { error: error.code },
              });
            }
            if (error instanceof IdempotencyProcessingError) {
              return writeJson(response, {
                status: 202,
                body: { error: error.code },
              });
            }
            throw error;
          }
        }

        if (
          request.method === "POST" &&
          pathname === "/api/admin/ops/tasks/manual-settle"
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            taskId: string;
            decision: "consume" | "release" | "mark_abnormal_cost";
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.manualSettleTask({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/admin/ops/tasks/retry") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            taskId: string;
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.retryTask({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/admin/ops/tasks/retry-finalize") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            taskId: string;
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.retryFinalize({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/admin/ops/tasks/retry-persist-asset") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            taskId: string;
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.retryPersistAsset({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname === "/api/admin/ops/payment-risks/mark-reviewed"
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            riskEventId: string;
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.markPaymentRiskReviewed({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname === "/api/admin/ops/payments/repair-paid-without-credit"
        ) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            orderId: string;
            reason: string;
          };
          return writeJson(
            response,
            await adminOps.repairPaidWithoutCredit({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }
      }

      if (request.method === "GET") {
        return await serveStatic(pathname, response);
      }

      response.statusCode = 404;
      response.end("Not Found");
    } catch (error) {
      if (writeKnownError(response, error)) {
        return;
      }

      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "internal_error",
        }),
      );
    }
  });

  async function runScheduledRepair() {
    if (repairSchedulerRunning) {
      return;
    }
    repairSchedulerRunning = true;
    try {
      const db = await dbPromise;
      await runCreatorRepairMaintenance(db, {
        runtime: storageRuntime,
        now: new Date(),
        limit: repairSchedulerOptions.limit,
      });
    } catch (error) {
      console.warn(
        `[storage] Scheduled repair failed. ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      repairSchedulerRunning = false;
    }
  }

  function startRepairScheduler() {
    if (!repairSchedulerOptions.enabled || repairSchedulerTimer) {
      return;
    }
    repairSchedulerTimer = setInterval(() => {
      void runScheduledRepair();
    }, repairSchedulerOptions.intervalMs);
    repairSchedulerTimer.unref?.();
  }

  function stopRepairScheduler() {
    if (!repairSchedulerTimer) {
      return;
    }
    clearInterval(repairSchedulerTimer);
    repairSchedulerTimer = null;
  }

  return {
    origin: "http://127.0.0.1:0",
    async listen(port: number) {
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, "127.0.0.1", () => resolve());
      });

      const address = httpServer.address();

      if (!address || typeof address === "string") {
        throw new Error("server_address_unavailable");
      }

      this.origin = `http://127.0.0.1:${address.port}`;
      startRepairScheduler();
    },
    async close() {
      stopRepairScheduler();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
      }

      const db = resolvedDb;
      if (db && "close" in db && typeof db.close === "function") {
        await db.close();
      }
    },
  };
}

export type { Server };

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createPhoneAuthDevServer();
  const port = Number(process.env.PORT ?? "4310");

  server
    .listen(port)
    .then(() => {
      console.log(`Phone auth dev server listening on ${server.origin}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
