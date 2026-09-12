# 新画布生成完成仍停在生产中

- 症状：节点生成完成后一直转圈，无法重新生成。
- 根因：任务中心桥接把 GET `/assistant/tasks/:id` 改成等待任务中心。完成判定要求 `completed/succeeded` **且** 解析出媒体 URL；URL 只读 `result.imageUrl|sourceUrl|downloadUrl` 和 `fixedImages[0].url`，漏了 `previewUrl` / `result.images` / `generatedOutputItems`。任务已完成但 URL 对不上时轮询永不结束，运行时 `status` 停在 `loading`，对话框 `canGenerate` 因此禁用。宿主文档 `completed` 也未映射成运行时 `success`。
- 第二轮证据：任务中心 `51e4070c-...` 已成功，但 `target_id` 是画布 ID，不是节点；`node-zts5tsxsm` 被存成 `status=loading` 且没有 `taskId`，刷新后仍转圈。
- 修复：
  - 终态状态即可结束等待，不再要求 URL。
  - 补齐媒体 URL 解析字段。
  - `completed`/`succeeded` 映射为 `success`。
  - 提交/轮询时绑定当前正在生成的节点。
  - 画布级完成任务回写到正在生成的节点，并写入 `imageUrl`。
  - 加载无 `taskId` 的过期 `loading` 节点时恢复为 `success`/`idle`。
- 验证：完成态映射、任务中心注册、画布 URL 回写、画布级任务投影测试通过。
- 状态：DONE_WITH_CONCERNS（需刷新画布后确认卡住节点恢复）
