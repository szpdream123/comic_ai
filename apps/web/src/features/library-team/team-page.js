import { commercePrototypeNotice } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";
import { renderMemberRulesModal } from "./member-rules-modal.js";
import { renderPricingModal } from "./pricing-modal.js";
import { dashboardDateShortcuts, memberFilters, memberTableColumns, teamFixture } from "./team-fixtures.js";

const DASHBOARD_TABS = [
  { id: "member-consumption", label: "成员创作与消耗" },
  { id: "project-assets", label: "项目资产与成本" },
  { id: "ranking", label: "排行榜" },
];

export function renderTeamPage(context = {}) {
  const metrics = resolveTeamMetrics(context.stats, context.members);
  const members = Array.isArray(context.members) ? context.members : context.team?.members ?? teamFixture.members;
  const memberSearchQuery = String(context.memberSearchQuery ?? "");
  const memberRoleFilter = String(context.memberRoleFilter ?? "all");
  const memberStatusFilter = String(context.memberStatusFilter ?? "all");
  const filteredMembers = filterMembers(members, {
    memberSearchQuery,
    memberRoleFilter,
    memberStatusFilter,
  });
  const roleOptions = ["all", ...new Set(members.map((member) => String(member?.role ?? "").trim()).filter(Boolean))];
  const statusOptions = ["all", ...new Set(members.map((member) => String(member?.status ?? "").trim()).filter(Boolean))];
  const projectName = context.projectName ?? "项目";
  const createMemberModal = context.createMemberModal ?? null;
  const editMemberModal = context.editMemberModal ?? null;

  return `
    <section class="library-team-page team-page" aria-labelledby="team-page-title">
      <div class="library-team-shell">
        <header class="library-team-page-head">
          <div>
            <p class="library-team-kicker">团队</p>
            <h1 id="team-page-title">团队协作台</h1>
            <p class="library-team-subcopy">围绕项目 ${escapeHtml(projectName)} 的成员、额度与协作规则管理。</p>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" data-action="open-create-member">创建成员账号</button>
        </header>
        <div class="library-team-top-grid">
          <section class="library-team-upgrade-gate" aria-label="团队资产库专业版权益">
            <div>
              <p class="library-team-kicker">团队额度</p>
              <h2>团队资产库为专业版会员权益</h2>
              <p>团队资产库为专业版会员权益，开通后即可同步管理共享素材。</p>
            </div>
            <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">开通专业版</button>
          </section>
          <section class="library-team-metrics" aria-labelledby="team-metrics-title">
            <header>
              <div>
                <p class="library-team-kicker">最近 30 天</p>
                <h2 id="team-metrics-title">数据管理</h2>
              </div>
              <div class="library-team-section-actions">
                <button class="library-team-icon-button library-team-refresh-icon" type="button" aria-label="刷新团队数据" data-action="refresh-team">刷新</button>
                <button class="library-team-button" type="button" data-action="open-team-dashboard">查看详细数据看板</button>
              </div>
            </header>
            <dl class="library-team-metric-grid">
              ${renderMetric("团队项目", metrics.projects)}
              ${renderMetric("团队席位", metrics.seats, "扩容")}
              ${renderMetric("单账号任务并发", metrics.concurrency, "扩容")}
              ${renderMetric("团队总消耗积分", metrics.consumedCredits)}
              ${renderMetric("团队剩余积分", metrics.remainingCredits)}
              ${renderMetric("团队可分配积分", metrics.distributableCredits, "加量")}
            </dl>
          </section>
        </div>
        <section class="library-team-card team-member-section" aria-labelledby="member-management-title">
          <header class="library-team-section-header">
            <div>
              <p class="library-team-kicker">成员与权限</p>
              <h2 id="member-management-title">成员管理</h2>
            </div>
            <div class="library-team-section-actions">
              <button class="library-team-link-button" type="button" data-action="open-member-rules">规则说明</button>
              <button class="library-team-button library-team-button-primary" type="button" data-action="open-create-member">创建成员账号</button>
            </div>
          </header>
          <form class="library-team-filterbar" aria-label="成员筛选器">
            ${memberFilters.map((label) =>
              renderMemberFilter(label, {
                memberSearchQuery,
                memberRoleFilter,
                memberStatusFilter,
                roleOptions,
                statusOptions,
              }),
            ).join("")}
            <button class="library-team-button" type="button" data-action="reset-team-member-filters">重置</button>
          </form>
          <div class="library-team-table-wrap">
            <table>
              <thead>
                <tr>${memberTableColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${
                  filteredMembers.length
                    ? filteredMembers.map(renderMemberRow).join("")
                    : `<tr><td colspan="${memberTableColumns.length}"><div class="library-team-empty-state"><div class="library-team-empty-icon" aria-hidden="true">+</div><div><h3>${members.length ? "未找到匹配成员" : "创建成员开始团队协作"}</h3><p>${members.length ? "尝试调整关键词或筛选条件。" : "邀请成员后，这里会显示账号、角色、项目范围与积分额度。"}</p></div><button class="library-team-button library-team-button-primary" type="button" data-action="open-create-member">创建成员账号</button></div></td></tr>`
                }
              </tbody>
            </table>
          </div>
        </section>
        <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
        ${renderPricingModal({
          open: context.pricingOpen === true,
          packages: context.billingPackages ?? null,
          billingOrder: context.billingOrder ?? null,
          paymentIntent: context.paymentIntent ?? null,
          paymentAction: context.paymentAction ?? null,
        })}
        ${renderMemberRulesModal({ open: context.rulesOpen === true })}
        ${renderCreateMemberModal(createMemberModal)}
        ${renderEditMemberModal(editMemberModal)}
      </div>
    </section>
  `;
}

