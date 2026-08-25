import assert from "node:assert/strict";
import { it } from "node:test";

import { refreshGenerationInputUrls } from "../generation-input-url-refresh.ts";

it("re-signs COS generation inputs at provider dispatch time", async () => {
  const now = new Date("2026-08-21T02:30:00.000Z");
  const expiresAtValues: Date[] = [];
  const diagnostics: Array<{ stage: string; status: string }> = [];
  const db = {
    async query(sql: string, values: unknown[]) {
      if (sql.includes("WHERE bucket=$1")) {
        assert.deepEqual(values, ["creator-test", "references/frame.png"]);
        return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }] };
      }
      assert.deepEqual(values, ["00000000-0000-4000-8000-000000000001"]);
      return { rows: [{ bucket: "creator-test", object_key: "references/frame.png" }] };
    },
  };
  const runtime = {
    mode: "cos",
    provider: "tencent_cos",
    bucket: "creator-test",
    region: "ap-shanghai",
    adapter: {
      async createSignedReadUrl({ expiresAt }: { expiresAt: Date }) {
        expiresAtValues.push(expiresAt);
        return { url: "https://signed.example/fresh", expiresAt };
      },
    },
  };
  const expired = "https://creator-test.cos.ap-shanghai.myqcloud.com/references/frame.png?X-Amz-Date=20260820T000000Z&X-Amz-Expires=60";
  const result = await refreshGenerationInputUrls(db as never, {
    firstFrameUrl: expired,
    parameters: {
      firstFrame: { storageObjectId: "00000000-0000-4000-8000-000000000001", url: expired },
      filePaths: [expired],
    },
  }, {
    runtime: runtime as never,
    now,
    expiresInSeconds: 21_600,
    onDiagnostic: ({ stage, status }) => diagnostics.push({ stage, status }),
  }) as Record<string, any>;

  assert.equal(result.firstFrameUrl, "https://signed.example/fresh");
  assert.equal(result.parameters.firstFrame.url, "https://signed.example/fresh");
  assert.equal(result.parameters.firstFrame.storageObjectId, "00000000-0000-4000-8000-000000000001");
  assert.equal(result.parameters.filePaths[0], "https://signed.example/fresh");
  assert.deepEqual(expiresAtValues, [new Date("2026-08-21T08:30:00.000Z")]);
  assert.deepEqual(
    diagnostics.filter(({ status }) => status === "failed"),
    [],
  );
  assert.ok(diagnostics.some(({ stage, status }) => stage === "source_storage_lookup" && status === "succeeded"));
  assert.ok(diagnostics.some(({ stage, status }) => stage === "storage_object_sign" && status === "succeeded"));
  assert.ok(diagnostics.some(({ stage, status }) => stage === "refresh_inputs" && status === "succeeded"));
});

it("reports the exact signing stage when storage signing fails", async () => {
  const diagnostics: Array<{ stage: string; status: string; error?: { message?: string } }> = [];
  const db = {
    async query(sql: string) {
      if (sql.includes("WHERE bucket=$1")) return { rows: [{ id: "storage-1" }] };
      return { rows: [{ bucket: "creator-test", object_key: "references/frame.png" }] };
    },
  };
  const sourceUrl = "https://creator-test.cos.ap-shanghai.myqcloud.com/references/frame.png";

  await assert.rejects(
    refreshGenerationInputUrls(db as never, { firstFrameUrl: sourceUrl }, {
      runtime: {
        region: "ap-shanghai",
        adapter: {
          async createSignedReadUrl() {
            throw Object.assign(new Error("cos_sign_failed"), { code: "COS_SIGN_FAILED" });
          },
        },
      } as never,
      now: new Date("2026-08-21T02:30:00.000Z"),
      expiresInSeconds: 21_600,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    }),
    /cos_sign_failed/,
  );

  assert.ok(diagnostics.some(({ stage, status, error }) =>
    stage === "storage_object_sign" && status === "failed" && error?.message === "cos_sign_failed"));
  assert.ok(diagnostics.some(({ stage, status }) => stage === "refresh_inputs" && status === "failed"));
});

it("resolves asset-version references through the project storage object", async () => {
  const assetVersionId = "00000000-0000-4000-8000-000000000002";
  const storageObjectId = "00000000-0000-4000-8000-000000000003";
  const db = {
    async query(sql: string, values: unknown[]) {
      if (sql.includes("JOIN assets a") && sql.includes("a.project_id")) {
        assert.deepEqual(values, ["project-1", assetVersionId]);
        return {
          rows: [{
            storage_object_id: storageObjectId,
            bucket: "creator-test",
            object_key: "references/asset-version.png",
            object_status: "available",
            metadata_json: {},
          }],
        };
      }
      assert.deepEqual(values, [storageObjectId]);
      return { rows: [{ bucket: "creator-test", object_key: "references/asset-version.png" }] };
    },
  };
  const runtime = {
    adapter: {
      async createSignedReadUrl() {
        return { url: "https://signed.example/asset-version" };
      },
    },
  };

  const result = await refreshGenerationInputUrls(db as never, {
    parameters: {
      referenceImages: [{ assetVersionId, label: "reference" }],
    },
  }, {
    runtime: runtime as never,
    now: new Date("2026-08-21T02:30:00.000Z"),
    expiresInSeconds: 21_600,
    projectId: "project-1",
  }) as Record<string, any>;

  assert.equal(result.parameters.referenceImages[0].url, "https://signed.example/asset-version");
  assert.equal(result.parameters.referenceImages[0].assetVersionId, assetVersionId);
});

it("keeps a legacy COS metadata URL when its storage row is missing", async () => {
  const assetVersionId = "00000000-0000-4000-8000-000000000004";
  const legacyUrl = "https://creator-test.cos.ap-shanghai.myqcloud.com/legacy/reference.png";
  const db = {
    async query(sql: string, values: unknown[]) {
      if (sql.includes("JOIN assets a")) {
        return { rows: [{ storage_object_id: null, bucket: null, object_key: null, object_status: null, metadata_json: { sourceUrl: legacyUrl } }] };
      }
      assert.deepEqual(values, ["creator-test", "legacy/reference.png"]);
      return { rows: [] };
    },
  };
  const result = await refreshGenerationInputUrls(db as never, {
    parameters: { referenceImages: [{ assetVersionId }] },
  }, {
    runtime: { adapter: { async createSignedReadUrl() { return { url: "unused" }; } } } as never,
    now: new Date("2026-08-21T02:30:00.000Z"),
    expiresInSeconds: 21_600,
    projectId: "project-1",
  }) as Record<string, any>;

  assert.equal(result.parameters.referenceImages[0].url, "unused");
});

it("signs a direct COS reference when no storage row exists", async () => {
  const sourceUrl = "https://creator-test.cos.ap-shanghai.myqcloud.com/official/reference.jpg";
  const db = {
    async query() { return { rows: [] }; },
  };
  const result = await refreshGenerationInputUrls(db as never, {
    parameters: { quickReferences: [{ url: sourceUrl }] },
  }, {
    runtime: {
      region: "ap-shanghai",
      adapter: {
        async createSignedReadUrl({ bucket, objectKey }: { bucket: string; objectKey: string }) {
          return { url: `https://signed.example/${bucket}/${objectKey}` };
        },
      },
    } as never,
    now: new Date("2026-08-21T02:30:00.000Z"),
    expiresInSeconds: 21_600,
  }) as Record<string, any>;

  assert.equal(result.parameters.quickReferences[0].url, "https://signed.example/creator-test/official/reference.jpg");
});
