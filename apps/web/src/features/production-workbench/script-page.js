import { resolveApiUrl } from "../../shared/creator-api.js";
import { disabled, escapeHtml } from "./markup.js";

const SCRIPT_ENTRY_GROUPS = [
  {
    group: "小说改编剧本",
    body: "专家级编剧知识库，精细化改编全程可控，最高支持120万字",
    tone: "warm",
    actions: [
      { title: "从分析开始改编小说", action: "open-script-modal", modalMode: "manual" },
      { title: "直接开始改编小说", action: "open-script-modal", modalMode: "upload" },
    ],
  },
  {
    group: "AI 创作剧本",
    body: "AI原创剧本限时特惠，从灵感到成稿全程可控，百元完成百集长剧本。",
    tone: "violet",
    actions: [
      { title: "从故事灵感创作剧本", action: "open-original-script-modal", badge: true },
      { title: "从剧本创作衍生剧本", action: "open-original-script-modal", badge: true },
    ],
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
  const detailScripts = Array.isArray(state.projectDetail?.scripts) ? state.projectDetail.scripts : [];
  const libraryScripts = Array.isArray(ui.scriptLibraryRecords) ? ui.scriptLibraryRecords : [];
  const scriptRecords = libraryScripts.length
    ? libraryScripts
    : detailScripts.length
      ? detailScripts
      : scriptRecord
        ? [scriptRecord]
        : [];
  const projectRecord = state.projectDetail?.project ?? state.project ?? null;
  const episodes = Array.isArray(state.projectDetail?.episodes) ? state.projectDetail.episodes : [];
  const shots = Array.isArray(state.projectDetail?.shots) ? state.projectDetail.shots : [];
  const scriptCards = buildScriptCards({ projectRecord, scriptRecords, episodes, shots });
  const sortOrder = String(ui.scriptSortOrder ?? "updated-desc");
  const filteredCards = sortScriptCards(scriptCards, sortOrder);
  const selectedScriptId = String(ui.selectedScriptId ?? "");
  const selectedCard =
    filteredCards.find((card) => String(card.id) === selectedScriptId) ?? filteredCards[0] ?? null;
  const selectedScriptIds = normalizeSelectedScriptIds(ui.selectedScriptIds);
  const selectedCount = filteredCards.filter((card) => selectedScriptIds.has(String(card.id ?? ""))).length;

  if (ui.scriptDetailOpen && selectedCard) {
    return renderScriptReaderPage({
      card: selectedCard,
      projectRecord,
      scriptRecord: selectedCard.scriptRecord ?? scriptRecord,
      episodes,
      ui,
      selectedEpisodeId: ui.selectedScriptEpisodeId,
    });
  }

  return `
    <section class="script-management-page" aria-label="剧本管理">
      <section class="script-entry-grid" aria-label="剧本创建入口">
        ${SCRIPT_ENTRY_GROUPS.map(renderScriptEntryGroup).join("")}
      </section>

      <section class="script-library-panel" aria-label="我的剧本">
        ${renderScriptBulkToolbar({ totalCount: filteredCards.length, selectedCount })}
        ${
          filteredCards.length
            ? renderScriptRecordTabs(filteredCards, selectedCard, ui)
            : `<div class="script-empty-state">
                <strong>暂无剧本</strong>
                <span>从上方选择小说改编或 AI 原创模式，完成设定后会生成剧本。</span>
              </div>`
        }
      </section>

      ${renderScriptRenameModal(ui)}
      ${renderScriptDeleteModal({ ui, cards: scriptCards })}
      ${renderScriptStatusToast(ui.toast)}
    </section>
  `;
}

function renderScriptStatusToast(message) {
  const normalizedMessage = String(message ?? "").trim();
  if (!normalizedMessage) {
    return "";
  }
  const tone = resolveScriptToastTone(normalizedMessage);
  const title = tone === "error" ? "操作失败" : "操作成功";
  return `
    <div id="workspace-status" class="workbench-toast global-workbench-toast ${tone}" role="status" aria-live="polite">
      <strong>${title}</strong>
      <span>${escapeHtml(normalizedMessage)}</span>
    </div>
  `;
}

function resolveScriptToastTone(message) {
  const normalizedMessage = String(message ?? "").toLowerCase();
  const errorMarkers = [
    "失败",
    "错误",
    "未找到",
    "不可",
    "不能",
    "无法",
    "缺少",
    "请先",
    "请输入",
    "请选择",
    "failed",
    "failure",
    "error",
    "denied",
  ];
  return errorMarkers.some((marker) => normalizedMessage.includes(marker)) ? "error" : "success";
}

function buildScriptCards({ projectRecord, scriptRecords, episodes, shots }) {
  const records = Array.isArray(scriptRecords)
    ? scriptRecords.filter((scriptRecord) => scriptRecord && !scriptRecord.deletedAt)
    : [];
  if (!records.length) {
    return [];
  }

  return records.map((scriptRecord) => {
  const typeKey = inferScriptType(scriptRecord?.inputText);
  const projectPhase = scriptRecord?.projectPhase ?? scriptRecord?.project?.phase ?? projectRecord?.phase;
  const status = normalizeScriptStatus(scriptRecord?.status, projectPhase, shots.length);
  const sectionCount = Number(scriptRecord?.sectionCount ?? NaN);
  return {
    id: scriptRecord?.id ?? "script-primary",
    projectId: scriptRecord?.projectId ?? scriptRecord?.project?.id ?? projectRecord?.id ?? null,
    scriptRecord,
    title: scriptRecord?.title ?? scriptRecord?.projectName ?? scriptRecord?.project?.name ?? projectRecord?.name ?? "未命名剧本",
    typeKey,
    typeLabel: scriptTypeLabel(typeKey),
    status,
    episodeCount: Number.isFinite(sectionCount) && sectionCount > 0 ? sectionCount : episodes.length,
    shotCount: shots.length,
    coverImageUrl: resolveScriptCoverImage(scriptRecord),
    updatedAtValue: toTimestamp(scriptRecord?.updatedAt ?? scriptRecord?.projectUpdatedAt ?? projectRecord?.updatedAt ?? null),
    summary: summarizeScript(scriptRecord?.inputText),
    rawText: scriptRecord?.inputText ?? "",
  };
  });
}

function renderScriptEntryGroup(group) {
  return `
    <article class="script-entry-card ${group.tone}">
      <div class="script-entry-copy">
        <h2>${escapeHtml(group.group)}</h2>
        <p>${escapeHtml(group.body)}</p>
      </div>
      <div class="script-entry-actions">
        ${group.actions.map(renderScriptEntryAction).join("")}
      </div>
    </article>
  `;
}

function renderScriptEntryAction(card) {
  const modalModeAttr = card.modalMode ? ` data-script-modal-mode="${escapeHtml(card.modalMode)}"` : "";
  return `
    <button type="button" data-action="${escapeHtml(card.action)}"${modalModeAttr}>
      ${escapeHtml(card.title)}
      ${card.badge ? '<b class="script-entry-badge">全新功能，限时特惠</b>' : ""}
    </button>
  `;
}

function renderScriptRecordTabs(cards, selectedCard, ui = {}) {
  const selectedId = String(selectedCard?.id ?? cards[0]?.id ?? "");
  return `
    <div class="script-cover-tabs" aria-label="剧本选项卡">
      <div class="script-cover-tablist" role="tablist" aria-label="我的剧本">
        ${cards.map((card) => renderScriptRecordTab(card, selectedId, ui)).join("")}
      </div>
    </div>
  `;
}

function normalizeSelectedScriptIds(value) {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.map((item) => String(item ?? "")).filter(Boolean));
}

