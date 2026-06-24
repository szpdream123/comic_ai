**DEBUG REPORT**

- **Symptom:** 分镜生成时表格停在已有几条记录几十秒不动，随后又一次性出现两条或多条。
- **Root cause:** 前端分镜流式同步在检测到已有完整 `storyboards` 行后，会优先走完整解析路径并提前返回，导致正在流入但尚未闭合的下一条分镜没有进入表格。用户看到的现象就是“完整行等待下一条闭合才批量出现”。
- **Fix:**  
  `apps/web/src/features/production-workbench/index.js` 让 JSON 分镜数组优先走增量记录提取，并把完整记录与当前未闭合记录合并展示。半成品记录会从 JSON-like 字段中提取 `plot`、`dialogue_or_os`、`imagePrompt`、`videoPrompt` 等可读内容，避免只显示原始字段碎片。
- **Evidence:**  
  `node --test --test-name-pattern "keeps showing the currently streaming storyboard row after completed rows already rendered|streams storyboard rows into the live table before the final payload arrives|renders a partial storyboard row during shot streaming before the first segment object closes|streams segment storyboard rows into the live table before the final payload arrives|streams screenshot-style labeled storyboard rows incrementally across multiple shot chunks|keeps parsing live storyboard rows when the streamed shot response exceeds the visible text limit" apps/web/tests/project-workbench-generation.spec.ts` 通过。  
  `node --test apps/web/tests/project-detail-ai-live-output.spec.mjs` 通过。  
  `node scripts/run-tests.mjs apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts` 通过。
- **Regression test:**  
  `apps/web/tests/project-workbench-generation.spec.ts` 新增 `keeps showing the currently streaming storyboard row after completed rows already rendered`。
- **Status:** DONE
