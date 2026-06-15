# Canvas Workflow Storage Design

Date: 2026-06-12
Project: comic_ai
Scope: production workbench canvas persistence, node data, generated results, selection state, layout, graph connections, and future node CRUD evolution

## 1. 背景

当前画布已经进入 X6 图编辑器方向。前端已有这些关键模块：

- `apps/web/src/features/production-workbench/canvas/canvas-default-document.js`: 定义默认 `Script -> Send -> Image` 文档。
- `apps/web/src/features/production-workbench/canvas/canvas-state.js`: 管理节点增删、节点数据更新、坐标更新、连线、运行结果回填。
- `apps/web/src/features/production-workbench/canvas/canvas-x6-document.js`: 在项目自定义 canvas document 和 X6 graph JSON 之间转换。
- `apps/web/src/features/production-workbench/canvas/canvas-x6-graph.js`: 挂载 X6，处理拖拽、连线、选择、删除、撤销重做，并把图变化同步回 `workbench.ui.canvasDocument`。
- `packages/db/migrations/0026_creator_canvas_projects.sql`: 已有 `creator_canvas_projects` 元数据表，只存画布项目的归属、标题、状态和软删除，还没有存节点、边、视口、运行结果和版本历史。

产品入口约束：

- 画布从项目详情进入，不是独立白板入口。
- 一个业务项目只有一个画布主体，`projects.id` 和 `creator_canvas_projects.project_id` 一对一。
- 一个用户可以拥有多个画布，是因为他可以创建多个项目。
- 剧集、分镜、资产、任务可以作为节点数据或运行上下文被引用，但不作为画布顶层归属维度。

现有前端文档形态大致是：

```js
{
  version: 1,
  projectId: "...",
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: "send-flow",
      type: "send",
      position: { x: 520, y: 116 },
      size: { width: 360, height: 170 },
      data: {
        title: "图片生成",
        status: "running",
        mediaKind: "image",
        modelCode: "gpt-image-2-cn",
        prompt: "",
        ports: { inputs: [], outputs: [] }
      }
    }
  ],
  edges: [
    {
      id: "edge-send-image",
      sourceNodeId: "send-flow",
      sourcePortId: "out_image",
      targetNodeId: "image-result",
      targetPortId: "in_image",
      data: { kind: "image", status: "running" }
    }
  ]
}
```

这个形态适合作为前端图快照，但不能独立支撑长期的生成记录、节点查询、多人协作、版本回滚和精确审计。推荐使用“图快照 + 关系表拆分 + 事件历史”的混合模型。

## 2. 市面实现方式

### AntV X6

X6 官方把图保存恢复放在 `graph.toJSON()` 和 `graph.fromJSON()` 上。导出的核心数据是节点、边、位置、大小、样式、层级等图形信息；恢复时可以传 `{ cells }` 或 `{ nodes, edges }`。这和当前项目的 `canvasDocumentToX6Data()` / `canvasDocumentFromX6Data()` 完全对得上。

参考：<https://x6.antv.vision/en/docs/tutorial/intermediate/serialization/>、<https://x6.antv.antgroup.com/en/tutorial/getting-started>

### React Flow

React Flow 官方 Save and Restore 示例使用 `toObject()` 保存完整 flow，也可以直接保存本地 `nodes`、`edges`、`viewport` 状态。它的设计启发是：前端图编辑器需要保存节点数组、边数组和视口，但业务数据不应该只塞在图引擎状态里。

参考：<https://reactflow.dev/examples/interaction/save-and-restore>、<https://reactflow.dev/api-reference/types/viewport>

### tldraw

tldraw 把持久化快照分成 `document` 和 `session` 两部分：`document` 包含 shapes、pages、bindings 等需要同步到服务端的数据；`session` 包含 camera、selection、UI state 等每个用户自己的会话态。这个分层很适合本项目：画布节点和连线是 document，选中节点、当前缩放、临时菜单是 session。

参考：<https://tldraw.dev/docs/persistence>、<https://tldraw.dev/examples/snapshots>

### Excalidraw

Excalidraw 用 `elements`、`appState`、`files` 保存场景。它的序列化工具会移除 deleted elements 和部分 appState 字段，restore 工具会为缺失字段填默认值。启发是：导入旧画布时必须有 normalize/migrate 层，不要假设历史 JSON 字段永远完整。

