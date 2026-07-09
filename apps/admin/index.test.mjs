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
    "/api/admin/models",
    "/api/admin/users",
    "/api/admin/settings",
    "/api/admin/admin-accounts",
    "/api/admin/risks",
    "/api/admin/exports/risks.csv",
    "/api/admin/audit-events",
    "/api/admin/exports/audit-events.csv",
    "/api/admin/sms-records",
    "/api/admin/resources",
    "/api/admin/resources/summary",
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
    "riskStatus=",
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

test("secret reference purpose is optional and hidden from the settings list row", () => {
  assert.match(script, /name="purpose" rows="4" placeholder=/);
  assert.doesNotMatch(script, /name="purpose" rows="4" required/);
  assert.doesNotMatch(script, /secretReferenceRow\(secret\)[\s\S]*secret\.purpose/);
  assert.match(script, /name="requestDomain"/);
  assert.match(script, /secret\.requestDomain \|\| secret\.baseUrl/);
  assert.match(script, /\\u8bf7\\u6c42\\u57df\\u540d/);
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
    "globalaiopc_video",
    "global_ai_opc_image",
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
  assert.match(script, /providerProtocol: fixed\.providerProtocol/);
  assert.match(script, /invocationMode: fixed\.invocationMode/);
  assert.match(script, /taskModes = kind\.mediaType === "video" \? resolveVideoTaskModes\(kind, existing\) : kind\.taskModes/);
});

test("admin user management table keeps profile edit inside the action drawer", () => {
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
  assert.match(actionDrawerBlock, /onclick="openUserProfileDrawer\('\$\{user\.userId\}'\)"/);
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
    /openUserModelRequestDrawer\(userId\)[\s\S]*userDrawerHead\("模型记录", userId\)/,
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
});

