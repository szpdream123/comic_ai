import React, { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, FONT_FAMILY, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./loomic-core.css";
import { CanvasBottomBar } from "./CanvasBottomBar.jsx";
import { CanvasLayersPanel } from "./CanvasLayersPanel.jsx";
import { CanvasPortsOverlay } from "./CanvasPortsOverlay.jsx";
import { CanvasToolMenu } from "./CanvasToolMenu.jsx";
import { resolveCanvasQuickAddRequest } from "./canvas-quick-add.js";
import { applyCanvasLayoutGeometry, autoLayoutCanvasElements, canvasLayoutSettingsToOptions, hasCanvasLayoutRestoreConflict, restoreCanvasLayoutElements } from "./canvas-auto-layout.js";
import {
  buildCanvasNodeGenerationRequest,
  buildCanvasWorkflowGenerationPlan,
  createCanvasWorkflowRunQueue,
  executeCanvasNodeGeneration,
} from "./canvas-generation-execution.js";
import { collectCanvasGenerationDependencyFingerprints, markChangedCanvasGenerationDependencies } from "./canvas-generation-dependencies.js";
import { isVideoUrl } from "./canvas-elements.js";
import {
  applyCanvasImageArchiveResult,
  archiveNewCanvasImageFiles,
  compactCanvasElementsForPersistence,
  compactCanvasFilesForPersistence,
  createCanvasImageArchiveTracker,
  hydrateCanvasElementsForDisplay,
  hydrateCanvasFilesForDisplay,
  isCanvasImageArchiveCandidateCurrent,
} from "./canvas-file-persistence.js";
import { normalizeCanvasElements } from "./canvas-normalize.js";
import { markCanvasDrawingArrowsNonWorkflow } from "./canvas-workflow-edges.js";
import { inspectCanvasUploadRecovery, markCanvasUploadsForSourceRecovery } from "./canvas-upload-recovery.js";
import { canAdoptCanvasRemoteUpdate, canCheckCanvasRemoteUpdate, classifyCanvasRemoteChange, mergeCanvasRemoteAppState } from "./canvas-remote-sync.js";
import { createCanvasSelectionClipboard, duplicateCanvasSelection, groupCanvasSelection, serializeCanvasSelectionClipboard } from "./canvas-selection-clipboard.js";
import { ungroupCanvasLayers } from "./canvas-layer-operations.js";
import { canvasVersionFingerprint } from "./canvas-version-history.js";
import { VideoCanvasElement } from "./VideoCanvasElement.jsx";
import { exportCanvasImage } from "./canvas-export.js";
import {
  canvasDirectorRecoveryInputFromPayload,
  canvasDirectorRecoveryInputsMatch,
  canvasDirectorResultPatch,
  collectCanvasDirectorRecoveryCandidates,
  findLatestCanvasDirectorResult,
} from "./canvas-director-execution.js";
import { useCanvasGenerationConfig } from "./CanvasGenerationConfigContext.jsx";
import { buildCanvasGenerationParameters, buildCanvasGenerationPayload } from "./canvas-generation.js";
import { estimateCanvasGenerationBatchCredits, normalizeCanvasCreditBalance } from "./canvas-generation-credits.js";
import { resolveCanvasGenerationModels } from "./canvas-generation-models.js";
import { updateWorkflowNodeElement } from "./workflow-node-elements.js";
import { matchesCanvasShortcut } from "./canvas-shortcuts.js";
import { canvasScrollForZoom, visibleCanvasFitElements } from "./canvas-minimap.js";
import { projectCanvasConnectionsForView, restoreCanvasConnectionsForPersistence, syncCanvasConnectionVisibility } from "./canvas-connection-visibility.js";
import { createCanvasDragDuplicate } from "./canvas-drag-duplicate.js";
import { clearBrandKitCanvasFont, registerBrandKitCanvasFont } from "../loomic-shell/canvas-brand-kit.js";

export { exportCanvasImage };

const EMPTY_CONTENT = { elements: [], appState: {}, files: {} };
const SAVE_DELAY = 1200;
const SAVE_RETRY_DELAYS = [3000, 10000, 30000];
const IMAGE_ARCHIVE_RETRY_DELAYS = [2000, 10000];
const REMOTE_SYNC_INTERVAL = 5000;
const WORKFLOW_RUN_STORAGE_PREFIX = "loomic-canvas-workflow-run:";
const EXCALIDRAW_ZH_OVERRIDES = new Map([
  ["Toggle grid", "切换网格"],
  ["Canvas & Shape properties", "画布与图形属性"],
  ["Wrap selection in frame", "将选区置于画框中"],
  ["Copy link to object", "复制对象链接"],
]);

function workflowGenerationKind(request) {
  if (request?.type === "video-generator") return "video";
  if (request?.type === "audio-node") return "audio";
  if (request?.type === "image-generator") return "image";
  return "";
}

function localizeExcalidrawText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const source = node.nodeValue ?? "";
    const trimmed = source.trim();
    const translated = EXCALIDRAW_ZH_OVERRIDES.get(trimmed);
    if (translated) node.nodeValue = source.replace(trimmed, translated);
  }
}

class CanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[loomic-canvas] render failed", error, info); }
  render() {
    if (this.state.error) {
      return <div className="loomic-canvas-error"><strong>画布加载失败</strong><span>请刷新页面或稍后重试。</span><button type="button" onClick={() => this.setState({ error: null })}>重试</button></div>;
    }
    return this.props.children;
  }
}

function readLocalContent(storageKey) {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn("[loomic-canvas] local content could not be read", error);
    return null;
  }
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    target.isContentEditable
    || target.matches("input, textarea, select, [role='textbox']")
  );
}

function hitCanvasNodeAtPoint(elements, point, zoom = 1) {
  const padding = 8 / (Number(zoom) || 1);
  return [...(Array.isArray(elements) ? elements : [])].reverse().find((element) => {
    if (!element || element.isDeleted || element.locked || element.type === "arrow" || element.customData?.loomicHidden === true) return false;
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const width = Number(element.width) || 0;
    const height = Number(element.height) || 0;
    return point.x >= Math.min(x, x + width) - padding
      && point.x <= Math.max(x, x + width) + padding
      && point.y >= Math.min(y, y + height) - padding
      && point.y <= Math.max(y, y + height) + padding;
  }) ?? null;
}

function workflowRunStorageKey(canvasId) {
  return `${WORKFLOW_RUN_STORAGE_PREFIX}${String(canvasId || "default")}`;
}

function readWorkflowRunSnapshot(canvasId) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(workflowRunStorageKey(canvasId));
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.warn("[loomic-canvas] workflow run state could not be read", error);
    return null;
  }
}

