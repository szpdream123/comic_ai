const TOOLBOX_TOOLS = [
  {
    id: "prompt-reverse",
    title: "提示词反推",
    summary: "从参考图提炼构图、风格与画面提示词",
    category: "AI 图片",
    coverUrl: "/assets/library/official/scenes/scene-3d-neon-street.png",
  },
  {
    id: "video-depth",
    title: "视频转深度",
    summary: "将普通视频转换为黑白深度视频",
    category: "AI 视频",
    coverUrl: "/assets/library/official/scenes/scene-3d-neon-street.png",
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
  `;
}

function renderToolCard(tool) {
  const isVideoDepth = tool.id === "video-depth";
  const action = isVideoDepth ? "open-toolbox-video-depth" : "open-toolbox-prompt-reverse";
  return `
    <button type="button" class="toolbox-card ${isVideoDepth ? "toolbox-card-depth" : ""}" data-toolbox-tool="${tool.id}" data-action="${action}" aria-label="打开${tool.title}">
      <img class="toolbox-card-cover" src="${tool.coverUrl}" alt="霓虹街景参考图" loading="lazy" />
      <div class="toolbox-card-visual" aria-hidden="true">
        <span class="toolbox-card-source">${isVideoDepth ? "VIDEO" : "IMAGE"}</span>
        <span class="toolbox-card-scan ${isVideoDepth ? "toolbox-card-depth-scan" : ""}"></span>
        <span class="toolbox-card-prompt ${isVideoDepth ? "toolbox-card-depth-bars" : ""}">
          <i></i><i></i><i></i>
        </span>
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
    loadingModels: true,
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function closeToolboxPromptReverse(ui = {}) {
  ui.toolboxPromptReverse = {
    ...resolvePromptReverseState(ui),
    open: false,
    error: "",
  };
  return ui.toolboxPromptReverse;
}

export function openToolboxVideoDepth(ui = {}) {
  ui.toolboxVideoDepth = { ...resolveVideoDepthState(ui), open: true };
  return ui.toolboxVideoDepth;
}

export function closeToolboxVideoDepth(ui = {}) {
  ui.toolboxVideoDepth = { ...resolveVideoDepthState(ui), open: false };
  return ui.toolboxVideoDepth;
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
    ...(activeKind === "video" ? { pluginOutput: null } : {}),
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
  const loadingTitle = state.status === "decoding"
    ? `本机正在解析视频 ${Math.round(state.progress || 0)}%`
    : state.status === "preparing"
      ? `正在整理 6 FPS 时间轴 ${Math.round(state.progress || 0)}%`
      : isVideo ? "正在反推视频提示词" : "正在分析参考图";
  const loadingCopy = state.status === "decoding"
    ? "解码与逐帧提取只在当前电脑进行，源视频不会上传服务器。"
    : state.status === "preparing"
      ? "正在将全部 6 FPS 时间轴画面按时间顺序整理为模型输入。"
      : isVideo
        ? "工具箱视频反推消耗积分，多模态模型正在分析完整时间轴的动作、场景与镜头信息。"
        : "工具箱图片反推消耗积分，模型正在提炼画面信息，请稍候。";
  return `
    <div class="toolbox-reverse-scrim">
      <section class="toolbox-reverse-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-reverse-title">
        <header class="toolbox-reverse-header">
          <div class="toolbox-reverse-title">
            <span class="toolbox-reverse-mark" aria-hidden="true">✦</span>
            <div>
              <h2 id="prompt-reverse-title">提示词反推</h2>
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

            <div class="toolbox-reverse-notes">
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
            ${isLoading ? `<div class="toolbox-reverse-empty" data-toolbox-prompt-reverse-loading><span class="toolbox-reverse-loading" aria-hidden="true"></span><strong data-toolbox-prompt-reverse-loading-title>${loadingTitle}</strong><p data-toolbox-prompt-reverse-loading-copy>${loadingCopy}</p></div>` : result ? renderPromptReverseResult(result, state.activeKind) : `<div class="toolbox-reverse-empty">
              <span class="toolbox-reverse-empty-frame" aria-hidden="true"><i></i><i></i><i></i></span>
              <strong>${hasSource ? "准备开始分析" : "等待参考素材"}</strong>
              <p>${hasSource ? "开始提炼素材信息。" : isVideo ? "添加视频后，从本机解析完整时间轴并生成提示词。" : "将参考图拖入左侧区域，生成可继续编辑的提示词。"}</p>
            </div>`}
          </section>
        </div>
      </section>
    </div>
  `;
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
                <h2 id="toolbox-video-depth-title">视频转深度</h2>
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
      </section>
    </div>
  `;
}

function resolvePromptReverseState(ui = {}) {
  const state = ui.toolboxPromptReverse && typeof ui.toolboxPromptReverse === "object" ? ui.toolboxPromptReverse : {};
  const activeKind = state.activeKind === "video" || state.mode === "video" ? "video" : "image";
  const base = {
    open: false,
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
  const fields = [
    [mode === "video" ? "视频内容分析" : "画面描述", result.description],
    [mode === "video" ? "完整视频提示词" : "正向提示词", result.positivePrompt],
    ["标签", Array.isArray(result.tags) ? result.tags.join(", ") : result.tags],
    ["负向提示词", result.negativePrompt],
  ].filter(([, value]) => String(value ?? "").trim());
  return `<div class="toolbox-reverse-result-body">${fields.map(([label, value]) => `<section class="toolbox-reverse-result-field"><span>${label}</span><p>${escapeHtml(value)}</p></section>`).join("")}</div>`;
}

function formatFileSize(value) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}
