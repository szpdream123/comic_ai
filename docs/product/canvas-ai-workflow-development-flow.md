# AI Canvas Workflow Development Flow

Date: 2026-06-10
Purpose: Step-by-step development flow for the comic_ai AI canvas workflow

## 1. Current Baseline

The first visible MVP shell has been started in the existing production workbench canvas tab.

Important distinction:

- Current shell: visual prototype rendered with existing HTML/CSS.
- First functional version: must integrate AntV X6 for graph behavior.

Touched frontend areas:

- `apps/web/src/features/production-workbench/project-detail.js`
- `apps/web/src/features/production-workbench/production-workbench.css`
- `apps/web/tests/project-workbench-generation.spec.ts`

Created planning/design artifacts:

- `docs/product/canvas-ai-workflow-dev-spec.md`
- `docs/product/canvas-ai-workflow-development-flow.md`
- `design-previews/canvas-ai-workflow/index.html`

Current MVP surface:

- Left sidebar lists 3 canvas nodes.
- Center canvas renders a default Script -> Send -> Image flow.
- Send node includes type selector, model selector, prompt textarea, upstream context chip, and run button.
- Image node includes empty result preview and follow-up actions.
- Canvas includes add-node menu, bottom toolbar, zoom controls, edge layer, node ports, and right inspector.
- Rendering test now asserts the real canvas workflow shell exists.

## 1.1 First Functional Version Scope

The first functional version must include AntV X6. It is considered complete only when:

- X6 mounts inside `.canvas-stage`.
- Default Script -> Send -> Image nodes are created from a canvas document.
- Users can drag nodes through X6.
- Users can pan and zoom the graph through X6.
- Users can connect compatible ports.
- Incompatible connections are rejected.
- Add-node menu creates at least Script, Send, Image, Video, Audio, and Upload nodes.
- Selected node state updates the inspector.
- Send node prompt edits write into canvas state.
- Model options can be read from `generation-config` when an episode context exists.
- Graph state serializes into the same document shape planned for backend persistence.

Real model execution can land immediately after this version, but the first functional version must not depend on the later backend persistence work.

## 2. Development Principles

### Keep Canvas UI Separate From Business Execution

Canvas rendering should not directly own model calls. Use these layers:

1. Canvas render layer: nodes, ports, edges, menus, inspector.
2. Canvas state layer: selected node, node data, edge data, viewport, dirty state.
3. Canvas runtime layer: resolve upstream context, compose prompt, call existing APIs, poll task state.
4. Persistence layer: save/load document JSON.

### Build Thin Slices

Each step must produce one visible, testable behavior. Avoid implementing the full workflow engine before the UI state is proven.

### Test First Where Behavior Is Stable

For production code changes:

1. Add or update a focused test.
2. Run it and confirm it fails for the expected reason.
3. Implement the smallest change.
4. Re-run the focused test.
5. Run a broader smoke test when the slice is complete.

The existing full `project-workbench-generation.spec.ts` file currently has unrelated failures. For canvas work, record whether the canvas-specific test passes separately from the unrelated suite status.

## 3. Phase 1: Static Canvas Shell

Status: started.

Goal:

- Replace the empty launch surface with a real AI canvas preview.

Files:

- `project-detail.js`
- `production-workbench.css`
- `project-workbench-generation.spec.ts`

Required behaviors:

- Tools tab renders `.canvas-flow`.
- Tools tab renders Script, Send, and Image nodes.
- Sidebar shows node count.
- Send node has model selector and prompt input.
- Result node has follow-up actions.
- The shell hides generation queue/admin content.

Tests:

- `renders the tools tab as an interactive AI canvas workflow surface`
- Existing queue-hidden tests under tools tab.

Manual QA:

- Open workbench tools tab.
- Confirm nodes are visible and not overlapping.
- Confirm left rail and bottom toolbar are usable.
- Confirm right inspector does not cover the core flow on common desktop widths.

## 4. Phase 2: AntV X6 Graph Integration

Goal:

- Replace the static canvas flow behavior with X6-powered graph behavior while preserving the current visual direction.

Dependency:

```json
{
  "dependencies": {
    "@antv/x6": "^3.1.7"
  }
}
```

New files:

```text
apps/web/src/features/production-workbench/canvas/
  canvas-x6-graph.js
  canvas-x6-nodes.js
  canvas-x6-edges.js
  canvas-default-document.js
```

