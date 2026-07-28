import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_NODE_TOOLBAR_MANIFEST,
  resolveCanvasNodeToolbarMediaKind,
  resolveCanvasNodeToolbarTools,
} from "../src/features/production-workbench/canvas/canvas-node-toolbar.js";

test("Canvas image node toolbar reuses every supported media drawer tool", () => {
  assert.deepEqual(resolveCanvasNodeToolbarTools("ai-image"), [
    { id: "crop", label: "裁剪", action: "open", mediaTool: "crop", icon: "mdi:crop" },
    { id: "outpaint", label: "扩图", action: "open", mediaTool: "outpaint", icon: "mdi:arrow-expand-all" },
    { id: "remove-background", label: "抠图", action: "open", mediaTool: "remove_background", icon: "mdi:hexagon-outline" },
    { id: "camera-studio", label: "摄影棚", action: "open", mediaTool: "camera_studio", icon: "mdi:camera-control" },
    { id: "annotation", label: "标注", action: "open", mediaTool: "annotation", icon: "mdi:draw-pen" },
    { id: "batch-grid", label: "宫格", action: "open", mediaTool: "batch_grid", icon: "mdi:grid" },
    { id: "composite", label: "合成", action: "open", mediaTool: "composite", icon: "mdi:layers-triple-outline" },
    { id: "history", label: "历史", action: "set-canvas-sidebar-mode", mediaTool: "history", icon: "mdi:history" },
  ]);
});

test("Canvas video and audio node toolbars reuse their existing host actions", () => {
  assert.deepEqual(resolveCanvasNodeToolbarTools("source-video"), [
    { id: "capture-frame", label: "截帧", action: "capture-canvas-video-frame", mediaTool: null, icon: "mdi:camera-outline" },
    { id: "fullscreen", label: "全屏", action: "toggle-canvas-video-fullscreen", mediaTool: null, icon: "mdi:fullscreen" },
  ]);
  assert.deepEqual(resolveCanvasNodeToolbarTools("ai-audio"), [
    { id: "transcription", label: "转录", action: "set-canvas-audio-generation-mode", mediaTool: "transcription", icon: "mdi:text-box-search-outline" },
    { id: "toggle-play", label: "播放", action: "toggle-canvas-audio-play", mediaTool: null, icon: "mdi:play-pause" },
  ]);
});

test("Canvas toolbar media kind follows explicit media data and special image node types", () => {
  assert.equal(resolveCanvasNodeToolbarMediaKind({ type: "upload", data: { mediaKind: "video" } }), "video");
  assert.equal(resolveCanvasNodeToolbarMediaKind({ type: "send", data: { mediaKind: "audio" } }), "audio");
  assert.equal(resolveCanvasNodeToolbarMediaKind({ type: "ai-animation", data: { mediaKind: "image" } }), "image");
  assert.equal(resolveCanvasNodeToolbarMediaKind("ai-panorama"), "image");
  assert.equal(resolveCanvasNodeToolbarMediaKind("ai-storyboard"), "image");
});

test("Canvas toolbar returns no tools for text or unknown nodes", () => {
  assert.deepEqual(resolveCanvasNodeToolbarTools("ai-text"), []);
  assert.deepEqual(resolveCanvasNodeToolbarTools({ type: "upload", data: { mediaKind: "text" } }), []);
  assert.deepEqual(resolveCanvasNodeToolbarTools(null), []);
});

test("Canvas toolbar manifest and descriptors are immutable shared definitions", () => {
  assert.equal(Object.isFrozen(CANVAS_NODE_TOOLBAR_MANIFEST), true);
  assert.equal(Object.isFrozen(CANVAS_NODE_TOOLBAR_MANIFEST.image), true);
  assert.equal(Object.isFrozen(CANVAS_NODE_TOOLBAR_MANIFEST.image[0]), true);
  assert.equal(resolveCanvasNodeToolbarTools("image"), CANVAS_NODE_TOOLBAR_MANIFEST.image);
});
