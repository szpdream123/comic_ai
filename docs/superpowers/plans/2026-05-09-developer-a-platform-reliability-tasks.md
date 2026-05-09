# Developer A 任务包：平台 / 可靠性

> 日期：2026-05-09  
> 负责人：Developer A  
> 角色：平台 / 可靠性负责人  
> 使命：让 P0 的登录、租户、权限、审计、长任务、幂等、存储、Provider、Repair、Credit、Payment 都有可信基础。

## 1. A 可以立即开始吗？

可以。A 可以立即开始。

从 A0 和 A1 开始。这两项处于关键路径上，不依赖 B/C 的实现。

A 不应等待 UI 或创作者域代码。A 的首要任务是让平台基础变得不可伪造。

## 2. 不可妥协的规则

- P0 认证为中国手机验证码登录，而非邮箱验证码登录。
- 当前测试命令为 `npm test -- <target...>`。
- M1 不得在纯函数测试上退出。认证/会话、Actor 上下文、租户安全查询和审计需要有持久化支持或迁移支持的证据。
- 不要实现 Project/Shot 业务规则。只需提供 B 必须使用的平台边界。
- 完整手机号、明文验证码、明文会话令牌、Provider 密钥或敏感支付载荷不得进入日志。

## 3. A 需要向其他开发者交付的产出

| 消费者 | A 必须提供 | 阻塞项 |
| --- | --- | --- |
| B | ActorContext、能力检查、租户安全查询、审计辅助 | B1 Project/CreateProject |
| B | Workflow/Task/Attempt 执行骨架 | B2 Script Parse、B7 Generate Image、B9 Export |
| B/C | 存储适配器和签名 URL 服务 | AssetVersion、Export UI |
| B/C | 幂等辅助和命令语义 | 重复提交/刷新行为 |
| B/C/Ops | 修复作业、人工审核语义、trace/log ID | M4-M6 可靠性 |
| C | 稳定的认证/会话 API 和错误码 | C1 Auth UI/E2E |

## 4. 任务 A0：M1 Schema 和持久化测试工具

| 字段 | 内容 |
| --- | --- |
| 背景 | M1 必须证明真实登录、租户范围、权限和审计。如果没有 schema 和持久化测试，系统可能在纯工具函数上通过测试，但仍然不安全。 |
| 能力 | 添加 `login_challenges`、`auth_sessions`、`memberships` 和 `audit_events` 的 schema 层面以及持久化支持的测试工具。 |
| 前置条件 | M0.1 基础 SQL；Node 测试运行器。 |
| 验证 | `npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts` |
| 失败处理 | 如果 schema/工具无法证明持久化，M1 保持未完成状态，B/C 只能准备测试、契约和 fixtures。 |
| 主循环 | 是。它是登录 -> 项目创建的真正数据前提。 |

实现说明：

- 将此任务限制在平台事实范围内。
- 不要在此处添加 Project/Script/Shot 表。
- 证明明文认证密钥没有被建模为持久化列。

## 5. 任务 A1：手机验证码认证和服务器端会话

| 字段 | 内容 |
| --- | --- |
| 背景 | 每个 P0 命令必须在真实用户和真实会话下运行。以中国优先的用户期望手机验证码登录。 |
| 能力 | 中国内地手机验证码挑战、验证、服务器端会话创建、会话撤销/过期。 |
| 前置条件 | A0；`users`、`login_challenges`、`auth_sessions`。 |
| 验证 | `npm test -- apps/backend/src/modules/identity`；M1-AUTH-001 和 M1-AUTH-002。 |
| 失败处理 | `invalid_phone`、`phone_mismatch`、`code_expired`、`code_consumed`、`code_invalid`、`user_disabled`；发送/验证速率限制；达到最大尝试次数后锁定挑战。 |
| 主循环 | 是。它是登录 -> 项目入口。 |

实现说明：

