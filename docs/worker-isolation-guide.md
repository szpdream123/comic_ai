# Worker 隔离机制使用指南 (基于域名自动识别)

## 概述

Worker隔离机制通过**自动识别请求域名**来隔离线上worker和本地任务，无需手动配置环境标签。

### 自动识别规则

| 请求来源 | 识别为 | Worker处理 |
|---------|--------|-----------|
| `127.0.0.1`, `localhost` | `local` | 本地worker |
| `192.168.x.x`, `10.x.x.x` 内网IP | `local` | 本地worker |
| `staging.example.com` 包含staging/test/dev | `staging` | 预发布worker |
| `example.com` 生产域名 | `production` | 线上worker |

## 工作原理

```
1. 用户发起请求 (http://127.0.0.1:3000)
   ↓
2. 中间件捕获域名 (127.0.0.1)
   ↓
3. 任务快照添加 requestHost: "127.0.0.1"
   ↓
4. Worker启动时检测 HOST 环境变量
   ↓
5. 任务和Worker环境匹配才处理
```

## 配置方法

### 1. 环境变量（可选）

**线上环境**：
```bash
HOST=example.com  # 生产域名
NODE_ENV=production
```

**本地环境**：
```bash
HOST=127.0.0.1:3000  # 或者不设置，自动检测
NODE_ENV=development
```

**预发布环境**：
```bash
HOST=staging.example.com
NODE_ENV=staging
```

### 2. 强制指定环境（特殊场景）

如果自动检测不准确，可以强制指定：

```bash
WORKER_ENVIRONMENT=local  # 强制本地环境
# 或
WORKER_ENVIRONMENT=production  # 强制生产环境
```

### 3. 禁用隔离（不推荐）

```bash
WORKER_ENVIRONMENT=production  # 强制为production，处理所有任务
```

## 前端集成（自动化）

### 在请求拦截器中自动添加

```typescript
// axios interceptor
import { extractRequestHost } from '@/utils/request';

axios.interceptors.request.use(config => {
  // 浏览器环境自动获取
  const requestHost = window.location.host;
  
  if (config.data?.inputSnapshot) {
    config.data.inputSnapshot.requestHost = requestHost;
  }
  
  return config;
});
```

### 后端API处理

```typescript
import { enrichTaskSnapshotWithRequestHost } from '@/modules/model-gateway/request-host-middleware';

// 创建任务接口
app.post('/api/tasks/create', async (req, res) => {
  const { inputSnapshot } = req.body;
  
  // 自动添加请求域名
  const enrichedSnapshot = enrichTaskSnapshotWithRequestHost(inputSnapshot, req);
  
  const task = await createTask({
    taskType: 'episode_generate_video',
    inputSnapshot: enrichedSnapshot, // 已包含 requestHost
  });
  
  res.json(task);
});
```

## 验证隔离是否生效

### 1. 检查Worker启动日志

```bash
# 本地环境
Worker environment detected: local
Detected host: 127.0.0.1:3000
Worker ID: local-DESKTOP-ABC123-seedance-video-submit-worker

# 线上环境
Worker environment detected: production
Detected host: example.com
Worker ID: production-seedance-video-submit-worker
```

### 2. 检查数据库任务

```sql
-- 查看任务的请求来源
SELECT 
  id,
  locked_by,
  input_snapshot_json->>'requestHost' as request_host,
  status
FROM tasks
WHERE task_type = 'episode_generate_video'
ORDER BY created_at DESC
LIMIT 10;
```

预期结果：
```
id        | locked_by                              | request_host  | status
----------|----------------------------------------|---------------|--------
task-123  | local-DESKTOP-ABC-seedance-submit...   | 127.0.0.1     | running
task-456  | production-seedance-submit-worker      | example.com   | running
```

### 3. 测试隔离效果

**测试1：本地创建任务**
```bash
curl http://127.0.0.1:3000/api/tasks/create -d '{...}'
# 预期：被本地worker处理
```

**测试2：线上创建任务**
```bash
curl https://example.com/api/tasks/create -d '{...}'
# 预期：被线上worker处理
```

**验证SQL：**
```sql
SELECT locked_by, input_snapshot_json->>'requestHost'
FROM tasks WHERE id = 'your-task-id';
```

## 域名识别规则详解

### 本地环境识别

以下域名/IP会被识别为 `local`：
- `127.0.0.1`, `localhost`, `0.0.0.0`
- `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x` (内网IP)
- `*.local` 域名
- `*.ngrok.io`, `*.localtunnel.me` (调试工具)

