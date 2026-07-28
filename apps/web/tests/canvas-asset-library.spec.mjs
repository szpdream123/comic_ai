import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canvasAssetNodeData,
  canvasAssetsFromGenerationHistory,
} from "../src/features/production-workbench/canvas/canvas-asset-library.js";
import { buildCanvasSidebarItems } from "../src/features/production-workbench/canvas/canvas-state.js";

test("Canvas generation history maps artifacts into reusable Canvas assets", () => {
  const assets = canvasAssetsFromGenerationHistory({
    items: [{
      id: "run-1",
      nodeKey: "image-1",
      mediaKind: "image",
      modelCode: "image-model",
      createdAt: "2026-07-25T08:00:00.000Z",
      artifacts: [{
        id: "artifact-1",
        artifact_kind: "image",
        storage_object_id: "storage-1",
        thumbnail_url: "https://example.test/thumb.png",
        selected: true,
        metadata_json: { fileName: "角色立绘.png" },
      }],
    }],
  });

  assert.deepEqual(assets, [{
    id: "artifact-1",
    runId: "run-1",
    artifactId: "artifact-1",
    storageObjectId: "storage-1",
    assetId: null,
    assetVersionId: null,
    kind: "image",
    title: "角色立绘.png",
    meta: "image · image-model",
    status: "已选",
    createdAt: "2026-07-25T08:00:00.000Z",
    url: "https://example.test/thumb.png",
    previewUrl: "https://example.test/thumb.png",
  }]);
});

test("Canvas assets preserve storage references when inserted as source nodes", () => {
  assert.deepEqual(canvasAssetNodeData({
    id: "artifact-1",
    artifactId: "artifact-1",
    storageObjectId: "storage-1",
    kind: "video",
    title: "镜头 01",
    url: "https://example.test/video.mp4",
  }), {
    source: "canvas_artifact",
    status: "ready",
    mediaKind: "video",
    title: "镜头 01",
    fileName: "镜头 01",
    artifactId: "artifact-1",
    storageObjectId: "storage-1",
    assetId: null,
    assetVersionId: null,
    url: "https://example.test/video.mp4",
    previewUrl: "https://example.test/video.mp4",
  });
});

test("Canvas asset sidebar items preserve stable transfer ids and progress state", () => {
  const items = buildCanvasSidebarItems({ nodes: [] }, {
    mode: "assets",
    assets: [{
      id: "artifact-1",
      runId: "run-1",
      storageObjectId: "storage-1",
      assetVersionId: "version-1",
      kind: "image",
      title: "角色立绘.png",
    }],
    assetTransfers: {
      "artifact-1": { mode: "download", status: "running", loaded: 8, total: 10, progress: 0.8 },
    },
  });
  assert.equal(items[0].storageObjectId, "storage-1");
  assert.equal(items[0].assetVersionId, "version-1");
  assert.deepEqual(items[0].transfer, {
    mode: "download", status: "running", loaded: 8, total: 10, progress: 0.8,
  });
});
