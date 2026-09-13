import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

function readRuntimeAsset(prefix) {
  const name = readdirSync(new URL("../ai-canvas-runtime/assets/", import.meta.url))
    .find((file) => file.startsWith(prefix) && (file.endsWith(".js") || file.endsWith(".css")));
  assert.ok(name, `missing runtime asset ${prefix}`);
  return readFileSync(new URL(`../ai-canvas-runtime/assets/${name}`, import.meta.url), "utf8");
}
import {
  AI_CANVAS_DOCUMENT_VERSION,
  AI_CANVAS_RUNTIME_ADAPTER_VERSION,
  AI_CANVAS_RUNTIME_KIND,
  createAiCanvasRuntimeAdapter,
  normalizeAiCanvasRuntimeModel,
  normalizeAiCanvasRuntimeSkill,
  deserializeAiCanvasDocument,
  normalizeAiCanvasRuntimeGrouping,
  serializeAiCanvasDocument,
} from "../src/features/new-canvas/ai-canvas-runtime-adapter.js";

test("AI Canvas document hooks are versioned and round-trip without mutation", () => {
  const document = { nodes: [{ id: "node-1", data: { assetId: "asset-1" } }] };
  const serialized = serializeAiCanvasDocument(document);
  assert.equal(document.version, undefined);
  assert.equal(JSON.parse(serialized).version, AI_CANVAS_DOCUMENT_VERSION);
  assert.deepEqual(deserializeAiCanvasDocument(serialized), {
    nodes: [{ id: "node-1", type: "ai-text", data: { assetId: "asset-1", type: "ai-text" } }],
    edges: [],
    version: AI_CANVAS_DOCUMENT_VERSION,
  });
  assert.equal(deserializeAiCanvasDocument("invalid").version, AI_CANVAS_DOCUMENT_VERSION);
});


test("AI Canvas document hooks normalize legacy X6 canvas data for React Flow runtime", () => {
  const legacyDocument = {
    version: 1,
    canvasProjectId: "canvas-legacy",
    nodes: [
      {
        id: "script-source",
        type: "script",
        position: { x: 10, y: 20 },
        size: { width: 500, height: 420 },
        data: { title: "脚本节点", text: "第一幕", ports: { outputs: [{ id: "out_text" }] } },
      },
      {
        id: "send-flow",
        type: "send",
        position: { x: 520, y: 20 },
        data: { title: "发送流", mediaKind: "image", modelCode: "gpt-image-2-cn", prompt: "画面" },
      },
      {
        id: "image-result",
        type: "image",
        position: { x: 920, y: 20 },
        data: { title: "图片结果", status: "empty" },
      },
    ],
    edges: [
      {
        id: "edge-script-send",
        sourceNodeId: "script-source",
        sourcePortId: "out_text",
        targetNodeId: "send-flow",
        targetPortId: "in_text",
      },
    ],
  };
  const normalized = deserializeAiCanvasDocument(legacyDocument);
  assert.equal(legacyDocument.nodes[0].type, "script");
  assert.deepEqual(normalized.nodes.map((node) => node.type), ["source-text", "ai-image", "source-image"]);
  assert.equal(normalized.nodes[0].data.output, "第一幕");
  assert.equal(normalized.nodes[0].data.ports, undefined);
  assert.equal(normalized.nodes[1].data.model, "gpt-image-2-cn");
  assert.equal(normalized.edges[0].source, "script-source");
  assert.equal(normalized.edges[0].target, "send-flow");
  assert.equal(normalized.edges[0].sourceHandle, "out_text");
  assert.equal(JSON.parse(serializeAiCanvasDocument(legacyDocument)).nodes[1].type, "ai-image");
});

test("AI Canvas video nodes map poster fields onto thumbnailUrl for mention chips", () => {
  const normalized = deserializeAiCanvasDocument({
    nodes: [{
      id: "video-1",
      type: "ai-video",
      data: {
        title: "生成视频",
        videoUrl: "https://example.test/video.mp4",
        posterUrl: "https://example.test/video-poster.jpg",
        storageObjectId: "storage-video-1",
      },
    }],
  });
  assert.equal(normalized.nodes[0].data.videoUrl, "https://example.test/video.mp4");
  assert.equal(normalized.nodes[0].data.thumbnailUrl, "https://example.test/video-poster.jpg");
  assert.equal(normalized.nodes[0].data.posterUrl, "https://example.test/video-poster.jpg");

  const storageOnly = deserializeAiCanvasDocument({
    nodes: [{
      id: "video-2",
      type: "source-video",
      data: {
        title: "生成视频",
        videoUrl: "https://example.test/clip.mp4",
        storageObjectId: "storage-video-2",
      },
    }],
  });
  assert.equal(
    storageOnly.nodes[0].data.thumbnailUrl,
    "/api/storage/objects/storage-video-2/content?thumbnail=1",
  );
});

test("AI Canvas video mentions fall back to the first video frame when no poster exists", () => {
  const appSource = readRuntimeAsset("App-");
  const dialogSource = readRuntimeAsset("AINodeDialog-");
  const mentionSource = readRuntimeAsset("MentionEditor-");
  assert.match(appSource, /kind===`video`&&/);
  assert.match(dialogSource, /outputType===`video`&&e\.thumbnailUrl/);
  assert.match(mentionSource, /"ai-video"/);
});

test("AI Canvas completed generation nodes map to success so regenerate is available", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const completedNode = deserializeAiCanvasDocument({
    nodes: [{
      id: "image-completed",
      type: "ai-image",
      data: { status: "completed", imageUrl: "https://example.test/done.png", prompt: "天空" },
    }],
  }).nodes[0];
  assert.equal(completedNode.data.status, "success");
  assert.match(appSource, /recoverStaleGenerating === true/);
  assert.match(appSource, /mediaUrl \? "success" : "idle"/);
  const brandCss = readFileSync(
    new URL("../ai-canvas-runtime/assets/runtime-brand-overrides.css", import.meta.url),
    "utf8",
  );
  assert.match(brandCss, /\.generation-progress-overlay/);
  assert.match(brandCss, /\.chat-panel-input-toolbar \.model-selector-label[\s\S]*?display: none !important/);
  assert.match(brandCss, /\.model-selector-trigger::after/);
  assert.match(brandCss, /\.model-selector-trigger > \*[\s\S]*?visibility: hidden !important/);
  assert.match(brandCss, /\.fullscreen-overlay button:not\(\.ui-btn\)/);
  assert.match(brandCss, /\.fullscreen-overlay \.ui-btn--lg/);
  assert.match(appSource, /resolveAiCanvasRuntimeGeneratingNodeId/);
  assert.match(appSource, /rawStatus === "completed" \|\| rawStatus === "succeeded"/);
  assert.match(appSource, /function isAiCanvasAssistantTaskTerminal/);
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function isAiCanvasAssistantTaskTerminal"),
      appSource.indexOf("function readAiCanvasAssistantMediaCandidate"),
    ),
    /resolveAiCanvasAssistantTaskMedia\(task\)\.url/,
  );
});

