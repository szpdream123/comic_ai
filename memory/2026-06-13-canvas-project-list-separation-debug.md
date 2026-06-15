# Canvas Project List Separation Debug - 2026-06-13

## Symptom

The canvas gallery showed only one card, even though the user expected three canvas projects.

## Root Cause

The current database contained one `creator_canvas_projects` row with `project_id` set. That row is a project-bound canvas for an ordinary project, not a standalone canvas project.

The standalone canvas gallery API, `GET /api/creator/canvas-projects`, listed all rows owned by the user without filtering `project_id IS NULL`. That mixed ordinary project-bound canvases into the standalone canvas gallery. The frontend then synced the remote list over local canvas state, so the gallery showed the one project-bound canvas and hid the old standalone canvas records.

There were also two legacy standalone canvas records in `.local/canvas-projects.json` from the pre-database implementation. They had not been migrated into `creator_canvas_projects`.

## Fix

Updated `apps/backend/src/entrypoints/phone-auth-dev-server.ts` so standalone canvas project list, find, update, and delete routes only operate on `project_id IS NULL` rows.

Added regression coverage in `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts` by inserting a same-user project-bound canvas and asserting it is excluded from the standalone canvas list and cannot be renamed through the standalone canvas route.

Migrated the two legacy records from `.local/canvas-projects.json` into `public.creator_canvas_projects` as standalone records for user `33a8817f-59b4-4f39-a717-87c79542f11b`.

## Evidence

Before the fix, the live database had one canvas row:

- `b32ff5ff-d7c3-4a98-b9b1-6da27e5f669d`
- title: `御魂之巅-第一卷 画布`
- `project_id`: `ee0b9c7b-fd53-43cd-bade-84363f616538`

After restart and migration, `GET /api/creator/canvas-projects` for phone `18571521874` returns two standalone projects:

- `c9663a85-5008-4ffc-8494-1b22b45d036b`, `画布项目 2`
- `fd7b3689-3263-4a88-bfc7-b8b72999caf6`, `画布项目 委屈`

The project-bound canvas remains in the database for ordinary project canvas use, but no longer appears in the standalone canvas gallery API.

## Verification

- Restarted Redis and the dev stack.
- `http://127.0.0.1:4310/app.html` returned 200.
- Authenticated live API request to `/api/creator/canvas-projects` returned only standalone canvas projects.
- `node --import tsx --input-type=module -e "await import('./apps/backend/src/entrypoints/phone-auth-dev-server.ts')"` passed.

The large HTTP test file could not be run cleanly through the current test wrapper with a single name pattern; direct node test execution initially missed env loading, and the env-loaded run timed out in the large file initialization.

## Status

DONE_WITH_CONCERNS: root cause fixed and live API verified; focused regression test was added but not successfully executed due test runner constraints.
