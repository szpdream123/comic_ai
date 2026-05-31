import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export const videoModels = [
  {
    id: "happy-horse",
    name: "Happy Horse",
    description: "超强理解能力，人物一致性和表情管理表现突出",
    duration: "3-15s",
    tags: ["音频生成", "口型同步", "限时5折"],
    credits: 15,
  },
  {
    id: "vidu-q3-pro",
    name: "Vidu Q3-Pro",
    description: "支持最长15秒生成，打斗和镜头表现更强",
    duration: "3-15s",
    tags: ["音频生成", "口型同步"],
    credits: 68,
  },
  {
    id: "vidu-q2",
    name: "Vidu Q2",
    description: "效率出色，擅长情绪表演与特效镜头",
    duration: "1-8s",
    tags: [],
    credits: 22,
  },
  {
    id: "jimeng-3-pro-fast",
    name: "即梦3.0 Pro - Fast",
    description: "综合能力均衡，生成速度更快，性价比优秀",
    duration: "2-12s",
    tags: [],
    credits: 18,
  },
  {
    id: "jimeng-3-pro",
    name: "即梦3.0 Pro",
    description: "综合质量稳定，画面细节表现更完整",
    duration: "2-12s",
    tags: [],
    credits: 24,
  },
  {
    id: "jimeng-3-5-pro",
    name: "即梦3.5 Pro",
    description: "效果进一步升级，支持音画回出",
    duration: "5-12s",
    tags: ["音频生成", "口型同步"],
    credits: 30,
  },
  {
    id: "hailuo-2-3-fast",
    name: "Hailuo 2.3 - Fast",
    description: "更高性价比，擅长动作场景、运镜与节奏表达",
    duration: "6-10s",
    tags: [],
    credits: 24,
  },
];

const FIRST_LAST_VIDEO_MODELS = [
  {
    id: "hailuo-2-0",
    name: "Hailuo 2.0",
    description: "擅长动作场景，运镜和镜头连贯表现稳定",
    duration: "6-10s",
    tags: [],
    credits: 24,
  },
  {
    id: "keling-3-0",
    name: "可灵3.0",
    description: "影视级质感，情绪与叙事表现更强，支持多分镜表达",
    duration: "3-15s",
    tags: ["音频生成", "口型同步", "多分镜"],
    credits: 32,
  },
  {
    id: "keling-2-1",
    name: "可灵2.1",
    description: "综合能力均衡，适合稳定转场与角色镜头",
    duration: "5-10s",
    tags: [],
    credits: 28,
  },
  {
    id: "vidu-q2-first-last",
    name: "Vidu Q2",
    description: "效率出色，擅长情绪表演与特效镜头",
    duration: "1-8s",
    tags: [],
    credits: 22,
  },
  {
    id: "tv-3-1",
    name: "TV 3.1",
    description: "写实表现更强，音画一致性和镜头质感优秀",
    duration: "4-8s",
    tags: ["音频生成", "口型同步"],
    credits: 30,
  },
  {
    id: "tv-3-1-fast",
    name: "TV 3.1 - Fast",
    description: "在 TV 3.1 的基础上提升生成速度",
    duration: "4-8s",
    tags: ["音频生成", "口型同步"],
    credits: 26,
  },
];

const REFERENCE_VIDEO_MODELS = [
  {
    id: "seedance-2-0-vip",
    name: "Seedance 2.0 VIP",
    description: "全能模型，动作表现自然流畅，指令理解精准，情绪演绎佳",
    duration: "4-15s",
    tags: ["音频生成", "口型同步"],
    credits: 251,
  },
  {
    id: "happy-horse-reference",
    name: "Happy Horse",
    description: "超强理解能力，出色的人物一致性和表情管理",
    duration: "3-15s",
    tags: ["音频生成", "口型同步", "限时5折"],
    credits: 188,
  },
  {
    id: "keling-o3",
    name: "可灵O3",
    description: "影视级画质，情绪与质感叙事能力大升级，音画回出",
    duration: "3-15s",
    tags: ["音频生成", "口型同步"],
    credits: 264,
  },
  {
    id: "vidu-q2-reference",
    name: "Vidu Q2",
    description: "超强主体一致性控制，秒级叙事支持",
    duration: "2-8s",
    tags: [],
    credits: 166,
  },
];

const VIDEO_MODE_TABS = [
  { id: "first-frame", label: "首帧生视频", modelId: "vidu-q3-pro", credits: 68 },
  { id: "first-last-frame", label: "首尾帧生视频", modelId: "hailuo-2-0", credits: 24 },
  { id: "reference-video", label: "参考生视频", modelId: "seedance-2-0-vip", credits: 251 },
  { id: "edit-video", label: "AI改视频", modelId: "happy-horse", credits: 22 },
];

const IMAGE_MODE_TABS = [
  { id: "single-image", label: "新增图片", modelId: "jimeng-4-5", credits: 3 },
  { id: "multi-image", label: "多视图生图", modelId: "tnb-pro", credits: 18 },
];

const IMAGE_MODELS = {
  "single-image": [
    {
      id: "jimeng-4-5",
      name: "即梦 4.5",
      description: "适合单张分镜图生成与参考图合成",
      duration: "",
      tags: [],
      credits: 3,
    },
    {
      id: "jimeng-3-5-pro",
      name: "即梦 3.5 Pro",
      description: "稳定的单图生成与参考图合成能力",
      duration: "",
      tags: [],
      credits: 3,
    },
  ],
  "multi-image": [
    {
      id: "tnb-pro",
      name: "TNB Pro",
      description: "适合多视图分镜规划与空间一致性生成",
      duration: "",
      tags: [],
      credits: 18,
    },
  ],
};

