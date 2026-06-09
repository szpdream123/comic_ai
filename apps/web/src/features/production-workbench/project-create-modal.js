import { disabled, escapeHtml } from "./markup.js";

const FALLBACK_PROJECT_STYLES = [
  projectStyle("portrait_photography", "\u4eba\u50cf\u6444\u5f71"),
  projectStyle("cinematic_portrait", "\u7535\u5f71\u5199\u771f"),
  projectStyle("chinese_style", "\u4e2d\u56fd\u98ce"),
  projectStyle("animation", "\u52a8\u753b"),
  projectStyle("three_d_render", "3D\u6e32\u67d3"),
  projectStyle("cyberpunk", "\u8d5b\u535a\u670b\u514b"),
  projectStyle("cg_animation", "CG \u52a8\u753b"),
  projectStyle("ink_wash", "\u6c34\u58a8\u753b"),
  projectStyle("oil_painting", "\u6cb9\u753b"),
  projectStyle("classic_art", "\u53e4\u5178"),
  projectStyle("watercolor", "\u6c34\u5f69\u753b"),
  projectStyle("cartoon", "\u5361\u901a"),
  projectStyle("flat_illustration", "\u5e73\u9762\u63d2\u753b"),
  projectStyle("landscape", "\u98ce\u666f"),
  projectStyle("hong_kong_anime", "\u6e2f\u98ce\u52a8\u6f2b"),
  projectStyle("pixel_art", "\u50cf\u7d20\u98ce\u683c"),
  projectStyle("fluorescent_painting", "\u8367\u5149\u7ed8\u753b"),
  projectStyle("colored_pencil", "\u5f69\u94c5\u753b"),
  projectStyle("figurine", "\u624b\u529e"),
  projectStyle("children_drawing", "\u513f\u7ae5\u7ed8\u753b"),
  projectStyle("abstract_art", "\u62bd\u8c61"),
  projectStyle("sharp_pen_illustration", "\u9510\u7b14\u63d2\u753b"),
  projectStyle("anime_2d", "\u4e8c\u6b21\u5143"),
  projectStyle("ink_print", "\u6cb9\u58a8\u5370\u5237"),
  projectStyle("printmaking", "\u7248\u753b"),
  projectStyle("monet_impressionism", "\u83ab\u5948"),
  projectStyle("picasso_cubism", "\u6bd5\u52a0\u7d22"),
  projectStyle("rembrandt_lighting", "\u4f26\u52c3\u6717"),
  projectStyle("matisse_fauvism", "\u9a6c\u8482\u65af"),
  projectStyle("baroque", "\u5df4\u6d1b\u514b"),
  projectStyle("retro_anime", "\u590d\u53e4\u52a8\u6f2b"),
  projectStyle("picture_book", "\u7ed8\u672c"),
];

function projectStyle(code, name) {
  return {
    code,
    name,
    coverImageUrl: `/admin/assets/prompt-covers/${code}.webp`,
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
