# 项目制作 Agent 会话体验一致性与运行隔离设计

> Date: 2026-09-17
> Status: Proposed design
> Scope: 将项目制作 Agent 会话页改造成与新画布 AI 助手一致的会话体验，同时保证画布、画布 AI 助手和项目制作 Agent 后续可以独立演进。
> Non-goal: 不把项目制作 Agent 接入 Canvas Agent，不改变项目结果最终格式化为项目数据结构的收口链路。

## 1. 结论

项目制作 Agent 可以使用与新画布 AI 助手一致的会话交互，但只能采用“体验一致、运行隔离”的实现方式：

```text
共享：无状态会话 UI 组件、交互规范、展示协议、通用前端基础能力
独立：会话状态、会话数据、任务、步骤、工具注册表、权限、执行器、业务上下文
```

项目制作 Agent 仍然是 `Production Agent`，新画布 AI 助手仍然是 `Canvas Agent`。两者不能共用带有业务副作用的会话容器、状态容器、工具集合或执行器。

本方案最重要的不可变约束是：

> **会话可以像 AI 助手一样对话，但会话产物最后仍必须经过 `format_project` 格式化为项目格式，再由 `create_project` 提交到现有项目模型。对话消息、Markdown 产物或模型原始 JSON 都不能直接作为项目落库输入。**

## 2. 背景与问题

当前项目已经具备两类不同用途的 Agent：

| Agent | 主要用途 | 上下文 | 允许的业务副作用 |
| --- | --- | --- | --- |
| 项目制作 Agent | 根据 Skill 和小说/剧本生成项目制作产物 | 源文本、Skill、会话工作区、项目格式 | 写会话产物、生成项目 Manifest、创建项目和项目资产 |
| 新画布 AI 助手 | 在画布中理解节点和用户意图并操作画布 | 画布文档、节点、连线、画布历史 | 写画布节点、连线、revision 和画布生成任务 |

两者的会话体验存在明显相似性：消息时间线、模型输出、工具调用、流式事件、附件、停止、重试和历史恢复。因此，用户希望制作 Agent 看起来和 AI 助手一致，这是合理的产品方向。

但业务目标不同：项目制作 Agent 是“产物生产和项目收口”，画布 AI 助手是“画布协作和节点编辑”。若直接复用画布会话实现，会把项目资产、画布节点、画布 revision、项目权限和画布权限混在一起，后续任一侧升级都可能影响另一侧。

## 3. 当前实现基线

本方案以仓库现有实现为基线，不要求重新发明会话系统。

### 3.1 项目制作 Agent 已有能力

当前项目制作 Agent 已有以下独立实现：

- 后端模块位于 `apps/backend/src/modules/project/`。
- 会话类型位于 `production-agent-session.types.ts`。
- 会话、消息、任务、步骤、事件和审批由 `production-agent-session.service.ts` 管理。
- Agent 执行循环由 `production-agent-session.executor.ts` 管理。
- 工具由 `production-agent-tools.ts` 和 `production-agent-tool.registry.ts` 注册。
- 前端会话状态和 UI 位于 `apps/web/src/features/production-workbench/production-agent-session.js`。
- 前端 API 位于 `apps/web/src/shared/creator-api.js` 的 `productionAgent*` 方法。
- HTTP 路由使用 `/api/production-agent/...`。
- 数据库迁移使用 `production_agent_conversations`、`production_agent_tasks`、`production_agent_steps`、`production_agent_events`、`production_agent_approvals` 和 `production_agent_messages`。

### 3.2 当前项目会话的业务收口

项目制作 Agent 的工具集合已经包含：

```text
load_skill
list_skill_files
read_skill_file
read_source
write_artifact
read_artifact
ask_user
format_project
create_project
```

其中：

1. `write_artifact` 只写入会话工作区产物。
2. `format_project` 将产物映射为 `project.json`，并执行结构化校验和分镜资产引用整理。
3. `create_project` 只能读取已经存在且合法的 `project.json`。
4. `create_project` 最终通过现有项目提交服务和 `Production Manifest` 创建项目、剧集、资产及分镜。
5. 项目制作 Agent 不允许调用 `canvas.patch` 或其它 `canvas.*` 工具。

