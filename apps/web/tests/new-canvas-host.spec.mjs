import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CANVAS_ASSET_DRAG_TYPE,
  CANVAS_STORYBOARD_CELL_DRAG_TYPE,
  canvasDropPosition,
  canvasExternalTransferPayload,
  createCanvasStoryboardCellDragPayload,
  disposeCanvasGraph,
  dismissCanvasSurfaceOverlays,
  hasCanvasExternalTransfer,
  mountNewCanvas,
  parseCanvasStoryboardCellDragPayload,
  resolveCanvasGraphNodeAtClientPoint,
  unmountNewCanvas,
} from "../src/features/new-canvas/index.js";
import { resolveNewCanvasHostUpdateOptionsForTest } from "../src/features/production-workbench/index.js";
import {
  createCanvasConfigLibraryController,
  renderCanvasConfigLibraryShell,
} from "../src/features/new-canvas/config-library-drawer.js";
import {
  renderCanvasSurfaceForHost,
  renderProjectDetail,
  resolveCanvasToolbarLayout,
} from "../src/features/production-workbench/project-detail.js";
import { renderNewCanvasLayout } from "../src/features/new-canvas/canvas-agent-panel.js";
import { renderNewCanvasChromeRail } from "../src/features/new-canvas/canvas-chrome.js";

test("new-canvas exposes an in-app mount lifecycle and does not require a DOM for no-op targets", async () => {
  assert.equal(await mountNewCanvas(null), null);
  assert.equal(await unmountNewCanvas(null), false);
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /attachShadow/);
  assert.match(source, /dataset\.newCanvasMounted/);
  assert.match(source, /data-new-canvas-mount|new-canvas-root/);
  assert.doesNotMatch(source, /apps\/web\/new-canvas/);
  assert.match(source, /nextGraphMount\.replaceWith\(currentGraphMount\)/);
  assert.match(source, /currentGraphMount\.closest\?\.\("\.canvas-stage"\)/);
  assert.match(source, /if \(stage && graph\) \{[\s\S]*?syncCanvasNodeActionToolbar\(stage, stage, graph, workbench\.ui\.selectedCanvasNodeId\);[\s\S]*?syncCanvasNodeEditor\(stage, stage, graph, workbench\.ui\.selectedCanvasNodeId\);/);
  assert.match(source, /syncCanvasNodeActionToolbar\(currentStage, nextStage, graph, workbench\.ui\.selectedCanvasNodeId\);[\s\S]*?syncCanvasNodeEditor\(currentStage, nextStage, graph, workbench\.ui\.selectedCanvasNodeId\);/);
  assert.match(source, /const editorHtml = editorTemplate\?\.innerHTML\?\.trim\?\.\(\) \?\? ""/);
  assert.match(source, /showCanvasGraphMountFailure\(surface\)/);
  assert.match(source, /action === "retry-canvas-x6-mount"[\s\S]*?void render\(\)/);
  assert.match(source, /createCanvasAgentController/);
  assert.match(source, /data-agent-media-composer-resize/);
  assert.match(source, /mediaComposerResize\.startHeight \+ mediaComposerResize\.startY - Number\(event\.clientY \?\? 0\)/);
  assert.match(source, /"--canvas-agent-media-composer-height", `\$\{nextHeight\}px`/);
  assert.match(source, /async submitAgentPrompt\(input = \{\}\) \{[\s\S]*?await agentController\.stagePrompt\(input\);[\s\S]*?await agentReady;[\s\S]*?submitPrompt\(input, \{ staged: true \}\)/);
  assert.match(source, /let renderToken = 0/);
  assert.match(source, /token !== renderToken/);
  assert.match(source, /CANVAS_STYLE_RETRY_DELAYS_MS = \[250, 500, 1_000, 2_000, 4_000, 8_000\]/);
  assert.match(source, /newCanvasCriticalStyle/);
  assert.match(source, /\.new-canvas-root \{ visibility: hidden !important; \}/);
  assert.match(source, /newCanvasStyleGate/);
  assert.match(source, /loadingGate\.innerHTML = "<span><\/span><span><\/span><span><\/span>"/);
  assert.match(source, /\[data-new-canvas-style-gate\] > \* \{ visibility: hidden; \}/);
  assert.match(source, /pendingLinks\.delete\(link\)/);
  assert.match(source, /pendingLinks\.size === 0[\s\S]*?criticalStyle\.remove\(\)[\s\S]*?loadingGate\.remove\(\)/);
  assert.match(source, /link\.addEventListener\("load", loaded\)/);
  assert.match(source, /link\.addEventListener\("error", retry\)/);
  assert.match(source, /Math\.min\(retryAttempt - 1, CANVAS_STYLE_RETRY_DELAYS_MS\.length - 1\)/);
  assert.doesNotMatch(source, /retryAttempt >= CANVAS_STYLE_RETRY_DELAYS_MS\.length/);
  assert.match(source, /new-canvas-style-retry/);
  assert.match(source, /clearTimeout\(timer\)/);
  assert.match(source, /disposeCanvasGraph\(mountedGraph\)/);
  assert.match(source, /addEventListener\("dblclick", onDoubleClick, true\)/);
  assert.match(source, /addEventListener\("click", onClick, true\)/);
  assert.match(source, /removeEventListener\("click", onClick, true\)/);
  assert.match(source, /getAttribute\?\.\("data-cell-id"\)/);
  assert.match(source, /nodeId === "__comic-ai-canvas-editor-overlay__" \? "" : nodeId/);
  assert.match(source, /event\.target\?\.closest\?\.\("\.canvas-node-editor"\)/);
  assert.match(source, /event\.target\?\.closest\?\.\("input, textarea, select, \[contenteditable='true'\], \[role='textbox'\], \.canvas-prompt-mention-menu"\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?return/);
  assert.match(source, /__canvasDirectorHandled/);
});

test("new-canvas clears X6 cells and listeners before disposing a graph", () => {
  const calls = [];
  assert.equal(disposeCanvasGraph({
    off() { calls.push("off"); },
    clearCells(options) { calls.push(["clearCells", options]); },
    dispose() { calls.push("dispose"); },
  }), true);
  assert.deepEqual(calls, ["off", ["clearCells", { silent: true }], "dispose"]);
  assert.equal(disposeCanvasGraph(null), false);
});

test("new-canvas forwards blank X6 connection drops to its host", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /workbench\.onCanvasBlankConnection = \(input\) => \{[\s\S]*?suppressCanvasBlankClickUntil = Date\.now\(\) \+ 500;[\s\S]*?context\.onCanvasBlankConnection\?\.\(input/);
});

test("Canvas resolves a clicked X6 node from graph coordinates", () => {
  const graph = {
    clientToLocal: () => ({ x: 180, y: 120 }),
    getNodes: () => [
      { id: "behind", getBBox: () => ({ x: 0, y: 0, width: 320, height: 240 }) },
      { id: "top", getBBox: () => ({ x: 140, y: 90, width: 160, height: 120 }) },
      { id: "editor", getData: () => ({ canvasTransientEditor: true }), getBBox: () => ({ x: 140, y: 90, width: 160, height: 120 }) },
    ],
  };
  assert.equal(resolveCanvasGraphNodeAtClientPoint(graph, 600, 400), "top");
});

test("Canvas keeps the selected node editor open after an X6 node drag", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /let suppressCanvasBlankClickUntil = 0;/);
  assert.match(source, /if \(distance > 4 && pointerNodeId\) \{[\s\S]*?suppressCanvasBlankClickUntil = Date\.now\(\) \+ 500;/);
  assert.match(source, /canvasStage && !interactive && Date\.now\(\) < suppressCanvasBlankClickUntil/);
});

test("Canvas handles panorama drags before generic node control interception", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const pointerDownBlock = source.match(/const onPointerDown = \(event\) => \{[\s\S]*?const onPointerMove/)?.[0] ?? "";
  const panoramaDragIndex = pointerDownBlock.indexOf('const panoramaViewer = event.target?.closest?.("[data-panorama-drag-target]");');
  const interactiveGuardIndex = pointerDownBlock.indexOf("if (isCanvasNodeInteractiveTarget(event)) return;");

  assert.ok(panoramaDragIndex >= 0);
  assert.ok(interactiveGuardIndex > panoramaDragIndex);
  assert.match(pointerDownBlock, /panoramaViewer\.setPointerCapture\?\.\(event\.pointerId\)/);
});

test("Canvas panorama observation stays local to the preview", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const pointerUpBlock = source.match(/const onPointerUp = \(event\) => \{[\s\S]*?const onWheel/)?.[0] ?? "";
  const wheelBlock = source.match(/const onWheel = \(event\) => \{[\s\S]*?const onPanoramaViewChange/)?.[0] ?? "";
  const keyboardHandler = source.match(/function handleCanvasPanoramaKeydown[\s\S]*?\n\}/)?.[0] ?? "";

  assert.doesNotMatch(pointerUpBlock, /commitCanvasPanoramaView|void render\(\)/);
  assert.doesNotMatch(wheelBlock, /commitCanvasPanoramaView/);
  assert.doesNotMatch(keyboardHandler, /commitCanvasPanoramaView|void render\(\)/);
});

test("Canvas panorama interaction never requests browser fullscreen", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const fullscreenBranch = source.match(/if \(action === "toggle-canvas-panorama-fullscreen"\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.doesNotMatch(fullscreenBranch, /requestFullscreen|exitFullscreen/);
});

test("new Canvas host reports bounded frontend errors and removes telemetry listeners", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /reportCanvasFrontendError/);
  assert.match(source, /addEventListener\?\.\("unhandledrejection"/);
  assert.match(source, /removeEventListener\?\.\("unhandledrejection"/);
  assert.match(source, /reportedFrontendErrorKinds\.has/);
  assert.match(source, /visualViewport/);
  assert.match(source, /orientationchange/);
  assert.match(source, /--new-canvas-viewport-height/);
});

test("new Canvas commits a typed zoom percentage with Enter", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const keydownBlock = source.match(/const onKeydown = \(event\) => \{[\s\S]*?const onPointerDown/)?.[0] ?? "";
  assert.match(keydownBlock, /data-canvas-zoom-value-input/);
  assert.match(keydownBlock, /event\.key === "Enter"/);
  assert.match(keydownBlock, /context\.onChange\?\./);
});

test("new Canvas cancels a pending blank connection with Escape", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const keydownBlock = source.match(/const onKeydown = \(event\) => \{[\s\S]*?const onPointerDown/)?.[0] ?? "";

  assert.match(keydownBlock, /canvasContextMenu\?\.mode === "connection"/);
  assert.match(keydownBlock, /workbench\.ui\.canvasContextMenu = null/);
  assert.match(keydownBlock, /settleCanvasGraphBlankConnectionDraft\(graph, \{ document: workbench\.ui\.canvasDocument \}\)/);
  assert.match(keydownBlock, /void renderInteraction\(\)/);
});

test("new-canvas renders the existing production-workbench Canvas surface", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasProjects: [{ id: "canvas-test", title: "最近画布" }],
      canvasRecentProjectIds: ["canvas-test"],
      canvasDocument: {
        nodes: [],
        edges: [],
        viewport: { zoom: 1, x: 0, y: 0 },
      },
    },
  });
  assert.match(html, /class="canvas-panel"/);
  assert.match(html, /data-canvas-x6-mount/);
  assert.match(html, /data-action="toggle-canvas-zoom-menu"[^>]*data-canvas-zoom-trigger/);
  assert.doesNotMatch(html, /class="canvas-zoom-slider"|type="range"[^>]*data-viewport-patch="zoom-value"/);
  assert.match(html, /data-action="toggle-canvas-sidebar"/);
  assert.match(html, /class="canvas-sidebar"[^>]*style="display:none"/);
  assert.doesNotMatch(html, /class="canvas-collapse"/);
  assert.match(html, /data-action="arrange-canvas-nodes"/);
  assert.match(html, /data-action="toggle-canvas-minimap"/);
  assert.match(html, /data-action="toggle-canvas-edges"/);
  assert.match(html, /data-action="toggle-canvas-snap"[^>]*data-viewport-patch="toggle-snap"/);
  assert.doesNotMatch(html, /class="canvas-command-tools"/);
  assert.doesNotMatch(html, /class="canvas-recent-tabs"/);
  assert.doesNotMatch(html, />最近画布<\/button>/);
  assert.match(html, /class="canvas-empty-quick-start"/);
  assert.match(html, /data-node-kind="ai-text"/);
  assert.match(html, /data-node-kind="ai-image"/);
  assert.doesNotMatch(html, /template-comment|data-node-kind="comment"/);
});

