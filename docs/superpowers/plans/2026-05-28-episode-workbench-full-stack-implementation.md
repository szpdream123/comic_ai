# Episode Workbench Full Stack Implementation Plan

## Objective

Ship the project-detail -> episode-list -> episode-workbench flow end to end:

- This checklist is for the episode child page under a project. It must be wired as
  `project detail -> episodes tab -> episode card -> episode workbench`, not as a
  standalone generation page.
- Frontend visually matches the captured MuseAI episode flow as closely as the existing design system allows.
- Backend exposes real episode-scoped APIs, persists all business facts, and reuses existing project, shot, asset, task, credit, idempotency, and storage infrastructure.
- Uploads go browser -> cloud/local storage directly, then backend completes and binds metadata.
- Generation is currently mock-backed but shaped as real async tasks: image returns the fixed wasteland AVIF, video returns the fixed episode MP4, and later real providers can replace only the executor.

## Project/Episode Placement

The source capture describes the page opened after selecting one episode inside a
project. The page must always carry both project and episode context:

```text
project list/home
  -> project detail
    -> episodes tab
      -> episode card
        -> episode workbench
```

Implementation responsibilities:

- `project-detail.js` renders project-level data, the `episodes[]` list, export history, and the entry cards.
- `index.js` owns navigation glue: open/create an episode, call `GET /api/episodes/:episodeId/workbench`, then return to the same project's episodes tab.
- `episode-workbench-rebuilt.js` owns the selected episode's assets, storyboards, generation tasks, upload binding, set-result actions, and export actions.
- Backend `/api/projects/:projectId/*` endpoints serve project/detail/tab data; backend `/api/episodes/:episodeId/*` endpoints serve only the currently opened episode.

Hard boundary:

- Opening episode 2 must never show episode 1 storyboards, generation tasks, uploads, or export records.
- `episode-primary` is only a legacy frontend fallback id. New APIs and persisted facts must use real `episodes.id`.
- Returning from the workbench goes to the current project's episodes tab and does not clear confirmed backend facts.

## Current Code Anchors

Frontend:

- `apps/web/src/features/production-workbench/project-detail.js`
- `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`
- `apps/web/src/features/production-workbench/index.js`
- `apps/web/src/shared/creator-api.js`

Backend:

