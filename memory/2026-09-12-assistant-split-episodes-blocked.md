# AI 助手拆分分集一直失败

- 症状：新画布里 AI 助手调用「拆分为分集画布」反复失败，顶部 toast「请使用「生成 AI 拆分草案」拆分，已保留当前原著」，工作台分集仍为 0。
- 根因：`addEpisodes` 在浏览器里被 `!J()`（非 Tauri）直接拦回空数组。助手工具 `series_split_episodes` 走同一条写入。宿主项目目录同步还会丢掉 `parentId` 分集。
- 修复：浏览器由宿主接管 `addEpisodes`，并在目录同步时保留分集子项。
- 验证：`browser AI assistant can split the current series into episode canvases`。
- 状态：DONE
