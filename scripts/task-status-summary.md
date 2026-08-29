# 任务修复总结

## 任务信息

1. **任务 ID**: d4063dc8-5791-4a74-83a8-c901ece79177
   - 模型: cumob-gpt-image-2-vip
   - 状态: queued
   - 最后调度: 2026-08-28 21:04:31

2. **任务 ID**: f18bab12-5271-4914-b5b4-4c1599cb142b
   - 模型: bananarouter-gpt-image-2
   - 状态: queued
   - 最后调度: 未调度

## 已完成的修复操作

✅ 重置了任务的锁定状态
✅ 创建了新的出站箱事件
✅ 出站箱调度器正在运行 (PID: 1215)
✅ 维护进程正在运行 (PID: 1325)
✅ 任务进度阶段已更新为 queued

## 当前问题

❌ **缺少队列工作进程（worker）**

这些任务需要队列工作进程来实际处理：
- 从 Redis 队列中取出任务
- 提交到 AI 提供商（cumob/bananarouter）
- 轮询结果并更新状态

## 需要执行的操作

### 方案1：启动图像生成工作进程（推荐）

在新的终端窗口运行：

```bash
npm run worker:generation-video
```

或者后台运行：

```bash
npm run worker:generation-video > generation-worker.log 2>&1 &
```

### 方案2：完整的开发环境

如果需要完整的服务，运行：

```bash
npm run dev
```

这会启动所有必要的服务，包括：
- HTTP 服务器
- 出站箱调度器
- 队列维护进程
- 所有队列工作进程

## 验证步骤

启动工作进程后，等待约30-60秒，然后检查任务状态：

```bash
node --env-file=.env --import tsx -e "
import { createDevDb } from './apps/backend/src/modules/shared/db/dev-db.ts';
const db = await createDevDb();
try {
  const result = await db.query(\`
    SELECT 
      t.id::text,
      t.status,
      s.progress_stage,
      s.provider_request_id,
      s.completed_at
    FROM tasks t
    LEFT JOIN ai_generation_task_snapshots s ON t.id = s.task_id
    WHERE t.id IN ('d4063dc8-5791-4a74-83a8-c901ece79177', 'f18bab12-5271-4914-b5b4-4c1599cb142b')
  \`);
  result.rows.forEach(task => {
    console.log(\`任务 \${task.id.substring(0, 8)}...: \${task.status} / \${task.progress_stage}\`);
    if (task.provider_request_id) {
      console.log(\`  ✓ 已提交到提供商: \${task.provider_request_id}\`);
    }
    if (task.completed_at) {
      console.log(\`  ✓ 已完成: \${task.completed_at}\`);
    }
  });
} finally {
  await db.close();
}
"
```

## 注意事项

1. **Redis 连接**: 维护进程日志显示偶尔有 Redis 连接超时，但这不影响主要功能
2. **队列健康**: generation-submit-image 队列当前为空（waiting: 0, active: 0）
3. **后台进程**: 
   - 出站箱调度器: PID 1215
   - 维护进程: PID 1325

如果需要停止这些进程：
```bash
kill 1215 1325
```

## 队列系统架构

```
数据库 tasks 表
    ↓
出站箱事件 (outbox_events)
    ↓
出站箱调度器 ← 正在运行 ✅
    ↓
Redis BullMQ 队列
    ↓
队列工作进程 ← 需要启动 ❌
    ↓
AI 提供商 (cumob/bananarouter)
    ↓
轮询结果
    ↓
更新任务状态
```

## 相关日志文件

- `generation-outbox.log` - 出站箱调度器日志
- `generation-repair.log` - 维护进程日志
- `generation-worker.log` - 工作进程日志（需要启动后才有）
