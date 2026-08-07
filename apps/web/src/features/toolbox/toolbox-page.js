const TOOLBOX_TOOLS = [
  {
    id: "prompt-reverse",
    title: "提示词反推",
    summary: "从图片或视频提炼构图、风格与画面提示词",
    category: "AI 图片/视频",
    coverUrl: "/assets/library/official/scenes/toolbox-prompt-reverse-cover-v5.png",
  },
  {
    id: "video-depth",
    title: "视频转深度",
    summary: "将普通视频转换为黑白|光谱|热力|反向黑白视频",
    category: "AI 视频",
    coverUrl: "/assets/library/official/scenes/toolbox-video-depth-cover-v3.png",
  },
  {
    id: "watermark-removal",
    title: "图片/视频去水印",
    summary: "标记水印区域，在本机修复图片或跟踪处理短视频",
    category: "AI 图片/视频",
    coverUrl: "/assets/library/official/scenes/scene-3d-studio.png",
  },
];

const VIDEO_DEPTH_RESOLUTION_OPTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "2k", label: "2K" },
];

const VIDEO_DEPTH_FRAME_RATE_OPTIONS = [6, 8, 12, 24];

const VIDEO_DEPTH_COLOR_OPTIONS = [
  { value: "grayscale", label: "黑白" },
  { value: "inverse", label: "反相黑白" },
  { value: "spectral", label: "光谱" },
  { value: "heatmap", label: "热力" },
];

const PROMPT_REVERSE_MODES = [
  { id: "image", label: "通用生图" },
  { id: "comic", label: "漫剧分镜" },
  { id: "anime", label: "二次元标签" },
];

const PROMPT_REVERSE_KINDS = [
  { id: "image", label: "图片反推提示词" },
  { id: "video", label: "视频反推提示词" },
];

export function renderToolboxPage(ui = {}) {
  const promptReverse = resolvePromptReverseState(ui);
  const videoDepth = resolveVideoDepthState(ui);
  const watermarkRemoval = resolveWatermarkRemovalState(ui);
  return `
    <section class="toolbox-page" aria-labelledby="toolbox-page-title">
      <header class="toolbox-page-header">
        <h1 id="toolbox-page-title">工具箱</h1>
        <p>内置创作工具</p>
      </header>

      <div class="toolbox-catalog-toolbar" aria-label="工具目录">
        <span class="toolbox-catalog-filter">全部</span>
        <span class="toolbox-catalog-count">${TOOLBOX_TOOLS.length} 项工具</span>
      </div>

      <div class="toolbox-grid">
        ${TOOLBOX_TOOLS.map((tool) => renderToolCard(tool)).join("")}
      </div>
    </section>
    ${promptReverse.open ? renderPromptReverseModal(promptReverse) : ""}
    ${videoDepth.open ? renderVideoDepthModal(videoDepth) : ""}
    ${watermarkRemoval.open ? renderWatermarkRemovalModal(watermarkRemoval) : ""}
  `;
}

function renderToolCard(tool) {
  const isVideoDepth = tool.id === "video-depth";
  const isWatermarkRemoval = tool.id === "watermark-removal";
  const action = isVideoDepth
    ? "open-toolbox-video-depth"
    : isWatermarkRemoval
      ? "open-toolbox-watermark-removal"
      : "open-toolbox-prompt-reverse";
  const sourceLabel = isVideoDepth ? "视频 → 深度视频" : isWatermarkRemoval ? "图片/视频 → 去水印" : "图片/视频 → 提示词";
  return `
    <button type="button" class="toolbox-card${isVideoDepth ? " toolbox-card-depth" : ""}${isWatermarkRemoval ? " toolbox-card-watermark" : ""}" data-toolbox-tool="${tool.id}" data-action="${action}" aria-label="打开${tool.title}">
      <img class="toolbox-card-cover" src="${tool.coverUrl}" alt="${tool.title}功能封面" loading="lazy" />
      <div class="toolbox-card-visual${isWatermarkRemoval ? " toolbox-watermark-card-visual" : ""}" aria-hidden="true">
        <span class="toolbox-card-source">${sourceLabel}</span>
        ${isWatermarkRemoval ? `
          <div class="toolbox-watermark-card-flow">
            <div class="toolbox-watermark-card-frame toolbox-watermark-card-before"><span>原图</span><i>水印</i><b></b></div>
            <span class="toolbox-watermark-card-arrow">→</span>
            <div class="toolbox-watermark-card-frame toolbox-watermark-card-after"><span>清除</span><i></i><b></b></div>
          </div>
        ` : ""}
      </div>
      <div class="toolbox-card-overlay">
        <span class="toolbox-card-category">${tool.category}</span>
        <div class="toolbox-card-copy">
          <h2>${tool.title}</h2>
          <p>${tool.summary}</p>
        </div>
        <span class="toolbox-card-status"><i aria-hidden="true"></i>点击进入</span>
      </div>
    </button>
  `;
}