以上链路是本方案的业务基础，不能因为会话页面改成 AI 助手样式而删除、绕过或提前执行。

## 4. 目标与非目标

### 4.1 目标

1. 让项目制作 Agent 使用与新画布 AI 助手一致的会话视觉和交互语言。
2. 支持用户消息、Agent 消息、工具调用、审批卡片、流式输出、停止、继续、失败重试和历史恢复。
3. 让会话过程可以逐步展示 Skill 加载、源文本读取、产物写入、项目格式化和项目创建。
4. 让项目制作 Agent 后续可以独立升级，不依赖画布 AI 助手的版本、执行器或数据库变化。
5. 保留现有项目数据结构、项目工作台、Production Manifest 和项目权限模型。
6. 保证最终结果仍然经过项目格式化收口，再进入现有项目模型。

### 4.2 非目标

- 不把项目制作 Agent 改成 Canvas Agent。
- 不让项目制作 Agent 读取画布私有上下文。
- 不让项目制作 Agent 写入画布节点、连线、revision、画布对话或 Canvas Agent 表。
- 不把 `canvas_agent_conversations` 作为项目制作会话表。
- 不把项目制作产物直接写成画布节点。
- 不把消息文本、Skill 原文或模型原始响应直接作为项目落库数据。
- 不改变项目最终的角色、场景、道具、剧集、分镜和媒体任务结构。
- 不因为 UI 一致而新增第二套项目资产、分镜、提示词或生成结果状态。

## 5. 设计原则

### 5.1 体验复用，业务不复用

可复用内容必须是无状态展示能力或经过明确抽象的交互协议，例如：

- 会话页面外壳
- 消息时间线
- 流式消息展示
- 工具调用卡片
- 审批卡片
- 停止和重试按钮
- 附件展示
- 空状态、加载状态和错误状态
- 键盘快捷键和滚动保持规则

不可直接复用内容包括：

- Canvas Agent conversation store
- Canvas Agent task store
- Canvas Agent executor
- Canvas Agent tool registry
- Canvas context provider
- 画布节点和 revision 状态
- 画布对话 summary
- 画布生成任务的 placement 语义

### 5.2 业务身份必须显式传递

任何任务、事件、执行请求和结果回写都必须包含明确的业务路由：

```text
agentType: production | canvas
scopeType: session | project | canvas
scopeId: 会话 ID、项目 ID 或画布 ID
workflowId
taskId
ownerUserId
actorTeamMemberId
```

不能使用“是否存在 `canvasId`”推断任务属于哪一类，也不能用项目 ID 伪装成画布 ID。

### 5.3 最终格式化是硬门槛

项目制作 Agent 的自由对话不等于自由落库。所有会话产物都必须经过以下链路：

```text
源文本 + Skill
  -> 会话产物 artifacts
  -> format_project
  -> project.json
  -> Production Manifest 校验
  -> create_project
  -> 现有项目、剧集、资产、分镜结构
```

以下行为一律禁止：

- Agent 直接调用项目数据库写入器绕过 `format_project`。
- Agent 直接把 `write_artifact` 的 Markdown 内容当作项目字段。
- Agent 直接把模型响应中的任意 JSON 当作项目结构。
- Agent 在未生成合法 `project.json` 时调用 `create_project`。
- Agent 为了满足 schema 擅自编造缺失角色、场景、道具或分镜。

## 6. 总体架构

```text
                         共享无状态体验层
      ┌─────────────────────────────────────────────┐
      │ AgentChatShell                              │
      │ MessageTimeline / ToolCard / ApprovalCard   │
      │ Composer / AttachmentView / EventRenderer   │
      └──────────────────────┬──────────────────────┘
                             │ adapter props only
             ┌───────────────┴────────────────┐
             │                                │
      ProductionAgentAdapter             CanvasAgentAdapter
             │                                │
   ProductionAgentSession              CanvasAgentSession
   production store                    canvas store
             │                                │
   ProductionAgentExecutor              CanvasAgentExecutor
             │                                │
   production tools                     canvas tools
             │                                │
   project/production scope             canvas scope
             │                                │
   format_project                       canvas.patch
   create_project                       canvas revision
```

共享层只负责把后端返回的领域事件渲染为统一体验。共享层不能根据消息文本猜测工具，也不能在渲染时执行任何业务写入。

