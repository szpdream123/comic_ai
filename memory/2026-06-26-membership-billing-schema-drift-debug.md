# 2026-06-26 billing membership schema drift debug

## Symptom
Browser DevTools showed `/api/billing/packages`, `/api/membership/plans`, and `/api/membership/status` returning `{"error":"column o.credit_frozen_cached does not exist"}` after opening the membership/payment modal.

## Root Cause
The running backend/database had schema drift around the membership wallet-freeze migration. Code queried `organizations.credit_frozen_cached`, while older dev databases did not reliably receive the single required migration because repair code often reran broad migration chains. During fresh reproduction another concrete bug appeared: `recordSmsSend()` inserted 13 values into `sms_send_records` but the SQL had only 10 placeholders, causing `INSERT has more target columns than expressions` on login-code requests.

## Fix
- Repaired the live `.env` `DATABASE_URL` database so `organizations.credit_frozen_cached`, `credit_frozen_at`, and `credit_frozen_until` exist with constraints.
- Updated dev schema repair to apply targeted migration files and repair old `sms_send_records` audit columns.
- Fixed `sms_send_records` insert placeholders from `$1..$10` to `$1..$13`.
- Added a regression test asserting the SMS send insert has one placeholder per parameter.

## Evidence
- Verified `.env` database has `organizations.credit_frozen_cached` in `public` schema.
- Restarted `npm run dev:http-only:background:start` on port 4310.
- Password-login probe returned 200 for `/api/auth/session`, `/api/membership/plans`, `/api/membership/status`, and `/api/billing/packages` with no `credit_frozen_cached` error.
- `node scripts/run-tests.mjs apps/backend/src/modules/identity/tests/ip-sms-limit.spec.ts` passes.

## Status
DONE_WITH_CONCERNS: endpoint-level reproduction is fixed locally. The full `persistent-auth.spec.ts` run was stopped after timing out against the configured remote database; use targeted tests for this area unless that suite is made faster.
