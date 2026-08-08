import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { S3CompatibleStorageAdapter } from "../s3-compatible.storage-adapter.ts";

describe("S3 compatible storage adapter", () => {
  it("returns permanent public object urls without signing parameters", async () => {
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
      expiresAt: new Date("2026-08-08T12:00:00.000Z"),
    });

    assert.equal(
      result.url,
      "https://storage.example.com/root/creator-test/generated/file%20name.png",
    );
    assert.doesNotMatch(result.url, /X-Amz-|expires/i);
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
