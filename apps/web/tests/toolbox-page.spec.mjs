import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  clearToolboxWatermarkRemovalMask,
  renderToolboxPage,
  setToolboxPromptReverseGuideOpen,
  setToolboxPromptReverseKind,
  setToolboxVideoDepthGuideOpen,
  setToolboxWatermarkRemovalBrushSize,
  setToolboxWatermarkRemovalFile,
  setToolboxWatermarkRemovalGuideOpen,
  setToolboxWatermarkRemovalTool,
  undoToolboxWatermarkRemovalMask,
} from "../src/features/toolbox/toolbox-page.js";
import {
  applyToolboxWatermarkRemovalSelectionForTest,
  deriveInitialNavTabForTest,
  handleWorkbenchActionForTest,
  readWorkbenchRouteTokenForTest,
  updateToolboxWatermarkRemovalProgressForTest,
} from "../src/features/production-workbench/index.js";
import { __browserVideoWatermarkRemovalTestUtils } from "../src/features/toolbox/browser-video-watermark-removal-client.js";

const toolboxCss = readFileSync(new URL("../src/features/toolbox/toolbox-page.css", import.meta.url), "utf8");
const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
const videoWatermarkSource = readFileSync(new URL("../src/features/toolbox/browser-video-watermark-removal-client.js", import.meta.url), "utf8");

test("toolbox page renders as an independent built-in tool directory", () => {
  const html = renderToolboxPage();

  assert.match(html, /id="toolbox-page-title">工具箱/);
  assert.match(html, /data-toolbox-tool="prompt-reverse"/);
  assert.match(html, /data-toolbox-tool="video-depth"/);
  assert.match(html, /data-toolbox-tool="watermark-removal"/);
  assert.match(html, /toolbox-watermark-card-flow/);
  assert.match(html, /原图[\s\S]*?水印[\s\S]*?清除/);
  assert.match(html, /视频转深度/);
  assert.match(html, /提示词反推/);
  assert.match(html, /图片\/视频去水印/);
  assert.match(html, /toolbox-prompt-reverse-cover-v5\.png/);
  assert.match(html, /toolbox-video-depth-cover-v3\.png/);
  assert.match(html, /图片\/视频 → 提示词/);
  assert.match(html, /视频 → 深度视频/);
  assert.match(html, /图片\/视频 → 去水印/);
  assert.match(html, /scene-3d-studio\.png/);
  assert.equal((html.match(/data-toolbox-tool=/g) ?? []).length, 3);
  assert.doesNotMatch(html, /故事板线稿|图片拆格|字幕格式转换/);
  assert.match(html, /data-action="open-toolbox-prompt-reverse"/);
  assert.match(html, /data-action="open-toolbox-video-depth"/);
  assert.match(html, /data-action="open-toolbox-watermark-removal"/);
  assert.doesNotMatch(html, /待接入/);
  assert.match(toolboxCss, /\.toolbox-page\s*\{[\s\S]*?width:\s*100%;[\s\S]*?margin:\s*0;/);
  assert.match(toolboxCss, /\.toolbox-grid\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 22rem\), 22rem\)\)/);
  assert.match(toolboxCss, /\.toolbox-card\s*\{[\s\S]*?max-width:\s*22rem;[\s\S]*?max-height:\s*22rem;/);
});

