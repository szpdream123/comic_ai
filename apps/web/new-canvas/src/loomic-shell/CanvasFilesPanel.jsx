import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowUpDown, AudioLines, AudioWaveform, BookOpen, Bot, Check, ChevronRight, Circle, CopyPlus, Download, Eye, Film, Folder, FolderPlus, History, Image, Layers3, LoaderCircle, LocateFixed, Minus, MoreHorizontal, Palette, PanelLeftClose, Pencil, Plus, RefreshCw, ScrollText, Search, SlidersHorizontal, Sparkles, Square, Trash2, Type, Upload, UserRound, Video, Wrench, X } from "lucide-react";
import { createImageGeneratorElement, updateImageGeneratorElement } from "../loomic-core/image-generator-elements.js";
import { deleteCanvasLayers } from "../loomic-core/canvas-layer-operations.js";
import {
  buildCanvasNodeGenerationRequest,
  executeCanvasNodeGeneration,
} from "../loomic-core/canvas-generation-execution.js";
import { useCanvasGenerationConfig } from "../loomic-core/CanvasGenerationConfigContext.jsx";
import { resolveCanvasGenerationCreditState } from "../loomic-core/canvas-generation-credits.js";
import { buildCanvasGenerationParameters } from "../loomic-core/canvas-generation.js";
import { resolveCanvasGenerationModel } from "../loomic-core/canvas-generation-models.js";
import {
  agentAssetsFromPayload,
  insertAgentAssetOnCanvas,
  prependAgentAsset,
  removeAgentAsset,
  replaceAgentAsset,
} from "./canvas-agent-assets.js";
import { canvasElementRequiresSourceFile, rebindCanvasMediaFile } from "./canvasApi.js";
import {
  applyCanvasNodeArtifactSelection,
  collectCanvasFileEntries,
  collectCanvasPanelEntries,
  duplicateCanvasMediaElement,
  filterCanvasFileEntries,
  filterCanvasResourceEntries,
  insertCloudAssetOnCanvas,
  listCanvasFolders,
  listCanvasFailedHistoryRuns,
  loadCanvasCloudAssets,
  loadCanvasGenerationHistory,
  loadCanvasNodeHistory,
  loadCanvasResourceLibrary,
  mergeCanvasStylePrompt,
  markCanvasHistoryArtifactSelected,
  normalizeCanvasFolderName,
  removeCanvasFolder,
  renameCanvasFolder,
  resolveCanvasAssetDownload,
  runCanvasAssetBatch,
  updateCanvasFileMetadata,
  updateCanvasFilesMetadata,
} from "./canvas-file-utils.js";
import {
  canvasCloudAssetCapabilities,
  deleteCanvasCloudAsset,
  removeCanvasCloudAssetEntry,
  renameCanvasCloudAsset,
  renameCanvasCloudAssetEntry,
} from "./cloud-asset-actions.js";
import {
  invalidateCanvasAssetMutationScope,
  isCanvasAssetMutationScopeCurrent,
  updateCanvasAssetMutationScope,
} from "./canvas-asset-mutation-scope.js";
import {
  CANVAS_TOOL_PRESET_DRAG_TYPE,
  canvasToolPresetToResourceEntry,
  getCanvasToolPresetCatalog,
} from "../loomic-core/canvas-tool-preset-catalog.js";
import {
  CANVAS_HISTORY_SCALE_DEFAULT,
  CANVAS_HISTORY_SCALE_MAX,
  CANVAS_HISTORY_SCALE_MIN,
  canvasHistoryScaleStyle,
  stepCanvasHistoryScale,
} from "./canvas-history-scale.js";
import {
  canvasDedicatedAssetSourceOptions,
  canvasAssetTypeOptions,
  canvasHistoryTypeOptions,
  installCanvasFilesDialogTabTrap,
  orderCanvasPanelEntries,
  resolveCanvasFileRowMenuKeyAction,
  resolveCanvasFilesPresentation,
} from "./canvas-files-presentation.js";
import {
  canvasAssetCreateMenuSections,
  insertCanvasAssetCreateNode,
  resolveCanvasAssetCreateMenuKeyAction,
} from "./canvas-asset-create-menu.js";

function throttle(callback, delay) {
  let timer = null;
  let queued = false;
  const run = () => {
    queued = true;
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = null;
      if (queued) callback();
      queued = false;
    }, delay);
  };
  run.cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    queued = false;
  };
  return run;
}

const TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
  { value: "generator", label: "生成节点" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "personal-library", label: "个人素材" },
  { value: "official-library", label: "官方素材" },
  { value: "team-library", label: "团队素材" },
  { value: "canvas-local", label: "画布复用" },
];

const RESOURCE_SOURCE_OPTIONS = [
  { value: "all", label: "全部来源" },
  { value: "official-library", label: "官方" },
  { value: "team-library", label: "团队" },
];

const STYLE_SOURCE_OPTIONS = [
  { value: "all", label: "全部风格" },
  { value: "official-style", label: "官方" },
  { value: "batch-style", label: "批量" },
];

const CANVAS_ASSET_DRAG_TYPE = "application/x-loomic-canvas-asset";

function TypeIcon({ entry }) {
  if (entry.panelOnly) {
    if (entry.panelType === "director-node") return <Layers3 aria-hidden="true" />;
    if (entry.panelType === "video-composition-node") return <Film aria-hidden="true" />;
    if (entry.panelType === "script-node") return <ScrollText aria-hidden="true" />;
    if (entry.panelType === "text-node" || entry.panelType === "text") return <Type aria-hidden="true" />;
    if (entry.panelType === "rectangle") return <Square aria-hidden="true" />;
    if (entry.panelType === "ellipse") return <Circle aria-hidden="true" />;
    if (entry.panelType === "line") return <Minus aria-hidden="true" />;
    if (entry.panelType === "freedraw") return <Pencil aria-hidden="true" />;
    return <Wrench aria-hidden="true" />;
  }
  if (entry.type === "audio-generator") return <AudioLines aria-hidden="true" />;
  if (entry.type === "image-generator" || entry.type === "video-generator") return <Sparkles aria-hidden="true" />;
  if (entry.type === "video") return <Video aria-hidden="true" />;
  if (entry.type === "audio") return <AudioLines aria-hidden="true" />;
  return <Image aria-hidden="true" />;
}

const FileRow = memo(function FileRow({ entry, assetView, batchMode, batchSelected, folders, inserting, rebinding, selected, assetCapabilities, assetBusy, onBatchToggle, onDownload, onInsert, onLocate, onMove, onRebind, onRename, onRemove, onAssetRename, onAssetDelete, onDragStart }) {
  const primaryAction = entry.cloud ? onInsert : onLocate;
  const needsSourceFile = !entry.cloud && canvasElementRequiresSourceFile(entry.element);
  const canDuplicate = !assetView && !entry.cloud && !entry.panelOnly && ["image", "video", "audio"].includes(entry.type);
  const canDownload = Boolean(resolveCanvasAssetDownload(entry));
  const showCanvasActions = !assetView && !entry.cloud && !entry.panelOnly;
  const accept = entry.type === "video" ? "video/*" : entry.type === "audio" ? "audio/*" : "image/*";
  const inputRef = useRef(null);
  const fileMainButtonRef = useRef(null);
  const actionsButtonRef = useRef(null);
  const actionsAnchorRef = useRef(null);
  const actionsPopoverRef = useRef(null);
  const locateButtonRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsPosition, setActionsPosition] = useState({ left: 0, top: 0, ready: false, theme: {} });

  const positionActions = useCallback(() => {
    const trigger = actionsButtonRef.current?.getBoundingClientRect();
    const popover = actionsPopoverRef.current;
    if (!trigger || !popover) return;
    const margin = 8;
    const gap = 4;
    const uiScale = Number.parseFloat(window.getComputedStyle(document.body).zoom) || 1;
    const popoverRect = popover.getBoundingClientRect();
    const width = popoverRect.width;
    const height = popoverRect.height;
    const computed = window.getComputedStyle(actionsAnchorRef.current);
    const theme = {
      "--lm-border": computed.getPropertyValue("--lm-border"),
      "--lm-danger": computed.getPropertyValue("--lm-danger"),
      "--lm-muted": computed.getPropertyValue("--lm-muted"),
      "--lm-panel": computed.getPropertyValue("--lm-panel"),
      "--lm-shadow": computed.getPropertyValue("--lm-shadow"),
      "--lm-text": computed.getPropertyValue("--lm-text"),
      "--lm-text-muted": computed.getPropertyValue("--lm-text-muted"),
      fontFamily: computed.fontFamily,
    };
    let left = trigger.right + gap;
    if (left + width > window.innerWidth - margin) left = trigger.left - width - gap;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = trigger.top;
    if (top + height > window.innerHeight - margin) top = trigger.bottom - height;
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));
    setActionsPosition({ left: left / uiScale, top: top / uiScale, ready: true, theme });
  }, []);

  useLayoutEffect(() => {
    if (!actionsOpen || !showCanvasActions) return undefined;
    positionActions();
    const update = () => positionActions();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    requestAnimationFrame(() => actionsPopoverRef.current?.querySelector('[role^="menuitem"]')?.focus());
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [actionsOpen, positionActions, showCanvasActions]);

  useEffect(() => {
    if (!actionsOpen || !showCanvasActions) return undefined;
    const dismiss = (event) => {
      if (!actionsAnchorRef.current?.contains(event.target) && !actionsPopoverRef.current?.contains(event.target)) setActionsOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        actionsButtonRef.current?.focus();
        setActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [actionsOpen, showCanvasActions]);

  const runAction = (action) => {
    actionsButtonRef.current?.focus();
    setActionsOpen(false);
    action();
  };

  const handleActionsKeyDown = (event) => {
    const decision = resolveCanvasFileRowMenuKeyAction({ key: event.key, shiftKey: event.shiftKey });
    if (decision.handled) {
      event.preventDefault();
      const focusTarget = decision.focus === "previous" ? fileMainButtonRef.current : locateButtonRef.current;
      focusTarget?.focus();
      if (decision.close) setActionsOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(actionsPopoverRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])].filter((item) => !item.disabled);
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items.at(-1).focus();
    else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length].focus();
    else items[(currentIndex - 1 + items.length) % items.length].focus();
  };

  return (
    <div className={`lm-file-row ${selected ? "is-selected" : ""} ${batchMode ? "is-batch" : ""} ${entry.panelOnly ? "is-panel-only" : ""} ${actionsOpen ? "is-actions-open" : ""}`.trim()} draggable={!entry.panelOnly && !batchMode && !inserting && !rebinding && !assetBusy} onDragStart={(event) => onDragStart(event, entry, "entry")}>
      {batchMode ? <input type="checkbox" checked={batchSelected} aria-label={`选择资产 ${entry.title}`} onChange={() => onBatchToggle(entry)} /> : null}
      <button type="button" className="lm-file-main" ref={fileMainButtonRef} title={`${entry.cloud ? "插入" : "定位"} ${entry.title}`} disabled={inserting || rebinding || Boolean(assetBusy)} onClick={() => primaryAction(entry)}>
        <span className="lm-file-thumbnail">
          {(entry.type === "image" ? entry.mediaUrl : entry.thumbnailUrl)
            ? <img src={entry.type === "image" ? entry.mediaUrl : entry.thumbnailUrl} alt="" draggable={false} loading="lazy" />
            : <TypeIcon entry={entry} />}
        </span>
        <span className="lm-file-copy">
          <span className="lm-file-name">{entry.title}</span>
          <span className="lm-file-meta">{entry.kindLabel}{entry.folder ? ` · ${entry.folder}` : ""}{assetView ? ` · ${entry.sourceLabel ?? (entry.source === "generated" ? "生成" : "上传")}` : ""}{needsSourceFile ? " · 重新选择源文件" : ""}</span>
        </span>
      </button>
      <div className={`lm-file-actions ${assetView ? "is-assets" : ""}`}>
        {assetView && <button type="button" className="lm-icon-button" title="插入画布" aria-label={`再次插入 ${entry.title}`} disabled={inserting || Boolean(assetBusy)} onClick={() => onInsert(entry)}>{inserting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <CopyPlus aria-hidden="true" />}</button>}
        {assetView && assetCapabilities?.canRename && <button type="button" className="lm-icon-button" title="重命名云资产" aria-label={`重命名云资产 ${entry.title}`} disabled={Boolean(assetBusy)} onClick={() => onAssetRename(entry)}>{assetBusy === "rename" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Pencil aria-hidden="true" />}</button>}
        {assetView && assetCapabilities?.canDelete && <button type="button" className="lm-icon-button" title="删除云资产" aria-label={`删除云资产 ${entry.title}`} disabled={Boolean(assetBusy)} onClick={() => onAssetDelete(entry)}>{assetBusy === "delete" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>}
        {showCanvasActions ? (
          <div className="lm-file-action-anchor" ref={actionsAnchorRef}>
            <button type="button" className="lm-icon-button" ref={actionsButtonRef} disabled={inserting || rebinding || Boolean(assetBusy)} title="更多操作" aria-label={`更多操作 ${entry.title}`} aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => { setActionsPosition((position) => ({ ...position, ready: false })); setActionsOpen((value) => !value); }}><MoreHorizontal aria-hidden="true" /></button>
            {actionsOpen ? createPortal(
              <div ref={actionsPopoverRef} className="lm-file-action-menu" role="menu" aria-label={`${entry.title} 操作`} data-canvas-files-dialog-portal="true" style={{ ...actionsPosition.theme, left: actionsPosition.left, top: actionsPosition.top, visibility: actionsPosition.ready ? "visible" : "hidden" }} onKeyDown={handleActionsKeyDown}>
                <button type="button" role="menuitem" onClick={() => runAction(() => onRename(entry))}>重命名</button>
                {canDuplicate ? <button type="button" role="menuitem" onClick={() => runAction(() => onInsert(entry))}>复制</button> : null}
                {canDownload ? <button type="button" role="menuitem" onClick={() => runAction(() => onDownload(entry))}>下载</button> : null}
                <div className="lm-file-action-separator" role="separator" />
                <span className="lm-file-action-caption">移动到文件夹</span>
                <button type="button" role="menuitemradio" aria-checked={!entry.folder} onClick={() => runAction(() => onMove(entry, ""))}>未分类</button>
                {folders.map((folder) => <button type="button" role="menuitemradio" aria-checked={entry.folder === folder} onClick={() => runAction(() => onMove(entry, folder))} key={folder}>{folder}</button>)}
                <div className="lm-file-action-separator" role="separator" />
                <button type="button" role="menuitem" className="is-danger" onClick={() => runAction(() => onRemove(entry))}>从画布删除</button>
              </div>,
              document.body,
            ) : null}
          </div>
        ) : null}
        {!entry.cloud && <button type="button" className="lm-icon-button" ref={locateButtonRef} title="定位" aria-label={`定位 ${entry.title}`} onClick={() => onLocate(entry)}><LocateFixed aria-hidden="true" /></button>}
        {needsSourceFile && <button type="button" className="lm-icon-button" title="重新选择源文件" aria-label={`重新选择源文件 ${entry.title}`} disabled={rebinding} onClick={() => inputRef.current?.click()}>{rebinding ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}</button>}
        {assetView && canDownload && <button type="button" className="lm-icon-button" title="下载" aria-label={`下载 ${entry.title}`} disabled={Boolean(assetBusy)} onClick={() => onDownload(entry)}><Download aria-hidden="true" /></button>}
      </div>
      {needsSourceFile && <input ref={inputRef} type="file" accept={accept} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onRebind(entry, file); }} />}
    </div>
  );
});

