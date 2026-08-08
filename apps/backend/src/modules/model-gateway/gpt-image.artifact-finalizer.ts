import { Readable, Transform } from "node:stream";
import { UnrecoverableError } from "bullmq";

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
import { fetchProviderArtifactSafely } from "./provider-artifact-url-safety.ts";
import { classifyGptImageArtifactRecoveryFailure } from "./gpt-image-artifact-recovery.policy.ts";

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
    recoveryDeadlineAt?: Date | null;
  },
) {
  const mediaKind = input.artifact.mediaType === "audio" ? "audio" : "image";
  const artifactValidation = readArtifactValidationConfig(mediaKind);
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
    const bytes = decodeProviderArtifactBytes(input.artifact, {
      contentType,
      mediaKind,
      maxBytes: artifactValidation.maxBytes,
      requiredContentTypePrefix: artifactValidation.requiredContentTypePrefix,
    });
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
          mediaKind,
          createdByUserId: input.task.createdByUserId,
          recoveryDeadlineAt: input.recoveryDeadlineAt,
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
            maxBytes: artifactValidation.maxBytes,
            requiredContentTypePrefix: artifactValidation.requiredContentTypePrefix,
            invalidMimeMessage: mediaKind === "audio"
              ? "audio_artifact_mime_invalid"
              : "provider_artifact_mime_invalid",
            mediaKind,
            fetchTimeoutMs: readArtifactDownloadTimeoutMs(input.env, mediaKind),
            recoveryDeadlineAt: input.recoveryDeadlineAt,
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
      recoveryDeadlineAt: input.recoveryDeadlineAt,
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
    throw mediaKind === "image" ? toUnrecoverableImageArtifactError(error) : error;
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

function decodeProviderArtifactBytes(
  artifact: MediaGenerationArtifact,
  input: {
    contentType: string;
    mediaKind: "audio" | "image";
    maxBytes: number;
    requiredContentTypePrefix: string;
  },
) {
  if (artifact.b64Json && hasNonWhitespace(artifact.b64Json)) {
    if (input.mediaKind === "audio") {
      return new Uint8Array(Buffer.from(artifact.b64Json, "base64"));
    }
    const estimatedBytes = validateAndEstimateBase64DecodedByteLength(artifact.b64Json);
    assertProviderArtifactDownloadMetadata({
      contentType: input.contentType,
      contentLength: estimatedBytes,
      maxBytes: input.maxBytes,
      requiredContentTypePrefix: input.requiredContentTypePrefix,
      invalidMimeMessage: input.mediaKind === "audio"
        ? "audio_artifact_mime_invalid"
        : "provider_artifact_mime_invalid",
    });
    const bytes = new Uint8Array(Buffer.from(artifact.b64Json, "base64"));
    if (bytes.byteLength > input.maxBytes) {
      throw createArtifactTooLargeError(input.maxBytes, bytes.byteLength);
    }
    assertDecodedImageContent(bytes, input.contentType);
    return bytes;
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
    mediaKind: "audio" | "image";
    createdByUserId?: string | null;
    recoveryDeadlineAt?: Date | null;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number;
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs, uploadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  assertRecoveryTimeRemaining(input.recoveryDeadlineAt);
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
      const attemptTimeoutMs = resolveRecoveryAttemptTimeoutMs(uploadTimeoutMs, input.recoveryDeadlineAt);
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: input.bytes,
        contentType: input.contentType,
        contentLength: input.bytes.byteLength,
        timeoutMs: attemptTimeoutMs,
      });
      return {
        storageObject,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        uploadResult,
      };
    } catch (error) {
      const transferError = annotateArtifactTransferError(
        error,
        "provider_output_upload_failed",
        storageObject.id,
      );
      if (
        input.mediaKind === "image"
        && classifyGptImageArtifactRecoveryFailure(transferError).kind === "permanent"
      ) {
        throw transferError;
      }
      if (attempt >= retryAttempts) {
        throw transferError;
      }
      try {
        await delayWithinRecoveryWindow(retryDelayMs, input.recoveryDeadlineAt);
      } catch (deadlineError) {
        throw annotateArtifactTransferError(
          deadlineError,
          "provider_output_upload_failed",
          storageObject.id,
        );
      }
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
    invalidMimeMessage?: string;
    mediaKind: "audio" | "image";
    fetchTimeoutMs?: number;
    recoveryDeadlineAt?: Date | null;
    now: Date;
  },
): Promise<{
  storageObject: StorageObjectRecord;
  contentType: string;
  sizeBytes: number | null;
  uploadResult?: { eTag?: string | null; versionId?: string | null };
}> {
  const { retryAttempts, retryDelayMs, uploadTimeoutMs } = readGenerationArtifactUploadConfig(input.env);
  let storageObject: StorageObjectRecord | null = null;
  let contentType = "application/octet-stream";
  let knownSizeBytes: number | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    let response: Response | null = null;
    try {
      const fetchTimeoutMs = resolveRecoveryAttemptTimeoutMs(
        input.fetchTimeoutMs ?? 5 * 60_000,
        input.recoveryDeadlineAt,
      );
      response = await fetchProviderArtifactSafely(input.artifactUrl, fetchTimeoutMs
        ? { signal: AbortSignal.timeout(fetchTimeoutMs) }
        : undefined, input.fetchImpl);
      if (!response.ok || !response.body) {
        throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
          failureCode: "provider_output_download_failed",
          storageObjectId: storageObject?.id,
          httpStatus: response.status,
        });
      }
      contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || contentType;
      knownSizeBytes = parseContentLength(response.headers.get("content-length")) ?? knownSizeBytes;
      assertProviderArtifactDownloadMetadata({
        contentType,
        contentLength: knownSizeBytes,
        maxBytes: input.maxBytes,
        requiredContentTypePrefix: input.requiredContentTypePrefix,
        invalidMimeMessage: input.invalidMimeMessage,
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
      if (input.mediaKind === "image") {
        assertDecodedImageContent(bytes, contentType);
      }
      const attemptTimeoutMs = resolveRecoveryAttemptTimeoutMs(uploadTimeoutMs, input.recoveryDeadlineAt);
      if (typeof input.runtime.adapter.putObject !== "function") {
        throw new Error("storage_put_object_required");
      }
      const uploadResult = await input.runtime.adapter.putObject({
        bucket: storageObject.bucket,
        objectKey: storageObject.objectKey,
        body: bytes,
        contentType,
        contentLength: knownSizeBytes,
        timeoutMs: attemptTimeoutMs,
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
      const transferError = annotateArtifactTransferError(error, failureCode, storageObject?.id);
      if (
        input.mediaKind === "image"
        && classifyGptImageArtifactRecoveryFailure(transferError).kind === "permanent"
      ) {
        throw transferError;
      }
      if (attempt >= retryAttempts) {
        throw transferError;
      }
      try {
        await delayWithinRecoveryWindow(retryDelayMs, input.recoveryDeadlineAt);
      } catch (deadlineError) {
        throw annotateArtifactTransferError(deadlineError, failureCode, storageObject?.id);
      }
    } finally {
      await response?.body?.cancel().catch(() => undefined);
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
  invalidMimeMessage?: string;
}) {
  if (
    input.requiredContentTypePrefix &&
    input.contentType !== "application/octet-stream" &&
    !input.contentType.toLowerCase().startsWith(input.requiredContentTypePrefix.toLowerCase())
  ) {
    throw Object.assign(new Error(input.invalidMimeMessage ?? "audio_artifact_mime_invalid"), {
      failureCode: "provider_output_download_failed",
    });
  }
  if (input.maxBytes !== undefined && input.contentLength !== null && input.contentLength > input.maxBytes) {
    throw createArtifactTooLargeError(input.maxBytes, input.contentLength);
  }
}

function createArtifactTooLargeError(maxBytes: number, sizeBytes: number) {
  return Object.assign(new Error("provider_artifact_too_large"), {
    failureCode: "provider_output_download_failed",
    maxBytes,
    sizeBytes,
  });
}

function annotateArtifactTransferError(
  error: unknown,
  failureCode: string,
  storageObjectId?: string | null,
) {
  return Object.assign(error instanceof Error ? error : new Error(String(error)), {
    failureCode,
    storageObjectId: storageObjectId ?? undefined,
  });
}

function hasNonWhitespace(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (!/\s/.test(value[index] ?? "")) return true;
  }
  return false;
}

function validateAndEstimateBase64DecodedByteLength(value: string) {
  let significantLength = 0;
  let padding = 0;
  let sawPadding = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (/\s/.test(character)) continue;
    const isAlphabet = /[A-Za-z0-9+/_-]/.test(character);
    if (character !== "=" && (!isAlphabet || sawPadding)) {
      throw createInvalidBase64Error();
    }
    significantLength += 1;
    if (character === "=") {
      sawPadding = true;
      padding += 1;
    }
  }
  if (
    significantLength === 0
    || significantLength % 4 === 1
    || padding > 2
    || (padding > 0 && significantLength % 4 !== 0)
  ) {
    throw createInvalidBase64Error();
  }
  return Math.max(0, Math.floor(significantLength * 3 / 4) - Math.min(2, padding));
}

