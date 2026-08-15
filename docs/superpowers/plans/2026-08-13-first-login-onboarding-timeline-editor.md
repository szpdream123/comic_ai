# First Login Onboarding Timeline Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the misleading appended-tip editor with a true onboarding timeline and expand safe insertion points and targets without changing first-login eligibility or core business actions.

**Architecture:** Keep the existing `tips` array and runtime config key for backward compatibility. Expand the backend-owned placement/target registry, make the frontend state machine run tips at every supported core boundary, mark registered targets with stable semantic attributes, and render admin tips inline by placement. Missing frontend targets are skipped locally so onboarding cannot block a new user.

**Tech Stack:** TypeScript backend, vanilla JavaScript admin/workbench, Node.js test runner, existing runtime config APIs.

## Global Constraints

- Preserve `creator.first_login_onboarding`, the existing config shape, first-login eligibility, team-member exclusion, core actions, and the 12-tip maximum.
- Do not expose arbitrary CSS selectors, URLs, scripts, or action names to admins.
- Do not change database schema, authentication, storyboard generation APIs, or generation behavior.
- Preserve existing uncommitted work in `apps/web/src/features/production-workbench/index.js`, `project-detail.js`, and `apps/web/tests/first-login-onboarding.spec.mjs`.
- Make only task-scoped changes and keep existing validation and fallback behavior.

---

### Task 1: Expand the backend placement and safe-target registry

**Files:**
- Modify: `apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.ts`
- Modify: `apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.spec.ts`

**Interfaces:**
- Consumes: `normalizeFirstLoginOnboardingConfig(value)` and the existing public/admin metadata response.
- Produces: six `FirstLoginOnboardingPlacement` values and a target catalog with `pageLabel`, optional `action`, and compatible `placements` arrays.

- [ ] **Step 1: Write failing registry tests**

Assert that placement keys include `before-prepare-script`, `before-confirm-storyboard`, and `before-complete`; assert at least four targets exist for `before-generate-storyboard`; assert preview and completion targets are registered; assert a valid new placement/target tip survives normalization while a mismatched pair is removed.

- [ ] **Step 2: Run the focused backend test and verify RED**

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.spec.ts
```

Expected: the new placement and target assertions fail.

- [ ] **Step 3: Add the placement and target metadata**

Extend target entries without changing existing keys:

```ts
{
  key: "script-input",
  label: "剧本输入区",
  pageLabel: "创建第一集",
  placements: ["before-generate-storyboard"],
}
```

Register all targets from the approved design. Keep normalization based on the backend-owned registry and placement-target compatibility.

- [ ] **Step 4: Run the focused backend test and verify GREEN**

Run the Step 2 command. Expected: all tests pass.

### Task 2: Generalize frontend tip sequencing and missing-target recovery

**Files:**
- Modify: `apps/web/src/features/production-workbench/first-login-onboarding.js`
- Modify: `apps/web/tests/first-login-onboarding.spec.mjs`

**Interfaces:**
- Consumes: normalized tips with the expanded placement/target registry.
- Produces: `advanceFirstLoginGuide`, `resolveFirstLoginGuideTargetKey`, and a new pure `skipUnavailableFirstLoginTips(state, availableTargetKeys)` helper.

- [ ] **Step 1: Write failing state-machine tests**

Cover:

```js
assert.equal(advanceFirstLoginGuide(generating, "generation-ready").step, "tip");
assert.equal(state.nextStep, "confirm-storyboard");
assert.equal(advanceFirstLoginGuide(confirming, "storyboard-committed").nextStep, "complete");
```

Also assert multiple tips at one new placement retain array order, old placements remain unchanged, and unavailable targets are skipped until a visible target or the core step is reached.

- [ ] **Step 2: Run focused web tests and verify RED**

```powershell
node scripts/run-tests.mjs apps/web/tests/first-login-onboarding.spec.mjs
```

Expected: new placement transitions and missing-target helper assertions fail.

- [ ] **Step 3: Extend the frontend allowlists and transition map**

Add the three placement mappings and safe target/action metadata. Reuse `enterFirstLoginCoreStep` for every transition. Implement missing-target skipping as a bounded pure loop over at most 12 tips; never mutate the input state.

- [ ] **Step 4: Run focused web tests and verify GREEN**

Run the Step 2 command. Expected: all onboarding tests pass.

### Task 3: Mark safe targets and apply recovery after render

**Files:**
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/tests/first-login-onboarding.spec.mjs`

