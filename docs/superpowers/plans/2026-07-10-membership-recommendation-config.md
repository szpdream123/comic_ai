# Membership Recommendation Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators configure optional membership recommendation labels and one unique default recommended plan, with the frontend reading only that configuration.

**Architecture:** Reuse `membership_plans.display_metadata_json` with `recommendationLabel` and `isRecommended`, preserving the existing API and schema. The membership service clears any previous public default inside the same transaction and records revision history; the frontend separates badge text from default selection and never infers recommendation from tier or generated pricing IDs.

**Tech Stack:** Vanilla admin HTML/JavaScript, Node.js/TypeScript membership service, PostgreSQL JSONB, Node test runner.

---

### Task 1: Admin recommendation fields

**Files:**
- Modify: `apps/admin/index.test.mjs`
- Modify: `apps/admin/index.html`

- [ ] **Step 1: Write the failing admin test**

Add a test that extracts `openMembershipPlanDrawer` and `membershipPlanPayloadFromForm`, then asserts that the drawer contains `recommendationLabel` and `isRecommended`, that values are read from `displayMetadata`, blank labels delete only `recommendationLabel`, and an unchecked/default-internal form deletes only `isRecommended` while preserving other metadata.

```js
test("admin membership recommendation fields preserve unrelated display metadata", () => {
  assert.match(script, /function membershipRecommendationLabelText\(defaults\)/);
  assert.match(script, /function membershipIsRecommended\(defaults\)/);
  assert.match(script, /name="recommendationLabel"/);
  assert.match(script, /name="isRecommended"/);
  assert.match(script, /displayMetadata\.recommendationLabel = recommendationLabel/);
  assert.match(script, /delete displayMetadata\.recommendationLabel/);
  assert.match(script, /displayMetadata\.isRecommended = true/);
  assert.match(script, /delete displayMetadata\.isRecommended/);
});
```

- [ ] **Step 2: Run the admin test and verify RED**

Run: `npm run test:admin:ui`

Expected: the new recommendation-fields test fails because the helpers and form controls do not exist.

- [ ] **Step 3: Implement the minimal admin fields**

Add dedicated helpers and form controls, then update only the two owned metadata keys:

```js
function membershipRecommendationLabelText(defaults) {
  return String(defaults.displayMetadata?.recommendationLabel || "").trim();
}

function membershipIsRecommended(defaults) {
  return defaults.displayMetadata?.isRecommended === true;
}

const recommendationLabel = String(form.get("recommendationLabel") || "").trim();
if (recommendationLabel) displayMetadata.recommendationLabel = recommendationLabel;
else delete displayMetadata.recommendationLabel;
const isRecommended = form.get("isRecommended") === "on"
  && String(form.get("visibility") || "public") === "public";
if (isRecommended) displayMetadata.isRecommended = true;
else delete displayMetadata.isRecommended;
```

- [ ] **Step 4: Run the admin test and verify GREEN**

Run: `npm run test:admin:ui`

