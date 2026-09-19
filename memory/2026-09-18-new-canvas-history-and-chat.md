# New canvas history modal and AI assistant

**Date:** 2026-09-18
**Status:** DONE

## Symptom

- Output history opened as a bottom sheet instead of a centered dialog.
- Opening top chrome menus (assets, character library, output history) closed the AI assistant.

## Root cause

1. `OutputHistoryPanel` used `fixed inset-x-0 bottom-0` plus a `y: 100%` slide for the unpinned modal.
2. `setAssetsPanelOpen`, `setCharacterLibraryOpen`, `setCharacterActionLibraryOpen`, and `setHistoryPanelOpen` all wrote `chatOpen: false` when opening.

## Fix

- `apps/web/ai-canvas-runtime/assets/OutputHistoryPanel-DcDKLDOM.js`: center the unpinned history dialog.
- `apps/web/ai-canvas-runtime/assets/main-upstream-665b2cc.js`: opening those menus no longer closes chat.

## Evidence

- `node --test --test-name-pattern "output history modal stays centered" apps/web/tests/new-canvas-host.spec.mjs`

## Regression test

- `apps/web/tests/new-canvas-host.spec.mjs`
