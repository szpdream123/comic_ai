import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { canvasContentToDocument, canvasDocumentToContent } from "../new-canvas/src/loomic-core/canvas-document-adapter.js";
import {
  CANVAS_TOOL_PRESET_CATEGORIES,
  CANVAS_TOOL_PRESETS,
  extractCanvasToolPresetTopology,
  listCanvasToolPresets,
  mergeCanvasUserToolPresetMetadata,
  normalizeCanvasUserToolPreset,
  useCanvasToolPreset,
} from "../new-canvas/src/loomic-core/canvas-tool-presets.js";
import { createCanvasToolPresetLazyLoader } from "../new-canvas/src/loomic-core/canvas-tool-preset-loader.js";
import { canvasToolPresetToResourceEntry, createCanvasToolPresetCatalog } from "../new-canvas/src/loomic-core/canvas-tool-preset-catalog.js";

function createCanvasApi() {
  let elements = [];
  const updates = [];
  return {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      if (Array.isArray(update.elements)) elements = update.elements;
      updates.push(update);
    },
    read: () => ({ elements, updates }),
  };
}

test("tool preset catalog exposes searchable categories and topology previews", () => {
  assert.deepEqual(CANVAS_TOOL_PRESET_CATEGORIES.map(({ id }) => id), ["all", "image", "video", "storyboard", "director", "audio"]);
  assert.equal(CANVAS_TOOL_PRESETS.length, 12);
  assert.deepEqual(listCanvasToolPresets({ query: "文生视频" }).map(({ id }) => id), ["script-to-video"]);
  assert.deepEqual(listCanvasToolPresets({ category: "audio" }).map(({ id }) => id), ["script-narration", "audio-to-video"]);
  for (const preset of CANVAS_TOOL_PRESETS) {
    assert.ok(preset.description);
    assert.ok(preset.tags.length);
    assert.equal(preset.preview.kind, "workflow-topology");
    assert.strictEqual(preset.preview.nodes, preset.nodes);
    assert.strictEqual(preset.preview.connections, preset.connections);
  }
});

test("user preset summaries remain renderable without inventing an empty executable topology", () => {
  const preset = normalizeCanvasUserToolPreset({
    id: "summary-only",
    name: "摘要工具",
    category: "image",
    currentVersionNumber: 4,
    nodeCount: 3,
    edgeCount: 2,
  });

  assert.equal(preset.topology, null);
  assert.equal(preset.preview.kind, "workflow-summary");
  assert.deepEqual([preset.nodeCount, preset.edgeCount], [3, 2]);
  assert.deepEqual(preset.preview.nodes, []);
});

test("metadata updates preserve an explicitly selected historical preset version", () => {
  const historical = normalizeCanvasUserToolPreset({
    id: "versioned-preset",
    name: "原名称",
    currentVersionNumber: 3,
  }, {
    versionNumber: 1,
    topology: { schemaVersion: 1, nodes: [{ kind: "image", offsetX: 0, offsetY: 0 }], connections: [] },
  });
  const renamed = mergeCanvasUserToolPresetMetadata(historical, {
    name: "新名称",
    currentVersionNumber: 3,
    currentVersion: {
      versionNumber: 3,
      topology: { schemaVersion: 1, nodes: [{ kind: "video", offsetX: 0, offsetY: 0 }], connections: [] },
    },
  });

  assert.equal(renamed.title, "新名称");
  assert.equal(renamed.currentVersionNumber, 3);
  assert.equal(renamed.selectedVersionNumber, 1);
  assert.equal(renamed.topology.nodes[0].kind, "image");
});

test("tool preset detail and version loaders deduplicate concurrent requests and retry failures", async () => {
  let detailCalls = 0;
  let versionCalls = 0;
  let failNextDetail = true;
  const loader = createCanvasToolPresetLazyLoader({
    async loadDetail(presetId) {
      detailCalls += 1;
      if (failNextDetail) {
        failNextDetail = false;
        throw new Error("detail_failed");
      }
      return { id: presetId, topology: { nodes: [{ kind: "image" }], connections: [] } };
    },
    async loadVersions(presetId) {
      versionCalls += 1;
      return [{ presetId, versionNumber: 1 }];
    },
  });

  await assert.rejects(Promise.all([
    loader.loadDetail("preset-1"),
    loader.loadDetail("preset-1"),
  ]), /detail_failed/);
  assert.equal(detailCalls, 1);

  const [firstDetail, secondDetail] = await Promise.all([
    loader.loadDetail("preset-1"),
    loader.loadDetail("preset-1"),
  ]);
  assert.strictEqual(firstDetail, secondDetail);
  assert.equal(detailCalls, 2);

  const [firstVersions, secondVersions] = await Promise.all([
    loader.loadVersions("preset-1"),
    loader.loadVersions("preset-1"),
  ]);
  assert.strictEqual(firstVersions, secondVersions);
  await loader.loadVersions("preset-1");
  assert.equal(versionCalls, 1);
});

