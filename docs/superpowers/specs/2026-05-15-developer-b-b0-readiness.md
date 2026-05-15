# Developer B B0 Readiness

Date: 2026-05-15
Owner: Developer B

## What B Can Ship Now

- Contract review for `CreateProject`, `ParseScript`, `GenerateShotImage`, and `CreateExport`
- Deterministic fixtures for B1 and B2 tests
- Scenario matrices covering B1 command behavior and B2 workflow behavior
- Blocker inventory that points back to A2, A3, A4, and missing creator-domain schema work

## Active Blockers

1. `A2 ActorContext` is still required for any real creator-domain write path.
2. `A3 Audit` is still required before creator commands can append durable audit records.
3. `A4 Workflow/Task` is still required before `ParseScript`, image generation, or export can create long-running jobs.
4. `packages/db/migrations/0001_foundation.sql` currently defines foundational tables through `workflows` and `tasks`, but does not yet define `projects`, `scripts`, `assets`, `asset_versions`, or `shots`.

## Hand-off Assets Added In Code

- `apps/backend/src/modules/project/project-readiness.ts`
- `apps/backend/src/modules/project/tests/project-readiness.spec.ts`

These files provide stable fixtures, scenario coverage, and explicit blockers so B can move into real implementation as soon as A unlocks the platform boundaries.
