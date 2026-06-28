# 用户归属子账户开发规格

## 1. 结论

本功能采用“管理员用户拥有子账户”的简单模型。

管理员是真实 `users` 行。子账户不是 `users` 行，不进入现有用户登录体系，不使用短信登录。子账户只存在于管理员名下，所有项目、权限、计费、资源归属仍然通过管理员的 `users.id` 实现。

后续开发以本文档为准。

## 2. 已放弃的方向

不继续采用之前偏组织化的成员模型作为本功能主线：

- 不把子账户创建成 `users` 行。
- 不把子账户当成真实用户参与手机号登录。
- 不把权限拆成独立组织成员权限体系。
- 不扩展旧的 `team_member_profiles` / `team_project_assignments` 作为本次子账户登录的核心表。

旧表如果已有兼容逻辑，保留不动。本功能只围绕新的简单表实现。

## 3. 核心规则

1. 管理员只能看到自己的成员。
   - 所有成员管理查询都必须带 `team_members.user_id = currentUserId`。

2. 子账户只属于某一个管理员。
   - 子账户不允许跨管理员共享。
   - 子账户不能查看不在 `team_member_projects` 中的项目。

3. 所有权限通过管理员用户实现。
   - 子账户登录后创建的是管理员 `user_id` 的 `auth_sessions`。
   - 额外通过 `team_member_auth_sessions` 标记当前 session 是哪个子账户。

4. 管理员可以无条件管理自己的子账户。
   - 修改成员名称。
   - 修改成员积分。
   - 重置成员密码。
   - 禁用成员。
   - 启用成员。
   - 删除成员账户。

5. 删除成员账户不删除业务数据。
   - 删除是软删除：`team_members.status = 'deleted'`。
   - 项目分配、项目生成结果、操作记录继续保留。
   - 管理员进入自己的项目，仍然可以看到成员创建和生成的结果。

6. 禁用成员只影响登录。
   - `team_members.status = 'disabled'` 后不能登录。
   - 已有生成结果、记录、项目分配仍然保留。

7. 密码不能明文保存或返回。
   - 只保存 `member_password_hash`。
   - 管理员重置密码后，必须使该成员已有登录态失效。

## 4. 数据表

### 4.1 `team_members`

管理员名下的子账户表。

字段：

