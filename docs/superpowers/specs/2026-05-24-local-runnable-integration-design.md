# Local Runnable Integration and DX Hardening Design

> Date: 2026-05-24  
> Owner posture: INTJ / 长期主义 / Framework Architect  
> Status: Approved direction from product owner  
> Scope: 本地闭环可跑，不包含准生产部署和商业 Beta gate

## 1. 背景和目标

前端和后端已经分别具备基础骨架：后端有 phone-auth dev server、creator API、模块化单体、PostgreSQL-backed 测试；前端有登录页、生产工作台、creator API client 和大量 render-level 测试。但当前系统距离“真正可运行”仍差一层工程化闭环：

- 研发或产品同学需要能用一个稳定入口启动本地系统。
- 前端所有主链路动作必须走真实后端 API，而不是混合本地状态或一次性 dev key。
- 后端 creator 写操作必须尊重已有 command contract、ActorContext、tenant scope、idempotency 和 audit 边界。
- 登录、创建项目、解析剧本、资产确认、校准、生成、导出必须有一条可重复验收的自动化 smoke/e2e。
- 开发体验要让后来的人知道怎么启动、怎么调试、怎么判断完成，而不是靠口口相传。

本次目标是把项目交付到 **Local Runnable Alpha**：

```text
npm run dev
  -> 打开本地登录页
  -> 手机验证码登录
  -> 进入生产工作台
  -> 创建项目
  -> 解析剧本
  -> 确认资产
  -> 校准/跳过校准
  -> 生成分镜图/视频
  -> 预览导出
  -> 刷新页面后状态仍从后端恢复
```

这不是商业 Beta。真实支付、强并发额度、防 Redis 丢失、真实 Provider 上线和生产部署不放进本次 Done 定义，但本次不能破坏这些长期边界。

## 1.1 架构师信心边界

我对这份方案支撑“本地前后端真实打通 + 模块化单体硬化 + DX 提升”具备 **100% 执行信心**。这个 100% 的边界是：

- 它能让三名研发知道自己做什么、为什么做、依赖谁、阻塞谁、做到什么算完成。
- 它能防止“前端带了 key 但后端不幂等”“HTTP API 能跑但真实页面没打通”“模块化硬化变成泛泛整理”这三类高概率返工。
- 它能交付 Local Runnable Alpha，不承诺商业 Beta、生产部署、真实支付和强并发额度正确性。
- 最终完成仍以 `npm test`、`npm run smoke:local` 和 Browser dogfood gate 三个事实验收为准。

## 2. 核心原则

### 2.1 主链路优先

先让一条真实 creator workflow 跑通，再补 DX、错误体验和验收工具。不要先重构目录或替换前端框架。

### 2.2 真实 API 优先

前端可以保留 render function 和少量 UI-local 状态，但所有主链路业务事实必须来自后端：

- 项目列表、当前项目、剧本、资产、分镜、校准、生成结果、导出历史来自 API。
- UI-local 状态只保存筛选、modal 开关、当前 tab、未提交表单草稿。
- 刷新页面后，不允许靠 localStorage 还原业务事实。

### 2.3 Command contract 优先

写操作不要在 entrypoint 里临时拼业务逻辑。高价值 creator 写操作逐步收敛到 command/application layer：

- create project
- parse script
- generate image/video
- export preview/create
- calibration skip/override

首轮不要求一次性把所有接口都抽成正式 controller，但必须把 idempotency、错误码、actor scope 和测试先补齐。

### 2.4 本地开发也是产品

框架开发者的目标不是“我能跑”，而是“别人一看就知道怎么跑，跑坏了知道坏在哪”。本次要补齐：

- 稳定脚本：`dev`、分组测试、smoke。
- 本地 runtime 文档：端口、账号、验证码 debug、provider/storage 模式。
- 错误提示：稳定错误码 + 前端友好提示 + 后端日志上下文。

## 3. 推荐方案和取舍

### 3.1 方案 A：主链路优先，模块化硬化同步推进（推荐）

