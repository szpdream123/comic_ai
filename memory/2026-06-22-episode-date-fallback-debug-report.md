**DEBUG REPORT**
- **Symptom:** 新创建章节在项目剧集列表中显示为固定日期 `2026/05/22`。
- **Root cause:** 前端在章节缺少 `createdAt` 时，多个展示和聚合路径都硬编码回退到 `2026/05/22`。AI 分镜创建章节后的本地 hydrate 只写入了 `id/title/projectId`，没有写入 `createdAt`，因此立即触发该 fallback。
- **Fix:** 在 AI 章节创建后的本地 episode context 中补上 `createdAt`；同时移除剧集卡片和 episode hub 聚合里的 `2026/05/22` 硬编码回退，改为优先使用真实项目时间或空值。
- **Files:** `apps/web/src/features/production-workbench/index.js`, `apps/web/src/features/production-workbench/project-detail.js`, `apps/web/tests/project-workbench-generation.spec.ts`
- **Evidence:** 后端创建章节走 `createEpisodeForProject(..., now)`，返回真实 `createdAt`；前端原逻辑在 `project-detail.js` 中将 `episode.createdAt ?? "2026/05/22"` 用于列表渲染，且 `formatEpisodeHubDate` 在无可解析日期时也返回 `2026/05/22`。
- **Regression test:** 扩展 `project-workbench-generation.spec.ts` 中 AI 分镜创建章节即时 hydrate 场景，断言本地 `customEpisodes` 使用真实创建日 `2026/06/22`。
- **Status:** DONE_WITH_CONCERNS
- **Concern:** 仓库当前测试文件存在大量与本次改动无关的既有失败，无法获得干净全绿验证；本次改动未引入新的语法或构建错误迹象。
