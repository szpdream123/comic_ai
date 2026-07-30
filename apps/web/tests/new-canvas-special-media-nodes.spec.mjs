import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCanvasPanoramaDrag,
  applyCanvasPanoramaZoom,
  calculateCanvasStoryboardSourceRect,
  normalizeCanvasPanoramaView,
  normalizeCanvasStoryboardCells,
  normalizeCanvasStoryboardGrid,
  renderCanvasPanoramaNodeBody,
  renderCanvasStoryboardNodeBody,
  resizeCanvasStoryboardGridPositions,
  syncCanvasStoryboardGridAspectRatio,
  updateCanvasStoryboardGridPosition,
} from "../src/features/new-canvas/special-media-nodes.js";
import { createDefaultCanvasDocument } from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { addCanvasNode } from "../src/features/production-workbench/canvas/canvas-state.js";
import { canvasDocumentToX6Data } from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import { resolveCanvasHtmlShape } from "../src/features/production-workbench/canvas/canvas-x6-graph.js";

test("new Canvas panorama view normalizes invalid and out-of-range values", () => {
  assert.deepEqual(normalizeCanvasPanoramaView(), { yaw: 180, pitch: 0, fov: 95 });
  assert.deepEqual(
    normalizeCanvasPanoramaView({ yaw: 900, pitch: -120, fov: 5 }),
    { yaw: 180, pitch: -85, fov: 35 },
  );
  assert.deepEqual(
    normalizeCanvasPanoramaView({ panoramaYaw: "-21.25", panoramaPitch: "12.5", panoramaFov: "101" }),
    { yaw: -21.25, pitch: 12.5, fov: 101 },
  );
  assert.deepEqual(
    normalizeCanvasPanoramaView({ yaw: Number.NaN, pitch: Number.POSITIVE_INFINITY, fov: "bad" }),
    { yaw: 180, pitch: 0, fov: 95 },
  );
});

test("new Canvas panorama drag and zoom are immutable and bounded", () => {
  const original = { yaw: 10, pitch: 5, fov: 80 };
  assert.deepEqual(
    applyCanvasPanoramaDrag(original, { deltaX: 100, deltaY: -50 }),
    { yaw: -8, pitch: -4, fov: 80 },
  );
  assert.deepEqual(original, { yaw: 10, pitch: 5, fov: 80 });
  assert.deepEqual(
    applyCanvasPanoramaDrag({ yaw: -179, pitch: 84, fov: 80 }, { deltaX: 100, deltaY: 100 }),
    { yaw: -180, pitch: 85, fov: 80 },
  );
  assert.deepEqual(applyCanvasPanoramaZoom(original, { deltaY: 100 }), { yaw: 10, pitch: 5, fov: 85 });
  assert.equal(applyCanvasPanoramaZoom(original, -5000).fov, 35);
});

test("new Canvas panorama body exposes image and interactive 3D actions", () => {
  const html = renderCanvasPanoramaNodeBody({
    id: "pano-1",
    data: {
      title: "场景 <一>",
      imageUrl: "/api/storage/pano?a=1&b=2",
      previewMode: "360",
      panoramaView: { yaw: 12, pitch: -3, fov: 70 },
    },
  });
  assert.match(html, /data-canvas-panorama-body/);
  assert.match(html, /class="canvas-panorama-node-body is-3d"/);
  assert.match(html, /role="application" tabindex="0"/);
  assert.match(html, /data-panorama-drag-target/);
  assert.match(html, /data-panorama-three-root/);
  assert.match(html, /data-panorama-three-canvas/);
  assert.match(html, /data-panorama-yaw="12" data-panorama-pitch="-3" data-panorama-fov="70"/);
  assert.match(html, /data-action="zoom-canvas-panorama"/);
  assert.match(html, /data-action="capture-canvas-panorama-view"/);
  assert.match(html, /data-action="toggle-canvas-panorama-fullscreen"/);
  assert.match(html, /src="\/api\/storage\/pano\?a=1&amp;b=2"/);
  assert.doesNotMatch(html, /场景 <一>/);

  const imageHtml = renderCanvasPanoramaNodeBody({ data: { imageUrl: "https://cdn.test/pano.jpg", previewMode: "image" } });
  assert.match(imageHtml, /canvas-panorama-image-preview/);
  assert.doesNotMatch(imageHtml, /data-panorama-drag-target/);
  assert.doesNotMatch(imageHtml, /data-panorama-three-canvas/);
});

test("new Canvas panorama body rejects unsafe URLs and keeps empty actions accessible", () => {
  const html = renderCanvasPanoramaNodeBody({
    id: 'pano"><script>alert(1)</script>',
    data: { label: '<img src=x onerror="alert(1)">', imageUrl: "javascript:alert(1)", previewMode: "3d" },
  });
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /<script>/i);
  assert.doesNotMatch(html, /<img src=x/i);
  assert.match(html, /data-action="pick-canvas-panorama-file"/);
  assert.match(html, /disabled aria-disabled="true"/);
  assert.doesNotMatch(renderCanvasPanoramaNodeBody({ data: { imageUrl: "tauri://asset/local.png" } }), /tauri:/i);
});