export function openToolboxPromptReverse(ui = {}) {
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    open: true,
    guideOpen: false,
    loadingModels: true,
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function closeToolboxPromptReverse(ui = {}) {
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    open: false,
    guideOpen: false,
    activeKeyFrameIndex: -1,
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function openToolboxVideoDepth(ui = {}) {
  ui.toolboxVideoDepth = { ...resolveVideoDepthState(ui), open: true, guideOpen: false };
  return ui.toolboxVideoDepth;
}

export function closeToolboxVideoDepth(ui = {}) {
  ui.toolboxVideoDepth = { ...resolveVideoDepthState(ui), open: false, guideOpen: false };
  return ui.toolboxVideoDepth;
}

export function openToolboxWatermarkRemoval(ui = {}, mediaKind = "image") {
  ui.toolboxWatermarkRemoval = {
    ...resolveWatermarkRemovalState(ui),
    open: true,
    guideOpen: false,
    mediaKind: mediaKind === "video" ? "video" : "image",
    error: "",
  };
  return ui.toolboxWatermarkRemoval;
}

export function closeToolboxWatermarkRemoval(ui = {}) {
  ui.toolboxWatermarkRemoval = {
    ...resolveWatermarkRemovalState(ui),
    open: false,
    guideOpen: false,
    error: "",
  };
  return ui.toolboxWatermarkRemoval;
}

export function updateToolboxWatermarkRemovalState(ui = {}, patch = {}) {
  ui.toolboxWatermarkRemoval = {
    ...resolveWatermarkRemovalState(ui),
    ...(patch && typeof patch === "object" ? patch : {}),
  };
  return ui.toolboxWatermarkRemoval;
}

export function setToolboxWatermarkRemovalFile(ui = {}, input = {}) {
  const state = resolveWatermarkRemovalState(ui);
  return updateToolboxWatermarkRemovalState(ui, {
    file: input.file ?? null,
    fileName: String(input.fileName ?? ""),
    fileSize: Number(input.fileSize ?? 0) || 0,
    previewUrl: String(input.previewUrl ?? ""),
    imageWidth: Number(input.imageWidth ?? 0) || 0,
    imageHeight: Number(input.imageHeight ?? 0) || 0,
    mediaKind: input.mediaKind === "video" ? "video" : state.mediaKind,
    videoDuration: Number(input.videoDuration ?? 0) || 0,
    status: "idle",
    progress: 0,
    maskDataUrl: "",
    maskDirty: false,
    maskHistory: [],
    maskRevision: 0,
    ocrStatus: "idle",
    ocrProgress: 0,
    ocrMessage: "",
    ocrConfidence: 0,
    ocrRegionCount: 0,
    ocrPlatforms: [],
    ocrError: "",
    ocrRequestId: state.ocrRequestId + 1,
    autoMaskApplied: false,
    result: null,
    error: "",
  });
}

export function clearToolboxWatermarkRemovalFile(ui = {}) {
  const state = resolveWatermarkRemovalState(ui);
  return updateToolboxWatermarkRemovalState(ui, {
    file: null,
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    imageWidth: 0,
    imageHeight: 0,
    videoDuration: 0,
    status: "idle",
    progress: 0,
    maskDataUrl: "",
    maskDirty: false,
    maskHistory: [],
    maskRevision: 0,
    ocrStatus: "idle",
    ocrProgress: 0,
    ocrMessage: "",
    ocrConfidence: 0,
    ocrRegionCount: 0,
    ocrPlatforms: [],
    ocrError: "",
    ocrRequestId: state.ocrRequestId + 1,
    autoMaskApplied: false,
    result: null,
    error: "",
  });
}

export function setToolboxWatermarkRemovalBrushSize(ui = {}, brushSize) {
  const size = [16, 32, 64].includes(Number(brushSize)) ? Number(brushSize) : 32;
  return updateToolboxWatermarkRemovalState(ui, { brushSize: size });
}

export function setToolboxWatermarkRemovalTool(ui = {}, tool) {
  const nextTool = ["rectangle", "brush", "lasso"].includes(String(tool)) ? String(tool) : "rectangle";
  return updateToolboxWatermarkRemovalState(ui, { maskTool: nextTool });
}

export function undoToolboxWatermarkRemovalMask(ui = {}) {
  const state = resolveWatermarkRemovalState(ui);
  const history = Array.isArray(state.maskHistory) ? state.maskHistory : [];
  if (!history.length) return state;
  const previousMaskDataUrl = String(history.at(-1) ?? "");
  return updateToolboxWatermarkRemovalState(ui, {
    maskDataUrl: previousMaskDataUrl,
    maskDirty: Boolean(previousMaskDataUrl),
    maskHistory: history.slice(0, -1),
    maskRevision: state.maskRevision + 1,
    autoMaskApplied: false,
    status: "idle",
    progress: 0,
    result: null,
    error: "",
  });
}

export function clearToolboxWatermarkRemovalMask(ui = {}) {
  const state = resolveWatermarkRemovalState(ui);
  return updateToolboxWatermarkRemovalState(ui, {
    maskDataUrl: "",
    maskDirty: false,
    maskHistory: [],
    maskRevision: state.maskRevision + 1,
    autoMaskApplied: false,
    status: "idle",
    progress: 0,
    result: null,
    error: "",
  });
}

export function setToolboxPromptReverseGuideOpen(ui = {}, guideOpen) {
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    guideOpen: guideOpen === true,
  };
  return ui.toolboxPromptReverse;
}

export function setToolboxVideoDepthGuideOpen(ui = {}, guideOpen) {
  ui.toolboxVideoDepth = {
    ...resolveVideoDepthState(ui),
    guideOpen: guideOpen === true,
  };
  return ui.toolboxVideoDepth;
}

export function setToolboxWatermarkRemovalGuideOpen(ui = {}, guideOpen) {
  ui.toolboxWatermarkRemoval = {
    ...resolveWatermarkRemovalState(ui),
    guideOpen: guideOpen === true,
  };
  return ui.toolboxWatermarkRemoval;
}

export function setToolboxVideoDepthFile(ui = {}, input = {}) {
  ui.toolboxVideoDepth = {
    ...resolveVideoDepthState(ui),
    fileName: String(input.fileName ?? ""),
    fileSize: Number(input.fileSize ?? 0) || 0,
    previewUrl: String(input.previewUrl ?? ""),
    status: "idle",
    result: null,
    error: "",
  };
  return ui.toolboxVideoDepth;
}

export function clearToolboxVideoDepthFile(ui = {}) {
  ui.toolboxVideoDepth = {
    ...resolveVideoDepthState(ui),
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    file: null,
    status: "idle",
    result: null,
    error: "",
  };
  return ui.toolboxVideoDepth;
}

export function setToolboxPromptReverseMode(ui = {}, mode) {
  const selectedMode = PROMPT_REVERSE_MODES.some((item) => item.id === mode) ? mode : "image";
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    mode: selectedMode,
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function setToolboxPromptReverseModel(ui = {}, displayName) {
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    selectedModelName: String(displayName ?? "").trim(),
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function setToolboxPromptReverseSegmentDuration(ui = {}, value) {
  const seconds = Math.max(1, Math.min(300, Math.round(Number(value) || 15)));
  return updateToolboxPromptReverseActiveView(ui, {
    segmentDurationSeconds: seconds,
    error: "",
  });
}

export function setToolboxPromptReverseKind(ui = {}, kind) {
  const state = resolvePromptReverseState(ui);
  const activeKind = kind === "video" ? "video" : "image";
  const view = resolvePromptReverseView(state, activeKind);
  ui.toolboxPromptReverse = {
    ...state,
    ...view,
    activeKind,
    mode: activeKind,
    error: view.error,
  };
  return ui.toolboxPromptReverse;
}

export function updateToolboxPromptReverseActiveView(ui = {}, patch = {}) {
  const state = resolvePromptReverseState(ui);
  const activeKind = state.activeKind;
  const view = { ...resolvePromptReverseView(state, activeKind), ...patch };
  ui.toolboxPromptReverse = {
    ...state,
    ...view,
    activeKind,
    mode: activeKind,
    views: { ...state.views, [activeKind]: view },
  };
  return ui.toolboxPromptReverse;
}

export function setToolboxPromptReverseFile(ui = {}, input = {}) {
  const state = resolvePromptReverseState(ui);
  const activeKind = input.mode === "video" || input.kind === "video" ? "video" : state.activeKind;
  if (activeKind !== state.activeKind) setToolboxPromptReverseKind(ui, activeKind);
  return updateToolboxPromptReverseActiveView(ui, {
    file: input.file ?? null,
    fileName: String(input.fileName ?? ""),
    fileSize: Number(input.fileSize ?? 0) || 0,
    previewUrl: String(input.previewUrl ?? ""),
    status: "idle",
    progress: 0,
    error: "",
    result: null,
    ...(activeKind === "video" ? { pluginOutput: null, keyFramePreviews: [] } : {}),
    ...(activeKind === "video" ? { activeKeyFrameIndex: -1 } : {}),
  });
}

export function clearToolboxPromptReverseFile(ui = {}) {
  return updateToolboxPromptReverseActiveView(ui, {
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    file: null,
    status: "idle",
    progress: 0,
    error: "",
    result: null,
    pluginOutput: null,
    keyFramePreviews: [],
    activeKeyFrameIndex: -1,
  });
}

function renderPromptReverseModal(state) {
  const isVideo = state.activeKind === "video";
  const hasSource = Boolean(state.previewUrl);
  const models = Array.isArray(state.models) ? state.models : [];
  const hasModel = Boolean(state.selectedModelName);
  const isLoading = ["checking", "decoding", "preparing", "loading"].includes(state.status);
  const pluginReady = state.pluginStatus === "ready";
  const pluginBusy = ["checking", "installing", "uninstalling"].includes(state.pluginStatus);
  const result = state.result && typeof state.result === "object" ? state.result : null;
  const seenKeyFrameTimestamps = new Set();
  const keyFramePreviews = isVideo && Array.isArray(state.keyFramePreviews)
    ? state.keyFramePreviews.filter((frame) => {
      const timestampMs = Math.round(Number(frame?.timestampMs) || 0);
      if (seenKeyFrameTimestamps.has(timestampMs)) return false;
      seenKeyFrameTimestamps.add(timestampMs);
      return true;
    })
    : [];
  const activeKeyFrameIndex = Number.isInteger(state.activeKeyFrameIndex)
    ? state.activeKeyFrameIndex
    : -1;
  const activeKeyFrame = keyFramePreviews[activeKeyFrameIndex] ?? null;
  const loadingTitle = state.status === "decoding"
    ? `本机正在解析视频 ${Math.round(state.progress || 0)}%`
    : state.status === "preparing"
      ? `正在整理 6 FPS 时间轴 ${Math.round(state.progress || 0)}%`
      : isVideo ? "正在反推视频提示词" : "正在分析参考图";
  return `
    <div class="toolbox-reverse-scrim">
      <section class="toolbox-reverse-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-reverse-title">
        <header class="toolbox-reverse-header">
          <div class="toolbox-reverse-title">
            <span class="toolbox-reverse-mark" aria-hidden="true">✦</span>
            <div>
              <div class="toolbox-guide-title-row">
                <h2 id="prompt-reverse-title">提示词反推</h2>
                ${renderToolboxGuideTrigger("open-toolbox-prompt-reverse-guide", "提示词反推", state.guideOpen)}
              </div>
              <p>${isVideo ? "从完整视频时间轴还原动作与镜头表达" : "从参考图提炼可编辑的画面表达"}</p>
            </div>
          </div>
          <div class="toolbox-reverse-header-center">
            <nav class="toolbox-reverse-tabs" aria-label="提示词反推类型">
              ${PROMPT_REVERSE_KINDS.map((item) => `<button type="button" class="${item.id === state.activeKind ? "is-active" : ""}" data-action="set-toolbox-prompt-reverse-kind" data-prompt-reverse-kind="${item.id}" aria-selected="${item.id === state.activeKind}" ${isLoading || pluginBusy ? "disabled" : ""}>${item.label}</button>`).join("")}
            </nav>
            ${isVideo ? renderPromptReversePluginStatus(state) : ""}
          </div>
          <button type="button" class="toolbox-reverse-close" data-action="close-toolbox-prompt-reverse" aria-label="关闭提示词反推" title="关闭">×</button>
        </header>

        <div class="toolbox-reverse-layout">
          <section class="toolbox-reverse-source" aria-label="参考素材与输出设置">
            <label class="toolbox-reverse-model-field" for="toolbox-prompt-reverse-model">
              <span>使用模型</span>
              <select id="toolbox-prompt-reverse-model" data-toolbox-prompt-reverse-model ${state.loadingModels ? "disabled" : ""}>
                ${state.loadingModels ? `<option value="">正在加载可用模型…</option>` : models.length
                  ? models.map((model) => `<option value="${escapeAttr(model.displayName)}" ${model.displayName === state.selectedModelName ? "selected" : ""}>${escapeHtml(model.displayName)}</option>`).join("")
                  : `<option value="">暂无可用模型</option>`}
              </select>
            </label>
            ${hasSource ? `
              <div class="toolbox-reverse-preview">
                ${isVideo
                  ? `<video src="${escapeAttr(state.previewUrl)}" controls preload="metadata" aria-label="待反推的参考视频"></video>`
                  : `<img src="${escapeAttr(state.previewUrl)}" alt="待反推的参考图" />`}
                <div class="toolbox-reverse-preview-meta">
                  <span>${escapeHtml(state.fileName)}</span>
                  <button type="button" data-action="clear-toolbox-prompt-reverse-file">移除</button>
                </div>
              </div>
            ` : `
              <label class="toolbox-reverse-dropzone ${isVideo && !pluginReady ? "is-disabled" : ""}" data-dropzone="toolbox-prompt-reverse" ${isVideo && !pluginReady ? "aria-disabled=\"true\"" : "for=\"toolbox-prompt-reverse-file\""}>
                <span class="toolbox-reverse-upload-icon" aria-hidden="true">↑</span>
                <strong>${isVideo ? pluginReady ? "添加参考视频" : "等待浏览器解析插件就绪" : "添加参考图"}</strong>
                <span>${isVideo ? pluginReady ? "支持 MP4、WEBM、MOV，最大 500 MB" : "插件就绪后即可选择视频" : "支持 PNG、JPG、WEBP，最大 20 MB"}</span>
              </label>
            `}
            <input id="toolbox-prompt-reverse-file" class="toolbox-reverse-file-input" type="file" accept="${isVideo ? "video/mp4,video/webm,video/quicktime" : "image/png,image/jpeg,image/webp"}" ${isVideo && !pluginReady ? "disabled" : ""} />

            ${keyFramePreviews.length ? `<section class="toolbox-reverse-keyframes" aria-label="视频关键帧">
              <header><strong>关键帧</strong><span>画面差异达到 30% 才保留，黑白屏和蒙层自动排除 · ${keyFramePreviews.length} 张</span></header>
              <div class="toolbox-reverse-keyframe-list">
                ${keyFramePreviews.map((frame, index) => `<figure><button type="button" class="toolbox-reverse-keyframe-trigger" data-action="open-toolbox-prompt-reverse-keyframe" data-toolbox-prompt-reverse-keyframe-index="${index}" aria-label="放大查看视频关键帧 ${index + 1}"><img src="${escapeAttr(frame.dataUrl)}" alt="视频关键帧 ${index + 1}" /><span class="toolbox-reverse-keyframe-caption">${formatMilliseconds(frame.timestampMs)}</span></button></figure>`).join("")}
              </div>
            </section>` : ""}

            <div class="toolbox-reverse-notes">
              ${isVideo ? `<label class="toolbox-reverse-segment-setting" for="toolbox-prompt-reverse-segment-duration"><span>分段时长</span><span class="toolbox-reverse-segment-input"><input id="toolbox-prompt-reverse-segment-duration" data-toolbox-prompt-reverse-segment-duration type="number" min="1" max="300" step="1" value="${Math.round(state.segmentDurationSeconds || 15)}" ${isLoading ? "disabled" : ""} /><em>秒/段</em></span><small>按固定时长分境，并分析段间衔接</small></label>` : ""}
              <div><span>提炼内容</span><p>${isVideo ? "主体动作、场景、光影、运镜、风格与画质" : "主体、场景、光影、构图与画面风格"}</p></div>
              <div><span>输出语言</span><p>${isVideo ? "中文视频分析 + 可直接生成的完整视频提示词" : "中文描述 + 可直接编辑的英文提示词"}</p></div>
            </div>

            <footer class="toolbox-reverse-source-footer">
              <span>${hasSource ? `已选择 ${formatFileSize(state.fileSize)}` : isVideo ? "本机 6 FPS 解析" : "支持图片"}</span>
              <button type="button" class="toolbox-reverse-run" data-action="run-toolbox-prompt-reverse" data-toolbox-prompt-reverse-progress-button ${hasSource && hasModel && !isLoading && (!isVideo || pluginReady) ? "" : "disabled"}>${isLoading ? `${Math.round(state.progress || 0)}%` : "开始反推"}</button>
            </footer>
            ${state.error ? `<p class="toolbox-reverse-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          </section>

          <section class="toolbox-reverse-result" aria-live="polite">
            <header>
              <div>
                <span class="toolbox-reverse-eyebrow">反推结果</span>
              </div>
              <button type="button" class="toolbox-reverse-copy" data-action="copy-toolbox-prompt-reverse" ${result ? "" : "disabled"} title="${result ? "复制提示词" : "生成结果后可复制"}" aria-label="复制提示词">⧉</button>
            </header>
            ${isLoading ? `<div class="toolbox-reverse-empty" data-toolbox-prompt-reverse-loading><span class="toolbox-reverse-loading" aria-hidden="true"></span><strong data-toolbox-prompt-reverse-loading-title>${loadingTitle}</strong></div>` : result ? renderPromptReverseResult(result, state.activeKind) : `<div class="toolbox-reverse-empty">
              <span class="toolbox-reverse-empty-frame" aria-hidden="true"><i></i><i></i><i></i></span>
              <strong>${hasSource ? "准备开始分析" : "等待参考素材"}</strong>
              <p>${hasSource ? "开始提炼素材信息。" : isVideo ? "添加视频后，从本机解析完整时间轴并生成提示词。" : "将参考图拖入左侧区域，生成可继续编辑的提示词。"}</p>
            </div>`}
          </section>
        </div>
        ${state.guideOpen ? renderToolboxGuide("prompt-reverse") : ""}
      </section>
      ${keyFramePreviews.length ? `<div class="toolbox-reverse-keyframe-lightbox" role="dialog" aria-modal="true" aria-label="放大查看视频关键帧" ${activeKeyFrame ? "" : "hidden"}>
        <button type="button" class="toolbox-reverse-keyframe-lightbox-backdrop" data-action="close-toolbox-prompt-reverse-keyframe" aria-label="关闭关键帧预览"></button>
        <figure class="toolbox-reverse-keyframe-lightbox-content">
          <img ${activeKeyFrame ? `src="${escapeAttr(activeKeyFrame.dataUrl)}"` : ""} alt="${activeKeyFrame ? `视频关键帧 ${activeKeyFrameIndex + 1}` : "视频关键帧"}" />
          <figcaption>${activeKeyFrame ? `关键帧 ${activeKeyFrameIndex + 1} · ${formatMilliseconds(activeKeyFrame.timestampMs)}` : ""}</figcaption>
          <button type="button" class="toolbox-reverse-keyframe-lightbox-close" data-action="close-toolbox-prompt-reverse-keyframe" aria-label="关闭关键帧预览" title="关闭">×</button>
        </figure>
      </div>` : ""}
    </div>
  `;
}

function renderToolboxGuideTrigger(action, toolTitle, expanded) {
  return `<button type="button" class="toolbox-guide-trigger" data-action="${action}" aria-label="查看${toolTitle}使用说明" aria-haspopup="dialog" aria-expanded="${expanded === true}" title="使用说明">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"></path><path d="M4 5.5v15A2.5 2.5 0 0 1 6.5 18H20"></path><path d="M8 7h8M8 10h6"></path></svg>
    <span>使用说明</span>
  </button>`;
}

function renderToolboxGuide(tool) {
  const isPromptReverse = tool === "prompt-reverse";
  const isWatermarkRemoval = tool === "watermark-removal";
  const title = isPromptReverse ? "提示词反推使用说明" : isWatermarkRemoval ? "去水印使用说明" : "视频转深度使用说明";
  const closeAction = isPromptReverse
    ? "close-toolbox-prompt-reverse-guide"
    : isWatermarkRemoval ? "close-toolbox-watermark-removal-guide" : "close-toolbox-video-depth-guide";
  const purposeItems = isPromptReverse
    ? [
        "图片反推可提炼主体、场景、构图、光影、色彩和画面风格。",
        "视频反推可提炼主体动作、运镜、节奏、场景变化和整体风格。",
        "输出结果可用于复刻视觉方向、快速编写生成提示词或分析参考素材。",
      ]
    : isWatermarkRemoval
      ? [
          "在本机处理图片或短视频，选中的水印区域不会上传服务器。",
          "图片支持框选、画笔和套索；视频会从首帧开始跟踪选区并逐帧修复。",
          "处理完成后可直接预览结果，或下载干净的图片与视频文件。",
        ]
      : [
        "将普通视频逐帧转换为表达远近关系的深度视频。",
        "黑白模式下通常以明暗区分前景、中景与背景，并支持其他深度配色。",
        "适合后续制作空间层次、视差效果、景深控制或深度引导处理。",
      ];
  const stepItems = isPromptReverse
    ? [
        "选择“图片反推提示词”或“视频反推提示词”。",
        "选择模型并添加图片或视频；视频模式需先安装本地解析插件。",
        "点击“开始反推”，完成后查看并复制提示词结果。",
      ]
    : isWatermarkRemoval
      ? [
          "选择图片或视频，并等待本地去水印插件就绪。",
          "在原图或视频首帧上标记水印区域，可切换框选、画笔或套索。",
          "点击开始处理，完成后在右侧播放或下载结果。",
        ]
      : [
        "检测并安装深度视频转绘插件。",
        "添加 MP4、WEBM 或 MOV 视频。",
        "设置清晰度、帧率和深度颜色，然后生成并下载结果。",
      ];
  const note = isPromptReverse
    ? "图片最大 20 MB，视频最大 500 MB；图片反推和视频反推都会消耗积分。"
    : isWatermarkRemoval
      ? "图片最大 20 MB，视频最大 120 MB 且建议不超过 15 秒；处理在当前浏览器本机完成。"
      : "视频最大 500 MB；处理速度与电脑性能、视频时长、清晰度和帧率有关。";
  return `
    <div class="toolbox-guide-layer">
      <section class="toolbox-guide-panel" role="dialog" aria-modal="true" aria-labelledby="toolbox-guide-title-${tool}">
        <header class="toolbox-guide-header">
          <div>
            <span>功能说明</span>
            <h3 id="toolbox-guide-title-${tool}">${title}</h3>
          </div>
          <button type="button" class="toolbox-guide-close" data-action="${closeAction}" aria-label="关闭${title}" title="关闭">×</button>
        </header>
        ${isPromptReverse ? renderPromptReverseGuideVisual() : isWatermarkRemoval ? renderWatermarkRemovalGuideVisual() : renderVideoDepthGuideVisual()}
        <div class="toolbox-guide-content">
          <section>
            <h4>功能作用</h4>
            <ul>${purposeItems.map((item) => `<li>${item}</li>`).join("")}</ul>
          </section>
          <section>
            <h4>使用方式</h4>
            <ol>${stepItems.map((item) => `<li>${item}</li>`).join("")}</ol>
          </section>
        </div>
        <p class="toolbox-guide-note"><strong>注意：</strong>${note}</p>
      </section>
    </div>
  `;
}

function renderPromptReverseGuideVisual() {
  return `<div class="toolbox-guide-visual toolbox-guide-visual-prompt" aria-hidden="true">
    <div class="toolbox-guide-media-stack">
      <span class="toolbox-guide-media-card"><i>▧</i><b>图片</b></span>
      <span class="toolbox-guide-media-card"><i>▶</i><b>视频</b></span>
    </div>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-process"><i>⌕</i><b>画面分析</b></span>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-output"><i></i><i></i><i></i><b>反推提示词</b></span>
  </div>`;
}

function renderVideoDepthGuideVisual() {
  return `<div class="toolbox-guide-visual toolbox-guide-visual-depth" aria-hidden="true">
    <span class="toolbox-guide-video-frame"><i>▶</i><b>普通视频</b></span>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-process"><i>◐</i><b>深度估计</b></span>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-depth-frame"><i></i><i></i><i></i><b>深度视频</b></span>
  </div>`;
}

function renderWatermarkRemovalGuideVisual() {
  return `<div class="toolbox-guide-visual toolbox-guide-visual-watermark" aria-hidden="true">
    <span class="toolbox-guide-watermark-frame"><i></i><b>水印</b><em></em></span>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-process"><i>⌖</i><b>标记区域</b></span>
    <span class="toolbox-guide-arrow">→</span>
    <span class="toolbox-guide-clean-frame"><i></i><b>干净画面</b></span>
  </div>`;
}

function renderPromptReversePluginStatus(state) {
  const status = state.pluginStatus || "unknown";
  const message = status === "ready"
    ? "视频反推提示词插件已安装，如不需要请卸载。"
    : status === "checking"
      ? "正在检测浏览器解析能力"
      : status === "installing"
        ? `${escapeHtml(state.installMessage || "正在安装视频解析插件")} · ${Math.round(state.installProgress || 0)}%`
      : status === "uninstalling"
          ? escapeHtml(state.installMessage || "正在清理浏览器解析插件")
      : status === "unavailable"
        ? "当前浏览器不支持本地视频解析"
        : "视频反推提示词需安装插件，请先安装";
  const action = status === "ready"
    ? `<button type="button" data-action="uninstall-toolbox-prompt-reverse-plugin">卸载</button>`
    : status === "not-installed"
      ? `<button type="button" data-action="install-toolbox-prompt-reverse-plugin">安装</button>`
      : status === "uninstalling"
        ? `<button type="button" data-action="check-toolbox-prompt-reverse-plugin">重新检测</button>`
        : ["checking", "installing"].includes(status)
          ? ""
          : `<button type="button" data-action="check-toolbox-prompt-reverse-plugin">重新检测</button>`;
  return `<div class="toolbox-reverse-plugin" data-plugin-status="${escapeAttr(status)}">
    <span class="toolbox-reverse-plugin-dot" aria-hidden="true"></span>
    <span data-toolbox-prompt-reverse-plugin-message>${message}</span>
    ${action}
  </div>`;
}

function renderVideoDepthModal(state) {
  const hasVideo = Boolean(state.previewUrl);
  const isLoading = state.status === "loading";
  const result = state.result && typeof state.result === "object" ? state.result : null;
  const depthColorLabel = VIDEO_DEPTH_COLOR_OPTIONS.find((option) => option.value === state.depthColor)?.label ?? VIDEO_DEPTH_COLOR_OPTIONS[0].label;
  const pluginStatus = state.pluginStatus || "unknown";
  const pluginReady = pluginStatus === "ready";
  const pluginBusy = ["checking", "installing", "uninstalling"].includes(pluginStatus);
  const pluginMessage = pluginReady
    ? "深度视频转绘插件已安装，如不需要请"
    : pluginStatus === "checking"
      ? "正在检测本地处理能力"
      : pluginStatus === "installing"
        ? `${escapeHtml(state.installMessage || "正在安装深度插件")} · ${Math.round(state.installProgress || 0)}%`
        : pluginStatus === "uninstalling"
          ? "正在卸载深度插件"
        : pluginStatus === "not-installed"
          ? "深度视频转绘需安装插件，请点击"
          : pluginStatus === "unavailable"
            ? "当前电脑浏览器不支持本地处理，请升级或更换浏览器"
            : "先检测本地处理能力，再安装深度插件";
  const pluginAction = pluginStatus === "not-installed"
      ? `<button type="button" class="toolbox-depth-plugin-action" data-action="install-toolbox-video-depth-plugin">安装</button>`
      : pluginReady
        ? `<button type="button" class="toolbox-depth-uninstall-action" data-action="uninstall-toolbox-video-depth-plugin" ${isLoading ? "disabled" : ""}>卸载</button>`
      : ["checking", "installing", "uninstalling"].includes(pluginStatus)
        ? ""
        : `<button type="button" class="toolbox-depth-plugin-action" data-action="check-toolbox-video-depth-plugin">检测</button>`;
  const pluginActionSuffix = pluginReady || pluginStatus === "not-installed" ? "。" : "";
  return `
    <div class="toolbox-reverse-scrim toolbox-depth-scrim">
      <section class="toolbox-depth-modal" role="dialog" aria-modal="true" aria-labelledby="toolbox-video-depth-title">
        <header class="toolbox-reverse-header toolbox-depth-header">
          <div class="toolbox-depth-header-main">
            <div class="toolbox-reverse-title">
              <span class="toolbox-reverse-mark toolbox-depth-mark" aria-hidden="true">◐</span>
              <div>
                <div class="toolbox-guide-title-row">
                  <h2 id="toolbox-video-depth-title">视频转深度</h2>
                  ${renderToolboxGuideTrigger("open-toolbox-video-depth-guide", "视频转深度", state.guideOpen)}
                </div>
                <p>处理速度与电脑环境关联、视频最大处理 500 MB</p>
              </div>
            </div>
            <div class="toolbox-depth-header-plugin" data-plugin-status="${escapeAttr(pluginStatus)}">
              <span class="toolbox-depth-plugin-dot" aria-hidden="true"></span>
              <span data-toolbox-depth-plugin-message>${pluginMessage}</span>
              ${pluginAction}${pluginActionSuffix}
            </div>
            <button type="button" class="toolbox-reverse-close" data-action="close-toolbox-video-depth" aria-label="关闭视频转深度" title="关闭">×</button>
          </div>
        </header>
        <div class="toolbox-depth-body">
          <section class="toolbox-depth-source" aria-label="原始视频">
            <div class="toolbox-depth-source-stage">
              ${hasVideo ? `
                <div class="toolbox-depth-preview">
                  <video src="${escapeAttr(state.previewUrl)}" controls preload="metadata"></video>
                  <div class="toolbox-reverse-preview-meta">
                    <span>${escapeHtml(state.fileName)}</span>
                    <button type="button" data-action="clear-toolbox-video-depth-file" ${isLoading ? "disabled" : ""}>移除</button>
                  </div>
                </div>
              ` : `
                <label class="toolbox-depth-dropzone ${pluginReady ? "" : "is-disabled"}" ${pluginReady ? "for=\"toolbox-video-depth-file\"" : "aria-disabled=\"true\""}>
                  <span class="toolbox-reverse-upload-icon" aria-hidden="true">↑</span>
                  <strong>${pluginReady ? "添加一段视频" : "等待本地插件就绪"}</strong>
                  <span>${pluginReady ? "选择 MP4、WEBM 或 MOV" : "安装完成后即可选择视频"}</span>
                </label>
              `}
            </div>
            <input id="toolbox-video-depth-file" class="toolbox-reverse-file-input" type="file" accept="video/mp4,video/webm,video/quicktime" />
            <footer class="toolbox-depth-source-footer">
              <div class="toolbox-depth-settings" aria-label="深度视频输出设置">
                ${renderVideoDepthSelect("清晰度", "toolbox-video-depth-resolution", "data-toolbox-video-depth-resolution", VIDEO_DEPTH_RESOLUTION_OPTIONS, state.resolution, isLoading)}
                ${renderVideoDepthSelect("帧率", "toolbox-video-depth-frame-rate", "data-toolbox-video-depth-frame-rate", VIDEO_DEPTH_FRAME_RATE_OPTIONS.map((value) => ({ value, label: `${value} FPS` })), state.frameRate, isLoading)}
                ${renderVideoDepthSelect("深度颜色", "toolbox-video-depth-color", "data-toolbox-video-depth-color", VIDEO_DEPTH_COLOR_OPTIONS, state.depthColor, isLoading)}
              </div>
              <span class="toolbox-depth-source-file-meta">${hasVideo ? `已选择 ${formatFileSize(state.fileSize)}` : ""}</span>
              <button type="button" class="toolbox-reverse-run" data-action="run-toolbox-video-depth" ${hasVideo && pluginReady && !isLoading && !pluginBusy ? "" : "disabled"}>${isLoading ? "正在生成…" : "生成深度视频"}</button>
            </footer>
            ${state.error ? `<p class="toolbox-reverse-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          </section>
          <section class="toolbox-depth-result" aria-live="polite">
            <header><span>${escapeHtml(depthColorLabel)}深度视频</span>${result?.downloadUrl ? `<a href="${escapeAttr(result.downloadUrl)}" download="${escapeAttr(result.fileName || "depth.mp4")}">下载</a>` : ""}</header>
            <div data-toolbox-depth-result-state>${isLoading ? `<div class="toolbox-reverse-empty toolbox-depth-processing"><span class="toolbox-reverse-loading" aria-hidden="true"></span><strong>深度视频转绘正在处理中</strong><div class="toolbox-depth-progress" data-toolbox-depth-progress aria-live="polite"><div class="toolbox-depth-progress-track"><span data-toolbox-depth-progress-bar style="width:${Math.round(state.progress || 0)}%"></span></div><span data-toolbox-depth-progress-label>${Math.round(state.progress || 0)}%</span></div></div>` : result?.downloadUrl ? `<div class="toolbox-depth-output"><video src="${escapeAttr(result.downloadUrl)}" controls loop preload="metadata"></video></div>` : `<div class="toolbox-reverse-empty"><span class="toolbox-reverse-empty-frame" aria-hidden="true"><i></i><i></i><i></i></span><strong>等待生成</strong><p>${pluginReady ? "选择视频后开始生成黑白深度视频。" : "安装深度插件后即可生成。"}</p></div>`}</div>
          </section>
        </div>
        ${state.guideOpen ? renderToolboxGuide("video-depth") : ""}
      </section>
    </div>
  `;
}

function renderWatermarkRemovalModal(state) {
  const isVideo = state.mediaKind === "video";
  const mediaLabel = isVideo ? "视频" : "图片";
  const hasImage = Boolean(state.previewUrl);
  const result = state.result && typeof state.result === "object" ? state.result : null;
  const isLoading = state.status === "loading" || state.status === "processing";
  const pluginInUse = isLoading;
  const pluginStatus = state.pluginStatus || "unknown";
  const pluginReady = pluginStatus === "ready";
  const pluginBusy = ["checking", "installing", "uninstalling"].includes(pluginStatus);
  const pluginMessage = pluginReady
    ? "去水印插件已安装"
    : pluginStatus === "checking"
      ? "正在检测本地去水印能力"
    : pluginStatus === "installing"
        ? `正在安装插件 ${Math.max(0, Math.min(100, Math.round(state.installProgress || 0)))}%`
        : pluginStatus === "uninstalling"
          ? "正在卸载本地去水印插件"
        : pluginStatus === "not-installed"
          ? "去除水印请先安装插件"
          : pluginStatus === "unavailable"
            ? "当前电脑暂不支持本地去水印"
            : "请先检测本地去水印能力";
  const pluginAction = pluginStatus === "not-installed"
    ? `<button type="button" data-action="install-toolbox-watermark-removal-plugin">安装</button>`
    : pluginReady
      ? ""
    : pluginBusy
      ? ""
      : `<button type="button" data-action="check-toolbox-watermark-removal-plugin">检测</button>`;
  const pluginUninstallAction = pluginReady
    ? `<button type="button" data-action="uninstall-toolbox-watermark-removal-plugin" ${pluginInUse ? "disabled" : ""}>卸载</button>`
    : "";
  const pluginInlineStatus = pluginReady
    ? `<span class="toolbox-watermark-plugin-inline" data-plugin-status="${escapeAttr(pluginStatus)}"><span class="toolbox-depth-plugin-dot" aria-hidden="true"></span><span>${pluginMessage}</span></span>`
    : "";
  const pluginActionSuffix = "";
  const canvasWidth = Math.max(1, Math.round(state.imageWidth || 1));
  const canvasHeight = Math.max(1, Math.round(state.imageHeight || 1));
  const maskTool = ["rectangle", "brush", "lasso"].includes(state.maskTool) ? state.maskTool : "rectangle";
  const maskHistory = Array.isArray(state.maskHistory) ? state.maskHistory : [];
  const progress = Math.max(0, Math.min(100, Math.round(state.progress || 0)));
  const ocrHint = isVideo
    ? `<strong>标记首帧水印区域</strong><span>处理时将自动跟踪该区域的位移</span>`
    : `<strong>标记水印区域</strong><span>支持矩形框选、画笔涂抹和套索区域</span>`;
  return `
    <div class="toolbox-reverse-scrim toolbox-watermark-scrim">
      <section class="toolbox-watermark-modal" role="dialog" aria-modal="true" aria-labelledby="toolbox-watermark-title">
        <header class="toolbox-reverse-header toolbox-watermark-header">
          <div class="toolbox-reverse-title">
            <span class="toolbox-reverse-mark toolbox-watermark-mark" aria-hidden="true">⌁</span>
            <div>
              <div class="toolbox-guide-title-row">
                <h2 id="toolbox-watermark-title">去水印</h2>
                ${renderToolboxGuideTrigger("open-toolbox-watermark-removal-guide", "去水印", state.guideOpen)}
              </div>
              <p>${isVideo ? "在视频首帧标记水印区域，本机逐帧跟踪并修复" : "拖拽框选需要移除的区域，由本机完成画面修复"}</p>
            </div>
          </div>
          <div class="toolbox-reverse-header-center toolbox-watermark-header-center">
            <nav class="toolbox-reverse-tabs" aria-label="去水印媒体类型">
              <button type="button" class="${!isVideo ? "is-active" : ""}" role="tab" data-action="set-toolbox-watermark-removal-media" data-toolbox-watermark-media="image" aria-selected="${!isVideo}" ${isLoading || pluginBusy ? "disabled" : ""}>图片</button>
              <button type="button" class="${isVideo ? "is-active" : ""}" role="tab" data-action="set-toolbox-watermark-removal-media" data-toolbox-watermark-media="video" aria-selected="${isVideo}" ${isLoading || pluginBusy ? "disabled" : ""}>视频</button>
            </nav>
          </div>
          <button type="button" class="toolbox-reverse-close" data-action="close-toolbox-watermark-removal" aria-label="关闭${mediaLabel}去水印" title="关闭">×</button>
        </header>

        <div class="toolbox-watermark-body">
          <section class="toolbox-watermark-editor" aria-label="水印区域标记">
            <header class="toolbox-watermark-toolbar">
              <div class="toolbox-watermark-selection-hint">
                ${ocrHint}
              </div>
              <div class="toolbox-watermark-tool-controls" aria-label="水印标记工具">
                <div class="toolbox-watermark-tool-switch" role="group" aria-label="标记方式">
                  <button type="button" data-action="set-toolbox-watermark-removal-tool" data-toolbox-watermark-tool="rectangle" aria-pressed="${maskTool === "rectangle"}" title="矩形框选" ${isLoading ? "disabled" : ""}>框选</button>
                  <button type="button" data-action="set-toolbox-watermark-removal-tool" data-toolbox-watermark-tool="brush" aria-pressed="${maskTool === "brush"}" title="画笔涂抹" ${isLoading ? "disabled" : ""}>画笔</button>
                  <button type="button" data-action="set-toolbox-watermark-removal-tool" data-toolbox-watermark-tool="lasso" aria-pressed="${maskTool === "lasso"}" title="套索区域" ${isLoading ? "disabled" : ""}>套索</button>
                </div>
                ${maskTool === "brush" ? `<div class="toolbox-watermark-brush-switch" role="group" aria-label="画笔大小">
                  ${[16, 32, 64].map((size) => `<button type="button" data-action="set-toolbox-watermark-removal-brush" data-toolbox-watermark-brush="${size}" aria-pressed="${Number(state.brushSize) === size}" title="${size} 像素画笔">${size}</button>`).join("")}
                </div>` : ""}
                <button type="button" class="toolbox-watermark-undo-mask" data-action="undo-toolbox-watermark-removal-mask" ${hasImage && maskHistory.length && !isLoading ? "" : "disabled"} title="撤销上一次标记" aria-label="撤销上一次标记">↶</button>
                <button type="button" class="toolbox-watermark-clear-mask" data-action="clear-toolbox-watermark-removal-mask" ${hasImage && state.maskDirty && !isLoading ? "" : "disabled"}>清除</button>
              </div>
            </header>

            <div class="toolbox-watermark-stage">
              ${hasImage ? `
                <div class="toolbox-watermark-canvas-wrap${isVideo ? " toolbox-watermark-video-preview" : ""}"${isVideo ? " data-toolbox-watermark-video-preview" : ""}>
                  ${isVideo
                    ? `<video src="${escapeAttr(state.previewUrl)}" controls playsinline preload="metadata" aria-label="待去水印的视频"></video>`
                    : `<img src="${escapeAttr(state.previewUrl)}" alt="待去水印原图" draggable="false" data-toolbox-watermark-image />`}
                  <canvas width="${canvasWidth}" height="${canvasHeight}" data-toolbox-watermark-mask data-mask-revision="${state.maskRevision}" data-toolbox-watermark-tool="${maskTool}" aria-label="${maskTool === "brush" ? "拖拽涂抹水印区域" : maskTool === "lasso" ? "拖拽圈选水印区域" : "拖拽框选水印区域"}"></canvas>
                </div>
              ` : `
                <label class="toolbox-watermark-dropzone ${pluginReady ? "" : "is-disabled"}" ${pluginReady ? "for=\"toolbox-watermark-file\"" : "aria-disabled=\"true\""}>
                  <span class="toolbox-reverse-upload-icon" aria-hidden="true">↑</span>
                  <strong>${pluginReady ? `添加需要处理的${mediaLabel}` : "等待本地插件就绪"}</strong>
                  <span>${pluginReady ? isVideo ? "支持 MP4、WEBM、MOV，建议 15 秒以内" : "支持 PNG、JPG、WEBP，最大 20 MB" : `安装插件后即可选择${mediaLabel}`}</span>
                </label>
              `}
            </div>
            <input id="toolbox-watermark-file" class="toolbox-reverse-file-input" type="file" accept="${isVideo ? "video/mp4,video/webm,video/quicktime" : "image/png,image/jpeg,image/webp"}" ${pluginReady && !isLoading ? "" : "disabled"} />

            <footer class="toolbox-watermark-editor-footer">
              <div class="toolbox-watermark-file-meta">
                ${hasImage ? `<span>${escapeHtml(state.fileName)} · ${formatFileSize(state.fileSize)}${isVideo && state.videoDuration ? ` · ${formatDuration(state.videoDuration)}` : ""}</span>` : ""}
                ${hasImage ? `<button type="button" data-action="clear-toolbox-watermark-removal-file" ${isLoading ? "disabled" : ""}>移除</button>` : ""}
                ${pluginInlineStatus}
                ${pluginUninstallAction}
              </div>
              <button type="button" class="toolbox-reverse-run" data-action="run-toolbox-watermark-removal" ${hasImage && state.maskDirty && pluginReady && !isLoading && !pluginBusy ? "" : "disabled"}>${isLoading ? "正在处理…" : isVideo ? "开始跟踪去水印" : "开始去水印"}</button>
            </footer>
            ${pluginReady ? "" : `<div class="toolbox-watermark-plugin" data-plugin-status="${escapeAttr(pluginStatus)}">
              ${pluginStatus === "installing" ? "" : `<span class="toolbox-depth-plugin-dot" aria-hidden="true"></span>`}
              <span data-toolbox-watermark-plugin-message>${pluginMessage}</span>
              ${pluginAction}${pluginActionSuffix}
            </div>`}
            ${state.error ? `<p class="toolbox-reverse-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
          </section>

          <section class="toolbox-watermark-result" aria-live="polite">
            <header>
              <span>处理结果</span>
              ${result?.downloadUrl ? `<a href="${escapeAttr(result.downloadUrl)}" download="${escapeAttr(result.fileName || `watermark-removed.${isVideo ? "webm" : "png"}`)}">下载${mediaLabel}</a>` : ""}
            </header>
            <div class="toolbox-watermark-result-stage" data-toolbox-watermark-result-state>
              ${isLoading ? `
                <div class="toolbox-reverse-empty toolbox-watermark-processing">
                  <span class="toolbox-reverse-loading" aria-hidden="true"></span>
                  <strong data-toolbox-watermark-progress-message>${escapeHtml(state.statusMessage || "正在修复涂抹区域")}</strong>
                  <div class="toolbox-depth-progress" data-toolbox-watermark-progress aria-live="polite">
                    <div class="toolbox-depth-progress-track"><span data-toolbox-watermark-progress-bar style="width:${progress}%"></span></div>
                    <span data-toolbox-watermark-progress-label>${progress}%</span>
                  </div>
                </div>
              ` : result?.downloadUrl ? `
                <div class="toolbox-watermark-output">${isVideo ? `<video src="${escapeAttr(result.downloadUrl)}" controls loop preload="metadata" aria-label="去水印处理结果"></video>` : `<img src="${escapeAttr(result.downloadUrl)}" alt="去水印处理结果" />`}</div>
              ` : `
                <div class="toolbox-reverse-empty">
                  <span class="toolbox-reverse-empty-frame" aria-hidden="true"><i></i><i></i><i></i></span>
                  <strong>${hasImage ? state.maskDirty ? "可以开始处理" : "请框选水印区域" : `等待添加${mediaLabel}`}</strong>
                  <p>${hasImage ? isVideo ? "将从首帧开始跟踪选区，并逐帧完成修复。" : "可切换框选、画笔或套索，连续标记多个区域。" : `添加${mediaLabel}后选择工具标记需要移除的区域。`}</p>
                </div>
              `}
            </div>
          </section>
        </div>
        ${state.guideOpen ? renderToolboxGuide("watermark-removal") : ""}
      </section>
    </div>
  `;
}

function resolvePromptReverseState(ui = {}) {
  const state = ui.toolboxPromptReverse && typeof ui.toolboxPromptReverse === "object" ? ui.toolboxPromptReverse : {};
  const activeKind = state.activeKind === "video" || state.mode === "video" ? "video" : "image";
  const base = {
    open: false,
    guideOpen: false,
    models: [],
    selectedModelName: "",
    loadingModels: false,
    views: {},
    ...state,
    activeKind,
    mode: activeKind,
  };
  const view = resolvePromptReverseView(base, activeKind);
  return { ...base, ...view, activeKind, mode: activeKind };
}

function resolvePromptReverseView(state = {}, kind = "image") {
  const defaults = {
    file: null,
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    status: "idle",
    progress: 0,
    result: null,
    error: "",
    pluginOutput: null,
    keyFramePreviews: [],
    activeKeyFrameIndex: -1,
    segmentDurationSeconds: kind === "video" ? 15 : 0,
    ...(kind === "video" ? { pluginStatus: "unknown", pluginVersion: "", installProgress: 0, installMessage: "", uninstallPending: false } : {}),
  };
  const saved = state.views?.[kind];
  if (saved && typeof saved === "object") return { ...defaults, ...saved };
  const legacyKind = state.activeKind === "video" || state.mode === "video" ? "video" : "image";
  if (kind !== legacyKind) return defaults;
  return {
    ...defaults,
    file: state.file ?? null,
    fileName: String(state.fileName ?? ""),
    fileSize: Number(state.fileSize ?? 0) || 0,
    previewUrl: String(state.previewUrl ?? ""),
    status: String(state.status ?? "idle"),
    progress: Number(state.progress ?? 0) || 0,
    result: state.result ?? null,
    error: String(state.error ?? ""),
    pluginOutput: state.pluginOutput ?? null,
    keyFramePreviews: Array.isArray(state.keyFramePreviews) ? state.keyFramePreviews : [],
    activeKeyFrameIndex: Number.isInteger(state.activeKeyFrameIndex) ? state.activeKeyFrameIndex : -1,
    segmentDurationSeconds: Number(state.segmentDurationSeconds ?? 15) || 15,
    ...(kind === "video" ? {
      pluginStatus: String(state.pluginStatus ?? "unknown"),
      pluginVersion: String(state.pluginVersion ?? ""),
      installProgress: Number(state.installProgress ?? 0) || 0,
      installMessage: String(state.installMessage ?? ""),
      uninstallPending: state.uninstallPending === true,
    } : {}),
  };
}

function resolveVideoDepthState(ui = {}) {
  const state = ui.toolboxVideoDepth && typeof ui.toolboxVideoDepth === "object" ? ui.toolboxVideoDepth : {};
  return {
    open: false,
    guideOpen: false,
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    status: "idle",
    pluginStatus: "unknown",
    pluginVersion: "",
    progress: 0,
    statusMessage: "",
    installProgress: 0,
    installMessage: "",
    resolution: "720p",
    frameRate: 8,
    depthColor: "grayscale",
    result: null,
    error: "",
    ...state,
  };
}

function resolveWatermarkRemovalState(ui = {}) {
  const state = ui.toolboxWatermarkRemoval && typeof ui.toolboxWatermarkRemoval === "object" ? ui.toolboxWatermarkRemoval : {};
  return {
    open: false,
    guideOpen: false,
    mediaKind: "image",
    file: null,
    fileName: "",
    fileSize: 0,
    previewUrl: "",
    imageWidth: 0,
    imageHeight: 0,
    videoDuration: 0,
    maskDataUrl: "",
    maskDirty: false,
    maskRevision: 0,
    ocrStatus: "idle",
    ocrProgress: 0,
    ocrMessage: "",
    ocrConfidence: 0,
    ocrRegionCount: 0,
    ocrPlatforms: [],
    ocrError: "",
    ocrRequestId: 0,
    autoMaskApplied: false,
    brushSize: 32,
    maskTool: "rectangle",
    maskHistory: [],
    status: "idle",
    progress: 0,
    statusMessage: "",
    pluginStatus: "unknown",
    pluginVersion: "",
    installProgress: 0,
    installMessage: "",
    result: null,
    error: "",
    ...state,
  };
}

function renderVideoDepthSelect(label, id, dataAttribute, options, selectedValue, disabled) {
  return `
    <label class="toolbox-depth-setting" for="${id}">
      <span>${label}</span>
      <select id="${id}" ${dataAttribute} ${disabled ? "disabled" : ""}>
        ${options.map((option) => `<option value="${escapeAttr(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderPromptReverseResult(result, mode = "image") {
  const usage = result.usage && typeof result.usage === "object" ? result.usage : {};
  const inputTokens = Number(usage.promptTokens || 0) + Number(usage.cachedTokens || 0);
  const usageText = Number(usage.totalTokens || 0) > 0
    ? `输入 ${formatTokenCount(inputTokens)} · 输出 ${formatTokenCount(usage.completionTokens)} · 总计 ${formatTokenCount(usage.totalTokens)} · 消耗积分 ${formatTokenCount(result.credit?.consumed)}`
    : "";
  const fields = [
    [mode === "video" ? "视频内容分析" : "画面描述", result.description],
    [mode === "video" ? "完整视频提示词" : "正向提示词", result.positivePrompt],
    ["标签", Array.isArray(result.tags) ? result.tags.join(", ") : result.tags],
    ["负向提示词", result.negativePrompt],
    ["本次 Token 消耗", usageText],
  ].filter(([, value]) => String(value ?? "").trim());
  const segments = mode === "video" && Array.isArray(result.segments) ? result.segments : [];
  const segmentHtml = segments.length ? `<section class="toolbox-reverse-segments"><span>分镜与资产提示词</span>${segments.map((segment, index) => {
    const assets = [
      ["人物", segment.characters],
      ["道具", segment.props],
      ["场景", segment.scenes],
    ].filter(([, items]) => Array.isArray(items) && items.length).map(([label, items]) => `<div class="toolbox-reverse-segment-assets"><strong>${label}资产</strong>${items.map((asset) => `<p><b>${escapeHtml(asset.name)}</b>：${escapeHtml(asset.prompt)}</p>`).join("")}</div>`).join("");
    return `<article class="toolbox-reverse-segment"><header><strong>分镜 ${Number(segment.index) || index + 1}</strong><small>${formatMilliseconds(segment.startMs)} - ${formatMilliseconds(segment.endMs)}</small></header>${segment.description ? `<p>${escapeHtml(segment.description)}</p>` : ""}${segment.positivePrompt ? `<div><span>视频提示词</span><p>${escapeHtml(segment.positivePrompt)}</p></div>` : ""}${assets}${segment.continuity ? `<div class="toolbox-reverse-segment-continuity"><span>衔接</span><p>${escapeHtml(segment.continuity)}</p></div>` : ""}</article>`;
  }).join("")}</section>` : "";
  return `<div class="toolbox-reverse-result-body">${fields.map(([label, value]) => `<section class="toolbox-reverse-result-field"><span>${label}</span><p>${escapeHtml(value)}</p></section>`).join("")}${segmentHtml}</div>`;
}

function formatTokenCount(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("zh-CN");
}

function formatMilliseconds(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function formatFileSize(value) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
