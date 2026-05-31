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

const FALLBACK_ASSETS = {
  character: [
    { id: "mock-character-1", name: "李右", description: "黑发青年主角，红黑外套，正面、半身与转身状态统一。", preview: "" },
    { id: "mock-character-2", name: "灰雀羽毛", description: "灰白羽毛元素，用于特写镜头和落地动态补充。", preview: "" },
    { id: "mock-character-3", name: "白野", description: "冷淡坚韧的废土行者，站姿稳定，适合主镜头反打。", preview: "" },
    { id: "mock-character-4", name: "食人花树", description: "扭曲异植，树干带巨口，根须向外扩张形成压迫感。", preview: "" },
    { id: "mock-character-5", name: "机械四肢", description: "军用损毁机械腿部与臂部部件，用于残骸飞散镜头。", preview: "" },
    { id: "mock-character-6", name: "制式步枪", description: "冷灰长枪，枪身带磨损感，适合战损风格近景。", preview: "" },
  ],
  scene: [
    { id: "mock-scene-1", name: "黑山密林吞噬区", description: "潮湿、压抑、带腐蚀气雾的异植森林。", preview: "" },
    { id: "mock-scene-2", name: "午午腐蚀暗影", description: "高反差阴影和绿色冷光共存，适合爆炸后背光。", preview: "" },
    { id: "mock-scene-3", name: "断根裂地", description: "树根断裂、藤蔓抽打、地面尘屑飞散的动作区域。", preview: "" },
    { id: "mock-scene-4", name: "爆炸烟柱", description: "亮橙火团与黑灰烟尘向外翻卷，增强冲击层次。", preview: "" },
  ],
  prop: [
    { id: "mock-prop-1", name: "制式步枪", description: "长枪轮廓利落，适合角色持枪近景。", preview: "" },
    { id: "mock-prop-2", name: "子弹", description: "黄铜弹药与黑色弹头组合，用于道具特写。", preview: "" },
    { id: "mock-prop-3", name: "包扎物", description: "旧医疗绷带和破布包，用于废土感补强。", preview: "" },
    { id: "mock-prop-4", name: "金属残片", description: "爆炸后飞散的机械碎片，增强动作信息量。", preview: "" },
  ],
};

export const EPISODE_WORKBENCH_FALLBACK_ASSET_IDS = Object.values(FALLBACK_ASSETS)
  .flat()
  .map((item) => item.id);

const FALLBACK_QUICK_ASSETS = [
  { id: "quick-1", name: "李右/破...", kind: "character" },
  { id: "quick-2", name: "灰雀羽毛...", kind: "character" },
  { id: "quick-3", name: "制式步枪", kind: "prop" },
  { id: "quick-4", name: "包扎物", kind: "prop" },
  { id: "quick-5", name: "白野", kind: "character" },
  { id: "quick-6", name: "子弹/制...", kind: "prop" },
  { id: "quick-7", name: "黑山密林...", kind: "scene" },
];

const FALLBACK_STORYBOARDS = [
  {
    id: "mock-board-1",
    index: 1,
    title: "白野用机械腿引爆食人花树，爆炸后转身立威",
    description:
      "故事发生场景：（黑山密林吞噬区/正午腐蚀暗影） 分镜过渡（00:00-00:01）：镜头1（00:01-00:04）：视觉：白野站在断根与腐叶之间，右臂后摆蓄力，将机械腿残骸猛地掷向前方的食人花树。",
    references: FALLBACK_QUICK_ASSETS.slice(0, 5),
  },
];

