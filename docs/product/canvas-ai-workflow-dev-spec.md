# AI Canvas Workflow Development Spec

Date: 2026-06-10
Project: comic_ai
Scope: Production workbench canvas, node workflow, script/model integration

## 1. Goal

Build an infinite canvas workflow inside the production workbench. The canvas should let creators import or select scripts, create AI send-flow nodes, choose project models, write prompts, connect nodes, run generation tasks, and keep generated images, videos, audio, and storyboard outputs as visible canvas artifacts.

The target interaction is our own AI production canvas: a dark infinite grid, draggable nodes, visible connectors, add-node menu, upload/resource entry points, prompt composer, model selector, run button, zoom controls, and task status feedback.

The implementation should keep only the features that matter for comic and short-video production.

## 2. Recommended Library Choice

### MVP Choice: AntV X6

Use AntV X6 as the first implementation because the current `apps/web` frontend is mostly plain HTML/JS rendering rather than a React application. X6 can mount directly into the existing `canvas-stage` area with:

- A graph container.
- Custom HTML nodes.
- Ports and edges.
- Drag, pan, zoom, selection, keyboard, clipboard, history, grid, and context menus.

This keeps the first version close to the current codebase.

### X6 Integration Contract

The static HTML canvas shell is only a visual proof. The first functional version must use AntV X6 for graph behavior.

Required X6 responsibilities:

- Mount graph into `.canvas-stage`.
- Render the current Script -> Send -> Image default workflow from a canvas document.
- Own drag, pan, zoom, selection, edge drawing, connection validation, and keyboard shortcuts.
- Use custom HTML nodes so the current visual design can be preserved.
- Serialize X6 graph changes back into the project canvas document.
- Keep business execution outside X6. X6 is the graph UI engine, not the model runtime.

Required dependency:

```json
{
  "dependencies": {
    "@antv/x6": "^3.1.7"
  }
}
```

X6 should be wrapped by local canvas modules so the rest of the application does not depend on X6 APIs directly.

### Later Option: React Flow

React Flow is a better long-term fit if the canvas becomes a standalone React module. It has excellent AI workflow examples, custom nodes, handles, edges, save/restore, minimap, and node state patterns. The cost is introducing a React island or migrating the workbench area.

### Libraries Not Recommended As Primary Canvas

- tldraw: excellent infinite whiteboard, weaker for typed workflow ports and execution, production licensing needs review.
- Excalidraw: good sketching canvas, not suited for model execution workflows.
- LiteGraph.js: close to ComfyUI, fast for prototypes, but modern product UI would require substantial restyling.

## 3. Existing Project Integration Points

### Current Canvas Entry

The current empty canvas UI is rendered by `renderToolsPanel()` in:

- `apps/web/src/features/production-workbench/project-detail.js`

This area already contains:

- `canvas-workspace`
- `canvas-sidebar`
- `canvas-stage`
- bottom tools
- zoom tools
- quick actions

The first implementation should replace the empty center of `.canvas-stage` with an X6 graph container while keeping the surrounding workbench shell.

### Existing Frontend API Client

Use `apps/web/src/shared/creator-api.js` as the client boundary. Do not call `fetch()` directly from canvas components unless a new creator API method is missing.

Relevant methods already available:

- `getScriptReaderSections(projectId)`
- `createScriptReaderSection(projectId, input)`
- `updateScriptReaderSection(projectId, sectionId, input)`
- `deleteScriptReaderSection(projectId, sectionId)`
- `updateScriptCard(projectId, scriptId, input)`
- `deleteScriptCard(projectId, scriptId)`
- `getStoryboardPromptPackages()`
- `createAiStoryboardPreview(projectId, input)`
- `createAiStoryboardPreviewStream(projectId, input, options)`
- `commitAiStoryboardPreview(projectId, input)`
- `listGenerationConfig(episodeId)`
- `createImageTask(episodeId, input, options)`
- `createVideoTask(episodeId, input, options)`
- `getGenerationTask(taskId)`
- `saveDraft(episodeId, targetType, targetId, input)`
- `generateImages(input)`
- `generateVideos(input)`
- `bindFileResource(episodeId, input)`
- `importAsset(input)`
- `generateAsset(input)`