```sql
id uuid PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id),
member_account text NOT NULL,
member_account_suffix text NOT NULL,
member_login_account text NOT NULL UNIQUE,
member_name text NOT NULL,
member_password_hash text NOT NULL,
member_credits integer NOT NULL DEFAULT 0 CHECK (member_credits >= 0),
status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
disabled_at timestamptz NULL,
deleted_at timestamptz NULL,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

约束：

```sql
CHECK (member_account ~ '^[a-z0-9][a-z0-9_-]{2,31}$')
CHECK (member_account_suffix ~ '^[a-z0-9][a-z0-9_-]{5,31}$')
CHECK (member_login_account = member_account || '@' || member_account_suffix)
UNIQUE (user_id, member_account)
UNIQUE (id, user_id)
```

含义：

- `user_id`：管理员 `users.id`。
- `member_account`：管理员手动创建的英文账号，如 `director001`。
- `member_account_suffix`：由管理员手机号生成的唯一尾缀。
- `member_login_account`：最终登录账号，格式为 `member_account@member_account_suffix`。
- `member_name`：成员名称，管理员可修改。
- `member_password_hash`：成员密码哈希。
- `member_credits`：成员积分额度或展示值。
- `status`：成员生命周期。

### 4.2 `team_member_projects`

成员可见项目表。

字段：

```sql
id uuid PRIMARY KEY,
member_id uuid NOT NULL,
user_id uuid NOT NULL REFERENCES users(id),
project_id uuid NOT NULL REFERENCES projects(id),
created_at timestamptz NOT NULL DEFAULT now()
```

约束：

```sql
UNIQUE (member_id, project_id)
FOREIGN KEY (member_id, user_id) REFERENCES team_members (id, user_id)
```

含义：

- 一行代表一个成员可以看到一个项目。
- 一个成员可以分配一个或多个项目。
- 成员只能看到表中分配给自己的项目。
- `user_id` 必须和成员所属管理员一致。

### 4.3 `team_member_auth_sessions`

成员登录态上下文表。

字段：

```sql
id uuid PRIMARY KEY,
auth_session_id uuid NOT NULL REFERENCES auth_sessions(id),
user_id uuid NOT NULL REFERENCES users(id),
member_id uuid NOT NULL,
status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
expires_at timestamptz NOT NULL,
last_seen_at timestamptz NULL,
revoked_at timestamptz NULL,
created_at timestamptz NOT NULL DEFAULT now()
```

约束：

```sql
UNIQUE (auth_session_id)
FOREIGN KEY (member_id, user_id) REFERENCES team_members (id, user_id)
```

含义：

- `auth_sessions.user_id` 仍然是管理员。
- `team_member_auth_sessions.member_id` 标记当前 session 是哪个子账户在操作。

### 4.4 `team_member_project_records`

成员项目操作记录表。

字段：

```sql
id uuid PRIMARY KEY,
user_id uuid NOT NULL REFERENCES users(id),
member_id uuid NOT NULL,
project_id uuid NOT NULL REFERENCES projects(id),
record_type text NOT NULL,
record_status text NOT NULL DEFAULT 'recorded' CHECK (record_status IN ('recorded', 'running', 'succeeded', 'failed')),
record_title text NOT NULL,
record_detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
source_table text NULL,
source_id uuid NULL,
created_at timestamptz NOT NULL DEFAULT now()
```

约束：

```sql
FOREIGN KEY (member_id, user_id) REFERENCES team_members (id, user_id)
FOREIGN KEY (member_id, project_id) REFERENCES team_member_projects (member_id, project_id)
```

含义：

- 用于管理员查看成员在项目中的进度和操作记录。
- 记录必须落在成员已分配项目内。
- 记录不是项目数据的真实归属，项目数据仍归属管理员。

## 5. 账号生成规则

管理员账号只能是手机号。

子账户账号由两部分组成：

```text
member_account@member_account_suffix
```

示例：

```text
director001@u185715
```

规则：

1. `member_account` 由管理员手动输入。
   - 只能使用英文小写、数字、下划线、短横线。
   - 同一个管理员名下不能重复。

2. `member_account_suffix` 由管理员手机号生成。
   - 必须稳定，同一个管理员每次生成一致。
   - 必须避免不同管理员之间冲突。
   - 推荐使用手机号加盐哈希后截断，而不是直接暴露手机号。

3. `member_login_account` 全局唯一。
   - 数据库已有唯一约束。
   - 登录时统一转小写。

4. 子账户不会和现有用户串号。
   - 普通用户登录使用手机号。
   - 子账户登录使用组合账号。
   - 子账户不写入 `users`。

## 6. 生命周期

`team_members.status` 是唯一生命周期字段。

### 6.1 `active`

成员可登录，可操作已分配项目。

### 6.2 `disabled`

成员不可登录。

禁用时：

```sql
UPDATE team_members
SET status = 'disabled',
    disabled_at = now(),
    updated_at = now()
WHERE id = $memberId
  AND user_id = $adminUserId;
```

同时撤销该成员 active session：

```sql
UPDATE team_member_auth_sessions
SET status = 'revoked',
    revoked_at = now()
WHERE user_id = $adminUserId
  AND member_id = $memberId
  AND status = 'active';
```

### 6.3 `deleted`

成员软删除，不可登录，普通列表默认隐藏。

删除时：

```sql
UPDATE team_members
SET status = 'deleted',
    deleted_at = now(),
    updated_at = now()
WHERE id = $memberId
  AND user_id = $adminUserId;
```

删除不做这些事：

- 不删除 `team_member_projects`。
- 不删除 `team_member_project_records`。
- 不删除项目、剧本、分镜、图片、视频、导出等业务数据。

## 7. 登录设计

接口：

```http
POST /api/auth/team-member/password/login
```

请求：

```json
{
  "account": "director001@u185715",
  "password": "member password",
  "remember": true
}
```

流程：

1. 将 `account` 规范化为小写。
2. 查询 `team_members.member_login_account = account`。
3. 要求 `team_members.status = 'active'`。
4. 校验 `password` 与 `member_password_hash`。
5. 创建普通 `auth_sessions`，其中 `user_id = team_members.user_id`。
6. 创建 `team_member_auth_sessions`，记录 `auth_session_id`、`user_id`、`member_id`。
7. 设置现有 `auth_session` cookie。
8. 返回成员上下文。

响应示例：

```json
{
  "actorType": "team_member",
  "userId": "administrator user id",
  "memberId": "member uuid",
  "memberAccount": "director001",
  "memberLoginAccount": "director001@u185715",
  "memberName": "导演一号"
}
```

禁止：

- 禁止子账户短信验证码登录。
- 禁止将子账户写入 `users`。
- 禁止返回明文密码。

## 8. Session 解析

现有登录态解析仍然先解析 `auth_sessions`，得到管理员 `userId`。

之后补查成员上下文：

```sql
SELECT *
FROM team_member_auth_sessions
WHERE auth_session_id = $1
  AND user_id = $2
  AND status = 'active'
  AND expires_at > $3
