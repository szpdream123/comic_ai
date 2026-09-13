# 新画布 AI 助手响应失败需手动继续

- 症状：长任务跑到一定程度后助手消息变成「响应失败」，只能点「继续」。
- 根因：模型轮次/工具上限会把任务标成 paused/failed，消息 status=error，没有自动 resume。
- 修复：`conversationExecutionController` 在失败后自动继续，最多 5 次；用户点继续会清计数。
- 验证：`Canvas Agent auto-resumes a failed response up to 5 times`
- 状态：DONE