### Backend Modules Already Relevant

- `apps/backend/src/modules/model-catalog`
- `apps/backend/src/modules/model-gateway`
- `apps/backend/src/modules/ai-storyboard`
- `apps/backend/src/modules/project`
- `apps/backend/src/modules/workflow-task`
- `apps/backend/src/modules/storage`
- `apps/backend/src/modules/credit-billing`
- `apps/backend/src/modules/admin-storyboard-prompts`
- `apps/backend/src/modules/admin-image-prompts`

## 4. Product Surface

### First Functional Version Scope

The first functional version is not just a static preview. It must include:

- X6 graph mounted inside the tools/canvas tab.
- Default Script -> Send -> Image workflow rendered from data.
- Node selection.
- Node dragging.
- Pan and zoom.
- Connect compatible ports.
- Reject incompatible connections.
- Add Script, Send, Image, Video, Audio, and Upload nodes from the add menu.
- Edit Send node prompt.
- Select a model from the existing generation config when episode context exists.
- Run button with placeholder validation first, then real execution in the next slice.
- Serialize the graph into a canvas document object.

This first version may save only in frontend state before backend persistence is ready, but its document shape must match the final persistence model.

### Primary User Flow

1. User opens a project or episode workbench.
2. User switches to the canvas/tools tab.
3. Canvas loads saved document for the current project/episode.
4. User adds a Script node from existing script sections or upload/import.
5. User adds a Send node.
6. User connects Script node output to Send node input.
7. User chooses model family and model code.
8. User writes or edits prompt.
9. User runs the node.
10. System creates a generation task or text/storyboard preview.
11. Node shows running state.
12. Generated result appears in the node and optionally creates a connected Image, Video, Storyboard, or Text result node.
13. User continues chaining outputs into later nodes.

### MVP Features

- Infinite dark grid canvas.
- Pan, zoom, fit-to-view.
- Add node menu.
- Drag nodes.
- Connect compatible ports.
- Select node.
- Delete node or edge.
- Script node.
- Prompt/Send node.
- Image result node.
- Video result node.
- Basic upload/reference node.
- Model selector from `generation-config`.
- Prompt editor.
- Run current node.
- Task polling.
- Save/load canvas document.
- Dirty-state autosave.
- Undo/redo for canvas edits.

### Post-MVP Features

- Multi-select and group nodes.
- Canvas minimap.
- Auto-layout selected flow.
- Run downstream chain.
- Node templates.
- Version history.
- Side-by-side result comparison.
- Workflow export/import.
- Shared team cursors.
- Comment pins.

## 5. Frontend Design Direction

### Tone

Industrial production desk, not marketing page. The UI should feel like a focused AI production console for comics and short videos:

- Dark grid background.
- Dense but readable information.
- Quiet chrome.
- Clear node states.
- Bright status accents only where action or task state matters.
- No oversized hero section.
- No decorative card-heavy landing layout.

### First View Layout

The canvas tab should use the whole workbench area:

- Left rail: canvas elements and assets.
- Center: infinite graph canvas.
- Bottom center: compact tool dock.
- Bottom left: zoom and snap controls.
- Right side: selected node inspector, collapsed by default on smaller screens.
- Floating add-node menu from the plus button or double-click.

### Visual Hierarchy

1. Canvas nodes and connectors.
2. Active/running node state.
3. Prompt composer and run action.
4. Asset previews.
5. Secondary controls.

### Node Visual System

Node cards should be compact and fixed-size by type. They should not resize unexpectedly when content changes.

Recommended sizes:

- Script node: 420 x 260
- Send node: 480 x 300
- Image node: 420 x 360
- Video node: 460 x 320
- Audio node: 420 x 220
- Director node: 520 x 340
- Output node: 480 x 280

