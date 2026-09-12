# 浏览器视频编辑器初始化监听失败

- 症状：画布加载后控制台 `[videoEditorWindow] 初始化事件监听失败: Cannot read properties of undefined (reading 'transformCallback')`
- 根因：视频节点挂载会订阅 Tauri `listen`，浏览器没有 `__TAURI_INTERNALS__`
- 修复：`g()` / `_()` 在非 Tauri 环境直接返回
- 验证：新增 runtime adapter 回归测试通过
- 状态：DONE
