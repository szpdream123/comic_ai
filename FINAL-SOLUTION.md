# Provider Request Binding 问题 - 完整解决方案

## 问题诊断

✅ **已确认的问题**：
- `provider_request.attempt_id` 为 `NULL`
- 错误信息：`provider request 未绑定当前 task attempt`
- Worker隔离代码已集成但问题依然存在

❌ **问题根源**（与worker隔离无关）：
- `createOrReuseProviderRequest` 中的 `ON CONFLICT DO NOTHING` 导致旧记录被复用
- 或者多个worker同时处理任务导致竞态条件

## 🔧 解决方案

### 方案A：清理并重新测试（推荐）

1. **停止所有worker进程**
   ```bash
   # 停止所有worker
   pkill -f "seedance-video.worker"
   
   # 确认已停止
   ps aux | grep seedance
   ```

2. **清理数据库中的失败任务**
   ```sql
   -- 删除最近24小时的failed任务和provider_requests
   DELETE FROM provider_requests
   WHERE status IN ('failed', 'created')
     AND created_at > NOW() - INTERVAL '24 hours';
   
   DELETE FROM tasks
   WHERE status IN ('failed', 'queued')
     AND task_type = 'episode_generate_video'
     AND created_at > NOW() - INTERVAL '24 hours';
   ```

3. **确认环境变量**
   ```bash
   # 检查 .env
   cat .env | grep ENABLE_WORKER_ISOLATION
   # 应该显示: ENABLE_WORKER_ISOLATION=true
   ```

4. **重启API服务器**（重要！）
   ```bash
   # 停止当前API服务器
   # Ctrl+C
   
   # 重新启动
   npm run dev
   ```

5. **启动单个worker**
   ```bash
   npm run worker
   
   # 确认日志中显示：
   # Worker Isolation: ENABLED
   # Worker Environment: local
   ```

6. **创建新的测试任务**
   - 从浏览器发起一个新的视频生成请求
   - **不要重试旧任务**

7. **验证**
   ```sql
   -- 检查新任务的 requestHost 和 attempt 绑定
   SELECT
     t.id,
     t.input_snapshot_json->>'requestHost' as request_host,
     t.current_attempt_id,
     pr.attempt_id as pr_attempt_id,
     CASE
       WHEN pr.attempt_id = t.current_attempt_id THEN '✅ 绑定正确'
       WHEN pr.attempt_id IS NULL THEN '❌ NULL'
       ELSE '⚠️ 不匹配'
     END as binding_status
   FROM tasks t
   LEFT JOIN provider_requests pr ON pr.task_id = t.id
   WHERE t.created_at > NOW() - INTERVAL '5 minutes'
   ORDER BY t.created_at DESC
   LIMIT 1;
   ```

### 方案B：代码层面修复（如果方案A无效）

问题可能在 `createOrReuseProviderRequest` 的 `ON CONFLICT` 逻辑。需要修改代码以强制使用当前的 `attemptId`：

```typescript
// provider-request.service.ts
// 在 ON CONFLICT 时更新 attempt_id，而不是 DO NOTHING

INSERT INTO provider_requests (...)
VALUES (...)
ON CONFLICT (provider_name, provider_operation, request_key)
DO UPDATE SET
  attempt_id = EXCLUDED.attempt_id,  -- 使用新的 attempt_id
  status = 'created',
  updated_at = EXCLUDED.updated_at
RETURNING *
```

但这需要修改源代码并重新部署。

## 📋 检查清单

在执行方案A后，确认：

- [ ] 所有旧worker进程已停止
- [ ] 数据库中的failed任务已清理
- [ ] API服务器已重启
- [ ] 只有一个worker在运行
- [ ] Worker日志显示 "Worker Isolation: ENABLED"
- [ ] 创建的是**全新**的测试任务（不是重试）
- [ ] 新任务的 `requestHost` 字段有值（127.0.0.1）
- [ ] 新任务的 `provider_request.attempt_id` 不为NULL

## 🚨 关键注意事项

1. **必须清理旧任务**：旧的 `provider_request` 记录会导致 `ON CONFLICT DO NOTHING` 复用问题

2. **必须重启API服务器**：只重启worker不够，API服务器也需要重启才能捕获 `requestHost`

3. **不要重试旧任务**：重试会使用旧的 `request_key`，导致复用问题

4. **确认只有一个worker运行**：多个worker会导致竞争

## 🔍 如果仍然失败

提供以下信息：

1. Worker启动日志（前20行）
2. API服务器启动日志
3. 执行以下SQL的结果：
   ```sql
   SELECT
     t.id,
     t.input_snapshot_json->>'requestHost' as request_host,
     t.current_attempt_id,
     t.attempt_count,
     pr.id as pr_id,
     pr.attempt_id as pr_attempt_id,
     pr.created_at as pr_created,
     t.created_at as task_created
   FROM tasks t
   LEFT JOIN provider_requests pr ON pr.task_id = t.id
   WHERE t.created_at > NOW() - INTERVAL '10 minutes'
   ORDER BY t.created_at DESC
   LIMIT 3;
   ```

这样我才能进一步诊断问题。
