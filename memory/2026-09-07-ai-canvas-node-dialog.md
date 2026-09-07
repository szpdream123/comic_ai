# AI Canvas Node Dialog Debug Report

- Symptom: Clicking text, image, or video nodes in the new Canvas did not show the node editor.
- Root cause: `AINodeDialog` referenced `runtimeModels` in generation and model-selection callbacks without declaring it in `pt()`; rendering the lazy-loaded dialog raised `ReferenceError: runtimeModels is not defined`.
- Fix: Declared `runtimeModels` from `e.config.generalModels` in `pt()` and added a regression assertion.
- Evidence: `node --test apps/web/tests/new-canvas-host.spec.mjs` passes 65/65. Browser verification opened the text-node editor and recorded no error or warning logs.
- Status: DONE
