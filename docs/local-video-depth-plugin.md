# 本地视频深度插件

该插件在用户电脑的 Python/显卡环境中运行 `Depth Anything V2 Small`，把普通视频转换为灰度相对深度视频。源视频只发送到 `127.0.0.1`，不会经过应用服务器。

## 安装

Windows PowerShell：

```powershell
cd plugins/video-depth
Set-ExecutionPolicy -Scope Process Bypass
.\install-local-video-depth.ps1 -AllowedOrigin https://your-app.example.com
```

默认安装 PyTorch 通用版本。NVIDIA 用户应按自己的 CUDA 版本从 PyTorch 官网选择索引，例如：

```powershell
.\install-local-video-depth.ps1 -TorchIndexUrl https://download.pytorch.org/whl/cu128
```

仅在排查时手动启动：

```powershell
& .\plugins\video-depth\.venv\Scripts\python.exe .\plugins\video-depth\local-video-depth-service.py
```

安装脚本会自动在后台启动插件并检查 `http://127.0.0.1:48123/health`。仅在需要手动排查时才使用上述启动命令；启动失败日志位于 `plugins/video-depth/service.stderr.log`。

首次推理会从 Hugging Face 下载 `Depth-Anything-V2-Small-hf` 权重。也可以设置 `VIDEO_DEPTH_MODEL` 指向本地模型目录；设置 `VIDEO_DEPTH_DEVICE=cpu` 可验证流程但速度较慢。

## 浏览器接口

服务只监听 `127.0.0.1:48123`。`GET /health` 无需令牌；提交和下载接口可通过 `VIDEO_DEPTH_PLUGIN_TOKEN` 开启令牌校验（请求头 `X-Comic-AI-Plugin-Token`）。允许的网页来源由 `VIDEO_DEPTH_ALLOWED_ORIGINS` 配置，默认包含本地开发端口。安装时传入 `-AllowedOrigin` 会写入插件目录下的 `plugin.env`，用于授权正式站点域名。

服务会在已授权来源的预检响应中返回 `Access-Control-Allow-Private-Network: true`，支持 HTTPS 正式站点连接本机回环地址。

```text
GET  /health
POST /jobs                 multipart/form-data，字段 file（mp4/webm/mov）
GET  /jobs/:id             返回 queued/running/succeeded/failed
GET  /jobs/:id/output      成功后返回灰度 MP4
```

提交返回 `202`，前端轮询状态，成功后以 `outputUrl` 下载。服务默认限制单文件 500MB，结果保留 1 小时；可通过 `VIDEO_DEPTH_PLUGIN_MAX_BYTES` 与 `VIDEO_DEPTH_PLUGIN_RESULT_TTL` 调整。

## 打包和分发

插件安装器需要用户明确确认，不能由网页静默执行。生产分发时应把 Python 运行时、依赖和模型放入签名安装包，并为每次安装生成随机 `VIDEO_DEPTH_PLUGIN_TOKEN`；网页只调用回环地址，服务不得绑定公网网卡。