export function renderEpisodeWorkbench({
  storyboards = [],
  selectedStoryboard = null,
  assetLibrary = {},
  activeAssetTab = "character",
  selectedEpisodeAssetId = null,
  selectedEpisodeAssetIds = [],
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "vidu-q3-pro",
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
} = {}) {
  const scopeMode = generationUiState.museScopeMode ?? "assets";
  const boardMode = generationUiState.museBoardMode ?? "operation";
  const assetGroups = {
    character: assetLibrary.character ?? [],
    scene: assetLibrary.scene ?? [],
    prop: assetLibrary.prop ?? [],
  };
  const activeAssets = (assetGroups[activeAssetTab] ?? []).length
    ? assetGroups[activeAssetTab]
    : FALLBACK_ASSETS[activeAssetTab] ?? [];
  const normalizedStoryboards = storyboards.length
    ? normalizeStoryboardIndices(storyboards)
    : FALLBACK_STORYBOARDS;
  const currentStoryboard =
    normalizedStoryboards.find((item) => item.id === selectedStoryboard?.id) ??
    normalizedStoryboards[0] ??
    null;
  const selectedAsset =
    activeAssets.find((item) => item.id === selectedEpisodeAssetId) ??
    activeAssets[0] ??
    null;
  const quickAssets = [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].length
    ? [...assetGroups.character, ...assetGroups.scene, ...assetGroups.prop].slice(0, 12)
    : FALLBACK_QUICK_ASSETS;
  const allAssetIds = [
    ...(assetGroups.character.length ? assetGroups.character : FALLBACK_ASSETS.character),
    ...(assetGroups.scene.length ? assetGroups.scene : FALLBACK_ASSETS.scene),
    ...(assetGroups.prop.length ? assetGroups.prop : FALLBACK_ASSETS.prop),
  ].map((item) => item.id);
  const isAllSelected =
    allAssetIds.length > 0 && allAssetIds.every((id) => selectedEpisodeAssetIds.includes(id));
  const canGenerateCurrentMode =
    mediaMode === "video" || mediaMode === "lip-sync"
      ? canGenerateVideos
      : canGenerateImages;
  const imageDeleteTargetStoryboard =
    normalizedStoryboards.find((item) => item.id === storyboardImageDeleteTarget?.storyboardId) ?? null;
  const imageDeleteTarget =
    (imageDeleteTargetStoryboard?.uploadedImages ?? []).find((item) => item.id === storyboardImageDeleteTarget?.imageId) ?? null;
  const videoDeleteTargetStoryboard =
    normalizedStoryboards.find((item) => item.id === storyboardVideoDeleteTarget?.storyboardId) ?? null;
  const videoDeleteTarget =
    (videoDeleteTargetStoryboard?.uploadedVideos ?? []).find((item) => item.id === storyboardVideoDeleteTarget?.videoId) ?? null;

  return `
    <section id="storyboard-workbench" class="storyboard-workbench cinematic-layout" aria-label="分镜工作台">
      <button
        class="episode-workbench-back-button"
        type="button"
        data-action="back-to-episode-hub"
        aria-label="返回上一页"
      >
        <span>返回</span>
      </button>

      <button
        class="shot-sidebar-hero"
        type="button"
        data-action="parse-script"
        ${disabled(!canParse || busy)}
      >
        <span class="shot-sidebar-hero-icon" aria-hidden="true">↳</span>
        <strong>AI拆分镜</strong>
        <em>首次免费</em>
      </button>

      <header class="episode-media-header">
        <div class="episode-media-chrome">
          <div class="episode-media-tabs" role="tablist" aria-label="媒体类型">
            ${MEDIA_TABS.map((tab) => renderMediaTab(tab, mediaMode)).join("")}
          </div>
        </div>
      </header>

      <aside class="shot-sidebar cinematic-sidebar">
        <div class="shot-sidebar-head">
          <span>分镜(${storyboards.length})</span>
        </div>
        <div class="shot-stack">
          ${renderStoryboardList(storyboards, selectedStoryboard?.id)}
        </div>
      </aside>

      <section class="shot-stage cinematic-stage">
        <div class="shot-stage-head cinematic-stage-head">
          <strong>分镜描述：${escapeHtml(selectedStoryboard?.description ?? "请填写分镜描述，记录分镜对应的画面内容。")}</strong>
          <button class="icon-button" type="button" data-action="open-storyboard-description-modal" aria-label="编辑描述">✎</button>
        </div>
        ${renderStoryboardStage(selectedStoryboard, mediaMode)}
      </section>

      ${renderVideoGenerationPanel({
        selectedModelId,
        prompt,
        busy,
        selectedShot: selectedStoryboard,
        canCalibrate,
        canGenerateImages,
        canGenerateVideos,
        validationMessage,
        calibrationSkipReason,
        calibrationOverrideReason,
        imageGenerationResult,
        videoGenerationResult,
        mediaMode,
        videoMode,
        imageMode,
        generationControls,
        generationUiState,
      })}
      ${renderGenerationDiagnostics({ imageGenerationResult, videoGenerationResult })}
      ${renderStoryboardDescriptionModal({
        show: isStoryboardDescriptionModalOpen,
        value: storyboardDescriptionDraft,
        selectedStoryboard: currentStoryboard,
      })}
      ${renderStoryboardDeleteModal({
        show: Boolean(storyboardDeleteTarget),
        storyboard: normalizedStoryboards.find((item) => item.id === storyboardDeleteTarget) ?? null,
      })}
      ${renderStoryboardImageDeleteModal({
        show: Boolean(storyboardImageDeleteTarget?.storyboardId && storyboardImageDeleteTarget?.imageId),
        storyboard: imageDeleteTargetStoryboard,
        image: imageDeleteTarget,
      })}
      ${renderStoryboardVideoDeleteModal({
        show: Boolean(storyboardVideoDeleteTarget?.storyboardId && storyboardVideoDeleteTarget?.videoId),
        storyboard: videoDeleteTargetStoryboard,
        video: videoDeleteTarget,
      })}
      ${renderEpisodeAssetCreateModal(episodeAssetCreateModal)}
      ${renderEpisodeVoiceModal(episodeVoiceModal)}
      ${renderAssetInspectorModal(assetInspector)}
    </section>
  `;
}