const DURATION_OPTIONS = {
  default: ["3", "5", "6", "8", "10", "12", "15"],
  reference: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
};

const RESOLUTION_OPTIONS = ["720p", "1080p", "2K"];
const RESOLUTION_LABELS = {
  "720p": "720P",
  "1080p": "1080P 优惠版",
  "2K": "2K超清版",
};

const VIDEO_COUNT_OPTIONS = ["1", "2", "3", "4"];
const REFERENCE_PROMPT_PRESETS = [
  { id: "none", label: "无" },
  { id: "comic-style", label: "国漫美学漫画剧风格" },
];

export function validateVideoGeneration(input) {
  const mode = input.mode ?? "first-frame";
  if (mode === "reference-video") {
    if ((input.referenceSelectionCount ?? 0) === 0 && (input.referenceUploadCount ?? 0) === 0) {
      return { ok: false, message: "请先选择至少一个素材或上传参考素材后再提交视频生成任务" };
    }
    return { ok: true, message: "" };
  }
  if (!input.firstFrameUploaded) {
    return { ok: false, message: "请先上传首帧图片后再提交视频生成任务" };
  }
  return { ok: true, message: "" };
}

export function renderVideoGenerationPanel({
  selectedModelId = "vidu-q3-pro",
  prompt = "",
  busy = false,
  selectedShot = null,
  validationMessage = "",
  mediaMode = "image",
  videoMode = "first-frame",
  imageMode = "single-image",
  generationControls = {},
  generationUiState = {},
} = {}) {
  const activeVideoMode = VIDEO_MODE_TABS.find((mode) => mode.id === videoMode) ?? VIDEO_MODE_TABS[0];
  const activeImageMode = IMAGE_MODE_TABS.find((mode) => mode.id === imageMode) ?? IMAGE_MODE_TABS[0];
  const activeMode = mediaMode === "video" ? activeVideoMode : activeImageMode;
  const modelCatalog = getModelCatalog(mediaMode, activeVideoMode.id, activeImageMode.id);
  const selectedModel =
    modelCatalog.find((model) => model.id === selectedModelId) ??
    modelCatalog.find((model) => model.id === activeMode.modelId) ??
    modelCatalog[0];
  const generationState = selectedShot?.generationState ?? {};
  const controls = {
    videoDurationSec: String(generationControls.videoDurationSec ?? "15"),
    videoResolution: generationControls.videoResolution ?? "1080p",
    videoCount: String(generationControls.videoCount ?? 1),
    videoSoundSyncEnabled: Boolean(generationControls.videoAudioEnabled),
    imageCount: String(generationControls.imageCount ?? 1),
    imageResolution: generationControls.imageResolution ?? "2K",
    imageAspectRatio: generationControls.imageAspectRatio ?? "16:9",
    multiImageStrategy: generationControls.multiImageStrategy ?? "spatial-multi-view",
    referencePromptPreset: generationControls.referencePromptPreset ?? "comic-style",
  };
  const uiState = {
    isVideoModelMenuOpen: Boolean(generationUiState.isVideoModelMenuOpen),
    openGenerationSelectMenu: generationUiState.openGenerationSelectMenu ?? null,
    isFirstFrameMenuOpen: Boolean(generationUiState.isFirstFrameMenuOpen),
    activeGenerationFrameMenu: generationUiState.activeGenerationFrameMenu ?? null,
    isGenerationConsoleCollapsed: Boolean(generationUiState.isGenerationConsoleCollapsed),
  };

  return `
    <aside id="generation-console" class="generation-console director-console ${uiState.isGenerationConsoleCollapsed ? "collapsed" : ""}" aria-label="生成控制台">
      <div class="console-panel-header">
        <div class="console-tabs" role="tablist" aria-label="生成方式">
          ${
            mediaMode === "video"
              ? VIDEO_MODE_TABS.map((mode) => renderSubTab(mode, "set-video-generation-mode", activeVideoMode.id)).join("")
              : IMAGE_MODE_TABS.map((mode) => renderSubTab(mode, "set-image-generation-mode", activeImageMode.id)).join("")
          }
        </div>
        <button
          class="console-menu-button ${uiState.isGenerationConsoleCollapsed ? "collapsed-toggle" : ""}"
          type="button"
          data-action="open-generation-menu"
          aria-label="${uiState.isGenerationConsoleCollapsed ? "展开生成控制台" : "收起生成控制台"}"
          aria-expanded="${uiState.isGenerationConsoleCollapsed ? "false" : "true"}"
        >
          <span aria-hidden="true">${uiState.isGenerationConsoleCollapsed ? "✦" : "⇢"}</span>
          ${uiState.isGenerationConsoleCollapsed ? '<span class="console-menu-hint">展开</span>' : ""}
        </button>
      </div>
      <section class="console-scroll" ${uiState.isGenerationConsoleCollapsed ? 'aria-hidden="true"' : ""}>
        ${
          mediaMode === "video"
            ? renderVideoModePanel({
                activeMode: activeVideoMode,
                selectedModel,
                prompt,
                selectedShot,
                controls,
                generationState,
                uiState,
                modelCatalog,
              })
            : renderImageModePanel(activeImageMode, selectedModel, prompt, selectedShot, controls, generationState, uiState, modelCatalog)
        }
      </section>
      <footer class="console-footer" ${uiState.isGenerationConsoleCollapsed ? 'aria-hidden="true"' : ""}>
        <div class="console-credit-row">
          <span class="console-credit-clean">积分消耗：✦ ${resolveCreditDisplay(activeMode.id, selectedModel, controls)}</span>
          <span aria-hidden="true">ⓘ</span>
        </div>
        <p class="validation-copy">${escapeHtml(validationMessage)}</p>
        <button
          class="generate-now"
          type="button"
          data-action="${mediaMode === "video" ? "generate-videos" : "generate-images"}"
          ${disabled(busy)}
        >
          <span class="generate-now-label">立即生成</span>
        </button>
        <small class="console-disclaimer">内容由 AI 生成，请仔细甄别</small>
      </footer>
    </aside>
  `;
}

