# 🚀 重启指南 - Worker隔离已就绪

## ✅ 当前状态

- Worker隔离代码已集成完成
- TypeScript编译通过
- 核心文件已创建：
  - `src/modules/model-gateway/worker-isolation.config.ts` ✓
  - `src/modules/model-gateway/request-host-middleware.ts` ✓
  - `src/entrypoints/phone-auth-dev-server.ts` (已修改) ✓
  - `src/modules/model-gateway/seedance-video.worker.ts` (已修改) ✓

## 📝 启动前配置

在 `.env` 文件中添加（如果还没有）：

```bash
ENABLE_WORKER_ISOLATION=true
```

## 🔄 重启步骤

### 停止现有服务
```bash
# 按 Ctrl+C 停止所有正在运行的服务
```

### 启动API服务器
```bash
npm run dev
# 或根据你的启动命令
```

### 启动Worker（在新终端）
```bash
npm run worker
# 或
node src/modules/model-gateway/seedance-video.worker.ts
```

## 🔍 验证隔离功能

### 1. 查看Worker启动日志

应该看到类似：
```
Worker Isolation: ENABLED
Worker Environment: local (detected from 127.0.0.1)
This worker will only process: local tasks
```

### 2. 发起测试请求

从本地浏览器或API工具发起一个视频生成请求，然后查询数据库：

```sql
SELECT 
  id,
  task_type,
  input_snapshot_json->>'requestHost' as request_host,
  status
FROM tasks
ORDER BY created_at DESC
LIMIT 3;
```

应该看到 `request_host = '127.0.0.1'` 或 `'localhost'`

### 3. 观察Worker行为

本地worker应该：
- ✓ 处理 requestHost='127.0.0.1' 的任务
- ✗ 跳过 requestHost='your-domain.com' 的任务
- ✗ 跳过没有 requestHost 的历史任务

## 🎯 预期结果

✅ **成功标志**：
1. 本地任务被本地worker处理
2. 没有 `provider_submission_failed` 错误
3. 生产任务不会被本地worker抢占
4. 任务快照中包含 `requestHost` 字段

## 📊 监控查询

```sql
-- 查看最近任务的来源分布
SELECT 
  CASE 
    WHEN input_snapshot_json->>'requestHost' IN ('127.0.0.1', 'localhost') THEN 'local'
    WHEN input_snapshot_json->>'requestHost' IS NULL THEN 'legacy'
    ELSE 'production'
  END as source,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM tasks
WHERE task_type = 'episode_generate_video'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY source;
```

## 🆘 如有问题

如果遇到问题：
1. 检查 `.env` 中 `ENABLE_WORKER_ISOLATION=true` 是否已设置
2. 查看worker启动日志确认隔离已启用
3. 检查任务表中 `requestHost` 字段是否正确填充

准备好了吗？开始重启！ 🚀
