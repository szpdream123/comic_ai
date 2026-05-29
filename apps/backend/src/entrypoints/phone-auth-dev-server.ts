import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server, ServerResponse } from "node:http";
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { maskCnPhone } from "../modules/identity/phone-auth.utils.ts";
import { createAdminOpsService } from "../modules/admin-ops/admin-ops.service.ts";
import {
  createCommercePaymentService,
  ensureDefaultCreditPackage,
} from "../modules/commerce-payment/commerce-payment.service.ts";
import {
  createPersistentLoginChallenge,
  findPersistentAuthSessionByToken,
  revokePersistentAuthSession,
  verifyPersistentLoginChallenge,
} from "../modules/identity/persistent-auth.service.ts";
import { CreatorDevApp } from "../modules/project/creator-dev-app.ts";
import {
  createCreatorApplication,
} from "../modules/project/creator-application.service.ts";
import { AuthorizationError, resolveActorContext } from "../modules/organization/actor-context.service.ts";
import { queryOne } from "../modules/shared/db/sql.ts";
import { createDevDb } from "../modules/shared/db/dev-db.ts";
import { createMigratedTestDb } from "../modules/shared/db/test-db.ts";
import { beginOrReplayCommand, IdempotencyConflictError, IdempotencyProcessingError } from "../modules/shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../modules/shared/idempotency/persistent-idempotency.store.ts";
import { createLocalUploadStore } from "../modules/shared/uploads/upload-store.ts";
import { createStorageAdapterFromEnv } from "../modules/storage/storage-adapter.factory.ts";
import { buildSignedObjectUrls, createScopedStorageObject, deleteStorageObjectRecord } from "../modules/storage/storage.service.ts";
import {
  abortUploadSession,
  completeUploadSession,
  createUploadSession,
  findUploadSession,
  runStorageRepairJob,
  type UploadSessionRuntime,
} from "../modules/storage/upload-session.service.ts";
import { createAssetVersionSnapshot } from "../modules/project/asset-version-record.service.ts";
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
import { capabilities } from "../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../packages/contracts/domain/operation-names.ts";

const webRoot = join(process.cwd(), "apps", "web");
const uploadRoot = resolve(process.cwd(), ".local", "creator-uploads");
const episodeEventLogPath = resolve(process.cwd(), ".local", "episode-workbench-events.jsonl");
const vendorRoot = join(process.cwd(), "node_modules");
const devOrganizationId = "10000000-0000-4000-8000-000000000001";
const devWorkspaceId = "20000000-0000-4000-8000-000000000001";
const devPaymentCallbackSecret = "dev-payment-secret";
const devInitialCreditBalance = 10000;
const mockImageSourcePath = "C:\\Users\\yzk\\Desktop\\AI相关\\时停(漫剧)\\废土人.avif";
const mockVideoSourcePath = "C:\\Users\\yzk\\Desktop\\AI相关\\时停(漫剧)\\第二集\\1-7.mp4";
const generationTaskTimeoutMs = 15 * 60 * 1000;
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

interface AuthHttpResponse<T> {
  status: number;
  body: T;
  cookies?: string[];
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
  let body = "";

  for await (const chunk of request) {
    body += String(chunk);
  }

