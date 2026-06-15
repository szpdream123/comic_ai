# Project / Script Library Separation Debug

Date: 2026-06-13

## Symptom

The project page and script page showed overlapping records. Script-only items appeared under "全部项目", while ordinary project scripts could appear under "我的剧本".

## Root Cause

The storage model uses `projects` as a host table for both ordinary production projects and independent script-library documents. Ordinary project creation also creates an internal `scripts` row with no independent script title. The two list APIs were reading those shared tables without separating the product domains:

- `/api/creator/projects` returned script-library host projects.
- `/api/creator/scripts` returned ordinary project internal scripts.
- The frontend import/original-script actions also inserted script-created projects into `ui.projectLibrary` immediately after creation.

## Fix

- `apps/backend/src/modules/project/creator-application.service.ts`
  - `listProjectsForWorkspace` now excludes projects that own an active script with a non-null title.
  - `listScriptsForWorkspace` now returns only scripts with a non-null title, treating those as independent script-library records.
- `apps/web/src/features/production-workbench/index.js`
  - Importing a script document no longer inserts the hidden script host project into `ui.projectLibrary`.
  - AI original script creation now calls the independent script import/create path and refreshes `scriptLibraryRecords`, instead of creating a normal project card.
- `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`
  - Added a regression test proving that an ordinary project remains in the project list and an independent script remains in the script list, without crossing over.

## Evidence

Root cause hypothesis confirmed by code trace:

- `createProject` writes a project plus an internal script with `scripts.title = NULL`.
- `importScriptDocument` writes a project host plus an independent script with `scripts.title` set.
- The former list queries did not use this discriminator.

Verification:

- `node --input-type=module -e "await import('./apps/web/src/features/production-workbench/index.js')"` passed.
- `node --env-file=.env --import tsx --test apps/backend/src/modules/project/tests/creator-application.service.spec.ts --test-name-pattern "keeps workspace project and script libraries separated"` showed the new regression test passing.
- The full service test run loaded the env and passed 25/27 tests. The 2 failures were existing storage URL expectation mismatches: current env returns COS public URLs while those tests expect `signed://creator-dev/`.

## Status

DONE_WITH_CONCERNS: the separation fix is implemented and the targeted regression passed. Full service test run has unrelated pre-existing storage URL assertion failures in this environment.