test("watermark removal renders a local canvas editor and completed result", () => {
  const ui = { toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "ready",
    fileName: "poster.png",
    fileSize: 2 * 1024 * 1024,
    previewUrl: "blob:watermark-source",
    imageWidth: 1200,
    imageHeight: 800,
    maskDirty: true,
    brushSize: 64,
    result: { downloadUrl: "blob:watermark-result", fileName: "poster-clean.png" },
  } };
  const html = renderToolboxPage(ui);

  assert.match(html, /id="toolbox-watermark-title">去水印/);
  assert.match(html, /data-toolbox-watermark-media="image"[^>]*aria-selected="true"[^>]*>图片/);
  assert.match(html, /data-toolbox-watermark-media="video"[^>]*aria-selected="false"[^>]*>视频/);
  assert.match(html, /去水印插件已安装/);
  assert.match(html, /data-action="uninstall-toolbox-watermark-removal-plugin"[^>]*>卸载/);
  assert.doesNotMatch(html, /图片仅在本机处理|视频仅在本机处理/);
  const watermarkFooter = html.match(/<footer class="toolbox-watermark-editor-footer">[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.match(watermarkFooter, /data-action="uninstall-toolbox-watermark-removal-plugin"[\s\S]*data-action="run-toolbox-watermark-removal"/);
  assert.match(html, /data-toolbox-watermark-image/);
  assert.match(html, /src="blob:watermark-source"/);
  assert.match(html, /data-toolbox-watermark-mask/);
  assert.match(html, /width="1200" height="800"/);
  assert.match(html, /toolbox-watermark-editor-footer[\s\S]*toolbox-watermark-plugin-inline/);
  assert.doesNotMatch(html, /<div class="toolbox-watermark-plugin" data-plugin-status="ready"/);
  const watermarkHeader = html.match(/<header class="toolbox-reverse-header toolbox-watermark-header">[\s\S]*?<\/header>/)?.[0] ?? "";
  assert.doesNotMatch(watermarkHeader, /toolbox-watermark-plugin/);
  assert.match(html, /data-toolbox-watermark-tool="rectangle"/);
  assert.match(html, /data-toolbox-watermark-tool="brush"/);
  assert.match(html, /data-toolbox-watermark-tool="lasso"/);
  assert.match(html, /data-action="undo-toolbox-watermark-removal-mask"/);
  assert.match(html, /data-action="clear-toolbox-watermark-removal-mask"/);
  assert.match(html, /data-action="run-toolbox-watermark-removal"/);
  assert.match(html, /blob:watermark-result/);
  assert.match(html, /download="poster-clean.png"/);
  assert.match(toolboxCss, /\.toolbox-watermark-canvas-wrap canvas\s*\{[\s\S]*?touch-action:\s*none/);
  assert.match(toolboxCss, /\.toolbox-watermark-stage\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(toolboxCss, /\.toolbox-watermark-canvas-wrap img,[\s\S]*?max-height:\s*none/);
  assert.match(toolboxCss, /\.toolbox-watermark-header \.toolbox-reverse-title h2\s*\{[\s\S]*?color:\s*var\(--text-primary/);
  assert.match(toolboxCss, /\.toolbox-watermark-header \.toolbox-reverse-title p\s*\{[\s\S]*?color:\s*var\(--text-muted/);
  assert.match(toolboxCss, /\.toolbox-watermark-editor-footer \.toolbox-reverse-run\s*\{[\s\S]*?background:\s*var\(--theme-accent-gradient/);
  assert.match(toolboxCss, /\.toolbox-watermark-modal \.toolbox-reverse-empty-frame\s*\{[\s\S]*?background:\s*var\(--theme-control-active-background/);

  setToolboxWatermarkRemovalBrushSize(ui, 16);
  assert.equal(ui.toolboxWatermarkRemoval.brushSize, 16);
  setToolboxWatermarkRemovalTool(ui, "brush");
  assert.equal(ui.toolboxWatermarkRemoval.maskTool, "brush");
  assert.match(renderToolboxPage(ui), /data-toolbox-watermark-brush="16"/);
  ui.toolboxWatermarkRemoval.maskDataUrl = "data:image/png;base64,current";
  ui.toolboxWatermarkRemoval.maskHistory = ["data:image/png;base64,previous"];
  undoToolboxWatermarkRemovalMask(ui);
  assert.equal(ui.toolboxWatermarkRemoval.maskDataUrl, "data:image/png;base64,previous");
  assert.equal(ui.toolboxWatermarkRemoval.maskHistory.length, 0);
  clearToolboxWatermarkRemovalMask(ui);
  assert.equal(ui.toolboxWatermarkRemoval.maskDirty, false);
  setToolboxWatermarkRemovalFile(ui, { fileName: "next.webp", previewUrl: "blob:next" });
  assert.equal(ui.toolboxWatermarkRemoval.fileName, "next.webp");
});

test("watermark removal keeps video in the same workspace through the media tabs", () => {
  const html = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    mediaKind: "video",
    pluginStatus: "ready",
    fileName: "clip.mp4",
    fileSize: 8 * 1024 * 1024,
    previewUrl: "data:image/jpeg;base64,preview",
    imageWidth: 1280,
    imageHeight: 720,
    videoDuration: 12,
    maskDirty: true,
    result: { downloadUrl: "blob:watermark-video-result", fileName: "clip-watermark-removed.webm" },
  } });

  assert.match(html, /id="toolbox-watermark-title">去水印/);
  assert.match(html, /data-toolbox-watermark-media="image"[^>]*aria-selected="false"[^>]*>图片/);
  assert.match(html, /data-toolbox-watermark-media="video"[^>]*aria-selected="true"[^>]*>视频/);
  assert.equal((html.match(/data-action="set-toolbox-watermark-removal-media"/g) ?? []).length, 2);
  assert.match(html, /accept="video\/mp4,video\/webm,video\/quicktime"/);
  assert.match(html, /data-toolbox-watermark-video-preview/);
  assert.match(html, /<video src="data:image\/jpeg;base64,preview" controls playsinline preload="metadata"/);
  assert.match(html, /开始跟踪去水印/);
  assert.match(html, /<video src="blob:watermark-video-result" controls loop preload="metadata"/);
  assert.doesNotMatch(workbenchSource, /open-toolbox-video-watermark-removal/);
  assert.match(workbenchSource, /loadToolboxVideoWatermarkRemovalPreview[\s\S]*?video\.preload = "auto"[\s\S]*?seekToolboxVideoPreviewFrame\(video/);
  assert.match(workbenchSource, /async function seekToolboxVideoPreviewFrame[\s\S]*?requestVideoFrameCallback/);
  assert.match(videoWatermarkSource, /runBrowserWatermarkRemovalCanvas\(canvas, trackedMask(?:, \{ workspace: watermarkWorkspace \})?\)/);
  assert.doesNotMatch(videoWatermarkSource, /runBrowserWatermarkRemoval\(sourceBlob/);
  assert.match(videoWatermarkSource, /async function loadMaskCanvas[\s\S]*?loadImage\(maskDataUrl\)[\s\S]*?function loadImage/);
  assert.match(videoWatermarkSource, /message: "正在去除水印中"/);
  assert.doesNotMatch(videoWatermarkSource, /正在跟踪并修复/);
  assert.match(videoWatermarkSource, /readBrowserVideoSourceFrameRate\(file\)/);
  assert.match(videoWatermarkSource, /fps: outputFrameRate/);
  assert.match(toolboxCss, /\.toolbox-watermark-header-center\s*\{[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translateX\(-50%\)/);
});

test("video watermark tracker follows a marked region between frames", () => {
  const { findMaskBounds, findBestTrackedPosition, resolveOutputFrameRate } = __browserVideoWatermarkRemovalTestUtils;
  const mask = new Uint8ClampedArray(12 * 10 * 4);
  for (let y = 3; y < 7; y += 1) {
    for (let x = 4; x < 9; x += 1) mask[(y * 12 + x) * 4 + 3] = 255;
  }
  assert.deepEqual(findMaskBounds(mask, 12, 10), { left: 4, top: 3, width: 5, height: 4 });

  const width = 64;
  const height = 48;
  const bounds = { left: 16, top: 12, width: 12, height: 8 };
  const samples = [];
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const value = 40 + ((x * 17 + y * 29) % 180);
      const offset = ((bounds.top + y) * width + bounds.left + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      if ((x + y) % 3 === 0) samples.push({ x, y, value });
    }
  }
  const nextPixels = new Uint8ClampedArray(width * height * 4);
  const shift = { left: 20, top: 16 };
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const source = ((bounds.top + y) * width + bounds.left + x) * 4;
      const target = ((shift.top + y) * width + shift.left + x) * 4;
      nextPixels[target] = pixels[source];
      nextPixels[target + 1] = pixels[source + 1];
      nextPixels[target + 2] = pixels[source + 2];
    }
  }
  assert.deepEqual(findBestTrackedPosition(nextPixels, width, height, bounds, samples, bounds), shift);
  assert.equal(resolveOutputFrameRate(30), 12);
  assert.equal(resolveOutputFrameRate(6), 6);
  assert.equal(resolveOutputFrameRate(0), 6);
});

test("watermark removal prompts installation and exposes the install action", () => {
  const html = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "not-installed",
  } });

  assert.match(html, /去除水印请先安装插件/);
  assert.doesNotMatch(html, /去除水印请先安装插件，/);
  assert.match(html, /data-action="install-toolbox-watermark-removal-plugin">安装/);
  assert.doesNotMatch(html, /uninstall-toolbox-watermark-removal-plugin/);
});

test("watermark removal installation displays percentage progress without punctuation", () => {
  const html = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "installing",
    installMessage: "正在下载本地去水印模型",
    installProgress: 42,
  } });

  assert.match(html, /正在安装插件 42%/);
  assert.doesNotMatch(html, /正在下载本地去水印模型|·/);
  assert.doesNotMatch(html, /toolbox-watermark-plugin[^>]*>[\s\S]*?toolbox-depth-plugin-dot/);
});

test("watermark removal progress updates its modal without rebuilding the workbench", () => {
  const label = { textContent: "0%" };
  const message = { textContent: "" };
  const bar = { style: {} };
  const progress = {
    hidden: true,
    querySelector(selector) {
      if (selector.includes("progress-bar")) return bar;
      if (selector.includes("progress-label")) return label;
      return null;
    },
  };
  const modal = {
    querySelector(selector) {
      if (selector.includes("progress-message")) return message;
      if (selector === "[data-toolbox-watermark-progress]") return progress;
      return null;
    },
  };
  const workbench = {
    root: { querySelector: (selector) => selector === ".toolbox-watermark-modal" ? modal : null },
    ui: { toolboxWatermarkRemoval: { progress: 37, statusMessage: "正在去除水印中" } },
  };

  assert.equal(updateToolboxWatermarkRemovalProgressForTest(workbench), true);
  assert.equal(progress.hidden, false);
  assert.equal(bar.style.width, "37%");
  assert.equal(label.textContent, "37%");
  assert.equal(message.textContent, "正在去除水印中");
});

test("watermark removal drag selection creates a rectangle and enables processing", () => {
  const snapshot = { id: "initial-mask" };
  const calls = [];
  const context = {
    getImageData: (...args) => {
      calls.push(["getImageData", ...args]);
      return snapshot;
    },
    putImageData: (...args) => calls.push(["putImageData", ...args]),
    save: () => calls.push(["save"]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    restore: () => calls.push(["restore"]),
  };
  const canvas = {
    width: 1000,
    height: 500,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 500, height: 250 }),
    setPointerCapture: (pointerId) => calls.push(["setPointerCapture", pointerId]),
    releasePointerCapture: (pointerId) => calls.push(["releasePointerCapture", pointerId]),
    toDataURL: () => "data:image/png;base64,mask",
  };
  const runButton = { disabled: true };
  const clearButton = { disabled: true };
  const workbench = {
    root: {
      querySelector(selector) {
        if (selector.includes("run-toolbox-watermark-removal")) return runButton;
        if (selector.includes("clear-toolbox-watermark-removal-mask")) return clearButton;
        return null;
      },
    },
    ui: { toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "ready",
    file: { name: "poster.png" },
    fileName: "poster.png",
    previewUrl: "blob:watermark-source",
    imageWidth: 1000,
    imageHeight: 500,
    maskDirty: false,
    status: "idle",
  } } };
  const startEvent = {
    pointerId: 7,
    button: 0,
    isPrimary: true,
    clientX: 60,
    clientY: 45,
    preventDefault: () => calls.push(["preventDefault", "start"]),
  };
  const endEvent = {
    pointerId: 7,
    button: 0,
    isPrimary: true,
    clientX: 260,
    clientY: 145,
    preventDefault: () => calls.push(["preventDefault", "move"]),
  };

  const beforeButton = renderToolboxPage(workbench.ui).match(/<button[^>]*data-action="run-toolbox-watermark-removal"[^>]*>/)?.[0] ?? "";
  assert.match(beforeButton, /\bdisabled\b/);

  assert.equal(applyToolboxWatermarkRemovalSelectionForTest(workbench, canvas, startEvent, endEvent), true);
  assert.deepEqual(calls.filter(([name]) => name === "fillRect").at(-1), ["fillRect", 100, 50, 400, 200]);
  assert.deepEqual(calls.find(([name]) => name === "setPointerCapture"), ["setPointerCapture", 7]);
  assert.deepEqual(calls.find(([name]) => name === "releasePointerCapture"), ["releasePointerCapture", 7]);
  assert.equal(workbench.ui.toolboxWatermarkRemoval.maskDirty, true);
  assert.equal(workbench.ui.toolboxWatermarkRemoval.maskDataUrl, "data:image/png;base64,mask");
  assert.equal(workbench.ui.toolboxWatermarkRemoval.maskRevision, 1);
  assert.equal(runButton.disabled, false);
  assert.equal(clearButton.disabled, false);

  const afterButton = renderToolboxPage(workbench.ui).match(/<button[^>]*data-action="run-toolbox-watermark-removal"[^>]*>/)?.[0] ?? "";
  assert.doesNotMatch(afterButton, /\bdisabled\b/);
  assert.match(workbenchSource, /pointerup[\s\S]*?finishToolboxWatermarkRemovalMaskPaintAndSync\(workbench, event\);/);
});

test("watermark removal always keeps the manual selection guidance", () => {
  const freshUi = {};
  setToolboxWatermarkRemovalFile(freshUi, { fileName: "poster.png", previewUrl: "blob:poster", mediaKind: "image" });
  assert.equal(freshUi.toolboxWatermarkRemoval.ocrStatus, "idle");
  assert.equal(freshUi.toolboxWatermarkRemoval.ocrMessage, "");
  assert.doesNotMatch(workbenchSource, /void detectToolboxWatermarkOcr/);

  const detecting = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "ready",
    file: { name: "poster.png" },
    fileName: "poster.png",
    previewUrl: "blob:poster",
    imageWidth: 1000,
    imageHeight: 1000,
    ocrStatus: "detecting",
    ocrProgress: 42,
    ocrMessage: "正在识别图片中的平台水印",
  } });
  assert.match(detecting, /标记水印区域/);
  assert.match(detecting, /支持矩形框选、画笔涂抹和套索区域/);
  assert.doesNotMatch(detecting, /正在自动识别平台水印|42%/);

  const matched = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "ready",
    file: { name: "poster.png" },
    fileName: "poster.png",
    previewUrl: "blob:poster",
    imageWidth: 1000,
    imageHeight: 1000,
    maskDirty: true,
    ocrStatus: "completed",
    ocrRegionCount: 1,
    ocrPlatforms: ["豆包"],
  } });
  assert.match(matched, /标记水印区域/);
  assert.doesNotMatch(matched, /已自动识别/);

  const noMatch = renderToolboxPage({ toolboxWatermarkRemoval: {
    open: true,
    pluginStatus: "ready",
    file: { name: "poster.png" },
    fileName: "poster.png",
    previewUrl: "blob:poster",
    imageWidth: 1000,
    imageHeight: 1000,
    ocrStatus: "no-match",
  } });
  assert.match(noMatch, /标记水印区域/);
  assert.doesNotMatch(noMatch, /未识别到豆包、即梦或抖音水印/);
});

