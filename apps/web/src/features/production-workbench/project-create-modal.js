import { disabled, escapeHtml } from "./markup.js";

const FALLBACK_PROJECT_STYLES = [
  projectStyle("realistic", "写实摄影"),
  projectStyle("anime", "动漫风格"),
  projectStyle("watercolor", "水彩画"),
  projectStyle("oil-painting", "油画"),
  projectStyle("bewitching", "妖冶阴柔风"),
  projectStyle("sketch", "素描"),
  projectStyle("cyberpunk", "赛博朋克"),
  projectStyle("ink-wash", "水墨画"),
  projectStyle("pixel-art", "像素艺术"),
  projectStyle("cg-game", "CG游戏风"),
  projectStyle("3d-render", "3D 渲染"),
  projectStyle("flat-illustration", "扁平插画"),
  projectStyle("cinematic", "电影质感"),
  projectStyle("vintage", "复古胶片"),
  projectStyle("3d-guoman", "3D国漫风"),
];

function projectStyle(code, name) {
  return {
    code,
    name,
    coverImageUrl: `/api/public/style-covers/${encodeURIComponent(code)}`,
  };
}

export function renderProjectCreateModal({
  show = false,
  busy = false,
  defaultName = "",
  selectedAspectRatio = "9:16",
  selectedProjectType = "animation",
  projectStyles = FALLBACK_PROJECT_STYLES,
  notice = "",
  isProjectStyleMenuOpen = false,
} = {}) {
  if (!show) {
    return "";
  }
  const styles = normalizeProjectStyles(projectStyles);
  const selectedStyle = styles.find((style) => style.code === selectedProjectType) ?? styles[0];
  const selectedValue = selectedStyle?.code ?? selectedProjectType;

  return `
    <section class="modal-backdrop create-project-backdrop" role="dialog" aria-modal="true" aria-label="新建项目">
      <div class="create-project-modal">
        <div class="create-modal-head">
          <h2>新建项目</h2>
          <button class="modal-close" type="button" data-action="close-create-modal" aria-label="关闭">×</button>
        </div>
        ${notice ? `<p class="create-modal-toast" role="status">${escapeHtml(notice)}</p>` : ""}

        <div class="create-modal-body">
          <div class="create-modal-primary-grid">
            <label class="control-field project-name-field">
              <span>项目名称 <em>*</em></span>
              <input
                id="project-create-name-input"
                type="text"
                maxlength="50"
                value="${escapeHtml(defaultName)}"
                placeholder="请输入项目名称"
              />
              <small class="field-count">${defaultName.length}/50</small>
            </label>

            <fieldset class="create-fieldset project-style-fieldset">
              <legend>项目风格 <em>*</em></legend>
              ${renderProjectStylePicker(styles, selectedValue, isProjectStyleMenuOpen)}
            </fieldset>
          </div>

          <fieldset class="create-fieldset">
            <legend>画面比例 <em>*</em></legend>
            <p class="create-field-note">比例选择会影响后续剧集分镜生成，确认后建议保持一致。</p>
            <div class="aspect-ratio-grid">
              ${renderAspectChoice("9:16", "9:16 竖屏", selectedAspectRatio)}
              ${renderAspectChoice("16:9", "16:9 横屏", selectedAspectRatio)}
            </div>
          </fieldset>
        </div>

        <div class="create-modal-actions">
          <p class="modal-inline-status"></p>
          <button id="create-project-button" class="primary-action create-confirm-button" type="button" data-action="create-project" ${disabled(busy)}>
            确认
          </button>
        </div>
      </div>
    </section>
  `;
}

function renderAspectChoice(value, label, selectedValue) {
  return `
    <label class="choice-tile ${value === selectedValue ? "selected" : ""}">
      <input type="radio" name="project-aspect-ratio" value="${value}" ${value === selectedValue ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `;
}

function renderProjectStylePicker(styles, selectedValue, isOpen) {
  const selectedStyle = styles.find((style) => style.code === selectedValue) ?? styles[0];
  const expanded = Boolean(isOpen);
  return `
    <div class="project-style-picker ${expanded ? "open" : ""}">
      ${styles.map((style) => `
        <input
          type="radio"
          name="project-type"
          value="${escapeHtml(style.code)}"
          ${style.code === selectedValue ? "checked" : ""}
        />
      `).join("")}
      <button
        class="project-style-trigger"
        type="button"
        data-action="toggle-project-style-menu"
        aria-haspopup="listbox"
        aria-expanded="${expanded}"
      >
        ${renderProjectStyleThumb(selectedStyle)}
        <span>${escapeHtml(selectedStyle?.name ?? "请选择项目风格")}</span>
        <b aria-hidden="true">⌄</b>
      </button>
      <div class="project-style-menu" role="listbox" aria-label="项目风格">
        ${styles.map((style) => renderProjectStyleOption(style, selectedValue)).join("")}
      </div>
    </div>
  `;
}

function renderProjectStyleOption(style, selectedValue) {
  return `
    <button
      class="project-style-option ${style.code === selectedValue ? "selected" : ""}"
      type="button"
      role="option"
      aria-selected="${style.code === selectedValue}"
      data-action="select-project-style"
      data-value="${escapeHtml(style.code)}"
    >
      ${renderProjectStyleThumb(style)}
      <span>${escapeHtml(style.name)}</span>
    </button>
  `;
}

function renderProjectStyleThumb(style) {
  const name = style?.name ?? "风格";
  const cover = style?.coverImageUrl ?? "";
  if (!cover) {
    return `<span class="project-style-thumb fallback">${escapeHtml([...name][0] ?? "风")}</span>`;
  }
  return `<img class="project-style-thumb" src="${escapeHtml(cover)}" alt="${escapeHtml(name)}" />`;
}

function normalizeProjectStyles(styles) {
  const normalized = (Array.isArray(styles) ? styles : [])
    .filter((style) => style && typeof style === "object" && style.status !== "disabled")
    .map((style) => ({
      code: String(style.code ?? style.value ?? "").trim(),
      name: String(style.name ?? style.label ?? "").trim(),
      coverImageUrl: String(style.coverImageUrl ?? style.cover_image_url ?? style.image ?? "").trim(),
      status: String(style.status ?? "enabled"),
    }))
    .filter((style) => style.code && style.name);
  return normalized.length ? normalized : FALLBACK_PROJECT_STYLES;
}
