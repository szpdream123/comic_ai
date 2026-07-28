import { createDefaultCanvasDocument } from "./canvas-default-document.js";
import { validateCanvasConnection } from "./canvas-edge-rules.js";
import { duplicateCanvasNodes } from "./canvas-state.js";
import { renderCanvasAnimationNodeBody } from "./canvas-animation-node.js";
import { renderCanvasDirectorNodeBody } from "./canvas-director-node.js";
import { renderCanvasGroupNodeBody } from "./canvas-group-node.js";
import { renderCanvasMediaNodeBody } from "./canvas-media-node.js";
import {
  renderCanvasPanoramaNodeBody,
  renderCanvasStoryboardNodeBody,
} from "../../new-canvas/special-media-nodes.js";
import {
  canvasDocumentFromX6Data,
  canvasDocumentToX6Data,
} from "./canvas-x6-document.js";

const X6_VENDOR_SRC = "/vendor/@antv/x6/dist/x6.min.js";
const X6_READY_KEY = "__comicAiX6Ready";
const CANVAS_EDITOR_OVERLAY_ID = "__comic-ai-canvas-editor-overlay__";
const CANVAS_CONNECTION_SNAP_RADIUS = 28;
const CANVAS_VIEWPORT_COMMIT_DELAY_MS = 80;
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

    const canvasDocument = ensureCanvasDocument(workbench);
    const graphSize = await waitForCanvasGraphMountSize(mount);
    bindCanvasNativeNodeSelection(mount, workbench);
    const graph = createGraph(X6, mount, workbench, graphSize);
    enableCanvasGraphSelection(X6, graph, canvasDocument.viewport);
    graph.__comicAiCanvasMount = mount;
    mirrorX6StylesIntoRoot(mount);
    graph.fromJSON(canvasDocumentToX6Data(canvasDocument));
    graph.__comicAiCanvasDocument = canvasDocument;
    applyCanvasGraphEdgeStyle(graph, workbench?.ui?.canvasEdgeStyle);
    applyCanvasGraphEdgeVisibility(graph, workbench?.ui?.canvasEdgesHidden !== true);
    applyCanvasGraphViewportPreferences(graph, canvasDocument.viewport);
    applyCanvasGraphGrouping(graph, canvasDocument);
    applyInitialViewport(graph, canvasDocument.viewport);

    wireGraphSync(graph, workbench, mount);
    selectCurrentCanvasNode(graph, workbench);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
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
  mount.__comicAiCanvasNodeSelectionBound = true;
  return true;
}

export function enableCanvasGraphSelection(X6, graph, viewport = {}) {
  if (!graph?.use || typeof X6?.Selection !== "function") {
    return false;
  }
  if (graph.getPlugin?.("selection")) {
    return true;
  }
  const graphContainer = graph.container ?? graph.options?.container;
  let rubberbandStart = null;
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
      const scaleX = Number(rect.width) > 0 ? Number(graphContainer.clientWidth ?? rect.width) / Number(rect.width) : 1;
      graphContainer.style?.setProperty?.("--comic-ai-canvas-selection-zoom", String(scaleX));
      const offsetX = Number(event.clientX) - Number(rect.left ?? 0);
      const offsetY = Number(event.clientY) - Number(rect.top ?? 0);
      try {
        Object.defineProperties(event, {
          offsetX: { configurable: true, value: offsetX },
          offsetY: { configurable: true, value: offsetY },
        });
      } catch {
        // Browser event offsets may be non-configurable; X6 can still use its native fallback.
      }
    };
    graphContainer.addEventListener("mousedown", normalizePointerOffset, true);
    graphContainer.addEventListener("pointerdown", normalizePointerOffset, true);
    graphContainer.__comicAiCanvasPointerOffsetBound = true;
  }
  const selection = new X6.Selection({
    enabled: true,
    multiple: true,
    rubberband: true,
    showNodeSelectionBox: true,
    filter: (cell) => cell?.getData?.()?.canvasTransientEditor !== true,
  });
  graph.use(selection);
  selection.on?.("box:mouseup", ({ e } = {}) => {
    const start = rubberbandStart;
    rubberbandStart = null;
    const endX = Number(e?.clientX);
    const endY = Number(e?.clientY);
    if (!start || !Number.isFinite(endX) || !Number.isFinite(endY)) return;
    const clientRect = {
      x: Math.min(start.x, endX),
      y: Math.min(start.y, endY),
      width: Math.abs(endX - start.x),
      height: Math.abs(endY - start.y),
    };
    if (clientRect.width <= 4 && clientRect.height <= 4) return;
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
  });
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
    width: Math.max(0, Number(rect.width ?? 0) || Number(parentRect.width ?? 0) || 0),
    height: Math.max(0, Number(rect.height ?? 0) || Number(parentRect.height ?? 0) || 0),
  };
}