Node corners should stay restrained: 8px radius or less.

### Node States

- Idle: neutral border.
- Selected: bright border and subtle outside glow.
- Running: animated top progress line.
- Succeeded: small green status mark and result preview.
- Failed: red/orange border and retry action.
- Stale: amber mark when upstream input changed after generation.
- Missing input: muted dashed border around the required port.

### Connectors

Edges should be curved, visible on dark canvas, and state-aware:

- Default edge: muted gray.
- Selected edge: bright blue.
- Running edge: blue pulse.
- Invalid edge preview: red.
- Script/text output: white-gray port.
- Image output: cyan port.
- Video output: amber port.
- Audio output: green port.

## 6. Frontend Architecture

### New Suggested Files

Create a focused canvas module instead of expanding the already large workbench files:

```text
apps/web/src/features/production-workbench/canvas/
  canvas-controller.js
  canvas-store.js
  canvas-document.js
  canvas-runtime.js
  canvas-node-registry.js
  canvas-node-renderers.js
  canvas-edge-rules.js
  canvas-api.js
  canvas-events.js
  canvas-templates.js
  canvas-inspector.js
  canvas-toolbar.js
  canvas.css
```

### Responsibilities

`canvas-controller.js`

- Mount and unmount graph.
- Bind UI events.
- Coordinate graph, store, runtime, and inspector.

`canvas-store.js`

- Own in-memory document state.
- Track nodes, edges, viewport, selection, dirty state.
- Expose subscribe/update methods.

`canvas-document.js`

- Normalize saved documents.
- Migrate document versions.
- Serialize graph state.
- Validate required fields.

`canvas-runtime.js`

- Resolve upstream context.
- Run one node.
- Run downstream nodes later.
- Poll generation tasks.
- Mark node status and attach outputs.

`canvas-node-registry.js`

- Register node types.
- Define port schemas.
- Define default dimensions and templates.

`canvas-node-renderers.js`

- Render HTML for each node type.
- Keep rendering pure where possible.

`canvas-edge-rules.js`

- Validate connections by port type.
- Prevent cycles for executable flows.
- Define edge labels and styles.

`canvas-api.js`

- Wrap `creatorApi` calls with canvas-specific names.
- Keep backend API changes isolated.

`canvas-inspector.js`

- Render selected node inspector.
- Edit prompt, model, variables, references, and output settings.

`canvas-toolbar.js`

- Add-node menu.
- Zoom controls.
- Snap toggle.
- Undo/redo.
- Fit view.

## 7. Canvas Data Model

### Canvas Document

```js
{
  version: 1,
  projectId: "project_123",
  episodeId: "episode_123",
  viewport: {
    x: 0,
    y: 0,
    zoom: 1
  },
  nodes: [],
  edges: [],
  createdAt: "2026-06-10T00:00:00.000Z",
  updatedAt: "2026-06-10T00:00:00.000Z"
}
```

### Node

```js
{
  id: "node_script_001",
  type: "script",
  position: { x: 120, y: 180 },
  size: { width: 420, height: 260 },
  data: {
    title: "剧本",
    status: "idle",
    source: "project_script",
    sectionIds: ["section_1"],
    text: "",
    outputKind: "text",
    updatedAt: "2026-06-10T00:00:00.000Z"
  }
}
```

### Edge

```js
{
  id: "edge_001",
  sourceNodeId: "node_script_001",
  sourcePortId: "out_text",
  targetNodeId: "node_send_001",
  targetPortId: "in_text",
  data: {
    kind: "text",
    status: "idle"
  }
}
```

### Node Runtime Fields

Runtime fields belong in `node.data.runtime`:

```js
{
  status: "idle | queued | running | succeeded | failed | stale",
  taskId: "generation_task_123",
  progress: 0.45,
  errorCode: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null
}
```

Do not store transient timers, AbortControllers, or DOM references in the saved document.

## 8. Node Types

### Script Node

