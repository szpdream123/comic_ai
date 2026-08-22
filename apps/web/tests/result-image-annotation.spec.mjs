import assert from "node:assert/strict";
import test from "node:test";

import {
  renderEpisodeWorkbench,
  renderResultImageAnnotationModal,
  resolveResultAnnotationTarget,
} from "../src/features/production-workbench/episode-workbench-rebuilt.js";
import {
  closeResultImageAnnotation,
  isResultImageAnnotationHit,
  loadResultAnnotationImage,
  openResultImageAnnotation,
} from "../src/features/production-workbench/result-image-annotation.js";
import { handleWorkbenchActionForTest } from "../src/features/production-workbench/index.js";

test("renders the annotation action above an asset image composer", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一", previewUrl: "/uploads/asset-1.png" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
      assetPromptDraft: {
        quickReferenceItems: [{ id: "asset-reference-1", type: "image", name: "素材图", url: "/uploads/asset-reference-1.png" }],
      },
    },
    episodeWorkbenchAnnotationSelectedAttachmentId: "asset-reference-1",
  });

  const promptStart = html.indexOf('<section class="episode-replica-prompt');
  const annotationStart = html.indexOf('<div class="episode-replica-annotation-bar">', promptStart);
  const textareaStart = html.indexOf('<div class="episode-replica-textarea', promptStart);
  assert.ok(promptStart >= 0);
  assert.ok(annotationStart > promptStart);
  assert.ok(textareaStart > annotationStart);
  assert.match(html, /data-action="open-result-image-annotation"/);
  assert.match(html, /data-annotation-scope="composer"/);
  assert.match(html, /data-annotation-context-scope="asset"/);
  assert.match(html, /data-image-url="\/uploads\/asset-reference-1\.png"/);
  assert.match(html, /data-image-urls="\/uploads\/asset-reference-1\.png"/);
  assert.match(html, /episode-replica-ref-card quick-reference annotation-selected image/);
  assert.match(html, /episode-replica-prompt[^>]*has-result-annotation/);
});

test("renders the annotation action for a storyboard image", () => {
  const storyboard = {
    id: "storyboard-1",
    title: "分镜 1",
    references: [{ id: "storyboard-reference-1", type: "image", name: "分镜素材", url: "/uploads/storyboard-reference-1.png" }],
  };
  const html = renderEpisodeWorkbench({
    storyboards: [storyboard],
    selectedStoryboard: storyboard,
    mediaMode: "video",
    episodeWorkbenchAnnotationSelectedAttachmentId: "storyboard-reference-1",
    generationUiState: {
      museScopeMode: "storyboard",
      storyboardConversationHistory: {},
    },
  });

  assert.match(html, /data-action="open-result-image-annotation"/);
  assert.match(html, /data-annotation-scope="composer"/);
  assert.match(html, /data-target-id="storyboard-reference-1"/);
  assert.match(html, /data-image-url="\/uploads\/storyboard-reference-1\.png"/);
});

test("resolves the explicitly selected image among multiple composer references", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "storyboard",
    selectedStoryboard: { id: "storyboard-1" },
    generationState: {
      quickReferenceItems: [
        { id: "reference-1", type: "image", name: "图1", url: "/uploads/reference-1.png" },
        { id: "reference-2", kind: "prop", name: "图2", url: "/uploads/reference-2.png" },
      ],
    },
    selectedAttachmentId: "reference-2",
  });

  assert.equal(target.targetId, "reference-2");
  assert.equal(target.imageUrl, "/uploads/reference-2.png");
});

test("uses an asset id as the annotation selection key when a reference has no own id", () => {
  const storyboard = {
    id: "storyboard-1",
    title: "分镜 1",
    generationState: {
      quickReferenceItems: [{
        assetId: "asset-reference-without-id",
        type: "image",
        name: "图1",
        preview: "/uploads/reference-without-id.png",
      }],
    },
  };
  const html = renderEpisodeWorkbench({
    storyboards: [storyboard],
    selectedStoryboard: storyboard,
    generationUiState: {
      museScopeMode: "storyboard",
      storyboardConversationHistory: {},
    },
    episodeWorkbenchAnnotationSelectedAttachmentId: "asset-reference-without-id",
  });

  assert.match(html, /data-image-url="\/uploads\/reference-without-id\.png"/);
  assert.match(html, /data-annotation-selection-key="asset-reference-without-id"/);
  assert.match(html, /quick-reference annotation-selected image/);
});

