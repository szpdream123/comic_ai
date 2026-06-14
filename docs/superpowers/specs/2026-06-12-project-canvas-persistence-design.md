# Project Canvas Persistence Design

> Date: 2026-06-12  
> Owner posture: gstack overall owner + superpowers implementation owner  
> Status: Implementation-ready direction  
> Source of truth: `docs/product/canvas-workflow-storage-design.md`  
> Scope: 项目一对一画布、节点/边持久化、节点图片/视频生成历史、选中产物、刷新恢复、后续检查闭环

## 1. 背景与目标

画布入口来自项目详情页。用户可以创建多个项目，因此可以拥有多个项目画布，但一个业务项目只允许有一个画布主体。

本设计要把当前前端内存里的 `canvasDocument` 变成可持久化、可恢复、可审计的项目级能力：

- 一个 `projects.id` 对应一个未删除 `creator_canvas_projects.project_id`。
- 画布完整快照可保存和恢复。
- 节点、节点数据、节点坐标、节点尺寸、端口、连接边、视口都能恢复。
- 节点运行图片/视频后，必须记录为历史，而不是只覆盖 `node.data.previewUrl`。
- 当前选中的图片/视频结果必须有业务记录。
- 服务端必须复验 document 和 edge 合法性，不能只依赖前端 X6。
- 后续 `$gstack` 检查以本文和 product 设计文档作为验收依据。

## 2. 非目标

本期不做：

- 多个画布挂在同一个项目下。
- 剧集级独立画布。
- 实时多人协作编辑。
- CRDT/OT 合并。
- 画布模板市场。
- 把大文件二进制存进画布 JSON。

剧集、分镜、资产、任务都可以作为节点引用或运行上下文出现，但不是画布顶层归属。

## 3. 核心数据模型

### 3.1 画布容器

`creator_canvas_projects` 是项目画布容器。

必须满足：

- `project_id uuid NOT NULL`
- `server_revision integer NOT NULL DEFAULT 1`
- `latest_document_id uuid NULL`
- `UNIQUE (organization_id, project_id) WHERE deleted_at IS NULL`
- `FOREIGN KEY (organization_id, project_id) REFERENCES projects (organization_id, id)`

`status` 使用稳定枚举值：

```text
draft | active | archived
```

前端再映射中文展示文案。

### 3.2 文档快照

`creator_canvas_documents` 保存完整画布快照。

必须包含：

- `canvas_project_id`
- `project_id`
- `schema_version`
- `server_revision`
- `document_json`
- `x6_graph_json`
- `viewport_json`
- `node_count`
- `edge_count`
- `content_hash`

读取整图时，以 `document_json` 为主。

写入整图时，必须校验：

- URL 中的 `projectId` 和 `document_json.projectId` 一致。
- `document_json.canvasProjectId` 和当前画布容器一致。
- `clientRevision` 等于当前 `server_revision`。
- `nodes`、`edges`、`viewport` 可以 normalize 成当前 schema。

### 3.3 节点和边

`creator_canvas_nodes` 存结构化节点。

必须覆盖：

- `node_key`
- `node_type`
- `title`
- `status`
- `media_kind`
- `source_kind`
- `model_code`
- `position_x`
- `position_y`
- `width`
- `height`
- `z_index`
- `group_key`
- `port_schema_json`
- `data_json`
- `runtime_json`
- `deleted_at`

`creator_canvas_edges` 存结构化连接。

必须覆盖：

- `edge_key`
- `source_node_key`
- `source_port_id`
- `target_node_key`
- `target_port_id`
- `edge_kind`
- `status`
- `router_json`
- `data_json`
- `deleted_at`

服务端保存时必须复验连接合法性：

- source/target 节点存在且未删除。
- source port 和 target port 存在。
- source 是 output，target 是 input。
- 媒体类型兼容。
- 不允许 self-loop。
- 对可执行流不允许 cycle。

### 3.4 节点运行历史

图片/视频历史是硬要求。

`creator_canvas_node_runs` 记录每次运行：

- `canvas_project_id`
- `node_key`
- `run_no`
- `idempotency_key`
- `status`
- `media_kind`
- `model_code`
- `episode_id NULL`
- `target_type NULL`
- `target_id NULL`
- `composed_prompt_hash`
- `input_snapshot_json`
- `output_snapshot_json`
- `task_id`
- `attempt_id`
- `provider_request_id`
- `generation_snapshot_id`
- `failure_json`
- `started_at`
- `completed_at`

`creator_canvas_node_artifacts` 记录每次运行产物：

- `canvas_project_id`
- `node_key`
- `run_id`
- `artifact_kind`
- `asset_id`
- `asset_version_id`
- `storage_object_id`
- `url`
- `thumbnail_url`
- `selected`
- `selection_role`
- `metadata_json`
- `deleted_at`

一个节点可以有多次运行。一次运行可以产生多个 artifact。节点当前展示结果可以冗余在 `node.data`，但历史必须来自 `creator_canvas_node_runs` 和 `creator_canvas_node_artifacts`。

选中产物必须有唯一约束：

```text
organization_id + canvas_project_id + node_key + selection_role
```

同一个节点同一个角色只允许一个 `selected = true`。

## 4. 服务边界

### 4.1 画布服务

新增 project canvas service，负责：