## 7. 会话页面设计

### 7.1 页面分区

项目制作 Agent 页面可以采用与新画布 AI 助手相同的整体布局：

```text
┌──────────────────────────────────────────────────────────┐
│ 返回 | 项目制作 Agent | 模型 | 当前状态 | 停止              │
├──────────────────────────────┬───────────────────────────┤
│ 对话时间线                    │ 会话工作区                │
│                              │ 源文本                    │
│ 用户消息                     │ Skill 文件清单            │
│ Agent 消息                   │ 产物文件                  │
│ 工具调用卡片                 │ project.json              │
│ 确认卡片                     │                           │
│ 流式输出                     │ 选中文件预览              │
├──────────────────────────────┴───────────────────────────┤
│ 输入框 | 附件 | 发送 | 停止/继续                            │
└──────────────────────────────────────────────────────────┘
```

布局可以与画布助手相似，但页面上下文必须标识为“项目制作 Agent”，不显示画布节点、画布 revision 或画布操作按钮。

### 7.2 消息类型

共享 UI 层支持以下领域无关的消息类型：

| 类型 | 展示 | Production Agent 示例 | Canvas Agent 示例 |
| --- | --- | --- | --- |
| `user` | 用户气泡 | “只要角色和场景” | “把这个节点接到图片节点” |
| `assistant` | Agent 气泡 | “已读取剧本，准备抽取角色” | “我会修改这条连线” |
| `tool` | 工具卡片 | `read_skill_file`、`write_artifact` | `canvas.read`、`canvas.patch` |
| `approval` | 确认卡片 | 确认写产物、格式化或创建项目 | 确认画布修改 |
| `result` | 结果卡片 | `project.json` 摘要、项目 ID | revision、节点结果 |
| `error` | 错误卡片 | Skill 缺失、格式化失败 | revision 冲突、节点执行失败 |

领域适配器负责把领域事件转换为上述展示模型。共享组件不得把 `canvas.patch` 或 `create_project` 当成同一种业务动作处理。

### 7.3 输入框与附件

项目制作 Agent 的输入框可以与 AI 助手保持一致，但输入能力必须绑定项目制作范围：

- 支持用户补充要求、指定只生成某类产物、要求继续、停止或重做。
- 支持源文本附件或已上传文件引用。
- 附件必须进入 Production Agent 的文件授权范围。
- 附件不能自动授予画布读取权限。
- 项目制作会话不能通过输入框注入画布 ID、画布节点 ID 或 Canvas 工具。
- 会话模型和 Skill 选择继续使用项目制作 Agent 的配置。

### 7.4 工作区

工作区用于展示会话中的中间文件，不等于项目数据库：

| 文件类别 | 来源 | 是否可直接落库 |
| --- | --- | --- |
| 源文本 | 用户输入或上传文件 | 否，需作为格式化输入 |
| Skill 文件 | Skill Plaza | 否，作为规则输入 |
| 产物文件 | `write_artifact` | 否，必须经过 `format_project` |
| `project.json` | `format_project` | 否，必须再经过 Manifest 校验和 `create_project` |
| 已创建项目引用 | `create_project` | 是，指向现有项目记录 |

工作区可以允许用户查看文件和在确认前修改草稿，但任何修改都必须重新参与下一次 `format_project`，不能保留旧的项目结构副本。

## 8. Production Agent 专属会话流程

### 8.1 创建会话

创建会话时保存：

- 会话标题。
- `mode`，当前支持 `ask` 和 `auto` 类型定义。
- 文本模型及模型配置快照。
- 源文本元数据和受限正文。
- 所选 Skill 目录和文件清单。
- 当前项目制作 Agent 身份。

创建会话时不创建画布会话，不读取画布文档，也不创建项目资产。

### 8.2 理解任务

Agent 先读取 Skill 说明和源文本，再在对话中说明下一步计划。模型可以决定需要读取哪些 Skill 文件，但平台不应按文件名自动把所有手册注入上下文。

典型事件序列：

```text
task.created
model.thinking
tool.started(load_skill)
tool.succeeded(load_skill)
tool.started(read_source)
tool.succeeded(read_source)
model.delta
```

### 8.3 逐步写产物

