import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import {
  applyLibTvCanvasImport,
  buildLibTvCanvasImportPreview,
} from "../src/features/production-workbench/canvas/canvas-libtv-import.js";
import { renderCanvasFrameAnalysisNodeBody } from "../src/features/production-workbench/canvas/canvas-frame-analysis-node.js";
import { resolveCanvasNodeTemplates } from "../src/features/production-workbench/canvas/canvas-state.js";

test("LibTV CLI project JSON maps canonical nodes and preserves external identities", () => {
  const preview = buildLibTvCanvasImportPreview({
    projectUuid: "project-libtv-1",
    name: "广告分镜",
    nodes: [
      { id: "text-1", type: "text", name: "文案", x: 20, y: 30, data: { content: "开场文案" } },
      { nodeKey: "image-1", type: "image", label: "主视觉", position: { x: 460, y: 30 }, data: { params: { prompt: "霓虹街道" } } },
      { nodeKey: "clip-1", type: "video-clip", label: "智能剪辑", position: { x: 900, y: 30 } },
    ],
    edges: [
      { id: "edge-1", source: "text-1", target: "image-1" },
      { id: "edge-2", source: { nodeKey: "image-1" }, target: { nodeKey: "clip-1" } },
    ],
  });

  assert.equal(preview.projectId, "project-libtv-1");
  assert.deepEqual(preview.nodes.map((node) => node.type), ["ai-text", "ai-image", "ai-video"]);
  assert.equal(preview.nodes[2].data.canvasMode, "smart-edit");
  assert.equal(preview.nodes[2].data.videoGenerationMode, "edit-video");
  assert.equal(preview.nodes[0].data.title, "文案");
  assert.equal(preview.nodes[0].data.text, "开场文案");
  assert.equal(preview.nodes[1].data.prompt, "霓虹街道");
  assert.equal(preview.nodes.every((node) => node.data.externalSource === "libtv"), true);
  assert.equal(preview.edges.length, 2);

  const imported = applyLibTvCanvasImport(createDefaultCanvasDocument({ canvasProjectId: "canvas-content" }), preview);
  assert.equal(imported.document.nodes[0].data.text, "开场文案");
  assert.equal(imported.document.nodes[1].data.prompt, "霓虹街道");
});

test("LibTV import applies nodes and compatible edges idempotently", () => {
  const preview = buildLibTvCanvasImportPreview({
    uuid: "project-libtv-2",
    nodes: [
      { id: "text-1", type: "text", name: "文案" },
      { id: "image-1", type: "image", name: "画面" },
    ],
    edges: [{ id: "edge-1", source: "text-1", target: "image-1" }],
  });
  const first = applyLibTvCanvasImport(createDefaultCanvasDocument({ canvasProjectId: "canvas-1" }), preview);
  assert.equal(first.importedNodeCount, 2);
  assert.equal(first.importedEdgeCount, 1);
  assert.equal(first.document.nodes.length, 2);
  assert.equal(first.document.edges.length, 1);

  const second = applyLibTvCanvasImport(first.document, preview);
  assert.equal(second.importedNodeCount, 0);
  assert.equal(second.skippedNodeCount, 2);
  assert.equal(second.importedEdgeCount, 0);
  assert.equal(second.document.nodes.length, 2);
  assert.equal(second.document.edges.length, 1);
});

test("LibTV imports scope repeated external node ids to their source project", () => {
  const firstPreview = buildLibTvCanvasImportPreview({
    uuid: "project-libtv-a",
    nodes: [{ id: "\u5206\u955c-1", type: "text", name: "A \u9879\u76ee\u6587\u6848" }],
  });
  const secondPreview = buildLibTvCanvasImportPreview({
    uuid: "project-libtv-b",
    nodes: [{ id: "\u5206\u955c-1", type: "text", name: "B \u9879\u76ee\u6587\u6848" }],
  });
  const first = applyLibTvCanvasImport(createDefaultCanvasDocument({ canvasProjectId: "canvas-1" }), firstPreview);
  const second = applyLibTvCanvasImport(first.document, secondPreview);

  assert.equal(second.importedNodeCount, 1);
  assert.equal(second.document.nodes.length, 2);
  assert.notEqual(second.document.nodes[0].id, second.document.nodes[1].id);
});