Purpose:

- Bring project script sections into the canvas.
- Provide text context to downstream nodes.

Inputs:

- None in MVP.

Outputs:

- `out_text`

Data:

- `source`: `project_script | pasted_text | uploaded_file`
- `sectionIds`
- `text`
- `scriptId`

Actions:

- Select script section.
- Edit text.
- Refresh from project script.
- Split into storyboard nodes later.

### Send Node

Purpose:

- Choose model and prompt.
- Resolve upstream context.
- Submit text, image, or video generation.

Inputs:

- `in_text`
- `in_image`
- `in_video`
- `in_audio`

Outputs:

- `out_text`
- `out_image`
- `out_video`

Data:

- `mediaKind`: `text | image | video`
- `modelCode`
- `prompt`
- `negativePrompt`
- `references`
- `parameters`
- `result`

Actions:

- Select model.
- Edit prompt.
- Insert upstream variables.
- Run.
- Retry.
- Duplicate node.

### Image Node

Purpose:

- Display uploaded or generated images.
- Act as reference input for later nodes.

Inputs:

- `in_image_optional`

Outputs:

- `out_image`

Data:

- `assetId`
- `assetVersionId`
- `src`
- `origin`: `upload | generated | imported`
- `linkedTaskId`

Actions:

- Upload.
- Set as current storyboard image.
- Use as reference.
- Open asset detail.

### Video Node

Purpose:

- Display generated or uploaded video.
- Feed later video/audio/output nodes.

Inputs:

- `in_image`
- `in_video_optional`

Outputs:

- `out_video`

Data:

- `assetId`
- `assetVersionId`
- `src`
- `thumbnailSrc`
- `durationSeconds`
- `linkedTaskId`

### Audio Node

Purpose:

- Upload or bind audio reference.
- Feed audio-driven generation later.

Inputs:

- None in MVP.

Outputs:

- `out_audio`

### Storyboard Node

Purpose:

- Hold structured shot information.
- Bridge existing storyboard flow and canvas flow.

Inputs:

- `in_text`
- `in_image_optional`

Outputs:

- `out_text`
- `out_image`

### Director Node

Purpose:

- Summarize several upstream nodes into a production direction.
- Useful for episode-level planning.

Inputs:

- Multiple text/image/video refs.

Outputs:

- `out_text`

### Output Node

Purpose:

- Collect final selected outputs for export or commit.

Inputs:

- `in_text`
- `in_image`
- `in_video`
- `in_audio`

Outputs:

- None.

## 9. Connection Rules

Allowed connections:

- `text -> text`
- `image -> image`
- `image -> reference`
- `video -> video`
- `audio -> audio`
- `any -> DirectorNode context input`
- `text + image -> SendNode`

Blocked connections:

- Output to output.
- Input to input.
- Self-loop.
- Cycle in executable path.
- Media type mismatch unless the target port explicitly accepts `any`.

If a user drags an invalid edge, the UI should explain the mismatch in a small tooltip near the target port.

## 10. Execution Model

### Run Current Node

1. User clicks Run on selected Send node.
2. Runtime validates required inputs.
3. Runtime gathers upstream node outputs.
4. Runtime builds prompt context.
5. Runtime resolves model configuration.
6. Runtime creates task or preview request.
7. Node status becomes `running`.
8. Runtime polls task.
9. Runtime writes result into node.
10. Optional: runtime creates a result node to the right.

### Context Resolution

For each input edge:

1. Find source node.
2. Read source output from `node.data.result` or source-specific fields.
3. Convert into a normalized context item.

Example:

```js
{
  kind: "text",
  label: "剧本",
  value: "第 1 场..."
}
```

Image reference:

```js
{
  kind: "image",
  label: "角色参考",
  assetId: "asset_123",
  assetVersionId: "version_123",
  url: "/api/..."
}
```

### Prompt Composition

Prompt composition should be explicit and inspectable:

```text
用户提示词

---
上游剧本
{{script_text}}

---
参考信息
{{reference_summary}}
```

