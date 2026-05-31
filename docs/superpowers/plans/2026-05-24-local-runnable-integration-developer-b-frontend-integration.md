# Local Runnable Integration Developer B Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the production workbench to the real creator API so browser users can complete the Local Runnable Alpha path without fake business state.

**Architecture:** Keep the existing render-function frontend and `creatorApi` module. Upgrade the API client to honor the R0 idempotency contract, preserve structured backend errors, and ensure workbench business facts come from API refreshes rather than local-only state.

**Tech Stack:** JavaScript ES modules, browser `fetch`, existing `apps/web/src/shared/creator-api.js`, production workbench render functions, Node test runner.

---

## 0. Context and Boundaries

This plan is Developer B's slice of [Local Runnable Integration 三人开发 Implementation Plan](./2026-05-24-local-runnable-integration-three-developer-plan.md).

Local Runnable Alpha path:

```text
npm run dev
  -> 登录
  -> 创建项目
  -> 解析剧本
  -> 确认资产
  -> 校准/跳过校准
  -> 生成图片/视频
  -> 导出 preview/history
  -> 刷新后状态从后端恢复
```

Developer B owns:

- `creatorApi` request/response behavior.
- Workbench action wiring to real backend routes.
- Frontend state recovery from API responses.
- User-facing error handling for known backend errors.
- Chrome dogfood support with Developer C.

Developer B does not own:

- Backend replay/conflict semantics.
- Dev server route implementation.
- npm script and smoke harness ownership.
- Visual redesign or frontend framework migration.

Done for Developer B:

- Required R0 routes send `Idempotency-Key`.
- API failures expose structured `status`, `code`, and `fieldErrors`.
- Workbench refreshes from backend after main actions.
- Business facts are not restored from localStorage.
- Developer B has used `@chrome` to validate the real user journey and frontend integration behavior.
- Chrome acceptance evidence or bugs are recorded in `docs/local-dev/local-runnable-alpha-bug-log.md`.
- Web tests and Chrome dogfood support pass.

## 1. Shared R0 Contract for Frontend

Frontend must follow this matrix. Do not add idempotency headers to different routes unless Developer A updates the R0 matrix first.

| Route | Method | Operation | Idempotency | Frontend call |
| --- | --- | --- | --- | --- |
| `/api/creator/project/create` | POST | `project.create` | Required, full replay/conflict | `creatorApi.createProject` |
| `/api/creator/parse` | POST | `script.parse` | Required, full replay/conflict | `creatorApi.parseScript` |
| `/api/creator/images/generate` | POST | `shot.image.generate` | Required, full replay/conflict before provider work | `creatorApi.generateImages` |
| `/api/creator/videos/generate` | POST | `shot.video.generate` | Required, full replay/conflict before provider work | `creatorApi.generateVideos` |
| `/api/creator/export/preview` | POST | `export.create` | Required, full replay/conflict | `creatorApi.previewExport` |
| `/api/creator/assets/confirm` | POST | project edit | Not required in Local Alpha | `creatorApi.confirmAsset` |
| `/api/creator/assets/confirm-all` | POST | project edit | Not required in Local Alpha | `creatorApi.confirmAllAssets` |
| `/api/creator/calibration/run` | POST | `calibration.generate` | Required, full replay/conflict | `creatorApi.runCalibration` |
| `/api/creator/calibration/skip` | POST | `calibration.skip` | Required, full replay/conflict with reason/audit | `creatorApi.skipCalibration` |
| `/api/creator/calibration/override` | POST | calibration override | Required, full replay/conflict with reason/audit | `creatorApi.overrideCalibration` |

Frontend rules:

- Required routes must send an `idempotency-key` header.
- One user action should generate one key. If a retry happens inside that same action, reuse the key.
- New user action means new key.
- API client should preserve backend error code instead of throwing plain `Error(message)` only.

## 2. File Map

- Modify: `apps/web/src/shared/creator-api.js` - idempotency headers, structured errors, API helper surface.
- Create or modify: `apps/web/tests/creator-api.spec.ts` - API client behavior.
- Modify: `apps/web/src/features/production-workbench/index.js` - action refresh, local/business state separation, error mapping.
- Modify if needed: `apps/web/src/features/production-workbench/storyboard-state.js` - API-backed storyboard state assumptions.
- Modify: `apps/web/tests/project-workbench-generation.spec.ts` - workbench behavior.
- Modify: `apps/web/tests/assets-team-commercial-qa.spec.ts` - ensure library/team surfaces still render.
- Modify: `apps/web/tests/login-page.spec.ts` - if auth redirect/error behavior changes.
- Read: `docs/local-dev/local-runnable-chrome-acceptance.md` - Chrome self-acceptance protocol.
- Modify: `docs/local-dev/local-runnable-alpha-bug-log.md` - B-owned PASS/BUG evidence.

## 3. Tasks

### Task B1: Idempotent Creator API Client

