# Canvas Operation Node Toast Debug Report

- Symptom: Clicking canvas operation/template nodes showed a global success toast such as "已添加画布模板节点。", while the desired behavior is to show completion feedback only after generation returns successfully.
- Root cause: The `add-canvas-node` and `add-canvas-template` action branches wrote success copy directly to `workbench.ui.toast`, so ordinary node insertion was rendered as a completed operation.
- Fix: Clear `workbench.ui.toast` in both add-node branches and leave the existing generation completion toast path unchanged.
- Evidence: `node --import tsx --test --test-name-pattern "does not show a success toast when clicking canvas operation nodes" apps/web/tests/project-workbench-generation.spec.ts` passes. `node --test apps/web/tests/canvas-workflow.spec.mjs` passes.
- Related: The broader `project-workbench-generation.spec.ts` file still has unrelated current failures in this workspace; the focused regression passes.