每次只写一个会话产物文件：

```text
读取当前步骤需要的 Skill 文件
读取源文本或已有产物
模型生成当前一份产物
write_artifact 写入工作区
在时间线展示工具结果
决定下一步或等待用户
```

可以并行执行互不依赖的角色、场景或道具提取，但每次写入仍必须明确对应的文件和步骤。

### 8.4 最终格式化为项目格式

这是不可改变的正式收口步骤。

当 Agent 判断产物已齐，或用户明确要求“整理成项目”时，Agent 必须调用 `format_project`。该工具只做结构对齐和引用整理，不改写用户已确认的业务内容。

标准项目结构至少包含以下字段：

```json
{
  "title": "项目标题",
  "scriptText": "正式剧本文本",
  "scenes": [
    {
      "sceneName": "场景名称",
      "sceneDescription": "场景描述",
      "sceneImagePrompt": "场景图片提示词"
    }
  ],
  "characters": [
    {
      "characterName": "角色名称",
      "characterDescription": "角色描述",
      "characterImagePrompt": "角色图片提示词"
    }
  ],
  "props": [
    {
      "propName": "道具名称",
      "propDescription": "道具描述",
      "propImagePrompt": "道具图片提示词"
    }
  ],
  "storyboards": [
    {
      "shotNo": 1,
      "plot": "镜头情节",
      "dialogue": "对白或旁白",
      "imagePrompt": "图片提示词",
      "videoPrompt": "视频提示词",
      "sceneName": "场景名称",
      "characterNames": ["角色名称"],
      "propNames": ["道具名称"]
    }
  ]
}
```

格式化规则：

1. 缺少的类别使用空数组，不编造内容。
2. 名称必须来自已有源文本或会话产物。
3. Skill 不产分镜时，`storyboards` 允许为空。
4. `storyboards` 中的场景、角色和道具引用必须由格式化阶段解析为现有项目关系。
5. 内容不完整时，格式化工具返回缺失项，不创建项目。
6. 内容结构不符合项目 schema 时，要求 Agent 重新调用 `format_project`，不能让 `create_project` 猜测修复。
7. 格式化成功后，`project.json` 写入会话工作区，供用户查看和确认。

### 8.5 创建项目

只有在 `project.json` 存在且通过校验后，才能调用 `create_project`：

```text
project.json
  -> Production Manifest
  -> Production Manifest validator
  -> 现有项目提交服务
  -> 项目 / 剧集 / 角色 / 场景 / 道具 / shots
  -> 项目工作台
```

`create_project` 必须保持幂等：同一会话重复提交时复用已经创建的项目，不重复创建项目、剧集、资产或 shots。

创建成功后：

- 在会话时间线展示项目摘要和“进入工作台”按钮。
- 会话保存 `createdProjectId` 和可选的剧集 ID。
- 项目制作会话仍保留为历史记录。
- 不创建画布节点，不写入 Canvas Agent conversation，不修改画布 revision。

## 9. 与 AI 助手一致的交互映射

### 9.1 可共享组件协议

建议抽象为纯展示组件或纯事件转发组件：

```text
AgentChatShell
AgentChatHeader
AgentMessageTimeline
AgentMessage
AgentToolCallCard
AgentApprovalCard
AgentStreamingMessage
AgentComposer
AgentAttachmentList
AgentWorkspacePanel
AgentErrorCard
```

组件只接收领域适配器提供的 props：

```js
{
  agentKind: "production" | "canvas",
  messages: [],
  events: [],
  task: {},
  capabilities: {},
  onSend: fn,
  onStop: fn,
  onApprove: fn,
  onReject: fn,
  onRetry: fn
}
```

组件不接收数据库连接、Canvas graph 实例、Production Manifest 写入器或任意业务服务对象。

### 9.2 不应共享的适配逻辑

以下逻辑必须由各自 Agent 适配器实现：

- 工具名称到中文展示文案的映射。
- 事件类型到活动状态的映射。
- 工具审批规则。
- 错误码到用户提示的映射。
- 任务恢复和重试 API。
- 工作区文件分组。
- 结果摘要生成。
- 业务范围校验。

