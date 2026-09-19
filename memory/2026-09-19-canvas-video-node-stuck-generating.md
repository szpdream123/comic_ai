# 任务中心已完成但画布视频节点仍在生成中

- 症状：任务中心「画布视频」已完成且能播放，画布 `ai-video` 节点仍显示「生成视频中」。
- 根因：任务中心用 `resultAssets` / `storageObjectId` / `previewUrl` 展示视频；画布投影把「完成但没有 `videoUrl`」当成无媒体，跳过回写。`ai-video` 轮询目标也只认 `type === "video"`，漏了运行时节点类型。
- 修复：
  - 视频完成判定对齐图片，认 `resultAssets`、`previewUrl`、`sourceUrl`、`downloadUrl`、`storageObjectId`。
  - 画布结果绑定从 `resultAssets` 写入 `videoUrl`，必要时用存储对象 URL。
  - 运行时任务等待同样能解析存储对象视频。
  - 轮询目标把 `ai-video` / `source-video` 当成视频。
- 验证：画布视频资产回写、任务中心投影、图片回写、任务中心轮询测试通过。
- 状态：DONE_WITH_CONCERNS（需刷新画布后确认卡住节点恢复）