async function waitForCanvasGraphMountSize(mount) {
  let size = resolveCanvasGraphMountSize(mount);
  for (let frame = 0; frame < 12 && (!size.width || !size.height); frame += 1) {
    await new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(resolve);
      else window.setTimeout(resolve, 16);
    });
    size = resolveCanvasGraphMountSize(mount);
  }
  return size;
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
  return wrapper;
}

function createCanvasSpecialMediaX6Node(node = {}) {
  if (typeof document === "undefined") {
    return renderCanvasSpecialMediaX6Node(node);
  }
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderCanvasSpecialMediaX6Node(node);
  const element = wrapper.firstElementChild;
  element?.addEventListener("click", () => {
    element.dispatchEvent(new CustomEvent("comic-ai-canvas-node-select", {
      bubbles: true,
      composed: true,
      detail: { nodeId: String(node?.id ?? "") },
    }));
  });
  return element ?? wrapper;
}

export function resolveCanvasHtmlShape(X6) {
  return X6?.HTML ?? X6?.Shape?.HTML ?? null;
}

function renderCanvasSpecialMediaX6Node(node = {}) {
  const requestedType = String(node?.type ?? "");
  const specialType = [
    "ai-animation", "ai-storyboard", "ai-director", "group", "video", "ai-video", "source-video", "audio", "ai-audio", "source-audio",
  ].includes(requestedType) ? requestedType : requestedType === "ai-panorama" ? "ai-panorama" : "generic";
  if (specialType === "generic") return renderCanvasGenericX6Node(node);
  const type = specialType;
  const title = node?.data?.title ?? ({
    "ai-animation": "AI 动画",
    "ai-storyboard": "AI 分镜",
    "ai-director": "AI 导演",
    video: "视频",
    "ai-video": "AI 视频",
    "source-video": "视频源",
    audio: "音频",
    "ai-audio": "AI 音频",
    "source-audio": "音频源",
    group: "节点分组",
    "ai-panorama": "AI 全景",
  })[type];
  const body = type === "ai-animation"
    ? renderCanvasAnimationNodeBody(node)
    : type === "ai-storyboard"
      ? renderCanvasStoryboardNodeBody(node)
      : type === "ai-director"
        ? renderCanvasDirectorNodeBody(node)
        : type === "group"
          ? renderCanvasGroupNodeBody(node)
          : ["video", "ai-video", "source-video", "audio", "ai-audio", "source-audio"].includes(type)
            ? renderCanvasMediaNodeBody(node)
            : renderCanvasPanoramaNodeBody(node);
  const badge = ({
    "ai-animation": "SPRITE",
    "ai-storyboard": "STORYBOARD",
    "ai-director": "DIRECTOR",
    video: "VIDEO",
    "ai-video": "VIDEO",
    "source-video": "VIDEO",
    audio: "AUDIO",
    "ai-audio": "AUDIO",
    "source-audio": "AUDIO",
    group: "GROUP",
  })[type] ?? "360 VIEW";
  if (type === "group") {
    return `<article class="canvas-x6-special-node is-group" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">${body}</article>`;
  }
  return `<article class="canvas-x6-special-node is-${type}" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">
    <header><strong>${escapeCanvasX6Html(title)}</strong><small>${badge}</small></header>
    ${body}
  </article>`;
}