例如，Production Agent 的 `format_project` 应显示为“收口项目格式”，Canvas Agent 不应知道这个工具；Canvas Agent 的 `canvas.patch` 应显示为画布修改，Production Agent 不应注册或渲染为可执行工具。

## 10. 运行隔离要求

### 10.1 前端隔离

项目制作 Agent 使用自己的状态字段和 API：

```text
ui.productionAgentSession
/api/production-agent/...
```

新画布 AI 助手继续使用自己的会话状态、画布状态和路由。两边可以由同一套无状态会话组件渲染，但不能共用可变业务对象。

以下状态不能跨 Agent 共享：

- 当前会话 ID。
- 当前任务 ID。
- 消息列表。
- 工具事件列表。
- 当前工具调用。
- 审批状态。
- 流式文本。
- 画布节点选择。
- 画布 revision。
- 项目工作区 artifacts。
- `project.json`。

### 10.2 后端隔离

Production Agent 必须继续使用：

```text
ProductionAgentSessionExecutor
ProductionAgentToolRegistry
production_agent_* tables
agentType=production
scopeType=session 或 project
```

Canvas Agent 必须继续使用：

```text
CanvasAgentExecutor
Canvas Agent Tool Registry
canvas_agent_* tables
agentType=canvas
scopeType=canvas
```

共用统一任务中心时，领取任务、续租、重试、取消、完成和结果回写都必须再次验证 `agentType`、`scopeType` 和 `scopeId`。

### 10.3 工具隔离

Production Agent 工具白名单：

```text
load_skill
list_skill_files
read_skill_file
read_source
write_artifact
read_artifact
ask_user
format_project
create_project
```

项目制作 Agent 不得注册：

```text
canvas.read
canvas.patch
canvas.read_history
```

Canvas Agent 不得注册：

```text
production.commit
create_project
format_project
```

即使模型返回了 `canvas.patch`，Production Agent 执行器也必须拒绝并记录 `production_agent_canvas_tool_forbidden`，而不是尝试执行。

### 10.4 数据库隔离

项目制作会话只写入 `production_agent_*` 表和现有项目提交链路。不得写入：

- `canvas_agent_conversations`
- `canvas_agent_tasks`
- `canvas_agent_steps`
- 画布文档
- 画布节点
- 画布 revision
- 画布对话 summary

画布 AI 助手的失败、停止、重试和恢复也不得修改 Production Agent 的会话、产物、Manifest 或项目数据。

## 11. 状态模型

### 11.1 会话状态

```text
idle
  -> active
  -> archived
```

会话本身可以长期保留；一次用户发送对应一个独立任务。

### 11.2 任务状态

现有 Production Agent 任务状态保持不变：

```text
queued
  -> running
  -> waiting_approval
  -> running
  -> succeeded

running -> paused
running -> failed
running -> canceled
waiting_approval -> canceled
```

终态任务不能被前端假装恢复为原任务的 running lease。继续执行应创建新的任务或按现有恢复规则恢复为 `queued` 后重新领取。

### 11.3 会话 UI 状态

UI 可以派生以下状态，但不得保存第二份业务聚合数据：

- `isRunning`
- `canSend`
- `canStop`
- `canApprove`
- `canContinue`
- `hasProjectJson`
- `hasCreatedProject`
- `selectedArtifact`
- `eventCursor`

阶段完成度、缺失数量和失败数量必须从服务端会话产物、任务和事件派生。

## 12. 接口边界

当前接口继续作为 Production Agent 的正式接口：

```text
POST /api/production-agent/conversations
GET  /api/production-agent/conversations/:conversationId
GET  /api/production-agent/conversations/:conversationId/messages
POST /api/production-agent/conversations/:conversationId/messages
GET  /api/production-agent/conversations/:conversationId/source
GET  /api/production-agent/conversations/:conversationId/skill-files
GET  /api/production-agent/agent-tasks/:taskId/events
POST /api/production-agent/agent-tasks/:taskId/stop
POST /api/production-agent/agent-tasks/:taskId/approve
```

接口约束：

1. 会话接口只返回 Production Agent 会话及其授权范围内的数据。
2. SSE 事件必须携带任务 ID、序号和事件类型，前端可以通过 `last-event-id` 恢复。
3. 消息历史和工具事件可以由共享 UI 渲染，但 API 路由不能改成 Canvas Agent 路由。
4. 后续如果增加历史列表、分页或会话归档，应继续使用 `production-agent` 命名空间。
5. 任何创建项目的请求都必须由会话工作区中的 `project.json` 和服务端 Manifest 校验驱动。