**Interfaces:**
- Consumes: the target key returned by `resolveFirstLoginGuideTargetKey` and `skipUnavailableFirstLoginTips` from Task 2.
- Produces: stable `data-first-login-target="<key>"` markers and one post-render availability reconciliation path.

- [ ] **Step 1: Write failing markup and recovery tests**

Assert rendered project and episode flows expose registered semantic target keys, including script/model/skill/generate controls, preview surfaces/tables/commit action, and post-commit storyboard workbench targets. Assert the post-render reconciliation advances a missing target without repeatedly rendering.

- [ ] **Step 2: Run the focused markup tests and verify RED**

```powershell
node scripts/run-tests.mjs apps/web/tests/first-login-onboarding.spec.mjs
```

Expected: new target marker assertions fail.

- [ ] **Step 3: Add stable markers and a bounded reconciliation call**

Add target attributes only to existing elements; do not change their actions. After rendering, collect visible `[data-first-login-target]` keys and call the pure helper. Re-render only when the returned guide state differs.

- [ ] **Step 4: Run focused web tests and verify GREEN**

Run the Step 2 command. Expected: all onboarding tests pass.

### Task 4: Replace the appended tip list with an inline timeline editor

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/index.test.mjs`

**Interfaces:**
- Consumes: `store.meta.placements`, `store.meta.targets`, fixed `ONBOARDING_CORE_SECTIONS`, and the unchanged `tips` array.
- Produces: placement-aware `addFirstLoginTip(placement)`, inline tip groups, conditional target controls, and an execution-order summary.

- [ ] **Step 1: Write failing admin contract tests**

Assert the editor:

- renders `addFirstLoginTip(placement)` controls between fixed core sections;
- groups tips with `tips.filter((tip) => tip.placement === placement.key)`;
- shows a read-only target label for one target and a select for multiple targets;
- retains same-placement reordering and supports moving by changing placement;
- no longer renders one global appended `${tips.map(onboardingTipEditor)}` block.

- [ ] **Step 2: Run the admin test and verify RED**

```powershell
node scripts/run-tests.mjs apps/admin/index.test.mjs
```

Expected: timeline-specific assertions fail.

- [ ] **Step 3: Implement the timeline renderer**

Create small rendering helpers for a placement insertion row, its inline tips, the conditional target control, and the execution summary. Keep the existing core field editor and preview card. Change `addFirstLoginTip` to receive a placement and choose its first compatible target.

- [ ] **Step 4: Run the admin test and verify GREEN**

Run the Step 2 command. Expected: all admin tests pass.

### Task 5: Verify the integrated behavior

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: completed backend/admin/frontend changes.
- Produces: evidence that old and new configurations work without unrelated regressions.

- [ ] **Step 1: Run focused suites**

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/admin-system-settings/first-login-onboarding-config.spec.ts
node scripts/run-tests.mjs apps/web/tests/first-login-onboarding.spec.mjs
node scripts/run-tests.mjs apps/admin/index.test.mjs
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "first-login onboarding"
```

- [ ] **Step 2: Build and inspect only the intended diff**

```powershell
npm run build:production-runtime
git diff --check
git status --short
```

- [ ] **Step 3: Run a browser acceptance pass when the local app is available**

Verify an admin can add tips at both new post-generation boundaries, can select multiple generation/preview targets, sees tips inline in execution order, and a fresh account can complete the guide when a configured target is absent.

- [ ] **Step 4: Request independent code review and resolve actionable findings**

Review only the onboarding timeline diff. Re-run focused tests after any correction.
