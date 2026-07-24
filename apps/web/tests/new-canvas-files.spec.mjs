import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyCanvasNodeArtifactSelection,
  buildCloudAssetCustomData,
  collectCanvasFileEntries,
  collectCanvasPanelEntries,
  duplicateCanvasMediaElement,
  filterCanvasFileEntries,
  filterCanvasResourceEntries,
  getCanvasFileType,
  insertCloudAssetOnCanvas,
  listCanvasFailedHistoryRuns,
  listCanvasFolders,
  loadCanvasCloudAssets,
  loadCanvasGenerationHistory,
  loadCanvasNodeHistory,
  loadCanvasResourceLibrary,
  markCanvasHistoryArtifactSelected,
  mergeCanvasStylePrompt,
  nextCanvasFilesDialogRequest,
  normalizeCanvasFolderName,
  normalizeCanvasHistoryRun,
  normalizeCanvasNodeHistory,
  normalizeCloudAssetEntries,
  normalizeCanvasResourceEntries,
  normalizeCanvasStyleEntries,
  removeCanvasFolder,
  renameCanvasFolder,
  resolveCanvasAssetContentUrl,
  resolveCanvasAssetDownload,
  runCanvasAssetBatch,
  updateCanvasFileMetadata,
  updateCanvasFilesMetadata,
} from "../new-canvas/src/loomic-shell/canvas-file-utils.js";
import { archiveCanvasImageFile, archiveCanvasMediaFile, canvasElementRequiresSourceFile, importAudioToCanvas, importImageToCanvas, importMediaFilesToCanvas, importVideoToCanvas, rebindCanvasMediaFile } from "../new-canvas/src/loomic-shell/canvasApi.js";
import {
  createTextNodeElement,
  createExcalidrawVideoElement,
  insertVideoOnCanvas,
} from "../new-canvas/src/loomic-core/canvas-elements.js";
import { deleteCanvasLayers } from "../new-canvas/src/loomic-core/canvas-layer-operations.js";
import {
  canvasCloudAssetCapabilities,
  deleteCanvasCloudAsset,
  removeCanvasCloudAssetEntry,
  renameCanvasCloudAsset,
  renameCanvasCloudAssetEntry,
} from "../new-canvas/src/loomic-shell/cloud-asset-actions.js";
import {
  createCanvasAssetMutationScopeRef,
  isCanvasAssetMutationScopeCurrent,
  updateCanvasAssetMutationScope,
} from "../new-canvas/src/loomic-shell/canvas-asset-mutation-scope.js";
import {
  agentAssetsFromPayload,
  insertAgentAssetOnCanvas,
  prependAgentAsset,
  removeAgentAsset,
  replaceAgentAsset,
} from "../new-canvas/src/loomic-shell/canvas-agent-assets.js";
import {
  CANVAS_HISTORY_SCALE_DEFAULT,
  CANVAS_HISTORY_SCALE_MAX,
  CANVAS_HISTORY_SCALE_MIN,
  canvasHistoryScaleStyle,
  normalizeCanvasHistoryScale,
  stepCanvasHistoryScale,
} from "../new-canvas/src/loomic-shell/canvas-history-scale.js";
import {
  canvasDedicatedAssetSourceOptions,
  canvasAssetTypeOptions,
  canvasHistoryTypeOptions,
  resolveCanvasFilesPresentation,
  resolveCanvasFileRowMenuKeyAction,
} from "../new-canvas/src/loomic-shell/canvas-files-presentation.js";

const panel = await readFile(new URL("../new-canvas/src/loomic-shell/CanvasFilesPanel.jsx", import.meta.url), "utf8");
const fileRowSource = panel.slice(panel.indexOf("const FileRow = memo("), panel.indexOf("function ResourceIcon"));
const canvasFilesPanelSource = panel.slice(panel.indexOf("export function CanvasFilesPanel"));
const shell = await readFile(new URL("../new-canvas/src/loomic-shell/LoomicCanvasShell.jsx", import.meta.url), "utf8");
const main = await readFile(new URL("../new-canvas/src/main.jsx", import.meta.url), "utf8");
const editor = await readFile(new URL("../new-canvas/src/loomic-core/CanvasEditor.jsx", import.meta.url), "utf8");
const toolMenu = await readFile(new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url), "utf8");
const canvasApiSource = await readFile(new URL("../new-canvas/src/loomic-shell/canvasApi.js", import.meta.url), "utf8");
const creatorApiSource = await readFile(new URL("../src/shared/creator-api.js", import.meta.url), "utf8");
const historyScaleSource = await readFile(new URL("../new-canvas/src/loomic-shell/canvas-history-scale.js", import.meta.url), "utf8");
const shellStyles = await readFile(new URL("../new-canvas/src/loomic-shell/loomic-shell.css", import.meta.url), "utf8");
const assetCreateMenuModule = await import("../new-canvas/src/loomic-shell/canvas-asset-create-menu.js").catch(() => ({}));
const canvasFilesPresentationModule = await import("../new-canvas/src/loomic-shell/canvas-files-presentation.js");

test("canvas element display order reverses without mutating scene-order entries", () => {
  const { orderCanvasPanelEntries } = canvasFilesPresentationModule;
  assert.equal(typeof orderCanvasPanelEntries, "function");
  const entries = [{ id: "front" }, { id: "middle" }, { id: "back" }];

  assert.equal(orderCanvasPanelEntries(entries, "front-to-back"), entries);
  const reversed = orderCanvasPanelEntries(entries, "back-to-front");

  assert.deepEqual(reversed.map(({ id }) => id), ["back", "middle", "front"]);
  assert.deepEqual(entries.map(({ id }) => id), ["front", "middle", "back"]);
  assert.equal(reversed[0], entries[2]);
  assert.equal(reversed[2], entries[0]);
});

