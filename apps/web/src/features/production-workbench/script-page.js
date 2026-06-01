import { disabled, escapeHtml } from "./markup.js";

const SCRIPT_ENTRY_CARDS = [
  {
    group: "小说改编剧本",
    title: "从分析开始改编小说",
    body: "上传或粘贴小说后，先分析世界观、角色与章节结构，再进入剧本规划。",
    action: "open-script-modal",
    tone: "warm",
  },
  {
    group: "小说改编剧本",
    title: "直接开始改编小说",
    body: "跳过预分析，从已有小说文本直接进入剧本改编草稿。",
    action: "open-script-modal",
    tone: "warm",
  },
  {
    group: "AI 创作剧本",
    title: "从故事灵感创作剧本",
    body: "填写受众、题材、集数与灵感，让系统生成规划方案。",
    action: "open-original-script-modal",
    tone: "violet",
  },
  {
    group: "AI 创作剧本",
    title: "从剧本创作衍生剧本",
    body: "基于既有剧本延展番外、续集或不同平台版本。",
    action: "open-original-script-modal",
    tone: "violet",
  },
];

const SCRIPT_TYPE_OPTIONS = [
  ["all", "全部类型"],
  ["novel-adaptation", "小说改编"],
  ["source-script", "原始剧本"],
  ["ai-original", "AI 原创"],
  ["project-placeholder", "项目占位"],
];

const SCRIPT_SORT_OPTIONS = [
  ["updated-desc", "最近更新"],
  ["episode-desc", "集数最多"],
  ["title-asc", "名称 A-Z"],
];

export function renderScriptManagementPage({ state = {}, ui = {} } = {}) {
  const scriptRecord = state.projectDetail?.script ?? state.script ?? null;
  const projectRecord = state.projectDetail?.project ?? state.project ?? null;
  const episodes = Array.isArray(state.projectDetail?.episodes) ? state.projectDetail.episodes : [];
  const shots = Array.isArray(state.projectDetail?.shots) ? state.projectDetail.shots : [];
  const scriptCards = buildScriptCards({ projectRecord, scriptRecord, episodes, shots });
  const searchQuery = String(ui.scriptSearchQuery ?? "");
  const typeFilter = String(ui.scriptTypeFilter ?? "all");
  const sortOrder = String(ui.scriptSortOrder ?? "updated-desc");
  const filteredCards = sortScriptCards(
    filterScriptCards(scriptCards, { searchQuery, typeFilter }),
    sortOrder,
  );

  return `
    <section class="script-management-page" aria-label="剧本管理">
      <section class="script-entry-grid" aria-label="剧本创建入口">
        ${SCRIPT_ENTRY_CARDS.map(renderScriptEntryCard).join("")}
      </section>

      <section class="script-library-panel" aria-label="我的剧本">
        <header class="script-library-head">
          <div>
            <h1>我的剧本</h1>
            <p>共 ${filteredCards.length} 个剧本。剧本会在生成规划、项目上传或资产提取后沉淀到这里。</p>
          </div>
          <div class="script-library-tools">
            <label class="script-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                placeholder="搜索剧本名称"
                value="${escapeHtml(searchQuery)}"
                data-action="search-scripts"
              />
            </label>
            <label class="script-filter-select">
              <span class="sr-only">类型筛选</span>
              <select data-action="set-script-type-filter" aria-label="类型筛选">
                ${renderOptionList(SCRIPT_TYPE_OPTIONS, typeFilter)}
              </select>
            </label>
            <label class="script-filter-select">
              <span class="sr-only">排序</span>
              <select data-action="set-script-sort-order" aria-label="排序">
                ${renderOptionList(SCRIPT_SORT_OPTIONS, sortOrder)}
              </select>
            </label>
          </div>
        </header>
        ${
          filteredCards.length
            ? `<div class="script-record-list" aria-label="剧本记录列表">
                ${filteredCards.map(renderScriptRecordCard).join("")}
              </div>`
            : `<div class="script-empty-state">
                <strong>${searchQuery || typeFilter !== "all" ? "未找到匹配剧本" : "暂无剧本"}</strong>
                <span>${
                  searchQuery || typeFilter !== "all"
                    ? "试试切换关键词，或者清空筛选查看全部剧本。"
                    : "从上方选择小说改编或 AI 原创模式，完成设定后会生成规划方案。"
                }</span>
              </div>`
        }
      </section>

      <aside class="script-credit-note" aria-label="积分详情">
        <strong>积分详情</strong>
        <span>原创规划预计消耗 14 积分；真实生成接入后会按集数和后续任务动态计算。</span>
      </aside>
      <p id="workspace-status" class="workbench-toast" role="status">${escapeHtml(ui.toast ?? "已进入剧本管理。")}</p>
    </section>
  `;
}

