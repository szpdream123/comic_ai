# 新画布刷新空白分屏调试记录

- 症状：刷新新画布页面后，上方为深色区域，下方露出浅色区域。
- 根因：桌面端 `body` 使用 `zoom: 0.75`；刷新期间新画布 light-DOM 根节点及 `.new-canvas-root` 没有继承独立画布容器的全视口高度，首帧实际只有 `648px`，其下露出浅色外层背景。
- 修复：将 `.initial-workbench-shell` 纳入桌面端 `calc(100dvh / var(--app-ui-scale))` 高度和最小高度规则；在首屏加载的 `app-scale.css`、运行时布局样式和关键样式中为 light-DOM 根节点及 `.new-canvas-root` 补充 `height/min-height: 100%`，并保留直接子节点选择器及宿主 `html/body` 文档流恢复。
- 真实验证：使用已登录本地浏览器同一画布详情页连续刷新，检查 `50/120/300/700/1500ms` 五个阶段；修复后 light-DOM 根节点和 `.new-canvas-root` 在挂载阶段均覆盖完整 `960px` 视口，截图不再出现上深下浅分屏。
- 静态验证：`node --test apps/web/tests/app-scale.spec.mjs`、`node --check apps/web/app.js`、`git diff --check` 均通过；运行时适配套件另有既有 bundle 断言失败，与本次布局修复无关。
- 状态：DONE。
