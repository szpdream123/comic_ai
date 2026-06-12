# 2026-06-12 Current User Credit Balance Debug

## Symptom

Frontend status bar showed `0` credits while the admin "用户与积分" page showed the same frontend user had `2,036` available credits.

## Root Cause

The frontend status bar could read `ui.creditBalance` or generation config `creditBalance` before the authenticated user's own balance. Backend session data only returned identity fields, and episode generation config used organization-level credit balance. For users with a team member profile or account-specific credit allocation, that did not match the admin user credit table's current-user available credit value.

## Fix

- Added `getUserCreditBalance` in `apps/backend/src/entrypoints/phone-auth-dev-server.ts`.
- Included `creditBalance`, `availableCredits`, and `reservedCredits` on `/api/auth/session`.
- Episode generation config now reads the current authenticated user's available balance.
- Frontend status bar now prefers `session.user.availableCredits` before stale UI/config balances.

## Evidence

- `node --test apps/web/tests/statusbar-header-render.spec.mjs` passed.
- Direct API verification with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/comic_ai_dev` showed `{"sessionCredits":2036,"generationCredits":2036}`.
- Full backend file run still has unrelated existing failures in current workspace state, including app shell script query-string assertion, active video model drift, and text/gateway expectation drift.

## Regression Tests

- `apps/web/tests/statusbar-header-render.spec.mjs`: status bar prefers current user balance over stale config balance.
- `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`: session and generation config return current user's available credits.

## Status

DONE_WITH_CONCERNS: bug path verified, but full backend suite is not green in the current dirty workspace due unrelated pre-existing failures.
