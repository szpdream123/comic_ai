# GEO Mainstream Platform Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让灵曦AI后台管理员能够从统一目录选择 11 个国内主流大模型与 AI 搜索平台，并将选择结果保存、展示在现有 GEO 问题上。

**Architecture:** 后端 GEO 模块新增纯只读平台注册表，管理端通过受现有 `geoManage` 权限保护的接口取得完整目录。现有 `targetPlatforms: string[]` 和数据库字段保持不变；后台只从目录中的启用项生成复选框，用完整目录映射历史标签，未知 ID 原样展示。

**Tech Stack:** TypeScript、Node.js HTTP server、`node:test`、单文件原生 HTML/CSS/JavaScript 管理后台

## Global Constraints

- 平台 ID 固定为 `deepseek`、`doubao`、`baidu`、`yuanbao`、`kimi`、`tongyi`、`zhipu`、`xinghuo`、`quark`、`metaso`、`nami`。
- `baidu` 展示名称固定为“百度文心助手”。
- 第一阶段全部平台 `enabled=true`、`defaultSelected=true`。
- 不修改数据库结构、现有方法签名、`targetPlatforms: string[]` 接口类型或全局配置。
- 不接入第三方账号、API、模拟登录、定时监测或 COS/对象存储。
- 后端兼容空数组和未知平台 ID；只有管理员新建表单要求至少选择一个。
- 未知历史平台 ID 必须原样显示，不能静默删除。
- `.env` 不纳入任何提交。

---

### Task 1: 只读平台注册表

**Files:**
- Create: `apps/backend/src/modules/geo/geo-platforms.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-platforms.spec.ts`

**Interfaces:**
- Produces: `GeoPlatform`，字段为 `id: string`、`label: string`、`group: "general_model" | "ai_search"`、`enabled: boolean`、`defaultSelected: boolean`。
- Produces: `listGeoPlatforms(): readonly GeoPlatform[]`，每次返回稳定顺序的完整目录。

- [ ] **Step 1: 写平台注册表失败测试**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listGeoPlatforms } from "../geo-platforms.ts";