Tasks:

1. Add `@antv/x6`.
2. Mount an X6 `Graph` into the existing `.canvas-stage`.
3. Register custom HTML nodes for Script, Send, Image, Video, Audio, Upload, Director, and Output.
4. Create the default Script -> Send -> Image graph from `canvas-default-document.js`.
5. Configure grid, panning, mouse wheel zoom, selection, connecting, history, and keyboard.
6. Add connection validation by port type.
7. Convert X6 nodes and edges back into the canvas document shape.
8. Keep model execution outside X6; X6 only emits selected-node and run-node events.

Tests:

- Default document converts into three X6 nodes and two edges.
- X6 node data converts back into the same document shape.
- Invalid media-type connections are rejected by the edge rule helper.
- Canvas render still includes the graph mount container.

Acceptance:

- User can drag nodes.
- User can pan and zoom.
- User can connect Script to Send.
- User cannot connect incompatible ports.
- Existing canvas visual test still passes.

## 5. Phase 3: Extract Canvas Module

Goal:

- Stop growing `project-detail.js` and move canvas markup helpers into focused files.

New files:

```text
apps/web/src/features/production-workbench/canvas/
  canvas-render.js
  canvas-icons.js
  canvas-default-document.js
  canvas.css
```

Tasks:

1. Move `renderToolsPanel()` canvas body into `canvas-render.js`.
2. Move canvas icon helpers into `canvas-icons.js`.
3. Move default Script/Send/Image node data into `canvas-default-document.js`.
4. Import render function from `project-detail.js`.
5. Keep output HTML unchanged.
6. Move canvas-specific CSS from `production-workbench.css` into `canvas.css` only if the current bundling path supports importing it.

Tests:

- Existing canvas render test should pass with unchanged expected HTML markers.
- Add unit test for `createDefaultCanvasDocument()`.

Acceptance:

- `project-detail.js` no longer contains large canvas node markup.
- Canvas render can be tested independently.

## 6. Phase 4: Local Canvas State

Goal:

- Make canvas nodes selectable and editable in memory without backend persistence.

New files:

```text
canvas-store.js
canvas-events.js
canvas-inspector.js
```

State shape:

```js
{
  selectedNodeId: "send-flow",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  addMenuOpen: true,
  dirty: false
}
```

Tasks:

1. Add a `canvasDocument` branch under `workbench.ui`.
2. Initialize default document when tools tab opens.
3. Add action handling for:
   - `select-canvas-node`
   - `add-canvas-node`
   - `run-canvas-node` placeholder
4. Re-render inspector from selected node.
5. Allow prompt edits to update node data.

Tests:

- Selecting a node updates selected node state.
- Adding a node increases node count.
- Prompt input updates Send node data.

Acceptance:

- User can select nodes.
- Add-node button creates a new visible node.
- Inspector reflects selected node.

## 7. Phase 5: Drag and Link Interactions

Goal:

- Make X6 drag and link interactions production-ready before backend execution.

Implementation rule:

- Do not build a parallel custom DOM graph engine.
- Use X6 for drag, pan, zoom, selection, connection previews, and edge routing.
- Keep our own document schema and runtime outside X6.

Tasks:

1. Prevent node dragging when interacting with textarea/select/button inside custom nodes.
2. Persist X6 node positions into `canvasDocument`.
3. Persist X6 edges into `canvasDocument`.
4. Tune edge paths and selected/running edge states.
5. Keep node dimensions stable.

Tests:

- Pure function test for `validateCanvasConnection(sourcePort, targetPort)`.
- DOM-level browser QA for drag behavior.

Acceptance:

- Nodes move smoothly.
- Edges remain attached visually.
- Form controls inside nodes are still usable.

## 8. Phase 6: Script Integration

Goal:

- Script node reads project script sections from existing APIs.

Existing API:

- `getScriptReaderSections(projectId)`
- `createScriptReaderSection(projectId, input)`
- `updateScriptReaderSection(projectId, sectionId, input)`
- `deleteScriptReaderSection(projectId, sectionId)`

Tasks:

1. Add `canvas-api.js` wrapper around `creatorApi`.
2. Load script sections when canvas opens.
3. Script node can choose linked section.
4. Store script node data:
   - `source`
   - `sectionIds`
   - `snapshotText`
   - `linkedUpdatedAt`
