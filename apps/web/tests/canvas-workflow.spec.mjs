import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CANVAS_NODE_SIZES,
  createDefaultCanvasDocument,
  createLegacyStarterCanvasDocument,
  isLegacyStarterCanvasDocument,
} from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { validateCanvasConnection } from "../src/features/production-workbench/canvas/canvas-edge-rules.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import { resolveCanvasMediaNodeSource } from "../src/features/production-workbench/canvas/canvas-media-node.js";
import {
  applyCanvasGraphInteractionMode,
  applyCanvasGraphEdgeStyle,
  applyCanvasGraphEdgeVisibility,
  applyCanvasGraphViewportPreferences,
  bindCanvasNativeNodeSelection,
  clearCanvasGraphEditorOverlay,
  enableCanvasGraphSnapline,
  enableCanvasGraphSelection,
  mountCanvasGraphEditorOverlay,
  normalizeCanvasEdgeStyle,
  alignSelectedCanvasNodes,
  canEmbedCanvasGraphNode,
  calculateCanvasDistributionPositions,
  classifyCanvasNodeMotion,
  distributeSelectedCanvasNodes,
  duplicateCanvasNodeForModifierDrag,
  resolveCanvasGraphInteractionOptions,
  resolveCanvasGraphMountSize,
  resolveCanvasBlankConnection,
  resolveCanvasStoryboardCutReference,
  reconcileCanvasWorkflowGraph,
  refreshCanvasWorkflowNode,
  selectCanvasNodeFromGraph,
  snapCanvasGraphNodesToGrid,
  syncCanvasGraphViewport,
  syncCanvasZoomControlDisplay,
} from "../src/features/production-workbench/canvas/canvas-x6-graph.js";
import {
  addCanvasNode,
  arrangeCanvasDocumentOnGrid,
  applyCanvasRunResult,
  buildCanvasRunPreview,
  buildCanvasSidebarItems,
  canvasUploadNodeAcceptsMedia,
  connectCanvasNodes,
  createCanvasClipboardSnapshot,
  createCanvasNodeFromTemplate,
  disconnectCanvasNodes,
  pasteCanvasClipboardSnapshot,
  resolveCanvasNodeTemplates,
  updateCanvasViewport,
  removeCanvasNode,
  restoreCanvasStoryboardCutImage,
  resolveCanvasModelOptions,
  resolveCanvasNodePlacement,
  updateCanvasNodeData,
} from "../src/features/production-workbench/canvas/canvas-state.js";