export function renderTeamDashboardPage(context = {}) {
  const stats = context.stats ?? {};
  const members = Array.isArray(context.members) ? context.members : [];
  const dashboardTab = String(context.dashboardTab ?? "member-consumption");
  const dashboardDateShortcut = String(context.dashboardDateShortcut ?? dashboardDateShortcuts[0] ?? "today");
  const dashboardRoleFilter = String(context.dashboardRoleFilter ?? "all");
  const dashboardStatusFilter = String(context.dashboardStatusFilter ?? "all");
  const filteredMembers = filterDashboardMembers(members, {
    role: dashboardRoleFilter,
    status: dashboardStatusFilter,
  });
  const selectedDashboardMemberId = String(context.selectedDashboardMemberId ?? filteredMembers[0]?.id ?? "");
  const activeMember =
    filteredMembers.find((member) => String(member?.id ?? "") === selectedDashboardMemberId) ??
    filteredMembers[0] ??
    null;
  const dashboardSummary = buildDashboardSummary(stats, filteredMembers);
  const roleOptions = ["all", ...new Set(members.map((member) => String(member?.role ?? "").trim()).filter(Boolean))];
  const statusOptions = ["all", ...new Set(members.map((member) => String(member?.status ?? "").trim()).filter(Boolean))];

  return `
    <section class="library-team-page team-dashboard-page" aria-labelledby="team-dashboard-title">
      <div class="library-team-shell">
        <header class="library-team-page-head library-team-dashboard-header">
          <button class="library-team-link-button" type="button" data-action="back-to-team-page">返回</button>
          <div>
            <p class="library-team-kicker">查看详细数据看板</p>
            <h1 id="team-dashboard-title">团队数据看板</h1>
            <p class="library-team-subcopy">按成员、项目和时间查看创作产出与积分消耗，方便排查成本和资源分配。</p>
          </div>
        </header>
        <nav class="library-team-tabs" role="tablist" aria-label="团队数据看板">
          ${DASHBOARD_TABS.map((tab) => `
            <button class="library-team-tab${tab.id === dashboardTab ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab.id === dashboardTab ? "true" : "false"}" data-action="set-team-dashboard-tab" data-dashboard-tab="${escapeAttr(tab.id)}">${escapeHtml(tab.label)}</button>
          `).join("")}
        </nav>
        <section class="library-team-card" aria-labelledby="dashboard-summary-title">
          <p class="library-team-kicker">总览</p>
          <h2 id="dashboard-summary-title">${escapeHtml(resolveDashboardTabTitle(dashboardTab))}</h2>
          <dl class="library-team-metric-grid compact">
            ${renderMetric("成员数", dashboardSummary.memberCount)}
            ${renderMetric("启用成员数", dashboardSummary.enabledMemberCount)}
            ${renderMetric("成员总消耗积分", dashboardSummary.totalCredits)}
            ${renderMetric("成员均消耗积分", dashboardSummary.averageCredits)}
          </dl>
        </section>
        <section class="library-team-card" aria-labelledby="dashboard-detail-title">
          <header class="library-team-section-header">
            <div>
              <p class="library-team-kicker">明细</p>
              <h2 id="dashboard-detail-title">${escapeHtml(resolveDashboardDetailTitle(dashboardTab))}</h2>
            </div>
            <button class="library-team-button library-team-button-primary" type="button" data-action="export-team-dashboard">导出</button>
          </header>
          <div class="library-team-filterbar">
            <label class="library-team-field">
              <span>角色</span>
              <select data-action="set-team-dashboard-role-filter">${renderSelectOptions(roleOptions, dashboardRoleFilter)}</select>
            </label>
            <label class="library-team-field">
              <span>状态</span>
              <select data-action="set-team-dashboard-status-filter">${renderSelectOptions(statusOptions, dashboardStatusFilter)}</select>
            </label>
            <div class="library-team-date-shortcuts">
              ${dashboardDateShortcuts.map((shortcut) => `
                <button class="library-team-tab${shortcut === dashboardDateShortcut ? " is-active" : ""}" type="button" data-action="set-team-dashboard-date-shortcut" data-dashboard-date-shortcut="${escapeAttr(shortcut)}">${escapeHtml(shortcut)}</button>
              `).join("")}
            </div>
          </div>
          <div class="library-team-table-wrap">
            <table>
              <thead>
                <tr>${["账号", "成员名称", "角色", "总消耗积分", "创作剧本数", "项目均消耗积分", "创作项目数", "项目均消耗积分", "操作"].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${
                  filteredMembers.length
                    ? filteredMembers.map((member, index) => renderDashboardRow(member, index, selectedDashboardMemberId)).join("")
                    : `<tr><td colspan="9"><div class="library-team-empty-state"><div class="library-team-empty-icon" aria-hidden="true">0</div><div><h3>暂无数据</h3><p>开始团队协作后，这里会显示成员消耗和项目成本。</p></div></div></td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${renderDashboardInspector(activeMember, dashboardTab, dashboardDateShortcut)}
        </section>
      </div>
    </section>
  `;
}

function renderMetric(label, value, actionLabel) {
  return `
    <div class="library-team-metric">
      <dt>${escapeHtml(label)}${actionLabel ? ` <button class="library-team-inline-action" type="button" data-action="open-pricing">${escapeHtml(actionLabel)}</button>` : ""}</dt>
      <dd>${escapeHtml(value ?? 0)}</dd>
    </div>
  `;
}

function resolveTeamMetrics(stats, members) {
  if (!stats || typeof stats !== "object") {
    return teamFixture.metrics;
  }
  const memberCount = Array.isArray(members) ? members.length : Number(stats.memberCount ?? 0);
  return {
    projects: Number(stats.episodeCount ?? stats.projects ?? 0),
    seats: `${memberCount}/${Math.max(memberCount, Number(stats.memberCount ?? memberCount ?? 0))}`,
    concurrency: Number(stats.generatedVideoCount ?? stats.concurrency ?? 0),
    consumedCredits: Number(stats.generatedImageCount ?? stats.consumedCredits ?? 0),
    remainingCredits: Number(stats.assetCount ?? stats.remainingCredits ?? 0),
    distributableCredits: Number(stats.exportCount ?? stats.distributableCredits ?? 0),
  };
}

function renderMemberFilter(label, context = {}) {
  if (label === "角色") {
    return `
      <label class="library-team-field">
        <span>${escapeHtml(label)}</span>
        <select data-action="set-team-member-role-filter" aria-label="${escapeHtml(label)}">
          ${renderSelectOptions(context.roleOptions ?? ["all"], context.memberRoleFilter ?? "all")}
        </select>
      </label>
    `;
  }

  if (label === "状态") {
    return `
      <label class="library-team-field">
        <span>${escapeHtml(label)}</span>
        <select data-action="set-team-member-status-filter" aria-label="${escapeHtml(label)}">
          ${renderSelectOptions(context.statusOptions ?? ["all"], context.memberStatusFilter ?? "all")}
        </select>
      </label>
    `;
  }

  if (label === "项目") {
    return `
      <label class="library-team-field">
        <span>${escapeHtml(label)}</span>
        <select disabled aria-label="${escapeHtml(label)}">
          <option>全部</option>
        </select>
      </label>
    `;
  }

  return `
    <label class="library-team-field">
      <span>${escapeHtml(label)}</span>
      <input
        type="text"
        placeholder="请输入"
        aria-label="${escapeHtml(label)}"
        value="${escapeAttr(context.memberSearchQuery ?? "")}"
        data-action="search-team-members"
      />
    </label>
  `;
}

function renderSelectOptions(options, selectedValue) {
  return options
    .map((value) => {
      const normalized = String(value);
      const label =
        normalized === "all"
          ? "全部"
          : mapMemberStatusLabel(normalized) ?? mapMemberRoleLabel(normalized) ?? normalized;
      return `<option value="${escapeAttr(normalized)}" ${normalized === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function filterMembers(members, filters = {}) {
  const query = String(filters.memberSearchQuery ?? "").trim().toLocaleLowerCase();
  const roleFilter = String(filters.memberRoleFilter ?? "all");
  const statusFilter = String(filters.memberStatusFilter ?? "all");

  return members.filter((member) => {
    if (roleFilter !== "all" && String(member?.role ?? "") !== roleFilter) {
      return false;
    }
    if (statusFilter !== "all" && String(member?.status ?? "") !== statusFilter) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [
      member?.phone,
      member?.userId,
      member?.role,
      member?.status,
      mapMemberRoleLabel(member?.role),
      mapMemberStatusLabel(member?.status),
      member?.consumedCredits,
      member?.scriptCount,
      member?.projectCount,
      member?.projectAverageCredits,
      member?.note,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(query));
  });
}

function renderMemberRow(member, index) {
  const name = member.phone ?? member.userId ?? `成员 ${index + 1}`;
  const note = member.note ?? "-";
  const projectScope = member.projectScope ?? "当前工作区";
  const memberGroup = member.memberGroup ?? "默认组";
  const creditQuota = member.creditQuota ?? member.consumedCredits ?? 0;
  const legacyScriptCount = member.scriptCount ?? "";
  const legacyProjectCount = member.projectCount ?? "";
  return `
    <tr data-member-script-count="${escapeAttr(legacyScriptCount)}" data-member-project-count="${escapeAttr(legacyProjectCount)}">
      <td>${escapeHtml(member.phone ?? member.userId ?? "-")}</td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(mapMemberRoleLabel(member.role))}</td>
      <td>${escapeHtml(projectScope)}</td>
      <td>${escapeHtml(memberGroup)}</td>
      <td>${escapeHtml(mapMemberStatusLabel(member.status) ?? (member.status ? String(member.status) : "未知"))}</td>
      <td>${escapeHtml(creditQuota)}</td>
      <td>${escapeHtml(note)}</td>
      <td><button class="library-team-link-button" type="button" data-action="open-edit-member" data-member-id="${escapeAttr(member.id ?? "")}">查看</button></td>
    </tr>
  `;
}

function renderDashboardRow(member, index, selectedDashboardMemberId) {
  const name = member.phone ?? member.userId ?? `成员 ${index + 1}`;
  const selected = String(member?.id ?? "") === String(selectedDashboardMemberId ?? "");
  return `
    <tr${selected ? ' class="is-selected"' : ""}>
      <td>${escapeHtml(member.phone ?? member.userId ?? "-")}</td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(mapMemberRoleLabel(member.role))}</td>
      <td>${escapeHtml(member.creditQuota ?? member.consumedCredits ?? 0)}</td>
      <td>${escapeHtml(member.scriptCount ?? 0)}</td>
      <td>${escapeHtml(member.projectAverageCredits ?? 0)}</td>
      <td>${escapeHtml(member.projectCount ?? 0)}</td>
      <td>${escapeHtml(member.projectAverageCredits ?? 0)}</td>
      <td><button class="library-team-link-button" type="button" data-action="view-team-dashboard-member" data-member-id="${escapeAttr(member.id ?? "")}">查看</button></td>
    </tr>
  `;
}

function filterDashboardMembers(members, filters = {}) {
  const roleFilter = String(filters.role ?? "all");
  const statusFilter = String(filters.status ?? "all");
  return members.filter((member) => {
    if (roleFilter !== "all" && String(member?.role ?? "") !== roleFilter) {
      return false;
    }
    if (statusFilter !== "all" && String(member?.status ?? "") !== statusFilter) {
      return false;
    }
    return true;
  });
}

function buildDashboardSummary(stats, members) {
  const memberCount = members.length;
  const enabledMemberCount = members.filter((member) => member?.status !== "disabled").length;
  const totalCredits = members.reduce(
    (sum, member) => sum + Number(member?.creditQuota ?? member?.consumedCredits ?? 0),
    0,
  );
  return {
    memberCount,
    enabledMemberCount,
    totalCredits,
    averageCredits: memberCount ? Math.round(totalCredits / memberCount) : Number(stats?.memberAverageCredits ?? 0),
  };
}

function resolveDashboardTabTitle(tabId) {
  return DASHBOARD_TABS.find((tab) => tab.id === tabId)?.label ?? DASHBOARD_TABS[0].label;
}

function resolveDashboardDetailTitle(tabId) {
  if (tabId === "project-assets") {
    return "项目资产与成本详情";
  }
  if (tabId === "ranking") {
    return "排行榜详情";
  }
  return "成员创作与消耗详情";
}

function renderDashboardInspector(member, tabId, dateShortcut) {
  if (!member) {
    return "";
  }
  return `
    <aside class="library-team-plan-note" data-dashboard-inspector="${escapeAttr(tabId)}">
      <strong>${escapeHtml(member.phone ?? member.userId ?? "-")}</strong>
      <span>${escapeHtml(resolveDashboardTabTitle(tabId))}</span>
      <span>时间范围：${escapeHtml(dateShortcut)}</span>
      <span>角色：${escapeHtml(mapMemberRoleLabel(member.role))}</span>
      <span>状态：${escapeHtml(mapMemberStatusLabel(member.status) ?? (member.status ? String(member.status) : "未知"))}</span>
      <span>积分：${escapeHtml(member.creditQuota ?? member.consumedCredits ?? 0)}</span>
      <span>备注：${escapeHtml(member.note ?? "-")}</span>
    </aside>
  `;
}

function renderCreateMemberModal(modal) {
  if (!modal?.open) {
    return "";
  }

  return `
    <div class="library-team-modal-backdrop" data-modal="create-member">
      <section
        class="library-team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-member-title"
      >
        <header class="library-team-modal-header">
          <div>
            <p class="library-team-kicker">成员账号</p>
            <h2 id="create-member-title">创建成员账号</h2>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-create-member" aria-label="关闭创建成员弹窗">×</button>
        </header>
        <div class="library-team-modal-scroll">
          <label class="library-team-field">
            <span>手机号</span>
            <input
              id="team-member-phone-input"
              type="text"
              value="${escapeAttr(modal.phone ?? "")}"
              placeholder="请输入中国大陆手机号"
              data-action="change-create-member-phone"
            />
          </label>
          <label class="library-team-field">
            <span>角色</span>
            <select id="team-member-role-input" data-action="change-create-member-role" aria-label="角色">
              ${["creator", "producer", "viewer"].map((role) => `<option value="${escapeAttr(role)}" ${role === (modal.role ?? "creator") ? "selected" : ""}>${escapeHtml(mapMemberRoleLabel(role))}</option>`).join("")}
            </select>
          </label>
          <label class="library-team-field">
            <span>备注</span>
            <input
              id="team-member-note-input"
              type="text"
              value="${escapeAttr(modal.note ?? "")}"
              placeholder="选填，帮助团队识别成员职责"
              data-action="change-create-member-note"
            />
          </label>
          <p class="library-team-commerce-notice">${escapeHtml(modal.notice ?? "创建后会立即写入工作区成员表，并出现在当前项目团队页。")}</p>
        </div>
        <footer class="library-team-modal-actions">
          <button class="library-team-button" type="button" data-action="close-create-member">取消</button>
          <button class="library-team-button library-team-button-primary" type="button" data-action="submit-create-member">确认创建</button>
        </footer>
      </section>
    </div>
  `;
}

function renderEditMemberModal(modal) {
  if (!modal?.open) {
    return "";
  }

  const statusLabel = mapMemberStatusLabel(modal.status) ?? (modal.status ? String(modal.status) : "未知");
  return `
    <div class="library-team-modal-backdrop" data-modal="edit-member">
      <section
        class="library-team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-member-title"
      >
        <header class="library-team-modal-header">
          <div>
            <p class="library-team-kicker">成员维护</p>
            <h2 id="edit-member-title">成员详情与权限</h2>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-edit-member" aria-label="关闭成员详情弹窗">×</button>
        </header>
        <div class="library-team-modal-scroll">
          <label class="library-team-field">
            <span>手机号</span>
            <input type="text" value="${escapeAttr(modal.phone ?? "")}" disabled />
          </label>
          <label class="library-team-field">
            <span>角色</span>
            <select id="team-edit-member-role-input" data-action="change-edit-member-role" aria-label="编辑成员角色">
              ${["creator", "producer", "viewer"].map((role) => `<option value="${escapeAttr(role)}" ${role === (modal.role ?? "creator") ? "selected" : ""}>${escapeHtml(mapMemberRoleLabel(role))}</option>`).join("")}
            </select>
          </label>
          <label class="library-team-field">
            <span>备注</span>
            <input
              id="team-edit-member-note-input"
              type="text"
              value="${escapeAttr(modal.note ?? "")}"
              placeholder="补充成员职责或协作说明"
              data-action="change-edit-member-note"
            />
          </label>
          <p class="library-team-commerce-notice">当前状态：${escapeHtml(statusLabel)}。停用后该成员无法继续进入当前工作区，但历史数据会保留。</p>
          <p class="library-team-commerce-notice">${escapeHtml(modal.notice ?? "")}</p>
        </div>
        <footer class="library-team-modal-actions">
          <button class="library-team-button" type="button" data-action="close-edit-member">关闭</button>
          <button class="library-team-button" type="button" data-action="toggle-member-status">
            ${escapeHtml(modal.status === "disabled" ? "恢复成员" : "停用成员")}
          </button>
          <button class="library-team-button library-team-button-primary" type="button" data-action="submit-edit-member">保存修改</button>
        </footer>
      </section>
    </div>
  `;
}

function mapMemberRoleLabel(role) {
  if (role === "管理员" || role === "制片" || role === "查看者" || role === "创作者") {
    return role;
  }
  if (role === "producer") {
    return "制片";
  }
  if (role === "viewer") {
    return "查看者";
  }
  if (role === "admin") {
    return "管理员";
  }
  return "创作者";
}

function mapMemberStatusLabel(status) {
  if (status === "disabled") {
    return "已停用";
  }
  if (status === "active" || status === "enabled") {
    return "启用中";
  }
  if (status === "pending") {
    return "待激活";
  }
  return null;
}