- `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- `apps/backend/src/modules/project/creator-application.service.ts`
- `apps/backend/src/modules/storage/upload-session.service.ts`
- `apps/backend/src/modules/credit-billing/credit-ledger.service.ts`
- `apps/backend/src/modules/shared/idempotency/idempotency.service.ts`

Database:

- `packages/db/migrations/0001_foundation.sql`
- `packages/db/migrations/0002_storage_uploads.sql`
- `packages/db/migrations/0004_episode_workbench_hardening.sql`

Source contract:

- `C:\Users\yzk\Documents\其他\museai_live_flow_capture\页面流程采集记录.md`

## Current Implementation Status - 2026-05-29

Completed in the current worktree:

- `creator-api.js` unwraps the new `{ requestId, data }` envelope and preserves old raw creator responses.
- New frontend helpers exist for project detail v2, project episode CRUD, episode workbench shell, episode assets, storyboards, generation config/tasks, generation task lookup, file binding, set-result actions, and draft saving.
- Backend adapter routes exist for:
  - `GET /api/projects/:projectId/detail`
  - `POST /api/projects/:projectId/episodes`
  - `PATCH /api/projects/:projectId/episodes/:episodeId`
  - `DELETE /api/projects/:projectId/episodes/:episodeId`
  - `GET /api/projects/:projectId/export-tasks`
  - `GET /api/episodes/:episodeId/workbench`
  - `GET /api/episodes/:episodeId/assets`
  - `GET /api/episodes/:episodeId/storyboards`
  - `GET /api/episodes/:episodeId/generation-config`
  - `GET /api/episodes/:episodeId/generation-tasks`
  - `POST /api/episodes/:episodeId/generation/image-tasks`
  - `POST /api/episodes/:episodeId/generation/video-tasks`
  - `POST /api/episodes/:episodeId/file-resources/bind`
  - `DELETE /api/episodes/:episodeId/file-resources/:fileId`
  - `POST /api/episodes/:episodeId/assets/:assetId/set-fixed-image`
  - `POST /api/episodes/:episodeId/storyboards/:storyboardId/set-current-image`
  - `POST /api/episodes/:episodeId/storyboards/:storyboardId/set-current-video`
  - `POST /api/episodes/:episodeId/export-tasks`
  - `GET /api/generation-tasks/:taskId`
- Backend route tests now cover the new enveloped project-detail -> episode-workbench -> lazy module contract.
- Backend generation task tests now cover persisted image/video task creation, idempotent replay, storage object registration, asset version result binding, signed/local URL return, and no Windows path leakage.
- Frontend API tests now cover v2 helper URLs, idempotency headers, envelope unwrapping, and envelope error fields.
- `0004_episode_workbench_hardening.sql` is now live in the worktree and adds `shots.scene_analysis`, `shots.plot_preview`, `shots.prompt_draft`, `shots.tts_draft`, `shots_episode_sort_idx`, `tasks_episode_lookup_idx`, `episode_generation_drafts`, and `export_records.episode_id` plus FK/index hardening.
- `episode-generation-draft.service.ts` plus `PATCH /api/episodes/:episodeId/generation-drafts/:targetType/:targetId` now persist per-asset/per-storyboard prompt drafts through the real episode-scoped backend.
- `index.js` now prefers `getProjectDetailV2`, `createProjectEpisode`, `getEpisodeWorkbench`, and `listStoryboards` for the project-to-episode entry path, with the old creator endpoints as migration fallback.
- Episode workbench image/video generation buttons now use episode-scoped task APIs when inside a real episode workbench, then poll `GET /api/generation-tasks/:taskId` every 15 seconds and stop after 15 minutes.
- Mock generation now writes `workflows`, `tasks`, `storage_objects`, `asset_versions`, `idempotency_records`, `credit_reservations`, `credit_reservation_allocations`, and `credit_ledger_entries`; successful mock tasks consume the reservation.
- `GET /api/generation-tasks/:taskId` now settles stale non-terminal episode generation tasks older than 15 minutes as `failed/task_timeout` and releases reserved credits idempotently.
- `/api/storage/repair` now also scans stale episode generation tasks and releases reserved credits, so timeout settlement does not depend only on the frontend continuing to poll.
- Episode direct-upload binding now rejects missing or incomplete upload sessions, creates an `asset_versions` binding over the completed `storage_objects` row, and returns signed file fragments.
- Asset fixed-image writeback now accepts a verified image asset version/storage object and returns the updated asset/file fragment.
- Frontend storyboard image/video uploads now use the direct upload result and prefer episode `bindFileResource`, so later set-current-image/set-current-video actions can use real `assetVersionId` + `storageObjectId`.
- Episode file deletion now deletes unreferenced storage objects and returns `file_in_use` when the file is currently bound to a storyboard or export record; the frontend keeps the UI card when backend deletion fails.
- Frontend generation reference uploads and episode image attachments now also prefer episode `bindFileResource`; audio attachments remain direct-upload-only because the lip-sync/audio chain is explicitly paused for v1.
- Legacy `/api/creator/assets/import` and shot-media imports still accept inline `data:` references during migration, while new direct-upload paths remain available.
- Direct episode routes such as `#/projects/:projectId/episodes/:episodeId` and `/projects/:projectId/episodes/:episodeId` now restore project detail plus the episode workbench shell from backend state, so refresh does not depend only on persisted `selectedEpisodeId`.
- Dev server now serves `app.html` for extensionless episode deep links, so direct refresh can reach the frontend router instead of failing before boot.
- Episode workbench now renders current storyboard image/video media, uploading media states, first/last-frame references, reference uploads, edit-source video cards, and storyboard media thumbnails in the MuseAI-style workbench shell.
- Frontend route/render tests now cover episode child route parsing, full episode workbench media rendering, uploading states, reference/edit-source cards, and storyboard media thumbnails.
- `GET /api/episodes/:episodeId/generation-config` now resolves the current episode context before returning models and credit balance, so generation configuration is also scoped to the real project and episode.
- `generation-config.uploadLimits` now returns the market upload policy, direct-upload preparation rejects disallowed MIME/extension/size, local proxy upload rechecks actual bytes, and the frontend `uploadFile` helper rejects invalid files before preparing an upload.
- Episode media ownership now checks `asset_versions.metadata_json.episodeId` when present. A generated/uploaded media version from episode 1 cannot be used by episode 2 for `set-current-video`, `set-current-image`, delete, or original-video export even when both episodes are in the same project.
- The episode workbench now loads `generation-config`, passes `uploadLimits` into every local upload call, and renders the current image/video/audio/reference limits in the prompt panel.
- Frontend error formatting now recognizes API envelope `origin_forbidden`, `permission_denied`, `unauthenticated`, and `resource_not_found` errors, adds actionable Chinese guidance, and preserves `requestId` in the user-facing toast/error text.
- Project detail deep links now restore the parent episode tab: `#/projects/:projectId` loads the project workspace and opens `projectInteriorSection=episodes` instead of falling back to the project library.
- Episode child deep links now work both as hash routes and server fallback routes. `app.html` uses root-relative JS/CSS URLs so `/projects/:projectId/episodes/:episodeId` can refresh directly and still boot the frontend.
- The frontend now prefers real persisted episodes over the legacy `episode-primary` fallback when both exist, only injects `episode-primary` for true no-real-episode/unassigned-shot compatibility, and avoids reopening the episode workbench against `episode-primary` when a real episode route should be used.
- Added `scripts/episode-workbench-browser-qa.mjs`, a CDP browser QA script that creates a real project, episode, and storyboard through backend APIs, opens the project episode tab, clicks the episode card into the workbench, verifies mobile direct refresh, and writes screenshots plus JSON evidence.
- Authorization failures from the shared actor resolver now return stable envelopes instead of falling through as 500s:
  - unauthenticated -> `401 unauthenticated`
  - missing project/workspace/organization/membership/tenant scope -> `404 resource_not_found`
  - missing capability or disabled tenant/member/user -> `403 permission_denied`
