# First Login Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a short, action-based creation guide exactly once after a phone number is registered, without showing it to existing users.

**Architecture:** The SMS verification response exposes its existing `isNewUser` result. The login shell stores a user-bound, one-reload marker in `sessionStorage`, consumes it after the authenticated session loads, and passes an ephemeral flag into the production workbench. A focused onboarding module owns guide state, copy, sample script, and markup; existing project and storyboard actions advance it only after real operations succeed.

**Tech Stack:** TypeScript HTTP entrypoint, browser ES modules, server-rendered template strings, CSS, Node test runner.

---

### Task 1: Exact new-registration eligibility

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify: `apps/web/app.js`
- Create: `apps/web/src/features/production-workbench/first-login-onboarding.js`
- Test: `apps/web/tests/first-login-onboarding.spec.mjs`

- [x] **Step 1: Write failing eligibility tests**

Add a browser-module test proving that only `{ isNewUser: true }` writes a marker, the marker is bound to the created user ID, consumption removes it, and a different or existing user never receives `firstLoginOnboarding: true`. Extend the dedicated phone-auth HTTP test to assert the first verification returns `isNewUser: true` and a second SMS verification of the same phone returns `false`.

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
node --test apps/web/tests/first-login-onboarding.spec.mjs
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts -- --test-name-pattern "full request"
```

Expected: the frontend test fails because the module does not exist; the backend assertion fails because `isNewUser` is not in the response.

- [x] **Step 3: Implement the minimal handoff**

Return the already-computed `verified.isNewUser` from `/api/auth/code/verify`. In `app.js`, call:

```js
markFirstLoginOnboarding(verifyPayload, sessionStorage);
```

after successful SMS verification, and wrap the authenticated session before `updateSession`:

```js
session = consumeFirstLoginOnboarding(session, sessionStorage);
```

The marker must be removed during consumption and must never be inferred from project count, account age, or empty state.

- [ ] **Step 4: Run tests and verify GREEN** (frontend passed; backend blocked by unavailable `DATABASE_URL` PostgreSQL)

Run the two commands from Step 2 and expect zero failures.

### Task 2: Minimal onboarding state and UI

**Files:**
- Modify: `apps/web/src/features/production-workbench/first-login-onboarding.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Modify: `apps/web/src/features/production-workbench/production-workbench.css`
- Test: `apps/web/tests/first-login-onboarding.spec.mjs`

- [x] **Step 1: Write failing state and markup tests**

Cover these states and exact actions:

```text
welcome -> create-project -> enter-project -> prepare-script
prepare-script -> generate-storyboard -> generating -> confirm-storyboard -> complete
```

Verify the welcome card contains “2分钟完成你的第一组分镜”, the guide can be dismissed, sample and own-script paths are available, and inactive state renders no markup.

- [x] **Step 2: Run test and verify RED**

```bash
node --test apps/web/tests/first-login-onboarding.spec.mjs
```

Expected: FAIL because guide state and markup exports are missing.

- [x] **Step 3: Implement minimal state, markup, and styling**

Use one centered welcome card, then one compact fixed guide card. Keep the product’s dark equipment-panel treatment, muted violet/cyan accent, visible keyboard focus, reduced-motion support, and no raster assets. The guide explains only project creation, entering a project, preparing a script, and creating storyboard records.

- [x] **Step 4: Run test and verify GREEN**

```bash
node --test apps/web/tests/first-login-onboarding.spec.mjs
```

Expected: PASS.

### Task 3: Advance from real workbench actions

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Test: `apps/web/tests/first-login-onboarding.spec.mjs`

- [x] **Step 1: Write failing action tests**

Use the exported workbench action test hook to prove that onboarding actions start/dismiss the guide, open the single-episode flow with either a short sample script or an empty script, and never activate when the session lacks `firstLoginOnboarding: true`.

- [x] **Step 2: Run test and verify RED**

```bash
node --test apps/web/tests/first-login-onboarding.spec.mjs
```

Expected: FAIL because action handling is not wired.

- [x] **Step 3: Implement action-driven progression**

Initialize the guide only in `updateSession` when the one-time session flag is true. Advance after project creation succeeds, project detail opens, AI storyboard generation starts, preview becomes ready, and chapter commit succeeds. Do not advance on validation or generation errors. Dismissal is final for that login session.

- [x] **Step 4: Run targeted tests and verify GREEN**

```bash
node --test apps/web/tests/first-login-onboarding.spec.mjs apps/web/tests/login-page.spec.ts apps/web/tests/workbench-nav.spec.mjs apps/web/tests/project-gallery-actions.spec.mjs apps/web/tests/project-detail-ai-live-output.spec.mjs
```

Expected: zero failures.

### Task 4: Verification and review

**Files:**
- Verify all files changed by Tasks 1–3.

- [x] **Step 1: Run the production web build check**

```bash
node scripts/build-production-web.mjs --check
```

Expected: exit code 0.

- [ ] **Step 2: Run the full relevant test set** (79 frontend tests passed; backend auth test requires PostgreSQL)

Run the targeted frontend tests plus the phone-auth test from Task 1. Expect zero failures.

- [x] **Step 3: Inspect scope**

Confirm the diff contains no generated image, no database migration, no project-count eligibility heuristic, and no changes to existing generation semantics.

- [x] **Step 4: Run `gstack-review`**

Review the full feature-branch diff, apply only safe mechanical fixes, rerun affected tests, and leave unrelated existing work untouched.
