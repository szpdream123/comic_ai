import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createStorageAdapterFromEnv } from "../storage-adapter.factory.ts";

describe("storage adapter factory", () => {
  it("builds a public-base-url adapter from env when configured", async () => {
    const adapter = createStorageAdapterFromEnv({
      STORAGE_ADAPTER_MODE: "public_base_url",
      STORAGE_PUBLIC_BASE_URL: "https://storage.example.com/root",
    });

    const result = await adapter.createSignedReadUrl({
      bucket: "bucket-1",
      objectKey: "objects/file.png",
      expiresAt: new Date("2026-05-18T13:00:00.000Z"),
    });

    assert.match(
      result.url,
      /^https:\/\/storage\.example\.com\/root\/bucket-1\/objects%2Ffile\.png\?expiresAt=/,
    );
  });

  it("keeps COS signed urls on a single bucket host when endpoint already includes the bucket", async () => {
    const adapter = createStorageAdapterFromEnv({
      STORAGE_ADAPTER_MODE: "cos",
      STORAGE_BUCKET: "aimanhuadrama-1310122982",
      STORAGE_REGION: "ap-guangzhou",
      STORAGE_ENDPOINT: "https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com",
      STORAGE_COS_SECRET_ID: "secret-id",
      STORAGE_COS_SECRET_KEY: "secret-key",
    });

    const result = await adapter.createSignedReadUrl({
      bucket: "aimanhuadrama-1310122982",
      objectKey: "AIManhuaDrama/20260602/test.png",
      expiresAt: new Date(Date.now() + 60_000),
    });

    assert.match(
      result.url,
      /^https:\/\/aimanhuadrama-1310122982\.cos\.ap-guangzhou\.myqcloud\.com\/AIManhuaDrama\/20260602\/test\.png\?/,
    );
    assert.doesNotMatch(
      result.url,
      /aimanhuadrama-1310122982\.aimanhuadrama-1310122982\.cos\.ap-guangzhou\.myqcloud\.com/i,
    );
  });
});
