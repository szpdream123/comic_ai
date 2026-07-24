import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowDown, ArrowRight, Eye, EyeOff, Files, Grid3x3, Layers3, LoaderCircle, Map, Minus, Pause, Play, Plus, RotateCcw, SlidersHorizontal, Square, Workflow, X } from "lucide-react";
import { CanvasMinimap } from "./CanvasMinimap.jsx";
import { areCanvasConnectionsVisible, setCanvasConnectionsVisible } from "./canvas-connection-visibility.js";
import { canvasScrollForZoom, visibleCanvasFitElements } from "./canvas-minimap.js";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const ZOOM_PRESETS = [0.5, 1, 8];
const BACKGROUNDS = ["#ffffff", "#f6f5f2", "#111312", "#d3f256", "#6c5ce7", "#00b894", "#fd79a8", "#0984e3"];

function Popover({ open, triggerRef, onClose, children, className = "", placement = "above", dismissible = true }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, bottom: 0 });
  useEffect(() => {
    if (!open || !triggerRef.current) return undefined;
    const syncPosition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const pageScale = Number.parseFloat(window.getComputedStyle(document.body).zoom) || 1;
      const panelWidth = (panelRef.current?.offsetWidth ?? 0) * pageScale;
      const panelHeight = (panelRef.current?.offsetHeight ?? 0) * pageScale;
      if (placement === "auto" && bounds.top - panelHeight - 8 < 8) {
        const screenTop = Math.min(bounds.bottom + 8, window.innerHeight - panelHeight - 8);
        const screenLeft = Math.max(8, Math.min(bounds.left, window.innerWidth - panelWidth - 8));
        setPosition({
          top: screenTop / pageScale,
          left: screenLeft / pageScale,
        });
        return;
      }
      if (placement === "auto") {
        const screenLeft = Math.max(8, Math.min(bounds.left, window.innerWidth - panelWidth - 8));
        setPosition({ top: (bounds.top - panelHeight - 8) / pageScale, left: screenLeft / pageScale });
        return;
      }
      setPosition({ left: bounds.left, bottom: window.innerHeight - bounds.top + 8 });
    };
    syncPosition();
    const dismiss = (event) => {
      if (panelRef.current?.contains(event.target) || triggerRef.current?.contains(event.target)) return;
      onClose();
    };
    const escape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    if (dismissible) {
      document.addEventListener("pointerdown", dismiss, true);
      document.addEventListener("keydown", escape, true);
    }
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
      if (dismissible) {
        document.removeEventListener("pointerdown", dismiss, true);
        document.removeEventListener("keydown", escape, true);
      }
    };
  }, [dismissible, open, placement, triggerRef, onClose]);
  if (!open) return null;
  const theme = document.querySelector(".loomic-canvas-root")?.dataset.theme ?? "dark";
  return createPortal(<div ref={panelRef} className={`loomic-popover ${className}`} data-theme={theme} style={position}>{children}</div>, document.body);
}

