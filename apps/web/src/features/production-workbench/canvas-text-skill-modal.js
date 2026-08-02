import { disabled, escapeAttr, escapeHtml } from "./markup.js";

const CATEGORY_LABELS = {
  script: "转剧本",
  shot: "分镜",
  prop_extract: "道具抽取",
  character_extract: "人物抽取",
  scene_extract: "场景抽取",
  image_style: "生图风格",
  storyboard: "故事板",
  other: "其他",
};

const CATEGORY_ORDER = [
  "script",
  "shot",
  "prop_extract",
  "character_extract",
  "scene_extract",
  "image_style",
  "storyboard",
  "other",
];

export const CANVAS_IMAGE_GENERATION_SKILL_CATEGORIES = ["image_style", "storyboard", "other"];

export function resolveCanvasGenerationSkillCategories(node = {}) {
  const nodeType = String(node?.type ?? "").trim().toLowerCase();
  const mediaKind = String(node?.data?.mediaKind ?? "").trim().toLowerCase();
  const imageNodeTypes = ["send", "image", "ai-image", "ai-animation", "ai-panorama", "ai-storyboard"];
  return mediaKind === "image" || imageNodeTypes.includes(nodeType)
    ? [...CANVAS_IMAGE_GENERATION_SKILL_CATEGORIES]
    : [];
}

export function normalizeCanvasTextSkills(items = [], source = "") {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id ?? "").trim(),
      title: String(item?.title ?? item?.name ?? "未命名技能").trim(),
      summary: String(item?.summary ?? "").trim(),
      category: String(item?.category ?? item?.promptCategory ?? "other").trim() || "other",
      coverImageUrl: String(item?.coverImageUrl ?? item?.cover_image_url ?? item?.thumbnailUrl ?? item?.thumbnail_url ?? "").trim(),
      priceCredits: Math.max(0, Math.round(Number(item?.priceCredits ?? item?.price_credits ?? 0) || 0)),
      source: source || (item?.official === true ? "official" : "private"),
      official: item?.official === true,
    }))
    .filter((item) => item.id);
}

export function renderCanvasTextSkillModal({
  show = false,
  sourceTab = "official",
  activeCategory = "",
  officialSkills = [],
  privateSkills = [],
  draftSkillId = "",
  officialPagination = {},
  privatePagination = {},
  loading = false,
  allowedCategories = [],
} = {}) {
  if (!show) return "";
  const source = sourceTab === "private" ? "private" : "official";
  const categoryWhitelist = new Set((Array.isArray(allowedCategories) ? allowedCategories : []).map(String).filter(Boolean));
  const official = normalizeCanvasTextSkills(officialSkills, "official")
    .filter((item) => !categoryWhitelist.size || categoryWhitelist.has(item.category));
  const privateLibrary = normalizeCanvasTextSkills(privateSkills, "private")
    .filter((item) => !categoryWhitelist.size || categoryWhitelist.has(item.category));
  const allSkills = [...official, ...privateLibrary];
  const sourceSkills = source === "private" ? privateLibrary : official;
  const sourcePagination = source === "private" ? privatePagination : officialPagination;
  const sourceCategoryCounts = sourcePagination?.categoryCounts && typeof sourcePagination.categoryCounts === "object"
    ? sourcePagination.categoryCounts
    : {};
  const selected = allSkills.find((item) => item.id === String(draftSkillId ?? "")) ?? null;
  const categories = resolveCategoryTabs(allSkills, sourceCategoryCounts, [...categoryWhitelist]);
  const sourceCategories = resolveCategoryTabs(sourceSkills, sourceCategoryCounts, [...categoryWhitelist]);
  const category = (!categoryWhitelist.size || categoryWhitelist.has(activeCategory))
    && (sourceSkills.some((item) => item.category === activeCategory) || Number(sourceCategoryCounts[activeCategory]) > 0)
    ? activeCategory
    : (!categoryWhitelist.size || categoryWhitelist.has(selected?.category))
      && (sourceSkills.some((item) => item.category === selected?.category) || Number(sourceCategoryCounts[selected?.category]) > 0)
      ? selected.category
      : sourceCategories[0]?.id ?? categories[0]?.id ?? "other";
  const visibleSkills = String(sourcePagination?.category ?? "all") === "all"
    ? sourceSkills.filter((item) => item.category === category)
    : sourceSkills;
  return `
    <section class="canvas-text-skill-layer" data-canvas-text-skill-picker="true">
      <button class="canvas-text-skill-scrim" type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭技能选择"></button>
      <div class="canvas-text-skill-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-text-skill-title">
        <header class="canvas-text-skill-header">
          <div><span>GENERATION SKILLS</span><h2 id="canvas-text-skill-title">选择生成技能</h2></div>
          <button type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭" title="关闭">×</button>
        </header>
        <nav class="canvas-text-skill-tabs" aria-label="技能来源">
          ${renderSourceTab("official", "官方技能", sourceSkillTotal(officialPagination, official, categoryWhitelist), source)}
          ${renderSourceTab("private", "私人技能库", sourceSkillTotal(privatePagination, privateLibrary, categoryWhitelist), source)}
        </nav>
        <nav class="canvas-text-skill-category-tabs" aria-label="技能分类">
          ${categories.map((item) => renderCategoryTab(item, category, sourceSkills, sourceCategoryCounts)).join("")}
        </nav>
        <div class="canvas-text-skill-list" role="radiogroup" aria-label="${escapeAttr(categoryLabel(category))}技能">
          ${loading
            ? `<div class="canvas-text-skill-empty">正在加载技能...</div>`
            : visibleSkills.length
              ? visibleSkills.map((skill) => renderSkillCard(skill, selected?.id ?? "")).join("")
              : `<div class="canvas-text-skill-empty">${source === "private" ? "私人技能库" : "官方技能"}暂无${escapeHtml(categoryLabel(category))}技能</div>`}
        </div>
        ${renderSkillPagination(source, sourcePagination, loading)}
        <footer class="canvas-text-skill-footer">
          <div class="canvas-text-skill-selection">
            <small>当前选择</small>
            <strong>${escapeHtml(selected?.title ?? "未选择技能")}</strong>
            <span>${selected ? `${escapeHtml(categoryLabel(selected.category))} · ${formatCredits(selected.priceCredits)}` : "生成时仅使用模型提示词"}</span>
          </div>
          ${selected ? `<button class="canvas-text-skill-clear" type="button" data-action="clear-canvas-text-skill-draft">清除</button>` : ""}
          <button class="canvas-text-skill-cancel" type="button" data-action="close-canvas-text-skill-modal">取消</button>
          <button class="canvas-text-skill-confirm" type="button" data-action="confirm-canvas-text-skill" ${disabled(loading)}>确认选择</button>
        </footer>
      </div>
    </section>
  `;
}