function getVideoModelCatalog(modeId) {
  if (modeId === "first-last-frame") {
    return FIRST_LAST_VIDEO_MODELS;
  }
  if (modeId === "reference-video") {
    return REFERENCE_VIDEO_MODELS;
  }
  return videoModels;
}

function getImageModelCatalog(modeId) {
  return IMAGE_MODELS[modeId] ?? IMAGE_MODELS["single-image"];
}

function getModelCatalog(mediaMode, videoModeId, imageModeId) {
  return mediaMode === "video" ? getVideoModelCatalog(videoModeId) : getImageModelCatalog(imageModeId);
}

function resolveCreditDisplay(modeId, selectedModel, controls) {
  if (modeId === "reference-video") {
    return selectedModel?.credits ?? 251;
  }
  if (modeId === "first-last-frame") {
    return selectedModel?.credits ?? 24;
  }
  return selectedModel?.credits ?? 0;
}

function renderSubTab(tab, action, activeId) {
  const active = tab.id === activeId;
  return `
    <button
      class="console-tab ${active ? "active" : ""}"
      type="button"
      role="tab"
      aria-selected="${active}"
      data-action="${escapeAttr(action)}"
      data-mode="${escapeAttr(tab.id)}"
    >
      ${escapeHtml(tab.label)}
    </button>
  `;
}

function renderVideoModePanel({
  activeMode,
  selectedModel,
  prompt,
  selectedShot,
  controls,
  generationState,
  uiState,
  modelCatalog,
}) {
  if (activeMode.id === "first-frame") {
    return `
      <section class="console-section-stack first-frame-panel">
        ${renderModelField(selectedModel, modelCatalog, uiState.isVideoModelMenuOpen)}
        ${renderFirstFrameImageBlock(generationState.firstFrame, uiState.isFirstFrameMenuOpen)}
        ${renderPromptBlock(prompt || defaultPrompt(selectedShot))}
        ${renderToggleRow("音画回出", "音效、音乐及口型驱动", controls.videoSoundSyncEnabled)}
        ${renderVideoSelectPair(controls, uiState.openGenerationSelectMenu, activeMode.id)}
        ${renderCounterStrip("视频数量", "videoCount", VIDEO_COUNT_OPTIONS, controls.videoCount)}
      </section>
    `;
  }

  if (activeMode.id === "first-last-frame") {
    return `
      <section class="console-section-stack frame-pair-panel">
        ${renderModelField(selectedModel, modelCatalog, uiState.isVideoModelMenuOpen)}
        ${renderFramePairStage(generationState.firstFrame, generationState.lastFrame, uiState.activeGenerationFrameMenu)}
        ${renderPromptBlock(prompt || defaultPrompt(selectedShot))}
        ${renderVideoSelectPair(controls, uiState.openGenerationSelectMenu, activeMode.id)}
        ${renderCounterStrip("视频数量", "videoCount", VIDEO_COUNT_OPTIONS, controls.videoCount)}
      </section>
    `;
  }

  if (activeMode.id === "reference-video") {
    return `
      <section class="console-section-stack reference-video-panel">
        ${renderModelField(selectedModel, modelCatalog, uiState.isVideoModelMenuOpen)}
        <p class="seedance-note">
          <span aria-hidden="true">ⓘ</span>
          为保证 Seedance 2.0 生成效果，请确保角色/含人物的图片均已保存为 Seedance 2.0主体并审核成功
        </p>
        ${renderReferenceAssetSummary(generationState)}
        <div class="reference-role-hook-compat" aria-hidden="true">
          ${renderReferenceRoleHook(generationState.localReferenceRoles)}
        </div>
        ${renderReferenceSelectionBoard(generationState)}
        ${renderReferenceUploadsBlock(generationState.referenceUploads)}
        ${renderReferencePromptComposer(prompt, generationState, controls, uiState.openGenerationSelectMenu)}
        ${renderToggleRow("音画回出", "音效、音乐及口型驱动", controls.videoSoundSyncEnabled)}
        ${renderVideoSelectPair(controls, uiState.openGenerationSelectMenu, activeMode.id)}
        ${renderCounterStrip("生成数量", "videoCount", VIDEO_COUNT_OPTIONS, controls.videoCount)}
      </section>
    `;
  }

  return `
    <section class="console-section-stack">
      ${renderUploadBlock(
        "上传视频",
        "上传/拖拽视频",
        "上传待编辑视频",
        { uploadTarget: "edit-source-video", accept: "video/*" },
        generationState.editSourceVideo,
      )}
      ${renderReferenceRoleHook(generationState.localReferenceRoles, true)}
      ${renderPromptBlock(prompt || "描述视频修改需求，或上传图片作为额外参考")}
      ${renderSingleSelectRow("分辨率", "videoResolution", RESOLUTION_OPTIONS, controls.videoResolution, uiState.openGenerationSelectMenu, RESOLUTION_LABELS)}
    </section>
  `;
}

