# P0 三人多阶段并行任务拆分

> Date: 2026-05-09  
> Owner posture: 第一性原理 / 长期主义 / 全栈系统架构  
> Purpose: 把 P0 落地拆成三个人可以多阶段并行推进、每天可执行、每周可验收、风险提前暴露的任务列表。

## 1. 架构师结论

我对这份任务拆分作为“开发执行蓝图”有 100% 信心。

这个 100% 信心的边界是：

- 它能让三个人知道自己做什么、为什么做、依赖谁、阻塞谁、怎么验收、失败时如何处理。
- 它能防止用假接口、假状态、纯函数绿灯来冒充主链路闭环。
- 它能把长期风险前置：租户泄漏、重复任务、Provider 重复扣费、资产覆盖、Credit 双结算、Ops 不可修复。
- 它不承诺工期一定准确，也不代表实现已经完成。实现质量、外部 Provider、支付/财税、部署环境仍需要独立 gate 验证。

如果后续任何任务无法回答本文第 2 节六个问题，它不能进入 `待开发`，只能停留在 `待澄清`。

## 2. 任务卡硬标准

项目真正落地，不靠任务数量多，而靠每个任务都能回答：

| 问题 | 必须回答到什么程度 |
| --- | --- |
| 背景是什么？ | 开发人员必须知道 what 和 why；说明不做会造成什么系统风险或用户断点。 |
| 交付什么能力？ | 写清楚可观察、可调用、可验收的能力，不写成“改某文件”。 |
| 依赖什么前提？ | 写清楚前置任务、数据表、合同、测试 harness、谁阻塞我、我阻塞谁。 |
| 怎么验证完成？ | 写清楚测试命令、验收 ID、E2E、日志证据或 runbook drill。 |
| 出错怎么处理？ | 写清楚错误码、重试、幂等、补偿、审计、manual review 或回滚路径。 |
| 是否推进主链路闭环？ | Yes/No；如果 No，必须说明服务哪个上线 gate。 |

当前仓库测试命令约定：

```bash
npm test -- <target...>
```

不要在任务卡里写未验证的 test runner。

P0 默认认证方式：面向国内用户，主路径采用中国大陆手机号验证码登录。Email 只作为发票/通知/未来海外账号适配字段，不作为 P0 登录主入口。

## 3. 三人责任边界

三人专属任务文档：

- 开发 A: `docs/superpowers/plans/2026-05-09-developer-a-platform-reliability-tasks.md`
- 开发 B: `docs/superpowers/plans/2026-05-09-developer-b-creator-domain-tasks.md`
- 开发 C: `docs/superpowers/plans/2026-05-09-developer-c-experience-qa-ops-tasks.md`

| 人员 | 角色 | 主责 | 明确不负责 |
| --- | --- | --- | --- |
| 开发 A | Platform / Reliability Owner | M1 平台基础、DB/迁移、认证、租户、权限、审计、幂等、Workflow/Task、Storage/Signed URL、Provider 副作用保护、Repair、Credit、Payment gate | 不写 Project/Shot 业务规则；不做 UI 假闭环 |
| 开发 B | Creator Domain Owner | Project、Script、Asset、Shot、Calibration、Generation、Export、Mock ModelGateway、P0-A 主链路后端 | 不绕过 Workflow/Task 创建长任务；不直接调用真实 Provider；不实现支付 |
| 开发 C | Experience / QA / Ops Owner | Web 工作台、真实 API 联调、E2E、错误体验、Runbook、Release、Admin/Ops Lite | 不用假 session、假项目状态、local-only task status 宣称闭环完成 |

共同规则：

- 状态名、operation name、event type 不能私自改。
- 所有主链路写操作必须经过 ActorContext、capability、tenant scope、idempotency。
- 每周验收只看可运行闭环和测试证据，不看“写了很多代码”。
- 任何 `manual_review` / `result_unknown` 不能只存在于数据库里，必须有 Ops 可见和可处理路径。

## 4. 主链路和阶段

P0-A 最小真实闭环：

```text
登录
  -> 创建项目
  -> 输入/解析剧本
  -> 确认关键资产
  -> 分镜/校准
  -> mock provider 生图
  -> immutable asset version
  -> 导出素材包 manifest
```

阶段拆分：

