import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { handleWorkbenchActionForTest } from "../src/features/production-workbench/index.js";

import {
  canvasDirectorCaptureUrl,
  canvasDirectorRecentCaptures,
  normalizeCanvasDirectorCapture,
  removeCanvasDirectorCaptureDocument,
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

test("removes a Director capture and recalculates current stable identifiers", () => {
  const document = {
    nodes: [{
      id: "director-1",
      type: "ai-director",
      data: {
        directorCaptures: [
          { artifactId: "artifact-1", storageObjectId: "storage-1", assetId: "asset-1", assetVersionId: "version-1" },
          { artifactId: "artifact-2", storageObjectId: "storage-2", artifactKind: "video" },
        ],
        artifactId: "artifact-2",
        storageObjectId: "storage-2",
        mediaKind: "video",
      },
    }],
  };

  const withPreviousCurrent = removeCanvasDirectorCaptureDocument(document, "director-1", "artifact-2");
  assert.notEqual(withPreviousCurrent, document);
  assert.deepEqual(withPreviousCurrent.nodes[0].data.directorCaptures.map((capture) => capture.artifactId), ["artifact-1"]);
  assert.equal(withPreviousCurrent.nodes[0].data.artifactId, "artifact-1");
  assert.equal(withPreviousCurrent.nodes[0].data.storageObjectId, "storage-1");
  assert.equal(withPreviousCurrent.nodes[0].data.assetId, "asset-1");
  assert.equal(withPreviousCurrent.nodes[0].data.assetVersionId, "version-1");
  assert.equal(withPreviousCurrent.nodes[0].data.mediaKind, "image");

  const empty = removeCanvasDirectorCaptureDocument(withPreviousCurrent, "director-1", "artifact-1");
  assert.deepEqual(empty.nodes[0].data.directorCaptures, []);
  assert.equal(empty.nodes[0].data.artifactId, null);
  assert.equal(empty.nodes[0].data.storageObjectId, null);
  assert.equal(empty.nodes[0].data.assetId, null);
  assert.equal(empty.nodes[0].data.assetVersionId, null);
  assert.equal(empty.nodes[0].data.mediaKind, null);
  assert.equal(removeCanvasDirectorCaptureDocument(document, "director-1", "missing"), document);
});

test("renders the Director node actions and recent stable previews", () => {
  const html = renderCanvasDirectorNodeBody({
    id: "director-1",
    data: {
      directorCaptures: [
        { artifactId: "artifact-1", storageObjectId: "storage-1" },
        { artifactId: "artifact-2", storageObjectId: "storage-2", artifactKind: "video" },
      ],
    },
  });
  assert.match(html, /data-action="open-canvas-director"/);
  assert.match(html, /data-action="sync-canvas-director-frame"/);
  assert.match(html, /data-action="export-canvas-director-video"/);
  assert.match(html, /class="canvas-director-capture-grid" data-capture-count="2"/);
  assert.match(html, /<video[^>]*controls[^>]*role="application"/);
  assert.match(html, /class="canvas-director-capture-item" data-artifact-id="artifact-1" data-media-kind="image"/);
  assert.match(html, /data-action="delete-canvas-director-capture" data-node-id="director-1" data-artifact-id="artifact-2" data-media-kind="video"/);
  assert.match(html, /storage-2\/content\?proxy=1/);
  assert.match(html, /2 个结果/);
  assert.match(html, /按当前运镜导出 720p 参考视频/);

  const singleVideoHtml = renderCanvasDirectorNodeBody({
    id: "director-video",
    data: { directorCaptures: [{ artifactId: "video-1", storageObjectId: "storage-video-1", artifactKind: "video" }] },
  });
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  assert.match(singleVideoHtml, /class="canvas-director-capture-grid" data-capture-count="1"/);
  assert.match(css, /\.canvas-director-capture-grid\[data-capture-count="1"\] \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(css, /\.canvas-director-capture-grid :where\(img, video\) \{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?object-fit: cover;/);
});

function createDirectorDeleteWorkbench(document, saveStandaloneCanvas) {
  const updates = [];
  const newCanvasMount = {
    isConnected: true,
    dataset: { canvasProjectId: "canvas-1" },
    remove() { this.isConnected = false; },
  };
  return {
    workbench: {
      state: {},
      session: { user: { phone: "13800000000" } },
      api: { saveStandaloneCanvas },
      root: {
        innerHTML: "",
        querySelector(selector) {
          if (selector !== "[data-new-canvas-mount]") return null;
          return {
            replaceWith(host) { host.isConnected = true; },
          };
        },
      },
      ui: {
        activeNavTab: "tools",
        canvasProjectView: "detail",
        busy: true,
        selectedCanvasProjectId: "canvas-1",
        canvasProjects: [{ id: "canvas-1", name: "画布", status: "active" }],
        canvasDocument: document,
        canvasDocumentsByProject: { "canvas-1": document },
        canvasServerRevision: 1,
      },
      newCanvasHostActionDepth: 1,
      newCanvasMount,
      newCanvasInstance: {
        async update(input) {
          updates.push(input);
        },
      },
    },
    updates,
  };
}

test("Director capture deletion saves immediately and restores the original document on failure", async () => {
  const originalWindow = globalThis.window;
  const timeoutDelays = [];
  globalThis.window = {
    setTimeout(_callback, delay) {
      timeoutDelays.push(delay);
      return timeoutDelays.length;
    },
    clearTimeout() {},
  };
  const document = {
    version: 2,
    canvasProjectId: "canvas-1",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{
      id: "director-1",
      type: "ai-director",
      data: {
        directorCaptures: [{ artifactId: "artifact-1", storageObjectId: "storage-1" }],
        artifactId: "artifact-1",
        storageObjectId: "storage-1",
        mediaKind: "image",
      },
    }],
    edges: [],
  };
  try {
    let savedDocument = null;
    const successful = createDirectorDeleteWorkbench(document, async (_projectId, input) => {
      savedDocument = input.document;
      return { canvas: { canvasProjectId: "canvas-1", serverRevision: 2, document: input.document } };
    });
    await handleWorkbenchActionForTest(successful.workbench, {
      dataset: { action: "delete-canvas-director-capture", nodeId: "director-1", artifactId: "artifact-1", mediaKind: "image" },
    });
    assert.deepEqual(successful.workbench.ui.canvasDirectorCaptureDeleteTarget, {
      nodeId: "director-1",
      artifactId: "artifact-1",
      mediaKind: "image",
    });
    assert.equal(savedDocument, null);
    await handleWorkbenchActionForTest(successful.workbench, {
      dataset: { action: "confirm-canvas-director-capture-delete" },
    });
    assert.deepEqual(savedDocument.nodes[0].data.directorCaptures, []);
    assert.deepEqual(successful.workbench.ui.canvasDocument.nodes[0].data.directorCaptures, []);

    const failed = createDirectorDeleteWorkbench(document, async () => {
      throw new Error("save failed");
    });
    await handleWorkbenchActionForTest(failed.workbench, {
      dataset: { action: "delete-canvas-director-capture", nodeId: "director-1", artifactId: "artifact-1", mediaKind: "image" },
    });
    await handleWorkbenchActionForTest(failed.workbench, {
      dataset: { action: "confirm-canvas-director-capture-delete" },
    });
    assert.equal(failed.workbench.ui.canvasDocument, document);
    assert.deepEqual(failed.workbench.ui.canvasDocument.nodes[0].data.directorCaptures, document.nodes[0].data.directorCaptures);
    assert.match(failed.workbench.ui.toast.message, /删除失败/);
    await handleWorkbenchActionForTest(failed.workbench, {
      dataset: { action: "delete-canvas-director-capture", nodeId: "director-1", artifactId: "artifact-1", mediaKind: "image" },
    });
    await handleWorkbenchActionForTest(failed.workbench, {
      dataset: { action: "confirm-canvas-director-capture-delete" },
    });
    assert.equal(failed.workbench.ui.toastQueue.length, 1);
    assert.match(failed.workbench.ui.toastQueue[0].message, /删除失败/);
    assert.deepEqual(timeoutDelays, [3000, 3000, 3000]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Director capture deletion rebases onto the latest server revision without opening conflict recovery", async () => {
  const document = {
    version: 2,
    canvasProjectId: "canvas-1",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [{
      id: "director-1",
      type: "ai-director",
      data: {
        directorCaptures: [{ artifactId: "artifact-1", storageObjectId: "storage-1" }],
        artifactId: "artifact-1",
        storageObjectId: "storage-1",
        mediaKind: "image",
      },
    }],
    edges: [],
  };
  const serverDocument = {
    ...document,
    nodes: [
      document.nodes[0],
      { id: "server-node", type: "text", data: { text: "服务端新增内容" } },
    ],
  };
  const saves = [];
  const { workbench } = createDirectorDeleteWorkbench(document, async (_projectId, input) => {
    saves.push(input);
    if (saves.length === 1) {
      const error = new Error("revision conflict");
      error.errorCode = "canvas_revision_conflict";
      error.details = { serverRevision: 2, serverDocument };
      throw error;
    }
    return { canvas: { canvasProjectId: "canvas-1", serverRevision: 3, document: input.document } };
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "delete-canvas-director-capture", nodeId: "director-1", artifactId: "artifact-1", mediaKind: "image" },
  });
  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "confirm-canvas-director-capture-delete" },
  });

  assert.deepEqual(saves.map((save) => save.clientRevision), [1, 2]);
  assert.deepEqual(workbench.ui.canvasDocument.nodes.find((node) => node.id === "director-1").data.directorCaptures, []);
  assert.equal(workbench.ui.canvasDocument.nodes.some((node) => node.id === "server-node"), true);
  assert.equal(workbench.ui.canvasRevisionConflict, null);
  assert.equal(workbench.ui.canvasSaveStatus, "saved");
  assert.equal(workbench.ui.toastQueue.length, 1);
  assert.match(workbench.ui.toastQueue[0].message, /已删除导演台图片/);
});
