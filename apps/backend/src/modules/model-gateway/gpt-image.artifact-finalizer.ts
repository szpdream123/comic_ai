import { Readable, Transform } from "node:stream";

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
  userId: string;
  projectId: string | null;
  canvasProjectId?: string | null;
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
    assetType?: AssetType;
    assetKey?: string;
    assetMetadata?: Record<string, unknown>;
    label?: string;
    resolveUrls?: (storageObject: StorageObjectRecord) => Promise<{
      previewUrl: string;
      sourceUrl: string;
      downloadUrl: string;
    }>;
  },
) {
  const mediaKind = input.artifact.mediaType === "audio" ? "audio" : "image";
  const maxArtifactBytes = mediaKind === "audio" ? 100 * 1024 * 1024 : undefined;
  const artifactMetadata = {
    episodeId: readString(input.snapshot.episodeId) ?? null,
    taskId: input.task.taskId,
    attemptId: input.task.attemptId,
    mediaType: mediaKind,
    provider: "model-gateway",
    externalRequestId: input.externalRequestId,
  };
  const extension = readString(input.artifact.fileExtension) || (mediaKind === "audio" ? "mp3" : "png");
  const contentType = readString(input.artifact.mimeType) || (mediaKind === "audio" ? "audio/mpeg" : "image/png");
  const artifactFolder = mediaKind === "audio" ? "audio-generation" : "gpt-image-2";
  const artifactPrefix = mediaKind === "audio" ? "audio" : "gpt-image";
  const objectName = `episodes/${readString(input.snapshot.episodeId) || input.task.taskId}/${artifactFolder}/${artifactPrefix}-${input.task.taskId}.${extension}`;
  let pendingStorageObjectId: string | null = null;
  let pendingStorageObjectKey: string | null = null;

  try {
    const artifactFetchImpl = await resolveArtifactFetch(input);
    const bytes = decodeImageArtifactBytes(input.artifact);
    const uploaded = bytes
      ? await uploadProviderArtifactBytesToStorage(db, {
          bytes,
          contentType,
          objectName,
          userId: input.task.userId,
          projectId: input.task.projectId,
          canvasProjectId: input.task.canvasProjectId ?? null,
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
            userId: input.task.userId,
            projectId: input.task.projectId,
            canvasProjectId: input.task.canvasProjectId ?? null,
            runtime: input.runtime,
            metadata: artifactMetadata,
            env: input.env,
            fetchImpl: artifactFetchImpl,
            createdByUserId: input.task.createdByUserId,
            maxBytes: maxArtifactBytes,
            requiredContentTypePrefix: mediaKind === "audio" ? "audio/" : undefined,
            fetchTimeoutMs: readArtifactDownloadTimeoutMs(input.env, mediaKind),
            now: input.now,
          })
        : null;
    if (!uploaded) {
      throw Object.assign(new Error("gpt_image_artifact_source_missing"), {
        failureCode: "provider_output_download_failed",
      });
    }
    const persistedContentType = mediaKind === "audio" && uploaded.contentType === "application/octet-stream"
      ? contentType
      : uploaded.contentType;
    pendingStorageObjectId = uploaded.storageObject.id;
    pendingStorageObjectKey = uploaded.storageObject.objectKey;

    const available = await markStorageObjectAvailable(db, {
      storageObjectId: uploaded.storageObject.id,
      contentType: persistedContentType,
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
    await assertStoredArtifactAvailable(input.runtime, {
      bucket: available.bucket,
      objectKey: available.objectKey,
      sizeBytes: available.sizeBytes,
    });

    const urls = input.resolveUrls
      ? await input.resolveUrls(available)
      : buildDefaultArtifactUrls(input.runtime, available);
    return {
      assetId: null,
      assetVersionId: null,
      storageObjectId: available.id,
      storageObjectKey: available.objectKey,
      mediaKind,
      mimeType: persistedContentType,
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

async function resolveArtifactFetch(input: {
  snapshot: Record<string, unknown>;
  artifact: MediaGenerationArtifact;
  db: SqlDatabase;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}) {
  return input.fetchImpl;
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
    userId: string;
    projectId: string | null;
    canvasProjectId?: string | null;
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
  const { retryAttempts, retryDelayMs, uploadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  const storageObject = await createScopedStorageObject(db, {
    userId: input.userId,
    projectId: input.projectId,
    canvasProjectId: input.canvasProjectId ?? null,
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
        contentLength: input.bytes.byteLength,
        timeoutMs: uploadTimeoutMs,
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
    userId: string;
    projectId: string | null;
    canvasProjectId?: string | null;
    runtime: UploadSessionRuntime;
    metadata: Record<string, unknown>;
    env: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    createdByUserId?: string | null;
    maxBytes?: number;
    requiredContentTypePrefix?: string;
    fetchTimeoutMs?: number;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number | null;
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs, uploadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetchImpl(input.artifactUrl, input.fetchTimeoutMs
        ? { signal: AbortSignal.timeout(input.fetchTimeoutMs) }
        : undefined);
      if (!response.ok || !response.body) {
        throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
          failureCode: "provider_output_download_failed",
          storageObjectId: storageObject?.id,
        });
      }
      contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
      knownSizeBytes = parseContentLength(response.headers.get("content-length")) ?? knownSizeBytes;
      assertProviderArtifactDownloadMetadata({
        contentType,
        contentLength: knownSizeBytes,
        maxBytes: input.maxBytes,
        requiredContentTypePrefix: input.requiredContentTypePrefix,
      });

      if (!storageObject) {
        storageObject = await createScopedStorageObject(db, {
          userId: input.userId,
          projectId: input.projectId,
          canvasProjectId: input.canvasProjectId ?? null,
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

      const bytes = await readProviderArtifactBytes(response.body, input.maxBytes);
      knownSizeBytes = bytes.byteLength;
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: bytes,
        contentType,
        contentLength: knownSizeBytes,
        timeoutMs: uploadTimeoutMs,
      });
      return {
        storageObject,
        contentType,
        sizeBytes: knownSizeBytes,
        uploadResult,
      };
    } catch (error) {
      const failureCode = !response || readErrorFailureCode(error) === "provider_output_download_failed"
        ? "provider_output_download_failed"
        : "provider_output_upload_failed";
      if (attempt >= retryAttempts) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
          failureCode,
          storageObjectId: storageObject?.id,
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

async function readProviderArtifactBytes(body: ReadableStream<Uint8Array>, maxBytes?: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let sizeBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      sizeBytes += value.byteLength;
      if (maxBytes !== undefined && sizeBytes > maxBytes) {
        throw Object.assign(new Error("provider_artifact_too_large"), {
          failureCode: "provider_output_download_failed",
          maxBytes,
          sizeBytes,
        });
      }
      chunks.push(value);
    }
  } catch (error) {
    const downloadError = error instanceof Error ? error : new Error(String(error));
    // Abort the underlying provider response before releasing the reader. A
    // timed-out fetch can otherwise emit a late stream error outside the
    // BullMQ processor and terminate the worker process.
    try {
      await reader.cancel(downloadError);
    } catch {
      // The stream may already be errored; the original download error is the
      // failure that the queue retry path must observe.
    }
    Object.assign(downloadError, {
      failureCode: readErrorFailureCode(downloadError) ?? "provider_output_download_failed",
    });
    throw downloadError;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(sizeBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function createCountingUploadStream(body: ReadableStream<Uint8Array>, maxBytes?: number) {
  let sizeBytes = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      if (maxBytes !== undefined && sizeBytes > maxBytes) {
        callback(Object.assign(new Error("provider_artifact_too_large"), {
          failureCode: "provider_output_download_failed",
          maxBytes,
          sizeBytes,
        }));
        return;
      }
      callback(null, chunk);
    },
  });
  return {
    stream: Readable.fromWeb(body as never).pipe(counter),
    getSizeBytes: () => sizeBytes,
  };
}

function assertProviderArtifactDownloadMetadata(input: {
  contentType: string;
  contentLength: number | null;
  maxBytes?: number;
  requiredContentTypePrefix?: string;
}) {
  if (
    input.requiredContentTypePrefix &&
    input.contentType !== "application/octet-stream" &&
    !input.contentType.toLowerCase().startsWith(input.requiredContentTypePrefix.toLowerCase())
  ) {
    throw Object.assign(new Error("audio_artifact_mime_invalid"), {
      failureCode: "provider_output_download_failed",
    });
  }
  if (input.maxBytes !== undefined && input.contentLength !== null && input.contentLength > input.maxBytes) {
    throw Object.assign(new Error("provider_artifact_too_large"), {
      failureCode: "provider_output_download_failed",
      maxBytes: input.maxBytes,
      sizeBytes: input.contentLength,
    });
  }
}

function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS, 10, 10),
    retryDelayMs: parseNonNegativeInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS, 3000, 60_000),
    uploadTimeoutMs: parsePositiveInteger(
      env.GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS,
      30 * 60_000,
      30 * 60_000,
    ),
  };
}

function readArtifactDownloadTimeoutMs(env: NodeJS.ProcessEnv, mediaKind: "audio" | "image") {
  return mediaKind === "audio"
    ? parsePositiveInteger(env.AUDIO_GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS, 120_000, 600_000)
    : parsePositiveInteger(env.GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS, 5 * 60_000, 10 * 60_000);
}

function parseContentLength(value: string | null) {
  if (value == null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

async function assertStoredArtifactAvailable(
  runtime: UploadSessionRuntime,
  input: {
    bucket: string;
    objectKey: string;
    sizeBytes: number | null;
  },
) {
  if (typeof runtime.adapter.headObject !== "function") {
    if (Number.isFinite(input.sizeBytes) && Number(input.sizeBytes) > 0) {
      return;
    }
    throw Object.assign(new Error("gpt_image_storage_object_empty"), {
      failureCode: "provider_output_upload_failed",
      storageObjectKey: input.objectKey,
    });
  }
  const remote = await runtime.adapter.headObject({
    bucket: input.bucket,
    objectKey: input.objectKey,
  });
  const remoteSize = Number(remote.contentLength ?? 0);
  if (!remote.exists || !Number.isFinite(remoteSize) || remoteSize <= 0) {
    throw Object.assign(new Error("gpt_image_storage_object_empty"), {
      failureCode: "provider_output_upload_failed",
      storageObjectKey: input.objectKey,
    });
  }
}

export const __gptImageArtifactFinalizerTestUtils = {
  parseContentLength,
  assertStoredArtifactAvailable,
  assertProviderArtifactDownloadMetadata,
  createCountingUploadStream,
  readProviderArtifactBytes,
  readArtifactDownloadTimeoutMs,
  readGenerationArtifactUploadConfig,
};

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
