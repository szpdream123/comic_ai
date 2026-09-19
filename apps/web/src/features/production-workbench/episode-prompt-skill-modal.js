import { disabled, escapeAttr, escapeHtml } from "./markup.js";

export const EPISODE_PROMPT_SKILL_CATEGORIES = [
  { id: "script", label: "转剧本提示词", shortLabel: "转剧本" },
  { id: "shot", label: "分镜提示词", shortLabel: "分镜" },
  { id: "prop_extract", label: "道具抽取提示词", shortLabel: "道具" },
  { id: "character_extract", label: "人物抽取提示词", shortLabel: "人物" },
  { id: "scene_extract", label: "场景抽取提示词", shortLabel: "场景" },
];

export const EPISODE_PLAZA_SKILL_CATEGORIES = [
  { id: "recommended", label: "推荐", shortLabel: "推荐" },
  { id: "professional-film", label: "专业影视", shortLabel: "影视" },
  { id: "commercial-ad", label: "商业广告", shortLabel: "广告" },
  { id: "short-drama", label: "短剧漫剧", shortLabel: "短剧" },
  { id: "animation-game", label: "动漫游戏", shortLabel: "动漫" },
  { id: "music-video", label: "音乐MV", shortLabel: "MV" },
  { id: "creator", label: "自媒体创作", shortLabel: "自媒体" },
  { id: "general", label: "通用技能", shortLabel: "通用" },
  { id: "project-workflow", label: "项目工作流", shortLabel: "工作流" },
];

export const PROJECT_WORKFLOW_SKILL_CATEGORY = "project-workflow";

export function filterProjectWorkflowPlazaSkills(items = [], source = "", categories = EPISODE_PLAZA_SKILL_CATEGORIES) {
  return normalizePlazaEpisodeSkills(items, source, categories)
    .filter((item) => item.category === PROJECT_WORKFLOW_SKILL_CATEGORY);
}

export function filterOfficialProjectWorkflowPlazaSkills(items = [], source = "official", categories = EPISODE_PLAZA_SKILL_CATEGORIES) {
  return filterProjectWorkflowPlazaSkills(items, source, categories)
    .filter((item) => item.official === true && item.source !== "library" && item.source !== "mine" && item.source !== "private");
}

export function excludeProjectWorkflowPlazaSkills(items = [], source = "", categories = EPISODE_PLAZA_SKILL_CATEGORIES) {
  return normalizePlazaEpisodeSkills(items, source, categories)
    .filter((item) => item.category !== PROJECT_WORKFLOW_SKILL_CATEGORY);
}

export function resolvePlazaSkillCategories(items) {
  const mapped = (Array.isArray(items) ? items : [])
    .map((item) => {
      const code = String(item?.code ?? item?.id ?? "").trim();
      const label = String(item?.name ?? item?.label ?? "").trim();
      const shortLabel = String(item?.shortName ?? item?.shortLabel ?? label).trim();
      return {
        id: code,
        label,
        shortLabel,
        isVisible: item?.isVisible !== false,
        allowUserCreate: item?.allowUserCreate === true
          || item?.allow_user_create === true
          || (
            item?.allowUserCreate !== false
            && item?.allow_user_create !== false
            && code !== "recommended"
            && code !== "project-workflow"
          ),
      };
    })
    .filter((item) => item.id && item.label && item.isVisible);
  return mapped.length ? mapped : EPISODE_PLAZA_SKILL_CATEGORIES.map((item) => ({
    ...item,
    isVisible: true,
    allowUserCreate: item.id !== "recommended" && item.id !== "project-workflow",
  }));
}

export function plazaSkillCreateCategories(items) {
  return resolvePlazaSkillCategories(items).filter((item) => item.id !== "recommended" && item.allowUserCreate === true);
}

