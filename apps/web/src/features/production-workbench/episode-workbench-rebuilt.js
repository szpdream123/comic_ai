import { normalizeStoryboardIndices } from "./storyboard-state.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";
import { renderAssetImportModal } from "./project-detail.js";
import { resolveApiUrl } from "../../shared/creator-api.js";

const MEDIA_TABS = [
  { id: "image", label: "做图片" },
];

const STORYBOARD_MEDIA_TABS = [
  { id: "first-frame", label: "首帧生视频", action: "set-video-generation-mode", mode: "first-frame" },
  { id: "first-last-frame", label: "首尾帧生视频", action: "set-video-generation-mode", mode: "first-last-frame" },
  { id: "reference-video", label: "全能参考", action: "set-video-generation-mode", mode: "reference-video" },
  { id: "lip-sync", label: "对口型", action: "set-episode-media-mode", mode: "lip-sync" },
];

const ASSET_TABS = [
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
];
const EPISODE_ASSET_DESCRIPTION_LIMIT = 2500;

export const EPISODE_WORKBENCH_FALLBACK_ASSET_IDS = [];

const IMAGE_MODELS = [
  { id: "gpt-image-2-cn", label: "GPT Image 2" },
];

const VIDEO_MODELS = [
  { id: "vidu-q3-pro", label: "Vidu Q3 Pro" },
  { id: "hailuo-2-0", label: "海螺 2.0" },
  { id: "seedance-2-0-vip", label: "SeeDance 2.0 VIP" },
  { id: "happy-horse", label: "Happy Horse" },
];

const BATCH_IMAGE_MODEL_OPTIONS = [
  {
    id: "tnb-pro",
    label: "nano banana 2（链路G）",
    group: "Nano banana",
  },
  {
    id: "tnb-fast",
    label: "nano banana fast（链路G）",
    group: "Nano banana",
  },
  {
    id: "tnb-ultra",
    label: "nano banana pro（链路G）",
    group: "Nano banana",
  },
  {
    id: "jimeng-4-5",
    label: "gpt image 2（链路G）",
    group: "Gpt image",
  },
  {
    id: "jimeng-4-5-vip",
    label: "gpt image 2 VIP（链路G）",
    group: "Gpt image",
  },
];

const BATCH_VIDEO_MODEL_OPTIONS = [
  { id: "vidu-q3-pro", label: "Vidu Q3 Pro" },
  { id: "hailuo-2-0", label: "海螺 2.0" },
  { id: "seedance-2-0-vip", label: "SeeDance 2.0 VIP" },
];

const BATCH_RATIO_OPTIONS = [
  "auto",
  "9:16",
  "16:9",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
];

const BATCH_SIZE_OPTIONS = ["1K", "2K"];

const BATCH_PRESET_OPTIONS = [
  { id: "none", label: "无预设" },
  { id: "scene-vr", label: "[系统]VR场景图" },
  { id: "scene-overlook", label: "[系统]场景-俯视图" },
  { id: "prop-triple", label: "[系统]道具-三视图" },
  { id: "scene-wide", label: "[系统]场景-广角图" },
  { id: "character-triple", label: "[系统]角色-三视图" },
];

const BATCH_PUBLIC_STYLES = [
  { id: "public-1", label: "邵氏兄弟", preview: buildBatchStylePreview("#7c563f", "#f3cf95", "portrait") },
  { id: "public-2", label: "[动漫]赛博", preview: buildBatchStylePreview("#303755", "#7ee0ff", "energy") },
  { id: "public-3", label: "[动漫]中式", preview: buildBatchStylePreview("#463226", "#e4c28b", "city") },
  { id: "public-4", label: "[真人]中式", preview: buildBatchStylePreview("#2f241f", "#f3d7a2", "portrait") },
  { id: "public-5", label: "[动漫]废土", preview: buildBatchStylePreview("#44392f", "#c9baa2", "robot") },
  { id: "public-6", label: "[动漫]国风", preview: buildBatchStylePreview("#27324d", "#a7d7ff", "sword") },
  { id: "public-7", label: "[动漫]多镜", preview: buildBatchStylePreview("#1f2831", "#8fd0a2", "mask") },
  { id: "public-8", label: "[动漫]复古", preview: buildBatchStylePreview("#29455c", "#f1b06a", "scene") },
  { id: "public-9", label: "中国古风", preview: buildBatchStylePreview("#32403f", "#f0d08d", "sword") },
  { id: "public-10", label: "国漫3D", preview: buildBatchStylePreview("#27415a", "#9bd8ff", "scene") },
  { id: "public-11", label: "胡金铨武侠", preview: buildBatchStylePreview("#3a2b21", "#f4d9a6", "portrait") },
];

const BATCH_CUSTOM_STYLES = [
  { id: "custom-1", label: "日系动漫风", preview: buildBatchStylePreview("#2b3250", "#a9d8ff", "portrait") },
  { id: "custom-2", label: "都市电影感", preview: buildBatchStylePreview("#2e2b30", "#f3c391", "city") },
  { id: "custom-3", label: "灰蓝末世", preview: buildBatchStylePreview("#28303b", "#98b3c9", "scene") },
];

const VOICE_OPTIONS_BY_TAB = {
  custom: [
    { id: "custom-1", name: "军官音色" },
    { id: "custom-2", name: "应先生" },
    { id: "custom-3", name: "李右" },
    { id: "custom-4", name: "白野(我)" },
  ],
  system: [
    { id: "system-1", name: "女/稚嫩" },
    { id: "system-2", name: "女/天真" },
    { id: "system-3", name: "女/欢橘" },
    { id: "system-4", name: "女/甜美" },
    { id: "system-5", name: "女/温柔" },
    { id: "system-6", name: "男/普通01" },
    { id: "system-7", name: "男/不拘" },
    { id: "system-8", name: "男/阳光" },
    { id: "system-9", name: "女/嚣张" },
  ],
};