function renderScriptBulkToolbar({ totalCount = 0, selectedCount = 0 } = {}) {
  const count = Number(totalCount) || 0;
  const selected = Number(selectedCount) || 0;
  const hasCards = count > 0;
  const allSelected = hasCards && selected === count;
  return `
    <div class="script-bulk-toolbar" aria-label="剧本批量操作">
      <div class="script-bulk-summary">
        <strong>我的剧本</strong>
        <span>共 ${count} 个</span>
        <span class="${selected ? "is-active" : ""}">已选 ${selected} 个</span>
      </div>
      <div class="script-bulk-actions">
        <button class="script-bulk-button" type="button" data-action="toggle-all-script-selection" ${hasCards ? "" : "disabled"}>
          ${allSelected ? "取消全选" : "全选"}
        </button>
        <button class="script-bulk-button ghost" type="button" data-action="clear-script-selection" ${selected ? "" : "disabled"}>
          取消选择
        </button>
        <button class="script-bulk-button danger" type="button" data-action="delete-selected-scripts" ${selected ? "" : "disabled"}>
          删除所选
        </button>
      </div>
    </div>
  `;
}

function renderScriptRecordTab(card, selectedId, ui = {}) {
  const cardId = String(card.id ?? "");
  const projectId = String(card.projectId ?? "");
  const scriptId = String(card.id ?? "");
  const selected = cardId === selectedId;
  const checked = normalizeSelectedScriptIds(ui.selectedScriptIds).has(scriptId);
  const coverInputId = `script-cover-input-${escapeHtml(scriptId || cardId)}`;
  const menuOpen = ui.scriptCardMenuId === scriptId;
  return `
    <article
      id="script-tab-${escapeHtml(cardId)}"
      class="script-project-card ${selected ? "active" : ""} ${checked ? "is-selected" : ""}"
      data-action="select-script-record-tab"
      data-script-id="${escapeHtml(cardId)}"
      data-open-detail="true"
      data-project-id="${escapeHtml(projectId)}"
      aria-selected="${selected ? "true" : "false"}"
    >
      <button
        class="script-card-select ${checked ? "checked" : ""}"
        type="button"
        data-action="toggle-script-selection"
        data-script-id="${escapeHtml(scriptId)}"
        data-project-id="${escapeHtml(projectId)}"
        aria-pressed="${checked ? "true" : "false"}"
        aria-label="${checked ? "取消选择剧本" : "选择剧本"}"
      >
        <span aria-hidden="true"></span>
      </button>
      <div
        class="script-project-poster ${card.coverImageUrl ? "has-cover" : "needs-cover"}"
      >
        <div
          class="script-project-cover-placeholder"
          data-action="pick-script-cover"
          data-project-id="${escapeHtml(projectId)}"
          data-script-id="${escapeHtml(scriptId)}"
          role="button"
          tabindex="0"
          aria-label="上传剧本封面"
        >
          <span class="project-cover-placeholder-icon" aria-hidden="true">+</span>
          <strong>上传封面</strong>
        </div>
        <img class="script-project-cover" src="${escapeHtml(resolveScriptProjectCoverSrc(card))}" alt="${escapeHtml(card.title)} 封面" loading="lazy" />
      </div>
      <input id="${coverInputId}" class="project-cover-input" type="file" accept="image/*" data-action="upload-script-cover" data-project-id="${escapeHtml(projectId)}" data-script-id="${escapeHtml(scriptId)}" />
      <div class="script-project-meta">
        <div class="script-project-copy">
          <h2 title="${escapeHtml(card.title)}">${escapeHtml(truncateScriptCardTitle(card.title))}</h2>
        </div>
        <div class="project-card-actions script-project-actions">
          <button
            class="script-project-menu-button"
            type="button"
            data-action="toggle-script-card-menu"
            data-project-id="${escapeHtml(projectId)}"
            data-script-id="${escapeHtml(scriptId)}"
            aria-label="打开剧本操作"
            aria-expanded="${menuOpen ? "true" : "false"}"
          >
            <span aria-hidden="true">编辑</span>
          </button>
          ${menuOpen ? renderScriptProjectCardMenu({ projectId, scriptId }) : ""}
        </div>
      </div>
    </article>
  `;
}

