# 独立模型服务接入契约

2026-09-29。实现目录：`apps/model-service`。本轮仅提供模型能力，不提供公共账号、会员、支付、积分、项目、素材库或宣传片制作编排。旧业务源码及规则保持原样。

## 运行与配置

从仓库根目录运行，使用现有 Node.js 运行时与依赖。独立进程只需要 PostgreSQL、现有模型配置/密钥记录及实际模型供应商；无需启动旧创作服务、Redis、旧生成 worker 或旧素材服务。

启动脚本只读取根目录正式 `.env`，使用其中原始 `DATABASE_URL`，不回退 `.env.local` 或 `TEST_DATABASE_URL`。如配置了 `DATABASE_SCHEMA`，在该已有 schema 下读写。下列为部署配置示例；本机真实联调已配置专用身份，实际密钥不进入版本库：

```dotenv
MODEL_SERVICE_HOST=127.0.0.1
MODEL_SERVICE_PORT=8787
MODEL_SERVICE_HMAC_KEYS_JSON={"promo-agent-v1":{"workerId":"promo-agent","secret":"REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS"}}
MODEL_SERVICE_PRODUCTS_JSON={"promo-agent":{"models":{"text":["实际文本模型代码"],"video":["实际客易云模型代码"],"speech":["实际百炼语音模型代码"],"transcription":[]},"mediaOrigins":["https://实际素材域名"]}}
```

`workerId` 标识产品服务，不是最终用户。模型名单须显式配置，空数组表示不授权。密钥应为高熵随机值且不少于 32 字符；浏览器、Agent 模型和最终用户不得持有服务密钥。远程接入通过 HTTPS 反向代理，默认仅监听本机，不开放浏览器跨域调用。服务密钥/产品授权配置变更后重启；后台模型启停每次提交重新读取。

新环境部署前运行一次新增表迁移（本机联调环境已执行）：

```powershell
npm run db:model-service:migrate
npm run start:model-service
```

迁移只创建 `model_service_requests`、`model_service_nonces` 及索引，不运行旧业务迁移、不搬历史数据。建议迁移角色与运行角色分离：运行角色仅对两张新表具有 SELECT/INSERT/UPDATE/DELETE 权限，对 `ai_model_configs`、`admin_secret_values` 具有 SELECT 权限。旧配置表应已初始化；独立服务不会创建或修补旧配置表。

原后台模型/供应商/密钥管理入口继续管理配置。服务目录只读密钥引用及请求域名元数据，执行时才读取该引用的当前密钥；密钥不进入调用记录。每次接收任务固定模型和路由，后续后台改路由不会把旧任务轮询到另一供应商。后台密钥引用停用后不得回退环境密钥；仅没有对应后台引用的显式 `apiKeyEnv` 才使用 `.env` 同名变量。

显式 `apiKeyEnv` 同时匹配不同记录的 `secret_key` 与 `secret_ref` 时，沿用旧后台的 `secret_key` 优先顺序；该记录即使已停用也不能转用另一引用或环境密钥。

进程停止时停止领取新任务并等待执行中任务收尾，异常中断从数据库恢复。PostgreSQL 错误报告 `DATABASE_URL` 及脱敏错误码并停止，不切换数据库。供应商故障按任务状态处理。

## 服务身份与请求隔离

前缀保持 `/api/integrations/promo-agent`，但这是新的独立服务契约，旧 Python 客户端需要适配；不能仅改 BASE_URL 就视作兼容。旧业务后台不再挂载此前未发布的 promo-agent 会员/积分桥接路由。

复用 HMAC v1 UTF-8 字节签名：`x-comic-ai-version`、`x-comic-ai-worker-id`、`x-comic-ai-key-id`、`x-comic-ai-timestamp`（毫秒）、`x-comic-ai-nonce`（UUID）、`x-comic-ai-content-sha256`、`x-comic-ai-signature`。以下字段用换行连接，HMAC-SHA256 后 base64url，签名前缀 `v1=`：

```text
v1
HTTP_METHOD
PATH_WITH_QUERY
WORKER_ID
KEY_ID
TIMESTAMP
NONCE
SHA256_OF_RAW_BODY
```

GET 空请求体同样参与摘要，查询参数编码及顺序须与签名一致。时间窗口 ±5 分钟；nonce 在数据库持久化，跨进程/重启防重放。每次重试用新 nonce。

所有 POST 必须包含 `subjectId`、`requestKey`，并带值与正文 `requestKey` 完全一致的 `Idempotency-Key`。`subjectId` 是产品内稳定、不含敏感信息的用户标识，由已鉴权的产品服务填写。不解析旧用户 ID，不要求旧登录 Bearer token。产品服务校验最终用户及素材权限；模型服务按密钥确定产品身份，正文不能覆盖。

幂等作用域是产品＋subjectId＋requestKey，覆盖文本、视频、语音。同键同参数复用调用；改参数返回 409。不同键视为新的供应商调用，客户端不得因超时或未知结果自动换键。