## 13. 错误、停止和恢复

### 13.1 错误展示

共享错误卡只负责展示标题、说明和操作按钮，错误语义由 Production Agent 适配器提供。

至少保留以下项目制作错误语义：

| 错误 | 用户提示方向 | 是否影响画布 |
| --- | --- | --- |
| `production_agent_model_response_invalid` | 模型返回格式异常，可重试 | 否 |
| `production_agent_skill_not_found` | Skill 不存在或无权访问 | 否 |
| `production_agent_artifact_not_found` | 会话产物不存在 | 否 |
| `production_agent_project_json_required` | 先完成项目格式化 | 否 |
| `production_agent_use_format_project` | 不允许直接写 `project.json` | 否 |
| `production_agent_canvas_tool_forbidden` | 不允许调用画布工具 | 否 |
| `production_agent_*_incomplete` | 继续补全对应类别 | 否 |

### 13.2 停止

用户点击停止时：

1. 只停止当前 Production Agent 任务。
2. 保留已经写入的产物和事件。
3. 不取消画布任务。
4. 不删除项目工作区内容。
5. 不回滚已经创建的项目。
6. 后续继续必须从服务端会话状态开始，而不是使用前端内存中的旧消息猜测进度。

### 13.3 继续和重试

- 模型失败：允许重试当前任务或发送新的用户消息。
- 工具失败：保留工具失败事件，允许 Agent 调整后重试。
- 格式化失败：只能重新执行 `format_project`，不能跳过格式化。
- 创建项目失败：修正 `project.json` 或提交链路后再执行 `create_project`。
- 画布失败：由 Canvas Agent 自己处理，不触发 Production Agent 重试。

## 14. 权限与安全

### 14.1 能力

项目制作 Agent 继续使用独立能力：

```text
production:view
production:run
production:plan
production:asset:write
production:shot:write
production:commit
```

画布能力继续只表示画布权限：

```text
canvas:view
canvas:edit
canvas:run
canvas:manage
```

拥有画布权限不自动获得项目制作写权限，拥有项目制作权限也不自动获得画布编辑权限。

### 14.2 输入不可信

以下内容全部视为不可信输入：

- 用户源文本。
- Skill 文件正文。
- 上传文件内容。
- 会话产物。
- 模型输出。
- 工具返回的文本。

模型不得通过这些内容提升权限、调用未注册工具、读取其它会话文件或修改画布。

### 14.3 项目归属

项目、团队和子账户归属继续以当前主用户及其子用户关系为准。历史迁移字段不能被会话 UI、工具参数或接口契约重新暴露为当前业务归属。

## 15. 实现分层

### 15.1 共享 UI 层

建议新增或抽取纯 UI 模块：

```text
apps/web/src/shared/agent-chat/
  agent-chat-shell.js
  agent-chat-timeline.js
  agent-chat-message.js
  agent-chat-tool-card.js
  agent-chat-approval-card.js
  agent-chat-composer.js
  agent-chat-workspace.js
  agent-chat-events.js
  agent-chat.css
```

该层不得导入 `canvas-agent` 或 `production-agent` 的后端执行器，不得直接调用 API，不得写项目或画布状态。

### 15.2 Production 适配层

项目制作页面保留独立适配：

```text
apps/web/src/features/production-workbench/
  production-agent-session.js
  production-agent-session-adapter.js
```

适配层负责：

- Production Agent 消息和事件转换。
- `format_project`、`create_project` 文案和结果摘要。
- 项目工作区文件分组。
- Production Agent 错误和恢复按钮。
- 项目路由和 API 调用。

### 15.3 Canvas 适配层

画布助手继续保留自己的适配和状态，不把 Production 的适配逻辑反向注入画布模块。

## 16. 数据结构约束

### 16.1 会话工作区

```js
{
  artifacts: {
    "screenplay.md": "...",
    "characters.md": "...",
    "scenes.md": "...",
    "props.md": "...",
    "storyboards.md": "...",
    "project.json": "..."
  },
  projectJson: {},
  reshapePending: false
}
```

