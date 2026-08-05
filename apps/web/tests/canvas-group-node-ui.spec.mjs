import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canvasConnectedVideoNodeIds,
  canvasSelectionContentNodeIds,
  canvasGroupRunnableNodeIds,
  normalizeCanvasGroupColor,
  renderCanvasGroupNodeBody,
  resolveCanvasBatchDownloadItems,
  resolveCanvasCurrentVideoDownloadItems,
  updateCanvasGroupData,
} from "../src/features/production-workbench/canvas/canvas-group-node.js";
import { canvasDocumentToX6Data } from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import { canvasAssetsFromGenerationHistory } from "../src/features/production-workbench/canvas/canvas-asset-library.js";
import { reconcileCanvasMediaDocumentSources } from "../src/features/production-workbench/canvas/canvas-media-node.js";

test("normalizes group colors to the supported swatch palette", () => {
  assert.equal(normalizeCanvasGroupColor("#A855F7"), "#a855f7");
  assert.equal(normalizeCanvasGroupColor("javascript:bad"), "#22c55e");
});

test("selects only runnable direct children for group batch execution", () => {
  const group = { id: "group-1", type: "group", data: { childNodeIds: ["image-1", "comment-1", "video-1"] } };
  const document = {
    nodes: [
      group,
      { id: "image-1", type: "ai-image" },
      { id: "comment-1", type: "comment" },
      { id: "video-1", type: "ai-video" },
    ],
  };
  assert.deepEqual(canvasGroupRunnableNodeIds(document, group), ["image-1", "video-1"]);
});

test("collects every downstream video connected to a script node", () => {
  const document = {
    nodes: [
      { id: "script-1", type: "script", data: { workflowNodes: [{ id: "workflow-shot", kind: "storyboard" }] } },
      { id: "asset-1", type: "ai-image", data: {} },
      { id: "workflow-shot", type: "ai-video", data: {} },
      { id: "video-1", type: "ai-video", data: {} },
      { id: "video-2", type: "video", data: { mediaKind: "video" } },
      { id: "child-shot", type: "ai-video", data: { workflowParentId: "script-1", workflowKind: "storyboard" } },
      { id: "unrelated-video", type: "ai-video", data: {} },
    ],
    edges: [
      { sourceNodeId: "script-1", targetNodeId: "asset-1" },
      { sourceNodeId: "asset-1", targetNodeId: "video-1" },
      { sourceNodeId: "video-1", targetNodeId: "video-2" },
    ],
  };

  assert.deepEqual(canvasConnectedVideoNodeIds(document, "script-1"), [
    "workflow-shot",
    "video-1",
    "video-2",
    "child-shot",
  ]);
});

test("flushes pending canvas saves before selected or grouped batch execution", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  for (const action of ["run-canvas-selection", "confirm-canvas-group-run"]) {
    const block = source.match(new RegExp(`if \\(action === "${action}"\\) \\{[\\s\\S]*?\\n  \\}`))?.[0] ?? "";
    assert.match(block, /await flushProjectCanvasSave\(workbench\)/);
    assert.doesNotMatch(block, /await saveProjectCanvasNow\(workbench\)/);
  }
});

test("batch download packages only currently displayed node videos", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('if (action === "download-canvas-selection")'),
    source.indexOf('if (action === "cancel-canvas-asset-transfer")'),
  );
  assert.doesNotMatch(handler, /loadCanvasBatchDownloadHistory/);
  assert.match(handler, /await downloadCanvasAssetArchive\(/);
  assert.match(handler, /canvasConnectedVideoNodeIds\(document, fallbackId\)/);
  assert.match(handler, /const items = resolveCanvasCurrentVideoDownloadItems\(document, requestedIds\)/);
  assert.match(handler, /renderWorkbenchChrome\(workbench\)/);
  assert.doesNotMatch(handler, /\brender\(workbench\)/);
});

