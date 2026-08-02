import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export const EPISODE_PROMPT_SKILL_CATEGORIES = [
  { id: "script", label: "转剧本提示词", shortLabel: "转剧本" },
  { id: "shot", label: "分镜提示词", shortLabel: "分镜" },
  { id: "prop_extract", label: "道具抽取提示词", shortLabel: "道具" },
  { id: "character_extract", label: "人物抽取提示词", shortLabel: "人物" },
  { id: "scene_extract", label: "场景抽取提示词", shortLabel: "场景" },
];

export function renderEpisodePromptSkillControl({ skills = [], selectedByCategory = {}, loading = false } = {}) {
  const selectedSkills = resolveSelectedSkills(skills, selectedByCategory);
  const total = selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0);
  const summary = selectedSkills.length
    ? `已选择 ${selectedSkills.length} 项技能`
    : loading
      ? "正在加载技能"
      : "请选择创作技能";
  return `
    <section class="episode-prompt-skill-control" aria-label="创作技能">
      <div class="single-episode-look-label">
        <span>创作技能</span>
        <i aria-hidden="true">?</i>
      </div>
      <button
        class="single-episode-look-trigger episode-prompt-skill-trigger"
        type="button"
        data-action="open-episode-prompt-skill-modal"
        aria-haspopup="dialog"
      >
        <span title="${escapeAttr(summary)}">${escapeHtml(summary)}</span>
        <small>${formatSkillCredits(total)}</small>
      </button>
    </section>
  `;
}