export const PLAZA_WORKFLOW_STAGES = ["script", "scene", "character", "prop", "shot"];
const PLAZA_WORKFLOW_STAGE_ALIASES = {
  script: "script",
  剧本: "script",
  转剧本: "script",
  screenplay: "script",
  scene: "scene",
  scenes: "scene",
  scene_extract: "scene",
  "scene-extract": "scene",
  场景: "scene",
  character: "character",
  characters: "character",
  character_extract: "character",
  "character-extract": "character",
  角色: "character",
  人物: "character",
  prop: "prop",
  props: "prop",
  prop_extract: "prop",
  "prop-extract": "prop",
  道具: "prop",
  shot: "shot",
  shots: "shot",
  storyboard: "shot",
  storyboards: "shot",
  分镜: "shot",
  拆镜: "shot",
};

function normalizePlazaWorkflowStageToken(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return PLAZA_WORKFLOW_STAGE_ALIASES[raw]
    || PLAZA_WORKFLOW_STAGE_ALIASES[raw.toLowerCase()]
    || PLAZA_WORKFLOW_STAGE_ALIASES[raw.toLowerCase().replace(/[\s_/]+/g, "-")]
    || "";
}

function collectPlazaWorkflowStagesFromText(text, collected) {
  const source = String(text ?? "");
  if (!source.trim()) return;
  if (/转剧本|小说转剧本|screenplay|\bscript\b/i.test(source)) collected.add("script");
  if (/场景|scene(?!board)/i.test(source)) collected.add("scene");
  if (/角色|人物|character/i.test(source)) collected.add("character");
  if (/道具|\bprops?\b/i.test(source)) collected.add("prop");
  if (/分镜|拆镜|storyboard|\bshots?\b/i.test(source)) collected.add("shot");
}

function collectPlazaWorkflowStagesFromFileName(fileName, collected) {
  const name = String(fileName ?? "").replace(/\\/g, "/").toLowerCase();
  if (!name) return;
  if (/(?:^|\/)(?:script|screenplay|转剧本)/.test(name)) collected.add("script");
  if (/(?:^|\/)(?:scene[-_]?extract|scenes?)(?:[-_.]|$)/.test(name) || name.includes("场景")) collected.add("scene");
  if (/(?:^|\/)(?:character[-_]?extract|characters?)(?:[-_.]|$)/.test(name) || name.includes("角色") || name.includes("人物")) collected.add("character");
  if (/(?:^|\/)(?:prop[-_]?extract|props?)(?:[-_.]|$)/.test(name) || name.includes("道具")) collected.add("prop");
  if (/(?:^|\/)(?:shot|storyboard)s?(?:[-_.]|$)/.test(name) || name.includes("分镜") || name.includes("拆镜")) collected.add("shot");
}

export function resolvePlazaSkillWorkflowStages(skills = [], options = {}) {
  const collected = new Set();
  for (const skill of Array.isArray(skills) ? skills : []) {
    const workflow = Array.isArray(skill?.workflow)
      ? skill.workflow
      : Array.isArray(skill?.detail?.workflow)
        ? skill.detail.workflow
        : [];
    const explicitStages = workflow
      .map((item) => {
        const token = item && typeof item === "object"
          ? item.stage ?? item.id ?? item.key ?? item.label ?? item.name
          : item;
        return normalizePlazaWorkflowStageToken(token);
      })
      .filter(Boolean);
    if (explicitStages.length) {
      for (const stage of explicitStages) collected.add(stage);
      continue;
    }
    for (const file of Array.isArray(skill?.files) ? skill.files : []) {
      collectPlazaWorkflowStagesFromFileName(
        typeof file === "string" ? file : String(file?.name ?? file?.fileName ?? ""),
        collected,
      );
    }
    collectPlazaWorkflowStagesFromText([
      skill?.title,
      skill?.name,
      skill?.summary,
      skill?.outputContent,
      skill?.detail?.outputContent,
      skill?.content,
      skill?.detail?.introduction,
    ].filter(Boolean).join("\n"), collected);
  }
  if (options.skipScriptStage === true) collected.delete("script");
  return PLAZA_WORKFLOW_STAGES.filter((stage) => collected.has(stage));
}

