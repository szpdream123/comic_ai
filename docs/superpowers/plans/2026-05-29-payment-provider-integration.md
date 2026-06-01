# Payment Provider Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first provider-extensible payment slice so the platform can create `paylab` payment intents through a replaceable provider adapter while preserving the existing order, provider event, outbox, and credit-ledger boundaries.

**Architecture:** `Commerce/Payment` keeps owning billing orders, payment intents, callback facts, risk, and `payment.succeeded` outbox. Provider-specific behavior moves behind `PaymentProviderAdapter`; local fallback adapters stay deterministic, and `PayLabAdapter` is available from runtime config without changing the platform domain model.

**Tech Stack:** Node.js, TypeScript via `tsx`, `node:test`, PGlite foundation migration, existing `CommercePaymentService`.

---

## File Structure

- Create `apps/backend/src/modules/commerce-payment/payment-provider-adapter.ts`: provider types, pay action types, adapter/registry contracts, deterministic local adapters, and a PayLab adapter shell for create/query/callback normalization.
- Modify `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`: accept `paylab`, prepare a platform intent in `created`, call the provider outside the DB transaction, complete the intent as `submitted` or `unknown`, store safe provider metadata, and replay from stored intent rows.
- Modify `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`: cover PayLab success, idempotent replay, ambiguous provider creation, provider rejection recovery, and PayLab callback compatibility.
- Modify `apps/backend/src/entrypoints/phone-auth-dev-server.ts`: wire runtime provider registry and expose `/api/payment-provider-callbacks/:provider`.
- Modify `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`: cover the provider callback HTTP boundary.
- Modify `apps/backend/src/modules/shared/db/dev-db.ts`: repair existing local provider CHECK constraints so old dev databases accept `paylab`.
- Modify `apps/backend/src/modules/shared/db/tests/dev-db.spec.ts`: cover local constraint repair.
- Modify `packages/db/migrations/0001_foundation.sql`: allow `paylab` in payment intent, provider event, and reconciliation provider constraints.
- Modify `packages/contracts/api/billing.commands.ts`: expose `paylab|wechat_pay|alipay` in the payment-intent command contract.

## Task 1: Add Provider Adapter Contract

**Files:**
- Create: `apps/backend/src/modules/commerce-payment/payment-provider-adapter.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`

- [x] **Step 1: Write failing tests for PayLab adapter creation and replay**

Add tests proving `provider: "paylab"` can be resolved through a registry, receives a deterministic `providerIdempotencyKey`, stores provider-safe metadata, and does not call the adapter on idempotent replay.

- [x] **Step 2: Verify RED**

Run:

```bash
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts
```

Expected failure: missing adapter module or invalid provider/schema support.

- [x] **Step 3: Implement the adapter module**

Create the provider contract with `PaymentProvider`, `ProviderPayAction`, `CreateProviderPaymentIntentInput`, `CreateProviderPaymentIntentResult`, `PaymentProviderAdapter`, `PaymentProviderRegistry`, `createStaticPaymentProviderRegistry`, `createDefaultPaymentProviderRegistry`, `createLocalPaymentProviderAdapter`, and `createPayLabAdapter`.

## Task 2: Refactor Intent Submission