function renderSourceTab(id, label, count, activeSource) {
  return `<button class="${id === activeSource ? "active" : ""}" type="button" data-action="set-canvas-text-skill-source" data-skill-source="${id}" aria-pressed="${id === activeSource}"><span>${label}</span><small>${count}</small></button>`;
}

function sourceSkillTotal(pagination = {}, skills = [], categoryWhitelist = new Set()) {
  if (categoryWhitelist.size && pagination?.categoryCounts && typeof pagination.categoryCounts === "object") {
    return [...categoryWhitelist].reduce((total, category) => total + Math.max(0, Number(pagination.categoryCounts[category]) || 0), 0);
  }
  return Math.max(0, Number(pagination?.total) || skills.length);
}

function renderCategoryTab(category, activeCategory, sourceSkills, categoryCounts = {}) {
  const active = category.id === activeCategory;
  const count = Math.max(0, Number(categoryCounts[category.id]) || sourceSkills.filter((item) => item.category === category.id).length);
  return `<button class="${active ? "active" : ""}" type="button" data-action="set-canvas-text-skill-category" data-skill-category="${escapeAttr(category.id)}" aria-pressed="${active}"><span>${escapeHtml(category.label)}</span><small>${count}</small></button>`;
}

function renderSkillCard(skill, selectedId) {
  const selected = skill.id === selectedId;
  return `
    <button
      class="canvas-text-skill-card ${selected ? "active" : ""}"
      type="button"
      role="radio"
      aria-checked="${selected}"
      data-action="select-canvas-text-skill-draft"
      data-skill-id="${escapeAttr(skill.id)}"
      data-skill-category="${escapeAttr(skill.category)}"
    >
      <span class="canvas-text-skill-card-mark ${skill.coverImageUrl ? "has-image" : ""}" aria-hidden="true">${skill.coverImageUrl
        ? `<img src="${escapeAttr(skill.coverImageUrl)}" alt="" loading="lazy" />`
        : escapeHtml(categoryLabel(skill.category).slice(0, 1))}</span>
      <span class="canvas-text-skill-card-copy">
        <span><small>${escapeHtml(categoryLabel(skill.category))}</small><em>${formatCredits(skill.priceCredits)}</em></span>
        <strong>${escapeHtml(skill.title)}</strong>
        <p>${escapeHtml(skill.summary || "使用该技能正文指导本次生成")}</p>
      </span>
      <i aria-hidden="true">✓</i>
    </button>
  `;
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? String(category || "其他");
}

function resolveCategoryTabs(skills, categoryCounts = {}, allowedCategories = []) {
  const whitelist = new Set((Array.isArray(allowedCategories) ? allowedCategories : []).filter(Boolean));
  if (whitelist.size) {
    return CATEGORY_ORDER.filter((category) => whitelist.has(category))
      .map((id) => ({ id, label: categoryLabel(id) }));
  }
  const available = new Set([
    ...skills.map((item) => item.category).filter(Boolean),
    ...Object.entries(categoryCounts).filter(([, count]) => Number(count) > 0).map(([category]) => category),
  ]);
  const ordered = CATEGORY_ORDER.filter((category) => available.has(category));
  const remaining = [...available].filter((category) => !CATEGORY_ORDER.includes(category));
  const categories = [...ordered, ...remaining];
  if (!categories.length) categories.push("other");
  return categories.map((id) => ({ id, label: categoryLabel(id) }));
}

function renderSkillPagination(source, pagination = {}, loading = false) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  if (totalPages <= 1) return "";
  return `
    <nav class="canvas-text-skill-pagination" aria-label="技能分页">
      <span>第 ${page} / ${totalPages} 页</span>
      <button type="button" data-action="set-canvas-text-skill-page" data-skill-page="${page - 1}" ${loading || page <= 1 ? "disabled" : ""}>上一页</button>
      <button type="button" data-action="set-canvas-text-skill-page" data-skill-page="${page + 1}" ${loading || page >= totalPages ? "disabled" : ""}>下一页</button>
    </nav>
  `;
}

function formatCredits(value) {
  const credits = Math.max(0, Math.round(Number(value) || 0));
  return credits ? `${credits}积分` : "免费";
}