function renderImageModePanel(activeMode, selectedModel, prompt, selectedShot, controls, generationState, uiState, modelCatalog) {
  if (activeMode.id === "single-image") {
    return `
      <section class="console-section-stack single-image-panel">
        ${renderModelField(selectedModel, modelCatalog, uiState.isVideoModelMenuOpen)}
        ${renderSingleImageAssetBoard(generationState.localReferenceRoles)}
        ${renderSingleImageReferenceBlock(generationState.imageReference)}
        ${renderPromptBlock(prompt || defaultPrompt(selectedShot), "通过@上传素材和参考图，描述图片合成要求，涵盖每个要素及其关系")}
        ${renderCounterStrip("图片数量", "imageCount", VIDEO_COUNT_OPTIONS, controls.imageCount)}
        ${renderImageSelectPair(controls, uiState.openGenerationSelectMenu)}
      </section>
    `;
  }

  return `
    <section class="console-section-stack multi-image-panel">
      ${renderModelField(selectedModel, modelCatalog, uiState.isVideoModelMenuOpen)}
      ${renderMultiImageStoryboardBlock(generationState.firstFrame)}
      <div class="lock-character-row">
        <span>锁定分镜角色 <small>(增强角色一致性)</small></span>
        ${renderCompactAssetCard("+角色")}
      </div>
      <div class="mode-choice-row">
        <span>模式选择</span>
        <div class="mode-choice-grid">
          ${renderModeChoice("spatial-multi-view", "空间多视图", controls.multiImageStrategy)}
          ${renderModeChoice("narrative-planning", "分镜叙事规划", controls.multiImageStrategy)}
        </div>
      </div>
      ${renderStaticImageCount("多视图生成数量", "9 张")}
    </section>
  `;
}

function renderMultiImageStoryboardBlock(firstFrame) {
  if (firstFrame?.name) {
    return `
      <section class="console-block">
        <div class="console-block-title">分镜图 <small>(角色数量设不超过2人)</small></div>
        <div class="multi-image-storyboard-stage filled">
          <div class="multi-image-storyboard-visual">${renderMediaVisual(firstFrame, "multi-image-storyboard")}</div>
        </div>
      </section>
    `;
  }

  return `
    <section class="console-block">
      <div class="console-block-title">分镜图 <small>(角色数量设不超过2人)</small></div>
      <div class="multi-image-storyboard-stage empty">
        <div class="multi-image-storyboard-copy">
          <span class="multi-image-storyboard-icon" aria-hidden="true">⌕+</span>
          <strong>上传/拖拽图片</strong>
          <p>或从 <span class="inline-link-text">项目资产</span> 中选择</p>
        </div>
        <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="first-frame-image">选择文件</button>
        <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="first-frame-image" hidden />
      </div>
    </section>
  `;
}

