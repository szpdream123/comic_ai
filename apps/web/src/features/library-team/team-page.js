import { escapeAttr, escapeHtml } from "./markup.js";
import { renderMemberRulesModal } from "./member-rules-modal.js";
import { renderPricingModal } from "./pricing-modal.js";
import { dashboardDateShortcuts, memberFilters, memberTableColumns, teamFixture } from "./team-fixtures.js";

const MEMBER_FILTER_MESSAGE = "成员筛选已保留，后续会接入多条件查询。";
const DASHBOARD_EXPORT_MESSAGE = "导出将在团队统计稳定后开放。";

const dashboardTabs = [
  { id: "member-consumption", label: "成员创作与消耗" },
  { id: "project-cost", label: "项目资产与成本" },
  { id: "ranking", label: "排行榜" },
];

const dashboardTabIds = new Set(dashboardTabs.map((tab) => tab.id));

const dashboardDateRanges = [
  { id: "today", label: dashboardDateShortcuts[0] ?? "今天" },
  { id: "yesterday", label: dashboardDateShortcuts[1] ?? "昨天" },
  { id: "week", label: dashboardDateShortcuts[2] ?? "本周" },
  { id: "month", label: dashboardDateShortcuts[3] ?? "本月" },
  { id: "last-month", label: dashboardDateShortcuts[4] ?? "上月" },
  { id: "year", label: dashboardDateShortcuts[5] ?? "今年" },
];

const dashboardDateRangeIds = new Set(dashboardDateRanges.map((range) => range.id));

const teamRoleOptions = [
  ["admin", "管理员"],
  ["group_admin", "组管理员"],
  ["director_plus", "导演（可下载删除）"],
  ["animator_plus", "动画师（可下载删除）"],
  ["director", "导演"],
  ["animator", "动画师"],
  ["screenwriter", "编剧"],
  ["editor", "剪辑师"],
];

const roleLabelMap = Object.fromEntries(teamRoleOptions);

function resolveCreateMemberState(overview) {
  const hasEntitlement = overview?.entitlements?.teamMemberManagement === true;
  const remainingSeats = Number(overview?.seats?.remaining ?? 0);
  const hasPermission =
    overview?.permissions && typeof overview.permissions === "object"
      ? overview.permissions.canCreateMember === true
      : hasEntitlement;

  if (!hasEntitlement) {
    return {
      canCreate: false,
      reason: "entitlement",
      action: "open-pricing",
      message: "",
      badgeLabel: "专业版会员权益",
      buttonLabel: "创建成员账号",
      secondaryLabel: "开通专业版",
      statusText: "开通后可创建成员账号",
    };
  }

  if (remainingSeats <= 0) {
    return {
      canCreate: false,
      reason: "seat_limit",
      action: "open-pricing",
      message: "",
      badgeLabel: "席位已满",
      buttonLabel: "扩容席位",
      secondaryLabel: "扩容席位",
      statusText: "当前席位已满",
    };
  }

  if (!hasPermission) {
    return {
      canCreate: false,
      reason: "permission",
      action: "show-library-placeholder",
      message: "当前账号没有创建成员权限，请联系主账号或团队管理员。",
      badgeLabel: "无创建权限",
      buttonLabel: "无创建权限",
      secondaryLabel: "查看权限说明",
      statusText: "当前账号没有创建成员权限",
    };
  }

  return {
    canCreate: true,
    reason: "ready",
    action: "open-team-member-create",
    message: "",
    badgeLabel: "专业版团队已启用",
    buttonLabel: "创建成员账号",
    secondaryLabel: "分配团队资源",
    statusText: "可创建成员账号",
  };
}

function renderActionAttrs(action, message = "") {
  const messageAttr = message ? ` data-placeholder-message="${escapeAttr(message)}"` : "";
  return `data-action="${escapeAttr(action)}"${messageAttr}`;
}

