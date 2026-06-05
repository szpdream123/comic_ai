# 后台管理平台落地规划

## 目标

本规划用于把最终后台设计图中的前端页面、后端功能、数据库交互和样式规范落成可执行方案。后台管理平台必须与现有前台创作端分离：目录分离、路由分离、登录态分离、权限分离，后台变更不影响 `apps/web` 的用户创作流程。

后台页面中的业务配置必须落入数据库。只有启动依赖和真实密钥继续放在环境变量或密钥管理系统中，页面中只保存 `apiKeyEnv`、密钥引用名和配置状态，禁止保存或展示明文密钥。

## 最终设计图

最终图片保留在 `design-previews/admin-ui-cn/merged-pages/shots/`：

| 图片 | 页面 | 必须复现的能力 |
| --- | --- | --- |
| `00-login.png` | 后台登录 | 单纯账号登录，无左侧黑色视觉块；登录后进入后台管理。 |
| `01-ops-overview.png` | 运营总览 | 核心指标、任务状态、异常待处理、系统健康、快捷入口。 |
| `02-models.png` | 模型配置列表 | 模型搜索、筛选、状态、供应商、类型、价格摘要、调度摘要、操作按钮固定可见。 |
| `03-model-integration-workbench.png` | 模型参数详情 / 接入工作台 | 模式、参数、参考素材规则、计费、请求映射、结果解析、调度、上线检查。 |
| `04-users-credits.png` | 用户与积分列表 | 用户查询、团队权限标注、子账户查看、手动加积分、查看账户、修改资料、禁用、删除。 |
| `05-risk-audit.png` | 风控与审计 | 支付异常、任务异常、人工复核、审计日志、处理记录。 |
| `06-system-unified.png` | 系统设置 | 环境配置状态、运行配置、权限账户、密钥引用、开关策略。 |
| `07-account-menu.png` | 管理员账户菜单 | 修改密码、当前管理员资料、会话信息、退出登录。 |
| `99-merged-contact-sheet.png` | 总览图 | 用于开发和验收时对齐整体样式与页面完整性。 |

文档引用路径示例：`../../design-previews/admin-ui-cn/merged-pages/shots/99-merged-contact-sheet.png`。

## 边界与目录

后台前端放在独立目录，不能混入 `apps/web`：

```text
apps/admin/
  index.html
  src/
    app/
      router.ts
      session.ts
      permissions.ts
    pages/
      login/
      dashboard/
      models/
      model-workbench/
      users-credits/
      risk-audit/
      system-settings/
      account/
    components/
      layout/
      tables/
      forms/
      dialogs/
      charts/
    api/
      admin-auth.api.ts
      admin-dashboard.api.ts
      admin-models.api.ts
      admin-users.api.ts
      admin-risk.api.ts
      admin-settings.api.ts
    styles/
      tokens.css
      admin.css
```

后端继续放在 `apps/backend`，按后台域拆模块：

```text
apps/backend/src/modules/
  admin-auth/
  admin-dashboard/
  admin-models/
  admin-users/
  admin-risk-audit/
  admin-system-settings/
  admin-ops/
  model-catalog/
  model-gateway/
  credit-billing/
```

`admin-ops`、`model-catalog`、`model-gateway`、`credit-billing` 已存在能力必须复用；新增后台模块只做管理入口、权限校验、审计和组合查询，不复制业务核心逻辑。

## 样式规范

整体样式必须延续最终图片的蓝灰后台主题：

| 项 | 规范 |
| --- | --- |
| 背景 | 页面背景使用浅蓝灰，主内容区干净、低噪音。 |
| 侧边栏 | 深海军蓝，菜单高亮使用蓝色强调，不使用大面积渐变。 |
| 卡片 | 白色卡片，圆角不超过 8px，阴影轻，不做卡片套卡片。 |
| 表格 | 紧凑密度，行高稳定，表头固定语义，操作列右侧固定显示。 |
| 表单 | 标签左对齐或上对齐，长字段可折行，JSON 编辑区要有校验状态。 |
| 按钮 | 主按钮蓝色，危险操作红色，次按钮灰蓝描边。图标按钮配 tooltip。 |
| 中文字体 | `Microsoft YaHei UI`, `PingFang SC`, `Noto Sans SC`, sans-serif。 |
| 溢出处理 | 列表和详情区允许整体缩小、固定列宽、横向滚动，不能让操作按钮超出屏幕。 |

布局原则：

- 主框架为左侧导航、顶部栏、内容区三段式。
- 详情页使用左侧锚点或顶部 Tab，右侧主编辑区，底部固定保存栏。
- 表格操作列始终可见，至少包含查看、编辑、禁用/启用、更多。
- 所有页面在 1366px 宽度下不得遮挡操作项；低于 1200px 时优先压缩非关键列。

## 页面功能规划

### 1. 后台登录

复现 `00-login.png`，只保留账号登录主体。

前端能力：

- 账号、密码输入。
- 记住登录状态。
- 登录中、失败、账号禁用、密码错误提示。
- 登录成功跳转 `/admin/dashboard`。

后端能力：

- 校验管理员账号状态和密码。
- 创建后台专用 session。
- 写入登录审计事件。
- 连续失败触发锁定或风控。

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/admin/auth/login` | 后台登录。 |
| `POST` | `/api/admin/auth/logout` | 退出登录并失效当前 session。 |
| `GET` | `/api/admin/auth/me` | 获取当前管理员、权限、会话信息。 |
| `PATCH` | `/api/admin/auth/profile` | 修改当前管理员资料。 |
| `POST` | `/api/admin/auth/password` | 修改当前管理员密码。 |
| `GET` | `/api/admin/auth/sessions` | 查看当前管理员登录会话。 |
| `POST` | `/api/admin/auth/sessions/revoke-other` | 失效当前管理员除本 session 外的其他有效会话。 |

`PATCH /api/admin/auth/profile` 属于敏感写入，必须携带 `Idempotency-Key`。服务端只允许修改当前 `admin_session` 对应管理员自己的展示名称，写入 `admin_accounts.display_name`，并记录 `admin.auth.profile_updated` 审计事件；同一 key 重放返回首次 account 快照，不重复写审计。前端账户菜单的“当前管理员资料”抽屉必须生成 `admin-ui-profile-*` 幂等键，保存后重新请求 `/api/admin/auth/me` 刷新页面显示。

`POST /api/admin/auth/password` 属于敏感写入，必须携带 `Idempotency-Key`。服务端先校验后台 `admin_session`，再按当前管理员、旧密码、新密码和是否失效其他会话生成请求哈希；同一 key 重放时返回首次成功快照，不重复更新 `admin_accounts.password_hash`，也不重复写 `admin.auth.password_changed` 审计事件。缺少 key 返回 `idempotency_key_required`，同一 key 携带不同请求返回 `idempotency_conflict`。前端修改密码抽屉必须生成 `admin-ui-password-change-*` 幂等键。

`POST /api/admin/auth/sessions/revoke-other` 同样属于敏感写入，必须携带 `Idempotency-Key`。服务端写入 `idempotency_records`，同一 key 重放时返回首次 `revokedCount`，不重复撤销会话，也不重复写 `admin.auth.sessions_revoked` 审计事件。前端账户菜单按钮必须生成 `admin-ui-revoke-sessions-*` 幂等键。

### 2. 运营总览

复现 `01-ops-overview.png`。

前端能力：

- 展示今日生成量、成功率、消耗积分、支付订单、风险待处理、失败任务。
- 展示模型运行状态和队列积压。
- 展示最近人工操作与异常事件。
- 快捷跳转到模型、用户、风控、系统设置。

后端数据来源：

- `tasks`、`workflows`、`provider_requests`：生成任务与供应商请求。
- `credit_ledger_entries`、`credit_reservations`：积分消耗与冻结。
- `billing_orders`、`payment_risk_events`：支付与风控。
- `ai_model_configs`、`ai_model_dispatch_policies`：模型状态和调度状态。
- `audit_events`：后台操作记录。

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/dashboard/overview` | 总览指标。 |
| `GET` | `/api/admin/dashboard/model-health` | 模型和队列健康。 |
| `GET` | `/api/admin/dashboard/recent-events` | 最近异常和审计事件。 |