function buildBatchStylePreview(background, accent, art = "portrait") {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" rx="16" fill="url(#bg)"/>
      ${renderBatchStyleSvg(art)}
    </svg>
  `)}`;
}

function renderBatchStyleSvg(art) {
  const svgByArt = {
    portrait: '<circle cx="80" cy="36" r="17" fill="rgba(255,255,255,.92)"/><path d="M50 104c5-27 24-42 30-42s25 15 30 42Z" fill="rgba(18,18,20,.76)"/>',
    energy: '<path d="M76 16 40 70h26l-8 34 62-62H90l12-26Z" fill="rgba(255,255,255,.92)"/>',
    city: '<rect x="18" y="58" width="24" height="42" rx="4" fill="rgba(255,255,255,.85)"/><rect x="46" y="42" width="28" height="58" rx="4" fill="rgba(20,20,24,.78)"/><rect x="80" y="28" width="24" height="72" rx="4" fill="rgba(255,255,255,.78)"/><rect x="110" y="50" width="30" height="50" rx="4" fill="rgba(20,20,24,.7)"/>',
    robot: '<rect x="56" y="26" width="48" height="42" rx="10" fill="rgba(255,255,255,.88)"/><circle cx="70" cy="47" r="7" fill="rgba(20,20,24,.8)"/><circle cx="90" cy="47" r="7" fill="rgba(20,20,24,.8)"/><rect x="62" y="71" width="36" height="28" rx="8" fill="rgba(20,20,24,.72)"/>',
    sword: '<path d="M88 18 102 34 66 72 50 58Z" fill="rgba(255,255,255,.9)"/><path d="M56 62 48 100l40-8Z" fill="rgba(20,20,24,.76)"/>',
    mask: '<path d="M36 28h88v56c0 12-20 20-44 20S36 96 36 84Z" fill="rgba(255,255,255,.9)"/><circle cx="64" cy="60" r="8" fill="rgba(20,20,24,.78)"/><circle cx="96" cy="60" r="8" fill="rgba(20,20,24,.78)"/>',
    scene: '<path d="M0 88 38 54l28 20 22-14 30 24 42-36v72H0Z" fill="rgba(255,255,255,.28)"/><path d="M0 104 30 78l22 14 30-20 26 18 52-30v60H0Z" fill="rgba(20,20,24,.42)"/>',
  };
  return svgByArt[art] ?? svgByArt.portrait;
}

export function renderEpisodeWorkbench({
  episodeId = "",
  episodeTitle = "",
  storyboards = [],
  selectedStoryboard = null,
  assetLibrary = {},
  activeAssetTab = "character",
  selectedEpisodeCardId = null,
  selectedEpisodeAssetId = null,
  selectedEpisodeAssetIds = [],
  selectedStoryboardIds = [],
  episodeWorkbenchSelectedAttachmentIds = [],
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "gpt-image-2-cn",
  prompt = "",
  busy = false,
  canGenerateImages = true,
  canGenerateVideos = true,
  validationMessage = "",
  mediaMode = "image",
  generationControls = {},
  episodeGenerationConfig = null,
  generationUiState = {},
  storyboardDeleteTarget = null,
  storyboardImageDeleteTarget = null,
  storyboardVideoDeleteTarget = null,
  episodeAssetCreateModal = null,
  assetInspector = null,
  episodeWorkbenchAttachments = [],
  episodeVoiceModal = null,
  imageGenerationResult = null,
  videoGenerationResult = null,
  generationPollingActive = false,
  assetSearchQuery = "",
  exportPreviewResult = null,
  exportOptionModal = null,
  episodeBatchModal = null,
  assetImportModal = null,
  assetImportModalTab = "local",
  assetImportCategory = "domestic-modern-city",
  assetImportDrafts = [],
  assetImportSelection = [],
  assetImportPage = 1,
  assetImportPageSize = 10,
  assetImportPageSizeMenuOpen = false,
  assetImportOfficialAssets = [],
  projectLibraryAssetsByType = null,
  projectOtherAssetMediaType = "video",
  projectDetail = null,
} = {}) {
  const scopeMode = generationUiState.museScopeMode ?? "storyboard";
  const storyboardVisibleMediaTabs = STORYBOARD_MEDIA_TABS;
  const effectiveMediaMode =
    scopeMode === "assets"
      ? "image"
      : mediaMode === "image"
        ? "video"
        : mediaMode;
  const visibleMediaTabs =
    scopeMode === "assets"
      ? MEDIA_TABS.filter((tab) => tab.id === "image")
      : storyboardVisibleMediaTabs;
  const activeVideoGenerationMode = generationUiState.videoGenerationMode ?? "first-frame";
  const boardMode = generationUiState.museBoardMode ?? "operation";
  const effectiveModelId =
    scopeMode === "assets" && effectiveMediaMode === "image"
      ? selectedModelId
      : selectedModelId;
  const assetGroups = {
    character: mergeAssetGroup(assetLibrary.character ?? []),
    scene: mergeAssetGroup(assetLibrary.scene ?? []),
    prop: mergeAssetGroup(assetLibrary.prop ?? []),
  };
  const normalizedStoryboards = storyboards.length
    ? normalizeStoryboardIndices(storyboards)
    : [];
  const currentStoryboard =
    normalizedStoryboards.find((item) => item.id === selectedStoryboard?.id) ??
    normalizedStoryboards[0] ??
    null;
  const activeAssets = assetGroups[activeAssetTab] ?? [];
  const selectedAsset =
    activeAssets.find((item) => item.id === selectedEpisodeAssetId) ??
    activeAssets[0] ??
    null;
  const allAssetIds = [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].map(
    (item) => item.id,
  );
  const allStoryboardIds = normalizedStoryboards.map((item) => item.id);
  const isAllSelected =
    scopeMode === "storyboard"
      ? allStoryboardIds.length > 0 && allStoryboardIds.every((id) => selectedStoryboardIds.includes(id))
      : allAssetIds.length > 0 && allAssetIds.every((id) => selectedEpisodeAssetIds.includes(id));
  const canGenerateCurrentMode =
    effectiveMediaMode === "video" || effectiveMediaMode === "lip-sync"
      ? canGenerateVideos
      : canGenerateImages;
  const quickAssets = [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].slice(0, 18);
  const normalizedAssetSearchQuery = String(assetSearchQuery ?? "").trim().toLowerCase();
  const filteredQuickAssets = normalizedAssetSearchQuery
    ? quickAssets.filter((asset) => matchesAssetQuery(asset, normalizedAssetSearchQuery))
    : quickAssets;
  const showQuickSearch = quickAssets.length > 0;
  const showQuickEmptyState = Boolean(normalizedAssetSearchQuery) && filteredQuickAssets.length === 0;
  const assetPromptDraft = generationUiState.assetPromptDraft ?? {};
  const assetConversationHistory = generationUiState.assetConversationHistory ?? {};
  const storyboardConversationHistory = generationUiState.storyboardConversationHistory ?? {};
  const assetQuickReferenceItems = assetPromptDraft.quickReferenceItems ?? [];
  const assetSelectionContext = assetPromptDraft.selectionContext ?? {};
  const assetConversationEntries = resolveAssetConversationEntries(
    assetConversationHistory,
    selectedAsset?.id ?? null,
    effectiveMediaMode === "video" ? "video" : "image",
    imageGenerationResult,
  );
  const storyboardMediaKind = effectiveMediaMode === "video" || effectiveMediaMode === "lip-sync" ? "video" : "image";
  const storyboardConversationEntries = resolveStoryboardConversationEntries(
    storyboardConversationHistory,
    currentStoryboard?.id ?? null,
    storyboardMediaKind,
    storyboardMediaKind === "video" ? videoGenerationResult : imageGenerationResult,
  );
  const selectedAssetSummary = String(selectedAsset?.description ?? "").trim();
  const assetStageTitle = selectedAsset
    ? `${resolveAssetLabel(activeAssetTab)}${selectedAsset?.name ?? ""}${
        selectedAssetSummary ? `：${selectedAssetSummary}` : ""
      }`
    : "";
  const exportButtonLabel = scopeMode === "assets" ? "下一步：分镜制作" : "导出";
  const selectAllDisabled = scopeMode === "storyboard" ? allStoryboardIds.length === 0 : allAssetIds.length === 0;
  const batchButtonDisabled =
    scopeMode === "storyboard"
      ? selectedStoryboardIds.length === 0 && allStoryboardIds.length === 0
      : selectedEpisodeAssetIds.length === 0 && allAssetIds.length === 0;

  return `
    <section id="storyboard-workbench" class="episode-replica-shell" aria-label="分镜工作台" data-episode-id="${escapeAttr(episodeId)}" data-episode-title="${escapeAttr(episodeTitle)}">
      <header class="episode-replica-topbar">
        <div class="episode-replica-topbar-left">
          <button class="episode-replica-return" type="button" data-action="back-to-episode-hub">
            <span>←</span><strong>返回</strong>
          </button>
          <span class="episode-replica-timestamp">${escapeHtml(formatEpisodeWorkbenchIdentity(episodeTitle, episodeId))}</span>
        </div>
        <div class="episode-replica-topbar-center">
          <button class="episode-replica-pill ${isAllSelected ? "active" : ""}" type="button" data-action="${scopeMode === "storyboard" ? "toggle-storyboard-select-all" : "toggle-episode-asset-select-all"}" ${disabled(selectAllDisabled)}>全选</button>
          <button class="episode-replica-pill wide" type="button" data-action="open-episode-batch-actions" ${disabled(batchButtonDisabled)}>批量生图/视频 | 高清处理</button>
        </div>
        <div class="episode-replica-topbar-right">
          <div class="episode-replica-main-switch">
            <button class="${scopeMode === "assets" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="assets">角色/场景</button>
            <button class="${scopeMode === "storyboard" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="storyboard">分镜</button>
          </div>
          <button class="episode-replica-export ${scopeMode === "assets" ? "next-step" : ""}" type="button" data-action="${scopeMode === "assets" ? "set-muse-scope-mode" : "preview-export"}" ${scopeMode === "assets" ? 'data-mode="storyboard"' : ""}>${escapeHtml(exportButtonLabel)}</button>
        </div>
      </header>

      <div class="episode-replica-layout ${scopeMode === "storyboard" ? "storyboard-mode" : "assets-mode"}">
        <section class="episode-replica-left">
          ${
            scopeMode === "assets"
              ? renderAssetWorkspace(
                  assetGroups,
                  activeAssetTab,
                  selectedEpisodeCardId,
                  selectedEpisodeAssetIds,
                )
              : renderStoryboardWorkspace(normalizedStoryboards, currentStoryboard, boardMode, selectedStoryboardIds, assetGroups)
          }
        </section>

        <section class="episode-replica-center ${effectiveMediaMode === "video" || effectiveMediaMode === "lip-sync" ? "video-mode" : "image-mode"} ${scopeMode === "assets" ? "asset-scope" : "storyboard-scope"}">
          <div class="episode-replica-stage-head">
            <div class="episode-replica-stage-tabs">
              ${visibleMediaTabs.map((tab) => renderMediaTab(tab, effectiveMediaMode, activeVideoGenerationMode)).join("")}
            </div>
            <p class="episode-replica-stage-title">${
              scopeMode === "storyboard"
                ? `分镜：${escapeHtml(currentStoryboard?.displayTitle ?? currentStoryboard?.title ?? "")}`
                : escapeHtml(assetStageTitle)
            }</p>
          </div>
          <div class="episode-replica-stage-body">
            ${
              scopeMode === "storyboard"
                ? renderStoryboardStage(
                    currentStoryboard,
                    effectiveMediaMode,
                    imageGenerationResult,
                    videoGenerationResult,
                    storyboardConversationEntries,
                  )
                : assetConversationEntries.length > 0
                  ? renderAssetGeneratedStage(
                      selectedAsset,
                      activeAssetTab,
                      imageGenerationResult,
                      effectiveMediaMode,
                      assetConversationEntries,
                    )
                  : renderAssetStage({
                      asset: selectedAsset,
                      activeAssetTab,
                      mediaMode: effectiveMediaMode,
                      quickReferenceItems: assetQuickReferenceItems,
                      selectionContext: assetSelectionContext,
                    })
            }
          </div>
          ${renderPromptDock({
            selectedStoryboard: currentStoryboard,
            selectedAsset,
            selectedModelId: effectiveModelId,
            prompt,
            busy,
            canGenerateCurrentMode,
            validationMessage,
            generationControls,
            episodeGenerationConfig,
            generationUiState,
            mediaMode: effectiveMediaMode,
            attachments: episodeWorkbenchAttachments,
            selectedAttachmentIds: episodeWorkbenchSelectedAttachmentIds,
            generationPollingActive,
            scopeMode,
          })}
        </section>

        <aside class="episode-replica-right">
          <div class="episode-replica-right-head">
            <strong>资产快捷栏</strong>
            <span class="episode-replica-right-head-icon">⌕</span>
          </div>
          ${
            showQuickSearch
              ? `<label class="episode-replica-right-search">
                  <input
                    type="search"
                    value="${escapeAttr(assetSearchQuery ?? "")}"
                    placeholder="搜索资产快捷引用"
                    data-action="episode-asset-search"
                  />
                </label>`
              : ""
          }
          <div class="episode-replica-right-list">
            ${
              filteredQuickAssets.length
                ? filteredQuickAssets.map((asset) => renderQuickAsset(asset, asset.id === selectedEpisodeAssetId)).join("")
                : showQuickEmptyState && showQuickSearch
                  ? '<div class="episode-replica-right-empty">没有匹配到可快捷引用的资产。</div>'
                  : ""
            }
          </div>
        </aside>
      </div>

      ${renderEpisodeExportPreview(exportPreviewResult)}
      ${renderEpisodeExportOptionModal(exportOptionModal)}
      ${renderEpisodeBatchModal(episodeBatchModal)}
      ${renderStoryboardDescriptionModal({
        show: isStoryboardDescriptionModalOpen,
        value: storyboardDescriptionDraft,
        selectedStoryboard: currentStoryboard,
      })}
      ${renderEpisodeDeleteModal({
        show: Boolean(storyboardDeleteTarget),
        title: "删除分镜提示",
        text: "删除后无法找回，确认删除该分镜吗？",
        closeAction: "close-delete-storyboard-modal",
        confirmAction: "confirm-delete-storyboard",
      })}
      ${renderEpisodeDeleteModal({
        show: Boolean(storyboardImageDeleteTarget?.storyboardId && storyboardImageDeleteTarget?.imageId),
        title: "删除图片提示",
        text: "删除后无法找回，确认删除当前图片吗？",
        closeAction: "close-delete-storyboard-image-modal",
        confirmAction: "confirm-delete-storyboard-image",
      })}
      ${renderEpisodeDeleteModal({
        show: Boolean(storyboardVideoDeleteTarget?.storyboardId && storyboardVideoDeleteTarget?.videoId),
        title: "删除视频提示",
        text: "删除后无法找回，确认删除当前视频吗？",
        closeAction: "close-delete-storyboard-video-modal",
        confirmAction: "confirm-delete-storyboard-video",
      })}
      ${renderEpisodeDeleteModal({
        show: Boolean(assetInspector?.episodeDeleteAssetTarget?.assetId),
        title: "删除素材提示",
        text: "删除后无法找回，确认删除吗？",
        closeAction: "close-delete-episode-asset-modal",
        confirmAction: "confirm-delete-episode-asset",
      })}
      ${renderEpisodeAssetCreateModal(episodeAssetCreateModal)}
      ${renderEpisodeVoiceModal(episodeVoiceModal)}
      ${renderAssetInspectorModal(assetInspector)}
      ${assetImportModal
        ? renderAssetImportModal({
            projectPanelMode: "episode-workbench",
            assetImportModal,
            assetImportModalTab,
            assetImportCategory,
            assetImportDrafts,
            assetImportSelection,
            assetImportPage,
            assetImportPageSize,
            assetImportPageSizeMenuOpen,
            assetImportOfficialAssets,
            projectLibraryAssetsByType,
            projectOtherAssetMediaType,
            projectDetail,
          })
        : ""}
    </section>
  `;
}

function formatEpisodeWorkbenchIdentity(title, id) {
  const normalizedTitle = String(title ?? "").trim();
  const normalizedId = String(id ?? "").trim();
  if (normalizedTitle && normalizedId) {
    return `${normalizedTitle} · ${normalizedId.slice(0, 8)}`;
  }
  return normalizedTitle || (normalizedId ? normalizedId.slice(0, 8) : "") || "未选择剧集";
}

function mergeAssetGroup(baseItems = [], extraItems = []) {
  const merged = [];
  const indexById = new Map();
  for (const item of [...baseItems, ...extraItems]) {
    const id = item?.id ?? "";
    if (!id) {
      continue;
    }
    const existingIndex = indexById.get(id);
    if (existingIndex == null) {
      indexById.set(id, merged.length);
      merged.push(item);
      continue;
    }
    merged[existingIndex] = {
      ...merged[existingIndex],
      ...item,
    };
  }
  return merged;
}

function renderAssetWorkspace(
  assetGroups,
  activeAssetTab,
  selectedEpisodeCardId,
  selectedEpisodeAssetIds,
) {
  const groups = {
    character: assetGroups.character ?? [],
    scene: assetGroups.scene ?? [],
    prop: assetGroups.prop ?? [],
  };
  const visibleTabs = ASSET_TABS.filter((tab) => (groups[tab.id] ?? []).length > 0);
  return `
    <div class="episode-replica-asset-toolbar unified">
      <div class="episode-replica-asset-toolbar-head">
        <div class="episode-replica-asset-toolbar-main">
          <div class="episode-replica-asset-tabs">
            ${ASSET_TABS.map((tab) => `<button class="${tab.id === activeAssetTab ? "active" : ""}" type="button" data-action="set-project-asset-tab" data-asset-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>`).join("")}
          </div>
          <div class="episode-replica-asset-actions">
            <button type="button" data-action="open-episode-asset-create-modal">手动添加</button>
            <button type="button" data-action="open-asset-import-modal" data-asset-kind="${escapeAttr(activeAssetTab)}">资产库选取</button>
          </div>
        </div>
      </div>
      <div class="episode-replica-asset-sections">
        ${visibleTabs.map((tab) => `
          <section
            class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode ${tab.id === activeAssetTab ? "is-active" : ""}"
            data-asset-section="${escapeAttr(tab.id)}"
          >
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${
                (groups[tab.id] ?? []).map((asset, index) =>
                  renderAssetCard(
                    asset,
                    tab.id,
                    asset.id === selectedEpisodeCardId ||
                      (!selectedEpisodeCardId && tab.id === activeAssetTab && index === 0),
                    selectedEpisodeAssetIds.includes(asset.id),
                  ),
                ).join("")
              }
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAssetCard(asset, assetKind, active, checked) {
  const desc = String(asset?.description ?? "").trim() || "";
  const saveLabel = assetKind === "scene" ? "保存场景到资产库" : assetKind === "prop" ? "保存道具到资产库" : "保存角色到资产库";
  const fixedLabel = assetKind === "scene" ? "场景固定" : assetKind === "prop" ? "道具固定" : "角色固定";
  const descLabel = assetKind === "scene" ? "场景描述" : assetKind === "prop" ? "道具描述" : "角色描述";
  const voiceButton = renderAssetVoiceButton(asset, assetKind);
  return `
    <article
      class="episode-replica-asset-card ${active ? "active" : ""} ${checked ? "checked" : ""}"
      data-asset-card-id="${escapeAttr(asset?.id ?? "")}"
      data-asset-kind="${escapeAttr(assetKind)}"
    >
      <div class="episode-replica-asset-card-head">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-episode-asset-selection" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" aria-label="选择素材"></button>
        <button class="episode-replica-asset-select" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}">
          <strong class="name">${escapeHtml(asset?.name ?? "测试素材")}</strong>
        </button>
        <span class="episode-replica-asset-hover-tools" aria-hidden="true">
          <button type="button" data-action="save-episode-asset-to-library" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" aria-label="${escapeAttr(saveLabel)}" title="${escapeAttr(saveLabel)}">+</button>
          <button type="button" data-action="open-delete-episode-asset-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" data-asset-name="${escapeAttr(asset?.name ?? "素材")}" aria-label="删除" title="删除">×</button>
        </span>
      </div>
      <span class="toolbar">
        <button type="button" data-action="save-episode-asset-to-library" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" aria-label="${escapeAttr(saveLabel)}" title="${escapeAttr(saveLabel)}">+</button>
        <button type="button" data-action="open-delete-episode-asset-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" data-asset-name="${escapeAttr(asset?.name ?? "素材")}" aria-label="删除" title="删除">×</button>
      </span>
      <span class="label">${escapeHtml(fixedLabel)}</span>
      <span class="label">${escapeHtml(descLabel)}</span>
      <span class="preview">${renderAssetPreviewVisual(asset, assetKind)}</span>
      ${voiceButton}
      <label class="episode-replica-asset-desc-wrap">
        <textarea class="episode-replica-asset-desc-input" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" maxlength="${EPISODE_ASSET_DESCRIPTION_LIMIT}" placeholder="可以编辑，点击框外后自动保存">${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / ${EPISODE_ASSET_DESCRIPTION_LIMIT}</span>
    </article>
  `;
}

function renderAssetVoiceButton(asset, assetKind) {
  if (assetKind !== "character") {
    return "";
  }
  const voiceName = String(asset?.voiceName ?? "").trim();
  const label = voiceName || "+ 配音员";
  return `
    <button class="voice ${voiceName ? "configured" : ""}" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "角色")}" data-asset-kind="${escapeAttr(assetKind)}">
      <strong>${escapeHtml(label)}</strong>
      ${voiceName ? "<span>编辑</span>" : ""}
    </button>
  `;
}

function renderStoryBoardPreview(selectedStoryboard) {
  return `
    <div class="episode-replica-story-preview">
      <div class="episode-replica-story-canvas"></div>
      <div class="episode-replica-story-track"></div>
      <button class="episode-replica-story-frame" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(selectedStoryboard?.id ?? "")}">
        <span>▶</span>
        <strong>${escapeHtml(selectedStoryboard?.title ?? "分镜 1")}</strong>
      </button>
    </div>
  `;
}

function renderStoryboardWorkspace(storyboards, selectedStoryboard, boardMode, selectedStoryboardIds = [], assetGroups = {}) {
  const totalCount = storyboards.length;
  return `
    <div class="episode-replica-storyboard-toolbar">
      <div class="episode-replica-storyboard-board-tabs">
        <button class="${boardMode === "operation" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="operation">操作栏</button>
        <button class="${boardMode === "story" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="story">故事栏</button>
      </div>
      <div class="episode-replica-storyboard-actions">
        <button class="episode-replica-import-shot" type="button" data-action="open-batch-episode-flow">批量导入分镜</button>
        <button class="episode-replica-add-shot" type="button" data-action="add-storyboard">新增分镜</button>
      </div>
    </div>
    <div class="episode-replica-storyboard-grid">
      ${
        boardMode === "story"
          ? renderStoryBoardPreview(selectedStoryboard)
            : storyboards.length
            ? storyboards.map((storyboard, index) =>
                renderStoryboardCard(
                  storyboard,
                  storyboard.id === selectedStoryboard?.id || (!selectedStoryboard && index === 0),
                  selectedStoryboardIds.includes(storyboard.id),
                  assetGroups,
                ),
              ).join("")
            : renderStoryboardEmptyState()
      }
    </div>
    ${renderStoryboardPagination(totalCount)}
  `;
}

function renderStoryboardEmptyState() {
  return `
    <article class="episode-replica-storyboard-empty cinematic" aria-label="当前剧集还没有分镜">
      <span class="sr-only-action">当前剧集还没有分镜</span>
    </article>
  `;
}

function renderStoryboardPagination(totalCount = 0) {
  return `
    <div class="episode-replica-storyboard-pagination">
      <strong>共 ${escapeHtml(String(totalCount))} 条</strong>
      <button class="episode-replica-storyboard-page-size" type="button">10条/页</button>
      <span class="episode-replica-storyboard-pagination-arrows">
        <button type="button" disabled aria-label="上一页">‹</button>
        <em class="page-index">1</em>
        <button type="button" disabled aria-label="下一页">›</button>
      </span>
    </div>
  `;
}

function renderStoryboardCard(storyboard, active, checked = false, assetGroups = {}) {
  const desc = String(storyboard.description ?? "").trim();
  const displayTitle = String(storyboard.displayTitle ?? "").trim() || String(storyboard.title ?? "");
  const refs = mergeStoryboardMentionReferences(storyboard, assetGroups).slice(0, 6);
  const linkedRefs = groupStoryboardReferences((storyboard.references ?? []).slice(0, 6));
  const previewVideo = resolveSelectedVideoSource(storyboard);
  const previewImage = resolveSelectedImageSource(storyboard);
  const generationBadge = renderStoryboardGenerationBadge(storyboard);
  return `
    <article class="episode-replica-shot-shell ${active ? "active" : ""} ${checked ? "checked" : ""}">
      <div class="episode-replica-shot-card ${active ? "active" : ""}" data-storyboard-id="${escapeAttr(storyboard.id)}">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-storyboard-selection" data-storyboard-id="${escapeAttr(storyboard.id)}" aria-label="选择分镜"></button>
        <span class="episode-replica-shot-card-head">
          <strong class="title">分镜 ${escapeHtml(String(storyboard.index ?? 1))}: ${escapeHtml(displayTitle)}</strong>
          ${generationBadge}
        </span>
        <span class="episode-replica-shot-card-body">
          <span class="episode-replica-shot-card-column assets">
            <span class="meta">角色 / 场景 / 道具</span>
            <span class="asset-preview">${renderStoryboardPreviewThumb(refs)}</span>
            <span class="episode-replica-shot-linked-assets">
              ${linkedRefs.map((group) => `<span class="episode-replica-shot-linked-group"><b>${escapeHtml(group.label)}</b><em>${escapeHtml(group.items.join(" / "))}</em></span>`).join("")}
            </span>
          </span>
          <span class="episode-replica-shot-card-column copy">
            <label class="episode-replica-shot-desc-wrap">
              <textarea
                class="episode-replica-shot-desc-input ${desc ? "" : "placeholder"}"
                data-storyboard-id="${escapeAttr(storyboard.id)}"
                placeholder="请输入内容"
              >${escapeHtml(desc)}</textarea>
            </label>
            <span class="count">${[...(desc || "")].length} / 3000</span>
          </span>
          <span class="episode-replica-shot-card-column preview-column">
            <span class="episode-replica-shot-preview-head">
              <span class="preview-title">分镜剧情</span>
              <span class="edit">编辑分镜</span>
            </span>
            <span class="preview">${renderStoryboardMediaThumb(storyboard, previewVideo, previewImage, refs)}</span>
          </span>
        </span>
      </div>
      <div class="episode-replica-shot-hover-tools">
        <button class="episode-replica-shot-add" type="button" data-action="add-storyboard" data-storyboard-id="${escapeAttr(storyboard.id)}" aria-label="添加分镜">+</button>
        <button class="episode-replica-shot-delete" type="button" data-action="open-delete-sidebar-storyboard-modal" data-storyboard-id="${escapeAttr(storyboard.id)}" aria-label="删除分镜">×</button>
      </div>
    </article>
  `;
}

function renderStoryboardGenerationBadge(storyboard) {
  const submission = storyboard?.generationState?.lastSubmission ?? null;
  const status = String(submission?.status ?? "").toLowerCase();
  if (!status) {
    return "";
  }
  const badge = resolveStoryboardGenerationBadge(status);
  if (!badge) {
    return "";
  }
  return `<span class="episode-replica-shot-status-badge ${escapeAttr(badge.kind)}">${escapeHtml(badge.label)}</span>`;
}

function resolveStoryboardGenerationBadge(status) {
  if (status === "completed" || status === "succeeded") {
    return { kind: "completed", label: "已完成" };
  }
  if (status === "failed" || status === "canceled") {
    return { kind: "failed", label: "失败" };
  }
  if (status === "manual_review_required" || status === "result_unknown") {
    return { kind: "failed", label: "失败" };
  }
  if (status.includes("upload") || status.includes("storage") || status.includes("persist") || status.includes("finaliz")) {
    return { kind: "saving", label: "保存中" };
  }
  if (status === "queued" || status === "pending" || status === "accepted") {
    return { kind: "queued", label: "排队中" };
  }
  return { kind: "generating", label: "生成中" };
}

function groupStoryboardReferences(refs = []) {
  const groups = [
    { key: "character", label: "角色", roles: ["character", "role", "locked_character"] },
    { key: "scene", label: "场景", roles: ["scene"] },
    { key: "prop", label: "道具", roles: ["prop"] },
  ];
  return groups
    .map((group) => ({
      label: group.label,
      items: refs
        .filter((item) => group.roles.includes(item.role ?? item.kind))
        .map((item) => item.name ?? item.assetName ?? item.assetId)
        .filter(Boolean),
    }))
    .filter((group) => group.items.length > 0);
}

function mergeStoryboardMentionReferences(storyboard, assetGroups = {}) {
  const existingRefs = Array.isArray(storyboard?.references) ? storyboard.references : [];
  const mentionNames = extractStoryboardMentionNames(storyboard);
  if (!mentionNames.length) {
    return existingRefs;
  }

  const existingKeys = new Set(existingRefs.map((item) => resolveReferenceDedupeKey(item)).filter(Boolean));
  const assetsByName = new Map();
  for (const kind of ["character", "scene", "prop"]) {
    for (const asset of assetGroups?.[kind] ?? []) {
      const name = resolveAssetDisplayName(asset);
      if (!name) {
        continue;
      }
      assetsByName.set(name, {
        ...asset,
        kind: asset?.kind ?? kind,
        role: asset?.role ?? kind,
        name,
      });
    }
  }

  const matchedRefs = [];
  for (const mentionName of mentionNames) {
    const asset = assetsByName.get(mentionName);
    if (!asset) {
      continue;
    }
    const nextRef = {
      role: asset.role ?? asset.kind ?? "character",
      kind: asset.kind ?? asset.role ?? "character",
      assetId: asset.assetId ?? asset.id ?? null,
      name: asset.name,
      preview: resolveReferencePreview(asset),
      previewUrl: asset.previewUrl ?? asset.preview ?? asset.fixedImageUrl ?? null,
    };
    const key = resolveReferenceDedupeKey(nextRef);
    if (key && existingKeys.has(key)) {
      continue;
    }
    if (key) {
      existingKeys.add(key);
    }
    matchedRefs.push(nextRef);
  }

  return [...existingRefs, ...matchedRefs];
}

function extractStoryboardMentionNames(storyboard) {
  const text = [
    storyboard?.description,
    storyboard?.sceneAnalysis,
    storyboard?.plotPreview,
    storyboard?.title,
    storyboard?.displayTitle,
  ].filter(Boolean).join("\n");
  const names = [];
  const seen = new Set();
  for (const match of text.matchAll(/(?:【@([^】]+)】|@([^\s【】,，。；;：:]+))/g)) {
    const name = String(match[1] ?? match[2] ?? "").trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

function resolveAssetDisplayName(asset) {
  return String(asset?.name ?? asset?.label ?? asset?.assetName ?? "").trim();
}

function resolveReferenceDedupeKey(item) {
  const id = item?.assetId ?? item?.id ?? null;
  if (id) {
    return `id:${id}`;
  }
  const name = String(item?.name ?? item?.assetName ?? "").trim();
  return name ? `name:${name}` : "";
}

function renderStoryboardMediaThumb(storyboard, previewVideo, previewImage) {
  if (previewVideo) {
    const thumbnail =
      storyboard?.previewThumbnailUrl ??
      storyboard?.uploadedVideos?.find((item) => item.src === previewVideo)?.thumbnailSrc ??
      "";
    return `
      <span class="episode-replica-shot-video-preview active">
        <video
          src="${escapeAttr(previewVideo)}"
          ${thumbnail ? `poster="${escapeAttr(thumbnail)}"` : ""}
          preload="metadata"
          controls
        ></video>
      </span>
    `;
  }
  if (previewImage) {
    return `<span class="episode-replica-shot-media-thumb has-image-preview active"><img src="${escapeAttr(previewImage)}" alt="" /></span>`;
  }
  return renderStoryboardMediaPlaceholder();
}

function renderStoryboardMediaPlaceholder() {
  return `
    <span class="episode-replica-shot-media-placeholder" aria-label="暂无分镜图片">
      <span class="episode-replica-shot-media-placeholder-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11Z" />
          <path d="m6.8 16.8 3.7-4 2.4 2.5 2.2-2 2.9 3.5" />
          <circle cx="9" cy="8.8" r="1.15" />
        </svg>
      </span>
    </span>
  `;
}

function renderAssetPreview(asset, activeAssetTab) {
  return `
    <div class="episode-replica-asset-preview">
      <div class="episode-replica-preview-card">
        <div class="episode-replica-preview-hero">${renderAssetPreviewVisual(asset, activeAssetTab)}</div>
        <div class="episode-replica-preview-copy">
          <strong>${escapeHtml(asset?.name ?? "素材")}</strong>
          <p>${escapeHtml(asset?.description ?? "当前素材会显示在这里，便于快捷引用和替换。")}</p>
        </div>
      </div>
    </div>
  `;
}

function renderAssetStage({ asset, activeAssetTab, mediaMode, quickReferenceItems = [], selectionContext = {} }) {
  const hasAsset = Boolean(asset);
  return `
    <section class="episode-replica-asset-stage clean-session ${mediaMode === "video" ? "video-mode" : "image-mode"}">
      <div class="episode-replica-asset-stage-canvas">
        ${
          hasAsset
            ? `<div class="episode-replica-asset-stage-frame clean"></div>`
            : `<div class="episode-replica-asset-stage-frame clean empty" aria-label="当前未选中资产"></div>`
        }
      </div>
    </section>
  `;
}

function resolveAssetConversationEntries(historyMap = {}, assetId, mediaKind = "image", generationResult = null) {
  const key = `${mediaKind}:${assetId ?? ""}`;
  const historyEntries = Array.isArray(historyMap?.[key]) ? historyMap[key].filter(Boolean) : [];
  if (!generationResult) {
    return historyEntries;
  }
  const resultAssetId = generationResult?.selectionContext?.selectedAssetId ?? generationResult?.assetId ?? null;
  if (!assetId || resultAssetId !== assetId) {
    return historyEntries;
  }
  const taskId = resolveGenerationTaskId(generationResult);
  if (historyEntries.some((item) => resolveGenerationTaskId(item) === taskId)) {
    return historyEntries;
  }
  return [...historyEntries, generationResult];
}

function resolveStoryboardConversationEntries(historyMap = {}, storyboardId, mediaKind = "image", generationResult = null) {
  const key = `${mediaKind}:${storyboardId ?? ""}`;
  const historyEntries = Array.isArray(historyMap?.[key]) ? historyMap[key].filter(Boolean) : [];
  if (!generationResult) {
    return historyEntries;
  }
  const resultStoryboardId = generationResult?.storyboardId ?? generationResult?.selectionContext?.selectedStoryboardId ?? null;
  if (!storyboardId || resultStoryboardId !== storyboardId) {
    return historyEntries;
  }
  const taskId = resolveGenerationTaskId(generationResult);
  if (historyEntries.some((item) => resolveGenerationTaskId(item) === taskId)) {
    return historyEntries;
  }
  return [...historyEntries, generationResult];
}

function renderAssetGeneratedStage(asset, activeAssetTab, generationResult, mediaMode, generationHistory = []) {
  const entries = Array.isArray(generationHistory) && generationHistory.length
    ? generationHistory
    : (generationResult ? [generationResult] : []);
  if (!entries.length) {
    return renderAssetStage({
      asset,
      activeAssetTab,
      mediaMode,
      quickReferenceItems: [],
      selectionContext: {},
    });
  }
  return `
    <div class="episode-replica-generated-stage visible asset-scope">
      <div class="episode-replica-asset-conversation-list">
        ${entries.map((entry) => renderAssetConversationEntry(entry, activeAssetTab)).join("")}
      </div>
    </div>
  `;
}

function renderAssetConversationEntry(generationResult, assetKind = "character") {
  const promptPreview = truncateDisplayText(generationResult?.promptPreview ?? "", 140);
  const userMeta = buildAssetGenerationUserMeta(generationResult);
  const quickReferenceItems = generationResult?.quickReferenceItems ?? [];
  const failureMessage = resolveGenerationResultFailureMessage(generationResult);
  return `
    <section class="episode-replica-asset-conversation-entry">
      <div class="episode-replica-message-thread">
        ${promptPreview ? renderLegacyUserMessage(promptPreview, userMeta, quickReferenceItems) : ""}
      </div>
      ${failureMessage ? `<p class="episode-replica-task-failure">${escapeHtml(failureMessage)}</p>` : ""}
      ${renderFixedImageResults(generationResult, assetKind)}
    </section>
  `;
}

function resolveGenerationTaskId(generationResult) {
  return (
    generationResult?.taskId ??
    generationResult?.platform?.tasks?.[0]?.taskId ??
    generationResult?.id ??
    "local-asset-fixed-image-task"
  );
}

function buildAssetGenerationUserMeta(generationResult) {
  const taskId = resolveGenerationTaskId(generationResult);
  const modelLabel = resolveGenerationModelLabel(generationResult?.selectedModelId);
  const ratioLabel = generationResult?.aspectRatio ?? "16:9";
  const resolutionLabel = generationResult?.resolution ?? "2K";
  const workflowStatus = String(generationResult?.status ?? generationResult?.platform?.workflowStatus ?? "pending").toLowerCase();
  return [
    `任务ID：${taskId}`,
    modelLabel,
    `比例：${ratioLabel}`,
    `清晰度：${resolutionLabel}`,
    generationResult?.creditCost ? `积分：${generationResult.creditCost}` : null,
    workflowStatus && workflowStatus !== "completed" && workflowStatus !== "succeeded"
      ? `状态：${resolveWorkflowStatusLabel(workflowStatus)}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

function renderAssetResultPanel(generationResult, quickReferenceItems = [], selectionContext = {}) {
  const createdAt =
    generationResult?.createdAt ??
    generationResult?.completedAt ??
    new Date().toISOString().slice(0, 19).replace("T", " ");
  const taskId =
    generationResult?.taskId ??
    generationResult?.platform?.tasks?.[0]?.taskId ??
    generationResult?.id ??
    "local-asset-fixed-image-task";
  const modelLabel = resolveGenerationModelLabel(generationResult?.selectedModelId);
  const ratioLabel = generationResult?.aspectRatio ?? "16:9";
  const resolutionLabel = generationResult?.resolution ?? "2K";
  const extraMeta = [
    modelLabel,
    `比例：${ratioLabel}`,
    `清晰度：${resolutionLabel}`,
    generationResult?.creditCost ? `积分：${generationResult.creditCost}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const workflowStatus = String(generationResult?.status ?? generationResult?.platform?.workflowStatus ?? "pending").toLowerCase();
  return `
    <article class="episode-replica-result-panel visible asset-result-panel">
      <div class="assets task-card">
        <div class="episode-replica-task-refs">
          ${quickReferenceItems.slice(0, 1).map((item) => renderResultReference(item)).join("")}
        </div>
        <div class="episode-replica-task-meta">
          <div class="episode-replica-task-line">
            <strong class="episode-replica-task-id">任务ID：${escapeHtml(String(taskId))}</strong>
            <span class="episode-replica-task-status ${escapeAttr(workflowStatus)}">${escapeHtml(resolveWorkflowStatusLabel(workflowStatus))}</span>
          </div>
          <div class="episode-replica-task-line muted">
            ${selectionContext ? renderSelectionContextInline(selectionContext) : ""}
            <span>${escapeHtml(extraMeta)}</span>
          </div>
        </div>
      </div>
      <time>${escapeHtml(String(createdAt))}</time>
    </article>
  `;
}

function renderQuickAsset(asset, active) {
  const name = asset.name ?? "素材";
  const kind = asset.kind || inferKind(name);
  const preview = resolveReferencePreview(asset);
  return `
    <button class="episode-replica-quick-asset ${active ? "active" : ""}" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset.id ?? "")}" data-asset-kind="${escapeAttr(kind)}" title="${escapeAttr(name)}">
      <span class="thumb">
        ${
          preview
            ? `<img class="episode-replica-quick-thumb-image" src="${escapeAttr(preview)}" alt="" />`
            : renderQuickPlaceholder(kind, name)
        }
        <span class="episode-replica-quick-name">${escapeHtml(name)}</span>
      </span>
    </button>
  `;
}

function renderStoryboardStage(
  selectedStoryboard,
  currentMode,
  imageGenerationResult,
  videoGenerationResult,
  conversationEntries = [],
) {
  const isVideoMode = currentMode === "video" || currentMode === "lip-sync";
  const mediaKind = isVideoMode ? "video" : "image";
  const activeGenerationResult = isVideoMode ? videoGenerationResult : imageGenerationResult;
  if (currentMode === "lip-sync") {
    return renderStoryboardConversationStage({
      selectedStoryboard,
      mediaKind,
      generationResult: activeGenerationResult,
      conversationEntries,
      fallbackContent: renderCurrentStoryboardMediaStage(selectedStoryboard, true),
    });
  }
  if (currentMode === "video") {
    return renderStoryboardConversationStage({
      selectedStoryboard,
      mediaKind,
      generationResult: activeGenerationResult,
      conversationEntries,
      fallbackContent: renderGeneratedStage(selectedStoryboard, true, activeGenerationResult),
    });
  }
  return renderStoryboardConversationStage({
    selectedStoryboard,
    mediaKind,
    generationResult: activeGenerationResult,
    conversationEntries,
    fallbackContent: renderGeneratedStage(selectedStoryboard, false, activeGenerationResult),
  });
}

export function renderStoryboardStageForPartialUpdate(
  selectedStoryboard,
  currentMode,
  generationResult,
  conversationEntries = [],
) {
  const isVideoMode = currentMode === "video" || currentMode === "lip-sync";
  return renderStoryboardStage(
    selectedStoryboard,
    currentMode,
    isVideoMode ? null : generationResult,
    isVideoMode ? generationResult : null,
    conversationEntries,
  );
}

function renderStoryboardConversationStage({
  selectedStoryboard,
  mediaKind,
  generationResult,
  conversationEntries = [],
  fallbackContent = "",
} = {}) {
  const entries = Array.isArray(conversationEntries) ? conversationEntries.filter(Boolean) : [];
  if (!entries.length) {
    return fallbackContent;
  }
  return `
    <div class="episode-replica-storyboard-conversation-list">
      ${entries.map((entry) => renderGeneratedStage(selectedStoryboard, mediaKind === "video", entry ?? generationResult)).join("")}
    </div>
  `;
}

function renderGeneratedStage(selectedStoryboard, isVideo, generationResult) {
  if (!generationResult && !selectedStoryboard?.generationState?.lastSubmission) {
    return renderCurrentStoryboardMediaStage(selectedStoryboard, isVideo);
  }
  const quickReferenceItems =
    generationResult?.quickReferenceItems ??
    selectedStoryboard?.generationState?.quickReferenceItems ??
    [];
  const attachmentItems = generationResult?.attachmentItems ?? [];
  const promptPreview = truncateDisplayText(
    generationResult?.promptPreview ??
      selectedStoryboard?.generationState?.lastSubmission?.promptPreview ??
      selectedStoryboard?.description ??
      "",
    140,
  );
  const taskId =
    generationResult?.taskId ??
    generationResult?.platform?.tasks?.[0]?.taskId ??
    generationResult?.id ??
    "";
  const actionTaskAttr = taskId ? ` data-task-id="${escapeAttr(String(taskId))}"` : "";
  return `
    <div class="episode-replica-generated-stage visible">
      ${renderResultMessageThread({
        promptPreview,
        quickReferenceItems,
        attachmentItems,
        generatedAudioItems:
          generationResult?.generatedAudioItems ??
          generationResult?.result?.generatedAudioItems ??
          [],
        createdAt:
          generationResult?.createdAt ??
          generationResult?.completedAt ??
          selectedStoryboard?.generationState?.lastSubmission?.createdAt ??
          "",
        taskId:
          taskId,
        modelLabel: resolveGenerationModelLabel(generationResult?.selectedModelId),
        systemContent: `
          ${isVideo ? renderFixedVideoResult(generationResult, null) : ""}
          <div class="episode-replica-stage-actions">
            <button type="button" data-action="episode-result-action" data-result-action="edit" data-media-kind="${isVideo ? "video" : "image"}"${actionTaskAttr}>重新编辑</button>
            ${
              isVideo
                ? `<button type="button" data-action="episode-result-action" data-result-action="set-storyboard-video" data-media-kind="video"${actionTaskAttr}>设为分镜视频</button>`
                : `<button type="button" data-action="episode-result-action" data-result-action="set-storyboard-image" data-media-kind="image"${actionTaskAttr}>设为分镜图</button>`
            }
            <button type="button" data-action="episode-result-action" data-result-action="download" data-media-kind="${isVideo ? "video" : "image"}"${actionTaskAttr}>下载</button>
            <button type="button" data-action="episode-result-action" data-result-action="delete" data-media-kind="${isVideo ? "video" : "image"}"${actionTaskAttr}>删除</button>
          </div>
          ${renderResultPanel(selectedStoryboard, generationResult, quickReferenceItems, attachmentItems)}
          ${isVideo ? "" : renderFixedImageResults(generationResult)}
        `,
      })}
    </div>
  `;
}

function renderFixedVideoResult(generationResult, selectedStoryboard = null) {
  const videoUrl = resolveGeneratedVideoUrl(generationResult, selectedStoryboard);
  if (!videoUrl) {
    return "";
  }
  const posterUrl =
    generationResult?.thumbnailUrl ??
    generationResult?.result?.thumbnailUrl ??
    selectedStoryboard?.previewThumbnailUrl ??
    "";
  return `
    <div class="episode-replica-fixed-results video-result">
      <article class="episode-replica-fixed-video-card">
        <span class="episode-replica-fixed-image-badge">视频</span>
        <video
          src="${escapeAttr(videoUrl)}"
          ${posterUrl ? `poster="${escapeAttr(posterUrl)}"` : ""}
          controls
          preload="metadata"
        ></video>
      </article>
    </div>
  `;
}

function resolveGeneratedVideoUrl(generationResult, selectedStoryboard = null) {
  return (
    generationResult?.result?.videoUrl ??
    generationResult?.videoUrl ??
    generationResult?.fixedVideos?.[0]?.url ??
    selectedStoryboard?.previewVideo ??
    ""
  );
}

function renderResultPanel(selectedStoryboard, generationResult, quickReferenceItems = [], attachmentItems = []) {
  const selectionContext = generationResult?.selectionContext ?? null;
  const references = [
    ...attachmentItems.map((item) => ({
      ...item,
      preview: item.preview ?? item.src ?? item.url ?? null,
      name: item.name ?? item.fileName ?? "未命名素材",
      kind: item.type ?? item.kind ?? "image",
    })),
    ...(quickReferenceItems.length
      ? quickReferenceItems.slice(0, 5)
      : (selectedStoryboard?.references ?? []).slice(0, 5)),
  ].slice(0, 6);
  const createdAt =
    generationResult?.createdAt ??
    generationResult?.completedAt ??
    selectedStoryboard?.generationState?.lastSubmission?.createdAt ??
    new Date().toISOString().slice(0, 19).replace("T", " ");
  const taskId =
    generationResult?.taskId ??
    generationResult?.platform?.tasks?.[0]?.taskId ??
    generationResult?.id ??
    "local-fixed-image-task";
  const modelLabel = resolveGenerationModelLabel(generationResult?.selectedModelId);
  const ratioLabel = generationResult?.aspectRatio ?? "16:9";
  const resolutionLabel = generationResult?.resolution ?? "2K";
  const extraMeta = [
    modelLabel,
    `比例：${ratioLabel}`,
    `清晰度：${resolutionLabel}`,
    generationResult?.creditCost ? `积分：${generationResult.creditCost}` : null,
    generationResult?.mediaKind === "video" && generationResult?.durationSec
      ? `时长：${generationResult.durationSec}秒`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const workflowStatus = String(
    generationResult?.status ??
      generationResult?.platform?.workflowStatus ??
      selectedStoryboard?.generationState?.lastSubmission?.status ??
      "pending",
  ).toLowerCase();
  const failureMessage = resolveGenerationResultFailureMessage(generationResult, workflowStatus);
  const progressState = resolveGenerationProgressState(generationResult, selectedStoryboard, workflowStatus, failureMessage);
  return `
    <article class="episode-replica-result-panel visible">
      <div class="assets task-card">
        <div class="episode-replica-task-refs">
          ${references.slice(0, 1).map((item) => renderResultReference(item)).join("")}
        </div>
        <div class="episode-replica-task-meta">
          <div class="episode-replica-task-line">
            <strong class="episode-replica-task-id">任务ID：${escapeHtml(String(taskId))}</strong>
            <span class="episode-replica-task-status ${escapeAttr(workflowStatus)}">${escapeHtml(resolveWorkflowStatusLabel(workflowStatus))}</span>
          </div>
          <div class="episode-replica-task-line muted">
            ${selectionContext ? renderSelectionContextInline(selectionContext) : ""}
            <span>${escapeHtml(extraMeta)}</span>
          </div>
        </div>
      </div>
      ${renderGenerationProgressTrack(progressState)}
      ${failureMessage ? `<p class="episode-replica-task-failure">${escapeHtml(failureMessage)}</p>` : ""}
      <time>${escapeHtml(String(createdAt))}</time>
    </article>
  `;
}

const GENERATION_PROGRESS_STEPS = [
  { id: "submitted", label: "已提交" },
  { id: "queued", label: "排队中" },
  { id: "provider", label: "模型生成中" },
  { id: "storage", label: "保存到云存储" },
  { id: "persist", label: "保存结果" },
  { id: "done", label: "完成" },
];

function resolveGenerationProgressState(generationResult, selectedStoryboard, workflowStatus, failureMessage = "") {
  const submissionStatus = String(selectedStoryboard?.generationState?.lastSubmission?.status ?? "").toLowerCase();
  const status = String(workflowStatus || submissionStatus || "pending").toLowerCase();
  const failureCode = String(
    generationResult?.failureCode ??
      generationResult?.failure?.failureCode ??
      generationResult?.result?.failureCode ??
      "",
  );
  const activeStep = resolveGenerationProgressStep(status, failureCode);
  const failed = ["failed", "canceled", "manual_review_required", "result_unknown"].includes(status);
  const message = resolveGenerationProgressMessage({
    status,
    activeStep,
    failureCode,
    failureMessage,
  });
  return {
    activeStep,
    failed,
    message,
  };
}

function resolveGenerationProgressStep(status, failureCode = "") {
  if (status === "completed" || status === "succeeded") {
    return "done";
  }
  if (failureCode === "provider_output_upload_failed") {
    return "storage";
  }
  if (failureCode === "provider_output_persist_failed" || status === "manual_review_required") {
    return "persist";
  }
  if (failureCode === "provider_output_download_failed") {
    return "provider";
  }
  if (status === "queued" || status === "pending" || status === "accepted") {
    return "queued";
  }
  if (status.includes("upload") || status.includes("storage")) {
    return "storage";
  }
  if (status.includes("persist") || status.includes("asset") || status.includes("finaliz")) {
    return "persist";
  }
  if (status === "submitted" || status === "external_submitted") {
    return "submitted";
  }
  return "provider";
}

function resolveGenerationProgressMessage({ status, activeStep, failureCode, failureMessage }) {
  if (failureMessage) {
    return failureMessage;
  }
  if (status === "manual_review_required") {
    return "任务需要后台处理，请等待管理员补写资产记录或重试最终化。";
  }
  if (status === "result_unknown") {
    return "暂时无法确认模型结果，后台会继续核对，先不要重复提交同一任务。";
  }
  if (failureCode === "provider_output_download_failed") {
    return "模型可能已生成，但从供应商下载结果失败，积分已按失败策略处理。";
  }
  if (failureCode === "provider_output_upload_failed") {
    return "视频已生成，但保存到平台云存储失败，积分已返还。";
  }
  if (failureCode === "provider_output_persist_failed") {
    return "已保存到平台存储，正在等待后台补写资产记录。";
  }
  if (activeStep === "submitted") {
    return "任务已提交，后端正在记录任务并准备预扣积分。";
  }
  if (activeStep === "queued") {
    return "任务已进入队列，等待 worker 接单。";
  }
  if (activeStep === "provider") {
    return "模型正在生成，请保持页面打开，前端会定时刷新结果。";
  }
  if (activeStep === "storage") {
    return "模型结果已返回，正在保存到平台云存储。";
  }
  if (activeStep === "persist") {
    return "云存储已完成，正在写入资产记录并绑定当前分镜。";
  }
  if (activeStep === "done") {
    return "生成已完成，可下载或设为当前分镜结果。";
  }
  return "任务处理中，前端会定时刷新最新状态。";
}

function renderGenerationProgressTrack(progressState) {
  const activeIndex = GENERATION_PROGRESS_STEPS.findIndex((step) => step.id === progressState.activeStep);
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;
  return `
    <div class="episode-replica-progress-box" aria-label="生成进度">
      <div class="episode-replica-progress-track">
        ${GENERATION_PROGRESS_STEPS.map((step, index) => {
          const completed = index < safeActiveIndex || progressState.activeStep === "done";
          const active = index === safeActiveIndex;
          const failed = active && progressState.failed;
          return `
            <span class="episode-replica-progress-step ${completed ? "completed" : ""} ${active ? "active" : ""} ${failed ? "failed" : ""}">
              <span class="episode-replica-progress-dot" aria-hidden="true"></span>
              <span class="episode-replica-progress-label">${escapeHtml(step.label)}</span>
            </span>
          `;
        }).join("")}
      </div>
      <p class="episode-replica-progress-message">${escapeHtml(progressState.message)}</p>
    </div>
  `;
}

function renderResultMessageThread({
  promptPreview = "",
  quickReferenceItems = [],
  attachmentItems = [],
  generatedAudioItems = [],
  createdAt = "",
  taskId = "",
  modelLabel = "",
  systemContent = "",
} = {}) {
  return `
    <div class="episode-replica-message-thread">
      ${
        promptPreview
          ? renderEnhancedUserMessage({
              promptPreview,
              quickReferenceItems,
              attachmentItems,
              generatedAudioItems,
              createdAt,
              taskId,
              modelLabel,
            })
          : ""
      }
      <div class="episode-replica-message-row system">
        <article class="episode-replica-system-message">
          <span class="episode-replica-message-badge">系统</span>
          ${systemContent}
        </article>
      </div>
    </div>
  `;
}

function renderEnhancedUserMessage({
  promptPreview = "",
  quickReferenceItems = [],
  attachmentItems = [],
  generatedAudioItems = [],
  createdAt = "",
  taskId = "",
  modelLabel = "",
} = {}) {
  const audioItems = [...(attachmentItems ?? []), ...(generatedAudioItems ?? [])].filter(
    (item) => String(item?.type ?? item?.kind ?? "") === "audio",
  );
  const visualItems = [
    ...(quickReferenceItems ?? []),
    ...(attachmentItems ?? []).filter((item) => String(item?.type ?? item?.kind ?? "") !== "audio"),
  ];
  const compactVisualItems = visualItems.slice(0, 3);
  const compactAudioItems = audioItems.slice(0, 1);
  const taskMeta = [taskId ? `任务id:${taskId}` : null, modelLabel || null].filter(Boolean).join("/");
  return `
    <div class="episode-replica-message-row user">
      <article class="episode-replica-user-message">
        <div class="episode-replica-user-message-copy clamp-3">${escapeHtml(promptPreview)}</div>
        ${
          compactAudioItems.length || compactVisualItems.length || taskMeta || createdAt
            ? `<div class="episode-replica-user-message-footer">
                ${
                  compactAudioItems.length || compactVisualItems.length
                    ? `<div class="episode-replica-user-message-refs">
                        ${compactAudioItems.map((item) => renderCompactUserReferenceItem(item)).join("")}
                        ${compactVisualItems.map((item) => renderCompactUserReferenceItem(item)).join("")}
                      </div>`
                    : ""
                }
                ${
                  taskMeta || createdAt
                    ? `<div class="episode-replica-user-message-meta">
                        ${taskMeta ? `<span class="episode-replica-user-task-inline">${escapeHtml(taskMeta)}</span>` : ""}
                        ${createdAt ? `<time class="episode-replica-user-time">${escapeHtml(createdAt)}</time>` : ""}
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }
      </article>
    </div>
  `;
}

function renderCompactUserReferenceItem(item) {
  const previewUrl = resolveReferencePreview(item);
  const isAudio = String(item?.type ?? item?.kind ?? "") === "audio";
  return `
    <span class="episode-replica-user-ref-chip ${isAudio ? "audio" : "visual"}" title="${escapeAttr(item?.name ?? "")}">
      ${
        isAudio
          ? `<span class="episode-replica-user-ref-art audio"><span aria-hidden="true">◉</span></span>`
          : previewUrl
            ? `<span class="episode-replica-user-ref-art ${escapeAttr(item.kind ?? "image")}"><img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "reference")}" /></span>`
            : ""
      }
    </span>
  `;
}

function renderLegacyUserMessage(promptPreview, metaText = "", quickReferenceItems = []) {
  return `
    <div class="episode-replica-message-row user">
      <article class="episode-replica-user-message legacy">
        <span class="episode-replica-message-badge">用户</span>
        <div class="episode-replica-user-message-copy">${escapeHtml(promptPreview)}</div>
        ${
          quickReferenceItems.length
            ? `<div class="episode-replica-user-message-refs">${quickReferenceItems.map((item) => renderUserReferenceItem(item)).join("")}</div>`
            : ""
        }
        ${metaText ? `<div class="episode-replica-user-message-meta">${escapeHtml(metaText)}</div>` : ""}
      </article>
    </div>
  `;
}

function renderUserReferenceItem(item) {
  const previewUrl = resolveReferencePreview(item);
  const isAudio = String(item?.type ?? item?.kind ?? "") === "audio";
  const summary = truncateDisplayText(item.description ?? item.name ?? "", 60);
  return `
    <article class="episode-replica-user-ref-card">
      ${
        isAudio
          ? `<span class="episode-replica-user-ref-art audio"><span aria-hidden="true">◉</span></span>`
          : previewUrl
          ? `<span class="episode-replica-user-ref-art ${escapeAttr(item.kind ?? "image")}"><img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "reference")}" /></span>`
          : ""
      }
      <span class="episode-replica-user-ref-copy">
        <strong>${escapeHtml(item.name ?? "引用素材")}</strong>
        <small>${escapeHtml(summary)}</small>
      </span>
    </article>
  `;
}

function resolveGenerationFailureMessage(status, failureCode) {
  if (status !== "failed" && status !== "canceled") {
    return "";
  }
  if (failureCode === "client_poll_timeout" || failureCode === "task_timeout") {
    return "任务超过 15 分钟未完成，已按失败处理，积分应由后端返还。";
  }
  if (failureCode === "permission_denied") {
    return "当前账号没有权限处理该生成结果，请联系项目管理员。";
  }
  if (failureCode === "resource_not_found") {
    return "生成结果已失效或被删除，请刷新当前剧集后重试。";
  }
  return "生成失败，请重新编辑后再试，失败记录会保留在当前结果区。";
}

function resolveGenerationResultFailureMessage(generationResult, statusOverride = null) {
  const workflowStatus = String(
    statusOverride ??
      generationResult?.status ??
      generationResult?.platform?.workflowStatus ??
      "",
  ).toLowerCase();
  if (!["failed", "canceled", "manual_review_required", "result_unknown"].includes(workflowStatus)) {
    return "";
  }
  const displayMessage = String(generationResult?.failure?.displayMessage ?? "").trim();
  if (displayMessage) {
    return displayMessage;
  }
  const providerMessage = String(generationResult?.failure?.providerMessage ?? "").trim();
  if (providerMessage) {
    return providerMessage;
  }
  const providerErrorCode = String(generationResult?.failure?.providerErrorCode ?? "").trim();
  if (providerErrorCode) {
    return providerErrorCode;
  }
  const failureCode = String(
    generationResult?.failureCode ??
      generationResult?.failure?.failureCode ??
      generationResult?.result?.failureCode ??
      "",
  );
  return resolveGenerationFailureMessage(workflowStatus, failureCode);
}

function renderFixedImageResults(generationResult, assetKind = "character") {
  const taskId = resolveGenerationTaskId(generationResult);
  const images = Array.isArray(generationResult?.fixedImages) ? generationResult.fixedImages : [];
  if (!images.length) {
    return "";
  }
  return `
    <div class="episode-replica-fixed-results">
      ${images.map((item) => `
        <article class="episode-replica-fixed-image-card">
          <span class="episode-replica-fixed-image-badge">${escapeHtml(item.label ?? "图片")}</span>
          <img src="${escapeAttr(item.url ?? "")}" alt="${escapeAttr(item.label ?? "generated image")}" />
        </article>
      `).join("")}
      <div class="episode-replica-fixed-actions">
        <button type="button" data-action="episode-fixed-result-action" data-result-action="edit" data-task-id="${escapeAttr(String(taskId))}">重新编辑</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="set-character" data-task-id="${escapeAttr(String(taskId))}" data-asset-kind="${escapeAttr(assetKind)}">${escapeHtml(resolveAssetSetLabel(assetKind))}</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="download" data-task-id="${escapeAttr(String(taskId))}">下载</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="delete" data-task-id="${escapeAttr(String(taskId))}">删除</button>
      </div>
    </div>
  `;
}

function renderSelectionContextPills(selectionContext) {
  const labels = [
    selectionContext.episodeTitle || selectionContext.episodeId,
    selectionContext.assetTab,
    selectionContext.selectedAssetName || selectionContext.selectedAssetId,
  ].filter(Boolean);
  if (!labels.length) return "";
  return labels
    .map((label) => `<span class="episode-replica-selection-pill">${escapeHtml(String(label))}</span>`)
    .join("");
}

function renderSelectionContextInline(selectionContext) {
  const label = selectionContext.selectedAssetName || selectionContext.selectedAssetId || "";
  return label ? `<span>${escapeHtml(String(label))}</span>` : "";
}

function resolveGenerationModelLabel(modelId) {
  const catalog = {
    "gpt-image-2-cn": "GPT Image 2",
    "vidu-q3-pro": "Vidu Q3 Pro",
    "jimeng-4-5": "gpt image 2（链路G）",
    "jimeng-4-5-vip": "gpt image 2 VIP（链路G）",
    "tnb-pro": "nano banana 2（链路G）",
    "tnb-fast": "nano banana fast（链路G）",
    "tnb-ultra": "nano banana pro（链路G）",
    "hailuo-2-0": "海螺 2.0",
    "seedance-2-0-vip": "SeeDance 2.0 VIP",
    "happy-horse": "Happy Horse",
  };
  return catalog[modelId] ?? modelId ?? "默认模型";
}

function renderStageCanvas(selectedStoryboard, generationResult, video = false) {
  const media = video
    ? resolveSelectedVideoSource(selectedStoryboard)
    : resolveSelectedImageSource(selectedStoryboard);
  const waiting = isGenerationWaiting(generationResult, selectedStoryboard, video);
  if (media || waiting) {
    return `
      <div class="episode-replica-stage-canvas ${video ? "video" : ""}">
        <div class="episode-replica-canvas-tile large ${media ? "filled" : ""}">
          ${
            media
              ? video
                ? `<video src="${escapeAttr(media)}" controls preload="metadata"></video>`
                : `<img src="${escapeAttr(media)}" alt="${escapeAttr(selectedStoryboard?.title ?? "generated image")}" />`
              : "<span class=\"episode-replica-canvas-status waiting\">生成中，等待后端返回...</span>"
          }
        </div>
        <div class="episode-replica-canvas-tile small ${media ? "filled" : ""}">
          ${
            media && !video
              ? `<img src="${escapeAttr(media)}" alt="${escapeAttr(selectedStoryboard?.title ?? "thumbnail")}" />`
              : video
                ? ""
                : waiting
                  ? "<span class=\"episode-replica-canvas-badge\">等待中</span>"
                  : "<span class=\"episode-replica-canvas-badge\">图片</span>"
          }
        </div>
      </div>
    `;
  }
  return `
    <div class="episode-replica-stage-canvas ${video ? "video" : ""}">
      <div class="episode-replica-canvas-tile large">${video ? "<span class=\"episode-replica-canvas-status\">暂无视频</span>" : ""}</div>
      <div class="episode-replica-canvas-tile small">${video ? "" : "<span class=\"episode-replica-canvas-badge\">图片</span>"}</div>
    </div>
  `;
}

export function renderPromptDock({
  selectedStoryboard,
  selectedAsset,
  selectedModelId = "gpt-image-2-cn",
  prompt,
  busy,
  canGenerateCurrentMode = true,
  validationMessage,
  generationControls,
  episodeGenerationConfig = null,
  generationUiState,
  mediaMode,
  attachments = [],
  selectedAttachmentIds = [],
  generationPollingActive = false,
  scopeMode = "storyboard",
}) {
  if (mediaMode === "lip-sync") {
    return renderLipSyncDock({
      prompt,
      busy,
      generationControls,
      generationUiState,
      generationPollingActive,
      validationMessage,
      attachments,
    });
  }
  const supportsAudioUpload = mediaMode === "video" || mediaMode === "lip-sync";
  const generationState =
    scopeMode === "assets"
      ? generationUiState.assetPromptDraft ?? {}
      : selectedStoryboard?.generationState ?? {};
  const promptValue = String(prompt ?? "");
  const mentionReferences = generationState.mentionReferences ?? [];
  const mentionSuggestions = generationUiState.promptMentionSuggestions ?? [];
  const mentionMenuOpen = Boolean(generationUiState.promptMentionMenuOpen);
  const mentionPreviewOpen = Boolean(generationUiState.promptMentionPreviewOpen);
  const mentionPreviewAsset = generationUiState.promptMentionPreviewAsset ?? null;
  const quickReferenceItems = generationState.quickReferenceItems ?? [];
  const generationAttachmentCards = buildGenerationAttachmentCards(generationState);
  const uploadLimits = generationControls.uploadLimits ?? {};
  const activePromptMenu = generationUiState.musePromptMenu ?? null;
  const isVideoModelMenuOpen = Boolean(generationUiState.isVideoModelMenuOpen);
  const openGenerationSelectMenu = generationUiState.openGenerationSelectMenu ?? null;
  const selectedPreset = generationUiState.referencePromptPreset ?? "none";
  const isVideoMode = mediaMode === "video" || mediaMode === "lip-sync";
  const configuredModels = buildConfiguredPromptDockModels(episodeGenerationConfig, isVideoMode ? "video" : "image");
  const models = configuredModels.length ? configuredModels : (isVideoMode ? VIDEO_MODELS : IMAGE_MODELS);
  const selectedModel = models.find((item) => item.id === selectedModelId) ?? models[0];
  const parameterControls = buildModelParameterControls({
    selectedModel,
    isVideoMode,
    generationControls,
    openGenerationSelectMenu,
  });
  const attachmentCards = [...generationAttachmentCards, ...(attachments ?? [])].map((item, index) =>
    renderAttachment(item, index, selectedAttachmentIds.includes(item.id)),
  );
  const audioAttachmentCards = attachmentCards.filter((card) => card.includes('episode-replica-ref-card attachment audio'));
  const nonAudioAttachmentCards = attachmentCards.filter((card) => !card.includes('episode-replica-ref-card attachment audio'));
  const generateAction =
    mediaMode === "video" || mediaMode === "lip-sync" ? "generate-videos" : "generate-images";
  const generateCost =
    scopeMode === "assets" && mediaMode === "image"
      ? 50
      : resolveGenerateCost(mediaMode, generationControls, selectedModel);
  const contextSummary =
    scopeMode === "assets"
      ? ""
      : selectedStoryboard?.title
        ? `分镜：${selectedStoryboard.displayTitle ?? selectedStoryboard.title}`
        : "分镜：";

  return `
    <section class="episode-replica-prompt ${isVideoMode ? "video-mode" : "image-mode"} ${scopeMode === "assets" ? "asset-scope" : "storyboard-scope"}">
      ${contextSummary ? `<div class="episode-replica-prompt-context">${escapeHtml(contextSummary)}</div>` : ""}
      <div class="episode-replica-ref-strip">
        ${audioAttachmentCards.join("")}
        ${
          supportsAudioUpload
            ? '<button class="episode-replica-ref-card voice uploadable" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="audio"><span>+</span><strong>音频</strong></button>'
            : ""
        }
        ${quickReferenceItems.map((item) => renderQuickReferenceItem(item)).join("")}
        ${nonAudioAttachmentCards.join("")}
        <button class="episode-replica-upload-card" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="image">
          <span>+</span><strong>图片</strong>
        </button>
        <input class="episode-workbench-attachment-input" data-attachment-type="image" type="file" accept="image/*" hidden />
        ${supportsAudioUpload ? '<input class="episode-workbench-attachment-input" data-attachment-type="audio" type="file" accept="audio/*" hidden />' : ""}
      </div>
      ${renderUploadLimitHint(uploadLimits, supportsAudioUpload)}
      <div class="episode-replica-prompt-tools">
        ${renderMiniMenu("references", "多参考图", activePromptMenu, [["multi", "多参考图"], ["single", "文生图"], ["rewrite", "文字改图"]])}
        ${renderMiniMenu("preset", `预设：${resolveReferencePromptPresetLabel(selectedPreset)}`, activePromptMenu, [["none", "无预设"], ["scene-wide", "[系统]场景-广角图"], ["scene-vr", "[系统]场景-VR场景图"], ["prop-triple", "[系统]道具-三视图"], ["character-triple", "[系统]角色-三视图"]], "select-muse-preset")}
        <button class="episode-replica-mini" type="button" data-action="quick-append-selected-asset">快捷引用</button>
      </div>
      <label class="episode-replica-textarea">
        <textarea id="video-prompt-input" placeholder="请输入您的生图要求">${escapeHtml(promptValue)}</textarea>
        <span class="magic">AI</span>
        <em>${[...promptValue].length} / 5000</em>
      </label>
      ${
        mentionMenuOpen
          ? `<div class="episode-replica-mention-menu">
              ${mentionSuggestions.map((item) => `
                <button
                  class="episode-replica-mention-option"
                  type="button"
                  data-action="select-prompt-mention"
                  data-asset-id="${escapeAttr(item.id ?? "")}"
                  data-asset-kind="${escapeAttr(item.assetKind ?? item.kind ?? "character")}"
                >
                  <strong>${escapeHtml(item.name ?? "素材")}</strong>
                  <small>${escapeHtml(resolveAssetLabel(item.assetKind ?? item.kind ?? "character"))}</small>
                </button>
              `).join("")}
            </div>`
          : ""
      }
      ${
        mentionPreviewOpen && mentionPreviewAsset
          ? renderPromptMentionPreview(mentionPreviewAsset)
          : ""
      }
      ${
        mentionReferences.length
          ? `<div class="episode-replica-mention-strip">${mentionReferences.map((item) => `
              <button class="episode-replica-mention-chip" type="button" data-action="remove-mention-reference" data-reference-id="${escapeAttr(item.id ?? "")}" title="${escapeAttr(item.description ?? item.name ?? "")}">
                <span>${escapeHtml(item.token ?? `【@${item.name ?? "素材"}】`)}</span>
              </button>
            `).join("")}</div>`
          : ""
      }
      <div class="episode-replica-prompt-footer">
        <div class="episode-replica-prompt-selects">
          ${renderControlMenu(
            "model",
            selectedModel.label,
            isVideoModelMenuOpen ? "model" : null,
            models.map((item) => [item.id, item.label]),
            "select-video-model",
            "",
            "toggle-video-model-menu",
          )}
          ${parameterControls.join("")}
        </div>
        <button class="episode-replica-generate" type="button" data-action="${generateAction}" ${disabled(busy)}>
          <span>${escapeHtml(String(generateCost))}</span>
          <strong class="episode-replica-generate-label">${generationPollingActive ? "生成中" : "生成"}</strong>
        </button>
      </div>
      <p class="episode-replica-validation">${escapeHtml(validationMessage)}</p>
    </section>
  `;
}

function renderCurrentStoryboardMediaStage(selectedStoryboard, isVideo) {
  if (isVideo) {
    return `<div class="episode-replica-generated-stage"></div>`;
  }
  const mediaUrl = isVideo
    ? resolveSelectedVideoSource(selectedStoryboard)
    : resolveSelectedImageSource(selectedStoryboard);
  const mediaItems = isVideo
    ? (selectedStoryboard?.uploadedVideos ?? [])
    : (selectedStoryboard?.uploadedImages ?? []);
  const uploadingItems = mediaItems.filter((item) => item?.status === "uploading");
  if (!isVideo && selectedStoryboard?.imageStatus === "uploading" && selectedStoryboard?.uploadedImageName) {
    uploadingItems.push({
      id: "current-image-upload",
      name: selectedStoryboard.uploadedImageName,
      status: "uploading",
    });
  }
  if (!mediaUrl && !uploadingItems.length) {
    return `<div class="episode-replica-generated-stage"></div>`;
  }

  return `
    <div class="episode-replica-generated-stage visible current-media">
      <div class="episode-replica-stage-actions">
        ${
          isVideo
            ? `<button type="button" data-action="delete-storyboard-video" data-storyboard-id="${escapeAttr(selectedStoryboard?.id ?? "")}" data-video-id="${escapeAttr(selectedStoryboard?.selectedUploadedVideoId ?? selectedStoryboard?.currentVideoAssetVersionId ?? "")}">删除</button>`
            : `<button type="button" data-action="delete-storyboard-image" data-storyboard-id="${escapeAttr(selectedStoryboard?.id ?? "")}" data-image-id="${escapeAttr(selectedStoryboard?.currentImageAssetVersionId ?? "")}">删除</button>`
        }
      </div>
      ${
        mediaUrl
          ? isVideo
            ? `<video class="episode-replica-current-video" src="${escapeAttr(mediaUrl)}" controls playsinline></video>`
            : `<img class="episode-replica-current-image" src="${escapeAttr(mediaUrl)}" alt="${escapeAttr(selectedStoryboard?.title ?? "storyboard image")}" />`
          : ""
      }
      ${uploadingItems.map((item) => `
        <article class="episode-replica-uploading-media">
          <strong>${escapeHtml(item?.fileName ?? item?.name ?? "上传中")}</strong>
          <span>上传中</span>
        </article>
      `).join("")}
    </div>
  `;
}

function buildGenerationAttachmentCards(generationState = {}) {
  const cards = [];
  if (generationState?.firstFrame && generationState.firstFrame.fromQuickReference !== true) {
    cards.push({
      ...generationState.firstFrame,
      id: "first-frame",
      type: "image",
      name: generationState.firstFrame.name ?? "first-frame",
    });
  }
  if (generationState?.lastFrame) {
    cards.push({
      ...generationState.lastFrame,
      id: "last-frame",
      type: "image",
      name: generationState.lastFrame.name ?? "last-frame",
    });
  }
  if (generationState?.editSourceVideo) {
    cards.push({
      ...generationState.editSourceVideo,
      id: "edit-source-video",
      type: "video",
      name: generationState.editSourceVideo.name ?? "edit-source-video",
    });
  }
  for (const [index, item] of (generationState?.referenceUploads ?? []).entries()) {
    if (item?.fromQuickReference === true) {
      continue;
    }
    cards.push({
      ...item,
      id: item?.id ?? `reference-upload-${index + 1}`,
      type: item?.type ?? item?.kind ?? "image",
      name: item?.name ?? `reference-${index + 1}`,
    });
  }
  return cards;
}

function renderUploadLimitHint(uploadLimits = {}, supportsAudioUpload = false) {
  return "";
}

function formatLimitBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) {
    return `${Number((mb / 1024).toFixed(1))}GB`;
  }
  return `${Math.round(mb)}MB`;
}

function renderEpisodeExportPreview(exportPreviewResult) {
  if (!exportPreviewResult?.exportRecord && !exportPreviewResult?.export) {
    return "";
  }
  const signedUrl = resolveEpisodeExportPreviewLink(exportPreviewResult);
  const missingAssets = Array.isArray(exportPreviewResult?.export?.missingAssets)
    ? exportPreviewResult.export.missingAssets
    : [];
  return `
    <section class="episode-export-preview">
      <div class="episode-export-preview-head">
        <strong>导出预览</strong>
        <span>${escapeHtml(exportPreviewResult?.exportRecord?.workflowId ?? exportPreviewResult?.export?.workflowId ?? "")}</span>
      </div>
      ${
        missingAssets.length
          ? `<p class="episode-export-preview-warning">缺失资产：${escapeHtml(missingAssets.join("、"))}</p>`
          : '<p class="episode-export-preview-success">导出包已准备好，可以直接下载。</p>'
      }
      ${
        signedUrl
          ? `<a class="episode-export-preview-link" href="${escapeAttr(signedUrl)}" target="_blank" rel="noreferrer">下载导出包</a>`
          : '<p class="episode-export-preview-warning">原视频导出链接暂未生成，请稍后刷新重试。</p>'
      }
    </section>
  `;
}

function renderPromptMentionPreview(asset) {
  const previewUrl = resolveReferencePreview(asset);
  const name = asset?.name ?? asset?.label ?? "素材";
  return `
    <div class="episode-replica-mention-preview" data-floating="caret" role="status">
      <span class="episode-replica-mention-preview-thumb">
        ${
          previewUrl
            ? `<img src="${escapeAttr(previewUrl)}" alt="" />`
            : renderQuickPlaceholder(asset?.assetKind ?? asset?.kind ?? inferKind(name), name)
        }
      </span>
      <strong>${escapeHtml(name)}</strong>
    </div>
  `;
}

function resolveEpisodeExportPreviewLink(exportPreviewResult) {
  return (
    exportPreviewResult?.platform?.signedUrl ??
    exportPreviewResult?.export?.signedUrl ??
    exportPreviewResult?.export?.url ??
    ""
  );
}

function renderEpisodeExportOptionModal(modal) {
  if (!modal?.show) {
    return "";
  }
  const status = modal.status ?? "idle";
  const feedbackClass =
    status === "error"
      ? "error"
      : status === "done"
        ? "done"
        : status === "running"
          ? "running"
          : "idle";
  const feedbackMessage =
    modal.message ??
    (status === "error"
      ? "请确保所有分镜都已生成图片或者视频"
      : status === "running"
        ? "正在导出视频..."
        : "");
  const feedbackLink = modal.downloadUrl ?? "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-export-modal"></button>
      <div class="episode-export-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>导出</h2>
          <button class="modal-close" type="button" data-action="close-episode-export-modal">×</button>
        </div>
        <div class="episode-export-options">
          <button class="episode-export-option" type="button" data-action="start-episode-export" data-export-kind="mp4">
            <span class="icon">▣</span>
            <strong>MP4</strong>
          </button>
          <button class="episode-export-option" type="button" data-action="start-episode-export" data-export-kind="jianying">
            <span class="icon">▤</span>
            <strong>剪映工程文件</strong>
          </button>
        </div>
        ${
          feedbackMessage || feedbackLink
            ? `<div class="episode-export-modal-feedback ${feedbackClass}">
                ${feedbackMessage ? `<p class="episode-export-modal-status">${escapeHtml(feedbackMessage)}</p>` : ""}
                ${
                  feedbackLink
                    ? `<a class="episode-export-modal-link" href="${escapeAttr(feedbackLink)}" target="_blank" rel="noreferrer">下载导出包</a>`
                    : ""
                }
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderLipSyncDock({
  prompt,
  busy,
  generationControls,
  generationUiState,
  generationPollingActive = false,
  validationMessage = "",
  attachments = [],
}) {
  const promptValue = String(prompt ?? "");
  const voiceName = String(generationUiState?.lipSyncVoiceName ?? "").trim();
  const lipSyncCost = calculateLipSyncCreditCost(promptValue);
  const previewAudioId = generationUiState?.lipSyncPreviewAudioId ?? null;
  const audioItems = (generationUiState?.lipSyncAudioItems?.length
    ? generationUiState.lipSyncAudioItems
    : (attachments ?? []).filter((item) => item?.type === "audio" || item?.kind === "audio"));
  return `
    <section class="episode-replica-prompt lip-sync-mode">
      <div class="episode-replica-stage-head lip-sync-head">
        <p class="episode-replica-stage-title">配音内容</p>
      </div>
      <label class="episode-replica-textarea lip-sync-textarea">
        <textarea id="video-prompt-input" placeholder="输入音频内容 2灵感值/10个字">${escapeHtml(promptValue)}</textarea>
        <em>${[...promptValue].length} / 800</em>
      </label>
      <div class="episode-replica-prompt-footer lip-sync-footer">
        <div class="episode-replica-lipsync-voice-row">
          <button
            class="episode-replica-mini ${voiceName ? "active" : ""}"
            type="button"
            data-action="open-episode-voice-modal"
            data-voice-scope="lip-sync"
          >${escapeHtml(voiceName || "+ 配音员")}</button>
          ${voiceName ? `<span class="episode-replica-lipsync-voice-chip">${escapeHtml(voiceName)}</span>` : ""}
        </div>
        <button class="episode-replica-generate" type="button" data-action="generate-videos" ${disabled(busy)}>
          <span>${escapeHtml(String(lipSyncCost))}</span>
          <strong class="episode-replica-generate-label">${generationPollingActive ? "生成中" : "生成"}</strong>
        </button>
      </div>
      <div class="episode-replica-stage-head lip-sync-head secondary">
        <p class="episode-replica-stage-title">音频内容</p>
      </div>
      <div class="episode-replica-ref-strip lip-sync-audio-list">
        ${
          audioItems.length
            ? audioItems.map((item, index) => renderLipSyncAudioItem(item, index, previewAudioId)).join("")
            : `
              <div class="episode-replica-audio-empty">
                <span class="episode-replica-audio-empty-icon">♫</span>
                <strong>暂无数据</strong>
              </div>
            `
        }
      </div>
      ${renderUploadLimitHint(generationControls.uploadLimits ?? {}, true)}
      <p class="episode-replica-validation">${escapeHtml(validationMessage)}</p>
    </section>
  `;
}

function renderLipSyncAudioItem(item, index, previewAudioId) {
  const audioId = String(item?.id ?? `audio-${index + 1}`);
  const isPlaying = previewAudioId === audioId;
  const voiceName = String(item?.voiceName ?? "").trim();
  const summary = String(item?.summary ?? "").trim();
  const title = String(item?.name ?? `音频 ${index + 1}`).trim();
  const durationLabel = String(item?.durationLabel ?? item?.duration ?? "").trim();
  return `
    <article class="episode-replica-audio-item ${isPlaying ? "playing" : ""}">
      <button
        class="episode-replica-audio-play"
        type="button"
        data-action="preview-lip-sync-audio"
        data-audio-id="${escapeAttr(audioId)}"
      >${isPlaying ? "停止试听" : "试听"}</button>
      <div class="episode-replica-audio-copy">
        <strong>${escapeHtml(title)}</strong>
        ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      </div>
      <div class="episode-replica-audio-side">
        <span class="episode-replica-audio-meta">${escapeHtml(voiceName || "已生成音频")}</span>
        ${durationLabel ? `<small>${escapeHtml(durationLabel)}</small>` : ""}
      </div>
    </article>
  `;
}

function renderAttachment(item, index, selected) {
  const mediaType = item.type ?? item.kind ?? "image";
  const previewUrl = resolveReferencePreview(item);
  const title = mediaType === "audio" ? `音频 ${index + 1}` : item.name ?? `图片 ${index + 1}`;
  const preview =
    mediaType === "audio"
      ? "<i>♫</i>"
      : previewUrl
        ? mediaType === "video"
          ? `<video src="${escapeAttr(previewUrl)}" muted playsinline preload="metadata"></video>`
          : `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "attachment")}" />`
        : renderQuickPlaceholder(mediaType, item.name ?? "图片");
  return `
    <article class="episode-replica-ref-card attachment ${escapeAttr(mediaType)} ${selected ? "selected" : ""}" data-action="toggle-episode-workbench-attachment-selection" data-attachment-id="${escapeAttr(item.id ?? "")}">
      <button class="episode-replica-ref-remove" type="button" data-action="remove-episode-workbench-attachment" data-attachment-id="${escapeAttr(item.id ?? "")}">×</button>
      <span class="episode-replica-ref-art ${escapeAttr(mediaType)}">${preview}</span>
      <strong>${escapeHtml(title)}</strong>
    </article>
  `;
}

function renderQuickReferenceItem(item) {
  const previewUrl = resolveReferencePreview(item);
  const previewMarkup = typeof item?.previewMarkup === "string" ? item.previewMarkup.trim() : "";
  const kind = item.kind ?? "image";
  const storyboardReferences = Array.isArray(item?.references) ? item.references.filter(Boolean) : [];
  const voiceName = String(item?.voiceName ?? "").trim();
  return `
    <article class="episode-replica-ref-card quick-reference ${voiceName ? "voice configured" : ""}" title="${escapeAttr(item.description ?? item.name ?? "")}">
      <button class="episode-replica-ref-remove" type="button" data-action="remove-quick-reference" data-reference-id="${escapeAttr(item.id ?? "")}">×</button>
      <span class="episode-replica-ref-art ${escapeAttr(kind)}">
        ${storyboardReferences.length
          ? renderStoryboardPreviewThumb(storyboardReferences)
          : previewUrl
            ? kind === "video"
              ? `<video src="${escapeAttr(previewUrl)}" muted playsinline preload="metadata"></video>`
              : `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "reference")}" />`
          : previewMarkup || renderQuickPlaceholder(kind || inferKind(item.name), item.name ?? "reference")}
      </span>
      ${voiceName ? `<strong>${escapeHtml(voiceName)}</strong>` : ""}
    </article>
  `;
}

function renderResultReference(item) {
  const previewUrl = resolveReferencePreview(item);
  const previewMarkup = typeof item?.previewMarkup === "string" ? item.previewMarkup.trim() : "";
  return `<span class="episode-replica-mini-thumb enriched">${
    previewUrl
      ? `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "reference")}" />`
      : previewMarkup || renderQuickPlaceholder(item.kind || inferKind(item.name), item.name)
  }</span>`;
}

function renderMiniMenu(menu, label, activeMenu, options, action = "select-generation-field-option") {
  const active = activeMenu === menu;
  return `
    <span class="episode-replica-mini-wrap">
      <button class="episode-replica-mini ${active ? "active" : ""}" type="button" data-action="toggle-muse-prompt-menu" data-menu="${escapeAttr(menu)}">${escapeHtml(label)}</button>
      ${active ? `<span class="episode-replica-float-menu">${options.map(([value, text]) => `<button type="button" data-action="${escapeAttr(action)}" data-field="${escapeAttr(menu)}" data-value="${escapeAttr(value)}">${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function buildModelParameterControls({
  selectedModel,
  isVideoMode,
  generationControls = {},
  openGenerationSelectMenu,
}) {
  const schema = selectedModel?.parameterSchema && typeof selectedModel.parameterSchema === "object"
    ? selectedModel.parameterSchema
    : {};
  const parameterValues = generationControls.parameterValues && typeof generationControls.parameterValues === "object"
    ? generationControls.parameterValues
    : {};
  const entries = Object.entries(schema)
    .filter(([key, parameter]) => shouldRenderModelParameterControl(key, parameter));
  if (!entries.length) {
    return buildFallbackParameterControls({
      selectedModel,
      isVideoMode,
      generationControls,
      openGenerationSelectMenu,
    });
  }
  return entries
    .map(([key, parameter]) => {
      const options = optionPairsFromParameter(parameter, [], []);
      if (!options.length) {
        return "";
      }
      const value = resolveModelParameterValue(key, {
        parameterValues,
        generationControls,
        selectedModel,
        isVideoMode,
        options,
      });
      const label = labelForModelParameterValue(value, parameter, options);
      return renderControlMenu(key, label, openGenerationSelectMenu, options, "select-generation-field-option", parameter?.label ?? key);
    })
    .filter(Boolean);
}

function buildFallbackParameterControls({
  selectedModel,
  isVideoMode,
  generationControls = {},
  openGenerationSelectMenu,
}) {
  const aspectRatio = generationControls.imageAspectRatio ?? "16:9";
  const resolution = isVideoMode
    ? (generationControls.videoResolution ?? "1080p")
    : (generationControls.imageResolution ?? "2K");
  const duration = generationControls.videoDurationSec ?? "5";
  const ratioOptions = optionPairsFromValues(
    selectedModel?.supportedRatios,
    isVideoMode ? ["16:9", "9:16"] : ["16:9", "9:16", "1:1"],
  );
  const qualityOptions = optionPairsFromValues(
    selectedModel?.supportedQuality,
    isVideoMode ? ["1080p"] : ["2K"],
  );
  const durationOptions = optionPairsFromValues(selectedModel?.supportedDurations, ["5", "10"], (value) => `${value}秒`);
  return [
    renderControlMenu("imageAspectRatio", aspectRatio, openGenerationSelectMenu, ratioOptions),
    renderControlMenu(isVideoMode ? "videoResolution" : "imageResolution", resolution, openGenerationSelectMenu, qualityOptions),
    isVideoMode ? renderControlMenu("videoDurationSec", `${duration}秒`, openGenerationSelectMenu, durationOptions) : "",
  ].filter(Boolean);
}

function shouldRenderModelParameterControl(key, parameter) {
  if (parameter?.visible === false) {
    return false;
  }
  if (["prompt", "negativePrompt", "referenceImages", "editInstruction"].includes(key)) {
    return false;
  }
  return optionPairsFromParameter(parameter, [], []).length > 0;
}

function resolveModelParameterValue(key, { parameterValues, generationControls, selectedModel, isVideoMode, options }) {
  const defaults = selectedModel?.defaultParams && typeof selectedModel.defaultParams === "object"
    ? selectedModel.defaultParams
    : {};
  const candidates = [
    parameterValues[key],
    key === "aspectRatio" ? generationControls.imageAspectRatio : undefined,
    key === "quality" && !isVideoMode ? generationControls.imageResolution : undefined,
    key === "resolution" ? (isVideoMode ? generationControls.videoResolution : generationControls.imageResolution) : undefined,
    key === "durationSec" ? generationControls.videoDurationSec : undefined,
    key === "count" ? (isVideoMode ? generationControls.videoCount : generationControls.imageCount) : undefined,
    defaults[key],
    options[0]?.[0],
  ];
  if (options.length) {
    const optionValues = new Set(options.map(([value]) => String(value)));
    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null && candidate !== "" && optionValues.has(String(candidate))) {
        return String(candidate);
      }
    }
    return String(options[0]?.[0] ?? "");
  }
  return firstNonEmptyValue(...candidates);
}

function firstNonEmptyValue(...candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }
  return "";
}

function labelForModelParameterValue(value, parameter, options) {
  const matched = options.find(([optionValue]) => String(optionValue) === String(value));
  return matched?.[1] ?? String(value ?? parameter?.label ?? "");
}

function renderControlMenu(field, label, openMenu, options, action = "select-generation-field-option", title = "", toggleAction = "toggle-generation-select-menu") {
  const open = openMenu === field;
  const titleAttr = title ? ` title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"` : "";
  return `
    <span class="episode-replica-control-wrap">
      <button class="episode-replica-control" type="button" data-action="${escapeAttr(toggleAction)}" data-field="${escapeAttr(field)}"${titleAttr}>${escapeHtml(label)}</button>
      ${open ? `<span class="episode-replica-float-menu compact">${options.map(([value, text]) => `<button type="button" data-action="${escapeAttr(action)}" ${action === "select-video-model" ? `data-model-id="${escapeAttr(value)}" data-model-name="${escapeAttr(text)}"` : `data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}"`}>${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function renderMediaTab(tab, activeMode, activeVideoGenerationMode = "first-frame") {
  const action = tab.action ?? "set-episode-media-mode";
  const mode = tab.mode ?? tab.id;
  const isActive =
    action === "set-video-generation-mode"
      ? activeMode === "video" && mode === activeVideoGenerationMode
      : mode === activeMode;
  return `<button class="episode-replica-stage-tab ${isActive ? "active" : ""}" type="button" data-action="${escapeAttr(action)}" data-mode="${escapeAttr(mode)}">${escapeHtml(tab.label)}</button>`;
}

function renderStoryboardDescriptionModal({ show, value, selectedStoryboard }) {
  if (!show || !selectedStoryboard) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-storyboard-description-modal"></button>
      <div class="single-episode-modal storyboard-description-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>分镜描述</h2>
          <button class="modal-close" type="button" data-action="close-storyboard-description-modal">×</button>
        </div>
        <label class="single-episode-field storyboard-description-field">
          <textarea id="storyboard-description-input" placeholder="请填写分镜描述">${escapeHtml(value ?? "")}</textarea>
        </label>
        <div class="single-episode-actions storyboard-description-actions">
          <button class="secondary-action compact" type="button" data-action="close-storyboard-description-modal">取消</button>
          <button class="primary-action compact" type="button" data-action="save-storyboard-description">确认修改</button>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeDeleteModal({ show, title, text, closeAction, confirmAction }) {
  if (!show) return "";
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon warning">!</div>
          <div>
            <h2>${escapeHtml(title ?? "确认删除")}</h2>
            <p>${escapeHtml(text)}</p>
          </div>
          <button class="modal-close" type="button" data-action="${escapeAttr(closeAction)}">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="${escapeAttr(closeAction)}">取消</button>
          <button class="delete-confirm-button" type="button" data-action="${escapeAttr(confirmAction)}">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeAssetCreateModal(modal) {
  if (!modal?.show) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-asset-create-modal"></button>
      <div class="episode-asset-create-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-asset-create-modal">×</button>
        <label class="episode-asset-create-group">
          <span>类型 <em>*</em></span>
          <div class="episode-asset-create-tabs">
            ${ASSET_TABS.map((item) => `<button class="${modal.type === item.id ? "active" : ""}" type="button" data-action="set-episode-asset-create-type" data-type="${escapeAttr(item.id)}">${escapeHtml(item.label)}</button>`).join("")}
          </div>
        </label>
        <label class="episode-asset-create-group">
          <span>名称 <em>*</em></span>
          <div class="episode-asset-create-input-wrap">
            <input id="episode-asset-create-name" type="text" maxlength="20" value="${escapeAttr(modal.name ?? "")}" placeholder="请填写名称" />
            <em>${[...(modal.name ?? "")].length} / 20</em>
          </div>
        </label>
        <button class="episode-asset-create-save" type="button" data-action="save-episode-asset-create" ${disabled(!(modal.name ?? "").trim())}>保存</button>
      </div>
    </section>
  `;
}

function renderEpisodeVoiceModal(modal) {
  if (!modal) return "";
  const tabs = [
    { id: "custom", label: "自定义" },
    { id: "system", label: "系统" },
  ];
  const activeTab = modal.tab === "system" ? "system" : "custom";
  const options = VOICE_OPTIONS_BY_TAB[activeTab];
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-voice-modal"></button>
      <div class="episode-voice-modal episode-voice-picker-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-voice-modal">×</button>
        <h3>选择配音</h3>
        <div class="episode-voice-tabs">
          ${tabs.map((tab) => `<button class="${activeTab === tab.id ? "active" : ""}" type="button" data-action="set-episode-voice-tab" data-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>`).join("")}
        </div>
        <div class="episode-voice-grid">
          ${options.map((voice) => `
            <article
              class="episode-voice-card ${modal.voiceName === voice.name ? "active" : ""}"
              data-action="select-episode-voice"
              data-voice-id="${escapeAttr(voice.id)}"
              data-voice-name="${escapeAttr(voice.name)}"
              data-voice-source="${escapeAttr(activeTab)}"
              role="button"
              tabindex="0"
              aria-pressed="${modal.voiceName === voice.name ? "true" : "false"}"
            >
              <span class="episode-voice-card-radio" aria-hidden="true"></span>
              <span class="episode-voice-avatar"><i></i></span>
              <strong>${escapeHtml(voice.name)}</strong>
              <div class="episode-voice-card-foot">
                <span class="episode-voice-card-state">${modal.voiceName === voice.name ? "已选中" : ""}</span>
                <button
                  type="button"
                  class="episode-voice-preview-trigger ${modal.previewVoiceName === voice.name ? "active" : ""}"
                  data-action="preview-episode-voice"
                  data-voice-name="${escapeAttr(voice.name)}"
                >${modal.previewVoiceName === voice.name ? "停止试听" : "试听"}</button>
              </div>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function resolveGenerateCost(mediaMode, generationControls = {}, selectedModel = null) {
  if (Number.isFinite(Number(selectedModel?.credits)) && Number(selectedModel.credits) > 0) {
    return Number(selectedModel.credits);
  }
  if (mediaMode === "lip-sync") {
    return calculateLipSyncCreditCost(generationControls?.lipSyncPrompt ?? "");
  }
  if (mediaMode === "video") {
    return Number(generationControls.videoCreditCost ?? 120);
  }
  const mode = generationControls.imageMode ?? generationControls.mode ?? null;
  if (mode === "multi-image") {
    return Number(generationControls.multiReferenceCreditCost ?? 50);
  }
  return Number(generationControls.imageCreditCost ?? 90);
}

function buildConfiguredPromptDockModels(config, mediaType) {
  const models = Array.isArray(config?.models) ? config.models : [];
  return models
    .filter((model) => {
      const configuredMediaType = String(model?.mediaType ?? "").trim();
      if (configuredMediaType) {
        return configuredMediaType === mediaType;
      }
      return modelMatchesPromptDockMediaType(model, mediaType);
    })
    .map((model) => {
      const id = String(model?.modelCode ?? model?.id ?? "").trim();
      if (!id) {
        return null;
      }
      return {
        id,
        label: String(model?.modelLabel ?? model?.displayName ?? id).trim() || id,
        credits: Number(model?.displayBaseCost ?? model?.credits ?? 0),
        supportedRatios: normalizeOptionValues(model?.supportedRatios),
        supportedQuality: normalizeOptionValues(model?.supportedQuality),
        supportedDurations: normalizeOptionValues(model?.supportedDurations),
        parameterSchema: normalizeParameterSchema(model?.parameterSchema),
        defaultParams: model?.defaultParams && typeof model.defaultParams === "object" ? model.defaultParams : {},
      };
    })
    .filter(Boolean);
}

function normalizeParameterSchema(schema) {
  return schema && typeof schema === "object" && !Array.isArray(schema) ? schema : {};
}

function normalizeOptionValues(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function optionPairsFromValues(values, fallback, labeler = (value) => value) {
  const normalized = normalizeOptionValues(values);
  const source = normalized.length ? normalized : fallback;
  return source.map((value) => [value, labeler(value)]);
}

function optionPairsFromParameter(parameter, values, fallback) {
  const options = enumValuesFromParameter(parameter).length
    ? enumValuesFromParameter(parameter)
    : integerValuesFromParameter(parameter);
  if (options.length) {
    return options.map((option) => [
      option.value,
      option.label || option.value,
    ]);
  }
  return optionPairsFromValues(values, fallback);
}

function enumValuesFromParameter(parameter) {
  if (!parameter || typeof parameter !== "object" || Array.isArray(parameter)) {
    return [];
  }
  const rawOptions = Array.isArray(parameter.options)
    ? parameter.options
    : Array.isArray(parameter.enum)
      ? parameter.enum
      : [];
  return rawOptions
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const value = String(item.value ?? item.providerValue ?? item.label ?? "").trim();
        if (!value) return null;
        return {
          value,
          label: String(item.label ?? value).trim() || value,
        };
      }
      const value = String(item ?? "").trim();
      return value ? { value, label: value } : null;
    })
    .filter(Boolean);
}

function integerValuesFromParameter(parameter) {
  if (!parameter || typeof parameter !== "object" || String(parameter.type ?? "") !== "integer") {
    return [];
  }
  const minimum = Number(parameter.minimum ?? parameter.min ?? 1);
  const maximum = Number(parameter.maximum ?? parameter.max ?? minimum);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum || maximum - minimum > 12) {
    return [];
  }
  const values = [];
  for (let value = Math.ceil(minimum); value <= Math.floor(maximum); value += 1) {
    values.push({ value: String(value), label: String(value) });
  }
  return values;
}

function modelMatchesPromptDockMediaType(model, mediaType) {
  const supportedModes = Array.isArray(model?.supportedModes)
    ? model.supportedModes.map((item) => normalizePromptDockModeToken(item)).filter(Boolean)
    : [];
  if (!supportedModes.length) {
    return true;
  }
  if (mediaType === "video") {
    return supportedModes.some((mode) => {
      const normalized = mode.replaceAll("-", "_");
      return normalized.includes("video") || normalized === "image_to_video" || normalized === "lip_sync";
    });
  }
  if (mediaType === "image") {
    return supportedModes.some((mode) => {
      const normalized = mode.replaceAll("-", "_");
      return (
        normalized.includes("image") ||
        normalized === "text_to_image" ||
        normalized === "multi_reference" ||
        normalized === "single_image" ||
        normalized === "multi_image"
      );
    });
  }
  return true;
}

function normalizePromptDockModeToken(mode) {
  return String(mode ?? "").trim().replaceAll(".", "_").replaceAll("-", "_");
}

function renderAssetInspectorModal(inspector) {
  const mediaUrl = String(inspector?.url ?? "").trim();
  if (!inspector || !mediaUrl) return "";
  const isVideo = inspector.type === "video";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-asset-inspector"></button>
      <div class="single-episode-modal storyboard-description-modal asset-inspector-modal asset-inspector-dialog">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>${escapeHtml(inspector.title ?? (isVideo ? "视频详情" : "图片详情"))}</h2>
          <button class="modal-close" type="button" data-action="close-asset-inspector">×</button>
        </div>
        <div class="asset-inspector-preview">
          ${isVideo ? `<video src="${escapeAttr(mediaUrl)}" controls playsinline preload="metadata"></video>` : `<img src="${escapeAttr(mediaUrl)}" alt="${escapeAttr(inspector.name ?? "素材")}" />`}
        </div>
        <div class="asset-inspector-meta">
          <strong>${escapeHtml(inspector.name ?? "未命名素材")}</strong>
          <span>状态：${escapeHtml(inspector.status ?? "ready")}</span>
        </div>
        <div class="single-episode-actions storyboard-description-actions">
          <button class="primary-action compact" type="button" data-action="close-asset-inspector">关闭</button>
        </div>
      </div>
    </section>
  `;
}

function renderEpisodeBatchModal(modal) {
  if (!modal?.show) return "";
  const mode = modal.mode ?? "image";
  const scope = modal.scope ?? "asset";
  const selectedCount = modal.items?.length ?? 0;
  const title = mode === "video" ? "批量生视频" : mode === "upscale" ? "批量高清处理" : "批量生图";
  const totalCredits = modal.totalCredits ?? 0;
  const primaryLabel =
    mode === "video"
      ? `生成 ${selectedCount} 条视频 | ${totalCredits} 积分`
      : mode === "upscale"
        ? `处理 ${selectedCount} 项素材 | ${totalCredits} 积分`
        : `生成${selectedCount}张图 | ${totalCredits} 积分`;
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-batch-modal"></button>
      <div class="episode-batch-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="modal-close" type="button" data-action="close-episode-batch-modal">×</button>
        </div>
        <div class="episode-batch-mode-tabs">
          <button class="${mode === "image" ? "active" : ""}" type="button" disabled>批量生图</button>
          <button class="${mode === "video" ? "active" : ""}" type="button" disabled>批量生视频</button>
          <button class="${mode === "upscale" ? "active" : ""}" type="button" disabled>批量高清处理</button>
          <button type="button" disabled>主体固定</button>
        </div>
        ${
          mode === "image"
            ? renderEpisodeBatchImagePanel(modal, selectedCount, primaryLabel)
            : renderEpisodeBatchVideoPanel(modal, selectedCount, primaryLabel, scope)
        }
      </div>
    </section>
  `;
}

function renderEpisodeBatchImagePanel(modal, selectedCount, primaryLabel) {
  const styleTab = modal.styleTab === "custom" ? "custom" : "public";
  const styleCards = styleTab === "custom" ? BATCH_CUSTOM_STYLES : BATCH_PUBLIC_STYLES;
  const selectedStyleId = modal.selectedStyleId ?? styleCards[0]?.id ?? "";
  const imageModel = resolveBatchImageModelLabel(modal.imageModelId);
  return `
    <div class="episode-batch-image-panel">
      ${renderEpisodeBatchSelectField("imageModelId", "图片模型", imageModel, modal.openField === "imageModelId", groupBatchImageModelOptions())}
      <section class="episode-batch-style-panel">
        <div class="episode-batch-section-title">模型画风</div>
        <div class="episode-batch-style-tabs">
          <button class="${styleTab === "public" ? "active" : ""}" type="button" data-action="set-episode-batch-style-tab" data-tab="public">公共画风</button>
          <button class="${styleTab === "custom" ? "active" : ""}" type="button" data-action="set-episode-batch-style-tab" data-tab="custom">定制画风</button>
        </div>
        <div class="episode-batch-style-grid">
          ${styleCards.map((card) => `
            <button
              class="episode-batch-style-card ${card.id === selectedStyleId ? "selected" : ""}"
              type="button"
              data-action="select-episode-batch-style"
              data-style-id="${escapeAttr(card.id)}"
            >
              <img src="${escapeAttr(card.preview)}" alt="${escapeAttr(card.label)}" />
              <strong>${escapeHtml(card.label)}</strong>
            </button>
          `).join("")}
        </div>
      </section>
      <section class="episode-batch-config-panel">
        <div class="episode-batch-section-title">其他配置</div>
        <div class="episode-batch-config-grid">
          ${renderEpisodeBatchSelectField("scenePresetId", "场景", resolveBatchPresetLabel(modal.scenePresetId), modal.openField === "scenePresetId", BATCH_PRESET_OPTIONS.map((option) => ({ value: option.id, label: option.label })))}
          ${renderEpisodeBatchSelectField("rolePresetId", "角色预设", resolveBatchPresetLabel(modal.rolePresetId), modal.openField === "rolePresetId", BATCH_PRESET_OPTIONS.map((option) => ({ value: option.id, label: option.label })))}
          ${renderEpisodeBatchSelectField("propPresetId", "道具预设", resolveBatchPresetLabel(modal.propPresetId), modal.openField === "propPresetId", BATCH_PRESET_OPTIONS.map((option) => ({ value: option.id, label: option.label })))}
          ${renderEpisodeBatchSelectField("aspectRatio", "比例", modal.aspectRatio ?? "16:9", modal.openField === "aspectRatio", BATCH_RATIO_OPTIONS.map((option) => ({ value: option, label: option })))}
          ${renderEpisodeBatchSelectField("size", "大小", modal.size ?? "2K", modal.openField === "size", BATCH_SIZE_OPTIONS.map((option) => ({ value: option, label: option })))}
        </div>
      </section>
      <footer class="episode-batch-footer">
        <span class="episode-batch-footer-summary">批量生成选中的 ${selectedCount} 项素材</span>
        <button class="episode-batch-submit" type="button" data-action="submit-episode-batch-modal">${escapeHtml(primaryLabel)}</button>
      </footer>
    </div>
  `;
}

function renderEpisodeBatchVideoPanel(modal, selectedCount, primaryLabel, scope) {
  const selectedCountLabel = scope === "storyboard" ? `${selectedCount} 条分镜` : `${selectedCount} 项素材`;
  const options = BATCH_VIDEO_MODEL_OPTIONS.map((option) => ({ value: option.id, label: option.label }));
  return `
    <div class="episode-batch-video-panel">
      <p class="episode-batch-modal-copy">已选 ${selectedCountLabel}，统一配置会按当前内容分别写入视频任务。</p>
      <p class="episode-batch-modal-copy subtle">确认后会为每条分镜各自创建视频任务，并回到列表查看进度。</p>
      <div class="episode-batch-video-config-grid">
        ${renderEpisodeBatchInfoCard("视频模型", resolveBatchVideoModelLabel(modal.videoModelId), modal.openField === "videoModelId", "videoModelId", options)}
        ${renderEpisodeBatchInfoCard("预设", "无预设", false)}
        ${renderEpisodeBatchInfoCard("比例", modal.aspectRatio ?? "16:9", modal.openField === "aspectRatio", "aspectRatio", BATCH_RATIO_OPTIONS.map((option) => ({ value: option, label: option })))}
        ${renderEpisodeBatchInfoCard("分辨率", modal.videoResolution ?? "720P", modal.openField === "videoResolution", "videoResolution", [{ value: "720P", label: "720P" }, { value: "1080P", label: "1080P" }])}
      </div>
      <div class="episode-batch-selection-grid compact">
        ${(modal.items ?? []).map((item, index) => `
          <article class="episode-batch-selection-card compact">
            <span class="episode-batch-selection-thumb">
              ${
                item.kind === "storyboard" && Array.isArray(item.references) && item.references.length
                  ? renderStoryboardPreviewThumb(item.references)
                  : renderAssetPreviewVisual(item, item.kind || "character")
              }
              <i>${index + 1}</i>
            </span>
            <div class="episode-batch-selection-meta">
              <strong>${escapeHtml(item.name ?? `素材 ${index + 1}`)}</strong>
              <span>${escapeHtml(item.kind === "storyboard" ? "分镜" : resolveAssetLabel(item.kind || "character"))}</span>
            </div>
          </article>
        `).join("")}
      </div>
      <footer class="episode-batch-footer">
        <span class="episode-batch-footer-summary">批量生成选中的 ${selectedCountLabel}视频</span>
        <button class="episode-batch-submit" type="button" data-action="submit-episode-batch-modal">${escapeHtml(primaryLabel)}</button>
      </footer>
    </div>
  `;
}

function renderEpisodeBatchSelectField(field, label, value, open, options) {
  return `
    <div class="episode-batch-select-group">
      ${label ? `<span class="episode-batch-field-label">${escapeHtml(label)}</span>` : ""}
      <div class="episode-batch-select-wrap ${open ? "open" : ""}">
        <button
          class="episode-batch-select"
          type="button"
          data-action="toggle-episode-batch-menu"
          data-field="${escapeAttr(field)}"
        >
          <span>${escapeHtml(value)}</span>
          <i>⌄</i>
        </button>
        ${
          open
            ? `<div class="episode-batch-select-menu">
                ${options.map((option) => `
                  <button
                    type="button"
                    data-action="select-episode-batch-option"
                    data-field="${escapeAttr(field)}"
                    data-value="${escapeAttr(option.value)}"
                    ${option.disabled ? "disabled" : ""}
                  >
                    ${escapeHtml(option.label)}
                  </button>
                `).join("")}
              </div>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderEpisodeBatchInfoCard(label, value, open = false, field = "", options = []) {
  return `
    <div class="episode-batch-info-card ${open ? "open" : ""}">
      <strong>${escapeHtml(label)}</strong>
      ${
        field
          ? renderEpisodeBatchSelectField(field, "", value, open, options)
          : `<span>${escapeHtml(value)}</span>`
      }
    </div>
  `;
}

function groupBatchImageModelOptions() {
  const groups = new Map();
  for (const option of BATCH_IMAGE_MODEL_OPTIONS) {
    if (!groups.has(option.group)) {
      groups.set(option.group, []);
    }
    groups.get(option.group).push(option);
  }
  return [...groups.entries()].flatMap(([group, options]) => [
    { value: `__label__${group}`, label: `【${group}】`, disabled: true },
    ...options.map((option) => ({ value: option.id, label: option.label })),
  ]);
}

function resolveBatchImageModelLabel(value) {
  return BATCH_IMAGE_MODEL_OPTIONS.find((option) => option.id === value)?.label ?? "nano banana 2（链路G）";
}

function resolveBatchVideoModelLabel(value) {
  return BATCH_VIDEO_MODEL_OPTIONS.find((option) => option.id === value)?.label ?? "Vidu Q3 Pro";
}

function resolveBatchPresetLabel(value) {
  return BATCH_PRESET_OPTIONS.find((option) => option.id === value)?.label ?? "无预设";
}

function resolveReferencePromptPresetLabel(value) {
  const presetMap = {
    none: "无预设",
    "scene-wide": "[系统]场景-广角图",
    "scene-vr": "[系统]场景-VR场景图",
    "prop-triple": "[系统]道具-三视图",
    "character-triple": "[系统]角色-三视图",
    "comic-style": "无预设",
  };
  return presetMap[value] ?? "无预设";
}

function calculateLipSyncCreditCost(value) {
  const length = [...String(value ?? "").trim()].length;
  if (!length) {
    return 0;
  }
  return Math.ceil(length / 10) * 2;
}

function resolveAssetLabel(tab) {
  return ASSET_TABS.find((item) => item.id === tab)?.label ?? "素材";
}

function resolveAssetSetLabel(tab) {
  if (tab === "scene") {
    return "设为场景图";
  }
  if (tab === "prop") {
    return "设为道具图";
  }
  return "设为角色图";
}

function renderAssetPreviewVisual(asset, kind) {
  const previewUrl = resolveReferencePreview(asset);
  if (previewUrl) {
    return `<img src="${escapeAttr(resolveApiUrl(previewUrl))}" alt="${escapeAttr(asset?.name ?? "asset")}" loading="lazy" onerror="this.dataset.loadFailed='true';this.style.display='none';this.nextElementSibling&&this.nextElementSibling.classList.add('is-visible');" />${renderPlaceholderArt(kind, asset?.name ?? "")}`;
  }
  return renderPlaceholderArt(kind, asset?.name ?? "");
}

function renderPlaceholderArt(kind, label) {
  return `
    <span class="episode-replica-placeholder episode-replica-placeholder-${escapeAttr(kind)}">
      <i></i><b>${escapeHtml(String(label || "素材").slice(0, 4))}</b>
    </span>
  `;
}

function renderQuickPlaceholder(kind, label) {
  return `
    <span class="episode-replica-quick-art episode-replica-quick-art-${escapeAttr(kind)}">
      <i></i><b>${escapeHtml(String(label || "素材").slice(0, 4))}</b>
    </span>
  `;
}

function renderStoryboardPreviewThumb(refs) {
  const items = refs.slice(0, 4).map((item) => {
    const preview = resolveReferencePreview(item);
    const name = item.name ?? item.assetName ?? "素材";
    return { preview, name, kind: item.kind || inferKind(name) };
  });
  if (!items.length) {
    return `<span class="episode-replica-shot-preview-art"></span>`;
  }
  const renderThumb = (item) => `
    <span class="episode-replica-shot-ref-card" aria-label="引用图片">
      ${
        item.preview
          ? `<img src="${escapeAttr(item.preview)}" alt="" />`
          : renderQuickPlaceholder(item.kind, "")
      }
    </span>
  `;
  return `
    <span class="episode-replica-shot-ref-list" aria-label="引用图片">
      ${items.map(renderThumb).join("")}
    </span>
  `;
}

function truncateDisplayText(value, maxLength = 100) {
  const normalized = String(value ?? "").trim();
  if ([...normalized].length <= maxLength) {
    return normalized;
  }
  return `${[...normalized].slice(0, maxLength).join("")}...`;
}

function resolveReferencePreview(item) {
  const candidates = [
    item?.fixedImageUrl,
    item?.preview,
    item?.previewUrl,
    item?.publicUrl,
    item?.coverImageUrl,
    item?.src,
    item?.imageUrl,
    item?.url,
  ];
  return (
    candidates.find((candidate) => {
      if (typeof candidate !== "string") {
        return false;
      }
      const value = candidate.trim();
      if (!value) {
        return false;
      }
      if (
        value === "http://www.w3.org/2000/svg" ||
        value === "https://www.w3.org/2000/svg"
      ) {
        return false;
      }
      return true;
    }) ?? ""
  );
}

function resolveSelectedImageSource(storyboard) {
  const selected = (storyboard?.uploadedImages ?? []).find(
    (item) => item.id === storyboard?.currentImageAssetVersionId && item?.src,
  );
  return selected?.src ?? storyboard?.previewImageUrl ?? null;
}

function resolveSelectedVideoSource(storyboard) {
  const selected = (storyboard?.uploadedVideos ?? []).find(
    (item) =>
      item.id === (storyboard?.selectedUploadedVideoId ?? storyboard?.currentVideoAssetVersionId) && item?.src,
  );
  return selected?.src ?? storyboard?.previewVideo ?? null;
}

function isGenerationWaiting(generationResult, storyboard, video = false) {
  const workflowStatus = String(generationResult?.status ?? generationResult?.platform?.workflowStatus ?? "").toLowerCase();
  if (workflowStatus === "running" || workflowStatus === "queued" || workflowStatus === "pending") {
    return true;
  }
  if (video) {
    return Boolean(storyboard?.generationState?.lastSubmission?.status === "running" && !resolveSelectedVideoSource(storyboard));
  }
  return Boolean(storyboard?.generationState?.lastSubmission?.status === "running" && !resolveSelectedImageSource(storyboard));
}

function resolveWorkflowStatusLabel(status) {
  if (status === "completed" || status === "succeeded") {
    return "已完成";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "queued") {
    return "排队中";
  }
  if (status === "running") {
    return "生成中";
  }
  return "等待中";
}

function inferKind(name = "") {
  if (name.includes("枪") || name.includes("剑") || name.includes("机械") || name.includes("匣")) return "prop";
  if (name.includes("桥") || name.includes("墙") || name.includes("塔") || name.includes("地")) return "scene";
  return "character";
}

function matchesAssetQuery(asset, query) {
  const haystacks = [asset?.name, asset?.description, asset?.kind]
    .map((item) => String(item ?? "").toLowerCase())
    .filter(Boolean);
  return haystacks.some((item) => item.includes(query));
}

export function renderEpisodeAssetCardForTest(asset, assetKind = "character") {
  return renderAssetCard(asset, assetKind, false, false);
}
