import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCanvasAnimationSpritePrompt,
  CANVAS_ANIMATION_FRAME_COUNTS,
  normalizeCanvasAnimationNode,
  normalizeCanvasAnimationState,
  renderCanvasAnimationControls,
  renderCanvasAnimationNodeBody,
  resolveCanvasAnimationArtifactPatch,
  resolveCanvasAnimationFrameGeometry,
  resolveCanvasAnimationSheetAspectRatio,
} from "../src/features/production-workbench/canvas/canvas-animation-node.js";
import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import {
  addCanvasNode,
  applyCanvasRunResult,
  buildCanvasRunPreview,
  resolveCanvasNodeTemplates,
  updateCanvasNodeData,
} from "../src/features/production-workbench/canvas/canvas-state.js";
import { canvasDocumentToX6Data } from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import { buildCanvasGenerationBatchNodes } from "../src/features/production-workbench/index.js";

test("Canvas animation state supports the v0.6.7 actions, frame counts, and grids", () => {
  assert.deepEqual(CANVAS_ANIMATION_FRAME_COUNTS, [6, 8, 10, 12, 16, 20]);
  assert.deepEqual(normalizeCanvasAnimationState(), {
    action: "idle",
    actionLabel: "待机",
    frames: 8,
    grid: { cols: 4, rows: 2 },
    previewMode: "playing",
  });
  assert.deepEqual(normalizeCanvasAnimationState({
    animationAction: "attack",
    animationFrames: 20,
    animationPreviewMode: "sheet",
  }), {
    action: "attack",
    actionLabel: "攻击",
    frames: 20,
    grid: { cols: 5, rows: 4 },
    previewMode: "sheet",
  });
  assert.equal(normalizeCanvasAnimationState({ animationAction: "bad", animationFrames: 7 }).action, "idle");
  assert.equal(normalizeCanvasAnimationState({ animationAction: "bad", animationFrames: 7 }).frames, 8);
  assert.equal(resolveCanvasAnimationSheetAspectRatio(6), "3:2");
  assert.equal(resolveCanvasAnimationSheetAspectRatio(10), "21:9");
  assert.equal(resolveCanvasAnimationSheetAspectRatio(16), "1:1");
});

test("Canvas animation prompt locks one character to an ordered Sprite Sheet grid", () => {
  const prompt = buildCanvasAnimationSpritePrompt("A red-haired mechanic", {
    animationAction: "run",
    animationFrames: 12,
    sheetAspectRatio: "4:3",
  });

  assert.match(prompt, /A red-haired mechanic/);
  assert.match(prompt, /奔跑 character animation Sprite Sheet with exactly 12 frames/);
  assert.match(prompt, /4 column by 3 row grid/);
  assert.match(prompt, /aspect ratio is 4:3/);
  assert.match(prompt, /left-to-right, top-to-bottom playback order/);
  assert.match(prompt, /same single character, scale, camera, lighting, colors and body proportions/);
  assert.match(prompt, /final frame leads into the first without repeating the first frame/);
});

test("Canvas animation frame geometry crops a two-row sheet without stretching frames", () => {
  const geometry = resolveCanvasAnimationFrameGeometry({
    animationAction: "walk",
    animationFrames: 8,
    imageWidth: 2048,
    imageHeight: 1024,
  });

  assert.equal(geometry.sheetAspect, 2);
  assert.equal(geometry.cellWidth, 100);
  assert.equal(geometry.cellHeight, 100);
  assert.equal(geometry.imageWidth, 400);
  assert.equal(geometry.imageHeight, 200);
  assert.deepEqual(geometry.positions.slice(0, 5), [
    { x: 0, y: 0 },
    { x: -100, y: 0 },
    { x: -200, y: 0 },
    { x: -300, y: 0 },
    { x: 0, y: -100 },
  ]);
});

