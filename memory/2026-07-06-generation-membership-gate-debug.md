# 2026-07-06 generation membership gate debug

## Symptom

Clicking the episode workbench Generate button without an active membership could enter the generating state and submit a generation task instead of asking the user to open membership.

## Root Cause

The single image/video generation path called `ensureGenerationReady()`, but that function only checked project, storyboard, and calibration readiness. It did not refresh or enforce membership status before setting the UI to running.

The backend real episode generation task path also only checked membership when `estimatedCost > 0`. A model or parameter set that resolved to zero credits could bypass membership enforcement.

## Fix

- `apps/web/src/features/production-workbench/index.js`
  - Added an active membership check to `ensureGenerationReady()`.
  - Refreshes `/api/membership/status` before generation when available.
  - Blocks inactive/no membership before the UI enters the generating state.
  - Shows `有效会员已过期或未开通，请先开通会员。` directly for membership errors.
- `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
  - Requires active generation membership for real episode generation tasks regardless of estimated credit cost.

## Evidence

- `node --import tsx --test --test-name-pattern "blocks single storyboard video generation when membership is inactive|blocks asset batch image generation when membership is inactive" apps/web/tests/project-workbench-generation.spec.ts`
- `.env DATABASE_URL` + `node --import tsx --test --test-name-pattern "rejects configured generation models when the organization has no active membership" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- `.env DATABASE_URL` + `node --import tsx --test --test-name-pattern "allows image and video generation when active membership summary exists without period rows" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

## Regression Test

- Added frontend coverage for single storyboard video generation with inactive membership.
- Changed the backend no-membership generation test to use a zero-credit configured model, proving membership enforcement no longer depends on credit cost.

## Status

DONE
