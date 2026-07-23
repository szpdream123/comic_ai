import { escapeAttr, escapeHtml } from "./markup.js";

export function renderGenerationControlMenu({
  field,
  label,
  openMenu,
  options = [],
  action = "select-generation-field-option",
  title = "",
  toggleAction = "toggle-generation-select-menu",
  selectedValue = "",
  scope = "",
  nodeId = "",
  keepMenuOpen = "",
  keepMenuOpenMenu = "",
} = {}) {
  const normalizedField = String(field ?? "");
  const scopedField = scope ? `${scope}:${normalizedField}` : normalizedField;
  const open = openMenu === scopedField || (!scope && openMenu === normalizedField);
  const buttonTitle = title || label;
  const titleAttr = buttonTitle ? ` title="${escapeAttr(buttonTitle)}" aria-label="${escapeAttr(buttonTitle)}"` : "";
  const scopeAttrs = scope ? ` data-scope="${escapeAttr(scope)}"` : "";
  const nodeAttrs = nodeId ? ` data-node-id="${escapeAttr(nodeId)}"` : "";
  const keepOpenAttrs = [
    keepMenuOpen ? ` data-keep-menu-open="${escapeAttr(keepMenuOpen)}"` : "",
    keepMenuOpenMenu ? ` data-keep-menu-open-menu="${escapeAttr(keepMenuOpenMenu)}"` : "",
  ].join("");

  return `
    <span class="episode-replica-control-wrap">
      <button class="episode-replica-control ${open ? "active" : ""}" type="button" data-action="${escapeAttr(toggleAction)}" data-field="${escapeAttr(normalizedField)}"${scopeAttrs}${nodeAttrs}${titleAttr}>${escapeHtml(label)}</button>
      ${open ? `<span class="episode-replica-float-menu compact" data-field="${escapeAttr(normalizedField)}">${options.map((option) => {
        const [value, text, meta = "", preview = ""] = Array.isArray(option) ? option : ["", "", "", ""];
        const selected = selectedValue !== "" && String(value) === String(selectedValue);
        if (action === "select-video-model" || action === "select-canvas-model") {
          return `<button class="${selected ? "is-selected" : ""}" type="button" data-action="${escapeAttr(action)}" data-model-id="${escapeAttr(value)}" data-model-name="${escapeAttr(text)}"${scopeAttrs}${nodeAttrs}><strong>${escapeHtml(text)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</button>`;
        }
        return `<button class="${[selected ? "is-selected" : "", preview ? "has-preview" : ""].filter(Boolean).join(" ")}" type="button" data-action="${escapeAttr(action)}" data-field="${escapeAttr(normalizedField)}" data-value="${escapeAttr(value)}"${scopeAttrs}${nodeAttrs}${keepOpenAttrs}>${preview ? `<img src="${escapeAttr(preview)}" alt="" loading="lazy" /><span>${escapeHtml(text)}</span>` : escapeHtml(text)}</button>`;
      }).join("")}</span>` : ""}
    </span>
  `;
}