参考：<https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils>、<https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/restore>

### JointJS

JointJS 也使用 `graph.toJSON()` / `graph.fromJSON()` 做整图导入导出。它和 X6 的共同点是：图引擎保存图结构很方便，但业务系统仍需要自己设计数据库边界。

参考：<https://docs.jointjs.com/4.0/learn/features/export-import/json/>

## 3. 设计结论

本项目不要只保存一份 `document_json`，也不要一开始把所有字段拆到极细。推荐三层：

1. `creator_canvas_projects`: 画布容器，承接组织、工作区、项目、标题、状态。它和 `projects` 是一对一关系。
2. `creator_canvas_documents`: 当前可恢复快照，保存完整 `document_json`、`x6_graph_json`、`viewport_json`、`server_revision`。这是最快可落地的读写入口。
3. 结构化子表：`creator_canvas_nodes`、`creator_canvas_edges`、`creator_canvas_node_runs`、`creator_canvas_node_artifacts`、`creator_canvas_sessions`、`creator_canvas_revisions`、`creator_canvas_events`。用于查询、生成追踪、选区恢复、历史回滚和协作。

读画布时，服务端以 `creator_canvas_documents.document_json` 为主，必要时用节点/边表重建或校验。写画布时，一个事务内同时更新 document 快照和结构化表，保证两边 revision 一致。

## 4. 推荐数据表

### 4.1 画布容器：`creator_canvas_projects`

沿用现有 `0026_creator_canvas_projects.sql`，建议后续补齐项目归属字段，并把项目和画布锁成一对一：

```sql
ALTER TABLE creator_canvas_projects
  ADD COLUMN IF NOT EXISTS project_id uuid NULL,
  ADD COLUMN IF NOT EXISTS server_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS latest_document_id uuid NULL;

ALTER TABLE creator_canvas_projects
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE creator_canvas_projects
  ADD CONSTRAINT creator_canvas_projects_project_fk
  FOREIGN KEY (organization_id, project_id)
  REFERENCES projects (organization_id, id);
```

字段含义：

- `project_id`: 关联当前业务项目。一个项目只能有一个未删除画布。
- `server_revision`: 乐观锁版本。
- `latest_document_id`: 指向当前快照。

索引建议：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_projects_project_uidx
  ON creator_canvas_projects (organization_id, project_id)
  WHERE deleted_at IS NULL;
```

### 4.2 当前文档快照：`creator_canvas_documents`

```sql
CREATE TABLE creator_canvas_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  schema_version integer NOT NULL DEFAULT 1,
  server_revision integer NOT NULL DEFAULT 1 CHECK (server_revision >= 1),
  document_json jsonb NOT NULL,
  x6_graph_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewport_json jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  edge_count integer NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  content_hash text NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, server_revision),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE INDEX creator_canvas_documents_latest_idx
  ON creator_canvas_documents (organization_id, canvas_project_id, server_revision DESC);
```

存什么：

- 一整块画布完整快照。
- 所有节点、边、端口、节点数据、运行展示态、视口。
- `x6_graph_json` 可选，保存 X6 原生导出形态，便于调试和迁移。

不存什么：

- 轮询 timer、AbortController、DOM 引用、hover state、临时菜单开关。
- 大文件二进制，图片/视频只存 asset/task/storage 引用。

### 4.3 节点表：`creator_canvas_nodes`

```sql
CREATE TABLE creator_canvas_nodes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  node_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idle',
  media_kind text NULL,
  source_kind text NULL,
  model_code text NULL,
  position_x numeric NOT NULL DEFAULT 0,
  position_y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 360,
  height numeric NOT NULL DEFAULT 240,
  z_index integer NOT NULL DEFAULT 0,
  group_key text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  port_schema_json jsonb NOT NULL DEFAULT '{"inputs":[],"outputs":[]}'::jsonb,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (canvas_project_id, node_key),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);

CREATE INDEX creator_canvas_nodes_canvas_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, sort_order, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX creator_canvas_nodes_type_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, node_type, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX creator_canvas_nodes_group_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, group_key, position_x, position_y)
  WHERE deleted_at IS NULL AND group_key IS NOT NULL;