function resolveAssetLabel(tab) {
  return ASSET_TABS.find((item) => item.id === tab)?.label ?? "素材";
}

function renderStoryboardList(storyboards, selectedStoryboardId) {
  const orderedStoryboards = normalizeStoryboardIndices(storyboards);
  const storyboardCards = orderedStoryboards.length
    ? orderedStoryboards
        .map((storyboard) => {
          const active = storyboard.id === selectedStoryboardId;
          const selectedUploadedVideo = resolveSelectedUploadedVideo(storyboard);
          const selectedVideoSource = selectedUploadedVideo?.src ?? "";
          const storyboardVideoSource = isVideoSource(storyboard.previewUrl) ? (storyboard.previewUrl ?? "") : "";
          const videoSource =
            storyboard.previewThumbnailUrl
              ? ""
              : selectedVideoSource || storyboardVideoSource;
          const thumbnailSource =
            storyboard.previewThumbnailUrl ??
            selectedUploadedVideo?.thumbnailSrc ??
            "";
          const fallbackPreviewUrl = isVideoSource(storyboard.previewUrl) ? "" : storyboard.previewUrl;
          const imageSource =
            !videoSource ? storyboard.previewImageUrl ?? fallbackPreviewUrl ?? "" : "";
          const previewSource = thumbnailSource || videoSource || imageSource;
          const previewIsVideo = Boolean(selectedVideoSource || storyboardVideoSource);
          const previewClass = previewSource
            ? previewIsVideo
              ? "has-video-preview"
              : "has-image-preview"
            : "empty-preview";
          return `
            <div class="shot-thumb-shell">
              <button
                class="shot-thumb cinematic-thumb ${previewClass} ${active ? "active" : ""}"
                type="button"
                data-action="select-storyboard"
                data-storyboard-id="${escapeAttr(storyboard.id)}"
              >
                <span>${escapeHtml(String(storyboard.index ?? ""))}</span>
                <strong>${escapeHtml(storyboard.status ?? "未定稿")}</strong>
                <em aria-hidden="true">${escapeHtml(storyboard.title ?? `分镜 ${storyboard.index ?? ""}`)}</em>
                <div class="shot-thumb-preview" aria-hidden="true">
                  ${
                    previewSource
                      ? previewIsVideo
                        ? thumbnailSource
                          ? `<img src="${escapeAttr(thumbnailSource)}" alt="" /><i>▶</i>`
                          : `<video src="${escapeAttr(previewSource)}" muted playsinline preload="metadata"></video><i>▶</i>`
                        : `<img src="${escapeAttr(previewSource)}" alt="" />`
                      : `<div class="shot-thumb-placeholder"><span aria-hidden="true"></span></div>`
                  }
                </div>
              </button>
              <button
                class="shot-thumb-menu-button delete-storyboard-button"
                type="button"
                data-storyboard-id="${escapeAttr(storyboard.id)}"
                data-action="open-delete-sidebar-storyboard-modal"
                aria-label="删除分镜"
              >
                <span aria-hidden="true">🗑</span>
              </button>
            </div>
          `;
        })
        .join("")
    : `
      <div class="shot-thumb empty">
        <span>1</span>
        <strong>未定稿</strong>
        <em>空分镜</em>
      </div>
    `;

  return `
    ${storyboardCards}
    <button class="shot-thumb shot-add-card" type="button" data-action="add-storyboard">
      <span aria-hidden="true">+</span>
      <strong>添加分镜</strong>
    </button>
  `;
}