test("Canvas animation node renders playing and static Sprite Sheet previews", () => {
  const playingHtml = renderCanvasAnimationNodeBody({
    id: "animation-1",
    data: {
      animationAction: "walk",
      animationFrames: 8,
      animationPreviewMode: "playing",
      imageUrl: "https://cdn.test/sheet.png?a=1&b=2",
      imageWidth: 2048,
      imageHeight: 1024,
    },
  });
  assert.match(playingHtml, /class="canvas-animation-frame"/);
  assert.match(playingHtml, /<animate attributeName="x"/);
  assert.match(playingHtml, /dur="1000ms" calcMode="discrete" repeatCount="indefinite"/);
  assert.match(playingHtml, /values="0;-100;-200;-300;0;-100;-200;-300"/);
  assert.match(playingHtml, /sheet\.png\?a=1&amp;b=2/);
  assert.match(playingHtml, /data-action="set-canvas-animation-preview-mode"/);
  assert.match(playingHtml, /data-preview-mode="sheet"/);
  assert.match(playingHtml, /行走/);
  assert.match(playingHtml, /8 帧/);
  assert.match(playingHtml, /4×2 Sprite Sheet/);

  const sheetHtml = renderCanvasAnimationNodeBody({
    id: "animation-1",
    data: { animationAction: "walk", animationFrames: 8, animationPreviewMode: "sheet", imageUrl: "/sheet.png" },
  });
  assert.match(sheetHtml, /class="canvas-animation-sheet"/);
  assert.match(sheetHtml, /alt="行走 Sprite Sheet"/);
  assert.doesNotMatch(sheetHtml, /<animate /);

  const unsafeHtml = renderCanvasAnimationNodeBody({
    id: "animation-unsafe",
    data: { imageUrl: "javascript:alert(1)", animationPreviewMode: "sheet" },
  });
  assert.doesNotMatch(unsafeHtml, /javascript:/);
  assert.match(unsafeHtml, /描述角色并生成动画/);
});

test("Canvas animation editor exposes every action and supported frame count", () => {
  const html = renderCanvasAnimationControls({
    id: "animation-controls",
    data: { animationAction: "hit", animationFrames: 20 },
  });

  for (const action of ["idle", "walk", "run", "jump", "attack", "hit"]) {
    assert.match(html, new RegExp(`data-animation-action="${action}"`));
  }
  for (const count of CANVAS_ANIMATION_FRAME_COUNTS) {
    assert.match(html, new RegExp(`<option value="${count}"`));
  }
  assert.match(html, /data-animation-action="hit"[^>]*aria-pressed="true"/);
  assert.match(html, /<option value="20" selected>20 帧<\/option>/);
});

test("legacy animation nodes normalize to image Sprite Sheet ports without changing node identity", () => {
  const legacy = {
    id: "legacy-animation",
    type: "ai-animation",
    position: { x: 10, y: 20 },
    data: {
      mediaKind: "video",
      ports: { inputs: [], outputs: [{ id: "out_video", kind: "video" }] },
    },
  };
  const normalized = normalizeCanvasAnimationNode(legacy);

  assert.equal(normalized.id, legacy.id);
  assert.deepEqual(normalized.position, legacy.position);
  assert.equal(normalized.data.mediaKind, "image");
  assert.deepEqual(normalized.data.ports.outputs, [{ id: "out_image", kind: "image", label: "Sprite Sheet" }]);
  assert.equal(normalized.data.animationFrames, 8);
  assert.equal(normalized.data.animationPreviewMode, "playing");
});

test("animation templates select image models and build image generation previews", () => {
  const templates = resolveCanvasNodeTemplates({
    models: [
      { modelCode: "image-model", modelLabel: "Image", mediaType: "image", enabled: true },
      { modelCode: "video-model", modelLabel: "Video", mediaType: "video", enabled: true },
    ],
  });
  const animationTemplate = templates.find((template) => template.type === "ai-animation");

  assert.equal(animationTemplate.mediaKind, "image");
  assert.equal(animationTemplate.defaultData.mediaKind, "image");
  assert.equal(animationTemplate.defaultData.modelCode, "image-model");
  assert.equal(animationTemplate.defaultData.animationFrames, 8);

  let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-animation" }), {
    id: "animation-node",
    type: "ai-animation",
  });
  document = updateCanvasNodeData(document, "animation-node", {
    prompt: "像素风女剑士",
    modelCode: "image-model",
    animationAction: "attack",
    animationFrames: 10,
  });
  const node = document.nodes[0];
  const preview = buildCanvasRunPreview(document, node.id);

  assert.equal(node.data.mediaKind, "image");
  assert.deepEqual(node.data.ports.outputs, [{ id: "out_image", kind: "image", label: "Sprite Sheet" }]);
  assert.equal(preview.ok, true);
  assert.equal(preview.mediaKind, "image");
  assert.equal(preview.animationAction, "attack");
  assert.equal(preview.animationFrames, 10);
  assert.deepEqual(preview.animationGrid, { cols: 5, rows: 2 });
  assert.equal(preview.animationSheetAspectRatio, "21:9");
  assert.equal(preview.sourcePrompt, "像素风女剑士");
  assert.match(preview.prompt, /攻击 character animation Sprite Sheet with exactly 10 frames/);
});

