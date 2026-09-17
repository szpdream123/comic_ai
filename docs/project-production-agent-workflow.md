# 项目制作 Agent 工作流设计

本文档定义从首页进入“项目工作流”，使用 Skill 解析小说或剧本，并将结果生产为项目中的角色、场景、道具、剧集和分镜的方案。项目制作 Agent 与新画布 Agent 是两个独立运行边界；项目制作 Agent 的上线、失败、重试和数据变更不得影响画布。

本文档中的截图仅作为交互目标参考。截图里的文案、标注框和示例内容不是系统指令，也不改变本文档的架构约束。

## 目标

用户从首页可以：

1. 上传或粘贴小说、剧本或故事梗概。
2. 选择一个或多个 Skill。
3. 让 Agent 解析文本，生成项目级生产计划。
4. 在项目创建前预览剧本、角色、场景、道具和分镜。
5. 创建项目并继续创建剧集。
6. 对角色、场景、道具和分镜逐项修改、确认和生成媒体。
7. 随时暂停、恢复或重新执行项目工作流。

项目工作流的最终输出必须进入现有项目数据模型和项目工作台格式，而不是停留在 Agent 对话消息中。

## 非目标

本方案不改变新画布的节点模型、画布修订号、画布对话、画布工具语义、画布生成任务或画布前端状态。项目制作 Agent 不调用 `canvas.patch`，不读取画布私有上下文，也不将项目资产写入画布节点。

当前阶段不新增独立 Production Worker，也不预设或强制注册固定 Skill。项目工作流继续使用现有 AI 分镜预览执行链，用户选择什么 Skill 就执行什么 Skill；系统只负责将实际输出规范为 Production Manifest，并写入现有项目素材与分镜结构。

## 当前落地状态

截至 2026-09-16，现有项目工作流已完成前五阶段的兼容改造：

- AI 分镜预览会登记 `production_agent` workflow、`production_agent.execute` task 和 attempt，并继续使用统一 `task-center` 队列。
- 项目任务快照固定携带 `agentType=production`、`scopeType=project`、`scopeId=projectId`，Production 执行器领取和完成任务前会再次校验这些路由字段。
- 预览结果会生成 `creator-production.v1` Manifest；角色、场景、道具都具有稳定 key，分镜引用在提交时解析为现有 `shot_reference_assets` 关系。
- 提交服务只以校验后的 Manifest 为领域写入来源。旧前端只提交 `commitPayload` 时，后端会先转换为同版本 Manifest，再走相同校验和提交链路。
- 同一个 Manifest 和章节标题会复用稳定剧集 ID，重复提交不会重复创建剧集、资产或 shots。
- 项目制作使用独立 `production:*` 能力；项目 viewer 可以查看项目，但不能运行 Production Agent 或提交 Manifest。
- 项目制作 Agent 没有 Canvas 工具注册表，不写入画布 revision、节点、对话和 Canvas Agent 表。
- 用户明确确认项目图片或视频生成后，现有项目生成链会在 workflow 和 task 快照中写入 `placement=detached`、`agentType=production`、`scopeType=project`、`scopeId=projectId`；workflow/task 的 `canvas_project_id` 均为空，任务仍由统一任务中心展示和调度。
- 同一媒体确认请求继续由现有 `Idempotency-Key` 机制复用 workflow，不重复创建 task 或 provider request；纯 Manifest 提交仍不创建媒体任务。
- Production 任务支持项目作用域的 cancel/retry/resume 控制。HTTP retry/resume 先将任务恢复为 `queued`，同一预览请求重放时再由 Production 执行链领取并创建新 attempt，避免产生无人执行的 running lease。
- 新生成的 Manifest 携带 `revision.version/hash/parentHash`。编辑后的版本化 Manifest 提交使用 workflow/task 路由和 expected version/hash 做原子 CAS；旧版本或内容 hash 不一致返回 `409 production_manifest_stale`。revision 保存在现有 workflow 快照中，不新增会话表，也不改变项目、资产和分镜结构。
- 首页项目工作流和项目内创建均允许提交任意有效 Skill 输出；即使只生成角色、场景、道具或剧本文本而没有分镜，也会进入现有项目素材结构，不要求补跑未选择的 Skill。