| 字段 | 内容 |
| --- | --- |
| 背景 | 后端要求 idempotency 后，前端必须为一次用户动作生成并携带稳定 key，否则主链路写操作会 400。 |
| 交付能力 | `creatorApi` 为 R0 矩阵中 Required 的写操作发送 `Idempotency-Key`，且测试证明 header 与 operation 对齐。 |
| 前置依赖 | Developer A 的 R0 route 协议。可先用矩阵测试约定并行开发。 |
| 验证方式 | `npm test -- apps/web/tests/creator-api.spec.ts apps/web/tests/project-workbench-generation.spec.ts`。 |
| 异常处理 | 同一次用户动作内 retry 使用同一 key；新用户动作生成新 key；缺失 crypto 时用 timestamp + random fallback。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/shared/creator-api.js`
- Create or modify: `apps/web/tests/creator-api.spec.ts`

- [ ] Step 1: 给 `postJson` 增加可选 headers/options。
- [ ] Step 2: 实现 `createIdempotencyKey(operationName)` helper。
- [ ] Step 3: 为 R0 矩阵中 Required 的 creator 写方法添加 header。
- [ ] Step 4: 新增测试断言 fetch 收到 `idempotency-key`。
- [ ] Step 5: 确保 non-idempotent 轻量操作不强行加 key，除非 R0 矩阵要求。

### Task B2: Workbench Business State Comes From API

| 字段 | 内容 |
| --- | --- |
| 背景 | 当前工作台已有 `refresh()`，但仍存在 UI-local storyboards/custom episodes/imported assets 等状态和后端事实混用。Local Alpha 需要刷新后从 API 恢复主链路事实。 |
| 交付能力 | 创建、解析、资产确认、校准、生成、导出后统一 `refresh()`；项目、资产、分镜、导出历史以 API response 为准。 |
| 前置依赖 | Developer A 的 A1/A2 基础协议；现有 creator API。 |
| 验证方式 | `npm test -- apps/web/tests/project-workbench-generation.spec.ts apps/web/tests/assets-team-commercial-qa.spec.ts`。 |
| 异常处理 | API 404 `project_not_found` 时回到项目库；401 时跳登录；业务错误用中文 toast。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify if needed: `apps/web/src/features/production-workbench/storyboard-state.js`
- Modify tests under `apps/web/tests/*`

- [ ] Step 1: 标记哪些 UI state 只允许本地保存：modal、tab、filter、draft。
- [ ] Step 2: 确认 action 成功后都调用 `refresh()`，不直接伪造完成状态。
- [ ] Step 3: 删除或隔离用于业务事实恢复的 localStorage 依赖。
- [ ] Step 4: 新增刷新恢复测试：给定 API state，render 出项目、分镜、导出状态。
- [ ] Step 5: 运行 web tests。

### Task B3: Frontend Error Experience

| 字段 | 内容 |
| --- | --- |
| 背景 | 可运行系统不只是 happy path。研发 dogfood 时需要从 UI 上知道是未登录、权限、幂等冲突、业务状态还是服务端错误。 |
| 交付能力 | `creatorApi` 保留 machine error code；workbench 把常见错误翻译成稳定中文 toast，不暴露内部堆栈。 |
| 前置依赖 | Developer A 的 A2 错误映射。 |
| 验证方式 | `npm test -- apps/web/tests/project-workbench-generation.spec.ts apps/web/tests/login-page.spec.ts`。 |
| 异常处理 | 401 触发回登录；409 提示重复提交/刷新；400 fieldErrors 显示到 modal notice。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify tests under `apps/web/tests/*`

- [ ] Step 1: 定义 `ApiError` 或等价 plain object，包含 `status`、`code`、`fieldErrors`。
- [ ] Step 2: 更新 `fetchJson`，失败时抛出结构化错误。
- [ ] Step 3: 更新 `friendlyError` 映射常见 creator/auth/idempotency 错误。
- [ ] Step 4: 表单类错误写入 modal notice，非表单错误写入 toast。
- [ ] Step 5: 增加测试覆盖 create project invalid input 和 idempotency conflict copy。

### Task B4: Chrome Self-Acceptance for Frontend User Journey

| 字段 | 内容 |
| --- | --- |
| 背景 | 前端 owner 必须证明真实用户点击路径可用，而不是 render test 通过但按钮、toast、busy state 或 refresh recovery 在 Chrome 里坏掉。 |
| 交付能力 | Developer B 使用 `@chrome` 完整跑用户旅途，重点验收交互、可见反馈、错误提示、刷新恢复、console/runtime 稳定性。 |
| 前置依赖 | B1-B3；Developer A 的 A1/A2；Developer C 的 C1。 |
| 验证方式 | 按 `docs/local-dev/local-runnable-chrome-acceptance.md` 执行；在 `docs/local-dev/local-runnable-alpha-bug-log.md` 写入 B 的 PASS/BUG。 |
| 异常处理 | 任何 UI action 失败时必须记录问题现场、root cause、长期修复；console 不应出现 blocking uncaught runtime error。 |
| 主链路贡献 | Yes。 |

**Files:**

- Modify as needed: `apps/web/src/features/production-workbench/index.js`
- Modify tests under `apps/web/tests/*`
- Read: `docs/local-dev/local-runnable-chrome-acceptance.md`
- Modify: `docs/local-dev/local-runnable-alpha-bug-log.md`

- [ ] Step 1: 用 `@chrome` 从登录开始跑完整主链路，不跳过用户实际会点击的 UI。
- [ ] Step 2: 确认每个 required action 有明确可点击入口并触发对应 creator API。
- [ ] Step 3: 确认 busy state 不会永久锁死，toast/notice 可理解，错误不会只停留在 console。
- [ ] Step 4: 确认 successful actions call `refresh()` and render updated API state.
- [ ] Step 5: 刷新页面，确认项目、资产、分镜、导出历史从后端恢复，而不是 localStorage 假恢复。
- [ ] Step 6: 将 PASS 或 BUG 写入 bug log；BUG 必须包含问题现场、根本原因、长期解决方案。

## 4. Handoff Checks

Developer B should run these before handoff:

```bash
npm test -- apps/web/tests/creator-api.spec.ts apps/web/tests/project-workbench-generation.spec.ts apps/web/tests/assets-team-commercial-qa.spec.ts apps/web/tests/login-page.spec.ts
```

Expected: all pass.

Developer B must also provide this short handoff note:

```text
Frontend integration status:
- Required R0 routes sending idempotency key:
- Local-only UI state remaining:
- Business state source:
- Error codes mapped:
- Chrome acceptance evidence:
- Bug log entries:
- Tests run:
```