## 最小接口

| 方法与路径 | 契约 |
| --- | --- |
| `GET /text-models` | `{models:[{modelCode,displayName,provider,...}]}`，仅列启用、授权且支持的文本模型 |
| `GET /models` | 视频目录；`?operation=speech` 查语音，`?operation=transcription` 当前为空 |
| `POST /text-completions` | `model,subjectId,requestKey,prompt` 或 `messages`；通常同步返回结果，处理中/未知返回 202 |
| `POST /video-generations` | `model,subjectId,requestKey,prompt,parameters`；202 返回 taskId/requestId |
| `GET /video-generations/{taskId}?subjectId=...` | 视频状态、结果、用量，仅限本产品及 subject |
| `POST /audio-generations` | `operation:"speech",model,subjectId,requestKey,prompt,parameters`；202，使用公共请求查询接口 |
| `GET /requests/{requestId}?subjectId=...` | 查询所有类型，包括文本断线后的结果和语音结果 |

查询返回 200，失败任务保留标识。POST 复用终态返回 200（必须检查业务 status）；进行中/未知返回 202。字段：`requestId,model,modelCode,operation,status,usage`；视频额外 taskId。成功按类型带 `content,toolCalls,videoUrl,audioUrl`；失败/未知时 error 为稳定脱敏码。不透传原始供应商响应或诊断。

状态：`queued / submitting / running / succeeded / failed / result_unknown`。本轮不含取消、批量调用或流式公共响应。音视频返回供应商 HTTPS 成果地址，服务不下载/永久托管成片；产品应及时安全转存，不能把临时链接视作永久素材。

## 文本、多模态与工具消息

支持现有 `openai_compatible_chat`、`cumob_chat`。prompt/messages 二选一，prompt 转为单条 user 消息。允许 system/user/assistant/tool；user 内容可含 text、image_url、video_url、input_audio。input_audio 接受 wav/mp3 base64，整个 JSON 上限 2 MiB。

支持 `tools,tool_choice,response_format,temperature,max_tokens,thinking`，保留 assistant tool_calls 和 tool_call_id，但不执行工具。后台 temperature/max_tokens/response_format/thinking 默认值固定进入接收时 payload，调用参数可覆盖。Cumob 仍遵循已有适配器语义（忽略 max_tokens/thinking）。协议可传输模态内容不等于具体模型具备全部能力，接入方须选择对应模型并做样例联调。

文本因长度限制结束返回 `failed/provider_output_incomplete`，供应商内容过滤返回 `failed/provider_content_filtered`；工具参数或声明的 JSON 输出无法解析时返回 `failed/provider_output_invalid`。这些已结束的调用仍保留供应商用量，不能把失败状态解释为未产生费用。无完整终止信息的断流仍是 `result_unknown`，均不自动重发。工具参数只验证 JSON 语法，工具权限与参数业务校验由新产品执行。

素材 URL 仅接受 mediaOrigins 中准确的 HTTPS origin，不支持通配符、IP 字面量、凭据 URL、本机/内部域名。产品先鉴权再给出有效签名 URL，确保该域名受控、不重定向到未授权资源，并在排队及供应商读取期间有效。服务不读取旧素材表，也不按旧 storageObjectId 重签名。

```json
{
  "model": "实际视觉模型代码",
  "subjectId": "product-user-123",
  "requestKey": "analysis:project-1:shot-2:v1",
  "messages": [{"role":"user","content":[
    {"type":"text","text":"描述这张画面"},
    {"type":"image_url","image_url":{"url":"https://实际素材域名/frame.jpg?signature=..."}}
  ]}],
  "max_tokens": 800
}
```

## 视频与声音

promo-agent 视频仅开放现有 GlobalAiOpc 适配器；旧业务供应商没有迁移或移除。参数允许 durationSec/duration、aspectRatio/ratio、resolution、seed、generateAudio、watermark、referenceMode/mode、firstFrame/lastFrame，以及 referenceImages/referenceVideos/referenceAudio/referenceAudios/filePaths/videoFilePaths/audioFilePaths。参考资源满足 URL 约束；未知参数、供应商端点/密钥覆盖字段拒绝接收。

时长必须为 JSON 正整数，seed 为整数，generateAudio/watermark 为布尔值，比例与分辨率为非空字符串；不接受用字符串或布尔值替代数值。referenceMode 仅支持 `frame/image`，mode 仅支持 `first-frame/first-last-frame/reference-video`。显式参数覆盖同组的所有后台默认别名：durationSec/duration、aspectRatio/ratio、referenceMode/mode。同请求同时提交一组内多个字段返回 400，避免供应商侧按字段优先级静默选值。

语音合成复用 `aliyun_bailian_audio`。prompt 为旁白文本，parameters 至少有供应商要求的 voice（或 voiceId）；可传 format、sampleRate/sample_rate、volume、rate、pitch。目录仅公开筛选后的默认标量参数，未公开完整供应商 schema。