先锁定本地可运行主链路，再沿着主链路补齐 idempotency header、API client、entrypoint 路由、状态恢复、smoke 测试和 DX 文档。

优点：

- 最快得到可 dogfood 的真实系统。
- 每个改动都服务主链路，不做空转重构。
- 可以三人并行：后端协议、前端联调、DX/验收互不堵死。

缺点：

- 入口 server 短期仍会比较大。
- 某些接口第一轮还是 dev-server route，不会一次性变成完整 controller 层。

### 3.2 方案 B：DX 基建优先

先重整 scripts、API client、错误体系、文档和目录，再串业务链路。

优点：开发体验更规整。  
缺点：可运行闭环出现较晚，容易陷入“工程很整齐但产品还跑不通”。

### 3.3 方案 C：商业 Beta Gate 一步到位

同时做真实 provider、额度强一致、支付、Ops 修复、部署 smoke。

优点：终局更完整。  
缺点：范围过大，容易让三个人每块都做到 70%，没有可验收闭环。

结论：选择方案 A。本次做 Local Runnable Alpha，为后续准生产和商业 Beta 打地基。

## 4. 系统设计

### 4.0 R0 协议冻结产物

三人开工前必须先冻结一张 Creator API Contract Matrix。它是 A/B/C 的共同接口契约，写在实施计划内，至少包含：