export function CanvasBottomBar({
  excalidrawApi,
  layersOpen,
  onToggleLayers,
  filesOpen = false,
  onToggleFiles,
  leftPanelOpen,
  minimapOpen = true,
  onToggleMinimap,
  autoLayoutRunning = false,
  autoLayoutReviewOpen = false,
  onAutoLayout,
  onRestoreAutoLayout,
  onKeepAutoLayout,
  layoutSettings = { direction: "RIGHT", spacing: "standard" },
  onLayoutSettingsChange,
  workflowRunState = { status: "idle", total: 0, completed: 0, failures: [] },
  onRunWorkflow,
  onPauseWorkflow,
  onRetryWorkflowFailures,
  onStopWorkflow,
}) {
  const [zoom, setZoom] = useState(1);
  const [zoomInput, setZoomInput] = useState("100");
  const [background, setBackground] = useState("#ffffff");
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [connectionsVisible, setConnectionsVisible] = useState(true);
  const [connectionNoticeOpen, setConnectionNoticeOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const zoomRef = useRef(null);
  const minimapRef = useRef(null);
  const connectionsRef = useRef(null);
  const backgroundRef = useRef(null);
  const layoutRef = useRef(null);
  const failuresRef = useRef(null);

  useEffect(() => {
    if (!excalidrawApi) return undefined;
    const sync = () => {
      const state = excalidrawApi.getAppState();
      setZoom(state.zoom?.value ?? 1);
      setBackground(state.viewBackgroundColor ?? "#ffffff");
      setGridSnapEnabled(Boolean(state.gridModeEnabled));
      setConnectionsVisible(areCanvasConnectionsVisible(excalidrawApi));
    };
    sync();
    const unsubscribe = excalidrawApi.onChange(sync);
    return () => { if (typeof unsubscribe === "function") unsubscribe(); };
  }, [excalidrawApi]);

  const applyZoom = useCallback((value) => {
    const boundedValue = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
    const appState = excalidrawApi?.getAppState?.() ?? {};
    excalidrawApi?.updateScene({
      appState: {
        ...canvasScrollForZoom(appState, boundedValue),
        zoom: { value: boundedValue },
      },
      captureUpdate: "NONE",
    });
    setZoomInput(String(Math.round(boundedValue * 100)));
  }, [excalidrawApi]);
  const applyZoomInput = useCallback((event) => {
    event.preventDefault();
    const value = Number.parseFloat(zoomInput);
    if (!Number.isFinite(value)) {
      setZoomInput(String(Math.round(zoom * 100)));
      return;
    }
    applyZoom(value / 100);
    setZoomOpen(false);
  }, [applyZoom, zoom, zoomInput]);
  const toggleGridSnap = useCallback(() => {
    const next = !gridSnapEnabled;
    excalidrawApi?.updateScene({ appState: { gridModeEnabled: next }, captureUpdate: "IMMEDIATELY" });
    setGridSnapEnabled(next);
  }, [excalidrawApi, gridSnapEnabled]);
  const toggleConnections = useCallback(() => {
    const nextVisible = !connectionsVisible;
    setCanvasConnectionsVisible(excalidrawApi, nextVisible);
    setConnectionsVisible(nextVisible);
    setConnectionNoticeOpen(true);
  }, [connectionsVisible, excalidrawApi]);
  const applyBackground = useCallback((value) => {
    excalidrawApi?.updateScene({ appState: { viewBackgroundColor: value } });
    setBackground(value);
  }, [excalidrawApi]);
  const closePopovers = useCallback(() => { setZoomOpen(false); setBackgroundOpen(false); setLayoutOpen(false); setFailuresOpen(false); setConnectionNoticeOpen(false); }, []);
  const updateLayoutSettings = useCallback((updates) => {
    onLayoutSettingsChange?.({ ...layoutSettings, ...updates });
  }, [layoutSettings, onLayoutSettingsChange]);
  const workflowStatus = String(workflowRunState?.status ?? "idle");
  const workflowFailures = Array.isArray(workflowRunState?.failures) ? workflowRunState.failures : [];
  const workflowCanStop = ["running", "pausing", "paused", "failed", "stopping"].includes(workflowStatus);
  const workflowCanRetryFailures = workflowFailures.length > 0
    && ["paused", "failed", "completed_with_errors"].includes(workflowStatus)
    && typeof onRetryWorkflowFailures === "function";
  const workflowIsWaiting = workflowStatus === "paused" || workflowStatus === "failed";
  const workflowIsBusy = workflowStatus === "pausing" || workflowStatus === "stopping";
  const workflowStatusLabel = {
    running: "运行中",
    pausing: "等待暂停",
    paused: "已暂停",
    failed: "失败待处理",
    stopping: "停止排队中",
    stopped: "已停止排队",
    completed: "已完成",
    completed_with_errors: "完成，有失败",
  }[workflowStatus] ?? "待运行";
  const filesActionLabel = filesOpen ? "关闭资产管理" : "打开资产管理";

  return (
    <>
      <div className={`loomic-bottom-bar ${leftPanelOpen ? "is-panel-shifted" : ""}`} style={{ left: leftPanelOpen ? 296 : 16 }} onPointerDown={(event) => event.stopPropagation()}>
        {onToggleFiles && <button className={`loomic-bottom-button loomic-asset-manager-button ${filesOpen ? "is-active" : ""}`} type="button" title={filesActionLabel} aria-label={filesActionLabel} aria-pressed={filesOpen} onClick={() => { closePopovers(); onToggleFiles(); }}><Files aria-hidden="true" /><span>资产管理</span></button>}
        {onAutoLayout && <button className="loomic-bottom-button" type="button" title="整理画布 (Alt+Shift+F)" aria-label="整理画布" aria-keyshortcuts="Alt+Shift+F" disabled={autoLayoutRunning || autoLayoutReviewOpen} onClick={() => { closePopovers(); onAutoLayout(); }}>{autoLayoutRunning ? <LoaderCircle className="loomic-spin" aria-hidden="true" /> : <Workflow aria-hidden="true" />}</button>}
        {onToggleMinimap && <span className="loomic-minimap-anchor"><button ref={minimapRef} disabled={autoLayoutReviewOpen} className={`loomic-bottom-button ${minimapOpen ? "is-active" : ""}`} type="button" title={autoLayoutReviewOpen ? "请先还原或保留整理结果" : minimapOpen ? "隐藏小地图" : "显示小地图"} aria-label={autoLayoutReviewOpen ? "请先还原或保留整理结果" : minimapOpen ? "隐藏小地图" : "显示小地图"} aria-pressed={minimapOpen} onClick={() => { closePopovers(); onToggleMinimap(); }}><Map aria-hidden="true" /></button></span>}
        <button ref={connectionsRef} className={`loomic-bottom-button ${connectionsVisible ? "" : "is-active"}`} type="button" title={connectionsVisible ? "隐藏节点连线" : "显示节点连线"} aria-label="节点连线" aria-pressed={!connectionsVisible} onClick={() => { closePopovers(); toggleConnections(); }}>{connectionsVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}</button>
        <button className={`loomic-bottom-button ${gridSnapEnabled ? "is-active" : ""}`} type="button" title={gridSnapEnabled ? "关闭网格吸附" : "开启网格吸附"} aria-label="网格吸附" aria-pressed={gridSnapEnabled} onClick={() => { closePopovers(); toggleGridSnap(); }}><Grid3x3 aria-hidden="true" /></button>
        <button ref={zoomRef} className="loomic-zoom-readout" type="button" title="缩放选项" aria-label="缩放选项" aria-expanded={zoomOpen} onClick={() => { const next = !zoomOpen; closePopovers(); setZoomInput(String(Math.round(zoom * 100))); setZoomOpen(next); }}>{Math.round(zoom * 100)}%</button>
        <span className="loomic-divider" />
        <button ref={backgroundRef} className="loomic-bottom-button" type="button" title="画布背景色" aria-label="画布背景色" onClick={() => { const next = !backgroundOpen; closePopovers(); setBackgroundOpen(next); }}>
          <span className="loomic-color-dot" style={{ background }} />
        </button>
        <button className={`loomic-bottom-button ${layersOpen ? "is-active" : ""}`} type="button" title="图层" aria-label="打开图层" aria-pressed={layersOpen} onClick={() => { closePopovers(); onToggleLayers(); }}><Layers3 aria-hidden="true" /></button>
        {onLayoutSettingsChange && <button ref={layoutRef} className={`loomic-bottom-button ${layoutOpen ? "is-active" : ""}`} type="button" title="自动整理设置" aria-label="自动整理设置" aria-expanded={layoutOpen} onClick={() => { const next = !layoutOpen; closePopovers(); setLayoutOpen(next); }}><SlidersHorizontal aria-hidden="true" /></button>}
        {onRunWorkflow && <span className="loomic-divider" />}
        {onRunWorkflow && (
          <button
            className={`loomic-bottom-button loomic-workflow-run ${workflowStatus === "running" ? "is-active" : ""}`}
            type="button"
            title={workflowStatus === "running" ? "当前任务完成后暂停" : workflowIsWaiting ? "继续运行工作流" : "运行工作流"}
            aria-label={workflowStatus === "running" ? "当前任务完成后暂停工作流" : workflowIsWaiting ? "继续运行工作流" : "运行工作流"}
            disabled={workflowIsBusy}
            onClick={() => { closePopovers(); if (workflowStatus === "running") onPauseWorkflow?.(); else onRunWorkflow(); }}
          >
            {workflowIsBusy ? <LoaderCircle className="loomic-spin" aria-hidden="true" /> : workflowStatus === "running" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
        )}
        {workflowRunState.total > 0 && (
          <span className="loomic-workflow-progress" aria-live="polite" title={workflowRunState.currentNodeId ? `当前节点：${workflowRunState.currentNodeId}` : undefined}>
            <span>{workflowStatusLabel}</span><strong>{workflowRunState.completed}/{workflowRunState.total}</strong>
          </span>
        )}
        {workflowFailures.length > 0 && (
          <button ref={failuresRef} className="loomic-workflow-failures" type="button" aria-label={`查看 ${workflowFailures.length} 个失败节点`} aria-expanded={failuresOpen} onClick={() => { const next = !failuresOpen; closePopovers(); setFailuresOpen(next); }}>
            <AlertTriangle aria-hidden="true" /><span>{workflowFailures.length}</span>
          </button>
        )}
        {workflowCanStop && onStopWorkflow && (
          <button className="loomic-bottom-button" type="button" title="停止排队并尝试取消当前任务；不支持取消时任务仍可能继续计费" aria-label="停止排队并尝试取消当前任务" disabled={workflowStatus === "stopping"} onClick={() => { closePopovers(); onStopWorkflow(); }}>
            {workflowStatus === "stopping" ? <LoaderCircle className="loomic-spin" aria-hidden="true" /> : <Square aria-hidden="true" />}
          </button>
        )}
      </div>
      {onToggleMinimap && <Popover open={minimapOpen} triggerRef={minimapRef} onClose={onToggleMinimap} className="loomic-minimap-popover" placement="auto" dismissible={false}>
        <CanvasMinimap excalidrawApi={excalidrawApi} />
      </Popover>}
      <Popover open={connectionNoticeOpen} triggerRef={connectionsRef} onClose={() => setConnectionNoticeOpen(false)} className="loomic-connection-notice" placement="auto">
        <span key={connectionsVisible ? "visible" : "hidden"} role="status" aria-live="polite">点击可显示/隐藏画布上的连线</span>
        <button type="button" aria-label="关闭连线显隐提示" onClick={() => setConnectionNoticeOpen(false)}><X aria-hidden="true" /></button>
      </Popover>
      {autoLayoutReviewOpen && (
        <section className="loomic-layout-review" style={{ left: leftPanelOpen ? 296 : 16 }} aria-label="整理画布结果确认" aria-live="polite">
          <strong>是否保留此次整理结果？</strong>
          <div>
            <button type="button" onClick={onRestoreAutoLayout}>还原</button>
            <button type="button" className="is-primary" onClick={onKeepAutoLayout}>保留</button>
          </div>
        </section>
      )}
      <Popover open={zoomOpen} triggerRef={zoomRef} onClose={() => setZoomOpen(false)} className="loomic-zoom-popover">
        <div className="loomic-menu-list">
          <form className="loomic-zoom-input" onSubmit={applyZoomInput}>
            <input type="number" min="10" max="800" step="1" inputMode="decimal" value={zoomInput} aria-label="输入画布缩放比例" onChange={(event) => setZoomInput(event.target.value)} />
            <span aria-hidden="true">%</span>
          </form>
          <span className="loomic-menu-separator" />
          <button className="loomic-zoom-command" type="button" aria-label="放大画布" aria-keyshortcuts="Control+Plus Meta+Plus" onClick={() => { applyZoom(zoom * 1.1); setZoomOpen(false); }}><Plus aria-hidden="true" /><span>放大</span><kbd>Ctrl / ⌘ +</kbd></button>
          <button className="loomic-zoom-command" type="button" aria-label="缩小画布" aria-keyshortcuts="Control+Minus Meta+Minus" onClick={() => { applyZoom(zoom / 1.1); setZoomOpen(false); }}><Minus aria-hidden="true" /><span>缩小</span><kbd>Ctrl / ⌘ -</kbd></button>
          <button className="loomic-zoom-command" type="button" aria-label="适合屏幕" aria-keyshortcuts="Control+0 Meta+0" onClick={() => { const fitElements = visibleCanvasFitElements(excalidrawApi?.getSceneElements?.()); if (fitElements.length) excalidrawApi?.scrollToContent?.(fitElements); setZoomOpen(false); }}><Square aria-hidden="true" /><span>适合屏幕</span><kbd>Ctrl / ⌘ 0</kbd></button>
          <span className="loomic-menu-separator" />
          <div className="loomic-zoom-presets" aria-label="画布缩放预设">
            {ZOOM_PRESETS.map((value) => <button key={value} className={Math.abs(zoom - value) < 0.001 ? "is-active" : ""} type="button" aria-label={`缩放至${Math.round(value * 100)}%`} onClick={() => { applyZoom(value); setZoomOpen(false); }}>{Math.round(value * 100)}%</button>)}
          </div>
        </div>
      </Popover>
      <Popover open={backgroundOpen} triggerRef={backgroundRef} onClose={() => setBackgroundOpen(false)} className="loomic-color-popover">
        <div className="loomic-popover-heading"><strong>画布背景色</strong><button className="loomic-icon-button" type="button" title="关闭" onClick={() => setBackgroundOpen(false)}><X aria-hidden="true" /></button></div>
        <input className="loomic-native-color" type="color" value={background === "transparent" ? "#ffffff" : background} onChange={(event) => applyBackground(event.target.value)} aria-label="选择画布背景色" />
        <div className="loomic-swatches">
          <button className={`loomic-swatch is-transparent ${background === "transparent" ? "is-selected" : ""}`} type="button" title="透明" onClick={() => applyBackground("transparent")} />
          {BACKGROUNDS.map((color) => <button key={color} className={`loomic-swatch ${background.toLowerCase() === color ? "is-selected" : ""}`} style={{ background: color }} type="button" title={color} onClick={() => applyBackground(color)} />)}
        </div>
        <label className="loomic-hex-field"><span>#</span><input value={background.replace("#", "").toUpperCase()} maxLength={6} onChange={(event) => { const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6); if (value.length === 6) applyBackground(`#${value}`); }} /></label>
      </Popover>
      <Popover open={layoutOpen} triggerRef={layoutRef} onClose={() => setLayoutOpen(false)} className="loomic-layout-popover">
        <div className="loomic-popover-heading"><strong>自动整理</strong><button className="loomic-icon-button" type="button" title="关闭" aria-label="关闭自动整理设置" onClick={() => setLayoutOpen(false)}><X aria-hidden="true" /></button></div>
        <fieldset className="loomic-layout-field">
          <legend>布局方向</legend>
          <div className="loomic-layout-segments">
            <button className={layoutSettings.direction === "RIGHT" ? "is-active" : ""} type="button" aria-pressed={layoutSettings.direction === "RIGHT"} onClick={() => updateLayoutSettings({ direction: "RIGHT" })}><ArrowRight aria-hidden="true" /><span>横向</span></button>
            <button className={layoutSettings.direction === "DOWN" ? "is-active" : ""} type="button" aria-pressed={layoutSettings.direction === "DOWN"} onClick={() => updateLayoutSettings({ direction: "DOWN" })}><ArrowDown aria-hidden="true" /><span>纵向</span></button>
          </div>
        </fieldset>
        <fieldset className="loomic-layout-field">
          <legend>节点间距</legend>
          <div className="loomic-layout-segments is-spacing">
            {[['compact', '紧凑'], ['standard', '标准'], ['loose', '宽松']].map(([value, label]) => <button key={value} className={layoutSettings.spacing === value ? "is-active" : ""} type="button" aria-pressed={layoutSettings.spacing === value} onClick={() => updateLayoutSettings({ spacing: value })}>{label}</button>)}
          </div>
        </fieldset>
        <button className="loomic-layout-apply" type="button" disabled={autoLayoutRunning || autoLayoutReviewOpen} onClick={() => { onAutoLayout?.(); setLayoutOpen(false); }}>应用并整理</button>
      </Popover>
      <Popover open={failuresOpen} triggerRef={failuresRef} onClose={() => setFailuresOpen(false)} className="loomic-workflow-failures-popover">
        <div className="loomic-popover-heading"><strong>失败节点</strong><button className="loomic-icon-button" type="button" title="关闭" aria-label="关闭失败节点" onClick={() => setFailuresOpen(false)}><X aria-hidden="true" /></button></div>
        <div className="loomic-workflow-failure-list">
          {workflowFailures.map((failure) => <div key={failure.id}><strong>{failure.id}</strong><span>{failure.message}</span></div>)}
        </div>
        {workflowCanRetryFailures && <button className="loomic-workflow-retry" type="button" onClick={() => { setFailuresOpen(false); onRetryWorkflowFailures(); }}><RotateCcw aria-hidden="true" /><span>重试失败节点</span></button>}
      </Popover>
    </>
  );
}
