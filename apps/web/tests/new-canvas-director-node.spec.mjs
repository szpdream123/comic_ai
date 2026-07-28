import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasDirectorCaptureUrl,
  canvasDirectorRecentCaptures,
  normalizeCanvasDirectorCapture,
  renderCanvasDirectorNodeBody,
  updateCanvasDirectorCaptureDocument,
} from "../src/features/production-workbench/canvas/canvas-director-node.js";

test("normalizes stable Director capture identifiers without persisting a signed URL", () => {
  const capture = normalizeCanvasDirectorCapture({
    artifact: { id: "artifact-1" },
    upload: { storageObjectId: "storage/object 1" },
    version: { id: "version-1" },
    fileName: "frame.png",
  });
  assert.match(capture.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual({ ...capture, createdAt: "normalized" }, {
    artifactId: "artifact-1",
    artifactKind: "image",
    storageObjectId: "storage/object 1",
    assetId: null,
    assetVersionId: "version-1",
    fileName: "frame.png",
    directorArtifactKind: "screenshot",
    createdAt: "normalized",
  });
});

test("updates Director node current identifiers and retains the latest twelve captures", () => {
  let document = {
    nodes: [{ id: "director-1", type: "ai-director", data: { directorCaptures: [] } }],
  };
  for (let index = 0; index < 13; index += 1) {
    document = updateCanvasDirectorCaptureDocument(document, "director-1", {
      artifactId: `artifact-${index}`,
      storageObjectId: `storage-${index}`,
      assetVersionId: `version-${index}`,
      createdAt: `2026-07-27T00:00:${String(index).padStart(2, "0")}.000Z`,
    });
  }
  const node = document.nodes[0];
  assert.equal(node.data.directorCaptures.length, 12);
  assert.equal(node.data.directorCaptures[0].artifactId, "artifact-1");
  assert.equal(node.data.artifactId, "artifact-12");
  assert.equal(node.data.assetVersionId, "version-12");
  assert.equal(node.data.status, "success");
  assert.deepEqual(canvasDirectorRecentCaptures(node, 4).map((item) => item.artifactId), [
    "artifact-9",
    "artifact-10",
    "artifact-11",
    "artifact-12",
  ]);
});

test("builds the authenticated proxy URL from the stable storage object id", () => {
  assert.equal(
    canvasDirectorCaptureUrl({ storageObjectId: "storage/object 1" }),
    "/api/storage/objects/storage%2Fobject%201/content?proxy=1",
  );
});

test("renders the Director node actions and recent stable previews", () => {
  const html = renderCanvasDirectorNodeBody({
    id: "director-1",
    data: {
      directorCaptures: [
        { artifactId: "artifact-1", storageObjectId: "storage-1" },
        { artifactId: "artifact-2", storageObjectId: "storage-2" },
      ],
    },
  });
  assert.match(html, /data-action="open-canvas-director"/);
  assert.match(html, /data-action="sync-canvas-director-frame"/);
  assert.match(html, /data-action="export-canvas-director-video"/);
  assert.match(html, /storage-2\/content\?proxy=1/);
  assert.match(html, /2 个结果/);
  assert.match(html, /按当前运镜导出 720p 参考视频/);
});
