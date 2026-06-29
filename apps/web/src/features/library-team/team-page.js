import { escapeAttr, escapeHtml } from "./markup.js";
import { renderMemberRulesModal } from "./member-rules-modal.js";
import { renderPricingModal } from "./pricing-modal.js";
import { dashboardDateShortcuts, memberFilters, memberTableColumns, teamFixture } from "./team-fixtures.js";

const DASHBOARD_TABS = [
  { id: "member-consumption", label: "成员创作与消耗" },
  { id: "project-cost", label: "项目资产与成本" },
  { id: "ranking", label: "排行榜" },
];

export function renderTeamPage(context = {}) {
  const team = context.team ?? {};
  const overview = resolveEffectiveTeamOverview(
    context.overview ?? team.overview ?? null,
    context.membershipStatus ?? null,
  );
  const members = Array.isArray(context.members)
    ? context.members
    : (Array.isArray(team.members) ? team.members : teamFixture.members);
  const metrics = resolveTeamMetrics(context.stats ?? overview?.stats ?? overview?.metrics ?? overview, members);
  const createState = resolveCreateMemberState(overview);
  const canCreateMember = createState.canCreate;
  const teamActivated = createState.teamActivated;
  const showTeamDashboardActions = overview ? teamActivated : true;
  const showTeamHero = context.showTeamHero === true && canCreateMember !== true;
  const createAction = createState.action;
  const createActionMessage = createState.message;
  const commercePrototypeNotice = team.error ? `团队数据加载失败：${team.error}` : "";
  const memberSearchQuery = String(context.memberSearchQuery ?? "");
  const memberRoleFilter = String(context.memberRoleFilter ?? "all");
  const memberStatusFilter = String(context.memberStatusFilter ?? "all");
  const filteredMembers = filterMembers(members, {
    memberSearchQuery,
    memberRoleFilter,
    memberStatusFilter,
  });
  const memberPageSize = 10;
  const memberTotal = filteredMembers.length;
  const memberTotalPages = Math.max(1, Math.ceil(memberTotal / memberPageSize));
  const requestedMemberPage = Math.max(1, Number(context.memberPage ?? 1));
  const memberPage = Math.min(memberTotalPages, requestedMemberPage);
  const memberPageMembers = filteredMembers.slice((memberPage - 1) * memberPageSize, memberPage * memberPageSize);
  const roleOptions = ["all", ...new Set(members.map((member) => String(member?.role ?? "").trim()).filter(Boolean))];
  const statusOptions = ["all", ...new Set(members.map((member) => String(member?.status ?? "").trim()).filter(Boolean))];
  const createMemberModal = context.createMemberModal ?? null;
  const editMemberModal = context.editMemberModal ?? null;
  const memberConfirmModal = context.memberConfirmModal ?? null;
  const teamAccountSuffix = String(overview?.teamAccountSuffix ?? overview?.team_account_suffix ?? "").trim().toLowerCase();
  const teamCreateMemberModal = createMemberModal
    ? {
        ...createMemberModal,
        draft: {
          ...(createMemberModal.draft ?? {}),
          teamAccountSuffix: String(createMemberModal.draft?.teamAccountSuffix ?? "").trim().toLowerCase() || teamAccountSuffix,
        },
      }
    : null;

  return `
    <section class="library-team-page team-page${teamActivated ? " is-team-activated" : ""}" aria-label="团队成员管理">
      <div class="library-team-shell">
        ${showTeamHero ? `
          <header class="library-team-command-strip team-ops-hero">
            <div class="team-ops-hero-copy">
              <h1 id="team-page-title">${canCreateMember ? "团队成员管理已开通" : "团队功能为专业版会员专属权益，请开通专业版会员后使用该功能"}</h1>
              <button class="library-team-button team-ops-hero-cta" type="button" ${renderActionAttrs(createAction, createActionMessage)}>${escapeHtml(canCreateMember ? createState.buttonLabel : "去开通")}</button>
            </div>
          </header>
        ` : ""}
        <section class="library-team-card team-member-section" aria-labelledby="member-management-title">
          <header class="team-member-panel-head">
            <div class="team-member-panel-tabs" role="tablist" aria-label="团队管理">
              <button id="member-management-title" class="team-member-panel-tab is-active" type="button" role="tab" aria-selected="true" data-action="set-team-panel-tab" data-team-panel-tab="members">成员管理</button>
            </div>
          </header>
          <div class="team-member-panel-tools">
            <form class="library-team-filterbar" aria-label="成员筛选器">
              <div class="library-team-filter-fields">
                ${memberFilters.map((label) =>
                  renderMemberFilter(label, {
                    memberSearchQuery,
                    memberRoleFilter,
                    memberStatusFilter,
                    roleOptions,
                    statusOptions,
                  }),
                ).join("")}
              </div>
            </form>
            <button class="library-team-button library-team-button-primary team-member-create-button" type="button" ${renderActionAttrs(createAction, createActionMessage)}>${escapeHtml(createState.buttonLabel)}</button>
          </div>
          <div class="library-team-table-wrap">
            <table>
              <thead>
                <tr>${memberTableColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
              </thead>
              <tbody>
                ${
                  memberPageMembers.length
                    ? memberPageMembers.map((member, index) => renderMemberRow(member, index, createState)).join("")
                    : renderMemberEmptyRow(createState, { hasMembers: members.length > 0 })
                }
              </tbody>
            </table>
          </div>
          ${renderMemberPagination({ total: memberTotal, page: memberPage, pageSize: memberPageSize, totalPages: memberTotalPages }, filteredMembers.length > memberPageSize)}
        </section>
        <div class="library-team-operations-band">
          ${teamActivated ? "" : renderTeamGate(createState)}
          <section class="library-team-metrics" aria-labelledby="team-metrics-title">
            <header>
              <div>
                <p class="library-team-kicker">${teamActivated ? "实时总览" : "协作准备"}</p>
                <h2 id="team-metrics-title">${teamActivated ? "数据管理" : "权益与席位"}</h2>
              </div>
              <div class="library-team-section-actions">
                <button class="library-team-icon-button library-team-refresh-icon" type="button" aria-label="刷新团队数据" data-action="refresh-team">刷新</button>
                ${showTeamDashboardActions ? '<button class="library-team-button" type="button" data-action="open-team-dashboard">查看详细数据看板</button>' : ""}
              </div>
            </header>
            <dl class="library-team-metric-grid">
              ${renderMetric("团队项目", metrics.projects)}
              ${renderMetric("团队席位", metrics.seats, canCreateMember ? "扩容" : "")}
              ${renderMetric("单账号任务并发", metrics.concurrency, canCreateMember ? "扩容" : "")}
              ${renderMetric("团队消耗积分", metrics.consumedCredits)}
              ${renderMetric("团队剩余积分", metrics.remainingCredits)}
              ${renderMetric("团队剩余可分配积分", metrics.distributableCredits, canCreateMember ? "加量" : "")}
            </dl>
          </section>
        </div>
        ${renderTeamPolicyPanel({ createState, metrics })}
        ${commercePrototypeNotice ? `<p class="library-team-commerce-notice is-error">${escapeHtml(commercePrototypeNotice)}</p>` : ""}
        ${renderPricingModal({
          open: context.pricingOpen === true,
          packages: context.billingPackages ?? null,
          membershipPlans: context.membershipPlans ?? null,
          membershipStatus: context.membershipStatus ?? null,
          billingOrder: context.billingOrder ?? null,
          paymentIntent: context.paymentIntent ?? null,
          paymentAction: context.paymentAction ?? null,
          membershipPaymentState: context.membershipPaymentState ?? null,
          pricingTab: context.pricingTab ?? "membership",
        })}
        ${renderMemberRulesModal({ open: context.rulesOpen === true })}
        ${renderFixtureCreateMemberModal(teamCreateMemberModal)}
        ${renderEditMemberModal(editMemberModal)}
        ${renderMemberConfirmModal(memberConfirmModal)}
      </div>
    </section>
  `;
}

