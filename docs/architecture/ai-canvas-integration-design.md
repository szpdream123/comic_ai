# AI Canvas 集成架构设计

> 状态：设计基线
>
> 对比来源：[Tenney95/AI-Canvas-tauri](https://github.com/Tenney95/AI-Canvas-tauri)，`origin/master` `236be2f`（v0.9.2，2026-09-06）；上一轮基线为 `8773129`。
>
> 目标：在现有项目内重构一个完整的 AI 多模态画布。画布是独立业务实体，一个主用户可以拥有多个画布；画布不关联漫画项目。子用户只能访问主用户分配给他的画布。

## 1. 决策摘要

### 1.1 产品边界

- Canvas 是独立资源，产品概念使用“画布”，不使用“项目画布”或“漫画项目画布”。数据库中现有 `creator_canvas_projects` 名称暂时保留作为兼容实现细节。
- 一个主用户可以创建多个画布；画布之间不共享文档、会话、记忆或 revision。画布资产关联相互隔离，但同一主用户资产库中的稳定资产可以被多个画布显式引用。
- `team_member_canvases` 只定义子用户被分配到哪些画布；具体查看、编辑和运行操作继续由现有角色/能力体系判定。分配关系不产生新的所有权，删除和分配管理始终属于主用户。
- 不迁移旧画布文档。新 Canvas 文档使用新协议创建；旧画布只保留必要的审计和兼容数据。
- AI Canvas 的唯一产品入口是现有左侧导航中“画布”下面的“新画布”。现有“画布”功能保持不变，二者不共用页面状态或文档协议。
- “新画布”使用独立的 `new-canvas` 导航状态和 `/new-canvas` 路由，在现有产品主内容区挂载，不创建独立浏览器窗口。
- Agent、资产库、历史、设置和 3D 导演台都属于画布内的面板或全屏覆盖层，不创建独立窗口。
- 本轮页面交付和验收以桌面浏览器为范围；不新增手机端自适应布局或移动端专属交互门禁，移动端能力若已有实现仅作为兼容性保留。

### 1.2 产品入口与页面层级

当前 `renderRailTab()` 已经在 `tools`（“画布”）按钮后渲染了“新画布”，但该按钮处于 `disabled` 状态。集成时只启用这个预留入口，不新增第二个侧栏位置，也不把 AI Canvas 塞入现有 `tools` 页面。

```text
左侧导航
├─ 首页
├─ 画布             activeNavTab = tools       route = /canvas
├─ 新画布           activeNavTab = new-canvas  route = /new-canvas
├─ 导演台
├─ 剧本
├─ 项目
├─ 资产库
└─ 团队
```

入口改造约定：

- 将当前禁用的“新画布”按钮改为标准 `set-nav-tab` 按钮，`data-tab="new-canvas"`。
- 在 `NAV_TABS`、`PUBLIC_NAV_PATHS`、`PUBLIC_PATH_TOKENS`、初始路由恢复和 `syncWorkbenchRouteState()` 中注册 `new-canvas`。
- `renderMainPanel()` 在 `activeNavTab === "new-canvas"` 时只渲染 AI Canvas host container，由独立的挂载器负责加载和卸载 Canvas 模块。
- “新画布”首次进入显示当前用户可访问的画布列表和“创建画布”命令；打开某个画布后仍停留在 `new-canvas` 导航状态，在同一内容区切换到编辑器。
- 关闭编辑器或点击返回时回到“新画布”的画布列表，不跳转到“画布”或“项目”。
- 顶部全局状态栏、登录、任务中心、购物车、积分和用户菜单继续由现有产品 Shell 提供。AI Canvas 不重复渲染品牌栏、账号入口、桌面标题栏或独立开屏页。
- AI Canvas 内部的 Agent、资产、历史、设置使用侧栏、抽屉或模态层；3D 导演台使用当前页面全屏覆盖层。
- Canvas 模块卸载时必须停止前端订阅、释放 AntV X6/Three.js 资源并保存未提交草稿，但不能停止已经进入后端队列的生成任务。

页面层级：

```text
Production Workbench Shell
└─ activeNavTab = new-canvas
   ├─ Canvas Library（默认）
   │  ├─ 用户拥有的多个画布
   │  ├─ 子用户被分配的画布
   │  └─ 创建、搜索、归档、删除入口
   └─ Canvas Editor（打开画布后）
      ├─ 最近打开的 Canvas 会话标签
      ├─ AntV X6 Canvas
      ├─ Node/Generation UI
      ├─ Agent / Asset / History / Settings
      └─ Director Desk Fullscreen Overlay
```

### 1.3 复用原则

以下能力继续作为唯一权威来源，不在 Canvas 前端重新实现一套：

| 能力 | 复用模块 |
| --- | --- |
| 登录与主用户/子用户身份 | identity、session、team 服务 |
| 模型目录与 Provider | model-gateway、模型配置和 Provider adapter |
| 计费与额度 | credit ledger、reservation、generation reconciliation |
| 异步任务 | BullMQ、generation task、poll/webhook、task recovery |
| 文件与对象存储 | upload-session、storage、asset、signed URL |
| 画布持久化基础设施 | `creator-canvas-record.service.ts`、revision、run、artifact |
| 3D 导演台 | `apps/web/src/features/director-desk` 的内嵌模块和 `/api/director-desks` |

新 Canvas 只增加画布专属的协议、编排、Agent 和 UI，不复制上述底层能力。

## 2. 现状与 Git 功能对照

AI Canvas 上游不是“一个 AntV X6 画布”，而是完整的本地优先创作应用。必须覆盖下列功能组：

| 功能组 | 上游功能 | 集成策略 |
| --- | --- | --- |
| 节点 | 文本、图片、视频、音频、动画、全景、Markdown、分镜、导演台、源文件、评论、分组 | 前端完整移植；后端扩展节点和端口白名单 |
| 画布生产力 | 小地图、网格、吸附、参考线、对齐、分布、分组、复制粘贴、连接释放菜单、拖放、快捷键、工具栏布局 | 复用 AntV X6 交互模型，统一接入 Canvas Store |
| 图片编辑 | 裁剪、扩图、矢量标注、抠图、自由视角、Camera Studio、多图合成、自定义宫格、生成历史 | 使用上游编辑器/包的受控 API；图片结果写入 Asset/Artifact |
| 媒体 | TTS、音乐、歌词、音频转录、视频参数、Sprite Sheet、全景漫游和截图 | 统一进入现有 generation gateway；新增缺失的音频转录入口 |
| 生成 | 选中节点批量、DAG 拓扑执行、无依赖并发、部分成功、轮询恢复、取消、重试、历史、产物选择 | 新增 Canvas Generation Runtime，底层调用现有任务中心 |
| Prompt | `@node`、`@asset`、`@model`、`@voice`、`@drama`、斜杠命令、预设、Skill、风格、后缀 | 画布级设置，不引用漫画项目 |
| 模型 | Provider 目录、连接测试、通用模型、协议编辑器、智能导入、图片参考图请求模式 | 复用后端模型目录；自定义协议作为受控配置能力保留 |
| Agent | 多会话、B/C、计划、审批、工具、时间线、后台任务、恢复、插话、检查点、回退、记忆、联网研究、厂商文档、MCP | 新增 Canvas Agent 服务，所有 effect 在服务端校验 |
| 资产 | 指纹、索引、库、缩略图、提示词标签、回收站、复制/下载进度、取消 | 复用 COS/S3 和资产表，增加 Canvas 引用和标签服务 |
| 短剧资产 | 人物、场景、道具提取、确认、`@drama` 引用、一键创建图片节点；v0.6.6 全局角色库、多参考图、头像裁切、节点捕获和隐藏恢复 | 作为 Canvas 独立资产域，不关联漫画项目表；角色库使用“本画布 / 全局资产”而不是“本项目” |
| 外观 | 主题、画布背景、开屏、吉祥物、节点动效、存储健康、更新提示 | 移植适用 UI；开屏改为宿主内加载状态，桌面能力改为 Web 形式 |

上游源码和测试以该 commit 为准，不以 README 单独作为功能清单。

2026-07-26 增量对照已更新到上游 v0.6.7 `8773129`（上一轮 `0f3ca1c`）：除 v0.6.5/v0.6.6 的设置保存串行化、统一宽高比、全局角色库、多参考图、头像裁切、节点捕获角色、资产重命名和媒体提示词偏好外，还包含角色参考图多选/合并全部、参考图库排版、可拖动吉祥物位置持久化、毛发着色器、拖动受力反馈和状态发光。本项目不照搬 IndexedDB/Tauri 数据边界：设置仍以 PostgreSQL revision 为准；角色数据按 `ownerUserId + canvasId` 或 owner 全局域保存；提示词偏好只能从用户明确确认的媒体提示词生成，并纳入 Agent 记忆写入审批、删除和审计。角色多参考图、`@drama:<characterId>@<referenceId|all>` 以及吉祥物显示/拖动/位置持久化/毛发/受力/响应式重定位均已完成 Web/服务端适配。

需要特别说明：上游仓库使用的是 **AI Canvas Tauri Source-Available License**，不是 OSI 开源许可证。本项目虽已获得作者同意，仍必须按第 17 节保存书面授权范围和第三方许可记录，不能只以仓库公开为依据。

## 3. 总体架构

```text
┌────────────────────────────────────────────────────────────┐
│ 现有产品 App                                                │
│ 认证 / Sidebar / Creator API / 计费 / 全局 Toast            │
│                                                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Canvas Route / Mount                                   │ │
│  │ Canvas Shell                                            │ │
│  │  ├─ AntV X6 画布、节点、边、分组、历史                 │ │
│  │  ├─ 生成面板、资产面板、输出历史、设置                  │ │
│  │  ├─ Canvas Agent 面板                                  │ │
│  │  └─ Director Desk 全屏覆盖层（Shadow DOM mount）        │ │
│  └───────────────────────┬────────────────────────────────┘ │
└──────────────────────────┼─────────────────────────────────┘
                           │ Creator API + SSE
┌──────────────────────────▼─────────────────────────────────┐
│ Canvas Backend                                               │
│  Canvas Access  │ Document/Revision │ Generation Runtime     │
│  Agent Runtime  │ Asset References │ Settings/Presets        │
└───────────┬───────────────┬───────────────┬─────────────────┘
            │               │               │
            ▼               ▼               ▼
       PostgreSQL       现有任务中心      COS/S3 + Asset
       canvas tables    BullMQ/provider   signed URL
```

### 3.1 数据流原则

1. 浏览器只保存当前画布的渲染状态、草稿和请求控制器。
2. PostgreSQL 保存 Canvas 文档、revision、权限、任务关系和 Agent 事件。
3. 媒体文件只进入现有对象存储；文档只保存 `assetId`、`assetVersionId`、`storageObjectId` 和受控元数据。
4. 签名 URL、Blob URL、Base64、API Key、本地绝对路径和完整文件正文不得进入 Canvas 文档、Agent 日志或持久化消息。
5. 任务完成只写对应 run/artifact 和节点字段，不整份覆盖用户最新文档。

### 3.2 前端模块与构建契约

AI Canvas 作为现有 Web 应用的 feature module 交付，建议源码位于 `apps/web/src/features/new-canvas`，只暴露稳定宿主接口：

```ts
mountNewCanvas(container, {
  actor,
  creatorApi,
  taskClient,
  billingClient,
  theme,
  onNavigate,
  onNotify,
}): { unmount(): Promise<void> }
```

- `new-canvas` 路由首次进入时动态加载模块，离开路由时调用 `unmount()`；重复进入不能残留 React root、SSE、定时器、AbortController、对象 URL、快捷键或 Three.js 资源。
- 模块进入现有 Web 构建产物，只生成动态 chunk，不生成独立 HTML、Tauri entry、桌面标题栏、登录页或第二套 App Shell。
- Canvas 样式使用 feature scope 或 Shadow DOM 隔离。若使用 Shadow DOM，所有菜单、Tooltip、Dialog 和 Toast portal 必须指向模块自己的 overlay root，并显式桥接宿主主题变量、字体和无障碍属性。
- 鉴权、API、任务、计费、Toast、主题和遥测由宿主注入；模块不得读取第二套 token、Provider key 或计费配置。
- 已进入后端队列的任务不属于前端挂载生命周期。卸载只停止观察，重新挂载后按 run/task ID 恢复。

## 4. Canvas 领域模型

### 4.1 Canvas 资源

现有 `creator_canvas_projects` 继续作为物理表，但 API 和前端类型统一命名为 Canvas：

```text
Canvas
├─ id
├─ ownerUserId
├─ title
├─ status: draft | active | archived | deleted
├─ serverRevision
├─ settings
├─ latestDocumentId
└─ timestamps
```

禁止在新的运行时代码中加入 `project_id`、漫画项目 ID 或历史归属字段。旧表中的迁移字段只作为审计数据，不参与权限、接口或产品概念。

### 4.2 Canvas 文档

```json
{
  "version": 1,
  "canvasId": "uuid",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "nodes": [],
  "edges": [],
  "groups": [],
  "createdAt": "iso-date",
  "updatedAt": "iso-date"
}
```

节点的最小结构：

```json
{
  "id": "node-1",
  "type": "ai-image",
  "position": { "x": 120, "y": 80 },
  "size": { "width": 280, "height": 240 },
  "data": {
    "label": "角色设定",
    "status": "idle",
    "prompt": "...",
    "assetId": null,
    "assetVersionId": null
  },
  "ports": {
    "inputs": [],
    "outputs": []
  }
}
```

### 4.3 节点类型

第一版必须支持：

```text
ai-text       ai-image       ai-video       ai-audio
ai-animation  ai-panorama    ai-markdown    ai-storyboard
ai-director   source-text    source-image   source-video
source-audio  comment        group
```

`source-*` 是上传或粘贴内容，不直接消耗模型额度；`ai-*` 是生成或变换节点；`comment` 和 `group` 不进入生成 DAG。

### 4.4 端口与边

前端 AntV X6 格式只能在适配层使用。持久化格式统一为：

```json
{
  "id": "edge-1",
  "kind": "execution",
  "sourceNodeId": "node-1",
  "sourcePortId": "out-image",
  "targetNodeId": "node-2",
  "targetPortId": "in-reference",
  "data": {}
}
```

边分为：

| 边类型 | 作用 | 校验 |
| --- | --- | --- |
| `execution` | 将上游结果作为下游生成输入 | 必须端口匹配，必须 DAG |
| `reference` | 传递参考图、风格、角色或语义引用 | 端口匹配，可形成环 |
| `layout` | 仅表达视觉关系 | 不参与生成执行 |
| `control` | 任务条件或人工确认关系 | 由 Runtime 单独解释 |

后端只对 `execution` 边做循环检测。保存时验证节点类型、端口方向、媒体类型、目标节点存在性、最大节点数和最大边数。

## 5. 权限与实时一致性

### 5.1 访问矩阵

子用户被分配 Canvas 后必须能进入并使用该 Canvas。`team_member_canvases` 继续只保存分配关系，不增加所有权或角色字段；动作权限由 capability registry 统一表达为 `canvas:view`、`canvas:edit`、`canvas:run` 和 `canvas:manage`。

首期 capability 派生规则固定为：

- 主用户对自己拥有的 Canvas 自动获得 `canvas:view`、`canvas:edit`、`canvas:run` 和 `canvas:manage`。
- 状态正常且存在 `team_member_canvases` 分配记录的子用户自动获得该 Canvas 的 `canvas:view`、`canvas:edit` 和 `canvas:run`，不获得 `canvas:manage`。
- 子用户被取消分配、禁用或会话撤销后，下一次 API/SSE/Worker 校验立即失效；已有未提交前端草稿不能继续保存。
- 后续若增加团队级 capability 限制，只允许进一步收窄上述权限，不能绕过 Canvas 分配关系扩大访问。

| 操作 | 主用户 | 被分配子用户 |
| --- | --- | --- |
| 列出画布 | 自己拥有 | 已分配，派生 `canvas:view` |
| 查看文档/历史/资产 | 允许 | 已分配，派生 `canvas:view` |
| 修改文档/分组/设置 | 允许 | 已分配，派生 `canvas:edit` |
| 运行生成/消耗额度 | 主用户额度 | 已分配，派生 `canvas:run`，使用现有子账户额度 |
| 分配画布 | 允许 | 禁止 |
| 删除/恢复画布 | 允许 | 禁止 |
| 查看 Agent 记忆和会话 | 允许 | 已分配，派生 `canvas:view` |

最终判定必须在每个 API、任务 Worker 和 Agent Tool 内再次执行，不能依赖前端隐藏入口。

### 5.2 访问授权实现状态

截至 2026-07-25 的代码核对结果：

| 当前组件 | 已有能力 | 缺口 |
| --- | --- | --- |
| `team.service.ts` / `team_member_canvases` | 主用户可以给子用户分配 Canvas | 分配关系已由 `CanvasActorScope` 统一用于正文、任务、Artifact 和 SSE；撤销后的排队操作会重新鉴权 |
| `findCanvasProjectRecord()` | Canvas 列表和元数据支持 `teamMemberId` | 新 Canvas 路由通过主用户/子用户 principal 查询，客户端提交的 owner/member 字段不参与授权 |
| `resolveUserActorContext()` | 能识别主用户和 `teamMember.id` | Canvas 独立使用 `authorizeCanvasActor` 和 `canvas:view/edit/run/manage` 能力，不要求漫画项目上下文 |
| `creator-canvas-record.service.ts` | 文档、revision、run、artifact 已持久化 | 读写、历史、生成、存储签名 URL 和 Worker 回写均校验 Canvas 分配关系 |
| `/api/canvas/*` 和旧 `/api/creator/canvas-projects/*` | 已有 head/live/run/history 接口 | 新 Canvas API 已统一 capability；旧兼容路径仅保留兼容读取，不作为新前端事实来源 |

新增唯一授权入口：

```ts
type CanvasAction = "view" | "edit" | "run" | "manage";

interface CanvasActorScope {
  canvasId: string;
  ownerUserId: string;
  principal: "owner" | "team_member";
  actorTeamMemberId: string | null;
  principalKey: string;
  capabilities: Array<"canvas:view" | "canvas:edit" | "canvas:run" | "canvas:manage">;
}

authorizeCanvasActor(db, {
  sessionToken,
  canvasId,
  action,
  now,
}): Promise<CanvasActorScope>
```

授权查询必须同时确认 Canvas `created_by_user_id = ownerUserId`，并在子用户场景验证同一个 `ownerUserId + actorTeamMemberId + canvasId` 的分配记录。未分配、已删除或越权统一对外返回 404，已分配但动作 capability 被收窄时返回 403。

所有 Canvas 服务从接收 `{ canvasProjectId, userId }` 改为接收 `CanvasActorScope`；`ownerUserId` 继续作为业务归属和账本主体，`actorTeamMemberId` 作为实际操作者写入审计。必须覆盖：

- `findCanvasByCanvasProjectId`
- `saveCanvasByCanvasProjectId`
- `listCanvasRevisions`
- `getCanvasRevision`
- `listCanvasNodeRuns`
- `selectCanvasNodeArtifact`
- Canvas generation result handoff

同时给 `creator_canvas_events`、`creator_canvas_revisions`、`creator_canvas_node_runs` 和通用 `audit_events` 增加可空的 `actor_team_member_id`（或等价规范化审计字段）。不能把子用户操作伪装成主用户本人，也不能把子用户提升为 Canvas owner。

`creator_canvas_sessions` 也必须增加 `team_member_id` 或等价 principal 字段，唯一键使用 `(canvas_project_id, owner_user_id, principal_key)`；否则主用户与多个子用户共享 `user_id` 时会互相覆盖 viewport、选择和 UI 状态。Canvas 保存、运行和 Agent 的 idempotency scope 使用 `principalKey = owner:<userId>` 或 `member:<teamMemberId>`，不能只用主用户 ID。

Canvas storage object、Asset、上传会话和签名 URL 读取必须接收同一个 `CanvasActorScope`。仅验证 `storage_objects.created_by_user_id = ownerUserId` 不足以授权子用户，否则知道对象 ID 的已分配子用户可能读取主用户其它未分配 Canvas 的文件。

SSE 建连时执行 `canvas:view`；每次收到分配变更或账号禁用事件时主动断开对应订阅。Worker 在提交 Provider 前和 Artifact 回写前分别重新验证 `canvas:run` 与 Canvas 归属，防止任务排队期间权限被撤销后继续产生新副作用。

### 5.3 Revision 和实时事件

```text
Client loads revision N
        │
        ├─ autosave(document, clientRevision=N)
        │       ├─ success → revision N+1 + SSE event
        │       └─ conflict → return server document/revision
        │
        └─ live SSE only invalidates/refetches; does not mutate Store directly
```

保存冲突不自动合并媒体字段。客户端应显示冲突并允许“重新加载服务器版本”或“保留本地草稿后重新提交”。

### 5.4 三类历史必须分离

| 历史类型 | 用途 | 持久化与恢复语义 |
| --- | --- | --- |
| 本地撤销/重做 | 节点、边、分组、位置等当前编辑会话操作 | 前端有界栈；加载服务器文档时重新建立基线，不当作审计 revision |
| 服务器 revision | 自动保存、多人冲突、审计和版本恢复 | PostgreSQL 持久化；“恢复旧版”必须创建一个新 revision，不能重写历史 head |
| 输出历史 / Agent checkpoint | 查看、选择生成产物，以及回退 Agent 造成的画布结构修改 | 独立于节点存在；节点删除后记录仍保留，checkpoint 记录 revision 和操作范围 |

撤销/回退只恢复画布结构和稳定资产引用，不撤销已经发生的 Provider 调用、计费流水或已生成对象。Agent 回退采用新的补偿 revision；是否把未引用产物放入回收站由资产引用计数决定。

输出历史支持按节点类型和关键词搜索、稳定 cursor 分页、单条/按节点/全部软删除以及显式 JSON 导出。最近打开的 Canvas 标签仅作为当前浏览器会话的快捷切换状态（建议最多 5 个），不能成为 Canvas 列表或权限事实来源；切换前先提交草稿，失败时停留在原 Canvas 并显示错误。

## 6. Canvas Generation Runtime

### 6.1 统一执行入口

建议新增：

```text
POST /api/canvas/:canvasId/generation-batches
GET  /api/canvas/:canvasId/generation-batches/:batchId
POST /api/canvas/:canvasId/generation-batches/:batchId/cancel
POST /api/canvas/:canvasId/generation-batches/:batchId/reconcile
GET  /api/canvas/:canvasId/nodes/:nodeId/runs
POST /api/canvas/:canvasId/artifacts/:artifactId/select
```

保留现有单节点接口作为兼容入口，但内部全部转入同一个 Runtime。图片生成使用现有 `/api/generation/image-tasks` 的 Canvas target；视频和音频使用现有统一 generation task；导演台使用现有 director service。

### 6.2 执行流程

```text
选中节点
  → 读取最新 Canvas revision
  → 过滤无效/无模型/无提示词节点
  → 将 execution edges 构建为 DAG
  → Kahn 拓扑排序
  → 独立节点并发，依赖节点顺序执行
  → 每个节点创建 run + credit reservation
  → 投递现有 generation task
  → poll/webhook/worker 回写 run + artifact
  → 通过 SSE 通知前端
  → 前端只更新目标节点和输出历史
```

### 6.3 状态与失败

```text
created → queued → running → succeeded
                    ├──────→ failed
                    ├──────→ canceled
                    └──────→ paused/recoverable
```

- 单个节点失败不自动丢弃同批次其它成功结果，批次最终状态支持 `succeeded`、`partial`、`failed`、`canceled`。
- 已向外部 Provider 提交的任务不得盲目重试；复用现有 provider request identity 和恢复策略。
- 任务 Worker 不写整份 Canvas 文档，只写 run/artifact，并通过带 revision 的节点 patch 更新状态。
- 每次运行必须记录模型快照、输入快照、Provider request、额度 reservation、taskId 和 artifact。

### 6.4 批量计费、结算与取消

- 一次 DAG/批量运行创建一个 reservation envelope，并为每个可计费节点建立 allocation；前端报价、审批和最终账单都能按批次和节点追溯。
- 只有通过权限、参数和 DAG 校验的节点进入预留。Provider 提交必须使用现有幂等键，重连、Worker 重启和重复 webhook 不得重复扣费。
- 批次部分成功时逐节点结算实际消耗，失败或未提交的 allocation 释放；不得因批次状态为 `partial` 而整批扣除或整批退款。
- “取消 Provider 任务”和“停止本地跟踪”是两个不同状态。仅当 Provider 明确确认取消时才能按现有规则释放对应预留；无法取消时继续后台对账，UI 明示任务仍可能产生结果和费用。
- 选择某个批量图片结果只改变 selected artifact，不删除同组其它结果；每个结果保留 `batchGroupId`、`batchIndex`、参数和费用归属。

## 7. Prompt、模型与设置

### 7.1 画布级设置

`creator_canvas_projects.settings_json`（或等价 Canvas settings 表）至少包含：

```json
{
  "visualStyle": {
    "styleId": "realistic",
    "prompt": "...",
    "locked": false,
    "styleReferenceAssetId": null,
    "styleReferenceEnabled": true
  },
  "promptSuffixes": {
    "text": "",
    "image": "",
    "video": "",
    "audio": ""
  },
  "defaultModels": {
    "text": "model-ref",
    "image": "model-ref",
    "video": "model-ref",
    "audio": "model-ref"
  },
  "generation": {
    "imageAspectRatio": "1:1",
    "imageSize": "1K",
    "imageFollowNode": false,
    "videoResolution": "720p",
    "videoDuration": 5,
    "videoFollowNode": false
  }
}
```

所有默认值只在节点没有显式设置时继承；节点保存后不因画布设置改变而静默重写历史输入。

图片节点应用画布默认比例或用户切换比例时，使用同一尺寸计算函数同步更新节点宽高（自适应比例使用稳定方形默认框，其它比例在固定最大边内等比换算）；保存文档时保留计算后的 `size`，避免重新进入画布发生跳动。

当前实现状态：Canvas settings 表、独立 revision/actor 审计、设置抽屉和 generation 默认值继承已完成；历史节点不会被静默重写，真实设置 HTTP/前端回归已通过。

### 7.2 模型配置边界

- API Key 只存现有 Provider 配置，不进入 Canvas 文档、消息或日志。
- Provider、模型、能力和额度由后端目录返回，前端只展示可用项。
- 自定义协议必须是声明式、可校验、可测试的协议；禁止任意 URL、任意脚本和任意网络请求。
- 图片参考图支持 JSON URL 和 multipart 两种协议，由模型能力声明决定。
- Agent 只能使用用户显式授权或系统允许的模型，不允许根据提示词自行切换付费模型。

### 7.3 用户配置库与不可变快照

预设、Skill、画风和节点工具栏布局不是 Canvas 文档中的临时字段，应建立用户级配置库，并允许画布引用：

```text
canvas_presets + canvas_preset_versions
canvas_skills + canvas_skill_versions
canvas_styles
canvas_toolbar_layouts
```

- 主用户拥有配置；子用户能否查看、编辑或执行分别由现有 capability 控制，不能因能编辑某个画布就自动获得 Provider/Skill/工作流管理权限。
- Canvas 文档只保存稳定配置 ID 和版本 ID。运行创建时展开为不可变快照，至少包含提示词模板、序列步骤、模型、尺寸、比例、后处理、Skill manifest 和工具 allowlist。
- 修改或删除预设、Skill、画风、工具栏或工作流不能改变历史 run；删除采用软删除，仍被历史或文档引用的版本必须可解析。
- 高级预设序列在开始运行时冻结全部步骤；运行期间编辑原预设不影响已排队步骤。

### 7.4 Prompt 引用与解析

- `@node`、`@asset`、`@model`、`@voice`、`@drama` 和 `@skill` 在编辑器中保存为包含稳定 ID/版本的结构化 token；展示文本可以变化，执行时不得仅靠名称或正则猜测引用对象。
- `@node` 只能读取调用者有权访问的当前 Canvas 节点；`@asset` 和 `@drama` 只能解析当前主用户域内且 actor 可见的资产。引用失效时阻止运行并指明失效 token。
- 斜杠命令、预设、Skill、画风和提示词后缀按固定顺序展开，最终请求必须保存“用户原文 + 结构化引用 + 展开后文本 + 各配置版本”。
- Prompt 引用不等同于 execution edge。只有端口连接决定 DAG 依赖；纯文本引用若需要上游最新输出，运行规划器必须显式转换为只读输入依赖并做循环校验。
- Skill 只能提供提示模板和缩小后的工具 allowlist，不能注入 Provider key、任意网络地址、Policy 变更或隐藏计费模型。

当前实现状态：九类引用的服务端解析、版本快照、模型/语音绑定、slash command/preset 服务端 catalog、`readDependencies` 快照和 Canvas settings 后缀均已进入真实 generation entry。批次创建前会用服务端解析结果把选中生成节点的 `@node` 依赖并入 DAG，并保留未选中节点的不可变快照；跨批次稳定资产版本和同批次前驱 Artifact 注入已经完成。Prompt Picker 已接入 Canvas 角色库、单参考图、合并全部和短剧资产一键建节点，文档只持久化稳定角色/参考图 ID。

## 8. Canvas Agent

### 8.1 运行位置

Agent UI 在 Canvas 内嵌；模型调用、权限判断、工具执行和任务状态必须由后端完成。前端不能成为安全边界。

### 8.2 数据表

新增 Canvas 域表或在现有通用表中增加 `canvas_id`：

```text
canvas_conversations
canvas_messages
canvas_agent_tasks
canvas_agent_steps
canvas_agent_checkpoints
canvas_agent_events
canvas_agent_approvals
canvas_memories
canvas_agent_file_grants
canvas_message_sources
```

所有记录都必须包含 `ownerUserId`、`canvasId` 和创建/操作 actor；`conversationId`、`taskId`、`messageId` 按记录类型必填，不能给 Conversation 或普通消息伪造 task。删除会话或画布时停止未完成任务并清理临时 grant。

### 8.3 工具和策略

首批工具：

```text
canvas_read                 canvas_write
canvas_batch_write          canvas_run_generation
canvas_read_history         canvas_select_artifact
asset_search                asset_attach
expert_canvas_structure     expert_workflow_risk
expert_asset_reuse          preset_list/preset_inspect/preset_apply
memory_suggest              web_search/web_extract
provider_docs_read          provider_config_draft/apply
```

Agent 模式必须完整保留：`collaborative`（B）、`autonomous`（C）和 `plan`。`plan` 只生成可审阅计划、引用和风险说明，绝不执行写工具或付费生成；切换到 B/C 后仍需重新经过 revision 校验和 Policy。

策略矩阵：

| Effect | B 协作模式 | C 自主模式 | 自动重试 |
| --- | --- | --- | --- |
| `read` | 自动 | 自动 | 瞬时错误最多 3 次 |
| `canvas_write` | 确认 | 自动 | 禁止 |
| `media_generation` | 每次确认 | 每次确认 | 禁止 |
| `file_write` | 确认 | 确认 | 禁止 |
| `memory_write` | 确认 | 确认 | 禁止 |
| `config_write` | 确认 | 确认 | 禁止 |
| `permanent_delete` | 确认 | 确认 | 禁止 |

计划、审批、暂停、继续、停止、插话、重规划、检查点和回退都必须是服务端任务状态转换，而不是只改前端 Store。

补充运行契约：

- Expert 只执行受限只读分析，嵌套深度固定为 1；其工具 allowlist 只能缩小主 Agent 权限，不能扩大权限。
- 会话支持自动/手动命名、置顶、取消置顶、归档、恢复和软删除；切换、归档或删除会话时停止或转移其排队任务，并清理临时授权。
- 浏览器文件必须先上传为受控临时资产 grant，grant 绑定 `actor + canvasId + conversationId`、用途和有效期；Agent 不接收本地绝对路径或完整目录权限。
- 联网搜索和网页提取必须保存结构化 source citation（标题、规范 URL、访问时间、引用片段/hash），并在回答中可定位；网页内容始终视为不可信输入。
- 媒体工具支持 `chat`、`canvas`、`both` 三种投递方式；`canvas`/`both` 在创建节点前执行 revision 和 `canvas:edit` 校验，媒体生成本身始终执行 `canvas:run`、模型和计费审批。
- Scheduler 对同一会话串行调度写操作，只读工具可按预算并发；用户插话进入当前 task 的有界 buffer，在安全边界应用并触发重规划，不能直接修改正在执行的工具参数。
- Agent journal 以单调 sequence 保存模型轮次、Policy 决策、审批、工具开始/结束、checkpoint 和 rewind；同时记录 input/output token、模型/工具耗时、拒绝、重试、审批和插话计数，供诊断与计费对账。
- 恢复任务时不重放已成功的有副作用工具；通过 call fingerprint、checkpoint 和 Provider identity 判断继续、等待人工确认或终止。

当前实现状态：B/C/Plan、审批、后台恢复、指标、历史/资产/预设/Expert 工具、会话生命周期和数据库租约锁已接入。受控 `web_extract/web_search`、SSE backlog/实时长连接/心跳/权限复核、远程 JSON-RPC MCP、Canvas 局部配置草稿和媒体提示词偏好均已完成受控初版及目标 Worker E2E。生产搜索 Provider 已通过后台 `webSearchModelCode` 选择模型配置，复用 `admin_secret_values`，支持 Tavily、Bing 和 generic JSON，并具备 HTTPS、SSRF、域名白名单、重定向和敏感参数门禁。后台运维页已提供任务、模型、token、耗时、Policy、审批和失败指标；Canary 聚合新增保存冲突、SSE 重连、批次恢复、重复 Provider request、未结算 reservation、前端错误和 Agent Policy deny。后台真实文本 Provider owner happy path 已通过；已分配成员真实 Provider、搜索 Provider 真实外部凭据和 Provider 提交后进程重启 E2E 仍未完成。

### 8.4 现有后台能力复用与缺口

| 能力 | 当前可直接复用 | 必须补充 |
| --- | --- | --- |
| 模型管理 | `ai_model_configs`、修订、启停、模板、probe、dispatch policy | 增加 `text.canvas_agent` 用途和 Agent 能力声明 |
| 密钥 | `admin_secret_values` 与模型 `providerConfig` 引用解析 | Agent Worker 只能按引用读取，API/日志/快照不返回 secret value |
| 文本调用 | `TextModelGatewayService`、流式 OpenAI-compatible adapter、provider request 和用户请求日志 | 从固定 text catalog/env 改为后台模型 resolver，并补 `canvasProjectId` scope |
| 媒体生成 | `createGenerationTask()`、模型校验、任务队列、子账户积分、Artifact | 抽取为可被 HTTP 和 Agent Tool 共用的 generation intake service |
| 长任务 | PostgreSQL workflow/task/attempt、BullMQ、lease、outbox、repair | 增加 Canvas Agent task/step 状态和 wakeup 事件 |
| 存储与审计 | upload session、storage object、signed URL、audit event | 增加 conversation file grant、Agent event 和实际子用户 actor 字段 |

Canvas Agent 已通过 `AdminBackedTextModelResolver` 使用 `ai_model_configs` 和后台 secret store 作为唯一权威来源；环境变量只保留兼容/启动用途，不能绕过后台模型的启停和版本控制。现有剧本/分镜调用仍可继续使用 legacy catalog resolver，不能借 Canvas Agent 改造一次性重写其它文本业务。

为避免影响现有剧本/分镜调用，Text Gateway 改为注入 `TextModelResolver` 接口：旧调用可暂时使用 legacy catalog resolver，Canvas Agent 必须使用 `AdminBackedTextModelResolver`。完成迁移后再删除 legacy resolver，不在一次改动中重写所有文本业务。

### 8.5 Canvas Agent 后端架构

```text
POST conversation message
  → authorizeCanvasActor(canvas:view)
  → CanvasAgentTask + workflow/task/attempt
  → canvas.agent.task.wakeup outbox
  → BullMQ canvas-agent worker
  → AdminBackedTextModelResolver
  → TextModelGateway(provider_request + usage)
  → plan / tool calls
  → Policy + approval
  → Canvas tools / generation intake / asset tools
  → checkpoint + events + final message
  → SSE resume by event sequence
```

新增 `apps/backend/src/modules/canvas-agent`，至少拆分为：

```text
canvas-agent-task.service.ts       # 创建、状态机、预算、暂停/恢复/停止
canvas-agent-context.service.ts    # Canvas/消息/记忆上下文与压缩
canvas-agent-policy.service.ts     # effect 判定，不接受模型修改
canvas-agent-tool.registry.ts      # schema、allowlist、effect、幂等策略
canvas-agent-executor.ts           # 模型轮次、工具循环、插话与重规划
canvas-agent-checkpoint.service.ts # revision checkpoint 与补偿回退
canvas-agent-billing.service.ts    # 文本轮次 reservation/settlement
canvas-agent-outbox.service.ts     # SQL → BullMQ wakeup
canvas-agent-repair.service.ts     # lease、重启和歧义恢复
```

持久化最小字段：

```text
canvas_agent_tasks
  id, canvas_id, conversation_id, workflow_id, owner_user_id,
  actor_team_member_id, mode, status, model_code,
  model_config_snapshot_json, budget_json, metrics_json,
  current_step_id, base_revision, created_at, updated_at

canvas_agent_steps
  id, task_id, step_no, kind, status, tool_id, call_id,
  input_fingerprint, effect, approval_id, provider_request_id,
  generation_task_id, checkpoint_json, output_summary, error_code

canvas_agent_events
  id, task_id, sequence, event_type, event_json, created_at
```

`(task_id, sequence)`、`(task_id, call_id)` 和有副作用工具的 `input_fingerprint` 必须唯一。模型输出、工具参数和网页内容都是不可信数据，只有 Tool Registry 中已注册且通过服务端 JSON Schema、CanvasActorScope 和 Policy 的调用可以执行。

Canvas 写工具只调用 actor-scoped Canvas patch/save service；媒体工具只调用共享 generation intake，绝不直接实例化 Provider Adapter；资产工具只处理稳定 asset/storage ID。这样 Agent 自动模式也不能绕过现有鉴权、模型状态、额度、幂等和恢复链路。

### 8.6 后台模型与密钥接入

后台模型增加以下 Agent 约定：

```json
{
  "mediaType": "text",
  "taskModes": ["text.canvas_agent"],
  "capabilities": {
    "stream": true,
    "toolCalling": true,
    "jsonSchema": true,
    "contextWindow": 128000
  },
  "uiConfig": {
    "agentEligible": true
  }
}
```

- 新增 `AdminBackedTextModelResolver`：只返回状态为 active、包含 `text.canvas_agent`、能力满足当前模式且用户可用的模型。
- Agent task 创建时保存模型配置 revision 和 credential version ref；快照只包含脱敏配置，不包含 API Key。实际 secret 只在 Worker 提交请求前按引用解析。
- 将 `TextModelGatewayRequestContext` 扩展为 `canvasProjectId`、`agentTaskId`、`agentStepId`，并透传到 `provider_requests`、`user_model_request_logs`、账单 metadata 和审计事件。
- 现有后台模型 probe 增加 Agent 兼容性检查：最小流式请求、usage、工具调用/结构化输出能力和超时；探测提示词使用固定系统文本，不包含用户 Canvas 数据。
- 在现有后台系统设置增加 `canvasAgent.defaultModelCode`、`expertModelCode`、最大模型轮次、最大工具次数、允许的 Web Search Provider 和 MCP server allowlist。配置变更写后台审计并只影响新任务。
- 浏览器只能获取模型 ID、名称、能力、价格和可用状态；后台 secret reference 名称与 secret value 都不进入前端 Agent 配置。

如果现有文本模型不支持原生 tool calling，首期可以使用受 JSON Schema 约束的单一结构化响应协议；不能用正则从自然语言中猜测并执行工具。没有任何合格后台模型时，Agent 面板显示“管理员尚未配置可用 Agent 模型”，Canvas 其它功能继续可用。

### 8.7 任务、计费与恢复

- 一个用户请求创建一个 `canvas_agent_task`，并关联通用 `workflow/task/attempt` 以复用 SQL source of truth、BullMQ dispatch、lease 和 repair；Agent 的 `waiting_approval/paused` 等细状态保存在 Agent task，等待期间不占用 Worker。
- 每个模型轮次调用前按后台 `pricing_json` 建立独立 reservation allocation，收到 usage 后结算；Provider 不返回 usage 时使用后台配置的保守规则结算。媒体 Tool 由其生成任务单独计费，Agent 不能重复收费。
- 子用户执行 Agent 时，文本轮次和媒体工具都沿用现有子账户积分主体；账单同时记录 `ownerUserId + actorTeamMemberId + canvasId + agentTaskId + stepId`。
- 每个模型轮次先写 step/call fingerprint，再创建 provider request。进程在外部提交后崩溃时，有 external request identity 才能恢复；无法判断结果时进入 `manual_review_required`，禁止盲目重放。
- Canvas/配置写工具在调用前创建 checkpoint，成功后记录 revisionAfter；回退生成新的补偿 revision。Provider 调用、已结算费用和已生成 Asset 不回滚。
- Agent 媒体步骤保存 generation task ID，通过现有任务状态/SSE 等待结果；Agent Worker 不自行轮询媒体 Provider。
- 审批、暂停、继续、停止、插话和重规划都追加单调 Agent event，并通过 outbox 触发下一次 wakeup。当前 HTTP 接口已支持 SSE backlog、25 秒实时长连接、10 秒心跳、逐轮权限复核和 `Last-Event-ID`/sequence 补读，同时保留 JSON polling 降级。

Agent 分两步上线：第一步交付多会话、Plan/B、Canvas 读写审批、媒体生成审批、持久化事件和恢复；第二步再启用 C 模式、Expert、记忆、联网研究和受控 MCP。第二步不得另起模型或密钥体系。

## 9. 资产与媒体生命周期

```text
上传/生成
  → upload-session / generation artifact
  → storage object
  → asset + asset version
  → canvas artifact reference
  → thumbnail/signed URL
  → 可选标签和搜索索引
  → 软删除/回收站
  → 过期清理（仅无引用对象）
```

- Canvas 文档保存稳定 ID，不保存带过期时间的 URL。
- 同一资产可以被同一用户的多个画布引用，但删除画布不能直接删除仍被其它画布引用的对象。
- 生成提示词标签最多保存有限数量，标签失败不能使生成失败。
- 下载、复制、上传和导出支持进度、取消和恢复。
- 浏览器模式不登记本地绝对路径；所有外部文件先上传后建立资产引用。

### 9.1 资产库行为

- 上传阶段计算内容 fingerprint，在同一主用户资产域内去重；相同对象可创建新的逻辑引用，但不能因文件名不同重复上传大对象。
- 资产库支持按类型、来源画布、提示词标签、创建时间和回收站状态搜索/过滤，并支持拖入当前 Canvas 创建 `source-*` 节点或添加 reference edge。
- 缩略图是可重建派生物；缺失或损坏时可异步刷新。签名 URL 只用于响应和短期缓存，过期后按稳定 asset/version ID 刷新。
- 删除先进入可恢复回收站并记录 `deletedBy/deletedAt`；仅所有 Canvas、项目、run、artifact 和 Agent 引用都释放且保留期结束后，才允许物理清理对象。
- Canvas Library 卡片保存独立的小尺寸快照资产及其文档 revision。快照失败不能阻止保存，旧快照必须标明对应 revision，不能把 Data URL 写入 Canvas 元数据。

### 9.2 媒体编辑与派生一致性

- 裁剪、扩图、分镜切片、图片合成、抠图、自由视角和导演台截图都属于异步 derivation。开始时记录 `canvasRevision + sourceAssetVersionId + nodeId`，完成回写前再次校验；源节点变化时结果转为未挂接 Artifact，不得覆盖新内容。
- 图片批量生成保存 batch group 和每个独立结果，用户可选择主结果、切换历史结果或把任一结果拖成新节点；选择操作不删除其它 Artifact。
- 蒙版、栅格标注渲染结果和可编辑矢量标注层使用独立 asset/version 引用；禁止把 Base64/Data URL 写入 Canvas 文档。原图替换时明确提示保留、重投影或丢弃旧标注。
- Markdown 节点支持编辑/预览、自动保存、导入和导出；大文本遵守文档字段限额，超限内容改存文本资产引用。
- 音频转录继续使用现有模型任务；Canvas 已有 TTS/音乐/转录入口和任务参数，结构化 transcript 会沿现有结果快照流传递，并在成功历史回写时自动创建或更新 `source-text` 节点。无音频文件的纯文本转录已经完成且不会伪造 Provider、音频任务或计费；仅真实音乐/音频转录 Provider E2E 仍未完成。
- 全景生成固定记录请求比例和实际宽高，默认推荐 2:1 但以模型能力为准；全景截图作为新的图片 Artifact，不覆盖原全景资产。

## 10. 3D 导演台内嵌方案

当前项目已有 `mountDirectorDesk(container, options)` 的 Shadow DOM 模块。Canvas 不复用上游 Tauri 独立窗口方案，采用以下流程：

```text
打开 ai-director 节点
  → 校验 Canvas 权限和 directorDesk 资源权限
  → 在当前页面创建 fullscreen overlay
  → mountDirectorDesk({ instanceId, theme, onUploadPanorama, onNotify })
  → 导演台保存场景到 /api/director-desks/:id/scene
  → 截图/视频/全景上传到现有 storage
  → 生成 Canvas artifact
  → 关闭 overlay，保留节点引用
```

导演台自身的模型库、角色/道具、对象树、相机、动作、Motion Studio、全景导入、截图和参考视频能力全部保留；Canvas 只负责宿主生命周期、权限和资产回写。

## 11. Web 替代边界

| 上游 Tauri 能力 | Web 集成方案 | 结果 |
| --- | --- | --- |
| 本地 ONNX 超分/抠图/角色方向图 | 后端 Worker/GPU；无 GPU 时明确降级 | 保留功能语义 |
| Dreamina 本地登录态 | 后端 Provider 会话 | 不暴露 Cookie/API Key |
| 本地文件夹索引 | 浏览器文件选择 + 上传到资产库 | 不持久化绝对路径 |
| 指定应用打开文件 | 下载或系统分享 | 明确 Web 降级 |
| 全局快捷键 | 页面快捷键和按钮 | 仅当前页面生效 |
| Tauri updater | 现有 Web 发布与缓存版本策略 | 不显示桌面更新器 |
| 本地存储健康 | 对象存储配额、孤立对象、重复 fingerprint 和派生缩略图诊断 | 不扫描用户本地磁盘 |
| 本地 MCP stdio | 服务端 MCP 或管理员禁用 | 按会话和用户鉴权 |
| 独立 Chat/Asset 窗口 | Canvas 内嵌侧栏/抽屉/模态框 | 不创建独立窗口 |

## 12. API 设计

保留现有 `creator-api.js` 的请求封装和错误规范，新增/调整以下接口：

```text
GET    /api/creator/canvases
POST   /api/creator/canvases
GET    /api/creator/canvases/:canvasId
PATCH  /api/creator/canvases/:canvasId
DELETE /api/creator/canvases/:canvasId
POST   /api/creator/canvases/:canvasId/restore

GET    /api/canvas/:canvasId/head
GET    /api/canvas/:canvasId/live
POST   /api/canvas/:canvasId/telemetry/frontend-errors
GET    /api/canvas/:canvasId/revisions
GET    /api/canvas/:canvasId/revisions/:revisionId
POST   /api/canvas/:canvasId/revisions/:revisionId/restore
PUT    /api/canvas/:canvasId/document

POST   /api/canvas/:canvasId/nodes/:nodeId/run
GET    /api/canvas/:canvasId/nodes/:nodeId/runs
POST   /api/canvas/:canvasId/generation-batches
GET    /api/canvas/:canvasId/generation-batches/:batchId
POST   /api/canvas/:canvasId/generation-batches/:batchId/reconcile
POST   /api/canvas/:canvasId/generation-batches/:batchId/cancel
POST   /api/canvas/:canvasId/artifacts/:artifactId/select
GET    /api/canvas/:canvasId/generation-history
DELETE /api/canvas/:canvasId/generation-history/:entryId
DELETE /api/canvas/:canvasId/generation-history
GET    /api/canvas/:canvasId/generation-history?format=json

GET    /api/canvas/:canvasId/conversations
POST   /api/canvas/:canvasId/conversations
PATCH  /api/canvas/:canvasId/conversations (conversationId in body)
DELETE /api/canvas/:canvasId/conversations?conversationId=...
POST   /api/canvas/:canvasId/conversations/:conversationId/messages
POST   /api/canvas/:canvasId/conversations/:conversationId/file-grants
DELETE /api/canvas/:canvasId/conversations/:conversationId/file-grants/:grantId
GET    /api/canvas/:canvasId/agent-tasks/:taskId/events
POST   /api/canvas/:canvasId/agent-tasks/:taskId/approve
POST   /api/canvas/:canvasId/agent-tasks/:taskId/pause
POST   /api/canvas/:canvasId/agent-tasks/:taskId/resume
POST   /api/canvas/:canvasId/agent-tasks/:taskId/stop
POST   /api/canvas/:canvasId/agent-tasks/:taskId/replan
POST   /api/canvas/:canvasId/agent-tasks/:taskId/interject
POST   /api/canvas/:canvasId/agent-tasks/:taskId/rewind
GET    /api/canvas/:canvasId/agent-models

GET    /api/canvas/:canvasId/settings
PATCH  /api/canvas/:canvasId/settings
GET    /api/canvas/:canvasId/session
PUT    /api/canvas/:canvasId/session
POST   /api/canvas/:canvasId/uploads/fingerprint
GET    /api/canvas/:canvasId/storage-health
GET    /api/canvas/:canvasId/asset-references
POST   /api/canvas/:canvasId/derivations
POST   /api/canvas/:canvasId/derivations/:derivationId/attach-task
POST   /api/canvas/:canvasId/derivations/:derivationId/complete
POST   /api/canvas/:canvasId/derivations/:derivationId/fail
GET    /api/canvas/:canvasId/image-batch-groups
POST   /api/canvas/:canvasId/image-batch-groups
POST   /api/canvas/:canvasId/image-batch-groups/:groupId/select
POST   /api/canvas/:canvasId/annotation-layers
GET    /api/canvas/:canvasId/annotation-layers
POST   /api/canvas/:canvasId/card-snapshots
POST   /api/canvas/:canvasId/nodes/:nodeId/director-artifacts

GET    /api/admin/settings/canvas-agent
PATCH  /api/admin/settings/canvas-agent
POST   /api/admin/models/:modelId/probe
GET    /api/admin/ops/canvas-canary-metrics

GET/POST/PATCH/DELETE /api/canvas-library/presets/*
GET/POST/PATCH/DELETE /api/canvas-library/skills/*
GET/POST/PATCH/DELETE /api/canvas-library/styles/*
GET/PUT               /api/canvas-library/toolbar-layouts/:nodeType

GET    /api/canvas-assets
POST   /api/canvas/:canvasId/assets/attach
DELETE /api/canvas/:canvasId/assets/:assetId
POST   /api/canvas-assets/:assetId/restore
POST   /api/canvas-assets/:assetId/thumbnail/refresh
```

正式前端和文档统一使用 `/api/creator/canvases`；旧 `/api/creator/canvas-projects` 保留兼容别名。正式路径、兼容路径、DTO 和 OpenAPI 3.1 契约位于 `apps/backend/src/modules/project/canvas-api.contract.ts` 与 `docs/api/canvas.openapi.json`。

所有列表接口使用稳定 cursor 分页和服务端过滤；所有写接口接收幂等键或 `clientMutationId`，返回 actor scope、最新 revision（适用时）和统一错误码。上面已经落地的路径以实际 HTTP handler 为准；新增路径在实现前必须展开成 OpenAPI/DTO，不能直接用通配路由。

Canvas 相关接口统一由 `authorizeCanvasActor` 解析当前主用户/子用户；客户端不得提交 `ownerUserId`、`teamMemberId` 来获得权限。后台 Agent 配置接口沿用现有 `/api/admin/models`、`/api/admin/settings` 的管理员鉴权和审计，`probe-agent` 只能返回能力检查结果，不返回密钥。

## 13. 实施阶段

依赖顺序：

```text
CanvasActorScope + principal/audit
  ├─→ Canvas 文档、SSE、Asset、Run 全链路
  └─→ Canvas Agent Tools

共享 generation intake
  └─→ Agent media tools

AdminBackedTextModelResolver
  └─→ Canvas Agent Runtime
```

先完成授权和 principal 隔离，再接 Agent；否则新增 Worker 会复制现有 owner-only 缺口。Agent 先完成后台文本模型 resolver 和 B/Plan，再开放 C/Expert。

实施中保持不变：`team_member_canvases` 仍只表示分配、现有模型/密钥后台继续唯一权威、现有 generation workflow/task/provider/credit/storage 继续承载媒体任务、Canvas 不关联漫画项目。

### P0-A：协议和权限门禁

- 定义 Canvas 文档、节点、端口和边协议。
- 完成 AntV X6 ↔ 后端边适配。
- 定义 Prompt 结构化 token、确定性展开顺序和引用权限/循环校验。
- 增加 `canvas:view`、`canvas:edit`、`canvas:run`、`canvas:manage` capability、`CanvasActorScope` 和统一授权查询；修复主用户/子用户对正文、revision、run、artifact、storage 的权限链路。
- 为 Canvas revision/event/run/audit 增加实际子用户 actor 记录；分配变更可撤销 SSE 和排队任务的后续副作用。
- 增加请求体大小、节点数量、边数量和 JSON 深度限制。
- 增加 Canvas 文档契约测试和权限矩阵测试。

### 2026-07-25 实施状态

已完成并通过目标测试：

- “新画布”使用独立入口，先展示当前用户可访问的 Canvas 列表；只有用户点击“创建画布”后才进入编辑器。
- 新 Canvas 通过项目内 Shadow DOM 宿主挂载，不使用 iframe、独立窗口或 Tauri 页面；点击、输入、模型变更和上传事件均回传现有工作台状态流。
- 主用户与已分配子账号使用统一 `CanvasActorScope`；后台恢复时重新验证用户状态、Canvas 归属和子账号分配。
- Canvas generation batch 支持 DAG、取消、部分成功、超时 dispatch claim 恢复，以及 maintenance Worker 自动 reconcile/后继派发；仍复用现有任务、Provider、计费和修复链路。
- Prompt 引用已支持 `@asset/@style/@skill/@prompt` 解析、确定性展开、版本快照和前端诊断；配置库会把不可变版本写入 Canvas 文档。
- Prompt/DAG 已支持未选中 `@node` 跨批次引用同 Canvas 的稳定 `assetVersionId`，以及同批次后继在前驱 Artifact 可用后注入稳定版本再派发；跨 Canvas、Storage 不可用和 URL/Base64 引用均被拒绝。
- Canvas 生成历史可映射为画布资产并重新插入源节点，保留 artifact/storage/asset version 引用。
- 普通 Canvas `/live` 已接入前端 SSE、`Last-Event-ID`、断线补偿同步、逐次权限复核与撤权清理；revision 冲突 UI 会展示本地/服务端摘要并要求用户明确选择恢复版本。
- 连接释放快速创建、资产侧栏稳定 ID 拖入、toolbar 不可变版本布局、输出默认项、画布点击关闭临时设置和节点工具栏默认分区顺序已接入。
- Canvas 资产支持认证流式复制/下载、字节进度、取消、完整性校验和失败重试；临时 Blob URL 会释放，Canvas 文档不保存签名 URL/Base64。
- 音乐歌词生成/自定义编辑及稳定 task/artifact 回写已接入现有音频任务；无音频的纯文本转录会创建 text run、text Artifact 和 `source-text`，不伪造 Provider、音频任务或计费记录。
- `text.canvas_agent` 已接入管理员模型 compatibility probe，验证后台模型/Secret Reference、流式响应、usage 和实际 Agent `tool_call` JSON 协议，探测错误只返回稳定错误码。
- 批次计费已启用 reservation envelope：同一批次预留总额，节点使用幂等 allocation 按任务结算，部分成功/失败/取消释放未消费额度；子用户继续沿用现有子账户额度扣减模型。
- `text.canvas_agent` compatibility probe 已持久化诊断结果；最近一次探测失败的模型会自动隔离，管理员可显式复测恢复。`deepseek-noval` 的 `structuredJsonPrompt` 降级已通过正式 probe，并配置为默认/Expert 模型。

尚未达到发布验收的项目已经收敛到真实外部环境和长时间浏览器压力：音乐/音频转录、Canvas Agent member 与提交后重启、搜索 Provider 真实外部凭据、Director Desk 截图到 Canvas Artifact 的完整浏览器回写，以及前端大图与长会话内存。生产搜索 Provider、真实 X6 vendor/runtime 挂载与移动端节点适配、10 轮 X6 mount/unmount 压力、Director Desk/Three.js GPU 释放、组合安全攻击门禁、吉祥物 v0.6.7、产品配额、Prompt 多参考图、视觉编辑器初版、普通 Canvas SSE backlog、灰度名单、Canary 聚合、敏感文档值拦截、服务端 2,000/5,000 性能门禁、移动端 390px 列表/编辑器/软键盘/横竖屏核心 E2E、SBOM 和 Third-Party Notices 已完成。第 12 节列出的 Canvas runtime 路由已具备 DTO/OpenAPI 契约和回归测试。

### P0-B：画布壳和基础节点

- [已完成] 建立 `apps/web/src/features/new-canvas` 动态模块、`mountNewCanvas()/unmount()`、样式隔离和宿主依赖注入。
- [已完成] 新画布入口通过 `ai-canvas-runtime-adapter` 接入版本化 runtime boundary；上游 runtime 可注入替换，未注入时包裹现有 X6 production adapter，旧 `/canvas` 继续直连原链路。Adapter 保留完整 `creatorApi`，统一 `canvasProjectId`、COS `canvas-assets` 上传、Canvas 节点/文本/批量生成调用，并负责文档序列化、同步和生命周期转发。
- [已完成] 嵌入 Canvas route/mount，进入时只显示宿主内 loading skeleton，不移植独立开屏页。
- [已完成] Canvas 节点目录、分组、复制粘贴、本地撤销/重做、服务器 revision、自动保存、普通 Canvas `/live` 订阅/重连/撤权处理，以及按 owner/member principal 隔离的最近会话视口与选择恢复；切换画布或返回列表前会等待草稿保存，revision 冲突保留本地草稿和双方恢复快照，并由用户明确选择服务端版本或以最新 revision 保存本地版本。
- [已完成] 文本、图片、视频、音频、源文件、Markdown、评论节点。
- [已完成] v0.6.7 页面交互对齐：默认/经典交互模式、文件拖放与系统剪贴板、高频快捷键、六向对齐、多选批量运行、节点/空白右键菜单、分组内联名称/颜色/计数/运行及左右连接口、按节点类型工具栏、Sprite Sheet 动画节点和 Director 专用节点。文本存在选区时保留浏览器原生复制/剪切，媒体复制只读取稳定 Storage Object。

### P0-C：生成和资产

- [已完成] 建立 Canvas Generation Runtime。
- [已完成] 接入现有图片/视频/音频生成任务、计费、轮询、恢复和 artifact。
- [已完成] 实现批量 DAG、并发、取消、部分成功和输出历史。
- [已完成] `text/image/video/audio` 统一进入 Canvas batch DAG；同步文本 run 保存 text Artifact 和 `runId`，生成后的文本快照在派发后继媒体任务前注入 prompt，上游失败、稳定 Artifact 未到达和重启 reconcile 保持现有等待/跳过语义。
- [已完成] 接入上传、fingerprint 去重、资产搜索/点击插入/稳定 ID 拖入、缩略图刷新、签名 URL 刷新、回收站和删除保护；资产复制/下载具有流式进度、取消、完整性校验和失败重试。
- [部分完成] Canvas 资产侧栏已补齐与上游一致的“画布产物 / 项目文件 / 全局资产 / 短剧资产”来源切换、全局资产读取、关键词搜索、媒体类型筛选、点击与稳定 ID 拖入；“项目文件”独立读取可访问项目列表和所选项目的资产库，不改动当前工作台项目。全局来源可按现有后端约束上传角色/场景/道具图片或音色音频，上传后刷新同一来源列表；主用户可从全局资产卡片软删除或编辑标签，团队子账户不显示这些操作且服务端保留删除授权拒绝。全局资产标签由 `team_assets.tags_json` 持久化，显示为 chip，可按标签筛选和参与搜索；项目、短剧和画布产物卡片也可编辑标签，项目/短剧通过既有项目资产最新版本的 `metadata_json.tags` 写入，画布产物通过其稳定 `asset_versions.metadata_json.tags` 写入，均限制为最多 12 个、每个 32 字符，并保留版本其它元数据、Artifact、Storage 与归属。四类卡片均已提供同级内联标签编辑区，输入后 Enter 或失焦保存，现有标签点击 `×` 删除；保存按来源和资产串行并在重渲染后保持编辑焦点。具备稳定 Storage 关联的项目图片版本、团队全局图片和短剧图片均可复制为 Canvas 专属对象并设为风格母图，源对象不改变；短剧图片复用其已有的项目 `assetVersionId`。项目中的角色/场景/道具稳定图片版本还可复制为新的团队全局 Storage 对象和资产，源项目对象、版本与归属均不移动，子账户必须具有该项目的编辑能力；集成测试已通过真实 HTTP 子账户会话验证 `viewer` 被 `403 permission_denied/capability_missing` 拒绝，且不创建团队资产或无作用域 Storage 对象。桌面资产列表已使用与四类来源共用的瀑布流卡片布局，并提供 2-6 列控制；上游的每批 48 张、`rootMargin: 300px` 侧栏滚动增量加载和懒图策略已适配到全部四个来源，变更来源、搜索、媒体或标签筛选、项目切换时重置为首批。项目/短剧资产复用现有资产库数据。全局分类采用 `team_assets.folder_name` 的 COS 虚拟前缀；不创建独立空文件夹实体，也不接入外部本地文件夹。
- [已完成] “项目文件”来源可从当前所选项目导入图片或视频，直接复用现有上传会话和项目资产导入 API；项目导入与更新均要求 `projectEdit`，只读成员会在存储/上传校验之前收到 `403 permission_denied/capability_missing`。
- [已完成] 项目剧集的创建、改名和删除现统一要求 `projectEdit`；短剧抽屉后续复用这些路由时，`viewer` 不能创建或改名剧集，团队子账户仍不能删除剧集。
- [已完成] Canvas 短剧资产抽屉使用独立状态加载项目、剧集以及角色/场景/道具列表，不挂载完整剧集工作台，也不写入其 `selectedEpisodeId`、`importedAssets` 或生成会话状态；已覆盖新建、图片导入、简介保存、单项删除、固定图替换/解绑与按分类事务清空。固定图替换直接复用既有上传会话并为同一资产创建稳定新版本，不产生额外可见资产；解绑仅移除固定图关联，不删除原文件或历史版本。真实 HTTP viewer 会话已验证创建被 `403 permission_denied/capability_missing` 拒绝，且 viewer 不能解绑或批量删除剧集资产。
- [部分完成] reservation envelope、节点 allocation、部分成功结算和未提交节点释放已完成；真实 Provider 取消确认和长时间恢复 E2E 待补。

### P1-A：高级媒体编辑

- [部分完成] 图片裁剪、扩图、抠图、自由视角、Camera Studio、切片和合成已接入 derivation + 现有生成任务闭环；裁剪拖拽/键盘手柄、稳定第二图合成、栅格/蒙版/矢量标注、宫格结果选择、专业参数和已知积分/输入限制已完成。真实 Provider 和移动端高级编辑手势验收待补。
- [部分完成] 全景、动画、分镜、Markdown 节点和基础媒体生成已具备；TTS/音乐/转录入口和参数 UI 已存在，转录完成自动创建 `source-text`；歌词生成/自定义编辑/稳定结果同步和无音频纯文本转录已完成，真实音乐/音频转录 Provider E2E 待补。
- [已完成] 异步 derivation revision guard、图片 batch group、标注/蒙版资产化后端基础。
- [已完成] 提示词引用、画布卡片 revision 快照、slash/preset directive catalog、跨批次稳定资产版本、同批次前驱 Artifact、Canvas 角色库多参考图、`all` 合并和短剧资产一键建节点。
- [已完成] 节点音视频体验：稳定 `storageObjectId/assetVersionId` 恢复、真实音频波形和点击定位、按节点 ID 的播放/截帧/全屏工具、Blob 截帧上传、页面级视频全屏和原生全屏；X6 媒体控件已阻止节点误拖动，旧 fallback 不再遮挡富媒体节点。

### P1-B：Canvas Agent

- [部分完成] 会话生命周期、消息、B/C/Plan、Expert 只读模式、结构/风险/资产复用分析工具、工具注册表、Policy、审批、任务时间线、pin/rename/rewind、归档/恢复和跨 Worker 会话写锁已接入；受控 `web_extract`/`web_search`、远程 JSON-RPC MCP、Canvas 局部配置草稿、SSE backlog/实时长连接和 `Last-Event-ID` 补读已接入，模型工具调用与 MCP/配置已通过完整 Worker 审批执行 E2E；真实后台文本 Provider owner happy path 已通过，已分配成员和 Provider 提交后进程重启仍需真实 E2E。
- [已完成] 后台恢复、暂停/继续/停止、检查点、回退、插话、上下文压缩、记忆基础和基础 runtime metrics 累加。
- [已完成] 文件 grant、citation、媒体投递和 Provider 文档读取；受控 `web_extract`/`web_search` 按管理员 web policy 获取不可信内容并生成 citation；生产搜索 Provider 复用后台模型/Secret Reference 并具备 HTTPS、SSRF、域名白名单、重定向和敏感参数门禁；MCP bridge 与 `provider.config_draft/apply` 已通过 Worker 审批执行和模型工具调用 E2E。真实外部搜索凭据 smoke 作为发布环境门禁保留在第 16.1 节。
- [已完成] Agent journal、幂等恢复、按轮次计费和原子 token/耗时/Policy 指标；SSE backlog、实时长连接、心跳、权限复核和 `Last-Event-ID` 补读；管理端指标查询与展示。
- [已完成] 后台 `ai_model_configs + admin_secret_values`、`text.canvas_agent`、compatibility probe 和按轮次计费。
- [已完成] Canvas Agent workflow/task/attempt、wakeup、审批等待、repair 和共享 generation intake。
- [已完成] 画布记忆面板读取真实 `canvas_agent_memories`，支持来源/分类、编辑、启停和删除；“跳过此步”使用事务化 `skip` 控制，持久化 step、处理待审批记录并唤醒 Worker，运行中或等待外部副作用的步骤明确拒绝伪跳过。

### P1-C：3D 导演台

- [已完成] 在当前项目内创建 fullscreen overlay。
- [已完成] 导演台实例和场景挂载、截图/全景/视频到 Canvas Artifact 的回写及主用户/已分配子用户权限 HTTP/数据库回归；`ai-director` 节点会确定性复用当前 actor 可访问的导演台并持久化稳定 `directorDeskKey`，仅主用户在无可用导演台时创建，未分配子用户明确失败。
- [部分完成] Director Desk/Three.js 场景、当前视角截图、GPU 资源去重释放、`renderer.dispose()`、`forceContextLoss()` 和同 ShadowRoot 复挂载已完成；Director 节点支持多实例 Desk 隔离、打开、同步当前帧、直接导出参考视频、稳定 Artifact 回写及失败状态回滚。移动端掌镜已支持单指转向、双指 FOV、44px 操作和安全区，代码与构建测试通过；仍需截图/视频到 Canvas Artifact 的完整真实浏览器回写和移动浏览器最终验收。

### P2：产品体验和降级

- [部分完成] 主题、背景、宿主内 loading skeleton、Web 降级、导出、小地图、生成历史、存储健康、连接释放、资产拖入、toolbar/output defaults、视觉编辑器初版、统一产品配额和 v0.6.7 吉祥物已具备；`solar-system/nebula/frosted-glass` 使用全幅 Three.js 场景并具备视差、reduced-motion、页面隐藏暂停、390px 降载和完整 GPU 释放，自定义背景仍只持久化 Storage Object UUID。完整交互动效和移动端所有高级媒体抽屉流程仍待真实浏览器验收。
- [部分完成] 桌面可访问性、reduced-motion、移动端 `visualViewport`/软键盘焦点保持/横竖屏同步、44px 触控目标、项目列表/编辑器响应式布局、真实 X6 vendor/runtime 挂载、移动端节点适配、10 轮 mount/unmount 资源回落和服务端 2,000 节点/5,000 边校验性能门禁已覆盖；Director GPU 释放已完成。真实浏览器长 Agent 会话和大图内存压力门禁仍待补。

## 14. 验收标准

### 功能验收

- 一个主用户可以创建、切换、重命名、归档和删除多个独立画布。
- 子用户只能看到和操作主用户分配的画布，不能通过直接调用 API 越权。
- 子用户完成 Canvas 分配后可以打开、读取、修改和运行该 Canvas；取消分配或禁用账号后，正文、SSE、Worker 提交和 Artifact 回写均立即被拒绝。
- 15 类可视节点（14 类内容节点 + `group`）可以创建、保存、复制、分组、连接和恢复；`comment`、`group` 不进入生成 DAG。
- 选中节点批量运行时，依赖按 DAG 执行，独立节点并发，部分失败不影响已成功产物。
- 生成结果可以在节点、Artifact、输出历史和资产库之间互相定位。
- 输出历史支持搜索、分页、删除和 JSON 导出；最近打开标签可快速切换 Canvas，且不会绕过列表权限或丢失未保存草稿。
- 任何媒体生成都经过现有模型目录、Provider、计费和任务恢复链路。
- Agent 的每一次写操作、付费生成、文件写入和记忆写入都经过服务端策略和审批。
- Canvas Agent 只能使用后台启用且配置了 secret reference 的 Agent 模型；浏览器和模型上下文均拿不到 secret value。
- 3D 导演台在当前页面全屏打开，不产生新窗口，并能把截图和上传资产回写到 Canvas。
- Prompt 中各类 `@` 引用可稳定恢复、失效可诊断，历史 run 可还原用户原文、展开文本和配置版本。
- Agent 支持 B/C/Plan、Expert、文件 grant、citation、三种媒体投递和完整会话生命周期，刷新或进程重启后状态可恢复。

### 一致性验收

- 两个浏览器同时编辑时，revision 冲突可检测且不会静默覆盖。
- 任务完成和用户保存同时发生时，不会丢失节点、边或 viewport。
- 取消、重试、网络断开、Provider 已提交后进程重启均可恢复或明确显示最终状态。
- 删除 Canvas 不会删除仍被其它 Canvas 或项目资产引用的对象。
- 异步媒体编辑完成时若源 revision 或 asset version 已变化，结果不会覆盖用户的新版本。

### 安全验收

- 文档、日志、Agent 上下文和响应中不存在 API Key、签名 URL、绝对路径或完整文件正文。
- Agent 无法通过模型输出、网页、文件或 Skill 修改 Policy。
- 所有 Canvas 读写、生成、资产选择和 Agent 事件都记录 actor、canvasId 和审计信息。

## 15. 风险与回滚

| 风险 | 缓解 | 回滚 |
| --- | --- | --- |
| 节点协议一次性变化过大 | 先增加版本化 adapter，不直接覆盖旧解析器 | 关闭 Canvas 新入口，保留旧数据只读 |
| 任务结果覆盖用户保存 | 节点级 patch + revision 校验 + run 幂等键 | 暂停自动回写，只展示任务结果 |
| 子用户权限遗漏 | 路由、Service、Worker、Artifact 四层统一 actor scope 测试 | 临时关闭子用户 Canvas 编辑 |
| 大媒体导致请求过大 | 上传会话、对象存储和文档大小限制 | 禁止内联媒体，只允许 asset 引用 |
| Agent 工具副作用 | 服务端 Policy、审批和 effect 分类 | 关闭写工具，仅保留只读对话 |
| Agent 模型/密钥配置错误 | 后台 probe、模型快照、secret reference 和新任务隔离 | 禁用 Agent 模型，保留 Canvas 和媒体生成 |
| Web 无法提供桌面能力 | 每项能力有明确替代或降级状态 | 隐藏不支持入口，不伪造成功 |

## 16. 测试与发布门禁

测试矩阵不能只覆盖画布渲染：

| 层级 | 必测范围 |
| --- | --- |
| Unit | 文档/端口校验、DAG、CanvasActorScope、revision patch、配置快照、费用 allocation/settlement、Agent Policy、derivation guard |
| Contract | OpenAPI/DTO、错误码、SSE 序列、Provider adapter、Admin-backed text resolver、Artifact 回写 |
| Integration | PostgreSQL revision、Canvas 分配与撤销、BullMQ 恢复、对象存储引用、签名 URL 刷新、主/子用户权限、部分成功对账 |
| E2E | 多画布库、子用户完整访问、节点编辑与撤销、批量生成、刷新恢复、Agent 审批/插话/回退、资产回收、导演台内嵌 |
| Security | IDOR、越权直调、SSRF、恶意 workflow/Skill/网页提示注入、上传类型/大小、日志密钥扫描 |
| Recovery | 浏览器断网、SSE 重连、Worker/服务重启、重复 webhook、Provider 已提交但响应丢失、签名 URL 过期 |
| Performance | 达到协议上限的节点/边文档、长会话、资产分页、并发生成、Canvas mount/unmount 泄漏和导演台 GPU 资源释放 |

- 测试登录态只允许使用 `/api/auth/password/login`，测试密码为手机号后六位；除短信能力自身的专项测试外，禁止调用短信验证码链路。
- E2E 同时覆盖主用户和已分配/未分配子用户，并分别验证 `canvas:view`、`canvas:edit`、`canvas:run`、`canvas:manage`，不能只测试前端入口隐藏。
- 发布使用 `NEW_CANVAS_ENABLED`、`NEW_CANVAS_ROLLOUT_OWNER_USER_IDS` 和 `NEW_CANVAS_ROLLOUT_TEAM_MEMBER_IDS` 按主用户/子用户灰度；数据库和 API 先向后兼容上线，再启用导航入口。
- Canary 至少监控保存冲突率、run 恢复率、Provider 重复提交、计费 reservation 未结算、SSE 重连、Agent Policy deny 和前端错误率。
- 回滚只关闭“新画布”入口和新写操作，保留 revision、run、artifact、账单和审计只读查询；禁止通过删表或删除对象回滚。

### 16.1 当前未完成与发布阻塞（2026-09-04）

以下项目仍不能标记为发布完成：

1. **P1 Agent 真实外部与重启闭环**：MCP、配置草稿、生产搜索 Provider、完整 Worker 审批恢复、SSE、会话恢复、管理端指标、`structuredJsonPrompt` probe 和 owner 真实文本 Provider happy path 已完成。`run-canvas-agent-smoke.mjs` 已支持 queued submit/resume 两阶段证据，并新增恢复前状态、外部提交时间戳和可选真实搜索引用门禁；`scripts/run-canvas-agent-smoke.test.mjs` 已覆盖这些契约，但 `npm run smoke:canvas-agent` 仍需在正式 `.env` 分别以 owner/member 执行，并补搜索 Provider 真实外部凭据以及 Provider 已提交后进程重启的恢复证据。
3. **P1 真实媒体 Provider**：歌词生成/编辑/同步、无音频纯文本转录和 derivation/batch 刷新恢复逻辑已完成；真实音乐/音频文件转录 Provider E2E、真实图片高级编辑 Provider 以及 Provider 取消确认/长时间恢复仍待发布环境执行。
4. **P2 浏览器压力与最终回写**：桌面 Canvas、真实 X6 挂载/节点入框、10 轮 mount/unmount、Director 场景和截图、390px 项目列表/编辑器、44px 触控、软键盘焦点保持及横竖屏核心 E2E 已完成；本轮新增动态背景、Director 移动掌镜、稳定音视频节点和页面级全屏已有 DOM/Canvas/GPU 自动测试。仓库内 `new-canvas-pressure-gate.spec.mjs` 已通过 2,000 Agent 事件/1,000 消息/2MB Base64/2,000 媒体节点预门禁，新增 `director-artifact-handoff.test.ts` 覆盖截图/参考视频经 Storage 上传后写入 Canvas Artifact 的稳定 ID 和敏感值隔离，但仍需统一真实浏览器回归、真实浏览器长 Agent 会话和大图内存压力证据。
5. **发布依赖门禁**：普通 Canvas SSE `id`/backlog、主用户/子用户灰度、Canary 聚合、敏感文档值拦截、服务端 2,000/5,000 性能门禁、网页/Skill Prompt 注入与上传/日志组合攻击门禁、Director GPU、SBOM 和 Third-Party Notices 已完成；Tiptap 全套已升级到 `3.31.3`，`npm audit --registry=https://registry.npmjs.org --audit-level=high` 当前无漏洞，完整 JSON 审计结果已归档到 `docs/legal/npm-audit-2026-09-04.json`。
6. **P1 正式 runtime API 契约**：基础 Canvas creator API、generation-history、settings、Canvas artifact 标签/选择、节点运行、generation-batches、Agent conversations/tasks、derivations、annotation layers、Director artifact、SSE 和前端错误遥测均已纳入 `canvas-api.contract.ts` 与 `docs/api/canvas.openapi.json`，并由契约测试校验路径集合、命令 DTO 和 SSE 响应。节点运行以实际已实现的 `POST /api/canvas/:canvasId/nodes/:nodeId/run` 与 `GET /api/canvas/:canvasId/nodes/:nodeId/runs` 为准，不新增未实现的通用 `/runs` 兼容路由。
7. **P1 上游资产与设置页面 parity**：资产侧栏的来源切换、独立项目选择、全局读取、受控全局上传、搜索、媒体类型筛选、稳定拖入、主用户删除全局资产、四来源标签编辑、项目角色/场景/道具图片保存到全局及四来源共用的桌面瀑布流卡片与 2-6 列控制已完成初版；全局标签由 `team_assets.tags_json` 持久化，项目/短剧标签写入所属项目资产最新版本的 `metadata_json.tags`，画布产物标签写入其稳定版本的 `metadata_json.tags`。三类版本写入和全局标签均限制为最多 12 个、每个 32 字符，增量合并不改变既有元数据、Artifact、Storage 或所有权；项目资产写入要求 `projectEdit`，画布产物写入要求 Canvas `edit`。四类卡片均已提供内联输入区，支持 Enter/失焦新增和 `×` 删除，并复用同一串行保存与来源刷新策略。保存到全局会按授权项目版本读取字节并创建新的无项目作用域 Storage 对象，源项目对象不移动；真实 HTTP 子账户会话的回归测试确认 `viewer` 不具备项目编辑能力时会被 `403 permission_denied/capability_missing` 拒绝，且不会创建任何目标资产或 Storage 对象。上游每批 48 张、搜索延后、`rootMargin: 300px` 触发的侧栏增量加载与懒图策略已经适配；本实现对来源、搜索、媒体/标签筛选和项目切换均重置首批，仍保留现有后端资产读取契约。COS 资产使用 `team_assets.folder_name` 作为带对象 key 前缀的虚拟分类，API 仅返回仍有资产的文件夹名称；不创建独立资产文件夹实体、空目录或本地路径，外部文件夹管理明确排除。设置抽屉已有画风 ID、锁定、稳定 Canvas 产物资产引用选择、持久化的母图启用开关、选择后的缩略图/名称/暂停状态预览、图片/视频“跟随节点”默认输出控件，以及复用当前激活模型目录、按 Provider 分组并保留不可用已保存值的图片/视频模型选择。本地风格图已通过现有 Storage 上传会话物化为当前 Canvas 的 `assets`、`asset_versions` 与内部 artifact；项目来源的稳定图片版本、具备稳定 Storage 关联的团队全局图片和短剧图片均可在资产侧栏直接复制为 Canvas 专属对象再设为母图，源对象不改变。短剧图片复用其已有的项目 `assetVersionId`；新上传、替换或生成完成的团队全局资产已保存可审计的稳定 Storage 关联，历史 URL-only 资产保持空关联且不作猜测。启用时服务端按 Canvas actor scope 将 `assets.id` 解析为可用、未删除的 `asset_versions.id`，再合并进 image/video 的内部参考版本列表，关闭时保留资产 ID 但不注入引用。

已完成但必须保持回归的门禁包括：Canvas 列表/创建入口、切换前草稿 flush、普通 Canvas `/live` 与显式冲突恢复、主用户/子用户 CanvasActorScope 权限、X6 vendor 静态路由/真实挂载/节点适配/释放、X6 节点对齐/分布、连接释放快速创建、资产稳定 ID 拖入与流式传输控制、Canvas settings/toolbar/output defaults、生成历史服务端搜索/分页/集合删除、歌词/纯文本转录、文本/媒体混合批次 DAG、跨批次/同批次稳定资产版本注入、v0.6.7 角色库/媒体提示词偏好/吉祥物、Agent 真实记忆管理与持久化跳步、pin/rename/rewind/归档恢复、Director 多实例绑定/节点级视频/Artifact 回写、稳定音视频节点、动态 Three.js 背景、Storage Canvas 引用保留语义，以及现有任务/计费/恢复链路的 HTTP/数据库测试。正式数据库的 Canvas Agent 知识/引用/外部边界表和 step input payload 历史迁移漂移已通过独立前向迁移修复，并有旧 schema 升级回归。

### 16.2 资产侧栏状态说明（2026-09-04）

第 16.1 节第 7 项中的“完整项目/短剧资产 CRUD”剩余项仅指项目资产编辑边界；Canvas 短剧资产抽屉的创建、图片导入、简介、固定图替换/解绑、单项删除和按分类事务清空已完成，并复用项目上传、资产版本和剧集资产授权链路。全局 Web 虚拟分类已完成，独立空文件夹实体、批量目录操作和外部本地文件夹不在本项目范围内。

### 16.3 全局资产虚拟文件夹与项目资产 CRUD 状态（2026-09-04）

Canvas 的“全局资产”来源现以 `team_assets.folder_name` 持久化 Web 虚拟文件夹，支持按文件夹/未分类筛选，并由主用户在同一资产卡片中输入名称创建或移动资产；团队子账户不能移动。资产库接口会返回当前仍有资产的文件夹名称。该模型不记录本地路径，也不创建无资产的空目录；COS 对象 key 前缀是资产归档的 canonical 边界，因此独立空文件夹、批量重命名和显式删除空文件夹实体不纳入本项目范围。

Canvas 的“项目文件”来源已在同一侧栏中覆盖导入、名称/简介编辑、媒体替换、标签编辑、删除、保存到全局和风格母图设置；所有写操作复用既有项目资产 API 与 `projectEdit` 授权，不切换到项目工作台。

## 17. 授权、来源与依赖

- 在第三方声明中记录上游仓库 URL、当前基线 commit `8773129`（上一轮 `0f3ca1c`）、实际复用/修改的文件和作者要求的 attribution。产品内是否展示署名以书面授权为准，但代码来源和改动 provenance 必须内部可追溯。
- 对上游全部 npm、字体、图标、图片编辑器、全景和 3D 依赖执行许可证、安全和浏览器兼容审计，生成并随发布保留 SBOM/Third-Party Notices。
- 依赖必须进入当前项目统一 lockfile 并锁定可复现版本。上游的 Git URL 依赖（例如 `xiaoluo-vr-panorama`）未经许可证和供应链审查不得直接接入；优先使用已发布且锁定 integrity 的包，或在获准后固定到审计过的 commit。
- 不复制 Tauri 专属依赖到 Web bundle；对 `@tenney95/xiaoluo-image-editor` 等直接承载核心功能的包，必须验证授权、维护策略、CSP、bundle size 和替代/固定版本方案。

## 18. 关联代码和参考

现有项目：

- [capabilities.ts](/D:/Claudecode/AIProject/comic_ai/packages/contracts/domain/capabilities.ts)
- [user-actor-context.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/identity/user-actor-context.service.ts)
- [team.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/identity/team.service.ts)
- [creator-canvas-record.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/project/creator-canvas-record.service.ts)
- [creator-canvas-validation.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/project/creator-canvas-validation.ts)
- [admin-model-config.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/admin-models/admin-model-config.service.ts)
- [ai-model-config.store.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/model-catalog/ai-model-config.store.ts)
- [text-model-gateway.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/model-gateway/text-model-gateway.service.ts)
- [provider-adapter.factory.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/model-gateway/provider-adapter.factory.ts)
- [generation-queue-cancellation.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/model-gateway/generation-queue-cancellation.service.ts)
- [generation-redis-repair.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts)
- [workflow-task.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/workflow-task/workflow-task.service.ts)
- [credit-ledger.service.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/modules/credit-billing/credit-ledger.service.ts)
- [phone-auth-dev-server.ts](/D:/Claudecode/AIProject/comic_ai/apps/backend/src/entrypoints/phone-auth-dev-server.ts)
- [creator-api.js](/D:/Claudecode/AIProject/comic_ai/apps/web/src/shared/creator-api.js)
- [director-desk/INTEGRATION.md](/D:/Claudecode/AIProject/comic_ai/apps/web/src/features/director-desk/INTEGRATION.md)
- [run-canvas-agent-smoke.mjs](/D:/Claudecode/AIProject/comic_ai/scripts/run-canvas-agent-smoke.mjs)

上游项目：

- [README](https://github.com/Tenney95/AI-Canvas-tauri/blob/master/README.md)
- [节点类型](https://github.com/Tenney95/AI-Canvas-tauri/blob/master/src/types/index.ts)
- [画布集成](https://github.com/Tenney95/AI-Canvas-tauri/blob/master/src/components/Canvas.tsx)
- [生成运行时](https://github.com/Tenney95/AI-Canvas-tauri/tree/master/src/services/ai)
- [Agent 工具](https://github.com/Tenney95/AI-Canvas-tauri/tree/master/src/services/chat)
- [资产服务](https://github.com/Tenney95/AI-Canvas-tauri/tree/master/src/services/fs)
- [上游设计文档](https://github.com/Tenney95/AI-Canvas-tauri/tree/master/doc)

## 19. 当前明确不做的事情

- 不恢复旧 `apps/web/new-canvas` 的构建产物、独立 HTML 或旧 Loomic 实现。
- 不把 AI Canvas 的 IndexedDB 当作云端事实来源。
- 不创建 Canvas、Chat、Asset 或 Director Desk 的独立窗口。
- 不把 Canvas 绑定到漫画项目、剧集、脚本或镜头。
- 不在前端保存或执行 Provider API Key。
- 不为了兼容 Tauri 而在 Web 环境伪造本地文件、ONNX 或系统应用调用成功。

这份文档是后续实现、评审和验收的唯一集成基线。任何新增节点、Provider、Agent Tool 或桌面替代能力，都必须先更新对应协议、权限矩阵和验收用例。