test("tool preset loader invalidation prevents stale in-flight responses from repopulating caches", async () => {
  let resolveStaleDetail;
  let resolveStaleVersions;
  let detailCalls = 0;
  let versionCalls = 0;
  const loader = createCanvasToolPresetLazyLoader({
    loadDetail: async (presetId) => {
      detailCalls += 1;
      if (detailCalls === 1) return new Promise((resolve) => { resolveStaleDetail = resolve; });
      return { id: presetId, marker: "fresh-detail" };
    },
    loadVersions: async (presetId) => {
      versionCalls += 1;
      if (versionCalls === 1) return new Promise((resolve) => { resolveStaleVersions = resolve; });
      return [{ presetId, versionNumber: 2 }];
    },
  });

  const staleDetail = loader.loadDetail("preset-race");
  await Promise.resolve();
  loader.seedDetail("preset-race", { id: "preset-race", marker: "seeded-detail" });
  resolveStaleDetail({ id: "preset-race", marker: "stale-detail" });
  await staleDetail;
  assert.equal((await loader.loadDetail("preset-race")).marker, "seeded-detail");

  const staleVersions = loader.loadVersions("preset-race");
  await Promise.resolve();
  loader.invalidateVersions("preset-race");
  assert.deepEqual(await loader.loadVersions("preset-race"), [{ presetId: "preset-race", versionNumber: 2 }]);
  resolveStaleVersions([{ presetId: "preset-race", versionNumber: 1 }]);
  await staleVersions;
  assert.deepEqual(await loader.loadVersions("preset-race"), [{ presetId: "preset-race", versionNumber: 2 }]);
  assert.equal(versionCalls, 2);
});