function loadCanvasGenericX6Renderer() {
  const source = readFileSync(
    new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("function renderCanvasGenericX6Node");
  const end = source.indexOf("export function refreshCanvasWorkflowGraph", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return Function("resolveCanvasMediaNodeSource", `"use strict";\n${source.slice(start, end)}\nreturn renderCanvasGenericX6Node;`)(resolveCanvasMediaNodeSource);
}

describe("canvas workflow document", () => {
  function createStarterCanvasDocument(input = {}) {
    return createLegacyStarterCanvasDocument(input);
  }

  it("reopens the editor when the selected X6 node is clicked again", () => {
    const selections = [];
    const workbench = {
      ui: { selectedCanvasNodeId: "node-1", canvasEditorOpen: false },
      onCanvasNodeSelected: (nodeId) => selections.push(nodeId),
    };

    selectCanvasNodeFromGraph(workbench, "node-1");

    assert.deepEqual(selections, ["node-1"]);
  });

  it("does not reopen an editor that is already open for the selected X6 node", () => {
    const selections = [];
    const workbench = {
      ui: { selectedCanvasNodeId: "node-1", canvasEditorOpen: true },
      onCanvasNodeSelected: (nodeId) => selections.push(nodeId),
    };

    selectCanvasNodeFromGraph(workbench, "node-1");

    assert.deepEqual(selections, []);
  });

  it("opens the X6 node editor from the native capture path without intercepting ports", () => {
    const handlers = new Map();
    const selections = [];
    const mount = {
      addEventListener: (type, handler, capture) => {
        if (type !== "comic-ai-canvas-node-select") assert.equal(capture, true);
        handlers.set(type, handler);
      },
    };
    const workbench = {
      ui: { selectedCanvasNodeId: "", canvasEditorOpen: false },
      onCanvasNodeSelected: (nodeId) => selections.push(nodeId),
    };
    const node = {
      classList: { contains: (className) => className === "canvas-x6-special-node" },
      dataset: { nodeId: "node-1" },
    };
    const port = { matches: (selector) => selector === "[magnet='true']" };
    const application = {
      classList: { contains: () => false },
      matches: (selector) => String(selector).includes("[role='application']"),
    };

    assert.equal(bindCanvasNativeNodeSelection(mount, workbench), true);
    handlers.get("pointerdown")({ composedPath: () => [node, application], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [node, application], clientX: 11, clientY: 11 });
    assert.deepEqual(selections, ["node-1"]);

    handlers.get("pointerdown")({ composedPath: () => [port, node], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [port, node], clientX: 10, clientY: 10 });
    assert.deepEqual(selections, ["node-1"]);

    const button = { matches: (selector) => String(selector).includes("button") };
    handlers.get("pointerdown")({ composedPath: () => [button, node, application], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [button, node, application], clientX: 10, clientY: 10 });
    assert.deepEqual(selections, ["node-1"]);

    const editorOverlay = {
      classList: { contains: (className) => className === "x6-node" },
      getAttribute: (name) => name === "data-cell-id" ? "__comic-ai-canvas-editor-overlay__" : "",
    };
    handlers.get("pointerdown")({ composedPath: () => [editorOverlay], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [editorOverlay], clientX: 10, clientY: 10 });
    assert.deepEqual(selections, ["node-1"]);
  });

  it("enables the X6 selection plugin for node and rubberband selection", () => {
    let selectionOptions = null;
    const rubberbandStyle = {};
    let correctedSelection = null;
    const handlers = new Map();
    const selectionHandlers = new Map();
    class Selection {
      constructor(options) { selectionOptions = options; }
      on(type, handler) { selectionHandlers.set(type, handler); return this; }
      reset(cells) { correctedSelection = cells; return this; }
    }
    const insideNode = { id: "inside", getBBox: () => ({ x: 360, y: 280, width: 80, height: 60 }), getData: () => ({}) };
    const outsideNode = { id: "outside", getBBox: () => ({ x: 700, y: 600, width: 80, height: 60 }), getData: () => ({}) };
    const graph = {
      container: {
        addEventListener: (type, handler) => handlers.set(type, handler),
        clientWidth: 1000,
        clientHeight: 600,
        getBoundingClientRect: () => ({ left: 100, top: 60, width: 500, height: 300 }),
        querySelector: (selector) => selector === ".x6-widget-selection-rubberband" ? { style: rubberbandStyle } : null,
      },
      use: (plugin) => { graph.plugin = plugin; },
      getPlugin: () => null,
      getNodes: () => [insideNode, outsideNode],
      localToClient: (rect) => rect,
    };

    assert.equal(enableCanvasGraphSelection({ Selection }, graph), true);
    assert.equal(graph.plugin instanceof Selection, true);
    const { filter, ...baseSelectionOptions } = selectionOptions;
    assert.deepEqual(baseSelectionOptions, {
      enabled: true,
      multiple: true,
      rubberband: true,
      showNodeSelectionBox: true,
    });
    assert.equal(filter({ getData: () => ({ canvasTransientEditor: true }) }), false);
    assert.equal(filter({ getData: () => ({}) }), true);
    const event = { clientX: 340, clientY: 260, offsetX: 999, offsetY: 999 };
    handlers.get("mousedown")(event);
    assert.equal(event.offsetX, 480);
    assert.equal(event.offsetY, 400);
    assert.equal(typeof selectionHandlers.get("box:mousemove"), "function");
    selectionHandlers.get("box:mousemove")({
      e: { clientX: 240, clientY: 160, data: { selection: { action: "selecting" } } },
    });
    assert.deepEqual(rubberbandStyle, {
      left: "280px",
      top: "200px",
      width: "200px",
      height: "200px",
    });
    assert.equal(typeof selectionHandlers.get("box:mouseup"), "function");
    selectionHandlers.get("box:mouseup")({
      e: { clientX: 600, clientY: 500, data: { selection: { action: "selecting" } } },
    });
    assert.deepEqual(correctedSelection.map((node) => node.id), ["inside"]);
    assert.deepEqual(rubberbandStyle, {
      left: "",
      top: "",
      width: "",
      height: "",
    });

    correctedSelection = null;
    const styleAfterRubberband = { ...rubberbandStyle };
    handlers.get("mousedown")({ clientX: 340, clientY: 260 });
    selectionHandlers.get("box:mousemove")({
      e: { clientX: 520, clientY: 420, data: { selection: { action: "translating" } } },
    });
    selectionHandlers.get("box:mouseup")({
      e: { clientX: 520, clientY: 420, data: { selection: { action: "translating" } } },
    });
    assert.deepEqual(rubberbandStyle, styleAfterRubberband);
    assert.equal(correctedSelection, null);
  });

  it("keeps X6 nodes movable while disabling rubberband selection in hand mode", () => {
    const options = resolveCanvasGraphInteractionOptions({ interactionMode: "hand" });
    assert.equal(options.interacting.nodeMovable, true);
    assert.equal(options.selecting.enabled, false);
    assert.equal(options.selecting.rubberband, false);
  });

  it("initializes the X6 selection plugin disabled in hand mode", async () => {
    let selectionOptions = null;
    class Selection {
      constructor(options) { selectionOptions = options; }
    }
    const graph = {
      use: () => {},
      getPlugin: () => null,
      container: {},
    };

    assert.equal(enableCanvasGraphSelection({ Selection }, graph, { interactionMode: "hand" }), true);
    assert.equal(selectionOptions.enabled, false);
    assert.equal(selectionOptions.rubberband, false);
  });

  it("mounts one transient X6 editor directly below its selected node", () => {
    const cells = new Map();
    const removals = [];
    const parent = {
      id: "node-1",
      isNode: () => true,
      getSize: () => ({ width: 360, height: 170 }),
      getPosition: () => ({ x: 220, y: 180 }),
      setZIndex: (...args) => { parent.zIndexArgs = args; },
    };
    cells.set(parent.id, parent);
    const graph = {
      getCellById: (id) => cells.get(id),
      addNode: (config) => {
        const node = { ...config, getData: () => config.data, getSize: () => ({ width: config.width, height: config.height }) };
        cells.set(config.id, node);
        return node;
      },
      removeCell: (...args) => {
        removals.push(args);
        cells.delete(args[0].id);
      },
    };

    assert.equal(mountCanvasGraphEditorOverlay(graph, "node-1", '<aside class="canvas-node-editor"></aside>'), true);
    const editor = cells.get("__comic-ai-canvas-editor-overlay__");
    assert.equal(editor.id, "__comic-ai-canvas-editor-overlay__");
    assert.equal(editor.x, 100);
    assert.equal(editor.y, 350);
    assert.equal(editor.zIndex, 1002);
    assert.deepEqual(parent.zIndexArgs, [1001]);
    assert.equal(clearCanvasGraphEditorOverlay(graph), true);
    assert.equal(removals.length, 1);
    assert.equal(removals[0].length, 1);

    const group = {
      id: "group-1",
      isNode: () => true,
      getData: () => ({ canvasNode: { type: "group" } }),
      setZIndex() { throw new Error("group must stay behind its children"); },
    };
    cells.set(group.id, group);
    assert.equal(mountCanvasGraphEditorOverlay(graph, group.id, '<aside class="canvas-node-editor"></aside>'), false);
    assert.equal(cells.has("__comic-ai-canvas-editor-overlay__"), false);
  });

  it("keeps editor controls from bubbling pointer drags into X6", () => {
    const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
    assert.match(source, /editor\?\.addEventListener\?\.\("pointerdown", \(event\) => event\.stopPropagation\(\)\)/);
    assert.match(source, /editor\?\.addEventListener\?\.\("mousedown", \(event\) => event\.stopPropagation\(\)\)/);
  });

  it("applies the selected connector style to every mounted X6 edge", () => {
    assert.equal(normalizeCanvasEdgeStyle(), "curve");
    const calls = [];
    let viewUpdates = 0;
    const graph = {
      options: { connecting: {} },
      getEdges: () => [{
        setRouter: (...args) => calls.push(["router", ...args]),
        setConnector: (...args) => calls.push(["connector", ...args]),
      }],
      findViewByCell: () => ({ update: () => { viewUpdates += 1; } }),
    };

    assert.equal(applyCanvasGraphEdgeStyle(graph, "curve"), true);
    assert.equal(calls[0][1], "normal");
    assert.equal(calls[1][1], "smooth");
    assert.deepEqual(graph.options.connecting.router, { name: "normal" });
    assert.deepEqual(graph.options.connecting.connector, { name: "smooth" });
    assert.equal(viewUpdates, 1);

    calls.length = 0;
    assert.equal(applyCanvasGraphEdgeStyle(graph, "orthogonal"), true);
    assert.equal(calls[0][1], "orth");
    assert.equal(calls[1][1], "rounded");
    assert.deepEqual(graph.options.connecting.router, { name: "orth", args: { padding: 26 } });
    assert.deepEqual(graph.options.connecting.connector, { name: "rounded", args: { radius: 12 } });
    assert.equal(viewUpdates, 2);
  });

  it("updates the Canvas zoom percentage while X6 is scaling", () => {
    const attributes = new Map();
    const zoomTrigger = {
      textContent: "100%",
      setAttribute: (name, value) => attributes.set(name, value),
    };
    const zoomInput = { value: "100" };
    const root = {
      querySelector: (selector) => selector === "[data-canvas-zoom-trigger]" ? zoomTrigger : zoomInput,
    };

    assert.equal(syncCanvasZoomControlDisplay(root, 1.376), true);
    assert.equal(zoomTrigger.textContent, "138%");
    assert.equal(attributes.get("aria-label"), "画布缩放比例 138%");
    assert.equal(zoomInput.value, "138");
    assert.equal(syncCanvasZoomControlDisplay(root, Number.NaN), false);
  });

  it("uses the stage size when the X6 mount has not been laid out yet", () => {
    assert.deepEqual(resolveCanvasGraphMountSize({
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 720 }) },
    }), { width: 1280, height: 720 });
  });

  it("uses logical Canvas dimensions instead of CSS-zoomed visual dimensions", () => {
    assert.deepEqual(resolveCanvasGraphMountSize({
      clientWidth: 1600,
      clientHeight: 900,
      getBoundingClientRect: () => ({ width: 1200, height: 675 }),
      parentElement: { getBoundingClientRect: () => ({ width: 1200, height: 675 }) },
    }), { width: 1600, height: 900 });
  });

  it("keeps the rich node layer aligned with the X6 viewport", () => {
    const style = new Map();
    let savedDocument = null;
    const workbench = {
      ui: { canvasDocument: createDefaultCanvasDocument({ canvasProjectId: "canvas-viewport" }) },
      root: {
        querySelector: () => ({
          style: { setProperty: (key, value) => style.set(key, value) },
        }),
      },
      updateCanvasDocument: (document) => {
        savedDocument = document;
      },
    };
    const graph = {
      translate: () => ({ tx: 48, ty: -24 }),
      zoom: () => 1.5,
    };

    assert.equal(syncCanvasGraphViewport(graph, workbench), true);
    assert.deepEqual(savedDocument.viewport, {
      x: 48,
      y: -24,
      zoom: 1.5,
      interactionMode: "default",
    });
    assert.deepEqual(workbench.ui.canvasDocument.viewport, savedDocument.viewport);
    assert.equal(style.get("--canvas-pan-x"), "48px");
    assert.equal(style.get("--canvas-pan-y"), "-24px");
    assert.equal(style.get("--canvas-zoom"), "1.5");
    assert.equal(style.get("--canvas-grid-size"), "30px");
    assert.equal(style.get("--canvas-grid-major-size"), "150px");
    assert.equal(style.get("--canvas-grid-x"), "48px");
    assert.equal(style.get("--canvas-grid-y"), "-24px");
    assert.equal(style.get("--canvas-input-scale"), String(1 / 1.5));
  });

  it("turns an X6 output released on blank canvas into a compatible-node menu request", () => {
    assert.deepEqual(resolveCanvasBlankConnection({
      isNew: true,
      type: "target",
      currentCell: null,
      currentPoint: { x: 480, y: 320 },
      edge: { getSource: () => ({ cell: "source-image-1", port: "out_image" }) },
    }), {
      sourceNodeId: "source-image-1",
      sourcePortId: "out_image",
      canvasX: 480,
      canvasY: 320,
    });
    assert.equal(resolveCanvasBlankConnection({ isNew: true, type: "target", currentCell: { id: "node-2" } }), null);
  });

  it("keeps a duplicate in place when Ctrl-dragging a non-group X6 node", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-clone-drag" }), {
      id: "node-1",
      type: "comment",
      position: { x: 120, y: 160 },
    });
    let savedDocument = null;
    let addedNode = null;
    const node = { id: "node-1", getData: () => ({ canvasNode: document.nodes[0] }) };
    const cloneId = duplicateCanvasNodeForModifierDrag({ addNode(value) { addedNode = value; } }, {
      ui: { canvasDocument: document },
      updateCanvasDocument(value) { savedDocument = value; },
    }, node, { ctrlKey: true, button: 0 });

    assert.equal(cloneId, "node-1-copy");
    assert.deepEqual(savedDocument.nodes.find((item) => item.id === cloneId).position, { x: 120, y: 160 });
    assert.equal(addedNode.id, cloneId);
    assert.equal(duplicateCanvasNodeForModifierDrag({}, { ui: { canvasDocument: document } }, node, { button: 0 }), null);
  });

  it("pastes a cut Canvas snapshot with new node IDs and remapped internal edges", () => {
    let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-clipboard" }), {
      id: "source-a", type: "source-image", position: { x: 10, y: 20 },
    });
    document = addCanvasNode(document, { id: "target-b", type: "ai-image", position: { x: 180, y: 20 } });
    document = {
      ...document,
      edges: [{ id: "edge-a-b", sourceNodeId: "source-a", sourcePortId: "out_image", targetNodeId: "target-b", targetPortId: "in_image" }],
    };
    const snapshot = createCanvasClipboardSnapshot(document, ["source-a", "target-b"]);
    const cutDocument = removeCanvasNode(removeCanvasNode(document, "source-a"), "target-b");
    const pasted = pasteCanvasClipboardSnapshot(cutDocument, snapshot);
    assert.deepEqual(pasted.nodeIds, ["source-a-copy", "target-b-copy"]);
    assert.equal(pasted.document.edges.length, 1);
    assert.deepEqual(
      [pasted.document.edges[0].sourceNodeId, pasted.document.edges[0].targetNodeId],
      ["source-a-copy", "target-b-copy"],
    );
  });

  it("only auto-embeds non-group nodes into group nodes", () => {
    const cell = (type) => ({ getData: () => ({ canvasNode: { type } }) });
    assert.equal(canEmbedCanvasGraphNode(cell("comment"), cell("group")), true);
    assert.equal(canEmbedCanvasGraphNode(cell("group"), cell("group")), false);
    assert.equal(canEmbedCanvasGraphNode(cell("comment"), cell("comment")), false);
  });

  it("calculates equal and Shift-adjacent distribution gap positions", () => {
    const items = [
      { id: "a", x: 0, y: 0, width: 100, height: 80 },
      { id: "b", x: 160, y: 20, width: 80, height: 80 },
      { id: "c", x: 300, y: 40, width: 120, height: 80 },
    ];
    assert.deepEqual([...calculateCanvasDistributionPositions(items, "horizontal", 40)], [
      ["a", 20], ["b", 160], ["c", 280],
    ]);
    assert.deepEqual([...calculateCanvasDistributionPositions(items, "horizontal", 100, 0)], [
      ["a", -20], ["b", 180],
    ]);
  });

  it("classifies X6 node enter and generation completion motion without animating unrelated updates", () => {
    assert.equal(classifyCanvasNodeMotion(null, { data: { status: "idle" } }), "entering");
    assert.equal(classifyCanvasNodeMotion(
      { data: { status: "running" } },
      { data: { status: "success" } },
    ), "completed");
    assert.equal(classifyCanvasNodeMotion(
      { data: { status: "success" } },
      { data: { status: "success", title: "已改名" } },
    ), null);
  });

  it("creates a blank canvas workflow document by default", () => {
    const document = createDefaultCanvasDocument({ canvasProjectId: "canvas-1" });

    assert.equal(document.version, 1);
    assert.equal(document.canvasProjectId, "canvas-1");
    assert.equal("projectId" in document, false);
    assert.equal("episodeId" in document, false);
    assert.equal(document.nodes.length, 0);
    assert.equal(document.edges.length, 0);
  });

  it("identifies the old starter workflow so cached blank projects can be reset", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });

    assert.equal(isLegacyStarterCanvasDocument(document), true);
    assert.deepEqual(document.nodes.map((node) => node.type), ["script", "send", "image"]);
    assert.deepEqual(document.edges.map((edge) => `${edge.sourceNodeId}:${edge.sourcePortId}->${edge.targetNodeId}:${edge.targetPortId}`), [
      "script-source:out_text->send-flow:in_text",
      "send-flow:out_image->image-result:in_image",
    ]);
  });

  it("allows compatible canvas ports and rejects mismatched links", () => {
    assert.deepEqual(
      validateCanvasConnection({ kind: "text", direction: "out" }, { kind: "text", direction: "in" }),
      { ok: true },
    );
    assert.deepEqual(
      validateCanvasConnection({ kind: "image", direction: "out" }, { kind: "text", direction: "in" }),
      { ok: false, reason: "canvas_connection_kind_mismatch" },
    );
    assert.deepEqual(
      validateCanvasConnection({ kind: "text", direction: "in" }, { kind: "text", direction: "in" }),
      { ok: false, reason: "canvas_connection_direction_invalid" },
    );
  });

  it("keeps selectable script sources separate from script storyboard nodes", () => {
    const templates = resolveCanvasNodeTemplates({});
    const scriptSource = templates.find((template) => template.id === "template-script-source");
    const scriptNode = templates.find((template) => template.id === "template-script");

    assert.deepEqual(
      { type: scriptSource?.type, title: scriptSource?.title, source: scriptSource?.defaultData?.source },
      { type: "source-text", title: "剧本源", source: "project_script" },
    );
    assert.deepEqual(
      { type: scriptNode?.type, title: scriptNode?.title },
      { type: "script", title: "脚本节点" },
    );

    const render = loadCanvasGenericX6Renderer();
    const scriptSourceHtml = render({
      id: "script-source",
      type: "source-text",
      data: { title: "剧本源", source: "project_script", text: "" },
    });
    assert.match(scriptSourceHtml, /data-action="open-canvas-script-picker" data-node-id="script-source">选择剧本<\/button>/);
  });
  it("round trips the canvas document through X6 graph data", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const x6Data = canvasDocumentToX6Data(document);
    const nextDocument = canvasDocumentFromX6Data(x6Data, document);

    assert.equal(x6Data.nodes.length, 3);
    assert.equal(x6Data.edges.length, 2);
    assert.equal(x6Data.edges.every((edge) => edge.shape === "comic-ai-canvas-edge"), true);
    assert.equal(x6Data.edges.every((edge) => edge.attrs.lines?.connection === true), true);
    assert.equal(x6Data.nodes[0].shape, "comic-ai-canvas-special-media-node");
    assert.equal(x6Data.nodes[0].attrs.title.text, "脚本节点");
    assert.equal(x6Data.nodes[0].attrs.status.text, "ready");
    assert.equal(typeof x6Data.nodes[0].attrs.summary.text, "string");
    assert.equal(nextDocument.nodes.length, document.nodes.length);
    assert.equal(nextDocument.edges.length, document.edges.length);
    assert.deepEqual(nextDocument.nodes.map((node) => node.position), document.nodes.map((node) => node.position));
  });

  it("keeps ordinary source nodes square while giving the script workflow room for controls", () => {
    const sourceTypes = ["script", "upload", "source-text", "source-image", "source-video", "source-audio"];
    const document = {
      ...createDefaultCanvasDocument({ canvasProjectId: "canvas-source-squares" }),
      nodes: sourceTypes.map((type, index) => ({
        id: `source-${index}`,
        type,
        position: { x: index * 360, y: 0 },
        size: { width: 390, height: 220 },
        data: { ports: { inputs: [], outputs: [] } },
      })),
    };

    const x6Data = canvasDocumentToX6Data(document);

    assert.deepEqual(CANVAS_NODE_SIZES.script, { width: 500, height: 420 });
    for (const type of sourceTypes.filter((type) => type !== "script")) {
      assert.deepEqual(CANVAS_NODE_SIZES[type], { width: 300, height: 300 });
    }
    assert.deepEqual(
      x6Data.nodes.map((node) => ({ width: node.width, height: node.height })),
      sourceTypes.map((type) => type === "script" ? ({ width: 500, height: 420 }) : ({ width: 300, height: 300 })),
    );
  });

  it("adds editable canvas nodes without touching global workbench model selection", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const workbenchUi = { selectedModelId: "global-video-model" };
    const nextDocument = addCanvasNode(document, {
      type: "video",
      position: { x: 480, y: 360 },
      modelCode: "seedance-video-2",
    });
    const videoNode = nextDocument.nodes.at(-1);

    assert.equal(videoNode.type, "video");
    assert.equal(videoNode.data.modelCode, "seedance-video-2");
    assert.equal(videoNode.data.ports.inputs[0].kind, "image");
    assert.deepEqual(videoNode.data.ports.inputs[0].accepts, ["text", "image", "video", "audio"]);
    assert.equal(workbenchUi.selectedModelId, "global-video-model");
  });

  it("places newly added nodes without covering existing nodes", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-placement" }), {
      type: "ai-image",
      id: "ai-image-1",
      position: { x: 220, y: 180 },
    });

    const position = resolveCanvasNodePlacement(document, {
      type: "ai-image",
      position: { x: 220, y: 180 },
    });

    assert.notDeepEqual(position, { x: 220, y: 180 });
    assert.ok(position.x + 420 + 24 <= 220 || position.x >= 220 + 420 + 24 || position.y + 378 + 24 <= 180 || position.y >= 180 + 378 + 24);

    const legacyScriptDocument = {
      ...createDefaultCanvasDocument({ canvasProjectId: "canvas-legacy-script-placement" }),
      nodes: [{
        id: "script-source",
        type: "script",
        position: { x: 220, y: 180 },
        size: { width: 330, height: 160 },
        data: {},
      }],
    };
    const legacyScriptPosition = resolveCanvasNodePlacement(legacyScriptDocument, {
      type: "ai-image",
      position: { x: 220, y: 364 },
    });

    assert.notDeepEqual(legacyScriptPosition, { x: 220, y: 364 });
    assert.ok(
      legacyScriptPosition.x + 420 + 24 <= 220
      || legacyScriptPosition.x >= 220 + 300 + 24
      || legacyScriptPosition.y + 378 + 24 <= 180
      || legacyScriptPosition.y >= 180 + 300 + 24,
    );
  });

  it("keeps character-captured nodes and their edges in the document while hiding them from X6", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const hiddenDocument = updateCanvasNodeData(document, "image-result", {
      hiddenByCharacterId: "character-1",
    });
    const x6Data = canvasDocumentToX6Data(hiddenDocument);
    const restoredDocument = canvasDocumentFromX6Data(x6Data, hiddenDocument);

    assert.equal(x6Data.nodes.some((node) => node.id === "image-result"), false);
    assert.equal(x6Data.edges.some((edge) => edge.target.cell === "image-result"), false);
    assert.equal(restoredDocument.nodes.find((node) => node.id === "image-result")?.data.hiddenByCharacterId, "character-1");
    assert.equal(restoredDocument.edges.some((edge) => edge.targetNodeId === "image-result"), true);
  });

  it("allows image and video nodes to accept their supported input media kinds", () => {
    const imageNode = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
      type: "send",
      defaultData: { mediaKind: "image" },
    });
    const videoNode = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
      type: "video",
      defaultData: { mediaKind: "video" },
    });

    assert.deepEqual(imageNode.data.ports.inputs[0].accepts, ["text", "image"]);
    assert.deepEqual(videoNode.data.ports.inputs[0].accepts, ["text", "image", "video", "audio"]);
  });

  it("creates script workflow nodes as text-to-storyboard tools", () => {
    const scriptNode = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
      type: "script",
      defaultData: { title: "脚本分镜" },
    });

    assert.deepEqual(scriptNode.data.ports.inputs, [{ id: "in_text", kind: "text", label: "剧本/小说" }]);
    assert.deepEqual(scriptNode.data.ports.outputs, [{ id: "out_text", kind: "text", label: "分镜" }]);
  });

  it("adds the text input port to existing script workflow nodes in X6", () => {
    const legacyScript = {
      id: "script-legacy",
      type: "script",
      position: { x: 120, y: 160 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text", label: "文本" }] } },
    };
    const x6Node = canvasDocumentToX6Data({ nodes: [legacyScript], edges: [] }).nodes[0];

    assert.deepEqual(x6Node.data.canvasNode.data.ports.inputs, [{ id: "in_text", kind: "text", label: "剧本/小说" }]);
    assert.deepEqual(x6Node.ports.items.map((port) => port.id), ["in_text", "out_text"]);
  });

  it("persists the injected script input port when an edge is connected", () => {
    const legacyScript = {
      id: "script-legacy",
      type: "script",
      position: { x: 120, y: 160 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text", label: "文本" }] } },
    };
    const textSource = {
      id: "text-source",
      type: "source-text",
      position: { x: 0, y: 160 },
      data: { ports: { inputs: [], outputs: [{ id: "out_text", kind: "text", label: "文本" }] } },
    };
    const restoredDocument = canvasDocumentFromX6Data({
      nodes: canvasDocumentToX6Data({ nodes: [legacyScript, textSource], edges: [] }).nodes,
      edges: [{
        id: "edge-text-script",
        source: { cell: "text-source", port: "out_text" },
        target: { cell: "script-legacy", port: "in_text" },
      }],
    }, { nodes: [legacyScript, textSource], edges: [] });

    assert.deepEqual(restoredDocument.nodes.find((node) => node.id === "script-legacy")?.data.ports.inputs, [
      { id: "in_text", kind: "text", label: "剧本/小说" },
    ]);
    assert.equal(restoredDocument.edges[0]?.targetPortId, "in_text");
  });

  it("clears the transient script connection state after an edge is removed", () => {
    const scriptNode = {
      id: "script-connected",
      type: "script",
      position: { x: 120, y: 160 },
      data: { __canvasHasTextInput: true },
    };
    const x6Node = canvasDocumentToX6Data({ nodes: [scriptNode], edges: [] }).nodes[0];

    assert.equal(x6Node.data.canvasNode.data.__canvasHasTextInput, undefined);
  });

  it("keeps director desk as an output-only node, including persisted nodes", () => {
    const directorNode = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
      type: "ai-director",
      defaultData: { title: "导演台" },
    });
    assert.deepEqual(directorNode.data.ports.inputs, []);
    assert.deepEqual(directorNode.data.ports.outputs, [{ id: "out_text", kind: "text", label: "导演指令" }]);

    const persistedNode = {
      id: "director-1",
      type: "ai-director",
      position: { x: 100, y: 100 },
      data: {
        ports: {
          inputs: [{ id: "in_any", kind: "any", label: "资源" }],
          outputs: [{ id: "out_text", kind: "text", label: "导演指令" }],
        },
      },
    };
    const x6Node = canvasDocumentToX6Data({ nodes: [persistedNode], edges: [] }).nodes[0];
    assert.deepEqual(x6Node.ports.items.map((port) => port.id), ["out_text"]);
  });

  it("connects compatible nodes as executable workflow edges", () => {
    const document = addCanvasNode(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), {
      type: "image",
      id: "image-second",
      position: { x: 1280, y: 240 },
    });

    const result = connectCanvasNodes(document, {
      sourceNodeId: "image-result",
      sourcePortId: "out_image",
      targetNodeId: "image-second",
      targetPortId: "in_image",
    });

    assert.equal(result.ok, true);
    assert.equal(result.edge.sourceNodeId, "image-result");
    assert.equal(result.edge.targetNodeId, "image-second");
    assert.equal(result.edge.data.kind, "image");
    assert.equal(
      result.document.edges.some((edge) => edge.sourceNodeId === "image-result" && edge.targetNodeId === "image-second"),
      true,
    );

    const textToImage = connectCanvasNodes(result.document, {
      sourceNodeId: "script-source",
      sourcePortId: "out_text",
      targetNodeId: "image-second",
      targetPortId: "in_image",
    });

    assert.equal(textToImage.ok, true);
    assert.equal(textToImage.edge.data.kind, "text");

    const invalid = connectCanvasNodes(textToImage.document, {
      sourceNodeId: "image-second",
      sourcePortId: "in_image",
      targetNodeId: "script-source",
      targetPortId: "out_text",
    });

    assert.equal(invalid.ok, false);
    assert.equal(invalid.reason, "canvas_connection_direction_invalid");
  });

  it("disconnects workflow edges when dragged back from input to output", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });

    const result = disconnectCanvasNodes(document, {
      sourceNodeId: "send-flow",
      sourcePortId: "out_image",
      targetNodeId: "image-result",
      targetPortId: "in_image",
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.document.edges.some((edge) => edge.sourceNodeId === "send-flow" && edge.targetNodeId === "image-result"),
      false,
    );

    const missing = disconnectCanvasNodes(result.document, {
      sourceNodeId: "send-flow",
      sourcePortId: "out_image",
      targetNodeId: "image-result",
      targetPortId: "in_image",
    });

    assert.equal(missing.ok, false);
  });

  it("exposes Liblib-like template groups for adding common workflow nodes", () => {
    const templates = resolveCanvasNodeTemplates({
      models: [
        { modelCode: "image-live", modelLabel: "Image Live", supportedModes: ["single-image"] },
        { modelCode: "video-live", modelLabel: "Video Live", supportedModes: ["first-frame"] },
      ],
    });

    const templateKeys = templates.map((template) => `${template.group}:${template.type}`);
    assert.ok(["节点:script", "节点:send", "节点:video", "来源:upload"].every((key) => templateKeys.includes(key)));
    assert.equal(templates.find((template) => template.type === "send").defaultData.modelCode, "image-live");
    assert.equal(templates.find((template) => template.type === "video").defaultData.modelCode, "video-live");
  });

  it("creates nodes from templates with default labels, prompts, and media kind", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const node = createCanvasNodeFromTemplate(document, {
      type: "send",
      position: { x: 640, y: 260 },
      defaultData: {
        title: "文生图发送",
        modelCode: "image-live",
        prompt: "生成电影感分镜",
        mediaKind: "image",
      },
    });

    assert.equal(node.type, "send");
    assert.equal(node.position.x, 640);
    assert.equal(node.data.title, "文生图发送");
    assert.equal(node.data.modelCode, "image-live");
    assert.equal(node.data.prompt, "生成电影感分镜");
    assert.equal(node.data.mediaKind, "image");
  });

  it("builds sidebar items for node and asset modes", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nodeItems = buildCanvasSidebarItems(document, {
      mode: "nodes",
      assets: [{ id: "asset-1", title: "角色立绘", kind: "character" }],
    });
    const assetItems = buildCanvasSidebarItems(document, {
      mode: "assets",
      assets: [{ id: "asset-1", title: "角色立绘", kind: "character" }],
    });

    assert.equal(nodeItems.length, 3);
    assert.deepEqual(assetItems, [
      {
        id: "asset-1",
        type: "asset",
        kind: "character",
        title: "角色立绘",
        meta: "素材",
        status: "ready",
      },
    ]);
  });

  it("updates canvas viewport preferences without mutating nodes", () => {
    const document = createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nextDocument = updateCanvasViewport(document, {
      zoom: 1.25,
      x: -120,
      y: 80,
      snapEnabled: false,
    });

    assert.deepEqual(nextDocument.viewport, {
      x: -120,
      y: 80,
      zoom: 1.25,
      snapEnabled: false,
      interactionMode: "default",
    });
    assert.deepEqual(nextDocument.nodes, document.nodes);
    assert.equal(updateCanvasViewport(document, { zoom: 0.1 }).viewport.zoom, 0.1);
    assert.equal(updateCanvasViewport(document, { zoom: 8 }).viewport.zoom, 8);
  });

  it("updates send node prompt and model from existing generation config options", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const options = resolveCanvasModelOptions(
      {
        models: [
          { modelCode: "image-live", modelLabel: "Image Live", supportedModes: ["single-image"] },
          { modelCode: "video-live", modelLabel: "Video Live", supportedModes: ["first-frame"] },
        ],
      },
      "image",
    );
    const nextDocument = updateCanvasNodeData(document, "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: options[0].modelCode,
      mediaKind: "image",
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");

    assert.deepEqual(options.map((model) => model.modelCode), ["image-live"]);
    assert.equal(sendNode.data.prompt, "Generate first interior storyboard");
    assert.equal(sendNode.data.modelCode, "image-live");
  });

  it("builds a run preview when a generation node has a prompt, connected text, and model", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const emptyPromptDocument = {
      ...updateCanvasNodeData(document, "send-flow", { prompt: "   " }),
      edges: [],
    };
    const readyDocument = updateCanvasNodeData(document, "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });

    assert.deepEqual(buildCanvasRunPreview(emptyPromptDocument, "send-flow"), {
      ok: false,
      reason: "canvas_run_input_required",
    });
    assert.deepEqual(buildCanvasRunPreview(readyDocument, "send-flow"), {
      ok: true,
      nodeId: "send-flow",
      mediaKind: "image",
      modelCode: "image-live",
      prompt: "Generate first interior storyboard",
      nodePrompt: "Generate first interior storyboard",
      videoGenerationMode: "",
      upstreamNodeIds: ["script-source"],
      upstreamTextFragments: [],
    });
  });

  it("runs AI text and Markdown nodes with text models and storyboard with image models", () => {
    const textModels = resolveCanvasModelOptions({
      models: [{ modelCode: "text-live", modelLabel: "Text Live", mediaType: "text", enabled: true }],
    }, "text");
    assert.deepEqual(textModels.map((model) => model.modelCode), ["text-live"]);

    let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-text" }), { type: "ai-text", id: "ai-text-1" });
    document = updateCanvasNodeData(document, "ai-text-1", { prompt: "改写这一段", modelCode: "text-live", mediaKind: "text" });
    const preview = buildCanvasRunPreview(document, "ai-text-1");
    assert.equal(preview.ok, true);
    assert.equal(preview.mediaKind, "text");

    const completed = applyCanvasRunResult(document, preview, {
      status: "succeeded",
      result: { text: "改写后的正文" },
      artifact: { metadata: { text: "改写后的正文" } },
    });
    assert.equal(completed.nodes.find((node) => node.id === "ai-text-1").data.text, "改写后的正文");

    const storyboardTemplate = resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-storyboard");
    assert.equal(storyboardTemplate.title, "图片切分");
    assert.equal(resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-director").title, "导演台");
    assert.equal(resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-panorama").title, "全景预览");
    const storyboard = createCanvasNodeFromTemplate(
      createDefaultCanvasDocument({ canvasProjectId: "canvas-storyboard" }),
      storyboardTemplate,
    );
    assert.equal(storyboard.data.mediaKind, "image");
  });

  it("allows upload nodes to switch their output port to the uploaded media kind", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ projectId: "project-1" }), { type: "upload" });
    const nodeId = document.nodes.at(-1).id;
    const nextDocument = updateCanvasNodeData(document, nodeId, {
      mediaKind: "audio",
      ports: { inputs: [], outputs: [{ id: "out_audio", kind: "audio", label: "音频" }] },
    });

    assert.deepEqual(nextDocument.nodes.at(-1).data.ports.outputs, [{ id: "out_audio", kind: "audio", label: "音频" }]);
  });

  it("accepts matching media files on canonical source and special nodes", () => {
    assert.equal(canvasUploadNodeAcceptsMedia("upload", "audio"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("source-image", "image"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("source-video", "video"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("source-audio", "audio"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("ai-panorama", "image"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("ai-storyboard", "image"), true);
    assert.equal(canvasUploadNodeAcceptsMedia("source-image", "video"), false);
    assert.equal(canvasUploadNodeAcceptsMedia("ai-storyboard", "audio"), false);
  });

  it("combines connected text nodes with the generation node prompt", () => {
    const document = updateCanvasNodeData(
      createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }),
      "script-source",
      { text: "第一章：主角进入废墟。" },
    );
    const promptOnlyFromText = buildCanvasRunPreview(document, "send-flow");
    const promptWithLocalInstruction = buildCanvasRunPreview(
      updateCanvasNodeData(document, "send-flow", { prompt: "生成电影感视频，镜头缓慢推进。" }),
      "send-flow",
    );

    assert.equal(promptOnlyFromText.prompt, "第一章：主角进入废墟。");
    assert.equal(promptOnlyFromText.nodePrompt, "");
    assert.equal(promptOnlyFromText.upstreamTextFragments[0].text, "第一章：主角进入废墟。");
    assert.equal(
      promptWithLocalInstruction.prompt,
      "第一章：主角进入废墟。\n\n生成电影感视频，镜头缓慢推进。",
    );
  });

  it("keeps connected media aliases in the prompt without resolving image sources as text nodes", () => {
    let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-media-prompt" }), {
      type: "source-image",
      id: "image-source-1",
    });
    document = addCanvasNode(document, { type: "source-image", id: "image-source-2" });
    document = addCanvasNode(document, { type: "ai-image", id: "image-generator" });
    document = updateCanvasNodeData(document, "image-generator", {
      prompt: "背景改为蓝色 @node:image-source-1 @node:image-source-2",
      modelCode: "image-live",
      mediaKind: "image",
    });
    document = {
      ...document,
      edges: [
        {
          id: "edge-image-1",
          sourceNodeId: "image-source-1",
          sourcePortId: "out_image",
          targetNodeId: "image-generator",
          targetPortId: "in_image",
          data: { kind: "image" },
        },
        {
          id: "edge-image-2",
          sourceNodeId: "image-source-2",
          sourcePortId: "out_image",
          targetNodeId: "image-generator",
          targetPortId: "in_image",
          data: { kind: "image" },
        },
      ],
    };

    const preview = buildCanvasRunPreview(document, "image-generator");

    assert.equal(preview.ok, true);
    assert.equal(preview.prompt, "背景改为蓝色 【@图1】 【@图2】");
    assert.doesNotMatch(preview.prompt, /@node:/);
    assert.equal(preview.promptReferences, undefined);
  });

  it("recognizes text-only transcription without requiring an audio model", () => {
    const document = {
      ...createDefaultCanvasDocument({ canvasProjectId: "canvas-text-transcription" }),
      nodes: [
        {
          id: "source-text",
          type: "source-text",
          data: { mediaKind: "text", text: "第一句。\n第二句。" },
        },
        {
          id: "audio-tool",
          type: "ai-audio",
          data: { mediaKind: "audio", audioGenerationMode: "transcription", prompt: "" },
        },
      ],
      edges: [{
        id: "text-to-transcription",
        sourceNodeId: "source-text",
        sourcePortId: "out_text",
        targetNodeId: "audio-tool",
        targetPortId: "in_audio",
        data: { kind: "text" },
      }],
    };

    const preview = buildCanvasRunPreview(document, "audio-tool");

    assert.equal(preview.ok, true);
    assert.equal(preview.modelCode, "");
    assert.equal(preview.plainTextTranscription, true);
    assert.equal(preview.prompt, "第一句。\n第二句。");
    assert.deepEqual(preview.upstreamTextFragments.map((item) => item.nodeId), ["source-text"]);
  });

  it("keeps connected audio transcription on the configured provider path", () => {
    const document = {
      ...createDefaultCanvasDocument({ canvasProjectId: "canvas-audio-transcription" }),
      nodes: [
        { id: "source-audio", type: "source-audio", data: { mediaKind: "audio", storageObjectId: "storage-1" } },
        {
          id: "audio-tool",
          type: "ai-audio",
          data: {
            mediaKind: "audio",
            audioGenerationMode: "transcription",
            modelCode: "audio-transcriber",
            prompt: "术语提示",
          },
        },
      ],
      edges: [{
        id: "audio-to-transcription",
        sourceNodeId: "source-audio",
        sourcePortId: "out_audio",
        targetNodeId: "audio-tool",
        targetPortId: "in_audio",
        data: { kind: "audio" },
      }],
    };

    const preview = buildCanvasRunPreview(document, "audio-tool");

    assert.equal(preview.ok, true);
    assert.equal(preview.modelCode, "audio-transcriber");
    assert.equal(preview.plainTextTranscription, false);
  });

  it("synchronizes generated lyrics and stable task/artifact ids into the music node", () => {
    const document = {
      ...createDefaultCanvasDocument({ canvasProjectId: "canvas-music" }),
      nodes: [{
        id: "music-tool",
        type: "ai-audio",
        data: {
          mediaKind: "audio",
          audioGenerationMode: "music",
          modelCode: "music-model",
          prompt: "温暖的片尾曲",
          lyricsMode: "generate",
        },
      }],
      edges: [],
    };
    const preview = buildCanvasRunPreview(document, "music-tool");
    const nextDocument = applyCanvasRunResult(document, preview, {
      taskId: "music-task-1",
      status: "succeeded",
      artifact: { id: "music-artifact-1", artifactKind: "audio" },
      resultAssets: [{ lyrics: "沿着微光回家", lyricsMode: "generate" }],
    });
    const musicNode = nextDocument.nodes[0];

    assert.equal(musicNode.data.lyrics, "沿着微光回家");
    assert.equal(musicNode.data.lyricsMode, "generate");
    assert.equal(musicNode.data.lyricsTaskId, "music-task-1");
    assert.equal(musicNode.data.lyricsArtifactId, "music-artifact-1");
    assert.equal(JSON.stringify(musicNode.data).includes("base64"), false);
  });

  it("renders editable lyrics controls and sends explicit text-only transcription input", () => {
    const editorSource = readFileSync(
      new URL("../src/features/production-workbench/project-detail.js", import.meta.url),
      "utf8",
    );
    const workbenchSource = readFileSync(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );

    assert.match(editorSource, /data-canvas-audio-field="lyricsMode"/);
    assert.match(editorSource, /data-canvas-audio-field="lyrics"/);
    assert.match(editorSource, /canvasModelMatchesAudioMode\(model\.raw, audioMode\)/);
    assert.match(workbenchSource, /parameters\.generateLyrics = parameters\.lyricsMode === "generate"/);
    assert.match(workbenchSource, /parameters\.autoGenerateLyrics = parameters\.generateLyrics/);
    assert.match(workbenchSource, /audioPayload\.transcriptionInputKind = "text"/);
    assert.match(workbenchSource, /const storageObjectId = String\(data\.storageObjectId/);
  });

  it("applies submitted canvas run tasks to connected result nodes", () => {
    const document = updateCanvasNodeData(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      platform: { tasks: [{ taskId: "task-canvas-1" }] },
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");
    const resultEdge = nextDocument.edges.find((edge) => edge.id === "edge-send-image");

    assert.equal(sendNode.data.status, "queued");
    assert.equal(sendNode.data.lastTaskId, "task-canvas-1");
    assert.equal(resultNode.data.status, "queued");
    assert.equal(resultNode.data.taskId, "task-canvas-1");
    assert.equal(resultNode.data.modelCode, "image-live");
    assert.equal(resultNode.data.prompt, "Generate first interior storyboard");
    assert.equal(resultEdge.data.status, "queued");
  });

  it("writes generated output item urls into canvas image nodes", () => {
    const document = updateCanvasNodeData(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      taskId: "task-canvas-generated-1",
      status: "completed",
      generatedOutputItems: [
        {
          kind: "image",
          storageObjectId: "10000000-0000-4000-8000-000000000123",
          previewUrl: "https://example.test/canvas-generated.png",
          sourceUrl: "https://example.test/canvas-generated-source.png",
        },
      ],
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");

    assert.equal(sendNode.data.status, "completed");
    assert.equal(sendNode.data.storageObjectId, "10000000-0000-4000-8000-000000000123");
    assert.equal(sendNode.data.previewUrl, "https://example.test/canvas-generated.png");
    assert.equal(sendNode.data.resultUrl, "https://example.test/canvas-generated.png");
    assert.equal(resultNode.data.status, "completed");
    assert.equal(resultNode.data.storageObjectId, "10000000-0000-4000-8000-000000000123");
    assert.equal(resultNode.data.previewUrl, "https://example.test/canvas-generated.png");
  });

  it("maps generation task stages to the fixed canvas progress milestones", () => {
    const document = updateCanvasNodeData(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate first interior storyboard",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      taskId: "task-canvas-progress-1",
      status: "running",
      progress_stage: "saving_asset",
      progress_percent: 87,
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");

    assert.equal(sendNode.data.status, "running");
    assert.equal(sendNode.data.generationProgress, 75);
    assert.equal(sendNode.data.generationStage, "saving_asset");
    assert.equal(resultNode.data.generationProgress, 75);
    assert.equal(resultNode.data.generationStage, "saving_asset");
  });

  it("uses 25, 50, and 75 percent for queued, generating, and cloud storage stages", () => {
    const document = updateCanvasNodeData(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate milestone samples",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");

    const queued = applyCanvasRunResult(document, preview, { taskId: "task-queued", status: "queued", progress_stage: "task_created", progress_percent: 10 });
    const generating = applyCanvasRunResult(document, preview, { taskId: "task-running", status: "running", progress_stage: "provider_rendering", progress_percent: 64 });
    const storing = applyCanvasRunResult(document, preview, { taskId: "task-storage", status: "running", progress_stage: "artifact_persisting", progress_percent: 91 });

    assert.equal(queued.nodes.find((node) => node.id === "send-flow").data.generationProgress, 25);
    assert.equal(generating.nodes.find((node) => node.id === "send-flow").data.generationProgress, 50);
    assert.equal(storing.nodes.find((node) => node.id === "send-flow").data.generationProgress, 75);
  });

  it("writes image generation failures into canvas nodes", () => {
    const document = updateCanvasNodeData(createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), "send-flow", {
      prompt: "Generate failed image",
      modelCode: "image-live",
      mediaKind: "image",
    });
    const preview = buildCanvasRunPreview(document, "send-flow");
    const nextDocument = applyCanvasRunResult(document, preview, {
      taskId: "task-canvas-failed-1",
      status: "failed",
      failureCode: "cumob_image_503",
      failure: {
        failureCode: "cumob_image_503",
        displayMessage: "图片模型服务返回 HTTP 503，请稍后重试。",
      },
    });
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");

    assert.equal(resultNode.data.status, "failed");
    assert.equal(resultNode.data.failureCode, "cumob_image_503");
    assert.equal(resultNode.data.failureMessage, "图片模型服务返回 HTTP 503，请稍后重试。");
  });

  it("removes a canvas node and its attached edges", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const nextDocument = removeCanvasNode(document, "send-flow");

    assert.deepEqual(nextDocument.nodes.map((node) => node.id), ["script-source", "image-result"]);
    assert.deepEqual(nextDocument.edges, []);
  });

  it("returns a legacy storyboard cut image to its source cell and removes attached edges", () => {
    let document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-storyboard-return" }), {
      id: "storyboard-source",
      type: "ai-storyboard",
    });
    document = updateCanvasNodeData(document, "storyboard-source", {
      storyboardRows: 1,
      storyboardCols: 2,
      storyboardExtracted: [false, true],
    });
    document = addCanvasNode(document, { id: "storyboard-cut", type: "source-image" });
    document = updateCanvasNodeData(document, "storyboard-cut", {
      title: "分镜 1-2",
      source: "canvas_derivation",
      parentNodeId: "storyboard-source",
      url: "/cut-image.png",
    });
    document = addCanvasNode(document, { id: "image-consumer", type: "ai-image" });
    const connected = connectCanvasNodes(document, {
      sourceNodeId: "storyboard-cut",
      sourcePortId: "out_image",
      targetNodeId: "image-consumer",
      targetPortId: "in_asset",
    });
    assert.equal(connected.ok, true);
    assert.deepEqual(
      resolveCanvasStoryboardCutReference(connected.document.nodes.find((node) => node.id === "storyboard-cut")),
      { storyboardNodeId: "storyboard-source", cellIndex: null, row: 0, column: 1 },
    );

    const restored = restoreCanvasStoryboardCutImage(connected.document, "storyboard-cut");
    const sourceNode = restored.document.nodes.find((node) => node.id === "storyboard-source");
    assert.equal(restored.ok, true);
    assert.equal(restored.storyboardNodeId, "storyboard-source");
    assert.equal(restored.cellIndex, 1);
    assert.equal(restored.disconnectedEdgeCount, 1);
    assert.equal(restored.document.nodes.some((node) => node.id === "storyboard-cut"), false);
    assert.deepEqual(restored.document.edges, []);
    assert.deepEqual(sourceNode.data.storyboardExtracted, [false, false]);
    assert.deepEqual(sourceNode.data.storyboardOverrides[1], {
      url: "/cut-image.png",
      label: "分镜 1-2",
    });

    const ordinaryImage = restoreCanvasStoryboardCutImage(restored.document, "image-consumer");
    assert.equal(ordinaryImage.ok, false);
    assert.equal(ordinaryImage.document, restored.document);
  });

  it("renders unified HTML nodes while X6 owns selection dragging and ports", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ projectId: "project-1", episodeId: "episode-1" }), {
      type: "image",
      position: { x: 440, y: 320 },
    });
    const x6Data = canvasDocumentToX6Data(document);
    const imageNode = x6Data.nodes.at(-1);

    assert.equal(imageNode.shape, "comic-ai-canvas-special-media-node");
    assert.equal(imageNode.attrs.title.text, "图片结果");
    assert.equal(imageNode.attrs.summary.text, "等待生成结果");
    assert.equal(imageNode.ports.items.some((port) => port.group === "in"), true);
    assert.equal(imageNode.ports.items.some((port) => port.group === "out"), true);
  });

  it("keeps X6 image generation in the preparing state until a result URL arrives", () => {
    const render = loadCanvasGenericX6Renderer();
    const queued = render({
      id: "image-generation",
      type: "ai-image",
      data: {
        title: "AI 图片",
        status: "queued",
        generationProgress: 3,
        generationStage: "task_created",
        lastTaskId: "90e5c1fa-befd-49f9-86f9-06773722093e",
      },
    });
    assert.match(queued, /<small>排队中<\/small>/);
    assert.match(queued, /class="canvas-video-empty canvas-image-empty is-loading canvas-image-generation-mask"/);
    assert.match(queued, /正在生成图片/);
    assert.doesNotMatch(queued, /canvas-x6-generation-state|生成进度/);

    const running = render({
      type: "send",
      data: { status: "processing", generationProgress: 63, taskId: "task-63" },
    });
    assert.match(running, /<small>生成中<\/small>/);
    assert.match(running, /正在生成图片/);

    const regenerating = render({
      type: "ai-image",
      data: { status: "running", taskId: "task-regenerating", previewUrl: "https:\/\/example.test\/previous.png" },
    });
    assert.match(regenerating, /正在生成图片/);
    assert.doesNotMatch(regenerating, /previous\.png|canvas-image-preview/);

    const completedWithoutUrl = render({
      type: "ai-image",
      data: { status: "completed", taskId: "task-completed-without-url" },
    });
    assert.match(completedWithoutUrl, /正在生成图片/);

    const completedWithUrl = render({
      type: "ai-image",
      data: { status: "completed", taskId: "task-with-url", previewUrl: "https:\/\/example.test\/result.png" },
    });
    assert.match(completedWithUrl, /class="canvas-video-preview canvas-image-preview"/);
    assert.match(completedWithUrl, /src="https:\/\/example\.test\/result\.png"/);
    assert.doesNotMatch(completedWithUrl, /正在生成图片/);

    const completedWithStorageObject = render({
      type: "ai-image",
      data: { status: "completed", storageObjectId: "storage/result 1" },
    });
    assert.match(completedWithStorageObject, /src="\/api\/storage\/objects\/storage%2Fresult%201\/content\?proxy=1"/);

    const textRunning = render({
      type: "ai-markdown",
      data: {
        status: "running",
        generationProgress: 50,
        generationStage: "text_generating",
        summary: "这是刚刚流式返回的最新内容",
      },
    });
    assert.match(textRunning, /data-canvas-text-output/);
    assert.match(textRunning, /aria-live="polite"/);
    assert.match(textRunning, /这是刚刚流式返回的最新内容/);
    assert.match(textRunning, /class="canvas-x6-text-generation-mask"[^>]*aria-label="正在生成剧本中"/);
    assert.match(textRunning, /正在生成剧本中/);
    assert.doesNotMatch(textRunning, /canvas-x6-generation-state|生成中 50%|文本模型正在生成内容/);

    const scriptTextRunning = render({
      type: "ai-text",
      data: { status: "running", generationStage: "text_generating", summary: "剧本片段" },
    });
    assert.match(scriptTextRunning, /canvas-x6-text-generation-mask/);
    assert.match(scriptTextRunning, /正在生成剧本中/);

    const textCompleted = render({
      type: "ai-text",
      data: { status: "completed", summary: "剧本已生成" },
    });
    assert.doesNotMatch(textCompleted, /canvas-x6-text-generation-mask|正在生成剧本中/);
  });

  it("renders escaped X6 image generation failures without changing ordinary nodes", () => {
    const render = loadCanvasGenericX6Renderer();
    const failed = render({
      type: "ai-image",
      data: {
        status: "failed",
        failureMessage: "参考图不符合内容安全策略 <script>alert(1)</script>",
      },
    });
    assert.match(failed, /<small>失败<\/small>/);
    assert.match(failed, /class="canvas-x6-generation-state is-failure" role="alert"/);
    assert.match(failed, /<strong>生图失败<\/strong>/);
    assert.match(failed, /参考图不符合内容安全策略 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(failed, /<script>/);

    const ordinary = render({ type: "image", data: { status: "failed", failureMessage: "普通节点" } });
    assert.doesNotMatch(ordinary, /canvas-x6-generation-state/);
  });

  it("keeps script workflow as a connected-text conversion tool", () => {
    const render = loadCanvasGenericX6Renderer();
    const emptyScript = render({
      id: "script-source",
      type: "script",
      data: { summary: "请选择剧本内容" },
    });
    assert.match(emptyScript, /class="canvas-script-workflow-body"/);
    assert.match(emptyScript, /请连接剧本或文本节点。连接后可转换为角色、场景、道具和分镜。/);
    assert.match(emptyScript, /等待剧本或文本连接/);
    assert.doesNotMatch(emptyScript, /open-canvas-script-picker|open-canvas-script-workspace/);
    assert.match(emptyScript, /脚本分镜/);
    assert.doesNotMatch(emptyScript, /选择剧本|自己填写|小说生成|生成剧本/);

    const awaitingConfirmation = render({
      id: "script-source",
      type: "script",
      data: { __canvasHasTextInput: true },
    });
    assert.match(awaitingConfirmation, /已检测到剧本内容，可以开始生成分镜。/);
    assert.match(awaitingConfirmation, /class="canvas-script-workflow-confirm" aria-hidden="true">开始<\/div>/);
    assert.doesNotMatch(awaitingConfirmation, /open-canvas-script-start-modal/);

    const generating = render({
      id: "script-source",
      type: "script",
      data: { __canvasHasTextInput: true, workflowStatus: "running", workflowStage: "prop" },
    });
    assert.match(generating, /canvas-script-workflow-generating/);
    assert.match(generating, /正在生成道具中/);
    assert.match(generating, /data-action="open-canvas-script-workspace"[^>]*>查看实时提示词<\/button>/);

    const generated = render({
      id: "script-source",
      type: "script",
      data: { __canvasHasTextInput: true, workflowNodes: [{ id: "shot-1", kind: "storyboard" }] },
    });
    assert.match(generated, /分镜已生成/);

    const emptyTextSource = render({ id: "text-source", type: "source-text", data: {} });
    assert.match(emptyTextSource, /aria-label="文本源操作"/);
    assert.match(emptyTextSource, /<textarea class="canvas-x6-source-text-input" data-canvas-text-input data-canvas-source-text-input data-node-id="text-source" aria-label="文本内容" placeholder="请输入文本"><\/textarea>/);
    assert.doesNotMatch(emptyTextSource, /open-canvas-script-picker/);
    assert.doesNotMatch(emptyTextSource, />文本源<\/span>/);

    const populatedTextSource = render({ id: "text-source", type: "source-text", data: { text: "可直接输入的文本 <script>" } });
    assert.match(populatedTextSource, /可直接输入的文本 &lt;script&gt;/);
    assert.doesNotMatch(populatedTextSource, /<script>/);

    const populatedScript = render({
      id: "script-source",
      type: "script",
      data: { __canvasHasTextInput: true, summary: "请选择剧本内容", text: "第一场：雨夜。" },
    });
    assert.match(populatedScript, /canvas-script-workflow-actions/);
    assert.match(populatedScript, /class="canvas-script-workflow-confirm" aria-hidden="true">开始<\/div>/);
    assert.doesNotMatch(populatedScript, /第一场：雨夜。/);
    assert.doesNotMatch(populatedScript, /选择剧本|自己填写|小说生成|生成剧本/);

    const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
    const applyStart = workbenchSource.indexOf('if (action === "apply-canvas-script-episode")');
    const applyEnd = workbenchSource.indexOf('if (action === "delete-canvas-node")', applyStart);
    assert.match(workbenchSource.slice(applyStart, applyEnd), /refreshCanvasWorkflowNode\(workbench, nodeId\)/);

    const projectDetailSource = readFileSync(new URL("../src/features/production-workbench/project-detail.js", import.meta.url), "utf8");
    assert.match(projectDetailSource, /return renderLiblibGenerationEditor\(\{/);
    assert.match(projectDetailSource, /data-canvas-prompt-input/);
    assert.match(projectDetailSource, /submitAction: "run-canvas-script-workflow-start"/);
    assert.match(projectDetailSource, /renderCanvasGenerationSkillTrigger\(node\)/);
    assert.doesNotMatch(projectDetailSource, /canvas-script-generation-editor|data-canvas-script-workflow-instruction/);
    const styles = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
    assert.match(styles, /\.canvas-x6-special-node\.is-script-workflow\s*\{/);
    assert.match(styles, /\.canvas-stage\.is-x6-ready \.canvas-x6-special-node :is\(input, textarea, select, \[contenteditable="true"\]\)\s*\{[\s\S]*?scale\(var\(--canvas-input-scale, 1\)\)[\s\S]*?transform-origin:\s*center top/);
    assert.match(styles, /\.canvas-stage\.is-x6-ready \.canvas-x6-special-node\.is-source-text \.canvas-x6-source-text-input\s*\{[\s\S]*?transform:\s*none[\s\S]*?transform-origin:\s*initial/);
    assert.match(styles, /\.script-workspace-layer\s*\{[\s\S]*?position:\s*fixed/);
    assert.match(styles, /\.canvas-x6-generic-body > \.canvas-x6-source-text-input\s*\{[\s\S]*?resize:\s*none[\s\S]*?overflow-y:\s*auto/);
    const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
    const workbenchStyles = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
    assert.match(graphSource, /setProperty\?\.\("--canvas-input-scale", String\(1 \/ Math\.max\(0\.1, normalizedZoom\)\)\)/);
    assert.match(workbenchStyles, /\.canvas-stage\.is-x6-ready \.canvas-flow \.canvas-node-editor\s*\{[\s\S]*?scale\(var\(--canvas-input-scale, 1\)\)[\s\S]*?transform-origin:\s*center top/);
    assert.match(workbenchStyles, /\.canvas-stage\.is-x6-ready \.canvas-x6-editor-overlay\s*\{[\s\S]*?scale\(var\(--canvas-input-scale, 1\)\)[\s\S]*?transform-origin:\s*center top/);
    assert.match(graphSource, /followLatest:\s*!textOutput\.matches\?\.\("\[data-canvas-source-text-output\]"\)/);
  });

  it("styles X6 generation feedback with the existing Canvas theme variables", () => {
    const source = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
    assert.match(source, /\.canvas-x6-generation-state\s*\{[\s\S]*?var\(--new-canvas-control-border\)[\s\S]*?var\(--new-canvas-panel-soft\)[\s\S]*?var\(--new-canvas-foreground\)/);
    assert.match(source, /\.canvas-x6-generation-progress-head > span\s*\{[\s\S]*?var\(--new-canvas-accent-color\)/);
    assert.match(source, /\.canvas-x6-generation-stage,[\s\S]*?\.canvas-x6-generation-task\s*\{[\s\S]*?var\(--new-canvas-muted\)/);
    assert.match(source, /\.canvas-x6-generation-track > i\s*\{[\s\S]*?var\(--new-canvas-accent\)/);
    assert.match(source, /\.canvas-x6-generation-state\.is-failure\s*\{[\s\S]*?var\(--new-canvas-danger\)/);
  });

  it("keeps Markdown output scrollable without clamping streamed text", () => {
    const source = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
    assert.match(source, /\.canvas-x6-special-node:is\(\.is-markdown, \.is-ai-markdown\) \.canvas-x6-generic-body\s*\{[\s\S]*?min-height:\s*0/);
    assert.match(source, /\.canvas-x6-generic-body > \.canvas-x6-text-output\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?white-space:\s*pre-wrap[\s\S]*?-webkit-line-clamp:\s*unset/);
  });

  it("clamps legacy undersized nodes before rendering them in X6", () => {
    const document = addCanvasNode(createDefaultCanvasDocument({ canvasProjectId: "canvas-small" }), {
      type: "comment",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 30 },
    });
    const node = canvasDocumentToX6Data(document).nodes.at(-1);
    assert.equal(node.width >= 240, true);
    assert.equal(node.height >= 140, true);
  });
});

it("enables X6 alignment reference lines with the Canvas snap preference", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /new X6\.Graph\(\{[\s\S]*?async:\s*false,[\s\S]*?moveThreshold:\s*0,[\s\S]*?clickThreshold:\s*0/);
  assert.match(source, /snapline:\s*\{[\s\S]*?enabled:\s*viewport\.snapEnabled !== false[\s\S]*?sharp:\s*true/);
  assert.match(source, /grid:\s*\{\s*size:\s*1,/);
  assert.doesNotMatch(source, /size:\s*viewport\.snapEnabled !== false \? CANVAS_GRID_SIZE : 1/);
});

it("mounts the X6 snapline plugin with the Canvas snap preference", () => {
  const plugins = [];
  class Snapline {
    constructor(options) { this.options = options; }
  }
  const graph = {
    use(plugin) { plugins.push(plugin); },
    getPlugin() { return null; },
  };

  assert.equal(enableCanvasGraphSnapline({ Snapline }, graph, { snapEnabled: true }), true);
  assert.deepEqual(plugins[0].options, { enabled: true, sharp: true, tolerance: 8 });
});

it("snaps selection-box node moves to the visible Canvas grid on release", () => {
  const positions = [];
  const node = {
    isNode: () => true,
    getData: () => ({}),
    getPosition: () => ({ x: 431, y: 680 }),
    position: (x, y, options) => positions.push({ x, y, options }),
  };

  assert.equal(snapCanvasGraphNodesToGrid([node], true), true);
  assert.deepEqual(positions, [{ x: 440, y: 680, options: { deep: true } }]);
  assert.equal(snapCanvasGraphNodesToGrid([node], false), false);
  assert.equal(positions.length, 1);
});

it("matches the upstream default and classic Canvas interaction presets", () => {
  const defaultOptions = resolveCanvasGraphInteractionOptions({ interactionMode: "default" });
  assert.deepEqual(defaultOptions.panning, {
    enabled: true,
    eventTypes: ["rightMouseDown", "mouseWheelDown"],
    modifiers: [],
  });
  assert.deepEqual(defaultOptions.mousewheel.modifiers, []);
  assert.equal(defaultOptions.interacting.nodeMovable, true);
  assert.deepEqual(defaultOptions.selecting.eventTypes, ["leftMouseDown"]);
  assert.deepEqual(defaultOptions.selecting.modifiers, []);
  assert.deepEqual(defaultOptions.selecting.multipleSelectionModifiers, ["shift"]);

  const classicOptions = resolveCanvasGraphInteractionOptions({ interactionMode: "classic" });
  assert.deepEqual(classicOptions.panning.eventTypes, ["leftMouseDown", "mouseWheel"]);
  assert.deepEqual(classicOptions.panning.modifiers, []);
  assert.equal(classicOptions.interacting.nodeMovable, true);
  assert.deepEqual(classicOptions.mousewheel.modifiers, ["ctrl"]);
  assert.deepEqual(classicOptions.selecting.eventTypes, ["leftMouseDown"]);
  assert.deepEqual(classicOptions.selecting.modifiers, ["shift"]);
  assert.deepEqual(classicOptions.selecting.multipleSelectionModifiers, ["shift"]);
});

it("requires a compatible target port before creating a Canvas edge", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /connecting:\s*\{[\s\S]*?allowBlank:\s*false/);
  assert.match(source, /allowNode:\s*false,[\s\S]*?allowEdge:\s*false,[\s\S]*?allowPort:\s*true/);
  assert.match(source, /snap:\s*\{\s*radius:\s*CANVAS_CONNECTION_SNAP_RADIUS,\s*anchor:\s*"center"\s*\}/);
  assert.match(source, /validateMagnet\(\{ magnet \}\)[\s\S]*?inferCanvasPortDirection/);
  assert.match(source, /resolveCanvasGraphConnectionPort\(sourceCell, sourcePort, "out"\)/);
  assert.match(source, /resolveCanvasGraphConnectionPort\(targetCell, targetPort, "in"\)/);
  assert.match(source, /\["text", "image", "video", "audio", "any"\]\.includes\(normalized\)/);
  assert.doesNotMatch(source, /resolveCanvasConnectionPorts\(workbench\?\.ui\?\.canvasDocument/);
  assert.doesNotMatch(source, /if \(!targetCell && sourceCell && source\?\.direction === "out"\) return true;/);
  assert.match(source, /registerEdge\?\.\("comic-ai-canvas-edge"[\s\S]*?selector: "flow"/);
  assert.match(source, /createEdge\(\)[\s\S]*?shape: "comic-ai-canvas-edge"[\s\S]*?zIndex: 0/);
});

it("keeps animated X6 edges above the retired Canvas flow layer", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const hostSource = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /\.canvas-stage\.is-x6-ready \.canvas-x6-mount\s*\{\s*z-index:\s*4/);
  assert.match(source, /\.canvas-x6-mount \.x6-edge\.is-canvas-edge-connecting path:nth-child\(2\)[\s\S]*?stroke-dasharray:\s*9 7[\s\S]*?canvas-x6-edge-connecting 720ms linear infinite/);
  assert.match(source, /\.canvas-x6-mount \.x6-edge path:nth-child\(3\)[\s\S]*?opacity:\s*0/);
  assert.match(source, /\.canvas-x6-mount \.x6-edge:is\(\.is-canvas-edge-connecting, \.is-canvas-edge-flowing\) path:nth-child\(3\)[\s\S]*?canvas-x6-edge-flow 2\.2s linear infinite/);
  assert.match(source, /@keyframes canvas-x6-edge-connecting[\s\S]*?stroke-dashoffset:\s*-16/);
  assert.match(source, /@keyframes canvas-x6-edge-flow[\s\S]*?stroke-dashoffset:\s*-100/);
  assert.match(source, /prefers-reduced-motion:\s*reduce[\s\S]*?\.canvas-x6-mount \.x6-edge path:nth-child\(3\)[\s\S]*?animation:\s*none/);
  assert.match(source, /\.canvas-stage\.is-panning \.canvas-x6-mount \.x6-edge\.is-canvas-edge-flowing path:nth-child\(3\)[\s\S]*?animation-play-state:\s*paused/);
  assert.doesNotMatch(source, /\.canvas-stage\.is-node-dragging \.canvas-x6-mount \.x6-edge path:nth-child\(3\)[\s\S]*?animation-play-state:\s*paused/);
  assert.match(source, /\.canvas-stage\.is-node-dragging \.canvas-x6-mount \.x6-edge\.is-canvas-edge-flowing path:nth-child\(3\)[\s\S]*?filter:\s*none/);
  assert.match(hostSource, /\.canvas-stage\.is-node-dragging \.canvas-x6-special-node\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(graphSource, /selectCurrentCanvasNode\(graph, workbench\);\s*refreshCanvasConnectedEdgeMotion\(graph\);/);
  assert.match(graphSource, /strokeDasharray:\s*"18 82"/);
  assert.match(graphSource, /if \(flowing\) edgeView\?\.container\?\.querySelector\?\.\("path:nth-child\(3\)"\)\?\.setAttribute\?\.\("pathLength", "100"\);/);
});

it("defers Canvas drag calculations until the pointer is released", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const wireStart = source.indexOf("function wireGraphSync");
  const wireEnd = source.indexOf("function bindCanvasEdgeDisconnectControl", wireStart);
  const wireSource = source.slice(wireStart, wireEnd);
  const positionChangeStart = wireSource.indexOf('graph.on("node:change:position"');
  const positionChangeEnd = wireSource.indexOf('graph.on("node:move"', positionChangeStart);
  const nodeMoveStart = wireSource.indexOf('graph.on("node:move"');
  const nodeMoveEnd = wireSource.indexOf('graph.on("node:moved"', nodeMoveStart);
  const selectionMoveStart = wireSource.indexOf('selectionPlugin?.on?.("box:mousemove"');
  const selectionMoveEnd = wireSource.indexOf('selectionPlugin?.on?.("box:mouseup"', selectionMoveStart);

  assert.match(wireSource.slice(nodeMoveStart, nodeMoveEnd), /classList\?\.add\?\.\("is-node-dragging"\)/);
  assert.match(wireSource.slice(nodeMoveStart, nodeMoveEnd), /setNodeDragMotion\(node, true\)/);
  assert.doesNotMatch(wireSource.slice(nodeMoveStart, nodeMoveEnd), /canvasGraphCellAndDescendantIds|refreshCanvasConnectedEdgeMotion|positionCanvasSelectionActionToolbar|updateStoryboardReturnTarget/);
  assert.doesNotMatch(wireSource.slice(positionChangeStart, positionChangeEnd), /refreshCanvasConnectedEdgeMotion|scheduleSelectionPresentation/);
  assert.doesNotMatch(wireSource.slice(selectionMoveStart, selectionMoveEnd), /canvasGraphCellAndDescendantIds|refreshCanvasConnectedEdgeMotion|scheduleSelectionPresentation/);
  assert.match(wireSource, /node:moved[\s\S]*?classList\?\.remove\?\.\("is-node-dragging"\)/);
  assert.match(wireSource, /node:moved[\s\S]*?setNodeDragMotion\(event\?\.node, false\)/);
  const mouseDownStart = wireSource.indexOf('graph.on("node:mousedown"');
  const mouseDownEnd = wireSource.indexOf('graph.on("node:dblclick"', mouseDownStart);
  assert.doesNotMatch(wireSource.slice(mouseDownStart, mouseDownEnd), /refreshCanvasConnectedEdgeMotion/);
  assert.match(wireSource, /node:mouseup[\s\S]*?refreshCanvasConnectedEdgeMotion\(graph\)/);
  assert.match(wireSource, /edge:added[\s\S]*?setConnectingEdgeMotion\(edge, true\)/);
  assert.match(wireSource, /edge:connected[\s\S]*?setConnectingEdgeMotion\(event\.edge, false\)/);
  assert.doesNotMatch(wireSource, /refreshSelectedEdgeMotion/);
  assert.match(source, /activeNodeIds\.has\(sourceNodeId\) \|\| activeNodeIds\.has\(targetNodeId\)/);
  assert.match(source, /classList\?\.toggle\?\.\("is-canvas-edge-flowing", flowing\)/);
});

it("keeps X6 edge rendering native while a node is dragged", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const hostSource = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  const wireStart = source.indexOf("function wireGraphSync");
  const wireEnd = source.indexOf("function refreshCanvasConnectedEdgeMotion", wireStart);
  const wireSource = source.slice(wireStart, wireEnd);
  const createGraphStart = source.indexOf("function createGraph");
  const createGraphEnd = source.indexOf("function wireGraphSync", createGraphStart);
  const createGraphSource = source.slice(createGraphStart, createGraphEnd);
  const positionChangeStart = wireSource.indexOf('graph.on("node:change:position"');
  const positionChangeEnd = wireSource.indexOf('graph.on("node:move"', positionChangeStart);

  assert.match(wireSource, /node:mousedown[\s\S]*?suspendDragSnapline\(\)/);
  assert.doesNotMatch(wireSource, /node:mousedown[\s\S]*?enableSynchronousDragRendering\(\)/);
  assert.doesNotMatch(wireSource, /node:mousedown[\s\S]*?deferDragEdgeRendering\(\)/);
  assert.match(wireSource, /node:moved[\s\S]*?restoreDragSnapline\(\)[\s\S]*?syncMovedNodeEditor\(event\)/);
  assert.match(wireSource, /node:moved[\s\S]*?scheduleGraphCommit\(\{ clearToast: true \}\)/);
  assert.match(wireSource, /node:mouseup[\s\S]*?restoreDragSnapline\(\)/);
  assert.doesNotMatch(wireSource, /node:mouseup[\s\S]*?restoreAsyncRendering\(\)/);
  assert.doesNotMatch(wireSource, /node:mouseup[\s\S]*?restoreDragEdgeRendering\(\)/);
  assert.match(wireSource.slice(positionChangeStart, positionChangeEnd), /!event\?\.options\?\.ui && !event\?\.options\?\.selection/);
  assert.match(wireSource, /box:mouseup[\s\S]*?syncCanvasGraphEditorOverlay\(graph, node\)/);
  assert.match(createGraphSource, /async:\s*false/);
  assert.doesNotMatch(createGraphSource, /virtual:\s*\{/);
  assert.match(hostSource, /\.canvas-stage\.is-node-dragging \.x6-node\[data-cell-id="__comic-ai-canvas-editor-overlay__"\][\s\S]*?visibility:\s*hidden/);
  assert.match(hostSource, /\.canvas-stage\.is-node-dragging \.x6-node-selected\.is-canvas-node-flowing \.canvas-x6-special-node::after[\s\S]*?canvas-x6-selected-border-flow 1\.2s linear infinite/);
  assert.doesNotMatch(wireSource, /requestCanvasDragViewUpdate[\s\S]*?view\?\.cell\?\.isEdge\?\.\(\)[\s\S]*?deferredUpdates\.set/);
  assert.doesNotMatch(cssSource, /\.canvas-stage\.is-node-dragging \.canvas-x6-mount \.x6-edge\.is-canvas-edge-flowing\s*\{[\s\S]*?visibility:\s*hidden/);
});

it("coalesces X6 viewport persistence and commits edge changes before a host refresh", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const wireStart = source.indexOf("function wireGraphSync");
  const wireEnd = source.indexOf("export function mountCanvasGraphEditorOverlay", wireStart);
  const wireSource = source.slice(wireStart, wireEnd);
  assert.match(wireSource, /graph\.on\("translate", \(\) => scheduleViewportSync\(\{ panning: true \}\)\)/);
  assert.match(wireSource, /graph\.on\("scale"[\s\S]*?syncCanvasZoomControlDisplay\(workbench\.root, graph\.zoom\?\.\(\)\)[\s\S]*?scheduleViewportSync\(\)/);
  assert.match(wireSource, /setTimeout\?\.\([\s\S]*?syncCanvasGraphViewport\(graph, workbench\)[\s\S]*?CANVAS_VIEWPORT_COMMIT_DELAY_MS/);
  assert.match(source, /const CANVAS_VIEWPORT_COMMIT_DELAY_MS = 600;/);
  assert.doesNotMatch(wireSource, /syncCanvasGraphViewport\(graph, workbench\)[\s\S]*?persistCanvasSession/);
  assert.match(wireSource, /classList\?\.add\?\.\("is-panning"\)[\s\S]*?classList\?\.remove\?\.\("is-panning"\)/);
  assert.match(wireSource, /graph\.on\("edge:connected"[\s\S]*?sync\(\)/);
  assert.match(wireSource, /graph\.on\("edge:removed", sync\)/);
  assert.doesNotMatch(wireSource, /scheduleGraphSync/);
  assert.match(source, /classList\?\.contains\?\.\("is-x6-ready"\)\) return true;/);
  const hostCss = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.doesNotMatch(hostCss, /\.canvas-stage\.is-panning \.x6-graph-svg-viewport\s*\{[^}]*will-change:\s*transform/s);
});

it("restores the saved X6 viewport without replacing it during initial mount", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const initialViewportStart = source.indexOf("function applyInitialViewport");
  const initialViewportEnd = source.indexOf("function ensureCanvasDocument", initialViewportStart);
  const initialViewportSource = source.slice(initialViewportStart, initialViewportEnd);
  const mountStart = source.indexOf("export async function mountCanvasWorkflowIfPresent");
  const mountEnd = source.indexOf("export function bindCanvasNativeNodeSelection", mountStart);
  const mountSource = source.slice(mountStart, mountEnd);

  assert.match(initialViewportSource, /graph\.zoomTo\(Number\(viewport\?\.zoom \?\? 1\)\)/);
  assert.match(initialViewportSource, /graph\.translate\(Number\(viewport\?\.x \?\? 0\), Number\(viewport\?\.y \?\? 0\)\)/);
  assert.doesNotMatch(initialViewportSource, /zoomToFit|canvasGraphHasVisibleNode/);
  assert.match(mountSource, /applyInitialViewport\(graph, canvasDocument\.viewport\)/);
  assert.match(
    mountSource,
    /classList\.add\("is-x6-ready"\);\s*void stabilizeInitialCanvasViewport\(graph, workbench\.ui\.canvasDocument\?\.viewport \?\? canvasDocument\.viewport, mount\)/,
  );
  assert.match(mountSource, /syncCanvasZoomControlDisplay\(workbench\.root, graph\.zoom\?\.\(\)\)/);
  assert.doesNotMatch(mountSource, /syncCanvasGraphViewport\(graph, workbench\)/);
  assert.match(source, /link\[data-new-canvas-style\]/);
  assert.match(source, /styleLinks\.every\(\(link\) => Boolean\(link\.sheet\)\)/);
  assert.match(source, /async function stabilizeInitialCanvasViewport[\s\S]*?await nextCanvasGraphFrame\(\)[\s\S]*?applyInitialViewport\(graph, viewport\)/);
});

it("uses the latest Canvas document when the asynchronous X6 mount completes", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const mountStart = source.indexOf("export async function mountCanvasWorkflowIfPresent");
  const mountEnd = source.indexOf("export function bindCanvasNativeNodeSelection", mountStart);
  const mountSource = source.slice(mountStart, mountEnd);

  assert.ok(
    mountSource.indexOf("const graphSize = await waitForCanvasGraphMountSize(mount);")
      < mountSource.indexOf("const canvasDocument = ensureCanvasDocument(workbench);"),
  );
  assert.match(mountSource, /workbench\.canvasGraph = graph;\s*refreshCanvasWorkflowGraph\(workbench\);/);
});

it("keeps existing X6 port instances when a node-only refresh does not change ports", () => {
  const node = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
    type: "send",
    position: { x: 120, y: 160 },
    defaultData: { title: "图片生成", mediaKind: "image" },
  });
  const canvasDocument = {
    ...createDefaultCanvasDocument(),
    nodes: [node],
    edges: [],
  };
  const config = canvasDocumentToX6Data(canvasDocument).nodes[0];
  let cellData = config.data;
  let portSetCalls = 0;
  const cell = {
    id: node.id,
    getData: () => cellData,
    setData(next) { cellData = next; },
    getPosition: () => ({ x: config.x, y: config.y }),
    getSize: () => ({ width: config.width, height: config.height }),
    getProp: (key) => key === "ports" ? structuredClone(config.ports) : undefined,
    setProp(key) { if (key === "ports") portSetCalls += 1; },
    setAttrs() {},
    getZIndex: () => config.zIndex,
    getParent: () => null,
  };
  const workbench = {
    canvasGraph: { getCellById: (id) => id === node.id ? cell : null },
    ui: { canvasDocument },
  };

  assert.equal(refreshCanvasWorkflowNode(workbench, node.id), true);
  assert.equal(portSetCalls, 0);
});

it("does not rebuild an unchanged node's HTML media data during a node-only refresh", () => {
  const node = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
    type: "send",
    position: { x: 120, y: 160 },
    defaultData: { title: "图片生成", mediaKind: "image" },
  });
  const canvasDocument = { ...createDefaultCanvasDocument(), nodes: [node], edges: [] };
  const config = canvasDocumentToX6Data(canvasDocument).nodes[0];
  let cellData = config.data;
  let dataSetCalls = 0;
  let attrsSetCalls = 0;
  const cell = {
    id: node.id,
    getData: () => cellData,
    setData(next) { dataSetCalls += 1; cellData = next; },
    getPosition: () => ({ x: config.x, y: config.y }),
    getSize: () => ({ width: config.width, height: config.height }),
    getAttrs: () => config.attrs,
    setAttrs() { attrsSetCalls += 1; },
    getProp: (key) => key === "ports" ? structuredClone(config.ports) : undefined,
    setProp() {},
    getZIndex: () => config.zIndex,
    getParent: () => null,
  };
  const workbench = { canvasGraph: { getCellById: (id) => id === node.id ? cell : null }, ui: { canvasDocument } };

  assert.equal(refreshCanvasWorkflowNode(workbench, node.id), true);
  assert.equal(dataSetCalls, 0);
  assert.equal(attrsSetCalls, 0);
});

it("refreshes an uploading media node without synchronizing it back into the Canvas document", () => {
  const node = createCanvasNodeFromTemplate(createDefaultCanvasDocument(), {
    type: "source-video",
    position: { x: 120, y: 160 },
  });
  const initialDocument = { ...createDefaultCanvasDocument(), nodes: [node], edges: [] };
  const config = canvasDocumentToX6Data(initialDocument).nodes[0];
  const uploadingNode = { ...node, data: { ...(node.data ?? {}), status: "uploading" } };
  let cellData = config.data;
  let dataSetOptions = null;
  const cell = {
    id: node.id,
    getData: () => cellData,
    setData(next, options) { cellData = next; dataSetOptions = options; },
    getPosition: () => ({ x: config.x, y: config.y }),
    getSize: () => ({ width: config.width, height: config.height }),
    getAttrs: () => config.attrs,
    setAttrs() {},
    getProp: (key) => key === "ports" ? structuredClone(config.ports) : undefined,
    setProp() {},
    getZIndex: () => config.zIndex,
    getParent: () => null,
  };
  const workbench = {
    canvasGraph: { getCellById: (id) => id === node.id ? cell : null },
    ui: { canvasDocument: { ...initialDocument, nodes: [uploadingNode] } },
  };

  assert.equal(refreshCanvasWorkflowNode(workbench, node.id, { skipDocumentSync: true }), true);
  assert.deepEqual(dataSetOptions, { canvasNodeRefresh: true });
  assert.equal(cellData.canvasNode.data.status, "uploading");
});

it("shows a scissors control at the midpoint of a hovered X6 edge and removes only that edge", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const bindStart = source.indexOf("function bindCanvasEdgeDisconnectControl");
  const bindEnd = source.indexOf("export function snapCanvasGraphNodesToGrid", bindStart);
  const bindSource = source.slice(bindStart, bindEnd);
  assert.match(bindSource, /dataset\.canvasEdgeDisconnect = "true"/);
  assert.match(bindSource, /button\.style\.transform = "translate\(-50%, -50%\)"/);
  assert.match(bindSource, /getTotalLength\?\.\(\)/);
  assert.match(bindSource, /getPointAtLength\(length \/ 2\)/);
  assert.match(bindSource, /getScreenCTM\?\.\(\)/);
  assert.match(bindSource, /Number\(rect\.width\) \/ width/);
  assert.match(bindSource, /Number\(rect\.height\) \/ height/);
  assert.match(bindSource, /\(clientY - Number\(rect\.top \?\? 0\)\) \/ scaleY/);
  assert.doesNotMatch(bindSource, /interactionMode === "hand"/);
  assert.match(bindSource, /classList\?\.contains\?\.\("x6-edge"\)/);
  assert.match(bindSource, /graph\.getCellById\?\.\(edgeId\)/);
  assert.match(bindSource, /mount\.addEventListener\("pointermove", trackPointer, true\)/);
  assert.match(bindSource, /mount\.addEventListener\("mousemove", trackPointer, true\)/);
  assert.match(bindSource, /mount\.addEventListener\("mouseleave", scheduleHide\)/);
  assert.match(bindSource, /if \(edge\) graph\.removeCell\?\.\(edge\)/);
  assert.match(bindSource, /edge\.addTools\(\[\{/);
  assert.match(bindSource, /distance: "50%"/);
  assert.match(bindSource, /"canvas-edge-disconnect", \{ local: true, reset: true \}/);
  assert.match(bindSource, /onClick\(\{ cell \}\)[\s\S]*?graph\.removeCell\?\.\(cell\)/);

  const styles = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  assert.match(styles, /\.canvas-edge-disconnect-button\s*\{[\s\S]*?width:\s*36px[\s\S]*?border-radius:\s*50%/);
  assert.match(styles, /\.canvas-edge-disconnect-button\[hidden\]\s*\{\s*display:\s*none/);
});

it("checks distribution-handle state before querying the Canvas DOM", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const refreshStart = source.indexOf("export function refreshCanvasDistributionGapHandles");
  const refreshEnd = source.indexOf("function startCanvasDistributionGapDrag", refreshStart);
  const refreshSource = source.slice(refreshStart, refreshEnd);
  const queryIndex = refreshSource.indexOf("querySelectorAll");
  assert.ok(refreshSource.indexOf("const axis") < queryIndex);
  assert.ok(refreshSource.indexOf("const cells") < queryIndex);
  assert.ok(refreshSource.indexOf("if (!mount)") < queryIndex);
});

it("bridges X6 selection plugin changes into the Canvas editor state", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /graph\.on\("node:mouseup", \(\{ node \}\) => \{[\s\S]*?refreshCanvasConnectedEdgeMotion\(graph\);[\s\S]*?selectGraphNode\(node\);[\s\S]*?\}\)/);
  assert.match(source, /graph\.on\("cell:click", \(\{ cell \}\) => \{/);
  assert.match(source, /graph\.on\("selection:changed", \(\{ added = \[\] \} = \{\}\) => \{/);
  assert.match(source, /const selectionPlugin = graph\.getPlugin\?\.\("selection"\)[\s\S]*?selectionPlugin\?\.on\?\.\("selection:changed"/);
  assert.match(source, /const selectedNode = added\.find\(\(cell\) => cell\?\.isNode\?\.\(\) && cell\?\.getData\?\.\(\)\?\.canvasTransientEditor !== true\)/);

  const styles = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(styles, /\.new-canvas-root \.x6-node-selected \.canvas-x6-special-node::after\s*\{/);
  assert.match(styles, /animation:\s*canvas-x6-selected-border-flow [^;]+ infinite/);
  assert.match(styles, /@keyframes canvas-x6-selected-border-flow\s*\{/);
});

it("persists X6 selection-box moves when the selection drag ends", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /event\?\.options\?\.selection[\s\S]*?selectionMovePending = true/);
  assert.match(source, /selectionPlugin\?\.on\?\.\("box:mousemove"[\s\S]*?isCanvasSelectionTranslationEvent[\s\S]*?refreshCanvasConnectedEdgeMotion/);
  assert.match(source, /selectionPlugin\?\.on\?\.\("box:mouseup", \(\) => \{[\s\S]*?refreshCanvasConnectedEdgeMotion\(graph\)[\s\S]*?requestFrame[\s\S]*?if \(selectionMovePending\)[\s\S]*?scheduleGraphCommit\(\{ clearToast: true \}\)/);
  assert.match(source, /const positionNodeIds = canvasGraphCellAndDescendantIds/);
});

it("commits an X6 node move without resetting the active interaction mode", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const movedStart = source.indexOf('graph.on("node:moved"');
  const movedEnd = source.indexOf('graph.on("node:resized"', movedStart);
  const movedSource = source.slice(movedStart, movedEnd);
  assert.match(movedSource, /scheduleGraphCommit\(\{ clearToast: true \}\)/);
  assert.doesNotMatch(movedSource, /applyCanvasGraphInteractionMode/);
  assert.match(source, /function syncCanvasGraphDocument[\s\S]*?node\.setData\?\.\([\s\S]*?canvasNode:[\s\S]*?position:[\s\S]*?size:[\s\S]*?overwrite: true, silent: true/);
});

it("keeps mounted X6 cells in place while document data is synchronized", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /applyCanvasGraphInteractionMode\(graph, document\.viewport\);\s*reconcileCanvasWorkflowGraph\(graph, nextData\);\s*applyCanvasGraphInteractionMode\(graph, document\.viewport\);/);
  assert.doesNotMatch(source, /graph\.fromJSON\(nextData\)/);
  assert.match(source, /graph\.__comicAiCanvasInteractionMode = \["hand", "classic"\]\.includes\(viewport\.interactionMode\)/);
  assert.match(source, /const storedInteractionMode = graph\.__comicAiCanvasInteractionMode;[\s\S]*?canvasDocumentFromX6Data\(graphData, previousDocument\)[\s\S]*?interactionMode,/);

  const node = {
    id: "node-1",
    isNode: () => true,
    getAttrs: () => ({ body: { fill: "old" } }),
    getData: () => ({ canvasNode: { id: "node-1", data: { status: "idle" } } }),
    getPosition: () => ({ x: 20, y: 40 }),
    getProp: () => ({ groups: {}, items: [] }),
    getSize: () => ({ width: 320, height: 180 }),
    getZIndex: () => 2,
    setAttrs(value) { this.attrs = value; },
    setData(value) { this.data = value; },
  };
  const graph = {
    batchUpdate(_name, execute) { execute(); },
    getCellById: (id) => id === node.id ? node : null,
    getEdges: () => [],
    getNodes: () => [node],
    removeCell() { throw new Error("existing node must not be removed"); },
  };
  const nextData = {
    edges: [],
    nodes: [{
      id: node.id,
      x: 20,
      y: 40,
      width: 320,
      height: 180,
      zIndex: 2,
      attrs: { body: { fill: "new" } },
      data: { canvasNode: { id: "node-1", data: { status: "completed" } } },
      ports: { groups: {}, items: [] },
    }],
  };

  assert.deepEqual(reconcileCanvasWorkflowGraph(graph, nextData), { added: 0, removed: 0, updated: 1 });
  assert.deepEqual(node.attrs, nextData.nodes[0].attrs);
  assert.deepEqual(node.data, nextData.nodes[0].data);
});

it("updates an already mounted X6 graph when the Canvas interaction mode changes", () => {
  let rubberbandModifiers = null;
  let panningEnabled = 0;
  let mousewheelEnabled = 0;
  let selectionEnabled = null;
  let rubberbandEnabled = null;
  let selectionCleaned = 0;
  let unselected = 0;
  let edgeToolRemovals = 0;
  const selection = {
    toggleEnabled(value) { selectionEnabled = value; },
    toggleRubberband(value) { rubberbandEnabled = value; },
    clean() { selectionCleaned += 1; },
  };
  const graph = {
    options: {
      interacting: { nodeMovable: true },
      panning: { enabled: false, eventTypes: ["rightMouseDown"] },
      mousewheel: { enabled: false, modifiers: [] },
      selecting: { enabled: true, modifiers: [] },
    },
    setRubberbandModifiers(modifiers) { rubberbandModifiers = modifiers; },
    getPlugin(name) { return name === "selection" ? selection : null; },
    getEdges() { return [{ removeTools() { edgeToolRemovals += 1; } }]; },
    unselectAll() { unselected += 1; },
    enablePanning() { panningEnabled += 1; },
    enableMouseWheel() { mousewheelEnabled += 1; },
  };

  assert.equal(applyCanvasGraphInteractionMode(graph, { interactionMode: "classic" }), true);
  assert.equal(graph.__comicAiCanvasInteractionMode, "classic");
  assert.equal(graph.options.interacting.nodeMovable, true);
  assert.deepEqual(graph.options.panning.eventTypes, ["leftMouseDown", "mouseWheel"]);
  assert.deepEqual(graph.options.mousewheel.modifiers, ["ctrl"]);
  assert.deepEqual(graph.options.selecting.modifiers, ["shift"]);
  assert.deepEqual(rubberbandModifiers, ["shift"]);
  assert.equal(panningEnabled, 1);
  assert.equal(mousewheelEnabled, 1);

  assert.equal(applyCanvasGraphInteractionMode(graph, { interactionMode: "hand" }), true);
  assert.equal(graph.__comicAiCanvasInteractionMode, "hand");
  assert.equal(graph.options.interacting.nodeMovable, true);
  assert.deepEqual(graph.options.panning.eventTypes, ["leftMouseDown"]);
  assert.equal(selectionEnabled, false);
  assert.equal(rubberbandEnabled, false);
  assert.equal(selectionCleaned, 1);
  assert.equal(unselected, 1);
  assert.equal(edgeToolRemovals, 0);
});

it("keeps legacy Canvas pan and wheel fallbacks out of the X6 interaction surface", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  assert.match(source, /if \(isCanvasX6InteractionTarget\(eventTarget, event\)\) \{\s*return;\s*\}/);
  assert.match(source, /!stage \|\| isCanvasX6InteractionTarget\(eventTarget, event\) \|\| isCanvasInteractionOverlayTarget/);
  assert.match(source, /event\?\.composedPath\?\.\(\)[\s\S]*?data-canvas-x6-mount/);
  assert.match(source, /const allowedButtons = interactionMode === "classic" \? \[0\] : \[1, 2\]/);
  assert.match(source, /consumeCanvasRightPanContextMenuSuppression\(workbench\)/);
});

it("hides the legacy node layer while keeping rich controls above X6", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/production-workbench.css", import.meta.url), "utf8");
  const hostSource = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(source, /\.canvas-stage\.is-x6-ready \.canvas-flow\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?pointer-events:\s*none;[\s\S]*?visibility:\s*hidden;/);
  assert.match(source, /\.canvas-stage\.is-x6-ready \.canvas-flow\s*\{[\s\S]*?will-change:\s*auto;/);
  assert.match(source, /\.canvas-stage\.is-x6-ready \.canvas-flow-edge-glow\s*\{[\s\S]*?animation:\s*none;[\s\S]*?filter:\s*none;/);
  assert.match(source, /\.canvas-stage\.is-x6-ready \.canvas-flow \.canvas-node-editor,[\s\S]*?\.canvas-node-action-toolbar\s*\{[\s\S]*?visibility:\s*visible;[\s\S]*?pointer-events:\s*auto;/);
  assert.doesNotMatch(hostSource, /\.canvas-stage\.is-panning \.x6-graph-svg-viewport\s*\{[^}]*will-change:\s*transform/s);
  assert.match(hostSource, /\.canvas-stage\.is-panning \.x6-node:not\(\.x6-node-selected\):hover rect\s*\{[\s\S]*?filter:\s*none;/);
  assert.match(source, /\.canvas-stage\.is-canvas-hand-mode \.x6-widget-selection-rubberband\s*\{[\s\S]*?display:\s*none !important;/);
  assert.doesNotMatch(source, /\.x6-widget-selection-(?:rubberband|box)[^{]*\{[^}]*\bzoom\s*:/);
  assert.doesNotMatch(source, /--comic-ai-canvas-selection-zoom/);
  assert.doesNotMatch(source, /\.x6-widget-selection-rubberband\s*\{[^}]*\btransform\s*:/);
  assert.match(source, /\.x6-widget-selection-inner\[data-selection-length="1"\][\s\S]*?~ \.x6-widget-selection-box-node\s*\{[\s\S]*?display:\s*none;/);
});

it("mirrors X6 vendor styles into the Canvas ShadowRoot", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /mirrorX6StylesIntoRoot\(mount\)/);
  assert.match(source, /data-canvas-x6-vendor-style/);
  assert.match(source, /includes\("\.x6-"\)/);
});

it("keeps mounted X6 cells when the Canvas document identity has not changed", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /graph\.__comicAiCanvasDocument === document/);
  assert.match(source, /graph\.__comicAiCanvasDocument = nextDocument/);
  assert.match(source, /transientEditor\?\.canvasTransientEditor === true/);
  assert.match(source, /mountCanvasGraphEditorOverlay\(graph, transientEditor\.parentNodeId, transientEditor\.editorHtml\)/);
});

it("keeps primary viewport controls visible without the removed grid and more menu", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/project-detail.js", import.meta.url), "utf8");
  const workbenchSource = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const canvasStateSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-state.js", import.meta.url), "utf8");
  const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /canvas-view-tools-more/);
  assert.doesNotMatch(source, /更多画布操作/);
  assert.doesNotMatch(source, /gridVisible/);
  assert.doesNotMatch(workbenchSource, /gridVisible/);
  assert.doesNotMatch(canvasStateSource, /gridVisible/);
  assert.doesNotMatch(graphSource, /gridVisible|hideGrid/);
  assert.match(source, /is-canvas-grid-visible/);
  assert.match(source, /data-action="toggle-canvas-sidebar"[^>]*>[^]*?资产管理/);
  assert.match(source, /data-action="arrange-canvas-nodes"/);
  assert.match(source, /data-action="toggle-canvas-minimap"/);
  assert.match(source, /data-action="toggle-canvas-edges"/);
  assert.match(source, /data-action="toggle-canvas-snap"[^>]*data-viewport-patch="toggle-snap"/);
  assert.match(workbenchSource, /arrangeCanvasDocumentOnGrid\(canvasDocument\)/);
  assert.match(workbenchSource, /zoomToFit\(\{ padding: 64, minScale: 0\.35, maxScale: 1 \}\)/);
});

it("recognizes X6 HTML media nodes in the Canvas context menu", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/index.js", import.meta.url), "utf8");
  const graphSource = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const newCanvasCss = readFileSync(new URL("../src/features/new-canvas/new-canvas.css", import.meta.url), "utf8");
  assert.match(source, /\.canvas-x6-special-node\[data-node-id\]/);
  assert.match(graphSource, /source-image/);
  assert.match(graphSource, /canvas-x6-source-media-body/);
  assert.match(graphSource, /canvas-x6-source-media-preview/);
  assert.match(graphSource, /emptyUploadAttrs/);
  assert.match(graphSource, /pick-canvas-upload-file/);
  assert.match(graphSource, /input\?\.click/);
  assert.match(graphSource, /source-video/);
  assert.match(graphSource, /source-audio/);
  assert.match(graphSource, /data-canvas-upload-input/);
  assert.match(graphSource, /const uploading = status === "uploading"/);
  assert.match(graphSource, /视频正在上传中/);
  assert.match(graphSource, /aria-busy=\\\"true\\\"/);
  assert.match(graphSource, /event\?\.options\?\.canvasNodeRefresh/);
  assert.match(newCanvasCss, /\.canvas-x6-source-uploading-mask\s*\{/);
  assert.match(newCanvasCss, /canvas-x6-source-uploading-spin/);
  assert.match(graphSource, /"group", "upload", "video"/);
  assert.match(graphSource, /type === "upload"\s*\? renderCanvasSourceMediaNodeBody\(node, resolveCanvasUploadMediaKind\(node\), \{ mixed: true \}\)/);
  assert.match(graphSource, /mixedUpload \? "image\/\*,video\/\*,audio\/\*"/);
  assert.match(graphSource, /const agentGenerating = data\.source === "canvas_agent"/);
  assert.match(graphSource, /canvas-x6-source-generation-mask/);
  assert.match(graphSource, /mediaLabel\}正在生成中/);
  assert.match(
    newCanvasCss,
    /\.canvas-x6-special-node\.is-source-video \.canvas-x6-source-media-preview\s*\{[\s\S]*?align-items:\s*stretch;[\s\S]*?justify-items:\s*stretch;[\s\S]*?padding:\s*0;/,
  );
  assert.match(
    newCanvasCss,
    /\.canvas-x6-special-node\.is-source-video \.canvas-x6-source-media-preview video\s*\{[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*none;[\s\S]*?object-fit:\s*cover;/,
  );
});

it("aligns and distributes selected X6 nodes without changing their sizes", () => {
  const positions = new Map([
    ["a", { x: 10, y: 20, width: 40, height: 20 }],
    ["b", { x: 120, y: 80, width: 30, height: 30 }],
    ["c", { x: 260, y: 30, width: 20, height: 10 }],
  ]);
  const cells = [...positions].map(([id, initial]) => ({
    id,
    isNode: () => true,
    getBBox: () => ({ ...positions.get(id) }),
    position: (x, y) => positions.set(id, { ...positions.get(id), x, y }),
    getPosition: () => ({ x: positions.get(id).x, y: positions.get(id).y }),
    getSize: () => ({ width: positions.get(id).width, height: positions.get(id).height }),
    getData: () => ({}),
    shape: "rect",
  }));
  const graph = {
    getSelectedCells: () => cells,
    getNodes: () => cells,
    getEdges: () => [],
  };
  const workbench = { canvasGraph: graph, ui: { canvasDocument: { nodes: [], edges: [] } }, updateCanvasDocument: (document) => { workbench.ui.canvasDocument = document; } };
  assert.equal(alignSelectedCanvasNodes(workbench, "top"), true);
  assert.equal(new Set([...positions.values()].map((item) => item.y)).size, 1);
  assert.equal(distributeSelectedCanvasNodes(workbench, "horizontal"), true);
  const sorted = [...positions.values()].sort((a, b) => a.x - b.x);
  assert.ok(sorted[1].x - (sorted[0].x + sorted[0].width) >= 0);
  assert.ok(sorted[2].x - (sorted[1].x + sorted[1].width) >= 0);
});

it("does not expose removed X6 alignment actions in the Canvas toolbar", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/project-detail.js", import.meta.url), "utf8");
  for (const axis of ["left", "center", "right", "top", "middle", "bottom"]) {
    assert.doesNotMatch(source, new RegExp(`data-action="align-canvas-nodes" data-axis="${axis}"`));
  }
});

it("arranges visible top-level nodes by graph layer on a stable grid", () => {
  const document = {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "source", type: "source-image", position: { x: 13, y: 91 }, size: { width: 120, height: 100 }, data: {} },
      { id: "group", type: "group", position: { x: 340, y: 33 }, size: { width: 280, height: 220 }, data: { childNodeIds: ["child"] } },
      { id: "child", type: "ai-image", parentGroupId: "group", position: { x: 380, y: 80 }, size: { width: 160, height: 120 }, data: {} },
      { id: "output", type: "video", position: { x: 930, y: 410 }, size: { width: 180, height: 120 }, data: {} },
      { id: "hidden", type: "image", position: { x: 77, y: 77 }, size: { width: 100, height: 100 }, data: { hiddenByCharacterId: "character-1" } },
    ],
    edges: [
      { id: "edge-1", sourceNodeId: "source", targetNodeId: "child" },
      { id: "edge-2", sourceNodeId: "child", targetNodeId: "output" },
    ],
  };
  const arranged = arrangeCanvasDocumentOnGrid(document, { gridSize: 40 });
  const byId = new Map(arranged.nodes.map((node) => [node.id, node]));
  assert.ok(byId.get("source").position.x < byId.get("group").position.x);
  assert.ok(byId.get("group").position.x < byId.get("output").position.x);
  for (const id of ["source", "group", "output"]) {
    assert.equal(byId.get(id).position.x % 40, 0);
    assert.equal(byId.get(id).position.y % 40, 0);
  }
  assert.deepEqual(byId.get("hidden").position, { x: 77, y: 77 });
  assert.deepEqual({
    x: byId.get("child").position.x - byId.get("group").position.x,
    y: byId.get("child").position.y - byId.get("group").position.y,
  }, { x: 40, y: 47 });
});

it("arranges independent workflows by function while preserving component proximity", () => {
  const document = {
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "source-a", type: "source-image", position: { x: 900, y: 80 }, size: { width: 120, height: 100 }, data: {} },
      { id: "process-a", type: "ai-storyboard", position: { x: 100, y: 120 }, size: { width: 180, height: 140 }, data: {} },
      { id: "result-a", type: "video", position: { x: 420, y: 160 }, size: { width: 160, height: 120 }, data: {} },
      { id: "source-b", type: "source-text", position: { x: 760, y: 720 }, size: { width: 140, height: 120 }, data: {} },
      { id: "process-b", type: "ai-text", position: { x: 180, y: 760 }, size: { width: 160, height: 120 }, data: {} },
      { id: "result-b", type: "image", position: { x: 520, y: 800 }, size: { width: 140, height: 100 }, data: {} },
      { id: "orphan-source", type: "source-video", position: { x: 960, y: 260 }, size: { width: 120, height: 100 }, data: {} },
      { id: "orphan-note", type: "comment", position: { x: 40, y: 300 }, size: { width: 120, height: 100 }, data: {} },
    ],
    edges: [
      { id: "edge-a-1", sourceNodeId: "source-a", targetNodeId: "process-a" },
      { id: "edge-a-2", sourceNodeId: "process-a", targetNodeId: "result-a" },
      { id: "edge-b-1", sourceNodeId: "source-b", targetNodeId: "process-b" },
      { id: "edge-b-2", sourceNodeId: "process-b", targetNodeId: "result-b" },
    ],
  };
  const arranged = arrangeCanvasDocumentOnGrid(document, { gridSize: 40 });
  const byId = new Map(arranged.nodes.map((node) => [node.id, node]));

  assert.ok(byId.get("source-a").position.x < byId.get("process-a").position.x);
  assert.ok(byId.get("process-a").position.x < byId.get("result-a").position.x);
  assert.ok(byId.get("source-b").position.x < byId.get("process-b").position.x);
  assert.ok(byId.get("process-b").position.x < byId.get("result-b").position.x);
  assert.equal(byId.get("source-a").position.x, byId.get("source-b").position.x);
  assert.equal(byId.get("result-a").position.x, byId.get("result-b").position.x);
  assert.ok(byId.get("source-a").position.y < byId.get("source-b").position.y);

  const connectedBottom = Math.max(...["source-b", "process-b", "result-b"]
    .map((id) => byId.get(id).position.y + byId.get(id).size.height));
  assert.ok(byId.get("orphan-source").position.y > connectedBottom);
  assert.equal(byId.get("orphan-source").position.y, byId.get("orphan-note").position.y);
  assert.ok(byId.get("orphan-source").position.x < byId.get("orphan-note").position.x);
  for (const node of arranged.nodes) {
    assert.equal(node.position.x % 40, 0);
    assert.equal(node.position.y % 40, 0);
  }
});

it("toggles X6 edge visibility while keeping port snap independent from grid snap", () => {
  const edgeCalls = [];
  const edges = [{
    hide: () => edgeCalls.push("hide"),
    show: () => edgeCalls.push("show"),
    setVisible: (visible) => edgeCalls.push(`visible:${visible}`),
  }];
  const snapCalls = [];
  const graph = {
    options: { snapline: { enabled: true }, connecting: { snap: true } },
    getEdges: () => edges,
    getPlugin: () => ({ enable: () => snapCalls.push("enable"), disable: () => snapCalls.push("disable") }),
    setGridSize: (size) => snapCalls.push(`grid-size:${size}`),
    showGrid: () => snapCalls.push("show-grid"),
  };
  assert.equal(applyCanvasGraphEdgeVisibility(graph, false), true);
  assert.deepEqual(edgeCalls, ["hide", "visible:false"]);
  assert.equal(applyCanvasGraphViewportPreferences(graph, { snapEnabled: false }), true);
  assert.equal(graph.options.snapline.enabled, false);
  assert.deepEqual(graph.options.connecting.snap, { radius: 50, anchor: "center" });
  assert.deepEqual(snapCalls, ["grid-size:1", "disable", "show-grid"]);

  snapCalls.length = 0;
  assert.equal(applyCanvasGraphViewportPreferences(graph, { snapEnabled: true }), true);
  assert.deepEqual(snapCalls, ["grid-size:1", "enable", "show-grid"]);
});