function ResourceIcon({ entry }) {
  if (entry.resourceType === "style") return <Palette aria-hidden="true" />;
  if (entry.resourceType === "tool") return <Wrench aria-hidden="true" />;
  if (entry.resourceCategory === "character") return <UserRound aria-hidden="true" />;
  return <TypeIcon entry={entry} />;
}

const ResourceRow = memo(function ResourceRow({ entry, busy, onAction, onPreview, onDragStart }) {
  const actionLabel = entry.resourceType === "style" ? "应用风格" : entry.resourceType === "tool" ? "添加节点" : "插入画布";
  return (
    <article className="lm-resource-row" draggable={entry.resourceType === "tool" && !busy} onDragStart={(event) => onDragStart?.(event, entry)}>
      <button type="button" className="lm-resource-preview-button" aria-label={`预览 ${entry.title}`} onClick={() => onPreview(entry)}>
        <span className="lm-resource-thumbnail">{entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt="" draggable={false} loading="lazy" /> : <ResourceIcon entry={entry} />}</span>
        <span className="lm-resource-copy"><strong title={entry.title}>{entry.title}</strong><span>{entry.kindLabel} · {entry.sourceLabel}</span>{entry.folder ? <small title={entry.folder}>{entry.folder}</small> : null}</span>
      </button>
      <button type="button" className="lm-resource-action" disabled={busy || (entry.resourceType === "style" && !entry.promptContent)} title={entry.resourceType === "style" && !entry.promptContent ? "该风格没有可应用的提示词" : actionLabel} aria-label={`${actionLabel} ${entry.title}`} onClick={() => onAction(entry)}>
        {busy ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : entry.resourceType === "style" ? <Palette aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </button>
    </article>
  );
});

const AgentAssetRow = memo(function AgentAssetRow({ asset, busy, onInsert, onEdit, onDelete }) {
  return (
    <article className="lm-resource-row lm-agent-asset-row">
      <button type="button" className="lm-resource-preview-button" disabled={Boolean(busy)} aria-label={`插入 Agent ${asset.name}`} onClick={() => onInsert(asset)}>
        <span className="lm-resource-thumbnail"><Bot aria-hidden="true" /></span>
        <span className="lm-resource-copy">
          <strong title={asset.name}>{asset.name}</strong>
          <span>导演 Agent · 真实导演节点</span>
          <small title={asset.description || asset.instructions}>{asset.description || asset.instructions || "未配置导演要求"}</small>
        </span>
      </button>
      <div className="lm-file-actions">
        <button type="button" className="lm-icon-button" title="插入画布" aria-label={`插入 Agent ${asset.name}`} disabled={Boolean(busy)} onClick={() => onInsert(asset)}>{busy === "insert" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
        <button type="button" className="lm-icon-button" title="编辑 Agent" aria-label={`编辑 Agent ${asset.name}`} disabled={Boolean(busy)} onClick={() => onEdit(asset)}>{busy === "edit" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Pencil aria-hidden="true" />}</button>
        <button type="button" className="lm-icon-button is-danger" title="删除 Agent" aria-label={`删除 Agent ${asset.name}`} disabled={Boolean(busy)} onClick={() => onDelete(asset)}>{busy === "delete" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</button>
      </div>
    </article>
  );
});

function AssetCreateMenuIcon({ id }) {
  if (id === "text") return <Type aria-hidden="true" />;
  if (id === "image") return <Image aria-hidden="true" />;
  if (id === "video") return <Video aria-hidden="true" />;
  if (id === "video-composition") return <Film aria-hidden="true" />;
  if (id === "director") return <Layers3 aria-hidden="true" />;
  if (id === "audio") return <AudioWaveform aria-hidden="true" />;
  if (id === "script") return <ScrollText aria-hidden="true" />;
  if (id === "history") return <History aria-hidden="true" />;
  if (id === "upload") return <Upload aria-hidden="true" />;
  return <Folder aria-hidden="true" />;
}

export function CanvasFilesPanel({ api, assetClient, canvasProjectId, onGenerate, onImportImage, onOpenFilesView, open, onClose, viewRequest = null, presentation = "panel" }) {
  const generationConfig = useCanvasGenerationConfig();
  const [entries, setEntries] = useState([]);
  const [canvasPanelEntries, setCanvasPanelEntries] = useState([]);
  const [cloudEntries, setCloudEntries] = useState([]);
  const [cloudLoadState, setCloudLoadState] = useState("idle");
  const [cloudErrors, setCloudErrors] = useState([]);
  const [resourceEntries, setResourceEntries] = useState([]);
  const [styleEntries, setStyleEntries] = useState([]);
  const [toolEntries, setToolEntries] = useState([]);
  const [resourceLoadState, setResourceLoadState] = useState("idle");
  const [resourceErrors, setResourceErrors] = useState([]);
  const [toolLoadState, setToolLoadState] = useState("idle");
  const [toolErrors, setToolErrors] = useState([]);
  const [toolVersions, setToolVersions] = useState({});
  const [toolVersionState, setToolVersionState] = useState({});
  const [agentAssets, setAgentAssets] = useState([]);
  const [agentLoadState, setAgentLoadState] = useState("idle");
  const [agentError, setAgentError] = useState("");
  const [agentBusy, setAgentBusy] = useState("");
  const [resourceKind, setResourceKind] = useState("character");
  const [resourceCategory, setResourceCategory] = useState("all");
  const [previewEntry, setPreviewEntry] = useState(null);
  const [insertingId, setInsertingId] = useState("");
  const [rebindingId, setRebindingId] = useState("");
  const [insertError, setInsertError] = useState("");
  const [cloudAssetActionError, setCloudAssetActionError] = useState("");
  const [cloudAssetActor, setCloudAssetActor] = useState(null);
  const [cloudAssetBusy, setCloudAssetBusy] = useState("");
  const [assetBatchMode, setAssetBatchMode] = useState(false);
  const [assetSelectedIds, setAssetSelectedIds] = useState(() => new Set());
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetBatchFolder, setAssetBatchFolder] = useState("");
  const [assetCreateMenuOpen, setAssetCreateMenuOpen] = useState(false);
  const [assetFiltersOpen, setAssetFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState({});
  const [activeTab, setActiveTab] = useState("canvas");
  const [canvasOrder, setCanvasOrder] = useState("front-to-back");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [historyNodeKey, setHistoryNodeKey] = useState("");
  const [historyState, setHistoryState] = useState({ nodeKey: "", status: "idle", artifacts: [], runs: [], error: "" });
  const [historyType, setHistoryType] = useState("all");
  const [historyDialogType, setHistoryDialogType] = useState("image");
  const [historyOrder, setHistoryOrder] = useState("desc");
  const [historyScale, setHistoryScale] = useState(CANVAS_HISTORY_SCALE_DEFAULT);
  const [historyBatchMode, setHistoryBatchMode] = useState(false);
  const [historySelectedIds, setHistorySelectedIds] = useState(() => new Set());
  const [selectingArtifactId, setSelectingArtifactId] = useState("");
  const [retryingRunId, setRetryingRunId] = useState("");
  const requestIdRef = useRef(0);
  const resourceRequestIdRef = useRef(0);
  const toolRequestIdRef = useRef(0);
  const toolDetailRequestRef = useRef(new Map());
  const agentRequestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
  const handledViewRequestRef = useRef(null);
  const panelStateSnapshotRef = useRef(null);
  const panelRef = useRef(null);
  const insertScopeRef = useRef(null);
  const insertRequestRef = useRef(0);
  const assetUploadRequestRef = useRef(0);
  const assetBatchRequestRef = useRef(0);
  const mutationScopeRef = useRef(null);
  const toolPresetCatalogRef = useRef(null);
  const assetUploadInputRef = useRef(null);
  const assetCreateMenuRef = useRef(null);
  const assetCreateMenuButtonRef = useRef(null);
  const assetCreateMenuPopupRef = useRef(null);
  const assetBatchButtonRef = useRef(null);
  const assetSearchInputRef = useRef(null);
  const assetFiltersButtonRef = useRef(null);
  const assetFiltersRef = useRef(null);
  const dialog = presentation === "dialog";
  const {
    dedicatedAssetsDialog: requestedDedicatedAssetsDialog,
    dedicatedCharacterDialog: requestedDedicatedCharacterDialog,
    dedicatedHistoryDialog: requestedDedicatedHistoryDialog,
    dedicatedStyleDialog: requestedDedicatedStyleDialog,
  } = resolveCanvasFilesPresentation(presentation, viewRequest);
  const dedicatedAssetsDialog = requestedDedicatedAssetsDialog && activeTab === "assets";
  const dedicatedCharacterDialog = requestedDedicatedCharacterDialog && activeTab === "library" && resourceKind === "character";
  const dedicatedHistoryDialog = requestedDedicatedHistoryDialog && activeTab === "history";
  const dedicatedStyleDialog = requestedDedicatedStyleDialog && activeTab === "library" && resourceKind === "style";

  if (!toolPresetCatalogRef.current || toolPresetCatalogRef.current.client !== assetClient) {
    toolPresetCatalogRef.current = { client: assetClient, catalog: getCanvasToolPresetCatalog(assetClient) };
  }

  insertScopeRef.current = api ? { api, canvasProjectId, open } : null;
  useEffect(() => () => {
    if (insertScopeRef.current?.api === api && insertScopeRef.current?.canvasProjectId === canvasProjectId) {
      insertScopeRef.current = null;
    }
  }, [api, canvasProjectId]);
  useEffect(() => {
    updateCanvasAssetMutationScope(mutationScopeRef, {
      api,
      canvasProjectId: canvasProjectId ?? null,
      open,
    });
    return () => invalidateCanvasAssetMutationScope(mutationScopeRef);
  }, [api, canvasProjectId, open]);
  useEffect(() => {
    insertRequestRef.current += 1;
    assetUploadRequestRef.current += 1;
    assetBatchRequestRef.current += 1;
    setInsertingId("");
    setInsertError("");
    setAssetUploading(false);
    setAssetBatchMode(false);
    setAssetSelectedIds(new Set());
    setAssetBatchFolder("");
  }, [api, assetClient, canvasProjectId]);

  useEffect(() => {
    if (activeTab !== "assets" || !open) setAssetFiltersOpen(false);
  }, [activeTab, open]);
  useEffect(() => {
    if (!open || !dedicatedAssetsDialog) setAssetCreateMenuOpen(false);
  }, [dedicatedAssetsDialog, open]);
  const enabledAssetCreateMenuItems = useCallback(() => Array.from(
    assetCreateMenuPopupRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [],
  ), []);
  useEffect(() => {
    if (!assetCreateMenuOpen || !open || !dedicatedAssetsDialog) return undefined;
    const focusFrame = requestAnimationFrame(() => enabledAssetCreateMenuItems()[0]?.focus());
    const dismiss = (event) => {
      if (!assetCreateMenuRef.current?.contains(event.target)) setAssetCreateMenuOpen(false);
    };
    const handleAssetCreateMenuKeyDown = (event) => {
      const items = enabledAssetCreateMenuItems();
      const currentIndex = items.indexOf(document.activeElement);
      const action = resolveCanvasAssetCreateMenuKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        currentIndex,
        itemCount: items.length,
      });
      if (!action.handled) return;
      event.preventDefault();
      event.stopPropagation();
      if (action.close) {
        event.stopImmediatePropagation?.();
        setAssetCreateMenuOpen(false);
        const focusTarget = action.focus === "trigger"
          ? assetCreateMenuButtonRef
          : action.focus === "batch"
            ? assetBatchButtonRef
            : assetSearchInputRef;
        requestAnimationFrame(() => focusTarget.current?.focus());
        return;
      }
      items[action.nextIndex]?.focus();
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", handleAssetCreateMenuKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", handleAssetCreateMenuKeyDown, true);
    };
  }, [assetCreateMenuOpen, dedicatedAssetsDialog, enabledAssetCreateMenuItems, open]);
  useEffect(() => {
    if (!assetFiltersOpen) return undefined;
    const dismiss = (event) => {
      if (!assetFiltersRef.current?.contains(event.target)) setAssetFiltersOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setAssetFiltersOpen(false);
        requestAnimationFrame(() => assetFiltersButtonRef.current?.focus());
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", escape, true);
    };
  }, [assetFiltersOpen]);

  useLayoutEffect(() => {
    if (!open || !viewRequest || handledViewRequestRef.current === viewRequest) return;
    handledViewRequestRef.current = viewRequest;
    if (dialog && !panelStateSnapshotRef.current) {
      panelStateSnapshotRef.current = {
        activeTab,
        assetBatchFolder,
        assetBatchMode,
        assetSelectedIds,
        historyBatchMode,
        historyNodeKey,
        historyOrder,
        historySelectedIds,
        historyType,
        previewEntry,
        query,
        resourceCategory,
        resourceKind,
        sourceFilter,
        typeFilter,
      };
    }
    const view = typeof viewRequest === "string" ? viewRequest : viewRequest.view;
    if (view === "assets") {
      setActiveTab("assets");
      setTypeFilter("all");
      setSourceFilter("personal-library");
      setQuery("");
      setAssetCreateMenuOpen(false);
    } else if (view === "library-character") {
      setActiveTab("library");
      setResourceKind("character");
      setResourceCategory("character");
      setSourceFilter("all");
      setQuery("");
      setPreviewEntry(null);
    } else if (view === "library-style") {
      setActiveTab("library");
      setResourceKind("style");
      setSourceFilter("all");
      setQuery("");
      setPreviewEntry(null);
    } else if (view === "history") {
      setActiveTab("history");
      setHistoryNodeKey("*");
      setHistoryDialogType("image");
      setHistoryOrder("desc");
      setHistoryScale(CANVAS_HISTORY_SCALE_DEFAULT);
      setHistoryBatchMode(false);
      setHistorySelectedIds(new Set());
    }
  }, [dialog, open, viewRequest]);

  useLayoutEffect(() => {
    if ((open && dialog) || !panelStateSnapshotRef.current) return;
    const snapshot = panelStateSnapshotRef.current;
    panelStateSnapshotRef.current = null;
    setActiveTab(snapshot.activeTab);
    setAssetBatchFolder(snapshot.assetBatchFolder);
    setAssetBatchMode(snapshot.assetBatchMode);
    setAssetSelectedIds(snapshot.assetSelectedIds);
    setHistoryBatchMode(snapshot.historyBatchMode);
    setHistoryNodeKey(snapshot.historyNodeKey);
    setHistoryOrder(snapshot.historyOrder);
    setHistorySelectedIds(snapshot.historySelectedIds);
    setHistoryType(snapshot.historyType);
    setPreviewEntry(snapshot.previewEntry);
    setQuery(snapshot.query);
    setResourceCategory(snapshot.resourceCategory);
    setResourceKind(snapshot.resourceKind);
    setSourceFilter(snapshot.sourceFilter);
    setTypeFilter(snapshot.typeFilter);
  }, [dialog, open]);

  const refresh = useCallback(() => {
    if (!api) {
      setEntries([]);
      setCanvasPanelEntries([]);
      setSelectedIds({});
      return;
    }
    const binaryFiles = api.getFiles?.() ?? {};
    const elements = api.getSceneElements?.() ?? [];
    setEntries(collectCanvasFileEntries(elements, binaryFiles));
    setCanvasPanelEntries(collectCanvasPanelEntries(elements, binaryFiles));
    setSelectedIds(api.getAppState?.().selectedElementIds ?? {});
  }, [api]);

  useEffect(() => {
    if (!open || !api) return undefined;
    refresh();
    const throttled = throttle(refresh, 200);
    const unsubscribe = api.onChange?.(throttled);
    return () => {
      throttled.cancel();
      unsubscribe?.();
    };
  }, [api, open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose, open]);

  useEffect(() => {
    if (open && dialog) panelRef.current?.focus();
  }, [dialog, open, viewRequest]);

  useEffect(() => {
    if (!open || !dialog) return undefined;
    return installCanvasFilesDialogTabTrap(document, panelRef.current);
  }, [dialog, open]);

  const handlePanelKeyDown = (event) => event.stopPropagation();

  const loadCloudEntries = useCallback(async (options = {}) => {
    const shouldApply = typeof options.shouldApply === "function" ? options.shouldApply : () => true;
    if (!shouldApply()) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setCloudLoadState("loading");
    setCloudErrors([]);
    setCloudAssetActionError("");
    try {
      const [cloudResult, sessionResult] = await Promise.allSettled([
        loadCanvasCloudAssets(assetClient),
        typeof assetClient?.getSession === "function" ? assetClient.getSession({ fresh: true }) : Promise.resolve(null),
      ]);
      if (requestId !== requestIdRef.current || !shouldApply()) return;
      const result = cloudResult.status === "fulfilled" ? cloudResult.value : { entries: [], errors: ["素材库加载失败。"] };
      const errors = [...(Array.isArray(result.errors) ? result.errors : [])];
      if (sessionResult.status === "fulfilled" && sessionResult.value?.authenticated !== false) {
        setCloudAssetActor(sessionResult.value?.user ?? null);
      } else {
        setCloudAssetActor(null);
      }
      setCloudEntries(result.entries);
      setCloudErrors(errors);
      setCloudLoadState("loaded");
    } catch {
      if (requestId !== requestIdRef.current || !shouldApply()) return;
      setCloudEntries([]);
      setCloudErrors(["素材库加载失败。"]);
      setCloudLoadState("loaded");
      setCloudAssetActor(null);
    }
  }, [assetClient]);

  const loadResourceEntries = useCallback(async () => {
    const requestId = resourceRequestIdRef.current + 1;
    resourceRequestIdRef.current = requestId;
    setResourceLoadState("loading");
    setResourceErrors([]);
    try {
      const result = await loadCanvasResourceLibrary(assetClient);
      if (requestId !== resourceRequestIdRef.current) return;
      setResourceEntries(result.entries);
      setStyleEntries(result.styles);
      setResourceErrors(result.errors);
      setResourceLoadState("loaded");
    } catch {
      if (requestId !== resourceRequestIdRef.current) return;
      setResourceEntries([]);
      setStyleEntries([]);
      setResourceErrors(["资源库加载失败。"]);
      setResourceLoadState("loaded");
    }
  }, [assetClient]);

  const loadToolEntries = useCallback(async () => {
    const requestId = toolRequestIdRef.current + 1;
    toolRequestIdRef.current = requestId;
    setToolLoadState("loading");
    setToolErrors([]);
    try {
      const presets = await toolPresetCatalogRef.current.catalog.list();
      if (requestId !== toolRequestIdRef.current) return;
      setToolEntries(presets.map(canvasToolPresetToResourceEntry));
      setToolVersions({});
      setToolVersionState({});
      setToolLoadState("loaded");
    } catch (error) {
      if (requestId !== toolRequestIdRef.current) return;
      setToolEntries(toolPresetCatalogRef.current.catalog.listBuiltins().map(canvasToolPresetToResourceEntry));
      setToolErrors([`用户工具加载失败：${error?.message ?? "请求失败"}`]);
      setToolLoadState("loaded");
    }
  }, [assetClient]);

  const loadAgentAssets = useCallback(async () => {
    const requestId = agentRequestIdRef.current + 1;
    agentRequestIdRef.current = requestId;
    setAgentLoadState("loading");
    setAgentError("");
    try {
      if (typeof assetClient?.getAgentAssets !== "function") throw new Error("agent assets unavailable");
      const payload = await assetClient.getAgentAssets();
      if (requestId !== agentRequestIdRef.current) return;
      setAgentAssets(agentAssetsFromPayload(payload));
      setAgentLoadState("loaded");
    } catch {
      if (requestId !== agentRequestIdRef.current) return;
      setAgentAssets([]);
      setAgentError("Agent 资产加载失败，请重试。");
      setAgentLoadState("loaded");
    }
  }, [assetClient]);

  useEffect(() => {
    requestIdRef.current += 1;
    setCloudEntries([]);
    setCloudErrors([]);
    setCloudAssetActionError("");
    setCloudAssetActor(null);
    setCloudAssetBusy("");
    setCloudLoadState("idle");
  }, [assetClient, canvasProjectId]);

  useEffect(() => {
    resourceRequestIdRef.current += 1;
    setResourceEntries([]);
    setStyleEntries([]);
    setResourceErrors([]);
    setResourceLoadState("idle");
  }, [assetClient]);

  useEffect(() => {
    toolRequestIdRef.current += 1;
    setToolEntries([]);
    setToolErrors([]);
    setToolVersions({});
    setToolVersionState({});
    setToolLoadState("idle");
  }, [assetClient]);

  useEffect(() => {
    agentRequestIdRef.current += 1;
    setAgentAssets([]);
    setAgentLoadState("idle");
    setAgentError("");
    setAgentBusy("");
  }, [assetClient]);

  useEffect(() => {
    if (!open) {
      insertRequestRef.current += 1;
      assetUploadRequestRef.current += 1;
      assetBatchRequestRef.current += 1;
      setCloudAssetBusy("");
      setCloudAssetActionError("");
      setAssetUploading(false);
      setAssetBatchMode(false);
      setAssetSelectedIds(new Set());
      setAssetBatchFolder("");
    }
  }, [open]);

  const selectedGenerator = useMemo(() => entries.find((entry) =>
    entry.category === "generator" && selectedIds[entry.id]
  ) ?? null, [entries, selectedIds]);
  const canvasFolders = useMemo(() => listCanvasFolders(entries), [entries]);
  useEffect(() => {
    if (!["all", "unfiled"].includes(folderFilter) && !canvasFolders.includes(folderFilter)) setFolderFilter("all");
  }, [canvasFolders, folderFilter]);
  const generatorEntries = useMemo(() => entries.filter((entry) => entry.category === "generator"), [entries]);
  const generatorNodeKeySignature = useMemo(() => generatorEntries.map((entry) => entry.id).join("\u0000"), [generatorEntries]);
  const historyGenerator = activeTab === "history"
    ? historyNodeKey === "*"
      ? { id: "*", title: "全部生成节点", kindLabel: "全部" }
      : generatorEntries.find((entry) => entry.id === historyNodeKey) ?? null
    : activeTab === "canvas" ? selectedGenerator : null;

  const loadHistory = useCallback(async (nodeKey) => {
    const normalizedNodeKey = String(nodeKey ?? "").trim();
    const requestId = historyRequestIdRef.current + 1;
    historyRequestIdRef.current = requestId;
    if (!normalizedNodeKey) {
      setHistoryState({ nodeKey: "", status: "idle", artifacts: [], runs: [], error: "" });
      return;
    }
    if (!canvasProjectId) {
      setHistoryState({ nodeKey: normalizedNodeKey, status: "unavailable", artifacts: [], runs: [], error: "" });
      return;
    }
    setHistoryState({ nodeKey: normalizedNodeKey, status: "loading", artifacts: [], runs: [], error: "" });
    try {
      const history = normalizedNodeKey === "*"
        ? await loadCanvasGenerationHistory(assetClient, { canvasProjectId, nodeKeys: generatorNodeKeySignature ? generatorNodeKeySignature.split("\u0000") : [] })
        : await loadCanvasNodeHistory(assetClient, { canvasProjectId, nodeKey: normalizedNodeKey });
      if (requestId !== historyRequestIdRef.current) return;
      setHistoryState({ ...history, status: "loaded", error: history.errors?.length ? `${history.errors.length} 个节点历史加载失败。` : "" });
    } catch {
      if (requestId !== historyRequestIdRef.current) return;
      setHistoryState({ nodeKey: normalizedNodeKey, status: "error", artifacts: [], runs: [], error: "生成历史加载失败。" });
    }
  }, [assetClient, canvasProjectId, generatorNodeKeySignature]);

  useEffect(() => {
    if (!open || activeTab !== "history") return;
    if (historyNodeKey === "*" || generatorEntries.some((entry) => entry.id === historyNodeKey)) return;
    setHistoryNodeKey(generatorEntries.length ? "*" : "");
  }, [activeTab, generatorEntries, historyNodeKey, open]);

  useEffect(() => {
    if (!open || !["canvas", "history"].includes(activeTab)) return;
    void loadHistory(historyGenerator?.id ?? "");
  }, [activeTab, historyGenerator?.id, loadHistory, open]);

  useEffect(() => () => {
    historyRequestIdRef.current += 1;
    resourceRequestIdRef.current += 1;
    toolRequestIdRef.current += 1;
    agentRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (open && activeTab === "assets" && cloudLoadState === "idle") loadCloudEntries();
  }, [activeTab, cloudLoadState, loadCloudEntries, open]);

  useEffect(() => {
    if (open && activeTab === "library" && resourceKind !== "tool" && resourceLoadState === "idle") loadResourceEntries();
  }, [activeTab, loadResourceEntries, open, resourceKind, resourceLoadState]);

  useEffect(() => {
    if (open && activeTab === "library" && resourceKind === "tool" && toolLoadState === "idle") loadToolEntries();
  }, [activeTab, loadToolEntries, open, resourceKind, toolLoadState]);

  useEffect(() => {
    if (open && activeTab === "agents" && agentLoadState === "idle") loadAgentAssets();
  }, [activeTab, agentLoadState, loadAgentAssets, open]);

  const download = useCallback((entry) => {
    const resolved = resolveCanvasAssetDownload(entry);
    if (!resolved) return;
    const anchor = document.createElement("a");
    anchor.href = resolved.url;
    anchor.download = resolved.fileName;
    anchor.click();
  }, []);

  const locate = useCallback((entry) => {
    const element = api?.getSceneElements?.().find((item) => item.id === entry.id && !item.isDeleted);
    if (!element) return;
    api.updateScene?.({ appState: { selectedElementIds: { [element.id]: true } } });
    api.scrollToContent?.(element, { fitToContent: false, animate: true, duration: 250 });
  }, [api]);

  const remove = useCallback((entry) => {
    if (!api || !entry?.id || entry.cloud) return;
    if (!window.confirm(`从画布删除“${entry.title}”？`)) return;
    const current = api.getSceneElements?.() ?? [];
    if (!current.some((element) => element.id === entry.id && !element.isDeleted)) return;
    api.updateScene?.({
      elements: deleteCanvasLayers(current, [entry.id]),
      captureUpdate: "IMMEDIATELY",
    });
    refresh();
  }, [api, refresh]);

  const rebind = useCallback(async (entry, file) => {
    if (!api || !entry?.id || rebindingId) return;
    setRebindingId(entry.id);
    setInsertError("");
    try {
      const rebound = await rebindCanvasMediaFile(api, entry.id, file, {
        assetClient,
      });
      if (!rebound) setInsertError("源文件重新绑定失败，请检查文件类型和网络后重试。");
      refresh();
    } catch {
      setInsertError("源文件重新绑定失败，请稍后重试。");
    } finally {
      setRebindingId("");
    }
  }, [api, assetClient, rebindingId, refresh]);

  const insert = useCallback(async (entry, options = {}) => {
    if (!api || insertingId) return;
    const insertApi = api;
    const insertCanvasProjectId = canvasProjectId;
    const requestId = insertRequestRef.current + 1;
    insertRequestRef.current = requestId;
    const callerShouldInsert = typeof options.shouldInsert === "function" ? options.shouldInsert : () => true;
    const shouldInsert = () => {
      const scope = insertScopeRef.current;
      return insertRequestRef.current === requestId
        && scope?.api === insertApi
        && scope.canvasProjectId === insertCanvasProjectId
        && scope.open
        && callerShouldInsert();
    };
    if (!shouldInsert()) return false;
    setInsertingId(entry.id);
    setInsertError("");
    try {
      if (entry.cloud) {
        const inserted = await insertCloudAssetOnCanvas(insertApi, entry, { ...options, shouldInsert });
        return Boolean(inserted && shouldInsert());
      }
      if (!shouldInsert()) return false;
      const duplicate = duplicateCanvasMediaElement(entry.element, insertApi.getAppState?.() ?? {});
      if (!duplicate) return false;
      if (Number.isFinite(options.anchor?.x) && Number.isFinite(options.anchor?.y)) {
        duplicate.x = options.anchor.x - (Number(duplicate.width) || 0) / 2;
        duplicate.y = options.anchor.y - (Number(duplicate.height) || 0) / 2;
      }
      if (!shouldInsert()) return false;
      insertApi.updateScene?.({
        elements: [...(insertApi.getSceneElements?.() ?? []), duplicate],
        appState: { selectedElementIds: { [duplicate.id]: true } },
        captureUpdate: "IMMEDIATELY",
      });
      if (!options.anchor && shouldInsert()) insertApi.scrollToContent?.(duplicate, { fitToContent: false, animate: true, duration: 250 });
      return shouldInsert();
    } catch {
      if (shouldInsert()) setInsertError("素材插入失败，请稍后重试。");
      return false;
    } finally {
      if (shouldInsert()) setInsertingId("");
    }
  }, [api, canvasProjectId, insertingId]);

  const startAssetDrag = useCallback((event, entry, scope) => {
    if (!event.dataTransfer || !entry?.id) return;
    const key = scope === "history" ? (entry.historyKey || `${entry.nodeKey ?? historyState.nodeKey}:${entry.id}`) : entry.id;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CANVAS_ASSET_DRAG_TYPE, JSON.stringify({ key, scope }));
  }, [historyState.nodeKey]);

  useEffect(() => {
    if (!open || !api) return undefined;
    const canvasBounds = () => document.querySelector(".lm-canvas-slot")?.getBoundingClientRect?.();
    const hasCanvasAsset = (event) => Array.from(event.dataTransfer?.types ?? []).includes(CANVAS_ASSET_DRAG_TYPE);
    const withinCanvas = (event, bounds) => bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    const handleDragOver = (event) => {
      const bounds = canvasBounds();
      if (!hasCanvasAsset(event) || !withinCanvas(event, bounds)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const handleDrop = (event) => {
      const bounds = canvasBounds();
      if (!hasCanvasAsset(event) || !withinCanvas(event, bounds)) return;
      event.preventDefault();
      event.stopPropagation();
      let payload;
      try { payload = JSON.parse(event.dataTransfer.getData(CANVAS_ASSET_DRAG_TYPE)); } catch { return; }
      const entry = payload?.scope === "history"
        ? historyState.artifacts.find((artifact) => (artifact.historyKey || `${artifact.nodeKey ?? historyState.nodeKey}:${artifact.id}`) === payload.key)
        : [...cloudEntries, ...entries].find((candidate) => candidate.id === payload?.key);
      if (!entry) return;
      const appState = api.getAppState?.() ?? {};
      const zoom = appState.zoom?.value ?? 1;
      const anchor = {
        x: (event.clientX - bounds.left) / zoom - (Number(appState.scrollX) || 0),
        y: (event.clientY - bounds.top) / zoom - (Number(appState.scrollY) || 0),
      };
      void insert(entry, { anchor });
    };
    document.addEventListener("dragover", handleDragOver, true);
    document.addEventListener("drop", handleDrop, true);
    return () => {
      document.removeEventListener("dragover", handleDragOver, true);
      document.removeEventListener("drop", handleDrop, true);
    };
  }, [api, cloudEntries, entries, historyState.artifacts, historyState.nodeKey, insert, open]);

  const addToolNode = useCallback(async (entry) => {
    if (!api || insertingId) return;
    const insertApi = api;
    const insertCanvasProjectId = canvasProjectId;
    const shouldInsert = () => {
      const scope = insertScopeRef.current;
      return scope?.api === insertApi && scope.canvasProjectId === insertCanvasProjectId && scope.open;
    };
    if (!shouldInsert()) return;
    setInsertingId(entry.id);
    setInsertError("");
    try {
      const result = await toolPresetCatalogRef.current.catalog.insert(insertApi, entry, { shouldInsert });
      if (!shouldInsert()) return;
      if (!result.ok) throw new Error(result.reason || "tool_preset_insert_failed");
      const inserted = (insertApi.getSceneElements?.() ?? []).filter((element) => result.elementIds.includes(element.id));
      if (inserted.length) insertApi.scrollToContent?.(inserted, { fitToContent: false, animate: true, duration: 250 });
    } catch (error) {
      if (shouldInsert()) setInsertError(`工具插入失败：${error?.message ?? "请求失败"}`);
    } finally {
      if (shouldInsert()) setInsertingId("");
    }
  }, [api, canvasProjectId, insertingId]);

  const loadToolVersions = useCallback(async (entry) => {
    if (!entry?.id || entry.source !== "user") return [];
    const requestId = (toolDetailRequestRef.current.get(entry.id) ?? 0) + 1;
    toolDetailRequestRef.current.set(entry.id, requestId);
    setToolVersionState((current) => ({ ...current, [entry.id]: { status: "loading", error: "" } }));
    try {
      const { detail, versions } = await toolPresetCatalogRef.current.catalog.loadVersions(entry);
      if (toolDetailRequestRef.current.get(entry.id) !== requestId) return [];
      const resource = canvasToolPresetToResourceEntry(detail);
      setToolEntries((current) => current.map((item) => item.id === entry.id ? resource : item));
      setPreviewEntry((current) => current?.id === entry.id ? resource : current);
      setToolVersions((current) => ({ ...current, [entry.id]: versions }));
      setToolVersionState((current) => ({ ...current, [entry.id]: { status: "loaded", error: "" } }));
      return versions;
    } catch (error) {
      if (toolDetailRequestRef.current.get(entry.id) !== requestId) return [];
      const message = String(error?.message ?? "请求失败");
      setToolVersionState((current) => ({ ...current, [entry.id]: { status: "error", error: message } }));
      setToolErrors([`工具详情加载失败：${message}`]);
      return [];
    }
  }, [assetClient]);

  const selectToolVersion = useCallback(async (entry, versionNumber) => {
    if (!entry?.id || entry.source !== "user") return;
    setToolVersionState((current) => ({ ...current, [entry.id]: { status: "loading", error: "" } }));
    try {
      const selected = await toolPresetCatalogRef.current.catalog.selectVersion(entry, versionNumber);
      const resource = canvasToolPresetToResourceEntry(selected);
      setToolEntries((current) => current.map((item) => item.id === entry.id ? resource : item));
      setPreviewEntry((current) => current?.id === entry.id ? resource : current);
      setToolVersionState((current) => ({ ...current, [entry.id]: { status: "loaded", error: "" } }));
    } catch (error) {
      const message = String(error?.message ?? "请求失败");
      setToolVersionState((current) => ({ ...current, [entry.id]: { status: "error", error: message } }));
      setToolErrors([`工具版本加载失败：${message}`]);
    }
  }, [assetClient]);

  const previewResource = useCallback((entry) => {
    setPreviewEntry(entry);
    if (entry?.resourceType === "tool" && entry.source === "user") void loadToolVersions(entry);
  }, [loadToolVersions]);

  const startToolPresetDrag = useCallback((event, entry) => {
    if (!event.dataTransfer || entry?.resourceType !== "tool" || !entry.id) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CANVAS_TOOL_PRESET_DRAG_TYPE, entry.id);
  }, []);

  const applyStyle = useCallback((entry) => {
    if (!api || !entry?.promptContent || insertingId) return;
    setInsertingId(entry.id);
    setInsertError("");
    try {
      const elements = api.getSceneElements?.() ?? [];
      const selectedElementIds = api.getAppState?.().selectedElementIds ?? {};
      let generator = elements.find((element) => selectedElementIds[element.id] && element.customData?.type === "image-generator");
      if (!generator) {
        const elementId = createImageGeneratorElement(api);
        generator = api.getSceneElements?.().find((element) => element.id === elementId);
      }
      if (!generator) throw new Error("generator unavailable");
      updateImageGeneratorElement(api, generator.id, {
        prompt: mergeCanvasStylePrompt(generator.customData?.prompt, entry.promptContent, generator.customData?.stylePrompt),
        styleId: entry.sourceId,
        styleCode: entry.code,
        styleName: entry.title,
        stylePrompt: entry.promptContent,
        styleSource: entry.source,
      });
      const updated = api.getSceneElements?.().find((element) => element.id === generator.id) ?? generator;
      api.updateScene?.({ appState: { selectedElementIds: { [generator.id]: true } } });
      api.scrollToContent?.(updated, { fitToContent: false, animate: true, duration: 250 });
    } catch {
      setInsertError("风格应用失败，请稍后重试。");
    } finally {
      setInsertingId("");
    }
  }, [api, insertingId]);

  const runResourceAction = useCallback((entry) => {
    if (entry.resourceType === "style") return applyStyle(entry);
    if (entry.resourceType === "tool") return addToolNode(entry);
    return insert(entry);
  }, [addToolNode, applyStyle, insert]);

  const selectHistoryArtifact = useCallback(async (entry) => {
    if (!canvasProjectId || !entry?.id || selectingArtifactId) return;
    setSelectingArtifactId(entry.id);
    try {
      await assetClient?.selectCanvasNodeArtifact?.(canvasProjectId, entry.id, { selectionRole: "current" });
      const nodeKey = String(entry.nodeKey ?? (historyState.nodeKey === "*" ? "" : historyState.nodeKey) ?? "").trim();
      const currentElements = api?.getSceneElements?.() ?? [];
      const nextElements = applyCanvasNodeArtifactSelection(currentElements, nodeKey, entry);
      if (nextElements !== currentElements) {
        api?.updateScene?.({ elements: nextElements, captureUpdate: "IMMEDIATELY" });
      }
      setHistoryState((current) => ({
        ...current,
        artifacts: markCanvasHistoryArtifactSelected(current.artifacts, entry, current.nodeKey === "*" ? "" : current.nodeKey),
      }));
    } catch {
      setHistoryState((current) => ({ ...current, error: "当前结果设置失败。" }));
    } finally {
      setSelectingArtifactId("");
    }
  }, [api, assetClient, canvasProjectId, historyState.nodeKey, selectingArtifactId]);

  const historyRetryCredit = useCallback((run) => {
    const nodeKey = String(run?.nodeKey ?? (historyState.nodeKey === "*" ? "" : historyState.nodeKey) ?? "").trim();
    const element = api?.getSceneElements?.().find((item) => item.id === nodeKey && !item.isDeleted);
    const request = buildCanvasNodeGenerationRequest(element);
    if (!request) return { insufficient: false };
    const kind = request.type === "video-generator" ? "video" : request.type === "audio-node" ? "audio" : "image";
    const model = resolveCanvasGenerationModel(generationConfig.config, kind, request.modelCode ?? request.model)?.raw;
    return resolveCanvasGenerationCreditState(
      model,
      buildCanvasGenerationParameters(kind, request),
      generationConfig.creditBalance,
    );
  }, [api, generationConfig.config, generationConfig.creditBalance, historyState.nodeKey]);

  const retryHistoryRun = useCallback(async (run) => {
    if (!api || retryingRunId || typeof onGenerate !== "function") return;
    const nodeKey = String(run?.nodeKey ?? (historyState.nodeKey === "*" ? "" : historyState.nodeKey) ?? "").trim();
    const element = api.getSceneElements?.().find((item) => item.id === nodeKey && !item.isDeleted);
    const request = buildCanvasNodeGenerationRequest(element);
    if (!request) {
      setHistoryState((current) => ({ ...current, error: "原生成节点已不存在，无法重新生成。" }));
      return;
    }
    if (historyRetryCredit(run).insufficient) {
      setHistoryState((current) => ({ ...current, error: "积分不足，请先充值后再重新生成。" }));
      return;
    }
    setRetryingRunId(run.id);
    setHistoryState((current) => ({ ...current, error: "" }));
    try {
      await executeCanvasNodeGeneration({ api, request, onGenerate, generationConfig });
      await loadHistory(historyState.nodeKey);
    } catch (error) {
      await loadHistory(historyState.nodeKey);
      setHistoryState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "重新生成失败，请检查节点输入后重试。",
      }));
    } finally {
      setRetryingRunId("");
    }
  }, [api, historyRetryCredit, historyState.nodeKey, loadHistory, onGenerate, retryingRunId]);

  const updateFile = useCallback((entry, updates) => {
    if (!api || !entry?.id) return;
    const current = api.getSceneElements?.() ?? [];
    const next = updateCanvasFileMetadata(current, entry.id, updates);
    if (next === current) return;
    api.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
    refresh();
  }, [api, refresh]);

  const moveFile = useCallback((entry, folder) => updateFile(entry, { folder }), [updateFile]);
  const renameFile = useCallback((entry) => {
    const nextName = window.prompt("重命名文件", entry.title);
    if (nextName === null) return;
    updateFile(entry, { title: nextName });
  }, [updateFile]);
  const cloudAssetCapabilitiesFor = useCallback((entry) => canvasCloudAssetCapabilities(
    entry,
    assetClient,
    cloudAssetActor,
  ), [assetClient, cloudAssetActor]);
  const renameAsset = useCallback(async (entry) => {
    if (!entry?.cloud || cloudAssetBusy) return;
    const token = mutationScopeRef.current?.token;
    const isCurrent = () => isCanvasAssetMutationScopeCurrent(mutationScopeRef, token);
    if (!isCurrent()) return;
    const nextName = window.prompt("重命名云资产", entry.title);
    if (nextName === null || !String(nextName).trim()) return;
    setCloudAssetBusy(`${entry.id}:rename`);
    setCloudAssetActionError("");
    try {
      const title = await renameCanvasCloudAsset(assetClient, entry, nextName);
      if (!isCurrent()) return;
      setCloudEntries((current) => renameCanvasCloudAssetEntry(current, entry.id, title));
    } catch (error) {
      if (!isCurrent()) return;
      setCloudAssetActionError(error?.status === 403 ? "当前账号没有重命名该云资产的权限。" : "云资产重命名失败，原列表未改变。请稍后重试。");
    } finally {
      if (isCurrent()) setCloudAssetBusy("");
    }
  }, [assetClient, canvasProjectId, cloudAssetBusy]);
  const deleteAsset = useCallback(async (entry) => {
    if (!entry?.cloud || cloudAssetBusy) return;
    const token = mutationScopeRef.current?.token;
    const isCurrent = () => isCanvasAssetMutationScopeCurrent(mutationScopeRef, token);
    if (!isCurrent()) return;
    if (!window.confirm(`删除云资产“${entry.title}”？画布中已插入的引用会保留。`)) return;
    setCloudAssetBusy(`${entry.id}:delete`);
    setCloudAssetActionError("");
    try {
      await deleteCanvasCloudAsset(assetClient, entry);
      if (!isCurrent()) return;
      setCloudEntries((current) => removeCanvasCloudAssetEntry(current, entry.id));
    } catch (error) {
      if (!isCurrent()) return;
      setCloudAssetActionError(error?.status === 403 ? "当前账号没有删除该云资产的权限。" : "云资产删除失败，原列表未改变。请稍后重试。");
    } finally {
      if (isCurrent()) setCloudAssetBusy("");
    }
  }, [assetClient, canvasProjectId, cloudAssetBusy]);
  const createAgent = useCallback(async () => {
    if (agentBusy || typeof assetClient?.createAgentAsset !== "function") return;
    const name = window.prompt("Agent 名称", "导演 Agent");
    if (name === null || !String(name).trim()) return;
    const description = window.prompt("Agent 描述", "用于输出可执行的镜头与连续性指令");
    if (description === null) return;
    const instructions = window.prompt("默认导演要求", "保持角色、场景和镜头轴线连续");
    if (instructions === null) return;
    setAgentBusy("new:create");
    setAgentError("");
    try {
      const payload = await assetClient.createAgentAsset({ name: String(name).trim(), description, instructions });
      if (payload?.asset) setAgentAssets((current) => prependAgentAsset(current, payload.asset));
    } catch (error) {
      setAgentError(error?.errorCode === "agent_asset_name_conflict" ? "同名 Agent 已存在。" : "Agent 新建失败，未保存任何更改。");
    } finally {
      setAgentBusy("");
    }
  }, [agentBusy, assetClient]);
  const editAgent = useCallback(async (asset) => {
    if (!asset?.id || agentBusy || typeof assetClient?.updateAgentAsset !== "function") return;
    const name = window.prompt("Agent 名称", asset.name);
    if (name === null || !String(name).trim()) return;
    const description = window.prompt("Agent 描述", asset.description ?? "");
    if (description === null) return;
    const instructions = window.prompt("默认导演要求", asset.instructions ?? "");
    if (instructions === null) return;
    setAgentBusy(`${asset.id}:edit`);
    setAgentError("");
    try {
      const payload = await assetClient.updateAgentAsset(asset.id, { name: String(name).trim(), description, instructions });
      if (payload?.asset) setAgentAssets((current) => replaceAgentAsset(current, asset.id, payload.asset));
    } catch (error) {
      setAgentError(error?.errorCode === "agent_asset_name_conflict" ? "同名 Agent 已存在。" : "Agent 编辑失败，原配置未改变。");
    } finally {
      setAgentBusy("");
    }
  }, [agentBusy, assetClient]);
  const deleteAgent = useCallback(async (asset) => {
    if (!asset?.id || agentBusy || typeof assetClient?.deleteAgentAsset !== "function") return;
    if (!window.confirm(`删除 Agent“${asset.name}”？画布中已插入的导演节点会保留当前配置。`)) return;
    setAgentBusy(`${asset.id}:delete`);
    setAgentError("");
    try {
      await assetClient.deleteAgentAsset(asset.id);
      setAgentAssets((current) => removeAgentAsset(current, asset.id));
    } catch {
      setAgentError("Agent 删除失败，原列表未改变。");
    } finally {
      setAgentBusy("");
    }
  }, [agentBusy, assetClient]);
  const insertAgent = useCallback((asset) => {
    if (!api || !asset?.id || agentBusy) return;
    setAgentBusy(`${asset.id}:insert`);
    setAgentError("");
    try {
      const elementId = insertAgentAssetOnCanvas(api, asset);
      if (!elementId) throw new Error("director node unavailable");
      const element = api.getSceneElements?.().find((entry) => entry.id === elementId);
      api.updateScene?.({ appState: { selectedElementIds: { [elementId]: true } } });
      if (element) api.scrollToContent?.(element, { fitToContent: false, animate: true, duration: 250 });
    } catch {
      setAgentError("Agent 插入失败，画布未添加节点。");
    } finally {
      setAgentBusy("");
    }
  }, [agentBusy, api]);
  const createFolder = useCallback(() => {
    const selected = entries.find((entry) => selectedIds[entry.id]);
    if (!selected) {
      api?.setToast?.({ message: "请先在画布中选择一个素材或生成节点。" });
      return;
    }
    const folder = normalizeCanvasFolderName(window.prompt("新建文件夹并移动所选文件", "新建文件夹"));
    if (!folder) return;
    updateFile(selected, { folder });
    setFolderFilter(folder);
  }, [api, entries, selectedIds, updateFile]);
  const renameFolder = useCallback(() => {
    if (!["all", "unfiled"].includes(folderFilter)) {
      const nextName = normalizeCanvasFolderName(window.prompt("重命名文件夹", folderFilter));
      if (!nextName || nextName === folderFilter) return;
      const current = api?.getSceneElements?.() ?? [];
      const next = renameCanvasFolder(current, folderFilter, nextName);
      if (next !== current) api?.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
      setFolderFilter(nextName);
      refresh();
    }
  }, [api, folderFilter, refresh]);
  const deleteFolder = useCallback(() => {
    if (["all", "unfiled"].includes(folderFilter)) return;
    if (!window.confirm(`删除文件夹“${folderFilter}”？文件会移到未分类。`)) return;
    const current = api?.getSceneElements?.() ?? [];
    const next = removeCanvasFolder(current, folderFilter);
    if (next !== current) api?.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
    setFolderFilter("all");
    refresh();
  }, [api, folderFilter, refresh]);

  const visibleEntries = useMemo(() => {
    if (["history", "library", "agents"].includes(activeTab)) return [];
    const source = activeTab === "assets" ? [...cloudEntries, ...entries.filter((entry) => entry.reusable)] : entries;
    const filtered = filterCanvasFileEntries(source, {
      query,
      type: dedicatedAssetsDialog || activeTab === "assets" && typeFilter === "generator" ? "all" : typeFilter,
      source: activeTab === "assets" ? sourceFilter : "all",
      assetCategory: dedicatedAssetsDialog ? typeFilter : "all",
    });
    if (activeTab !== "canvas" || folderFilter === "all") return filtered;
    return filtered.filter((entry) => folderFilter === "unfiled" ? !entry.folder : entry.folder === folderFilter);
  }, [activeTab, cloudEntries, dedicatedAssetsDialog, entries, folderFilter, query, sourceFilter, typeFilter]);
  const visibleCanvasPanelEntries = useMemo(() => {
    const filtered = filterCanvasFileEntries(canvasPanelEntries, { query, type: typeFilter, source: "all" });
    if (folderFilter === "all") return filtered;
    return filtered.filter((entry) => folderFilter === "unfiled" ? !entry.folder : entry.folder === folderFilter);
  }, [canvasPanelEntries, folderFilter, query, typeFilter]);
  const displayedEntries = activeTab === "canvas" ? orderCanvasPanelEntries(visibleCanvasPanelEntries, canvasOrder) : visibleEntries;
  const assetSelectedEntries = useMemo(() => {
    const source = [...cloudEntries, ...entries.filter((entry) => entry.reusable)];
    return source.filter((entry) => assetSelectedIds.has(entry.id));
  }, [assetSelectedIds, cloudEntries, entries]);
  const toggleAssetSelection = useCallback((entry) => setAssetSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
    return next;
  }), []);
  const toggleAllVisibleAssets = useCallback(() => {
    setAssetSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => next.has(entry.id));
      visibleEntries.forEach((entry) => allSelected ? next.delete(entry.id) : next.add(entry.id));
      return next;
    });
  }, [visibleEntries]);
  const insertSelectedAssets = useCallback(async () => {
    const batchApi = api;
    const batchCanvasProjectId = canvasProjectId;
    const requestId = assetBatchRequestRef.current + 1;
    assetBatchRequestRef.current = requestId;
    const isCurrent = () => {
      const scope = insertScopeRef.current;
      return assetBatchRequestRef.current === requestId
        && scope?.api === batchApi
        && scope.canvasProjectId === batchCanvasProjectId
        && scope.open;
    };
    await runCanvasAssetBatch(
      assetSelectedEntries,
      (entry) => insert(entry, { shouldInsert: isCurrent }),
      { shouldContinue: isCurrent },
    );
    if (isCurrent()) {
      setAssetBatchMode(false);
      setAssetSelectedIds(new Set());
      setAssetBatchFolder("");
    }
  }, [api, assetSelectedEntries, canvasProjectId, insert]);
  const classifySelectedAssets = useCallback((folder) => {
    const localIds = assetSelectedEntries.filter((entry) => !entry.cloud).map((entry) => entry.id);
    if (!localIds.length) {
      api?.setToast?.({ message: "所选资产均来自云端，分类由来源素材库管理。", closable: true });
      return;
    }
    const current = api?.getSceneElements?.() ?? [];
    const next = updateCanvasFilesMetadata(current, localIds, { folder });
    if (next !== current) api?.updateScene?.({ elements: next, captureUpdate: "IMMEDIATELY" });
    if (localIds.length !== assetSelectedEntries.length) {
      api?.setToast?.({ message: `已分类 ${localIds.length} 个画布资产；云资产分类保持来源库设置。`, closable: true });
    }
    refresh();
  }, [api, assetSelectedEntries, refresh]);
  const createAssetCategory = useCallback(() => {
    const folder = normalizeCanvasFolderName(window.prompt("新建分类", "新建分类"));
    if (!folder) return;
    setAssetBatchFolder(folder);
    classifySelectedAssets(folder);
  }, [classifySelectedAssets]);
  const uploadAssets = useCallback(async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const supported = files.filter((file) => /^(?:image|video|audio)\//.test(file.type));
    if (!supported.length) {
      setInsertError("仅支持图片、视频或音频文件。");
      return;
    }
    if (typeof onImportImage !== "function" || !api || assetUploading) return;
    const uploadApi = api;
    const uploadCanvasProjectId = canvasProjectId;
    const requestId = assetUploadRequestRef.current + 1;
    assetUploadRequestRef.current = requestId;
    const isCurrent = () => {
      const scope = insertScopeRef.current;
      return assetUploadRequestRef.current === requestId
        && scope?.api === uploadApi
        && scope.canvasProjectId === uploadCanvasProjectId
        && scope.open;
    };
    setAssetUploading(true);
    setInsertError("");
    const results = await runCanvasAssetBatch(
      supported,
      (file) => onImportImage(file, uploadApi, { shouldInsert: isCurrent }),
      { shouldContinue: isCurrent },
    );
    const failed = results.filter((result) => !result).length;
    if (isCurrent()) {
      refresh();
      await loadCloudEntries({ shouldApply: isCurrent });
      if (isCurrent()) setInsertError(failed ? `${failed} 个素材上传失败，其余素材已保存。` : "");
    }
    if (isCurrent()) setAssetUploading(false);
  }, [api, assetUploading, canvasProjectId, loadCloudEntries, onImportImage, refresh]);

  const runAssetCreateMenuItem = useCallback((item) => {
    setAssetCreateMenuOpen(false);
    requestAnimationFrame(() => assetCreateMenuButtonRef.current?.focus());
    setInsertError("");
    if (item.nodeType) {
      const result = insertCanvasAssetCreateNode(api, item.id);
      if (!result.ok) setInsertError("当前画布尚未准备好，无法添加节点。");
      return;
    }
    if (item.action === "upload") {
      assetUploadInputRef.current?.click();
      return;
    }
    if (item.view === "history") {
      const canOpenDedicatedHistory = typeof onOpenFilesView === "function";
      onOpenFilesView?.("history");
      if (!canOpenDedicatedHistory) {
        setActiveTab("history");
        setHistoryNodeKey("*");
        setHistoryType("all");
      }
      return;
    }
    if (item.view === "assets") {
      setActiveTab("assets");
      setSourceFilter("all");
      setTypeFilter("all");
      setQuery("");
    }
  }, [api, onOpenFilesView]);
  const visibleResourceEntries = useMemo(() => {
    const source = resourceKind === "style"
      ? styleEntries
      : resourceKind === "tool"
        ? toolEntries
        : resourceEntries.filter((entry) => ["character", "scene", "prop"].includes(entry.resourceCategory));
    return filterCanvasResourceEntries(source, {
      query,
      category: dedicatedCharacterDialog ? "character" : resourceKind === "character" ? resourceCategory : resourceKind,
      source: resourceKind === "tool" ? "all" : sourceFilter,
    });
  }, [dedicatedCharacterDialog, query, resourceCategory, resourceEntries, resourceKind, sourceFilter, styleEntries, toolEntries]);
  const displayedPreviewEntry = dedicatedCharacterDialog
    ? visibleResourceEntries.find((entry) => entry.id === previewEntry?.id) ?? visibleResourceEntries[0] ?? null
    : previewEntry;
  const visibleAgentAssets = useMemo(() => {
    const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
    if (!normalizedQuery) return agentAssets;
    return agentAssets.filter((asset) => [asset.name, asset.description, asset.instructions]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalizedQuery)));
  }, [agentAssets, query]);
  const displayedHistoryType = dedicatedHistoryDialog ? historyDialogType : historyType;
  const visibleHistoryArtifacts = useMemo(() => historyState.artifacts
    .filter((artifact) => activeTab !== "history" || displayedHistoryType === "all" || artifact.type === displayedHistoryType)
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || "") || 0;
      const order = leftTime - rightTime || (Number(left.runNo) || 0) - (Number(right.runNo) || 0);
      return historyOrder === "asc" ? order : -order;
    }), [activeTab, displayedHistoryType, historyOrder, historyState.artifacts]);
  const failedHistoryRuns = useMemo(() => listCanvasFailedHistoryRuns(historyState.runs)
    .filter((run) => activeTab !== "history" || displayedHistoryType === "all" || run.type === displayedHistoryType)
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
      const order = leftTime - rightTime || (Number(left.runNo) || 0) - (Number(right.runNo) || 0);
      return historyOrder === "asc" ? order : -order;
    }), [activeTab, displayedHistoryType, historyOrder, historyState.runs]);
  const allFailedHistoryRuns = useMemo(() => listCanvasFailedHistoryRuns(historyState.runs), [historyState.runs]);
  const historyTypeCounts = useMemo(() => [...historyState.artifacts, ...allFailedHistoryRuns].reduce((counts, item) => ({
    ...counts,
    [item.type]: (counts[item.type] ?? 0) + 1,
  }), { image: 0, video: 0, audio: 0 }), [allFailedHistoryRuns, historyState.artifacts]);
  const historyTypeOptions = canvasHistoryTypeOptions(historyTypeCounts, dedicatedHistoryDialog);
  const historyItemCount = historyState.artifacts.length + allFailedHistoryRuns.length;
  const resourceTotalCount = dedicatedCharacterDialog
    ? resourceEntries.filter((entry) => entry.resourceCategory === "character").length
    : resourceKind === "style"
    ? styleEntries.length
    : resourceKind === "tool"
      ? toolEntries.length
      : resourceEntries.filter((entry) => ["character", "scene", "prop"].includes(entry.resourceCategory)).length;
  const totalCount = activeTab === "history"
    ? historyItemCount
    : activeTab === "agents" ? agentAssets.length
    : activeTab === "library" ? resourceTotalCount
    : activeTab === "assets" ? cloudEntries.length + entries.filter((entry) => entry.reusable).length : canvasPanelEntries.length;
  const visibleCount = activeTab === "history" ? visibleHistoryArtifacts.length + failedHistoryRuns.length : activeTab === "agents" ? visibleAgentAssets.length : activeTab === "library" ? visibleResourceEntries.length : displayedEntries.length;
  const toggleHistorySelection = useCallback((artifact) => setHistorySelectedIds((current) => {
    const next = new Set(current);
    const key = artifact.historyKey || `${artifact.nodeKey ?? historyState.nodeKey}:${artifact.id}`;
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }), [historyState.nodeKey]);
  const insertSelectedHistory = useCallback(async () => {
    const selected = visibleHistoryArtifacts.filter((artifact) => historySelectedIds.has(artifact.historyKey || `${artifact.nodeKey ?? historyState.nodeKey}:${artifact.id}`));
    for (const artifact of selected) await insert(artifact);
    setHistoryBatchMode(false);
    setHistorySelectedIds(new Set());
  }, [historySelectedIds, historyState.nodeKey, insert, visibleHistoryArtifacts]);

  if (!open) return null;
  const dialogTitle = dedicatedAssetsDialog ? "资产管理" : dedicatedHistoryDialog ? "历史资产" : dedicatedStyleDialog ? "风格库" : activeTab === "assets" ? "素材库" : activeTab === "library" && resourceKind === "character" ? "角色库" : activeTab === "history" ? "历史记录" : "文件管理";
  const PanelRoot = dialog ? "section" : "aside";
  const historyArtifactStyle = dedicatedHistoryDialog ? canvasHistoryScaleStyle(historyScale) : undefined;
  const panel = (
    <PanelRoot
      ref={panelRef}
      className={`lm-files-panel ${dialog ? "is-dialog" : ""} ${dedicatedAssetsDialog ? "is-assets-dialog" : ""} ${dedicatedHistoryDialog ? "is-history-dialog" : ""} ${dedicatedCharacterDialog ? "is-character-dialog" : ""}`.trim()}
      role={dialog ? "dialog" : undefined}
      aria-modal={dialog ? "true" : undefined}
      aria-label={dialog ? dialogTitle : "资产管理"}
      tabIndex={dialog ? -1 : undefined}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (assetCreateMenuOpen && !assetCreateMenuRef.current?.contains(event.target)) setAssetCreateMenuOpen(false);
      }}
      onKeyDown={handlePanelKeyDown}
      onWheel={(event) => event.stopPropagation()}
    >
      {dialog ? (
      <header className="lm-panel-header">
        <div><h2>{dialog ? dialogTitle : "资产管理"}</h2>{dedicatedHistoryDialog || dedicatedCharacterDialog || dedicatedAssetsDialog || dedicatedStyleDialog ? null : <span>{visibleCount === totalCount ? `${totalCount} 项` : `${visibleCount} / ${totalCount} 项`}</span>}</div>
        <div className="lm-panel-header-actions">
          {dedicatedHistoryDialog ? (
            <div className="lm-history-scale" role="group" aria-label="历史素材缩放">
              <button type="button" aria-label="缩小历史素材" disabled={historyScale <= CANVAS_HISTORY_SCALE_MIN} onClick={() => setHistoryScale((value) => stepCanvasHistoryScale(value, -1))}><Minus aria-hidden="true" /></button>
              <output aria-label="历史素材缩放比例" aria-live="polite">{historyScale}%</output>
              <button type="button" aria-label="放大历史素材" disabled={historyScale >= CANVAS_HISTORY_SCALE_MAX} onClick={() => setHistoryScale((value) => stepCanvasHistoryScale(value, 1))}><Plus aria-hidden="true" /></button>
            </div>
          ) : null}
          <button type="button" className="lm-icon-button" aria-label={dialog ? `关闭${dialogTitle}` : "关闭资产管理"} onClick={onClose}><X aria-hidden="true" /></button>
        </div>
      </header>
      ) : null}
      {dedicatedHistoryDialog || dedicatedCharacterDialog || dedicatedAssetsDialog || dedicatedStyleDialog ? null : (
      <>
      <div className="lm-files-navigation">
        <div className="lm-files-tabs" role="tablist" aria-label="文件视图">
          <button type="button" role="tab" aria-selected={activeTab === "canvas"} className={activeTab === "canvas" ? "is-active" : ""} onClick={() => { setActiveTab("canvas"); setTypeFilter("all"); setSourceFilter("all"); setAssetBatchMode(false); setAssetSelectedIds(new Set()); }}>画布</button>
          <button type="button" role="tab" aria-selected={["assets", "agents"].includes(activeTab)} className={["assets", "agents"].includes(activeTab) ? "is-active" : ""} onClick={() => { setActiveTab("assets"); setQuery(""); setTypeFilter("all"); setSourceFilter("personal-library"); setAssetBatchMode(false); setAssetSelectedIds(new Set()); }}>资产</button>
        </div>
        <button type="button" className="lm-files-manager-button" aria-label="资产管理" title="资产管理" onClick={() => onOpenFilesView?.("assets")}><BookOpen aria-hidden="true" /></button>
      </div>
      {["assets", "agents"].includes(activeTab) ? (
        <div className="lm-files-asset-tabs" role="tablist" aria-label="资产分类">
          <button type="button" role="tab" aria-selected={activeTab === "assets"} className={activeTab === "assets" ? "is-active" : ""} onClick={() => { setActiveTab("assets"); setQuery(""); setTypeFilter("all"); setSourceFilter("personal-library"); setAssetBatchMode(false); setAssetSelectedIds(new Set()); }}>个人</button>
          <button type="button" role="tab" aria-selected={activeTab === "agents"} className={activeTab === "agents" ? "is-active" : ""} onClick={() => { setActiveTab("agents"); setQuery(""); }}>Agent</button>
        </div>
      ) : null}
      </>
      )}
      {dedicatedAssetsDialog ? (
        <>
          <nav className="lm-assets-dialog-sidebar" aria-label="资产来源">
            {canvasDedicatedAssetSourceOptions().map((option) => (
              <button
                key={option.value}
                type="button"
                className={sourceFilter === option.value ? "is-active" : ""}
                aria-current={sourceFilter === option.value ? "page" : undefined}
                onClick={() => { setSourceFilter(option.value); setAssetBatchMode(false); setAssetSelectedIds(new Set()); }}
              >
                {option.value === "personal-library" ? <UserRound aria-hidden="true" /> : <Folder aria-hidden="true" />}
                {option.label}
              </button>
            ))}
          </nav>
          <section className="lm-assets-dialog-controls" aria-label="资产管理筛选">
            <header>
              <h3>{canvasDedicatedAssetSourceOptions().find((option) => option.value === sourceFilter)?.label ?? "个人资产库"}</h3>
              <div>
                <button ref={assetBatchButtonRef} type="button" className={assetBatchMode ? "is-active" : ""} onClick={() => { setAssetBatchMode((value) => !value); setAssetSelectedIds(new Set()); setAssetBatchFolder(""); }}>批量操作</button>
                <div className="lm-assets-create" ref={assetCreateMenuRef}>
                  <button
                    ref={assetCreateMenuButtonRef}
                    type="button"
                    className="is-primary"
                    aria-label="新建资产和节点"
                    aria-haspopup="menu"
                    aria-controls="lm-assets-create-menu"
                    aria-expanded={assetCreateMenuOpen}
                    onClick={() => setAssetCreateMenuOpen((value) => !value)}
                  ><Plus aria-hidden="true" />新建</button>
                  {assetCreateMenuOpen ? (
                    <div id="lm-assets-create-menu" ref={assetCreateMenuPopupRef} className="lm-assets-create-menu" role="menu" aria-label="新建资产和节点">
                      {canvasAssetCreateMenuSections().map((section) => (
                        <section key={section.label} aria-label={section.label}>
                          <strong>{section.label}</strong>
                          {section.items.map((item) => {
                            const disabled = item.nodeType
                              ? !api
                              : item.action === "upload"
                                ? assetUploading || typeof onImportImage !== "function"
                                : false;
                            return (
                              <button key={item.id} type="button" role="menuitem" tabIndex={-1} disabled={disabled} onClick={() => runAssetCreateMenuItem(item)}>
                                <AssetCreateMenuIcon id={item.id} />
                                <span>{item.label}</span>
                                {item.id === "library" ? <ChevronRight className="is-chevron" aria-hidden="true" /> : null}
                              </button>
                            );
                          })}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </header>
            <label className="lm-files-search">
              <Search aria-hidden="true" />
              <input ref={assetSearchInputRef} type="search" aria-label="搜索资产" placeholder="请输入搜索内容" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="lm-assets-dialog-types" role="tablist" aria-label="资产类型">
              {canvasAssetTypeOptions().map((option) => (
                <button key={option.value} type="button" role="tab" aria-selected={typeFilter === option.value} className={typeFilter === option.value ? "is-active" : ""} onClick={() => { setTypeFilter(option.value); setAssetSelectedIds(new Set()); }}>{option.label}</button>
              ))}
            </div>
            {assetBatchMode ? <div className="lm-history-toolbar lm-asset-toolbar is-dedicated">
              <button type="button" disabled={!visibleEntries.length} onClick={toggleAllVisibleAssets}>{visibleEntries.length > 0 && visibleEntries.every((entry) => assetSelectedIds.has(entry.id)) ? "取消全选" : "全选当前"}</button>
              <button type="button" disabled={!assetSelectedEntries.length || Boolean(insertingId)} onClick={() => void insertSelectedAssets()}>插入所选({assetSelectedEntries.length})</button>
              <select aria-label="批量设置资产分类" value={assetBatchFolder} disabled={!assetSelectedEntries.length} onChange={(event) => { const value = event.target.value; setAssetBatchFolder(value); classifySelectedAssets(value === "__unfiled" ? "" : value); }}><option value="">设置分类</option><option value="__unfiled">未分类</option>{canvasFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}</select>
              <button type="button" disabled={!assetSelectedEntries.some((entry) => !entry.cloud)} onClick={createAssetCategory}><FolderPlus aria-hidden="true" />新建分类</button>
            </div> : null}
            <input ref={assetUploadInputRef} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={(event) => void uploadAssets(event)} />
          </section>
        </>
      ) : activeTab === "agents" ? (
        <div className="lm-resource-controls lm-agent-controls">
          <label className="lm-files-search">
            <Search aria-hidden="true" />
            <input type="search" aria-label="搜索 Agent 资产" placeholder="搜索 Agent 名称或导演要求" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="lm-resource-detail-action" disabled={Boolean(agentBusy)} onClick={() => void createAgent()}><Plus aria-hidden="true" />新建 Agent</button>
        </div>
      ) : activeTab === "library" ? dedicatedCharacterDialog ? null : (
        <div className="lm-resource-controls">
          {dedicatedStyleDialog ? null : <div className="lm-resource-kinds" role="tablist" aria-label="资源库分类">
            <button type="button" role="tab" aria-selected={resourceKind === "character"} className={resourceKind === "character" ? "is-active" : ""} onClick={() => { setResourceKind("character"); setResourceCategory("all"); setSourceFilter("all"); setPreviewEntry(null); }}>角色库</button>
            <button type="button" role="tab" aria-selected={resourceKind === "style"} className={resourceKind === "style" ? "is-active" : ""} onClick={() => { setResourceKind("style"); setSourceFilter("all"); setPreviewEntry(null); }}>风格预设</button>
            <button type="button" role="tab" aria-selected={resourceKind === "tool"} className={resourceKind === "tool" ? "is-active" : ""} onClick={() => { setResourceKind("tool"); setSourceFilter("all"); setPreviewEntry(null); }}>工具箱</button>
          </div>}
          <label className="lm-files-search">
            <Search aria-hidden="true" />
            <input type="search" aria-label="搜索资源库" placeholder={resourceKind === "character" ? "搜索角色、场景或道具" : resourceKind === "style" ? "搜索风格" : "搜索工具"} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {resourceKind !== "tool" ? (
            <div className={`lm-resource-selects ${resourceKind === "style" ? "is-single" : ""}`}>
              {resourceKind === "character" ? (
                <select aria-label="按资源分类筛选" value={resourceCategory} onChange={(event) => setResourceCategory(event.target.value)}>
                  <option value="all">全部分类</option><option value="character">角色</option><option value="scene">场景</option><option value="prop">道具</option>
                </select>
              ) : null}
              <select aria-label="按资源来源筛选" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {(resourceKind === "style" ? STYLE_SOURCE_OPTIONS : RESOURCE_SOURCE_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          ) : null}
        </div>
      ) : activeTab === "history" ? (
        <div className={`lm-history-controls ${dedicatedHistoryDialog ? "is-dedicated" : ""}`.trim()}>
          {!dedicatedHistoryDialog ? (
          <div className="lm-history-node-picker">
            <History aria-hidden="true" />
            <select aria-label="选择生成历史节点" value={historyNodeKey} disabled={!generatorEntries.length} onChange={(event) => { setHistoryNodeKey(event.target.value); setHistorySelectedIds(new Set()); }}>
              {!generatorEntries.length ? <option value="">暂无生成节点</option> : <option value="*">全部生成节点</option>}
              {generatorEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · {entry.kindLabel}</option>)}
            </select>
          </div>
          ) : null}
          <div className="lm-history-type-tabs" role="tablist" aria-label="生成历史类型">
            {historyTypeOptions.map(({ value, label, count }) => (
              <button key={value} type="button" role="tab" aria-selected={displayedHistoryType === value} className={displayedHistoryType === value ? "is-active" : ""} onClick={() => { if (dedicatedHistoryDialog) setHistoryDialogType(value); else setHistoryType(value); setHistorySelectedIds(new Set()); }}>{label}({count})</button>
            ))}
          </div>
          <div className="lm-history-toolbar">
            <button type="button" onClick={() => setHistoryOrder((value) => value === "desc" ? "asc" : "desc")}>{historyOrder === "desc" ? "时间降序" : "时间升序"}</button>
            <button type="button" className={historyBatchMode ? "is-active" : ""} onClick={() => { setHistoryBatchMode((value) => !value); setHistorySelectedIds(new Set()); }}>批量操作</button>
            {historyBatchMode ? <button type="button" disabled={!historySelectedIds.size || Boolean(insertingId)} onClick={insertSelectedHistory}>插入所选({historySelectedIds.size})</button> : null}
          </div>
        </div>
      ) : (
        <>
        {activeTab === "canvas" ? (
          <div className="lm-files-section-title">
            <span>画布元素</span>
            <button
              type="button"
              title={canvasOrder === "front-to-back" ? "切换为背景在前" : "切换为前景在前"}
              aria-label="背景在前显示"
              aria-pressed={canvasOrder === "back-to-front"}
              onClick={() => setCanvasOrder((value) => value === "front-to-back" ? "back-to-front" : "front-to-back")}
            >
              <ArrowUpDown aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <div className={`lm-files-filters ${activeTab === "assets" ? "is-assets" : ""}`}>
          <label className="lm-files-search">
            <Search aria-hidden="true" />
            <input type="search" aria-label="搜索文件与资产" placeholder={activeTab === "assets" ? "搜索资产" : "搜索画布内容"} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          {activeTab === "assets" ? (
            <div className="lm-assets-filter-anchor" ref={assetFiltersRef}>
              <button type="button" className="lm-assets-filter-trigger" ref={assetFiltersButtonRef} aria-label="筛选资产" aria-haspopup="dialog" aria-controls="lm-assets-filter-popover" aria-expanded={assetFiltersOpen} onClick={() => setAssetFiltersOpen((value) => !value)}><SlidersHorizontal aria-hidden="true" /></button>
              {assetFiltersOpen ? (
                <div id="lm-assets-filter-popover" className="lm-assets-filter-popover" role="dialog" aria-label="资产筛选条件">
                  <select aria-label="按类型筛选文件与资产" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                    {TYPE_OPTIONS.filter((option) => option.value !== "generator").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <select aria-label="按来源筛选资产" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                    {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          ) : (
            <select aria-label="按类型筛选文件与资产" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          )}
        </div>
        {activeTab === "canvas" ? <div className="lm-folder-controls"><Folder aria-hidden="true" /><select aria-label="按文件夹筛选" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">全部文件夹</option><option value="unfiled">未分类</option>{canvasFolders.map((folder) => <option value={folder} key={folder}>{folder}</option>)}</select><button type="button" className="lm-icon-button" title="新建文件夹" aria-label="新建文件夹" onClick={createFolder}><FolderPlus aria-hidden="true" /></button><button type="button" className="lm-icon-button" title="重命名当前文件夹" aria-label="重命名当前文件夹" disabled={["all", "unfiled"].includes(folderFilter)} onClick={renameFolder}><Pencil aria-hidden="true" /></button><button type="button" className="lm-icon-button" title="删除当前文件夹" aria-label="删除当前文件夹" disabled={["all", "unfiled"].includes(folderFilter)} onClick={deleteFolder}><Trash2 aria-hidden="true" /></button></div> : null}
        </>
      )}
      <div className="lm-files-list">
        {activeTab === "library" && displayedPreviewEntry ? (
          <section className={`lm-resource-detail ${dedicatedCharacterDialog ? "lm-character-detail" : ""}`.trim()} aria-label={`${displayedPreviewEntry.title} 资源预览`}>
            <header><div><Eye aria-hidden="true" /><strong>{displayedPreviewEntry.title}</strong></div>{dedicatedCharacterDialog ? null : <button type="button" className="lm-icon-button" aria-label="关闭资源预览" onClick={() => setPreviewEntry(null)}><X aria-hidden="true" /></button>}</header>
            <div className="lm-resource-detail-media">{displayedPreviewEntry.previewUrl ? <img src={displayedPreviewEntry.previewUrl} alt={displayedPreviewEntry.title} /> : <ResourceIcon entry={displayedPreviewEntry} />}</div>
            <dl>
              <div><dt>类型</dt><dd>{displayedPreviewEntry.kindLabel}</dd></div>
              <div><dt>来源</dt><dd>{displayedPreviewEntry.sourceLabel}</dd></div>
              {displayedPreviewEntry.folder ? <div><dt>分类</dt><dd>{displayedPreviewEntry.folder}</dd></div> : null}
              {displayedPreviewEntry.prompt ? <div><dt>{displayedPreviewEntry.resourceType === "style" ? "风格提示" : "描述"}</dt><dd>{displayedPreviewEntry.prompt}</dd></div> : null}
              {displayedPreviewEntry.description ? <div><dt>能力</dt><dd>{displayedPreviewEntry.description}</dd></div> : null}
            </dl>
            {displayedPreviewEntry.resourceType === "tool" && displayedPreviewEntry.source === "user" ? (
              <label className="lm-resource-version-select">
                <span>工具版本</span>
                <select
                  aria-label={`${displayedPreviewEntry.title}版本`}
                  value={displayedPreviewEntry.selectedVersionNumber}
                  disabled={toolVersionState[displayedPreviewEntry.id]?.status === "loading" || !toolVersions[displayedPreviewEntry.id]?.length}
                  onChange={(event) => void selectToolVersion(displayedPreviewEntry, event.target.value)}
                >
                  {(toolVersions[displayedPreviewEntry.id] ?? [{ versionNumber: displayedPreviewEntry.selectedVersionNumber }]).map((version) => <option key={version.versionNumber} value={version.versionNumber}>v{version.versionNumber}</option>)}
                </select>
              </label>
            ) : null}
            <button type="button" className="lm-resource-detail-action" disabled={insertingId === displayedPreviewEntry.id || (displayedPreviewEntry.resourceType === "style" && !displayedPreviewEntry.promptContent)} onClick={() => runResourceAction(displayedPreviewEntry)}>
              {insertingId === displayedPreviewEntry.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : displayedPreviewEntry.resourceType === "style" ? <Palette aria-hidden="true" /> : <Plus aria-hidden="true" />}
              {dedicatedCharacterDialog ? "应用至画布" : displayedPreviewEntry.resourceType === "style" ? "应用到图片生成节点" : displayedPreviewEntry.resourceType === "tool" ? "添加到画布" : "插入画布"}
            </button>
          </section>
        ) : null}
        {historyGenerator ? (
          <section className={`lm-node-history ${dedicatedHistoryDialog ? "is-dedicated" : ""}`.trim()} aria-label={`${historyGenerator.title} 生成历史`}>
            {!dedicatedHistoryDialog ? <header>
              <div><History aria-hidden="true" /><strong>生成历史</strong><span>{historyGenerator.kindLabel}</span></div>
              <button type="button" className="lm-icon-button" aria-label="刷新生成历史" disabled={historyState.status === "loading"} onClick={() => loadHistory(historyGenerator.id)}><RefreshCw className={historyState.status === "loading" ? "is-spinning" : ""} aria-hidden="true" /></button>
            </header> : null}
            {historyState.status === "loading" ? <p className="lm-history-state"><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载生成历史…</p> : null}
            {historyState.status === "unavailable" ? <p className="lm-history-state">画布尚未取得云端项目标识，暂时无法读取历史。</p> : null}
            {historyState.status === "error" || historyState.error ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{historyState.error || "生成历史加载失败。"}</span><button type="button" aria-label="重新加载生成历史" onClick={() => loadHistory(historyGenerator.id)}><RefreshCw aria-hidden="true" /></button></div> : null}
            {historyState.status === "loaded" && !historyItemCount ? <p className="lm-history-state">{dedicatedHistoryDialog ? "暂无历史记录" : historyNodeKey === "*" ? "当前范围暂无生成记录" : "该节点暂无生成记录"}</p> : null}
            {historyState.status === "loaded" && historyItemCount && !visibleHistoryArtifacts.length && !failedHistoryRuns.length ? <p className="lm-history-state">当前类型暂无生成记录</p> : null}
            {failedHistoryRuns.length ? (
              <div className="lm-history-runs" aria-label="失败生成记录">
                {failedHistoryRuns.map((run) => (
                  <article className="lm-history-run is-failed" key={`${run.nodeKey}:${run.id}`}>
                    <span className="lm-history-run-icon"><AlertCircle aria-hidden="true" /></span>
                    <div className="lm-history-copy">
                      <strong>{run.runNo ? `第 ${run.runNo} 次${run.kindLabel}生成` : `${run.kindLabel}生成失败`}</strong>
                      <span>{run.failureMessage}{run.nodeKey && historyNodeKey === "*" ? ` · ${run.nodeKey}` : ""}</span>
                    </div>
                    <div className="lm-history-actions">
                      <button
                        type="button"
                        className="lm-icon-button"
                        title="重新生成"
                        aria-label={`重新生成第 ${run.runNo || "?"} 次${run.kindLabel}任务`}
                        disabled={Boolean(retryingRunId) || typeof onGenerate !== "function" || historyRetryCredit(run).insufficient}
                        onClick={() => void retryHistoryRun(run)}
                      >
                        {retryingRunId === run.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            {historyState.artifacts.length ? (
              <div className="lm-history-artifacts" style={historyArtifactStyle}>
                {visibleHistoryArtifacts.map((artifact) => {
                  const historyKey = artifact.historyKey || `${artifact.nodeKey ?? historyState.nodeKey}:${artifact.id}`;
                  return (
                  <article className={`lm-history-artifact ${artifact.selected ? "is-current" : ""}`} key={historyKey} draggable={insertingId !== artifact.id} onDragStart={(event) => startAssetDrag(event, artifact, "history")}>
                    {activeTab === "history" && historyBatchMode ? <input type="checkbox" checked={historySelectedIds.has(historyKey)} aria-label={`选择历史产物 ${artifact.title}`} onChange={() => toggleHistorySelection(artifact)} /> : null}
                    <button type="button" className="lm-history-preview" title={`插入 ${artifact.title}`} disabled={insertingId === artifact.id} onClick={() => insert(artifact)}>
                      {artifact.type === "image" || artifact.thumbnailUrl ? <img src={artifact.type === "image" ? artifact.mediaUrl : artifact.thumbnailUrl} alt="" loading="lazy" draggable={false} /> : <Video aria-hidden="true" />}
                      {insertingId === artifact.id ? <LoaderCircle className="is-spinning lm-history-loading" aria-hidden="true" /> : null}
                    </button>
                    <div className="lm-history-copy"><strong title={artifact.title}>{artifact.title}</strong><span>{artifact.runNo ? `第 ${artifact.runNo} 次` : artifact.kindLabel}{artifact.nodeKey && historyNodeKey === "*" ? ` · ${artifact.nodeKey}` : ""}{artifact.selected ? " · 当前" : ""}</span></div>
                    <div className="lm-history-actions">
                      <button type="button" className="lm-icon-button" title="插入画布" aria-label={`插入历史产物 ${artifact.title}`} disabled={insertingId === artifact.id} onClick={() => insert(artifact)}><CopyPlus aria-hidden="true" /></button>
                      <button type="button" className="lm-icon-button" title="设为当前结果" aria-label={`设为当前结果 ${artifact.title}`} disabled={artifact.selected || Boolean(selectingArtifactId)} onClick={() => selectHistoryArtifact(artifact)}>{selectingArtifactId === artifact.id ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}</button>
                    </div>
                  </article>
                );})}
              </div>
            ) : null}
          </section>
        ) : null}
        {activeTab === "assets" && cloudLoadState === "loading" && <p className={`lm-panel-status ${totalCount ? "is-inline" : ""}`}><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载素材…</p>}
        {activeTab === "assets" && cloudErrors.length ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{cloudErrors.join(" ")}</span><button type="button" onClick={loadCloudEntries} aria-label="重新加载素材"><RefreshCw aria-hidden="true" /></button></div> : null}
        {activeTab === "assets" && cloudAssetActionError ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{cloudAssetActionError}</span></div> : null}
        {activeTab === "agents" && agentLoadState === "loading" ? <p className="lm-panel-status"><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载 Agent 资产…</p> : null}
        {activeTab === "agents" && agentError ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{agentError}</span><button type="button" onClick={loadAgentAssets} aria-label="重新加载 Agent 资产"><RefreshCw aria-hidden="true" /></button></div> : null}
        {activeTab === "library" && resourceKind !== "tool" && resourceLoadState === "loading" ? <p className="lm-panel-status"><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载角色与风格资源…</p> : null}
        {activeTab === "library" && resourceKind === "tool" && toolLoadState === "loading" ? <p className="lm-panel-status"><LoaderCircle className="is-spinning" aria-hidden="true" />正在加载真实工具目录…</p> : null}
        {activeTab === "library" && resourceKind !== "tool" && resourceErrors.length ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{resourceErrors.join(" ")}</span><button type="button" onClick={loadResourceEntries} aria-label="重新加载资源库"><RefreshCw aria-hidden="true" /></button></div> : null}
        {activeTab === "library" && resourceKind === "tool" && toolErrors.length ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{toolErrors.join(" ")}</span><button type="button" onClick={loadToolEntries} aria-label="重新加载工具目录"><RefreshCw aria-hidden="true" /></button></div> : null}
        {insertError ? <div className="lm-panel-warning"><AlertCircle aria-hidden="true" /><span>{insertError}</span></div> : null}
        {dedicatedAssetsDialog && cloudLoadState !== "loading" && !visibleEntries.length ? (
          <section className="lm-assets-dialog-empty" aria-label="资产为空">
            <Folder aria-hidden="true" />
            <strong>{query ? "没有匹配的资产" : "当前暂无资产"}</strong>
            <button type="button" disabled={assetUploading || typeof onImportImage !== "function"} onClick={() => assetUploadInputRef.current?.click()}>{assetUploading ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Upload aria-hidden="true" />}上传资产</button>
          </section>
        ) : null}
        {!dedicatedAssetsDialog && activeTab === "assets" && !totalCount && cloudLoadState !== "loading" ? <div className="lm-panel-empty is-asset-empty"><Folder aria-hidden="true" /><span>暂无资产</span></div> : null}
        {!dedicatedAssetsDialog && activeTab !== "assets" && !totalCount && !(activeTab === "agents" && agentLoadState === "loading") && !(activeTab === "library" && resourceKind !== "tool" && resourceLoadState === "loading") && !(activeTab === "library" && resourceKind === "tool" && toolLoadState === "loading") && !historyGenerator && <p className="lm-panel-empty">{activeTab === "history" ? dedicatedHistoryDialog ? "暂无历史记录" : "画布中暂无生成节点，添加生成节点后可读取历史" : activeTab === "agents" ? "暂无 Agent 资产，可新建导演 Agent" : activeTab === "library" ? dedicatedCharacterDialog ? "暂无可用角色" : "当前分类暂无可用资源" : "画布中暂无节点"}</p>}
        {!dedicatedAssetsDialog && !["history", "library", "agents"].includes(activeTab) && Boolean(totalCount) && !displayedEntries.length && <p className="lm-panel-empty">没有匹配的内容</p>}
        {activeTab === "library" && Boolean(totalCount) && !visibleResourceEntries.length ? <p className="lm-panel-empty">没有匹配的资源</p> : null}
        {activeTab === "agents" && Boolean(totalCount) && !visibleAgentAssets.length ? <p className="lm-panel-empty">没有匹配的 Agent</p> : null}
        {displayedEntries.map((entry) => {
          const assetView = activeTab === "assets";
          const busyPrefix = `${entry.id}:`;
          const assetBusy = cloudAssetBusy.startsWith(busyPrefix) ? cloudAssetBusy.slice(busyPrefix.length) : "";
          return <FileRow
            key={entry.id}
            entry={entry}
            assetView={assetView}
            batchMode={assetView && assetBatchMode}
            batchSelected={assetSelectedIds.has(entry.id)}
            folders={canvasFolders}
            inserting={insertingId === entry.id}
            rebinding={rebindingId === entry.id}
            selected={Boolean(selectedIds[entry.id])}
            assetCapabilities={assetView ? cloudAssetCapabilitiesFor(entry) : undefined}
            assetBusy={assetBusy}
            onBatchToggle={toggleAssetSelection}
            onDownload={download}
            onInsert={insert}
            onLocate={locate}
            onMove={moveFile}
            onRebind={rebind}
            onRename={renameFile}
            onRemove={remove}
            onAssetRename={renameAsset}
            onAssetDelete={deleteAsset}
            onDragStart={startAssetDrag}
          />;
        })}
        {activeTab === "library" && dedicatedCharacterDialog && visibleResourceEntries.length ? (
          <section className="lm-character-strip" aria-label="角色选择">
            {visibleResourceEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`lm-character-card ${displayedPreviewEntry?.id === entry.id ? "is-selected" : ""}`.trim()}
                aria-label={`选择角色 ${entry.title}`}
                aria-pressed={displayedPreviewEntry?.id === entry.id}
                onClick={() => setPreviewEntry(entry)}
              >
                <span className="lm-character-card-media">{entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt="" loading="lazy" /> : <ResourceIcon entry={entry} />}</span>
                <strong title={entry.title}>{entry.title}</strong>
              </button>
            ))}
          </section>
        ) : null}
        {activeTab === "library" && !dedicatedCharacterDialog ? visibleResourceEntries.map((entry) => <ResourceRow key={entry.id} entry={entry} busy={insertingId === entry.id} onAction={runResourceAction} onPreview={previewResource} onDragStart={startToolPresetDrag} />) : null}
        {activeTab === "agents" ? visibleAgentAssets.map((asset) => {
          const busy = agentBusy.startsWith(`${asset.id}:`) ? agentBusy.slice(asset.id.length + 1) : "";
          return <AgentAssetRow key={asset.id} asset={asset} busy={busy} onInsert={insertAgent} onEdit={(entry) => void editAgent(entry)} onDelete={(entry) => void deleteAgent(entry)} />;
        }) : null}
        {!dedicatedCharacterDialog && (activeTab === "agents" ? visibleAgentAssets.length : activeTab === "library" ? visibleResourceEntries.length : displayedEntries.length) ? <p className="lm-files-end">已显示全部</p> : null}
      </div>
      {!dialog ? (
        <footer className="lm-files-panel-footer">
          <button type="button" aria-label="关闭资产管理" title="关闭资产管理" onClick={onClose}><PanelLeftClose aria-hidden="true" /></button>
          <output aria-live="polite">{`共 ${canvasPanelEntries.length} 节点`}</output>
        </footer>
      ) : null}
    </PanelRoot>
  );
  return dialog ? <div className="lm-files-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>{panel}</div> : panel;
}