function buildScriptCards({ projectRecord, scriptRecord, episodes, shots }) {
  if (!projectRecord && !scriptRecord) {
    return [];
  }

  const typeKey = inferScriptType(scriptRecord?.inputText);
  return [{
    id: scriptRecord?.id ?? projectRecord?.id ?? "script-primary",
    projectId: projectRecord?.id ?? projectRecord?.projectId ?? null,
    title: projectRecord?.name ?? "未命名剧本",
    typeKey,
    typeLabel: scriptTypeLabel(typeKey),
    status: normalizeScriptStatus(scriptRecord?.status, projectRecord?.phase, shots.length),
    episodeCount: episodes.length,
    shotCount: shots.length,
    updatedLabel: formatScriptTimestamp(scriptRecord?.updatedAt ?? projectRecord?.updatedAt ?? null),
    updatedAtValue: toTimestamp(scriptRecord?.updatedAt ?? projectRecord?.updatedAt ?? null),
    summary: summarizeScript(scriptRecord?.inputText),
    canParse: Boolean(projectRecord?.id && scriptRecord?.inputText && shots.length === 0),
    canOpenWorkspace: Boolean(projectRecord?.id),
  }];
}

function filterScriptCards(cards, { searchQuery = "", typeFilter = "all" } = {}) {
  const normalizedQuery = String(searchQuery ?? "").trim().toLocaleLowerCase();
  return cards.filter((card) => {
    if (typeFilter !== "all" && card.typeKey !== typeFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [card.title, card.typeLabel, card.summary, card.status.label]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
  });
}

function sortScriptCards(cards, sortOrder = "updated-desc") {
  const ranked = [...cards];
  ranked.sort((left, right) => {
    if (sortOrder === "episode-desc") {
      return (
        Number(right.episodeCount ?? 0) - Number(left.episodeCount ?? 0) ||
        Number(right.updatedAtValue ?? 0) - Number(left.updatedAtValue ?? 0)
      );
    }
    if (sortOrder === "title-asc") {
      return String(left.title ?? "").localeCompare(String(right.title ?? ""), "zh-CN-u-kn-true");
    }
    return (
      Number(right.updatedAtValue ?? 0) - Number(left.updatedAtValue ?? 0) ||
      String(left.title ?? "").localeCompare(String(right.title ?? ""), "zh-CN-u-kn-true")
    );
  });
  return ranked;
}

function renderScriptEntryCard(card) {
  return `
    <article class="script-entry-card ${card.tone}">
      <span>${escapeHtml(card.group)}</span>
      <h2>${escapeHtml(card.title)}</h2>
      <p>${escapeHtml(card.body)}</p>
      <button type="button" data-action="${escapeHtml(card.action)}">${escapeHtml(card.title)}</button>
    </article>
  `;
}

function renderScriptRecordCard(card) {
  return `
    <article class="script-record-card" data-script-id="${escapeHtml(card.id)}">
      <div class="script-record-main">
        <div class="script-record-head">
          <div>
            <strong>${escapeHtml(card.title)}</strong>
            <span>${escapeHtml(card.typeLabel)}</span>
          </div>
          <b class="script-record-status ${escapeHtml(card.status.tone)}">${escapeHtml(card.status.label)}</b>
        </div>
        <p class="script-record-summary">${escapeHtml(card.summary)}</p>
        <dl class="script-record-meta">
          <div><dt>集数</dt><dd>${card.episodeCount}</dd></div>
          <div><dt>分镜</dt><dd>${card.shotCount}</dd></div>
          <div><dt>更新</dt><dd>${escapeHtml(card.updatedLabel)}</dd></div>
        </dl>
      </div>
      <div class="script-record-actions">
        <button class="secondary-action compact" type="button" data-action="open-script-modal">重新上传</button>
        <button class="secondary-action compact" type="button" data-action="parse-script" ${disabled(!card.canParse)}>AI 拆分镜</button>
        <button class="primary-action compact" type="button" data-action="open-project-workspace" data-project-id="${escapeHtml(card.projectId ?? "")}" ${disabled(!card.canOpenWorkspace)}>进入剧集工作台</button>
      </div>
    </article>
  `;
}

function inferScriptType(inputText) {
  const normalized = String(inputText ?? "").trim();
  if (!normalized) {
    return "ai-original";
  }
  if (normalized.includes("待上传剧本")) {
    return "project-placeholder";
  }
  return normalized.length > 180 ? "novel-adaptation" : "source-script";
}

function scriptTypeLabel(typeKey) {
  return (
    {
      "ai-original": "AI 原创",
      "project-placeholder": "项目占位",
      "novel-adaptation": "小说改编",
      "source-script": "原始剧本",
    }[typeKey] ?? "原始剧本"
  );
}

function summarizeScript(inputText) {
  const normalized = String(inputText ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "尚未上传正式剧本，可以先从上方入口创建或补充。";
  }
  return normalized.length > 88 ? `${normalized.slice(0, 88)}...` : normalized;
}

function normalizeScriptStatus(scriptStatus, projectPhase, shotCount) {
  if (shotCount > 0 || scriptStatus === "parsed" || projectPhase === "shot_generation" || projectPhase === "export") {
    return { label: "已拆镜", tone: "ready" };
  }
  if (scriptStatus === "failed") {
    return { label: "失败", tone: "failed" };
  }
  if (scriptStatus === "ready" || projectPhase === "asset_review") {
    return { label: "待拆镜", tone: "pending" };
  }
  return { label: "草稿", tone: "draft" };
}

function formatScriptTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "刚刚";
  }

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function toTimestamp(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function renderOptionList(options, selectedValue) {
  return options
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join("");
}

export function renderOriginalScriptModal({ show = false, draft = {}, busy = false } = {}) {
  if (!show) {
    return "";
  }

  const fileName = draft.fileName ?? "";
  const audience = draft.audience ?? "女频";
  const genre = draft.genre ?? "都市奇幻";
  const episodeCount = draft.episodeCount ?? "";
  const cardSetting = draft.cardSetting ?? "标准分卡";
  const episodeLength = draft.episodeLength ?? "约 1 分钟";
  const inspiration = draft.inspiration ?? "";
  const canSubmit = Boolean(fileName.trim() && inspiration.trim() && episodeCount);

  return `
    <section class="modal-backdrop original-script-backdrop" role="dialog" aria-modal="true" aria-label="AI原创剧本设定">
      <div class="original-script-modal">
        <div class="original-script-head">
          <div>
            <h2>AI原创剧本设定</h2>
            <p>从故事灵感开始，先生成规划方案，再进入世界观、角色、章节和分集剧本。</p>
          </div>
          <button class="modal-close" type="button" data-action="close-original-script-modal" aria-label="关闭">×</button>
        </div>

        <div class="original-script-form">
          <label class="control-field">
            <span>文件名称 <em>*</em></span>
            <input id="original-script-file-name" type="text" maxlength="50" value="${escapeHtml(fileName)}" placeholder="请输入剧本名称" />
            <small>${[...fileName].length}/50</small>
          </label>
          <label class="control-field">
            <span>剧本受众</span>
            <select id="original-script-audience">
              ${renderOption("女频", audience)}
              ${renderOption("男频", audience)}
              ${renderOption("全年龄", audience)}
            </select>
          </label>
          <label class="control-field">
            <span>题材看点</span>
            <select id="original-script-genre">
              ${renderOption("都市奇幻", genre)}
              ${renderOption("逆袭爽感", genre)}
              ${renderOption("悬疑反转", genre)}
              ${renderOption("情感治愈", genre)}
            </select>
          </label>
          <label class="control-field">
            <span>拆分集数 <em>*</em></span>
            <select id="original-script-episode-count">
              <option value="">请选择拆分集数</option>
              ${renderOption("40集", episodeCount)}
              ${renderOption("50集", episodeCount)}
              ${renderOption("60集", episodeCount)}
              ${renderOption("自定义分集（1-100）", episodeCount)}
            </select>
          </label>
          <label class="control-field">
            <span>分卡设置</span>
            <select id="original-script-card-setting">
              ${renderOption("标准分卡", cardSetting)}
              ${renderOption("按剧情节点分卡", cardSetting)}
            </select>
          </label>
          <label class="control-field">
            <span>每集长度</span>
            <select id="original-script-episode-length">
              ${renderOption("约 1 分钟", episodeLength)}
              ${renderOption("约 2 分钟", episodeLength)}
              ${renderOption("约 3 分钟", episodeLength)}
            </select>
          </label>
          <label class="control-field original-script-inspiration">
            <span>创作灵感 <em>*</em></span>
            <textarea id="original-script-inspiration" placeholder="写下故事设定、主角、冲突和希望观众记住的钩子">${escapeHtml(inspiration)}</textarea>
            <small>${[...inspiration].length}/460</small>
          </label>
        </div>

        <footer class="original-script-actions">
          <p><strong>积分详情</strong><span>预计消耗 14 积分</span></p>
          <button class="secondary-action" type="button" data-action="close-original-script-modal">取消</button>
          <button class="primary-action" type="button" data-action="submit-original-script-settings" ${disabled(!canSubmit || busy)}>完成设定，生成规划方案</button>
        </footer>
      </div>
    </section>
  `;
}

function renderOption(value, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`;
}