- 将内地手机号标准化为 `+86` E.164 格式。
- 仅存储验证码/会话令牌的哈希值。
- 日志可包含掩码手机号或手机号哈希，不得包含完整手机号。
- 开发专用调试验证码端点必须受限，生产模式下不可用。

## 6. 任务 A2：ActorContext、能力、租户安全查询

| 字段 | 内容 |
| --- | --- |
| 背景 | 多租户泄露是致命性的。UI 隐藏不是权限强制执行。 |
| 能力 | 从会话解析 ActorContext；强制执行 membership/capability；提供租户安全查询辅助。 |
| 前置条件 | A1；users、organizations、workspaces、memberships。 |
| 验证 | M1-ORG-001、M1-ORG-002、M1-DB-001；`npm test -- apps/backend/src/modules/organization apps/backend/src/modules/shared/db`。 |
| 失败处理 | 在域写入前拒绝；稳定的 401/403；带有 `traceId/userId/organizationId/reason` 的结构化日志。 |
| 主循环 | 是。它解锁 Project/Script/Shot 命令。 |

实现说明：

- 租户级读取需要 `organizationId`。
- 项目级读取需要 `organizationId` 和 `projectId`。
- 跨组织负面测试是必须的。

## 7. 任务 A3：审计追加辅助

| 字段 | 内容 |
| --- | --- |
| 背景 | 校准跳过、导出、Admin/Ops、退款和人工结算需要问责。审计不能在后期才加装。 |
| 能力 | 追加专用审计事件构建器/仓库，包含 actor、scope、target、event type、reason、redacted metadata。 |
| 前置条件 | A2 ActorContext。 |
| 验证 | M1-AUDIT-001；`npm test -- apps/backend/src/modules/audit`。 |
| 失败处理 | 没有 reason 的敏感命令会失败。高风险审计失败会阻止命令成功。 |
| 主循环 | 是。它支持校准跳过、导出和 Ops。 |

## 8. 任务 A4：Workflow/Task/Attempt 执行骨架

| 字段 | 内容 |
| --- | --- |
| 背景 | P0 的难题是持久化长运行工作。Redis/BullMQ 是调度，不是事实源。 |
| 能力 | 持久化的 workflow/task/attempt 创建、认领、状态查询、终结骨架。 |
| 前置条件 | A2、A3、M0.1 契约、基础 SQL。 |
| 验证 | `npm test -- apps/backend/src/modules/workflow-task`；R-003、R-010、R-018/R-029。 |
| 失败处理 | Worker 崩溃由租约修复处理；终结回滚；`result_unknown` 和 `manual_review_required` 不会汇总为终止成功状态。 |
| 主循环 | 是。Script Parse、图像生成、视频和导出都依赖它。 |

## 9. 任务 A-S1：存储适配器和签名 URL

| 字段 | 内容 |
| --- | --- |
| 背景 | AssetVersion 和 Export 不得虚构存储 URL 或绕过租户检查。 |
| 能力 | 仅服务器端存储适配器、范围限定的对象键、元数据验证、短期签名 URL。 |
| 前置条件 | A2；AssetVersion/Export schema 草案。 |
| 验证 | `npm test -- apps/backend/src/modules/storage`；租户认证签名 URL 测试。 |
| 失败处理 | 存储写入失败是可重试的基础设施错误；不完整的元数据阻止 AssetVersion；跨租户下载返回 403 并记录日志。 |
| 主循环 | 是。它解锁生成输出和导出包下载。 |

## 10. 任务 A5：操作范围幂等性加固

| 字段 | 内容 |
| --- | --- |
| 背景 | 刷新、双击和重试不应创建重复的昂贵操作。 |
| 能力 | 为 CreateProject、ParseScript、GenerateShotImage、CreateExport 提供幂等重放/冲突处理。 |
| 前置条件 | A2、A4、B1/B2/B7/B9 命令实现。 |
| 验证 | IDEMP-003、IDEMP-004、R-002。 |
| 失败处理 | 相同 key/不同 hash -> `409 idempotency_conflict`；正在运行的命令返回现有的 workflow/task。 |
| 主循环 | 是。它保护主循环免受重复副作用的影响。 |