- `getOrCreateProjectCanvas(projectId, actor)`
- `saveProjectCanvas(projectId, clientRevision, document, events, actor)`
- `normalizeCanvasDocument(document)`
- `validateCanvasDocument(document)`
- `upsertCanvasNodesAndEdges(document)`
- `createCanvasRevision(operation, document)`
- `appendCanvasEvents(events)`

### 4.2 运行服务

新增或扩展 canvas runtime service，负责：

- `runCanvasNode(canvasProjectId, nodeKey, input, actor)`
- 保存运行前 document revision。
- 解析上游输入。
- 生成 input snapshot。
- 创建 `creator_canvas_node_runs`。
- 调用现有 image/video generation task 路径。
- 任务完成后写入 `creator_canvas_node_artifacts`。
- 更新节点当前展示态。
- 把下游节点标记 stale。

### 4.3 前端 API

`creatorApi` 至少需要：

- `getProjectCanvas(projectId)`
- `saveProjectCanvas(projectId, input)`
- `runCanvasNode(canvasProjectId, nodeKey, input)`
- `listCanvasNodeRuns(canvasProjectId, nodeKey)`
- `selectCanvasNodeArtifact(canvasProjectId, artifactId, input)`

MVP 可先只接：

- `getProjectCanvas`
- `saveProjectCanvas`
- `runCanvasNode`

但生成历史表必须和运行链路一起落库，不能以后端 task 记录替代节点历史。

## 5. API 合同

### 5.1 GET 项目画布

```text
GET /api/creator/projects/:projectId/canvas
```

响应：

```js
{
  canvasProjectId: "...",
  projectId: "...",
  serverRevision: 1,
  document: {},
  session: {
    viewport: {},
    selectedNodeIds: [],
    selectedEdgeIds: []
  }
}
```

首次 GET 必须创建默认画布。重复 GET 同一项目不得创建第二个画布。

### 5.2 PUT 项目画布

```text
PUT /api/creator/projects/:projectId/canvas
```

请求：

```js
{
  clientRevision: 12,
  document: {},
  events: []
}
```

成功：

```js
{
  canvasProjectId: "...",
  serverRevision: 13,
  savedAt: "...",
  document: {}
}
```

冲突：

```js
{
  errorCode: "canvas_revision_conflict",
  serverRevision: 13,
  serverDocument: {}
}
```

### 5.3 Run 节点

```text
POST /api/canvas/:canvasProjectId/nodes/:nodeKey/run
```

请求：

```js
{
  projectId: "...",
  episodeId: "...",
  clientRevision: 13,
  runMode: "image | video | text",
  inputOverrides: {}
}
```

响应：

```js
{
  runId: "...",
  nodeKey: "...",
  runNo: 3,
  taskId: "...",
  status: "queued",
  serverRevision: 14
}
```

## 6. 前端状态边界

当前前端存在 `selectedCanvasProjectId`、`canvasDocumentsByProject`、`DEFAULT_CANVAS_PROJECT_ID` 等本地多画布概念。项目一对一后必须收口：

- 画布缓存 key 使用业务 `projectId`。
- 画布容器 ID 使用 `canvasProjectId`，不能和业务 `projectId` 混用。
- `createDefaultCanvasDocument()` 只接收业务 `projectId`，不再把顶层 `episodeId` 当画布归属。
- `node.data.episodeId` 可以作为节点默认运行上下文。
- `runCanvasNode` 请求中可以传本次运行的 `episodeId`。

## 7. 错误码

必须定义并测试：

- `canvas_project_not_found`
- `canvas_project_mismatch`
- `canvas_revision_conflict`
- `canvas_document_invalid`
- `canvas_node_not_found`
- `canvas_edge_invalid`
- `canvas_connection_cycle`
- `canvas_run_node_missing`
- `canvas_run_input_required`
- `canvas_run_episode_required`
- `canvas_artifact_not_found`

## 8. 验收标准

功能完成必须满足：

- 从项目详情打开画布，会加载该项目唯一画布。
- 同一项目重复打开不会创建第二个画布。
- 新项目会创建自己的独立画布。
- 添加节点、删除节点、修改节点数据、移动节点、连接节点后，刷新仍然恢复。
- 运行图片节点后，`creator_canvas_node_runs` 有一条运行记录。
- 图片结果写入 `creator_canvas_node_artifacts`，且可作为历史查询。
- 运行视频节点后，视频结果同样写入 artifact 历史。
- 选择某个历史产物后，同节点同角色只有一个 selected artifact。
- 旧产物不因新运行被删除。
- revision 冲突返回 409。
- 非法边保存会被服务端拒绝。
- 前端显示当前结果，同时能打开节点历史列表。

## 9. gstack 检查职责

`$gstack` 后续检查按以下顺序：

1. Schema check：迁移是否包含项目一对一约束、快照表、节点/边表、运行/产物表。
2. Service check：首次 GET、重复 GET、PUT revision、非法边、节点运行历史是否有测试。
3. Frontend check：项目详情进入画布、刷新恢复、节点历史展示是否可见。
4. Browser QA：用真实页面添加节点、连接、运行、刷新，确认历史存在。
5. Regression check：现有项目、剧集、资产、生成任务路径不被破坏。

任何一项未完成，都不能标记画布持久化完成。