- Viewer-role and cross-organization episode access are now covered by HTTP tests. Viewers can read the episode workbench but cannot start generation; users outside the owning organization receive 404 envelopes for both read and write episode routes.
- The browser QA script now uses a unique temporary Chrome profile per run, avoiding stale Windows profile locks from previous failed/headless sessions.
- The dev server now starts a configurable background repair scheduler after `listen()` and clears it during `close()`. It runs the same storage repair plus stale episode generation timeout settlement used by `/api/storage/repair`, so queued/running episode generation tasks release reserved credits without relying on frontend polling or manual API calls.
- Repair scheduler controls:
  - `STORAGE_REPAIR_SCHEDULER_ENABLED` / `CREATOR_REPAIR_SCHEDULER_ENABLED` can disable it with `0`, `false`, `off`, or `no`.
  - `STORAGE_REPAIR_INTERVAL_MS` / `CREATOR_REPAIR_INTERVAL_MS` controls interval, default `60000`, minimum `250`.
  - `STORAGE_REPAIR_TASK_LIMIT` / `CREATOR_REPAIR_TASK_LIMIT` controls per-run stale task limit, default `100`.
- The episode workbench now loads real episode assets on entry through `GET /api/episodes/:episodeId/assets`, maps them into workbench-local state, and prefers those episode-scoped assets over stale project-detail fallback data.
- The browser QA scenario now creates a real project, selects it into the creator runtime, creates a real episode, uploads seed media through the direct-upload flow (`prepare -> blob/COS -> complete -> import`), and verifies the episode workbench against non-empty right-side asset quick references.
- Workbench visual tightening is now in progress directly in the current repo:
  - top bar density reduced
  - asset quick lane shows real typed asset cards
  - desktop storyboard card spacing tightened
  - mobile workbench now stacks vertically instead of collapsing the quick lane into a narrow side strip
  - episode hub card density tightened and launch cards no longer rely on placeholder empty-state geometry

Still incomplete for the requested final state:

- Some legacy creator import fallbacks remain for non-episode pages and for paused audio/lip-sync flows; the active episode image/video/reference paths now use episode binding first.
- One-to-one pixel comparison against the original MuseAI capture is still not automated. Browser evidence now proves route/layout parity at the project episode tab, desktop workbench, and mobile direct-refresh workbench, but not literal pixel diff parity.
- The whole repository objective is not yet proven complete. Current evidence is strongest for the `project detail -> episodes tab -> episode card -> episode workbench` slice; remaining non-episode pages still need the same level of end-to-end contract audit before the full-project goal can be declared done.
- Frontend visual parity is still not at the requested "1:1" bar. Remaining strongest gaps:
  - project episodes desktop card composition, spacing, and secondary-nav feel
  - episode workbench desktop storyboard-card internal proportions and top-bar hierarchy
  - episode workbench mobile polish after the recent structural fix
  - duplicated legacy CSS overrides in `production-workbench.css` still make final parity work slower and riskier than it should be

## Verified Snapshot - 2026-05-29

Most trustworthy currently verified slice:

```text
project detail
  -> episodes tab
    -> create/list episodes
      -> open episode workbench
        -> load episode assets/storyboards/config/tasks
        -> direct upload to storage
        -> bind uploaded media
        -> create image/video tasks
        -> poll task status every 15s
        -> settle timeout after 15m and release credits
        -> write image/video result back to asset/storyboard
        -> export original episode video
```

What this means in practice:

- The episode workbench flow is not a stub anymore. It is backed by persisted episodes, shots/storyboards, assets, storage objects, asset versions, tasks, idempotency records, and credit reservations/ledger rows.
- Mock generation is still used for provider output, but only at the executor boundary. The API shape, task lifecycle, storage registration, and UI flow are already modeled as replaceable real production contracts.
- Direct upload is already aligned with the desired production path. The frontend does not send the full file payload through business routes before storage.

## Current Delivery Plan

Execution order from here should stay fixed:

1. Protect the working backend/data contract.
   - Keep running backend route, upload, storage, migration, and credit-settlement tests on every milestone.
   - Avoid introducing new frontend shortcuts that bypass `/api/projects/:projectId/*`, `/api/episodes/:episodeId/*`, or direct-upload storage sessions.

2. Finish the episode slice to a truly shippable visual bar.
   - Continue screenshot-driven parity work on:
     - project episodes desktop tab
     - episode workbench desktop
     - episode workbench mobile
   - Prefer removing/flattening duplicate CSS overrides over piling on more overrides.

