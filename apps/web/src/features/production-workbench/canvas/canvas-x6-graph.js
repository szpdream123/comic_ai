import { createDefaultCanvasDocument } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";
import { duplicateCanvasNodes } from "./canvas-state.js";
import { renderCanvasAnimationNodeBody } from "./canvas-animation-node.js";
import { renderCanvasDirectorNodeBody } from "./canvas-director-node.js";
import {
  isCanvasFrameAnalysisNode,
  renderCanvasFrameAnalysisNodeBody,
} from "./canvas-frame-analysis-node.js";
import { canvasGroupChildIds, renderCanvasGroupNodeBody } from "./canvas-group-node.js";
import {
  renderCanvasMediaNodeBody,
  resolveCanvasMediaDirectUrl,
  resolveCanvasMediaNodeSource,
  resolveCanvasMediaUrl,
} from "./canvas-media-node.js";
import {
  renderCanvasPanoramaNodeBody,
  renderCanvasStoryboardNodeBody,
  syncCanvasStoryboardGridAspectRatio,
} from "../../new-canvas/special-media-nodes.js";
import { renderCanvasShotlistNodeBody } from "./canvas-shotlist-node.js";
import { bindCanvasImageLoadRetry } from "./canvas-image-load-retry.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "./canvas-x6-document.js";
import { normalizeCanvasNotePoints, renderCanvasNoteNode, resizeCanvasNoteDataPoints } from "./canvas-note-node.js";

const X6_VENDOR_SRC = "/vendor/@antv/x6/dist/x6.min.js";
const X6_READY_KEY = "__comicAiX6Ready";
const CANVAS_EDITOR_OVERLAY_ID = "__comic-ai-canvas-editor-overlay__";
const CANVAS_CONNECTION_SNAP_RADIUS = 50;
const CANVAS_CONNECTION_MENU_GAP = 12;
const CANVAS_GRID_SIZE = 20;
const CANVAS_SELECTION_BOUNDS_PADDING = 8;
const CANVAS_VIEWPORT_COMMIT_DELAY_MS = 600;
const canvasTextNodeScrollState = new Map();
const canvasStoryboardScrollState = new Map();
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
    mirrorX6StylesIntoRoot(mount);

    const graphSize = await waitForCanvasGraphMountSize(mount);
    const canvasDocument = ensureCanvasDocument(workbench);
    bindCanvasNativeNodeSelection(mount, workbench);
    const graph = createGraph(X6, mount, workbench, graphSize);
    enableCanvasGraphSelection(X6, graph, canvasDocument.viewport, workbench, mount);
    enableCanvasGraphSnapline(X6, graph, canvasDocument.viewport);
    graph.__comicAiCanvasMount = mount;
    mirrorX6StylesIntoRoot(mount);
    graph.fromJSON(canvasDocumentToX6Data(canvasDocument));
    graph.__comicAiCanvasDocument = canvasDocument;
    applyCanvasGraphEdgeStyle(graph, workbench?.ui?.canvasEdgeStyle);
    applyCanvasGraphEdgeVisibility(graph, workbench?.ui?.canvasEdgesHidden !== true);
    applyCanvasGraphViewportPreferences(graph, canvasDocument.viewport);
    applyCanvasGraphGrouping(graph, canvasDocument);
    applyInitialViewport(graph, canvasDocument.viewport);
    applyCanvasGraphViewportStyles(graph, workbench, canvasDocument.viewport);
    syncCanvasZoomControlDisplay(workbench.root, graph.zoom?.());

    wireGraphSync(graph, workbench, mount);
    selectCurrentCanvasNode(graph, workbench);
    refreshCanvasConnectedEdgeMotion(graph);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasSelectionActionToolbar(graph, workbench, mount);
    workbench.canvasGraph = graph;
    refreshCanvasWorkflowGraph(workbench);
    mount.dataset.x6Mounted = "true";
    await stabilizeInitialCanvasViewport(
      graph,
      workbench.ui.canvasDocument?.viewport ?? canvasDocument.viewport,
      mount,
    );
    mount.closest(".canvas-stage")?.classList.add("is-x6-ready");
    return graph;
  } catch (error) {
    console.warn("Failed to mount canvas workflow graph", error);
    mount.dataset.x6Mounted = "failed";
    mount.closest(".canvas-stage")?.classList.remove("is-x6-ready");
    return null;
  }
}

export function bindCanvasNativeNodeSelection(mount, workbench) {
  if (!mount?.addEventListener || mount.__comicAiCanvasNodeSelectionBound) {
    return false;
  }
  const resolveNodeId = (event) => {
    const eventPath = event.composedPath?.() ?? [];
    if (eventPath.some((candidate) => candidate?.matches?.("[magnet='true']"))) {
      return "";
    }
    const x6Node = eventPath.find((candidate) =>
      candidate?.classList?.contains?.("x6-node") && candidate?.getAttribute?.("data-cell-id"));
    const htmlNode = eventPath.find((candidate) =>
      candidate?.classList?.contains?.("canvas-x6-special-node"));
    const nodeId = String(
      x6Node?.getAttribute?.("data-cell-id")
      ?? htmlNode?.dataset?.nodeId
      ?? event.target?.closest?.(".canvas-x6-special-node[data-node-id]")?.dataset?.nodeId
      ?? "",
    ).trim();
    return nodeId === CANVAS_EDITOR_OVERLAY_ID ? "" : nodeId;
  };
  const isInteractiveTarget = (event) => {
    const path = event.composedPath?.() ?? [];
    const nodeIndex = path.findIndex((candidate) => candidate?.classList?.contains?.("canvas-x6-special-node"));
    if (nodeIndex >= 0) {
      return path.slice(0, nodeIndex).some((candidate) =>
        candidate?.matches?.("button, input, textarea, select, a, [role='application'], [data-canvas-text-output], [data-canvas-note-point-index]"));
    }
    const node = event.target?.closest?.(".canvas-x6-special-node");
    const interactive = event.target?.closest?.("button, input, textarea, select, a, [role='application'], [data-canvas-text-output], [data-canvas-note-point-index]");
    return Boolean(node && interactive && node.contains?.(interactive));
  };
  const selectNode = (nodeId) => {
    if (!nodeId || !workbench?.ui) {
      return;
    }
    if (
      nodeId === workbench.ui.selectedCanvasNodeId
      && workbench.ui.canvasEditorOpen === true
    ) {
      return;
    }
    workbench.ui.selectedCanvasNodeId = nodeId;
    workbench.onCanvasNodeSelected?.(nodeId);
  };
  let pointerDown = null;
  mount.addEventListener("pointerdown", (event) => {
    if (isInteractiveTarget(event)) {
      pointerDown = null;
      return;
    }
    pointerDown = {
      nodeId: resolveNodeId(event),
      x: Number(event.clientX ?? 0),
      y: Number(event.clientY ?? 0),
    };
  }, true);
  mount.addEventListener("pointerup", (event) => {
    const nodeId = resolveNodeId(event);
    const distance = Math.hypot(
      Number(event.clientX ?? 0) - Number(pointerDown?.x ?? 0),
      Number(event.clientY ?? 0) - Number(pointerDown?.y ?? 0),
    );
    if (nodeId && nodeId === pointerDown?.nodeId && distance <= 4) {
      selectNode(nodeId);
    }
    pointerDown = null;
  }, true);
  mount.addEventListener("comic-ai-canvas-node-select", (event) => {
    selectNode(String(event.detail?.nodeId ?? "").trim());
  });
  mount.addEventListener("comic-ai-canvas-note-points-change", (event) => {
    const nodeId = String(event.detail?.nodeId ?? "").trim();
    const points = Array.isArray(event.detail?.points) ? event.detail.points : [];
    const graph = workbench?.canvasGraph;
    const cell = nodeId && graph?.getCellById?.(nodeId);
    const data = cell?.getData?.() ?? {};
    const canvasNode = data.canvasNode;
    if (!cell || !canvasNode || canvasNode.type !== "canvas-note" || points.length < 2) return;
    const noteData = canvasNode.data && typeof canvasNode.data === "object" ? canvasNode.data : {};
    const nestedNote = noteData.note && typeof noteData.note === "object" ? noteData.note : null;
    const nextData = nestedNote
      ? { ...noteData, note: { ...nestedNote, points } }
      : { ...noteData, points };
    cell.setData?.({ ...data, canvasNode: { ...canvasNode, data: nextData } }, { overwrite: true });
  }, true);
  mount.__comicAiCanvasNodeSelectionBound = true;
  return true;
}

export function enableCanvasGraphSelection(X6, graph, viewport = {}, workbench = null, mount = null) {
  if (!graph?.use || typeof X6?.Selection !== "function") {
    return false;
  }
  if (graph.getPlugin?.("selection")) {
    return true;
  }
  const graphContainer = graph.container ?? graph.options?.container;
  const selecting = resolveCanvasGraphInteractionOptions(viewport).selecting;
  const resolveContainerScale = (rect) => ({
    x: Number(rect?.width) > 0
      ? (Number(graphContainer?.clientWidth) || Number(rect.width)) / Number(rect.width)
      : 1,
    y: Number(rect?.height) > 0
      ? (Number(graphContainer?.clientHeight) || Number(rect.height)) / Number(rect.height)
      : 1,
  });
  let rubberbandStart = null;
  let pendingRubberbandClick = null;
  if (graphContainer?.addEventListener && !graphContainer.__comicAiCanvasPointerOffsetBound) {
    const normalizePointerOffset = (event) => {
      const rect = graphContainer.getBoundingClientRect?.();
      if (!rect || !Number.isFinite(Number(event.clientX)) || !Number.isFinite(Number(event.clientY))) return;
      const eventPath = event.composedPath?.() ?? [];
      const startsOnCellOrSelection = eventPath.some((candidate) => candidate?.matches?.(
        ".x6-node, .x6-edge, .x6-widget-selection-box, .x6-widget-selection-inner, [magnet='true']",
      ));
      rubberbandStart = startsOnCellOrSelection
        ? null
        : { x: Number(event.clientX), y: Number(event.clientY) };
      const scale = resolveContainerScale(rect);
      const offsetX = (Number(event.clientX) - Number(rect.left ?? 0)) * scale.x;
      const offsetY = (Number(event.clientY) - Number(rect.top ?? 0)) * scale.y;
      try {
        Object.defineProperties(event, {
          offsetX: { configurable: true, value: offsetX },
          offsetY: { configurable: true, value: offsetY },
        });
      } catch {
        // Browser event offsets may be non-configurable; X6 can still use its native fallback.
      }
    };
    const suppressRubberbandClick = (event) => {
      const pending = pendingRubberbandClick;
      if (!pending || Date.now() > pending.expiresAt) {
        pendingRubberbandClick = null;
        return;
      }
      const eventPath = event.composedPath?.() ?? [];
      const withinGraph = eventPath.includes(graphContainer);
      const sameEndpoint = Math.abs(Number(event.clientX) - pending.x) <= 4
        && Math.abs(Number(event.clientY) - pending.y) <= 4;
      if (!withinGraph || !sameEndpoint) return;
      pendingRubberbandClick = null;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
    };
    graphContainer.addEventListener("mousedown", normalizePointerOffset, true);
    graphContainer.addEventListener("pointerdown", normalizePointerOffset, true);
    graphContainer.getRootNode?.()?.addEventListener?.("click", suppressRubberbandClick, true);
    graphContainer.__comicAiCanvasPointerOffsetBound = true;
  }
  const selection = new X6.Selection({
    enabled: selecting.enabled,
    multiple: true,
    rubberband: selecting.rubberband,
    showNodeSelectionBox: true,
    filter: (cell) => cell?.getData?.()?.canvasTransientEditor !== true,
  });
  graph.use(selection);
  const clearRubberbandBounds = () => {
    const rubberband = graphContainer?.querySelector?.(".x6-widget-selection-rubberband");
    if (!rubberband?.style) return;
    rubberband.style.left = "";
    rubberband.style.top = "";
    rubberband.style.width = "";
    rubberband.style.height = "";
  };
  selection.on?.("box:mousemove", ({ e } = {}) => {
    if (!isCanvasRubberbandSelectionEvent(e)) {
      rubberbandStart = null;
      clearRubberbandBounds();
      return;
    }
    const start = rubberbandStart;
    const endX = Number(e?.clientX);
    const endY = Number(e?.clientY);
    const rect = graphContainer?.getBoundingClientRect?.();
    const rubberband = graphContainer?.querySelector?.(".x6-widget-selection-rubberband");
    if (!start || !Number.isFinite(endX) || !Number.isFinite(endY) || !rect || !rubberband?.style) return;
    const scale = resolveContainerScale(rect);
    rubberband.style.left = `${(Math.min(start.x, endX) - Number(rect.left ?? 0)) * scale.x}px`;
    rubberband.style.top = `${(Math.min(start.y, endY) - Number(rect.top ?? 0)) * scale.y}px`;
    rubberband.style.width = `${Math.abs(endX - start.x) * scale.x}px`;
    rubberband.style.height = `${Math.abs(endY - start.y) * scale.y}px`;
  });
  selection.on?.("box:mouseup", ({ e } = {}) => {
    const start = rubberbandStart;
    rubberbandStart = null;
    if (!isCanvasRubberbandSelectionEvent(e)) {
      clearRubberbandBounds();
      return;
    }
    const endX = Number(e?.clientX);
    const endY = Number(e?.clientY);
    if (!start || !Number.isFinite(endX) || !Number.isFinite(endY)) {
      clearRubberbandBounds();
      return;
    }
    const clientRect = {
      x: Math.min(start.x, endX),
      y: Math.min(start.y, endY),
      width: Math.abs(endX - start.x),
      height: Math.abs(endY - start.y),
    };
    if (clientRect.width <= 4 && clientRect.height <= 4) {
      clearRubberbandBounds();
      return;
    }
    pendingRubberbandClick = {
      x: endX,
      y: endY,
      expiresAt: Date.now() + 500,
    };
    const right = clientRect.x + clientRect.width;
    const bottom = clientRect.y + clientRect.height;
    const selectedNodes = (graph.getNodes?.() ?? []).filter((node) => {
      if (node?.getData?.()?.canvasTransientEditor === true) return false;
      const nodeRect = graph.localToClient?.(node?.getBBox?.());
      if (!nodeRect) return false;
      return nodeRect.x <= right
        && nodeRect.x + nodeRect.width >= clientRect.x
        && nodeRect.y <= bottom
        && nodeRect.y + nodeRect.height >= clientRect.y;
    });
    selection.reset?.(selectedNodes, { batch: true });
    clearRubberbandBounds();
    const refreshSelectionToolbar = () => (
      refreshCanvasSelectionActionToolbar(graph, workbench, mount ?? graphContainer)
    );
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(refreshSelectionToolbar);
    } else {
      globalThis.setTimeout?.(refreshSelectionToolbar, 0);
    }
  });
  return true;
}

function isCanvasRubberbandSelectionEvent(event) {
  const eventData = event?.data;
  return Boolean(eventData && typeof eventData === "object"
    && Object.values(eventData).some((value) => value?.action === "selecting"));
}

export function enableCanvasGraphSnapline(X6, graph, viewport = {}) {
  if (!graph?.use || typeof X6?.Snapline !== "function") return false;
  if (graph.getPlugin?.("snapline")) return true;
  graph.use(new X6.Snapline({
    enabled: viewport.snapEnabled === true,
    sharp: true,
    tolerance: 8,
  }));
  return true;
}

function mirrorX6StylesIntoRoot(mount) {
  const root = mount?.getRootNode?.();
  if (!root?.host || typeof root.querySelector !== "function" || typeof root.append !== "function") return;
  const styles = [...(document.head?.querySelectorAll?.("style") ?? [])]
    .filter((style) => String(style.textContent ?? "").includes(".x6-"));
  styles.forEach((style, index) => {
    const selector = `style[data-canvas-x6-vendor-style="${index}"]`;
    const mirrored = root.querySelector(selector) ?? document.createElement("style");
    mirrored.dataset.canvasX6VendorStyle = String(index);
    mirrored.textContent = style.textContent;
    if (!mirrored.isConnected) root.append(mirrored);
  });
}

export function resolveCanvasGraphMountSize(mount) {
  const rect = mount?.getBoundingClientRect?.() ?? {};
  const parentRect = mount?.parentElement?.getBoundingClientRect?.() ?? {};
  return {
    width: Math.max(
      0,
      Number(mount?.clientWidth ?? 0)
        || Number(mount?.parentElement?.clientWidth ?? 0)
        || Number(rect.width ?? 0)
        || Number(parentRect.width ?? 0)
        || 0,
    ),
    height: Math.max(
      0,
      Number(mount?.clientHeight ?? 0)
        || Number(mount?.parentElement?.clientHeight ?? 0)
        || Number(rect.height ?? 0)
        || Number(parentRect.height ?? 0)
        || 0,
    ),
  };
}

async function waitForCanvasGraphMountSize(mount) {
  let size = resolveCanvasGraphMountSize(mount);
  let previousReadySize = null;
  for (let frame = 0; frame < 60; frame += 1) {
    const stylesReady = canvasGraphStyleSheetsReady(mount);
    if (stylesReady && size.width > 0 && size.height > 0) {
      if (previousReadySize?.width === size.width && previousReadySize?.height === size.height) return size;
      previousReadySize = size;
    } else {
      previousReadySize = null;
    }
    await nextCanvasGraphFrame();
    size = resolveCanvasGraphMountSize(mount);
  }
  return size;
}

function canvasGraphStyleSheetsReady(mount) {
  const root = mount?.getRootNode?.();
  if (!root?.host || typeof root.querySelectorAll !== "function") return true;
  const styleLinks = [...root.querySelectorAll("link[data-new-canvas-style]")];
  return styleLinks.length === 0 || styleLinks.every((link) => Boolean(link.sheet));
}

function nextCanvasGraphFrame() {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(resolve);
    else window.setTimeout(resolve, 16);
  });
}

function applyInitialViewport(graph, viewport = {}) {
  if (typeof graph.zoomTo === "function") {
    graph.zoomTo(Number(viewport?.zoom ?? 1));
  }
  if (typeof graph.translate === "function") {
    graph.translate(Number(viewport?.x ?? 0), Number(viewport?.y ?? 0));
  }
}

async function stabilizeInitialCanvasViewport(graph, viewport, mount) {
  for (let frame = 0; frame < 2; frame += 1) {
    await nextCanvasGraphFrame();
    if (mount?.isConnected === false) return false;
    applyInitialViewport(graph, viewport);
  }
  return true;
}