test("both toolbox workspaces expose illustrated usage guides", () => {
  const promptUi = { toolboxPromptReverse: { open: true } };
  let promptHtml = renderToolboxPage(promptUi);
  assert.match(promptHtml, /data-action="open-toolbox-prompt-reverse-guide"/);
  assert.match(promptHtml, /class="toolbox-guide-trigger"[\s\S]*?<span>使用说明<\/span>/);
  assert.doesNotMatch(promptHtml, /id="toolbox-guide-title-prompt-reverse">提示词反推使用说明/);

  setToolboxPromptReverseGuideOpen(promptUi, true);
  promptHtml = renderToolboxPage(promptUi);
  assert.match(promptHtml, /提示词反推使用说明/);
  assert.match(promptHtml, /图片反推可提炼主体、场景、构图、光影、色彩和画面风格/);
  assert.match(promptHtml, /视频反推可提炼主体动作、运镜、节奏、场景变化和整体风格/);
  assert.match(promptHtml, /data-action="close-toolbox-prompt-reverse-guide"/);

  const depthUi = { toolboxVideoDepth: { open: true, pluginStatus: "ready" } };
  let depthHtml = renderToolboxPage(depthUi);
  assert.match(depthHtml, /data-action="open-toolbox-video-depth-guide"/);
  assert.match(depthHtml, /class="toolbox-guide-trigger"[\s\S]*?<span>使用说明<\/span>/);
  assert.doesNotMatch(depthHtml, /id="toolbox-guide-title-video-depth">视频转深度使用说明/);

  setToolboxVideoDepthGuideOpen(depthUi, true);
  depthHtml = renderToolboxPage(depthUi);
  assert.match(depthHtml, /视频转深度使用说明/);
  assert.match(depthHtml, /将普通视频逐帧转换为表达远近关系的深度视频/);
  assert.match(depthHtml, /设置清晰度、帧率和深度颜色，然后生成并下载结果/);
  assert.match(depthHtml, /data-action="close-toolbox-video-depth-guide"/);

  const watermarkUi = { toolboxWatermarkRemoval: { open: true, pluginStatus: "ready" } };
  let watermarkHtml = renderToolboxPage(watermarkUi);
  assert.match(watermarkHtml, /data-action="open-toolbox-watermark-removal-guide"/);
  assert.match(watermarkHtml, /class="toolbox-guide-trigger"[\s\S]*?<span>使用说明<\/span>/);
  assert.doesNotMatch(watermarkHtml, /id="toolbox-guide-title-watermark-removal">去水印使用说明/);

  setToolboxWatermarkRemovalGuideOpen(watermarkUi, true);
  watermarkHtml = renderToolboxPage(watermarkUi);
  assert.match(watermarkHtml, /去水印使用说明/);
  assert.match(watermarkHtml, /在本机处理图片或短视频/);
  assert.match(watermarkHtml, /data-action="close-toolbox-watermark-removal-guide"/);
});

