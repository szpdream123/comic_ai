import { escapeAttr, escapeHtml } from "./markup.js";
import { normalizeCanvasTextSkills } from "./canvas-text-skill-modal.js";

const CATEGORY_LABELS = {
  script: "剧本",
  shot: "分镜",
  prop_extract: "道具抽取",
  character_extract: "人物抽取",
  scene_extract: "场景抽取",
  storyboard: "故事板",
  other: "其他",
};

const WORKFLOW_CATEGORIES = new Set(["shot", "character_extract", "scene_extract", "prop_extract"]);

const CATEGORY_ORDER = [
  "shot",
  "character_extract",
  "scene_extract",
  "prop_extract",
  "script",
  "storyboard",
  "other",
];

export function renderCanvasScriptStartModal({
  show = false,
  sourceTab = "official",
  activeCategory = "",
  officialSkills = [],
  privateSkills = [],
  draftSkillId = "",
  customInstruction = "",
  officialPagination = {},
  privatePagination = {},
  loading = false,
} = {}) {
  if (!show) return "";
  const source = sourceTab === "private" ? "private" : "official";
  const official = normalizeCanvasTextSkills(officialSkills, "official")
    .filter((item) => WORKFLOW_CATEGORIES.has(item.category));
  const privateLibrary = normalizeCanvasTextSkills(privateSkills, "private")
    .filter((item) => WORKFLOW_CATEGORIES.has(item.category));
  const sourceSkills = source === "private" ? privateLibrary : official;
  const sourcePagination = source === "private" ? privatePagination : officialPagination;
  const sourceCategoryCounts = Object.fromEntries(Object.entries(sourcePagination?.categoryCounts ?? {})
    .filter(([category, count]) => WORKFLOW_CATEGORIES.has(category) && Number(count) > 0));
  const allSkills = [...official, ...privateLibrary];
  const selected = allSkills.find((item) => item.id === String(draftSkillId ?? "")) ?? null;
  const categories = resolveCategoryTabs(allSkills, sourceCategoryCounts);
  const category = sourceSkills.some((item) => item.category === activeCategory) || Number(sourceCategoryCounts[activeCategory]) > 0
    ? activeCategory
    : sourceSkills.some((item) => item.category === selected?.category) || Number(sourceCategoryCounts[selected?.category]) > 0
      ? selected.category
      : resolveCategoryTabs(sourceSkills, sourceCategoryCounts)[0]?.id ?? categories[0]?.id ?? "other";
  const visibleSkills = String(sourcePagination?.category ?? "all") === "all"
    ? sourceSkills.filter((item) => item.category === category)
    : sourceSkills;
  return `
    <section class="canvas-text-skill-layer canvas-script-start-layer" data-canvas-script-start-picker="true">
      <button class="canvas-text-skill-scrim" type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭开始设置"></button>
      <div class="canvas-text-skill-modal canvas-script-start-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-script-start-title">
        <header class="canvas-text-skill-header">
          <div><span>SCRIPT STORYBOARD / START</span><h2 id="canvas-script-start-title">开始生成分镜</h2></div>
          <button type="button" data-action="close-canvas-text-skill-modal" aria-label="关闭" title="关闭">×</button>
        </header>
        <nav class="canvas-text-skill-tabs" aria-label="技能来源">
          ${renderSourceTab("official", "官方技能", officialPagination?.total ?? official.length, source)}
          ${renderSourceTab("private", "私人技能库", privatePagination?.total ?? privateLibrary.length, source)}
        </nav>
        <nav class="canvas-text-skill-category-tabs" aria-label="技能分类">
          ${categories.map((item) => renderCategoryTab(item, category, sourceSkills, sourceCategoryCounts)).join("")}
        </nav>
        <div class="canvas-text-skill-list canvas-script-start-list" role="radiogroup" aria-label="分镜生成技能">
          <label class="canvas-script-start-input">
            <span><strong>自定义要求</strong><small>可选，补充镜头节奏、风格或改写方向</small></span>
            <textarea data-canvas-script-start-instruction aria-label="自定义分镜生成要求" maxlength="2000" placeholder="例如：节奏紧凑，突出雨夜的悬疑感，镜头以中近景为主">${escapeHtml(customInstruction)}</textarea>
          </label>
          ${loading
            ? `<div class="canvas-text-skill-empty">正在加载技能...</div>`
            : visibleSkills.length
              ? visibleSkills.map((skill) => renderSkillCard(skill, selected?.id ?? "")).join("")
              : `<div class="canvas-text-skill-empty">${source === "private" ? "私人技能库" : "官方技能"}暂无可用技能</div>`}
        </div>
        ${renderSkillPagination(sourcePagination, loading)}
        <footer class="canvas-text-skill-footer">
          <div class="canvas-text-skill-selection">
            <small>本次生成</small>
            <strong>${escapeHtml(selected?.title ?? "仅使用默认生成能力")}</strong>
            <span>${selected ? `${escapeHtml(categoryLabel(selected.category))} · ${escapeHtml(selected.source === "private" ? "私人技能" : "官方技能")}` : "也可以只填写自定义要求"}</span>
          </div>
          ${selected ? `<button class="canvas-text-skill-clear" type="button" data-action="clear-canvas-text-skill-draft">清除技能</button>` : ""}
          <button class="canvas-text-skill-cancel" type="button" data-action="close-canvas-text-skill-modal">取消</button>
          <button class="canvas-text-skill-confirm canvas-script-start-confirm" type="button" data-action="confirm-canvas-text-skill" ${loading ? "disabled" : ""}>开始生成</button>
        </footer>
      </div>
    </section>
  `;
}

