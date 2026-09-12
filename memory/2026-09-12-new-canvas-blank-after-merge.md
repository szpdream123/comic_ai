# 合并 main 后新画布空白

- 症状：拉取并合并远程 main 后进入新画布，整页只剩 daylight 浅色底，无节点、工具栏、助手。
- 根因：`origin/main` 的 `appendStyles(shadowRoot, …)` 合并进本地 `appendStyles(root, …)` 后，函数体仍访问未定义的 `shadowRoot.host`。新画布走 light-DOM（`styleHrefs: []`），`mountNewCanvas` 一进样式引导就抛 `ReferenceError`，catch 清空宿主，页面只剩 `.ai-canvas-standalone-page` 底色。
- 修复：改为 `root.host?.classList?.contains("is-agent-only")`，自由会话 loading 文案仍可用，light-DOM 挂载不再崩溃。
- 验证：`node --test apps/web/tests/new-canvas-host.spec.mjs` 71/71，含新增 light-DOM mount 回归。
- 状态：DONE