| 阶段 | 目标 | A | B | C | 出口标准 |
| --- | --- | --- | --- | --- | --- |
| B0 合同基线 | 状态/命令/事件/测试入口稳定 | 主责 | Review | Review | `npm test` 和 contracts gate 通过 |
| B1 M1 平台基础 | 真实 auth、租户、权限、审计 | A0-A3 主责 | Project/Script 测试草稿 | Auth UI/E2E harness | M1 persistence-backed tests 通过 |
| B2 M2 Skeleton | Project + Script Parse + durable workflow status | A4 Workflow/Task | B1/B2 主责 | C1-C3 | 登录 -> 创建项目 -> 解析 workflow -> 刷新恢复 |
| B3 M2 Closure | Asset/Shot/Calibration/Image/Export 闭环 | Storage/Signed URL 支持 | B3-B9 主责 | C4-C8 | P0-A mock provider E2E 通过 |
| B4 M3 Provider Safety | 真实 Provider dogfood 前安全 | A6 主责 | 生成链路接入 boundary | 故障体验/E2E | A-001 no-blind-retry 通过 |
| B5 M4 Reliability/Credit/Ops | 可恢复、可结算、可人工介入 | A7/A8 | 状态协作 | C9/C10 | Redis loss、lease、credit、manual review gates 通过 |
| B6 M5/M6 Commercial Beta | 支付、发布、回滚、运维验收 | A9 | credit 消费协作 | Release/Ops 验收 | payment callback、refund/invoice、rollback drill 通过 |

关键依赖：

```text
B0 Contracts
  -> A0 M1 schema/test harness
      -> A1 Auth/Session
          -> A2 Actor/Tenant
              -> A3 Audit
                  -> B1 Project/CreateProject
                  -> A4 Workflow/Task
                      -> B2 Script Parse
                          -> A-S1 Storage + B3/B4 Asset/Shot
                              -> B5 Asset Confirm
                                  -> B6 Calibration
                                      -> B7 Generate Image
                                          -> B9 Export
                                              -> C8 P0-A E2E
                                                  -> A6 Provider Safety
                                                      -> A7/A8 Reliability + Credit
                                                          -> A9 Payment
                                                              -> C9/C10 Release/Ops
```

## 5. 开发 A 任务

### A0: M1 Schema and Persistence Test Harness

| 字段 | 内容 |
| --- | --- |
| 背景 | M1 必须证明真实登录、真实租户、真实权限、真实审计。没有 schema/test harness，A1-A3 会退化成纯函数绿灯。 |
| 交付能力 | `login_challenges`、`auth_sessions`、`memberships`、`audit_events` 的最小 schema 和 persistence-backed 测试入口。 |
| 前置依赖 | M0.1 foundation SQL；Node test runner。 |
| 验证完成 | `npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts`。 |
| 出错处理 | schema/harness 无法证明 persistence 时，M1 不得退出；B/C 只能做测试、契约、E2E harness 草稿。 |
| 主链路 | Yes。它是登录、租户和创建项目的真实数据前提。 |

### A1: Phone-Code Auth and Server Session

| 字段 | 内容 |
| --- | --- |
| 背景 | 所有 P0 能力都必须在真实用户和真实 session 下运行，否则权限和数据隔离不可证明。 |
| 交付能力 | 用户通过中国大陆手机号验证码登录，系统创建可撤销 server-side session。 |
| 前置依赖 | A0；`users`、`login_challenges`、`auth_sessions`。 |
| 验证完成 | `M1-AUTH-001`、`M1-AUTH-002`；覆盖手机号规范化为 `+86` E.164、hash-only、consume once、expiry、resend/verify rate limit、lockout、session revoke。 |
| 出错处理 | `invalid_phone`、`code_expired`、`code_consumed`、`code_invalid`、`phone_mismatch`、`user_disabled`；明文 code/token 不落库、不进日志。 |
| 主链路 | Yes。它是“登录 -> 创建项目”的入口。 |

### A2: ActorContext, Capability, Tenant-Safe Query