5. When running downstream node, snapshot the script text.

Tests:

- Script node renders loaded section title.
- Script node falls back to pasted text when no sections exist.
- Runtime resolves script node output as text context.

Acceptance:

- Existing project script appears in the canvas.
- Downstream Send node can use the script text.

## 9. Phase 7: Model Selector Integration

Goal:

- Send node uses project/episode model configuration.

Existing API:

- `listGenerationConfig(episodeId)`

Tasks:

1. Load generation config for current episode.
2. Filter models by Send node `mediaKind`.
3. Default image/video models from config.
4. Store `modelCode` in Send node.
5. Show disabled state when media kind lacks available models.

Tests:

- Image Send node lists image models.
- Video Send node lists video models.
- Stale selected model falls back to default model.

Acceptance:

- User sees real model names/codes in the Send node.
- Model choice persists in canvas state.

## 10. Phase 8: Node Runtime

Goal:

- Run selected Send node through existing generation paths.

Existing APIs:

- `createAiStoryboardPreview(projectId, input)`
- `createAiStoryboardPreviewStream(projectId, input, options)`
- `createImageTask(episodeId, input, options)`
- `createVideoTask(episodeId, input, options)`
- `getGenerationTask(taskId)`

Runtime steps:

1. Validate required inputs.
2. Resolve upstream context.
3. Compose prompt.
4. Save canvas document before execution.
5. Create text/image/video task.
6. Mark node `queued`.
7. Poll task.
8. Mark node `succeeded` or `failed`.
9. Attach result to node.
10. Optionally create a result node.

Tests:

- Missing upstream input blocks run.
- Text context is included in composed prompt.
- Image task input contains selected model code.
- Running state renders.
- Failed task renders error state.

Acceptance:

- User can run a Send node.
- Node status changes from idle to running to succeeded/failed.
- Result appears in the canvas.

## 11. Phase 9: Persistence

Goal:

- Save and reload canvas documents.

Backend table:

```sql
project_canvas_documents
```

Endpoints:

```text
GET /api/creator/projects/:projectId/canvas
PUT /api/creator/projects/:projectId/canvas
GET /api/episodes/:episodeId/canvas
PUT /api/episodes/:episodeId/canvas
```

Tasks:

1. Add backend service and record store.
2. Add HTTP routes.
3. Validate project/organization access.
4. Store document JSON and revision.
5. Add frontend load/save wrapper.
6. Debounce autosave.

Tests:

- Empty canvas returns default document.
- Save persists nodes and edges.
- Revision conflict returns 409.
- Unauthorized access is rejected.

Acceptance:

- Canvas survives reload.
- Multiple edits save without blocking the UI.

## 12. Phase 10: X6 Hardening

Goal:

- Harden the X6 integration after persistence and runtime are working.

Tasks:

1. Add minimap if useful.
2. Add clipboard copy/paste.
3. Add undo/redo commands.
4. Add fit-to-selection.
5. Add keyboard shortcuts.
6. Add route tuning for dense graphs.

Tests:

- Undo/redo updates document state.
- Copy/paste creates unique node IDs.
- Fit-to-selection keeps selected nodes visible.

Acceptance:

- Existing canvas data still works.
- Advanced graph controls do not break drag/link/run flows.
- UI keeps the same product look.

## 13. Phase 11: QA and Hardening

Browser QA:

- Desktop 1440 x 900.
- Wide 1920 x 1080.
- Tablet 1024 x 768.
- Mobile fallback: canvas should remain usable enough for viewing, with editing limited if needed.

Scenarios:

- Open canvas.
- Add node.
- Select node.
- Drag node.
- Connect nodes.
- Edit prompt.
- Choose model.
- Run node.
- See running state.
- See success/failure state.
- Reload and verify persistence.

Regression checks:

- Existing project tab still renders.
- Existing episode workbench generation still works.
- Tools tab still hides admin queue content.
- Prompt text does not overflow buttons or node bounds.

## 14. Definition of Done for MVP

The first usable MVP is done when:

- Canvas tab renders a real node workflow.
- User can add, select, move, and connect nodes.
- Script node can use project script text.
- Send node can use real model config.
- Send node can create at least one real generation task.
- Result appears on canvas.
- Document persists after reload.
- Focused tests pass.
- Browser QA screenshots show no major overlap or blank canvas.
