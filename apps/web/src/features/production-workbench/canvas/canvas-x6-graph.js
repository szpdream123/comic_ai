import { createDefaultCanvasDocument } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
  resolveCanvasConnectionPorts,
} from "./canvas-x6-document.js";

const X6_VENDOR_SRC = "/vendor/@antv/x6/dist/x6.min.js";
const X6_READY_KEY = "__comicAiX6Ready";
let x6LoadPromise = null;

export async function mountCanvasWorkflowIfPresent(workbench) {
  const root = workbench?.root;
  const mount = root?.querySelector?.("[data-canvas-x6-mount]");
  if (!mount || mount.dataset.x6Mounted === "true" || typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }

  mount.dataset.x6Mounted = "pending";
  try {
    const X6 = await loadX6();
    registerCanvasNode(X6);

    const canvasDocument = ensureCanvasDocument(workbench);
    const graph = createGraph(X6, mount, workbench);
    graph.fromJSON(canvasDocumentToX6Data(canvasDocument));
    applyInitialViewport(graph, canvasDocument.viewport);

    wireGraphSync(graph, workbench);
    selectCurrentCanvasNode(graph, workbench);
    workbench.canvasGraph = graph;
    mount.dataset.x6Mounted = "true";
    mount.closest(".canvas-stage")?.classList.add("is-x6-ready");
    return graph;
  } catch (error) {
    console.warn("Failed to mount canvas workflow graph", error);
    mount.dataset.x6Mounted = "failed";
    mount.closest(".canvas-stage")?.classList.remove("is-x6-ready");
    return null;
  }
}

function applyInitialViewport(graph, viewport = {}) {
  if (typeof graph.zoomTo === "function") {
    graph.zoomTo(Number(viewport?.zoom ?? 1));
  }
  if (typeof graph.translate === "function") {
    graph.translate(Number(viewport?.x ?? 0), Number(viewport?.y ?? 0));
  }
}

function ensureCanvasDocument(workbench) {
  if (!workbench.ui.canvasDocument) {
    workbench.ui.canvasDocument = createDefaultCanvasDocument({
      projectId: workbench.ui.selectedProjectCardId ?? workbench.state?.project?.id ?? "",
      episodeId: workbench.ui.selectedEpisodeId ?? "",
    });
  }
  return workbench.ui.canvasDocument;
}

function loadX6() {
  if (window.X6?.Graph) {
    return Promise.resolve(window.X6);
  }
  if (window[X6_READY_KEY]) {
    return window[X6_READY_KEY];
  }
  if (!x6LoadPromise) {
    x6LoadPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${X6_VENDOR_SRC}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.X6), { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = X6_VENDOR_SRC;
      script.async = true;
      script.onload = () => (window.X6?.Graph ? resolve(window.X6) : reject(new Error("X6 global was not created")));
      script.onerror = () => reject(new Error(`Unable to load ${X6_VENDOR_SRC}`));
      document.head.appendChild(script);
    });
    window[X6_READY_KEY] = x6LoadPromise;
  }
  return x6LoadPromise;
}