export function renderGenerationSettingsControl({
  kind = "video",
  openMenu = "",
  settings = {},
  scope = "",
  nodeId = "",
} = {}) {
  const isImage = kind === "image";
  const field = isImage ? "image-settings-panel" : "video-settings-panel";
  const scopedField = scope ? `${scope}:${field}` : field;
  const isOpen = openMenu === scopedField || (!scope && openMenu === field);
  const triggerLabel = isImage
    ? [
        formatGenerationSettingsTriggerValue(settings.currentResolution).toUpperCase(),
        formatGenerationSettingsTriggerValue(settings.currentRatio),
      ].filter(Boolean).join("  ")
    : [
        formatGenerationSettingsTriggerValue(settings.currentRatio),
        formatGenerationSettingsTriggerValue(settings.currentResolution),
        `${settings.currentDuration}秒`,
      ].filter(Boolean).join("  ");
  const scopeAttrs = scope ? ` data-scope="${escapeAttr(scope)}"` : "";
  const nodeAttrs = nodeId ? ` data-node-id="${escapeAttr(nodeId)}"` : "";
  const panelField = scopedField;
  const ariaLabel = isImage ? "打开图片参数面板" : "打开视频参数面板";
  const panelLabel = isImage ? "图片参数设置" : "视频参数设置";

  return `
    <span class="episode-replica-video-settings-wrap ${isOpen ? "is-open" : ""}">
      <button
        class="episode-replica-video-settings-trigger ${isOpen ? "is-open" : ""}"
        type="button"
        data-action="toggle-generation-select-menu"
        data-field="${escapeAttr(field)}"
        ${scopeAttrs}${nodeAttrs}
        aria-haspopup="dialog"
        aria-expanded="${isOpen ? "true" : "false"}"
        aria-label="${escapeAttr(ariaLabel)}"
      >
        <span class="episode-replica-video-settings-trigger-icon" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
        <span class="episode-replica-video-settings-trigger-copy">${escapeHtml(triggerLabel)}</span>
      </button>
      ${
        isOpen
          ? `
            <div class="episode-replica-video-settings-panel" data-menu-field="${escapeAttr(panelField)}" role="dialog" aria-label="${escapeAttr(panelLabel)}">
              ${isImage
                ? [
                    renderGenerationSettingsSection(settings.resolutionTitle, settings.resolutionField, settings.resolutionOptions, settings.currentResolution, { scope, nodeId, keepMenuOpenMenu: panelField, formatter: formatImageSettingsOptionLabel }),
                    renderGenerationSettingsSection(settings.ratioTitle, settings.ratioField, settings.ratioOptions, settings.currentRatio, { scope, nodeId, keepMenuOpenMenu: panelField, formatter: formatImageSettingsOptionLabel }),
                  ].join("")
                : [
                    renderGenerationSettingsSection("视频比例", settings.ratioField, settings.ratioOptions, settings.currentRatio, { scope, nodeId, keepMenuOpenMenu: panelField, formatter: formatVideoSettingsOptionLabel, showAspectRatioIcon: true }),
                    renderGenerationSettingsSection("分辨率", settings.resolutionField, settings.resolutionOptions, settings.currentResolution, { scope, nodeId, keepMenuOpenMenu: panelField, formatter: formatVideoSettingsOptionLabel }),
                    renderGenerationSettingsSection("视频时长", settings.durationField, settings.durationOptions, settings.currentDuration, { scope, nodeId, keepMenuOpenMenu: panelField, formatter: formatVideoSettingsOptionLabel }),
                  ].join("")}
            </div>
          `
          : ""
      }
    </span>
  `;
}

export function renderGenerationSubmitButton({
  action,
  cost,
  label = "生成",
  busy = false,
  className = "",
  attrs = "",
} = {}) {
  const extraClass = className ? ` ${escapeAttr(className)}` : "";
  return `
    <button class="episode-replica-generate${extraClass}" type="button" data-action="${escapeAttr(action)}"${attrs ? ` ${attrs}` : ""} ${busy ? "disabled" : ""}>
      <span>${escapeHtml(String(cost))}</span>
      <strong class="episode-replica-generate-label">${escapeHtml(busy ? "生成中" : label)}</strong>
    </button>
  `;
}

