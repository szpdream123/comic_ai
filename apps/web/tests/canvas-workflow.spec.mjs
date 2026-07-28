import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createDefaultCanvasDocument,
  createLegacyStarterCanvasDocument,
  isLegacyStarterCanvasDocument,
} from "../src/features/production-workbench/canvas/canvas-default-document.js";
import { validateCanvasConnection } from "../src/features/production-workbench/canvas/canvas-edge-rules.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "../src/features/production-workbench/canvas/canvas-x6-document.js";
import {
  applyCanvasGraphInteractionMode,
  applyCanvasGraphEdgeStyle,
  applyCanvasGraphEdgeVisibility,
  applyCanvasGraphViewportPreferences,
  bindCanvasNativeNodeSelection,
  clearCanvasGraphEditorOverlay,
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
  selectCanvasNodeFromGraph,
  syncCanvasGraphViewport,
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
  resolveCanvasModelOptions,
  resolveCanvasNodePlacement,
  updateCanvasNodeData,
} from "../src/features/production-workbench/canvas/canvas-state.js";

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

    assert.equal(bindCanvasNativeNodeSelection(mount, workbench), true);
    handlers.get("pointerdown")({ composedPath: () => [node], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [node], clientX: 11, clientY: 11 });
    assert.deepEqual(selections, ["node-1"]);

    handlers.get("pointerdown")({ composedPath: () => [port, node], clientX: 10, clientY: 10 });
    handlers.get("pointerup")({ composedPath: () => [port, node], clientX: 10, clientY: 10 });
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
    let selectionZoom = null;
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
        style: { setProperty: (name, value) => { if (name === "--comic-ai-canvas-selection-zoom") selectionZoom = value; } },
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
    assert.equal(event.offsetX, 240);
    assert.equal(event.offsetY, 200);
    assert.equal(selectionZoom, "2");
    assert.equal(typeof selectionHandlers.get("box:mouseup"), "function");
    selectionHandlers.get("box:mouseup")({ e: { clientX: 600, clientY: 500 } });
    assert.deepEqual(correctedSelection.map((node) => node.id), ["inside"]);
  });

  it("disables X6 node and rubberband selection in hand mode", () => {
    const options = resolveCanvasGraphInteractionOptions({ interactionMode: "hand" });
    assert.equal(options.selecting.enabled, false);
    assert.equal(options.selecting.rubberband, false);
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
  });

  it("applies the selected connector style to every mounted X6 edge", () => {
    assert.equal(normalizeCanvasEdgeStyle(), "curve");
    const calls = [];
    const graph = {
      getEdges: () => [{
        setRouter: (...args) => calls.push(["router", ...args]),
        setConnector: (...args) => calls.push(["connector", ...args]),
      }],
    };

    assert.equal(applyCanvasGraphEdgeStyle(graph, "curve"), true);
    assert.equal(calls[0][1], "normal");
    assert.equal(calls[1][1], "smooth");

    calls.length = 0;
    assert.equal(applyCanvasGraphEdgeStyle(graph, "orthogonal"), true);
    assert.equal(calls[0][1], "orth");
    assert.equal(calls[1][1], "rounded");
  });

  it("uses the stage size when the X6 mount has not been laid out yet", () => {
    assert.deepEqual(resolveCanvasGraphMountSize({
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
      parentElement: { getBoundingClientRect: () => ({ width: 1280, height: 720 }) },
    }), { width: 1280, height: 720 });
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

  it("round trips the canvas document through X6 graph data", () => {
    const document = createStarterCanvasDocument({ projectId: "project-1", episodeId: "episode-1" });
    const x6Data = canvasDocumentToX6Data(document);
    const nextDocument = canvasDocumentFromX6Data(x6Data, document);

    assert.equal(x6Data.nodes.length, 3);
    assert.equal(x6Data.edges.length, 2);
    assert.equal(x6Data.nodes[0].shape, "comic-ai-canvas-special-media-node");
    assert.equal(x6Data.nodes[0].attrs.title.text, "剧本源");
    assert.equal(x6Data.nodes[0].attrs.status.text, "ready");
    assert.equal(typeof x6Data.nodes[0].attrs.summary.text, "string");
    assert.equal(nextDocument.nodes.length, document.nodes.length);
    assert.equal(nextDocument.edges.length, document.edges.length);
    assert.deepEqual(nextDocument.nodes.map((node) => node.position), document.nodes.map((node) => node.position));
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
    assert.ok(["节点:script", "节点:send", "节点:video", "节点:upload"].every((key) => templateKeys.includes(key)));
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
      gridVisible: false,
      snapEnabled: false,
    });

    assert.deepEqual(nextDocument.viewport, {
      x: -120,
      y: 80,
      zoom: 1.25,
      gridVisible: false,
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

    const storyboard = createCanvasNodeFromTemplate(
      createDefaultCanvasDocument({ canvasProjectId: "canvas-storyboard" }),
      resolveCanvasNodeTemplates({}).find((item) => item.type === "ai-storyboard"),
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
          previewUrl: "https://example.test/canvas-generated.png",
          sourceUrl: "https://example.test/canvas-generated-source.png",
        },
      ],
    });
    const sendNode = nextDocument.nodes.find((node) => node.id === "send-flow");
    const resultNode = nextDocument.nodes.find((node) => node.id === "image-result");

    assert.equal(sendNode.data.status, "completed");
    assert.equal(sendNode.data.previewUrl, "https://example.test/canvas-generated.png");
    assert.equal(sendNode.data.resultUrl, "https://example.test/canvas-generated.png");
    assert.equal(resultNode.data.status, "completed");
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
  assert.match(source, /snapline:\s*\{[\s\S]*?enabled:\s*viewport\.snapEnabled !== false[\s\S]*?sharp:\s*true/);
});