function truncateScriptCardTitle(title) {
  const chars = [...String(title ?? "").trim()];
  return chars.length > 5 ? `${chars.slice(0, 5).join("")}...` : chars.join("");
}

function renderScriptProjectCardMenu({ projectId, scriptId }) {
  const menuCoverInputId = `script-cover-menu-input-${escapeHtml(scriptId || projectId)}`;
  return `
    <div class="project-card-menu script-project-menu" role="menu" aria-label="剧本操作">
      <input id="${menuCoverInputId}" class="project-cover-input" type="file" accept="image/*" data-action="upload-script-cover" data-project-id="${escapeHtml(projectId)}" data-script-id="${escapeHtml(scriptId)}" />
      <label class="project-card-menu-item" for="${menuCoverInputId}" data-action="pick-script-cover" data-project-id="${escapeHtml(projectId)}" data-script-id="${escapeHtml(scriptId)}">上传封面</label>
      <button class="project-card-menu-item" type="button" data-action="rename-script-card" data-project-id="${escapeHtml(projectId)}" data-script-id="${escapeHtml(scriptId)}">重命名</button>
      <button class="project-card-menu-item danger" type="button" data-action="delete-script-card" data-project-id="${escapeHtml(projectId)}" data-script-id="${escapeHtml(scriptId)}">删除</button>
    </div>
  `;
}