test("LibTV assigns stable distinct identities to projects without an external project id", () => {
  const firstPreview = buildLibTvCanvasImportPreview({
    name: "无 ID 项目 A",
    nodes: [{ id: "node-1", type: "text", data: { content: "A" } }],
  });
  const repeatedPreview = buildLibTvCanvasImportPreview({
    name: "无 ID 项目 A",
    nodes: [{ id: "node-1", type: "text", data: { content: "A" } }],
  });
  const secondPreview = buildLibTvCanvasImportPreview({
    name: "无 ID 项目 B",
    nodes: [{ id: "node-1", type: "text", data: { content: "B" } }],
  });

  assert.equal(firstPreview.projectId, repeatedPreview.projectId);
  assert.notEqual(firstPreview.projectId, secondPreview.projectId);
  const first = applyLibTvCanvasImport(createDefaultCanvasDocument({ canvasProjectId: "canvas-anonymous" }), firstPreview);
  const repeated = applyLibTvCanvasImport(first.document, repeatedPreview);
  const second = applyLibTvCanvasImport(repeated.document, secondPreview);
  assert.equal(repeated.importedNodeCount, 0);
  assert.equal(second.importedNodeCount, 1);
  assert.equal(second.document.nodes.length, 2);
});

test("canonical Canvas catalog exposes current nodes and keeps legacy templates hidden", () => {
  const templates = resolveCanvasNodeTemplates({});
  assert.deepEqual(
    templates.filter((template) => template.visible !== false).map((template) => template.title),
    ["文本", "图片", "视频", "智能剪辑", "音频", "分镜表", "导演台", "逐帧拉片", "脚本", "画布笔记"],
  );
  assert.equal(templates.find((template) => template.id === "template-smart-edit").defaultData.videoGenerationMode, "edit-video");
  assert.equal(templates.find((template) => template.id === "template-frame-analysis").defaultData.canvasMode, "frame-analysis");
  assert.equal(templates.find((template) => template.id === "template-upload").visible, false);
});

test("frame analysis node renders progress, results, retry, and expansion controls", () => {
  const running = renderCanvasFrameAnalysisNodeBody({
    id: "analysis-1",
    type: "ai-storyboard",
    data: { canvasMode: "frame-analysis", status: "running", analysisProgress: 48 },
  });
  assert.match(running, /逐帧拉片进度 48%/);
  assert.match(running, /disabled/);

  const completed = renderCanvasFrameAnalysisNodeBody({
    id: "analysis-1",
    type: "ai-storyboard",
    data: {
      canvasMode: "frame-analysis",
      status: "completed",
      analysisSegments: [{ index: 1, startMs: 0, endMs: 15000, description: "角色走进街道" }],
    },
  });
  assert.match(completed, /1 个分镜/);
  assert.match(completed, /角色走进街道/);
  assert.match(completed, /data-action="expand-canvas-frame-analysis"/);
  assert.match(completed, />重新拉片</);
});

test("frame analysis reads managed videos through the same-origin storage proxy and keeps failure stages", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(source, /collectCanvasFrameAnalysisVideoReference[\s\S]*?canvasMediaReferenceFromNode\(nodeMap\.get\(edge\.sourceNodeId\)\)/);
  assert.doesNotMatch(source, /collectCanvasFrameAnalysisVideoReference[\s\S]*?canvasMediaReferenceFromNode\(nodeMap\.get\(edge\.sourceNodeId\), edge\.data\?\.kind\)/);
  assert.match(source, /storageObjectId[\s\S]*?\/api\/storage\/objects\/\$\{encodeURIComponent\(storageObjectId\)\}\/content\?download=1/);
  assert.match(source, /analysisStageLabel: activeStageLabel/);
  assert.match(source, /failureMessage: `\$\{activeStageLabel\}失败：\$\{friendlyError\(error\)\}`/);
});