it("matches the upstream default and classic Canvas interaction presets", () => {
  const defaultOptions = resolveCanvasGraphInteractionOptions({ interactionMode: "default" });
  assert.deepEqual(defaultOptions.panning, {
    enabled: true,
    eventTypes: ["rightMouseDown", "mouseWheelDown"],
    modifiers: [],
  });
  assert.deepEqual(defaultOptions.mousewheel.modifiers, []);
  assert.deepEqual(defaultOptions.selecting.eventTypes, ["leftMouseDown"]);
  assert.deepEqual(defaultOptions.selecting.modifiers, []);
  assert.deepEqual(defaultOptions.selecting.multipleSelectionModifiers, ["shift"]);

  const classicOptions = resolveCanvasGraphInteractionOptions({ interactionMode: "classic" });
  assert.deepEqual(classicOptions.panning.eventTypes, ["leftMouseDown", "mouseWheel"]);
  assert.deepEqual(classicOptions.panning.modifiers, []);
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
});

it("coalesces X6 viewport persistence and lets new edges paint before document sync", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  const wireStart = source.indexOf("function wireGraphSync");
  const wireEnd = source.indexOf("export function mountCanvasGraphEditorOverlay", wireStart);
  const wireSource = source.slice(wireStart, wireEnd);
  assert.match(wireSource, /graph\.on\("translate", \(\) => scheduleViewportSync\(\{ panning: true \}\)\)/);
  assert.match(wireSource, /graph\.on\("scale", \(\) => scheduleViewportSync\(\)\)/);
  assert.match(wireSource, /setTimeout\?\.\([\s\S]*?syncCanvasGraphViewport\(graph, workbench\)[\s\S]*?CANVAS_VIEWPORT_COMMIT_DELAY_MS/);
  assert.match(wireSource, /classList\?\.add\?\.\("is-panning"\)[\s\S]*?classList\?\.remove\?\.\("is-panning"\)/);
  assert.match(wireSource, /graph\.on\("edge:connected"[\s\S]*?scheduleGraphSync\(\)/);
  assert.match(wireSource, /requestFrame\(\(\) => \{[\s\S]*?setTimeout\?\.\([\s\S]*?sync\(\)/);
  assert.match(source, /classList\?\.contains\?\.\("is-x6-ready"\)\) return true;/);
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
  assert.match(source, /graph\.on\("node:mouseup", \(\{ node \}\) => selectGraphNode\(node\)\)/);
  assert.match(source, /graph\.on\("cell:click", \(\{ cell \}\) => \{/);
  assert.match(source, /graph\.on\("selection:changed", \(\{ added = \[\] \} = \{\}\) => \{/);
  assert.match(source, /graph\.getPlugin\?\.\("selection"\)\?\.on\?\.\("selection:changed"/);
  assert.match(source, /const selectedNode = added\.find\(\(cell\) => cell\?\.isNode\?\.\(\) && cell\?\.getData\?\.\(\)\?\.canvasTransientEditor !== true\)/);
});

it("persists X6 selection-box moves when the selection drag ends", () => {
  const source = readFileSync(new URL("../src/features/production-workbench/canvas/canvas-x6-graph.js", import.meta.url), "utf8");
  assert.match(source, /event\?\.options\?\.selection[\s\S]*?selectionMovePending = true/);
  assert.match(source, /graph\.getPlugin\?\.\("selection"\)\?\.on\?\.\("box:mouseup", \(\) => \{[\s\S]*?if \(selectionMovePending\)[\s\S]*?sync\(\{ clearToast: true \}\)/);
});

it("updates an already mounted X6 graph when the Canvas interaction mode changes", () => {
  let rubberbandModifiers = null;
  let panningEnabled = 0;
  let mousewheelEnabled = 0;
  const graph = {
    options: {
      panning: { enabled: false, eventTypes: ["rightMouseDown"] },
      mousewheel: { enabled: false, modifiers: [] },
      selecting: { enabled: true, modifiers: [] },
    },
    setRubberbandModifiers(modifiers) { rubberbandModifiers = modifiers; },
    enablePanning() { panningEnabled += 1; },
    enableMouseWheel() { mousewheelEnabled += 1; },
  };

  assert.equal(applyCanvasGraphInteractionMode(graph, { interactionMode: "classic" }), true);
  assert.deepEqual(graph.options.panning.eventTypes, ["leftMouseDown", "mouseWheel"]);
  assert.deepEqual(graph.options.mousewheel.modifiers, ["ctrl"]);
  assert.deepEqual(graph.options.selecting.modifiers, ["shift"]);
  assert.deepEqual(rubberbandModifiers, ["shift"]);
  assert.equal(panningEnabled, 1);
  assert.equal(mousewheelEnabled, 1);
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
  assert.match(hostSource, /\.canvas-stage\.is-panning \.x6-graph-svg-viewport\s*\{[\s\S]*?will-change:\s*transform;/);
  assert.match(hostSource, /\.canvas-stage\.is-panning \.x6-node:not\(\.x6-node-selected\):hover rect\s*\{[\s\S]*?filter:\s*none;/);
  assert.match(source, /\.canvas-x6-mount \.x6-widget-selection-rubberband\s*\{[\s\S]*?zoom:\s*var\(--comic-ai-canvas-selection-zoom,\s*1\)/);
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
  assert.doesNotMatch(source, /canvas-view-tools-more/);
  assert.doesNotMatch(source, /更多画布操作/);
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
  assert.match(source, /\.canvas-x6-special-node\[data-node-id\]/);
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
    showGrid: () => snapCalls.push("show-grid"),
    hideGrid: () => snapCalls.push("hide-grid"),
  };
  assert.equal(applyCanvasGraphEdgeVisibility(graph, false), true);
  assert.deepEqual(edgeCalls, ["hide", "visible:false"]);
  assert.equal(applyCanvasGraphViewportPreferences(graph, { snapEnabled: false, gridVisible: true }), true);
  assert.equal(graph.options.snapline.enabled, false);
  assert.deepEqual(graph.options.connecting.snap, { radius: 28, anchor: "center" });
  assert.deepEqual(snapCalls, ["disable", "show-grid"]);
});
