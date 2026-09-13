# 剧本和原著刷新后消失

- 症状：剧集栏上传原著、填写剧本后，刷新显示「未添加 / 未填写」。
- 根因：浏览器宿主把 IndexedDB 保存换成只写画布节点；原著/剧本停在 runtime 内存。保存时用空的 zustand nodes 快照，被空画布保护拦住，series 没进 canvas document。
- 修复：空节点时保留已保存节点并仍写入 series；宿主 `onProjectsChange` 把原著/剧本贴进画布文档并立即保存；加载时还原到剧集栏。
- 状态：DONE