3. Freeze the episode slice with evidence.
   - Keep browser QA screenshots and JSON as acceptance evidence.
   - Maintain green:
     - backend route tests
     - storage upload tests
     - creator API tests
     - workbench render/state tests
     - migration tests

4. Extend the same standard outward to the rest of the project.
   - Apply the same end-to-end contract audit to non-episode pages before claiming the full project objective is complete.

## Current Evidence - 2026-05-29

- `D:\nodejs\node.exe --import tsx --test apps\web\tests\project-workbench-generation.spec.ts`
  - 62/62 pass
- `D:\nodejs\node.exe --import tsx --test apps\web\tests\creator-api.spec.ts apps\web\tests\login-page.spec.ts`
  - creator API and app shell tests green in prior combined runs
- `D:\nodejs\node.exe --import tsx --test apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts`
  - 28/28 pass in the current worktree
- `D:\nodejs\node.exe scripts\episode-workbench-browser-qa.mjs`
  - current QA script verifies:
    - project episode tab render
    - episode-card -> episode-workbench navigation
    - direct mobile episode refresh
    - visible upload limits
    - visible generate CTA
    - real quick-reference assets on the right lane
    - `consoleErrors=[]`
    - `badGeometryCount=0`
- Current acceptance artifacts:
  - `artifacts/episode-workbench-qa/project-episodes-desktop.png`
  - `artifacts/episode-workbench-qa/episode-workbench-desktop.png`
  - `artifacts/episode-workbench-qa/episode-workbench-mobile.png`
  - `artifacts/episode-workbench-qa/browser-qa-report.json`

Deployment decision:

- Default to the in-process repair scheduler for the current long-lived dev/runtime host.
- Add platform-native cron to call `/api/storage/repair` only if the deployment target is stateless or cannot guarantee a long-lived process.

Verification evidence from this pass:

- `node scripts/run-tests.mjs apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts`
  - 19/19 dev server tests passed.
  - 4/4 storage upload tests passed.
- `node scripts/run-tests.mjs apps\web\tests\project-workbench-generation.spec.ts apps\web\tests\creator-api.spec.ts`
  - 51/53 project workbench tests passed, 2 intentionally skipped legacy/modal tests.
  - 12/12 creator API tests passed.
- `node scripts/run-tests.mjs apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts apps\web\tests\project-workbench-generation.spec.ts apps\web\tests\creator-api.spec.ts`
  - 20/20 dev server tests passed.
  - 5/5 storage upload tests passed.
  - 53/55 project workbench tests passed, 2 intentionally skipped legacy/modal tests.
  - 12/12 creator API tests passed.
- `node --import tsx -e "import './apps/backend/src/entrypoints/phone-auth-dev-server.ts'; import './apps/web/src/features/production-workbench/index.js'; import './apps/web/src/features/production-workbench/episode-workbench-rebuilt.js'; import './apps/web/src/shared/creator-api.js'; console.log('imports ok')"`
  - Import smoke check passed.
- `node scripts/run-tests.mjs apps\web\tests\login-page.spec.ts apps\web\tests\project-workbench-generation.spec.ts`
  - 5/5 login/app shell tests passed.
  - 54/56 project workbench tests passed, 2 intentionally skipped legacy/modal tests.
- `node scripts/episode-workbench-browser-qa.mjs`
  - Passed in real headless Chromium through `http://127.0.0.1:4311`.
  - Verified `#/projects/:projectId` renders the project episode hub.
  - Verified clicking an episode card routes to `#projects/:projectId/episodes/:episodeId` and renders `.episode-replica-layout`.
  - Verified direct mobile refresh at `/projects/:projectId/episodes/:episodeId` renders the same episode workbench.
  - Verified upload limits and generate button are visible in the workbench, `badGeometryCount=0`, and `consoleErrors=[]`.
  - Evidence files:
    - `artifacts/episode-workbench-qa/project-episodes-desktop.png`
    - `artifacts/episode-workbench-qa/episode-workbench-desktop.png`
    - `artifacts/episode-workbench-qa/episode-workbench-mobile.png`
    - `artifacts/episode-workbench-qa/browser-qa-report.json`
- `node scripts/run-tests.mjs apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts`
  - 23/23 dev server tests passed.
  - New coverage proves viewer episode generation returns `403 permission_denied` with `details.reason=capability_missing`.
  - New coverage proves cross-organization users receive `404 resource_not_found` for episode workbench read and generation write routes with `details.reason=membership_missing`.
  - New coverage proves the background repair scheduler marks stale episode generation tasks `task_timeout` and releases reserved credits without a manual `/api/storage/repair` call.
- `node scripts/run-tests.mjs apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts apps\web\tests\creator-api.spec.ts apps\web\tests\login-page.spec.ts apps\web\tests\project-workbench-generation.spec.ts`
  - 23/23 dev server tests passed.
  - 5/5 storage upload tests passed.
  - 15/15 creator API tests passed.
  - 5/5 app shell tests passed.
  - 56/56 project workbench tests passed.
