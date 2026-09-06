import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
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
  });
  assert.deepEqual(video.videoCapability, {
    resolutions: ["720p", "1080p"],
    ratios: ["9:16"],
    durations: [5, 10],
    defaultResolution: "720p",
    defaultRatio: "9:16",
    defaultDuration: 5,
  });
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

test("AI Canvas polling refreshes the mounted runtime without a full host render", () => {
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /workbench\.refreshCanvasAfterAgentPatch = \(\) => syncCanvasHeadFromLive\([\s\S]*\{ force: true, render: !isAiCanvasRuntimeActive\(workbench\) \}/);
  assert.match(workbenchSource, /function isAiCanvasRuntimeActive\(workbench\)/);
  assert.match(workbenchSource, /else refreshMountedRuntime\(\);/);
  assert.match(workbenchSource, /updateMountedNewCanvasSurface\(workbench, \{ surfaceOnly: true, hostDocumentSync: false \}\)/);
  assert.match(workbenchSource, /render: workbench\.canvasLiveRender !== false && !isAiCanvasRuntimeActive\(workbench\)/);
});

test("AI Canvas runtime document sync skips duplicate host deep equality", () => {
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /skipEquality: true/);
  assert.match(workbenchSource, /options\.skipEquality !== true && currentDocument/);
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
  const runtimeAppSource = readFileSync(
    new URL("../ai-canvas-runtime/assets/App-BhrU-uKS.js", import.meta.url),
    "utf8",
  );
  const chatPanelSource = readFileSync(
    new URL("../ai-canvas-runtime/assets/ChatPanel-D-dIH-Xx.js", import.meta.url),
    "utf8",
  );
  const modelSelectorSource = readFileSync(
    new URL("../ai-canvas-runtime/assets/ModelSelector-BPW0Bkh4.js", import.meta.url),
    "utf8",
  );
  const runtimeDialogSource = readFileSync(
    new URL("../ai-canvas-runtime/assets/AINodeDialog-DcjHokJW.js", import.meta.url),
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
  assert.match(appSource, /createAiCanvasRuntimeCatalogBridge/);
  assert.match(appSource, /const catalogBridge = createAiCanvasRuntimeCatalogBridge\(runtimeStore, context\)/);
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
  assert.match(appSource, /\.ai-canvas-standalone-mount \[data-new-canvas-light-dom-root\][\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;[\s\S]*?zoom: calc\(1 \/ var\(--app-ui-scale, 1\)\)/);
  assert.match(appSource, /embedded: context\.embedded !== false/);
  assert.match(appSource, /createAiCanvasRuntimeHostProjectGuard/);
  assert.match(appSource, /setChatPanelDetached\?\.\(false\)/);
  assert.match(appSource, /setChatPanelDetached\?\.\(false\);[\s\S]*?openChat\?\.\(\)/);
  assert.match(appSource, /\.chat-panel \.chat-panel-textarea \{[\s\S]*?min-height: 92px !important;[\s\S]*?max-height: 220px !important;/);
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
    .filter((name) => /^runtime-[^/]+\.css$/.test(name));
  assert.ok(runtimeCssFiles.includes("runtime-DvQFP_BS.css"));
  assert.match(runtimeSource, /mountAiCanvasRuntime/);
  assert.match(runtimeSource, /useAppStore/);
  assert.match(runtimeSource, /__COMIC_AI_CANVAS_RUNTIME__/);
  assert.match(runtimeAssetSource, /embedded/);
  assert.match(runtimeAssetSource, /ai-canvas:document/);
  assert.match(runtimeAssetSource, /onDocumentChange/);
  assert.doesNotMatch(runtimeAssetSource, /creatorApi|projectCatalog|onSwitchProject/);
  assert.match(runtimeAppSource, /s\.map\(\(project\)/);
  assert.doesNotMatch(runtimeAppSource, /s\.map\(\(e\)[\s\S]{0,1800}aria-label: e\("画布更多操作"\)/);
  assert.match(runtimeDialogSource, /supportedQuality/);
  assert.match(runtimeDialogSource, /supportedRatios/);
  assert.match(runtimeDialogSource, /runtimeModels/);
  assert.match(runtimeDialogSource, /showImageSize: Z\.resolutions\?\.length > 0/);
  assert.match(runtimeDialogSource, /showAspectRatio: Z\.ratios\?\.length > 0/);
  assert.match(runtimeDialogSource, /me = \(0, G\.useCallback\)\(\(e\) => l\(t, \{ aspectRatio: e \}\)/);
});

test("project task center opens after the runtime click dispatch completes", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const listener = appSource.match(/const onOpenProjectTaskCenter = \(event\) => \{[\s\S]*?\n    \};/)?.[0] ?? "";
  assert.match(listener, /event\.preventDefault\(\);/);
  assert.match(listener, /event\.preventDefault\(\);[\s\S]*?globalThis\.setTimeout\?\.\(\(\) => \{/);
  assert.match(listener, /globalThis\.setTimeout\?\.\(\(\) => \{[\s\S]*?context\.onOpenTaskCenter\(\)/);
});

test("standalone Canvas context menu omits local folder actions", () => {
  const runtimeSource = readFileSync(new URL("../ai-canvas-runtime/runtime.js", import.meta.url), "utf8");
  const appAssetPath = runtimeSource.match(/import \"\.\/assets\/(App-[^"]+\.js)\"/)?.[1] ?? "App-BhrU-uKS.js";
  const appAssetSource = readFileSync(new URL(`../ai-canvas-runtime/assets/${appAssetPath}`, import.meta.url), "utf8");
  const menuStart = appAssetSource.indexOf("function gl(");
  const menuEnd = appAssetSource.indexOf("function ", menuStart + 10);
  assert.ok(menuStart >= 0);
  const contextMenuSource = appAssetSource.slice(menuStart, menuEnd > menuStart ? menuEnd : undefined);
  assert.doesNotMatch(contextMenuSource, /创建文件夹|打开项目文件夹/);
});
