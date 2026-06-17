# Workbench clicks unresponsive after restart

Date: 2026-06-17

## Symptom

After restart and login, the home screen rendered, but clicking the left rail menu or the `创建项目` button appeared to do nothing.

## Root Cause Hypothesis

Two click-blocking risks existed in the logged-in home surface:

1. `.hero-overlay` was a full-screen absolutely positioned visual layer over the home hero without an explicit `pointer-events: none`. Even with lower stacking than `.hero-content`, this kind of visual-only layer can intercept clicks if layout/staking changes.
2. `handleProductionWorkbenchAction()` ignored most actions while `workbench.ui.busy` was true. Core navigation actions (`set-nav-tab`, `open-create-modal`) were not allowed during busy state, so any stuck background operation could make the app look frozen.

## Fix

- Set `.hero-overlay { pointer-events: none; }` so the decorative overlay cannot capture pointer events.
- Added `set-nav-tab` and `open-create-modal` to `allowWhileBusy` so primary navigation remains available even if background work is busy.
- Added a regression test that sets `workbench.ui.busy = true` and verifies the project tab and create modal still respond.

## Evidence

Verification commands passed:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --import tsx --test apps/web/tests/project-gallery-actions.spec.mjs`
- `node --import tsx --test apps/web/tests/canvas-workflow.spec.mjs`

Also verified the dev server at `http://127.0.0.1:4310` is serving the updated JS and CSS.

## Status

DONE_WITH_CONCERNS: Fixed and covered with unit tests. Full authenticated browser reproduction was not available in the automated browser session because it opened without the user's login cookies.

## Follow-up: Hash changed but page stayed on home

Additional symptom: clicking a rail item changed the URL to `app.html#script`, but the UI remained on the home hero.

Root cause: `initProductionWorkbench()` read `window.location.hash` during startup and actions updated `window.location.hash`, but there was no `hashchange` listener to re-sync UI state when the browser route changed independently of the action handler.

Fix:

- Added a `window.hashchange` listener that calls `syncWorkbenchHashRoute()`.
- `syncWorkbenchHashRoute()` applies the route state, renders immediately, and schedules the matching lazy surface load.
- Reused `scheduleLazySurfaceLoad()` from `set-nav-tab` to avoid duplicate route-specific loading code.
- Added a regression test for `#home` to `#script` route sync.

Additional verification:

- `node --check apps/web/src/features/production-workbench/index.js`
- `node --import tsx --test apps/web/tests/project-gallery-actions.spec.mjs`
- Confirmed the dev server serves JS containing `hashchange`, `syncWorkbenchHashRoute`, and `scheduleLazySurfaceLoad`.

## Follow-up: `#script` still showed home

Additional symptom: direct load of `http://127.0.0.1:4310/app.html#script` still showed the home hero.

Root cause: non-project routes can leave `workbench.state` as `null` during startup. Several renderers assumed `state` was always an object:

- `getProgress(state)` read `state.project`.
- `renderProjectDetail()` passed nullable `state` through to top-level modal/render logic.
- `renderScriptManagementPage()` read `state.projectDetail`.

Those render errors caused the recoverable render path to hide the intended route. The earlier fallback also forced `activeNavTab: "home"`, making the failure look like routing ignored `#script`.

Fix:

- Normalized nullable state to `{}` in `renderProjectDetail()`, `getProgress()`, and `renderScriptManagementPage()`.
- Updated the recoverable shell to preserve the current route instead of forcing home.
- Bumped app module cache keys from `12` to `13`.
- Added a startup regression test proving initial `#script` renders the script surface and does not show `home-hero`.

Additional verification:

- `node --check apps/web/src/features/production-workbench/project-detail.js`
- `node --check apps/web/src/features/production-workbench/script-page.js`
- `node --import tsx --test apps/web/tests/project-gallery-actions.spec.mjs`
- `node --import tsx --test apps/web/tests/canvas-workflow.spec.mjs`
- Confirmed the dev server serves the null-safe renderers.