- `node scripts/run-tests.mjs apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts apps\web\tests\creator-api.spec.ts apps\web\tests\login-page.spec.ts apps\web\tests\project-workbench-generation.spec.ts`
  - 5/5 storage upload tests passed.
  - 15/15 creator API tests passed.
  - 5/5 app shell tests passed.
  - 54/56 project workbench tests passed, 2 intentionally skipped legacy/modal tests.
- `node scripts/episode-workbench-browser-qa.mjs`
  - Re-run passed after switching the QA script to unique temporary Chrome profiles.
- `node scripts/run-tests.mjs apps\web\tests\project-workbench-generation.spec.ts apps\web\tests\creator-api.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.spec.ts apps\backend\src\entrypoints\tests\phone-auth-dev-server.storage-upload.spec.ts apps\backend\src\modules\shared\db\tests\episode-workbench-hardening-schema.spec.ts`
  - 58/58 project workbench tests passed.
  - 15/15 creator API tests passed.
  - 23/23 dev server tests passed.
  - 5/5 storage upload tests passed.
  - 1/1 episode workbench schema hardening migration test passed.
- `node scripts/episode-workbench-browser-qa.mjs`
  - Re-run passed with `projectLoadMs=425`, `workbenchLoadMs=217`, `mobileLoadMs=371`.
  - Verified `consoleErrors=[]` and `badGeometryCount=0`.

## Milestone 0 - Contract Freeze

Deliverables:

- Keep the page-flow capture document as product contract.
- Keep this plan as engineering execution contract.
- Preserve existing `/api/creator/*` during migration.
- New episode workbench main path uses `/api/projects/:projectId/*`, `/api/episodes/:episodeId/*`, and `/api/generation-tasks/:taskId`.

Done when:

- Frontend helper supports both old raw responses and new `{ requestId, data }` envelope.
- All new episode helper methods exist in `creator-api.js`.

## Milestone 1 - Backend Episode API Adapter

Add adapter functions/routes without rewriting the old creator application.

Endpoints:

- `GET /api/projects/:projectId/detail`
- `POST /api/projects/:projectId/episodes`
- `PATCH /api/projects/:projectId/episodes/:episodeId`
- `DELETE /api/projects/:projectId/episodes/:episodeId`
- `GET /api/projects/:projectId/export-tasks`
- `GET /api/episodes/:episodeId/workbench`
- `GET /api/episodes/:episodeId/assets`
- `GET /api/episodes/:episodeId/storyboards`
- `GET /api/episodes/:episodeId/generation-config`
- `GET /api/episodes/:episodeId/generation-tasks`
- `POST /api/episodes/:episodeId/generation/image-tasks`
- `POST /api/episodes/:episodeId/generation/video-tasks`
- `GET /api/generation-tasks/:taskId`

Implementation rules:

- These routes are only valid inside the project detail -> episodes tab -> episode workbench chain. Do not build an independent standalone generation page for this checklist.
- Map `storyboardId` to `shots.id`.
- Map project-level episode card fields from `episodes` plus `shots`.
- Return only page shell from `workbench`; load assets/storyboards/tasks by module.
- Every new endpoint returns `{ requestId, data }` or `{ requestId, errorCode, message, details }`.
- For now, image/video generation may immediately create/finalize mock tasks, but must write task and result facts.
- Every episode route, including config/list helper routes, must call an episode/project permission resolver before returning data. No route may fall back to `devOrganizationId` once an `episodeId` is present.

Done when:

- Project detail can list episodes and open a real episode workbench by id.
- Episode workbench data survives page refresh because it comes from backend state.
- Invalid or unauthorized `episodeId` returns a stable 404/403 envelope and does not leak another project's data.

## Milestone 2 - Data Model Hardening

Add or adapt tables/fields:

- `shots.scene_analysis`, `shots.plot_preview`, `shots.prompt_draft`, `shots.tts_draft` if needed.
- `episode_assets` if current `assets` cannot represent episode-local role/scene/prop worksets cleanly.
- `file_resources` only as a thin owner binding table over `storage_objects`, not as a parallel storage truth.
- Constraints for status enums, owner scopes, unique episode sort order, and storage binding integrity.
- Add explicit constraints/indexes for episode workbench facts if they remain in existing tables:
  - `shots`: `(organization_id, episode_id, sort_order)` index, non-negative sort order, and FK to `(organization_id, episode_id)`.
  - `asset_versions`: FK to `storage_objects`, media metadata JSON presence for uploaded/generated media, and no dangling `storage_object_id`.
  - `tasks`: index for `(organization_id, project_id, task_type, created_at)` plus `input_snapshot_json->>'episodeId'` lookup if this remains the episode task filter.
  - `export_records`: retain `storage_object_id` ownership through project/org and make original-video exports queryable by episode through workflow/task snapshot or a future `episode_id` column.

Done when:

- Existing tables are reused where possible.
- Missing tables/columns have migrations.
- Tests assert migrations include constraints and indexes.
- Tests prove "episode 2 cannot see episode 1" for storyboards, tasks, uploads, set-result, and exports.
- Tests prove episode 2 cannot set or export episode 1's tagged media even when both belong to the same project.

## Milestone 3 - Mock Generation With Real Persistence

Backend:

- Register or copy fixed image/video into local/cloud storage.
- Create generation tasks with idempotency.
- Reserve credits on task creation.
- Finalize success with result file references.
- Release credits on failed/canceled/task_timeout.
- Polling endpoint marks tasks timed out after 15 minutes.

Frontend:

- Submit image/video tasks through new helpers.
- Show task cards and poll every 15 seconds for the current target.
- Never hardcode fixed local paths.
- Keep executor boundary replaceable: the only mock-specific code should be the task executor/source-media registration, not the API shape or frontend flow.

Done when:

- Image generation displays fixed AVIF from a served/signed URL.
- Video generation displays fixed MP4 from a served/signed URL.
- Credit balance changes are returned by backend and reflected in UI.
- Failed, canceled, timed-out, or future provider-failed tasks release reserved credits exactly once.

## Milestone 4 - Upload, Bind, Set Result, Delete

Backend:

- Reuse upload sessions for direct upload.
- Add episode file binding endpoint.
- Add set fixed image/current image/current video endpoints.
- Enforce media type, purpose, tenant, project, episode, and permission checks.
- Hard-delete or fail clearly if cloud delete fails.

Frontend:

- Use prepare -> PUT/COS -> complete -> bind.
- Keep upload progress local.
- Set result card enters pending state; left card updates only after backend success.
- Delete failure keeps UI card visible.
- Enforce these upload limits in UI and backend config before handoff:
  - Images: jpg/png/webp/avif, max 20 MB each, max 30 reference images per task.
  - Videos: mp4/webm/mov, max 500 MB each, recommended max 15 minutes for source/reference videos.
  - Audio, when resumed later: mp3/wav/m4a, max 100 MB each.
  - Reject executable/archive/unknown MIME types even if the file extension looks valid.
- The backend must expose these limits through `GET /api/episodes/:episodeId/generation-config`, and `creatorApi.uploadFile` must enforce the same defaults before calling `prepareUpload`.
- The episode workbench must read the config and show the active limits near the upload controls.

Done when:

- A reference upload can be used in a task.
- A generated result can become an asset fixed image or storyboard current video.
- Delete behavior matches backend result.
- Direct upload never proxies large bytes through the app backend except the local development adapter.
- Oversized videos, unknown MIME types, and blocked extensions fail before a storage object becomes available.

## Milestone 5 - One-to-One Frontend Fidelity

Scope:

- Project episode tab must match screenshot structure: project shell, vertical nav, episode count, export history, AI batch card, single episode card, existing episode cards.
- Episode workbench must match captured flow: dark layout, left assets/storyboards, center result/work area, right generation panel, asset shortcut strip, component-level errors.
- The entry point for QA is always a real project detail page with the episodes tab selected, then a real episode card click. A direct deep link is a refresh/restore path, not the primary product path.
- Batch buttons stay present but disabled/paused for v1 where the user requested partial batch cutoff.

Done when:

- Browser screenshot of project episode tab visually matches the provided screenshot at desktop width.
- Browser screenshot of episode workbench matches captured page flow screenshots.
- Mobile/tablet do not overlap text or controls.
- Back navigation returns to the same project episodes tab with the same episode cards and export history still visible.

## Milestone 6 - End-to-End Verification

Backend tests:

- New route envelope and errors.
- Episode list/detail mapping.
- Workbench shell and lazy module endpoints.
- Idempotent generation task creation.
- Fixed media URL is browser-accessible.
- Credit reserve/consume/release.
- Permission: viewer gets 403, cross-project gets 404.
- CORS: non-whitelisted origin returns 403 envelope; allowed local/file origins preserve credentials.
- Upload limits: backend rejects files over the configured size and MIME allowlist.
- Ownership: `set-current-image`, `set-current-video`, delete, and export reject media from another episode/project/org.

Frontend tests:

- Project detail episode card enters episode workbench.
- Back returns to project episodes tab.
- New helpers unwrap envelope.
- Upload flow handles success/failure.
- Polling is scoped by episode/target/task.
- Batch disabled behavior.
- CORS/403 envelope renders a clear user-facing permission/origin message and includes the request id.
- 15-minute frontend timeout marks local task failed and stops polling; backend timeout remains the source of truth on the next task fetch.

Runtime QA:

- Start dev server.
- Login.
- Open project detail.
- Create/open episode.
- Upload reference file.
- Generate image/video.
- Set result.
- Export original video.
- Refresh `/projects/:projectId/episodes/:episodeId` and verify the workbench is restored from backend data.
- Run desktop, tablet, and mobile screenshots for both the project episodes tab and episode workbench.

## Whole-Project Migration Audit - 2026-05-29