function renderStoryboardDeleteModal({ show, storyboard }) {
  if (!show) {
    return `
      <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除分镜" hidden>
        <button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard">确定</button>
      </section>
    `;
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除分镜">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>删除后会清空这个分镜下的图片和视频，确定删除${storyboard?.title ? `“分镜 ${escapeHtml(String(storyboard.title))}”` : "当前分镜"}吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-storyboard-modal" aria-label="关闭">×</button>
        </div>
        <div class="episode-replica-asset-actions">
          <button type="button" data-action="open-episode-asset-create-modal">手动添加</button>
          <button type="button" data-action="open-asset-import-modal" data-asset-kind="${escapeAttr(activeAssetTab)}">资产库选取</button>
        </div>
      </div>
      <div class="episode-replica-asset-sections">
        ${ASSET_TABS.map((tab) => `
          <section class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode" data-episode-asset-group="${escapeAttr(tab.id)}">
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${(liveGroups[tab.id] ?? []).map((asset, index) => renderAssetCard(
                asset,
                tab.id,
                tab.id === activeAssetTab && (asset.id === selectedAsset?.id || (!selectedAsset && index === 0)),
                selectedEpisodeAssetIds.includes(asset.id),
              )).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAssetCardLegacy(asset, assetKind, active, checked) {
  const desc = String(asset?.description ?? "").trim() || "";
  const title = assetKind === "scene" ? "编辑场景" : assetKind === "prop" ? "编辑道具" : "编辑角色";
  return `
    <article class="episode-replica-asset-card ${active ? "active" : ""} ${checked ? "checked" : ""}" data-asset-card="${escapeAttr(asset?.id ?? "")}">
      <button class="episode-replica-asset-select" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset?.id ?? "")}">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-episode-asset-selection" data-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="选择素材"></button>
        <strong class="name">${escapeHtml(asset?.name ?? "测试")}</strong>
        <span class="title">${escapeHtml(title)}</span>
      </button>
      <span class="toolbar">✦</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}固定</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}描述</span>
      <span class="preview">${renderPlaceholderArt(assetKind, asset?.name ?? "")}</span>
      ${assetKind === "character" ? `<button class="voice" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "角色")}">+ 配音员</button>` : ""}
      <label class="episode-replica-asset-desc-wrap">
        <textarea
          class="episode-replica-asset-desc-input"
          data-asset-id="${escapeAttr(asset?.id ?? "")}"
          data-asset-kind="${escapeAttr(assetKind)}"
          placeholder="可以编辑，点击框外后自动保存"
        >${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / 800</span>
    </article>
  `;
}

function renderStoryboardWorkspace(storyboards, selectedStoryboard, boardMode) {
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除图片">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>将从${storyboardName}中删除图片“${escapeHtml(String(imageName))}”，删除后不可恢复，确定继续吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-storyboard-image-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-image-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard-image">确定</button>
        </div>
      </div>
    </section>
  `;
}

function resolveSelectedUploadedVideo(storyboard) {
  const uploadedVideos = Array.isArray(storyboard?.uploadedVideos) ? storyboard.uploadedVideos : [];
  if (!uploadedVideos.length) {
    return null;
  }

  const readyVideos = uploadedVideos.filter((item) => item.status === "ready");
  return (
    readyVideos.find((item) => item.id === storyboard.selectedUploadedVideoId) ??
    readyVideos[0] ??
    null
  );
}

function resolvePinnedUploadedVideo(storyboard) {
  const uploadedVideos = Array.isArray(storyboard?.uploadedVideos) ? storyboard.uploadedVideos : [];
  if (!uploadedVideos.length || !storyboard?.selectedUploadedVideoId) {
    return null;
  }

  return (
    uploadedVideos.find(
      (item) => item.id === storyboard.selectedUploadedVideoId && item.status === "ready",
    ) ?? null
  );
}

function isProtectedStoryboardVideo(storyboardId, selectedVideoId, videoId) {
  return Boolean(storyboardId && videoId && selectedVideoId && selectedVideoId === videoId);
}

function isVideoSource(value) {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(String(value ?? ""));
}

function renderStoryboardStage(selectedStoryboard, mediaMode) {
  if (!selectedStoryboard) {
    return `
      <div class="stage-empty cinematic-stage-empty">
        <div class="empty-folder" aria-hidden="true"></div>
        <p>请先创建或选择分镜。</p>
      </div>
    `;
  }

  if (mediaMode === "video") {
    return renderVideoUploadWorkspace(selectedStoryboard);
  }

  if (selectedStoryboard.imageStatus === "uploading") {
    return renderStoryboardImageWorkspace(selectedStoryboard, false, "uploading");
  }

  if (selectedStoryboard.previewImageUrl) {
    return renderStoryboardImageWorkspace(selectedStoryboard, true);
  }

  if (selectedStoryboard.imageStatus === "ready") {
    return renderStageResult("分镜图片已生成", "image", selectedStoryboard.status);
  }

  return `
    <div class="stage-empty cinematic-stage-empty" data-dropzone="storyboard-image">
      <div class="empty-folder cinematic-folder" aria-hidden="true"></div>
      <p>请在右侧填写分镜信息生成分镜图。</p>
      <button
        class="stage-inline-link stage-inline-link-button"
        type="button"
        data-action="pick-local-storyboard-image"
        data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
      >
        本地上传分镜图
      </button>
    </div>
  `;
}

