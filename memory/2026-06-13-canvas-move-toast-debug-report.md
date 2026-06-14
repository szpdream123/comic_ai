# Canvas Move Toast Debug Report

- Symptom: Moving canvas nodes could display the global success toast "画布节点已提交生成任务。"
- Root cause: Node move/resize paths did not create that message, but they re-rendered the workbench while leaving a previous run-submission toast in `workbench.ui.toast`.
- Fix: Clear `workbench.ui.toast` after manual canvas node drag/resize layout operations, and clear it for X6 `node:moved` / `node:resized` sync events.
- Evidence: `node --import tsx --test --test-name-pattern "does not show a success toast when clicking canvas operation nodes|clears stale canvas run toasts when moving or resizing canvas nodes" apps/web/tests/project-workbench-generation.spec.ts` passes. `node --test apps/web/tests/canvas-workflow.spec.mjs` passes.
- Related: Generation submission and completion toasts remain on the explicit run-canvas-node path.