test("AI Canvas generation overlay stays visible for in-flight image nodes", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../src/features/new-canvas/ai-canvas-runtime-adapter.js", import.meta.url), "utf8");
  const runtimeAppSource = readRuntimeAsset("App-");
  const runningNode = deserializeAiCanvasDocument({
    nodes: [{
      id: "image-generating",
      type: "ai-image",
      data: { status: "running", imageUrl: "https://example.test/old.png", prompt: "天空" },
    }],
  }).nodes[0];
  assert.equal(runningNode.data.status, "loading");
  assert.match(appSource, /rawStatus === "ready" \|\| rawStatus === "empty"/);
  assert.match(adapterSource, /previousType !== "send" && \["loading", "running", "queued", "processing", "pending", "submitted"\]/);
  assert.match(runtimeAppSource, /if \(!i\) return \/\* @__PURE__ \*\/ \(0, Z\.jsxs\)\("div", \{/);
  assert.match(runtimeAppSource, /n \? "pointer-events-none absolute inset-0 z-20[\s\S]*?node-preview-loading"/);
  assert.doesNotMatch(runtimeAppSource, /if \(!i\) return n \? null/);
});

test("AI Canvas runtime grouping converts legacy group membership and positions", () => {
  const result = normalizeAiCanvasRuntimeGrouping([
    {
      id: "group-1",
      type: "group",
      position: { x: 340, y: 33 },
      size: { width: 280, height: 220 },
      data: { label: "素材组", color: "#22c55e", childNodeIds: ["child-1"] },
    },
    {
      id: "child-1",
      type: "ai-image",
      parentGroupId: "group-1",
      position: { x: 380, y: 80 },
      data: { label: "图片" },
    },
  ]);
  assert.deepEqual(result.groups, [{
    id: "group-1",
    name: "素材组",
    nodeIds: ["child-1"],
    color: "#22c55e",
  }]);
  const group = result.nodes.find((node) => node.id === "group-1");
  const child = result.nodes.find((node) => node.id === "child-1");
  assert.equal(group.data.groupId, "group-1");
  assert.equal(group.style.width, 280);
  assert.equal(group.style.height, 220);
  assert.equal(child.parentId, "group-1");
  assert.equal(child.parentGroupId, undefined);
  assert.deepEqual(child.position, { x: 40, y: 47 });
});

test("AI Canvas runtime grouping recovers membership from legacy child parent links", () => {
  const result = normalizeAiCanvasRuntimeGrouping([
    { id: "group-1", type: "group", position: { x: 10, y: 20 }, data: { title: "素材组" } },
    { id: "child-1", type: "ai-image", parentGroupId: "group-1", position: { x: 30, y: 50 }, data: {} },
  ]);
  assert.deepEqual(result.groups[0].nodeIds, ["child-1"]);
  assert.equal(result.nodes[1].parentId, "group-1");
});

test("AI Canvas adapter injects creatorApi COS and generation methods", async () => {
  const calls = [];
  const creatorApi = {
    async uploadFile(file, options) { calls.push(["uploadFile", file, options]); return { upload: { storageObjectId: "s1" } }; },
    runCanvasNode(...args) { calls.push(["runCanvasNode", ...args]); return "node"; },
    runCanvasTextNodeStream(...args) { calls.push(["runCanvasTextNodeStream", ...args]); return "stream"; },
    createCanvasGenerationBatch(...args) { calls.push(["createCanvasGenerationBatch", ...args]); return "batch"; },
  };
  let runtimeContext;
  const adapter = createAiCanvasRuntimeAdapter({
    creatorApi,
    mountRuntime: async (_surface, context) => { runtimeContext = context; return { update() {}, dispose() {} }; },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-1", document: { nodes: [] } });
  await runtimeContext.creatorApi.uploadAsset({ name: "a.png" }, { onProgress() {} });
  assert.equal(runtimeContext.creatorApi.runNode("node-1", { prompt: "hello" }), "node");
  assert.equal(runtimeContext.creatorApi.runTextNodeStream("text-1", { prompt: "hello" }), "stream");
  assert.equal(runtimeContext.creatorApi.createGenerationBatch({ nodes: [] }), "batch");
  assert.equal(calls[0][2].canvasProjectId, "canvas-1");
  assert.equal(calls[0][2].purpose, "canvas-assets");
  assert.equal(calls[1][2], "node-1");
  await handle.dispose();
});

test("AI Canvas adapter loads backend model and Skill catalogs without secrets", async () => {
  let runtimeContext;
  const adapter = createAiCanvasRuntimeAdapter({
    creatorApi: {
      listCanvasAgentModels: async () => ({ models: [{ modelCode: "text-1", modelLabel: "文本模型", capabilities: { vision: true }, apiKey: "must-not-forward" }] }),
      listGlobalGenerationConfig: async ({ mediaType }) => ({ models: [{ modelId: `${mediaType}-1`, modelName: `${mediaType}模型`, mediaType, apiKey: "must-not-forward" }] }),
      getSkills: async () => ({ items: [{ id: "skill-1", name: "分镜 Skill", description: "用于分镜" }] }),
    },
    mountRuntime: async (_surface, context) => {
      runtimeContext = context;
      return { dispose() {} };
    },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-catalog" });
  assert.deepEqual(runtimeContext.modelCatalog.map((model) => model.modelCode), ["text-1", "image-1", "video-1", "audio-1"]);
  assert.deepEqual(runtimeContext.skillCatalog, [{
    id: "skill-1",
    name: "分镜 Skill",
    description: "用于分镜",
    summary: "用于分镜",
    category: "general",
    source: "official",
    version: undefined,
    content: "",
  }]);
  assert.equal(Object.hasOwn(runtimeContext.modelCatalog[0], "apiKey"), false);
  assert.equal(normalizeAiCanvasRuntimeModel({ modelCode: "m", apiKey: "secret" }).apiKey, undefined);
  assert.equal(normalizeAiCanvasRuntimeSkill({ id: "s", content: "body" }).content, "body");
  await handle.dispose();
});

test("AI Canvas runtime seeds a default assistant selection from the backend text catalog", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const catalogBridge = appSource.slice(
    appSource.indexOf("function createAiCanvasRuntimeCatalogBridge"),
    appSource.indexOf("function createAiCanvasRuntimeScaleBridge"),
  );
  assert.match(catalogBridge, /const defaultTextModelId = modelCatalog\.find\(\(model\) => model\.category === "text"\)\?\.id;/);
  assert.match(catalogBridge, /!state\?\.config\?\.assistantModelId && defaultTextModelId[\s\S]*?assistantModelId: `general\/\$\{defaultTextModelId\}`/);
});

test("AI Canvas backend media models declare task polling instead of a synchronous URL response", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const catalogBridge = appSource.slice(
    appSource.indexOf("function createAiCanvasRuntimeCatalogBridge"),
    appSource.indexOf("function createAiCanvasRuntimeScaleBridge"),
  );
  assert.match(catalogBridge, /const createBackendMediaExecutionProfile =/);
  assert.match(catalogBridge, /mode: "async"/);
  assert.match(catalogBridge, /auth: \{ type: "none" \}/);
  assert.match(catalogBridge, /taskIdPath: "data\.0\.task_id"/);
  assert.match(catalogBridge, /path: "\/tasks\/\{\{submit\.data\.0\.task_id\}\}"/);
  assert.match(catalogBridge, /statusPath: "data\.status"/);
  assert.match(catalogBridge, /data\.result\.images\.\*\.url/);
  assert.match(catalogBridge, /data\.result\.videos\.\*\.url/);
  assert.match(catalogBridge, /executionProfile: category === "image" \|\| category === "video"/);
  assert.match(catalogBridge, /normalizeExecutionProfile/);
  assert.ok(catalogBridge.includes('replaceAll("{{modelId}}", "{{model}}")'));
  assert.match(catalogBridge, /model: "\{\{model\}\}"/);
  assert.match(catalogBridge, /images: "\{\{imageUrls\}\}"/);
  assert.match(catalogBridge, /referenceImages: "\{\{referenceImageUrls\}\}"/);
  assert.match(catalogBridge, /referenceVideos: "\{\{referenceVideoUrls\}\}"/);
  assert.match(catalogBridge, /referenceAudios: "\{\{referenceAudioUrls\}\}"/);
  assert.match(catalogBridge, /firstFrame: "\{\{firstImage\}\}"/);
  assert.match(catalogBridge, /lastFrame: "\{\{lastImage\}\}"/);
  assert.match(catalogBridge, /duration: "\{\{duration\}\}"/);
  assert.match(catalogBridge, /aspectRatio: "\{\{aspectRatio\}\}"/);
  assert.match(catalogBridge, /resolution: "\{\{resolution\}\}"/);
  assert.match(catalogBridge, /generateAudio: "\{\{generateAudio\}\}"/);
  assert.match(catalogBridge, /intervalMs: 15_000/);
  assert.doesNotMatch(catalogBridge, /intervalMs: 2_000/);
  assert.doesNotMatch(catalogBridge, /canvasNodeId: "\{\{nodeId\}\}"/);
});

test("AI Canvas image and video generation registers with the project task center instead of polling /tasks", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../src/features/new-canvas/ai-canvas-runtime-adapter.js", import.meta.url), "utf8");
  assert.match(appSource, /function installAiCanvasAssistantTaskCenterBridge/);
  assert.match(appSource, /const taskCenterBridge = installAiCanvasAssistantTaskCenterBridge\(runtimeWindow/);
  assert.match(appSource, /context\.onGenerationTaskCreated\(taskId/);
  assert.match(appSource, /waitForTaskCenter\(taskId/);
  assert.match(appSource, /function isAiCanvasAssistantTaskTerminal/);
  assert.match(appSource, /"completed",\s*"succeeded",\s*"failed"/);
  assert.doesNotMatch(
    appSource.slice(
      appSource.indexOf("function isAiCanvasAssistantTaskTerminal"),
      appSource.indexOf("function readAiCanvasAssistantMediaCandidate"),
    ),
    /resolveAiCanvasAssistantTaskMedia\(task\)\.url/,
  );
  assert.match(appSource, /result\.previewUrl/);
  assert.match(appSource, /result\.images/);
  assert.match(appSource, /generatedOutputItems/);
  assert.match(appSource, /globalThis\.__COMIC_AI_NOTIFY_ASSISTANT_TASK_WAITERS__/);
  assert.match(appSource, /isSuccess && !resolveAiCanvasAssistantTaskMedia\(task\)\.url\) return/);
  assert.match(appSource, /\(unbound\.length \? unbound : generating\)\.at\(-1\)/);
  assert.match(adapterSource, /onGenerationTaskCreated: context\.onGenerationTaskCreated/);
  assert.match(workbenchSource, /globalThis\.__COMIC_AI_NOTIFY_ASSISTANT_TASK_WAITERS__\?\.\(task\)/);
  assert.match(workbenchSource, /function isTaskCenterSucceededWithoutMedia/);
  assert.match(workbenchSource, /unboundLoadingNodes\.at\(-1\) \?\? loadingNodes\.at\(-1\)/);
});

test("AI Canvas task center button shows the same generating count as the workbench", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../src/features/new-canvas/ai-canvas-runtime-adapter.js", import.meta.url), "utf8");
  const runtimeAppSource = readRuntimeAsset("App-");
  const brandCss = readFileSync(
    new URL("../ai-canvas-runtime/assets/runtime-brand-overrides.css", import.meta.url),
    "utf8",
  );
  assert.match(workbenchSource, /function countTaskCenterActiveTasks\(workbench\)/);
  assert.match(workbenchSource, /taskCenterActiveCount: countTaskCenterActiveTasks\(workbench\)/);
  assert.match(workbenchSource, /updateMountedNewCanvasSurface\(workbench, \{ taskCenterActiveCount: activeCount, surfaceOnly: true \}\)/);
  assert.match(adapterSource, /taskCenterActiveCount: context\.taskCenterActiveCount/);
  assert.match(appSource, /runtimeStore\.setState\(\{ taskCenterActiveCount: nextCount \}\)/);
  assert.match(appSource, /if \(next !== runtimeContext && !Object\.prototype\.hasOwnProperty\.call\(next, "taskCenterActiveCount"\)\) return;/);
  assert.match(runtimeAppSource, /taskCenterActiveCount: e\.taskCenterActiveCount/);
  assert.match(runtimeAppSource, /g > 0 \? \/\* @__PURE__ \*\/ \(0, Z\.jsx\)\("span", \{[\s\S]*className: "sidebar-badge"/);
  assert.match(brandCss, /\.sidebar-btn-v3 \.sidebar-badge/);
});

test("AI Canvas adapter preserves backend media parameter schemas and defaults", async () => {
  const model = normalizeAiCanvasRuntimeModel({
    modelCode: "image-2-discount",
    modelLabel: "Image-2(优惠)",
    mediaType: "image",
    supportedRatios: ["auto", "1:1", "2:3", "3:2"],
    supportedQuality: ["2K", "4K", "1K"],
    parameterSchema: {
      aspectRatio: { type: "string", options: ["auto", "1:1", "2:3", "3:2"] },
      quality: { type: "string", options: ["2K", "4K", "1K"] },
    },
    defaultParams: { aspectRatio: "2:3", quality: "4K" },
  });
  assert.deepEqual(model.supportedRatios, ["auto", "1:1", "2:3", "3:2"]);
  assert.deepEqual(model.supportedQuality, ["2K", "4K", "1K"]);
  assert.equal(model.defaultParams.quality, "4K");
  assert.equal(model.defaultParams.aspectRatio, "2:3");
  const video = normalizeAiCanvasRuntimeModel({
    modelCode: "video-1",
    mediaType: "video",
    supportedRatios: ["9:16"],
    supportedQuality: ["720p", "1080p"],
    supportedDurations: ["5", "10"],
    defaultParams: { aspectRatio: "9:16", resolution: "720p", durationSec: 5 },
    billingMode: "duration",
    resolutionCredits: { "720p": 120, "1080p": 180 },
    displayBaseCost: 120,
  });
  assert.deepEqual(video.videoCapability, {
    resolutions: ["720p", "1080p"],
    ratios: ["9:16"],
    durations: [5, 10],
    defaultResolution: "720p",
    defaultRatio: "9:16",
    defaultDuration: 5,
  });
  assert.equal(video.pricing.billingMode, "duration");
  assert.equal(video.pricing.resolutionCredits["720p"], 120);
  assert.equal(video.pricing.displayBaseCost, 120);
});

test("AI Canvas adapter preserves the host API without falling back to X6", async () => {
  const calls = [];
  const creatorApi = {
    getCanvasSettings() { calls.push("settings"); return { theme: "dark" }; },
    uploadFile() { return null; },
    runCanvasNode() { return null; },
    runCanvasTextNodeStream() { return null; },
    createCanvasGenerationBatch() { return null; },
  };
  const adapter = createAiCanvasRuntimeAdapter({ creatorApi });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-fallback" });
  assert.deepEqual(calls, []);
  assert.equal(handle.runtime, null);
  await handle.dispose();
});

test("AI Canvas adapter forwards the external project catalog to the runtime", async () => {
  let runtimeContext;
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async (_surface, context) => {
      runtimeContext = context;
      return { dispose() {} };
    },
  });
  const onSwitchProject = () => "canvas-2";
  await adapter.mount({}, {
    canvasProjectId: "canvas-1",
    projectCatalog: [{ id: "canvas-1", title: "项目一" }],
    currentProjectId: "canvas-1",
    onSwitchProject,
  });
  assert.deepEqual(runtimeContext.projectCatalog, [{ id: "canvas-1", title: "项目一" }]);
  assert.equal(runtimeContext.currentProjectId, "canvas-1");
  assert.equal(runtimeContext.onSwitchProject, onSwitchProject);
});

test("AI Canvas adapter exposes sync and forwards lifecycle updates", async () => {
  const synced = [];
  const updates = [];
  const disposed = [];
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async (_surface, context) => ({
      update(next) { updates.push(next); },
      dispose() { disposed.push(true); },
    }),
    syncDocument(document, metadata) { synced.push([document, metadata]); return "saved"; },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-2", theme: "light" });
  assert.equal(await handle.syncDocument({ nodes: [{ id: "n1" }] }, { reason: "test" }), "saved");
  await handle.update({ document: { nodes: [] }, selectionOnly: true, theme: "light" });
  assert.equal(synced.length, 2);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].canvasProjectId, "canvas-2");
  assert.equal(updates[0].runtime, AI_CANVAS_RUNTIME_KIND);
  assert.equal(updates[0].theme, "light");
  assert.equal(typeof updates[0].creatorApi.getCanvasSettings, "function");
  await handle.dispose();
  await handle.dispose();
  assert.equal(disposed.length, 1);
  assert.equal(AI_CANVAS_RUNTIME_KIND, "ai-canvas");
  assert.match(AI_CANVAS_RUNTIME_ADAPTER_VERSION, /^\d+\.\d+\.\d+$/);
});

test("AI Canvas runtime sync callback saves through the host without recursive runtime calls", async () => {
  const synced = [];
  let runtimeSyncCalls = 0;
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async (_surface, context) => {
      await context.syncDocument({ nodes: [{ id: "from-runtime" }] }, { reason: "runtime" });
      return {
        syncDocument() {
          runtimeSyncCalls += 1;
        },
      };
    },
    syncDocument(document, metadata) {
      synced.push([document, metadata]);
      return "saved";
    },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-runtime-sync" });
  assert.equal(runtimeSyncCalls, 0);
  assert.equal(synced.length, 1);
  assert.equal(synced[0][0].nodes[0].id, "from-runtime");
  assert.equal(synced[0][1].canvasProjectId, "canvas-runtime-sync");
  await handle.dispose();
});

test("AI Canvas runtime object sync avoids JSON clone round trips", async () => {
  const originalParse = JSON.parse;
  const originalStringify = JSON.stringify;
  let parseCalls = 0;
  let stringifyCalls = 0;
  let runtimeContext;
  const synced = [];
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async (_surface, context) => {
      runtimeContext = context;
      return { dispose() {} };
    },
    syncDocument(document) {
      synced.push(document);
    },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-object-sync" });
  JSON.parse = (...args) => {
    parseCalls += 1;
    return originalParse(...args);
  };
  JSON.stringify = (...args) => {
    stringifyCalls += 1;
    return originalStringify(...args);
  };
  try {
    await runtimeContext.syncDocument({
      nodes: [{ id: "runtime-node", type: "ai-text", data: { ports: { outputs: [] } } }],
      edges: [],
    }, { reason: "drag" });
  } finally {
    JSON.parse = originalParse;
    JSON.stringify = originalStringify;
    await handle.dispose();
  }
  assert.equal(parseCalls, 0);
  assert.equal(stringifyCalls, 0);
  assert.equal(synced[0].nodes[0].id, "runtime-node");
  assert.equal(synced[0].nodes[0].data.ports, undefined);
});

test("host-originated runtime updates do not schedule another document sync", async () => {
  const synced = [];
  const updates = [];
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async () => ({ update(next) { updates.push(next); }, dispose() {} }),
    syncDocument(document) { synced.push(document); },
  });
  const handle = await adapter.mount({}, { canvasProjectId: "canvas-host-update" });
  await handle.update({
    document: { nodes: [{ id: "server-node" }] },
    hostDocumentSync: false,
  });
  assert.equal(synced.length, 0);
  assert.equal(updates[0].document.nodes[0].id, "server-node");
  await handle.dispose();
});

