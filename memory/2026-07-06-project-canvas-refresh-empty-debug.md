# Project Canvas Refresh Empty Debug

Date: 2026-07-06

## Symptom

Refreshing the tools canvas detail surface could show an empty canvas with 0 nodes even though the project canvas had saved nodes.

## Root Cause

`syncCanvasProjectsFromApi` always used the standalone canvas detail loader when `getCanvasProjects` existed. For project-scoped canvases, the active document must be loaded from `/api/creator/projects/:projectId/canvas`. If the backend canvas project list was empty or unrelated, the code then fell through to `syncActiveCanvasDocument`, which could leave the detail surface with an empty/default canvas document.

Hard refresh also lost `activeCanvasBusinessProjectId` because it was not persisted. Old local state could still be identified when the selected canvas id matched `canvasDocument.projectId` and the document carried a distinct `canvasProjectId`.

## Fix

- Persist and restore `activeCanvasBusinessProjectId` and `activeCanvasProjectId`.
- Infer project-scoped canvas context from old cached documents when safe.
- When the tools canvas detail surface is project-scoped, reload via `loadProjectCanvasForActiveProject` instead of standalone canvas loading.

## Evidence

Added regression coverage:

`reloads project-scoped canvas documents on the tools canvas detail surface`

This test failed before the fix because only `getCanvasProjects` was called. It now passes and verifies `getProjectCanvas:project-1` is called and the persisted node returns.

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`
- `node --test --test-name-pattern "reloads project-scoped canvas documents on the tools canvas detail surface|renders one reference thumbnail per uploaded image connection|renders connected image references in the video generation editor" apps/web/tests/project-workbench-generation.spec.ts`

## Related

An existing neighboring test, `keeps the canvas gallery empty when the backend returns no projects`, still fails because older list-mode logic can synthesize a default local canvas project from a cached empty document after the backend returns an empty project list. That is a separate gallery/list fallback issue, not the project-scoped detail refresh path fixed here.

## Follow-up: Debounced Save Refresh Window

The first fix loaded the correct project-scoped endpoint, but another refresh-loss path remained:

- Canvas edits persist to local storage immediately.
- Database writes are debounced by 600ms.
- If the user refreshes inside that debounce window, the backend can still return the older empty canvas.
- The remote-load path then replaced the non-empty local cached document with that empty backend document.

Fix applied:

- When loading a project or standalone canvas, compare the remote document with the matching cached local document.
- If the remote document is empty and the local document for the same project/canvas has nodes or edges, keep the local document and schedule an immediate database save.
- Legacy starter canvases are excluded from this recovery path so old placeholder content is not resurrected.
- When the backend successfully returns an empty canvas project list on the gallery page, keep the gallery empty instead of synthesizing a local placeholder project.

Regression coverage added:

- `preserves local project canvas changes when refresh happens before the database save`
- Existing related test `keeps the canvas gallery empty when the backend returns no projects` now passes.

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `node --test --test-name-pattern "keeps the canvas gallery empty when the backend returns no projects|preserves local project canvas changes when refresh happens before the database save|reloads project-scoped canvas documents on the tools canvas detail surface|dual-writes canvas document changes to local cache and database" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`

Full `node --test apps/web/tests/project-workbench-generation.spec.ts` was also attempted and remains red with many unrelated failures across existing dirty worktree areas (home shell, styling snapshots, script entry, voice modal, generation mocks, and older canvas generation tests).

## Follow-up: Enter Detail Then Refresh Still Empty

The user confirmed that entering a canvas detail page and refreshing still showed an empty canvas.

Root cause:

- The canvas gallery normalizer rendered only the canvas record id and dropped the backend `projectId`.
- `open-canvas-project` therefore always treated opened cards as standalone canvases, clearing `activeCanvasBusinessProjectId`.
- If the card actually represented a project-backed canvas, the detail surface and refresh path could call the standalone canvas adapter or keep only the canvas id, missing `/projects/:projectId/canvas`.

Fix applied:

- Preserve `projectId` in rendered canvas cards as `data-business-project-id`.
- When opening a project-backed canvas card, set `activeCanvasBusinessProjectId`, keep `activeCanvasProjectId`, load with `getProjectCanvas`, and persist that context immediately.
- During detail refresh, if older local state only stored the canvas id but the refreshed canvas project list includes `projectId`, recover the business project context and load via `getProjectCanvas`.

Regression coverage added:

- `opens project-backed canvas cards through the project canvas adapter`
- `recovers project-backed canvas detail refreshes when older local state only stored the canvas id`

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `node --test --test-name-pattern "opens project-backed canvas cards through the project canvas adapter|recovers project-backed canvas detail refreshes when older local state only stored the canvas id|preserves local project canvas changes when refresh happens before the database save|reloads project-scoped canvas documents on the tools canvas detail surface|keeps the canvas gallery empty when the backend returns no projects|dual-writes canvas document changes to local cache and database" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`

## Follow-up: URL Must Carry Project ID

The user correctly pointed out that `#tools-canvas` does not encode which project canvas should be loaded. If local state is stale or missing, refresh cannot know which project id to use for a fresh backend request.