test("keeps the annotation action clickable with an empty image when no material is selected", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
    },
  });

  assert.match(html, /data-action="open-result-image-annotation"/);
  assert.match(html, /data-image-url=""/);
  assert.doesNotMatch(html, /data-action="open-result-image-annotation"[^>]*disabled/);
});

test("shows the selection-required toast when annotation is opened without an image", async () => {
  const workbench = {
    state: {},
    session: {},
    api: {},
    root: {
      innerHTML: "",
      querySelector() { return null; },
      querySelectorAll() { return []; },
      classList: { toggle() {} },
    },
    ui: {
      activeNavTab: "project",
      projectPanelMode: "episode-workbench",
      storyboards: [],
      episodeStoryboardMap: {},
      selectedStoryboardId: null,
      museScopeMode: "storyboard",
      episodeMediaMode: "image",
      toast: "",
    },
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "open-result-image-annotation",
      imageUrl: "",
      targetId: "annotation-selection-required:storyboard",
    },
  });

  assert.equal(workbench.ui.toast, "请选中素材进行修改");
});

test("renders and initializes the result annotation editor", () => {
  const ui = {};
  openResultImageAnnotation(ui, {
    imageUrl: "/uploads/generated.png",
    imageName: "生成图",
    scope: "storyboard",
    targetId: "storyboard-1",
  });

  const html = renderResultImageAnnotationModal(ui.resultImageAnnotation);
  assert.match(html, /data-result-annotation-canvas/);
  assert.match(html, /data-annotation-tool="brush"/);
  assert.match(html, /矩形/);
  assert.match(html, /箭头/);
  assert.match(html, /网格/);
  assert.match(html, /编号/);
  assert.match(html, /文字/);
  assert.match(html, /橡皮擦/);
  assert.match(html, /撤销/);
  assert.match(html, /重做/);
  assert.match(html, /合成并替换/);

  closeResultImageAnnotation(ui);
  assert.equal(ui.resultImageAnnotation, null);
});

test("renders grid settings when the grid tool is active", () => {
  const html = renderResultImageAnnotationModal({
    open: true,
    imageUrl: "/uploads/generated.png",
    tool: "grid",
    gridRows: 6,
    gridColumns: 8,
  });
  assert.match(html, /data-result-annotation-field="gridRows"/);
  assert.match(html, /value="6"/);
  assert.match(html, /data-result-annotation-field="gridColumns"/);
  assert.match(html, /value="8"/);
  assert.doesNotMatch(html, /data-result-annotation-grid-setting hidden/);
});

test("normalizes storage content URLs for the annotation canvas", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
      assetPromptDraft: {
        quickReferenceItems: [{ id: "storage-reference-1", type: "image", previewUrl: "/api/storage/objects/storage-1/content" }],
      },
    },
    episodeWorkbenchAnnotationSelectedAttachmentId: "storage-reference-1",
  });

  assert.match(html, /data-image-url="\/api\/storage\/objects\/storage-1\/content\?proxy=1"/);
});

test("prefers the same-origin storage proxy over a direct object URL", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
      assetPromptDraft: {
        quickReferenceItems: [{
          id: "storage-reference-2",
          type: "image",
          storageObjectId: "ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2",
          url: "https://example.com/direct-image.png",
        }],
      },
    },
    episodeWorkbenchAnnotationSelectedAttachmentId: "storage-reference-2",
  });

  assert.match(html, /data-image-url="\/api\/storage\/objects\/ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2\/content\?(?:thumbnail=1|proxy=1)"/);
  assert.doesNotMatch(html, /data-image-url="https:\/\/example\.com\/direct-image\.png"/);
});

test("does not fall back to a generated image when no material is selected", () => {
  const html = renderEpisodeWorkbench({
    assetLibrary: {
      character: [{ id: "asset-1", name: "角色一" }],
    },
    activeAssetTab: "character",
    selectedEpisodeAssetId: "asset-1",
    generationUiState: {
      museScopeMode: "assets",
      assetConversationHistory: {},
    },
    imageGenerationResult: {
      taskId: "image-task-1",
      status: "completed",
      resultAssets: [{
        mediaKind: "image",
        storageObjectId: "ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2",
        url: "https://example.com/direct-image.png",
      }],
    },
  });

  assert.match(html, /data-image-url=""/);
  assert.doesNotMatch(html, /data-image-url="https:\/\/example\.com\/direct-image\.png"/);
});

