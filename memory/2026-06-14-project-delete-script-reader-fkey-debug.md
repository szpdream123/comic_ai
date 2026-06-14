# Project Delete Script Reader FK Debug

Date: 2026-06-14

## Symptom

Deleting a project failed with:

`操作失败：在 "episodes" 上的更新或删除操作违反了在 "script_reader_sections" 上的外键约束 "script_reader_sections_episode_id_fkey"`

## Root Cause

`deleteProjectRecord` deleted `episodes` before deleting `script_reader_sections`.

`script_reader_sections.episode_id` can reference `episodes.id`, so PostgreSQL correctly blocked deleting an episode while script reader sections still referenced it.

## Fix

Updated `apps/backend/src/modules/project/creator-application.service.ts`:

- Delete `script_reader_sections` for the project before `DELETE FROM episodes`.

Added regression coverage in `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`:

- Creates a project.
- Parses/creates an episode.
- Inserts a `script_reader_sections` row referencing the episode.
- Deletes the project.
- Asserts sections, episodes, and project rows are gone.

## Evidence

- Regression scenario passed: `deletes a project after script reader sections reference its episodes`.
- Full service test run: 26/28 passed. The 2 failures are existing storage URL expectation mismatches in this environment (`signed://creator-dev/` expected, COS public URL returned).
- Live dev stack restarted.
- API smoke test created and deleted a temporary project successfully:
  - create: 200
  - episode create: 200
  - delete: 200 `{"deleted":true,...}`

## Status

DONE_WITH_CONCERNS: delete bug fixed and verified. Full test suite still has unrelated storage URL assertion failures.