| 字段 | 内容 |
| --- | --- |
| 背景 | 多租户系统最大风险是接口能跑但越权读写。权限必须在业务命令前生效。 |
| 交付能力 | 从 session 解析 ActorContext，用 `assertCapability` 和 tenant-safe query helper 阻止越权。 |
| 前置依赖 | A1；`organizations`、`workspaces`、`memberships`。 |
| 验证完成 | `M1-ORG-001`、`M1-ORG-002`、`M1-DB-001`；覆盖 401、403、disabled user、suspended org、missing membership、跨 org 查询。 |
| 出错处理 | command handler 前拒绝；记录 `traceId/userId/organizationId/reason`。 |
| 主链路 | Yes。它解锁 Project/Script/Shot 命令。 |

### A3: Audit Append Helper

| 字段 | 内容 |
| --- | --- |
| 背景 | 校准 skip、导出、Admin/Ops、退款都需要可追责。审计不能后补。 |
| 交付能力 | 追加式 audit event builder/repository，支持 actor/scope/target/reason/metadata。 |
| 前置依赖 | A2。 |
| 验证完成 | `M1-AUDIT-001`；敏感操作缺 reason 必须拒绝。 |
| 出错处理 | 高风险命令审计失败不得静默成功；低风险事件可进入 outbox repair。 |
| 主链路 | Yes。支撑校准 skip、导出和后续 Ops。 |

### A4: Workflow/Task/Attempt Execution Spine

| 字段 | 内容 |
| --- | --- |
| 背景 | P0 核心复杂度是长任务持久状态。Redis/BullMQ 不是真相源。 |
| 交付能力 | durable workflow/task/attempt，支持 create、claim、status query、finalization skeleton。 |
| 前置依赖 | A2、A3、M0.1 contracts、foundation SQL。 |
| 验证完成 | `npm test -- apps/backend/src/modules/workflow-task`；覆盖 double claim、finalization rollback、manual review aggregation。 |
| 出错处理 | worker crash 由 lease repair 接管；finalization 失败事务回滚；`result_unknown/manual_review_required` 不误聚合为 terminal。 |
| 主链路 | Yes。Parse、Generate、Export 都依赖它。 |

### A-S1: Storage Adapter and Signed URL

| 字段 | 内容 |
| --- | --- |
| 背景 | AssetVersion 和 Export 都引用对象存储。不能让业务模块拼公开 URL。 |
| 交付能力 | server-only storage adapter、object key scope、metadata、短期 signed URL。 |
| 前置依赖 | A2；AssetVersion/Export schema draft。 |
| 验证完成 | `npm test -- apps/backend/src/modules/storage`；跨租户 signed URL 必须 403。 |
| 出错处理 | 存储写失败返回 retryable infrastructure error；metadata 不完整禁止创建 AssetVersion。 |
| 主链路 | Yes。解锁输出资产和导出下载。 |

### A5: Operation-Scoped Idempotency Hardening

| 字段 | 内容 |
| --- | --- |
| 背景 | 刷新、双击、重试不能创建重复项目、重复 workflow、重复生成任务。 |
| 交付能力 | `CreateProject`、`ParseScript`、`GenerateShotImage`、`CreateExport` 接入 replay/conflict。 |
| 前置依赖 | A2、A4、B1/B2/B7/B9 对应命令；M0.1 idempotency helper。 |
| 验证完成 | IDEMP-003/004、R-002 相关测试。 |
| 出错处理 | same key/different hash -> `409 idempotency_conflict`；running 返回已有 workflow/task。 |
| 主链路 | Yes。保护主链路不因重复操作失真。 |

### A6: ProviderRequest Side-Effect Protection

| 字段 | 内容 |
| --- | --- |
| 背景 | 真实 Provider 可能扣费/产出。外部提交后崩溃不能盲目重试。 |
| 交付能力 | provider call 前持久化 request，`external_submission_started_at` 后进入保守恢复策略。 |
| 前置依赖 | A4、B7 Mock ModelGateway 接口。 |
| 验证完成 | A-001、R-026、R-027。 |
| 出错处理 | before accept 可安全重试；after accept lookup/manual review；payload redacted/hash/ref。 |
| 主链路 | Yes。它是真实 Provider dogfood 的硬门槛。 |

### A7: Queue/Worker/Outbox Repair