function renderSourceTab(id, label, count, activeSource) {
  return `<button class="${id === activeSource ? "active" : ""}" type="button" data-action="set-canvas-text-skill-source" data-skill-source="${id}" aria-pressed="${id === activeSource}"><span>${label}</span><small>${count}</small></button>`;
}

function renderCategoryTab(category, activeCategory, sourceSkills, categoryCounts = {}) {
  const active = category.id === activeCategory;
  const count = Math.max(0, Number(categoryCounts[category.id]) || sourceSkills.filter((item) => item.category === category.id).length);
  return `<button class="${active ? "active" : ""}" type="button" data-action="set-canvas-text-skill-category" data-skill-category="${escapeAttr(category.id)}" aria-pressed="${active}"><span>${escapeHtml(category.label)}</span><small>${count}</small></button>`;
}

function renderSkillCard(skill, selectedId) {
  const selected = skill.id === selectedId;
  return `<button class="canvas-text-skill-card ${selected ? "active" : ""}" type="button" role="radio" aria-checked="${selected}" data-action="select-canvas-text-skill-draft" data-skill-id="${escapeAttr(skill.id)}" data-skill-category="${escapeAttr(skill.category)}">
    <span class="canvas-text-skill-card-mark" aria-hidden="true">${escapeHtml(categoryLabel(skill.category).slice(0, 1))}</span>
    <span class="canvas-text-skill-card-copy"><span><small>${escapeHtml(categoryLabel(skill.category))}</small><em>${skill.source === "private" ? "私人" : "官方"}</em></span><strong>${escapeHtml(skill.title)}</strong><p>${escapeHtml(skill.summary || "使用该技能指导本次分镜生成")}</p></span>
    <i aria-hidden="true">✓</i>
  </button>`;
}

function resolveCategoryTabs(skills, categoryCounts = {}) {
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

function renderSkillPagination(pagination = {}, loading = false) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  if (totalPages <= 1) return "";
  return `<nav class="canvas-text-skill-pagination" aria-label="技能分页"><span>第 ${page} / ${totalPages} 页</span><button type="button" data-action="set-canvas-text-skill-page" data-skill-page="${page - 1}" ${loading || page <= 1 ? "disabled" : ""}>上一页</button><button type="button" data-action="set-canvas-text-skill-page" data-skill-page="${page + 1}" ${loading || page >= totalPages ? "disabled" : ""}>下一页</button></nav>`;
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? String(category || "其他");
}