function renderStoryboardCard(storyboard, active) {
  const desc = String(storyboard.description ?? "").trim() || "这里是视频描述词";
  const refs = (storyboard.references ?? FALLBACK_QUICK_ASSETS).slice(0, 6);
  return `
    <button class="episode-replica-shot-card ${active ? "active" : ""}" type="button" data-action="select-storyboard" data-storyboard-id="${escapeAttr(storyboard.id)}">
      <span class="pick"></span>
      <strong class="title">分镜 ${escapeHtml(String(storyboard.index ?? 1))}: ${escapeHtml(storyboard.title ?? "")}</strong>
      <span class="meta">角色 / 场景 / 道具</span>
      <span class="tabs">做图片　做视频</span>
      <span class="desc">${escapeHtml(desc)}</span>
      <span class="count">${[...desc].length} / 3000</span>
      <span class="preview">${renderStoryboardPreviewThumb(refs)}</span>
      <span class="preview-title">分镜剧情</span>
      <span class="edit">编辑分镜</span>
    </button>
  `;
}

function renderAssetPreview(asset, activeAssetTab) {
  return `
    <div class="episode-replica-asset-preview">
      <div class="episode-replica-preview-card">
        <div class="episode-replica-preview-hero">${renderPlaceholderArt(activeAssetTab, asset?.name ?? "")}</div>
        <div class="episode-replica-preview-copy">
          <strong>${escapeHtml(asset?.name ?? "李右")}</strong>
          <p>${escapeHtml(asset?.description ?? "保留废土感和机械感，适合作为快速引用资产。")}</p>
        </div>
      </div>
    </article>
  `;
}