function renderMemberPagination(pagination, hasPossibleNextPage = false) {
  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.totalPages || hasPossibleNextPage;
  return `
    <footer class="team-member-pagination" aria-label="成员分页">
      <span>共 ${escapeHtml(String(pagination.total))} 条</span>
      <div class="team-member-pagination-actions">
        <span>${escapeHtml(String(pagination.page))} / ${escapeHtml(String(pagination.totalPages))}</span>
        <button type="button" data-action="change-team-member-page" data-page="${escapeAttr(String(Math.max(1, pagination.page - 1)))}" ${canPrev ? "" : "disabled"}>上一页</button>
        <button type="button" data-action="change-team-member-page" data-page="${escapeAttr(String(pagination.page + 1))}" ${canNext ? "" : "disabled"}>下一页</button>
      </div>
    </footer>
  `;
}

function renderCommandChip(label, value, state = "") {
  const stateClass = state ? ` ${state}` : "";
  return `
    <div class="library-team-command-chip${stateClass}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function resolveEffectiveTeamOverview(overview, membershipStatus) {
  const status = String(membershipStatus?.status ?? membershipStatus?.membership?.status ?? "");
  const tier = String(membershipStatus?.currentTier ?? membershipStatus?.membership?.currentTier ?? "");
  const entitlements = membershipStatus?.entitlements ?? membershipStatus?.membership?.entitlements ?? {};
  const isProfessionalActive = status === "professional_active" || (!status && tier === "professional");
  const hasTeamMemberManagement =
    overview?.entitlements?.teamMemberManagement === true ||
    (isProfessionalActive && entitlements?.teamMemberManagement === true);
  if (!hasTeamMemberManagement) {
    return overview;
  }

  const seats = overview?.seats ?? {};
  const membershipSeatLimit = Number(membershipStatus?.team?.seatLimit ?? membershipStatus?.membership?.team?.seatLimit ?? 0);
  const limit = Math.max(
    Number(seats.limit ?? seats.total ?? 0),
    Number.isFinite(membershipSeatLimit) ? membershipSeatLimit : 0,
  );
  const used = Number(seats.used ?? 0);
  const remaining = Number(seats.remaining ?? (limit > 0 ? Math.max(0, limit - used) : 0));
  return {
    ...(overview ?? {}),
    entitlements: {
      ...(overview?.entitlements ?? {}),
      teamMemberManagement: true,
      teamDashboard: overview?.entitlements?.teamDashboard === true || entitlements?.teamDashboard === true,
      teamAssetLibrary: overview?.entitlements?.teamAssetLibrary === true || entitlements?.teamAssetLibrary === true,
    },
    seats: {
      ...seats,
      used,
      limit,
      remaining: limit > 0 ? Math.max(0, limit - used) : remaining,
    },
  };
}

function resolveCreateMemberState(overview) {
  const isEntitled = overview?.entitlements?.teamMemberManagement === true;
  const canCreateByPermission = overview?.permissions?.canCreateMember !== false;
  const seats = overview?.seats ?? {};
  const limit = Number(seats.limit ?? seats.total ?? 0);
  const used = Number(seats.used ?? 0);
  const remaining = Number(seats.remaining ?? (limit > 0 ? Math.max(0, limit - used) : 0));
  const memberCount = Number(overview?.team?.memberCount ?? used);
  const teamActivated = overview?.team?.activated === true || memberCount > 0;

  if (!isEntitled) {
    return {
      canCreate: false,
      teamActivated: false,
      reason: "entitlement",
      action: "open-pricing",
      message: "开通专业版后可创建团队成员账号。",
      badgeLabel: "未开通",
      buttonLabel: "开通专业版",
      secondaryLabel: "开通专业版",
      statusText: "团队成员功能未开通",
    };
  }

  if (!canCreateByPermission) {
    return {
      canCreate: false,
      teamActivated,
      reason: "permission",
      action: "show-library-placeholder",
      message: "当前账号没有创建成员权限，请联系主账号或团队管理员。",
      badgeLabel: "权限受限",
      buttonLabel: "查看原因",
      secondaryLabel: "查看原因",
      statusText: "当前账号没有创建成员权限",
    };
  }

  if (limit > 0 && remaining <= 0) {
    return {
      canCreate: false,
      teamActivated,
      reason: "seat_limit",
      action: "show-library-placeholder",
      message: "子账号数量已达上限，请联系客服调整团队子账号额度。",
      badgeLabel: "席位已满",
      buttonLabel: "联系客服",
      secondaryLabel: "联系客服",
      statusText: "团队子账号已达上限",
    };
  }

  return {
    canCreate: true,
    teamActivated,
    reason: teamActivated ? "" : "team_setup",
    action: "open-team-member-create",
    message: "",
    badgeLabel: teamActivated ? "团队已启用" : "可开启",
    buttonLabel: "创建子账户",
    secondaryLabel: teamActivated ? "创建子账户" : "开启团队协作",
    statusText: teamActivated ? "可创建成员账号" : "已获得团队协作资格，尚未创建成员",
  };
}

function renderActionAttrs(action, message = "") {
  const safeAction = action || "show-library-placeholder";
  const messageAttr = message ? ` data-placeholder-message="${escapeAttr(message)}"` : "";
  return `data-action="${escapeAttr(safeAction)}"${messageAttr}`;
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

function normalizeDashboardTab(tab) {
  const normalizedTab = String(tab ?? "");
  return dashboardTabIds.has(normalizedTab) ? normalizedTab : "member-consumption";
}

function normalizeDashboardDateRange(range) {
  const normalizedRange = String(range ?? "");
  return dashboardDateRangeIds.has(normalizedRange) ? normalizedRange : "today";
}

function renderDashboardTabs(activeTab) {
  return `
    <nav class="library-team-tabs" role="tablist" aria-label="团队数据看板">
      ${dashboardTabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return `
          <button
            class="library-team-tab${isActive ? " is-active" : ""}"
            type="button"
            role="tab"
            data-action="set-team-dashboard-tab"
            data-dashboard-tab="${escapeAttr(tab.id)}"
            aria-selected="${isActive ? "true" : "false"}"
          >${escapeHtml(tab.label)}</button>
        `;
      }).join("")}
    </nav>
  `;
}

function renderDashboardPanel(activeTab, state) {
  if (activeTab === "project-cost") {
    return renderProjectCostDashboardPanel(state);
  }
  if (activeTab === "ranking") {
    return renderRankingDashboardPanel(state);
  }
  return renderMemberConsumptionDashboardPanel(state);
}

function renderMemberConsumptionDashboardPanel({ members, activeDateRange }) {
  const consumedCredits = members.reduce(
    (sum, member) => sum + Number(member.creditUsed ?? 0),
    0,
  );
  const averageCredits = members.length > 0 ? Math.round(consumedCredits / members.length) : 0;

  return `
    <div class="library-team-dashboard-panel" data-dashboard-panel="member-consumption">
      <section class="library-team-card" aria-labelledby="dashboard-member-consumption-title">
        <p class="library-team-kicker">总览</p>
        <h2 id="dashboard-member-consumption-title">成员创作与消耗</h2>
        <dl class="library-team-metric-grid compact">
          ${renderMetric("成员数", members.length)}
          ${renderMetric("启用成员数", members.filter((member) => member.status === "active").length)}
          ${renderMetric("成员总消耗积分", consumedCredits)}
          ${renderMetric("成员均消耗积分", averageCredits)}
        </dl>
      </section>
      <section class="library-team-card" aria-labelledby="dashboard-member-detail-title">
        <header class="library-team-section-header">
          <div>
            <p class="library-team-kicker">明细</p>
            <h2 id="dashboard-member-detail-title">成员创作与消耗详情</h2>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" data-action="show-library-placeholder" data-placeholder-message="${escapeAttr(DASHBOARD_EXPORT_MESSAGE)}">导出</button>
        </header>
        <div class="library-team-filterbar">
          <label class="library-team-field"><span>角色</span><select><option>全部</option></select></label>
          <label class="library-team-field"><span>状态</span><select><option>全部</option></select></label>
          ${renderDashboardDateShortcuts(activeDateRange)}
        </div>
        <div class="library-team-table-wrap">
          <table>
            <thead>
              <tr>${["账号", "成员名称", "角色", "总消耗积分", "创作剧本数", "剧本均消耗积分", "创作项目数", "项目均消耗积分", "操作"].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${
                members.length > 0
                  ? members.map(renderDashboardMemberRow).join("")
                  : renderDashboardEmptyRow(9, "开始团队协作后，这里会显示成员消耗和项目成本。")
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderProjectCostDashboardPanel({ team, members, activeDateRange }) {
  const overview = team?.overview ?? {};
  const projectCount = Number(overview?.metrics?.projects ?? overview?.projectCount ?? 0);
  const totalCredits = members.reduce(
    (sum, member) => sum + Number(member.creditUsed ?? 0),
    0,
  );
  const averageProjectCredits = projectCount > 0 ? Math.round(totalCredits / projectCount) : 0;

  return `
    <div class="library-team-dashboard-panel" data-dashboard-panel="project-cost">
      <section class="library-team-card" aria-labelledby="dashboard-project-cost-title">
        <p class="library-team-kicker">总览</p>
        <h2 id="dashboard-project-cost-title">项目资产与成本</h2>
        <dl class="library-team-metric-grid compact">
          ${renderMetric("项目总数", projectCount)}
          ${renderMetric("项目总消耗积分", totalCredits)}
          ${renderMetric("项目均消耗积分", averageProjectCredits)}
          ${renderMetric("角色/场景/道具数", 0)}
        </dl>
      </section>
      <section class="library-team-card" aria-labelledby="dashboard-project-cost-detail-title">
        <header class="library-team-section-header">
          <div>
            <p class="library-team-kicker">成本明细</p>
            <h2 id="dashboard-project-cost-detail-title">项目资产与成本详情</h2>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" data-action="show-library-placeholder" data-placeholder-message="${escapeAttr(DASHBOARD_EXPORT_MESSAGE)}">导出</button>
        </header>
        <div class="library-team-filterbar">
          ${renderDashboardDateShortcuts(activeDateRange)}
        </div>
        <div class="library-team-table-wrap">
          <table>
            <thead>
              <tr>${["项目名称", "项目总消耗积分", "成员组", "剧集数", "角色/场景/道具数", "剧集均消耗积分", "操作"].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${renderDashboardEmptyRow(7, "项目统计会在项目消耗流水接入后显示。")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderRankingDashboardPanel({ members, activeDateRange }) {
  const memberRows = members
    .slice()
    .sort((left, right) => Number(right.creditUsed ?? 0) - Number(left.creditUsed ?? 0))
    .slice(0, 10);

  return `
    <div class="library-team-dashboard-panel" data-dashboard-panel="ranking">
      <section class="library-team-card" aria-labelledby="dashboard-ranking-title">
        <p class="library-team-kicker">排行</p>
        <h2 id="dashboard-ranking-title">排行榜</h2>
        <div class="library-team-ranking-grid">
          ${renderRankingCard({
            title: "成员组集均消耗排行榜",
            columns: ["序号", "成员组", "积分"],
            body: renderDashboardEmptyRow(3, "暂无成员组消耗排行。", { compact: true }),
            activeDateRange,
          })}
          ${renderRankingCard({
            title: "成员积分消耗排行榜",
            columns: ["序号", "账号", "名称", "积分"],
            body: memberRows.length > 0
              ? memberRows.map((member, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(member.teamAccount)}</td>
                    <td>${escapeHtml(member.displayName)}</td>
                    <td>${escapeHtml(member.creditUsed ?? 0)}</td>
                  </tr>
                `).join("")
              : renderDashboardEmptyRow(4, "暂无成员消耗排行。", { compact: true }),
            activeDateRange,
          })}
          ${renderRankingCard({
            title: "项目积分消耗排行榜",
            columns: ["序号", "项目名称", "积分"],
            body: renderDashboardEmptyRow(3, "暂无项目消耗排行。", { compact: true }),
            activeDateRange,
          })}
        </div>
      </section>
    </div>
  `;
}

function renderRankingCard({ title, columns, body, activeDateRange }) {
  return `
    <article class="library-team-ranking-card">
      <header>
        <h3>${escapeHtml(title)}</h3>
        ${renderDashboardDateShortcuts(activeDateRange)}
      </header>
      <div class="library-team-table-wrap">
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderDashboardDateShortcuts(activeDateRange) {
  return `
    <div class="library-team-date-shortcuts">
      ${dashboardDateRanges.map((range) => {
        const isActive = range.id === activeDateRange;
        return `
          <button
            class="library-team-tab${isActive ? " is-active" : ""}"
            type="button"
            data-action="set-team-dashboard-date-range"
            data-dashboard-date-range="${escapeAttr(range.id)}"
            aria-pressed="${isActive ? "true" : "false"}"
          >${escapeHtml(range.label)}</button>
        `;
      }).join("")}
    </div>
  `;
}

function renderDashboardEmptyRow(colspan, message, options = {}) {
  const compactClass = options.compact ? " compact" : "";
  return `
    <tr>
      <td colspan="${colspan}">
        <div class="library-team-empty-state${compactClass}">
          <div class="library-team-empty-icon" aria-hidden="true">0</div>
          <div>
            <h3>暂无数据</h3>
            <p>${escapeHtml(message)}</p>
          </div>
        </div>
      </td>
    </tr>
  `;
}

function renderTeamGate(createState) {
  if (createState.canCreate && createState.reason === "team_setup") {
    return `
      <section class="library-team-upgrade-gate is-entitled" aria-label="团队协作设置">
        <div>
          <p class="library-team-kicker">团队协作资格</p>
          <h2>已获得团队协作资格</h2>
          <p>当前仍按个人专业版使用。创建子账户后，再开启团队成员管理、项目范围分配和团队数据看板。</p>
        </div>
        <button class="library-team-button library-team-button-primary" type="button" data-action="open-team-member-create">创建子账户</button>
      </section>
    `;
  }

  if (createState.canCreate) {
    return `
      <section class="library-team-upgrade-gate is-entitled" aria-label="团队专业版状态">
        <div>
          <p class="library-team-kicker">团队额度</p>
          <h2>专业版已开通</h2>
          <p>可创建成员账号、分配项目范围和积分额度。临时密码只在创建或重置时显示。</p>
        </div>
        <button class="library-team-button library-team-button-primary" type="button" data-action="open-team-member-create">创建子账户</button>
      </section>
    `;
  }

  if (createState.reason === "seat_limit") {
    return `
      <section class="library-team-upgrade-gate" aria-label="团队席位已满">
        <div>
          <p class="library-team-kicker">团队额度</p>
          <h2>团队子账号已达上限</h2>
          <p>当前团队子账号数量已达后台配置上限，请联系客服调整额度后继续创建。</p>
        </div>
        <button class="library-team-button library-team-button-primary" type="button" ${renderActionAttrs(createState.action, createState.message)}>联系客服</button>
      </section>
    `;
  }

  if (createState.reason === "permission") {
    return `
      <section class="library-team-upgrade-gate" aria-label="团队创建权限不足">
        <div>
          <p class="library-team-kicker">团队额度</p>
          <h2>当前账号没有创建成员权限</h2>
          <p>你可以查看团队数据，但创建成员需要主账号、管理员或有成员组权限的组管理员操作。</p>
        </div>
        <button class="library-team-button" type="button" ${renderActionAttrs(createState.action, createState.message)}>查看原因</button>
      </section>
    `;
  }

  return `
    <section class="library-team-upgrade-gate" aria-label="团队资产库专业版关卡">
      <div>
        <p class="library-team-kicker">团队额度</p>
        <h2>团队资产库为专业版会员权益</h2>
        <p>团队资产库为专业版会员权益，开通后使用该功能。</p>
      </div>
      <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">开通专业版</button>
    </section>
  `;
}

function renderTeamPolicyPanel({ createState, metrics }) {
  const seatState = createState.statusText;
  const isTeamSetup = createState.reason === "team_setup";

  return `
    <aside class="library-team-policy-panel" aria-label="席位与积分和权限摘要">
      <section class="library-team-policy-block">
        <p class="library-team-kicker">席位与积分</p>
        <h2>${isTeamSetup ? "可用团队额度" : "团队额度"}</h2>
        <dl class="library-team-mini-stats">
          ${renderMiniStat("席位", metrics.seats)}
          ${renderMiniStat("可分配积分", metrics.distributableCredits)}
          ${renderMiniStat("任务并发", metrics.concurrency)}
        </dl>
        <p>${escapeHtml(seatState)}，${isTeamSetup ? "个人创作权益已生效；创建成员后再按成员和项目需要分配积分。" : "积分统一由主账号购买，再按成员和项目需要分配。"}</p>
        <button class="library-team-link-button compact" type="button" ${renderActionAttrs(createState.action, createState.message)}>
          ${escapeHtml(createState.secondaryLabel)}
        </button>
      </section>
      <section class="library-team-policy-block">
        <p class="library-team-kicker">权限矩阵</p>
        <h2>角色边界</h2>
        <ul class="library-team-policy-list">
          <li>管理员可管理全团队成员、项目、积分和资产。</li>
          <li>组管理员只管理本组成员和组内项目。</li>
          <li>导演、动画师、编剧、剪辑师按项目范围获得生产权限。</li>
        </ul>
        <button class="library-team-link-button compact" type="button" data-action="open-member-rules">查看规则说明</button>
      </section>
    </aside>
  `;
}

function renderMiniStat(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderFixtureMemberRow(member) {
  return `
    <tr>
      <td>${escapeHtml(member.teamAccount)}</td>
      <td>${escapeHtml(member.displayName)}</td>
      <td>${escapeHtml(projectScopeLabel(member))}</td>
      <td>${escapeHtml(member.memberGroupId ? "成员组" : "团队直属")}</td>
      <td><span class="library-team-status-pill">${escapeHtml(statusLabel(member.status))}</span></td>
      <td>${escapeHtml(member.creditBalance ?? 0)}</td>
      <td>${escapeHtml(member.remark ?? "-")}</td>
      <td><button class="library-team-link-button compact" type="button" data-action="show-library-placeholder" data-placeholder-message="成员编辑会在角色和项目分配接口接入后开放。">管理</button></td>
    </tr>
  `;
}

function renderDashboardMemberRow(member) {
  return `
    <tr>
      <td>${escapeHtml(member.teamAccount)}</td>
      <td>${escapeHtml(member.displayName)}</td>
      <td>${escapeHtml(member.creditUsed ?? 0)}</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td><button class="library-team-link-button compact" type="button" data-action="show-library-placeholder" data-placeholder-message="成员积分明细会随消耗流水接入。">明细</button></td>
    </tr>
  `;
}

function renderMemberEmptyRow(createState, options = {}) {
  const hasMembers = options.hasMembers === true;
  const title = hasMembers ? "未找到匹配成员" : "创建成员开始团队协作";
  const message = hasMembers ? "尝试调整关键词、角色或状态筛选。" : "";
  const action = hasMembers
    ? ""
    : `<button class="library-team-button library-team-button-primary" type="button" ${renderActionAttrs(createState.action, createState.message)}>${escapeHtml(createState.buttonLabel)}</button>`;

  return `
    <tr>
      <td colspan="${memberTableColumns.length}">
        <div class="library-team-empty-state">
          <div class="library-team-empty-icon" aria-hidden="true">成员</div>
          <div>
            <h3>${escapeHtml(title)}</h3>
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
          </div>
          ${action}
        </div>
      </td>
    </tr>
  `;
}

function renderFixtureCreateMemberModal(modal = {}) {
  const { open, draft = {}, notice = "", temporaryPassword = "" } = modal ?? {};
  if (!open) {
    return "";
  }

  const suffix = String(draft.teamAccountSuffix ?? "").trim().toLowerCase();
  const teamAccount = String(draft.teamAccount ?? "");
  const loginAccount = String(
    draft.memberLoginAccount ??
    draft.member_login_account ??
    (suffix && teamAccount ? `${teamAccount}@${suffix}` : ""),
  ).trim();
  const roleOptions = [
    ["director", "导演"],
    ["producer", "制片"],
    ["viewer", "查看者"],
  ];
  const safeDraft = {
    teamAccount,
    displayName: draft.displayName ?? "",
    initialCredits: draft.initialCredits ?? 0,
    remark: draft.remark ?? "",
    projectIds: Array.isArray(draft.projectIds) ? draft.projectIds.map((item) => String(item ?? "")) : [],
    scriptIds: Array.isArray(draft.scriptIds) ? draft.scriptIds.map((item) => String(item ?? "")) : [],
    canvasIds: Array.isArray(draft.canvasIds) ? draft.canvasIds.map((item) => String(item ?? "")) : [],
  };
  const selectedProjectIds = new Set(safeDraft.projectIds.filter(Boolean));
  const selectedScriptIds = new Set(safeDraft.scriptIds.filter(Boolean));
  const selectedCanvasIds = new Set(safeDraft.canvasIds.filter(Boolean));
  const availableProjects = Array.isArray(modal.availableProjects) ? modal.availableProjects : [];
  const availableScripts = Array.isArray(modal.availableScripts) ? modal.availableScripts : [];
  const availableCanvases = Array.isArray(modal.availableCanvases) ? modal.availableCanvases : [];
  const selectedProjects = availableProjects.filter((project) => selectedProjectIds.has(String(project?.id ?? "")));
  const selectedScripts = availableScripts.filter((script) => selectedScriptIds.has(String(script?.id ?? "")));
  const selectedCanvases = availableCanvases.filter((canvas) => selectedCanvasIds.has(String(canvas?.id ?? "")));

  return `
    <div class="library-team-modal-backdrop" data-modal="team-member-create">
      <section
        class="library-team-modal library-team-member-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-member-create-title"
      >
        <header class="library-team-modal-header">
          <div>
            <p class="library-team-kicker">成员账号</p>
            <h2 id="team-member-create-title">创建成员账号</h2>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-team-member-create" aria-label="关闭创建成员弹窗">×</button>
        </header>
        <div class="library-team-form-grid">
          <label class="library-team-field stacked">
            <span>成员账户 / 登录账户</span>
            <input id="team-member-team-account" type="text" value="${escapeAttr(loginAccount)}" placeholder="director001@abc123" autocomplete="off" />
          </label>
          <label class="library-team-field stacked">
            <span>成员名称</span>
            <input id="team-member-display-name" type="text" value="${escapeAttr(safeDraft.displayName)}" placeholder="导演一号" autocomplete="off" />
          </label>
          <label class="library-team-field stacked">
            <span>初始积分</span>
            <input id="team-member-initial-credits" type="number" min="0" step="1" value="${escapeAttr(Math.max(0, Number(safeDraft.initialCredits) || 0))}" />
          </label>
          <label class="library-team-field stacked wide">
            <span>备注</span>
            <textarea id="team-member-remark" rows="3" placeholder="可填写成员职责或项目范围">${escapeHtml(safeDraft.remark)}</textarea>
          </label>
          <div class="library-team-field stacked wide">
            <span>可分配资源</span>
            <div class="team-member-resource-grid">
              <section class="team-member-resource-panel">
                <header>
                  <strong>项目</strong>
                  <span>${escapeHtml(String(selectedProjects.length))} / ${escapeHtml(String(availableProjects.length))}</span>
                </header>
                <div class="team-member-resource-list team-member-resource-list-selectable">
                  ${
                    availableProjects.length
                      ? availableProjects.map((project) => {
                        const projectId = String(project?.id ?? "");
                        const checked = selectedProjectIds.has(projectId);
                        const label = String(project?.name ?? project?.title ?? projectId ?? "未命名项目");
                        return `
                          <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                            <input
                              type="checkbox"
                              data-action="toggle-team-member-project"
                              data-project-id="${escapeAttr(projectId)}"
                              ${checked ? "checked" : ""}
                            />
                            <span>${escapeHtml(label)}</span>
                          </label>
                        `;
                      }).join("")
                      : '<p class="team-member-resource-empty">暂无可分配项目</p>'
                  }
                </div>
              </section>
              <section class="team-member-resource-panel">
                <header>
                  <strong>剧本</strong>
                  <span>${escapeHtml(String(selectedScripts.length))} / ${escapeHtml(String(availableScripts.length))}</span>
                </header>
                <div class="team-member-resource-list team-member-resource-list-selectable">
                  ${
                    availableScripts.length
                      ? availableScripts.map((script) => {
                        const scriptId = String(script?.id ?? "");
                        const checked = selectedScriptIds.has(scriptId);
                        const label = String(script?.title ?? script?.name ?? scriptId ?? "未命名剧本");
                        return `
                          <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                            <input
                              type="checkbox"
                              data-action="toggle-team-member-script"
                              data-script-id="${escapeAttr(scriptId)}"
                              ${checked ? "checked" : ""}
                            />
                            <span>${escapeHtml(label)}</span>
                          </label>
                        `;
                      }).join("")
                      : '<p class="team-member-resource-empty">暂无可分配剧本</p>'
                  }
                </div>
              </section>
              <section class="team-member-resource-panel">
                <header>
                  <strong>画布</strong>
                  <span>${escapeHtml(String(selectedCanvases.length))} / ${escapeHtml(String(availableCanvases.length))}</span>
                </header>
                <div class="team-member-resource-list team-member-resource-list-selectable">
                  ${
                    availableCanvases.length
                      ? availableCanvases.map((canvas) => {
                        const canvasId = String(canvas?.id ?? "");
                        const checked = selectedCanvasIds.has(canvasId);
                        const label = String(canvas?.title ?? canvas?.name ?? canvasId ?? "未命名画布");
                        return `
                          <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                            <input
                              type="checkbox"
                              data-action="toggle-team-member-canvas"
                              data-canvas-id="${escapeAttr(canvasId)}"
                              ${checked ? "checked" : ""}
                            />
                            <span>${escapeHtml(label)}</span>
                          </label>
                        `;
                      }).join("")
                      : '<p class="team-member-resource-empty">暂无可分配画布</p>'
                  }
                </div>
              </section>
            </div>
          </div>
        </div>
        ${notice ? `<p class="library-team-inline-status" role="status">${escapeHtml(notice)}</p>` : ""}
        ${
          temporaryPassword
            ? `<div class="library-team-secret-note" role="status">
                <strong>临时密码只显示一次</strong>
                <code>${escapeHtml(temporaryPassword)}</code>
                <p>请立即交给成员保存。关闭后需要通过重置密码重新生成。</p>
              </div>`
            : ""
        }
        <footer class="library-team-modal-actions">
          <button class="library-team-button" type="button" data-action="close-team-member-create">取消</button>
          <button class="library-team-button library-team-button-primary" type="button" data-action="submit-team-member-create">创建成员账号</button>
        </footer>
      </section>
    </div>
  `;
}

function buildTeamMetrics(overview, members, fallback) {
  if (!overview) {
    return fallback ?? teamFixture.metrics;
  }

  const consumedCredits = members.reduce(
    (sum, member) => sum + Number(member.creditUsed ?? 0),
    0,
  );
  const allocatableCredits = overview.credits?.allocatable ?? 0;

  return {
    projects: fallback?.projects ?? 0,
    seats: `${overview.seats?.used ?? 0}/${overview.seats?.limit ?? 0}`,
    concurrency: overview.concurrency?.singleAccountLimit ?? 1,
    consumedCredits,
    remainingCredits: allocatableCredits,
    distributableCredits: allocatableCredits,
  };
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
  const seats = stats.seats ?? {};
  const seatUsed = Number(seats.used ?? memberCount);
  const seatLimit = Number(seats.limit ?? seats.total ?? stats.memberCount ?? Math.max(memberCount, seatUsed));
  const credits = stats.credits ?? {};
  const metrics = stats.metrics ?? {};
  return {
    projects: Number(stats.episodeCount ?? metrics.projects ?? stats.projects ?? 0),
    seats: `${seatUsed}/${seatLimit}`,
    concurrency: Number(stats.generatedVideoCount ?? stats.concurrency?.singleAccountLimit ?? stats.concurrency ?? 0),
    consumedCredits: Number(stats.generatedImageCount ?? metrics.consumedCredits ?? stats.consumedCredits ?? 0),
    remainingCredits: Number(stats.assetCount ?? credits.remaining ?? credits.allocatable ?? stats.remainingCredits ?? 0),
    distributableCredits: Number(stats.exportCount ?? credits.allocatable ?? stats.distributableCredits ?? 0),
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

  return `
    <label class="library-team-field">
      <input
        type="text"
        placeholder="搜索成员名称"
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
      member?.teamAccount,
      member?.displayName,
      member?.phone,
      member?.userId,
      member?.role,
      member?.status,
      mapMemberStatusLabel(member?.status),
      member?.creditBalance,
      member?.creditUsed,
      member?.consumedCredits,
      member?.scriptCount,
      member?.projectCount,
      member?.projectAverageCredits,
      member?.remark,
      member?.note,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(query));
  });
}

function renderMemberRow(member, index, createState = {}) {
  const name = member.memberName ?? member.displayName ?? member.phone ?? member.userId ?? `成员 ${index + 1}`;
  const teamAccount = String(member.teamAccount ?? member.memberAccount ?? member.member_account ?? member.phone ?? member.userId ?? "-").trim();
  const account = renderTeamMemberLoginAccount(member);
  const note = member.remark ?? member.note ?? "-";
  const projectScope = member.projectScope ?? "当前工作区";
  const memberGroup = member.memberGroup ?? "默认组";
  const creditQuota = member.creditQuota ?? member.creditBalance ?? member.consumedCredits ?? 0;
  const legacyScriptCount = member.scriptCount ?? "";
  const legacyProjectCount = member.projectCount ?? "";
  const isEntitlementLocked = createState?.reason === "entitlement";
  const actionLabel = isEntitlementLocked ? "开通专业版" : "编辑";
  const memberId = member.membershipId ?? member.id ?? "";
  const memberStatus = String(member.status ?? "");
  const nextStatus = memberStatus === "disabled" ? "active" : "disabled";
  const statusActionLabel = nextStatus === "disabled" ? "禁用" : "启动";
  const actionAttrs = isEntitlementLocked
    ? renderActionAttrs("open-pricing")
    : `data-action="open-edit-member" data-member-id="${escapeAttr(memberId)}"`;
  const statusActionAttrs = isEntitlementLocked
    ? renderActionAttrs("open-pricing")
    : `data-action="toggle-team-member-status" data-member-id="${escapeAttr(memberId)}" data-next-status="${escapeAttr(nextStatus)}"`;
  const deleteActionAttrs = isEntitlementLocked
    ? renderActionAttrs("open-pricing")
    : `data-action="delete-team-member" data-member-id="${escapeAttr(memberId)}"`;
  return `
    <tr data-member-script-count="${escapeAttr(legacyScriptCount)}" data-member-project-count="${escapeAttr(legacyProjectCount)}">
      <td><span class="library-team-row-check" aria-hidden="true"></span></td>
      <td>${escapeHtml(teamAccount)}</td>
      <td>${escapeHtml(account)}</td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(creditQuota)}</td>
      <td>${escapeHtml(mapMemberStatusLabel(member.status) ?? (member.status ? String(member.status) : "未知"))}</td>
      <td>${escapeHtml(member.createdAt ?? member.created_at ?? "-")}</td>
      <td>${escapeHtml(member.updatedAt ?? member.updated_at ?? "-")}</td>
      <td>
        <div class="library-team-actions-inline">
          <button class="library-team-link-button" type="button" ${actionAttrs}>${escapeHtml(actionLabel)}</button>
          <button class="library-team-link-button compact" type="button" ${statusActionAttrs}>${escapeHtml(statusActionLabel)}</button>
          <button class="library-team-link-button compact danger" type="button" ${deleteActionAttrs}>删除</button>
        </div>
      </td>
    </tr>
  `;
}

function renderTeamMemberLoginAccount(member) {
  const fullAccount = String(member?.memberLoginAccount ?? member?.member_login_account ?? "").trim();
  if (fullAccount) {
    return fullAccount;
  }

  const teamAccount = String(member?.teamAccount ?? member?.memberAccount ?? member?.member_account ?? "").trim();
  const suffix = String(
    member?.teamAccountSuffix ??
    member?.team_account_suffix ??
    member?.accountSuffix ??
    member?.memberAccountSuffix ??
    member?.member_account_suffix ??
    member?.userTeamAccountSuffix ??
    "",
  ).trim().toLowerCase();
  if (teamAccount && suffix) {
    return `${teamAccount}@${suffix}`;
  }

  return teamAccount ? `${teamAccount}@` : member?.phone || member?.userId || "-";
}

function renderDashboardRow(member, index, selectedDashboardMemberId) {
  const name = member.phone ?? member.userId ?? `成员 ${index + 1}`;
  const selected = String(member?.id ?? "") === String(selectedDashboardMemberId ?? "");
  return `
    <tr${selected ? ' class="is-selected"' : ""}>
      <td>${escapeHtml(member.phone ?? member.userId ?? "-")}</td>
      <td>${escapeHtml(name)}</td>
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
  if (tabId === "project-cost") {
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
  const suffix = String(modal.teamAccountSuffix ?? "").trim().toLowerCase();
  const teamAccount = String(modal.teamAccount ?? "").trim();
  return `
    <div class="library-team-modal-backdrop" data-modal="create-member">
      <section
        class="library-team-modal library-team-member-create-modal"
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
            <span>成员账户</span>
            <span class="library-team-account-input-group">
              <input
                id="team-member-team-account-input"
                type="text"
                value="${escapeAttr(teamAccount)}"
                placeholder="director001"
                data-action="change-create-member-team-account"
              />
              ${suffix ? `<strong>@${escapeHtml(suffix)}</strong>` : ""}
            </span>
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
  const selectedProjectIds = new Set(
    (Array.isArray(modal.projectIds) ? modal.projectIds : []).map((item) => String(item ?? "")).filter(Boolean),
  );
  const selectedScriptIds = new Set(
    (Array.isArray(modal.scriptIds) ? modal.scriptIds : []).map((item) => String(item ?? "")).filter(Boolean),
  );
  const selectedCanvasIds = new Set(
    (Array.isArray(modal.canvasIds) ? modal.canvasIds : []).map((item) => String(item ?? "")).filter(Boolean),
  );
  const availableProjects = Array.isArray(modal.availableProjects) ? modal.availableProjects : [];
  const availableScripts = Array.isArray(modal.availableScripts) ? modal.availableScripts : [];
  const availableCanvases = Array.isArray(modal.availableCanvases) ? modal.availableCanvases : [];
  const selectedProjects = availableProjects.filter((project) => selectedProjectIds.has(String(project?.id ?? "")));
  const selectedScripts = availableScripts.filter((script) => selectedScriptIds.has(String(script?.id ?? "")));
  const selectedCanvases = availableCanvases.filter((canvas) => selectedCanvasIds.has(String(canvas?.id ?? "")));
  return `
    <div class="library-team-modal-backdrop" data-modal="edit-member">
      <section
        class="library-team-modal library-team-member-modal library-team-member-modal-edit"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-member-title"
      >
        <header class="library-team-modal-header">
          <div>
            <p class="library-team-kicker">成员维护</p>
            <h2 id="edit-member-title">编辑成员</h2>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-edit-member" aria-label="关闭成员详情弹窗">×</button>
        </header>
        <div class="library-team-form-grid library-team-form-grid-edit">
          <section class="library-team-member-section-card">
            <div class="library-team-member-section-head">
              <h3>成员资料与积分</h3>
              <span class="library-team-status-pill">${escapeHtml(statusLabel)}</span>
            </div>
            <label class="library-team-field stacked">
              <span>完整账号</span>
            <input class="library-team-readonly-field" type="text" value="${escapeAttr(
              modal.memberLoginAccount ??
              modal.member_login_account ??
              ((modal.teamAccount || modal.memberAccount) && modal.teamAccountSuffix
                ? `${modal.teamAccount ?? modal.memberAccount}@${String(modal.teamAccountSuffix ?? "").trim().toLowerCase()}`
                : "") ??
              modal.phone ??
              ""
            )}" readonly />
            </label>
            <label class="library-team-field stacked">
              <span>成员名称</span>
              <input
                id="team-edit-member-display-name-input"
                type="text"
                value="${escapeAttr(modal.displayName ?? "")}"
                placeholder="请输入成员名称"
                data-action="change-edit-member-display-name"
              />
            </label>
            <label class="library-team-field stacked wide">
              <span>备注</span>
              <textarea
                id="team-edit-member-note-input"
                rows="3"
                placeholder="补充成员职责或协作说明"
                data-action="change-edit-member-note"
              >${escapeHtml(modal.note ?? "")}</textarea>
            </label>
            <div class="library-team-member-password-block">
              <div class="library-team-member-password-head">
                <h4>密码重置</h4>
                <span>留空则不修改</span>
              </div>
              <div class="library-team-member-inline-grid">
                <label class="library-team-field stacked">
                  <span>新密码</span>
                  <input
                    id="team-edit-member-new-password-input"
                    type="password"
                    placeholder="至少 8 位"
                    autocomplete="new-password"
                    data-action="change-edit-member-new-password"
                    value="${escapeAttr(modal.newPassword ?? "")}"
                  />
                </label>
                <label class="library-team-field stacked">
                  <span>确认密码</span>
                  <input
                    id="team-edit-member-confirm-password-input"
                    type="password"
                    placeholder="再次输入新密码"
                    autocomplete="new-password"
                    data-action="change-edit-member-confirm-password"
                    value="${escapeAttr(modal.confirmPassword ?? "")}"
                  />
                </label>
              </div>
            </div>
            <div class="library-team-member-inline-grid">
              <label class="library-team-field stacked">
                <span>当前积分</span>
                <input type="text" value="${escapeAttr(modal.creditBalance ?? 0)}" disabled />
              </label>
              <label class="library-team-field stacked">
                <span>积分操作</span>
                <select id="team-edit-member-credit-action-input" data-action="change-edit-member-credit-adjustment-type" aria-label="编辑成员积分操作">
                  ${[
                    ["", "不调整"],
                    ["increase", "增加积分"],
                    ["deduct", "减少积分"],
                  ].map(([value, label]) => `<option value="${escapeAttr(value)}" ${value === (modal.creditAdjustmentType ?? "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
                </select>
              </label>
              <label class="library-team-field stacked">
                <span>积分数量</span>
                <input
                  id="team-edit-member-credit-amount-input"
                  type="number"
                  min="0"
                  step="1"
                  value="${escapeAttr(modal.creditAmount ?? "")}"
                  placeholder="不调整可留空"
                  data-action="change-edit-member-credit-amount"
                />
              </label>
            </div>
          </section>
          <section class="library-team-member-section-card library-team-member-resource-card">
            <div class="library-team-member-section-head">
              <div>
                <p class="library-team-kicker">资源权限</p>
                <h3>重新勾选子账户可见范围</h3>
              </div>
              <span class="library-team-member-scope-badge">项目 / 画布 / 剧本</span>
            </div>
            <div class="library-team-field stacked wide">
              <span>子账户可见</span>
              <div class="team-member-resource-grid">
                <section class="team-member-resource-panel">
                  <header>
                    <strong>项目</strong>
                    <span>${escapeHtml(String(selectedProjects.length))} / ${escapeHtml(String(availableProjects.length))}</span>
                  </header>
                  <div class="team-member-resource-list team-member-resource-list-selectable">
                    ${
                      availableProjects.length
                        ? availableProjects.map((project) => {
                          const projectId = String(project?.id ?? "");
                          const checked = selectedProjectIds.has(projectId);
                          const label = String(project?.name ?? project?.title ?? projectId ?? "未命名项目");
                          return `
                            <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                              <input
                                type="checkbox"
                                data-action="toggle-edit-member-project"
                                data-project-id="${escapeAttr(projectId)}"
                                ${checked ? "checked" : ""}
                              />
                              <span>${escapeHtml(label)}</span>
                            </label>
                          `;
                        }).join("")
                        : '<p class="team-member-resource-empty">暂无可分配项目</p>'
                    }
                  </div>
                </section>
                <section class="team-member-resource-panel">
                  <header>
                    <strong>剧本</strong>
                    <span>${escapeHtml(String(selectedScripts.length))} / ${escapeHtml(String(availableScripts.length))}</span>
                  </header>
                  <div class="team-member-resource-list team-member-resource-list-selectable">
                    ${
                      availableScripts.length
                        ? availableScripts.map((script) => {
                          const scriptId = String(script?.id ?? "");
                          const checked = selectedScriptIds.has(scriptId);
                          const label = String(script?.title ?? script?.name ?? scriptId ?? "未命名剧本");
                          return `
                            <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                              <input
                                type="checkbox"
                                data-action="toggle-edit-member-script"
                                data-script-id="${escapeAttr(scriptId)}"
                                ${checked ? "checked" : ""}
                              />
                              <span>${escapeHtml(label)}</span>
                            </label>
                          `;
                        }).join("")
                        : '<p class="team-member-resource-empty">暂无可分配剧本</p>'
                    }
                  </div>
                </section>
                <section class="team-member-resource-panel">
                  <header>
                    <strong>画布</strong>
                    <span>${escapeHtml(String(selectedCanvases.length))} / ${escapeHtml(String(availableCanvases.length))}</span>
                  </header>
                  <div class="team-member-resource-list team-member-resource-list-selectable">
                    ${
                      availableCanvases.length
                        ? availableCanvases.map((canvas) => {
                          const canvasId = String(canvas?.id ?? "");
                          const checked = selectedCanvasIds.has(canvasId);
                          const label = String(canvas?.title ?? canvas?.name ?? canvasId ?? "未命名画布");
                          return `
                            <label class="team-member-resource-item${checked ? " is-selected" : ""}">
                              <input
                                type="checkbox"
                                data-action="toggle-edit-member-canvas"
                                data-canvas-id="${escapeAttr(canvasId)}"
                                ${checked ? "checked" : ""}
                              />
                              <span>${escapeHtml(label)}</span>
                            </label>
                          `;
                        }).join("")
                        : '<p class="team-member-resource-empty">暂无可分配画布</p>'
                    }
                  </div>
                </section>
              </div>
              <p class="team-member-resource-hint">三类资源都支持重新勾选；勾选剧本或画布时，会自动补齐其所属项目的访问权限。</p>
            </div>
          </section>
        </div>
        <p class="library-team-inline-status" role="status">${escapeHtml(modal.notice ?? "")}</p>
        <footer class="library-team-modal-actions library-team-modal-actions-edit">
          <button class="library-team-button library-team-button-ghost library-team-button-modal-secondary" type="button" data-action="close-edit-member">关闭</button>
          <button class="library-team-button library-team-button-modal-warning" type="button" data-action="toggle-member-status">
            ${escapeHtml(modal.status === "disabled" ? "恢复成员" : "停用成员")}
          </button>
          <button class="library-team-button library-team-button-primary library-team-button-modal-primary" type="button" data-action="submit-edit-member">保存修改</button>
        </footer>
      </section>
    </div>
  `;
}

function renderMemberConfirmModal(modal) {
  if (!modal?.open) {
    return "";
  }

  return `
    <section class="modal-backdrop delete-project-backdrop" role="dialog" aria-modal="true" aria-label="${escapeAttr(modal.title ?? "确认操作")}">
      <div class="delete-project-modal asset-delete-modal">
        <div class="delete-project-head">
          <div class="delete-project-icon warning">!</div>
          <div>
            <h2>${escapeHtml(modal.title ?? "确认操作")}</h2>
            <p>${escapeHtml(modal.text ?? "")}</p>
          </div>
          <button class="modal-close" type="button" data-action="close-member-confirm-modal">×</button>
        </div>
        <div class="delete-project-actions">
          <button class="secondary-action delete-cancel-button" type="button" data-action="close-member-confirm-modal">取消</button>
          <button class="delete-confirm-button" type="button" data-action="${escapeAttr(modal.confirmAction ?? "confirm-member-action")}">${escapeHtml(modal.confirmLabel ?? "确定")}</button>
        </div>
      </div>
    </section>
  `;
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