| 字段 | 内容 |
| --- | --- |
| 背景 | Redis 丢任务、worker crash、outbox 重放是 beta 前必遇问题。 |
| 交付能力 | queued task dispatch repair、stale running lease repair、outbox dispatch repair。 |
| 前置依赖 | A4、A6、outbox/inbox。 |
| 验证完成 | R-001、R-004、R-014、R-021。 |
| 出错处理 | duplicate repair no-op；provider ambiguous -> `result_unknown`；小批量锁定，不全表锁。 |
| 主链路 | No direct。服务 M4 reliability gate。 |

### A8: Credit Ledger and Reservation

| 字段 | 内容 |
| --- | --- |
| 背景 | 商业 beta 前，额度不能超卖、不能双结算。 |
| 交付能力 | append-only credit ledger、reservation envelope、allocation single settlement、balance drift repair。 |
| 前置依赖 | A4、A7、B7 generate task。 |
| 验证完成 | R-008、R-009、R-015、R-028。 |
| 出错处理 | single settlement 约束；read model 可从 ledger 修复；异常 Provider cost 不自动扣用户。 |
| 主链路 | Yes for P0-B commercial loop。 |

### A9: Commerce/Payment Gate

| 字段 | 内容 |
| --- | --- |
| 背景 | 支付错误是资金和合规事故，不能在 credit/outbox 未稳定前开工。 |
| 交付能力 | package/order/payment intent/callback/payment-to-credit/refund gate。 |
| 前置依赖 | A8、官方支付字段验证、商户能力、财税流程确认。 |
| 验证完成 | callback dedup、signature、amount mismatch、frontend return no grant、paid-without-credit repair。 |
| 出错处理 | 签名错误/金额币种商户 mismatch -> risk/manual review；重复回调 ACK 但不重复 grant。 |
| 主链路 | No for P0-A；Yes for P0-B commercial loop。 |

## 6. 开发 B 任务

### B1: Project/CreateProject and Script Storage

| 字段 | 内容 |
| --- | --- |
| 背景 | 创作闭环从真实项目和真实剧本开始，不能用前端临时状态代替。 |
| 交付能力 | 用户在工作区创建项目并持久化 script。 |
| 前置依赖 | A2 ActorContext；A3 Audit；M0.1 idempotency helper；project/script migration。 |
| 验证完成 | create-project success、invalid input、forbidden、replay、409 conflict。 |
| 出错处理 | 无权限 403；字段错误停留表单；duplicate replay 返回同一 project。 |
| 主链路 | Yes。 |

### B2: Script Parse Workflow with Mock Output

| 字段 | 内容 |
| --- | --- |
| 背景 | 这是第一个长任务，必须验证 workflow/task 状态和 mock provider finalization。 |
| 交付能力 | ParseScript 创建 workflow/task，mock provider 产出 episodes/assets/shots。 |
| 前置依赖 | A4、B1、M0.1 idempotency helper。A4 前只能做测试/契约草稿。 |
| 验证完成 | TC-P0-001、TC-P0-010、TC-P0-011、IDEMP-003。 |
| 出错处理 | parse failed 留在 repairable state；重复 parse 返回已有 workflow；worker 失败不写半截业务数据。 |
| 主链路 | Yes。 |

### B3: Asset and Immutable AssetVersion

| 字段 | 内容 |
| --- | --- |
| 背景 | 生成结果不可覆盖；版本历史是重生成、导出和审计的基础。 |
| 交付能力 | Asset 表达业务对象，AssetVersion 表达不可变二进制/输出版本。 |
| 前置依赖 | B2 candidate assets；A-S1 storage adapter。 |
| 验证完成 | version_number 单调递增、旧版本保留、metadata enrichment 安全。 |
| 出错处理 | version 写失败回滚 finalization；storage metadata 缺失进入 retryable failure。 |
| 主链路 | Yes。 |

### B4: Shot State and Current Pointer Safety

| 字段 | 内容 |
| --- | --- |
| 背景 | 分镜编辑和生成可能乱序完成，current pointer 必须由 active task/revision 保护。 |
| 交付能力 | Shot content/image/video 状态机和 current pointer guard。 |
| 前置依赖 | B3、A4。 |
| 验证完成 | R-011、R-012；stale completion 和 out-of-order regeneration。 |
| 出错处理 | 状态异常进入 repair/admin 可见；late result 不破坏当前图。 |
| 主链路 | Yes。 |

### B5: Public Asset Confirm