function renderSingleImageAssetBoard(selectedRoles = []) {
  const items = [
    { role: "character", label: "添加角色", helper: "上传角色图" },
    { role: "scene", label: "添加场景", helper: "场景参考" },
    { role: "prop", label: "添加道具", helper: "道具素材" },
  ];
  return `
    <section class="console-block">
      <div class="console-block-title split">
        <span>选择素材</span>
        <small>可上传素材数: 10</small>
      </div>
      <div class="single-image-asset-grid">
        ${items
          .map(({ role, label, helper }) => {
            const active = selectedRoles.includes(role);
            return `
              <button
                class="single-image-asset-card ${active ? "selected" : ""}"
                type="button"
                data-action="attach-shot-reference"
                data-reference-role="${escapeAttr(role)}"
              >
                <span class="asset-pick-icon" aria-hidden="true">+</span>
                <strong>${escapeHtml(label)}</strong>
                <small>${escapeHtml(helper)}</small>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderSingleImageReferenceBlock(imageReference) {
  if (imageReference?.name) {
    return `
      <section class="console-block">
        <div class="console-block-title">上传参考图</div>
        <div class="single-image-reference-stage filled">
          <div class="single-image-reference-visual">${renderMediaVisual(imageReference, "single-image-reference")}</div>
          <div class="single-image-reference-meta">
            <strong>${escapeHtml(imageReference.name)}</strong>
            <p>${escapeHtml(imageReference.summary ?? "已添加参考图，可继续替换或直接生成")}</p>
            <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="image-reference">
              重新选择
            </button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="console-block">
      <div class="console-block-title">上传参考图</div>
      <div class="single-image-reference-stage empty">
        <div class="single-image-reference-copy">
          <span class="upload-icon" aria-hidden="true">+</span>
          <strong>上传/拖拽图片</strong>
          <p>或使用 <span class="inline-link-text">构图模板库</span></p>
        </div>
        <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="image-reference">
          选择文件
        </button>
        <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="image-reference" hidden />
      </div>
    </section>
  `;
}

function renderModelField(selectedModel, catalog, isOpen) {
  return `
    <section class="console-block">
      <div class="console-block-title">模型</div>
      <div class="model-menu-shell ${isOpen ? "open" : ""}">
        <button class="model-menu-trigger" type="button" data-action="toggle-video-model-menu" aria-expanded="${isOpen}">
          <span class="model-menu-brand">
            <span class="model-menu-mark" aria-hidden="true">✦</span>
            <span>${escapeHtml(selectedModel.name)}</span>
            <span class="model-menu-gem" aria-hidden="true">◆</span>
          </span>
          <span class="model-menu-caret" aria-hidden="true">${isOpen ? "▴" : "▾"}</span>
        </button>
        <select data-model-choice class="model-menu-native">
          ${catalog
            .map(
              (model) =>
                `<option value="${escapeAttr(model.id)}" ${model.id === selectedModel.id ? "selected" : ""}>${escapeHtml(model.name)}</option>`,
            )
            .join("")}
        </select>
        ${
          isOpen
            ? `
              <div class="model-option-list">
                ${catalog.map((model) => renderModelOption(model, model.id === selectedModel.id)).join("")}
              </div>
            `
            : ""
        }
      </div>
    </section>
  `;
}

function renderModelOption(model, active) {
  return `
    <label class="model-option ${active ? "selected" : ""}">
      <input type="radio" name="video-model" value="${escapeAttr(model.id)}" ${active ? "checked" : ""} />
      <button
        class="model-option-button"
        type="button"
        data-action="select-video-model"
        data-model-id="${escapeAttr(model.id)}"
        data-model-name="${escapeAttr(model.name)}"
      >
        <div class="model-option-head">
          <strong>${escapeHtml(model.name)}</strong>
          <span class="model-duration">${escapeHtml(model.duration)}</span>
          ${model.tags.map((tag) => `<span class="model-tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
        <p>${escapeHtml(model.description)}</p>
      </button>
    </label>
  `;
}

function renderFirstFrameImageBlock(firstFrame, isMenuOpen) {
  if (!firstFrame?.name) {
    return `
      <section class="console-block">
        <div class="console-block-title">首帧图</div>
        <div class="first-frame-stage empty">
          <div class="first-frame-empty-copy">
            <strong>上传/拖拽图片</strong>
            <p>或从 <button class="inline-link-button" type="button" data-action="use-storyboard-first-frame">分镜图</button> / <span class="inline-link-text">项目资产</span> 中选择</p>
          </div>
          <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="first-frame-image">选择文件</button>
          <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="first-frame-image" hidden />
        </div>
      </section>
    `;
  }

  return `
    <section class="console-block">
      <div class="console-block-title">首帧图</div>
      <div class="first-frame-stage filled ${firstFrame.cropMode === "contain" ? "contain" : "cover"}">
        <div class="first-frame-image">${renderMediaVisual(firstFrame, "first-frame-preview")}</div>
        <button class="first-frame-menu-trigger" type="button" data-action="toggle-first-frame-menu" aria-expanded="${isMenuOpen}">⋯</button>
        ${
          isMenuOpen
            ? `
              <div class="first-frame-menu">
                <button type="button" data-action="open-generation-upload" data-upload-target="first-frame-image">上传</button>
                <button type="button" data-action="clear-first-frame">清除</button>
                <button type="button" data-action="toggle-first-frame-crop">裁剪</button>
              </div>
            `
            : ""
        }
        <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="first-frame-image" hidden />
      </div>
    </section>
  `;
}

function renderFramePairStage(firstFrame, lastFrame, activeMenuTarget) {
  return `
    <section class="console-block">
      <div class="console-block-title">首帧和尾帧图</div>
      <div class="frame-pair-stage">
        ${renderGenerationFrameCard("first", "首帧", firstFrame, activeMenuTarget)}
        <button
          class="frame-swap-button"
          type="button"
          data-action="swap-generation-frames"
          aria-label="交换首尾帧"
          title="交换首尾帧"
        >
          <span aria-hidden="true">⇄</span>
        </button>
        ${renderGenerationFrameCard("last", "尾帧", lastFrame, activeMenuTarget)}
      </div>
    </section>
  `;
}

function renderGenerationFrameCard(frameTarget, label, frameState, activeMenuTarget) {
  const isOpen = activeMenuTarget === frameTarget;
  const uploadTarget = frameTarget === "last" ? "last-frame-image" : "first-frame-image";
  if (!frameState?.name) {
    return `
      <div class="generation-frame-card empty">
        <span class="generation-frame-badge">${escapeHtml(label)}</span>
        <div class="generation-frame-surface">
          <div class="generation-frame-placeholder"></div>
          <div class="generation-frame-copy">
            <strong>上传/拖拽图片</strong>
            <p>或从 <button class="inline-link-button" type="button" data-action="use-storyboard-generation-frame" data-frame-target="${escapeAttr(frameTarget)}">分镜图</button> / <span class="inline-link-text">项目资产</span> 中选择</p>
          </div>
          <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(uploadTarget)}">选择文件</button>
          <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="${escapeAttr(uploadTarget)}" hidden />
        </div>
      </div>
    `;
  }

  return `
    <div class="generation-frame-card filled ${frameState.cropMode === "contain" ? "contain" : "cover"}">
      <span class="generation-frame-badge">${escapeHtml(label)}</span>
      <div class="generation-frame-surface">
        <div class="generation-frame-visual">${renderMediaVisual(frameState, `${frameTarget}-frame-preview`)}</div>
        <button class="generation-frame-menu-trigger" type="button" data-action="toggle-generation-frame-menu" data-frame-target="${escapeAttr(frameTarget)}" aria-expanded="${isOpen}">⋯</button>
        ${
          isOpen
            ? `
              <div class="generation-frame-menu">
                <button type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(uploadTarget)}">上传</button>
                <button type="button" data-action="use-storyboard-generation-frame" data-frame-target="${escapeAttr(frameTarget)}">分镜图</button>
                <button type="button" data-action="clear-generation-frame" data-frame-target="${escapeAttr(frameTarget)}">清除</button>
                <button type="button" data-action="toggle-generation-frame-crop" data-frame-target="${escapeAttr(frameTarget)}">裁剪</button>
              </div>
            `
            : ""
        }
        <div class="generation-frame-copy">
          <strong>${escapeHtml(frameState.name)}</strong>
          <p>${escapeHtml(frameState.summary ?? "已添加到当前模式")}</p>
        </div>
        <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(uploadTarget)}">重新选择</button>
        <input class="generation-upload-input" type="file" accept="image/*" data-upload-target="${escapeAttr(uploadTarget)}" hidden />
      </div>
    </div>
  `;
}

function renderReferenceAssetSummary(generationState) {
  const selectedCount = (generationState.referenceSelections ?? []).length;
  const uploadImageCount = (generationState.referenceUploads ?? []).filter((item) => item.kind === "image").length;
  const uploadVideoCount = (generationState.referenceUploads ?? []).filter((item) => item.kind === "video").length;
  const total = selectedCount + uploadImageCount + uploadVideoCount;
  return `
    <p class="reference-summary-copy">
      已上传素材数： 图片 ${selectedCount}/9，视频 ${uploadVideoCount}/3，音频 0/3，总素材数量 ${total}/12
    </p>
  `;
}

function renderReferenceSelectionBoard(generationState) {
  const byRole = new Map((generationState.referenceSelections ?? []).map((item) => [item.role, item]));
  const cards = [
    { role: "character", label: "角色", assetKind: "character", mediaType: "image" },
    { role: "scene", label: "场景", assetKind: "scene", mediaType: "image" },
    { role: "prop", label: "道具", assetKind: "prop", mediaType: "image" },
  ];
  return `
    <section class="console-block">
      <div class="console-block-title">选择素材</div>
      <div class="reference-selection-row">
        ${cards
          .map((card) => renderReferenceSelectionCard(card, byRole.get(card.role)))
          .join("")}
        <div class="reference-selection-actions">
          <button type="button" data-action="open-reference-asset-picker" data-asset-kind="character" data-media-type="image">＋ 角色</button>
          <button type="button" data-action="open-reference-asset-picker" data-asset-kind="scene" data-media-type="image">＋ 场景</button>
          <button type="button" data-action="open-reference-asset-picker" data-asset-kind="prop" data-media-type="image">＋ 道具</button>
        </div>
      </div>
    </section>
  `;
}

function renderReferenceSelectionCard(card, selected) {
  if (!selected) {
    return `
      <button
        class="reference-selection-card empty"
        type="button"
        data-action="open-reference-asset-picker"
        data-asset-kind="${escapeAttr(card.assetKind)}"
        data-media-type="${escapeAttr(card.mediaType)}"
      >
        <span class="reference-selection-plus" aria-hidden="true">⌕+</span>
        <strong>添加${escapeHtml(card.label)}</strong>
      </button>
    `;
  }

  return `
    <article class="reference-selection-card filled">
      <div class="reference-selection-thumb">
        ${selected.preview ? `<img src="${escapeAttr(selected.preview)}" alt="${escapeAttr(selected.name)}" />` : ""}
      </div>
      <button class="reference-selection-remove" type="button" data-action="remove-reference-asset" data-reference-role="${escapeAttr(card.role)}" aria-label="移除${escapeAttr(card.label)}">×</button>
      <span class="reference-selection-badge">${escapeHtml(selected.badge ?? selected.name)}</span>
    </article>
  `;
}

function renderReferenceUploadsBlock(referenceUploads = []) {
  const hasUploads = Array.isArray(referenceUploads) && referenceUploads.length > 0;
  return `
    <section class="console-block">
      <div class="console-block-title">上传参考素材 <small>(推荐次要元素和整图使用，如镜稿构图等)</small></div>
      <div class="reference-upload-panel ${hasUploads ? "filled" : "empty"}" data-upload-panel>
        ${
          hasUploads
            ? `
              <div class="upload-picked-head reference-upload-head">
                <strong>已添加 ${referenceUploads.length} 个参考素材</strong>
              </div>
              <div class="reference-upload-gallery">
                ${referenceUploads.map((item) => renderReferenceUploadCard(item)).join("")}
              </div>
              <div class="reference-upload-meta">
                ${referenceUploads
                  .map(
                    (item) => `
                      <span class="reference-upload-meta-item">
                        ${escapeHtml(item.kind === "video" ? "视频" : "图片")} · ${escapeHtml(item.name)}
                      </span>
                    `,
                  )
                  .join("")}
              </div>
              <div class="reference-upload-action-list">
                <button type="button" data-action="open-generation-upload" data-upload-target="reference-assets">＋ 上传本地</button>
                <button type="button" data-action="open-generation-upload" data-upload-target="reference-assets">＋ 添加分镜图</button>
                <button type="button" data-action="open-asset-import-modal" data-asset-kind="other">＋ 素材库</button>
                <button type="button" data-action="open-asset-import-modal" data-asset-kind="prop">＋ 特效模板库</button>
              </div>
            `
            : `
              <button class="reference-upload-empty" type="button" data-action="open-generation-upload" data-upload-target="reference-assets">
                <span aria-hidden="true">＋</span>
                <strong>上传本地图片/视频/音频</strong>
                <p>或从 分镜图 / 素材库 或使用 特效模板库</p>
              </button>
            `
        }
        <input class="generation-upload-input" type="file" accept="image/*,video/*" multiple data-upload-target="reference-assets" hidden />
      </div>
    </section>
  `;
}

function renderReferenceUploadCard(item) {
  return `
    <article class="reference-upload-card">
      <div class="reference-upload-thumb">
        ${item.kind === "image" && item.url ? `<img src="${escapeAttr(item.url)}" alt="${escapeAttr(item.name)}" />` : ""}
        ${item.kind === "video" && item.url ? `<video src="${escapeAttr(item.url)}" muted playsinline></video>` : ""}
      </div>
      <span class="reference-upload-badge">${escapeHtml(item.name)}</span>
    </article>
  `;
}

function renderReferencePromptComposer(prompt, generationState, controls, openMenu) {
  const selectedNames = [
    ...(generationState.referenceSelections ?? []).map((item) => item.name),
    ...(generationState.referenceUploads ?? []).map((item) => item.name),
  ].filter(Boolean);
  return `
    <section class="console-block">
      <div class="reference-prompt-head">
        <div class="console-block-title">提示词</div>
        ${renderSingleSelectField("referencePromptPreset", controls.referencePromptPreset, REFERENCE_PROMPT_PRESETS.map((item) => item.id), openMenu, "", null, REFERENCE_PROMPT_PRESETS)}
      </div>
      <label class="control-field prompt-field reference-prompt-field">
        <div class="reference-tag-row">
          ${selectedNames.map((name) => `<span class="reference-inline-tag">${escapeHtml(name)}</span>`).join("")}
        </div>
        <textarea id="video-prompt-input" placeholder="上传并@一个或多个主体、图片，涵盖每个要素及其关系，描述想要生成的视频内容">${escapeHtml(prompt)}</textarea>
        <button class="prompt-magic-button" type="button" data-action="enhance-prompt" aria-label="提示词助手">✦</button>
        <button class="prompt-trash-button" type="button" data-action="clear-reference-prompt" aria-label="清空提示词">⌫</button>
      </label>
    </section>
  `;
}

function renderMediaVisual(state, altText) {
  if (!state?.url) {
    return "";
  }
  if (state.kind === "video") {
    return `<video src="${escapeAttr(state.url)}" aria-label="${escapeAttr(altText)}" muted playsinline></video>`;
  }
  return `<img src="${escapeAttr(state.url)}" alt="${escapeAttr(altText)}" />`;
}

function renderUploadBlock(title, heading, detail, options = {}, uploadedState = null, isCollection = false) {
  const compactClass = options.compact ? "compact" : "";
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="upload-panel ${compactClass}" data-upload-panel>
        ${renderUploadPanelBody(heading, detail, options, uploadedState, isCollection)}
        <input
          class="generation-upload-input"
          type="file"
          accept="${escapeAttr(options.accept ?? "*/*")}"
          ${options.multiple ? "multiple" : ""}
          data-upload-target="${escapeAttr(options.uploadTarget ?? "")}"
          hidden
        />
      </div>
    </section>
  `;
}