test("admin user detail drawer loads model request records for the selected user", () => {
  assert.match(script, /正在加载模型记录/);
  assert.match(script, /\/api\/admin\/users\/\$\{userId\}\/model-requests\?\$\{params\.toString\(\)\}/);
  assert.match(script, /renderUserModelRequestPanel/);
  assert.match(script, /const requestContent = renderModelRequestContent\(item\);/);
  assert.match(script, /Object\.keys\(requestBody\)\.length > 0/);
  assert.match(script, /return JSON\.stringify\(requestBody, null, 2\);/);
  assert.match(script, /模型记录/);
  assert.match(script, /只看视频模型/);
  assert.match(script, /只看图片模型/);
  assert.match(script, /只看文本模型/);
  assert.match(script, /<th>模型名称<\/th><th>积分消耗<\/th><th>请求内容<\/th><th>返回内容<\/th><th>请求时间<\/th>/);
  assert.match(script, /changeUserModelRequestFilter/);
  assert.match(script, /changeUserModelRequestPage/);
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
  assert.match(script, /user\?\.organizationName === "Personal Creator Workspace"/);
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

test("admin invite reward config form keeps both rebate caps and saves from the POST response", () => {
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

  assert.match(panelBlock, /perInvitedUserRebateCapMinor/);
  assert.match(panelBlock, /perInviterPeriodRebateCapMinor/);
  assert.match(panelBlock, /单邀请人周期返利金额上限/);
  assert.match(loadBlock, /membershipLoadToken/);
  assert.match(loadBlock, /if \(state\.membershipLoadToken !== loadToken\) return;/);
  assert.match(bindBlock, /state\.membershipLoadToken = Number\(state\.membershipLoadToken \|\| 0\) \+ 1;/);
  assert.match(bindBlock, /const saved = await api\("\/api\/admin\/invite-rewards\/config"/);
  assert.match(bindBlock, /state\.inviteRewardConfig = saved\.config \|\| state\.inviteRewardConfig/);
  assert.match(bindBlock, /perInviterPeriodRebateCapMinor/);
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
  assert.match(script, /api\(`\/api\/admin\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/team-plan-limit`\)/);
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
  assert.match(summaryBlock, /summary\.organizationFrozenCredits/);
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

test("admin agreement editor allows custom type entry and submits current input value", () => {
  for (const contract of [
    'id="legal-document-type-input"',
    "data-legal-type-preset",
    "legalDocumentTypeChoices(defaultType)",
    "legal-document-type-presets",
    "placeholder=\"\\u4f8b\\u5982\\uff1aservice\\u3001privacy\\u3001recharge_terms\"",
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

test("admin dashboard exposes trend feedback and partial refresh copy", () => {
  for (const contract of [
    "dashboardRefreshNote",
    "dashboardTrendHtml",
    "trend-bars",
    "总览趋势",
    "用户统计",
    "活跃用户统计",
    "总订单金额统计",
    "月订单金额统计",
    "当天订单金额统计",
    "会员统计",
    "积分消耗统计",
    "paidOrderAmountTotalMinor",
    "paidOrderAmountMonthMinor",
    "paidOrderAmountTodayMinor",
    "activeMembershipCount",
    "money(",
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
    "batchImagePromptTarget",
    "batchImagePromptKeywords",
    "script",
    "image",
    "batchImage",
    "剧本提示词",
    "生图题词",
    "批量生图提示词",
    "人物提示词",
    "场景提示词",
    "分镜提示词",
    "promptManagementTabs",
    "batchImagePromptTargets",
    "batchImagePromptTemplatesPage",
    "loadBatchImagePromptTemplates",
    "saveBatchImagePromptTemplates",
    "batchImagePromptTemplatesFromSettings",
    "batchImagePromptTemplateRow",
    "batchImagePromptTemplateById",
    "openBatchImagePromptTemplateDrawer",
    "openBatchCharacterPromptTemplateDrawer",
    "openBatchScenePromptTemplateDrawer",
    "openBatchPropPromptTemplateDrawer",
    "copyBatchImagePromptTemplate",
    "moveBatchImagePromptTemplate",
    "batchImagePromptPreview",
    "creator.batch_image_prompt_preset_categories",
    "batchImagePromptPresetCategoriesConfigKey",
    "batchImagePromptPresetCategories",
    "batchImagePromptLoadError",
    "updateBatchImagePromptTarget",
    "updateBatchImagePromptKeyword",
    "batchImagePromptScope",
    "角色",
    "场景",
    "道具",
    "scriptPromptPackages",
    "imagePromptStyles",
    "imagePromptStyleFallback",
    "normalizeImagePromptStyle",
    "normalizedImagePromptCategory",
    "batchImagePromptStyleCodes",
    "batchImagePromptStyleNames",
    "loadPromptManagement",
    "loadScriptPrompts",
    "loadImagePromptStyles",
    "/api/admin/storyboard-prompt/packages",
    "/api/admin/batch-image-prompt-presets",
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
    "batch",
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
    "national_xia",
    "brother_style",
    "chinese_wuxia",
    "china_ancient",
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
    "国风仙侠",
    "废土科幻",
    "国风3D",
    "中国古代国风动漫",
    "批量生图样式",
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
  assert.match(script, /{ key: "shot", label: "分镜提示词"[\s\S]*{ key: "batchImage", label: "批量生图提示词"/);
  assert.doesNotMatch(script, /个视角预设|batchImagePromptPresetCount/);
  assert.doesNotMatch(script, /openCharacterPromptTemplateDrawer\(\)" .*新增角色提示词/);
  assert.match(script, /function batchImagePromptTemplatesPage\(\)[\s\S]*?<th>名称<\/th><th>编码<\/th><th>排序<\/th><th class="actions">操作<\/th>/);
  assert.match(script, /function openBatchCharacterPromptTemplateDrawer\([\s\S]*?return openBatchImagePresetDrawer\("character"/);
  assert.match(script, /function openBatchScenePromptTemplateDrawer\([\s\S]*?return openBatchImagePresetDrawer\("scene"/);
  assert.match(script, /function openBatchPropPromptTemplateDrawer\([\s\S]*?return openBatchImagePresetDrawer\("prop"/);
  assert.match(script, /function openBatchImagePresetDrawer\([\s\S]*?编辑\$\{title\}预设[\s\S]*?<span>名称<\/span>[\s\S]*?<span>编码<\/span>[\s\S]*?<span>正文内容<\/span><textarea name="prompt_content"/);
  assert.match(script, /function batchImagePromptTemplatePayloadItem\([\s\S]*?prompt_content: promptContent/);
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
    "{{story_text}}",
    "long_story_precise_breakdown",
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

test("admin script prompt default action marks taboo packages as global defaults", () => {
  for (const contract of [
    "const isTaboo = (existing.package_type || existing.packageType) === \"taboo\"",
    "payload.is_default = Boolean(existing.is_default || existing.isDefault)",
    "is_global_default: isTaboo",
    "isGlobalDefault: isTaboo",
    "payload.is_global_default = Boolean(existing.is_global_default || existing.isGlobalDefault)",
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
    "result.meta?.total",
    "page_size: String(Number(state.imagePromptPageSize || 500))",
    "if (normalizedCategory !== \"all\") params.set(\"category\", normalizedCategory)",
    "state.imagePromptStyles = []",
    "state.imagePromptTotal = 0",
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