export function resolveGenerationCreditCost(mediaMode, generationControls = {}, selectedModel = null) {
  const pricingCost = resolveModelPricingCost(mediaMode, generationControls, selectedModel);
  if (pricingCost !== null) {
    return pricingCost;
  }
  if (Number.isFinite(Number(selectedModel?.credits)) && Number(selectedModel.credits) > 0) {
    return Number(selectedModel.credits);
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

function resolveModelPricingCost(mediaMode, generationControls = {}, selectedModel = null) {
  const pricing = readModelPricing(selectedModel);
  const baseCredits = readPositiveCredit(
    pricing.baseCredits,
    pricing.credits,
    pricing.cost,
    pricing.price,
    selectedModel?.baseCredits,
    selectedModel?.displayBaseCost,
    selectedModel?.credits,
  );
  if (baseCredits === null) return null;
  const parameters = resolveGenerationPricingParameters(mediaMode, generationControls, selectedModel);
  const unitCredits = readParameterUnitCredits(pricing, parameters) ?? baseCredits;
  const billingMode = normalizePricingBillingMode(pricing.billingMode ?? pricing.billing_mode ?? pricing.mode);
  const cost = billingMode === "duration" && mediaMode === "video"
    ? unitCredits * (readPositiveCredit(parameters.durationSec) ?? 1)
    : unitCredits;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return cost > 0 && cost < 1 ? 1 : Math.round(cost);
}

export function normalizeGenerationPricingObject(value) {
  let objectValue = null;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    objectValue = value;
  }
  if (typeof value !== "string" || !value.trim()) {
    if (!objectValue) return null;
  } else if (!objectValue) {
    try {
      const parsed = JSON.parse(value);
      objectValue = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      objectValue = null;
    }
  }
  if (!objectValue) return null;
  const normalized = { ...objectValue };
  if (normalized.baseCredits === undefined && objectValue.base_credits !== undefined) {
    normalized.baseCredits = objectValue.base_credits;
  }
  if (normalized.billingMode === undefined && objectValue.billing_mode !== undefined) {
    normalized.billingMode = objectValue.billing_mode;
  }
  if (normalized.resolutionCredits === undefined && objectValue.resolution_credits !== undefined) {
    normalized.resolutionCredits = objectValue.resolution_credits;
  }
  return normalized;
}

function readModelPricing(selectedModel = null) {
  const merged = {};
  for (const value of [selectedModel?.pricing, selectedModel?.pricingJson, selectedModel?.pricing_json]) {
    const pricing = normalizeGenerationPricingObject(value);
    if (pricing) {
      Object.assign(merged, pricing);
    }
  }
  const topLevelPricing = normalizeGenerationPricingObject({
    baseCredits: selectedModel?.baseCredits ?? selectedModel?.base_credits,
    billingMode: selectedModel?.billingMode ?? selectedModel?.billing_mode,
    resolutionCredits: selectedModel?.resolutionCredits ?? selectedModel?.resolution_credits,
    unit: selectedModel?.unit,
  });
  if (topLevelPricing) {
    for (const [key, value] of Object.entries(topLevelPricing)) {
      if (merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function normalizePricingBillingMode(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "duration" || normalized === "per_second" || normalized === "second" || normalized === "seconds" || normalized.includes("duration") || normalized.includes("time") || normalized.includes("second") || normalized.includes("时长") || normalized.includes("按秒")) {
    return "duration";
  }
  if (normalized === "fixed" || normalized.includes("固定")) {
    return "fixed";
  }
  return normalized;
}

function readPositiveCredit(...values) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
  }
  return null;
}

function resolveGenerationPricingParameters(mediaMode, generationControls = {}, selectedModel = null) {
  const parameterValues = generationControls.parameterValues && typeof generationControls.parameterValues === "object"
    ? generationControls.parameterValues
    : {};
  if (mediaMode === "video") {
    return {
      resolution: firstGenerationValue(
        parameterValues.resolution,
        parameterValues.videoResolution,
        generationControls.videoResolution,
        selectedModel?.defaultParams?.resolution,
        selectedModel?.defaultParams?.quality,
      ),
      quality: firstGenerationValue(parameterValues.quality, selectedModel?.defaultParams?.quality),
      ratio: firstGenerationValue(
        parameterValues.ratio,
        parameterValues.aspectRatio,
        parameterValues.imageAspectRatio,
        generationControls.imageAspectRatio,
        selectedModel?.defaultParams?.ratio,
        selectedModel?.defaultParams?.aspectRatio,
      ),
      aspectRatio: firstGenerationValue(
        parameterValues.aspectRatio,
        parameterValues.imageAspectRatio,
        generationControls.imageAspectRatio,
        selectedModel?.defaultParams?.aspectRatio,
        selectedModel?.defaultParams?.ratio,
      ),
      durationSec: firstGenerationValue(
        parameterValues.durationSec,
        parameterValues.videoDurationSec,
        generationControls.videoDurationSec,
        selectedModel?.defaultParams?.durationSec,
      ),
    };
  }
  return {
    size: firstGenerationValue(parameterValues.size, parameterValues.resolution, parameterValues.quality, generationControls.imageResolution, selectedModel?.defaultParams?.size),
    resolution: firstGenerationValue(parameterValues.resolution, parameterValues.imageResolution, generationControls.imageResolution, selectedModel?.defaultParams?.resolution),
    quality: firstGenerationValue(parameterValues.quality, parameterValues.imageResolution, generationControls.imageResolution, selectedModel?.defaultParams?.quality),
    ratio: firstGenerationValue(parameterValues.ratio, parameterValues.aspectRatio, parameterValues.imageAspectRatio, generationControls.imageAspectRatio, selectedModel?.defaultParams?.ratio),
    aspectRatio: firstGenerationValue(parameterValues.aspectRatio, parameterValues.imageAspectRatio, generationControls.imageAspectRatio, selectedModel?.defaultParams?.aspectRatio),
    count: firstGenerationValue(parameterValues.count, generationControls.imageCount, selectedModel?.defaultParams?.count),
  };
}

function readParameterUnitCredits(pricing = {}, parameters = {}) {
  const table = pricing.resolutionCredits && typeof pricing.resolutionCredits === "object" && !Array.isArray(pricing.resolutionCredits)
    ? pricing.resolutionCredits
    : null;
  if (!table) return null;
  for (const key of ["size", "resolution", "quality", "ratio", "aspectRatio"]) {
    const parameterValue = String(parameters[key] ?? "").trim();
    if (!parameterValue) continue;
    const configuredCredits = Number(table[parameterValue]);
    if (Number.isFinite(configuredCredits) && configuredCredits >= 0) return configuredCredits;
  }
  return null;
}

function firstGenerationValue(...candidates) {
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate);
    }
  }
  return "";
}