test("renders a group layout menu with grid, horizontal, and vertical options", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /toggle-canvas-group-layout-menu/);
  assert.match(source, /arrange-canvas-group/);
  assert.match(source, /宫格排列/);
  assert.match(source, /水平排列/);
  assert.match(source, /垂直排列/);
  assert.match(source, /aria-haspopup", "menu/);
});

test("keeps group toolbar actions available while the workbench is busy", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const allowWhileBusy = source.slice(
    source.indexOf("const allowWhileBusy = new Set(["),
    source.indexOf("const videoSubmissionPreparationActions = new Set(["),
  );
  for (const action of [
    "toggle-canvas-group-layout-menu",
    "arrange-canvas-group",
    "run-canvas-group",
  ]) {
    assert.match(allowWhileBusy, new RegExp(`\"${action}\"`));
  }
});

test("keeps group action toolbar clicks out of blank-canvas dismissal", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const blankClickGuard = source.slice(
    source.indexOf("function isCanvasX6BlankClickTarget"),
    source.indexOf("function closeCanvasEditorWithoutRender"),
  );
  assert.match(blankClickGuard, /\.canvas-selection-action-toolbar/);
  assert.match(blankClickGuard, /eventPath\.some/);
  const surfaceSource = readFileSync(
    new URL("../src/features/new-canvas/index.js", import.meta.url),
    "utf8",
  );
  assert.match(surfaceSource, /canvas-context-menu, \.canvas-selection-action-toolbar/);
  assert.match(surfaceSource, /const onCanvasCellClick = \(event\) => \{\s*if \(canvasEventPathTarget\(event, "\[data-action\]"\)\) return;/);
});

test("dismisses Canvas context menus when clicking blank space", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const delegatedClickStart = source.indexOf('root.addEventListener("click", (event) => {');
  const delegatedClickGuard = source.slice(
    delegatedClickStart,
    source.indexOf("const quickAssetToggle", delegatedClickStart),
  );
  assert.match(
    delegatedClickGuard,
    /isCanvasX6InteractionTarget\(eventTarget, event\)\s*&& !isCanvasX6BlankClickTarget\(eventTarget, event\)\s*&& !actionTarget/,
  );
  const blankClickHandler = source.slice(
    source.indexOf("function closeCanvasEditorWithoutRender"),
    source.indexOf("function trackCanvasRightPanGesture"),
  );
  assert.match(blankClickHandler, /dismissCanvasSurfaceOverlays\(workbench\?\.ui/);
  assert.match(blankClickHandler, /selectionOnly: true/);
  const newCanvasSource = readFileSync(
    new URL("../src/features/new-canvas/index.js", import.meta.url),
    "utf8",
  );
  const renderSelection = newCanvasSource.slice(
    newCanvasSource.indexOf("const renderSelection = async () =>"),
    newCanvasSource.indexOf("const renderSidebar = async () =>"),
  );
  assert.match(renderSelection, /syncCanvasStageOverlays\(surface, template\.content\)/);
});

test("reapplies absolute child positions after X6 embeds group members", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  const grouping = source.slice(
    source.indexOf("export function applyCanvasGraphGrouping"),
    source.indexOf("export function detachCanvasGroupChildrenForRemoval"),
  );
  assert.match(grouping, /parent\.addChild\?\.\(cell, options\);/);
  assert.match(grouping, /embeddedPosition/);
  assert.match(grouping, /cell\.setPosition\?\.\(Number\(node\.x\), Number\(node\.y\), options\)/);
});

test("refreshes the whole graph after applying a group layout", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('if (action === "arrange-canvas-group")'),
    source.indexOf('if (action === "add-canvas-node-to-character-library")'),
  );
  assert.match(handler, /updateActiveCanvasDocument\(workbench, result\.document\);\s*workbench\.ui\.selectedCanvasNodeId = result\.groupId;\s*refreshCanvasWorkflowGraph\(workbench\);/);
  assert.doesNotMatch(handler, /refreshCanvasWorkflowNode\(workbench, result\.groupId\);/);
});