test("a selected Canvas group never opens a generation editor", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      selectedCanvasNodeId: "group-1",
      canvasEditorOpen: true,
      canvasDocument: {
        nodes: [{
          id: "group-1",
          type: "group",
          position: { x: 100, y: 120 },
          size: { width: 600, height: 420 },
          data: { title: "节点分组", childNodeIds: [] },
        }],
        edges: [],
        viewport: { zoom: 1, x: 0, y: 0 },
      },
    },
  });
  assert.doesNotMatch(html, /canvas-node-editor generation-editor/);
});

test("Canvas host actions update the mounted surface without redrawing the workbench shell", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const hostSource = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const deleteCaptureSource = source.slice(
    source.indexOf('if (action === "delete-canvas-director-capture")'),
    source.indexOf('if (action === "toggle-canvas-audio-play"'),
  );
  assert.match(source, /workbench: mountedWorkbench/);
  assert.match(source, /\["open-canvas-director", "sync-canvas-director-frame", "export-canvas-director-video", "add-canvas-node-to-character-library"\]/);
  assert.match(source, /"export-canvas-director-video",\s*"delete-canvas-director-capture",/);
  assert.match(source, /runNewCanvasHostAction\(actionWorkbench, \(scopedWorkbench\) => handleAction\(scopedWorkbench, actionTarget\), updateOptions\)/);
  assert.doesNotMatch(deleteCaptureSource, /window\.confirm/);
  assert.match(deleteCaptureSource, /canvasDirectorCaptureDeleteTarget = \{[\s\S]*?nodeId,[\s\S]*?artifactId,[\s\S]*?mediaKind:/);
  assert.match(deleteCaptureSource, /action === "confirm-canvas-director-capture-delete"[\s\S]*?updateActiveCanvasDocument/);
  assert.match(deleteCaptureSource, /await saveCanvasDirectorCaptureDeletion\(workbench, \{ nodeId, artifactId \}\)[\s\S]*?refreshCanvasWorkflowNode\(workbench, nodeId\)/);
  assert.match(deleteCaptureSource, /已删除导演台[\s\S]*?删除失败/);
  assert.match(source, /function updateNewCanvasSurfaceForHostAction\(workbench\)/);
  assert.match(source, /if \(updateNewCanvasSurfaceForHostAction\(workbench\)\) return;/);
  assert.match(source, /if \(isCanvasX6InteractionTarget\(eventTarget, event\)\) \{\s*return;\s*\}/);
  assert.match(source, /surfaceOnly: true/);
  assert.match(hostSource, /\.x6-node, \.canvas-x6-special-node/);
  const selectionHandler = hostSource.match(/workbench\.onCanvasNodeSelected = \(nodeId\) => \{[\s\S]*?\n      \};/)?.[0] ?? "";
  assert.match(selectionHandler, /sourceWorkbench\.onCanvasNodeSelected\(nodeId\)/);
  assert.match(selectionHandler, /void renderSelection\(\)/);
  assert.doesNotMatch(selectionHandler, /agentController\.syncPanel\(\)/);
  assert.match(hostSource, /if \(next\.ui && next\.ui !== workbench\.ui\) Object\.assign\(workbench\.ui, next\.ui, \{ canvasProjectView: "detail" \}\);/);
  assert.doesNotMatch(hostSource, /if \(next\.ui\) workbench\.ui = \{/);
  assert.match(hostSource, /canvasNodeId !== workbench\.ui\.selectedCanvasNodeId[\s\S]*?workbench\.onCanvasNodeSelected\?\.\(canvasNodeId\)/);
  assert.match(hostSource, /classList\?\.contains\?\.\("x6-node"\)[\s\S]*?getAttribute\?\.\("data-cell-id"\)/);
  assert.match(hostSource, /if \(nodeId \|\| isCanvasX6Event\(event\)/);
  assert.doesNotMatch(hostSource, /const applyViewportToggle = \(target\) =>/);
  assert.doesNotMatch(hostSource, /graph\?\.hideGrid\?\.\(\)/);
  assert.doesNotMatch(hostSource, /updateCanvasViewport\(canvasDocument, patch\)/);
  assert.match(hostSource, /const applySnapPreference = \(\) =>/);
  assert.match(hostSource, /applyCanvasGraphViewportPreferences\(graph, nextDocument\.viewport\)/);
  assert.match(hostSource, /action === "toggle-canvas-snap"\) \{\s*event\.preventDefault\?\.\(\);\s*event\.stopPropagation\(\);[\s\S]*?renderInteraction\(\)/);
  assert.match(hostSource, /classList\?\.toggle\?\.\("active", snapEnabled\)/);
  assert.match(hostSource, /setAttribute\?\.\("aria-label", snapEnabled \? "关闭网格吸附" : "开启网格吸附"\)/);
  assert.match(hostSource, /const applyCanvasArrangement = \(\) =>/);
  assert.match(hostSource, /action === "arrange-canvas-nodes"\) \{\s*event\.preventDefault\?\.\(\);\s*event\.stopPropagation\(\);\s*applyCanvasArrangement\(\)/);
  assert.match(hostSource, /event\.altKey && event\.shiftKey[\s\S]*?applyCanvasArrangement\(\)/);
  assert.match(hostSource, /const applyInteractionMode = \(target\) =>/);
  assert.match(hostSource, /event\.stopPropagation\(\);\s*return;/);
  assert.match(source, /selectionOnly: true/);
});

test("Canvas node controls refresh only their target X6 node", () => {
  const workbench = {
    ui: {
      canvasPromptReferencePicker: {
        nodeId: "image-1",
        selectedId: "asset-1",
        items: [{ id: "asset-1", referenceType: "asset" }],
      },
    },
  };
  for (const action of [
    "set-canvas-storyboard-grid-mode",
    "set-canvas-panorama-mode",
    "set-canvas-video-generation-mode",
    "select-canvas-model",
    "run-canvas-node",
  ]) {
    assert.deepEqual(
      resolveNewCanvasHostUpdateOptionsForTest(workbench, { dataset: { action, nodeId: "node-1" } }),
      { nodeOnly: true, nodeId: "node-1" },
    );
  }
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(workbench, {
    dataset: { action: "select-generation-field-option", nodeId: "node-1", scope: "canvas" },
  }), { nodeOnly: true, nodeId: "node-1" });
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(workbench, {
    dataset: { action: "confirm-canvas-prompt-reference" },
  }), { nodeOnly: true, nodeId: "image-1" });
  workbench.ui.canvasPromptReferencePicker = {
    nodeId: "image-1",
    selectedId: "source-1",
    items: [{ id: "source-1", referenceType: "node" }],
  };
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(workbench, {
    dataset: { action: "confirm-canvas-prompt-reference" },
  }), {});
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(workbench, {
    dataset: { nodeId: "node-1" },
    matches: (selector) => selector.includes("[data-canvas-upload-input]"),
  }), { nodeOnly: true, nodeId: "node-1" });

  for (const action of ["extract-canvas-storyboard-cell", "duplicate-canvas-node", "delete-canvas-node", "run-canvas-group"]) {
    assert.deepEqual(
      resolveNewCanvasHostUpdateOptionsForTest(workbench, { dataset: { action, nodeId: "node-1" } }),
      {},
    );
  }
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(workbench, {
    dataset: { nodeId: "node-1" },
    matches: (selector) => selector.includes("[data-canvas-generation-reference-input]"),
  }), {});
  const mountedWorkbench = {
    ...workbench,
    newCanvasMount: { shadowRoot: { contains: () => true } },
  };
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(mountedWorkbench, {
    dataset: { action: "close-canvas-image-fullscreen", nodeId: "node-1" },
  }), { surfaceOnly: true });
  for (const action of [
    "toggle-canvas-add-menu",
    "toggle-canvas-zoom-menu",
    "toggle-canvas-minimap",
    "toggle-canvas-edges",
    "set-canvas-edge-style",
    "set-canvas-viewport",
  ]) {
    assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(mountedWorkbench, {
      dataset: { action },
    }), { controlsOnly: true });
  }
  for (const action of ["toggle-canvas-sidebar", "set-canvas-sidebar-mode", "set-canvas-asset-media-filter"]) {
    assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(mountedWorkbench, {
      dataset: { action },
    }), { sidebarOnly: true });
  }
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(mountedWorkbench, {
    dataset: {},
    matches: (selector) => selector.includes("[data-canvas-asset-search]"),
  }), { sidebarOnly: true });
  assert.deepEqual(resolveNewCanvasHostUpdateOptionsForTest(mountedWorkbench, {
    dataset: { action: "back-to-canvas-projects" },
  }), {});

  const hostSource = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const nodeRender = hostSource.match(/const renderNode = async \(nodeId\) => \{[\s\S]*?const applyInteractionMode/)?.[0] ?? "";
  assert.match(nodeRender, /refreshCanvasWorkflowNode\(workbench, normalizedNodeId\)/);
  assert.doesNotMatch(nodeRender, /refreshCanvasWorkflowGraph/);
  assert.match(hostSource, /if \(next\.nodeOnly === true\) return renderNode\(next\.nodeId\)/);
  assert.match(hostSource, /if \(next\.sidebarOnly === true\) return renderSidebar\(\)/);
  assert.match(hostSource, /if \(next\.controlsOnly === true\) return renderControls\(\)/);
  assert.match(hostSource, /if \(action === "set-canvas-interaction-mode"\) \{[\s\S]*?void renderControls\(\);/);
  assert.doesNotMatch(hostSource, /if \(action === "set-canvas-interaction-mode"\) \{[^}]*void renderInteraction\(\);/);
  assert.match(hostSource, /currentStage\.classList\.toggle\("is-canvas-hand-mode", nextStage\.classList\.contains\("is-canvas-hand-mode"\)\)/);
  assert.match(hostSource, /currentStage\.classList\.toggle\("is-canvas-move-mode", nextStage\.classList\.contains\("is-canvas-move-mode"\)\)/);
  assert.match(hostSource, /currentChromeRail\.replaceWith\(nextChromeRail\)/);
  assert.match(hostSource, /if \(next\.surfaceOnly === true\) return render\(\)/);
  assert.match(hostSource, /event\.__newCanvasHandled = true;[\s\S]*?event\.preventDefault\?\.\(\);[\s\S]*?context\.onAction/);
  assert.match(hostSource, /\.canvas-markdown-fullscreen/);
  assert.match(hostSource, /\[data-canvas-video-fullscreen\]/);
  assert.match(hostSource, /\.canvas-inline-toast/);

  const chromeSource = readFileSync(new URL("../src/features/new-canvas/canvas-chrome.js", import.meta.url), "utf8");
  assert.match(chromeSource, /title="移动"/);
  assert.match(chromeSource, /title="抓手工具"/);
  const chromeCss = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(chromeCss, /\.new-canvas-chrome-rail :is\(button\[title\], summary\[title\]\)::after/);
  assert.match(chromeCss, /\.new-canvas-chrome-rail :is\(button\[title\], summary\[title\]\):hover::after/);
  assert.match(chromeCss, /\.new-canvas-root \.canvas-zoom-tools,[\s\S]*?\.new-canvas-root \.new-canvas-chrome-rail/);
  assert.match(chromeCss, /\.new-canvas-root \.new-canvas-chrome-tool\.is-active/);
  assert.match(chromeCss, /\.new-canvas-chrome-rail\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?left:\s*50%;/);
  assert.match(chromeCss, /\.new-canvas-chrome-tool\s*\{[\s\S]*?width:\s*2\.35rem;[\s\S]*?height:\s*2\.35rem;/);
  assert.match(chromeCss, /\.new-canvas-minimap\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*calc\(var\(--new-canvas-sidebar-width, 0px\) \+ 1rem\);[\s\S]*?bottom:\s*calc\(0\.8rem \+ 3\.2rem/);

  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /root\.addEventListener\("click", \(event\) => \{\s*if \(event\.__newCanvasHandled === true\) return;/);
  const actionScope = workbenchSource.match(/async function runNewCanvasHostAction[\s\S]*?function updateMountedNewCanvasSurface/)?.[0] ?? "";
  assert.match(workbenchSource, /const newCanvasHostActionOptions = new WeakMap\(\)/);
  assert.match(actionScope, /const scopedWorkbench = new Proxy\(workbench, \{\}\)/);
  assert.match(actionScope, /newCanvasHostActionOptions\.set\(scopedWorkbench, \{ \.\.\.options \}\)/);
  assert.doesNotMatch(actionScope, /newCanvasHostActions|newCanvasHostActionDepth/);
  const pollingSource = workbenchSource.match(/async function runTaskCenterPolling[\s\S]*?function taskCenterOverlappingWatermark/)?.[0] ?? "";
  assert.match(pollingSource, /const affectedCanvasNodeIds = new Set\(\)/);
  assert.match(pollingSource, /nodeOnly: true, nodeId/);

  const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(graphSource, /editor\?\.addEventListener\?\.\("wheel", \(event\) => event\.stopPropagation\(\), \{ passive: true \}\)/);
  const nodeRefresh = graphSource.match(/export function refreshCanvasWorkflowNode[\s\S]*?export function classifyCanvasNodeMotion/)?.[0] ?? "";
  assert.match(nodeRefresh, /cell\.setPosition/);
  assert.match(nodeRefresh, /cell\.setSize/);
  assert.match(nodeRefresh, /if \(!portsMatch\) cell\.setProp\?\.\("ports", nextNode\.ports\)/);
  assert.match(nodeRefresh, /cell\.setZIndex/);
});

test("X6 HTML node cards leave dragging and ports to the graph surface", () => {
  const css = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(css, /\.canvas-x6-special-node :where\(button, input, textarea, select, a, \[role="application"\]\)\s*\{\s*pointer-events:\s*auto;/);
  assert.match(css, /\.new-canvas-root \.x6-port,[\s\S]*?\[magnet="true"\]\s*\{\s*pointer-events:\s*auto;/);
});

test("Canvas project assets use an independent source-project selector", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "project",
      canvasAssetProjectId: "project-b",
      canvasAssetProjects: [
        { id: "project-a", name: "项目 A" },
        { id: "project-b", name: "项目 B" },
      ],
      canvasAssetProjectAssets: [{
        id: "library:project:style-asset",
        source: "project",
        kind: "image",
        title: "项目风格参考",
        assetVersionId: "f4dbb474-66ca-4bc9-b7ec-1978d32740a4",
      }],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /data-canvas-asset-project/);
  assert.match(html, /data-canvas-project-asset-file/);
  assert.match(html, /data-action="trigger-canvas-project-asset-upload"/);
  assert.match(html, /value="project-b" selected/);
  assert.match(html, />项目 B<\/option>/);
  assert.match(html, /data-action="use-canvas-library-asset-as-style-reference"/);
  assert.match(html, /data-action="save-canvas-project-asset-to-global"/);
  assert.match(html, /项目风格参考/);
});

test("Canvas asset sources render in a desktop waterfall with bounded column controls", () => {
  const baseUi = {
    selectedCanvasProjectId: "canvas-test",
    canvasSidebarMode: "assets",
    canvasSidebarCollapsed: false,
    canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
  };
  const defaultHtml = renderCanvasSurfaceForHost({
    ui: {
      ...baseUi,
      canvasAssetSource: "global",
      canvasLibraryAssets: [{ id: "library:global:asset-1", title: "全局参考", kind: "image" }],
    },
  });
  assert.match(defaultHtml, /--canvas-asset-columns:3;--canvas-sidebar-width:354px/);
  assert.match(defaultHtml, /class="canvas-element-list is-asset-waterfall"/);
  assert.match(defaultHtml, /data-action="set-canvas-asset-layout-columns"/);
  assert.match(defaultHtml, /<output aria-live="polite">3<\/output>/);

  const minimumHtml = renderCanvasSurfaceForHost({
    ui: { ...baseUi, canvasAssetSource: "outputs", canvasAssetLayoutColumns: 2 },
  });
  assert.match(minimumHtml, /--canvas-asset-columns:2;--canvas-sidebar-width:264px/);
  assert.match(minimumHtml, /data-canvas-asset-layout-columns="-1"[^>]*disabled/);

  const maximumHtml = renderCanvasSurfaceForHost({
    ui: { ...baseUi, canvasAssetSource: "drama", canvasAssetLayoutColumns: 6 },
  });
  assert.match(maximumHtml, /--canvas-asset-columns:6;--canvas-sidebar-width:708px/);
  assert.match(maximumHtml, /data-canvas-asset-layout-columns="1"[^>]*disabled/);

  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /Math\.min\(6, Math\.max\(2, current \+ direction\)\)/);

  const workbenchCss = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  assert.match(workbenchCss, /\.canvas-element-list\.is-asset-waterfall > \.canvas-history-item\s*{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*break-inside: avoid;/s);
  assert.match(workbenchCss, /\.canvas-element-list\.is-asset-waterfall > \.canvas-history-item > \.canvas-asset-actions\s*{[^}]*justify-content: flex-end;/s);
});

test("Canvas asset sources incrementally render waterfall cards", () => {
  const assets = Array.from({ length: 49 }, (_, index) => ({
    id: `library:global:asset-${index + 1}`,
    title: `全局素材 ${index + 1}`,
    kind: "image",
  }));
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasLibraryAssets: assets,
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /全局素材 48/);
  assert.doesNotMatch(html, /全局素材 49/);
  assert.match(html, /data-canvas-asset-load-more-sentinel/);
  assert.match(html, /data-canvas-asset-total="49"/);

  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /new globalThis\.IntersectionObserver/);
  assert.match(workbenchSource, /rootMargin: "300px"/);
  assert.match(workbenchSource, /current \+ 48/);
});

test("Canvas drama images reuse their stable project asset version as a style reference", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "drama",
      importedAssets: {
        scene: [{
          id: "drama-scene-asset",
          label: "短剧场景参考",
          latestVersion: { id: "a839331b-27cc-4ba5-bb2b-a8cbe7fc4875", metadata: { mimeType: "image/png" } },
        }],
      },
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /短剧场景参考/);
  assert.match(html, /data-action="use-canvas-library-asset-as-style-reference"/);
});