test("uses precise annotation hit testing for text, arrows, and eraser targets", () => {
  assert.equal(isResultImageAnnotationHit(
    { type: "text", x: 100, y: 100, text: "短文字", fontSize: 32, width: 24 },
    { x: 110, y: 116 },
  ), true);
  assert.equal(isResultImageAnnotationHit(
    { type: "text", x: 100, y: 100, text: "短文字", fontSize: 32, width: 24 },
    { x: 300, y: 300 },
  ), false);
  assert.equal(isResultImageAnnotationHit(
    { type: "arrow", start: { x: 100, y: 100 }, end: { x: 100, y: 300 }, width: 24 },
    { x: 100, y: 200 },
  ), true);
  assert.equal(isResultImageAnnotationHit(
    { type: "arrow", start: { x: 100, y: 100 }, end: { x: 100, y: 300 }, width: 24 },
    { x: 300, y: 200 },
  ), false);
  assert.equal(isResultImageAnnotationHit(
    { type: "grid", start: { x: 100, y: 100 }, end: { x: 300, y: 300 }, rows: 4, columns: 4, width: 8 },
    { x: 200, y: 150 },
  ), true);
});

test("uses a selected asset-like reference storage proxy", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "assets",
    assetKind: "character",
    generationState: {
      quickReferenceItems: [{
        id: "asset-reference-3",
        kind: "character",
        name: "角色一",
        fixedImageStorageObjectId: "6df9d75d-bd93-4dd3-9836-80f8fba13cb4",
      }],
    },
    selectedAttachmentId: "asset-reference-3",
  });

  assert.equal(target.imageUrl, "/api/storage/objects/6df9d75d-bd93-4dd3-9836-80f8fba13cb4/content?proxy=1");
});

test("uses the storage proxy when a generated reference exposes fileId", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "storyboard",
    selectedStoryboard: { id: "storyboard-1" },
    generationState: {
      quickReferenceItems: [{
        id: "reference-with-file-id",
        type: "image",
        fileId: "0838ea12-0a77-4bd4-9879-bcc000000001",
        url: "https://api.example.com/v1/images/0838ea12-0a77-4bd4-9879-bcc000000001/content",
      }],
    },
    selectedAttachmentId: "reference-with-file-id",
  });

  assert.equal(
    target.imageUrl,
    "/api/storage/objects/0838ea12-0a77-4bd4-9879-bcc000000001/content?proxy=1",
  );
});

test("converts a provider content URL kept by a quick-imported reference", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "storyboard",
    selectedStoryboard: { id: "storyboard-1" },
    generationState: {
      quickReferenceItems: [{
        id: "quick-ref:storyboard-image:storyboard-1:1",
        type: "image",
        url: "https://api.example.com/v1/images/0838ea12-0a77-4bd4-9879-bcc000000001/content",
      }],
    },
    selectedAttachmentId: "quick-ref:storyboard-image:storyboard-1:1",
  });

  assert.equal(
    target.imageUrl,
    "/api/storage/objects/0838ea12-0a77-4bd4-9879-bcc000000001/content?proxy=1",
  );
});

test("converts imageUrl fields kept by a quick-imported reference", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "storyboard",
    selectedStoryboard: { id: "storyboard-1" },
    generationState: {
      quickReferenceItems: [{
        id: "quick-ref-image-url",
        type: "image",
        imageUrl: "https://api.example.com/v1/images/0838ea12-0a77-4bd4-9879-bcc000000001/content",
      }],
    },
    selectedAttachmentId: "quick-ref-image-url",
  });

  assert.equal(
    target.imageUrl,
    "/api/storage/objects/0838ea12-0a77-4bd4-9879-bcc000000001/content?proxy=1",
  );
});