## 11. 任务 A6：ProviderRequest 副作用保护

| 字段 | 内容 |
| --- | --- |
| 背景 | 真实 Provider 可能收费或产生输出。外部提交开始后，盲目重试是不安全的。 |
| 能力 | 在调用前持久化 provider 请求；设置 `external_submission_started_at`；保守恢复策略。 |
| 前置条件 | A4；B7 mock ModelGateway 接口。 |
| 验证 | A-001、R-026、R-027。 |
| 失败处理 | 外部开始前：安全重试。外部开始后：查找/人工审核/result_unknown，不重复请求。 |
| 主循环 | 是。它是真实 Provider 试用前的硬性关卡。 |

## 12. 任务 A7：队列/Worker/Outbox 修复

| 字段 | 内容 |
| --- | --- |
| 背景 | Redis 丢失、Worker 崩溃和 Outbox 重放是正常的 beta 事件。 |
| 能力 | 排队任务调度修复、过期运行租约修复、Outbox 调度修复。 |
| 前置条件 | A4、A6、outbox/inbox。 |
| 验证 | R-001、R-004、R-014、R-021。 |
| 失败处理 | 重复修复为空操作；Provider 歧义变为 `result_unknown`；修复扫描使用小的锁定批次。 |
| 主循环 | 非直接。它服务于 M4 可靠性关卡。 |

## 13. 任务 A8：Credit 账本和预留

| 字段 | 内容 |
| --- | --- |
| 背景 | 商业 beta 不能超卖 Credit 或对同一次分配结算两次。 |
| 能力 | 追加专用 Credit 账本、预留信封、分配单次结算、余额漂移修复。 |
| 前置条件 | A4、A7、B7 生成任务。 |
| 验证 | R-008、R-009、R-015、R-028。 |
| 失败处理 | 单次结算约束；从账本修复读取模型；异常 Provider 成本不自动向用户收费。 |
| 主循环 | 对 P0-B 商业循环是必需的。 |

## 14. 任务 A9：Commerce/Payment 关卡

| 字段 | 内容 |
| --- | --- |
| 背景 | 支付错误是财务和合规事件。不要在 Credit/Outbox 可靠性稳定之前实现。 |
| 能力 | 包/订单/支付意图/回调/支付转 Credit/退款关卡。 |
| 前置条件 | A8、正式支付字段、商户账户能力、财务/税务确认。 |
| 验证 | 回调签名、回调去重、金额不匹配、前端返回不授权、已支付未到账修复。 |
| 失败处理 | 签名/金额/货币/商户不匹配 -> 风险/人工审核；重复回调 ACK 但不重复授权。 |
| 主循环 | 对 P0-A 否；对 P0-B 商业循环是必需的。 |

## 15. 第一周计划

| 天 | 重点 | 预期证据 |
| --- | --- | --- |
| 第 1 天 | A0 schema/测试工具 | 基础 schema 测试先失败后通过 |
| 第 2 天 | A1 手机挑战/会话测试 | identity 测试覆盖手机号标准化/哈希/消费/撤销 |
| 第 3 天 | A1 HTTP/会话集成 | auth handler 测试通过；无明文泄露 |
| 第 4 天 | A2 红色测试 | organization/tenant 测试因缺少服务而失败 |
| 第 5 天 | A2 最小实现或明确阻塞项 | org/tenant 测试通过或阻塞项明确 |

## 16. 信心检查

我 100% 确信 A 可以立即开始，因为 A 拥有关键路径，且其首批任务不依赖 B 或 C。唯一不可接受的路径是让 M1 在没有持久化支持的证明的情况下通过。