function renderScriptRenameModal(ui = {}) {
  if (!ui.renameScriptId) {
    return "";
  }
  const value = String(ui.renameScriptTitle ?? "");
  return `
    <section class="modal-backdrop rename-project-backdrop" role="dialog" aria-modal="true" aria-label="重命名剧本">
      <div class="rename-project-modal">
        <div class="rename-project-head">
          <h2>重命名</h2>
          <button class="modal-close" type="button" data-action="close-rename-script-modal" aria-label="关闭">×</button>
        </div>
        <label class="rename-project-field">
          <input
            id="script-rename-title-input"
            type="text"
            maxlength="50"
            value="${escapeHtml(value)}"
            placeholder="请输入剧本名称"
          />
          <span class="rename-project-count script-rename-count">${[...value].length}/50</span>
        </label>
        <div class="rename-project-actions">
          <p class="modal-inline-status">${escapeHtml(ui.renameScriptNotice ?? "")}</p>
          <div class="rename-project-button-row">
            <button class="secondary-action rename-cancel-button" type="button" data-action="close-rename-script-modal">取消</button>
            <button class="primary-action rename-save-button" type="button" data-action="confirm-rename-script-card">保存</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderScriptDeleteModal({ ui = {}, cards = [] } = {}) {
  if (!ui.deleteScriptId) {
    return "";
  }
  const deleteMode = ui.deleteScriptMode === "bulk" ? "bulk" : "single";
  const deleteIds = Array.isArray(ui.deleteScriptIds) ? ui.deleteScriptIds.map((id) => String(id)) : [];
  const deleteCount = deleteMode === "bulk" ? deleteIds.length : 1;
  const script = cards.find((card) => String(card.id) === String(ui.deleteScriptId));
  const message =
    deleteMode === "bulk"
      ? `所选 ${deleteCount} 个剧本将被删除，确定删除吗？`
      : `所选剧本将被删除，确定删除${script?.title ? `“${escapeHtml(script.title)}”` : ""}吗？`;
  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="确认删除剧本">
      <div class="delete-project-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon">×</div>
          <div>
            <h2>确认删除</h2>
            <p>${message}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-delete-script-modal" aria-label="关闭">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-delete-script-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="confirm-delete-script-card">确定</button>
        </div>
      </div>
    </section>
  `;
}