`projectJson` 只能由 `format_project` 生成或更新。前端不能直接向工作区写入任意 `projectJson` 对象来绕过服务端校验。

### 16.2 任务快照

任务快照必须保存不可变路由字段：

```json
{
  "agentType": "production",
  "scopeType": "session",
  "scopeId": "production-conversation-id",
  "conversationId": "production-conversation-id",
  "agentTaskId": "production-task-id",
  "mode": "auto",
  "modelCode": "text-model-code"
}
```

任务执行、恢复和事件流必须校验这些字段。如果路由不匹配，返回错误，不尝试“修正”成另一种 Agent。

## 17. 测试方案

### 17.1 共享 UI 测试

- 同一套消息时间线可以渲染 Production 和 Canvas 两种适配数据。
- 共享组件不调用任一业务 API。
- 共享组件不修改项目或画布状态。
- 流式事件可以按序号追加，重复事件不重复显示。
- 断线重连使用最后事件序号恢复。
- 滚动位置和自动贴底行为保持一致。

### 17.2 Production Agent 单元测试

- `format_project` 是创建项目的必要前置条件。
- 缺少脚本、角色、场景、道具或分镜时返回明确缺失项。
- 缺少分镜但 Skill 不产分镜时允许空 `storyboards`。
- `write_artifact` 不能直接写 `project.json`。
- `create_project` 没有合法 `projectJson` 时拒绝执行。
- `create_project` 重放不会重复创建项目、剧集、资产或 shots。
- `canvas.patch` 和所有 `canvas.*` 工具都会被 Production Agent 拒绝。
- 项目任务只能使用 `agentType=production` 和 `scopeType=session/project`。

### 17.3 Canvas Agent 负向测试

- Canvas Agent 不能调用 `production.commit` 或 `create_project`。
- Canvas Agent 不能读取 Production Agent 会话工作区。
- Canvas Agent 失败、取消和恢复不修改 Production Agent 会话。
- Canvas Agent 任务不能被 Production Agent 执行器领取。

### 17.4 集成测试

至少覆盖以下事件链路：

```text
创建 Production 会话
  -> 发送消息
  -> 写入角色/场景/道具/分镜产物
  -> format_project
  -> 校验 project.json
  -> create_project
  -> 读取项目工作台数据
```

同时验证：

- 画布 revision 前后不变。
- `canvas_agent_conversations` 行数不变。
- 项目数据符合现有项目 schema。
- 重复 SSE 事件不重复追加消息。
- 任务停止后可以从事件游标继续读取。

### 17.5 浏览器验收

- 项目制作会话页面与 AI 助手具有一致的消息、工具卡和输入框体验。
- 项目制作页面不出现画布节点、连线或 revision 控件。
- 点击停止只停止项目制作任务。
- 格式化前不会出现“创建项目”成功状态。
- 格式化成功后可查看 `project.json` 摘要。
- 创建项目成功后可以进入现有项目工作台。
- 切换或打开画布不会带入 Production Agent 消息和工作区。

## 18. 交付顺序

### 阶段一：定义共享展示协议

1. 固定共享消息、工具、审批、错误和流式事件展示模型。
2. 保持 Production 和 Canvas 的 API 适配器独立。
3. 添加共享 UI 的纯渲染测试。

### 阶段二：迁移 Production 页面外观

1. 用共享会话外壳替换 Production Agent 页面外层。
2. 保留现有 `productionAgentSession` 状态和 API。
3. 保留项目工作区和产物预览。
4. 保留 `format_project` 和 `create_project` 操作卡片。

### 阶段三：补齐一致性和隔离测试

1. 添加跨 Agent 负向测试。
2. 添加格式化前置条件测试。
3. 添加事件流断线恢复测试。
4. 添加浏览器端会话体验回归测试。

### 阶段四：独立发布和后续演进

1. Production Agent UI 版本独立发布。
2. Canvas Agent UI 和执行器独立发布。
3. 共享 UI 组件只做向后兼容的无状态变更。
4. 任何一侧需要改变业务协议时，先改自己的适配器，不直接修改另一侧状态或表结构。

## 19. 版本与发布策略

共享 UI 层采用向后兼容策略：

