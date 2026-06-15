# Project Canvas Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement project-scoped one-to-one canvas persistence so each project owns exactly one canvas, the canvas restores nodes/edges/data/layout after reload, and every canvas node image/video generation is recorded as queryable history.

**Architecture:** Add project canvas persistence tables and services around the current X6 `canvasDocument`. Store full document snapshots for fast restore, structured node/edge rows for query and validation, and node run/artifact rows for image/video history. Expose project-level canvas APIs through the creator backend, then wire the frontend to load/save by business `projectId` while preserving current X6 interactions.

**Tech Stack:** PostgreSQL migrations, Node.js TypeScript backend, existing `SqlDatabase`, phone-auth dev server routes, vanilla JS frontend, `apps/web/src/shared/creator-api.js`, existing X6 canvas modules, Node test runner.

**Source Documents:**
- `docs/product/canvas-workflow-storage-design.md`
- `docs/superpowers/specs/2026-06-12-project-canvas-persistence-design.md`

---

## Guardrails

- Do not create multiple canvases under one project.
- Do not add episode-level canvas routes.
- Do not treat existing `ai_generation_task_snapshots` as enough canvas history.
- Do not store image/video binary data in `document_json`.
- Do not rely only on frontend validation for saved edges.
- Do not rename or remove existing user work without explicit migration.
- Keep unrelated dirty worktree changes intact.

---

## Task 1: Project canvas schema

**Files:**
- Modify: `packages/db/migrations/0026_creator_canvas_projects.sql`
- Create: `apps/backend/src/modules/project/tests/creator-canvas-schema.spec.ts`

- [ ] **Step 1: Write the failing schema test**

Create `apps/backend/src/modules/project/tests/creator-canvas-schema.spec.ts`:

```ts
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("creator canvas schema", () => {
  const sql = readFileSync(new URL("../../../../../../packages/db/migrations/0026_creator_canvas_projects.sql", import.meta.url), "utf8");

  it("locks canvas projects to one active canvas per business project", () => {
    assert.match(sql, /project_id uuid NOT NULL/);
    assert.match(sql, /server_revision integer NOT NULL DEFAULT 1/);
    assert.match(sql, /latest_document_id uuid NULL/);
    assert.match(sql, /creator_canvas_projects_project_uidx/);
    assert.match(sql, /ON creator_canvas_projects \(organization_id, project_id\)/);
    assert.match(sql, /WHERE deleted_at IS NULL/);
  });

  it("declares document, node, edge, run, and artifact tables", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_documents/);
    assert.match(sql, /document_json jsonb NOT NULL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_nodes/);
    assert.match(sql, /position_x numeric NOT NULL DEFAULT 0/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_edges/);
    assert.match(sql, /source_node_key text NOT NULL/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_node_runs/);
    assert.match(sql, /input_snapshot_json jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS creator_canvas_node_artifacts/);
    assert.match(sql, /selected boolean NOT NULL DEFAULT false/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-schema.spec.ts
```

Expected: FAIL because the current migration only has the container table.

- [ ] **Step 3: Implement migration**

Update `0026_creator_canvas_projects.sql`:

- Add `project_id`, `server_revision`, `latest_document_id`.
- Change `status` to stable values: `draft | active | archived`.
- Add one-to-one partial unique index on `(organization_id, project_id) WHERE deleted_at IS NULL`.
- Add `creator_canvas_documents`.
- Add `creator_canvas_nodes`.
- Add `creator_canvas_edges`.
- Add `creator_canvas_node_runs`.
- Add `creator_canvas_node_artifacts`.
- Add `creator_canvas_sessions`.
- Add `creator_canvas_revisions`.
- Add `creator_canvas_events`.
- Use tenant-scoped composite foreign keys wherever the referenced table supports `(organization_id, id)`.

Minimum required node run history fields:

```sql
episode_id uuid NULL,
target_type text NULL,
target_id uuid NULL,
input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
output_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
task_id uuid NULL,
generation_snapshot_id uuid NULL
```

Minimum required artifact fields:

```sql
artifact_kind text NOT NULL,
asset_id uuid NULL,
asset_version_id uuid NULL,
storage_object_id uuid NULL,
url text NULL,
thumbnail_url text NULL,
selected boolean NOT NULL DEFAULT false,
selection_role text NOT NULL DEFAULT 'current'
```