```

字段边界：

- `node_key`: 前端稳定节点 ID，例如 `send-flow`、`canvas-send-4`。X6 和业务文档都引用这个值。
- `node_type`: `script | send | image | video | audio | upload | director | output | storyboard`。
- `position_x/position_y/width/height/z_index`: 节点坐标、尺寸、层级，支撑“节点的坐标位置”和布局恢复。
- `group_key`: 支撑节点分组/分部/泳道，比如 `episode-1`、`scene-a`、`assets`。
- `data_json`: 保存节点配置，如 `prompt`、`negativePrompt`、`parameters`、`sectionIds`、`assetId`、`previewUrl`。
- `runtime_json`: 保存当前展示态，如 `taskId`、`progress`、`stage`、`errorMessage`。真实任务事实仍以 `ai_generation_task_snapshots`、`tasks`、`provider_requests` 为准。

### 4.4 边表：`creator_canvas_edges`

```sql
CREATE TABLE creator_canvas_edges (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  edge_key text NOT NULL,
  source_node_key text NOT NULL,
  source_port_id text NOT NULL,
  target_node_key text NOT NULL,
  target_port_id text NOT NULL,
  edge_kind text NOT NULL DEFAULT 'any',
  status text NOT NULL DEFAULT 'idle',
  router_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (canvas_project_id, edge_key),
  UNIQUE (canvas_project_id, source_node_key, source_port_id, target_node_key, target_port_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (canvas_project_id, source_node_key)
    REFERENCES creator_canvas_nodes (canvas_project_id, node_key),
  FOREIGN KEY (canvas_project_id, target_node_key)
    REFERENCES creator_canvas_nodes (canvas_project_id, node_key)
);

CREATE INDEX creator_canvas_edges_source_idx
  ON creator_canvas_edges (organization_id, canvas_project_id, source_node_key)
  WHERE deleted_at IS NULL;

CREATE INDEX creator_canvas_edges_target_idx
  ON creator_canvas_edges (organization_id, canvas_project_id, target_node_key)
  WHERE deleted_at IS NULL;
```

字段边界：

- `source_node_key/source_port_id/target_node_key/target_port_id`: 完整保存每个节点的连接状态。
- `edge_kind`: `text | image | video | audio | any`。
- `router_json`: 保存 X6 边路径、折点、连接器配置，默认可以为空。
- 删除节点时，不物理删除边，先软删除，便于撤销/审计；快照导出时过滤 `deleted_at IS NULL`。

### 4.5 节点运行记录：`creator_canvas_node_runs`

```sql
CREATE TABLE creator_canvas_node_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  run_no integer NOT NULL CHECK (run_no >= 1),
  idempotency_key text NOT NULL,
  status text NOT NULL,
  media_kind text NOT NULL,
  model_code text NULL,
  composed_prompt_hash text NULL,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_id uuid NULL REFERENCES tasks(id),
  attempt_id uuid NULL REFERENCES task_attempts(id),
  provider_request_id uuid NULL REFERENCES provider_requests(id),
  generation_snapshot_id uuid NULL REFERENCES ai_generation_task_snapshots(id),
  failure_json jsonb NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (canvas_project_id, node_key, run_no),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (canvas_project_id, node_key)
    REFERENCES creator_canvas_nodes (canvas_project_id, node_key)
);

CREATE INDEX creator_canvas_node_runs_node_idx
  ON creator_canvas_node_runs (organization_id, canvas_project_id, node_key, run_no DESC);

CREATE INDEX creator_canvas_node_runs_task_idx
  ON creator_canvas_node_runs (organization_id, task_id)
  WHERE task_id IS NOT NULL;
```

用途：

- 保存每次点击“运行”的输入快照、组合提示词摘要、上游引用、模型、任务 ID 和结果摘要。
- 支撑“生成的数据”和历史结果回看。
- 生成事实仍复用现有 `tasks`、`task_attempts`、`provider_requests`、`ai_generation_task_snapshots`，不要在画布表里复制完整供应商响应。

### 4.6 节点产物表：`creator_canvas_node_artifacts`

```sql
CREATE TABLE creator_canvas_node_artifacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  run_id uuid NULL REFERENCES creator_canvas_node_runs(id),
  artifact_kind text NOT NULL,
  asset_id uuid NULL REFERENCES assets(id),
  asset_version_id uuid NULL REFERENCES asset_versions(id),
  storage_object_id uuid NULL REFERENCES storage_objects(id),
  url text NULL,
  thumbnail_url text NULL,
  selected boolean NOT NULL DEFAULT false,
  selection_role text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (canvas_project_id, node_key)
    REFERENCES creator_canvas_nodes (canvas_project_id, node_key)
);