test("toolbox catalog loading stays summary-only and detail work is bound to user actions", async () => {
  const source = await readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8");
  const catalogLoader = source.slice(source.indexOf("const loadUserToolPresets"), source.indexOf("useEffect(() =>", source.indexOf("const loadUserToolPresets")));

  assert.match(catalogLoader, /toolPresetCatalogRef\.current\.listUsers\(\)/);
  assert.doesNotMatch(catalogLoader, /getToolPreset|listToolPresetVersions|Promise\.all/);
  assert.match(source, /onDragStart=\{\(event\) => \{[\s\S]*ensureToolPresetDetail\(preset\)/);
  assert.match(source, /onPointerDown=\{\(\) => \{ void loadToolPresetVersions\(preset\); \}\}/);
  assert.match(source, /expectedVersionNumber: detail\.currentVersionNumber/);
  assert.match(source, /getCanvasToolPresetCatalog/);
});

test("toolbox header keeps LibTV help hierarchy without removing real preset controls", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8"),
    readFile(new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /className="loomic-toolbox-title"[\s\S]*?<strong>我的工具箱<\/strong>[\s\S]*?aria-label="工具箱说明"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-controls="loomic-toolbox-help"/);
  assert.match(source, /id="loomic-toolbox-help" role="dialog" aria-label="工具箱说明"[\s\S]*?使用工具箱模板加速创作，快速构建你的专属工具箱。[\s\S]*?查看详细教程/);
  assert.doesNotMatch(source, /role="tooltip"|aria-describedby="loomic-toolbox-help"/);
  assert.match(source, /href=\{CREATOR_GUIDE_URL\}[\s\S]*?target="_blank"[\s\S]*?rel="noopener noreferrer"/);
  assert.match(source, /<\/header>\s*<div className="loomic-toolbox-controls">[\s\S]*?role="tablist" aria-label="工具分类"[\s\S]*?className="loomic-toolbox-save"/);
  assert.match(source, /\{category\.label\}<\/button>/);
  assert.doesNotMatch(source, /category\.id === "all" \? "我的工具箱"/);
  assert.doesNotMatch(source, /loomic-toolbox-state loomic-toolbox-intro/);
  assert.doesNotMatch(source, /周星驰经典名场面/);
  assert.match(styles, /\.loomic-toolbox-title\s*\{[\s\S]*?position:\s*relative;/);
  assert.match(styles, /\.loomic-toolbox-help\s*\{[\s\S]*?position:\s*static;/);
  assert.match(styles, /\.loomic-toolbox-help-tooltip\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none;/);
  assert.match(styles, /\.loomic-toolbox-help-tooltip\s*\{[\s\S]*?left:\s*0;[\s\S]*?width:\s*min\(300px, calc\(100vw - 48px\)\);/);
  assert.match(styles, /\.loomic-toolbox-help-tooltip::before\s*\{[\s\S]*?top:\s*-8px;[\s\S]*?height:\s*8px;/);
  assert.match(styles, /\.loomic-toolbox-help:hover \.loomic-toolbox-help-tooltip,[\s\S]*?\.loomic-toolbox-help:focus-within \.loomic-toolbox-help-tooltip[\s\S]*?opacity:\s*1;/);
});

test("shared catalog lists built-ins and live user summaries without fabricating topology", async () => {
  let listCalls = 0;
  const catalog = createCanvasToolPresetCatalog({
    async listToolPresets() {
      listCalls += 1;
      return { items: [
        { id: "user-summary", name: "用户摘要", category: "image", nodeCount: 2, edgeCount: 1 },
        { id: "archived", name: "已归档", status: "archived", category: "video" },
      ] };
    },
    async getToolPreset() { throw new Error("detail should be lazy"); },
    async listToolPresetVersions() { return { versions: [] }; },
  });
  const entries = await catalog.list();
  assert.equal(listCalls, 1);
  assert.equal(entries.some((entry) => entry.id === "archived"), false);
  assert.equal(entries.some((entry) => entry.id === "script-to-image"), true);
  const summary = entries.find((entry) => entry.id === "user-summary");
  assert.equal(summary.source, "user");
  assert.equal(summary.topology, null);
  assert.equal(summary.preview.kind, "workflow-summary");
  assert.equal(canvasToolPresetToResourceEntry(summary).source, "user");
  assert.equal(canvasToolPresetToResourceEntry(entries.find((entry) => entry.id === "script-to-image")).source, "builtin");
});

test("shared catalog deduplicates delayed detail requests and inserts complete topology once", async () => {
  let resolveDetail;
  let detailCalls = 0;
  const catalog = createCanvasToolPresetCatalog({
    async listToolPresets() { return { items: [] }; },
    getToolPreset(presetId) {
      detailCalls += 1;
      return new Promise((resolve) => { resolveDetail = () => resolve({ preset: {
        id: presetId,
        name: "远程工具",
        category: "image",
        currentVersionNumber: 2,
        currentVersion: {
          versionNumber: 2,
          topology: {
            schemaVersion: 1,
            nodes: [
              { kind: "workflow", type: "script-node", offsetX: 0, offsetY: 0, data: { text: "脚本" } },
              { kind: "image", offsetX: 420, offsetY: 0, data: { prompt: "图像" } },
            ],
            connections: [[0, 1]],
          },
        },
      } }); });
    },
    async listToolPresetVersions() { return { versions: [{ versionNumber: 2 }] }; },
  });
  const summary = { id: "remote", source: "user", topology: null, currentVersionNumber: 2 };
  const api = createCanvasApi();
  const first = catalog.insert(api, summary);
  const second = catalog.insert(api, summary);
  await Promise.resolve();
  assert.equal(detailCalls, 1);
  resolveDetail();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(firstResult.elementIds.length, 2);
  assert.equal(secondResult.elementIds.length, 2);
  assert.equal(firstResult.elementIds.some((id) => secondResult.elementIds.includes(id)), false);
  assert.equal(api.read().elements.filter((element) => element.customData?.workflowEdge === true).length, 2);
  assert.equal(api.read().updates.filter((update) => update.captureUpdate === "IMMEDIATELY").length, 2);
});

test("shared catalog selects an exact historical version and blocks stale or invalid insertion", async () => {
  let versionCalls = 0;
  const catalog = createCanvasToolPresetCatalog({
    async listToolPresets() { return { items: [] }; },
    async getToolPreset() { return { preset: { id: "versioned", name: "版本工具", category: "image", currentVersionNumber: 3, currentVersion: { versionNumber: 3, topology: { schemaVersion: 1, nodes: [{ kind: "image", offsetX: 0, offsetY: 0 }], connections: [] } } } }; },
    async listToolPresetVersions() { return { versions: [{ versionNumber: 1 }, { versionNumber: 3 }] }; },
    async getToolPresetVersion(presetId, versionNumber) {
      versionCalls += 1;
      assert.equal(presetId, "versioned");
      assert.equal(versionNumber, 1);
      return { version: { versionNumber: 1, topology: { schemaVersion: 1, nodes: [{ kind: "video", offsetX: 0, offsetY: 0 }], connections: [] } } };
    },
  });
  const summary = { id: "versioned", source: "user", topology: null, currentVersionNumber: 3 };
  const selected = await catalog.selectVersion(summary, 1);
  assert.equal(versionCalls, 1);
  assert.equal(selected.selectedVersionNumber, 1);
  assert.equal(selected.topology.nodes[0].kind, "video");
  const api = createCanvasApi();
  const blocked = await catalog.insert(api, selected, { shouldInsert: () => false });
  assert.equal(blocked.reason, "stale_scope");
  assert.equal(api.read().updates.length, 0);
  const invalid = createCanvasToolPresetCatalog({
    async getToolPreset() { return { preset: { id: "invalid", name: "无拓扑" } }; },
    async listToolPresets() { return { items: [] }; },
    async listToolPresetVersions() { return { versions: [] }; },
  });
  await assert.rejects(invalid.insert(createCanvasApi(), { id: "invalid", source: "user", topology: null }), /缺少可执行拓扑/);
});

test("using a preset repeatedly inserts fresh executable subgraphs as one undo step each", () => {
  const api = createCanvasApi();
  const first = useCanvasToolPreset(api, "script-to-image");
  const second = useCanvasToolPreset(api, "script-to-image");
  const state = api.read();

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.elementIds.some((id) => second.elementIds.includes(id)), false);
  const firstRightEdge = Math.max(...state.elements.filter((element) => first.elementIds.includes(element.id)).map((element) => element.x + element.width));
  const secondLeftEdge = Math.min(...state.elements.filter((element) => second.elementIds.includes(element.id)).map((element) => element.x));
  assert.equal(secondLeftEdge, firstRightEdge + 80);
  assert.equal(state.elements.filter((element) => element.customData?.workflowEdge === true).length, 2);
  assert.equal(state.updates.filter((update) => update.captureUpdate === "IMMEDIATELY").length, 2);
  assert.equal(state.updates.length, 2);
});

test("inserted tool presets round-trip through the existing canvas document contract", () => {
  const api = createCanvasApi();
  const result = useCanvasToolPreset(api, "script-storyboard");
  const content = { elements: api.read().elements, appState: {}, files: {} };
  const document = canvasContentToDocument(content, {
    canvasProjectId: "canvas-tool-preset",
    projectId: "project-tool-preset",
    now: () => "2026-07-21T00:00:00.000Z",
  });
  const restored = canvasDocumentToContent(document);

  assert.equal(result.ok, true);
  assert.deepEqual(
    restored.elements.map((element) => [element.id, element.customData?.type, element.customData?.workflowEdge === true]),
    content.elements.map((element) => [element.id, element.customData?.type, element.customData?.workflowEdge === true]),
  );
  assert.equal(document.edges.length, 2);
});

test("composition-to-video user presets reuse the canonical video output without storing ports", () => {
  const api = createCanvasApi();
  const preset = {
    id: "composition-to-video",
    title: "成片续写",
    topology: {
      schemaVersion: 1,
      nodes: [
        { kind: "workflow", type: "video-composition-node", offsetX: 0, offsetY: 0 },
        { kind: "video", offsetX: 480, offsetY: 0 },
      ],
      connections: [[0, 1]],
    },
  };
  const inserted = useCanvasToolPreset(api, preset);
  assert.equal(inserted.ok, true);
  const extracted = extractCanvasToolPresetTopology(
    api.read().elements,
    Object.fromEntries(inserted.elementIds.map((id) => [id, true])),
  );
  assert.equal(extracted.ok, true);
  assert.deepEqual(extracted.topology.connections, [[0, 1]]);
  assert.equal(JSON.stringify(extracted.topology).includes("ports"), false);
});

test("drag placement anchors the same real preset topology at the requested scene point", () => {
  const api = createCanvasApi();
  const result = useCanvasToolPreset(api, "script-to-image", { anchor: { x: 900, y: 620 } });
  const firstNode = api.read().elements.find((element) => element.id === result.elementIds[0]);

  assert.equal(result.ok, true);
  assert.equal(firstNode.x, 490);
  assert.equal(firstNode.y, 440);
  assert.equal(api.read().elements.filter((element) => element.customData?.workflowEdge === true).length, 1);
});

test("selected canonical nodes serialize to the backend topology contract without runtime references", () => {
  const api = createCanvasApi();
  const inserted = useCanvasToolPreset(api, "script-to-image");
  const imageNode = api.read().elements.find((element) => element.id === inserted.elementIds[1]);
  imageNode.customData = {
    ...imageNode.customData,
    prompt: "保留提示词",
    model: "image-model",
    taskId: "task-secret",
    resultUrl: "https://example.com/result.png",
    storageObjectId: "storage-secret",
    signedUrl: "https://example.com/signed",
    status: "completed",
    parameters: {
      guidance: 7,
      styleId: "style-secret",
      nested: { resultUrl: "https://example.com/nested", steps: 24 },
    },
  };

  const result = extractCanvasToolPresetTopology(
    api.read().elements,
    Object.fromEntries(inserted.elementIds.map((id) => [id, true])),
  );

  assert.equal(result.ok, true);
  assert.equal(result.topology.schemaVersion, 1);
  assert.deepEqual(result.topology.connections, [[0, 1]]);
  assert.equal(result.topology.nodes[0].offsetX, 0);
  assert.equal(result.topology.nodes[1].data.prompt, "保留提示词");
  assert.equal(result.topology.nodes[1].data.model, "image-model");
  assert.deepEqual(result.topology.nodes[1].data.parameters, { guidance: 7, nested: { steps: 24 } });
  assert.equal(JSON.stringify(result.topology).includes("task-secret"), false);
  assert.equal(JSON.stringify(result.topology).includes("storage-secret"), false);
  assert.equal(JSON.stringify(result.topology).includes("example.com"), false);
});

test("preset extraction rejects unsupported selections and workflow edges that leave the selection", () => {
  const api = createCanvasApi();
  const inserted = useCanvasToolPreset(api, "script-storyboard");
  const crossSelection = extractCanvasToolPresetTopology(api.read().elements, {
    [inserted.elementIds[0]]: true,
    [inserted.elementIds[1]]: true,
  });
  assert.equal(crossSelection.ok, false);
  assert.equal(crossSelection.reason, "cross_selection_edge");

  const unsupported = extractCanvasToolPresetTopology([
    { id: "shape", type: "rectangle", x: 0, y: 0, isDeleted: false },
  ], { shape: true });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.reason, "unsupported_node");
});

test("a remote preset version inserts its complete topology in one real scene transaction", () => {
  const api = createCanvasApi();
  const preset = normalizeCanvasUserToolPreset({
    id: "remote-preset",
    name: "远端工具",
    category: "image",
    currentVersionNumber: 3,
    currentVersion: {
      versionNumber: 3,
      topology: {
        schemaVersion: 1,
        nodes: [
          { kind: "workflow", type: "script-node", offsetX: 0, offsetY: 20, data: { text: "分镜脚本" } },
          { kind: "image", offsetX: 420, offsetY: 0, data: { prompt: "电影光线", model: "image-model", parameters: { steps: 20 } } },
        ],
        connections: [[0, 1]],
      },
    },
  });
  const result = useCanvasToolPreset(api, preset, { anchor: { x: 900, y: 620 } });
  const state = api.read();

  assert.equal(result.ok, true);
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].captureUpdate, "IMMEDIATELY");
  assert.equal(state.elements.filter((element) => element.customData?.workflowEdge).length, 1);
  assert.equal(state.elements.find((element) => element.id === result.elementIds[0]).customData.text, "分镜脚本");
  assert.equal(state.elements.find((element) => element.id === result.elementIds[1]).customData.prompt, "电影光线");
});