Add selected-artifact uniqueness:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_node_artifacts_selected_role_uidx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, node_key, selection_role)
  WHERE deleted_at IS NULL AND selected = true;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-schema.spec.ts
```

Expected: PASS.

---

## Task 2: Canvas document service

**Files:**
- Create: `apps/backend/src/modules/project/creator-canvas-record.service.ts`
- Create: `apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Test cases:

- `getOrCreateProjectCanvas` creates one default canvas for a project.
- Calling it twice for the same project returns the same `canvasProjectId`.
- `saveProjectCanvas` rejects stale `clientRevision`.
- `saveProjectCanvas` rejects a document whose `projectId` does not match the URL project.
- `saveProjectCanvas` persists nodes, edges, viewport, and increments revision.
- Deleting a node soft-deletes its connected edges.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement service**

Implement:

- `getOrCreateProjectCanvas(db, input)`
- `saveProjectCanvas(db, input)`
- `getProjectCanvasByProjectId(db, input)`
- `normalizeCanvasDocument(input)`
- `validateCanvasDocument(input)`
- `upsertCanvasNodes(db, input)`
- `upsertCanvasEdges(db, input)`
- `appendCanvasRevision(db, input)`
- `appendCanvasEvents(db, input)`

Default document shape should match frontend:

```js
{
  version: 2,
  canvasProjectId,
  projectId,
  viewport: { x: 0, y: 0, zoom: 1, gridVisible: true, snapEnabled: true },
  nodes: [],
  edges: [],
  groups: [],
  createdAt,
  updatedAt
}
```

Use `SELECT ... FOR UPDATE` when saving to enforce revision.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts
```

Expected: PASS.

---

## Task 3: Server-side edge validation

**Files:**
- Create: `apps/backend/src/modules/project/creator-canvas-validation.ts`
- Create: `apps/backend/src/modules/project/tests/creator-canvas-validation.spec.ts`
- Modify: `apps/backend/src/modules/project/creator-canvas-record.service.ts`

- [ ] **Step 1: Write failing validation tests**

Test cases:

- Allows text output to text input.
- Rejects missing source node.
- Rejects missing target node.
- Rejects missing port.
- Rejects input-to-input and output-to-output.
- Rejects media mismatch.
- Rejects self-loop.
- Rejects cycle in executable graph.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-validation.spec.ts
```

- [ ] **Step 3: Implement validation**

Mirror the frontend `validateCanvasConnection()` behavior, then add cycle checks. Keep shared rules explicit enough to port later into a common package if needed.

- [ ] **Step 4: Run tests**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-validation.spec.ts apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts
```

Expected: PASS.

---

## Task 4: HTTP API

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify: `apps/backend/src/modules/project/creator-application.service.ts` if the route is routed through the application service.

- [ ] **Step 1: Write failing HTTP tests**

Add tests for:

- `GET /api/creator/projects/:projectId/canvas` creates and returns a canvas.
- Calling GET twice returns same `canvasProjectId`.
- `PUT /api/creator/projects/:projectId/canvas` saves document and returns incremented `serverRevision`.
- PUT with stale revision returns 409 and `canvas_revision_conflict`.
- PUT with mismatched `document.projectId` returns 400.
- PUT with invalid edge returns 400.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "project canvas"
```

- [ ] **Step 3: Implement routes**

Add:

```text
GET /api/creator/projects/:projectId/canvas
PUT /api/creator/projects/:projectId/canvas
```

Response envelopes should match existing creator API conventions.

Keep legacy `/api/creator/canvas-projects` routes only if existing UI still needs them during migration. Do not use them as the final project canvas API.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "project canvas"
```

Expected: PASS.

---

## Task 5: Frontend API wrapper

**Files:**
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/tests/creator-api.spec.ts`

- [ ] **Step 1: Write failing wrapper tests**

Add tests asserting:

- `creatorApi.getProjectCanvas("project/1")` calls `/api/creator/projects/project%2F1/canvas`.
- `creatorApi.saveProjectCanvas("project/1", payload)` PUTs to the same endpoint.
- `creatorApi.runCanvasNode(canvasProjectId, nodeKey, payload)` posts to `/api/canvas/:canvasProjectId/nodes/:nodeKey/run` when implemented in Task 8.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "project canvas"
```

- [ ] **Step 3: Implement wrappers**

Add:

```js
getProjectCanvas(projectId) {}
saveProjectCanvas(projectId, input) {}
runCanvasNode(canvasProjectId, nodeKey, input, options = {}) {}
listCanvasNodeRuns(canvasProjectId, nodeKey) {}
selectCanvasNodeArtifact(canvasProjectId, artifactId, input) {}
```

- [ ] **Step 4: Run test**

Run:

```bash
node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "project canvas"
```

Expected: PASS.

---

## Task 6: Frontend load/save integration

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/canvas/canvas-default-document.js`
- Modify: `apps/web/src/features/production-workbench/canvas/canvas-state.js`
- Modify: `apps/web/src/features/production-workbench/canvas/canvas-x6-graph.js`
- Modify: `apps/web/tests/canvas-workflow.spec.mjs`
- Modify: `apps/web/tests/project-workbench-generation.spec.ts` if needed.

- [ ] **Step 1: Write failing frontend tests**

Test cases:

- Opening project detail requests project canvas by business `projectId`.
- Saved document hydrates `workbench.ui.canvasDocument`.
- Drag/move/save/re-render preserves node position.
- Edge persists after save and reload.
- `selectedCanvasProjectId` no longer drives persistence identity.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test apps/web/tests/canvas-workflow.spec.mjs
```

- [ ] **Step 3: Implement integration**

Rules:

- Cache canvas documents by business `projectId`.
- Store `canvasProjectId` from backend separately from business `projectId`.
- Use backend `serverRevision` for autosave.
- Debounce saves after X6 mutations and node data edits.
- Save immediately before running a node.
- On 409 conflict, show a non-destructive conflict state and reload server document for MVP.

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test apps/web/tests/canvas-workflow.spec.mjs
```

Expected: PASS.

---

## Task 7: Canvas node run history schema service

**Files:**
- Modify: `apps/backend/src/modules/project/creator-canvas-record.service.ts`
- Create or modify: `apps/backend/src/modules/project/tests/creator-canvas-node-history.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

- `createCanvasNodeRun` increments `run_no` per node.
- `completeCanvasNodeRunWithArtifact` writes image artifact.
- The same video node can have multiple historical video artifacts.
- Selecting an artifact unselects the previous artifact for the same node and role.
- Listing node history returns artifacts in newest-first order.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-node-history.service.spec.ts
```

- [ ] **Step 3: Implement history methods**

Implement:

- `createCanvasNodeRun(db, input)`
- `markCanvasNodeRunQueued(db, input)`
- `completeCanvasNodeRun(db, input)`
- `failCanvasNodeRun(db, input)`
- `appendCanvasNodeArtifact(db, input)`
- `selectCanvasNodeArtifact(db, input)`
- `listCanvasNodeRuns(db, input)`

Do not delete old artifacts when a new run succeeds.

- [ ] **Step 4: Run test**

Run:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-node-history.service.spec.ts
```

Expected: PASS.

---

## Task 8: Run canvas node through existing generation path

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/modules/project/creator-canvas-record.service.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`

- [ ] **Step 1: Write failing HTTP test**

Add a test for:

```text
POST /api/canvas/:canvasProjectId/nodes/:nodeKey/run
```

Assert:

- It creates a `creator_canvas_node_runs` row.
- It passes `targetType = canvas` and `targetId = nodeKey` into the generation snapshot path.
- It returns `runId`, `runNo`, `taskId`, `status`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "run canvas node"
```

- [ ] **Step 3: Implement run route**

Route:

```text
POST /api/canvas/:canvasProjectId/nodes/:nodeKey/run
```

Behavior:

- Validate canvas belongs to actor organization/workspace.
- Validate node exists.
- Resolve `episodeId` from request, node data, or active workbench context.
- Save current revision first if request includes a document patch.
- Create node run.
- Submit image/video task using existing generation task machinery.
- Attach task IDs to node run.
- Return queued response.

- [ ] **Step 4: Wire frontend run**

Update current canvas run handler:

- Save canvas before run.
- Call `creatorApi.runCanvasNode(...)`.
- Update node runtime state from response.
- Continue polling existing generation task endpoint.
- On task complete, refresh node history or use response artifact once route supports completion callback.

- [ ] **Step 5: Run tests**

Run:

```bash
node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "run canvas node"
node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "project canvas"
node --test apps/web/tests/canvas-workflow.spec.mjs
```

Expected: PASS.

---

## Task 9: Artifact completion and history UI

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/modules/model-gateway/gpt-image.worker.ts` or finalizer path if task completion is handled there.
- Modify: `apps/backend/src/modules/model-gateway/generation-task-snapshot.service.ts` if needed.
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Modify: `apps/web/tests/canvas-workflow.spec.mjs`