### 3. 模型配置列表

复现 `02-models.png`，必须解决之前图片中操作按钮超出的问题。

前端能力：

- 按模型名称、编码、供应商搜索。
- 按媒体类型、调用模式、状态、供应商筛选。
- 列表显示模型编码、展示名、供应商、协议、任务模式、价格摘要、调度摘要、更新时间。
- 操作列固定在右侧：查看详情、编辑、复制、禁用/启用、归档。
- 新增模型入口。

数据库映射：

- 主表：`ai_model_configs`。
- 调度：`ai_model_dispatch_policies`。
- 变更记录新增：`ai_model_config_revisions`。

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/models` | 模型列表、筛选、分页。 |
| `POST` | `/api/admin/models` | 新增模型配置。 |
| `GET` | `/api/admin/models/:id` | 模型详情。 |
| `PATCH` | `/api/admin/models/:id` | 更新基础信息。 |
| `POST` | `/api/admin/models/:id/duplicate` | 复制模型。 |
| `PATCH` | `/api/admin/models/:id/status` | 启用、禁用、归档。 |

### 4. 模型参数详情 / 接入工作台

复现 `03-model-integration-workbench.png`。该页面是模型管理核心，必须能满足当前市场主流生图、生视频模型接入，而不是只改简单字段。

前端分区：

| 分区 | 功能 |
| --- | --- |
| 基础信息 | `modelCode`、展示名、供应商、真实模型名、协议、媒体类型、调用方式、排序、状态。 |
| 任务模式 | 文生图、图生图、图片编辑、扩图、文生视频、图生视频、首尾帧视频、参考图视频、视频转视频。 |
| 参数编辑器 | 手动添加参数，支持 string、number、integer、boolean、enum、array、file、file[]、json。 |
| 参数选项 | 例如视频比率、分辨率、时长、数量、质量、风格、seed、是否生成音频；选项内容由管理员手动定义。 |
| 参考素材规则 | 首帧、尾帧、参考图、参考视频、参考音频、最大数量、文件类型、文件大小、是否必填。 |
| 模型定价 | 单独放在参数详情内，按模式、分辨率、时长、数量、质量、失败退款策略设置。 |
| 请求映射 | JSON 或 multipart 请求格式、字段映射、鉴权头、`apiKeyEnv`、baseURL、endpoint。 |
| 结果解析 | task id、轮询地址、产物 URL、base64 JSON、错误码、完成状态映射。 |
| 调度限流 | 队列、并发、RPM、轮询间隔、重试、熔断。 |
| 上线检查 | 密钥存在、endpoint 可用、参数校验通过、价格配置完整、调度配置完整。 |

字段落库：

| 页面能力 | 数据库字段 |
| --- | --- |
| 任务模式 | `ai_model_configs.task_modes_json` |
| 能力声明 | `ai_model_configs.capabilities_json` |
| 参数 schema | `ai_model_configs.parameter_schema_json` |
| 默认参数 | `ai_model_configs.default_params_json` |
| 供应商端点和映射 | `ai_model_configs.provider_config_json` |
| 计费 | `ai_model_configs.pricing_json` |
| 限制和参考素材规则 | `ai_model_configs.limits_json` |
| 前端展示 | `ai_model_configs.ui_config_json` |
| 队列与限流 | `ai_model_dispatch_policies` |
| 修改历史 | `ai_model_config_revisions` |

`provider_config_json` 推荐结构：

```json
{
  "baseURL": "https://provider.example.com",
  "endpoint": "/v1/tasks",
  "queryTaskEndpoint": "/v1/tasks/{taskId}",
  "apiKeyEnv": "PROVIDER_API_KEY",
  "requestFormat": "json",
  "auth": {
    "type": "bearer",
    "header": "Authorization"
  },
  "requestMapping": {
    "prompt": "prompt",
    "aspectRatio": "ratio",
    "durationSec": "duration",
    "firstFrame": "image"
  },
  "resultMapping": {
    "taskId": "$.id",
    "status": "$.status",
    "artifactUrl": "$.output.video_url",
    "b64Json": "$.data[0].b64_json"
  },
  "errorMapping": {
    "code": "$.error.code",
    "message": "$.error.message"
  }
}
```

`parameter_schema_json` 推荐结构：

```json
{
  "aspectRatio": {
    "label": "视频比率",
    "type": "enum",
    "required": true,
    "options": ["1:1", "16:9", "9:16"],
    "adminEditableOptions": true
  },
  "durationSec": {
    "label": "视频时长",
    "type": "integer",
    "required": true,
    "options": [5, 10],
    "minimum": 1,
    "maximum": 30
  },
  "referenceImages": {
    "label": "参考图",
    "type": "file[]",
    "required": false,
    "maxItems": 8,
    "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"]
  }
}
```

计费结构：

```json
{
  "unit": "video",
  "baseCredits": 120,
  "modePrices": {
    "video.text_to_video": 120,
    "video.image_to_video": 140
  },
  "durationMultipliers": {
    "5": 1,
    "10": 1.8
  },
  "resolutionMultipliers": {
    "720p": 1,
    "1080p": 1.2,
    "2K": 1.8
  },
  "failureRefund": {
    "provider_failed": "full",
    "user_cancelled": "none"
  }
}
```

### 5. 用户与积分列表

复现 `04-users-credits.png`。页面必须同时支持主账户、团队权限账户和子账户查看。

前端能力：

- 搜索用户 ID、昵称、手机号、邮箱、组织、团队成员。
- 列表标注账户类型：主账户、管理员、团队权限账户、子账户。
- 点击团队权限账户可展开或跳转查看其下所有子账户。
- 展示可用积分、冻结积分、团队分配积分、最近消费、最近登录、状态；账户详情中的积分流水必须展示类型、来源、积分、工单号和原因。
- 操作：查看账户、修改资料、手动添加积分、扣减积分、查看流水、禁用、启用、删除/归档。
- 敏感字段默认脱敏，查看完整手机号/邮箱需要权限并写审计。

数据库复用：

- `users`：身份资料与账号状态。
- `organizations`、`workspaces`、`memberships`：组织、空间、成员关系和权限。
- `team_member_groups`：团队权限分组。
- `team_member_profiles`：子账户和团队成员资料。
- `team_credit_adjustments`：团队积分调整。
- `credit_ledger_entries`：积分流水，手动加减必须写入该表。
- `credit_reservations`、`credit_reservation_allocations`：冻结和结算。
- `billing_orders`：购买积分来源。
- `audit_events`：所有人工操作审计。

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/users` | 用户与积分列表。 |
| `GET` | `/api/admin/users/:id` | 用户详情。 |
| `PATCH` | `/api/admin/users/:id/profile` | 修改资料。 |
| `PATCH` | `/api/admin/users/:id/status` | 禁用、启用、归档。 |
| `POST` | `/api/admin/users/:id/credits/grant` | 手动添加积分。 |
| `POST` | `/api/admin/users/:id/credits/deduct` | 手动扣减积分。 |
| `GET` | `/api/admin/users/:id/credits/ledger` | 积分流水。 |
| `GET` | `/api/admin/users/:id/subaccounts` | 查看子账户。 |
| `POST` | `/api/admin/users/:id/contact/reveal` | 查看完整手机号/邮箱，必须填写原因、校验 `user.write` 权限并写敏感审计。 |
| `GET` | `/api/admin/team-permission-accounts` | 团队权限账户列表。 |

手动积分调整规则：

- 必填原因和独立工单号，工单号格式为 `CS-20260605-001` 这类 `字母前缀-日期-序号`。
- 使用幂等键防止重复提交。
- 更新余额必须通过积分账本服务，禁止直接改缓存余额。
- 写入 `credit_ledger_entries`、`team_credit_adjustments` 和 `audit_events`；工单号必须进入账本与审计 `metadata_json.workOrderNo`，不能只拼在原因文本里。

### 6. 风控与审计

复现 `05-risk-audit.png`。

前端能力：

- 支付风险列表：待处理、已通过、已拒绝、已修复。
- 任务异常列表：失败任务、待人工复核、可重试任务。
- 审计日志：管理员、动作、对象、结果、时间、IP、User-Agent。
- 支持人工复核、重试任务、修复已支付未发积分、备注处理结论。