export function renderEpisodePromptSkillModal({
  show = false,
  sourceTab = "official",
  activeCategory = "script",
  officialSkills = [],
  privateSkills = [],
  draftSelections = {},
  selectionSkills = [],
  categories = EPISODE_PROMPT_SKILL_CATEGORIES,
  allowClear = true,
  showPagination = false,
  actions = {},
  officialPagination = {},
  privatePagination = {},
  loading = false,
  confirmLabel = "确认选择",
} = {}) {
  if (!show) return "";
  const normalizedSource = sourceTab === "private" ? "private" : "official";
  const supportedCategories = Array.isArray(categories) && categories.length ? categories : EPISODE_PROMPT_SKILL_CATEGORIES;
  const category = supportedCategories.some((item) => item.id === activeCategory)
    ? activeCategory
    : supportedCategories[0]?.id ?? "script";
  const resolvedActions = {
    close: "close-episode-prompt-skill-modal",
    source: "set-episode-prompt-skill-source",
    category: "set-episode-prompt-skill-category",
    select: "select-episode-prompt-skill-draft",
    clear: "clear-episode-prompt-skill-draft",
    page: "set-episode-prompt-skill-page",
    confirm: "confirm-episode-prompt-skills",
    ...actions,
  };
  const official = normalizeEpisodePromptSkills(officialSkills, "official");
  const privateLibrary = normalizeEpisodePromptSkills(privateSkills, "private");
  const allSkills = [...new Map([...official, ...privateLibrary, ...normalizeEpisodePromptSkills(selectionSkills)].map((item) => [item.id, item])).values()];
  const matchingSkills = (normalizedSource === "private" ? privateLibrary : official)
    .filter((item) => item.category === category);
  const pagination = normalizedSource === "private" ? privatePagination : officialPagination;
  const pageSize = Math.max(1, Number(pagination?.pageSize) || matchingSkills.length || 1);
  const page = Math.max(1, Number(pagination?.page) || 1);
  const visibleSkills = pagination?.pageSize
    ? matchingSkills.slice((page - 1) * pageSize, page * pageSize)
    : matchingSkills;
  const officialTotal = sourceSkillTotal(officialPagination, official, supportedCategories);
  const privateTotal = sourceSkillTotal(privatePagination, privateLibrary, supportedCategories);
  const selectedId = String(draftSelections?.[category] ?? "");
  const selectedSkills = resolveSelectedSkills(allSkills, draftSelections);
  const total = selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0);
  return `
    <section class="episode-skill-picker-layer" data-episode-skill-picker="true">
      <button class="episode-skill-picker-scrim" type="button" data-action="${escapeAttr(resolvedActions.close)}" aria-label="关闭创作技能"></button>
      <div class="episode-skill-picker-modal" role="dialog" aria-modal="true" aria-labelledby="episode-skill-picker-title">
        <header class="episode-skill-picker-header">
          <div>
            <span>WORKFLOW SKILLS</span>
            <h2 id="episode-skill-picker-title">选择创作技能</h2>
          </div>
          <button type="button" data-action="${escapeAttr(resolvedActions.close)}" aria-label="关闭" title="关闭">×</button>
        </header>
        <nav class="episode-skill-source-tabs" aria-label="技能来源">
          ${renderSourceTab("official", "官方技能", officialTotal, normalizedSource, resolvedActions.source)}
          ${renderSourceTab("private", "私人技能库", privateTotal, normalizedSource, resolvedActions.source)}
        </nav>
        <nav class="episode-skill-category-tabs" aria-label="提示词分类">
          ${supportedCategories.map((item) => {
            const selected = allSkills.find((skill) => skill.category === item.id && skill.id === String(draftSelections?.[item.id] ?? ""));
            return `
              <button
                class="${item.id === category ? "active" : ""}"
                type="button"
                data-action="${escapeAttr(resolvedActions.category)}"
                data-skill-category="${escapeAttr(item.id)}"
              >
                <span>${escapeHtml(item.shortLabel)}</span>
                <i data-episode-skill-category-summary="${escapeAttr(item.id)}" aria-label="${selected ? "已选择" : "未选择"}">${selected ? "✓" : ""}</i>
              </button>
            `;
          }).join("")}
        </nav>
        <div class="episode-skill-picker-body">
          <section class="episode-skill-list-panel" aria-label="${escapeAttr(categoryLabel(category))}">
            <header>
              <div>
                <span>${normalizedSource === "private" ? "PRIVATE LIBRARY" : "OFFICIAL"}</span>
                <h3>${escapeHtml(categoryLabel(category))}</h3>
              </div>
              ${allowClear && selectedId ? `<button type="button" data-action="${escapeAttr(resolvedActions.clear)}" data-skill-category="${escapeAttr(category)}">清除选择</button>` : ""}
            </header>
            <div class="episode-skill-list" role="listbox">
              ${loading
                ? `<div class="episode-skill-empty">正在加载技能...</div>`
                : visibleSkills.length
                  ? visibleSkills.map((skill) => renderSkillItem(skill, selectedId, resolvedActions.select)).join("")
                  : `<div class="episode-skill-empty">该分类暂无${normalizedSource === "private" ? "私人技能" : "官方技能"}</div>`}
            </div>
            ${renderSkillPagination(pagination, loading, resolvedActions.page, showPagination)}
          </section>
          <aside class="episode-selected-skills" aria-label="已选技能">
            <header>
              <div><span>SELECTED</span><h3>已选技能</h3></div>
              <small data-episode-selected-count>${selectedSkills.length}/${supportedCategories.length}</small>
            </header>
            <div class="episode-selected-skill-list">
              ${supportedCategories.map((item) => renderSelectedSkillRow({
                category: item,
                skill: allSkills.find((candidate) => candidate.category === item.id && candidate.id === String(draftSelections?.[item.id] ?? "")),
                categoryAction: resolvedActions.category,
                clearAction: resolvedActions.clear,
                allowClear,
                sourceTab: normalizedSource,
              })).join("")}
            </div>
          </aside>
        </div>
        <footer class="episode-skill-picker-footer">
          <div>
            <strong data-episode-skill-selected-count>已选 ${selectedSkills.length} 项</strong>
            <span>技能费用 <b data-episode-skill-total-price>${formatSkillCredits(total)}</b></span>
          </div>
          <button class="episode-skill-picker-cancel" type="button" data-action="${escapeAttr(resolvedActions.close)}">取消</button>
          <button class="episode-skill-picker-confirm" type="button" data-action="${escapeAttr(resolvedActions.confirm)}" ${disabled(loading)}>${escapeHtml(confirmLabel)}</button>
        </footer>
      </div>
    </section>
  `;
}