| 字段 | 内容 |
| --- | --- |
| 背景 | 资产确认是剧本解析到分镜/校准的业务门槛。 |
| 交付能力 | 关键角色/主要场景/关键道具确认、编辑、阻塞项计算。 |
| 前置依赖 | B2、B3、A2。 |
| 验证完成 | TC-P0-002；关键角色/场景未确认阻塞，关键道具提示但不阻塞。 |
| 出错处理 | 单卡保存失败不影响其他卡；无权限编辑 403。 |
| 主链路 | Yes。 |

### B6: Calibration Session and Gate

| 字段 | 内容 |
| --- | --- |
| 背景 | 校准必须是 durable business fact，不能是 UI 勾选。 |
| 交付能力 | 3 shot calibration session、pass/skip/override decision、batch generation backend gate。 |
| 前置依赖 | B4、B5、A3 audit。 |
| 验证完成 | TC-P0-003、TC-P0-009、R-016、R-024。 |
| 出错处理 | 选择数量错误拒绝；质量失败不能 pass；skip 需要 reason。 |
| 主链路 | Yes。 |

### B7: GenerateShotImage with Mock ModelGateway

| 字段 | 内容 |
| --- | --- |
| 背景 | 这是 P0-A 最核心能力，证明 AI 生成链路能被真实 task 驱动。 |
| 交付能力 | 单张/批量分镜图生成、部分成功、失败可重试、asset version finalization。 |
| 前置依赖 | A4/A5、B3/B4/B6。 |
| 验证完成 | TC-P0-004、TC-P0-012、R-002、R-016。 |
| 出错处理 | 单镜失败不影响其他镜；重复点击 replay existing task；失败 3 步内可重试。 |
| 主链路 | Yes。 |

### B8: GenerateShotVideo Minimum

| 字段 | 内容 |
| --- | --- |
| 背景 | PRD P0 包含单镜图转视频，但优先级低于生图，可用 mock provider 做最小闭环。 |
| 交付能力 | 当前图存在时发起 video task，完成/失败/stale 状态正确。 |
| 前置依赖 | B7。 |
| 验证完成 | TC-P0-006。 |
| 出错处理 | 无 current image 拒绝；旧视频不覆盖；失败可重试。 |
| 主链路 | Yes，补全 P0 素材能力。 |

### B9: Export Manifest

| 字段 | 内容 |
| --- | --- |
| 背景 | 导出是“剧本到素材包”的闭环终点，必须显式检查缺失资产。 |
| 交付能力 | 创建 export record/manifest，缺失资产清单明确。 |
| 前置依赖 | B3、B7、A-S1，至少一个 completed image。 |
| 验证完成 | TC-P0-007、TC-P0-014、R-017。 |
| 出错处理 | 缺失资产不静默失败；导出失败可重试；下载链接过期可刷新。 |
| 主链路 | Yes。 |

## 7. 开发 C 任务

### C1: Auth Flow UI

| 字段 | 内容 |
| --- | --- |
| 背景 | 用户路径必须从真实登录开始，不能只靠 API tests。 |
| 交付能力 | 登录 UI、验证码状态、session 恢复、未登录跳转。 |
| 前置依赖 | A1/A2 API。 |
| 验证完成 | auth-flow E2E：未登录跳转、登录成功进入项目入口、错误码展示。 |
| 出错处理 | 网络失败可重试；invalid/expired code 显示明确错误；不泄露 token/code。 |
| 主链路 | Yes。 |

### C2: Project Create and Script Input UI

| 字段 | 内容 |
| --- | --- |
| 背景 | 这是用户进入创作的第一屏，必须真实调用 CreateProject/ParseScript。 |
| 交付能力 | 项目创建表单、剧本输入、解析启动和 queued/loading 状态。 |
| 前置依赖 | B1/B2 APIs、C1 auth。 |
| 验证完成 | TC-P0-001；填表、提交、1 秒内 queued/loading、刷新后恢复。 |
| 出错处理 | 字段错误停留表单；duplicate replay 显示同一 workflow；409 给恢复提示。 |
| 主链路 | Yes。 |

### C3: Project Workspace Phase Navigation