test("new Canvas storyboard normalizes uniform and custom grids", () => {
  const uniform = normalizeCanvasStoryboardGrid({ storyboardRows: 2, storyboardCols: 3 });
  assert.deepEqual(uniform, {
    mode: "uniform",
    rows: 2,
    columns: 3,
    rowBoundaries: [0, 50, 100],
    columnBoundaries: [0, 33.333333, 66.666667, 100],
    rowPositions: [50],
    columnPositions: [33.333333, 66.666667],
    cellCount: 6,
  });

  const custom = normalizeCanvasStoryboardGrid({
    storyboardRows: 9,
    storyboardCols: 2,
    storyboardRowPositions: [70, 20, 70, -1, 101, "bad"],
    storyboardGridMode: "custom",
  });
  assert.equal(custom.mode, "custom");
  assert.equal(custom.rows, 3);
  assert.equal(custom.columns, 2);
  assert.deepEqual(custom.rowBoundaries, [0, 20, 70, 100]);
  assert.deepEqual(custom.columnBoundaries, [0, 50, 100]);

  const explicitUniform = normalizeCanvasStoryboardGrid({
    storyboardRows: 2,
    storyboardCols: 2,
    storyboardRowPositions: [20, 70],
    storyboardColPositions: [40],
    storyboardGridMode: "uniform",
  });
  assert.equal(explicitUniform.mode, "uniform");
  assert.deepEqual(explicitUniform.rowBoundaries, [0, 50, 100]);
  assert.deepEqual(explicitUniform.columnBoundaries, [0, 50, 100]);
});

test("new Canvas storyboard resizes custom axes and clamps edited divider positions", () => {
  assert.deepEqual(resizeCanvasStoryboardGridPositions([], 3), [33.333333, 66.666667]);
  assert.deepEqual(resizeCanvasStoryboardGridPositions([25, 75], 4), [25, 50, 75]);
  assert.deepEqual(resizeCanvasStoryboardGridPositions([20, 40, 70], 2), [20]);
  assert.deepEqual(updateCanvasStoryboardGridPosition([20, 50, 80], 1, 95), [20, 79.9, 80]);
  assert.deepEqual(updateCanvasStoryboardGridPosition([20, 50, 80], 1, 5), [20, 20.1, 80]);
  assert.deepEqual(updateCanvasStoryboardGridPosition([20], 4, 50), [20]);
});

test("new Canvas storyboard cells preserve selection, extraction, overrides, and bounded size", () => {
  const cells = normalizeCanvasStoryboardCells({
    imageUrl: "/source.png",
    storyboardRows: 2,
    storyboardCols: 2,
    storyboardExtracted: [false, true, true, false],
    storyboardOverrides: [null, null, { url: "/override.png", label: "替换图" }, null],
    storyboardSelectedCell: 3,
    storyboardEditing: true,
  });
  assert.equal(cells.length, 4);
  assert.equal(cells[1].empty, true);
  assert.equal(cells[1].draggable, false);
  assert.equal(cells[2].empty, true);
  assert.equal(cells[2].override.label, "替换图");
  assert.equal(cells[2].draggable, false);
  assert.equal(cells[3].selected, true);
  assert.deepEqual(cells[3].sourceRect, { x: 50, y: 50, width: 50, height: 50 });

  const bounded = normalizeCanvasStoryboardCells({ imageUrl: "/source.png", storyboardRows: 500, storyboardCols: 500 });
  assert.equal(bounded.length, 144);
});

test("new Canvas storyboard computes exact source pixel rectangles", () => {
  const uniformCells = normalizeCanvasStoryboardCells({ storyboardRows: 1, storyboardCols: 3 });
  assert.deepEqual(
    uniformCells.map((cell) => calculateCanvasStoryboardSourceRect(cell, { width: 1000, height: 501 })),
    [
      { x: 0, y: 0, width: 333, height: 501, right: 333, bottom: 501, index: 0, row: 0, column: 0 },
      { x: 333, y: 0, width: 334, height: 501, right: 667, bottom: 501, index: 1, row: 0, column: 1 },
      { x: 667, y: 0, width: 333, height: 501, right: 1000, bottom: 501, index: 2, row: 0, column: 2 },
    ],
  );

  const customCell = normalizeCanvasStoryboardCells({
    storyboardGridMode: "custom",
    storyboardRowPositions: [25],
    storyboardColPositions: [40],
  })[3];
  assert.deepEqual(
    calculateCanvasStoryboardSourceRect(customCell, 1200, 800),
    { x: 480, y: 200, width: 720, height: 600, right: 1200, bottom: 800, index: 3, row: 1, column: 1 },
  );
  assert.equal(calculateCanvasStoryboardSourceRect(customCell, { width: 0, height: 800 }), null);
});

