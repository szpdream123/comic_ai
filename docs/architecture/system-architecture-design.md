# Comic AI 系统架构设计方案

> 版本：v0.9
> 状态：已完成 M0 文档级 Contract Freeze，可进入实现计划和机器可验证契约生成；仍不是“代码已就绪”版本。Schema/API/DB/事件契约需要按 `p0-m0-contract-freeze.md` 生成并验证，P0-B 可靠性编码前仍需完成对应恢复/对账/结算测试门禁。详见 §16（阶段准入表）。
> 关联 PRD：`docs/product/reelmate-core-replication-prd.md`
> 决策记录：`docs/architecture/decision-log.md`
> 状态字典：`docs/architecture/p0-state-dictionary.md`
> 数据模型草案：`docs/architecture/p0-data-schema-draft.md`
> 执行与恢复规格：`docs/architecture/p0-execution-and-recovery-spec.md`
> 实现基线：`docs/architecture/p0-implementation-baseline.md`
> M0 冻结记录：`docs/architecture/p0-m0-contract-freeze.md`

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [范围与非目标](#2-范围与非目标)
3. [核心业务模型](#3-核心业务模型)
4. [架构总览](#4-架构总览)
5. [关键架构决策](#5-关键架构决策)
6. [数据架构](#6-数据架构)
7. [接口与集成设计](#7-接口与集成设计)
8. [非功能性需求](#8-非功能性需求)
9. [可靠性与容灾设计](#9-可靠性与容灾设计)
10. [安全设计](#10-安全设计)
11. [可观测性设计](#11-可观测性设计)
12. [部署与运维设计](#12-部署与运维设计)
13. [风险、权衡与债务](#13-风险权衡与债务)
14. [演进路线](#14-演进路线)
15. [验证方案](#15-验证方案)
16. [阶段准入表](#16-阶段准入表)

---

## 1. 背景与目标

### 1.1 业务背景

本产品复刻 AI 漫剧创作平台 **ReelMate（万兴剧厂）** 的核心体验，目标是打造一个从剧本到分镜图/分镜视频/素材导出的完整 AI 创作工具链。

当前行业痛点：
- AI 视频/图像生成工具碎片化，创作者需要在多个工具间切换
- 资产一致性难以保证——同一角色在不同分镜中五官、服装不一致
- 长任务管理缺乏可靠的状态追踪和失败恢复机制
- 缺乏对生成任务的成本和额度管控，商业运营不可持续

### 1.2 核心目标（可验证，标注归属阶段）

| 目标维度 | 量化指标 | 归属阶段 | 验证方式 |
| --- | --- | --- | --- |
| 核心闭环 | 从创建项目到首批分镜图完成，核心阶段 ≤ 12 个 | P0-A | 用户路径验收测试 |
| 用户体验 | 剧本解析点击后 1 秒内进入 loading/queued 状态 | P0-A | 前端性能测试 |
| 长任务反馈 | 所有超过 5 秒的任务展示进度或阶段状态 | P0-A | 功能验收 |
| 单任务恢复 | 用户从失败态到重新发起任务 ≤ 3 步 | P0-A | 可用性测试 |
| 部分成功 | 批量分镜中单个分镜失败不影响其他分镜完成 | P0-A | 集成测试 |
| 商业支撑 | 支持数十个客户团队，日均数千条生成任务 | P0-B | 压测验证 |
| 额度管控 | 生成前预估额度校验 + 事务内额度占用，100% 阻止超额创建 | P0-B | 并发集成测试 |
| 可靠性 | 核心链路可用性 ≥ 99.5%，Redis 丢失后可基于 PostgreSQL 重建调度 | P0-B | 故障演练 |
| 资产安全 | 生成资产不可变版本化，重生成不覆盖历史结果 | P0-A | 功能验收 |
| 成本对账 | 每条生成任务有完整的额度预留→消耗链路，成本可对账 | P0-C | 对账查询验证 |

> **注意：** P0-A 只做同步余额校验 + 单任务幂等防重，不承诺强并发额度正确性。事务内 100% 防超额是 P0-B 的实现。两者不矛盾——这是 P0-A 有意识的简化。

### 1.3 成功标准

成功标准按发布门槛拆分，避免用商业 beta 的可靠性要求约束内部 alpha，也避免让内部 alpha 误进入真实商业场景。

| 阶段 | 发布性质 | 必须满足 | 明确不承诺 |
| --- | --- | --- | --- |
| P0-A | Internal Alpha / 内部 dogfood | 创作者能跑通剧本到素材包闭环；任务有持久状态展示；失败后可重试；重生成不覆盖旧资产；租户隔离和签名 URL 授权通过；真实供应商调用具备最小副作用保护 | 商业 SLA；Redis 丢失自动恢复；强并发额度正确性；完整成本对账；自动 unknown 对账 |
| P0-B | Commercial Beta Gate / 小规模商业 beta | 运维 5 分钟内能定位失败层级；Redis 丢失可恢复；Worker 崩溃可恢复；额度预留和结算 100% 防超额；`result_unknown` 和 `manual_review_required` 有可操作闭环 | 多供应商成本优化；完整质量自动审查；复杂退款/多退少补 |
| P0-C | Commercial Ops Hardening / 可运营商业版本 | 多供应商可运营；供应商成本可回填和对账；质量审查增强；失败聚合和批量重试可用 | 公共模型网关外部化；多活；后付费账单 |

阶段共同标准：未来抽取模型网关为独立服务、拆分微服务或增加更复杂账务时，不重写核心业务模型。

### 1.4 长期主义原则

本架构设计的核心理念：

> **架构设计的本质，是在约束条件下，为长期演进选择一组清晰、可验证、可维护的权衡。**

我们遵循以下第一性原理：

1. **持久事实优于快速调度**：PostgreSQL 是任务状态、业务所有权、成本、审计的唯一真相源；Redis/BullMQ 仅是执行调度器
2. **业务状态与执行状态分离**：Workflow/Task 记录描述执行过程；Project、Asset、Shot、Export、Credit 记录描述业务事实
3. **昂贵操作必须幂等**：AI 生成昂贵、缓慢且易失败。每个工作流创建、任务执行、供应商请求、资产版本创建、额度消费和导出包生成都需要幂等策略
4. **版本优于变异**：生成资产是不可变版本。重生成创建新版本并移动当前指针，历史版本保留用于审计和回滚
5. **模块化单体优先，服务提取后置**：P0 后端是一个可部署的模块化单体，具有严格的内部领域边界。服务仅在运营压力证明边界值得提取成本后才分离

---

## 2. 范围与非目标

### 2.1 P0 实施切片：三阶段交付

P0 当前同时包含核心闭环、可靠性硬件和商业运营能力，一次性实现风险过高。建议将 P0 切为三个子阶段，先交付核心闭环可验证，再补齐可靠性和运营硬化：

#### P0-A：Internal Alpha / 核心闭环可用（必须最先交付）

目标：创作者能从剧本走到分镜图/视频，最小可用。P0-A 只允许内部 dogfood 或白名单演示，不作为商业 beta 对外承诺。

1. 创建项目 + 剧本输入
2. 剧本解析（生成剧集结构、角色/场景/道具候选）
3. 资产确认与编辑（角色、场景、道具）
4. 分镜拆解
5. 风格校准（3 张代表性校准图）
6. 单个/批量生成分镜图
7. 单个分镜编辑与重生成（保留旧版本）
8. 单个分镜图转视频
9. 任务状态展示与单任务失败重试
10. 基础额度校验（同步余额校验 + 单任务幂等防重；不承诺强并发额度正确性；"100% 阻止超额创建"推迟到 P0-B）
11. 导出素材包
12. 最小 ProviderRequest 副作用保护：每个供应商调用前持久化 `client_request_id` / `provider` / `capability` / `task_id` / `submitted_at` / `status`；外部提交前写入 `external_submission_started_at`；提交后崩溃或超时进入最小 `result_unknown`，禁止盲目重试
13. Admin Lite 只读状态查看：项目、任务、ProviderRequest、错误码；用于内部排查，不提供人工结算和供应商禁用能力

**P0-A 不包含：** Outbox 恢复、完整 ProviderRequest 自动对账、额度预留/释放/对账、Admin/Ops 手动结算、完整账本对账、多供应商路由、商业 SLA。

**真实供应商约束：** 如果 P0-A 接入真实付费供应商，必须实现第 12 项最小副作用保护；否则 P0-A 只能使用 mock/stub 或无真实成本供应商。

#### P0-B：Commercial Beta Gate / 可靠性硬化（P0-A 验证通过后交付）

目标：系统在故障时行为可预期、可恢复。

1. 事务性 Outbox 分发 + Redis → PostgreSQL 修复分发器
2. 完整 `result_unknown` / `manual_review_required` 状态机 + ProviderRequest 自动/人工对账流程
3. 任务租约恢复（`locked_until` + `heartbeat_at` + 修复作业）
4. Admin/Ops 面板基础功能（卡住任务查询、手动重试、手动结算、供应商状态、供应商禁用）
5. 额度预留 + 分配 + 单次结算（追加式账本 + 部分唯一索引）
6. 供应商请求预创建持久化（`external_submission_started_at` 边界）
7. Worker 最终化原子事务

#### P0-C：Commercial Ops Hardening / 商业化硬化（P0-B 验证通过后交付）

目标：多供应商运营、成本可对账、质量可审查。

1. 多供应商路由（主/备、健康检查、熔断）
2. 供应商实际成本回填 + 成本对账
3. 完整额度结算矩阵（cancel/unknown/partial_success 各场景语义）
4. 失败任务聚合 + 批量重试
5. 质量审查增强（自动化 + 模型辅助 + 人工审查）
6. 完整审计事件

**理由：** P0-A 先让产品进入可体验状态，P0-B 再补齐可靠性底座，P0-C 最后硬化商业运营。避免"每一块都刚好没做完"。

### 2.2 P1/P2/P3 范围

| 优先级 | 能力 | 处理方式 |
| --- | --- | --- |
| P1 | 批量视频生成、视频合成、项目消耗明细、失败任务聚合 | 影响效率，核心闭环可先不依赖 |
| P1 | 完整生成历史列表 | P0 只要求不覆盖旧结果 |
| P2 | 工具箱、成员邀请、角色细权限、站内通知、版本回滚/对比/备注 | 增强体验 |
| P3 | 小说库、剧本库、复杂付费套餐、客户审片、移动端、完整审核流 | 后置 |

### 2.3 明确不做的事（或延迟到后续阶段）

| 事项 | 说明 |
| --- | --- |
| 不自研推荐系统 | 仅提供基础的剧本解析和资产提取 |
| 不建设多活 | 全 P0 阶段只支持单区域高可用 |
| 不做移动端适配 | 仅桌面 Web 端 |
| 不做像素级视觉复刻竞品 UI | — |
| 不复刻竞品底层技术架构 | — |
| 不对外暴露模型网关 API | 模型网关仅为内部能力（P3 再外部化） |
| 不支持实时协作 | 不支持多人同时编辑同一项目 |
| P0-A 不做多供应商路由 | P0-B 引入；P0-A 只要求 ProviderAdapter 抽象和一个供应商或 mock/stub 实现 |
| P0-A 不做完整额度预留/释放/对账 | P0-B 引入；P0-A 只做同步余额校验和幂等防重 |
| P0-A/P0-B 不做供应商实际成本回填 | P0-C 引入；P0-A/P0-B 用估算值作为实际消耗 |
| P0-A/P0-B 不做复杂退款/多退少补 | P1 引入 |
| P0 不做后付费账单 | P1 引入 |

---

## 3. 核心业务模型

系统架构的根不是框架，而是业务模型。模型错了，微服务、缓存、消息队列都只是放大错误。

### 3.1 领域模型总览

```
Organization（组织）
  └── Workspace（工作区）
       └── Project（项目）
            ├── Script（剧本）
            │    └── Episode（剧集）
            ├── Asset（资产）
            │    ├── Character（角色）
            │    ├── Scene（场景）
            │    └── Prop（道具）
            ├── Shot（分镜）
            │    ├── Image（分镜图）
            │    └── Video（分镜视频）
            ├── CalibrationSession（风格校准会话）
            ├── Workflow（工作流）
            │    └── Task（任务）
            │         └── Attempt（执行尝试）
            ├── CreditReservation（额度预留）
            └── Export（导出包）
```

### 3.2 核心实体与生命周期

#### 3.2.1 项目（Project）

项目的状态决定用户当前应处于哪个工作流阶段，是整个系统的"导航地图"。

**设计原则：将"阶段"和"就绪度"拆开。** Project 状态承担太多聚合语义会导致歧义：项目到底是 `image_partial_failed` 还是 `exportable`？某些分镜有图、某些有视频，项目是什么状态？

推荐拆为两层：

```
// 粗粒度阶段：决定用户看到哪个模块
project_phase:
  script_input
  asset_review
  shot_generation
  export

// 细粒度就绪度标志：决定各操作是否可用
readiness_flags:
  has_completed_images      // 是否有已完成的图片
  has_completed_videos      // 是否有已完成的视频
  has_exportable_assets     // 是否有可导出资产
  has_partial_failures      // 是否有部分失败
  calibration_required      // 是否需要校准
  calibration_passed        // 校准是否已通过
```

**工作台路由规则：**

| project_phase | 触发条件 | 最早未完成模块 | 主 CTA |
| --- | --- | --- | --- |
| `script_input` | 无剧本或解析失败 | 剧本模块 | 上传/粘贴剧本 → 解析 |
| `asset_review` | `calibration_required = true` 且未完成 | 公共资产模块 | 确认关键角色和主要场景 |
| `shot_generation` | `calibration_passed = true` 且无已完成分镜图 | 分镜模块 | 批量生成分镜图 |
| `export` | `has_exportable_assets = true` | 导出模块 | 导出素材包 |

**关键规则：**
- 失败不是单一终态。P0 使用局部失败状态，不把整个项目置为 `failed`
- `parsing` 阶段（即 `script_input` 的解析子状态）期间禁止编辑输入
- 就绪度标志在资产/分镜状态变更时重新计算（最终一致，非实时强一致）
- 默认模块的选择逻辑：`project_phase` 指向最早未完成的模块，而非固定映射

**Phase 状态流转：**
```
script_input → asset_review → shot_generation → export
     ↑              ↑               ↑
     └── 解析失败/重新解析     └── 校准失败/重新校准
```

用户始终可以回到前面的 phase 进行修改（如修改剧本后重新解析）。

#### 3.2.2 分镜（Shot）

分镜是整个系统的核心生产单元。一个分镜承担一个核心信息点。

**设计原则：将内容状态、图片状态、视频状态拆为独立字段。** 混入一个巨大枚举会导致"图片成功但视频失败""图片 stale 但旧视频仍可查看""内容修改后只标记某些产物 stale"等场景无法自然表达。

推荐 Shot 使用独立维度：

```text
// 内容维度
shot.content_status:    draft | ready | stale
shot.content_revision:  integer（每次内容编辑 +1）

// 图片维度
shot.image_status:              draft | ready | generating | completed | failed | stale
shot.current_image_asset_version_id:  nullable
shot.active_image_task_id:             nullable

// 视频维度
shot.video_status:              not_ready | ready | generating | completed | failed | stale
shot.current_video_asset_version_id:  nullable
shot.active_video_task_id:             nullable
```

**各维度状态机：**

图片状态：
```
draft → ready → generating → completed
           ↘ failed
completed → stale → generating（新一轮重生成）
```

视频状态：
```
not_ready → ready（图片 completed 后派生）
ready → generating → completed
           ↘ failed
completed → stale → generating
```

内容状态：
```
draft → ready（核心信息点 + 画面描述齐全）
ready → stale（内容编辑后 content_revision + 1）
```

**维度之间的联动规则：**
- 内容编辑（`content_revision + 1`）→ `image_status` 和 `video_status` 中的 `completed` 变为 `stale`
- 新的图片生成成功 → 如果 `video_status = ready` 且图片变了 → `video_status → stale`
- 用户可只重新生成图片而不影响视频，也可只重新生成视频而不影响图片
- `video_status = not_ready` → 图转视频按钮禁用或隐藏
- 活跃的生成意图（`active_image_task_id` / `active_video_task_id`）保护并发更新——只有匹配意图的尝试结果才能更新当前指针

**关键规则：**
- 分镜对白超过 40 字时标记"建议拆分"
- 重生成创建新版本，旧版本保留（不可变版本原则）

这种设计的优势：避免了 `image_completed`、`video_ready`、`video_completed`、`image_stale`、`video_stale` 混在一个枚举中，每种状态组合都能自然存在。

#### 3.2.3 任务执行模型（Workflow → Task → Attempt）

三层模型是系统可靠性设计的基石：

```
Workflow（业务级流程）
  └── Task（逻辑工作单元）
       └── Attempt（具体执行尝试）
```

**Workflow 类型：**
- 剧本解析工作流
- 资产提取工作流
- 风格校准工作流
- 批量分镜图生成工作流
- 单个分镜视频生成工作流
- 导出打包工作流

**Task 状态机：**
```
queued → running → succeeded
queued → canceled
running → cancel_requested → canceled / succeeded / failed
queued → failed
running → failed
running → result_unknown → manual_review_required
```

**关键不变量：**
- `queued` 可取消；`running` 只能请求取消，不保证立即停止
- `succeeded` 和 `failed` 不可逆，只能创建新任务
- `result_unknown` 绝不因超时而自动变为 `failed`（供应商可能已扣费）
- 失败任务必须保留错误类型、错误信息和重试入口
- 批量任务的父任务状态由子任务聚合得出，`manual_review_required` 和 `result_unknown` 优先于终态

#### 3.2.4 资产与版本（Asset → AssetVersion）

```
Asset（描述业务含义）→ AssetVersion（描述不可变二进制输出）
```

**关键规则：**
- 资产描述业务含义（名称、类型、描述、状态、是否为关键资产）
- 资产版本描述不可变输出（存储位置、内容类型、大小、校验和、来源任务/尝试/供应商请求）
- 重生成创建新版本，更新当前指针
- 当前指针更新受活跃生成意图保护——只有匹配 `active_generation_task_id` 或 `content_revision` 的尝试结果才能更新指针
- 陈旧尝试的迟到结果存储为历史版本，但不成为当前版本

#### 3.2.5 额度与成本模型

```
CreditReservation（工作流级预留信封）
  └── CreditReservationAllocation（任务级结算单元）
       ├── Consume（消耗）
       └── Release（释放）
```

**额度生命周期：**
1. **预估**：创建生成类工作流前，根据任务范围估算总消耗
2. **预留**：在创建工作流的同一数据库事务中完成额度校验和占用
3. **分配**：批量工作流按可计费任务粒度拆分预留为分配单元
4. **结算**：任务成功后消耗；任务失败/取消后释放；异常态保持占用
5. **审计**：所有额度变更以追加式账本记录，余额为读模型

**关键不变量：**
```
available = sum(available_delta)
reserved = sum(reserved_delta)
consumed = sum(consumed_delta)
available + reserved + consumed = 总授予额度 + 净调整额度
```

### 3.3 哪些状态不可逆？

| 状态 | 不可逆原因 |
| --- | --- |
| 任务 `succeeded` / `failed` | 执行事实不可更改，只能创建新任务 |
| 尝试 `succeeded` / `failed` | 历史执行事实 |
| 资产版本 | 不可变二进制输出 |
| 账本条目 | 追加式会计记录，余额为派生读模型 |
| 额度分配 `consumed` / `released` | 单次结算，受唯一约束保护 |
| 供应商请求 `succeeded` / `failed` | 外部服务调用的历史事实 |
| 审计事件 | 不可变合规记录 |

### 3.4 哪些规则必须强一致？

| 场景 | 强一致要求 | 实现方式 |
| --- | --- | --- |
| 创建生成工作流 + 额度预留 | 必须在同一事务 | PostgreSQL 事务 + 行锁 |
| 任务认领 + 创建尝试 + 租约 | 必须在同一事务 | 条件更新 + FOR UPDATE |
| Worker 最终化 | 本地事实原子写入 | 单一 PostgreSQL 事务 |
| 额度分配结算 | 一个分配只能结算一次 | 行锁 + 部分唯一索引 |
| 当前资产指针更新 | 只有活跃意图的完成才更新 | `content_revision` / task_id 校验 |
| 供应商请求预创建 | 外部调用前持久化 | 外部调用前提交 provider_requests 行 |

### 3.5 哪些场景可以最终一致？

| 场景 | 一致性级别 | 实现方式 |
| --- | --- | --- |
| 工作流状态聚合 | 最终一致 | 子任务状态变更触发工作流重新聚合 |
| 余额缓存字段 | 最终一致 | 从账本条目重新计算的对账查询 |
| UI 通知 | 最终一致 | Outbox 事件 → 消费者 |
| 跨模块事件 | 最终一致 | 事务性 Outbox + Inbox 去重 |
| 质量审查结果 | 最终一致 | 异步审查后写入 |

---

## 4. 架构总览

### 4.1 系统分层

```
┌─────────────────────────────────────────────────────────────┐
│                     前端应用层                                │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │   Creator Workspace  │  │   Operations/Admin Console  │   │
│  │   (Next.js Web App) │  │   (Next.js Web App)         │   │
│  └─────────┬───────────┘  └──────────────┬──────────────┘   │
└────────────┼──────────────────────────────┼──────────────────┘
             │                              │
             ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API 网关层                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          NestJS API (Fastify Adapter)                 │   │
│  │  • 认证/授权 Guard                                    │   │
│  │  • 租户上下文解析                                      │   │
│  │  • 命令/查询路由                                      │   │
│  │  • Schema 验证 (Zod)                                  │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    业务服务层（模块化单体）                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Identity │ │Organization│ │ Project  │ │    Asset     │   │
│  │   Auth   │ │ Workspace │ │ Script   │ │ AssetVersion │   │
│  │          │ │Membership │ │ Episode  │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Shot   │ │Workflow- │ │  Model-  │ │Credit-Billing│   │
│  │          │ │   Task   │ │ Gateway  │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Quality- │ │  Export  │ │ AdminOps │ │    Audit     │   │
│  │  Review  │ │          │ │          │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
└─────────────────────────┬────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    基础设施层                                  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │PostgreSQL │ │   Redis   │ │  Object   │ │   Secret   │  │
│  │ (真相源)  │ │ (BullMQ)  │ │  Storage  │ │ Management │  │
│  └───────────┘ └───────────┘ └───────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    外部依赖                                   │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────────┐  │
│  │ 模型供应商 │ │ 模型供应商 │ │   CDN     │ │   Email    │  │
│  │ Provider A│ │ Provider B│ │           │ │  Service   │  │
│  └───────────┘ └───────────┘ └───────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 核心模块与边界

| 模块 | 拥有（Owns） | 不拥有（Does Not Own） |
| --- | --- | --- |
| **Identity/Auth** | 用户、登录、会话、认证适配器 | 组织额度、项目权限 |
| **Organization** | 组织、工作区、成员、角色/能力解析 | 项目工作流状态 |
| **Project** | 项目、剧本、剧集、项目生命周期/状态转换 | 模型供应商调用 |
| **Asset** | 资产、资产版本、对象元数据、存储指针 | 供应商路由 |
| **Shot** | 分镜、分镜状态、分镜资产链接、图像/视频当前指针 | 二进制存储实现 |
| **Workflow-Task** | 工作流、任务、尝试、执行状态、认领协议、最终化协调 | 作为最终产品真相的业务状态 |
| **Model-Gateway** | 供应商适配器、供应商能力矩阵、供应商请求记录、路由/回退、错误归一化 | 创作者工作流状态、额度策略 |
| **Commerce-Payment** | 积分包、订单、支付单、支付渠道事件、退款、开票元数据 | 积分余额、生成消耗、模型供应商调用 |
| **Credit-Billing** | 额度账本、额度预留、供应商成本条目、余额读模型 | 供应商 HTTP 调用 |
| **Quality-Review** | 验证事实、审查要求、质量失败原因 | 供应商路由、资产存储 |
| **Export** | 导出工作流、导出清单、导出包资产 | 对象存储实现 |
| **Admin-Ops** | 跨模块运营读模型、安全运营命令（重试、禁用供应商、手动解决） | 直接跨模块写（必须通过命令） |
| **Audit** | 审计事件创建、敏感操作轨迹 | 经济账本真相（与 Credit 分离） |
| **Storage** | 存储适配器、签名 URL、对象元数据辅助 | 业务资产含义 |
| **Notification** | 任务完成通知（P1） | 工作流执行真相 |

### 4.3 依赖方向（核心约束）

```
API Controllers
  → Application Commands / Queries
    → Domain Modules
      → Infrastructure Adapters
```

**铁律：**
- 创作模块不直接引入供应商 SDK——所有模型调用经过 `Model-Gateway`
- `Model-Gateway` 不拥有创作者领域状态——它返回值，不修改 Shot/Project
- `Commerce-Payment` 拥有现金/支付事实，但不拥有积分余额
- `Credit-Billing` 消费任务和供应商事实，但不执行供应商调用
- `Storage` 是适配器，不是业务模块——不包含业务资产含义
- `Admin-Ops` 可以跨模块读，但只能通过领域命令写
- `Audit` 只记录事件，不判断事件——与经济账本分离

### 4.4 进程拓扑

一份代码库，三个进程入口：

```
apps/backend/src/entrypoints/
  ├── api.ts          # API 服务进程
  ├── worker.ts       # Worker 进程（按队列类型横向扩展）
  └── dispatcher.ts   # Outbox 分发器 / 调度器进程
```

**数据流：**

```
API 命令
  → PostgreSQL 事务
    → 创建 workflow/task 记录
    → 创建 outbox 事件
  → Outbox dispatcher
    → 入队 BullMQ job
  → Worker
    → PostgreSQL 事务中认领 task/attempt（条件更新 + FOR UPDATE）
    → 调用领域处理器
    → 需要时调用 Model-Gateway
    → PostgreSQL 事务中最终化（Atomic）
      → 更新 attempt/task 状态
      → 创建资产版本
      → 更新当前指针（仅当意图匹配）
      → 创建额度账本条目
      → 创建审计事件
      → 创建 outbox 事件
```

### 4.5 租户与权限模型

```
Organization（组织）
  └── Workspace（工作区）
       └── Project（项目）
            ├── Script（剧本）
            ├── Episode（剧集）
            ├── Asset（资产）
            ├── Shot（分镜）
            ├── Workflow（工作流）
            └── Export（导出包）
```

**P0 角色矩阵：**

| 能力 | Owner/Admin | Producer | Creator | Viewer |
| --- | --- | --- | --- | --- |
| 创建项目 | ✓ | ✓ | 可选，默认否 | ✗ |
| 查看项目 | ✓ | ✓ | ✓ | ✓ |
| 编辑剧本/资产/分镜 | ✓ | ✓ | ✓ | ✗ |
| 发起生成任务 | ✓ | ✓ | ✓ | ✗ |
| 跳过风格校准 | ✓ | ✓ | ✗ | ✗ |
| 导出素材包 | ✓ | ✓ | 可选，默认否 | ✗ |
| 查看额度/消耗 | ✓ | ✓ | 可选，默认否 | ✗ |

**权限执行规则：**

每个请求解析：
```
actor → organization → workspace → role/capability
```

- 授权在服务端命令/查询边界强制执行（`docs/architecture/p0-implementation-baseline.md:114-117` 中的 `resolveActorContext` 和 `assertCapability`）
- UI 隐藏仅是可用性层，不是安全层
- 无权限操作必须隐藏或禁用入口，直接访问接口时返回无权限
- 所有项目内资产、分镜、任务默认继承项目权限
- 租户字段（`organization_id`）在所有租户拥有表上非空
- 列表查询必须包含租户过滤器（租户数据安全不变量）

---

## 5. 关键架构决策

以下每个决策都遵循同一结构：**决策 → 原因 → 替代方案 → 取舍 → 风险**。

### D-001：模块化单体而非微服务

**决策：** P0 采用模块化单体架构（NestJS + Fastify），具有严格的内部领域边界。后端 API、Worker、Outbox Dispatcher 共享同一代码库但作为不同进程运行。

**原因：**
- P0 团队规模小，需要开发速度和事务一致性
- 先建立稳定的模块边界，未来提取服务时才不会重写核心逻辑
- 单体让 Worker 可以复用所有领域模块（Shot、Asset、Credit），无需 RPC 开销

**替代方案：** 微服务从第一天开始（每模块独立部署）。

**取舍：** 牺牲了独立部署和独立扩容能力，换取了开发速度、事务一致性和运维简单性。

**风险：** 团队规模扩大后模块边界可能变差。缓解：架构设计已预留清晰的模块边界和事件驱动解耦路径（Outbox/Inbox 模式），未来可按领域提取为独立服务。

---

### D-002：PostgreSQL 是真相源，Redis/BullMQ 仅是调度器

**决策：**

```
PostgreSQL 拥有真相。
Redis/BullMQ 拥有调度。
```

**原因：**
- Redis 可能丢失、可能重复投递 job
- 业务真相、计费、审计历史必须持久且可恢复
- 任务状态、资产版本、额度账本、供应商请求记录必须存储在 PostgreSQL 中

**替代方案：** 使用 Redis 作为任务状态的真相源。

**取舍：** 增加了 Outbox 模式、租约机制和恢复逻辑的复杂度。但换取了系统在 Redis 故障后的可恢复性——可从 PostgreSQL 重建所有可执行工作。

**风险：** PostgreSQL 和 Redis 之间的"裂脑"问题。缓解：事务性 Outbox 模式（命令写 PostgreSQL + Outbox 事件在同一事务）、修复分发器可扫描 PostgreSQL 重建 BullMQ 任务。

---

### D-003：三层任务模型（Workflow → Task → Attempt）

**决策：**

```text
Workflow（业务级流程，如"批量分镜图生成"）
  → Task（逻辑工作单元，如"为分镜 12 生成图像"）
    → Attempt（具体执行尝试，如"第一次用主供应商，第二次用备用供应商"）
```

**原因：**
- Task 描述平台意图，Attempt 描述实际发生的执行
- 分离后才可能实现可靠重试、供应商故障转移、成本对账、失败分析、幂等性
- 额度/成本记录链接到不可变的 Workflow/Task/Attempt 标识符

**替代方案：** 单层任务模型（一个任务记录 + 重试计数）。

**取舍：** 增加了数据模型的复杂度。但换取了：
- 每次重试有独立的执行历史和供应商请求事实
- 供应商回退创建新 Attempt 而非覆盖旧记录
- 成本可精确归因到每一次尝试

**风险：** 三层模型可能过于复杂。缓解：实现了明确的状态映射和聚合逻辑。

---

### D-004：能力导向的模型网关

**决策：** 创作模块请求**能力**（Capability），不请求具体**供应商**（Provider）。

```
generate_image
generate_video_from_image
parse_script
extract_assets
split_storyboard_shots
moderate_input
quality_review
```

网关将能力映射到供应商适配器。P0-A 只要求抽象边界和一个供应商或 mock/stub 实现；P0-B 起支持主/备路由。

**原因：**
- 平台必须避免对单一视频/图像模型供应商的长期硬依赖
- P0-B 至少支持两个供应商（一主一备），用于路由、故障转移和成本比较；P0-A 先验证 ProviderAdapter 边界
- 网关设计为未来可提取的独立服务——创作模块永远不直接调用供应商 SDK

**替代方案：** 创作模块直接调用供应商 API。

**取舍：** 增加了网关抽象层和供应商适配器接口的复杂度。但换取了：
- 供应商替换不影响业务代码
- 统一的成本追踪、错误归一化、重试策略
- 外部化路径清晰

**风险：** 网关可能过于薄弱——只包装 HTTP 调用而不归一化能力、成本、失败和输出元数据。缓解：供应商适配器声明完整的能力契约（支持客户端请求 ID、状态查询、取消、重试安全性、计费触发器等）。

---

### D-005：不可变资产版本 + 意图保护的当前指针

**决策：** 生成资产是不可变版本。重生成创建新版本，移动当前指针。当前指针更新受活跃生成意图保护。

**原因：**
- PRD 明确要求重生成不覆盖旧结果
- 图像、视频、参考、剧本、导出需要可审计性和回滚能力
- 资产变异会破坏任务和导出的可重现性

**替代方案：** 直接更新资产记录（覆盖）。

**取舍：** 增加了存储成本和 Asset/AssetVersion 双表模型。但换取了：
- 用户可查看生成历史（P1）
- 并发重生成不会互相覆盖
- 陈旧尝试的迟到结果不会成为当前版本

**风险：** 版本累积导致存储膨胀。缓解：P1 设计资产版本生命周期和淘汰策略。

---

### D-006：追加式额度账本

**决策：** 使用追加式账本记录额度授予、预留、消耗、释放和调整。余额字段为从账本派生的读模型。

**原因：**
- 余额字段是有用的读模型，但不是审计轨迹
- 供应商成本、内部额度和用户可见配额可能发散，除非每个经济事件都被记录
- 仅检查余额而不预留额度会导致超额创建

**替代方案：** 可变的余额字段 + 消耗流水表。

**取舍：** 增加了账本查询和对账的复杂度。但换取了：
- 完整审计轨迹
- 余额对账能力（`available + reserved + consumed = total granted + net adjustments`）
- 批量工作流的任务级精细结算

**风险：** 余额缓存可能与账本漂移。缓解：提供对账查询检测漂移，修复读模型。

---

### D-007：事务性 Outbox 解决 PostgreSQL 与 Redis 的裂脑

**决策：** 使用事务性 Outbox 模式进行队列分发和跨模块事件。

**原因：**
- PostgreSQL 是真相源，但 BullMQ 在数据库事务之外
- 在 PostgreSQL 中创建任务并在 Redis 中入队不应产生裂脑

**替代方案：** 在应用代码中直接调用 BullMQ（非事务性）。

**取舍：** 增加了 Outbox 分发器进程和事件处理复杂度。但换取了：
- 命令写领域记录和 Outbox 事件在同一 PostgreSQL 事务
- 跨模块消费者使用 Inbox/processed-event 表去重
- 修复作业可重新发布未处理的 Outbox 事件

---

### D-008：Worker 最终化原子事务

**决策：** Worker 成功最终化在一个 PostgreSQL 事务中完成所有本地事实的写入。

**替代方案：** 分步更新（先更新任务状态，再创建资产版本，再记录额度）。

**取舍：** 增加了长事务的风险（尤其在批量处理中锁竞争）。但换取了：
- 不可能出现"任务标记成功但资产版本未创建"的不一致状态
- 不可能出现"额度已扣除但资产未创建"
- 不可能出现"当前指针已更新但审计事件未记录"

**风险：** 长事务可能影响并发性能。缓解：事务中锁定的行最少化，批量工作流按任务粒度拆分事务。

---

### D-009：供应商请求预创建（Provider Request Pre-Call Persistence）

**决策：** 供应商请求行在外部调用前创建并提交到 PostgreSQL。

**原因：**
- 供应商调用是昂贵的外部副作用
- 如果 Worker 在供应商接受工作后崩溃，平台需要一个稳定的记录用于查询、对账和成本核算

**替代方案：** 先调用供应商，再创建请求记录。

**取舍：** 增加了一次额外的数据库写入。但换取了：
- 崩溃恢复的可靠基础
- `external_submission_started_at` 的时间戳边界清晰区分"未尝试外部调用"和"已尝试外部调用"
- 手动结算有稳定的 `client_request_id` 可供查询

---

### D-010：Unknown Provider Result 永不静默变为 Failed

**决策：** `result_unknown` 绝不仅因查询 TTL 过期而变为普通 `failed`。

**原因：**
- 供应商可能已经接受工作、产生输出或扣除了成本
- 将 unknown 视为普通 failure 会错误地释放用户额度并隐藏异常供应商成本

**替代方案：** TTL 过期后自动标记为 `failed` 并释放额度。

**取舍：** 增加了 `manual_review_required` 状态和手动结算流程的运营负担。但换取了：
- 财务数据完整性（不因超时而丢失成本信息）
- 用户额度不被错误释放（分配到 unknown 尝试的额度保持占用直到结算）

---

### D-011：TypeScript 全栈 + 类型化查询构建器

**决策：** Next.js 前端 + NestJS 后端（Fastify 适配器）+ PostgreSQL + Kysely 风格类型化查询构建器。

**原因：**
- 前后端共享 TypeScript 类型和契约
- Schema 需要显式约束、行锁、复合租户键和对账查询——不适合"魔法 ORM"
- NestJS 提供模块边界、DI、Guard、Pipe 和 Worker 友好的结构

**替代方案：** Python/FastAPI 或 Go 后端；Prisma/TypeORM 作为 ORM。

**取舍：** 放弃了 ORM 的便捷性（自动迁移、关联加载）。换取了：
- 对 SQL 的完全控制（行锁、复合键、部分索引、对账查询）
- 类型安全的查询（编译时检查列名和类型）
- 与状态字典的代码生成集成

---

### D-012：P0 实施切片（P0-A → P0-B → P0-C）

**决策：** P0 一次性实现过重，切为三个子阶段按序交付。

**切片：**

```
P0-A: Internal Alpha 核心闭环可用（剧本 → 分镜图/视频 → 导出 + 最小供应商副作用保护）
P0-B: 可靠性硬化（Outbox 恢复、租约、账本、ProviderRequest 对账）
P0-C: 商业化硬化（多供应商路由、成本回填、质量审查增强）
```

**原因：**
- P0 当前范围同时包含核心闭环、可靠性模型和商业化运营能力，团队小/周期短时"每一块都刚好没做完"
- P0-A 先让产品进入可验证状态，P0-B 再补齐可靠性，P0-C 最后硬化商业运营
- 先交付用户价值，再交付运营可靠性

**替代方案：** P0 一次性交付所有功能。

**取舍：** 牺牲了"一开始就完美可靠"的愿景，但换取了：
- 核心产品更快进入用户手中有反馈
- 可靠性投资发生在核心闭环已验证之后
- 避免在不可靠的假设上过度投资基础设施

**风险：** P0-A 可能因为缺少完整可靠性措施导致早期用户体感差。缓解：P0-A 仅限内部 dogfood/白名单演示，仍包含基础重试、失败提示和真实供应商最小副作用保护；P0-B 紧接其后交付商业 beta 能力。

---

## 6. 数据架构

### 6.1 数据架构原则

1. **租户拥有表包含非空 `organization_id`**：工作区/项目拥有表包含非空 `workspace_id` 和 `project_id`
2. **昂贵操作有幂等键和唯一约束**：防止重复创建和重复计费
3. **执行事实追加友好**：Attempt、ProviderRequest、账本条目、审计事件、Outbox 事件不作为可变日志重写
4. **生成资产为不可变版本**：业务记录指向选中的当前版本
5. **余额快照为读模型**：额度账本条目是会计真相
6. **供应商结果不确定性显式表示**：`result_unknown` 不作为普通失败隐藏

### 6.2 核心数据表族

```
┌────────────────────────────────────────────────────────────────┐
│                      身份与租户表族                               │
│  users | organizations | workspaces | memberships               │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│                      项目与内容表族                               │
│  projects | scripts | episodes | shots | shot_asset_links       │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│                      资产表族                                    │
│  assets | asset_versions                                        │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│                    执行与调度表族                                 │
│  workflows | tasks | task_attempts                              │
│  outbox_events | inbox_events                                   │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│                   供应商网关表族                                  │
│  provider_requests | provider_capabilities                      │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│                    额度与成本表族                                 │
│  credit_ledger_entries | credit_reservations                    │
│  credit_reservation_allocations | provider_cost_entries         │
└────────────────────────────────────────────────────────────────┘
                              │
┌────────────────────────────────────────────────────────────────┐
│              质量、校准、导出、审计表族                            │
│  quality_reviews | calibration_sessions                         │
│  calibration_items | calibration_decisions                      │
│  exports | audit_events                                         │
└────────────────────────────────────────────────────────────────┘
```

### 6.3 关键索引策略

| 表族 | 推荐索引 | 原因 |
| --- | --- | --- |
| 租户高容量表 | `(organization_id, created_at DESC)` | 租户隔离 + 时间范围查询 |
| 项目拥有表 | `(organization_id, project_id, created_at DESC)` | 项目作用域查询 |
| 任务队列表 | `(status, scheduled_at)`、`(organization_id, status)` | 任务认领 + 运营查询 |
| 供应商请求表 | `(organization_id, provider, status, submitted_at DESC)` | 供应商故障分析 |
| 账本条目表 | `(organization_id, dedup_key) UNIQUE` | 账本本地去重；API 命令幂等以 `idempotency_records` 为准 |
| 结算唯一索引 | `(organization_id, reservation_allocation_id) WHERE entry_type IN ('consume', 'release')` | 防止双重结算 |

### 6.4 数据一致性策略

| 一致性级别 | 实现方式 | 适用场景 |
| --- | --- | --- |
| **强一致** | PostgreSQL 单事务 + 行锁（`FOR UPDATE`） | 任务认领、最终化、额度结算 |
| **因果一致** | 事务性 Outbox → Inbox 去重 | 跨模块事件 |
| **最终一致** | 对账查询 + 后台修复作业 | 余额缓存、工作流聚合 |
| **显式不确定性** | `result_unknown` + `manual_review_required` | 供应商结果不明 |

### 6.5 数据生命周期

| 数据类别 | 保留策略 | 原因 |
| --- | --- | --- |
| 财务与审计记录 | 永久保留 | 完整性 + 对账 |
| 供应商请求元数据 | 长期保留 | 故障分析 + 成本对账 |
| 敏感载荷（prompt/文件） | 哈希或脱敏后存储 | 隐私 + 合规 |
| 用户内容（剧本/图片/视频） | P0 支持归档和软删除 | 用户隐私权 |
| 日志 | 不默认存储原始敏感 prompt/媒体 | 安全 |

### 6.6 哪些数据是事实源？哪些可以冗余？

| 事实源 | 可冗余（读模型/缓存） |
| --- | --- |
| `credit_ledger_entries` — 额度账本条目 | `organizations.credit_balance_cached` — 余额缓存 |
| `workflows` / `tasks` / `task_attempts` — 执行记录 | UI 展示的任务列表（可由原始数据重新渲染） |
| `provider_requests` — 供应商请求记录 | Admin 面板的聚合统计 |
| `asset_versions` — 不可变资产版本 | CDN 缓存的图片/视频 |
| `calibration_decisions` — 校准决策 | 项目状态中的 `calibration_passed`（派生） |

---

## 7. 接口与集成设计

### 7.1 内部服务接口设计

#### 7.1.1 API 设计原则

- **命令式端点**：昂贵的操作使用 `POST` 命令，接受或派生幂等键
- **查询端点**：返回 PostgreSQL 持久状态，绝不返回 BullMQ-only 状态
- **租户作用域**：所有端点路径下隐含租户上下文
- **错误语义**：统一错误码体系，区分客户端错误、服务端错误、业务规则错误

#### 7.1.2 核心 API 端点

**项目与剧本：**
```
POST   /projects                              # 创建项目
GET    /projects                              # 项目列表（按更新时间倒序）
GET    /projects/:projectId                   # 项目详情（包含当前状态）
POST   /projects/:projectId/script/parse      # 解析剧本（幂等）
GET    /projects/:projectId/script            # 剧本/剧集结构
```

**资产：**
```
GET    /projects/:projectId/assets             # 资产列表（按类型筛选）
POST   /projects/:projectId/assets/confirm     # 确认公共资产（幂等）
POST   /projects/:projectId/assets/:assetId/generate-ref  # 生成参考图
```

**分镜：**
```
GET    /projects/:projectId/shots              # 分镜列表
POST   /projects/:projectId/shots/split        # 拆解分镜（幂等）
GET    /projects/:projectId/shots/:shotId      # 分镜详情
POST   /projects/:projectId/shots/:shotId/image/generate   # 生成单张分镜图
POST   /projects/:projectId/shots/:shotId/video/generate   # 图转视频
POST   /projects/:projectId/shots/batch-generate           # 批量生成分镜图
```

**风格校准：**
```
POST   /projects/:projectId/calibration/generate     # 生成校准图（幂等）
POST   /projects/:projectId/calibration/pass         # 通过校准
POST   /projects/:projectId/calibration/skip         # 跳过校准（需权限）
```

**导出：**
```
POST   /projects/:projectId/export              # 导出素材包
GET    /projects/:projectId/exports             # 导出记录
```

**运营管理：**
```
GET    /admin/organizations                     # 组织列表/详情
GET    /admin/tasks?status=running&stuck=true   # 卡住任务查询
POST   /admin/tasks/:taskId/retry               # 手动重试
POST   /admin/providers/:providerId/disable     # 禁用供应商
GET    /admin/costs                             # 成本/利润视图
GET    /admin/audit                             # 异常事件审计
```

#### 7.1.3 幂等设计

所有创建/状态变更类接口支持幂等键。单纯的 `(organization_id, idempotency_key)` 不足以防止同一个客户端 UUID 被不同接口误命中。

**幂等键协议：**

```
POST /projects/:projectId/script/parse
Header: Idempotency-Key: <client-generated-uuid>
```

**数据库层面的精确约束：**

```sql
UNIQUE (organization_id, operation_name, idempotency_key)
```

并按需保存额外元数据：

| 幂等记录字段 | 说明 |
| --- | --- |
| `organization_id` | 租户 scope |
| `operation_name` | 操作名（如 `script/parse`、`shots/batch-generate`） |
| `idempotency_key` | 客户端生成的唯一键 |
| `request_hash` | 请求体哈希（相同 idempotency_key 但不同 request_hash → 冲突） |
| `resource_scope` | 目标资源（如 `project_id`） |
| `response_resource_id` | 返回的 workflow_id 或 task_id |
| `expires_at` | 幂等键过期时间（建议 24 小时） |

**冲突语义：**

| 场景 | 行为 | 返回 |
| --- | --- | --- |
| 相同 `(org, operation, key, hash)` | 返回已有结果 | 200 + 已有 resource id |
| 相同 `(org, operation, key)` 但不同 `hash` | 冲突 | 409 `idempotency_conflict` |
| 运行中的任务再次请求 | 不创建新任务 | 返回已有 workflow/task 状态 |
| `expires_at` 已过期的幂等记录 | 允许创建新记录 | 覆盖或新增 |

**规则：**
- 数据库层面通过 `UNIQUE (organization_id, operation_name, idempotency_key)` 约束保证
- Worker 层面通过 Task/Attempt 状态检查保证即使 BullMQ 重复投递也不重复执行
- "按钮禁用"仅是用户体验优化，不是唯一防护——刷新页面后从数据库幂等记录恢复运行中状态
- 幂等记录可定期清理（`expires_at` 早于当前时间 + 宽限期）

#### 7.1.4 错误码体系

| 类别 | HTTP 状态码 | 错误码 | 含义 |
| --- | --- | --- | --- |
| 客户端错误 | 400 | `validation_error` | 输入验证失败 |
| 客户端错误 | 401 | `unauthenticated` | 未认证 |
| 客户端错误 | 403 | `forbidden` | 无权限 |
| 客户端错误 | 404 | `not_found` | 资源不存在 |
| 客户端错误 | 409 | `idempotency_conflict` | 幂等冲突 |
| 业务规则 | 422 | `insufficient_credits` | 额度不足 |
| 业务规则 | 422 | `project_budget_exceeded` | 项目预算超限 |
| 业务规则 | 422 | `calibration_required` | 需先完成风格校准 |
| 业务规则 | 422 | `task_in_progress` | 任务运行中，不可重复提交 |
| 业务规则 | 422 | `asset_incomplete` | 资产不完整 |
| 服务端错误 | 500 | `internal_error` | 内部错误 |
| 服务端错误 | 503 | `provider_unavailable` | 供应商不可用 |

### 7.2 外部供应商集成

#### 7.2.1 供应商适配器接口

```typescript
interface ProviderAdapter<TInput, TOutput> {
  capabilities(): ProviderAdapterCapabilities;

  submit(input: {
    clientRequestId: string;
    payload: TInput;
    tenantContext: { organizationId; workspaceId?; projectId? };
    traceContext: { workflowId; taskId; attemptId };
  }): Promise<ProviderSubmitResult<TOutput>>;

  lookup?(input: {
    clientRequestId?: string;
    providerRequestId?: string;
  }): Promise<ProviderLookupResult<TOutput>>;

  cancel?(input: {
    clientRequestId?: string;
    providerRequestId?: string;
  }): Promise<ProviderCancelResult>;
}
```

#### 7.2.2 供应商错误归一化

| 平台错误码 | 重试策略 |
| --- | --- |
| `provider_timeout_before_accept` | 无副作用时可重试 |
| `provider_timeout_after_accept` | 移至 `result_unknown`；执行对账 |
| `provider_rate_limited` | 延迟重试或故障转移 |
| `provider_rejected_content` | 不自动故障转移 |
| `provider_failed_retryable` | 重试或故障转移 |
| `provider_failed_non_retryable` | 任务失败 |
| `provider_output_invalid` | 失败或质量审查 |
| `provider_cost_unknown` | 继续业务流但标记运营 |
| `provider_result_unknown` | 对账或人工审查 |

#### 7.2.3 供应商异步回调策略

Adapter 接口目前包含 `submit / lookup / cancel`，但许多图像/视频供应商使用异步回调模式（webhook）通知结果，而非仅依赖轮询。

**P0 选择：轮询优先 + Webhook 可选基础设施**

P0 默认使用轮询（`lookup`），因为 webhook 需要公网可达的端点、签名校验、回调幂等等基础设施。但如果供应商的轮询成本过高或延迟过大，可启用 webhook。

**Webhook 模式（当供应商支持时）：**

```typescript
interface ProviderAdapter<TInput, TOutput> {
  // ... 现有方法 ...

  // Webhook 支持声明
  supportsWebhook?(): boolean;

  // Webhook 回调处理（由 HTTP endpoint 调用）
  handleWebhook?(input: {
    rawBody: Buffer;
    signature: string;
    headers: Record<string, string>;
  }): Promise<WebhookResult<TOutput>>;
}

type WebhookResult<TOutput> = {
  clientRequestId: string;
  status: "succeeded" | "failed" | "accepted";
  output?: TOutput;
  providerRequestId?: string;
  error?: NormalizedProviderError;
  cost?: ProviderCost;
};
```

**Webhook 端点设计：**

```
POST /api/webhooks/providers/:provider  # 各供应商的 webhook 接收端点
```

**Webhook 安全要求：**
1. **签名校验**：每个供应商适配器验证 webhook 签名（HMAC-SHA256 或供应商特定方案）
2. **回调幂等**：相同 `clientRequestId` + 相同终态的重复回调被忽略
3. **重复回调去重**：通过 `provider_events` 表 + `(provider, event_id)` 唯一约束实现
4. **回调与轮询竞态**：webhook 先到达 → 更新 ProviderRequest 状态 → 轮询发现已终态则跳过
5. **回调处理幂等**：回调处理在同一事务中更新 ProviderRequest + 触发 Worker 最终化

**Provider Events 表（webhook 模式）：**

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `provider` | 供应商名称 |
| `provider_event_id` | 供应商侧事件 ID（来自 webhook 回调） |
| `client_request_id` | 关联的本地请求 ID |
| `event_type` | `completed`、`failed`、`progress` |
| `raw_payload_hash` | 脱敏后的载荷哈希 |
| `processed_at` | 处理时间 |
| `duplicate` | 是否为重复回调 |

唯一约束：`UNIQUE (provider, provider_event_id)` 防止重复处理。

**P0-A 阶段：** 仅使用轮询（`lookup`），webhook 基础设施预留接口但不实现。
**P0-B 阶段：** 如供应商轮询成本过高，再实现 webhook 基础设施（签名校验 + 回调幂等 + 竞态处理）。

#### 7.2.4 供应商路由策略

```
每个能力 → 主供应商 + 备用供应商
路由考虑：供应商健康状态、配置的能力、速率限制、近期失败率
故障转移：创建新的 Attempt 和 ProviderRequest 记录
安全限制：内容安全失败不静默故障转移
运维控制：Admin/Ops 可禁用供应商或强制使用某供应商
```

### 7.4 额度结算的完整产品语义

账本模型在 §3.2.5 中已定义追加式记账规则。以下是面向产品和用户可见的结算矩阵——每种任务结局下，用户额度和供应商成本如何处理：

| 任务结局 | 用户额度 | 供应商成本 | 账本操作 | 说明 |
| --- | --- | --- | --- | --- |
| **queued 取消** | 释放全部预留 | 无成本 | `release` 分配的所有预留 | 用户主动取消未开始的任务 |
| **running 取消，供应商未 accept** | 释放预留 | 无成本 | `release` | 供应商未开始工作 |
| **running 取消，供应商已 accept** | 进入 `result_unknown` | 可能已产生成本 | 分配保持 reserved | 需供应商取消确认或对账后结算 |
| **任务成功** | 消耗预留额度 | 记录供应商成本 | `consume` | 正常完成 |
| **任务失败（可重试）** | P0-A 不释放，P0-B 释放 | 无成本或极少成本 | P0-B: `release` + 重试时重新预留 | 默认释放额度让用户重试 |
| **任务失败（不可重试）** | 释放预留 | 无成本 | `release` | 永久失败，归还额度 |
| **供应商内容安全拒绝** | 默认不扣额度 | 供应商可能已收费 | 记录 `provider_cost_entries(abnormal=true)` | 不扣用户额度；如供应商已扣费标记为异常成本 |
| **result_unknown（未结算）** | 分配保持 reserved | 状态未知 | 不 consume 不 release | TTL 过期后进入 manual_review |
| **manual_review_required** | 分配保持 reserved | 待人工判定 | 不自动结算 | 人工决定 consume / release / abnormal cost |
| **批量部分成功** | 成功的 consume，失败的 release，unknown 继续 reserved | 按任务粒度分别记录 | 按分配粒度独立结算 | 每个分配最多结算一次 |

**人工结算必须记录：**
- 审计事件（谁、何时、什么判断、原因）
- 账本调整（如果是 `adjustment` 类型）
- 供应商异常成本（如果是 `abnormal` 类型）

### 7.5 跨模块事件协议

使用事务性 Outbox/Inbox 模式进行跨模块事件通信：

```
事件类型                      发布模块             消费模块
workflow.completed            Workflow-Task         Project（更新项目状态）
task.succeeded                Workflow-Task         Shot（更新分镜状态）
task.succeeded                Workflow-Task         Credit-Billing（结算额度）
payment.succeeded             Commerce-Payment      Credit-Billing（发放购买积分）
payment.refund.succeeded      Commerce-Payment      Credit-Billing / Admin-Ops（退款后额度调整/审计）
credit.grant.created          Credit-Billing        Commerce-Payment / Notification（到账读模型/通知）
invoice.issued                Commerce-Payment      Admin-Ops / Notification（开票状态/通知）
asset.version.created         Asset                 Quality-Review（触发质量审查）
calibration.passed            Project               Shot（解锁批量生成）
export.ready                  Export                Notification（通知用户）
```

**事件消费去重：**
- 消费者使用 `inbox_events` 表，以 `(consumer_name, outbox_event_id)` 为唯一键
- 重放的 Outbox 事件不会产生重复副作用
- Worker 最终化事务中在同一事务写入 Outbox 事件

---

## 8. 非功能性需求

### 8.1 性能

| 阶段 | 指标 | 目标 | 测量方法 |
| --- | --- | --- | --- |
| P0-A | API 响应时间（简单查询） | P95 < 300ms | 应用层指标 |
| P0-A | API 响应时间（复杂查询） | P95 < 500ms | 应用层指标 |
| P0-A | 剧本解析启动反馈 | 点击后 1 秒内进入 loading/queued 状态 | 前端性能测试 |
| P0-A | 长任务状态可恢复 | 刷新页面后看到 PostgreSQL 持久状态，不重复创建任务 | 功能验收 |
| P0-B | API 响应时间（简单查询） | P95 < 100ms | 应用层指标 |
| P0-B | API 响应时间（复杂查询） | P95 < 300ms | 应用层指标 |
| P0-B | Worker 认领任务延迟 | P95 < 5 秒（从 Outbox 写入到 Worker 认领） | 队列延迟指标 |
| P0-B | 数据库连接池利用率 | 长期 < 60% | 数据库指标 |
| P0-B | 对象存储签名 URL 生成 | P99 < 50ms | 存储适配器指标 |

### 8.2 可用性

| 阶段 | 指标 | 目标 | 说明 |
| --- | --- | --- | --- |
| P0-A | 核心闭环可用性 | 内部 alpha 无 SLA；阻塞问题当天修复 | 仅内部 dogfood/白名单演示 |
| P0-A | 计划内维护窗口 | 可随内部测试安排 | 不对商业客户承诺 |
| P0-B | 核心链路可用性 | ≥ 99.5% | 项目创建到分镜图生成 |
| P0-B | 计划内维护窗口 | 夜间低峰，< 30 分钟 | 单区域部署受限 |
| P0-B | Redis 故障恢复 | < 10 分钟（从 PostgreSQL 重建） | 修复分发器自动扫描 |
| P0-B | Worker 崩溃恢复 | 租约过期 + 60 秒内修复作业处理 | 维护作业定期扫描 |

### 8.3 扩展性

| 阶段 | 维度 | 目标 | 扩展方式 |
| --- | --- | --- | --- |
| P0-A | Worker 并发 | 支持按任务类型配置基础并发 | 单 Worker 进程内配置 |
| P0-A | 数据库读取 | 通过租户索引和项目索引支撑内部 alpha | 当前通过索引优化保证 |
| P0-A | 对象存储 | 无本地磁盘依赖 | MinIO 本地开发 / 托管对象存储 |
| P0-B | Worker 并发 | 按队列和供应商能力独立扩展 | 水平扩展 Worker 容器 |
| P0-B | 数据库读取 | 连接池扩大 + 未来读写分离 | 当前通过索引优化保证 |
| P0-B | 供应商并发 | 每供应商配置并发限制 | 配置文件 + Admin/Ops 覆盖 |

### 8.4 安全性

详见第 10 节《安全设计》。

### 8.5 可观测性

详见第 11 节《可观测性设计》。

### 8.6 合规性

| 阶段 | 要求 | 实现 | 说明 |
| --- | --- | --- | --- |
| P0-A | 用户内容删除 | 支持归档和软删除 | P0-A 不支持硬删除 |
| P0-A | 敏感数据保护 | API Key 服务端存储，日志脱敏 | 永不发送到前端 |
| P0-A | 内容安全 | 供应商内容安全 + 平台基本策略 | 不静默绕过 |
| P0-B | 数据保留 | 审计日志保留 ≥ 180 天 | 商业 beta 合规基线 |
| P0-B | 运营审计 | 手动重试、手动结算、跳过校准均有审计事件 | Admin/Ops 可追踪 |

### 8.7 成本约束

| 维度 | P0 目标 |
| --- | --- |
| 基础设施 | Docker Compose 本地环境 + 托管服务生产环境 |
| 存储 | 对象存储（MinIO 本地开发 / 生产对象存储），成本低于 EBS |
| Worker 实例 | 按需扩缩容，空闲时低成本 |

---

## 9. 可靠性与容灾设计

### 9.1 设计哲学

> **以失败为前提设计。** 系统不是在"正常情况下"体现架构能力，而是在故障时体现。

### 9.2 故障场景与降级策略

| 阶段 | 故障场景 | 系统行为 | 恢复策略 |
| --- | --- | --- | --- |
| P0-A | 同步额度校验失败 | 创建任务时校验额度失败，任务不被创建 | API 返回 `insufficient_credits` 或 `503` |
| P0-A | Worker 在供应商调用后崩溃 | `provider_requests` 行已在调用前持久化；若 `external_submission_started_at` 已设置，任务进入最小 `result_unknown`，禁止盲目重试 | Admin Lite 查看 ProviderRequest，由内部人员人工处理；完整自动对账在 P0-B |
| P0-A | 对象存储不可用 | 新上传/生成失败，旧资产如已有 CDN 缓存可访问 | 任务失败且保留错误原因，不静默成功 |
| P0-B | 消息队列积压 | Worker 持续消费，新的 Outbox 事件持续入队 | 不影响 API 创建事实记录，通过 Outbox 解耦 |
| P0-B | Redis 完全丢失 | BullMQ job 丢失，但任务记录在 PostgreSQL 中安全 | 修复分发器扫描 `queued` 任务重建 BullMQ job |
| P0-B | 缓存雪崩 | 本项目不使用 Redis 缓存业务数据 | PostgreSQL 通过连接池和索引抗读取压力 |
| P0-B | 第三方（供应商）超时 | accept 前按安全策略重试；accept 后进入 `result_unknown` | Worker 超时配置 + 供应商适配器声明超时行为 + 对账 |
| P0-B | Worker 崩溃 | 租约过期后修复作业接管 | 租约（`locked_until` + `heartbeat_at`）机制 |
| P0-B | 数据库主库故障 | 应用不可用（单区域限制） | 依赖托管数据库的高可用能力 |

### 9.3 限流与熔断

| 机制 | 实现位置 | 说明 |
| --- | --- | --- |
| API 限流 | API Gateway / NestJS Guard | 按组织 + IP 限流 |
| 供应商并发控制 | Model-Gateway | 每供应商能力配置最大并发请求数 |
| Worker 并发控制 | BullMQ 队列配置 | 每个队列的 Worker 并发数 |
| 供应商熔断 | Model-Gateway | 近期高失败率 → 自动切换备用供应商 |

### 9.4 重试机制

| 场景 | 重试策略 | 说明 |
| --- | --- | --- |
| 任务认领失败（竞争） | 不重试，BullMQ job 结束 | 另一 Worker 已认领 |
| 供应商超时（accept 之前） | 自动重试（无副作用） | 供应商适配器声明 `retrySafety` |
| 供应商超时（accept 之后） | 移至 `result_unknown` | 不盲目重试 |
| 供应商速率限制 | 延迟重试或故障转移 | 创建新 Attempt |
| 供应商内容安全拒绝 | 不重试，不故障转移 | 任务标记 `failed` |
| 供应商临时故障 | 自动重试或故障转移 | 按 `safe_retry_modes` 配置 |
| Worker 最终化事务失败 | 整个事务回滚，任务保持可恢复状态 | 下次修复作业或重试周期处理 |

### 9.5 超时策略

| 超时类型 | 默认值 | 可配置 |
| --- | --- | --- |
| API 请求超时 | 30 秒 | 是 |
| Worker 租约超时 | 2 分钟 | 是 |
| Worker 心跳间隔 | 30 秒 | 是 |
| 供应商请求超时 | 按供应商能力配置 | 是（供应商适配器） |
| 供应商结果查询 TTL | 按供应商能力配置 | 是（`output_lookup_ttl_seconds`） |
| 签名 URL 过期 | 1 小时 | 是 |

### 9.6 备份与恢复

| 数据 | 备份策略 | 恢复目标 |
| --- | --- | --- |
| PostgreSQL | 托管数据库的自动备份 + 时间点恢复 | RPO < 1 小时，RTO < 30 分钟 |
| 对象存储 | 托管存储的跨区域复制 | 依赖存储服务 SLA |
| Redis | 不备份（可从 PostgreSQL 重建） | RPO = 0（数据不在 Redis 中），RTO < 10 分钟 |

### 9.7 容灾等级

P0 单区域部署：
- 依赖托管 PostgreSQL 的高可用
- 依赖托管对象存储的持久性
- Worker 和 API 通过容器编排自动重启
- Redis 丢失可重建

未来 P1 可考虑跨区域读取副本和冷备。

---

## 10. 安全设计

### 10.1 认证（Authentication）

- P0 使用自建身份系统，P0 主路径采用邮箱验证码登录，不依赖第三方认证供应商的数据模型
- 用户、组织、成员资格、角色和项目权限存储在平台数据库中
- 密码、OAuth 和 SSO 通过适配器接口预留，未来可插拔集成

### 10.2 授权（Authorization）

**权限模型：**
```
actor → organization → workspace → role/capability
```

**执行层级：**

| 层级 | 实现 | 说明 |
| --- | --- | --- |
| API Guard | NestJS Guard + 装饰器 | 每个请求解析角色上下文 |
| 命令验证 | 命令处理前 `assertCapability()` | 业务操作权限校验 |
| 查询过滤 | Repository/Query 层强制租户 scope | 数据库查询级过滤 |
| UI 隐藏 | 前端根据角色隐藏/禁用操作入口 | 仅可用性层，非安全层 |
| 签名 URL | 后端验证租户授权后才颁发 | 防止未授权对象存储访问 |

### 10.3 数据保护

| 数据类别 | 传输保护 | 存储保护 | 访问控制 |
| --- | --- | --- | --- |
| 用户密码 | HTTPS + bcrypt | 哈希存储 | 仅认证模块可读 |
| 供应商 API Key | HTTPS | 服务端 Secret Management | 永不发送到前端 |
| 用户内容（剧本/prompt） | HTTPS | 对象存储 + 脱敏日志 | 租户隔离 |
| 生成资产（图片/视频） | HTTPS + 签名 URL | 对象存储 + 租户范围签名 URL | 后端授权后颁发 |
| 审计日志 | 应用内 | PostgreSQL + 不可变记录 | 仅 Admin/Ops 可读 |
| 额度/成本数据 | HTTPS | PostgreSQL + 追加式账本 | 租户隔离 |

### 10.4 租户数据隔离

**多层防线：**

1. **Schema 层**：租户拥有表包含非空 `organization_id`；复合外键包含租户上下文
2. **查询层**：Repository 助手函数强制要求租户 scope 参数
3. **索引层**：高容量表索引以 `organization_id` 开头
4. **RLS 层**：代码库结构化以支持未来添加 PostgreSQL RLS，无需重写所有查询
5. **对象存储层**：签名 URL 创建是后端命令，在颁发 URL 前检查租户授权

**关键不变量：不应编写任何没有租户 scope 的列表或详情查询。这是核心数据安全不变量。**

### 10.5 内容安全

| 阶段 | 检查 | 处理 |
| --- | --- | --- |
| 供应商提交前 | 平台基本内容策略检查 | 拦截或标记 |
| 供应商返回 | 归一化供应商安全失败 | 不静默故障转移 |
| 生成后 | 质量审查模块标记 | 不自动分发 |

### 10.6 审计

所有敏感操作生成审计事件，包括：
- 创建项目
- 发起生成任务
- 跳过风格校准
- 额度授予/调整
- 手动重试/介入操作
- 删除/归档操作

**审计事件记录：**
```
actor_user_id + organization_id + event_type + target_type + target_id + metadata_json + timestamp
```

---

## 11. 可观测性设计

### 11.1 设计目标

> 用户任务失败，运维人员 5 分钟内能判断是 API、Workflow/Task、Model-Gateway、Provider、Credit-Billing、Storage 还是 PostgreSQL/Redis 问题。

### 11.2 日志规范

**结构化日志必须包含的上下文 ID：**

```
request_id       # 请求级别追踪
actor_id         # 操作用户
organization_id  # 租户
workspace_id     # 工作区（如适用）
project_id       # 项目（如适用）
workflow_id      # 工作流（如适用）
task_id          # 任务（如适用）
attempt_id       # 尝试（如适用）
provider_request_id  # 供应商请求（如适用）
```

**日志安全约束：** 日志不默认存储原始 prompt、文件内容、供应商 API Key。敏感内容脱敏或使用哈希。

### 11.3 指标监控

#### 技术指标

| 类别 | 具体指标 |
| --- | --- |
| **API 层** | 请求量、延迟（P50/P95/P99）、错误率（按状态码）、租户级别分布 |
| **队列层** | 队列深度、队列延迟（入队到认领的时间差）、积压告警 |
| **Worker 层** | 任务执行时长（按任务类型）、尝试成功/失败计数、Worker 心跳 |
| **供应商层** | 供应商延迟、供应商失败率（按错误码）、供应商成本、速率限制触发次数 |
| **数据库层** | 连接池利用率、慢查询、死锁检测、事务提交/回滚比率 |

#### 业务指标

| 类别 | 具体指标 |
| --- | --- |
| **项目漏斗** | 创建项目数、解析成功数、资产确认数、分镜生成数、导出数 |
| **生成任务** | 任务提交量、成功率（按任务类型）、部分成功率（批量任务）、平均生成时长 |
| **额度** | 额度消耗量（按组织）、预留/释放/消耗比率、异常成本事件 |
| **用户行为** | 活跃组织数、活跃用户数、关键路径完成率 |

### 11.4 链路追踪

- 每个请求/任务携带 trace context（workflow_id → task_id → attempt_id → provider_request_id）
- 日志与 trace context 关联，可追踪一个用户请求跨越 API → Outbox → BullMQ → Worker → Model-Gateway → Provider 的完整链路

### 11.5 告警策略

| 级别 | 触发条件 | 通知方式 | 响应时间 |
| --- | --- | --- | --- |
| **P0 - 紧急** | 核心 API 错误率 > 5%、所有供应商不可用、数据库连接池满 | 即时告警（叫醒人） | 5 分钟内响应 |
| **P1 - 重要** | 单供应商失败率异常、队列积压 > 10 分钟、Worker 大量崩溃 | 告警通知 | 30 分钟内响应 |
| **P2 - 关注** | 任务失败率上升趋势、额度消耗异常、慢查询增多 | 仪表盘标记 | 下一个工作日 |

### 11.6 运营仪表盘

P0 Admin 面板必须能回答：

- 哪些任务卡住了？（`running` + 过期租约）
- 哪个供应商在故障？（近期高失败率）
- 哪个组织消耗额度最快？
- 哪些尝试产生了供应商成本？
- 哪些失败可重试？哪些需要人工介入？
- 哪些工作流处于部分成功状态？
- 有多少 `result_unknown` / `manual_review_required` 的任务尚未结算？

---

## 12. 部署与运维设计

### 12.1 环境划分

| 环境 | 用途 | 数据库 | 供应商 |
| --- | --- | --- | --- |
| **本地开发** | 开发者日常开发 | 本地 PostgreSQL + MinIO + Redis | Stub/Mock 供应商 |
| **测试** | 自动化测试 + 集成测试 | 独立 PostgreSQL + MinIO + Redis | Stub/Mock 供应商 |
| **预发（Staging）** | 上线前验证 | 独立数据库，与生产隔离 | 供应商沙盒环境（如可用） |
| **生产** | 正式环境 | 托管 PostgreSQL + 对象存储 + Redis | 真实供应商 |

### 12.2 CI/CD

```
代码推送 → Lint + Type Check + 单元测试
  → 集成测试（含状态机、额度预留并发、任务认领并发、租户隔离测试）
    → 构建容器镜像
      → 部署到预发环境
        → 预发冒烟测试
          → 部署到生产环境（蓝绿或滚动更新）
```

### 12.3 发布策略

| 发布类型 | 策略 | 回滚方案 |
| --- | --- | --- |
| **常规发布** | 滚动更新（先 Worker，后 API） | 容器编排回滚到上一版本 |
| **数据库迁移** | 先加后删（expand-contract），只做可回滚的迁移 | 反向迁移脚本 |
| **紧急修复** | 跳过预发的快速发布通道（需审批） | 快速回滚 |

### 12.4 数据库变更策略

| 规则 | 说明 |
| --- | --- |
| **只做可回滚的迁移** | 先加列/表，后删旧列/表（至少间隔一个发布周期） |
| **不在迁移中做数据转换** | 数据转换通过独立的后台任务执行 |
| **禁止强制约束（NOT NULL + DEFAULT 除外）** | 大表添加约束前先评估性能影响 |
| **迁移前审查** | 每条迁移必须通过 DBA 或 Lead 审查 |

### 12.5 配置管理

| 配置类别 | 管理方式 | 示例 |
| --- | --- | --- |
| **环境变量** | 容器编排注入 | 数据库连接串、Redis URL |
| **功能开关** | 数据库 + Admin 面板 | 供应商启用/禁用 |
| **业务配置** | 配置文件 + 数据库 | 供应商能力矩阵、速率限制 |
| **敏感配置** | Secret Management | API Key、JWT Secret |

### 12.6 容量规划

| 触发条件 | 操作 |
| --- | --- |
| Worker 队列积压持续 > 5 分钟 | 增加 Worker 实例数 |
| API P95 延迟 > 500ms | 增加 API 实例数或检查数据库性能 |
| 数据库连接池利用率 > 70% | 扩大连接池或考虑读写分离 |
| 存储增长 > 预期 2 倍 | 评估资产生命周期策略和淘汰规划 |

---

## 13. 风险、权衡与债务

### 13.1 已知风险

| 风险 | 影响 | 概率 | 缓解措施 |
| --- | --- | --- | --- |
| **重复任务执行** | 重复计费和重复输出 | 中 | 幂等键 + 唯一约束 + Attempt 记录 + 前调用持久化 |
| **Redis/PostgreSQL 裂脑** | 任务丢失或重复 | 中 | 事务性 Outbox + 修复分发器 + Worker 幂等 |
| **供应商结果未知** | Worker 崩溃或超时后无法确定供应商状态 | 中 | ProviderRequest 行 + 对账 + 安全重试策略 + `manual_review_required` |
| **租户数据泄漏** | 灾难性信任失败 | 低 | 多层租户隔离（Schema + Query + Index + 未来 RLS） |
| **成本漂移** | 业务无法理解利润 | 中 | 追加式账本链接到 Attempt 和 ProviderRequest |
| **资产覆盖** | 用户丢失生成历史 | 低 | 不可变资产版本 + 意图保护指针 |
| **网关太薄弱** | 未来模型中继需要重写 | 中 | 能力导向网关 + 归一化错误和成本 |
| **运营工具延迟** | Beta 故障不可见 | 中 | P0-A 只做 Admin Lite 只读排查；P0-B 才允许商业 beta，并必须包含可操作 Admin/Ops |

### 13.2 已知技术债务

| 债务 | 原因 | 偿还条件 |
| --- | --- | --- |
| **单区域部署** | 降低运维复杂度 | 当有跨区域客户或 SLA 要求多活时 |
| **余额缓存可能漂移** | 读模型派生延迟 | 提供对账查询；P1 实现自动修复 |
| **供应商成本用估算值** | P0-A/P0-B 不接入供应商实际成本 | P0-C 接入供应商成本回填 |
| **未实施 RLS** | 增加了查询复杂度 | 生产环境前评估；代码已结构化以支持 |
| **资产版本生命周期** | P0 不清理旧版本 | P1 设计淘汰策略 |
| **不走复杂退款/多退少补** | 简化 P0 额度模型 | P1 实现后付费账单和供应商差额结算 |
| **队列名称和优先级未最终确定** | 需要压测数据验证 | 实现阶段根据测试结果调整 |

### 13.3 未来可能的瓶颈

| 瓶颈 | 触发信号 | 演进方向 |
| --- | --- | --- |
| **单数据库写入** | 写入 QPS 接近数据库容量 | 读写分离 → 分库分表 → 事件化架构 |
| **Worker 处理能力** | 队列积压持续增长 | 按任务类型拆分 Worker 池 → 独立服务 |
| **Model-Gateway 单体** | 网关成为瓶颈或需要独立迭代 | 提取为内部独立服务 |
| **API 单体** | 一个模块的变更影响其他模块 | 按领域边界面提取微服务 |
| **存储膨胀** | 存储成本不可持续 | 资产生命周期策略 + 冷热分离 |
| **权限复杂度** | 需要更细粒度的权限 | 从角色模型演进到基于策略的 ABAC |

---

## 14. 演进路线

长期主义不是一步到位，而是让系统具备低成本演进能力。好的演进路线不是按时间写，而是按"信号"写。

### 14.1 阶段规划

#### 阶段 1a：P0-A — 核心闭环可用

- 完成最小闭环（剧本 → 分镜图/视频 → 导出）
- 模块化单体基础架构
- 单一模型供应商或 mock/stub（P0-A 不做多供应商路由）
- 基础额度校验（单次校验，不做预留/释放/对账）
- 基础的 Worker 执行（无完整租约恢复、无 Outbox 恢复）
- 供应商调用最小副作用保护（调用前 ProviderRequest、`external_submission_started_at`、最小 `result_unknown`、禁止盲重试）
- Admin Lite 只读状态查看

#### 阶段 1b：P0-B — 可靠性硬化

- 至少两个模型供应商 + 主/备路由
- 事务性 Outbox 分发 + Redis → PostgreSQL 修复
- 任务租约恢复 + Worker 最终化原子事务
- 额度预留/分配/单次结算 + 追加式账本
- `result_unknown` + ProviderRequest 对账 + 手动介入
- Admin/Ops 面板（手动重试、手动结算、供应商禁用）

#### 阶段 1c：P0-C — 商业化硬化

- 供应商实际成本回填 + 完整成本对账
- 完整额度结算矩阵（cancel/unknown/partial_success 各场景）
- 质量审查增强
- 失败任务聚合 + 批量重试

#### 阶段 2：P1 效率增强

- 批量视频生成、视频合成
- 完整生成历史列表
- 项目消耗明细
- 失败任务聚合
- 实现复杂退款/冻结

#### 阶段 3：P2 体验增强

- 工具箱完整功能
- 成员邀请与角色细权限
- 站内通知
- 版本回滚、版本对比、版本备注
- 资产版本生命周期/淘汰

#### 阶段 4：P3 平台化

- 小说库、剧本库
- 复杂付费套餐
- 客户审片或外链分享
- 移动端支持
- 完整审核/风控流
- 模型网关外部化为公共 API 和开发者控制台

### 14.2 架构演进触发条件

| 当前形态 | 触发信号 | 演进目标形态 |
| --- | --- | --- |
| Worker 共享进程 | 视频队列积压影响图片生成 | 按任务类型拆分独立 Worker 池 |
| Model-Gateway 内嵌 | 网关变更频繁，需要独立迭代/扩容 | 提取为内部独立服务 |
| API 模块化单体 | 某领域模块变更频繁且影响其他模块 | 按领域边界面提取微服务 |
| 单数据库 | 写入容量接近 70% | 读写分离 → 分库分表 |
| 余额缓存字段 | 缓存与账本漂移频繁 | 实现自动对账修复 |
| 单区域部署 | 跨区域客户对延迟/SLA 有要求 | 跨区域读取副本 → 多活 |
| 角色权限模型 | 需要超出四角色的细粒度控制 | 演进到基于策略的 ABAC |

### 14.3 服务提取顺序（如果需要）

1. Worker 池按任务类型拆分（image / video / script / export）
2. Model-Gateway 提取为独立内部服务
3. Export 打包服务提取
4. 分析/成本报告管道提取
5. 公共模型网关 API 和开发者控制台

### 14.4 架构冻结原则

以下接口/边界在 P0 阶段冻结，P1 起只做向后兼容的扩展：

- ProviderAdapter 接口契约
- 资产版本不可变性
- 账本条目的追加性
- Workflow/Task/Attempt 三层模型
- Outbox/Inbox 事件模式
- 租户 scope 强制要求

---

## 15. 验证方案

架构设计必须可验证。无法验证的设计只是观点。

### 15.1 架构验收测试（按归属阶段）

以下测试是架构验收测试，不是可选的。每个测试标注了应在哪个阶段通过。

| ID | 归属阶段 | 场景 | 预期结果 | 验证的架构不变量 |
| --- | --- | --- | --- | --- |
| **R-001** | P0-B | Redis 丢失队列任务 | 修复分发器从 PostgreSQL 重建 BullMQ job | PostgreSQL 是真相源 |
| **R-002** | P0-A | 用户双击批量生成 | 相同幂等键返回已有工作流；不重复创建任务 | 命令幂等性 |
| **R-003** | P0-B | 两个 Worker 认领同一任务 | 条件更新只让一个 Worker 成功认领 | 任务认领协议 |
| **R-004** | P0-B | Worker 认领后、供应商调用前崩溃 | 租约过期后标记尝试失败可重试；无供应商成本 | 租约 + ProviderRequest 前持久化 |
| **R-005** | P0-B | Worker 在供应商接受后、返回前崩溃 | `external_submission_started_at` 已设置 → 进入 `result_unknown` | 供应商侧效保护 |
| **R-006** | P0-B | 供应商超时（accept 之后） | 不盲目重试；对账或人工审查 | Unknown 不自动失败 |
| **R-007** | P0-B | 供应商内容安全拒绝 | 任务失败；不故障转移到备用供应商 | 安全失败边界 |
| **R-008** | P0-B | 并发额度预留导致超额 | 事务行锁保证不超额；`credit_balance_cached >= 0` | 额度预留事务性 |
| **R-009** | P0-B | 额度分配同时 consume 和 release | 一个事务胜出；另一个因行状态或唯一约束失败 | 单次结算 |
| **R-010** | P0-B | Worker 最终化事务中某步失败 | 整事务回滚；任务保持可恢复 | 最终化原子性 |
| **R-011** | P0-A | 分镜编辑后、旧生成任务完成 | 旧结果存储为历史版本；不更新当前指针 | 版本 + 意图保护 |
| **R-012** | P0-A | 两个重生成完成顺序颠倒 | 只有匹配活跃意图的完成更新当前指针 | 指针安全 |
| **R-013** | P0-A | 来自其他组织的 Viewer 请求签名 URL | 后端在颁发签名 URL 前拒绝 | 租户授权 |
| **R-014** | P0-B | Outbox 事件投递两次 | Inbox 去重约束阻止重复副作用 | Outbox/Inbox 去重 |
| **R-015** | P0-B | 余额缓存漂移 | 对账查询检测漂移并修复读模型 | 账本为真相 |
| **R-016** | P0-A | 校准未通过时触发批量生成 | 后端拒绝创建生成工作流 | 校准门控 |
| **R-017** | P0-A | 导出时资产缺失 | 列出缺失项；不允许静默导出失败 | 导出完整性 |
| **R-018** | P0-B | 子任务进入 `manual_review_required` | 父工作流变为 `manual_review_required`；不进入终态 | 工作流聚合 |
| **R-019** | P0-B | 供应商请求行已提交但未开始外部提交，Worker 崩溃 | 修复作业可安全重排队（无外部调用尝试） | `external_submission_started_at` 边界 |
| **A-001** | P0-A | 供应商请求已设置 `external_submission_started_at` 后超时或进程中断 | 任务进入最小 `result_unknown` 或保持人工可见状态；系统不得自动创建第二个外部请求 | 真实供应商副作用保护 |

**说明：** P0-A 阶段通过 R-002、R-011、R-012、R-013、R-016、R-017、A-001（共 7 条）。P0-B 阶段通过全部 R-001 至 R-019，并将 A-001 从人工可见状态升级为自动/人工可结算闭环。

### 15.2 压测验证

| 场景 | 目标 | 方法 |
| --- | --- | --- |
| **峰值流量** | 模拟 3 倍预期流量，核心 API P95 < 500ms | k6/Artillery 压测 |
| **批量生成压力** | 100 个并发批量生成工作流，无超额创建 | 并发测试 |
| **Worker 饱和** | Worker 接近并发上限时，队列不丢失任务 | 压力测试 + 监控验证 |

说明：批量生成压力和 Worker 饱和是 P0-B 及以后商业 beta 验收项；P0-A 只做核心闭环和基础幂等压力验证。

### 15.3 故障演练

| 场景 | 验证目标 |
| --- | --- |
| **关闭 Redis 5 分钟** | API 正常（Outbox 累积）；恢复后任务被调度执行 |
| **关闭模型供应商 A 5 分钟** | 任务自动故障转移到供应商 B（如安全） |
| **关闭 1 个 Worker 实例** | 其他 Worker 接管任务；无任务丢失 |

### 15.4 上线验收标准（按阶段）

#### P0-A 上线验收

在 P0-A 可交付前，以下条件必须满足：

1. [ ] 核心闭环用户路径测试通过（PRD TC-P0-001 至 TC-P0-014）
2. [ ] 基础重试：单任务失败后可重试，不覆盖旧结果
3. [ ] 基础额度校验：超额时正确拒绝，显示提示
4. [ ] 运行中重复点击不创建重复任务
5. [ ] 租户隔离测试：跨组织查询返回 0 结果
6. [ ] 签名 URL 授权测试：未授权用户被拒绝
7. [ ] 供应商副作用保护测试：外部提交开始后不得自动重复提交第二个供应商请求
8. [ ] 发布限制确认：仅内部 dogfood 或白名单演示；不承诺商业 SLA

#### P0-B 上线验收

在 P0-B 可交付前，P0-A 全部通过外加：

1. [ ] 全部 R-001 至 R-019 架构验收测试通过
2. [ ] 峰值流量压测 P95 < 500ms
3. [ ] 额度预留并发测试：100% 阻止超额创建
4. [ ] Worker 崩溃恢复测试：租约过期后 60 秒内自动恢复
5. [ ] Redis 丢失恢复测试：< 10 分钟从 PostgreSQL 重建调度
6. [ ] 供应商预创建持久化测试：外部调用前 `provider_requests` 行已存在
7. [ ] 最终化原子性测试：任何步骤失败导致整事务回滚
8. [ ] 校准门控测试：未通过/未跳过的校准阻止批量生成
9. [ ] 额度分配单次结算测试：并发 consume + release 只有一个胜出
10. [ ] Admin/Ops 手动结算流程测试：`manual_review_required` 可被授权人员结算，并产生审计事件

#### P0-C 上线验收

在 P0-C 可交付前，P0-B 全部通过外加：

1. [ ] 多供应商路由测试：主供应商不可用 → 自动/手动故障转移
2. [ ] 供应商成本回填对账测试
3. [ ] 质量审查集成测试
4. [ ] 失败任务聚合和批量重试测试

---

## 16. 阶段准入表

本方案不允许跳过前置依赖直接进入下一阶段的编码。下表定义每个阶段的开工条件：

| 阶段 | 可开始做什么 | 必须先完成什么 | 关键交付物 |
| --- | --- | --- | --- |
| **工程骨架** | repo/monorepo、NestJS 模块骨架、Docker Compose、迁移框架、ESLint/TSConfig、CI 流水线 | 本架构文档阻塞项已记录；不得冻结业务 Schema/API 契约 | 可运行的 `docker compose up` 含 PG + Redis + MinIO + API + Worker mock |
| **Schema/API 契约** | 数据库 DDL、API 契约、状态类型生成 | 附录 D.1（状态字典最终版）、D.3（幂等协议规范）完成并通过一致性检查 | 状态字典、Schema、API、PRD 状态无冲突 |
| **P0-A 业务闭环** | 剧本解析、资产确认、分镜拆解、风格校准、分镜图/视频生成、导出 | Schema/API 契约完成 + P0-A 供应商副作用保护方案完成 | 用户能跑通核心闭环，R-002/R-011/R-012/R-013/R-016/R-017/A-001 通过 |
| **P0-B 可靠性硬化** | Outbox 恢复、租约、ProviderRequest 完整持久化、额度预留/结算、Worker 最终化原子事务、Admin/Ops 基础功能 | P0-A 验收通过 + 附录 D.2（恢复决策表）、D.4（Provider 异步策略）、D.5（额度结算矩阵） | 全部 R-001 至 R-019 通过，Redis 故障可恢复，额度 100% 防超额 |
| **P0-C 商业化硬化** | 多供应商路由、成本回填、质量审查增强、失败聚合 | P0-B 验收通过 + 附录 D.6（P0-A/B 拆分计划已调整为 P0-B/C） | 多供应商可运营，成本可对账 |

**关键约束：**

- **没有 D.1（状态字典）、D.3（幂等协议），不要开始写 P0-A 核心业务代码。** 状态值和幂等语义是每个模块的底层契约，后补会导致全量返工。
- **没有 D.2（任务恢复决策表），不要开始写 P0-B 的 Worker 恢复逻辑。** 恢复行为无法拍脑袋实现，必须先有精确的决策表。
- **P0-A 的 `provider_requests` 表结构和基本字段必须在 P0-A Schema 中定义**（§2.1 中的"最小 ProviderRequest 记录"），P0-B 只增强字段和索引，不改变基础表结构。
- P0-A 的模块接口（如 Shot 模块的 `createGenerationWorkflow` 方法签名）应预留 P0-B 才注入的参数位（如 `idempotency_key`），避免接口破坏性变更。

---

## 附录 A：架构设计检查清单

一个好的架构方案应能清楚回答以下问题：

- [x] **为什么这个系统要这样设计？** — 第 1 节（背景与目标）+ 第 5 节（关键架构决策）
- [x] **核心复杂度在哪里？** — 第 3 节（核心业务模型：任务执行模型、额度模型、资产版本模型）+ 第 11 节（可观测性）
- [x] **哪些地方选择了简单，哪些地方选择了复杂？** — 第 5 节（每个决策的取舍）+ 第 13 节（技术债务）
- [x] **失败时系统如何表现？** — 第 9 节（可靠性与容灾设计）+ 第 15 节（验证方案：R-001 至 R-019）
- [x] **未来增长时如何演进？** — 第 14 节（演进路线：按信号触发，非按时间）
- [x] **哪些决策现在做，哪些决策故意延后？** — 第 2 节（范围与非目标）+ 第 13 节（已知技术债务）+ 决策日志 D-001 至 D-036
- [ ] **P0 实施切片是否合理？** — 第 2.1 节（P0-A/P0-B/P0-C）+ 第 16 节（阶段准入表）— 已调整为 Internal Alpha / Commercial Beta Gate / Commercial Ops，需要补齐 D.6 后复核
- [ ] **进入实现前是否补齐 6 类交付物？** — 见附录 D（D.1-D.3 为硬前置，未完成不得开始核心模块编码）

## 附录 B：文档索引

| 文档 | 路径 | 用途 |
| --- | --- | --- |
| PRD | `docs/product/reelmate-core-replication-prd.md` | 产品需求 |
| 本架构设计方案 | `docs/architecture/system-architecture-design.md` | 架构总纲 v0.9 |
| 决策记录 | `docs/architecture/decision-log.md` | 所有架构决策及理由 |
| 状态字典 | `docs/architecture/p0-state-dictionary.md` | 状态值的规范定义 |
| 数据模型草案 | `docs/architecture/p0-data-schema-draft.md` | PostgreSQL Schema 设计 |
| 执行与恢复规格 | `docs/architecture/p0-execution-and-recovery-spec.md` | 状态机 + 恢复测试 |
| 实现基线 | `docs/architecture/p0-implementation-baseline.md` | 技术栈 + 模块布局 + 协议 |
| 模块实施蓝图 | `docs/architecture/p0-module-implementation-blueprint.md` | 领域词典 + 模块边界 + 流程 + 数据归属 + 任务拆解 |
| M0 Contract Freeze | `docs/architecture/p0-m0-contract-freeze.md` | M0 冻结范围 + 冻结契约 + 非冻结门禁 |
| 商业支付设计 | `docs/architecture/p0-commerce-payment-design.md` | P0-B 充值/支付/退款/开票/对账设计 |
| 架构一致性检查清单 | `docs/architecture/architecture-consistency-checklist.md` | 实现前跨文档防漂移门禁 |

## 附录 C：提供给模块设计者的关键接口

各模块设计者在编写自己的详细技术方案时，应关注以下跨模块边界：

| 接口/边界 | 定义位置 | 使用者 |
| --- | --- | --- |
| M0 冻结契约入口 | `p0-m0-contract-freeze.md` | 所有模块设计者 |
| M0.1 实现前契约硬化 | `p0-m0-1-contract-hardening.md` | 所有模块设计者 |
| Worker 认领协议 | `p0-implementation-baseline.md` §6 | Workflow-Task 模块 |
| Worker 最终化协议 | `p0-implementation-baseline.md` §7 | 所有 Worker Handler |
| 供应商适配器接口 | `p0-execution-and-recovery-spec.md` §8 | Model-Gateway 模块 |
| 支付供应商适配器接口 | `p0-commerce-payment-design.md` §20 | Commerce-Payment 模块 |
| 幂等键协议 | 本文件 §7.1.3 + `p0-idempotency-contract.md` | 所有 API 命令 |
| 购买积分支付闭环 | `p0-commerce-payment-design.md` §5 / §11 | Commerce-Payment / Credit-Billing |
| 额度预留与结算流程 | `p0-system-architecture.md` §10 | Credit-Billing 模块 |
| 额度结算矩阵 | 本文件 §7.4 | Credit-Billing 模块 |
| Outbox/Inbox 事件模式 | 本文件 §7.5 | 所有模块 |
| 供应商 webhook 策略 | 本文件 §7.2.3 | Model-Gateway 模块 |
| 租户作用域要求 | `p0-system-architecture.md` §6 | 所有模块 |
| 资产版本 + 指针安全 | `p0-system-architecture.md` §9 | Asset / Shot 模块 |
| 校准门控 | `p0-execution-and-recovery-spec.md` §7 | Shot / Calibration 模块 |
| 验证计划 | `p0-verification-plan.md` | QA / Reliability / 所有模块 |
| 修复作业规格 | `p0-repair-job-spec.md` | Workflow / Credit / Commerce / ModelGateway |
| 协作契约 | `p0-collaboration-contract.md` | 所有 PR / 实施计划 |

## 附录 D：实现前必须补齐的 6 类关键交付物

本架构方案标记为 v0.9（架构总纲）。在冻结 Schema/API 契约和进入核心模块实现前，必须先完成与当前阶段相关的交付物。

> **硬前置声明：D.1（状态字典）和 D.3（幂等协议）没有完成之前，不要冻结 Schema/API 契约，也不要开始写 P0-A 核心业务代码。D.2（任务恢复决策表）没有完成之前，不要开始写 P0-B Worker 恢复逻辑。** 状态值是前后端/DB/Worker 的共享语言，幂等语义是 API 和任务创建的安全基础，恢复决策是 Worker 可靠性的唯一依据。后补会导致全量返工。

### D.1 状态字典最终版 🔴 核心模块编码硬前置

确认并锁定 `p0-state-dictionary.md` 中的 Project（phase + readiness_flags）和 Shot（content/image/video 独立字段）状态模型，包含：

- 每个状态字段的合法值枚举
- 每个实体的合法状态迁移表（From → Event → To → Guard）
- PRD/UI 标签与 DB/API 值的映射表

### D.2 任务恢复决策表 🔴 P0-B 编码硬前置

完整定义 Worker 在每个崩溃节点上的恢复行为。当前 `p0-execution-and-recovery-spec.md` 的修复规则基于 `locked_until` 和 `external_submission_started_at`，但需要进一步细化为表格：

| 崩溃节点 | task 状态 | attempt 状态 | provider_request 状态 | 恢复动作 | 额度操作 |
| --- | --- | --- | --- | --- | --- |
| 认领后，ProviderRequest 创建前 | running | running | 不存在 | 标记尝试 failed retryable，requeue | 不操作 |
| ProviderRequest 已提交，external_submission_started_at = null | running | running | submitted | 标记尝试 failed retryable，requeue | 不操作 |
| external_submission_started_at 已设置，无终态 | running | running | submitted/accepted | 移至 result_unknown | 分配保持 reserved |
| Provider 返回成功但 Worker 未最终化 | running | running | succeeded | 执行最终化 | consume |
| ... | ... | ... | ... | ... | ... |

### D.3 幂等键协议规范 🔴 核心模块编码硬前置

将 §7.1.3 中的设计固化为实现规范，明确：

- `idempotency_records` 表的完整 DDL（含索引和过期策略）
- 每条 API 命令的 `operation_name` 命名约定
- 幂等键过期清理作业的调度周期
- 幂等冲突时前端展示的具体文案

当前规范入口：`docs/architecture/p0-idempotency-contract.md`。

### D.4 Provider 异步策略实现规范

将 §7.2.4 中的策略固化为实现决策：

- 哪些供应商用轮询，哪些用 webhook？
- Webhook 端点的认证方案（共享密钥 vs API Key vs mTLS）？
- `provider_events` 表的完整 DDL
- 轮询间隔和对账周期
- 回调与轮询的竞态处理伪代码

通用供应商结果修复入口：`docs/architecture/p0-repair-job-spec.md`。

### D.5 额度结算矩阵最终版

将 §7.4 中的结算矩阵固化为 `Credit-Billing` 模块的验收规格：

- 每种任务结局的完整事务伪代码（锁定哪些行、插入哪些账本条目、更新哪些分配状态）
- `manual_review_required` 状态下 Admin/Ops 的操作界面和审计要求
- 对账查询 SQL（验证 `available + reserved + consumed = total granted + net adjustments`）

额度与支付修复作业入口：`docs/architecture/p0-repair-job-spec.md`。

### D.6 P0-A / P0-B 拆分计划

将 §2.1 中的三阶段拆分为可执行的实现计划：

- P0-A 的精确功能列表和验收方式（哪行代码属于哪个阶段）
- P0-A 与 P0-B 的接口边界（哪些模块结构在 P0-A 已搭建但只做 stub）
- 从 P0-A 升级到 P0-B 的迁移路径（哪些功能需要重构，哪些纯粹是新增）
- 时间估算和里程碑

当前 M0.1 执行入口：`docs/architecture/p0-m0-1-contract-hardening.md`；验证入口：`docs/architecture/p0-verification-plan.md`。

---

> **标注：** 以上 6 类交付物补齐后，本架构方案可升级为 v1.0（implementation-ready）。届时各个模块设计者可以基于最终版状态字典、幂等协议、恢复决策表和结算矩阵独立编写详细技术方案。