function renderScriptReaderPage({ card, projectRecord, scriptRecord, episodes = [], ui = {}, selectedEpisodeId = "" }) {
  const sections = buildScriptReaderSections({ card, projectRecord, scriptRecord, episodes, ui });
  const selectedSection =
    sections.find((section) => String(section.id) === String(selectedEpisodeId)) ?? sections[0];
  const selectedText = selectedSection?.text ?? card.summary;
  return `
    <section class="script-reader-page" aria-label="剧本详情">
      <header class="script-reader-topbar">
        <button class="script-reader-back" type="button" data-action="close-script-detail" aria-label="返回">
          <span aria-hidden="true">&lsaquo;</span>
          <strong>${escapeHtml(card.title)}</strong>
        </button>
      </header>
      <section class="script-reader-layout">
        <aside class="script-reader-sidebar" aria-label="剧本目录">
          <div class="script-reader-sidebar-head">
            <button class="script-reader-add" type="button" data-action="add-script-reader-section">新增</button>
            <span aria-hidden="true">☰</span>
          </div>
          <div class="script-reader-section-list">
            ${sections.map((section) => renderScriptReaderSectionItem(section, selectedSection?.id, ui)).join("")}
          </div>
        </aside>
        <article class="script-reader-content">
          <header class="script-reader-content-head">
            <strong>${escapeHtml(selectedSection?.title ?? "剧本试读")}</strong>
            <button
              class="script-reader-save"
              type="button"
              data-action="save-script-reader-section"
              data-episode-id="${escapeHtml(selectedSection?.id ?? "")}"
            >保存</button>
          </header>
          <textarea
            class="script-reader-editor"
            data-role="script-reader-editor"
            data-episode-id="${escapeHtml(selectedSection?.id ?? "")}"
            aria-label="剧本正文"
            spellcheck="false"
          >${escapeHtml(selectedText)}</textarea>
        </article>
      </section>
      ${renderScriptReaderDeleteDialog(sections, ui)}
    </section>
  `;
}

function buildScriptReaderSections({ card, projectRecord, scriptRecord, episodes, ui = {} }) {
  const draftMap = ui.scriptReaderDrafts && typeof ui.scriptReaderDrafts === "object" ? ui.scriptReaderDrafts : {};
  const titleMap =
    ui.scriptReaderTitleDrafts && typeof ui.scriptReaderTitleDrafts === "object"
      ? ui.scriptReaderTitleDrafts
      : {};
  const applyDraft = (section) => {
    const draft = draftMap[String(section.id)];
    const titleDraft = titleMap[String(section.id)];
    return {
      ...section,
      title: typeof titleDraft === "string" ? titleDraft : section.title,
      text: typeof draft === "string" ? draft : section.text,
    };
  };
  const sourceEpisodes = Array.isArray(episodes) ? episodes : [];
  const customSections = Array.isArray(ui.scriptReaderSections)
    ? ui.scriptReaderSections.map((section, index) => applyDraft({
        id: section.id ?? `script-reader-added-${index + 1}`,
        title: section.title ?? `新增剧情 ${index + 1}`,
        shortTitle: section.shortTitle ?? `新增${index + 1}`,
        text: section.text ?? section.body ?? "请输入新的剧情文本。",
        index,
        custom: true,
      }))
    : [];
  if (ui.scriptReaderSectionsLoaded) {
    return customSections;
  }
  const baseSections = sourceEpisodes.length
    ? sourceEpisodes.map((episode, index) => applyDraft({
      id: episode.id ?? `episode-${index + 1}`,
      title: episode.title ?? episode.name ?? `第${index + 1}集`,
      shortTitle: `第${index + 1}集`,
      text: episode.scriptText ?? episode.summary ?? episode.description ?? scriptRecord?.inputText ?? card.summary,
      index,
    }))
    : [applyDraft({
        id: scriptRecord?.id ?? projectRecord?.id ?? "script-reader-primary",
        title: card.title || "第1卡：剧本试读",
        shortTitle: "第1集",
        text: scriptRecord?.inputText ?? card.summary,
        index: 0,
      })];
  return [
    ...baseSections,
    ...customSections.map((section, index) => ({
      ...section,
      index: baseSections.length + index,
    })),
  ];
}