function renderGenerationSettingsSection(title, field, options = [], currentValue = "", { scope = "", nodeId = "", keepMenuOpenMenu = "", formatter = (_field, value) => value, showAspectRatioIcon = false } = {}) {
  if (!Array.isArray(options) || !options.length) {
    return "";
  }
  const scopeAttrs = scope ? ` data-scope="${escapeAttr(scope)}"` : "";
  const nodeAttrs = nodeId ? ` data-node-id="${escapeAttr(nodeId)}"` : "";
  return `
    <section class="episode-replica-video-settings-section">
      <strong>${escapeHtml(title)}</strong>
      <div class="episode-replica-video-settings-options">
        ${options.map((option) => {
          const [value, text] = Array.isArray(option) ? option : ["", ""];
          const optionLabel = formatter(field, text || value);
          const aspectRatioIcon = showAspectRatioIcon ? renderVideoAspectRatioIcon(value) : "";
          return `
            <button
              class="${[isGenerationSettingsOptionActive(value, currentValue) ? "is-active" : "", aspectRatioIcon ? "has-ratio-icon" : ""].filter(Boolean).join(" ")}"
              type="button"
              data-action="select-generation-field-option"
              data-field="${escapeAttr(field)}"
              data-value="${escapeAttr(value)}"
              data-keep-menu-open="true"
              data-keep-menu-open-menu="${escapeAttr(keepMenuOpenMenu)}"
              ${scopeAttrs}${nodeAttrs}
            >
              ${aspectRatioIcon ? `${aspectRatioIcon}<span>${escapeHtml(optionLabel)}</span>` : escapeHtml(optionLabel)}
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderVideoAspectRatioIcon(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (match) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return `<span class="episode-replica-video-settings-ratio-icon" style="--episode-ratio:${(width / height).toFixed(4)}" aria-hidden="true"></span>`;
    }
  }
  if (["adaptive", "auto", "smart", "智能"].includes(normalized)) {
    return `<span class="episode-replica-video-settings-ratio-icon is-adaptive" aria-hidden="true"></span>`;
  }
  return "";
}

function isGenerationSettingsOptionActive(value, currentValue) {
  return String(value ?? "").trim().toLowerCase() === String(currentValue ?? "").trim().toLowerCase();
}

function formatGenerationSettingsTriggerValue(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  if (/\d+\s*x\s*\d+/i.test(normalized)) {
    return normalized.replace(/\s*[xX]\s*/g, "x");
  }
  if (/^\d+$/.test(normalized)) {
    return normalized;
  }
  return normalized;
}

function formatVideoSettingsOptionLabel(field, value) {
  const normalized = String(value ?? "").trim();
  if (field === "durationSec" || field === "videoDurationSec") {
    return normalized.endsWith("秒") ? normalized : `${normalized}秒`;
  }
  if (field === "count") {
    return normalized.endsWith("条") ? normalized : `${normalized}条`;
  }
  if (field === "resolution" || field === "videoResolution") {
    return normalized;
  }
  return normalized;
}

function formatImageSettingsOptionLabel(field, value) {
  const normalized = String(value ?? "").trim();
  if (field === "count") {
    return normalized.endsWith("张") ? normalized : `${normalized}张`;
  }
  if (field === "quality" || field === "resolution" || field === "imageResolution") {
    return normalized.toUpperCase();
  }
  return normalized;
}
