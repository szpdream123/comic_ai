# New canvas drawing preview delay

**Date:** 2026-09-18
**Status:** DONE

## Symptom

Bottom-toolbar shapes (rectangle, diamond, ellipse, arrow, line, freehand) did not follow the pointer while dragging. The shape only appeared after mouse up.

## Root cause

1. Draft canvas-note nodes only stored size in `data.nodeWidth` / `data.nodeHeight`. React Flow treats nodes without `width`/`height`/`measured` as un-dimensioned and keeps `visibility: hidden` until a later measure pass, which happened after commit.
2. `pointermove` closed over React state `g`. The first moves after pointer down still saw `g === null` and dropped the live preview.

## Fix

- `apps/web/ai-canvas-runtime/assets/App-DxD-N3bO.js`
  - `Md()` now writes `width`, `height`, and `style` so the draft is visible while dragging.
  - Drawing gesture keeps the in-progress shape on a ref (`L`) so move/up do not wait for the next render.

## Evidence

- `node --test --test-name-pattern "canvas note drafts keep live dimensions" apps/web/tests/new-canvas-host.spec.mjs`

## Regression test

- `apps/web/tests/new-canvas-host.spec.mjs`