test("uses the storage proxy when the reference id is the storage object uuid", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "storyboard",
    selectedStoryboard: { id: "storyboard-1" },
    generationState: {
      quickReferenceItems: [{
        id: "ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2",
        type: "image",
        url: "https://api.example.com/v1/images/ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2/content",
      }],
    },
    selectedAttachmentId: "ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2",
  });

  assert.equal(
    target.imageUrl,
    "/api/storage/objects/ba7a89c3-0e82-453c-9c49-2d0c0d6ec9c2/content?proxy=1",
  );
});

test("prefers the same-origin storage proxy over the selected card preview URL", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "assets",
    assetKind: "character",
    generationState: {
      quickReferenceItems: [{
        id: "reference-with-proxy",
        type: "image",
        storageObjectId: "6df9d75d-bd93-4dd3-9836-80f8fba13cb4",
        url: "https://cdn.example.com/reference.png",
      }],
    },
    selectedAttachmentId: "reference-with-proxy",
    selectedAttachmentUrl: "https://cdn.example.com/reference.png",
  });

  assert.equal(target.imageUrl, "/api/storage/objects/6df9d75d-bd93-4dd3-9836-80f8fba13cb4/content?proxy=1");
  assert.deepEqual(target.imageUrls, [
    "/api/storage/objects/6df9d75d-bd93-4dd3-9836-80f8fba13cb4/content?proxy=1",
  ]);
});

test("falls back to the selected asset preview in asset scope", () => {
  const target = resolveResultAnnotationTarget({
    scopeMode: "assets",
    assetKind: "character",
    selectedAsset: {
      id: "asset-1",
      name: "角色一",
      previewUrl: "/api/storage/objects/11111111-2222-4333-8444-555555555555/content",
    },
  });

  assert.equal(target.scope, "asset");
  assert.equal(target.contextScope, "asset");
  assert.equal(target.imageUrl, "/api/storage/objects/11111111-2222-4333-8444-555555555555/content?proxy=1");
});

test("loads COS content URLs through the storage proxy when annotating", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = globalThis.URL.createObjectURL;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:5173/", origin: "http://localhost:5173" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("/api/storage/resolve")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: {
            proxyUrl: "/api/storage/objects/0838ea12-0a77-4bd4-9879-bcc000000001/content?proxy=1",
          },
        }),
      };
    }
    return { ok: true, blob: async () => new Blob(["image"]) };
  };
  globalThis.URL.createObjectURL = () => "blob:storage-image";
  try {
    const source = await loadResultAnnotationImage("https://aimanhuadrama-1310122982.cos.ap-guangzhou.myqcloud.com/AIManhuaDrama/20260808/0838ea12-0a77-4bd4-9879-bcc000000001.png");
    assert.equal(source.url, "blob:storage-image");
    assert.match(String(calls[0]?.url ?? ""), /\/api\/storage\/resolve\?sourceUrl=/);
    assert.deepEqual(calls[0]?.options, { credentials: "include" });
    assert.match(String(calls[1]?.url ?? ""), /\/api\/storage\/objects\/0838ea12-0a77-4bd4-9879-bcc000000001\/content\?proxy=1$/);
    assert.deepEqual(calls[1]?.options, { credentials: "include" });
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.URL.createObjectURL = previousCreateObjectUrl;
  }
});

test("routes external annotation images through the storage resolver instead of fetching them directly", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:5173/", origin: "http://localhost:5173" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: "storage_object_not_found" }),
    };
  };
  try {
    await assert.rejects(
      loadResultAnnotationImage("https://cdn.example.com/reference.png"),
      /storage_object_not_found/,
    );
    assert.equal(calls.length, 1);
    assert.match(String(calls[0]?.url ?? ""), /\/api\/storage\/resolve\?sourceUrl=/);
    assert.deepEqual(calls[0]?.options, { credentials: "include" });
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("includes session credentials when loading a development storage proxy", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = globalThis.URL.createObjectURL;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:5173/", origin: "http://localhost:5173" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, blob: async () => new Blob(["image"]) };
  };
  globalThis.URL.createObjectURL = () => "blob:storage-image";
  try {
    await loadResultAnnotationImage("/api/storage/objects/storage-1/content?proxy=1");
    assert.equal(calls[0]?.url.endsWith("/api/storage/objects/storage-1/content?proxy=1"), true);
    assert.deepEqual(calls[0]?.options, { credentials: "include" });
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.URL.createObjectURL = previousCreateObjectUrl;
  }
});

