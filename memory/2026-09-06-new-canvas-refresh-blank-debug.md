# 新画布刷新空白分屏调试记录

- 症状：刷新新画布页面后，上方为深色区域，下方露出浅色区域。
- 根因：桌面端 `body` 使用 `zoom: 0.75`，standalone AI Canvas 页面仍按 `100dvh` 计算高度，缩放后只覆盖约 75% 视口。
- 修复：将 `.ai-canvas-standalone-page` 与 `.ai-canvas-standalone-mount` 纳入桌面端缩放高度和最小高度规则。
- 验证：`app-scale.spec.mjs` 通过，`node --check apps/web/app.js` 与 `git diff --check` 通过。
- 状态：DONE。
