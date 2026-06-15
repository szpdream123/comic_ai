# 2026-06-13 Canvas Project Domain Separation Debug

## Symptom

- The project page showed many ordinary projects after creating canvas projects.
- A delete/update action showed a database error: updating or deleting `credit_reservations` violated the `ai_generation_task_snapshots_organization_id_credit_reserver_fkey` foreign key.

## Root Cause

- Standalone canvas project creation inserted a row into the ordinary `projects` table before inserting `creator_canvas_projects`, so canvas entries leaked into the ordinary project gallery.
- Ordinary project deletion removed `credit_reservations` before deleting `ai_generation_task_snapshots` rows that still referenced those reservations.
- The canvas schema made `creator_canvas_projects.project_id` mandatory, which forced standalone canvas projects to pretend to be ordinary projects.

## Fix

- `POST /api/creator/canvas-projects` now creates only `creator_canvas_projects` and leaves `project_id` null for standalone canvas projects.
- The canvas migration and dev DB repair path allow `creator_canvas_projects.project_id` to be null and only enforce uniqueness for non-null project-backed canvases.
- The ordinary project list filters out historical rows that are linked from active `creator_canvas_projects`, hiding previously polluted ordinary-project cards.
- Ordinary project deletion now clears generation task snapshots before removing credit reservations.

## Evidence

- Static imports passed:
  - `node --import tsx -e "await import('./apps/backend/src/entrypoints/phone-auth-dev-server.ts'); await import('./apps/backend/src/modules/project/creator-application.service.ts'); console.log('backend imports ok')"`
  - `node -e "await import('./apps/web/src/features/production-workbench/index.js'); console.log('web imports ok')"`

## Verification Limits

- Targeted backend HTTP tests could not complete because the test run did not have `DATABASE_URL` / `TEST_DATABASE_URL` configured, and several route tests returned 500 from that environment issue.
- The frontend project workbench test file has existing unrelated failures, but the canvas project gallery/create/menu/rename/delete tests passed in that run.

## Status

DONE_WITH_CONCERNS: root cause fixed and import-verified; full DB-backed verification still needs a configured PostgreSQL test database.
