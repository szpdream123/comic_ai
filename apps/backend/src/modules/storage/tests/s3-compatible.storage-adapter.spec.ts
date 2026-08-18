import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { S3CompatibleStorageAdapter } from "../s3-compatible.storage-adapter.ts";

describe("S3 compatible storage adapter", () => {
  it("returns an expiring signed object url", async () => {
    const adapter = new S3CompatibleStorageAdapter({
      endpoint: "https://storage.example.com/root",
      region: "ap-guangzhou",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      forcePathStyle: true,
    });

    const result = await adapter.createSignedReadUrl({
      bucket: "creator-test",
      objectKey: "generated/file name.png",
      expiresAt: new Date(Date.now() + 60 * 60_000),
      responseContentDisposition: "inline",
    });

    const url = new URL(result.url);
    assert.equal(url.origin, "https://storage.example.com");
    assert.equal(url.pathname, "/root/creator-test/generated/file%20name.png");
    assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[a-f0-9]{64}$/i);
    assert.equal(url.searchParams.get("response-content-disposition"), "inline");
    const expiresIn = Number(url.searchParams.get("X-Amz-Expires"));
    assert.ok(expiresIn >= 3_598 && expiresIn <= 3_600);
  });

  it("treats an empty 404 HeadObject response as a missing object", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(404, { "content-length": "0" });
      response.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    try {
      const adapter = new S3CompatibleStorageAdapter({
        endpoint: `http://127.0.0.1:${address!.port}`,
        region: "ap-guangzhou",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        forcePathStyle: true,
      });

      const result = await adapter.headObject({
        bucket: "creator-test",
        objectKey: "missing.png",
      });

      assert.deepEqual(result, { exists: false });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("uploads unknown-length streams through the bounded multipart uploader", async () => {
    let capturedLength = "";
    let capturedBody = "";
    const server = createServer((request, response) => {
      capturedLength = request.headers["content-length"] ?? "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        capturedBody += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, {
          "content-type": "application/xml",
          etag: '"s3-compatible-etag"',
        });
        response.end("<PutObjectResult><ETag>\"s3-compatible-etag\"</ETag></PutObjectResult>");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    try {
      const adapter = new S3CompatibleStorageAdapter({
        endpoint: `http://127.0.0.1:${address!.port}`,
        region: "ap-guangzhou",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        forcePathStyle: true,
      });

      const result = await adapter.putObject({
        bucket: "creator-test",
        objectKey: "generated/result.txt",
        body: Readable.from(["hello ", "ark"]),
        contentType: "text/plain",
      });

      assert.equal(capturedLength, "9");
      assert.equal(capturedBody, "hello ark");
      assert.equal(result.eTag, "s3-compatible-etag");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("forwards cache-control metadata when uploading an immutable media object", async () => {
    let capturedCacheControl = "";
    const server = createServer((request, response) => {
      capturedCacheControl = request.headers["cache-control"] ?? "";
      request.resume();
      request.on("end", () => {
        response.writeHead(200, {
          "content-type": "application/xml",
          etag: '"s3-compatible-etag"',
        });
        response.end("<PutObjectResult><ETag>\"s3-compatible-etag\"</ETag></PutObjectResult>");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    try {
      const adapter = new S3CompatibleStorageAdapter({
        endpoint: `http://127.0.0.1:${address!.port}`,
        region: "ap-guangzhou",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        forcePathStyle: true,
      });

      await adapter.putObject({
        bucket: "creator-test",
        objectKey: "officialAssets/homeBackgroundVideos/background.mp4",
        body: new Uint8Array([1]),
        contentType: "video/mp4",
        cacheControl: "public, max-age=31536000, immutable",
      });

      assert.equal(capturedCacheControl, "public, max-age=31536000, immutable");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("copies an object to a distinct server-side delivery key", async () => {
    let capturedCopySource = "";
    let capturedPath = "";
    const server = createServer((request, response) => {
      capturedCopySource = request.headers["x-amz-copy-source"] ?? "";
      capturedPath = request.url ?? "";
      request.resume();
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/xml", "x-amz-version-id": "delivery-version" });
        response.end("<CopyObjectResult><ETag>&quot;delivery-etag&quot;</ETag></CopyObjectResult>");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    try {
      const adapter = new S3CompatibleStorageAdapter({
        endpoint: `http://127.0.0.1:${address!.port}`,
        region: "ap-guangzhou",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        forcePathStyle: true,
      });

      const result = await adapter.copyObject({
        sourceBucket: "creator-test",
        sourceObjectKey: "projects/source file.mp4",
        destinationBucket: "creator-test",
        destinationObjectKey: "marketing-delivery/job-1/asset-1-source-file.mp4",
      });

      assert.equal(capturedCopySource, "/creator-test/projects/source%20file.mp4");
      assert.equal(new URL(capturedPath, "http://storage.test").pathname, "/creator-test/marketing-delivery/job-1/asset-1-source-file.mp4");
      assert.deepEqual(result, { eTag: "delivery-etag", versionId: "delivery-version" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("aborts a timed-out known-length upload request", async () => {
    let requestSocket: import("node:net").Socket | null = null;
    let resolveConnectionClosed: (() => void) | null = null;
    const connectionClosed = new Promise<void>((resolve) => {
      resolveConnectionClosed = resolve;
    });
    const server = createServer((request) => {
      requestSocket = request.socket;
      request.socket.once("close", () => resolveConnectionClosed?.());
      request.resume();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.equal(typeof address, "object");

    try {
      const adapter = new S3CompatibleStorageAdapter({
        endpoint: `http://127.0.0.1:${address!.port}`,
        region: "ap-guangzhou",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
        forcePathStyle: true,
      });

      await assert.rejects(
        adapter.putObject({
          bucket: "creator-test",
          objectKey: "generated/timeout.txt",
          body: new Uint8Array([1]),
          contentType: "application/octet-stream",
          timeoutMs: 100,
        }),
        /storage_put_object_timeout/,
      );
      await Promise.race([
        connectionClosed,
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
      assert.equal(requestSocket?.destroyed, true);
    } finally {
      requestSocket?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