test("reloads a cached storage proxy response when it returns 304", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = globalThis.URL.createObjectURL;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:4310/", origin: "http://localhost:4310" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: false, status: 304 };
    return { ok: true, blob: async () => new Blob(["image"]) };
  };
  globalThis.URL.createObjectURL = () => "blob:storage-image";
  try {
    const source = await loadResultAnnotationImage("/api/storage/objects/storage-304/content?proxy=1");
    assert.equal(source.url, "blob:storage-image");
    assert.deepEqual(calls, [
      {
        url: "http://localhost:4310/api/storage/objects/storage-304/content?proxy=1",
        options: { credentials: "include" },
      },
      {
        url: "http://localhost:4310/api/storage/objects/storage-304/content?proxy=1",
        options: { credentials: "include", cache: "no-store" },
      },
    ]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.URL.createObjectURL = previousCreateObjectUrl;
  }
});

test("tries the configured 4310 backend when a local preview port cannot serve storage", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = globalThis.URL.createObjectURL;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:4311/", origin: "http://localhost:4311" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes(":4310/")) return { ok: true, blob: async () => new Blob(["image"]) };
    return { ok: false, status: 404, text: async () => "" };
  };
  globalThis.URL.createObjectURL = () => "blob:storage-image";
  try {
    const source = await loadResultAnnotationImage("/api/storage/objects/storage-1/content?proxy=1");
    assert.equal(source.url, "blob:storage-image");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].url, "http://localhost:4310/api/storage/objects/storage-1/content?proxy=1");
    assert.equal(calls[2].options.credentials, "include");
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.URL.createObjectURL = previousCreateObjectUrl;
  }
});

test("does not fall back to a direct image when blob loading fails", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { location: { href: "http://localhost:5173/", origin: "http://localhost:5173" } };
  globalThis.fetch = async () => ({ ok: false, blob: async () => new Blob(), text: async () => "" });
  try {
    await assert.rejects(
      loadResultAnnotationImage("https://cdn.example.com/reference.png"),
      /storage_annotation_proxy_resolve_failed/,
    );
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("uses the same-origin storage proxy when a storage URL is cross-origin", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:4310/", origin: "http://localhost:4310" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("/api/storage/resolve")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: { proxyUrl: "/api/storage/objects/storage-2/content?proxy=1" },
        }),
      };
    }
    return { ok: false, status: 401, text: async () => JSON.stringify({ error: "storage_object_not_found" }) };
  };
  try {
    await assert.rejects(
      loadResultAnnotationImage("https://cdn.example.com/api/storage/objects/storage-2/content"),
      /result_annotation_image_fetch_failed:401/,
    );
    assert.match(String(calls[0]?.url ?? ""), /\/api\/storage\/resolve\?sourceUrl=/);
    assert.match(String(calls[1]?.url ?? ""), /\/api\/storage\/objects\/storage-2\/content\?proxy=1$/);
    assert.equal(calls.some((call) => String(call.url).startsWith("https://cdn.example.com/")), false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("loads a cross-origin storage URL with one same-origin request", async () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const previousCreateObjectUrl = globalThis.URL.createObjectURL;
  const calls = [];
  globalThis.window = { location: { href: "http://localhost:4310/", origin: "http://localhost:4310" } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("/api/storage/resolve")) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: { proxyUrl: "/api/storage/objects/storage-3/content?proxy=1" },
        }),
      };
    }
    return { ok: true, blob: async () => new Blob(["image"]) };
  };
  globalThis.URL.createObjectURL = () => "blob:storage-image";
  try {
    const source = await loadResultAnnotationImage("https://cdn.example.com/api/storage/objects/storage-3/content");
    assert.equal(source.url, "blob:storage-image");
    assert.deepEqual(calls, [{
      url: "http://localhost:4310/api/storage/resolve?sourceUrl=https%3A%2F%2Fcdn.example.com%2Fapi%2Fstorage%2Fobjects%2Fstorage-3%2Fcontent",
      options: { credentials: "include" },
    }, {
      url: "http://localhost:4310/api/storage/objects/storage-3/content?proxy=1",
      options: { credentials: "include" },
    }]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
    globalThis.URL.createObjectURL = previousCreateObjectUrl;
  }
});
