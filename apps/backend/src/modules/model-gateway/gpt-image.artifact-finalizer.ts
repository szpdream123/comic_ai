import { Readable, Transform } from "node:stream";

import { createAssetVersionSnapshot } from "../project/asset-version-record.service.ts";
import type { AssetType } from "../project/asset.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  createScopedStorageObject,
  markStorageObjectAvailable,
  markStorageObjectFailed,
  type StorageObjectRecord,
} from "../storage/storage.service.ts";
import type { UploadSessionRuntime } from "../storage/upload-session.service.ts";
import type { MediaGenerationArtifact } from "./provider-adapter.contract.ts";

export interface GptImageArtifactTaskContext {
  organizationId: string;
  workspaceId: string | null;
  projectId: string;
  taskId: string;
  attemptId: string | null;
  createdByUserId: string | null;
}

export async function persistGptImageArtifact(
  db: SqlDatabase,
  input: {
    task: GptImageArtifactTaskContext;
    snapshot: Record<string, unknown>;
    artifact: MediaGenerationArtifact;
    externalRequestId: string | null;
    runtime: UploadSessionRuntime;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    now: Date;
    assetType: AssetType;
    assetKey: string;
    assetMetadata?: Record<string, unknown>;
    label?: string;
    resolveUrls?: (storageObject: StorageObjectRecord) => Promise<{
      previewUrl: string;
      sourceUrl: string;
      downloadUrl: string;
    }>;
  },
) {
  const artifactMetadata = {
    episodeId: readString(input.snapshot.episodeId) ?? null,
    taskId: input.task.taskId,
    provider: "gpt-image-2",
    externalRequestId: input.externalRequestId,
  };
  const extension = readString(input.artifact.fileExtension) || "png";
  const contentType = readString(input.artifact.mimeType) || "image/png";
  const objectName = `episodes/${readString(input.snapshot.episodeId) || input.task.taskId}/gpt-image-2/gpt-image-${input.task.taskId}.${extension}`;
  let pendingStorageObjectId: string | null = null;
  let pendingStorageObjectKey: string | null = null;

  try {
    const bytes = decodeImageArtifactBytes(input.artifact);
    const uploaded = bytes
      ? await uploadProviderArtifactBytesToStorage(db, {
          bytes,
          contentType,
          objectName,
          organizationId: input.task.organizationId,
          workspaceId: input.task.workspaceId,
          projectId: input.task.projectId,
          runtime: input.runtime,
          metadata: artifactMetadata,
          env: input.env,
          createdByUserId: input.task.createdByUserId,
          now: input.now,
        })
      : input.artifact.url
        ? await uploadProviderArtifactUrlToStorage(db, {
            artifactUrl: input.artifact.url,
            objectName,
            organizationId: input.task.organizationId,
            workspaceId: input.task.workspaceId,
            projectId: input.task.projectId,
            runtime: input.runtime,
            metadata: artifactMetadata,
            env: input.env,
            fetchImpl: input.fetchImpl,
            createdByUserId: input.task.createdByUserId,
            now: input.now,
          })
        : null;
    if (!uploaded) {
      throw Object.assign(new Error("gpt_image_artifact_source_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }
    pendingStorageObjectId = uploaded.storageObject.id;
    pendingStorageObjectKey = uploaded.storageObject.objectKey;

    const available = await markStorageObjectAvailable(db, {
      storageObjectId: uploaded.storageObject.id,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      eTag: uploaded.uploadResult?.eTag ?? null,
      versionId: uploaded.uploadResult?.versionId ?? null,
      metadata: artifactMetadata,
      now: input.now,
    });
    if (!available) {
      throw Object.assign(new Error("gpt_image_storage_object_missing_after_upload"), {
        failureCode: "provider_output_persist_failed",
        storageObjectKey: uploaded.storageObject.objectKey,
      });
    }

    const urls = input.resolveUrls
      ? await input.resolveUrls(available)
      : buildDefaultArtifactUrls(input.runtime, available);
    const created = await createAssetVersionSnapshot(db, {
      organizationId: input.task.organizationId,
      projectId: input.task.projectId,
      assetType: input.assetType,
      assetKey: input.assetKey,
      createdByUserId: input.task.createdByUserId ?? "",
      storageObjectId: available.id,
      storageObjectKey: available.objectKey,
      metadata: {
        ...(input.assetMetadata ?? {}),
        mimeType: uploaded.contentType,
        label: input.label ?? "GPT Image 2 episode image",
        episodeId: readString(input.snapshot.episodeId) ?? null,
        taskId: input.task.taskId,
        targetType: readString(input.snapshot.targetType) ?? "episode",
        targetId: readString(input.snapshot.targetId) ?? readString(input.snapshot.episodeId) ?? null,
        previewUrl: urls.previewUrl,
        sourceUrl: urls.sourceUrl,
        downloadUrl: urls.downloadUrl,
        provider: "gpt-image-2",
        externalRequestId: input.externalRequestId,
      },
      sourceTaskId: input.task.taskId,
      sourceAttemptId: input.task.attemptId,
      now: input.now,
    });
    return {
      assetId: created.asset.id,
      assetVersionId: created.version.id,
      storageObjectId: available.id,
      storageObjectKey: available.objectKey,
      mediaKind: "image",
      mimeType: uploaded.contentType,
      url: urls.previewUrl,
      previewUrl: urls.previewUrl,
      sourceUrl: urls.sourceUrl,
      downloadUrl: urls.downloadUrl,
    };
  } catch (error) {
    const storageObjectId = pendingStorageObjectId ?? readErrorStorageObjectId(error);
    let failureCode = readErrorFailureCode(error);
    if (pendingStorageObjectKey && failureCode !== "provider_output_download_failed" && failureCode !== "provider_output_upload_failed") {
      Object.assign(error as object, {
        failureCode: "provider_output_persist_failed",
        storageObjectKey: pendingStorageObjectKey,
      });
      failureCode = "provider_output_persist_failed";
    }
    if (storageObjectId && failureCode !== "provider_output_persist_failed") {
      await markStorageObjectFailed(db, {
        storageObjectId,
        status: "failed",
        now: input.now,
      });
    }
    throw error;
  }
}

export function serializeGptImageArtifactForProviderResponse(artifact: MediaGenerationArtifact) {
  return {
    mediaType: artifact.mediaType,
    mimeType: readString(artifact.mimeType) ?? null,
    fileExtension: readString(artifact.fileExtension) ?? null,
    url: readString(artifact.url) ?? null,
    b64Json: readString(artifact.b64Json) ?? null,
  };
}

export function parseGptImageArtifactFromProviderResponse(
  providerResponse: Record<string, unknown>,
): MediaGenerationArtifact | null {
  const artifact = readObject(providerResponse.artifact);
  if (!artifact || readString(artifact.mediaType) !== "image") {
    return null;
  }
  return {
    mediaType: "image",
    mimeType: readString(artifact.mimeType) ?? null,
    fileExtension: readString(artifact.fileExtension) ?? null,
    url: readString(artifact.url),
    b64Json: readString(artifact.b64Json),
  };
}

function buildDefaultArtifactUrls(runtime: UploadSessionRuntime, object: StorageObjectRecord) {
  const publicBaseUrl =
    runtime.publicBaseUrl?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/g, "") ||
    "";
  const platformUrl = publicBaseUrl
    ? `${publicBaseUrl}/${object.objectKey}`
    : object.bucket && runtime.region
      ? `https://${object.bucket}.cos.${runtime.region}.myqcloud.com/${object.objectKey}`
      : object.objectKey;
  return {
    previewUrl: platformUrl,
    sourceUrl: platformUrl,
    downloadUrl: platformUrl,
  };
}

function decodeImageArtifactBytes(artifact: MediaGenerationArtifact) {
  if (artifact.b64Json && artifact.b64Json.trim()) {
    return new Uint8Array(Buffer.from(artifact.b64Json, "base64"));
  }
  return null;
}

async function uploadProviderArtifactBytesToStorage(
  db: SqlDatabase,
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
  uploadResult?: { eTag?: string | null; versionId?: string | null };
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
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: input.bytes,
        contentType: input.contentType,
      });
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

async function uploadProviderArtifactUrlToStorage(
  db: SqlDatabase,
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
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs } = readGenerationArtifactUploadConfig(input.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const response = await fetchImpl(input.artifactUrl);
    if (!response.ok || !response.body) {
      throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
        failureCode: "provider_output_download_failed",
        storageObjectId: storageObject?.id,
      });
    }
    contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
    knownSizeBytes = parseContentLength(response.headers.get("content-length")) ?? knownSizeBytes;

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

    const counted = createCountingUploadStream(response.body);
    try {
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: counted.stream,
        contentType,
      });
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

function createCountingUploadStream(body: ReadableStream<Uint8Array>) {
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      callback(null, chunk);
    },
  });
  return {
    stream: Readable.fromWeb(body as never).pipe(counter),
    getSizeBytes: () => sizeBytes,
  };
}

function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS, 3, 10),
    retryDelayMs: parseNonNegativeInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS, 1000, 60_000),
  };
}

function parseContentLength(value: string | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function delay(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function readObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readErrorStorageObjectId(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { storageObjectId?: unknown }).storageObjectId === "string"
    ? String((error as { storageObjectId: string }).storageObjectId)
    : undefined;
}

function readErrorFailureCode(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { failureCode?: unknown }).failureCode === "string"
    ? String((error as { failureCode: string }).failureCode)
    : undefined;
}

function parsePositiveInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseNonNegativeInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}
