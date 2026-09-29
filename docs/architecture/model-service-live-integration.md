# 公共模型服务真实联调记录

2026-09-29。用户在 promo_agent 会话授权真实文本及视频调用。本会话负责服务端配置、启动和任务协查；相邻「梳理项目并设计竞品架构」会话负责 Python 客户端适配及统一发起付费调用，避免重复生成。

## 服务端已完成

- 使用旧项目正式 `.env` 中的 `DATABASE_URL`，数据库连接成功；未回退其他地址。
- `npm run db:model-service:migrate` 成功，仅创建/检查新服务两张表与索引。
- 为本次联调配置全新专用 HMAC 身份；供应商密钥和数据库凭据保留在旧项目端。密钥值不进入文档或日志。
- 在正式 `.env` 增加四个 `MODEL_SERVICE_*` 配置，文件受 Git 忽略；原配置项未替换。
- `npm run start:model-service` 已监听 `http://127.0.0.1:8787`，前缀 `/api/integrations/promo-agent`。
- 真实签名请求 `GET /text-models`、`GET /models` 均返回 200；各自原样重放返回 409。
- 旧 `apps/backend` 源码无差异；未停止旧业务进程、未部署、未提交或推送代码。

## 本次授权目录

| 类型 | 模型代码 | 备注 |
| --- | --- | --- |
| 文本 | `deepseek-noval` | OpenAI 兼容协议，后台凭据可解析 |
| 文本 | `cumob-gpt-5-6-sol` | Cumob 协议，后台凭据可解析 |
| 视频 | `sd_2.0_special` | 客易云，目录声明支持文生视频 |

视频建议首测参数：`durationSec: 5`、`aspectRatio: "16:9"`、`resolution: "720p"`，纯提示词，无需素材或 mode 参数。该模型后台最小值为 4 秒但下拉选项从 5 秒开始，因此采用 5 秒作为首测配置。

目前 `mediaOrigins` 为空；素材调用需先配置新产品已授权的 HTTPS 来源。当前启用目录没有可供该服务使用的百炼语音模型，因此 speech/transcription 名单为空，本次不能宣称语音或 ASR 真实验收通过。

## 待完成的验收

Python 客户端适配、真实文本输出、客易云视频成片、状态/结果/用量返回、同键重复调用复用结果。上述付费测试由相邻会话发起，当前服务端准备记录不等于生成链路已验收成功。

## 首轮真实请求协查

相邻会话统一发起，本服务端未另行提交付费请求。产品范围为 `promo-agent`，联调 subject 为 `promo-live-test-20260929`。

| 请求 | 数据库核查结果 |
| --- | --- |
| `dd5162d4-c4ec-4d81-920b-45ee6f3535ce` / `live-20260929-text-01` | `failed/provider_output_incomplete`；首次 max_tokens=64 截断。供应商标识及 prompt=39、completion=64、total=103 用量均保存，租约已释放。 |
| `f5daf13c-8721-4e2c-a61f-55d06d8186e9` / `live-20260929-text-02` | `succeeded`；prompt=39、completion=115、total=154。 |
| `0b8ab78c-4083-4b70-8646-031df577b30e` / `live-20260929-video-01` | `running`；客易云任务标识 `mcp_e36ecdae0b244e74a568e08a5de39284` 已保存，error=null，等待成片，usage=null。 |

三组幂等键在上述产品与 subject 下各只有一条记录；专用身份的 nonce 已在正式数据库持久化。当前服务端记录支持“请求未重复建行、供应商任务标识已保存”的结论，尚未直接审计供应商账户的任务总数。重放后的标识稳定性及视频最终结果待后续核对。服务继续运行，未重启。

随后相邻会话确认：文本 text-02 严格返回“联调通过”，10 项在线协议检查通过，覆盖同键同 ID、同键异正文 409、错误 subject 404、通用查询一致、nonce 重放 409 和错误签名 401。本端再次核对同键重放后的视频记录：仍为一条，requestId 和上述 external_id 均不变；视频仍在生成，最终 MP4 待验。

现有 ffprobe/ffmpeg 可供相邻会话验收成片，分别位于旧项目 `node_modules/@ffprobe-installer/win32-x64/ffprobe.exe` 和 `node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe`。已确认文件存在，未额外安装。

## 在途任务受控重启验收

由相邻会话协调发起，只操作本次独立服务。重启前监听 PID 为 1428，确认命令行为 `node --import tsx scripts/run-model-service.mjs`；视频状态 running，无活动租约。向其原执行会话发送 Ctrl+C，确认 8787 监听已消失后，以原正式 `.env` 启动同一脚本，未使用强制终止或操作其他进程。

新进程 PID 42512，启动时间 `2026-09-29T05:20:19Z`。重启后真实签名查询返回 HTTP 200 / running，requestId 仍为 `0b8ab78c-4083-4b70-8646-031df577b30e`。对应幂等范围内仍只有一条记录，external_id 仍为 `mcp_e36ecdae0b244e74a568e08a5de39284`。数据库 updated_at 为 `05:20:55Z`，晚于新进程启动时间，next_run_at 为 `05:21:05Z`，error=null，说明新进程已恢复轮询原供应商任务。

证据边界：正式数据库迁移、HTTP 鉴权与隔离、文本结果/用量、视频接受、幂等记录稳定性、重启后轮询均为实测。旧后端零差异、独立入口排除会员/积分/制作业务依赖为源码与离线打包证据；没有停止旧业务进程做独立性实验，也未直接审计供应商账户的总任务数。当前证据不能替代视频最终成片验收。

## 视频完成状态

随后正式数据库记录于 `2026-09-29T05:21:07.195Z` 更新为 succeeded，已保存 videoUrl，error=null、usage=null、租约已释放。产品/subject/requestKey 范围仍只有一条记录，requestId 和供应商 external_id 均与提交时相同。此时序晚于重启后 `05:20:55Z` 的 running 观测，因此本轮验证的是在途任务恢复并随后完成。相邻会话开始下载结果并验收实际 MP4；文件验收结论待其提供。

## 成片验收与尺寸限制

相邻会话随后完成文件验证：2,009,150 字节，ffmpeg `-xerror` 全解码退出 0；H.264、24 fps、视频 5.041667 秒，AAC 音轨，总时长 5.061995 秒，抽帧内容符合日出湖泊提示。SHA256 为 `4c27e5f7bf5c280d0e1a0fdf89474e63a24c328360f442a6b870d3ce1ddd718c`。客户端本地测试 14/14 通过。

实际画面为 1256×720，SAR=1:1、DAR=157:90；严格 1280×720 的断言失败，保留 `dimensions_match=false`。核心生成、查询、幂等及在途恢复链路已通过真实联调，精确画布尺寸未通过，不能将两者混为同一验收结论。

服务端核对本次持久化 payload：`resolution=720p`、`aspectRatio=16:9`、`durationSec=5`。使用该固定模型快照及 payload，经现有适配器注入模拟传输重建出站字段，得到 `model=sd_2.0_special`、`aspect_ratio=16:9`、`resolution=720p`、`duration=5`、`watermark=false`，没有另发真实供应商 POST。此证据是输入与映射重建，不是当时的网络抓包；服务仅保存规范化结果 usage/videoUrl，未保存原始供应商响应，因此不能断言供应商回显了请求参数，也不能推断其尺寸规则。未修改成片或额外生成；精确画布如需调整，应由新产品剪辑合成环节明确处理。