test("canvas workspace exposes a display-only element order toggle", () => {
  assert.match(panel, /const \[canvasOrder, setCanvasOrder\] = useState\("front-to-back"\)/);
  assert.match(panel, /orderCanvasPanelEntries\(visibleCanvasPanelEntries, canvasOrder\)/);
  assert.match(panel, /aria-label="背景在前显示"/);
  assert.doesNotMatch(panel, /aria-label=\{canvasOrder === "front-to-back"/);
  assert.match(panel, /aria-pressed=\{canvasOrder === "back-to-front"\}/);
  assert.match(panel, /setCanvasOrder\(\(value\) => value === "front-to-back" \? "back-to-front" : "front-to-back"\)/);
});

const elements = [
  { id: "text", type: "text", text: "忽略" },
  { id: "upload", type: "image", fileId: "file-1", customData: { title: "角色立绘", source: "uploaded" } },
  { id: "generated", type: "image", fileId: "file-2", customData: { title: "雨夜街道", source: "generated" } },
  { id: "image-node", type: "rectangle", customData: { type: "image-generator", prompt: "霓虹城市" } },
  { id: "video-node", type: "rectangle", customData: { type: "video-generator", prompt: "镜头推进" } },
  { id: "video", type: "embeddable", link: "https://cdn.example/shot.mp4", customData: { isVideo: true, title: "推进镜头" } },
];
const files = {
  "file-1": { dataURL: "data:image/png;base64,upload", mimeType: "image/png" },
  "file-2": { dataURL: "data:image/png;base64,generated", mimeType: "image/png" },
};

test("file inventory recognizes canvas media and generator nodes", () => {
  assert.equal(getCanvasFileType(elements[0]), null);
  assert.equal(getCanvasFileType(elements[1]), "image");
  assert.equal(getCanvasFileType(elements[3]), "image-generator");
  assert.equal(getCanvasFileType(elements[4]), "video-generator");
  assert.equal(getCanvasFileType(elements[5]), "video");
  assert.equal(getCanvasFileType({ customData: { type: "audio-node", sourceKind: "tts" } }), "audio-generator");
  assert.equal(getCanvasFileType({ customData: { type: "audio-node", sourceKind: "generated" } }), "audio");
  const entries = collectCanvasFileEntries(elements, files);
  assert.deepEqual(entries.map(({ id }) => id), ["video", "video-node", "image-node", "generated", "upload"]);
  assert.deepEqual(entries.filter(({ reusable }) => reusable).map(({ id }) => id), ["video", "generated", "upload"]);
  const categorizedResource = collectCanvasFileEntries([
    { id: "character-image", type: "image", customData: { source: "team-library", storageUrl: "/character.png", resourceCategory: "character" } },
  ])[0];
  assert.equal(categorizedResource.assetCategory, "character");
});

test("file inventory combines text search and semantic type filters", () => {
  const entries = collectCanvasFileEntries(elements, files);
  assert.deepEqual(filterCanvasFileEntries(entries, { query: "霓虹" }).map(({ id }) => id), ["image-node"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { query: "生成", type: "image" }).map(({ id }) => id), ["generated"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { type: "generator" }).map(({ id }) => id), ["video-node", "image-node"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { type: "image", query: "角色" }).map(({ id }) => id), ["upload"]);
  assert.deepEqual(filterCanvasFileEntries([
    ...entries,
    { id: "official", category: "image", source: "official-library", cloud: true, title: "官方角色", kindLabel: "图片" },
  ], { source: "official-library" }).map(({ id }) => id), ["official"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { source: "canvas-local" }).map(({ id }) => id), ["video", "video-node", "image-node", "generated", "upload"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { assetCategory: "other" }).map(({ id }) => id), ["video", "video-node", "image-node", "generated", "upload"]);
});

test("file removal deletes the local canvas entry and its workflow connections", () => {
  const connected = [
    { id: "source", type: "text", boundElements: [{ id: "edge", type: "arrow" }] },
    { id: "generator", type: "rectangle", customData: { type: "image-generator" }, boundElements: [{ id: "edge", type: "arrow" }] },
    { id: "edge", type: "arrow", startBinding: { elementId: "source" }, endBinding: { elementId: "generator" }, customData: { workflowEdge: true } },
    { id: "unrelated", type: "image", fileId: "file-unrelated" },
  ];
  const removed = deleteCanvasLayers(connected, ["generator"]);

  assert.equal(removed.find((element) => element.id === "generator").isDeleted, true);
  assert.equal(removed.find((element) => element.id === "edge").isDeleted, true);
  assert.deepEqual(removed.find((element) => element.id === "source").boundElements, []);
  assert.equal(removed.find((element) => element.id === "unrelated").isDeleted, undefined);
  assert.match(panel, /elements: deleteCanvasLayers\(current, \[entry\.id\]\)/);
  assert.match(panel, /showCanvasActions[\s\S]*?role="menuitem" className="is-danger"[^>]*onClick=\{\(\) => runAction\(\(\) => onRemove\(entry\)\)\}[^>]*>从画布删除<\/button>/);
  assert.match(panel, /删除云资产/);
  assert.match(panel, /deleteCanvasCloudAsset/);
});

test("cloud asset actions expose only supported source operations", () => {
  const client = {
    updateTeamAsset() {},
    deleteTeamAsset() {},
  };
  const owner = { id: "owner-1", actorType: "user" };
  const member = { id: "owner-1", actorType: "team_member", teamMember: { id: "member-1" } };
  assert.deepEqual(canvasCloudAssetCapabilities({ source: "personal-library" }, client, owner), { canRename: false, canDelete: false });
  assert.deepEqual(canvasCloudAssetCapabilities({ source: "official-library" }, client, owner), { canRename: false, canDelete: false });
  assert.deepEqual(canvasCloudAssetCapabilities({ source: "team-library" }, client, owner), { canRename: true, canDelete: true });
  assert.deepEqual(canvasCloudAssetCapabilities({ source: "team-library" }, client, member), { canRename: true, canDelete: false });
});

test("cloud asset actions dispatch real APIs and list updates do not touch canvas references", async () => {
  const calls = [];
  const client = {
    async updateTeamAsset(id, input) { calls.push(["team-update", id, input]); },
    async deleteTeamAsset(id) { calls.push(["team-delete", id]); },
  };
  const team = { id: "cloud:team-library:team-1", source: "team-library", sourceId: "team-1", title: "旧名", cloud: true };
  await renameCanvasCloudAsset(client, team, " 新名 ");
  await deleteCanvasCloudAsset(client, team);
  assert.deepEqual(calls, [
    ["team-update", "team-1", { name: "新名" }],
    ["team-delete", "team-1"],
  ]);
  const untouched = { id: "cloud:official-library:official-1", source: "official-library", sourceId: "official-1", title: "官方素材", cloud: true };
  const renamed = renameCanvasCloudAssetEntry([team, untouched], team.id, "新名");
  assert.equal(renamed[0].title, "新名");
  const remaining = removeCanvasCloudAssetEntry(renamed, untouched.id);
  assert.deepEqual(remaining.map((entry) => entry.id), [team.id]);
  assert.equal(team.title, "旧名");
});

test("failed cloud asset mutations reject without changing the original list", async () => {
  const original = [{ id: "cloud:team-library:team-1", source: "team-library", sourceId: "team-1", title: "保留原名", cloud: true }];
  await assert.rejects(
    renameCanvasCloudAsset({ async updateTeamAsset() { throw Object.assign(new Error("forbidden"), { status: 403 }); } }, original[0], "不会保存"),
    /forbidden/,
  );
  await assert.rejects(
    deleteCanvasCloudAsset({ async deleteTeamAsset() { throw new Error("offline"); } }, original[0]),
    /offline/,
  );
  assert.deepEqual(original, [{ id: "cloud:team-library:team-1", source: "team-library", sourceId: "team-1", title: "保留原名", cloud: true }]);
  assert.match(panel, /原列表未改变/);
});

test("late cloud asset rename/delete responses cannot update a new mutation scope", async () => {
  const scopeRef = createCanvasAssetMutationScopeRef();
  const apiA = {};
  const apiB = {};
  const entry = { id: "cloud:team-library:asset-1", source: "team-library", sourceId: "asset-1", title: "旧名", cloud: true };
  let entries = [entry];
  let actionError = "";
  let busy = "rename";
  updateCanvasAssetMutationScope(scopeRef, { api: apiA, canvasProjectId: "canvas-a", open: true });
  const renameToken = scopeRef.current.token;
  let releaseRename;
  const renamePending = new Promise((resolve) => { releaseRename = resolve; });
  const renameResponse = (async () => {
    try {
      const title = await renameCanvasCloudAsset({ updateTeamAsset: () => renamePending }, entry, "不应写入");
      if (!isCanvasAssetMutationScopeCurrent(scopeRef, renameToken)) return;
      entries = renameCanvasCloudAssetEntry(entries, entry.id, title);
    } catch (error) {
      if (isCanvasAssetMutationScopeCurrent(scopeRef, renameToken)) actionError = error.message;
    } finally {
      if (isCanvasAssetMutationScopeCurrent(scopeRef, renameToken)) busy = "";
    }
  })();
  updateCanvasAssetMutationScope(scopeRef, { api: apiB, canvasProjectId: "canvas-b", open: true });
  busy = "delete";
  releaseRename();
  await renameResponse;
  assert.equal(entries[0].title, "旧名");
  assert.equal(actionError, "");
  assert.equal(busy, "delete");

  const deleteToken = scopeRef.current.token;
  let releaseDelete;
  const deletePending = new Promise((_, reject) => { releaseDelete = reject; });
  const deleteResponse = (async () => {
    try {
      await deleteCanvasCloudAsset({ deleteTeamAsset: () => deletePending }, entry);
      if (!isCanvasAssetMutationScopeCurrent(scopeRef, deleteToken)) return;
      entries = removeCanvasCloudAssetEntry(entries, entry.id);
    } catch (error) {
      if (isCanvasAssetMutationScopeCurrent(scopeRef, deleteToken)) actionError = error.message;
    } finally {
      if (isCanvasAssetMutationScopeCurrent(scopeRef, deleteToken)) busy = "";
    }
  })();
  updateCanvasAssetMutationScope(scopeRef, { api: apiB, canvasProjectId: "canvas-b", open: false });
  busy = "new-operation";
  releaseDelete(new Error("旧删除失败"));
  await deleteResponse;
  assert.equal(entries[0].title, "旧名");
  assert.equal(actionError, "");
  assert.equal(busy, "new-operation");
  assert.match(panel, /updateCanvasAssetMutationScope/);
  assert.match(panel, /if \(isCurrent\(\)\) setCloudAssetBusy\(""\)/);
});

test("Agent assets load through authenticated CRUD APIs and render as real director nodes", () => {
  assert.match(creatorApiSource, /getAgentAssets\(input = \{\}\)/);
  assert.match(creatorApiSource, /createAgentAsset\(input = \{\}\)/);
  assert.match(creatorApiSource, /updateAgentAsset\(assetId, input = \{\}\)/);
  assert.match(creatorApiSource, /deleteAgentAsset\(assetId\)/);
  assert.match(panel, /aria-selected=\{activeTab === "agents"\}/);
  assert.match(panel, /setAgentAssets\(agentAssetsFromPayload\(payload\)\)/);
  assert.match(panel, /visibleAgentAssets\.map\(\(asset\) =>/);
  assert.match(panel, /<AgentAssetRow key=\{asset\.id\}/);
  assert.match(panel, /prependAgentAsset\(current, payload\.asset\)/);
  assert.match(panel, /replaceAgentAsset\(current, asset\.id, payload\.asset\)/);
  assert.match(panel, /removeAgentAsset\(current, asset\.id\)/);
  assert.match(panel, /insertAgentAssetOnCanvas\(api, asset\)/);
  assert.match(panel, /Agent 资产加载失败，请重试/);
  assert.match(panel, /Agent 新建失败，未保存任何更改/);
  assert.match(panel, /Agent 编辑失败，原配置未改变/);
  assert.match(panel, /Agent 删除失败，原列表未改变/);

  const first = { id: "agent-1", name: "导演一", description: "连续性", instructions: "不要跳轴" };
  const second = { id: "agent-2", name: "导演二", description: "节奏", instructions: "快速剪辑" };
  assert.deepEqual(agentAssetsFromPayload({ items: [first] }), [first]);
  assert.deepEqual(agentAssetsFromPayload({ data: [first] }), []);
  assert.deepEqual(prependAgentAsset([first], second), [second, first]);
  assert.deepEqual(prependAgentAsset([first, second], { ...first, name: "导演一 V2" }).map((asset) => asset.name), ["导演一 V2", "导演二"]);
  assert.deepEqual(replaceAgentAsset([first, second], first.id, { ...first, name: "导演一 V2" }).map((asset) => asset.name), ["导演一 V2", "导演二"]);
  assert.deepEqual(removeAgentAsset([first, second], first.id), [second]);

  let scene = [];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
  };
  const elementId = insertAgentAssetOnCanvas(api, first);
  const element = scene.find((entry) => entry.id === elementId);
  assert.equal(element.customData.type, "director-node");
  assert.equal(element.customData.title, first.name);
  assert.equal(element.customData.instructions, first.instructions);
  assert.equal(element.customData.agentAssetId, first.id);
  assert.equal(element.customData.agentAssetName, first.name);
  assert.equal(element.customData.agentAssetDescription, first.description);
});

test("central canvas tools mirror the LibTV material menu and open real library dialogs", () => {
  for (const [label, view] of [["角色库", "library-character"], ["历史记录", "history"]]) {
    assert.match(toolMenu, new RegExp(`aria-label="${label}"`));
    assert.match(toolMenu, new RegExp(`openFilesView\\("${view}"\\)`));
  }
  assert.match(toolMenu, /aria-label="素材库"/);
  assert.match(toolMenu, /aria-haspopup="menu"/);
  assert.match(toolMenu, /role="menu" aria-label="素材库"/);
  assert.match(toolMenu, />风格库</);
  assert.match(toolMenu, /新增风格节点/);
  assert.match(toolMenu, /openFilesView\("library-style"\)/);
  assert.match(toolMenu, />特效库</);
  assert.match(toolMenu, /新增特效节点/);
  assert.match(toolMenu, /role="menuitem" disabled title="当前暂无可执行特效模板"/);
  assert.doesNotMatch(toolMenu, /openFilesView\("library-effect"\)/);
  assert.doesNotMatch(toolMenu, /aria-label="素材库"[^\n]*openFilesView\("assets"\)/);
  assert.match(editor, /onOpenFilesView=\{onOpenFilesView\}/);
  assert.match(main, /onOpenFilesView=\{openFilesView\}/);
  const styles = nextCanvasFilesDialogRequest(null, "library-style");
  const reopenedStyles = nextCanvasFilesDialogRequest(styles, "library-style");
  assert.deepEqual(styles, { view: "library-style", requestId: 1 });
  assert.deepEqual(reopenedStyles, { view: "library-style", requestId: 2 });
  assert.equal(nextCanvasFilesDialogRequest(reopenedStyles, "library-effect"), reopenedStyles);
  assert.equal(nextCanvasFilesDialogRequest(reopenedStyles, "unknown"), reopenedStyles);
  assert.match(main, /setFilesDialogRequest\(\(current\) => nextCanvasFilesDialogRequest\(current, view\)\)/);
  assert.match(main, /filesDialogRequest=\{filesDialogRequest\}/);
  assert.match(main, /onFilesDialogClose=\{closeFilesDialog\}/);
  assert.match(shell, /open=\{isFilesOpen \|\| filesDialogOpen\}/);
  assert.match(shell, /presentation=\{filesDialogOpen \? "dialog" : "panel"\}/);
  assert.match(shell, /viewRequest=\{filesDialogRequest\}/);
  assert.equal((shell.match(/<CanvasFilesPanel/g) ?? []).length, 1);
  assert.match(panel, /role=\{dialog \? "dialog" : undefined\}/);
  assert.match(panel, /aria-modal=\{dialog \? "true" : undefined\}/);
  assert.match(panel, /if \(event\.target === event\.currentTarget\) onClose\?\.\(\)/);
  assert.match(panel, /view === "assets"/);
  assert.match(panel, /view === "library-character"/);
  assert.match(panel, /setResourceKind\("character"\)/);
  assert.match(panel, /view === "library-style"/);
  assert.match(panel, /setResourceKind\("style"\)/);
  assert.match(panel, /view === "history"/);
});

test("dedicated files dialogs wrap focus and restore it to the opening tool", () => {
  const resolveTabAction = canvasFilesPresentationModule.resolveCanvasFilesDialogTabAction;
  const resolveFallbackSelector = canvasFilesPresentationModule.resolveCanvasFilesDialogFallbackSelector;
  assert.equal(typeof resolveTabAction, "function");
  assert.equal(typeof resolveFallbackSelector, "function");

  assert.deepEqual(resolveTabAction({ key: "Tab", currentIndex: 2, itemCount: 3 }), { handled: true, nextIndex: 0 });
  assert.deepEqual(resolveTabAction({ key: "Tab", shiftKey: true, currentIndex: 0, itemCount: 3 }), { handled: true, nextIndex: 2 });
  assert.deepEqual(resolveTabAction({ key: "Tab", currentIndex: -1, itemCount: 3 }), { handled: true, nextIndex: 0 });
  assert.deepEqual(resolveTabAction({ key: "Tab", shiftKey: true, currentIndex: -1, itemCount: 3 }), { handled: true, nextIndex: 2 });
  assert.deepEqual(resolveTabAction({ key: "Tab", currentIndex: 1, itemCount: 3 }), { handled: false });
  assert.deepEqual(resolveTabAction({ key: "Tab", currentIndex: 0, itemCount: 1 }), { handled: true, nextIndex: 0 });
  assert.deepEqual(resolveTabAction({ key: "Tab", currentIndex: -1, itemCount: 0 }), { handled: true, focus: "dialog" });
  assert.deepEqual(resolveTabAction({ key: "Escape", currentIndex: 0, itemCount: 3 }), { handled: false });

  assert.equal(resolveFallbackSelector("assets"), ".loomic-asset-manager-button");
  assert.equal(resolveFallbackSelector("library-style"), '.loomic-tool-button[aria-label="素材库"]');
  assert.equal(resolveFallbackSelector("library-character"), '.loomic-tool-button[aria-label="角色库"]');
  assert.equal(resolveFallbackSelector("history"), '.loomic-tool-button[aria-label="历史记录"]');
  assert.equal(resolveFallbackSelector("unknown"), "");

  assert.match(canvasFilesPanelSource, /if \(!open \|\| !dialog\) return undefined;[\s\S]*?installCanvasFilesDialogTabTrap\(document, panelRef\.current\)/);
  assert.match(canvasFilesPanelSource, /const handlePanelKeyDown = \(event\) => event\.stopPropagation\(\)/);
  assert.match(canvasFilesPanelSource, /onKeyDown=\{handlePanelKeyDown\}/);

  assert.match(main, /const filesDialogReturnFocusRef = useRef\(null\)/);
  assert.match(main, /filesDialogReturnFocusRef\.current = \{[\s\S]*?opener: document\.activeElement[\s\S]*?view/);
  assert.match(main, /const closeFilesDialog = useCallback\(\(\) => \{/);
  assert.match(main, /resolveCanvasFilesDialogFallbackSelector\(returnFocus\?\.view\)/);
  assert.match(main, /returnFocus\?\.opener\?\.isConnected[\s\S]*?document\.querySelector\(fallbackSelector\)/);
  assert.match(main, /requestAnimationFrame\(\(\) => \{[\s\S]*?target\?\.focus\?\.\(\{ preventScroll: true \}\)/);
});

test("dedicated files dialogs recapture Tab after the focused control is removed", () => {
  const installTabTrap = canvasFilesPresentationModule.installCanvasFilesDialogTabTrap;
  assert.equal(typeof installTabTrap, "function");

  const focused = [];
  const createFocusable = (name) => ({
    hidden: false,
    closest: () => null,
    getClientRects: () => [{}],
    focus: (options) => focused.push([name, options]),
  });
  const first = createFocusable("first");
  const last = createFocusable("last");
  const listeners = new Map();
  const ownerDocument = {
    activeElement: { id: "removed-control-fallback" },
    defaultView: {
      getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    },
    addEventListener: (type, listener, capture) => listeners.set(type, { listener, capture }),
    removeEventListener: (type, listener, capture) => {
      const registered = listeners.get(type);
      if (registered?.listener === listener && registered.capture === capture) listeners.delete(type);
    },
  };
  const panelElement = {
    ownerDocument,
    querySelectorAll: () => [first, last],
    focus: (options) => focused.push(["dialog", options]),
  };

  const cleanup = installTabTrap(ownerDocument, panelElement);
  assert.equal(listeners.get("keydown")?.capture, true);

  let prevented = false;
  let stopped = false;
  let stoppedImmediately = false;
  listeners.get("keydown").listener({
    key: "Tab",
    shiftKey: false,
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; },
    stopImmediatePropagation: () => { stoppedImmediately = true; },
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(stoppedImmediately, true);
  assert.deepEqual(focused, [["first", { preventScroll: true }]]);

  cleanup();
  assert.equal(listeners.has("keydown"), false);
  assert.match(canvasFilesPanelSource, /installCanvasFilesDialogTabTrap\(document, panelRef\.current\)/);
});

test("dedicated files dialogs leave Tab handling to their owned row-menu portal", () => {
  const installTabTrap = canvasFilesPresentationModule.installCanvasFilesDialogTabTrap;
  const listeners = new Map();
  const ownerDocument = {
    activeElement: { closest: (selector) => selector.includes("data-canvas-files-dialog-portal") ? {} : null },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: () => undefined,
  };
  const panelElement = { querySelectorAll: () => { throw new Error("dialog trap must not query while portal owns focus"); } };
  installTabTrap(ownerDocument, panelElement);
  let prevented = false;
  listeners.get("keydown")({ key: "Tab", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.match(panel, /data-canvas-files-dialog-portal="true"/);
});

test("canvas panel inventory includes every live non-edge canvas node", () => {
  let factoryElements = [];
  createTextNodeElement({
    getSceneElements: () => factoryElements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene: ({ elements }) => { factoryElements = elements; },
  }, { text: "旁白", anchor: { x: 100, y: 100 } });
  const textId = factoryElements[0].id;
  const entries = collectCanvasPanelEntries([
    { id: "image", type: "image", fileId: "file-1", customData: { title: "角色立绘" } },
    factoryElements[0],
    { id: "director", type: "rectangle", customData: { type: "director-node", title: "导演台 1" } },
    { id: "composition", type: "rectangle", customData: { type: "video-composition-node", title: "视频合成 1" } },
    { id: "script", type: "rectangle", customData: { type: "script-node", title: "脚本 1" } },
    { id: "shape", type: "ellipse" },
    { id: "edge", type: "arrow" },
    { id: "deleted", type: "text", text: "已删除", isDeleted: true },
  ], files);

  assert.deepEqual(new Set(entries.map((entry) => entry.id)), new Set(["image", textId, "director", "composition", "script", "shape"]));
  assert.equal(entries.find((entry) => entry.id === textId)?.kindLabel, "文本");
  assert.equal(entries.find((entry) => entry.id === textId)?.panelType, "text-node");
  assert.equal(entries.find((entry) => entry.id === "director")?.kindLabel, "导演台");
  assert.equal(entries.find((entry) => entry.id === "composition")?.kindLabel, "视频合成");
  assert.equal(entries.find((entry) => entry.id === "script")?.kindLabel, "脚本");
  assert.equal(entries.find((entry) => entry.id === "shape")?.kindLabel, "椭圆");
  assert.equal(entries.find((entry) => entry.id === "director")?.panelOnly, true);
  assert.equal(entries.find((entry) => entry.id === "image")?.panelOnly, false);
  assert.deepEqual(filterCanvasFileEntries(entries, { query: "上传" }).map((entry) => entry.id), ["image"]);
});

test("central style library uses the existing real style data and apply chain", () => {
  assert.deepEqual(resolveCanvasFilesPresentation("dialog", { view: "library-style" }), {
    dedicatedAssetsDialog: false,
    dedicatedCharacterDialog: false,
    dedicatedHistoryDialog: false,
    dedicatedStyleDialog: true,
    requestedView: "library-style",
  });
  assert.equal(resolveCanvasFilesPresentation("panel", { view: "library-style" }).dedicatedStyleDialog, false);
  assert.match(panel, /requestedDedicatedStyleDialog && activeTab === "library" && resourceKind === "style"/);
  assert.match(panel, /dedicatedStyleDialog \? "风格库"/);
  assert.match(panel, /loadCanvasResourceLibrary\(assetClient/);
  assert.match(panel, /mergeCanvasStylePrompt\(/);
  assert.match(panel, /resourceKind === "style"\s*\? styleEntries/);
});

test("central history uses the dedicated LibTV asset-history presentation", () => {
  assert.deepEqual(resolveCanvasFilesPresentation("dialog", { view: "history" }), {
    dedicatedAssetsDialog: false,
    dedicatedCharacterDialog: false,
    dedicatedHistoryDialog: true,
    dedicatedStyleDialog: false,
    requestedView: "history",
  });
  assert.equal(resolveCanvasFilesPresentation("panel", { view: "history" }).dedicatedHistoryDialog, false);
  assert.equal(resolveCanvasFilesPresentation("dialog", { view: "assets" }).dedicatedHistoryDialog, false);
  assert.deepEqual(
    canvasHistoryTypeOptions({ image: 2, video: 1, audio: 0 }, true),
    [
      { value: "image", label: "图片历史", count: 2 },
      { value: "video", label: "视频历史", count: 1 },
      { value: "audio", label: "音频历史", count: 0 },
    ],
  );
  assert.deepEqual(canvasHistoryTypeOptions({ image: 2, video: 1, audio: 0 }, false)[0], {
    value: "all",
    label: "全部",
    count: 3,
  });

  assert.match(panel, /dedicatedHistoryDialog \? "历史资产"/);
  assert.match(panel, /dedicatedHistoryDialog \|\| dedicatedCharacterDialog \|\| dedicatedAssetsDialog \|\| dedicatedStyleDialog \? null : \(/);
  assert.match(panel, /!dedicatedHistoryDialog \? \(\s*<div className="lm-history-node-picker">/s);
  assert.match(panel, /canvasHistoryTypeOptions\(historyTypeCounts, dedicatedHistoryDialog\)/);
  assert.match(panel, /className=\{`lm-node-history \$\{dedicatedHistoryDialog \? "is-dedicated" : ""\}`\.trim\(\)\}/);
  assert.match(panel, /const \[historyDialogType, setHistoryDialogType\] = useState\("image"\)/);
  assert.match(panel, /const displayedHistoryType = dedicatedHistoryDialog \? historyDialogType : historyType/);
  assert.match(panel, /setHistoryDialogType\("image"\)/);
  assert.match(panel, /useLayoutEffect\(\(\) => \{/);
  assert.match(panel, /panelStateSnapshotRef/);
  assert.match(panel, /setHistoryScale\(CANVAS_HISTORY_SCALE_DEFAULT\)/);
  assert.match(panel, /setHistoryOrder\("desc"\)/);
  assert.match(panel, /setHistoryBatchMode\(false\)/);
  assert.match(panel, /artifact\.type === "image" \? artifact\.mediaUrl : artifact\.thumbnailUrl/);
  assert.match(shellStyles, /\.lm-panel-header > \.lm-panel-header-actions/);
});

test("central character library uses a dedicated real-resource presentation", () => {
  assert.deepEqual(resolveCanvasFilesPresentation("dialog", { view: "library-character" }), {
    dedicatedAssetsDialog: false,
    dedicatedCharacterDialog: true,
    dedicatedHistoryDialog: false,
    dedicatedStyleDialog: false,
    requestedView: "library-character",
  });
  assert.equal(resolveCanvasFilesPresentation("panel", { view: "library-character" }).dedicatedCharacterDialog, false);
  assert.equal(resolveCanvasFilesPresentation("dialog", { view: "assets" }).dedicatedCharacterDialog, false);
  assert.match(panel, /requestedDedicatedCharacterDialog && activeTab === "library" && resourceKind === "character"/);
  assert.match(panel, /view === "library-character"[\s\S]*?setResourceCategory\("character"\)/);
  assert.match(panel, /category: dedicatedCharacterDialog \? "character" : resourceKind === "character" \? resourceCategory : resourceKind/);
  assert.match(panel, /const displayedPreviewEntry = dedicatedCharacterDialog[\s\S]*?visibleResourceEntries\[0\]/);
  assert.match(panel, /dedicatedCharacterDialog \? "is-character-dialog" : ""/);
  assert.match(panel, /dedicatedHistoryDialog \|\| dedicatedCharacterDialog \|\| dedicatedAssetsDialog \|\| dedicatedStyleDialog \? null : \(/);
  assert.match(panel, /activeTab === "library" \? dedicatedCharacterDialog \? null : \(/);
  assert.match(panel, /aria-label=\{`选择角色 \$\{entry\.title\}`\}/);
  assert.match(panel, /onClick=\{\(\) => setPreviewEntry\(entry\)\}/);
  assert.match(panel, /onClick=\{\(\) => runResourceAction\(displayedPreviewEntry\)\}/);
  assert.match(panel, /dedicatedCharacterDialog \? "应用至画布"/);
  assert.match(panel, /dedicatedCharacterDialog \? "暂无可用角色"/);
  assert.match(shellStyles, /\.lm-files-panel\.is-character-dialog \.lm-files-list/);
  assert.match(shellStyles, /\.lm-character-strip/);
  assert.match(shellStyles, /\.lm-character-card\.is-selected/);
  assert.doesNotMatch(panel, /CHARACTER_PRESETS|characterPresetCatalog/);
});

test("central material library uses the dedicated LibTV asset-management structure", () => {
  assert.deepEqual(resolveCanvasFilesPresentation("dialog", { view: "assets" }), {
    dedicatedAssetsDialog: true,
    dedicatedCharacterDialog: false,
    dedicatedHistoryDialog: false,
    dedicatedStyleDialog: false,
    requestedView: "assets",
  });
  assert.equal(resolveCanvasFilesPresentation("panel", { view: "assets" }).dedicatedAssetsDialog, false);
  assert.deepEqual(canvasAssetTypeOptions(), [
    { value: "all", label: "全部" },
    { value: "other", label: "其它" },
    { value: "character", label: "人物" },
    { value: "scene", label: "场景" },
    { value: "prop", label: "物品" },
    { value: "style", label: "风格" },
    { value: "audio", label: "音效" },
  ]);
  assert.deepEqual(canvasDedicatedAssetSourceOptions(), [
    { value: "personal-library", label: "个人资产库" },
  ]);

  assert.match(panel, /requestedDedicatedAssetsDialog && activeTab === "assets"/);
  assert.match(panel, /view === "assets"[\s\S]*?setSourceFilter\("personal-library"\)/);
  assert.match(panel, /setSourceFilter\("personal-library"\);\s*setQuery\(""\);/);
  assert.match(panel, /dedicatedAssetsDialog \? "资产管理"/);
  assert.match(panel, /dedicatedHistoryDialog \|\| dedicatedCharacterDialog \|\| dedicatedAssetsDialog \|\| dedicatedStyleDialog \? null : \(/);
  assert.match(panel, /className="lm-assets-dialog-sidebar"[\s\S]*?aria-label="资产来源"/);
  assert.match(panel, /canvasDedicatedAssetSourceOptions\(\)\.map/);
  assert.match(panel, /canvasDedicatedAssetSourceOptions\(\)\.find/);
  assert.doesNotMatch(panel, /lm-assets-dialog-sidebar[\s\S]*?canvasAssetSourceOptions\(\)\.map/);
  assert.match(panel, /aria-label="搜索资产"/);
  assert.match(panel, /aria-label="资产类型"/);
  assert.match(panel, /canvasAssetTypeOptions\(\)\.map/);
  assert.match(panel, /assetCategory: dedicatedAssetsDialog \? typeFilter : "all"/);
  assert.match(panel, />批量操作</);
  assert.match(panel, /新建<\/button>/);
  assert.match(panel, /当前暂无资产/);
  assert.match(panel, /上传资产<\/button>/);
  assert.match(panel, /dedicatedAssetsDialog \? "is-assets-dialog" : ""/);
  assert.match(shellStyles, /\.lm-files-panel\.is-assets-dialog/);
  assert.match(shellStyles, /@media \(min-width: 769px\)[\s\S]*?\.lm-files-panel\.is-dialog\.is-assets-dialog\s*\{[^}]*width:\s*min\(calc\(90vw \/ var\(--app-ui-scale, 1\)\),\s*calc\(100vw \/ var\(--app-ui-scale, 1\) - 80px\)\);/);
  assert.match(shellStyles, /\.lm-files-panel\.is-dialog\s*\{[\s\S]*?width:\s*min\(1120px, calc\(100vw - 80px\)\);/);
  assert.match(shellStyles, /\.lm-assets-dialog-sidebar/);
  assert.match(shellStyles, /\.lm-assets-dialog-controls/);
  assert.match(shellStyles, /@media \(max-width: 900px\)[\s\S]*?\.lm-files-panel\.is-assets-dialog \{ grid-template-columns: minmax\(0, 1fr\);[\s\S]*?\.lm-assets-dialog-sidebar \{ grid-column: 1; grid-row: 2; flex-direction: row;[\s\S]*?\.lm-files-panel\.is-assets-dialog \.lm-files-list \{ grid-column: 1; grid-row: 4; \}/);
  assert.doesNotMatch(panel, /可灵主体库/);
});

test("LibTV asset new menu exposes only real node and resource actions", () => {
  assert.equal(typeof assetCreateMenuModule.canvasAssetCreateMenuSections, "function");
  assert.equal(typeof assetCreateMenuModule.insertCanvasAssetCreateNode, "function");
  assert.deepEqual(assetCreateMenuModule.canvasAssetCreateMenuSections(), [
    {
      label: "添加节点",
      items: [
        { id: "text", label: "文本", nodeType: "text-node" },
        { id: "image", label: "图片", nodeType: "image-generator" },
        { id: "video", label: "视频", nodeType: "video-generator" },
        { id: "video-composition", label: "视频合成", nodeType: "video-composition-node" },
        { id: "director", label: "导演台", nodeType: "director-node" },
        { id: "audio", label: "音频", nodeType: "audio-node" },
        { id: "script", label: "脚本", nodeType: "script-node" },
        { id: "library", label: "素材库", view: "assets" },
      ],
    },
    {
      label: "添加资源",
      items: [
        { id: "upload", label: "上传", action: "upload" },
        { id: "history", label: "从生成历史选择", view: "history" },
      ],
    },
  ]);

  for (const [actionId, expectedType] of [
    ["text", "text-node"],
    ["image", "image-generator"],
    ["video", "video-generator"],
    ["video-composition", "video-composition-node"],
    ["director", "director-node"],
    ["audio", "audio-node"],
    ["script", "script-node"],
  ]) {
    let elements = [];
    let selectedElementIds = {};
    const api = {
      getSceneElements: () => elements,
      getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      updateScene(update) {
        if (Array.isArray(update.elements)) elements = update.elements;
        if (update.appState?.selectedElementIds) selectedElementIds = update.appState.selectedElementIds;
      },
    };
    const result = assetCreateMenuModule.insertCanvasAssetCreateNode(api, actionId);
    assert.equal(result.ok, true, actionId);
    const element = elements.find((candidate) => candidate.id === result.elementId);
    assert.equal(element?.customData?.type, expectedType, actionId);
    assert.equal(selectedElementIds[result.elementId], true, actionId);
  }

  assert.deepEqual(assetCreateMenuModule.insertCanvasAssetCreateNode(null, "text"), { ok: false, reason: "canvas_unavailable" });
  assert.deepEqual(assetCreateMenuModule.insertCanvasAssetCreateNode({ getSceneElements: () => [] }, "upload"), { ok: false, reason: "unsupported_action" });
  assert.match(panel, /aria-label="新建资产和节点"/);
  assert.match(panel, /aria-haspopup="menu"/);
  assert.match(panel, /canvasAssetCreateMenuSections\(\)\.map/);
  assert.match(panel, /insertCanvasAssetCreateNode\(api, item\.id\)/);
  assert.match(panel, /item\.action === "upload"[\s\S]*?assetUploadInputRef\.current\?\.click\(\)/);
  assert.match(panel, /item\.view === "history"[\s\S]*?onOpenFilesView\?\.\("history"\)/);
  assert.match(shellStyles, /\.lm-assets-create-menu/);
  assert.match(shellStyles, /@media \(max-width: 900px\)[\s\S]*?\.lm-files-panel\.is-dialog \{ width: min\(100%, calc\(100vw - 24px\)\);/);
  assert.match(shell, /onOpenFilesView=\{onOpenFilesView\}/);
  assert.match(main, /onOpenFilesView=\{openFilesView\}/);
});

test("asset new menu keeps Escape nested and supports menu keyboard navigation", () => {
  assert.equal(typeof assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex, "function");
  assert.equal(typeof assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction, "function");
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("ArrowDown", -1, 4), 0);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("ArrowDown", 3, 4), 0);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("ArrowUp", 0, 4), 3);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("Home", 2, 4), 0);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("End", 1, 4), 3);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("Enter", 1, 4), null);
  assert.equal(assetCreateMenuModule.resolveCanvasAssetCreateMenuIndex("ArrowDown", 0, 0), null);
  assert.deepEqual(assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction({ key: "Escape", currentIndex: 2, itemCount: 4 }), { handled: true, close: true, focus: "trigger" });
  assert.deepEqual(assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction({ key: "Tab", currentIndex: 2, itemCount: 4 }), { handled: true, close: true, focus: "search" });
  assert.deepEqual(assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction({ key: "Tab", shiftKey: true, currentIndex: 2, itemCount: 4 }), { handled: true, close: true, focus: "batch" });
  assert.deepEqual(assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction({ key: "ArrowDown", currentIndex: 3, itemCount: 4 }), { handled: true, close: false, nextIndex: 0 });
  assert.deepEqual(assetCreateMenuModule.resolveCanvasAssetCreateMenuKeyAction({ key: "Enter", currentIndex: 2, itemCount: 4 }), { handled: false });

  assert.match(panel, /const assetCreateMenuButtonRef = useRef\(null\)/);
  assert.match(panel, /const assetCreateMenuPopupRef = useRef\(null\)/);
  assert.match(panel, /if \(!open \|\| !dedicatedAssetsDialog\) setAssetCreateMenuOpen\(false\)/);
  assert.match(panel, /if \(!assetCreateMenuOpen \|\| !open \|\| !dedicatedAssetsDialog\) return undefined;[\s\S]*?requestAnimationFrame\(\(\) => enabledAssetCreateMenuItems\(\)\[0\]\?\.focus\(\)\)/);
  assert.match(panel, /const assetBatchButtonRef = useRef\(null\)/);
  assert.match(panel, /const assetSearchInputRef = useRef\(null\)/);
  const assetMenuKeyboardBlock = panel.match(/const handleAssetCreateMenuKeyDown = \(event\) => \{[\s\S]*?window\.addEventListener\("keydown", handleAssetCreateMenuKeyDown, true\)/)?.[0] ?? "";
  assert.match(assetMenuKeyboardBlock, /resolveCanvasAssetCreateMenuKeyAction\(\{[\s\S]*?key: event\.key[\s\S]*?shiftKey: event\.shiftKey/);
  assert.match(assetMenuKeyboardBlock, /action\.close[\s\S]*?setAssetCreateMenuOpen\(false\)[\s\S]*?action\.focus === "trigger"[\s\S]*?assetCreateMenuButtonRef[\s\S]*?assetSearchInputRef/);
  assert.match(assetMenuKeyboardBlock, /event\.stopImmediatePropagation\?\.\(\)/);
  assert.match(panel, /ref=\{assetCreateMenuButtonRef\}[\s\S]*?aria-controls="lm-assets-create-menu"/);
  assert.match(panel, /id="lm-assets-create-menu"[\s\S]*?ref=\{assetCreateMenuPopupRef\}[\s\S]*?role="menu"/);
  assert.match(panel, /role="menuitem"[\s\S]*?tabIndex=\{-1\}/);
});

test("failed media can be rebound to a matching source file and saved through scene change", async () => {
  let scene = [{
    id: "failed-video",
    type: "embeddable",
    link: null,
    version: 3,
    customData: { isVideo: true, mediaKind: "video", sourceKind: "upload", cloudArchiveStatus: "failed", archiveRetryState: "needs-file", requiresSourceFile: true, archiveError: "failed" },
  }];
  const updates = [];
  const uploads = [];
  const api = {
    getSceneElements: () => scene,
    updateScene(update) { updates.push(update); scene = update.elements; },
    scrollToContent() {},
    setToast() {},
  };
  const rebound = await rebindCanvasMediaFile(api, "failed-video", { name: "replacement.mp4", type: "video/mp4" }, {
    assetClient: { async uploadFile(file, input) { uploads.push([file.name, input]); return { upload: { publicUrl: "https://cdn.example/replacement.mp4", storageObjectId: "object-2", uploadSessionId: "session-2", mimeType: "video/mp4" } }; } },
    async readDuration() { return 12.5; },
  });
  assert.equal(rebound, true);
  assert.deepEqual(uploads, [["replacement.mp4", { purpose: "new-canvas/video-rebind" }]]);
  assert.equal(scene[0].link, "https://cdn.example/replacement.mp4");
  assert.equal(scene[0].customData.storageUrl, "https://cdn.example/replacement.mp4");
  assert.equal(scene[0].customData.storageObjectId, "object-2");
  assert.equal(scene[0].customData.cloudArchiveStatus, "archived");
  assert.equal(scene[0].customData.durationSeconds, 12.5);
  assert.equal(scene[0].customData.requiresSourceFile, undefined);
  assert.equal(scene[0].customData.archiveError, undefined);
  assert.equal(scene[0].version, 4);
  assert.equal(updates[0].captureUpdate, "IMMEDIATELY");
});

test("source rebinding rejects mismatched media without uploading or mutating", async () => {
  const original = { id: "failed-audio", type: "rectangle", customData: { type: "audio-node", sourceKind: "upload", cloudArchiveStatus: "needs-file" } };
  let uploadCount = 0;
  let updateCount = 0;
  const api = { getSceneElements: () => [original], updateScene() { updateCount += 1; }, setToast() {} };
  const rebound = await rebindCanvasMediaFile(api, original.id, { name: "wrong.png", type: "image/png" }, { assetClient: { async uploadFile() { uploadCount += 1; } } });
  assert.equal(rebound, false);
  assert.equal(uploadCount, 0);
  assert.equal(updateCount, 0);
  assert.equal(canvasElementRequiresSourceFile(original), true);
  assert.equal(canvasElementRequiresSourceFile({ customData: { archiveRetryState: "needs-file" } }), true);
  assert.equal(canvasElementRequiresSourceFile({ customData: { cloudArchiveStatus: "archived" } }), false);
});

test("source rebinding replaces image files and audio media metadata in place", async () => {
  let scene = [
    { id: "failed-image", type: "image", fileId: "image-file", customData: { requiresSourceFile: true } },
    { id: "failed-audio", type: "rectangle", customData: { type: "audio-node", sourceKind: "upload", mediaUrl: "blob:lost", requiresSourceFile: true } },
  ];
  const addedFiles = [];
  const api = {
    getSceneElements: () => scene,
    addFiles(filesToAdd) { addedFiles.push(...filesToAdd); },
    updateScene(update) { scene = update.elements; },
    scrollToContent() {},
    setToast() {},
  };
  const assetClient = {
    async uploadFile(file) {
      return { upload: { publicUrl: `https://cdn.example/${file.name}`, uploadSessionId: `session-${file.name}`, mimeType: file.type } };
    },
  };
  assert.equal(await rebindCanvasMediaFile(api, "failed-image", { name: "portrait.png", type: "image/png" }, {
    assetClient,
    async readFile() { return "data:image/png;base64,NEW"; },
  }), true);
  assert.deepEqual(addedFiles, [{ id: "image-file", dataURL: "data:image/png;base64,NEW", mimeType: "image/png", created: addedFiles[0].created }]);
  assert.equal(scene[0].customData.storageUrl, "https://cdn.example/portrait.png");
  assert.equal(scene[0].customData.uploadSessionId, "session-portrait.png");

  assert.equal(await rebindCanvasMediaFile(api, "failed-audio", { name: "voice.wav", type: "audio/wav" }, {
    assetClient,
    async readDuration() { return 8.2; },
  }), true);
  assert.equal(scene[1].customData.mediaUrl, "https://cdn.example/voice.wav");
  assert.equal(scene[1].customData.fileName, "voice.wav");
  assert.equal(scene[1].customData.mimeType, "audio/wav");
  assert.equal(scene[1].customData.durationSeconds, 8.2);
});

test("canvas file folders and names persist in element custom data", () => {
  const moved = updateCanvasFileMetadata(elements, "upload", { folder: "  角色  设定 ", title: " 女主立绘 " });
  const movedUpload = moved.find((element) => element.id === "upload");
  assert.equal(movedUpload.customData.canvasFolder, "角色 设定");
  assert.equal(movedUpload.customData.canvasFileName, "女主立绘");
  assert.equal(movedUpload.version, 2);
  assert.strictEqual(updateCanvasFileMetadata(moved, "text", { folder: "忽略" }), moved);

  const folderEntries = collectCanvasFileEntries([
    movedUpload,
    { ...elements[2], customData: { ...elements[2].customData, canvasFolder: "成片" } },
    { ...elements[5], customData: { ...elements[5].customData, canvasFolder: "角色 设定" } },
  ], files);
  assert.deepEqual(listCanvasFolders(folderEntries), ["成片", "角色 设定"]);
  assert.equal(folderEntries.find((entry) => entry.id === "upload").title, "女主立绘");
  assert.deepEqual(filterCanvasFileEntries(folderEntries, { query: "角色 设定" }).map(({ id }) => id), ["video", "upload"]);

  const renamed = renameCanvasFolder(moved, "角色 设定", "人物参考");
  assert.equal(renamed.find((element) => element.id === "upload").customData.canvasFolder, "人物参考");
  const removed = removeCanvasFolder(renamed, "人物参考");
  assert.equal(removed.find((element) => element.id === "upload").customData.canvasFolder, undefined);
  assert.equal(normalizeCanvasFolderName("  A   B  "), "A B");
});

test("batch asset classification persists selected canvas media in one immutable projection", () => {
  const source = [
    { ...elements[1], version: 3 },
    { ...elements[2], version: 5 },
    elements[0],
  ];
  const classified = updateCanvasFilesMetadata(source, new Set(["upload", "generated", "text"]), { folder: "  人物 参考 " });
  assert.notStrictEqual(classified, source);
  assert.equal(classified[0].customData.canvasFolder, "人物 参考");
  assert.equal(classified[1].customData.canvasFolder, "人物 参考");
  assert.deepEqual([classified[0].version, classified[1].version], [4, 6]);
  assert.strictEqual(classified[2], source[2]);
  assert.strictEqual(updateCanvasFilesMetadata(classified, ["upload", "generated"], { folder: "人物 参考" }), classified);
  const unfiled = updateCanvasFilesMetadata(classified, ["generated"], { folder: "" });
  assert.equal(unfiled[1].customData.canvasFolder, undefined);
  assert.strictEqual(unfiled[0], classified[0]);
});

test("asset batch execution preserves boolean-array failures and rejection order", async () => {
  const values = new Map([
    ["first", [true]],
    ["second", [false]],
    ["fourth", [true, true]],
  ]);
  const calls = [];
  const results = await runCanvasAssetBatch(["first", "second", "third", "fourth"], async (item) => {
    calls.push(item);
    if (item === "third") throw new Error("upload_failed");
    return values.get(item);
  });
  assert.deepEqual(calls, ["first", "second", "third", "fourth"]);
  assert.deepEqual(results, [true, false, false, true]);
});

test("asset batch execution stops after a delayed scope switch", async () => {
  let current = true;
  let release;
  const calls = [];
  const pending = runCanvasAssetBatch(["first", "second"], async (item) => {
    calls.push(item);
    await new Promise((resolve) => { release = resolve; });
    return [true];
  }, { shouldContinue: () => current });
  await Promise.resolve();
  current = false;
  release();
  assert.deepEqual(await pending, []);
  assert.deepEqual(calls, ["first"]);
});

test("asset reuse creates a new selected media element at the viewport center", () => {
  const original = { ...elements[1], x: 10, y: 20, width: 400, height: 300, groupIds: ["group"], frameId: "frame", boundElements: [{ id: "arrow" }] };
  const duplicate = duplicateCanvasMediaElement(original, { width: 1200, height: 800, zoom: { value: 1 }, scrollX: 0, scrollY: 0 });
  assert.notEqual(duplicate.id, original.id);
  assert.equal(duplicate.fileId, original.fileId);
  assert.equal(duplicate.x, 400);
  assert.equal(duplicate.y, 250);
  assert.deepEqual(duplicate.groupIds, []);
  assert.equal(duplicate.frameId, null);
  assert.equal(duplicate.boundElements, null);
});

test("cloud video insertion builds a complete Excalidraw embeddable element", () => {
  const element = createExcalidrawVideoElement({
    url: "https://cdn.example/shot.mp4",
    x: 120,
    y: 80,
    width: 640,
    height: 360,
    title: "推进镜头",
    mimeType: "video/mp4",
  });

  assert.equal(element.type, "embeddable");
  assert.equal(element.link, "https://cdn.example/shot.mp4");
  assert.deepEqual(element.groupIds, []);
  assert.equal(element.boundElements, null);
  assert.equal(element.frameId, null);
  assert.equal(element.customData.isVideo, true);
  assert.equal(element.version, 1);
  assert.equal(element.isDeleted, false);
});

test("cloud asset payloads are conservatively normalized across personal responses", () => {
  const personal = normalizeCloudAssetEntries({
    data: [
      { id: "personal-image-object", fileName: "角色定妆.png", mediaKind: "image", previewUrl: "/thumb.png", downloadUrl: "/original.png", sourceAction: "upload" },
      { mediaId: "personal-video", title: "走路镜头", mimeType: "video/mp4", storageUrl: "/shot.mp4" },
      { id: "audio-object", mediaKind: "audio", contentType: "audio/mpeg", sourceUrl: "/voice.mp3" },
    ],
  });
  assert.deepEqual(personal.map(({ id, type }) => [id, type]), [
    ["cloud:personal-library:personal-image-object", "image"],
    ["cloud:personal-library:personal-video", "video"],
    ["cloud:personal-library:audio-object", "audio"],
  ]);
  assert.equal(personal[0].mediaUrl, "/api/storage/objects/personal-image-object/content");
  assert.equal(personal[0].storageUrl, "/api/storage/objects/personal-image-object/content");
  assert.equal(personal[0].storageObjectId, "personal-image-object");
  assert.equal(personal[2].storageUrl, "/api/storage/objects/audio-object/content");
  assert.equal(personal[2].storageObjectId, "audio-object");
  assert.equal(personal[2].mimeType, "audio/mpeg");

});

test("team resource normalization preserves stable storage references", () => {
  const [resource] = normalizeCanvasResourceEntries({
    items: [{
      id: "team-resource-1",
      category: "character",
      name: "女主角",
      previewUrl: "/preview.png",
      latestVersion: {
        storageObjectId: "team-resource-object",
        metadata: { sourceUrl: "/source.png", mimeType: "image/png" },
      },
    }],
  }, "team-library");
  assert.equal(resource.storageObjectId, "team-resource-object");
  assert.equal(resource.storageUrl, "/api/storage/objects/team-resource-object/content");
  assert.equal(buildCloudAssetCustomData(resource).storageObjectId, "team-resource-object");
  assert.equal(buildCloudAssetCustomData(resource).storageUrl, "/api/storage/objects/team-resource-object/content");
});

test("cloud asset media and download URLs prefer the authenticated stable object route", () => {
  assert.equal(resolveCanvasAssetContentUrl({
    storageObjectId: "folder/object id",
    downloadUrl: "https://signed.example/expired.png?token=old",
  }), "/api/storage/objects/folder%2Fobject%20id/content");
  assert.equal(resolveCanvasAssetContentUrl({ storageUrl: "/legacy-source.png" }), "/legacy-source.png");

  const history = normalizeCanvasNodeHistory({
    runs: [{
      id: "run-stable",
      status: "succeeded",
      mediaKind: "image",
      artifacts: [{
        id: "artifact-stable",
        artifactKind: "image",
        url: "https://signed.example/expired.png?token=old",
        storageObjectId: "history/object id",
      }],
    }],
  }, "image-node");
  assert.equal(history.artifacts[0].storageUrl, "/api/storage/objects/history%2Fobject%20id/content");
  assert.equal(history.artifacts[0].mediaUrl, "/api/storage/objects/history%2Fobject%20id/content");
});

test("asset downloads preserve real media extensions and never promote media thumbnails", () => {
  assert.deepEqual(resolveCanvasAssetDownload({
    title: "photo",
    type: "image",
    mimeType: "image/jpeg; charset=binary",
    storageObjectId: "folder/object id",
    downloadUrl: "https://signed.example/expired.png?token=old",
  }), {
    url: "/api/storage/objects/folder%2Fobject%20id/content",
    fileName: "photo.jpg",
  });
  assert.equal(resolveCanvasAssetDownload({ title: "cover.webp", type: "image", mimeType: "image/jpeg", mediaUrl: "/cover" }).fileName, "cover.webp");
  assert.equal(resolveCanvasAssetDownload({ title: "clip", type: "video", mimeType: "video/quicktime", mediaUrl: "/clip" }).fileName, "clip.mov");
  assert.equal(resolveCanvasAssetDownload({ title: "voice", type: "audio", mimeType: "audio/flac", mediaUrl: "/voice" }).fileName, "voice.flac");
  assert.equal(resolveCanvasAssetDownload({ title: "poster", type: "video", previewUrl: "/poster.png" }), null);
  assert.equal(resolveCanvasAssetDownload({ title: "waveform", type: "audio", thumbnailUrl: "/waveform.jpg" }), null);

  assert.deepEqual(normalizeCloudAssetEntries({
    items: [{ id: "video-thumb", mediaType: "video", previewUrl: "/poster.png" }],
  }, "team-library"), []);
  assert.deepEqual(normalizeCanvasNodeHistory({
    runs: [{ id: "run-thumb", status: "succeeded", mediaKind: "video", artifacts: [{ id: "artifact-thumb", artifactKind: "video", thumbnailUrl: "/poster.png" }] }],
  }, "video-node").artifacts, []);
});

test("cloud asset loading uses independent personal, official, and team APIs", async () => {
  const calls = [];
  const result = await loadCanvasCloudAssets({
    async getPersonalMediaLibrary(input) {
      calls.push(["personal", input]);
      return { records: [{ id: "personal-1", mediaType: "image", url: "/personal.png" }] };
    },
    async getLibraryAssets(input) {
      calls.push([input.scope, input]);
      if (input.scope === "official") {
        return { assets: [{ id: "official-1", category: "character", name: "官方角色", latestVersion: { mimeType: "image/png", previewUrl: "/official.png" } }] };
      }
      return { assets: [{ id: "team-1", category: "scene", name: "团队场景", resourceType: "image", sourceUrl: "/team.png" }] };
    },
  });
  assert.deepEqual(calls, [
    ["personal", { media: "all", range: "all", page: 1, pageSize: 100 }],
    ["official", { scope: "official" }],
    ["team", { scope: "team" }],
  ]);
  assert.deepEqual(result.entries.map(({ source, sourceLabel }) => [source, sourceLabel]), [
    ["personal-library", "个人素材"],
    ["official-library", "官方素材"],
    ["team-library", "团队素材"],
  ]);
  assert.deepEqual(result.entries.map(({ assetCategory }) => assetCategory), ["other", "character", "scene"]);
  assert.deepEqual(result.errors, []);

  const partial = await loadCanvasCloudAssets({
    async getPersonalMediaLibrary() { throw new Error("offline"); },
    async getLibraryAssets(input) {
      if (input.scope === "official") return { items: [{ id: "kept", assetType: "image", sourceUrl: "/kept.png" }] };
      throw new Error("team offline");
    },
  });
  assert.equal(partial.entries[0].sourceId, "kept");
  assert.deepEqual(partial.errors, ["个人素材加载失败。", "团队素材加载失败。"]);
});

test("cloud asset loading follows every personal-media page and keeps successful pages on partial failure", async () => {
  const pages = [];
  const result = await loadCanvasCloudAssets({
    async getPersonalMediaLibrary(input) {
      pages.push(input.page);
      if (input.page === 1) {
        return {
          data: [{ id: "personal-1", mediaKind: "image", sourceUrl: "/one.png" }],
          meta: { page: 1, pageSize: 100, total: 250, totalPages: 3 },
        };
      }
      if (input.page === 2) {
        return {
          data: [
            { id: "personal-1", mediaKind: "image", sourceUrl: "/one.png" },
            { id: "personal-2", mediaKind: "video", sourceUrl: "/two.mp4" },
          ],
          meta: { page: 2, pageSize: 100, total: 250, totalPages: 3 },
        };
      }
      throw new Error("page unavailable");
    },
  });

  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(result.entries.map(({ sourceId, type }) => [sourceId, type]), [
    ["personal-1", "image"],
    ["personal-2", "video"],
  ]);
  assert.deepEqual(result.errors, ["个人素材有 1 页加载失败。"]);
});

test("resource library keeps character semantics and normalizes real style presets", () => {
  const resources = normalizeCanvasResourceEntries({ assets: [
    { id: "role-1", category: "character", name: "女主角", folder: "现代都市", previewUrl: "/role-preview.png", storageUrl: "/role.png", assetPrompt: "短发，黑色风衣" },
    { id: "scene-1", assetType: "scene", title: "天台", latestVersion: { previewUrl: "/roof.png" } },
  ] }, "team-library");
  assert.deepEqual(resources.map(({ resourceCategory, kindLabel }) => [resourceCategory, kindLabel]), [
    ["character", "角色"],
    ["scene", "场景"],
  ]);
  assert.deepEqual(resources.map(({ assetCategory }) => assetCategory), ["character", "scene"]);
  assert.equal(resources[0].folder, "现代都市");
  assert.equal(resources[0].prompt, "短发，黑色风衣");
  assert.equal(resources[0].storageUrl, "/role.png");

  const styles = normalizeCanvasStyleEntries({ data: { styles: [
    { id: "style-1", code: "ink", name: "水墨国风", cover_image_url: "/ink.png", prompt_content: "水墨晕染，宣纸纹理" },
  ] } });
  assert.deepEqual(styles.map(({ sourceId, title, code, promptContent }) => [sourceId, title, code, promptContent]), [
    ["style-1", "水墨国风", "ink", "水墨晕染，宣纸纹理"],
  ]);
  assert.equal(styles[0].thumbnailUrl, "/ink.png");
  assert.equal(styles[0].assetCategory, "style");
});

test("dedicated asset categories preserve media types and filter only by real semantic metadata", () => {
  const entries = normalizeCloudAssetEntries({ items: [
    { id: "role", assetType: "character_sheet", contentType: "image/png", sourceUrl: "/role.png" },
    { id: "scene", category: "scene_reference", contentType: "image/png", sourceUrl: "/scene.png" },
    { id: "prop", kind: "prop_reference", contentType: "image/png", sourceUrl: "/prop.png" },
    { id: "style", category: "style", contentType: "image/png", sourceUrl: "/style.png" },
    { id: "audio", mediaKind: "audio", contentType: "audio/mpeg", sourceUrl: "/audio.mp3" },
    { id: "sfx", category: "sound_effect", contentType: "audio/mpeg", sourceUrl: "/sfx.mp3" },
    { id: "plain", mediaKind: "video", contentType: "video/mp4", sourceUrl: "/plain.mp4" },
  ] }, "team-library");

  assert.deepEqual(entries.map(({ type, assetCategory }) => [type, assetCategory]), [
    ["image", "character"],
    ["image", "scene"],
    ["image", "prop"],
    ["image", "style"],
    ["audio", "other"],
    ["audio", "audio"],
    ["video", "other"],
  ]);
  assert.deepEqual(filterCanvasFileEntries(entries, { type: "image" }).map(({ sourceId }) => sourceId), ["role", "scene", "prop", "style"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { assetCategory: "scene" }).map(({ sourceId }) => sourceId), ["scene"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { assetCategory: "audio" }).map(({ sourceId }) => sourceId), ["sfx"]);
  assert.deepEqual(filterCanvasFileEntries(entries, { type: "image", assetCategory: "prop" }).map(({ sourceId }) => sourceId), ["prop"]);
});

test("resource library uses independent official, team, and style contracts without generating", async () => {
  const calls = [];
  const result = await loadCanvasResourceLibrary({
    async getLibraryAssets(input) {
      calls.push(["library", input]);
      return { assets: [{ id: input.scope, category: "character", name: `${input.scope}角色`, previewUrl: `/${input.scope}.png` }] };
    },
    async getProjectStyles() {
      calls.push(["styles", "official"]);
      return { styles: [{ id: "official-style", code: "official", name: "官方风格", prompt_content: "电影光影" }] };
    },
    async getBatchImageStyles() {
      calls.push(["styles", "batch"]);
      return { data: [{ id: "batch-style", code: "batch", name: "批量风格", promptContent: "统一色调" }] };
    },
  });
  assert.deepEqual(calls, [
    ["library", { scope: "official" }],
    ["library", { scope: "team" }],
    ["styles", "official"],
    ["styles", "batch"],
  ]);
  assert.deepEqual(result.entries.map(({ source }) => source), ["official-library", "team-library"]);
  assert.deepEqual(result.styles.map(({ source }) => source), ["official-style", "batch-style"]);
  assert.deepEqual(result.errors, []);
});

test("resource filtering searches semantic metadata and style prompt merging is idempotent", () => {
  const entries = [
    { title: "青衣剑客", kindLabel: "角色", resourceCategory: "character", resourceType: "asset", source: "official-library", sourceLabel: "官方资源", folder: "东方修仙", prompt: "青色长衫" },
    { title: "赛博都市", kindLabel: "场景", resourceCategory: "scene", resourceType: "asset", source: "team-library", sourceLabel: "团队资源", folder: "现代都市" },
  ];
  assert.deepEqual(filterCanvasResourceEntries(entries, { category: "character", query: "修仙" }).map(({ title }) => title), ["青衣剑客"]);
  assert.deepEqual(filterCanvasResourceEntries(entries, { source: "team-library" }).map(({ title }) => title), ["赛博都市"]);
  assert.equal(mergeCanvasStylePrompt("雨夜街道", "电影光影"), "雨夜街道\n\n风格要求：电影光影");
  assert.equal(mergeCanvasStylePrompt("雨夜街道\n\n风格要求：电影光影", "电影光影"), "雨夜街道\n\n风格要求：电影光影");
  assert.equal(mergeCanvasStylePrompt("雨夜街道\n\n风格要求：电影光影", "水墨晕染", "电影光影"), "雨夜街道\n\n风格要求：水墨晕染");
});

test("local canvas image imports archive through the shared upload client and tolerate archive failure", async () => {
  const calls = [];
  const file = { name: "角色.png", type: "image/png", size: 1024 };
  const archived = await archiveCanvasImageFile(file, {
    assetClient: {
      async uploadFile(inputFile, options) {
        calls.push([inputFile, options]);
        return {
          upload: { uploadSessionId: "upload-1", storageObjectId: "object-1", mimeType: "image/png" },
          uploadRecord: { publicUrl: "https://cdn.example/canvas/role.png" },
        };
      },
    },
    purpose: "new-canvas/image-import",
  });
  assert.deepEqual(calls, [[file, { purpose: "new-canvas/image-import" }]]);
  assert.deepEqual(archived, {
    storageUrl: "https://cdn.example/canvas/role.png",
    storageObjectId: "object-1",
    uploadSessionId: "upload-1",
    mimeType: "image/png",
    sourceAction: "new-canvas/image-import",
  });
  assert.equal(await archiveCanvasImageFile(file, {
    assetClient: { async uploadFile() { throw new Error("offline"); } },
    retryDelays: [],
  }), null);

  const audioArchive = await archiveCanvasMediaFile({ name: "voice.mp3", type: "audio/mpeg" }, {
    assetClient: {
      async uploadFile(inputFile, options) {
        assert.equal(inputFile.name, "voice.mp3");
        assert.equal(options.purpose, "new-canvas/audio-import");
        return { upload: { storageObjectId: "audio-object", mimeType: "audio/mpeg" }, uploadRecord: { publicUrl: "/voice.mp3" } };
      },
    },
    purpose: "new-canvas/audio-import",
  });
  assert.equal(audioArchive.storageUrl, "/voice.mp3");
  assert.equal(audioArchive.storageObjectId, "audio-object");
});

test("media archive retries transient failures and failed cloud media never persists a data URL", async () => {
  let attempts = 0;
  const archived = await archiveCanvasMediaFile({ name: "clip.mp4", type: "video/mp4" }, {
    assetClient: { async uploadFile() {
      attempts += 1;
      if (attempts < 3) throw new Error("offline");
      return { uploadRecord: { publicUrl: "https://cdn.example/clip.mp4" }, upload: { mimeType: "video/mp4" } };
    } },
    retryDelays: [0, 0],
    sleep: async () => undefined,
  });
  assert.equal(attempts, 3);
  assert.equal(archived.storageUrl, "https://cdn.example/clip.mp4");
  assert.equal(await archiveCanvasMediaFile({ name: "missing-url.mp4", type: "video/mp4" }, {
    assetClient: { async uploadFile() { return { upload: { storageObjectId: "object-only" } }; } },
    retryDelays: [],
  }), null);
  assert.equal(await archiveCanvasMediaFile({ name: "ephemeral.mp4", type: "video/mp4" }, {
    assetClient: { async uploadFile() { return { uploadRecord: { publicUrl: "blob:temporary" } }; } },
    retryDelays: [],
  }), null);
  assert.match(canvasApiSource, /视频上传失败，未写入画布/);
  assert.match(canvasApiSource, /音频上传失败，未写入画布/);
  assert.doesNotMatch(canvasApiSource, /刷新后仍可播放/);
});

test("video import retries with the original file and inserts only the stable archived URL", async () => {
  let elements = [];
  let attempts = 0;
  const toasts = [];
  const api = {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) elements = update.elements; },
    scrollToContent() {},
    setToast(toast) { toasts.push(toast.message); },
  };
  const file = new Blob(["video"], { type: "video/mp4" });
  Object.defineProperty(file, "name", { value: "clip.mp4" });
  const result = await importVideoToCanvas(api, file, {
    assetClient: { async uploadFile(input) {
      assert.strictEqual(input, file);
      attempts += 1;
      if (attempts < 3) throw new Error("offline");
      return { uploadRecord: { publicUrl: "https://cdn.example/clip.mp4" }, upload: { mimeType: "video/mp4" } };
    } },
    retryDelays: [0, 0],
    sleep: async () => undefined,
  });
  assert.equal(result, true);
  assert.equal(attempts, 3);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].link, "https://cdn.example/clip.mp4");
  assert.equal(elements[0].customData.cloudArchiveStatus, "archived");
  assert.equal(JSON.stringify(elements).match(/data:video|blob:/i), null);
  assert.ok(toasts.some((message) => message.includes("自动重试")));
});

test("delayed image, video, and audio imports cannot mutate a switched or closed canvas scope", async () => {
  const cases = [
    { importer: importImageToCanvas, file: { name: "stale.png", type: "image/png" }, invalidate(scope) { scope.api = {}; } },
    { importer: importVideoToCanvas, file: { name: "stale.mp4", type: "video/mp4" }, invalidate(scope) { scope.open = false; } },
    { importer: importAudioToCanvas, file: { name: "stale.mp3", type: "audio/mpeg" }, invalidate(scope) { scope.api = null; } },
  ];
  for (const { importer, file, invalidate } of cases) {
    let addFilesCalls = 0;
    let updateSceneCalls = 0;
    let releaseUpload;
    const api = {
      addFiles() { addFilesCalls += 1; },
      getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
      getSceneElements: () => [],
      scrollToContent() {},
      setToast() {},
      updateScene() { updateSceneCalls += 1; },
    };
    const scope = { api, open: true };
    const pending = importer(api, file, {
      assetClient: {
        uploadFile() {
          return new Promise((resolve) => { releaseUpload = resolve; });
        },
      },
      retryDelays: [],
      shouldInsert: () => scope.open && scope.api === api,
    });
    assert.equal(typeof releaseUpload, "function");
    invalidate(scope);
    releaseUpload({
      upload: { storageObjectId: `object-${file.name}`, mimeType: file.type },
      uploadRecord: { publicUrl: `https://cdn.example/${file.name}` },
    });
    assert.equal(await pending, false);
    assert.equal(addFilesCalls, 0);
    assert.equal(updateSceneCalls, 0);
  }
  assert.match(main, /const shouldInsert = \(\) => apiRef\.current === canvasApi && callerScope\(\)/);
  assert.match(main, /apiRef\.current = null/);
});

test("batch media import preserves result order and continues after one file throws", async () => {
  const calls = [];
  const toasts = [];
  const files = [
    { name: "broken.png", type: "image/png" },
    { name: "clip.mp4", type: "video/mp4" },
    { name: "notes.txt", type: "text/plain" },
    { name: "voice.mp3", type: "audio/mpeg" },
  ];
  const result = await importMediaFilesToCanvas({ setToast: (toast) => toasts.push(toast) }, files, {
    async importImage(_api, file, options) {
      calls.push(["image", file.name, options.purpose]);
      throw new Error("图片解析失败");
    },
    async importVideo(_api, file, options) {
      calls.push(["video", file.name, options.purpose]);
      return true;
    },
    async importAudio(_api, file, options) {
      calls.push(["audio", file.name, options.purpose]);
      return true;
    },
  });
  assert.deepEqual(result, [false, true, true]);
  assert.deepEqual(calls, [
    ["image", "broken.png", "new-canvas/image-import"],
    ["video", "clip.mp4", "new-canvas/video-import"],
    ["audio", "voice.mp3", "new-canvas/audio-import"],
  ]);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].message, /broken\.png.*图片解析失败/);
});

test("inserted cloud assets retain storage and source metadata", () => {
  assert.deepEqual(buildCloudAssetCustomData({
    title: "团队镜头",
    storageUrl: "/team-shot.mp4",
    storageObjectId: "team-shot-object",
    source: "team-library",
    sourceId: "shot-1",
    sourceAction: "generated",
    mimeType: "video/mp4",
  }, { isVideo: true }), {
    isVideo: true,
    title: "团队镜头",
    storageUrl: "/api/storage/objects/team-shot-object/content",
    storageObjectId: "team-shot-object",
    source: "team-library",
    sourceId: "shot-1",
    sourceAction: "generated",
    mimeType: "video/mp4",
    sourceKind: "generated",
    cloudArchiveStatus: "archived",
  });
  const resourceMetadata = buildCloudAssetCustomData({
    title: "官方女主角",
    storageUrl: "/heroine.png",
    source: "official-library",
    sourceId: "heroine-1",
    sourceAction: "library",
    mimeType: "image/png",
    type: "image",
    resourceType: "asset",
    resourceCategory: "character",
    assetCategory: "character",
    folder: "现代都市",
    prompt: "短发，黑色风衣",
  });
  assert.equal(resourceMetadata.resourceType, "asset");
  assert.equal(resourceMetadata.resourceCategory, "character");
  assert.equal(resourceMetadata.assetCategory, "character");
  assert.equal(resourceMetadata.resourceFolder, "现代都市");
  assert.equal(resourceMetadata.resourcePrompt, "短发，黑色风衣");
});

test("generation history video insertion lands on canvas with persistent source metadata", async () => {
  let scene = [];
  const updates = [];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      updates.push(update);
      if (update.elements) scene = update.elements;
    },
    scrollToContent() {},
  };

  const elementId = await insertCloudAssetOnCanvas(api, {
    id: "artifact-video",
    sourceId: "artifact-video",
    source: "generation-history",
    sourceAction: "generated",
    type: "video",
    title: "历史推进镜头",
    storageUrl: "https://cdn.example/history.mp4",
    mimeType: "video/mp4",
    cloud: true,
  });

  const inserted = scene.find((element) => element.id === elementId);
  assert.equal(inserted.link, "https://cdn.example/history.mp4");
  assert.equal(inserted.customData.storageUrl, "https://cdn.example/history.mp4");
  assert.equal(inserted.customData.source, "generation-history");
  assert.equal(inserted.customData.sourceId, "artifact-video");
  assert.ok(updates.some((update) => update.captureUpdate === "IMMEDIATELY"));
});

test("cloud insertion scope guard prevents a late asset from writing after dialog scope closes", async () => {
  let updates = 0;
  const api = {
    getSceneElements: () => [],
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene() { updates += 1; },
  };
  assert.equal(await insertCloudAssetOnCanvas(api, {
    id: "stale-video",
    sourceId: "stale-video",
    source: "generation-history",
    type: "video",
    title: "关闭后不应插入",
    storageUrl: "https://cdn.example/stale.mp4",
    mimeType: "video/mp4",
    cloud: true,
  }, { shouldInsert: () => false }), null);
  assert.equal(updates, 0);

  assert.equal(await insertVideoOnCanvas(api, {
    url: "https://cdn.example/stale.mp4",
    title: "关闭后不应插入",
    mimeType: "video/mp4",
  }, { shouldInsert: () => false }), null);
  assert.equal(updates, 0);
});

test("dragged cloud assets land at the requested scene anchor", async () => {
  let scene = [];
  let scrollCalls = 0;
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) { if (update.elements) scene = update.elements; },
    scrollToContent() { scrollCalls += 1; },
  };
  const elementId = await insertCloudAssetOnCanvas(api, {
    id: "dragged-video",
    sourceId: "dragged-video",
    source: "personal-library",
    type: "video",
    title: "拖拽镜头",
    storageUrl: "https://cdn.example/dragged.mp4",
    mimeType: "video/mp4",
    width: 1280,
    height: 720,
    cloud: true,
  }, { anchor: { x: 420, y: 360 } });

  const inserted = scene.find((element) => element.id === elementId);
  assert.equal(inserted.x + inserted.width / 2, 420);
  assert.equal(inserted.y + inserted.height / 2, 360);
  assert.equal(scrollCalls, 0);
  assert.match(panel, /application\/x-loomic-canvas-asset/);
  assert.match(panel, /void insert\(entry, \{ anchor \}\)/);
});

test("cloud audio insertion passes its stable storage object into the uploaded node", async () => {
  let scene = [];
  const updates = [];
  const api = {
    getSceneElements: () => scene,
    getAppState: () => ({ width: 1200, height: 800, scrollX: 0, scrollY: 0, zoom: { value: 1 } }),
    updateScene(update) {
      updates.push(update);
      if (update.elements) scene = update.elements;
    },
    scrollToContent() {},
  };

  const elementId = await insertCloudAssetOnCanvas(api, {
    id: "library-audio",
    sourceId: "library-audio",
    source: "personal-library",
    sourceAction: "upload",
    type: "audio",
    title: "云端旁白",
    storageUrl: "https://cdn.example/voice.mp3",
    storageObjectId: "audio-storage-object",
    mimeType: "audio/mpeg",
    cloud: true,
  });

  const createdNodeUpdate = updates[1]?.elements?.find((element) => element.id === elementId);
  assert.equal(createdNodeUpdate?.customData?.storageObjectId, "audio-storage-object");
  assert.equal(scene.find((element) => element.id === elementId)?.customData?.storageObjectId, "audio-storage-object");
});

test("node history normalizes run, top-level, and orphan artifacts without duplicates", () => {
  const history = normalizeCanvasNodeHistory({
    runs: [{
      id: "run-2",
      runNo: 2,
      status: "succeeded",
      mediaKind: "image",
      inputSnapshot: { prompt: "雨夜街道" },
      createdAt: "2026-07-19T12:00:00.000Z",
      artifacts: [{ id: "artifact-image", artifactKind: "image", url: "/result.png", storageObjectId: "history-image-object", selected: true }],
    }],
    artifacts: [
      { id: "artifact-image", runId: "run-2", artifactKind: "image", url: "/result.png", selected: true },
      { id: "artifact-video", artifactKind: "video", url: "/result.mp4", thumbnailUrl: "/poster.png" },
    ],
    orphanArtifacts: [{ id: "artifact-orphan", artifactKind: "image", url: "/orphan.png" }],
  }, "image-node");

  assert.equal(history.nodeKey, "image-node");
  assert.deepEqual(history.artifacts.map(({ id }) => id), ["artifact-image", "artifact-video", "artifact-orphan"]);
  assert.equal(history.artifacts[0].title, "雨夜街道");
  assert.equal(history.artifacts[0].runNo, 2);
  assert.equal(history.artifacts[0].selected, true);
  assert.equal(history.artifacts[0].storageObjectId, "history-image-object");
  assert.equal(history.artifacts[1].type, "video");
  assert.equal(history.artifacts[1].thumbnailUrl, "/poster.png");
});

test("node history requests require the internal canvas project id and exact node key", async () => {
  const calls = [];
  const client = {
    async listCanvasNodeRuns(canvasProjectId, nodeKey) {
      calls.push([canvasProjectId, nodeKey]);
      return { runs: [], artifacts: [] };
    },
  };
  const loaded = await loadCanvasNodeHistory(client, {
    canvasProjectId: "internal-canvas-id",
    nodeKey: "video-node",
  });
  const skipped = await loadCanvasNodeHistory(client, {
    canvasProjectId: "",
    nodeKey: "business-project-node",
  });

  assert.deepEqual(calls, [["internal-canvas-id", "video-node"]]);
  assert.deepEqual(loaded, { nodeKey: "video-node", runs: [], artifacts: [] });
  assert.deepEqual(skipped, { nodeKey: "business-project-node", runs: [], artifacts: [] });
});

test("generation history aggregates every canvas node while retaining node ownership", async () => {
  const calls = [];
  const history = await loadCanvasGenerationHistory({
    async listCanvasNodeRuns(canvasProjectId, nodeKey) {
      calls.push([canvasProjectId, nodeKey]);
      if (nodeKey === "failed-node") throw new Error("unavailable");
      return {
        runs: [{ id: `run-${nodeKey}`, mediaKind: nodeKey.includes("video") ? "video" : "image", createdAt: nodeKey.includes("video") ? "2026-07-20T12:00:00Z" : "2026-07-20T10:00:00Z", artifacts: [{ id: "artifact-1", url: nodeKey.includes("video") ? "/clip.mp4" : "/still.png" }] }],
      };
    },
  }, { canvasProjectId: "canvas-1", nodeKeys: ["image-node", "video-node", "failed-node", "image-node"] });

  assert.deepEqual(calls, [["canvas-1", "image-node"], ["canvas-1", "video-node"], ["canvas-1", "failed-node"]]);
  assert.deepEqual(history.artifacts.map(({ historyKey, nodeKey, type }) => [historyKey, nodeKey, type]), [
    ["image-node:artifact-1", "image-node", "image"],
    ["video-node:artifact-1", "video-node", "video"],
  ]);
  assert.deepEqual(history.errors, ["failed-node"]);
});

test("selecting aggregated history only changes the owning node current result", () => {
  const artifacts = [
    { id: "image-old", nodeKey: "image-node", selected: true, selectionRole: "current" },
    { id: "image-new", nodeKey: "image-node", selected: false, selectionRole: "candidate" },
    { id: "video-current", nodeKey: "video-node", selected: true, selectionRole: "current" },
  ];
  const selected = markCanvasHistoryArtifactSelected(artifacts, artifacts[1]);
  assert.deepEqual(selected.map(({ id, selected: current }) => [id, current]), [
    ["image-old", false],
    ["image-new", true],
    ["video-current", true],
  ]);
});

test("selecting a history artifact updates the owning generator current result", () => {
  const source = [
    { id: "image-node", type: "rectangle", version: 3, customData: { type: "image-generator", resultUrl: "/old.png", resultStorageObjectId: "old-image-object", prompt: "当前提示词", inputUpdated: true } },
    { id: "other", type: "rectangle", version: 1, customData: { type: "video-generator", resultUrl: "/other.mp4" } },
  ];
  const selected = applyCanvasNodeArtifactSelection(source, "image-node", {
    id: "artifact-current",
    runId: "run-2",
    type: "image",
    storageUrl: "/new.png",
    storageObjectId: "selected-image-object",
    mimeType: "image/png",
  });

  assert.notStrictEqual(selected, source);
  assert.equal(selected[0].customData.resultUrl, "/api/storage/objects/selected-image-object/content");
  assert.deepEqual(selected[0].customData.resultUrls, ["/api/storage/objects/selected-image-object/content"]);
  assert.equal(selected[0].customData.selectedArtifactId, "artifact-current");
  assert.equal(selected[0].customData.selectedArtifactRunId, "run-2");
  assert.equal(selected[0].customData.resultStorageObjectId, "selected-image-object");
  assert.equal(selected[0].customData.inputUpdated, true);
  assert.equal(selected[0].version, 4);
  assert.strictEqual(selected[1], source[1]);
  const withoutArchive = applyCanvasNodeArtifactSelection(source, "image-node", {
    id: "artifact-without-archive",
    storageUrl: "/unarchived.png",
  });
  assert.equal(withoutArchive[0].customData.resultStorageObjectId, null);
  assert.strictEqual(applyCanvasNodeArtifactSelection(source, "missing", { id: "artifact", storageUrl: "/missing.png" }), source);
});

test("selecting an audio history artifact updates the owning audio node", () => {
  const source = [{
    id: "audio-node",
    type: "rectangle",
    version: 2,
    customData: { type: "audio-node", status: "completed", resultUrl: "/old.mp3", resultStorageObjectId: "old-audio" },
  }];
  const selected = applyCanvasNodeArtifactSelection(source, "audio-node", {
    id: "audio-artifact",
    runId: "audio-run-3",
    type: "audio",
    storageUrl: "/new.wav",
    storageObjectId: "new-audio",
    mimeType: "audio/wav",
  });

  assert.equal(selected[0].customData.resultUrl, "/api/storage/objects/new-audio/content");
  assert.equal(selected[0].customData.resultMimeType, "audio/wav");
  assert.equal(selected[0].customData.resultMediaKind, "audio");
  assert.equal(selected[0].customData.resultStorageObjectId, "new-audio");
  assert.equal(selected[0].customData.selectedArtifactId, "audio-artifact");
  assert.equal(selected[0].customData.selectedArtifactRunId, "audio-run-3");
  assert.equal(selected[0].version, 3);
});

test("files panel exposes local and cloud asset workflows", () => {
  assert.match(panel, /const \[canvasPanelEntries, setCanvasPanelEntries\] = useState\(\[\]\)/);
  assert.match(panel, /setCanvasPanelEntries\(collectCanvasPanelEntries\(elements, binaryFiles\)\)/);
  assert.match(panel, /\{dialog \? \(\s*<header className="lm-panel-header">/);
  assert.match(panel, />画布<\/button>/);
  assert.match(panel, />资产<\/button>/);
  assert.match(panel, /aria-selected=\{\["assets", "agents"\]\.includes\(activeTab\)\}[\s\S]*>资产<\/button>/);
  assert.match(panel, /onClick=\{\(\) => \{ setActiveTab\("assets"\); setQuery\(""\); setTypeFilter\("all"\); setSourceFilter\("personal-library"\)/);
  assert.match(panel, /<div className="lm-files-tabs" role="tablist" aria-label="文件视图">[\s\S]*<\/div>\s*<button type="button" className="lm-files-manager-button" aria-label="资产管理" title="资产管理"[\s\S]*onOpenFilesView\?\.\("assets"\)[\s\S]*<BookOpen aria-hidden="true" \/><\/button>/);
  assert.doesNotMatch(panel, />资产管理<\/button>/);
  assert.match(panel, /role="tablist" aria-label="资产分类"[\s\S]*>个人<\/button>[\s\S]*>Agent<\/button>/);
  assert.match(panel, /if \(\["history", "library", "agents"\]\.includes\(activeTab\)\) return \[\]/);
  assert.match(panel, /\{!dialog \? \(\s*<footer className="lm-files-panel-footer">[\s\S]*aria-label="关闭资产管理"[\s\S]*<PanelLeftClose aria-hidden="true" \/>[\s\S]*<output aria-live="polite">\{`共 \$\{canvasPanelEntries\.length\} 节点`\}<\/output>/);
  assert.match(panel, /const displayedEntries = activeTab === "canvas" \? orderCanvasPanelEntries\(visibleCanvasPanelEntries, canvasOrder\) : visibleEntries/);
  assert.match(panel, /entry\.panelType === "text-node"/);
  assert.match(panel, /Boolean\(totalCount\) && !displayedEntries\.length && <p className="lm-panel-empty">没有匹配的内容<\/p>/);
  assert.doesNotMatch(panel, /role="tab"[^>]*>资源库<\/button>/);
  assert.doesNotMatch(panel, /role="tab"[^>]*>生成历史<\/button>/);
  assert.match(panel, />角色库<\/button>/);
  assert.match(panel, />风格预设<\/button>/);
  assert.match(panel, />工具箱<\/button>/);
  assert.match(panel, /loadCanvasResourceLibrary\(assetClient\)/);
  assert.match(panel, /mergeCanvasStylePrompt\(generator\.customData\?\.prompt, entry\.promptContent, generator\.customData\?\.stylePrompt\)/);
  assert.match(panel, /styleId: entry\.sourceId/);
  assert.match(panel, /createImageGeneratorElement\(api\)/);
  assert.doesNotMatch(panel, /const TOOL_PRESETS/);
  assert.match(panel, /getCanvasToolPresetCatalog\(assetClient\)/);
  assert.match(panel, /catalog\.list\(\)/);
  assert.match(panel, /catalog\.insert\(insertApi, entry, \{ shouldInsert \}\)/);
  assert.match(panel, /CANVAS_TOOL_PRESET_DRAG_TYPE/);
  assert.match(panel, /catalog\.loadVersions\(entry\)/);
  assert.match(panel, /catalog\.selectVersion\(entry, versionNumber\)/);
  assert.match(panel, /aria-label="搜索资源库"/);
  assert.match(panel, /aria-label="按资源分类筛选"/);
  assert.match(panel, /aria-label="按资源来源筛选"/);
  assert.match(panel, /资源预览/);
  assert.match(panel, /aria-label="选择生成历史节点"/);
  assert.match(panel, /<option value="\*">全部生成节点<\/option>/);
  assert.match(panel, /loadCanvasGenerationHistory\(assetClient/);
  assert.match(panel, /aria-label="生成历史类型"/);
  assert.match(panel, /const dedicatedHistoryDialog = requestedDedicatedHistoryDialog && activeTab === "history"/);
  assert.match(panel, /aria-label="缩小历史素材"/);
  assert.match(panel, /aria-label="历史素材缩放比例"/);
  assert.match(panel, /aria-label="放大历史素材"/);
  assert.match(panel, /useState\(CANVAS_HISTORY_SCALE_DEFAULT\)/);
  assert.match(panel, /const historyArtifactStyle = dedicatedHistoryDialog \? canvasHistoryScaleStyle\(historyScale\) : undefined/);
  assert.match(panel, /style=\{historyArtifactStyle\}/);
  assert.match(shellStyles, /\.lm-files-panel\.is-history-dialog \.lm-files-list/);
  assert.match(shellStyles, /\.lm-node-history\.is-dedicated/);
  assert.match(panel, /时间降序/);
  assert.match(panel, /批量操作/);
  assert.match(panel, /generatorEntries\.map/);
  assert.match(panel, /activeTab === "history"/);
  assert.match(panel, /!\["history", "library", "agents"\]\.includes\(activeTab\) && Boolean\(totalCount\) && !displayedEntries\.length/);
  assert.match(panel, /aria-label="搜索文件与资产"/);
  assert.match(panel, /aria-label="按类型筛选文件与资产"/);
  assert.match(panel, /aria-label="按来源筛选资产"/);
  assert.doesNotMatch(panel, /activeTab === "assets" \? <div className="lm-history-toolbar lm-asset-toolbar">/);
  assert.match(panel, /className="lm-files-section-title">[\s\S]*?<span>画布元素<\/span>[\s\S]*?<ArrowUpDown aria-hidden="true" \/>/);
  assert.match(panel, /activeTab === "assets" && !totalCount[\s\S]*?<div className="lm-panel-empty is-asset-empty"><Folder aria-hidden="true" \/><span>暂无资产<\/span><\/div>/);
  assert.match(panel, /accept="image\/\*,video\/\*,audio\/\*" multiple/);
  assert.match(panel, /onImportImage\(file, uploadApi, \{ shouldInsert: isCurrent \}\)/);
  assert.match(panel, /runCanvasAssetBatch\(/);
  assert.match(panel, /assetUploadRequestRef\.current === requestId/);
  assert.match(panel, /assetBatchRequestRef\.current === requestId/);
  assert.match(panel, /insertRequestRef\.current === requestId/);
  assert.match(panel, /loadCloudEntries\(\{ shouldApply: isCurrent \}\)/);
  assert.match(panel, /setAssetSelectedIds\(new Set\(\)\)/);
  assert.match(panel, /setAssetBatchFolder\(""\)/);
  assert.match(panel, />批量操作<\/button>/);
  assert.match(panel, /aria-label="批量设置资产分类"/);
  assert.match(panel, /updateCanvasFilesMetadata\(current, localIds, \{ folder \}\)/);
  assert.match(panel, /captureUpdate: "IMMEDIATELY"/);
  assert.match(panel, /插入所选\(\{assetSelectedEntries\.length\}\)/);
  assert.match(shell, /<CanvasFilesPanel[\s\S]*onImportImage=\{onImportImage\}/);
  assert.match(panel, /aria-label="按文件夹筛选"/);
  assert.match(panel, /aria-label="新建文件夹"/);
  assert.match(panel, /renameCanvasFolder/);
  assert.match(panel, /removeCanvasFolder/);
  assert.match(panel, /updateCanvasFileMetadata/);
  assert.match(panel, /official-library/);
  assert.match(panel, /team-library/);
  assert.match(panel, /scrollToContent\?\.\(element, \{ fitToContent: false, animate: true, duration: 250 \}\)/);
  assert.match(panel, /duplicateCanvasMediaElement/);
  assert.match(panel, /loadCanvasCloudAssets/);
  assert.match(panel, /loadCanvasCloudAssets\(assetClient\)/);
  assert.doesNotMatch(panel, /assetContext|getAssetLibrary|projectResult|episodeId|project-library|episode-asset/);
  assert.match(panel, /cloudAssetCapabilitiesFor/);
  assert.match(panel, /云资产重命名失败，原列表未改变/);
  assert.match(panel, /删除云资产.*画布中已插入的引用会保留/);
  assert.match(panel, /insertCloudAssetOnCanvas/);
  assert.match(panel, /const shouldInsert = \(\) =>/);
  assert.match(panel, /scope\.open/);
  assert.match(panel, /正在加载素材/);
  assert.match(panel, /<span>暂无资产<\/span>/);
  assert.match(panel, /aria-label=\{`再次插入 \$\{entry\.title\}`\}/);
  assert.match(panel, /anchor\.download/);
  assert.match(panel, /resolveCanvasAssetDownload\(entry\)/);
  assert.match(panel, /重新选择源文件/);
  assert.match(panel, /rebindCanvasMediaFile\(api, entry\.id, file/);
  assert.match(panel, /loadCanvasNodeHistory\(assetClient, \{ canvasProjectId, nodeKey: normalizedNodeKey \}\)/);
  assert.match(panel, /正在加载生成历史/);
  assert.match(panel, /该节点暂无生成记录/);
  assert.match(panel, /生成历史加载失败/);
  assert.match(panel, /selectCanvasNodeArtifact\?\.\(canvasProjectId, entry\.id, \{ selectionRole: "current" \}\)/);
  assert.match(panel, /applyCanvasNodeArtifactSelection\(currentElements, nodeKey, entry\)/);
  assert.match(panel, /aria-label=\{`插入历史产物 \$\{artifact\.title\}`\}/);
  assert.match(panel, /aria-label=\{`设为当前结果 \$\{artifact\.title\}`\}/);
  assert.match(shell, /canvasProjectId=\{canvasProjectId\}/);
  assert.match(shell, /onGenerate=\{onGenerate\}/);
  assert.match(panel, /listCanvasFailedHistoryRuns/);
  assert.match(panel, /executeCanvasNodeGeneration/);
  assert.match(panel, /useCanvasGenerationConfig/);
  assert.match(panel, /historyRetryCredit\(run\)\.insufficient/);
  assert.match(panel, /积分不足，请先充值后再重新生成/);
  assert.match(panel, /原生成节点已不存在，无法重新生成/);
  assert.match(main, /setCloudCanvasProjectId\(String\(canvasStorage\.getCloudCanvas\?\.\(\)\?\.canvasProjectId \?\? ""\)\.trim\(\)\)/);
  assert.match(main, /canvasProjectId=\{cloudCanvasProjectId\}/);
  assert.match(main, /imagePurpose: "new-canvas\/image-import"/);
  assert.match(main, /videoPurpose: "new-canvas\/video-import"/);
  assert.match(main, /audioPurpose: "new-canvas\/audio-import"/);
  assert.match(main, /onImportImage=\{importCanvasImage\}/);
  assert.match(editor, /onImportImage=\{onImportImage\}/);
  assert.match(toolMenu, /if \(onImportImage\) await onImportImage\(file, excalidrawApi, options\)/);
  assert.match(toolMenu, /fileInsertAnchorRef\.current = null/);
  assert.match(toolMenu, /accept="image\/\*,video\/\*,audio\/\*"/);
  assert.match(toolMenu, /<strong>上传<\/strong>/);
  assert.match(shellStyles, /\.lm-files-panel-footer\s*\{/);
  assert.match(shellStyles, /\.lm-files-panel\s*\{[^}]*z-index:\s*50;/);
  assert.match(shellStyles, /\.lm-files-asset-tabs\s*\{[^}]*background:\s*var\(--lm-muted\)/);
  assert.doesNotMatch(main, /cloudCanvas\?\.canvasProjectId \?\?\s*\(!projectCanvas/);
});

test("compact asset workspace keeps type and source filters behind the LibTV filter trigger", () => {
  assert.match(panel, /const \[assetFiltersOpen, setAssetFiltersOpen\] = useState\(false\)/);
  assert.match(panel, /const assetFiltersRef = useRef\(null\)/);
  assert.match(panel, /const assetFiltersButtonRef = useRef\(null\)/);
  assert.match(panel, /ref=\{assetFiltersButtonRef\}[^>]*aria-label="筛选资产"[^>]*aria-haspopup="dialog"[^>]*aria-expanded=\{assetFiltersOpen\}/);
  assert.match(panel, /assetFiltersOpen \? \(\s*<div[^>]*id="lm-assets-filter-popover"[^>]*role="dialog"[^>]*aria-label="资产筛选条件"/);
  assert.match(panel, /id="lm-assets-filter-popover"[\s\S]*?aria-label="按类型筛选文件与资产"[\s\S]*?aria-label="按来源筛选资产"/);
  assert.match(panel, /event\.key === "Escape"[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopImmediatePropagation\?\.\(\)[\s\S]*?setAssetFiltersOpen\(false\)[\s\S]*?requestAnimationFrame\(\(\) => assetFiltersButtonRef\.current\?\.focus\(\)\)/);
  assert.match(panel, /window\.addEventListener\("keydown", escape, true\)/);
  assert.match(panel, /window\.removeEventListener\("keydown", escape, true\)/);
  assert.match(panel, /assetFiltersRef\.current\?\.contains\(event\.target\)[\s\S]*?setAssetFiltersOpen\(false\)/);
  assert.match(panel, /activeTab !== "assets" \|\| !open[\s\S]*?setAssetFiltersOpen\(false\)/);
  assert.match(shellStyles, /\.lm-files-filters\.is-assets\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 32px/);
  assert.match(shellStyles, /\.lm-assets-filter-popover\s*\{[^}]*position:\s*absolute/);
});

test("canvas media rows expose LibTV-style overflow actions without hiding locate", () => {
  assert.ok(fileRowSource.startsWith("const FileRow = memo("));
  assert.deepEqual(resolveCanvasFileRowMenuKeyAction({ key: "Tab" }), { handled: true, close: true, focus: "next" });
  assert.deepEqual(resolveCanvasFileRowMenuKeyAction({ key: "Tab", shiftKey: true }), { handled: true, close: true, focus: "previous" });
  assert.deepEqual(resolveCanvasFileRowMenuKeyAction({ key: "Escape" }), { handled: false });
  assert.match(fileRowSource, /const \[actionsOpen, setActionsOpen\] = useState\(false\)/);
  assert.match(fileRowSource, /actionsOpen \? "is-actions-open" : ""/);
  assert.match(fileRowSource, /aria-label=\{`更多操作 \$\{entry\.title\}`\}[^>]*aria-haspopup="menu"[^>]*aria-expanded=\{actionsOpen\}/);
  assert.match(fileRowSource, /ref=\{actionsButtonRef\}[^>]*disabled=\{inserting \|\| rebinding \|\| Boolean\(assetBusy\)\}/);
  assert.match(fileRowSource, /role="menu" aria-label=\{`\$\{entry\.title\} 操作`\}/);
  assert.match(fileRowSource, /role="menuitem"[^>]*onClick=\{\(\) => runAction\(\(\) => onRename\(entry\)\)\}[^>]*>重命名<\/button>/);
  assert.match(fileRowSource, /canDuplicate[^\n]*\?[\s\S]*?role="menuitem"[^>]*onClick=\{\(\) => runAction\(\(\) => onInsert\(entry\)\)\}[^>]*>复制<\/button>/);
  assert.match(fileRowSource, /canDownload[^\n]*\?[\s\S]*?role="menuitem"[^>]*onClick=\{\(\) => runAction\(\(\) => onDownload\(entry\)\)\}[^>]*>下载<\/button>/);
  assert.match(fileRowSource, /title="定位" aria-label=\{`定位 \$\{entry\.title\}`\}/);
  assert.match(fileRowSource, /className="lm-file-main" ref=\{fileMainButtonRef\}/);
  assert.match(fileRowSource, /ref=\{locateButtonRef\} title="定位"/);
  assert.match(fileRowSource, /event\.key === "Escape"[\s\S]*?actionsButtonRef\.current\?\.focus\(\);\s*setActionsOpen\(false\)/);
  assert.match(fileRowSource, /createPortal\([\s\S]*?document\.body/);
  assert.match(fileRowSource, /window\.getComputedStyle\(actionsAnchorRef\.current\)/);
  assert.match(fileRowSource, /Number\.parseFloat\(window\.getComputedStyle\(document\.body\)\.zoom\) \|\| 1/);
  assert.match(fileRowSource, /const popoverRect = popover\.getBoundingClientRect\(\)/);
  assert.match(fileRowSource, /left: left \/ uiScale, top: top \/ uiScale/);
  assert.match(fileRowSource, /"--lm-panel": computed\.getPropertyValue\("--lm-panel"\)/);
  assert.match(fileRowSource, /style=\{\{ \.\.\.actionsPosition\.theme, left: actionsPosition\.left/);
  assert.match(fileRowSource, /\["ArrowDown", "ArrowUp", "Home", "End"\]/);
  assert.match(fileRowSource, /resolveCanvasFileRowMenuKeyAction\(\{ key: event\.key, shiftKey: event\.shiftKey \}\)[\s\S]*?decision\.focus === "previous" \? fileMainButtonRef\.current : locateButtonRef\.current/);
  assert.match(fileRowSource, /focusTarget\?\.focus\(\);\s*if \(decision\.close\) setActionsOpen\(false\)/);
  assert.match(fileRowSource, /role="menuitemradio" aria-checked=\{!entry\.folder\}/);
  assert.doesNotMatch(fileRowSource, /<select title="移动到文件夹"/);
  assert.match(shellStyles, /\.lm-file-action-menu\s*\{[^}]*position:\s*fixed/);
  assert.match(shellStyles, /\.lm-file-row\.is-actions-open \.lm-file-actions\s*\{[^}]*visibility:\s*visible;[^}]*opacity:\s*1;/);
});

test("history asset scaling is bounded and independent from canvas zoom", () => {
  assert.equal(normalizeCanvasHistoryScale(), CANVAS_HISTORY_SCALE_DEFAULT);
  assert.equal(normalizeCanvasHistoryScale(Number.NaN), CANVAS_HISTORY_SCALE_DEFAULT);
  assert.equal(normalizeCanvasHistoryScale(-999), CANVAS_HISTORY_SCALE_MIN);
  assert.equal(normalizeCanvasHistoryScale(999), CANVAS_HISTORY_SCALE_MAX);
  assert.equal(stepCanvasHistoryScale(100, -1), 90);
  assert.equal(stepCanvasHistoryScale(100, 1), 110);
  assert.equal(stepCanvasHistoryScale(CANVAS_HISTORY_SCALE_MIN, -1), CANVAS_HISTORY_SCALE_MIN);
  assert.equal(stepCanvasHistoryScale(CANVAS_HISTORY_SCALE_MAX, 1), CANVAS_HISTORY_SCALE_MAX);

  assert.deepEqual(canvasHistoryScaleStyle(100), {
    "--lm-history-card-min-width": "250px",
    "--lm-history-preview-width": "48px",
    "--lm-history-preview-height": "44px",
    "--lm-history-row-min-height": "52px",
  });
  assert.match(shellStyles, /grid-template-columns:\s*repeat\(auto-fill, minmax\(min\(100%, var\(--lm-history-card-min-width, 250px\)\), 1fr\)\)/);
  assert.match(shellStyles, /width:\s*var\(--lm-history-preview-width, 48px\)/);
  assert.doesNotMatch(historyScaleSource, /getAppState|updateScene|scrollX|scrollY|zoom\.value/);
});

test("failed canvas runs stay visible as retryable history records without artifacts", () => {
  const failed = normalizeCanvasHistoryRun({
    id: "run-failed",
    runNo: 4,
    status: "failed",
    mediaKind: "video",
    failure: { failureCode: "provider_timeout", displayMessage: "供应商超时" },
    artifacts: [],
  }, 0, "video-node");
  assert.equal(failed.terminalFailure, true);
  assert.equal(failed.type, "video");
  assert.equal(failed.failureMessage, "供应商超时");
  assert.deepEqual(listCanvasFailedHistoryRuns([failed]).map((run) => [run.id, run.nodeKey]), [["run-failed", "video-node"]]);
  assert.deepEqual(listCanvasFailedHistoryRuns([{ ...failed, artifacts: [{ id: "artifact-1" }] }]), []);
});