Fix applied:

- Project-backed canvas opens now write `#/tools-canvas/:projectId` to the hash.
- The workbench route parser recognizes `#/tools-canvas/:projectId` on initial load and hash changes.
- Parsed route project id is assigned to `activeCanvasBusinessProjectId` and `selectedCanvasProjectId`, so `syncCanvasProjectsFromApi` can directly call `getProjectCanvas(projectId)`.
- Standalone canvas behavior remains compatible with the old `#tools-canvas` route.

Regression coverage added:

- `reloads a project canvas directly from the project id in the tools canvas url`
- `opens project-backed canvas cards through the project canvas adapter` now also verifies the hash becomes `#/tools-canvas/project-1`.

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `node --test --test-name-pattern "opens project-backed canvas cards through the project canvas adapter|reloads a project canvas directly from the project id in the tools canvas url|recovers project-backed canvas detail refreshes when older local state only stored the canvas id|preserves local project canvas changes when refresh happens before the database save|reloads project-scoped canvas documents on the tools canvas detail surface|keeps the canvas gallery empty when the backend returns no projects|dual-writes canvas document changes to local cache and database" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`

## Follow-up: URL Still Did Not Change

The user showed the browser still at `#tools-canvas`.

Root cause:

- The previous URL fix depended on the canvas card carrying `projectId`.
- In the real page, the open action did not receive `businessProjectId`, so `businessProjectId` was empty and the hash still fell back to old `#tools-canvas`.
- Users already sitting on the old detail URL also needed automatic upgrade without going back to the list.

Fix applied:

- `open-canvas-project` now falls back to `resolveActiveProjectId(workbench)` when the canvas card omits `projectId`.
- Old detail route `#tools-canvas` now uses the active project context to set `activeCanvasBusinessProjectId`.
- Successful project canvas loading upgrades the browser hash to `#/tools-canvas/:projectId`.

Regression coverage added:

- `uses the active project context for canvas detail urls when canvas cards omit project id`
- `upgrades the legacy tools canvas url to include the active project id on refresh`

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --test --test-name-pattern "uses the active project context for canvas detail urls when canvas cards omit project id|upgrades the legacy tools canvas url to include the active project id on refresh|opens project-backed canvas cards through the project canvas adapter|reloads a project canvas directly from the project id in the tools canvas url|recovers project-backed canvas detail refreshes when older local state only stored the canvas id|preserves local project canvas changes when refresh happens before the database save|dual-writes canvas document changes to local cache and database" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`

## Follow-up: Global Canvas List Must Use Canvas ID, Not Previous Project ID

The user showed the canvas list at `#tools`; opening a canvas detail did not change the URL, and refreshing returned to the list.

Root cause:

- The previous fix still treated missing `businessProjectId` as a cue to infer from the last active project.
- On the global "all canvases" page, cards always have a canvas id but may not have a business project id.
- Because the inferred project id path was unreliable and standalone canvases had no business project id, the URL could remain `#tools` or `#tools-canvas`, so refresh went back to the list.

Fix applied:

- Detail URLs now use the clicked canvas id: `#/tools-canvas/:canvasId`.
- Only cards with an explicit `businessProjectId` use the project canvas adapter.
- Cards without `businessProjectId` load through `getStandaloneCanvas(canvasId)` and still update the URL.
- Refresh from `#/tools-canvas/:canvasId` selects that canvas id; after fetching the canvas project list, if the list record has `projectId`, it maps to project canvas, otherwise it loads standalone.
- Legacy `#tools-canvas` no longer guesses from the previous active project; it can upgrade only from an already selected canvas id.

Regression coverage added:

- `uses the canvas id for standalone canvas detail urls when cards omit business project id`
- `opens a standalone canvas project without requesting a business project canvas` now verifies hash upgrade to `#/tools-canvas/canvas-main`.
- `upgrades the legacy tools canvas url to include the selected canvas id on refresh`
- `reloads a project canvas directly from the canvas id in the tools canvas url`

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `node --test --test-name-pattern "uses the canvas id for standalone canvas detail urls when cards omit business project id|opens a standalone canvas project without requesting a business project canvas|upgrades the legacy tools canvas url to include the selected canvas id on refresh|opens project-backed canvas cards through the project canvas adapter|reloads a project canvas directly from the canvas id in the tools canvas url|recovers project-backed canvas detail refreshes when older local state only stored the canvas id|restores the selected standalone canvas document when refreshing the tools canvas detail route|preserves local project canvas changes when refresh happens before the database save|dual-writes canvas document changes to local cache and database" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`

## Follow-up: URL Correct But Refreshed Canvas Still Empty

The user showed `#/tools-canvas/:canvasId` in the URL, but after refresh the canvas rendered 0 nodes.

Root cause:

- The URL now identified the canvas correctly, but canvas edits were still saved with a 600ms debounce.
- A fast refresh could happen before the debounce fired, leaving the database document empty.
- The existing local workbench persistence is project-keyed; global canvas pages can lack a project id, so local fallback was not reliable for standalone canvases.

Fix applied:

- Canvas document saves now schedule on the next event loop tick by default instead of waiting 600ms.
- Added a canvas-specific local cache keyed by canvas id under `comic-ai:production-workbench:canvas-document:<canvasId>`.
- Every canvas document update writes to that canvas-specific cache and starts the database save immediately.
- Remote canvas loads and successful saves also refresh the canvas-specific cache.
- If the backend document is empty but the canvas-specific cache has nodes/edges for the same canvas id, the UI restores the cached document and immediately writes it back to the database.

Regression coverage added:

- `starts saving standalone canvas edits before a quick refresh can lose nodes`
- `recovers standalone canvas nodes from canvas cache when the backend document is still empty`

Verification commands run:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --test --test-name-pattern "starts saving standalone canvas edits before a quick refresh can lose nodes|recovers standalone canvas nodes from canvas cache when the backend document is still empty|dual-writes canvas document changes to local cache and database|uses the canvas id for standalone canvas detail urls when cards omit business project id|opens a standalone canvas project without requesting a business project canvas|upgrades the legacy tools canvas url to include the selected canvas id on refresh|restores the selected standalone canvas document when refreshing the tools canvas detail route|preserves local project canvas changes when refresh happens before the database save" apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`
- `node --check apps/web/src/features/production-workbench/project-detail.js`

## Status

DONE_WITH_CONCERNS

## Follow-up: Database Has Multiple Canvas Project Rows But Refresh Shows None/One

The user clarified that the database already contains two canvas records and a refresh should render those records from the backend instead of falling back to local recovery.

Root cause:

- `listCanvasProjects` filtered out any `creator_canvas_projects` row whose `project_id` pointed at a normal project. It only returned standalone rows or rows linked to generated projects named with the `画布生成 - ` prefix.
- The frontend treated canvas cards with `projectId` as project-singleton canvases and loaded `/api/creator/projects/:projectId/canvas`. That path can only return one canvas for a project and overwrote the previously fetched canvas list.

Fix applied:

- The canvas project list/read/update/delete backend helpers now use the canvas project row id as the authority and no longer hide normal project-linked canvas rows.
- Opening and refreshing `#/tools-canvas/:canvasId` now loads `/api/creator/canvas-projects/:canvasId/canvas`, even when the list record also has a business `projectId`.
- Route restore clears stale `activeCanvasBusinessProjectId` when the route contains a canvas id, preventing old local project context from redirecting the request to the singleton project canvas adapter.

Regression coverage added/updated:

- `keeps multiple database canvas records visible after refreshing a project-backed canvas`
- `opens project-backed canvas cards through the canvas project adapter`
- Backend canvas project HTTP route coverage now asserts project-linked canvas rows are listed and manageable by canvas id.

Verification:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --check apps/web/src/features/production-workbench/project-detail.js`
- Targeted `node --test --test-name-pattern ... apps/web/tests/project-workbench-generation.spec.ts`
- `npm test -- apps/web/tests/canvas-workflow.spec.mjs`
- Targeted backend `node --import tsx --test --test-name-pattern "creates, renames, lists, and deletes canvas projects through HTTP routes" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

Known verification caveat:

- The team-member canvas visibility backend test is still blocked before the canvas list assertion by an existing `team_member_management_required` fixture/entitlement setup issue.
