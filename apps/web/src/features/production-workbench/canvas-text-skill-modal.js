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

export function normalizeCanvasTextSkills(items = [], source = "") {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id ?? "").trim(),
      title: String(item?.title ?? item?.name ?? "未命名技能").trim(),
      summary: String(item?.summary ?? "").trim(),
      category: String(item?.category ?? item?.promptCategory ?? "other").trim() || "other",
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
  loading = false,
} = {}) {
  if (!show) return "";
  const source = sourceTab === "private" ? "private" : "official";
  const official = normalizeCanvasTextSkills(officialSkills, "official");
  const privateLibrary = normalizeCanvasTextSkills(privateSkills, "private");
  const allSkills = [...official, ...privateLibrary];
  const sourceSkills = source === "private" ? privateLibrary : official;
  const selected = allSkills.find((item) => item.id === String(draftSkillId ?? "")) ?? null;
  const categories = resolveCategoryTabs(allSkills);
  const sourceCategories = resolveCategoryTabs(sourceSkills);
  const category = sourceSkills.some((item) => item.category === activeCategory)
    ? activeCategory
    : sourceSkills.some((item) => item.category === selected?.category)
      ? selected.category
      : sourceCategories[0]?.id ?? categories[0]?.id ?? "other";
  const visibleSkills = sourceSkills.filter((item) => item.category === category);
  return `
    <section class="canvas-text-skill-layer" data-canvas-text-skill-picker="true">
      <button class="canvas-text-skill-scrim" type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭技能选择"></button>
      <div class="canvas-text-skill-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-text-skill-title">
        <header class="canvas-text-skill-header">
          <div><span>GENERATION SKILLS</span><h2 id="canvas-text-skill-title">选择生成技能</h2></div>
          <button type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭" title="关闭">×</button>
        </header>
        <nav class="canvas-text-skill-tabs" aria-label="技能来源">
          ${renderSourceTab("official", "官方技能", official.length, source)}
          ${renderSourceTab("private", "私人技能库", privateLibrary.length, source)}
        </nav>
        <nav class="canvas-text-skill-category-tabs" aria-label="技能分类">
          ${categories.map((item) => renderCategoryTab(item, category, sourceSkills)).join("")}
        </nav>
        <div class="canvas-text-skill-list" role="radiogroup" aria-label="${escapeAttr(categoryLabel(category))}技能">
          ${loading
            ? `<div class="canvas-text-skill-empty">正在加载技能...</div>`
            : visibleSkills.length
              ? visibleSkills.map((skill) => renderSkillCard(skill, selected?.id ?? "")).join("")
              : `<div class="canvas-text-skill-empty">${source === "private" ? "私人技能库" : "官方技能"}暂无${escapeHtml(categoryLabel(category))}技能</div>`}
        </div>
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

function renderCategoryTab(category, activeCategory, sourceSkills) {
  const active = category.id === activeCategory;
  const count = sourceSkills.filter((item) => item.category === category.id).length;
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
      <span class="canvas-text-skill-card-mark" aria-hidden="true">${escapeHtml(categoryLabel(skill.category).slice(0, 1))}</span>
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

function resolveCategoryTabs(skills) {
  const available = new Set(skills.map((item) => item.category).filter(Boolean));
  const ordered = CATEGORY_ORDER.filter((category) => available.has(category));
  const remaining = [...available].filter((category) => !CATEGORY_ORDER.includes(category));
  const categories = [...ordered, ...remaining];
  if (!categories.length) categories.push("other");
  return categories.map((id) => ({ id, label: categoryLabel(id) }));
}

function formatCredits(value) {
  const credits = Math.max(0, Math.round(Number(value) || 0));
  return credits ? `${credits}积分` : "免费";
}
