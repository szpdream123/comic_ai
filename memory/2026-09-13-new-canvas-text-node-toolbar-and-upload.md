# New canvas text node toolbar and upload debug

**Date:** 2026-09-13
**Status:** DONE_WITH_CONCERNS

## Symptom

- Selected text-node floating toolbar sat on top of the filename instead of centering above the node.
- Uploading a `.txt` into a text node showed `/api/storage/objects/.../content?proxy=1` instead of file contents.

## Root cause

1. Brand CSS enlarged `.node-floating-toolbar` buttons to 48×58, but `.text-toolbar` still used `top:-40px` and no `-50%` X offset. The taller bar overlapped the node title and sat left-heavy.
2. Browser COS upload (`sT` in `main-upstream`) always returned `dataUrl` as the storage proxy URL. Text/markdown nodes treated non-`data:text/` values as the node body, so the path was written into `output`.

## Fix

- `runtime-brand-overrides.css`: center and lift `.text-toolbar`.
- `main-upstream-665b2cc.js`: keep file bytes in `dataUrl` for text-like uploads; still store `filePath`/`storageObjectId` for series originals.
- `App-DxD-N3bO.js`: decode any `data:` payload; fetch storage URLs; hydrate already-saved path-only text nodes.

## Evidence

- `node --test --test-name-pattern "browser text-node uploads keep file bytes" apps/web/tests/new-canvas-runtime-adapter.spec.mjs` passed.
- Series-original assertions still match `filePath:o,storageObjectId:i||void 0`.

## Follow-up: prompt composer overlapping nodes

Text nodes used `rt=-20`, so the floating prompt sat 20px into the node. Viewport clamping could also push it up over the node. Fix: always offset 16px below the node bottom, and keep a floor at `node.bottom + 16` during clamp.

## Concerns

- Could not visually re-check the live canvas in this session.
- Existing nodes that already saved a storage path as `output` hydrate on next open via fetch.