**Files:**
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`

- [x] **Step 1: Split platform intent preparation from provider submission**

Replace the old in-transaction mock submission with:

1. `preparePaymentIntentSubmission`: authenticates, creates/reuses idempotency record, inserts a `created` platform intent, commits.
2. `PaymentProviderAdapter.createPaymentIntent`: called outside the DB transaction.
3. `completePaymentIntentSubmission`: updates platform intent to `submitted` or `unknown`, stores provider metadata/pay action, finalizes idempotency/audit.

- [x] **Step 2: Preserve replay and unknown-state behavior**

Ensure replays reconstruct `payAction` from `provider_safe_metadata_json`; provider ambiguous failures produce `payment_intents.status = 'unknown'` with a `manual_confirm` pay action.

## Task 3: Extend Schema And Contracts

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Modify: `packages/contracts/api/billing.commands.ts`

- [x] **Step 1: Add `paylab` to provider constraints**

Update provider checks to:

```sql
provider text NOT NULL CHECK (provider IN ('paylab', 'wechat_pay', 'alipay'))
```

and reconciliation runs to include `'paylab'` plus `'all'`.

- [x] **Step 2: Update API contract text**

Update the payment intent request schema to:

```ts
requestSchema: { orderId: "uuid", provider: "paylab|wechat_pay|alipay", productMode: "string" }
```

## Task 4: Runtime Wiring And Local Schema Repair

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Test: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify: `apps/backend/src/modules/shared/db/dev-db.ts`
- Test: `apps/backend/src/modules/shared/db/tests/dev-db.spec.ts`

- [x] **Step 1: Wire provider registry into the dev server**

Use local deterministic adapters by default. When `PAYLAB_BASE_URL` is configured, use `PayLabAdapter` for `paylab` and keep WeChat/Alipay on local fallback adapters.

- [x] **Step 2: Add provider callback HTTP boundary**

Expose `POST /api/payment-provider-callbacks/:provider`, pass raw body and headers to `processProviderCallback`, and reject unknown providers before domain processing.

- [x] **Step 3: Repair old local CHECK constraints**

On `createDevDb`, rebuild provider constraints for `payment_intents`, `payment_provider_events`, and `payment_reconciliation_runs` so persistent local DBs created before `paylab` can keep working.

## Task 5: Verify

**Files:**
- Verify: all changed files

- [x] **Step 1: Run commerce payment tests**

```bash
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts
```

Expected: PASS.

- [x] **Step 2: Run schema tests**

```bash
npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts
```

Expected: PASS.

- [x] **Step 3: Run affected integration tests**

```bash
npm test -- apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts apps/backend/src/modules/credit-billing/tests/payment-succeeded-credit-consumer.spec.ts apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts apps/backend/src/modules/shared/db/tests/dev-db.spec.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
```

Expected: PASS.

- [x] **Step 4: Run diff hygiene**

```bash
git diff --check
```

Expected: no whitespace errors.

## Task 6: Add Service-Level Provider Query Reconciliation

**Files:**
- Modify: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Modify: `apps/backend/src/modules/commerce-payment/payment-provider-adapter.ts`
- Test: `apps/backend/src/modules/commerce-payment/tests/commerce-payment.service.spec.ts`

- [x] **Step 1: Write failing tests for missed webhook reconciliation**

Add tests proving a PayLab `queryPaymentStatus` result can recover a provider-paid intent when the webhook is missing, records reconciliation run/item evidence, creates a provider fact with `signature_status = 'unverified'`, emits only one `payment.succeeded` outbox event, and stays idempotent.

- [x] **Step 2: Write failing test for provider-query amount mismatch**

Add a test proving a provider-reported success with mismatched amount stays in manual review, creates `amount_mismatch` risk, and does not mark the order paid or grant credits.

- [x] **Step 3: Write failing test for already-paid reconciliation**

Add a test proving reconciliation after a matching success webhook resolves without creating a duplicate provider event, duplicate risk, or second outbox event.

- [x] **Step 4: Implement reconciliation entrypoint**

Add `reconcilePaymentIntent` to `CommercePaymentService`. It queries the adapter outside platform mutation, creates `payment_reconciliation_runs` and `payment_reconciliation_items`, and only converts actionable provider status into a platform provider fact after amount/currency/trade validation.

- [x] **Step 5: Extend normalized provider query facts**

Allow `NormalizedPaymentStatus` to carry `providerTradeId`, `amountMinor`, and `currency`; map those fields in the PayLab adapter query response.

## Self-Review

- Spec coverage: This slice implements the adapter seam, `paylab` provider value, two-phase provider submission, idempotent replay, provider `unknown` recovery, adapter-normalized callback processing, HTTP callback boundary, schema constraints, local DB constraint repair, and runtime registry wiring.
- Spec coverage continued: The second slice implements service-level provider query reconciliation for missed callbacks, amount mismatch protection, and already-paid idempotency.
- Explicit non-scope: Real PayLab admission-gate validation against a live PayLab instance, scheduled/ops-triggered reconciliation runner, refunds, subscriptions, revenue sharing, and auto-renewal remain later slices.
- Type consistency: Provider names are `paylab`, `wechat_pay`, and `alipay`; `payAction` and safe provider IDs live in `provider_safe_metadata_json`; credit granting still only happens through `payment.succeeded` outbox consumption.
