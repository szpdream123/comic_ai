# AI Canvas 应用加载失败 SyntaxError

- 症状：进入 AI Canvas 白屏，控制台 `SyntaxError: missing ) after argument list`，指向 `App-DxD-N3bO.js:66`。
- 根因：剧集栏按钮 jsx 对象在 `{type:`button`}` 处提前闭合，后续 `"aria-label"` 变成非法参数。
- 修复：改为 `{type:`button`,"aria-label":...}`。
- 验证：新增 host 回归测试通过；`node --check` 通过。
- 状态：DONE
