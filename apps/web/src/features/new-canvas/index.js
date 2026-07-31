import { renderCanvasSurfaceForHost } from "../production-workbench/project-detail.js";
import {
  applyCanvasGraphInteractionMode,
  applyCanvasGraphViewportPreferences,
  clearCanvasGraphEditorOverlay,
  mountCanvasGraphEditorOverlay,
  mountCanvasWorkflowIfPresent,
  refreshCanvasWorkflowGraph,
  refreshCanvasWorkflowNode,
  syncCanvasGraphViewport,
  syncCanvasZoomControlDisplay,
} from "../production-workbench/canvas/canvas-x6-graph.js";
import {
  arrangeCanvasDocumentOnGrid,
  updateCanvasNodeData,
} from "../production-workbench/canvas/canvas-state.js";
import {
  bindCanvasMediaControlPointerGuards,
  decodeCanvasAudioWaveform,
  drawCanvasAudioWaveform,
} from "../production-workbench/canvas/canvas-media-node.js";
import {
  createCanvasAgentController,
  resolveCanvasAgentPanelMaxWidth,
  renderNewCanvasLayout,
} from "./canvas-agent-panel.js";
import {
  createCanvasConfigLibraryController,
  renderCanvasConfigLibraryShell,
} from "./config-library-drawer.js";
import { createDirectorDeskOverlay } from "./director-desk-overlay.js";
import {
  createCanvasMediaToolsController,
  renderCanvasMediaToolsShell,
} from "./media-tools-drawer.js";
import {
  createCanvasMinimapController,
  renderCanvasMinimap,
} from "./canvas-minimap.js";
import {
  createCanvasCharacterLibraryController,
  renderCanvasCharacterLibraryShell,
} from "./character-library-drawer.js";
import {
  applyCanvasPanoramaDrag,
  applyCanvasPanoramaZoom,
  normalizeCanvasPanoramaView,
} from "./special-media-nodes.js";
import { createCanvasPanoramaViewerController } from "./canvas-panorama-viewer.js";

const DEFAULT_STYLE_HREFS = [
  "/src/features/production-workbench/production-workbench.css",
  "/src/features/new-canvas/new-canvas.css",
];
export const CANVAS_ASSET_DRAG_TYPE = "application/x-comic-ai-canvas-asset";
export const CANVAS_STORYBOARD_CELL_DRAG_TYPE = "application/x-comic-ai-canvas-storyboard-cell";
const instances = new WeakMap();
const canvasAudioWaveformCache = new Map();
const CANVAS_AGENT_PANEL_MIN_WIDTH = 300;
const CANVAS_STYLE_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000, 8_000];

function isCanvasNodeInteractiveTarget(event) {
  const path = event.composedPath?.() ?? [];
  if (
    path.some((candidate) => candidate?.classList?.contains?.("canvas-node-editor"))
    || event.target?.closest?.(".canvas-node-editor")
  ) {
    return true;
  }
  const nodeIndex = path.findIndex((candidate) => candidate?.classList?.contains?.("canvas-x6-special-node"));
  if (nodeIndex >= 0) {
    return path.slice(0, nodeIndex).some((candidate) =>
      candidate?.matches?.("button, input, textarea, select, a, [role='application']"));
  }
  const node = event.target?.closest?.(".canvas-x6-special-node");
  const interactive = event.target?.closest?.("button, input, textarea, select, a, [role='application']");
  return Boolean(node && interactive && node.contains?.(interactive));
}

export function createCanvasStoryboardCellDragPayload(nodeId, cellIndex) {
  const normalizedNodeId = String(nodeId ?? "").trim();
  const normalizedCellIndex = Number(cellIndex);
  if (!normalizedNodeId || !Number.isInteger(normalizedCellIndex) || normalizedCellIndex < 0) return "";
  return JSON.stringify({ nodeId: normalizedNodeId, cellIndex: normalizedCellIndex });
}

export function parseCanvasStoryboardCellDragPayload(value) {
  try {
    const payload = JSON.parse(String(value ?? ""));
    const nodeId = String(payload?.nodeId ?? "").trim();
    const cellIndex = Number(payload?.cellIndex);
    return nodeId && Number.isInteger(cellIndex) && cellIndex >= 0 ? { nodeId, cellIndex } : null;
  } catch {
    return null;
  }
}

export function disposeCanvasGraph(graph) {
  if (!graph) return false;
  graph.off?.();
  graph.clearCells?.({ silent: true });
  graph.dispose?.();
  return true;
}

export function canvasDropPosition(stage, clientX, clientY, viewport = {}) {
  const rect = stage?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const zoom = Math.max(0.1, Number(viewport.zoom ?? 1) || 1);
  return {
    x: Math.round((Number(clientX) - Number(rect.left ?? 0) - Number(viewport.x ?? 0)) / zoom),
    y: Math.round((Number(clientY) - Number(rect.top ?? 0) - Number(viewport.y ?? 0)) / zoom),
  };
}

function resolveTarget(target) {
  if (target == null && typeof document !== "undefined") {
    return document.querySelector("[data-new-canvas-mount]");
  }
  if (typeof target === "string" && typeof document !== "undefined") {
    return document.querySelector(target);
  }
  return target && typeof target === "object" ? target : null;
}

function normalizeStyleHrefs(styleHrefs) {
  const values = Array.isArray(styleHrefs) ? styleHrefs : DEFAULT_STYLE_HREFS;
  return [...new Set(values.map((href) => String(href ?? "").trim()).filter(Boolean))];
}

function appendStyles(shadowRoot, styleHrefs) {
  const fragment = document.createDocumentFragment();
  const criticalStyle = document.createElement("style");
  criticalStyle.dataset.newCanvasCriticalStyle = "true";
  criticalStyle.textContent = `
    :host { display: block; min-height: 100%; background: #08111b; }
    .new-canvas-root { visibility: hidden !important; }
    [data-new-canvas-style-gate] { display: grid; grid-template-columns: 4rem minmax(0, 1fr) minmax(12rem, 18rem); gap: .75rem; min-height: calc(100dvh - 6rem); padding: .75rem; box-sizing: border-box; }
    [data-new-canvas-style-gate] > span { min-width: 0; border: 1px solid rgba(255, 255, 255, .06); border-radius: 6px; background: rgba(255, 255, 255, .035); }
  `;
  const loadingGate = document.createElement("div");
  loadingGate.dataset.newCanvasStyleGate = "true";
  loadingGate.setAttribute("role", "status");
  loadingGate.setAttribute("aria-label", "正在加载画布");
  loadingGate.innerHTML = "<span></span><span></span><span></span>";
  fragment.append(criticalStyle);
  fragment.append(loadingGate);
  const links = [];
  const pendingLinks = new Set();
  const retryTimers = new Set();
  let disposed = false;
  const revealWhenReady = () => {
    if (!disposed && pendingLinks.size === 0) {
      criticalStyle.remove();
      loadingGate.remove();
    }
  };
  const retryHref = (href, attempt) => {
    try {
      const url = new URL(href, document.baseURI);
      url.searchParams.set("new-canvas-style-retry", String(attempt));
      return url.toString();
    } catch {
      return `${href}${href.includes("?") ? "&" : "?"}new-canvas-style-retry=${attempt}`;
    }
  };
  for (const href of normalizeStyleHrefs(styleHrefs)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.newCanvasStyle = "true";
    pendingLinks.add(link);
    let retryAttempt = 0;
    const loaded = () => {
      pendingLinks.delete(link);
      revealWhenReady();
    };
    const retry = () => {
      if (disposed) {
        return;
      }
      retryAttempt += 1;
      const delayIndex = Math.min(retryAttempt - 1, CANVAS_STYLE_RETRY_DELAYS_MS.length - 1);
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        if (!disposed) {
          link.href = retryHref(href, retryAttempt);
        }
      }, CANVAS_STYLE_RETRY_DELAYS_MS[delayIndex]);
      retryTimers.add(timer);
    };
    link.addEventListener("load", loaded);
    link.addEventListener("error", retry);
    links.push({ link, loaded, retry });
    fragment.append(link);
  }
  shadowRoot.append(fragment);
  revealWhenReady();
  return () => {
    disposed = true;
    for (const timer of retryTimers) {
      clearTimeout(timer);
    }
    retryTimers.clear();
    for (const { link, loaded, retry } of links) {
      link.removeEventListener("load", loaded);
      link.removeEventListener("error", retry);
    }
    criticalStyle.remove();
    loadingGate.remove();
  };
}