test("Canvas drama drawer keeps project, episode, and asset state inside the Canvas surface", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "drama",
      canvasDramaDrawerOpen: true,
      canvasDramaProjectId: "project-a",
      canvasDramaEpisodeId: "episode-a",
      canvasAssetProjects: [{ id: "project-a", name: "项目 A" }],
      canvasDramaEpisodes: [{ id: "episode-a", title: "第 1 集" }],
      canvasDramaAssets: [{ id: "asset-a", assetType: "role", name: "角色 A", description: "主角" }],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /data-action="toggle-canvas-drama-drawer"/);
  assert.match(html, /id="canvas-drama-asset-drawer"/);
  assert.match(html, /data-canvas-drama-project/);
  assert.match(html, /data-canvas-drama-episode/);
  assert.match(html, /data-canvas-drama-asset-type/);
  assert.match(html, /data-canvas-drama-asset-name/);
  assert.match(html, /data-action="create-canvas-drama-asset"/);
  assert.match(html, /data-canvas-drama-asset-file/);
  assert.match(html, /data-action="trigger-canvas-drama-asset-import"/);
  assert.match(html, /data-canvas-drama-asset-description/);
  assert.match(html, /data-action="save-canvas-drama-asset-description"/);
  assert.match(html, /data-canvas-drama-asset-fixed-image-file/);
  assert.match(html, /data-action="trigger-canvas-drama-asset-fixed-image-upload"/);
  assert.match(html, /data-action="clear-canvas-drama-asset-fixed-image"/);
  assert.match(html, /data-action="delete-canvas-drama-asset"/);
  assert.match(html, /data-action="clear-canvas-drama-asset-category"/);
  assert.match(html, /角色 A/);
});

