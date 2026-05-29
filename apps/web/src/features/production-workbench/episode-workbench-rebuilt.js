import { normalizeStoryboardIndices } from "./storyboard-state.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";

const MEDIA_TABS = [
  { id: "image", label: "做图片" },
  { id: "video", label: "做视频" },
  { id: "lip-sync", label: "对口型" },
];

const ASSET_TABS = [
  { id: "character", label: "角色" },
  { id: "scene", label: "场景" },
  { id: "prop", label: "道具" },
];

export const EPISODE_WORKBENCH_FALLBACK_ASSET_IDS = [];

const IMAGE_MODELS = [
  { id: "tnb-pro", label: "nano banana 2（链路G）" },
  { id: "jimeng-4-5", label: "gpt image 2（链路G）" },
];

const VIDEO_MODELS = [
  { id: "vidu-q3-pro", label: "Vidu Q3 Pro" },
  { id: "hailuo-2-0", label: "海螺 2.0" },
  { id: "seedance-2-0-vip", label: "SeeDance 2.0 VIP" },
  { id: "happy-horse", label: "Happy Horse" },
];

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
  episodeWorkbenchSelectedAttachmentIds = [],
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "tnb-pro",
  prompt = "",
  busy = false,
  canGenerateImages = true,
  canGenerateVideos = true,
  validationMessage = "",
  mediaMode = "image",
  generationControls = {},
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
  episodeBatchModal = null,
} = {}) {
  const scopeMode = generationUiState.museScopeMode ?? "storyboard";
  const boardMode = generationUiState.museBoardMode ?? "operation";
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
  const isAllSelected =
    allAssetIds.length > 0 && allAssetIds.every((id) => selectedEpisodeAssetIds.includes(id));
  const canGenerateCurrentMode =
    mediaMode === "video" || mediaMode === "lip-sync"
      ? canGenerateVideos
      : canGenerateImages;
  const quickAssets = [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].slice(0, 18);
  const normalizedAssetSearchQuery = String(assetSearchQuery ?? "").trim().toLowerCase();
  const filteredQuickAssets = normalizedAssetSearchQuery
    ? quickAssets.filter((asset) => matchesAssetQuery(asset, normalizedAssetSearchQuery))
    : quickAssets;

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
          <button class="episode-replica-pill ${isAllSelected ? "active" : ""}" type="button" data-action="toggle-episode-asset-select-all">全选</button>
          <button class="episode-replica-pill wide" type="button" data-action="open-episode-batch-actions">批量生图/视频 | 高清处理</button>
        </div>
        <div class="episode-replica-topbar-right">
          <div class="episode-replica-main-switch">
            <button class="${scopeMode === "assets" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="assets">角色/场景</button>
            <button class="${scopeMode === "storyboard" ? "active" : ""}" type="button" data-action="set-muse-scope-mode" data-mode="storyboard">分镜</button>
          </div>
          <button class="episode-replica-export" type="button" data-action="preview-export">导出</button>
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
              : renderStoryboardWorkspace(normalizedStoryboards, currentStoryboard, boardMode)
          }
        </section>

        <section class="episode-replica-center">
          <div class="episode-replica-stage-head">
            <div class="episode-replica-stage-tabs">
              ${MEDIA_TABS.map((tab) => renderMediaTab(tab, mediaMode)).join("")}
            </div>
            <p class="episode-replica-stage-title">${
              scopeMode === "storyboard"
                ? `分镜：${escapeHtml(currentStoryboard?.title ?? "")}`
                : `${escapeHtml(resolveAssetLabel(activeAssetTab))}：${escapeHtml(selectedAsset?.name ?? "")}`
            }</p>
          </div>
          <div class="episode-replica-stage-body">
            ${
              scopeMode === "storyboard"
                ? renderStoryboardStage(currentStoryboard, mediaMode === "lip-sync" ? "video" : mediaMode, imageGenerationResult, videoGenerationResult)
                : renderAssetPreview(selectedAsset, activeAssetTab)
            }
          </div>
          ${renderPromptDock({
            selectedStoryboard: currentStoryboard,
            selectedAsset,
            selectedModelId,
            prompt,
            busy,
            canGenerateCurrentMode,
            validationMessage,
            generationControls,
            generationUiState,
            mediaMode,
            attachments: episodeWorkbenchAttachments,
            selectedAttachmentIds: episodeWorkbenchSelectedAttachmentIds,
            generationPollingActive,
          })}
        </section>

        <aside class="episode-replica-right">
          <div class="episode-replica-right-head">
            <strong>资产快捷栏</strong>
            <span>⌘</span>
          </div>
          <label class="episode-replica-right-search">
            <input
              type="search"
              value="${escapeAttr(assetSearchQuery ?? "")}"
              placeholder="搜索资产快捷引用"
              data-action="episode-asset-search"
            />
          </label>
          <div class="episode-replica-right-list">
            ${
              filteredQuickAssets.length
                ? filteredQuickAssets.map((asset) => renderQuickAsset(asset, asset.id === selectedEpisodeAssetId)).join("")
                : '<div class="episode-replica-right-empty">没有匹配到可快捷引用的资产。</div>'
            }
          </div>
        </aside>
      </div>

      ${renderEpisodeExportPreview(exportPreviewResult)}
      ${renderEpisodeBatchModal(episodeBatchModal)}
      ${renderStoryboardDescriptionModal({
        show: isStoryboardDescriptionModalOpen,
        value: storyboardDescriptionDraft,
        selectedStoryboard: currentStoryboard,
      })}
      ${renderSimpleDeleteModal(Boolean(storyboardDeleteTarget), "确认删除当前分镜吗？", "close-delete-storyboard-modal", "confirm-delete-storyboard")}
      ${renderSimpleDeleteModal(Boolean(storyboardImageDeleteTarget?.storyboardId && storyboardImageDeleteTarget?.imageId), "确认删除当前图片吗？", "close-delete-storyboard-image-modal", "confirm-delete-storyboard-image")}
      ${renderSimpleDeleteModal(Boolean(storyboardVideoDeleteTarget?.storyboardId && storyboardVideoDeleteTarget?.videoId), "确认删除当前视频吗？", "close-delete-storyboard-video-modal", "confirm-delete-storyboard-video")}
      ${renderEpisodeAssetCreateModal(episodeAssetCreateModal)}
      ${renderEpisodeVoiceModal(episodeVoiceModal)}
      ${renderAssetInspectorModal(assetInspector)}
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
        ${ASSET_TABS.map((tab) => `
          <section
            class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode ${tab.id === activeAssetTab ? "is-active" : ""}"
            data-asset-section="${escapeAttr(tab.id)}"
          >
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${
                (groups[tab.id] ?? []).length
                  ? (groups[tab.id] ?? []).map((asset, index) =>
                      renderAssetCard(
                        asset,
                        tab.id,
                        asset.id === selectedEpisodeCardId ||
                          (!selectedEpisodeCardId && tab.id === activeAssetTab && index === 0),
                        selectedEpisodeAssetIds.includes(asset.id),
                      ),
                    ).join("")
                  : `<article class="episode-replica-asset-empty">
                      <strong>暂无${escapeHtml(tab.label)}资产</strong>
                      <span>可先手动添加，或从资产库选取后再生成固定图。</span>
                    </article>`
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
  const title = assetKind === "scene" ? "编辑场景" : assetKind === "prop" ? "编辑道具" : "编辑角色";
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
          <span class="title">${escapeHtml(title)}</span>
        </button>
      </div>
      <span class="toolbar">+</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}设定</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}描述</span>
      <span class="preview">${renderAssetPreviewVisual(asset, assetKind)}</span>
      ${assetKind === "character" ? `<button class="voice" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "角色")}" data-asset-kind="${escapeAttr(assetKind)}">${escapeHtml(asset?.voiceName ?? "+ 配音员")}</button>` : ""}
      <label class="episode-replica-asset-desc-wrap">
        <textarea class="episode-replica-asset-desc-input" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-kind="${escapeAttr(assetKind)}" placeholder="可以编辑，点击框外后自动保存">${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / 800</span>
    </article>
  `;
}

function renderStoryboardWorkspace(storyboards, selectedStoryboard, boardMode) {
  return `
    <div class="episode-replica-storyboard-toolbar">
      <div class="episode-replica-storyboard-board-tabs">
        <button class="${boardMode === "operation" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="operation">操作栏</button>
        <button class="${boardMode === "story" ? "active" : ""}" type="button" data-action="set-muse-board-mode" data-mode="story">故事栏</button>
      </div>
      <button class="episode-replica-add-shot" type="button" data-action="add-storyboard">+</button>
    </div>
    <div class="episode-replica-storyboard-grid">
      ${
        boardMode === "story"
          ? renderStoryBoardPreview(selectedStoryboard)
          : storyboards.length
            ? storyboards.map((storyboard, index) => renderStoryboardCard(storyboard, storyboard.id === selectedStoryboard?.id || (!selectedStoryboard && index === 0))).join("")
            : `<article class="episode-replica-storyboard-empty">
                <strong>当前剧集还没有分镜</strong>
                <span>先创建分镜或从项目脚本拆分镜头，再进入生成流程。</span>
              </article>`
      }
    </div>
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

function renderStoryboardCard(storyboard, active) {
  const desc = String(storyboard.description ?? "").trim() || "请填写分镜描述，记录分镜对应的画面内容。";
  const refs = (storyboard.references ?? []).slice(0, 6);
  const previewVideo = resolveSelectedVideoSource(storyboard);
  const previewImage = resolveSelectedImageSource(storyboard);
  return `
    <button class="episode-replica-shot-card ${active ? "active" : ""}" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(storyboard.id)}">
      <span class="pick"></span>
      <span class="episode-replica-shot-card-head">
        <strong class="title">分镜 ${escapeHtml(String(storyboard.index ?? 1))}: ${escapeHtml(storyboard.title ?? "")}</strong>
      </span>
      <span class="episode-replica-shot-card-body">
        <span class="episode-replica-shot-card-column assets">
          <span class="meta">角色 / 场景 / 道具</span>
          <span class="asset-preview">${renderStoryboardPreviewThumb(refs)}</span>
        </span>
        <span class="episode-replica-shot-card-column copy">
          <span class="episode-replica-shot-copy-head">
            <span class="tabs">做图片 / 做视频</span>
            <span class="comment">●</span>
          </span>
          <span class="desc">${escapeHtml(desc)}</span>
          <span class="count">${[...desc].length} / 3000</span>
        </span>
        <span class="episode-replica-shot-card-column preview-column">
          <span class="episode-replica-shot-preview-head">
            <span class="preview-title">分镜剧情</span>
            <span class="edit">编辑分镜</span>
          </span>
          <span class="preview">${renderStoryboardMediaThumb(storyboard, previewVideo, previewImage, refs)}</span>
        </span>
      </span>
    </button>
  `;
}

function renderStoryboardMediaThumb(storyboard, previewVideo, previewImage, refs) {
  if (previewVideo) {
    const thumbnail =
      storyboard?.previewThumbnailUrl ??
      storyboard?.uploadedVideos?.find((item) => item.src === previewVideo)?.thumbnailSrc ??
      "";
    return `<span class="episode-replica-shot-media-thumb has-video-preview active">${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="" />` : ""}<i>▶</i></span>`;
  }
  if (previewImage) {
    return `<span class="episode-replica-shot-media-thumb has-image-preview active"><img src="${escapeAttr(previewImage)}" alt="" /></span>`;
  }
  return renderStoryboardPreviewThumb(refs);
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

function renderQuickAsset(asset, active) {
  return `
    <button class="episode-replica-quick-asset ${active ? "active" : ""}" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset.id ?? "")}" data-asset-kind="${escapeAttr(asset.kind || inferKind(asset.name))}" title="${escapeAttr(asset.name ?? "素材")}">
      <span class="thumb">${renderQuickPlaceholder(asset.kind || inferKind(asset.name), asset.name ?? "素材")}</span>
      <span class="episode-replica-quick-copy">
        <strong>${escapeHtml(asset.name ?? "素材")}</strong>
        <small>${escapeHtml(resolveAssetLabel(asset.kind || inferKind(asset.name)))}</small>
      </span>
    </button>
  `;
}

function renderStoryboardStage(selectedStoryboard, currentMode, imageGenerationResult, videoGenerationResult) {
  if (currentMode === "video") {
    return renderGeneratedStage(selectedStoryboard, true, videoGenerationResult);
  }
  return renderGeneratedStage(selectedStoryboard, false, imageGenerationResult);
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
  return `
    <div class="episode-replica-generated-stage visible">
      <div class="episode-replica-stage-actions">
        <button type="button" data-action="episode-result-action" data-result-action="edit" data-media-kind="${isVideo ? "video" : "image"}">重新编辑</button>
        ${isVideo ? `<button type="button" data-action="episode-result-action" data-result-action="set-storyboard-video" data-media-kind="video">设为分镜视频</button>` : ""}
        <button type="button" data-action="episode-result-action" data-result-action="download" data-media-kind="${isVideo ? "video" : "image"}">下载</button>
        <button type="button" data-action="episode-result-action" data-result-action="delete" data-media-kind="${isVideo ? "video" : "image"}">删除</button>
      </div>
      ${renderResultPanel(selectedStoryboard, generationResult, quickReferenceItems, attachmentItems)}
      ${isVideo ? "" : renderFixedImageResults(generationResult)}
    </div>
  `;
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
  const promptPreview = truncateDisplayText(
    generationResult?.promptPreview ??
      selectedStoryboard?.generationState?.lastSubmission?.promptPreview ??
      selectedStoryboard?.description ??
      "",
    140,
  );
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
  return `
    <article class="episode-replica-result-panel visible">
      <div class="copy message">${escapeHtml(promptPreview)}</div>
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
      <time>${escapeHtml(String(createdAt))}</time>
    </article>
  `;
}

function renderFixedImageResults(generationResult) {
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
        <button type="button" data-action="episode-fixed-result-action" data-result-action="edit">重新编辑</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="text-to-image">文字改图</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="set-character">设为角色图</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="paint">画笔</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="panorama">全景</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="download">下载</button>
        <button type="button" data-action="episode-fixed-result-action" data-result-action="delete">删除</button>
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
    "vidu-q3-pro": "Vidu Q3 Pro",
    "jimeng-4-5": "gpt image 2（链路G）",
    "tnb-pro": "nano banana 2（链路G）",
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

function renderPromptDock({
  selectedStoryboard,
  selectedAsset,
  selectedModelId,
  prompt,
  busy,
  canGenerateCurrentMode = true,
  validationMessage,
  generationControls,
  generationUiState,
  mediaMode,
  attachments = [],
  selectedAttachmentIds = [],
  generationPollingActive = false,
}) {
  const supportsAudioUpload = mediaMode === "video" || mediaMode === "lip-sync";
  const promptValue =
    prompt ||
    selectedStoryboard?.description ||
    selectedAsset?.description ||
    "请输入画面内容、镜头运动和角色状态。";
  const quickReferenceItems = selectedStoryboard?.generationState?.quickReferenceItems ?? [];
  const generationAttachmentCards = buildGenerationAttachmentCards(selectedStoryboard?.generationState);
  const aspectRatio = generationControls.imageAspectRatio ?? "16:9";
  const resolution = generationControls.imageResolution ?? "2K";
  const duration = generationControls.videoDurationSec ?? "5";
  const uploadLimits = generationControls.uploadLimits ?? {};
  const activePromptMenu = generationUiState.musePromptMenu ?? null;
  const openGenerationSelectMenu = generationUiState.openGenerationSelectMenu ?? null;
  const isVideoMode = mediaMode === "video" || mediaMode === "lip-sync";
  const models = isVideoMode ? VIDEO_MODELS : IMAGE_MODELS;
  const selectedModel = models.find((item) => item.id === selectedModelId) ?? models[0];
  const attachmentCards = [...generationAttachmentCards, ...(attachments ?? [])].map((item, index) =>
    renderAttachment(item, index, selectedAttachmentIds.includes(item.id)),
  );
  const generateAction =
    mediaMode === "video" || mediaMode === "lip-sync" ? "generate-videos" : "generate-images";

  return `
    <section class="episode-replica-prompt">
      <div class="episode-replica-ref-strip">
        ${quickReferenceItems.map((item) => renderQuickReferenceItem(item)).join("")}
        ${attachmentCards.join("")}
        ${
          supportsAudioUpload
            ? '<button class="episode-replica-ref-card voice uploadable" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="audio"><span>+</span><strong>音频</strong></button>'
            : ""
        }
        <button class="episode-replica-upload-card" type="button" data-action="open-episode-workbench-attachment-picker" data-attachment-type="image">
          <span>+</span><strong>图片</strong>
        </button>
        <input class="episode-workbench-attachment-input" data-attachment-type="image" type="file" accept="image/*" hidden />
        ${supportsAudioUpload ? '<input class="episode-workbench-attachment-input" data-attachment-type="audio" type="file" accept="audio/*" hidden />' : ""}
      </div>
      ${renderUploadLimitHint(uploadLimits, supportsAudioUpload)}
      <div class="episode-replica-prompt-tools">
        ${renderMiniMenu("references", "多参考图", activePromptMenu, [["multi", "多参考图"], ["single", "文生图"], ["rewrite", "文字改图"]])}
        ${renderMiniMenu("preset", "预设：无预设", activePromptMenu, [["none", "无预设"]], "select-muse-preset")}
        <button class="episode-replica-mini" type="button" data-action="quick-append-selected-asset">快捷引用</button>
      </div>
      <label class="episode-replica-textarea">
        <textarea id="video-prompt-input" placeholder="输入生成提示词">${escapeHtml(promptValue)}</textarea>
        <span class="magic">AI</span>
        <em>${[...promptValue].length} / 5000</em>
      </label>
      <div class="episode-replica-prompt-footer">
        <div class="episode-replica-prompt-selects">
          ${renderControlMenu("model", selectedModel.label, openGenerationSelectMenu, models.map((item) => [item.id, item.label]), "select-video-model")}
          ${renderControlMenu("imageAspectRatio", aspectRatio, openGenerationSelectMenu, [["16:9", "16:9"], ["9:16", "9:16"], ["1:1", "1:1"]])}
          ${renderControlMenu("imageResolution", resolution, openGenerationSelectMenu, [["720p", "720p"], ["1K", "1K"], ["2K", "2K"]])}
          ${isVideoMode ? renderControlMenu("videoDurationSec", `${duration}秒`, openGenerationSelectMenu, [["5", "5秒"], ["10", "10秒"], ["15", "15秒"]]) : ""}
        </div>
        <button class="episode-replica-generate" type="button" data-action="${generateAction}" ${disabled(busy || !canGenerateCurrentMode)}>
          <span>${escapeHtml(String(resolveGenerateCost(mediaMode, generationControls)))}</span>
          <strong class="episode-replica-generate-label">${generationPollingActive ? "生成中" : "生成"}</strong>
        </button>
      </div>
      <p class="episode-replica-validation">${escapeHtml(validationMessage)}</p>
    </section>
  `;
}

function renderCurrentStoryboardMediaStage(selectedStoryboard, isVideo) {
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
  if (generationState?.firstFrame) {
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
  const image = uploadLimits.image ?? {};
  const video = uploadLimits.video ?? {};
  const audio = uploadLimits.audio ?? {};
  const parts = [];
  if (image.maxBytes) {
    parts.push(`图片 ${formatLimitBytes(image.maxBytes)}`);
  }
  if (video.maxBytes) {
    parts.push(`视频 ${formatLimitBytes(video.maxBytes)}`);
  }
  if (supportsAudioUpload && audio.maxBytes) {
    parts.push(`音频 ${formatLimitBytes(audio.maxBytes)}`);
  }
  if (image.maxReferencesPerTask) {
    parts.push(`最多 ${image.maxReferencesPerTask} 张参考图`);
  }
  if (!parts.length) {
    return "";
  }
  return `<p class="episode-replica-upload-limits">${escapeHtml(parts.join(" · "))}</p>`;
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
  const signedUrl =
    exportPreviewResult?.platform?.signedUrl ??
    exportPreviewResult?.export?.signedUrl ??
    exportPreviewResult?.export?.url ??
    "";
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
          : ""
      }
    </section>
  `;
}