function renderScriptReaderSectionItem(section, selectedId, ui = {}) {
  const selected = String(section.id) === String(selectedId);
  const editing = String(ui.editingScriptReaderSectionId ?? "") === String(section.id);
  if (editing) {
    return `
      <div
        class="script-reader-section editing ${selected ? "active" : ""}"
        data-role="script-reader-section-item"
        data-episode-id="${escapeHtml(section.id)}"
      >
        <span class="script-reader-section-icon" aria-hidden="true">▤</span>
        <input
          class="script-reader-title-input"
          type="text"
          value="${escapeHtml(section.title)}"
          data-role="script-reader-title-input"
          data-episode-id="${escapeHtml(section.id)}"
          aria-label="编辑剧情标题"
        />
      </div>
    `;
  }
  return `
    <div class="script-reader-section-row ${selected ? "active" : ""}">
      <button
        class="script-reader-section ${selected ? "active" : ""}"
        type="button"
        data-action="select-script-reader-section"
        data-role="script-reader-section-item"
        data-episode-id="${escapeHtml(section.id)}"
      >
        <span class="script-reader-section-icon" aria-hidden="true">▤</span>
        <span data-role="script-reader-section-title" data-episode-id="${escapeHtml(section.id)}">${escapeHtml(section.title)}</span>
      </button>
      <button
        class="script-reader-delete"
        type="button"
        data-action="open-script-reader-delete"
        data-episode-id="${escapeHtml(section.id)}"
        aria-label="删除 ${escapeHtml(section.title)}"
        title="删除"
      >🗑</button>
    </div>
  `;
}

function renderScriptReaderDeleteDialog(sections, ui = {}) {
  const targetId = String(ui.scriptReaderDeleteTargetId ?? "");
  if (!targetId) {
    return "";
  }
  const target = sections.find((section) => String(section.id) === targetId);
  const title = target?.title ?? "所选剧情";
  return `
    <div class="script-reader-delete-overlay" role="presentation">
      <section class="script-reader-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="script-reader-delete-title">
        <button class="script-reader-delete-close" type="button" data-action="close-script-reader-delete" aria-label="关闭">×</button>
        <div class="script-reader-delete-mark" aria-hidden="true">×</div>
        <div class="script-reader-delete-copy">
          <h2 id="script-reader-delete-title">确认删除</h2>
          <p>所选内容将被删除，确定删除 “${escapeHtml(title)}” 吗?</p>
        </div>
        <div class="script-reader-delete-actions">
          <button class="script-reader-delete-cancel" type="button" data-action="close-script-reader-delete">取消</button>
          <button class="script-reader-delete-confirm" type="button" data-action="confirm-script-reader-delete" data-episode-id="${escapeHtml(targetId)}">确定</button>
        </div>
      </section>
    </div>
  `;
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

function resolveScriptCoverImage(scriptRecord) {
  return [scriptRecord?.coverImageUrl, scriptRecord?.previewUrl]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)[0] ?? "";
}

function resolveScriptProjectCoverSrc(card) {
  return card.coverImageUrl ? resolveApiUrl(card.coverImageUrl) : "";
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
              ${renderSelectOption("女频", audience)}
              ${renderSelectOption("男频", audience)}
              ${renderSelectOption("全年龄", audience)}
            </select>
          </label>
          <label class="control-field">
            <span>题材看点</span>
            <select id="original-script-genre">
              ${renderSelectOption("都市奇幻", genre)}
              ${renderSelectOption("逆袭爽感", genre)}
              ${renderSelectOption("悬疑反转", genre)}
              ${renderSelectOption("情感治愈", genre)}
            </select>
          </label>
          <label class="control-field">
            <span>拆分集数 <em>*</em></span>
            <select id="original-script-episode-count">
              <option value="">请选择拆分集数</option>
              ${renderSelectOption("40集", episodeCount)}
              ${renderSelectOption("50集", episodeCount)}
              ${renderSelectOption("60集", episodeCount)}
              ${renderSelectOption("自定义分集（1-100）", episodeCount)}
            </select>
          </label>
          <label class="control-field">
            <span>分卡设置</span>
            <select id="original-script-card-setting">
              ${renderSelectOption("标准分卡", cardSetting)}
              ${renderSelectOption("按剧情节点分卡", cardSetting)}
            </select>
          </label>
          <label class="control-field">
            <span>每集长度</span>
            <select id="original-script-episode-length">
              ${renderSelectOption("约 1 分钟", episodeLength)}
              ${renderSelectOption("约 2 分钟", episodeLength)}
              ${renderSelectOption("约 3 分钟", episodeLength)}
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

function renderSelectOption(value, selectedValue) {
  return `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`;
}
