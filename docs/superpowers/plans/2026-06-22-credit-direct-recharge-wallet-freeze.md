# Credit Direct Recharge Wallet Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fixed-tier credit direct recharge for active members and freeze/restore wallet credits around membership lapse.

**Architecture:** Reuse `credit_packages` and `billing_orders.product_type = credit_package` for direct recharge packages marked by `metadata_json.kind = "direct_recharge"`. Add wallet freeze read-model columns on `organizations`, mark frozen `credit_lots`, block reservation while the wallet is frozen, restore on renewed membership, and clear frozen credits after one year through ledgered expiry. Keep the existing professional-over-experience downgrade protection intact.

**Tech Stack:** Node test runner, TypeScript backend services, SQL migrations, plain JS frontend modal renderer.

---

### Task 1: Schema And Backend Wallet Rules

**Files:**
- Create: `packages/db/migrations/0044_credit_direct_recharge_wallet_freeze.sql`
- Modify: `apps/backend/src/modules/shared/db/dev-db.ts`
- Modify: `apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts`
- Modify: `apps/backend/src/modules/credit-billing/credit-ledger.service.ts`
- Modify: `apps/backend/src/modules/credit-billing/credit-lot.service.ts`
- Modify: `apps/backend/src/modules/membership/membership-maintenance.service.ts`
- Test: `apps/backend/src/modules/membership/tests/membership-maintenance.service.spec.ts`
- Test: `apps/backend/src/modules/credit-billing/tests/credit-ledger-persistence.spec.ts`

- [ ] Add failing tests for wallet freeze, reservation block, renewal restore, and one-year frozen credit expiry.
- [ ] Run the focused backend tests and verify they fail for missing schema/logic.
- [ ] Add the migration and dev-db migration detection.
- [ ] Implement freeze/restore/expire helpers and wire them into maintenance and membership activation.
- [ ] Run the focused backend tests and verify they pass.

### Task 2: Direct Recharge Order Guard

**Files:**
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`

- [ ] Add failing tests showing direct recharge packages require active membership while ordinary credit packages keep current behavior.
- [ ] Implement metadata-based direct recharge membership validation before creating billing orders.
- [ ] Run the commerce payment tests and verify they pass.

### Task 3: Pricing Modal Direct Recharge UI

**Files:**
- Modify: `apps/web/src/features/library-team/pricing-modal.js`
- Modify: `apps/web/src/features/library-team/library-team.css`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/membership-pricing-modal.spec.ts`
- Test: `apps/web/tests/membership-payment-flow.spec.ts`

- [ ] Add failing frontend tests for the subscription/direct-recharge switch, active-member recharge cards, non-member block, and credit-payment copy.
- [ ] Render direct recharge packages from `metadata.kind = "direct_recharge"` in the existing modal.
- [ ] Reuse the billing order/payment intent flow for direct recharge and keep membership payment copy separate.
- [ ] Run the focused web tests and verify they pass.

### Task 4: Verification

- [ ] Run all focused backend and frontend tests touched by this feature.
- [ ] Check `git diff --stat` and ensure no unrelated dirty files are included.