function createSurface(shadowRoot) {
  const surface = document.createElement("div");
  surface.className = "new-canvas-root";
  surface.dataset.newCanvasSurface = "true";
  surface.setAttribute("part", "surface");
  shadowRoot.append(surface);
  return surface;
}

function createProductionCanvasAdapter(dependencies = {}) {
  const renderer = dependencies.renderCanvasSurface ?? renderCanvasSurfaceForHost;
  const workflowMount = dependencies.mountCanvasWorkflow ?? mountCanvasWorkflowIfPresent;

  return {
    async mount(surface, context) {
      const sourceWorkbench = context.workbench && typeof context.workbench === "object"
        ? context.workbench
        : null;
      const sharedUi = sourceWorkbench?.ui && typeof sourceWorkbench.ui === "object"
        ? sourceWorkbench.ui
        : { ...(context.ui ?? {}) };
      Object.assign(sharedUi, context.ui ?? {}, {
        canvasProjectView: "detail",
        ...(context.canvasProjectId
          ? { selectedCanvasProjectId: String(context.canvasProjectId) }
          : {}),
        // The host itself is rendered by the workbench. Its shadow surface must
        // always render the actual Canvas, never another host placeholder.
        canvasHostMount: false,
      });
      const workbench = sourceWorkbench
        ? {
            ...sourceWorkbench,
            root: surface,
            state: context.state ?? sourceWorkbench.state ?? {},
            session: context.session ?? sourceWorkbench.session ?? {},
            api: context.api ?? sourceWorkbench.api ?? {},
            ui: sharedUi,
          }
        : {
            root: surface,
            state: context.state ?? {},
            session: context.session ?? {},
            api: context.api ?? {},
            ui: sharedUi,
          };

      let disposed = false;
      let graph = null;
      let renderToken = 0;
      const agentController = createCanvasAgentController({ surface, workbench, renderLayout: () => render() });
      const configLibraryController = createCanvasConfigLibraryController({ surface, workbench });
      const directorDeskOverlay = createDirectorDeskOverlay({ surface, workbench });
      const minimapController = createCanvasMinimapController({ surface, workbench });
      const characterLibraryController = createCanvasCharacterLibraryController({ surface, workbench });
      const panoramaViewerController = createCanvasPanoramaViewerController({ surface });
      let mediaToolsController = null;
      let panoramaDrag = null;
      let canvasAgentResize = null;
      let storyboardCellPointer = null;
      let suppressStoryboardExtractClickUntil = 0;
      let canvasNodePointer = null;
      let suppressCanvasBlankClickUntil = 0;
      workbench.onDirectorDeskOpen = (node) => directorDeskOverlay.open(node);
      workbench.onDirectorDeskSyncFrame = (node) => directorDeskOverlay.syncCurrentFrame(node);
      workbench.onDirectorDeskExportVideo = (node) => directorDeskOverlay.exportReferenceVideo(node);
      workbench.onDirectorDeskNotify = (message, tone) => {
        context.onDirectorDeskNotify?.({ message, tone }, { workbench, surface });
      };
      workbench.onCanvasStoryboardImageReturn = (input) => (
        context.onCanvasStoryboardImageReturn?.(input, { workbench, surface }) === true
      );
      const createMarkup = () => renderNewCanvasLayout(
        renderer({
          state: workbench.state,
          session: workbench.session,
          ui: workbench.ui,
          api: workbench.api,
        }),
        workbench.ui,
        `${renderCanvasMediaToolsShell(workbench.ui)}${renderCanvasConfigLibraryShell(workbench.ui)}${renderCanvasCharacterLibraryShell(workbench.ui)}`,
        renderCanvasMinimap(workbench.ui),
      );
      const render = async () => {
        if (disposed) return;
        const token = ++renderToken;
        const agentTimelineScroll = agentController.captureTimelineScroll();
        const markup = createMarkup();
        const currentGraphMount = graph
          ? surface.querySelector?.("[data-canvas-x6-mount]")
          : null;
        if (graph && currentGraphMount && typeof document !== "undefined") {
          const template = document.createElement("template");
          template.innerHTML = markup;
          const nextGraphMount = template.content.querySelector?.("[data-canvas-x6-mount]");
          if (nextGraphMount) {
            nextGraphMount.replaceWith(currentGraphMount);
            surface.replaceChildren(template.content);
            currentGraphMount.closest?.(".canvas-stage")?.classList?.add?.("is-x6-ready");
            workbench.canvasGraph = graph;
            refreshCanvasWorkflowGraph(workbench);
            const flow = surface.querySelector?.(".canvas-flow");
            if (flow) syncCanvasNodeEditor(flow, flow, graph, workbench.ui.selectedCanvasNodeId);
            minimapController.bind(graph);
            void panoramaViewerController.bind();
            void bindCanvasAudioWaveforms(surface);
            agentController.restoreTimelineScroll(agentTimelineScroll);
            void agentController.syncPromptEditor();
            syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
            context.onRender?.({ workbench, graph, surface });
            return;
          }
        }
        disposeCanvasGraph(graph);
        graph = null;
        workbench.canvasGraph = null;
        surface.innerHTML = markup;
        const mountedGraph = await workflowMount(workbench);
        if (disposed || token !== renderToken) {
          disposeCanvasGraph(mountedGraph);
          return;
        }
        graph = mountedGraph;
        const flow = surface.querySelector?.(".canvas-flow");
        if (flow && graph) syncCanvasNodeEditor(flow, flow, graph, workbench.ui.selectedCanvasNodeId);
        minimapController.bind(graph);
        void panoramaViewerController.bind();
        void bindCanvasAudioWaveforms(surface);
        agentController.restoreTimelineScroll(agentTimelineScroll);
        void agentController.syncPromptEditor();
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const renderInteraction = async () => {
        if (disposed || !graph || typeof document === "undefined") return render();
        const template = document.createElement("template");
        template.innerHTML = createMarkup();
        const currentFlow = surface.querySelector?.(".canvas-flow");
        const nextFlow = template.content.querySelector?.(".canvas-flow");
        if (!currentFlow || !nextFlow) return render();
        currentFlow.replaceWith(nextFlow);
        syncCanvasNodeEditor(nextFlow, nextFlow, graph, workbench.ui.selectedCanvasNodeId);
        syncCanvasStageOverlays(surface, template.content);
        syncCanvasSelectionClasses(surface, template.content, ".canvas-sidebar [data-action=\"select-canvas-node\"][data-node-id]");
        syncCanvasSelectionClasses(surface, template.content, "[data-canvas-minimap] [data-node-id]");
        refreshCanvasWorkflowGraph(workbench);
        void bindCanvasAudioWaveforms(surface);
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const renderSelection = async () => {
        if (disposed || !graph || typeof document === "undefined") return renderInteraction();
        const template = document.createElement("template");
        template.innerHTML = createMarkup();
        const currentFlow = surface.querySelector?.(".canvas-flow");
        const nextFlow = template.content.querySelector?.(".canvas-flow");
        if (!currentFlow || !nextFlow) return renderInteraction();
        syncCanvasNodeEditor(currentFlow, nextFlow, graph, workbench.ui.selectedCanvasNodeId);
        syncCanvasSelectionClasses(surface, template.content, ".canvas-sidebar [data-action=\"select-canvas-node\"][data-node-id]");
        syncCanvasSelectionClasses(surface, template.content, "[data-canvas-minimap] [data-node-id]");
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const renderSidebar = async () => {
        if (disposed || !graph || typeof document === "undefined") return render();
        const template = document.createElement("template");
        template.innerHTML = createMarkup();
        const currentSidebar = surface.querySelector?.(".canvas-sidebar");
        const nextSidebar = template.content.querySelector?.(".canvas-sidebar");
        const currentCanvasPanel = surface.querySelector?.(".canvas-panel");
        const nextCanvasPanel = template.content.querySelector?.(".canvas-panel");
        const currentWorkspace = surface.querySelector?.("[data-new-canvas-workspace]");
        const nextWorkspace = template.content.querySelector?.("[data-new-canvas-workspace]");
        if (!currentSidebar || !nextSidebar || !currentCanvasPanel || !nextCanvasPanel || !currentWorkspace || !nextWorkspace) return render();
        currentSidebar.replaceWith(nextSidebar);
        currentCanvasPanel.setAttribute("data-canvas-sidebar-mode", nextCanvasPanel.getAttribute("data-canvas-sidebar-mode") ?? "nodes");
        currentCanvasPanel.setAttribute("style", nextCanvasPanel.getAttribute("style") ?? "");
        currentWorkspace.setAttribute("style", nextWorkspace.getAttribute("style") ?? "");
        syncCanvasStageOverlays(surface, template.content);
        const currentZoomTools = surface.querySelector?.(".canvas-zoom-tools");
        const nextZoomTools = template.content.querySelector?.(".canvas-zoom-tools");
        if (currentZoomTools && nextZoomTools) currentZoomTools.replaceWith(nextZoomTools);
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const renderControls = async () => {
        if (disposed || !graph || typeof document === "undefined") return render();
        const template = document.createElement("template");
        template.innerHTML = createMarkup();
        syncCanvasStageOverlays(surface, template.content);
        const currentStage = surface.querySelector?.(".canvas-stage");
        const nextStage = template.content.querySelector?.(".canvas-stage");
        if (!currentStage || !nextStage) return render();
        currentStage.classList.toggle("is-canvas-hand-mode", nextStage.classList.contains("is-canvas-hand-mode"));
        currentStage.classList.toggle("is-canvas-move-mode", nextStage.classList.contains("is-canvas-move-mode"));
        for (const selector of [".canvas-zoom-tools", ".canvas-command-tools"]) {
          const current = currentStage.querySelector?.(selector);
          const next = nextStage.querySelector?.(selector);
          if (current && next) current.replaceWith(next);
        }
        const currentChromeRail = surface.querySelector?.(".new-canvas-chrome-rail");
        const nextChromeRail = template.content.querySelector?.(".new-canvas-chrome-rail");
        if (currentChromeRail && nextChromeRail) currentChromeRail.replaceWith(nextChromeRail);
        const currentMinimap = surface.querySelector?.("[data-canvas-minimap]");
        const nextMinimap = template.content.querySelector?.("[data-canvas-minimap]");
        if (currentMinimap && nextMinimap) currentMinimap.replaceWith(nextMinimap);
        else if (currentMinimap && !nextMinimap) currentMinimap.remove();
        else if (!currentMinimap && nextMinimap) {
          const workspace = surface.querySelector?.("[data-new-canvas-workspace]");
          const chromeRail = workspace?.querySelector?.(".new-canvas-chrome-rail");
          workspace?.insertBefore?.(nextMinimap, chromeRail ?? null);
        }
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const renderNode = async (nodeId) => {
        const normalizedNodeId = String(nodeId ?? "").trim();
        if (disposed || !graph || !normalizedNodeId || typeof document === "undefined") return render();
        if (!refreshCanvasWorkflowNode(workbench, normalizedNodeId)) return render();
        const template = document.createElement("template");
        template.innerHTML = createMarkup();
        const currentFlow = surface.querySelector?.(".canvas-flow");
        const nextFlow = template.content.querySelector?.(".canvas-flow");
        if (!currentFlow || !nextFlow) return render();
        syncCanvasNodeEditor(currentFlow, nextFlow, graph, workbench.ui.selectedCanvasNodeId);
        syncCanvasStageOverlays(surface, template.content);
        syncCanvasSidebarNodeItem(surface, template.content, normalizedNodeId);
        syncCanvasSelectionClasses(surface, template.content, ".canvas-sidebar [data-action=\"select-canvas-node\"][data-node-id]");
        syncCanvasSelectionClasses(surface, template.content, "[data-canvas-minimap] [data-node-id]");
        void panoramaViewerController.bind();
        void bindCanvasAudioWaveforms(surface);
        syncCanvasZoomControlDisplay(surface, graph?.zoom?.());
        context.onRender?.({ workbench, graph, surface });
      };
      const applyInteractionMode = (target) => {
        const interactionMode = ["hand", "classic"].includes(target?.dataset?.interactionMode)
          ? target.dataset.interactionMode
          : "default";
        const canvasDocument = workbench.ui?.canvasDocument;
        if (!canvasDocument) return false;
        const nextDocument = {
          ...canvasDocument,
          viewport: { ...(canvasDocument.viewport ?? {}), interactionMode },
        };
        workbench.ui.canvasDocument = nextDocument;
        sourceWorkbench?.updateCanvasDocument?.(nextDocument);
        if (sourceWorkbench?.ui && sourceWorkbench.ui !== workbench.ui) {
          sourceWorkbench.ui.canvasDocument = nextDocument;
        }
        applyCanvasGraphInteractionMode(graph, nextDocument.viewport);
        const stage = surface.querySelector?.(".canvas-stage");
        stage?.classList?.toggle?.("is-canvas-hand-mode", interactionMode === "hand");
        stage?.classList?.toggle?.("is-canvas-move-mode", interactionMode !== "hand");
        return true;
      };
      const applySnapPreference = () => {
        const canvasDocument = workbench.ui?.canvasDocument;
        if (!canvasDocument) return false;
        const nextDocument = {
          ...canvasDocument,
          viewport: {
            ...(canvasDocument.viewport ?? {}),
            snapEnabled: canvasDocument.viewport?.snapEnabled === false,
          },
        };
        workbench.ui.canvasDocument = nextDocument;
        sourceWorkbench?.updateCanvasDocument?.(nextDocument);
        if (sourceWorkbench?.ui && sourceWorkbench.ui !== workbench.ui) {
          sourceWorkbench.ui.canvasDocument = nextDocument;
        }
        applyCanvasGraphViewportPreferences(graph, nextDocument.viewport);
        return true;
      };
      const applyCanvasArrangement = () => {
        const canvasDocument = workbench.ui?.canvasDocument;
        const visibleNodeCount = canvasDocument?.nodes?.filter?.((node) => !node?.data?.hiddenByCharacterId).length ?? 0;
        if (!canvasDocument || !visibleNodeCount) return false;
        const nextDocument = arrangeCanvasDocumentOnGrid(canvasDocument);
        workbench.ui.canvasDocument = nextDocument;
        workbench.ui.toast = `已整理 ${visibleNodeCount} 个画布节点。`;
        sourceWorkbench?.updateCanvasDocument?.(nextDocument);
        if (sourceWorkbench?.ui && sourceWorkbench.ui !== workbench.ui) {
          sourceWorkbench.ui.canvasDocument = nextDocument;
          sourceWorkbench.ui.toast = workbench.ui.toast;
        }
        refreshCanvasWorkflowGraph(workbench);
        if (typeof graph?.zoomToFit === "function") {
          const graphMount = surface.querySelector?.("[data-canvas-x6-mount]");
          const graphRect = graphMount?.getBoundingClientRect?.() ?? {};
          const viewportWidth = Math.max(1, Number(graphRect.width ?? graphMount?.clientWidth ?? 0));
          const viewportHeight = Math.max(1, Number(graphRect.height ?? graphMount?.clientHeight ?? 0));
          const contentArea = graph.getContentArea?.({ useCellGeometry: true });
          if (contentArea?.width > 0 && contentArea?.height > 0 && typeof graph.zoomTo === "function") {
            const padding = 64;
            const scale = Math.min(1, Math.max(0.35, Math.min(
              (viewportWidth - (padding * 2)) / contentArea.width,
              (viewportHeight - (padding * 2)) / contentArea.height,
            )));
            const x = padding + ((viewportWidth - (padding * 2) - (contentArea.width * scale)) / 2) - (contentArea.x * scale);
            const y = padding + ((viewportHeight - (padding * 2) - (contentArea.height * scale)) / 2) - (contentArea.y * scale);
            graph.zoomTo(scale);
            graph.translate?.(x, y);
          } else {
            graph.zoomToFit({ padding: 64, minScale: 0.35, maxScale: 1 });
          }
          const syncViewport = () => {
            syncCanvasGraphViewport(graph, workbench);
            const syncedDocument = sourceWorkbench?.ui?.canvasDocument ?? workbench.ui.canvasDocument;
            workbench.ui.canvasDocument = syncedDocument;
            const zoomPercent = Math.round(Number(syncedDocument?.viewport?.zoom ?? 1) * 100);
            const zoomTrigger = surface.querySelector?.("[data-canvas-zoom-trigger]");
            if (zoomTrigger) {
              zoomTrigger.textContent = `${zoomPercent}%`;
              zoomTrigger.setAttribute("aria-label", `画布缩放比例 ${zoomPercent}%`);
            }
          };
          if (typeof requestAnimationFrame === "function") requestAnimationFrame(syncViewport);
          else setTimeout(syncViewport, 0);
        } else {
          void render();
        }
        return true;
      };
      workbench.onCanvasNodeSelected = (nodeId) => {
        workbench.ui.selectedCanvasNodeId = String(nodeId ?? "").trim() || null;
        workbench.ui.canvasEditorOpen = true;
        workbench.ui.canvasRunPreview = null;
        agentController.syncPanel();
        if (typeof sourceWorkbench?.onCanvasNodeSelected === "function") {
          sourceWorkbench.onCanvasNodeSelected(nodeId);
        } else {
          void renderSelection();
        }
      };
      workbench.refreshCanvasSurface = render;
      sourceWorkbench && (sourceWorkbench.captureCanvasPanoramaRendererView = (nodeId) => panoramaViewerController.capture(nodeId));
      const canvasX6NodeIdFromEvent = (event) => {
        const path = event.composedPath?.() ?? [];
        const x6Node = path.find((candidate) =>
          candidate?.classList?.contains?.("x6-node") && candidate?.getAttribute?.("data-cell-id"));
        const htmlNode = path.find((candidate) => candidate?.classList?.contains?.("canvas-x6-special-node"));
        const nodeId = String(
          x6Node?.getAttribute?.("data-cell-id")
          ?? htmlNode?.dataset?.nodeId
          ?? event.target?.closest?.(".canvas-x6-special-node[data-node-id]")?.dataset?.nodeId
          ?? "",
        ).trim();
        return nodeId === "__comic-ai-canvas-editor-overlay__" ? "" : nodeId;
      };
      const canvasEventPathTarget = (event, selector) => (event.composedPath?.() ?? [])
        .find((candidate) => candidate?.matches?.(selector))
        ?? event.target?.closest?.(selector);
      const isCanvasX6Event = (event) => (event.composedPath?.() ?? []).some((candidate) =>
        candidate?.hasAttribute?.("data-canvas-x6-mount"));
      const onCanvasCellClick = (event) => {
        const nodeId = canvasX6NodeIdFromEvent(event);
        if (nodeId && graph) {
          const cell = graph.getCellById?.(nodeId);
          if (cell?.isNode?.()) graph.select?.(cell);
          if (
            nodeId
            && (
              nodeId !== workbench.ui.selectedCanvasNodeId
              || workbench.ui.canvasEditorOpen !== true
            )
          ) {
            workbench.ui.selectedCanvasNodeId = nodeId;
            workbench.onCanvasNodeSelected?.(nodeId);
          }
        }
      };
      const onClick = (event) => {
        if (agentController.handleClick(event.target)) {
          event.stopPropagation();
          return;
        }
        const minimapActionTarget = event.target?.closest?.("[data-minimap-action]");
        if (minimapActionTarget) {
          event.stopPropagation();
          minimapController.handleAction(minimapActionTarget);
          return;
        }
        const mediaActionTarget = event.target?.closest?.("[data-media-action]");
        if (mediaActionTarget) {
          event.preventDefault?.();
          event.stopPropagation();
          void mediaToolsController?.handleAction(mediaActionTarget, event);
          return;
        }
        const configActionTarget = event.target?.closest?.("[data-config-action]");
        if (configActionTarget) {
          event.stopPropagation();
          void configLibraryController.handleAction(configActionTarget);
          return;
        }
        const characterActionTarget = event.target?.closest?.("[data-character-action]");
        if (characterActionTarget) {
          event.preventDefault?.();
          event.stopPropagation();
          void characterLibraryController.handleAction(characterActionTarget);
          return;
        }
        const agentActionTarget = event.target?.closest?.("[data-agent-action]");
        if (agentActionTarget) {
          event.preventDefault?.();
          event.stopPropagation();
          void agentController.handleAction(agentActionTarget);
          return;
        }
        const actionTarget = (event.composedPath?.() ?? [])
          .find((candidate) => candidate?.matches?.("[data-action]"))
          ?? event.target?.closest?.("[data-action]");
        const action = actionTarget?.dataset?.action;
        if (action) {
          if (action === "extract-canvas-storyboard-cell" && Date.now() < suppressStoryboardExtractClickUntil) {
            suppressStoryboardExtractClickUntil = 0;
            event.preventDefault?.();
            event.stopPropagation?.();
            return;
          }
          if (action === "pick-canvas-upload-file") return;
          if (action === "arrange-canvas-nodes") {
            event.preventDefault?.();
            event.stopPropagation();
            applyCanvasArrangement();
            return;
          }
          if (action === "toggle-canvas-snap") {
            event.preventDefault?.();
            event.stopPropagation();
            if (applySnapPreference()) {
              const snapEnabled = workbench.ui.canvasDocument?.viewport?.snapEnabled !== false;
              actionTarget.classList?.toggle?.("active", snapEnabled);
              actionTarget.setAttribute?.("aria-label", snapEnabled ? "关闭网格吸附" : "开启网格吸附");
              void renderControls();
            }
            return;
          }
          if (action === "set-canvas-interaction-mode") {
            applyInteractionMode(actionTarget);
            void renderControls();
          }
          if (action === "seek-canvas-audio") {
            actionTarget.dataset.canvasSeekClientX = String(event.clientX);
        }
        event.__newCanvasHandled = true;
        event.preventDefault?.();
        event.stopPropagation();
        context.onAction?.(event, { action, actionTarget, workbench, surface });
        return;
        }
        const canvasCardTarget = event.target?.closest?.(".canvas-x6-special-node[data-node-id]");
        const canvasNodeId = String(
          canvasX6NodeIdFromEvent(event) || canvasCardTarget?.dataset?.nodeId || "",
        ).trim();
        if (canvasNodeId) {
          if (
            canvasNodeId !== workbench.ui.selectedCanvasNodeId
            || workbench.ui.canvasEditorOpen !== true
          ) {
            workbench.ui.selectedCanvasNodeId = canvasNodeId;
            workbench.onCanvasNodeSelected?.(canvasNodeId);
          }
          event.stopPropagation();
          return;
        }
        const canvasStage = event.target?.closest?.(".canvas-stage");
        const interactive = event.target?.closest?.(
          ".x6-node, .canvas-x6-special-node, .canvas-lib-node, .canvas-node-editor, .canvas-context-menu, .canvas-script-picker, .canvas-add-menu, .canvas-command-tools, .canvas-zoom-tools",
        );
        if (canvasStage && !interactive && Date.now() < suppressCanvasBlankClickUntil) {
          suppressCanvasBlankClickUntil = 0;
          event.stopPropagation();
          return;
        }
        if (canvasStage && !interactive && dismissCanvasSurfaceOverlays(workbench.ui)) {
          clearCanvasGraphEditorOverlay(graph);
          event.stopPropagation();
          void renderInteraction();
        }
      };
      const onDoubleClick = (event) => {
        if (event.__canvasDirectorHandled === true) return;
        if (agentController.handleDoubleClick(event.target)) {
          event.preventDefault?.();
          event.stopPropagation?.();
          return;
        }
        const nodeId = canvasX6NodeIdFromEvent(event);
        const node = workbench.ui?.canvasDocument?.nodes?.find?.((item) => item.id === nodeId);
        if (node?.type === "ai-director") {
          event.__canvasDirectorHandled = true;
          void workbench.onDirectorDeskOpen?.(node);
          return;
        }
        if (nodeId || isCanvasX6Event(event) || event.target?.closest?.(".canvas-node-editor, .canvas-context-menu, .canvas-script-picker, .canvas-add-menu, button, input, textarea, select")) return;
        const stage = event.target?.closest?.(".canvas-stage");
        if (!stage) return;
        event.preventDefault?.();
        const position = canvasDropPosition(stage, event.clientX, event.clientY, workbench.ui.canvasDocument?.viewport);
        void context.onCanvasBlankDoubleClick?.({ position }, { workbench, surface });
      };
      const onDragStart = (event) => {
        const storyboardCell = canvasEventPathTarget(
          event,
          "[data-storyboard-drag-source][data-node-id][data-storyboard-cell-index]",
        );
        const storyboardPayload = createCanvasStoryboardCellDragPayload(
          storyboardCell?.dataset?.nodeId,
          storyboardCell?.dataset?.storyboardCellIndex,
        );
        if (storyboardPayload && event.dataTransfer) {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(CANVAS_STORYBOARD_CELL_DRAG_TYPE, storyboardPayload);
          event.dataTransfer.setData("text/plain", storyboardPayload);
          return;
        }
        const asset = canvasEventPathTarget(event, "[data-canvas-asset-drag][data-asset-id]");
        const assetId = String(asset?.dataset?.assetId ?? "").trim();
        if (!assetId || !event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(CANVAS_ASSET_DRAG_TYPE, assetId);
        event.dataTransfer.setData("text/plain", assetId);
      };
      const onDragOver = (event) => {
        const stage = canvasEventPathTarget(event, ".canvas-stage");
        const storyboardDrag = hasCanvasStoryboardCellDragType(event.dataTransfer);
        const externalDrag = hasCanvasExternalTransfer(event.dataTransfer);
        if (!stage || (!hasCanvasAssetDragType(event.dataTransfer) && !storyboardDrag && !externalDrag)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        stage.classList.add(storyboardDrag
          ? "is-canvas-storyboard-drop-target"
          : externalDrag ? "is-canvas-external-drop-target" : "is-canvas-asset-drop-target");
      };
      const onDragLeave = (event) => {
        const stage = canvasEventPathTarget(event, ".canvas-stage");
        if (stage && !stage.contains?.(event.relatedTarget)) {
          stage.classList.remove("is-canvas-asset-drop-target");
          stage.classList.remove("is-canvas-storyboard-drop-target");
          stage.classList.remove("is-canvas-external-drop-target");
        }
      };
      const onDrop = (event) => {
        const stage = canvasEventPathTarget(event, ".canvas-stage");
        const storyboardCell = parseCanvasStoryboardCellDragPayload(
          event.dataTransfer?.getData?.(CANVAS_STORYBOARD_CELL_DRAG_TYPE),
        );
        const assetId = String(event.dataTransfer?.getData?.(CANVAS_ASSET_DRAG_TYPE) ?? "").trim();
        const external = canvasExternalTransferPayload(event.dataTransfer);
        if (!stage || (!assetId && !storyboardCell && !external.files.length && !external.text)) return;
        event.preventDefault();
        event.stopPropagation();
        stage.classList.remove("is-canvas-asset-drop-target");
        stage.classList.remove("is-canvas-storyboard-drop-target");
        stage.classList.remove("is-canvas-external-drop-target");
        const position = canvasDropPosition(
          stage,
          event.clientX,
          event.clientY,
          workbench.ui.canvasDocument?.viewport,
        );
        if (storyboardCell) {
          void context.onCanvasStoryboardCellDrop?.({ ...storyboardCell, position }, { workbench, surface });
        } else if (assetId) {
          void context.onCanvasAssetDrop?.({ assetId, position }, { workbench, surface });
        } else {
          void context.onCanvasExternalDrop?.({ ...external, position }, { workbench, surface });
        }
      };
      const onPaste = (event) => {
        if (event.target?.closest?.("input, textarea, [contenteditable='true']")) return;
        const external = canvasExternalTransferPayload(event.clipboardData);
        if (!external.files.length && !external.text) return;
        const stage = surface.querySelector?.(".canvas-stage");
        if (!stage) return;
        const rect = stage.getBoundingClientRect?.() ?? {};
        const position = canvasDropPosition(
          stage,
          Number(rect.left ?? 0) + Number(rect.width ?? 0) / 2,
          Number(rect.top ?? 0) + Number(rect.height ?? 0) / 2,
          workbench.ui.canvasDocument?.viewport,
        );
        event.preventDefault();
        void context.onCanvasExternalDrop?.({ ...external, position }, { workbench, surface });
      };
      const onInput = (event) => {
        mediaToolsController?.handleInput(event.target);
        agentController.handleInput(event.target);
        configLibraryController.handleInput(event.target);
        characterLibraryController.handleInput(event.target);
        context.onInput?.(event, { target: event.target, workbench, surface });
        event.stopPropagation();
      };
      const onBlur = (event) => {
        agentController.handleBlur(event.target);
      };
      const onChange = (event) => {
        mediaToolsController?.handleInput(event.target);
        agentController.handleInput(event.target);
        configLibraryController.handleInput(event.target);
        characterLibraryController.handleInput(event.target);
        context.onChange?.(event, { target: event.target, workbench, surface });
        event.stopPropagation();
      };
      const onKeydown = (event) => {
        const zoomValueInput = event.target?.closest?.("[data-canvas-zoom-value-input]");
        if (zoomValueInput && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          context.onChange?.(event, { target: zoomValueInput, workbench, surface });
          return;
        }
        if (event.altKey && event.shiftKey && String(event.key ?? "").toLowerCase() === "f") {
          event.preventDefault();
          event.stopPropagation();
          applyCanvasArrangement();
          return;
        }
        if (event.key === "Escape" && workbench.ui?.canvasMarkdownFullscreen?.open === true) {
          event.preventDefault();
          event.stopPropagation();
          workbench.ui.canvasMarkdownFullscreen = null;
          void render();
          return;
        }
        const panoramaViewer = event.target?.closest?.("[data-panorama-drag-target]");
        if (panoramaViewer && handleCanvasPanoramaKeydown(event, panoramaViewer)) {
          return;
        }
        if (mediaToolsController?.handleKeydown(event, event.target)) {
          return;
        }
        if (characterLibraryController.handleKeydown(event, event.target)) {
          return;
        }
        agentController.handleKeydown(event, event.target);
      };
      const onPointerDown = (event) => {
        const storyboardCell = canvasEventPathTarget(
          event,
          "[data-storyboard-drag-source][data-node-id][data-storyboard-cell-index]",
        );
        const storyboardPayload = parseCanvasStoryboardCellDragPayload(createCanvasStoryboardCellDragPayload(
          storyboardCell?.dataset?.nodeId,
          storyboardCell?.dataset?.storyboardCellIndex,
        ));
        if (storyboardCell && storyboardPayload && event.button === 0) {
          storyboardCellPointer = {
            ...storyboardPayload,
            pointerId: event.pointerId,
            startX: Number(event.clientX ?? 0),
            startY: Number(event.clientY ?? 0),
            dragging: false,
            source: storyboardCell,
          };
          storyboardCell.setPointerCapture?.(event.pointerId);
          return;
        }
        const agentResizeHandle = event.target?.closest?.("[data-canvas-agent-resize]");
        if (agentResizeHandle && event.button === 0) {
          const panelWidth = Number(workbench.ui.canvasAgent?.panelWidth);
          canvasAgentResize = {
            pointerId: event.pointerId,
            startX: Number(event.clientX ?? 0),
            startWidth: Number.isFinite(panelWidth) ? panelWidth : 600,
            handle: agentResizeHandle,
          };
          agentResizeHandle.setPointerCapture?.(event.pointerId);
          surface.querySelector?.(".new-canvas-layout")?.classList?.add?.("is-agent-resizing");
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const interactionActionTarget = (event.composedPath?.() ?? [])
          .find((candidate) => candidate?.matches?.('[data-action="set-canvas-interaction-mode"]'));
        if (interactionActionTarget) {
          event.preventDefault();
          event.stopPropagation();
          applyInteractionMode(interactionActionTarget);
          void renderControls();
          context.onAction?.(event, {
            action: "set-canvas-interaction-mode",
            actionTarget: interactionActionTarget,
            workbench,
            surface,
          });
          return;
        }
        const panoramaViewer = event.target?.closest?.("[data-panorama-drag-target]");
        if (panoramaViewer && event.button === 0) {
          panoramaDrag = {
            pointerId: event.pointerId,
            nodeId: String(panoramaViewer.dataset.nodeId ?? ""),
            startX: event.clientX,
            startY: event.clientY,
            view: readCanvasPanoramaView(panoramaViewer),
            nextView: readCanvasPanoramaView(panoramaViewer),
            viewer: panoramaViewer,
          };
          panoramaViewer.setPointerCapture?.(event.pointerId);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (isCanvasNodeInteractiveTarget(event)) return;
        if (
          event.button === 0
          && isCanvasX6Event(event)
          && !(event.composedPath?.() ?? []).some((candidate) => candidate?.matches?.("[magnet='true']"))
        ) {
          canvasNodePointer = {
            pointerId: event.pointerId,
            x: Number(event.clientX ?? 0),
            y: Number(event.clientY ?? 0),
            nodeId: canvasX6NodeIdFromEvent(event)
              || resolveCanvasGraphNodeAtClientPoint(graph, event.clientX, event.clientY),
          };
        }
        if (mediaToolsController?.handlePointerDown(event, event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const onPointerMove = (event) => {
        if (storyboardCellPointer?.pointerId === event.pointerId) {
          const distance = Math.hypot(
            Number(event.clientX ?? 0) - storyboardCellPointer.startX,
            Number(event.clientY ?? 0) - storyboardCellPointer.startY,
          );
          if (distance > 4) storyboardCellPointer.dragging = true;
          if (storyboardCellPointer.dragging) {
            const stage = surface.querySelector?.(".canvas-stage");
            const rect = stage?.getBoundingClientRect?.() ?? {};
            const insideStage = Number(event.clientX ?? 0) >= Number(rect.left ?? Infinity)
              && Number(event.clientX ?? 0) <= Number(rect.right ?? -Infinity)
              && Number(event.clientY ?? 0) >= Number(rect.top ?? Infinity)
              && Number(event.clientY ?? 0) <= Number(rect.bottom ?? -Infinity);
            stage?.classList?.toggle?.("is-canvas-storyboard-drop-target", insideStage);
            storyboardCellPointer.source?.classList?.add?.("is-dragging");
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if (canvasAgentResize?.pointerId === event.pointerId) {
          const nextWidth = Math.min(
            resolveCanvasAgentPanelMaxWidth(),
            Math.max(
              CANVAS_AGENT_PANEL_MIN_WIDTH,
              Math.round(canvasAgentResize.startWidth + canvasAgentResize.startX - Number(event.clientX ?? 0)),
            ),
          );
          workbench.ui.canvasAgent.panelWidth = nextWidth;
          surface.querySelector?.(".new-canvas-layout")?.style?.setProperty?.("--canvas-agent-panel-width", `${nextWidth}px`);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (panoramaDrag?.pointerId === event.pointerId) {
          panoramaDrag.nextView = applyCanvasPanoramaDrag(panoramaDrag.view, {
            deltaX: event.clientX - panoramaDrag.startX,
            deltaY: event.clientY - panoramaDrag.startY,
          });
          syncCanvasPanoramaViewerPreview(panoramaDrag.viewer, panoramaDrag.nextView);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (mediaToolsController?.handlePointerMove(event, event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const onPointerUp = (event) => {
        if (storyboardCellPointer?.pointerId === event.pointerId) {
          const pointer = storyboardCellPointer;
          storyboardCellPointer = null;
          pointer.source?.releasePointerCapture?.(event.pointerId);
          pointer.source?.classList?.remove?.("is-dragging");
          const stage = surface.querySelector?.(".canvas-stage");
          stage?.classList?.remove?.("is-canvas-storyboard-drop-target");
          if (pointer.dragging) {
            suppressStoryboardExtractClickUntil = Date.now() + 500;
            const rect = stage?.getBoundingClientRect?.() ?? {};
            const insideStage = event.type !== "pointercancel"
              && Number(event.clientX ?? 0) >= Number(rect.left ?? Infinity)
              && Number(event.clientX ?? 0) <= Number(rect.right ?? -Infinity)
              && Number(event.clientY ?? 0) >= Number(rect.top ?? Infinity)
              && Number(event.clientY ?? 0) <= Number(rect.bottom ?? -Infinity);
            if (insideStage) {
              const position = canvasDropPosition(
                stage,
                event.clientX,
                event.clientY,
                workbench.ui.canvasDocument?.viewport,
              );
              void context.onCanvasStoryboardCellDrop?.({
                nodeId: pointer.nodeId,
                cellIndex: pointer.cellIndex,
                position,
              }, { workbench, surface });
            }
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        if (canvasAgentResize?.pointerId === event.pointerId) {
          canvasAgentResize.handle?.releasePointerCapture?.(event.pointerId);
          canvasAgentResize = null;
          surface.querySelector?.(".new-canvas-layout")?.classList?.remove?.("is-agent-resizing");
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (panoramaDrag?.pointerId === event.pointerId) {
          panoramaDrag.viewer?.releasePointerCapture?.(event.pointerId);
          panoramaDrag = null;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (canvasNodePointer?.pointerId === event.pointerId) {
          const distance = Math.hypot(
            Number(event.clientX ?? 0) - canvasNodePointer.x,
            Number(event.clientY ?? 0) - canvasNodePointer.y,
          );
          const pointerNodeId = canvasNodePointer.nodeId;
          canvasNodePointer = null;
          if (distance > 4 && pointerNodeId) {
            suppressCanvasBlankClickUntil = Date.now() + 500;
            return;
          }
          const nodeId = distance <= 4 ? resolveCanvasGraphNodeAtClientPoint(graph, event.clientX, event.clientY) : "";
          if (nodeId) {
            workbench.onCanvasNodeSelected?.(nodeId);
            return;
          }
        }
        if (mediaToolsController?.handlePointerUp(event, event.target)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const onWheel = (event) => {
        if (event.target?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox'], .canvas-prompt-mention-menu")) {
          event.stopPropagation();
          return;
        }
        const panoramaViewer = event.target?.closest?.("[data-panorama-drag-target]");
        if (!panoramaViewer) return;
        const nextView = applyCanvasPanoramaZoom(readCanvasPanoramaView(panoramaViewer), event.deltaY);
        syncCanvasPanoramaViewerPreview(panoramaViewer, nextView);
        event.preventDefault();
        event.stopPropagation();
      };
      const onPanoramaViewChange = (event) => {
        panoramaViewerController.update(event.target, event.detail);
      };
      const telemetryWindow = surface.ownerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null);
      const reportedFrontendErrorKinds = new Set();
      const reportFrontendError = (kind) => {
        const canvasProjectId = String(workbench.ui?.selectedCanvasProjectId ?? "");
        if (!canvasProjectId || reportedFrontendErrorKinds.has(kind)) return;
        reportedFrontendErrorKinds.add(kind);
        void workbench.api?.reportCanvasFrontendError?.(canvasProjectId, { kind })?.catch?.(() => undefined);
      };
      const onWindowError = () => reportFrontendError("window_error");
      const onUnhandledRejection = () => reportFrontendError("unhandled_rejection");
      const visualViewport = telemetryWindow?.visualViewport ?? null;
      const syncVisualViewport = () => {
        const height = Number(visualViewport?.height ?? telemetryWindow?.innerHeight ?? 0);
        if (height > 0) surface.style?.setProperty?.("--new-canvas-viewport-height", `${Math.round(height)}px`);
        const activeElement = surface.getRootNode?.()?.activeElement;
        if (!activeElement || !surface.contains?.(activeElement) || typeof activeElement.scrollIntoView !== "function") return;
        const rect = activeElement.getBoundingClientRect?.();
        const viewportTop = Number(visualViewport?.offsetTop ?? 0);
        const viewportBottom = viewportTop + height;
        if (rect && (rect.top < viewportTop + 8 || rect.bottom > viewportBottom - 8)) {
          activeElement.scrollIntoView({ block: "center", inline: "nearest" });
        }
      };
      surface.addEventListener("click", onClick, true);
      surface.addEventListener("click", onCanvasCellClick, true);
      surface.addEventListener("dblclick", onDoubleClick, true);
      surface.addEventListener("input", onInput);
      surface.addEventListener("blur", onBlur, true);
      surface.addEventListener("change", onChange);
      surface.addEventListener("keydown", onKeydown);
      surface.addEventListener("pointerdown", onPointerDown, true);
      surface.addEventListener("pointermove", onPointerMove);
      surface.addEventListener("pointerup", onPointerUp, true);
      surface.addEventListener("pointercancel", onPointerUp);
      surface.addEventListener("wheel", onWheel, { passive: false, capture: true });
      surface.addEventListener("canvas-panorama-view-change", onPanoramaViewChange);
      surface.addEventListener("dragstart", onDragStart, true);
      surface.addEventListener("dragover", onDragOver, true);
      surface.addEventListener("dragleave", onDragLeave, true);
      surface.addEventListener("drop", onDrop, true);
      surface.addEventListener("paste", onPaste);
      telemetryWindow?.addEventListener?.("error", onWindowError);
      telemetryWindow?.addEventListener?.("unhandledrejection", onUnhandledRejection);
      telemetryWindow?.addEventListener?.("orientationchange", syncVisualViewport);
      visualViewport?.addEventListener?.("resize", syncVisualViewport);
      visualViewport?.addEventListener?.("scroll", syncVisualViewport);
      syncVisualViewport();
      mediaToolsController = createCanvasMediaToolsController({ surface, workbench, render });
      await render();
      void agentController.resume();
      return {
        workbench,
        get graph() {
          return graph;
        },
        render,
        update(next = {}) {
          if (next.state) workbench.state = next.state;
          if (next.session) workbench.session = next.session;
          if (next.api) workbench.api = next.api;
          if (next.ui) Object.assign(workbench.ui, next.ui, { canvasProjectView: "detail" });
          if (next.nodeOnly === true) return renderNode(next.nodeId);
          if (next.selectionOnly === true) return renderSelection();
          if (next.sidebarOnly === true) return renderSidebar();
          if (next.controlsOnly === true) return renderControls();
          if (next.surfaceOnly === true) return render();
          return next.interactionOnly === true ? renderInteraction() : render();
        },
        dispose() {
          disposed = true;
          renderToken += 1;
          surface.removeEventListener("click", onClick, true);
          surface.removeEventListener("click", onCanvasCellClick, true);
          surface.removeEventListener("dblclick", onDoubleClick, true);
          surface.removeEventListener("input", onInput);
          surface.removeEventListener("blur", onBlur, true);
          surface.removeEventListener("change", onChange);
          surface.removeEventListener("keydown", onKeydown);
          surface.removeEventListener("pointerdown", onPointerDown, true);
          surface.removeEventListener("pointermove", onPointerMove);
          surface.removeEventListener("pointerup", onPointerUp, true);
          surface.removeEventListener("pointercancel", onPointerUp);
          surface.removeEventListener("wheel", onWheel, true);
          surface.removeEventListener("canvas-panorama-view-change", onPanoramaViewChange);
          surface.removeEventListener("dragstart", onDragStart, true);
          surface.removeEventListener("dragover", onDragOver, true);
          surface.removeEventListener("dragleave", onDragLeave, true);
          surface.removeEventListener("drop", onDrop, true);
          surface.removeEventListener("paste", onPaste);
          telemetryWindow?.removeEventListener?.("error", onWindowError);
          telemetryWindow?.removeEventListener?.("unhandledrejection", onUnhandledRejection);
          telemetryWindow?.removeEventListener?.("orientationchange", syncVisualViewport);
          visualViewport?.removeEventListener?.("resize", syncVisualViewport);
          visualViewport?.removeEventListener?.("scroll", syncVisualViewport);
          surface.style?.removeProperty?.("--new-canvas-viewport-height");
          reportedFrontendErrorKinds.clear();
          agentController.dispose();
          configLibraryController.dispose();
          characterLibraryController.dispose();
          directorDeskOverlay.dispose();
          minimapController.dispose();
          panoramaViewerController.dispose();
          mediaToolsController?.dispose();
          delete workbench.onDirectorDeskOpen;
          delete workbench.onDirectorDeskSyncFrame;
          delete workbench.onDirectorDeskExportVideo;
          delete workbench.onDirectorDeskNotify;
          delete workbench.refreshCanvasSurface;
          if (sourceWorkbench) delete sourceWorkbench.captureCanvasPanoramaRendererView;
          const graphToDispose = graph ?? workbench.canvasGraph;
          disposeCanvasGraph(graphToDispose);
          context.onDispose?.({ workbench, graph: graphToDispose, surface });
          workbench.canvasGraph = null;
          graph = null;
          surface.replaceChildren();
        },
      };
    },
  };
}

function syncCanvasSelectionClasses(surface, nextRoot, selector) {
  const nextByNodeId = new Map(
    [...(nextRoot.querySelectorAll?.(selector) ?? [])]
      .map((element) => [String(element.dataset?.nodeId ?? ""), element]),
  );
  for (const current of surface.querySelectorAll?.(selector) ?? []) {
    const next = nextByNodeId.get(String(current.dataset?.nodeId ?? ""));
    if (!next) continue;
    current.className = next.className;
    if (next.hasAttribute("aria-selected")) current.setAttribute("aria-selected", next.getAttribute("aria-selected"));
    else current.removeAttribute("aria-selected");
  }
}

function syncCanvasSidebarNodeItem(surface, nextRoot, nodeId) {
  const escapedNodeId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(String(nodeId ?? ""))
    : String(nodeId ?? "").replace(/"/g, '\\"');
  const selector = `.canvas-sidebar [data-action="select-canvas-node"][data-node-id="${escapedNodeId}"]`;
  const current = surface.querySelector?.(selector);
  const next = nextRoot.querySelector?.(selector);
  if (current && next) current.replaceWith(next);
}

export function resolveCanvasGraphNodeAtClientPoint(graph, clientX, clientY) {
  const point = graph?.clientToLocal?.(Number(clientX ?? 0), Number(clientY ?? 0));
  if (!point || !graph?.getNodes) return "";
  const nodes = [...graph.getNodes()].reverse();
  const node = nodes.find((cell) => {
    if (cell?.getData?.()?.canvasTransientEditor === true) return false;
    const box = cell?.getBBox?.();
    return box
      && point.x >= box.x
      && point.x <= box.x + box.width
      && point.y >= box.y
      && point.y <= box.y + box.height;
  });
  return String(node?.id ?? "");
}

function syncCanvasNodeEditor(currentFlow, nextFlow, graph, nodeId) {
  const editor = nextFlow.querySelector?.(".canvas-node-editor");
  const editorHtml = editor?.outerHTML ?? "";
  currentFlow.querySelector?.(".canvas-node-editor")?.remove();
  if (nextFlow !== currentFlow) editor?.remove();
  currentFlow.querySelector?.(".canvas-node-action-toolbar")?.remove();
  if (!editorHtml || !nodeId) {
    clearCanvasGraphEditorOverlay(graph);
    return;
  }
  mountCanvasGraphEditorOverlay(graph, nodeId, editorHtml);
}

function syncCanvasStageOverlays(surface, nextRoot) {
  const currentStage = surface.querySelector?.(".canvas-stage");
  const nextStage = nextRoot.querySelector?.(".canvas-stage");
  if (!currentStage || !nextStage) return;
  for (const selector of [
    ".canvas-add-menu",
    ".canvas-context-menu",
    ".canvas-script-picker",
    '[data-selection-picker-id="canvas-prompt-reference-picker"]',
    ".canvas-markdown-fullscreen",
    "[data-canvas-video-fullscreen]",
    ".canvas-inline-toast",
    ".canvas-revision-conflict-backdrop",
  ]) {
    if (selector === '[data-selection-picker-id="canvas-prompt-reference-picker"]') {
      const currentPicker = currentStage.querySelector?.(selector);
      const nextPicker = nextStage.querySelector?.(selector);
      const currentModal = currentPicker?.querySelector?.(".selection-picker-modal");
      const nextModal = nextPicker?.querySelector?.(".selection-picker-modal");
      if (currentPicker && nextPicker && currentModal && nextModal) {
        currentModal.replaceChildren(...nextModal.childNodes);
        continue;
      }
    }
    currentStage.querySelectorAll?.(`:scope > ${selector}`).forEach((element) => element.remove());
    nextStage.querySelectorAll?.(`:scope > ${selector}`).forEach((element) => currentStage.append(element));
  }
}

function hasCanvasAssetDragType(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes(CANVAS_ASSET_DRAG_TYPE);
}

function hasCanvasStoryboardCellDragType(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes(CANVAS_STORYBOARD_CELL_DRAG_TYPE);
}

export function hasCanvasExternalTransfer(dataTransfer) {
  const types = Array.from(dataTransfer?.types ?? []);
  if (types.includes(CANVAS_ASSET_DRAG_TYPE) || types.includes(CANVAS_STORYBOARD_CELL_DRAG_TYPE)) return false;
  return types.includes("Files") || types.includes("text/plain") || Array.from(dataTransfer?.files ?? []).length > 0;
}

export function canvasExternalTransferPayload(dataTransfer) {
  const candidates = [
    ...Array.from(dataTransfer?.files ?? []),
    ...Array.from(dataTransfer?.items ?? [])
      .filter((item) => item?.kind === "file")
      .map((item) => item.getAsFile?.())
      .filter(Boolean),
  ];
  const seen = new Set();
  const files = candidates.filter((file) => {
    const type = String(file?.type ?? "").toLowerCase();
    if (!/^(image|video|audio)\//.test(type)) return false;
    const key = `${file.name ?? ""}:${file.size ?? ""}:${file.lastModified ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const text = files.length ? "" : String(dataTransfer?.getData?.("text/plain") ?? "").trim().slice(0, 100_000);
  return { files, text };
}

function readCanvasPanoramaView(viewer) {
  return normalizeCanvasPanoramaView({
    yaw: viewer?.dataset?.panoramaYaw,
    pitch: viewer?.dataset?.panoramaPitch,
    fov: viewer?.dataset?.panoramaFov,
  });
}

function syncCanvasPanoramaViewerPreview(viewer, view) {
  if (!viewer) return;
  const normalized = normalizeCanvasPanoramaView(view);
  viewer.dataset.panoramaYaw = String(normalized.yaw);
  viewer.dataset.panoramaPitch = String(normalized.pitch);
  viewer.dataset.panoramaFov = String(normalized.fov);
  const texture = viewer.querySelector?.(".canvas-panorama-texture");
  if (!texture?.style) return;
  texture.style.objectPosition = `${(180 - normalized.yaw) / 360 * 100}% ${(85 - normalized.pitch) / 170 * 100}%`;
  texture.style.transform = `scale(${Math.max(1, 95 / normalized.fov)})`;
  viewer.dispatchEvent?.(new CustomEvent("canvas-panorama-view-change", { detail: normalized, bubbles: true, composed: true }));
}

function commitCanvasPanoramaView(workbench, nodeId, view) {
  const document = workbench.ui?.canvasDocument;
  if (!document || !nodeId) return false;
  const nextDocument = updateCanvasNodeData(document, nodeId, { panoramaView: normalizeCanvasPanoramaView(view) });
  if (typeof workbench.updateCanvasDocument === "function") {
    workbench.updateCanvasDocument(nextDocument);
  } else {
    workbench.ui.canvasDocument = nextDocument;
  }
  workbench.ui.selectedCanvasNodeId = nodeId;
  return true;
}

function handleCanvasPanoramaKeydown(event, viewer) {
  const key = String(event.key ?? "");
  const current = readCanvasPanoramaView(viewer);
  let next = null;
  if (key === "ArrowLeft") next = normalizeCanvasPanoramaView({ ...current, yaw: current.yaw - 5 });
  if (key === "ArrowRight") next = normalizeCanvasPanoramaView({ ...current, yaw: current.yaw + 5 });
  if (key === "ArrowUp") next = normalizeCanvasPanoramaView({ ...current, pitch: current.pitch - 5 });
  if (key === "ArrowDown") next = normalizeCanvasPanoramaView({ ...current, pitch: current.pitch + 5 });
  if (["+", "="].includes(key)) next = applyCanvasPanoramaZoom(current, -120);
  if (["-", "_"].includes(key)) next = applyCanvasPanoramaZoom(current, 120);
  if (key === "0" || key === "Home") next = normalizeCanvasPanoramaView();
  if (!next) return false;
  event.preventDefault();
  event.stopPropagation();
  syncCanvasPanoramaViewerPreview(viewer, next);
  return true;
}

export async function bindCanvasAudioWaveforms(surface) {
  bindCanvasMediaControlPointerGuards(surface);
  const bodies = [...(surface?.querySelectorAll?.("[data-canvas-audio-body]") ?? [])];
  await Promise.all(bodies.map(async (body) => {
    const canvas = body.querySelector?.("[data-canvas-audio-waveform]");
    const audio = body.querySelector?.("[data-canvas-audio-player]");
    const source = String(audio?.currentSrc || audio?.src || audio?.getAttribute?.("src") || "").trim();
    if (!canvas || !audio || !source || canvas.dataset.waveformSource === source) return;
    canvas.dataset.waveformSource = source;
    try {
      let waveformPromise = canvasAudioWaveformCache.get(source);
      if (!waveformPromise) {
        waveformPromise = decodeCanvasAudioWaveform(source).catch((error) => {
          canvasAudioWaveformCache.delete(source);
          throw error;
        });
        canvasAudioWaveformCache.set(source, waveformPromise);
        if (canvasAudioWaveformCache.size > 32) canvasAudioWaveformCache.delete(canvasAudioWaveformCache.keys().next().value);
      }
      const waveform = await waveformPromise;
      if (!canvas.isConnected || canvas.dataset.waveformSource !== source) return;
      const draw = () => {
        const duration = Number(audio.duration || waveform.duration || 0);
        const progress = duration > 0 ? Number(audio.currentTime || 0) / duration : 0;
        drawCanvasAudioWaveform(canvas, waveform, { progress });
        const output = body.querySelector?.("[data-canvas-audio-time]");
        if (output && Number.isFinite(duration) && duration > 0) {
          const current = Math.max(0, Math.floor(Number(audio.currentTime || 0)));
          const total = Math.max(0, Math.floor(duration));
          output.textContent = `${Math.floor(current / 60)}:${String(current % 60).padStart(2, "0")} / ${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
        }
      };
      draw();
      if (canvas.dataset.waveformEventsBound !== "true") {
        canvas.dataset.waveformEventsBound = "true";
        audio.addEventListener?.("timeupdate", draw);
        audio.addEventListener?.("loadedmetadata", draw);
      }
    } catch {
      canvas.dataset.waveformStatus = "unavailable";
      drawCanvasAudioWaveform(canvas, { peaks: [] });
    }
  }));
}

export function dismissCanvasSurfaceOverlays(ui = {}) {
  let changed = false;
  const clear = (key, value = null) => {
    if (ui[key] !== undefined && ui[key] !== value) {
      ui[key] = value;
      changed = true;
    }
  };
  if (ui.canvasConfigLibrary?.open === true) {
    ui.canvasConfigLibrary.open = false;
    changed = true;
  }
  clear("canvasAddMenuOpen", false);
  clear("canvasContextMenu");
  clear("canvasScriptPicker");
  clear("openGenerationSelectMenu");
  clear("canvasEditorOpen", false);
  return changed;
}

/**
 * Mount the in-app standalone Canvas into a host element.
 *
 * `options.adapter` may implement the same `{ mount(surface, context) }`
 * contract to provide a product-specific state/event bridge. The default
 * adapter renders the existing production-workbench Canvas library/editor.
 */
export async function mountNewCanvas(target, options = {}) {
  const host = resolveTarget(target);
  if (!host || typeof document === "undefined") {
    return null;
  }
  if (instances.has(host)) {
    await unmountNewCanvas(host);
  }

  const shadowRoot = host.shadowRoot ?? host.attachShadow?.({ mode: "open" });
  if (!shadowRoot) {
    throw new Error("new_canvas_shadow_root_unavailable");
  }
  shadowRoot.replaceChildren();
  const disposeStyles = appendStyles(shadowRoot, options.styleHrefs);
  const surface = createSurface(shadowRoot);
  surface.innerHTML = `<div class="new-canvas-loading-skeleton" role="status" aria-live="polite" aria-label="正在加载画布"><span class="new-canvas-loading-skeleton__rail"></span><span class="new-canvas-loading-skeleton__stage"></span><span class="new-canvas-loading-skeleton__panel"></span></div>`;
  host.dataset.newCanvasMounted = "pending";
  const adapter = options.adapter ?? createProductionCanvasAdapter(options.dependencies);
  let adapterHandle;
  try {
    adapterHandle = await adapter.mount(surface, {
      ...options,
      surface,
      shadowRoot,
    });
    const instance = {
      host,
      surface,
      shadowRoot,
      adapter,
      adapterHandle,
      disposeStyles,
      async update(next = {}) {
        return adapterHandle?.update?.(next);
      },
      async unmount() {
        await unmountNewCanvas(host);
      },
    };
    instances.set(host, instance);
    host.dataset.newCanvasMounted = "true";
    return instance;
  } catch (error) {
    host.dataset.newCanvasMounted = "failed";
    disposeStyles();
    adapterHandle?.dispose?.();
    shadowRoot.replaceChildren();
    throw error;
  }
}

export async function unmountNewCanvas(target) {
  const host = resolveTarget(target?.host ?? target);
  const instance = host ? instances.get(host) : null;
  if (!host || !instance) {
    return false;
  }
  instances.delete(host);
  instance.disposeStyles?.();
  await instance.adapterHandle?.dispose?.();
  if (instance.shadowRoot?.host === host) {
    instance.shadowRoot.replaceChildren();
  }
  delete host.dataset.newCanvasMounted;
  return true;
}

export function getNewCanvasInstance(target) {
  const host = resolveTarget(target?.host ?? target);
  return host ? instances.get(host) ?? null : null;
}

export { createProductionCanvasAdapter };