test("chrome-only runtime updates do not clone the host document into the runtime", async () => {
  const synced = [];
  const updates = [];
  const adapter = createAiCanvasRuntimeAdapter({
    mountRuntime: async () => ({ update(next) { updates.push(next); }, dispose() {} }),
    syncDocument(document) { synced.push(document); },
  });
  const handle = await adapter.mount({}, {
    canvasProjectId: "canvas-chrome-update",
    document: { nodes: [{ id: "mounted-node" }] },
  });
  await handle.update({
    ui: { canvasDocument: { nodes: [{ id: "host-clone" }] } },
    surfaceOnly: true,
    hostDocumentSync: false,
  });
  assert.equal(synced.length, 0);
  assert.equal(updates[0].document, undefined);
  assert.equal(updates[0].taskCenterActiveCount, undefined);
  assert.equal(handle.document.nodes[0].id, "mounted-node");
  await handle.dispose();
});

test("AI Canvas polling refreshes the mounted runtime without a full host render", () => {
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /workbench\.refreshCanvasAfterAgentPatch = \(\) => syncCanvasHeadFromLive\([\s\S]*\{ force: true, render: !isAiCanvasRuntimeActive\(workbench\) \}/);
  assert.match(workbenchSource, /function isAiCanvasRuntimeActive\(workbench\)/);
  assert.match(workbenchSource, /else refreshMountedRuntime\(\);/);
  assert.match(workbenchSource, /else refreshMountedRuntime\(true\);/);
  assert.match(workbenchSource, /shouldSyncHostDocument/);
  assert.match(workbenchSource, /syncHostDocument: true/);
  assert.match(workbenchSource, /hostDocumentSync: false/);
  assert.match(workbenchSource, /render: workbench\.canvasLiveRender !== false && !isAiCanvasRuntimeActive\(workbench\)/);
  const adapterSource = readFileSync(new URL("../src/features/new-canvas/ai-canvas-runtime-adapter.js", import.meta.url), "utf8");
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(adapterSource, /Object\.prototype\.hasOwnProperty\.call\(next, "document"\)/);
  assert.doesNotMatch(adapterSource, /next\.ui\?\.canvasDocument/);
  assert.match(appSource, /const documentProvided = next\.document !== undefined \|\| next\.canvasDocument !== undefined/);
  assert.match(appSource, /documentProvided && !saveEnabled/);
  assert.match(appSource, /arePersistableCanvasRuntimeDocumentsEqual/);
  assert.match(appSource, /omitRuntimeEphemeralNodeFields/);
});

