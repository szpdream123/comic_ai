# 画布图像节点上传没有回显

**Date:** 2026-09-19
**Status:** DONE

## Symptom

空「图像」节点点上传箭头选完文件后没有任何变化，节点仍是空占位。

## Root cause

浏览器通用选文件函数 `sT` 被写成一律走 `purpose: series-original`。图片/视频/音频会被原著限额拦掉。上传 hook 又把异常吞成 `null`，界面无 toast、无预览。图像节点还把 `imageUrl` 写在 `Image.onload` 里，COS 地址即使回来也可能不回显。

## Fix

- `sT`：文本走 `series-original`，媒体走 `canvas-assets`，回写 COS `dataUrl`/`filePath`。
- 图像节点：COS 返回后立刻写 `imageUrl`，尺寸再异步补。
- 上传 hook：失败时 toast。

## Evidence

`node --test --test-name-pattern "browser source media node uploads through COS|browser series original uploads through COS|browser text-node uploads keep file bytes" apps/web/tests/new-canvas-runtime-adapter.spec.mjs`