function registerCanvasNode(X6) {
  const Graph = X6.Graph;
  if (Graph.__comicAiCanvasNodeRegistered || typeof Graph.registerNode !== "function") {
    return;
  }
  Graph.registerNode("comic-ai-canvas-node", {
    shape: "comic-ai-canvas-node",
    inherit: "rect",
    markup: [
      { tagName: "rect", selector: "body" },
      { tagName: "rect", selector: "accent" },
      { tagName: "text", selector: "title" },
      { tagName: "text", selector: "status" },
      { tagName: "text", selector: "meta" },
      { tagName: "text", selector: "summary" },
      { tagName: "text", selector: "io" },
    ],
    attrs: {
      body: {
        refWidth: "100%",
        refHeight: "100%",
        stroke: "rgba(255,255,255,0.18)",
        strokeWidth: 1,
        fill: "#161717",
        rx: 8,
        ry: 8,
      },
      accent: {
        refHeight: "100%",
        width: 4,
        fill: "rgba(255,255,255,0.22)",
      },
      title: {
        refX: 18,
        refY: 22,
        fontSize: 14,
        fontWeight: 800,
        fill: "rgba(255,255,255,0.9)",
        textWrap: { width: -112, height: 22, ellipsis: true },
      },
      status: {
        refX: "100%",
        refX2: -18,
        refY: 22,
        textAnchor: "end",
        fontSize: 10,
        fontWeight: 800,
        fill: "rgba(255,255,255,0.56)",
      },
      meta: {
        refX: 18,
        refY: 48,
        fontSize: 12,
        fontWeight: 800,
        fill: "#5ec7ff",
        textWrap: { width: -36, height: 18, ellipsis: true },
      },
      summary: {
        refX: 18,
        refY: 76,
        fontSize: 12,
        fill: "rgba(255,255,255,0.58)",
        textWrap: { width: -36, height: 20, ellipsis: true },
      },
      io: {
        refX: 18,
        refY: "100%",
        refY2: -24,
        fontSize: 11,
        fontWeight: 800,
        fill: "rgba(255,255,255,0.42)",
      },
    },
  }, true);
  Graph.__comicAiCanvasNodeRegistered = true;
}
export function refreshCanvasWorkflowGraph(workbench) {
  const graph = workbench?.canvasGraph;
  const document = workbench?.ui?.canvasDocument;
  if (!graph || !document) {
    return false;
  }
  graph.fromJSON(canvasDocumentToX6Data(document));
  selectCurrentCanvasNode(graph, workbench);
  return true;
}

export function refreshCanvasWorkflowNode(workbench, nodeId, options = {}) {
  const graph = workbench?.canvasGraph;
  const node = workbench?.ui?.canvasDocument?.nodes?.find?.((item) => item.id === nodeId);
  if (!graph || !node) {
    return false;
  }
  const cell = graph.getCellById?.(nodeId);
  if (!cell?.setData || !cell?.getData) {
    return refreshCanvasWorkflowGraph(workbench);
  }
  cell.setData(
    {
      ...(cell.getData() ?? {}),
      canvasNode: structuredCloneSafe(node),
    },
    options.silent ? { silent: true } : undefined,
  );
  const nextNode = canvasDocumentToX6Data({ nodes: [node], edges: [] }).nodes[0];
  if (nextNode?.attrs && typeof cell.setAttrs === "function") {
    cell.setAttrs(nextNode.attrs, options.silent ? { silent: true } : undefined);
  }
  return true;
}

function createGraph(X6, mount, workbench) {
  const viewport = workbench?.ui?.canvasDocument?.viewport ?? {};
  return new X6.Graph({
    container: mount,
    autoResize: true,
    background: { color: "transparent" },
    grid: {
      size: 18,
      visible: viewport.gridVisible !== false,
      type: "dot",
      args: { color: "rgba(255,255,255,0.14)", thickness: 1 },
    },
    panning: { enabled: true, modifiers: ["space"] },
    mousewheel: {
      enabled: true,
      modifiers: ["ctrl", "meta"],
      minScale: 0.35,
      maxScale: 2.2,
    },
    selecting: {
      enabled: true,
      multiple: true,
      rubberband: true,
      showNodeSelectionBox: true,
    },
    keyboard: { enabled: true, global: false },
    history: { enabled: true },
    connecting: {
      allowBlank: false,
      allowLoop: false,
      allowMulti: true,
      snap: viewport.snapEnabled !== false,
      router: { name: "orth", args: { padding: 26 } },
      connector: { name: "rounded", args: { radius: 12 } },
      highlight: true,
      createEdge() {
        return this.createEdge({
          attrs: buildEdgeAttrs("idle"),
          zIndex: 1,
        });
      },
      validateConnection({ sourceCell, targetCell, sourcePort, targetPort }) {
        const { sourcePort: source, targetPort: target } = resolveCanvasConnectionPorts(workbench?.ui?.canvasDocument, {
          sourceNodeId: sourceCell?.id,
          sourcePortId: sourcePort,
          targetNodeId: targetCell?.id,
          targetPortId: targetPort,
        });
        return validateCanvasConnection(source, target).ok;
      },
    },
  });
}