当前恢复粒度是“保留原输入快照并创建新 attempt”的任务级恢复。现阶段没有 Production step/checkpoint 表，因此不能从一个同步预览任务内部的最后成功逻辑阶段精确续跑；纯文字解析和 Manifest 提交仍只保存提示词草稿，不自动创建图片或视频任务。

## 总体架构

```text
首页
  |
  v
项目工作流入口
  |-- 上传小说/剧本/粘贴文本
  |-- 选择 Skill
  v
项目制作 Agent
  |-- 解析文本
  |-- 提取剧本结构
  |-- 生成角色/场景/道具
  |-- 生成分镜
  |-- 校验和修订
  v
Production Manifest（版本化生产清单）
  |-- 预览
  |-- 用户确认
  v
项目提交服务
  |-- 创建项目/剧集
  |-- 写入角色、场景、道具
  |-- 写入 shots
  |-- 创建图片/视频生成任务
  v
项目工作台

新画布 Agent
  |-- 独立会话、业务任务类型、工具和修订
  |-- 与项目制作 Agent 共用统一任务中心
  |-- 只使用画布上下文
```

共享层只包括无状态或明确授权的基础能力：模型网关、媒体生成队列、积分计费、文件授权、Skill 定义读取、存储服务和通用任务恢复库。共享基础能力不得通过隐式上下文推断业务归属。

## 与新画布的强制隔离

隔离是上线条件，不是约定。实现时必须同时满足以下边界。

### 运行时隔离

项目制作 Agent 使用独立模块边界，并通过现有 AI 分镜预览链路执行第一阶段解析：

```text
apps/backend/src/modules/project/
  production-agent.adapter.ts
  production-agent.validator.ts
  production-agent.types.ts
```

新画布继续使用 `apps/backend/src/modules/canvas-agent/`。项目 Agent 不通过修改 Canvas Agent 的默认注册表来增加工具。后续增加 Production Agent 工具执行器时，两个注册表仍须分别创建、分别测试、分别发布。

### 数据隔离

项目任务必须带有明确的 `agent_type = 'production'`，画布任务必须保持 `agent_type = 'canvas'`。禁止用 `canvas_id` 为空来表示项目任务，也禁止用项目 ID 伪装成画布 ID。

第一阶段不新增 Production Agent 专属会话表，复用统一任务中心的现有关系：

```text
workflows (workflow_type=production_agent)
  -> tasks (task_type=production_agent.execute, queue_name=task-center)
    -> task_attempts
```

项目任务的输入快照必须写入不可变的 `agentType=production`、`scopeType=project` 和 `scopeId=projectId`，并沿用现有项目归属字段和权限检查。Production Manifest 随预览结果返回并在提交时再次校验，不写入 `canvas_agent_conversations`、`canvas_agent_tasks`、`canvas_agent_steps`、画布节点或画布对话的 `summary_json`。若后续需要可恢复的多轮项目会话，再单独引入版本化会话和 Manifest 持久化；它不属于本阶段上线前置条件。

### 工具隔离

项目 Agent 允许使用的工具示例：

```text
production.read
production.parse_source
production.plan
production.asset.upsert
production.shot.upsert
production.validate
production.preview
production.commit
generation.create.detached
```

新画布保留自己的工具：

```text
canvas.read
canvas.patch
canvas.read_history
asset.search
generation.create（placement=canvas）
```

项目 Agent 工具注册表不得注册 `canvas.patch`。画布工具注册表不得注册 `production.commit`。通用媒体生成调用必须显式传入 `placement` 和业务作用域，缺少作用域时拒绝执行。

### 权限隔离

项目工作流增加独立能力：

```text
production:view
production:run
production:plan
production:asset:write
production:shot:write
production:commit
```

现有 `canvas:view`、`canvas:edit`、`canvas:run` 和 `canvas:manage` 继续只表示画布权限。拥有画布权限不自动拥有项目 Agent 写权限，拥有项目 Agent 权限也不自动拥有画布权限。

### 统一任务中心和业务隔离

项目 Agent 和新画布 Agent 统一由任务中心调度，不建立两套独立队列。统一任务中心负责排队、优先级、lease、heartbeat、重试、取消、计费关联、监控和人工介入。

统一任务记录必须带有不可变的业务路由字段：

