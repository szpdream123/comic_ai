**DEBUG REPORT**

- **Symptom:** 分镜生成过程中页面看起来卡住，不再持续流式输出，随后又突然批量渲染多条内容。
- **Root cause:** 后端把模型流拆成了单字符级别的 `asset_delta`/`script_delta` 事件，前端在分镜阶段又会对每次增量执行较重的解析与局部刷新。长分镜输出时，事件过密导致主线程压力过大，用户体感表现为“假死后突发渲染”。
- **Fix:**  
  `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.ts`
  将 `splitTextForLiveEcho()` 从单字符拆分调整为小块拆分，降低 SSE 事件密度。  
  `apps/web/src/features/production-workbench/index.js`
  为分镜流式表格同步增加短间隔批处理：`scheduleSingleEpisodeAiStoryboardTableSync()` 与 `flushSingleEpisodeAiStoryboardTableSync()`，避免每个 shot 增量都立即重解析整段分镜文本，并在 `asset_done` / `complete` 时强制冲刷最后一批增量。
- **Evidence:**  
  `node scripts/run-tests.mjs apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts` 通过。  
  `node --test --test-name-pattern "streams storyboard rows into the live table before the final payload arrives|keeps parsing live storyboard rows when the streamed shot response exceeds the visible text limit|renders a partial storyboard row during shot streaming before the first segment object closes|streams segment storyboard rows into the live table before the final payload arrives|streams screenshot-style labeled storyboard rows incrementally across multiple shot chunks|renders the AI preview overlay immediately when shot live tables receive rows" apps/web/tests/project-workbench-generation.spec.ts` 通过。
- **Regression test:**  
  `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts`  
  `apps/web/tests/project-workbench-generation.spec.ts`
- **Related:** 这次没有改动后端分镜阶段顺序执行逻辑，主要优化的是流式事件粒度与前端解析/渲染频率。
- **Status:** DONE
