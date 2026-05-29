import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
      }),
      { expiresIn },
    );

    return { url, expiresAt: input.expiresAt };
  }

  async putObject(input: {
    bucket: string;
    objectKey: string;
    body: Uint8Array;
    contentType?: string | null;
  }) {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType ?? undefined,
      }),
    );
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
      throw error;
    }
  }

  async deleteObject(input: { bucket: string; objectKey: string }) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
      }),
    );
  }
}