CREATE INDEX creator_canvas_node_artifacts_node_idx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, node_key, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX creator_canvas_node_artifacts_selected_idx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, selected, updated_at DESC)
  WHERE deleted_at IS NULL;
```

用途：

- 一个节点可以有多次生成、多张图、多段视频。
- `selected=true` 表示该节点当前选中的结果，支持“选中的数据”。
- `selection_role`: `current | reference | cover | output | rejected`，给后续输出节点、分镜提交、封面选择留位置。

### 4.7 用户会话态：`creator_canvas_sessions`

```sql
CREATE TABLE creator_canvas_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  user_id uuid NOT NULL REFERENCES users(id),
  viewport_json jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  selected_node_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_edge_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ui_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, user_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);
```

用途：

- 保存“当前选中的节点/边”和用户自己的视口。
- 不影响画布主文档，不参与团队共享业务事实。
- 类似 tldraw 的 `session`，可以服务端保存，也可以 MVP 先用 localStorage。

### 4.8 历史快照：`creator_canvas_revisions`

```sql
CREATE TABLE creator_canvas_revisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  server_revision integer NOT NULL CHECK (server_revision >= 1),
  operation text NOT NULL,
  document_json jsonb NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, server_revision),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);

CREATE INDEX creator_canvas_revisions_canvas_idx
  ON creator_canvas_revisions (organization_id, canvas_project_id, server_revision DESC);
```

用途：

- 保存可回滚版本。
- `operation`: `autosave | manual_save | run_node | import | restore | system_migration`。
- 可以限制保留策略：最近 100 个全量快照 + 每天一个长期快照。

### 4.9 事件日志：`creator_canvas_events`

```sql
CREATE TABLE creator_canvas_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  server_revision integer NOT NULL,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_key text NULL,
  patch_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id)
);

CREATE INDEX creator_canvas_events_canvas_idx
  ON creator_canvas_events (organization_id, canvas_project_id, server_revision DESC, created_at DESC);