test("new Canvas storyboard body renders keyboard and mobile-operable cell actions safely", () => {
  const html = renderCanvasStoryboardNodeBody({
    id: "board-1",
    data: {
      title: '分镜 <script>alert("x")</script>',
      imageUrl: "/source?a=1&b=2",
      storyboardRows: 1,
      storyboardCols: 2,
      storyboardEditing: true,
      storyboardSelectedCell: 0,
      storyboardExtracted: [false, true],
    },
  });
  assert.match(html, /role="grid" aria-label="分镜格" aria-rowcount="1" aria-colcount="2"/);
  assert.match(html, /role="gridcell"[^>]*aria-selected="true"/);
  assert.match(html, /data-action="select-canvas-storyboard-cell"/);
  assert.match(html, /data-action="extract-canvas-storyboard-cell"[^>]*data-storyboard-drag-source/);
  assert.doesNotMatch(html, /draggable="true"/);
  assert.match(html, /style="touch-action:none"/);
  assert.match(html, /data-tooltip="拖动剪切图片"/);
  assert.match(html, /aria-label="拖动剪切分镜 1-1图片"[^>]*data-tooltip="拖动剪切图片"[^>]*><svg/);
  assert.match(html, /data-storyboard-empty="true"/);
  assert.match(html, /canvas-storyboard-cell-return-mark/);
  assert.match(html, /src="\/source\?a=1&amp;b=2"/);
  assert.doesNotMatch(html, /<script>/i);

  const unsafe = renderCanvasStoryboardNodeBody({
    data: { imageUrl: "javascript:alert(1)", error: "失败 <b>详情</b>" },
  });
  assert.doesNotMatch(unsafe, /javascript:/i);
  assert.match(unsafe, /data-action="pick-canvas-storyboard-image"/);
  assert.match(unsafe, /失败 &lt;b&gt;详情&lt;\/b&gt;/);

  const customEditor = renderCanvasStoryboardNodeBody({
    id: "board-custom",
    data: {
      imageUrl: "/source.png",
      storyboardGridMode: "custom",
      storyboardRows: 2,
      storyboardCols: 3,
      storyboardRowPositions: [35],
      storyboardColPositions: [25, 70],
      storyboardEditing: true,
    },
  });
  assert.match(customEditor, /data-action="adjust-canvas-storyboard-grid-axis"/);
  assert.match(customEditor, /data-storyboard-axis="rows"/);
  assert.match(customEditor, /data-storyboard-axis="columns"/);
  assert.match(customEditor, /data-canvas-storyboard-position-input/);
  assert.match(customEditor, /value="35"/);
  assert.match(customEditor, /value="70"/);
});

test("new Canvas storyboard shows a blocking preparation mask while extracting a cell", () => {
  const html = renderCanvasStoryboardNodeBody({
    id: "storyboard-preparing",
    data: {
      imageUrl: "https://example.com/storyboard.png",
      storyboardEditing: true,
      storyboardPreparing: true,
      storyboardRows: 1,
      storyboardCols: 1,
    },
  });

  assert.match(html, /class="canvas-storyboard-node-body[^\"]*is-preparing/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /canvas-storyboard-preparing-mask canvas-image-generation-mask/);
  assert.match(html, /正在准备分镜图片中/);
});

test("new Canvas storyboard uses the loaded source dimensions without stretching cells", () => {
  const properties = new Map();
  const grid = {
    dataset: {},
    style: { setProperty: (key, value) => properties.set(key, value) },
    querySelector: () => ({ naturalWidth: 1920, naturalHeight: 1080 }),
  };

  assert.equal(syncCanvasStoryboardGridAspectRatio({ querySelector: () => grid }), true);
  assert.equal(properties.get("--canvas-storyboard-source-aspect"), "1920 / 1080");
  assert.equal(grid.dataset.storyboardSourceAspect, "1920:1080");
});

test("new Canvas panorama and storyboard use interactive X6 HTML shapes", () => {
  let document = createDefaultCanvasDocument({ canvasProjectId: "canvas-special" });
  document = addCanvasNode(document, { id: "pano-1", type: "ai-panorama" });
  document = addCanvasNode(document, { id: "story-1", type: "ai-storyboard" });
  document = addCanvasNode(document, { id: "text-1", type: "ai-text" });
  const x6Data = canvasDocumentToX6Data(document);
  assert.equal(x6Data.nodes.find((node) => node.id === "pano-1").shape, "comic-ai-canvas-special-media-node");
  assert.equal(x6Data.nodes.find((node) => node.id === "story-1").shape, "comic-ai-canvas-special-media-node");
  assert.equal(x6Data.nodes.find((node) => node.id === "text-1").shape, "comic-ai-canvas-node");
  assert.equal("attrs" in x6Data.nodes.find((node) => node.id === "pano-1"), false);
});

test("X6 HTML shape resolves from the browser bundle namespace", () => {
  const browserHtmlShape = { register() {} };
  assert.equal(resolveCanvasHtmlShape({ Shape: { HTML: browserHtmlShape } }), browserHtmlShape);
  assert.equal(resolveCanvasHtmlShape({ HTML: browserHtmlShape }), browserHtmlShape);
  assert.equal(resolveCanvasHtmlShape({ Shape: {} }), null);
});