function renderCanvasGenericX6Node(node = {}) {
  const title = String(node?.data?.title ?? node?.data?.name ?? canvasGenericNodeLabel(node?.type) ?? "节点");
  const status = String(node?.data?.status ?? "idle");
  const summary = String(
    node?.data?.summary
      ?? node?.data?.prompt
      ?? node?.data?.text
      ?? node?.data?.description
      ?? "选择节点后配置内容",
  ).trim();
  const inputCount = Array.isArray(node?.data?.ports?.inputs) ? node.data.ports.inputs.length : 0;
  const outputCount = Array.isArray(node?.data?.ports?.outputs) ? node.data.ports.outputs.length : 0;
  return `<article class="canvas-x6-special-node is-generic is-${escapeCanvasX6Html(node?.type ?? "node")}" data-node-id="${escapeCanvasX6Html(node?.id ?? "")}">
    <header><strong>${escapeCanvasX6Html(title)}</strong><small>${escapeCanvasX6Html(status)}</small></header>
    <div class="canvas-x6-generic-body">
      <span>${escapeCanvasX6Html(canvasGenericNodeLabel(node?.type))}</span>
      <p>${escapeCanvasX6Html(summary || "选择节点后配置内容")}</p>
    </div>
    <footer><span>${inputCount} 个输入</span><span>${outputCount} 个输出</span></footer>
  </article>`;
}

function canvasGenericNodeLabel(type) {
  return ({
    "ai-text": "AI 文本", "ai-image": "AI 图片", "ai-audio": "AI 音频", "ai-markdown": "AI Markdown",
    "source-text": "文本源", "source-image": "图片源", upload: "上传", text: "文本", image: "图片结果",
    markdown: "Markdown", comment: "评论", script: "剧本源", send: "生成节点", shape: "形状",
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
  if (graph.__comicAiCanvasDocument === document) {
    applyCanvasGraphInteractionMode(graph, document.viewport);
    applyCanvasGraphEdgeStyle(graph, workbench?.ui?.canvasEdgeStyle);
    applyCanvasGraphEdgeVisibility(graph, workbench?.ui?.canvasEdgesHidden !== true);
    applyCanvasGraphViewportPreferences(graph, document.viewport);
    applyCanvasGraphGrouping(graph, document);
    selectCurrentCanvasNode(graph, workbench);
    return true;
  }
  const previousNodes = new Map((graph.getNodes?.() ?? []).map((cell) => [
    String(cell?.id ?? ""),
    cell?.getData?.()?.canvasNode ?? null,
  ]));
  const transientEditor = graph.getCellById?.(CANVAS_EDITOR_OVERLAY_ID)?.getData?.() ?? null;
  const nextData = canvasDocumentToX6Data(document);
  applyCanvasGraphInteractionMode(graph, document.viewport);
  graph.fromJSON(nextData);
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
  for (const node of nextData.nodes) {
    const motion = classifyCanvasNodeMotion(previousNodes.get(String(node.id)), node?.data?.canvasNode);
    if (motion) applyCanvasNodeMotion(graph, node.id, motion);
  }
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
  const previousNode = cell.getData()?.canvasNode ?? null;
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
  const x6Nodes = canvasDocumentToX6Data(canvasDocument).nodes;
  const expectedParentByChild = new Map(x6Nodes
    .filter((node) => node.parent)
    .map((node) => [String(node.id), String(node.parent)]));
  const options = { silent: true };

  for (const node of x6Nodes) {
    const cell = graph.getCellById(node.id);
    if (!cell) continue;
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
    const parentChildren = parent.getChildren?.() ?? [];
    if (currentParentId !== expectedParentId || !parentChildren.some((child) => child?.id === cell.id)) {
      parent.addChild?.(cell, options);
    }
  }
  return true;
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
  const interactions = resolveCanvasGraphInteractionOptions(viewport);
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
    background: { color: "transparent" },
    grid: {
      size: 20,
      visible: viewport.gridVisible !== false,
      type: "dot",
      args: { color: "rgba(129, 146, 152, 0.18)", thickness: 1 },
    },
    ...interactionOptions,
    translating: { autoOffset: true },
    embedding: {
      enabled: true,
      findParent: "bbox",
      frontOnly: false,
      validate({ child, parent }) {
        return canEmbedCanvasGraphNode(child, parent);
      },
    },
    snapline: {
      enabled: viewport.snapEnabled !== false,
      sharp: true,
    },
    keyboard: { enabled: true, global: false },
    history: { enabled: true },
    connecting: {
      allowBlank: false,
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
        return this.createEdge({
          attrs: buildEdgeAttrs("idle"),
          zIndex: 1,
        });
      },
      validateConnection({ sourceCell, targetCell, sourcePort, targetPort }) {
        const source = resolveCanvasGraphConnectionPort(sourceCell, sourcePort, "out");
        const target = resolveCanvasGraphConnectionPort(targetCell, targetPort, "in");
        return validateCanvasConnection(source, target).ok;
      },
    },
  });
}