```

用途：

- 记录“增加节点、删除节点、修改节点、修改节点数据、连接节点、断开连接、移动节点、选择产物”等操作。
- 不建议用事件日志作为 MVP 的唯一真相源；它更适合审计、协作增量同步和后续 CRDT/OT 演进。

## 5. 字段如何覆盖用户关心的数据

| 需求 | 落库位置 |
| --- | --- |
| 一整块画布 | `creator_canvas_documents.document_json`，历史进 `creator_canvas_revisions.document_json` |
| 创建的节点 | `creator_canvas_nodes`，同时进入 `document_json.nodes` |
| 节点中的数据 | `creator_canvas_nodes.data_json`，常用字段提升到 `title/status/media_kind/model_code` |
| 生成的数据 | `creator_canvas_node_runs.output_snapshot_json` + `creator_canvas_node_artifacts` + 现有 `ai_generation_task_snapshots` |
| 选中的数据 | 节点当前选中产物用 `creator_canvas_node_artifacts.selected`，用户当前选中节点/边用 `creator_canvas_sessions` |
| 节点坐标位置 | `creator_canvas_nodes.position_x/position_y/width/height/z_index` |
| 每个节点连接状态 | `creator_canvas_edges` |
| 节点分布/分部 | 坐标字段 + `group_key` + `sort_order`；后续可加 `creator_canvas_groups` |
| 后续增加节点 | 插入 `creator_canvas_nodes`，更新快照，写 `creator_canvas_events.node.created` |
| 删除节点 | 软删除节点和相关边，更新快照，写 `creator_canvas_events.node.deleted` |
| 修改节点 | 更新节点基础字段和 `data_json`，更新快照，写 `creator_canvas_events.node.updated` |
| 修改节点中的数据 | 更新 `data_json` 或 `runtime_json`，必要时把旧运行结果标记 stale |
| 修改连接 | upsert/soft delete `creator_canvas_edges`，更新快照和事件 |

## 6. 保存流程

### 6.1 首次打开画布

1. 前端从项目详情进入画布，请求 `GET /api/creator/projects/:projectId/canvas`。
2. 服务端查 `creator_canvas_projects`。
3. 如果不存在，创建画布容器和默认文档，默认文档可以沿用 `createDefaultCanvasDocument()` 的结构。
4. 返回：

```js
{
  canvasProjectId: "...",
  document: {},
  serverRevision: 1,
  session: {
    viewport: {},
    selectedNodeIds: []
  }
}
```

### 6.2 自动保存

1. X6 拖拽、连线、删除、节点数据编辑后，前端 debounce 800ms。
2. 前端提交：

```js
{
  clientRevision: 12,
  document: {},
  changedBy: "autosave",
  events: [
    { type: "node.position.updated", targetKey: "send-flow", patch: { position: { x: 620, y: 140 } } }
  ]
}
```

3. 服务端开启事务：
   - `SELECT ... FOR UPDATE` 锁定 `creator_canvas_projects`。
   - 校验 `clientRevision == server_revision`。
   - normalize/migrate document。
   - 更新 `creator_canvas_documents` 或插入新 document revision。
   - upsert `creator_canvas_nodes`、`creator_canvas_edges`。
   - 插入 `creator_canvas_revisions` 和 `creator_canvas_events`。
   - `server_revision += 1`。
4. 返回新 revision。

### 6.3 运行节点

运行前必须先保存画布：

1. 前端调用保存接口，拿到最新 `serverRevision`。
2. 前端或服务端调用 `POST /canvas/nodes/:nodeKey/run`。
3. 服务端读取该 revision 的节点和上游边，生成 `input_snapshot_json`。
4. 创建 `creator_canvas_node_runs`。
5. 通过现有 generation gateway 创建任务。
6. 把 `task_id`、`generation_snapshot_id` 回写到 run 和节点 `runtime_json`。
7. 任务完成后，写 `creator_canvas_node_artifacts`，更新节点当前结果，并生成新 revision。

## 7. 文档 JSON 与关系表边界

`document_json` 继续作为画布恢复的主载体，结构上贴近前端：

```js
{
  version: 2,
  canvasProjectId: "...",
  projectId: "...",
  viewport: { x: 0, y: 0, zoom: 1, gridVisible: true, snapEnabled: true },
  nodes: [],
  edges: [],
  groups: [],
  updatedAt: "..."
}
```

关系表作为查询和业务执行的主载体：

- 要找某个节点最近一次生成：查 `creator_canvas_node_runs`。
- 要展示节点当前选中图片：查 `creator_canvas_node_artifacts WHERE selected = true`。
- 要删除节点时清理连接：查 `creator_canvas_edges`。
- 要恢复整图：读 `creator_canvas_documents.document_json`。

这个边界可以避免两个问题：

- 只存 JSON：后续很难查“某个项目所有失败节点”“某个资产被哪些画布节点引用”。
- 只存关系表：前端恢复整图要做大量拼装，X6 的样式和插件元数据容易丢。

## 8. 数据规范

### 8.1 节点 ID

前端节点 ID 必须稳定，不能每次渲染重新生成。建议统一：

```text
canvas-{nodeType}-{shortId}
```

例如：

```text
canvas-script-01hx8k
canvas-send-01hx8m
canvas-image-01hx8n
```

数据库中：

- `creator_canvas_nodes.id`: 数据库 UUID。
- `creator_canvas_nodes.node_key`: 前端稳定 ID。

所有边和 document JSON 引用 `node_key`，不是数据库 UUID。这样导入导出更自然。

### 8.2 端口

端口 schema 存在节点 `port_schema_json` 和 `document_json.nodes[].data.ports`：

```js
{
  inputs: [{ id: "in_text", kind: "text", accepts: ["text"] }],
  outputs: [{ id: "out_image", kind: "image" }]
}
```

边表保存实际连接的 `port_id`。如果后续自定义节点允许动态端口，再补 `creator_canvas_node_ports` 表；MVP 不需要。

### 8.3 生成产物

画布不存大文件，只存引用：

```js
{
  assetId: "...",
  assetVersionId: "...",
  storageObjectId: "...",
  taskId: "...",
  previewUrl: "...",
  mediaKind: "image"
}
```

大文件继续走 `storage_objects`、`assets`、`asset_versions`。

### 8.4 选中状态

分两类：

- 业务选择：某个图片结果被选为当前图、参考图、最终输出，存 `creator_canvas_node_artifacts.selected/selection_role`，团队共享。
- UI 选择：当前用户点中了哪个节点或边，存 `creator_canvas_sessions.selected_node_keys_json`，不影响他人。

### 8.5 stale 标记

当上游节点的 `data_json`、产物选择或连接发生变化时，下游运行结果可能过期。推荐在保存时计算影响范围：

1. 找到 changed node。
2. 沿 `creator_canvas_edges` 向下游 BFS。
3. 把下游节点 `runtime_json.stale = true`，或把 `status` 改为 `stale`。
4. 不删除旧产物，只提示用户重新运行。

## 9. API 建议

```text
GET    /api/creator/projects/:projectId/canvas
PUT    /api/creator/projects/:projectId/canvas