| Route | Method | Operation | Idempotency | Request source | Response contract | Error contract | Owner | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/api/creator/project/create` | POST | `project.create` | Required, full replay/conflict | 前端创建项目动作 | `project` + `script` | 400/401/403/409 | A/B | HTTP + client + smoke |
| `/api/creator/parse` | POST | `script.parse` | Required, full replay/conflict | 前端解析动作 | `workflow` + hydrated state | 400/401/403/409/202 | A/B | HTTP + smoke |
| `/api/creator/images/generate` | POST | `shot.image.generate` | Required, full replay/conflict before external work | 前端生成动作 | workflow/tasks/successes | 400/401/403/409/202 | A/B | service + HTTP + smoke |
| `/api/creator/videos/generate` | POST | `shot.video.generate` | Required, full replay/conflict before external work | 前端生成动作 | workflow/tasks/successes | 400/401/403/409/202 | A/B | service + HTTP + smoke |
| `/api/creator/export/preview` | POST | `export.create` | Required, full replay/conflict | 前端导出动作 | export record + signed URL | 400/401/403/409/202 | A/B | service + HTTP + smoke |
| `/api/creator/assets/confirm*` | POST | project edit | Not required for Local Alpha | 前端资产确认动作 | hydrated asset review | 400/401/403 | A/B | HTTP + smoke |
| `/api/creator/calibration/*` | POST | calibration command | Required for skip/override when reason/audit matters | 前端校准动作 | calibration + audit | 400/401/403/409 | A/B | service + HTTP |

如果某个 route 不能在本轮做到 full replay/conflict，必须在矩阵里显式标为 `Accepted header only, not replay-safe`，并且不得被 C 的 smoke 当作幂等能力验收。默认不允许隐式降级。

### 4.1 本地运行入口

新增或调整 scripts，使研发只需要记住少数命令：

```bash
npm run dev
npm run test:backend
npm run test:web
npm run smoke:local
```

`npm run dev` 默认启动现有 phone-auth dev server，端口使用 `.env` 的 `PORT`，默认 `4310`。首轮保持单进程：静态前端、auth API、creator API、billing/admin dev routes 都在同一 origin 下运行，避免 CORS 和 cookie 复杂度。

### 4.2 前端 API client

`apps/web/src/shared/creator-api.js` 需要从“简单 fetch wrapper”升级为本地 Alpha 的可靠 client：

- 对所有 contract 标记为 idempotent 的 creator 写操作发送 `Idempotency-Key`。
- key 由前端生成并绑定到一次用户动作；同一次动作 retry/replay 使用同一个 key。
- 统一处理 401、403、409、422/400、5xx。
- 返回错误保留 machine code，同时提供 UI 可展示的中文提示。

首轮不引入大型状态管理库。继续沿用当前 workbench state，但约束业务事实都来自 `refresh()` 后的 API response。

### 4.3 后端 entrypoint 和 application layer

现有 `phone-auth-dev-server.ts` 可以继续作为本地 Alpha entrypoint，但要收敛三个问题：

- Creator idempotent routes 不再用 `Date.now()` 生成 dev key；必须读取 `Idempotency-Key`，缺失返回 `idempotency_key_required`。
- Route 只做 auth、body parse、header validation、调用 application service，不在 route 层发明业务策略。
- 对 creator write routes 建立统一错误映射：validation -> 400，unauthenticated -> 401，forbidden -> 403，idempotency conflict -> 409，processing/queued -> 202，unexpected -> 500 with stable body。

`createCreatorApplication` 是本次主要后端编排点。它可以继续存在，但要避免继续膨胀：

- 与主链路相关的正式能力保留在 application service。
- 纯 dev compatibility 状态逐步隔离成小 helper。
- 所有新增主链路行为必须有 application service test 和 HTTP route test。

### 4.4 状态恢复和刷新

前端进入 app 后调用：

```text
GET /api/auth/session
GET /api/creator/state
GET /api/creator/projects
GET /api/creator/projects/:id/detail
GET /api/creator/export/history
```

刷新页面后的当前项目优先级：

1. 后端当前 creator state 中的 selected/latest project。
2. URL/hash 中显式 project id（如果后续加入）。
3. 项目列表最新项目。

不要使用 localStorage 保存业务事实。localStorage 只允许用于 UI 偏好，且 logout 时清理。

### 4.5 Smoke / E2E 验收

新增两个验收层。两层都必须存在，因为它们证明不同事实：

1. **HTTP smoke:** 用 Node fetch 直接跑真实 dev server，证明后端 API、cookie、idempotency、持久状态和导出事实成立。
2. **Browser dogfood gate:** 打开真实页面，实际点击登录、创建项目、解析、生成、导出，证明前端和后端真的串起来。

HTTP smoke 覆盖：

1. 启动 server。
2. 请求验证码、读取 debug code、验证登录。
3. 创建项目，带 idempotency key。
4. 重放同 key，确认不创建重复项目。
5. 解析剧本，刷新 state。
6. 确认资产，运行/跳过校准。
7. 生成图片，必要时生成视频。
8. 导出 preview/history。
9. 断言所有关键事实来自 API，且最终 export ready。

Browser dogfood gate 第一版可以是手工 checklist，也可以是 Playwright/Browser 自动化；但完成 Local Runnable Alpha 前必须至少产出一次可复现记录：

- 使用 `npm run dev` 启动。
- 访问 `http://127.0.0.1:4310`。
- 用 debug code 登录。
- 在 UI 内完成 create -> parse -> confirm assets -> calibration -> generate -> export。
- 刷新页面，确认项目、分镜、导出状态仍从 API 恢复。
- 记录通过/失败步骤和关键截图或日志。

前端 render tests 继续保留，但不能替代 Browser dogfood gate。

## 5. Done 定义

本次 Local Runnable Alpha 完成必须满足：

- `npm run dev` 能启动本地系统，打开 `http://127.0.0.1:4310` 可登录进入工作台。
- README 或 local-dev 文档写清楚启动、测试、验证码 debug、常见错误。
- 创建项目和解析剧本等 idempotent 写操作使用真实 `Idempotency-Key`，不再依赖 `Date.now()` route key。
- 前端主链路动作调用真实 API；刷新后能从后端恢复当前项目、分镜和导出状态。
- `npm test` 全部通过。
- `npm run smoke:local` 通过。
- Browser dogfood gate 通过，证明真实页面主链路可运行。
- 三人任务清单中每张任务卡都能回答背景、交付能力、前置依赖、验证方式、异常处理、主链路贡献。

## 6. 明确不做

- 不引入 Next.js、React、Vue 或新的前端构建链。
- 不拆微服务。
- 不接真实生产数据库。
- 不把支付/额度强一致/Ops repair 作为本次完成门槛。
- 不重做视觉设计。
- 不把 dev server 当成最终生产 server。
