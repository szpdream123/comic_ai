# Membership Display and Drag Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the admin-facing experience tier to 基础版, make membership card notes admin-configurable, and let operators drag public membership and direct-recharge packages into the order rendered by the frontend.

**Architecture:** Keep the stable `experience` value and the existing persistence model. Store membership notes and ordering in `displayMetadata`, reuse direct-recharge `sortOrder`, and persist drag results through the existing save endpoints. The public pricing modal keeps the backend order and suppresses hard-coded membership-plan note fallbacks.

**Tech Stack:** Static admin HTML/CSS/JavaScript, Node test runner, frontend JavaScript pricing renderer, existing admin REST endpoints.

---

### Task 1: Admin tier label and configurable membership note

**Files:**
- Modify: `apps/admin/index.test.mjs`
- Modify: `apps/admin/index.html`

- [ ] **Step 1: Write failing admin tests**

Assert that `membershipTierLabel("experience")` and the tier option render “基础版”, that the drawer contains `name="displayNote"`, and that `membershipPlanPayloadFromForm` writes the trimmed value to `displayMetadata.note` or deletes the key when empty.

- [ ] **Step 2: Verify the tests fail**

Run: `npm run test:admin:ui`

Expected: FAIL because the label is still “体验版” and the dedicated note field/payload mapping are absent.

- [ ] **Step 3: Implement the minimal admin changes**

Add a `membershipDisplayNoteText(defaults)` reader, render:

```html
<label class="field"><span>前端展示说明</span><input name="displayNote" ... /></label>
```

Then preserve all advanced metadata while setting or deleting only `displayMetadata.note`:

```js
const displayNote = String(form.get("displayNote") || "").trim();
if (displayNote) displayMetadata.note = displayNote;
else delete displayMetadata.note;
```

Change only the admin-facing `experience` labels to “基础版”; keep the submitted value `experience`.

- [ ] **Step 4: Verify admin tests pass**

Run: `npm run test:admin:ui`

Expected: PASS.

- [ ] **Step 5: Commit the admin display change**

```powershell
git add -- apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat: configure membership plan display copy"
```

### Task 2: Frontend membership note uses backend configuration only

**Files:**
- Modify: `apps/web/tests/membership-pricing-modal.spec.ts`
- Modify: `apps/web/src/features/library-team/pricing-modal.js`

- [ ] **Step 1: Write failing pricing tests**

Render one backend membership plan without `displayMetadata.note` and assert the legacy “适合短期体验专业权益和会员积分。” text is absent and the note paragraph is omitted. Keep the existing configured-note assertion.

- [ ] **Step 2: Verify the focused test fails**

Run: `node --test apps/web/tests/membership-pricing-modal.spec.ts`

Expected: FAIL because `renderPricingPlan` still calls `planNote(plan.id)` for backend plans.

- [ ] **Step 3: Implement backend-plan note rendering**

Resolve the note before rendering:

```js
const note = plan.membershipPlanId ? plan.note : (plan.note || planNote(plan.id));
```

Render `.library-team-plan-note` only when `note` is non-empty. Static enterprise/direct-recharge fallbacks remain unchanged.

- [ ] **Step 4: Verify pricing tests pass**

Run: `node --test apps/web/tests/membership-pricing-modal.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the frontend note change**

```powershell
git add -- apps/web/src/features/library-team/pricing-modal.js apps/web/tests/membership-pricing-modal.spec.ts
git commit -m "fix: render configured membership plan notes"
```

### Task 3: Drag ordering in public membership and direct-recharge tables

**Files:**
- Modify: `apps/admin/index.test.mjs`
- Modify: `apps/admin/index.html`

- [ ] **Step 1: Write failing drag-order tests**

Assert that only public membership and direct-recharge rows have a drag handle and stable `data-reorder-id`, that public membership sorting reads `displayMetadata.sortOrder`, and that drop persistence rewrites visible rows to `10, 20, 30...` through the existing endpoints while preserving each item’s other fields.

- [ ] **Step 2: Verify the admin tests fail**

Run: `npm run test:admin:ui`

Expected: FAIL because no drag markup, handlers, or membership sort-order reader exist.

- [ ] **Step 3: Add restrained drag UI**

Add a compact grip button with `cursor: grab`, a dragging row state, and a drop-position indicator. Bind HTML drag events to public membership and direct-recharge table bodies; internal membership rows stay unchanged.

- [ ] **Step 4: Persist ordered membership plans**

Build save payloads from the existing plan objects, preserve all business fields, and update only:

```js
displayMetadata: { ...plan.displayMetadata, sortOrder: (index + 1) * 10 }
```

POST changed plans sequentially to `/api/admin/membership/plans` with unique ASCII-safe idempotency keys, then reload membership plans. On failure, reload and show an error toast.

- [ ] **Step 5: Persist ordered direct-recharge packages**

Build save payloads from existing package objects and update only:

```js
sortOrder: (index + 1) * 10
```

POST changed packages sequentially to `/api/admin/direct-recharge/packages`, then reload. On failure, reload and show an error toast.

- [ ] **Step 6: Verify admin tests pass**

Run: `npm run test:admin:ui`

Expected: PASS.

- [ ] **Step 7: Commit drag ordering**

```powershell
git add -- apps/admin/index.html apps/admin/index.test.mjs
git commit -m "feat: drag membership packages into display order"
```

### Task 4: Lock frontend ordering and complete review

**Files:**
- Modify: `apps/web/tests/membership-pricing-modal.spec.ts`
- Review: `apps/admin/index.html`
- Review: `apps/admin/index.test.mjs`
- Review: `apps/web/src/features/library-team/pricing-modal.js`
- Review: `apps/web/tests/membership-pricing-modal.spec.ts`

- [ ] **Step 1: Add order-preservation regression coverage**

Pass membership plans and direct-recharge packages in a deliberate non-price order and assert their names occur in that same order in rendered HTML. This characterizes the existing frontend contract and prevents later client-side resorting.

- [ ] **Step 2: Run focused verification**

Run:

```powershell
npm run test:admin:ui
node --test apps/web/tests/membership-pricing-modal.spec.ts
git diff --check
```

Expected: all tests pass and `git diff --check` exits 0.

- [ ] **Step 3: Run the requested pre-landing review**

Review the full diff for enum completeness, stale full-object writes during reorder, accidental internal-plan dragging, loss of advanced metadata, and frontend order drift. Fix verified findings and repeat focused verification.

- [ ] **Step 4: Commit order regression coverage**

```powershell
git add -- apps/web/tests/membership-pricing-modal.spec.ts
git commit -m "test: lock membership package display order"
```