  return body ? JSON.parse(body) : {};
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

function sessionCookie(token: string): string {
  return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax`;
}

function clearSessionCookie(): string {
  return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
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
          ? "资源不存在或无权访问"
          : "没有权限执行该操作，请确认项目成员角色";
    writeJson(response, envelopedError(status, errorCode, message, { reason: error.code }));
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

function normalizeTaskStatus(status: unknown) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "completed" || normalized === "success") {
    return "succeeded";
  }
  if (normalized === "cancel_requested") {
    return "canceled";
  }
  return ["queued", "running", "succeeded", "failed", "canceled"].includes(normalized)
    ? normalized
    : "running";
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
        sourcePath: process.env.MOCK_VIDEO_SOURCE_PATH?.trim() || mockVideoSourcePath,
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
        sourcePath: process.env.MOCK_IMAGE_SOURCE_PATH?.trim() || mockImageSourcePath,
        configuredStorageObjectId: process.env.MOCK_IMAGE_STORAGE_OBJECT_ID?.trim() || null,
        objectNamePrefix: "mock-image",
        cost: Number(process.env.EPISODE_IMAGE_GENERATION_COST ?? 90),
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

  const bytes = await readFile(config.sourcePath);
  const objectName = `episodes/${input.episodeId}/mock/${config.objectNamePrefix}-${input.taskId}.${config.fileExtension}`;
  const storageObject = await createScopedStorageObject(db, {
    organizationId: input.organizationId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    bucket: input.runtime.bucket,
    objectName,
    contentType: config.contentType,
    sizeBytes: bytes.byteLength,
    provider: input.runtime.provider,
    status: "available",
    metadata: {
      episodeId: input.episodeId,
      taskId: input.taskId,
      mockSource: config.mediaKind,
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
      body: bytes,
      contentType: config.contentType,
    });
  } else {
    await writeLocalStorageObject({
      bucket: storageObject.bucket,
      objectKey: storageObject.objectKey,
      bytes,
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

  const result =
    row.asset_version_id && urls
      ? {
          assetId: row.asset_id,
          assetVersionId: row.asset_version_id,
          storageObjectId: row.storage_object_id,
          fileId: row.storage_object_id,
          storageObjectKey: row.storage_object_key,
          mediaKind: kind,
          imageUrl: kind === "image" ? urls.previewUrl : null,
          videoUrl: kind === "video" ? urls.previewUrl : null,
          thumbnailUrl: metadata.thumbnailUrl ?? (kind === "image" ? urls.previewUrl : null),
          coverImageUrl: metadata.coverImageUrl ?? (kind === "image" ? urls.previewUrl : null),
          sourceUrl: urls.sourceUrl,
          downloadUrl: urls.downloadUrl,
          expiresAt: urls.expiresAt,
        }
      : null;

  return {
    taskId: row.task_id,
    workflowId: row.workflow_id,
    kind,
    status: normalizeTaskStatus(row.status),
    workflowStatus: normalizeTaskStatus(row.workflow_status),
    failureCode: row.failure_code,
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
    result,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
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
  const requestSnapshot = {
    kind: input.kind,
    episodeId: input.episodeId,
    targetType: String(input.body.targetType ?? (input.body.shotId ? "storyboard" : "episode")),
    targetId: String(input.body.targetId ?? input.body.shotId ?? input.episodeId),
    prompt: String(input.body.prompt ?? input.body.promptOverride ?? input.body.motionPrompt ?? ""),
    model: String(input.body.model ?? ""),
    parameters: input.body.parameters && typeof input.body.parameters === "object"
      ? input.body.parameters as Record<string, unknown>
      : {},
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
      mockExecutor: true,
    },
    createdByUserId: context.userId,
    tasks: [
      {
        taskType: config.taskType,
        queueName: config.queueName,
        targetEntityType,
        targetEntityId,
        inputSnapshot: {
          ...requestSnapshot,
          cost: config.cost,
          requestedAt: input.now.toISOString(),
          timeoutAt: timeoutAt.toISOString(),
          mockExecutor: true,
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
    amount: config.cost,
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

  await createAssetVersionSnapshot(db, {
    organizationId: context.actor.organizationId,
    projectId: context.project.id,
    assetType: input.kind === "video" ? "shot_video" : "shot_image",
    assetKey: `${input.kind}:${input.episodeId}:${task.id}`,
    createdByUserId: context.userId,
    storageObjectId: storageObject.id,
    storageObjectKey: storageObject.object_key,
    metadata: {
      mimeType: config.contentType,
      width: input.kind === "video" ? 1280 : 1024,
      height: input.kind === "video" ? 720 : 1024,
      label: input.kind === "video" ? "Mock episode video" : "Mock episode image",
      episodeId: input.episodeId,
      taskId: task.id,
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
    amount: config.cost,
    outcome: "consumed",
    taskId: task.id,
    attemptId: claim.attempt.id,
    metadata: {
      episodeId: input.episodeId,
      kind: input.kind,
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
  if (typeof metadata.episodeId === "string" && metadata.episodeId !== input.episodeId) {
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
  return {
    assetId: input.version.assetId,
    assetType: input.version.assetType,
    assetVersionId: input.version.versionId,
    storageObjectId: input.version.storageObjectId,
    fileId: input.version.storageObjectId,
    storageObjectKey: input.version.storageObjectKey,
    contentType: input.version.contentType,
    previewUrl: urls?.previewUrl ?? input.version.metadata.previewUrl ?? null,
    sourceUrl: urls?.sourceUrl ?? input.version.metadata.sourceUrl ?? null,
    downloadUrl: urls?.downloadUrl ?? input.version.metadata.downloadUrl ?? null,
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
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId: String(input.body.assetVersionId ?? input.body.fileId ?? ""),
    storageObjectId: String(input.body.storageObjectId ?? ""),
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
  if (!resolved) {
    return null;
  }
  if (!["character_sheet", "scene_reference", "prop_reference", "shot_image"].includes(resolved.assetVersion.assetType)) {
    return { error: "invalid_media_type" as const };
  }
  if (!resolved.assetVersion.contentType.startsWith("image/")) {
    return { error: "invalid_media_type" as const };
  }
  if (resolved.assetVersion.objectStatus && resolved.assetVersion.objectStatus !== "available") {
    return { error: "storage_object_not_available" as const };
  }
  const file = await signedAssetVersionFragment(db, {
    version: resolved.assetVersion,
    sessionToken: input.authenticated.sessionToken,
    runtime: input.runtime,
    signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    now: input.now,
  });
  return {
    asset: {
      assetId: input.assetId,
      episodeId: input.episodeId,
      fixedImageFileId: resolved.assetVersion.versionId,
      fixedImageStorageObjectId: resolved.assetVersion.storageObjectId,
      fixedImageUrl: file.previewUrl,
      status: "ready",
      isPinned: true,
      updatedAt: input.now.toISOString(),
    },
    file,
  };
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
  const resolved = await resolveEpisodeAssetVersion(db, {
    episodeId: input.episodeId,
    assetVersionId: String(input.body.assetVersionId ?? input.body.fileId ?? ""),
    storageObjectId: String(input.body.storageObjectId ?? ""),
    sessionToken: input.authenticated.sessionToken,
    userId: input.authenticated.user.id,
    capability: capabilities.generationStart,
    now: input.now,
  });
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
      resolved.assetVersion.versionId,
      input.now,
    ],
  );
  if (!shot) {
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
    storyboard: {
      storyboardId: shot.id,
      episodeId: shot.episode_id,
      indexNo: Number(shot.sort_order) + 1,
      sceneAnalysis: shot.description ?? "",
      plotPreview: shot.title ?? "",
      currentImageFileId: shot.current_image_asset_version_id,
      currentImageUrl: input.mediaKind === "image" ? file.previewUrl : null,
      currentVideoFileId: shot.current_video_asset_version_id,
      currentVideoUrl: input.mediaKind === "video" ? file.previewUrl : null,
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

  const normalizedPath =
    pathname === "/" ? "/login.html" : pathname === "/login" ? "/login.html" : pathname;
  let filePath = join(webRoot, normalizedPath.replace(/^\/+/, ""));
  let file: string;
  try {
    file = await readFile(filePath, "utf8");
  } catch (error) {
    const extension = extname(normalizedPath);
    if (extension) {
      throw error;
    }
    filePath = join(webRoot, "app.html");
    file = await readFile(filePath, "utf8");
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
  const filePath = join(vendorRoot, normalizedPath);
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

async function ensureDevWorkspaceAccess(
  db: Awaited<ReturnType<typeof createDevDb>>,
  userId: string,
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

export function createPhoneAuthDevServer(options: {
  db?: Awaited<ReturnType<typeof createDevDb>>;
  repairScheduler?: PhoneAuthDevServerRepairSchedulerOptions;
} = {}): PhoneAuthDevServer {
  const dbPromise = options.db
    ? Promise.resolve(options.db)
    : process.env.NODE_ENV === "test"
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
  const creatorApps = new Map<string, CreatorDevApp>();
  const creatorSqlStates = new Map<
    string,
    { projectId: string | null; scriptId: string | null }
  >();
  const uploadStore = createLocalUploadStore({ rootDir: uploadRoot });
  const storageMode = (process.env.STORAGE_ADAPTER_MODE ?? "dev").trim();
  const storageRegion = (process.env.STORAGE_REGION ?? "ap-shanghai").trim();
  const storageBucket = (
    process.env.STORAGE_BUCKET?.trim() ||
    (storageMode === "dev" ? "creator-dev" : `creator-${storageMode}`)
  );
  const signedUrlExpiresInSeconds = Number(
    process.env.STORAGE_SIGNED_URL_EXPIRES_SECONDS ??
    process.env.CREATOR_SIGNED_URL_EXPIRES_SECONDS ??
    900,
  );
  const storageAdapter = (() => {
    try {
      return createStorageAdapterFromEnv(process.env);
    } catch (error) {
      console.warn(
        `[storage] Falling back to dev adapter. ${error instanceof Error ? error.message : String(error)}`,
      );
      return createStorageAdapterFromEnv({
        ...process.env,
        STORAGE_ADAPTER_MODE: "dev",
      });
    }
  })();
  const storageRuntime: UploadSessionRuntime = {
    mode: storageMode,
    provider: storageMode === "cos" ? "tencent_cos" : storageMode === "s3_compatible" ? "s3_compatible" : "creator-dev",
    bucket: storageBucket,
    region: storageRegion,
    adapter: storageAdapter,
    stsSecretId: process.env.STORAGE_COS_SECRET_ID?.trim() ?? null,
    stsSecretKey: process.env.STORAGE_COS_SECRET_KEY?.trim() ?? null,
    stsDurationSeconds: Number(process.env.STORAGE_COS_STS_DURATION_SECONDS ?? 1800),
    localUploadUrlPath: "/api/storage/upload-sessions",
    localObjectStore: {
      headObject: headLocalStorageObject,
      deleteObject: deleteLocalStorageObject,
    },
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
        const challenge = await createPersistentLoginChallenge(db, {
          phone: body.phone,
          now: new Date(),
        });
        debugChallengeCodes.set(challenge.challengeId, challenge.plainCode);
        return writeJson(response, {
          status: 200,
          body: {
            challengeId: challenge.challengeId,
            maskedPhone: maskCnPhone(challenge.phoneE164),
            expiresAt: challenge.expiresAt.toISOString(),
            retryAfterSeconds: 60,
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

        await ensureDevWorkspaceAccess(db, verified.user.id);

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
        pathname === "/api/billing/payment-callback/mock"
      ) {
        const commercePayment = createCommercePaymentService({
          db,
          workspaceId: devWorkspaceId,
          callbackSecret: devPaymentCallbackSecret,
        });
        const body = (await readJsonBody(request)) as {
          provider: "wechat_pay" | "alipay";
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
        });

        if (request.method === "GET" && pathname === "/api/billing/packages") {
          return writeJson(response, await commercePayment.listCreditPackages());
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
            provider: "wechat_pay" | "alipay";
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
          return writeJson(response, {
            status: 200,
            body: await completeUploadSession(db, {
              actor,
              sessionToken: authenticated.sessionToken,
              uploadSessionId,
              checksum: body.checksum ?? null,
              eTag: body.eTag ?? null,
              now: new Date(),
              runtime: storageRuntime,
              signedUrlExpiresInSeconds,
            }),
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
            project_id: string;
            title: string;
            sequence: number;
            status: string;
          }>(
            db,
            "SELECT id, project_id, title, sequence, status FROM episodes WHERE id = $1",
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
          const detail = normalizeProjectDetailForEpisodeContract(result.body as Record<string, unknown>);
          const project = detail.project as Record<string, unknown>;
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
            }),
          );
        }

        if (
          request.method === "GET" &&
          pathname.startsWith("/api/episodes/") &&
          pathname.endsWith("/assets")
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
          const assetsByType = detail.assetsByType && typeof detail.assetsByType === "object"
            ? detail.assetsByType as Record<string, unknown>
            : {};
          const assetType = url.searchParams.get("assetType");
          const legacyKey = assetType === "role" ? "character" : assetType ?? "";
          const sourceItems = Array.isArray(assetsByType[legacyKey]) ? assetsByType[legacyKey] as unknown[] : [];
          const items = sourceItems.map((asset) => {
            const item = asset && typeof asset === "object" ? asset as Record<string, unknown> : {};
            const latestVersion = item.latestVersion && typeof item.latestVersion === "object"
              ? item.latestVersion as Record<string, unknown>
              : {};
            return {
              assetId: item.id ?? null,
              assetType: assetType ?? legacyKey,
              name: item.label ?? item.assetKey ?? "Untitled Asset",
              description: (latestVersion.metadata as Record<string, unknown> | undefined)?.description ?? item.assetKey ?? "",
              fixedImageFileId: latestVersion.storageObjectId ?? null,
              fixedImageUrl: item.previewUrl ?? latestVersion.previewUrl ?? null,
              voiceId: null,
              sortOrder: 0,
              updatedAt: item.updatedAt ?? latestVersion.createdAt ?? null,
            };
          });
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(response, enveloped(200, paginateItems(items, page, pageSize)));
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
            .map((shot, index) => ({
              storyboardId: shot.id ?? null,
              episodeId,
              indexNo: index + 1,
              sceneAnalysis: shot.sceneAnalysis ?? shot.description ?? "",
              plotPreview: shot.plotPreview ?? shot.title ?? "",
              currentImageFileId: shot.currentImageAssetVersionId ?? null,
              currentImageUrl: shot.previewImageUrl ?? null,
              currentVideoFileId: shot.currentVideoAssetVersionId ?? null,
              currentVideoUrl: shot.previewVideoUrl ?? null,
              imageStatus: shot.imageStatus === "completed" || shot.imageStatus === "ready" ? "succeeded" : shot.imageStatus ?? "draft",
              videoStatus: shot.videoStatus === "completed" || shot.videoStatus === "ready" ? "succeeded" : shot.videoStatus ?? "not_ready",
              assetRefs: Array.isArray(shot.references) ? shot.references : [],
              sortOrder: shot.sortOrder ?? index,
            }));
          const page = parsePositiveInt(url.searchParams.get("page"), 1, 9999);
          const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 10, 50);
          return writeJson(response, enveloped(200, paginateItems(items, page, pageSize)));
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
            return writeJson(response, envelopedError(404, "resource_not_found", "璧勬簮涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎"));
          }
          return writeJson(
            response,
            enveloped(200, {
              models: [
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
                {
                  modelCode: "video_mock_1",
                  modelLabel: "固定视频 Mock",
                  providerGroup: "Mock",
                  pipeline: "mock",
                  supportedModes: ["video"],
                  supportedRatios: ["16:9", "9:16"],
                  supportedQuality: ["720p"],
                  displayBaseCost: 120,
                  disabled: false,
                },
              ],
              presets: [],
              uploadLimits: episodeUploadLimits,
              defaultImageModelCode: "nano_banana_2",
              defaultVideoModelCode: "video_mock_1",
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
              envelopedError(status, result.error, "文件仍被使用或删除失败", "details" in result ? result.details : undefined),
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
                envelopedError(404, "resource_not_found", "资源不存在或无权访问"),
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