describe("GEO platform registry", () => {
  it("returns the stable domestic model and AI search catalog", () => {
    const platforms = listGeoPlatforms();
    assert.deepEqual(platforms.map((item) => item.id), [
      "deepseek", "doubao", "baidu", "yuanbao", "kimi", "tongyi",
      "zhipu", "xinghuo", "quark", "metaso", "nami",
    ]);
    assert.equal(platforms.find((item) => item.id === "baidu")?.label, "百度文心助手");
    assert.equal(new Set(platforms.map((item) => item.id)).size, 11);
    assert.ok(platforms.every((item) => item.enabled && item.defaultSelected));
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --import tsx --test apps/backend/src/modules/geo/tests/geo-platforms.spec.ts`

Expected: FAIL，错误包含 `Cannot find module '../geo-platforms.ts'`。

- [ ] **Step 3: 写最小平台注册表实现**

```ts
export type GeoPlatform = {
  id: string;
  label: string;
  group: "general_model" | "ai_search";
  enabled: boolean;
  defaultSelected: boolean;
};

const GEO_PLATFORMS = [
  { id: "deepseek", label: "DeepSeek", group: "general_model", enabled: true, defaultSelected: true },
  { id: "doubao", label: "豆包", group: "general_model", enabled: true, defaultSelected: true },
  { id: "baidu", label: "百度文心助手", group: "general_model", enabled: true, defaultSelected: true },
  { id: "yuanbao", label: "腾讯元宝", group: "general_model", enabled: true, defaultSelected: true },
  { id: "kimi", label: "Kimi", group: "general_model", enabled: true, defaultSelected: true },
  { id: "tongyi", label: "通义", group: "general_model", enabled: true, defaultSelected: true },
  { id: "zhipu", label: "智谱清言", group: "general_model", enabled: true, defaultSelected: true },
  { id: "xinghuo", label: "讯飞星火", group: "general_model", enabled: true, defaultSelected: true },
  { id: "quark", label: "夸克AI", group: "ai_search", enabled: true, defaultSelected: true },
  { id: "metaso", label: "秘塔AI搜索", group: "ai_search", enabled: true, defaultSelected: true },
  { id: "nami", label: "纳米AI搜索", group: "ai_search", enabled: true, defaultSelected: true },
] as const satisfies readonly GeoPlatform[];

export function listGeoPlatforms(): readonly GeoPlatform[] {
  return GEO_PLATFORMS;
}
```

- [ ] **Step 4: 运行平台注册表测试并确认通过**

Run: `node --import tsx --test apps/backend/src/modules/geo/tests/geo-platforms.spec.ts`

Expected: PASS，1 test，0 failures。

- [ ] **Step 5: 提交平台注册表**

```powershell
git add -- apps/backend/src/modules/geo/geo-platforms.ts apps/backend/src/modules/geo/tests/geo-platforms.spec.ts
git commit -m "feat: add GEO platform registry"
```

### Task 2: 超级管理员平台目录接口

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts:18128-18149`
- Modify: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts:34-51`

**Interfaces:**
- Consumes: `listGeoPlatforms(): readonly GeoPlatform[]` from Task 1.
- Produces: authenticated `GET /api/admin/geo/platforms` response `{ data: GeoPlatform[] }`，沿用 `adminRouteRoles.geoManage`。

- [ ] **Step 1: 在现有 HTTP 流程测试中先请求目录并断言契约**

在匿名请求处增加 `/api/admin/geo/platforms` 的 `401` 断言，在 `ops_admin` 处增加 `403` 断言，并在超级管理员服务器中加入：

```ts
const platformsResponse = await fetch(`${server.origin}/api/admin/geo/platforms`, { headers: { cookie } });
const platforms = await platformsResponse.json();
assert.equal(platformsResponse.status, 200, JSON.stringify(platforms));
assert.deepEqual(platforms.data.map((item: { id: string }) => item.id), [
  "deepseek", "doubao", "baidu", "yuanbao", "kimi", "tongyi",
  "zhipu", "xinghuo", "quark", "metaso", "nami",
]);
assert.equal(platforms.data.find((item: { id: string }) => item.id === "baidu")?.label, "百度文心助手");
```

- [ ] **Step 2: 运行精确 HTTP 测试并确认 404 失败**

Run: `node --import tsx --test --test-name-pattern="restricts GEO operations" apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

Expected: FAIL，超级管理员平台请求状态为 `404` 而不是 `200`。

- [ ] **Step 3: 注册只读路由**

在服务入口导入 `listGeoPlatforms`，在 GEO 权限检查之后、问题路由之前加入：

```ts
if (request.method === "GET" && pathname === "/api/admin/geo/platforms") {
  return writeJson(response, { status: 200, body: { data: listGeoPlatforms() } });
}
```

- [ ] **Step 4: 运行精确 HTTP 测试并确认通过**

Run: `node --import tsx --test --test-name-pattern="restricts GEO operations" apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

Expected: PASS，目标测试通过且无警告。

- [ ] **Step 5: 提交平台目录接口**

```powershell
git add -- apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
git commit -m "feat: expose GEO platforms to super admins"
```

### Task 3: 后台平台多选与历史标签

**Files:**
- Modify: `apps/admin/index.html:13545-13626`
- Modify: `apps/admin/index.test.mjs:6-18`

**Interfaces:**
- Consumes: `GET /api/admin/geo/platforms` and `GeoPlatform` JSON fields from Task 2.
- Produces: `geoPlatformPicker()` grouped checkbox HTML、`geoPlatformTags(ids)` label HTML，以及 `geoCreateQuestion(event)` 提交当前勾选的 `targetPlatforms`。

- [ ] **Step 1: 写后台行为失败测试**

在 `apps/admin/index.test.mjs` 新增以下测试。它执行真实的渲染与提交函数，而不是只匹配源码：

```js
test("admin GEO platform picker submits selections and preserves unknown labels", async () => {
  const helperSource = script.slice(
    script.indexOf("const geoPlatformGroups"),
    script.indexOf("function geoQualityCounts"),
  );
  const submitSource = script.slice(
    script.indexOf("async function geoCreateQuestion"),
    script.indexOf("async function geoCreateEvidence"),
  );
  const requests = [];
  const result = {};
  const context = {
    result,
    requests,
    Date,
    escapeHtml: (value) => String(value),
    escapeAttribute: (value) => String(value),
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) { return this.form.values[name] ?? null; }
      getAll(name) { return this.form.values[name] ?? []; }
    },
    api: async (path, options) => {
      requests.push({ path, payload: JSON.parse(options.body) });
      return { data: {} };
    },
    runAdminMutation: async (_form, _error, operation) => operation(),
    loadGeoOperations: async () => undefined,
    renderShell: () => undefined,
  };
  vm.runInNewContext(`${helperSource}\n${submitSource}\nresult.picker = geoPlatformPicker; result.tags = geoPlatformTags; result.create = geoCreateQuestion;`, context);

  const platforms = [
    { id: "deepseek", label: "DeepSeek", group: "general_model", enabled: true, defaultSelected: true },
    { id: "baidu", label: "百度文心助手", group: "general_model", enabled: true, defaultSelected: true },
    { id: "quark", label: "夸克AI", group: "ai_search", enabled: true, defaultSelected: true },
  ];
  const picker = result.picker(platforms);
  assert.match(picker, /综合大模型/);
  assert.match(picker, /AI搜索/);
  assert.match(picker, /name="targetPlatforms"/);
  assert.match(picker, /value="baidu" checked/);
  const tags = result.tags(["baidu", "legacy-platform"], platforms);
  assert.match(tags, /百度文心助手/);
  assert.match(tags, /legacy-platform/);

  const error = { textContent: "" };
  const form = {
    values: { rawQuestion: "问题", topic: "主题", intent: "tutorial", priority: "80", targetPlatforms: ["deepseek", "quark"] },
    querySelector: () => error,
    reset: () => undefined,
  };
  await result.create({ preventDefault() {}, currentTarget: form });
  assert.equal(requests[0].path, "/api/admin/geo/questions");
  assert.deepEqual(Array.from(requests[0].payload.targetPlatforms), ["deepseek", "quark"]);

  requests.length = 0;
  form.values.targetPlatforms = [];
  await result.create({ preventDefault() {}, currentTarget: form });
  assert.equal(requests.length, 0);
  assert.equal(error.textContent, "至少选择一个目标平台");
});
```

- [ ] **Step 2: 运行后台 UI 测试并确认因平台函数缺失而失败**

Run: `npm run test:admin:ui`

Expected: FAIL，错误指向 `geoPlatformPicker` 或缺少 `/api/admin/geo/platforms`。

- [ ] **Step 3: 实现目录加载、分组多选、标签与提交校验**

在状态对象加入 `platforms: []`，在 `loadGeoOperations()` 的 `Promise.all` 中请求 `api("/api/admin/geo/platforms")`，并把 `platforms.data || []` 保存到状态。随后在 `geoQualityCounts` 之前加入：

```js
const geoPlatformGroups = [
  { id: "general_model", label: "综合大模型" },
  { id: "ai_search", label: "AI搜索" },
];

function geoPlatformPicker(platforms) {
  const enabled = (platforms || []).filter((item) => item.enabled === true);
  return `<fieldset class="geo-platform-picker"><legend>目标平台</legend><p class="metric-note">选择希望内容重点覆盖的大模型与 AI 搜索平台，至少选择一个。</p><div class="geo-platform-groups">${geoPlatformGroups.map((group) => `<section class="geo-platform-group"><strong>${escapeHtml(group.label)}</strong><div class="geo-platform-options">${enabled.filter((item) => item.group === group.id).map((item) => `<label class="checkbox-row"><input type="checkbox" name="targetPlatforms" value="${escapeAttribute(item.id)}" ${item.defaultSelected ? "checked" : ""} />${escapeHtml(item.label)}</label>`).join("")}</div></section>`).join("")}</div></fieldset>`;
}

function geoPlatformTags(ids, platforms) {
  const labels = new Map((platforms || []).map((item) => [item.id, item.label]));
  const values = Array.isArray(ids) ? ids : [];
  return values.length ? `<div class="geo-platform-tags">${values.map((id) => `<span class="tag">${escapeHtml(labels.get(id) || id)}</span>`).join("")}</div>` : "";
}
```

在问题列表调用 `geoPlatformTags(item.targetPlatforms, store.platforms)`；在新增问题表单加入 `${geoPlatformPicker(store.platforms)}` 和 `<div class="form-error" role="alert"></div>`。提交函数改为：

```js
const targetPlatforms = data.getAll("targetPlatforms").map(String).filter(Boolean);
const error = form.querySelector(".form-error") || { textContent: "" };
if (!targetPlatforms.length) {
  error.textContent = "至少选择一个目标平台";
  return;
}
await runAdminMutation(form, error, () => api("/api/admin/geo/questions", {
  method: "POST",
  headers: { "idempotency-key": `admin-ui-geo-question-${Date.now()}` },
  body: JSON.stringify({
    rawQuestion: data.get("rawQuestion"), topic: data.get("topic"), intent: data.get("intent"),
    priority: Number(data.get("priority")), targetPlatforms, productCapabilities: [], notes: "",
  }),
}), "问题已新增");
```

问题列表在主题/意图下增加 `${geoPlatformTags(item.targetPlatforms)}`。新增问题表单加入带 `<fieldset>`、`<legend>` 和显式 `<label>` 的两组复选框，默认勾选 `defaultSelected=true` 的启用项；使用现有颜色、边框与间距变量，并在窄屏下变为单列。

- [ ] **Step 4: 运行后台 UI 测试并确认通过**

Run: `npm run test:admin:ui`

Expected: PASS，新增行为测试与既有 110 项均通过。

- [ ] **Step 5: 运行 GEO 注册表及精确 HTTP 回归**

```powershell
node --import tsx --test apps/backend/src/modules/geo/tests/geo-platforms.spec.ts
node --import tsx --test --test-name-pattern="restricts GEO operations" apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
```

Expected: 两条命令均 PASS。

- [ ] **Step 6: 提交后台平台选择**

```powershell
git add -- apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat: select GEO target platforms in admin"
```

### Task 4: 完整验收与变更边界检查

**Files:**
- Verify only: all files changed by Tasks 1-3

**Interfaces:**
- Consumes: all feature behavior from Tasks 1-3.
- Produces: 可交付的已验证分支，不产生额外业务接口或配置改动。

- [ ] **Step 1: 运行全部相关自动测试**

```powershell
npm run test:admin:ui
node --import tsx --test apps/backend/src/modules/geo/tests/geo-platforms.spec.ts
node --import tsx --test --test-name-pattern="restricts GEO operations" apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
```

Expected: 全部 PASS，0 failures。

- [ ] **Step 2: 检查差异和工作区边界**

```powershell
git diff --check HEAD~3..HEAD
git status --short
git log -4 --oneline
```

Expected: 无 diff 格式错误；`.env` 仍为用户既有未提交改动；提交中不包含 COS、对象存储或数据库迁移文件。

- [ ] **Step 3: 启动本地验收服务并验证页面**

Run: `npm run dev:background:start`

Expected: 服务按项目 `.env` 启动；若连接失败，直接报告对应服务和 `.env` 键，不回退到其他连接。

- [ ] **Step 4: 浏览器人工检查**

打开项目启动日志给出的后台地址，使用密码登录 `/api/auth/password/login` 准备登录态，检查 320px、768px、1024px、1440px 下的平台分组、键盘勾选、空选择错误、问题标签及无控制台错误。