test("animation generation writes stable image Artifact identity and dimensions back to the node", () => {
  let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-animation-result" }), {
    id: "animation-result",
    type: "ai-animation",
  });
  document = updateCanvasNodeData(document, "animation-result", {
    prompt: "机器人待机",
    modelCode: "image-model",
  });
  const preview = buildCanvasRunPreview(document, "animation-result");
  const task = {
    taskId: "task-animation-1",
    status: "succeeded",
    artifact: { id: "artifact-animation-1", metadata: { width: 2048, height: 1024 } },
    result: {
      imageUrl: "https://cdn.test/animation-sheet.png",
      assetVersionId: "asset-version-animation-1",
      storageObjectId: "storage-animation-1",
    },
  };
  const patch = resolveCanvasAnimationArtifactPatch(task, task.result.imageUrl);
  const completed = applyCanvasRunResult(document, preview, task);
  const node = completed.nodes[0];

  assert.deepEqual(patch, {
    imageUrl: "https://cdn.test/animation-sheet.png",
    thumbnailUrl: "https://cdn.test/animation-sheet.png",
    output: "https://cdn.test/animation-sheet.png",
    artifactId: "artifact-animation-1",
    assetVersionId: "asset-version-animation-1",
    storageObjectId: "storage-animation-1",
    imageWidth: 2048,
    width: 2048,
    imageHeight: 1024,
    height: 1024,
  });
  assert.equal(node.data.status, "completed");
  assert.equal(node.data.imageUrl, task.result.imageUrl);
  assert.equal(node.data.previewUrl, task.result.imageUrl);
  assert.equal(node.data.artifactId, "artifact-animation-1");
  assert.equal(node.data.assetVersionId, "asset-version-animation-1");
  assert.equal(node.data.storageObjectId, "storage-animation-1");
  assert.equal(node.data.imageWidth, 2048);
  assert.equal(node.data.imageHeight, 1024);
});

test("animation batch execution reuses the image backend with fixed Sprite Sheet parameters", () => {
  let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-animation-batch" }), {
    id: "animation-batch",
    type: "ai-animation",
  });
  document = updateCanvasNodeData(document, "animation-batch", {
    prompt: "蒸汽朋克角色奔跑",
    modelCode: "image-model",
    animationAction: "run",
    animationFrames: 12,
  });
  const nodes = buildCanvasGenerationBatchNodes({
    ui: {
      canvasDocument: document,
      episodeGenerationConfig: {
        models: [{ modelCode: "image-model", mediaType: "image", enabled: true }],
      },
    },
    state: { project: { aspectRatio: "9:16" } },
  }, ["animation-batch"]);

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].mediaKind, "image");
  assert.equal(nodes[0].payload.kind, "image");
  assert.equal(nodes[0].payload.mediaKind, "image");
  assert.match(nodes[0].payload.prompt, /奔跑 character animation Sprite Sheet with exactly 12 frames/);
  assert.equal(nodes[0].payload.parameters.count, 1);
  assert.equal(nodes[0].payload.parameters.aspectRatio, "4:3");
  assert.equal(nodes[0].payload.parameters.imageAspectRatio, "4:3");
  assert.equal(nodes[0].payload.parameters.animationAction, "run");
  assert.equal(nodes[0].payload.parameters.animationFrames, 12);
  assert.deepEqual(nodes[0].payload.parameters.animationGrid, { cols: 4, rows: 3 });
  assert.equal(nodes[0].payload.parameters.outputKind, "sprite-sheet");
});

test("animation nodes use the rich X6 HTML shape and the host wires image generation controls", () => {
  const document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-animation-x6" }), {
    id: "animation-x6",
    type: "ai-animation",
  });
  const x6Node = canvasDocumentToX6Data(document).nodes[0];
  assert.equal(x6Node.shape, "comic-ai-canvas-special-media-node");
  assert.equal(x6Node.ports.items.find((port) => port.group === "out").data.kind, "image");

  const projectDetailSource = readFileSync(
    new URL("../src/features/production-workbench/project-detail.js", import.meta.url),
    "utf8",
  );
  const hostSource = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const graphSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );

  assert.match(projectDetailSource, /renderLiblibAnimationNode\(node, options\)/);
  assert.match(projectDetailSource, /renderCanvasAnimationControls\(node\)/);
  assert.match(hostSource, /data-canvas-animation-frames/);
  assert.match(hostSource, /parameters\.outputKind = "sprite-sheet"/);
  assert.match(hostSource, /node\.type === "ai-animation" \? "image"/);
  assert.match(graphSource, /renderCanvasAnimationNodeBody\(node\)/);
  assert.match(css, /\.canvas-animation-preview-switch/);
  assert.match(css, /\.canvas-animation-action-picker/);
});