function renderUploadPanelBody(heading, detail, options, uploadedState, isCollection) {
  if (isCollection && Array.isArray(uploadedState) && uploadedState.length) {
    return `
      <div class="upload-picked upload-picked-list">
        <div class="upload-picked-head">
          <strong>已添加 ${uploadedState.length} 个参考素材</strong>
          <p>${escapeHtml(detail)}</p>
        </div>
        <div class="upload-picked-tags">
          ${uploadedState
            .map(
              (item) => `
                <span class="upload-picked-tag">
                  ${escapeHtml(item.kind === "video" ? "视频" : "图片")} · ${escapeHtml(item.name)}
                </span>
              `,
            )
            .join("")}
        </div>
        <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(options.uploadTarget ?? "")}">
          继续添加
        </button>
      </div>
    `;
  }

  if (!isCollection && uploadedState?.name) {
    return `
      <div class="upload-picked">
        <span class="upload-icon" aria-hidden="true">${uploadedState.kind === "video" ? "▶" : "▣"}</span>
        <strong>${escapeHtml(uploadedState.name)}</strong>
        <p>${escapeHtml(uploadedState.summary ?? detail)}</p>
        <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(options.uploadTarget ?? "")}">
          重新选择
        </button>
      </div>
    `;
  }

  return `
    <span class="upload-icon" aria-hidden="true">⤴</span>
    <strong>${escapeHtml(heading)}</strong>
    <p>${escapeHtml(detail)}</p>
    <button class="stage-upload-trigger" type="button" data-action="open-generation-upload" data-upload-target="${escapeAttr(options.uploadTarget ?? "")}">
      选择文件
    </button>
  `;
}

