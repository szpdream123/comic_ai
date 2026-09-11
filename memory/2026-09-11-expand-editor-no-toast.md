# Expand Editor Click No Feedback

- Symptom: Clicking 扩图 in the expand overlay did nothing and showed no toast.
- Root cause: Output size 5647×5647 exceeded the 256 MiB canvas budget. The click handler only rewrote the existing red inline alert (`F(K)`) and returned. App toast used `z-[300]` while `.fullscreen-overlay` is `z-index: 9999`, so even a toast would sit under the overlay.
- Fix: `ExpandEditor-DGeOoZRf.js` now calls `showToast(K, "error")` on the budget-blocked click. `App-BhrU-uKS.js` toast portal uses inline `zIndex: 10000`.
- Evidence: `node --test apps/web/tests/new-canvas-host.spec.mjs` 70/70.
- Status: DONE
