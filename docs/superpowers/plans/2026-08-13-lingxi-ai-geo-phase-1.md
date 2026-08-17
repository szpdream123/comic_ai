# 灵曦AI GEO 阶段一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有超级管理员后台中交付一个可试用的GEO内容闭环：问题与证据管理、AI结构化生成与质检、人工审核发布、站外待发布稿、公开服务端页面和动态站点地图。

**Architecture:** 新增独立 `geo` 后端模块保存问题、证据、内容主记录、不可变版本和生成记录；现有文本模型网关负责写作与审查，确定性校验器负责品牌、证据、结构和安全阻断。管理接口继续由现有后台会话保护，公开文章走不加载工作台脚本的独立服务端模板，避免已登录用户被重定向。

**Tech Stack:** Node.js、TypeScript、PostgreSQL、现有 `SqlDatabase`、现有 `TextModelGatewayService`/`TextChatGatewayLike`、原生HTML/CSS/JavaScript后台、Node test runner。

## Global Constraints

- 对外唯一品牌名称为“灵曦AI”，不得生成或展示“灵曦剧场”旧称。
- 所有GEO后台页面与 `/api/admin/geo/*` 接口仅允许 `super_admin`。
- 模型任务只能创建草稿，任何发布都必须由超级管理员明确操作。
- 未审核、已过期或不允许公开的证据不能支持具体事实。
- 不读取或发送私人项目、用户素材、手机号、账号、模型密钥和后台凭据。
- 不自动登录或发布到DeepSeek、豆包、Kimi、腾讯元宝、夸克、知乎、小红书、B站和微信公众号。
- 保持现有方法签名、对外接口、业务数据结构和全局配置不变；新增能力使用独立接口和数据结构。
- 原有参数校验、异常捕获和边界兜底只增不减，不做无关重构。
- 测试登录只允许 `/api/auth/password/login`；本计划的后台测试优先复用独立管理员会话助手，不调用短信验证码链路。
- 运行时服务连接只读取项目 `.env`；本计划测试使用现有迁移测试数据库，不打印 `.env` 内容。

## File Structure

### 新增文件

- `packages/db/migrations/20260905-create-geo-operations.sql`：阶段一GEO表、约束和索引。
- `apps/backend/src/modules/geo/geo-types.ts`：受控正文、质量结果和公共DTO类型。
- `apps/backend/src/modules/geo/geo-content-validator.ts`：确定性内容校验、敏感信息和证据约束。
- `apps/backend/src/modules/geo/geo-public-renderer.ts`：安全HTML、结构化数据和公开列表/详情渲染。
- `apps/backend/src/modules/geo/geo-content.service.ts`：问题、证据、版本、审核、发布、回滚和公开读取。
- `apps/backend/src/modules/geo/geo-generation.service.ts`：生成资料包、模型调用、模型审查和生成记录。
- `apps/backend/src/modules/geo/tests/geo-schema.spec.ts`：迁移与基线注册测试。
- `apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts`：确定性阻断与警告测试。
- `apps/backend/src/modules/geo/tests/geo-content.service.spec.ts`：领域状态流和原子切换测试。
- `apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts`：模型成功、失败和结构错误测试。
- `apps/web/geo-public.html`：不加载应用脚本的公开内容HTML模板。
- `apps/web/geo-public.css`：公开教程、案例、报告和问答样式。

### 修改文件

- `packages/db/baseline/user-centric-schema.sql`：加入阶段一GEO表、索引和约束。
- `apps/backend/src/modules/shared/db/migrations.ts`：注册 `20260905-create-geo-operations.sql`。
- `scripts/migrate-user-scope.mjs`：将迁移加入正式迁移清单。
- `apps/backend/src/entrypoints/phone-auth-dev-server.ts`：接入GEO管理员API、公开内容路由和动态站点地图。
- `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`：验证超级管理员接口闭环和其他角色拒绝。
- `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`：验证公开列表/详情、已登录访问、结构化数据和站点地图。
- `apps/admin/index.html`：增加仅超级管理员可见的GEO运营页面和操作抽屉。
- `apps/admin/index.test.mjs`：验证GEO菜单、接口和人工发布交互契约。