Expected: all admin UI tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat: configure membership recommendation display"
```

### Task 2: Enforce one public default in the membership service

**Files:**
- Modify: `apps/backend/src/modules/membership/tests/membership-plan.service.spec.ts`
- Modify: `apps/backend/src/modules/membership/membership-plan.service.ts`

- [ ] **Step 1: Write the failing service test**

Create two public plans with `displayMetadata.isRecommended=true`. After saving the second plan, assert that only the second plan retains the flag and that the first plan receives an automatic revision.

```ts
test("membership plan service keeps one public default recommendation", async () => {
  const first = await service.savePlan({
    ...validPlanInput("recommended_first"),
    displayMetadata: { recommendationLabel: "首选", isRecommended: true },
  });
  const second = await service.savePlan({
    ...validPlanInput("recommended_second"),
    displayMetadata: { recommendationLabel: "推荐", isRecommended: true },
  });
  const listed = await service.listPlans({ includeArchived: false, now });
  assert.equal(
    listed.data.plans.filter((plan) => plan.displayMetadata.isRecommended === true).length,
    1,
  );
  assert.equal(second.body.plan.displayMetadata.isRecommended, true);
  assert.equal(
    listed.data.plans.find((plan) => plan.id === first.body.plan.id)?.displayMetadata.isRecommended,
    undefined,
  );
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/membership/tests/membership-plan.service.spec.ts -- --test-name-pattern "keeps one public default recommendation"`

Expected: FAIL because both public plans retain `isRecommended=true`.

- [ ] **Step 3: Implement transactional uniqueness and revision history**

Inside the existing `savePlan` transaction, when the incoming public plan has `isRecommended === true`, update other public recommended rows with JSONB key removal and insert a revision for each returned row before saving the new plan.

```ts
const clearedRecommendedPlans = parsed.value.visibility === "public"
  && parsed.value.displayMetadata.isRecommended === true
  ? await clearOtherRecommendedPlans({
      db: deps.db,
      planId,
      actorAdminAccountId: parsed.value.actorAdminAccountId,
      reason: parsed.value.reason,
      idempotencyKey: parsed.value.idempotencyKey,
      now: parsed.value.now,
    })
  : [];
```

The update must use `display_metadata_json - 'isRecommended'`, restrict to `visibility = 'public'`, exclude `planId`, return full rows, and write deterministic revision IDs when an idempotency key exists. Do not change save input types, API responses, or the main plan revision flow.

- [ ] **Step 4: Run the service test and verify GREEN**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/membership/tests/membership-plan.service.spec.ts`

Expected: all membership plan service tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/membership/membership-plan.service.ts apps/backend/src/modules/membership/tests/membership-plan.service.spec.ts
git commit -m "feat: keep one recommended membership plan"
```

### Task 3: Read recommendation configuration on the frontend

**Files:**
- Modify: `apps/web/tests/membership-pricing-modal.spec.ts`
- Modify: `apps/web/src/features/library-team/pricing-modal.js`

- [ ] **Step 1: Write failing frontend tests**

Add focused tests for:

1. Two professional monthly plans have distinct backend IDs, but only the plan with `isRecommended=true` is `is-featured` and `is-selected`.
2. `recommendationLabel` is rendered verbatim after HTML escaping; a blank label creates no visible badge.
3. Without `isRecommended`, no backend plan is default selected or featured.
4. A pending payment plan remains selected even when another plan is the configured recommendation.

```ts
assert.equal((html.match(/library-team-plan-card is-featured/g) || []).length, 1);
assert.equal((html.match(/library-team-plan-card is-featured is-selected/g) || []).length, 1);
assert.match(html, />管理员推荐<\/span>/);
assert.doesNotMatch(html, />推荐<\/span>/);
```

- [ ] **Step 2: Run the pricing tests and verify RED**

Run: `node --test apps/web/tests/membership-pricing-modal.spec.ts`

Expected: the new tests fail because recommendation and selection are still derived from `plan.id === "pro"`.

- [ ] **Step 3: Implement backend-driven recommendation rendering**

Map the two metadata fields and use the actual membership plan ID for comparison:

```js
const recommendedPlan = plans.find((plan) => plan.membershipPlanId && plan.isRecommended) ?? null;
const selectedPlan = plans.find((plan) =>
  plan.membershipPlanId === membershipPaymentState?.pendingMembershipPlanId
) ?? recommendedPlan;

const featured = Boolean(
  recommendedPlan?.membershipPlanId
  && plan.membershipPlanId === recommendedPlan.membershipPlanId
);
const selected = (plan.membershipPlanId ?? plan.id)
  === (selectedPlan?.membershipPlanId ?? selectedPlan?.id);
```

Render the badge from `plan.recommendationLabel`; do not fall back to the literal “推荐”. Keep pending-payment selection precedence and the enterprise card unchanged.

- [ ] **Step 4: Run the pricing tests and verify GREEN**

Run: `node --test apps/web/tests/membership-pricing-modal.spec.ts`

Expected: all pricing modal tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/library-team/pricing-modal.js apps/web/tests/membership-pricing-modal.spec.ts
git commit -m "fix: read membership recommendation config"
```

### Task 4: Final verification and review

**Files:**
- Review: all files changed by Tasks 1-3

- [ ] **Step 1: Run focused regression suites**

```bash
npm run test:admin:ui
node scripts/run-tests.mjs apps/backend/src/modules/membership/tests/membership-plan.service.spec.ts
node --test apps/web/tests/membership-pricing-modal.spec.ts
```

Expected: all commands exit 0 with zero failures.

- [ ] **Step 2: Run diff safety checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only intentional files before the final commit.

- [ ] **Step 3: Run pre-landing code review**

Use `gstack-review` against `origin/main`, paying special attention to JSONB updates, idempotency, revision history, frontend duplicate IDs, and preservation of unrelated metadata.