- 新增展示字段必须可选。
- 旧事件类型仍能降级为普通消息或工具卡。
- Production 和 Canvas 可以使用不同的适配器版本。
- 不允许共享组件根据 Agent 名称分支执行副作用。
- 业务 API、数据库表和执行器的版本升级必须由各自模块负责。

发布前必须确认：

```text
Production Agent 的变更只触及 production 适配器、项目会话模块或共享无状态 UI
Canvas Agent 的变更只触及 canvas 适配器、画布模块或共享无状态 UI
两边没有新增互相导入的业务依赖
```

## 20. 验收标准

### 20.1 体验一致性

1. 项目制作 Agent 使用与 AI 助手一致的会话外壳、消息时间线、工具卡、审批卡、流式输出和输入框。
2. 用户可以在同一会话中查看用户消息、Agent 消息、工具执行和结果摘要。
3. 停止、继续、审批、失败重试和历史恢复行为有一致的交互反馈。
4. 桌面和窄屏布局不出现横向溢出或会话内容遮挡。

### 20.2 业务隔离

1. Production Agent 不调用任何 `canvas.*` 工具。
2. Production Agent 不读取、创建或修改画布节点、连线、revision 和画布对话。
3. Canvas Agent 不调用 `format_project`、`create_project` 或项目提交工具。
4. 两类任务通过 `agentType`、`scopeType`、`scopeId` 路由，不能互相领取。
5. 画布任务失败、停止、重试和升级不会改变 Production Agent 数据。
6. Production 任务失败、停止、重试和升级不会改变画布数据。

### 20.3 项目格式收口

1. `write_artifact` 只能写会话产物，不能直接写 `project.json`。
2. 所有项目结果必须经过 `format_project`。
3. `format_project` 输出合法的项目结构并写入会话工作区。
4. 格式化缺失或失败时，不能调用 `create_project`。
5. `create_project` 只能使用经过服务端校验的 `project.json` 和 Production Manifest。
6. 创建成功后，结果进入现有项目、剧集、资产、分镜和项目工作台格式。
7. 重复提交保持幂等，不重复创建项目数据。

## 21. 明确禁止的实现

- 直接把 Production Agent 页面改成调用 Canvas Agent API。
- 直接把 `canvas_agent_conversations` 当作项目制作会话表。
- 直接把 Canvas Agent executor 改成同时处理 Production 任务。
- 在共享 UI 组件中根据按钮文案调用 `canvas.patch` 或 `create_project`。
- 用前端隐藏按钮代替后端工具和权限隔离。
- 用 `canvasId` 是否为空推断业务类型。
- 用会话消息内容直接创建项目。
- 跳过 `format_project` 直接提交资产或分镜。
- 为了让界面看起来一致而复制一套项目资产、分镜或生成任务状态。
- 将画布升级绑定到 Production Agent 的发布节奏。

## 22. 相关文档与实现

- [项目制作 Agent 工作流设计](../project-production-agent-workflow.md)
- [创作 Agent 会话方案](../superpowers/specs/2026-09-15-production-agent-session-design.md)
- [AI Canvas Workflow Development Spec](./canvas-ai-workflow-dev-spec.md)
- `apps/backend/src/modules/project/production-agent-session.types.ts`
- `apps/backend/src/modules/project/production-agent-session.service.ts`
- `apps/backend/src/modules/project/production-agent-session.executor.ts`
- `apps/backend/src/modules/project/production-agent-tools.ts`
- `apps/web/src/features/production-workbench/production-agent-session.js`
- `apps/web/src/shared/creator-api.js`
- `packages/db/migrations/20261107-create-production-agent-session.sql`

## 23. 最终决策

采用以下方案：

```text
项目制作 Agent = 独立会话和独立业务执行
新画布 AI 助手 = 独立会话和独立画布执行
会话 UI = 可以共享无状态体验组件
任务中心 = 可以统一调度，但必须按业务路由隔离
最终项目结果 = 必须 format_project -> project.json -> Manifest 校验 -> create_project
```

这能满足“制作 Agent 会话功能像 AI 助手”与“画布和 AI 助手后续独立更新不影响制作 Agent”两个目标，同时不改变项目最终结果格式化为项目格式这一条业务要求。