test("video depth opens the browser WebGPU workspace", () => {
  const html = renderToolboxPage({ toolboxVideoDepth: { open: true, pluginStatus: "unknown" } });

  assert.match(html, /id="toolbox-video-depth-title">视频转深度/);
  assert.match(html, /data-plugin-status="unknown"/);
  assert.match(html, /data-action="check-toolbox-video-depth-plugin"/);
  assert.match(html, /先检测本地处理能力/);
  assert.match(html, /data-toolbox-video-depth-resolution/);
  assert.match(html, /data-toolbox-video-depth-frame-rate/);
  assert.match(html, /data-toolbox-video-depth-color/);
  assert.doesNotMatch(html, /data-toolbox-video-depth-encoding|导出编码/);
  assert.match(html, /处理速度与电脑环境关联、视频最大处理 500 MB/);
  assert.doesNotMatch(html, /最大 500 MB · 不上传服务器/);
  assert.doesNotMatch(html, /安装计算助手|安装本地计算助手/);
  assert.doesNotMatch(html, /huggingface|Video-Depth-Anything/);
  assert.match(html, /data-action="close-toolbox-video-depth"/);
});

test("video depth renders browser WebGPU progress and completed output", () => {
  const loading = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "ready",
    status: "loading",
    progress: 42,
    fileName: "clip.mp4",
    previewUrl: "blob:clip",
  } });
  assert.match(loading, /width:42%/);
  assert.match(loading, /data-toolbox-depth-progress-bar/);
  assert.match(loading, /toolbox-depth-result[\s\S]*data-toolbox-depth-progress/);
  assert.doesNotMatch(loading, /42% ·/);
  assert.doesNotMatch(loading, /本机 GPU 正在处理/);
  assert.match(loading, /深度视频转绘正在处理中/);
  assert.doesNotMatch(loading, /视频不会上传服务器，结果只保存在当前浏览器。/);
  assert.match(loading, /data-action="uninstall-toolbox-video-depth-plugin" disabled/);
  const completed = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "ready",
    status: "completed",
    result: { downloadUrl: "blob:depth-output", fileName: "depth.webm" },
  } });
  assert.match(completed, /blob:depth-output/);
  assert.match(completed, /depth\.webm/);
  assert.match(completed, /下载/);
});