function persistWorkflowRunSnapshot(canvasId, snapshot) {
  if (typeof window === "undefined") return;
  try {
    const key = workflowRunStorageKey(canvasId);
    if (snapshot) window.localStorage.setItem(key, JSON.stringify(snapshot));
    else window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("[loomic-canvas] workflow run state could not be saved", error);
  }
}

function waitForExistingCanvasGeneration(api, elementId) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    const inspect = () => {
      const element = api.getSceneElements?.().find((candidate) => candidate.id === elementId && !candidate.isDeleted);
      const status = String(element?.customData?.status ?? "");
      if (status === "completed") {
        unsubscribe?.();
        resolve();
      } else if (!element || status === "failed") {
        unsubscribe?.();
        reject(new Error(element?.customData?.error || "生成任务恢复失败"));
      }
    };
    unsubscribe = api.onChange?.(inspect);
    inspect();
  });
}

function toSerializableContent(api, elements, appState) {
  const persistentElements = restoreCanvasConnectionsForPersistence(api, elements);
  const files = compactCanvasFilesForPersistence(persistentElements, api?.getFiles?.() ?? {});
  return {
    elements: compactCanvasElementsForPersistence(persistentElements.filter((element) => !element.isDeleted)),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridModeEnabled: appState.gridModeEnabled,
      theme: appState.theme,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      zoom: appState.zoom,
    },
    files,
  };
}

const MemoToolMenu = memo(CanvasToolMenu);

