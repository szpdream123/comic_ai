# 原著上传后没有任何反应

- 症状：剧集栏点上传 txt/md，选完文件后仍显示「未添加」，无 toast。
- 根因：浏览器文件选择器在 `focus` 后 300ms 拆掉 hidden input，Windows 上常在 `change` 前把 Promise 收成 `null`，后续错误又被吞掉。
- 修复：去掉 focus 取消；原著引用带上 COS `filePath`；浏览器不再为原著强行「转为剧集」。
- 状态：DONE