function createInvalidBase64Error() {
  return Object.assign(new Error("provider_artifact_base64_invalid"), {
    failureCode: "provider_output_download_failed",
  });
}

function assertDecodedImageContent(bytes: Uint8Array, contentType: string) {
  const detected = detectImageContentType(bytes);
  const declared = contentType.toLowerCase() === "image/jpg" ? "image/jpeg" : contentType.toLowerCase();
  if (!detected || (declared !== "application/octet-stream" && declared !== detected)) {
    throw Object.assign(new Error("provider_artifact_content_invalid"), {
      failureCode: "provider_output_download_failed",
    });
  }
}

function detectImageContentType(bytes: Uint8Array) {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6) {
    const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) return "image/webp";
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp"
    && ["avif", "avis"].includes(Buffer.from(bytes.subarray(8, 12)).toString("ascii"))
  ) return "image/avif";
  return null;
}

function resolveRecoveryAttemptTimeoutMs(
  configuredTimeoutMs: number,
  recoveryDeadlineAt?: Date | null,
  now = new Date(),
) {
  if (!recoveryDeadlineAt) return configuredTimeoutMs;
  const remainingMs = recoveryDeadlineAt.getTime() - now.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    throw Object.assign(new Error("artifact_recovery_deadline_reached"), {
      failureCode: "provider_output_upload_failed",
    });
  }
  return Math.max(1, Math.min(configuredTimeoutMs, remainingMs));
}