- [ ] **Step 1: Write failing tests**

Backend:

- A completed canvas image task appends an image artifact.
- A completed canvas video task appends a video artifact.
- Previous artifacts remain.

Frontend:

- Selected canvas node shows a history list.
- History item can be selected.
- Current selected artifact is visible in the node.

- [ ] **Step 2: Run tests to verify failure**

Run targeted backend and web tests.

- [ ] **Step 3: Implement completion hook**

When a generation task with `targetType = canvas` completes:

- Resolve `canvasProjectId` and `nodeKey`.
- Append artifact from task result asset.
- Mark run completed or failed.
- Update current node runtime snapshot.
- Select the new artifact by default for `selection_role = current`.
- Append revision/event.

- [ ] **Step 4: Implement history UI**

In node inspector:

- Show latest run status.
- Show image/video history list.
- Show selected badge.
- Add select action.
- Keep old results visible in history after new generation.

- [ ] **Step 5: Run tests**

Run:

```bash
node --test apps/web/tests/canvas-workflow.spec.mjs
```

and targeted backend tests added in this task.

---

## Task 10: gstack browser QA

**Files:**
- Create: `artifacts/canvas-persistence-qa/browser-qa-report.json`
- Screenshots under: `artifacts/canvas-persistence-qa/`

- [ ] **Step 1: Start local app**

Use the existing local dev stack command for this repo. If unavailable, document the exact blocker.

- [ ] **Step 2: Browser QA flow**

With gstack/browser:

1. Login or use dev auth.
2. Open a project detail page.
3. Enter canvas tab.
4. Add a script node.
5. Add image send node.
6. Connect nodes.
7. Move node.
8. Save or wait for autosave.
9. Reload page.
10. Verify node position and edge restored.
11. Run image generation on a canvas node.
12. Verify node history contains image artifact.
13. Run again.
14. Verify history contains at least two artifacts.
15. Select previous artifact.
16. Verify selected result changes and persists after reload.

- [ ] **Step 3: Capture evidence**

Save screenshots:

- `01-canvas-loaded.png`
- `02-after-node-move-and-connect.png`
- `03-after-reload-restored.png`
- `04-node-history-two-results.png`
- `05-selected-previous-artifact.png`

- [ ] **Step 4: Write QA report**

Report must include:

- URL tested.
- Browser viewport.
- User/account used, without secrets.
- Steps run.
- Pass/fail per acceptance criterion.
- Console errors.
- Network failures.
- Screenshots list.

---

## Task 11: Final gstack review gate

**Files:**
- No production edits unless review finds issues.

- [ ] **Step 1: Schema review**

Confirm:

- Project one-to-one uniqueness exists.
- Node run and artifact tables exist.
- Selected artifact uniqueness exists.
- Tenant-scoped foreign keys exist.

- [ ] **Step 2: Service review**

Confirm:

- Revision conflict returns 409.
- Illegal document/edge rejected.
- Node deletion soft-deletes edges.
- Run history is not overwritten by new runs.

- [ ] **Step 3: Frontend review**

Confirm:

- The UI uses business `projectId` to load canvas.
- `canvasProjectId` is only backend canvas container id.
- Reload restores document.
- Node history UI exists.

- [ ] **Step 4: Test run**

Run focused tests:

```bash
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-schema.spec.ts
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-record.service.spec.ts
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-validation.spec.ts
node --import tsx --test apps/backend/src/modules/project/tests/creator-canvas-node-history.service.spec.ts
node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "project canvas|run canvas node"
node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "project canvas"
node --test apps/web/tests/canvas-workflow.spec.mjs
```

- [ ] **Step 5: Completion standard**

Only mark complete if:

- Tests pass or failures are documented as unrelated existing failures.
- Browser QA has screenshot evidence.
- Every generated canvas image/video is recorded in node history.
- Reload preserves graph and selected artifact.

---

## Spec coverage

This plan covers the required project one-to-one canvas model, document snapshots, structured nodes and edges, node image/video run history, selected artifact persistence, backend validation, frontend API integration, browser QA, and `$gstack` follow-up review gate.