function ensureCanvasDocument(workbench) {
  if (!workbench.ui.canvasDocument) {
    workbench.ui.canvasDocument = createDefaultCanvasDocument({
      canvasProjectId: workbench.ui.selectedCanvasProjectId ?? "",
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
    const pendingLoad = new Promise((resolve, reject) => {
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
    x6LoadPromise = pendingLoad.catch((error) => {
      x6LoadPromise = null;
      delete window[X6_READY_KEY];
      throw error;
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
  Graph.registerEdge?.("comic-ai-canvas-edge", {
    inherit: "edge",
    markup: [
      { tagName: "path", selector: "wrap", groupSelector: "lines" },
      { tagName: "path", selector: "line", groupSelector: "lines" },
      { tagName: "path", selector: "flow", groupSelector: "lines" },
    ],
    attrs: {
      lines: {
        connection: true,
        fill: "none",
        strokeLinejoin: "round",
      },
      wrap: {
        cursor: "pointer",
        stroke: "transparent",
        strokeLinecap: "round",
        strokeWidth: 18,
      },
      flow: {
        pointerEvents: "none",
        stroke: "#5ec7ff",
        strokeDasharray: "18 82",
        strokeLinecap: "round",
        strokeWidth: 2,
        opacity: 0.78,
      },
    },
  }, true);
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
  const HtmlShape = resolveCanvasHtmlShape(X6);
  if (typeof HtmlShape?.register === "function") {
    HtmlShape.register({
      shape: "comic-ai-canvas-special-media-node",
      effect: ["data"],
      html(cell) {
        return createCanvasSpecialMediaX6Node(cell?.getData?.()?.canvasNode);
      },
    });
    HtmlShape.register({
      shape: "comic-ai-canvas-editor-overlay",
      effect: ["data"],
      html(cell) {
        return createCanvasEditorOverlayX6Node(cell?.getData?.()?.editorHtml);
      },
    });
  } else {
    Graph.registerNode("comic-ai-canvas-special-media-node", {
      inherit: "comic-ai-canvas-node",
    }, true);
  }
  Graph.__comicAiCanvasNodeRegistered = true;
}

function createCanvasEditorOverlayX6Node(editorHtml = "") {
  if (typeof document === "undefined") return `<div class="canvas-x6-editor-overlay">${editorHtml}</div>`;
  const wrapper = document.createElement("div");
  wrapper.className = "canvas-x6-editor-overlay";
  wrapper.innerHTML = String(editorHtml ?? "");
  const editor = wrapper.querySelector(".canvas-node-editor");
  if (editor?.style) {
    editor.style.removeProperty("left");
    editor.style.removeProperty("top");
    editor.style.removeProperty("transform");
  }
  editor?.addEventListener?.("pointerdown", (event) => event.stopPropagation());
  editor?.addEventListener?.("mousedown", (event) => event.stopPropagation());
  editor?.addEventListener?.("wheel", (event) => event.stopPropagation(), { passive: true });
  return wrapper;
}

function createCanvasSpecialMediaX6Node(node = {}) {
  if (typeof document === "undefined") {
    return renderCanvasSpecialMediaX6Node(node);
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderCanvasSpecialMediaX6Node(node);
  const element = wrapper.firstElementChild;
  applyCanvasX6NodePresentation(element, node);
  bindCanvasNotePointControls(element, node);
  element?.querySelectorAll?.("button, input, textarea, select, a, [contenteditable='true'], [role='application'], [data-canvas-text-output]").forEach((control) => {
    control.addEventListener("pointerdown", (event) => event.stopPropagation());
    control.addEventListener("mousedown", (event) => event.stopPropagation());
    control.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  });
  syncCanvasStoryboardGridAspectRatio(element);
  element?.querySelectorAll?.("[data-canvas-image-fallback-src]").forEach((image) => {
    image.addEventListener?.("error", () => {
      const fallback = String(image.dataset?.canvasImageFallbackSrc ?? "").trim();
      if (!fallback || image.dataset.canvasImageFallbackUsed === "true") return;
      image.dataset.canvasImageFallbackUsed = "true";
      image.src = fallback;
    });
  });
  // COS 对象刚写入时可能短暂返回 404；在已有缩略图/原图回退之后，
  // 对仍失败的远程图片做有限退避重试，避免把失败状态写回画布数据。
  element?.querySelectorAll?.("img").forEach((image) => {
    bindCanvasImageLoadRetry(image);
  });
  element?.querySelectorAll?.("[data-canvas-video-fallback-src]").forEach((video) => {
    video.addEventListener?.("error", () => {
      const fallback = String(video.dataset?.canvasVideoFallbackSrc ?? "").trim();
      if (!fallback || video.dataset.canvasVideoFallbackUsed === "true") return;
      video.dataset.canvasVideoFallbackUsed = "true";
      video.src = fallback;
      video.load?.();
    });
  });
  const storyboardBody = element?.querySelector?.("[data-canvas-storyboard-body]");
  if (storyboardBody) {
    const nodeId = String(node?.id ?? "");
    const previousScrollTop = canvasStoryboardScrollState.get(nodeId) ?? 0;
    storyboardBody.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    storyboardBody.addEventListener("scroll", () => {
      canvasStoryboardScrollState.set(nodeId, storyboardBody.scrollTop);
    });
    const restoreScroll = () => {
      storyboardBody.scrollTop = Math.min(
        previousScrollTop,
        Math.max(0, storyboardBody.scrollHeight - storyboardBody.clientHeight),
      );
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreScroll);
    } else {
      queueMicrotask(restoreScroll);
    }
  }
  const textOutput = element?.querySelector?.("[data-canvas-text-output]");
  if (textOutput) {
    const nodeId = String(node?.id ?? "");
    const previousState = canvasTextNodeScrollState.get(nodeId) ?? {
      scrollTop: 0,
      followLatest: !textOutput.matches?.("[data-canvas-source-text-output]"),
    };
    textOutput.addEventListener("wheel", (event) => event.stopPropagation());
    textOutput.addEventListener("scroll", () => {
      const remaining = textOutput.scrollHeight - textOutput.clientHeight - textOutput.scrollTop;
      canvasTextNodeScrollState.set(nodeId, {
        scrollTop: textOutput.scrollTop,
        followLatest: remaining <= 8,
      });
    });
    const restoreScroll = () => {
      if (previousState.followLatest) {
        textOutput.scrollTop = textOutput.scrollHeight;
        return;
      }
      textOutput.scrollTop = Math.min(
        previousState.scrollTop,
        Math.max(0, textOutput.scrollHeight - textOutput.clientHeight),
      );
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreScroll);
    } else {
      queueMicrotask(restoreScroll);
    }
  }
  element?.querySelectorAll?.('[data-action="pick-canvas-upload-file"]').forEach((control) => {
    control.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const nodeId = String(control.dataset?.nodeId ?? node?.id ?? "");
      const input = [...(element.querySelectorAll?.("[data-canvas-upload-input]") ?? [])]
        .find((candidate) => String(candidate.dataset?.nodeId ?? "") === nodeId);
      input?.click?.();
    });
  });
  element?.addEventListener("click", (event) => {
    const interactive = event.target?.closest?.("button, input, textarea, select, a, [contenteditable='true'], [role='application'], [data-canvas-text-output]");
    if (interactive && element.contains?.(interactive)) return;
    element.dispatchEvent(new CustomEvent("comic-ai-canvas-node-select", {
      bubbles: true,
      composed: true,
      detail: { nodeId: String(node?.id ?? "") },
    }));
  });
  return element ?? wrapper;
}

function bindCanvasNotePointControls(element, node = {}) {
  const noteData = node?.data && typeof node.data === "object" ? node.data : {};
  const note = noteData.note && typeof noteData.note === "object" ? noteData.note : noteData;
  const noteKind = String(note?.noteKind ?? note?.kind ?? "").toLowerCase();
  if (!element?.matches?.(".is-canvas-note") || !["arrow", "line", "freehand"].includes(noteKind)) return false;
  const svg = element.querySelector?.("[data-canvas-note-point-controls]");
  const handles = svg?.querySelectorAll?.("[data-canvas-note-point-index]") ?? [];
  if (!svg || !handles.length) return false;
  const width = Math.max(80, Number(node?.size?.width) || 320);
  const height = Math.max(64, Number(node?.size?.height) || 220);
  const points = note?.points;
  const sourcePoints = normalizeCanvasNotePoints(points, width, height);
  handles.forEach((handle) => {
    handle.setAttribute("aria-hidden", "false");
    handle.setAttribute("tabindex", "0");
    const startDrag = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const index = Number(handle.dataset?.canvasNotePointIndex);
      if (!Number.isInteger(index) || !sourcePoints[index]) return;
      const ownerDocument = element.ownerDocument ?? document;
      const move = (moveEvent) => {
        const rect = svg.getBoundingClientRect?.();
        if (!rect || !Number(rect.width) || !Number(rect.height)) return;
        const x = Math.max(0, Math.min(width, (Number(moveEvent.clientX) - rect.left) * width / rect.width));
        const y = Math.max(0, Math.min(height, (Number(moveEvent.clientY) - rect.top) * height / rect.height));
        handle.setAttribute("cx", String(Number(x.toFixed(3))));
        handle.setAttribute("cy", String(Number(y.toFixed(3))));
      };
      const end = () => {
        ownerDocument.removeEventListener("pointermove", move);
        ownerDocument.removeEventListener("pointerup", end);
        ownerDocument.removeEventListener("pointercancel", end);
        const nextPoints = [...sourcePoints];
        nextPoints[index] = { x: Number(handle.getAttribute("cx")), y: Number(handle.getAttribute("cy")) };
        element.dispatchEvent(new CustomEvent("comic-ai-canvas-note-points-change", {
          bubbles: true,
          composed: true,
          detail: { nodeId: String(node?.id ?? ""), points: nextPoints },
        }));
      };
      ownerDocument.addEventListener("pointermove", move);
      ownerDocument.addEventListener("pointerup", end, { once: true });
      ownerDocument.addEventListener("pointercancel", end, { once: true });
    };
    handle.addEventListener("pointerdown", startDrag);
  });
  return true;
}

function applyCanvasX6NodePresentation(element, node = {}) {
  if (!element) return;
  const status = String(node?.data?.status ?? "ready").trim().toLowerCase() || "ready";
  const origin = node?.data?.source === "canvas_agent" || String(node?.id ?? "").startsWith("canvas-agent-")
    ? "agent"
    : node?.data?.externalSource === "libtv" ? "libtv" : "user";
  element.dataset.nodeStatus = status;
  element.dataset.nodeOrigin = origin;
  const header = element.querySelector?.(":scope > header");
  if (!header) return;
  const badges = document.createElement("span");
  badges.className = "canvas-x6-node-badges";
  if (origin !== "user") {
    const originBadge = document.createElement("small");
    originBadge.className = `canvas-node-origin-badge${origin === "libtv" ? " is-libtv" : ""}`;
    originBadge.textContent = origin === "libtv" ? "LibTV" : "Agent";
    badges.append(originBadge);
  }
  const statusBadge = document.createElement("small");
  statusBadge.className = `canvas-node-status-badge ${status}`;
  statusBadge.textContent = ({
    empty: "待输入",
    ready: "就绪",
    queued: "排队中",
    pending: "等待中",
    running: "运行中",
    processing: "处理中",
    uploading: "上传中",
    completed: "已完成",
    succeeded: "已完成",
    failed: "失败",
    canceled: "已取消",
    outdated: "需重跑",
    manual_review_required: "待复核",
    result_unknown: "待复核",
  })[status] ?? status;
  badges.append(statusBadge);
  const typeBadge = Array.from(header.children).find((child) => child.tagName === "SMALL");
  if (typeBadge) {
    typeBadge.classList.add("canvas-x6-node-type-badge");
    badges.append(typeBadge);
  }
  header.append(badges);
}

export function resolveCanvasHtmlShape(X6) {
  return X6?.HTML ?? X6?.Shape?.HTML ?? null;
}

export function resolveCanvasStoryboardCutReference(node = {}) {
  const data = node?.data ?? {};
  const storyboardNodeId = String(data.parentNodeId ?? "").trim();
  if (node?.type !== "source-image" || data.source !== "canvas_derivation" || !storyboardNodeId) return null;
  const storedCellIndex = data.storyboardCellIndex;
  if (
    storedCellIndex !== undefined
    && storedCellIndex !== null
    && storedCellIndex !== ""
    && Number.isInteger(Number(storedCellIndex))
    && Number(storedCellIndex) >= 0
  ) {
    return { storyboardNodeId, cellIndex: Number(storedCellIndex), row: null, column: null };
  }
  const titleMatch = String(data.title ?? "").match(/分镜\s*(\d+)\s*-\s*(\d+)/);
  if (!titleMatch) return null;
  return {
    storyboardNodeId,
    cellIndex: null,
    row: Number(titleMatch[1]) - 1,
    column: Number(titleMatch[2]) - 1,
  };
}

function renderCanvasSpecialMediaX6Node(node = {}) {
  const requestedType = String(node?.type ?? "");
  const specialType = [
    "ai-animation", "ai-storyboard", "ai-shotlist", "ai-director", "group", "upload", "video", "ai-video", "source-image", "source-video", "audio", "ai-audio", "source-audio", "canvas-note",
  ].includes(requestedType) ? requestedType : requestedType === "ai-panorama" ? "ai-panorama" : "generic";
  if (specialType === "canvas-note") return renderCanvasNoteNode(node);
  if (specialType === "generic") return renderCanvasGenericX6Node(node);
  const type = specialType;
  const frameAnalysis = isCanvasFrameAnalysisNode(node);
  const storyboardCut = Boolean(resolveCanvasStoryboardCutReference(node));
  const configuredTitle = String(node?.data?.title ?? "").trim();
  const replacementTitle = frameAnalysis
    ? "逐帧拉片"
    : type === "ai-shotlist"
    ? "分镜表"
    : type === "ai-storyboard"
    ? "图片切分"
    : type === "ai-director" ? "导演台"
      : type === "ai-panorama" ? "全景预览" : "";
  const title = replacementTitle && ["", "AI 分镜", "AI分镜", "AI 导演", "AI导演", "AI 全景", "AI全景"].includes(configuredTitle)
    ? replacementTitle
    : configuredTitle || ({
    "ai-animation": "AI 动画",
    "ai-storyboard": "图片切分",
    "ai-director": "导演台",
    upload: "上传",
    video: "视频",
    "ai-video": "AI 视频",
    "source-image": "图片源",
    "source-video": "视频源",
    audio: "音频",
    "ai-audio": "AI 音频",
    "source-audio": "音频源",
    group: "节点分组",
    "ai-panorama": "全景预览",
  })[type];
  const body = type === "ai-shotlist"
    ? renderCanvasShotlistNodeBody(node)
    : type === "ai-animation"
    ? renderCanvasAnimationNodeBody(node)
    : type === "ai-storyboard"
      ? frameAnalysis ? renderCanvasFrameAnalysisNodeBody(node) : renderCanvasStoryboardNodeBody(node)
      : type === "ai-director"
        ? renderCanvasDirectorNodeBody(node)
        : type === "group"
          ? renderCanvasGroupNodeBody(node)
          : type === "upload"
            ? renderCanvasSourceMediaNodeBody(node, resolveCanvasUploadMediaKind(node), { mixed: true })
            : type === "source-image"
              ? renderCanvasSourceMediaNodeBody(node, "image", { storyboardCut })
              : ["video", "ai-video", "source-video", "audio", "ai-audio", "source-audio"].includes(type)
                ? ["source-video", "source-audio"].includes(type)
                  ? renderCanvasSourceMediaNodeBody(node, type === "source-video" ? "video" : "audio")
                  : renderCanvasMediaNodeBody(node)
                : renderCanvasPanoramaNodeBody(node);
  const badge = frameAnalysis ? "ANALYSIS" : ({
    "ai-animation": "SPRITE",
    "ai-storyboard": "STORYBOARD",
    "ai-shotlist": "SHOTLIST",
    "ai-director": "DIRECTOR",
    upload: "UPLOAD",
    video: "VIDEO",
    "ai-video": "VIDEO",
    "source-image": storyboardCut ? "CUT" : "IMAGE",
    "source-video": "VIDEO",
    audio: "AUDIO",
    "ai-audio": "AUDIO",
    "source-audio": "AUDIO",
    group: "GROUP",
  })[type] ?? "360 VIEW";
  if (type === "group") {
    return `<article class="canvas-x6-special-node is-group" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">${body}</article>`;
  }
  const badgeMarkup = storyboardCut
    ? `<span class="canvas-storyboard-cut-header-actions"><small>${badge}</small><button class="canvas-storyboard-return-action" type="button" data-action="return-canvas-storyboard-image" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}" aria-label="放回原分镜" data-tooltip="放回原分镜"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 14-5-5 5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button></span>`
    : `<small>${badge}</small>`;
  return `<article class="canvas-x6-special-node is-${type}${frameAnalysis ? " is-frame-analysis" : ""}${storyboardCut ? " is-storyboard-cut" : ""}" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">
    <header><strong>${escapeCanvasX6Html(title)}</strong>${badgeMarkup}</header>
    ${body}
  </article>`;
}

function resolveCanvasUploadMediaKind(node = {}) {
  const mediaKind = String(node?.data?.mediaKind ?? "").toLowerCase();
  const mimeType = String(node?.data?.mimeType ?? "").toLowerCase();
  if (mediaKind === "video" || mimeType.startsWith("video/")) return "video";
  if (mediaKind === "audio" || mimeType.startsWith("audio/")) return "audio";
  return "image";
}

function resolveCanvasImageFallbackUrl(node = {}, mediaUrl = "", mediaKind = "image") {
  if (mediaKind !== "image" || !/(?:[?&])thumbnail=1(?:&|$)/u.test(String(mediaUrl ?? ""))) return "";
  const fallback = resolveCanvasMediaNodeSource(node, mediaKind);
  return fallback && fallback !== mediaUrl ? fallback : "";
}

function renderCanvasSourceMediaNodeBody(node = {}, mediaKind = "image", options = {}) {
  const nodeId = String(node?.id ?? "");
  const data = node?.data ?? {};
  const mediaUrl = resolveCanvasMediaNodeSource(node, mediaKind, {
    thumbnail: mediaKind === "image",
  });
  const imageFallbackUrl = resolveCanvasImageFallbackUrl(node, mediaUrl, mediaKind);
  const directMediaUrl = resolveCanvasMediaUrl(resolveCanvasMediaDirectUrl(node, mediaKind), mediaKind);
  const mediaLabel = mediaKind === "video" ? "视频" : mediaKind === "audio" ? "音频" : "图片";
  const mixedUpload = options.mixed === true;
  const storyboardCut = options.storyboardCut === true;
  const accept = mixedUpload ? "image/*,video/*,audio/*" : `${mediaKind}/*`;
  const emptyUploadLabel = mixedUpload ? "上传图片、视频或音频" : `上传${mediaLabel}素材`;
  const changeUploadLabel = mixedUpload ? "更换素材" : `更换${mediaLabel}素材`;
  const actionLabel = mediaUrl ? changeUploadLabel : emptyUploadLabel;
  const status = String(data.status ?? "empty").toLowerCase();
  const uploading = status === "uploading";
  const generationTaskId = String(data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? "").trim();
  const generationFailed = ["failed", "canceled", "cancelled", "manual_review_required", "result_unknown"].includes(status);
  const generationCompleted = ["completed", "succeeded", "success", "ready"].includes(status) && Boolean(mediaUrl);
  const agentGenerating = data.source === "canvas_agent"
    && !generationFailed
    && !generationCompleted
    && (generationTaskId.length > 0 || ["queued", "running", "processing"].includes(status));
  const mediaDerivationGenerating = data.source === "canvas_derivation"
    && ["queued", "running", "processing"].includes(status);
  const generating = agentGenerating || mediaDerivationGenerating;
  const emptyUploadAttrs = mediaUrl || uploading || generating
    ? ""
    : ` data-action="pick-canvas-upload-file" data-node-id="${escapeCanvasX6Html(nodeId)}" role="button" tabindex="0"`;
  const uploadingMask = uploading
    ? `<div class="canvas-x6-source-uploading-mask" role="status" aria-live="polite"><span class="canvas-x6-source-uploading-spinner" aria-hidden="true"></span><strong>${mediaKind === "video" ? "视频正在上传中" : "素材正在上传中"}</strong><small>请稍候</small></div>`
    : "";
  const generationLabel = mediaDerivationGenerating && mediaKind === "image" ? "图片生成中" : `${mediaLabel}正在生成中`;
  const generationMask = generating
    ? `<div class="canvas-x6-source-generation-mask canvas-image-generation-mask" role="status" aria-live="polite" aria-label="${generationLabel}"><span class="canvas-animation-spinner" aria-hidden="true"></span><strong>${generationLabel}</strong><small>请稍候</small></div>`
    : "";
  const preview = mediaUrl
    ? mediaKind === "video"
      ? mixedUpload
        ? `<button class="canvas-x6-video-preview-trigger" type="button" data-action="toggle-canvas-video-fullscreen" data-node-id="${escapeCanvasX6Html(nodeId)}" aria-label="放大查看视频" title="放大查看视频"><video src="${escapeCanvasX6Html(mediaUrl)}"${directMediaUrl && directMediaUrl !== mediaUrl ? ` data-canvas-video-fallback-src="${escapeCanvasX6Html(directMediaUrl)}"` : ""} muted playsinline preload="metadata"></video></button>${uploadingMask}${generationMask}`
        : `<video src="${escapeCanvasX6Html(mediaUrl)}"${directMediaUrl && directMediaUrl !== mediaUrl ? ` data-canvas-video-fallback-src="${escapeCanvasX6Html(directMediaUrl)}"` : ""} muted playsinline controls></video>${uploadingMask}${generationMask}`
      : mediaKind === "audio"
        ? `<audio src="${escapeCanvasX6Html(mediaUrl)}" controls></audio>${uploadingMask}${generationMask}`
        : `<button class="canvas-x6-image-preview-trigger" type="button" data-action="toggle-canvas-image-fullscreen" data-canvas-image-preview-trigger data-node-id="${escapeCanvasX6Html(nodeId)}" aria-label="放大查看图片" title="放大查看图片"><img src="${escapeCanvasX6Html(mediaUrl)}"${imageFallbackUrl ? ` data-canvas-image-fallback-src="${escapeCanvasX6Html(imageFallbackUrl)}"` : ""} alt="" loading="lazy" decoding="async" fetchpriority="low"${storyboardCut ? ' draggable="false"' : ""} /></button>${uploadingMask}${generationMask}`
    : `${uploadingMask}${generationMask}<strong>${generating ? generationLabel : emptyUploadLabel}</strong><small>${generating ? "请稍候" : `点击选择${mixedUpload ? "素材" : mediaLabel}文件`}</small>`;
  return `<section class="canvas-x6-source-media-body is-${mediaKind}${mixedUpload ? " is-upload" : ""}${storyboardCut ? " is-storyboard-cut" : ""}${uploading ? " is-uploading" : ""}${generating ? " is-generating" : ""}" aria-label="${storyboardCut ? "分镜剪切图片" : mixedUpload ? "上传资源" : `${mediaLabel}源上传`}"${uploading || generating ? " aria-busy=\"true\"" : ""}>
    <div class="canvas-x6-source-media-preview"${emptyUploadAttrs}>${preview}</div>
    <button class="canvas-x6-source-upload-action" type="button" data-action="pick-canvas-upload-file" data-node-id="${escapeCanvasX6Html(nodeId)}" aria-label="${actionLabel}" title="${actionLabel}"${uploading || agentGenerating ? " disabled aria-disabled=\"true\"" : ""}>${actionLabel}</button>
    <input type="file" accept="${accept}" data-canvas-upload-input data-node-id="${escapeCanvasX6Html(nodeId)}" tabindex="-1" aria-hidden="true" hidden />
  </section>`;
}

function renderCanvasGenericX6Node(node = {}) {
  const data = node?.data ?? {};
  const type = String(node?.type ?? "");
  if (["send", "ai-image"].includes(type)) {
    return renderCanvasImageGenerationX6Node(node);
  }
  if (type === "script") {
    return renderCanvasScriptWorkflowX6Node(node);
  }
  const title = String(data.title ?? data.name ?? canvasGenericNodeLabel(type) ?? "节点");
  const status = String(data.status ?? "idle");
  const normalizedStatus = status.trim().toLowerCase();
  const sourceTextNode = type === "source-text";
  const sourceTextValue = sourceTextNode
    ? String(data.text ?? "")
    : "";
  const sourceText = sourceTextValue.trim();
  const summary = String(
    sourceText || (
      data.summary
        ?? data.prompt
        ?? data.text
        ?? data.description
        ?? "选择节点后配置内容"
    ),
  ).trim();
  const inputCount = Array.isArray(data.ports?.inputs) ? data.ports.inputs.length : 0;
  const outputCount = Array.isArray(data.ports?.outputs) ? data.ports.outputs.length : 0;
  const markdownNode = ["markdown", "ai-markdown"].includes(type);
  const scriptSourceNode = sourceTextNode && data.source === "project_script";
  const sourceTextActions = sourceTextNode
    ? `<div class="canvas-x6-source-text-actions" role="group" aria-label="${scriptSourceNode ? "剧本源操作" : "文本源操作"}">
        ${scriptSourceNode ? `<button type="button" data-action="open-canvas-script-picker" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">选择剧本</button>` : ""}
        <button type="button" data-action="duplicate-canvas-node" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">复制</button>
        <button class="danger" type="button" data-action="delete-canvas-node" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">删除</button>
      </div>`
    : "";
  const markdownText = markdownNode ? String(data.text ?? summary ?? "") : "";
  const markdownMode = data.markdownViewMode === "preview" ? "preview" : "edit";
  const sourceTextContent = type === "source-text"
    ? `<textarea class="canvas-x6-source-text-input" data-canvas-text-input data-canvas-source-text-input data-node-id="${escapeCanvasX6Html(node?.id ?? "")}" aria-label="文本内容" placeholder="请输入文本">${escapeCanvasX6Html(sourceTextValue)}</textarea>`
    : markdownNode
      ? renderCanvasMarkdownX6Content(node, markdownText, markdownMode)
      : `<p${sourceTextNode ? ' class="canvas-x6-source-text-output" data-canvas-text-output data-canvas-source-text-output tabindex="0"' : ""}>${escapeCanvasX6Html(summary || "选择节点后配置内容")}</p>`;
  const genericNodeTypeLabel = sourceTextNode
    ? ""
    : `<span>${escapeCanvasX6Html(canvasGenericNodeLabel(type))}</span>`;
  const realtimeText = ["ai-text", "ai-markdown"].includes(type)
    && ["running", "processing"].includes(normalizedStatus);
  const generationState = realtimeText ? "" : renderCanvasX6GenerationState(node, normalizedStatus);
  const textGenerationMask = realtimeText
    ? `<div class="canvas-x6-text-generation-mask" role="status" aria-live="polite" aria-label="正在生成剧本中"><span class="canvas-animation-spinner" aria-hidden="true"></span><strong>正在生成剧本中</strong></div>`
    : "";
  const statusLabel = isCanvasX6GenerationNode(type)
    ? canvasX6GenerationStatusLabel(normalizedStatus, status)
    : status;
  return `<article class="canvas-x6-special-node is-generic is-${escapeCanvasX6Html(type || "node")}${scriptSourceNode ? " is-script-source" : ""}" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">
    <header><strong>${escapeCanvasX6Html(title)}</strong><small>${escapeCanvasX6Html(statusLabel)}</small></header>
    <div class="canvas-x6-generic-body${generationState ? " has-generation-state" : ""}${textGenerationMask ? " has-generation-mask" : ""}">
      ${genericNodeTypeLabel}
      ${markdownNode ? renderCanvasMarkdownX6Toolbar(node) : ""}
      ${sourceTextContent}
      ${sourceTextActions}
      ${generationState}
      ${textGenerationMask}
    </div>
    <footer><span>${inputCount} 个输入</span><span>${outputCount} 个输出</span></footer>
  </article>`;
}

function renderCanvasMarkdownX6Toolbar(node = {}) {
  const nodeId = escapeCanvasX6Html(node?.id ?? "");
  const text = String(node?.data?.text ?? "");
  const mode = node?.data?.markdownViewMode === "preview" ? "preview" : "edit";
  return `<div class="canvas-markdown-toolbar" role="toolbar" aria-label="Markdown 工具栏">
    <div class="canvas-markdown-parity-tools">
      <span class="canvas-markdown-mode" role="group" aria-label="Markdown 视图">
        <button type="button" class="${mode === "edit" ? "active" : ""}" data-action="set-canvas-markdown-mode" data-node-id="${nodeId}" data-mode="edit" aria-pressed="${mode === "edit"}">编辑</button>
        <button type="button" class="${mode === "preview" ? "active" : ""}" data-action="set-canvas-markdown-mode" data-node-id="${nodeId}" data-mode="preview" aria-pressed="${mode === "preview"}">预览</button>
      </span>
      <button type="button" data-action="copy-canvas-markdown-text" data-node-id="${nodeId}" aria-label="复制文本" title="复制文本">复制</button>
      <button type="button" data-action="toggle-canvas-markdown-fullscreen" data-node-id="${nodeId}" aria-label="全屏编辑" title="全屏编辑">全屏</button>
      <output class="canvas-markdown-text-stats" data-canvas-markdown-text-stats aria-label="Markdown 字数统计">${escapeCanvasX6Html(formatCanvasMarkdownX6Stats(text))}</output>
    </div>
    <span class="canvas-markdown-file-actions">
      <button type="button" data-action="pick-canvas-markdown-file" data-node-id="${nodeId}">导入</button>
      <button type="button" data-action="export-canvas-markdown" data-node-id="${nodeId}">导出</button>
    </span>
    <input type="file" accept=".md,.markdown,text/markdown,text/plain" data-canvas-markdown-input data-node-id="${nodeId}" tabindex="-1" aria-hidden="true" hidden />
  </div>`;
}

function renderCanvasMarkdownX6Content(node = {}, text = "", mode = "edit") {
  const nodeId = escapeCanvasX6Html(node?.id ?? "");
  if (mode === "preview") {
    return `<div class="canvas-markdown-preview" data-canvas-text-output tabindex="0" aria-label="Markdown 预览">${renderCanvasMarkdownX6Preview(text)}</div>`;
  }
  const html = sanitizeCanvasX6RichTextHtml(node?.data?.textHtml, text);
  return `<div class="canvas-text-format-toolbar" aria-label="文本格式工具条">
      ${[["clear-format", "clear-format"], ["heading-1", "H1"], ["heading-2", "H2"], ["heading-3", "H3"], ["paragraph", "paragraph"], ["bold", "B"], ["italic", "italic"], ["bullet", "list"], ["numbered", "ordered-list"], ["divider", "divider"]].map(([command, label]) => `<button type="button" data-action="format-canvas-text-node" data-node-id="${nodeId}" data-format-command="${command}" aria-label="${label}">${label}</button>`).join("")}
    </div>
    <div class="canvas-inline-richtext canvas-x6-text-output" role="textbox" contenteditable="true" aria-label="Markdown 内容" data-canvas-text-input data-canvas-text-output data-node-id="${nodeId}" data-placeholder="输入内容..." aria-live="polite" aria-atomic="false">${html}</div>`;
}

function sanitizeCanvasX6RichTextHtml(value, fallbackText = "") {
  const source = String(value ?? "").trim();
  if (!source) return escapeCanvasX6Html(fallbackText).replace(/\n/g, "<br>");
  return source
    .replace(/<\/?(?:script|style|iframe|object|embed|form|math|svg)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function formatCanvasMarkdownX6Stats(value) {
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  const words = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  return `${words.length.toLocaleString("zh-CN")} 字词 · ${Array.from(text).length.toLocaleString("zh-CN")} 字符`;
}

function renderCanvasMarkdownX6Preview(rawText = "") {
  const lines = String(rawText ?? "").replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [];
  let listType = "";
  let codeLines = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${renderCanvasMarkdownX6Inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = "";
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (codeLines !== null) {
      if (/^```/.test(trimmed)) {
        output.push(`<pre><code>${escapeCanvasX6Html(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else codeLines.push(line);
      continue;
    }
    if (/^```/.test(trimmed)) {
      flushParagraph();
      closeList();
      codeLines = [];
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      output.push(`<h${heading[1].length}>${renderCanvasMarkdownX6Inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextListType = unordered ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        output.push(`<${nextListType}>`);
        listType = nextListType;
      }
      output.push(`<li>${renderCanvasMarkdownX6Inline((unordered ?? ordered)[1])}</li>`);
      continue;
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${renderCanvasMarkdownX6Inline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^(---+|___+|\*\s*\*\s*\*)$/.test(trimmed)) {
      flushParagraph();
      closeList();
      output.push("<hr>");
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  closeList();
  if (codeLines !== null) output.push(`<pre><code>${escapeCanvasX6Html(codeLines.join("\n"))}</code></pre>`);
  return output.join("") || `<p class="canvas-markdown-fullscreen-empty">暂无内容</p>`;
}

function renderCanvasMarkdownX6Inline(value) {
  return escapeCanvasX6Html(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function renderCanvasScriptWorkflowX6Node(node = {}) {
  const data = node?.data ?? {};
  const nodeId = String(node?.id ?? "");
  const workflowNodes = Array.isArray(data.workflowNodes) ? data.workflowNodes : [];
  const hasImportedText = data.__canvasHasTextInput === true;
  const hasStoryboard = workflowNodes.some((item) => String(item?.kind ?? item) === "storyboard");
  const count = (kind) => workflowNodes.filter((item) => String(item?.kind ?? item) === kind).length;
  if (!hasImportedText) {
    return `<article class="canvas-x6-special-node is-generic is-script-workflow is-script-workflow-empty" data-node-id="${escapeCanvasX6Html(nodeId)}">
      <header><strong>脚本分镜</strong><small>未接入文本</small></header>
      <div class="canvas-script-workflow-body">
        <p class="canvas-script-workflow-input-hint">请连接剧本或文本节点。连接后可转换为角色、场景、道具和分镜。</p>
        <div class="canvas-script-workflow-empty-copy">
          <span class="canvas-script-workflow-state-mark">01</span>
          <div><strong>先接入一段文本</strong><span>连接文本源或剧本节点，开始拆解镜头。</span></div>
        </div>
        <div class="canvas-script-workflow-connect-hint" role="status"><span>等待剧本或文本连接</span><b aria-hidden="true">←</b></div>
      </div>
      <footer><span><i class="canvas-script-workflow-dot"></i>等待输入</span><span>0 个分镜</span></footer>
    </article>`;
  }
  if (String(data.workflowStatus ?? "").trim().toLowerCase() === "running") {
    const phase = String(data.workflowStage ?? "storyboard").trim().toLowerCase();
    const phaseLabel = canvasScriptWorkflowPhaseLabel(phase);
    const phaseOrder = ["scene", "character", "prop", "storyboard"];
    const phaseIndex = phaseOrder.indexOf(phase);
    return `<article class="canvas-x6-special-node is-generic is-script-workflow is-script-workflow-generating" data-node-id="${escapeCanvasX6Html(nodeId)}">
      <header><strong>脚本分镜</strong><small>生成中</small></header>
      <div class="canvas-script-workflow-body canvas-script-workflow-generating-body" role="status" aria-live="polite">
        <div class="canvas-script-workflow-generating-copy"><span class="canvas-animation-spinner" aria-hidden="true"></span><div><strong>${escapeCanvasX6Html(phaseLabel)}</strong><span>正在根据已连接文本拆解并生成工作流节点</span></div></div>
        <div class="canvas-script-workflow-progress" aria-label="分镜生成进度">
          ${phaseOrder.map((item, index) => `<span class="${index <= phaseIndex ? "is-active" : ""}"><i>${String(index + 1).padStart(2, "0")}</i>${escapeCanvasX6Html(canvasScriptWorkflowPhaseShortLabel(item))}</span>`).join("")}
        </div>
        <button class="canvas-script-workflow-open is-live" type="button" data-action="open-canvas-script-workspace" data-node-id="${escapeCanvasX6Html(nodeId)}">查看实时提示词</button>
      </div>
      <footer><span><i class="canvas-script-workflow-dot is-live"></i>处理中</span><span>请稍候</span></footer>
    </article>`;
  }
  if (!hasStoryboard) {
    return `<article class="canvas-x6-special-node is-generic is-script-workflow is-script-workflow-confirm" data-node-id="${escapeCanvasX6Html(nodeId)}">
      <header><strong>脚本分镜</strong><small>文本已接入</small></header>
      <div class="canvas-script-workflow-body canvas-script-workflow-actions">
        <p class="canvas-script-workflow-input-hint">已检测到剧本内容，可以开始生成分镜。</p>
        <div class="canvas-script-workflow-confirm-copy"><span class="canvas-script-workflow-status-tag">TEXT INPUT</span><strong>准备开始生成分镜</strong><span>下一步将选择技能并生成角色、场景、道具和镜头。</span></div>
        <div class="canvas-script-workflow-confirm" aria-hidden="true">开始</div>
      </div>
      <footer><span><i class="canvas-script-workflow-dot is-live"></i>已接入文本</span><span>等待开始</span></footer>
    </article>`;
  }
  return `<article class="canvas-x6-special-node is-generic is-script-workflow" data-node-id="${escapeCanvasX6Html(nodeId)}">
    <header><strong>脚本分镜</strong><small>分镜已生成</small></header>
    <div class="canvas-script-workflow-body">
      <p class="canvas-script-workflow-input-hint">连接剧本或小说文本节点后，转换为角色、场景、道具和分镜。</p>
      <div class="canvas-script-workflow-steps" aria-label="剧本制作链路">
        <span class="is-ready"><b aria-hidden="true">01</b><strong>确认镜头</strong><small>已完成</small></span><i></i><span class="is-ready"><b aria-hidden="true">02</b><strong>准备资产</strong><small>${count("character") + count("scene") + count("prop")} 项资产</small></span><i></i><span class="is-ready"><b aria-hidden="true">03</b><strong>合成提示词</strong><small>${count("storyboard")} 条分镜</small></span>
      </div>
      <div class="canvas-script-workflow-actions" role="group" aria-label="脚本分镜操作">
        <button class="canvas-script-workflow-open" type="button" data-action="open-canvas-script-workspace" data-node-id="${escapeCanvasX6Html(nodeId)}">打开脚本节点</button>
        <button class="canvas-script-workflow-download" type="button" data-action="download-canvas-selection" data-node-id="${escapeCanvasX6Html(nodeId)}" data-node-ids="${escapeCanvasX6Html(JSON.stringify(workflowNodes.filter((item) => String(item?.kind ?? item) === "storyboard").map((item) => String(item?.id ?? "")).filter(Boolean)))}"${count("storyboard") ? "" : " disabled aria-disabled=\"true\""}>下载分镜视频</button>
      </div>
    </div>
      <footer><span><i class="canvas-script-workflow-dot is-live"></i>工作流已就绪</span><span>${count("character")} 角色 · ${count("scene")} 场景 · ${count("prop")} 道具 · ${count("storyboard")} 分镜</span></footer>
  </article>`;
}

function canvasScriptWorkflowPhaseLabel(phase) {
  return ({ storyboard: "正在分镜中", character: "正在生成角色中", scene: "正在生成场景中", prop: "正在生成道具中" })[phase] ?? "正在生成分镜中";
}

function canvasScriptWorkflowPhaseShortLabel(phase) {
  return ({ storyboard: "分镜", character: "角色", scene: "场景", prop: "道具" })[phase] ?? "处理中";
}
function renderCanvasImageGenerationX6Node(node = {}) {
  const data = node?.data ?? {};
  const type = String(node?.type ?? "");
  const status = String(data.status ?? "idle").trim().toLowerCase();
  const imageUrl = resolveCanvasMediaNodeSource(node, "image", { thumbnail: true });
  const imageFallbackUrl = /(?:[?&])thumbnail=1(?:&|$)/u.test(String(imageUrl ?? ""))
    ? resolveCanvasMediaNodeSource(node, "image")
    : "";
  const failed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status);
  const taskId = String(data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? "").trim();
  const preparing = !failed && (
    ["queued", "running", "processing"].includes(status)
    || (!imageUrl && Boolean(taskId || ["completed", "succeeded"].includes(status)))
  );
  const title = String(data.title ?? data.name ?? "AI 图片");
  const inputCount = Array.isArray(data.ports?.inputs) ? data.ports.inputs.length : 0;
  const outputCount = Array.isArray(data.ports?.outputs) ? data.ports.outputs.length : 0;
  const body = preparing
    ? `<div class="canvas-video-empty canvas-image-empty is-loading canvas-image-generation-mask" role="status" aria-label="正在生成图片"><span class="canvas-animation-spinner" aria-hidden="true"></span><strong>正在生成图片</strong></div>`
    : imageUrl
      ? `<div class="canvas-video-preview canvas-image-preview"><button class="canvas-x6-image-preview-trigger" type="button" data-action="toggle-canvas-image-fullscreen" data-canvas-image-preview-trigger data-node-id="${escapeCanvasX6Html(node?.id ?? "")}" aria-label="放大查看生成图片" title="放大查看图片"><img src="${escapeCanvasX6Html(imageUrl)}"${imageFallbackUrl ? ` data-canvas-image-fallback-src="${escapeCanvasX6Html(imageFallbackUrl)}"` : ""} alt="图片生成结果" loading="lazy" decoding="async" fetchpriority="low" /></button></div>`
      : failed
      ? renderCanvasX6GenerationState(node, status)
      : `<div class="canvas-video-empty canvas-image-empty" role="status"><strong>暂无图片</strong></div>`;
  return `<article class="canvas-x6-special-node is-generic is-${escapeCanvasX6Html(type)}" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">
    <header><strong>${escapeCanvasX6Html(title)}</strong><small>${escapeCanvasX6Html(canvasX6GenerationStatusLabel(status, status))}</small></header>
    <section class="canvas-video-node-body canvas-image-node-body" aria-label="图片生成结果">${body}</section>
    <footer><span>${inputCount} 个输入</span><span>${outputCount} 个输出</span></footer>
  </article>`;
}

function renderCanvasX6GenerationState(node = {}, status = "") {
  const type = String(node?.type ?? "");
  if (!isCanvasX6GenerationNode(type)) return "";
  const data = node?.data ?? {};
  const failed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status);
  if (failed) {
    const reviewRequired = ["manual_review_required", "result_unknown"].includes(status);
    const message = String(
      data.failureMessage
        ?? data.failure?.displayMessage
        ?? data.failure?.providerMessage
        ?? data.failure?.errorMessage
        ?? "生成任务失败，请重新生成。",
    ).trim();
    const title = reviewRequired
      ? "生成结果待复核"
      : type === "ai-image" || type === "send"
        ? "生图失败"
        : "生成失败";
    return `<section class="canvas-x6-generation-state is-failure" role="alert">
      <strong>${title}</strong>
      <p>${escapeCanvasX6Html(message)}</p>
    </section>`;
  }
  if (!["queued", "running", "processing"].includes(status)) return "";

  const stage = String(data.generationStage ?? data.progressStage ?? data.progress_stage ?? data.stage ?? "").trim();
  const percent = resolveCanvasX6GenerationProgress(data, status, stage);
  const progressLabel = canvasX6GenerationProgressLabel(percent);
  const stageLabel = canvasX6GenerationStageLabel(stage, percent);
  const taskId = String(data.lastTaskId ?? data.taskId ?? data.generationTaskId ?? data.platform?.tasks?.[0]?.taskId ?? "").trim();
  const shortTaskId = taskId.length > 14 ? `${taskId.slice(0, 8)}...${taskId.slice(-4)}` : taskId;
  return `<section class="canvas-x6-generation-state is-progress" role="status" aria-label="生成进度 ${percent}%">
    <div class="canvas-x6-generation-progress-head">
      <span>${progressLabel.kicker}</span>
      <strong>${progressLabel.label} ${percent}%</strong>
    </div>
    <small class="canvas-x6-generation-stage">${escapeCanvasX6Html(stageLabel)}</small>
    ${shortTaskId ? `<small class="canvas-x6-generation-task" title="${escapeCanvasX6Html(taskId)}">任务号 ${escapeCanvasX6Html(shortTaskId)}</small>` : ""}
    <span class="canvas-x6-generation-track" aria-hidden="true"><i style="width:${percent}%"></i></span>
  </section>`;
}

function isCanvasX6GenerationNode(type) {
  return ["send", "source-image", "upload", "ai-text", "ai-image", "ai-video", "ai-audio", "ai-animation", "ai-panorama", "ai-markdown", "ai-storyboard", "ai-shotlist"].includes(String(type ?? ""));
}

function canvasX6GenerationStatusLabel(status, fallback) {
  if (status === "queued") return "排队中";
  if (["running", "processing"].includes(status)) return "生成中";
  if (status === "succeeded") return "已完成";
  if (status === "canceled") return "已取消";
  if (["manual_review_required", "result_unknown"].includes(status)) return "待复核";
  if (status === "failed") return "失败";
  return fallback;
}

function resolveCanvasX6GenerationProgress(data, status, stage) {
  const stageProgress = canvasX6GenerationStageProgress(stage);
  if (stageProgress !== null) return stageProgress;
  const value = Number(data.generationProgress ?? data.progress);
  if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  return status === "queued" ? 25 : 50;
}

function canvasX6GenerationStageProgress(stage) {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (["queued", "submitted", "created", "task_created", "queue_unavailable", "queue_stalled", "queued_unprocessed"].includes(normalized)) return 25;
  if (["provider_submitted", "provider_accepted", "accepted", "provider_rendering", "provider_running", "rendering", "running", "processing", "text_generating"].includes(normalized)) return 50;
  if (["provider_succeeded", "provider_completed", "artifact_persisting", "saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return 75;
  if (["completed", "succeeded"].includes(normalized)) return 100;
  return null;
}

function canvasX6GenerationProgressLabel(percent) {
  if (percent >= 75) return { kicker: "结果已返回", label: "云存储处理中" };
  if (percent >= 50) return { kicker: "任务已发送", label: "生成中" };
  return { kicker: "任务排队中", label: "排队中" };
}

function canvasX6GenerationStageLabel(stage, percent) {
  const normalized = String(stage ?? "").trim().toLowerCase();
  if (["queue_unavailable", "queue_stalled", "queued_unprocessed"].includes(normalized)) return "生成队列未处理，请检查 Redis、outbox 和 worker";
  if (["queued", "submitted", "created", "task_created"].includes(normalized)) return "任务已入库，等待队列投递到模型";
  if (["provider_submitted", "provider_accepted", "accepted"].includes(normalized)) return "模型已接收，正在排队";
  if (normalized === "text_generating") return "文本模型正在生成内容";
  if (["provider_rendering", "provider_running", "rendering", "running", "processing"].includes(normalized)) return "模型正在生成画面";
  if (["provider_succeeded", "provider_completed", "artifact_persisting"].includes(normalized)) return "模型结果已返回，正在上传云存储";
  if (["saving_asset", "persisting_asset", "uploading_asset"].includes(normalized)) return "正在上传结果到云存储";
  if (["completed", "succeeded"].includes(normalized) || percent >= 100) return "生成完成，正在刷新画布";
  return percent <= 25 ? "任务排队中，等待发送到模型" : "正在同步生成状态";
}

function canvasGenericNodeLabel(type) {
  return ({
    "ai-text": "AI 文本", "ai-image": "AI 图片", "ai-audio": "AI 音频", "ai-markdown": "AI Markdown",
    "source-text": "文本源", "source-image": "图片源", upload: "上传", text: "文本", image: "图片结果",
    markdown: "Markdown", comment: "评论", "canvas-note": "画布笔记", script: "脚本节点", send: "生成节点", shape: "形状",
  })[String(type ?? "")] ?? "画布节点";
}

function escapeCanvasX6Html(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
export function refreshCanvasWorkflowGraph(workbench) {
  const graph = workbench?.canvasGraph;
  const document = workbench?.ui?.canvasDocument;
  if (!graph || !document) {
    return false;
  }
  const contextMenu = workbench?.ui?.canvasContextMenu;
  settleCanvasGraphBlankConnectionDraft(graph, {
    document,
    draftEdgeId: contextMenu?.mode === "connection" ? String(contextMenu.draftEdgeId ?? "") : null,
  });
  if (graph.__comicAiCanvasDocument === document) {
    applyCanvasGraphInteractionMode(graph, document.viewport);
    applyCanvasGraphEdgeStyle(graph, workbench?.ui?.canvasEdgeStyle);
    applyCanvasGraphEdgeVisibility(graph, workbench?.ui?.canvasEdgesHidden !== true);
    applyCanvasGraphViewportPreferences(graph, document.viewport);
    selectCurrentCanvasNode(graph, workbench);
    refreshCanvasSelectionActionToolbar(graph, workbench);
    return true;
  }
  const previousNodes = new Map((graph.getNodes?.() ?? []).map((cell) => [
    String(cell?.id ?? ""),
    cell?.getData?.()?.canvasNode ?? null,
  ]));
  const transientEditor = graph.getCellById?.(CANVAS_EDITOR_OVERLAY_ID)?.getData?.() ?? null;
  const nextData = canvasDocumentToX6Data(document);
  applyCanvasGraphInteractionMode(graph, document.viewport);
  reconcileCanvasWorkflowGraph(graph, nextData);
  applyCanvasGraphInteractionMode(graph, document.viewport);
  applyInitialViewport(graph, document.viewport);
  graph.__comicAiCanvasDocument = document;
  if (
    transientEditor?.canvasTransientEditor === true
    && workbench?.ui?.canvasEditorOpen === true
    && String(workbench.ui.selectedCanvasNodeId ?? "") === String(transientEditor.parentNodeId ?? "")
  ) {
    mountCanvasGraphEditorOverlay(graph, transientEditor.parentNodeId, transientEditor.editorHtml);
  }
  applyCanvasGraphEdgeStyle(graph, workbench?.ui?.canvasEdgeStyle);
  applyCanvasGraphEdgeVisibility(graph, workbench?.ui?.canvasEdgesHidden !== true);
  applyCanvasGraphViewportPreferences(graph, document.viewport);
  applyCanvasGraphGrouping(graph, document);
  selectCurrentCanvasNode(graph, workbench);
  refreshCanvasSelectionActionToolbar(graph, workbench);
  for (const node of nextData.nodes) {
    const motion = classifyCanvasNodeMotion(previousNodes.get(String(node.id)), node?.data?.canvasNode);
    if (motion) applyCanvasNodeMotion(graph, node.id, motion);
  }
  return true;
}

export function reconcileCanvasWorkflowGraph(graph, nextData = {}) {
  if (!graph) return { added: 0, removed: 0, updated: 0 };
  const nextNodes = Array.isArray(nextData.nodes) ? nextData.nodes : [];
  const nextEdges = Array.isArray(nextData.edges) ? nextData.edges : [];
  const nextNodeIds = new Set(nextNodes.map((node) => String(node?.id ?? "")));
  const nextEdgeIds = new Set(nextEdges.map((edge) => String(edge?.id ?? "")));
  const stats = { added: 0, removed: 0, updated: 0 };
  const valuesMatch = (left, right) => {
    if (left === right) return true;
    try {
      return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    } catch {
      return false;
    }
  };
  const run = () => {
    for (const edge of graph.getEdges?.() ?? []) {
      if (!nextEdgeIds.has(String(edge?.id ?? ""))) {
        if (edge === graph.__comicAiCanvasPendingConnectionEdge && edge.__comicAiCanvasConnectionDraft === true) {
          continue;
        }
        graph.removeCell?.(edge);
        stats.removed += 1;
      }
    }
    for (const node of graph.getNodes?.() ?? []) {
      if (node?.getData?.()?.canvasTransientEditor === true || nextNodeIds.has(String(node?.id ?? ""))) continue;
      for (const child of node.getChildren?.() ?? []) node.unembed?.(child);
      graph.removeCell?.(node);
      stats.removed += 1;
    }
    for (const config of nextNodes) {
      let node = graph.getCellById?.(config.id);
      if (!node?.isNode?.()) {
        graph.addNode?.(config);
        stats.added += 1;
        continue;
      }
      const currentPosition = node.getPosition?.() ?? {};
      const currentSize = node.getSize?.() ?? {};
      if (Number(currentPosition.x) !== Number(config.x) || Number(currentPosition.y) !== Number(config.y)) {
        node.setPosition?.(Number(config.x), Number(config.y), { canvasRefresh: true });
      }
      if (Number(currentSize.width) !== Number(config.width) || Number(currentSize.height) !== Number(config.height)) {
        node.setSize?.(Number(config.width), Number(config.height), { canvasRefresh: true });
      }
      if (!valuesMatch(node.getData?.(), config.data)) node.setData?.(config.data, { overwrite: true });
      if (!valuesMatch(node.getAttrs?.(), config.attrs)) node.setAttrs?.(config.attrs, { overwrite: true });
      if (!valuesMatch(node.getProp?.("ports"), config.ports)) node.setProp?.("ports", config.ports);
      if (Number(node.getZIndex?.()) !== Number(config.zIndex)) node.setZIndex?.(Number(config.zIndex));
      stats.updated += 1;
    }
    for (const config of nextEdges) {
      const edge = graph.getCellById?.(config.id);
      if (!edge?.isEdge?.()) {
        const addedEdge = graph.addEdge?.(config) ?? graph.getCellById?.(config.id);
        if (addedEdge) {
          if (graph.__comicAiCanvasEdgeStyle) {
            applyCanvasEdgeStyle(graph, addedEdge, graph.__comicAiCanvasEdgeStyle);
          }
          if (typeof graph.__comicAiCanvasEdgesVisible === "boolean") {
            applyCanvasEdgeVisibility(addedEdge, graph.__comicAiCanvasEdgesVisible);
          }
        } else {
          graph.__comicAiCanvasEdgeStyle = undefined;
          graph.__comicAiCanvasEdgesVisible = undefined;
        }
        stats.added += 1;
        continue;
      }
      if (!valuesMatch(edge.getSource?.(), config.source)) edge.setSource?.(config.source);
      if (!valuesMatch(edge.getTarget?.(), config.target)) edge.setTarget?.(config.target);
      if (!valuesMatch(edge.getData?.(), config.data)) edge.setData?.(config.data, { overwrite: true });
      if (!valuesMatch(edge.getAttrs?.(), config.attrs)) edge.setAttrs?.(config.attrs, { overwrite: true });
      if (Number(edge.getZIndex?.()) !== Number(config.zIndex)) edge.setZIndex?.(Number(config.zIndex));
      stats.updated += 1;
    }
  };
  graph.__comicAiReconciling = true;
  try {
    if (typeof graph.batchUpdate === "function") graph.batchUpdate("canvas-refresh", run);
    else run();
  } finally {
    graph.__comicAiReconciling = false;
  }
  return stats;
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
  const previousNode = cell.getData()?.canvasNode ?? null;
  const nextNode = canvasDocumentToX6Data({
    nodes: [node],
    edges: Array.isArray(workbench.ui?.canvasDocument?.edges) ? workbench.ui.canvasDocument.edges : [],
  }).nodes[0];
  const nextCanvasNode = nextNode?.data?.canvasNode ?? structuredCloneSafe(node);
  if (node.type === "ai-storyboard" && workbench.ui?.canvasStoryboardPreparing?.[nodeId] === true) {
    nextCanvasNode.data = { ...(nextCanvasNode.data ?? {}), storyboardPreparing: true };
  }
  let nodeDataMatch = previousNode === nextCanvasNode;
  if (!nodeDataMatch) {
    try {
      nodeDataMatch = JSON.stringify(previousNode ?? null) === JSON.stringify(nextCanvasNode ?? null);
    } catch {
      nodeDataMatch = false;
    }
  }
  if (!nodeDataMatch) {
    cell.setData(
      {
        ...(cell.getData() ?? {}),
        canvasNode: nextCanvasNode,
      },
      options.silent
        ? { silent: true }
        : options.skipDocumentSync
          ? { canvasNodeRefresh: true }
          : undefined,
    );
  }
  if (!nextNode) {
    return false;
  }
  const currentPosition = cell.getPosition?.() ?? {};
  const currentSize = cell.getSize?.() ?? {};
  if (Number(currentPosition.x) !== Number(nextNode.x) || Number(currentPosition.y) !== Number(nextNode.y)) {
    cell.setPosition?.(Number(nextNode.x), Number(nextNode.y), { canvasRefresh: true });
  }
  if (Number(currentSize.width) !== Number(nextNode.width) || Number(currentSize.height) !== Number(nextNode.height)) {
    cell.setSize?.(Number(nextNode.width), Number(nextNode.height), { canvasRefresh: true });
  }
  if (nextNode?.attrs && typeof cell.setAttrs === "function") {
    let attrsMatch = false;
    try {
      attrsMatch = JSON.stringify(cell.getAttrs?.() ?? null) === JSON.stringify(nextNode.attrs);
    } catch {
      attrsMatch = false;
    }
    if (!attrsMatch) cell.setAttrs(nextNode.attrs, options.silent ? { silent: true } : undefined);
  }
  let portsMatch = cell.getProp?.("ports") === nextNode.ports;
  if (!portsMatch) {
    try {
      portsMatch = JSON.stringify(cell.getProp?.("ports") ?? null) === JSON.stringify(nextNode.ports ?? null);
    } catch {
      portsMatch = false;
    }
  }
  if (!portsMatch) cell.setProp?.("ports", nextNode.ports);
  if (Number(cell.getZIndex?.()) !== Number(nextNode.zIndex)) {
    cell.setZIndex?.(Number(nextNode.zIndex));
  }
  applyCanvasGraphGrouping(graph, workbench.ui.canvasDocument);
  const motion = classifyCanvasNodeMotion(previousNode, node);
  if (motion) applyCanvasNodeMotion(graph, nodeId, motion);
  return true;
}

export function classifyCanvasNodeMotion(previousNode, nextNode) {
  if (!nextNode) return null;
  if (!previousNode) return "entering";
  const previousStatus = String(previousNode?.data?.status ?? "").toLowerCase();
  const nextStatus = String(nextNode?.data?.status ?? "").toLowerCase();
  const pendingStatuses = new Set(["loading", "queued", "running", "submitting", "uploading"]);
  const successfulStatuses = new Set(["success", "succeeded", "completed", "ready"]);
  return pendingStatuses.has(previousStatus) && successfulStatuses.has(nextStatus) ? "completed" : null;
}

export function applyCanvasNodeMotion(graph, nodeId, motion, durationMs = 720) {
  if (!graph || !nodeId || !["entering", "completed", "exiting"].includes(motion)) return false;
  if (prefersReducedCanvasMotion()) return false;
  const cell = graph.getCellById?.(nodeId);
  const container = graph.findViewByCell?.(cell)?.container;
  if (!container?.classList) return false;
  const className = `canvas-node-${motion}`;
  container.classList.remove(className);
  void container.getBoundingClientRect?.();
  container.classList.add(className);
  globalThis.setTimeout?.(() => container.classList?.remove?.(className), Math.max(0, Number(durationMs) || 0));
  return true;
}

export async function playCanvasNodeExitMotion(graph, nodeIds = [], durationMs = 130) {
  if (prefersReducedCanvasMotion()) return;
  const animated = nodeIds
    .map((nodeId) => applyCanvasNodeMotion(graph, nodeId, "exiting", durationMs))
    .some(Boolean);
  if (!animated) return;
  await new Promise((resolve) => globalThis.setTimeout?.(resolve, durationMs));
}

function prefersReducedCanvasMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

export function applyCanvasGraphGrouping(graph, canvasDocument) {
  if (!graph?.getCellById) return false;
  const x6Nodes = expandX6GroupBounds(canvasDocumentToX6Data(canvasDocument).nodes);
  const expectedParentByChild = new Map(x6Nodes
    .filter((node) => node.parent)
    .map((node) => [String(node.id), String(node.parent)]));
  const options = { silent: true };

  for (const node of x6Nodes) {
    const cell = graph.getCellById(node.id);
    if (!cell) continue;
    const position = cell.getPosition?.() ?? {};
    if (Number(position.x) !== Number(node.x) || Number(position.y) !== Number(node.y)) {
      cell.setPosition?.(Number(node.x), Number(node.y), options);
    }
    const size = cell.getSize?.() ?? {};
    if (Number(size.width) !== Number(node.width) || Number(size.height) !== Number(node.height)) {
      cell.setSize?.(Number(node.width), Number(node.height), options);
    }
    const expectedParentId = expectedParentByChild.get(String(node.id)) ?? null;
    const currentParent = cell.getParent?.() ?? null;
    const currentParentId = String(currentParent?.id ?? cell.getParentId?.() ?? "") || null;
    if (currentParentId && currentParentId !== expectedParentId) {
      if (typeof currentParent?.unembed === "function") currentParent.unembed(cell, options);
      else cell.setParent?.(null, options);
    }
    if (!expectedParentId) continue;
    const parent = graph.getCellById(expectedParentId);
    if (!parent || parent === cell) continue;
    ensureCanvasGraphChildEmbedding(parent, cell, options);
    // Reapply the document's absolute position after embedding so layout
    // actions remain stable across graph refreshes.
    const embeddedPosition = cell.getPosition?.() ?? {};
    if (Number(embeddedPosition.x) !== Number(node.x) || Number(embeddedPosition.y) !== Number(node.y)) {
      cell.setPosition?.(Number(node.x), Number(node.y), options);
    }
  }
  resizeCanvasGraphGroupCells(graph, options);
  return true;
}

function ensureCanvasGraphChildEmbedding(parent, cell, options = {}) {
  const children = parent?.getChildren?.() ?? [];
  const seenIds = new Set();
  const uniqueChildren = children.filter((child) => {
    const childId = String(child?.id ?? "");
    if (!childId || seenIds.has(childId)) return false;
    seenIds.add(childId);
    return true;
  });
  if (uniqueChildren.length !== children.length) parent.setChildren?.(uniqueChildren, options);
  const cellId = String(cell?.id ?? "");
  if (!seenIds.has(cellId)) {
    parent?.addChild?.(cell, options);
  } else if (cell?.getParent?.() !== parent) {
    cell?.setParent?.(parent, options);
  }
}

function resizeCanvasGraphGroupCells(graph, options = {}) {
  for (const group of graph.getNodes?.() ?? []) {
    if (group?.getData?.()?.canvasNode?.type !== "group") continue;
    const children = group.getChildren?.() ?? [];
    if (!children.length) continue;
    const childBoxes = children.map((child) => {
      const bbox = child?.getBBox?.();
      if (bbox) return bbox;
      const position = child?.getPosition?.() ?? {};
      const size = child?.getSize?.() ?? {};
      return {
        x: Number(position.x ?? 0),
        y: Number(position.y ?? 0),
        width: Number(size.width ?? 0),
        height: Number(size.height ?? 0),
      };
    }).filter(Boolean);
    if (!childBoxes.length) continue;
    const groupPosition = group.getPosition?.() ?? {};
    const groupSize = group.getSize?.() ?? {};
    const left = Math.min(...childBoxes.map((box) => Number(box.x ?? 0) - 28));
    const top = Math.min(...childBoxes.map((box) => Number(box.y ?? 0) - 52));
    const right = Math.max(...childBoxes.map((box) => Number(box.x ?? 0) + Number(box.width ?? 0) + 28));
    const bottom = Math.max(...childBoxes.map((box) => Number(box.y ?? 0) + Number(box.height ?? 0) + 28));
    const nextWidth = Math.max(360, right - left);
    const nextHeight = Math.max(240, bottom - top);
    if (Number(groupPosition.x) !== left || Number(groupPosition.y) !== top) {
      group.setPosition?.(left, top, options);
    }
    if (Number(groupSize.width) !== nextWidth || Number(groupSize.height) !== nextHeight) {
      group.setSize?.(nextWidth, nextHeight, options);
    }
  }
}

function expandX6GroupBounds(nodes = []) {
  const nextNodes = nodes.map((node) => ({ ...node, data: node?.data ? { ...node.data } : node?.data }));
  const groups = new Map(nextNodes.filter((node) => node?.data?.canvasNode?.type === "group").map((node) => [String(node.id), node]));
  for (const [groupId, group] of groups) {
    const children = nextNodes.filter((node) => String(node.parent ?? "") === groupId);
    if (!children.length) continue;
    const left = Math.min(...children.map((node) => Number(node.x ?? 0) - 28));
    const top = Math.min(...children.map((node) => Number(node.y ?? 0) - 52));
    const right = Math.max(...children.map((node) => Number(node.x ?? 0) + Number(node.width ?? 0) + 28));
    const bottom = Math.max(...children.map((node) => Number(node.y ?? 0) + Number(node.height ?? 0) + 28));
    group.x = left;
    group.y = top;
    group.width = Math.max(360, right - left);
    group.height = Math.max(240, bottom - top);
  }
  return nextNodes;
}

export function detachCanvasGroupChildrenForRemoval(cells = []) {
  for (const cell of cells) {
    const canvasNode = cell?.getData?.()?.canvasNode;
    if (canvasNode?.type !== "group") continue;
    for (const child of [...(cell.getChildren?.() ?? [])]) {
      if (typeof cell.unembed === "function") cell.unembed(child, { silent: true });
      else child?.setParent?.(null, { silent: true });
    }
  }
}

export function resolveCanvasGraphInteractionOptions(viewport = {}) {
  const classicInteraction = viewport.interactionMode === "classic";
  const handInteraction = viewport.interactionMode === "hand";
  return {
    interacting: {
      nodeMovable: true,
    },
    panning: {
      enabled: true,
      eventTypes: handInteraction
        ? ["leftMouseDown"]
        : classicInteraction
        ? ["leftMouseDown", "mouseWheel"]
        : ["rightMouseDown", "mouseWheelDown"],
      modifiers: [],
    },
    mousewheel: {
      enabled: true,
      modifiers: classicInteraction ? ["ctrl"] : [],
      minScale: 0.1,
      maxScale: 8,
      zoomAtMousePosition: true,
    },
    selecting: {
      enabled: !handInteraction,
      multiple: true,
      rubberband: !handInteraction,
      eventTypes: ["leftMouseDown"],
      modifiers: classicInteraction ? ["shift"] : [],
      multipleSelectionModifiers: ["shift"],
      showNodeSelectionBox: true,
    },
  };
}

export function applyCanvasGraphInteractionMode(graph, viewport = {}) {
  if (!graph?.options) return false;
  graph.__comicAiCanvasInteractionMode = ["hand", "classic"].includes(viewport.interactionMode)
    ? viewport.interactionMode
    : "default";
  const interactionMode = graph.__comicAiCanvasInteractionMode;
  if (graph.__comicAiAppliedInteractionMode === interactionMode) return true;
  const interactions = resolveCanvasGraphInteractionOptions(viewport);
  graph.options.interacting = {
    ...(typeof graph.options.interacting === "object" ? graph.options.interacting : {}),
    ...interactions.interacting,
  };
  graph.options.panning = { ...(graph.options.panning ?? {}), ...interactions.panning };
  graph.options.mousewheel = { ...(graph.options.mousewheel ?? {}), ...interactions.mousewheel };
  graph.options.selecting = { ...(graph.options.selecting ?? {}), ...interactions.selecting };
  const selection = graph.getPlugin?.("selection");
  selection?.toggleEnabled?.(interactions.selecting.enabled);
  selection?.toggleRubberband?.(interactions.selecting.rubberband);
  if (!interactions.selecting.enabled) {
    selection?.clean?.();
    graph.unselectAll?.();
  }
  graph.setRubberbandModifiers?.(interactions.selecting.modifiers);
  graph.enablePanning?.();
  graph.enableMouseWheel?.();
  graph.__comicAiAppliedInteractionMode = interactionMode;
  return true;
}

function normalizeCanvasConnectionKind(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["text", "image", "video", "audio", "any"].includes(normalized) ? normalized : "";
}

function inferCanvasPortDirection(portId, group) {
  const normalizedGroup = String(group ?? "").trim().toLowerCase();
  if (["in", "input"].includes(normalizedGroup)) return "in";
  if (["out", "output"].includes(normalizedGroup)) return "out";
  const normalizedPortId = String(portId ?? "").trim().toLowerCase();
  if (normalizedPortId.startsWith("in_")) return "in";
  if (normalizedPortId.startsWith("out_")) return "out";
  return "";
}

function inferCanvasPortKind(portId) {
  const normalizedPortId = String(portId ?? "").trim().toLowerCase();
  return normalizeCanvasConnectionKind(normalizedPortId.replace(/^(?:in|out)_/, ""));
}

function resolveCanvasGraphConnectionPort(cell, portId, expectedDirection) {
  const normalizedPortId = String(portId ?? "").trim();
  if (!cell || !normalizedPortId) return null;
  const canvasNode = cell.getData?.()?.canvasNode;
  const inputs = Array.isArray(canvasNode?.data?.ports?.inputs) ? canvasNode.data.ports.inputs : [];
  const outputs = Array.isArray(canvasNode?.data?.ports?.outputs) ? canvasNode.data.ports.outputs : [];
  const expectedPorts = expectedDirection === "out" ? outputs : inputs;
  const oppositePorts = expectedDirection === "out" ? inputs : outputs;
  const documentPort = expectedPorts.find((port) => String(port?.id ?? "") === normalizedPortId);
  if (!documentPort && oppositePorts.some((port) => String(port?.id ?? "") === normalizedPortId)) return null;

  const x6Port = cell.getPort?.(normalizedPortId) ?? null;
  const direction = documentPort
    ? expectedDirection
    : inferCanvasPortDirection(normalizedPortId, x6Port?.group);
  if (direction !== expectedDirection) return null;
  const rawPort = documentPort ?? x6Port?.data ?? {};
  const kind = normalizeCanvasConnectionKind(rawPort.kind ?? inferCanvasPortKind(normalizedPortId));
  if (!kind) return null;
  const accepts = Array.isArray(rawPort.accepts)
    ? [...new Set(rawPort.accepts.map(normalizeCanvasConnectionKind).filter(Boolean))]
    : [];
  return {
    ...rawPort,
    id: normalizedPortId,
    direction,
    kind,
    ...(accepts.length ? { accepts } : {}),
  };
}

function createGraph(X6, mount, workbench, size = {}) {
  const viewport = workbench?.ui?.canvasDocument?.viewport ?? {};
  const edgeStyle = normalizeCanvasEdgeStyle(workbench?.ui?.canvasEdgeStyle);
  const interactionOptions = resolveCanvasGraphInteractionOptions(viewport);
  return new X6.Graph({
    container: mount,
    width: Math.max(1, Number(size.width ?? 0) || 1),
    height: Math.max(1, Number(size.height ?? 0) || 1),
    autoResize: true,
    // Draw position changes in the same pointer event so dragged nodes do not
    // queue behind the cursor when the canvas contains many rich HTML nodes.
    async: false,
    moveThreshold: 2,
    clickThreshold: 0,
    background: { color: "transparent" },
    grid: {
      size: 1,
      visible: false,
      type: "dot",
      args: { color: "rgba(129, 146, 152, 0.18)", thickness: 1 },
    },
    ...interactionOptions,
    translating: {
      autoOffset: true,
      restrict(view) {
        return resolveCanvasGraphTranslationRestriction(view);
      },
    },
    embedding: {
      enabled: true,
      findParent: "bbox",
      frontOnly: false,
      validate({ child, parent }) {
        return canEmbedCanvasGraphNode(child, parent);
      },
    },
    snapline: {
      enabled: viewport.snapEnabled === true,
      sharp: true,
    },
    keyboard: { enabled: true, global: false },
    history: { enabled: true },
    connecting: {
      allowBlank: true,
      allowLoop: false,
      allowNode: false,
      allowEdge: false,
      allowPort: true,
      allowMulti: true,
      snap: { radius: CANVAS_CONNECTION_SNAP_RADIUS, anchor: "center" },
      router: edgeStyle === "curve" ? { name: "normal" } : { name: "orth", args: { padding: 26 } },
      connector: edgeStyle === "curve" ? { name: "smooth" } : { name: "rounded", args: { radius: 12 } },
      highlight: true,
      validateMagnet({ magnet }) {
        return inferCanvasPortDirection(
          magnet?.getAttribute?.("port") ?? magnet?.getAttribute?.("port-id"),
          magnet?.getAttribute?.("port-group"),
        ) === "out";
      },
      createEdge() {
        const edge = this.createEdge({
          shape: "comic-ai-canvas-edge",
          attrs: buildEdgeAttrs("idle"),
          zIndex: 0,
        });
        edge.__comicAiCanvasConnectionDraft = true;
        return edge;
      },
      validateEdge({ edge, type }) {
        return validateCanvasGraphEdgeConnection({ edge, type });
      },
      validateConnection({ sourceCell, targetCell, sourcePort, targetPort }) {
        const source = resolveCanvasGraphConnectionPort(sourceCell, sourcePort, "out");
        const target = resolveCanvasGraphConnectionPort(targetCell, targetPort, "in");
        return validateCanvasConnection(source, target).ok;
      },
    },
  });
}

function resolveCanvasStoryboardReturnTarget(mount, graphNode, event = {}) {
  const canvasNode = graphNode?.getData?.()?.canvasNode;
  const reference = resolveCanvasStoryboardCutReference(canvasNode);
  if (!reference) return null;

  const pointerEvent = event?.e ?? event;
  const clientX = Number(pointerEvent?.clientX);
  const clientY = Number(pointerEvent?.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const cells = mount?.querySelectorAll?.(".canvas-storyboard-cell[data-storyboard-cell-index]") ?? [];
  for (const cell of cells) {
    const owner = cell.closest?.(".canvas-x6-special-node.is-ai-storyboard[data-node-id]");
    if (
      String(owner?.dataset?.nodeId ?? "") !== reference.storyboardNodeId
      || (reference.cellIndex !== null
        ? Number(cell.dataset?.storyboardCellIndex) !== reference.cellIndex
        : Number(cell.dataset?.storyboardRow) !== reference.row
          || Number(cell.dataset?.storyboardColumn) !== reference.column)
    ) continue;
    const rect = cell.getBoundingClientRect?.() ?? {};
    if (
      clientX >= Number(rect.left)
      && clientX <= Number(rect.right)
      && clientY >= Number(rect.top)
      && clientY <= Number(rect.bottom)
    ) {
      return {
        cell,
        storyboardNodeId: reference.storyboardNodeId,
        cellIndex: Number(cell.dataset?.storyboardCellIndex),
      };
    }
  }
  return null;
}

function wireGraphSync(graph, workbench, mount) {
  const stage = mount?.closest?.(".canvas-stage");
  const sync = (options = {}) => {
    if (graph.__comicAiReconciling === true) return;
    const syncOptions = options?.edge ? { ...options, immediateSave: true } : options;
    const pendingPositionNodeIds = syncOptions.positionNodeIds ?? workbench.canvasPendingPositionNodeIds;
    workbench.canvasPendingPositionNodeIds = null;
    const document = syncCanvasGraphDocument(graph, workbench, pendingPositionNodeIds?.length
      ? { ...syncOptions, scheduleSave: false }
      : syncOptions);
    const edgeTargetNodeId = syncOptions.edge?.getTargetCellId?.();
    if (edgeTargetNodeId) {
      refreshCanvasWorkflowNode(workbench, String(edgeTargetNodeId), { skipDocumentSync: true });
    }
    if (pendingPositionNodeIds?.length && typeof workbench.persistCanvasNodePositions === "function") {
      const ids = new Set(pendingPositionNodeIds.map((id) => String(id)));
      const positions = (document?.nodes ?? [])
        .filter((node) => ids.has(String(node?.id ?? "")))
        .map((node) => {
          const position = node.position ?? {};
          return { nodeKey: String(node.id), x: Number(position.x), y: Number(position.y) };
        })
        .filter((position) => Number.isFinite(position.x) && Number.isFinite(position.y));
      const positionSave = workbench.persistCanvasNodePositions(positions);
      if (positionSave?.catch) void positionSave.catch(() => undefined);
    }
    if (syncOptions.clearToast) {
      workbench.ui.toast = "";
    }
    return document;
  };
  let selectionMovePending = false;
  let dragSnaplineSuspended = false;
  let graphCommitFrame = null;
  let selectionPresentationFrame = null;
  let viewportCommitTimer = null;
  let viewportFrame = null;
  let storyboardReturnCell = null;
  let activeDraggedNode = null;
  const draggedGroupChildIds = new Map();
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
    ?? ((callback) => globalThis.setTimeout?.(callback, 16));
  const scheduleSelectionPresentation = () => {
    if (selectionPresentationFrame != null) return;
    selectionPresentationFrame = requestFrame(() => {
      selectionPresentationFrame = null;
      positionCanvasSelectionActionToolbar(graph, mount);
      positionCanvasNodeActionToolbar(graph, mount);
    });
  };
  const setConnectingEdgeMotion = (edge, connecting) => {
    const apply = () => graph.findViewByCell?.(edge)?.container?.classList?.toggle?.(
      "is-canvas-edge-connecting",
      connecting,
    );
    apply();
    if (connecting) requestFrame(apply);
  };
  const setNodeDragMotion = (node, dragging) => {
    graph.findViewByCell?.(node)?.container?.classList?.toggle?.("is-canvas-node-flowing", dragging);
  };
  const scheduleViewportSync = ({ panning = false } = {}) => {
    if (panning) stage?.classList?.add?.("is-panning");
    if (viewportFrame == null) {
      viewportFrame = requestFrame(() => {
        viewportFrame = null;
        applyCanvasGraphViewportStyles(graph, workbench);
        positionCanvasSelectionActionToolbar(graph, mount);
        positionCanvasNodeActionToolbar(graph, mount);
      });
    }
    if (viewportCommitTimer != null) globalThis.clearTimeout?.(viewportCommitTimer);
    viewportCommitTimer = globalThis.setTimeout?.(() => {
      viewportCommitTimer = null;
      syncCanvasGraphViewport(graph, workbench);
      refreshCanvasDistributionGapHandles(graph, workbench, mount);
      stage?.classList?.remove?.("is-panning");
    }, CANVAS_VIEWPORT_COMMIT_DELAY_MS);
  };
  const scheduleGraphCommit = (options = {}) => {
    if (graphCommitFrame != null) return;
    graphCommitFrame = requestFrame(() => {
      graphCommitFrame = null;
      sync(options);
    });
  };
  bindCanvasEdgeDisconnectControl(graph, workbench, mount);
  const snapEnabled = () => workbench?.ui?.canvasDocument?.viewport?.snapEnabled === true;
  const suspendDragSnapline = () => {
    if (!snapEnabled() || dragSnaplineSuspended) return;
    graph.getPlugin?.("snapline")?.disable?.();
    dragSnaplineSuspended = true;
  };
  const restoreDragSnapline = () => {
    if (!dragSnaplineSuspended) return;
    dragSnaplineSuspended = false;
    if (snapEnabled()) graph.getPlugin?.("snapline")?.enable?.();
  };
  const updateStoryboardReturnTarget = (event) => {
    const target = resolveCanvasStoryboardReturnTarget(mount, event?.node, event);
    if (storyboardReturnCell !== target?.cell) {
      storyboardReturnCell?.classList?.remove?.("is-return-target");
      storyboardReturnCell = target?.cell ?? null;
      storyboardReturnCell?.classList?.add?.("is-return-target");
    }
    return target;
  };
  const clearStoryboardReturnTarget = () => {
    storyboardReturnCell?.classList?.remove?.("is-return-target");
    storyboardReturnCell = null;
  };
  graph.on("node:change:position", (event) => {
    if (graph.__comicAiReconciling === true) return;
    if (
      event?.node?.getData?.()?.canvasNode?.type === "group"
      && event?.options?.canvasGroupMove !== true
    ) {
      const groupId = String(event.node.id ?? "");
      const documentNodes = workbench.ui.canvasDocument?.nodes ?? [];
      let childIds = draggedGroupChildIds.get(groupId);
      if (!childIds) {
        const documentGroup = documentNodes.find((node) => String(node?.id ?? "") === groupId);
        childIds = new Set([
          ...(documentGroup?.data?.childNodeIds ?? []).map(String),
          ...documentNodes
            .filter((node) => String(node?.parentGroupId ?? "") === groupId)
            .map((node) => String(node.id ?? "")),
        ]);
        draggedGroupChildIds.set(groupId, childIds);
      }
      for (const childId of childIds) {
        const child = graph.getCellById?.(childId);
        if (child && child !== event.node) {
          ensureCanvasGraphChildEmbedding(event.node, child, { silent: true, canvasGroupMove: true });
        }
      }
    }
    if (!event?.options?.selection) syncCanvasGraphEditorOverlay(graph, event?.node);
    if (!event?.options?.selection) positionCanvasNodeActionToolbar(graph, mount);
    if (event?.options?.selection) {
      selectionMovePending = true;
    }
  });
  graph.on("node:move", ({ node } = {}) => {
    if (activeDraggedNode === node) return;
    if (activeDraggedNode) setNodeDragMotion(activeDraggedNode, false);
    activeDraggedNode = node ?? null;
    stage?.classList?.add?.("is-node-dragging");
    setNodeDragMotion(node, true);
  });
  graph.on("node:moved", (event) => {
    stage?.classList?.remove?.("is-node-dragging");
    setNodeDragMotion(event?.node, false);
    activeDraggedNode = null;
    draggedGroupChildIds.delete(String(event?.node?.id ?? ""));
    restoreDragSnapline();
    const storyboardReturnTarget = updateStoryboardReturnTarget(event);
    clearStoryboardReturnTarget();
    if (storyboardReturnTarget && workbench.onCanvasStoryboardImageReturn?.({
      imageNodeId: String(event?.node?.id ?? ""),
      storyboardNodeId: storyboardReturnTarget.storyboardNodeId,
      cellIndex: storyboardReturnTarget.cellIndex,
    }) === true) {
      workbench.canvasPendingPositionNodeIds = null;
      return;
    }
    snapCanvasGraphNodesToGrid([event?.node], snapEnabled());
    syncCanvasGraphEditorOverlay(graph, event?.node);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasConnectedEdgeMotion(graph);
    positionCanvasSelectionActionToolbar(graph, mount);
    positionCanvasNodeActionToolbar(graph, mount);
    const positionNodeIds = canvasGraphCellAndDescendantIds([
      ...canvasSelectedGraphCells(graph),
      event?.node,
    ]);
    workbench.canvasPendingPositionNodeIds = positionNodeIds;
    scheduleGraphCommit({ clearToast: true });
  });
  graph.on("node:resized", ({ node } = {}) => {
    const data = node?.getData?.() ?? {};
    const canvasNode = data.canvasNode;
    const size = node?.getSize?.() ?? {};
    const resized = resizeCanvasNoteDataPoints(canvasNode, size.width, size.height);
    if (resized !== canvasNode) {
      node.setData?.({ ...data, canvasNode: resized }, { overwrite: true, silent: true });
    }
    positionCanvasSelectionActionToolbar(graph, mount);
    positionCanvasNodeActionToolbar(graph, mount);
    sync({ clearToast: true });
  });
  graph.on("translate", () => scheduleViewportSync({ panning: true }));
  graph.on("scale", () => {
    syncCanvasZoomControlDisplay(workbench.root, graph.zoom?.());
    scheduleViewportSync();
  });
  graph.on("edge:added", ({ edge } = {}) => {
    if (!edge?.getTargetCellId?.()) setConnectingEdgeMotion(edge, true);
  });
  graph.on("edge:connected", (event = {}) => {
    const blankConnection = resolveCanvasBlankConnection(event);
    if (blankConnection) return;
    if (event.edge) delete event.edge.__comicAiCanvasConnectionDraft;
    setConnectingEdgeMotion(event.edge, false);
    if (workbench.ui.canvasEdgesHidden === true) event.edge?.hide?.();
    sync({ immediateSave: true, edge: event.edge });
    refreshCanvasConnectedEdgeMotion(graph);
  });
  graph.on("edge:mouseup", (event = {}) => {
    handleCanvasBlankConnectionEvent({ graph, workbench, mount, event });
  });
  graph.on("edge:removed", (event = {}) => {
    if (event?.options?.canvasBlankConnectionDraft) return;
    sync(event);
  });
  graph.on("cell:change:data", (event = {}) => {
    if (event?.options?.canvasNodeRefresh) return;
    sync();
  });
  graph.on("cell:removed", ({ cell, options } = {}) => {
    if (options?.canvasBlankConnectionDraft) return;
    if (cell?.getData?.()?.canvasTransientEditor === true) return;
    sync();
  });
  const selectGraphNode = (node) => {
    if (node?.getData?.()?.canvasTransientEditor === true) return;
    node?.setZIndex?.(resolveCanvasGraphNodeSelectionZIndex(node));
    selectCanvasNodeFromGraph(workbench, node?.id);
  };
  graph.on("node:click", ({ node }) => selectGraphNode(node));
  graph.on("node:mouseup", ({ node }) => {
    mount?.closest?.(".canvas-stage")?.classList?.remove?.("is-node-dragging");
    setNodeDragMotion(node, false);
    restoreDragSnapline();
    refreshCanvasConnectedEdgeMotion(graph);
    selectGraphNode(node);
  });
  graph.on("cell:click", ({ cell }) => {
    if (cell?.isNode?.()) selectGraphNode(cell);
  });
  graph.on("node:mousedown", ({ node, e }) => {
    suspendDragSnapline();
    duplicateCanvasNodeForModifierDrag(graph, workbench, node, e);
  });
  graph.on("node:dblclick", ({ node, e }) => {
    const canvasNode = workbench?.ui?.canvasDocument?.nodes?.find?.((item) => item.id === node?.id);
    if (canvasNode?.type === "ai-director") {
      if (e) e.__canvasDirectorHandled = true;
      workbench.onDirectorDeskOpen?.(canvasNode);
    }
  });
  graph.on("cell:selected", ({ cell }) => {
    if (cell?.getData?.()?.canvasTransientEditor === true) return;
    selectCanvasNodeFromGraph(workbench, cell?.isNode?.() ? cell.id : null);
    refreshCanvasConnectedEdgeMotion(graph);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasSelectionActionToolbar(graph, workbench, mount);
  });
  graph.on("selection:changed", ({ added = [] } = {}) => {
    const selectedNode = added.find((cell) => cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true);
    selectCanvasNodeFromGraph(workbench, selectedNode?.id);
    refreshCanvasConnectedEdgeMotion(graph);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasSelectionActionToolbar(graph, workbench, mount);
  });
  const selectionPlugin = graph.getPlugin?.("selection");
  selectionPlugin?.on?.("selection:changed", ({ added = [] } = {}) => {
    const selectedNode = added.find((cell) => cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true);
    selectCanvasNodeFromGraph(workbench, selectedNode?.id);
    refreshCanvasConnectedEdgeMotion(graph);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasSelectionActionToolbar(graph, workbench, mount);
  });
  selectionPlugin?.on?.("box:mousemove", ({ e } = {}) => {
    if (!isCanvasSelectionTranslationEvent(e)) return;
    mount?.closest?.(".canvas-stage")?.classList?.add?.("is-node-dragging");
    constrainCanvasGraphSelectionToGroups(graph.getSelectedCells?.() ?? []);
  });
  selectionPlugin?.on?.("box:mouseup", () => {
    mount?.closest?.(".canvas-stage")?.classList?.remove?.("is-node-dragging");
    refreshCanvasConnectedEdgeMotion(graph);
    requestFrame(() => refreshCanvasSelectionActionToolbar(graph, workbench, mount));
    if (selectionMovePending) {
      selectionMovePending = false;
      snapCanvasGraphNodesToGrid(graph.getSelectedCells?.(), snapEnabled());
      scheduleGraphCommit({ clearToast: true });
    }
  });
  graph.on("cell:unselected", () => {
    refreshCanvasConnectedEdgeMotion(graph);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
    refreshCanvasSelectionActionToolbar(graph, workbench, mount);
  });
  bindCanvasGraphKey(graph, ["backspace", "delete"], () => {
    const selectedCells = graph.getSelectedCells();
    if (selectedCells.length) {
      const nodeIds = selectedCells.filter((cell) => cell?.isNode?.()).map((cell) => String(cell.id ?? ""));
      void playCanvasNodeExitMotion(graph, nodeIds).then(() => {
        detachCanvasGroupChildrenForRemoval(selectedCells);
        graph.removeCells(selectedCells);
        sync();
      });
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

function refreshCanvasConnectedEdgeMotion(graph, nodeIds = []) {
  const activeNodeIds = new Set([
    ...canvasGraphCellAndDescendantIds(canvasSelectedGraphCells(graph)),
    ...nodeIds,
  ].map(String).filter(Boolean));
  for (const edge of graph?.getEdges?.() ?? []) {
    const sourceNodeId = String(edge.getSourceCellId?.() ?? edge.getSource?.()?.cell ?? "");
    const targetNodeId = String(edge.getTargetCellId?.() ?? edge.getTarget?.()?.cell ?? "");
    const flowing = activeNodeIds.has(sourceNodeId) || activeNodeIds.has(targetNodeId);
    const edgeView = graph.findViewByCell?.(edge);
    edgeView?.container?.classList?.toggle?.("is-canvas-edge-flowing", flowing);
    if (flowing) edgeView?.container?.querySelector?.("path:nth-child(3)")?.setAttribute?.("pathLength", "100");
  }
}

export function canvasGraphCellAndDescendantIds(cells = []) {
  const ids = new Set();
  for (const cell of cells) {
    if (!cell?.isNode?.()) continue;
    [cell, ...(cell.getDescendants?.({ deep: true }) ?? [])].forEach((candidate) => {
      const nodeId = String(candidate?.id ?? "").trim();
      if (candidate?.isNode?.() && nodeId) ids.add(nodeId);
    });
  }
  return [...ids];
}

function isCanvasSelectionTranslationEvent(event) {
  const eventData = event?.data;
  return Boolean(eventData && typeof eventData === "object"
    && Object.values(eventData).some((value) => value?.action === "translating"));
}

function bindCanvasEdgeDisconnectControl(graph, workbench, mount) {
  if (!graph?.on || !mount?.append || typeof document === "undefined") return false;
  mount.querySelector?.("[data-canvas-edge-disconnect]")?.remove?.();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "canvas-edge-disconnect-button";
  button.dataset.canvasEdgeDisconnect = "true";
  button.setAttribute("aria-label", "取消这条连接");
  button.title = "取消连接";
  button.hidden = true;
  button.style.transform = "translate(-50%, -50%)";
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="7" r="3"></circle>
    <circle cx="6" cy="17" r="3"></circle>
    <path d="m8.7 8.4 10.8 6.2"></path>
    <path d="m8.7 15.6 10.8-6.2"></path>
  </svg>`;
  mount.append(button);

  let activeEdge = null;
  let hideTimer = null;
  let showTimer = null;
  let pendingShow = null;
  const clearHideTimer = () => {
    if (hideTimer == null) return;
    globalThis.clearTimeout?.(hideTimer);
    hideTimer = null;
  };
  const clearShowTimer = () => {
    if (showTimer != null) globalThis.clearTimeout?.(showTimer);
    showTimer = null;
    pendingShow = null;
  };
  const hide = () => {
    clearHideTimer();
    clearShowTimer();
    activeEdge?.removeTools?.();
    activeEdge = null;
    button.hidden = true;
  };
  const scheduleHide = () => {
    clearHideTimer();
    clearShowTimer();
    hideTimer = globalThis.setTimeout?.(hide, 100);
  };
  const show = ({ edge, edgeElement, pointerClientX, pointerClientY } = {}) => {
    if (!edge || workbench?.ui?.canvasEdgesHidden === true) {
      hide();
      return;
    }
    const edgePath = edgeElement?.querySelector?.("path");
    const pathRect = edgePath?.getBoundingClientRect?.() ?? {};
    let clientX = Number(pointerClientX);
    let clientY = Number(pointerClientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      clientX = Number(pathRect.left) + Number(pathRect.width) / 2;
      clientY = Number(pathRect.top) + Number(pathRect.height) / 2;
      try {
        const length = edgePath?.getTotalLength?.();
        const point = Number.isFinite(length) ? edgePath.getPointAtLength(length / 2) : null;
        const matrix = point ? edgePath.getScreenCTM?.() : null;
        if (point && matrix) {
          clientX = point.x * matrix.a + point.y * matrix.c + matrix.e;
          clientY = point.x * matrix.b + point.y * matrix.d + matrix.f;
        }
      } catch {
        // Keep the bounding-box midpoint fallback for incomplete SVG implementations.
      }
    }
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    clearHideTimer();
    if (typeof edge.addTools === "function") {
      const edgeView = graph.findViewByCell?.(edge);
      const localPoint = graph.clientToLocal?.(clientX, clientY);
      const closestRatio = edgeView?.getClosestPointRatio?.(localPoint);
      const distance = Number.isFinite(closestRatio)
        ? `${Math.max(0, Math.min(1, closestRatio)) * 100}%`
        : "50%";
      if (activeEdge === edge && edge.hasTools?.("canvas-edge-disconnect")) {
        const activeTool = edgeView?.tools?.tools?.find?.((tool) => tool?.name === "button");
        if (activeTool?.options) {
          activeTool.options.distance = distance;
          activeTool.update?.();
          return;
        }
      }
      activeEdge?.removeTools?.();
      activeEdge = edge;
      button.hidden = true;
      edge.addTools([{
        name: "button",
        args: {
          className: "canvas-edge-disconnect-tool",
          distance,
          markup: [
            { tagName: "circle", selector: "button", attrs: { r: 18, fill: "#181e22", stroke: "#91a0a8", strokeWidth: 1, cursor: "pointer" } },
            { tagName: "circle", selector: "handleTop", attrs: { cx: -6, cy: -5, r: 3, fill: "none", stroke: "#dfe7ea", strokeWidth: 1.9, pointerEvents: "none" } },
            { tagName: "circle", selector: "handleBottom", attrs: { cx: -6, cy: 5, r: 3, fill: "none", stroke: "#dfe7ea", strokeWidth: 1.9, pointerEvents: "none" } },
            { tagName: "path", selector: "bladeDown", attrs: { d: "M -3.3 -3.6 9 3.8", fill: "none", stroke: "#dfe7ea", strokeWidth: 1.9, strokeLinecap: "round", pointerEvents: "none" } },
            { tagName: "path", selector: "bladeUp", attrs: { d: "M -3.3 3.6 9 -3.8", fill: "none", stroke: "#dfe7ea", strokeWidth: 1.9, strokeLinecap: "round", pointerEvents: "none" } },
          ],
          onClick({ cell }) {
            hide();
            graph.removeCell?.(cell);
          },
        },
      }], "canvas-edge-disconnect", { local: true, reset: true });
      return;
    }
    activeEdge = edge;
    const rect = mount.getBoundingClientRect?.() ?? {};
    const width = Number(mount.clientWidth ?? rect.width ?? 0);
    const height = Number(mount.clientHeight ?? rect.height ?? 0);
    const scaleX = Number(rect.width) > 0 && width > 0 ? Number(rect.width) / width : 1;
    const scaleY = Number(rect.height) > 0 && height > 0 ? Number(rect.height) / height : 1;
    const buttonSize = 36;
    const pointerX = (clientX - Number(rect.left ?? 0)) / scaleX;
    const pointerY = (clientY - Number(rect.top ?? 0)) / scaleY;
    const left = Math.min(Math.max(buttonSize / 2, pointerX), Math.max(buttonSize / 2, width - buttonSize / 2));
    const top = Math.min(Math.max(buttonSize / 2, pointerY), Math.max(buttonSize / 2, height - buttonSize / 2));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.hidden = false;
  };
  const queueShow = (request) => {
    clearHideTimer();
    if (activeEdge === request?.edge) {
      show(request);
      return;
    }
    if (activeEdge) hide();
    if (pendingShow?.edge !== request?.edge) clearShowTimer();
    pendingShow = request;
    if (showTimer != null) return;
    showTimer = globalThis.setTimeout?.(() => {
      const nextShow = pendingShow;
      showTimer = null;
      pendingShow = null;
      show(nextShow);
    }, 1000);
  };

  button.addEventListener("pointerenter", clearHideTimer);
  button.addEventListener("pointerleave", scheduleHide);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const edge = activeEdge;
    hide();
    if (edge) graph.removeCell?.(edge);
  });
  const trackPointer = (event) => {
    const path = event.composedPath?.() ?? [];
    if (path.includes(button)) {
      clearHideTimer();
      if (activeEdge) show({ edge: activeEdge, pointerClientX: event.clientX, pointerClientY: event.clientY });
      return;
    }
    const edgeElement = path.find((candidate) => candidate?.classList?.contains?.("x6-edge"))
      ?? event.target?.closest?.(".x6-edge[data-cell-id]");
    const edgeId = String(edgeElement?.getAttribute?.("data-cell-id") ?? "");
    const edge = edgeId ? graph.getCellById?.(edgeId) : null;
    if (edge) queueShow({ edge, edgeElement, pointerClientX: event.clientX, pointerClientY: event.clientY });
    else scheduleHide();
  };
  mount.addEventListener("pointermove", trackPointer, true);
  mount.addEventListener("mousemove", trackPointer, true);
  mount.addEventListener("mouseleave", scheduleHide);
  graph.on("edge:removed", ({ edge } = {}) => {
    if (edge === activeEdge) hide();
  });
  return true;
}

export function snapCanvasGraphNodesToGrid(cells = [], enabled = true, gridSize = CANVAS_GRID_SIZE) {
  if (!enabled) return false;
  const size = Math.max(1, Number(gridSize) || CANVAS_GRID_SIZE);
  let changed = false;
  for (const cell of Array.isArray(cells) ? cells : []) {
    if (!cell?.isNode?.() || cell?.getData?.()?.canvasTransientEditor === true) continue;
    const position = cell.getPosition?.() ?? {};
    const x = Number(position.x);
    const y = Number(position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const snappedX = Math.round(x / size) * size;
    const snappedY = Math.round(y / size) * size;
    if (snappedX === x && snappedY === y) continue;
    cell.position?.(snappedX, snappedY, { deep: true });
    changed = true;
  }
  return changed;
}

export function mountCanvasGraphEditorOverlay(graph, nodeId, editorHtml) {
  const parent = graph?.getCellById?.(nodeId);
  if (!parent?.isNode?.() || !editorHtml || !graph?.addNode) return false;
  if (parent.getData?.()?.canvasNode?.type === "group") return false;
  clearCanvasGraphEditorOverlay(graph);
  const size = parent.getSize?.() ?? { width: 360, height: 170 };
  const position = parent.getPosition?.() ?? { x: 0, y: 0 };
  const editorSize = { width: 600, height: 220 };
  const parentData = parent.getData?.()?.canvasNode?.data ?? {};
  const verticalOffset = parentData.output
    || parentData.imageUrl
    || parentData.thumbnailUrl
    || parentData.videoUrl
    || parentData.audioUrl
    ? 12
    : -20;
  graph.addNode({
    id: CANVAS_EDITOR_OVERLAY_ID,
    shape: "comic-ai-canvas-editor-overlay",
    x: position.x + (size.width - editorSize.width) / 2,
    y: position.y + size.height + verticalOffset,
    width: editorSize.width,
    height: editorSize.height,
    zIndex: 1002,
    data: { canvasTransientEditor: true, parentNodeId: String(nodeId), editorHtml: String(editorHtml) },
  });
  parent.setZIndex?.(1001);
  return true;
}

export function clearCanvasGraphEditorOverlay(graph) {
  const editor = graph?.getCellById?.(CANVAS_EDITOR_OVERLAY_ID);
  const container = graph?.container ?? graph?.options?.container;
  const staleViews = container?.querySelectorAll?.(`[data-cell-id="${CANVAS_EDITOR_OVERLAY_ID}"]`) ?? [];
  if (!editor && staleViews.length === 0) return false;
  if (editor) graph.removeCell?.(editor);
  staleViews.forEach((view) => view.remove?.());
  return true;
}

function syncCanvasGraphEditorOverlay(graph, node) {
  const editor = graph?.getCellById?.(CANVAS_EDITOR_OVERLAY_ID);
  if (!editor || String(editor.getData?.()?.parentNodeId ?? "") !== String(node?.id ?? "")) return false;
  const size = node.getSize?.() ?? { width: 360, height: 170 };
  const position = node.getPosition?.() ?? { x: 0, y: 0 };
  const editorSize = editor.getSize?.() ?? { width: 600, height: 220 };
  const parentData = node.getData?.()?.canvasNode?.data ?? {};
  const verticalOffset = parentData.output
    || parentData.imageUrl
    || parentData.thumbnailUrl
    || parentData.videoUrl
    || parentData.audioUrl
    ? 12
    : -20;
  editor.position?.(position.x + (size.width - editorSize.width) / 2, position.y + size.height + verticalOffset);
  return true;
}

export function normalizeCanvasEdgeStyle(value) {
  return String(value ?? "curve") === "orthogonal" ? "orthogonal" : "curve";
}

export function applyCanvasGraphEdgeStyle(graph, value) {
  if (!graph?.getEdges) return false;
  const style = normalizeCanvasEdgeStyle(value);
  const router = style === "curve"
    ? { name: "normal" }
    : { name: "orth", args: { padding: 26 } };
  const connector = style === "curve"
    ? { name: "smooth" }
    : { name: "rounded", args: { radius: 12 } };
  if (graph.options?.connecting) {
    graph.options.connecting.router = router;
    graph.options.connecting.connector = connector;
  }
  if (graph.__comicAiCanvasEdgeStyle === style) return true;
  for (const edge of graph.getEdges()) {
    applyCanvasEdgeStyle(graph, edge, style);
  }
  graph.__comicAiCanvasEdgeStyle = style;
  return true;
}

function applyCanvasEdgeStyle(graph, edge, style, updateView = true) {
  if (style === "curve") {
    edge.setRouter?.("normal", {}, { silent: true });
    edge.setConnector?.("smooth", {}, { silent: true });
  } else {
    edge.setRouter?.("orth", { padding: 26 }, { silent: true });
    edge.setConnector?.("rounded", { radius: 12 }, { silent: true });
  }
  if (updateView) graph.findViewByCell?.(edge)?.update?.();
}

export function syncCanvasZoomControlDisplay(root, zoom) {
  const normalizedZoom = Number(zoom);
  if (!root?.querySelector || !Number.isFinite(normalizedZoom) || normalizedZoom <= 0) return false;
  const zoomPercent = Math.round(normalizedZoom * 100);
  const zoomTrigger = root.querySelector("[data-canvas-zoom-trigger]");
  if (zoomTrigger) {
    zoomTrigger.textContent = `${zoomPercent}%`;
    zoomTrigger.setAttribute?.("aria-label", `画布缩放比例 ${zoomPercent}%`);
  }
  const zoomInput = root.querySelector("[data-canvas-zoom-value-input]");
  if (zoomInput) zoomInput.value = String(zoomPercent);
  return Boolean(zoomTrigger || zoomInput);
}

export function applyCanvasGraphEdgeVisibility(graph, visible = true) {
  if (!graph?.getEdges) return false;
  const nextVisible = Boolean(visible);
  if (graph.__comicAiCanvasEdgesVisible === nextVisible) return true;
  for (const edge of graph.getEdges()) {
    applyCanvasEdgeVisibility(edge, nextVisible);
  }
  if (!nextVisible) {
    for (const edge of graph.getEdges?.() ?? []) edge.removeTools?.();
    const disconnectButton = graph.__comicAiCanvasMount?.querySelector?.("[data-canvas-edge-disconnect]");
    if (disconnectButton) disconnectButton.hidden = true;
  }
  graph.__comicAiCanvasEdgesVisible = nextVisible;
  return true;
}

function applyCanvasEdgeVisibility(edge, visible) {
  if (visible) edge.show?.();
  else edge.hide?.();
  edge.setVisible?.(visible, { silent: true });
}

export function applyCanvasGraphViewportPreferences(graph, viewport = {}) {
  if (!graph) return false;
  const snapEnabled = viewport.snapEnabled === true;
  if (graph.__comicAiCanvasSnapEnabled === snapEnabled) return true;
  if (graph.options?.snapline) graph.options.snapline.enabled = snapEnabled;
  graph.setGridSize?.(snapEnabled ? CANVAS_GRID_SIZE : 1);
  if (graph.options?.connecting) {
    graph.options.connecting.snap = { radius: CANVAS_CONNECTION_SNAP_RADIUS, anchor: "center" };
  }
  const snapline = graph.getPlugin?.("snapline");
  if (snapEnabled) snapline?.enable?.();
  else snapline?.disable?.();
  graph.__comicAiCanvasSnapEnabled = snapEnabled;
  return true;
}

export function canEmbedCanvasGraphNode(child, parent) {
  const childNode = child?.getData?.()?.canvasNode ?? child?.data?.canvasNode;
  const parentNode = parent?.getData?.()?.canvasNode ?? parent?.data?.canvasNode;
  return Boolean(childNode && parentNode?.type === "group" && childNode.type !== "group");
}

export function duplicateCanvasNodeForModifierDrag(graph, workbench, node, event = {}) {
  if ((!event.ctrlKey && !event.metaKey) || Number(event.button ?? 0) !== 0) return null;
  const canvasNode = node?.getData?.()?.canvasNode;
  if (!canvasNode || canvasNode.type === "group") return null;
  const document = workbench?.ui?.canvasDocument;
  if (!document) return null;
  const result = duplicateCanvasNodes(document, [String(node.id ?? canvasNode.id ?? "")], { offset: 0 });
  const cloneId = String(result.nodeIds?.[0] ?? "");
  if (!cloneId) return null;
  const cloneData = canvasDocumentToX6Data(result.document).nodes.find((item) => item.id === cloneId);
  if (!cloneData) return null;
  graph.addNode?.(cloneData);
  applyCanvasNodeMotion(graph, cloneId, "entering", 220);
  if (cloneData.parent) applyCanvasGraphGrouping(graph, result.document);
  if (typeof workbench.updateCanvasDocument === "function") workbench.updateCanvasDocument(result.document);
  else workbench.ui.canvasDocument = result.document;
  return cloneId;
}

export function resolveCanvasBlankConnection(event = {}) {
  const edge = event.edge;
  if (edge?.__comicAiCanvasConnectionDraft !== true) return null;
  if ((event.type && event.type !== "target") || event.currentCell) return null;
  const source = edge.getSource?.() ?? edge.source ?? {};
  const target = event.currentPoint ?? edge.getTarget?.() ?? edge.target ?? {};
  const sourceNodeId = String(source?.cell ?? "");
  const sourcePortId = String(source?.port ?? "");
  const canvasX = Number(target?.x);
  const canvasY = Number(target?.y);
  if (!sourceNodeId || !sourcePortId || target?.cell || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
    return null;
  }
  const draftEdgeId = String(edge?.id ?? edge?.getProp?.("id") ?? "");
  return {
    sourceNodeId,
    sourcePortId,
    ...(draftEdgeId ? { draftEdgeId } : {}),
    canvasX,
    canvasY,
  };
}

export function settleCanvasGraphBlankConnectionDraft(graph, { document = null, draftEdgeId = null } = {}) {
  const edge = graph?.__comicAiCanvasPendingConnectionEdge;
  if (!edge) return false;
  const pendingEdgeId = String(edge?.id ?? edge?.getProp?.("id") ?? "");
  if (draftEdgeId !== null && String(draftEdgeId ?? "") === pendingEdgeId) {
    return false;
  }
  const committed = pendingEdgeId && Array.isArray(document?.edges)
    ? document.edges.some((item) => (
        String(item?.id ?? "") === pendingEdgeId
        && item?.sourceNodeId
        && item?.sourcePortId
        && item?.targetNodeId
        && item?.targetPortId
      ))
    : false;
  delete graph.__comicAiCanvasPendingConnectionEdge;
  if (committed) {
    delete edge.__comicAiCanvasConnectionDraft;
    graph.findViewByCell?.(edge)?.container?.classList?.remove?.("is-canvas-edge-connecting");
    return true;
  }
  graph.removeCell?.(edge, { canvasBlankConnectionDraft: true });
  return true;
}

export function handleCanvasBlankConnectionEvent({ graph, workbench, mount, event = {} } = {}) {
  const blankConnection = resolveCanvasBlankConnection(event);
  if (!blankConnection) return false;
  const convertedPoint = graph?.localToClient?.({
    x: blankConnection.canvasX,
    y: blankConnection.canvasY,
  }) ?? { x: blankConnection.canvasX, y: blankConnection.canvasY };
  const pointerClientX = Number(event.e?.clientX);
  const pointerClientY = Number(event.e?.clientY);
  const clientPoint = {
    x: Number.isFinite(pointerClientX) ? pointerClientX : Number(convertedPoint.x ?? 0),
    y: Number.isFinite(pointerClientY) ? pointerClientY : Number(convertedPoint.y ?? 0),
  };
  const stage = mount?.closest?.(".canvas-stage");
  const stageRect = stage?.getBoundingClientRect?.() ?? {};
  const stageWidth = Number(stage?.clientWidth ?? stageRect.width ?? 0);
  const stageHeight = Number(stage?.clientHeight ?? stageRect.height ?? 0);
  const scaleX = Number(stageRect.width) > 0 && stageWidth > 0 ? Number(stageRect.width) / stageWidth : 1;
  const scaleY = Number(stageRect.height) > 0 && stageHeight > 0 ? Number(stageRect.height) / stageHeight : 1;
  const previousDraft = graph?.__comicAiCanvasPendingConnectionEdge;
  if (previousDraft && previousDraft !== event.edge) {
    graph.removeCell?.(previousDraft, { canvasBlankConnectionDraft: true });
  }
  graph.__comicAiCanvasPendingConnectionEdge = event.edge;
  workbench?.onCanvasBlankConnection?.({
    ...blankConnection,
    x: Math.round((clientPoint.x - Number(stageRect.left ?? 0) + CANVAS_CONNECTION_MENU_GAP) / scaleX),
    y: Math.round((clientPoint.y - Number(stageRect.top ?? 0)) / scaleY),
    stageWidth: Math.round(stageWidth),
    stageHeight: Math.round(stageHeight),
  });
  return true;
}

export function validateCanvasGraphEdgeConnection({ edge, type } = {}) {
  const source = edge?.getSource?.() ?? {};
  const target = edge?.getTarget?.() ?? {};
  if (source.cell && target.cell) return true;
  return edge?.__comicAiCanvasConnectionDraft === true
    && type === "target"
    && Boolean(source.cell && source.port)
    && Number.isFinite(Number(target.x))
    && Number.isFinite(Number(target.y));
}

export function syncCanvasGraphViewport(graph, workbench) {
  const document = workbench?.ui?.canvasDocument;
  if (!document || typeof graph?.translate !== "function" || typeof graph?.zoom !== "function") {
    return false;
  }
  const translation = graph.translate() ?? {};
  const zoom = Number(graph.zoom());
  const x = Number(translation.tx ?? document.viewport?.x ?? 0);
  const y = Number(translation.ty ?? document.viewport?.y ?? 0);
  const normalizedZoom = Number.isFinite(zoom) ? zoom : Number(document.viewport?.zoom ?? 1);
  const nextDocument = {
    ...document,
    viewport: {
      ...(document.viewport ?? {}),
      x,
      y,
      zoom: normalizedZoom,
    },
  };
  if (typeof workbench.updateCanvasViewport === "function") {
    workbench.updateCanvasViewport(nextDocument);
  } else if (typeof workbench.updateCanvasDocument === "function") {
    workbench.updateCanvasDocument(nextDocument);
  } else {
    workbench.ui.canvasDocument = nextDocument;
  }
  workbench.ui.canvasDocument = nextDocument;
  if (workbench.ui.canvasDocumentsByProject && typeof workbench.ui.canvasDocumentsByProject === "object") {
    const projectId = String(workbench.ui.selectedCanvasProjectId ?? nextDocument.canvasProjectId ?? "");
    if (projectId) {
      workbench.ui.canvasDocumentsByProject = {
        ...workbench.ui.canvasDocumentsByProject,
        [projectId]: nextDocument,
      };
    }
  }
  graph.__comicAiCanvasDocument = nextDocument;
  applyCanvasGraphViewportStyles(graph, workbench, { x, y, zoom: normalizedZoom });
  return true;
}

function applyCanvasGraphViewportStyles(graph, workbench, viewport = null) {
  const stage = graph?.__comicAiCanvasMount?.closest?.(".canvas-stage");
  const translation = viewport ?? graph?.translate?.() ?? {};
  const zoom = Number(viewport?.zoom ?? graph?.zoom?.() ?? 1);
  const x = Number(viewport?.x ?? translation.tx ?? 0);
  const y = Number(viewport?.y ?? translation.ty ?? 0);
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 1;
  const visualZoom = Math.max(0.1, normalizedZoom);
  const gridSize = Math.max(CANVAS_GRID_SIZE, Math.round(CANVAS_GRID_SIZE * visualZoom * 100) / 100);
  const gridDotMix = Math.min(14, Math.max(2, Math.round(14 * visualZoom * 100) / 100));
  stage?.style?.setProperty?.("--canvas-grid-size", `${gridSize}px`);
  stage?.style?.setProperty?.("--canvas-grid-major-size", `${gridSize * 5}px`);
  stage?.style?.setProperty?.("--canvas-grid-dot-mix", `${gridDotMix}%`);
  stage?.style?.setProperty?.("--canvas-grid-x", `${x}px`);
  stage?.style?.setProperty?.("--canvas-grid-y", `${y}px`);
  stage?.style?.setProperty?.("--canvas-input-scale", String(1 / Math.max(0.1, normalizedZoom)));
  return true;
}

export function applyCanvasWorkflowHistory(workbench, direction) {
  const graph = workbench?.canvasGraph;
  if (!graph || !["undo", "redo"].includes(direction) || typeof graph[direction] !== "function") {
    return false;
  }
  graph[direction]();
  syncCanvasGraphDocument(graph, workbench);
  return true;
}

export function selectedCanvasWorkflowNodeIds(workbench) {
  return canvasSelectedGraphCells(workbench?.canvasGraph)
    .map((cell) => String(cell.id ?? ""))
    .filter(Boolean);
}

export function clearCanvasGraphSelection(graph) {
  const selection = graph?.getPlugin?.("selection");
  if (typeof selection?.clean === "function") {
    selection.clean({ batch: true });
    return true;
  }
  if (typeof graph?.unselectAll === "function") {
    graph.unselectAll();
    return true;
  }
  return false;
}

export function selectCanvasGraphNodeExclusively(graph, nodeId) {
  const cell = nodeId ? graph?.getCellById?.(nodeId) : null;
  if (!cell?.isNode?.()) return false;
  const selectedIds = (graph.getSelectedCells?.() ?? [])
    .filter((selectedCell) => selectedCell?.isNode?.())
    .map((selectedCell) => String(selectedCell.id ?? ""));
  const domSelectedIds = [...(graph?.__comicAiCanvasMount?.querySelectorAll?.(".x6-node-selected[data-cell-id]") ?? [])]
    .map((element) => String(element.getAttribute?.("data-cell-id") ?? ""))
    .filter(Boolean);
  const nodeIdString = String(cell.id);
  const apiSelectionMatches = selectedIds.length === 1 && selectedIds[0] === nodeIdString;
  const domSelectionMatches = !domSelectedIds.length
    || (domSelectedIds.length === 1 && domSelectedIds[0] === nodeIdString);
  if (apiSelectionMatches && domSelectionMatches) return true;
  const selection = graph.getPlugin?.("selection");
  if (typeof selection?.reset === "function") {
    selection.reset([cell], { batch: true });
    return true;
  }
  clearCanvasGraphSelection(graph);
  graph.select?.(cell);
  return true;
}

function canvasSelectedGraphCells(graph) {
  const selectedIds = [...(graph?.__comicAiCanvasMount?.querySelectorAll?.(".x6-node-selected[data-cell-id]") ?? [])]
    .map((element) => String(element.getAttribute?.("data-cell-id") ?? ""))
    .filter(Boolean);
  if (selectedIds.length) {
    return selectedIds
      .map((nodeId) => graph?.getCellById?.(nodeId))
      .filter((cell) => cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true);
  }
  return (graph?.getSelectedCells?.() ?? []).filter((cell) => (
    cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true
  ));
}

export function mountCanvasGraphNodeActionToolbar(graph, nodeId, toolbarHtml, mount = graph?.__comicAiCanvasMount) {
  mount?.querySelector?.("[data-canvas-node-action-toolbar]")?.remove?.();
  const node = graph?.getCellById?.(nodeId);
  if (!mount || !node?.isNode?.() || !String(toolbarHtml ?? "").trim() || typeof document === "undefined") {
    return false;
  }
  const template = document.createElement("template");
  template.innerHTML = String(toolbarHtml);
  const toolbar = template.content.firstElementChild;
  if (!toolbar) return false;
  toolbar.dataset.canvasNodeActionToolbar = "true";
  toolbar.dataset.nodeId = String(nodeId);
  toolbar.removeAttribute?.("style");
  toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
  toolbar.addEventListener("mousedown", (event) => event.stopPropagation());
  mount.append(toolbar);
  return positionCanvasNodeActionToolbar(graph, mount);
}

function positionCanvasNodeActionToolbar(graph, mount = graph?.__comicAiCanvasMount) {
  const toolbar = mount?.querySelector?.("[data-canvas-node-action-toolbar]");
  if (!toolbar) return false;
  const bounds = resolveCanvasNodeMountBounds(graph, mount, toolbar.dataset?.nodeId);
  if (!bounds) {
    toolbar.remove?.();
    return false;
  }
  const width = Math.max(1, Number(toolbar.offsetWidth ?? 1));
  const height = Math.max(1, Number(toolbar.offsetHeight ?? 1));
  const centerX = Number(bounds.left ?? 0) + Number(bounds.width ?? 0) / 2;
  const left = Math.max(8, Math.min(Math.max(8, Number(mount.clientWidth ?? 0) - width - 8), centerX - width / 2));
  const top = Math.max(8, Number(bounds.top ?? 0) - height - 8);
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  return true;
}

export function resolveCanvasSelectionActionState(canvasDocument, selectedIds = []) {
  const nodes = Array.isArray(canvasDocument?.nodes) ? canvasDocument.nodes : [];
  const nodeById = new Map(nodes.map((node) => [String(node?.id ?? ""), node]));
  const normalizedIds = [...new Set((Array.isArray(selectedIds) ? selectedIds : [selectedIds])
    .map((nodeId) => String(nodeId ?? "").trim())
    .filter((nodeId) => nodeById.has(nodeId)))];
  const selectedNodes = normalizedIds.map((nodeId) => nodeById.get(nodeId));
  const selectedGroup = selectedNodes.length === 1 && selectedNodes[0]?.type === "group"
    ? selectedNodes[0]
    : null;
  const selectedScript = selectedNodes.length === 1 && selectedNodes[0]?.type === "script"
    ? selectedNodes[0]
    : null;
  const scriptChildren = selectedScript
    ? nodes.filter((node) => String(node?.data?.workflowParentId ?? "") === String(selectedScript.id))
    : [];
  const imageNodeCount = scriptChildren.filter((node) => ["character", "scene", "prop"].includes(String(node?.data?.workflowKind ?? ""))).length;
  const videoNodeCount = scriptChildren.filter((node) => String(node?.data?.workflowKind ?? "") === "storyboard").length;
  const mode = selectedGroup ? "group" : selectedScript ? "script" : selectedNodes.length > 1 ? "selection" : "none";
  const canGroup = mode === "selection" && selectedNodes.every((node) => (
    node?.type !== "group" && !String(node?.parentGroupId ?? "").trim()
  ));
  return {
    visible: mode !== "none",
    mode,
    selectedIds: normalizedIds,
    groupId: String(selectedGroup?.id ?? ""),
    nodeCount: selectedGroup ? canvasGroupChildIds(selectedGroup).length : selectedScript ? scriptChildren.length : selectedNodes.length,
    canGroup,
    ...(selectedScript ? {
      scriptNodeId: String(selectedScript.id ?? ""),
      imageNodeCount,
      videoNodeCount,
    } : {}),
  };
}

export function refreshCanvasSelectionActionToolbar(graph, workbench, mount = graph?.__comicAiCanvasMount) {
  const current = mount?.querySelector?.("[data-canvas-selection-action-toolbar]");
  const currentBackdrop = mount?.querySelector?.("[data-canvas-selection-action-backdrop]");
  if (!graph || !mount || typeof document === "undefined") {
    current?.remove?.();
    currentBackdrop?.remove?.();
    return false;
  }
  const state = resolveCanvasSelectionActionState(
    workbench?.ui?.canvasDocument,
    selectedCanvasWorkflowNodeIds({ canvasGraph: graph }),
  );
  current?.remove?.();
  currentBackdrop?.remove?.();
  if (!state.visible) return false;

  const toolbar = document.createElement("div");
  toolbar.className = `canvas-selection-action-toolbar is-${state.mode}`;
  toolbar.dataset.canvasSelectionActionToolbar = "true";
  toolbar.dataset.nodeIds = JSON.stringify(state.selectedIds);
  toolbar.dataset.groupId = state.groupId;
  if (state.scriptNodeId) toolbar.dataset.scriptNodeId = state.scriptNodeId;
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", state.mode === "group" ? "分组操作" : state.mode === "script" ? "脚本批量生成" : "所选节点操作");
  const count = document.createElement("span");
  count.className = "canvas-selection-action-count";
  count.textContent = state.mode === "script"
    ? `${state.imageNodeCount} 资产 · ${state.videoNodeCount} 分镜`
    : `${state.nodeCount} 个节点`;
  toolbar.append(count);

  if (state.mode === "script") {
    toolbar.append(
      createCanvasSelectionActionButton("open-canvas-script-batch-modal", "批量生成图片", "image", {
        nodeId: state.scriptNodeId,
        batchKind: "image",
        disabled: state.imageNodeCount === 0,
      }),
      createCanvasSelectionActionButton("open-canvas-script-batch-modal", "批量生成视频", "video", {
        nodeId: state.scriptNodeId,
        batchKind: "video",
        disabled: state.videoNodeCount === 0,
      }),
    );
  } else if (state.mode === "group") {
    toolbar.append(
      createCanvasGroupLayoutControl(state.groupId, state.nodeCount === 0),
      createCanvasSelectionActionButton("run-canvas-group", "整组执行", "play", {
        nodeId: state.groupId,
        disabled: state.nodeCount === 0,
      }),
      createCanvasSelectionActionButton("ungroup-canvas-selection", "解除分组", "ungroup", {
        nodeId: state.groupId,
        nodeIds: state.selectedIds,
      }),
      createCanvasSelectionActionButton("download-canvas-selection", "批量下载", "download", {
        nodeId: state.groupId,
        nodeIds: state.selectedIds,
        disabled: state.nodeCount === 0,
      }),
    );
  } else {
    toolbar.append(
      createCanvasSelectionActionButton("group-canvas-selection", "打包成组", "group", {
        nodeIds: state.selectedIds,
        disabled: !state.canGroup,
      }),
      createCanvasSelectionActionButton("download-canvas-selection", "批量下载", "download", {
        nodeIds: state.selectedIds,
      }),
    );
  }
  toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
  toolbar.addEventListener("mousedown", (event) => event.stopPropagation());
  mount.append(toolbar);
  positionCanvasSelectionActionToolbar(graph, mount);
  return true;
}

function createCanvasGroupLayoutControl(groupId, disabled = false) {
  const control = document.createElement("div");
  control.className = "canvas-group-layout-control";
  const toggle = createCanvasSelectionActionButton("toggle-canvas-group-layout-menu", "整理组内节点", "layout", {
    nodeId: groupId,
    disabled,
    iconOnly: true,
  });
  toggle.setAttribute("aria-haspopup", "menu");
  toggle.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "canvas-group-layout-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "整理组内节点");
  [
    ["grid", "宫格排列", "layout"],
    ["horizontal", "水平排列", "horizontal"],
    ["vertical", "垂直排列", "vertical"],
  ].forEach(([layout, label, icon]) => {
    const option = createCanvasSelectionActionButton("arrange-canvas-group", label, icon, {
      nodeId: groupId,
      disabled,
    });
    option.dataset.layout = layout;
    option.setAttribute("role", "menuitem");
    menu.append(option);
  });
  control.append(toggle, menu);
  return control;
}

function createCanvasSelectionActionButton(action, label, icon, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  if (options.nodeId) button.dataset.nodeId = String(options.nodeId);
  if (options.nodeIds) button.dataset.nodeIds = JSON.stringify(options.nodeIds);
  if (options.batchKind) button.dataset.batchKind = String(options.batchKind);
  button.disabled = options.disabled === true;
  button.setAttribute("aria-label", label);
  button.title = label;
  if (options.iconOnly) button.classList.add("is-icon-only");
  button.innerHTML = `${canvasSelectionActionIcon(icon)}${options.iconOnly ? "" : `<span>${label}</span>`}`;
  return button;
}

function canvasSelectionActionIcon(icon) {
  const paths = {
    play: '<path d="m8 5 11 7-11 7V5Z" />',
    group: '<rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />',
    ungroup: '<rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /><path d="M14 7h4v4M10 17H6v-4" />',
    download: '<path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 20h14" />',
    layout: '<rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />',
    horizontal: '<path d="M5 6h14M5 12h14M5 18h14" /><circle cx="3" cy="6" r=".6" fill="currentColor" stroke="none" /><circle cx="3" cy="12" r=".6" fill="currentColor" stroke="none" /><circle cx="3" cy="18" r=".6" fill="currentColor" stroke="none" />',
    vertical: '<path d="M6 5v14M12 5v14M18 5v14" /><circle cx="6" cy="3" r=".6" fill="currentColor" stroke="none" /><circle cx="12" cy="3" r=".6" fill="currentColor" stroke="none" /><circle cx="18" cy="3" r=".6" fill="currentColor" stroke="none" />',
    image: '<rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m5 18 5-5 3 3 2-2 4 4" />',
    video: '<rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2.5v9L17 14" />',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[icon] ?? paths.group}</svg>`;
}

function positionCanvasSelectionActionToolbar(graph, mount = graph?.__comicAiCanvasMount) {
  const toolbar = mount?.querySelector?.("[data-canvas-selection-action-toolbar]");
  const backdrop = mount?.querySelector?.("[data-canvas-selection-action-backdrop]");
  if (!toolbar) return false;
  const scriptNodeId = String(toolbar.dataset?.scriptNodeId ?? "").trim();
  const scriptCell = scriptNodeId ? graph?.getCellById?.(scriptNodeId) : null;
  const cells = scriptCell?.isNode?.() && scriptCell?.getData?.()?.canvasNode?.type === "script"
    ? [scriptCell]
    : resolveCanvasSelectionAnchorCells(
        graph,
        toolbar.dataset?.groupId,
        canvasSelectedGraphCells(graph),
      );
  if (!cells.length) {
    toolbar.remove();
    backdrop?.remove?.();
    return false;
  }
  const selectionBounds = resolveCanvasNodeMountBounds(graph, mount, scriptNodeId, "script")
    ?? resolveCanvasGroupMountBounds(graph, mount, toolbar.dataset?.groupId)
    ?? resolveCanvasSelectionMountBounds(graph, mount, cells);
  if (!selectionBounds) {
    toolbar.remove();
    backdrop?.remove?.();
    return false;
  }
  const width = Math.max(1, Number(toolbar.offsetWidth ?? 1));
  const height = Math.max(1, Number(toolbar.offsetHeight ?? 1));
  const centerX = Number(selectionBounds.left ?? 0) + Number(selectionBounds.width ?? 0) / 2;
  const left = Math.max(8, Math.min(Math.max(8, Number(mount.clientWidth ?? 0) - width - 8), centerX - width / 2));
  const top = resolveCanvasSelectionToolbarTop(selectionBounds.top, 0, height);
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.round(top)}px`;
  if (backdrop?.style) {
    backdrop.style.left = `${Math.round(Number(selectionBounds.left ?? 0))}px`;
    backdrop.style.top = `${Math.round(Number(selectionBounds.top ?? 0))}px`;
    backdrop.style.width = `${Math.max(0, Math.round(Number(selectionBounds.width ?? 0)))}px`;
    backdrop.style.height = `${Math.max(0, Math.round(Number(selectionBounds.height ?? 0)))}px`;
  }
  return true;
}

export function resolveCanvasSelectionAnchorCells(graph, groupId = "", selectedCells = []) {
  const normalizedGroupId = String(groupId ?? "").trim();
  const group = normalizedGroupId ? graph?.getCellById?.(normalizedGroupId) : null;
  return group?.isNode?.() && group?.getData?.()?.canvasNode?.type === "group"
    ? [group]
    : selectedCells;
}

export function resolveCanvasGroupMountBounds(graph, mount, groupId = "") {
  return resolveCanvasNodeMountBounds(graph, mount, groupId, "group");
}

export function resolveCanvasNodeMountBounds(graph, mount, nodeId = "", expectedType = "") {
  const normalizedNodeId = String(nodeId ?? "").trim();
  const node = normalizedNodeId ? graph?.getCellById?.(normalizedNodeId) : null;
  if (!node?.isNode?.() || (expectedType && node?.getData?.()?.canvasNode?.type !== expectedType)) return null;
  const nodeRect = graph.findViewByCell?.(node)?.container?.getBoundingClientRect?.();
  const mountRect = mount?.getBoundingClientRect?.();
  if (!nodeRect || !mountRect || Number(nodeRect.width) <= 0 || Number(nodeRect.height) <= 0) return null;
  const scaleX = Number(mountRect.width) > 0 ? Number(mount.clientWidth ?? mountRect.width) / Number(mountRect.width) : 1;
  const scaleY = Number(mountRect.height) > 0 ? Number(mount.clientHeight ?? mountRect.height) / Number(mountRect.height) : 1;
  return {
    left: (Number(nodeRect.left) - Number(mountRect.left)) * scaleX,
    top: (Number(nodeRect.top) - Number(mountRect.top)) * scaleY,
    width: Number(nodeRect.width) * scaleX,
    height: Number(nodeRect.height) * scaleY,
  };
}

export function resolveCanvasSelectionMountBounds(graph, mount, cells = []) {
  const selectionElement = mount?.querySelector?.(".x6-widget-selection-inner");
  if (Number(selectionElement?.offsetWidth) > 0 && Number(selectionElement?.offsetHeight) > 0) {
    return {
      left: Number(selectionElement.offsetLeft ?? 0),
      top: Number(selectionElement.offsetTop ?? 0),
      width: Number(selectionElement.offsetWidth ?? 0),
      height: Number(selectionElement.offsetHeight ?? 0),
    };
  }
  const boxes = cells.map((cell) => (
    graph.findViewByCell?.(cell)?.getBBox?.({ useCellGeometry: true })
    ?? cell.getBBox?.()
  )).filter(Boolean);
  let bounds = null;
  if (boxes.length) {
    bounds = boxes.reduce((result, box) => ({
      left: Math.min(result.left, Number(box.x ?? 0)),
      top: Math.min(result.top, Number(box.y ?? 0)),
      right: Math.max(result.right, Number(box.x ?? 0) + Number(box.width ?? 0)),
      bottom: Math.max(result.bottom, Number(box.y ?? 0) + Number(box.height ?? 0)),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const clientRect = graph.localToClient?.({
      x: bounds.left - CANVAS_SELECTION_BOUNDS_PADDING,
      y: bounds.top - CANVAS_SELECTION_BOUNDS_PADDING,
      width: bounds.right - bounds.left + CANVAS_SELECTION_BOUNDS_PADDING * 2,
      height: bounds.bottom - bounds.top + CANVAS_SELECTION_BOUNDS_PADDING * 2,
    });
    if (clientRect) {
      const mountRect = mount.getBoundingClientRect?.() ?? { left: 0, top: 0, width: mount.clientWidth, height: mount.clientHeight };
      const scaleX = Number(mountRect.width) > 0 ? Number(mount.clientWidth ?? mountRect.width) / Number(mountRect.width) : 1;
      const scaleY = Number(mountRect.height) > 0 ? Number(mount.clientHeight ?? mountRect.height) / Number(mountRect.height) : 1;
      return {
        left: (Number(clientRect.left ?? clientRect.x ?? 0) - Number(mountRect.left ?? 0)) * scaleX,
        top: (Number(clientRect.top ?? clientRect.y ?? 0) - Number(mountRect.top ?? 0)) * scaleY,
        width: Number(clientRect.width ?? 0) * scaleX,
        height: Number(clientRect.height ?? 0) * scaleY,
      };
    }
  }
  if (!boxes.length) return null;
  return {
    left: Number(bounds.left ?? 0) - CANVAS_SELECTION_BOUNDS_PADDING,
    top: Number(bounds.top ?? 0) - CANVAS_SELECTION_BOUNDS_PADDING,
    width: Number(bounds.right ?? 0) - Number(bounds.left ?? 0) + CANVAS_SELECTION_BOUNDS_PADDING * 2,
    height: Number(bounds.bottom ?? 0) - Number(bounds.top ?? 0) + CANVAS_SELECTION_BOUNDS_PADDING * 2,
  };
}

export function resolveCanvasSelectionToolbarTop(selectionTop, mountTop, toolbarHeight) {
  return Math.max(8, Number(selectionTop ?? 0) - Number(mountTop ?? 0) - Number(toolbarHeight ?? 0) - 12);
}

export function resolveCanvasGraphTranslationRestriction(view) {
  const parent = view?.cell?.getParent?.();
  if (parent?.getData?.()?.canvasNode?.type !== "group") return null;
  return parent.getBBox?.() ?? null;
}

export function constrainCanvasGraphSelectionToGroups(cells = []) {
  const cellsByGroup = new Map();
  for (const cell of Array.isArray(cells) ? cells : []) {
    if (!cell?.isNode?.()) continue;
    const parent = cell.getParent?.();
    if (parent?.getData?.()?.canvasNode?.type !== "group") continue;
    if (!cellsByGroup.has(parent)) cellsByGroup.set(parent, []);
    if (!cellsByGroup.get(parent).includes(cell)) cellsByGroup.get(parent).push(cell);
  }

  let changed = false;
  for (const [group, groupedCells] of cellsByGroup) {
    const groupBounds = group.getBBox?.();
    const boxes = groupedCells.map((cell) => cell.getBBox?.()).filter(Boolean);
    if (!groupBounds || !boxes.length) continue;
    const left = Math.min(...boxes.map((box) => Number(box.x)));
    const top = Math.min(...boxes.map((box) => Number(box.y)));
    const right = Math.max(...boxes.map((box) => Number(box.x) + Number(box.width)));
    const bottom = Math.max(...boxes.map((box) => Number(box.y) + Number(box.height)));
    const groupLeft = Number(groupBounds.x);
    const groupTop = Number(groupBounds.y);
    const groupRight = groupLeft + Number(groupBounds.width);
    const groupBottom = groupTop + Number(groupBounds.height);
    if (![left, top, right, bottom, groupLeft, groupTop, groupRight, groupBottom].every(Number.isFinite)) continue;
    const dx = left < groupLeft ? groupLeft - left : right > groupRight ? groupRight - right : 0;
    const dy = top < groupTop ? groupTop - top : bottom > groupBottom ? groupBottom - bottom : 0;
    if (!dx && !dy) continue;
    groupedCells.forEach((cell) => cell.translate?.(dx, dy, { canvasGroupRestriction: true }));
    changed = true;
  }
  return changed;
}

export function resolveCanvasGraphNodeSelectionZIndex(node) {
  return node?.getData?.()?.canvasNode?.type === "group" ? -1 : 1001;
}

export function alignSelectedCanvasNodes(workbench, axis = "left") {
  const graph = workbench?.canvasGraph;
  const cells = (graph?.getSelectedCells?.() ?? []).filter((cell) => cell?.isNode?.());
  if (!graph || cells.length < 2) return false;
  const boxes = cells.map((cell) => ({ cell, box: cell.getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 } }));
  const bounds = boxes.reduce((acc, item) => ({
    left: Math.min(acc.left, item.box.x),
    top: Math.min(acc.top, item.box.y),
    right: Math.max(acc.right, item.box.x + item.box.width),
    bottom: Math.max(acc.bottom, item.box.y + item.box.height),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  for (const { cell, box } of boxes) {
    const x = axis === "right"
      ? bounds.right - box.width
      : axis === "center"
        ? bounds.left + (bounds.right - bounds.left - box.width) / 2
        : axis === "left"
          ? bounds.left
          : box.x;
    const y = axis === "bottom"
      ? bounds.bottom - box.height
      : axis === "middle"
        ? bounds.top + (bounds.bottom - bounds.top - box.height) / 2
        : axis === "top"
          ? bounds.top
          : box.y;
    if (["left", "right", "center"].includes(axis)) cell.position(x, box.y, { deep: true });
    else cell.position(box.x, y, { deep: true });
  }
  syncCanvasGraphDocument(graph, workbench);
  return true;
}

export function distributeSelectedCanvasNodes(workbench, axis = "horizontal") {
  const graph = workbench?.canvasGraph;
  const cells = (graph?.getSelectedCells?.() ?? []).filter((cell) => cell?.isNode?.());
  if (!graph || cells.length < 3) return false;
  const items = cells.map((cell) => ({ cell, box: cell.getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 } }))
    .sort((a, b) => axis === "vertical" ? a.box.y - b.box.y : a.box.x - b.box.x);
  const first = items[0].box;
  const last = items.at(-1).box;
  const span = axis === "vertical" ? (last.y + last.height) - first.y : (last.x + last.width) - first.x;
  const totalSize = items.reduce((sum, item) => sum + (axis === "vertical" ? item.box.height : item.box.width), 0);
  const gap = (span - totalSize) / (items.length - 1);
  let cursor = axis === "vertical" ? first.y : first.x;
  for (const { cell, box } of items) {
    if (axis === "vertical") cell.position(box.x, cursor, { deep: true });
    else cell.position(cursor, box.y, { deep: true });
    cursor += (axis === "vertical" ? box.height : box.width) + gap;
  }
  syncCanvasGraphDocument(graph, workbench);
  workbench.ui.canvasDistributionAxis = axis === "vertical" ? "vertical" : "horizontal";
  refreshCanvasDistributionGapHandles(graph, workbench, graph.__comicAiCanvasMount);
  return true;
}

export function calculateCanvasDistributionPositions(items = [], axis = "horizontal", requestedGap = 0, adjacentIndex = null) {
  const vertical = axis === "vertical";
  const ordered = items.map((item) => ({
    id: String(item.id ?? ""),
    start: Number(vertical ? item.y : item.x),
    size: Number(vertical ? item.height : item.width),
  })).filter((item) => item.id && Number.isFinite(item.start) && Number.isFinite(item.size))
    .sort((left, right) => left.start - right.start);
  const gap = Math.max(0, Number(requestedGap) || 0);
  if (Number.isInteger(adjacentIndex)) {
    const before = ordered[adjacentIndex];
    const after = ordered[adjacentIndex + 1];
    if (!before || !after) return new Map();
    const currentGap = after.start - (before.start + before.size);
    const delta = gap - currentGap;
    return new Map([
      [before.id, before.start - delta / 2],
      [after.id, after.start + delta / 2],
    ]);
  }
  if (ordered.length < 3) return new Map();
  const extentStart = ordered[0].start;
  const extentEnd = Math.max(...ordered.map((item) => item.start + item.size));
  const totalSize = ordered.reduce((sum, item) => sum + item.size, 0);
  const layoutSize = totalSize + gap * (ordered.length - 1);
  let cursor = (extentStart + extentEnd - layoutSize) / 2;
  return new Map(ordered.map((item) => {
    const entry = [item.id, cursor];
    cursor += item.size + gap;
    return entry;
  }));
}

export function refreshCanvasDistributionGapHandles(graph, workbench, mount) {
  const axis = workbench?.ui?.canvasDistributionAxis;
  const cells = (graph?.getSelectedCells?.() ?? []).filter((cell) => cell?.isNode?.());
  if (!mount) return false;
  if (!["horizontal", "vertical"].includes(axis) || cells.length < 3 || typeof document === "undefined") {
    mount.querySelectorAll?.("[data-canvas-distribution-gap]")?.forEach?.((element) => element.remove());
    return false;
  }
  mount.querySelectorAll?.("[data-canvas-distribution-gap]")?.forEach?.((element) => element.remove());
  const vertical = axis === "vertical";
  const items = cells.map((cell) => ({ cell, box: cell.getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 } }))
    .sort((left, right) => vertical ? left.box.y - right.box.y : left.box.x - right.box.x);
  const mountRect = mount.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  items.slice(0, -1).forEach((item, gapIndex) => {
    const next = items[gapIndex + 1];
    const localPoint = vertical
      ? { x: (item.box.x + item.box.width / 2 + next.box.x + next.box.width / 2) / 2, y: (item.box.y + item.box.height + next.box.y) / 2 }
      : { x: (item.box.x + item.box.width + next.box.x) / 2, y: (item.box.y + item.box.height / 2 + next.box.y + next.box.height / 2) / 2 };
    const clientPoint = graph.localToClient?.(localPoint) ?? localPoint;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `canvas-distribution-gap-handle is-${axis}`;
    handle.dataset.canvasDistributionGap = String(gapIndex);
    handle.dataset.axis = axis;
    handle.setAttribute("aria-label", `${vertical ? "纵向" : "横向"}间距手柄 ${gapIndex + 1}`);
    handle.title = "拖动调整等间距，按住 Shift 仅调整相邻节点";
    handle.style.left = `${Number(clientPoint.x ?? 0) - Number(mountRect.left ?? 0)}px`;
    handle.style.top = `${Number(clientPoint.y ?? 0) - Number(mountRect.top ?? 0)}px`;
    handle.addEventListener("pointerdown", (event) => startCanvasDistributionGapDrag(graph, workbench, mount, items, gapIndex, event));
    mount.append(handle);
  });
  return true;
}

function startCanvasDistributionGapDrag(graph, workbench, mount, items, gapIndex, event) {
  event.preventDefault();
  event.stopPropagation();
  const axis = event.currentTarget?.dataset?.axis === "vertical" ? "vertical" : "horizontal";
  const vertical = axis === "vertical";
  const before = items[gapIndex]?.box;
  const after = items[gapIndex + 1]?.box;
  if (!before || !after) return;
  const startGap = Math.max(0, vertical ? after.y - (before.y + before.height) : after.x - (before.x + before.width));
  const startPointer = vertical ? Number(event.clientY) : Number(event.clientX);
  const zoom = Math.max(0.1, Number(graph.zoom?.() ?? 1));
  const sourceItems = items.map(({ cell, box }) => ({ id: cell.id, ...box }));
  const ownerDocument = mount.ownerDocument ?? document;
  const onMove = (moveEvent) => {
    const pointer = vertical ? Number(moveEvent.clientY) : Number(moveEvent.clientX);
    const requestedGap = Math.max(0, startGap + (pointer - startPointer) / zoom);
    const positions = calculateCanvasDistributionPositions(sourceItems, axis, requestedGap, moveEvent.shiftKey || event.shiftKey ? gapIndex : null);
    for (const { cell, box } of items) {
      if (!positions.has(String(cell.id))) continue;
      if (vertical) cell.position(box.x, positions.get(String(cell.id)), { deep: true });
      else cell.position(positions.get(String(cell.id)), box.y, { deep: true });
    }
  };
  const onEnd = () => {
    ownerDocument.removeEventListener("pointermove", onMove);
    ownerDocument.removeEventListener("pointerup", onEnd);
    ownerDocument.removeEventListener("pointercancel", onEnd);
    syncCanvasGraphDocument(graph, workbench);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
  };
  ownerDocument.addEventListener("pointermove", onMove);
  ownerDocument.addEventListener("pointerup", onEnd);
  ownerDocument.addEventListener("pointercancel", onEnd);
}

function syncCanvasGraphDocument(graph, workbench, options = {}) {
  const previousDocument = workbench.ui.canvasDocument;
  const graphData = synchronizeCanvasGraphGroupGeometry(graph, previousDocument);
  for (const node of graph.getNodes?.() ?? []) {
    const data = node.getData?.() ?? {};
    const canvasNode = data.canvasNode;
    if (!canvasNode || data.canvasTransientEditor === true) continue;
    const position = node.getPosition?.() ?? canvasNode.position ?? {};
    const size = node.getSize?.() ?? canvasNode.size ?? {};
    if (
      Number(canvasNode.position?.x) === Number(position.x)
      && Number(canvasNode.position?.y) === Number(position.y)
      && Number(canvasNode.size?.width) === Number(size.width)
      && Number(canvasNode.size?.height) === Number(size.height)
    ) continue;
    node.setData?.({
      ...data,
      canvasNode: {
        ...canvasNode,
        position: { x: Number(position.x), y: Number(position.y) },
        size: { width: Number(size.width), height: Number(size.height) },
      },
    }, { overwrite: true, silent: true });
  }
  const storedInteractionMode = graph.__comicAiCanvasInteractionMode;
  const interactionMode = ["hand", "classic"].includes(storedInteractionMode)
    ? storedInteractionMode
    : storedInteractionMode === "default"
      ? "default"
      : ["hand", "classic"].includes(previousDocument?.viewport?.interactionMode)
        ? previousDocument.viewport.interactionMode
        : "default";
  const syncedDocument = canvasDocumentFromX6Data(graphData, previousDocument);
  const nextDocument = {
    ...syncedDocument,
    viewport: {
      ...(syncedDocument.viewport ?? {}),
      interactionMode,
    },
  };
  applyCanvasGraphGrouping(graph, nextDocument);
  if (typeof workbench.updateCanvasDocument === "function") {
    workbench.updateCanvasDocument(nextDocument, options);
  } else {
    workbench.ui.canvasDocument = nextDocument;
  }
  graph.__comicAiCanvasDocument = nextDocument;
  return nextDocument;
}

export function flushCanvasGraphDocument(graph, workbench) {
  if (!graph || !workbench?.ui?.canvasDocument) return null;
  return syncCanvasGraphDocument(graph, workbench, { scheduleSave: false });
}

export function synchronizeCanvasGraphGroupGeometry(graph, previousDocument = {}) {
  const positionedGraphData = preserveCanvasGroupChildOffsets(
    readCanvasWorkflowGraphData(graph),
    previousDocument,
  );
  for (const node of positionedGraphData.nodes ?? []) {
    if (!node?.parent) continue;
    const cell = graph.getCellById?.(node.id);
    const parent = graph.getCellById?.(node.parent);
    if (parent && parent !== cell) ensureCanvasGraphChildEmbedding(parent, cell, { silent: true, canvasGroupMove: true });
    const position = cell?.getPosition?.() ?? {};
    if (Number(position.x) === Number(node.x) && Number(position.y) === Number(node.y)) continue;
    cell?.setPosition?.(Number(node.x), Number(node.y), { silent: true, canvasGroupMove: true });
  }
  resizeCanvasGraphGroupCells(graph, { silent: true });
  return readCanvasWorkflowGraphData(graph);
}

export function preserveCanvasGroupChildOffsets(graphData = {}, previousDocument = {}) {
  const nextGraphData = structuredCloneSafe(graphData);
  const previousNodes = new Map((previousDocument?.nodes ?? []).map((node) => [String(node?.id ?? ""), node]));
  const groupOffsets = new Map();
  for (const node of nextGraphData.nodes ?? []) {
    const previousNode = previousNodes.get(String(node?.id ?? ""));
    if (previousNode?.type !== "group") continue;
    const deltaX = Number(node?.x ?? previousNode.position?.x ?? 0) - Number(previousNode.position?.x ?? 0);
    const deltaY = Number(node?.y ?? previousNode.position?.y ?? 0) - Number(previousNode.position?.y ?? 0);
    if (deltaX || deltaY) groupOffsets.set(String(node.id), { deltaX, deltaY });
  }
  for (const node of nextGraphData.nodes ?? []) {
    const previousNode = previousNodes.get(String(node?.id ?? ""));
    const parentGroupId = String(node?.parent || previousNode?.parentGroupId || "");
    if (!node?.parent && parentGroupId) node.parent = parentGroupId;
    const offset = groupOffsets.get(parentGroupId);
    if (!offset || !previousNode || previousNode.type === "group") continue;
    node.x = Number(previousNode.position?.x ?? 0) + offset.deltaX;
    node.y = Number(previousNode.position?.y ?? 0) + offset.deltaY;
  }
  return nextGraphData;
}

export function selectCanvasNodeFromGraph(workbench, nodeId) {
  if (!nodeId) {
    return;
  }
  if (
    nodeId === workbench.ui.selectedCanvasNodeId
    && workbench.ui.canvasEditorOpen === true
  ) {
    return;
  }
  workbench.ui.selectedCanvasNodeId = nodeId;
  workbench.onCanvasNodeSelected?.(nodeId);
}

function selectCurrentCanvasNode(graph, workbench) {
  if (workbench?.ui?.canvasDocument?.viewport?.interactionMode === "hand") {
    graph.getPlugin?.("selection")?.clean?.();
    graph.unselectAll?.();
    return;
  }
  const nodeId = workbench?.ui?.selectedCanvasNodeId;
  const cell = nodeId ? graph.getCellById?.(nodeId) : null;
  if (cell?.isNode?.() && typeof graph.select === "function") {
    if (cell.getData?.()?.canvasNode?.type === "group") {
      selectCanvasGraphNodeExclusively(graph, cell.id);
      return;
    }
    const selectedCells = canvasSelectedGraphCells(graph);
    const selectedIds = selectedCells.map((selectedCell) => String(selectedCell?.id ?? ""));
    if (!selectedIds.includes(String(cell.id))) {
      const selection = graph.getPlugin?.("selection");
      if (typeof selection?.reset === "function") {
        selection.reset([cell], { batch: true });
        return;
      }
      selection?.clean?.();
      graph.unselectAll?.();
    }
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

export function readCanvasWorkflowGraphData(graph) {
  return {
    nodes: graph.getNodes().filter((node) => node.getData?.()?.canvasTransientEditor !== true).map((node) => {
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
        parent: node.getParentId?.() ?? null,
        children: (node.getChildren?.() ?? []).map((child) => String(child?.id ?? "")).filter(Boolean),
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
