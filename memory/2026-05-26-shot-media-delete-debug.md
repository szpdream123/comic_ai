# Shot Media Delete Debug - 2026-05-26

## Symptom

- Storyboard image delete called `DELETE /api/creator/shots/:shotId/media/:id?kind=image` and could return `404 {"error":"shot_media_not_found"}`.
- After the failed delete, the image stayed visible or returned after refresh.
- Storyboard video delete could fail to open the confirmation dialog when deletion was gated too early.

## Root Cause

- The web API wrapper converted `shot_media_not_found` into `{ missing: true }`, but `deleteStoryboardImage()` still used `runAction()`, which always refreshed the workbench after the local removal. Because the backend had not deleted a row, the refresh rehydrated the stale image.
- The backend media delete lookup only handled direct version/asset matches. If the frontend supplied a stale card id while the shot had a single current media version, the service returned `shot_media_not_found` instead of resolving the shot's only media version.
- The video delete click path previously mixed confirmation opening with protected-current-video logic, so the modal could be skipped before the confirm step.

## Fix

- `deleteStoryboardImage()` now handles linked-shot deletion directly. If the API reports `{ missing: true }`, it applies and persists local removal without refreshing stale backend data back into the UI.
- `deleteShotMediaVersionRecord()` now has a safe backend fallback: if direct lookup fails and the shot has exactly one media version for the requested kind, it resolves and deletes that version.
- The video delete click path opens the modal for existing video cards; the current-video protection remains at confirm/delete time.

## Evidence

- `node --check apps\web\src\features\production-workbench\index.js`
- `node --check apps\web\src\shared\creator-api.js`
- `node scripts/run-tests.mjs apps/web/tests/creator-api.spec.ts`
- `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

All passed on 2026-05-26.
