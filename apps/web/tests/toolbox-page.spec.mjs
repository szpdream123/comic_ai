import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderProjectDetail } from "../src/features/production-workbench/project-detail.js";
import {
  renderToolboxPage,
  setToolboxPromptReverseKind,
} from "../src/features/toolbox/toolbox-page.js";
import { deriveInitialNavTabForTest, readWorkbenchRouteTokenForTest } from "../src/features/production-workbench/index.js";

const toolboxCss = readFileSync(new URL("../src/features/toolbox/toolbox-page.css", import.meta.url), "utf8");

test("toolbox page renders as an independent built-in tool directory", () => {
  const html = renderToolboxPage();

  assert.match(html, /id="toolbox-page-title">工具箱/);
  assert.match(html, /data-toolbox-tool="prompt-reverse"/);
  assert.match(html, /data-toolbox-tool="video-depth"/);
  assert.match(html, /视频转深度/);
  assert.match(html, /提示词反推/);
  assert.match(html, /scene-3d-neon-street\.png/);
  assert.equal((html.match(/data-toolbox-tool=/g) ?? []).length, 2);
  assert.doesNotMatch(html, /故事板线稿|图片拆格|字幕格式转换/);
  assert.match(html, /data-action="open-toolbox-prompt-reverse"/);
  assert.match(html, /data-action="open-toolbox-video-depth"/);
  assert.doesNotMatch(html, /待接入/);
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
      },
    },
  });

  assert.match(html, /data-toolbox-prompt-reverse-model/);
  assert.match(html, /GPT-5\.6 Sol/);
  assert.match(html, /一只猫站在霓虹街头/);
  assert.match(html, /cinematic neon street, cat/);
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
  assert.match(decoding, /源视频不会上传服务器/);
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
  assert.match(preparing, /全部 6 FPS 时间轴画面/);
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
