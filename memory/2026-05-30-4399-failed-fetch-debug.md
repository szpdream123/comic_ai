# 2026-05-30 4399 Failed to fetch Debug

## Symptom

When the project was started on `http://127.0.0.1:4399/`, the app showed:

- `工作台加载失败`
- `Failed to fetch`

## Root Cause

`apps/web/src/shared/creator-api.js` treated only `4310-4319` as local backend ports. On `4399`, `resolveApiUrl("/api/...")` misclassified the page as a separate frontend origin and rewrote backend-owned paths to `http://127.0.0.1:4310/...`.

If port `4310` was not running or did not match the current session, browser API calls failed with `Failed to fetch`.

## Fix

Updated `resolveApiUrl()` to also treat `4399` as a same-origin local dev backend port:

```js
const localBackendPort = /^(?:431\d|4399)$/.test(window.location.port ?? "");
```

Added a regression test covering `http://127.0.0.1:4399`.

## Evidence

- `npm test -- apps/web/tests/creator-api.spec.ts` passed: `23/23`.
- `http://127.0.0.1:4399/src/shared/creator-api.js` serves the updated `4399` rule.
- Browser verification on `http://127.0.0.1:4399/app.html` no longer shows `工作台加载失败` or `Failed to fetch`.
- Browser now shows normal unauthenticated login state when no session cookie is present.

## Status

DONE