数据库复用：

- `payment_risk_events`
- `billing_orders`
- `payment_intents`
- `payment_provider_events`
- `tasks`
- `provider_requests`
- `audit_events`

已有模块复用：

- `apps/backend/src/modules/admin-ops/admin-ops.service.ts`
- `credit-billing` 积分结算能力。
- `model-gateway` 任务重试和 outbox 能力。

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/risks` | 风险事件列表。 |
| `POST` | `/api/admin/risks/:id/review` | 风险复核。 |
| `GET` | `/api/admin/audit-events` | 审计日志。 |
| `POST` | `/api/admin/ops/tasks/:id/retry` | 重试任务。 |
| `POST` | `/api/admin/ops/payments/:id/repair-credit` | 修复支付未发积分。 |

### 7. 系统设置

复现 `06-system-unified.png`。

前端能力：

- 查看环境变量配置状态：已配置、缺失、仅启动项、密钥项。
- 添加和修改运行配置：站点开关、注册开关、默认积分策略、风控阈值、上传限制、任务超时。
- 添加相关权限账户：后台管理员、运营、财务、客服、只读审计。
- 管理密钥引用：只填写引用名和用途，不展示明文。
- 查看配置修订历史和回滚。

数据库新增：

```sql
runtime_config_entries
runtime_config_revisions
admin_secret_references
admin_accounts
admin_account_roles
admin_auth_sessions
```

环境变量保留范围：

| 类型 | 示例 | 是否进入数据库 |
| --- | --- | --- |
| 启动依赖 | `DATABASE_URL`, `PORT`, `REDIS_URL` | 否，只显示状态。 |
| 真实密钥 | `OPENAI_API_KEY`, `VOLCENGINE_ARK_API_KEY` | 否，只保存引用名。 |
| 业务开关 | 注册开关、默认额度、上传限制 | 是，写 `runtime_config_entries`。 |
| 模型配置 | endpoint、协议、参数、计费、调度 | 是，写 `ai_model_configs` 相关表。 |

接口：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/settings` | 系统设置列表。 |
| `PATCH` | `/api/admin/settings/:key` | 修改运行配置。 |
| `GET` | `/api/admin/settings/revisions` | 配置修订历史。 |
| `POST` | `/api/admin/settings/:key/rollback` | 回滚配置。 |
| `GET` | `/api/admin/secret-references` | 密钥引用状态。 |
| `POST` | `/api/admin/secret-references` | 新增密钥引用说明。 |
| `POST` | `/api/admin/secret-references/:id/probe` | 探测密钥引用对应环境变量是否存在，只更新状态和检查时间，不读取或返回明文密钥。 |
| `GET` | `/api/admin/admin-accounts` | 后台权限账户。 |
| `POST` | `/api/admin/admin-accounts` | 添加后台权限账户。 |
| `PATCH` | `/api/admin/admin-accounts/:id` | 修改角色、状态、备注。 |
| `POST` | `/api/admin/admin-accounts/:id/password` | 重置后台权限账户密码，撤销该账号已有后台会话并写审计。 |

### 8. 管理员账户菜单

复现 `07-account-menu.png`。

前端能力：

- 展示当前管理员、角色、最近登录、当前会话。
- 修改密码。
- 退出登录。
- 查看个人操作审计入口。

后端能力：

- 修改密码时校验旧密码。
- 密码变更后可选择失效其他 session。
- 退出登录写审计。

## 权限模型

后台必须使用独立权限，不直接复用前台创作权限。

推荐角色：

| 角色 | 能力 |
| --- | --- |
| `super_admin` | 全部后台能力，包括管理员账户和系统设置。 |
| `ops_admin` | 运营总览、模型查看、用户处理、任务重试。 |
| `model_admin` | 模型配置、参数、计费、调度。 |
| `finance_admin` | 订单、积分调整、支付风险修复。 |
| `support_admin` | 用户查看、资料修改、有限积分处理。 |
| `audit_viewer` | 只读审计和风险查看。 |

每个接口都必须校验权限，并在成功或失败的敏感操作中写入 `audit_events`。

## 数据库落地

### 复用现有表

| 表 | 用途 |
| --- | --- |
| `ai_model_configs` | 模型基础、参数、供应商、计费、展示配置。 |
| `ai_model_dispatch_policies` | 模型调度、限流、轮询、重试、熔断。 |
| `users` | 用户身份和状态。 |
| `organizations` / `workspaces` / `memberships` | 组织空间和成员权限。 |
| `team_member_groups` / `team_member_profiles` | 团队权限账户和子账户。 |
| `team_credit_adjustments` | 团队积分人工调整事实。 |
| `credit_ledger_entries` | 积分增减流水。 |
| `credit_reservations` / `credit_reservation_allocations` | 冻结和结算。 |
| `billing_orders` | 积分购买订单。 |
| `payment_risk_events` | 支付风险事件。 |
| `audit_events` | 后台操作审计。 |
| `storage_objects` | 任务产物和上传对象引用。 |

### 新增表建议