test("Canvas project, drama, and output cards expose their tag editing controls", () => {
  const baseUi = {
    selectedCanvasProjectId: "canvas-test",
    canvasSidebarMode: "assets",
    canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
  };
  const projectHtml = renderCanvasSurfaceForHost({
    ui: {
      ...baseUi,
      canvasAssetSource: "project",
      canvasAssetProjectAssets: [{ id: "project-asset", assetId: "project-asset", source: "project", title: "项目场景", kind: "image", tags: ["场景"] }],
    },
  });
  const dramaHtml = renderCanvasSurfaceForHost({
    ui: {
      ...baseUi,
      canvasAssetSource: "drama",
      importedAssets: { scene: [{ id: "drama-asset", label: "短剧场景", latestVersion: { metadata: { tags: ["短剧"] } } }] },
    },
  });
  const outputHtml = renderCanvasSurfaceForHost({
    ui: {
      ...baseUi,
      canvasAssetSource: "outputs",
      canvasAssets: [{ id: "output-asset", artifactId: "output-artifact", title: "生成产物", kind: "image", tags: ["输出"] }],
    },
  });
  assert.match(projectHtml, /data-action="edit-canvas-library-asset-tags"/);
  assert.match(dramaHtml, /data-action="edit-canvas-library-asset-tags"/);
  assert.match(outputHtml, /data-action="edit-canvas-library-asset-tags"[^>]*data-asset-source="outputs"/);
});

test("Canvas asset tag editor supports inline add and individual removal", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasAssetTagEditorKey: "global:library:global:asset-1",
      canvasLibraryAssets: [{ id: "library:global:asset-1", assetId: "asset-1", title: "全局角色", kind: "image", tags: ["主角"] }],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
    session: { user: { actorType: "owner" } },
  });
  assert.match(html, /class="canvas-asset-tag-editor"/);
  assert.match(html, /data-action="remove-canvas-library-asset-tag"/);
  assert.match(html, /data-canvas-asset-tag-input[^>]*data-canvas-asset-editor-key="global:library:global:asset-1"/);

  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(workbenchSource, /event\.key === "Enter" && !event\.isComposing/);
  assert.match(workbenchSource, /root\.addEventListener\("focusout"/);
  assert.match(workbenchSource, /commitCanvasAssetTagInput/);
});

test("Canvas global assets expose deletion only to the primary user", () => {
  const context = {
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasLibraryAssets: [{ id: "library:global:asset-1", assetId: "asset-1", title: "全局角色", kind: "image", status: "可用", tags: ["主角"] }],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  };
  const ownerHtml = renderCanvasSurfaceForHost({ ...context, session: { user: { actorType: "owner" } } });
  const memberHtml = renderCanvasSurfaceForHost({ ...context, session: { user: { actorType: "team_member" } } });
  assert.match(ownerHtml, /data-action="delete-canvas-global-asset"/);
  assert.match(ownerHtml, /data-canvas-global-asset-category/);
  assert.match(ownerHtml, /data-canvas-global-asset-file/);
  assert.match(ownerHtml, /data-action="trigger-canvas-global-asset-upload"/);
  assert.match(ownerHtml, /data-action="edit-canvas-global-asset-tags"/);
  assert.match(ownerHtml, /data-canvas-asset-tag="主角"/);
  assert.match(ownerHtml, /canvas-library-asset-tags/);
  assert.doesNotMatch(memberHtml, /data-action="delete-canvas-global-asset"/);
  assert.doesNotMatch(memberHtml, /data-action="edit-canvas-global-asset-tags"/);
});

test("Canvas asset tag filter narrows global cards without changing their source", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasAssetTagFilter: "场景",
      canvasLibraryAssets: [
        { id: "library:global:scene", assetId: "scene", title: "夜景", kind: "image", tags: ["场景"] },
        { id: "library:global:role", assetId: "role", title: "主角", kind: "image", tags: ["角色"] },
      ],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /夜景/);
  assert.doesNotMatch(html, />主角<\/strong>/);
  assert.match(html, /data-canvas-asset-tag="场景"/);
});

test("Canvas library source filters assets by the selected media type", () => {
  const html = renderCanvasSurfaceForHost({
    session: { user: { actorType: "owner" } },
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasAssetMediaFilter: "audio",
      canvasLibraryAssets: [
        { id: "library:global:image", assetId: "image", title: "图片资产", kind: "image", status: "可用" },
        { id: "library:global:audio", assetId: "audio", title: "音频资产", kind: "audio", status: "可用" },
      ],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /data-action="set-canvas-asset-media-filter"/);
  assert.match(html, /音频资产/);
  assert.doesNotMatch(html, /图片资产/);
});

test("new-canvas editor exposes a full-height workspace and feature rail", () => {
  const html = renderNewCanvasLayout("<main data-canvas-x6-mount></main>", {
    selectedCanvasProjectId: "canvas-test",
    canvasProjects: [{ id: "canvas-test", title: "分镜草稿" }],
    canvasAgent: { status: "idle" },
  });
  assert.match(html, /--canvas-agent-panel-width:600px/);
  assert.match(html, /data-canvas-agent-resize/);
  assert.doesNotMatch(html, /class="new-canvas-chrome"/);
  assert.doesNotMatch(html, /class="new-canvas-chrome-title"/);
  assert.doesNotMatch(html, /data-action="create-canvas-project"/);
  assert.doesNotMatch(html, /data-config-action="open"/);
  assert.match(html, /data-action="toggle-canvas-add-menu"/);
  assert.doesNotMatch(html, /data-action="back-to-canvas-projects"/);
  assert.match(html, /data-action="set-canvas-sidebar-mode"/);
  assert.match(html, /data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="assets" aria-label="资产"/);
  assert.match(html, /data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="history" aria-label="输出历史"/);
  assert.doesNotMatch(html, /class="canvas-character-library-launch"/);
  assert.doesNotMatch(html, /class="canvas-config-library-launch"/);
  assert.doesNotMatch(html, /CANVAS AGENT/);
  assert.doesNotMatch(html, /智能协作/);
  const handRail = renderNewCanvasChromeRail({ canvasDocument: { viewport: { interactionMode: "hand" } } });
  assert.match(handRail, /new-canvas-interaction-tool[^>]*data-interaction-mode="hand"[^>]*aria-label="抓手工具"/);
  assert.match(handRail, /new-canvas-interaction-tool[^>]*>[^<]*<svg[^>]*>.*抓手工具/s);
  const historyHtml = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "history",
      canvasAssets: [{ id: "run-1", title: "历史结果", kind: "image" }],
      canvasGenerationHistoryItems: [{
        id: "run-1",
        nodeKey: "ai-image-1",
        runNo: 1,
        status: "succeeded",
        mediaKind: "image",
        modelCode: "image-model",
        inputSnapshot: { prompt: "历史提示词" },
        outputSnapshot: { text: "历史输出" },
        artifacts: [],
        createdAt: "2026-07-27T10:00:00.000Z",
        updatedAt: "2026-07-27T10:00:00.000Z",
      }],
      canvasDocument: {
        nodes: [{ id: "ai-image-1", type: "ai-image", data: { title: "历史结果" } }],
        edges: [],
        viewport: { zoom: 1, y: 0, x: 0 },
      },
    },
  });
  assert.match(historyHtml, /data-canvas-sidebar-mode="history"/);
  assert.match(historyHtml, /历史结果/);
  assert.match(historyHtml, />历史</);
  assert.match(html, /data-character-action="open"/);
  assert.doesNotMatch(html, /data-media-action="open"/);
  assert.doesNotMatch(html, /data-new-canvas-action="focus-agent"/);
});

test("new-canvas waits for the persisted Agent panel state before first paint", () => {
  const html = renderNewCanvasLayout("<main data-canvas-x6-mount></main>", {
    canvasSessionUiStateReady: false,
    canvasAgent: { panelOpen: true },
  });
  assert.doesNotMatch(html, /data-canvas-agent-panel/);
  assert.doesNotMatch(html, /data-agent-action="open-agent-panel"/);
});

test("Canvas history uses the same friendly failure message as task center", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "history",
      canvasAssets: [{ id: "run-failed", title: "AI 视频", kind: "video" }],
      canvasGenerationHistoryItems: [{
        id: "run-failed",
        nodeKey: "ai-video-1",
        runNo: 1,
        status: "failed",
        mediaKind: "video",
        modelCode: "video-model",
        inputSnapshot: { prompt: "游泳" },
        outputSnapshot: {},
        failure: {
          failureCode: "provider_submission_failed",
          displayMessage: "该模型不支持视频参考",
        },
        artifacts: [],
        createdAt: "2026-07-29T08:53:51.000Z",
        updatedAt: "2026-07-29T08:53:55.000Z",
      }],
      canvasDocument: {
        nodes: [{ id: "ai-video-1", type: "ai-video", data: { title: "AI 视频" } }],
        edges: [],
        viewport: { zoom: 1, y: 0, x: 0 },
      },
    },
  });

  assert.match(html, /该模型不支持视频参考/);
  assert.doesNotMatch(html, />provider_submission_failed</);
});