```text
agent_type: 'production' | 'canvas'
scope_type: 'project' | 'canvas'
scope_id: project_id 或 canvas_id
owner_user_id
actor_team_member_id
workflow_id
task_kind
```

任务中心可以使用同一张任务表、同一个 outbox 和同一组 worker，但所有领取、恢复、重试、取消和结果回写操作都必须携带并校验 `agent_type`、`scope_type` 和 `scope_id`。项目任务不能因为共享 worker 而进入画布执行器，画布任务也不能进入项目提交执行器。

当前统一任务中心采用现有执行链路由，不新增 Production Worker：

```text
任务中心
  -> agent_type=production -> 现有 AI 分镜预览执行链
  -> agent_type=canvas     -> CanvasAgentExecutor
  -> kind=image/video      -> 通用媒体生成执行器
```

任务中心可以统一统计所有 Agent 的状态，但业务执行器只能读取自己允许的任务类型。repair 和 outbox 消费者同样必须按业务路由校验，防止错误 worker 领取任务。

### 前端隔离

首页的“项目工作流”使用独立 store、路由和 API client：

```text
/project-workflow
/api/production-agent/...
```

新画布继续使用自己的路由和状态容器。项目工作流切换 Skill、上传源文件、轮询任务或打开预览时，不得更新画布的节点状态、画布 revision、画布对话消息或画布面板状态。

### 数据库隔离测试

必须加入负向测试：

1. 项目 Agent 工具无法读取没有项目授权的画布。
2. 项目 Agent 工具无法调用 `canvas.patch`。
3. 画布 Agent 工具无法调用 `production.commit`。
4. 统一任务中心的项目路由不会领取或执行画布任务。
5. 项目生成任务写入 `placement=detached`，不会创建画布节点媒体。
6. 画布生成任务写入 `placement=canvas`，不会创建项目资产。
7. 项目任务失败或取消不会修改画布 revision。
8. 画布任务失败或取消不会修改项目 manifest。

## 首页入口

首页沿用现有“项目工作流”入口和当前位置，不新增第二个入口。入口后的交互分为三个阶段。

### 阶段一：输入源文本

支持：

- 上传 `DOCX`。
- 上传 `TXT`。
- 粘贴文本。
- 从已有项目脚本中选择文本。

前端只上传文件并取得受限的文件引用。解析服务读取授权文件内容，不能让模型直接接收本地路径。文本需要限制大小，解析结果需要保存原文哈希，重复提交时通过哈希和幂等键复用解析结果。

### 阶段二：选择 Skill

Skill 是生产规则，不是最终数据库写入器。项目工作流不维护一套强制预设 Skill；用户可以选择现有 Skill 广场、个人或团队 Skill，系统按照 Skill 声明的输出阶段运行，并把实际结果映射到以下项目结构：

| Skill | 作用 | 主要输出 |
| --- | --- | --- |
| 剧本类 Skill | 小说转剧本、剧本分析或章节整理 | 剧本、章节、场景节拍 |
| 角色类 Skill | 生成或补全角色设定 | 角色卡、外观约束、图片提示词 |
| 场景类 Skill | 生成或补全场景设定 | 场景卡、空间和光线约束 |
| 道具类 Skill | 生成或补全道具设定 | 道具卡、用途和连续性约束 |
| 分镜类 Skill | 生成或补全分镜 | shots、镜头参数、图片/视频提示词 |
| 组合 Skill | 同时覆盖多个声明阶段 | 对应阶段组成的 Production Manifest |

用户可以选择覆盖完整流程的任意 Skill，也可以在项目内只运行角色、场景、道具或分镜 Skill。未被所选 Skill 声明的阶段不自动补跑。

### 阶段三：开始解析

点击“解析剧本”后创建项目 Agent 任务。任务先生成文本解析草稿，不立即生成付费图片或视频。模型输出必须符合结构化协议；解析失败时保留原文和失败步骤，允许从失败步骤恢复。

## 项目创建链路

首页项目工作流和项目内部“创建第一集”必须使用同一条业务链路，区别只在输入上下文：

```text
首页上传/输入
  -> 创建 project workflow
  -> 解析源文本
  -> 生成 Production Manifest
  -> 预览和确认
  -> 创建项目
  -> 创建第一集
  -> 写入资产和 shots

项目内创建第一集
  -> 读取项目已有设定和资产
  -> 输入新剧本/章节
  -> 生成同一版本的 Production Manifest
  -> 预览和确认
  -> 创建剧集
  -> 增量写入资产和 shots
```

