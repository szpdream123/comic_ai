# 新画布打开 AI 助手后鼠标移动闪烁

- 症状：新画布打开 AI 助手后，鼠标移动会出现节点空白、连线闪烁/消失、整页闪白。
- 根因：桌面端 `body` 使用 `zoom: var(--app-ui-scale)`，画布再反向 `zoom`。助手面板 `.chat-panel` / header / input-area 的 `backdrop-filter` 叠在嵌套 zoom 上，Windows 合成层在 hover 时失效。
- 修复：关闭新画布助手面板及其内部节点的 backdrop-filter，不改助手交互、缩放和其它面板。
- 验证：`node --test --test-name-pattern "new canvas floating menu hosts task center" apps/web/tests/new-canvas-runtime-adapter.spec.mjs` 通过。
- 状态：DONE
