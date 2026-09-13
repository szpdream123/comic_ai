# 新画布节点拖动卡顿

- 症状：新画布拖节点卡顿；缩小到 10% 后更明显；未松手就发 `positions`/`document`。
- 根因：拖动中途 `node:moved` 被当成松手并保存。缩小后 HTML 节点仍按原尺寸排版，同步重绘连线/embedding/图片。
- 修复：未松手不保存。缩小拖动时改异步绘制、暂停 embedding，并隐藏图片/视频/连线重绘。
- 验证：相关 canvas-workflow 测试待跑。
- 状态：DONE_WITH_CONCERNS（需缩小到 10% 后手拖节点确认）
