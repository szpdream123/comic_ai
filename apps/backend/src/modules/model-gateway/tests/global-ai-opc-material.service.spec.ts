import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  prepareGlobalAiOpcVideoMaterials,
  registerGeneratedImageWithGlobalAiOpc,
} from "../global-ai-opc-material.service.ts";

describe("GlobalAiOpc material preparation", { concurrency: false }, () => {
  it("keeps URLs until a provider asset becomes ACTIVE, then uses its assetId", async () => {
    const db = await createMigratedTestDb();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url: String(url), body });
      if (String(url).endsWith("/assetUpload")) {
        return Response.json({
          assetId: "asset-provider-image-1",
          assetType: "Image",
          status: "PROCESSING",
          url: body.url,
          errorMessage: null,
        });
      }
      return Response.json({
        assetId: "asset-provider-image-1",
        assetType: "Image",
        status: "ACTIVE",
        url: "https://cdn.example.test/reference.png",
        errorMessage: null,
      });
    }) as typeof fetch;

    try {
      await db.query(`
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes, provider, status, metadata_json
        )
        VALUES ($1, 'test-bucket', 'references/reference.png', 'image/png', 128, 'test', 'available', '{}'::jsonb)
      `, ["10000000-0000-4000-8000-000000000001"]);
      const requestBody = {
        prompt: "animate",
        firstFrameUrl: "https://cdn.example.test/reference.png",
        parameters: {
          referenceImages: [{
            storageObjectId: "10000000-0000-4000-8000-000000000001",
            url: "https://cdn.example.test/reference.png",
          }],
        },
      };
      const config = {
        baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
        apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
      };
      const first = await prepareGlobalAiOpcVideoMaterials(db, {
        requestBody,
        providerConfig: config,
        env: { GLOBAL_AI_OPC_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-09-04T08:00:00.000Z"),
      });
      assert.equal(
        ((first.parameters as Record<string, unknown>).referenceImages as Array<Record<string, unknown>>)[0]?.url,
        "https://cdn.example.test/reference.png",
      );
      assert.equal(requests[0]?.url.endsWith("/asset/seedance2/assetUpload"), true);

      const second = await prepareGlobalAiOpcVideoMaterials(db, {
        requestBody,
        providerConfig: config,
        env: { GLOBAL_AI_OPC_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-09-04T08:00:10.000Z"),
      });
      assert.equal(
        ((second.parameters as Record<string, unknown>).referenceImages as Array<Record<string, unknown>>)[0]?.url,
        "assetId://asset-provider-image-1",
      );
      assert.equal(second.firstFrameUrl, "assetId://asset-provider-image-1");
      assert.deepEqual(requests[1]?.body, { assetId: "asset-provider-image-1" });
      assert.equal(
        ((requestBody.parameters.referenceImages[0] as Record<string, unknown>).url),
        "https://cdn.example.test/reference.png",
      );
    } finally {
      await db.close();
    }
  });

  it("preserves the existing URL when material registration fails", async () => {
    const db = await createMigratedTestDb();
    try {
      const prepared = await prepareGlobalAiOpcVideoMaterials(db, {
        requestBody: {
          prompt: "animate",
          firstFrameUrl: "https://cdn.example.test/first.png",
        },
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
        },
        env: { GLOBAL_AI_OPC_API_KEY: "test-key" },
        fetchImpl: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
        now: new Date("2026-09-04T08:00:00.000Z"),
      });
      assert.equal(prepared.firstFrameUrl, "https://cdn.example.test/first.png");
    } finally {
      await db.close();
    }
  });

  it("registers generated images and reuses the URL alias for video generation", async () => {
    const db = await createMigratedTestDb();
    const sourceUrl = "https://platform-storage.example.test/generated/image.png";
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url: String(url), body });
      return String(url).endsWith("/assetUpload")
        ? Response.json({ assetId: "generated-asset-1", status: "PROCESSING" })
        : Response.json({ assetId: "generated-asset-1", status: "ACTIVE" });
    }) as typeof fetch;

    try {
      const storageObjectId = "10000000-0000-4000-8000-000000000002";
      await db.query(`
        INSERT INTO storage_objects (
          id, bucket, object_key, content_type, size_bytes, provider, status, metadata_json
        )
        VALUES ($1, 'test-bucket', 'generated/image.png', 'image/png', 128, 'test', 'available', '{}'::jsonb)
      `, [storageObjectId]);

      await registerGeneratedImageWithGlobalAiOpc(db, {
        storageObjectId,
        sourceUrl,
        env: { GLOBAL_AI_OPC_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-09-04T08:00:00.000Z"),
      });

      assert.deepEqual(requests[0]?.body, {
        assetType: "Image",
        url: sourceUrl,
        name: "comic-ai-image-000000000002",
      });
      const mappings = await db.query<{
        source_key: string;
        provider_asset_id: string;
        provider_status: string;
      }>(`
        SELECT source_key, provider_asset_id, provider_status
        FROM provider_material_assets
        WHERE provider='globalaiopc' AND asset_type='Image'
        ORDER BY source_key
      `);
      assert.equal(mappings.rows.length, 2);
      assert.equal(mappings.rows.some((row) => row.source_key === `storage:${storageObjectId}`), true);
      assert.equal(mappings.rows.some((row) => row.source_key.startsWith("url:")), true);
      assert.equal(mappings.rows.every((row) => row.provider_asset_id === "generated-asset-1"), true);
      assert.equal(mappings.rows.every((row) => row.provider_status === "PROCESSING"), true);

      const prepared = await prepareGlobalAiOpcVideoMaterials(db, {
        requestBody: { firstFrameUrl: sourceUrl },
        providerConfig: {
          baseURL: "https://zcbservice.aizfw.cn/kyyReactApiServer",
          apiKeyEnv: "GLOBAL_AI_OPC_API_KEY",
        },
        env: { GLOBAL_AI_OPC_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-09-04T08:00:10.000Z"),
      });
      assert.equal(prepared.firstFrameUrl, "assetId://generated-asset-1");
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1]?.body, { assetId: "generated-asset-1" });
    } finally {
      await db.close();
    }
  });
});