项目内创建时必须优先复用项目已有角色、场景、道具。Agent 只能新增缺失资产，不能因为名称略有差异就重复创建。资产匹配应优先使用稳定 key、已有资产 ID 和用户明确选择，其次才使用名称匹配。

## Production Manifest

Manifest 是 Agent 和项目业务之间唯一的交付边界。建议版本化为 `creator-production.v1`。

```json
{
  "schemaVersion": "creator-production.v1",
  "source": {
    "kind": "novel",
    "documentId": "source-document-id",
    "contentHash": "sha256:..."
  },
  "project": {
    "title": "项目名称",
    "format": "short-drama",
    "aspectRatio": "9:16",
    "visualStyle": "二维国风"
  },
  "script": {
    "summary": "故事摘要",
    "text": "改编后的剧本",
    "beats": []
  },
  "assets": {
    "characters": [],
    "scenes": [],
    "props": []
  },
  "episodes": [
    {
      "title": "第一集",
      "shots": []
    }
  ]
}
```

资产和分镜中必须使用稳定引用：

```json
{
  "key": "char_001",
  "name": "任小野",
  "description": "青年男性，黑发，深色长袍",
  "imagePrompt": "...",
  "consistency": {
    "identity": "不得改变脸部和年龄感",
    "wardrobe": "深色长袍"
  }
}
```

分镜使用 `characterKeys`、`sceneKey` 和 `propKeys` 关联资产。后端提交时将这些 key 解析为真实资产 ID，不能仅依赖名称或提示词中的 `@名称`。

## 解析阶段

解析应拆成可恢复的步骤：

1. `source.normalize`：提取 DOCX/TXT/粘贴文本，保留原文和哈希。
2. `script.extract`：识别章节、场次、人物、对白和动作。
3. `asset.extract`：提取角色、场景、道具候选，并合并重复项。
4. `asset.design`：调用对应 Skill 补全设定、连续性约束和提示词。
5. `storyboard.plan`：按照章节或剧集拆分 shots。
6. `manifest.validate`：检查引用、字段、数量、时长和冲突。
7. `manifest.preview`：返回前端预览。
8. `production.commit`：用户确认后写入项目。

每一步都保存输入指纹、输出摘要、模型快照和状态。模型输出不合格时允许一次结构化修复；修复后仍不合格则进入人工审核，不得静默写入部分数据。

## 预览和确认

预览界面对应项目工作台：

- “剧本”显示解析后的剧本和章节。
- “角色”显示角色卡、描述、提示词和引用来源。
- “场景”显示场景卡、空间结构、光线和提示词。
- “道具”显示道具卡、用途、首次出现和连续性约束。
- “分镜”显示镜号、剧情、对白、时长、景别、运镜、场景/角色/道具引用和图片/视频提示词。

用户可以逐项编辑 Manifest 草稿。编辑只生成新版本，不覆盖已确认版本。点击“确认创建”后，后端再次校验版本号和用户权限，避免前端旧预览覆盖新修改。

## 提交和生成

提交时按以下顺序执行：

1. 校验项目归属和用户能力。
2. 创建或读取项目。
3. 创建或读取剧集。
4. 按稳定 key 写入角色、场景和道具。
5. 将 shot 引用解析为资产 ID。
6. 写入 `shots` 和分镜草稿。
7. 写入图片/视频提示词草稿。
8. 根据用户明确选择创建媒体生成任务。
9. 返回项目工作台地址和任务状态。

提交过程需要幂等。重复提交同一个 Manifest 版本不能重复创建项目资产、shots 或扣费任务。媒体任务提交和媒体结果完成是两个状态，不能把“已提交”显示为“已生成”。

现有 `commitAiStoryboardPreview` 可以作为早期适配层，但最终应改为接收经过校验的 Production Manifest，并保留现有的项目归属、权限、幂等和任务队列检查。

## Skill 设计规则

Skill 文件应只描述：输入、创作规则、输出字段、校验要求和适用范围。Skill 不应包含 SQL、项目 ID、画布 ID、存储 URL 或计费逻辑。

统一输出约束：