| 字段 | 内容 |
| --- | --- |
| 背景 | 用户需要知道项目卡在哪一步，主 CTA 必须由后端状态驱动。 |
| 交付能力 | project phase + readiness flags 驱动阶段导航和主 CTA。 |
| 前置依赖 | B2 status query。 |
| 验证完成 | script_input、asset_review、shot_generation、exportable E2E。 |
| 出错处理 | 未知状态显示可恢复错误，不猜测下一步。 |
| 主链路 | Yes。 |

### C4: Public Asset Review UI

| 字段 | 内容 |
| --- | --- |
| 背景 | 资产确认是主链路第一个大量人工决策点。 |
| 交付能力 | 角色/场景/道具 tabs、资产卡片、编辑/确认、阻塞项展示。 |
| 前置依赖 | B5 APIs。 |
| 验证完成 | TC-P0-002；未确认关键资产阻塞，确认后可继续。 |
| 出错处理 | 保存失败单项提示；权限失败禁用编辑。 |
| 主链路 | Yes。 |

### C5: Shot List and Calibration UI

| 字段 | 内容 |
| --- | --- |
| 背景 | 校准是批量生成前的质量门槛，不能让用户绕过后端 gate。 |
| 交付能力 | 分镜列表、3 个校准槽位、生成校准、pass/skip 操作。 |
| 前置依赖 | B4/B6 APIs。 |
| 验证完成 | TC-P0-003、TC-P0-009。 |
| 出错处理 | 后端拒绝时展示 gate reason；校准失败显示失败项和重试入口。 |
| 主链路 | Yes。 |

### C6: Generation Status and Retry UX

| 字段 | 内容 |
| --- | --- |
| 背景 | 长任务体验是 PRD 核心，用户必须看到逐镜状态、失败和恢复路径。 |
| 交付能力 | generating/completed/failed/stale 展示、失败编辑和重试、刷新恢复。 |
| 前置依赖 | B7/B8 APIs、A4 task status。 |
| 验证完成 | TC-P0-004/005/006/011/012。 |
| 出错处理 | 单镜失败不阻塞其他镜；stale 输出保留但标记；重复点击不重复创建。 |
| 主链路 | Yes。 |

### C7: Export UI

| 字段 | 内容 |
| --- | --- |
| 背景 | 导出是素材交付终点，缺失资产必须清晰可见。 |
| 交付能力 | 导出模块、完整性检查、缺失项、incomplete confirmation、manifest/download 状态。 |
| 前置依赖 | B9 Export API。 |
| 验证完成 | TC-P0-007、TC-P0-014。 |
| 出错处理 | 缺失资产清单明确；导出失败提供重试和 traceId；下载链接过期可刷新。 |
| 主链路 | Yes。 |

### C8: P0-A E2E Regression Harness

| 字段 | 内容 |
| --- | --- |
| 背景 | 每周验收必须自动化证明主链路，否则会退化成人工口头完成。 |
| 交付能力 | 覆盖登录到导出的 P0-A E2E，以及关键异常回归。 |
| 前置依赖 | C1-C7，A/B 提供 fixtures。 |
| 验证完成 | `npm test -- apps/web/e2e/p0`；TC-P0-001 至 TC-P0-014 的 P0-A 子集。 |
| 出错处理 | flaky test 不能忽略，必须标阻塞并定位。 |
| 主链路 | Yes。 |

### C9: Observability, Runbook, Release

| 字段 | 内容 |
| --- | --- |
| 背景 | 能跑通不等于能上线。上线要能定位、回滚、复盘。 |
| 交付能力 | 日志字段规范、dashboard 指标、runbook、staging smoke、rollback drill。 |
| 前置依赖 | A/B 输出 trace/log/metric IDs。 |
| 验证完成 | ops drill：5 分钟内定位故障层；release checklist 和 rollback checklist 完整。 |
| 出错处理 | 每个 runbook 包含检测信号、查询入口、修复命令/人工处理、回滚条件。 |
| 主链路 | No direct。服务 M6 release gate。 |

### C10: Admin/Ops Lite Manual Intervention