```sql
CREATE TABLE admin_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NULL REFERENCES users(id),
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_account_roles (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
  role_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_account_id, role_code)
);

CREATE TABLE admin_auth_sessions (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
  session_token_hash text NOT NULL UNIQUE,
  ip_address text NULL,
  user_agent text NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runtime_config_entries (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  value_type text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  description text NULL,
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE runtime_config_revisions (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  previous_value_json jsonb NULL,
  next_value_json jsonb NOT NULL,
  changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_secret_references (
  id uuid PRIMARY KEY,
  secret_ref text NOT NULL UNIQUE,
  env_name text NOT NULL UNIQUE,
  purpose text NOT NULL,
  provider_name text NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_model_config_revisions (
  id uuid PRIMARY KEY,
  model_config_id uuid NOT NULL REFERENCES ai_model_configs(id),
  snapshot_json jsonb NOT NULL,
  changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

说明：

- `admin_accounts` 可以关联 `users`，也可以独立创建后台账号。第一版建议独立表，避免后台权限污染前台用户权限。
- `runtime_config_entries` 只保存非密钥业务配置。
- `admin_secret_references` 保存密钥引用和检测状态，不保存明文密钥。
- `ai_model_config_revisions` 在每次模型发布、保存或回滚时记录快照。

## 前后端隔离规则

- 后台前端只从 `apps/admin` 构建和发布。
- 前台创作端仍从 `apps/web` 构建和发布。
- 后台 URL 使用 `/admin` 或独立域名，例如 `admin.example.com`。
- 后台 API 统一使用 `/api/admin/**`，前台 API 不直接开放后台管理能力。
- 后台 session cookie 名称独立，例如 `admin_session`。
- 后台鉴权中间件独立，不复用前台创作 session。
- 后台页面不得 import `apps/web` 页面、组件或路由。
- 公共纯工具可抽到 `packages/*`，但不能让前台依赖后台模块。

## 开发前完整性补充

当前规划已经能覆盖最终图片中的主要页面和业务能力。为了下一步真实开发时可以直接拆任务，还需要把页面路由、页面状态、弹窗、接口契约、迁移顺序和审计事件固定下来。本节为开发硬要求，不是可选优化。

### 后台路由表

`apps/admin` 第一版必须按下列路由实现，路由守卫统一检查 `admin_session`：

| 路由 | 页面 | 来源图片 | 权限 |
| --- | --- | --- | --- |
| `/admin/login` | 后台登录 | `00-login.png` | 未登录可访问 |
| `/admin/dashboard` | 运营总览 | `01-ops-overview.png` | `dashboard.read` |
| `/admin/models` | 模型配置列表 | `02-models.png` | `model.read` |
| `/admin/models/new` | 新增模型 | `03-model-integration-workbench.png` | `model.write` |
| `/admin/models/:id` | 模型接入工作台 | `03-model-integration-workbench.png` | `model.read` |
| `/admin/users` | 用户与积分列表 | `04-users-credits.png` | `user.read` |
| `/admin/users/:id` | 用户详情抽屉或详情页 | `04-users-credits.png` | `user.read` |
| `/admin/risks` | 风控与审计 | `05-risk-audit.png` | `risk.read` |
| `/admin/audit-events` | 审计日志 | `05-risk-audit.png` | `audit.read` |
| `/admin/settings` | 系统设置 | `06-system-unified.png` | `settings.read` |
| `/admin/admin-accounts` | 后台权限账户 | `06-system-unified.png` | `admin_account.read` |
| `/admin/account` | 当前管理员账户 | `07-account-menu.png` | 已登录 |

未登录访问后台任意页面跳转 `/admin/login`。已登录访问 `/admin/login` 跳转 `/admin/dashboard`。无权限页面展示 403 状态，不隐藏导航，但禁用不可用操作。

当前前端壳已实现 `bootstrapAdminLoginRoute`：访问 `/admin/login` 时会先请求 `/api/admin/auth/me`，已有 `admin_session` 则加载后台数据并 `history.replaceState` 到 `/admin/dashboard`；无会话才显示登录表单。登录表单提交时统一调用 `setSubmitting(..., "正在登录")`，认证请求未完成前禁用提交按钮；失败或账号锁定时恢复按钮并把错误写回登录卡片。

### 页面状态和弹窗

每个页面必须实现空状态、加载中、错误、无权限、提交中、保存成功、保存失败。不能只实现有数据的静态态。

当前前端壳已增加 `loadingPages`、`forbiddenPages`、`renderPageState`：首屏校验登录态和各页面数据加载会显示“正在加载后台数据”，接口返回 `admin_forbidden` 或 403 时会渲染“无权限访问该页面”。写操作已增加 `runAdminMutation`、`setSubmitting` 和 `showToast`；用户资料/状态、积分加减、风险/任务/支付处理、系统配置/密钥、管理员账号、模型发布/回滚/复制和改密等敏感写抽屉提交时都会禁用按钮并显示“正在提交”，成功后统一展示“操作成功”类提示，失败继续回填原抽屉错误位。登录认证也纳入同一提交态规则，提交按钮必须显示“正在登录”，不能出现重复点击导致的并发登录请求。

| 页面 | 必须有的弹窗或抽屉 |
| --- | --- |
| 登录 | 登录中提交态、登录失败提示、账号锁定提示、账号禁用提示、密码错误提示、session 过期提示。 |
| 运营总览 | 异常任务详情、风险事件快捷处理、模型健康详情。 |
| 模型列表 | 新建模型、复制模型确认、禁用确认、归档确认。 |
| 模型工作台 | 参数新增/编辑弹窗、枚举选项编辑、价格规则编辑、JSON 校验错误、上线检查结果、发布确认、回滚确认。 |
| 用户积分 | 查看账户详情、修改资料、手动加积分、扣减积分、查看流水、查看子账户、禁用/启用确认、归档确认。 |
| 风控审计 | 风险复核、任务重试、支付未发积分修复、审计详情。 |
| 系统设置 | 新增运行配置、修改配置、回滚配置、新增密钥引用、新增权限账户、重置管理员密码、禁用管理员。 |
| 账户菜单 | 修改密码、失效其他会话、退出登录确认。 |

危险操作必须二次确认并填写原因，原因写入 `audit_events`。

### 统一接口契约

所有 `/api/admin/**` 接口统一使用 JSON，列表接口统一支持 `page`、`pageSize`、`keyword`、`sort`、`direction`。响应结构：

```json
{
  "data": {},
  "meta": {
    "requestId": "req_xxx"
  }
}
```

分页响应结构：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "requestId": "req_xxx"
  }
}
```

错误响应结构：

```json
{
  "error": {
    "code": "admin_forbidden",
    "message": "无权限执行该操作",
    "details": {}
  },
  "meta": {
    "requestId": "req_xxx"
  }
}
```

敏感操作必须要求 `Idempotency-Key`：

- 模型发布、复制、回滚、禁用、归档。
- 手动加积分、扣减积分。
- 风险复核、任务重试、支付修复。
- 系统配置修改、回滚。
- 后台权限账户新增、禁用、重置密码。
- 当前管理员修改自己的密码。

### 管理员初始化

第一版需要提供一个后台管理员初始化方式，否则登录页无法真实进入后台。

推荐方案：

- 新增只在本地或部署初始化时运行的脚本：`scripts/bootstrap-admin-account.mjs`。
- 通过 `npm run admin:bootstrap` 执行，脚本读取 `.env` 或运行环境中的 `ADMIN_LOGIN_NAME`、`ADMIN_PASSWORD`、`ADMIN_DISPLAY_NAME`、`ADMIN_ROLES`；未配置时默认创建后台账号 `admin`，初始密码 `admin123`，显示名 `后台管理员`，角色 `super_admin`。
- 首次执行创建第一位 `super_admin`；同一 `loginName` 再次执行会更新显示名、状态、角色并轮换密码。
- 密码只用于初始化，不写入文档、不写入日志、不写入数据库明文。
- 初始化和更新均写入 `audit_events`：`admin.account.bootstrapped` 或 `admin.account.bootstrap_updated`。
- 初始化完成后应删除或轮换 bootstrap 环境变量，禁止提交真实密码。

### 模型配置发布流

模型工作台不能简单保存后立即影响前台任务。为了避免错误配置导致生成失败，模型配置采用草稿、检查、发布三段：

| 状态 | 含义 |
| --- | --- |
| `draft` | 后台可编辑，前台不可见。 |
| `active` | 已发布，前台模型目录和生成任务可使用。 |
| `disabled` | 暂停使用，历史任务仍可查看。 |
| `archived` | 归档隐藏，不允许新任务。 |

当前 `ai_model_configs.status` 已支持 `active`、`disabled`、`archived`。如第一版不改 check constraint，草稿可以放在 `ui_config_json.publishState = "draft"`；如果要让数据库显式约束，则迁移中把 `status` 增加 `draft`。

发布前必须通过：

- JSON schema 校验。
- 参数默认值与参数 schema 匹配。
- 计费规则能计算出每个任务模式的价格。
- `apiKeyEnv` 存在且不是明文 key。
- endpoint 格式合法。
- 调度策略存在。
- 至少一个任务模式可用。

发布动作写入 `ai_model_config_revisions`，并写入 `audit_events`。

### 后端模块落点

真实开发时按下面文件落点实施，避免把后台逻辑继续塞进单一入口文件：

```text
apps/backend/src/modules/admin-auth/
  admin-auth.service.ts
  admin-auth-http.handlers.ts
  admin-password.service.ts
  admin-session.service.ts
  tests/

apps/backend/src/modules/admin-dashboard/
  admin-dashboard.service.ts
  admin-dashboard-http.handlers.ts
  tests/

apps/backend/src/modules/admin-models/
  admin-model-config.service.ts
  admin-model-config.store.ts
  admin-model-validation.service.ts
  admin-model-http.handlers.ts
  tests/

apps/backend/src/modules/admin-users/
  admin-user.service.ts
  admin-credit-adjustment.service.ts
  admin-user-http.handlers.ts
  tests/

apps/backend/src/modules/admin-risk-audit/
  admin-risk.service.ts
  admin-audit-query.service.ts
  admin-risk-audit-http.handlers.ts
  tests/

apps/backend/src/modules/admin-system-settings/
  runtime-config.service.ts
  secret-reference.service.ts
  admin-account.service.ts
  admin-system-settings-http.handlers.ts
  tests/
```

HTTP 路由可以先接入现有 `phone-auth-dev-server.ts` 的服务启动流程，但业务逻辑必须留在上述模块内。后续如果拆独立 server，不需要搬业务代码。

### 数据库迁移顺序

新增迁移已按一个文件落地：`packages/db/migrations/0010_admin_management_platform.sql`，顺序如下：

1. `admin_accounts`
2. `admin_account_roles`
3. `admin_auth_sessions`
4. `runtime_config_entries`
5. `runtime_config_revisions`
6. `admin_secret_references`
7. `ai_model_config_revisions`
8. 必要索引和 check 约束
9. 可选 seed：只创建默认角色定义，不创建默认明文密码账号

推荐索引：

- `admin_accounts(status, login_name)`
- `admin_account_roles(admin_account_id, role_code)`
- `admin_auth_sessions(admin_account_id, expires_at, revoked_at)`
- `runtime_config_revisions(config_key, created_at DESC)`
- `admin_secret_references(env_name, status)`
- `ai_model_config_revisions(model_config_id, created_at DESC)`

### 审计事件类型

下列事件类型必须写入 `audit_events`：

| 事件 | 触发 |
| --- | --- |
| `admin.auth.login_succeeded` | 管理员登录成功。 |
| `admin.auth.login_failed` | 管理员登录失败。 |
| `admin.auth.logout` | 退出登录。 |
| `admin.auth.profile_updated` | 修改当前管理员资料。 |
| `admin.auth.password_changed` | 修改密码。 |
| `admin.model.created` | 新增模型。 |
| `admin.model.updated` | 修改模型。 |
| `admin.model.published` | 发布模型。 |
| `admin.model.status_changed` | 禁用、启用、归档模型。 |
| `admin.user.profile_updated` | 修改用户资料。 |
| `admin.user.status_changed` | 禁用、启用、归档用户。 |
| `admin.credit.granted` | 手动添加积分。 |
| `admin.credit.deducted` | 手动扣减积分。 |
| `admin.risk.reviewed` | 风险复核。 |
| `admin.ops.task_retried` | 后台重试任务。 |
| `admin.ops.payment_credit_repaired` | 修复支付未发积分。 |
| `admin.settings.updated` | 修改系统配置。 |
| `admin.settings.rolled_back` | 回滚系统配置。 |
| `admin.account.created` | 新增后台权限账户。 |
| `admin.account.status_changed` | 禁用或启用后台权限账户。 |

审计 payload 至少包含：`adminAccountId`、`targetType`、`targetId`、`reason`、`before`、`after`、`ipAddress`、`userAgent`、`requestId`。敏感字段在 `before` 和 `after` 中脱敏。

### 复现图片的验收矩阵

开发完成后按下列矩阵验收，缺一项视为页面未完整复现：

| 图片 | 前端验收 | 后端验收 | 数据库验收 |
| --- | --- | --- | --- |
| `00-login.png` | 单一登录卡片、无黑色侧栏、失败态完整。 | 登录、退出、me、改密可用。 | `admin_accounts`、`admin_auth_sessions`、登录审计落库。 |
| `01-ops-overview.png` | 指标、健康、异常、快捷入口完整。 | 聚合任务、积分、订单、模型健康。 | 查询现有任务、积分、支付、审计表。 |
| `02-models.png` | 表格不超出，操作列固定。 | 模型 CRUD、复制、状态变更。 | `ai_model_configs`、`ai_model_dispatch_policies`、revision 落库。 |
| `03-model-integration-workbench.png` | 参数、参考素材、计费、映射、调度、上线检查完整。 | 校验、保存草稿、发布、回滚。 | JSON 字段、调度表、revision、审计落库。 |
| `04-users-credits.png` | 用户操作、团队权限、子账户、积分弹窗完整。 | 用户查询、资料修改、加减积分、禁用归档。 | 用户、团队、积分账本、审计落库。 |
| `05-risk-audit.png` | 风险列表、审计列表、复核弹窗完整。 | 风险复核、任务重试、支付修复。 | 风险、任务、支付、审计表更新。 |
| `06-system-unified.png` | 设置、密钥引用、权限账户完整。 | 配置修改、回滚、账户管理。 | runtime config、secret refs、admin accounts 落库。 |
| `07-account-menu.png` | 菜单、改密、退出完整。 | 改密、退出、会话失效。 | session 和审计更新。 |

### 不能遗漏的安全要求

- 后台 cookie 使用 `HttpOnly`、`SameSite=Lax`，生产环境必须 `Secure`。
- 所有后台写接口检查 CSRF 或同源策略；如果采用 Bearer token，也必须避免落入 localStorage。
- 密码使用强哈希，例如 `scrypt`、`argon2` 或同等级算法，禁止明文或普通 hash。
- 明文密钥不能进入 DB、接口响应、日志、审计 payload。
- 查看完整手机号、邮箱、密钥状态等敏感信息需要权限，并写审计。
- 删除用户和模型第一版统一做软删除或归档，不做物理删除。
- 后台列表导出必须单独做权限、字段白名单和审计；已接入的风控/审计 CSV 导出只授予 `super_admin`，不得在前端拼接假导出。

## 开发前最终核对与补齐

本节用于回答“是否能按文档复现页面、功能是否完整、是否有遗漏”。结论：最终图片中的页面结构、关键后台 API、权限校验、审计和数据库落点已经具备第一版开发闭环；真实开发时仍需按下面清单继续增强页面状态、发布流程和更细的业务校验，不能只实现静态样式。

### 当前仓库已具备的基础

| 能力 | 当前落点 | 状态 |
| --- | --- | --- |
| 后台静态入口 | `apps/admin/index.html`，由 `/admin/*` 服务 | 已有壳，后续需组件化。 |
| 后台登录态 | `admin_accounts`、`admin_auth_sessions`、`admin_session` cookie | 已支持登录、退出、`me`、当前管理员改密和权限点返回。 |
| 模型管理 | `admin-models/admin-model-config.service.ts` | 已支持列表、详情、新增、更新、复制、启用/禁用。 |
| 用户积分读取 | `admin-users/admin-user.service.ts` | 已支持用户列表、独立团队权限账户接口、子账户、带工单号的积分流水和脱敏联系方式；页面已接入团队权限账户摘要。 |
| 用户写流 | `profile`、`status`、`credits/grant`、`credits/deduct`、`contact/reveal` | 已支持资料修改、禁用/启用、加减积分、查看完整联系方式；敏感操作写审计。 |
| 系统配置写入 | `runtime_config_entries`、`runtime_config_revisions` | 已支持读写、修订历史和回滚。 |
| 密钥引用 | `admin_secret_references` | 已有引用管理和可用性探测，只保存引用名、环境变量名、状态和检查时间，不保存明文。 |
| 权限账户管理 | `admin_accounts`、`admin_account_roles` | 已支持创建、修改角色/状态、重置密码。 |
| 风控审计 | `admin-risk-audit`、`admin-ops` | 已支持风险/审计查询、风险复核、任务重试、支付未发积分修复。 |
| 运营总览 | `admin-dashboard` | 已支持 overview、模型健康、最近事件聚合；`/api/admin/dashboard/model-health` 和 `/api/admin/dashboard/recent-events` 已可独立刷新。 |

### 后续仍需增强的缺口

| 页面 | 缺口 | 必须补齐 |
| --- | --- | --- |
| `00-login.png` 登录 | 失败次数锁定策略、账号禁用文案可继续细化。 | 固化登录失败计数、锁定时长和前端分态提示。 |
| `01-ops-overview.png` 运营总览 | 当前已能聚合核心指标、模型健康、最近事件，并支持模型健康和最近事件独立接口局部刷新；最近事件已返回 `metadata` 并可在结构化抽屉中查看目标对象、关联页面和跳转处理入口；模型健康已支持结构化详情抽屉，可查看队列名称、积压任务、失败任务，并跳转模型配置或风控审计。 | 后续增加趋势图和更细的快捷处理后局部刷新。 |
| `02-models.png` 模型列表 | 已有模型写流、归档状态、服务端筛选分页、复制、状态变更和修订快照入口。 | 后续只需截图验收 1366px 下操作列固定可见，并按实际数据量优化筛选体验。 |
| `03-model-integration-workbench.png` 模型工作台 | 参数/定价可保存，参数编辑器已支持手动添加参数键、中文标签、类型、必填和选项，并合并到 `parameter_schema_json`；JSON 高级编辑入口仍保留。修订历史和回滚已接入；发布前检查已支持前端本地阻断和后端最终阻断，失败项会在发布抽屉中展示；`apiKeyEnv`、创建 endpoint、异步轮询 `queryTaskEndpoint`、参数、定价和调度都会阻断发布。 | 后续只需按业务需要增加真实 provider 健康探测，并截图验收上线检查区域不被遮挡。 |
| `04-users-credits.png` 用户积分 | 已有详情抽屉、流水、独立团队权限账户摘要、子账户、加减积分、独立工单号校验、敏感联系方式查看、禁用/启用和软归档；归档已要求二次确认，物理删除第一版不做。 | 后续只需按业务需要增加批量操作防误触，第一版单用户操作闭环已具备。 |
| `05-risk-audit.png` 风控审计 | 已有风险/审计 DTO、处理接口、风险状态筛选、审计详情抽屉和真实 CSV 导出；详情已按审计主体、目标对象、请求上下文和 metadata 分组展示。 | 导出使用独立 `risk.export` 权限，服务端仅导出展示字段，不导出 `metadata_json` 等敏感上下文，并写入 `admin.export.created` 审计记录。 |
| `06-system-unified.png` 系统设置 | 已接入真实数据、回滚、权限账户修改、重置密码、运行配置值类型 schema 校验、密钥可用性探测和管理员操作二次确认。 | 后续只需截图验收系统设置表格和抽屉在 1366px 下不遮挡关键操作。 |
| `07-account-menu.png` 账户菜单 | 改密、退出、会话列表和“退出其他会话”已接入后台接口。 | 后续只需在截图验收中确认会话表格在 1366px 下不遮挡操作。 |

### 首版开发验收门槛

下一步进入真实开发时，下面项目不再视为“后续优化”，而是首版后台完成前必须验收通过的门槛：

| 类别 | 必须做到 | 验收方式 |
| --- | --- | --- |
| 页面复现 | `00-login.png` 到 `07-account-menu.png` 全部页面都必须能从 `/admin/*` 路由访问或通过页面内操作打开对应抽屉/菜单；`99-merged-contact-sheet.png` 只作为总览对齐图，不作为单独路由。 | 逐页截图，对照最终图检查中文文案、蓝灰主题、表格密度、抽屉、按钮和菜单。 |
| 操作不遮挡 | 模型列表、模型工作台、用户积分、风控审计、系统设置、账户会话列表在 1366px 宽度下操作列必须可见；窄屏允许横向滚动，但不能把操作按钮挤出不可达区域。 | 使用浏览器截图和交互快照验证 `actions` 列、保存按钮、发布按钮、二次确认按钮可见可点击。 |
| 数据闭环 | 页面中所有写操作必须调用 `/api/admin/**`，并落入对应数据库表；禁止用前端静态数据模拟“已保存”。 | HTTP 测试检查响应和数据库记录，包括 revision、ledger、audit。 |
| 状态闭环 | 每个页面必须实现加载中、空状态、错误、无权限、提交中、成功、失败；按钮无权限时保留入口但禁用并显示权限点。 | 前端测试检查状态文案和 `data-required-permission`，手工截图覆盖至少一个错误/无权限态。 |
| 审计闭环 | 敏感操作必须要求原因；模型发布/回滚、用户资料/状态/积分、联系方式查看、风险复核、任务重试、支付修复、系统配置、密钥探测、管理员账号变更都必须写 `audit_events`。 | 后端测试按操作查询 `audit_events`，确认 `targetType`、`targetId`、`reason`、`metadata` 完整。 |
| 幂等闭环 | 积分加减、模型写流、回滚、风险复核、任务重试、支付修复、系统配置、管理员账号写操作、当前管理员资料修改、当前管理员修改密码、退出其他会话必须使用 `Idempotency-Key`；重复请求不能重复写事实。 | HTTP 测试重复提交同一 key，确认账本、revision、audit、资料修改事件、密码变更事件和会话撤销事件不重复产生错误结果。 |
| 前后台隔离 | 后台目录只能在 `apps/admin`，后台 API 只能走 `/api/admin/**`，后台 cookie 只能使用 `admin_session`；不得 import `apps/web`。 | `rg` 检查 import 和路由；登录前台不会登录后台，退出后台不影响前台会话。 |
| 密钥安全 | 页面、接口响应、日志、审计和数据库只能保存密钥引用名、环境变量名、状态和探测时间；不得保存或展示明文密钥。 | 搜索数据库写入字段和接口响应，密钥探测只返回 `configured/missing/unknown`。 |

### 真实开发前需补强的明确项

下面是当前文档和实现对照后发现的细化点，开发时应优先补齐：

1. 运营总览最近事件和模型健康均已接入结构化详情抽屉和关联页面跳转；后续可继续补趋势图和更细的快捷处理结果局部刷新。
2. 运营总览的局部刷新必须保持在对应卡片内，刷新模型健康不能重载整页，刷新最近事件不能清空其他区域。
3. 模型工作台发布检查已校验 `providerConfig.queryTaskEndpoint`：当 `invocationMode = async_polling` 时，前端发布抽屉和后端最终检查都会阻断缺失或非法轮询端点。
4. 模型参数编辑器已支持手动添加参数和选项，并会合并到参数 schema；JSON textarea 继续作为高级编辑入口。
5. 用户列表第一版按单用户操作闭环交付；批量积分按钮只能打开防误触说明或禁用，不能假装批量写入已经可用。
6. 用户“删除”在首版统一实现为软归档，文案必须写清“归档账户”，不能给用户造成物理删除已完成的错觉。
7. 风控和审计导出必须走真实服务端 CSV 接口，使用独立 `risk.export` 权限、服务端字段白名单、导出审计记录和敏感字段脱敏策略，不能在前端生成假文件。
8. 系统设置的环境变量页只展示配置状态；启动依赖如 `DATABASE_URL`、`REDIS_URL` 不能从后台编辑。
9. 账户菜单必须包含修改密码、当前管理员资料、会话列表、退出其他会话、退出登录，并验证修改密码后旧密码不可再用。
10. 真实开发完成前必须至少跑一次后台截图验收，覆盖 1366px、1440px、1920px 和移动窄屏。

### 页面 DTO 固定

后台前端不得直接依赖数据库字段名拼页面，所有页面通过下列 DTO 渲染。数据库字段可演进，但 DTO 保持稳定。

#### 运营总览 DTO

```json
{
  "metrics": {
    "generationCountToday": 0,
    "generationSuccessRate": 0.98,
    "creditsConsumedToday": 0,
    "paidOrdersToday": 0,
    "riskPendingCount": 0,
    "failedTaskCount": 0
  },
  "modelHealth": [
    {
      "modelCode": "seedance-i2v-pro",
      "displayName": "Seedance 图生视频",
      "status": "active",
      "queueDepth": 0,
      "successRate24h": 0.97,
      "avgLatencyMs": 0,
      "lastError": null
    }
  ],
  "recentEvents": [
    {
      "id": "evt_xxx",
      "type": "admin.credit.granted",
      "severity": "info",
      "title": "手动添加积分",
      "createdAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

#### 模型列表 DTO

```json
{
  "id": "uuid",
  "modelCode": "seedance-i2v-pro",
  "displayName": "Seedance 图生视频",
  "providerName": "volcengine",
  "providerProtocol": "volcengine_ark_video",
  "mediaType": "video",
  "invocationMode": "async_polling",
  "taskModes": ["video.image_to_video"],
  "status": "active",
  "priceSummary": "140 积分起",
  "dispatchSummary": "submit: generation-submit-video / poll: generation-poll-video",
  "updatedAt": "2026-06-04T00:00:00.000Z"
}
```

#### 模型工作台保存 DTO

```json
{
  "basic": {
    "modelCode": "seedance-i2v-pro",
    "displayName": "Seedance 图生视频",
    "providerName": "volcengine",
    "providerModel": "doubao-seedance-2-0-pro",
    "providerProtocol": "volcengine_ark_video",
    "mediaType": "video",
    "invocationMode": "async_polling",
    "status": "disabled",
    "sortOrder": 100
  },
  "taskModes": ["video.text_to_video", "video.image_to_video"],
  "parameterSchema": {},
  "defaultParams": {},
  "capabilities": {},
  "limits": {},
  "pricing": {},
  "providerConfig": {
    "baseURL": "https://ark.cn-beijing.volces.com",
    "createTaskEndpoint": "/api/v3/contents/generations/tasks",
    "queryTaskEndpoint": "/api/v3/contents/generations/tasks/{taskId}",
    "apiKeyEnv": "VOLCENGINE_ARK_API_KEY",
    "requestFormat": "json"
  },
  "dispatchPolicy": {
    "submitQueueName": "generation-submit-video",
    "pollQueueName": "generation-poll-video",
    "submitConcurrency": 2,
    "pollConcurrency": 4,
    "pollIntervalMs": 5000,
    "maxAttempts": 3
  },
  "reason": "新增视频模型接入"
}
```

#### 用户与积分 DTO

```json
{
  "userId": "uuid",
  "displayName": "分镜组长",
  "phone": "+86138****8001",
  "email": "gr***@example.test",
  "status": "active",
  "accountType": "team_permission_account",
  "teamRole": "group_admin",
  "organizationId": "uuid",
  "organizationName": "默认组织",
  "workspaceId": "uuid",
  "availableCredits": 2100,
  "reservedCredits": 40,
  "memberAvailableCredits": 800,
  "subaccountCount": 3,
  "lastLoginAt": null,
  "createdAt": "2026-06-04T00:00:00.000Z"
}
```

查看完整联系方式响应：

```json
{
  "userId": "uuid",
  "contact": {
    "phone": "+8613800200001",
    "email": "owner@example.test"
  }
}
```

该接口只允许具备 `user.write` 的后台管理员调用，前端必须要求填写查看原因；后端写入 `admin.user.contact_revealed` 审计事件，审计 metadata 只保存脱敏联系方式。

#### 风控与审计 DTO

```json
{
  "risks": [
    {
      "id": "risk_xxx",
      "riskType": "paid_without_credit",
      "severity": "high",
      "status": "open",
      "orderId": "uuid",
      "userDisplayName": "用户",
      "amountCents": 9900,
      "createdAt": "2026-06-04T00:00:00.000Z"
    }
  ],
  "taskExceptions": [
    {
      "id": "task_xxx",
      "workflowId": "workflow_xxx",
      "projectId": "project_xxx",
      "taskType": "generate_shot_image",
      "status": "failed",
      "queueName": "generation-submit-image",
      "failureCode": "provider_timeout",
      "providerName": "volcengine",
      "providerOperation": "create_task",
      "providerStatus": "failed",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  ],
  "paymentIssues": [
    {
      "issueType": "paid_without_credit",
      "orderId": "uuid",
      "orderNo": "ORD-20260604-001",
      "status": "open",
      "credits": 120,
      "amountMinor": 9900,
      "currency": "CNY",
      "paidAt": "2026-06-04T00:00:00.000Z",
      "successfulPaymentIntentId": "uuid"
    }
  ],
  "auditEvents": [
    {
      "id": "audit_xxx",
      "eventType": "admin.settings.updated",
      "adminDisplayName": "总后台管理员",
      "targetType": "runtime_config",
      "targetId": "registration.enabled",
      "result": "success",
      "ipAddress": "127.0.0.1",
      "createdAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

#### 系统设置 DTO

```json
{
  "configs": [
    {
      "key": "registration.enabled",
      "value": true,
      "valueType": "boolean",
      "scope": "creator",
      "description": "是否允许新用户注册",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  ],
  "secretReferences": [
    {
      "id": "uuid",
      "secretRef": "volcengine_ark_primary",
      "envName": "VOLCENGINE_ARK_API_KEY",
      "purpose": "火山视频模型调用",
      "providerName": "volcengine",
      "status": "configured"
    }
  ],
  "adminAccounts": [
    {
      "id": "uuid",
      "loginName": "admin",
      "displayName": "总后台管理员",
      "roles": ["super_admin"],
      "status": "active",
      "actions": ["edit", "reset_password", "disable"],
      "createdAt": "2026-06-04T00:00:00.000Z"
    }
  ]
}
```

### 权限点固定

角色是展示和初始化用的集合，接口实际校验权限点。第一版按下列权限点实现：

| 权限点 | 用途 | 默认角色 |
| --- | --- | --- |
| `dashboard.read` | 读取运营总览 | `super_admin`, `ops_admin`, `audit_viewer` |
| `model.read` | 查看模型列表和详情 | `super_admin`, `ops_admin`, `model_admin`, `audit_viewer` |
| `model.write` | 新建、编辑、复制模型 | `super_admin`, `model_admin` |
| `model.publish` | 发布、回滚、禁用、归档模型 | `super_admin`, `model_admin` |
| `user.read` | 查看用户、团队权限账户、子账户 | `super_admin`, `ops_admin`, `support_admin`, `finance_admin` |
| `user.write` | 修改用户资料、禁用、归档 | `super_admin`, `support_admin` |
| `credit.adjust` | 手动加减积分 | `super_admin`, `finance_admin`, `support_admin` |
| `risk.read` | 查看支付风险、任务异常 | `super_admin`, `ops_admin`, `finance_admin`, `audit_viewer` |
| `risk.review` | 复核风险、修复支付积分 | `super_admin`, `finance_admin` |
| `risk.export` | 风险和审计 CSV 导出；服务端字段白名单、审计留痕、敏感 metadata 不导出 | `super_admin` |
| `ops.task.retry` | 重试任务和人工结算 | `super_admin`, `ops_admin` |
| `audit.read` | 查看审计日志 | `super_admin`, `audit_viewer` |
| `settings.read` | 查看系统配置和密钥引用 | `super_admin`, `ops_admin`, `audit_viewer` |
| `settings.write` | 修改运行配置、密钥引用、回滚 | `super_admin` |
| `admin_account.read` | 查看后台权限账户 | `super_admin` |
| `admin_account.write` | 新增、禁用、重置后台权限账户 | `super_admin` |
| `account.password` | 当前管理员修改自己的密码 | 所有已登录管理员 |

无权限时接口返回 `admin_forbidden`，页面保留入口但禁用按钮并展示 403 状态。敏感字段查看、积分调整、模型发布、系统配置变更必须写审计。

当前实现已把敏感写接口接入统一后台 guard，并通过 HTTP 测试验证错误角色返回 `admin_forbidden`：

- `model.write`：`POST /api/admin/models`、`PATCH /api/admin/models/:id`、`POST /api/admin/models/:id/duplicate`。
- `model.publish`：`PATCH /api/admin/models/:id/status`。
- `user.write`：`PATCH /api/admin/users/:id/profile`、`PATCH /api/admin/users/:id/status`。
- `credit.adjust`：`POST /api/admin/users/:id/credits/grant`、`POST /api/admin/users/:id/credits/deduct`。
- `risk.review`：`POST /api/admin/risks/:id/review`、`POST /api/admin/ops/payments/:id/repair-credit`。
- `ops.task.retry`：`POST /api/admin/ops/tasks/:id/retry`。
- `settings.write`、`admin_account.write`：系统设置、密钥引用、后台权限账户新增/修改/重置密码。

### 真实开发任务拆分

下一步开发按下面顺序推进，每一步都要有后端测试和至少一张页面截图验收：

1. **认证闭环复验**：修改密码、失效其他会话、失败登录审计和账号禁用提示已经接入；真实开发阶段需要补截图验收和会话列表交互回归。
2. **后台权限中间件**：把当前重复的 `admin_session` 解析收敛为统一 guard，返回当前管理员、角色、权限点。
3. **系统设置真实页面**：把 `06-system-unified.png` 接入 `runtime_config_entries`、`admin_secret_references`、`admin_accounts`，补回滚和管理员状态修改。
4. **模型写流**：实现模型新建、编辑、复制、状态变更、发布检查、回滚，所有写入走 `ai_model_configs`、`ai_model_dispatch_policies`、`ai_model_config_revisions`。
5. **用户写流**：实现资料修改、禁用/启用、归档、扣减积分、积分流水详情，所有积分变化走 `credit_ledger_entries`。
6. **风控审计页面**：复用 `admin-ops`，补 `GET /api/admin/risks`、`GET /api/admin/audit-events`、风险复核、任务重试、支付修复入口。
7. **运营总览聚合**：补 dashboard 聚合服务，接任务、模型、积分、订单、风险和审计。
8. **样式复验**：逐页对齐最终图片，1366px 下固定操作列可见，详情页保存栏和上线检查不被遮挡。

### 不能开始开发的阻断项

如果下列任一项没有完成，不应进入“页面完成”验收：

- 后台仍有静态假数据覆盖真实接口数据。
- 写接口没有 `Idempotency-Key`。
- 敏感操作没有原因字段或没有写入 `audit_events`。
- 明文密钥进入数据库、接口响应、浏览器状态或日志。
- 后台模块直接 import `apps/web` 代码。
- 模型配置保存后绕过发布检查直接影响前台生成。
- 用户积分通过直接改缓存余额完成，而不是通过账本事实驱动。
- 表格操作按钮在最终图片宽度或 1366px 宽度下不可见。

## 实施阶段

### 阶段 1：静态后台壳与登录

- 建立 `apps/admin` 路由、布局、样式 token。
- 落地登录页、导航、账户菜单。
- 新增 `admin_accounts`、`admin_auth_sessions`。
- 实现登录、退出、`me`、修改密码。
- 后台与前台 session 完全隔离。

### 阶段 2：总览和基础权限

- 接入运营总览指标。
- 建立后台权限校验和审计写入。
- 实现 `audit_events` 后台查询。
- 完成角色权限矩阵。

### 阶段 3：模型管理和接入工作台

- 模型列表接入 `ai_model_configs`。
- 参数详情接入 `parameter_schema_json`、`pricing_json`、`provider_config_json`。
- 调度页接入 `ai_model_dispatch_policies`。
- 新增模型配置修订和回滚。
- 上线检查检测 `apiKeyEnv` 引用和 endpoint 格式合法性，不读取或返回密钥明文；真实 provider 健康探测后续单独接入。

### 阶段 4：用户、积分、团队权限账户

- 用户与积分列表接入现有用户、组织、团队、积分表。
- 子账户查看接入 `team_member_profiles`。
- 手动加减积分走积分账本服务和幂等命令。
- 用户状态变更和资料修改写审计。

### 阶段 5：风控、异常和系统配置

- 风险事件列表和复核接入 `payment_risk_events`。
- 支付未发积分修复复用 `admin-ops`。
- 任务重试复用现有任务 outbox 和后台运维能力。
- 系统设置接入 `runtime_config_entries` 和修订历史。

### 阶段 6：验收与安全

- 使用最终图片逐页截图对齐样式。
- 验证 1366px、1440px、1920px、移动窄屏不遮挡关键操作。
- 验证后台操作不会影响 `apps/web`。
- 验证明文密钥不会进入接口响应、日志、数据库。

## 测试与验收

必测项：

- 登录失败、账号禁用、session 过期、退出登录。
- 每个后台 API 的权限校验。
- 模型参数保存后，前台模型目录读取到新配置但前台目录结构不变。
- 模型计费修改后，任务预估积分和结算一致。
- 手动加积分写入账本、更新缓存余额、写审计，重复请求不会重复加分。
- 团队权限账户可以查看子账户，非授权管理员不可查看敏感字段。
- 风险复核和任务重试可以落库并记录处理人。
- 系统设置只保存非密钥配置，密钥只显示引用状态。
- 表格操作列在最终设计宽度下始终可见。

截图验收：

- `00-login.png` 对齐登录页。
- `02-models.png` 对齐模型列表，操作按钮不可超出。
- `03-model-integration-workbench.png` 对齐模型参数详情，不可遮挡保存和上线检查。
- `04-users-credits.png` 对齐用户积分功能，操作项必须完整。
- `06-system-unified.png` 对齐权限账户和系统设置。

## 与已有文档关系

本文件是后台管理平台总规划。以下文件作为专题补充：

- `docs/architecture/admin-static-placement.md`
- `docs/architecture/admin-model-configuration-design.md`
- `docs/architecture/admin-user-management-design.md`
- `docs/architecture/admin-analytics-design.md`
- `docs/architecture/ai-model-configurable-gateway-design.md`

实施时优先遵循本文件的边界、目录、数据库落地和前后台隔离要求；专题文档中更细的模型参数、用户积分、分析指标定义可以继续复用。

## 2026-06-05 开发前复核结论

本轮按最终页面和当前代码做了开发前复核，结论是：后台管理可以按本文档进入真实开发，核心页面、核心接口和数据库落点已经形成闭环；同时修复了两处会阻断本地启动验收的旧库兼容问题。

### 已确认可复现的页面和功能

- 后台登录页：保留单纯账号登录，登录成功进入 `/admin/dashboard`，使用独立 `admin_session`。
- 运营总览：指标、模型健康、最近事件、快捷入口均走 `/api/admin/dashboard/**`，事件和模型健康详情是结构化抽屉，不再展示原始 JSON。
- 模型配置列表：支持模型列表、状态、价格摘要、调度摘要、编辑、复制、启用/禁用；操作列固定在右侧。
- 模型参数详情 / 接入工作台：支持基础信息、任务模式、手动参数编辑、模型定价、请求映射、结果解析、调度限流、上线检查；异步轮询模型必须配置 `queryTaskEndpoint`。
- 用户与积分：支持用户列表、团队权限账户摘要、子账户入口、手动加积分、扣积分、查看账户、修改资料、禁用/启用、归档。
- 风控与审计：支持支付风险、任务异常、支付积分修复、审计日志、风险复核、任务重试、支付修复入口。
- 系统设置：支持运行配置、密钥引用、后台权限账户新增/修改/禁用/重置密码；密钥只保存引用和探测状态，不保存明文。
- 管理员账户：支持当前管理员资料、修改密码、会话列表、退出其他会话、退出登录。

### 本轮补齐的阻断项

- `apps/admin/index.html` 增加 1366px 审查约束：表格操作列固定可见，操作按钮不换行；抽屉增加 `max-height: 100vh`、`overflow-y: auto`、`overscroll-behavior: contain`，避免长表单底部按钮被遮挡。
- `apps/backend/src/modules/shared/db/dev-db.ts` 增加旧开发库自修复：
  - `admin_accounts` 已存在但缺 `failed_login_count` / `locked_until` 时，自动补跑后台管理迁移，避免后台登录 500。
  - `team_member_groups` / `team_member_profiles` 缺失时，自动补建团队权限表。
  - 旧库缺 `workspaces(organization_id,id)`、`memberships(organization_id,id)` 复合唯一约束时自动补齐，确保团队权限表外键能创建。

### 本轮验证结果

- `node --test apps/admin/index.test.mjs`：12 项通过，覆盖页面中文契约、真实 API 绑定、权限按钮、登录提交态、页面加载/403 状态、写操作提交/成功反馈、所有写抽屉统一走 mutation helper、1366px 表格/抽屉约束、总览事件详情、模型健康详情。
- `node --import tsx --test-name-pattern "serves the admin shell for authenticated admins who open the login route|exports risk and audit CSVs" apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`：2 项通过，覆盖已登录管理员访问 `/admin/login` 时可进入后台壳，以及风控/审计 CSV 导出只授予 `risk.export` 管理员、字段白名单生效并写入 `admin.export.created` 审计。
- `node --import tsx --test apps/backend/src/modules/shared/db/dev-db.test.mjs`：3 项通过，覆盖后台管理迁移、管理员登录锁定字段修复、团队权限旧库修复。
- 本地运行时验证：
  - `POST /api/admin/auth/login` 返回 200。
  - `/api/admin/auth/me`
  - `/api/admin/auth/sessions`
  - `/api/admin/dashboard/overview`
  - `/api/admin/dashboard/model-health`
  - `/api/admin/dashboard/recent-events`
  - `/api/admin/models?pageSize=5`
  - `/api/admin/users?pageSize=5`
  - `/api/admin/team-permission-accounts?pageSize=5`
  - `/api/admin/settings`
  - `/api/admin/admin-accounts`
  - `/api/admin/risks?pageSize=5`
  - `/api/admin/audit-events?pageSize=5`

以上接口本轮均返回 200，说明当前后台页面依赖的数据源已经能串通到数据库。进入真实开发前无需再补静态页面规划；下一步重点是按本文档把 `apps/admin` 逐步组件化、补齐截图验收，并把每个写操作的 HTTP 测试扩大到数据库事实、审计、幂等三件套。

### 仍需真实开发阶段继续完成的边界

- 风控/审计导出已接入真实 CSV 下载；后续如数据量扩大，需要从当前 1000 行同步导出升级为后台导出任务、分页游标和下载中心。
- 真实 provider 健康探测仍未接入，只做 `apiKeyEnv`、endpoint、参数、计费、调度的上线检查；后续需要单独接 provider 探测服务。
- 需要用最终截图逐页再做视觉验收，重点仍是 1366px、920px、440px 下操作按钮和抽屉底部按钮不能被遮挡。
