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
    "提示词管理",
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
    "/api/admin/model-templates",
    "/api/admin/models/validate-draft",
    "/api/admin/users",
    "/api/admin/settings",
    "/api/admin/admin-accounts",
    "/api/admin/risks",
    "/api/admin/exports/risks.csv",
    "/api/admin/audit-events",
    "/api/admin/exports/audit-events.csv",
    "/api/admin/team-permission-accounts",
    "/api/admin/storyboard-prompt/packages",
    "/api/admin/storyboard-prompt/templates",
    "/api/admin/storyboard-prompt/compose",
    "/api/admin/storyboard-prompt/test-generate",
    "/api/admin/storyboard-prompt/export",
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
    "teamPermissionAccounts",
    "loadTeamPermissionAccounts",
    "当前管理员资料",
    "openAdminProfileDrawer",
    "团队权限账户摘要",
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
    "工单号",
    "requireWorkOrder",
    "metadata?.workOrderNo",
    "确认归档账户",
    "归档账户",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(dynamicCall)));
  }

  new vm.Script(script);
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
    "storyboard_prompt:test",
    "storyboard_prompt:export",
    "storyboard_prompt:template",
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

test("admin storyboard prompt manager ships the preset content library", () => {
  for (const contract of [
    "玄幻修仙",
    "末日求生",
    "重生逆袭",
    "系统流",
    "霸总甜宠",
    "娱乐圈",
    "快穿",
    "团宠",
    "先婚后爱",
    "悬疑探案",
    "科幻未来",
    "王者归来",
    "男频热血",
    "女频情感",
    "高燃爽感",
    "短剧快节奏",
    "电影感分镜",
    "AI视频友好",
    "标准分镜表",
    "结构化 JSON",
    "通用质量禁忌",
    "角色一致性禁忌",
    "玄幻热血短剧",
    "都市情感拉扯",
    "末日生存 AI 视频",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin storyboard prompt manager falls back when API returns an empty list", () => {
  for (const contract of [
    "loadedPackages.length ? loadedPackages : storyboardPromptFallback.packages",
    "loadedTemplates.length ? loadedTemplates : storyboardPromptFallback.templates",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin prompt manager separates script prompts and image prompt styles", () => {
  for (const contract of [
    "promptManagementMode",
    "script",
    "image",
    "剧本提示词",
    "生图题词",
    "imagePromptStyles",
    "imagePromptStyleFallback",
    "loadImagePromptStyles",
    "/api/admin/image-prompt/styles",
    "openImagePromptStyleDrawer",
    "copyImagePromptStyle",
    "toggleImagePromptStyleStatus",
    "portrait_photography",
    "anime_2d",
    "豆包生图",
    "避免文字、水印、logo",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin model editor uses an operator-friendly wizard instead of raw engineering fields", () => {
  for (const contract of [
    "model-wizard-drawer",
    "model-wizard-steps",
    "选择模型能力",
    "选择供应商模板",
    "业务信息",
    "价格和参数",
    "测试并保存",
    "capability-card",
    "template-card",
    "model-task-mode-option",
    "高级配置",
    "技术管理员使用",
    "buildModelPayloadFromWizard",
    "applyModelTemplateToForm",
    "validateModelWizardForm",
    "validateModelDraftWithBackend",
    "loadModelTemplates",
    "/api/admin/model-templates",
    "/api/admin/models/validate-draft",
    "secretReferenceOptions",
    "secretMatchesModel",
    "secretProviderChannelOptions",
    "secretModelOptions",
    "secretModelCount",
    "setSecretModelPanel",
    "setSecretProviderChannel",
    "secret-model-tab",
    "secret-channel-tab",
    "真实 Key 添加位置",
    "不在后台保存明文 Key",
    "secret-env-example",
    "updateSecretEnvExample",
    "VOLCENGINE_ARK_API_KEY=你的真实密钥",
    "imageModelCode",
    "videoModelCode",
    "全部图片模型",
    "全部视频模型",
    "图片模型下拉选",
    "视频模型下拉选",
    "providerChannel",
    "mediaTypes",
    "modelCodes",
    "baseUrl",
    "authHeaderName",
    "authScheme",
    "extraHeaders",
    "applySecretReferenceToProviderConfig",
    "中转站 URL",
    "鉴权 Header",
    "鉴权方式",
    "额外请求头 JSON",
    "走供应商官方接口",
    "需要配置中转站 URL",
    "中转站密钥必须填写中转站 URL",
    "官方密钥",
    "中转站密钥",
    "图片模型",
    "视频模型",
    "volcengine-seedream-image",
    "volcengine-seedance-video",
    "openai-images",
    "model-template-search",
    "model-template-media-filter",
    "model-template-scroll",
    "refreshModelTemplateGrid",
    "promptMaxLength",
    "promptLengthUnit",
    "syncPromptLimitFromForm",
    "limitsFromForm",
    "提示词上限",
    "google-nano-banana-image",
    "google-nano-banana-2-image",
    "google-nano-banana-fast-image",
    "jimeng-5-image",
    "jimeng-45-image",
    "jimeng-40-image",
    "openai-image2",
    "kling-30-video",
    "kling-26-video",
    "kling-25-video",
    "grok-video",
    "seedance-20-video",
    "seedance-20-pro-video",
    "seedance-fast-video",
    "happy-horse-video",
    "google-imagen-4-image",
    "qwen-image-image",
    "flux-kontext-image",
    "google-veo-31-video",
    "openai-sora-2-video",
    "runway-gen4-video",
    "luma-ray3-video",
    "pixverse-5-video",
    "pika-25-video",
    "hailuo-02-video",
    "wan-22-video",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }

  assert.doesNotMatch(script, /name="taskModes"/);
  assert.doesNotMatch(script, /<label class="field"><span>任务模式<\/span><input/);
  assert.match(script, /getAll\("taskMode"\)/);
  assert.match(script, /<details class="advanced-config"/);
  assert.match(script + html, /max-height:\s*min\(420px,\s*52vh\)/);
  assert.match(script + html, /\.drawer-panel\.model-wizard-drawer\s*\{/);
  assert.match(script + html, /width:\s*min\(980px,\s*calc\(100vw - 96px\)\)/);
  assert.match(script + html, /\.model-wizard-drawer #model-template-grid/);
  assert.match(script + html, /delete pricing\.qualityMultipliers/);
  assert.match(script + html, /delete pricing\.resolutionMultipliers/);
  assert.match(script + html, /delete pricing\.durationMultipliers/);
  assert.doesNotMatch(script + html, /质量倍率|分辨率倍率|时长倍率|清晰度倍率/);
  assert.doesNotMatch(script + html, /name="qualityMultipliers"|name="resolutionMultipliers"|name="durationMultipliers"/);
  assert.doesNotMatch(script + html, /data-media-price="image"|data-media-price="video"|refreshMediaPricingFields/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
