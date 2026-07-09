# Official Asset Library Public Access Debug Report

- Date: 2026-07-09
- Symptom: The anonymous production workbench showed "asset library load failed" with `unauthenticated` on the official asset library tab.
- Root cause: `getLibraryAssets` was not allowed through the anonymous frontend API proxy, and the backend `/api/creator/library/assets` route/service resolved an authenticated actor before listing `scope=official` assets.
- Fix: Allow only official asset library reads through the anonymous frontend proxy, add a public backend GET branch for `scope=official`, and skip actor resolution for official reusable asset listing while keeping team/personal scopes authenticated.
- Regression tests:
  - `node --import tsx --test --test-name-pattern "lists reusable official assets|keeps team reusable assets" apps/backend/src/modules/project/tests/creator-application.service.spec.ts`
  - `node --import tsx --test --test-name-pattern "exposes reusable official asset library routes without project import" apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Status: DONE