function renderPromptBlock(value, placeholder = "请输入提示词") {
  return `
    <section class="console-block">
      <div class="console-block-title">提示词</div>
      <label class="control-field prompt-field">
        <textarea id="video-prompt-input" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value)}</textarea>
        <button class="prompt-magic-button" type="button" data-action="enhance-prompt" aria-label="提示词助手">✦</button>
        <button class="prompt-trash-button" type="button" data-action="apply-prompt-preset" aria-label="模板重写">⌫</button>
      </label>
    </section>
  `;
}

function renderToggleRow(title, label, checked) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <label class="sync-toggle polished-toggle">
        <span>${escapeHtml(label)} <small>NEW</small></span>
        <input type="checkbox" data-generation-toggle="sound-sync" ${checked ? "checked" : ""} />
      </label>
    </section>
  `;
}

function renderVideoSelectPair(controls, openMenu, modeId) {
  const durationOptions = modeId === "reference-video" ? DURATION_OPTIONS.reference : DURATION_OPTIONS.default;
  return `
    <section class="console-block">
      <div class="console-block-title">时长与分辨率</div>
      <div class="dual-select-row">
        ${renderSingleSelectField("videoDurationSec", controls.videoDurationSec, durationOptions, openMenu, "秒")}
        ${renderSingleSelectField("videoResolution", controls.videoResolution, RESOLUTION_OPTIONS, openMenu, "", RESOLUTION_LABELS)}
      </div>
    </section>
  `;
}

function renderImageSelectPair(controls, openMenu) {
  const resolutionOptions = [
    { id: "1080p", label: "1080P" },
    { id: "2K", label: "2K" },
  ];
  return `
    <section class="console-block">
      <div class="console-block-title">分辨率与比例</div>
      <div class="dual-select-row">
        ${renderSingleSelectField("imageResolution", controls.imageResolution, [], openMenu, "", null, resolutionOptions)}
        ${renderSingleSelectField("imageAspectRatio", controls.imageAspectRatio, ["16:9", "9:16", "1:1"], openMenu)}
      </div>
    </section>
  `;
}

function renderSingleSelectRow(title, field, options, value, openMenu, labelMap = null) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      ${renderSingleSelectField(field, value, options, openMenu, "", labelMap)}
    </section>
  `;
}

