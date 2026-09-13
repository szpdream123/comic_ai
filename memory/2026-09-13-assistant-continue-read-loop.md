# 新画布 AI 助手循环输出「继续读」

- 症状：助手说要分段读取节点完整正文后，同一条消息里无限重复「继续读」。
- 根因：`canvas_query` 的 `outputText` 只返回最多 400 字摘要（`truncated:true`），没有节点续读工具；模型把剧集 `series_read` 的「用 offset 继续读」写成了对话正文。
- 修复：新增 `canvas_read_node` 按 `nextOffset` 分段读节点正文；摘要标记 `readTool`；折叠对话里的「继续读」循环。
- 验证：`Canvas Agent reads truncated node text via canvas_read_node instead of looping 继续读`
- 状态：DONE