export function syncEpisodePromptSkillDraft(root, { category = "", selectedId = "", skills = [], draftSelections = {} } = {}) {
  const layer = root?.querySelector?.("[data-episode-skill-picker]");
  if (!layer) return false;
  for (const item of layer.querySelectorAll?.("[data-episode-skill-id]") ?? []) {
    const active = String(item.dataset.episodeSkillId ?? "") === String(selectedId);
    item.classList?.toggle?.("active", active);
    item.setAttribute?.("aria-selected", active ? "true" : "false");
  }
  const categorySummary = layer.querySelector?.(`[data-episode-skill-category-summary="${category}"]`);
  if (categorySummary) {
    categorySummary.textContent = selectedId ? "✓" : "";
    categorySummary.setAttribute?.("aria-label", selectedId ? "已选择" : "未选择");
  }
  const selectedSkills = resolveSelectedSkills(normalizeEpisodePromptSkills(skills), draftSelections);
  const selectedSkill = selectedSkills.find((skill) => skill.category === category);
  const selectedRow = layer.querySelector?.(`[data-episode-selected-category="${category}"]`);
  if (selectedRow) {
    selectedRow.classList?.toggle?.("has-selection", Boolean(selectedSkill));
    const name = selectedRow.querySelector?.(".episode-selected-skill-name");
    const price = selectedRow.querySelector?.(".episode-selected-skill-price");
    const clear = selectedRow.querySelector?.(".episode-selected-skill-clear");
    const open = selectedRow.querySelector?.("button[data-action='set-episode-prompt-skill-category']");
    if (name) name.textContent = selectedSkill?.title ?? "未选择";
    if (price) price.textContent = selectedSkill ? formatSkillCredits(selectedSkill.priceCredits) : "";
    if (clear) clear.hidden = !selectedSkill;
    if (open && selectedSkill?.source) open.dataset.skillSource = selectedSkill.source;
  }
  const count = layer.querySelector?.("[data-episode-skill-selected-count]");
  const asideCount = layer.querySelector?.("[data-episode-selected-count]");
  const total = layer.querySelector?.("[data-episode-skill-total-price]");
  if (count) count.textContent = `已选 ${selectedSkills.length} 项`;
  if (asideCount) asideCount.textContent = `${selectedSkills.length}/5`;
  if (total) total.textContent = formatSkillCredits(selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0));
  return true;
}

export function normalizeEpisodePromptSkills(items = [], source = "") {
  const validCategories = new Set(EPISODE_PROMPT_SKILL_CATEGORIES.map((item) => item.id));
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? item?.name ?? "未命名技能"),
      summary: String(item?.summary ?? ""),
      category: String(item?.category ?? item?.promptCategory ?? ""),
      priceCredits: Math.max(0, Math.round(Number(item?.priceCredits ?? item?.price_credits ?? 0) || 0)),
      source: source || (item?.official ? "official" : "private"),
      isDefault: item?.isDefault === true || item?.is_default === true,
    }))
    .filter((item) => item.id && validCategories.has(item.category));
}

export function sumEpisodePromptSkillCredits(skills = [], selectedByCategory = {}, excludedCategories = []) {
  const excluded = new Set(excludedCategories);
  return resolveSelectedSkills(normalizeEpisodePromptSkills(skills), selectedByCategory)
    .filter((skill) => !excluded.has(skill.category))
    .reduce((sum, skill) => sum + skill.priceCredits, 0);
}

function sourceSkillTotal(pagination = {}, skills = [], categories = []) {
  const allowedCategories = new Set((Array.isArray(categories) ? categories : []).map((item) => item?.id).filter(Boolean));
  const categoryCounts = pagination?.categoryCounts && typeof pagination.categoryCounts === "object"
    ? Object.entries(pagination.categoryCounts).filter(([category]) => !allowedCategories.size || allowedCategories.has(category))
    : [];
  if (categoryCounts.length) {
    return categoryCounts.reduce((sum, [, count]) => sum + Math.max(0, Number(count) || 0), 0);
  }
  return (Array.isArray(skills) ? skills : []).filter((skill) => !allowedCategories.size || allowedCategories.has(String(skill?.category ?? skill?.promptCategory ?? ""))).length;
}