function renderSingleSelectField(field, value, options, openMenu, suffix = "", labelMap = null, optionDefs = null) {
  const open = openMenu === field;
  const optionObjects = optionDefs
    ? optionDefs
    : options.map((option) => ({
        id: option,
        label: resolveOptionLabel(option, suffix, labelMap),
      }));
  const currentLabel = optionObjects.find((option) => String(option.id) === String(value))?.label ?? resolveOptionLabel(value, suffix, labelMap);
  return `
    <div class="select-menu-shell ${open ? "open" : ""}">
      <button class="select-menu-trigger" type="button" data-action="toggle-generation-select-menu" data-field="${escapeAttr(field)}" aria-expanded="${open}">
        <span>${escapeHtml(currentLabel)}</span>
        <span aria-hidden="true">${open ? "▴" : "▾"}</span>
      </button>
      <select data-generation-field="${escapeAttr(field)}" class="model-menu-native">
        ${optionObjects
          .map(
            (option) =>
              `<option value="${escapeAttr(option.id)}" ${String(option.id) === String(value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
          )
          .join("")}
      </select>
      ${
        open
          ? `
            <div class="select-option-list">
              ${optionObjects
                .map(
                  (option) => `
                    <button class="select-option ${String(option.id) === String(value) ? "active" : ""}" type="button" data-action="select-generation-field-option" data-field="${escapeAttr(field)}" data-value="${escapeAttr(option.id)}">
                      <span>${escapeHtml(option.label)}</span>
                      ${String(option.id) === String(value) ? '<span aria-hidden="true">✓</span>' : ""}
                    </button>
                  `,
                )
                .join("")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function resolveOptionLabel(option, suffix = "", labelMap = null) {
  const mapped = labelMap && typeof labelMap === "object" ? labelMap[option] : null;
  return mapped ?? `${option}${suffix}`;
}

function renderCounterStrip(title, control, values, activeValue) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="count-strip" role="group" aria-label="${escapeAttr(title)}">
        ${values
          .map(
            (value, index) => `
              <button
                class="count-pill ${String(value) === String(activeValue) ? "active" : ""}"
                type="button"
                data-action="set-generation-count"
                data-control="${escapeAttr(control)}"
                data-count="${escapeAttr(value)}"
              >
                <span>${escapeHtml(value)}</span>
                ${index > 0 ? '<i aria-hidden="true">◆</i>' : ""}
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderModeChoice(strategy, label, activeStrategy) {
  const active = strategy === activeStrategy;
  return `
    <button
      class="mode-choice ${active ? "active" : ""}"
      type="button"
      data-action="set-multi-image-strategy"
      data-strategy="${escapeAttr(strategy)}"
    >
      <span class="${active ? "mode-dot" : "mode-ring"}" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </button>
  `;
}

function renderReferenceRoleHook(selectedRoles = [], includeReferenceImage = false) {
  const roles = [
    includeReferenceImage ? ["添加参考图", "reference_image"] : null,
    ["添加角色", "character"],
    ["添加场景", "scene"],
    ["添加道具", "prop"],
  ].filter(Boolean);
  return `
    <div class="asset-pick-grid ${roles.length === 4 ? "quad" : "triple"}">
      ${roles
        .map(([label, role]) => {
          const active = selectedRoles.includes(role);
          return `
            <button class="asset-pick-card ${active ? "selected" : ""}" type="button" data-action="attach-shot-reference" data-reference-role="${escapeAttr(role)}">
              <span class="asset-pick-icon" aria-hidden="true">＋</span>
              <strong>${escapeHtml(label)}</strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCompactAssetCard(label) {
  return `
    <button class="asset-lock-card" type="button" data-action="open-generation-upload" data-upload-target="image-reference">
      <span class="asset-pick-icon" aria-hidden="true">＋</span>
      <strong>${escapeHtml(label)}</strong>
    </button>
  `;
}

function renderStaticImageCount(title, value) {
  return `
    <section class="console-block">
      <div class="console-block-title">${escapeHtml(title)}</div>
      <div class="static-count-field">${escapeHtml(value)}</div>
    </section>
  `;
}

function defaultPrompt(selectedShot) {
  if (!selectedShot) {
    return "";
  }
  return `${selectedShot.description ?? selectedShot.title}，保持都市奇幻漫画质感，镜头运动平稳。`;
}