LIMIT 1;
```

如果有记录，请求上下文为：

```ts
{
  userId: adminUserId,
  actorType: "team_member",
  memberId,
  memberAccount,
  memberName
}
```

如果没有记录，请求上下文为普通管理员：

```ts
{
  userId: adminUserId,
  actorType: "user"
}
```

## 9. 项目可见性

管理员 session：

- 可访问自己本来就有权限的项目。
- 可查看自己项目中成员创建和生成的所有结果。

成员 session：

- 必须通过 `team_member_projects` 限制。
- 未分配项目返回 `403`。

项目读取和操作都必须加检查：

```sql
WHERE EXISTS (
  SELECT 1
  FROM team_member_projects visible
  WHERE visible.user_id = $adminUserId
    AND visible.member_id = $memberId
    AND visible.project_id = projects.id
)
```

必须覆盖：

- 项目列表。
- 项目详情。
- 剧本读取和修改。
- 集数读取和修改。
- 分镜读取和修改。
- 资产创建和修改。
- 图片生成。
- 视频生成。
- 导出。
- 项目仪表盘。

## 10. 管理员能看到什么

管理员只能看到自己的成员和自己的项目。

管理员可以看到：

1. 成员列表。
   - 成员账号。
   - 完整登录账号。
   - 成员名称。
   - 成员积分。
   - 状态。
   - 创建时间、更新时间。

2. 成员分配的项目。
   - 一个成员可分配一个或多个项目。
   - 一个项目可被多个成员分配。

3. 成员项目进度。
   - 项目阶段：`projects.phase`。
   - 剧本状态：`scripts.status`。
   - 集数数量。
   - 分镜数量。
   - 已完成图片数量。
   - 已完成视频数量。
   - 运行中任务数量。
   - 失败任务数量。
   - 最近操作时间。

4. 成员操作记录。
   - 查看项目。
   - 修改剧本。
   - 修改集数。
   - 创建资产。
   - 修改资产。
   - 图片生成。
   - 视频生成。
   - 导出。
   - 消耗积分。

5. 成员生成结果。
   - 管理员进入自己的项目时，直接从真实项目表查看结果。
   - 子账户只是操作来源，不改变项目归属。

管理员不能看到：

- 成员明文密码。

## 11. 成员项目记录

成员每次对生产状态产生影响，都要写 `team_member_project_records`。

推荐 `record_type`：

```text
project_view
project_assign
script_update
episode_update
shot_update
asset_create
asset_update
image_generation
video_generation
export_create
credit_consume
```

异步生成规则：

1. 请求发起时写一条 `running`。
2. 任务成功后写 `succeeded`。
3. 任务失败后写 `failed`。
4. 有任务 id 时写入：
   - `source_table`
   - `source_id`

## 12. 接口清单

### 12.1 创建成员

```http
POST /api/team/members
```

请求：

```json
{
  "memberAccount": "director001",
  "memberName": "导演一号",
  "password": "initial password",
  "memberCredits": 100
}
```

行为：

1. 当前用户必须是管理员本人。
2. 根据管理员手机号生成 `member_account_suffix`。
3. 拼接 `member_login_account`。
4. 写入 `member_password_hash`。
5. 返回成员信息，不返回密码。

### 12.2 成员列表

```http
GET /api/team/members
```

默认只返回 `active` 和 `disabled`。

可选参数：

```text
includeDeleted=true
```

只有管理员自己能查自己的成员。

### 12.3 修改成员

```http
PATCH /api/team/members/:memberId
```

可改：

```json
{
  "memberName": "新名称",
  "memberCredits": 200,
  "status": "disabled"
}
```

规则：

- 必须检查 `team_members.user_id = currentUserId`。
- 禁用或删除时撤销 active member sessions。

### 12.4 重置密码

```http
POST /api/team/members/:memberId/password
```

请求：

```json
{
  "password": "new password"
}
```

规则：

- 只保存哈希。
- 不返回明文密码。
- 重置后撤销该成员 active sessions。

### 12.5 分配项目

```http
POST /api/team/members/:memberId/projects
```

请求：

```json
{
  "projectIds": ["project uuid 1", "project uuid 2"]
}
```

行为：

1. 确认成员属于当前管理员。
2. 确认项目属于当前管理员的项目范围。
3. 替换 `team_member_projects` 中该成员的项目分配。
4. 可写一条 `project_assign` 记录。

### 12.6 成员项目列表

```http
GET /api/team/members/:memberId/projects
```

只返回当前管理员名下该成员被分配的项目。

### 12.7 成员进度

```http
GET /api/team/members/:memberId/progress
```

响应示例：

```json
{
  "member": {
    "id": "member uuid",
    "account": "director001",
    "loginAccount": "director001@u185715",
    "name": "导演一号",
    "credits": 100,
    "status": "active"
  },
  "projects": [
    {
      "projectId": "project uuid",
      "projectName": "项目名称",
      "phase": "shot_generation",
      "scriptStatus": "parsed",
      "episodeCount": 12,
      "shotCount": 80,
      "completedImageCount": 40,
      "completedVideoCount": 12,
      "runningTaskCount": 2,
      "failedTaskCount": 1,
      "lastRecordAt": "2026-06-28T00:00:00.000Z"
    }
  ]
}
```

### 12.8 项目成员记录

```http
GET /api/team/projects/:projectId/member-records
```

规则：

- 项目必须属于当前管理员。
- 返回该项目下所有成员操作记录。
- 可按 `memberId`、`recordType`、时间范围筛选。

## 13. 开发顺序

建议按下面顺序实现：

1. 数据表迁移和 schema 测试。
2. 成员账号尾缀生成工具。
3. 成员管理 service。
4. 成员登录接口。
5. session 解析增加 `team_member` 上下文。
6. 项目读取可见性过滤。
7. 项目写操作权限检查。
8. 成员操作记录写入。
9. 管理员成员进度聚合接口。
10. 前端成员管理页面和项目内成员记录视图。

## 14. 测试要求

必须覆盖：

1. 管理员只能看到自己的成员。
2. 不同管理员可创建相同 `member_account`，但完整 `member_login_account` 不冲突。
3. 子账户不会创建 `users` 行。
4. 子账户不能用短信验证码登录。
5. `disabled` 成员不能登录。
6. `deleted` 成员不能登录。
7. 删除成员不删除项目分配和记录。
8. 成员只能看到分配项目。
9. 成员不能访问未分配项目。
10. 管理员能看到成员在自己项目内创建和生成的结果。
11. 管理员重置密码后，成员旧 session 失效。
12. 接口响应不返回 `member_password_hash` 和明文密码。

测试登录态准备遵守项目规则：

- 普通用户测试登录使用 `/api/auth/password/login`。
- 不使用短信验证码链路准备登录态。
- 只有专门测试短信能力时才允许调用短信验证码接口。

## 15. 验收标准

功能完成后应满足：

1. 管理员创建子账户后，获得唯一登录账号。
2. 子账户用组合账号和密码登录。
3. 子账户只看到管理员分配给自己的项目。
4. 子账户在项目中生成的图片、视频、导出等结果，管理员进入项目后能直接看到。
5. 管理员能查看成员列表、状态、项目分配、项目进度和操作记录。
6. 管理员能修改成员资料、重置密码、禁用、启用、软删除。
7. 禁用和软删除不影响历史数据。
8. 子账户不和现有 `users` 体系串号。
9. 所有成员相关查询都以管理员 `user_id` 为边界。

## 16. 当前已落地内容

已新增迁移：

- `packages/db/migrations/0053_simple_team_members.sql`
- `packages/db/migrations/0054_simple_team_member_access.sql`

已更新 schema 测试：

- `apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts`

已验证：

```text
npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts
15 passed
```

## 17. 最终清理要求

新子账户功能完整开发、数据迁移、回归测试和线上验证完成后，必须清理之前已经放弃的冗余代码和数据表。

清理原则：

1. 不保留没有实际作用的历史实现。
2. 不保留已被新模型替代的接口、service、测试、文档入口。
3. 不保留已被新模型替代且无数据依赖的数据表。
4. 清理必须放在新功能稳定之后执行，不能在替换完成前破坏现有兼容链路。
5. 清理前必须确认没有运行时代码、后台任务、管理后台页面或测试仍依赖旧结构。

重点清理对象：

- 旧组织化团队成员模型中不再使用的表。
- 旧 `team_member_profiles` / `team_project_assignments` 相关的无效业务代码。
- 与已放弃方案绑定的接口、DTO、类型定义、权限判断、测试用例。
- 文档中仍指向旧方案的说明。
- 管理后台中仅服务旧方案且不再可见的页面入口或查询逻辑。

建议清理步骤：

1. 全局搜索旧表名、旧 service、旧接口路径和旧类型名。
2. 标记仍被运行时代码引用的部分，确认是否需要迁移到新模型。
3. 编写数据库迁移，删除确认无依赖的旧表、旧索引、旧约束。
4. 删除无效代码和无效测试。
5. 更新文档，确保只保留本文档定义的新子账户模型。
6. 跑完整后端测试和关键前端流程测试。
7. 线上观察稳定后，确认旧方案没有残留入口。

清理验收标准：

1. 项目内不存在无用的旧子账户实现代码。
2. 数据库内不存在无用的旧子账户相关表。
3. 后续开发只需要理解本文档定义的新模型。
4. 管理员和子账户功能在清理后行为不变。
