# New canvas low-zoom node drag lag

**Date:** 2026-09-18
**Status:** DONE

## Symptom

- Node drag no longer auto-aligned.
- At 10% zoom, dragging a node lagged behind the pointer and moved in visible steps.

## Root cause

1. A previous web-only patch scaled the snap threshold by `1/zoom` and disabled snap below 30% zoom. Upstream desktop (`useNodeSnap.ts`) always snaps with a fixed 8 flow-unit threshold. Scaling the threshold at 10% made nearby nodes recapture the pointer; disabling it below 30% removed alignment entirely.
2. Node drag still paid for canvas-wide MutationObserver / toolbar zoom compensation / hover `querySelectorAll` unless those scans were skipped while a node drag was active.

Desktop keeps snap on at every zoom. At 10% that 8-unit window is ~0.8px on screen, so snap almost never fires and the node stays with the pointer. Alignment still works at normal zoom.

## Fix

- `apps/web/ai-canvas-runtime/assets/ResizeHandle-DOamYKBS.js`: match upstream — always snap, fixed 8 flow units, skip empty snap-line React updates. Honor `localStorage.canvas-nodeSnap === "false"` to disable node/resize snap.
- `apps/web/ai-canvas-runtime/assets/App-DxD-N3bO.js`: apply snap at every zoom; keep skipping toolbar zoom-compensation scans, MutationObserver, mouse-move tracking, and drop targeting below 30% zoom while a node drag is active. Footer toolbar has a node-snap toggle, default on.
- `apps/web/ai-canvas-runtime/assets/runtime-brand-overrides.css`: disable node transform transitions during drag.

## Evidence

- `node --test --test-name-pattern "canvas node dragging keeps pointer tracking" apps/web/tests/new-canvas-host.spec.mjs`

## Regression test

- `apps/web/tests/new-canvas-host.spec.mjs`
