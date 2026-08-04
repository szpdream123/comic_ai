# BananaRouter 图片调用异步化设计

## 目标

彻底移除 BananaRouter 图片模型的供应商同步调用能力。`gpt-image-2` 的生成与编辑请求只允许使用 BananaRouter 官方异步任务接口，提交后由现有生成队列持续轮询任务状态并持久化结果。

本次只改变 BananaRouter 图片协议。其他供应商继续按各自已验证的协议工作；未来只有在供应商提供可恢复的异步提交与结果查询接口后，才逐个迁移到供应商异步协议。

## 非目标

- 不把缺少异步任务接口的供应商强制改成 `async_polling`。
- 不重构现有生成队列、计费、任务中心或供应商适配器公共接口。
- 不改变 BananaRouter 的 Sora2、Seedance 视频协议。
- 不增加 Webhook 接收链路。本次继续使用现有轮询链路，避免引入公网回调、签名密钥和重复终态处理风险。

## 官方协议基准

协议以 <https://bananarouter.com/docs/async-task> 为准：

- 生成提交：`POST /v1/images/generations/async`
- 编辑提交：`POST /v1/images/edits/async`
- 结果查询：`GET /v1/async-tasks/{taskID}`
- 提交成功：HTTP `202`，响应包含 `taskID`、`status`、`createdAt`
- 幂等键：`Idempotency-Key`，同一令牌下 24 小时内复用相同值返回原任务
- 轮询状态：`queued`、`running`、`retry`、`success`、`failed`、`cancelled`、`expired`
- 成功结果：`resultImages[].url`
- 建议轮询间隔：至少 5 秒；项目现有统一间隔为 30 秒，符合要求

## 运行时设计

### 提交

`BananaRouterProviderAdapter.submit` 在图片请求格式下不再检测端点是否异步，也不再解析同步图片产物：

1. 无参考图时固定使用生成异步端点。
2. 有参考图时固定使用编辑异步端点；缺少编辑端点时直接拒绝配置或创建适配器。
3. 每次提交始终发送 `Idempotency-Key: providerRequestId`。
4. 只接受包含非空 `taskID` 的异步任务响应。
5. 返回 `accepted` 或 `running`，不允许在提交阶段返回 `succeeded` 和图片产物。

### 模糊提交恢复

发生网络断开、客户端超时或未知提交结果时，继续使用同一个 `providerRequestId` 重新提交：

- 24 小时幂等窗口内允许恢复提交，由供应商返回原 `taskID`。
- 超过 24 小时不自动重放，避免创建新任务和重复扣费。
- 不再存在“仅异步端点才可恢复”的分支，因为 BananaRouter 图片适配器只接受异步端点。

### 轮询

供应商状态映射如下：

| BananaRouter 状态 | 内部状态 | 行为 |
| --- | --- | --- |
| `queued` | `accepted` | 继续轮询 |
| `running` | `running` | 继续轮询 |
| `retry` | `accepted` | 继续轮询 |
| `success` | `succeeded` | 校验并持久化 `resultImages[].url` |
| `failed` | `failed` | 终止并保留供应商诊断 |
| `cancelled` | `failed` | 终止并保留供应商诊断 |
| `expired` | `failed` | 终止，禁止无限轮询 |

成功状态没有合法图片 URL 时仍按供应商响应无效处理。图片 URL 继续执行公网 HTTPS 安全校验。

## 配置边界

后端是最终安全边界。`validateBananaRouterProviderConfig` 对 BananaRouter 图片配置要求：

- `invocationMode` 必须是 `async_polling`。
- 生成端点必须精确匹配 `/v1/images/generations/async`。
- 编辑端点必须精确匹配 `/v1/images/edits/async`。
- 查询端点必须精确匹配 `/v1/async-tasks/{taskId}`。
- `requestFormat` 必须是 `banana_router_openai_images`。

后台模板固定生成上述配置。高级编辑器可以继续服务其他模型，但 BananaRouter 图片配置不得保存为同步模式；服务端校验保证绕过前端也无法恢复同步调用。

## 数据收敛

未发布的 `20260828-bananarouter-image-async-config-convergence.sql` 继续负责将旧配置收敛到异步模式，但删除“同步回滚快照”：

- 更新 `invocation_mode = 'async_polling'`。
- 写入正确的生成、编辑与查询端点。
- 增加 `capabilities.asyncPolling = true`。
- 确保图片轮询队列为 `generation-poll-image`。
- 不产生可通过后台回滚恢复的同步配置。

历史已应用迁移不修改。新环境按迁移顺序先创建旧记录，再由收敛迁移在服务启动前统一修正；运行时校验始终拒绝同步 BananaRouter 图片配置。

## 安全与失败处理

- 不降低现有供应商域名白名单、响应体大小限制、产物 URL 校验或错误诊断。
- `Idempotency-Key` 不使用用户输入，继续使用系统生成的稳定供应商请求 ID。
- 不自动启用 Webhook，避免未完成的 HMAC 校验或伪造回调风险。
- 数据迁移保持事务性和行锁，避免模型配置与调度策略只更新一半。
- 当前配置若尚未收敛，运行时会明确拒绝调用，不会退回同步供应商接口。

## 测试策略

先写失败测试，再实施：

1. 同步 BananaRouter 图片配置必须被校验器拒绝。
2. 同步生成或编辑端点必须被拒绝，即使调用方式填成异步。
3. 图片提交始终发送幂等键，只返回任务 ID，不解析同步产物。
4. 参考图请求必须走 `/v1/images/edits/async`。
5. 模糊提交在 24 小时内复用幂等键，超过窗口不重放。
6. `expired` 映射为终态失败，`retry` 保持可轮询。
7. 收敛迁移不再创建同步回滚修订，并可重复执行。
8. 后台模板与保存逻辑不能生成 BananaRouter 图片同步配置。

完成后运行后台页面测试、BananaRouter 适配器测试、后台模型 HTTP 契约测试、迁移注册与幂等测试，并用 `gstack` 验证本地后台页面可访问、配置保存行为和控制台网络错误。

## 验收标准

- 代码库中 BananaRouter 图片运行时不存在同步图片结果处理分支。
- 任意 BananaRouter 图片同步配置在管理接口和适配器工厂处都被拒绝。
- 正常生成与编辑请求提交后进入轮询队列，任务中心最终展示成功图片或明确终态失败。
- 其他供应商和 BananaRouter 视频模型测试无回归。
- 代码审查未发现未处理的 SQL 安全、竞态、枚举遗漏或回滚到同步链路的入口。