### 预发布环境识别

域名包含以下关键词会被识别为 `staging`：
- `staging.example.com`
- `stg.example.com`
- `pre.example.com`, `preprod.example.com`
- `test.example.com`, `uat.example.com`
- `dev.example.com`

### 生产环境识别

其他所有域名默认识别为 `production`。

## 故障排查

### 问题：本地任务被线上worker处理了

**排查步骤：**

1. 检查任务的 `requestHost` 字段：
```sql
SELECT input_snapshot_json->>'requestHost' FROM tasks WHERE id = 'task-id';
```

2. 检查是否正确添加了域名信息：
   - 前端是否通过中间件添加？
   - 后端是否调用了 `enrichTaskSnapshotWithRequestHost`？

3. 检查域名识别逻辑：
```typescript
import { resolveWorkerIsolationConfig } from './worker-isolation.config';

const config = resolveWorkerIsolationConfig(process.env, '127.0.0.1');
console.log(config.workerEnvironment); // 应该是 'local'
```

### 问题：线上任务被本地worker处理了

**原因：** 线上环境的 `HOST` 环境变量可能未设置

**解决：**
```bash
# 线上环境设置
HOST=example.com
```

或在启动脚本中：
```bash
export HOST=$(hostname -f)
npm start
```

### 问题：历史任务无法处理

**原因：** 历史任务没有 `requestHost` 字段

**解决方案：** 历史任务默认被线上worker处理。如需本地调试：

```sql
-- 将历史任务标记为本地
UPDATE tasks
SET input_snapshot_json = jsonb_set(
  input_snapshot_json,
  '{requestHost}',
  '"127.0.0.1"'
)
WHERE id = 'task-id-here'
  AND input_snapshot_json->>'requestHost' IS NULL;
```

### 问题：Worker环境检测不准确

**场景：** Nginx反向代理丢失了原始Host信息

**解决：** 配置Nginx转发Host header
```nginx
location /api {
  proxy_pass http://backend;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

或者强制指定环境：
```bash
WORKER_ENVIRONMENT=production
```

## 最佳实践

### 1. 自动化集成

在应用启动时打印环境信息：

```typescript
import { resolveWorkerIsolationConfig } from './worker-isolation.config';

const config = resolveWorkerIsolationConfig(process.env);
console.log('🔒 Worker Isolation Config:', {
  environment: config.workerEnvironment,
  host: config.detectedHost,
  workerId: `${config.workerIdPrefix}seedance-video-submit-worker`,
});
```

### 2. 统一的请求拦截

创建统一的任务创建函数：

```typescript
// utils/task-creator.ts
import { extractRequestHost } from './request-host-middleware';

export function createTaskWithHost(
  taskType: string,
  inputSnapshot: Record<string, unknown>,
  req: Request,
) {
  return {
    taskType,
    inputSnapshot: {
      ...inputSnapshot,
      requestHost: extractRequestHost(req),
      requestedAt: new Date().toISOString(),
    },
  };
}

// 使用
const taskInput = createTaskWithHost('episode_generate_video', { prompt: '...' }, req);
```

### 3. 监控和告警

定期检查是否有环境错配：

```sql
-- 检查本地IP的任务被线上worker处理的情况
SELECT 
  id,
  locked_by,
  input_snapshot_json->>'requestHost' as host,
  created_at
FROM tasks
WHERE input_snapshot_json->>'requestHost' LIKE '%127.0.0.%'
  AND locked_by LIKE 'production-%'
ORDER BY created_at DESC;
```

### 4. 开发环境清理

定期清理本地测试任务：

```sql
-- 清理本地环境的已完成任务
DELETE FROM tasks
WHERE input_snapshot_json->>'requestHost' IN ('127.0.0.1', 'localhost')
  AND status IN ('succeeded', 'failed', 'canceled')
  AND created_at < NOW() - INTERVAL '7 days';
```

## 优势

相比手动配置环境标签：

✅ **零配置** - 无需在每个任务创建时手动添加环境标签  
✅ **自动化** - 基于请求域名自动识别  
✅ **容错性** - 历史任务自动归类到生产环境  
✅ **灵活性** - 支持强制覆盖环境识别  
✅ **可追溯** - 任务记录包含原始请求域名

## 相关文件

- `apps/backend/src/modules/model-gateway/worker-isolation.config.ts` - 核心配置和域名识别
- `apps/backend/src/modules/model-gateway/request-host-middleware.ts` - 请求域名提取中间件
- `apps/backend/src/modules/model-gateway/seedance-video.worker.ts` - Worker实现
