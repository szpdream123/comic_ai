# 原著 txt 被当成媒体上传拒绝

- 症状：剧集栏上传 txt/md 原著，控制台 `仅支持图片、视频和音频文件`，`POST /api/storage/upload-sessions` 400。
- 根因：浏览器走了文档 `uploadLimits`，但请求 `purpose` 仍按画布素材校验；成功后也没回传 `filePath`。
- 修复：按原著/剧本文档 limits 推断 `series-original` / `script-documents`；COS 上传结果带回 `filePath`。
- 验证：creator-api 与 runtime adapter 回归测试通过。
- 状态：DONE