The composed prompt can be shown in an expandable preview inside the inspector.

## 11. Backend Requirements

### Canvas Persistence

Add persistence for canvas documents. Recommended table:

```sql
CREATE TABLE project_canvas_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  episode_id uuid NULL,
  document_json jsonb NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz NULL
);
```

Recommended indexes:

```sql
CREATE INDEX project_canvas_documents_project_idx
  ON project_canvas_documents (organization_id, project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX project_canvas_documents_episode_idx
  ON project_canvas_documents (organization_id, episode_id)
  WHERE episode_id IS NOT NULL AND deleted_at IS NULL;
```

### API Endpoints

Project-level canvas:

```text
GET    /api/creator/projects/:projectId/canvas
PUT    /api/creator/projects/:projectId/canvas
POST   /api/creator/projects/:projectId/canvas/snapshot
GET    /api/creator/projects/:projectId/canvas/history
```

Episode-level canvas:

```text
GET    /api/episodes/:episodeId/canvas
PUT    /api/episodes/:episodeId/canvas
```

Node execution:

```text
POST   /api/creator/projects/:projectId/canvas/nodes/:nodeId/run
POST   /api/episodes/:episodeId/canvas/nodes/:nodeId/run
```

MVP can execute from frontend using existing generation APIs, but backend node execution is better long-term because it centralizes permission checks, billing, idempotency, and task orchestration.

### Canvas Save Contract

Request:

```js
{
  document: {},
  clientRevision: 12
}
```

Response:

```js
{
  document: {},
  serverRevision: 13,
  savedAt: "2026-06-10T00:00:00.000Z"
}
```

Conflict handling:

- If server revision changed, return 409.
- Frontend shows a conflict dialog.
- MVP can offer "reload server copy" and "overwrite".

## 12. Model Integration

Use `listGenerationConfig(episodeId)` to populate model menus. The response should provide:

- `models`
- `defaultImageModelCode`
- `defaultVideoModelCode`

The Send node should filter models by `mediaKind`:

- `image`: image generation models.
- `video`: video generation models.
- `text`: storyboard/text model path or AI storyboard preview endpoint.

If the current project lacks an episode context, use project-level text/storyboard generation first and disable image/video tasks until an episode is selected.

## 13. Script Integration

Script node should read from `getScriptReaderSections(projectId)`.

Script node modes:

- Linked: node references section IDs and can refresh from source.
- Snapshot: node stores a copy of text for stable generation.
- Pasted: user manually enters text.

Default behavior:

- Use linked mode when created from project script.
- Convert to snapshot for generation execution, so later script edits do not silently alter past outputs.

## 14. Asset Integration

Generated image/video nodes should store:

- `assetId`
- `assetVersionId`
- `taskId`
- `previewUrl`
- `mediaKind`
- `createdFromNodeId`

Upload nodes should use existing upload/import API. Result nodes should not duplicate binary data in canvas JSON.

## 15. Billing and Permissions

Generation must keep existing credit and permission behavior:

- Validate user can access project/episode.
- Validate model is enabled for the user/org.
- Check credit balance before task creation.
- Use idempotency keys for task creation.
- Store provider request and task records through existing model gateway paths.

Canvas edits themselves should be low-cost and not billable.

## 16. Error Handling

Canvas-level errors:

- Save failed.
- Load failed.
- Document conflict.
- Unsupported document version.

Node-level errors:

- Missing required input.
- Invalid model for media kind.
- Prompt too long.
- Upload missing.
- Generation task failed.
- Provider timeout.
- Insufficient credits.
- Permission denied.

Each node should show a short state label. Full details belong in the inspector.

## 17. Autosave

Use debounced autosave:

- Save 800ms after graph changes stop.
- Save immediately before running a node.
- Save after task result attaches.

Persist:

- Nodes.
- Edges.
- Viewport.
- Node data.

Do not persist:

- Hover state.
- Open menus.
- DOM state.
- Polling timers.