test("host live head documents do not echo back as canvas saves", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(appSource, /if \(documentProvided\) \{\s*document = readRuntimeDocument\(\);/);
  assert.match(appSource, /context\.onDocumentChange = \(nextDocument, metadata = \{\}\) => \{[\s\S]*arePersistableCanvasRuntimeDocumentsEqual\(document, nextDocument\)/);
});

test("AI Canvas runtime document sync skips duplicate host deep equality", () => {
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const runtimeSync = workbenchSource.match(
    /syncDocument: async \(document, metadata = \{\}\) => \{[\s\S]*?return document;\s*\},/,
  )?.[0] ?? "";
  assert.match(workbenchSource, /options\.skipEquality !== true && currentDocument/);
  assert.doesNotMatch(runtimeSync, /skipEquality:\s*true/);
});

test("browser series original uploads through COS instead of a local project folder", () => {
  const runtimeSource = readFileSync(new URL("../ai-canvas-runtime/runtime.js", import.meta.url), "utf8");
  const fileServiceSource = readRuntimeAsset("main-upstream-");
  const appSource = readRuntimeAsset("App-");
  const conversationSource = readRuntimeAsset("conversationExecutionController-");
  const backendSource = readFileSync(
    new URL("../../backend/src/entrypoints/phone-auth-dev-server.ts", import.meta.url),
    "utf8",
  );
  assert.match(runtimeSource, /__COMIC_AI_CANVAS_HOST_API__/);
  assert.match(fileServiceSource, /purpose:`series-original`/);
  assert.match(fileServiceSource, /filePath:o,storageObjectId:i\|\|void 0/);
  assert.match(fileServiceSource, /function Iw\(e\)\{return new Promise\(t=>\{let n=document\.createElement\(`input`\),r=!1,i=e=>\{r\|\|\(r=!0/);
  assert.doesNotMatch(fileServiceSource, /function Iw\(e\)\{[\s\S]{0,800}window\.addEventListener\(`focus`/);
  assert.match(fileServiceSource, /r\.parentId\?\?\(J\(\)\?await bU\(\{set:e,get:t,project:r\}\):r\.id\)/);
  assert.match(fileServiceSource, /series:r\.series,nodes:\[\]/);
  assert.match(fileServiceSource, /if\(!J\(\)\)return t\(\)\.showToast\(`请使用「生成 AI 拆分草案」拆分，已保留当前原著`,`error`\),\[\]/);
  assert.match(fileServiceSource, /return n\?\(J\(\)\?await t\(\)\.switchProject\(n\):t\(\)\.showToast\(`已新增分集`\),n\):n/);
  assert.match(appSource, /storageObjectId:t\.storageObjectId,addedAt:Date\.now\(\)/);
  assert.match(appSource, /sourceUrl:a\?r:void 0,storageObjectId:t\.storageObjectId,addedAt:Date\.now\(\)/);
  assert.match(appSource, /catch\(n\)\{u\(n instanceof Error\?n\.message:e\(`原著处理失败`\),`error`\)\}/);
  assert.match(conversationSource, /n\.sourceUrl/);
  assert.match(backendSource, /normalizedPurpose === "series-original"/);
  assert.match(backendSource, /maxBytes: 20 \* 1024 \* 1024/);
  const originalReaderSource = readRuntimeAsset("useTooltipAutoPlacement-");
  assert.match(originalReaderSource, /e\.sourceUrl\?\?e\.filePath\?\?e\.relativePath/);
  assert.match(originalReaderSource, /fetch\(c,\{signal:n,credentials:`include`\}\)/);
  assert.match(originalReaderSource, /目标总集数：\$\{e\.targetEpisodeCount\} 集；单集目标时长：\$\{e\.targetDurationSec\} 秒/);
  assert.match(appSource, /Math\.min\(500,Math\.max\(1,Number\.parseInt\(D,10\)\|\|24\)\)/);
  assert.match(appSource, /max:500,value:D/);
  assert.doesNotMatch(appSource, /Math\.min\(100,Math\.max\(1,Number\.parseInt\(D,10\)\|\|24\)\)/);
  assert.doesNotMatch(appSource, /max:100,value:D/);
});

test("browser AI assistant can split the current series into episode canvases", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const fileServiceSource = readRuntimeAsset("main-upstream-");
  const conversationSource = readRuntimeAsset("conversationExecutionController-");
  assert.match(conversationSource, /id:`series_split_episodes`/);
  assert.match(conversationSource, /await w\.getState\(\)\.addEpisodes\(n\)/);
  assert.match(fileServiceSource, /if\(!J\(\)\)return t\(\)\.showToast\(`请使用「生成 AI 拆分草案」拆分，已保留当前原著`,`error`\),\[\]/);
  assert.match(appSource, /function mergeAiCanvasRuntimeProjects/);
  assert.match(appSource, /function addAiCanvasRuntimeEpisodes/);
  assert.match(appSource, /addEpisodes: isAiCanvasRuntimeNativeHost\(\)[\s\S]*addAiCanvasRuntimeEpisodes\(store, episodes\)/);
  assert.match(appSource, /if \(id && project\.parentId && !catalogIds\.has\(id\)\) merged\.push\(project\)/);
  assert.match(appSource, /const projects = mergeAiCanvasRuntimeProjects\(projectCatalog, existingProjects\)/);
  assert.match(appSource, /const projects = mergeAiCanvasRuntimeProjects\(projectCatalog, store\.getState\(\)\?\.projects\)/);
});

test("browser canvas skips Tauri video editor event listen", () => {
  const windowSource = readRuntimeAsset("videoEditorWindowService-");
  assert.match(windowSource, /async function g\(\)\{if\(!m\(\)\)return;/);
  assert.match(windowSource, /async function _\(\)\{if\(!m\(\)\)return;/);
  assert.doesNotMatch(windowSource, /async function g\(\)\{return s\|\(/);
});

test("web canvas falls back to the in-page editor when shotlist push has no Tauri window", () => {
  const runtimeSource = readFileSync(new URL("../ai-canvas-runtime/runtime.js", import.meta.url), "utf8");
  const windowSource = readRuntimeAsset("videoEditorWindowService-");
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const hostSource = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(runtimeSource, /__COMIC_AI_CANVAS_VIDEO_EDITOR_BRIDGE__/);
  assert.match(runtimeSource, /openShotlist: context\.onVideoEditorOpenShotlist/);
  assert.match(windowSource, /__COMIC_AI_CANVAS_VIDEO_EDITOR_BRIDGE__/);
  assert.match(windowSource, /b\?\.openShotlist/);
  assert.match(appSource, /onVideoEditorOpenShotlist: context\.onVideoEditorOpenShotlist/);
  assert.match(workbenchSource, /onVideoEditorOpenShotlist:/);
  assert.match(hostSource, /openCanvasVideoEditorForShotlist/);
  assert.match(hostSource, /dataset\.canvasVideoEditorHost/);
});

test("new Canvas mounts the standalone React Flow runtime directly in the page", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const adapterSource = readFileSync(new URL("../src/features/new-canvas/ai-canvas-runtime-adapter.js", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../ai-canvas-runtime/runtime.js", import.meta.url), "utf8");
  const runtimeAssetPath = runtimeSource.match(/import "(\.\/assets\/main-[^"]+\.js)"/)?.[1];
  assert.ok(runtimeAssetPath);
  const runtimeAssetSource = readFileSync(
    new URL(`../ai-canvas-runtime/${runtimeAssetPath.slice(2)}`, import.meta.url),
    "utf8",
  );
  const runtimeAppSource = readRuntimeAsset("App-");
  const chatPanelSource = readRuntimeAsset("ChatPanel-");
  const mediaProtocolSource = readRuntimeAsset("useTooltipAutoPlacement-");
  const conversationExecutionSource = readRuntimeAsset("conversationExecutionController-");
  const modelSelectorSource = readRuntimeAsset("ModelSelector-");
  const runtimeDialogSource = readRuntimeAsset("AINodeDialog-");
  const brandCss = readFileSync(
    new URL("../ai-canvas-runtime/assets/runtime-brand-overrides.css", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /import\("\/ai-canvas-runtime\/runtime\.js"\)/);
  assert.doesNotMatch(adapterSource, /mountAssistantLauncher|ai-canvas-agent-launcher/);
  assert.match(chatPanelSource, /chat-panel-input-toolbar-left/);
  assert.match(chatPanelSource, /lucide:notebook-pen/);
  assert.match(chatPanelSource, /lucide:circle-check/);
  assert.doesNotMatch(chatPanelSource, /icon: "mdi:at"/);
  assert.match(modelSelectorSource, /data-tooltip.*选择模型/);
  assert.match(appSource, /\.new-canvas-root \.model-selector-trigger[\s\S]*?width: 32px !important/);
  assert.match(appSource, /mountAiCanvasRuntime\(surface/);
  assert.doesNotMatch(appSource, /<iframe|createElement\("iframe"/i);
  assert.match(appSource, /dataset\.aiCanvasRuntimeGlobalStyle/);
  assert.match(appSource, /\.new-canvas-root > \.app-shell/);
  assert.match(appSource, /releaseAiCanvasRuntimeGlobalStyle/);
  assert.match(appSource, /createAiCanvasRuntimeThemeBridge/);
  assert.match(appSource, /createAiCanvasRuntimeConfigBridge/);
  assert.match(appSource, /ai-canvas\.mascot\.visible/);
  assert.match(appSource, /mascotHiddenByUser/);
  assert.match(appSource, /mascotVisible = mascotHiddenByUser \? false : true/);
  assert.match(appSource, /previousState\?\.configHydrated !== false && nextState\?\.configHydrated !== false/);
  assert.match(appSource, /createAiCanvasRuntimeCatalogBridge/);
  assert.match(appSource, /const catalogBridge = createAiCanvasRuntimeCatalogBridge\(runtimeStore, context\)/);
  assert.match(appSource, /backendBaseUrl[\s\S]*?\/api\/canvas\//);
  assert.doesNotMatch(appSource, /canvasNodeId: "\{\{nodeId\}\}"/);
  assert.match(mediaProtocolSource, /variables:/);
  assert.match(conversationExecutionSource, /n\.sourceUrl/);
  assert.match(runtimeAppSource, /saveCurrentProjectSilent/);
  assert.match(appSource, /onDocumentChange: \(document, metadata = \{\}\) => context\.syncDocument\?\.\(document, metadata\)/);
  assert.match(appSource, /protocol: "backend", baseUrl: backendBaseUrl/);
  assert.match(appSource, /const unsubscribe = store\.subscribe\?\.\(\(nextState, previousState\) =>/);
  assert.match(appSource, /modelCatalog: context\.modelCatalog \?\? context\.models/);
  assert.match(appSource, /config\.canvasBackground === canvasBackground/);
  assert.match(appSource, /theme: currentTheme,[\s\S]*?canvasBackground/);
  assert.match(appSource, /createAiCanvasRuntimeScaleBridge/);
  assert.match(appSource, /getComputedStyle\(document\.body\)\.zoom/);
  assert.match(appSource, /host\.style\.zoom = String\(1 \/ inheritedZoom\)/);
  assert.match(appSource, /isStandaloneHost/);
  assert.match(appSource, /height: \$\{isStandaloneHost \? "100dvh" : "100%"\} !important/);
  assert.match(appSource, /min-height: \$\{isStandaloneHost \? "100dvh" : "0"\} !important/);
  assert.match(appSource, /\.ai-canvas-standalone-mount > \[data-new-canvas-light-dom-root\][\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;[\s\S]*?zoom: calc\(1 \/ var\(--app-ui-scale, 1\)\)/);
  assert.match(appSource, /\.ai-canvas-standalone-mount > \[data-new-canvas-light-dom-root\] > \[data-new-canvas-style-gate\][\s\S]*?\.ai-canvas-standalone-mount \.new-canvas-loading-skeleton[\s\S]*?height: 100% !important;[\s\S]*?min-height: 100% !important;/);
  assert.match(appSource, /html:has\(\.ai-canvas-standalone-mount\)[\s\S]*?body\.workbench-body:has\(\.ai-canvas-standalone-mount\)[\s\S]*?position: static !important;[\s\S]*?inset: auto !important;[\s\S]*?background: var\(--theme-app-background, #08111b\) !important;/);
  assert.match(appSource, /embedded: context\.embedded !== false/);
  assert.match(appSource, /createAiCanvasRuntimeHostProjectGuard/);
  assert.match(appSource, /setChatPanelDetached\?\.\(false\)/);
  assert.match(appSource, /function openAiCanvasRuntimeAssistant\(runtimeStore\)/);
  assert.match(appSource, /function subscribeAiCanvasRuntimeAssistantPreference\(runtimeStore\)/);
  assert.match(appSource, /setChatPanelDetached\?\.\(false\);[\s\S]*?openChat\?\.\(\)/);
  assert.match(appSource, /openAiCanvasRuntimeAssistant\(runtimeStore\);[\s\S]*?unsubscribeAssistantPreference = subscribeAiCanvasRuntimeAssistantPreference\(runtimeStore\)/);
  assert.match(appSource, /function installAiCanvasRuntimeHeaderChrome\(surface, runtimeStore, context = \{\}\)/);
  assert.match(appSource, /function installAiCanvasRuntimeFooterZoomControls\(surface\)/);
  assert.match(appSource, /function installAiCanvasRuntimePromptCreditCost\(surface, runtimeStore\)/);
  assert.match(appSource, /disposePromptCreditCost = installAiCanvasRuntimePromptCreditCost\(surface, runtimeStore\)/);
  assert.match(appSource, /matchCanvasRuntimeCatalogModel\(models, selectedValue\)/);
  assert.match(appSource, /canvas-model-prefs/);
  assert.match(appSource, /resolveAiCanvasRuntimeModelPricing/);
  assert.match(brandCss, /\.new-canvas-root \.prompt-footer \.prompt-credit-cost/);
  assert.match(appSource, /toolbar\.append\(controls\)/);
  assert.match(appSource, /data-host-header-trigger="help"/);
  assert.match(appSource, /data-host-header-trigger="projects"/);
  assert.match(appSource, /disposeHeaderChrome = installAiCanvasRuntimeHeaderChrome\(surface, runtimeStore, runtimeContext\)/);
  assert.match(appSource, /disposeFooterZoomControls = installAiCanvasRuntimeFooterZoomControls\(surface\)/);
  assert.match(appSource, /\.chat-panel \.chat-panel-textarea \{[\s\S]*?min-height: 92px !important;[\s\S]*?max-height: 220px !important;/);
  assert.match(appSource, /\.new-canvas-root \.chat-panel,[\s\S]*?\.new-canvas-root \.chat-panel-header,[\s\S]*?\.new-canvas-root \.chat-panel-input-area,[\s\S]*?\.new-canvas-root \.chat-panel \* \{[\s\S]*?-webkit-backdrop-filter:\s*none !important;[\s\S]*?backdrop-filter:\s*none !important;/);
  assert.match(appSource, /div:has\(> \.chat-panel-textarea\) \{[\s\S]*?min-height: 92px !important;/);
  assert.match(appSource, /function ensureAiCanvasRuntimeDefaultConversation\(runtimeStore, context = \{\}\)/);
  assert.match(appSource, /loadConversationsForProject\?\.\(currentProjectId\)/);
  assert.match(appSource, /conversations\.find\(belongsToCurrentProject\)/);
  assert.match(appSource, /createConversation\?\.\(settledProjectId\)/);
  assert.match(appSource, /await ensureAiCanvasRuntimeDefaultConversation\(runtimeStore, runtimeContext\)/);
  assert.match(appSource, /initFromDb: async \(\) => applyHostProjectState/);
  assert.match(appSource, /loadProject: async \(\) => applyHostProjectState/);
  assert.match(appSource, /saveCurrentProject: saveThroughHost/);
  assert.match(appSource, /saveCurrentProjectSilent: saveThroughHost/);
  assert.match(appSource, /blocked empty canvas overwrite/);
  assert.match(appSource, /hostProjectGuard\.enableSaves\?\.\(\)/);
  assert.match(appSource, /projectLoadStatus: "loading"/);
  assert.match(appSource, /hostProjectGuard\.update\(next\)/);
  assert.match(appSource, /hostProjectGuard\.dispose\(\)/);
  assert.match(appSource, /theme: normalizeAiCanvasTheme\(context\.theme\)/);
  assert.match(appSource, /const styleRoot = isShadowRoot \? rootNode : document\.head/);
  assert.match(appSource, /styleRoot\.append\(layoutStyle\)/);
  assert.match(appSource, /styleRoot\.append\(stylesheet\)/);
  assert.match(appSource, /\[data-new-canvas-light-dom-root\]/);
  assert.match(appSource, /function createAiCanvasRuntimeScaleBridge\(surface, options = \{\}\)/);
  assert.match(appSource, /options\.lightDom === true[\s\S]*?return \{ dispose\(\) \{\} \}/);
  assert.match(appSource, /createAiCanvasRuntimeScaleBridge\(surface, \{[\s\S]*?lightDom: !isShadowRoot/);
  assert.match(appSource, /duplicateProject: context\.onDuplicateProject/);
  assert.match(appSource, /exportProject: context\.onExportProject/);
  assert.match(appSource, /importProject: context\.onImportProject/);
  assert.match(appSource, /storeModule\?\.useAppStore \?\? storeModule\?\.t/);
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /isAiCanvasRuntime \? \{ styleHrefs: \[\], lightDom: true \} : \{\}/);
  assert.match(workbenchSource, /isAiCanvasRuntime \? \{ embedded: false \} : \{\}/);
  assert.match(workbenchSource, /theme: workbench\.ui\?\.selectedWorkbenchTheme === "daylight" \? "light" : "dark"/);
  assert.match(workbenchSource, /AI Canvas theme update failed/);
  const runtimeCssFiles = readdirSync(new URL("../ai-canvas-runtime/assets/", import.meta.url))
    .filter((name) => /^(runtime|style)-[^/]+\.css$/.test(name));
  assert.ok(runtimeCssFiles.some((name) => name.startsWith("style-") || name.startsWith("runtime-")));
  assert.match(runtimeSource, /mountAiCanvasRuntime/);
  assert.match(runtimeSource, /useAppStore/);
  assert.match(runtimeSource, /__COMIC_AI_CANVAS_RUNTIME__/);
  assert.match(runtimeAssetSource, /embedded/);
  assert.match(runtimeAssetSource, /ai-canvas:document/);
  assert.match(runtimeAssetSource, /onDocumentChange/);
  assert.doesNotMatch(runtimeAssetSource, /creatorApi|projectCatalog|onSwitchProject/);
  assert.doesNotMatch(runtimeAppSource, /aria-label: e\("画布更多操作"\)/);
  assert.match(runtimeDialogSource, /supportedQuality/);
  assert.match(runtimeDialogSource, /supportedRatios/);
  assert.match(runtimeDialogSource, /config\.generalModels/);
  assert.match(runtimeDialogSource, /showImageSize:Q\.resolutions\.length>0/);
  assert.match(runtimeDialogSource, /showAspectRatio:Q\.ratios\.length>0/);
});

test("video param panel follows backend model capability instead of ComfyUI fallback", () => {
  const runtimeDialogSource = readRuntimeAsset("AINodeDialog-");
  const videoParamSource = readRuntimeAsset("MentionEditor-");
  assert.match(runtimeDialogSource, /config\.generalModels/);
  assert.match(videoParamSource, /R=e===`comfyui`\|\|e===`runninghub`/);
  assert.doesNotMatch(videoParamSource, /runninghub`\|\|!e/);
});

test("new canvas aspect ratio change writes nodeWidth and nodeHeight", () => {
  const runtimeDialogSource = readRuntimeAsset("AINodeDialog-");
  const storeSource = readRuntimeAsset("main-upstream-");
  assert.match(storeSource, /if\(e===`自适应`\)return\{nodeWidth:280,nodeHeight:280/);
  assert.match(runtimeDialogSource, /let t=\{aspectRatio:e\},n=C\(e\);n&&Object\.assign\(t,n\),h\(s,t\)/);
});

test("completed canvas nodes open the prompt dialog on click after refresh", () => {
  const runtimeAppSource = readRuntimeAsset("App-");
  const completedClick = runtimeAppSource.match(
    /if\(n\.data\?\.role===`source`\|\|n\.data\?\.type===`ai-text`&&n\.data\?\.output\|\|n\.data\?\.type===`ai-image`&&n\.data\?\.imageUrl[\s\S]{0,280}?return;/,
  )?.[0] ?? "";
  assert.match(completedClick, /on\(n\);return/);
  assert.doesNotMatch(completedClick, /h\(\);return/);
});

test("new canvas floating menu hosts task center and operation history", () => {
  const runtimeAppSource = readRuntimeAsset("App-");
  const chatPanelSource = readRuntimeAsset("ChatPanel-");
  const brandCss = readFileSync(
    new URL("../ai-canvas-runtime/assets/runtime-brand-overrides.css", import.meta.url),
    "utf8",
  );
  assert.match(runtimeAppSource, /任务中心 · \{count\} 进行中/);
  assert.match(runtimeAppSource, /操作记录/);
  assert.match(runtimeAppSource, /canvasHistoryPinned/);
  assert.match(runtimeAppSource, /ai-canvas-open-project-task-center/);
  assert.doesNotMatch(chatPanelSource, /ai-canvas-open-project-task-center/);
  assert.doesNotMatch(chatPanelSource, /任务中心 · \{count\} 进行中/);
  assert.match(brandCss, /sidebar-btn-v3\[data-tooltip\^="任务中心"\]/);
  assert.match(brandCss, /\.new-canvas-root \.canvas-history-wrap:not\(\[data-pinned="true"\]\)/);
  assert.match(brandCss, /\.new-canvas-root \.chat-panel[\s\S]*?\.new-canvas-root \.chat-panel \*[\s\S]*?backdrop-filter:\s*none !important/);
  assert.match(brandCss, /\.canvas-radial-backdrop,[\s\S]*?\.canvas-radial-menu,[\s\S]*?\.canvas-radial-hold-indicator,[\s\S]*?\.canvas-radial-editor,[\s\S]*?\[data-canvas-radial-menu\] \{[\s\S]*?display: none !important;/);
});

test("project task center opens after the runtime click dispatch completes", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const listener = appSource.match(/const onOpenProjectTaskCenter = \(event\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
  assert.match(listener, /event\.preventDefault\(\);/);
  assert.match(listener, /event\.preventDefault\(\);[\s\S]*?globalThis\.setTimeout\?\.\(\(\) => \{/);
  assert.match(listener, /globalThis\.setTimeout\?\.\(\(\) => \{[\s\S]*?context\.onOpenTaskCenter\(\)/);
});

test("canvas assistant media binds generated tasks to the requested node", () => {
  const backendSource = readFileSync(
    new URL("../../backend/src/entrypoints/phone-auth-dev-server.ts", import.meta.url),
    "utf8",
  );
  assert.match(backendSource, /const canvasNodeId = readString\(body\.canvasNodeId \?\? body\.nodeKey\)/);
  assert.match(backendSource, /createCanvasNodeRun\(db, \{[\s\S]*?nodeKey: canvasNodeId,[\s\S]*?mediaKind: kind/);
  assert.match(backendSource, /targetId: canvasNodeId \?\? canvasProjectId/);
  assert.match(backendSource, /markCanvasNodeRunQueued\(db, \{[\s\S]*?runId: nodeRun\.id,[\s\S]*?taskId: generatedTaskId/);
});

test("standalone Canvas context menu omits local folder actions", () => {
  const appAssetSource = readRuntimeAsset("App-");
  assert.doesNotMatch(appAssetSource, /创建文件夹/);
  assert.match(appAssetSource, /打开项目文件夹失败/);
});

test("deferred media loading does not strip AI Canvas prompt dialog thumbnails", () => {
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(
    workbenchSource,
    /\[data-selection-picker-id\], \.asset-image-lightbox, \.modal-backdrop, \[data-canvas-image-fullscreen\], \.canvas-text-skill-layer, \.canvas-script-batch-layer, \.ai-dialog-float, \.connected-nodes-float, \.connected-node-thumb/,
  );
});
