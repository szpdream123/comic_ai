import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Readable } from "node:stream";

import type { StorageAdapter } from "./storage.service.ts";

export class S3CompatibleStorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly uploadTimeoutMs: number;

  constructor(input: {
    endpoint?: string | null;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
    uploadTimeoutMs?: number | null;
    requestTimeoutMs?: number | null;
  }) {
    this.uploadTimeoutMs = normalizeTimeoutMs(input.uploadTimeoutMs, 60_000);
    const requestTimeoutMs = normalizeTimeoutMs(input.requestTimeoutMs, this.uploadTimeoutMs);
    this.client = new S3Client({
      endpoint: input.endpoint ?? undefined,
      region: input.region,
      forcePathStyle: Boolean(input.forcePathStyle),
      requestHandler: new NodeHttpHandler({
        connectionTimeout: Math.min(requestTimeoutMs, 10_000),
        requestTimeout: requestTimeoutMs,
      }),
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
    });
  }

  async createSignedReadUrl(input: {
    bucket: string;
    objectKey: string;
    expiresAt: Date;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresIn = Math.max(
      1,
      Math.round((input.expiresAt.getTime() - Date.now()) / 1000),
    );
    let url: string;
    try {
      url = await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
        { expiresIn },
      );
    } catch (error) {
      console.error("[storage][s3-compatible] createSignedReadUrl failed", {
        bucket: input.bucket,
        objectKey: input.objectKey,
        expiresAt: input.expiresAt.toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return { url, expiresAt: input.expiresAt };
  }

  async putObject(input: {
    bucket: string;
    objectKey: string;
    body: Uint8Array | ReadableStream<Uint8Array> | NodeJS.ReadableStream;
    contentType?: string | null;
    contentLength?: number | null;
    timeoutMs?: number | null;
  }) {
    const timeoutMs = normalizeTimeoutMs(input.timeoutMs, this.uploadTimeoutMs);
    let result;
    try {
      const body = resolveUploadBody(input.body, input.contentLength);
      if (body.contentLength === null && !(body.value instanceof Uint8Array)) {
        const upload = new Upload({
          client: this.client,
          params: {
            Bucket: input.bucket,
            Key: input.objectKey,
            Body: body.value as never,
            ContentType: input.contentType ?? undefined,
          },
          queueSize: 1,
          partSize: 5 * 1024 * 1024,
          leavePartsOnError: false,
        });
        result = await withTimeout(
          upload.done(),
          timeoutMs,
          "storage_put_object_timeout",
          () => upload.abort(),
        );
      } else {
        result = await withTimeout(
          this.client.send(
            new PutObjectCommand({
              Bucket: input.bucket,
              Key: input.objectKey,
              Body: body.value as never,
              ContentType: input.contentType ?? undefined,
              ContentLength: body.contentLength ?? undefined,
            }),
          ),
          timeoutMs,
          "storage_put_object_timeout",
        );
      }
    } catch (error) {
      console.error("[storage][s3-compatible] putObject failed", {
        bucket: input.bucket,
        objectKey: input.objectKey,
        contentType: input.contentType ?? null,
        sizeBytes: input.body instanceof Uint8Array ? input.body.byteLength : input.contentLength ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    return {
      eTag: result.ETag?.replaceAll('"', "") ?? null,
      versionId: result.VersionId ?? null,
    };
  }

  async headObject(input: { bucket: string; objectKey: string }) {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
      );
      return {
        exists: true,
        contentType: result.ContentType ?? null,
        contentLength:
          typeof result.ContentLength === "number" ? result.ContentLength : null,
        eTag: result.ETag?.replaceAll('"', "") ?? null,
        checksum: result.ChecksumSHA256 ?? null,
        versionId: result.VersionId ?? null,
      };
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (isNotFoundError(error, message)) {
        return { exists: false };
      }
      console.error("[storage][s3-compatible] headObject failed", {
        bucket: input.bucket,
        objectKey: input.objectKey,
        error: message,
      });
      throw error;
    }
  }

  async deleteObject(input: { bucket: string; objectKey: string }) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
      );
    } catch (error) {
      console.error("[storage][s3-compatible] deleteObject failed", {
        bucket: input.bucket,
        objectKey: input.objectKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

function isNotFoundError(error: unknown, message: string): boolean {
  if (/not.?found|no.?such.?key/i.test(message)) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
    $response?: { statusCode?: unknown };
  };
  return candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.$response?.statusCode === 404;
}

function resolveUploadBody(
  body: Uint8Array | ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  contentLength?: number | null,
): { value: Uint8Array | NodeJS.ReadableStream; contentLength: number | null } {
  if (body instanceof Uint8Array) {
    return { value: body, contentLength: body.byteLength };
  }
  if (typeof contentLength === "number" && Number.isFinite(contentLength) && contentLength >= 0) {
    return {
      value: isWebReadableStream(body) ? Readable.fromWeb(body as never) : body as NodeJS.ReadableStream,
      contentLength: Math.floor(contentLength),
    };
  }
  return {
    value: isWebReadableStream(body) ? Readable.fromWeb(body as never) : body as NodeJS.ReadableStream,
    contentLength: null,
  };
}

function isWebReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return Boolean(value && typeof value === "object" && typeof (value as ReadableStream).getReader === "function");
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void Promise.resolve(onTimeout?.())
            .catch(() => undefined)
            .then(() => reject(new Error(message)));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeTimeoutMs(value: number | null | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), 30 * 60_000);
}
