# First Login Onboarding Admin Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe visual admin editor for first-login onboarding copy and optional informational steps while keeping core workflow actions and first-login eligibility fixed in code.

**Architecture:** Store a normalized JSON document in the existing runtime configuration system under `creator.first_login_onboarding`. Fixed core-step copy is merged with code-owned defaults; an ordered `tips` array may reference only allowlisted insertion points and target keys. Expose dedicated admin/public endpoints and add a dedicated admin page with fixed core forms, a tip-step builder, and a live card preview.

**Tech Stack:** TypeScript backend, PostgreSQL runtime settings, vanilla JavaScript frontend/admin, Node test runner.

---

### Task 1: Define and validate the configuration contract

**Files:**
- Create: `apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.ts`
- Create: `apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.spec.ts`

- [ ] Write failing tests for default output, safe partial overrides, blank/oversized fallback, unknown-field removal, ordered tips, duplicate IDs, and allowlisted insertion/target keys.
- [ ] Run `node --import tsx --test apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.spec.ts` and confirm failure because the module does not exist.
- [ ] Implement the fixed schema, defaults, length limits, and normalizer.
- [ ] Re-run the focused test and confirm all cases pass.

### Task 2: Persist and expose the configuration

**Files:**
- Modify: `apps/backend/src/modules/admin-system-settings/admin-system-settings.service.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] Add failing HTTP/service assertions for the public default, `settings.read` admin access, `settings.write` updates, and normalized public output.
- [ ] Run the focused backend tests and confirm the new endpoint assertions fail with 404 or missing methods.
- [ ] Register the runtime config default and add `getFirstLoginOnboardingConfig` / `updateFirstLoginOnboardingConfig` service methods using the existing revision/audit writer.
- [ ] Add `GET /api/public/first-login-onboarding`, `GET /api/admin/first-login-onboarding`, and `PATCH /api/admin/first-login-onboarding` with the existing admin session and idempotency guards.
- [ ] Re-run focused backend tests and confirm they pass.

### Task 3: Load safe copy in the production workbench

**Files:**
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/first-login-onboarding.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/tests/first-login-onboarding.spec.mjs`
- Modify: `apps/web/tests/creator-api.spec.ts`

- [ ] Add failing tests for public API caching, default merging, HTML escaping, configured core-card rendering, and queued tip-step progression.
- [ ] Run the two focused web test files and confirm failures for missing APIs/config arguments.
- [ ] Add the cached public API reader, shared default-copy merge, and escaped rendering.
- [ ] Load the configuration once during workbench initialization; on failure retain defaults without blocking rendering.
- [ ] Re-run the focused web tests and confirm all pass.

### Task 4: Build the dedicated admin editor

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/index.test.mjs`

- [ ] Add failing static contract tests for the `onboardingGuide` route, fixed core fields, tip add/remove/reorder controls, allowlisted target dropdown, live preview, permissions, and dedicated API calls.
- [ ] Run `node --test apps/admin/index.test.mjs` and confirm the new contracts fail.
- [ ] Add the navigation entry, page loader, fixed-section editor, tip builder, character counters, live preview, reset-to-default action, and save action with reason and idempotency key.
- [ ] Keep styling aligned with the current light admin shell, using a compact editorial form/preview split and accessible labels/focus states.
- [ ] Re-run the admin test and confirm it passes.

### Task 5: Verify behavior and review the diff

**Files:**
- Verify all files changed by Tasks 1–4.

- [ ] Run focused backend, web, and admin tests.
- [ ] Run syntax/type checks used by the touched packages and `git diff --check`.
- [ ] Start from the project `.env`, edit a distinctive phrase in admin, and verify a fresh registration sees it while an existing user does not receive the guide.
- [ ] Run the requested pre-landing code review, fix actionable findings, and repeat focused verification.
- [ ] Leave all changes uncommitted and unpushed for user acceptance.