function wireGraphSync(graph, workbench, mount) {
  const sync = (options = {}) => {
    syncCanvasGraphDocument(graph, workbench);
    if (options.clearToast) {
      workbench.ui.toast = "";
    }
  };
  let selectionMovePending = false;
  let viewportCommitTimer = null;
  let viewportFrame = null;
  let graphSyncPending = false;
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis)
    ?? ((callback) => globalThis.setTimeout?.(callback, 16));
  const scheduleGraphSync = () => {
    if (graphSyncPending) return;
    graphSyncPending = true;
    requestFrame(() => {
      globalThis.setTimeout?.(() => {
        graphSyncPending = false;
        sync();
      }, 0);
    });
  };
  const scheduleViewportSync = ({ panning = false } = {}) => {
    const stage = mount?.closest?.(".canvas-stage");
    if (panning) stage?.classList?.add?.("is-panning");
    if (viewportFrame == null) {
      viewportFrame = requestFrame(() => {
        viewportFrame = null;
        applyCanvasGraphViewportStyles(graph, workbench);
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
  const syncMovedNodeEditor = ({ node }) => syncCanvasGraphEditorOverlay(graph, node);
  graph.on("node:change:position", (event) => {
    syncMovedNodeEditor(event);
    if (event?.options?.selection) selectionMovePending = true;
  });
  graph.on("node:moved", (event) => {
    syncMovedNodeEditor(event);
    sync({ clearToast: true });
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
  });
  graph.on("node:resized", () => sync({ clearToast: true }));
  graph.on("translate", () => scheduleViewportSync({ panning: true }));
  graph.on("scale", () => scheduleViewportSync());
  graph.on("edge:connected", (event = {}) => {
    if (workbench.ui.canvasEdgesHidden === true) event.edge?.hide?.();
    scheduleGraphSync();
  });
  graph.on("edge:removed", scheduleGraphSync);
  graph.on("cell:change:data", sync);
  graph.on("cell:removed", ({ cell } = {}) => {
    if (cell?.getData?.()?.canvasTransientEditor === true) return;
    sync();
  });
  const selectGraphNode = (node) => {
    if (node?.getData?.()?.canvasTransientEditor === true) return;
    node?.setZIndex?.(1001);
    graph.getCellById?.(CANVAS_EDITOR_OVERLAY_ID)?.setZIndex?.(1002);
    if (
      String(node?.id ?? "") === String(workbench.ui.selectedCanvasNodeId ?? "")
      && workbench.ui.canvasEditorOpen === true
      && !graph.getCellById?.(CANVAS_EDITOR_OVERLAY_ID)
    ) {
      workbench.onCanvasNodeSelected?.(node.id);
      return;
    }
    selectCanvasNodeFromGraph(workbench, node?.id);
  };
  graph.on("node:click", ({ node }) => selectGraphNode(node));
  graph.on("node:mouseup", ({ node }) => selectGraphNode(node));
  graph.on("cell:click", ({ cell }) => {
    if (cell?.isNode?.()) selectGraphNode(cell);
  });
  graph.on("node:mousedown", ({ node, e }) => {
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
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
  });
  graph.on("selection:changed", ({ added = [] } = {}) => {
    const selectedNode = added.find((cell) => cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true);
    selectCanvasNodeFromGraph(workbench, selectedNode?.id);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
  });
  graph.getPlugin?.("selection")?.on?.("selection:changed", ({ added = [] } = {}) => {
    const selectedNode = added.find((cell) => cell?.isNode?.() && cell?.getData?.()?.canvasTransientEditor !== true);
    selectCanvasNodeFromGraph(workbench, selectedNode?.id);
    refreshCanvasDistributionGapHandles(graph, workbench, mount);
  });
  graph.getPlugin?.("selection")?.on?.("box:mouseup", () => {
    if (selectionMovePending) {
      selectionMovePending = false;
      sync({ clearToast: true });
    }
  });
  graph.on("cell:unselected", () => refreshCanvasDistributionGapHandles(graph, workbench, mount));
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

export function mountCanvasGraphEditorOverlay(graph, nodeId, editorHtml) {
  const parent = graph?.getCellById?.(nodeId);
  if (!parent?.isNode?.() || !editorHtml || !graph?.addNode) return false;
  clearCanvasGraphEditorOverlay(graph);
  const size = parent.getSize?.() ?? { width: 360, height: 170 };
  const position = parent.getPosition?.() ?? { x: 0, y: 0 };
  const editorSize = { width: 600, height: 220 };
  const editor = graph.addNode({
    id: CANVAS_EDITOR_OVERLAY_ID,
    shape: "comic-ai-canvas-editor-overlay",
    x: position.x + (size.width - editorSize.width) / 2,
    y: position.y + size.height,
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
  editor.position?.(position.x + (size.width - editorSize.width) / 2, position.y + size.height);
  return true;
}

export function normalizeCanvasEdgeStyle(value) {
  return String(value ?? "curve") === "orthogonal" ? "orthogonal" : "curve";
}

export function applyCanvasGraphEdgeStyle(graph, value) {
  if (!graph?.getEdges) return false;
  const style = normalizeCanvasEdgeStyle(value);
  for (const edge of graph.getEdges()) {
    if (style === "curve") {
      edge.setRouter?.("normal", {}, { silent: true });
      edge.setConnector?.("smooth", {}, { silent: true });
    } else {
      edge.setRouter?.("orth", { padding: 26 }, { silent: true });
      edge.setConnector?.("rounded", { radius: 12 }, { silent: true });
    }
  }
  return true;
}

export function applyCanvasGraphEdgeVisibility(graph, visible = true) {
  if (!graph?.getEdges) return false;
  for (const edge of graph.getEdges()) {
    if (visible) edge.show?.();
    else edge.hide?.();
    edge.setVisible?.(visible, { silent: true });
  }
  return true;
}

export function applyCanvasGraphViewportPreferences(graph, viewport = {}) {
  if (!graph) return false;
  const snapEnabled = viewport.snapEnabled !== false;
  const gridVisible = viewport.gridVisible !== false;
  if (graph.options?.snapline) graph.options.snapline.enabled = snapEnabled;
  if (graph.options?.connecting) {
    graph.options.connecting.snap = { radius: CANVAS_CONNECTION_SNAP_RADIUS, anchor: "center" };
  }
  const snapline = graph.getPlugin?.("snapline");
  if (snapEnabled) snapline?.enable?.();
  else snapline?.disable?.();
  if (gridVisible) graph.showGrid?.();
  else graph.hideGrid?.();
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
  if (!event.isNew || event.type !== "target" || event.currentCell || !event.currentPoint) return null;
  const source = event.edge?.getSource?.() ?? event.edge?.source ?? {};
  const sourceNodeId = String(source?.cell ?? "");
  const sourcePortId = String(source?.port ?? "");
  if (!sourceNodeId || !sourcePortId) return null;
  return {
    sourceNodeId,
    sourcePortId,
    canvasX: Number(event.currentPoint.x ?? 0),
    canvasY: Number(event.currentPoint.y ?? 0),
  };
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
  if (typeof workbench.updateCanvasDocument === "function") {
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
  const stage = workbench.root?.querySelector?.(".canvas-stage");
  if (stage?.classList?.contains?.("is-x6-ready")) return true;
  const translation = viewport ?? graph?.translate?.() ?? {};
  const zoom = Number(viewport?.zoom ?? graph?.zoom?.() ?? 1);
  const x = Number(viewport?.x ?? translation.tx ?? 0);
  const y = Number(viewport?.y ?? translation.ty ?? 0);
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 1;
  const flow = workbench.root?.querySelector?.(".canvas-flow");
  flow?.style?.setProperty?.("--canvas-pan-x", `${x}px`);
  flow?.style?.setProperty?.("--canvas-pan-y", `${y}px`);
  flow?.style?.setProperty?.("--canvas-zoom", String(normalizedZoom));
  flow?.style?.setProperty?.("--canvas-toolbar-scale", String(1 / Math.max(0.1, normalizedZoom)));
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
  return (workbench?.canvasGraph?.getSelectedCells?.() ?? [])
    .filter((cell) => cell?.isNode?.())
    .map((cell) => String(cell.id ?? ""))
    .filter(Boolean);
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

function syncCanvasGraphDocument(graph, workbench) {
  const graphData = readCanvasWorkflowGraphData(graph);
  const nextDocument = canvasDocumentFromX6Data(graphData, workbench.ui.canvasDocument);
  if (typeof workbench.updateCanvasDocument === "function") {
    workbench.updateCanvasDocument(nextDocument);
  } else {
    workbench.ui.canvasDocument = nextDocument;
  }
  graph.__comicAiCanvasDocument = nextDocument;
  return nextDocument;
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
