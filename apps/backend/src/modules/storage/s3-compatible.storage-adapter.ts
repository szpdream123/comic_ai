import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";

import type { StorageAdapter } from "./storage.service.ts";

export class S3CompatibleStorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(input: {
    endpoint?: string | null;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
  }) {
    this.client = new S3Client({
      endpoint: input.endpoint ?? undefined,
      region: input.region,
      forcePathStyle: Boolean(input.forcePathStyle),
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
  }) {
    let result;
    try {
      const body = await resolveUploadBody(input.body, input.contentLength);
      result = await this.client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
          Body: body.value as never,
          ContentType: input.contentType ?? undefined,
          ContentLength: body.contentLength ?? undefined,
        }),
      );
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
      if (/not.?found|no.?such.?key/i.test(message)) {
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

async function resolveUploadBody(
  body: Uint8Array | ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  contentLength?: number | null,
): Promise<{ value: Uint8Array | NodeJS.ReadableStream; contentLength: number | null }> {
  if (body instanceof Uint8Array) {
    return { value: body, contentLength: body.byteLength };
  }
  if (typeof contentLength === "number" && Number.isFinite(contentLength) && contentLength >= 0) {
    return {
      value: isWebReadableStream(body) ? Readable.fromWeb(body as never) : body as NodeJS.ReadableStream,
      contentLength: Math.floor(contentLength),
    };
  }
  const bytes = await readStreamToBytes(body);
  return { value: bytes, contentLength: bytes.byteLength };
}

async function readStreamToBytes(body: ReadableStream<Uint8Array> | NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const stream = isWebReadableStream(body) ? Readable.fromWeb(body as never) : body;
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function isWebReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return Boolean(value && typeof value === "object" && typeof (value as ReadableStream).getReader === "function");
}