function renderStoryboardImageToolbar(storyboardId, imageId) {
  const tools = [
    { action: "download-storyboard-image", icon: "↓", label: "下载" },
    { action: "delete-storyboard-image", icon: "⌫", label: "删除", danger: true },
  ];

  return `
    <div class="stage-image-toolbar" role="toolbar" aria-label="分镜图片操作">
      ${tools
        .map(
          (tool) => `
            <button
              class="stage-image-tool ${tool.danger ? "danger" : ""}"
              type="button"
              data-action="${escapeAttr(tool.action)}"
              data-storyboard-id="${escapeAttr(storyboardId)}"
              data-image-id="${escapeAttr(imageId)}"
              aria-label="${escapeAttr(tool.label)}"
              title="${escapeAttr(tool.label)}"
            >
              <span class="stage-image-tool-icon" aria-hidden="true">${tool.icon}</span>
              <span class="stage-image-tool-label">${escapeHtml(tool.label)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderVideoUploadWorkspace(selectedStoryboard) {
  const uploadedVideos = Array.isArray(selectedStoryboard.uploadedVideos) ? selectedStoryboard.uploadedVideos : [];
  if (!uploadedVideos.length) {
    return `
      <div class="stage-empty cinematic-stage-empty cinematic-video-empty">
        <div class="empty-folder cinematic-folder" aria-hidden="true"></div>
        <p>请在右侧输入视频提示词生成分镜视频。</p>
        <div class="stage-empty-actions">
          <span>或</span>
          <button
            class="stage-inline-link stage-inline-link-button"
            type="button"
            data-action="pick-local-video-upload"
            data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          >
            本地上传视频
          </button>
        </div>
        <input
          class="local-video-upload-input"
          type="file"
          accept="video/*"
          multiple
          data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          hidden
        />
      </div>
    `;
  }

  const readyVideos = uploadedVideos.filter((item) => item.status === "ready");
  const featuredVideo = resolvePinnedUploadedVideo({
    ...selectedStoryboard,
    uploadedVideos: readyVideos,
  });
  return `
    <section class="stage-video-library" aria-label="本地视频库">
      <section class="stage-video-group">
        <header class="stage-video-group-head">
          <strong><span aria-hidden="true">▾</span> 定稿视频 (${featuredVideo ? 1 : 0})</strong>
          <button
            class="stage-upload-trigger"
            type="button"
            data-action="pick-local-video-upload"
            data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          >
            本地上传
          </button>
        </header>
        ${
          featuredVideo
            ? renderPinnedVideo(
                featuredVideo,
                selectedStoryboard.id,
              )
            : `<div class="stage-video-empty compact"><p>定稿素材支持单独导出、加入至时间线</p></div>`
        }
      </section>
      <section class="stage-video-group">
        <header class="stage-video-group-head">
          <strong><span aria-hidden="true">▾</span> 全部视频 (${uploadedVideos.length})</strong>
        </header>
        ${renderVideoGrid(uploadedVideos, selectedStoryboard.selectedUploadedVideoId, selectedStoryboard.id)}
      </section>
      <input
        class="local-video-upload-input"
        type="file"
        accept="video/*"
        multiple
        data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
        hidden
      />
    </section>
  `;
}

function renderFeaturedVideoPlayer(item, storyboardId, count) {
  if (!item?.src) {
    return `
      <section class="stage-video-feature empty">
        ${renderVideoSectionHeader("分镜视频", count)}
        <div class="stage-video-feature-placeholder">
          <p>视频已上传，正在准备预览。</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="stage-video-feature" aria-label="当前分镜视频">
      ${renderVideoSectionHeader("分镜视频", count)}
      <div class="stage-video-feature-player">
        <video
          src="${escapeAttr(item.src)}"
          ${item.thumbnailSrc ? `poster="${escapeAttr(item.thumbnailSrc)}"` : ""}
          controls
          playsinline
          preload="metadata"
        ></video>
        <span class="uploaded-video-duration">${escapeHtml(item.durationLabel ?? "00:10")}</span>
        <span class="uploaded-video-badge">当前视频</span>
      </div>
      <footer class="stage-video-feature-footer">
        <strong>${escapeHtml(item.fileName ?? "本地上传视频")}</strong>
        <button
          class="stage-upload-trigger"
          type="button"
          data-action="pick-local-video-upload"
          data-storyboard-id="${escapeAttr(storyboardId)}"
        >
          替换/继续上传
        </button>
      </footer>
    </section>
  `;
}

function renderVideoSectionHeader(label, count) {
  return `
    <header class="stage-video-group-head stage-video-upload-head">
      <strong>${escapeHtml(label)}</strong>
      <span>${count}</span>
    </header>
  `;
}

function renderVideoGrid(items, selectedVideoId, storyboardId) {
  return `
    <div class="stage-video-grid">
      ${items.map((item) => renderUploadedVideoCard(item, item.id === selectedVideoId, storyboardId)).join("")}
    </div>
  `;
}

function renderControlMenu(field, label, openMenu, options, action = "select-generation-field-option") {
  const open = openMenu === field;
  return `
    <article class="uploaded-video-card active pinned">
      <div class="uploaded-video-card-inner media">
        ${
          item.src
            ? `<video src="${escapeAttr(item.src)}" controls playsinline preload="metadata"></video>`
            : ""
        }
        <span class="uploaded-video-duration">${escapeHtml(item.durationLabel ?? "00:10")}</span>
        <span class="uploaded-video-badge">定稿</span>
        ${item.src ? renderStoryboardVideoToolbar(storyboardId, item.id, { canDelete: false }) : ""}
      </div>
      <div class="uploaded-video-card-actions">
        <button
          class="uploaded-video-primary-action"
          type="button"
          data-action="clear-selected-uploaded-video"
          data-storyboard-id="${escapeAttr(storyboardId)}"
        >
          取消定稿
        </button>
      </div>
    </article>
  `;
}

function renderStoryboardStage(selectedStoryboard, mediaMode) {
  if (mediaMode === "video") {
    return renderVideoStage(selectedStoryboard);
  }
  return renderImageStage(selectedStoryboard);
}

function renderImageStage(selectedStoryboard) {
  return `
    <article class="uploaded-video-card ${active ? "active" : ""}">
      <div class="uploaded-video-card-inner media">
        ${
          item.src
            ? `<video src="${escapeAttr(item.src)}" controls playsinline preload="metadata"></video>`
            : ""
        }
        <span class="uploaded-video-duration">${escapeHtml(item.durationLabel ?? "00:10")}</span>
        ${active ? `<span class="uploaded-video-badge">定稿</span>` : ""}
        ${
          item.src
            ? renderStoryboardVideoToolbar(storyboardId, item.id, {
                canDelete: !isProtectedStoryboardVideo(storyboardId, active ? item.id : null, item.id),
              })
            : ""
        }
      </div>
      <div class="uploaded-video-card-actions">
        <button
          class="uploaded-video-select"
          type="button"
          data-action="select-uploaded-video"
          data-video-id="${escapeAttr(item.id)}"
          data-storyboard-id="${escapeAttr(storyboardId ?? "")}"
          aria-label="选择视频"
        >${active ? "当前定稿" : "设为定稿"}</button>
      </div>
    </article>
  `;
}

function renderStoryboardVideoToolbar(storyboardId, videoId, options = {}) {
  const canDelete = options.canDelete ?? true;
  const tools = [{ action: "download-storyboard-video", icon: "↓", label: "下载" }];
  if (canDelete) {
    tools.push({ action: "delete-storyboard-video", icon: "⌫", label: "删除", danger: true });
  }

  return `
    <div class="stage-video-toolbar" role="toolbar" aria-label="分镜视频操作">
      ${tools
        .map(
          (tool) => `
            <button
              class="stage-video-tool ${tool.danger ? "danger" : ""}"
              type="button"
              data-action="${escapeAttr(tool.action)}"
              data-storyboard-id="${escapeAttr(storyboardId)}"
              data-video-id="${escapeAttr(videoId)}"
              aria-label="${escapeAttr(tool.label)}"
              title="${escapeAttr(tool.label)}"
            >
              <span class="stage-video-tool-icon" aria-hidden="true">${tool.icon}</span>
              <span class="stage-video-tool-label">${escapeHtml(tool.label)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderUploadingMediaShell() {
  return `
    <div class="uploading-media-shell" aria-live="polite">
      <span class="uploaded-video-spinner" aria-hidden="true"></span>
      <strong>上传中...</strong>
    </div>
  `;
}

function renderStageResult(title, kind, status) {
  return `
    <article class="stage-result ${kind}">
      <div class="result-frame">
        <span>${kind === "video" ? "▶" : "◀"}</span>
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p>状态：${escapeHtml(status)}</p>
    </article>
  `;
}

function renderGenerationDiagnostics({ imageGenerationResult, videoGenerationResult }) {
  const panels = [
    renderGenerationPanel("图片工作流", imageGenerationResult),
    renderGenerationPanel("视频工作流", videoGenerationResult),
  ].filter(Boolean);

  if (!panels.length) {
    return "";
  }

  return `
    <section class="generation-diagnostics" aria-label="Generation diagnostics">
      <header class="generation-diagnostics-head">
        <strong>工作流详情</strong>
        <span>任务、供应商和存储追踪</span>
      </header>
      <div class="generation-diagnostics-grid">${panels.join("")}</div>
    </section>
  `;
}

function renderGenerationPanel(label, result) {
  const platform = result?.platform;
  if (!platform) return "";
  const tasks = Array.isArray(platform.tasks) ? platform.tasks : [];
  return `
    <article class="generation-diagnostics-card">
      <header><strong>${escapeHtml(label)}</strong><span>workflow ${escapeHtml(platform.workflowId ?? "")}</span></header>
      <div class="generation-diagnostics-meta">
        <span>状态：${escapeHtml(platform.workflowStatus ?? "unknown")}</span>
        <span>任务数：${tasks.length}</span>
      </div>
      <ul class="generation-diagnostics-list">
        ${tasks
          .map(
            (task) => `
              <li>
                <strong>${escapeHtml(task.shotId ?? "")}</strong>
                <span>${escapeHtml(task.taskId ?? "")}</span>
                <small>${escapeHtml(task.providerRequestId ?? "")} / ${escapeHtml(task.storageObjectKey ?? "")}</small>
              </li>
            `,
          )
          .join("")}
      </ul>
    </article>
  `;
}

function renderStoryboardDescriptionModal({ show, value, selectedStoryboard }) {
  if (!show || !selectedStoryboard) return "";
  return `
    <section
      class="modal-backdrop storyboard-description-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="storyboard-description-dialog"
    >
      <button
        class="modal-backdrop-hit"
        type="button"
        data-action="close-storyboard-description-modal"
        aria-label="关闭分镜描述弹窗"
      ></button>
      <div class="single-episode-modal storyboard-description-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>分镜描述</h2>
          <button
            class="modal-close"
            type="button"
            data-action="close-storyboard-description-modal"
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        <label class="single-episode-field storyboard-description-field">
          <textarea
            id="storyboard-description-input"
            placeholder="请填写分镜描述，记录分镜对应的画面内容"
          >${escapeHtml(value ?? "")}</textarea>
        </label>
        <div class="single-episode-actions storyboard-description-actions">
          <button
            class="secondary-action compact"
            type="button"
            data-action="close-storyboard-description-modal"
          >
            取消
          </button>
          <button
            class="primary-action compact"
            type="button"
            data-action="save-storyboard-description"
          >
            确认修改
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderAssetInspectorModal(inspector) {
  if (!inspector) return "";
  const isVideo = inspector.type === "video";
  return `
    <section
      class="modal-backdrop storyboard-description-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="asset-inspector-dialog"
    >
      <button
        class="modal-backdrop-hit"
        type="button"
        data-action="close-asset-inspector"
        aria-label="关闭素材详情"
      ></button>
      <div class="single-episode-modal storyboard-description-modal asset-inspector-modal">
        <div class="single-episode-modal-head storyboard-description-head">
          <h2>${escapeHtml(inspector.title ?? (isVideo ? "视频详情" : "图片详情"))}</h2>
          <button class="modal-close" type="button" data-action="close-asset-inspector" aria-label="关闭">×</button>
        </div>
        <div class="asset-inspector-preview">
          ${
            isVideo
              ? `<video src="${escapeAttr(inspector.url ?? "")}" controls playsinline preload="metadata"></video>`
              : `<img src="${escapeAttr(inspector.url ?? "")}" alt="${escapeAttr(inspector.name ?? "素材")}" />`
          }
        </div>
        <div class="asset-inspector-meta">
          <strong>${escapeHtml(inspector.name ?? "未命名素材")}</strong>
          <span>状态：${escapeHtml(inspector.status ?? "ready")}</span>
          ${isVideo ? `<span>时长：${escapeHtml(inspector.durationLabel ?? "00:10")}</span>` : ""}
        </div>
        <div class="single-episode-actions storyboard-description-actions">
          <button class="primary-action compact" type="button" data-action="close-asset-inspector">关闭</button>
        </div>
      </div>
      <div class="episode-replica-asset-sections">
        ${ASSET_TABS.map((tab) => `
          <section class="episode-replica-asset-section ${escapeAttr(tab.id)}-mode" data-episode-asset-group="${escapeAttr(tab.id)}">
            <div class="episode-replica-asset-grid ${escapeAttr(tab.id)}-mode">
              ${(liveGroups[tab.id] ?? []).map((asset, index) => renderAssetCard(
                asset,
                tab.id,
                tab.id === activeAssetTab && (asset.id === selectedAsset?.id || (!selectedAsset && index === 0)),
                selectedEpisodeAssetIds.includes(asset.id),
              )).join("")}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAssetCard(asset, assetKind, active, checked) {
  const desc = String(asset?.description ?? "").trim() || "";
  const title = assetKind === "scene" ? "缂栬緫鍦烘櫙" : assetKind === "prop" ? "缂栬緫閬撳叿" : "缂栬緫瑙掕壊";
  return `
    <article class="episode-replica-asset-card ${active ? "active" : ""} ${checked ? "checked" : ""}" data-asset-card="${escapeAttr(asset?.id ?? "")}">
      <div class="episode-replica-asset-card-head">
        <button class="pick ${checked ? "checked" : ""}" type="button" data-action="toggle-episode-asset-selection" data-asset-id="${escapeAttr(asset?.id ?? "")}" aria-label="閫夋嫨绱犳潗"></button>
        <button class="episode-replica-asset-select" type="button" data-action="set-episode-asset" data-asset-id="${escapeAttr(asset?.id ?? "")}">
          <strong class="name">${escapeHtml(asset?.name ?? "娴嬭瘯")}</strong>
          <span class="title">${escapeHtml(title)}</span>
        </button>
      </div>
      <span class="toolbar">鉁?/span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}鍥哄畾</span>
      <span class="label">${escapeHtml(resolveAssetLabel(assetKind))}鎻忚堪</span>
      <span class="preview">${renderPlaceholderArt(assetKind, asset?.name ?? "")}</span>
      ${assetKind === "character" ? `<button class="voice" type="button" data-action="open-episode-voice-modal" data-asset-id="${escapeAttr(asset?.id ?? "")}" data-asset-name="${escapeAttr(asset?.name ?? "瑙掕壊")}">+ 閰嶉煶鍛?/button>` : ""}
      <label class="episode-replica-asset-desc-wrap">
        <textarea
          class="episode-replica-asset-desc-input"
          data-asset-id="${escapeAttr(asset?.id ?? "")}"
          data-asset-kind="${escapeAttr(assetKind)}"
          placeholder="鍙互缂栬緫锛岀偣鍑绘澶栧悗鑷姩淇濆瓨"
        >${escapeHtml(desc)}</textarea>
      </label>
      <span class="count">${[...desc].length} / 800</span>
    </article>
  `;
}

function renderEpisodeVoiceModal(modal) {
  if (!modal) return "";
  return `
    <section class="modal-backdrop storyboard-description-backdrop" role="dialog" aria-modal="true">
      <button class="modal-backdrop-hit" type="button" data-action="close-episode-voice-modal"></button>
      <div class="episode-voice-modal">
        <button class="episode-asset-create-close" type="button" data-action="close-episode-voice-modal">脳</button>
        <h3>瑙掕壊閰嶉煶</h3>
        <p>涓?${escapeHtml(modal.assetName ?? "瑙掕壊")} 缁戝畾閰嶉煶鍛樸€?/p>
        <label class="episode-asset-create-group">
          <span>閰嶉煶鍛樺悕绉?/span>
          <div class="episode-asset-create-input-wrap">
            <input type="text" value="${escapeAttr(modal.voiceName ?? "")}" placeholder="璇疯緭鍏ラ厤闊冲憳鍚嶇О" />
          </div>
        </label>
        <div class="episode-voice-modal-note">褰撳墠鍙湁瑙掕壊鍗＄墖鏀寔閰嶉煶椤癸紝鐐瑰嚮鍚庡脊鍑虹獥鍙ｃ€?/div>
        <button class="episode-asset-create-save" type="button" data-action="close-episode-voice-modal">纭</button>
      </div>
    </section>
  `;
}
