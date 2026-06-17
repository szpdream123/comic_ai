# Canvas upload node drag debug

## Symptom

The empty upload node on the tools canvas could not be dragged from its card area, while other canvas nodes were draggable.

## Root cause

The visible canvas still uses the legacy DOM `.canvas-flow` layer for interaction because `.canvas-x6-mount` is rendered with `pointer-events: none`. The legacy `mousedown` handler blocked node dragging from generic controls including `button`. Empty upload nodes render their whole upload area as a `.canvas-upload-card` button without `.has-media`, so the old exception for `.canvas-upload-card.has-media` did not apply.

Follow-up: simply allowing `.canvas-upload-card` in `mousedown` was not enough for the requested interaction. The upload card must still behave like a short-click upload button, while a long press should move the node. Browser `pointerdown` fires before the button click path, so upload-card dragging needs to be decided there with a delayed drag start instead of treating every mouse down as an immediate drag.

## Fix

Changed the upload drag exception in `apps/web/src/features/production-workbench/index.js` from `.canvas-upload-card.has-media` to `.canvas-upload-card`, while still blocking drags from `.canvas-node-connect` and the file `input`.

Added `startCanvasUploadNodeLongPressDrag`, which starts the existing node drag after a 250ms long press or after the pointer moves more than 6px. Releasing before that leaves the normal `click` path intact, so short-click upload still opens the file picker. When the long press becomes a drag, it records `lastCanvasNodeDrag` immediately so the later click event does not also open the file picker.

Added regression source checks in `apps/web/tests/project-workbench-generation.spec.ts` covering the long-press upload-card path.

## Evidence

- `node --test apps/web/tests/canvas-workflow.spec.mjs` passed: 19/19.
- A direct Node assertion against the long-press upload-card path passed with `upload-card long-press drag guard ok`.
- Running `apps/web/tests/project-workbench-generation.spec.ts` is currently noisy because the file has many pre-existing unrelated failures, and Node's `--test-name-pattern` did not isolate them in this repo setup.

## Status

DONE_WITH_CONCERNS: root cause and fix are verified by focused checks; full large test file remains blocked by unrelated existing failures.