export function renderTeamPage(context = {}) {
  const team = context.team ?? {};
  const overview = team.overview ?? null;
  const members = Array.isArray(team.members) ? team.members : teamFixture.members;
  const createState = resolveCreateMemberState(overview);
  const canCreateMember = createState.canCreate;
  const metrics = buildTeamMetrics(overview, members, context.team?.metrics);
  const createAction = createState.action;
  const createActionMessage = createState.message;

  return `
    <section class="library-team-page team-page" aria-labelledby="team-page-title">
      <div class="library-team-shell">
        <header class="library-team-command-strip">
          <div class="library-team-command-copy">
            <p class="library-team-kicker">团队运行</p>
            <h1 id="team-page-title">团队协作台</h1>
            <p class="library-team-subcopy">用成员、项目范围和积分额度管理多人漫剧生产，保证资产沉淀在团队空间。</p>
            <dl class="library-team-command-meta" aria-label="团队关键状态">
              ${renderCommandChip("权益", createState.badgeLabel, canCreateMember ? "is-active" : "is-locked")}
              ${renderCommandChip("席位", metrics.seats)}
              ${renderCommandChip("可分配积分", metrics.distributableCredits)}
            </dl>
          </div>
          <div class="library-team-command-actions">
            <button class="library-team-button" type="button" data-action="open-member-rules">规则说明</button>
            <button class="library-team-button" type="button" data-action="open-team-dashboard">数据看板</button>
            <button class="library-team-button library-team-button-primary" type="button" ${renderActionAttrs(createAction, createActionMessage)}>${escapeHtml(createState.buttonLabel)}</button>
          </div>
        </header>
        <section class="library-team-operations-band" aria-label="团队运行总览">
          ${renderTeamGate(createState)}
          <section class="library-team-metrics" aria-labelledby="team-metrics-title">
            <header>
              <div>
                <p class="library-team-kicker">实时总览</p>
                <h2 id="team-metrics-title">数据管理</h2>
              </div>
              <div class="library-team-section-actions">
                <button class="library-team-icon-button library-team-refresh-icon" type="button" aria-label="刷新团队数据" data-action="refresh-team">刷新</button>
                <button class="library-team-button" type="button" data-action="open-team-dashboard">查看详细数据看板</button>
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
        </section>
        <div class="library-team-workspace-grid">
          <section class="library-team-card team-member-section" aria-labelledby="member-management-title">
            <header class="library-team-section-header">
              <div>
                <p class="library-team-kicker">成员目录</p>
                <h2 id="member-management-title">成员管理</h2>
              </div>
              <div class="library-team-section-actions">
                <button class="library-team-link-button" type="button" data-action="open-member-rules">规则说明</button>
                <button class="library-team-button library-team-button-primary" type="button" ${renderActionAttrs(createAction, createActionMessage)}>${escapeHtml(createState.buttonLabel)}</button>
              </div>
            </header>
            <form class="library-team-filterbar library-team-member-filterbar" aria-label="成员筛选器">
              <div class="library-team-filter-fields">
                ${memberFilters.map(renderMemberFilter).join("")}
              </div>
              <div class="library-team-filter-actions">
                <button
                  class="library-team-button library-team-button-primary"
                  type="button"
                  data-action="show-library-placeholder"
                  data-placeholder-message="${escapeAttr(MEMBER_FILTER_MESSAGE)}"
                >搜索</button>
                <button class="library-team-button library-team-button-ghost" type="reset">重置</button>
              </div>
            </form>
            <div class="library-team-table-wrap">
              <table>
                <thead>
                  <tr>${memberTableColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${members.length > 0 ? members.map(renderMemberRow).join("") : renderMemberEmptyRow(createState)}
                </tbody>
              </table>
            </div>
          </section>
          ${renderTeamPolicyPanel({ createState, metrics })}
        </div>
        ${renderCreateMemberModal({
          open: team.createOpen === true,
          draft: team.draft,
          notice: team.createNotice,
          temporaryPassword: team.temporaryPassword,
        })}
        ${renderPricingModal({ open: context.pricingOpen === true })}
        ${renderMemberRulesModal({ open: context.rulesOpen === true })}
      </div>
    </section>
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

export function renderTeamDashboardPage(context = {}) {
  const team = context.team ?? {};
  const members = Array.isArray(team.members) ? team.members : [];
  const activeTab = normalizeDashboardTab(team.dashboardTab ?? context.dashboardTab);
  const activeDateRange = normalizeDashboardDateRange(
    team.dashboardDateRange ?? context.dashboardDateRange,
  );

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
        ${renderDashboardTabs(activeTab)}
        ${renderDashboardPanel(activeTab, { team, members, activeDateRange })}
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
  if (createState.canCreate) {
    return `
      <section class="library-team-upgrade-gate is-entitled" aria-label="团队专业版状态">
        <div>
          <p class="library-team-kicker">团队额度</p>
          <h2>专业版已开通</h2>
          <p>可创建成员账号、分配项目范围和积分额度。临时密码只在创建或重置时显示。</p>
        </div>
        <button class="library-team-button library-team-button-primary" type="button" data-action="open-team-member-create">创建成员账号</button>
      </section>
    `;
  }

  if (createState.reason === "seat_limit") {
    return `
      <section class="library-team-upgrade-gate" aria-label="团队席位已满">
        <div>
          <p class="library-team-kicker">团队额度</p>
          <h2>团队席位已用完</h2>
          <p>当前专业版席位已满，扩容后才能继续创建成员账号。</p>
        </div>
        <button class="library-team-button library-team-button-primary" type="button" data-action="open-pricing">扩容席位</button>
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

  return `
    <aside class="library-team-policy-panel" aria-label="席位与积分和权限摘要">
      <section class="library-team-policy-block">
        <p class="library-team-kicker">席位与积分</p>
        <h2>团队额度</h2>
        <dl class="library-team-mini-stats">
          ${renderMiniStat("席位", metrics.seats)}
          ${renderMiniStat("可分配积分", metrics.distributableCredits)}
          ${renderMiniStat("任务并发", metrics.concurrency)}
        </dl>
        <p>${escapeHtml(seatState)}，积分统一由主账号购买，再按成员和项目需要分配。</p>
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

function renderMemberRow(member) {
  return `
    <tr>
      <td>${escapeHtml(member.teamAccount)}</td>
      <td>${escapeHtml(member.displayName)}</td>
      <td>${escapeHtml(roleLabelMap[member.businessRole] ?? member.businessRole)}</td>
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
      <td>${escapeHtml(roleLabelMap[member.businessRole] ?? member.businessRole)}</td>
      <td>${escapeHtml(member.creditUsed ?? 0)}</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td>0</td>
      <td><button class="library-team-link-button compact" type="button" data-action="show-library-placeholder" data-placeholder-message="成员积分明细会随消耗流水接入。">明细</button></td>
    </tr>
  `;
}

function renderMemberEmptyRow(createState) {
  return `
    <tr>
      <td colspan="${memberTableColumns.length}">
        <div class="library-team-empty-state">
          <div class="library-team-empty-icon" aria-hidden="true">+</div>
          <div>
            <h3>创建成员开始团队协作</h3>
            <p>邀请成员后，这里会显示账号、角色、项目范围与积分额度。</p>
          </div>
          <button class="library-team-button library-team-button-primary" type="button" ${renderActionAttrs(createState.action, createState.message)}>${escapeHtml(createState.buttonLabel)}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderCreateMemberModal({ open, draft = {}, notice = "", temporaryPassword = "" }) {
  if (!open) {
    return "";
  }

  const safeDraft = {
    teamAccount: draft.teamAccount ?? "",
    displayName: draft.displayName ?? "",
    businessRole: draft.businessRole ?? "director",
    initialCredits: draft.initialCredits ?? 0,
    remark: draft.remark ?? "",
  };

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
            <span>账号</span>
            <input id="team-member-team-account" type="text" value="${escapeAttr(safeDraft.teamAccount)}" placeholder="director001" autocomplete="off" />
          </label>
          <label class="library-team-field stacked">
            <span>成员名称</span>
            <input id="team-member-display-name" type="text" value="${escapeAttr(safeDraft.displayName)}" placeholder="导演一号" autocomplete="off" />
          </label>
          <label class="library-team-field stacked">
            <span>角色</span>
            <select id="team-member-business-role">
              ${teamRoleOptions.map(([value, label]) => `<option value="${escapeAttr(value)}"${safeDraft.businessRole === value ? " selected" : ""}>${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <label class="library-team-field stacked">
            <span>初始积分</span>
            <input id="team-member-initial-credits" type="number" min="0" step="1" value="${escapeAttr(safeDraft.initialCredits)}" />
          </label>
          <label class="library-team-field stacked wide">
            <span>备注</span>
            <textarea id="team-member-remark" rows="3" placeholder="可填写成员职责或项目范围">${escapeHtml(safeDraft.remark)}</textarea>
          </label>
        </div>
        ${
          temporaryPassword
            ? `<div class="library-team-secret-note" role="status">
                <strong>临时密码只显示一次</strong>
                <code>${escapeHtml(temporaryPassword)}</code>
                <p>请立即交给成员保存。关闭后需要通过重置密码重新生成。</p>
              </div>`
            : ""
        }
        ${notice ? `<p class="library-team-inline-status" role="status">${escapeHtml(notice)}</p>` : ""}
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
  return {
    projects: Number(stats.episodeCount ?? stats.projects ?? 0),
    seats: `${memberCount}/${Math.max(memberCount, Number(stats.memberCount ?? memberCount ?? 0))}`,
    concurrency: Number(stats.generatedVideoCount ?? stats.concurrency ?? 0),
    consumedCredits: Number(stats.generatedImageCount ?? stats.consumedCredits ?? 0),
    remainingCredits: Number(stats.assetCount ?? stats.remainingCredits ?? 0),
    distributableCredits: Number(stats.exportCount ?? stats.distributableCredits ?? 0),
  };
}

function renderMemberFilter(label) {
  const isSelect = ["角色", "项目", "状态"].includes(label);
  return `
    <label class="library-team-field">
      <span>${escapeHtml(label)}</span>
      ${
        isSelect
          ? '<select><option>全部</option></select>'
          : `<input type="text" placeholder="请输入" aria-label="${escapeAttr(label)}" />`
      }
    </label>
  `;
}

function projectScopeLabel(member) {
  if (Array.isArray(member.projectIds) && member.projectIds.length > 0) {
    return `${member.projectIds.length} 个项目`;
  }
  return "未分配";
}

function statusLabel(status) {
  return (
    {
      active: "启用",
      invited: "待启用",
      disabled: "禁用",
    }[status] ?? "启用"
  );
}