POST   /api/canvas/:canvasProjectId/nodes
PATCH  /api/canvas/:canvasProjectId/nodes/:nodeKey
DELETE /api/canvas/:canvasProjectId/nodes/:nodeKey

POST   /api/canvas/:canvasProjectId/edges
DELETE /api/canvas/:canvasProjectId/edges/:edgeKey

POST   /api/canvas/:canvasProjectId/nodes/:nodeKey/run
GET    /api/canvas/:canvasProjectId/nodes/:nodeKey/runs
POST   /api/canvas/:canvasProjectId/artifacts/:artifactId/select

PUT    /api/canvas/:canvasProjectId/session
GET    /api/canvas/:canvasProjectId/history
POST   /api/canvas/:canvasProjectId/restore/:revision
```

MVP 可以只实现 `GET/PUT canvas` 和 `run node`。节点/边细粒度 API 可以等协作或低延迟同步时再加。

## 10. 迁移路线

### Phase 1: 快照持久化

- 在现有 `creator_canvas_projects` 基础上补 `project_id/server_revision/latest_document_id`。
- 加唯一索引保证一个项目只有一个未删除画布。
- 新增 `creator_canvas_documents`。
- 前端保存整份 `canvasDocument`。
- 支持 reload 后恢复节点、边、坐标、视口。

### Phase 2: 结构化节点和边

- 新增 `creator_canvas_nodes`、`creator_canvas_edges`。
- PUT 保存时从 `document.nodes/edges` upsert 结构化表。
- 删除节点时软删除节点和相关边。
- 后台增加一致性测试：`document_json.nodes.length == active nodes count`。

### Phase 3: 运行与产物

- 新增 `creator_canvas_node_runs`、`creator_canvas_node_artifacts`。
- 运行节点前保存 revision。
- 运行结果不只写回 `node.data`，还写 run/artifact。
- 产物选择成为业务事实。

### Phase 4: 会话和历史

- 新增 `creator_canvas_sessions`、`creator_canvas_revisions`、`creator_canvas_events`。
- 支持用户自己的选区/视口恢复。
- 支持历史回滚、审计和冲突提示。

### Phase 5: 分组/分部/协作

- 如果节点分部只是视觉分组，先用 `group_key`。
- 如果分部有业务含义，再新增：

```sql
CREATE TABLE creator_canvas_groups (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  group_key text NOT NULL,
  title text NOT NULL,
  group_type text NOT NULL DEFAULT 'section',
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canvas_project_id, group_key)
);
```

## 11. 推荐当前落地决策

当前项目已经有 X6 适配和 `creator_canvas_projects` 表，下一步不要直接改成复杂协作模型。建议：

1. 先补 `creator_canvas_documents`，让整块画布可保存、可恢复。
2. 同一迁移里补 `project_id/server_revision/latest_document_id` 到 `creator_canvas_projects`，并加 `UNIQUE (organization_id, project_id) WHERE deleted_at IS NULL`。
3. 在同一后端服务里先做 document normalize/migrate，保证旧 JSON 能打开。
4. 第二个迭代再加 `creator_canvas_nodes` 和 `creator_canvas_edges`，先只做快照拆表，不改前端交互。
5. 生成跑通后再加 `creator_canvas_node_runs` 和 `creator_canvas_node_artifacts`，把“生成数据”和“选中结果”从 `node.data` 里提升成业务事实。

这样能保证：

- 现在的 X6 前端不用推倒重来。
- 画布坐标、节点数据、连线状态可以完整恢复。
- 后续增加节点、删除节点、修改节点、修改节点数据都能通过 revision + event 追踪。
- 生成结果不会被埋在一份越来越大的 JSON 里。
- 未来多人协作时，可以从 event/session/revision 演进，而不需要重做表结构。

## 12. 缺失项检查清单

这部分是对当前设计和现有代码的差距检查。它不是推翻前面的方案，而是列出真正落地前还要补齐的点。

### 12.1 当前迁移缺口

现有 `packages/db/migrations/0026_creator_canvas_projects.sql` 只有画布容器元数据，还缺：

- `project_id` 字段。
- `server_revision` 字段。
- `latest_document_id` 字段。
- `UNIQUE (organization_id, project_id) WHERE deleted_at IS NULL`，用于保证项目和画布一对一。
- `FOREIGN KEY (organization_id, project_id) REFERENCES projects (organization_id, id)`。
- `latest_document_id` 指向 `creator_canvas_documents` 的外键。因为两个表相互引用，建议先建 `creator_canvas_documents`，再 `ALTER TABLE creator_canvas_projects ADD CONSTRAINT ...`。

现有表里 `status text NOT NULL DEFAULT '草稿'` 也建议改成稳定枚举值：

```sql
status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'active', 'archived'))
```

中文展示文案留在前端，不建议作为数据库状态值。

### 12.2 老数据回填缺口

如果 `creator_canvas_projects` 已经有测试数据，不能直接 `ALTER COLUMN project_id SET NOT NULL`。迁移需要分三步：

1. 先加 nullable `project_id`、`server_revision`、`latest_document_id`。
2. 按现有画布和项目关系回填 `project_id`。如果无法推断，保留为孤儿草稿并由脚本生成临时项目，或者迁移前清理测试数据。
3. 确认没有 `project_id IS NULL` 后，再加 not null 和唯一索引。

### 12.3 租户安全外键缺口

表设计里很多地方写了：

```sql
canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id)
```

为了和项目现有租户隔离风格一致，正式迁移里建议使用组合外键：

```sql
FOREIGN KEY (organization_id, canvas_project_id)
  REFERENCES creator_canvas_projects (organization_id, id)