test("routes group execution through the outer workbench host", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf("onAction(event, { actionTarget: resolvedActionTarget"),
    source.indexOf("onInput(_event, context)"),
  );
  assert.match(handler, /const actionWorkbench = \["open-canvas-director"/);
  assert.doesNotMatch(handler, /actionTarget\.dataset\?\.action === "run-canvas-group"/);
  assert.doesNotMatch(handler, /if \(actionTarget\.dataset\?\.action === "arrange-canvas-group"\)/);
});

test("group execution configures every child model before building the batch", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf('if (action === "run-canvas-group")'),
    source.indexOf('if (action === "add-canvas-node-to-character-library")'),
  );
  assert.match(handler, /for \(const nodeId of nodeIds\) \{\s*document = ensureCanvasNodeConfiguredModel\(workbench, document, nodeId\);/);
  assert.ok(handler.indexOf("ensureCanvasNodeConfiguredModel") < handler.indexOf("buildCanvasGenerationBatchNodes"));
});

test("opens group execution confirmation before preparing child nodes", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const openingHandler = source.slice(
    source.indexOf('if (action === "run-canvas-group")'),
    source.indexOf('if (action === "close-canvas-group-run-confirm")'),
  );
  assert.match(openingHandler, /canvasGroupRunConfirm = \{ groupId, nodeIds \}/);
  assert.match(openingHandler, /renderWorkbenchChrome\(workbench\)/);
  assert.doesNotMatch(openingHandler, /ensureCanvasNodeConfiguredModel/);
  assert.doesNotMatch(openingHandler, /buildCanvasGenerationBatchNodes/);
  assert.doesNotMatch(openingHandler, /flushProjectCanvasSave/);
});

test("renders group execution confirmation inside the chrome-replaced global overlays", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/project-detail.js", import.meta.url),
    "utf8",
  );
  const globalOverlays = source.slice(
    source.indexOf("function renderGlobalOverlays"),
    source.indexOf("function countActiveTaskCenterTasks"),
  );
  assert.match(globalOverlays, /renderCanvasGroupRunConfirmModal\(ui\)/);
});

test("restores the latest generated image into its canvas node by node key", () => {
  const assets = canvasAssetsFromGenerationHistory({
    items: [{
      id: "run-1",
      nodeKey: "image-1",
      mediaKind: "image",
      artifacts: [{
        id: "artifact-1",
        storageObjectId: "storage-1",
        assetVersionId: "version-1",
        url: "https://example.test/generated.png",
      }],
    }],
  });
  const result = reconcileCanvasMediaDocumentSources({
    nodes: [{ id: "image-1", type: "ai-image", data: { mediaKind: "image", status: "queued" } }],
    edges: [],
  }, assets);

  assert.equal(assets[0].nodeKey, "image-1");
  assert.equal(result.changed, true);
  assert.deepEqual(result.document.nodes[0].data, {
    mediaKind: "image",
    status: "completed",
    storageObjectId: "storage-1",
    assetVersionId: "version-1",
    previewUrl: "https://example.test/generated.png",
    resultUrl: "https://example.test/generated.png",
    url: "https://example.test/generated.png",
  });
});

test("updates group title and color without changing document contracts", () => {
  const document = { nodes: [{ id: "group-1", type: "group", data: { title: "旧名称", childNodeIds: [] } }] };
  const next = updateCanvasGroupData(document, "group-1", { title: "镜头组", color: "#3b82f6" });
  assert.equal(next.nodes[0].data.title, "镜头组");
  assert.equal(next.nodes[0].data.color, "#3b82f6");
  assert.deepEqual(next.nodes[0].data.childNodeIds, []);
});

test("renders a minimal run group overlay", () => {
  const html = renderCanvasGroupNodeBody({
    id: "group-1",
    type: "group",
    data: { title: "动作镜头", color: "#f59e0b", childNodeIds: ["a", "b"] },
  });
  assert.match(html, /class="canvas-group-node-label">运行组</);
  assert.doesNotMatch(html, /canvas-group-node-header/);
  assert.doesNotMatch(html, /data-action=/);
});