function assertRecoveryTimeRemaining(recoveryDeadlineAt?: Date | null) {
  resolveRecoveryAttemptTimeoutMs(1, recoveryDeadlineAt);
}

async function delayWithinRecoveryWindow(delayMs: number, recoveryDeadlineAt?: Date | null) {
  const boundedDelayMs = resolveRecoveryAttemptTimeoutMs(delayMs || 1, recoveryDeadlineAt);
  await delay(delayMs > 0 ? boundedDelayMs : 0);
  assertRecoveryTimeRemaining(recoveryDeadlineAt);
}

function toUnrecoverableImageArtifactError(error: unknown) {
  if (error instanceof UnrecoverableError) return error;
  if (classifyGptImageArtifactRecoveryFailure(error).kind !== "permanent") return error;
  const source = error instanceof Error ? error : new Error(String(error));
  return Object.assign(new UnrecoverableError(source.message), {
    cause: source,
    failureCode: readErrorFailureCode(source),
    httpStatus: readErrorHttpStatus(source),
    storageObjectId: readErrorStorageObjectId(source),
    storageObjectKey: readErrorStorageObjectKey(source),
  });
}

function readGenerationArtifactUploadConfig(env: NodeJS.ProcessEnv) {
  return {
    retryAttempts: parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_ATTEMPTS, 10, 10),
    retryDelayMs: parseNonNegativeInteger(env.GENERATION_ARTIFACT_UPLOAD_RETRY_DELAY_MS, 3000, 60_000),
    uploadTimeoutMs: parsePositiveInteger(
      env.GENERATION_IMAGE_ARTIFACT_UPLOAD_TIMEOUT_MS,
      parsePositiveInteger(env.GENERATION_ARTIFACT_UPLOAD_TIMEOUT_MS, 30 * 60_000, 30 * 60_000),
      30 * 60_000,
    ),
  };
}

function readArtifactDownloadTimeoutMs(env: NodeJS.ProcessEnv, mediaKind: "audio" | "image") {
  return mediaKind === "audio"
    ? parsePositiveInteger(env.AUDIO_GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS, 120_000, 600_000)
    : parsePositiveInteger(env.GENERATION_ARTIFACT_DOWNLOAD_TIMEOUT_MS, 5 * 60_000, 10 * 60_000);
}

function readArtifactValidationConfig(mediaKind: "audio" | "image") {
  return mediaKind === "audio"
    ? {
        maxBytes: 100 * 1024 * 1024,
        requiredContentTypePrefix: "audio/",
      }
    : {
        maxBytes: 64 * 1024 * 1024,
        requiredContentTypePrefix: "image/",
      };
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
    recoveryDeadlineAt?: Date | null;
  },
) {
  assertRecoveryTimeRemaining(input.recoveryDeadlineAt);
  if (typeof runtime.adapter.headObject !== "function") {
    if (Number.isFinite(input.sizeBytes) && Number(input.sizeBytes) > 0) {
      return;
    }
    throw Object.assign(new Error("gpt_image_storage_object_empty"), {
      failureCode: "provider_output_upload_failed",
      storageObjectKey: input.objectKey,
    });
  }
  const remote = await runWithinRecoveryDeadline(
    () => runtime.adapter.headObject!({
      bucket: input.bucket,
      objectKey: input.objectKey,
    }),
    input.recoveryDeadlineAt,
  );
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
  readArtifactValidationConfig,
  readGenerationArtifactUploadConfig,
  decodeProviderArtifactBytes,
  resolveRecoveryAttemptTimeoutMs,
  toUnrecoverableImageArtifactError,
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

async function runWithinRecoveryDeadline<T>(operation: () => Promise<T>, recoveryDeadlineAt?: Date | null) {
  if (!recoveryDeadlineAt) return operation();
  const timeoutMs = resolveRecoveryAttemptTimeoutMs(2_147_483_647, recoveryDeadlineAt);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error("artifact_recovery_deadline_reached"), {
          failureCode: "provider_output_upload_failed",
        })), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function readErrorStorageObjectKey(error: unknown): string | undefined {
  return error && typeof error === "object" && typeof (error as { storageObjectKey?: unknown }).storageObjectKey === "string"
    ? String((error as { storageObjectKey: string }).storageObjectKey)
    : undefined;
}

function readErrorHttpStatus(error: unknown): number | undefined {
  const value = error && typeof error === "object" ? Number((error as { httpStatus?: unknown }).httpStatus) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
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