语音 voice/voiceId、sampleRate/sample_rate 同样按显式请求优先处理，每组只传一个字段。采样率和音量用整数，rate/pitch 用数值；不支持旧适配器会忽略的 mode 字段。

明确缺口：未新增独立 ASR/转写适配；可用多模态模型接收 input_audio 理解声音，但不等于已实现带时间戳专用转写。Modelflare 现有适配不能完整保留工具/音频契约，本轮不开放该协议。抽帧、音轨提取、分段、素材分析编排、配音混音都留在 promo_agent。

## 恢复与计量

请求持久化后才执行。数据库原子领取及 token 租约防止重复执行和旧 worker 覆写。文本可在 HTTP 请求内领取；视频/语音由进程内循环领取/轮询。多个进程共享数据库去重，无需旧任务队列。

任务结束前先停止续租并等待已开始的续租完成，再写入结果；正常丢失租约不会覆盖其他 worker 的记录，也不会被当作数据库故障停止整个服务。

提交阶段进程中断、响应丢失或超时后转为 result_unknown，不自动再发 POST。已有供应商任务 ID 的轮询可恢复；认证/网络/无效查询响应仅重试原任务查询，不当作生成失败。轮询间隔 10 秒，最长记录年龄 24 小时；已提交调用到期标为未知，需人工核对供应商记录，不自动退款或重新生成。

用量只返回供应商明确给出的有限数值字段（prompt_tokens/completion_tokens/total_tokens/input_tokens/output_tokens/characters）。缺失返回 null；当前视频适配没有用量返回，不以 0 代替未知。不计算积分、不扣钱、不读取钱包；产品按 requestId 幂等记录成本并结算。

请求表包含必要输入（含临时素材 URL）、固定路由、状态、用量和结果，不含供应商密钥/原始诊断。需限制表和备份访问。为保留超时重试去重能力，本轮不自动删除调用记录；清理须在双方明确重试保留期后另行实施。

## 验证边界

离线执行 `npm run test:model-service`：真实 SQL 引擎覆盖幂等/隔离/租约/快照重启恢复；注入传输覆盖供应商多模态/语音/视频、HMAC、原始字节、参数和错误脱敏。不会连接 `.env` 的运行服务。

2026-09-29 复审验证结果：60/60 通过，包含独立入口打包和旧业务依赖排除检查、参数别名的实际出站请求、异常文本结果、凭据交叉匹配和续租完成竞态。旧适配器回归 32/34 通过；未改动的 Cumob 适配器有两项错误脱敏测试失败，新服务自己的 HTTP/SSE 错误脱敏测试通过。旧 `apps/backend` 源码无差异，未借此次抽离修补旧行为。

上述为离线复审结果。随后用户授权真实联调：正式 `.env` 数据库已完成新服务两张表迁移，已配置专用 HMAC 身份并在本机启动独立服务；Python 客户端适配、目录、鉴权隔离、文本生成、视频生成、幂等及在途重启恢复均已验证。视频完整解码通过，但实际 1256×720 未通过严格 1280×720 尺寸断言；语音和 ASR 未完成真实验收。证据见 [真实联调记录](./model-service-live-integration.md)。尚未生产部署，完整宣传片制作仍需两个项目后续联调。

## Python 客户端适配清单

相邻 `promo_agent` 会话已参与审查，并完成客户端适配与真实文本/视频联调，客户端本地测试 14/14 通过。下表保留旧契约与新契约的迁移对照，供其他接入方参考：

| 现状 | 新模型服务要求 |
| --- | --- |
| 请求要求旧 user_token/Bearer | 新产品自行鉴权，可信后端填写 subjectId 并使用服务 HMAC |
| 文本无幂等键，视频仅发头部幂等键 | 所有 POST 正文包含 subjectId/requestKey，并与 Idempotency-Key 一致 |
| 查询只带任务 ID | 查询带 subjectId，URL 编码后完整路径和查询串参与签名 |
| 只接受 queued/running/succeeded/failed | 同时处理 submitting/result_unknown；未知结果保留原 requestKey，不自动重新收费调用 |
| 含 error 通常直接抛错 | 保留合法任务的 requestId/status/usage/error，包括 failed 和 result_unknown |
| 文本只有 prompt/content，只有视频任务类型 | 增加 messages/tools、多模态、音频提交、通用请求查询及用量结果类型 |

仅含 toolCalls 的文本成功结果是合法结果，不要求 content 非空。视频目录兼容 `globalaiopc_video` 和 `global_ai_opc_video` 两个协议名称。已提交任务的恢复不能被最新目录中的模型下架拦住，应查询原请求，或使用原请求体、原 requestKey 和新 nonce 幂等取回结果；恢复前不要强制重新通过目录可用性检查。

其他接入方不能仅替换旧客户端服务地址后宣称接入完成，仍须满足上述契约。新产品负责模型结果之后的工具执行、素材与项目归属、预算和积分结算；公共模型服务不引入这些业务表。
