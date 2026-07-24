import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AudioWaveform,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  BookOpen,
  Boxes,
  Circle,
  CircleHelp,
  Copy,
  Film,
  Hand,
  Headphones,
  History,
  ImageUp,
  Images,
  Keyboard,
  Layers3,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  ScrollText,
  Share2,
  Type,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { createTextNodeElement, insertImageFileOnCanvas } from "./canvas-elements.js";
import { canvasUiScale } from "./canvas-quick-add.js";
import {
  CANVAS_TOOL_PRESET_CATEGORIES,
  CANVAS_TOOL_PRESETS,
  canvasToolPresetReasonMessage,
  extractCanvasToolPresetTopology,
  listCanvasToolPresets,
  mergeCanvasUserToolPresetMetadata,
  normalizeCanvasUserToolPreset,
} from "./canvas-tool-presets.js";
import { filterCanvasToolPresets } from "./canvas-workflow-templates.js";
import { executeCanvasNodeGeneration } from "./canvas-generation-execution.js";
import { collectUpstreamCanvasInput } from "./canvas-generation.js";
import {
  createImageGeneratorElement,
  createImageToImageGenerator,
  getImageGeneratorData,
  isImageGeneratorElement,
} from "./image-generator-elements.js";
import {
  createVideoGeneratorElement,
  getVideoGeneratorData,
  isVideoGeneratorElement,
} from "./video-generator-elements.js";
import { ImageGeneratorPanel, ImageSourceActionsPanel, VideoGeneratorPanel } from "./GeneratorPanels.jsx";
import { isVideoUrl } from "./canvas-elements.js";
import { VideoPlayerPanel } from "./VideoPlayerPanel.jsx";
import { WorkflowNodePanel } from "./WorkflowNodePanel.jsx";
import {
  createWorkflowNodeElement,
  getWorkflowNodeData,
  isWorkflowNodeElement,
} from "./workflow-node-elements.js";
import { brandKitTextNodeOptions } from "../loomic-shell/canvas-brand-kit.js";
import { CANVAS_SHORTCUT_GROUPS, isCanvasShortcutInteractiveTarget, matchesCanvasShortcut } from "./canvas-shortcuts.js";
import { creatorApi, resolveApiUrl } from "../../../src/shared/creator-api.js";
import { CANVAS_TOOL_PRESET_DRAG_TYPE, getCanvasToolPresetCatalog } from "./canvas-tool-preset-catalog.js";
import { positionCanvasToolPopover } from "./canvas-tool-popover-position.js";

const CREATOR_GUIDE_URL = "https://hcn2azjrtd3x.feishu.cn/wiki/K20Awy1POixjIUk2RMEc5T1dnDp?from=from_copylink";

const MOVEMENT_TOOLS = [
  { type: "selection", Icon: MousePointer2, label: "移动", shortcut: "V" },
  { type: "hand", Icon: Hand, label: "抓手工具", shortcut: "H" },
];

const DRAWING_TOOLS = [
  { type: "rectangle", Icon: Square, label: "矩形" },
  { type: "ellipse", Icon: Circle, label: "椭圆" },
  { type: "arrow", Icon: ArrowUpRight, label: "箭头" },
  { type: "line", Icon: Minus, label: "直线" },
  { type: "freedraw", Icon: Pencil, label: "画笔" },
];

function textInput(value) {
  return String(value ?? "").trim();
}

function toolPresetNodeDetails(node) {
  if (node.kind === "image") return { Icon: Sparkles, label: "图片生成" };
  if (node.kind === "video") return { Icon: Video, label: "视频生成" };
  if (node.type === "script-node") return { Icon: ScrollText, label: "脚本" };
  if (node.type === "director-node") return { Icon: Layers3, label: "导演台" };
  if (node.type === "audio-node") return { Icon: AudioWaveform, label: "音频" };
  if (node.type === "video-composition-node") return { Icon: Film, label: "视频合成" };
  return { Icon: Boxes, label: "工作流节点" };
}

function toolPresetStages(preset) {
  const levels = [];
  for (let index = 0; index < preset.preview.nodes.length; index += 1) {
    const incoming = preset.preview.connections.filter(([, targetIndex]) => targetIndex === index);
    levels[index] = incoming.length
      ? Math.max(...incoming.map(([sourceIndex]) => levels[sourceIndex] ?? 0)) + 1
      : 0;
  }
  return levels.reduce((stages, level, index) => {
    if (!stages[level]) stages[level] = [];
    stages[level].push(preset.preview.nodes[index]);
    return stages;
  }, []);
}