function wireGraphSync(graph, workbench) {
  const sync = () => {
    const graphData = readGraphData(graph);
    workbench.ui.canvasDocument = canvasDocumentFromX6Data(graphData, workbench.ui.canvasDocument);
  };
  graph.on("node:moved", sync);
  graph.on("node:resized", sync);
  graph.on("edge:connected", sync);
  graph.on("edge:removed", sync);
  graph.on("cell:change:data", sync);
  graph.on("cell:removed", sync);
  graph.on("node:click", ({ node }) => {
    selectCanvasNodeFromGraph(workbench, node?.id);
  });
  graph.on("cell:selected", ({ cell }) => {
    selectCanvasNodeFromGraph(workbench, cell?.isNode?.() ? cell.id : null);
  });
  bindCanvasGraphKey(graph, ["backspace", "delete"], () => {
    const selectedCells = graph.getSelectedCells();
    if (selectedCells.length) {
      graph.removeCells(selectedCells);
      sync();
    }
    return false;
  });
  bindCanvasGraphKey(graph, ["ctrl+z", "meta+z"], () => {
    graph.undo();
    sync();
    return false;
  });
  bindCanvasGraphKey(graph, ["ctrl+shift+z", "meta+shift+z"], () => {
    graph.redo();
    sync();
    return false;
  });
}

function selectCanvasNodeFromGraph(workbench, nodeId) {
  if (!nodeId || nodeId === workbench.ui.selectedCanvasNodeId) {
    return;
  }
  workbench.ui.selectedCanvasNodeId = nodeId;
  workbench.onCanvasNodeSelected?.(nodeId);
}

function selectCurrentCanvasNode(graph, workbench) {
  const nodeId = workbench?.ui?.selectedCanvasNodeId;
  const cell = nodeId ? graph.getCellById?.(nodeId) : null;
  if (cell?.isNode?.() && typeof graph.select === "function") {
    graph.select(cell);
  }
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value ?? null));
}

function bindCanvasGraphKey(graph, keys, handler) {
  if (typeof graph.bindKey === "function") {
    graph.bindKey(keys, handler);
    return;
  }
  const container = graph.container ?? graph.options?.container;
  if (!container || graph.__comicAiCanvasKeydownBound) {
    return;
  }
  graph.__comicAiCanvasKeydownBound = true;
  container.tabIndex = container.tabIndex >= 0 ? container.tabIndex : 0;
  container.addEventListener("keydown", (event) => {
    const combo = normalizeKeyCombo(event);
    const matchedKeys = Array.isArray(keys) ? keys : [keys];
    if (!matchedKeys.includes(combo)) {
      return;
    }
    const result = handler(event);
    if (result === false) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

function normalizeKeyCombo(event) {
  const parts = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.metaKey) parts.push("meta");
  if (event.shiftKey) parts.push("shift");
  parts.push(String(event.key ?? "").toLowerCase());
  return parts.join("+");
}

function readGraphData(graph) {
  return {
    nodes: graph.getNodes().map((node) => {
      const position = node.getPosition();
      const size = node.getSize();
      const data = node.getData() ?? {};
      return {
        id: node.id,
        shape: node.shape,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        data,
      };
    }),
    edges: graph.getEdges().map((edge) => {
      const data = edge.getData() ?? {};
      return {
        id: edge.id,
        shape: edge.shape,
        source: edge.getSource(),
        target: edge.getTarget(),
        data,
      };
    }),
  };
}

function buildEdgeAttrs(status) {
  const active = status === "running";
  return {
    line: {
      stroke: active ? "#5ec7ff" : "rgba(156,168,174,0.82)",
      strokeWidth: active ? 3 : 2.2,
      targetMarker: {
        name: "block",
        width: 8,
        height: 6,
      },
    },
  };
}
