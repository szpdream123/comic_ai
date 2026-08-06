import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const script = (html.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "").replace(/\r\n/g, "\n");

test("admin queue operations expose dead-letter replay", () => {
  assert.match(script, /queue\.role === "dead_letter"/);
  assert.match(script, /<option value="replay">重放到原队列<\/option>/);
  assert.match(script, /死信任务已重放/);
  assert.match(script, /死信处理工作台/);
  assert.match(script, /死信与队列/);
  assert.match(script, /openDeadLetterWorkbench/);
  assert.match(script, /failedSampleSize=100/);
  assert.match(script, /canReplayDeadLetterJob/);
  assert.match(script, /先处置业务任务/);
  assert.match(script, /隔离仓库，无需消费者/);
});

test("admin shell keeps the final Chinese page contract and standalone branding", () => {
  assert.match(html, /<title>后台管理<\/title>/);
  assert.match(html, /id="admin-app"/);
  assert.doesNotMatch(html, /id="creator-app"/);

  for (const label of [
    "后台管理",
    "运营总览",
    "模型配置",
    "用户管理",
    "风控审计",
    "资源管理",
    "系统设置",
    "短信记录",
    "管理员账户",
    "修改密码",
    "退出登录",
    "账号已临时锁定",
  ]) {
    assert.match(html, new RegExp(label));
  }

  assert.match(html, /Created By Deerflow/);
  assert.match(html, /https:\/\/deerflow\.tech/);
  assert.doesNotMatch(html, /模型参数详情|参数详情|model-workbench/);
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
    "/api/admin/video-batch/resolve",
    "/api/admin/models",
    "/api/admin/users",
    "/api/admin/settings",
    "/api/admin/admin-accounts",
    "/api/admin/risks",
    "/api/admin/exports/risks.csv",
    "/api/admin/audit-events",
    "/api/admin/exports/audit-events.csv",
    "/api/admin/ops/items",
    "/api/admin/ops/canvas-agent-metrics",
    "/api/admin/ops/generation-queues",
    "/api/admin/ops/tasks/retry-finalize",
    "/api/admin/ops/tasks/retry-persist-asset",
    "/api/admin/ops/tasks/manual-settle",
    "/api/admin/ops/tasks/retry",
    "/api/admin/ops/tasks/recover",
    "resume_provider_poll",
    "episode_generate_image",
    "恢复轮询",
    "rebuild_finalize",
    "补投递到生成队列",
    "重新拉取供应商状态",
    "从供应商成功结果重建终态",
    "重新提交供应商",
    "外部请求已开始且未明确失败，禁止重复生成和重复扣费",
    "任务/工作流 → 执行中；新增轮询 Outbox；不会再次提交生成",
    "/api/admin/sms-records",
    "/api/admin/resources",
    "/api/admin/resources/summary",
    "/api/admin/storyboard-prompt/packages",
    "/api/admin/image-prompt/styles",
    "/api/admin/secret-references",
    "/probe",
    "/reveal",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(apiPath)));
  }

  assert.match(script, /视频解析/);
  assert.match(script, new RegExp(escapeRegExp("/admin/video-batch")));
  assert.match(script, /resolveAdminVideoBatch/);

  assert.match(script, /idempotency-key": `admin-ui-password-change-\$\{Date\.now\(\)\}`/);
  assert.match(script, /idempotency-key": `admin-ui-revoke-sessions-\$\{Date\.now\(\)\}`/);
  assert.match(script, /idempotency-key": `admin-ui-profile-\$\{Date\.now\(\)\}`/);

  for (const dynamicCall of [
    "credits/${direction}",
    "openCreditAdjustDrawer",
    "openCreditSetBalanceDrawer",
    "增加积分",
    "扣减积分",
    "调整到目标积分",
    "目标可用积分",
    "调整差额",
    "admin-ui-credit-adjust",
    "积分已调整",
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
    "isValidProviderEndpoint",
    "requestPath",
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
    "loadDashboardModelHealth",
    "loadDashboardRecentEvents",
    "admin_account_locked",
    "repair-credit",
    "retry",
    "openAuditEventDrawer",
    "riskStatusFilter",
    'url.searchParams.set("riskStatus"',
    "risk.export",
    "smsRecords",
    "resources",
    "resourceMediaFilter",
    "resourceRangeFilter",
    "loadResources",
    "resourcesPage",
    "resourceTable",
    "resourceTableRow",
    "resourcePreviewOpen",
    "resourcePreviewModal",
    "resourcePage",
    "resourcePageSize",
    "resourceTotal",
    "resourceStats",
    "setResourcePage",
    "previewResource",
    "deleteResource",
    "copyResourceUrl",
    "openResourceUrl",
    "用户",
    "手机",
    "资源总数",
    "图片占用",
    "视频占用",
    "resources/summary",
    "上一页",
    "下一页",
    "smsRecordRange",
    "loadSmsRecords",
    "updateSmsRecordRange",
    "登录时间",
    "短信记录",
    "验证码",
    "短信内容",
    "成功",
    "失败",
    "smsRecordRangeOptions",
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
    "userFilterMembershipTierOptions",
    "team.default_subaccount_limit",
    "默认团队子账号上限",
    "确认归档账户",
    "归档账户",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(dynamicCall)));
  }

  for (const contract of [
    "listResult.data",
    "listResult.meta?.total",
    "const statsPayload = statsResult?.data && typeof statsResult.data === \"object\"",
    "statsPayload?.imageBytes",
    'const params = new URLSearchParams({\n            page: String(Math.max(1, Number(state.resourcePage) || 1)),\n            pageSize: String(Number(state.resourcePageSize) || 10),',
    "params.set(\"keyword\"",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  new vm.Script(script);
});

test("admin shell lazy-loads page data instead of blocking startup on every admin API", () => {
  assert.match(script, /ADMIN_PAGE_LOADERS/);
  assert.match(script, /ensureAdminPageData/);
  assert.match(script, /preloadAdminShellData/);
  assert.match(script, /state\.loadingPromises/);
  assert.match(script, /state\.loadedPages/);
  assert.match(script, /ensureAdminPageData\(state\.page\)/);
  assert.match(script, /ensureAdminPageData\(page\)/);
  assert.doesNotMatch(script, /await Promise\.all\(\[loadDashboard\(\), loadModels\(\), loadUsers\(\), loadPromptManagement\(\), loadSettings\(\), loadLegalDocuments\(\), loadRiskAudit\(\), loadAdminSessions\(\)\]\)/);
});

test("admin shell reloads page data when sidebar navigation changes routes", () => {
  assert.match(
    script,
    /navigate = function navigate\(page\) \{[\s\S]*?parameterTemplates: "\/admin\/parameter-templates",[\s\S]*?history\.pushState\(null, "", pathMap\[page\] \|\| "\/admin\/dashboard"\);[\s\S]*?renderShell\(\);[\s\S]*?ensureAdminPageData\(page\)\.catch\(\(\) => undefined\);[\s\S]*?\n      \};/,
  );
});

test("admin shell exposes official asset library as an independent management module", () => {
  for (const contract of [
    "官方资产库",
    "officialAssets",
    "loadOfficialAssets",
    "officialAssetsPage",
    "openOfficialAssetDrawer",
    "official-asset-table",
    "official-asset-preview-thumb",
    "uploadOfficialAssetImage",
    "/api/admin/official-assets/uploads",
    "上传主图",
    "上传详情图",
    "主图预览",
    "renderOfficialAssetMainPreview",
    "official-asset-main-preview-card",
    "详情图预览",
    "renderOfficialAssetDetailPreview",
    "official-asset-detail-preview-card",
    "removeOfficialAssetDetailItem",
    "official-asset-detail-remove",
    "official-asset-detail-label",
    "contenteditable=\"true\"",
    "updateOfficialAssetDetailItemLabel",
    "aria-label=\"删除图片\"",
    "提示词",
    "officialAssetDetailViewRows",
    "/api/admin/official-assets",
    "/admin/official-assets",
    "新增官方资产",
    "详情图组",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.match(script, /ADMIN_PAGE_LOADERS\.officialAssets\s*=\s*loadOfficialAssets/);
  assert.match(html, /\.official-asset-preview-thumb,[\s\S]*?\.official-asset-preview-empty[\s\S]*?width:\s*56px;[\s\S]*?height:\s*56px;/);
  assert.match(html, /\.official-asset-main-preview-card,[\s\S]*?\.official-asset-detail-preview-card[\s\S]*?width:\s*132px;/);
  assert.match(html, /\.official-asset-main-preview-card img,[\s\S]*?\.official-asset-detail-preview-card img[\s\S]*?height:\s*132px;[\s\S]*?object-fit:\s*contain;/);
  assert.match(script, /nav\.insertBefore\(button,\s*settingsButton\)/);
  assert.match(script, /renderOfficialAssetMainPreview\(officialAssetForm\);\s*renderOfficialAssetDetailPreview\(officialAssetForm\);/);
  assert.match(script, /renderOfficialAssetMainPreview\(form\);\s*renderOfficialAssetDetailPreview\(form\);/);
  assert.doesNotMatch(script, /<span>主图 URL<\/span>/);
  assert.doesNotMatch(script, /<span>存储对象键<\/span>/);
  assert.doesNotMatch(script, /<span>MIME 类型<\/span>/);
  assert.doesNotMatch(script, /<span>宽度<\/span>/);
  assert.doesNotMatch(script, /<span>高度<\/span>/);
  assert.doesNotMatch(script, /<span>列表说明<\/span>/);
  assert.doesNotMatch(script, /<span>详情页元信息 JSON<\/span>/);
  assert.doesNotMatch(script, /<span>详情图组<\/span>/);
  assert.doesNotMatch(script, /name="detailAngle"/);
  assert.doesNotMatch(script, /<th>版本<\/th>/);
  assert.doesNotMatch(script, /showToast\("主图已上传"\)/);
  assert.doesNotMatch(script, /showToast\("详情图已上传"\)/);
  assert.doesNotMatch(script, /showToast\("详情图已删除"\)/);
  assert.doesNotMatch(script, /详情图历史/);
  assert.doesNotMatch(script, /restoreOfficialAssetDetailHistory/);
  assert.doesNotMatch(script, /snapshotOfficialAssetDetailHistory/);
  assert.doesNotMatch(script, /data-official-detail-history-index/);
});

test("admin image file inputs upload distinct cloud asset types instead of persisting data URLs", () => {
  assert.match(script, /uploadAdminImage\(file, "\/api\/admin\/official-assets\/uploads"\)/);
  assert.match(script, /uploadAdminImage\(file, "\/api\/admin\/prompt-covers\/uploads"\)/);
  assert.match(script, /uploadAdminImage\(file, "\/api\/admin\/settings\/assets\/uploads"\)/);
  assert.doesNotMatch(script, /readAsDataURL/);
});

test("admin shell exposes announcements as a standalone lightweight module", () => {
  for (const contract of [
    "公告管理",
    "announcements",
    "loadAnnouncements",
    "announcementsPage",
    "openAnnouncementDrawer",
    "deleteAnnouncement",
    "/api/admin/announcements",
    "/admin/announcements",
    "announcement-form",
    "公告标题",
    "公告正文",
    "按钮文案",
    "按钮链接",
    "开始时间",
    "结束时间",
    "排序权重",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.match(script, /ADMIN_PAGE_LOADERS\.announcements\s*=\s*loadAnnouncements/);
  assert.match(script, /nav\.insertBefore\(button,\s*settingsButton\)/);
  assert.doesNotMatch(script, /announcement.*read/i);
  assert.doesNotMatch(script, /<span>公告摘要<\/span>/);
  assert.doesNotMatch(script, /announcement\?\.summary/);
  assert.doesNotMatch(script, /item\.summary/);
  assert.doesNotMatch(script, /form\.get\("summary"\)/);
  assert.match(script, /body:\s*String\(form\.get\("body"\) \|\| ""\),/);
  assert.doesNotMatch(script, /body:\s*String\(form\.get\("body"\) \|\| ""\)\.trim\(\)/);
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
  assert.match(script, /globalaiopc_video/);
  assert.match(script, /global_ai_opc_image/);
  assert.match(script, /GLOBAL_AI_OPC_API_KEY/);
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
  for (const categoryLabel of ["首帧视频", "首尾帧", "参考生视频", "AI改视频"]) {
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
  assert.match(script, /state\.settings\.secretReferences/);
  assert.match(script, /data-provider-name/);
  assert.match(script, /providerConfig\.apiKeyEnv/);
  assert.match(script, /delete config\.apiKey/);
  assert.doesNotMatch(script, /未在系统设置中找到/);
  assert.doesNotMatch(script, /name="modelApiKey"/);
  assert.doesNotMatch(script, /setModelEditorProviderConfigApiKey\(/);
  assert.match(script, /form\.elements\.providerConfig\.value = JSON\.stringify\(config, null, 2\)/);
});

test("model lists show api key names only when a secret reference exists", () => {
  assert.match(script, /<th>API秘钥<\/th>/);
  assert.match(script, /function modelApiKeyName\(model\)/);
  assert.match(script, /secret\?\.(?:secretRef|envName)/);
  assert.match(script, /apiKeyName \? escapeHtml\(apiKeyName\) : ""/);
  assert.doesNotMatch(script, /apiKeyName \? escapeHtml\(apiKeyName\) : "-"/);
});

test("model configuration filters rows by api key display name", () => {
  for (const contract of [
    "modelApiKeyFilter",
    "modelApiKeyFilterOptions",
    "updateModelApiKeyFilter",
    "modelMatchesApiKeyFilter",
    "全部秘钥",
    "未配置秘钥",
    'aria-label="按 API 秘钥筛选"',
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.match(script, /sortedModelRows\(\)\.filter\(modelMatchesApiKeyFilter\)/);
  const filterStart = script.indexOf("function modelApiKeyFilterOptions");
  const filterBlock = script.slice(filterStart, script.indexOf("function modelsByMediaTab", filterStart));
  assert.doesNotMatch(filterBlock, /secretValue/);

  const behaviorStart = script.indexOf("function modelSortValue");
  const behaviorEnd = script.indexOf("function updateModelMediaTab", behaviorStart);
  const context = {
    state: {
      modelApiKeyFilter: "sai_er_api",
      models: [
        { id: "volcengine", mediaType: "video", sortOrder: 1, apiKeyName: "火山引擎官方模型" },
        { id: "saier", mediaType: "video", sortOrder: 2, apiKeyName: "sai_er_api" },
        { id: "unconfigured", mediaType: "image", sortOrder: 3, apiKeyName: "" },
      ],
    },
    modelApiKeyName: (model) => model.apiKeyName,
    escapeAttribute: (value) => String(value),
    escapeHtml: (value) => String(value),
    result: null,
  };
  vm.runInNewContext(`${script.slice(behaviorStart, behaviorEnd)}
    result = {
      selectedRows: modelsByMediaTab("video").map((model) => model.id),
      options: modelApiKeyFilterOptions(),
    };
    state.modelApiKeyFilter = "__unconfigured__";
    result.unconfiguredRows = modelsByMediaTab("image").map((model) => model.id);
  `, context);

  assert.deepEqual([...context.result.selectedRows], ["saier"]);
  assert.deepEqual([...context.result.unconfiguredRows], ["unconfigured"]);
  assert.match(context.result.options, /sai_er_api[^<]*selected/);
  assert.match(context.result.options, /未配置秘钥/);
});

test("secret reference purpose is optional and hidden from the settings list row", () => {
  assert.match(script, /name="purpose" rows="4" placeholder=/);
  assert.doesNotMatch(script, /name="purpose" rows="4" required/);
  assert.doesNotMatch(script, /secretReferenceRow\(secret\)[\s\S]*secret\.purpose/);
  assert.match(script, /name="requestDomain"/);
  assert.match(script, /secret\.requestDomain \|\| secret\.baseUrl/);
  assert.match(script, /\\u8bf7\\u6c42\\u57df\\u540d/);
});

test("secret references render masked values and reveal them only through the eye action", () => {
  const rowStart = script.indexOf("function secretReferenceRow(secret)");
  const rowBlock = script.slice(rowStart, script.indexOf("function adminAccountRow", rowStart));
  const revealStart = script.indexOf("async function toggleSecretValue(secretId)");
  const revealBlock = script.slice(revealStart, script.indexOf("function openSecretReferenceDrawer", revealStart));

  assert.match(rowBlock, /secret\.maskedSecretValue/);
  assert.match(rowBlock, /state\.revealedSecretValues/);
  assert.match(rowBlock, /secret-visibility-btn/);
  assert.match(rowBlock, /toggleSecretValue/);
  assert.doesNotMatch(rowBlock, /secret\.secretValue \|\|/);
  assert.match(revealBlock, /\/reveal/);
  assert.match(revealBlock, /method: "POST"/);
  assert.match(revealBlock, /delete nextValues\[secretId\]/);
  assert.match(html, /\.secret-visibility-btn svg/);
});

test("model editor exposes requestPath as the primary provider request path", () => {
  assert.match(script, /name="requestPath"/);
  assert.match(script, /modelEditorRequestPathFromProviderConfig/);
  assert.match(script, /setModelEditorProviderConfigRequestPath/);
  assert.match(script, /providerConfig\.requestPath/);
  assert.match(script, /form\.get\("requestPath"\)/);
});

test("model editor exposes base credit pricing and billing mode as dedicated fields", () => {
  assert.match(script, /name="pricingBaseCredits"/);
  assert.match(script, /name="pricingBillingMode"/);
  assert.match(script, /name="billingMode"/);
  assert.doesNotMatch(script, /name="pricingResolutionCredits"/);
  assert.doesNotMatch(script, /name="resolutionCredits"/);
  assert.doesNotMatch(script, /分辨率价格表 JSON|\\u5206\\u8fa8\\u7387\\u4ef7\\u683c\\u8868 JSON/);
  assert.match(script, /parameterCreditInputsMarkup/);
  assert.match(script, /name="resolutionCredit:\$\{escapeAttribute\(resolution\)\}"/);
  assert.match(script, /baseCreditsFromForm/);
  assert.match(script, /resolutionCreditsFromForm/);
  assert.match(script, /固定计费|\\u56fa\\u5b9a\\u8ba1\\u8d39/);
  assert.match(script, /时长计费|\\u65f6\\u957f\\u8ba1\\u8d39/);
  assert.match(script, /name="pricingUnit"/);
  assert.match(script, /syncModelEditorPricingJson/);
  assert.match(script, /pricing\.baseCredits = baseCredits/);
  assert.match(script, /pricing\.billingMode = String\(form\.elements\.pricingBillingMode/);
  assert.match(script, /pricing\.resolutionCredits = resolutionCredits/);
  assert.match(script, /billingMode: String\(form\.get\("billingMode"\)/);
  assert.match(script, /pricing\.unit = String\(form\.elements\.pricingUnit\.value/);
  assert.match(script, /name="canvasAgentTokenCreditsPerMillion"/);
  assert.match(script, /name="canvasAgentBillingMode"/);
  assert.match(script, /data-canvas-agent-pricing-field/);
  assert.match(script, /field\.hidden = kind\.mediaType !== "text"/);
  assert.match(script, /canvasAgentTokenCreditsPerMillion\.required = kind\.mediaType === "text"/);
  assert.match(script, /画布协作计费模式|\\u753b\\u5e03\\u534f\\u4f5c\\u8ba1\\u8d39\\u6a21\\u5f0f/);
  assert.match(script, /按总 Token 计费|\\u6309\\u603b Token \\u8ba1\\u8d39/);
  assert.match(script, /画布协作 Token 单价|\\u753b\\u5e03\\u534f\\u4f5c Token \\u5355\\u4ef7/);
  assert.match(script, /pricing\.canvasAgentBillingMode = String\(form\.get\("canvasAgentBillingMode"\)/);
  assert.match(script, /pricing\.canvasAgentTokenCreditsPerMillion = Number\(form\.get\("canvasAgentTokenCreditsPerMillion"\)\)/);
});

test("model status drawer changes status without launch checks", () => {
  assert.match(script, /async function openModelStatusDrawer\(modelId, status\)/);
  assert.match(script, /api\(`\/api\/admin\/models\/\$\{modelId\}`\)/);
  assert.match(script, /state\.models\[modelIndex\] = model/);
  assert.doesNotMatch(script, /const launchCheck = modelLaunchCheckUi\(model\)/);
});

test("model parameter builder displays known image parameters in Chinese", () => {
  assert.doesNotMatch(script, /manualParameterVisible|parameterVisible:\$\{template\.key\}|是否显示|默认前台显示/);
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

test("model parameter template defaults only seed new-model selections", () => {
  assert.match(script, /function parameterTemplateSelectionRows\(mediaType, schema = \{\}, defaultParams = \{\}, useDefaultSelections = false, pricing = \{\}\)/);
  assert.match(script, /function defaultModelParameterKeys\(mediaType, useDefaultSelections = false\)/);
  assert.match(script, /const defaultSupportedKeys = defaultModelParameterKeys\(mediaType, useDefaultSelections\)/);
  assert.match(script, /parameterTemplateSelectionRows\(modelKindOption\(selectedModelKind\)\.mediaType, base\.parameterSchema \|\| \{\}, base\.defaultParams \|\| \{\}, !isEdit, base\.pricing \|\| \{\}\)/);
  assert.match(script, /parameterTemplateSelectionRows\(kind\.mediaType, base\.parameterSchema \|\| \{\}, base\.defaultParams \|\| \{\}, !isEdit, base\.pricing \|\| \{\}\)/);
});

test("admin model editor exposes the dedicated BananaRouter adapter templates", () => {
  assert.match(script, /value: "banana_router", label: "BananaRouter 模型适配器", mediaTypes: \["image", "video"\]/);
  assert.match(script, /apiKeyEnv: "BananaRouter_API_KEY"/);
  assert.match(script, /requestFormat: "banana_router_openai_images"/);
  assert.match(script, /requestFormat: "banana_router_seedance_video"/);
  assert.match(script, /provider\.includes\("bananarouter"\)/);
  assert.match(script, /requestFormat\.startsWith\("banana_router_"\)/);
  assert.match(
    script,
    /const fixedBananaRouterImageTransport = mediaType === "image" && providerAdapter === "banana_router";/,
  );
});

test("new BananaRouter image models use the documented recoverable async transport", () => {
  const start = script.indexOf("function fixedModelTemplate");
  const end = script.indexOf("function schemaFromSelectedParameterTemplates", start);
  const context = {
    defaultModelAdapter: () => "custom_http",
    result: null,
  };

  vm.runInNewContext(`${script.slice(start, end)}
    result = fixedModelTemplate("image", "BananaRouter", "banana_router");
  `, context);

  assert.equal(context.result.invocationMode, "async_polling");
  assert.equal(context.result.capabilities.asyncPolling, true);
  assert.equal(context.result.providerConfig.requestPath, "/v1/images/generations/async");
  assert.equal(context.result.providerConfig.editEndpoint, "/v1/images/edits/async");
  assert.equal(context.result.providerConfig.queryTaskEndpoint, "/v1/async-tasks/{taskId}");
  assert.equal(context.result.providerConfig.resultFormat, "url");
  assert.equal(context.result.dispatchPolicy.pollQueueName, "generation-poll-image");
});

test("existing model edits preserve hidden transport fields until the adapter changes", () => {
  const start = script.indexOf("function modelTransportFields");
  assert.notEqual(start, -1, "model transport preservation helper exists");
  const end = script.indexOf("function simplifiedModelPayloadFromForm", start);
  const context = { result: null };

  vm.runInNewContext(`${script.slice(start, end)}
    const fixed = {
      providerProtocol: "banana_router",
      invocationMode: "sync",
      capabilities: { input: ["prompt", "image"], output: ["image"] },
      limits: {},
      dispatchPolicy: { submitQueueName: "generation-submit-image", pollQueueName: null },
    };
    const existing = {
      providerProtocol: "banana_router",
      invocationMode: "async_polling",
      capabilities: { input: ["prompt", "image"], output: ["image"], asyncPolling: true },
      limits: { maxImages: 8 },
      dispatchPolicy: { submitQueueName: "generation-submit-image", pollQueueName: "generation-poll-image" },
    };
    result = {
      preserved: modelTransportFields(existing, fixed, false),
      switched: modelTransportFields(existing, fixed, true),
    };
  `, context);

  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.preserved, {
    providerProtocol: "banana_router",
    invocationMode: "async_polling",
    capabilities: { input: ["prompt", "image"], output: ["image"], asyncPolling: true },
    limits: { maxImages: 8 },
    dispatchPolicy: { submitQueueName: "generation-submit-image", pollQueueName: "generation-poll-image" },
  });
  assert.deepEqual(result.switched, {
    providerProtocol: "banana_router",
    invocationMode: "sync",
    capabilities: { input: ["prompt", "image"], output: ["image"] },
    limits: {},
    dispatchPolicy: { submitQueueName: "generation-submit-image", pollQueueName: null },
  });
});

test("model transport resets for media changes and mixed BananaRouter image async configs", () => {
  const start = script.indexOf("function modelTransportChanged");
  assert.notEqual(start, -1, "model transport change helper exists");
  const end = script.indexOf("function simplifiedModelPayloadFromForm", start);
  const context = {
    inferModelAdapter: () => "banana_router",
    result: null,
  };

  vm.runInNewContext(`${script.slice(start, end)}
    const existingVideo = { mediaType: "video", providerProtocol: "banana_router" };
    const legacyCustomHttp = { mediaType: "image", providerProtocol: "custom_http" };
    const mixedBananaRouterImage = {
      mediaType: "image",
      providerProtocol: "banana_router",
      invocationMode: "sync",
      providerConfig: {
        requestFormat: "banana_router_openai_images",
        requestPath: "/v1/images/generations/async",
        createTaskEndpoint: "/v1/images/generations/async",
        queryTaskEndpoint: "/v1/async-tasks/{taskId}",
      },
    };
    const legacySyncBananaRouterImage = {
      mediaType: "image",
      providerProtocol: "banana_router",
      invocationMode: "sync",
      providerConfig: {
        requestFormat: "banana_router_openai_images",
        requestPath: "/v1/images/generations",
        createTaskEndpoint: "/v1/images/generations",
        editEndpoint: "/v1/images/edits",
      },
    };
    result = {
      sameMedia: modelTransportChanged(existingVideo, "video", "banana_router"),
      changedMedia: modelTransportChanged(existingVideo, "image", "banana_router"),
      changedAdapter: modelTransportChanged(existingVideo, "video", "custom_http"),
      normalizedProtocol: modelTransportChanged(legacyCustomHttp, "image", "banana_router"),
      repairsMixedBananaRouterImage: modelTransportChanged(mixedBananaRouterImage, "image", "banana_router"),
      repairsLegacySyncBananaRouterImage: modelTransportChanged(legacySyncBananaRouterImage, "image", "banana_router"),
    };
  `, context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.result)), {
    sameMedia: false,
    changedMedia: true,
    changedAdapter: true,
    normalizedProtocol: true,
    repairsMixedBananaRouterImage: true,
    repairsLegacySyncBananaRouterImage: true,
  });
});

test("saving a legacy BananaRouter image model cannot restore its synchronous request path", () => {
  const start = script.indexOf("function modelTransportFields");
  assert.notEqual(start, -1, "model transport helpers exist");
  const end = script.indexOf("modelsPage = function modelsPage", start);
  const context = {
    inferModelAdapter: () => "banana_router",
    inferModelKind: () => "image.reference_image",
    modelKindOption: () => ({
      value: "image.reference_image",
      label: "参考生图",
      mediaType: "image",
      taskModes: ["image.edit", "image.reference_generate"],
    }),
    providerNameForSecretKey: () => "BananaRouter",
    defaultModelAdapter: () => "banana_router",
    fixedModelTemplate: () => ({
      providerProtocol: "banana_router",
      invocationMode: "async_polling",
      taskModes: ["image.generate", "image.edit", "image.reference_generate"],
      status: "disabled",
      sortOrder: 100,
      capabilities: { input: ["prompt", "image"], output: ["image"], asyncPolling: true },
      defaultParams: {},
      providerConfig: {
        baseURL: "https://api.bananarouter.com",
        requestPath: "/v1/images/generations/async",
        endpoint: "/v1/images/generations/async",
        createTaskEndpoint: "/v1/images/generations/async",
        editEndpoint: "/v1/images/edits/async",
        queryTaskEndpoint: "/v1/async-tasks/{taskId}",
        requestFormat: "banana_router_openai_images",
        resultFormat: "url",
      },
      pricing: { unit: "image", billingMode: "fixed", baseCredits: 90 },
      limits: {},
      uiConfig: {},
      dispatchPolicy: {
        submitQueueName: "generation-submit-image",
        pollQueueName: "generation-poll-image",
      },
    }),
    schemaFromSelectedParameterTemplates: () => ({
      schema: { quality: { type: "enum", options: ["high", "auto"] } },
      defaults: { quality: "auto" },
    }),
    resolutionCreditsFromForm: () => ({}),
    baseCreditsFromForm: () => 90,
    resolveVideoTaskModes: () => [],
    videoSupportedModesByTaskModes: () => [],
    result: null,
  };

  vm.runInNewContext(`${script.slice(start, end)}
    const values = {
      modelKind: "image.reference_image",
      providerName: "BananaRouter",
      providerAdapter: "banana_router",
      providerModel: "gpt-image-2",
      requestPath: "/v1/images/generations",
      modelApiKeyEnv: "BananaRouter_API_KEY",
      billingMode: "fixed",
      modelCode: "bananarouter-gpt-image-2",
      displayName: "GPT Image 2 Pro",
      remark: "keep me",
      reason: "change quality",
    };
    const form = { get: (key) => values[key] ?? "" };
    result = simplifiedModelPayloadFromForm(form, {
      modelCode: "bananarouter-gpt-image-2",
      displayName: "GPT Image 2 Pro",
      providerName: "BananaRouter",
      providerModel: "gpt-image-2",
      providerProtocol: "banana_router",
      invocationMode: "sync",
      mediaType: "image",
      taskModes: ["image.generate", "image.edit", "image.reference_generate"],
      status: "active",
      pricing: { unit: "image", billingMode: "fixed", baseCredits: 90 },
      parameterSchema: { quality: { type: "enum", options: ["high", "auto"] } },
      defaultParams: { quality: "high" },
      capabilities: { input: ["prompt", "image"], output: ["image"], vendorFeature: true },
      providerConfig: {
        baseURL: "https://api.bananarouter.com",
        requestPath: "/v1/images/generations",
        endpoint: "/v1/images/generations",
        createTaskEndpoint: "/v1/images/generations",
        editEndpoint: "/v1/images/edits",
        queryTaskEndpoint: "/v1/async-tasks/{taskId}",
        apiKeyEnv: "BananaRouter_API_KEY",
        requestFormat: "banana_router_openai_images",
        resultFormat: "b64_json",
        vendorOption: "keep-me",
      },
      limits: { maxImages: 2, maxPromptLength: 8000 },
      uiConfig: { modelKind: "image.reference_image", supportedModes: ["reference_image"] },
      dispatchPolicy: {
        submitQueueName: "generation-submit-image",
        pollQueueName: null,
        providerRpmLimit: 7,
        providerConcurrentLimit: 1,
        submitConcurrencyLimit: 2,
        pollingConcurrencyLimit: 3,
      },
    });
  `, context);

  const result = JSON.parse(JSON.stringify(context.result));
  assert.equal(result.invocationMode, "async_polling");
  assert.equal(result.providerConfig.requestPath, "/v1/images/generations/async");
  assert.equal(result.providerConfig.endpoint, "/v1/images/generations/async");
  assert.equal(result.providerConfig.createTaskEndpoint, "/v1/images/generations/async");
  assert.equal(result.providerConfig.editEndpoint, "/v1/images/edits/async");
  assert.equal(result.providerConfig.queryTaskEndpoint, "/v1/async-tasks/{taskId}");
  assert.equal(result.providerConfig.resultFormat, "url");
  assert.equal(result.providerConfig.vendorOption, "keep-me");
  assert.equal(result.dispatchPolicy.pollQueueName, "generation-poll-image");
  assert.equal(result.dispatchPolicy.providerRpmLimit, 7);
  assert.equal(result.dispatchPolicy.providerConcurrentLimit, 1);
  assert.equal(result.dispatchPolicy.submitConcurrencyLimit, 2);
  assert.equal(result.dispatchPolicy.pollingConcurrencyLimit, 3);
  assert.equal(result.capabilities.vendorFeature, true);
  assert.equal(result.capabilities.asyncPolling, true);
  assert.deepEqual(result.limits, { maxImages: 2, maxPromptLength: 8000 });
  assert.equal(result.defaultParams.quality, "auto");
});

test("saving an unchanged model kind preserves existing task and supported modes", () => {
  const start = script.indexOf("function modelKindTransportFields");
  assert.notEqual(start, -1, "model kind transport helper exists");
  const end = script.indexOf("function modelTransportChanged", start);
  const context = {
    inferModelKind: () => "image.reference_image",
    resolveVideoTaskModes: (kind) => kind.taskModes,
    videoSupportedModesByTaskModes: () => [],
    result: null,
  };

  vm.runInNewContext(`${script.slice(start, end)}
    const existing = {
      taskModes: ["image.generate", "image.edit", "image.reference_generate"],
      uiConfig: { supportedModes: ["single-image", "multi-image"] },
    };
    result = {
      preserved: modelKindTransportFields(existing, {
        value: "image.reference_image",
        mediaType: "image",
        taskModes: ["image.edit", "image.reference_generate", "image.image_to_image"],
      }),
      switched: modelKindTransportFields(existing, {
        value: "image.text_to_image",
        mediaType: "image",
        taskModes: ["image.generate"],
      }),
    };
  `, context);

  const result = JSON.parse(JSON.stringify(context.result));
  assert.deepEqual(result.preserved.taskModes, ["image.generate", "image.edit", "image.reference_generate"]);
  assert.deepEqual(result.preserved.supportedModes, ["single-image", "multi-image"]);
  assert.deepEqual(result.switched.taskModes, ["image.generate"]);
  assert.deepEqual(result.switched.supportedModes, ["text_to_image"]);
});

test("admin image models can configure provider-backed resolution values", () => {
  assert.match(
    script,
    /\{ key: "resolution", label: "\\u5206\\u8fa8\\u7387", type: "enum", mediaTypes: \["image", "video"\][\s\S]*?"3840x2160"/,
  );
});

test("admin model edits preserve provider-specific schema fields and option values", () => {
  assert.match(script, /function schemaFromSelectedParameterTemplates\(form, existingSchema = \{\}, existingDefaults = \{\}\)/);
  assert.match(script, /if \(!editableKeys\.has\(key\)[\s\S]*?schema\[key\] = \{ \.\.\.value \};/);
  assert.match(script, /defaults\[key\] = existingDefaults\[key\]/);
  assert.match(script, /const availableOptions = \[\.\.\.new Set\(\[\.\.\.\(template\.options \|\| \[\]\), \.\.\.\(selectedOptions \|\| \[\]\)\]/);
  assert.match(script, /schemaFromSelectedParameterTemplates\(form, existing\?\.parameterSchema \|\| \{\}, existing\?\.defaultParams \|\| \{\}\)/);
});

test("admin model management uses parameter templates and a simplified model editor", () => {
  for (const contract of [
    "MODEL_PARAMETER_TEMPLATES_CONFIG_KEY",
    "model.parameter_templates",
    "DEFAULT_MODEL_PARAMETER_TEMPLATES",
    "parameterTemplatesPage",
    "openParameterTemplateDrawer",
    "deleteParameterTemplate",
    "saveParameterTemplates",
    "parameterOptionEditorMarkup",
    "addParameterTemplateOption",
    "moveParameterTemplateOption",
    "removeParameterTemplateOption",
    "readParameterOptionEditorValues",
    "data-parameter-option-row",
    "parameterTemplateSelectionRows",
    "schemaFromSelectedParameterTemplates",
    "parameterOptionSelectMarkup",
    "parameterSelectedValuesMarkup",
    "parameterDefaultSelectMarkup",
    "modelFrontendParameterPreviewMarkup",
    "updateModelFrontendParameterPreview",
    "model-frontend-parameter-preview",
    "model-front-parameter-preview",
    "updateParameterDefaultOptions",
    "editableModelParameterTemplates",
    "MODEL_CANONICAL_MEDIA_PARAMETER_KEYS",
    "MODEL_HIDDEN_PARAMETER_BINDING_KEYS",
    "updateParameterSelectedPreview",
    "data-parameter-selected-values",
    "data-parameter-default-select",
    "parameter-value-chip",
    "simplifiedModelPayloadFromForm",
    "fixedModelTemplate",
    "parameterSupported:${template.key}",
    "parameterRequired:${template.key}",
    "form.getAll(`parameterOptions:${template.key}`)",
    "name.startsWith(\"parameterOptions:\")",
    "MODEL_KIND_OPTIONS",
    "modelKindOptionsMarkup",
    "inferModelKind",
    "modelKindLabel",
    "name=\"modelKind\"",
    "modelKind: kind.value",
    "modelKindLabel: kind.label",
    "text.script",
    "scriptPrompt",
    "scriptGenre",
    "episodeCount",
    "scriptStyle",
    "openai_compatible_chat",
    "cumob_chat",
    "酷模文本适配器",
    "globalaiopc_video",
    "global_ai_opc_image",
    "volcengine_ark_image",
    "extra_token_video",
    "saier_video",
    "providerAdapter",
    "MODEL_ADAPTER_OPTIONS",
    "inferModelAdapter",
    "modelAdapterOptionsMarkup",
    "generation-submit-text",
    "openModelDeleteDrawer",
    "admin-ui-model-delete",
    "method: \"DELETE\"",
    "modelSortValue",
    "sortedModelRows",
    "saveModelSortOrder",
    "moveModelSortOrder",
    "admin-ui-model-sort",
    "window.saveModelSortOrder",
    "window.moveModelSortOrder",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  for (const label of [
    "\\u53c2\\u6570\\u6a21\\u677f\\u5e93",
    "\\u6a21\\u578b\\u7f16\\u7801",
    "\\u5c55\\u793a\\u540d\\u79f0",
    "\\u771f\\u5b9e\\u6a21\\u578b\\u540d",
    "\\u7c7b\\u578b",
    "\\u6587\\u751f\\u56fe",
    "\\u53c2\\u8003\\u751f\\u56fe",
    "\\u9996\\u5e27\\u751f\\u89c6\\u9891",
    "\\u9996\\u5c3e\\u5e27\\u751f\\u89c6\\u9891",
    "\\u53c2\\u8003\\u751f\\u89c6\\u9891",
    "\\u5267\\u672c\\u6a21\\u578b",
    "\\u5267\\u672c\\u9700\\u6c42",
    "\\u5267\\u672c\\u9898\\u6750",
    "\\u5267\\u672c\\u98ce\\u683c",
    "\\u8ba1\\u8d39\\u6a21\\u5f0f",
    "\\u8bf7\\u6c42\\u9002\\u914d\\u5668",
    "\\u56fa\\u5b9a\\u8ba1\\u8d39",
    "\\u65f6\\u957f\\u8ba1\\u8d39",
    "\\u79ef\\u5206",
    "API \\u5bc6\\u94a5",
    "\\u5907\\u6ce8",
    "\\u6a21\\u578b\\u53c2\\u6570\\u7ed1\\u5b9a",
    "\\u7ba1\\u7406\\u53c2\\u6570\\u6a21\\u677f",
    "\\u524d\\u53f0\\u663e\\u793a",
    "\\u524d\\u53f0\\u63a7\\u4ef6",
    "\\u63d0\\u4ea4\\u9884\\u89c8",
    "\\u524d\\u53f0\\u53c2\\u6570\\u9884\\u89c8",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(label)));
  }

  assert.doesNotMatch(script, /name="inputSchema"|name="outputSchema"|\\u7ed3\\u6784\\u914d\\u7f6e|\\u5165\\u53c2\\u7ed3\\u6784|\\u51fa\\u53c2\\u7ed3\\u6784/);

  assert.match(script, /navButton\("parameterTemplates", "\\u53c2\\u6570\\u6a21\\u677f"\)/);
  assert.match(script, /providerProtocol: transport\.providerProtocol/);
  assert.match(script, /invocationMode: transport\.invocationMode/);
  assert.match(script, /const kindTransport = modelKindTransportFields\(existing, kind\)/);
  assert.match(script, /const taskModes = kindTransport\.taskModes/);
});

test("admin user management table keeps model records in the outer action bar", () => {
  assert.match(script, /openUserActionDrawer/);
  assert.match(script, /openUserModelRequestDrawer/);
  assert.match(script, /toggleUserModelRequestInline/);
  assert.match(script, /<th>用户ID<\/th><th>邀请码<\/th><th>用户名<\/th><th>手机号<\/th>/);
  assert.match(script, /用户操作/);
  assert.match(script, />模型记录</);
  assert.match(script, />子账户</);
  assert.match(script, /修改资料/);
  assert.match(script, /禁用/);
  assert.match(script, /启用/);
  assert.match(script, /删除/);
  assert.match(script, /调整积分/);
  assert.match(script, /增加积分/);
  assert.match(script, /扣减积分/);
  assert.match(script, /调整到目标积分/);
  assert.match(script, /openCreditAdjustDrawer/);
  assert.match(script, /openCreditGrantDrawer/);
  assert.match(script, /openCreditDeductDrawer/);
  assert.match(script, /openCreditSetBalanceDrawer/);
  assert.match(script, /onclick="openUserStatusDrawer\('\$\{user\.userId\}','\$\{nextStatus\}'\)"/);
  assert.match(script, /onclick="openUserActionDrawer\('\$\{user\.userId\}'\)"/);
  assert.match(script, /onclick="openUserStatusDrawer\('\$\{user\.userId\}','archived'\)"/);
  const rowBlock = script.slice(script.indexOf("function userRow(user)"), script.indexOf("async function toggleUserModelRequestInline"));
  const actionDrawerBlock = script.slice(script.indexOf("function openUserActionDrawer"), script.indexOf("function userDrawerHead"));
  assert.doesNotMatch(rowBlock, /openUserProfileDrawer/);
  assert.match(rowBlock, /onclick="openUserModelRequestDrawer\('\$\{user\.userId\}'\)"[^>]*>模型记录<\/button>/);
  assert.match(actionDrawerBlock, /onclick="openUserProfileDrawer\('\$\{user\.userId\}'\)"/);
  assert.doesNotMatch(actionDrawerBlock, /openUserModelRequestDrawer/);
  assert.match(actionDrawerBlock, /onclick="openUserSubaccountsDrawer\('\$\{user\.userId\}'\)"/);
  assert.match(actionDrawerBlock, /onclick="openCreditAdjustDrawer\('\$\{user\.userId\}'\)"/);
  assert.match(actionDrawerBlock, /id="user-ledger-panel"/);
  assert.match(actionDrawerBlock, /loadUserAccountLedgerPanel\(userId, "user-ledger-panel"\)/);
  assert.doesNotMatch(actionDrawerBlock, /查看账户与模型记录/);
  assert.doesNotMatch(actionDrawerBlock, /openUserDetailDrawer/);
  assert.doesNotMatch(actionDrawerBlock, /openCreditGrantDrawer/);
  assert.doesNotMatch(actionDrawerBlock, /openCreditDeductDrawer/);
  assert.doesNotMatch(actionDrawerBlock, /openCreditSetBalanceDrawer/);
  const ledgerPanelBlock = script.slice(script.indexOf("async function loadUserAccountLedgerPanel"), script.indexOf("async function openUserSubaccountsDrawer"));
  assert.doesNotMatch(ledgerPanelBlock, /关联子账户/);
  assert.doesNotMatch(ledgerPanelBlock, /subaccounts/);
  assert.match(script, /async function openUserSubaccountsDrawer\(userId\)/);
  assert.match(script, /\/api\/admin\/users\/\$\{userId\}\/subaccounts/);
  assert.match(script, /成员账号/);
  assert.match(script, /完整登录账号/);
  assert.match(script, /成员名称/);
  assert.match(script, /子账户余额/);
  assert.match(script, /创建时间/);
  assert.match(script, /更新时间/);
  assert.match(script, /item\.memberAccount \|\| item\.member_account \|\| item\.teamAccount/);
  assert.match(script, /item\.loginName \|\| item\.memberLoginAccount \|\| item\.member_login_account/);
  assert.match(script, /item\.memberCredits \?\? item\.member_credits \?\? item\.creditBalance \?\? item\.availableCredits/);
  assert.match(script, /formatAdminDateTime\(item\.createdAt \|\| item\.created_at\)/);
  assert.match(script, /formatAdminDateTime\(item\.updatedAt \|\| item\.updated_at\)/);
  assert.match(script, /window\.openUserSubaccountsDrawer = openUserSubaccountsDrawer/);
  assert.match(script, /function compactUserId\(userId\)/);
  assert.match(script, /<td><div title="\$\{escapeAttribute\(user\.userId\)\}">\$\{escapeHtml\(compactUserId\(user\.userId\)\)\}<\/div>/);
  assert.match(script, /<td>\$\{escapeHtml\(user\.inviteCode \|\| "-"\)\}<\/td>/);
  assert.match(script, /<td>\$\{escapeHtml\(user\.displayName \|\| "未命名用户"\)\}<\/td>/);
  assert.match(script, /<td>\$\{escapeHtml\(user\.phone \|\| "-"\)\}<\/td>/);
  assert.match(script, /user-model-request-inline-row/);
  assert.doesNotMatch(script, /<button class="btn ghost" onclick="toggleUserModelRequestInline\('\$\{user\.userId\}'\)"/);
  assert.doesNotMatch(script, /<button class="btn ghost" onclick="openUserDetailDrawer\('\$\{user\.userId\}'\)"/);
  assert.doesNotMatch(script, /<button class="icon-btn" title="查看账户" onclick="openUserDetailDrawer\('\$\{user\.userId\}'\)"/);
});

test("admin user credit secondary drawers return to the action menu", () => {
  assert.match(script, /function userDrawerHead\(title, userId\)/);
  assert.match(script, /onclick="openUserActionDrawer\('\$\{userId\}'\)">返回/);
  for (const contract of [
    /openUserDetailDrawer\(userId\)[\s\S]*userDrawerHead\("账户详情", userId\)/,
    /openUserSubaccountsDrawer\(userId\)[\s\S]*userDrawerHead\("子账户", userId\)/,
    /openUserProfileDrawer\(userId\)[\s\S]*userDrawerHead\("修改资料", userId\)/,
    /openCreditAdjustDrawer\(userId, initialAction = "grant"\)[\s\S]*userDrawerHead\("调整积分", userId\)/,
    /openCreditGrantDrawer\(userId\)[\s\S]*openCreditAdjustDrawer\(userId, "grant"\)/,
    /openCreditDeductDrawer\(userId\)[\s\S]*openCreditAdjustDrawer\(userId, "deduct"\)/,
    /openCreditSetBalanceDrawer\(userId\)[\s\S]*openCreditAdjustDrawer\(userId, "setBalance"\)/,
    /openUserStatusDrawer\(userId, status\)[\s\S]*userDrawerHead\(`\$\{action\}账户`, userId\)/,
  ]) {
    assert.match(script, contract);
  }
  const modelRequestDrawerBlock = script.slice(
    script.indexOf("async function openUserModelRequestDrawer"),
    script.indexOf("function renderUserModelRequestPanel"),
  );
  assert.match(modelRequestDrawerBlock, /<h3>模型记录<\/h3>/);
  assert.doesNotMatch(modelRequestDrawerBlock, /userDrawerHead/);
});

test("admin user detail drawer loads model request records for the selected user", () => {
  assert.match(script, /正在加载模型记录/);
  assert.match(script, /\/api\/admin\/users\/\$\{userId\}\/model-requests\?\$\{params\.toString\(\)\}/);
  assert.match(script, /renderUserModelRequestPanel/);
  assert.match(script, /const requestContent = renderModelRequestContent\(item\);/);
  assert.match(script, /const providerRequestContent = renderModelProviderRequestContent\(item\);/);
  assert.match(script, /const responseContent = renderModelProviderResponseContent\(item\);/);
  assert.match(script, /item\?\.businessRequestBody \|\| item\?\.requestBody/);
  assert.match(script, /item\?\.providerRequestUrl/);
  assert.match(script, /item\?\.providerResponseBody/);
  assert.match(script, /请求 URL：/);
  assert.match(script, /请求 Body：/);
  assert.match(script, /Object\.keys\(requestBody\)\.length > 0/);
  assert.match(script, /return JSON\.stringify\(requestBody, null, 2\);/);
  assert.match(script, /function renderModelProviderSubmissionStatus\(item\)/);
  assert.match(script, /未发送到供应商/);
  assert.match(script, /模型记录/);
  assert.match(script, /只看视频模型/);
  assert.match(script, /只看图片模型/);
  assert.match(script, /只看文本模型/);
  assert.match(script, /<th>模型名称<\/th><th>积分消耗<\/th><th>发送状态<\/th><th>业务任务参数<\/th><th>供应商实际请求<\/th><th>返回内容<\/th><th>请求时间<\/th>/);
  assert.match(script, /changeUserModelRequestFilter/);
  assert.match(script, /changeUserModelRequestPage/);
});

test("admin model request cells cap oversized display content", () => {
  const start = script.indexOf("const MODEL_REQUEST_DISPLAY_MAX_CHARACTERS");
  const end = script.indexOf("function renderModelProviderSubmissionStatus", start);
  assert.notEqual(start, -1, "model request display limiter exists");
  assert.ok(end > start, "model request display limiter is defined before status rendering");
  assert.match(script, /truncateModelRequestDisplayContent\(requestContent \|\| "无"\)/);
  assert.match(script, /truncateModelRequestDisplayContent\(providerRequestContent\)/);
  assert.match(script, /truncateModelRequestDisplayContent\(responseContent \|\| "无"\)/);

  const context = { result: null };
  vm.runInNewContext(`${script.slice(start, end)}
    result = truncateModelRequestDisplayContent("A".repeat(100000));
  `, context);
  assert.ok(context.result.length < 25_000);
  assert.match(context.result, /\[truncated: 100000 chars total\]$/);
});

test("admin shell includes membership plan management page", async () => {
  const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /membership-plans/);
  assert.match(html, /loadMembershipPlans/);
  assert.match(html, /openMembershipPlanDrawer/);
  assert.match(html, /deleteMembershipPlan/);
  assert.match(html, /\/api\/admin\/membership\/plans/);
  assert.match(html, /method: "DELETE"/);
  assert.match(html, /permissionAttrs\("membership\.plan\.write"\)/);
});

test("admin standalone shell keeps membership plan management visible", () => {
  for (const contract of [
    'path.includes("/membership")',
    'membership: "/admin/membership"',
    'navButton("membership"',
    'state.page === "membership"',
    "renderMembershipPage",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell exposes direct credit recharge inside membership benefits tabs", () => {
  const finalStart = script.indexOf("const ADMIN_PAGE_LOADERS");
  assert.notEqual(finalStart, -1, "final lazy loader block exists");
  const finalScript = script.slice(finalStart);

  for (const contract of [
    "directRechargePackages: []",
    "directRechargeLoadError",
    'path.includes("/direct-recharge")',
    'state.membershipBenefitTab = "directRecharge"',
    "normalizedMembershipBenefitTab",
    "renderMembershipBenefitTabs",
    "setMembershipBenefitTab('directRecharge')",
    "积分套餐",
    "renderDirectRechargePage",
    "loadDirectRechargePackages",
    "openDirectRechargePackageDrawer",
    "deleteDirectRechargePackage",
    "/api/admin/direct-recharge/packages",
    "admin-ui-direct-recharge-package",
    "metadata: { kind: \"direct_recharge\"",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  assert.match(finalScript, /membership:\s*\(\) => Promise\.all\(\[loadMembershipPlans\(\), loadDirectRechargePackages\(\)\]\)/);
  assert.match(finalScript, /directRecharge:\s*\(\) => loadDirectRechargePackages\(\)/);
  assert.doesNotMatch(finalScript, /users:\s*\(\) => loadDirectRechargePackages\(\)/);
  assert.doesNotMatch(script, /navButton\("directRecharge"/);
  assert.doesNotMatch(script, /state\.page === "directRecharge"/);
});

test("admin membership and direct recharge pricing rows expose delete actions", () => {
  const membershipRowStart = script.indexOf("function renderMembershipPlanRow");
  assert.notEqual(membershipRowStart, -1, "membership row renderer exists");
  const membershipRowBlock = script.slice(membershipRowStart, script.indexOf("function renderDirectRechargePage", membershipRowStart));
  const directRechargeRowStart = script.indexOf("function renderDirectRechargePackageRow");
  assert.notEqual(directRechargeRowStart, -1, "direct recharge row renderer exists");
  const directRechargeRowBlock = script.slice(directRechargeRowStart, script.indexOf("function directRechargePackageById", directRechargeRowStart));

  assert.match(membershipRowBlock, /title="删除套餐"/);
  assert.match(membershipRowBlock, /deleteMembershipPlan/);
  assert.match(directRechargeRowBlock, /title="删除档位"/);
  assert.match(directRechargeRowBlock, /deleteDirectRechargePackage/);
  assert.match(script, /function deleteMembershipPlan/);
  assert.match(script, /function deleteDirectRechargePackage/);
  assert.match(script, /\/api\/admin\/membership\/plans\/\$\{encodeURIComponent\(planId\)\}/);
  assert.match(script, /\/api\/admin\/direct-recharge\/packages\/\$\{encodeURIComponent\(packageId\)\}/);
});

test("admin direct recharge drawer explains sort order and save failures clearly", () => {
  const drawerStart = script.indexOf("function openDirectRechargePackageDrawer");
  assert.notEqual(drawerStart, -1, "direct recharge drawer exists");
  const drawerBlock = script.slice(drawerStart, script.indexOf("function directRechargePackagePayloadFromForm", drawerStart));

  assert.match(drawerBlock, /展示顺序（数字越小越靠前）/);
  assert.match(drawerBlock, /directRechargePackageConflictMessage/);
  assert.match(drawerBlock, /credit_package_code_conflict/);
  assert.doesNotMatch(drawerBlock, /<span>排序<\/span>/);
});

test("admin api surfaces non-enveloped write errors instead of generic request failure", () => {
  assert.match(script, /function adminApiErrorMessage/);
  assert.match(script, /typeof error === "string"/);
  assert.match(script, /idempotency_key_required/);
  assert.match(script, /response\.status === 404/);
  assert.doesNotMatch(script, /new Error\(payload\.error\?\.message \|\| "请求失败"\)/);
});

test("admin user credit page stays focused on manual credit adjustments", () => {
  const usersPageStart = script.indexOf("function usersPage");
  assert.notEqual(usersPageStart, -1, "users page exists");
  const usersPageBlock = script.slice(usersPageStart, script.indexOf("function userRowsHtml", usersPageStart));

  assert.match(usersPageBlock, /refreshUserCreditPage/);
  assert.doesNotMatch(usersPageBlock, /新增直充/);
  assert.doesNotMatch(usersPageBlock, /积分档位/);
  assert.doesNotMatch(usersPageBlock, /openDirectRechargePackageDrawer/);
});

test("admin user credit actions can gift membership plans to personal users", () => {
  assert.match(script, /function openMembershipGrantDrawer\(userId\)/);
  assert.match(script, /function isPersonalCreditOwnerAccount\(user\)/);
  assert.match(script, /user\?\.accountType === "owner_account"/);
  assert.match(script, /isPersonalUserAccount\(user\)/);
  assert.match(script, /赠送会员/);
  assert.match(script, /\/api\/admin\/membership\/grantable-plans/);
  assert.match(script, /\/api\/admin\/users\/\$\{userId\}\/membership\/grant/);
  assert.match(script, /reason: "会员赠送"/);
  assert.match(script, /metadata\.adminGift === true \? "会员赠送" : "会员赠送积分"/);
  assert.match(script, /window\.openMembershipGrantDrawer = openMembershipGrantDrawer/);
});

test("admin membership plan save uses an ASCII-safe idempotency key", () => {
  const saveStart = script.indexOf("/api/admin/membership/plans");
  assert.notEqual(saveStart, -1, "membership plan save endpoint exists");
  const saveBlock = script.slice(saveStart, script.indexOf("function membershipPlanPayloadFromForm", saveStart));

  assert.match(script, /function adminIdempotencyKey/);
  assert.match(saveBlock, /adminIdempotencyKey\("membership-plan"\)/);
  assert.doesNotMatch(saveBlock, /payload\.(id|code)/);
});

test("admin membership plan code conflicts stay visible in the open drawer", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  const saveBlock = script.slice(
    drawerStart,
    script.indexOf("function membershipPlanPayloadFromForm", drawerStart),
  );
  const conflictStart = saveBlock.indexOf('if (err.payload?.error?.code === "membership_plan_code_conflict")');
  const conflictBlock = saveBlock.slice(conflictStart, saveBlock.indexOf("throw err;", conflictStart));

  assert.notEqual(conflictStart, -1, "membership conflict handler exists");
  assert.match(conflictBlock, /await loadMembershipPlans\(\)/);
  assert.match(conflictBlock, /error\.textContent = membershipPlanConflictMessage\(payload\)/);
  assert.doesNotMatch(conflictBlock, /renderShell\(\)/);
});

test("admin membership plan drawer exposes operator-friendly pricing and entitlement controls", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  assert.notEqual(drawerStart, -1, "membership drawer exists");
  const drawerBlock = script.slice(drawerStart, script.indexOf("function membershipPlanPayloadFromForm", drawerStart));
  const payloadBlock = script.slice(
    script.indexOf("function membershipPlanPayloadFromForm"),
    script.indexOf("function parseJsonArrayTextarea"),
  );

  for (const contract of [
    "套餐标识/内部编码",
    "专业版月卡299",
    "价格（元）",
    "amountYuan",
    "会员有效期：单位 + 数量",
    "check-grid",
    "check-option",
    "可使用画布功能",
    "Seedance 2.0 优先排队",
    "团队成员管理",
    "全流程 Agent",
    "前端展示权益",
    "membershipEntitlementControls",
    "membershipDisplayFeaturesText",
    "team_asset_library",
  ]) {
    assert.match(drawerBlock + script, new RegExp(escapeRegExp(contract)));
  }

  assert.match(drawerBlock, /entitlements:\s*\[[^\]]*"team_asset_library"/s);
  assert.match(payloadBlock, /amountMinor:\s*Math\.round\(amountYuan \* 100\)/);
  assert.match(payloadBlock, /const entitlements = membershipEntitlementsFromForm\(form\)/);
  assert.match(payloadBlock, /membershipDisplayFeaturesFromForm\(form, entitlements\)/);
  assert.match(drawerBlock, /name="seatLimit" type="number" min="0"/);
  assert.match(payloadBlock, /payload\.seatLimit < 0/);
  assert.doesNotMatch(payloadBlock, /payload\.seatLimit < 1/);
  assert.doesNotMatch(drawerBlock, /<span>价格分<\/span>/);
});

test("admin membership entitlement checkboxes stay aligned with their labels", () => {
  assert.match(html, /\.check-grid\s*\{[^}]*display:\s*grid;[^}]*gap:\s*8px;/);
  assert.match(
    html,
    /\.check-option\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;[^}]*min-height:\s*44px;/,
  );
  assert.match(
    html,
    /\.check-option input\s*\{[^}]*order:\s*2;[^}]*width:\s*18px;[^}]*height:\s*18px;[^}]*margin:\s*0;[^}]*padding:\s*0;/,
  );
});

test("admin membership entitlement labels only activate their own checkbox", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  const drawerBlock = script.slice(
    drawerStart,
    script.indexOf("function membershipPlanPayloadFromForm", drawerStart),
  );

  assert.match(
    drawerBlock,
    /<div class="field membership-entitlements-field"><span>具体会员权益<\/span><div class="check-grid">/,
  );
  assert.doesNotMatch(
    drawerBlock,
    /<label class="field"><span>具体会员权益<\/span><div class="check-grid">/,
  );
  assert.match(
    html,
    /\.check-option input:focus\s*\{[^}]*box-shadow:\s*none;/,
  );
  assert.match(
    html,
    /\.check-option input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary\);[^}]*outline-offset:\s*2px;/,
  );
});

test("admin membership tier keeps the experience value but labels it as basic", () => {
  assert.match(script, /return \{ experience: "基础版", professional: "专业版" \}\[tier\]/);
  assert.match(script, /\[\["experience", "基础版"\], \["professional", "专业版"\]\]/);
  assert.doesNotMatch(script, /\[\["experience", "体验版"\], \["professional", "专业版"\]\]/);
});

test("admin membership plan note is edited through display metadata without replacing other keys", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  const drawerBlock = script.slice(
    drawerStart,
    script.indexOf("function membershipPlanPayloadFromForm", drawerStart),
  );
  const payloadBlock = script.slice(
    script.indexOf("function membershipPlanPayloadFromForm"),
    script.indexOf("function parseJsonArrayTextarea"),
  );

  assert.match(script, /function membershipDisplayNoteText\(defaults\)/);
  assert.match(drawerBlock, /<span>前端展示说明<\/span><input name="displayNote"/);
  assert.match(drawerBlock, /membershipDisplayNoteText\(defaults\)/);
  assert.match(payloadBlock, /const displayMetadata = parseJsonTextarea\(form, "displayMetadata"\)/);
  assert.match(payloadBlock, /const displayNote = String\(form\.get\("displayNote"\) \|\| ""\)\.trim\(\)/);
  assert.match(payloadBlock, /if \(displayNote\) displayMetadata\.note = displayNote/);
  assert.match(payloadBlock, /else delete displayMetadata\.note/);
});

test("admin membership recommendation fields preserve unrelated display metadata", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  const drawerBlock = script.slice(
    drawerStart,
    script.indexOf("function membershipPlanPayloadFromForm", drawerStart),
  );
  const payloadBlock = script.slice(
    script.indexOf("function membershipPlanPayloadFromForm"),
    script.indexOf("function parseJsonArrayTextarea"),
  );

  assert.match(script, /function membershipRecommendationLabelText\(defaults\)/);
  assert.match(script, /function membershipIsRecommended\(defaults\)/);
  assert.match(drawerBlock, /<span>推荐标签文字<\/span><input name="recommendationLabel"/);
  assert.match(drawerBlock, /<input type="checkbox" name="isRecommended"/);
  assert.match(payloadBlock, /displayMetadata\.recommendationLabel = recommendationLabel/);
  assert.match(payloadBlock, /delete displayMetadata\.recommendationLabel/);
  assert.match(payloadBlock, /displayMetadata\.isRecommended = true/);
  assert.match(payloadBlock, /delete displayMetadata\.isRecommended/);
  assert.match(payloadBlock, /String\(form\.get\("visibility"\) \|\| "public"\) === "public"/);
});

test("admin only exposes drag ordering for public membership and direct recharge packages", () => {
  const membershipPageBlock = script.slice(
    script.indexOf("function renderMembershipPage"),
    script.indexOf("function renderDirectRechargePage"),
  );
  const directRechargeBlock = script.slice(
    script.indexOf("function renderDirectRechargePage"),
    script.indexOf("function normalizedMembershipBenefitTab"),
  );

  assert.match(html, /\.package-reorder-handle\s*\{[^}]*cursor:\s*grab;/);
  assert.match(membershipPageBlock, /membershipPlanCompare/);
  assert.match(membershipPageBlock, /renderMembershipPlanRow\(plan, activeTab === "public"\)/);
  assert.match(membershipPageBlock, /data-reorder-id="\$\{escapeAttribute\(plan\.id\)\}"/);
  assert.match(membershipPageBlock, /packageReorderHandle\("membership", plan\.id, draggable\)/);
  assert.match(directRechargeBlock, /data-reorder-id="\$\{escapeAttribute\(item\.id\)\}"/);
  assert.match(directRechargeBlock, /packageReorderHandle\("directRecharge", item\.id, true\)/);
});

test("admin drag ordering uses atomic sort-only endpoints and reloads on failure", () => {
  const reorderStart = script.indexOf("function membershipPlanSortOrder");
  const reorderBlock = script.slice(
    reorderStart,
    script.indexOf("function normalizedMembershipBenefitTab", reorderStart),
  );

  assert.match(reorderBlock, /Number\(plan\.displayMetadata\?\.sortOrder\)/);
  assert.match(reorderBlock, /sortOrder: \(index \+ 1\) \* 10/);
  assert.match(reorderBlock, /api\("\/api\/admin\/membership\/plans\/reorder"/);
  assert.match(reorderBlock, /api\("\/api\/admin\/direct-recharge\/packages\/reorder"/);
  assert.match(reorderBlock, /items: changed\.map\(\(\{ item, sortOrder \}\) => \(\{ id: item\.id, sortOrder \}\)\)/);
  assert.match(reorderBlock, /adminIdempotencyKey\("membership-plan-reorder"\)/);
  assert.match(reorderBlock, /adminIdempotencyKey\("direct-recharge-reorder"\)/);
  assert.doesNotMatch(reorderBlock, /function membershipPlanReorderPayload/);
  assert.doesNotMatch(reorderBlock, /function directRechargeReorderPayload/);
  assert.match(reorderBlock, /catch \(error\)[\s\S]*await loadMembershipPlans\(\)/);
  assert.match(reorderBlock, /catch \(error\)[\s\S]*await loadDirectRechargePackages\(\)/);
});

test("admin membership sort fallback matches backend handling for empty metadata", () => {
  const sortBlock = script.slice(
    script.indexOf("function membershipPlanSortOrder"),
    script.indexOf("function membershipPlanCompare"),
  );
  const context = {};

  vm.runInNewContext(`${sortBlock}\nresult = [
    membershipPlanSortOrder({ displayMetadata: { sortOrder: 20 } }),
    membershipPlanSortOrder({ displayMetadata: { sortOrder: "30" } }),
    membershipPlanSortOrder({ displayMetadata: { sortOrder: null } }),
    membershipPlanSortOrder({ displayMetadata: { sortOrder: "" } }),
    membershipPlanSortOrder({ displayMetadata: { sortOrder: "invalid" } }),
    membershipPlanSortOrder({ displayMetadata: {} }),
  ];`, context);

  assert.deepEqual(Array.from(context.result), [
    20,
    30,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  ]);
});

test("admin drag ordering shows feedback after the shell is redrawn", () => {
  const persistBlock = script.slice(
    script.indexOf("async function persistPackageOrder"),
    script.indexOf("function normalizedMembershipBenefitTab"),
  );

  assert.match(persistBlock, /let feedbackMessage = "套餐展示顺序已更新"/);
  assert.match(persistBlock, /catch \(error\)[\s\S]*feedbackMessage = error\.payload/);
  assert.match(persistBlock, /finally \{[\s\S]*renderShell\(\);[\s\S]*\}\s*showToast\(feedbackMessage\)/);
});

test("admin membership plan payload removes unchecked known entitlement display text", () => {
  const payloadBlock = script.slice(
    script.indexOf("function membershipPlanPayloadFromForm"),
    script.indexOf("function parseJsonArrayTextarea"),
  );

  assert.match(script, /function membershipKnownEntitlementLabelMap/);
  assert.match(payloadBlock, /const entitlements = membershipEntitlementsFromForm\(form\)/);
  assert.match(payloadBlock, /membershipDisplayFeaturesFromForm\(form, entitlements\)/);
  assert.match(payloadBlock, /const selectedEntitlementSet = new Set\(selectedEntitlements\)/);
  assert.match(payloadBlock, /membershipKnownEntitlementLabelMap\(\)/);
  assert.match(payloadBlock, /selectedEntitlementSet\.has\(value\)/);
  assert.match(payloadBlock, /knownFeatureLabelToValue\.get\(line\)/);
});

test("admin membership plan drawer warns operators about already configured plans", () => {
  const drawerStart = script.indexOf("function openMembershipPlanDrawer");
  assert.notEqual(drawerStart, -1, "membership drawer exists");
  const drawerBlock = script.slice(drawerStart, script.indexOf("function membershipPlanPayloadFromForm", drawerStart));

  for (const contract of [
    "membershipConfiguredPlanNotice",
    "已配置会员套餐",
    "请配置其他套餐标识",
    "membershipPlanConflictMessage",
    "membership_plan_code_conflict",
    "await loadMembershipPlans()",
    "renderShell()",
  ]) {
    assert.match(drawerBlock + script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin invite reward config form edits the per-invited-user rebate cap", () => {
  const panelStart = script.indexOf("function renderInviteRewardConfigPanel()");
  const bindStart = script.indexOf("function bindInviteRewardConfigForm()");
  const loadStart = script.indexOf("async function loadMembershipPlans()");
  const shellStart = script.indexOf("renderShell = function renderShell() {");
  const shellSecondStart = script.indexOf("renderShell = function renderShell() {", shellStart + 1);
  const shellThirdStart = script.indexOf("renderShell = function renderShell() {", shellSecondStart + 1);
  assert.notEqual(panelStart, -1, "invite reward config panel exists");
  assert.notEqual(bindStart, -1, "invite reward config binder exists");
  assert.notEqual(loadStart, -1, "membership loader exists");
  assert.notEqual(shellSecondStart, -1, "latest standalone render shell exists");
  assert.notEqual(shellThirdStart, -1, "render shell wrapper chain exists");

  const panelBlock = script.slice(panelStart, bindStart);
  const bindBlock = script.slice(bindStart, script.indexOf("function membershipPeriodUnitLabel", bindStart));
  const loadBlock = script.slice(loadStart, panelStart);
  const shellBlock = script.slice(shellSecondStart, shellThirdStart);

  assert.match(panelBlock, /name="perInvitedUserRebateCapMinor"/);
  assert.match(panelBlock, /单个被邀请用户累计返利金额上限/);
  assert.match(loadBlock, /membershipLoadToken/);
  assert.match(loadBlock, /if \(state\.membershipLoadToken !== loadToken\) return;/);
  assert.match(bindBlock, /state\.membershipLoadToken = Number\(state\.membershipLoadToken \|\| 0\) \+ 1;/);
  assert.match(bindBlock, /const saved = await api\("\/api\/admin\/invite-rewards\/config"/);
  assert.match(bindBlock, /state\.inviteRewardConfig = saved\.config \|\| state\.inviteRewardConfig/);
  assert.match(bindBlock, /data\.get\("perInvitedUserRebateCapMinor"\)/);
  assert.match(bindBlock, /perInviterPeriodRebateCapMinor: null/);
  assert.doesNotMatch(bindBlock, /renderShell\(\)/);
  assert.doesNotMatch(bindBlock, /window\.requestAnimationFrame/);
  assert.match(shellBlock, /bindInviteRewardConfigForm\(\);/);
});

test("admin user credit drawer does not expose team user taxonomy", () => {
  assert.match(script, /function openTeamLimitDrawer\(userId\)/);
  assert.match(script, /function renderTeamLimitDrawer/);
  assert.match(script, /function hasSubaccountLimitConfigTarget\(user\)/);
  const actionDrawerBlock = script.slice(
    script.indexOf("function openUserActionDrawer"),
    script.indexOf("function userDrawerHead"),
  );
  assert.doesNotMatch(actionDrawerBlock, /openTeamLimitDrawer/);
  assert.doesNotMatch(actionDrawerBlock, /团队用户/);
  assert.match(script, /api\(`\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/team-plan-limit`\)/);
  assert.match(script, /restoreTeamLimitDefault/);
  assert.match(script, /window\.openTeamLimitDrawer = openTeamLimitDrawer/);
  assert.match(script, /window\.restoreTeamLimitDefault = restoreTeamLimitDefault/);
});

test("admin user credit search filters rows without rerendering the shell input", () => {
  assert.match(script, /id="user-search-input"/);
  assert.match(script, /id="user-table-body"/);
  assert.match(script, /id="user-visible-count"/);
  assert.match(script, /id="user-pagination"/);
  assert.match(script, /function refreshUserTable/);
  assert.match(script, /function renderUserPagination/);
  assert.match(script, /function bindUserFilterControls/);
  assert.match(script, /function scheduleUserKeywordSearch/);
  assert.match(script, /const params = new URLSearchParams\(\{\s*page: String\(Math\.max\(1, Number\(state\.userPage\) \|\| 1\)\),\s*pageSize: String\(Number\(state\.userPageSize\) \|\| 20\),\s*\}\)/);
  assert.match(script, /if \(keyword\) params\.set\("keyword", keyword\)/);
  assert.match(script, /await api\(`\/api\/admin\/users\?\$\{params\.toString\(\)\}`\)/);
  assert.match(script, /state\.userTotal = Number\(result\.meta\?\.total \|\| \(result\.data \|\| \[\]\)\.length \|\| 0\)/);
  assert.match(script, /state\.userPageSize = pageSize/);
  assert.match(script, /state\.userPage = Math\.min\(Math\.max\(1, Number\(result\.meta\?\.page \|\| state\.userPage \|\| 1\)\), totalPages\)/);
  assert.match(script, /addEventListener\("input"/);
  assert.match(script, /refreshUserTable\(\)/);
  assert.match(script, /renderUserPagination\(\)/);
  assert.match(script, /scheduleUserKeywordSearch\(\)/);
  assert.match(script, /setTimeout\(async \(\) =>/);
  assert.doesNotMatch(script, /oninput="updateUserFilter/);
  assert.doesNotMatch(script, /function updateUserFilter\(key, value\) \{[\s\S]*?renderShell\(\);[\s\S]*?\}/);
});

test("admin user credit page uses backend pagination with 20 users per page", () => {
  assert.match(script, /userPage: 1/);
  assert.match(script, /userPageSize: 20/);
  assert.match(script, /function setUserPage\(page\)/);
  assert.match(script, /loadUsers\(\)\.then\(renderShell\)/);
  assert.match(script, /第 \$\{currentPage\} \/ \$\{totalPages\} 页 · 共 \$\{totalCount\} 条/);
  assert.match(script, /onclick="setUserPage\(\$\{currentPage - 1\}\)"/);
  assert.match(script, /onclick="setUserPage\(\$\{currentPage \+ 1\}\)"/);
});

test("admin sms records page uses backend pagination with 20 rows per page", () => {
  assert.match(script, /smsRecordTotal: 0/);
  assert.match(script, /smsRecordPage: 1/);
  assert.match(script, /smsRecordPageSize: 20/);
  assert.match(script, /function setSmsRecordPage\(page\)/);
  assert.match(script, /page: String\(Math\.max\(1, Number\(state\.smsRecordPage\) \|\| 1\)\)/);
  assert.match(script, /pageSize: String\(Number\(state\.smsRecordPageSize\) \|\| 20\)/);
  assert.match(script, /state\.smsRecordTotal = Number\(result\.meta\?\.total \|\| \(result\.data \|\| \[\]\)\.length \|\| 0\)/);
  assert.match(script, /state\.smsRecordPage = Math\.min\(Math\.max\(1, Number\(result\.meta\?\.page \|\| state\.smsRecordPage \|\| 1\)\), totalPages\)/);
  assert.match(script, /state\.smsRecordRange = value \|\| "all";\s*state\.smsRecordPage = 1;/);
  assert.match(script, /onclick="setSmsRecordPage\(\$\{currentPage - 1\}\)"/);
  assert.match(script, /onclick="setSmsRecordPage\(\$\{currentPage \+ 1\}\)"/);
});

test("admin sms records render disabled-provider sends as test records", () => {
  const pageStart = script.indexOf("function smsRecordsPage");
  const pageBlock = script.slice(pageStart, script.indexOf("function setSmsRecordPage", pageStart));

  assert.notEqual(pageStart, -1, "sms records page exists");
  assert.match(pageBlock, /item\.status === "test"/);
  assert.match(pageBlock, /"测试"/);
});

test("admin user credit taxonomy only exposes membership status", () => {
  assert.match(script, /<th>会员状态<\/th>/);
  assert.match(script, /"none", "非会员"/);
  assert.match(script, /"experience", "体验会员"/);
  assert.match(script, /"professional", "专业会员"/);
  assert.match(script, /function userMembershipTierKey/);
  assert.match(script, /function userMembershipStatusLabel/);
  assert.doesNotMatch(script, /普通用户/);
  assert.doesNotMatch(script, /团队用户/);
  assert.doesNotMatch(script, /前端账户类型/);
});

test("admin user management refresh reloads the whole user page", () => {
  assert.match(script, /function refreshUserCreditPage/);
  assert.match(script, /await loadUsers\(\);\s*renderShell\(\);\s*showToast\("用户管理数据已刷新"\)/);
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

test("admin user credit page separates frozen wallet credits from task reservations", () => {
  const rowStart = script.indexOf("function userRow(user)");
  const actionStart = script.indexOf("function openUserActionDrawer");
  const detailStart = script.indexOf("async function openUserDetailDrawer");
  const summaryStart = script.indexOf("function renderCreditSummary");
  assert.notEqual(rowStart, -1, "user row renderer exists");
  assert.notEqual(actionStart, -1, "user action drawer exists");
  assert.notEqual(detailStart, -1, "user detail drawer exists");
  assert.notEqual(summaryStart, -1, "credit summary renderer exists");

  const rowBlock = script.slice(rowStart, actionStart);
  const actionBlock = script.slice(actionStart, script.indexOf("function userDrawerHead", actionStart));
  const detailBlock = script.slice(detailStart, script.indexOf("function openUserProfileDrawer", detailStart));
  const summaryBlock = script.slice(summaryStart, script.indexOf("function modelPayloadFromForm", summaryStart));

  assert.match(rowBlock, /user\.frozenCredits/);
  assert.doesNotMatch(rowBlock, /<td>\$\{Number\(user\.reservedCredits/);
  assert.match(actionBlock, /Number\(user\.frozenCredits \|\| 0\)/);
  assert.match(actionBlock, /任务预占积分/);
  assert.match(actionBlock, /openFrozenCreditRestoreDrawer/);
  assert.match(detailBlock, /Number\(user\?\.frozenCredits \|\| 0\)/);
  assert.match(detailBlock, /任务预占积分/);
  assert.match(summaryBlock, /summary\.frozenCredits/);
  assert.match(summaryBlock, /summary\.userFrozenCredits/);
  assert.match(summaryBlock, /任务预占积分/);
  assert.match(script, /function openFrozenCreditRestoreDrawer\(userId\)/);
  assert.match(script, /\/credits\/frozen\/restore/);
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
    "membership.plan.write",
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

test("admin password change drawer can reveal each password field", () => {
  const drawerStart = script.indexOf("function openPasswordChangeDrawer");
  const drawerBlock = script.slice(drawerStart, script.indexOf("function parseConfigValue", drawerStart));

  assert.notEqual(drawerStart, -1, "password change drawer exists");
  for (const label of ["旧密码", "新密码", "确认新密码"]) {
    assert.match(drawerBlock, new RegExp(`data-password-label="${label}"`));
  }
  assert.equal((drawerBlock.match(/onclick="togglePasswordVisibility\(this\)"/g) || []).length, 3);
  assert.match(script, /function togglePasswordVisibility\(button\)/);
  assert.match(script, /input\.type = reveal \? "text" : "password"/);
  assert.match(script, /button\.setAttribute\("aria-pressed", String\(reveal\)\)/);
});

test("admin protected accounts use self service while ordinary admin controls remain", () => {
  const profileStart = script.indexOf("function openAdminProfileDrawer");
  const profileBlock = script.slice(profileStart, script.indexOf("function openDrawer", profileStart));
  assert.notEqual(profileStart, -1, "admin self profile drawer exists");
  assert.match(profileBlock, /name="loginName"/);
  assert.doesNotMatch(profileBlock, /name="loginName"[^>]*disabled/);
  assert.match(profileBlock, /loginName: String\(form\.get\("loginName"\) \|\| ""\)/);

  const createStart = script.indexOf("function openAdminAccountDrawer");
  const createBlock = script.slice(createStart, script.indexOf("function openAdminAccountEditDrawer", createStart));
  assert.notEqual(createStart, -1, "admin account creation drawer exists");
  assert.doesNotMatch(createBlock, /optionList\(\["super_admin"/);
  for (const ordinaryRole of ["ops_admin", "model_admin", "finance_admin", "support_admin", "audit_viewer"]) {
    assert.match(createBlock, new RegExp(ordinaryRole));
  }

  const rowStart = script.indexOf("function adminAccountRow");
  const rowBlock = script.slice(rowStart, script.indexOf("function compactJson", rowStart));
  assert.notEqual(rowStart, -1, "admin account row renderer exists");
  assert.match(rowBlock, /account\.isProtectedSuperAdmin/);
  assert.match(rowBlock, /受保护超级管理员/);
  assert.match(rowBlock, /openAdminAccountEditDrawer/);
  assert.match(rowBlock, /openAdminAccountPasswordResetDrawer/);
});

test("admin shell routes every sensitive write drawer through the mutation feedback helper", () => {
  for (const formId of [
    "user-profile-form",
    "user-status-form",
    "credit-adjust-form",
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

test("admin agreement status buttons expose pending feedback and failure toasts", () => {
  for (const contract of [
    "state.legalDocumentStatusPendingIds",
    "const pending = Boolean(state.legalDocumentStatusPendingIds[item.id])",
    "data-legal-document-status-button",
    "state.legalDocumentStatusPendingIds[documentId] = true",
    "delete state.legalDocumentStatusPendingIds[documentId]",
    'toastMessage = error.payload?.error?.message || error.message || "\\u534f\\u8bae\\u72b6\\u6001\\u66f4\\u65b0\\u5931\\u8d25"',
    "showToast(toastMessage)",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin agreement editor allows custom type entry and submits current input value", () => {
  for (const contract of [
    'id="legal-document-type-input"',
    "data-legal-type-preset",
    "legalDocumentTypeChoices(defaultType)",
    "legal-document-type-presets",
    "placeholder=\"\\u4f8b\\u5982\\uff1aservice\\u3001privacy\\u3001recharge_terms\"",
    'value: "recharge_terms", label: "付费会员服务协议"',
    'item.type === "recharge_terms" ? "\\u4ed8\\u8d39\\u4f1a\\u5458\\u670d\\u52a1\\u534f\\u8bae"',
    "typeInput?.value",
    "syncTypePresetState",
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

test("admin agreement editor drawer keeps long agreement pages scrollable", () => {
  const drawerRule = html.match(/\.drawer-panel\.legal-document-drawer-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.notEqual(drawerRule, "", "legal document drawer panel style exists");
  assert.match(drawerRule, /overflow-y:\s*auto/);
  assert.match(drawerRule, /overscroll-behavior:\s*contain/);
  assert.doesNotMatch(drawerRule, /overflow:\s*hidden/);
});

test("admin agreement editor action bar stays outside rich text surfaces", () => {
  const editorLayoutRule = html.match(/\.legal-document-editor-layout\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const actionRule = html.match(/\.legal-document-actions\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.notEqual(editorLayoutRule, "", "legal document editor layout style exists");
  assert.notEqual(actionRule, "", "legal document action style exists");
  assert.match(editorLayoutRule, /flex:\s*0 0 auto/);
  assert.match(actionRule, /flex:\s*0 0 auto/);
  assert.match(actionRule, /justify-content:\s*flex-end/);
  assert.match(actionRule, /border-top:\s*1px solid var\(--line\)/);
  assert.doesNotMatch(actionRule, /margin-top:\s*auto/);
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
    ".drawer-resize-handle",
    "setupDrawerInteractions",
    "hydrateDrawerPanel",
    "beginDrawerResize",
    "activeDrawerElement",
    "document.addEventListener(\"pointerdown\"",
    "event.target === drawer",
    "is-drawer-resizing",
    "pointermove",
    "setupDrawerInteractions();",
    "max-height: 100vh",
    "overflow-y: auto",
    "overscroll-behavior: contain",
    ".actions-row",
    "flex-wrap: nowrap",
  ]) {
    assert.match(html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin shell keeps drawers open when the backdrop is clicked", () => {
  assert.doesNotMatch(html, /event\.target === drawer\)\s*closeDrawer\(\)/);
  assert.match(html, /onclick="closeDrawer\(\)">×<\/button>/);
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

test("admin dashboard de-duplicates shared queue metrics", () => {
  assert.match(script, /function dashboardQueueTotals\(models\)/);
  assert.match(script, /const sharedQueue = seenQueues\.has\(queueKey\)/);
  assert.match(script, /sharedQueue \? "共享"/);

  const start = script.indexOf("function dashboardQueueKey");
  const end = script.indexOf("function openDashboardModelHealthDrawer", start);
  const context = { result: null };
  vm.runInNewContext(`${script.slice(start, end)}
    result = dashboardQueueTotals([
      { queueName: "generation-submit-image", queueDepth: 37, failedCount: 177 },
      { queueName: "generation-submit-image", queueDepth: 37, failedCount: 177 },
      { queueName: "generation-submit-video", queueDepth: 5, failedCount: 82 },
    ]);
  `, context);

  assert.equal(context.result.queueDepth, 42);
  assert.equal(context.result.failedCount, 259);
});

test("admin dashboard prioritizes platform health, production flow, and actionable operations", () => {
  for (const contract of [
    "dashboardRefreshNote",
    "dashboardOperationalState",
    "dashboardProductionHtml",
    "dashboardAttentionHtml",
    "dashboardBusinessHtml",
    "创作平台运行控制台",
    "今日生产链路",
    "需要处理",
    "模型与队列",
    "最近管理活动",
    "项目总数",
    "projectsCreatedToday",
    "generationSucceededToday",
    "generationFailedToday",
    "generationInProgressToday",
    "paidOrderAmountTotalMinor",
    "paidOrderAmountMonthMinor",
    "paidOrderAmountTodayMinor",
    "activeMembershipCount",
    "money(",
    "刷新数据",
    "总览已刷新",
    "模型健康已刷新",
    "最近事件已刷新",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }

  assert.doesNotMatch(script + html, /trend-bars/);
  assert.doesNotMatch(script, /function metric\(/);
});

test("admin dashboard exposes live Redis and BullMQ queue health refresh", () => {
  for (const contract of [
    "/api/admin/dashboard/queue-health",
    "loadDashboardQueueHealth",
    "dashboardQueueHealthHtml",
    "刷新健康度",
    "Redis",
    "BullMQ",
    "Redis 命名空间",
    "数据库 outbox 待投递",
    "Dispatcher",
    "运行中",
    "无心跳",
    "Outbox 调度器离线",
    "Outbox 投递卡住",
    "Outbox 超时未投递",
    "生成队列链路中断",
    "等待",
    "执行中",
    "延迟",
    "失败",
  ]) {
    assert.match(script + html, new RegExp(escapeRegExp(contract)));
  }
});

test("admin risk workspace exposes project-aware task, queue, payment, and audit operations", () => {
  for (const contract of [
    "异常任务处置中心",
    "riskWorkspaceSummary",
    "riskWorkspaceContent",
    "riskQueueView",
    "riskTasksView",
    "riskQueuesView",
    "riskPaymentsView",
    "riskRepairsView",
    "riskAuditView",
    "taskOpsActions",
    "openTaskOpsDrawer",
    "openQueueJobDrawer",
    "provider_output_storage_failed",
    "provider_output_download_failed",
    "provider_output_upload_failed",
    "provider_output_persist_failed",
    "/api/admin/ops/tasks/retry-finalize",
    "/api/admin/ops/tasks/retry-persist-asset",
    "/api/admin/ops/tasks/manual-settle",
    "/api/admin/ops/tasks/retry",
    "/api/admin/ops/generation-queues/jobs",
    "释放预占积分，视为未产出",
    "消耗预占积分，确认已有有效产出",
    "从队列移除任务",
    "所有复核、重试、人工结算、队列操作与导出行为均保留记录",
    'data-requires-operation-reason="true"',
    'form?.dataset.requiresOperationReason === "true"',
    'form.dataset.requiresOperationReason === "true"',
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }

  const riskDrawerStart = script.indexOf("function openRiskReviewDrawer");
  const taskDrawerStart = script.indexOf("function openTaskOpsDrawer");
  const paymentDrawerStart = script.indexOf("function openPaymentRepairDrawer");
  assert.match(script.slice(riskDrawerStart, taskDrawerStart), /textarea name="reason"[\s\S]*required/);
  assert.match(script.slice(taskDrawerStart, paymentDrawerStart), /textarea name="reason"[\s\S]*required/);
  assert.match(script.slice(paymentDrawerStart, script.indexOf("function openCreditAdjustDrawer", paymentDrawerStart)), /textarea name="reason"[\s\S]*required/);
});


test("admin prompt manager uses the unified prompt field set", () => {
  const manager = script.slice(
    script.indexOf("const promptManagementTabs"),
    script.indexOf("const promptMarketplaceCategoryLabels"),
  );
  for (const contract of [
    "promptManagerItemsPage",
    "promptManagerItemRow",
    "名称与简介",
    "搜索名称 / 简介 / 正文",
    "官方提示词",
    "用户提示词",
    "设为默认",
    "setOfficialPromptDefault",
  ]) assert.match(manager, new RegExp(escapeRegExp(contract)));
  for (const legacy of [
    "batchImage",
    "<th>编码</th>",
    "模型族",
    "<th>排序</th>",
    "copyPrompt",
    "item.tags",
    "item.code",
    "sort_order",
    "is_default",
    "json_schema",
    "negative_prompt",
  ]) assert.doesNotMatch(manager, new RegExp(escapeRegExp(legacy)));
});

test("admin prompt editors only submit unified prompt fields", () => {
  assert.match(script, /function promptPublishingFields\(item\)[\s\S]*?name="price_credits"[\s\S]*?min="0" max="99999" step="1"[\s\S]*?name="usage_count"[\s\S]*?min="0" max="2147483647" step="1"[\s\S]*?name="is_published"/);
  assert.match(script, /item\?\.price_credits \?\? item\?\.priceCredits \?\? 0/);
  assert.match(script, /item\?\.usage_count \?\? item\?\.usageCount \?\? 0/);
  assert.match(script, /item\?\.is_published \?\? item\?\.isPublished/);
  assert.match(script, /function promptPublishingPayloadFromForm\(form\)[\s\S]*?Number\.isInteger\(priceCredits\)[\s\S]*?priceCredits > 99999[\s\S]*?Number\.isInteger\(usageCount\)[\s\S]*?usageCount > 2147483647[\s\S]*?price_credits: priceCredits[\s\S]*?usage_count: usageCount[\s\S]*?is_published: form\.get\("is_published"\) === "on"/);
  assert.equal((script.match(/\$\{promptPublishingFields\(existing\)\}/g) || []).length, 7);
  assert.equal((script.match(/\.\.\.promptPublishingPayloadFromForm\(form\)/g) || []).length, 7);
  const editorRanges = [
    ["function openScriptPromptPackageDrawer", "async function toggleScriptPromptPackageStatus"],
    ["function openImagePromptStyleDrawer", "async function toggleImagePromptStyleStatus"],
    ["function openCharacterPromptTemplateDrawer", "async function toggleCharacterPromptTemplateStatus"],
    ["function openScenePromptTemplateDrawer", "async function toggleScenePromptTemplateStatus"],
    ["function openPropPromptTemplateDrawer", "async function togglePropPromptTemplateStatus"],
    ["function openShotPromptTemplateDrawer", "async function toggleShotPromptTemplateStatus"],
  ];
  for (const [startMarker, endMarker] of editorRanges) {
    const editor = script.slice(script.indexOf(startMarker), script.indexOf(endMarker));
    for (const field of ["name", "cover_image_url", "remark", "prompt_content", "status", "promptPublishingFields(existing)"]) assert.match(editor, new RegExp(escapeRegExp(field)));
    for (const legacy of ["code:", "stage:", "model_family:", "variables:", "json_schema:", "negative_prompt:", "key_points:", "is_default:", "sort_order:", "localStorage", "Fallback"]) assert.doesNotMatch(editor, new RegExp(escapeRegExp(legacy)));
  }
});

test("admin prompt loading has no legacy fixture or local fallback", () => {
  const loaders = script.slice(
    script.indexOf("async function loadCharacterPromptTemplates"),
    script.indexOf("async function loadSettings"),
  );
  assert.doesNotMatch(loaders, /PromptTemplateFallback|imagePromptStyleFallback|localStorage|model_family|negative_prompt|json_schema|sort_order|is_default/);
  assert.match(loaders, /state\.characterPromptTemplates = \[\]/);
  assert.match(loaders, /state\.scenePromptTemplates = \[\]/);
  assert.match(loaders, /state\.propPromptTemplates = \[\]/);
  assert.match(loaders, /state\.shotPromptTemplates = \[\]/);
});

test("admin prompt manager separates official and user prompts with edit and delete controls", () => {
  for (const contract of [
    'official',
    'private',
    '官方提示词',
    '用户提示词',
    'promptMarketplaceItems',
    'loadPromptMarketplace',
    '/api/admin/prompt-marketplace',
    '/api/admin/prompt-marketplace/items/',
    'promptMarketplacePage',
    'promptCategoryTabs',
    'promptMarketplaceCategoryLabels',
    'promptMarketplaceSource',
    'openPromptMarketplaceItemDrawer',
    '新增官方提示词',
    'deletePromptMarketplaceItem',
    '价格',
    '使用次数',
    '用户提示词正文受保护',
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
  assert.doesNotMatch(html, /提示词广场/);
  assert.match(html, /\.prompt-marketplace-admin\s*\{[\s\S]*?display:\s*block;/);
  assert.match(html, /\.prompt-marketplace-admin\s*>\s*\.section\s*\{[\s\S]*?width:\s*100%;/);
  const marketplace = script.slice(script.indexOf("function promptMarketplacePage"), script.indexOf("function scriptPromptsPage"));
  assert.doesNotMatch(marketplace, /item\.tags|\/ 标签/);
  assert.match(marketplace, /搜索名称 \/ 简介 \/ 发布者/);
  assert.match(script, /全部分类/);
  assert.match(marketplace, /promptCategoryTabs/);
  assert.match(script, /onclick="updatePromptMarketplaceCategory/);
  assert.match(marketplace, /官方提示词管理/);
  assert.match(marketplace, /用户提示词管理/);
  assert.match(script, /params\.set\("source", state\.promptMarketplaceSource\)/);
  assert.match(marketplace, /source === "official" \? item\.official === true : item\.official !== true/);
  assert.match(marketplace, /onclick="openPromptMarketplaceItemDrawer/);
  assert.match(marketplace, /method: existing \? "PATCH" : "POST"/);
  assert.match(marketplace, /name="category"/);
  assert.match(marketplace, /onclick="deletePromptMarketplaceItem/);
  assert.match(marketplace, /method: "DELETE"/);
  assert.match(marketplace, /window\.confirm\(/);
  assert.match(marketplace, /name="prompt_content"/);
  assert.match(marketplace, /promptPublishingPayloadFromForm\(form\)/);
});

test("admin system settings manages a separate enterprise contact qr", () => {
  for (const contract of [
    "客服与商务二维码配置",
    "enterpriseContactImageUrl",
    "enterprise-contact-image-file",
    "enterprise-contact-image-preview",
    "上传商务二维码",
    "/api/admin/settings/assets/uploads",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin model list exposes persisted Canvas Agent compatibility diagnostics", () => {
  for (const contract of [
    "兼容性诊断",
    "modelCompatibilityProbeMarkup",
    "model.compatibilityProbe",
    "探测后才会自动隔离失败模型",
    "已隔离",
    "probeModelCompatibility",
    "/api/admin/models/${encodeURIComponent(modelId)}/probe",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
});

test("admin model editor manages toolbox model availability through uiConfig", () => {
  assert.match(script, /TOOLBOX_TOOL_OPTIONS/);
  assert.match(script, /value: "prompt-reverse"/);
  assert.match(script, /toolboxToolControls\(base\.uiConfig \|\| \{\}\)/);
  assert.match(script, /name="toolboxTools"/);
  assert.match(script, /form\.getAll === "function"/);
  assert.match(script, /uiConfig\.toolboxTools =/);
});

test("admin toolbox menu management edits image and video prompt reverse instructions", () => {
  for (const contract of [
    "TOOLBOX_PROMPT_REVERSE_CONFIG_KEY",
    "toolboxMenuPage",
    "toolboxMenu: \"/admin/toolbox-menu\"",
    "setToolboxMenuTool",
    "video-depth",
    "watermark-removal",
    "imageInstruction",
    "videoInstruction",
    "/api/admin/settings/${encodeURIComponent(TOOLBOX_PROMPT_REVERSE_CONFIG_KEY)}",
    "segmentDurationSeconds",
    "segmentDurationMs",
  ]) {
    assert.match(script, new RegExp(escapeRegExp(contract)));
  }
  assert.doesNotMatch(script, /openToolboxPromptReverseEditor/);
  assert.doesNotMatch(script, /DEFAULT_TOOLBOX_PROMPT_REVERSE_CONFIG/);
  assert.doesNotMatch(script, /帮我拆解这张图片/);
});

test("admin shared settings loader clears the standalone toolbox page loading state", () => {
  const loader = script.slice(script.indexOf("function ensureAdminPageData"), script.indexOf("function preloadAdminShellData"));
  assert.match(loader, /setPageLoading\(page, false\);/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