function renderAttachment(item, index, selected) {
  return `
    <article class="episode-replica-ref-card attachment ${escapeAttr(item.type ?? "image")} ${selected ? "selected" : ""}" data-action="toggle-episode-workbench-attachment-selection" data-attachment-id="${escapeAttr(item.id ?? "")}">
      <button class="episode-replica-ref-remove" type="button" data-action="remove-episode-workbench-attachment" data-attachment-id="${escapeAttr(item.id ?? "")}">×</button>
      <span class="episode-replica-ref-art ${escapeAttr(item.type ?? "image")}">${item.type === "audio" ? "<i>♫</i>" : renderQuickPlaceholder("image", item.name ?? "图片")}</span>
      <strong>${escapeHtml(item.type === "audio" ? `音频 ${index + 1}` : item.name ?? `图片 ${index + 1}`)}</strong>
    </article>
  `;
}

function renderQuickReferenceItem(item) {
  const previewUrl = resolveReferencePreview(item);
  const summary = truncateDisplayText(item.description ?? item.name ?? "", 100);
  const previewMarkup = typeof item?.previewMarkup === "string" ? item.previewMarkup.trim() : "";
  return `
    <article class="episode-replica-ref-card quick-reference" title="${escapeAttr(item.description ?? item.name ?? "")}">
      <button class="episode-replica-ref-remove" type="button" data-action="remove-quick-reference" data-reference-id="${escapeAttr(item.id ?? "")}">×</button>
      <span class="episode-replica-ref-art ${escapeAttr(item.kind ?? "image")}">
        ${previewUrl
          ? `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(item.name ?? "reference")}" />`
          : previewMarkup || renderQuickPlaceholder(item.kind || inferKind(item.name), item.name ?? "reference")}
      </span>
      <strong>${escapeHtml(item.name ?? "引用素材")}</strong>
      <small>${escapeHtml(summary)}</small>
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

