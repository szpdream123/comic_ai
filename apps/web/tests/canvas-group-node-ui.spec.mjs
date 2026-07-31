import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canvasSelectionContentNodeIds,
  canvasGroupRunnableNodeIds,
  normalizeCanvasGroupColor,
  renderCanvasGroupNodeBody,
  resolveCanvasBatchDownloadItems,
  updateCanvasGroupData,
} from "../src/features/production-workbench/canvas/canvas-group-node.js";
import { canvasDocumentToX6Data } from "../src/features/production-workbench/canvas/canvas-x6-document.js";

test("normalizes group colors to the supported swatch palette", () => {
  assert.equal(normalizeCanvasGroupColor("#A855F7"), "#a855f7");
  assert.equal(normalizeCanvasGroupColor("javascript:bad"), "#22c55e");
});

test("selects only runnable direct children for group batch execution", () => {
  const group = { id: "group-1", type: "group", data: { childNodeIds: ["image-1", "comment-1", "video-1"] } };
  const document = {
    nodes: [
      group,
      { id: "image-1", type: "ai-image" },
      { id: "comment-1", type: "comment" },
      { id: "video-1", type: "ai-video" },
    ],
  };
  assert.deepEqual(canvasGroupRunnableNodeIds(document, group), ["image-1", "video-1"]);
});

test("flushes pending canvas saves before selected or grouped batch execution", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  for (const action of ["run-canvas-selection", "run-canvas-group"]) {
    const block = source.match(new RegExp(`if \\(action === "${action}"\\) \\{[\\s\\S]*?\\n  \\}`))?.[0] ?? "";
    assert.match(block, /await flushProjectCanvasSave\(workbench\)/);
    assert.doesNotMatch(block, /await saveProjectCanvasNow\(workbench\)/);
  }
});

test("batch download prefers direct media URLs over authenticated storage transfer", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('if (action === "download-canvas-selection")'),
    source.indexOf('if (action === "cancel-canvas-asset-transfer")'),
  );
  assert.ok(handler.indexOf("if (item.url)") < handler.indexOf("else if (item.storageObjectId)"));
  assert.match(handler, /if \(item\.url\) \{\s*triggerBrowserDownload\(item\.url, fileName\);/);
});

test("updates group title and color without changing document contracts", () => {
  const document = { nodes: [{ id: "group-1", type: "group", data: { title: "旧名称", childNodeIds: [] } }] };
  const next = updateCanvasGroupData(document, "group-1", { title: "镜头组", color: "#3b82f6" });
  assert.equal(next.nodes[0].data.title, "镜头组");
  assert.equal(next.nodes[0].data.color, "#3b82f6");
  assert.deepEqual(next.nodes[0].data.childNodeIds, []);
});

test("renders a minimal run group overlay", () => {
  const html = renderCanvasGroupNodeBody({
    id: "group-1",
    type: "group",
    data: { title: "动作镜头", color: "#f59e0b", childNodeIds: ["a", "b"] },
  });
  assert.match(html, /class="canvas-group-node-label">运行组</);
  assert.doesNotMatch(html, /canvas-group-node-header/);
  assert.doesNotMatch(html, /data-action=/);
});

test("expands a selected group and resolves stable media for batch download", () => {
  const document = {
    nodes: [
      { id: "group-1", type: "group", data: { childNodeIds: ["image-1", "video-1"] } },
      { id: "image-1", type: "source-image", data: { title: "角色图", storageObjectId: "storage-image" } },
      { id: "video-1", type: "ai-video", data: { title: "动作视频" } },
    ],
  };
  assert.deepEqual(canvasSelectionContentNodeIds(document, ["group-1"]), ["image-1", "video-1"]);
  assert.deepEqual(resolveCanvasBatchDownloadItems(document, ["group-1"], {
    historyItems: [{
      nodeKey: "video-1",
      mediaKind: "video",
      artifacts: [{ storageObjectId: "storage-video", metadata: { fileName: "动作视频.mp4" } }],
    }],
  }), [
    {
      nodeId: "video-1",
      storageObjectId: "storage-video",
      url: "",
      fileName: "动作视频.mp4",
      mediaKind: "video",
    },
    {
      nodeId: "image-1",
      storageObjectId: "storage-image",
      url: "",
      fileName: "角色图",
      mediaKind: "source-image",
    },
  ]);
});

test("routes group and Director nodes through the X6 HTML shape", () => {
  const data = canvasDocumentToX6Data({
    nodes: [
      { id: "group-1", type: "group", data: { childNodeIds: [] } },
      { id: "director-1", type: "ai-director", data: {} },
      { id: "video-1", type: "ai-video", data: {} },
      { id: "audio-1", type: "source-audio", data: {} },
    ],
    edges: [],
  });
  assert.deepEqual(data.nodes.map((node) => node.shape), [
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
  ]);
  assert.deepEqual(data.nodes.map((node) => node.zIndex), [-1, 2, 2, 2]);
  assert.equal(data.nodes.find((node) => node.id === "group-1").attrs.body.fill, "transparent");
});
