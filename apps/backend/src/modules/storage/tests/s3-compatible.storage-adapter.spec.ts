import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { S3CompatibleStorageAdapter } from "../s3-compatible.storage-adapter.ts";

describe("S3 compatible storage adapter", () => {
  it("buffers unknown-length streams before uploading to S3-compatible storage", async () => {
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
});
