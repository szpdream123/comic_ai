# Worker Isolation Integration - 实施完成

## 概述

已成功将worker隔离机制集成到主应用程序中。系统现在会自动捕获每个生成任务的请求来源（域名/IP），并在任务快照中保存 `requestHost` 字段，供worker进行环境判断和任务过滤。

## 已完成的修改

### 1. 添加请求域名提取导入
**文件**: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`

在导入部分添加了 `extractRequestHost` 函数：
```typescript
import { extractRequestHost } from "../modules/model-gateway/request-host-middleware.ts";
```

### 2. 修改 `createGenerationTask` 函数

#### 函数签名修改
添加了可选的 `request` 参数：
```typescript
async function createGenerationTask(
  db: Awaited<ReturnType<typeof createDevDb>>,
  input: {
    // ... 其他参数
    request?: IncomingMessage;  // 新增
  },
) {
```

#### 任务快照中添加请求域名
在创建 `requestSnapshot` 时自动提取并添加请求域名：
```typescript
const requestHost = input.request ? extractRequestHost(input.request) : undefined;
const requestSnapshot = {
  // ... 其他字段
  ...generationPrioritySnapshot,
  ...(requestHost ? { requestHost } : {}),  // 新增
};
```

### 3. 修改 `createUnifiedImageGenerationTask` 函数

添加 `request` 参数并传递给 `createGenerationTask`：
```typescript
async function createUnifiedImageGenerationTask(
  input: ImageGenerationTargetAdapterContext & {
    // ... 其他参数
    request?: IncomingMessage;  // 新增
  },
) {
  // ...
  const result = await createGenerationTask(input.db, {
    // ... 其他参数
    request: input.request,  // 新增
  });
}
```

### 4. 修改 `createCanvasGenerationBatchDispatch` 函数

添加 `request` 参数并传递给 `createGenerationTask`：
```typescript
export function createCanvasGenerationBatchDispatch(input: {
  // ... 其他参数
  request?: IncomingMessage;  // 新增
}): CanvasGenerationDispatch {
  // ...
  const created = await createGenerationTask(input.db, {
    // ... 其他参数
    request: input.request,  // 新增
  });
}
```

### 5. 修改所有HTTP路由调用点

#### 图片生成API (`/api/generation/image-tasks`)
```typescript
const generationResponse = await createUnifiedImageGenerationTask({
  // ... 其他参数
  request,  // 新增
});
```

#### 视频生成API (`/api/episodes/{id}/generation/video-tasks`)
```typescript
const result = await createGenerationTask(db, {
  // ... 其他参数
  request,  // 新增
});
```

#### Canvas单节点生成
```typescript
const result = await createGenerationTask(db, {
  // ... 其他参数
  request,  // 新增
});
```

#### Canvas批量生成（2处）
```typescript
dispatchNode: createCanvasGenerationBatchDispatch({
  // ... 其他参数
  request,  // 新增
}),
```

## 工作原理

### 请求流程

1. **HTTP请求到达**: 用户从浏览器或API客户端发起生成请求
2. **域名提取**: `extractRequestHost(request)` 自动从以下来源提取域名：
   - `X-Forwarded-Host` 头（如果存在）
   - `Host` 头
   - `request.hostname`
   - `Origin` 头
3. **任务创建**: 域名被保存到任务的 `input_snapshot_json.requestHost` 字段
4. **Worker处理**: Worker读取任务时检查 `requestHost`：
   - 本地环境（127.0.0.1等）的worker **只处理** 本地任务
   - 生产环境的worker **跳过** 明确标记为本地的任务，处理其他所有任务

### 域名识别规则

根据 `worker-isolation.config.ts` 中的规则：

**本地环境识别**：
- `127.0.0.1`, `localhost`
- `192.168.x.x`, `10.x.x.x`（私有IP）
- 包含 `ngrok`, `localhost.run`, `localtunnel` 的域名
- 端口号 `3000`, `3001`, `5173`, `8080` 等开发端口

**生产环境**：
- 任何不符合本地环境规则的域名

## 验证

### TypeScript编译
✅ 已通过 `npx tsc --noEmit` 验证，无编译错误

### 测试方法

1. **本地测试**：
   ```bash
   # 启动本地worker（自动检测为本地环境）
   npm run worker:dev
   
   # 从本地发起请求（127.0.0.1或localhost）
   curl -X POST http://127.0.0.1:3000/api/generation/image-tasks \
     -H "Content-Type: application/json" \
     -H "Idempotency-Key: test-$(date +%s)" \
     -d '{"target": {...}, "prompt": "test"}'
   ```

2. **验证任务快照**：
   ```sql
   SELECT 
     id,
     task_type,
     input_snapshot_json->>'requestHost' as request_host,
     input_snapshot_json->>'requestedAt' as requested_at,
     status
   FROM tasks
   WHERE task_type = 'episode_generate_video'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **验证worker行为**：
   - 本地worker应该只处理 `requestHost = '127.0.0.1'` 或 `'localhost'` 的任务
   - 生产worker应该跳过本地标记的任务

## 相关文件

- `apps/backend/src/entrypoints/phone-auth-dev-server.ts` - HTTP路由和任务创建
- `apps/backend/src/modules/model-gateway/request-host-middleware.ts` - 域名提取逻辑
- `apps/backend/src/modules/model-gateway/worker-isolation.config.ts` - Worker隔离配置
- `apps/backend/src/modules/model-gateway/seedance-video.worker.ts` - Worker实现（已集成隔离逻辑）

## 环境变量

在 `.env` 中启用worker隔离：
```bash
ENABLE_WORKER_ISOLATION=true
# 可选：强制指定worker环境（通常自动检测即可）
# WORKER_ENVIRONMENT=local
```

## 下一步

系统现在已经完全集成了worker隔离功能：

1. ✅ 请求域名自动捕获
2. ✅ 任务快照中保存 `requestHost`
3. ✅ Worker根据环境过滤任务
4. ✅ 非对称隔离策略（本地严格，生产宽松）

可以立即在本地环境部署使用，无需等待生产部署。本地worker只会处理本地任务，不会与生产环境的任务冲突。
