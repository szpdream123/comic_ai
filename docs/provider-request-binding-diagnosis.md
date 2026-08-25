# 🔴 Provider Request Binding 失败问题 - 完整诊断

## 问题现象

```json
{
  "requestAttemptId": null,
  "expectedAttemptId": "78ee7667-7f04-4a27-bdea-5eaada8d9163",
  "failureCode": "provider_submission_failed",
  "diagnosticNote": "provider request 未绑定当前 task attempt"
}
```

## 问题根源分析

### 1️⃣ 问题不是Worker竞争

如果是worker竞争导致的，我们会看到：
- ❌ `requestAttemptId: "不同的UUID"`（绑定到其他attempt）
- ✅ 实际看到：`requestAttemptId: null`（根本没有绑定）

**结论**：问题发生在**创建provider_request时**，而不是worker处理阶段。

### 2️⃣ 真正的问题

`provider_request` 记录创建时，`attempt_id` 字段被设置为 `NULL`。

这意味着调用 `createOrReuseProviderRequest()` 时传入的 `attemptId` 就是 `null`。

### 3️⃣ 为什么会这样？

查看代码：
```typescript
// provider-request.service.ts:155
input.attemptId ?? null,  // 如果attemptId是undefined，就变成null
```

问题可能出在：
1. Worker处理任务时没有正确读取 `task.current_attempt_id`
2. 或者 claim 任务时没有正确设置 attempt
3. 或者在某个重试/竞态条件下 attempt 信息丢失

## 🔍 关键诊断步骤

### 步骤1: 检查任务的 attempt 状态

执行以下SQL查询：

```sql
-- 检查最新失败任务的attempt信息
SELECT 
  t.id,
  t.status,
  t.current_attempt_id,
  t.attempt_count,
  ta.id as attempt_id,
  ta.status as attempt_status,
  ta.claimed_at,
  ta.claimed_by_worker_id,
  ta.created_at as attempt_created_at,
  t.created_at as task_created_at
FROM tasks t
LEFT JOIN task_attempts ta ON ta.task_id = t.id AND ta.id = t.current_attempt_id
WHERE t.task_type = 'episode_generate_video'
  AND t.status = 'failed'
ORDER BY t.created_at DESC
LIMIT 3;
```

**关键检查**：
- ✅ `current_attempt_id` 应该有值（UUID）
- ✅ `task_attempts` 表应该有对应记录
- ✅ `claimed_at` 和 `claimed_by_worker_id` 应该有值

### 步骤2: 检查 provider_request 绑定

```sql
-- 检查对应的provider_request
SELECT 
  pr.id,
  pr.task_id,
  pr.attempt_id as pr_attempt_id,
  t.current_attempt_id as task_current_attempt_id,
  pr.status,
  pr.external_submission_started_at,
  pr.created_at as pr_created_at,
  t.created_at as task_created_at,
  CASE 
    WHEN pr.attempt_id IS NULL THEN '❌ attempt_id是NULL'
    WHEN pr.attempt_id = t.current_attempt_id THEN '✅ 绑定正确'
    ELSE '⚠️ 绑定到旧的attempt'
  END as binding_status
FROM provider_requests pr
JOIN tasks t ON t.id = pr.task_id
WHERE t.task_type = 'episode_generate_video'
ORDER BY pr.created_at DESC
LIMIT 5;
```

## 🎯 可能的解决方案

### 方案A: Worker没有正确claim任务

检查 worker 日志中是否有：
```
✓ Claimed task: {taskId}
✓ Attempt ID: {attemptId}
```

如果没有，说明 worker 的 claim 逻辑有问题。

### 方案B: 竞态条件导致attempt丢失

可能的场景：
1. Worker A claim了任务，创建了 attempt
2. Worker B 也在同时处理，但使用了过期的任务信息
3. Worker B 创建 provider_request 时使用了 null 的 attemptId

**Worker隔离应该能解决这个问题**，但前提是：
- ✅ Worker必须真正重启
- ✅ 日志中必须显示 "Worker Isolation: ENABLED"
- ✅ 新任务必须包含 `requestHost` 字段

### 方案C: submitProviderRequest 的bug

让我检查 `submitProviderRequest` 调用时是否正确传递了 attemptId。

## 🚨 立即检查清单

请按以下顺序检查：

1. **Worker日志** - 是否显示？
   ```
   Worker Isolation: ENABLED
   Worker Environment: local
   ```

2. **新任务的 requestHost** - 执行SQL：
   ```sql
   SELECT 
     id,
     input_snapshot_json->>'requestHost' as request_host,
     created_at
   FROM tasks
   WHERE created_at > NOW() - INTERVAL '10 minutes'
   ORDER BY created_at DESC
   LIMIT 3;
   ```

3. **Attempt 绑定状态** - 执行上面的诊断SQL

4. **Worker是否真的claim了任务** - 查看worker日志

## 📝 下一步

请提供以下信息：

1. Worker启动日志（前20行）
2. 上述SQL查询的结果
3. 最新失败任务的 task_id

这样我才能精确定位问题所在。

---

**临时workaround**：如果问题持续，可以尝试：
1. 完全停止所有worker进程（本地和远程）
2. 清理数据库中的 pending 任务
3. 只启动一个本地worker
4. 发起新的测试请求
