# DEBUG REPORT

- Symptom: Backend verification reported `creator-canvas-record.service.spec.ts` required `TEST_DATABASE_URL` or `DATABASE_URL`, and the run preferred the test database connection when available.
- Root cause: `apps/backend/src/modules/shared/db/test-db.ts` and one related DB test helper selected `TEST_DATABASE_URL` before `DATABASE_URL`.
- Fix: Test DB helpers now read `DATABASE_URL` directly and report `DATABASE_URL` when it is missing.
- Evidence: Static search no longer finds `TEST_DATABASE_URL || DATABASE_URL` or `TEST_DATABASE_URL or DATABASE_URL` in app/scripts code. `node --check` passes for the modified TypeScript files.
- Regression test: Not added; this is a connection-selection policy change in test helpers. Existing syntax checks were run without opening a database connection.
- Status: DONE
