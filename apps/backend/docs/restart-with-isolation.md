# 重启项目与Worker - Worker隔离已启用

## 验证状态

✅ **所有测试通过** (6/6) - Worker隔离功能正常工作

## 启用步骤

### 1. 配置环境变量

在 `apps/backend/.env` 文件中添加：

```bash
# Worker Isolation - 自动根据请求域名隔离本地和线上任务
ENABLE_WORKER_ISOLATION=true
```

**可选配置**（通常不需要，系统会自动检测）：
```bash
# 强制指定worker环境（自动检测通常更准确）
# WORKER_ENVIRONMENT=local
```

### 2. 重启顺序

#### 方案A：完全重启（推荐）

```bash
# 1. 停止所有进程
# 按 Ctrl+C 停止正在运行的服务

# 2. 启动后端API服务器
cd apps/backend
npm run dev
# 或
node src/entrypoints/phone-auth-dev-server.ts

# 3. 在新终端启动Worker
cd apps/backend
npm run worker
# 或启动特定worker
node src/modules/model-gateway/seedance-video.worker.ts
```

#### 方案B：仅重启Worker

如果API服务器不需要重启：

```bash
# 1. 停止当前Worker进程 (Ctrl+C)

# 2. 重启Worker
cd apps/backend
npm run worker
```

### 3. 验证隔离功能

运行验证脚本：

```bash
cd apps/backend
node verify-worker-isolation.js
```

预期输出：
```
✓ 所有测试通过！Worker隔离功能正常工作
```

### 4. 实际测试

#### 测试1: 本地任务创建

从本地发起一个视频生成请求：

```bash
curl -X POST http://127.0.0.1:3000/api/episodes/{episodeId}/generation/video-tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{
    "prompt": "测试视频",
    "model": "seedance"
  }'
```

#### 测试2: 检查任务快照

查询数据库验证 `requestHost` 字段：

```sql
SELECT 
  id,
  task_type,
  input_snapshot_json->>'requestHost' as request_host,
  input_snapshot_json->>'providerExecutor' as provider,
  status,
  created_at
FROM tasks
WHERE task_type = 'episode_generate_video'
ORDER BY created_at DESC
LIMIT 5;
```

预期结果：
- 本地请求的任务应该有 `request_host = '127.0.0.1'` 或 `'localhost'`
- 这些任务只会被本地worker处理

#### 测试3: 观察Worker日志

Worker启动时应该显示：

```
Worker Isolation: ENABLED
Worker Environment: local (auto-detected from HOST or request)
Worker will process: local tasks only
```

处理任务时应该显示：

```
Processing task {taskId}
Task environment: local (requestHost: 127.0.0.1)
Worker environment: local
✓ Processing task (environment match)
```

或跳过任务：

```
Skipping task {taskId}
Task environment: production (requestHost: api.example.com)
Worker environment: local
✗ Skipping task (environment mismatch)
```

## 工作原理

### 本地Worker（HOST=127.0.0.1）

**只处理**：
- `requestHost = '127.0.0.1'`
- `requestHost = 'localhost'`
- 其他本地IP（192.168.x.x, 10.x.x.x等）

**跳过**：
- 所有生产域名的任务
- 没有 `requestHost` 的历史任务

### 生产Worker（实际域名）

**处理**：
- 所有生产域名的任务
- 没有 `requestHost` 的历史任务（向后兼容）

**跳过**：
- 明确标记为本地的任务（`requestHost = '127.0.0.1'` 等）

## 常见问题

### Q1: Worker没有处理任何任务？

检查：
1. `ENABLE_WORKER_ISOLATION` 是否设置为 `true`
2. Worker环境是否正确识别（查看启动日志）
3. 任务的 `requestHost` 是否与worker环境匹配

### Q2: 本地任务被生产worker处理了？

这不应该发生。检查：
1. 生产worker是否运行在本地机器上？
2. 任务的 `requestHost` 字段是否正确保存？

### Q3: 如何临时禁用隔离？

在 `.env` 中设置：
```bash
ENABLE_WORKER_ISOLATION=false
```

然后重启worker。

### Q4: 历史任务（没有requestHost）怎么处理？

- 本地worker：跳过（严格隔离）
- 生产worker：处理（向后兼容）

这确保历史任务不会影响本地开发。

## 回滚方案

如果需要回滚到无隔离状态：

```bash
# 1. 在 .env 中禁用
ENABLE_WORKER_ISOLATION=false

# 2. 重启worker
# Ctrl+C 停止
npm run worker
```

或者直接删除/注释掉 `.env` 中的配置项。

## 监控建议

建议监控以下指标：

1. **任务处理延迟** - 确保本地任务不会堆积
2. **Worker处理统计** - 本地worker的处理/跳过比例
3. **任务快照完整性** - 检查 `requestHost` 字段的填充率

查询示例：

```sql
-- 统计最近的任务来源分布
SELECT 
  CASE 
    WHEN input_snapshot_json->>'requestHost' LIKE '%127.0.0.1%' THEN 'local'
    WHEN input_snapshot_json->>'requestHost' IS NULL THEN 'legacy'
    ELSE 'production'
  END as source,
  COUNT(*) as count
FROM tasks
WHERE task_type = 'episode_generate_video'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY source;
```

## 成功标志

✅ Worker隔离功能正常工作的标志：

1. 验证脚本全部通过（6/6）
2. 本地worker只处理本地任务
3. 生产任务不会被本地worker处理
4. 任务快照中包含 `requestHost` 字段
5. 没有binding冲突错误（`provider_submission_failed`）