test("Canvas configuration drawer renders persisted default settings", () => {
  const html = renderCanvasConfigLibraryShell({
    selectedCanvasProjectId: "canvas-1",
    canvasConfigLibrary: {
      open: true,
      settings: {
        canvasId: "canvas-1",
        revision: 2,
        settings: {
          visualStyle: { styleId: "style-realistic", prompt: "cinematic", locked: false, styleReferenceAssetId: "96b3ba18-4f9c-45bc-a8c7-eb2570da5d37" },
          promptSuffixes: { text: "", image: "detail", video: "", audio: "" },
          defaultModels: { text: null, image: "image-model", video: null, audio: null },
          generation: { imageAspectRatio: "16:9", imageSize: "1K", imageFollowNode: true, videoResolution: "720p", videoDuration: 8, videoFollowNode: true },
        },
        limits: {
          document: { maximumBytes: 5242880, maximumNodes: 2000, maximumEdges: 5000 },
          generation: { maximumBatchNodes: 100 },
        },
      },
      storageHealth: {
        status: "attention",
        objects: { count: 12, totalBytes: 1536, failedCount: 0 },
        orphaned: { count: 1 },
        fingerprints: { avoidedUploadCount: 4 },
        thumbnails: { missingCount: 2 },
      },
    },
    canvasAssets: [{
      assetId: "96b3ba18-4f9c-45bc-a8c7-eb2570da5d37",
      assetVersionId: "e15a064f-bb23-49d5-a2ea-1c9684d631f4",
      title: "水墨风格参考",
      previewUrl: "https://assets.example/style.png",
      kind: "image",
    }],
  });
  assert.match(html, /画布默认设置/);
  assert.match(html, /data-canvas-setting="promptSuffixes.image"/);
  assert.match(html, /data-canvas-setting="visualStyle.locked"/);
  assert.match(html, /data-canvas-setting="visualStyle.styleReferenceAssetId"/);
  assert.match(html, /水墨风格参考/);
  assert.match(html, /class="canvas-style-reference-preview"/);
  assert.match(html, /class="canvas-style-reference-settings"/);
  assert.match(html, /data-config-action="upload-style-reference"/);
  assert.match(html, /data-canvas-style-reference-file/);
  assert.match(html, /图片和视频生成会参考此资产/);
  assert.match(html, /https:\/\/assets\.example\/style\.png/);
  assert.match(html, /value="detail"/);
  assert.match(html, /data-config-action="save-settings"/);
  assert.match(html, /存储健康/);
  assert.match(html, /1\.5 KB/);
  assert.match(html, /data-config-action="refresh-storage-health"/);
  assert.match(html, /class="canvas-output-defaults"/);
  assert.match(html, /data-canvas-setting="generation\.imageAspectRatio"/);
  assert.match(html, /data-canvas-setting="generation\.imageFollowNode"/);
  assert.match(html, /data-canvas-setting="generation\.videoFollowNode"/);
  assert.match(html, /class="canvas-product-limits"/);
  assert.match(html, /5\.0 MB/);
  assert.match(html, /100 节点/);
});

test("Canvas settings group active default models by provider and retain an unavailable saved model", () => {
  const html = renderCanvasConfigLibraryShell({
    canvasConfigLibrary: { open: true },
    episodeGenerationConfig: {
      models: [
        { modelCode: "image-a", modelLabel: "图像 A", mediaType: "image", providerGroup: "Provider A" },
        { modelCode: "image-b", modelLabel: "图像 B", mediaType: "image", providerGroup: "Provider B" },
        { modelCode: "image-disabled", modelLabel: "禁用图像", mediaType: "image", providerGroup: "Provider A", enabled: false },
      ],
    },
    canvasSettingsRecord: {
      revision: 3,
      settings: { defaultModels: { image: "retired-image" } },
    },
  });
  assert.match(html, /data-canvas-setting="defaultModels.image"/);
  assert.match(html, /<optgroup label="Provider A">/);
  assert.match(html, /<optgroup label="Provider B">/);
  assert.match(html, /已保存但当前不可用：retired-image/);
  assert.doesNotMatch(html, /禁用图像/);
});

test("Canvas settings retain a style reference while its application is disabled", () => {
  const html = renderCanvasConfigLibraryShell({
    canvasConfigLibrary: { open: true },
    canvasAssets: [{
      assetId: "8dcbaf7f-1a3c-4d55-ae0b-3d8548b527c1",
      assetVersionId: "7f932d8a-dd4d-40f5-9ba1-3fdca2a046d2",
      title: "风格图",
    }],
    canvasSettingsRecord: {
      revision: 3,
      settings: { visualStyle: { styleReferenceAssetId: "8dcbaf7f-1a3c-4d55-ae0b-3d8548b527c1", styleReferenceEnabled: false } },
    },
  });
  assert.match(html, /data-canvas-setting="visualStyle.styleReferenceEnabled"/);
  assert.doesNotMatch(html, /styleReferenceEnabled" checked/);
  assert.match(html, /data-canvas-setting="visualStyle.styleReferenceAssetId" disabled/);
  assert.match(html, /value="8dcbaf7f-1a3c-4d55-ae0b-3d8548b527c1" selected/);
  assert.match(html, /canvas-style-reference-preview is-disabled/);
});

test("new-canvas asset sidebar exposes searchable Canvas generation artifacts", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSearch: "角色",
      canvasAssets: [
        { id: "artifact-1", title: "角色立绘", kind: "image", url: "/role.png", storageObjectId: "storage-1" },
        { id: "artifact-2", title: "场景图", kind: "image", url: "/scene.png" },
      ],
      canvasAssetTransfers: {
        "artifact-1": { mode: "download", status: "running", loaded: 80, total: 100, progress: 0.8 },
      },
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /data-canvas-asset-search/);
  assert.match(html, /角色立绘/);
  assert.match(html, /draggable="true" data-canvas-asset-drag="true"/);
  assert.match(html, /data-action="cancel-canvas-asset-transfer"/);
  assert.match(html, /下载 80%/);
  assert.match(html, /<progress max="1" value="0\.8">/);
  assert.doesNotMatch(html, /场景图/);
});

test("Canvas asset sidebar keeps upstream-style project and global asset sources", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      canvasSidebarMode: "assets",
      canvasAssetSource: "global",
      canvasLibraryAssets: [{
        id: "library:global:asset-1",
        title: "全局角色",
        kind: "image",
        meta: "全局 · character",
        url: "/global-role.png",
        assetId: "asset-1",
        storageObjectId: "storage-1",
      }],
      canvasDocument: { nodes: [], edges: [], viewport: { zoom: 1, x: 0, y: 0 } },
    },
  });
  assert.match(html, /data-action="set-canvas-asset-source"/);
  assert.match(html, /data-canvas-asset-source="global"/);
  assert.match(html, /全局角色/);
  assert.match(html, /data-action="add-canvas-library-asset"/);
  assert.match(html, /data-action="use-canvas-library-asset-as-style-reference"/);
  assert.match(html, /data-canvas-asset-drag="true"/);
});

test("Canvas asset drag uses a stable internal type and maps viewport coordinates", () => {
  assert.equal(CANVAS_ASSET_DRAG_TYPE, "application/x-comic-ai-canvas-asset");
  assert.deepEqual(canvasDropPosition({
    getBoundingClientRect: () => ({ left: 100, top: 80 }),
  }, 460, 300, { x: 40, y: 20, zoom: 2 }), { x: 160, y: 100 });
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /onCanvasAssetDrop/);
  assert.match(source, /addEventListener\("drop", onDrop, true\)/);
});

