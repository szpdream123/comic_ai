import { escapeAttr, escapeHtml } from "./markup.js";

export function normalizeHomeAgentGenerationModel(model = {}) {
  const mediaType = normalizeHomeAgentGenerationMediaType(
    model?.mediaType ?? model?.media_type ?? model?.mediaKind,
  );
  const modelCode = String(model?.modelCode ?? model?.model_code ?? model?.id ?? "").trim();
  const status = String(model?.status ?? "").trim().toLowerCase();
  if (
    !modelCode
    || !["text", "image", "video", "audio"].includes(mediaType)
    || model?.enabled === false
    || model?.disabled === true
    || ["disabled", "inactive"].includes(status)
  ) {
    return null;
  }
  return {
    mediaType,
    modelCode,
    modelLabel: String(model?.modelLabel ?? model?.model_label ?? model?.displayName ?? modelCode).trim() || modelCode,
    description: String(model?.remark ?? model?.summary ?? model?.description ?? "").trim(),
  };
}

export function renderHomeAgentModelPicker({
  models = [],
  mediaType = "image",
  selectedModelCode = "",
  selectedModelCodes = null,
  open = false,
  disabled = false,
  triggerLabel = "选择模型",
  toggleAction = "toggle-home-agent-model-menu",
  selectAction = "select-home-agent-model",
  tabAction = "",
  tabs = [],
  menuField = "model",
  ariaLabel = "选择生成模型",
  actionAttribute = "data-action",
} = {}) {
  const actionAttr = actionAttribute === "data-agent-action" ? "data-agent-action" : "data-action";
  const activeMediaType = normalizeHomeAgentGenerationMediaType(mediaType) || "image";
  const visibleModels = models.filter((model) => model?.mediaType === activeMediaType && model?.modelCode);
  const selectedCode = String(selectedModelCodes?.[activeMediaType] ?? selectedModelCode ?? "").trim();
  const mediaLabel = activeMediaType === "video"
    ? "视频"
    : activeMediaType === "audio"
      ? "音频"
      : activeMediaType === "text"
        ? "文本"
        : "图片";
  return `
    <div class="home-agent-model-picker">
      <button type="button" class="home-agent-model-trigger${open ? " active" : ""}" ${actionAttr}="${escapeAttr(toggleAction)}" data-field="${escapeAttr(menuField)}" aria-haspopup="dialog" aria-expanded="${open === true}" aria-label="${escapeAttr(ariaLabel)}" title="${escapeAttr(ariaLabel)}" ${disabled ? "disabled" : ""}>${renderHomeAgentModelIcon("model")}<span>${escapeHtml(triggerLabel)}</span></button>
      ${open ? `<section class="home-agent-model-menu" role="dialog" aria-label="${escapeAttr(ariaLabel)}">
        ${tabs.length ? `<div class="home-agent-model-tabs" role="tablist" aria-label="模型类型">
          ${tabs.map(([kind, label]) => `<button type="button" role="tab" aria-selected="${activeMediaType === kind}" class="${activeMediaType === kind ? "active" : ""}" ${actionAttr}="${escapeAttr(tabAction)}" data-model-kind="${escapeAttr(kind)}">${escapeHtml(label)}</button>`).join("")}
        </div>` : ""}
        <div class="home-agent-model-options" role="listbox" aria-label="${mediaLabel}模型">
          ${visibleModels.length ? visibleModels.map((model) => `<button type="button" role="option" aria-selected="${selectedCode === model.modelCode}" class="home-agent-model-option${selectedCode === model.modelCode ? " active" : ""}" ${actionAttr}="${escapeAttr(selectAction)}" data-model-kind="${escapeAttr(activeMediaType)}" data-model-code="${escapeAttr(model.modelCode)}" data-model-id="${escapeAttr(model.modelCode)}" data-model-name="${escapeAttr(model.modelLabel)}">
            <span class="home-agent-model-option-icon" aria-hidden="true">${renderHomeAgentModelIcon(activeMediaType === "text" ? "model" : activeMediaType)}</span>
            <span><strong>${escapeHtml(model.modelLabel)}</strong>${model.description ? `<small>${escapeHtml(model.description)}</small>` : ""}</span>
            <i aria-hidden="true"></i>
          </button>`).join("") : `<p class="home-agent-model-empty">暂无可用${mediaLabel}模型</p>`}
        </div>
      </section>` : ""}
    </div>
  `;
}

export function resolveHomeAgentPreferredModels(ui = {}) {
  const configuredModels = Array.isArray(ui.episodeGenerationConfig?.models)
    ? ui.episodeGenerationConfig.models
    : [];
  const canvasDefaults = ui.canvasSettingsRecord?.settings?.defaultModels ?? {};
  const generationDefaults = ui.episodeGenerationConfig ?? {};
  return Object.fromEntries(
    ["text", "image", "video"].map((mediaType) => {
      const selected = String(ui.homeAgentSelectedModels?.[mediaType] ?? "").trim();
      const canvasDefault = String(canvasDefaults[mediaType] ?? "").trim();
      const generationDefault = String(
        mediaType === "image"
          ? generationDefaults.defaultImageModelCode ?? ""
          : mediaType === "video"
            ? generationDefaults.defaultVideoModelCode ?? ""
            : generationDefaults.defaultTextModelCode ?? "",
      ).trim();
      const firstAvailable = configuredModels.find((model) => (
        model?.enabled !== false &&
        normalizeHomeAgentGenerationMediaType(model?.mediaType ?? model?.media_type ?? model?.mediaKind) === mediaType &&
        String(model?.modelCode ?? model?.model_code ?? model?.id ?? "").trim()
      ));
      const fallback = String(firstAvailable?.modelCode ?? firstAvailable?.model_code ?? firstAvailable?.id ?? "").trim();
      return [mediaType, selected || canvasDefault || generationDefault || fallback];
    }).filter(([, modelCode]) => modelCode),
  );
}

function normalizeHomeAgentGenerationMediaType(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (normalized.includes("video") || ["i2v", "t2v", "lip_sync"].includes(normalized)) return "video";
  if (normalized.includes("image") || ["i2i", "t2i", "multi_reference"].includes(normalized)) return "image";
  if (normalized.includes("audio") || normalized.includes("speech") || ["tts", "music"].includes(normalized)) return "audio";
  if (normalized.includes("text") || ["llm", "chat"].includes(normalized)) return "text";
  return normalized;
}

function renderHomeAgentModelIcon(icon) {
  const paths = {
    audio: '<path d="M9 18V6l10-2v12" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="16" r="2" />',
    image: '<rect x="4.5" y="5" width="15" height="14" rx="2" /><path d="m7.5 16 3.4-4 2.5 2.8 1.7-2 2.9 3.2" /><circle cx="15.5" cy="9" r="1.2" />',
    model: '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /><path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" /><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /><path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" /><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /><path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" />',
    video: '<rect x="4" y="6" width="13" height="12" rx="2" /><path d="m17 10 4-2v8l-4-2" /><path d="M8 10.5 11.5 12 8 13.5z" />',
  };
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">${paths[icon] ?? paths.model}</svg>`;
}