Current state from the worktree:

- The most mature, end-to-end slice is now the episode child-page flow:
  `project detail -> episodes tab -> episode card -> episode workbench`.
- That slice already has real backend routes, real persistence, direct upload, mock task persistence, credit reserve/release, timeout settlement, export binding, route refresh restore, browser QA, and passing HTTP/frontend tests.
- The whole project is not yet fully migrated to that same contract level. A large part of the rest of the product still runs through legacy `/api/creator/*` routes and compatibility state.

Frontend modules still primarily using legacy creator routes:

- Project create/select/update/delete/cover:
  - `createProject`
  - `selectProject`
  - `updateProject`
  - `deleteProject`
  - `updateProjectCover`
- Script and asset-review pipeline:
  - `parseScript`
  - `confirmAsset`
  - `confirmAllAssets`
  - `updateAssetLabel`
- Project-level support panels:
  - `getProjectMembers`
  - `getProjectStats`
  - `getExportHistory`
- Legacy shot/calibration/generation chain used outside the episode-scoped workbench path:
  - `createShot`
  - `updateShot`
  - `importShotMedia`
  - `deleteShotMedia`
  - `replaceShotReferences`
  - `deleteShot`
  - `reorderShots`
  - `runCalibration`
  - `skipCalibration`
  - `overrideCalibration`
  - `generateImages`
  - `generateVideos`
  - `previewExport`

Backend route reality at this point:

- New route family exists and is real for:
  - `/api/projects/:projectId/detail`
  - `/api/projects/:projectId/episodes`
  - `/api/projects/:projectId/export-tasks`
  - `/api/episodes/:episodeId/*`
  - `/api/generation-tasks/:taskId`
  - `/api/storage/upload-sessions/*`
- Legacy creator route family still exists and remains the main contract for:
  - project creation/update/select/delete
  - script parsing
  - asset confirm/import/generate/library maintenance
  - calibration flow
  - shot CRUD/reorder/reference/media import
  - legacy project export preview/history
  - members/stats side panels

This means the remaining whole-project development plan should be split into three tracks:

1. Product-shell migration
- Move project list/detail shell actions that still depend on `/api/creator/*` onto stable project-scoped contracts.
- Replace project create/select/update/delete/cover compatibility handlers with durable project routes and envelope semantics.
- Ensure project overview, members, stats, and export history panels all load from project-scoped APIs instead of creator-session state.

2. Pre-workbench pipeline migration
- Migrate the script -> asset extraction/review -> calibration flow off session-centric creator state and onto real project/episode persisted APIs.
- Persist the script planning and asset confirmation pipeline in a way that can survive refresh and deep links, matching the same standard already used by the episode workbench.
- Replace legacy shot CRUD/reorder/media-import routes with project/episode scoped routes backed by the same `shots`, `assets`, `asset_versions`, `storage_objects`, `tasks`, and credit facts.

3. Fidelity and whole-project QA closure
- Extend browser QA beyond the episode workbench slice to cover:
  - project list
  - script tab
  - project overview
  - asset library flows
  - asset review/calibration path
  - project members/stats panels where applicable
- Build page-by-page parity checks against the captured MuseAI structure, not just the episode child page.
- Re-run regression/perf checks after each migration wave to prove the episode workbench path stays intact while the rest of the app catches up.

Definition of "whole project done" remains strict:

- Frontend: all major visible pages in this app must use the intended real backend contract rather than hidden session-only compatibility state.
- Backend: user actions must be interactive, permission-checked, and durably persisted.
- Data: facts must land in the real tables rather than only transient UI/session state.
- Chain: create/open project -> script/asset prep -> episode workbench -> generation -> result binding -> export must be recoverable after refresh and consistent across page boundaries.

## Execution Wave A - Project Shell + Script/Asset Pipeline

This is the next concrete delivery wave after the episode workbench slice.

### A1. Project shell and project detail side panels

Current evidence:

- Frontend still uses legacy creator routes for:
  - `createProject`
  - `selectProject`
  - `updateProject`
  - `deleteProject`
  - `updateProjectCover`
  - `getProjectMembers`
  - `getProjectStats`
  - `getExportHistory`
- Backend still serves those actions from `/api/creator/*`.

Target:

- Create stable project-scoped contracts for:
  - project create/list/detail/select-equivalent behavior
  - project update/delete
  - project cover update using existing upload-session/storage-object facts
  - project members/stats panels
  - project-level export history panel
- Remove hidden dependence on creator-session state for project workspace hydration.

Recommended backend contract additions:

- `POST /api/projects`
- `PATCH /api/projects/:projectId`
- `DELETE /api/projects/:projectId`
- `POST /api/projects/:projectId/cover`
- `GET /api/projects/:projectId/members`
- `GET /api/projects/:projectId/stats`
- keep `GET /api/projects/:projectId/detail`
- keep `GET /api/projects/:projectId/export-tasks`

Data/runtime rules:

- Project create/update/delete must continue to write through real `projects`, `scripts`, `episodes`, `shots`, `assets`, `asset_versions`, `storage_objects`, `tasks`, and `export_records` cleanup logic already present in `creator-application.service.ts`.
- Cover update must bind a real uploaded `storage_object` and return a browser-usable URL, same as the current episode media path.
- Members/stats must be derived from persisted membership/project facts, not fabricated shell data.

Frontend migration steps:

- Replace project shell actions in `index.js` with new `/api/projects/*` helpers.
- Keep old creator helpers only as temporary fallback until the new tests pass.
- Make project workspace re-entry rely on project APIs plus persisted detail, not on opaque creator-session state.

Verification:

- Create/rename/delete/cover-update a project from the real shell.
- Refresh and reopen the same project detail successfully.
- Members/stats/export history panels survive refresh and deep-link entry.

### A2. Script planning page

Current evidence:

- `script-page.js` is largely static UI.
- Opening script flows still funnels into creator-session actions like `parseScript`.
- There is no project-scoped script planning contract yet matching the new route family.

Target:

- Promote the script page from shell-only UI to a real persisted planning surface.
- Persist original-script planning input, uploaded script source, and planning output so the page can survive refresh and later feed project creation / episode creation.

Recommended backend contract additions:

- `POST /api/scripts/plans` or `POST /api/projects/:projectId/script-plans`
- `GET /api/scripts/:scriptId` or `GET /api/projects/:projectId/script`
- `PATCH /api/scripts/:scriptId`
- `POST /api/scripts/:scriptId/parse`

Data/runtime rules:

- Reuse the existing `scripts` table as the durable source of uploaded or authored script content.
- Any AI planning output must land in persisted fields or a dedicated planning table, not only in transient UI state.
- The planning step must be idempotent and permission-checked like generation tasks.

Frontend migration steps:

- Wire `renderScriptManagementPage` and `renderOriginalScriptModal` to real read/write APIs.
- Replace “empty shell” script library behavior with real saved script entries.
- Show planning task/result states from backend data.

Verification:

- Create a script planning draft, refresh, and reopen it.
- Parse a script through a persisted backend flow.
- Confirm the resulting project/asset-prep chain can continue from saved script facts.

### A3. Asset confirmation and calibration path

Current evidence:

- Frontend still depends on `assetCandidates`, `assetReview`, `confirmAsset`, `confirmAllAssets`, `updateAssetLabel`, `runCalibration`, `skipCalibration`, and `overrideCalibration`.
- Those are still primarily creator-session style flows.

Target:

- Turn asset review and calibration into a durable project-scoped pipeline that survives refresh and keeps the same visual behavior.
- Preserve the current page structure while replacing session-only assumptions with persisted records.

Recommended backend contract additions:

- `GET /api/projects/:projectId/asset-review`
- `POST /api/projects/:projectId/asset-review/confirm-all`
- `POST /api/projects/:projectId/asset-review/confirm`
- `PATCH /api/projects/:projectId/assets/:assetId/label`
- `POST /api/projects/:projectId/calibration/run`
- `POST /api/projects/:projectId/calibration/skip`
- `POST /api/projects/:projectId/calibration/override`

Data/runtime rules:

- `asset_review_candidates`, `assets`, `asset_versions`, `calibration_sessions`, and `calibration_items` should become the stable facts for this stage.
- Skip/override reasons must land durably and be inspectable after refresh.
- Readiness flags such as `assetReview.readyForGeneration` and `calibration` should be computed from persisted state, not cached only in creator state.

Frontend migration steps:

- Replace `state.assetCandidates`, `state.assetReview`, and `state.calibration` hydration from `/api/creator/state` with project-scoped loaders.
- Keep the current visual affordances in overview/assets/workbench entry pages, but source them from persisted project facts.

Verification:

- Confirm one asset and confirm all assets through the real backend.
- Run calibration, skip calibration, and override calibration with persisted reasons.
- Refresh project detail and verify readiness state is restored from backend.

### A4. Legacy shot workflow retirement plan

Current evidence:

- Frontend still calls legacy `createShot`, `updateShot`, `deleteShot`, `reorderShots`, `replaceShotReferences`, and `importShotMedia`.
- Episode workbench already has a more modern episode-scoped read/generate/set-result path.

Target:

- Collapse the old creator shot workflow onto the same real `shots` backbone used by the episode workbench.
- Avoid maintaining two business truths for shot editing.

Recommended backend contract additions:

- `POST /api/projects/:projectId/shots`
- `PATCH /api/shots/:shotId`
- `DELETE /api/shots/:shotId`
- `POST /api/projects/:projectId/shots/reorder`
- `PUT /api/shots/:shotId/references`
- replace legacy shot media import with upload-session + bind + set-result flow

Verification:

- Shot CRUD and reorder must survive refresh and match the same data later shown in the episode workbench.
- Legacy shot-media import should disappear as a primary flow once direct upload + bind is available everywhere.