test("Canvas storyboard cell drag uses a structured payload and a dedicated drop callback", () => {
  assert.equal(CANVAS_STORYBOARD_CELL_DRAG_TYPE, "application/x-comic-ai-canvas-storyboard-cell");
  const payload = createCanvasStoryboardCellDragPayload("storyboard-1", 5);
  assert.deepEqual(parseCanvasStoryboardCellDragPayload(payload), { nodeId: "storyboard-1", cellIndex: 5 });
  assert.equal(createCanvasStoryboardCellDragPayload("", 0), "");
  assert.equal(createCanvasStoryboardCellDragPayload("storyboard-1", -1), "");
  assert.equal(parseCanvasStoryboardCellDragPayload("not-json"), null);
  assert.equal(parseCanvasStoryboardCellDragPayload('{"nodeId":"storyboard-1","cellIndex":1.5}'), null);

  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const newCanvasCss = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(source, /setData\(CANVAS_STORYBOARD_CELL_DRAG_TYPE, storyboardPayload\)/);
  assert.match(source, /onCanvasStoryboardCellDrop/);
  assert.match(source, /is-canvas-storyboard-drop-target/);
  assert.match(source, /canvasEventPathTarget[\s\S]*?data-storyboard-drag-source/);
  assert.match(source, /addEventListener\("dragstart", onDragStart, true\)/);
  assert.match(source, /addEventListener\("dragover", onDragOver, true\)/);
  assert.match(source, /addEventListener\("drop", onDrop, true\)/);
  assert.match(source, /let storyboardCellPointer = null/);
  assert.match(source, /storyboardCell\.setPointerCapture\?\.\(event\.pointerId\)/);
  assert.match(source, /storyboardCellPointer\.dragging = true/);
  assert.match(source, /context\.onCanvasStoryboardCellDrop\?\.\(\{/);
  assert.match(source, /context\.onCanvasStoryboardImageReturn\?\.\(input/);
  assert.match(source, /suppressStoryboardExtractClickUntil = Date\.now\(\) \+ 500/);
  assert.match(graphSource, /storyboardBody\.addEventListener\("wheel", \(event\) => event\.stopPropagation\(\), \{ passive: true \}\)/);
  assert.match(graphSource, /const canvasStoryboardScrollState = new Map\(\)/);
  assert.match(graphSource, /canvasStoryboardScrollState\.set\(nodeId, storyboardBody\.scrollTop\)/);
  assert.match(graphSource, /storyboardBody\.scrollTop = Math\.min\([\s\S]*?previousScrollTop/);
  assert.match(graphSource, /function resolveCanvasStoryboardReturnTarget/);
  assert.match(graphSource, /function resolveCanvasStoryboardCutReference/);
  assert.match(graphSource, /workbench\.onCanvasStoryboardImageReturn\?\.\(\{/);
  assert.match(graphSource, /is-storyboard-cut/);
  assert.match(graphSource, /data-action="return-canvas-storyboard-image"/);
  assert.match(newCanvasCss, /\.canvas-storyboard-node-body\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  assert.match(newCanvasCss, /\.canvas-x6-source-media-body\.is-storyboard-cut \.canvas-x6-source-media-preview img\s*\{[^}]*height:\s*100%;[^}]*max-height:\s*none;[^}]*object-fit:\s*contain;/s);
  assert.match(newCanvasCss, /\.canvas-storyboard-cell\.is-return-target::after/);
  assert.match(newCanvasCss, /\.canvas-storyboard-return-action::after/);
  assert.match(
    workbenchSource,
    /function resolveCanvasSpecialImageUrl\(node\) \{[\s\S]*?data\.storageObjectId[\s\S]*?\/api\/storage\/objects\/\$\{encodeURIComponent\(storageObjectId\)\}\/content\?proxy=1/,
  );
  assert.match(
    workbenchSource,
    /setCanvasStoryboardPreparing\(workbench, nodeId, true\);[\s\S]*?finally \{\s*setCanvasStoryboardPreparing\(workbench, nodeId, false\);/,
  );
  assert.match(workbenchSource, /updateCanvasNodeData\(document, nodeId, patch\)\);\s*workbench\.ui\.selectedCanvasNodeId = nodeId;\s*workbench\.ui\.canvasEditorOpen = true;/);
  assert.match(workbenchSource, /function handleNewCanvasStoryboardImageReturn[\s\S]*?restoreCanvasStoryboardCutImage/);
  assert.match(workbenchSource, /action === "return-canvas-storyboard-image"/);
  assert.match(graphSource, /canvasStoryboardPreparing\?\.\[nodeId\] === true/);
});

test("Canvas accepts external media files and plain text without confusing internal drags", () => {
  const image = { name: "reference.png", type: "image/png", size: 42, lastModified: 1 };
  const transfer = {
    types: ["Files"],
    files: [image],
    items: [{ kind: "file", getAsFile: () => image }],
    getData: () => "ignored while files exist",
  };
  assert.equal(hasCanvasExternalTransfer(transfer), true);
  assert.deepEqual(canvasExternalTransferPayload(transfer), { files: [image], text: "" });
  assert.deepEqual(canvasExternalTransferPayload({
    types: ["text/plain"],
    files: [],
    items: [],
    getData: () => "粘贴到画布的文字",
  }), { files: [], text: "粘贴到画布的文字" });
  assert.equal(hasCanvasExternalTransfer({ types: [CANVAS_ASSET_DRAG_TYPE, "text/plain"] }), false);
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  assert.match(source, /addEventListener\("paste", onPaste\)/);
  assert.match(source, /onCanvasExternalDrop/);
});

test("toolbar manifests remain compatible without rendering the removed command toolbar", () => {
  const ui = {
    canvasActiveTool: "connect",
    canvasConfigSnapshots: {
      toolbar: {
        manifest: {
          toolIds: ["comment", "connect", "select"],
          layout: { direction: "vertical", position: "right" },
        },
      },
    },
  };
  assert.deepEqual(resolveCanvasToolbarLayout(ui), {
    zones: [["connect", "select"]],
    direction: "vertical",
    position: "right",
    configured: true,
  });
  const html = renderCanvasSurfaceForHost({
    ui: { ...ui, selectedCanvasProjectId: "canvas-test", canvasDocument: { nodes: [], edges: [], viewport: {} } },
  });
  assert.doesNotMatch(html, /canvas-command-tools/);
  assert.doesNotMatch(html, /data-toolbar-layout/);
  assert.doesNotMatch(html, /data-toolbar-position/);
});

test("applying a toolbar version persists its stable reference on the Canvas document", async () => {
  const workbench = {
    ui: {
      canvasDocument: { version: 1, nodes: [], edges: [] },
      canvasConfigLibrary: {
        configs: [{ id: "toolbar-1", type: "toolbar", name: "剪辑工具" }],
        selectedConfigId: "toolbar-1",
        versions: [{ id: "toolbar-version-2", version: 2, manifest: { toolIds: ["select", "connect"] } }],
        selectedVersionId: "toolbar-version-2",
      },
    },
    updateCanvasDocument(document) { this.ui.canvasDocument = document; },
  };
  const controller = createCanvasConfigLibraryController({ surface: {}, workbench });
  await controller.handleAction({ dataset: { configAction: "apply" } });
  assert.deepEqual(workbench.ui.canvasDocument.configReferences.toolbar, {
    configId: "toolbar-1",
    versionId: "toolbar-version-2",
    version: 2,
  });
  assert.deepEqual(workbench.ui.canvasConfigSnapshots.toolbar.manifest.toolIds, ["select", "connect"]);
});

test("Canvas pane dismissal closes settings and transient node overlays", () => {
  const ui = {
    canvasConfigLibrary: { open: true },
    canvasAddMenuOpen: true,
    canvasContextMenu: { mode: "add" },
    canvasScriptPicker: { nodeId: "node-1" },
    canvasScriptWorkspace: { open: true, scriptNodeId: "node-1" },
    openGenerationSelectMenu: "model",
    canvasEditorOpen: true,
    selectedCanvasNodeId: "node-1",
  };
  assert.equal(dismissCanvasSurfaceOverlays(ui), true);
  assert.equal(ui.canvasConfigLibrary.open, false);
  assert.equal(ui.canvasAddMenuOpen, false);
  assert.equal(ui.canvasContextMenu, null);
  assert.equal(ui.canvasScriptWorkspace, null);
  assert.equal(ui.canvasEditorOpen, false);
  assert.equal(ui.selectedCanvasNodeId, null);
  assert.equal(dismissCanvasSurfaceOverlays(ui), false);
});

test("Canvas selection and deselection stay local instead of rebuilding the canvas", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const selectionHandler = source.match(/workbench\.onCanvasNodeSelected = \(nodeId\) => \{[\s\S]*?\n      \};/)?.[0] ?? "";
  const clickHandler = source.match(/const onClick = \(event\) => \{[\s\S]*?const onDoubleClick =/)?.[0] ?? "";
  const blankDismiss = clickHandler.match(/if \(canvasStage && !interactive\) \{[\s\S]*?\n        \}/)?.[0] ?? "";

  assert.doesNotMatch(selectionHandler, /syncPanel\(|renderInteraction\(|refreshCanvasWorkflowGraph\(/);
  assert.match(blankDismiss, /clearCanvasSelectionPresentation\(surface, graph, workbench\)/);
  assert.match(blankDismiss, /const hadEditor = workbench\.ui\.canvasEditorOpen === true/);
  assert.match(blankDismiss, /const overlaysChanged = dismissCanvasSurfaceOverlays\(workbench\.ui\)/);
  assert.match(blankDismiss, /settleCanvasGraphBlankConnectionDraft\(graph, \{ document: workbench\.ui\.canvasDocument \}\)/);
  assert.match(blankDismiss, /const shouldSyncSelection = hadEditor\s*\|\| Boolean\(workbench\.ui\.selectedCanvasNodeId\)\s*\|\| overlaysChanged/);
  assert.match(blankDismiss, /if \(shouldSyncSelection\) \{[\s\S]*?void renderSelection\(\);/);
  assert.doesNotMatch(blankDismiss, /zoomTo\(|translate\(|syncCanvasGraphViewport\(/);
  assert.doesNotMatch(blankDismiss, /renderInteraction\(|render\(|createMarkup\(|refreshCanvasWorkflowGraph\(/);
  assert.match(blankDismiss, /dismissCanvasSurfaceOverlays\(workbench\.ui\)/);
  assert.match(source, /clearCanvasGraphSelection,/);
  assert.match(source, /function clearCanvasSelectionPresentation\(surface, graph, workbench\) \{[\s\S]*?clearCanvasGraphEditorOverlay\(graph\);[\s\S]*?clearCanvasGraphSelection\(graph\);[\s\S]*?refreshCanvasSelectionActionToolbar/);
});

test("Canvas treats the script workspace as interactive instead of dismissing it as blank canvas", () => {
  const source = readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8");
  const clickHandler = source.match(/const onClick = \(event\) => \{[\s\S]*?const onDoubleClick =/)?.[0] ?? "";

  assert.match(clickHandler, /\.script-workspace-layer/);
  assert.match(clickHandler, /if \(canvasStage && !interactive\) \{[\s\S]*?dismissCanvasSurfaceOverlays\(workbench\.ui\)/);
});

test("Canvas add menu stays above the mounted X6 graph so template buttons receive clicks", () => {
  const css = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");

  assert.match(css, /\.canvas-stage\.is-x6-ready \.canvas-x6-mount\s*\{[^}]*z-index:\s*4;/s);
  assert.match(css, /\.canvas-add-menu\s*\{[^}]*z-index:\s*8;/s);
});

test("selected nodes render the primary toolbar zone before secondary actions", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-test",
      selectedCanvasNodeId: "source-image-1",
      canvasDocument: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        nodes: [{
          id: "source-image-1",
          type: "source-image",
          position: { x: 200, y: 160 },
          size: { width: 360, height: 220 },
          data: { title: "图片源", mediaKind: "image", ports: { inputs: [], outputs: [] } },
        }],
      },
    },
  });
  assert.match(html, /class="canvas-node-action-toolbar"/);
  assert.ok(html.indexOf('data-toolbar-zone="primary"') < html.indexOf('data-toolbar-zone="secondary"'));
  assert.match(html, /data-media-tool="crop"/);
  assert.match(html, /data-media-tool="outpaint"/);
  assert.match(html, /data-media-tool="remove_background"/);
  assert.match(html, /data-media-tool="camera_studio"/);
  assert.match(html, /data-canvas-sidebar-mode="assets"/);
  assert.match(html, /data-action="set-canvas-sidebar-mode" data-canvas-sidebar-mode="history" aria-label="历史"/);
  assert.match(html, /<template data-canvas-node-action-toolbar-template>/);
  assert.doesNotMatch(html, /left:clamp\(/);
});

test("Director and Markdown parity controls render on the actual Canvas surface", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-parity",
      selectedCanvasNodeId: "director-1",
      canvasEditorOpen: true,
      editingCanvasTextNodeId: "markdown-1",
      canvasMarkdownFullscreen: { open: true, nodeId: "markdown-1", viewMode: "edit" },
      canvasDocument: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        nodes: [
          {
            id: "director-1",
            type: "ai-director",
            position: { x: 20, y: 20 },
            size: { width: 500, height: 340 },
            data: { directorCaptures: [{ artifactId: "a-1", storageObjectId: "s-1" }], ports: { inputs: [], outputs: [] } },
          },
          {
            id: "markdown-1",
            type: "markdown",
            position: { x: 560, y: 20 },
            size: { width: 310, height: 300 },
            data: { text: "# 标题\n正文", ports: { inputs: [], outputs: [] } },
          },
        ],
      },
    },
  });
  const graphSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  const directorSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-director-node.js", import.meta.url),
    "utf8",
  );

  assert.match(html, /data-canvas-x6-mount/);
  assert.doesNotMatch(html, /data-canvas-director-body/);
  assert.match(graphSource, /type === "ai-director"[\s\S]*?renderCanvasDirectorNodeBody\(node\)/);
  assert.match(directorSource, /data-canvas-director-body/);
  assert.match(directorSource, /data-action="open-canvas-director"/);
  assert.match(directorSource, /data-action="sync-canvas-director-frame"/);
  assert.match(directorSource, /data-action="delete-canvas-director-capture"/);
  assert.doesNotMatch(html, /class="canvas-node-editor generation-editor/);
  assert.doesNotMatch(html, /data-canvas-prompt-input/);
  assert.match(html, /data-canvas-markdown-fullscreen/);
  assert.match(html, /data-canvas-markdown-text-stats/);
  assert.match(html, /data-action="copy-canvas-markdown-text"/);
});

test("ordinary Markdown stays inline while AI Markdown keeps its text generation editor", () => {
  const graphSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  const markdownSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-markdown-node.js", import.meta.url),
    "utf8",
  );
  const markdownRendererSource = `${graphSource}\n${markdownSource}`;
  const markdownHtml = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-markdown",
      selectedCanvasNodeId: "markdown-1",
      canvasEditorOpen: true,
      canvasDocument: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        nodes: [{
          id: "markdown-1",
          type: "markdown",
          position: { x: 120, y: 120 },
          size: { width: 310, height: 300 },
          data: { text: "# 标题\n正文", ports: { inputs: [], outputs: [] } },
        }],
      },
    },
  });
  assert.match(markdownHtml, /data-canvas-x6-mount/);
  assert.doesNotMatch(markdownHtml, /class="canvas-markdown-toolbar"/);
  assert.match(graphSource, /const markdownNode = \["markdown", "ai-markdown"\]\.includes\(type\)/);
  assert.match(graphSource, /markdownNode \? renderCanvasMarkdown\w+\(node\) : ""/);
  assert.match(markdownRendererSource, /data-action="set-canvas-markdown-mode"/);
  assert.match(markdownRendererSource, /data-action="copy-canvas-markdown-text"/);
  assert.match(markdownRendererSource, /data-action="toggle-canvas-markdown-fullscreen"/);
  assert.match(markdownRendererSource, /data-canvas-markdown-text-stats/);
  assert.match(graphSource, /data-canvas-text-input/);
  assert.doesNotMatch(markdownHtml, /class="canvas-node-editor generation-editor/);
  assert.doesNotMatch(markdownHtml, /请输入您的生图要求/);

  const aiMarkdownHtml = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-ai-markdown",
      selectedCanvasNodeId: "ai-markdown-1",
      canvasEditorOpen: true,
      episodeGenerationConfig: {
        models: [{ modelCode: "text-live", modelLabel: "Text Live", mediaType: "text", enabled: true }],
      },
      canvasDocument: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        nodes: [{
          id: "ai-markdown-1",
          type: "ai-markdown",
          position: { x: 120, y: 120 },
          size: { width: 310, height: 300 },
          data: { mediaKind: "text", modelCode: "text-live", ports: { inputs: [], outputs: [] } },
        }],
      },
    },
  });
  assert.match(aiMarkdownHtml, /class="canvas-node-editor generation-editor text"/);
  assert.match(aiMarkdownHtml, /描述需要生成的 Markdown 文档结构和内容/);
  assert.doesNotMatch(aiMarkdownHtml, /请输入您的生图要求/);
});

test("AI text generation editor opens above low canvas nodes", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      selectedCanvasProjectId: "canvas-text",
      selectedCanvasNodeId: "ai-text-1",
      canvasEditorOpen: true,
      episodeGenerationConfig: {
        models: [{ modelCode: "text-live", modelLabel: "Text Live", mediaType: "text", enabled: true }],
      },
      canvasDocument: {
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: [],
        nodes: [{
          id: "ai-text-1",
          type: "ai-text",
          position: { x: 240, y: 500 },
          size: { width: 310, height: 300 },
          data: { title: "AI 文本", mediaKind: "text", modelCode: "text-live", prompt: "改写正文", ports: { inputs: [], outputs: [] } },
        }],
      },
    },
  });
  assert.match(html, /class="canvas-node-editor generation-editor text"/);
  assert.match(html, /style="left:12px;top:168px;--editor-width:800px"/);
  assert.match(html, /data-action="run-canvas-node"/);
});