| 字段 | 内容 |
| --- | --- |
| 背景 | Repair 和 manual_review 如果只有脚本和 runbook，线上问题会变成知道怎么修但没人能安全执行。 |
| 交付能力 | Ops 用户查看 stuck task、`result_unknown`、paid-without-credit、payment risk，并通过后端 command retry/settle/mark-reviewed。 |
| 前置依赖 | A3、A7、A8、A9、C9。 |
| 验证完成 | 普通用户 403；Ops 操作必须填写 reason；操作写 audit。 |
| 出错处理 | 操作失败显示 traceId；重复 settle/retry no-op 或稳定冲突；高风险 payment/credit 二次确认。 |
| 主链路 | No direct。服务 M4-M6 上线 gate。 |

## 8. 第一周建议分配

| 人员 | 主任务 | 辅助任务 | 周五验收物 |
| --- | --- | --- | --- |
| A | A0 schema/test harness + A1 Auth/Session | A2 ActorContext 测试红灯 | foundation-schema/identity tests 通过；organization tests 至少红灯可执行 |
| B | B1 CreateProject 测试草稿和 schema 对齐 | B2 ParseScript 依赖对齐 | CreateProject 可进入开发；ParseScript 等 A4 无歧义 |
| C | C1 Auth UI 壳和 E2E harness | C2 Project Create E2E 草稿 | auth-flow E2E 可启动；不使用假 session |

第一周禁止事项：

- B 不绕过 A2/A3 权限和审计实现 Project API。
- B 不在 A4 之前实现假 workflow/task 状态。
- C 不用假状态伪造项目已解析。
- A 不把 code/token 明文落库或写日志。
- 三人不私改 state/operation/event 名称。

## 9. 看板和验收

看板状态：

```text
待澄清 -> 待开发 -> 开发中 -> 待自测 -> 待联调 -> 待测试 -> 待验收 -> Done
阻塞中可从任意状态进入
```

进入 `待开发` 必须满足：

- 六个任务卡问题完整。
- 前置依赖明确。
- 验证方式明确。
- 异常处理明确。
- reviewer 明确。

进入 `Done` 必须满足：

- 测试/验收证据存在。
- 错误处理证据存在。
- 日志/trace/metric 证据存在或说明不需要。
- 文档更新或说明不需要。
- PR 引用 verification ID 或说明是前置工程任务。

每周验收：

- A 跑 contracts、M1/M4 reliability gate。
- B 展示领域状态和数据归属没有漂移。
- C 演示用户主链路和 E2E 结果。
- 三人共同更新风险表。

## 10. 第一性原理自检循环

### Loop 1: 是否按能力而不是文件拆分？

结论：是。任务围绕登录、租户、项目、解析、资产、分镜、校准、生图、导出、可靠性、支付、上线 gate 拆分。

### Loop 2: 是否存在“看起来完成但无法验证”的任务？

修复前风险：M1 可能靠纯函数测试过关。

修复：加入 A0 schema/test harness 和 M1 persistence-backed hard exit。

当前结论：已消除。

### Loop 3: 是否存在三人并行时互相踩踏？

修复前风险：B2 ParseScript 可能早于 A4 Workflow/Task。

修复：B2 明确等待 A4；等待期间只做测试/契约/fixture。

当前结论：可并行，但不允许绕过依赖。

### Loop 4: 是否漏掉失败恢复和上线能力？

结论：未漏。A6/A7/A8/A9/C9/C10 覆盖 Provider 副作用、repair、credit、payment、runbook、Admin/Ops。

### Loop 5: 是否可以事实性 100% 自信？

结论：对这份任务拆分作为执行系统可以 100% 自信，因为它覆盖：

- what/why
- 交付能力
- 前置依赖
- 验证证据
- 异常处理
- 主链路贡献
- 三人边界
- 阶段 gate
- 长期可靠性和商业化风险

边界：对“实际实现已经完成”不能 100% 自信；那需要按本文任务逐项实现并跑过 gate。

## 11. 最终决策

从 M1 开始执行，但必须先做 A0。

禁止跳过：

- 没有 A0，不允许 M1 退出。
- 没有 A2/A3，不允许 B1 真正落地 Project 写命令。
- 没有 A4，不允许 B2 真正实现 Script Parse workflow。
- 没有 A-S1，不允许 AssetVersion/Export 拼接公开 URL。
- 没有 A6，不允许真实 Provider dogfood。
- 没有 A8，不允许商业 beta 强额度闭环。
- 没有 C9/C10，不允许宣称 beta 可运营。