function renderSkillPagination(pagination = {}, loading = false, action = "", alwaysShow = false) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  if ((!alwaysShow && totalPages <= 1) || !action) return "";
  return `<nav class="canvas-text-skill-pagination" aria-label="技能分页"><span>第 ${page} / ${totalPages} 页</span><button type="button" data-action="${escapeAttr(action)}" data-skill-page="${page - 1}" ${loading || page <= 1 ? "disabled" : ""}>上一页</button><button type="button" data-action="${escapeAttr(action)}" data-skill-page="${page + 1}" ${loading || page >= totalPages ? "disabled" : ""}>下一页</button></nav>`;
}
function renderSourceTab(id, label, count, activeTab, action) {
  return `
    <button class="${id === activeTab ? "active" : ""}" type="button" data-action="${escapeAttr(action)}" data-skill-source="${id}">
      <span>${label}</span><small>${count}</small>
    </button>
  `;
}

function renderSkillItem(skill, selectedId, action) {
  const selected = skill.id === selectedId;
  return `
    <button
      class="episode-skill-item ${selected ? "active" : ""}"
      type="button"
      role="option"
      aria-selected="${selected ? "true" : "false"}"
      data-action="${escapeAttr(action)}"
      data-episode-skill-id="${escapeAttr(skill.id)}"
      data-skill-category="${escapeAttr(skill.category)}"
    >
      <span class="episode-skill-item-mark" aria-hidden="true">${skill.source === "private" ? "私" : "官"}</span>
      <span class="episode-skill-item-copy"><strong>${escapeHtml(skill.title)}</strong>${skill.summary ? `<small>${escapeHtml(skill.summary)}</small>` : ""}</span>
      <em>${formatSkillCredits(skill.priceCredits)}</em>
      <i aria-hidden="true">✓</i>
    </button>
  `;
}

function renderSelectedSkillRow({ category, skill, sourceTab, categoryAction, clearAction, allowClear }) {
  return `
    <article class="episode-selected-skill ${skill ? "has-selection" : ""}" data-episode-selected-category="${escapeAttr(category.id)}">
      <button
        type="button"
        data-action="${escapeAttr(categoryAction)}"
        data-skill-category="${escapeAttr(category.id)}"
        data-skill-source="${escapeAttr(skill?.source ?? sourceTab)}"
      >
        <span class="episode-selected-skill-mark" aria-hidden="true">${escapeHtml(category.shortLabel.slice(0, 1))}</span>
        <span class="episode-selected-skill-copy">
          <small>${escapeHtml(category.label)}</small>
          <strong class="episode-selected-skill-name">${escapeHtml(skill?.title ?? "未选择")}</strong>
        </span>
        <em class="episode-selected-skill-price">${skill ? formatSkillCredits(skill.priceCredits) : ""}</em>
      </button>
      <button
        class="episode-selected-skill-clear"
        type="button"
        data-action="${escapeAttr(clearAction)}"
        data-skill-category="${escapeAttr(category.id)}"
        aria-label="清除${escapeAttr(category.label)}"
        title="清除选择"
        ${allowClear && skill ? "" : "hidden"}
      >×</button>
    </article>
  `;
}

function resolveSelectedSkills(skills, selectedByCategory) {
  return Object.entries(selectedByCategory ?? {})
    .map(([category, id]) => skills.find((skill) => skill.category === category && skill.id === String(id)))
    .filter(Boolean);
}

function categoryLabel(category) {
  return EPISODE_PROMPT_SKILL_CATEGORIES.find((item) => item.id === category)?.label ?? "提示词技能";
}

function formatSkillCredits(value) {
  const credits = Math.max(0, Math.round(Number(value) || 0));
  return credits ? `${credits}积分` : "免费";
}