test("video depth output title follows the selected depth color", () => {
  const html = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "ready",
    depthColor: "heatmap",
  } });

  assert.match(html, /<header><span>热力深度视频<\/span>/);
  assert.doesNotMatch(html, /<header><span>黑白深度视频<\/span>/);
});

test("video depth modal colors, controls, and typography follow the workbench theme", () => {
  const themeStyles = toolboxCss.slice(toolboxCss.indexOf("/* The depth tool lives inside the workbench"));

  assert.match(themeStyles, /\.toolbox-depth-modal\s*\{[\s\S]*?background:\s*var\(--theme-panel-background/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-depth-result\s*\{[\s\S]*?background:\s*var\(--theme-surface-background/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-reverse-title h2,[\s\S]*?color:\s*var\(--text-primary/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-reverse-title p,[\s\S]*?color:\s*var\(--text-muted/);
  assert.match(themeStyles, /\.toolbox-depth-modal button,[\s\S]*?font-family:\s*inherit/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-reverse-run\s*\{[\s\S]*?background:\s*var\(--theme-accent-gradient/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-reverse-preview-meta button\s*\{[\s\S]*?background:\s*var\(--theme-control-background/);
  assert.match(themeStyles, /\.toolbox-depth-modal \.toolbox-depth-progress-track span\s*\{[\s\S]*?background:\s*var\(--theme-accent-gradient/);
});

test("video depth switches between plugin install and uninstall actions", () => {
  const notInstalled = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "not-installed",
  } });
  assert.match(notInstalled, /深度视频转绘需安装插件，请点击[\s\S]*install-toolbox-video-depth-plugin/);
  assert.match(notInstalled, /data-action="install-toolbox-video-depth-plugin"/);
  assert.match(notInstalled, /toolbox-depth-header-plugin[\s\S]*install-toolbox-video-depth-plugin/);
  assert.doesNotMatch(notInstalled, /toolbox-depth-source-stage[\s\S]*install-toolbox-video-depth-plugin/);
  assert.doesNotMatch(notInstalled, /<header><span>原始视频/);
  assert.doesNotMatch(notInstalled, /data-action="uninstall-toolbox-video-depth-plugin"/);

  const installed = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "ready",
    pluginVersion: "浏览器 WebGPU",
  } });
  assert.match(installed, /data-action="uninstall-toolbox-video-depth-plugin"/);
  assert.match(installed, /toolbox-depth-header-plugin[\s\S]*data-action="uninstall-toolbox-video-depth-plugin"/);
  assert.match(installed, /深度视频转绘插件已安装，如不需要请[\s\S]*uninstall-toolbox-video-depth-plugin/);
  assert.doesNotMatch(installed, /data-action="install-toolbox-video-depth-plugin"/);
});

test("video depth preview occupies the source stage after plugin installation", () => {
  const html = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "ready",
    fileName: "source.mp4",
    fileSize: 1024,
    previewUrl: "blob:source-video",
  } });

  assert.match(html, /toolbox-depth-source-stage[\s\S]*toolbox-depth-preview/);
  assert.doesNotMatch(html, /toolbox-depth-plugin-status/);
  assert.equal((html.match(/blob:source-video/g) ?? []).length, 1);
});

test("video depth shows the unified local-processing unavailable state", () => {
  const html = renderToolboxPage({ toolboxVideoDepth: {
    open: true,
    pluginStatus: "unavailable",
    error: "当前电脑浏览器不支持本地处理，请升级或更换浏览器",
  } });

  assert.match(html, /当前电脑浏览器不支持本地处理，请升级或更换浏览器/);
  assert.match(html, /data-action="check-toolbox-video-depth-plugin"/);
  assert.doesNotMatch(html, /安装计算助手|正在下载安装包/);
});

test("prompt reverse opens a focused image-to-prompt workspace", () => {
  const html = renderToolboxPage({
    toolboxPromptReverse: {
      open: true,
      mode: "comic",
      fileName: "reference.webp",
      fileSize: 2 * 1024 * 1024,
      previewUrl: "blob:reference-preview",
    },
  });

  assert.match(html, /role="dialog"/);
  assert.match(html, /id="prompt-reverse-title">提示词反推/);
  assert.match(html, /aria-label="提示词反推类型"/);
  assert.match(html, /class="is-active"[^>]*data-prompt-reverse-kind="image"[^>]*aria-selected="true"[^>]*>图片反推提示词/);
  assert.match(html, /data-prompt-reverse-kind="video"[^>]*aria-selected="false"[^>]*>视频反推提示词/);
  assert.equal((html.match(/data-action="set-toolbox-prompt-reverse-kind"/g) ?? []).length, 2);
  assert.match(html, /反推结果/);
  assert.doesNotMatch(html, /输出口径|提示词类型|set-toolbox-prompt-reverse-mode|漫剧分镜|二次元标签/);
  assert.match(html, /src="blob:reference-preview"/);
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(html, /data-action="run-toolbox-prompt-reverse"/);
  assert.match(html, /反推结果/);
  assert.doesNotMatch(html, /本地解析插件|本机 6 FPS 解析/);
});

test("prompt reverse keeps image and video workspace state separate when switching tabs", () => {
  const ui = {
    toolboxPromptReverse: {
      open: true,
      activeKind: "image",
      models: [{ displayName: "视觉模型" }],
      selectedModelName: "视觉模型",
      views: {
        image: {
          fileName: "reference.png",
          fileSize: 1024,
          previewUrl: "blob:image-reference",
          result: { positivePrompt: "cinematic portrait" },
        },
        video: {
          fileName: "reference.mp4",
          fileSize: 2048,
          previewUrl: "blob:video-reference",
          pluginStatus: "ready",
          pluginVersion: "1.0.0",
        },
      },
    },
  };

  setToolboxPromptReverseKind(ui, "video");
  const videoHtml = renderToolboxPage(ui);
  assert.match(videoHtml, /src="blob:video-reference"/);
  assert.doesNotMatch(videoHtml, /blob:image-reference|cinematic portrait/);

  setToolboxPromptReverseKind(ui, "image");
  const imageHtml = renderToolboxPage(ui);
  assert.match(imageHtml, /src="blob:image-reference"/);
  assert.match(imageHtml, /cinematic portrait/);
  assert.doesNotMatch(imageHtml, /blob:video-reference/);
});

test("prompt reverse renders configured models and a completed result", () => {
  const html = renderToolboxPage({
    toolboxPromptReverse: {
      open: true,
      selectedModelName: "GPT-5.6 Sol（酷模）",
      models: [{ displayName: "GPT-5.6 Sol（酷模）" }],
      fileName: "reference.png",
      previewUrl: "blob:reference-preview",
      result: {
        description: "一只猫站在霓虹街头",
        positivePrompt: "cinematic neon street, cat",
        tags: ["cat", "neon"],
        negativePrompt: "blurry",
        usage: { promptTokens: 9000, completionTokens: 3000, cachedTokens: 0, totalTokens: 12000 },
        credit: { consumed: 12, released: 20 },
      },
    },
  });

  assert.match(html, /data-toolbox-prompt-reverse-model/);
  assert.match(html, /GPT-5\.6 Sol/);
  assert.match(html, /一只猫站在霓虹街头/);
  assert.match(html, /cinematic neon street, cat/);
  assert.match(html, /本次 Token 消耗/);
  assert.match(html, /输入 9,000 · 输出 3,000 · 总计 12,000 · 消耗积分 12/);
  assert.match(html, /data-action="copy-toolbox-prompt-reverse"/);
  assert.doesNotMatch(html, /输出口径|set-toolbox-prompt-reverse-mode|通用生图/);
});

test("prompt reverse video tab uses the local plugin and keeps the complete 6 FPS timeline", () => {
  const preview = renderToolboxPage({
    toolboxPromptReverse: {
      open: true,
      activeKind: "video",
      pluginStatus: "ready",
      pluginVersion: "v1.0.0 · 6 FPS",
      selectedModelName: "视频理解模型",
      models: [{ displayName: "视频理解模型" }],
      fileName: "reference.mp4",
      fileSize: 8 * 1024 * 1024,
      previewUrl: "blob:reference-video",
    },
  });
  assert.match(preview, /class="is-active"[^>]*data-prompt-reverse-kind="video"[^>]*aria-selected="true"[^>]*>视频反推提示词/);
  assert.match(preview, /<video[^>]+src="blob:reference-video"/);
  assert.match(preview, /data-plugin-status="ready"/);
  assert.match(preview, /视频反推提示词插件已安装，如不需要请卸载。/);
  assert.match(preview, /主体动作、场景、光影、运镜、风格与画质/);
  assert.doesNotMatch(preview, /正在上传完整参考视频|完整上传到云存储|云存储/);

  const decoding = renderToolboxPage({
    toolboxPromptReverse: {
      open: true,
      activeKind: "video",
      pluginStatus: "ready",
      status: "decoding",
      progress: 42,
      selectedModelName: "视频理解模型",
      models: [{ displayName: "视频理解模型" }],
      fileName: "reference.mp4",
      previewUrl: "blob:reference-video",
    },
  });
  assert.match(decoding, /本机正在解析视频 42%/);
  assert.doesNotMatch(decoding, /源视频不会上传服务器|解码与逐帧提取/);
  assert.doesNotMatch(decoding, /正在上传完整参考视频|完整上传到云存储|云存储/);

  const preparing = renderToolboxPage({
    toolboxPromptReverse: {
      open: true,
      activeKind: "video",
      pluginStatus: "ready",
      status: "preparing",
      progress: 78,
      selectedModelName: "视频理解模型",
      models: [{ displayName: "视频理解模型" }],
      fileName: "reference.mp4",
      previewUrl: "blob:reference-video",
    },
  });
  assert.match(preparing, /正在整理 6 FPS 时间轴 78%/);
  assert.doesNotMatch(preparing, /全部 6 FPS 时间轴画面|正在将全部 6 FPS/);
});

test("prompt reverse video tab follows the local plugin install lifecycle", () => {
  assert.match(toolboxCss, /\.toolbox-reverse-plugin\s*\{[\s\S]*?font-size:\s*0\.84rem;[\s\S]*?line-height:\s*1\.35;/);
  const notInstalled = renderToolboxPage({ toolboxPromptReverse: {
    open: true,
    activeKind: "video",
    pluginStatus: "not-installed",
  } });
  assert.match(notInstalled, /data-plugin-status="not-installed"/);
  assert.match(notInstalled, /data-action="install-toolbox-prompt-reverse-plugin"/);
  assert.match(notInstalled, /视频反推提示词需安装插件，请先安装/);
  assert.match(notInstalled, /安装/);
  assert.match(notInstalled, /等待浏览器解析插件就绪/);
  assert.match(notInstalled, /id="toolbox-prompt-reverse-file"[^>]*disabled/);

  const installing = renderToolboxPage({ toolboxPromptReverse: {
    open: true,
    activeKind: "video",
    pluginStatus: "installing",
    installMessage: "正在安装视频解析插件",
    installProgress: 36,
  } });
  assert.match(installing, /data-plugin-status="installing"/);
  assert.match(installing, /正在安装视频解析插件/);
  assert.match(installing, /36%/);
  assert.doesNotMatch(installing, /data-action="install-toolbox-prompt-reverse-plugin"/);

  const ready = renderToolboxPage({ toolboxPromptReverse: {
    open: true,
    activeKind: "video",
    pluginStatus: "ready",
    pluginVersion: "v1.0.0 · 6 FPS",
  } });
  assert.match(ready, /data-action="uninstall-toolbox-prompt-reverse-plugin"/);
  assert.match(ready, /视频反推提示词插件已安装，如不需要请卸载。/);
  assert.doesNotMatch(ready, /浏览器解析插件已安装/);
  assert.doesNotMatch(ready, /data-action="install-toolbox-prompt-reverse-plugin"/);
});

test("workbench rail opens the toolbox page and marks the entry active", () => {
  const html = renderProjectDetail({
    state: {},
    session: { authenticated: true, user: { id: "user-1", phone: "13800138000" } },
    ui: { activeNavTab: "toolbox" },
  });

  assert.match(html, /class="rail-item active"[\s\S]*data-tab="toolbox"/);
  assert.match(html, /data-scroll-surface="toolbox"/);
  assert.match(html, /内置创作工具/);
});

test("toolbox has a stable path route", () => {
  assert.equal(readWorkbenchRouteTokenForTest({ pathname: "/toolbox", hash: "" }), "toolbox");
  assert.equal(deriveInitialNavTabForTest("toolbox"), "toolbox");
});

test("toolbox tools require login before opening", async () => {
  for (const action of [
    "open-toolbox-prompt-reverse",
    "open-toolbox-video-depth",
    "open-toolbox-watermark-removal",
  ]) {
    const reasons = [];
    const workbench = {
      session: { authenticated: false },
      ui: { busy: false },
      root: { querySelector: () => null },
      onRequireLogin: async (reason) => reasons.push(reason),
    };

    await handleWorkbenchActionForTest(workbench, { dataset: { action } });

    assert.deepEqual(reasons, ["login"]);
    assert.equal(workbench.ui.toolboxPromptReverse, undefined);
    assert.equal(workbench.ui.toolboxVideoDepth, undefined);
    assert.equal(workbench.ui.toolboxWatermarkRemoval, undefined);
  }
});
