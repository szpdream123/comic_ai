# 新画布拖节点卡顿（对照上游）

**Date:** 2026-09-18
**Status:** DONE_WITH_CONCERNS

## 对照结论

上游 `Canvas.tsx` 拖动热路径本身也会每帧 `applyNodeChanges`。真正差在宿主：

1. `app-scale.css` 给 `body.workbench-body` 设 `zoom: 0.75`
2. `app.js` 再给画布 Light DOM 设 `zoom: calc(1 / 0.75)` 抵消
3. 拖节点时整页双重 CSS zoom 合成，资源会飙
4. 宿主还有 4 个盯着整棵画布的 `MutationObserver`，拖动时跟 React 抢 DOM
5. 桌宠 WebGL 每帧 `getBoundingClientRect` + render

## Fix

- 画布页取消 body/画布嵌套 zoom，改 1:1
- 交互期间跳过宿主 MutationObserver / store 订阅
- 拖动时停桌宠渲染
- 拖动中不做 live drop 命中，并关小地图

## Evidence

- `node --test apps/web/tests/app-scale.spec.mjs`