## 18. Testing Plan

### Unit Tests

- Normalize canvas document.
- Migrate document version.
- Validate edge rules.
- Resolve upstream context.
- Compose prompt.
- Map node run request to generation API input.

### Frontend Rendering Tests

- Canvas tab renders graph container.
- Add-node menu creates correct node.
- Script node loads project script sections.
- Send node model selector uses generation config.
- Invalid edge is rejected.
- Deleting node removes connected edges.

### Backend Tests

- GET empty canvas creates default document envelope.
- PUT canvas saves document.
- PUT rejects invalid document.
- Revision conflict returns 409.
- Unauthorized project access returns 403/404 according to existing convention.

### Browser QA

Use gstack/browser QA for:

- Pan and zoom.
- Add node from bottom toolbar.
- Connect Script to Send.
- Run Send node.
- Task state updates.
- Result node appears.
- Responsive behavior on tablet-width viewport.

## 19. Implementation Milestones

### Milestone 1: Static Canvas Shell

- Render dark grid.
- Add zoom controls.
- Add add-node menu.
- Create static Script, Send, Image nodes.

### Milestone 2: X6 Graph Engine

- Add X6 dependency.
- Mount graph inside `.canvas-stage`.
- Register custom HTML node views.
- Render Script, Send, Image nodes from the default canvas document.
- Use X6 ports and edges.
- Enable drag, pan, zoom, selection, and connection validation.
- Convert graph state back into the canvas document.

### Milestone 3: Document Store

- Create canvas module files.
- Serialize/deserialize nodes and edges.
- Autosave to local in-memory state first.
- Add unit tests for document normalization.

### Milestone 4: Backend Persistence

- Add DB table.
- Add project/episode canvas endpoints.
- Connect frontend autosave to API.
- Handle revision conflicts.

### Milestone 5: Script and Model Integration

- Script node loads project script sections.
- Send node loads generation config.
- Model selector filters by media kind.
- Inspector edits prompt and node settings.

### Milestone 6: Node Execution

- Run Send node.
- Call existing image/video/text generation APIs.
- Poll task state.
- Attach result to node.
- Create result node.

### Milestone 7: Polish and QA

- Node states.
- Edge states.
- Error messages.
- Undo/redo.
- Keyboard shortcuts.
- Browser QA and screenshots.

## 20. Acceptance Criteria

MVP is complete when:

- User can open the canvas tab and see an infinite grid.
- User can add Script and Send nodes.
- User can drag nodes and connect compatible ports.
- User can choose a model from project generation config.
- User can write a prompt.
- User can run an image or video generation from a node.
- User can see running, success, and failure states.
- User can see or create a result node.
- Canvas persists after reload.
- Invalid connections are blocked.
- Existing generation permissions and credit checks still apply.

## 21. Key Product Decisions

### Decision 1: X6 First

Choose X6 for MVP because it minimizes framework migration and can attach directly to the current workbench page.

### Decision 2: Business Runtime Separate From Canvas

Do not couple generation calls to node rendering. Canvas UI emits commands; runtime executes commands.

### Decision 3: Script Snapshot at Run Time

Generation should use a snapshot of upstream script content at the moment of execution. This makes outputs reproducible.

### Decision 4: Save Canvas as JSON

Use JSON document persistence for flexibility. Add versioned migrations from the beginning.

### Decision 5: Start With Single-Node Run

Do not build full DAG execution first. Start with running the selected Send node. Add downstream chain execution after the data model is proven.

## 22. Frontend Design Summary

The page should feel like a professional AI production console:

- Full-bleed dark canvas.
- Subtle dotted grid.
- Clear nodes with typed ports.
- Floating add menu.
- Bottom compact toolbar.
- Left canvas/asset rail.
- Right selected-node inspector.
- Model selector and run button inside Send node or inspector.
- Running edges and task progress as the main motion language.

The design preview is available at:

- `design-previews/canvas-ai-workflow/index.html`
