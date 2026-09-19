# 新画布节点吸附拖动手感 + 关闭开关

**Date:** 2026-09-18
**Status:** DONE

## Symptom

- 拖节点会粘在对齐线上，指针已经走了节点还停一下。
- 左下角工具栏只有网格/连线/缩放，没有关闭吸附。

## Root cause

- `useNodeSnap` 把阈值做成 `max(8, 8/zoom)`。44% 缩放时窗口约 18 flow unit，附近节点会反复把指针吸回去。
- 底栏 `footer-toolbar` 只有网格和连线开关，没有节点吸附开关。

## Fix

- 阈值改回固定 8 flow unit。
- `localStorage.canvas-nodeSnap === "false"` 时拖动/缩放跳过吸附。
- 左下角网格按钮旁增加节点吸附开关，默认开，点击立刻写入 localStorage。

## Evidence

- `node --test --test-name-pattern "canvas node dragging keeps pointer tracking" apps/web/tests/new-canvas-host.spec.mjs`