test("director desk is an in-page Canvas overlay with capture writeback", () => {
  const hostSource = readFileSync(
    new URL("../src/features/new-canvas/index.js", import.meta.url),
    "utf8",
  );
  const overlaySource = readFileSync(
    new URL("../src/features/new-canvas/director-desk-overlay.js", import.meta.url),
    "utf8",
  );
  const graphSource = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  assert.match(hostSource, /createDirectorDeskOverlay/);
  assert.match(graphSource, /node:dblclick/);
  assert.match(graphSource, /type === "ai-director"/);
  assert.match(overlaySource, /mountDirectorDesk/);
  assert.match(overlaySource, /appendCanvasDirectorArtifact/);
  assert.match(overlaySource, /updateCanvasDirectorCaptureDocument/);
  assert.match(overlaySource, /captureDirectorDeskFrame/);
  assert.match(overlaySource, /onVideoCapture/);
  assert.doesNotMatch(overlaySource, /<iframe|window\.open/);
});

test("canvas detail hands rendering to the in-project shadow host while the host adapter keeps the Canvas surface", () => {
  const detailHtml = renderProjectDetail({
    ui: {
      activeNavTab: "tools",
      canvasProjectView: "detail",
      canvasHostMount: true,
    },
  });
  assert.match(detailHtml, /data-new-canvas-mount/);
  assert.match(detailHtml, /new-canvas-loading-skeleton/);
  assert.match(detailHtml, /role="status"/);
  assert.match(detailHtml, /data-workbench-global-overlays/);
  assert.doesNotMatch(detailHtml, /data-canvas-x6-mount/);

  const workbenchSource = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  assert.match(workbenchSource, /syncNewCanvasMount/);
  assert.match(workbenchSource, /prepareNewCanvasMountForRender/);
  assert.match(workbenchSource, /restoreNewCanvasMountAfterRender/);
  assert.match(workbenchSource, /function replaceWorkbenchChrome/);
  assert.match(workbenchSource, /function renderWorkbenchChrome/);
  assert.match(workbenchSource, /currentStatusbar\.replaceWith\(nextStatusbar\)/);
  assert.match(workbenchSource, /currentOverlays\.replaceWith\(nextOverlays\)/);
  const chromeRenderBlock = workbenchSource.match(/function renderWorkbenchChrome[\s\S]*?function shouldMountNewCanvas/)?.[0] ?? "";
  assert.doesNotMatch(chromeRenderBlock, /newCanvasInstance\.update|refreshCanvasWorkflowGraph|prepareNewCanvasMountForRender/);
  assert.match(workbenchSource, /if \(action === "open-task-center"\)[\s\S]*?renderWorkbenchChrome\(workbench\)/);
  assert.match(workbenchSource, /if \(action === "close-task-center"\)[\s\S]*?renderWorkbenchChrome\(workbench\)/);
  assert.match(workbenchSource, /if \(action === "open-pricing"\)[\s\S]*?renderWorkbenchChrome\(workbench\)/);
  assert.match(workbenchSource, /if \(action === "close-pricing"\)[\s\S]*?renderWorkbenchChrome\(workbench\)/);
  assert.match(workbenchSource, /unmountNewCanvas/);
  assert.match(workbenchSource, /onAction\(event, \{ actionTarget: resolvedActionTarget, workbench: mountedWorkbench \} = \{\}\)/);
  assert.match(workbenchSource, /includes\(actionTarget\.dataset\?\.action\) \? mountedWorkbench \?\? workbench : workbench/);
  assert.match(workbenchSource, /onInput\(_event, context\)/);
  assert.match(workbenchSource, /onChange\(_event, context\)/);
  assert.match(readFileSync(new URL("../src/features/new-canvas/index.js", import.meta.url), "utf8"), /context.onInput/);
  assert.match(workbenchSource, /event\.composedPath\?\.\(\)\[0\]/);

  const workbenchCss = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  const newCanvasCss = readFileSync(
    new URL("../src/features/new-canvas/new-canvas.css", import.meta.url),
    "utf8",
  );
  assert.match(workbenchCss, /\.new-canvas-workbench-host\s*\{[\s\S]*?height:\s*100%/);
  assert.match(workbenchCss, /\.new-canvas-loading-skeleton > \*\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(workbenchCss, /\.canvas-global-asset-folder-filter\s*\{[\s\S]*?display:\s*flex/);
  assert.match(workbenchCss, /\.canvas-library-asset-folder\s*\{[\s\S]*?display:\s*flex/);
  assert.match(workbenchCss, /\.canvas-library-asset-details\s*\{[\s\S]*?display:\s*grid/);
  assert.match(workbenchCss, /\.canvas-x6-editor-overlay \.canvas-node-editor\s*\{[\s\S]*?position:\s*relative !important;/);
  assert.match(newCanvasCss, /\.canvas-storyboard-cell-extract::after\s*\{[\s\S]*?content:\s*attr\(data-tooltip\)/);
  assert.doesNotMatch(newCanvasCss, /\.new-canvas-root \.canvas-zoom-tools\s*\{/);
});

test("free generation keeps the application shell around the standalone Agent host", () => {
  const workbenchCss = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  const html = renderProjectDetail({
    ui: {
      activeNavTab: "free-generation",
      canvasProjectView: "detail",
      canvasAgentOnly: true,
      canvasHostMount: true,
      homeBackground: { status: "active", videoUrl: "https://example.com/home.mp4" },
    },
  });

  assert.match(html, /workbench-main home-mode/);
  assert.match(html, /class="home-hero has-background-video has-free-generation"/);
  assert.match(html, /class="home-background-video"/);
  assert.match(html, /new-canvas-workbench-host is-agent-only/);
  assert.match(html, /data-new-canvas-mount/);
  assert.match(html, /aria-label="自由生成对话"/);
  assert.match(html, /class="home-creation-mode-introduction"/);
  assert.doesNotMatch(html, /AI 创作工作台/);
  assert.match(html, /从一个想法，开始你的作品/);
  assert.match(html, /class="home-creation-mode-switch"/);
  assert.match(html, /data-creation-mode="agent"[^>]*data-tooltip="在画布中通过对话协同创建和编辑内容"[^>]*>画布Agent/);
  assert.match(html, /data-creation-mode="workflow"[^>]*data-tooltip="上传剧本，自动解析并生成资产与分镜"[^>]*>项目工作流/);
  assert.match(html, /data-creation-mode="free"[^>]*data-tooltip="在独立会话中直接生成图片、视频和音频"[^>]*>自由会话/);
  assert.match(html, /<button(?=[^>]*data-creation-mode="free")(?=[^>]*class="active")(?=[^>]*aria-selected="true")[^>]*>/);
  assert.match(html, /workbench-rail persistent/);
  assert.match(html, /rail-item active[\s\S]*?data-action="set-nav-tab"[\s\S]*?data-tab="home"/);
  assert.match(html, /global-statusbar/);
  assert.doesNotMatch(html, /画布编辑器/);
  assert.doesNotMatch(html, /data-canvas-x6-mount/);
  assert.match(html, /class="home-hero/);
  assert.doesNotMatch(html, /home-capability-grid/);
  assert.doesNotMatch(html, /class="home-projects"/);
  assert.match(workbenchCss, /\.home-free-generation-dialog\s*\{[\s\S]*?width:\s*min\(1800px, 100%\)[\s\S]*?height:\s*min\(42rem, calc\(100dvh - 24rem\)\)/);
  assert.match(workbenchCss, /\.home-creation-mode-switch button::after\s*\{[\s\S]*?content:\s*attr\(data-tooltip\)[\s\S]*?visibility:\s*hidden/);
  assert.match(workbenchCss, /\.home-creation-mode-switch button:hover::after,[\s\S]*?transition-delay:\s*0\.5s,\s*0\.5s,\s*0\.5s/);
});

test("home creation mode tabs update only the home creation surface", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const handler = source.match(/if \(action === "set-home-creation-mode"\)[\s\S]*?if \(action === "remove-home-agent-attachment"\)/)?.[0] ?? "";
  assert.match(handler, /renderHomeCreationModeSurface\(workbench\)/);
  assert.doesNotMatch(handler, /render\(workbench\)/);
  const surfaceRenderer = source.match(/function renderHomeCreationModeSurface[\s\S]*?function render\(workbench, options = \{\}\)/)?.[0] ?? "";
  assert.match(surfaceRenderer, /currentModeSurface\.replaceWith\(nextModeSurface\)/);
  assert.doesNotMatch(surfaceRenderer, /\.seo-home-scroll\)/);
  assert.match(surfaceRenderer, /modeSurfaceOpen/);
  assert.match(surfaceRenderer, /template\.innerHTML = nextMarkup\.slice/);
  assert.match(surfaceRenderer, /nextHeroClassName/);
  assert.match(surfaceRenderer, /syncNewCanvasMount\(workbench\)/);
  assert.match(source, /function preserveHomeBackgroundVideo[\s\S]*?homeBackgroundVideoUrl[\s\S]*?currentSource !== nextSource/);
  assert.match(source, /const HOME_BACKGROUND_VIDEO_CACHE_NAME/);
  assert.match(source, /function syncHomeBackgroundVideoLocalCache[\s\S]*?readCachedHomeBackgroundVideo/);
  assert.match(source, /function playHomeBackgroundVideoFromMediaSource[\s\S]*?addSourceBuffer[\s\S]*?endOfStream/);
});

test("initial home project creation entry is centered with a compact responsive width", () => {
  const html = renderProjectDetail({
    ui: {
      activeNavTab: "home",
      homeRecentProjects: [],
    },
  });
  const css = readFileSync(
    new URL("../src/features/production-workbench/production-workbench.css", import.meta.url),
    "utf8",
  );
  assert.match(html, /class="home-project-empty home-project-create-empty"/);
  assert.match(css, /\.home-project-create-empty\s*\{[\s\S]*?width:\s*min\(20rem, 100%\)[\s\S]*?margin-inline:\s*auto/);
});

test("canvas startup preserves a pending shadow host across follow-up renders", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const mountLifecycle = source.match(
    /function prepareNewCanvasMountForRender[\s\S]*?const NEW_CANVAS_NODE_LOCAL_ACTIONS/,
  )?.[0] ?? "";
  assert.match(mountLifecycle, /workbench\.newCanvasMount \?\? workbench\.newCanvasPendingHost/);
  assert.match(mountLifecycle, /mountPending = workbench\.newCanvasPendingHost === preservedHost/);

  const mountStart = source.match(/async function syncNewCanvasMount[\s\S]*?try \{/)?.[0] ?? "";
  assert.ok(
    mountStart.indexOf("host.dataset.canvasProjectId") < mountStart.indexOf("workbench.newCanvasPendingHost = host"),
  );
});

test("canvas startup reapplies the latest document after a pending shadow mount completes", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const mountSync = source.match(
    /async function syncNewCanvasMount[\s\S]*?async function runNewCanvasHostAction/,
  )?.[0] ?? "";
  const mountCompletion = mountSync.match(
    /workbench\.newCanvasPendingHost = null;[\s\S]*?return instance;/,
  )?.[0] ?? "";
  assert.match(
    mountCompletion,
    /workbench\.newCanvasInstance = instance;[\s\S]*?updateMountedNewCanvasSurface\(workbench, \{ surfaceOnly: true \}\)/,
  );
});

test("canvas lazy startup reuses the selected document and coalesces settings reads", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const lazyLoad = source.match(/function scheduleLazySurfaceLoad[\s\S]*?async function loadProjectDetailForWorkbench/)?.[0] ?? "";
  assert.match(lazyLoad, /canvasProjectView !== "detail"[\s\S]*?!isSelectedStandaloneCanvasDocumentLoaded\(workbench\)[\s\S]*?syncCanvasProjectsFromApi/);

  const settingsLoad = source.match(/async function loadCanvasSettingsRecord[\s\S]*?async function loadAppliedCanvasToolbar/)?.[0] ?? "";
  assert.match(settingsLoad, /currentLoad\?\.canvasProjectId === canvasProjectId[\s\S]*?return currentLoad\.promise/);
  assert.match(settingsLoad, /canvasSettingsLoadedProjectId === canvasProjectId[\s\S]*?< 1_500/);
});

test("canvas load completions keep the outer host mounted", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const completionRender = source.match(/function renderAfterCanvasLoad[\s\S]*?function shouldMountNewCanvas/)?.[0] ?? "";
  assert.match(completionRender, /hasReusableNewCanvasHost\(workbench\)/);
  assert.match(completionRender, /updateMountedNewCanvasSurface\(workbench, \{ surfaceOnly: true \}\)/);
  assert.match(completionRender, /renderWorkbenchChrome\(workbench\)/);
  assert.doesNotMatch(completionRender, /prepareNewCanvasMountForRender/);
  const reusableHost = source.match(/function hasReusableNewCanvasHost[\s\S]*?function renderAfterCanvasLoad/)?.[0] ?? "";
  assert.match(reusableHost, /newCanvasMount \?\? workbench\?\.newCanvasPendingHost/);

  const lazyLoad = source.match(/function scheduleLazySurfaceLoad[\s\S]*?async function loadProjectDetailForWorkbench/)?.[0] ?? "";
  assert.match(lazyLoad, /renderAfterCanvasLoad\(workbench, renderOptions\)/);
  const openCanvas = source.match(/if \(action === "open-canvas-project"\)[\s\S]*?if \(action === "create-canvas-project"\)/)?.[0] ?? "";
  assert.match(openCanvas, /renderAfterCanvasLoad\(workbench\)/);
  assert.match(openCanvas, /history\?\.pushState[\s\S]*?canvasDetailRouteToken\(workbench\)/);
  assert.doesNotMatch(openCanvas, /syncCanvasProjectIdInLocation\(projectId\);\s*window\.location\.hash/);
});

test("canvas host renders the zoom label from the preserved X6 graph", () => {
  const source = readFileSync(
    new URL("../src/features/production-workbench/index.js", import.meta.url),
    "utf8",
  );
  const mountSync = source.match(/async function syncNewCanvasMount[\s\S]*?async function runNewCanvasHostAction/)?.[0] ?? "";
  assert.match(
    mountSync,
    /onRender\(\{ graph \}\)[\s\S]*?syncCanvasZoomControlDisplay\(host\.shadowRoot, graph\?\.zoom\?\.\(\)\)/,
  );

  const hostSource = readFileSync(
    new URL("../src/features/new-canvas/index.js", import.meta.url),
    "utf8",
  );
  const adapterSource = hostSource.match(/function createProductionCanvasAdapter[\s\S]*?export async function mountNewCanvas/)?.[0] ?? "";
  const renderNotifications = adapterSource.match(/context\.onRender\?\.\(\{ workbench, graph, surface \}\)/g) ?? [];
  const synchronizedNotifications = adapterSource.match(
    /syncCanvasZoomControlDisplay\(surface, graph\?\.zoom\?\.\(\)\);\s*context\.onRender\?\.\(\{ workbench, graph, surface \}\)/g,
  ) ?? [];
  assert.ok(renderNotifications.length > 0);
  assert.equal(synchronizedNotifications.length, renderNotifications.length);
});

test("Canvas Director capture deletion uses the built-in confirmation modal", () => {
  const html = renderCanvasSurfaceForHost({
    ui: {
      activeNavTab: "tools",
      canvasProjectView: "detail",
      canvasHostMount: true,
      canvasDirectorCaptureDeleteTarget: {
        nodeId: "director-1",
        artifactId: "artifact-1",
        mediaKind: "video",
      },
    },
  });
  assert.match(html, /class="modal-backdrop delete-project-backdrop"[^>]*aria-label="确认删除导演台视频"/);
  assert.match(html, /class="delete-project-modal canvas-director-capture-delete-modal"/);
  assert.match(html, /data-action="close-canvas-director-capture-delete-modal"/);
  assert.match(html, /data-action="confirm-canvas-director-capture-delete"/);
  assert.match(html, /确定删除这个视频吗/);
});