---

### Task 1: GEO 数据库结构与迁移注册

**Files:**
- Create: `packages/db/migrations/20260905-create-geo-operations.sql`
- Create: `apps/backend/src/modules/geo/tests/geo-schema.spec.ts`
- Modify: `packages/db/baseline/user-centric-schema.sql`
- Modify: `apps/backend/src/modules/shared/db/migrations.ts`
- Modify: `scripts/migrate-user-scope.mjs`

**Interfaces:**
- Produces: `geo_questions`、`geo_evidence_items`、`geo_content_items`、`geo_content_versions`、`geo_content_question_links`、`geo_content_evidence_links`、`geo_generation_runs`、`geo_audit_events`。
- Consumes: 现有 `admin_accounts(id)` 外键和 `app_schema_migrations` 迁移机制。

- [ ] **Step 1: 写迁移注册失败测试**

在 `geo-schema.spec.ts` 中读取基线和迁移清单，明确断言：

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadCurrentSchemaSql, loadSqlMigrations } from "../../shared/db/migrations.ts";

describe("GEO operations schema", () => {
  it("registers the GEO migration and keeps ownership out of GEO tables", async () => {
    const [schemaSql, migrations] = await Promise.all([
      loadCurrentSchemaSql(),
      loadSqlMigrations(),
    ]);
    const migration = migrations.find((item) => item.name === "20260905-create-geo-operations.sql");
    assert.ok(migration);
    for (const sql of [schemaSql, migration.sql]) {
      for (const table of [
        "geo_questions", "geo_evidence_items", "geo_content_items",
        "geo_content_versions", "geo_content_question_links",
        "geo_content_evidence_links", "geo_generation_runs", "geo_audit_events",
      ]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS [\\\" ]*${table}`));
      assert.doesNotMatch(sql, /geo_[\s\S]{0,200}(team_id|project_id|subaccount_id|legacy_owner)/i);
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-schema.spec.ts`

Expected: FAIL，提示找不到 `20260905-create-geo-operations.sql`。

- [ ] **Step 3: 编写最小迁移**

迁移必须使用UUID主键、`timestamptz`、JSONB默认值和数据库检查约束。核心定义如下，完整文件为每张表补齐外键和索引：

```sql
CREATE TABLE IF NOT EXISTS geo_questions (
  id uuid PRIMARY KEY,
  raw_question text NOT NULL,
  normalized_question text NOT NULL,
  topic text NOT NULL,
  intent text NOT NULL,
  target_platforms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  product_capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_status text NOT NULL DEFAULT 'uncovered'
    CHECK (coverage_status IN ('uncovered', 'drafted', 'covered')),
  notes text NOT NULL DEFAULT '',
  last_monitored_at timestamptz,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_question)
);

CREATE TABLE IF NOT EXISTS geo_content_items (
  id uuid PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('guide', 'case', 'report', 'answer')),
  topic text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  current_draft_version_id uuid,
  current_published_version_id uuid,
  lock_version integer NOT NULL DEFAULT 1,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, slug)
);
```

`geo_content_versions` 使用 `(content_item_id, version_number)` 唯一约束并保存 `document_json`、`faq_json`、`seo_json`、`social_drafts_json`、`quality_report_json` 和 `config_revision_id`。两个关联表引用版本而不是只引用内容主记录。`geo_generation_runs` 使用 `queued/running/succeeded/failed/canceled` 检查约束。`geo_audit_events` 保存管理员、事件、目标、原因和JSON元数据。

- [ ] **Step 4: 注册迁移并同步基线**

在 `migrations.ts` 增加：

```ts
const GEO_OPERATIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260905-create-geo-operations.sql"];
```

并在迁移数组尾部追加同名项；在 `migrate-user-scope.mjs` 的迁移数组尾部追加：

```js
["20260905-create-geo-operations.sql", "packages/db/migrations/20260905-create-geo-operations.sql"],
```

把迁移的表、约束和索引同步写入 `user-centric-schema.sql`，不运行会重写整个基线的生成器。

- [ ] **Step 5: 运行迁移测试**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-schema.spec.ts apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts`

Expected: PASS。

- [ ] **Step 6: 提交数据库任务**

```bash
git add packages/db/migrations/20260905-create-geo-operations.sql packages/db/baseline/user-centric-schema.sql apps/backend/src/modules/shared/db/migrations.ts scripts/migrate-user-scope.mjs apps/backend/src/modules/geo/tests/geo-schema.spec.ts
git commit -m "feat(geo): add operations schema"
```

### Task 2: 受控正文类型、确定性校验与安全渲染

**Files:**
- Create: `apps/backend/src/modules/geo/geo-types.ts`
- Create: `apps/backend/src/modules/geo/geo-content-validator.ts`
- Create: `apps/backend/src/modules/geo/geo-public-renderer.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts`

**Interfaces:**
- Produces: `GeoDocument`、`GeoQualityReport`、`validateGeoDraft(input)`、`renderGeoArticle(input)`、`renderGeoListing(input)`。
- Consumes: `GeoEvidenceSnapshot[]`，不访问数据库。

- [ ] **Step 1: 写校验失败测试**

覆盖正确文章、旧品牌、无证据数字、危险链接、失效证据和警告：

```ts
const validDocument: GeoDocument = {
  title: "AI短剧如何保持角色一致性",
  summary: "从角色资料、参考图和分镜约束三个环节减少角色漂移。",
  directAnswer: "先固定角色资料，再让每个分镜引用同一组已确认素材。",
  blocks: [{ type: "paragraph", text: "灵曦AI可统一管理角色参考素材。", evidenceIds: ["e-1"] }],
  faq: [{ question: "需要几张参考图？", answer: "按角色和镜头需要准备，并以实测结果为准。" }],
  socialDrafts: { zhihu: "", xiaohongshu: "", bilibili: "", wechat: "" },
  seo: { title: "AI短剧角色一致性方法 | 灵曦AI", description: "角色一致性操作方法" },
};

assert.deepEqual(validateGeoDraft({ document: validDocument, evidence: [approvedEvidence] }).blockers, []);
assert.ok(validateGeoDraft({ document: { ...validDocument, title: "灵曦剧场教程" }, evidence: [approvedEvidence] }).blockers.some((item) => item.code === "legacy_brand_forbidden"));
assert.ok(validateGeoDraft({ document: withUnsupportedNumber(validDocument), evidence: [] }).blockers.some((item) => item.code === "numeric_claim_without_evidence"));
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 定义受控类型**

`geo-types.ts` 定义固定联合类型：

```ts
export type GeoBlock =
  | { type: "paragraph"; text: string; evidenceIds: string[] }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "list"; ordered: boolean; items: string[]; evidenceIds: string[] }
  | { type: "steps"; items: Array<{ title: string; body: string }>; evidenceIds: string[] }
  | { type: "quote"; text: string; sourceLabel: string; sourceUrl: string; evidenceIds: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; evidenceIds: string[] }
  | { type: "image"; src: string; alt: string; caption: string; evidenceIds: string[] }
  | { type: "note"; tone: "info" | "warning"; text: string }
  | { type: "cta"; title: string; body: string; href: string; label: string };

export interface GeoDocument {
  title: string;
  summary: string;
  directAnswer: string;
  blocks: GeoBlock[];
  faq: Array<{ question: string; answer: string }>;
  socialDrafts: Record<"zhihu" | "xiaohongshu" | "bilibili" | "wechat", string>;
  seo: { title: string; description: string };
}
```

- [ ] **Step 4: 实现确定性检查**

`validateGeoDraft` 返回具体阻断与警告，不返回综合分数：

```ts
export function validateGeoDraft(input: {
  document: GeoDocument;
  evidence: GeoEvidenceSnapshot[];
  existingDocuments?: GeoDocument[];
  now?: Date;
  similarityThreshold?: number;
}): GeoQualityReport {
  const blockers: GeoQualityIssue[] = [];
  const warnings: GeoQualityIssue[] = [];
  // 检查旧品牌、结构、证据状态、数字声明、危险URL、敏感信息和重复度。
  return { blockers, warnings, checkedAt: (input.now ?? new Date()).toISOString() };
}
```

敏感模式至少覆盖密码、密钥、令牌、手机号和常见凭据字段；URL只允许站内单斜杠路径或 `https?`，禁止 `javascript:`、`data:` 和协议相对地址。

- [ ] **Step 5: 实现纯函数安全渲染**

`geo-public-renderer.ts` 对所有文本和属性转义，只按 `GeoBlock.type` 生成HTML。结构化数据由同一个 `GeoDocument` 生成：

```ts
export function renderGeoArticle(input: {
  template: string;
  canonicalUrl: string;
  brandName: "灵曦AI";
  contentType: "guide" | "case" | "report" | "answer";
  document: GeoDocument;
  publishedAt: string;
  updatedAt: string;
  authorName: string;
  related: Array<{ href: string; title: string; summary: string }>;
}): string;
```

无FAQ时不输出 `FAQPage`；任何JSON-LD中的 `<` 替换为 `\\u003c`。

- [ ] **Step 6: 运行校验测试**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts`

Expected: PASS。

- [ ] **Step 7: 提交类型与校验任务**

```bash
git add apps/backend/src/modules/geo/geo-types.ts apps/backend/src/modules/geo/geo-content-validator.ts apps/backend/src/modules/geo/geo-public-renderer.ts apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts
git commit -m "feat(geo): validate and render controlled content"
```

### Task 3: 问题、证据、版本和发布领域服务

**Files:**
- Create: `apps/backend/src/modules/geo/geo-content.service.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-content.service.spec.ts`

**Interfaces:**
- Produces: `createGeoContentService({ db, now? })`。
- Consumes: Task 1 数据表，Task 2 `GeoDocument` 与 `validateGeoDraft`。
- Required methods: `listQuestions`、`saveQuestion`、`listEvidence`、`saveEvidence`、`listContent`、`getContent`、`createDraftFromDocument`、`submitForReview`、`publish`、`rollback`、`archive`、`listPublished`、`findPublishedByPath`。

- [ ] **Step 1: 写领域状态流失败测试**

使用 `createMigratedTestDb()` 和真实SQL覆盖：

```ts
const service = createGeoContentService({ db, now: () => fixedNow });
const question = await service.saveQuestion({
  rawQuestion: "AI短剧怎样保持角色一致？",
  topic: "角色一致性",
  intent: "tutorial",
  targetPlatforms: ["deepseek", "doubao"],
  priority: 90,
  productCapabilities: ["角色素材库"],
  notes: "",
  actorAdminAccountId,
});
const evidence = await service.saveEvidence({
  type: "product_feature",
  name: "角色素材管理",
  factText: "灵曦AI支持按角色保存参考素材。",
  sourceUrl: "https://www.lingxiyunai.com/assets",
  reviewStatus: "approved",
  validUntil: null,
  publicUseAllowed: true,
  actorAdminAccountId,
});
const draft = await service.createDraftFromDocument({
  contentType: "guide", topic: "角色一致性", slug: "ai-short-drama-character-consistency",
  questionIds: [question.data.id], evidenceIds: [evidence.data.id], document: validDocument,
  generationRunId: null, configRevisionId: "geo-default-v1", actorAdminAccountId,
});
assert.equal((await service.publish({ contentItemId: draft.data.item.id, actorAdminAccountId, reason: "直接发布" })).status, 409);
assert.equal((await service.submitForReview({ contentItemId: draft.data.item.id, expectedLockVersion: 1, actorAdminAccountId })).status, 200);
assert.equal((await service.publish({ contentItemId: draft.data.item.id, actorAdminAccountId, reason: "审核通过" })).status, 200);
```

再验证有阻断项不能送审、发布版本不可变、新草稿不影响线上、回滚和归档审计。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-content.service.spec.ts`

Expected: FAIL，服务尚不存在。

- [ ] **Step 3: 实现问题和证据方法**

所有输入在服务层标准化。问题标准化使用Unicode空白折叠和小写，不删除中文标点以外的语义字符。证据返回统一DTO，不把内部附件存储键直接暴露为公开URL。

```ts
export function createGeoContentService(deps: { db: SqlDatabase; now?: () => Date }) {
  return {
    listQuestions,
    saveQuestion,
    listEvidence,
    saveEvidence,
    listContent,
    getContent,
    createDraftFromDocument,
    submitForReview,
    publish,
    rollback,
    archive,
    listPublished,
    findPublishedByPath,
  };
}
```

- [ ] **Step 4: 实现不可变版本**

`createDraftFromDocument` 在单条SQL CTE中创建或锁定内容主记录、计算下一个版本号、插入版本和关联表，并更新 `current_draft_version_id`/`lock_version`。编辑现有草稿也创建后继版本，不更新版本正文。

- [ ] **Step 5: 实现审核、发布、回滚和归档**

每个状态变化使用单条SQL CTE完成条件更新和 `geo_audit_events` 插入。发布条件必须同时检查 `status='in_review'`、草稿版本存在、质量报告无阻断项。回滚目标必须是该内容曾发布过的版本。

返回统一结果：

```ts
type GeoServiceResult<T> =
  | { status: 200 | 201; body: { data: T } }
  | { status: 400 | 404 | 409; body: { error: { code: string; message: string } } };
```

- [ ] **Step 6: 运行领域测试**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-content.service.spec.ts`

Expected: PASS。

- [ ] **Step 7: 提交领域服务任务**

```bash
git add apps/backend/src/modules/geo/geo-content.service.ts apps/backend/src/modules/geo/tests/geo-content.service.spec.ts
git commit -m "feat(geo): add reviewed publishing workflow"
```

### Task 4: 文本模型生成、审查与生成记录

**Files:**
- Create: `apps/backend/src/modules/geo/geo-generation.service.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts`

**Interfaces:**
- Produces: `createGeoGenerationService({ db, gateway, contentService, now? })` 和 `generateDraft(input)`。
- Consumes: `TextChatGatewayLike`、Task 2解析/校验、Task 3内容服务。

- [ ] **Step 1: 写模型生成失败测试**

使用内存假的 `TextChatGatewayLike` 返回写作JSON和审查JSON：

```ts
const gateway: TextChatGatewayLike = {
  async completeJsonWithUsage(input) {
    calls.push(input);
    return {
      content: calls.length === 1 ? JSON.stringify(validDocument) : JSON.stringify({ issues: [] }),
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      providerRequestId: `provider-${calls.length}`,
    };
  },
  async completeJson() { throw new Error("unexpected fallback"); },
};
```

断言两次模型调用、资料包只含所选证据、不含证据内部字段、生成记录成功、草稿无法直接发布。另写模型抛错和无效JSON用例，断言不创建内容版本。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts`

Expected: FAIL，服务尚不存在。

- [ ] **Step 3: 实现严格解析器**

```ts
export function parseGeoGeneratedDocument(raw: string): GeoDocument {
  const value = JSON.parse(stripSingleJsonFence(raw));
  // 明确检查title、summary、directAnswer、blocks、faq、socialDrafts、seo及每种block字段。
  // 任一字段不符合时抛出 GeoGenerationError("generated_document_invalid")。
  return normalized;
}
```

不得使用宽松正则从自然语言中猜测正文。

- [ ] **Step 4: 实现生成资料包和两阶段调用**

`generateDraft` 顺序固定：

1. 读取问题、有效证据、GEO配置和已发布文章摘要；
2. 插入 `running` 生成记录；
3. 调用写作提示词；
4. 严格解析并运行确定性检查；
5. 调用独立审查提示词并把问题合并为警告或阻断；
6. 通过Task 3创建草稿版本；
7. 更新生成记录为成功并保存两个网关请求编号和用量。

```ts
async function generateDraft(input: {
  questionId: string;
  evidenceIds: string[];
  contentType: "guide" | "case" | "report" | "answer";
  topic: string;
  slug: string;
  modelCode: string;
  actorAdminAccountId: string;
}): Promise<GeoServiceResult<GeoGeneratedDraft>>;
```

网关调用使用 `createdByUserId: null`、`responseFormat: "json_object"`、前缀 `geo-writer`/`geo-reviewer`，不修改现有网关签名。

- [ ] **Step 5: 实现失败收口**

模型失败、取消、截断或解析失败时，把 `geo_generation_runs` 更新为 `failed`，写入稳定错误码与脱敏摘要，不保存原始凭据、不创建内容版本。

- [ ] **Step 6: 运行生成测试**

Run: `npm test -- apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts`

Expected: PASS。

- [ ] **Step 7: 提交生成任务**

```bash
git add apps/backend/src/modules/geo/geo-generation.service.ts apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts
git commit -m "feat(geo): generate evidence-bound drafts"
```

### Task 5: 超级管理员HTTP接口与GEO配置

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

**Interfaces:**
- Produces: `/api/admin/geo/questions`、`/evidence`、`/content`、`/generate`、`/content/:id/submit-review`、`/publish`、`/rollback`、`/archive`、`/settings`。
- Consumes: Task 3和Task 4服务、现有 `requireAdminRouteSession`、`createAdminSystemSettingsService` 和 `textChatGateway` 注入点。

- [ ] **Step 1: 写匿名和非超级管理员拒绝测试**

在现有管理员HTTP测试中加入：

```ts
const anonymous = await fetch(`${server.origin}/api/admin/geo/questions`);
assert.equal(anonymous.status, 401);

const { server: opsServer, cookie: opsCookie } = await createLoggedInAdminServer(db, { role: "ops_admin" });
try {
  const forbidden = await fetch(`${opsServer.origin}/api/admin/geo/questions`, { headers: { cookie: opsCookie } });
  assert.equal(forbidden.status, 403);
} finally {
  await opsServer.close();
}
```

超级管理员用例按“新建问题→新建证据→生成草稿→送审→发布”执行。`textChatGateway` 使用测试注入，不连接真实模型。

- [ ] **Step 2: 运行HTTP测试确认失败**

Run: `npm test -- apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "GEO"`

Expected: FAIL，接口返回404。

- [ ] **Step 3: 加入统一角色定义和只读接口**

在 `adminRouteRoles` 追加：

```ts
geoManage: ["super_admin"],
```

每个GEO分支都调用：

```ts
const adminRoute = await requireAdminRouteSession({
  db,
  cookieHeader: request.headers.cookie,
  requiredRoles: [...adminRouteRoles.geoManage],
});
if (!adminRoute.ok) return writeJson(response, adminRoute.response);
```

GET列表只读取查询参数，不接受请求体。

- [ ] **Step 4: 加入写接口和幂等要求**

问题、证据、生成、送审、发布、回滚、归档和设置更新均要求 `idempotency-key`。请求体通过现有 `readJsonBody`/`objectBody` 读取，服务层继续做最终校验。

设置使用 `runtime_config_entries` 的 `geo.runtime`，默认值固定为：

```ts
{
  defaultModelCode: "",
  brandName: "灵曦AI",
  brandFacts: [],
  brandTone: "专业、克制、清晰，不夸大效果",
  forbiddenPhrases: ["灵曦剧场", "行业第一", "国内唯一", "100%稳定"],
  defaultWordRange: { min: 1200, max: 2600 },
  similarityThreshold: 0.82,
  publicAuthorName: "灵曦AI内容团队"
}
```

专用设置接口只允许超级管理员，并复用现有配置修订和审计能力。

- [ ] **Step 5: 接入测试模型网关**

创建GEO生成服务时复用请求范围内已经构造的 `canvasTextChatGateway`，从而继续支持 `PhoneAuthDevServerOptions.textChatGateway` 测试注入，不新增全局模型配置。

- [ ] **Step 6: 运行HTTP测试**

Run: `npm test -- apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "GEO"`

Expected: PASS。

- [ ] **Step 7: 提交管理员接口任务**

```bash
git add apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts
git commit -m "feat(geo): expose super-admin operations API"
```

### Task 6: GEO 管理后台试用界面

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/index.test.mjs`

**Interfaces:**
- Produces: 超级管理员可见的 `data-page="geoOperations"` 页面。
- Consumes: Task 5管理员API，不直接访问数据库或模型供应商。

- [ ] **Step 1: 写后台契约失败测试**

```js
test("admin shell exposes the super-admin GEO workflow", () => {
  for (const text of [
    "GEO运营", "问题库", "证据库", "内容中心", "自动质检", "提交审核", "发布官网",
    "/api/admin/geo/questions", "/api/admin/geo/evidence", "/api/admin/geo/content",
    "/api/admin/geo/generate", "/submit-review", "/publish",
  ]) assert.match(script, new RegExp(escapeRegExp(text)));
  assert.match(script, /state\.adminRoles\.includes\("super_admin"\)/);
});
```

- [ ] **Step 2: 运行后台测试确认失败**

Run: `npm run test:admin:ui -- --test-name-pattern "GEO"`

Expected: FAIL，页面契约不存在。

- [ ] **Step 3: 增加超级管理员菜单和状态**

沿用文件末尾现有功能扩展模式，在同一个脚本作用域内追加 `geoOperations` 状态、加载方法和 `renderPage` 包装。插入导航前必须检查：

```js
if (!Array.isArray(state.adminRoles) || !state.adminRoles.includes("super_admin")) return;
if (nav.querySelector('[data-page="geoOperations"]')) return;
```

不得给其他管理员显示灰色入口。

- [ ] **Step 4: 实现三栏试用工作台**

页面使用现有 `card`、`table-wrap`、`toolbar`、`drawer` 和 `runAdminMutation` 组件：

- 问题库：新增、筛选、选择创建内容；
- 证据库：新增、审核状态、有效期、公开许可；
- 内容中心：状态、阻断/警告数量、预览、提交审核、发布、回滚、归档；
- 设置：默认模型、品牌事实、禁用词、字数和作者。

生成抽屉必须要求选择一个问题、至少一个已审核证据、内容类型、英文slug和模型。生成按钮文案明确为“生成草稿”，不出现“一键发布”。

- [ ] **Step 5: 实现人工发布确认**

发布前使用现有确认交互展示文章标题、slug、阻断/警告数量和发布原因输入。请求：

```js
await api(`/api/admin/geo/content/${encodeURIComponent(contentId)}/publish`, {
  method: "POST",
  headers: { "idempotency-key": `admin-ui-geo-publish-${Date.now()}` },
  body: JSON.stringify({ reason }),
});
```

警告可以确认，阻断项时前端禁用按钮；后端仍会重复阻断。

- [ ] **Step 6: 运行后台测试**

Run: `npm run test:admin:ui`

Expected: PASS。

- [ ] **Step 7: 提交后台界面任务**

```bash
git add apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat(geo): add operations admin workspace"
```

### Task 7: 公开服务端页面和动态站点地图

**Files:**
- Create: `apps/web/geo-public.html`
- Create: `apps/web/geo-public.css`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

**Interfaces:**
- Produces: `/guides`、`/cases`、`/reports`、`/answers` 列表及详情，动态 `/sitemap.xml`。
- Consumes: Task 2渲染器、Task 3 `listPublished`/`findPublishedByPath`。

- [ ] **Step 1: 写公开页面失败测试**

在迁移测试库插入一条已发布文章，通过HTTP验证：

```ts
for (const cookie of [undefined, "auth_session=existing-session"]) {
  const response = await fetch(`${server.origin}/guides/ai-short-drama-character-consistency`, {
    headers: cookie ? { cookie, ...proxyHeaders } : proxyHeaders,
  });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h1>AI短剧如何保持角色一致性<\/h1>/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.lingxiyunai\.com\/guides\/ai-short-drama-character-consistency"/);
  assert.doesNotMatch(html, /src="\/app\.js/);
  assert.doesNotMatch(html, /public-seo-session-pending/);
}
```

站点地图必须包含详情URL和 `lastmod`，不得包含草稿。

- [ ] **Step 2: 运行公开页面测试确认失败**

Run: `npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts -- --test-name-pattern "GEO public"`

Expected: FAIL，路由返回404。

- [ ] **Step 3: 添加独立公开模板**

`geo-public.html` 只包含品牌导航、`<!--GEO_CONTENT-->` 插槽、页脚和 `/geo-public.css`，不包含 `app.js`、登录态探测或工作台容器。CSS复用现有颜色和字体取向，但保持独立类名前缀 `.geo-public-*`。

- [ ] **Step 4: 在通用静态路由前处理GEO GET请求**

在现有：

```ts
if (request.method === "GET" && !pathname.startsWith("/api/")) {
  return await serveStatic(request, pathname, response, runtimeEnv);
}
```

之前增加精确匹配分支。只识别四个列表根路径和单段slug详情；未知slug返回404，不回退到工作台。

- [ ] **Step 5: 扩展站点地图**

在现有静态 `/sitemap.xml` 分支之前增加数据库版本。静态六页来自现有 `publicSeoRoutes`，动态页来自 `listPublished`，逐项XML转义并为动态页输出UTC `lastmod`。数据库失败时记录脱敏错误并退回现有六页地图，不能让站点地图整体500。

- [ ] **Step 6: 增加ETag和缓存**

详情页ETag由当前发布版本ID和HTML哈希生成，使用 `cache-control: public, max-age=0, must-revalidate`；匹配 `If-None-Match` 时返回304。列表页同样基于当前发布记录集合生成ETag。

- [ ] **Step 7: 运行公开与原有SEO回归测试**

Run: `npm test -- apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts -- --test-name-pattern "SEO|GEO public|unknown app paths"`

Expected: PASS。

- [ ] **Step 8: 提交公开页面任务**

```bash
git add apps/web/geo-public.html apps/web/geo-public.css apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
git commit -m "feat(geo): publish crawler-ready content pages"
```

### Task 8: 阶段一整体验证与文档状态

**Files:**
- Modify: `docs/superpowers/specs/2026-08-13-lingxi-ai-geo-operations-design.md`
- Modify only if tests expose a defect: files created or modified in Tasks 1-7。

**Interfaces:**
- Consumes: Tasks 1-7全部交付。
- Produces: 阶段一验证记录和已实施规格状态。

- [ ] **Step 1: 运行GEO专项测试**

```bash
npm test -- \
  apps/backend/src/modules/geo/tests/geo-schema.spec.ts \
  apps/backend/src/modules/geo/tests/geo-content-validator.spec.ts \
  apps/backend/src/modules/geo/tests/geo-content.service.spec.ts \
  apps/backend/src/modules/geo/tests/geo-generation.service.spec.ts \
  apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts \
  apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS。

- [ ] **Step 2: 运行后台UI测试**

Run: `npm run test:admin:ui`

Expected: PASS。

- [ ] **Step 3: 运行迁移和构建回归**

```bash
npm test -- apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts scripts/runtime-schema-launchers.test.mjs
npm run build:production-runtime
```

Expected: 所有测试PASS，生产运行时构建成功。

- [ ] **Step 4: 检查改动范围和敏感信息**

```bash
git diff --check
git status --short
rg -n "灵曦剧场|api[_-]?key|password|phone_e164" apps/backend/src/modules/geo apps/web/geo-public.*
```

Expected: `git diff --check` 无错误；GEO输出代码没有旧品牌或硬编码密钥；测试夹具出现的安全字段只用于阻断测试。

- [ ] **Step 5: 更新规格状态**

把规格文档头部状态改为“阶段一已实施，待验收”，并在分阶段交付章节下记录实际通过的命令，不写未经执行的结果。

- [ ] **Step 6: 提交验证记录**

```bash
git add docs/superpowers/specs/2026-08-13-lingxi-ai-geo-operations-design.md
git commit -m "docs: record GEO phase one verification"
```