test("labels script workflow groups with their batch scope and member count", () => {
  const html = renderCanvasGroupNodeBody({
    id: "group-assets",
    type: "group",
    data: {
      title: "资产批量生成",
      color: "#22c55e",
      childNodeIds: ["role-1", "scene-1", "prop-1"],
      scriptWorkflowGroupKind: "assets",
    },
  });
  assert.match(html, /is-script-workflow-group is-assets/);
  assert.match(html, /资产批量生成/);
  assert.match(html, /角色 · 场景 · 道具 · 3 个节点/);
  assert.doesNotMatch(html, /data-action=/);
});

test("expands a selected group and resolves only its currently displayed videos", () => {
  const document = {
    nodes: [
      { id: "group-1", type: "group", data: { childNodeIds: ["image-1", "video-1"] } },
      { id: "image-1", type: "source-image", data: { title: "角色图", storageObjectId: "storage-image" } },
      { id: "video-1", type: "ai-video", data: { title: "动作视频", videoUrl: "https://example.test/current.mp4" } },
    ],
  };
  assert.deepEqual(canvasSelectionContentNodeIds(document, ["group-1"]), ["image-1", "video-1"]);
  assert.deepEqual(resolveCanvasBatchDownloadItems(document, ["group-1"]), [
    {
      nodeId: "video-1",
      storageObjectId: "",
      url: "https://example.test/current.mp4",
      fileName: "动作视频",
      mediaKind: "video",
    },
  ]);
});

test("ignores historical videos, text outputs, and empty video nodes", () => {
  const document = {
    nodes: [
      { id: "group-1", type: "group", data: { childNodeIds: ["video-1", "video-2", "text-1"] } },
      { id: "video-1", type: "ai-video", data: { title: "镜头", resultVideoUrl: "https://example.test/current.mp4" } },
      { id: "video-2", type: "ai-video", data: { title: "空视频" } },
      { id: "text-1", type: "ai-text", data: { title: "旁白", resultText: "当前旁白" } },
    ],
  };
  const items = resolveCanvasBatchDownloadItems(document, ["group-1"], {
    historyItems: [
      {
        id: "run-video",
        nodeKey: "video-1",
        mediaKind: "video",
        artifacts: [
          { storageObjectId: "storage-video-1", metadata: { fileName: "镜头-1.mp4" } },
          { storageObjectId: "storage-video-2", metadata: { fileName: "镜头-2.mp4" } },
        ],
      },
      { id: "run-text", nodeKey: "text-1", mediaKind: "text", runNo: 1, outputSnapshot: { text: "历史旁白" } },
    ],
  });

  assert.deepEqual(items.map((item) => [item.nodeId, item.storageObjectId, item.url]), [
    ["video-1", "", "https://example.test/current.mp4"],
  ]);
});

test("resolves only the video currently displayed by a node", () => {
  const document = {
    nodes: [{
      id: "video-1",
      type: "ai-video",
      data: {
        title: "当前镜头",
        videoUrl: "https://example.test/current.mp4",
        resultUrl: "https://example.test/old.mp4",
      },
    }],
  };

  assert.deepEqual(resolveCanvasCurrentVideoDownloadItems(document, ["video-1"]), [{
    nodeId: "video-1",
    storageObjectId: "",
    url: "https://example.test/current.mp4",
    fileName: "当前镜头",
    mediaKind: "video",
  }]);
});

test("routes group and Director nodes through the X6 HTML shape", () => {
  const data = canvasDocumentToX6Data({
    nodes: [
      { id: "group-1", type: "group", data: { childNodeIds: [] } },
      { id: "director-1", type: "ai-director", data: {} },
      { id: "video-1", type: "ai-video", data: {} },
      { id: "audio-1", type: "source-audio", data: {} },
    ],
    edges: [],
  });
  assert.deepEqual(data.nodes.map((node) => node.shape), [
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
    "comic-ai-canvas-special-media-node",
  ]);
  assert.deepEqual(data.nodes.map((node) => node.zIndex), [-1, 2, 2, 2]);
  assert.equal(data.nodes.find((node) => node.id === "group-1").attrs.body.fill, "transparent");
});
