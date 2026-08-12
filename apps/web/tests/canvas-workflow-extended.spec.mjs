import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import {
  addConnectedCanvasNode,
  addCanvasNode,
  applyCanvasSettingsToTemplate,
  duplicateCanvasNodes,
  groupCanvasNodes,
  resolveCanvasNodeTemplates,
  resolveCompatibleCanvasNodeTemplates,
} from "../src/features/production-workbench/canvas/canvas-state.js";
import { renderCanvasMarkdownPreview } from "../src/features/production-workbench/project-detail.js";

test("Canvas node catalog includes every canonical first-version node type", () => {
  const templates = resolveCanvasNodeTemplates({});
  const canonicalTypes = [
    "ai-text", "ai-image", "ai-video", "ai-audio", "ai-animation", "ai-panorama",
    "ai-markdown", "ai-storyboard", "ai-director", "source-text", "source-image",
    "source-video", "source-audio", "group",
  ];
  assert.deepEqual(canonicalTypes.filter((type) => !templates.some((template) => template.type === type)), []);
  assert.equal(templates.some((template) => template.type === "comment"), false);
  for (const type of canonicalTypes) {
    const document = addCanvasNode(createDefaultCanvasDocument(), { type, id: `${type}-1` });
    assert.equal(document.nodes[0].type, type);
    assert.ok(Array.isArray(document.nodes[0].data.ports.inputs));
    assert.ok(Array.isArray(document.nodes[0].data.ports.outputs));
  }
});

test("Canvas selection can be copied, pasted, and grouped without mutating the source document", () => {
  const empty = createDefaultCanvasDocument({ canvasProjectId: "canvas-1" });
  const first = addCanvasNode(empty, { type: "markdown", id: "markdown-1", position: { x: 100, y: 120 } });
  const second = addCanvasNode(first, { type: "comment", id: "comment-1", position: { x: 520, y: 180 } });
  const duplicated = duplicateCanvasNodes(second, ["markdown-1", "comment-1"]);
  assert.equal(second.nodes.length, 2);
  assert.equal(duplicated.nodeIds.length, 2);
  assert.equal(duplicated.document.nodes.length, 4);
  assert.equal(duplicated.document.nodes.at(-1).position.x, 552);

  const grouped = groupCanvasNodes(duplicated.document, duplicated.nodeIds);
  const group = grouped.document.nodes.find((node) => node.id === grouped.groupId);
  assert.equal(group.type, "group");
  assert.deepEqual(group.data.childNodeIds, duplicated.nodeIds);
  assert.ok(group.size.width >= 360);
});

test("Canvas connection drop only offers compatible nodes and creates the selected edge", () => {
  const source = addCanvasNode(createDefaultCanvasDocument(), { type: "source-image", id: "source-image-1" });
  const templates = resolveCompatibleCanvasNodeTemplates(source, {
    sourceNodeId: "source-image-1",
    sourcePortId: "out_image",
  });
  assert.equal(templates.some((item) => item.type === "ai-image"), true);
  assert.equal(templates.some((item) => item.type === "ai-video"), true);
  assert.equal(templates.some((item) => item.type === "ai-audio"), false);

  const template = templates.find((item) => item.type === "ai-image");
  const result = addConnectedCanvasNode(source, {
    type: template.type,
    template,
    position: { x: 420, y: 160 },
    sourceNodeId: "source-image-1",
    sourcePortId: "out_image",
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.nodes.length, 2);
  assert.equal(result.document.edges.length, 1);
  assert.equal(result.edge.sourceNodeId, "source-image-1");
  assert.equal(result.edge.targetNodeId, result.document.nodes.at(-1).id);
});

test("new generation nodes inherit persisted Canvas output defaults without mutating the template", () => {
  const template = resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-image");
  const configured = applyCanvasSettingsToTemplate(template, {
    settings: {
      defaultModels: { image: "image-default-v2" },
      generation: { imageAspectRatio: "9:16", imageSize: "2K" },
    },
  });
  assert.equal(configured.defaultData.modelCode, "image-default-v2");
  assert.equal(configured.defaultData.imageAspectRatio, "9:16");
  assert.equal(configured.defaultData.parameterValues.aspectRatio, "9:16");
  assert.equal(configured.defaultData.parameterValues.quality, "2K");
  assert.notEqual(configured.defaultData, template.defaultData);
});

test("Canvas output defaults can explicitly follow the node settings", () => {
  const imageTemplate = resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-image");
  const videoTemplate = resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-video");
  const image = applyCanvasSettingsToTemplate(imageTemplate, {
    settings: { defaultModels: { image: "image-default-v2" }, generation: { imageFollowNode: true, imageAspectRatio: "9:16" } },
  });
  const video = applyCanvasSettingsToTemplate(videoTemplate, {
    settings: { defaultModels: { video: "video-default-v2" }, generation: { videoFollowNode: true, videoResolution: "4K" } },
  });
  assert.equal(image.defaultData.modelCode, "image-default-v2");
  assert.equal(image.defaultData.imageAspectRatio, undefined);
  assert.equal(video.defaultData.modelCode, "video-default-v2");
  assert.equal(video.defaultData.videoResolution, undefined);
});

test("Canvas Markdown preview renders structured content safely and ships import/export controls", () => {
  const html = renderCanvasMarkdownPreview(`# 标题\n\n- **重点**\n- [文档](https://example.com/docs)\n\n| 名称 | 状态 |\n| --- | --- |\n| Canvas | 完成 |\n\n\`code\`\n\n<script>alert(1)</script>`);
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<ul>[\s\S]*<strong>重点<\/strong>/);
  assert.match(html, /<table>[\s\S]*Canvas[\s\S]*完成/);
  assert.match(html, /<code>code<\/code>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  const projectDetailSource = readFileSync("apps/web/src/features/production-workbench/project-detail.js", "utf8");
  const markdownNodeSource = readFileSync("apps/web/src/features/production-workbench/canvas/canvas-markdown-node.js", "utf8");
  const graphSource = readFileSync("apps/web/src/features/production-workbench/canvas/canvas-x6-graph.js", "utf8");
  const workbenchSource = readFileSync("apps/web/src/features/production-workbench/index.js", "utf8");
  assert.match(markdownNodeSource, /set-canvas-markdown-mode/);
  assert.doesNotMatch(projectDetailSource, /data-canvas-markdown-input/);
  assert.match(graphSource, /data-canvas-markdown-input/);
  assert.match(graphSource, /data-action="export-canvas-markdown"/);
  assert.match(workbenchSource, /text\/markdown;charset=utf-8/);
  assert.match(workbenchSource, /URL\.revokeObjectURL\(url\)/);
  assert.doesNotMatch(workbenchSource.slice(workbenchSource.indexOf("export function exportCanvasMarkdownFile"), workbenchSource.indexOf("function canvasMarkdownPlainText")), /window\.open/);
});
