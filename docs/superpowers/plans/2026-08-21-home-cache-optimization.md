# 首页缓存与及时更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让首页优先显示持久缓存、后台内容在 15 秒内更新，并让同版本背景视频热刷新复用浏览器缓存。

**Architecture:** 推荐 JSON 使用 localStorage 快照加浏览器 ETag 条件校验；首页可见时每 15 秒校验一次。背景视频使用版本 URL并继续由 COS 直出；公开背景的签名与 307 缓存窗口可通过独立环境键延长至最多 7 天，复用已带一年 immutable 元数据的 COS 对象缓存。

**Tech Stack:** Vanilla JavaScript、Node.js HTTP、Cache Storage、localStorage、Node test runner。

**Spec:** `docs/superpowers/specs/2026-08-21-home-cache-optimization-design.md`

## Global Constraints

- 只修改首页推荐与首页背景视频缓存路径。
- 保持现有方法签名、API payload 和媒体版本 URL 结构。
- 所有生产代码必须先有失败测试。
- 背景视频冷流量不得经过 Node 应用进程。
- 后台更新最大可见延迟为 15 秒。

---

### Task 1: 首页推荐 HTTP 条件缓存

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Test: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

**Interfaces:**
- Consumes: `homeRecommendationMediaGatewayPayload(data)`、`staticAssetEtag(value)`、`requestMatchesEtag(request, etag)`。
- Produces: `GET /api/home-recommendations` 的 `ETag`、`Cache-Control` 和 304 响应。

- [ ] **Step 1: 写失败测试**

在现有首页媒体网关测试中，首次请求断言响应包含 `public, max-age=0, must-revalidate` 和 ETag；随后携带 `If-None-Match` 再请求并断言状态为 304。

- [ ] **Step 2: 验证测试因缺少 ETag 失败**

Run: `node --import tsx --test --test-name-pattern="caches the active background media redirect" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Expected: FAIL，首页推荐响应没有 ETag 或条件请求返回 200。

- [ ] **Step 3: 写最小实现**

在 `GET /api/home-recommendations` 路由中先生成稳定 gateway payload，以 JSON 字符串计算 ETag，设置缓存头；匹配 `If-None-Match` 时返回 304，否则沿用现有 envelope 输出。

- [ ] **Step 4: 验证通过**

Run: `node --import tsx --test --test-name-pattern="caches the active background media redirect" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Expected: PASS。

### Task 2: 浏览器强制校验与持久首页快照

**Files:**
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/creator-api.spec.ts`
- Test: `apps/web/tests/project-gallery-actions.spec.mjs`

**Interfaces:**
- Consumes: `creatorApi.getHomeRecommendations(options)`、`syncHomeRecommendationsFromApi(workbench)`。
- Produces: `fresh: true` 绕过 JS TTL 并使用浏览器条件缓存；localStorage 首页快照；首页可见时 15 秒轮询。

- [ ] **Step 1: 写 creator API 失败测试**

连续调用 `getHomeRecommendations({ fresh: true })`，断言产生两次 fetch，且请求的 `cache` 都是 `no-cache`。

- [ ] **Step 2: 验证 creator API 测试失败**

Run: `node --import tsx --test --test-name-pattern="fresh home recommendations" apps/web/tests/creator-api.spec.ts`

Expected: FAIL，当前第二次调用命中 5 分钟内存缓存。

- [ ] **Step 3: 实现 fresh 读取**

让 `getHomeRecommendations(options = {})` 在 `fresh === true` 时将 TTL 设为 0，并向 fetch 传递 `cache: "no-cache"`；默认行为保持不变。

- [ ] **Step 4: 写工作台失败测试**

增加三个行为测试：初始化优先应用合法 localStorage 快照；后台新 payload 会覆盖并持久化；首页可见轮询使用 fresh 请求，离开首页或隐藏页面不请求。

- [ ] **Step 5: 验证工作台测试失败**

Run: `node --test --test-name-pattern="cached home recommendations|visible home recommendations" apps/web/tests/project-gallery-actions.spec.mjs`

Expected: FAIL，当前没有持久快照和 15 秒首页轮询。

- [ ] **Step 6: 实现持久快照与轮询**

增加防异常 localStorage 读写、payload 归一化、变更签名和轮询安装/释放逻辑。初始化时应用缓存；所有首页同步使用 `fresh: true`；仅 payload 变化时 render 并写缓存。

- [ ] **Step 7: 验证通过**

Run: `node --import tsx --test --test-name-pattern="fresh home recommendations" apps/web/tests/creator-api.spec.ts`

Run: `node --test --test-name-pattern="cached home recommendations|visible home recommendations" apps/web/tests/project-gallery-actions.spec.mjs`

Expected: PASS。

### Task 3: 背景视频版本化 HTTP 缓存

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/project-gallery-actions.spec.mjs`

**Interfaces:**
- Consumes: `readCachedHomeBackgroundVideo(sourceUrl)`、`syncHomeBackgroundVideoLocalCache(workbench)`。
- Produces: Cache Storage 旧条目命中播放；背景网关 7 天签名与 307 缓存；版本切换使用新缓存键。

- [ ] **Step 1: 写失败测试**

增加行为测试：Cache Storage 命中时不调用 fetch；背景网关保持 307 COS 直出，签名与重定向缓存约 7 天，推荐视频签名时长保持不变。

- [ ] **Step 2: 验证测试失败**

Run: `node --import tsx --test --test-name-pattern="caches the active background media redirect" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Expected: FAIL，当前背景网关重定向只缓存 5 分钟且签名仅 1 小时。

- [ ] **Step 3: 写最小实现**

保持 Cache Storage 只读命中路径和 COS 直出 Range 行为；仅对公开首页背景延长签名与版本化 307 缓存，推荐视频等其他媒体路径不变。

- [ ] **Step 4: 验证通过**

Run: `node --test --test-name-pattern="background video cache hit|does not prune a newer background video cache after an older cache read|leaving home pauses|returning home restarts" apps/web/tests/project-gallery-actions.spec.mjs`

Run: `node --import tsx --test --test-name-pattern="caches the active background media redirect" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Expected: PASS。

### Task 4: 变更说明、回归验证与审查

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–3 的实现和测试。
- Produces: 可审查 diff、测试证据和性能验收记录。

- [ ] **Step 1: 更新 CHANGELOG**

在 `[Unreleased]` 记录首页推荐 ETag 校验、15 秒可见轮询、持久快照和背景视频 7 天版本化 HTTP 缓存。

- [ ] **Step 2: 运行相关测试**

Run: `node --import tsx --test apps/web/tests/creator-api.spec.ts`

Run: `node --test --test-name-pattern="leaving home|returning home|home recommendations|cached home recommendations|visible home recommendations|background video" apps/web/tests/project-gallery-actions.spec.mjs`

Run: `node --import tsx --test --test-name-pattern="caches the active background media redirect|limits repeated anonymous home media" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Expected: 全部 PASS。

- [ ] **Step 3: 静态检查**

Run: `node --check apps/web/src/shared/creator-api.js`

Run: `node --check apps/web/src/features/production-workbench/index.js`

Run: `git diff --check`

Expected: 全部退出码 0。

- [ ] **Step 4: 执行 codex-review**

按 `codex-review` 技能审查全部未提交变更；主动修复 P0、P1、P2 后重新运行相关测试和审查。
