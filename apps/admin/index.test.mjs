import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";

test("admin shell keeps the final Chinese page contract and standalone branding", () => {
  assert.match(html, /<title>后台管理<\/title>/);
  assert.match(html, /id="admin-app"/);
  assert.doesNotMatch(html, /id="creator-app"/);

  for (const label of [
    "后台管理",
    "运营总览",
    "模型配置",
    "模型参数详情",
    "用户积分",
    "风控审计",
    "系统设置",
    "管理员账户",
    "修改密码",
    "退出登录",
    "账号已临时锁定",
  ]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Created By Deerflow/);
  assert.match(html, /https:\/\/deerflow\.tech/);
});

test("admin shell wires final design actions to real admin APIs", () => {
  for (const apiPath of [
    "/api/admin/auth/login",
    "/api/admin/auth/me",
    "/api/admin/auth/logout",
    "/api/admin/auth/profile",
    "/api/admin/auth/password",
    "/api/admin/auth/sessions",
    "/api/admin/auth/sessions/revoke-other",
    "/api/admin/dashboard/overview",
    "/api/admin/dashboard/model-health",
    "/api/admin/dashboard/recent-events",
    "/api/admin/models",
    "/api/admin/users",
    "/api/admin/settings",
    "/api/admin/admin-accounts",
    "/api/admin/risks",
    "/api/admin/exports/risks.csv",
    "/api/admin/audit-events",
    "/api/admin/exports/audit-events.csv",
    "/api/admin/storyboard-prompt/packages",
    "/api/admin/image-prompt/styles",
    "/api/admin/secret-references",
    "/probe",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(apiPath)));
  }

  assert.match(script, /idempotency-key": `admin-ui-password-change-\$\{Date\.now\(\)\}`/);
  assert.match(script, /idempotency-key": `admin-ui-revoke-sessions-\$\{Date\.now\(\)\}`/);
  assert.match(script, /idempotency-key": `admin-ui-profile-\$\{Date\.now\(\)\}`/);

  for (const dynamicCall of [
    "credits/grant",
    "credits/deduct",
    "openCreditSetBalanceDrawer",
    "调整到目标积分",
    "目标可用积分",
    "调整差额",
    "admin-ui-credit-set-balance",
    "积分已调整到目标值",
    "credits/ledger",
    "subaccounts",
    "contact/reveal",
    "当前管理员资料",
    "openAdminProfileDrawer",
    "查看完整联系方式",
    "归档账户",
    "archived",
    "profile",
    "status",
    "duplicate",
    "revisions",
    "模型修订历史",
    "模型上线检查",
    "isValidProviderEndpoint",
    "createTaskEndpoint",
    "queryTaskEndpoint",
    "invocationMode === \"async_polling\"",
    "轮询 Endpoint",
    "model-parameter-builder",
    "手动添加参数",
    "参数键",
    "参数类型",
    "选项内容",
    "addManualParameterToSchema",
    "parameterSchemaFromForm",
    "现有参数",
    "编辑参数",
    "删除参数",
    "parameter-schema-list",
    "fillManualParameterEditor",
    "removeManualParameterFromSchema",
    "adminEditableOptions",
    "failedItems",
    "renderLaunchCheckFailure",
    "!launchCheck.ok",
    "admin_model_launch_check_failed",
    "loadDashboardModelHealth",
    "loadDashboardRecentEvents",
    "admin_account_locked",
    "repair-credit",
    "retry",
    "openAuditEventDrawer",
    "riskStatusFilter",
    "riskStatus=",
    "risk.export",
    "downloadRiskExport",
    "window.location.assign",
    "审计主体",
    "请求上下文",
    "adminDisplayName",
    "ipAddress",
    "userAgent",
    "password",
    "rollback",
    "当前会话",
    "退出其他会话",
    "loadAdminSessions",
    "revokeOtherAdminSessions",
    "值必须匹配声明类型",
    "invalid_config_value",
    "探测密钥",
    "probeSecretReference",
    "二次确认",
    "requireDangerConfirm",
    "确认修改配置",
    "确认回滚配置",
    "确认保存密钥",
    "确认修改账户",
    "确认重置密码",
    "关联工单号（选填）",
    "optionalWorkOrder",
    "metadata?.workOrderNo",
    "adjustmentScenario",
    "adjustmentScenarioOptions",
    "compensation",
    "recharge_bonus",
    "default_grant",
    "ledgerResult.summary",
    "renderCreditSummary",
    "creditLedgerDisplayChange",
    "creditLedgerSourceLabel",
    "积分变化",
    "图片生成",
    "视频生成",
    "剧本生成",
    "balanceScope",
    "userFilters",
    "filteredUsers",
    "refreshUserTable",
    "bindUserFilterControls",
    "userFilterStatusOptions",
    "userFilterAccountTypeOptions",
    "team.default_subaccount_limit",
    "默认团队子账号上限",
    "确认归档账户",
    "归档账户",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(dynamicCall)));
  }

  new vm.Script(script);
});

test("admin shell resolves backend-owned requests to the dev admin API from alternate localhost ports", () => {
  for (const contract of [
    "function resolveAdminApiUrl",
    "backendOwnedPath",
    "isAlternateDevPort",
    '"http://127.0.0.1:4310"',
    "fetch(resolveAdminApiUrl(path)",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("model editor defaults new configs to an identifiable image model template", () => {
  assert.match(script, /modelEditorTemplateDefaults/);
  assert.match(script, /applyModelEditorTemplate/);
  assert.match(script, /Image model template/);
  assert.match(script, /Video model template/);
  assert.match(script, /mediaType: "image"/);
  assert.match(script, /providerProtocol: "custom_http"/);
  assert.match(script, /invocationMode: "sync"/);
  assert.match(script, /"image\.generate"/);
  assert.match(script, /"image\.edit"/);
  assert.match(script, /"image\.reference_generate"/);
  assert.match(script, /generation-submit-image/);
  assert.match(script, /referenceImages/);
  assert.match(script, /editInstruction/);
  assert.match(script, /count/);
  assert.match(script, /String\(form\.get\("mediaType"\) \|\| "image"\)/);
  assert.match(script, /String\(form\.get\("invocationMode"\) \|\| "sync"\)/);
});

test("admin video models expose the four backend management categories", () => {
  for (const categoryLabel of ["首帧视频", "首尾帧", "全能参考", "AI改视频"]) {
    assert.match(script, new RegExp(categoryLabel));
  }

  for (const taskMode of [
    "video.image_to_video",
    "video.first_last_frame_to_video",
    "video.reference_image_to_video",
    "video.video_to_video",
    "video.image_video_to_video",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(taskMode)));
  }

  assert.match(script, /VIDEO_MODEL_CATEGORIES/);
  assert.match(script, /inferVideoCategory/);
  assert.match(script, /modelMediaLabel\(model\)/);
  assert.match(script, /name="videoCategory"/);
  assert.match(script, /applyVideoCategoryToModelEditor/);
  assert.match(script, /uiConfig\.videoCategory/);
});

test("model editor lets admins choose a secret reference for providerConfig apiKeyEnv", () => {
  assert.match(script, /modelSecretReferenceOptions/);
  assert.match(script, /modelApiKeyEnv/);
  assert.match(script, /setModelEditorProviderConfigApiKeyEnv/);
  assert.match(script, /modelApiKey/);
  assert.match(script, /setModelEditorProviderConfigApiKey/);
  assert.match(script, /state\.settings\.secretReferences/);
  assert.match(script, /providerConfig\.apiKeyEnv/);
  assert.match(script, /providerConfig\.apiKey/);
  assert.match(script, /form\.elements\.providerConfig\.value = JSON\.stringify\(config, null, 2\)/);
});

test("model editor exposes base credit pricing as dedicated fields", () => {
  assert.match(script, /name="pricingBaseCredits"/);
  assert.match(script, /name="pricingUnit"/);
  assert.match(script, /syncModelEditorPricingJson/);
  assert.match(script, /pricing\.baseCredits = baseCredits/);
  assert.match(script, /pricing\.unit = String\(form\.elements\.pricingUnit\.value/);
});

test("model status drawer refreshes model detail before launch checks", () => {
  assert.match(script, /async function openModelStatusDrawer\(modelId, status\)/);
  assert.match(script, /api\(`\/api\/admin\/models\/\$\{modelId\}`\)/);
  assert.match(script, /state\.models\[modelIndex\] = model/);
  assert.match(script, /const launchCheck = modelLaunchCheckUi\(model\)/);
});

test("model parameter builder displays known image parameters in Chinese", () => {
  assert.match(script, /manualParameterVisible/);
  assert.match(script, /parameter\.visible !== false/);
  assert.match(script, /是否显示/);
  assert.match(script, /modelParameterDisplayName/);
  assert.match(script, /parameterTypeLabel/);
  assert.match(script, /manualParameterLabel\.value = modelParameterDisplayName\(parameterKey, parameter\)/);
  assert.match(script, /生成数量/);
  assert.match(script, /正向提示词/);
  assert.match(script, /质量档位/);
  assert.match(script, /画面比例/);
  assert.match(script, /反向提示词/);
  assert.match(script, /编辑指令/);
  assert.match(script, /参考图/);
  assert.match(script, /整数/);
  assert.match(script, /文本/);
  assert.match(script, /选项/);
});

test("admin user credit table uses a single edit entry for row actions", () => {
  assert.match(script, /openUserActionDrawer/);
  assert.match(script, /用户操作/);
  assert.match(script, /查看账户/);
  assert.match(script, /手动添加积分/);
  assert.match(script, /手动扣减积分/);
  assert.match(script, /调整到目标积分/);
  assert.match(script, /openCreditGrantDrawer/);
  assert.match(script, /openCreditDeductDrawer/);
  assert.match(script, /openCreditSetBalanceDrawer/);
  assert.match(script, /onclick="openUserActionDrawer\('\$\{user\.userId\}'\)"/);
  assert.doesNotMatch(script, /<button class="icon-btn" title="查看账户" onclick="openUserDetailDrawer\('\$\{user\.userId\}'\)"/);
});

test("admin user credit secondary drawers return to the action menu", () => {
  assert.match(script, /function userDrawerHead\(title, userId\)/);
  assert.match(script, /onclick="openUserActionDrawer\('\$\{userId\}'\)">返回/);
  for (const contract of [
    /openUserDetailDrawer\(userId\)[\s\S]*userDrawerHead\("账户详情", userId\)/,
    /openUserProfileDrawer\(userId\)[\s\S]*userDrawerHead\("修改资料", userId\)/,
    /openCreditGrantDrawer\(userId\)[\s\S]*userDrawerHead\("手动添加积分", userId\)/,
    /openCreditDeductDrawer\(userId\)[\s\S]*userDrawerHead\("手动扣减积分", userId\)/,
    /openCreditSetBalanceDrawer\(userId\)[\s\S]*userDrawerHead\("调整到目标积分", userId\)/,
    /openUserStatusDrawer\(userId, status\)[\s\S]*userDrawerHead\(`\$\{action\}账户`, userId\)/,
  ]) {
    assert.match(script, contract);
  }
});

test("admin user credit exposes team limit configuration only for team users", () => {
  assert.match(script, /function openTeamLimitDrawer\(userId\)/);
  assert.match(script, /function renderTeamLimitDrawer/);
  assert.match(script, /function isTeamUserAccount\(user\)/);
  assert.match(script, /frontendAccountTypeKey\(user\) === "team_user"/);
  assert.match(script, /api\(`\/api\/admin\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/team-plan-limit`\)/);
  assert.match(script, /userActionAttrs\(user, "teamLimit", "user\.write"\)/);
  assert.match(script, /restoreTeamLimitDefault/);
  assert.match(script, /window\.openTeamLimitDrawer = openTeamLimitDrawer/);
  assert.match(script, /window\.restoreTeamLimitDefault = restoreTeamLimitDefault/);
});

test("admin user credit search filters rows without rerendering the shell input", () => {
  assert.match(script, /id="user-search-input"/);
  assert.match(script, /id="user-table-body"/);
  assert.match(script, /id="user-visible-count"/);
  assert.match(script, /function refreshUserTable/);
  assert.match(script, /function bindUserFilterControls/);
  assert.match(script, /addEventListener\("input"/);
  assert.match(script, /refreshUserTable\(\)/);
  assert.doesNotMatch(script, /oninput="updateUserFilter/);
  assert.doesNotMatch(script, /function updateUserFilter\(key, value\) \{[\s\S]*?renderShell\(\);[\s\S]*?\}/);
});

test("admin user credit account taxonomy only exposes normal and team users", () => {
  assert.match(script, /"normal_user", "普通用户"/);
  assert.match(script, /"team_user", "团队用户"/);
  assert.match(script, /function frontendAccountTypeKey/);
  assert.doesNotMatch(script, /<th>前端身份<\/th>/);
  assert.doesNotMatch(script, /前端身份/);
  assert.doesNotMatch(script, /个人创作者/);
  assert.doesNotMatch(script, /团队成员账户/);
});

test("admin user credit refresh reloads the whole user credit page", () => {
  assert.match(script, /function refreshUserCreditPage/);
  assert.match(script, /await loadUsers\(\);\s*renderShell\(\);\s*showToast\("用户积分数据已刷新"\)/);
  assert.match(script, /onclick="refreshUserCreditPage\(\)"/);
  assert.doesNotMatch(script, /loadTeamPermissionAccounts/);
  assert.doesNotMatch(script, /前端团队成员摘要/);
});

test("admin user credit work order is optional but still validated when present", () => {
  assert.match(script, /关联工单号（选填）/);
  assert.match(script, /function optionalWorkOrder/);
  assert.match(script, /const workOrderNo = optionalWorkOrder\(form, error\)/);
  assert.match(script, /if \(workOrderNo\) payload\.workOrderNo = workOrderNo/);
  assert.doesNotMatch(script, /name="workOrderNo"[^>]*required/);
  assert.doesNotMatch(script, /const workOrderNo = optionalWorkOrder\(form, error\);\s*if \(!workOrderNo\) return/);
});

test("admin archive account drawer explains the business impact", () => {
  assert.match(script, /归档后该用户及成员关系会进入历史状态/);
  assert.match(script, /不会删除积分流水和审计记录/);
  assert.doesNotMatch(script, /\$\{user\?\.[^}]+userId\} 将变更为 \$\{status\}/);
});

test("admin user credit row locks disabled user actions except view and enable", () => {
  assert.match(script, /function userStatusAllowsAction/);
  assert.match(script, /action === "view"/);
  assert.match(script, /action === "enable"/);
  assert.match(script, /function userActionAttrs/);
  assert.match(script, /function guardUserAction/);
  assert.match(script, /userActionAttrs\(user, "credit", "credit\.adjust"\)/);
  assert.match(script, /userActionAttrs\(user, "profile", "user\.write"\)/);
  assert.match(script, /userActionAttrs\(user, "archive", "user\.write"\)/);
  assert.match(script, /guardUserAction\(user, "credit"\)/);
  assert.match(script, /guardUserAction\(user, "profile"\)/);
  assert.match(script, /guardUserAction\(user, "archive"\)/);
});

test("admin shell disables sensitive actions from session permissions", () => {
  for (const contract of [
    "function hasPermission",
    "function permissionAttrs",
    "data-required-permission",
    "aria-disabled",
    "model.write",
    "model.publish",
    "credit.adjust",
    "user.write",
    "risk.review",
    "risk.export",
    "ops.task.retry",
    "settings.write",
    "admin_account.write",
    "storyboard_prompt:view",
    "storyboard_prompt:create",
    "storyboard_prompt:update",
    "storyboard_prompt:enable",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell exposes page-level loading and forbidden states", () => {
  for (const contract of [
    "loadingPages",
    "forbiddenPages",
    "setPageLoading",
    "setPageForbidden",
    "renderPageState",
    "data-state=\"loading\"",
    "data-state=\"forbidden\"",
    "admin_forbidden",
    "无权限访问该页面",
    "正在加载后台数据",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin login route checks existing admin session before showing the login form", () => {
  for (const contract of [
    "bootstrapAdminLoginRoute",
    "/api/admin/auth/me",
    "history.replaceState(null, \"\", \"/admin/dashboard\")",
    "state.page = \"dashboard\"",
    "renderLogin",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin login form shows submitting state while authenticating", () => {
  const start = script.indexOf('id="login-form"');
  assert.notEqual(start, -1, "login-form exists");
  const nextFunction = script.indexOf("function ", start + 1);
  const block = script.slice(start, nextFunction === -1 ? undefined : nextFunction);
  for (const contract of [
    "setSubmitting",
    "正在登录",
    "finally",
  ]) {
    assert.match(block, new RegExp(escapeRegExp(contract)));
  }
});

test("admin login form exposes remember-password option and local persistence hooks", () => {
  for (const contract of [
    "remember-password",
    "记住账号密码",
    "admin-login-remembered-credentials",
    "saveRememberedLogin",
    "readRememberedLogin",
    "clearRememberedLogin",
    "form.get(\"remember\")",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell provides submitting and success feedback for write actions", () => {
  for (const contract of [
    "runAdminMutation",
    "setSubmitting",
    "showToast",
    "toast-message",
    "data-submitting",
    "正在提交",
    "操作成功",
    "button.disabled = true",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell routes every sensitive write drawer through the mutation feedback helper", () => {
  for (const formId of [
    "user-profile-form",
    "user-status-form",
    "credit-deduct-form",
    "runtime-config-form",
    "legal-document-form",
    "config-rollback-form",
    "secret-reference-form",
    "secret-probe-form",
    "admin-account-form",
    "admin-account-edit-form",
    "admin-account-password-reset-form",
    "model-duplicate-form",
    "model-status-form",
    "model-rollback-form",
    "password-change-form",
  ]) {
    const start = script.indexOf(`id="${formId}"`);
    assert.notEqual(start, -1, `${formId} exists`);
    const nextFunction = script.indexOf("function ", start + 1);
    const block = script.slice(start, nextFunction === -1 ? undefined : nextFunction);
    assert.match(block, /runAdminMutation/, `${formId} uses runAdminMutation`);
  }
});

test("admin shell exposes editable legal agreement management in system settings", () => {
  for (const contract of [
    "legalDocumentConfigs",
    "legalDocumentEditor",
    "用户服务协议",
    "隐私政策",
    "agreement-rich-text",
    "openLegalDocumentDrawer",
    "legal-document-form",
    "contenteditable",
    "execCommand",
    "serviceAgreement",
    "privacyPolicy",
    "service_agreement",
    "privacy_policy",
    "富文本",
    "预览",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell exposes a standalone agreement management menu and list workflow", () => {
  for (const contract of [
    'data-page="agreements"',
    "/admin/agreements",
    "loadLegalDocuments",
    "agreementsPage",
    "legalDocumentsTable",
    "legal-document-status",
    "legal-document-type",
    "toggleLegalDocumentStatus",
    "deleteLegalDocument",
    "/api/admin/legal-documents",
    "新增协议",
    "启用",
    "停用",
    "删除",
    "协议类型",
    "协议状态",
    "预览",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin agreement editor exposes a richer toolbar and preserves selection for formatting", () => {
  for (const contract of [
    'data-legal-command="underline"',
    'data-legal-command="strikeThrough"',
    'data-legal-command="insertOrderedList"',
    'data-legal-command="justifyCenter"',
    'data-legal-command="unlink"',
    'data-legal-block="h1"',
    'data-legal-block="h3"',
    'data-legal-block="p"',
    "legal-document-toolbar-group",
    "legal-document-toolbar-separator",
    "data-legal-active-command",
    "data-legal-active-block",
    "savedSelection",
    "restoreSelection",
    "focusEditor",
    "syncToolbarState",
    "runEditorCommand",
    "document.queryCommandState",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin agreement editor sanitizes legacy rich text wrappers and normalizes display blocks", () => {
  for (const contract of [
    'const blockTags = new Set(["P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "H1", "H2", "H3", "BLOCKQUOTE"])',
    'const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "H1", "H2", "H3", "BLOCKQUOTE", "UL", "OL", "LI", "A"])',
    'element.tagName === "SPAN" || element.tagName === "FONT"',
    'element = replaceTag(element, "p")',
    "initialContentHtml = sanitizeRichTextHtml",
    ".legal-document-surface h1",
    ".legal-document-surface blockquote",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell routes all drawer form writes through the mutation feedback helper", () => {
  const formRegex = /id="([^"]+-form)"[\s\S]*?addEventListener\("submit", async \(event\) => \{([\s\S]*?)(?=\n\s{8}\}\);\n\s{6}\})/g;
  const skippedReadForms = new Set(["login-form"]);
  const uncovered = [];
  for (const match of script.matchAll(formRegex)) {
    const [, formId, block] = match;
    if (skippedReadForms.has(formId)) continue;
    if (!/method:\s*"(POST|PATCH|DELETE)"/.test(block)) continue;
    if (!block.includes("runAdminMutation")) uncovered.push(formId);
  }
  assert.deepEqual(uncovered, []);
});

test("admin shell constrains dense tables and drawers for 1366px review", () => {
  for (const contract of [
    ".table-wrap",
    "overflow: auto",
    "table-layout: fixed",
    "table-wrap models dense",
    "table-wrap users dense",
    "table-wrap settings compact",
    "workbench-aside",
    "td.actions, th.actions",
    "position: sticky",
    "right: 0",
    ".drawer-panel",
    "max-height: 100vh",
    "overflow-y: auto",
    "overscroll-behavior: contain",
    ".actions-row",
    "flex-wrap: nowrap",
  ]) {
    assert.match(html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell keeps the topbar and account actions readable on narrow screens", () => {
  for (const contract of [
    "@media (max-width: 920px)",
    ".topbar",
    "flex-direction: column",
    "align-items: flex-start",
    ".account-menu",
    "flex-wrap: wrap",
    ".toolbar",
    ".actions-row",
    "justify-content: flex-end",
  ]) {
    assert.match(html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin dashboard recent events use structured drilldown instead of raw JSON", () => {
  for (const contract of [
    "openDashboardEventDrawer",
    "仪表盘事件详情",
    "关联页面",
    "跳转处理",
    "dashboardEventDestination",
    "targetType",
    "targetId",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.doesNotMatch(
    script,
    /openDrawer\('事件详情','\$\{escapeAttribute\(compactJson\(event\)\)\}'\)/,
  );
});

test("admin dashboard model health uses structured drilldown", () => {
  for (const contract of [
    "openDashboardModelHealthDrawer",
    "模型健康详情",
    "队列名称",
    "积压任务",
    "失败任务",
    "进入模型配置",
    "进入风控审计",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.doesNotMatch(
    script,
    /title="查看" onclick="navigate\('models'\)"/,
  );
});

test("admin dashboard exposes trend feedback and partial refresh copy", () => {
  for (const contract of [
    "dashboardRefreshNote",
    "dashboardTrendHtml",
    "trend-bars",
    "总览趋势",
    "刷新总览",
    "总览已刷新",
    "模型健康已刷新",
    "最近事件已刷新",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});


test("admin prompt manager separates script prompts and image prompt styles", () => {
  for (const contract of [
    "promptManagementMode",
    "script",
    "image",
    "剧本提示词",
    "生图题词",
    "人物提示词",
    "场景提示词",
    "分镜提示词",
    "promptManagementTabs",
    "scriptPromptPackages",
    "imagePromptStyles",
    "imagePromptStyleFallback",
    "loadPromptManagement",
    "loadScriptPrompts",
    "loadImagePromptStyles",
    "/api/admin/storyboard-prompt/packages",
    "openScriptPromptPackageDrawer",
    "copyScriptPromptPackage",
    "toggleScriptPromptPackageStatus",
    "script-prompt-package-form",
    "admin-ui-script-prompt-package",
    "admin-ui-script-prompt-copy",
    "admin-ui-script-prompt-status",
    "新增剧本提示词",
    "保存剧本提示词",
    "/api/admin/image-prompt/styles",
    "openImagePromptStyleDrawer",
    "copyImagePromptStyle",
    "toggleImagePromptStyleStatus",
    "cover_image_url",
    "coverImageUrl",
    "prompt-cover-thumb",
    "prompt-cover-empty",
    "prompt-cover-col",
    "readPromptCoverFile",
    "type=\"file\"",
    "accept=\"image/*\"",
    "/admin/assets/prompt-covers/${code}.webp",
    "封面",
    "portrait_photography",
    "anime_2d",
    "cinematic_portrait",
    "chinese_style",
    "animation",
    "three_d_render",
    "cyberpunk",
    "cg_animation",
    "ink_wash",
    "oil_painting",
    "classic_art",
    "watercolor",
    "cartoon",
    "flat_illustration",
    "landscape",
    "hong_kong_anime",
    "pixel_art",
    "fluorescent_painting",
    "colored_pencil",
    "figurine",
    "children_drawing",
    "abstract_art",
    "sharp_pen_illustration",
    "ink_print",
    "printmaking",
    "monet_impressionism",
    "picasso_cubism",
    "rembrandt_lighting",
    "matisse_fauvism",
    "baroque",
    "retro_anime",
    "picture_book",
    "电影写真",
    "中国风",
    "赛博朋克",
    "水墨画",
    "绘本插画风格",
    "豆包生图",
    "避免文字、水印、logo",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin prompt manager adds the shot prompt workflow tab", () => {
  for (const contract of [
    "shotPromptStage",
    "shotPromptKeyword",
    "shotPromptTemplates",
    "loadShotPromptTemplates",
    "admin-shot-prompt-templates",
    "shotPromptStages",
    "outline",
    "shotPromptTemplatesPage",
    "shotPromptPreview",
    "openShotPromptTemplateDrawer",
    "copyShotPromptTemplate",
    "toggleShotPromptTemplateStatus",
    "shot-prompt-template-form",
    "admin-ui-shot-prompt-template",
    "admin-ui-shot-prompt-copy",
    "admin-ui-shot-prompt-status",
    "{{script_scene}}",
    "shot_outline_from_scene",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
  for (const deprecated of ["shot_panel_breakdown", "shot_camera_language", "shot_image_prompt", "stage: \"camera\"", "stage: \"image\""]) assert.doesNotMatch(script, new RegExp(escapeRegExp(deprecated)));
});

test("admin prompt manager supports editing prop prompts and choosing defaults", () => {
  for (const contract of [
    "openPropPromptTemplateDrawer",
    "copyPropPromptTemplate",
    "togglePropPromptTemplateStatus",
    "setPropPromptTemplateDefault",
    "prop-prompt-template-form",
    "admin-ui-prop-prompt-template",
    "admin-ui-prop-prompt-copy",
    "admin-ui-prop-prompt-status",
    "admin-ui-prop-prompt-default",
    "/api/admin/prop-prompt/templates",
    "setCharacterPromptTemplateDefault",
    "setScenePromptTemplateDefault",
    "setShotPromptTemplateDefault",
    "setScriptPromptPackageDefault",
    "setImagePromptStyleDefault",
    "设为默认",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
});

test("admin image prompt default editor keeps the current default locked", () => {
  for (const contract of [
    "const isLockedDefault = Boolean(existing?.is_default || existing?.isDefault)",
    "name=\"is_default\" type=\"checkbox\" ${isLockedDefault ? \"checked disabled\" : \"\"}",
    "is_default: isLockedDefault || form.get(\"is_default\") === \"on\"",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
});

test("admin image prompt list accepts both flat and nested data payloads", () => {
  for (const contract of [
    "Array.isArray(result.data)",
    "Array.isArray(result.data?.data)",
    "result.data.data",
    "is_default: true",
    "isDefault: true",
    "showToast(error.payload?.error?.message || \"默认提示词更新失败\")",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
});

test("admin prompt manager lands the character prompt workflow menu", () => {
  for (const contract of [
    "characterPromptStage",
    "characterPromptKeyword",
    "characterPromptTemplates",
    "loadCharacterPromptTemplates",
    "/api/admin/character-prompt/templates",
    "characterPromptStages",
    "extract",
    "characterPromptTemplatesPage",
    "characterPromptPreview",
    "composeCharacterPromptFromPreview",
    "/api/admin/character-prompt/compose",
    "openCharacterPromptTemplateDrawer",
    "copyCharacterPromptTemplate",
    "toggleCharacterPromptTemplateStatus",
    "character-prompt-template-form",
    "admin-ui-character-prompt-template",
    "admin-ui-character-prompt-copy",
    "admin-ui-character-prompt-status",
    "{{chunk_id}}",
    "{{novel_chunk}}",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
  for (const deprecated of ["novel_character_merge", "character_grid_sheet", "{{all_chunk_character_json}}", "{{character_profile_json}}", "cinematic realistic character design sheet", "stage: \"merge\"", "stage: \"grid\""]) assert.doesNotMatch(script, new RegExp(escapeRegExp(deprecated)));
});

test("admin prompt manager lands the long novel scene prompt workflow menu", () => {
  for (const contract of [
    "scenePromptStage",
    "scenePromptKeyword",
    "scenePromptTemplates",
    "loadScenePromptTemplates",
    "/api/admin/scene-prompt/templates",
    "scenePromptStages",
    "split",
    "location_id",
    "visual_motifs",
    "continuity_notes",
    "{{novel_chapter}}",
    "scene_split_long_novel",
    "openScenePromptTemplateDrawer",
    "copyScenePromptTemplate",
    "toggleScenePromptTemplateStatus",
    "scene-prompt-template-form",
    "admin-ui-scene-prompt-template",
    "admin-ui-scene-prompt-copy",
    "admin-ui-scene-prompt-status",
  ]) assert.match(script, new RegExp(escapeRegExp(contract)));
  for (const deprecated of ["scene_extract_elements", "scene_merge_library", "scene_detail_breakdown", "scene_image_concept_art", "{{scene_json}}", "{{scene_library_json}}", "{{scene_detail_json}}"]) assert.doesNotMatch(script, new RegExp(escapeRegExp(deprecated)));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