function renderControlMenu(field, label, openMenu, options, action = "select-generation-field-option") {
  const open = openMenu === field;
  return `
    <span class="episode-replica-control-wrap">
      <button class="episode-replica-control" type="button" data-action="toggle-generation-select-menu" data-field="${escapeAttr(field)}">${escapeHtml(label)}</button>
      ${open ? `<span class="episode-replica-float-menu compact">${options.map(([value, text]) => `<button type="button" data-action="${escapeAttr(action)}" ${action === "select-video-model" ? `data-model-id="${escapeAttr(value)}" data-model-name="${escapeAttr(text)}"` : `data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}"`}>${escapeHtml(text)}</button>`).join("")}</span>` : ""}
    </span>
  `;
}

function renderMediaTab(tab, activeMode) {
  const isActive = tab.id === activeMode || (tab.id === "video" && activeMode === "lip-sync");
  return `<button class="episode-replica-stage-tab ${isActive ? "active" : ""}" type="button" data-action="set-episode-media-mode" data-mode="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>`;
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

function renderSimpleDeleteModal(show, text, closeAction, confirmAction) {
  if (!show) return "";
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
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
  const options = [
    "女声·甜妹",
    "女声·天真",
    "女声·温柔",
    "女声·甜美",
    "女声·知性",
    "男声·标准 1",
    "男声·沉稳",
    "男声·阳光",
    "女声·夸张",
  ];
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-voice-modal"></button>
      <div class="episode-voice-modal episode-voice-picker-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-voice-modal">×</button>
        <h3>选择配音</h3>
        <div class="episode-voice-tabs">
          ${tabs.map((tab) => `<button class="${modal.tab === tab.id ? "active" : ""}" type="button" data-action="set-episode-voice-tab" data-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>`).join("")}
        </div>
        <div class="episode-voice-grid">
          ${options.map((voice) => `
            <button
              class="episode-voice-card ${modal.voiceName === voice ? "active" : ""}"
              type="button"
              data-action="select-episode-voice"
              data-voice-name="${escapeAttr(voice)}"
            >
              <span class="episode-voice-avatar"></span>
              <strong>${escapeHtml(voice)}</strong>
            </button>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function resolveGenerateCost(mediaMode, generationControls = {}) {
  if (mediaMode === "video" || mediaMode === "lip-sync") {
    return Number(generationControls.videoCreditCost ?? 120);
  }
  const mode = generationControls.imageMode ?? generationControls.mode ?? null;
  if (mode === "multi-image") {
    return Number(generationControls.multiReferenceCreditCost ?? 50);
  }
  return Number(generationControls.imageCreditCost ?? 90);
}

function renderAssetInspectorModal(inspector) {
  if (!inspector) return "";
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
          ${isVideo ? `<video src="${escapeAttr(inspector.url ?? "")}" controls playsinline preload="metadata"></video>` : `<img src="${escapeAttr(inspector.url ?? "")}" alt="${escapeAttr(inspector.name ?? "素材")}" />`}
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
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-batch-modal"></button>
      <div class="episode-batch-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>批量生图</h2>
          <button class="modal-close" type="button" data-action="close-episode-batch-modal">×</button>
        </div>
        <p class="episode-batch-modal-copy">已选 ${modal.items?.length ?? 0} 项，以下内容将进入批量生图队列。</p>
        <div class="episode-batch-modal-list">
          ${(modal.items ?? []).map((item) => `
            <article class="episode-batch-modal-item">
              <span class="episode-batch-modal-thumb">${renderAssetPreviewVisual(item, item.kind || "character")}</span>
              <div class="episode-batch-modal-meta">
                <strong>${escapeHtml(item.name ?? "素材")}</strong>
                <span>${escapeHtml(resolveAssetLabel(item.kind || "character"))}</span>
              </div>
            </article>
          `).join("")}
        </div>
        <div class="single-episode-actions storyboard-description-actions">
          <button class="primary-action compact" type="button" data-action="close-episode-batch-modal">确认</button>
        </div>
      </div>
    </section>
  `;
}

function resolveAssetLabel(tab) {
  return ASSET_TABS.find((item) => item.id === tab)?.label ?? "素材";
}

function renderAssetPreviewVisual(asset, kind) {
  const previewUrl = resolveReferencePreview(asset);
  if (previewUrl) {
    return `<img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(asset?.name ?? "asset")}" />`;
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
  return `
    <span class="episode-replica-shot-preview-art">
      ${refs.slice(0, 4).map((item) => `<span>${renderQuickPlaceholder(item.kind || inferKind(item.name), item.name)}</span>`).join("")}
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
    item?.preview,
    item?.previewUrl,
    item?.publicUrl,
    item?.coverImageUrl,
    item?.src,
    item?.imageUrl,
    item?.url,
  ];
  return candidates.find((candidate) => typeof candidate === "string" && candidate.trim()) ?? "";
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