function ToolPresetPreview({ preset }) {
  const stages = toolPresetStages(preset);
  if (!stages.length) {
    return (
      <div className="loomic-tool-preset-preview loomic-tool-preset-summary" aria-hidden="true">
        <Boxes />
        <span>{preset.nodeCount ?? 0} 节点 · {preset.edgeCount ?? 0} 连线</span>
      </div>
    );
  }
  return (
    <div className="loomic-tool-preset-preview" aria-hidden="true">
      {stages.map((nodes, stageIndex) => (
        <React.Fragment key={`${preset.id}:${stageIndex}`}>
          {stageIndex ? <ArrowRight className="loomic-tool-preset-arrow" /> : null}
          <span className="loomic-tool-preset-stage">
            {nodes.map((node, nodeIndex) => {
              const { Icon, label } = toolPresetNodeDetails(node);
              return <span className="loomic-tool-preset-node" title={label} key={`${preset.id}:${stageIndex}:${nodeIndex}`}><Icon /></span>;
            })}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function responsePreset(payload) {
  const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  return source?.preset ?? source;
}

export function CanvasToolMenu({
  excalidrawApi,
  leftPanelOpen = false,
  onGenerate,
  onCancelGeneration,
  onCompose,
  onPersistCanvas,
  canvasProjectId,
  onImportImage,
  onArchiveImage,
  brandKit = null,
  generationConfig = null,
  generating = false,
  generationError = "",
  connectionModeActive = false,
  onConnectionModeChange,
  onOpenFilesView,
  addMenuRequest = null,
}) {
  const [activeTool, setActiveTool] = useState("selection");
  const [imageGenerator, setImageGenerator] = useState(null);
  const [imageSource, setImageSource] = useState(null);
  const [videoGenerator, setVideoGenerator] = useState(null);
  const [videoPlayer, setVideoPlayer] = useState(null);
  const [workflowNode, setWorkflowNode] = useState(null);
  const [viewport, setViewport] = useState({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState(null);
  const [addMaterialMenuOpen, setAddMaterialMenuOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [materialMenuOpen, setMaterialMenuOpen] = useState(false);
  const [toolboxCategory, setToolboxCategory] = useState("all");
  const [userToolPresets, setUserToolPresets] = useState([]);
  const [userToolPresetState, setUserToolPresetState] = useState({ status: "idle", error: "" });
  const [toolPresetSelection, setToolPresetSelection] = useState({ ok: false, reason: "no_nodes", topology: null });
  const [toolPresetVersions, setToolPresetVersions] = useState({});
  const [toolPresetDetailState, setToolPresetDetailState] = useState({});
  const [toolPresetVersionState, setToolPresetVersionState] = useState({});
  const [toolPresetAction, setToolPresetAction] = useState("");
  const [movementMenuOpen, setMovementMenuOpen] = useState(false);
  const [movementMenuPosition, setMovementMenuPosition] = useState({ left: 0, top: 0, ready: false });
  const [drawingMenuOpen, setDrawingMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpContact, setHelpContact] = useState(null);
  const [supportConfig, setSupportConfig] = useState({ status: "idle", communityImageUrl: "", enterpriseContactImageUrl: "" });
  const [generationState, setGenerationState] = useState({ id: "", kind: "", running: false, error: "" });
  const visibleBuiltinToolPresets = useMemo(
    () => listCanvasToolPresets({ category: toolboxCategory }),
    [toolboxCategory],
  );
  const visibleUserToolPresets = useMemo(
    () => filterCanvasToolPresets(userToolPresets, { category: toolboxCategory }),
    [toolboxCategory, userToolPresets],
  );
  const visibleToolPresets = useMemo(
    () => [...visibleUserToolPresets, ...visibleBuiltinToolPresets],
    [visibleBuiltinToolPresets, visibleUserToolPresets],
  );
  const toolMenuRef = useRef(null);
  const movementButtonRef = useRef(null);
  const movementMenuRef = useRef(null);
  const addMenuAnchorElementRef = useRef(null);
  const addMenuAnchorRef = useRef(null);
  const fileInsertAnchorRef = useRef(null);
  const toolboxRef = useRef(null);
  const shortcutsPanelRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageGeneratorRef = useRef(null);
  const imageSourceRef = useRef(null);
  const videoGeneratorRef = useRef(null);
  const videoPlayerRef = useRef(null);
  const workflowNodeRef = useRef(null);
  const toolPresetLoadRef = useRef(0);
  const toolPresetSelectionRef = useRef(toolPresetSelection);
  const toolPresetDetailRequestRef = useRef(new Map());
  const toolPresetVersionRequestRef = useRef(new Map());
  const toolPresetCatalogRef = useRef(null);
  if (!toolPresetCatalogRef.current) toolPresetCatalogRef.current = getCanvasToolPresetCatalog(creatorApi);
  imageGeneratorRef.current = imageGenerator;
  imageSourceRef.current = imageSource;
  videoGeneratorRef.current = videoGenerator;
  videoPlayerRef.current = videoPlayer;
  workflowNodeRef.current = workflowNode;
  toolPresetSelectionRef.current = toolPresetSelection;

  const invalidateToolPresetRequests = useCallback((presetId) => {
    toolPresetDetailRequestRef.current.set(
      presetId,
      (toolPresetDetailRequestRef.current.get(presetId) ?? 0) + 1,
    );
    toolPresetVersionRequestRef.current.set(
      presetId,
      (toolPresetVersionRequestRef.current.get(presetId) ?? 0) + 1,
    );
  }, []);

  const closePanels = useCallback(() => {
    setImageGenerator(null);
    setImageSource(null);
    setVideoGenerator(null);
    setVideoPlayer(null);
    setWorkflowNode(null);
  }, []);

  const closeToolPopovers = useCallback(() => {
    setAddMenuOpen(false);
    setAddMenuAnchor(null);
    setAddMaterialMenuOpen(false);
    addMenuAnchorRef.current = null;
    setTemplateMenuOpen(false);
    setMaterialMenuOpen(false);
    setMovementMenuOpen(false);
    setDrawingMenuOpen(false);
    setShortcutsOpen(false);
    setHelpOpen(false);
    setHelpContact(null);
  }, []);
  const toggleAddMenu = useCallback(() => {
    setAddMenuAnchor(null);
    addMenuAnchorRef.current = null;
    setAddMaterialMenuOpen(false);
    setTemplateMenuOpen(false);
    setMaterialMenuOpen(false);
    setMovementMenuOpen(false);
    setDrawingMenuOpen(false);
    setShortcutsOpen(false);
    setHelpOpen(false);
    setAddMenuOpen((open) => !open);
  }, []);

  const focusAdjacentMovementTool = useCallback((backward = false) => {
    const toolbarButtons = Array.from(toolMenuRef.current?.querySelectorAll("button:not([disabled])") ?? []);
    const movementIndex = toolbarButtons.indexOf(movementButtonRef.current);
    const adjacentButton = toolbarButtons[movementIndex + (backward ? -1 : 1)] ?? movementButtonRef.current;
    window.requestAnimationFrame(() => adjacentButton?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!addMenuRequest || !toolMenuRef.current || !addMenuAnchorElementRef.current) return;
    const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
    const uiScale = canvasUiScale(document);
    const globalLeft = Math.max(8, Math.min(addMenuRequest.clientX, viewportWidth - 286 * uiScale));
    const globalTop = Math.max(8, Math.min(addMenuRequest.clientY, viewportHeight - 474 * uiScale));
    const roomLeft = globalLeft - 8;
    const roomRight = viewportWidth - (globalLeft + 232 * uiScale) - 8;
    const anchorBounds = addMenuAnchorElementRef.current.getBoundingClientRect();
    const anchor = {
      ...addMenuRequest,
      menuLeft: (globalLeft - anchorBounds.left) / uiScale,
      menuTop: (globalTop - anchorBounds.top) / uiScale,
      submenuSide: roomRight >= 226 * uiScale || roomRight >= roomLeft ? "right" : "left",
    };
    addMenuAnchorRef.current = anchor;
    setAddMenuAnchor(anchor);
    setAddMaterialMenuOpen(false);
    setTemplateMenuOpen(false);
    setMaterialMenuOpen(false);
    setMovementMenuOpen(false);
    setDrawingMenuOpen(false);
    setShortcutsOpen(false);
    setHelpOpen(false);
    setAddMenuOpen(true);
  }, [addMenuRequest]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        !toolMenuRef.current?.contains(event.target)
        && !movementMenuRef.current?.contains(event.target)
        && !toolboxRef.current?.contains(event.target)
        && !shortcutsPanelRef.current?.contains(event.target)
      ) closeToolPopovers();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        const restoreMovementFocus = movementMenuOpen;
        closeToolPopovers();
        if (restoreMovementFocus) {
          movementButtonRef.current?.focus({ preventScroll: true });
        }
        return;
      }
      if (movementMenuOpen && movementMenuRef.current?.contains(event.target)) {
        const movementItems = Array.from(movementMenuRef.current.querySelectorAll('[role="menuitemradio"]'));
        if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const activeIndex = movementItems.indexOf(document.activeElement);
          const nextIndex = event.key === "Home"
            ? 0
            : event.key === "End"
              ? movementItems.length - 1
              : (activeIndex + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + movementItems.length) % movementItems.length;
          movementItems[nextIndex]?.focus({ preventScroll: true });
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          closeToolPopovers();
          focusAdjacentMovementTool(event.shiftKey);
          return;
        }
      }
      if (event.isComposing || isCanvasShortcutInteractiveTarget(event.target)) return;
      const canvasRoot = document.querySelector(".loomic-canvas-root");
      const canvasFocused = canvasRoot?.contains(event.target);
      const workflowVisible = canvasRoot?.closest(".lm-canvas-shell")?.dataset.viewMode !== "storyboard";
      if (matchesCanvasShortcut(event, "new-node") && canvasFocused && workflowVisible) {
        event.preventDefault();
        toggleAddMenu();
      } else if (event.key === "?" && canvasFocused) {
        event.preventDefault();
        setAddMenuOpen(false);
        setTemplateMenuOpen(false);
        setMaterialMenuOpen(false);
        setMovementMenuOpen(false);
        setDrawingMenuOpen(false);
        setHelpOpen(false);
        setShortcutsOpen((open) => !open);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeToolPopovers, focusAdjacentMovementTool, movementMenuOpen, toggleAddMenu]);

  const positionMovementMenu = useCallback(() => {
    const trigger = movementButtonRef.current;
    const menu = movementMenuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewport = {
      width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
    };
    const nextPosition = positionCanvasToolPopover(triggerRect, menuRect, viewport);
    const uiScale = Number.parseFloat(window.getComputedStyle(document.body).zoom) || 1;
    setMovementMenuPosition({
      left: nextPosition.left / uiScale,
      top: nextPosition.top / uiScale,
      ready: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (!movementMenuOpen) return undefined;
    positionMovementMenu();
    const focusFrame = window.requestAnimationFrame(() => {
      movementMenuRef.current
        ?.querySelector('[role="menuitemradio"][aria-checked="true"]')
        ?.focus({ preventScroll: true });
    });
    window.addEventListener("resize", positionMovementMenu);
    window.addEventListener("scroll", positionMovementMenu, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", positionMovementMenu);
      window.removeEventListener("scroll", positionMovementMenu, true);
    };
  }, [movementMenuOpen, positionMovementMenu]);

  useEffect(() => {
    if (!helpOpen || !["idle", "failed"].includes(supportConfig.status)) return undefined;
    let active = true;
    setSupportConfig((current) => ({ ...current, status: "loading" }));
    creatorApi.getCustomerSupportConfig().then((config) => {
      if (!active) return;
      setSupportConfig({
        status: "loaded",
        communityImageUrl: String(config?.communityImageUrl ?? "").trim(),
        enterpriseContactImageUrl: String(config?.enterpriseContactImageUrl ?? "").trim(),
      });
    }).catch(() => {
      if (active) setSupportConfig({ status: "failed", communityImageUrl: "", enterpriseContactImageUrl: "" });
    });
    return () => {
      active = false;
      setSupportConfig((current) => current.status === "loading" ? { ...current, status: "idle" } : current);
    };
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) setHelpContact(null);
  }, [helpOpen]);

  const loadUserToolPresets = useCallback(async () => {
    const requestId = toolPresetLoadRef.current + 1;
    toolPresetLoadRef.current = requestId;
    setUserToolPresetState({ status: "loading", error: "" });
    try {
      const loaded = await toolPresetCatalogRef.current.listUsers();
      if (toolPresetLoadRef.current !== requestId) return;
      setUserToolPresets(loaded);
      setToolPresetVersions({});
      setToolPresetDetailState({});
      setToolPresetVersionState({});
      setUserToolPresetState({ status: "loaded", error: "" });
    } catch (error) {
      if (toolPresetLoadRef.current !== requestId) return;
      setUserToolPresetState({ status: "error", error: String(error?.message ?? "tool_presets_load_failed") });
    }
  }, []);

  useEffect(() => {
    if (templateMenuOpen && userToolPresetState.status === "idle") {
      loadUserToolPresets();
    }
    if (templateMenuOpen && excalidrawApi) {
      const selection = extractCanvasToolPresetTopology(
        excalidrawApi.getSceneElements?.() ?? [],
        excalidrawApi.getAppState?.().selectedElementIds ?? {},
      );
      toolPresetSelectionRef.current = selection;
      setToolPresetSelection(selection);
    }
  }, [excalidrawApi, loadUserToolPresets, templateMenuOpen, userToolPresetState.status]);

  useEffect(() => {
    if (!excalidrawApi) return undefined;
    const unsubscribe = excalidrawApi.onChange((elements, appState) => {
      const nextToolPresetSelection = extractCanvasToolPresetTopology(elements, appState.selectedElementIds ?? {});
      toolPresetSelectionRef.current = nextToolPresetSelection;
      if (templateMenuOpen) setToolPresetSelection(nextToolPresetSelection);
      const tool = appState.activeTool?.type;
      if (tool) setActiveTool((current) => current === tool ? current : tool);
      const nextViewport = {
        scrollX: appState.scrollX ?? 0,
        scrollY: appState.scrollY ?? 0,
        zoom: appState.zoom?.value ?? 1,
      };
      setViewport((current) => current.scrollX === nextViewport.scrollX && current.scrollY === nextViewport.scrollY && current.zoom === nextViewport.zoom ? current : nextViewport);

      const selectedIds = appState.selectedElementIds ?? {};
      const selected = elements.filter((element) => selectedIds[element.id] && !element.isDeleted);
      if (selected.length !== 1) {
        if (imageGeneratorRef.current || videoGeneratorRef.current || videoPlayerRef.current || workflowNodeRef.current) closePanels();
        return;
      }
      const element = selected[0];
      const bounds = { x: element.x, y: element.y, width: element.width, height: element.height };
      if (isImageGeneratorElement(element)) {
        const upstream = collectUpstreamCanvasInput(elements, excalidrawApi.getFiles?.() ?? {}, element.id);
        setImageGenerator({ id: element.id, bounds, data: { ...getImageGeneratorData(element), hasUpstreamPrompt: Boolean(upstream.upstreamTextFragments.length) } });
        if (videoGeneratorRef.current) setVideoGenerator(null);
        if (videoPlayerRef.current) setVideoPlayer(null);
        if (workflowNodeRef.current) setWorkflowNode(null);
        if (imageSourceRef.current) setImageSource(null);
      } else if (isVideoGeneratorElement(element)) {
        const upstream = collectUpstreamCanvasInput(elements, excalidrawApi.getFiles?.() ?? {}, element.id);
        setVideoGenerator({ id: element.id, bounds, data: { ...getVideoGeneratorData(element), hasUpstreamPrompt: Boolean(upstream.upstreamTextFragments.length) } });
        if (imageGeneratorRef.current) setImageGenerator(null);
        if (videoPlayerRef.current) setVideoPlayer(null);
        if (workflowNodeRef.current) setWorkflowNode(null);
        if (imageSourceRef.current) setImageSource(null);
      } else if (element.type === "image") {
        setImageSource({ id: element.id, bounds });
        setImageGenerator(null);
        setVideoGenerator(null);
        setVideoPlayer(null);
        setWorkflowNode(null);
      } else if (isWorkflowNodeElement(element)) {
        const workflowData = getWorkflowNodeData(element);
        const upstream = workflowData?.type === "audio-node"
          ? collectUpstreamCanvasInput(elements, excalidrawApi.getFiles?.() ?? {}, element.id)
          : null;
        setWorkflowNode({ id: element.id, bounds, data: { ...workflowData, ...(upstream ? { hasUpstreamPrompt: Boolean(upstream.upstreamTextFragments.length) } : {}) } });
        setImageGenerator(null);
        setVideoGenerator(null);
        setVideoPlayer(null);
        setImageSource(null);
      } else if (element.type === "embeddable" && (element.customData?.isVideo || isVideoUrl(element.link))) {
        setVideoPlayer({
          videoUrl: element.link,
          title: element.customData?.title || "视频",
          durationSeconds: element.customData?.durationSeconds,
        });
        setImageGenerator(null);
        setVideoGenerator(null);
        setWorkflowNode(null);
        setImageSource(null);
      } else if (imageGeneratorRef.current || imageSourceRef.current || videoGeneratorRef.current || videoPlayerRef.current || workflowNodeRef.current) {
        closePanels();
      }
    });
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [excalidrawApi, closePanels, templateMenuOpen]);

  const setTool = useCallback((type) => {
    onConnectionModeChange?.(false);
    excalidrawApi?.setActiveTool({ type });
    closeToolPopovers();
  }, [closeToolPopovers, excalidrawApi, onConnectionModeChange]);

  const setMovementTool = useCallback((type) => {
    setTool(type);
    window.requestAnimationFrame(() => movementButtonRef.current?.focus({ preventScroll: true }));
  }, [setTool]);
  const createTextNode = useCallback(() => {
    const anchor = addMenuAnchorRef.current;
    closeToolPopovers();
    const id = createTextNodeElement(excalidrawApi, {
      ...brandKitTextNodeOptions(brandKit),
      ...(anchor ? { anchor: { x: anchor.sceneX, y: anchor.sceneY } } : {}),
    });
    excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, [brandKit, closeToolPopovers, excalidrawApi]);
  const createImageGenerator = useCallback(() => {
    const anchor = addMenuAnchorRef.current;
    closeToolPopovers();
    const id = createImageGeneratorElement(excalidrawApi, anchor ? { anchor: { x: anchor.sceneX, y: anchor.sceneY } } : {});
    excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, [closeToolPopovers, excalidrawApi]);
  const createVideoGenerator = useCallback(() => {
    const anchor = addMenuAnchorRef.current;
    closeToolPopovers();
    const id = createVideoGeneratorElement(excalidrawApi, {
      aspectRatio: "16:9",
      ...(anchor ? { anchor: { x: anchor.sceneX, y: anchor.sceneY } } : {}),
    });
    excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, [closeToolPopovers, excalidrawApi]);
  const createWorkflowNode = useCallback((type) => {
    const anchor = addMenuAnchorRef.current;
    closeToolPopovers();
    const id = createWorkflowNodeElement(excalidrawApi, type, anchor ? { anchor: { x: anchor.sceneX, y: anchor.sceneY } } : {});
    if (id) excalidrawApi.updateScene({ appState: { selectedElementIds: { [id]: true } } });
  }, [closeToolPopovers, excalidrawApi]);
  const importMediaFiles = useCallback(async (event) => {
    const input = event.currentTarget ?? event.target;
    const files = Array.from(input.files ?? []).filter((file) => /^(?:image|video|audio)\//.test(file.type));
    const anchor = fileInsertAnchorRef.current;
    try {
      for (const [index, file] of files.entries()) {
        const options = index === 0 && anchor ? { anchor: { x: anchor.sceneX, y: anchor.sceneY } } : {};
        if (onImportImage) await onImportImage(file, excalidrawApi, options);
        else if (file.type.startsWith("image/")) await insertImageFileOnCanvas(excalidrawApi, file, options);
      }
    } finally {
      fileInsertAnchorRef.current = null;
      input.value = "";
      excalidrawApi.setActiveTool({ type: "selection" });
    }
  }, [excalidrawApi, onImportImage]);

  const handleGenerate = useCallback(async (request, execution = {}) => {
    return executeCanvasNodeGeneration({
      api: excalidrawApi,
      request,
      onGenerate,
      onStateChange: setGenerationState,
      signal: execution.signal,
      generationConfig,
    });
  }, [excalidrawApi, generationConfig, onGenerate]);

  const openImagePicker = useCallback(() => {
    fileInsertAnchorRef.current = addMenuAnchorRef.current;
    closeToolPopovers();
    fileInputRef.current?.click();
  }, [closeToolPopovers]);
  const openFilesView = useCallback((view) => {
    closeToolPopovers();
    onOpenFilesView?.(view);
  }, [closeToolPopovers, onOpenFilesView]);
  const findToolPreset = useCallback((presetId) => {
    return userToolPresets.find((preset) => preset.id === presetId)
      ?? CANVAS_TOOL_PRESETS.find((preset) => preset.id === presetId)
      ?? null;
  }, [userToolPresets]);
  const ensureToolPresetDetail = useCallback(async (preset) => {
    if (!preset) return null;
    const requestVersion = (toolPresetDetailRequestRef.current.get(preset.id) ?? 0) + 1;
    toolPresetDetailRequestRef.current.set(preset.id, requestVersion);
    setToolPresetDetailState((current) => ({ ...current, [preset.id]: { status: "loading", error: "" } }));
    try {
      const detail = await toolPresetCatalogRef.current.ensureDetail(preset);
      if (toolPresetDetailRequestRef.current.get(preset.id) !== requestVersion) return null;
      if (!detail || (detail.source === "user" && !detail.topology?.nodes?.length)) throw new Error("工具详情缺少可执行拓扑");
      setUserToolPresets((current) => current.map((item) => item.id === preset.id ? detail : item));
      setToolPresetDetailState((current) => ({ ...current, [preset.id]: { status: "loaded", error: "" } }));
      return detail;
    } catch (error) {
      if (toolPresetDetailRequestRef.current.get(preset.id) !== requestVersion) return null;
      const message = String(error?.message ?? "请求失败");
      setToolPresetDetailState((current) => ({ ...current, [preset.id]: { status: "error", error: message } }));
      excalidrawApi?.setToast?.({ message: `工具加载失败：${message}`, closable: true });
      return null;
    }
  }, [excalidrawApi]);
  const loadToolPresetVersions = useCallback(async (preset) => {
    if (!preset || preset.source !== "user") return [];
    const requestVersion = (toolPresetVersionRequestRef.current.get(preset.id) ?? 0) + 1;
    toolPresetVersionRequestRef.current.set(preset.id, requestVersion);
    setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "loading", error: "" } }));
    try {
      const { detail, versions } = await toolPresetCatalogRef.current.loadVersions(preset);
      if (toolPresetVersionRequestRef.current.get(preset.id) !== requestVersion) return [];
      if (!detail) {
        setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "error", error: "工具详情加载失败" } }));
        return [];
      }
      const entries = versions.length ? versions : [{ versionNumber: detail.currentVersionNumber }];
      setToolPresetVersions((current) => ({ ...current, [preset.id]: entries }));
      setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "loaded", error: "" } }));
      return entries;
    } catch (error) {
      if (toolPresetVersionRequestRef.current.get(preset.id) !== requestVersion) return [];
      const message = String(error?.message ?? "请求失败");
      setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "error", error: message } }));
      excalidrawApi?.setToast?.({ message: `版本列表加载失败：${message}`, closable: true });
      return [];
    }
  }, [ensureToolPresetDetail, excalidrawApi]);
  const insertTemplate = useCallback(async (templateId, options = {}) => {
    let preset = findToolPreset(templateId);
    if (!preset) {
      try {
        preset = await toolPresetCatalogRef.current.loadById(templateId);
      } catch (error) {
        excalidrawApi?.setToast?.({ message: `工具加载失败：${error?.message ?? "请求失败"}`, closable: true });
        return;
      }
    }
    const result = await toolPresetCatalogRef.current.insert(excalidrawApi, preset, options);
    if (result.ok) closeToolPopovers();
    if (!result.ok) {
      excalidrawApi?.setToast?.({ message: "工具预设插入失败。", closable: true });
      return;
    }
    excalidrawApi?.setToast?.({ message: `已插入${result.template.title}。`, closable: true });
  }, [closeToolPopovers, excalidrawApi, findToolPreset]);

  const saveSelectedToolPreset = useCallback(async () => {
    const selection = toolPresetSelectionRef.current;
    if (!selection.ok) {
      excalidrawApi?.setToast?.({ message: canvasToolPresetReasonMessage(selection.reason), closable: true });
      return;
    }
    const name = typeof window !== "undefined" ? window.prompt("工具名称", "我的工作流") : "我的工作流";
    if (!textInput(name)) return;
    setToolPresetAction("create");
    try {
      const response = await creatorApi.createToolPreset({
        name: textInput(name),
        category: selection.category,
        topology: selection.topology,
      });
      const created = normalizeCanvasUserToolPreset(responsePreset(response));
      if (created) {
        toolPresetCatalogRef.current.seedDetail(created.id, created);
        setUserToolPresets((current) => [created, ...current.filter((preset) => preset.id !== created.id)]);
        setToolPresetVersions((current) => ({ ...current, [created.id]: [{ versionNumber: created.currentVersionNumber }] }));
      }
      excalidrawApi?.setToast?.({ message: "工具预设已保存。", closable: true });
    } catch (error) {
      excalidrawApi?.setToast?.({ message: `保存失败：${error?.message ?? "请求失败"}`, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [excalidrawApi]);

  const renameToolPreset = useCallback(async (preset) => {
    const name = typeof window !== "undefined" ? window.prompt("重命名工具", preset.title) : preset.title;
    if (!textInput(name) || textInput(name) === preset.title) return;
    setToolPresetAction(`rename:${preset.id}`);
    try {
      const response = await creatorApi.updateToolPreset(preset.id, { name: textInput(name) });
      const updated = mergeCanvasUserToolPresetMetadata(preset, responsePreset(response));
      if (updated) {
        invalidateToolPresetRequests(updated.id);
        toolPresetCatalogRef.current.seedDetail(updated.id, updated);
        setUserToolPresets((current) => current.map((item) => item.id === preset.id ? updated : item));
      }
      excalidrawApi?.setToast?.({ message: "工具预设已重命名。", closable: true });
    } catch (error) {
      excalidrawApi?.setToast?.({ message: `重命名失败：${error?.message ?? "请求失败"}`, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [excalidrawApi, invalidateToolPresetRequests]);

  const updateToolPresetFromSelection = useCallback(async (preset) => {
    const selection = toolPresetSelectionRef.current;
    if (!selection.ok) {
      excalidrawApi?.setToast?.({ message: canvasToolPresetReasonMessage(selection.reason), closable: true });
      return;
    }
    setToolPresetAction(`update:${preset.id}`);
    try {
      const detail = await ensureToolPresetDetail(preset);
      if (!detail) return;
      const response = await creatorApi.updateToolPreset(preset.id, {
        topology: selection.topology,
        expectedVersionNumber: detail.currentVersionNumber,
      });
      const updated = normalizeCanvasUserToolPreset({ ...detail, ...responsePreset(response) });
      if (updated) {
        invalidateToolPresetRequests(updated.id);
        toolPresetCatalogRef.current.seedDetail(updated.id, updated);
        toolPresetCatalogRef.current.invalidateVersions(updated.id);
        setUserToolPresets((current) => current.map((item) => item.id === preset.id ? updated : item));
        setToolPresetVersions((current) => {
          const next = { ...current };
          delete next[preset.id];
          return next;
        });
        setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "idle", error: "" } }));
      }
      excalidrawApi?.setToast?.({ message: "已保存为新版本。", closable: true });
    } catch (error) {
      const conflicted = Number(error?.status) === 409;
      let conflictReloaded = false;
      if (conflicted) {
        invalidateToolPresetRequests(preset.id);
        try {
          const latest = await toolPresetCatalogRef.current.reloadDetail(preset);
          if (latest?.topology?.nodes?.length) {
            setUserToolPresets((current) => current.map((item) => item.id === preset.id ? latest : item));
            setToolPresetVersions((current) => {
              const next = { ...current };
              delete next[preset.id];
              return next;
            });
            setToolPresetDetailState((current) => ({ ...current, [preset.id]: { status: "loaded", error: "" } }));
            setToolPresetVersionState((current) => ({ ...current, [preset.id]: { status: "idle", error: "" } }));
            conflictReloaded = true;
          }
        } catch {
          setToolPresetDetailState((current) => ({ ...current, [preset.id]: { status: "error", error: "云端版本刷新失败" } }));
        }
      }
      const message = conflicted
        ? conflictReloaded
          ? "云端工具已有新版本，已刷新为最新版，请重新保存。"
          : "云端工具已有新版本，刷新失败，请重新打开工具箱后重试。"
        : `保存版本失败：${error?.message ?? "请求失败"}`;
      excalidrawApi?.setToast?.({ message, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [ensureToolPresetDetail, excalidrawApi, invalidateToolPresetRequests]);

  const duplicateToolPreset = useCallback(async (preset) => {
    const name = typeof window !== "undefined" ? window.prompt("副本名称", `${preset.title} 副本`) : `${preset.title} 副本`;
    if (!textInput(name)) return;
    setToolPresetAction(`duplicate:${preset.id}`);
    try {
      const response = await creatorApi.duplicateToolPreset(preset.id, { name: textInput(name) });
      const duplicate = normalizeCanvasUserToolPreset(responsePreset(response));
      if (duplicate) {
        toolPresetCatalogRef.current.seedDetail(duplicate.id, duplicate);
        setUserToolPresets((current) => [duplicate, ...current]);
        setToolPresetVersions((current) => ({ ...current, [duplicate.id]: [{ versionNumber: duplicate.currentVersionNumber }] }));
      }
      excalidrawApi?.setToast?.({ message: "工具预设已复制。", closable: true });
    } catch (error) {
      excalidrawApi?.setToast?.({ message: `复制失败：${error?.message ?? "请求失败"}`, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [excalidrawApi]);

  const deleteToolPreset = useCallback(async (preset) => {
    if (typeof window !== "undefined" && !window.confirm(`删除“${preset.title}”？`)) return;
    setToolPresetAction(`delete:${preset.id}`);
    try {
      await creatorApi.deleteToolPreset(preset.id);
      invalidateToolPresetRequests(preset.id);
      toolPresetCatalogRef.current.remove(preset.id);
      setUserToolPresets((current) => current.filter((item) => item.id !== preset.id));
      setToolPresetVersions((current) => {
        const next = { ...current };
        delete next[preset.id];
        return next;
      });
      excalidrawApi?.setToast?.({ message: "工具预设已删除。", closable: true });
    } catch (error) {
      excalidrawApi?.setToast?.({ message: `删除失败：${error?.message ?? "请求失败"}`, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [excalidrawApi, invalidateToolPresetRequests]);

  const selectToolPresetVersion = useCallback(async (preset, versionNumber) => {
    const selectedVersion = Number(versionNumber);
    if (!Number.isFinite(selectedVersion)) return;
    setToolPresetAction(`version:${preset.id}`);
    try {
      const selected = await toolPresetCatalogRef.current.selectVersion(preset, selectedVersion);
      if (selected?.topology?.nodes?.length) {
        invalidateToolPresetRequests(preset.id);
        setUserToolPresets((current) => current.map((item) => item.id === preset.id ? selected : item));
      } else {
        throw new Error("工具版本缺少可执行拓扑");
      }
    } catch (error) {
      excalidrawApi?.setToast?.({ message: `版本加载失败：${error?.message ?? "请求失败"}`, closable: true });
    } finally {
      setToolPresetAction("");
    }
  }, [excalidrawApi, invalidateToolPresetRequests]);

  useEffect(() => {
    if (!excalidrawApi) return undefined;
    const hasToolPreset = (event) => Array.from(event.dataTransfer?.types ?? []).includes(CANVAS_TOOL_PRESET_DRAG_TYPE);
    const canvasBounds = () => document.querySelector(".loomic-canvas-root")?.getBoundingClientRect?.();
    const withinCanvas = (event, bounds) => bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const handleDragOver = (event) => {
      const bounds = canvasBounds();
      if (!hasToolPreset(event) || !withinCanvas(event, bounds)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (event) => {
      const bounds = canvasBounds();
      if (!hasToolPreset(event) || !withinCanvas(event, bounds)) return;
      const templateId = String(event.dataTransfer?.getData(CANVAS_TOOL_PRESET_DRAG_TYPE) ?? "").trim();
      if (!templateId) return;
      event.preventDefault();
      event.stopPropagation();
      const appState = excalidrawApi.getAppState?.() ?? {};
      const zoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
      insertTemplate(templateId, {
        anchor: {
          x: (event.clientX - bounds.left) / zoom - (Number(appState.scrollX) || 0),
          y: (event.clientY - bounds.top) / zoom - (Number(appState.scrollY) || 0),
        },
      });
    };
    document.addEventListener("dragover", handleDragOver, true);
    document.addEventListener("drop", handleDrop, true);
    return () => {
      document.removeEventListener("dragover", handleDragOver, true);
      document.removeEventListener("drop", handleDrop, true);
    };
  }, [excalidrawApi, insertTemplate]);

  const drawingToolActive = DRAWING_TOOLS.some((tool) => tool.type === activeTool);

  return (
    <>
      <div
        ref={toolMenuRef}
        className="loomic-tool-menu"
        role="toolbar"
        aria-label="画布工具"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div ref={addMenuAnchorElementRef} className="loomic-tool-popover-anchor">
          <button
            type="button"
            className={`loomic-add-node-button ${addMenuOpen ? "is-active" : ""}`}
            aria-label="添加节点"
            title="添加节点（Tab）"
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
            onClick={toggleAddMenu}
          >
            <Plus aria-hidden="true" />
            <span>添加节点</span>
            <kbd>Tab</kbd>
          </button>
          {addMenuOpen ? (
            <div
              className={`loomic-tool-popover loomic-add-node-menu ${addMenuAnchor ? "is-canvas-anchored" : ""} ${addMenuAnchor?.submenuSide === "right" ? "opens-submenu-right" : ""}`}
              role="menu"
              aria-label="添加节点"
              style={addMenuAnchor ? { left: addMenuAnchor.menuLeft, top: addMenuAnchor.menuTop, bottom: "auto" } : undefined}
            >
              <div className="loomic-tool-popover-heading">
                <span>添加节点</span>
              </div>
              <button type="button" role="menuitem" onClick={createTextNode}>
                <span className="loomic-node-menu-icon is-text"><Type aria-hidden="true" /></span>
                <span><strong>文本</strong></span>
              </button>
              <button type="button" role="menuitem" onClick={createImageGenerator}>
                <span className="loomic-node-menu-icon is-image"><Sparkles aria-hidden="true" /></span>
                <span><strong>图片</strong></span>
              </button>
              <button type="button" role="menuitem" onClick={createVideoGenerator}>
                <span className="loomic-node-menu-icon is-video"><Video aria-hidden="true" /></span>
                <span><strong>视频</strong></span>
              </button>
              <button type="button" role="menuitem" onClick={() => createWorkflowNode("video-composition-node")}>
                <span className="loomic-node-menu-icon is-composition"><Film aria-hidden="true" /></span>
                <span><strong>视频合成</strong><em>Beta</em></span>
              </button>
              <button type="button" role="menuitem" onClick={() => createWorkflowNode("director-node")}>
                <span className="loomic-node-menu-icon is-director"><Layers3 aria-hidden="true" /></span>
                <span><strong>导演台</strong><em>NEW</em></span>
              </button>
              <button type="button" role="menuitem" onClick={() => createWorkflowNode("audio-node")}>
                <span className="loomic-node-menu-icon is-audio"><AudioWaveform aria-hidden="true" /></span>
                <span><strong>音频</strong></span>
              </button>
              <button type="button" role="menuitem" onClick={() => createWorkflowNode("script-node")}>
                <span className="loomic-node-menu-icon is-script"><ScrollText aria-hidden="true" /></span>
                <span><strong>脚本</strong></span>
              </button>
              {onOpenFilesView ? (
                <div className="loomic-add-node-submenu-anchor">
                  <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={addMaterialMenuOpen} onClick={() => setAddMaterialMenuOpen((open) => !open)}>
                    <span className="loomic-node-menu-icon is-material"><Images aria-hidden="true" /></span>
                    <span><strong>素材库</strong><em>NEW</em><ArrowRight aria-hidden="true" /></span>
                  </button>
                  {addMaterialMenuOpen ? (
                    <div className="loomic-tool-popover loomic-material-menu loomic-add-material-menu" role="menu" aria-label="素材库">
                      <div className="loomic-tool-popover-heading"><span>素材库</span></div>
                      <button type="button" role="menuitem" onClick={() => openFilesView("library-style")}>
                        <Sparkles aria-hidden="true" /><span><strong>风格库</strong><small>新增风格节点</small></span><em>NEW</em>
                      </button>
                      <button type="button" role="menuitem" disabled title="当前暂无可执行特效模板">
                        <Film aria-hidden="true" /><span><strong>特效库</strong><small>新增特效节点</small></span><em>NEW</em>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="loomic-add-node-section">添加资源</div>
              <button type="button" role="menuitem" onClick={openImagePicker}>
                <span className="loomic-node-menu-icon is-upload"><ImageUp aria-hidden="true" /></span>
                <span><strong>上传</strong></span>
              </button>
              {onOpenFilesView ? (
                <button type="button" role="menuitem" onClick={() => openFilesView("history")}>
                  <span className="loomic-node-menu-icon is-history"><History aria-hidden="true" /></span>
                  <span><strong>从生成历史选择</strong></span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="loomic-tool-popover-anchor">
          <button
            ref={movementButtonRef}
            type="button"
            className={`loomic-tool-button ${["selection", "hand"].includes(activeTool) || movementMenuOpen ? "is-active" : ""}`}
            title="移动工具"
            aria-label="移动"
            aria-expanded={movementMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setAddMenuOpen(false);
              setTemplateMenuOpen(false);
              setMaterialMenuOpen(false);
              setDrawingMenuOpen(false);
              setShortcutsOpen(false);
              setHelpOpen(false);
              setMovementMenuPosition((current) => ({ ...current, ready: false }));
              setMovementMenuOpen((open) => !open);
            }}
          >{activeTool === "hand" ? <Hand aria-hidden="true" /> : <MousePointer2 aria-hidden="true" />}</button>
          {movementMenuOpen ? createPortal(
            <div
              ref={movementMenuRef}
              className="loomic-tool-popover loomic-movement-menu is-portal"
              role="menu"
              aria-label="移动工具"
              style={{
                left: movementMenuPosition.left,
                top: movementMenuPosition.top,
                visibility: movementMenuPosition.ready ? "visible" : "hidden",
              }}
            >
              {MOVEMENT_TOOLS.map((tool) => {
                const Icon = tool.Icon;
                return (
                  <button key={tool.type} type="button" role="menuitemradio" aria-checked={activeTool === tool.type} aria-keyshortcuts={tool.shortcut} className={activeTool === tool.type ? "is-active" : ""} onClick={() => setMovementTool(tool.type)}>
                    <Icon aria-hidden="true" /><span>{tool.label}</span><kbd>{tool.shortcut}</kbd>
                  </button>
                );
              })}
            </div>,
            toolMenuRef.current?.closest(".loomic-canvas-root") ?? document.body,
          ) : null}
        </div>

        <div className="loomic-tool-popover-anchor">
          <button
            type="button"
            className={`loomic-tool-button ${templateMenuOpen ? "is-active" : ""}`}
            title="工具箱"
            aria-label="打开工具箱"
            aria-expanded={templateMenuOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setAddMenuOpen(false);
              setMaterialMenuOpen(false);
              setMovementMenuOpen(false);
              setDrawingMenuOpen(false);
              setShortcutsOpen(false);
              setHelpOpen(false);
              setTemplateMenuOpen((open) => !open);
            }}
          ><Boxes aria-hidden="true" /></button>
        </div>

        {onOpenFilesView ? (
          <>
            <div className="loomic-tool-popover-anchor">
              <button
                type="button"
                className={`loomic-tool-button ${materialMenuOpen ? "is-active" : ""}`}
                title="素材库"
                aria-label="素材库"
                aria-expanded={materialMenuOpen}
                aria-haspopup="menu"
                onClick={() => {
                  const nextOpen = !materialMenuOpen;
                  closeToolPopovers();
                  setMaterialMenuOpen(nextOpen);
                }}
              ><Images aria-hidden="true" /></button>
              {materialMenuOpen ? (
                <div className="loomic-tool-popover loomic-material-menu" role="menu" aria-label="素材库">
                  <div className="loomic-tool-popover-heading"><span>素材库</span></div>
                  <button type="button" role="menuitem" onClick={() => openFilesView("library-style")}>
                    <Sparkles aria-hidden="true" />
                    <span><strong>风格库</strong><small>新增风格节点</small></span>
                    <em>NEW</em>
                  </button>
                  <button type="button" role="menuitem" disabled title="当前暂无可执行特效模板">
                    <Film aria-hidden="true" />
                    <span><strong>特效库</strong><small>新增特效节点</small></span>
                    <em>NEW</em>
                  </button>
                </div>
              ) : null}
            </div>
            <button type="button" className="loomic-tool-button" title="角色库" aria-label="角色库" onClick={() => openFilesView("library-character")}><UserRound aria-hidden="true" /></button>
            <button type="button" className="loomic-tool-button" title="历史记录" aria-label="历史记录" onClick={() => openFilesView("history")}><History aria-hidden="true" /></button>
          </>
        ) : null}

        <div className="loomic-tool-popover-anchor">
          <button
            type="button"
            className={`loomic-tool-button ${shortcutsOpen ? "is-active" : ""}`}
            title="快捷键"
            aria-label="快捷键"
            aria-expanded={shortcutsOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setAddMenuOpen(false);
              setTemplateMenuOpen(false);
              setMaterialMenuOpen(false);
              setMovementMenuOpen(false);
              setDrawingMenuOpen(false);
              setHelpOpen(false);
              setShortcutsOpen((open) => !open);
            }}
          ><Keyboard aria-hidden="true" /></button>
        </div>
        <div className="loomic-tool-popover-anchor">
          <button
            type="button"
            className={`loomic-tool-button ${helpOpen ? "is-active" : ""}`}
            title="教程"
            aria-label="教程"
            aria-expanded={helpOpen}
            aria-haspopup="menu"
            onClick={() => {
              const nextOpen = !helpOpen;
              closeToolPopovers();
              setHelpOpen(nextOpen);
            }}
          ><CircleHelp aria-hidden="true" /></button>
          {helpOpen ? (
            <div className="loomic-tool-popover loomic-help-menu" role="menu" aria-label="教程">
              <a href={CREATOR_GUIDE_URL} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setHelpOpen(false)}><BookOpen aria-hidden="true" /><span>使用教程</span></a>
              <button
                type="button"
                role="menuitem"
                disabled={!supportConfig.communityImageUrl}
                title={supportConfig.status === "loading" ? "正在加载联系方式" : supportConfig.communityImageUrl ? "联系客服" : "暂未配置客服联系方式"}
                onClick={() => setHelpContact({ title: "联系客服", imageUrl: resolveApiUrl(supportConfig.communityImageUrl) })}
              ><Headphones aria-hidden="true" /><span>联系客服</span></button>
              <button
                type="button"
                role="menuitem"
                disabled={!supportConfig.enterpriseContactImageUrl}
                title={supportConfig.status === "loading" ? "正在加载联系方式" : supportConfig.enterpriseContactImageUrl ? "联系销售" : "暂未配置销售联系方式"}
                onClick={() => setHelpContact({ title: "联系销售", imageUrl: resolveApiUrl(supportConfig.enterpriseContactImageUrl) })}
              ><BadgeDollarSign aria-hidden="true" /><span>联系销售</span></button>
              <button type="button" role="menuitem" disabled title="暂未配置公众号联系方式"><QrCode aria-hidden="true" /><span>关注公众号</span></button>
              {helpContact ? (
                <section className="loomic-help-contact-card" role="dialog" aria-label={helpContact.title}>
                  <header><strong>{helpContact.title}</strong><button type="button" aria-label={`关闭${helpContact.title}`} onClick={() => setHelpContact(null)}><X aria-hidden="true" /></button></header>
                  <img src={helpContact.imageUrl} alt={`${helpContact.title}二维码`} loading="lazy" />
                  <span>请使用微信扫码</span>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
        <span className="loomic-tool-separator loomic-tool-extension-separator" aria-hidden="true" />
        <button
          type="button"
          className={`loomic-tool-button ${connectionModeActive ? "is-active" : ""}`}
          title="连接节点 (Ctrl/⌘+L)"
          aria-label="连接节点"
          aria-keyshortcuts="Control+L Meta+L"
          aria-pressed={connectionModeActive}
          onClick={() => {
            closeToolPopovers();
            onConnectionModeChange?.(!connectionModeActive);
          }}
        ><Share2 aria-hidden="true" /></button>
        <div className="loomic-tool-popover-anchor">
          <button
            type="button"
            className={`loomic-tool-button ${drawingToolActive || drawingMenuOpen ? "is-active" : ""}`}
            title="绘图工具"
            aria-label="绘图工具"
            aria-expanded={drawingMenuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setAddMenuOpen(false);
              setTemplateMenuOpen(false);
              setMaterialMenuOpen(false);
              setMovementMenuOpen(false);
              setShortcutsOpen(false);
              setHelpOpen(false);
              setDrawingMenuOpen((open) => !open);
            }}
          ><Pencil aria-hidden="true" /></button>
          {drawingMenuOpen ? (
            <div className="loomic-tool-popover loomic-drawing-menu" role="menu" aria-label="绘图工具">
              <div className="loomic-tool-popover-heading"><span>自由绘图</span></div>
              <div className="loomic-drawing-grid">
                {DRAWING_TOOLS.map((tool) => {
                  const Icon = tool.Icon;
                  return (
                    <button key={tool.type} type="button" role="menuitem" className={activeTool === tool.type ? "is-active" : ""} onClick={() => setTool(tool.type)}>
                      <Icon aria-hidden="true" /><span>{tool.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <input ref={fileInputRef} className="loomic-visually-hidden" type="file" accept="image/*,video/*,audio/*" multiple onChange={importMediaFiles} />
      </div>
      {shortcutsOpen ? createPortal(
        <section
          ref={shortcutsPanelRef}
          className="loomic-tool-popover loomic-shortcuts-panel"
          role="dialog"
          aria-label="快捷键"
          style={{
            "--loomic-shortcuts-left": leftPanelOpen ? "calc(50% + 140px)" : "50%",
            "--loomic-shortcuts-inset": leftPanelOpen ? "280px" : "0px",
          }}
        >
          <button type="button" className="loomic-icon-button loomic-shortcuts-close" aria-label="关闭快捷键" onClick={() => setShortcutsOpen(false)}><X aria-hidden="true" /></button>
          {CANVAS_SHORTCUT_GROUPS.map((group) => (
            <div className="loomic-shortcut-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((item) => (
                <div className="loomic-shortcut-row" key={item.label}>
                  <span>{item.label}</span>
                  <span>{item.keys.map((key) => <kbd key={key}>{key}</kbd>)}</span>
                </div>
              ))}
            </div>
          ))}
        </section>,
        toolMenuRef.current?.closest(".loomic-canvas-root") ?? document.body,
      ) : null}
      {templateMenuOpen ? (
        <section ref={toolboxRef} className="loomic-tool-popover loomic-template-menu" role="dialog" aria-label="工具箱">
          <header className="loomic-toolbox-header">
            <div className="loomic-toolbox-title">
              <strong>我的工具箱</strong>
              <span className="loomic-toolbox-help">
                <button type="button" aria-label="工具箱说明" aria-haspopup="dialog" aria-controls="loomic-toolbox-help"><CircleHelp aria-hidden="true" /></button>
                <span id="loomic-toolbox-help" role="dialog" aria-label="工具箱说明" className="loomic-toolbox-help-tooltip">
                  <span>使用工具箱模板加速创作，快速构建你的专属工具箱。</span>
                  <a href={CREATOR_GUIDE_URL} target="_blank" rel="noopener noreferrer">查看详细教程</a>
                </span>
              </span>
            </div>
            <button type="button" className="loomic-toolbox-close" aria-label="关闭工具箱" onClick={() => setTemplateMenuOpen(false)}><X aria-hidden="true" /></button>
          </header>
          <div className="loomic-toolbox-controls">
            <div className="loomic-toolbox-categories" role="tablist" aria-label="工具分类">
              {CANVAS_TOOL_PRESET_CATEGORIES.map((category) => (
                <button key={category.id} type="button" role="tab" aria-selected={toolboxCategory === category.id} className={toolboxCategory === category.id ? "is-active" : ""} onClick={() => setToolboxCategory(category.id)}>{category.label}</button>
              ))}
            </div>
            <button
              type="button"
              className="loomic-toolbox-save"
              disabled={!toolPresetSelection.ok || Boolean(toolPresetAction)}
              title={toolPresetSelection.ok ? "把所选工作流保存为工具" : canvasToolPresetReasonMessage(toolPresetSelection.reason)}
              onClick={saveSelectedToolPreset}
            ><Save aria-hidden="true" /><span>{toolPresetAction === "create" ? "保存中" : "保存所选"}</span></button>
          </div>
          {userToolPresetState.status === "loading" ? <div className="loomic-toolbox-state" role="status">正在加载我的工具...</div> : null}
          {userToolPresetState.status === "error" ? (
            <div className="loomic-toolbox-state is-error" role="alert">
              <span>我的工具加载失败</span>
              <button type="button" onClick={loadUserToolPresets}><RefreshCw aria-hidden="true" /><span>重试</span></button>
            </div>
          ) : null}
          {userToolPresetState.status === "loaded" && !userToolPresets.length ? <div className="loomic-toolbox-state">暂无自定义工具</div> : null}
          <div className="loomic-tool-preset-grid">
            {visibleToolPresets.map((preset) => (
              <article
                className={`loomic-tool-preset-card ${preset.source === "user" ? "is-user" : "is-builtin"} ${toolPresetDetailState[preset.id]?.status === "error" ? "is-error" : ""}`}
                key={preset.id}
                draggable="true"
                aria-busy={toolPresetDetailState[preset.id]?.status === "loading"}
                title={toolPresetDetailState[preset.id]?.status === "error" ? `工具加载失败：${toolPresetDetailState[preset.id].error}` : preset.description}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(CANVAS_TOOL_PRESET_DRAG_TYPE, preset.id);
                  if (preset.source === "user") void ensureToolPresetDetail(preset);
                }}
              >
                <div className="loomic-tool-preset-visual">
                  <ToolPresetPreview preset={preset} />
                  <button
                    type="button"
                    disabled={toolPresetDetailState[preset.id]?.status === "loading"}
                    aria-label={`${toolPresetDetailState[preset.id]?.status === "error" ? "重试加载并使用" : "使用"}${preset.title}`}
                    onClick={() => insertTemplate(preset.id)}
                  >使用</button>
                </div>
                <div className="loomic-tool-preset-copy">
                  <span>{preset.source === "user" ? "我的工具" : preset.categoryLabel}</span>
                  <strong>{preset.title}</strong>
                </div>
                {preset.source === "user" ? (
                  <div className="loomic-tool-preset-controls" onPointerDown={(event) => event.stopPropagation()}>
                    <select
                      aria-label={`${preset.title}版本`}
                      value={preset.selectedVersionNumber}
                      disabled={Boolean(toolPresetAction)}
                      title={toolPresetVersionState[preset.id]?.status === "error" ? `版本列表加载失败：${toolPresetVersionState[preset.id].error}` : "选择工具版本"}
                      onFocus={() => { void loadToolPresetVersions(preset); }}
                      onPointerDown={() => { void loadToolPresetVersions(preset); }}
                      onChange={(event) => selectToolPresetVersion(preset, event.target.value)}
                    >
                      {(toolPresetVersions[preset.id] ?? [{ versionNumber: preset.currentVersionNumber }]).map((version) => (
                        <option key={version.versionNumber} value={version.versionNumber}>v{version.versionNumber}</option>
                      ))}
                    </select>
                    <button type="button" title="用所选工作流保存新版本" aria-label={`更新${preset.title}`} disabled={!toolPresetSelection.ok || Boolean(toolPresetAction)} onClick={() => updateToolPresetFromSelection(preset)}><Save aria-hidden="true" /></button>
                    <button type="button" title="重命名" aria-label={`重命名${preset.title}`} disabled={Boolean(toolPresetAction)} onClick={() => renameToolPreset(preset)}><Pencil aria-hidden="true" /></button>
                    <button type="button" title="复制" aria-label={`复制${preset.title}`} disabled={Boolean(toolPresetAction)} onClick={() => duplicateToolPreset(preset)}><Copy aria-hidden="true" /></button>
                    <button type="button" title="删除" aria-label={`删除${preset.title}`} disabled={Boolean(toolPresetAction)} onClick={() => deleteToolPreset(preset)}><Trash2 aria-hidden="true" /></button>
                  </div>
                ) : null}
              </article>
            ))}
            {!visibleToolPresets.length ? <p className="loomic-toolbox-empty">没有匹配的工具</p> : null}
          </div>
        </section>
      ) : null}
      {imageGenerator && <ImageGeneratorPanel elementId={imageGenerator.id} elementBounds={imageGenerator.bounds} data={imageGenerator.data} excalidrawApi={excalidrawApi} canvasScrollZoom={viewport} onClose={() => setImageGenerator(null)} onGenerate={handleGenerate} onArchiveImage={onArchiveImage} generating={generationState.running && generationState.id === imageGenerator.id || generating} generationError={generationState.id === imageGenerator.id ? generationState.error : generationError} />}
      {imageSource && <ImageSourceActionsPanel elementBounds={imageSource.bounds} canvasScrollZoom={viewport} onClose={() => setImageSource(null)} onImageToImage={() => { const id = createImageToImageGenerator(excalidrawApi, imageSource.id); if (id) setImageSource(null); }} />}
      {videoGenerator && <VideoGeneratorPanel elementId={videoGenerator.id} elementBounds={videoGenerator.bounds} data={videoGenerator.data} excalidrawApi={excalidrawApi} canvasScrollZoom={viewport} onClose={() => setVideoGenerator(null)} onGenerate={handleGenerate} onArchiveImage={onArchiveImage} generating={generationState.running && generationState.id === videoGenerator.id || generating} generationError={generationState.id === videoGenerator.id ? generationState.error : generationError} />}
      {workflowNode && <WorkflowNodePanel elementId={workflowNode.id} elementBounds={workflowNode.bounds} data={workflowNode.data} excalidrawApi={excalidrawApi} canvasScrollZoom={viewport} canvasProjectId={canvasProjectId} onGenerate={handleGenerate} onCancelGeneration={onCancelGeneration} onCompose={onCompose} onPersistCanvas={onPersistCanvas} onClose={() => setWorkflowNode(null)} />}
      {videoPlayer && <VideoPlayerPanel {...videoPlayer} onClose={() => setVideoPlayer(null)} />}
    </>
  );
}