export function CanvasEditor({
  canvasId = "default",
  initialContent = EMPTY_CONTENT,
  storage,
  storageKey = `loomic-canvas:${canvasId}`,
  theme = "dark",
  className = "",
  leftPanelOpen = false,
  layersOpen: controlledLayersOpen,
  onToggleLayers,
  showToolMenu = true,
  showBottomBar = true,
  onApiReady,
  onSelectionChange,
  onChange,
  onGenerate,
  onCancelGeneration,
  onCompose,
  canvasProjectId,
  onArchiveImage,
  onCheckUploadSession,
  onImportImage,
  onSaveStateChange,
  onToggleFiles,
  onOpenFilesView,
  filesOpen = false,
  brandKit = null,
  viewMode = "workflow",
}) {
  const generationConfig = useCanvasGenerationConfig();
  const generationConfigRef = useRef(generationConfig);
  generationConfigRef.current = generationConfig;
  const localContent = useMemo(() => readLocalContent(storage ? null : storageKey), [storage, storageKey]);
  const [storedContent, setStoredContent] = useState(undefined);
  useEffect(() => {
    if (!storage?.load) {
      setStoredContent(null);
      return undefined;
    }
    let active = true;
    Promise.resolve(storage.load(canvasId))
      .then((value) => { if (active) setStoredContent(value ?? null); })
      .catch((error) => {
        console.warn("[loomic-canvas] external content could not be read", error);
        if (active) setStoredContent(null);
      });
    return () => { active = false; };
  }, [canvasId, storage]);
  useEffect(() => {
    localizeExcalidrawText(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeExcalidrawText(mutation.target.parentNode ?? document.body);
        for (const node of mutation.addedNodes) localizeExcalidrawText(node.nodeType === Node.TEXT_NODE ? node.parentNode : node);
      }
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const hydratedContent = storage ? (storedContent ?? initialContent ?? EMPTY_CONTENT) : (localContent ?? initialContent ?? EMPTY_CONTENT);
  const initialData = useMemo(() => {
    const elements = hydrateCanvasElementsForDisplay(
      compactCanvasElementsForPersistence(hydratedContent.elements ?? []),
    );
    return {
      elements,
      appState: { ...(hydratedContent.appState ?? {}), theme },
      files: hydrateCanvasFilesForDisplay(elements, hydratedContent.files ?? {}),
    };
  }, [hydratedContent, theme]);
  const [api, setApi] = useState(null);
  const [internalLayersOpen, setInternalLayersOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [connectionModeActive, setConnectionModeActive] = useState(false);
  const [addMenuRequest, setAddMenuRequest] = useState(null);
  const [autoLayoutRunning, setAutoLayoutRunning] = useState(false);
  const [autoLayoutReview, setAutoLayoutReview] = useState(null);
  const [layoutSettings, setLayoutSettings] = useState({ direction: "RIGHT", spacing: "standard" });
  const [workflowRunState, setWorkflowRunState] = useState({
    status: "idle",
    total: 0,
    completed: 0,
    currentNodeId: null,
    pendingNodeIds: [],
    failures: [],
  });
  const autoLayoutPromiseRef = useRef(null);
  const canvasScopeRef = useRef({ api, canvasId });
  canvasScopeRef.current = { api, canvasId };
  const workflowRunQueueRef = useRef(null);
  const keyboardGenerationRunningRef = useRef(false);
  const rootRef = useRef(null);
  const dragDuplicateIntentRef = useRef(null);
  const dragDuplicateGestureRef = useRef(null);
  const layersOpen = controlledLayersOpen === undefined ? internalLayersOpen : controlledLayersOpen;
  const workflowVisible = viewMode === "workflow";
  const toggleLayers = useCallback(() => {
    if (onToggleLayers) onToggleLayers();
    else setInternalLayersOpen((open) => !open);
  }, [onToggleLayers]);
  const openNodeMenuAtDoubleClick = useCallback((event) => {
    if (!workflowVisible || !showToolMenu || !api || !(event.target instanceof HTMLCanvasElement)) return;
    const request = resolveCanvasQuickAddRequest(api, event, rootRef.current?.getBoundingClientRect?.());
    if (!request) return;
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
    setAddMenuRequest((current) => ({ ...request, requestId: (current?.requestId ?? 0) + 1 }));
  }, [api, showToolMenu, workflowVisible]);

  useEffect(() => {
    if (workflowVisible) return;
    setConnectionModeActive(false);
    setMinimapOpen(false);
    api?.setActiveTool?.({ type: "selection" });
  }, [api, workflowVisible]);
  const saveTimerRef = useRef(null);
  const saveRetryTimerRef = useRef(null);
  const saveRetryAttemptRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());
  const saveInFlightRef = useRef(false);
  const persistRef = useRef(null);
  const hydratedRef = useRef(false);
  const pendingRef = useRef(null);
  const lastScheduledContentRef = useRef("");
  const selectedKeyRef = useRef("");
  const selectionCallbackRef = useRef(onSelectionChange);
  const imageArchiveTrackerRef = useRef(createCanvasImageArchiveTracker(initialData.files ?? {}));
  const imageArchiveAttemptsRef = useRef(new Map());
  const imageArchiveRetryTimersRef = useRef(new Map());
  const imageArchiveScopeRef = useRef(null);
  const generationDependenciesRef = useRef(null);
  const directorRecoveryAttemptsRef = useRef(new Set());
  const remoteApplyFingerprintRef = useRef("");
  const remoteApplyInProgressRef = useRef(false);
  const archiveNativeCanvasImagesRef = useRef(null);
  selectionCallbackRef.current = onSelectionChange;

  useEffect(() => {
    if (storage?.load && storedContent === undefined) return;
    imageArchiveTrackerRef.current.seed(initialData.files ?? {});
  }, [initialData.files, storage, storedContent]);

  const setExcalidrawApi = useCallback((nextApi) => {
    setApi(nextApi);
    onApiReady?.(nextApi);
  }, [onApiReady]);

  useEffect(() => {
    if (!api) return undefined;
    let active = true;
    const runtime = {
      fontFamilies: FONT_FAMILY,
      documentFonts: document.fonts,
      FontFaceCtor: typeof FontFace === "function" ? FontFace : null,
    };
    if (!brandKit) {
      if (clearBrandKitCanvasFont(runtime)) api.refresh?.();
      return () => { active = false; };
    }
    void registerBrandKitCanvasFont(brandKit, runtime).then((registered) => {
      if (active && registered) api.refresh?.();
    }).catch((error) => {
      console.warn("[loomic-canvas] brand font could not be loaded", error);
    });
    return () => { active = false; };
  }, [api, brandKit]);

  useEffect(() => {
    if (!api || typeof onGenerate !== "function") {
      workflowRunQueueRef.current = null;
      return undefined;
    }
    let active = true;
    const controller = createCanvasWorkflowRunQueue({
      execute: (request, execution) => {
        const element = api.getSceneElements?.().find((candidate) => candidate.id === request.elementId && !candidate.isDeleted);
        const currentRequest = buildCanvasNodeGenerationRequest(element);
        if (!currentRequest) return Promise.reject(new Error("生成节点已删除或不可运行，工作流已暂停。"));
        if (request.__restoredWorkflowCurrent && element?.customData?.taskId) {
          if (element.customData.status === "completed") return Promise.resolve();
          if (element.customData.status === "failed") return Promise.reject(new Error(element.customData.error || "生成任务恢复失败"));
          if (element.customData.status === "running") return waitForExistingCanvasGeneration(api, request.elementId);
          return Promise.reject(new Error("已有生成任务状态不可恢复"));
        }
        return executeCanvasNodeGeneration({ api, request: currentRequest, onGenerate, signal: execution?.signal, generationConfig: generationConfigRef.current });
      },
      onChange: (state) => { if (active) setWorkflowRunState(state); },
      initialSnapshot: readWorkflowRunSnapshot(canvasId),
      onSnapshotChange: (snapshot) => persistWorkflowRunSnapshot(canvasId, snapshot),
    });
    workflowRunQueueRef.current = controller;
    setWorkflowRunState(controller.getState());
    return () => {
      active = false;
      controller.dispose();
      if (workflowRunQueueRef.current === controller) workflowRunQueueRef.current = null;
    };
  }, [api, canvasId, onGenerate]);

  const runCanvasWorkflow = useCallback(() => {
    const controller = workflowRunQueueRef.current;
    if (!api || !controller) {
      api?.setToast?.({ message: "当前画布没有可用的生成服务。", closable: true });
      return;
    }
    const status = controller.getState().status;
    if (status === "paused" || status === "failed") {
      controller.resume();
      return;
    }
    const elements = api.getSceneElements?.() ?? [];
    let plan;
    try {
      plan = buildCanvasWorkflowGenerationPlan(elements);
    } catch (error) {
      api.setToast?.({ message: error instanceof Error ? error.message : "工作流连接无效，请检查后重试。", closable: true });
      return;
    }
    if (!plan.length) {
      api.setToast?.({ message: "画布中没有可运行的生成节点。", closable: true });
      return;
    }
    if (plan.some((request) => elements.find((element) => element.id === request.elementId)?.customData?.status === "running")) {
      api.setToast?.({ message: "已有节点正在单独生成，请等待完成后再运行工作流。", closable: true });
      return;
    }
    const creditEstimate = estimateCanvasGenerationBatchCredits(plan.map((request) => {
      const kind = workflowGenerationKind(request);
      const modelCode = String(request?.modelCode ?? request?.model ?? "").trim();
      const model = kind && modelCode
        ? resolveCanvasGenerationModels(generationConfig.config, kind).find((candidate) => candidate.code === modelCode)?.raw
        : null;
      return {
        model,
        parameters: kind ? buildCanvasGenerationParameters(kind, request) : {},
      };
    }));
    const creditBalance = normalizeCanvasCreditBalance(generationConfig.creditBalance);
    if (creditEstimate.estimatedCredits !== null && creditBalance !== null && creditBalance < creditEstimate.estimatedCredits) {
      api.setToast?.({ message: `预计需要 ${creditEstimate.estimatedCredits} 积分，当前余额 ${creditBalance}，积分不足，请先充值。`, closable: true });
      return;
    }
    const creditPrompt = creditEstimate.estimatedCredits === null
      ? `${creditEstimate.unknownCount} 个节点成本暂不可用，最终积分以后端校验为准。`
      : creditBalance === null
        ? `预计消耗 ${creditEstimate.estimatedCredits} 积分，当前余额暂不可用，提交时以后端校验为准。`
        : `预计消耗 ${creditEstimate.estimatedCredits} 积分，当前余额 ${creditBalance}。`;
    if (!window.confirm(`将按连线顺序运行 ${plan.length} 个生成节点。${creditPrompt}是否继续？`)) return;
    void controller.start(plan);
  }, [api, generationConfig.config, generationConfig.creditBalance]);

  const pauseCanvasWorkflow = useCallback(() => workflowRunQueueRef.current?.pause(), []);
  const stopCanvasWorkflow = useCallback(() => workflowRunQueueRef.current?.stop(), []);
  const retryCanvasWorkflowFailures = useCallback(() => {
    const controller = workflowRunQueueRef.current;
    if (!api || !controller) return;
    const state = controller.getState();
    const requests = state.failures.map((failure) => {
      const element = api.getSceneElements?.().find((candidate) => candidate.id === failure.id && !candidate.isDeleted);
      return buildCanvasNodeGenerationRequest(element);
    }).filter(Boolean);
    if (!requests.length) {
      api.setToast?.({ message: "失败节点已不存在或不再可运行。", closable: true });
      return;
    }
    const creditEstimate = estimateCanvasGenerationBatchCredits(requests.map((request) => {
      const kind = workflowGenerationKind(request);
      const modelCode = String(request?.modelCode ?? request?.model ?? "").trim();
      const model = kind && modelCode
        ? resolveCanvasGenerationModels(generationConfig.config, kind).find((candidate) => candidate.code === modelCode)?.raw
        : null;
      return {
        model,
        parameters: kind ? buildCanvasGenerationParameters(kind, request) : {},
      };
    }));
    const creditBalance = normalizeCanvasCreditBalance(generationConfig.creditBalance);
    if (creditEstimate.estimatedCredits !== null && creditBalance !== null && creditBalance < creditEstimate.estimatedCredits) {
      api.setToast?.({ message: `预计需要 ${creditEstimate.estimatedCredits} 积分，当前余额 ${creditBalance}，积分不足，请先充值。`, closable: true });
      return;
    }
    controller.retryFailures(requests);
  }, [api, generationConfig.config, generationConfig.creditBalance]);

  const persist = useCallback((content) => {
    onSaveStateChange?.("saving");
    const task = saveChainRef.current.catch(() => undefined).then(async () => {
      saveInFlightRef.current = true;
      try {
        let result = null;
        if (storage?.save) result = await storage.save(canvasId, content);
        else if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(content));
        if (result?.status === "conflict") {
          onSaveStateChange?.("conflict", result);
          api?.setToast?.({ message: "检测到云端新版本，本次编辑已保存在版本历史中。", closable: true });
          return result;
        }
        if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
        saveRetryTimerRef.current = null;
        if (result?.cloudPending && pendingRef.current === content) {
          const delay = SAVE_RETRY_DELAYS[saveRetryAttemptRef.current];
          if (delay !== undefined) {
            saveRetryAttemptRef.current += 1;
            saveRetryTimerRef.current = window.setTimeout(() => {
              saveRetryTimerRef.current = null;
              if (pendingRef.current === content) void persistRef.current?.(content);
            }, delay);
          }
          onSaveStateChange?.("local", result);
          return result;
        }
        saveRetryAttemptRef.current = 0;
        if (pendingRef.current === content) {
          pendingRef.current = null;
          onSaveStateChange?.(result?.source === "local" ? "local" : "saved");
        }
        return result;
      } catch (error) {
        console.error("[loomic-canvas] save failed", error);
        const delay = SAVE_RETRY_DELAYS[saveRetryAttemptRef.current];
        if (pendingRef.current === content && delay !== undefined && !saveRetryTimerRef.current) {
          saveRetryAttemptRef.current += 1;
          onSaveStateChange?.("retrying", error);
          saveRetryTimerRef.current = window.setTimeout(() => {
            saveRetryTimerRef.current = null;
            if (pendingRef.current === content) void persistRef.current?.(content);
          }, delay);
        } else if (pendingRef.current === content) {
          onSaveStateChange?.("error", error);
        }
        return undefined;
      } finally {
        saveInFlightRef.current = false;
      }
    });
    saveChainRef.current = task;
    return task;
  }, [api, canvasId, onSaveStateChange, storage, storageKey]);
  persistRef.current = persist;

  const archiveNativeCanvasImages = useCallback((elements, files) => {
    if (!api || typeof onArchiveImage !== "function") return;
    const archiveCanvasId = canvasId;
    void archiveNewCanvasImageFiles({
      tracker: imageArchiveTrackerRef.current,
      elements,
      files,
      archive: onArchiveImage,
      isCurrent: (candidate) => {
        const currentScope = imageArchiveScopeRef.current;
        const current = currentScope?.api === api
          && currentScope.canvasId === archiveCanvasId
          && isCanvasImageArchiveCandidateCurrent(
            candidate,
            api.getSceneElements?.() ?? [],
            api.getFiles?.() ?? {},
          );
        if (!current) {
          const timer = imageArchiveRetryTimersRef.current.get(candidate.fileId);
          if (timer) window.clearTimeout(timer);
          imageArchiveRetryTimersRef.current.delete(candidate.fileId);
          imageArchiveAttemptsRef.current.delete(candidate.fileId);
        }
        return current;
      },
      apply: (candidate, archive) => {
        const result = applyCanvasImageArchiveResult(
          api.getSceneElements?.() ?? [],
          candidate.fileId,
          archive,
          { sourceAction: "new-canvas/native-image-import" },
        );
        if (result.changed) {
          api.updateScene({ elements: result.elements, captureUpdate: "NONE" });
        }
        if (result.archived) {
          const timer = imageArchiveRetryTimersRef.current.get(candidate.fileId);
          if (timer) window.clearTimeout(timer);
          imageArchiveRetryTimersRef.current.delete(candidate.fileId);
          imageArchiveAttemptsRef.current.delete(candidate.fileId);
          return;
        }
        api.setToast?.({ message: "图片已保留在画布，云端归档失败。", closable: true });
        const failedAttempts = (imageArchiveAttemptsRef.current.get(candidate.fileId) ?? 0) + 1;
        imageArchiveAttemptsRef.current.set(candidate.fileId, failedAttempts);
        const retryDelay = IMAGE_ARCHIVE_RETRY_DELAYS[failedAttempts - 1];
        if (retryDelay === undefined || imageArchiveRetryTimersRef.current.has(candidate.fileId)) return;
        const timer = window.setTimeout(() => {
          imageArchiveRetryTimersRef.current.delete(candidate.fileId);
          imageArchiveTrackerRef.current.release(candidate.fileId);
          archiveNativeCanvasImagesRef.current?.(api.getSceneElements?.() ?? [], api.getFiles?.() ?? {});
        }, retryDelay);
        imageArchiveRetryTimersRef.current.set(candidate.fileId, timer);
      },
    });
  }, [api, canvasId, onArchiveImage]);
  archiveNativeCanvasImagesRef.current = archiveNativeCanvasImages;

  imageArchiveScopeRef.current = api ? { api, canvasId } : null;

  useEffect(() => () => {
    if (imageArchiveScopeRef.current?.api === api && imageArchiveScopeRef.current?.canvasId === canvasId) {
      imageArchiveScopeRef.current = null;
    }
    for (const timer of imageArchiveRetryTimersRef.current.values()) window.clearTimeout(timer);
    imageArchiveRetryTimersRef.current.clear();
  }, [api, canvasId]);

  useEffect(() => {
    if (!api || hydratedRef.current) return undefined;
    let active = true;
    const schedule = window.requestIdleCallback ?? ((callback) => window.setTimeout(callback, 1));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = schedule(() => {
      const elements = api.getSceneElements().map((element) => ({ ...element }));
      const result = normalizeCanvasElements(elements);
      hydratedRef.current = true;
      archiveNativeCanvasImages(result.elements, api.getFiles?.() ?? {});
      if (result.changed) {
        api.updateScene({ elements: result.elements, captureUpdate: "NONE" });
      } else {
        const content = toSerializableContent(
          api,
          result.elements,
          api.getAppState?.() ?? {},
        );
        lastScheduledContentRef.current = JSON.stringify(content);
        if (storage?.getInitialSaveState?.() === "local") {
          pendingRef.current = content;
          void persist(content);
        }
      }
      void inspectCanvasUploadRecovery(result.elements, onCheckUploadSession).then((inspection) => {
        if (!active || !inspection.unavailableSessionIds.length) return;
        const recovery = markCanvasUploadsForSourceRecovery(
          api.getSceneElements?.() ?? [],
          inspection.unavailableSessionIds,
        );
        if (!recovery.changed) return;
        api.updateScene({ elements: recovery.elements, captureUpdate: "IMMEDIATELY" });
        api.setToast?.({ message: "部分云端素材已失效，请重新选择源文件。", closable: true });
      });
    });
    return () => { active = false; cancel(handle); };
  }, [api, archiveNativeCanvasImages, onCheckUploadSession, persist, storage]);

  useEffect(() => {
    if (!api || typeof storage?.checkForRemoteUpdate !== "function" || typeof storage?.adoptRemoteUpdate !== "function") return undefined;
    let active = true;
    let checking = false;
    let errorReported = false;
    const check = async () => {
      if (!canCheckCanvasRemoteUpdate({
        active,
        checking,
        online: navigator.onLine,
        visibilityState: document.visibilityState,
        pending: pendingRef.current,
        saveTimer: saveTimerRef.current,
        saveRetryTimer: saveRetryTimerRef.current,
        saveInFlight: saveInFlightRef.current,
      })) return;
      checking = true;
      try {
        const update = await storage.checkForRemoteUpdate();
        errorReported = false;
        if (!canAdoptCanvasRemoteUpdate({
          active,
          visibilityState: document.visibilityState,
          pending: pendingRef.current,
          saveTimer: saveTimerRef.current,
          saveRetryTimer: saveRetryTimerRef.current,
          saveInFlight: saveInFlightRef.current,
        }, update)) return;
        const adoption = storage.adoptRemoteUpdate(update);
        if (!adoption) return;
        if (!await adoption) return;
        const remoteContent = update.content;
          remoteApplyInProgressRef.current = true;
          try {
            const remoteElements = hydrateCanvasElementsForDisplay(
              compactCanvasElementsForPersistence(remoteContent.elements ?? []),
            );
            const remoteFiles = hydrateCanvasFilesForDisplay(remoteElements, remoteContent.files ?? {});
            remoteApplyFingerprintRef.current = canvasVersionFingerprint({
              ...remoteContent,
              elements: remoteElements,
              files: remoteFiles,
            });
          const fileList = Object.values(remoteFiles);
          if (fileList.length) api.addFiles?.(fileList);
          const appState = api.getAppState?.() ?? {};
          api.updateScene?.({
            elements: projectCanvasConnectionsForView(api, remoteElements, { rebase: true }),
            appState: mergeCanvasRemoteAppState(appState, remoteContent.appState),
            captureUpdate: "NONE",
          });
        } finally {
          const releaseRemoteApplyGuard = () => {
            remoteApplyInProgressRef.current = false;
          };
          if (typeof window.queueMicrotask === "function") window.queueMicrotask(releaseRemoteApplyGuard);
          else Promise.resolve().then(releaseRemoteApplyGuard);
        }
        onSaveStateChange?.("saved", { source: "remote", serverRevision: update.serverRevision });
      } catch (error) {
        if (!errorReported) {
          errorReported = true;
          console.warn("[loomic-canvas] remote revision could not be synchronized", error);
        }
      } finally {
        checking = false;
      }
    };
    void check();
    const unsubscribeLive = typeof storage.subscribeRemoteUpdates === "function"
      ? storage.subscribeRemoteUpdates(() => { void check(); })
      : () => undefined;
    const timer = window.setInterval(check, REMOTE_SYNC_INTERVAL);
    return () => {
      active = false;
      unsubscribeLive();
      window.clearInterval(timer);
    };
  }, [api, onSaveStateChange, storage]);

  const handleChange = useCallback((elements, appState) => {
    const originalElements = elements;
    elements = markCanvasDrawingArrowsNonWorkflow(elements);
    elements = syncCanvasConnectionVisibility(api, elements);
    const files = api?.getFiles?.() ?? {};
    const incomingContent = remoteApplyFingerprintRef.current
      ? toSerializableContent(api, elements, appState)
      : null;
    const remoteChange = classifyCanvasRemoteChange(
      incomingContent,
      remoteApplyFingerprintRef.current,
      remoteApplyInProgressRef.current,
    );
    const remoteEcho = remoteChange.echo;
    const applyingRemote = remoteChange.suppress;
    const dependencyUpdate = applyingRemote
      ? { elements, fingerprints: collectCanvasGenerationDependencyFingerprints(elements) }
      : markChangedCanvasGenerationDependencies(elements, generationDependenciesRef.current);
    generationDependenciesRef.current = dependencyUpdate.fingerprints;
    const currentElements = dependencyUpdate.elements;
    if (currentElements !== originalElements) api?.updateScene?.({ elements: currentElements, captureUpdate: "NONE" });
    onChange?.(currentElements, appState, files);
    const selectedIds = Object.keys(appState.selectedElementIds ?? {}).filter((id) => appState.selectedElementIds[id]).sort();
    const selectedKey = selectedIds.map((id) => {
      const element = currentElements.find((item) => item.id === id);
      return `${id}:${element?.version ?? 0}:${element?.versionNonce ?? 0}`;
    }).join(",");
    if (selectedKey !== selectedKeyRef.current) {
      selectedKeyRef.current = selectedKey;
      const selected = currentElements.filter((element) => selectedIds.includes(element.id) && !element.isDeleted).map((element) => ({
        id: element.id,
        type: element.type,
        x: element.x ?? 0,
        y: element.y ?? 0,
        width: element.width ?? 0,
        height: element.height ?? 0,
        ...(element.text ? { text: element.text } : {}),
        ...(element.fileId ? { fileId: element.fileId, dataUrl: files[element.fileId]?.dataURL } : {}),
        ...(element.customData ? { customData: element.customData } : {}),
      }));
      selectionCallbackRef.current?.(selected);
    }
    if (!hydratedRef.current || !api) return;
    if (applyingRemote) {
      if (remoteEcho) remoteApplyFingerprintRef.current = "";
      return;
    }
    archiveNativeCanvasImages(currentElements, files);
    const content = toSerializableContent(api, currentElements, appState);
    const serializedContent = JSON.stringify(content);
    if (serializedContent === lastScheduledContentRef.current) return;
    lastScheduledContentRef.current = serializedContent;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
    saveRetryTimerRef.current = null;
    saveRetryAttemptRef.current = 0;
    pendingRef.current = content;
    onSaveStateChange?.("dirty");
    saveTimerRef.current = setTimeout(() => persist(content), SAVE_DELAY);
  }, [api, archiveNativeCanvasImages, onChange, onSaveStateChange, persist]);

  const flushPending = useCallback((stageForClose = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingRef.current) {
      if (stageForClose) storage?.stage?.(pendingRef.current);
      persist(pendingRef.current);
    }
  }, [persist, storage]);
  const persistCurrentCanvas = useCallback(() => {
    if (!api) return Promise.resolve(undefined);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (saveRetryTimerRef.current) {
      window.clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
    }
    saveRetryAttemptRef.current = 0;
    const content = toSerializableContent(api, api.getSceneElements?.() ?? [], api.getAppState?.() ?? {});
    pendingRef.current = content;
    return persist(content);
  }, [api, persist]);

  useEffect(() => {
    const retryDocumentSave = (event) => {
      if (event.detail?.canvasId !== canvasId) return;
      void persistCurrentCanvas();
    };
    window.addEventListener("loomic-canvas:document-save-request", retryDocumentSave);
    return () => window.removeEventListener("loomic-canvas:document-save-request", retryDocumentSave);
  }, [canvasId, persistCurrentCanvas]);

  useEffect(() => {
    const client = generationConfig.api;
    if (!api || !canvasProjectId || typeof client?.listCanvasNodeRuns !== "function") return undefined;
    const candidates = collectCanvasDirectorRecoveryCandidates(api.getSceneElements?.() ?? [])
      .filter((element) => {
        const key = `${canvasProjectId}:${element.id}:${element.customData?.directorIdempotencyKey ?? ""}`;
        if (directorRecoveryAttemptsRef.current.has(key)) return false;
        directorRecoveryAttemptsRef.current.add(key);
        return true;
      });
    if (!candidates.length) return undefined;
    let active = true;
    Promise.all(candidates.map(async (element) => {
      const elements = api.getSceneElements?.() ?? [];
      const request = buildCanvasNodeGenerationRequest(element);
      const recoveryInput = request ? canvasDirectorRecoveryInputFromPayload(buildCanvasGenerationPayload({
        kind: "director",
        nodeId: element.id,
        data: request,
        elements,
        files: api.getFiles?.() ?? {},
        canvasProjectId,
      })) : null;
      if (!recoveryInput) return { id: element.id, result: null };
      const history = await client.listCanvasNodeRuns(canvasProjectId, element.id);
      return { id: element.id, result: findLatestCanvasDirectorResult(history, recoveryInput) };
    }))
      .then(async (recoveries) => {
        if (!active) return;
        const completed = recoveries.filter((item) => item.result);
        if (!completed.length) return;
        for (const recovery of completed) {
          const elements = api.getSceneElements?.() ?? [];
          const element = elements.find((item) => item.id === recovery.id && !item.isDeleted);
          const request = buildCanvasNodeGenerationRequest(element);
          const currentInput = request ? canvasDirectorRecoveryInputFromPayload(buildCanvasGenerationPayload({
            kind: "director",
            nodeId: recovery.id,
            data: request,
            elements,
            files: api.getFiles?.() ?? {},
            canvasProjectId,
          })) : null;
          if (element?.customData?.inputUpdated === true || !canvasDirectorRecoveryInputsMatch(recovery.result.inputSnapshot?.recoveryInput, currentInput)) continue;
          updateWorkflowNodeElement(api, recovery.id, canvasDirectorResultPatch(recovery.result));
        }
        await persistCurrentCanvas();
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [api, canvasProjectId, generationConfig.api, persistCurrentCanvas]);

  useEffect(() => {
    const flushOnLifecycleChange = () => flushPending(true);
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushPending(true);
    };
    const flushWhenOnline = () => flushPending();
    window.addEventListener("pagehide", flushOnLifecycleChange);
    window.addEventListener("online", flushWhenOnline);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnLifecycleChange);
      window.removeEventListener("online", flushWhenOnline);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flushPending();
    };
  }, [flushPending]);

  useEffect(() => () => {
    if (saveRetryTimerRef.current) window.clearTimeout(saveRetryTimerRef.current);
  }, []);

  const renderEmbeddable = useCallback((element) => {
    if (typeof element?.link === "string" && (isVideoUrl(element.link) || element.customData?.isVideo)) {
      return <VideoCanvasElement src={element.link} width={element.width ?? 640} height={element.height ?? 360} />;
    }
    return null;
  }, []);

  const captureDragDuplicateIntent = useCallback((event) => {
    dragDuplicateIntentRef.current = null;
    if (!api || event.button !== 0 || !event.altKey || !(event.target instanceof HTMLCanvasElement)) return;
    const appState = api.getAppState?.() ?? {};
    const point = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, appState);
    const hit = hitCanvasNodeAtPoint(api.getSceneElements?.() ?? [], point, appState.zoom?.value);
    if (!hit) return;
    dragDuplicateIntentRef.current = {
      hitId: hit.id,
      copyConnections: Boolean(event.ctrlKey || event.metaKey),
    };
  }, [api]);

  const beginDragDuplicate = useCallback((activeTool, pointerDownState) => {
    const intent = dragDuplicateIntentRef.current;
    dragDuplicateIntentRef.current = null;
    if (!api || !intent || activeTool?.type !== "selection" || pointerDownState?.hit?.element?.id !== intent.hitId) {
      dragDuplicateGestureRef.current = null;
      return;
    }
    const currentSelection = api.getAppState?.().selectedElementIds ?? {};
    const selectedIds = currentSelection[intent.hitId] ? currentSelection : { [intent.hitId]: true };
    dragDuplicateGestureRef.current = {
      beforeElements: JSON.parse(JSON.stringify(api.getSceneElements?.() ?? [])),
      selectedIds: { ...selectedIds },
      ...intent,
    };
  }, [api]);

  const finishDragDuplicate = useCallback((_activeTool, pointerDownState) => {
    const gesture = dragDuplicateGestureRef.current;
    dragDuplicateGestureRef.current = null;
    if (!api || !gesture || !pointerDownState?.drag?.hasOccurred) return;
    const applyDuplicate = () => {
      const result = createCanvasDragDuplicate(
        gesture.beforeElements,
        api.getSceneElements?.() ?? [],
        gesture.selectedIds,
        { copyConnections: gesture.copyConnections, fallbackId: gesture.hitId },
      );
      if (!result?.clones?.length) return;
      api.updateScene?.({
        elements: result.elements,
        appState: { selectedElementIds: result.selectedElementIds },
        captureUpdate: "NONE",
      });
    };
    if (typeof window.queueMicrotask === "function") window.queueMicrotask(applyDuplicate);
    else Promise.resolve().then(applyDuplicate);
  }, [api]);

  const duplicateSelection = useCallback(() => {
    if (!api) return false;
    const currentElements = api.getSceneElements();
    const result = duplicateCanvasSelection(currentElements, api.getAppState().selectedElementIds);
    if (!result.clones.length) {
      api.setToast?.({ message: "请先选择要复制的节点。" });
      return false;
    }
    api.updateScene({
      elements: result.elements,
      appState: { selectedElementIds: result.selectedElementIds },
      captureUpdate: "IMMEDIATELY",
    });
    return true;
  }, [api]);

  const handleCopyCapture = useCallback((event) => {
    const target = event.target;
    if (!api || !event.clipboardData || target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const clipboard = createCanvasSelectionClipboard(api.getSceneElements(), api.getAppState().selectedElementIds);
    const nodeCount = clipboard.elements.filter((element) => element.type !== "arrow").length;
    if (!nodeCount) return;
    event.clipboardData.setData("text/plain", serializeCanvasSelectionClipboard(clipboard, api.getFiles()));
    event.preventDefault();
    event.stopPropagation();
    api.setToast?.({ message: `已复制 ${nodeCount} 个节点。` });
  }, [api]);

  const copySelectionToSystemClipboard = useCallback(async () => {
    if (!api) return false;
    const clipboard = createCanvasSelectionClipboard(api.getSceneElements(), api.getAppState().selectedElementIds);
    const nodeCount = clipboard.elements.filter((element) => element.type !== "arrow").length;
    if (!nodeCount) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(serializeCanvasSelectionClipboard(clipboard, api.getFiles()));
        api.setToast?.({ message: `已复制 ${nodeCount} 个节点。` });
        return true;
      } catch (error) {
        console.warn("[loomic-canvas] clipboard write failed", error);
      }
    }
    if (typeof document.execCommand === "function" && document.execCommand("copy")) return true;
    api.setToast?.({ message: "复制失败，请检查浏览器剪贴板权限。", closable: true });
    return false;
  }, [api]);

  const arrangeCanvas = useCallback(async () => {
    if (!api) return;
    if (autoLayoutReview) return;
    if (autoLayoutPromiseRef.current) return autoLayoutPromiseRef.current;
    let task;
    task = (async () => {
      setAutoLayoutRunning(true);
      try {
        const currentElements = api.getSceneElements();
        const arrangedElements = await autoLayoutCanvasElements(currentElements, canvasLayoutSettingsToOptions(layoutSettings));
        if (canvasScopeRef.current.api !== api || canvasScopeRef.current.canvasId !== canvasId) return;
        if (arrangedElements === currentElements) {
          api.setToast?.({ message: "至少需要两个未锁定节点进行自动整理。" });
          return;
        }
        const latestElements = api.getSceneElements();
        const layoutResult = applyCanvasLayoutGeometry(latestElements, currentElements, arrangedElements);
        if (layoutResult.conflicted) {
          api.setToast?.({ message: "整理期间画布位置已变化，请重新整理。", closable: true });
          return;
        }
        if (!layoutResult.changed) return;
        const currentAppState = api.getAppState();
        api.updateScene({ elements: layoutResult.elements, captureUpdate: "IMMEDIATELY" });
        const nodes = visibleCanvasFitElements(layoutResult.elements).filter((element) => element.type !== "arrow");
        api.scrollToContent(nodes, { fitToContent: true, maxZoom: 1, animate: false });
        setMinimapOpen(false);
        setAutoLayoutReview({
          elements: layoutResult.originalElements,
          arrangedElements: layoutResult.elements,
          appState: { scrollX: currentAppState.scrollX, scrollY: currentAppState.scrollY, zoom: currentAppState.zoom },
        });
      } catch (error) {
        if (canvasScopeRef.current.api !== api || canvasScopeRef.current.canvasId !== canvasId) return;
        console.error("[loomic-canvas] auto layout failed", error);
        api.setToast?.({ message: "自动整理失败，请稍后重试。", closable: true });
      } finally {
        if (autoLayoutPromiseRef.current === task) {
          setAutoLayoutRunning(false);
          autoLayoutPromiseRef.current = null;
        }
      }
    })();
    autoLayoutPromiseRef.current = task;
    return task;
  }, [api, autoLayoutReview, canvasId, layoutSettings]);

  const restoreAutoLayout = useCallback(() => {
    if (!api || !autoLayoutReview) return;
    const currentElements = api.getSceneElements();
    if (hasCanvasLayoutRestoreConflict(currentElements, autoLayoutReview.elements, autoLayoutReview.arrangedElements)) {
      api.setToast?.({ message: "整理后节点结构或位置已变化，无法安全还原，请保留当前结果后重新整理。", closable: true });
      return;
    }
    api.updateScene({
      elements: restoreCanvasLayoutElements(currentElements, autoLayoutReview.elements),
      appState: autoLayoutReview.appState,
      captureUpdate: "IMMEDIATELY",
    });
    setAutoLayoutReview(null);
  }, [api, autoLayoutReview]);
  const keepAutoLayout = useCallback(() => setAutoLayoutReview(null), []);

  useEffect(() => {
    autoLayoutPromiseRef.current = null;
    setAutoLayoutRunning(false);
    setAutoLayoutReview(null);
  }, [api, canvasId]);

  useEffect(() => {
    if (!api) return undefined;
    const handleCanvasShortcut = (event) => {
      const target = event.target;
      if (event.isComposing || event.repeat) return;
      if (matchesCanvasShortcut(event, "save")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        window.dispatchEvent(new CustomEvent("loomic-canvas:project-name-commit"));
        window.dispatchEvent(new CustomEvent("loomic-canvas:save-request"));
        void persistCurrentCanvas();
        return;
      }
      if (!workflowVisible) return;
      if (isTypingTarget(target)) return;
      const inCanvas = rootRef.current?.contains(target);
      if (inCanvas && (matchesCanvasShortcut(event, "zoom-in") || matchesCanvasShortcut(event, "zoom-out"))) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const appState = api.getAppState?.() ?? {};
        const currentZoom = Number(appState.zoom?.value ?? appState.zoom) || 1;
        const nextZoom = matchesCanvasShortcut(event, "zoom-in")
          ? Math.min(8, currentZoom * 1.1)
          : Math.max(0.1, currentZoom / 1.1);
        api.updateScene?.({
          appState: { ...canvasScrollForZoom(appState, nextZoom), zoom: { value: nextZoom } },
          captureUpdate: "NONE",
        });
        return;
      }
      if (inCanvas && matchesCanvasShortcut(event, "arrange")) {
        event.preventDefault();
        arrangeCanvas();
        return;
      }
      if (inCanvas && matchesCanvasShortcut(event, "merge-group")) {
        const currentElements = api.getSceneElements?.() ?? [];
        const result = groupCanvasSelection(currentElements, api.getAppState?.().selectedElementIds ?? {});
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (!result.groupId) {
          api.setToast?.({ message: "请至少选择两个节点进行组合。" });
          return;
        }
        api.updateScene({ elements: result.elements, captureUpdate: "IMMEDIATELY" });
        api.setToast?.({ message: `已组合 ${result.groupedIds.length} 个画布对象。` });
        return;
      }
      if (inCanvas && (matchesCanvasShortcut(event, "group") || matchesCanvasShortcut(event, "ungroup"))) {
        const currentElements = api.getSceneElements?.() ?? [];
        const selectedIds = api.getAppState?.().selectedElementIds ?? {};
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (matchesCanvasShortcut(event, "ungroup")) {
          const selectedIdList = Object.keys(selectedIds).filter((id) => selectedIds[id]);
          const nextElements = ungroupCanvasLayers(currentElements, selectedIdList);
          if (nextElements.every((element, index) => element === currentElements[index])) {
            api.setToast?.({ message: "当前选区没有可取消的组合。" });
            return;
          }
          api.updateScene({ elements: nextElements, captureUpdate: "IMMEDIATELY" });
          api.setToast?.({ message: "已取消组合。" });
          return;
        }
        const result = groupCanvasSelection(currentElements, selectedIds);
        if (!result.groupId) {
          api.setToast?.({ message: "请至少选择两个节点进行编组。" });
          return;
        }
        api.updateScene({ elements: result.elements, captureUpdate: "IMMEDIATELY" });
        api.setToast?.({ message: `已编组 ${result.groupedIds.length} 个画布对象。` });
        return;
      }
      if (inCanvas && matchesCanvasShortcut(event, "generate")) {
        const selectedIds = api.getAppState?.().selectedElementIds ?? {};
        const selected = api.getSceneElements?.().filter((element) => selectedIds[element.id] && !element.isDeleted) ?? [];
        const request = selected.length === 1 ? buildCanvasNodeGenerationRequest(selected[0]) : null;
        if (!request) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (keyboardGenerationRunningRef.current) {
          api.setToast?.({ message: "当前节点正在生成。" });
          return;
        }
        keyboardGenerationRunningRef.current = true;
        void executeCanvasNodeGeneration({ api, request, onGenerate, generationConfig: generationConfigRef.current })
          .catch((error) => api.setToast?.({ message: error instanceof Error ? error.message : "生成失败，请稍后重试。", closable: true }))
          .finally(() => { keyboardGenerationRunningRef.current = false; });
        return;
      }
      if (inCanvas && matchesCanvasShortcut(event, "fit")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        const fitElements = visibleCanvasFitElements(api.getSceneElements?.());
        if (fitElements.length) api.scrollToContent?.(fitElements);
        return;
      }
      if (!inCanvas || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if (event.code === "KeyC" || String(event.key).toLowerCase() === "c") {
        if (!navigator.clipboard?.writeText && typeof document.execCommand !== "function") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        copySelectionToSystemClipboard();
        return;
      }
      if (!matchesCanvasShortcut(event, "duplicate")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      duplicateSelection();
    };
    window.addEventListener("keydown", handleCanvasShortcut, true);
    return () => window.removeEventListener("keydown", handleCanvasShortcut, true);
  }, [api, arrangeCanvas, copySelectionToSystemClipboard, duplicateSelection, onGenerate, persistCurrentCanvas, workflowVisible]);

  if (storage?.load && storedContent === undefined) {
    return <div className={`loomic-canvas-root ${className}`} data-theme={theme}><div className="loomic-canvas-loading">正在加载画布…</div></div>;
  }

  return (
    <CanvasErrorBoundary>
      <div ref={rootRef} className={`loomic-canvas-root ${className}`} data-theme={theme} onCopyCapture={handleCopyCapture} onPointerDownCapture={captureDragDuplicateIntent} onDoubleClickCapture={openNodeMenuAtDoubleClick}>
        <Excalidraw
          langCode="zh-CN"
          theme={theme}
          initialData={initialData}
          excalidrawAPI={setExcalidrawApi}
          onChange={handleChange}
          onPointerDown={beginDragDuplicate}
          onPointerUp={finishDragDuplicate}
          renderEmbeddable={renderEmbeddable}
          validateEmbeddable={() => true}
          UIOptions={{ canvasActions: { loadScene: false } }}
        />
        {workflowVisible && api && <CanvasPortsOverlay excalidrawApi={api} connectionModeActive={connectionModeActive} onConnectionModeChange={setConnectionModeActive} />}
        {workflowVisible && api && showToolMenu && <MemoToolMenu excalidrawApi={api} leftPanelOpen={layersOpen || leftPanelOpen} onGenerate={onGenerate} onCancelGeneration={onCancelGeneration} onCompose={onCompose} onPersistCanvas={persistCurrentCanvas} canvasProjectId={canvasProjectId} onImportImage={onImportImage} onArchiveImage={onArchiveImage} brandKit={brandKit} generationConfig={generationConfig} connectionModeActive={connectionModeActive} onConnectionModeChange={setConnectionModeActive} onOpenFilesView={onOpenFilesView} addMenuRequest={addMenuRequest} />}
        {workflowVisible && api && <CanvasLayersPanel excalidrawApi={api} open={layersOpen} onClose={toggleLayers} />}
        {workflowVisible && api && showBottomBar && (
          <CanvasBottomBar
            excalidrawApi={api}
            layersOpen={layersOpen}
            onToggleLayers={toggleLayers}
            filesOpen={filesOpen}
            onToggleFiles={onToggleFiles}
            leftPanelOpen={layersOpen || leftPanelOpen}
            minimapOpen={minimapOpen}
            onToggleMinimap={() => setMinimapOpen((open) => !open)}
            autoLayoutRunning={autoLayoutRunning}
            autoLayoutReviewOpen={Boolean(autoLayoutReview)}
            onAutoLayout={arrangeCanvas}
            onRestoreAutoLayout={restoreAutoLayout}
            onKeepAutoLayout={keepAutoLayout}
            layoutSettings={layoutSettings}
            onLayoutSettingsChange={setLayoutSettings}
            workflowRunState={workflowRunState}
            onRunWorkflow={runCanvasWorkflow}
            onPauseWorkflow={pauseCanvasWorkflow}
            onRetryWorkflowFailures={retryCanvasWorkflowFailures}
            onStopWorkflow={stopCanvasWorkflow}
          />
        )}
      </div>
    </CanvasErrorBoundary>
  );
}
