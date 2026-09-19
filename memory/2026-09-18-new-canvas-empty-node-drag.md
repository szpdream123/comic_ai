# New canvas empty upload nodes cannot drag

**Date:** 2026-09-18
**Status:** DONE

## Symptom

Empty image upload nodes (upload-icon placeholder) could not be moved on the canvas.

## Root cause

The empty image/video preview was a full-size `button` with React Flow's `nodrag` class. Pointer-down on the placeholder never started node dragging.

## Fix

- `apps/web/ai-canvas-runtime/assets/App-DxD-N3bO.js`
  - Remove `nodrag` from empty image/video upload placeholders.
  - Ignore click-to-upload when the pointer moved more than 4px so dragging a node does not open the file picker.

## Evidence

- `node --test --test-name-pattern "empty media upload placeholders stay draggable" apps/web/tests/new-canvas-host.spec.mjs`

## Regression test

- `apps/web/tests/new-canvas-host.spec.mjs`