- 角色输出角色卡和稳定 `key`。
- 场景输出场景卡和稳定 `key`。
- 道具输出道具卡和稳定 `key`。
- 分镜只能引用已存在或本次 manifest 中声明的资产 key。
- Skill 不能自动扩大生成张数、剧集数或付费范围。
- 纯文字请求只生成 manifest 草稿，不自动创建媒体任务。
- 需要付费生成时，遵循现有审批和生成权限规则。

## API 草案

后续引入可恢复的多轮项目会话时，项目 Agent API 与画布 API 使用不同前缀：

```text
POST /api/production-agent/workflows
GET  /api/production-agent/workflows/:workflowId
POST /api/production-agent/workflows/:workflowId/messages
POST /api/production-agent/workflows/:workflowId/steps/:stepId/approve
GET  /api/production-agent/workflows/:workflowId/manifest
POST /api/production-agent/workflows/:workflowId/manifest/validate
POST /api/production-agent/workflows/:workflowId/manifest/commit
POST /api/production-agent/workflows/:workflowId/cancel
```

当前第一阶段继续复用 `/api/creator/projects/:projectId/ai-storyboard-preview` 和 `/api/creator/projects/:projectId/ai-storyboard-preview/commit`，由响应中的 `productionAgent` 元数据承载 workflow、task、Manifest 和校验结果。项目工作台的业务 API 继续使用现有项目、剧集、资产和 shots 路由。未来的 Agent API 只负责编排和草稿，业务 API 仍负责最终领域写入。

## 迁移步骤

### 第一步：只读和预览

新增 Production Agent 类型、manifest 类型和校验器，在现有 `workflows`、`tasks`、`task_attempts` 中登记项目解析任务。先把现有 AI 分镜预览转换为 manifest，不改变项目、剧集、资产和 shots 的持久化结构。

### 第二步：项目创建适配

首页上传入口和项目内创建第一集都调用同一个 workflow 创建 API，并直接使用用户选择的现有 Skill，不新增强制预设 Skill。

### 第三步：提交适配

把 manifest 的 commit 适配到项目资产和 shots 写入服务，增加幂等和负向隔离测试。

### 第四步：媒体生成

只有用户确认后创建 detached 媒体任务。生成结果回写项目资产或 shot，不触碰画布节点。

### 第五步：完善编辑和恢复

支持单个资产、单个分镜和单个章节的增量修改。恢复从最后一个成功步骤继续，已完成媒体不重复生成。

## 验收标准

功能验收：

- 首页可以上传小说或剧本并选择 Skill。
- 解析结果可以预览角色、场景、道具和分镜。
- 首页创建和项目内创建使用同一 manifest 链路。
- 用户确认后能创建项目、剧集、资产和 shots。
- 资产和分镜之间的引用稳定且可追踪。
- 纯文字请求不会产生媒体扣费任务。
- 生成任务失败可以恢复，不重复扣费。

隔离验收：

- 项目 Agent 没有 `canvas.patch` 工具。
- 画布 Agent 没有 `production.commit` 工具。
- 项目任务和画布任务由同一个任务中心管理，并使用不可变的 `agent_type`、`scope_type` 和 `scope_id` 做执行器路由和数据隔离。
- 统一任务中心的 lease、heartbeat、repair、取消、重试和监控不会绕过业务执行器边界。
- 项目生成使用 `placement=detached`。
- 画布生成使用 `placement=canvas`。
- 项目 Agent 的所有读写都经过项目和成员归属校验。
- 项目 Agent 的失败、取消和重试不会改变画布 revision、节点或对话。
- 新画布现有测试全部通过，且新增隔离负向测试全部通过。

## 相关现有实现

- AI 分镜解析和标准化：`apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.ts`
- 项目提交适配：`apps/backend/src/modules/project/creator-application.service.ts`
- 现有角色、场景、道具和分镜前端 API：`apps/web/src/shared/creator-api.js`
- 新画布 Agent 执行器：`apps/backend/src/modules/canvas-agent/canvas-agent-executor.ts`
- 新画布工具注册表：`apps/backend/src/modules/canvas-agent/canvas-agent-tool.registry.ts`
- 新画布任务类型和能力：`apps/backend/src/modules/canvas-agent/canvas-agent.types.ts`
- 项目和画布权限定义：`packages/contracts/domain/capabilities.ts`
