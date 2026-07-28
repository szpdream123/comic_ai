import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasGroupRunnableNodeIds,
  normalizeCanvasGroupColor,
  renderCanvasGroupNodeBody,
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

test("updates group title and color without changing document contracts", () => {
  const document = { nodes: [{ id: "group-1", type: "group", data: { title: "旧名称", childNodeIds: [] } }] };
  const next = updateCanvasGroupData(document, "group-1", { title: "镜头组", color: "#3b82f6" });
  assert.equal(next.nodes[0].data.title, "镜头组");
  assert.equal(next.nodes[0].data.color, "#3b82f6");
  assert.deepEqual(next.nodes[0].data.childNodeIds, []);
});

test("renders inline rename, color swatches, count, and batch run controls", () => {
  const html = renderCanvasGroupNodeBody({
    id: "group-1",
    type: "group",
    data: { title: "动作镜头", color: "#f59e0b", childNodeIds: ["a", "b"] },
  });
  assert.match(html, /data-canvas-group-title-input/);
  assert.match(html, /data-action="set-canvas-group-color"/);
  assert.match(html, /data-action="run-canvas-group"/);
  assert.match(html, /2 节点/);
  assert.match(html, /aria-pressed="true"/);
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
});
