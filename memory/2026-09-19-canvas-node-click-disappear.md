# 点击节点立即消失、松开才回来

**Date:** 2026-09-19
**Status:** DONE

## Symptom

按下节点立刻不见，松开鼠标才重新出现。

## Root cause

媒体节点 LOD 在 `e.dragging` 时卸载完整内容、切轻量预览。空节点没有 `imageUrl`/`nodeWidth`/`nodeHeight`，轻量预览条件 `x` 为 false，拖拽态变成空白。React Flow 默认 `nodeDragThreshold: 1`，几乎一点击就算 dragging。

## Fix

`let C=(e.dragging||!d&&!S)&&x`：没有可替换预览时不切 lite，空节点保持完整占位。

## Evidence

`node --test --test-name-pattern "media nodes use the lightweight preview|empty media upload placeholders stay draggable|canvas node dragging keeps pointer tracking" apps/web/tests/new-canvas-host.spec.mjs`
