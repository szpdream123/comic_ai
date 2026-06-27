import { permissionRows, teamRoles } from "../../shared/permissions-fixtures.js";
import { escapeHtml } from "./markup.js";

export function renderMemberRulesModal({ open = false } = {}) {
  if (!open) {
    return "";
  }

  if (!Array.isArray(permissionRows) || permissionRows.length === 0) {
    return `
      <section class="library-team-error" role="alert">
        权限矩阵加载失败，请刷新后重试
      </section>
    `;
  }

  return `
    <div class="library-team-modal-backdrop" data-modal="member-rules">
      <section
        class="library-team-modal library-team-rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-rules-title"
      >
        <header class="library-team-modal-header">
          <h2 id="member-rules-title">成员管理规则说明</h2>
          <button class="library-team-icon-button" type="button" data-action="close-member-rules" aria-label="关闭规则说明">×</button>
        </header>
        <div class="library-team-modal-scroll">
          <section>
            <h3>基础规则</h3>
            <p>子账号专为团队协作设计。通过主账号+子账号模式，您可以在保障主账号安全的前提下，灵活管控团队的分组、参与项目、功能权限及可用积分。</p>
            <p><strong>账号关系：</strong>注册账号即为主账号，开通团队后可创建并管理多个子账号。</p>
            <p><strong>资产归属：</strong>子账号在项目中产生的资产统一归团队所有。</p>
            <p><strong>积分流转：</strong>主账号负责统一购买积分。管理员/组管理员可将主账号积分下发给子账号。</p>
            <p><strong>权限控制：</strong>子账号的所有操作均严格受其角色权限控制。</p>
          </section>
          <section>
            <h3>成员角色权限管理</h3>
            <p>创建子账号时需为其设定角色。角色决定项目参与范围、资产操作权限和积分使用边界。同一子账号在所有项目中的权限保持一致，由其角色决定。</p>
            <p><strong>管理员：</strong>负责全局团队管理，可创作并管理所有项目资产，支持跨组管理所有子账号。</p>
            <p><strong>组管理员：</strong>负责成员组管理，可创作并管理本成员组项目资产，管理组内子账号。</p>
            <p><strong>生产类角色：</strong>导演、动画师、编剧、剪辑师按分配项目获得创作、查看、下载或删除权限。</p>
          </section>
          <section>
            <h3>成员组管理</h3>
            <p>成员组用于适配部门、工作室或分公司等多层级架构，1个团队最多可创建20个成员组。</p>
            <p><strong>成员组：</strong>创建子账号时若选择成员组，该账号受成员组的组管理员管理，其数据计入该成员组统计。</p>
            <p><strong>团队直属：</strong>创建子账号时若不选成员组，该账号直属于团队，由主账号/管理员直接管理，可跨组参与项目。</p>
            <p><strong>变更成员组：</strong>成员变更所属组后，其角色和积分保留，但参与的项目将被清空，需重新分配。</p>
            <p><strong>删除成员组：</strong>组内成员与项目资产不会被删除，归属关系将自动转为团队直属。成员角色与积分保留，但参与的项目将被清空，需重新分配。</p>
          </section>
          <section>
            <h3>积分管理机制</h3>
            <p>管理员/组管理员可随时从主账号向子账号分配积分，也可将子账号未使用的积分回收至主账号。</p>
            <p><strong>过期优先抵扣：</strong>积分到期时，系统优先回收主账号剩余积分。若主账号余额不足，系统将按子账号近半年的活跃度排序，优先回收最不活跃的子账号积分。</p>
          </section>
          <section>
            <h3>账号与安全管理</h3>
            <p>子账号使用虚拟邮箱与密码登录。主账号/管理员可导出查看密码或强制重置，重置密码后账号原有权限和资产完全保留。</p>
            <p>子账号创建后不可彻底删除。若人员离职或不再使用，请将状态修改为停用，该账号将立即无法登录。</p>
            <p>团队子账号总数受当前购买的席位数限制。如需扩容，请联系商务支持。</p>
          </section>
          <section>
            <h3>角色权限对照表</h3>
            <div class="library-team-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>权限分类</th>
                    <th>能力</th>
                    ${teamRoles.map((role) => `<th>${escapeHtml(role)}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>
                  ${permissionRows.map(renderPermissionRow).join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <footer class="library-team-modal-actions">
          <button class="library-team-button library-team-button-primary" type="button" data-action="close-member-rules">确认</button>
        </footer>
      </section>
    </div>
  `;
}

function renderPermissionRow(row) {
  return `
    <tr>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.capability)}</td>
      ${teamRoles.map((_, index) => `<td>${escapeHtml(row.values[index] ?? "—")}</td>`).join("")}
    </tr>
  `;
}

