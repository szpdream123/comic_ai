import { sortStoryboardsByIndex } from "./storyboard-state.js";
import { renderVideoGenerationPanel } from "./video-generation-panel.js";
import { normalizeStoryboardIndices } from "./storyboard-state.js";
import { disabled, escapeAttr, escapeHtml } from "./markup.js";

const MEDIA_TABS = [
  { id: "image", label: "分镜图片" },
  { id: "video", label: "分镜视频" },
];

export function renderEpisodeWorkbench({
  storyboards = [],
  selectedStoryboard = null,
  isStoryboardDescriptionModalOpen = false,
  storyboardDescriptionDraft = "",
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  canParse = false,
  canCalibrate = false,
  canGenerateImages = false,
  canGenerateVideos = false,
  validationMessage = "",
  calibrationSkipReason = "",
  calibrationOverrideReason = "",
  imageGenerationResult = null,
  videoGenerationResult = null,
  mediaMode = "image",
  videoMode = "first-frame",
  imageMode = "single-image",
  generationControls = {},
  generationUiState = {},
  storyboardDeleteTarget = null,
  storyboardImageDeleteTarget = null,
  storyboardVideoDeleteTarget = null,
  assetInspector = null,
} = {}) {
  const imageDeleteTargetStoryboard = storyboards.find(
    (item) => item.id === storyboardImageDeleteTarget?.storyboardId,
  ) ?? null;
  const imageDeleteTarget =
    (imageDeleteTargetStoryboard?.uploadedImages ?? []).find(
      (item) => item.id === storyboardImageDeleteTarget?.imageId,
    ) ?? null;
  const videoDeleteTargetStoryboard = storyboards.find(
    (item) => item.id === storyboardVideoDeleteTarget?.storyboardId,
  ) ?? null;
  const videoDeleteTarget =
    (videoDeleteTargetStoryboard?.uploadedVideos ?? []).find(
      (item) => item.id === storyboardVideoDeleteTarget?.videoId,
    ) ?? null;
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
        selectedStoryboard,
      })}
      ${renderStoryboardDeleteModal({
        show: Boolean(storyboardDeleteTarget),
        storyboard: storyboards.find((item) => item.id === storyboardDeleteTarget) ?? null,
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
      ${renderAssetInspectorModal(assetInspector)}
    </section>
  `;
}

function renderMediaTab(tab, activeMode) {
  const active = tab.id === activeMode;
  return `
    <button
      class="episode-media-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active}"
      data-action="set-episode-media-mode"
      data-mode="${escapeAttr(tab.id)}"
    >
      ${escapeHtml(tab.label)}
    </button>
  `;
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
          const previewIsVideo = Boolean(videoSource && !thumbnailSource);
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
                        ? `<video src="${escapeAttr(previewSource)}" muted playsinline preload="metadata"></video><i>▶</i>`
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
    return "";
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
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderStoryboardVideoDeleteModal({ show, storyboard, video }) {
  if (!show) {
    return "";
  }

  const videoName = video?.fileName || video?.id || "当前视频";
  const storyboardName = storyboard?.title ? `分镜 ${escapeHtml(String(storyboard.title))}` : "当前分镜";
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除视频">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>将从${storyboardName}中删除视频“${escapeHtml(String(videoName))}”，删除后不可恢复，确定继续吗？</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-storyboard-video-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-storyboard-video-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-storyboard-video">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderStoryboardImageDeleteModal({ show, storyboard, image }) {
  if (!show) {
    return "";
  }

  const imageName = image?.fileName || image?.id || "当前图片";
  const storyboardName = storyboard?.title ? `分镜 ${escapeHtml(String(storyboard.title))}` : "当前分镜";
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
      <input
        class="local-storyboard-image-input"
        type="file"
        accept="image/*"
        data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
        hidden
      />
    </div>
  `;
}

function renderStoryboardImageWorkspace(selectedStoryboard, hasPreview = false, status = "ready") {
  const previewSource = selectedStoryboard.previewImageUrl ?? "";
  const isUploading = status === "uploading";
  const uploadedImages = normalizeUploadedImages(selectedStoryboard);
  const imageCount = uploadedImages.length || (hasPreview || isUploading ? 1 : 0);
  return `
    <section class="stage-image-library" aria-label="本地分镜图" data-dropzone="storyboard-image">
      <section class="stage-image-group">
        <header class="stage-image-library-head">
          <strong><span aria-hidden="true">▾</span> 定稿图片 (${hasPreview ? 1 : 0})</strong>
          <button
            class="stage-upload-trigger"
            type="button"
            data-action="pick-local-storyboard-image"
            data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
          >
            本地上传
          </button>
        </header>
        ${
          hasPreview
            ? renderUploadedImageCard(
                selectedStoryboard,
                findPinnedUploadedImage(selectedStoryboard, uploadedImages)?.src ?? previewSource,
                { final: true, image: findPinnedUploadedImage(selectedStoryboard, uploadedImages) },
              )
            : `<div class="stage-image-empty compact"><div class="stage-image-placeholder-icon" aria-hidden="true"></div><p>定稿素材支持单独导出、加入至时间线</p></div>`
        }
      </section>
      <section class="stage-image-group">
        <header class="stage-image-library-head">
          <strong><span aria-hidden="true">▾</span> 全部图片 (${imageCount})</strong>
        </header>
        ${
          isUploading
            ? renderUploadedImageCard(selectedStoryboard, previewSource, { uploading: true })
            : imageCount
              ? `<div class="stage-image-grid">${uploadedImages.map((image) =>
                  renderUploadedImageCard(selectedStoryboard, image.src, { image }),
                ).join("")}</div>`
              : `<div class="stage-image-empty compact"><p>暂无本地分镜图。</p></div>`
        }
      </section>
      <input
        class="local-storyboard-image-input"
        type="file"
        accept="image/*"
        data-storyboard-id="${escapeAttr(selectedStoryboard.id)}"
        hidden
      />
    </section>
  `;
}

function normalizeUploadedImages(selectedStoryboard) {
  const uploadedImages = Array.isArray(selectedStoryboard.uploadedImages)
    ? selectedStoryboard.uploadedImages.filter((image) => image?.src)
    : [];
  if (uploadedImages.length) {
    return uploadedImages;
  }
  if (!selectedStoryboard.previewImageUrl) {
    return [];
  }
  return [
    {
      id: selectedStoryboard.currentImageAssetVersionId ?? "current-image",
      fileName: selectedStoryboard.uploadedImageName || selectedStoryboard.title || "分镜图",
      src: selectedStoryboard.previewImageUrl,
      status: "ready",
    },
  ];
}

function findPinnedUploadedImage(selectedStoryboard, uploadedImages) {
  return (
    uploadedImages.find((image) => image.id === selectedStoryboard.currentImageAssetVersionId) ??
    uploadedImages.find((image) => image.src === selectedStoryboard.previewImageUrl) ??
    null
  );
}

function renderUploadedImageCard(selectedStoryboard, previewSource, options = {}) {
  const isUploading = Boolean(options.uploading);
  const image = options.image ?? null;
  const imageName = image?.fileName || selectedStoryboard.uploadedImageName || selectedStoryboard.title || "分镜图";
  return `
    <article class="stage-image-preview-card ${previewSource ? "has-preview" : ""} ${isUploading ? "is-uploading" : ""}">
      <div class="stage-image-preview-surface">
        ${
          isUploading
            ? renderUploadingMediaShell()
            : previewSource
              ? `<img src="${escapeAttr(previewSource)}" alt="${escapeAttr(imageName)}" />`
              : `<div class="stage-image-placeholder" aria-hidden="true"></div>`
        }
        ${previewSource && !isUploading ? renderStoryboardImageToolbar(selectedStoryboard.id, image?.id ?? selectedStoryboard.currentImageAssetVersionId ?? "") : ""}
      </div>
      <div class="stage-image-meta">
        <strong>${escapeHtml(imageName)}</strong>
        <span>${isUploading ? "上传中..." : options.final ? "当前定稿" : "本地上传 · 即时预览"}</span>
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

function renderPinnedVideo(item, storyboardId) {
  if (!item) {
    return `<div class="stage-video-empty compact"><p>请选择一个视频作为定稿视频</p></div>`;
  }

  return `
    <article class="uploaded-video-card active pinned">
      <div class="uploaded-video-card-inner media">
        ${
          item.src
            ? `<video src="${escapeAttr(item.src)}" ${item.thumbnailSrc ? `poster="${escapeAttr(item.thumbnailSrc)}"` : ""} muted playsinline preload="metadata"></video>`
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

function renderUploadedVideoCard(item, active, storyboardId) {
  if (item.status === "uploading") {
    return `
      <article class="uploaded-video-card uploading">
        <div class="uploaded-video-card-inner progress">
          ${renderUploadingMediaShell()}
          <button
            class="uploaded-video-cancel"
            type="button"
            data-action="cancel-local-video-upload"
            data-video-id="${escapeAttr(item.id)}"
            data-storyboard-id="${escapeAttr(storyboardId ?? "")}"
          >
            取消
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="uploaded-video-card ${active ? "active" : ""}">
      <div class="uploaded-video-card-inner media">
        ${
          item.src
            ? `<video src="${escapeAttr(item.src)}" ${item.thumbnailSrc ? `poster="${escapeAttr(item.thumbnailSrc)}"` : ""} muted playsinline preload="metadata"></video>`
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
    </section>
  `;
}