export function renderEpisodePromptSkillControl({
  skills = [],
  selectedByCategory = {},
  selectedPlazaSkillIds = [],
  loading = false,
  variant = "workflow",
  open = false,
} = {}) {
  const selectedSkills = variant === "plaza"
    ? resolvePlazaSelectedSkills(skills, selectedPlazaSkillIds)
    : resolveSelectedSkills(skills, selectedByCategory);
  const total = selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0);
  const summary = selectedSkills.length
    ? `已选择 ${selectedSkills.length} 项技能`
    : loading
      ? "正在加载技能"
      : "请选择创作技能";
  const label = variant === "plaza" ? "Skill" : "创作技能";
  if (variant === "plaza") {
    const triggerLabel = selectedSkills.length
      ? selectedSkills.map((skill) => skill.title).join("、")
      : loading
        ? "正在加载 Skill"
        : "请选择 Skill";
    return `
      <section class="episode-prompt-skill-control plaza-skill-chip-control${open ? " is-open" : ""}" aria-label="Skill">
        <div class="single-episode-look-label"><span>Skill</span></div>
        <button
          class="plaza-skill-chip-add"
          type="button"
          data-action="open-episode-prompt-skill-modal"
          aria-haspopup="dialog"
          aria-expanded="${open ? "true" : "false"}"
          aria-label="${escapeAttr(triggerLabel)}"
        >${escapeHtml(triggerLabel)}</button>
      </section>
    `;
  }
  return `
    <section class="episode-prompt-skill-control" aria-label="${escapeAttr(label)}">
      <div class="single-episode-look-label">
        <span>${escapeHtml(label)}</span>
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

export function renderOfficialProjectWorkflowSkillPicker({
  show = false,
  skills = [],
  selectedPlazaSkillIds = [],
  loading = false,
} = {}) {
  if (!show) return "";
  const officialSkills = filterOfficialProjectWorkflowPlazaSkills(skills);
  const selectedIds = normalizePlazaSkillIds(selectedPlazaSkillIds);
  const emptyCopy = loading ? "正在加载官方工作流 Skill..." : "暂无官方项目工作流 Skill";
  return `
    <section class="episode-skill-picker-layer plaza-skill-picker-layer project-workflow-skill-picker-layer" data-episode-skill-picker="true" data-episode-skill-variant="plaza">
      <div class="plaza-skill-picker-modal project-workflow-skill-picker" role="dialog" aria-modal="false" aria-labelledby="project-workflow-skill-picker-title">
        <header class="plaza-skill-picker-header">
          <h2 id="project-workflow-skill-picker-title">官方项目工作流 Skill</h2>
        </header>
        <div class="project-workflow-skill-list-body plaza-skill-picker-list" role="listbox" aria-label="官方项目工作流 Skill">
          ${officialSkills.length
            ? officialSkills.map((skill) => {
              const selected = selectedIds.includes(skill.id);
              return `
                <button
                  class="project-workflow-skill-item${selected ? " active" : ""}"
                  type="button"
                  role="option"
                  aria-selected="${selected ? "true" : "false"}"
                  data-action="select-official-project-workflow-skill"
                  data-episode-skill-id="${escapeAttr(skill.id)}"
                  title="${escapeAttr(skill.summary || skill.title)}"
                >
                  <span class="project-workflow-skill-icon" aria-hidden="true">⚒</span>
                  <span class="project-workflow-skill-copy">
                    <strong>${escapeHtml(skill.title)}</strong>
                    <small>${escapeHtml(skill.summary || "官方项目工作流")}</small>
                  </span>
                </button>
              `;
            }).join("")
            : `<div class="project-workflow-skill-empty">${escapeHtml(emptyCopy)}</div>`}
        </div>
      </div>
    </section>
  `;
}

export function renderEpisodePromptSkillModal({
  show = false,
  variant = "workflow",
  sourceTab = "official",
  activeCategory = "script",
  officialSkills = [],
  privateSkills = [],
  librarySkills = [],
  mineSkills = [],
  draftSelections = {},
  draftPlazaSkillIds = [],
  selectionSkills = [],
  query = "",
  categories = variant === "plaza" ? EPISODE_PLAZA_SKILL_CATEGORIES : EPISODE_PROMPT_SKILL_CATEGORIES,
  allowClear = true,
  showPagination = false,
  actions = {},
  officialPagination = {},
  privatePagination = {},
  loading = false,
  confirmLabel = "确认选择",
  categoryFilter = "",
} = {}) {
  if (!show) return "";
  const plazaMode = variant === "plaza";
  if (plazaMode) {
    return renderPlazaSkillPickerModal({
      sourceTab,
      officialSkills,
      librarySkills,
      mineSkills,
      privateSkills,
      draftPlazaSkillIds,
      query,
      loading,
      actions,
      categories,
      categoryFilter,
    });
  }
  const normalizedSource = sourceTab === "private" ? "private" : "official";
  const supportedCategories = Array.isArray(categories) && categories.length
    ? categories
    : plazaMode ? EPISODE_PLAZA_SKILL_CATEGORIES : EPISODE_PROMPT_SKILL_CATEGORIES;
  const category = supportedCategories.some((item) => item.id === activeCategory)
    ? activeCategory
    : supportedCategories[0]?.id ?? (plazaMode ? "recommended" : "script");
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
  const official = plazaMode
    ? normalizePlazaEpisodeSkills(officialSkills, "official")
    : normalizeEpisodePromptSkills(officialSkills, "official");
  const privateLibrary = plazaMode
    ? normalizePlazaEpisodeSkills(privateSkills, "private")
    : normalizeEpisodePromptSkills(privateSkills, "private");
  const extraSkills = plazaMode
    ? normalizePlazaEpisodeSkills(selectionSkills)
    : normalizeEpisodePromptSkills(selectionSkills);
  const allSkills = [...new Map([...official, ...privateLibrary, ...extraSkills].map((item) => [item.id, item])).values()];
  const matchingSkills = (normalizedSource === "private" ? privateLibrary : official)
    .filter((item) => plazaMode
      ? (category === "recommended" ? item.isRecommended === true : item.category === category)
      : item.category === category);
  const pagination = normalizedSource === "private" ? privatePagination : officialPagination;
  const pageSize = Math.max(1, Number(pagination?.pageSize) || matchingSkills.length || 1);
  const page = Math.max(1, Number(pagination?.page) || 1);
  const visibleSkills = pagination?.pageSize
    ? matchingSkills.slice((page - 1) * pageSize, page * pageSize)
    : matchingSkills;
  const officialTotal = sourceSkillTotal(officialPagination, official, plazaMode ? [] : supportedCategories);
  const privateTotal = sourceSkillTotal(privatePagination, privateLibrary, plazaMode ? [] : supportedCategories);
  const selectedPlazaIds = normalizePlazaSkillIds(draftPlazaSkillIds);
  const selectedId = plazaMode ? "" : String(draftSelections?.[category] ?? "");
  const selectedSkills = plazaMode
    ? resolvePlazaSelectedSkills(allSkills, selectedPlazaIds)
    : resolveSelectedSkills(allSkills, draftSelections);
  const total = selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0);
  const closeLabel = plazaMode ? "关闭技能skill" : "关闭创作技能";
  return `
    <section class="episode-skill-picker-layer" data-episode-skill-picker="true" data-episode-skill-variant="${plazaMode ? "plaza" : "workflow"}">
      <button class="episode-skill-picker-scrim" type="button" data-action="${escapeAttr(resolvedActions.close)}" aria-label="${escapeAttr(closeLabel)}"></button>
      <div class="episode-skill-picker-modal" role="dialog" aria-modal="true" aria-labelledby="episode-skill-picker-title">
        <header class="episode-skill-picker-header">
          <div>
            <span>${plazaMode ? "SKILL" : "WORKFLOW SKILLS"}</span>
            <h2 id="episode-skill-picker-title">${plazaMode ? "选择技能skill" : "选择创作技能"}</h2>
          </div>
          <button type="button" data-action="${escapeAttr(resolvedActions.close)}" aria-label="关闭" title="关闭">×</button>
        </header>
        <nav class="episode-skill-source-tabs" aria-label="技能来源">
          ${renderSourceTab("official", plazaMode ? "官方 Skill" : "官方技能", officialTotal, normalizedSource, resolvedActions.source)}
          ${renderSourceTab("private", plazaMode ? "我的 Skill" : "私人技能库", privateTotal, normalizedSource, resolvedActions.source)}
        </nav>
        <nav class="episode-skill-category-tabs" aria-label="${plazaMode ? "Skill 分类" : "提示词分类"}">
          ${supportedCategories.map((item) => {
            const selected = plazaMode
              ? selectedSkills.some((skill) => item.id === "recommended" ? skill.isRecommended === true : skill.category === item.id)
              : allSkills.find((skill) => skill.category === item.id && skill.id === String(draftSelections?.[item.id] ?? ""));
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
          <section class="episode-skill-list-panel" aria-label="${escapeAttr(plazaMode ? plazaCategoryLabel(category) : categoryLabel(category))}">
            <header>
              <div>
                <span>${normalizedSource === "private" ? (plazaMode ? "MY SKILLS" : "PRIVATE LIBRARY") : "OFFICIAL"}</span>
                <h3>${escapeHtml(plazaMode ? plazaCategoryLabel(category) : categoryLabel(category))}</h3>
              </div>
              ${allowClear && (plazaMode ? selectedSkills.length : selectedId) ? `<button type="button" data-action="${escapeAttr(resolvedActions.clear)}" ${plazaMode ? "" : `data-skill-category="${escapeAttr(category)}"`}>清除选择</button>` : ""}
            </header>
            <div class="episode-skill-list" role="${plazaMode ? "listbox" : "listbox"}" ${plazaMode ? 'aria-multiselectable="true"' : ""}>
              ${loading
                ? `<div class="episode-skill-empty">正在加载技能...</div>`
                : visibleSkills.length
                  ? visibleSkills.map((skill) => renderSkillItem(
                    skill,
                    plazaMode ? (selectedPlazaIds.includes(skill.id) ? skill.id : "") : selectedId,
                    resolvedActions.select,
                    plazaMode,
                  )).join("")
                  : `<div class="episode-skill-empty">该分类暂无${normalizedSource === "private" ? (plazaMode ? "我的 Skill" : "私人技能") : (plazaMode ? "官方 Skill" : "官方技能")}</div>`}
            </div>
            ${renderSkillPagination(pagination, loading, resolvedActions.page, showPagination)}
          </section>
          <aside class="episode-selected-skills" aria-label="已选技能">
            <header>
              <div><span>SELECTED</span><h3>已选技能</h3></div>
              <small data-episode-selected-count>${plazaMode ? selectedSkills.length : `${selectedSkills.length}/${supportedCategories.length}`}</small>
            </header>
            <div class="episode-selected-skill-list">
              ${plazaMode
                ? (selectedSkills.length
                  ? selectedSkills.map((skill) => renderSelectedPlazaSkillRow({
                    skill,
                    clearAction: resolvedActions.clear,
                    allowClear,
                  })).join("")
                  : `<div class="episode-skill-empty">尚未选择 Skill</div>`)
                : supportedCategories.map((item) => renderSelectedSkillRow({
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

export function syncEpisodePromptSkillDraft(root, {
  category = "",
  selectedId = "",
  skills = [],
  draftSelections = {},
  draftPlazaSkillIds = [],
  variant = "",
} = {}) {
  const layer = root?.querySelector?.("[data-episode-skill-picker]");
  if (!layer) return false;
  const plazaMode = variant === "plaza" || layer.dataset.episodeSkillVariant === "plaza";
  const selectedPlazaIds = normalizePlazaSkillIds(draftPlazaSkillIds);
  for (const item of layer.querySelectorAll?.("[data-episode-skill-id]") ?? []) {
    const skillId = String(item.dataset.episodeSkillId ?? "");
    const active = plazaMode ? selectedPlazaIds.includes(skillId) : skillId === String(selectedId);
    item.classList?.toggle?.("active", active);
    item.setAttribute?.("aria-selected", active ? "true" : "false");
  }
  const selectedSkills = plazaMode
    ? resolvePlazaSelectedSkills(normalizePlazaEpisodeSkills(skills), selectedPlazaIds)
    : resolveSelectedSkills(normalizeEpisodePromptSkills(skills), draftSelections);
  const categorySummary = layer.querySelector?.(`[data-episode-skill-category-summary="${category}"]`);
  if (categorySummary) {
    const selected = plazaMode
      ? selectedSkills.some((skill) => category === "recommended" ? skill.isRecommended === true : skill.category === category)
      : Boolean(selectedId);
    categorySummary.textContent = selected ? "✓" : "";
    categorySummary.setAttribute?.("aria-label", selected ? "已选择" : "未选择");
  }
  if (plazaMode) {
    const count = layer.querySelector?.("[data-episode-skill-selected-count]");
    const asideCount = layer.querySelector?.("[data-episode-selected-count]");
    const total = layer.querySelector?.("[data-episode-skill-total-price]");
    if (count) count.textContent = `已选 ${selectedSkills.length} 项`;
    if (asideCount) asideCount.textContent = String(selectedSkills.length);
    if (total) total.textContent = formatSkillCredits(selectedSkills.reduce((sum, skill) => sum + skill.priceCredits, 0));
    return true;
  }
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

export function normalizePlazaEpisodeSkills(items = [], source = "", categories = EPISODE_PLAZA_SKILL_CATEGORIES) {
  const validCategories = new Set(resolvePlazaSkillCategories(categories).map((item) => item.id));
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const category = String(item?.category ?? "").trim() || "general";
      const title = String(item?.title ?? item?.name ?? "未命名 Skill");
      const slug = String(item?.slug ?? item?.handle ?? item?.name ?? title)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
      return {
        id: String(item?.id ?? ""),
        title,
        summary: String(item?.summary ?? ""),
        slug,
        category: validCategories.has(category) && category !== "recommended" ? category : "general",
        isRecommended: item?.isRecommended === true || item?.is_recommended === true,
        priceCredits: Math.max(0, Math.round(Number(item?.priceCredits ?? item?.price_credits ?? 0) || 0)),
        source: source || (item?.isFavorite ? "library" : item?.isMine || item?.ownerUserId || item?.owner_user_id ? "mine" : "official"),
        official: item?.official === true
          || item?.isOfficial === true
          || item?.is_official === true
          || (
            item?.official !== false
            && item?.isOfficial !== false
            && item?.is_official !== false
            && !item?.isMine
            && !item?.isFavorite
            && !item?.ownerUserId
            && !item?.owner_user_id
            && (source === "official" || (!source && !item?.isMine && !item?.isFavorite))
          ),
        isMine: item?.isMine === true || Boolean(item?.ownerUserId || item?.owner_user_id),
        isFavorite: item?.isFavorite === true || item?.is_favorite === true,
        isDefault: item?.isDefault === true || item?.is_default === true,
        outputContent: String(item?.outputContent ?? item?.detail?.outputContent ?? ""),
        workflow: Array.isArray(item?.workflow)
          ? item.workflow
          : Array.isArray(item?.detail?.workflow)
            ? item.detail.workflow
            : [],
        files: Array.isArray(item?.files) ? item.files : [],
        content: String(item?.content ?? item?.detail?.introduction ?? ""),
      };
    })
    .filter((item) => item.id);
}

function renderPlazaSkillPickerModal({
  sourceTab = "official",
  officialSkills = [],
  librarySkills = [],
  mineSkills = [],
  privateSkills = [],
  draftPlazaSkillIds = [],
  query = "",
  loading = false,
  actions = {},
  categories = EPISODE_PLAZA_SKILL_CATEGORIES,
  categoryFilter = "",
} = {}) {
  const resolvedActions = {
    close: "close-episode-prompt-skill-modal",
    source: "set-episode-prompt-skill-source",
    select: "select-episode-prompt-skill-draft",
    confirm: "confirm-episode-prompt-skills",
    create: "open-skill-create-from-picker",
    browse: "open-skill-plaza-from-picker",
    detail: "open-skill-detail-from-picker",
    ...actions,
  };
  const normalizedSource = sourceTab === "library" || sourceTab === "mine" || sourceTab === "private"
    ? (sourceTab === "private" ? "mine" : sourceTab)
    : "official";
  const official = applyPlazaCategoryFilter(normalizePlazaEpisodeSkills(officialSkills, "official", categories), categoryFilter);
  const library = applyPlazaCategoryFilter(normalizePlazaEpisodeSkills(librarySkills.length ? librarySkills : [], "library", categories), categoryFilter);
  const mine = applyPlazaCategoryFilter(normalizePlazaEpisodeSkills(mineSkills.length ? mineSkills : privateSkills, "mine", categories), categoryFilter);
  const sourceSkills = normalizedSource === "library" ? library : normalizedSource === "mine" ? mine : official;
  const queryText = String(query ?? "").trim().toLowerCase();
  const visibleSkills = sourceSkills.filter((skill) =>
    !queryText || `${skill.title} ${skill.summary} ${skill.slug} ${skill.category}`.toLowerCase().includes(queryText),
  );
  const selectedPlazaIds = normalizePlazaSkillIds(draftPlazaSkillIds);
  const allSkills = [...new Map([...official, ...library, ...mine].map((item) => [item.id, item])).values()];
  const selectedSkills = resolvePlazaSelectedSkills(allSkills, selectedPlazaIds);
  return `
    <section class="episode-skill-picker-layer plaza-skill-picker-layer" data-episode-skill-picker="true" data-episode-skill-variant="plaza">
      <div class="plaza-skill-picker-modal" role="dialog" aria-modal="false" aria-labelledby="episode-skill-picker-title">
        <header class="plaza-skill-picker-header">
          <h2 id="episode-skill-picker-title">Skill</h2>
          <div class="plaza-skill-picker-header-actions">
            <button type="button" data-action="${escapeAttr(resolvedActions.create)}">+ 创建</button>
            <button type="button" data-action="${escapeAttr(resolvedActions.browse)}">全部</button>
          </div>
        </header>
        <div class="plaza-skill-picker-toolbar">
          <nav class="plaza-skill-picker-tabs" aria-label="Skill 来源">
            ${renderPlazaSourceTab("official", "通用", normalizedSource, resolvedActions.source)}
            ${renderPlazaSourceTab("library", "收藏", normalizedSource, resolvedActions.source)}
            ${renderPlazaSourceTab("mine", "我的", normalizedSource, resolvedActions.source)}
          </nav>
          <label class="plaza-skill-picker-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" data-episode-plaza-skill-search value="${escapeAttr(query)}" placeholder="搜索 Skill" aria-label="搜索 Skill" />
          </label>
        </div>
        <div class="plaza-skill-picker-list" role="listbox" aria-multiselectable="true">
          ${loading
            ? `<div class="episode-skill-empty">正在加载 Skill...</div>`
            : visibleSkills.length
              ? visibleSkills.map((skill) => renderPlazaSkillRow(skill, selectedPlazaIds.includes(skill.id), resolvedActions)).join("")
              : `<div class="episode-skill-empty">${queryText ? "没有匹配的 Skill" : normalizedSource === "library" ? "暂无收藏 Skill" : normalizedSource === "mine" ? "暂无我的 Skill" : "暂无公开 Skill"}</div>`}
        </div>
        <footer class="plaza-skill-picker-footer">
          <button type="button" data-action="${escapeAttr(resolvedActions.browse)}">没找到合适的？查看全部 Skill ›</button>
          <strong data-episode-skill-selected-count>已选 ${selectedSkills.length} 项</strong>
          <button class="plaza-skill-picker-confirm" type="button" data-action="${escapeAttr(resolvedActions.confirm)}" ${disabled(loading)}>确认选择</button>
        </footer>
      </div>
    </section>
  `;
}

function applyPlazaCategoryFilter(skills = [], categoryFilter = "") {
  const category = String(categoryFilter ?? "").trim();
  const list = Array.isArray(skills) ? skills : [];
  if (!category) {
    return list.filter((skill) => skill.category !== PROJECT_WORKFLOW_SKILL_CATEGORY);
  }
  return list.filter((skill) => skill.category === category);
}

function renderPlazaSourceTab(id, label, activeTab, action) {
  return `<button class="${id === activeTab ? "active" : ""}" type="button" data-action="${escapeAttr(action)}" data-skill-source="${id}">${escapeHtml(label)}</button>`;
}

function renderPlazaSkillRow(skill, selected, actions) {
  const slug = skill.slug ? `/${skill.slug}` : "";
  return `
    <article class="plaza-skill-picker-item ${selected ? "active" : ""}">
      <button
        type="button"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        data-action="${escapeAttr(actions.select)}"
        data-episode-skill-id="${escapeAttr(skill.id)}"
        data-skill-category="${escapeAttr(skill.category)}"
      >
        <span class="plaza-skill-picker-icon" aria-hidden="true">⚒</span>
        <span class="plaza-skill-picker-copy">
          <strong>${escapeHtml(skill.title)}${slug ? `<em>${escapeHtml(slug)}</em>` : ""}</strong>
          <small>${escapeHtml(skill.summary || plazaCategoryLabel(skill.category))}</small>
        </span>
      </button>
      <button type="button" class="plaza-skill-picker-detail" data-action="${escapeAttr(actions.detail)}" data-skill-id="${escapeAttr(skill.id)}">详情</button>
    </article>
  `;
}

export function normalizePlazaSkillIds(ids = []) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? "").trim()).filter(Boolean))];
}

export function togglePlazaSkillId(ids = [], skillId = "") {
  const nextId = String(skillId ?? "").trim();
  if (!nextId) return normalizePlazaSkillIds(ids);
  const current = normalizePlazaSkillIds(ids);
  return current.includes(nextId) ? current.filter((id) => id !== nextId) : [...current, nextId];
}

export function resolvePlazaSelectedSkills(skills = [], selectedIds = []) {
  const selected = new Set(normalizePlazaSkillIds(selectedIds));
  const unique = [];
  const seen = new Set();
  for (const skill of normalizePlazaEpisodeSkills(skills)) {
    if (!selected.has(skill.id) || seen.has(skill.id)) continue;
    seen.add(skill.id);
    unique.push(skill);
  }
  return unique;
}

export function sumPlazaEpisodeSkillCredits(skills = [], selectedIds = []) {
  return resolvePlazaSelectedSkills(skills, selectedIds)
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

function renderSkillItem(skill, selectedId, action, plazaMode = false) {
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
      <span class="episode-skill-item-mark" aria-hidden="true">${skill.source === "private" ? (plazaMode ? "我" : "私") : "官"}</span>
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

function renderSelectedPlazaSkillRow({ skill, clearAction, allowClear, categories = EPISODE_PLAZA_SKILL_CATEGORIES }) {
  const category = resolvePlazaSkillCategories(categories).find((item) => item.id === skill.category);
  return `
    <article class="episode-selected-skill has-selection" data-episode-selected-plaza-id="${escapeAttr(skill.id)}">
      <button type="button" data-action="${escapeAttr(clearAction)}" data-episode-skill-id="${escapeAttr(skill.id)}">
        <span class="episode-selected-skill-mark" aria-hidden="true">${escapeHtml((category?.shortLabel ?? "技").slice(0, 1))}</span>
        <span class="episode-selected-skill-copy">
          <small>${escapeHtml(category?.label ?? "Skill")}</small>
          <strong class="episode-selected-skill-name">${escapeHtml(skill.title)}</strong>
        </span>
        <em class="episode-selected-skill-price">${formatSkillCredits(skill.priceCredits)}</em>
      </button>
      <button
        class="episode-selected-skill-clear"
        type="button"
        data-action="${escapeAttr(clearAction)}"
        data-episode-skill-id="${escapeAttr(skill.id)}"
        aria-label="清除${escapeAttr(skill.title)}"
        title="清除选择"
        ${allowClear ? "" : "hidden"}
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

function plazaCategoryLabel(category, categories = EPISODE_PLAZA_SKILL_CATEGORIES) {
  return resolvePlazaSkillCategories(categories).find((item) => item.id === category)?.label ?? "Skill";
}

function formatSkillCredits(value) {
  const credits = Math.max(0, Math.round(Number(value) || 0));
  return credits ? `${credits}积分` : "免费";
}
