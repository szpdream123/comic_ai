import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import net from "node:net";
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import mammoth from "mammoth";

import { maskCnPhone, shanghaiDayWindow, shanghaiMonthWindow } from "../modules/identity/phone-auth.utils.ts";
import { appendAuditEvent } from "../modules/audit/audit.service.ts";
import {
  createAdminAuthService,
  type AdminPermission,
  permissionsForRoles,
} from "../modules/admin-auth/admin-auth.service.ts";
import { createAdminDashboardService } from "../modules/admin-dashboard/admin-dashboard.service.ts";
import { createAdminModelConfigService } from "../modules/admin-models/admin-model-config.service.ts";
import {
  createAdminOpsService,
  listAdminOpsItemsForScope,
} from "../modules/admin-ops/admin-ops.service.ts";
import { createAdminRiskAuditService } from "../modules/admin-risk-audit/admin-risk-audit.service.ts";
import {
  createAdminStoryboardPromptService,
  ensureDefaultStoryboardPromptData,
} from "../modules/admin-storyboard-prompts/admin-storyboard-prompt.service.ts";
import { createAnnouncementService } from "../modules/announcements/announcement.service.ts";
import { createAdminCharacterPromptService, ensureDefaultCharacterPromptTemplates } from "../modules/admin-character-prompts/admin-character-prompt.service.ts";
import { createAdminImagePromptService } from "../modules/admin-image-prompts/admin-image-prompt.service.ts";
import { createAdminShotPromptService, ensureDefaultShotPromptTemplates } from "../modules/admin-shot-prompts/admin-shot-prompt.service.ts";
import { createAdminScenePromptService, ensureDefaultScenePromptTemplates } from "../modules/admin-scene-prompts/admin-scene-prompt.service.ts";
import { createAdminPropPromptService, ensureDefaultPropPromptTemplates } from "../modules/admin-scene-prompts/admin-prop-prompt.service.ts";
import {
  createAiStoryboardPreviewService,
  createTextModelChatGateway,
  type TextChatGatewayLike,
} from "../modules/ai-storyboard/ai-storyboard-preview.service.ts";
import { createAiScriptAnalysisService } from "../modules/ai-storyboard/ai-script-analysis.service.ts";
import { createAdminSystemSettingsService } from "../modules/admin-system-settings/admin-system-settings.service.ts";
import { readBatchImagePromptPresetCategoriesFromDb } from "../modules/admin-system-settings/admin-system-settings.service.ts";
import { createAdminUserService } from "../modules/admin-users/admin-user.service.ts";
import { createMembershipOrderService } from "../modules/membership/membership-order.service.ts";
import { createMembershipPlanService } from "../modules/membership/membership-plan.service.ts";
import { resolveMembershipGenerationPriority } from "../modules/membership/membership-priority.service.ts";
import {
  createCommercePaymentService,
  ensureDefaultCreditPackage,
} from "../modules/commerce-payment/commerce-payment.service.ts";
import { createCreditPackageService } from "../modules/commerce-payment/credit-package.service.ts";
import { dispatchPaymentOutboxBatch } from "../modules/commerce-payment/payment-outbox.dispatcher.ts";
import {
  createEnvPaymentProviderRegistry,
  isPaymentProvider,
  type PaymentProvider,
} from "../modules/commerce-payment/payment-provider-adapter.ts";
import {
  findPersistentAuthSessionByToken,
  requestPersistentLoginCode,
  revokePersistentAuthSession,
  verifyPersistentPasswordLogin,
  verifyPersistentTeamMemberPasswordLogin,
  verifyPersistentLoginChallenge,
} from "../modules/identity/persistent-auth.service.ts";
import { createInviteRewardAdminService } from "../modules/invite-rewards/invite-reward-admin.service.ts";
import {
  bindInviteForNewUser,
  grantNewUserBenefits,
} from "../modules/invite-rewards/invite-reward.service.ts";
import { createAuthSession, type AuthSession } from "../modules/identity/session.service.ts";
import { createSmsProviderFromEnv } from "../modules/identity/sms-provider.ts";
import {
  createAuthSessionCacheFromEnv,
  type AuthSessionCache,
} from "../modules/identity/auth-session-cache.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
  verifyTeamCredential,
} from "../modules/identity/team-account-credentials.service.ts";
import { CreatorDevApp } from "../modules/project/creator-dev-app.ts";
import {
  createCreatorApplication,
} from "../modules/project/creator-application.service.ts";
import {
  attachCanvasTaskResultToHistory,
  canvasErrorToStatus,
  CanvasConflictError,
  CanvasDocumentError,
  createCanvasNodeRun,
  findCanvasByCanvasProjectId,
  getOrCreateProjectCanvas,
  listCanvasNodeRuns,
  markCanvasNodeRunQueued,
  saveCanvasByCanvasProjectId,
  saveProjectCanvas,
  selectCanvasNodeArtifact,
} from "../modules/project/creator-canvas-record.service.ts";
import { CanvasValidationError } from "../modules/project/creator-canvas-validation.ts";
import {
  completeProjectUploadRecord,
  createProjectUploadRecord,
} from "../modules/project/project-upload-record.service.ts";
import { createEpisodeForProject, listEpisodesForProject } from "../modules/project/episode-record.service.ts";
import {
  assertCapability,
  AuthorizationError,
  type ActorContext,
  resolveActorContext,
} from "../modules/organization/actor-context.service.ts";
import {
  userCompatibilityScope,
  userCompatibilityScopeCandidates,
  userProjectCompatibilityWorkspaceId,
  userProjectCompatibilityWorkspaceIdCandidates,
} from "../modules/organization/user-compatibility-scope.service.ts";
import { queryOne, type SqlDatabase } from "../modules/shared/db/sql.ts";
import { createDevDb, runWithDatabaseContext } from "../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../modules/shared/db/test-db.ts";
import { beginOrReplayCommand, IdempotencyConflictError, IdempotencyProcessingError, type IdempotencyRecord } from "../modules/shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../modules/shared/idempotency/persistent-idempotency.store.ts";
import { createLocalUploadStore } from "../modules/shared/uploads/upload-store.ts";
import { createStorageAdapterFromEnv } from "../modules/storage/storage-adapter.factory.ts";
import {
  buildSignedObjectUrls,
  createScopedStorageObject,
  deleteStorageObjectRecord,
  findStorageObject,
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
  getUploadSessionStatus,
  runStorageRepairJob,
  StorageCredentialError,
  type UploadSessionRuntime,
} from "../modules/storage/upload-session.service.ts";
import { createAssetVersionSnapshot } from "../modules/project/asset-version-record.service.ts";
import {
  createOfficialAssetAdminService,
  OfficialAssetAdminValidationError,
} from "../modules/project/official-asset-admin.service.ts";
import {
  buildAssetConversationEntries,
  deleteAssetConversationTurn,
  findAssetConversationThread,
  listAssetConversationEntrySummaries,
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
import { InsufficientCreditsError, grantCreditsInTransaction, reserveCredits, settleReservationAllocation } from "../modules/credit-billing/credit-ledger.service.ts";
import {
  MembershipCreditGateError,
  verifyMembershipAndConsumeCredits,
} from "../modules/credit-billing/membership-credit-gate.service.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../modules/workflow-task/workflow-task.service.ts";
import { createProviderAdapterFromModelConfig } from "../modules/model-gateway/provider-adapter.factory.ts";
import { translateProviderErrorMessage } from "../modules/model-gateway/provider-error-message.ts";
import { SeedanceVideoProviderAdapter } from "../modules/model-gateway/seedance-video.provider-adapter.ts";
import { OpenAICompatibleTextAdapter } from "../modules/model-gateway/openai-compatible-text.adapter.ts";
import { TextModelGatewayService } from "../modules/model-gateway/text-model-gateway.service.ts";
import {
  createOrReuseProviderRequest,
  markProviderRequestFailed,
  markProviderRequestSucceeded,
  submitProviderRequest,
} from "../modules/model-gateway/provider-request.service.ts";
import {
  completeUserModelRequestLog,
  createUserModelRequestLog,
} from "../modules/model-gateway/user-model-request-log.service.ts";
import {
  findActiveAiModelConfigByCode,
  findActiveAiModelDispatchPolicyByModelCode,
  listActiveAiModelConfigs,
  type AiModelConfigRecord,
} from "../modules/model-catalog/ai-model-config.store.ts";
import {
  GenerationModelExecutionResolutionError,
  resolveGenerationModelExecution,
} from "../modules/model-catalog/generation-model-execution.resolver.ts";
import {
  GenerationModelRequestValidationError,
  validateGenerationModelRequest,
} from "../modules/model-catalog/generation-model-request.validator.ts";
import {
  appendGenerationTaskCreatedOutboxEvent,
  appendGenerationTaskFinalizeRequestedOutboxEvent,
} from "../modules/model-gateway/generation-outbox.service.ts";
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
const adminRoot = join(process.cwd(), "apps", "admin");
const nodeModulesRoot = join(process.cwd(), "node_modules");
const uploadRoot = resolve(process.cwd(), ".local", "creator-uploads");
const episodeEventLogPath = resolve(process.cwd(), ".local", "episode-workbench-events.jsonl");
const vendorRoot = join(process.cwd(), "node_modules");
const devOrganizationId = "10000000-0000-4000-8000-000000000001";
const devWorkspaceId = "20000000-0000-4000-8000-000000000001";

type LingxiCommunityItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  author: string;
  createdAt: string;
  createdAtLabel: string;
  votes?: number;
  promptMeta?: Record<string, unknown> | null;
};
const devPaymentCallbackSecret = "dev-payment-secret";
const imageGenerationTaskTimeoutMs = 15 * 60 * 1000;
const videoGenerationTaskTimeoutMs = 3 * 60 * 60 * 1000;
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
    recommendedMaxDurationSeconds: 3 * 60 * 60,
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
const scriptDocumentUploadLimits = {
  document: {
    label: "剧本文档",
    maxBytes: 30 * 1024 * 1024,
    mimeTypes: [
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/octet-stream",
    ],
    extensions: [".txt", ".docx"],
  },
  blockedExtensions: episodeUploadLimits.blockedExtensions.filter(
    (extension) => ![".txt", ".docx"].includes(extension),
  ),
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
  ".ttf": "font/ttf",
  ".xml": "application/xml; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
}

interface WeChatLoginConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

interface WeChatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
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

class GenerationMembershipRequiredError extends Error {
  readonly code = "generation_membership_required";

  constructor() {
    super("有效会员已过期或未开通，请先开通会员。");
  }
}

interface AuthenticatedUser {
  id: string;
  phone: string | null;
  displayName?: string | null;
  actorType?: "user" | "team_member";
  teamMember?: {
    id: string;
    memberAccount: string;
    memberLoginAccount: string;
    memberName: string;
    memberCredits: number;
  } | null;
  creditBalance: number;
  displayCreditBalance: number;
  availableCredits: number;
  reservedCredits: number;
  frozenCredits: number;
  creditFrozenAt: string | null;
  creditFrozenUntil: string | null;
}

interface DevTenantScope {
  organizationId: string;
  workspaceId: string;
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
  textChatGateway?: TextChatGatewayLike;
  allowProduction?: boolean;
  allowLocalDatabaseUrl?: boolean;
  listenHost?: string;
  authSessionCache?: AuthSessionCache;
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

const defaultSessionCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

function sessionCookie(token: string, maxAgeSeconds = defaultSessionCookieMaxAgeSeconds): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function sessionCookieMaxAgeSecondsFromSession(expiresAt: Date, now: Date): number {
  return Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 1000));
}

function clearSessionCookie(): string {
  return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

function redirectWithSessionCookie(
  response: ServerResponse,
  location: string,
  token: string,
) {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.setHeader("set-cookie", sessionCookie(token));
  response.end();
}

function redirect(response: ServerResponse, location: string) {
  response.statusCode = 302;
  response.setHeader("location", location);
  response.end();
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

function uuidFromIdempotencyKey(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function objectBody(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeMembershipTier(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["experience", "professional"].includes(normalized) ? normalized : normalized;
}

function normalizeMembershipPeriodUnit(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["day", "month", "quarter", "year"].includes(normalized) ? normalized : normalized;
}

function normalizeMembershipPlanStatus(value: unknown) {
  const normalized = String(value ?? "active").trim().toLowerCase();
  return ["active", "inactive", "archived"].includes(normalized) ? normalized : normalized;
}

function normalizeAnnouncementStatus(value: unknown) {
  const normalized = String(value ?? "active").trim().toLowerCase();
  return ["active", "inactive", "archived"].includes(normalized) ? normalized : normalized;
}

function hasOwn(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function storyboardPromptPackageBody(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    package_type: String(body.package_type ?? ""),
    prompt_content: String(body.prompt_content ?? ""),
  };
  if (hasOwn(body, "audience")) result.audience = body.audience === null ? null : String(body.audience ?? "");
  if (hasOwn(body, "tags")) result.tags = stringArray(body.tags);
  if (hasOwn(body, "cover_image_url")) result.cover_image_url = body.cover_image_url === null ? null : String(body.cover_image_url ?? "");
  if (hasOwn(body, "key_points")) result.key_points = stringArray(body.key_points);
  if (hasOwn(body, "negative_prompt")) result.negative_prompt = body.negative_prompt === null ? null : String(body.negative_prompt ?? "");
  if (hasOwn(body, "applicable_genres")) result.applicable_genres = stringArray(body.applicable_genres);
  if (hasOwn(body, "applicable_scene")) result.applicable_scene = stringArray(body.applicable_scene);
  if (hasOwn(body, "output_type")) result.output_type = body.output_type === null ? null : String(body.output_type ?? "");
  if (hasOwn(body, "scope")) result.scope = body.scope && typeof body.scope === "object" && !Array.isArray(body.scope) ? body.scope as Record<string, unknown> : {};
  if (hasOwn(body, "can_stack")) result.can_stack = Boolean(body.can_stack);
  if (hasOwn(body, "max_select_count")) result.max_select_count = body.max_select_count === null ? null : Number(body.max_select_count);
  if (hasOwn(body, "is_default") || hasOwn(body, "isDefault")) result.is_default = Boolean(body.is_default ?? body.isDefault);
  if (hasOwn(body, "is_global_default") || hasOwn(body, "isGlobalDefault")) result.is_global_default = Boolean(body.is_global_default ?? body.isGlobalDefault);
  if (hasOwn(body, "is_recommended") || hasOwn(body, "isRecommended")) result.is_recommended = Boolean(body.is_recommended ?? body.isRecommended);
  if (hasOwn(body, "sort_order") || hasOwn(body, "sortOrder")) result.sort_order = Number(body.sort_order ?? body.sortOrder ?? 0);
  if (hasOwn(body, "status")) result.status = String(body.status ?? "enabled");
  if (hasOwn(body, "remark")) result.remark = body.remark === null ? null : String(body.remark ?? "");
  return result;
}

function imagePromptStyleBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    category: String(body.category ?? "official"),
    model_family: String(body.model_family ?? body.modelFamily ?? "doubao"),
    tags: stringArray(body.tags),
    cover_image_url: body.cover_image_url === undefined || body.cover_image_url === null ? null : String(body.cover_image_url),
    prompt_content: String(body.prompt_content ?? body.promptContent ?? ""),
    negative_prompt: body.negative_prompt === undefined || body.negative_prompt === null ? null : String(body.negative_prompt),
    is_default: Boolean(body.is_default ?? body.isDefault),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
    status: String(body.status ?? "enabled"),
    remark: body.remark === undefined || body.remark === null ? null : String(body.remark),
  };
}

function scenePromptTemplateBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    stage: String(body.stage ?? "detail"),
    model_family: String(body.model_family ?? body.modelFamily ?? "general"),
    tags: stringArray(body.tags),
    variables: stringArray(body.variables),
    json_schema: String(body.json_schema ?? body.jsonSchema ?? ""),
    prompt_content: String(body.prompt_content ?? body.promptContent ?? ""),
    negative_prompt: body.negative_prompt === undefined || body.negative_prompt === null ? null : String(body.negative_prompt),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
    status: String(body.status ?? "enabled"),
    is_default: Boolean(body.is_default ?? body.isDefault),
    remark: body.remark === undefined || body.remark === null ? null : String(body.remark),
  };
}

function propPromptTemplateBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    stage: String(body.stage ?? "extract"),
    model_family: String(body.model_family ?? body.modelFamily ?? "general"),
    tags: stringArray(body.tags),
    variables: stringArray(body.variables),
    json_schema: String(body.json_schema ?? body.jsonSchema ?? ""),
    prompt_content: String(body.prompt_content ?? body.promptContent ?? ""),
    negative_prompt: body.negative_prompt === undefined || body.negative_prompt === null ? null : String(body.negative_prompt),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
    status: String(body.status ?? "enabled"),
    is_default: Boolean(body.is_default ?? body.isDefault),
    remark: body.remark === undefined || body.remark === null ? null : String(body.remark),
  };
}

function shotPromptTemplateBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    stage: String(body.stage ?? "outline"),
    model_family: String(body.model_family ?? body.modelFamily ?? "general"),
    tags: stringArray(body.tags),
    variables: stringArray(body.variables),
    json_schema: String(body.json_schema ?? body.jsonSchema ?? ""),
    prompt_content: String(body.prompt_content ?? body.promptContent ?? ""),
    negative_prompt: body.negative_prompt === undefined || body.negative_prompt === null ? null : String(body.negative_prompt),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
    status: String(body.status ?? "enabled"),
    is_default: Boolean(body.is_default ?? body.isDefault),
    remark: body.remark === undefined || body.remark === null ? null : String(body.remark),
  };
}

function characterPromptTemplateBody(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? ""),
    code: String(body.code ?? ""),
    stage: String(body.stage ?? "extract"),
    model_family: String(body.model_family ?? body.modelFamily ?? "general"),
    tags: stringArray(body.tags),
    variables: stringArray(body.variables),
    chunk_min_chars: Number(body.chunk_min_chars ?? body.chunkMinChars ?? 0),
    chunk_max_chars: Number(body.chunk_max_chars ?? body.chunkMaxChars ?? 0),
    overlap_chars: Number(body.overlap_chars ?? body.overlapChars ?? 0),
    json_schema: body.json_schema === undefined || body.json_schema === null ? null : String(body.json_schema),
    prompt_content: String(body.prompt_content ?? body.promptContent ?? ""),
    is_default: Boolean(body.is_default ?? body.isDefault),
    sort_order: Number(body.sort_order ?? body.sortOrder ?? 0),
    status: String(body.status ?? "enabled"),
    remark: body.remark === undefined || body.remark === null ? null : String(body.remark),
  };
}

function storyboardPromptComposeBody(body: Record<string, unknown>) {
  return {
    base_prompt: String(body.base_prompt ?? ""),
    genre_package_id: String(body.genre_package_id ?? ""),
    emotion_package_ids: stringArray(body.emotion_package_ids),
    camera_package_ids: stringArray(body.camera_package_ids),
    output_package_id: String(body.output_package_id ?? ""),
    taboo_package_ids: stringArray(body.taboo_package_ids),
    variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)
      ? body.variables as Record<string, unknown>
      : {},
    extra_request: String(body.extra_request ?? ""),
  };
}

async function requireAdminRouteSession(input: {
  db: Awaited<ReturnType<typeof createDevDb>>;
  cookieHeader?: string;
  requiredRoles?: string[];
  requiredPermissions?: AdminPermission[];
}): Promise<
  | {
      ok: true;
      session: {
        id: string;
        admin_account_id: string;
        login_name: string;
        display_name: string;
        status: string;
        expires_at: Date | string;
      };
      roles: string[];
      permissions: AdminPermission[];
    }
  | { ok: false; response: AuthHttpResponse<unknown> }
> {
  const adminAuth = createAdminAuthService({
    db: input.db,
    organizationId: devOrganizationId,
    workspaceId: devWorkspaceId,
  });
  const session = await adminAuth.resolveSession(
    parseCookies(input.cookieHeader).admin_session,
    new Date(),
  );
  if (!session) {
    return {
      ok: false,
      response: {
        status: 401,
        body: { error: { code: "admin_unauthenticated", message: "管理员登录已过期，请重新登录。" } },
      },
    };
  }

  const requiredRoles = input.requiredRoles ?? [];
  const roles = await listAdminRoles(input.db, session.admin_account_id);
  const permissions = permissionsForRoles(roles);
  if (requiredRoles.length > 0 && !requiredRoles.some((role) => roles.includes(role))) {
    return {
      ok: false,
      response: {
        status: 403,
        body: { error: { code: "admin_forbidden", message: "当前管理员账号没有操作权限。" } },
      },
    };
  }
  const requiredPermissions = input.requiredPermissions ?? [];
  if (
    requiredPermissions.length > 0 &&
    !requiredPermissions.every((permission) => permissions.includes(permission))
  ) {
    return {
      ok: false,
      response: {
        status: 403,
        body: { error: { code: "admin_forbidden", message: "当前管理员账号没有操作权限。" } },
      },
    };
  }

  return { ok: true, session, roles, permissions };
}

async function listAdminRoles(
  db: Awaited<ReturnType<typeof createDevDb>>,
  adminAccountId: string,
) {
  const result = await db.query<{ role_code: string }>(
    `
      SELECT role_code
      FROM admin_account_roles
      WHERE admin_account_id = $1
      ORDER BY role_code ASC
    `,
    [adminAccountId],
  );
  return result.rows.map((row) => row.role_code);
}

async function resolveAdminOpsBridgeActor(
  db: Awaited<ReturnType<typeof createDevDb>>,
): Promise<ActorContext> {
  const row = await queryOne<{ user_id: string }>(
    db,
    `
      SELECT user_id
      FROM memberships
      WHERE organization_id = $1
        AND workspace_id = $2
        AND role = 'owner_admin'
        AND status = 'active'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [devOrganizationId, devWorkspaceId],
  );
  if (!row) {
    throw new AuthorizationError("membership_missing");
  }
  return {
    actorId: row.user_id,
    organizationId: devOrganizationId,
    workspaceId: devWorkspaceId,
    role: "owner_admin",
    capabilities: [capabilities.opsSettle],
  };
}

const adminRouteRoles = {
  modelWrite: ["super_admin", "model_admin"],
  modelPublish: ["super_admin", "model_admin"],
  userWrite: ["super_admin", "support_admin"],
  creditAdjust: ["super_admin", "finance_admin", "support_admin"],
  riskReview: ["super_admin", "finance_admin"],
  riskExport: ["super_admin"],
  opsTaskRetry: ["super_admin", "ops_admin"],
  storyboardPromptWrite: ["super_admin", "ops_admin"],
  storyboardPromptExport: ["super_admin"],
  membershipPlanManage: ["super_admin", "finance_admin"],
  announcementManage: ["super_admin", "ops_admin"],
} as const;

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
        ? "session expired"
        : status === 404
          ? "resource not found"
          : "permission denied";
    writeJson(response, envelopedError(status, errorCode, message, { reason: error.code }));
    return true;
  }

  if (error instanceof StorageCredentialError) {
    writeJson(response, envelopedError(503, error.code, "云存储凭证不可用，请稍后重试或联系管理员。", {
      providerCode: error.providerCode,
      providerRequestId: error.providerRequestId,
    }));
    return true;
  }

  if (error instanceof GenerationRequestValidationError) {
    writeJson(response, envelopedError(400, error.code, error.message));
    return true;
  }

  if (error instanceof GenerationModelRequestValidationError) {
    writeJson(response, envelopedError(400, error.code, error.message));
    return true;
  }

  if (error instanceof GenerationModelExecutionResolutionError) {
    writeJson(response, envelopedError(400, error.code, error.message));
    return true;
  }

  if (error instanceof MembershipCreditGateError) {
    writeJson(response, envelopedError(error.status, error.code, error.message));
    return true;
  }

  if (error instanceof OfficialAssetAdminValidationError) {
    const status = error.code === "official_asset_not_found" ? 404 : 400;
    writeJson(response, envelopedError(status, error.code, error.message));
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
      message: localizeEnvelopeErrorMessage(message),
      details,
    },
  };
}

function localizeEnvelopeErrorMessage(message: string): string {
  const value = String(message ?? "").trim();
  if (!/[A-Za-z]/.test(value)) {
    return value || "操作失败，请稍后重试。";
  }
  if (/resource not found|not found/i.test(value)) return "资源不存在或已被删除。";
  if (/permission denied|forbidden|cannot .* workspace|cannot .* projects/i.test(value)) return "当前账号没有操作权限。";
  if (/unauthenticated|session expired|log in/i.test(value)) return "登录已过期，请重新登录。";
  if (/method not allowed/i.test(value)) return "请求方法不支持。";
  if (/idempotency key required/i.test(value)) return "缺少幂等请求标识。";
  if (/request conflict|revision conflict/i.test(value)) return "请求发生冲突，请刷新后重试。";
  if (/still processing/i.test(value)) return "请求仍在处理中，请稍后刷新。";
  if (/required/i.test(value)) return "缺少必要参数，请检查后重试。";
  if (/invalid/i.test(value)) return "请求参数不合法，请检查后重试。";
  if (/upload/i.test(value)) return "上传处理失败，请检查文件后重试。";
  if (/delete/i.test(value)) return "删除失败，请稍后重试。";
  if (/database_url/i.test(value)) return "数据库连接配置缺失，请联系管理员处理。";
  if (/cloud storage/i.test(value)) return "云存储未配置，请联系管理员处理。";
  if (/default .* prompt|prompt template/i.test(value)) return "默认提示词模板缺失，请联系管理员配置。";
  if (/canvas/i.test(value)) return "画布操作失败，请刷新后重试。";
  if (/storyboard|script/i.test(value)) return "剧本或分镜处理失败，请检查内容后重试。";
  return translateProviderErrorMessage(value) || "操作失败，请稍后重试。";
}

function createDefaultLingxiCommunityBoard(): { posts: LingxiCommunityItem[]; features: LingxiCommunityItem[] } {
  return {
    posts: [
      createLingxiCommunityItem({
        id: "feedback-seed-render-waiting",
        title: "分镜生成偶尔停在等待模型接收",
        content: "希望能在任务卡片里看到当前排队原因、预计等待时间，以及一键重试入口。",
        category: "问题反馈",
        author: "灵曦体验官",
        createdAt: "2026-06-18T09:30:00.000Z",
      }),
    ],
    features: [
      {
        ...createLingxiCommunityItem({
          id: "feature-seed-batch-character-views",
          title: "批量生成角色三视图",
          content: "上传人物设定后，一次生成正面、侧面、背面，方便后续视频保持一致。",
          category: "功能建议",
          author: "创作者共创",
          createdAt: "2026-06-18T09:20:00.000Z",
        }),
        votes: 18,
      },
      {
        ...createLingxiCommunityItem({
          id: "feature-seed-shot-copy",
          title: "跨项目复用分镜模板",
          content: "常用镜头运动、字幕样式和画面比例可以保存成模板，在新项目中直接套用。",
          category: "功能建议",
          author: "灵曦体验官",
          createdAt: "2026-06-18T09:10:00.000Z",
        }),
        votes: 12,
      },
    ],
  };
}

function createLingxiCommunityItem(input: Partial<LingxiCommunityItem>): LingxiCommunityItem {
  const createdAt = input.createdAt || new Date().toISOString();
  return {
    id: input.id || randomUUID(),
    title: String(input.title || "").trim().slice(0, 80),
    content: String(input.content || "").trim().slice(0, 800),
    category: String(input.category || "问题反馈").trim().slice(0, 24),
    author: String(input.author || "灵曦用户").trim().slice(0, 40),
    createdAt,
    createdAtLabel: formatLingxiCommunityDate(createdAt),
    votes: input.votes,
  };
}

function lingxiCommunitySnapshot(board: { posts: LingxiCommunityItem[]; features: LingxiCommunityItem[] }) {
  return {
    posts: board.posts.map((item) => ({ ...item })),
    features: board.features.map((item) => ({ ...item })),
  };
}

function formatLingxiCommunityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface CanvasProjectRecord {
  id: string;
  projectId: string | null;
  title: string;
  createdAt: string;
  status: string;
  ownerUserId: string;
  organizationId: string;
  workspaceId: string;
}

interface CanvasProjectRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  status: string;
  created_by_user_id: string | null;
  created_at: Date | string;
  server_revision?: number;
  latest_document_id?: string | null;
}

const standaloneCanvasRunProjectNamePrefix = "画布生成 - ";

function formatCanvasProjectDate(now = new Date()): string {
  const date = now instanceof Date ? now : new Date(now);
  const normalized = Number.isFinite(date.getTime()) ? date : new Date();
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, "0");
  const day = String(normalized.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function normalizeCanvasProjectTitle(value: unknown, fallback = "画布项目"): string {
  return String(value ?? fallback).trim().slice(0, 50) || fallback;
}

function serializeCanvasProject(project: CanvasProjectRecord) {
  return {
    id: project.id,
    projectId: project.projectId,
    title: project.title,
    createdAt: project.createdAt,
    status: project.status,
  };
}

function canvasProjectFromRow(row: CanvasProjectRow): CanvasProjectRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: formatCanvasProjectDate(new Date(row.created_at)),
    status: row.status,
    ownerUserId: row.created_by_user_id ?? "",
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
  };
}

async function listCanvasProjects(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: { userId: string; teamMemberId?: string },
): Promise<CanvasProjectRecord[]> {
  const params: unknown[] = [input.userId];
  const ownerScopeSql = input.teamMemberId
    ? `
        AND EXISTS (
          SELECT 1
          FROM team_members member
          WHERE member.id = $2
            AND member.user_id = $1
            AND member.user_id = creator_canvas_projects.created_by_user_id
        )
      `
    : "";
  const teamMemberVisibilitySql = input.teamMemberId
    ? `
        AND EXISTS (
          SELECT 1
          FROM team_members member
          JOIN team_member_canvases visible
            ON visible.user_id = member.user_id
           AND visible.member_id = member.id
           AND visible.canvas_id = creator_canvas_projects.id
          WHERE member.id = $2
            AND member.user_id = $1
        )
      `
    : "";
  if (input.teamMemberId) {
    params.push(input.teamMemberId);
  }
  const result = await db.query<CanvasProjectRow>(
    `
      SELECT
        id,
        organization_id,
        workspace_id,
        project_id,
        title,
        status,
        created_by_user_id,
        created_at
      FROM creator_canvas_projects
      WHERE ${input.teamMemberId ? "TRUE" : "created_by_user_id = $1"}
        ${ownerScopeSql}
        AND deleted_at IS NULL
        ${teamMemberVisibilitySql}
      ORDER BY created_at DESC, id DESC
    `,
    params,
  );
  return result.rows.map(canvasProjectFromRow);
}

async function createCanvasProjectRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    workspaceId: string;
    userId: string;
    title: string;
    status: string;
    now: Date;
  },
): Promise<CanvasProjectRecord> {
  const normalizedTitle = normalizeCanvasProjectTitle(input.title);
  const row = await queryOne<CanvasProjectRow>(
    db,
    `
      INSERT INTO creator_canvas_projects (
        id,
        organization_id,
        workspace_id,
        project_id,
        title,
        status,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8)
      RETURNING id, organization_id, workspace_id, project_id, title, status, created_by_user_id, created_at
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      null,
      normalizedTitle,
      normalizeCanvasProjectStatus(input.status),
      input.userId,
      input.now,
    ],
  );
  return canvasProjectFromRow(row!);
}

async function findCanvasProjectRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: { userId: string; projectId: string; teamMemberId?: string },
): Promise<CanvasProjectRecord | null> {
  const params: unknown[] = [input.userId, input.projectId];
  if (input.teamMemberId) {
    params.push(input.teamMemberId);
  }
  const row = await queryOne<CanvasProjectRow>(
    db,
    `
      SELECT id, organization_id, workspace_id, project_id, title, status, created_by_user_id, created_at
      FROM creator_canvas_projects
      WHERE ${input.teamMemberId ? `EXISTS (
          SELECT 1
          FROM team_member_canvases visible
          WHERE visible.user_id = $1
            AND visible.member_id = $3
            AND visible.canvas_id = creator_canvas_projects.id
        )` : "created_by_user_id = $1"}
        AND id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    params,
  );
  return row ? canvasProjectFromRow(row) : null;
}

async function updateCanvasProjectRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    projectId: string;
    teamMemberId?: string;
    title?: string;
    status?: string;
    now: Date;
  },
): Promise<CanvasProjectRecord | null> {
  const params: unknown[] = [
    input.userId,
    input.projectId,
    input.title ?? null,
    input.status === undefined ? null : normalizeCanvasProjectStatus(input.status),
    input.now,
  ];
  if (input.teamMemberId) {
    params.push(input.teamMemberId);
  }
  const row = await queryOne<CanvasProjectRow>(
    db,
    `
      UPDATE creator_canvas_projects
      SET title = COALESCE($3, title),
          status = COALESCE($4, status),
          updated_by_user_id = $1,
          updated_at = $5
      WHERE ${input.teamMemberId ? `EXISTS (
          SELECT 1
          FROM team_member_canvases visible
          WHERE visible.user_id = $1
            AND visible.member_id = $6
            AND visible.canvas_id = creator_canvas_projects.id
        )` : "created_by_user_id = $1"}
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id, organization_id, workspace_id, project_id, title, status, created_by_user_id, created_at
    `,
    params,
  );
  return row ? canvasProjectFromRow(row) : null;
}

function normalizeCanvasProjectStatus(value: unknown) {
  const normalized = String(value ?? "draft").trim().toLowerCase();
  if (normalized === "草稿" || normalized === "draft") return "draft";
  if (normalized === "active" || normalized === "进行中") return "active";
  if (normalized === "archived" || normalized === "归档") return "archived";
  return "draft";
}

async function deleteCanvasProjectRecord(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: { userId: string; projectId: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `
      UPDATE creator_canvas_projects
      SET deleted_at = $3,
          updated_by_user_id = $1,
          updated_at = $3
      WHERE created_by_user_id = $1
        AND id = $2
        AND deleted_at IS NULL
    `,
    [input.userId, input.projectId, input.now],
  );
  return result.rowCount > 0;
}

export function formatNamedSseChunk(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function formatSseDataChunk(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function writeSseEvent(response: ServerResponse, event: string, data: unknown) {
  response.write(formatNamedSseChunk(event, data));
}

function writeSseData(response: ServerResponse, data: unknown) {
  response.write(formatSseDataChunk(data));
}

function startSseHeartbeat(response: ServerResponse, intervalMs = 15_000, options?: { dataOnly?: boolean }) {
  const sendPing = () => {
    const payload = { type: "ping", ts: new Date().toISOString() };
    if (options?.dataOnly) {
      writeSseData(response, payload);
      return;
    }
    writeSseEvent(response, "ping", { ts: payload.ts });
  };

  sendPing();
  const timer = setInterval(() => {
    if (!response.destroyed && !response.writableEnded) {
      sendPing();
    }
  }, intervalMs);
  response.on("close", () => clearInterval(timer));
  response.on("finish", () => clearInterval(timer));
  return () => clearInterval(timer);
}

async function retryTaskForBackendAdmin(input: {
  db: Awaited<ReturnType<typeof createDevDb>>;
  taskId: string;
  reason: string;
  idempotencyKey: string;
  actorAdminAccountId: string;
  now: Date;
}): Promise<AuthHttpResponse<unknown>> {
  const reason = input.reason.trim();
  if (!reason) {
    return {
      status: 400,
      body: { error: { code: "reason_required", message: "请输入操作原因。" } },
    };
  }

  const requestBody = { taskId: input.taskId, reason };
  await input.db.query("BEGIN");
  try {
    const store = new SqlIdempotencyRecordStore(input.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: devOrganizationId,
      operationName: operationNames.opsRetryTask,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashJson(requestBody),
    });

    if (started.kind === "replayed") {
      await input.db.query("COMMIT");
      return {
        status: 200,
        body: started.record.responseSnapshot ?? { data: { task: { id: input.taskId } } },
      };
    }
    if (started.kind === "processing") {
      throw new IdempotencyProcessingError(started.record);
    }

    const task = await queryOne<{
      id: string;
      organization_id: string;
      workspace_id: string;
      workflow_id: string;
      task_type: string;
      status: string;
      queue_name: string;
      input_snapshot_json: unknown;
      target_entity_type: string;
      target_entity_id: string;
      attempt_count: number;
      max_attempts: number;
    }>(
      input.db,
      `
        SELECT
          id,
          organization_id,
          workspace_id,
          workflow_id,
          task_type,
          status,
          queue_name,
          input_snapshot_json,
          target_entity_type,
          target_entity_id,
          attempt_count,
          max_attempts
        FROM tasks
        WHERE organization_id = $1
          AND workspace_id = $2
          AND id = $3
        FOR UPDATE
      `,
      [devOrganizationId, devWorkspaceId, input.taskId],
    );
    if (!task) {
      await input.db.query("ROLLBACK");
      return {
        status: 404,
        body: { error: { code: "task_not_found", message: "任务不存在。" } },
      };
    }
    if (!["failed", "canceled"].includes(task.status) || task.attempt_count >= task.max_attempts) {
      await input.db.query("ROLLBACK");
      return {
        status: 400,
        body: { error: { code: "task_not_retryable", message: "当前任务不支持重试。" } },
      };
    }

    const updated = await queryOne<{
      id: string;
      task_type: string;
      status: string;
      queue_name: string;
      failure_code: string | null;
      updated_at: Date | string;
    }>(
      input.db,
      `
        UPDATE tasks
        SET status = 'queued',
            failure_code = NULL,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            scheduled_at = $4,
            updated_at = $4
        WHERE organization_id = $1
          AND workspace_id = $2
          AND id = $3
        RETURNING id, task_type, status, queue_name, failure_code, updated_at
      `,
      [devOrganizationId, devWorkspaceId, task.id, input.now],
    );

    await input.db.query(
      `
        UPDATE workflows
        SET status = 'queued',
            failure_code = NULL,
            failure_message = NULL,
            updated_at = $4
        WHERE organization_id = $1
          AND workspace_id = $2
          AND id = $3
      `,
      [devOrganizationId, devWorkspaceId, task.workflow_id, input.now],
    );

    const snapshot = normalizeRecordJson(task.input_snapshot_json);
    const mediaKind = task.task_type.includes("video") ? "video" : "image";
    await appendGenerationTaskCreatedOutboxEvent(input.db, {
      organizationId: devOrganizationId,
      workflowId: task.workflow_id,
      taskId: task.id,
      kind: mediaKind,
      modelCode: readString(snapshot.modelCode) || readString(snapshot.model) || null,
      queueName: task.queue_name,
      targetType: task.target_entity_type,
      targetId: task.target_entity_id,
      providerExecutor: readString(snapshot.providerExecutor) || "manual_retry",
      ...generationPriorityFromSnapshot(snapshot),
      availableAt: input.now,
    }).catch(() => undefined);

    const body = {
      data: {
        task: {
          id: updated!.id,
          taskType: updated!.task_type,
          status: updated!.status,
          queueName: updated!.queue_name,
          failureCode: updated!.failure_code,
          updatedAt: new Date(updated!.updated_at).toISOString(),
        },
      },
    };
    await store.update({
      ...started.record,
      responseResourceType: "task",
      responseResourceId: task.id,
      responseSnapshot: body,
      status: "succeeded",
      updatedAt: input.now,
    });
    await appendAuditEvent(input.db, {
      organizationId: devOrganizationId,
      workspaceId: devWorkspaceId,
      actorUserId: null,
      eventType: "admin.ops.task_retried",
      targetType: "task",
      targetId: task.id,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        previousStatus: task.status,
        taskType: task.task_type,
        queueName: task.queue_name,
      },
      occurredAt: input.now,
    });
    await input.db.query("COMMIT");
    return { status: 200, body };
  } catch (error) {
    await input.db.query("ROLLBACK").catch(() => undefined);
    if (error instanceof IdempotencyConflictError) {
      return { status: 409, body: { error: "idempotency_conflict" } };
    }
    if (error instanceof IdempotencyProcessingError) {
      return { status: 202, body: { error: "idempotency_processing" } };
    }
    throw error;
  }
}

async function repairPaymentCreditForBackendAdmin(input: {
  db: Awaited<ReturnType<typeof createDevDb>>;
  orderId: string;
  reason: string;
  idempotencyKey: string;
  actorAdminAccountId: string;
  now: Date;
}): Promise<AuthHttpResponse<unknown>> {
  const reason = input.reason.trim();
  if (!reason) {
    return {
      status: 400,
      body: { error: { code: "reason_required", message: "请输入操作原因。" } },
    };
  }

  const requestBody = { orderId: input.orderId, reason };
  await input.db.query("BEGIN");
  try {
    const store = new SqlIdempotencyRecordStore(input.db);
    const started = await beginOrReplayCommand(store, {
      organizationId: devOrganizationId,
      operationName: operationNames.opsRepairPaidWithoutCredit,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashJson(requestBody),
    });
    if (started.kind === "replayed") {
      await input.db.query("COMMIT");
      return {
        status: 200,
        body: started.record.responseSnapshot ?? { data: { orderId: input.orderId } },
      };
    }
    if (started.kind === "processing") {
      throw new IdempotencyProcessingError(started.record);
    }

    const baseOrder = await queryOne<{ id: string }>(
      input.db,
      `
        SELECT id
        FROM billing_orders
        WHERE organization_id = $1
          AND id = $2
          AND product_type = 'credit_package'
        LIMIT 1
      `,
      [devOrganizationId, input.orderId],
    );
    if (!baseOrder) {
      await input.db.query("ROLLBACK");
      return {
        status: 404,
        body: { error: { code: "payment_issue_not_found", message: "没有找到对应的支付异常记录。" } },
      };
    }

    const order = await queryOne<{
      id: string;
      organization_id: string;
      created_by_user_id: string;
      order_no: string;
      credits: number;
      status: string;
      credit_grant_ledger_entry_id: string | null;
      successful_payment_intent_id: string | null;
      provider_event_id: string | null;
    }>(
      input.db,
      `
        SELECT
          bo.id,
          bo.organization_id,
          bo.created_by_user_id,
          bo.order_no,
          bo.credits,
          bo.status,
          bo.credit_grant_ledger_entry_id,
          bo.successful_payment_intent_id,
          ppe.id AS provider_event_id
        FROM billing_orders bo
        JOIN payment_intents pi
          ON pi.organization_id = bo.organization_id
         AND pi.id = bo.successful_payment_intent_id
         AND pi.order_id = bo.id
         AND pi.status = 'succeeded'
         AND pi.amount_minor = bo.amount_minor
         AND pi.currency = bo.currency
        JOIN payment_provider_events ppe
          ON ppe.organization_id = bo.organization_id
         AND ppe.order_id = bo.id
         AND ppe.payment_intent_id = pi.id
         AND ppe.event_type = 'payment_succeeded'
         AND ppe.processing_status = 'processed'
        WHERE bo.organization_id = $1
          AND bo.id = $2
          AND bo.product_type = 'credit_package'
          AND bo.status = 'paid'
        FOR UPDATE OF bo
      `,
      [devOrganizationId, input.orderId],
    );
    if (!order || order.status !== "paid" || order.credit_grant_ledger_entry_id) {
      await input.db.query("ROLLBACK");
      return {
        status: 400,
        body: { error: { code: "payment_issue_not_repairable", message: "当前支付异常不支持自动修复。" } },
      };
    }

    const creditGrant = await grantCreditsInTransaction(input.db, {
      compatibilityOrganizationId: order.organization_id,
      userId: order.created_by_user_id,
      amount: order.credits,
      sourceType: "payment_order",
      sourceId: order.id,
      reason,
      createdByUserId: order.created_by_user_id,
      metadata: {
        orderNo: order.order_no,
        paymentIntentId: order.successful_payment_intent_id,
        actorAdminAccountId: input.actorAdminAccountId,
      },
      now: input.now,
    });

    await input.db.query(
      `
        UPDATE billing_orders
        SET credit_grant_ledger_entry_id = $3,
            updated_at = $4
        WHERE organization_id = $1
          AND id = $2
          AND product_type = 'credit_package'
          AND credit_grant_ledger_entry_id IS NULL
      `,
      [order.organization_id, order.id, creditGrant.id, input.now],
    );

    const body = {
      data: {
        issue: {
          orderId: order.id,
          orderNo: order.order_no,
          issueType: "paid_without_credit",
          status: "resolved",
        },
        creditGrant: {
          id: creditGrant.id,
          amount: creditGrant.amount,
        },
      },
    };
    await store.update({
      ...started.record,
      responseResourceType: "billing_order",
      responseResourceId: order.id,
      responseSnapshot: body,
      status: "succeeded",
      updatedAt: input.now,
    });
    await appendAuditEvent(input.db, {
      organizationId: devOrganizationId,
      workspaceId: devWorkspaceId,
      actorUserId: null,
      eventType: "admin.ops.payment_credit_repaired",
      targetType: "billing_order",
      targetId: order.id,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        orderNo: order.order_no,
        creditGrantLedgerEntryId: creditGrant.id,
        amount: creditGrant.amount,
      },
      occurredAt: input.now,
    });
    await input.db.query("COMMIT");
    return { status: 200, body };
  } catch (error) {
    await input.db.query("ROLLBACK").catch(() => undefined);
    if (error instanceof IdempotencyConflictError) {
      return { status: 409, body: { error: "idempotency_conflict" } };
    }
    if (error instanceof IdempotencyProcessingError) {
      return { status: 202, body: { error: "idempotency_processing" } };
    }
    throw error;
  }
}

function normalizeRecordJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

interface TeamMemberCreditLedgerRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: string;
  amount: number | string;
  available_delta: number | string;
  reserved_delta: number | string;
  consumed_delta: number | string;
  source_type: string;
  source_id: string;
  reason: string;
  metadata_json: unknown;
  user_id: string | null;
  created_at: Date | string;
  member_account: string | null;
  member_login_account: string | null;
  member_name: string | null;
}

interface AdminCreatorCreditLedgerRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: string;
  amount: number | string;
  available_delta: number | string;
  reserved_delta: number | string;
  consumed_delta: number | string;
  source_type: string;
  source_id: string;
  reason: string;
  metadata_json: unknown;
  user_id: string | null;
  created_at: Date | string;
  account_type: string;
  account_label: string | null;
  account_id: string | null;
}

async function listSimpleTeamMemberCreditLedger(
  db: SqlDatabase,
  input: {
    userId: string;
    memberId: string;
    page: number;
    pageSize: number;
  },
) {
  const member = await queryOne<{
    id: string;
    member_credits: number | string;
  }>(
    db,
    `
      SELECT id, member_credits
      FROM team_members
      WHERE user_id = $1
        AND id = $2
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.userId, input.memberId],
  );
  if (!member) {
    return { data: [], accountType: "子账户", summary: buildEmptyTeamMemberCreditSummary(), meta: { total: 0 } };
  }

  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
  const page = Math.max(1, Number(input.page ?? 1));
  const offset = (page - 1) * pageSize;
  const totalResult = await queryOne<{ count: number | string }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM credit_ledger_entries ledger
      JOIN team_members member
        ON member.user_id = $1
       AND member.id = $2
      WHERE (
          ledger.user_id = $1
          OR ledger.user_id = $2::text::uuid
        )
        AND ledger.metadata_json->>'memberId' = $2::text
        AND ledger.source_type IN (
          'team_member_credit_allocation',
          'team_member_credit_deduction',
          'team_member_generation_task',
          'team_member_generation_refund'
        )
    `,
    [input.userId, input.memberId],
  );
  const result = await db.query<TeamMemberCreditLedgerRow>(
    `
      SELECT
        ledger.id,
        ledger.organization_id,
        ledger.reservation_id,
        ledger.allocation_id,
        ledger.entry_type,
        ledger.amount,
        ledger.available_delta,
        ledger.reserved_delta,
        ledger.consumed_delta,
        ledger.source_type,
        ledger.source_id,
        ledger.reason,
        ledger.metadata_json,
        ledger.user_id,
        ledger.created_at,
        member.member_account,
        member.member_login_account,
        member.member_name
      FROM credit_ledger_entries ledger
      JOIN team_members member
        ON member.user_id = $1
       AND member.id = $2
      WHERE (
          ledger.user_id = $1
          OR ledger.user_id = $2::text::uuid
        )
        AND ledger.metadata_json->>'memberId' = $2::text
        AND ledger.source_type IN (
          'team_member_credit_allocation',
          'team_member_credit_deduction',
          'team_member_generation_task',
          'team_member_generation_refund'
        )
      ORDER BY ledger.created_at DESC, ledger.id ASC
      LIMIT $3
      OFFSET $4
    `,
    [input.userId, input.memberId, pageSize, offset],
  );
  const rows = result.rows.map(teamMemberLedgerFromRow);
  const memberCredits = Number(member.member_credits ?? 0);
  return {
    data: rows,
    accountType: "子账户",
    summary: {
      displayAvailableCredits: memberCredits,
    },
    meta: {
      total: Number(totalResult?.count ?? rows.length),
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(Number(totalResult?.count ?? rows.length) / pageSize)),
    },
  };
}

function buildEmptyTeamMemberCreditSummary() {
  return {
    displayAvailableCredits: 0,
  };
}

function teamMemberLedgerFromRow(row: TeamMemberCreditLedgerRow) {
  const metadata = normalizeRecordJson(row.metadata_json);
  const sourceType = String(row.source_type ?? "");
  const amount = Number(row.amount ?? 0);
  const availableDelta = Number(row.available_delta ?? 0);
  const accountLabel = resolveCreditLedgerAccountLabel({
    accountType: "subaccount",
    accountLabel: row.member_login_account,
    memberName: row.member_name,
    memberAccount: row.member_account,
  });
  return {
    id: row.id,
    organizationId: row.organization_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: availableDelta < 0 ? "consume" : "grant",
    amount,
    availableDelta,
    reservedDelta: 0,
    consumedDelta: availableDelta < 0 ? Math.abs(amount) : 0,
    sourceType,
    sourceId: row.source_id,
    reason: row.reason,
    metadata,
    accountType: "subaccount",
    accountLabel,
    accountId: String(metadata.memberId ?? ""),
    content:
      sourceType === "team_member_credit_deduction"
        ? "主账号收回积分"
        : sourceType === "team_member_generation_task"
          ? "生成任务消耗积分"
          : sourceType === "team_member_generation_refund"
            ? "生成失败返还积分"
            : "主账号分配积分",
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function listCreatorAdminCreditLedger(
  db: SqlDatabase,
  input: {
    userId: string;
    page: number;
    pageSize: number;
    baseLedger: {
      data?: unknown[];
      accountType?: string;
      summary?: unknown;
      meta?: unknown;
    };
  },
) {
  const baseData = Array.isArray(input.baseLedger.data) ? input.baseLedger.data : [];
  const ledgerIds = baseData
    .map((item) => item && typeof item === "object" ? String((item as { id?: unknown }).id ?? "") : "")
    .filter(Boolean);
  if (ledgerIds.length === 0) {
    return {
      ...input.baseLedger,
      accountType: input.baseLedger.accountType ?? "管理员账户",
      data: baseData,
    };
  }
  const result = await db.query<AdminCreatorCreditLedgerRow>(
    `
      SELECT
        ledger.id,
        ledger.organization_id,
        ledger.reservation_id,
        ledger.allocation_id,
        ledger.entry_type,
        ledger.amount,
        ledger.available_delta,
        ledger.reserved_delta,
        ledger.consumed_delta,
        ledger.source_type,
        ledger.source_id,
        ledger.reason,
        ledger.metadata_json,
        ledger.user_id,
        ledger.created_at,
        CASE WHEN member.id IS NULL THEN 'owner' ELSE 'subaccount' END AS account_type,
        CASE
          WHEN member.id IS NULL THEN '主账户'
          ELSE COALESCE(NULLIF(member.member_login_account, ''), NULLIF(member.member_name, ''), NULLIF(member.member_account, ''), '子账户')
        END AS account_label,
        member.id AS account_id
      FROM credit_ledger_entries ledger
      LEFT JOIN team_members member
        ON member.user_id = $1
       AND member.deleted_at IS NULL
       AND (
          member.id::text = ledger.metadata_json->>'memberId'
          OR member.id::text = ledger.metadata_json->>'targetUserId'
          OR member.id = ledger.user_id
        )
      WHERE ledger.id = ANY($2::uuid[])
      ORDER BY ledger.created_at DESC, ledger.id ASC
    `,
    [input.userId, ledgerIds],
  );
  const enrichedById = new Map(
    result.rows.map((row) => {
      const enriched = adminCreatorLedgerFromRow(row);
      return [enriched.id, enriched] as const;
    }),
  );
  return {
    ...input.baseLedger,
    accountType: input.baseLedger.accountType ?? "管理员账户",
    data: baseData.map((item) => {
      if (!item || typeof item !== "object") {
        return item;
      }
      const id = String((item as { id?: unknown }).id ?? "");
      return enrichedById.get(id) ?? item;
    }),
  };
}

function adminCreatorLedgerFromRow(row: AdminCreatorCreditLedgerRow) {
  const metadata = normalizeRecordJson(row.metadata_json);
  return {
    id: row.id,
    organizationId: row.organization_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: Number(row.amount ?? 0),
    availableDelta: Number(row.available_delta ?? 0),
    reservedDelta: Number(row.reserved_delta ?? 0),
    consumedDelta: Number(row.consumed_delta ?? 0),
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata,
    accountType: row.account_type === "subaccount" ? "subaccount" : "owner",
    accountLabel: resolveCreditLedgerAccountLabel({
      accountType: row.account_type,
      accountLabel: row.account_label,
      memberName: metadata.memberName,
      memberAccount: metadata.memberAccount,
    }),
    accountId: row.account_id,
    content: creditLedgerContentFromEntry(row, metadata),
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function creditLedgerContentFromEntry(
  row: Pick<AdminCreatorCreditLedgerRow, "source_type" | "reason">,
  metadata: Record<string, unknown>,
) {
  const explicit = String(metadata.content ?? "").trim();
  if (explicit) return explicit;
  const sourceType = String(row.source_type ?? "").trim();
  if (sourceType === "team_member_credit_allocation") return "主账号分配积分";
  if (sourceType === "team_member_credit_deduction") return "主账号收回积分";
  if (sourceType === "team_member_generation_task") return "AI分镜积分消耗";
  if (sourceType === "team_member_generation_refund") return "生成失败返还积分";
  if (sourceType === "credit_wallet_transfer") return "个人积分转入团队积分池";
  return normalizeLedgerReasonToChinese(row.reason) || "积分变动";
}

function normalizeLedgerReasonToChinese(reason: unknown) {
  const text = String(reason ?? "").trim();
  if (!text) return "";
  const aliases: Record<string, string> = {
    "membership period gifted credits": "会员赠送积分",
    "wallet freeze removed and credits released": "会员续费解冻积分",
    "membership lapsed wallet frozen": "会员到期冻结积分",
    "membership frozen credits expired": "会员冻结积分过期失效",
    "credit lot expired": "积分批次过期失效",
    "transfer personal credits to team pool": "个人积分转入团队积分池",
    "script generation": "剧本生成积分扣减",
    "image generation": "图片生成积分扣减",
    "team asset image generation": "图片生成积分扣减",
    "video generation": "视频生成积分扣减",
    "reservation allocation consumed": "任务积分扣减",
    "reservation allocation released": "任务积分返还",
  };
  return aliases[text.toLowerCase()] ?? text;
}

function resolveCreditLedgerAccountLabel(input: {
  accountType?: unknown;
  accountLabel?: unknown;
  memberName?: unknown;
  memberAccount?: unknown;
}) {
  const explicit = String(input.accountLabel ?? "").trim();
  if (explicit) return explicit;
  if (String(input.accountType ?? "") === "subaccount") {
    return String(input.memberName ?? input.memberAccount ?? "子账户").trim() || "子账户";
  }
  return "主账户";
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

class ScriptDocumentUploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function extractScriptInputFromUploadedDocument(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    sessionToken: string;
    userId: string;
    body: {
      scriptUploadSessionId?: string | null;
      scriptStorageObjectId?: string | null;
      scriptFileName?: string | null;
      scriptContentType?: string | null;
    };
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
    fetchImpl: typeof fetch;
  },
) {
  const uploadSessionId = String(input.body.scriptUploadSessionId ?? "").trim();
  const requestedStorageObjectId = String(input.body.scriptStorageObjectId ?? "").trim();
  if (!uploadSessionId && !requestedStorageObjectId) {
    throw new ScriptDocumentUploadError(400, "script_document_required", "请先上传 docx/txt 剧本文档");
  }

  const session = uploadSessionId ? await findUploadSession(db, uploadSessionId) : undefined;
  if (uploadSessionId && !session) {
    throw new ScriptDocumentUploadError(404, "script_document_not_found", "上传的剧本文档不存在，请重新上传");
  }
  if (session?.status !== "uploaded") {
    throw new ScriptDocumentUploadError(400, "script_document_not_ready", "剧本文档尚未上传完成，请稍后重试");
  }
  if (session?.createdByUserId && session.createdByUserId !== input.userId) {
    throw new ScriptDocumentUploadError(404, "script_document_not_found", "上传的剧本文档不存在，请重新上传");
  }
  if (requestedStorageObjectId && session && session.storageObjectId !== requestedStorageObjectId) {
    throw new ScriptDocumentUploadError(400, "script_document_mismatch", "剧本文档上传信息不一致，请重新上传");
  }

  const storageObjectId = requestedStorageObjectId || session?.storageObjectId || "";
  const object = storageObjectId ? await findStorageObject(db, storageObjectId) : undefined;
  if (!object || object.status !== "available") {
    throw new ScriptDocumentUploadError(404, "script_document_not_found", "上传的剧本文档不存在，请重新上传");
  }
  if (session && object.organizationId !== session.organizationId) {
    throw new ScriptDocumentUploadError(400, "script_document_mismatch", "剧本文档上传信息不一致，请重新上传");
  }

  const fileName = input.body.scriptFileName || session?.originalFileName || object.objectKey;
  const extension = extname(fileName).toLowerCase();
  if (![".txt", ".docx"].includes(extension)) {
    throw new ScriptDocumentUploadError(400, "script_document_type_not_supported", "仅支持 docx 或 txt 剧本文档");
  }

  const bytes = await readUploadedStorageObjectBytes(db, {
    sessionToken: input.sessionToken,
    storageObjectId: object.id,
    bucket: object.bucket,
    objectKey: object.objectKey,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
    fetchImpl: input.fetchImpl,
  });
  const text = await extractTextFromScriptDocumentBytes(bytes, extension);
  const normalized = text.replace(/^\uFEFF/, "").trim();
  if (!normalized) {
    throw new ScriptDocumentUploadError(400, "script_document_empty", "剧本文档内容为空，请检查文件后重新上传");
  }
  return normalized;
}

async function readUploadedStorageObjectBytes(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    sessionToken: string;
    storageObjectId: string;
    bucket: string;
    objectKey: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
    fetchImpl: typeof fetch;
  },
) {
  const localPath = resolveLocalStorageObjectPath(input.bucket, input.objectKey);
  try {
    return await readFile(localPath);
  } catch {
    const urls = await buildSignedObjectUrls(db, {
      sessionToken: input.sessionToken,
      storageObjectId: input.storageObjectId,
      adapter: input.runtime.adapter,
      now: input.now,
      expiresInSeconds: input.signedUrlExpiresInSeconds,
    });
    const response = await input.fetchImpl(urls.sourceUrl ?? urls.downloadUrl ?? urls.previewUrl);
    if (!response.ok) {
      throw new ScriptDocumentUploadError(502, "script_document_read_failed", "无法读取上传的剧本文档，请重新上传");
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

async function extractTextFromScriptDocumentBytes(bytes: Buffer, extension: string) {
  if (extension === ".txt") {
    return bytes.toString("utf8");
  }
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value ?? "";
  }
  throw new ScriptDocumentUploadError(400, "script_document_type_not_supported", "仅支持 docx 或 txt 剧本文档");
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
    return targetType === "storyboard" || targetType === "episode" || purpose.includes("storyboard")
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

async function resolveEpisodeStoryboardConversationId(
  db: Awaited<ReturnType<typeof createDevDb>>,
  episodeId: string,
  rawStoryboardId: string,
) {
  const normalized = String(rawStoryboardId ?? "").trim();
  if (isUuid(normalized)) {
    return normalized;
  }
  const ordinalMatch = normalized.match(/^storyboard-(\d+)$/i) ?? normalized.match(/^(\d+)$/);
  if (!ordinalMatch) {
    return null;
  }
  const indexNo = Number(ordinalMatch[1]);
  if (!Number.isInteger(indexNo) || indexNo < 1) {
    return null;
  }
  const row = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
        FROM shots
       WHERE episode_id = $1
       ORDER BY sort_order ASC, created_at ASC, id ASC
       OFFSET $2
       LIMIT 1
    `,
    [episodeId, indexNo - 1],
  );
  return row?.id ?? null;
}

type StoryboardPromptPackageForPreview = {
  id: string;
  name: string;
  package_type: string;
  prompt_content: string;
};

type DefaultPromptTemplateForPreview = {
  id: string;
  name: string;
  prompt_content: string;
};

async function findEnabledStoryboardPromptPackageForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
  id: string,
  packageType: "genre" | "emotion" | "taboo",
) {
  return queryOne<StoryboardPromptPackageForPreview>(
    db,
    `
      SELECT id, name, package_type, prompt_content
      FROM storyboard_prompt_packages
      WHERE id = $1
        AND package_type = $2
        AND status = 'enabled'
        AND deleted_at IS NULL
    `,
    [id, packageType],
  );
}

async function findDefaultTabooStoryboardPromptPackagesForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  const rows = await db.query<StoryboardPromptPackageForPreview>(
    `
      SELECT id, name, package_type, prompt_content
      FROM storyboard_prompt_packages
      WHERE package_type = 'taboo'
        AND status = 'enabled'
        AND deleted_at IS NULL
        AND (
          is_default = true
          OR (
            is_global_default = true
            AND NOT EXISTS (
              SELECT 1
              FROM storyboard_prompt_packages default_taboo
              WHERE default_taboo.package_type = 'taboo'
                AND default_taboo.status = 'enabled'
                AND default_taboo.is_default = true
                AND default_taboo.deleted_at IS NULL
            )
          )
        )
      ORDER BY sort_order DESC, updated_at DESC, id ASC
    `,
  );
  return rows.rows;
}

function formatStoryboardPromptPackageContents(packages: StoryboardPromptPackageForPreview[]) {
  return packages
    .map((item) => String(item.prompt_content ?? "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function createRequestAbortController(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  request.once("aborted", abort);
  response.once("close", abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      request.off("aborted", abort);
      response.off("close", abort);
    },
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && (
    error.name === "AbortError" ||
    error.message === "AbortError" ||
    error.message.toLowerCase().includes("abort")
  );
}

async function findDefaultScenePromptTemplateForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  return queryOne<DefaultPromptTemplateForPreview>(
    db,
    `
      SELECT id, name, prompt_content
      FROM scene_prompt_templates
      WHERE status = 'enabled'
        AND stage = 'split'
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY sort_order DESC, updated_at DESC, id ASC
      LIMIT 1
    `,
  );
}

async function findDefaultCharacterPromptTemplateForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  return queryOne<DefaultPromptTemplateForPreview>(
    db,
    `
      SELECT id, name, prompt_content
      FROM character_prompt_templates
      WHERE status = 'enabled'
        AND stage = 'extract'
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY sort_order DESC, updated_at DESC, id ASC
      LIMIT 1
    `,
  );
}

async function findDefaultShotPromptTemplateForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  return queryOne<DefaultPromptTemplateForPreview>(
    db,
    `
      SELECT id, name, prompt_content
      FROM shot_prompt_templates
      WHERE status = 'enabled'
        AND stage = 'outline'
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY sort_order DESC, updated_at DESC, id ASC
      LIMIT 1
    `,
  );
}

async function findDefaultPropPromptTemplateForPreview(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  return queryOne<DefaultPromptTemplateForPreview>(
    db,
    `
      SELECT id, name, prompt_content
      FROM prop_prompt_templates
      WHERE status = 'enabled'
        AND stage = 'extract'
        AND is_default = true
        AND deleted_at IS NULL
      ORDER BY sort_order DESC, updated_at DESC, id ASC
      LIMIT 1
    `,
  );
}

function getUploadExtension(fileName: unknown) {
  return extname(String(fileName ?? "").trim()).toLowerCase();
}

function resolveUploadLimitsForPurpose(purpose: unknown) {
  return String(purpose ?? "").trim() === "script-documents"
    ? scriptDocumentUploadLimits
    : episodeUploadLimits;
}

function getUploadLimitKind(
  contentType: unknown,
  fileName: unknown,
  limits: typeof episodeUploadLimits | typeof scriptDocumentUploadLimits = episodeUploadLimits,
) {
  const normalizedContentType = String(contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = getUploadExtension(fileName);
  for (const [kind, rule] of Object.entries(limits)) {
    if (kind === "blockedExtensions") {
      continue;
    }
    if (
      typeof rule === "object" &&
      "mimeTypes" in rule &&
      (rule.mimeTypes.includes(normalizedContentType) || rule.extensions.includes(extension))
    ) {
      return kind as "image" | "video" | "audio" | "document";
    }
  }
  return null;
}

function validateUploadPolicy(input: {
  fileName: unknown;
  contentType: unknown;
  sizeBytes?: unknown;
  purpose?: unknown;
}) {
  const extension = getUploadExtension(input.fileName);
  const normalizedContentType = String(input.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const uploadLimits = resolveUploadLimitsForPurpose(input.purpose);
  if (!extension || uploadLimits.blockedExtensions.includes(extension)) {
    return {
      ok: false as const,
      errorCode: "upload_type_not_allowed",
      message: "不支持的文件类型或扩展名。",
    };
  }
  const kind = getUploadLimitKind(normalizedContentType, input.fileName, uploadLimits);
  if (!kind) {
    return {
      ok: false as const,
      errorCode: "upload_type_not_allowed",
      message: String(input.purpose ?? "").trim() === "script-documents"
        ? "仅支持 docx 或 txt 剧本文档。"
        : "\u4ec5\u652f\u6301\u56fe\u7247\u3001\u89c6\u9891\u548c\u97f3\u9891\u6587\u4ef6\u3002",
    };
  }
  const rule = uploadLimits[kind];
  if (!rule.mimeTypes.includes(normalizedContentType)) {
    return {
      ok: false as const,
      errorCode: "upload_mime_not_allowed",
      message: `${rule.label} 文件格式不被允许。`,
    };
  }
  const sizeBytes = Number(input.sizeBytes ?? 0);
  if (Number.isFinite(sizeBytes) && sizeBytes > rule.maxBytes) {
    return {
      ok: false as const,
      errorCode: "upload_file_too_large",
      message: `${rule.label}閺傚洣娆㈢搾鍛扮箖娑撳﹣绱舵径褍鐨梽鎰煑`,
      details: {
        kind,
        maxBytes: rule.maxBytes,
        sizeBytes,
      },
    };
  }
  return { ok: true as const, kind, rule };
}

function normalizeUploadFileName(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "").trim();
}

function normalizeUploadContentType(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase() || "application/octet-stream";
}

function buildOfficialAssetUploadObjectKey(input: {
  fileName: string;
  now: Date;
  env: NodeJS.ProcessEnv;
}) {
  const safeName = sanitizeOfficialAssetUploadFileName(input.fileName);
  const rootPrefix = sanitizeOfficialAssetStorageFolder(
    input.env.STORAGE_OFFICIAL_ASSET_ROOT_PREFIX?.trim() || "officialAssets",
  );
  const dateFolder = formatOfficialAssetStorageDateFolder(
    input.now,
    input.env.STORAGE_OBJECT_DATE_TIMEZONE?.trim() || "Asia/Shanghai",
  );

  return [
    rootPrefix,
    dateFolder,
    `${randomUUID()}-${safeName}`,
  ].join("/");
}

function buildTeamAssetUploadObjectKey(input: {
  adminUserId: string;
  category: string;
  fileName: string;
  now: Date;
  env: NodeJS.ProcessEnv;
}) {
  const safeName = sanitizeOfficialAssetUploadFileName(input.fileName);
  const rootPrefix = sanitizeOfficialAssetStorageFolder(
    input.env.STORAGE_TEAM_ASSET_ROOT_PREFIX?.trim() || "teamAssets",
  );
  const dateFolder = formatOfficialAssetStorageDateFolder(
    input.now,
    input.env.STORAGE_OBJECT_DATE_TIMEZONE?.trim() || "Asia/Shanghai",
  );
  return [
    rootPrefix,
    input.adminUserId,
    input.category,
    dateFolder,
    `${randomUUID()}-${safeName}`,
  ].join("/");
}

function parseTeamAssetCategory(value: unknown) {
  const category = String(value ?? "").trim();
  return ["character", "scene", "prop", "voice"].includes(category)
    ? category
    : null;
}

function teamAssetResourceKind(contentType: string) {
  return contentType.toLowerCase().startsWith("audio/") ? "audio" : "image";
}

function teamAssetGeneratedFileName(assetName: string, artifact: MediaGenerationArtifact) {
  const extension = String(artifact.fileExtension ?? "").trim().replace(/^\./, "")
    || String(artifact.mimeType ?? "").split("/").at(-1)?.replace("jpeg", "jpg")
    || "png";
  return `${assetName}.${extension}`;
}

async function readTeamAssetArtifactBytes(
  artifact: MediaGenerationArtifact,
  fetchImpl: typeof fetch,
) {
  if (artifact.b64Json) {
    return new Uint8Array(Buffer.from(artifact.b64Json, "base64"));
  }
  if (!artifact.url) {
    throw new Error("team_asset_generation_artifact_missing");
  }
  const artifactResponse = await fetchImpl(artifact.url);
  if (!artifactResponse.ok) {
    throw new Error("team_asset_generation_artifact_download_failed");
  }
  return new Uint8Array(await artifactResponse.arrayBuffer());
}

function teamAssetRow(row: Record<string, unknown>) {
  const assetStatus = readString(row.asset_status);
  const providerStatus = readString(row.generation_task_status) || readString(row.provider_request_status);
  const generationStatus = assetStatus === "active"
    ? "completed"
    : assetStatus === "failed"
      ? "failed"
      : providerStatus || "queued";
  const generationTaskId = readString(row.generation_task_id) || readString(row.provider_request_id) || null;
  const rawGenerationPayload = row.generation_task_payload ?? row.provider_payload;
  const generationPayload = rawGenerationPayload && typeof rawGenerationPayload === "object" && !Array.isArray(rawGenerationPayload)
    ? rawGenerationPayload as Record<string, unknown>
    : {};
  return {
    id: readString(row.id),
    scope: "team",
    adminUserId: readString(row.admin_user_id),
    name: readString(row.asset_name),
    prompt: readString(row.asset_prompt) || null,
    category: readString(row.asset_category),
    status: assetStatus,
    previewUrl: readString(row.asset_url),
    sourceUrl: readString(row.asset_url),
    resourceType: readString(row.resource_type),
    resourceSize: Number(row.resource_size ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByName: readString(row.created_by_name),
    updatedByName: readString(row.updated_by_name),
    isAdminCreated: row.is_admin_created === true,
    createdUserId: readString(row.created_user_id),
    generationStatus,
    generationTaskId,
    generationResult: generationTaskId
      ? {
          status: generationStatus,
          taskId: generationTaskId,
          failureCode: readString(row.generation_task_failure_code) || readString(row.provider_failure_code) || null,
          prompt: readString(generationPayload.prompt) || readString(row.asset_prompt),
          model: readString(generationPayload.model) || null,
          parameters: generationPayload.parameters && typeof generationPayload.parameters === "object"
            ? generationPayload.parameters
            : {},
        }
      : null,
  };
}

function sanitizeOfficialAssetUploadFileName(fileName: string) {
  const basename = fileName.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const safeName = basename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");

  if (!safeName || /^https?:/i.test(fileName)) {
    throw new Error("invalid_official_asset_upload_file_name");
  }

  return safeName;
}

function sanitizeOfficialAssetStorageFolder(folderName: string) {
  const safeName = folderName.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safeName || "officialAssets";
}

function formatOfficialAssetStorageDateFolder(now: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((part) => part.type === "year")?.value ?? "1970";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    return `${year}${month}${day}`;
  } catch {
    const year = now.getUTCFullYear();
    const month = `${now.getUTCMonth() + 1}`.padStart(2, "0");
    const day = `${now.getUTCDate()}`.padStart(2, "0");
    return `${year}${month}${day}`;
  }
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
  parameters: Record<string, unknown> = {},
) {
  const baseCredits = Number(modelConfig?.pricing.baseCredits);
  if (!Number.isFinite(baseCredits) || baseCredits < 0) {
    return fallbackCost;
  }
  const billingMode = readString(modelConfig?.pricing.billingMode);
  const durationSec = readPositiveNumber(parameters.durationSec) ??
    readPositiveNumber(modelConfig?.defaultParams.durationSec) ??
    1;
  const unitCredits = resolutionCreditsFromModelConfig(modelConfig, parameters, baseCredits);
  const cost = billingMode === "duration" && modelConfig?.mediaType === "video"
    ? unitCredits * durationSec
    : unitCredits;
  return Number.isFinite(cost) && cost >= 0
    ? (cost > 0 && cost < 1 ? 1 : Math.round(cost))
    : fallbackCost;
}

function resolutionCreditsFromModelConfig(
  modelConfig: AiModelConfigRecord | undefined,
  parameters: Record<string, unknown>,
  fallbackCredits: number,
) {
  const resolution = readString(parameters.resolution) ||
    readString(parameters.quality) ||
    readString(parameters.ratio) ||
    readString(parameters.aspectRatio) ||
    readString(modelConfig?.defaultParams.resolution) ||
    readString(modelConfig?.defaultParams.quality) ||
    readString(modelConfig?.defaultParams.ratio) ||
    readString(modelConfig?.defaultParams.aspectRatio);
  const table = modelConfig?.pricing.resolutionCredits;
  if (!resolution || !table || typeof table !== "object" || Array.isArray(table)) {
    return fallbackCredits;
  }
  const configuredCredits = Number((table as Record<string, unknown>)[resolution]);
  return Number.isFinite(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : fallbackCredits;
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function modelConfigSupportsScriptGeneration(modelConfig: AiModelConfigRecord) {
  const tokens = [
    modelConfig.mediaType,
    modelConfig.modelCode,
    ...modelConfig.taskModes,
    ...readStringArray(modelConfig.uiConfig.supportedModes),
  ]
    .map((item) => String(item ?? "").trim().toLowerCase())
    .filter(Boolean);
  return tokens.some((token) => token === "text" || token === "text.script" || token === "script" || token.includes("script"));
}

async function findActiveScriptGenerationModelConfig(
  db: Parameters<typeof listActiveAiModelConfigs>[0],
  preferredModelCode?: string,
) {
  const normalizedPreferredModelCode = String(preferredModelCode ?? "").trim();
  if (normalizedPreferredModelCode) {
    const preferredModel = await findActiveAiModelConfigByCode(db, normalizedPreferredModelCode);
    if (preferredModel && modelConfigSupportsScriptGeneration(preferredModel)) {
      return preferredModel;
    }
  }
  const activeTextModels = await listActiveAiModelConfigs(db, { mediaType: "text" });
  const scriptModels = activeTextModels.filter(modelConfigSupportsScriptGeneration);
  return scriptModels.find((modelConfig) => generationCostFromModelConfig(0, modelConfig) > 0) ?? scriptModels[0];
}

async function reserveAndConsumeAiStoryboardPreviewCredits(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    workspaceId: string | null;
    projectId: string;
    createdByUserId: string;
    teamMemberId?: string | null;
    idempotencyKey: string;
    promptPreview: string;
    modelConfig?: AiModelConfigRecord;
    now: Date;
  },
) {
  const amount = generationCostFromModelConfig(0, input.modelConfig);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
  const modelCode = String(input.modelConfig?.modelCode ?? "text.script").trim() || "text.script";
  const modelLabel = String(input.modelConfig?.displayName ?? "剧本模型").trim() || "剧本模型";
  const metadata = {
    targetUserId: input.createdByUserId,
    memberId: input.teamMemberId ?? undefined,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    modelCode,
    modelLabel,
    mediaType: "text",
    kind: "text",
    taskType: "ai_storyboard_preview",
    operation: "ai_storyboard_preview",
    billingEvent: "consumed",
    outcome: "consumed",
    promptPreview: input.promptPreview,
  };
  return verifyMembershipAndConsumeCredits(db, {
    userId: input.createdByUserId,
    compatibilityOrganizationId: input.organizationId,
    requiredCredits: amount,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    idempotencyKey: input.idempotencyKey,
    sourceType: "episode_generation_task",
    sourceId,
    reason: "script generation",
    allocationKey: "ai_storyboard_preview",
    metadata,
    now: input.now,
  });
}

async function reserveAndConsumeSimpleTeamMemberCredits(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
    teamMemberId: string;
    idempotencyKey: string;
    promptPreview: string;
    modelConfig?: AiModelConfigRecord;
    now: Date;
  },
) {
  const amount = generationCostFromModelConfig(0, input.modelConfig);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const member = await queryOne<{ member_credits: number | string }>(
    db,
    `
      SELECT member_credits
      FROM team_members
      WHERE id = $1
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.teamMemberId],
  );
  const availableCredits = Number(member?.member_credits ?? 0);
  if (availableCredits < amount) {
    throw new InsufficientCreditsError();
  }
  const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
  const modelCode = String(input.modelConfig?.modelCode ?? "text.script").trim() || "text.script";
  const modelLabel = String(input.modelConfig?.displayName ?? "剧本模型").trim() || "剧本模型";
  const metadata = {
    targetUserId: input.teamMemberId,
    memberId: input.teamMemberId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    modelCode,
    modelLabel,
    mediaType: "text",
    kind: "text",
    taskType: "ai_storyboard_preview",
    operation: "ai_storyboard_preview",
    billingEvent: "consumed",
    outcome: "consumed",
    promptPreview: input.promptPreview,
  };
  await db.query("BEGIN");
  try {
    await db.query(
      `
        UPDATE team_members
        SET member_credits = member_credits - $2,
            updated_at = $3
        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL
          AND member_credits >= $2
      `,
      [input.teamMemberId, amount, input.now],
    );
    const updated = await queryOne<{ member_credits: number | string }>(
      db,
      `
        SELECT member_credits
        FROM team_members
        WHERE id = $1
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.teamMemberId],
    );
    if (!updated || Number(updated.member_credits ?? 0) < 0) {
      throw new InsufficientCreditsError();
    }

    const reservationId = uuidFromIdempotencyKey(input.idempotencyKey);
    await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO credit_ledger_entries (
          id,
          organization_id,
          user_id,
          reservation_id,
          allocation_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          source_type,
          source_id,
          reason,
          metadata_json,
          created_by_user_id,
          created_at
        )
        VALUES (
          $1, $2, $3, NULL, NULL, 'transfer_out', $4, -($4::int), 0, 0,
          'team_member_generation_task', $5, $6, $7::jsonb, $3, $8
        )
        RETURNING id
      `,
      [
        randomUUID(),
        input.organizationId,
        input.teamMemberId,
        amount,
        reservationId,
        "成员生成消耗积分",
        JSON.stringify(metadata),
        input.now,
      ],
    );

    await db.query("COMMIT");
    return {
      reservation: {
        id: reservationId,
        organizationId: input.organizationId,
        userId: input.teamMemberId,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        workflowId: null,
        taskId: null,
        amountTotal: amount,
        amountReserved: 0,
        amountConsumed: amount,
        amountReleased: 0,
        status: "settled" as const,
        sourceType: "team_member_generation_task",
        sourceId: reservationId,
        reason: "成员生成消耗积分",
        metadata,
        createdByUserId: input.teamMemberId,
        createdAt: input.now,
        updatedAt: input.now,
      },
    };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function releaseSimpleTeamMemberCredits(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    teamMemberId: string;
    amount: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return null;
  }
  await db.query("BEGIN");
  try {
    const updatedMember = await queryOne<{ user_id: string }>(
      db,
      `
        UPDATE team_members
        SET member_credits = member_credits + $2,
            updated_at = $3
        WHERE id = $1
          AND status <> 'deleted'
        RETURNING user_id
      `,
      [input.teamMemberId, input.amount, input.now],
    );
    if (!updatedMember) {
      throw new Error("team_member_refund_target_missing");
    }
    await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO credit_ledger_entries (
          id,
          organization_id,
          user_id,
          reservation_id,
          allocation_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          source_type,
          source_id,
          reason,
          metadata_json,
          created_by_user_id,
          created_at
        )
        VALUES ($1, $2, $3, NULL, NULL, 'grant', $4, $4, 0, 0, 'team_member_generation_refund', $5, $6, $7::jsonb, NULL, $8)
        RETURNING id
      `,
      [
        randomUUID(),
        input.organizationId,
        updatedMember.user_id,
        input.amount,
        input.sourceId,
        input.reason,
        JSON.stringify({
          ...input.metadata,
          memberId: input.teamMemberId,
        }),
        input.now,
      ],
    );
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function hasActiveGenerationMembership(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: { userId: string; now: Date },
) {
  const activeMembership = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM memberships
      WHERE user_id = $1
        AND status = 'active'
        AND membership_tier IN ('experience', 'professional')
        AND expires_at > $2
      LIMIT 1
    `,
    [input.userId, input.now],
  );
  return Boolean(activeMembership);
}

function modelConfigToGenerationConfigModel(modelConfig: AiModelConfigRecord) {
  const supportedModes = readStringArray(modelConfig.uiConfig.supportedModes);
  const videoCategory = readString(modelConfig.uiConfig.videoCategory) || inferVideoModelCategory(modelConfig.taskModes);
  const schemaRatios = readEnumValues(modelConfig.parameterSchema.aspectRatio);
  const defaultRatios = readStringArray(modelConfig.defaultParams.aspectRatio);
  const schemaQuality =
    readEnumValues(modelConfig.parameterSchema.quality).length
      ? readEnumValues(modelConfig.parameterSchema.quality)
      : readEnumValues(modelConfig.parameterSchema.resolution);
  const supportedRatios = schemaRatios.length ? schemaRatios : defaultRatios;
  const supportedDurations = readEnumValues(modelConfig.parameterSchema.durationSec);
  return {
    modelCode: modelConfig.modelCode,
    modelLabel: modelConfig.displayName,
    remark: modelConfig.remark,
    mediaType: modelConfig.mediaType,
    modelKind: readString(modelConfig.uiConfig.modelKind),
    modelKindLabel: readString(modelConfig.uiConfig.modelKindLabel),
    videoCategory,
    videoCategoryLabel: readString(modelConfig.uiConfig.videoCategoryLabel) || videoCategoryLabel(videoCategory),
    providerGroup: readString(modelConfig.uiConfig.group) || modelConfig.providerName,
    pipeline: readString(modelConfig.uiConfig.pipeline) || modelConfig.mediaType,
    supportedModes: supportedModes.length ? supportedModes : modelConfig.taskModes,
    supportedRatios: supportedRatios.length ? supportedRatios : ["16:9", "9:16"],
    supportedQuality: schemaQuality.length ? schemaQuality : ["1080p"],
    supportedDurations,
    parameterSchema: modelConfig.parameterSchema,
    defaultParams: modelConfig.defaultParams,
    pricing: modelConfig.pricing,
    baseCredits: modelConfig.pricing.baseCredits,
    billingMode: modelConfig.pricing.billingMode,
    resolutionCredits: modelConfig.pricing.resolutionCredits,
    displayBaseCost: generationCostFromModelConfig(0, modelConfig),
    disabled: modelConfig.status !== "active",
  };
}

function modelConfigSupportsBatchImage(modelConfig: AiModelConfigRecord) {
  const supportedModes = readStringArray(modelConfig.uiConfig.supportedModes);
  const taskModes = [...supportedModes, ...modelConfig.taskModes]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (!taskModes.length) {
    return false;
  }
  const aliases = new Set([
    "multi-image",
    "multi_image",
    "multi_reference",
    "image.reference_generate",
    "image_reference_generate",
    "image.generate",
    "image_generate",
  ]);
  return taskModes.some((taskMode) => aliases.has(taskMode));
}

function modelConfigToBatchImageModelOption(modelConfig: AiModelConfigRecord) {
  const schemaRatios = readEnumValues(modelConfig.parameterSchema.aspectRatio);
  const defaultRatios = readStringArray(modelConfig.defaultParams.aspectRatio);
  const ratios = schemaRatios.length ? schemaRatios : defaultRatios;
  const schemaQuality = readEnumValues(modelConfig.parameterSchema.quality);
  const schemaResolutions = readEnumValues(modelConfig.parameterSchema.resolution);
  const qualities = schemaQuality.length ? schemaQuality : schemaResolutions;
  return {
    modelId: modelConfig.modelCode,
    modelName: modelConfig.displayName,
    ratios: ratios.length ? ratios : ["16:9", "9:16"],
    qualities: qualities.length ? qualities : ["2K"],
  };
}

async function buildBatchImageModelOptions(db: Parameters<typeof listActiveAiModelConfigs>[0]) {
  const activeImageModels = await listActiveAiModelConfigs(db, { mediaType: "image" });
  const models = activeImageModels
    .filter(modelConfigSupportsBatchImage)
    .map(modelConfigToBatchImageModelOption);
  const fallbackModels = [
    {
      modelId: "nano_banana_2",
      modelName: "nano banana 2",
      ratios: ["16:9", "9:16", "1:1"],
      qualities: ["2K"],
    },
  ];
  const resolvedModels = models.length ? models : fallbackModels;
  return {
    models: resolvedModels,
  };
}

function readGenerationConfigMediaType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["image", "video", "text"].includes(normalized) ? normalized : "";
}

async function buildGenerationConfigModelCatalog(db: Parameters<typeof listActiveAiModelConfigs>[0], options: { mediaType?: string | null } = {}) {
  const requestedMediaType = readGenerationConfigMediaType(options.mediaType);
  const [activeImageModels, activeVideoModels, activeTextModels] = await Promise.all([
    !requestedMediaType || requestedMediaType === "image"
      ? listActiveAiModelConfigs(db, { mediaType: "image" })
      : Promise.resolve([]),
    !requestedMediaType || requestedMediaType === "video"
      ? listActiveAiModelConfigs(db, { mediaType: "video" })
      : Promise.resolve([]),
    !requestedMediaType || requestedMediaType === "text"
      ? listActiveAiModelConfigs(db, { mediaType: "text" })
      : Promise.resolve([]),
  ]);
  const executableImageModels = activeImageModels.filter((modelConfig) =>
    modelConfigSupportsGenerationExecution("image", modelConfig),
  );
  const executableVideoModels = activeVideoModels.filter((modelConfig) =>
    modelConfigSupportsGenerationExecution("video", modelConfig),
  );
  const imageModels = executableImageModels.length
    ? executableImageModels.map(modelConfigToGenerationConfigModel)
    : !requestedMediaType || requestedMediaType === "image"
      ? [
        {
          modelCode: "nano_banana_2",
          modelLabel: "nano banana 2",
          providerGroup: "Nano banana",
          pipeline: "G",
          supportedModes: ["text_to_image", "multi_reference", "image_to_image"],
          supportedRatios: ["16:9", "9:16", "1:1"],
          supportedQuality: ["2K"],
          displayBaseCost: 90,
          disabled: false,
        },
      ]
      : [];
  const videoModels = executableVideoModels.length
    ? executableVideoModels.map(modelConfigToGenerationConfigModel)
    : !requestedMediaType || requestedMediaType === "video"
      ? [
        {
          modelCode: "video_mock_1",
          modelLabel: "Video Mock",
          providerGroup: "Mock",
          pipeline: "mock",
          supportedModes: ["video"],
          supportedRatios: ["16:9", "9:16"],
          supportedQuality: ["720p"],
          displayBaseCost: Number(runtimeEnv.EPISODE_VIDEO_GENERATION_COST ?? 120),
          disabled: false,
        },
      ]
      : [];
  const defaultVideoModel =
    videoModels.find((model) => model.videoCategory === "reference") ??
    videoModels[0] ??
    null;
  const textModels = activeTextModels.map(modelConfigToGenerationConfigModel);
  return {
    models: [
      ...imageModels,
      ...videoModels,
      ...textModels,
    ],
    presets: [],
    uploadLimits: episodeUploadLimits,
    defaultImageModelCode: imageModels[0]?.modelCode ?? "nano_banana_2",
    defaultVideoModelCode: defaultVideoModel?.modelCode ?? "video_mock_1",
  };
}

function modelConfigSupportsGenerationExecution(kind: "image" | "video", modelConfig: AiModelConfigRecord) {
  try {
    resolveGenerationModelExecution({
      kind,
      modelCode: modelConfig.modelCode,
      modelConfig,
      dispatchPolicy: undefined,
      parameters: {},
      fallbackQueueName: kind === "video" ? "generation-submit-video" : "generation-submit-image",
    });
    return true;
  } catch (error) {
    if (error instanceof GenerationModelExecutionResolutionError) {
      return false;
    }
    throw error;
  }
}

function inferVideoModelCategory(taskModes: string[]) {
  if (!taskModes.some((taskMode) => taskMode.startsWith("video."))) return "";
  if (taskModes.includes("video.reference_image_to_video")) return "reference";
  if (taskModes.includes("video.first_last_frame_to_video")) return "first_last_frame";
  if (taskModes.includes("video.video_to_video") || taskModes.includes("video.image_video_to_video")) return "video_edit";
  return "first_frame";
}

function videoCategoryLabel(videoCategory: string) {
  if (videoCategory === "reference") return "全能参考";
  if (videoCategory === "first_last_frame") return "首尾帧";
  if (videoCategory === "video_edit") return "AI改视频";
  if (videoCategory === "first_frame") return "首帧视频";
  return "";
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function generationPriorityFromSnapshot(snapshot: Record<string, unknown>) {
  if (snapshot.membershipPriority !== true) {
    return {};
  }
  const queuePriority = readPositiveInteger(snapshot.queuePriority);
  if (queuePriority === null) {
    return {};
  }

  return {
    membershipPriority: true,
    queuePriority,
    priorityReason: readString(snapshot.priorityReason) || "membership_priority",
  };
}

function readPositiveInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return null;
  }
  return numberValue;
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
    ? value.map((item) => readEnumValue(item)).filter(Boolean)
    : [];
}

function readEnumValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const option = value as Record<string, unknown>;
    return readString(option.value) || readString(option.providerValue) || readString(option.label);
  }
  return readString(value);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readEnumValues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const schema = value as Record<string, unknown>;
  const enumValues = readStringArray(schema.enum);
  if (enumValues.length) {
    return enumValues;
  }
  return readStringArray(schema.options);
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
    if (adapter instanceof SeedanceVideoProviderAdapter && isVideoPollProviderAdapter(adapter)) {
      return adapter;
    }
    if (isLingdongModelConfig(modelConfig) && isVideoPollProviderAdapter(adapter)) {
      return adapter;
    }
    if (isLingdongModelConfig(modelConfig)) {
      throw new Error("lingdong_video_poll_adapter_unsupported");
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

function isVideoPollProviderAdapter(adapter: unknown): adapter is {
  poll(input: { externalRequestId: string }): Promise<{
    status: "accepted" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    redactedResponse: Record<string, unknown>;
  }>;
} {
  return Boolean(adapter && typeof adapter === "object" && typeof (adapter as { poll?: unknown }).poll === "function");
}

function isLingdongModelConfig(modelConfig: AiModelConfigRecord | undefined) {
  if (!modelConfig) {
    return false;
  }
  return modelConfig.providerProtocol === "lingdong_api" ||
    /lingdong|灵动/i.test(modelConfig.providerName);
}

function videoProviderNameForModelConfig(modelConfig: AiModelConfigRecord | undefined) {
  return isLingdongModelConfig(modelConfig)
    ? modelConfig!.providerName
    : "volcengine";
}

function videoProviderModelForModelConfig(
  modelConfig: AiModelConfigRecord | undefined,
  fallbackModel: unknown,
) {
  return isLingdongModelConfig(modelConfig)
    ? modelConfig!.providerModel
    : String(fallbackModel ?? "seedance-i2v-pro");
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

async function resolveCreditBalanceScope(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
) {
  await ensurePersonalDevWorkspaceAccess(db, userId);
  return personalDevTenantScope(userId);
}

async function getUserCreditBalance(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
) {
  await resolveCreditBalanceScope(db, userId);
  const row = await queryOne<{
    credit_balance_cached: number | string | null;
    credit_reserved_cached: number | string | null;
    credit_frozen_cached: number | string | null;
    credit_frozen_at: Date | string | null;
    credit_frozen_until: Date | string | null;
  }>(
    db,
    `
      SELECT
        credit_balance_cached,
        credit_reserved_cached,
        credit_frozen_cached,
        credit_frozen_at,
        credit_frozen_until
      FROM users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId],
  );
  const availableCredits = Number(row?.credit_balance_cached ?? 0);
  const frozenCredits = Number(row?.credit_frozen_cached ?? 0);
  return {
    availableCredits,
    creditBalance: availableCredits,
    displayCreditBalance: availableCredits + frozenCredits,
    reservedCredits: Number(row?.credit_reserved_cached ?? 0),
    frozenCredits,
    creditFrozenAt: row?.credit_frozen_at ? new Date(row.credit_frozen_at).toISOString() : null,
    creditFrozenUntil: row?.credit_frozen_until ? new Date(row.credit_frozen_until).toISOString() : null,
  };
}

async function getSimpleTeamMemberCreditBalance(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    memberId: string;
  },
) {
  const row = await queryOne<{
    member_credits: number | string;
  }>(
    db,
    `
      SELECT member_credits
      FROM team_members
      WHERE user_id = $1
        AND id = $2
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.userId, input.memberId],
  );
  const availableCredits = Number(row?.member_credits ?? 0);
  return {
    availableCredits,
    creditBalance: availableCredits,
    displayCreditBalance: availableCredits,
    reservedCredits: 0,
    frozenCredits: 0,
    creditFrozenAt: null,
    creditFrozenUntil: null,
  };
}

async function getAiStoryboardPreviewCreditBalance(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    teamMemberId?: string | null;
  },
) {
  if (input.teamMemberId) {
    return getSimpleTeamMemberCreditBalance(db, {
      userId: input.userId,
      memberId: input.teamMemberId,
    });
  }
  return getUserCreditBalance(db, input.userId);
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

  const credit = actor.teamMember
    ? await getSimpleTeamMemberCreditBalance(db, {
        userId: input.userId,
        memberId: actor.teamMember.id,
      })
    : await getUserCreditBalance(db, input.userId);
  return {
    actor,
    episode,
    project,
    ...credit,
    userId: input.userId,
  };
}

async function getEpisodeReadContext(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    sessionToken: string;
    now: Date;
  },
) {
  const episode = await queryOne<{
    id: string;
    organization_id: string;
    project_id: string;
  }>(
    db,
    "SELECT id, organization_id, project_id FROM episodes WHERE id = $1",
    [input.episodeId],
  );
  if (!episode) {
    return null;
  }

  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: episode.project_id,
    now: input.now,
  });
  if (!actor.workspaceId) {
    return null;
  }

  return { episode };
}

async function resolveCanvasRunEpisodeId(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    userId: string;
    now: Date;
  },
) {
  const fallback = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM episodes
      WHERE organization_id = $1
        AND project_id = $2
        AND title = '画布生成'
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [input.organizationId, input.projectId],
  );
  if (fallback) {
    return fallback.id;
  }
  const created = await createEpisodeForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    title: "画布生成",
    createdByUserId: input.userId,
    now: input.now,
  });
  return created.id;
}

async function resolveProjectAssetGenerationEpisodeId(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    userId: string;
    now: Date;
  },
) {
  const episodes = await listEpisodesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const existing = episodes[0]?.id ?? null;
  if (existing) {
    return existing;
  }
  const created = await createEpisodeForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    title: "项目资产生成",
    createdByUserId: input.userId,
    now: input.now,
  });
  return created.id;
}

async function ensureStandaloneCanvasRunProject(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    workspaceId: string;
    canvasProjectId: string;
    userId: string;
    now: Date;
  },
) {
  const canvas = await queryOne<{
    id: string;
    project_id: string | null;
    title: string | null;
  }>(
    db,
    `
      SELECT id, project_id, title
      FROM creator_canvas_projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.organizationId, input.workspaceId, input.canvasProjectId],
  );
  if (!canvas || canvas.project_id) {
    return canvas?.project_id ?? null;
  }

  const projectId = randomUUID();
  await db.query(
    `
      INSERT INTO projects (
        id,
        organization_id,
        workspace_id,
        name,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, '9:16', '1080p', 'shot_generation', $5, $6, $6)
    `,
    [
      projectId,
      input.organizationId,
      input.workspaceId,
      `${standaloneCanvasRunProjectNamePrefix}${canvas.title || canvas.id}`,
      input.userId,
      input.now,
    ],
  );

  await db.query(
    `
      UPDATE creator_canvas_projects
      SET project_id = $4,
          updated_by_user_id = $5,
          updated_at = $6
      WHERE organization_id = $1
        AND workspace_id = $2
        AND id = $3
    `,
    [input.organizationId, input.workspaceId, input.canvasProjectId, projectId, input.userId, input.now],
  );

  await createEpisodeForProject(db, {
    organizationId: input.organizationId,
    projectId,
    title: "画布生成",
    createdByUserId: input.userId,
    now: input.now,
  });
  return projectId;
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
    snapshot_progress_stage: string | null;
    snapshot_progress_percent: number | string | null;
    credit_balance_cached: number | string | null;
    model_display_name: string | null;
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
        s.progress_stage AS snapshot_progress_stage,
        s.progress_percent AS snapshot_progress_percent,
        s.failure_json AS snapshot_failure_json,
        s.result_assets_json AS snapshot_result_assets_json,
        o.credit_balance_cached,
        m.display_name AS model_display_name
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
        WHERE pr_latest.task_id = t.id
          AND pr_latest.workspace_id IS NOT DISTINCT FROM t.workspace_id
        ORDER BY pr_latest.updated_at DESC NULLS LAST, pr_latest.created_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN ai_generation_task_snapshots s
        ON s.organization_id = t.organization_id
       AND s.task_id = t.id
      LEFT JOIN ai_model_configs m
        ON m.model_code = COALESCE(s.model_code, t.input_snapshot_json->>'model')
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
  const failureMessageSnapshot = {
    ...snapshot,
    modelDisplayName: row.model_display_name,
  };
  const metadata =
    typeof row.metadata_json === "string"
      ? JSON.parse(row.metadata_json) as Record<string, unknown>
      : row.metadata_json ?? {};
  const kind = String(snapshot.kind ?? (row.task_type.includes("video") ? "video" : "image"));
  const providerResponse = readJsonRecord(row.provider_response_redacted_json);
  const snapshotFailure = readJsonRecord(row.snapshot_failure_json);
  const snapshotResultAssets = readRecordArray(row.snapshot_result_assets_json);
  const snapshotProgressPercent = Number(row.snapshot_progress_percent);
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
    readString(snapshotFailure.errorMessage) ||
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
  const snapshotParameters =
    snapshot.parameters && typeof snapshot.parameters === "object"
      ? snapshot.parameters as Record<string, unknown>
      : null;
  const selectionContext =
    snapshot.selectionContext && typeof snapshot.selectionContext === "object"
      ? snapshot.selectionContext
      : snapshotParameters?.selectionContext && typeof snapshotParameters.selectionContext === "object"
        ? snapshotParameters.selectionContext
        : null;
  const generatedAudioItems =
    kind === "video" &&
    (snapshot.lipSyncEnabled === true || String((snapshot.parameters as Record<string, unknown> | undefined)?.mode ?? "") === "lip-sync") &&
    lipSyncConfig
      ? [{
          id: `${row.task_id}-audio-1`,
          type: "audio",
          kind: "audio",
          name: "闂傚﹥濞婇。?1",
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
  const metadataSourceUrl = readGenerationPublicAssetUrl(metadata.sourceUrl);
  const metadataPreviewUrl = readGenerationPublicAssetUrl(metadata.previewUrl);
  const metadataDownloadUrl = readGenerationPublicAssetUrl(metadata.downloadUrl);
  const storageSourceUrl = readGenerationPublicAssetUrl(urls?.sourceUrl, urls?.downloadUrl, urls?.previewUrl);
  const storagePreviewUrl = readGenerationPublicAssetUrl(urls?.previewUrl, urls?.sourceUrl, urls?.downloadUrl);
  const storageDownloadUrl = readGenerationPublicAssetUrl(urls?.downloadUrl, urls?.sourceUrl, urls?.previewUrl);
  const resultSourceUrl =
    kind === "image"
      ? metadataSourceUrl || storageSourceUrl || mockImageUrl
      : storageSourceUrl || metadataSourceUrl || storyboardVideoUrl;
  const resultPreviewUrl =
    kind === "image"
      ? metadataPreviewUrl || storagePreviewUrl || resultSourceUrl || mockImageUrl
      : storagePreviewUrl || metadataPreviewUrl || resultSourceUrl;
  const resultDownloadUrl =
    kind === "image"
      ? metadataDownloadUrl || storageDownloadUrl || resultSourceUrl || mockImageUrl
      : storageDownloadUrl || metadataDownloadUrl || resultSourceUrl;

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
          imageUrl: kind === "image" ? resultSourceUrl : null,
          videoUrl: kind === "video" ? resultSourceUrl : null,
          thumbnailUrl:
            metadata.thumbnailUrl ??
            (kind === "image" ? resultPreviewUrl : null),
          coverImageUrl:
            metadata.coverImageUrl ??
            (kind === "image" ? resultPreviewUrl : null),
          sourceUrl: resultSourceUrl,
          downloadUrl: resultDownloadUrl,
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
            requestSnapshot: failureMessageSnapshot,
          }),
          storageObjectKey: readString(snapshotFailure.storageObjectKey) || null,
          providerRequestId: row.provider_request_id,
          providerStatus,
          providerErrorCode,
          providerMessage: generationProviderMessageForClient(providerMessage, failureMessageSnapshot),
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
    assetId:
      readString(snapshot.assetId) ||
      (readString(snapshot.targetType) === "asset" ? readString(snapshot.targetId) : null) ||
      (row.target_entity_type === "asset" ? row.target_entity_id : null),
    selectionContext,
    model: snapshot.model ?? null,
    prompt: snapshot.prompt ?? null,
    parameters: snapshot.parameters ?? {},
    timeoutAt: snapshot.timeoutAt ?? null,
    progressStage: readString(row.snapshot_progress_stage) || null,
    progressPercent: Number.isFinite(snapshotProgressPercent) ? snapshotProgressPercent : null,
    snapshot: {
      progressStage: readString(row.snapshot_progress_stage) || null,
      progressPercent: Number.isFinite(snapshotProgressPercent) ? snapshotProgressPercent : null,
    },
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

async function readGenerationTaskResponseForSession(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    sessionToken: string;
    userId: string;
    runtime: UploadSessionRuntime;
    runtimeEnv: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  const taskContext = await resolveTaskContext(db, {
    taskId: input.taskId,
    sessionToken: input.sessionToken,
    now: input.now,
  });
  if (!taskContext) {
    return null;
  }
  await settleTimedOutEpisodeGenerationTask(db, {
    taskId: input.taskId,
    now: input.now,
  });
  const generationQueueConfig = loadGenerationQueueConfig(input.runtimeEnv);
  if (!generationQueueConfig.outboxDispatcherEnabled && !generationQueueConfig.workersEnabled) {
    await syncSeedanceVideoTaskOnRead(db, {
      taskId: input.taskId,
      sessionToken: input.sessionToken,
      runtime: input.runtime,
      env: input.runtimeEnv,
      fetchImpl: input.fetchImpl,
      now: input.now,
    });
  }
  await enqueueVideoFinalizeIfProviderResultReady(db, {
    taskId: input.taskId,
    now: input.now,
  });
  const task = await mapGenerationTaskResponse(db, {
    taskId: input.taskId,
    sessionToken: input.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  if (!task) {
    return null;
  }
  await recordCanvasHistoryFromGenerationResponse(db, {
    responseBody: task,
    userId: input.userId,
    now: input.now,
  });
  await syncProjectAssetGenerationTaskMetadata(db, {
    task: task as Record<string, unknown>,
    organizationId: taskContext.actor.organizationId,
    now: input.now,
  });
  await syncTeamAssetGenerationTaskMetadata(db, {
    task: task as Record<string, unknown>,
    adminUserId: taskContext.actor.actorId,
    now: input.now,
  });
  return task;
}

async function enqueueVideoFinalizeIfProviderResultReady(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    now: Date;
  },
) {
  const row = await queryOne<{
    task_id: string;
    workflow_id: string;
    organization_id: string;
    status: string;
    model_code: string | null;
    provider_executor: string | null;
    provider_response_redacted_json: Record<string, unknown> | string | null;
    snapshot_result_assets_json: Record<string, unknown>[] | string | null;
    asset_version_id: string | null;
  }>(
    db,
    `
      SELECT
        t.id AS task_id,
        t.workflow_id,
        t.organization_id,
        t.status,
        COALESCE(s.model_code, t.input_snapshot_json->>'modelCode', t.input_snapshot_json->>'model') AS model_code,
        t.input_snapshot_json->>'providerExecutor' AS provider_executor,
        pr.response_redacted_json AS provider_response_redacted_json,
        s.result_assets_json AS snapshot_result_assets_json,
        v.id AS asset_version_id
      FROM tasks t
      LEFT JOIN ai_generation_task_snapshots s
        ON s.organization_id = t.organization_id
       AND s.task_id = t.id
      LEFT JOIN LATERAL (
        SELECT
          pr_latest.response_redacted_json
        FROM provider_requests pr_latest
        WHERE pr_latest.task_id = t.id
          AND pr_latest.workspace_id IS NOT DISTINCT FROM t.workspace_id
          AND pr_latest.status = 'succeeded'
        ORDER BY pr_latest.updated_at DESC NULLS LAST, pr_latest.created_at DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN LATERAL (
        SELECT av.id
        FROM asset_versions av
        WHERE av.organization_id = t.organization_id
          AND av.source_task_id = t.id
        ORDER BY av.created_at DESC
        LIMIT 1
      ) v ON true
      WHERE t.id = $1
        AND t.task_type = 'episode_generate_video'
        AND t.status IN ('queued', 'running')
      LIMIT 1
    `,
    [input.taskId],
  );
  if (!row || row.provider_executor !== "seedance" || row.asset_version_id) {
    return false;
  }
  const providerResponse = readJsonRecord(row.provider_response_redacted_json);
  if (!readProviderResultVideoUrl(providerResponse)) {
    return false;
  }
  const snapshotResultAssets = readRecordArray(row.snapshot_result_assets_json);
  if (snapshotResultAssets.some((asset) => readGenerationPublicAssetUrl(asset.sourceUrl, asset.url, asset.previewUrl, asset.downloadUrl))) {
    return false;
  }
  if (await hasPendingVideoFinalizeOutboxEvent(db, row.task_id)) {
    return false;
  }

  await appendGenerationTaskFinalizeRequestedOutboxEvent(db, {
    organizationId: row.organization_id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    kind: "video",
    modelCode: row.model_code,
    providerExecutor: "seedance",
    finalizeMode: "retry_finalize",
    availableAt: input.now,
  });
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'running',
          progress_stage = 'saving_asset',
          updated_at = $2
      WHERE task_id = $1
        AND status <> 'succeeded'
    `,
    [row.task_id, input.now],
  );
  await db.query(
    `
      UPDATE tasks
      SET status = CASE WHEN status = 'queued' THEN 'running' ELSE status END,
          updated_at = $2
      WHERE id = $1
        AND status IN ('queued', 'running')
    `,
    [row.task_id, input.now],
  );
  return true;
}

async function hasPendingVideoFinalizeOutboxEvent(
  db: Awaited<ReturnType<typeof createDevDb>>,
  taskId: string,
) {
  const existing = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM outbox_events
      WHERE event_type = 'generation.task.finalize_requested'
        AND status IN ('pending', 'processing')
        AND payload_json->>'taskId' = $1
        AND payload_json->>'mediaType' = 'video'
        AND payload_json->>'providerExecutor' = 'seedance'
      LIMIT 1
    `,
    [taskId],
  );
  return Boolean(existing);
}

function readProviderResultVideoUrl(providerResponse: Record<string, unknown>) {
  return readString(providerResponse.videoUrl) ||
    readString(providerResponse.video_url) ||
    readString(providerResponse.content_url) ||
    readString(providerResponse.contentUrl) ||
    readString(providerResponse.url) ||
    null;
}

async function failCreatedGenerationTaskBeforeDispatch(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    taskId: string;
    workflowId: string;
    startedRecord: IdempotencyRecord;
    store: SqlIdempotencyRecordStore;
    sessionToken: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
    failureCode: string;
  },
) {
  await db.query(
    `
      UPDATE tasks
      SET status = 'failed',
          failure_code = $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.taskId, input.failureCode, input.now],
  );
  await db.query(
    `
      UPDATE workflows
      SET status = 'failed',
          finished_at = COALESCE(finished_at, $2),
          updated_at = $2
      WHERE id = $1
    `,
    [input.workflowId, input.now],
  );
  await markGenerationTaskSnapshotFailed(db, {
    taskId: input.taskId,
    failure: {
      failureCode: input.failureCode,
      displayMessage: generationFailureDisplayMessage({
        failureCode: input.failureCode,
      }),
    },
    creditSummary: {
      reserved: 0,
      released: 0,
      settledAt: input.now.toISOString(),
    },
    now: input.now,
  });
  const responseBody = await mapGenerationTaskResponse(db, {
    taskId: input.taskId,
    sessionToken: input.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  await input.store.update({
    ...input.startedRecord,
    responseResourceType: "generation_task",
    responseResourceId: input.taskId,
    responseSnapshot: responseBody as Record<string, unknown>,
    status: "succeeded",
    updatedAt: input.now,
  });

  return { status: 200 as const, body: responseBody };
}

function isInsufficientCreditsFailure(error: unknown) {
  return error instanceof InsufficientCreditsError ||
    (
      Boolean(error) &&
      typeof error === "object" &&
      (error as { code?: unknown }).code === "insufficient_credits"
    );
}

function resolveGenerationTaskAssetPreviewUrl(task: Record<string, unknown>) {
  const result = task.result && typeof task.result === "object"
    ? task.result as Record<string, unknown>
    : {};
  const version = task.version && typeof task.version === "object"
    ? task.version as Record<string, unknown>
    : {};
  const versionMetadata = version.metadata && typeof version.metadata === "object"
    ? version.metadata as Record<string, unknown>
    : {};
  const fixedImages = Array.isArray(task.fixedImages) ? task.fixedImages : [];
  const fixedImage = fixedImages.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const candidates = [
    result.imageUrl,
    result.previewUrl,
    result.sourceUrl,
    result.downloadUrl,
    result.thumbnailUrl,
    fixedImage?.previewUrl,
    fixedImage?.url,
    fixedImage?.src,
    version.previewUrl,
    versionMetadata.previewUrl,
    versionMetadata.sourceUrl,
  ];
  for (const candidate of candidates) {
    const value = readString(candidate);
    if (value) {
      return value;
    }
  }
  return "";
}

async function syncProjectAssetGenerationTaskMetadata(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    task: Record<string, unknown>;
    organizationId: string;
    now: Date;
  },
) {
  const targetType = readString(input.task.targetType);
  const assetId = readString(input.task.targetId);
  if (targetType !== "asset" || !isUuid(assetId)) {
    return;
  }
  const previewUrl = resolveGenerationTaskAssetPreviewUrl(input.task);
  const status = readString(input.task.status) || readString(input.task.workflowStatus) || null;
  const latestVersion = await queryOne<{
    id: string;
    metadata_json: Record<string, unknown> | string | null;
  }>(
    db,
    `
      SELECT id, metadata_json
      FROM asset_versions
      WHERE organization_id = $1
        AND asset_id = $2
      ORDER BY version_number DESC
      LIMIT 1
    `,
    [input.organizationId, assetId],
  );
  if (!latestVersion) {
    return;
  }
  const existingMetadata = readJsonRecord(latestVersion.metadata_json);
  const incomingTaskId = readString(input.task.taskId);
  const existingTaskId =
    readString(existingMetadata.generationTaskId) ||
    readString(readJsonRecord(existingMetadata.generationResult).taskId);
  const incomingCreatedAt = Date.parse(
    readString(input.task.createdAt) ||
      readString(input.task.submittedAt) ||
      readString(input.task.updatedAt) ||
      "",
  );
  const existingGenerationResult = readJsonRecord(existingMetadata.generationResult);
  const existingStatus =
    readString(existingMetadata.generationStatus) ||
    readString(existingGenerationResult.status) ||
    readString(existingGenerationResult.workflowStatus);
  const hasExistingPreview = Boolean(
    readString(existingMetadata.previewUrl) ||
      readString(existingMetadata.fixedImageUrl) ||
      resolveGenerationTaskAssetPreviewUrl(existingGenerationResult),
  );
  const incomingStatus = String(status ?? "").toLowerCase();
  const existingSucceeded = ["completed", "succeeded", "success"].includes(String(existingStatus ?? "").toLowerCase());
  const existingCreatedAt = Date.parse(
    readString(existingGenerationResult.createdAt) ||
      readString(existingGenerationResult.submittedAt) ||
      readString(existingGenerationResult.updatedAt) ||
      "",
  );
  if (
    incomingTaskId &&
    existingTaskId &&
    incomingTaskId !== existingTaskId &&
    Number.isFinite(incomingCreatedAt) &&
    Number.isFinite(existingCreatedAt) &&
    incomingCreatedAt < existingCreatedAt
  ) {
    return;
  }
  if (!previewUrl && incomingStatus === "failed" && hasExistingPreview && existingSucceeded) {
    return;
  }
  const metadata = {
    ...existingMetadata,
    generationTaskId: readString(input.task.taskId) || null,
    generationStatus: status,
    generationResult: input.task,
  };
  if (previewUrl) {
    metadata.previewUrl = previewUrl;
    metadata.fixedImageUrl = previewUrl;
    metadata.sourceUrl = previewUrl;
    metadata.downloadUrl = previewUrl;
  }
  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, latestVersion.id, metadata],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, assetId, input.now],
  );
}

async function syncTeamAssetGenerationTaskMetadata(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    task: Record<string, unknown>;
    adminUserId: string;
    now: Date;
  },
) {
  const targetType = readString(input.task.targetType);
  const assetId = readString(input.task.targetId);
  if (targetType !== "team_asset" || !isUuid(assetId)) {
    return;
  }
  const status = String(readString(input.task.status) || readString(input.task.workflowStatus) || "").toLowerCase();
  const previewUrl = resolveGenerationTaskAssetPreviewUrl(input.task);
  const result = readJsonRecord(input.task.result);
  const storageObjectId = readString(result.storageObjectId);
  const storageObject = storageObjectId
    ? await queryOne<{ size_bytes: number | string | null }>(
        db,
        "SELECT size_bytes FROM storage_objects WHERE id = $1 LIMIT 1",
        [storageObjectId],
      )
    : null;
  const terminalStatus = ["completed", "succeeded", "success"].includes(status)
    ? "active"
    : ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status)
      ? "failed"
      : "generating";
  await db.query(
    `
      UPDATE team_assets
      SET asset_status = $3,
          asset_url = CASE WHEN $3 = 'active' THEN $4 ELSE asset_url END,
          resource_size = CASE WHEN $3 = 'active' THEN $5 ELSE resource_size END,
          updated_at = $6
      WHERE id = $1
        AND admin_user_id = $2
    `,
    [assetId, input.adminUserId, terminalStatus, previewUrl || null, Number(storageObject?.size_bytes ?? 0), input.now],
  );
}

async function recordCanvasHistoryFromGenerationResponse(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    responseBody: unknown;
    userId: string;
    now: Date;
  },
) {
  const body = input.responseBody && typeof input.responseBody === "object"
    ? input.responseBody as Record<string, unknown>
    : {};
  if (String(body.targetType ?? "") !== "canvas") {
    return null;
  }
  const taskId = readString(body.taskId);
  const nodeKey = readString(body.targetId);
  if (!taskId || !nodeKey) {
    return null;
  }
  const task = await queryOne<{
    organization_id: string;
    workspace_id: string | null;
    project_id: string | null;
  }>(
    db,
    `
      SELECT organization_id, workspace_id, project_id
      FROM tasks
      WHERE id = $1
      LIMIT 1
    `,
    [taskId],
  );
  if (!task?.workspace_id || !task.project_id) {
    return null;
  }
  const result = body.result && typeof body.result === "object"
    ? body.result as Record<string, unknown>
    : null;
  const failure = body.failure && typeof body.failure === "object"
    ? body.failure as Record<string, unknown>
    : null;
  return attachCanvasTaskResultToHistory(db, {
    organizationId: task.organization_id,
    workspaceId: task.workspace_id,
    projectId: task.project_id,
    nodeKey,
    taskId,
    mediaKind: readString(body.kind) || "image",
    result,
    failure,
    userId: input.userId,
    now: input.now,
  });
}

function generationResultFromSnapshotAsset(
  asset: Record<string, unknown>,
  kind: string,
  generatedAudioItems: Array<Record<string, unknown>>,
) {
  const url = readGenerationPublicAssetUrl(
    asset.sourceUrl,
    asset.url,
    asset.previewUrl,
    asset.downloadUrl,
  );
  const previewUrl = readGenerationPublicAssetUrl(asset.previewUrl, url) || null;
  const downloadUrl = readGenerationPublicAssetUrl(asset.downloadUrl, url) || null;
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

function readGenerationPublicAssetUrl(...values: unknown[]) {
  for (const value of values) {
    const url = readString(value);
    if (url && !isProviderDirectContentUrl(url)) {
      return url;
    }
  }
  return null;
}

function isProviderDirectContentUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      /(^|\.)lingdongapi\.com$/i.test(url.hostname) &&
      /^\/v1\/(?:videos|images)\/[^/]+\/content$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
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

function readErrorApiKeyEnv(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const value = (error as { apiKeyEnv?: unknown }).apiKeyEnv;
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

export function generationFailureDisplayMessage(input: {
  failureCode: string | null | undefined;
  snapshotFailure?: Record<string, unknown>;
  providerMessage?: string | null;
  providerErrorCode?: string | null;
  requestSnapshot?: Record<string, unknown>;
}): string {
  const failureCode = String(input.failureCode ?? "").trim();
  const explicit = readString(input.snapshotFailure?.displayMessage);
  const translatedExplicit = translateKnownGenerationFailureMessage(explicit, input.requestSnapshot);
  if (translatedExplicit) {
    return translatedExplicit;
  }
  const translatedExplicitProviderFailure = explicit ? generationProviderFailureDisplayMessage(explicit) : "";
  if (translatedExplicitProviderFailure) {
    return translatedExplicitProviderFailure;
  }
  if (explicit && explicit !== failureCode && !/^[a-z0-9_:-]+$/i.test(explicit)) {
    return translateProviderErrorMessage(explicit);
  }
  const providerMessage = String(input.providerMessage ?? "").trim();
  if (failureCode === "provider_failed" && providerMessage) {
    const translatedProviderMessage = generationProviderFailureDisplayMessage(providerMessage);
    return translatedProviderMessage || translateProviderErrorMessage(providerMessage);
  }
  const providerErrorCode = String(input.providerErrorCode ?? "").trim();
  if (failureCode === "provider_failed" && providerErrorCode) {
    const translatedProviderErrorCode = generationProviderFailureDisplayMessage(providerErrorCode);
    return translatedProviderErrorCode || translateProviderErrorMessage(providerErrorCode);
  }
  return generationFailureDisplayMessageByCode(failureCode);
}
function generationProviderMessageForClient(
  value: string | null | undefined,
  requestSnapshot?: Record<string, unknown>,
): string | null {
  const message = String(value ?? "").trim();
  if (!message) {
    return null;
  }
  return translateKnownGenerationFailureMessage(message, requestSnapshot) ||
    generationProviderFailureDisplayMessage(message) ||
    translateProviderErrorMessage(message);
}

function generationProviderFailureDisplayMessage(value: string): string {
  const code = value.trim();
  const translated = translateKnownGenerationFailureMessage(code);
  if (translated) {
    return translated;
  }
  const contentSafetyMessage = generationContentSafetyFailureDisplayMessage(code);
  if (contentSafetyMessage) {
    return contentSafetyMessage;
  }
  if (code === "provider_submission_ambiguous") {
    return generationFailureDisplayMessageByCode("provider_submission_ambiguous");
  }
  if (/lingdong_api_video_400|invalid_request_error|通道暂时不可用/i.test(code)) {
    return "渠道暂不可用";
  }
  if (/volcengine_ark_image_404|InvalidEndpointOrModel\.NotFound/i.test(code)) {
    const model = /model or endpoint\s+([A-Za-z0-9_.:-]+)/i.exec(code)?.[1] ??
      /endpoint\s+([A-Za-z0-9_.:-]+)/i.exec(code)?.[1] ??
      "";
    return model
      ? `\u706b\u5c71\u65b9\u821f\u56fe\u7247\u6a21\u578b\u4e0d\u53ef\u7528\u6216\u5f53\u524d\u8d26\u53f7\u65e0\u6743\u9650\uff1a${model}\u3002\u4efb\u52a1\u6ca1\u6709\u751f\u6210\u56fe\u7247\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\uff0c\u8bf7\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u6216\u4f9b\u5e94\u5546\u6743\u9650\u3002`
      : "\u706b\u5c71\u65b9\u821f\u56fe\u7247\u6a21\u578b\u4e0d\u53ef\u7528\u6216\u5f53\u524d\u8d26\u53f7\u65e0\u6743\u9650\u3002\u4efb\u52a1\u6ca1\u6709\u751f\u6210\u56fe\u7247\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\uff0c\u8bf7\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u6216\u4f9b\u5e94\u5546\u6743\u9650\u3002";
  }
  const imageProviderStatus = /^(?:cumob_image|image_provider|volcengine_ark_image|openai_images)_(\d{3})/i.exec(code)?.[1];
  if (imageProviderStatus === "504") {
    return generationFailureDisplayMessageByCode("image_provider_504");
  }
  if (imageProviderStatus === "429") {
    return "图片模型服务限流（HTTP 429），积分已返还。请稍后重试。";
  }
  if (imageProviderStatus === "401" || imageProviderStatus === "403") {
    return "图片模型服务鉴权失败，任务没有生成图片，积分已返还。请检查 API 密钥和账号权限。";
  }
  if (imageProviderStatus === "400") {
    return "图片模型服务拒绝了请求，任务没有生成图片，积分已返还。请检查提示词、参考图或模型参数。";
  }
  if (imageProviderStatus && Number(imageProviderStatus) >= 500) {
    return `图片模型服务返回 HTTP ${imageProviderStatus}，任务没有拿到生成结果，积分已返还。请稍后重试。`;
  }
  const videoProviderStatus = /^video_provider_(\d{3})/i.exec(code)?.[1];
  if (videoProviderStatus === "401" || videoProviderStatus === "403") {
    return "视频模型服务鉴权失败，任务没有生成视频，积分已返还。请检查 API 密钥和账号权限。";
  }
  if (videoProviderStatus === "400") {
    return "视频模型服务拒绝了请求，任务没有生成视频，积分已返还。请检查提示词、参考素材或模型参数。";
  }
  if (videoProviderStatus === "429") {
    return "视频模型服务限流（HTTP 429），积分已返还。请稍后重试。";
  }
  if (videoProviderStatus && Number(videoProviderStatus) >= 500) {
    return `视频模型服务返回 HTTP ${videoProviderStatus}，任务没有拿到生成结果，积分已返还。请稍后重试。`;
  }
  if (code === "image_provider_empty_response" || code === "openai_images_empty_response") {
    return generationFailureDisplayMessageByCode("image_provider_empty_response");
  }
  if (code === "image_provider_invalid_json" || code === "openai_images_invalid_json") {
    return generationFailureDisplayMessageByCode("image_provider_invalid_json");
  }
  if (code === "image_provider_invalid_response" || code === "openai_images_invalid_response") {
    return generationFailureDisplayMessageByCode("image_provider_invalid_response");
  }
  if (code === "image_provider_timeout" || code === "openai_images_timeout") {
    return generationFailureDisplayMessageByCode("image_provider_timeout");
  }
  return /^[a-z0-9_:-]+$/i.test(code) ? "" : translateProviderErrorMessage(code);
}

function generationContentSafetyFailureDisplayMessage(value: string): string {
  if (/(血腥|残肢|尸体|断肢|头颅破碎|重度暴力|明显的血|不适合生成|内容安全|安全策略|审核拒绝|违规|敏感内容|content policy|safety|moderation)/i.test(value)) {
    return "提示词包含血腥、残肢或重度暴力内容，请改成非血腥的战后遗迹、诡异荒城或氛围场景后重试。";
  }
  return "";
}

function translateKnownGenerationFailureMessage(
  message: string | undefined,
  requestSnapshot?: Record<string, unknown>,
): string {
  const value = String(message ?? "").trim();
  const messages: Record<string, string> = {
    "Unexpected end of JSON input": generationFailureDisplayMessageByCode("openai_images_empty_response"),
    "fetch failed": generationFetchFailedDisplayMessage(requestSnapshot),
    "Generation task timed out. Credits were refunded.": generationFailureDisplayMessageByCode("task_timeout"),
    "Provider returned a failure. Credits were refunded.": generationFailureDisplayMessageByCode("provider_failed"),
    "Provider submission is ambiguous. Credits were refunded and the task requires retry or admin review.": generationFailureDisplayMessageByCode("provider_submission_ambiguous"),
    "Provider submission is ambiguous. Credits were refunded and admin review may be needed.": generationFailureDisplayMessageByCode("provider_submission_ambiguous"),
  };
  return messages[value] ?? "";
}

function generationFetchFailedDisplayMessage(requestSnapshot?: Record<string, unknown>): string {
  if (isLingdongVideoGenerationSnapshot(requestSnapshot)) {
    const displayName = readString(requestSnapshot?.modelDisplayName) || "\u5f53\u524d\u89c6\u9891\u6a21\u578b";
    return `\u65e0\u6cd5\u8fde\u63a5${displayName}\uff0c\u540e\u7aef\u6ca1\u6709\u6536\u5230\u63d0\u4ea4\u54cd\u5e94\uff0c\u65e0\u6cd5\u786e\u8ba4\u4efb\u52a1\u662f\u5426\u5df2\u521b\u5efa\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u6a21\u578b\u914d\u7f6e\u548c\u670d\u52a1\u72b6\u6001\u540e\u91cd\u8bd5\u3002`;
  }
  return "\u65e0\u6cd5\u8fde\u63a5 GPT Image 2 \u4f9b\u5e94\u5546\u6216\u4e2d\u8f6c\u7ad9\uff0c\u540e\u7aef\u6ca1\u6709\u6536\u5230\u54cd\u5e94\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u4e2d\u8f6c\u7ad9\u5730\u5740\u548c\u670d\u52a1\u72b6\u6001\u540e\u91cd\u8bd5\u3002";
}

function isLingdongVideoGenerationSnapshot(snapshot: Record<string, unknown> | undefined): boolean {
  if (!snapshot) {
    return false;
  }
  const kind = readString(snapshot.kind);
  const model = readString(snapshot.model);
  const providerExecutor = readString(snapshot.providerExecutor);
  return kind === "video" && (
    providerExecutor === "lingdong" ||
    model === "cvk" ||
    /^sd-2-/i.test(model ?? "") ||
    model === "seedance-2.0"
  );
}

function generationFailureDisplayMessageByCode(failureCode: string): string {
  const messages: Record<string, string> = {
    task_timeout: "\u751f\u6210\u4efb\u52a1\u8d85\u8fc7\u5e73\u53f0\u7b49\u5f85\u65f6\u95f4\uff0c\u5df2\u6309\u5931\u8d25\u5904\u7406\u5e76\u8fd4\u8fd8\u79ef\u5206\u3002\u8bf7\u91cd\u65b0\u53d1\u8d77\u751f\u6210\u3002",
    provider_failed: "\u4f9b\u5e94\u5546\u8fd4\u56de\u5931\u8d25\uff0c\u4efb\u52a1\u6ca1\u6709\u62ff\u5230\u751f\u6210\u7ed3\u679c\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    cumob_image_failed: "酷模返回生成失败，任务没有拿到可用图片，积分已返还。请稍后重试；如果连续出现，请更换比例/尺寸或检查酷模侧任务状态。",
    cumob_image_invalid_response: "酷模响应中没有可用图片地址，任务没有保存图片，积分已返还。请稍后重试。",
    cumob_image_empty_response: "酷模响应为空，后端没有拿到生成结果，积分已返还。请稍后重试。",
    cumob_image_invalid_json: "酷模响应格式异常，后端无法解析生成结果，积分已返还。请稍后重试。",
    cumob_image_timeout: "酷模响应超时，后端没有拿到生成结果，积分已返还。请稍后重试。",
    cumob_image_network_error: "无法连接酷模接口，后端没有拿到生成结果，积分已返还。请检查网络或酷模服务状态后重试。",
    global_ai_opc_image_failed: "GlobalAiOpc 返回生成失败，任务没有拿到可用图片，积分已返还。请稍后重试；如果连续出现，请更换比例、分辨率或检查供应商任务状态。",
    global_ai_opc_image_invalid_response: "GlobalAiOpc 响应中没有可用图片地址，任务没有保存图片，积分已返还。请稍后重试。",
    global_ai_opc_image_empty_response: "GlobalAiOpc 响应为空，后端没有拿到生成结果，积分已返还。请稍后重试。",
    global_ai_opc_image_invalid_json: "GlobalAiOpc 响应格式异常，后端无法解析生成结果，积分已返还。请稍后重试。",
    global_ai_opc_image_timeout: "GlobalAiOpc 响应超时，后端没有拿到生成结果，积分已返还。请稍后重试。",
    global_ai_opc_image_network_error: "无法连接 GlobalAiOpc 接口，后端没有拿到生成结果，积分已返还。请检查网络或供应商服务状态后重试。",
    provider_submission_prepare_failed: "\u751f\u6210\u8bf7\u6c42\u53d1\u9001\u524d\u51c6\u5907\u5931\u8d25\uff0c\u4efb\u52a1\u6ca1\u6709\u53d1\u7ed9\u4f9b\u5e94\u5546\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff1b\u5982\u679c\u53cd\u590d\u51fa\u73b0\uff0c\u8bf7\u8054\u7cfb\u540e\u53f0\u68c0\u67e5\u4efb\u52a1\u914d\u7f6e\u3002",
    provider_submission_ambiguous: "\u6a21\u578b\u8bf7\u6c42\u5df2\u53d1\u51fa\uff0c\u4f46\u4f9b\u5e94\u5546\u6ca1\u6709\u8fd4\u56de\u660e\u786e\u63d0\u4ea4\u7ed3\u679c\u3002\u7cfb\u7edf\u5df2\u505c\u6b62\u7ee7\u7eed\u5904\u7406\u5e76\u8fd4\u8fd8\u79ef\u5206\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff1b\u5982\u679c\u4f9b\u5e94\u5546\u4fa7\u5b9e\u9645\u751f\u6210\u4e86\u7ed3\u679c\uff0c\u9700\u8981\u540e\u53f0\u590d\u6838\u3002",
    image_provider_timeout: "图片模型服务响应超时，后端没有拿到生成结果。积分已返还，请稍后重试或检查中转站耗时。",
    image_provider_empty_response: "图片模型服务响应为空或被截断，后端没有拿到图片数据。积分已返还，请检查中转站是否完整返回 JSON。",
    image_provider_invalid_json: "图片模型服务响应格式异常，后端无法解析图片数据。积分已返还，请检查中转站是否返回标准 JSON。",
    image_provider_invalid_response: "图片模型服务响应中没有可用图片数据。积分已返还，请稍后重试或检查中转站返回字段。",
    image_provider_504: "图片模型服务或中转站响应超时（HTTP 504），任务没有拿到生成结果，积分已返还。请稍后重试或检查中转站稳定性。",
    openai_images_timeout: "图片模型服务响应超时，后端没有拿到生成结果。积分已返还，请稍后重试或检查中转站耗时。",
    openai_images_empty_response: "图片模型服务响应为空或被截断，后端没有拿到图片数据。积分已返还，请检查中转站是否完整返回 JSON。",
    openai_images_invalid_json: "图片模型服务响应格式异常，后端无法解析图片数据。积分已返还，请检查中转站是否返回标准 JSON。",
    openai_images_invalid_response: "图片模型服务响应中没有可用图片数据。积分已返还，请稍后重试或检查中转站返回字段。",
    openai_images_504: "图片模型服务或中转站响应超时（HTTP 504），任务没有拿到生成结果，积分已返还。请稍后重试或检查中转站稳定性。",
    provider_poll_timeout: "\u4f9b\u5e94\u5546\u7ed3\u679c\u8f6e\u8be2\u8d85\u65f6\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    provider_result_unknown: "\u4f9b\u5e94\u5546\u7ed3\u679c\u72b6\u6001\u4e0d\u660e\u786e\uff0c\u8bf7\u5237\u65b0\u540e\u518d\u770b\uff1b\u5982\u4f9b\u5e94\u5546\u4fa7\u5df2\u751f\u6210\uff0c\u9700\u8981\u540e\u53f0\u590d\u6838\u3002",
    provider_output_download_failed: "\u4f9b\u5e94\u5546\u4ea7\u7269\u4e0b\u8f7d\u5931\u8d25\uff0c\u4efb\u52a1\u6ca1\u6709\u4fdd\u5b58\u56fe\u7247\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    provider_output_upload_failed: "\u4f9b\u5e94\u5546\u4ea7\u7269\u4e0a\u4f20\u5230\u5e73\u53f0\u5b58\u50a8\u5931\u8d25\uff0c\u79ef\u5206\u5df2\u8fd4\u8fd8\u3002\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    provider_output_persist_failed: "\u4f9b\u5e94\u5546\u4ea7\u7269\u5df2\u4e0a\u4f20\uff0c\u4f46\u5e73\u53f0\u8d44\u4ea7\u8bb0\u5f55\u4fdd\u5b58\u5931\u8d25\uff0c\u9700\u8981\u540e\u53f0\u4fee\u590d\u3002",
    provider_api_key_env_required: "\u4f9b\u5e94\u5546 API \u5bc6\u94a5\u73af\u5883\u53d8\u91cf\u672a\u914d\u7f6e\u3002",
    provider_api_key_missing: "\u4f9b\u5e94\u5546 API \u5bc6\u94a5\u7f3a\u5931\u3002",
    provider_adapter_missing: "\u4f9b\u5e94\u5546\u9002\u914d\u5668\u4e0d\u53ef\u7528\u3002",
    provider_circuit_open: "\u4f9b\u5e94\u5546\u7194\u65ad\u4fdd\u62a4\u5df2\u5f00\u542f\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002",
    worker_crashed_after_external_start: "\u4efb\u52a1\u5df2\u63d0\u4ea4\u5230\u4f9b\u5e94\u5546\uff0c\u4f46\u672c\u5730 Worker \u4e2d\u9014\u505c\u6b62\uff0c\u9700\u8981\u540e\u53f0\u590d\u6838\u3002",
    storage_put_object_required: "\u5e73\u53f0\u5b58\u50a8\u4e0a\u4f20\u80fd\u529b\u672a\u542f\u7528\u3002",
    model_not_configured: "\u5f53\u524d\u6a21\u578b\u672a\u914d\u7f6e\u3002",
    model_disabled: "\u5f53\u524d\u6a21\u578b\u7ef4\u62a4\u4e2d\u3002",
    model_task_mode_unsupported: "\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u8fd9\u4e2a\u751f\u6210\u6a21\u5f0f\u3002",
    model_media_type_mismatch: "\u5f53\u524d\u6a21\u578b\u5a92\u4f53\u7c7b\u578b\u4e0e\u8bf7\u6c42\u4e0d\u5339\u914d\u3002",
    model_reference_limit_exceeded: "\u53c2\u8003\u7d20\u6750\u6570\u91cf\u8d85\u8fc7\u6a21\u578b\u9650\u5236\u3002",
    model_reference_not_found: "\u53c2\u8003\u7d20\u6750\u4e0d\u5b58\u5728\u6216\u65e0\u6743\u8bbf\u95ee\u3002",
    model_reference_unavailable: "\u53c2\u8003\u7d20\u6750\u8fd8\u672a\u51c6\u5907\u597d\u3002",
    model_reference_mime_not_allowed: "\u53c2\u8003\u7d20\u6750\u683c\u5f0f\u4e0d\u53d7\u6a21\u578b\u652f\u6301\u3002",
    model_prompt_too_long: "\u63d0\u793a\u8bcd\u8fc7\u957f\u3002",
    insufficient_credits: "积分余额不足，请充值。",
  };
  return messages[failureCode] ??
    (failureCode
      ? `生成任务失败：${failureCode}`
      : "生成任务失败，请稍后重试。");
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
  if (value == null) {
    return null;
  }
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
  const fallbackTimeoutMs =
    readString(snapshot.kind) === "video"
      ? videoGenerationTaskTimeoutMs
      : imageGenerationTaskTimeoutMs;
  const createdAtTimeout = snapshot.requestedAt
    ? new Date(new Date(String(snapshot.requestedAt)).getTime() + fallbackTimeoutMs)
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
            AND (
              (
                input_snapshot_json->>'kind' = 'video'
                AND (input_snapshot_json->>'requestedAt')::timestamptz < ($1::timestamptz - interval '3 hours')
              )
              OR (
                COALESCE(input_snapshot_json->>'kind', '') <> 'video'
                AND (input_snapshot_json->>'requestedAt')::timestamptz < ($1::timestamptz - interval '15 minutes')
              )
            )
          )
          OR (
            input_snapshot_json->>'timeoutAt' IS NULL
            AND input_snapshot_json->>'requestedAt' IS NULL
            AND (
              (
                task_type = 'episode_generate_video'
                AND created_at < ($1::timestamptz - interval '3 hours')
              )
              OR (
                task_type <> 'episode_generate_video'
                AND created_at < ($1::timestamptz - interval '15 minutes')
              )
            )
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
      LEFT JOIN ai_model_configs task_model_config
        ON task_model_config.model_code = COALESCE(t.input_snapshot_json->>'modelCode', t.input_snapshot_json->>'model')
      LEFT JOIN provider_requests pr
        ON pr.task_id = t.id
       AND pr.workspace_id IS NOT DISTINCT FROM t.workspace_id
       AND (
         (task_model_config.provider_protocol = 'lingdong_api' AND pr.provider_name = task_model_config.provider_name)
         OR (task_model_config.provider_protocol IS DISTINCT FROM 'lingdong_api' AND pr.provider_name = 'volcengine')
       )
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
  const snapshotModelCode = readString(snapshot.modelCode) || readString(snapshot.model);
  const modelConfig = await findActiveAiModelConfigByCode(db, snapshotModelCode || "seedance-i2v-pro");
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
        providerMessage: generationProviderMessageForClient(readString(poll.redactedResponse.providerMessage)),
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
    provider: isLingdongModelConfig(modelConfig) ? modelConfig!.providerName : "seedance",
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
        provider: isLingdongModelConfig(modelConfig) ? modelConfig!.providerName : "seedance",
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
          provider: isLingdongModelConfig(modelConfig) ? modelConfig!.providerName : "seedance",
          externalRequestId: row.external_request_id,
          failureCode,
          errorMessage: translateProviderErrorMessage(error instanceof Error ? error.message : String(error)),
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
        providerMessage: translateProviderErrorMessage(error instanceof Error ? error.message : String(error)),
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
        provider: isLingdongModelConfig(modelConfig) ? modelConfig!.providerName : "seedance",
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
  const dispatchPolicy = requestedModelCode
    ? await findActiveAiModelDispatchPolicyByModelCode(db, requestedModelCode)
    : undefined;
  const generationQueueConfig = loadGenerationQueueConfig(input.env);
  const fallbackSubmitQueueName = input.kind === "video"
    ? generationQueueConfig.queues.submitVideo
    : generationQueueConfig.queues.submitImage;
  const rawParameters = input.body.parameters && typeof input.body.parameters === "object"
    ? input.body.parameters as Record<string, unknown>
    : {};
  const modelExecution = resolveGenerationModelExecution({
    kind: input.kind,
    modelCode: requestedModelCode,
    modelConfig,
    dispatchPolicy,
    parameters: rawParameters,
    fallbackQueueName: fallbackSubmitQueueName,
  });
  const shouldUseBullMQDispatch =
    generationQueueConfig.outboxDispatcherEnabled && modelExecution.providerExecutor !== "mock";
  if (shouldUseBullMQDispatch) {
    const queueReady = await isRedisReachable(generationQueueConfig.redisUrl, 500);
    if (!queueReady) {
      throw new GenerationRequestValidationError(
        "generation_queue_unavailable",
        "生成队列未启动：请先启动 Redis、generation-outbox 和 generation-worker。",
      );
    }
  }
  const estimatedCost = generationCostFromModelConfig(config.cost, modelConfig, {
    ...modelExecution.parameters,
    ...rawParameters,
  });
  const hasMembership = await hasActiveGenerationMembership(db, {
    userId: context.actor.actorId,
    now: input.now,
  });
  if (!hasMembership) {
    throw new GenerationMembershipRequiredError();
  }
  if (modelConfig) {
    validateGenerationModelRequest({
      kind: input.kind,
      modelCode: requestedModelCode,
      modelConfig,
      parameters: modelExecution.parameters,
      prompt: String(input.body.prompt ?? input.body.promptOverride ?? input.body.motionPrompt ?? ""),
    });
  }
  const referenceAssetVersionIds = input.kind === "image"
    ? readGenerationReferenceAssetVersionIds(input.body, modelExecution.parameters)
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
        ...modelExecution.parameters,
        referenceImages: [
          ...readArray(modelExecution.parameters.referenceImages),
          ...resolvedReferenceImages,
        ],
      }
    : modelExecution.parameters;
  const generationPriority = await resolveMembershipGenerationPriority(db, {
    userId: context.actor.actorId,
    modelCode: requestedModelCode,
    now: input.now,
  });
  const generationPrioritySnapshot = generationPriority.enabled
    ? {
        membershipPriority: true,
        queuePriority: generationPriority.priority,
        priorityReason: generationPriority.reason,
      }
    : {};
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
    teamMemberId: context.actor.teamMember?.id ?? null,
    ...generationPrioritySnapshot,
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
  const snapshotTargetId = isUuid(requestSnapshot.targetId)
    ? requestSnapshot.targetId
    : input.episodeId;
  const timeoutMs = input.kind === "video" ? videoGenerationTaskTimeoutMs : imageGenerationTaskTimeoutMs;
  const timeoutAt = new Date(input.now.getTime() + timeoutMs);
  const workflow = await createWorkflowWithTasks(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId!,
    projectId: context.project.id,
    workflowType: config.workflowType,
    inputSnapshot: {
      ...requestSnapshot,
      requestedAt: input.now.toISOString(),
      timeoutAt: timeoutAt.toISOString(),
      mockExecutor: modelExecution.providerExecutor === "mock",
      providerExecutor: modelExecution.providerExecutor,
    },
    createdByUserId: context.userId,
    tasks: [
      {
        taskType: config.taskType,
        queueName: shouldUseBullMQDispatch ? modelExecution.queueName : config.queueName,
        targetEntityType,
        targetEntityId,
        inputSnapshot: {
          ...requestSnapshot,
          cost: estimatedCost,
          requestedAt: input.now.toISOString(),
          timeoutAt: timeoutAt.toISOString(),
          mockExecutor: modelExecution.providerExecutor === "mock",
          providerExecutor: modelExecution.providerExecutor,
        },
      },
    ],
  });
  const task = workflow.tasks[0]!;
  const baseBillingMetadata = {
    targetUserId: context.userId,
    memberId: context.actor.teamMember?.id ?? undefined,
    targetMembershipId: context.actor.membershipId,
    taskId: task.id,
    workflowId: workflow.workflow.id,
    projectId: context.project.id,
    workspaceId: context.actor.workspaceId,
    episodeId: input.episodeId,
    mediaType: input.kind,
    kind: input.kind,
    modelCode: requestedModelCode,
    providerExecutor: modelExecution.providerExecutor,
    taskMode: modelExecution.taskMode,
    targetType: requestSnapshot.targetType,
    targetId: snapshotTargetId,
    canvasNodeId: requestSnapshot.targetType === "canvas" ? requestSnapshot.targetId : undefined,
    amount: estimatedCost,
    requestedAt: input.now,
    prompt: requestSnapshot.prompt,
    parameters: requestSnapshot.parameters,
    referenceCount: input.kind === "image" ? referenceAssetVersionIds.length : 0,
  };

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

  const teamMemberId = context.actor.teamMember?.id ?? null;
  let creditReservationId: string | null = null;
  let creditSummary: Record<string, unknown> = {};
  await upsertQueuedGenerationTaskSnapshot(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    targetType: requestSnapshot.targetType,
    targetId: snapshotTargetId,
    workflowId: workflow.workflow.id,
    taskId: task.id,
    modelConfigId: modelConfig?.id ?? null,
    creditReservationId: null,
    modelCode: requestedModelCode,
    mediaType: input.kind,
    taskMode: modelExecution.taskMode,
    estimatedCredits: estimatedCost,
    requestSummary: {
      prompt: requestSnapshot.prompt,
      parameters: requestSnapshot.parameters,
      targetType: requestSnapshot.targetType,
      targetId: snapshotTargetId,
      ...(requestSnapshot.targetType === "canvas" ? { canvasNodeId: requestSnapshot.targetId } : {}),
      referenceCount: input.kind === "image" ? referenceAssetVersionIds.length : 0,
      teamMemberId,
    },
    creditSummary,
    now: input.now,
  });
  if (teamMemberId) {
    const consumedAt = input.now;
    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const member = await queryOne<{ member_credits: number | string }>(
      db,
      `
        SELECT member_credits
        FROM team_members
        WHERE id = $1
          AND user_id = $2
          AND status = 'active'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [teamMemberId, context.userId],
    );
    const availableCredits = Number(member?.member_credits ?? 0);
    if (availableCredits < estimatedCost) {
      return failCreatedGenerationTaskBeforeDispatch(db, {
        taskId: task.id,
        workflowId: workflow.workflow.id,
        startedRecord: started.record,
        store,
        sessionToken: input.authenticated.sessionToken,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
        failureCode: "insufficient_credits",
      });
    }
    await db.query("BEGIN");
    try {
      await db.query(
        `
          UPDATE team_members
          SET member_credits = member_credits - $2,
              updated_at = $3
          WHERE id = $1
            AND user_id = $4
            AND status = 'active'
            AND deleted_at IS NULL
            AND member_credits >= $2
        `,
        [teamMemberId, estimatedCost, consumedAt, context.userId],
      );
      const updated = await queryOne<{ member_credits: number | string }>(
        db,
        `
          SELECT member_credits
          FROM team_members
          WHERE id = $1
            AND user_id = $2
            AND status = 'active'
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [teamMemberId, context.userId],
      );
      if (!updated || Number(updated.member_credits ?? 0) < 0) {
        throw new InsufficientCreditsError();
      }
      await queryOne<{ id: string }>(
        db,
        `
          INSERT INTO credit_ledger_entries (
            id,
            organization_id,
            user_id,
            reservation_id,
            allocation_id,
            entry_type,
            amount,
            available_delta,
            reserved_delta,
            consumed_delta,
            source_type,
            source_id,
            reason,
            metadata_json,
          created_by_user_id,
          created_at
        )
        VALUES (
            $1, $2, $3, NULL, NULL, 'transfer_out', $4, -($4::int), 0, 0,
            'team_member_generation_task', $5, $6, $7::jsonb, $3, $8
          )
          RETURNING id
        `,
        [
          randomUUID(),
          context.actor.organizationId,
          context.userId,
          estimatedCost,
          sourceId,
          `${input.kind} generation`,
          JSON.stringify(buildGenerationBillingMetadata({
            ...baseBillingMetadata,
            memberId: teamMemberId,
            billingEvent: "consumed",
            outcome: "consumed",
            settledAt: consumedAt,
          })),
          consumedAt,
        ],
      );
      await db.query("COMMIT");
      creditSummary = {
        consumed: estimatedCost,
        settledAt: consumedAt.toISOString(),
        memberId: teamMemberId,
        sourceId,
      };
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      if (isInsufficientCreditsFailure(error)) {
        return failCreatedGenerationTaskBeforeDispatch(db, {
          taskId: task.id,
          workflowId: workflow.workflow.id,
          startedRecord: started.record,
          store,
          sessionToken: input.authenticated.sessionToken,
          runtime: input.runtime,
          signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          now: input.now,
          failureCode: "insufficient_credits",
        });
      }
      throw error;
    }
  } else {
    const reservation = await reserveCredits(db, {
      compatibilityOrganizationId: context.actor.organizationId,
      userId: context.userId,
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      amount: estimatedCost,
      sourceType: "episode_generation_task",
      sourceId: task.id,
      reason: `${input.kind} generation`,
      metadata: buildGenerationBillingMetadata({
        ...baseBillingMetadata,
        billingEvent: "reserved",
        outcome: "reserved",
        settledAt: input.now,
      }),
      createdByUserId: context.userId,
      now: input.now,
    }).catch(async (error) => {
      if (isInsufficientCreditsFailure(error)) {
        return failCreatedGenerationTaskBeforeDispatch(db, {
          taskId: task.id,
          workflowId: workflow.workflow.id,
          startedRecord: started.record,
          store,
          sessionToken: input.authenticated.sessionToken,
          runtime: input.runtime,
          signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          now: input.now,
          failureCode: "insufficient_credits",
        });
      }
      throw error;
    });
    if ("status" in reservation) {
      return reservation;
    }
    creditReservationId = reservation.reservation.id;
    creditSummary = {
      reservationId: reservation.reservation.id,
      reserved: estimatedCost,
    };
  }

  await upsertQueuedGenerationTaskSnapshot(db, {
    organizationId: context.actor.organizationId,
    workspaceId: context.actor.workspaceId,
    projectId: context.project.id,
    episodeId: input.episodeId,
    targetType: requestSnapshot.targetType,
    targetId: snapshotTargetId,
    workflowId: workflow.workflow.id,
    taskId: task.id,
    modelConfigId: modelConfig?.id ?? null,
    creditReservationId,
    modelCode: requestedModelCode,
    mediaType: input.kind,
    taskMode: modelExecution.taskMode,
    estimatedCredits: estimatedCost,
    requestSummary: {
      prompt: requestSnapshot.prompt,
      parameters: requestSnapshot.parameters,
      targetType: requestSnapshot.targetType,
      targetId: snapshotTargetId,
      ...(requestSnapshot.targetType === "canvas" ? { canvasNodeId: requestSnapshot.targetId } : {}),
      referenceCount: input.kind === "image" ? referenceAssetVersionIds.length : 0,
      teamMemberId,
    },
    creditSummary,
    now: input.now,
  });

  const reservation = creditReservationId
    ? { reservation: { id: creditReservationId } }
    : null;

  if (modelConfig && modelExecution.providerExecutor !== "mock") {
    const payloadRef = `creator://episodes/${input.episodeId}/${input.kind}/${task.id}`;
    const requestBody = {
      prompt: requestSnapshot.prompt,
      ...(input.kind === "video" ? { motionPrompt: requestSnapshot.prompt } : {}),
      ...(requestSnapshot.firstFrameUrl ? { firstFrameUrl: requestSnapshot.firstFrameUrl } : {}),
      parameters: requestSnapshot.parameters,
      episodeId: input.episodeId,
      targetType: requestSnapshot.targetType,
      targetId: requestSnapshot.targetId,
    };
    const requestKey = `${workflow.workflow.id}:${task.id}`;
    const requestHash = sha256(`${task.id}:${requestedModelCode}:${requestSnapshot.prompt}`);
    const payloadHash = input.kind === "video"
      ? sha256(`${payloadRef}:${requestSnapshot.prompt}:${requestSnapshot.firstFrameUrl ?? ""}`)
      : sha256(`${payloadRef}:${requestSnapshot.prompt}`);
    const providerOperation = input.kind === "video"
      ? operationNames.episodeVideoGenerate
      : operationNames.episodeImageGenerate;
    const preparedProviderRequest = await createOrReuseProviderRequest(db, {
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: null,
      providerName: modelConfig.providerName,
      providerOperation,
      requestKey,
      requestHash,
      payloadRef,
      payloadHash,
      redactedPayload: requestBody,
      createdByUserId: context.userId,
      now: input.now,
    });
    await createUserModelRequestLog(db, {
      providerRequestId: preparedProviderRequest.request.id,
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: null,
      userId: context.userId,
      providerName: modelConfig.providerName,
      providerOperation,
      modelId: requestedModelCode,
      providerModel: modelConfig.providerModel,
      requestKey,
      requestHash,
      payloadHash,
      payloadSummary: null,
      requestFormat: "generation_task",
      requestBody,
      requestText: null,
      now: input.now,
    });
  }

  const refundTeamMemberGenerationCredits = async (input: {
    reason: string;
    failureCode?: string;
    providerRequestId?: string | null;
    now: Date;
  }) => {
    if (!teamMemberId || creditReservationId) {
      return;
    }
    await releaseSimpleTeamMemberCredits(db, {
      organizationId: context.actor.organizationId,
      teamMemberId,
      amount: estimatedCost,
      sourceId: task.id,
      reason: input.reason,
      metadata: {
        ...baseBillingMetadata,
        memberId: teamMemberId,
        taskId: task.id,
        ...(input.failureCode ? { failureCode: input.failureCode } : {}),
        ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
      },
      now: input.now,
    });
  };

  if (shouldUseBullMQDispatch) {
    await appendGenerationTaskCreatedOutboxEvent(db, {
      organizationId: context.actor.organizationId,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      kind: input.kind,
      modelCode: requestedModelCode,
      queueName: modelExecution.queueName,
      targetType: requestSnapshot.targetType,
      targetId: requestSnapshot.targetId,
      providerExecutor: modelExecution.providerExecutor,
      ...generationPrioritySnapshot,
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

  if (modelExecution.providerExecutor === "gpt-image-2" || modelExecution.providerExecutor === "image-http") {
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
      const providerLabel = modelConfig.providerName || requestSnapshot.model || "image-provider";
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

      if (reservation) {
        await settleReservationAllocation(db, {
          reservationId: reservation.reservation.id,
          allocationKey: "gpt-image-2-result",
          amount: estimatedCost,
          outcome: "consumed",
          taskId: task.id,
          attemptId: claim.attempt.id,
          providerRequestId,
          metadata: buildGenerationBillingMetadata({
            ...baseBillingMetadata,
            attemptId: claim.attempt.id,
            billingEvent: "consumed",
            outcome: "consumed",
            provider: providerLabel,
            providerRequestId,
            externalRequestId: submitted.request.externalRequestId,
            settledAt: input.now,
          }),
          now: input.now,
        });
      }
      await markGenerationTaskSnapshotSucceeded(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        providerRequestId,
        resultAssets: [persisted],
        providerStatus: {
          provider: providerLabel,
          externalRequestId: submitted.request.externalRequestId,
        },
        creditSummary: {
          consumed: estimatedCost,
          settledAt: input.now.toISOString(),
        },
        now: input.now,
      });
      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "succeeded",
        now: input.now,
      });
      await aggregateWorkflowStatus(db, workflow.workflow.id);

      const responseBody = await mapGenerationTaskResponse(db, {
        taskId: task.id,
        sessionToken: input.authenticated.sessionToken,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      });
      await syncProjectAssetGenerationTaskMetadata(db, {
        task: responseBody as Record<string, unknown>,
        organizationId: context.actor.organizationId,
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
      const apiKeyEnv = readErrorApiKeyEnv(error);
      await finalizeTaskAttempt(db, {
        taskId: task.id,
        attemptId: claim.attempt.id,
        status: "failed",
        failureCode,
        now: input.now,
      });
      await aggregateWorkflowStatus(db, workflow.workflow.id);
      if (reservation) {
        await settleReservationAllocation(db, {
          reservationId: reservation.reservation.id,
          allocationKey: failureCode,
          amount: estimatedCost,
          outcome: "released",
          taskId: task.id,
          attemptId: claim.attempt.id,
          providerRequestId,
          metadata: buildGenerationBillingMetadata({
            ...baseBillingMetadata,
            attemptId: claim.attempt.id,
            billingEvent: "released",
            outcome: "released",
            provider: "model-gateway",
            providerRequestId,
            failureCode,
            errorMessage: translateProviderErrorMessage(error instanceof Error ? error.message : String(error)),
            settledAt: input.now,
          }),
          now: input.now,
        });
      } else {
        await refundTeamMemberGenerationCredits({
          reason: `${input.kind} generation失败返还积分`,
          failureCode,
          providerRequestId,
          now: input.now,
        });
      }
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
          providerMessage: translateProviderErrorMessage(error instanceof Error ? error.message : String(error)),
          ...(apiKeyEnv ? { apiKeyEnv } : {}),
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

      if (failureCode === "provider_api_key_missing" || failureCode === "provider_api_key_env_required") {
        const message = generationFailureDisplayMessage({ failureCode });
        return {
          status: 502 as const,
          body: envelopedError(502, failureCode, apiKeyEnv ? `${message} 缺失项：${apiKeyEnv}` : message, {
            taskId: task.id,
            workflowId: workflow.workflow.id,
            apiKeyEnv,
            creditReleased: estimatedCost,
          }).body,
        };
      }

      return { status: 200 as const, body: responseBody };
    }
  }

  if (modelExecution.providerExecutor === "seedance" && !shouldUseBullMQDispatch) {
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
    const submitted = await submitProviderRequest(db, {
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      providerName: videoProviderNameForModelConfig(modelConfig),
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
    await createUserModelRequestLog(db, {
      providerRequestId: submitted.request.id,
      workspaceId: context.actor.workspaceId,
      projectId: context.project.id,
      workflowId: workflow.workflow.id,
      taskId: task.id,
      attemptId: claim.attempt.id,
      userId: context.userId,
      providerName: videoProviderNameForModelConfig(modelConfig),
      providerOperation: operationNames.episodeVideoGenerate,
      modelId: String(requestSnapshot.model ?? "seedance-i2v-pro"),
      providerModel: videoProviderModelForModelConfig(modelConfig, requestSnapshot.model),
      requestKey: `${workflow.workflow.id}:${task.id}`,
      requestHash: sha256(`${task.id}:${requestSnapshot.model}:${requestSnapshot.prompt}`),
      payloadHash,
      payloadSummary: null,
      requestBody: {
        prompt: requestSnapshot.prompt,
        motionPrompt: requestSnapshot.prompt,
        firstFrameUrl: requestSnapshot.firstFrameUrl,
        parameters: requestSnapshot.parameters,
        episodeId: input.episodeId,
        targetType: requestSnapshot.targetType,
        targetId: requestSnapshot.targetId,
      },
      requestText: null,
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
  const isTeamAssetTarget = requestSnapshot.targetType === "team_asset";
  const targetAsset = isTeamAssetTarget
    ? null
    : await resolveEpisodeGenerationTargetAsset(db, {
        organizationId: context.actor.organizationId,
        projectId: context.project.id,
        episodeId: input.episodeId,
        targetType: requestSnapshot.targetType,
        targetId: requestSnapshot.targetId,
        assetType: resultAssetType,
      });
  const targetMetadata = targetAsset?.metadata ?? {};
  const createdAssetVersion = isTeamAssetTarget
    ? null
    : await createAssetVersionSnapshot(db, {
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
  if (isTeamAssetTarget && isUuid(requestSnapshot.targetId)) {
    await db.query(
      `
        UPDATE team_assets
        SET asset_status = 'active',
            asset_url = $2,
            resource_size = COALESCE((SELECT size_bytes FROM storage_objects WHERE id = $3), resource_size),
            updated_at = $4
        WHERE id = $1
          AND admin_user_id = $5
      `,
      [requestSnapshot.targetId, urls.previewUrl, storageObject.id, input.now, context.actor.actorId],
    );
  }

  if (reservation) {
    await settleReservationAllocation(db, {
      reservationId: reservation.reservation.id,
      allocationKey: "mock-result",
      amount: estimatedCost,
      outcome: "consumed",
      taskId: task.id,
      attemptId: claim.attempt.id,
      metadata: buildGenerationBillingMetadata({
        ...baseBillingMetadata,
        attemptId: claim.attempt.id,
        billingEvent: "consumed",
        outcome: "consumed",
        provider: "mock",
        settledAt: input.now,
      }),
      now: input.now,
    });
  }
  await markGenerationTaskSnapshotSucceeded(db, {
    taskId: task.id,
    attemptId: claim.attempt.id,
    resultAssets: [
      {
        assetId: createdAssetVersion?.asset.id ?? null,
        assetVersionId: createdAssetVersion?.version.id ?? null,
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
  await finalizeTaskAttempt(db, {
    taskId: task.id,
    attemptId: claim.attempt.id,
    status: "succeeded",
    now: input.now,
  });
  await aggregateWorkflowStatus(db, workflow.workflow.id);

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

function buildGenerationBillingMetadata(input: {
  billingEvent: "reserved" | "consumed" | "released" | "manual_review_required";
  outcome: string;
  taskId: string;
  workflowId?: string | null;
  projectId?: string | null;
  workspaceId?: string | null;
  episodeId?: string | null;
  mediaType?: string | null;
  kind?: string | null;
  modelCode?: string | null;
  providerExecutor?: string | null;
  provider?: string | null;
  taskMode?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  canvasNodeId?: string | null;
  amount?: number | string | null;
  requestedAt?: Date | string | null;
  settledAt?: Date | string | null;
  attemptId?: string | null;
  providerRequestId?: string | null;
  externalRequestId?: string | null;
  prompt?: string | null;
  parameters?: Record<string, unknown> | null;
  referenceCount?: number | string | null;
  failureCode?: string | null;
  errorMessage?: string | null;
  storageObjectKey?: string | null;
}) {
  const requestedAt = toIsoString(input.requestedAt);
  const settledAt = toIsoString(input.settledAt);
  const durationMs = requestedAt && settledAt
    ? Math.max(0, new Date(settledAt).getTime() - new Date(requestedAt).getTime())
    : null;
  const prompt = String(input.prompt ?? "");
  return removeUndefinedValues({
    billingEvent: input.billingEvent,
    outcome: input.outcome,
    status: input.outcome,
    taskId: input.taskId,
    workflowId: input.workflowId,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    episodeId: input.episodeId,
    mediaType: input.mediaType,
    kind: input.kind ?? input.mediaType,
    modelCode: input.modelCode,
    providerExecutor: input.providerExecutor,
    provider: input.provider,
    taskMode: input.taskMode,
    targetType: input.targetType,
    targetId: input.targetId,
    canvasNodeId: input.canvasNodeId,
    amount: Number(input.amount ?? 0),
    requestedAt,
    settledAt,
    durationMs,
    attemptId: input.attemptId,
    providerRequestId: input.providerRequestId,
    externalRequestId: input.externalRequestId,
    promptPreview: truncateForLedger(prompt, 180),
    promptLength: prompt.length,
    parameterSummary: summarizeGenerationParameters(input.parameters),
    referenceCount: Number(input.referenceCount ?? 0),
    failureCode: input.failureCode,
    errorMessage: truncateForLedger(input.errorMessage ?? "", 240),
    storageObjectKey: input.storageObjectKey,
  });
}

function summarizeGenerationParameters(parameters: Record<string, unknown> | null | undefined) {
  const source = parameters ?? {};
  return removeUndefinedValues({
    aspectRatio: readString(source.aspectRatio) ?? readString(source.ratio),
    resolution: readString(source.resolution) ?? readString(source.quality),
    duration: readString(source.duration) ?? readString(source.durationSeconds),
    mode: readString(source.mode) ?? readString(source.taskMode),
    referenceImages: readArray(source.referenceImages).length,
    referenceAssetVersionIds: readArray(source.referenceAssetVersionIds).length,
  });
}

function truncateForLedger(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== ""),
  ) as T;
}

function isRedisReachable(redisUrl: string, timeoutMs: number) {
  return new Promise<boolean>((resolveReady) => {
    let url: URL;
    try {
      url = new URL(redisUrl);
    } catch {
      resolveReady(false);
      return;
    }
    const socket = net.createConnection({
      host: url.hostname || "127.0.0.1",
      port: url.port ? Number(url.port) : 6379,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      resolveReady(false);
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolveReady(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      resolveReady(false);
    });
  });
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
      "Reference asset count exceeds model limits",
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
        "Reference asset was not found or is inaccessible",
      );
    }
    if (row.storage_status && row.storage_status !== "available") {
      throw new GenerationRequestValidationError(
        "model_reference_unavailable",
        "Reference asset is unavailable",
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
        "閸欏倽鈧啰绀岄弶鎰壐瀵繋绗夌粭锕€鎮庤ぐ鎾冲濡€崇€烽柊宥囩枂",
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

function parseMetadataJson(value: Record<string, unknown> | string | null | undefined): Record<string, unknown> {
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
    context?: NonNullable<Awaited<ReturnType<typeof getEpisodeContext>>>;
  },
) {
  const context =
    input.context ??
    (await getEpisodeContext(db, {
      episodeId: input.episodeId,
      sessionToken: input.sessionToken,
      userId: input.userId,
      capability: input.capability,
      now: input.now,
    }));
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
      urls?.sourceUrl ??
      metadataSourceUrl ??
      input.version.metadata.imageUrl ??
      metadataPreviewUrl ??
      null,
    downloadUrl:
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
    return "閼奉亜绻侀惃鍕潡閼瑰弶寮挎潻甯礉闂呭繑鍓伴弴瀛樻暭";
  }
  if (kind === "scene") {
    return "Scene description pending.";
  }
  return "Prop description pending.";
}

function matchesEpisodeScopedAsset(
  metadata: Record<string, unknown> | null | undefined,
  episodeId: string,
) {
  return typeof metadata?.episodeId === "string" && metadata.episodeId === episodeId;
}

function normalizeAssetNameForSameEpisodeMatch(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/^[@#]+/, "")
    .toLowerCase();
}

function hasRealEpisodeAssetPreview(metadata: Record<string, unknown> | null | undefined) {
  const preview = resolvePreferredEpisodeImageUrl(
    metadata?.fixedImageUrl,
    metadata?.previewUrl,
    metadata?.sourceUrl,
    metadata?.downloadUrl,
  );
  return Boolean(preview && !isMockEpisodeImageUrl(preview));
}

async function findSameNameProjectAssetImage(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    assetType: "character_sheet" | "scene_reference" | "prop_reference";
    episodeId: string;
    name: string;
  },
) {
  const normalizedName = normalizeAssetNameForSameEpisodeMatch(input.name);
  if (!normalizedName) {
    return null;
  }
  const rows = await db.query<{
    asset_id: string;
    asset_key: string;
    version_id: string;
    storage_object_id: string | null;
    storage_object_key: string | null;
    metadata_json: Record<string, unknown> | string | null;
    content_type: string | null;
  }>(
    `
      SELECT
        a.id AS asset_id,
        a.asset_key,
        v.id AS version_id,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        s.content_type
      FROM assets a
      JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC, created_at DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN storage_objects s
        ON s.organization_id = v.organization_id
       AND s.id = v.storage_object_id
      WHERE a.organization_id = $1
        AND a.project_id = $2
        AND a.asset_type = $3
      ORDER BY a.updated_at DESC, a.id DESC
    `,
    [input.organizationId, input.projectId, input.assetType],
  );
  for (const row of rows.rows) {
    const metadata = parseMetadataJson(row.metadata_json);
    if (matchesEpisodeScopedAsset(metadata, input.episodeId)) {
      continue;
    }
    const candidateNames = [
      metadata.label,
      metadata.name,
      row.asset_key,
      row.asset_key.replace(/^(?:character|role|scene|prop|asset)[-_]/i, "").replace(/[-_][a-f0-9]{6,}$/i, ""),
    ];
    if (!candidateNames.some((name) => normalizeAssetNameForSameEpisodeMatch(name) === normalizedName)) {
      continue;
    }
    const previewUrl = resolvePreferredEpisodeImageUrl(
      metadata.fixedImageUrl,
      metadata.previewUrl,
      metadata.sourceUrl,
      metadata.downloadUrl,
    );
    if (!row.storage_object_id && (!previewUrl || isMockEpisodeImageUrl(previewUrl))) {
      continue;
    }
    return {
      assetId: row.asset_id,
      versionId: row.version_id,
      storageObjectId: row.storage_object_id,
      storageObjectKey: row.storage_object_key,
      previewUrl,
      sourceUrl: readString(metadata.sourceUrl) || previewUrl,
      downloadUrl: readString(metadata.downloadUrl) || previewUrl,
      contentType: row.content_type ?? readString(metadata.mimeType) ?? "image/png",
    };
  }
  return null;
}

async function persistSameNameProjectAssetImageForEpisodeAsset(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    projectId: string;
    episodeId: string;
    assetId: string;
    assetType: "character_sheet" | "scene_reference" | "prop_reference";
    versionId: string;
    metadata: Record<string, unknown>;
    sessionToken: string;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
  },
) {
  if (hasRealEpisodeAssetPreview(input.metadata)) {
    return input.metadata;
  }
  const name = readString(input.metadata.label) || readString(input.metadata.name);
  const matchedImage = await findSameNameProjectAssetImage(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    assetType: input.assetType,
    episodeId: input.episodeId,
    name,
  });
  if (!matchedImage) {
    return input.metadata;
  }
  const signedUrls = matchedImage.storageObjectId
    ? await signedUrlsForStorageObject(db, {
        sessionToken: input.sessionToken,
        storageObjectId: matchedImage.storageObjectId,
        runtime: input.runtime,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        now: input.now,
      })
    : null;
  const previewUrl = resolvePreferredEpisodeImageUrl(
    matchedImage.previewUrl,
    signedUrls?.previewUrl,
    signedUrls?.sourceUrl,
    matchedImage.sourceUrl,
    matchedImage.downloadUrl,
  );
  if (!previewUrl) {
    return input.metadata;
  }
  const metadata = {
    ...input.metadata,
    fixedImageFileId: matchedImage.versionId,
    fixedImageStorageObjectId: matchedImage.storageObjectId,
    fixedImageUrl: previewUrl,
    previewUrl,
    sourceUrl: matchedImage.sourceUrl,
    downloadUrl: matchedImage.downloadUrl,
    mimeType: matchedImage.contentType,
    importedFromProjectAssetId: matchedImage.assetId,
    importedFromProjectAssetVersionId: matchedImage.versionId,
  };
  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $3::jsonb
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, input.versionId, JSON.stringify(metadata)],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, input.assetId, input.now],
  );
  return metadata;
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
    context?: NonNullable<Awaited<ReturnType<typeof getEpisodeContext>>>;
  },
) {
  const normalized = normalizeEpisodeAssetType(input.assetType);
  const context = input.context ?? (await getEpisodeContext(db, {
      episodeId: input.episodeId,
      sessionToken: input.sessionToken,
      userId: input.userId,
      capability: input.capability === null ? undefined : input.capability ?? capabilities.generationStart,
      now: input.now,
    }));
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
      ORDER BY a.created_at ASC, a.id ASC
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
        const hydratedMetadata = row.version_id
          ? await persistSameNameProjectAssetImageForEpisodeAsset(db, {
              organizationId: context.actor.organizationId,
              projectId: context.project.id,
              episodeId: input.episodeId,
            assetId: row.asset_id,
            assetType: normalized.assetType,
            versionId: row.version_id,
            metadata,
            sessionToken: input.sessionToken,
            runtime: input.runtime,
            signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
            now: input.now,
          })
          : metadata;
        const fixedImageFileId =
          typeof hydratedMetadata.fixedImageFileId === "string" ? hydratedMetadata.fixedImageFileId : null;
        const fixedImageStorageObjectId =
          typeof hydratedMetadata.fixedImageStorageObjectId === "string" ? hydratedMetadata.fixedImageStorageObjectId : null;
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
                context,
              })
            : null;
        const persistedFixedPreviewUrl =
          resolvePreferredEpisodeImageUrl(
            hydratedMetadata.fixedImageUrl,
            hydratedMetadata.previewUrl,
            fixedImageVersion?.assetVersion.previewUrl,
            fixedImageVersion?.assetVersion.metadata?.previewUrl,
          ) ?? "";
        const fixedImageStorageObjectIdForUrls =
          fixedImageVersion?.assetVersion.storageObjectId ?? fixedImageStorageObjectId ?? row.storage_object_id;
        const urls = !persistedFixedPreviewUrl && fixedImageStorageObjectIdForUrls
          ? await signedUrlsForStorageObject(db, {
              sessionToken: input.sessionToken,
              storageObjectId: fixedImageStorageObjectIdForUrls,
              runtime: input.runtime,
              signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
              now: input.now,
            })
          : null;
        return {
          assetId: row.asset_id,
          assetType: normalized.kind,
          name: String(hydratedMetadata.label ?? row.asset_key ?? "Untitled asset"),
          description: String(hydratedMetadata.description ?? ""),
          fixedImageFileId: fixedImageVersion?.assetVersion.versionId ?? fixedImageFileId ?? row.version_id,
          fixedImageStorageObjectId:
            fixedImageVersion?.assetVersion.storageObjectId ?? fixedImageStorageObjectId ?? row.storage_object_id,
          fixedImageUrl: persistedFixedPreviewUrl || urls?.previewUrl || String(hydratedMetadata.fixedImageUrl ?? hydratedMetadata.previewUrl ?? ""),
          voiceId: typeof hydratedMetadata.voiceId === "string" ? hydratedMetadata.voiceId : null,
          voiceName: typeof hydratedMetadata.voiceName === "string" ? hydratedMetadata.voiceName : null,
          voiceSource: typeof hydratedMetadata.voiceSource === "string" ? hydratedMetadata.voiceSource : null,
          dubbingConfig:
            hydratedMetadata.dubbingConfig && typeof hydratedMetadata.dubbingConfig === "object"
              ? hydratedMetadata.dubbingConfig
              : null,
          sortOrder: Number(hydratedMetadata.sortOrder ?? 0),
          updatedAt: new Date(row.asset_updated_at).toISOString(),
          createdAt: new Date(row.asset_created_at).toISOString(),
        };
      }),
  );
  return items.filter(Boolean);
}

async function listEpisodeStoryboardsFromDb(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    episodeId: string;
    sessionToken: string;
    userId: string;
    runtime: UploadSessionRuntime | null;
    signedUrlExpiresInSeconds: number;
    now: Date;
    page?: number;
    pageSize?: number;
    includeDraftPayload?: boolean;
  },
) {
  const context = await getEpisodeReadContext(db, {
    episodeId: input.episodeId,
    sessionToken: input.sessionToken,
    now: input.now,
  });
  if (!context) {
    return null;
  }

  // organization_id is retained only to address legacy rows after project access is authorized.
  const compatibilityOrganizationId = context.episode.organization_id;
  const page = Number.isFinite(input.page ?? NaN) ? Math.max(1, Math.floor(input.page ?? 1)) : null;
  const pageSize = Number.isFinite(input.pageSize ?? NaN) ? Math.max(1, Math.floor(input.pageSize ?? 0)) : null;
  const usePagination = page !== null && pageSize !== null;

  const shotRows = await db.query<{
    id: string;
    title: string;
    description: string;
    scene_analysis: string;
    plot_preview: string;
    sort_order: number | string;
    image_status: string;
    video_status: string;
    current_image_asset_version_id: string | null;
    current_video_asset_version_id: string | null;
    image_storage_object_id: string | null;
    image_metadata_json: Record<string, unknown> | string | null;
    video_storage_object_id: string | null;
    video_metadata_json: Record<string, unknown> | string | null;
    total_count: number | string;
  }>(
    `
      SELECT
        s.id,
        s.title,
        s.description,
        s.scene_analysis,
        s.plot_preview,
        s.sort_order,
        s.image_status,
        s.video_status,
        s.current_image_asset_version_id,
        s.current_video_asset_version_id,
        COUNT(*) OVER() AS total_count,
        image_version.storage_object_id AS image_storage_object_id,
        image_version.metadata_json AS image_metadata_json,
        video_version.storage_object_id AS video_storage_object_id,
        video_version.metadata_json AS video_metadata_json
      FROM shots s
      LEFT JOIN asset_versions image_version
        ON image_version.organization_id = s.organization_id
       AND image_version.id = s.current_image_asset_version_id
      LEFT JOIN asset_versions video_version
        ON video_version.organization_id = s.organization_id
       AND video_version.id = s.current_video_asset_version_id
      WHERE s.organization_id = $1
        AND s.episode_id = $2
      ORDER BY s.sort_order ASC, s.created_at ASC, s.id ASC
      ${usePagination ? "LIMIT $3 OFFSET $4" : ""}
    `,
    usePagination
      ? [
          compatibilityOrganizationId,
          input.episodeId,
          pageSize,
          Math.max(0, ((page ?? 1) - 1) * (pageSize ?? 1)),
        ]
      : [compatibilityOrganizationId, input.episodeId],
  );
  const shotIds = shotRows.rows.map((shot) => shot.id);
  const draftRows = shotIds.length
    ? await db.query<{
        target_id: string;
        prompt: string;
        mode: "image" | "video" | "lip_sync";
        payload_json: Record<string, unknown> | string | null;
        updated_at: Date | string;
      }>(
        `
          SELECT target_id, prompt, mode,
                 ${input.includeDraftPayload === false ? "NULL::jsonb" : "payload_json"} AS payload_json,
                 updated_at
            FROM episode_generation_drafts
           WHERE organization_id = $1
             AND episode_id = $2
             AND target_type = 'storyboard'
             AND target_id = ANY($3::uuid[])
        `,
        [compatibilityOrganizationId, input.episodeId, shotIds],
      )
    : { rows: [] };
  const draftsByShotId = new Map<string, Array<{
    prompt: string;
    mode: "image" | "video" | "lip_sync";
    payload?: Record<string, unknown>;
    updatedAt: Date | string;
  }>>();
  for (const draft of draftRows.rows) {
    const drafts = draftsByShotId.get(draft.target_id) ?? [];
    drafts.push({
      prompt: draft.prompt ?? "",
      mode: draft.mode,
      ...(input.includeDraftPayload === false ? {} : { payload: parseMetadataJson(draft.payload_json) }),
      updatedAt: draft.updated_at,
    });
    draftsByShotId.set(draft.target_id, drafts);
  }

  const items = await Promise.all(shotRows.rows.map(async (shot, index) => {
    const imageMetadata = parseMetadataJson(shot.image_metadata_json);
    const videoMetadata = parseMetadataJson(shot.video_metadata_json);
    const currentImageUrlFromMetadata = resolvePreferredEpisodeImageUrl(
      imageMetadata.previewUrl,
      imageMetadata.sourceUrl,
    ) ?? null;
    const imageUrls =
      (!currentImageUrlFromMetadata || isMockEpisodeImageUrl(currentImageUrlFromMetadata)) &&
      input.runtime &&
      shot.image_storage_object_id
      ? await signedUrlsForStorageObject(db, {
          sessionToken: input.sessionToken,
          storageObjectId: shot.image_storage_object_id,
          runtime: input.runtime,
          signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          now: input.now,
        })
      : null;
    const currentVideoUrlFromMetadata =
      readString(videoMetadata.sourceUrl) ||
      readString(videoMetadata.downloadUrl) ||
      readString(videoMetadata.previewUrl) ||
      null;
    const videoUrls = !currentVideoUrlFromMetadata && input.runtime && shot.video_storage_object_id
      ? await signedUrlsForStorageObject(db, {
          sessionToken: input.sessionToken,
          storageObjectId: shot.video_storage_object_id,
          runtime: input.runtime,
          signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          now: input.now,
        })
      : null;
    const currentImageUrl =
      resolvePreferredEpisodeImageUrl(
        currentImageUrlFromMetadata,
        imageUrls?.previewUrl,
        imageUrls?.downloadUrl,
      ) ??
      null;
    const currentVideoUrl =
      currentVideoUrlFromMetadata ||
      videoUrls?.downloadUrl ||
      videoUrls?.previewUrl ||
      null;
    const currentVideoThumbnailUrl =
      readString(videoMetadata.thumbnailUrl) ||
      readString(videoMetadata.coverImageUrl) ||
      null;
    return {
      id: shot.id,
      shotId: shot.id,
      storyboardId: shot.id,
      episodeId: input.episodeId,
      indexNo: index + 1,
      title: shot.title,
      sceneAnalysis: shot.scene_analysis || shot.description || "",
      plotPreview: shot.plot_preview || shot.title || "",
      description: shot.description || "",
      currentImageFileId: shot.current_image_asset_version_id,
      currentImageUrl,
      currentVideoFileId: shot.current_video_asset_version_id,
      currentVideoUrl,
      currentVideoThumbnailUrl,
      imageStatus: shot.image_status === "completed" || shot.image_status === "ready"
        ? "succeeded"
        : shot.image_status || "draft",
      videoStatus: shot.video_status === "completed" || shot.video_status === "ready"
        ? "succeeded"
        : shot.video_status || "not_ready",
      assetRefs: [],
      generationDrafts: draftsByShotId.get(shot.id) ?? [],
      sortOrder: Number(shot.sort_order ?? index),
    };
  }));
  if (usePagination) {
    let total = Number(shotRows.rows[0]?.total_count ?? 0);
    if (shotRows.rows.length === 0 && (page ?? 1) > 1) {
      const totalRow = await queryOne<{ total: number | string }>(
        db,
        `
          SELECT COUNT(*)::int AS total
          FROM shots s
          WHERE s.organization_id = $1
            AND s.episode_id = $2
        `,
        [compatibilityOrganizationId, input.episodeId],
      );
      total = Number(totalRow?.total ?? 0);
    }
    Object.assign(items, { total });
  }
  return items;
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
  const description = String(input.body.description ?? "").trim();
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
  return {
    asset: {
      assetId: snapshot.asset.id,
      assetType: normalized.kind,
      name,
      description,
      fixedImageFileId: snapshot.version.id,
      fixedImageStorageObjectId: storageObjectId || null,
      fixedImageUrl: resolvedSourceUrl,
      voiceId: null,
      voiceName: null,
      dubbingConfig: null,
      sortOrder: 0,
      updatedAt: snapshot.asset.updatedAt.toISOString(),
      createdAt: snapshot.asset.createdAt.toISOString(),
    },
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
  if (Object.prototype.hasOwnProperty.call(input.body, "voiceSource")) {
    metadata.voiceSource = input.body.voiceSource == null ? null : String(input.body.voiceSource);
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
    label: name,
    description: String(metadata.description ?? "").trim() || null,
    mimeType: libraryContentType,
    source: "episode",
    previewUrl: libraryPreviewUrl,
    sourceUrl: librarySourceUrl,
    width: Number(metadata.width ?? 0) || 0,
    height: Number(metadata.height ?? 0) || 0,
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
    includeMessages?: boolean;
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
  if (input.includeMessages === false) {
    const entries = await listAssetConversationEntrySummaries(db, {
      thread,
    });
    return {
      thread,
      messages: [],
      entries,
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
    messages: input.includeMessages === false ? [] : normalizedMessages,
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
    statusRaw === "running" ||
    statusRaw === "completed" ||
    statusRaw === "failed" ||
    statusRaw === "canceled"
      ? statusRaw
      : statusRaw === "succeeded"
        ? "completed"
        : statusRaw === "manual_review_required" || statusRaw === "result_unknown"
          ? "failed"
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

  const isAllowedOrigin = isAllowedCorsOrigin(origin);
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
  return !isAllowedCorsOrigin(origin);
}

function isAllowedCorsOrigin(origin: string) {
  if (origin === "null") {
    return true;
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return true;
  }

  const configuredOrigins = readConfiguredCorsOrigins();
  return configuredOrigins.has(origin.toLowerCase());
}

function readConfiguredCorsOrigins() {
  const values = new Set<string>();
  const rawValue = process.env.ALLOWED_ORIGINS?.trim() ?? "";
  if (!rawValue) {
    return values;
  }

  for (const item of rawValue.split(",")) {
    const normalized = item.trim().replace(/\/+$/, "").toLowerCase();
    if (!normalized) {
      continue;
    }
    values.add(normalized);
  }

  return values;
}

async function serveStatic(
  request: Parameters<typeof createServer>[0],
  pathname: string,
  response: ServerResponse,
) {
  if (pathname === "/favicon.ico") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (pathname === "/robots.txt") {
    const origin = serverOriginFromRequest(request);
    response.statusCode = 200;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end([
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /admin/",
      "Disallow: /uploads/",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n"));
    return;
  }

  if (pathname === "/sitemap.xml") {
    const origin = serverOriginFromRequest(request);
    const urls = ["/", "/canvas", "/script", "/projects", "/assets", "/team"];
    response.statusCode = 200;
    response.setHeader("content-type", "application/xml; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((urlPath) => `  <url><loc>${origin}${urlPath}</loc></url>`)
      .join("\n")}\n</urlset>\n`);
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

  const normalizedPath = pathname === "/" ? "/app.html" : pathname;
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

async function serveAdminStatic(pathname: string, response: ServerResponse) {
  const normalizedPath = pathname === "/admin" ? "/admin/" : pathname;
  const relativePath = normalizedPath.replace(/^\/admin\/?/, "");
  const filePath = relativePath && extname(relativePath)
    ? join(adminRoot, relativePath)
    : join(adminRoot, "index.html");
  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch (error) {
    if (relativePath && extname(relativePath)) {
      response.statusCode = 404;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.end("Not Found");
      return;
    }
    throw error;
  }

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    contentTypes[extname(filePath)] ?? "text/html; charset=utf-8",
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

async function revokeDevSeedTeamEntitlements(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  await db.query(
    `
      UPDATE organization_entitlements
      SET status = 'revoked',
          updated_at = now()
      WHERE organization_id = $1
        AND source = 'dev_seed'
        AND status = 'active'
        AND entitlement_key IN (
          'team_member_management',
          'team_asset_library',
          'team_dashboard'
        )
    `,
    [devOrganizationId],
  );
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
  if (user?.phone_e164 !== "+8613800138001") {
    await ensurePersonalDevWorkspaceAccess(db, userId);
    if (options.seedTeamEntitlements === false) {
      await revokeDevSeedTeamEntitlements(db);
    }
    return;
  }

  const role = "owner_admin";

  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Comic AI Studio', 'active')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
    `,
    [devOrganizationId],
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

  if (options.seedTeamEntitlements === false) {
    await revokeDevSeedTeamEntitlements(db);
  }

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
  }
}

async function ensurePersonalDevWorkspaceAccess(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
) {
  const personalScope = personalDevTenantScope(userId);
  const workspaceIds = userCompatibilityScopeCandidates(userId).map((scope) => scope.workspaceId);
  const primaryWorkspaceId = workspaceIds[0]!;
  const legacyWorkspaceIds = workspaceIds.slice(1);
  const existingWorkspace = await queryOne<{ id: string; organization_id: string }>(
    db,
    `
      SELECT workspace.id, workspace.organization_id
      FROM workspaces workspace
      WHERE workspace.id = $1
        OR (
          workspace.id = ANY($2::uuid[])
          AND EXISTS (
            SELECT 1
            FROM memberships membership
            WHERE membership.user_id = $3
              AND membership.workspace_id = workspace.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM memberships other_membership
            WHERE other_membership.workspace_id = workspace.id
              AND other_membership.user_id <> $3
          )
          AND NOT EXISTS (
            SELECT 1
            FROM projects other_project
            WHERE other_project.workspace_id = workspace.id
              AND other_project.created_by_user_id IS NOT NULL
              AND other_project.created_by_user_id <> $3
          )
        )
      ORDER BY CASE WHEN workspace.id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [primaryWorkspaceId, legacyWorkspaceIds, userId],
  );
  if (existingWorkspace) {
    return {
      organizationId: existingWorkspace.organization_id,
      workspaceId: existingWorkspace.id,
    };
  }

  await db.query("BEGIN");
  try {
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ($1, 'Personal Creator Workspace', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [personalScope.organizationId],
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES ($1, $2, 'Personal Workspace', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [personalScope.workspaceId, personalScope.organizationId],
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
        VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
        ON CONFLICT (organization_id, workspace_id, user_id)
        DO NOTHING
      `,
      [randomUUID(), personalScope.organizationId, personalScope.workspaceId, userId],
    );
    await db.query("COMMIT");
    return personalScope;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function resolvePersonalProjectWorkspaceForSession(
  db: Awaited<ReturnType<typeof createDevDb>>,
  authenticated: { sessionToken: string; user: AuthenticatedUser },
): Promise<string> {
  const workspaceId = await ensurePersonalProjectWorkspaceForSession(db, authenticated);
  await repairTeamWorkspaceProjectsToPersonalWorkspaces(
    db,
    authenticated.user.id,
    workspaceId,
  );
  return workspaceId;
}

async function resolvePersonalBillingScopeForSession(
  db: Awaited<ReturnType<typeof createDevDb>>,
  authenticated: { sessionToken: string; user: AuthenticatedUser },
): Promise<DevTenantScope> {
  return ensurePersonalDevWorkspaceAccess(db, authenticated.user.id);
}

async function ensurePersonalProjectWorkspaceForSession(
  db: Awaited<ReturnType<typeof createDevDb>>,
  authenticated: { sessionToken: string; user: AuthenticatedUser },
): Promise<string> {
  return ensureCachedPersonalProjectWorkspaceAccess(db, authenticated.user.id);
}

const personalProjectWorkspaceAccessPromises = new WeakMap<
  Awaited<ReturnType<typeof createDevDb>>,
  Map<string, Promise<string>>
>();

async function ensureCachedPersonalProjectWorkspaceAccess(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
): Promise<string> {
  let promises = personalProjectWorkspaceAccessPromises.get(db);
  if (!promises) {
    promises = new Map();
    personalProjectWorkspaceAccessPromises.set(db, promises);
  }
  const cached = promises.get(userId);
  if (cached) {
    return cached;
  }
  const promise = ensurePersonalProjectWorkspaceAccess(db, userId)
    .catch((error) => {
      promises?.delete(userId);
      throw error;
    });
  promises.set(userId, promise);
  return promise;
}

async function ensurePersonalProjectWorkspaceAccess(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
) {
  const workspaceId = personalProjectWorkspaceId(userId);
  const workspaceIds = userProjectCompatibilityWorkspaceIdCandidates(userId);
  const legacyWorkspaceIds = workspaceIds.slice(1);
  const legacyDevProject = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND created_by_user_id = $3
      LIMIT 1
    `,
    [devOrganizationId, devWorkspaceId, userId],
  );
  if (legacyDevProject) {
    const legacyWorkspace = await queryOne<{ organization_id: string }>(
      db,
      "SELECT organization_id FROM workspaces WHERE id = $1",
      [workspaceId],
    );
    if (legacyWorkspace && legacyWorkspace.organization_id !== devOrganizationId) {
      throw new Error("legacy_project_workspace_scope_conflict");
    }
    await db.query("BEGIN");
    try {
      await db.query(
        `
          INSERT INTO workspaces (id, organization_id, name, status)
          VALUES ($1, $2, 'Personal Project Workspace', 'active')
          ON CONFLICT (id) DO NOTHING
        `,
        [workspaceId, devOrganizationId],
      );
      await db.query(
        `
          INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
          VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
          ON CONFLICT (organization_id, workspace_id, user_id)
          DO NOTHING
        `,
        [randomUUID(), devOrganizationId, workspaceId, userId],
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    await repairDevOrganizationLegacyCreditLots(db);
    return workspaceId;
  }
  const billingScope = await ensurePersonalDevWorkspaceAccess(db, userId);
  const existingWorkspace = await queryOne<{ id: string; organization_id: string }>(
    db,
    `
      SELECT workspace.id, workspace.organization_id
      FROM workspaces workspace
      WHERE workspace.id = $1
        OR (
          workspace.id = ANY($2::uuid[])
          AND (
            EXISTS (
              SELECT 1
              FROM memberships membership
              WHERE membership.user_id = $3
                AND membership.workspace_id = workspace.id
            )
            OR EXISTS (
              SELECT 1
              FROM projects project
              WHERE project.created_by_user_id = $3
                AND project.workspace_id = workspace.id
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM memberships other_membership
            WHERE other_membership.workspace_id = workspace.id
              AND other_membership.user_id <> $3
          )
          AND NOT EXISTS (
            SELECT 1
            FROM projects other_project
            WHERE other_project.workspace_id = workspace.id
              AND other_project.created_by_user_id IS NOT NULL
              AND other_project.created_by_user_id <> $3
          )
        )
      ORDER BY CASE WHEN workspace.id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [workspaceId, legacyWorkspaceIds, userId],
  );
  await repairDevOrganizationLegacyCreditLots(db);
  if (existingWorkspace) {
    return existingWorkspace.id;
  }

  await db.query("BEGIN");
  try {
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ($1, 'Personal Creator Workspace', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [billingScope.organizationId],
    );

    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES ($1, $2, 'Personal Project Workspace', 'active')
        ON CONFLICT (id) DO NOTHING
      `,
      [workspaceId, billingScope.organizationId],
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
        VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
        ON CONFLICT (organization_id, workspace_id, user_id)
        DO NOTHING
      `,
      [randomUUID(), billingScope.organizationId, workspaceId, userId],
    );
    await db.query("COMMIT");
    return workspaceId;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function repairDevOrganizationLegacyCreditLots(
  db: Awaited<ReturnType<typeof createDevDb>>,
) {
  const row = await queryOne<{
    credit_balance_cached: number | string;
    lot_total: number | string;
  }>(
    db,
    `
      SELECT
        o.credit_balance_cached,
        COALESCE(sum(l.total_amount), 0)::int AS lot_total
      FROM organizations o
      LEFT JOIN credit_lots l
        ON l.organization_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, o.credit_balance_cached
      LIMIT 1
    `,
    [devOrganizationId],
  );
  const missingAmount = Number(row?.credit_balance_cached ?? 0) - Number(row?.lot_total ?? 0);
  if (!Number.isFinite(missingAmount) || missingAmount <= 0) {
    return;
  }

  const sourceId = devOrganizationId;
  await db.query("BEGIN");
  try {
    let grantLedgerEntryId = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND entry_type = 'grant'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [devOrganizationId],
    ).then((existing) => existing?.id ?? null);

    if (!grantLedgerEntryId) {
      const ledger = await queryOne<{ id: string }>(
        db,
        `
          INSERT INTO credit_ledger_entries (
            id,
            organization_id,
            reservation_id,
            allocation_id,
            entry_type,
            amount,
            available_delta,
            reserved_delta,
            consumed_delta,
            source_type,
            source_id,
            reason,
            metadata_json,
            created_by_user_id,
            created_at
          )
          VALUES (
            $1, $2, NULL, NULL, 'grant', $3, $3, 0, 0,
            'dev_legacy_credit_lot_repair', $4, 'repair legacy dev credit lots',
            $5::jsonb, NULL, now()
          )
          ON CONFLICT (organization_id, source_type, source_id, entry_type)
          DO NOTHING
          RETURNING id
        `,
        [
          randomUUID(),
          devOrganizationId,
          missingAmount,
          sourceId,
          JSON.stringify({ repairedOrganizationId: devOrganizationId }),
        ],
      );
      grantLedgerEntryId = ledger?.id ?? await queryOne<{ id: string }>(
        db,
        `
          SELECT id
          FROM credit_ledger_entries
          WHERE organization_id = $1
            AND source_type = 'dev_legacy_credit_lot_repair'
            AND source_id = $2
            AND entry_type = 'grant'
          LIMIT 1
        `,
        [devOrganizationId, sourceId],
      ).then((existing) => existing?.id ?? null);
    }

    if (!grantLedgerEntryId) {
      throw new Error("dev_legacy_credit_lot_repair_ledger_missing");
    }
    await db.query(
      `
        INSERT INTO credit_lots (
          id,
          organization_id,
          source_type,
          source_id,
          grant_ledger_entry_id,
          total_amount,
          available_amount,
          reserved_amount,
          consumed_amount,
          expired_amount,
          expires_at,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, 'dev_legacy_credit_lot_repair', $3, $4,
          $5, $5, 0, 0, 0, NULL, $6::jsonb, now(), now()
        )
        ON CONFLICT (organization_id, source_type, source_id, grant_ledger_entry_id)
        DO NOTHING
      `,
      [
        randomUUID(),
        devOrganizationId,
        sourceId,
        grantLedgerEntryId,
        missingAmount,
        JSON.stringify({ repairedOrganizationId: devOrganizationId }),
      ],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

const teamWorkspaceProjectRepairPromises = new WeakMap<
  Awaited<ReturnType<typeof createDevDb>>,
  Map<string, Promise<void>>
>();

async function repairTeamWorkspaceProjectsToPersonalWorkspaces(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
  workspaceId: string,
) {
  let repairPromises = teamWorkspaceProjectRepairPromises.get(db);
  if (!repairPromises) {
    repairPromises = new Map();
    teamWorkspaceProjectRepairPromises.set(db, repairPromises);
  }
  let repairPromise = repairPromises.get(userId);
  if (!repairPromise) {
    repairPromise = runTeamWorkspaceProjectRepair(db, userId, workspaceId).catch((error) => {
      repairPromises.delete(userId);
      throw error;
    });
    repairPromises.set(userId, repairPromise);
  }
  return repairPromise;
}

async function runTeamWorkspaceProjectRepair(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
  workspaceId: string,
) {
  const legacyProject = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM projects
      WHERE organization_id = $1
        AND workspace_id = $2
        AND created_by_user_id = $3
      LIMIT 1
    `,
    [devOrganizationId, devWorkspaceId, userId],
  );
  if (!legacyProject) {
    return;
  }
  const workspace = await queryOne<{ organization_id: string }>(
    db,
    "SELECT organization_id FROM workspaces WHERE id = $1",
    [workspaceId],
  );
  if (!workspace) {
    throw new Error("personal_project_workspace_missing");
  }
  if (workspace.organization_id !== devOrganizationId) {
    throw new Error("legacy_project_workspace_scope_conflict");
  }
  await db.query(
    `
      UPDATE projects
      SET workspace_id = $3
      WHERE organization_id = $1
        AND workspace_id = $2
        AND created_by_user_id = $4
    `,
    [devOrganizationId, devWorkspaceId, workspaceId, userId],
  );
}

function personalProjectWorkspaceId(userId: string) {
  return userProjectCompatibilityWorkspaceId(userId);
}

function personalDevTenantScope(userId: string): DevTenantScope {
  return userCompatibilityScope(userId);
}

async function ensureDefaultMembershipPlan(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: { now: Date },
) {
  const existingExperiencePlan = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM membership_plans
      WHERE tier = 'experience'
        AND status = 'active'
        AND (valid_from IS NULL OR valid_from <= $1)
        AND (valid_until IS NULL OR valid_until > $1)
      LIMIT 1
    `,
    [input.now],
  );
  if (!existingExperiencePlan) {
    await db.query(
      `
        INSERT INTO membership_plans (
          id,
          code,
          display_name,
          tier,
          period_unit,
          period_count,
          amount_minor,
          currency,
          gift_credits,
          seat_limit,
          entitlements_json,
          priority_rules_json,
          display_metadata_json,
          status,
          valid_from,
          valid_until,
          created_at,
          updated_at
        )
        VALUES (
          '95000000-0000-4000-8000-000000000002',
          'experience_weekly',
          '体验版',
          'experience',
          'day',
          7,
          9900,
          'CNY',
          300,
          1,
          $2::jsonb,
          $3::jsonb,
          $4::jsonb,
          'active',
          NULL,
          NULL,
          $1,
          $1
        )
        ON CONFLICT (code) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            tier = EXCLUDED.tier,
            period_unit = EXCLUDED.period_unit,
            period_count = EXCLUDED.period_count,
            amount_minor = EXCLUDED.amount_minor,
            currency = EXCLUDED.currency,
            gift_credits = EXCLUDED.gift_credits,
            seat_limit = EXCLUDED.seat_limit,
            entitlements_json = EXCLUDED.entitlements_json,
            priority_rules_json = EXCLUDED.priority_rules_json,
            display_metadata_json = EXCLUDED.display_metadata_json,
            status = 'active',
            valid_from = NULL,
            valid_until = NULL,
            updated_at = EXCLUDED.updated_at
      `,
      [
        input.now,
        JSON.stringify(["priority_generation"]),
        JSON.stringify({ modelFamilies: ["seedance-lite"] }),
        JSON.stringify({ sortOrder: 10 }),
      ],
    );
  }

  const existingProfessionalPlan = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM membership_plans
      WHERE tier = 'professional'
        AND status = 'active'
        AND (valid_from IS NULL OR valid_from <= $1)
        AND (valid_until IS NULL OR valid_until > $1)
      LIMIT 1
    `,
    [input.now],
  );
  if (existingProfessionalPlan) {
    return;
  }

  await db.query(
    `
      INSERT INTO membership_plans (
        id,
        code,
        display_name,
        tier,
        period_unit,
        period_count,
        amount_minor,
        currency,
        gift_credits,
        seat_limit,
        entitlements_json,
        priority_rules_json,
        display_metadata_json,
        status,
        valid_from,
        valid_until,
        created_at,
        updated_at
      )
      VALUES (
        '95000000-0000-4000-8000-000000000001',
        'professional_monthly',
        '专业版月卡',
        'professional',
        'month',
        1,
        29900,
        'CNY',
        3000,
        50,
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        'active',
        NULL,
        NULL,
        $1,
        $1
      )
      ON CONFLICT (code) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          tier = EXCLUDED.tier,
          period_unit = EXCLUDED.period_unit,
          period_count = EXCLUDED.period_count,
          amount_minor = EXCLUDED.amount_minor,
          currency = EXCLUDED.currency,
          gift_credits = EXCLUDED.gift_credits,
          seat_limit = EXCLUDED.seat_limit,
          entitlements_json = EXCLUDED.entitlements_json,
          priority_rules_json = EXCLUDED.priority_rules_json,
          display_metadata_json = EXCLUDED.display_metadata_json,
          status = 'active',
          valid_from = NULL,
          valid_until = NULL,
          updated_at = EXCLUDED.updated_at
    `,
    [
      input.now,
      JSON.stringify([
        "priority_generation",
        "team_asset_library",
        "team_dashboard",
        "team_member_management",
      ]),
      JSON.stringify({ modelFamilies: ["seedance"] }),
      JSON.stringify({ sortOrder: 20 }),
    ],
  );
}

function loadWeChatLoginConfig(env: NodeJS.ProcessEnv): WeChatLoginConfig | null {
  const appId = env.WECHAT_LOGIN_APP_ID?.trim() ?? "";
  const appSecret = env.WECHAT_LOGIN_APP_SECRET?.trim() ?? "";
  const redirectUri = env.WECHAT_LOGIN_REDIRECT_URI?.trim() ?? "";

  if (!appId || !appSecret || !redirectUri) {
    return null;
  }

  return { appId, appSecret, redirectUri };
}

function buildWeChatAuthorizeUrl(config: WeChatLoginConfig, state: string): string {
  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("state", state);
  return `${url.toString()}#wechat_redirect`;
}

async function exchangeWeChatCode(
  config: WeChatLoginConfig,
  code: string,
  fetchImpl: typeof fetch,
): Promise<WeChatAccessTokenResponse> {
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", config.appSecret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetchImpl(url);
  const payload = (await response.json()) as WeChatAccessTokenResponse;
  if (!response.ok || payload.errcode || !payload.openid || !payload.access_token) {
    return {
      errcode: payload.errcode ?? response.status,
      errmsg: payload.errmsg ?? "wechat_token_exchange_failed",
    };
  }

  return payload;
}

async function findOrCreateUserByWeChat(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    appId: string;
    openid: string;
    unionid?: string | null;
    now: Date;
  },
) {
  const userByOpenid = await queryOne<{
    id: string;
    status: "active" | "disabled";
  }>(
    db,
    `
      SELECT id, status
      FROM users
      WHERE wechat_app_id = $1
        AND wechat_openid = $2
      LIMIT 1
    `,
    [input.appId, input.openid],
  );

  if (userByOpenid) {
    await updateWeChatUserLogin(db, {
      userId: userByOpenid.id,
      appId: input.appId,
      openid: input.openid,
      unionid: input.unionid,
      now: input.now,
    });
    return { ...userByOpenid, isNewUser: false };
  }

  const normalizedUnionid = input.unionid?.trim() || null;
  if (normalizedUnionid) {
    const userByUnionid = await queryOne<{
      id: string;
      status: "active" | "disabled";
    }>(
      db,
      `
        SELECT id, status
        FROM users
        WHERE wechat_app_id = $1
          AND wechat_unionid = $2
        LIMIT 1
      `,
      [input.appId, normalizedUnionid],
    );

    if (userByUnionid) {
      await updateWeChatUserLogin(db, {
        userId: userByUnionid.id,
        appId: input.appId,
        openid: input.openid,
        unionid: normalizedUnionid,
        now: input.now,
      });
      return { ...userByUnionid, isNewUser: false };
    }
  }

  const created = await queryOne<{
    id: string;
    status: "active" | "disabled";
  }>(
    db,
    `
      INSERT INTO users (
        id,
        phone_e164,
        status,
        wechat_app_id,
        wechat_openid,
        wechat_unionid,
        wechat_last_login_at,
        last_login_at,
        created_at,
        updated_at
      )
      VALUES ($1, NULL, 'active', $2, $3, $4, $5, $5, $5, $5)
      RETURNING id, status
    `,
    [randomUUID(), input.appId, input.openid, normalizedUnionid, input.now],
  );

  return { ...created!, isNewUser: true };
}

async function updateWeChatUserLogin(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    appId: string;
    openid: string;
    unionid?: string | null;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE users
      SET wechat_app_id = $2,
          wechat_openid = $3,
          wechat_unionid = COALESCE($4, wechat_unionid),
          wechat_last_login_at = $5,
          last_login_at = $5,
          updated_at = $5
      WHERE id = $1
    `,
    [input.userId, input.appId, input.openid, input.unionid?.trim() || null, input.now],
  );
}

async function createPersistentSessionForUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    now: Date;
  },
) {
  const createdSession = await createAuthSession({
    userId: input.userId,
    now: input.now,
  });

  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      createdSession.session.id,
      createdSession.session.userId,
      createdSession.session.status,
      createdSession.session.sessionTokenHash,
      createdSession.session.sessionTokenHashVersion,
      createdSession.session.expiresAt,
      createdSession.session.lastSeenAt,
      createdSession.session.revokedAt,
      input.now,
    ],
  );

  return createdSession;
}

async function findAuthenticatedUser(
  db: Awaited<ReturnType<typeof createDevDb>>,
  cookieHeader: string | undefined,
  now: Date,
  authSessionCache?: AuthSessionCache,
  options: { includeCredit?: boolean } = {},
): Promise<{ sessionToken: string; session: AuthSession; user: AuthenticatedUser } | undefined> {
  const sessionToken = parseCookies(cookieHeader).auth_session;
  if (!sessionToken) {
    return undefined;
  }

  const cached = await authSessionCache?.get(sessionToken, now);
  if (cached === null) {
    return undefined;
  }
  const session = cached?.session ?? await findPersistentAuthSessionByToken(db, {
      token: sessionToken,
      now,
    });
  if (!session) {
    return undefined;
  }

  const user = cached?.user ?? await queryOne<{
    id: string;
    phone_e164: string | null;
    display_name: string | null;
    status: "active" | "disabled";
  }>(db, "SELECT id, phone_e164, display_name, status FROM users WHERE id = $1", [session.userId]);

  if (!user || user.id !== session.userId || ("status" in user && user.status !== "active")) {
    return undefined;
  }
  const cachedTeamMember = cached?.user.teamMember;
  const teamMemberSession = cached
    ? cachedTeamMember
      ? {
          member_id: cachedTeamMember.id,
          member_account: cachedTeamMember.memberAccount,
          member_login_account: cachedTeamMember.memberLoginAccount,
          member_name: cachedTeamMember.memberName,
          member_credits: 0,
          member_session_status: "active" as const,
          member_session_expires_at: session.expiresAt,
          member_status: "active" as const,
        }
      : undefined
    : await queryOne<{
    member_id: string;
    member_account: string;
    member_login_account: string;
    member_name: string;
    member_credits: number | string;
    member_session_status: "active" | "revoked" | "expired";
    member_session_expires_at: Date | string;
    member_status: "active" | "disabled" | "deleted";
      }>(
    db,
    `
      SELECT
        member_session.member_id,
        member.member_account,
        member.member_login_account,
        member.member_name,
        member.member_credits,
        member_session.status AS member_session_status,
        member_session.expires_at AS member_session_expires_at,
        member.status AS member_status
      FROM team_member_auth_sessions member_session
      JOIN team_members member
        ON member.id = member_session.member_id
       AND member.user_id = member_session.user_id
      WHERE member_session.auth_session_id = $1
        AND member_session.user_id = $2
      LIMIT 1
    `,
    [session.id, user.id],
      );
  if (
    teamMemberSession &&
    (
      teamMemberSession.member_session_status !== "active" ||
      new Date(teamMemberSession.member_session_expires_at).getTime() <= now.getTime() ||
      teamMemberSession.member_status !== "active"
    )
  ) {
    return undefined;
  }
  const credit = options.includeCredit === false
    ? {
        availableCredits: 0,
        creditBalance: 0,
        displayCreditBalance: 0,
        reservedCredits: 0,
        frozenCredits: 0,
        creditFrozenAt: null,
        creditFrozenUntil: null,
      }
    : teamMemberSession
      ? await getSimpleTeamMemberCreditBalance(db, {
          userId: user.id,
          memberId: teamMemberSession.member_id,
        })
      : await getUserCreditBalance(db, user.id);
  const effectiveCredits = credit.availableCredits;

  if (!cached) {
    await authSessionCache?.set(sessionToken, {
      session,
      user: {
        id: user.id,
        phone: "phone_e164" in user ? user.phone_e164 : user.phone,
        displayName: "display_name" in user ? user.display_name : user.displayName,
        actorType: teamMemberSession ? "team_member" : "user",
        teamMember: teamMemberSession
          ? {
              id: teamMemberSession.member_id,
              memberAccount: teamMemberSession.member_account,
              memberLoginAccount: teamMemberSession.member_login_account,
              memberName: teamMemberSession.member_name,
            }
          : null,
      },
    }, now);
  }

  return {
    sessionToken,
    session,
    user: {
      id: user.id,
      phone: "phone_e164" in user ? user.phone_e164 : user.phone,
      displayName: "display_name" in user ? user.display_name : user.displayName,
      actorType: teamMemberSession ? "team_member" : "user",
      teamMember: teamMemberSession
        ? {
            id: teamMemberSession.member_id,
            memberAccount: teamMemberSession.member_account,
            memberLoginAccount: teamMemberSession.member_login_account,
            memberName: teamMemberSession.member_name,
            memberCredits: Number(teamMemberSession.member_credits ?? 0),
          }
        : null,
      creditBalance: effectiveCredits,
      displayCreditBalance: effectiveCredits,
      availableCredits: effectiveCredits,
      reservedCredits: credit.reservedCredits,
      frozenCredits: credit.frozenCredits,
      creditFrozenAt: credit.creditFrozenAt,
      creditFrozenUntil: credit.creditFrozenUntil,
    },
  };
}

const ACCOUNT_DISPLAY_NAME_MAX_LENGTH = 8;

async function updateAuthenticatedUserProfile(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    teamMemberId?: string;
    displayName: string;
    now: Date;
  },
): Promise<
  | {
      ok: true;
      user: {
        id: string;
        phone: string | null;
        displayName: string | null;
        teamMember?: AuthenticatedUser["teamMember"];
      };
    }
  | { ok: false; status: number; body: { error: string; message: string } }
> {
  const displayName = String(input.displayName ?? "").trim();
  if (!displayName) {
    return {
      ok: false,
      status: 400,
      body: { error: "display_name_required", message: "请输入显示昵称。" },
    };
  }
  if ([...displayName].length > ACCOUNT_DISPLAY_NAME_MAX_LENGTH) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "display_name_too_long",
        message: `显示昵称最多 ${ACCOUNT_DISPLAY_NAME_MAX_LENGTH} 个字。`,
      },
    };
  }

  if (input.teamMemberId) {
    const updated = await queryOne<{
      id: string;
      member_account: string;
      member_login_account: string;
      member_name: string;
      member_credits: number | string;
    }>(
      db,
      `
        UPDATE team_members
        SET member_name = $3,
            updated_at = $4
        WHERE user_id = $1
          AND id = $2
          AND status = 'active'
        RETURNING id, member_account, member_login_account, member_name, member_credits
      `,
      [input.userId, input.teamMemberId, displayName, input.now],
    );

    if (!updated) {
      return {
        ok: false,
        status: 404,
        body: { error: "team_member_not_found", message: "当前子账户不存在或已停用。" },
      };
    }

    return {
      ok: true,
      user: {
        id: input.userId,
        phone: null,
        displayName: updated.member_name,
        teamMember: {
          id: updated.id,
          memberAccount: updated.member_account,
          memberLoginAccount: updated.member_login_account,
          memberName: updated.member_name,
          memberCredits: Number(updated.member_credits ?? 0),
        },
      },
    };
  }

  const updated = await queryOne<{
    id: string;
    phone_e164: string | null;
    display_name: string | null;
  }>(
    db,
    `
      UPDATE users
      SET display_name = $2,
          updated_at = $3
      WHERE id = $1
      RETURNING id, phone_e164, display_name
    `,
    [input.userId, displayName, input.now],
  );

  if (!updated) {
    return {
      ok: false,
      status: 404,
      body: { error: "user_not_found", message: "当前登录用户不存在。" },
    };
  }

  return {
    ok: true,
    user: {
      id: updated.id,
      phone: updated.phone_e164,
      displayName: updated.display_name,
    },
  };
}

async function getAuthenticatedInviteSummary(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    request: IncomingMessage;
  },
) {
  const user = await queryOne<{ invite_code: string | null }>(
    db,
    "SELECT invite_code FROM users WHERE id = $1 LIMIT 1",
    [input.userId],
  );
  const inviteCode = String(user?.invite_code ?? "").trim();
  const inviteLink = inviteCode
    ? new URL(`/?inviteCode=${encodeURIComponent(inviteCode)}`, resolveRequestOrigin(input.request)).toString()
    : "";
  const totals = await queryOne<{
    invited_count: number | string;
    active_invited_count: number | string;
    rewarded_invited_count: number | string;
    total_reward_credits: number | string;
    rebate_credits: number | string;
  }>(
    db,
    `
      WITH bindings AS (
        SELECT id, status
        FROM user_invite_bindings
        WHERE inviter_user_id = $1
      ),
      grant_summary AS (
        SELECT
          binding_id,
          COALESCE(sum(credits) FILTER (WHERE status = 'granted'), 0)::int AS total_reward_credits,
          COALESCE(sum(credits) FILTER (
            WHERE status = 'granted'
              AND reward_type = 'inviter_rebate'
          ), 0)::int AS rebate_credits,
          bool_or(status = 'granted') AS rewarded
        FROM invite_reward_grants
        WHERE recipient_user_id = $1
        GROUP BY binding_id
      )
      SELECT
        count(bindings.id)::int AS invited_count,
        count(bindings.id) FILTER (WHERE bindings.status = 'active')::int AS active_invited_count,
        count(bindings.id) FILTER (WHERE grant_summary.rewarded IS TRUE)::int AS rewarded_invited_count,
        COALESCE(sum(grant_summary.total_reward_credits), 0)::int AS total_reward_credits,
        COALESCE(sum(grant_summary.rebate_credits), 0)::int AS rebate_credits
      FROM bindings
      LEFT JOIN grant_summary
        ON grant_summary.binding_id = bindings.id
    `,
    [input.userId],
  );
  const details = await db.query<{
    binding_id: string;
    invited_user_id: string;
    invited_phone: string | null;
    invited_display_name: string | null;
    bound_at: Date | string;
    rebate_valid_until: Date | string;
    status: string;
    new_user_reward_status: string | null;
    inviter_reward_status: string | null;
    rebate_credits: number | string | null;
    paid_order_count: number | string;
  }>(
    `
      WITH rebate_summary AS (
        SELECT
          binding_id,
          COALESCE(sum(credits) FILTER (WHERE status = 'granted'), 0)::int AS rebate_credits
        FROM invite_reward_grants
        WHERE recipient_user_id = $1
          AND reward_type = 'inviter_rebate'
        GROUP BY binding_id
      ),
      paid_summary AS (
        SELECT
          binding.id AS binding_id,
          count(DISTINCT paid_order.id)::int AS paid_order_count
        FROM user_invite_bindings binding
        LEFT JOIN billing_orders paid_order
          ON paid_order.created_by_user_id = binding.invited_user_id
         AND paid_order.status = 'paid'
         AND paid_order.paid_at >= binding.bound_at
         AND paid_order.paid_at <= binding.rebate_valid_until
        WHERE binding.inviter_user_id = $1
        GROUP BY binding.id
      )
      SELECT
        binding.id AS binding_id,
        binding.invited_user_id,
        invited.phone_e164 AS invited_phone,
        invited.display_name AS invited_display_name,
        binding.bound_at,
        binding.rebate_valid_until,
        binding.status,
        new_user_grant.status AS new_user_reward_status,
        inviter_grant.status AS inviter_reward_status,
        COALESCE(rebate_summary.rebate_credits, 0)::int AS rebate_credits,
        COALESCE(paid_summary.paid_order_count, 0)::int AS paid_order_count
      FROM user_invite_bindings binding
      JOIN users invited
        ON invited.id = binding.invited_user_id
      LEFT JOIN invite_reward_grants new_user_grant
        ON new_user_grant.binding_id = binding.id
       AND new_user_grant.reward_type = 'new_user_trial'
       AND new_user_grant.recipient_user_id = binding.invited_user_id
      LEFT JOIN invite_reward_grants inviter_grant
        ON inviter_grant.binding_id = binding.id
       AND inviter_grant.reward_type = 'inviter_trial'
       AND inviter_grant.recipient_user_id = binding.inviter_user_id
      LEFT JOIN rebate_summary
        ON rebate_summary.binding_id = binding.id
      LEFT JOIN paid_summary
        ON paid_summary.binding_id = binding.id
      WHERE binding.inviter_user_id = $1
      GROUP BY
        binding.id,
        invited.phone_e164,
        invited.display_name,
        new_user_grant.status,
        inviter_grant.status,
        rebate_summary.rebate_credits,
        paid_summary.paid_order_count
      ORDER BY binding.bound_at DESC
      LIMIT 50
    `,
    [input.userId],
  );

  return {
    inviteCode,
    inviteLink,
    invitedCount: Number(totals?.invited_count ?? 0),
    activeInvitedCount: Number(totals?.active_invited_count ?? 0),
    rewardedInvitedCount: Number(totals?.rewarded_invited_count ?? 0),
    totalRewardCredits: Number(totals?.total_reward_credits ?? 0),
    rebateCredits: Number(totals?.rebate_credits ?? 0),
    details: details.rows.map((row) => ({
      bindingId: row.binding_id,
      invitedUserId: row.invited_user_id,
      invitedUserLabel: String(row.invited_display_name ?? "").trim() || maskCnPhone(row.invited_phone),
      maskedPhone: maskCnPhone(row.invited_phone),
      boundAt: new Date(row.bound_at).toISOString(),
      rebateValidUntil: new Date(row.rebate_valid_until).toISOString(),
      status: row.status,
      newUserRewardStatus: row.new_user_reward_status ?? "pending",
      inviterRewardStatus: row.inviter_reward_status ?? "pending",
      rebateCredits: Number(row.rebate_credits ?? 0),
      hasPaid: Number(row.paid_order_count ?? 0) > 0,
    })),
  };
}

function resolveRequestOrigin(request: IncomingMessage) {
  const origin = String(request.headers.origin ?? "").trim();
  if (/^https?:\/\//i.test(origin)) {
    return origin;
  }
  const forwardedProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const proto = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "http";
  const forwardedHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const host = forwardedHost || String(request.headers.host ?? "127.0.0.1:4310").trim();
  return `${proto}://${host}`;
}

async function changeAuthenticatedUserPassword(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    userId: string;
    teamMemberId?: string;
    currentPassword: string;
    newPassword: string;
    now: Date;
  },
): Promise<{ ok: true } | { ok: false; status: number; body: { error: string; message: string } }> {
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = String(input.newPassword ?? "");
  if (!currentPassword) {
    return {
      ok: false,
      status: 400,
      body: { error: "current_password_required", message: "请输入当前密码。" },
    };
  }
  if (!newPassword) {
    return {
      ok: false,
      status: 400,
      body: { error: "new_password_required", message: "请输入新密码。" },
    };
  }
  if (newPassword.length < 8) {
    return {
      ok: false,
      status: 400,
      body: { error: "new_password_too_short", message: "新密码至少需要 8 位。" },
    };
  }

  if (input.teamMemberId) {
    const member = await queryOne<{
      id: string;
      member_password_hash: string;
    }>(
      db,
      `
        SELECT id, member_password_hash
        FROM team_members
        WHERE user_id = $1
          AND id = $2
          AND status = 'active'
        LIMIT 1
      `,
      [input.userId, input.teamMemberId],
    );
    if (!member) {
      return {
        ok: false,
        status: 404,
        body: { error: "team_member_not_found", message: "当前子账户不存在或已停用。" },
      };
    }

    const validCurrentPassword = await verifyTeamCredential({
      password: currentPassword,
      passwordHash: member.member_password_hash,
    });
    if (!validCurrentPassword) {
      return {
        ok: false,
        status: 401,
        body: { error: "invalid_current_password", message: "当前密码不正确。" },
      };
    }

    const nextPasswordHash = await createUserPasswordHash(newPassword);
    await db.query(
      `
        UPDATE team_members
        SET member_password_hash = $3,
            updated_at = $4
        WHERE user_id = $1
          AND id = $2
      `,
      [input.userId, input.teamMemberId, nextPasswordHash, input.now],
    );
    await db.query(
      `
        UPDATE team_member_auth_sessions
        SET status = 'revoked',
            revoked_at = $3
        WHERE user_id = $1
          AND member_id = $2
          AND status = 'active'
      `,
      [input.userId, input.teamMemberId, input.now],
    );

    return { ok: true };
  }

  const user = await queryOne<{
    id: string;
    phone_e164: string | null;
    password_hash: string | null;
  }>(
    db,
    `
      SELECT id, phone_e164, password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [input.userId],
  );
  if (!user) {
    return {
      ok: false,
      status: 404,
      body: { error: "user_not_found", message: "当前登录用户不存在。" },
    };
  }

  let validCurrentPassword = false;
  if (user.password_hash) {
    validCurrentPassword = await verifyTeamCredential({
      password: currentPassword,
      passwordHash: user.password_hash,
    });
  } else if (user.phone_e164) {
    validCurrentPassword = currentPassword === defaultPasswordFromPhone(user.phone_e164);
  }

  if (!validCurrentPassword) {
    return {
      ok: false,
      status: 401,
      body: { error: "invalid_current_password", message: "当前密码不正确。" },
    };
  }

  const nextPasswordHash = await createUserPasswordHash(newPassword);
  await db.query(
    `
      UPDATE users
      SET password_hash = $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.userId, nextPasswordHash, input.now],
  );
  await db.query(
    `
      UPDATE auth_sessions
      SET status = 'revoked',
          revoked_at = $2
      WHERE user_id = $1
        AND status = 'active'
    `,
    [input.userId, input.now],
  );

  return { ok: true };
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

function isTeamAssetUploadPurpose(value: unknown): boolean {
  return String(value ?? "").trim().startsWith("team-assets/");
}

async function hasActiveOrganizationEntitlement(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    organizationId: string;
    userId?: string | null;
    entitlementKey: string;
    now: Date;
  },
): Promise<boolean> {
  const entitlement = await queryOne<{ id: string }>(
    db,
    `
      SELECT id::text AS id
      FROM organization_entitlements
      WHERE organization_id = $1
        AND entitlement_key = $2
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $3)
      UNION ALL
      SELECT membership.user_id::text AS id
      FROM memberships membership
      WHERE membership.user_id = $4
        AND membership.status = 'active'
        AND membership.membership_tier = 'professional'
        AND membership.expires_at > $3
        AND $2 IN ('team_member_management', 'team_asset_library', 'team_dashboard')
      LIMIT 1
    `,
    [input.organizationId, input.entitlementKey, input.now, input.userId ?? null],
  );

  return Boolean(entitlement);
}

function assertRemoteDevServerDatabaseUrl(runtimeEnv: NodeJS.ProcessEnv) {
  const databaseUrl = runtimeEnv.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("phone_auth_dev_server_database_url_required");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("phone_auth_dev_server_invalid_database_url");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]") {
    throw new Error("phone_auth_dev_server_local_database_forbidden");
  }
}

export function createPhoneAuthDevServer(
  options: PhoneAuthDevServerOptions = {},
): PhoneAuthDevServer {
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options.env ?? {}),
  };
  if (runtimeEnv.NODE_ENV === "production" && options.allowProduction !== true) {
    throw new Error("phone_auth_dev_server_forbidden_in_production");
  }
  if (!options.db && options.allowLocalDatabaseUrl !== true) {
    assertRemoteDevServerDatabaseUrl(runtimeEnv);
  }
  const listenHost = options.listenHost?.trim() || "127.0.0.1";
  const originHost = listenHost === "0.0.0.0" ? "127.0.0.1" : listenHost;
  const dbPromise = options.db
    ? Promise.resolve(options.db)
    : runtimeEnv.NODE_ENV === "test"
      ? createMigratedTestDb()
      : createDevDb();
  let resolvedDb: Awaited<typeof dbPromise> | null = null;
  void dbPromise
    .then((db) => {
      resolvedDb = db;
      return repairDevOrganizationLegacyCreditLots(db);
    })
    .catch(() => undefined);
  const repairSchedulerOptions = parseRepairSchedulerOptions(options.repairScheduler);
  let repairSchedulerTimer: ReturnType<typeof setInterval> | null = null;
  let repairSchedulerRunning = false;
  const debugChallengeCodes = new Map<string, string>();
  const wechatLoginStates = new Map<string, { createdAt: number }>();
  const lingxiCommunity = createDefaultLingxiCommunityBoard();
  const smsProvider = createSmsProviderFromEnv(runtimeEnv);
  const authSessionCache = options.authSessionCache ?? createAuthSessionCacheFromEnv(runtimeEnv);
  const devPaymentProviderRegistry = createEnvPaymentProviderRegistry(runtimeEnv);
  const devPaymentMerchantId =
    runtimeEnv.PAYMENT_MERCHANT_ID?.trim() ||
    runtimeEnv.WECHAT_PAY_MCH_ID?.trim();
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
  const httpServer = createServer((request, response) => {
    void runWithDatabaseContext(async () => {
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

        if (
          request.method === "GET" &&
          (pathname === "/admin" || pathname.startsWith("/admin/"))
        ) {
          return await serveAdminStatic(pathname, response);
        }

        const db = await dbPromise;
        const createCreatorApplicationForWorkspace = (workspaceId: string) =>
          createCreatorApplication({
            db,
            workspaceId,
            creatorApps,
            creatorSqlStates,
            storageRuntime,
            signedUrlExpiresInSeconds,
          });
        const creatorApplication = createCreatorApplicationForWorkspace(devWorkspaceId);
        const aiStoryboardTextChatGateway = options.textChatGateway ?? createTextModelChatGateway({
          gateway: new TextModelGatewayService({
            db,
          adapter: new OpenAICompatibleTextAdapter(),
          env: runtimeEnv,
        }),
        workspaceId: null,
      });
      if (pathname.startsWith("/uploads/")) {
        return await serveUploadedFile(request, pathname, response);
      }

      if (pathname.startsWith("/vendor/")) {
        return await serveVendorFile(pathname, response);
      }

      if (request.method === "GET" && pathname === "/api/community") {
        return writeJson(response, enveloped(200, lingxiCommunitySnapshot(lingxiCommunity)));
      }

      if (request.method === "GET" && pathname === "/api/announcements") {
        const announcements = createAnnouncementService({ db });
        const result = await announcements.listActiveAnnouncements({ now: new Date() });
        return writeJson(response, enveloped(200, result.data));
      }

      if (request.method === "POST" && pathname === "/api/community/feedback") {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const item = createLingxiCommunityItem({
          title: String(body.title ?? ""),
          content: String(body.content ?? ""),
          category: String(body.category ?? "问题反馈"),
          author: String(body.author ?? "灵曦用户"),
        });
        if (!item.title || !item.content) {
          return writeJson(response, envelopedError(400, "community_feedback_invalid", "Feedback title and content are required"));
        }
        lingxiCommunity.posts.unshift(item);
        lingxiCommunity.posts.splice(80);
        return writeJson(response, enveloped(201, lingxiCommunitySnapshot(lingxiCommunity)));
      }

      if (request.method === "POST" && pathname === "/api/community/features") {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const item = {
          ...createLingxiCommunityItem({
            title: String(body.title ?? ""),
            content: String(body.content ?? ""),
            category: "功能建议",
            author: String(body.author ?? "灵曦用户"),
          }),
          votes: 1,
        };
        if (!item.title || !item.content) {
          return writeJson(response, envelopedError(400, "community_feature_invalid", "Feature title and content are required"));
        }
        lingxiCommunity.features.unshift(item);
        lingxiCommunity.features.splice(80);
        return writeJson(response, enveloped(201, lingxiCommunitySnapshot(lingxiCommunity)));
      }

      const communityVoteMatch = pathname.match(/^\/api\/community\/features\/([^/]+)\/vote$/);
      if (request.method === "POST" && communityVoteMatch) {
        const featureId = decodeURIComponent(communityVoteMatch[1]);
        const feature = lingxiCommunity.features.find((item) => item.id === featureId);
        if (!feature) {
          return writeJson(response, envelopedError(404, "community_feature_not_found", "Feature request not found"));
        }
        feature.votes = Number(feature.votes || 0) + 1;
        return writeJson(response, enveloped(200, lingxiCommunitySnapshot(lingxiCommunity)));
      }

      if (request.method === "POST" && pathname === "/api/admin/auth/login") {
        const body = (await readJsonBody(request)) as {
          loginName?: string;
          password?: string;
        };
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.login({
            loginName: String(body.loginName ?? ""),
            password: String(body.password ?? ""),
            ipAddress: requestIpAddress(request),
            userAgent: String(request.headers["user-agent"] ?? ""),
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/auth/me") {
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.me({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/auth/logout") {
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.logout({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            now: new Date(),
          }),
        );
      }

      if (request.method === "PATCH" && pathname === "/api/admin/auth/profile") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const body = (await readJsonBody(request)) as {
          displayName?: string;
        };
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.updateProfile({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            displayName: String(body.displayName ?? ""),
            idempotencyKey,
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/auth/password") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const body = (await readJsonBody(request)) as {
          oldPassword?: string;
          newPassword?: string;
          revokeOtherSessions?: boolean;
        };
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.changePassword({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            oldPassword: String(body.oldPassword ?? ""),
            newPassword: String(body.newPassword ?? ""),
            revokeOtherSessions: Boolean(body.revokeOtherSessions),
            idempotencyKey,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/auth/sessions") {
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.listSessions({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/auth/sessions/revoke-other") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminAuth = createAdminAuthService({
          db,
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
        });
        return writeJson(
          response,
          await adminAuth.revokeOtherSessions({
            sessionToken: parseCookies(request.headers.cookie).admin_session,
            idempotencyKey,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/dashboard/overview") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["dashboard.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminDashboard = createAdminDashboardService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminDashboard.overview({
            organizationId: devOrganizationId,
            workspaceId: devWorkspaceId,
            now: new Date(),
          }),
        });
      }

      if (
        request.method === "GET" &&
        (pathname === "/api/admin/dashboard/model-health" || pathname === "/api/admin/dashboard/recent-events")
      ) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["dashboard.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminDashboard = createAdminDashboardService({ db });
        return writeJson(response, {
          status: 200,
          body: pathname.endsWith("/model-health")
            ? await adminDashboard.modelHealth({
                organizationId: devOrganizationId,
                workspaceId: devWorkspaceId,
              })
            : await adminDashboard.recentEvents({
                organizationId: devOrganizationId,
                workspaceId: devWorkspaceId,
              }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/models") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["model.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminModels = createAdminModelConfigService({ db });
        const result = await adminModels.listModels({
          keyword: url.searchParams.get("keyword"),
          status: url.searchParams.get("status"),
          mediaType: url.searchParams.get("mediaType"),
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 50),
        });
        return writeJson(response, {
          status: 200,
          body: result,
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/model-templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["model.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(response, {
          status: 200,
          body: adminModels.listModelTemplates(),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/models/validate-draft") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.validateModelDraft({
            ...body,
            taskModes: Array.isArray(body.taskModes) ? body.taskModes.map(String) : [],
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/models") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.createModel({
            ...body,
            taskModes: Array.isArray(body.taskModes) ? body.taskModes.map(String) : [],
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminModelProbeMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)\/probe$/);
      if (request.method === "POST" && adminModelProbeMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.probeModelConfig({
            id: decodeURIComponent(adminModelProbeMatch[1]),
            reason: String(body.reason ?? ""),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminModelDuplicateMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)\/duplicate$/);
      if (request.method === "POST" && adminModelDuplicateMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          modelCode?: string;
          displayName?: string;
          reason?: string;
        };
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.duplicateModel({
            id: decodeURIComponent(adminModelDuplicateMatch[1]),
            modelCode: String(body.modelCode ?? ""),
            displayName: String(body.displayName ?? ""),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminModelStatusMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)\/status$/);
      if (request.method === "PATCH" && adminModelStatusMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelPublish],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          status?: string;
          reason?: string;
        };
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.changeStatus({
            id: decodeURIComponent(adminModelStatusMatch[1]),
            status: String(body.status ?? ""),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminModelRevisionsMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)\/revisions$/);
      if (request.method === "GET" && adminModelRevisionsMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["model.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.listRevisions({
            id: decodeURIComponent(adminModelRevisionsMatch[1]),
            pageSize: Number(url.searchParams.get("pageSize") ?? 50),
          }),
        );
      }

      const adminModelRollbackMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)\/rollback$/);
      if (request.method === "POST" && adminModelRollbackMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelPublish],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          revisionId?: string;
          reason?: string;
        };
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.rollbackModel({
            id: decodeURIComponent(adminModelRollbackMatch[1]),
            revisionId: String(body.revisionId ?? ""),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminModelDetailMatch = pathname.match(/^\/api\/admin\/models\/([^/]+)$/);
      if (request.method === "DELETE" && adminModelDetailMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.deleteModel({
            id: decodeURIComponent(adminModelDetailMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "PATCH" && adminModelDetailMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.modelWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const adminModels = createAdminModelConfigService({ db });
        return writeJson(
          response,
          await adminModels.updateModel({
            id: decodeURIComponent(adminModelDetailMatch[1]),
            patch: {
              ...body,
              taskModes: Array.isArray(body.taskModes) ? body.taskModes.map(String) : undefined,
            },
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && adminModelDetailMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["model.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminModels = createAdminModelConfigService({ db });
        const model = await adminModels.getModel(decodeURIComponent(adminModelDetailMatch[1]));
        if (!model) {
          return writeJson(response, {
            status: 404,
            body: { error: { code: "admin_model_not_found", message: "模型配置不存在。" } },
          });
        }
        return writeJson(response, {
          status: 200,
          body: { data: { model } },
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/users") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminUsers.listUsers({
            keyword: url.searchParams.get("keyword"),
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: Number(url.searchParams.get("pageSize") ?? 20),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/team-permission-accounts") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminUsers.listTeamPermissionAccounts({
            keyword: url.searchParams.get("keyword"),
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: Number(url.searchParams.get("pageSize") ?? 20),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/storyboard-prompt/packages") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listPackages({
            packageType: url.searchParams.get("package_type"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/image-prompt/styles") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminImagePromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listStyles({
            category: url.searchParams.get("category"),
            modelFamily: url.searchParams.get("model_family") ?? url.searchParams.get("modelFamily"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/scene-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminScenePromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listTemplates({
            stage: url.searchParams.get("stage"),
            modelFamily: url.searchParams.get("model_family") ?? url.searchParams.get("modelFamily"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/scene-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminScenePromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...scenePromptTemplateBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create scene prompt template"),
          now: new Date(),
        }));
      }

      const scenePromptTemplateCopyMatch = pathname.match(/^\/api\/admin\/scene-prompt\/templates\/([^/]+)\/copy$/);
      if (request.method === "POST" && scenePromptTemplateCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminScenePromptService({ db });
        return writeJson(response, await service.copyTemplate({
          id: decodeURIComponent(scenePromptTemplateCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy scene prompt template"),
          now: new Date(),
        }));
      }

      const scenePromptTemplateStatusMatch = pathname.match(/^\/api\/admin\/scene-prompt\/templates\/([^/]+)\/status$/);
      if (request.method === "PATCH" && scenePromptTemplateStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminScenePromptService({ db });
        return writeJson(response, await service.changeTemplateStatus({
          id: decodeURIComponent(scenePromptTemplateStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change scene prompt template status"),
          now: new Date(),
        }));
      }

      const scenePromptTemplateMatch = pathname.match(/^\/api\/admin\/scene-prompt\/templates\/([^/]+)$/);
      if (request.method === "PUT" && scenePromptTemplateMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminScenePromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...scenePromptTemplateBody(body),
          id: decodeURIComponent(scenePromptTemplateMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update scene prompt template"),
          now: new Date(),
        }));
      }

      if (request.method === "GET" && pathname === "/api/admin/prop-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminPropPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listTemplates({
            stage: url.searchParams.get("stage"),
            modelFamily: url.searchParams.get("model_family") ?? url.searchParams.get("modelFamily"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/prop-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminPropPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...propPromptTemplateBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create prop prompt template"),
          now: new Date(),
        }));
      }

      const propPromptTemplateCopyMatch = pathname.match(/^\/api\/admin\/prop-prompt\/templates\/([^/]+)\/copy$/);
      if (request.method === "POST" && propPromptTemplateCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminPropPromptService({ db });
        return writeJson(response, await service.copyTemplate({
          id: decodeURIComponent(propPromptTemplateCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy prop prompt template"),
          now: new Date(),
        }));
      }

      const propPromptTemplateStatusMatch = pathname.match(/^\/api\/admin\/prop-prompt\/templates\/([^/]+)\/status$/);
      if (request.method === "PATCH" && propPromptTemplateStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminPropPromptService({ db });
        return writeJson(response, await service.changeTemplateStatus({
          id: decodeURIComponent(propPromptTemplateStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change prop prompt template status"),
          now: new Date(),
        }));
      }

      const propPromptTemplateMatch = pathname.match(/^\/api\/admin\/prop-prompt\/templates\/([^/]+)$/);
      if (request.method === "PUT" && propPromptTemplateMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminPropPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...propPromptTemplateBody(body),
          id: decodeURIComponent(propPromptTemplateMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update prop prompt template"),
          now: new Date(),
        }));
      }

      if (request.method === "GET" && pathname === "/api/admin/shot-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminShotPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listTemplates({
            stage: url.searchParams.get("stage"),
            modelFamily: url.searchParams.get("model_family") ?? url.searchParams.get("modelFamily"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/shot-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminShotPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...shotPromptTemplateBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create shot prompt template"),
          now: new Date(),
        }));
      }

      const shotPromptTemplateCopyMatch = pathname.match(/^\/api\/admin\/shot-prompt\/templates\/([^/]+)\/copy$/);
      if (request.method === "POST" && shotPromptTemplateCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminShotPromptService({ db });
        return writeJson(response, await service.copyTemplate({
          id: decodeURIComponent(shotPromptTemplateCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy shot prompt template"),
          now: new Date(),
        }));
      }

      const shotPromptTemplateStatusMatch = pathname.match(/^\/api\/admin\/shot-prompt\/templates\/([^/]+)\/status$/);
      if (request.method === "PATCH" && shotPromptTemplateStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminShotPromptService({ db });
        return writeJson(response, await service.changeTemplateStatus({
          id: decodeURIComponent(shotPromptTemplateStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change shot prompt template status"),
          now: new Date(),
        }));
      }

      const shotPromptTemplateMatch = pathname.match(/^\/api\/admin\/shot-prompt\/templates\/([^/]+)$/);
      if (request.method === "PUT" && shotPromptTemplateMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminShotPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...shotPromptTemplateBody(body),
          id: decodeURIComponent(shotPromptTemplateMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update shot prompt template"),
          now: new Date(),
        }));
      }

      if (request.method === "POST" && pathname === "/api/admin/image-prompt/styles") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminImagePromptService({ db });
        return writeJson(response, await service.saveStyle({
          ...imagePromptStyleBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create image prompt style"),
          now: new Date(),
        }));
      }

      const imagePromptStyleCopyMatch = pathname.match(/^\/api\/admin\/image-prompt\/styles\/([^/]+)\/copy$/);
      if (request.method === "POST" && imagePromptStyleCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminImagePromptService({ db });
        return writeJson(response, await service.copyStyle({
          id: decodeURIComponent(imagePromptStyleCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy image prompt style"),
          now: new Date(),
        }));
      }

      const imagePromptStyleStatusMatch = pathname.match(/^\/api\/admin\/image-prompt\/styles\/([^/]+)\/status$/);
      if (request.method === "PATCH" && imagePromptStyleStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminImagePromptService({ db });
        return writeJson(response, await service.changeStyleStatus({
          id: decodeURIComponent(imagePromptStyleStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change image prompt style status"),
          now: new Date(),
        }));
      }

      const imagePromptStyleMatch = pathname.match(/^\/api\/admin\/image-prompt\/styles\/([^/]+)$/);
      if (request.method === "PUT" && imagePromptStyleMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminImagePromptService({ db });
        return writeJson(response, await service.saveStyle({
          ...imagePromptStyleBody(body),
          id: decodeURIComponent(imagePromptStyleMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update image prompt style"),
          now: new Date(),
        }));
      }

      if (request.method === "GET" && pathname === "/api/admin/character-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listTemplates({
            stage: url.searchParams.get("stage"),
            keyword: url.searchParams.get("keyword"),
            status: url.searchParams.get("status"),
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/character-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...characterPromptTemplateBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create character prompt template"),
          now: new Date(),
        }));
      }

      const characterPromptTemplateCopyMatch = pathname.match(/^\/api\/admin\/character-prompt\/templates\/([^/]+)\/copy$/);
      if (request.method === "POST" && characterPromptTemplateCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, await service.copyTemplate({
          id: decodeURIComponent(characterPromptTemplateCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy character prompt template"),
          now: new Date(),
        }));
      }

      const characterPromptTemplateStatusMatch = pathname.match(/^\/api\/admin\/character-prompt\/templates\/([^/]+)\/status$/);
      if (request.method === "PATCH" && characterPromptTemplateStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, await service.changeTemplateStatus({
          id: decodeURIComponent(characterPromptTemplateStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change character prompt template status"),
          now: new Date(),
        }));
      }

      const characterPromptTemplateMatch = pathname.match(/^\/api\/admin\/character-prompt\/templates\/([^/]+)$/);
      if (request.method === "PUT" && characterPromptTemplateMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          ...characterPromptTemplateBody(body),
          id: decodeURIComponent(characterPromptTemplateMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update character prompt template"),
          now: new Date(),
        }));
      }

      if (request.method === "POST" && pathname === "/api/admin/character-prompt/compose") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:test"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminCharacterPromptService({ db });
        return writeJson(response, await service.compose({
          template_id: body.template_id === undefined || body.template_id === null ? null : String(body.template_id),
          template_code: body.template_code === undefined || body.template_code === null ? null : String(body.template_code),
          variables: body.variables && typeof body.variables === "object" && !Array.isArray(body.variables)
            ? body.variables as Record<string, unknown>
            : {},
        }));
      }

      if (request.method === "GET" && pathname === "/api/admin/storyboard-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: await service.listTemplates({
            pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 100),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/storyboard-prompt/packages") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.savePackage({
          ...storyboardPromptPackageBody(body),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "create storyboard prompt package"),
          now: new Date(),
        }));
      }

      const storyboardPromptPackageCopyMatch = pathname.match(/^\/api\/admin\/storyboard-prompt\/packages\/([^/]+)\/copy$/);
      if (request.method === "POST" && storyboardPromptPackageCopyMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request).catch(() => ({}))) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.copyPackage({
          id: decodeURIComponent(storyboardPromptPackageCopyMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "copy storyboard prompt package"),
          now: new Date(),
        }));
      }

      const storyboardPromptPackageStatusMatch = pathname.match(/^\/api\/admin\/storyboard-prompt\/packages\/([^/]+)\/status$/);
      if (request.method === "PATCH" && storyboardPromptPackageStatusMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.changePackageStatus({
          id: decodeURIComponent(storyboardPromptPackageStatusMatch[1]),
          status: String(body.status ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "change storyboard prompt package status"),
          now: new Date(),
        }));
      }

      const storyboardPromptPackageMatch = pathname.match(/^\/api\/admin\/storyboard-prompt\/packages\/([^/]+)$/);
      if (request.method === "PUT" && storyboardPromptPackageMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.savePackage({
          ...storyboardPromptPackageBody(body),
          id: decodeURIComponent(storyboardPromptPackageMatch[1]),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "update storyboard prompt package"),
          now: new Date(),
        }));
      }

      if (request.method === "POST" && pathname === "/api/admin/storyboard-prompt/templates") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.saveTemplate({
          name: String(body.name ?? ""),
          code: String(body.code ?? ""),
          base_prompt: String(body.base_prompt ?? ""),
          genre_package_id: String(body.genre_package_id ?? ""),
          emotion_package_ids: stringArray(body.emotion_package_ids),
          camera_package_ids: stringArray(body.camera_package_ids),
          output_package_id: String(body.output_package_id ?? ""),
          taboo_package_ids: stringArray(body.taboo_package_ids),
          is_default: Boolean(body.is_default),
          sort_order: Number(body.sort_order ?? 0),
          status: String(body.status ?? "enabled"),
          remark: String(body.remark ?? ""),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          reason: String(body.reason ?? "save storyboard prompt template"),
          now: new Date(),
        }));
      }

      if (request.method === "POST" && pathname === "/api/admin/storyboard-prompt/compose") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:test"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.compose(storyboardPromptComposeBody(body)));
      }

      if (request.method === "POST" && pathname === "/api/admin/storyboard-prompt/test-generate") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:test"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, await service.testGenerate({
          ...storyboardPromptComposeBody(body),
          novel_content: String(body.novel_content ?? ""),
        }));
      }

      if (request.method === "GET" && pathname === "/api/admin/storyboard-prompt/export") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptExport],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const service = createAdminStoryboardPromptService({ db });
        return writeJson(response, {
          status: 200,
          body: { data: await service.exportConfig() },
        });
      }

      const adminOrganizationTeamPlanLimitMatch = pathname.match(/^\/api\/admin\/organizations\/([^/]+)\/team-plan-limit$/);
      if (request.method === "GET" && adminOrganizationTeamPlanLimitMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.getTeamPlanLimit({
            organizationId: decodeURIComponent(adminOrganizationTeamPlanLimitMatch[1]),
          }),
        );
      }

      if (request.method === "PATCH" && adminOrganizationTeamPlanLimitMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.userWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          seatLimit?: number | null;
          reason?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.updateTeamPlanLimit({
            organizationId: decodeURIComponent(adminOrganizationTeamPlanLimitMatch[1]),
            seatLimit: body.seatLimit === null ? null : Number(body.seatLimit),
            reason: String(body.reason ?? ""),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserSubaccountsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/subaccounts$/);
      if (request.method === "GET" && adminUserSubaccountsMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminUsers.listSubaccounts({
            userId: decodeURIComponent(adminUserSubaccountsMatch[1]),
          }),
        });
      }

      const adminUserGrantCreditsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/grant$/);
      if (request.method === "POST" && adminUserGrantCreditsMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.creditAdjust],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          amount?: number;
          reason?: string;
          workOrderNo?: string;
          adjustmentScenario?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.grantUserCredits({
            userId: decodeURIComponent(adminUserGrantCreditsMatch[1]),
            amount: Number(body.amount ?? 0),
            reason: String(body.reason ?? ""),
            workOrderNo: String(body.workOrderNo ?? ""),
            adjustmentScenario: String(body.adjustmentScenario ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserContactRevealMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/contact\/reveal$/);
      if (request.method === "POST" && adminUserContactRevealMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.userWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.revealUserContact({
            userId: decodeURIComponent(adminUserContactRevealMatch[1]),
            reason: String(body.reason ?? ""),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
          }),
        );
      }

      const adminUserMembershipGrantMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/membership\/grant$/);
      if (request.method === "POST" && adminUserMembershipGrantMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.creditAdjust],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          membershipPlanId?: string;
          reason?: string;
          workOrderNo?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.grantUserMembership({
            userId: decodeURIComponent(adminUserMembershipGrantMatch[1]),
            membershipPlanId: String(body.membershipPlanId ?? ""),
            reason: String(body.reason ?? ""),
            workOrderNo: String(body.workOrderNo ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserProfileMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/profile$/);
      if (request.method === "PATCH" && adminUserProfileMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.userWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          displayName?: string;
          email?: string | null;
          reason?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.updateUserProfile({
            userId: decodeURIComponent(adminUserProfileMatch[1]),
            displayName: body.displayName,
            email: body.email,
            reason: String(body.reason ?? ""),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
      if (request.method === "PATCH" && adminUserStatusMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.userWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          status?: string;
          reason?: string;
        };
        const adminUsers = createAdminUserService({ db });
        const userId = decodeURIComponent(adminUserStatusMatch[1]);
        const requestedStatus = String(body.status ?? "");
        const shouldBlockUser = requestedStatus === "disabled" || requestedStatus === "archived";
        if (shouldBlockUser) {
          await authSessionCache?.blockUser(userId, true);
        }
        const result = await adminUsers.updateUserStatus({
            userId,
            status: requestedStatus,
            reason: String(body.reason ?? ""),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          });
        if (result.status === 200) {
          const blocked = requestedStatus !== "active";
          await authSessionCache?.blockUser(userId, blocked);
          await authSessionCache?.invalidateUser(userId);
        } else if (shouldBlockUser) {
          await authSessionCache?.blockUser(userId, false);
        }
        return writeJson(response, result);
      }

      const adminUserDeductCreditsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/deduct$/);
      if (request.method === "POST" && adminUserDeductCreditsMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.creditAdjust],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          amount?: number;
          reason?: string;
          workOrderNo?: string;
          adjustmentScenario?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.deductUserCredits({
            userId: decodeURIComponent(adminUserDeductCreditsMatch[1]),
            amount: Number(body.amount ?? 0),
            reason: String(body.reason ?? ""),
            workOrderNo: String(body.workOrderNo ?? ""),
            adjustmentScenario: String(body.adjustmentScenario ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserRestoreFrozenCreditsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/frozen\/restore$/);
      if (request.method === "POST" && adminUserRestoreFrozenCreditsMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.creditAdjust],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminUsers = createAdminUserService({ db });
        return writeJson(
          response,
          await adminUsers.restoreFrozenUserCredits({
            userId: decodeURIComponent(adminUserRestoreFrozenCreditsMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminUserCreditLedgerMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/credits\/ledger$/);
      if (request.method === "GET" && adminUserCreditLedgerMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminUsers.listUserCreditLedger({
            userId: decodeURIComponent(adminUserCreditLedgerMatch[1]),
            pageSize: Number(url.searchParams.get("pageSize") ?? 50),
          }),
        });
      }

      const adminUserModelRequestsMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/model-requests$/);
      if (request.method === "GET" && adminUserModelRequestsMatch) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["user.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminUsers = createAdminUserService({ db });
        const result = await adminUsers.listUserModelRequestLogs({
          userId: decodeURIComponent(adminUserModelRequestsMatch[1]),
          page: Number(url.searchParams.get("page") ?? 1),
          pageSize: Number(url.searchParams.get("pageSize") ?? 15),
          modelType: (url.searchParams.get("modelType") ?? "all") as "text" | "image" | "video" | "all",
        });
        if ("status" in result && "body" in result) {
          return writeJson(response, result);
        }
        return writeJson(response, {
          status: 200,
          body: result,
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/risks") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["risk.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminRiskAudit = createAdminRiskAuditService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminRiskAudit.listRisks({
            organizationId: devOrganizationId,
            workspaceId: devWorkspaceId,
            pageSize: Number(url.searchParams.get("pageSize") ?? 50),
            riskStatus: url.searchParams.get("riskStatus"),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/exports/risks.csv") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.riskExport],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminRiskAudit = createAdminRiskAuditService({ db });
        const exported = await adminRiskAudit.exportRisksCsv({
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
          riskStatus: url.searchParams.get("riskStatus"),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          now: new Date(),
        });
        return writeText(response, {
          status: 200,
          contentType: "text/csv; charset=utf-8",
          body: exported.body,
          fileName: exported.fileName,
        });
      }

      const adminRiskReviewMatch = pathname.match(/^\/api\/admin\/risks\/([^/]+)\/review$/);
      if (request.method === "POST" && adminRiskReviewMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.riskReview],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminRiskAudit = createAdminRiskAuditService({ db });
        return writeJson(
          response,
          await adminRiskAudit.reviewPaymentRisk({
            riskId: decodeURIComponent(adminRiskReviewMatch[1]),
            organizationId: devOrganizationId,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/audit-events") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["audit.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminRiskAudit = createAdminRiskAuditService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminRiskAudit.listAuditEvents({
            organizationId: devOrganizationId,
            workspaceId: devWorkspaceId,
            pageSize: Number(url.searchParams.get("pageSize") ?? 50),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/exports/audit-events.csv") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.riskExport],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminRiskAudit = createAdminRiskAuditService({ db });
        const exported = await adminRiskAudit.exportAuditEventsCsv({
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
          actorAdminAccountId: adminRoute.session.admin_account_id,
          auditOrganizationId: devOrganizationId,
          auditWorkspaceId: devWorkspaceId,
          now: new Date(),
        });
        return writeText(response, {
          status: 200,
          contentType: "text/csv; charset=utf-8",
          body: exported.body,
          fileName: exported.fileName,
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/membership/plans") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const membershipPlans = createMembershipPlanService({ db });
        return writeJson(response, {
          status: 200,
          body: await membershipPlans.listPlans({
            includeArchived: ["1", "true"].includes(url.searchParams.get("includeArchived") ?? ""),
            now: new Date(),
          }),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/membership/grantable-plans") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.creditAdjust],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const membershipPlans = createMembershipPlanService({ db });
        return writeJson(response, {
          status: 200,
          body: await membershipPlans.listGrantablePlans({
            now: new Date(),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/membership/plans/reorder") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const membershipPlans = createMembershipPlanService({ db });
        return writeJson(
          response,
          await membershipPlans.reorderPlans({
            items: readRecordArray(body.items).map((item) => ({
              id: String(item.id ?? ""),
              sortOrder: Number(item.sortOrder),
            })),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            reason: "后台拖拽调整套餐顺序",
            idempotencyKey,
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/membership/plans") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const membershipPlans = createMembershipPlanService({ db });
        return writeJson(
          response,
          await membershipPlans.savePlan({
            id: body.id === undefined || body.id === null ? null : String(body.id),
            code: String(body.code ?? ""),
            displayName: String(body.displayName ?? ""),
            tier: normalizeMembershipTier(body.tier),
            periodUnit: normalizeMembershipPeriodUnit(body.periodUnit),
            periodCount: Number(body.periodCount),
            amountMinor: Number(body.amountMinor),
            currency: String(body.currency ?? "CNY"),
            giftCredits: Number(body.giftCredits),
            seatLimit: body.seatLimit === undefined || body.seatLimit === null
              ? null
              : Number(body.seatLimit),
            entitlements: stringArray(body.entitlements),
            priorityRules: objectBody(body.priorityRules),
            displayMetadata: objectBody(body.displayMetadata),
            visibility: String(body.visibility ?? "public"),
            usageScene: String(body.usageScene ?? "purchase"),
            status: normalizeMembershipPlanStatus(body.status),
            validFrom: body.validFrom === undefined || body.validFrom === null ? null : String(body.validFrom),
            validUntil: body.validUntil === undefined || body.validUntil === null ? null : String(body.validUntil),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            idempotencyOrganizationId: devOrganizationId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/invite-rewards/config") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const inviteRewardAdmin = createInviteRewardAdminService({ db });
        return writeJson(response, {
          status: 200,
          body: await inviteRewardAdmin.getConfig(),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/invite-rewards/config") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const inviteRewardAdmin = createInviteRewardAdminService({ db });
        const result = await inviteRewardAdmin.saveConfig({
          newUserPlanId: body.newUserPlanId === undefined || body.newUserPlanId === null ? null : String(body.newUserPlanId),
          newUserGiftCredits: Number(body.newUserGiftCredits ?? 0),
          inviterPlanId: body.inviterPlanId === undefined || body.inviterPlanId === null ? null : String(body.inviterPlanId),
          inviterGiftCredits: Number(body.inviterGiftCredits ?? 0),
          rebatePercent: Number(body.rebatePercent ?? 0),
          rebateWindowDays: Number(body.rebateWindowDays ?? 0),
          rebateCreditRate: Number(body.rebateCreditRate ?? 0),
          perInvitedUserRebateCapMinor: body.perInvitedUserRebateCapMinor === undefined || body.perInvitedUserRebateCapMinor === null || body.perInvitedUserRebateCapMinor === ""
            ? null
            : Number(body.perInvitedUserRebateCapMinor),
          perInviterPeriodRebateCapMinor: body.perInviterPeriodRebateCapMinor === undefined || body.perInviterPeriodRebateCapMinor === null || body.perInviterPeriodRebateCapMinor === ""
            ? null
            : Number(body.perInviterPeriodRebateCapMinor),
          actorAdminAccountId: adminRoute.session.admin_account_id,
          now: new Date(),
        });
        if ("error" in result) {
          return writeJson(response, result.error);
        }
        return writeJson(response, result);
      }

      const adminMembershipPlanMatch = pathname.match(/^\/api\/admin\/membership\/plans\/([^/]+)$/);
      if (request.method === "DELETE" && adminMembershipPlanMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const membershipPlans = createMembershipPlanService({ db });
        return writeJson(
          response,
          await membershipPlans.deletePlan({
            id: decodeURIComponent(adminMembershipPlanMatch[1]),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            idempotencyOrganizationId: devOrganizationId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/credit-packages") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        await ensureDefaultCreditPackage(db, { now: new Date() });
        const creditPackages = createCreditPackageService({ db });
        return writeJson(response, {
          status: 200,
          body: await creditPackages.listPackages({
            includeArchived: ["1", "true"].includes(url.searchParams.get("includeArchived") ?? ""),
            now: new Date(),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/credit-packages") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const creditPackages = createCreditPackageService({ db });
        return writeJson(
          response,
          await creditPackages.savePackage({
            id: body.id === undefined || body.id === null ? null : String(body.id),
            code: String(body.code ?? ""),
            displayName: String(body.displayName ?? ""),
            subtitle: body.subtitle === undefined || body.subtitle === null ? null : String(body.subtitle),
            credits: Number(body.credits ?? body.baseCredits ?? 0),
            giftCredits: Number(body.giftCredits ?? 0),
            amountMinor: Number(body.amountMinor ?? 0),
            currency: String(body.currency ?? "CNY"),
            badge: body.badge === undefined || body.badge === null ? null : String(body.badge),
            sortOrder: body.sortOrder === undefined || body.sortOrder === null ? 100 : Number(body.sortOrder),
            metadata: objectBody(body.metadata),
            status: String(body.status ?? "active"),
            validFrom: body.validFrom === undefined || body.validFrom === null ? null : String(body.validFrom),
            validUntil: body.validUntil === undefined || body.validUntil === null ? null : String(body.validUntil),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            idempotencyKey,
            idempotencyOrganizationId: devOrganizationId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/direct-recharge/packages") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const creditPackages = createCreditPackageService({ db });
        const result = await creditPackages.listPackages({
          includeArchived: ["1", "true"].includes(url.searchParams.get("includeArchived") ?? ""),
          now: new Date(),
        });
        return writeJson(response, {
          status: 200,
          body: {
            data: {
              packages: result.data.packages.filter(
                (item) => item.metadata?.kind === "direct_recharge",
              ),
            },
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/direct-recharge/packages/reorder") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const creditPackages = createCreditPackageService({ db });
        return writeJson(
          response,
          await creditPackages.reorderPackages({
            items: readRecordArray(body.items).map((item) => ({
              id: String(item.id ?? ""),
              sortOrder: Number(item.sortOrder),
            })),
            metadataKind: "direct_recharge",
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/direct-recharge/packages") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = objectBody(await readJsonBody(request));
        const metadata = objectBody(body.metadata);
        const creditPackages = createCreditPackageService({ db });
        return writeJson(
          response,
          await creditPackages.savePackage({
            id: body.id === undefined || body.id === null ? null : String(body.id),
            code: String(body.code ?? ""),
            displayName: String(body.displayName ?? ""),
            subtitle: body.subtitle === undefined || body.subtitle === null ? null : String(body.subtitle),
            credits: Number(body.credits ?? body.baseCredits ?? 0),
            giftCredits: 0,
            amountMinor: Number(body.amountMinor ?? 0),
            currency: String(body.currency ?? "CNY"),
            badge: body.badge === undefined || body.badge === null ? null : String(body.badge),
            sortOrder: body.sortOrder === undefined || body.sortOrder === null ? 100 : Number(body.sortOrder),
            metadata: { ...metadata, kind: "direct_recharge" },
            status: String(body.status ?? "active"),
            validFrom: body.validFrom === undefined || body.validFrom === null ? null : String(body.validFrom),
            validUntil: body.validUntil === undefined || body.validUntil === null ? null : String(body.validUntil),
            actorAdminAccountId: adminRoute.session.admin_account_id,
            idempotencyKey,
            idempotencyOrganizationId: devOrganizationId,
            now: new Date(),
          }),
        );
      }

      const adminDirectRechargePackageMatch = pathname.match(/^\/api\/admin\/direct-recharge\/packages\/([^/]+)$/);
      if (request.method === "DELETE" && adminDirectRechargePackageMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.membershipPlanManage],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const creditPackages = createCreditPackageService({ db });
        return writeJson(
          response,
          await creditPackages.deletePackage({
            id: decodeURIComponent(adminDirectRechargePackageMatch[1]),
            metadataKind: "direct_recharge",
            idempotencyKey,
            idempotencyOrganizationId: devOrganizationId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/settings") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.listSettings(),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/batch-image-prompt-presets") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["storyboard_prompt:view"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.getBatchImagePromptPresetCategories(),
        });
      }

      if (request.method === "PATCH" && pathname === "/api/admin/batch-image-prompt-presets") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.storyboardPromptWrite],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          value?: unknown;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.updateBatchImagePromptPresetCategories({
            value: body.value,
            reason: String(body.reason ?? "更新批量生图预设"),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/official-assets") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const officialAssets = createOfficialAssetAdminService({ db });
        return writeJson(response, {
          status: 200,
          body: await officialAssets.listAssets({
            category: url.searchParams.get("category"),
            folder: url.searchParams.get("folder"),
            status: url.searchParams.get("status"),
            query: url.searchParams.get("q") ?? url.searchParams.get("query"),
          }),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/official-assets/uploads") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.write"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const fileName = normalizeUploadFileName(
          url.searchParams.get("fileName") ?? request.headers["x-file-name"],
        );
        if (!fileName || /^https?:/i.test(fileName)) {
          return writeJson(
            response,
            envelopedError(400, "official_asset_upload_file_name_invalid", "Official asset upload file name is invalid"),
          );
        }
        const contentType = normalizeUploadContentType(request.headers["content-type"]);
        const bytes = await readBinaryBody(request);
        if (!bytes.byteLength) {
          return writeJson(
            response,
            envelopedError(400, "official_asset_upload_empty", "Official asset upload file is empty"),
          );
        }
        const uploadPolicy = validateUploadPolicy({
          fileName,
          contentType,
          sizeBytes: bytes.byteLength,
          purpose: "official-assets",
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
        if (uploadPolicy.kind !== "image") {
          return writeJson(
            response,
            envelopedError(400, "official_asset_upload_image_required", "Official assets only support image uploads"),
          );
        }
        if (typeof storageRuntime.adapter.putObject !== "function") {
          return writeJson(
            response,
            envelopedError(500, "cloud_storage_required", "Cloud storage is required for official asset uploads"),
          );
        }

        const now = new Date();
        const objectKey = buildOfficialAssetUploadObjectKey({
          fileName,
          now,
          env: runtimeEnv,
        });
        const putResult = await storageRuntime.adapter.putObject({
          bucket: storageRuntime.bucket,
          objectKey,
          body: bytes,
          contentType,
          contentLength: bytes.byteLength,
        });
        const publicUrl = buildStorageObjectPublicUrl(storageRuntime, {
          bucket: storageRuntime.bucket,
          objectKey,
        });
        const sourceUrl = publicUrl || (await storageRuntime.adapter.createSignedReadUrl({
          bucket: storageRuntime.bucket,
          objectKey,
          expiresAt: new Date(now.getTime() + signedUrlExpiresInSeconds * 1000),
        })).url;

        return writeJson(response, {
          status: 200,
          body: {
            data: {
              provider: storageRuntime.provider,
              bucket: storageRuntime.bucket,
              storageObjectKey: objectKey,
              previewUrl: sourceUrl,
              sourceUrl,
              mimeType: contentType,
              byteSize: bytes.byteLength,
              originalFileName: fileName,
              eTag: putResult?.eTag ?? null,
              versionId: putResult?.versionId ?? null,
            },
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/official-assets") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.write"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const officialAssets = createOfficialAssetAdminService({ db });
        return writeJson(response, {
          status: 200,
          body: await officialAssets.saveAsset({
            body,
            now: new Date(),
          }),
        });
      }

      const adminOfficialAssetMatch = pathname.match(
        /^\/api\/admin\/official-assets\/([^/]+)(?:\/(archive|restore))?$/,
      );
      if (adminOfficialAssetMatch) {
        const assetId = decodeURIComponent(adminOfficialAssetMatch[1]);
        const action = adminOfficialAssetMatch[2] ?? "";
        const officialAssets = createOfficialAssetAdminService({ db });

        if (request.method === "GET" && !action) {
          const adminRoute = await requireAdminRouteSession({
            db,
            cookieHeader: request.headers.cookie,
            requiredPermissions: ["settings.read"],
          });
          if (!adminRoute.ok) {
            return writeJson(response, adminRoute.response);
          }
          return writeJson(response, {
            status: 200,
            body: { data: await officialAssets.getAsset(assetId) },
          });
        }

        if (request.method === "PATCH" && !action) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const adminRoute = await requireAdminRouteSession({
            db,
            cookieHeader: request.headers.cookie,
            requiredPermissions: ["settings.write"],
          });
          if (!adminRoute.ok) {
            return writeJson(response, adminRoute.response);
          }
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          return writeJson(response, {
            status: 200,
            body: await officialAssets.saveAsset({
              assetId,
              body,
              now: new Date(),
            }),
          });
        }

        if (request.method === "POST" && (action === "archive" || action === "restore")) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const adminRoute = await requireAdminRouteSession({
            db,
            cookieHeader: request.headers.cookie,
            requiredPermissions: ["settings.write"],
          });
          if (!adminRoute.ok) {
            return writeJson(response, adminRoute.response);
          }
          const now = new Date();
          return writeJson(response, {
            status: 200,
            body: action === "archive"
              ? await officialAssets.archiveAsset({ assetId, now })
              : await officialAssets.restoreAsset({ assetId, now }),
          });
        }
      }

      if (request.method === "GET" && pathname === "/api/admin/settings/revisions") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.listRuntimeConfigRevisions({
            key: url.searchParams.get("key"),
            pageSize: Number(url.searchParams.get("pageSize") ?? 50),
          }),
        });
      }

      const adminSettingRollbackMatch = pathname.match(/^\/api\/admin\/settings\/([^/]+)\/rollback$/);
      if (request.method === "POST" && adminSettingRollbackMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          revisionId?: string;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.rollbackRuntimeConfig({
            key: decodeURIComponent(adminSettingRollbackMatch[1]),
            revisionId: String(body.revisionId ?? ""),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminSettingPatchMatch = pathname.match(/^\/api\/admin\/settings\/([^/]+)$/);
      if (request.method === "PATCH" && adminSettingPatchMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          value?: unknown;
          valueType?: string;
          scope?: string;
          description?: string | null;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.updateRuntimeConfig({
            key: decodeURIComponent(adminSettingPatchMatch[1]),
            value: body.value,
            valueType: String(body.valueType ?? "json"),
            scope: String(body.scope ?? "global"),
            description: body.description ?? null,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/legal-documents") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["settings.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.listLegalDocuments(),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/legal-documents") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          type?: string;
          title?: string;
          contentHtml?: string;
          versionLabel?: string | null;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.createLegalDocument({
            type: String(body.type ?? ""),
            title: String(body.title ?? ""),
            contentHtml: String(body.contentHtml ?? ""),
            versionLabel: body.versionLabel ?? null,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminLegalDocumentPatchMatch = pathname.match(/^\/api\/admin\/legal-documents\/([^/]+)$/);
      if (request.method === "PATCH" && adminLegalDocumentPatchMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          type?: string;
          title?: string;
          contentHtml?: string;
          versionLabel?: string | null;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.updateLegalDocument({
            id: decodeURIComponent(adminLegalDocumentPatchMatch[1]),
            type: body.type == null ? undefined : String(body.type ?? ""),
            title: String(body.title ?? ""),
            contentHtml: String(body.contentHtml ?? ""),
            versionLabel: body.versionLabel ?? null,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminLegalDocumentEnableMatch = pathname.match(/^\/api\/admin\/legal-documents\/([^/]+)\/enable$/);
      if (request.method === "POST" && adminLegalDocumentEnableMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          enabled?: boolean;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.enableLegalDocument({
            id: decodeURIComponent(adminLegalDocumentEnableMatch[1]),
            enabled: body.enabled !== false,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminLegalDocumentDeleteMatch = pathname.match(/^\/api\/admin\/legal-documents\/([^/]+)$/);
      if (request.method === "DELETE" && adminLegalDocumentDeleteMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.deleteLegalDocument({
            id: decodeURIComponent(adminLegalDocumentDeleteMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminSecretProbeMatch = pathname.match(/^\/api\/admin\/secret-references\/([^/]+)\/probe$/);
      if (request.method === "POST" && adminSecretProbeMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as { reason?: string };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.probeSecretReference({
            id: decodeURIComponent(adminSecretProbeMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "POST" && pathname === "/api/admin/secret-references") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          secretRef?: string;
          envName?: string;
          secretValue?: string;
          purpose?: string;
          providerName?: string | null;
          providerChannel?: string | null;
          mediaTypes?: string[];
          modelCodes?: string[];
          baseUrl?: string | null;
          requestDomain?: string | null;
          authHeaderName?: string | null;
          authScheme?: string | null;
          extraHeaders?: Record<string, string> | null;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.createSecretReference({
            secretRef: String(body.secretRef ?? ""),
            envName: String(body.envName ?? ""),
            secretValue: String(body.secretValue ?? ""),
            purpose: String(body.purpose ?? ""),
            providerName: body.providerName ?? null,
            providerChannel: body.providerChannel ?? null,
            mediaTypes: body.mediaTypes,
            modelCodes: body.modelCodes,
            baseUrl: body.baseUrl ?? null,
            requestDomain: body.requestDomain ?? null,
            authHeaderName: body.authHeaderName ?? null,
            authScheme: body.authScheme ?? null,
            extraHeaders: body.extraHeaders ?? null,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            now: new Date(),
          }),
        );
      }

      const adminSecretUpdateMatch = pathname.match(/^\/api\/admin\/secret-references\/([^/]+)$/);
      if (request.method === "PATCH" && adminSecretUpdateMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          secretRef?: string;
          envName?: string;
          secretValue?: string;
          purpose?: string;
          providerName?: string | null;
          providerChannel?: string | null;
          mediaTypes?: string[];
          modelCodes?: string[];
          baseUrl?: string | null;
          requestDomain?: string | null;
          authHeaderName?: string | null;
          authScheme?: string | null;
          extraHeaders?: Record<string, string> | null;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.updateSecretReference({
            id: decodeURIComponent(adminSecretUpdateMatch[1]),
            secretRef: String(body.secretRef ?? ""),
            envName: String(body.envName ?? ""),
            secretValue: String(body.secretValue ?? ""),
            purpose: String(body.purpose ?? ""),
            providerName: body.providerName ?? null,
            providerChannel: body.providerChannel ?? null,
            mediaTypes: body.mediaTypes,
            modelCodes: body.modelCodes,
            baseUrl: body.baseUrl ?? null,
            requestDomain: body.requestDomain ?? null,
            authHeaderName: body.authHeaderName ?? null,
            authScheme: body.authScheme ?? null,
            extraHeaders: body.extraHeaders ?? null,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            now: new Date(),
          }),
        );
      }

      if (request.method === "DELETE" && adminSecretUpdateMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.deleteSecretReference({
            id: decodeURIComponent(adminSecretUpdateMatch[1]),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/admin/admin-accounts") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["admin_account.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.listAdminAccounts(),
        });
      }

      if (request.method === "POST" && pathname === "/api/admin/admin-accounts") {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          loginName?: string;
          password?: string;
          displayName?: string;
          roles?: string[];
          remark?: string | null;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.createAdminAccount({
            loginName: String(body.loginName ?? ""),
            password: String(body.password ?? ""),
            displayName: String(body.displayName ?? ""),
            roles: Array.isArray(body.roles) ? body.roles : [],
            remark: body.remark ?? null,
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminAccountPasswordResetMatch = pathname.match(/^\/api\/admin\/admin-accounts\/([^/]+)\/password$/);
      if (request.method === "POST" && adminAccountPasswordResetMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          newPassword?: string;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.resetAdminAccountPassword({
            accountId: decodeURIComponent(adminAccountPasswordResetMatch[1]),
            newPassword: String(body.newPassword ?? ""),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      const adminAccountPatchMatch = pathname.match(/^\/api\/admin\/admin-accounts\/([^/]+)$/);
      if (request.method === "PATCH" && adminAccountPatchMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: ["super_admin"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as {
          displayName?: string;
          roles?: string[];
          status?: string;
          remark?: string | null;
          reason?: string;
        };
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(
          response,
          await adminSettings.updateAdminAccount({
            accountId: decodeURIComponent(adminAccountPatchMatch[1]),
            displayName: String(body.displayName ?? ""),
            roles: Array.isArray(body.roles) ? body.roles : [],
            status: String(body.status ?? "active"),
            remark: body.remark ?? null,
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            auditOrganizationId: devOrganizationId,
            auditWorkspaceId: devWorkspaceId,
            now: new Date(),
          }),
        );
      }

      if (request.method === "GET" && pathname === "/api/public/legal-documents") {
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.getPublicLegalDocuments(),
        });
      }

      if (request.method === "GET" && pathname === "/api/public/customer-support") {
        const adminSettings = createAdminSystemSettingsService({ db });
        return writeJson(response, {
          status: 200,
          body: await adminSettings.getPublicCustomerSupportConfig(),
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/sms-records") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["audit.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }

        const range = String(url.searchParams.get("range") ?? "all");
        const requestedPageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 20), 1), 500);
        const now = new Date();
        const whereClauses = ["1=1"];
        const params: Array<unknown> = [];
        if (range === "day") {
          const day = shanghaiDayWindow(now);
          whereClauses.push(`created_at >= $${params.length + 1}`);
          params.push(day.start);
          whereClauses.push(`created_at < $${params.length + 1}`);
          params.push(day.end);
        } else if (range === "month") {
          const month = shanghaiMonthWindow(now);
          whereClauses.push(`created_at >= $${params.length + 1}`);
          params.push(month.start);
          whereClauses.push(`created_at < $${params.length + 1}`);
          params.push(month.end);
        }

        const hiddenPhones = ["13800138000", "13800138001"];
        whereClauses.push(`phone_e164 <> ALL($${params.length + 1})`);
        params.push(hiddenPhones);
        const whereSql = whereClauses.join("\n              AND ");
        const totalResult = await db.query<{ count: number | string }>(
          `
            SELECT COUNT(*) AS count
            FROM sms_send_records
            WHERE ${whereSql}
          `,
          params,
        );
        const total = Number(totalResult.rows[0]?.count ?? 0);
        const totalPages = Math.max(1, Math.ceil(total / requestedPageSize));
        const page = Math.min(Math.max(1, Number(url.searchParams.get("page") ?? 1)), totalPages);
        const offset = (page - 1) * requestedPageSize;
        const listParams = [...params, requestedPageSize, offset];
        const rows = await db.query<{
          id: string;
          phone_e164: string;
          challenge_id: string | null;
          verification_code: string | null;
          sms_content: string | null;
          provider: string;
          status: string;
          ip_address: string | null;
          user_agent_hash: string | null;
          provider_request_id: string | null;
          error_code: string | null;
          created_at: Date;
        }>(
          `
            SELECT
              id,
              phone_e164,
              challenge_id,
              verification_code,
              sms_content,
              provider,
              status,
              ip_address,
              user_agent_hash,
              provider_request_id,
              error_code,
              created_at
            FROM sms_send_records
            WHERE ${whereSql}
            ORDER BY created_at DESC, id DESC
            LIMIT $${listParams.length - 1}
            OFFSET $${listParams.length}
          `,
          listParams,
        );

        return writeJson(response, {
          status: 200,
          body: {
            data: rows.rows.map((row) => ({
              id: row.id,
              phone: row.phone_e164,
              verificationCode: row.verification_code,
              smsContent: row.sms_content,
              provider: row.provider,
              status: row.provider === "dev" && row.status === "sent" ? "test" : row.status,
              ipAddress: row.ip_address,
              userAgentHash: row.user_agent_hash,
              providerRequestId: row.provider_request_id,
              errorCode: row.error_code,
              createdAt: row.created_at.toISOString(),
            })),
            meta: {
              page,
              pageSize: requestedPageSize,
              total,
            },
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/resources/summary") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["audit.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }

        const media = String(url.searchParams.get("media") ?? "all");
        const range = String(url.searchParams.get("range") ?? "all");
        const keyword = String(url.searchParams.get("keyword") ?? "").trim().toLowerCase();
        const where: string[] = [
          "so.status IN ('available', 'pending_upload', 'failed', 'delete_failed')",
          "so.content_type IS NOT NULL",
          "so.content_type <> ''",
        ];
        const params: Array<unknown> = [];
        if (media === "image") {
          where.push("so.content_type LIKE 'image/%'");
        } else if (media === "video") {
          where.push("so.content_type LIKE 'video/%'");
        }
        if (range === "day" || range === "month") {
          const window = range === "day" ? shanghaiDayWindow(new Date()) : shanghaiMonthWindow(new Date());
          params.push(window.start, window.end);
          where.push(`so.created_at >= $${params.length - 1} AND so.created_at < $${params.length}`);
        }
        if (keyword) {
          params.push(`%${keyword}%`);
          const keywordParam = `$${params.length}`;
          where.push(
            `(
              LOWER(COALESCE(pur.file_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.object_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.bucket, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.project_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.page_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.actor_display_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.actor_phone_e164, '')) LIKE ${keywordParam}
            )`,
          );
        }

        const totals = await queryOne<{
          total_count: number | string;
          image_count: number | string;
          video_count: number | string;
          image_bytes: number | string | null;
          video_bytes: number | string | null;
        }>(
          db,
          `
            SELECT
              COUNT(*)::bigint AS total_count,
              COUNT(*) FILTER (WHERE so.content_type LIKE 'image/%')::bigint AS image_count,
              COUNT(*) FILTER (WHERE so.content_type LIKE 'video/%')::bigint AS video_count,
              COALESCE(SUM(so.size_bytes) FILTER (WHERE so.content_type LIKE 'image/%'), 0)::bigint AS image_bytes,
              COALESCE(SUM(so.size_bytes) FILTER (WHERE so.content_type LIKE 'video/%'), 0)::bigint AS video_bytes
            FROM storage_objects so
            LEFT JOIN LATERAL (
              SELECT *
              FROM project_upload_records pur
              WHERE pur.storage_object_id = so.id
              ORDER BY pur.created_at DESC
              LIMIT 1
            ) pur ON TRUE
            WHERE ${where.join(" AND ")}
          `,
          params,
        );

        return writeJson(response, {
          status: 200,
          body: {
            total: Number(totals?.total_count ?? 0),
            imageCount: Number(totals?.image_count ?? 0),
            videoCount: Number(totals?.video_count ?? 0),
            imageBytes: Number(totals?.image_bytes ?? 0),
            videoBytes: Number(totals?.video_bytes ?? 0),
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/admin/resources") {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["audit.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }

        const media = String(url.searchParams.get("media") ?? "all");
        const range = String(url.searchParams.get("range") ?? "all");
        const keyword = String(url.searchParams.get("keyword") ?? "").trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 10), 1), 100);
        const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
        const offset = (page - 1) * pageSize;
        const where: string[] = [
          "so.status IN ('available', 'pending_upload', 'failed', 'delete_failed')",
          "so.content_type IS NOT NULL",
          "so.content_type <> ''",
        ];
        const params: Array<unknown> = [];
        if (media === "image") {
          where.push("so.content_type LIKE 'image/%'");
        } else if (media === "video") {
          where.push("so.content_type LIKE 'video/%'");
        }
        if (range === "day" || range === "month") {
          const window = range === "day" ? shanghaiDayWindow(new Date()) : shanghaiMonthWindow(new Date());
          params.push(window.start, window.end);
          where.push(`so.created_at >= $${params.length - 1} AND so.created_at < $${params.length}`);
        }
        if (keyword) {
          params.push(`%${keyword}%`);
          const keywordParam = `$${params.length}`;
          where.push(
            `(
              LOWER(COALESCE(pur.file_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.object_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.bucket, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.project_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.page_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.actor_display_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.actor_phone_e164, '')) LIKE ${keywordParam}
            )`,
          );
        }
        const countParams = [...params];
        params.push(pageSize, offset);
        const rows = await db.query<{
          id: string;
          bucket: string;
          object_key: string;
          content_type: string;
          size_bytes: number | string | null;
          provider: string;
          status: string;
          created_at: Date;
          project_id: string | null;
          workspace_id: string | null;
          project_name: string | null;
          page_key: string | null;
          page_url: string | null;
          source_action: string | null;
          file_name: string | null;
          actor_display_name: string | null;
          actor_phone_e164: string | null;
          upload_status: string | null;
          upload_created_at: Date | null;
          upload_completed_at: Date | null;
          public_url: string | null;
        }>(
          `
            SELECT
              so.id,
              so.bucket,
              so.object_key,
              so.content_type,
              so.size_bytes,
              so.provider,
              so.status,
              so.created_at,
              so.project_id,
              so.workspace_id,
              pur.project_name,
              pur.page_key,
              pur.page_url,
              pur.source_action,
              pur.file_name,
              pur.actor_display_name,
              pur.actor_phone_e164,
              pur.status AS upload_status,
              pur.created_at AS upload_created_at,
              pur.completed_at AS upload_completed_at,
              pur.public_url
            FROM storage_objects so
            LEFT JOIN LATERAL (
              SELECT *
              FROM project_upload_records pur
              WHERE pur.storage_object_id = so.id
              ORDER BY pur.created_at DESC
              LIMIT 1
            ) pur ON TRUE
            WHERE ${where.join(" AND ")}
            ORDER BY so.created_at DESC, so.id DESC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
          `,
          params,
        );
        const totalCount = Number(
          (
            await queryOne<{
              total_count: number | string;
            }>(
              db,
              `
                SELECT COUNT(*)::bigint AS total_count
                FROM storage_objects so
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM project_upload_records pur
                  WHERE pur.storage_object_id = so.id
                  ORDER BY pur.created_at DESC
                  LIMIT 1
                ) pur ON TRUE
                WHERE ${where.join(" AND ")}
              `,
              countParams,
            )
          )?.total_count ?? 0,
        );

        return writeJson(response, {
          status: 200,
          body: {
            data: rows.rows.map((row) => {
              const previewUrl =
                row.public_url ||
                buildStorageObjectPublicUrl(storageRuntime, {
                  bucket: row.bucket,
                  objectKey: row.object_key,
                });
              return {
                id: row.id,
                bucket: row.bucket,
                objectKey: row.object_key,
                contentType: row.content_type,
                mediaKind: row.content_type.startsWith("video/") ? "video" : "image",
                sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
                provider: row.provider,
                status: row.status,
                previewUrl,
                sourceUrl: previewUrl,
                downloadUrl: previewUrl,
                projectId: row.project_id,
                workspaceId: row.workspace_id,
                projectName: row.project_name,
                pageKey: row.page_key,
                pageUrl: row.page_url,
                sourceAction: row.source_action,
                fileName: row.file_name,
                actorDisplayName: row.actor_display_name,
                actorPhoneE164: row.actor_phone_e164,
                uploadStatus: row.upload_status,
                createdAt: row.created_at.toISOString(),
                uploadCreatedAt: row.upload_created_at?.toISOString() ?? null,
                uploadCompletedAt: row.upload_completed_at?.toISOString() ?? null,
              };
            }),
            meta: {
              page,
              pageSize,
              total: totalCount,
              totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
            },
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/creator/media-library/summary") {
        const authenticated = await requireSessionFromRequest(db, request);
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthorized", message: "请重新登录。" },
          });
        }

        const media = String(url.searchParams.get("media") ?? "all");
        const range = String(url.searchParams.get("range") ?? "all");
        const keyword = String(url.searchParams.get("keyword") ?? "").trim().toLowerCase();
        const where: string[] = [
          "so.status IN ('available', 'pending_upload', 'failed', 'delete_failed')",
          "so.content_type IS NOT NULL",
          "so.content_type <> ''",
          "(so.content_type LIKE 'image/%' OR so.content_type LIKE 'video/%')",
          "(COALESCE(pur.actor_user_id, so.created_by_user_id) = $1 OR so.created_by_user_id = $1)",
        ];
        const params: Array<unknown> = [authenticated.user.id];
        if (media === "image") {
          where.push("so.content_type LIKE 'image/%'");
        } else if (media === "video") {
          where.push("so.content_type LIKE 'video/%'");
        }
        if (range === "day" || range === "month") {
          const window = range === "day" ? shanghaiDayWindow(new Date()) : shanghaiMonthWindow(new Date());
          params.push(window.start, window.end);
          where.push(`so.created_at >= $${params.length - 1} AND so.created_at < $${params.length}`);
        }
        if (keyword) {
          params.push(`%${keyword}%`);
          const keywordParam = `$${params.length}`;
          where.push(
            `(
              LOWER(COALESCE(pur.file_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.object_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.project_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.page_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.source_action, '')) LIKE ${keywordParam}
            )`,
          );
        }

        const totals = await queryOne<{
          total_count: number | string;
          image_count: number | string;
          video_count: number | string;
          image_bytes: number | string | null;
          video_bytes: number | string | null;
        }>(
          db,
          `
            SELECT
              COUNT(*)::bigint AS total_count,
              COUNT(*) FILTER (WHERE so.content_type LIKE 'image/%')::bigint AS image_count,
              COUNT(*) FILTER (WHERE so.content_type LIKE 'video/%')::bigint AS video_count,
              COALESCE(SUM(so.size_bytes) FILTER (WHERE so.content_type LIKE 'image/%'), 0)::bigint AS image_bytes,
              COALESCE(SUM(so.size_bytes) FILTER (WHERE so.content_type LIKE 'video/%'), 0)::bigint AS video_bytes
            FROM storage_objects so
            LEFT JOIN LATERAL (
              SELECT *
              FROM project_upload_records pur
              WHERE pur.storage_object_id = so.id
              ORDER BY pur.created_at DESC
              LIMIT 1
            ) pur ON TRUE
            WHERE ${where.join(" AND ")}
          `,
          params,
        );

        return writeJson(response, {
          status: 200,
          body: {
            total: Number(totals?.total_count ?? 0),
            imageCount: Number(totals?.image_count ?? 0),
            videoCount: Number(totals?.video_count ?? 0),
            imageBytes: Number(totals?.image_bytes ?? 0),
            videoBytes: Number(totals?.video_bytes ?? 0),
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/creator/media-library") {
        const authenticated = await requireSessionFromRequest(db, request);
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthorized", message: "请重新登录。" },
          });
        }

        const media = String(url.searchParams.get("media") ?? "all");
        const range = String(url.searchParams.get("range") ?? "all");
        const keyword = String(url.searchParams.get("keyword") ?? "").trim().toLowerCase();
        const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 12), 1), 100);
        const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
        const offset = (page - 1) * pageSize;
        const where: string[] = [
          "so.status IN ('available', 'pending_upload', 'failed', 'delete_failed')",
          "so.content_type IS NOT NULL",
          "so.content_type <> ''",
          "(so.content_type LIKE 'image/%' OR so.content_type LIKE 'video/%')",
          "(COALESCE(pur.actor_user_id, so.created_by_user_id) = $1 OR so.created_by_user_id = $1)",
        ];
        const params: Array<unknown> = [authenticated.user.id];
        if (media === "image") {
          where.push("so.content_type LIKE 'image/%'");
        } else if (media === "video") {
          where.push("so.content_type LIKE 'video/%'");
        }
        if (range === "day" || range === "month") {
          const window = range === "day" ? shanghaiDayWindow(new Date()) : shanghaiMonthWindow(new Date());
          params.push(window.start, window.end);
          where.push(`so.created_at >= $${params.length - 1} AND so.created_at < $${params.length}`);
        }
        if (keyword) {
          params.push(`%${keyword}%`);
          const keywordParam = `$${params.length}`;
          where.push(
            `(
              LOWER(COALESCE(pur.file_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(so.object_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.project_name, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.page_key, '')) LIKE ${keywordParam}
              OR LOWER(COALESCE(pur.source_action, '')) LIKE ${keywordParam}
            )`,
          );
        }
        const countParams = [...params];
        params.push(pageSize, offset);
        const rows = await db.query<{
          id: string;
          bucket: string;
          object_key: string;
          content_type: string;
          size_bytes: number | string | null;
          provider: string;
          status: string;
          created_at: Date;
          project_id: string | null;
          workspace_id: string | null;
          project_name: string | null;
          page_key: string | null;
          page_url: string | null;
          source_action: string | null;
          file_name: string | null;
          actor_display_name: string | null;
          upload_status: string | null;
          upload_created_at: Date | null;
          upload_completed_at: Date | null;
          public_url: string | null;
        }>(
          `
            SELECT
              so.id,
              so.bucket,
              so.object_key,
              so.content_type,
              so.size_bytes,
              so.provider,
              so.status,
              so.created_at,
              so.project_id,
              so.workspace_id,
              pur.project_name,
              pur.page_key,
              pur.page_url,
              pur.source_action,
              pur.file_name,
              pur.actor_display_name,
              pur.status AS upload_status,
              pur.created_at AS upload_created_at,
              pur.completed_at AS upload_completed_at,
              pur.public_url
            FROM storage_objects so
            LEFT JOIN LATERAL (
              SELECT *
              FROM project_upload_records pur
              WHERE pur.storage_object_id = so.id
              ORDER BY pur.created_at DESC
              LIMIT 1
            ) pur ON TRUE
            WHERE ${where.join(" AND ")}
            ORDER BY so.created_at DESC, so.id DESC
            LIMIT $${params.length - 1}
            OFFSET $${params.length}
          `,
          params,
        );
        const totalCount = Number(
          (
            await queryOne<{
              total_count: number | string;
            }>(
              db,
              `
                SELECT COUNT(*)::bigint AS total_count
                FROM storage_objects so
                LEFT JOIN LATERAL (
                  SELECT *
                  FROM project_upload_records pur
                  WHERE pur.storage_object_id = so.id
                  ORDER BY pur.created_at DESC
                  LIMIT 1
                ) pur ON TRUE
                WHERE ${where.join(" AND ")}
              `,
              countParams,
            )
          )?.total_count ?? 0,
        );

        return writeJson(response, {
          status: 200,
          body: {
            data: rows.rows.map((row) => {
              const previewUrl =
                row.public_url ||
                buildStorageObjectPublicUrl(storageRuntime, {
                  bucket: row.bucket,
                  objectKey: row.object_key,
                });
              return {
                id: row.id,
                bucket: row.bucket,
                objectKey: row.object_key,
                contentType: row.content_type,
                mediaKind: row.content_type.startsWith("video/") ? "video" : "image",
                sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
                provider: row.provider,
                status: row.status,
                previewUrl,
                sourceUrl: previewUrl,
                downloadUrl: previewUrl,
                projectId: row.project_id,
                workspaceId: row.workspace_id,
                projectName: row.project_name,
                pageKey: row.page_key,
                pageUrl: row.page_url,
                sourceAction: row.source_action,
                fileName: row.file_name,
                actorDisplayName: row.actor_display_name,
                uploadStatus: row.upload_status,
                createdAt: row.created_at.toISOString(),
                uploadCreatedAt: row.upload_created_at?.toISOString() ?? null,
                uploadCompletedAt: row.upload_completed_at?.toISOString() ?? null,
              };
            }),
            meta: {
              page,
              pageSize,
              total: totalCount,
              totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
            },
          },
        });
      }

      const adminResourceMatch = pathname.match(/^\/api\/admin\/resources\/([^/]+)$/);
      if (request.method === "DELETE" && adminResourceMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["audit.read"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }

        const resourceId = decodeURIComponent(adminResourceMatch[1]);
        const body = (await readJsonBody(request)) as { reason?: string };
        const existing = await queryOne<{
          id: string;
          bucket: string;
          object_key: string;
          status: string;
        }>(
          db,
          `
            SELECT id, bucket, object_key, status
            FROM storage_objects
            WHERE id = $1
            LIMIT 1
          `,
          [resourceId],
        );
        if (!existing) {
          return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
        }

        const deleted = await deleteStorageObjectRecord(db, {
          storageObjectId: resourceId,
          adapter: storageRuntime.adapter,
          localObjectStore: storageRuntime.localObjectStore,
          now: new Date(),
        });
        if (!deleted || deleted.status !== "deleted") {
          return writeJson(response, envelopedError(500, "resource_delete_failed", "resource delete failed"));
        }

        await appendAuditEvent(db, {
          organizationId: devOrganizationId,
          workspaceId: devWorkspaceId,
          actorUserId: null,
          actorAdminAccountId: adminRoute.session.admin_account_id,
          eventType: "admin.resource.deleted",
          targetType: "storage_object",
          targetId: resourceId,
          reason: String(body.reason ?? "后台删除资源"),
          sensitive: true,
          metadata: {
            bucket: existing.bucket,
            objectKey: existing.object_key,
            previousStatus: existing.status,
            deletedStatus: deleted.status,
            idempotencyKey,
          },
        });

        return writeJson(response, enveloped(200, {
          id: resourceId,
          status: deleted.status,
          deleted: true,
        }));
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
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/wechat/start") {
        const config = loadWeChatLoginConfig(runtimeEnv);
        if (!config) {
          return writeJson(response, {
            status: 503,
            body: { enabled: false, error: "wechat_login_not_configured" },
          });
        }

        const state = randomBytes(32).toString("hex");
        wechatLoginStates.set(state, { createdAt: Date.now() });
        return writeJson(response, {
          status: 200,
          body: {
            enabled: true,
            appId: config.appId,
            redirectUri: config.redirectUri,
            scope: "snsapi_login",
            state,
            authorizeUrl: buildWeChatAuthorizeUrl(config, state),
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/wechat/callback") {
        const config = loadWeChatLoginConfig(runtimeEnv);
        if (!config) {
          return writeJson(response, {
            status: 503,
            body: { error: "wechat_login_not_configured" },
          });
        }

        const code = url.searchParams.get("code")?.trim() ?? "";
        const state = url.searchParams.get("state")?.trim() ?? "";
        const stateRecord = wechatLoginStates.get(state);
        wechatLoginStates.delete(state);

        if (!stateRecord || Date.now() - stateRecord.createdAt > 10 * 60 * 1000) {
          return writeJson(response, {
            status: 400,
            body: { error: "wechat_state_invalid" },
          });
        }

        if (!code) {
          return writeJson(response, {
            status: 400,
            body: { error: "wechat_code_required" },
          });
        }

        const tokenPayload = await exchangeWeChatCode(
          config,
          code,
          options.fetchImpl ?? fetch,
        );

        if (!tokenPayload.openid || tokenPayload.errcode) {
          return writeJson(response, {
            status: 502,
            body: {
              error: "wechat_token_exchange_failed",
              providerCode: tokenPayload.errcode ?? null,
            },
          });
        }

        const now = new Date();
        const user = await findOrCreateUserByWeChat(db, {
          appId: config.appId,
          openid: tokenPayload.openid,
          unionid: tokenPayload.unionid,
          now,
        });

        if (user.status !== "active") {
          return writeJson(response, {
            status: 403,
            body: { error: "user_disabled" },
          });
        }

        await ensureDevWorkspaceAccess(db, user.id, options);
        if (user.isNewUser) {
          await grantNewUserBenefits(db, {
            userId: user.id,
            now,
          });
        }
        const session = await createPersistentSessionForUser(db, {
          userId: user.id,
          now,
        });

        return redirectWithSessionCookie(response, "/app.html#project", session.token);
      }

      if (request.method === "POST" && pathname === "/api/auth/code/verify") {
        const body = (await readJsonBody(request)) as {
          challengeId: string;
          phone: string;
          code: string;
          inviteCode?: string;
          remember?: boolean;
        };
        const now = new Date();
        const verified = await verifyPersistentLoginChallenge(db, {
          challengeId: body.challengeId,
          phone: body.phone,
          code: body.code,
          now,
          remember: body.remember !== false,
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

        if (verified.isNewUser) {
          const inviteCode = String(body.inviteCode ?? "").trim();
          const inviteResult = inviteCode
            ? await bindInviteForNewUser(db, {
                invitedUserId: verified.user.id,
                inviteCode,
                now,
                metadata: { source: "code_verify" },
              })
            : null;
          if (!inviteResult || (inviteResult.kind === "ignored" && inviteResult.reason !== "already_bound")) {
            await grantNewUserBenefits(db, {
              userId: verified.user.id,
              now,
            });
          }
        }

        return writeJson(response, {
          status: 200,
          body: {
            user: {
              id: verified.user.id,
              phone: verified.user.phone,
              displayName: verified.user.displayName ?? null,
            },
            session: {
              id: verified.session.id,
              expiresAt: verified.session.expiresAt.toISOString(),
            },
          },
          cookies: [sessionCookie(verified.token, sessionCookieMaxAgeSecondsFromSession(verified.session.expiresAt, now))],
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/team-member/password/login") {
        const body = (await readJsonBody(request)) as {
          account: string;
          password: string;
          remember?: boolean;
        };
        const now = new Date();
        const verified = await verifyPersistentTeamMemberPasswordLogin(db, {
          account: String(body.account ?? ""),
          password: String(body.password ?? ""),
          now,
          remember: body.remember !== false,
        });

        if (verified.kind !== "verified") {
          const status =
            verified.kind === "user_disabled" ||
            verified.kind === "team_member_disabled" ||
            verified.kind === "team_member_deleted"
              ? 403
              : 401;
          return writeJson(response, {
            status,
            body: { error: verified.kind },
          });
        }

        await ensureDevWorkspaceAccess(db, verified.user.id, options);

        return writeJson(response, {
          status: 200,
          body: {
            actorType: "team_member",
            userId: verified.user.id,
            memberId: verified.member.id,
            memberAccount: verified.member.memberAccount,
            memberLoginAccount: verified.member.memberLoginAccount,
            memberName: verified.member.memberName,
            user: {
              id: verified.user.id,
              phone: verified.user.phone,
              displayName: verified.user.displayName ?? null,
            },
            teamMember: verified.member,
            session: {
              id: verified.session.id,
              expiresAt: verified.session.expiresAt.toISOString(),
            },
          },
          cookies: [sessionCookie(verified.token, sessionCookieMaxAgeSecondsFromSession(verified.session.expiresAt, now))],
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/password/login") {
        const body = (await readJsonBody(request)) as {
          account: string;
          password: string;
          remember?: boolean;
        };
        const now = new Date();

        let verified: Awaited<ReturnType<typeof verifyPersistentPasswordLogin>>;
        try {
          verified = await verifyPersistentPasswordLogin(db, {
            account: String(body.account ?? ""),
            password: String(body.password ?? ""),
            now,
            remember: body.remember !== false,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "invalid_phone") {
            return writeJson(response, {
              status: 400,
              body: { error: "invalid_phone" },
            });
          }
          throw error;
        }

        if (verified.kind !== "verified") {
          return writeJson(response, {
            status: verified.kind === "user_disabled" ? 403 : 401,
            body: { error: verified.kind },
          });
        }

        await ensureDevWorkspaceAccess(db, verified.user.id, options);

        return writeJson(response, {
          status: 200,
          body: {
            user: {
              id: verified.user.id,
              phone: verified.user.phone,
              displayName: verified.user.displayName ?? null,
            },
            session: {
              id: verified.session.id,
              expiresAt: verified.session.expiresAt.toISOString(),
            },
          },
          cookies: [sessionCookie(verified.token, sessionCookieMaxAgeSecondsFromSession(verified.session.expiresAt, now))],
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/session") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        return writeJson(response, {
          status: 200,
          body: {
            authenticated: true,
            user: authenticated.user,
            session: {
              id: authenticated.session.id,
              expiresAt: authenticated.session.expiresAt.toISOString(),
            },
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/credit-balance") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
          { includeCredit: false },
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const credit = authenticated.user.teamMember
          ? await getSimpleTeamMemberCreditBalance(db, {
              userId: authenticated.user.id,
              memberId: authenticated.user.teamMember.id,
            })
          : await getUserCreditBalance(db, authenticated.user.id);
        response.setHeader("cache-control", "no-store, private");
        return writeJson(response, {
          status: 200,
          body: credit,
        });
      }

      if (request.method === "GET" && pathname === "/api/auth/invite-summary") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        return writeJson(response, {
          status: 200,
          body: await getAuthenticatedInviteSummary(db, {
            userId: authenticated.user.id,
            request,
          }),
        });
      }

      if (request.method === "PATCH" && pathname === "/api/auth/profile") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        const body = (await readJsonBody(request)) as {
          displayName?: string;
        };
        const updated = await updateAuthenticatedUserProfile(db, {
          userId: authenticated.user.id,
          teamMemberId: authenticated.user.teamMember?.id,
          displayName: String(body.displayName ?? ""),
          now: new Date(),
        });
        if (!updated.ok) {
          return writeJson(response, {
            status: updated.status,
            body: updated.body,
          });
        }

        if (authenticated.user.teamMember?.id) {
          await authSessionCache?.invalidateMember(authenticated.user.teamMember.id);
        } else {
          await authSessionCache?.invalidateUser(authenticated.user.id);
        }

        return writeJson(response, {
          status: 200,
          body: {
            user: {
              ...authenticated.user,
              displayName: updated.user.displayName,
              teamMember: updated.user.teamMember ?? authenticated.user.teamMember,
            },
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/password") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }

        const body = (await readJsonBody(request)) as {
          currentPassword?: string;
          newPassword?: string;
        };
        const changed = await changeAuthenticatedUserPassword(db, {
          userId: authenticated.user.id,
          teamMemberId: authenticated.user.teamMember?.id,
          currentPassword: String(body.currentPassword ?? ""),
          newPassword: String(body.newPassword ?? ""),
          now: new Date(),
        });
        if (!changed.ok) {
          return writeJson(response, {
            status: changed.status,
            body: changed.body,
          });
        }
        if (authenticated.user.teamMember?.id) {
          await authSessionCache?.invalidateMember(authenticated.user.teamMember.id);
        } else {
          await authSessionCache?.invalidateUser(authenticated.user.id);
        }

        return writeJson(response, {
          status: 200,
          body: { ok: true },
        });
      }

      if (request.method === "GET" && pathname === "/api/creator/storyboard-prompt/packages") {
        const service = createAdminStoryboardPromptService({ db });
        const result = await service.listPackages({
          packageType: url.searchParams.get("package_type"),
          keyword: url.searchParams.get("keyword"),
          status: url.searchParams.get("status") ?? "enabled",
          pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 500),
        });
        return writeJson(response, {
          status: 200,
          body: {
            packages: result.data,
          },
        });
      }

      if (request.method === "GET" && pathname === "/api/creator/project-styles") {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const service = createAdminImagePromptService({ db });
        const result = await service.listStyles({
          category: url.searchParams.get("category"),
          modelFamily: url.searchParams.get("model_family") ?? url.searchParams.get("modelFamily"),
          keyword: url.searchParams.get("keyword"),
          status: url.searchParams.get("status") ?? "enabled",
          pageSize: Number(url.searchParams.get("page_size") ?? url.searchParams.get("pageSize") ?? 500),
        });
        return writeJson(response, {
          status: 200,
          body: {
            styles: result.data.map((style) => ({
              id: style.id,
              name: style.name,
              code: style.code,
              coverImageUrl: style.coverImageUrl,
              cover_image_url: style.cover_image_url,
              prompt_content: style.prompt_content,
              promptContent: style.promptContent,
              status: style.status,
              sortOrder: style.sort_order,
              sort_order: style.sort_order,
            })),
          },
        });
      }

      if (request.method === "POST" && pathname === "/api/auth/logout") {
        const sessionToken = parseCookies(request.headers.cookie).auth_session;
        if (sessionToken) {
          const session = await findPersistentAuthSessionByToken(db, {
            token: sessionToken,
            now: new Date(),
          });
          if (session) {
            await authSessionCache?.denySession(sessionToken, session.expiresAt, new Date());
          }
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
        if (runtimeEnv.NODE_ENV !== "test") {
          return writeJson(response, {
            status: 404,
            body: { error: "not_found" },
          });
        }
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
          merchantId: devPaymentMerchantId,
          providerRegistry: devPaymentProviderRegistry,
        });
        const now = new Date();
        const callbackResult = await commercePayment.processProviderCallback({
          provider,
          rawBody: await readTextBody(request),
          headers: singleValueHeaders(request.headers),
          now,
        });
        await dispatchPaymentOutboxBatch(db, { now: new Date(), limit: 10 });
        return writeJson(response, callbackResult);
      }

      if (
        request.method === "POST" &&
        pathname === "/api/billing/payment-callback/mock"
      ) {
        if (runtimeEnv.NODE_ENV !== "test") {
          return writeJson(response, {
            status: 404,
            body: { error: "not_found" },
          });
        }
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: devWorkspaceId,
          callbackSecret: devPaymentCallbackSecret,
          merchantId: devPaymentMerchantId,
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
        const now = new Date();
        const callbackResult = await commercePayment.processPaymentCallback({
          body,
          now,
        });
        await dispatchPaymentOutboxBatch(db, { now: new Date(), limit: 10 });
        return writeJson(response, callbackResult);
      }

      if (pathname.startsWith("/api/membership/")) {
        const membershipCheckoutStartedAt =
          request.method === "POST" && pathname === "/api/membership/checkout"
            ? Date.now()
            : null;
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const membershipCheckoutAuthenticatedAt = Date.now();
        const billingScope = await resolvePersonalBillingScopeForSession(db, authenticated);
        const membershipCheckoutScopeResolvedAt = Date.now();

        const membershipOrders = createMembershipOrderService({
          db,
          workspaceId: billingScope.workspaceId,
        });
        await ensureDefaultMembershipPlan(db, { now: new Date() });
        const membershipCheckoutPlanEnsuredAt = Date.now();

        if (request.method === "GET" && pathname === "/api/membership/plans") {
          return writeJson(response, {
            status: 200,
            body: await membershipOrders.listPurchasablePlans({ now: new Date() }),
          });
        }

        if (request.method === "GET" && pathname === "/api/membership/status") {
          return writeJson(
            response,
            await membershipOrders.getMembershipStatus({
              user: { sessionToken: authenticated.sessionToken },
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/membership/orders") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            membershipPlanId: string;
          };
          return writeJson(
            response,
            await membershipOrders.createMembershipOrder({
              user: { sessionToken: authenticated.sessionToken },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }

        if (request.method === "POST" && pathname === "/api/membership/checkout") {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            membershipPlanId: string;
            provider: PaymentProvider;
            productMode?: string | null;
          };
          const membershipCheckoutBodyReadAt = Date.now();
          const commercePayment = createCommercePaymentService({
            db,
            workspaceId: billingScope.workspaceId,
            callbackSecret: devPaymentCallbackSecret,
            merchantId: devPaymentMerchantId,
            providerRegistry: devPaymentProviderRegistry,
          });
          const orderResult = await membershipOrders.createMembershipOrder({
            user: { sessionToken: authenticated.sessionToken },
            body: { membershipPlanId: String(body.membershipPlanId ?? "") },
            idempotencyKey: `${idempotencyKey}:order`,
            now: new Date(),
          });
          const membershipCheckoutOrderCreatedAt = Date.now();
          if (orderResult.status !== 200 || !("order" in orderResult.body)) {
            return writeJson(response, orderResult);
          }
          const paymentResult = await commercePayment.createPaymentIntent({
            user: { sessionToken: authenticated.sessionToken },
            body: {
              orderId: orderResult.body.order.id,
              provider: body.provider,
              productMode: String(body.productMode ?? "native_qr"),
            },
            idempotencyKey: `${idempotencyKey}:intent`,
            now: new Date(),
          });
          const membershipCheckoutIntentCreatedAt = Date.now();
          if (paymentResult.status !== 200 || !("paymentIntent" in paymentResult.body)) {
            return writeJson(response, paymentResult);
          }
          console.info("[payment] membership checkout timing", {
            provider: body.provider,
            productMode: String(body.productMode ?? "native_qr"),
            totalElapsedMs: membershipCheckoutIntentCreatedAt - membershipCheckoutStartedAt!,
            authenticationElapsedMs:
              membershipCheckoutAuthenticatedAt - membershipCheckoutStartedAt!,
            billingScopeElapsedMs:
              membershipCheckoutScopeResolvedAt - membershipCheckoutAuthenticatedAt,
            ensurePlanElapsedMs:
              membershipCheckoutPlanEnsuredAt - membershipCheckoutScopeResolvedAt,
            bodyReadElapsedMs:
              membershipCheckoutBodyReadAt - membershipCheckoutPlanEnsuredAt,
            orderElapsedMs:
              membershipCheckoutOrderCreatedAt - membershipCheckoutBodyReadAt,
            paymentIntentElapsedMs:
              membershipCheckoutIntentCreatedAt - membershipCheckoutOrderCreatedAt,
          });
          return writeJson(response, {
            status: 200,
            body: {
              order: orderResult.body.order,
              paymentIntent: paymentResult.body.paymentIntent,
              payAction: paymentResult.body.payAction,
            },
          });
        }
      }

      if (pathname.startsWith("/api/billing/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const billingScope = await resolvePersonalBillingScopeForSession(db, authenticated);

        await ensureDefaultCreditPackage(db, { now: new Date() });
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: billingScope.workspaceId,
          callbackSecret: devPaymentCallbackSecret,
          merchantId: devPaymentMerchantId,
          providerRegistry: devPaymentProviderRegistry,
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
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const currentWorkspaceId = await resolvePersonalProjectWorkspaceForSession(db, authenticated);

        if (request.method === "POST" && pathname === "/api/storage/upload-sessions") {
          if (!process.env.DATABASE_URL?.trim()) {
            return writeJson(
              response,
              envelopedError(500, "database_url_required", "DATABASE_URL is required for uploads"),
            );
          }
          if (storageRuntime.mode === "creator-dev") {
            return writeJson(
              response,
              envelopedError(500, "cloud_storage_required", "Cloud storage is required for uploads"),
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
            purpose: body.purpose,
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
            ...(body.projectId?.trim() ? { projectId: body.projectId.trim() } : { workspaceId: currentWorkspaceId }),
            now: new Date(),
          });
          if (isTeamAssetUploadPurpose(body.purpose)) {
            const hasTeamAssetLibrary = await hasActiveOrganizationEntitlement(db, {
              organizationId: actor.organizationId,
              userId: actor.actorId,
              entitlementKey: "team_asset_library",
              now: new Date(),
            });
            if (!hasTeamAssetLibrary) {
              return writeJson(
                response,
                envelopedError(
                  403,
                  "team_asset_library_entitlement_required",
                  "Team asset library membership is required for uploads",
                ),
              );
            }
          }
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

        const uploadSessionStatusMatch = pathname.match(/^\/api\/storage\/upload-sessions\/([^/]+)$/);
        if (request.method === "GET" && uploadSessionStatusMatch) {
          const uploadSessionId = decodeURIComponent(uploadSessionStatusMatch[1] ?? "");
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          try {
            return writeJson(response, {
              status: 200,
              body: await getUploadSessionStatus(db, {
                actor,
                sessionToken: authenticated.sessionToken,
                uploadSessionId,
                now,
                runtime: storageRuntime,
                signedUrlExpiresInSeconds,
              }),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (
              message === "upload_session_not_found" ||
              message === "upload_session_scope_invalid"
            ) {
              return writeJson(
                response,
                envelopedError(404, "upload_session_not_found", "Upload session was not found"),
              );
            }
            throw error;
          }
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
            purpose: session.purpose,
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
            workspaceId: currentWorkspaceId,
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
            workspaceId: currentWorkspaceId,
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
        pathname.startsWith("/api/canvas/") ||
        pathname === "/api/creator/canvas-projects" ||
        pathname.startsWith("/api/creator/canvas-projects/") ||
        pathname === "/api/generation-config" ||
        pathname.startsWith("/api/generation-tasks/")
      ) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(
            response,
            envelopedError(401, "unauthenticated", "session expired"),
          );
        }

        const currentWorkspaceId = pathname.startsWith("/api/creator/canvas-projects") || pathname.startsWith("/api/canvas/")
          ? await ensurePersonalProjectWorkspaceForSession(db, authenticated)
          : devWorkspaceId;

        const canvasNodeRunsMatch = pathname.match(/^\/api\/canvas\/([^/]+)\/nodes\/([^/]+)\/runs$/);
        if (request.method === "GET" && canvasNodeRunsMatch) {
          const canvasProjectId = decodeURIComponent(canvasNodeRunsMatch[1] ?? "");
          const nodeKey = decodeURIComponent(canvasNodeRunsMatch[2] ?? "");
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: capabilities.projectView,
            now: new Date(),
          });
          const canvas = await findCanvasByCanvasProjectId(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? undefined,
            canvasProjectId,
          });
          if (!canvas) {
            return writeJson(response, envelopedError(404, "canvas_project_not_found", "canvas project not found"));
          }
          return writeJson(response, enveloped(200, await listCanvasNodeRuns(db, {
            organizationId: actor.organizationId,
            canvasProjectId,
            nodeKey,
          })));
        }

        const canvasArtifactSelectMatch = pathname.match(/^\/api\/canvas\/([^/]+)\/artifacts\/([^/]+)\/select$/);
        if (request.method === "POST" && canvasArtifactSelectMatch) {
          const canvasProjectId = decodeURIComponent(canvasArtifactSelectMatch[1] ?? "");
          const artifactId = decodeURIComponent(canvasArtifactSelectMatch[2] ?? "");
          const body = (await readJsonBody(request)) as { selectionRole?: unknown };
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: capabilities.projectEdit,
            now: new Date(),
          });
          const canvas = await findCanvasByCanvasProjectId(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? undefined,
            canvasProjectId,
          });
          if (!canvas) {
            return writeJson(response, envelopedError(404, "canvas_project_not_found", "canvas project not found"));
          }
          try {
            return writeJson(response, enveloped(200, {
              artifact: await selectCanvasNodeArtifact(db, {
                organizationId: actor.organizationId,
                canvasProjectId,
                artifactId,
                selectionRole: typeof body.selectionRole === "string" ? body.selectionRole : "current",
                userId: authenticated.user.id,
                now: new Date(),
              }),
            }));
          } catch (error) {
            const status = canvasErrorToStatus(error);
            return writeJson(response, envelopedError(
              status,
              error instanceof CanvasDocumentError ? error.code : "canvas_artifact_select_failed",
              translateProviderErrorMessage(error instanceof Error ? error.message : "画布素材选择失败。"),
            ));
          }
        }

        const canvasNodeRunMatch = pathname.match(/^\/api\/canvas\/([^/]+)\/nodes\/([^/]+)\/run$/);
        if (request.method === "POST" && canvasNodeRunMatch) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeJson(response, envelopedError(400, "idempotency_key_required", "缺少幂等请求标识。"));
          }
          const canvasProjectId = decodeURIComponent(canvasNodeRunMatch[1] ?? "");
          const nodeKey = decodeURIComponent(canvasNodeRunMatch[2] ?? "");
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: capabilities.generationStart,
            now: new Date(),
          });
          let canvas = await findCanvasByCanvasProjectId(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? undefined,
            canvasProjectId,
          });
          if (!canvas) {
            return writeJson(response, envelopedError(404, "canvas_project_not_found", "canvas project not found"));
          }
          if (!canvas.projectId) {
            await ensureStandaloneCanvasRunProject(db, {
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId!,
              canvasProjectId,
              userId: authenticated.user.id,
              now: new Date(),
            });
            canvas = await findCanvasByCanvasProjectId(db, {
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId ?? undefined,
              canvasProjectId,
            });
          }
          if (!canvas?.projectId) {
            return writeJson(response, envelopedError(400, "canvas_episode_required", "canvas node generation requires an episode"));
          }
          const node = canvas.document.nodes.find((item) => item.id === nodeKey);
          if (!node) {
            return writeJson(response, envelopedError(404, "canvas_node_not_found", "canvas node not found"));
          }
          const episodeId = await resolveCanvasRunEpisodeId(db, {
            organizationId: actor.organizationId,
            projectId: canvas.projectId,
            userId: authenticated.user.id,
            now: new Date(),
          });
          if (!episodeId) {
            return writeJson(response, envelopedError(400, "canvas_episode_required", "canvas node generation requires an episode"));
          }
          const mediaKind = String(body.kind ?? body.mediaKind ?? node.data?.mediaKind ?? "image") === "video" ? "video" : "image";
          const run = await createCanvasNodeRun(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId!,
            canvasProjectId,
            nodeKey,
            idempotencyKey,
            status: "created",
            mediaKind,
            modelCode: typeof body.model === "string" ? body.model : typeof body.modelCode === "string" ? body.modelCode : null,
            episodeId,
            targetType: "canvas",
            targetId: nodeKey,
            inputSnapshot: {
              ...body,
              canvasProjectId,
              projectId: canvas.projectId,
              nodeKey,
              nodeData: node.data ?? {},
            },
            userId: authenticated.user.id,
            now: new Date(),
          });
          const generationBody = {
            ...body,
            targetType: "canvas",
            targetId: nodeKey,
            canvasProjectId,
            canvasNodeId: nodeKey,
          };
          const result = await createEpisodeGenerationTask(db, {
            kind: mediaKind,
            episodeId,
            body: generationBody,
            idempotencyKey,
            authenticated,
            runtime: storageRuntime,
            env: runtimeEnv,
            fetchImpl: options.fetchImpl,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!result.body) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          const taskId = readString((result.body as Record<string, unknown>).taskId);
          await markCanvasNodeRunQueued(db, {
            organizationId: actor.organizationId,
            runId: run.id,
            taskId: taskId || null,
            now: new Date(),
          });
          await recordCanvasHistoryFromGenerationResponse(db, {
            responseBody: result.body,
            userId: authenticated.user.id,
            now: new Date(),
          });
          return writeJson(response, enveloped(result.status, {
            ...result.body as Record<string, unknown>,
            runId: run.id,
            runNo: run.runNo,
            canvasProjectId,
            nodeKey,
          }));
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
                "妞ゅ湱娲扮拠锔藉剰閸旂姾娴囨径杈Е",
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
            return writeJson(response, envelopedError(result.status, "project_not_found", "project not found"));
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
              envelopedError(result.status, String(legacyBody.error ?? "episode_create_failed"), "閸撗囨肠閸掓稑缂撴径杈Е"),
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
              envelopedError(result.status, String(legacyBody.error ?? "episode_update_failed"), "閸撗囨肠閺囧瓨鏌婃径杈Е"),
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
              envelopedError(result.status, String(legacyBody.error ?? "episode_delete_failed"), "閸撗囨肠閸掔娀娅庢径杈Е"),
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
          const context = await getEpisodeContext(db, {
            episodeId,
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            capability: capabilities.generationStart,
            now: new Date(),
          });
          if (!context) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          const { episode, project } = context;
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
                projectId: project.id ?? episode.project_id,
                name: project.name ?? "",
                status: project.phase ?? null,
              },
              navigation: {
                backTarget: "project_episodes",
                projectDetailUrl: `/project/${episode.project_id}`,
                episodeWorkbenchUrl: `/project/${episode.project_id}/episodes/${episode.id}`,
              },
              defaultScopeMode: "storyboard",
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/assets")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const requestedAssetType = String(url.searchParams.get("assetType") ?? "").trim();
          const now = new Date();
          let items;
          if (requestedAssetType) {
            items = await listEpisodeAssetsFromDb(db, {
              episodeId,
              assetType: requestedAssetType,
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
              now,
            });
          } else {
            const context = await getEpisodeContext(db, {
              episodeId,
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              capability: capabilities.generationStart,
              now,
            });
            if (!context) {
              return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
            }
            const assetGroups = await Promise.all(
              (["role", "scene", "prop"] as const).map((assetType) =>
                listEpisodeAssetsFromDb(db, {
                  episodeId,
                  assetType,
                  sessionToken: authenticated.sessionToken,
                  userId: authenticated.user.id,
                  runtime: storageRuntime,
                  signedUrlExpiresInSeconds,
                  now,
                  context,
                }),
              ),
            );
            items = assetGroups.flatMap((group) => group ?? []);
          }
          if (!items) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          return writeJson(response, enveloped(200, {
            items,
            total: items.length,
          }));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 200);
          const includeDraftPayload = url.searchParams.get("includeDraftPayload") !== "0";
          const items = await listEpisodeStoryboardsFromDb(db, {
            episodeId,
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            runtime: storageRuntime,
            signedUrlExpiresInSeconds,
            now: new Date(),
            page,
            pageSize,
            includeDraftPayload,
          });
          if (!items) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          const total = Number((items as Array<unknown> & { total?: number }).total ?? items.length);
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          const hasNext = page * pageSize < total;
          return writeJson(
            response,
            enveloped(200, {
              items,
              page,
              pageSize,
              total,
              totalPages,
              hasNext,
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname === "/api/dev-proxy/storyboard-video"
        ) {
          if (runtimeEnv.NODE_ENV !== "test") {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
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
          pathname === "/api/generation-config"
        ) {
          const credit = {
            creditBalance: authenticated.user.creditBalance,
            displayCreditBalance: authenticated.user.displayCreditBalance,
            availableCredits: authenticated.user.availableCredits,
            reservedCredits: authenticated.user.reservedCredits,
            frozenCredits: authenticated.user.frozenCredits,
            creditFrozenAt: authenticated.user.creditFrozenAt,
            creditFrozenUntil: authenticated.user.creditFrozenUntil,
          };
          const batchPromptPresetCategories = await readBatchImagePromptPresetCategoriesFromDb(db);
          return writeJson(
            response,
            enveloped(200, {
              ...(await buildGenerationConfigModelCatalog(db, {
                mediaType: url.searchParams.get("mediaType"),
              })),
              batchPromptPresetCategories,
              creditBalance: credit.creditBalance,
              displayCreditBalance: credit.displayCreditBalance,
              availableCredits: credit.availableCredits,
              reservedCredits: credit.reservedCredits,
              frozenCredits: credit.frozenCredits,
              creditFrozenAt: credit.creditFrozenAt,
              creditFrozenUntil: credit.creditFrozenUntil,
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname === "/api/batch-image-model-options"
        ) {
          return writeJson(response, enveloped(200, await buildBatchImageModelOptions(db)));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/batch-image-model-options")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const [context, modelOptions] = await Promise.all([
            getEpisodeContext(db, {
              episodeId,
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              capability: capabilities.generationStart,
              now: new Date(),
            }),
            buildBatchImageModelOptions(db),
          ]);
          if (!context) {
            return writeJson(response, envelopedError(404, "resource_not_found", "\u5267\u96c6\u4e0d\u5b58\u5728\u6216\u5df2\u88ab\u5220\u9664"));
          }
          return writeJson(response, enveloped(200, modelOptions));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/generation-config")
        ) {
          const episodeId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const [context, modelCatalog, batchPromptPresetCategories] = await Promise.all([
            getEpisodeContext(db, {
              episodeId,
              sessionToken: authenticated.sessionToken,
              userId: authenticated.user.id,
              capability: capabilities.generationStart,
              now: new Date(),
            }),
            buildGenerationConfigModelCatalog(db, {
              mediaType: url.searchParams.get("mediaType"),
            }),
            readBatchImagePromptPresetCategoriesFromDb(db),
          ]);
          if (!context) {
            return writeJson(response, envelopedError(404, "resource_not_found", "\u5267\u96c6\u4e0d\u5b58\u5728\u6216\u5df2\u88ab\u5220\u9664"));
          }
          return writeJson(
            response,
            enveloped(200, {
              ...modelCatalog,
              batchPromptPresetCategories,
              uploadLimits: episodeUploadLimits,
              creditBalance: context.creditBalance,
              displayCreditBalance: context.displayCreditBalance,
              availableCredits: context.availableCredits,
              reservedCredits: context.reservedCredits,
              frozenCredits: context.frozenCredits,
              creditFrozenAt: context.creditFrozenAt,
              creditFrozenUntil: context.creditFrozenUntil,
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
            return writeJson(response, envelopedError(400, "idempotency_key_required", "缂傚搫鐨?Idempotency-Key"));
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
              return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
            }
            return writeJson(response, enveloped(result.status, result.body));
          } catch (error) {
            if (error instanceof IdempotencyConflictError) {
              return writeJson(response, envelopedError(409, error.code, "request conflict"));
            }
            if (error instanceof IdempotencyProcessingError) {
              return writeJson(response, envelopedError(202, error.code, "request is still processing"));
            }
            if (error instanceof InsufficientCreditsError) {
              return writeJson(response, envelopedError(402, "insufficient_credits", "积分余额不足，请联系管理员分配积分。"));
            }
            if (error instanceof GenerationMembershipRequiredError) {
              return writeJson(response, envelopedError(403, error.code, error.message));
            }
            if (error instanceof GenerationModelRequestValidationError || error instanceof GenerationRequestValidationError) {
              return writeJson(response, envelopedError(400, error.code, error.message));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "uploaded file cannot be bound to this target"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "media file is not valid for this operation"));
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
              envelopedError(400, "invalid_asset_conversation_target", "invalid asset conversation target"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const includeMessages = url.searchParams.get("includeMessages") !== "0";
          const result = await getEpisodeAssetConversationRoute(db, {
            episodeId,
            assetId,
            mediaMode,
            includeMessages,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
          const rawStoryboardId = decodeURIComponent(parts.at(5) ?? "");
          const storyboardId = isUuid(episodeId)
            ? await resolveEpisodeStoryboardConversationId(db, episodeId, rawStoryboardId)
            : null;
          if (!isUuid(episodeId) || !storyboardId) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "invalid storyboard conversation target"),
            );
          }
          const mediaMode: AssetConversationMediaMode =
            String(url.searchParams.get("mediaMode") ?? "").trim().toLowerCase() === "video"
              ? "video"
              : "image";
          const includeMessages = url.searchParams.get("includeMessages") !== "0";
          const result = await getEpisodeAssetConversationRoute(db, {
            episodeId,
            assetId: storyboardId,
            mediaMode,
            includeMessages,
            authenticated,
            now: new Date(),
          });
          if (!result) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
              envelopedError(400, "invalid_asset_conversation_target", "invalid asset conversation target"),
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
          const rawStoryboardId = decodeURIComponent(parts.at(5) ?? "");
          const storyboardId = isUuid(episodeId)
            ? await resolveEpisodeStoryboardConversationId(db, episodeId, rawStoryboardId)
            : null;
          if (!isUuid(episodeId) || !storyboardId) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "invalid storyboard conversation target"),
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
              envelopedError(400, "invalid_asset_conversation_target", "invalid asset conversation target"),
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
            return writeJson(response, envelopedError(404, "resource_not_found", "conversation message not found"));
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
          const rawStoryboardId = decodeURIComponent(parts.at(5) ?? "");
          const taskId = decodeURIComponent(parts.at(8) ?? "");
          const storyboardId = isUuid(episodeId)
            ? await resolveEpisodeStoryboardConversationId(db, episodeId, rawStoryboardId)
            : null;
          if (!isUuid(episodeId) || !storyboardId || !taskId.trim()) {
            return writeJson(
              response,
              envelopedError(400, "invalid_storyboard_conversation_target", "invalid storyboard conversation target"),
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          if ("error" in result) {
            const status = result.error === "file_in_use" ? 409 : 400;
            return writeJson(
              response,
              envelopedError(status, result.error, "file is still in use or deletion failed", "details" in result ? result.details : undefined),
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          if ("error" in result) {
            return writeJson(response, envelopedError(400, result.error, "media file is not valid for this operation"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          const targetType = url.searchParams.get("targetType");
          const targetId = url.searchParams.get("targetId");
          const countRow = await queryOne<{ total: number | string }>(
            db,
            `
              SELECT COUNT(*)::int AS total
              FROM tasks
              WHERE organization_id = $1
                AND project_id = $2
                AND input_snapshot_json->>'episodeId' = $3
                AND task_type IN ('episode_generate_image', 'episode_generate_video')
                AND ($4::text IS NULL OR input_snapshot_json->>'targetType' = $4)
                AND ($5::text IS NULL OR input_snapshot_json->>'targetId' = $5)
            `,
            [
              context.actor.organizationId,
              context.project.id,
              episodeId,
              targetType,
              targetId,
            ],
          );
          const total = Number(countRow?.total ?? 0);
          const offset = Math.max(0, (page - 1) * pageSize);
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
              LIMIT $6
              OFFSET $7
            `,
            [
              context.actor.organizationId,
              context.project.id,
              episodeId,
              targetType,
              targetId,
              pageSize,
              offset,
            ],
          );
          const mappedItems = await Promise.all(
            taskRows.rows.map((row) =>
              mapGenerationTaskResponse(db, {
                taskId: row.id,
                sessionToken: authenticated.sessionToken,
                runtime: storageRuntime,
                signedUrlExpiresInSeconds,
                now: new Date(),
              }),
            ),
          );
          const items = mappedItems.filter(Boolean);
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          const hasNext = page * pageSize < total;
          return writeJson(
            response,
            enveloped(200, {
              items,
              page,
              pageSize,
              total,
              totalPages,
              hasNext,
            }),
          );
        }

        if (
          request.method === "POST" &&
          pathname === "/api/generation-tasks/batch"
        ) {
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const rawTaskIds = Array.isArray(body.taskIds) ? body.taskIds : [];
          const taskIds = Array.from(new Set(
            rawTaskIds
              .map((taskId) => String(taskId ?? "").trim())
              .filter((taskId) => isUuid(taskId)),
          )).slice(0, 200);
          if (!taskIds.length) {
            return writeJson(response, enveloped(200, { items: [] }));
          }
          const now = new Date();
          const items = [];
          for (const taskId of taskIds) {
            let task;
            try {
              task = await readGenerationTaskResponseForSession(db, {
                taskId,
                sessionToken: authenticated.sessionToken,
                userId: authenticated.user.id,
                runtime: storageRuntime,
                runtimeEnv,
                fetchImpl: options.fetchImpl,
                signedUrlExpiresInSeconds,
                now,
              });
            } catch (error) {
              console.error(`[generation-task-batch] task=${taskId} refresh failed`, error);
              try {
                task = await mapGenerationTaskResponse(db, {
                  taskId,
                  sessionToken: authenticated.sessionToken,
                  runtime: storageRuntime,
                  signedUrlExpiresInSeconds,
                  now,
                });
              } catch (fallbackError) {
                console.error(`[generation-task-batch] task=${taskId} snapshot fallback failed`, fallbackError);
                task = null;
              }
            }
            if (task) {
              items.push(task);
            }
          }
          return writeJson(response, enveloped(200, { items }));
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/generation-tasks/")
        ) {
          const taskId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const task = await readGenerationTaskResponseForSession(db, {
            taskId,
            sessionToken: authenticated.sessionToken,
            userId: authenticated.user.id,
            runtime: storageRuntime,
            runtimeEnv,
            fetchImpl: options.fetchImpl,
            signedUrlExpiresInSeconds,
            now: new Date(),
          });
          if (!task) {
            return writeJson(response, envelopedError(404, "resource_not_found", "resource not found"));
          }
          return writeJson(response, enveloped(200, task));
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
              envelopedError(400, "invalid_generation_draft_target", "invalid generation draft target"),
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
              envelopedError(404, "resource_not_found", "resource not found"),
            );
          }
          return writeJson(response, enveloped(200, result));
        }

      }

      if (request.method === "GET" && pathname === "/api/creator/library/assets") {
        const scope = url.searchParams.get("scope")?.trim() || "official";
        if (scope === "official") {
          return writeJson(
            response,
            await creatorApplication.listReusableAssetLibrary({
              query: {
                scope,
                category: url.searchParams.get("category"),
                folder: url.searchParams.get("folder"),
                q: url.searchParams.get("q"),
                query: url.searchParams.get("query"),
              },
              now: new Date(),
            }),
          );
        }
      }

      if (pathname.startsWith("/api/creator/")) {
        const authenticated = await findAuthenticatedUser(
          db,
          request.headers.cookie,
          new Date(),
          authSessionCache,
        );
        if (!authenticated) {
          return writeJson(response, {
            status: 401,
            body: { error: "unauthenticated" },
          });
        }
        const currentWorkspaceId = await resolvePersonalProjectWorkspaceForSession(db, authenticated);
        const creatorApplication = createCreatorApplicationForWorkspace(currentWorkspaceId);
        const teamCreatorApplication = createCreatorApplicationForWorkspace(currentWorkspaceId);

        if (request.method === "GET" && pathname === "/api/creator/team/overview") {
          return writeJson(
            response,
            await teamCreatorApplication.getTeamOverview({
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
            await teamCreatorApplication.listTeamMembers({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/team/assignable-resources") {
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          if (actor.teamMember || !actor.capabilities.includes(capabilities.teamMemberManageAll)) {
            return writeJson(response, envelopedError(403, "team_permission_denied", "team permission denied"));
          }

          const resourceType = readString(url.searchParams.get("type"));
          if (resourceType !== "project" && resourceType !== "script" && resourceType !== "canvas") {
            return writeJson(response, envelopedError(400, "resource_type_invalid", "resource type invalid"));
          }
          const page = Math.max(1, Math.floor(Number(url.searchParams.get("page") ?? 1)) || 1);
          const pageSize = Math.min(10, Math.max(1, Math.floor(Number(url.searchParams.get("pageSize") ?? 10)) || 10));

          if (resourceType === "project") {
            const projectResult = await creatorApplication.listProjects({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now,
              page,
              pageSize,
              keyword: url.searchParams.get("keyword"),
            });
            if (projectResult.status !== 200) {
              return writeJson(response, projectResult);
            }
            const body = projectResult.body as Record<string, unknown>;
            return writeJson(response, {
              status: 200,
              body: {
                resources: Array.isArray(body.projects) ? body.projects : [],
                pagination: body.pagination ?? {
                  page,
                  pageSize,
                  total: 0,
                  totalPages: 1,
                },
              },
            });
          }

          if (resourceType === "script") {
            const scriptResult = await creatorApplication.listWorkspaceScripts({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now,
            });
            if (scriptResult.status !== 200) {
              return writeJson(response, scriptResult);
            }
            const scripts = Array.isArray((scriptResult.body as Record<string, unknown>).scripts)
              ? (scriptResult.body as Record<string, unknown>).scripts as unknown[]
              : [];
            const totalPages = Math.max(1, Math.ceil(scripts.length / pageSize));
            const normalizedPage = Math.min(page, totalPages);
            const pageItems = scripts.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize);
            return writeJson(response, {
              status: 200,
              body: {
                resources: pageItems,
                pagination: {
                  page: normalizedPage,
                  pageSize,
                  total: scripts.length,
                  totalPages,
                },
              },
            });
          }

          const canvasProjects = await listCanvasProjects(db, {
            userId: authenticated.user.id,
          });
          const totalPages = Math.max(1, Math.ceil(canvasProjects.length / pageSize));
          const normalizedPage = Math.min(page, totalPages);
          const pageItems = canvasProjects.slice((normalizedPage - 1) * pageSize, normalizedPage * pageSize);
          return writeJson(response, {
            status: 200,
            body: {
              resources: pageItems.map(serializeCanvasProject),
              pagination: {
                page: normalizedPage,
                pageSize,
                total: canvasProjects.length,
                totalPages,
              },
            },
          });
        }

        if (request.method === "GET" && pathname === "/api/creator/credits/ledger") {
          if (authenticated.user.actorType === "team_member" && authenticated.user.teamMember?.id) {
            return writeJson(response, {
              status: 200,
              body: await listSimpleTeamMemberCreditLedger(db, {
                userId: authenticated.user.id,
                memberId: authenticated.user.teamMember.id,
                page: Number(url.searchParams.get("page") ?? 1),
                pageSize: Number(url.searchParams.get("pageSize") ?? 50),
              }),
            });
          }
          const adminUsers = createAdminUserService({ db });
          const page = Number(url.searchParams.get("page") ?? 1);
          const pageSize = Number(url.searchParams.get("pageSize") ?? 50);
          const ledgerPage = Math.max(1, page);
          const ledgerPageSize = Math.min(100, Math.max(1, pageSize));
          const baseLedger = await adminUsers.listCreatorUserCreditLedger({
            userId: authenticated.user.id,
            page: ledgerPage,
            pageSize: ledgerPageSize,
          });
          if ("status" in baseLedger && Number(baseLedger.status) >= 400) {
            return writeJson(response, baseLedger);
          }
          return writeJson(response, {
            status: 200,
            body: await listCreatorAdminCreditLedger(db, {
              userId: authenticated.user.id,
              page: ledgerPage,
              pageSize: ledgerPageSize,
              baseLedger,
            }),
          });
        }

        if (request.method === "POST" && pathname === "/api/creator/team/members") {
          const body = (await readJsonBody(request)) as {
            teamAccount?: string | null;
            memberAccount?: string | null;
            displayName?: string | null;
            memberName?: string | null;
            password?: string | null;
            memberGroupId?: string | null;
            projectIds?: string[] | null;
            scriptIds?: string[] | null;
            canvasIds?: string[] | null;
            initialCredits?: number | null;
            memberCredits?: number | null;
            remark?: string | null;
          };
          return writeJson(
            response,
            await teamCreatorApplication.createTeamMember({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now: new Date(),
            }),
          );
        }

        const teamMemberMatch = pathname.match(/^\/api\/creator\/team\/members\/([^/]+)$/);
        if (request.method === "PATCH" && teamMemberMatch) {
          const body = (await readJsonBody(request)) as {
            displayName?: string | null;
            memberName?: string | null;
            projectIds?: string[] | null;
            scriptIds?: string[] | null;
            canvasIds?: string[] | null;
            newPassword?: string | null;
            status?: "active" | "disabled" | "deleted" | null;
            creditAdjustmentType?: "increase" | "deduct" | null;
            creditAmount?: number | null;
            remark?: string | null;
          };
          const memberId = decodeURIComponent(teamMemberMatch[1] ?? "");
          const blocksMember = body.status === "disabled" || body.status === "deleted";
          if (blocksMember || body.newPassword) {
            await authSessionCache?.blockMember(memberId, true);
          }
          const result = await teamCreatorApplication.updateTeamMember({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              memberId,
              body,
              now: new Date(),
            });
          if (result.status >= 200 && result.status < 300) {
            if (body.status === "active") {
              await authSessionCache?.blockMember(memberId, false);
            } else if (body.newPassword && !blocksMember) {
              await authSessionCache?.blockMember(memberId, false);
            } else if (blocksMember) {
              await authSessionCache?.blockMember(memberId, true);
            }
            if (blocksMember || body.newPassword) {
              await authSessionCache?.invalidateMember(memberId);
            }
          } else if (blocksMember || body.newPassword) {
            await authSessionCache?.blockMember(memberId, false);
          }
          return writeJson(response, result);
        }

        if (request.method === "GET" && pathname === "/api/creator/state") {
          const stateResponse = await creatorApplication.getState({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
          });
          const credit = {
            creditBalance: authenticated.user.creditBalance,
            displayCreditBalance: authenticated.user.displayCreditBalance,
            availableCredits: authenticated.user.availableCredits,
            reservedCredits: authenticated.user.reservedCredits,
            frozenCredits: authenticated.user.frozenCredits,
            creditFrozenAt: authenticated.user.creditFrozenAt,
            creditFrozenUntil: authenticated.user.creditFrozenUntil,
          };
          return writeJson(
            response,
            {
              ...stateResponse,
              body: {
                ...(stateResponse.body && typeof stateResponse.body === "object" ? stateResponse.body : {}),
                creditBalance: credit.creditBalance,
                displayCreditBalance: credit.displayCreditBalance,
                availableCredits: credit.availableCredits,
                reservedCredits: credit.reservedCredits,
                frozenCredits: credit.frozenCredits,
                creditFrozenAt: credit.creditFrozenAt,
                creditFrozenUntil: credit.creditFrozenUntil,
              },
            },
          );
        }

        if (request.method === "POST" && pathname === "/api/creator/episode-events") {
          const body = (await readJsonBody(request)) as Record<string, unknown>;
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
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: url.searchParams.get("pageSize"),
              keyword: url.searchParams.get("keyword"),
            }),
          );
        }

        const projectCanvasMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/canvas$/);
        if (projectCanvasMatch) {
          const projectId = decodeURIComponent(projectCanvasMatch[1] ?? "");
          if (request.method !== "GET" && request.method !== "PUT") {
            return writeJson(response, envelopedError(405, "method_not_allowed", "method not allowed"));
          }
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            projectId,
            capability: request.method === "GET" ? capabilities.projectView : capabilities.projectEdit,
            now,
          });
          if (!actor.workspaceId) {
            throw new AuthorizationError("workspace_not_found");
          }
          try {
            if (request.method === "GET") {
              return writeJson(response, enveloped(200, {
                canvas: await getOrCreateProjectCanvas(db, {
                  organizationId: actor.organizationId,
                  workspaceId: actor.workspaceId,
                  projectId,
                  userId: authenticated.user.id,
                  now,
                }),
              }));
            }
            const body = (await readJsonBody(request)) as {
              clientRevision?: unknown;
              serverRevision?: unknown;
              document?: unknown;
              events?: Array<Record<string, unknown>>;
            };
            return writeJson(response, enveloped(200, {
              canvas: await saveProjectCanvas(db, {
                organizationId: actor.organizationId,
                workspaceId: actor.workspaceId,
                projectId,
                userId: authenticated.user.id,
                clientRevision: Number(body.clientRevision ?? body.serverRevision ?? 0),
                document: body.document,
                events: Array.isArray(body.events) ? body.events : [],
                now,
              }),
            }));
          } catch (error) {
            if (error instanceof CanvasConflictError) {
              return writeJson(response, envelopedError(409, "canvas_revision_conflict", "canvas revision conflict", {
                serverRevision: error.serverRevision,
                serverDocument: error.serverDocument as Record<string, unknown>,
              }));
            }
            if (error instanceof CanvasDocumentError || error instanceof CanvasValidationError) {
              return writeJson(response, envelopedError(400, error.code, error.message));
            }
            throw error;
          }
        }

        if (pathname === "/api/creator/canvas-projects") {
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: request.method === "POST" ? undefined : capabilities.workspaceRead,
            now: new Date(),
          });
          if (!actor.workspaceId) {
            throw new AuthorizationError("workspace_not_found");
          }
          const visibleProjects = await listCanvasProjects(db, {
            userId: authenticated.user.id,
            teamMemberId: actor.teamMember?.id,
          });

          if (request.method === "GET") {
            return writeJson(response, enveloped(200, {
              projects: visibleProjects.map(serializeCanvasProject),
            }));
          }

          if (request.method === "POST") {
            if (actor.teamMember) {
              return writeJson(response, envelopedError(403, "team_member_canvas_create_forbidden", "team member cannot create canvas projects"));
            }
            assertCapability(actor, capabilities.projectCreate);
            const body = (await readJsonBody(request)) as { title?: unknown; status?: unknown };
            const nextIndex = visibleProjects.length + 1;
            const project = await createCanvasProjectRecord(db, {
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId,
              userId: authenticated.user.id,
              title: normalizeCanvasProjectTitle(body.title, `画布项目 ${nextIndex}`),
              status: String(body.status ?? "草稿").trim() || "草稿",
              now: new Date(),
            });
            return writeJson(response, enveloped(201, {
              project: serializeCanvasProject(project),
            }));
          }
        }

        const standaloneCanvasMatch = pathname.match(/^\/api\/creator\/canvas-projects\/([^/]+)\/canvas$/);
        if (standaloneCanvasMatch) {
          if (request.method !== "GET" && request.method !== "PUT") {
            return writeJson(response, envelopedError(405, "method_not_allowed", "method not allowed"));
          }
          const canvasProjectId = decodeURIComponent(standaloneCanvasMatch[1] ?? "");
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: request.method === "PUT" ? capabilities.workspaceRead : capabilities.workspaceRead,
            now: new Date(),
          });
          if (!actor.workspaceId) {
            throw new AuthorizationError("workspace_not_found");
          }
          const project = await findCanvasProjectRecord(db, {
            userId: authenticated.user.id,
            projectId: canvasProjectId,
            teamMemberId: actor.teamMember?.id,
          });
          if (!project) {
            return writeJson(response, envelopedError(404, "canvas_project_not_found", "canvas project not found"));
          }
          const now = new Date();
          try {
            if (request.method === "GET") {
              return writeJson(response, enveloped(200, {
                canvas: await findCanvasByCanvasProjectId(db, {
                  organizationId: project.organizationId,
                  workspaceId: project.workspaceId,
                  canvasProjectId,
                }),
              }));
            }
            const body = (await readJsonBody(request)) as {
              clientRevision?: unknown;
              serverRevision?: unknown;
              document?: unknown;
              events?: Array<Record<string, unknown>>;
            };
            return writeJson(response, enveloped(200, {
              canvas: await saveCanvasByCanvasProjectId(db, {
                organizationId: project.organizationId,
                workspaceId: project.workspaceId,
                canvasProjectId,
                userId: authenticated.user.id,
                clientRevision: Number(body.clientRevision ?? body.serverRevision ?? 0),
                document: body.document,
                events: Array.isArray(body.events) ? body.events : [],
                now,
              }),
            }));
          } catch (error) {
            if (error instanceof CanvasConflictError) {
              return writeJson(response, envelopedError(409, "canvas_revision_conflict", "canvas revision conflict", {
                serverRevision: error.serverRevision,
                serverDocument: error.serverDocument as Record<string, unknown>,
              }));
            }
            if (error instanceof CanvasDocumentError || error instanceof CanvasValidationError) {
              return writeJson(response, envelopedError(400, error.code, error.message));
            }
            throw error;
          }
        }

        const canvasProjectMatch = pathname.match(/^\/api\/creator\/canvas-projects\/([^/]+)$/);
        if (canvasProjectMatch) {
          const projectId = decodeURIComponent(canvasProjectMatch[1] ?? "");
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            capability: request.method === "PATCH" || request.method === "DELETE"
              ? capabilities.projectEdit
              : capabilities.projectView,
            now: new Date(),
          });
          if (!actor.workspaceId) {
            throw new AuthorizationError("workspace_not_found");
          }
          const project = await findCanvasProjectRecord(db, {
            userId: authenticated.user.id,
            projectId,
            teamMemberId: actor.teamMember?.id,
          });

          if (!project) {
            return writeJson(response, envelopedError(404, "canvas_project_not_found", "canvas project not found"));
          }

          if (request.method === "PATCH") {
            if (actor.teamMember) {
              return writeJson(response, envelopedError(403, "team_member_canvas_manage_forbidden", "team member cannot manage canvas projects"));
            }
            const body = (await readJsonBody(request)) as { title?: unknown; status?: unknown };
            const updated = await updateCanvasProjectRecord(db, {
              userId: authenticated.user.id,
              projectId: project.id,
              teamMemberId: actor.teamMember?.id,
              title: Object.prototype.hasOwnProperty.call(body, "title")
                ? normalizeCanvasProjectTitle(body.title, project.title)
                : undefined,
              status: Object.prototype.hasOwnProperty.call(body, "status")
                ? (String(body.status ?? project.status).trim() || project.status)
                : undefined,
              now: new Date(),
            });
            return writeJson(response, enveloped(200, {
              project: serializeCanvasProject(updated ?? project),
            }));
          }

          if (request.method === "DELETE") {
            if (actor.teamMember) {
              return writeJson(response, envelopedError(403, "team_member_canvas_manage_forbidden", "team member cannot manage canvas projects"));
            }
            await deleteCanvasProjectRecord(db, {
              userId: authenticated.user.id,
              projectId: project.id,
              now: new Date(),
            });
            return writeJson(response, enveloped(200, {
              deletedProjectId: project.id,
            }));
          }
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

        const scriptReaderSectionsMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/script-reader-sections(?:\/([^/]+))?$/);
        if (scriptReaderSectionsMatch) {
          const projectId = decodeURIComponent(scriptReaderSectionsMatch[1] ?? "");
          const sectionId = scriptReaderSectionsMatch[2]
            ? decodeURIComponent(scriptReaderSectionsMatch[2])
            : "";
          if (!isUuid(projectId)) {
            return writeJson(response, envelopedError(400, "invalid_project_id", "project id is invalid"));
          }

          if (request.method === "GET" && !sectionId) {
            return writeJson(
              response,
              await creatorApplication.listScriptReaderSections({
                user: {
                  id: authenticated.user.id,
                  sessionToken: authenticated.sessionToken,
                },
                projectId,
                scriptId: url.searchParams.get("scriptId"),
                now: new Date(),
              }),
            );
          }

          if (request.method === "POST" && !sectionId) {
            const body = (await readJsonBody(request)) as {
              title?: string | null;
              body?: string | null;
              scriptInputText?: string | null;
              scriptId?: string | null;
              createNewScript?: boolean | null;
            };
            return writeJson(
              response,
              await creatorApplication.createScriptReaderSection({
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

          if (!isUuid(sectionId)) {
            return writeJson(response, envelopedError(400, "invalid_section_id", "section id is invalid"));
          }

          if (request.method === "PATCH") {
            const body = (await readJsonBody(request)) as {
              title?: string | null;
              body?: string | null;
              status?: "draft" | "ready" | "archived" | null;
            };
            return writeJson(
              response,
              await creatorApplication.updateScriptReaderSection({
                user: {
                  id: authenticated.user.id,
                  sessionToken: authenticated.sessionToken,
                },
                projectId,
                sectionId,
                body,
                now: new Date(),
              }),
            );
          }

          if (request.method === "DELETE") {
            return writeJson(
              response,
              await creatorApplication.deleteScriptReaderSection({
                user: {
                  id: authenticated.user.id,
                  sessionToken: authenticated.sessionToken,
                },
                projectId,
                sectionId,
                now: new Date(),
              }),
            );
          }
        }

        const scriptCardMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/scripts\/([^/]+)$/);
        if (scriptCardMatch) {
          const projectId = decodeURIComponent(scriptCardMatch[1] ?? "");
          const scriptId = decodeURIComponent(scriptCardMatch[2] ?? "");
          if (!isUuid(projectId)) {
            return writeJson(response, envelopedError(400, "invalid_project_id", "project id is invalid"));
          }
          if (!isUuid(scriptId)) {
            return writeJson(response, envelopedError(400, "invalid_script_id", "script id is invalid"));
          }

          if (request.method === "PATCH") {
            const body = (await readJsonBody(request)) as {
              title?: string | null;
              coverImageUrl?: string | null;
              uploadSessionId?: string | null;
              storageObjectId?: string | null;
            };
            return writeJson(
              response,
              await creatorApplication.updateScriptCard({
                user: {
                  id: authenticated.user.id,
                  sessionToken: authenticated.sessionToken,
                },
                projectId,
                scriptId,
                body,
                now: new Date(),
              }),
            );
          }

          if (request.method === "DELETE") {
            return writeJson(
              response,
              await creatorApplication.deleteScriptCard({
                user: {
                  id: authenticated.user.id,
                  sessionToken: authenticated.sessionToken,
                },
                projectId,
                scriptId,
                now: new Date(),
              }),
            );
          }
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

        const aiStoryboardPreviewCommitMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/ai-storyboard-preview\/commit$/);
        if (request.method === "POST" && aiStoryboardPreviewCommitMatch) {
          const projectId = decodeURIComponent(aiStoryboardPreviewCommitMatch[1]);
          if (!isUuid(projectId)) {
            return writeJson(response, envelopedError(400, "invalid_project_id", "project id is invalid"));
          }
          const body = (await readJsonBody(request)) as {
            episodeTitle?: string | null;
            commitPayload?: {
              scriptText?: string | null;
              scenes?: Array<Record<string, unknown>> | null;
              characters?: Array<Record<string, unknown>> | null;
              props?: Array<Record<string, unknown>> | null;
              storyboards?: Array<Record<string, unknown>> | null;
            } | null;
          };
          return writeJson(
            response,
            await creatorApplication.commitAiStoryboardPreview({
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

        if (request.method === "POST" && pathname === "/api/creator/scripts/ai-script-analysis") {
          await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now: new Date(),
          });
          const body = (await readJsonBody(request)) as {
            scriptText?: string | null;
            skipScriptStage?: boolean | null;
            packages?: {
              genrePackageId?: string | null;
              emotionPackageId?: string | null;
            } | null;
          };
          const scriptText = String(body.scriptText ?? "").trim();
          const genrePackageId = String(body.packages?.genrePackageId ?? "");
          const emotionPackageId = String(body.packages?.emotionPackageId ?? "");
          if (!scriptText) {
            return writeJson(response, envelopedError(400, "script_text_required", "script text is required"));
          }
          if (!isUuid(genrePackageId) || !isUuid(emotionPackageId)) {
            return writeJson(response, envelopedError(400, "storyboard_prompt_package_required", "genre and emotion packages are required"));
          }

          await ensureDefaultStoryboardPromptData(db);
          const [genrePackage, emotionPackage, tabooPackages] = await Promise.all([
            findEnabledStoryboardPromptPackageForPreview(db, genrePackageId, "genre"),
            findEnabledStoryboardPromptPackageForPreview(db, emotionPackageId, "emotion"),
            findDefaultTabooStoryboardPromptPackagesForPreview(db),
          ]);
          if (!genrePackage || !emotionPackage) {
            return writeJson(response, envelopedError(404, "storyboard_prompt_package_not_found", "selected prompt package not found"));
          }
          const genrePrompt = formatStoryboardPromptPackageContents([genrePackage]);
          const emotionPrompt = formatStoryboardPromptPackageContents([emotionPackage]);
          const tabooPrompt = formatStoryboardPromptPackageContents(tabooPackages);

          const analysisService = createAiScriptAnalysisService({ gateway: aiStoryboardTextChatGateway });
          response.statusCode = 200;
          response.setHeader("content-type", "text/event-stream; charset=utf-8");
          response.setHeader("cache-control", "no-cache, no-transform");
          response.setHeader("connection", "keep-alive");
          response.flushHeaders?.();
          const stopHeartbeat = startSseHeartbeat(response, 15_000, { dataOnly: true });
          const abortController = createRequestAbortController(request, response);
          try {
            for await (const event of analysisService.generateScriptStream({
              projectId: null,
              createdByUserId: authenticated.user.id,
              scriptText,
              packages: {
                genrePrompt,
                emotionPrompt,
                tabooPrompt,
              },
              signal: abortController.signal,
            })) {
              if (abortController.signal.aborted) {
                break;
              }
              writeSseData(response, event);
            }
            stopHeartbeat();
            abortController.cleanup();
            if (!response.destroyed && !response.writableEnded) {
              response.end();
            }
          } catch (error) {
            stopHeartbeat();
            abortController.cleanup();
            if (!abortController.signal.aborted && !isAbortError(error) && !response.destroyed && !response.writableEnded) {
              writeSseData(response, {
                type: "error",
                error: error instanceof Error ? error.message : "ai_script_analysis_failed",
              });
              response.end();
            }
          }
          return;
        }

        const aiStoryboardPreviewMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/ai-storyboard-preview$/);
        const aiScriptAnalysisMatch = pathname.match(/^\/api\/creator\/projects\/([^/]+)\/ai-script-analysis$/);
        if (request.method === "POST" && aiScriptAnalysisMatch) {
          const projectId = decodeURIComponent(aiScriptAnalysisMatch[1]);
          if (!isUuid(projectId)) {
            return writeJson(response, envelopedError(400, "invalid_project_id", "project id is invalid"));
          }
          await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            projectId,
            now: new Date(),
          });
          const body = (await readJsonBody(request)) as {
            scriptText?: string | null;
            skipScriptStage?: boolean | null;
            packages?: {
              genrePackageId?: string | null;
              emotionPackageId?: string | null;
            } | null;
          };
          const scriptText = String(body.scriptText ?? "").trim();
          const genrePackageId = String(body.packages?.genrePackageId ?? "");
          const emotionPackageId = String(body.packages?.emotionPackageId ?? "");
          if (!scriptText) {
            return writeJson(response, envelopedError(400, "script_text_required", "script text is required"));
          }
          if (!isUuid(genrePackageId) || !isUuid(emotionPackageId)) {
            return writeJson(response, envelopedError(400, "storyboard_prompt_package_required", "genre and emotion packages are required"));
          }

          await ensureDefaultStoryboardPromptData(db);
          const [genrePackage, emotionPackage, tabooPackages] = await Promise.all([
            findEnabledStoryboardPromptPackageForPreview(db, genrePackageId, "genre"),
            findEnabledStoryboardPromptPackageForPreview(db, emotionPackageId, "emotion"),
            findDefaultTabooStoryboardPromptPackagesForPreview(db),
          ]);
          if (!genrePackage || !emotionPackage) {
            return writeJson(response, envelopedError(404, "storyboard_prompt_package_not_found", "selected prompt package not found"));
          }
          const genrePrompt = formatStoryboardPromptPackageContents([genrePackage]);
          const emotionPrompt = formatStoryboardPromptPackageContents([emotionPackage]);
          const tabooPrompt = formatStoryboardPromptPackageContents(tabooPackages);

          const analysisService = createAiScriptAnalysisService({ gateway: aiStoryboardTextChatGateway });
          response.statusCode = 200;
          response.setHeader("content-type", "text/event-stream; charset=utf-8");
          response.setHeader("cache-control", "no-cache, no-transform");
          response.setHeader("connection", "keep-alive");
          response.flushHeaders?.();
          const stopHeartbeat = startSseHeartbeat(response, 15_000, { dataOnly: true });
          const abortController = createRequestAbortController(request, response);
          try {
            for await (const event of analysisService.generateScriptStream({
              projectId,
              createdByUserId: authenticated.user.id,
              scriptText,
              packages: {
                genrePrompt,
                emotionPrompt,
                tabooPrompt,
              },
              signal: abortController.signal,
            })) {
              if (abortController.signal.aborted) {
                break;
              }
              writeSseData(response, event);
            }
            stopHeartbeat();
            abortController.cleanup();
            if (!response.destroyed && !response.writableEnded) {
              response.end();
            }
          } catch (error) {
            stopHeartbeat();
            abortController.cleanup();
            if (!abortController.signal.aborted && !isAbortError(error) && !response.destroyed && !response.writableEnded) {
              writeSseData(response, {
                type: "error",
                error: translateProviderErrorMessage(error instanceof Error ? error.message : "剧本分析失败，请稍后重试。"),
              });
              response.end();
            }
          }
          return;
        }

        if (request.method === "POST" && aiStoryboardPreviewMatch) {
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const projectId = decodeURIComponent(aiStoryboardPreviewMatch[1]);
          if (!isUuid(projectId)) {
            return writeJson(response, envelopedError(400, "invalid_project_id", "project id is invalid"));
          }
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            projectId,
            now: new Date(),
          });
          const body = (await readJsonBody(request)) as {
            scriptText?: string | null;
            packages?: {
              genrePackageId?: string | null;
              emotionPackageId?: string | null;
            } | null;
          };
          const scriptText = String(body.scriptText ?? "").trim();
          const genrePackageId = String(body.packages?.genrePackageId ?? "");
          const emotionPackageId = String(body.packages?.emotionPackageId ?? "");
          if (!scriptText) {
            return writeJson(response, envelopedError(400, "script_text_required", "script text is required"));
          }
          if (!isUuid(genrePackageId) || !isUuid(emotionPackageId)) {
            return writeJson(response, envelopedError(400, "storyboard_prompt_package_required", "genre and emotion packages are required"));
          }

          await Promise.all([
            ensureDefaultStoryboardPromptData(db),
            ensureDefaultScenePromptTemplates(db),
            ensureDefaultCharacterPromptTemplates(db),
            ensureDefaultPropPromptTemplates(db),
            ensureDefaultShotPromptTemplates(db),
          ]);
          const [
            genrePackage,
            emotionPackage,
            tabooPackages,
            sceneTemplate,
            characterTemplate,
            propTemplate,
            shotTemplate,
          ] = await Promise.all([
            findEnabledStoryboardPromptPackageForPreview(db, genrePackageId, "genre"),
            findEnabledStoryboardPromptPackageForPreview(db, emotionPackageId, "emotion"),
            findDefaultTabooStoryboardPromptPackagesForPreview(db),
            findDefaultScenePromptTemplateForPreview(db),
            findDefaultCharacterPromptTemplateForPreview(db),
            findDefaultPropPromptTemplateForPreview(db),
            findDefaultShotPromptTemplateForPreview(db),
          ]);
          if (!genrePackage || !emotionPackage) {
            return writeJson(response, envelopedError(404, "storyboard_prompt_package_not_found", "selected prompt package not found"));
          }
          if (!sceneTemplate || !characterTemplate || !propTemplate || !shotTemplate) {
            return writeJson(response, envelopedError(500, "ai_storyboard_default_prompt_missing", "default scene, character, prop or shot prompt template is missing"));
          }
          const genrePrompt = formatStoryboardPromptPackageContents([genrePackage]);
          const emotionPrompt = formatStoryboardPromptPackageContents([emotionPackage]);
          const tabooPrompt = formatStoryboardPromptPackageContents(tabooPackages);
          const preferredScriptModelCode = body.skipScriptStage === true ? "deepseek-noval" : "deepseek-script";
          const scriptModelConfig = await findActiveScriptGenerationModelConfig(db, preferredScriptModelCode);
          if (actor.teamMember) {
            await reserveAndConsumeSimpleTeamMemberCredits(db, {
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId ?? null,
              projectId,
              teamMemberId: actor.teamMember.id,
              idempotencyKey,
              promptPreview: scriptText.slice(0, 200),
              modelConfig: scriptModelConfig,
              now: new Date(),
            });
          } else {
            await reserveAndConsumeAiStoryboardPreviewCredits(db, {
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId ?? null,
              projectId,
              createdByUserId: authenticated.user.id,
              idempotencyKey,
              promptPreview: scriptText.slice(0, 200),
              modelConfig: scriptModelConfig,
              now: new Date(),
            });
          }

          const previewInput = {
            projectId,
            createdByUserId: authenticated.user.id,
            teamMemberId: actor.teamMember?.id ?? null,
            scriptText,
            skipScriptStage: body.skipScriptStage === true,
            packages: {
              genrePrompt,
              emotionPrompt,
              tabooPrompt,
            },
            templates: {
              scenePrompt: sceneTemplate.prompt_content,
              characterPrompt: characterTemplate.prompt_content,
              propPrompt: propTemplate.prompt_content,
              shotPrompt: shotTemplate.prompt_content,
            },
          };
          const previewService = createAiStoryboardPreviewService({ gateway: aiStoryboardTextChatGateway });
          const wantsStream = request.headers.accept?.includes("text/event-stream") || url.searchParams.get("stream") === "1";
          if (wantsStream) {
            response.statusCode = 200;
            response.setHeader("content-type", "text/event-stream; charset=utf-8");
            response.setHeader("cache-control", "no-cache, no-transform");
            response.setHeader("connection", "keep-alive");
            response.flushHeaders?.();
            const stopHeartbeat = startSseHeartbeat(response, 15_000, { dataOnly: true });
            const abortController = createRequestAbortController(request, response);
            try {
              const creditBalance = await getAiStoryboardPreviewCreditBalance(db, {
                userId: authenticated.user.id,
                teamMemberId: actor.teamMember?.id ?? null,
              });
              for await (const event of previewService.generatePreviewStream({
                ...previewInput,
                signal: abortController.signal,
              })) {
                if (abortController.signal.aborted) {
                  break;
                }
                if (event.type === "complete") {
                  writeSseData(response, {
                    type: "complete",
                    ...event.preview,
                    creditBalance: creditBalance.creditBalance,
                    displayCreditBalance: creditBalance.displayCreditBalance,
                    selectedPackages: {
                      genre: { id: genrePackage.id, name: genrePackage.name },
                      emotion: { id: emotionPackage.id, name: emotionPackage.name },
                      taboo: tabooPackages.map((item) => ({ id: item.id, name: item.name })),
                    },
                  });
                } else {
                  writeSseData(response, event);
                }
              }
              stopHeartbeat();
              abortController.cleanup();
              if (!response.destroyed && !response.writableEnded) {
                response.end();
              }
            } catch (error) {
              stopHeartbeat();
              abortController.cleanup();
              if (!abortController.signal.aborted && !isAbortError(error) && !response.destroyed && !response.writableEnded) {
                if (actor.teamMember) {
                  await releaseSimpleTeamMemberCredits(db, {
                    organizationId: actor.organizationId,
                    teamMemberId: actor.teamMember.id,
                    amount: generationCostFromModelConfig(0, scriptModelConfig),
                    sourceId: idempotencyKey,
                    reason: "剧本预览失败返还积分",
                    metadata: {
                      taskType: "ai_storyboard_preview",
                      promptPreview: scriptText.slice(0, 200),
                    },
                    now: new Date(),
                  });
                }
                writeSseData(response, {
                  type: "error",
                  error: translateProviderErrorMessage(error instanceof Error ? error.message : "分镜预览生成失败，请稍后重试。"),
                });
                response.end();
              }
            }
            return;
          }

          try {
            const preview = await previewService.generatePreview(previewInput);
            const creditBalance = await getAiStoryboardPreviewCreditBalance(db, {
              userId: authenticated.user.id,
              teamMemberId: actor.teamMember?.id ?? null,
            });
            return writeJson(response, enveloped(200, {
              ...preview,
              creditBalance: creditBalance.creditBalance,
              displayCreditBalance: creditBalance.displayCreditBalance,
              selectedPackages: {
                genre: { id: genrePackage.id, name: genrePackage.name },
                emotion: { id: emotionPackage.id, name: emotionPackage.name },
                taboo: tabooPackages.map((item) => ({ id: item.id, name: item.name })),
              },
            }));
          } catch (error) {
            if (actor.teamMember) {
              await releaseSimpleTeamMemberCredits(db, {
                organizationId: actor.organizationId,
                teamMemberId: actor.teamMember.id,
                amount: generationCostFromModelConfig(0, scriptModelConfig),
                sourceId: idempotencyKey,
                reason: "剧本预览失败返还积分",
                metadata: {
                  taskType: "ai_storyboard_preview",
                  promptPreview: scriptText.slice(0, 200),
                },
                now: new Date(),
              });
            }
            throw error;
          }
        }

        if (request.method === "POST" && pathname === "/api/creator/scripts/import-document") {
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now: new Date(),
          });
          if (actor.teamMember) {
            return writeJson(response, envelopedError(403, "team_member_script_import_forbidden", "team member cannot import workspace scripts"));
          }
          const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
          if (!idempotencyKey) {
            return writeIdempotencyKeyRequired(response);
          }
          const body = (await readJsonBody(request)) as {
            title?: string | null;
            scriptInput?: string | null;
            scriptUploadSessionId?: string | null;
            scriptStorageObjectId?: string | null;
            scriptFileName?: string | null;
            scriptContentType?: string | null;
          };
          if (body.scriptUploadSessionId || body.scriptStorageObjectId) {
            try {
              body.scriptInput = await extractScriptInputFromUploadedDocument(db, {
                sessionToken: authenticated.sessionToken,
                userId: authenticated.user.id,
                body,
                runtime: storageRuntime,
                signedUrlExpiresInSeconds,
                now: new Date(),
                fetchImpl: options.fetchImpl ?? fetch,
              });
            } catch (error) {
              if (error instanceof ScriptDocumentUploadError) {
                return writeJson(response, envelopedError(error.status, error.code, error.message));
              }
              throw error;
            }
          }
          return writeJson(
            response,
            await creatorApplication.importScriptDocument({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: {
                title: body.title,
                scriptInput: String(body.scriptInput ?? ""),
              },
              now: new Date(),
            }),
          );
        }

        if (request.method === "GET" && pathname === "/api/creator/scripts") {
          return writeJson(
            response,
            await creatorApplication.listWorkspaceScripts({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              now: new Date(),
              page: Number(url.searchParams.get("page") ?? 1),
              pageSize: Number(url.searchParams.get("pageSize") ?? 10),
              includeUntitled: url.searchParams.get("includeUntitled") === "1",
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
            scriptInput?: string;
            aspectRatio: string;
            resolution: string;
            scriptUploadSessionId?: string | null;
            scriptStorageObjectId?: string | null;
            scriptFileName?: string | null;
            scriptContentType?: string | null;
          };
          if (body.scriptUploadSessionId || body.scriptStorageObjectId) {
            try {
              body.scriptInput = await extractScriptInputFromUploadedDocument(db, {
                sessionToken: authenticated.sessionToken,
                userId: authenticated.user.id,
                body,
                runtime: storageRuntime,
                signedUrlExpiresInSeconds,
                now: new Date(),
                fetchImpl: options.fetchImpl ?? fetch,
              });
            } catch (error) {
              if (error instanceof ScriptDocumentUploadError) {
                return writeJson(response, envelopedError(error.status, error.code, error.message));
              }
              throw error;
            }
          }
          const createProjectBody = {
            name: body.name,
            scriptInput: String(body.scriptInput ?? ""),
            aspectRatio: body.aspectRatio,
            resolution: body.resolution,
          };
          return writeJson(
            response,
            await creatorApplication.createProject({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body: createProjectBody,
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
          if (url.searchParams.get("scope") === "team") {
            const now = new Date();
            const actor = await resolveActorContext(db, {
              sessionToken: authenticated.sessionToken,
              workspaceId: currentWorkspaceId,
              now,
            });
            const entitlement = await hasActiveOrganizationEntitlement(db, {
              organizationId: actor.organizationId,
              userId: actor.actorId,
              entitlementKey: "team_asset_library",
              now,
            });
            if (!entitlement) {
              return writeJson(response, {
                status: 200,
                body: {
                  scope: "team",
                  categories: [
                    { id: "character", label: "角色" },
                    { id: "scene", label: "场景" },
                    { id: "prop", label: "道具" },
                    { id: "voice", label: "音色" },
                  ],
                  folders: [],
                  assets: [],
                  entitlement: {
                    hasTeamAssetLibrary: false,
                    blockReason: "team_asset_library_entitlement_required",
                  },
                },
              });
            }
            const category = parseTeamAssetCategory(url.searchParams.get("category"));
            const query = String(url.searchParams.get("q") ?? url.searchParams.get("query") ?? "").trim();
            const params: unknown[] = [actor.actorId];
            const conditions = ["admin_user_id = $1", "asset_status IN ('active', 'generating', 'failed')"];
            if (category) {
              params.push(category);
              conditions.push(`asset_category = $${params.length}`);
            }
            if (query) {
              params.push(`%${query.toLowerCase()}%`);
              conditions.push(`(LOWER(asset_name) LIKE $${params.length} OR LOWER(COALESCE(asset_prompt, '')) LIKE $${params.length})`);
            }
            const rows = await db.query<Record<string, unknown>>(
              `SELECT team_assets.*,
                      generation_task.id AS generation_task_id,
                      generation_task.status AS generation_task_status,
                      generation_task.failure_code AS generation_task_failure_code,
                      generation_task.input_snapshot_json AS generation_task_payload,
                      provider_request.id AS provider_request_id,
                      provider_request.status AS provider_request_status,
                      provider_request.failure_code AS provider_failure_code,
                      provider_request.payload_redacted_json AS provider_payload
                 FROM team_assets
                 LEFT JOIN LATERAL (
                   SELECT id, status, failure_code, input_snapshot_json
                   FROM tasks
                   WHERE input_snapshot_json->>'targetType' = 'team_asset'
                     AND input_snapshot_json->>'targetId' = team_assets.id::text
                   ORDER BY created_at DESC
                   LIMIT 1
                 ) AS generation_task ON TRUE
                 LEFT JOIN LATERAL (
                   SELECT id, status, failure_code, payload_redacted_json
                   FROM provider_requests
                   WHERE payload_ref = 'creator://team-assets/' || team_assets.id::text
                      OR task_id = generation_task.id
                   ORDER BY created_at DESC
                   LIMIT 1
                 ) AS provider_request ON TRUE
                WHERE ${conditions.join(" AND ")}
                ORDER BY team_assets.updated_at DESC, team_assets.id DESC`,
              params,
            );
            return writeJson(response, {
              status: 200,
              body: {
                scope: "team",
                categories: [
                  { id: "character", label: "角色" },
                  { id: "scene", label: "场景" },
                  { id: "prop", label: "道具" },
                  { id: "voice", label: "音色" },
                ],
                folders: [],
                assets: rows.rows.map(teamAssetRow),
                entitlement: { hasTeamAssetLibrary: true, blockReason: null },
              },
            });
          }
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

        if (request.method === "POST" && pathname === "/api/creator/team-assets/upload") {
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          if (!(await hasActiveOrganizationEntitlement(db, {
            organizationId: actor.organizationId,
            userId: actor.actorId,
            entitlementKey: "team_asset_library",
            now,
          }))) {
            return writeJson(response, envelopedError(403, "team_asset_library_entitlement_required", "Team asset library membership is required"));
          }
          const formData = await readMultipartFormData(request, serverOriginFromRequest(request));
          const category = parseTeamAssetCategory(formData.get("category"));
          const file = formData.get("file");
          const assetName = String(formData.get("assetName") ?? (file instanceof File ? file.name.replace(/\.[^.]+$/, "") : "")).trim();
          const assetPrompt = String(formData.get("assetPrompt") ?? "").trim() || null;
          if (!category || !(file instanceof File) || !assetName) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_input", "Team asset category, name and file are required"));
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          const uploadPolicy = validateUploadPolicy({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: bytes.byteLength,
            purpose: `team-assets/${category}`,
          });
          if (!uploadPolicy.ok || (category === "voice" ? uploadPolicy.kind !== "audio" : uploadPolicy.kind !== "image")) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_file", "Invalid team asset file"));
          }
          if (typeof storageRuntime.adapter.putObject !== "function") {
            return writeJson(response, envelopedError(500, "cloud_storage_required", "Cloud storage is required for team assets"));
          }
          const objectKey = buildTeamAssetUploadObjectKey({
            adminUserId: actor.actorId,
            category,
            fileName: file.name,
            now,
            env: runtimeEnv,
          });
          await storageRuntime.adapter.putObject({
            bucket: storageRuntime.bucket,
            objectKey,
            body: bytes,
            contentType: file.type || "application/octet-stream",
            contentLength: bytes.byteLength,
          });
          const assetUrl = buildStorageObjectPublicUrl(storageRuntime, {
            bucket: storageRuntime.bucket,
            objectKey,
          });
          if (!assetUrl.startsWith("https://")) {
            return writeJson(response, envelopedError(500, "team_asset_https_url_required", "Team asset storage URL must use HTTPS"));
          }
          const createdUserId = actor.teamMember?.id ?? actor.actorId;
          const operatorName = actor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? actor.actorId;
          const assetId = randomUUID();
          const inserted = await queryOne<Record<string, unknown>>(
            db,
            `
              INSERT INTO team_assets (
                id, admin_user_id, asset_name, asset_prompt, asset_category,
                asset_status, asset_url, resource_type, resource_size,
                created_at, updated_at, created_by_name, updated_by_name,
                is_admin_created, created_user_id
              )
              VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $9, $10, $10, $11, $12)
              RETURNING *
            `,
            [
              assetId,
              actor.actorId,
              assetName,
              assetPrompt,
              category,
              assetUrl,
              teamAssetResourceKind(file.type || "application/octet-stream"),
              bytes.byteLength,
              now,
              operatorName,
              !actor.teamMember,
              createdUserId,
            ],
          );
          return writeJson(response, { status: 200, body: { asset: teamAssetRow(inserted!) } });
        }

        if (request.method === "POST" && pathname.endsWith("/upload") && pathname.startsWith("/api/creator/team-assets/")) {
          const assetId = decodeURIComponent(pathname.split("/").at(-2) ?? "");
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          const existing = await queryOne<{ asset_category: string }>(db, `
            SELECT asset_category FROM team_assets
            WHERE id = $1 AND admin_user_id = $2 AND asset_status IN ('active', 'failed')
          `, [assetId, actor.actorId]);
          if (!existing) {
            return writeJson(response, { status: 404, body: { error: "team_asset_not_found" } });
          }
          const formData = await readMultipartFormData(request, serverOriginFromRequest(request));
          const file = formData.get("file");
          const assetName = String(formData.get("assetName") ?? "").trim() || null;
          const hasAssetPrompt = formData.has("assetPrompt");
          const assetPrompt = hasAssetPrompt ? String(formData.get("assetPrompt") ?? "").trim() : null;
          const category = parseTeamAssetCategory(existing.asset_category);
          if (!category || !(file instanceof File)) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_file", "Invalid team asset file"));
          }
          const bytes = new Uint8Array(await file.arrayBuffer());
          const uploadPolicy = validateUploadPolicy({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: bytes.byteLength,
            purpose: `team-assets/${category}`,
          });
          if (!uploadPolicy.ok || (category === "voice" ? uploadPolicy.kind !== "audio" : uploadPolicy.kind !== "image")) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_file", "Invalid team asset file"));
          }
          if (typeof storageRuntime.adapter.putObject !== "function") {
            return writeJson(response, envelopedError(500, "cloud_storage_required", "Cloud storage is required for team assets"));
          }
          const objectKey = buildTeamAssetUploadObjectKey({
            adminUserId: actor.actorId,
            category,
            fileName: file.name,
            now,
            env: runtimeEnv,
          });
          await storageRuntime.adapter.putObject({
            bucket: storageRuntime.bucket,
            objectKey,
            body: bytes,
            contentType: file.type || "application/octet-stream",
            contentLength: bytes.byteLength,
          });
          const assetUrl = buildStorageObjectPublicUrl(storageRuntime, { bucket: storageRuntime.bucket, objectKey });
          if (!assetUrl.startsWith("https://")) {
            return writeJson(response, envelopedError(500, "team_asset_https_url_required", "Team asset storage URL must use HTTPS"));
          }
          const operatorName = actor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? actor.actorId;
          const updated = await queryOne<Record<string, unknown>>(db, `
            UPDATE team_assets
            SET asset_url = $3, resource_type = $4, resource_size = $5,
                asset_name = COALESCE($6, asset_name),
                asset_prompt = CASE WHEN $7::boolean THEN $8 ELSE asset_prompt END,
                asset_status = 'active', updated_at = $9, updated_by_name = $10
            WHERE id = $1 AND admin_user_id = $2
            RETURNING *
          `, [assetId, actor.actorId, assetUrl, teamAssetResourceKind(file.type || "application/octet-stream"), bytes.byteLength, assetName, hasAssetPrompt, assetPrompt, now, operatorName]);
          return writeJson(response, { status: 200, body: { asset: teamAssetRow(updated!) } });
        }

        if (request.method === "POST" && pathname === "/api/creator/team-assets/generate") {
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          if (!(await hasActiveOrganizationEntitlement(db, {
            organizationId: actor.organizationId,
            userId: actor.actorId,
            entitlementKey: "team_asset_library",
            now,
          }))) {
            return writeJson(response, envelopedError(403, "team_asset_library_entitlement_required", "Team asset library membership is required"));
          }
          const body = await readJsonBody(request);
          const category = parseTeamAssetCategory(body.category);
          const assetName = String(body.name ?? "").trim();
          const prompt = String(body.prompt ?? "").trim();
          const modelCode = String(body.model ?? "").trim();
          const parameters = body.parameters && typeof body.parameters === "object" && !Array.isArray(body.parameters)
            ? body.parameters as Record<string, unknown>
            : {};
          const requestedAssetId = readString(body.assetId);
          if (!category || category === "voice" || !assetName || !prompt || !modelCode) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_generation_input", "Team asset category, name, prompt and model are required"));
          }
          const modelConfig = await findActiveAiModelConfigByCode(db, modelCode);
          if (!modelConfig || !modelConfig.mediaType.toLowerCase().startsWith("image")) {
            return writeJson(response, envelopedError(400, "team_asset_generation_model_invalid", "An active image generation model is required"));
          }
          if (typeof storageRuntime.adapter.putObject !== "function") {
            return writeJson(response, envelopedError(500, "cloud_storage_required", "Cloud storage is required for team assets"));
          }
          const createdUserId = actor.teamMember?.id ?? actor.actorId;
          const operatorName = actor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? actor.actorId;
          const assetId = requestedAssetId || randomUUID();
          const billingSourceId = randomUUID();
          const generationCost = generationCostFromModelConfig(0, modelConfig, parameters);
          const billingMetadata = {
            targetUserId: actor.actorId,
            memberId: actor.teamMember?.id ?? undefined,
            modelCode,
            mediaType: "image",
            kind: "image",
            targetType: "team_asset",
            targetId: assetId,
            promptPreview: prompt,
          };
          let creditReservationId: string | null = null;
          const releaseGenerationCredits = async () => {
            if (creditReservationId && generationCost > 0) {
              await settleReservationAllocation(db, {
                reservationId: creditReservationId,
                allocationKey: "team_asset_generation",
                amount: generationCost,
                outcome: "released",
                metadata: { ...billingMetadata, billingEvent: "released", outcome: "released" },
                now: new Date(),
              }).catch(() => undefined);
            } else if (actor.teamMember?.id && generationCost > 0) {
              await releaseSimpleTeamMemberCredits(db, {
                organizationId: actor.organizationId,
                teamMemberId: actor.teamMember.id,
                amount: generationCost,
                sourceId: billingSourceId,
                reason: "团队资产生成失败返还积分",
                metadata: billingMetadata,
                now: new Date(),
              }).catch(() => undefined);
            }
          };
          if (generationCost > 0) {
            if (actor.teamMember?.id) {
              await reserveAndConsumeSimpleTeamMemberCredits(db, {
                organizationId: actor.organizationId,
                workspaceId: actor.workspaceId,
                projectId: null,
                teamMemberId: actor.teamMember.id,
                idempotencyKey: billingSourceId,
                promptPreview: prompt,
                modelConfig,
                now,
              });
            } else {
              const reservation = await reserveCredits(db, {
                compatibilityOrganizationId: actor.organizationId,
                userId: actor.actorId,
                workspaceId: actor.workspaceId,
                projectId: null,
                amount: generationCost,
                sourceType: "team_asset_generation_task",
                sourceId: billingSourceId,
                reason: "图片生成积分扣减",
                metadata: { ...billingMetadata, billingEvent: "reserved", outcome: "reserved" },
                createdByUserId: actor.actorId,
                now,
              });
              creditReservationId = reservation.reservation.id;
            }
          }
          if (requestedAssetId) {
            const reset = await queryOne<{ id: string }>(db, `
              UPDATE team_assets
              SET asset_name = $3, asset_prompt = $4, asset_status = 'generating',
                  asset_url = NULL, resource_size = 0, updated_at = $5, updated_by_name = $6
              WHERE id = $1 AND admin_user_id = $2 AND asset_status IN ('active', 'failed')
              RETURNING id
            `, [assetId, actor.actorId, assetName, prompt, now, operatorName]);
            if (!reset) {
              await releaseGenerationCredits();
              return writeJson(response, { status: 404, body: { error: "team_asset_not_found" } });
            }
          } else {
            await db.query(
              `INSERT INTO team_assets (
              id, admin_user_id, asset_name, asset_prompt, asset_category,
              asset_status, asset_url, resource_type, resource_size,
              created_at, updated_at, created_by_name, updated_by_name,
              is_admin_created, created_user_id
            ) VALUES ($1, $2, $3, $4, $5, 'generating', NULL, 'image', 0, $6, $6, $7, $7, $8, $9)`,
              [assetId, actor.actorId, assetName, prompt, category, now, operatorName, !actor.teamMember, createdUserId],
            );
          }
          const payloadRef = `creator://team-assets/${assetId}`;
          const payloadHash = sha256(`${payloadRef}:${modelCode}:${prompt}:${JSON.stringify(parameters)}`);
          const providerRequestInput = {
            workspaceId: actor.workspaceId,
            providerName: modelConfig.providerName,
            providerOperation: operationNames.episodeImageGenerate,
            requestKey: requestedAssetId ? `team-asset:${assetId}:${randomUUID()}` : `team-asset:${assetId}`,
            requestHash: sha256(`${assetId}:${modelCode}:${prompt}`),
            payloadRef,
            payloadHash,
            redactedPayload: { prompt, model: modelCode, parameters, assetId, category },
            createdByUserId: actor.actorId,
            now,
          };
          const prepared = await createOrReuseProviderRequest(db, providerRequestInput);
          await createUserModelRequestLog(db, {
            providerRequestId: prepared.request.id,
            workspaceId: actor.workspaceId,
            projectId: null,
            workflowId: null,
            taskId: null,
            attemptId: null,
            userId: actor.actorId,
            providerName: modelConfig.providerName,
            providerOperation: operationNames.episodeImageGenerate,
            modelId: modelCode,
            providerModel: modelConfig.providerModel,
            requestKey: providerRequestInput.requestKey,
            requestHash: providerRequestInput.requestHash,
            payloadHash,
            payloadSummary: prompt.slice(0, 200),
            requestFormat: "team_asset_image_generation",
            requestBody: providerRequestInput.redactedPayload,
            requestText: prompt,
            now,
          });
          const generatingAsset = await queryOne<Record<string, unknown>>(db, `
            SELECT team_assets.*,
                   $2::uuid AS provider_request_id,
                   'created'::text AS provider_request_status,
                   NULL::text AS provider_failure_code,
                   $3::jsonb AS provider_payload
            FROM team_assets
            WHERE id = $1
          `, [assetId, prepared.request.id, JSON.stringify(providerRequestInput.redactedPayload)]);
          void (async () => {
            try {
              const adapter = createProviderAdapterFromModelConfig({
                providerProtocol: modelConfig.providerProtocol,
                providerModel: modelConfig.providerModel,
                providerConfig: modelConfig.providerConfig,
              }, runtimeEnv, options.fetchImpl);
            const submitted = await submitProviderRequest(db, {
              ...providerRequestInput,
              adapter,
            });
            const artifact = submitted.kind === "submitted"
              ? submitted.artifacts?.find((item) => item.mediaType === "image")
              : undefined;
            if (!artifact) {
              throw new Error("team_asset_generation_artifact_missing");
            }
            const bytes = await readTeamAssetArtifactBytes(artifact, options.fetchImpl ?? fetch);
            const contentType = String(artifact.mimeType ?? "image/png").trim() || "image/png";
            const objectKey = buildTeamAssetUploadObjectKey({
              adminUserId: actor.actorId,
              category,
              fileName: teamAssetGeneratedFileName(assetName, artifact),
              now,
              env: runtimeEnv,
            });
            await storageRuntime.adapter.putObject({
              bucket: storageRuntime.bucket,
              objectKey,
              body: bytes,
              contentType,
              contentLength: bytes.byteLength,
            });
            const assetUrl = buildStorageObjectPublicUrl(storageRuntime, { bucket: storageRuntime.bucket, objectKey });
            if (!assetUrl.startsWith("https://")) {
              throw new Error("team_asset_https_url_required");
            }
            await markProviderRequestSucceeded(db, {
              providerRequestId: submitted.request.id,
              externalRequestId: submitted.request.externalRequestId,
              redactedResponse: { assetId, assetUrl },
              now: new Date(),
            });
            await completeUserModelRequestLog(db, {
              providerRequestId: submitted.request.id,
              status: "succeeded",
              responseText: JSON.stringify({
                externalRequestId: submitted.request.externalRequestId,
                assetId,
                assetUrl,
              }),
              now: new Date(),
            });
            if (creditReservationId && generationCost > 0) {
              await settleReservationAllocation(db, {
                reservationId: creditReservationId,
                allocationKey: "team_asset_generation",
                amount: generationCost,
                outcome: "consumed",
                metadata: { ...billingMetadata, billingEvent: "consumed", outcome: "consumed" },
                now: new Date(),
              });
            }
            await db.query(`
              UPDATE team_assets
              SET asset_status = 'active', asset_url = $2, resource_type = 'image', resource_size = $3,
                  updated_at = $4, updated_by_name = $5
              WHERE id = $1 AND admin_user_id = $6
            `, [assetId, assetUrl, bytes.byteLength, new Date(), operatorName, actor.actorId]);
          } catch (error) {
            await completeUserModelRequestLog(db, {
              providerRequestId: prepared.request.id,
              status: "failed",
              responseText: translateProviderErrorMessage(error),
              failureCode: readErrorFailureCode(error) ?? "provider_failed",
              now: new Date(),
            }).catch(() => undefined);
            await releaseGenerationCredits();
            await db.query(`
              UPDATE team_assets
              SET asset_status = 'failed', updated_at = $2, updated_by_name = $3
              WHERE id = $1 AND admin_user_id = $4
            `, [assetId, new Date(), operatorName, actor.actorId]);
            console.error("[team-assets] background generation failed", translateProviderErrorMessage(error));
          }
          })();
          const credit = actor.teamMember?.id
            ? await getSimpleTeamMemberCreditBalance(db, { userId: authenticated.user.id, memberId: actor.teamMember.id })
            : await getUserCreditBalance(db, actor.actorId);
          return writeJson(response, {
            status: 202,
            body: {
              asset: teamAssetRow(generatingAsset!),
              generationStatus: "created",
              generationTaskId: prepared.request.id,
              cost: generationCost,
              creditBalance: credit.creditBalance,
            },
          });
        }

        if (request.method === "PATCH" && pathname.startsWith("/api/creator/team-assets/")) {
          const assetId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const assetName = body.name === undefined ? undefined : String(body.name ?? "").trim();
          const assetPrompt = body.prompt === undefined ? undefined : String(body.prompt ?? "").trim();
          const assetUrl = body.assetUrl === undefined ? undefined : String(body.assetUrl ?? "").trim();
          if (assetName !== undefined && !assetName) {
            return writeJson(response, envelopedError(400, "invalid_team_asset_name", "Team asset name is required"));
          }
          if (assetUrl !== undefined && !assetUrl.startsWith("https://")) {
            return writeJson(response, envelopedError(400, "team_asset_https_url_required", "Team asset storage URL must use HTTPS"));
          }
          const operatorName = actor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? actor.actorId;
          const updated = await queryOne<Record<string, unknown>>(db, `
            UPDATE team_assets
            SET asset_name = COALESCE($3, asset_name),
                asset_prompt = CASE WHEN $4::boolean THEN $5 ELSE asset_prompt END,
                asset_url = COALESCE($6, asset_url),
                updated_at = $7,
                updated_by_name = $8
            WHERE id = $1
              AND admin_user_id = $2
              AND asset_status IN ('active', 'failed')
            RETURNING *
          `, [assetId, actor.actorId, assetName ?? null, assetPrompt !== undefined, assetPrompt ?? null, assetUrl ?? null, now, operatorName]);
          return writeJson(response, updated
            ? { status: 200, body: { asset: teamAssetRow(updated) } }
            : { status: 404, body: { error: "team_asset_not_found" } });
        }

        if (request.method === "DELETE" && pathname.startsWith("/api/creator/team-assets/")) {
          const assetId = decodeURIComponent(pathname.split("/").at(-1) ?? "");
          const now = new Date();
          const actor = await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            workspaceId: currentWorkspaceId,
            now,
          });
          const operatorName = actor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? actor.actorId;
          const archived = await queryOne<{ id: string }>(
            db,
            `
              UPDATE team_assets
              SET asset_status = 'archived', updated_at = $3, updated_by_name = $4
              WHERE id = $1 AND admin_user_id = $2 AND asset_status IN ('active', 'generating', 'failed')
              RETURNING id
            `,
            [assetId, actor.actorId, now, operatorName],
          );
          return writeJson(response, archived
            ? { status: 200, body: { deleted: true } }
            : { status: 404, body: { error: "team_asset_not_found" } });
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
            previewUrl?: string | null;
            sourceUrl?: string | null;
            downloadUrl?: string | null;
            storageObjectId?: string | null;
            storageObjectKey?: string | null;
            mimeType?: string | null;
            generationTaskId?: string | null;
            generationStatus?: string | null;
            generationResult?: Record<string, unknown> | null;
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
            projectId?: string | null;
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
            ...(projectId ? { projectId } : { workspaceId: currentWorkspaceId }),
            now,
          });
          const storageObject = await createScopedStorageObject(db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId ?? currentWorkspaceId,
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
          const dateShortcut = queryUrl.searchParams.get("dateShortcut") ?? "today";
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
            scope?: "project" | "team" | null;
            assetId?: string | null;
            projectId?: string | null;
            name?: string | null;
            prompt?: string | null;
            model?: string | null;
            width?: number | null;
            height?: number | null;
            parameters?: Record<string, unknown> | null;
          };
          const now = new Date();
          const isTeamAsset = body.scope === "team";
          let teamActor: ActorContext | null = null;
          let created: AuthHttpResponse<Record<string, unknown>>;
          if (isTeamAsset) {
            const projectId = readString(body.projectId);
            const category = parseTeamAssetCategory(body.kind);
            const assetName = readString(body.name);
            const prompt = readString(body.prompt);
            if (!projectId || !category || category === "voice" || !assetName || !prompt) {
              return writeJson(response, envelopedError(400, "invalid_team_asset_generation_input", "Team asset category, project, name and prompt are required"));
            }
            teamActor = await resolveActorContext(db, {
              sessionToken: authenticated.sessionToken,
              projectId,
              capability: capabilities.generationStart,
              now,
            });
            if (!(await hasActiveOrganizationEntitlement(db, {
              organizationId: teamActor.organizationId,
              userId: teamActor.actorId,
              entitlementKey: "team_asset_library",
              now,
            }))) {
              return writeJson(response, envelopedError(403, "team_asset_library_entitlement_required", "Team asset library membership is required"));
            }
            if (!(await hasActiveGenerationMembership(db, { userId: teamActor.actorId, now }))) {
              return writeJson(response, envelopedError(403, "generation_membership_required", "有效会员已过期或未开通，请先开通会员。"));
            }
            const assetId = readString(body.assetId) || randomUUID();
            const operatorName = teamActor.teamMember?.memberName ?? authenticated.user.displayName ?? authenticated.user.phone ?? teamActor.actorId;
            const createdUserId = teamActor.teamMember?.id ?? teamActor.actorId;
            const existingAssetId = readString(body.assetId);
            const row = existingAssetId
              ? await queryOne<Record<string, unknown>>(db, `
                  UPDATE team_assets
                  SET asset_name = $3, asset_prompt = $4, asset_category = $5,
                      asset_status = 'generating', asset_url = NULL, resource_type = 'image',
                      resource_size = 0, updated_at = $6, updated_by_name = $7
                  WHERE id = $1 AND admin_user_id = $2 AND asset_status IN ('active', 'failed')
                  RETURNING *
                `, [assetId, teamActor.actorId, assetName, prompt, category, now, operatorName])
              : await queryOne<Record<string, unknown>>(db, `
                  INSERT INTO team_assets (
                    id, admin_user_id, asset_name, asset_prompt, asset_category,
                    asset_status, asset_url, resource_type, resource_size,
                    created_at, updated_at, created_by_name, updated_by_name,
                    is_admin_created, created_user_id
                  ) VALUES ($1, $2, $3, $4, $5, 'generating', NULL, 'image', 0, $6, $6, $7, $7, $8, $9)
                  RETURNING *
                `, [assetId, teamActor.actorId, assetName, prompt, category, now, operatorName, !teamActor.teamMember, createdUserId]);
            if (!row) {
              return writeJson(response, { status: 404, body: { error: "team_asset_not_found" } });
            }
            created = { status: 200, body: { asset: teamAssetRow(row) } };
          } else {
            created = await creatorApplication.generateAsset({
              user: {
                id: authenticated.user.id,
                sessionToken: authenticated.sessionToken,
              },
              body,
              now,
            });
          }
          if (created.status >= 400) {
            return writeJson(response, created);
          }

          const createdBody = created.body as Record<string, unknown>;
          const asset = createdBody.asset && typeof createdBody.asset === "object"
            ? createdBody.asset as Record<string, unknown>
            : {};
          const assetId = readString(asset.id);
          const projectId = readString(asset.projectId) || readString(body.projectId);
          if (!assetId || !projectId || body.kind === "video") {
            return writeJson(response, created);
          }

          const actor = teamActor ?? await resolveActorContext(db, {
            sessionToken: authenticated.sessionToken,
            projectId,
            capability: capabilities.generationStart,
            now,
          });
          const episodeId = await resolveProjectAssetGenerationEpisodeId(db, {
            organizationId: actor.organizationId,
            projectId,
            userId: authenticated.user.id,
            now,
          });
          const idempotencyKey =
            requiredIdempotencyKeyFromRequest(request) ??
            sha256(`creator-asset-generate:${assetId}:${now.toISOString()}`);
          let taskResult;
          try {
            taskResult = await createEpisodeGenerationTask(db, {
              kind: "image",
              episodeId,
              body: {
                ...body,
                prompt: readString(body.prompt),
                promptOverride: readString(body.prompt),
                targetType: isTeamAsset ? "team_asset" : "asset",
                targetId: assetId,
                assetId,
                assetType: body.kind,
                parameters: body.parameters ?? {},
              },
              idempotencyKey,
              authenticated,
              runtime: storageRuntime,
              env: runtimeEnv,
              fetchImpl: options.fetchImpl,
              signedUrlExpiresInSeconds,
              now,
            });
          } catch (error) {
            if (isTeamAsset) {
              await db.query(
                "UPDATE team_assets SET asset_status = 'failed', updated_at = $3 WHERE id = $1 AND admin_user_id = $2",
                [assetId, actor.actorId, new Date()],
              );
            }
            if (error instanceof InsufficientCreditsError) {
              return writeJson(response, envelopedError(402, "insufficient_credits", "积分余额不足，请充值后再生成。"));
            }
            if (error instanceof GenerationMembershipRequiredError) {
              return writeJson(response, envelopedError(403, error.code, error.message));
            }
            throw error;
          }
          if (!taskResult.body) {
            return writeJson(response, created);
          }
          const taskBody = taskResult.body as Record<string, unknown>;
          const taskId = readString(taskBody.taskId);
          const generationStatus = readString(taskBody.status) || readString(taskBody.workflowStatus) || "running";
          if (isTeamAsset) {
            await syncTeamAssetGenerationTaskMetadata(db, {
              task: taskBody,
              adminUserId: actor.actorId,
              now,
            });
          } else await creatorApplication.updateProjectAsset({
            user: {
              id: authenticated.user.id,
              sessionToken: authenticated.sessionToken,
            },
            assetId,
            body: {
              description: readString(body.prompt),
              generationTaskId: taskId,
              generationStatus,
              generationResult: taskBody,
              previewUrl: resolveGenerationTaskAssetPreviewUrl(taskBody) || null,
              sourceUrl: resolveGenerationTaskAssetPreviewUrl(taskBody) || null,
              downloadUrl: resolveGenerationTaskAssetPreviewUrl(taskBody) || null,
            },
            now,
          });
          if (!isTeamAsset) {
            await syncProjectAssetGenerationTaskMetadata(db, {
              task: taskBody,
              organizationId: actor.organizationId,
              now,
            });
          }
          return writeJson(response, {
            status: taskResult.status,
            body: {
              ...created.body,
              ...taskBody,
              asset,
              generationTaskId: taskId,
              generationStatus,
              generationResult: taskBody,
            },
          });
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
            projectId?: string | null;
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

      const adminDocumentedTaskRetryMatch = pathname.match(/^\/api\/admin\/ops\/tasks\/([^/]+)\/retry$/);
      if (request.method === "POST" && adminDocumentedTaskRetryMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.opsTaskRetry],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as { reason?: string };
        return writeJson(
          response,
          await retryTaskForBackendAdmin({
            db,
            taskId: decodeURIComponent(adminDocumentedTaskRetryMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            now: new Date(),
          }),
        );
      }

      const adminDocumentedPaymentRepairMatch = pathname.match(/^\/api\/admin\/ops\/payments\/([^/]+)\/repair-credit$/);
      if (request.method === "POST" && adminDocumentedPaymentRepairMatch) {
        const idempotencyKey = requiredIdempotencyKeyFromRequest(request);
        if (!idempotencyKey) {
          return writeIdempotencyKeyRequired(response);
        }
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredRoles: [...adminRouteRoles.riskReview],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }
        const body = (await readJsonBody(request)) as { reason?: string };
        return writeJson(
          response,
          await repairPaymentCreditForBackendAdmin({
            db,
            orderId: decodeURIComponent(adminDocumentedPaymentRepairMatch[1]),
            reason: String(body.reason ?? ""),
            idempotencyKey,
            actorAdminAccountId: adminRoute.session.admin_account_id,
            now: new Date(),
          }),
        );
      }

      if (pathname.startsWith("/api/admin/ops/")) {
        const adminRoute = await requireAdminRouteSession({
          db,
          cookieHeader: request.headers.cookie,
          requiredPermissions: ["ops.task.retry"],
        });
        if (!adminRoute.ok) {
          return writeJson(response, adminRoute.response);
        }

        if (request.method === "GET" && pathname === "/api/admin/ops/items") {
          return writeJson(response, {
            status: 200,
            body: await listAdminOpsItemsForScope({
              db,
              organizationId: devOrganizationId,
              workspaceId: devWorkspaceId,
            }),
          });
        }

        if (
          request.method === "GET" &&
          pathname === "/api/admin/ops/generation-queues"
        ) {
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
            await db.query("BEGIN");
            const requestHash = hashJson({
              queueName: body.queueName,
              jobId: body.jobId,
              action: body.action,
              reason,
            });
            const store = new SqlIdempotencyRecordStore(db);
            const started = await beginOrReplayCommand(store, {
              organizationId: devOrganizationId,
              operationName: operationNames.opsGenerationQueueJobOperate,
              idempotencyKey,
              requestHash,
            });
            if (started.kind === "replayed") {
              if (!started.record.responseSnapshot) {
                throw new IdempotencyProcessingError(started.record);
              }
              await db.query("COMMIT");
              return writeJson(response, {
                status: 200,
                body: started.record.responseSnapshot,
              });
            }
            if (started.kind === "processing") {
              throw new IdempotencyProcessingError(started.record);
            }

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
            await appendAuditEvent(db, {
              organizationId: devOrganizationId,
              workspaceId: devWorkspaceId,
              actorUserId: null,
              eventType: "admin.ops.generation_queue_job_operated",
              targetType: "generation_queue_job",
              targetId: randomUUID(),
              reason,
              sensitive: true,
              metadata: {
                ...queueResult.body,
                actorAdminAccountId: adminRoute.session.admin_account_id,
              },
              occurredAt: new Date(),
            });
            await store.update({
              ...started.record,
              responseResourceType: "generation_queue_job",
              responseResourceId: randomUUID(),
              responseSnapshot: queueResult.body,
              status: "succeeded",
              updatedAt: new Date(),
            });
            await db.query("COMMIT");
            return writeJson(response, {
              status: 200,
              body: queueResult.body,
            });
          } catch (error) {
            await db.query("ROLLBACK").catch(() => undefined);
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

        const adminOps = createAdminOpsService({
          db,
          workspaceId: devWorkspaceId,
        });
        const adminOpsActor = await resolveAdminOpsBridgeActor(db);

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
              user: { actor: adminOpsActor },
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
              user: { actor: adminOpsActor },
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
              user: { actor: adminOpsActor },
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
              user: { actor: adminOpsActor },
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
              user: { actor: adminOpsActor },
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
              user: { actor: adminOpsActor },
              body,
              idempotencyKey,
              now: new Date(),
            }),
          );
        }
      }

      if (request.method === "GET") {
        if (pathname === "/admin" || pathname.startsWith("/admin/")) {
          return await serveAdminStatic(pathname, response);
        }
        if (pathname === "/login" || pathname === "/login.html") {
          const target = new URL("/", resolveRequestOrigin(request));
          const inviteCode = url.searchParams.get("inviteCode")?.trim();
          if (inviteCode) {
            target.searchParams.set("inviteCode", inviteCode);
          }
          return redirect(response, target.toString());
        }
        return await serveStatic(request, pathname, response);
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
            error: "internal_error",
            message: "服务内部错误，请稍后重试。",
          }),
        );
      }
    });
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
    origin: `http://${originHost}:0`,
    async listen(port: number) {
      await new Promise<void>((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, listenHost, () => resolve());
      });

      const address = httpServer.address();

      if (!address || typeof address === "string") {
        throw new Error("server_address_unavailable");
      }

      this.origin = `http://${originHost}:${address.port}`;
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
      await authSessionCache?.close();
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