```

同时需要确保 `creator_canvas_projects` 保持：

```sql
UNIQUE (organization_id, id)
```

节点、边、运行、产物、session、revision、event 表都应使用这种组合外键，避免跨组织误引用。

### 12.4 文档快照一致性缺口

还需要明确三个一致性规则：

- `creator_canvas_documents.project_id` 必须等于 `creator_canvas_projects.project_id`。
- `document_json.projectId` 必须等于接口里的 `:projectId`。
- `document_json.canvasProjectId` 必须等于当前 `creator_canvas_projects.id`。

数据库很难完全检查 JSON 内部字段，所以服务端保存时必须做 normalize/validate。建议新增 `canvas-document.schema.ts` 或等价校验模块。

### 12.5 视口归属缺口

当前设计同时有 `document_json.viewport` 和 `creator_canvas_sessions.viewport_json`。需要定清楚边界：

- `document_json.viewport`: 团队默认视口，通常只在创建画布、手动“设为默认视图”、导入导出时更新。
- `creator_canvas_sessions.viewport_json`: 每个用户自己的最后浏览位置，自动保存。

否则多人打开同一项目时，一个人拖动画布会改掉所有人的视口。

### 12.6 选中产物唯一性缺口

`creator_canvas_node_artifacts.selected` 需要唯一性约束。否则一个节点可能同时有多个 `selected=true` 结果。

建议：

```sql
CREATE UNIQUE INDEX creator_canvas_node_artifacts_selected_role_uidx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, node_key, COALESCE(selection_role, 'current'))
  WHERE deleted_at IS NULL AND selected = true;
```

如果 PostgreSQL 不接受表达式里的业务偏好，也可以把 `selection_role` 设为 `NOT NULL DEFAULT 'current'`。

### 12.7 运行上下文缺口

画布是项目级一对一，但现有生成接口很多以 episode 为上下文，例如 `createImageTask(episodeId, input)`、`createVideoTask(episodeId, input)`。因此运行节点时必须知道具体 episode/workbench。

推荐不要把 `episode_id` 放回画布顶层，而是在运行记录和节点数据里保存：

```sql
episode_id uuid NULL REFERENCES episodes(id)
target_type text NULL
target_id uuid NULL
```

用途：

- `creator_canvas_node_runs.episode_id`: 本次运行使用哪个剧集上下文。
- `creator_canvas_nodes.data_json.episodeId`: 节点默认绑定哪个剧集，允许为空。
- `input_snapshot_json`: 保存运行时最终解析到的 episode/workbench/shot/asset 引用。

这样仍保持“项目一对一画布”，但不会卡住生成任务。

### 12.8 引用关系缺口

节点产物表能记录生成结果，但还缺“节点引用了哪些外部素材/脚本/分镜”的查询能力。只放在 `data_json.references` 里可以跑通，但后续不好查“这个资产被哪些画布引用”。

建议后续新增轻量引用表：

```sql
CREATE TABLE creator_canvas_node_references (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL,
  node_key text NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid NOT NULL,
  reference_role text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
```

`reference_type` 可用：`asset | asset_version | script_section | shot | episode | storage_object | task`。

### 12.9 节点和边软删除唯一性缺口

当前建议里：

```sql
UNIQUE (canvas_project_id, node_key)
UNIQUE (canvas_project_id, edge_key)
```

这会阻止删除后重用同一个 key。一般这是好事，因为 undo/history 需要稳定引用。但如果导入画布或复制节点时可能产生旧 key 冲突，需要服务端提供 key remap：

- 导入时检测重复 `node_key` / `edge_key`。
- 重写新 key。
- 同步重写所有 edge 的 source/target。
- 写入 `creator_canvas_events.import.remapped_keys`。

### 12.10 循环和连接合法性缺口

前端已有 `validateCanvasConnection()`，但服务端保存时也必须复验：

- source/target 节点存在且未删除。
- port 存在。
- 输出口只能连输入口。
- 媒体类型兼容。
- 不允许 self-loop。
- 对可执行流不允许 cycle。

否则用户可以绕过前端直接 PUT 非法 `document_json`。

### 12.11 大 JSON 膨胀缺口

`document_json` 会越来越大，尤其节点里如果保存多个结果 URL、历史错误、运行快照，会膨胀很快。需要规定：

- 节点只保存当前展示所需的轻量摘要。
- 多次运行历史放 `creator_canvas_node_runs`。
- 多个结果放 `creator_canvas_node_artifacts`。
- 大段供应商请求/响应继续走 `provider_requests`、`ai_generation_task_snapshots`。
- `creator_canvas_revisions` 做保留策略，不能永久保存每次 autosave 全量快照。

### 12.12 API 缺口

项目级核心 API 已明确，但还缺请求/响应细节：

```js
// PUT /api/creator/projects/:projectId/canvas
{
  clientRevision: 12,
  document: {},
  sessionPatch: null,
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
  error: "canvas_revision_conflict",
  serverRevision: 13,
  serverDocument: {}
}
```

MVP 可以先做“重新加载服务端版本”和“覆盖保存”，不要一开始做复杂合并。

### 12.13 前端现状缺口

当前前端还有 `selectedCanvasProjectId`、`canvasDocumentsByProject`、`DEFAULT_CANVAS_PROJECT_ID` 这类本地多画布概念。项目一对一后需要改名或收口：

- `selectedCanvasProjectId` 容易和业务 `projectId` 混淆，建议改为 `activeProjectId` 或直接使用 `workbench.state.project.id`。
- `canvasDocumentsByProject` 可以保留为前端缓存，但 key 应该是业务 `projectId`。
- `createDefaultCanvasDocument()` 应只接收 `projectId`，不要依赖顶层 `episodeId`。
- 打开项目详情时，加载该项目唯一画布；切换项目时切换缓存。

### 12.14 测试缺口

正式实现前至少要补这些测试：

- migration/schema：`creator_canvas_projects` 必须有 `project_id` 和项目唯一索引。
- migration/schema：`creator_canvas_documents` 能保存 JSONB，并通过 `(organization_id, canvas_project_id, server_revision)` 唯一。
- service：首次 GET 项目画布会创建默认画布。
- service：同一项目重复 GET 不会创建第二个画布。
- service：PUT revision 冲突返回 409。
- service：非法 edge/source/target 被拒绝。
- service：删除节点会软删除相关边。
- frontend：项目详情打开后使用业务 projectId 加载画布。
- frontend：reload 后节点坐标、边、节点数据恢复。
