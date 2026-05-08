# P0 Commerce and Payment Design

> Status: M0 frozen design baseline; provider field mapping pending verification
> Date: 2026-05-08
> Scope: P0-B minimal one-time credit package purchase with WeChat Pay and Alipay

This document records confirmed architecture decisions for login-adjacent commercial capability: one-time credit package purchase. It freezes the P0-B payment domain design, while exact WeChat Pay/Alipay account capabilities and field mappings remain implementation gates.

## 1. Confirmed Decisions

1. P0-B includes minimal self-service recharge.
2. P0-B supports both WeChat Pay and Alipay.
3. P0-B sells one-time credit packages only.
4. P0-B does not include subscription, auto-renewal, complex plan entitlement, or postpaid billing.
5. Payment is a separate `Commerce/Payment` module, not part of `Credit/Billing`.
6. Payment success is confirmed only by server-side provider callbacks or provider reconciliation, never by frontend redirect state.
7. Credit grants are created by the `Credit/Billing` module after consuming a durable payment success event.

## 2. First-Principles Boundary

Money, credits, and provider cost are different facts:

| Fact | Owner | Meaning |
| --- | --- | --- |
| Cash/payment fact | `Commerce/Payment` | Whether the platform received money, from which provider, for which order, with what settlement/refund status. |
| User-facing credit fact | `Credit/Billing` | How many credits an organization has, reserves, consumes, releases, or receives as an adjustment/grant. |
| Provider cost fact | `ModelGateway` + `Credit/Billing` | Whether an AI provider accepted work, produced output, charged cost, or created abnormal cost. |

The system must never infer one fact by mutating another directly. A paid order explains why a credit grant exists, but the credit ledger remains the accounting truth for user-facing balance.

## 3. Module Ownership

| Module | Owns | Does Not Own |
| --- | --- | --- |
| `Commerce/Payment` | Credit package catalog, orders, payment intents, provider callbacks, payment reconciliation, refund facts. | Credit balance, generation reservation, generation consumption, provider HTTP calls. |
| `Credit/Billing` | Credit grants, reservations, allocations, consumption, releases, adjustments, balance read models. | Payment provider callbacks, cash order state, payment channel signing. |
| `Admin/Ops` | Read-only and controlled operational views/actions across payment and credit records. | Direct mutation of ledgers without domain commands and audit records. |

## 4. Core Domain Model

| Entity | Module | Purpose |
| --- | --- | --- |
| `credit_packages` | `Commerce/Payment` | Sellable SKU, such as 1000 credits for CNY 99. |
| `orders` | `Commerce/Payment` | Business purchase intent for one organization and one credit package. |
| `payment_intents` | `Commerce/Payment` | One payment attempt for an order through WeChat Pay or Alipay. |
| `payment_provider_events` | `Commerce/Payment` | Raw and normalized provider callback records, including signature verification and processing result. |
| `payment_refunds` | `Commerce/Payment` | Refund facts. P0-B may support only provider callback/manual record first. |
| `credit_ledger_entries` | `Credit/Billing` | Append-only credit grant/reservation/consume/release/adjustment truth. |

## 5. Payment to Credit Flow

```text
User selects credit package
  -> API creates order
  -> API creates payment intent for WeChat Pay or Alipay
  -> Frontend renders provider payment payload or QR code
  -> Provider sends server-side callback
  -> Commerce verifies signature, amount, currency, provider trade ID, and order ID
  -> Commerce marks payment intent succeeded and order paid
  -> Commerce writes payment.succeeded to the transactional outbox
  -> Credit consumes payment.succeeded idempotently
  -> Credit writes credit_ledger_entries(entry_type = grant, source_type = payment_order, source_id = order_id)
  -> Balance read model updates from the ledger
```

Frontend success pages are only user experience hints. They do not grant credits.

## 6. State Machines

### 6.1 Order Status

```text
pending_payment
  -> paid
  -> closed
  -> expired

paid
  -> refund_pending
  -> partially_refunded
  -> refunded
```

Rules:

- `paid` requires verified provider callback or provider reconciliation.
- `paid` is not the same as `credits_granted`; credit grant is a separate ledger fact.
- `closed` and `expired` cannot transition to `paid` unless provider reconciliation proves provider payment actually succeeded before closure.
- Refund states do not physically delete or rewrite original payment and credit records.

### 6.2 Payment Intent Status

```text
created
  -> submitted
  -> succeeded
  -> failed
  -> closed
  -> expired
  -> unknown
```

Rules:

- `unknown` is required when the platform cannot safely prove success or failure.
- Unknown payment intents must be reconciled by provider query or manual review.
- A failed frontend redirect does not prove provider failure.

## 7. Required Invariants

1. A provider callback is processed at most once per provider event identity.
2. One order can produce at most one successful credit grant.
3. `credit_ledger_entries` must have a uniqueness rule for payment grants, such as `(organization_id, source_type, source_id, entry_type)` where `entry_type = 'grant'`.
4. Provider callback amount, currency, merchant order ID, provider trade ID, and payment status must match expected records before `paid`.
5. All payment state transitions and credit grants must be audit-visible.
6. Order, payment intent, provider event, outbox event, and credit grant must be linkable by immutable IDs.
7. Payment provider adapters normalize WeChat Pay and Alipay differences before crossing the module boundary.
8. A frontend redirect, mobile browser return, or client callback can never grant credits.

## 8. P0-B Minimum Capability

P0-B must include:

- Credit package catalog.
- Order creation.
- Payment intent creation for WeChat Pay and Alipay.
- Provider request payload generation.
- Server-side callback verification.
- Provider callback idempotency.
- Amount/currency/order matching.
- Paid order to credit grant through outbox/inbox.
- Repair job for paid order without credit grant.
- Order expiry/closure.
- Admin/Ops view linking order, payment intent, provider event, outbox event, and credit grant.

P0-B may defer:

- Subscription.
- Auto-renewal.
- Complex plan entitlement.
- Multi-step invoice management.
- Sophisticated partial refund automation.
- Postpaid billing.

## 9. Public API Contract

All authenticated commerce APIs are tenant-scoped. The organization comes from the resolved actor context, not from a trusted frontend field unless the actor can explicitly select among organizations they belong to.

### 9.1 Creator-Facing APIs

```text
GET  /billing/credit-packages
POST /billing/orders
GET  /billing/orders/:orderId
POST /billing/orders/:orderId/payment-intents
GET  /billing/payment-intents/:paymentIntentId
```

### 9.2 `GET /billing/credit-packages`

Returns active one-time credit packages available to the organization.

Response shape:

```json
{
  "packages": [
    {
      "id": "pkg_1000_cny_99",
      "displayName": "1000 credits",
      "credits": 1000,
      "amountMinor": 9900,
      "currency": "CNY",
      "status": "active"
    }
  ]
}
```

Rules:

- The response is a catalog view, not a source for price trust.
- Order creation must re-read the package server-side and snapshot price and credits.

### 9.3 `POST /billing/orders`

Creates a purchase order for one credit package.

Request:

```json
{
  "packageId": "pkg_1000_cny_99"
}
```

Headers:

```text
Idempotency-Key: <client-generated-uuid>
```

Response:

```json
{
  "orderId": "ord_...",
  "status": "pending_payment",
  "packageSnapshot": {
    "packageId": "pkg_1000_cny_99",
    "displayName": "1000 credits",
    "credits": 1000,
    "amountMinor": 9900,
    "currency": "CNY"
  },
  "expiresAt": "2026-05-08T12:30:00Z"
}
```

Rules:

- The order stores a package snapshot. Later package edits do not change existing orders.
- Idempotency scope is `(organization_id, operation_name = 'billing.create_order', idempotency_key)`.
- Same idempotency key with a different request hash returns `409 idempotency_conflict`.
- Order creation requires `billing:purchase` capability.

### 9.4 `POST /billing/orders/:orderId/payment-intents`

Creates or reuses a payment attempt for the order.

Request:

```json
{
  "provider": "wechat_pay",
  "providerMode": "native_qr"
}
```

Provider values:

```text
wechat_pay
alipay
```

Provider mode values:

```text
wechat_pay: native_qr, jsapi, h5
alipay: pc_page, mobile_page, qr_code
```

Confirmed P0-B product mode direction for desktop web:

- WeChat Pay: `native_qr`.
- Alipay: `pc_page` as the primary mode; `qr_code` as fallback if the provider/account/product contract makes QR pre-create more suitable.

Implementation must verify exact provider API names, request fields, signature rules, callback fields, and acknowledgement formats against official WeChat Pay and Alipay documentation before coding adapters. The architecture-level decision is the product mode direction, not a frozen provider SDK mapping.

Response:

```json
{
  "paymentIntentId": "pi_...",
  "orderId": "ord_...",
  "provider": "wechat_pay",
  "providerMode": "native_qr",
  "status": "submitted",
  "amountMinor": 9900,
  "currency": "CNY",
  "expiresAt": "2026-05-08T12:30:00Z",
  "payAction": {
    "type": "qr_code",
    "qrCodeUrl": "weixin://wxpay/bizpayurl?..."
  }
}
```

`payAction.type` values:

| Type | Meaning |
| --- | --- |
| `qr_code` | Frontend renders a QR code from provider payload. |
| `redirect` | Frontend redirects to provider-hosted payment page. |
| `form_post` | Frontend submits a provider-generated form. |
| `jsapi_payload` | Frontend invokes provider JS bridge. |

Rules:

- Creating a payment intent requires the order to be `pending_payment`.
- Payment intent amount and currency must equal the order snapshot.
- A submitted payment intent is immutable except state transition and provider result enrichment.
- Multiple attempts may exist for an order, but only one can reach `succeeded`.
- Reusing an active intent for the same `(order_id, provider, provider_mode)` is allowed to avoid generating multiple QR codes unnecessarily.

### 9.5 Query APIs

`GET /billing/orders/:orderId` returns:

- Order state.
- Payment intent summaries.
- Whether a credit grant ledger entry exists.
- Safe next actions for the frontend.

`GET /billing/payment-intents/:paymentIntentId` returns:

- Payment intent state.
- Provider and provider mode.
- Expiry.
- No provider secrets or raw callback payload.

These query APIs are for polling and user experience. They do not cause credit grants.

### 9.6 Admin/Ops APIs

```text
GET  /admin/payments/orders
GET  /admin/payments/orders/:orderId
GET  /admin/payments/provider-events
GET  /admin/payments/provider-events/:eventId
POST /admin/payments/payment-intents/:paymentIntentId/reconcile
POST /admin/payments/orders/:orderId/close
```

Rules:

- Admin/Ops actions must call domain commands and write audit events.
- Admin/Ops must not insert or update credit ledger rows directly.
- Reconciliation commands query the provider and then run the same normalized transition logic as callbacks.

## 10. Provider Callback Contract

Provider callbacks are public HTTP endpoints authenticated by provider signature, not by user session.

```text
POST /webhooks/payments/wechat-pay
POST /webhooks/payments/alipay
```

### 10.1 Callback Processing Pipeline

```text
Receive raw callback
  -> compute provider_event_dedup_key
  -> persist payment_provider_events(received)
  -> verify provider signature
  -> normalize provider payload
  -> validate merchant order id, provider trade id, amount, currency, status
  -> lock payment_intent and order
  -> apply state transition
  -> write payment.succeeded outbox event when order becomes paid
  -> mark provider event processed
  -> return provider-specific success acknowledgement
```

Rules:

- Raw provider payloads are never trusted before signature verification.
- Invalid callbacks may be stored as hash + failure metadata for security audit, but must not trigger payment or credit state changes.
- A duplicate provider callback that has already been safely processed should return provider-specific success acknowledgement to stop provider retries.
- The system acknowledges success only after the state transition and any required outbox event are durably committed.
- A callback that conflicts with existing payment facts enters `manual_review_required` or equivalent operational state; it must not grant credits automatically.

### 10.2 Normalized Callback Shape

Provider adapters normalize WeChat Pay and Alipay callbacks into this internal shape:

```typescript
type NormalizedPaymentCallback = {
  provider: "wechat_pay" | "alipay";
  providerEventDedupKey: string;
  merchantOrderNo: string;
  providerTradeId?: string;
  providerBuyerId?: string;
  eventType: "payment_succeeded" | "payment_failed" | "payment_closed" | "refund_succeeded" | "unknown";
  tradeStatus: string;
  amountMinor: number;
  currency: "CNY";
  paidAt?: string;
  rawPayloadHash: string;
};
```

Provider-specific field names must be implemented from official provider documentation at implementation time. The normalized contract is the stable internal boundary.

### 10.3 Callback Failure Matrix

| Case | System Behavior |
| --- | --- |
| Duplicate callback for same successful payment | Return provider success acknowledgement; do not create another grant. |
| Signature invalid | Record failure metadata; do not transition order or intent. |
| Amount mismatch | Mark provider event `rejected_amount_mismatch`; do not mark paid; alert Admin/Ops. |
| Currency mismatch | Reject event; alert Admin/Ops. |
| Unknown merchant order number | Store provider event as `unmatched`; schedule reconciliation/manual review. |
| Order expired but provider proves payment succeeded before expiry | Transition to paid through reconciliation-safe path. |
| Order closed/expired and payment appears after closure | Mark manual review; do not grant automatically. |
| Different successful provider trade ID for already paid order | Mark conflict; do not grant automatically. |
| Callback processed but credit grant failed later | Repair job consumes `payment.succeeded` or checks paid-without-grant and creates missing grant idempotently. |

## 11. Internal Events

Payment and credit communication uses the existing transactional Outbox/Inbox pattern.

### 11.1 Published Events

| Event | Publisher | Consumer | Purpose |
| --- | --- | --- | --- |
| `payment.order.created` | `Commerce/Payment` | Admin/Ops, Analytics future | Optional observability event. |
| `payment.intent.submitted` | `Commerce/Payment` | Admin/Ops, Analytics future | Track provider attempt creation. |
| `payment.succeeded` | `Commerce/Payment` | `Credit/Billing` | Create credit grant. |
| `payment.failed` | `Commerce/Payment` | Notification future | Inform user when needed. |
| `payment.expired` | `Commerce/Payment` | Notification future | Inform user when needed. |
| `payment.refund.succeeded` | `Commerce/Payment` | `Credit/Billing`, Admin/Ops | Future refund credit adjustment. |
| `credit.grant.created` | `Credit/Billing` | `Commerce/Payment`, Notification future | Mark/read-model that paid order has been credited. |

P0-B critical path events:

1. `payment.succeeded`
2. `credit.grant.created`

### 11.2 `payment.succeeded` Payload

```json
{
  "eventId": "evt_...",
  "eventType": "payment.succeeded",
  "occurredAt": "2026-05-08T12:00:00Z",
  "organizationId": "org_...",
  "actorUserId": "usr_...",
  "orderId": "ord_...",
  "paymentIntentId": "pi_...",
  "provider": "wechat_pay",
  "providerTradeId": "420000...",
  "amountMinor": 9900,
  "currency": "CNY",
  "packageId": "pkg_1000_cny_99",
  "credits": 1000
}
```

Credit consumer rule:

```text
On payment.succeeded:
  begin transaction
    insert inbox_events(consumer_name, outbox_event_id)
    if already consumed: commit no-op
    lock order or grant source if needed
    insert credit_ledger_entries(
      entry_type = grant,
      available_delta = credits,
      reserved_delta = 0,
      consumed_delta = 0,
      dedup_key = payment_order:{order_id}:grant,
      source_type = payment_order,
      source_id = order_id,
      source_event_id = event_id
    )
    update balance read model
    write credit.grant.created outbox event
  commit
```

### 11.3 Exactly-Once Outcome

The system uses at-least-once event delivery with idempotent consumers:

- `inbox_events` unique `(consumer_name, outbox_event_id)` prevents duplicate event handling.
- `credit_ledger_entries` partial unique payment grant constraint prevents duplicate credit issuance even if consumer code is retried outside the inbox path.
- `payment_provider_events` unique provider dedup key prevents duplicate callback side effects.

## 12. Database Constraints

### 12.1 `credit_packages`

Required columns:

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `code` | Stable human-readable SKU code. |
| `display_name` | User-visible name. |
| `credits` | Positive integer. |
| `amount_minor` | Positive integer in minor currency unit. |
| `currency` | `CNY` for P0-B. |
| `status` | `active`, `inactive`, `archived`. |
| `valid_from`, `valid_until` | Nullable availability window. |

Constraints:

- Unique `code`.
- `credits > 0`.
- `amount_minor > 0`.
- Package changes that affect price or credits should create a new package/version, not mutate historical order meaning.

### 12.2 `orders`

Required columns:

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `created_by_user_id` | Required. |
| `order_no` | Public merchant order number sent to providers. |
| `package_id` | Required. |
| `package_snapshot_json` | Credits, price, currency, display name at order time. |
| `credits` | Positive integer copied from package snapshot. |
| `amount_minor` | Positive integer copied from package snapshot. |
| `currency` | `CNY`. |
| `status` | Order state. |
| `idempotency_record_id` | Required for API-created orders. References `idempotency_records.id` for `billing.create_order`. |
| `idempotency_key` | Denormalized debug/reference key copied from `idempotency_records`; not the replay guard. |
| `expires_at` | Required. |
| `paid_at` | Nullable. |
| `successful_payment_intent_id` | Nullable read model pointer. |
| `credit_grant_ledger_entry_id` | Nullable read model pointer; ledger remains the truth. |

Constraints:

- Unique `order_no`.
- Unique `(organization_id, idempotency_record_id)` where `idempotency_record_id is not null`.
- `amount_minor > 0`.
- `credits > 0`.
- Partial unique one successful payment intent per order, enforced on `payment_intents`.
- No physical delete after provider interaction.

### 12.3 `payment_intents`

Required columns:

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `order_id` | Required. |
| `provider` | `wechat_pay`, `alipay`. |
| `provider_mode` | Provider-specific product mode. |
| `status` | Payment intent state. |
| `amount_minor` | Copied from order. |
| `currency` | Copied from order. |
| `merchant_order_no` | Merchant order number sent to provider. |
| `provider_trade_id` | Nullable until provider returns it. |
| `provider_payload_hash` | Hash of provider request payload for audit. |
| `submitted_at` | Nullable. |
| `succeeded_at` | Nullable. |
| `expires_at` | Required. |
| `idempotency_record_id` | Nullable; required if payment intent creation is exposed as an idempotent API command. |
| `idempotency_key` | Denormalized debug/reference key when `idempotency_record_id` is present. |

Constraints:

- Unique `(provider, merchant_order_no)`.
- Unique `(provider, provider_trade_id)` where `provider_trade_id is not null`.
- Partial unique `(organization_id, order_id)` where `status = 'succeeded'`.
- Status transitions happen through domain commands only.

### 12.4 `payment_provider_events`

Required columns:

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `provider` | `wechat_pay`, `alipay`. |
| `provider_event_dedup_key` | Provider notification ID if available; otherwise normalized deterministic dedup key. |
| `merchant_order_no` | Nullable until normalized. |
| `provider_trade_id` | Nullable. |
| `event_type` | Normalized event type. |
| `signature_status` | `unverified`, `verified`, `invalid`. |
| `processing_status` | `received`, `processed`, `duplicate`, `rejected`, `unmatched`, `manual_review_required`. |
| `raw_payload_hash` | Required. |
| `normalized_payload_json` | Nullable until verified/normalized. |
| `failure_code` | Nullable. |
| `received_at` | Required. |
| `processed_at` | Nullable. |

Constraints:

- Unique `(provider, provider_event_dedup_key)`.
- Raw sensitive payload retention must follow security policy; logs should store hashes and safe metadata.
- Provider events are append-only except processing metadata.

### 12.5 Credit Ledger Extension

For payment grants, `credit_ledger_entries` needs source linkage:

| Column | Notes |
| --- | --- |
| `source_type` | `payment_order`, `admin_grant`, `promotion`, `migration`, etc. |
| `source_id` | ID in source module. |
| `source_event_id` | Outbox event that caused the grant, nullable for manual/admin grants. |

Required constraint:

```sql
UNIQUE (organization_id, source_type, source_id, entry_type)
WHERE entry_type = 'grant';
```

This is the final backstop against duplicate credit issuance for a paid order.

## 13. Reconciliation and Repair

P0-B requires two repair loops:

### 13.1 Payment Provider Reconciliation

Scans:

- `payment_intents.status in ('submitted', 'unknown')` and `expires_at` passed.
- Provider events in `unmatched` or `manual_review_required`.
- Orders in `pending_payment` near expiry.

Actions:

- Query WeChat Pay or Alipay by merchant order number/provider trade ID.
- Normalize result into the same transition path as callbacks.
- Never mutate order state through a separate reconciliation-only shortcut.

### 13.2 Paid Without Credit Grant Repair

Scans:

- `orders.status = 'paid'`.
- No matching `credit_ledger_entries(entry_type = 'grant', source_type = 'payment_order', source_id = order_id)`.

Actions:

- Re-emit or directly process the equivalent `payment.succeeded` command through the Credit module.
- Rely on the credit ledger uniqueness constraint to avoid duplicate grants.
- Write audit and Admin/Ops visibility records.

## 14. Error Codes

Commerce-specific API errors:

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_payment_provider` | Unsupported provider. |
| 400 | `invalid_provider_mode` | Unsupported provider mode for provider. |
| 400 | `inactive_credit_package` | Package is not purchasable. |
| 401 | `unauthenticated` | User not logged in. |
| 403 | `forbidden` | User lacks `billing:purchase` or admin payment capability. |
| 404 | `order_not_found` | Order missing or not visible in tenant scope. |
| 409 | `idempotency_conflict` | Same idempotency key with different request hash. |
| 409 | `order_already_paid` | Cannot create new payment intent for paid order. |
| 409 | `payment_intent_conflict` | Conflicting active payment intent. |
| 422 | `order_expired` | Order is no longer payable. |
| 422 | `amount_mismatch` | Payment provider amount does not match order. |
| 422 | `payment_state_conflict` | Provider event conflicts with existing order/payment state. |
| 503 | `payment_provider_unavailable` | Provider adapter unavailable or provider request failed safely. |

## 15. Refund Policy

P0-B refund support is intentionally conservative: refund is an Admin/Ops controlled workflow, not a self-service user workflow. The platform must preserve cash facts, credit facts, invoice facts, and audit facts separately.

### 15.1 Refund Principles

1. Refund is a cash fact owned by `Commerce/Payment`.
2. Credit reversal is a credit fact owned by `Credit/Billing`.
3. Invoice reversal or red-letter invoice is a tax document fact owned by the future invoice/fapiao capability.
4. A provider refund callback does not physically delete the original order, payment intent, credit grant, or invoice record.
5. If credits have already been consumed, the platform must not blindly create a negative balance unless the business explicitly accepts customer receivable/debt handling.

### 15.2 P0-B Default Policy

| Scenario | Refund Policy | Credit Ledger Handling | Notes |
| --- | --- | --- | --- |
| Paid order, no credit grant yet | Allow Admin/Ops refund after confirming provider payment. | No credit action, or no-op if grant never happened. | Paid-without-credit repair should pause while refund is pending. |
| Paid order, credits granted, organization has enough available credits | Allow Admin/Ops refund. | Insert `adjustment` or `grant_reversal` style negative available delta referencing the original order/grant, then submit provider refund. | The ledger stays append-only. |
| Paid order, credits granted, some/all credits already consumed and available balance is insufficient | Do not auto-refund in P0-B. Require manual review. | Options: reject refund, partial refund up to refundable available credits, or create manual receivable/debt outside P0-B. | Default recommendation: partial refund only up to recoverable unused credits. |
| Provider refund callback arrives before platform refund request is recorded | Mark refund event `manual_review_required`. | Do not auto-reverse credits until linked to an order and policy decision. | Protects against provider-side/manual console refunds. |
| Invoice/fapiao already issued | Refund requires invoice reversal/red-letter handling before or alongside cash refund according to finance policy. | Credit reversal and invoice reversal must be linked in audit. | Exact tax process must be validated with finance/tax advisor. |

### 15.3 Refund State

`payment_refunds.status`:

```text
pending
  -> submitted
  -> succeeded
  -> failed
  -> unknown
  -> manual_review_required
```

Refund command flow:

```text
Admin/Ops requests refund
  -> lock order and credit grant source
  -> calculate refundable credits and amount
  -> if available credits are insufficient, enter manual_review_required or partial-refund path
  -> write credit reversal ledger entry if policy requires pre-refund reversal
  -> submit provider refund
  -> persist payment_refunds(submitted)
  -> provider callback/query confirms refund
  -> transition refund succeeded
  -> emit payment.refund.succeeded
```

P0-B recommended sequencing:

- For unused credits, reverse credits first in the same domain transaction that creates the refund request, then submit provider refund.
- If provider refund submission fails before provider acceptance, rollback or mark refund failed and release the credit reversal path according to a manual decision.
- If provider refund result is unknown after submission, do not re-submit blindly. Query provider or manual review.

### 15.4 Refund Invariants

1. One refund provider transaction can be applied once.
2. Total refunded amount must not exceed paid amount.
3. Total reversed credits for an order must not exceed granted credits.
4. Refunds that would make available credits negative require manual review.
5. Refund state transitions and related credit adjustments require audit events.
6. Refund policy must be visible to users before payment, even if self-service refund is not available.

## 16. Invoice / Fapiao Requirements

P0-B should treat invoice/fapiao as a separate compliance workflow linked to orders, not as part of the payment or credit ledger itself.

Architecture note: this section is not tax advice. Implementation must be reviewed against current tax rules and the company's actual taxpayer status, invoice category, tax rate, and electronic invoice platform setup.

### 16.1 Compliance Basis to Validate

Current public tax guidance indicates:

- Electronic invoices are legally equivalent to paper invoices under the amended invoice management implementation rules effective March 1, 2024.
- Tax authorities provide electronic invoice service capabilities for issuance, delivery, and inspection.
- Red-letter digital invoices may be required for invoice errors, sales returns, service termination, or discounts.

The platform should therefore preserve enough order, invoice, refund, and red-letter linkage to support compliant handling, even if P0-B uses manual finance operations.

### 16.2 P0-B Scope

P0-B minimum:

- Collect invoice request information after payment.
- Store invoice request and invoice issuance status.
- Support manual/offline invoice issuance by finance.
- Store issued invoice metadata, not necessarily raw invoice files.
- Link invoices to orders and refunds.
- Block or flag refund workflows when invoice reversal/red-letter handling is required.

P0-B does not need:

- Fully automated tax platform integration.
- Self-service invoice cancellation/red-letter flow.
- Complex enterprise reimbursement workflow.
- Multi-tax-rate product catalog unless finance confirms it is needed.

### 16.3 Invoice Request Data

`invoice_requests` should capture:

| Field | Notes |
| --- | --- |
| `organization_id` | Tenant scope. |
| `order_id` | Required paid order. |
| `requested_by_user_id` | Required. |
| `buyer_type` | `individual`, `enterprise`. |
| `buyer_name` | Required. |
| `taxpayer_id` | Required for enterprise if applicable. |
| `email` | Delivery address for digital invoice. |
| `amount_minor` | Must not exceed refundable/paid invoiceable amount. |
| `currency` | `CNY`. |
| `status` | `requested`, `issued`, `rejected`, `red_letter_required`, `red_letter_issued`. |
| `metadata_json` | Address/phone/bank fields if finance requires them. |

`invoice_records` should capture:

| Field | Notes |
| --- | --- |
| `invoice_request_id` | Required. |
| `order_id` | Required. |
| `invoice_no` | Nullable until issued. |
| `invoice_type` | `digital_e_invoice`, `paper`, `other`. |
| `issued_amount_minor` | Required after issued. |
| `issued_at` | Nullable until issued. |
| `red_letter_of_invoice_id` | Nullable. |
| `status` | `issued`, `red_letter_issued`, `voided`, `manual_review_required`. |

### 16.4 Invoice and Refund Coupling

Refund handling must check invoice state:

| Invoice State | Refund Behavior |
| --- | --- |
| No invoice requested | Refund can proceed by refund policy. |
| Invoice requested but not issued | Mark invoice request rejected/canceled before refund if finance policy allows. |
| Invoice issued | Refund requires red-letter or finance-approved reversal workflow. |
| Red-letter issued | Refund can proceed if credit policy also allows it. |
| Invoice state unclear | Refund enters manual review. |

## 17. Payment Risk Controls

P0-B risk controls are defensive and operational. The goal is not a full fraud platform; it is to prevent obvious abuse, duplicate side effects, callback tampering, and operational blind spots.

### 17.1 Risk Control Points

| Stage | Control |
| --- | --- |
| Package listing | Only active packages returned; price is never trusted from frontend. |
| Order creation | Require login, tenant membership, `billing:purchase`, idempotency key, per-user/org/IP rate limit. |
| Payment intent creation | Restrict enabled provider modes by server config; enforce amount/currency snapshot match. |
| Provider callback | Verify signature, provider app/merchant identity, amount, currency, merchant order number, provider trade status. |
| Duplicate callback | Dedup by provider event key and provider trade ID. |
| Suspicious mismatch | Store provider event, reject state transition, alert Admin/Ops. |
| Refund | Admin/Ops only in P0-B; require reason, audit, and available credit check. |

### 17.2 Suggested P0-B Limits

| Limit | Default |
| --- | --- |
| Order creation per user | 10 / hour. |
| Order creation per organization | 50 / day. |
| Payment intent creation per order | 3 active attempts. |
| Payment callback invalid signature alerts | Alert after 5 invalid callbacks / 10 minutes per provider/IP bucket. |
| Max single package amount | Configured server-side; Admin change requires audit. |
| New organization purchase | Optional manual review for unusually high first purchase. |

These values are starting points. They should be configuration, not hard-coded constants.

### 17.3 Risk Event Records

Add `payment_risk_events` for security and operations:

| Field | Notes |
| --- | --- |
| `organization_id` | Nullable if event cannot be matched. |
| `user_id` | Nullable. |
| `order_id` | Nullable. |
| `payment_intent_id` | Nullable. |
| `provider_event_id` | Nullable. |
| `risk_type` | `rate_limited`, `signature_invalid`, `amount_mismatch`, `currency_mismatch`, `merchant_mismatch`, `duplicate_trade`, `refund_requires_review`, `high_value_first_purchase`. |
| `severity` | `info`, `warning`, `critical`. |
| `decision` | `allow`, `block`, `manual_review`. |
| `metadata_json` | Safe metadata only. |

Risk records do not replace audit events. Audit records answer who did what; risk records answer what suspicious condition was detected.

## 18. Reconciliation Cadence

Reconciliation is part of P0-B, because payment callbacks and provider query results are eventually consistent external facts.

### 18.1 Reconciliation Jobs

| Job | Frequency | Scans | Action |
| --- | --- | --- | --- |
| Recent payment reconciliation | Every 5 minutes | Submitted/unknown payment intents updated in last 2 hours. | Query provider, normalize result, apply same transition path as callback. |
| Expired order closure | Every 10 minutes | `pending_payment` orders past `expires_at`. | Query provider first; if unpaid, mark expired. |
| Paid-without-credit repair | Every 5 minutes | `paid` orders without payment-origin grant ledger entry. | Reprocess `payment.succeeded` path idempotently. |
| Provider event retry | Every 5 minutes | Provider events stuck in `received` or transient failure. | Re-run processing if safe. |
| Daily settlement check | Daily | Previous day's paid/refunded orders and provider reports. | Detect amount/count drift; create reconciliation items. |

### 18.2 Reconciliation State

`payment_reconciliation_runs`:

| Field | Notes |
| --- | --- |
| `provider` | `wechat_pay`, `alipay`, or `all`. |
| `run_type` | `recent`, `expiry`, `paid_without_credit`, `daily_settlement`. |
| `status` | `running`, `succeeded`, `failed`, `partial_failed`. |
| `started_at`, `finished_at` | Required timestamps. |
| `summary_json` | Counts and safe aggregate metadata. |

`payment_reconciliation_items`:

| Field | Notes |
| --- | --- |
| `run_id` | Required. |
| `order_id` | Nullable. |
| `payment_intent_id` | Nullable. |
| `provider_trade_id` | Nullable. |
| `issue_type` | `missing_callback`, `paid_without_credit`, `amount_mismatch`, `provider_paid_platform_unpaid`, `platform_paid_provider_unpaid`, `refund_mismatch`, `invoice_refund_mismatch`. |
| `status` | `open`, `resolved`, `manual_review_required`, `ignored_with_reason`. |
| `resolution_json` | Safe metadata. |

### 18.3 Reconciliation Invariants

1. Reconciliation uses the same domain transition functions as callbacks.
2. Reconciliation never directly mutates credit balance.
3. Daily settlement differences create reconciliation items, not silent corrections.
4. `paid_without_credit` repair is safe to run repeatedly.
5. Provider reports and raw exports should be stored in controlled storage with access restrictions if retained.

## 19. P0-B Verification Scenarios

Before P0-B commercial beta, the following scenarios must pass:

1. Duplicate provider callback creates one paid transition and one credit grant.
2. Valid callback with amount mismatch does not mark order paid.
3. Frontend success redirect without provider callback does not grant credits.
4. Paid order with Credit consumer crash is repaired by paid-without-credit job.
5. Refund for unused credits creates an append-only credit reversal and provider refund record.
6. Refund for consumed credits enters manual review or partial-refund path; no automatic negative balance.
7. Issued invoice blocks automatic refund until red-letter/reversal state is handled.
8. Invalid callback signatures generate risk events and do not mutate payment state.
9. Expired order reconciliation queries provider before closing.
10. Daily settlement mismatch creates reconciliation item visible in Admin/Ops.

## 20. Provider Adapter Implementation Gate

This section turns provider product modes into implementation gates. It is not a replacement for official SDK/API documentation. Before coding each adapter, engineers must open the official provider product page and verify request fields, response fields, signature rules, callback acknowledgement, query behavior, close-order behavior, refund behavior, and bill download behavior.

### 20.1 Adapter Interface

```typescript
interface PaymentProviderAdapter {
  provider: "wechat_pay" | "alipay";
  supportedModes(): PaymentProviderMode[];

  createPayment(input: {
    merchantOrderNo: string;
    description: string;
    amountMinor: number;
    currency: "CNY";
    expiresAt: string;
    notifyUrl: string;
    returnUrl?: string;
    providerMode: PaymentProviderMode;
    metadata: {
      organizationId: string;
      orderId: string;
      paymentIntentId: string;
    };
  }): Promise<{
    providerPayloadHash: string;
    providerTradeId?: string;
    payAction: PaymentPayAction;
    rawSafeMetadata: Record<string, unknown>;
  }>;

  verifyAndNormalizeCallback(input: {
    headers: Record<string, string>;
    rawBody: string;
  }): Promise<NormalizedPaymentCallback>;

  queryPayment(input: {
    merchantOrderNo: string;
    providerTradeId?: string;
  }): Promise<NormalizedPaymentQueryResult>;

  closePayment?(input: {
    merchantOrderNo: string;
  }): Promise<NormalizedPaymentCloseResult>;

  refund?(input: {
    merchantOrderNo: string;
    providerTradeId?: string;
    merchantRefundNo: string;
    amountMinor: number;
    currency: "CNY";
    reason: string;
    notifyUrl?: string;
  }): Promise<NormalizedRefundSubmitResult>;
}
```

Rules:

- Provider adapters return normalized domain values. Application services do not inspect provider-specific payloads directly.
- Provider request and callback payloads are stored as hashes plus safe metadata unless compliance/security policy explicitly allows encrypted raw retention.
- Every adapter method must declare whether the provider call is side-effect free, side-effect possible, or side-effect confirmed.
- Unknown provider result maps to `unknown`, never to `failed`.

### 20.2 WeChat Pay `native_qr` Mapping

Confirmed product direction:

- `provider = wechat_pay`
- `provider_mode = native_qr`
- Frontend `payAction.type = qr_code`

Create payment expected mapping:

| Platform Field | WeChat Native Field | Notes |
| --- | --- | --- |
| `merchantOrderNo` | `out_trade_no` | Merchant order number; must match local `orders.order_no`. |
| `description` | `description` | Package purchase description, no sensitive user content. |
| `amountMinor` | `amount.total` | CNY minor unit, integer cents. |
| `currency` | `amount.currency` | P0-B expects `CNY`. |
| `notifyUrl` | `notify_url` | Must point to `/webhooks/payments/wechat-pay`. |
| configured merchant ID | `mchid` | Secret/config only. |
| configured app ID | `appid` | Secret/config only. |
| `expiresAt` | `time_expire` if enabled | Must be verified against official API before use. |

Create payment expected response:

| WeChat Field | Platform Mapping |
| --- | --- |
| `code_url` | `payAction.qrCodeUrl` |

Payment success callback expected mapping:

| WeChat Callback Field | Platform Mapping |
| --- | --- |
| `id` | `provider_event_dedup_key` candidate. |
| `event_type = TRANSACTION.SUCCESS` | `eventType = payment_succeeded`. |
| Header `Wechatpay-Serial` | Certificate/public-key selection. |
| Header `Wechatpay-Signature` | Signature verification input. |
| Header `Wechatpay-Timestamp` | Signature verification input and replay-risk signal. |
| Header `Wechatpay-Nonce` | Signature verification input. |
| `resource.algorithm = AEAD_AES_256_GCM` | Encrypted resource algorithm. |
| Decrypted `appid` | Must match configured app ID. |
| Decrypted `mchid` | Must match configured merchant ID. |
| Decrypted `out_trade_no` | Must match local order number. |
| Decrypted `transaction_id` | `providerTradeId`. |
| Decrypted `trade_type = NATIVE` | Must match `native_qr`. |
| Decrypted `trade_state = SUCCESS` | Payment succeeded. |
| Decrypted `success_time` | `paidAt`. |
| Decrypted `amount.total` | Must match order amount. |
| Decrypted `amount.currency` | Must be `CNY`. |

WeChat callback acknowledgement:

- If signature verification and persistence of the received event succeeds, return HTTP `200` or `204` with no body after durable handling according to our callback pipeline.
- If signature verification fails, return 4xx/5xx with a failure body and do not mutate payment or credit state.
- Duplicate valid callbacks return success acknowledgement after confirming the event/order is already processed.

WeChat query/close/refund gates:

- Query by merchant order number or provider transaction ID must normalize `SUCCESS`, `NOTPAY`, `CLOSED`, `REFUND`, and unknown/error states.
- Closing an expired local order must query provider first; if provider shows paid, transition through paid path instead of closing.
- Refund submission must use a merchant refund number and must not be retried blindly after provider acceptance is unknown.
- Bill download/settlement APIs are required before the daily settlement job is enabled in production.

### 20.3 Alipay `pc_page` Mapping

Confirmed product direction:

- `provider = alipay`
- `provider_mode = pc_page`
- Frontend `payAction.type = form_post` or `redirect`, depending on SDK integration.
- `qr_code` is allowed fallback using `alipay.trade.precreate`-style QR pre-create flow after official verification.

PC page create payment expected mapping:

| Platform Field | Alipay PC Page Field | Notes |
| --- | --- | --- |
| `merchantOrderNo` | `out_trade_no` | Merchant order number; must match local `orders.order_no`. |
| `description` | `subject` | Package purchase description, no sensitive user content. |
| `amountMinor` | `total_amount` | Convert integer cents to decimal yuan string; exact rounding utility required. |
| `notifyUrl` | `notify_url` | Must point to `/webhooks/payments/alipay`. |
| `returnUrl` | `return_url` | Frontend UX only; does not grant credits. |
| configured app ID | `app_id` | Secret/config only. |
| fixed method | `method = alipay.trade.page.pay` | Must be verified against official domestic OpenAPI docs. |
| fixed sign type | `sign_type = RSA2` | Unless official/account config says otherwise. |
| product code | `product_code` | Expected `FAST_INSTANT_TRADE_PAY` for PC website pay; verify officially before implementation. |

QR fallback expected mapping:

| Platform Field | Alipay QR Field | Notes |
| --- | --- | --- |
| `merchantOrderNo` | `out_trade_no` | Merchant order number. |
| `description` | `subject` | Package purchase description. |
| `amountMinor` | `total_amount` | Decimal yuan string. |
| `notifyUrl` | `notify_url` | Server callback endpoint. |
| fixed method | `method = alipay.trade.precreate` | Must be verified against official docs. |
| response QR | `qr_code` | Maps to `payAction.qrCodeUrl`. |

Alipay async notify expected mapping:

| Alipay Notify Field | Platform Mapping |
| --- | --- |
| `notify_id` | `provider_event_dedup_key` candidate. |
| `out_trade_no` | Local order number. |
| `trade_no` | `providerTradeId`. |
| `trade_status` | `payment_succeeded` if `TRADE_SUCCESS` or `TRADE_FINISHED` according to product/account semantics. |
| `total_amount` / equivalent amount field | Must match order amount after decimal-to-minor conversion. |
| `buyer_id` / buyer fields | Safe metadata only. |
| `sign` and `sign_type` | Signature verification input. |

Alipay callback acknowledgement:

- The notify endpoint must return exactly `success` after durable successful processing of a valid notification.
- It must not redirect, render HTML, or rely on cookies/session.
- Duplicate valid notifications return `success` after idempotency checks.
- Invalid signature, amount mismatch, merchant mismatch, or order mismatch must not transition payment or credit state.

Alipay query/close/refund gates:

- Query uses merchant order number or Alipay trade number and normalizes `WAIT_BUYER_PAY`, `TRADE_CLOSED`, `TRADE_SUCCESS`, and `TRADE_FINISHED`.
- For P0-B, `TRADE_SUCCESS` and `TRADE_FINISHED` should be treated as paid only after amount, merchant/order, and signature/query response verification.
- Close/cancel and refund APIs must be verified from official docs before implementation.
- Provider report export/import is required for daily settlement.

### 20.4 Amount Conversion Rules

| Provider | Direction | Rule |
| --- | --- | --- |
| WeChat Pay | Platform -> Provider | `amountMinor` remains integer cents. |
| WeChat Pay | Provider -> Platform | `amount.total` remains integer cents. |
| Alipay | Platform -> Provider | Convert integer cents to decimal yuan string with exactly two decimals. |
| Alipay | Provider -> Platform | Convert decimal amount string to integer cents with decimal parser, not floating point. |

Rules:

- Never use JavaScript floating-point arithmetic for currency conversion.
- Store platform amount in integer minor units.
- Provider decimal strings must be parsed by a decimal library or strict string parser.
- Any conversion mismatch enters `amount_mismatch` and manual review.

### 20.5 Callback ACK Timing Decision

The platform chooses safety over ultra-fast ACK:

1. Persist `payment_provider_events(received)`.
2. Verify signature and normalize payload.
3. Lock local order/payment intent.
4. Apply idempotent state transition and write required outbox event.
5. Mark provider event processed.
6. ACK provider.

If this cannot complete within provider timeout budgets, the implementation may split ACK and business processing only if it first persists a verified callback event in a durable table and has a retry worker. Even then, credit grants still happen only through the idempotent `payment.succeeded` path.

### 20.6 Adapter Verification Checklist

Each provider adapter must include tests for:

- Create payment maps local order to provider request correctly.
- Provider response produces correct `payAction`.
- Valid callback/query result marks payment paid exactly once.
- Duplicate callback does not create duplicate credit grant.
- Invalid signature does not mutate state.
- Amount mismatch does not mutate state.
- Currency mismatch does not mutate state.
- Merchant/app ID mismatch does not mutate state.
- Provider paid but platform pending is repaired by reconciliation.
- Platform paid but provider unpaid creates reconciliation item.
- Unknown provider response does not trigger blind retry or false failure.

## 21. Known Gaps Before Implementation

Current confidence is not 100%.

Open design items:

1. Official WeChat Pay implementation verification for `native_qr`: exact request path, request field optionality, signature SDK, query/close/refund/bill APIs, and production merchant account requirements.
2. Official Alipay implementation verification for `pc_page` and optional `qr_code`: exact method names, required `product_code`, callback field set, signature SDK, close/refund/bill APIs, and production merchant account requirements.
3. Finance/tax review of invoice/fapiao implementation details, including invoice type, tax rate, red-letter workflow, and data retention.
4. Whether credit packages are organization-scoped only or can be bought by personal accounts before organization creation.
5. Whether customer-facing full order history and credit ledger pages are required in P0-B. A single order status query is included.
6. Exact provider report export/import mechanism for daily settlement.

Required next design step:

- Verify official WeChat Pay and Alipay adapter field mappings, then ask finance/tax to confirm invoice category, red-letter process, and refund operational policy before implementation.

## References

- PRC invoice implementation rules amendment, State Taxation Administration Order No. 56, effective 2024-03-01: https://app.www.gov.cn/govdata/gov/202402/27/512396/article.html
- State Taxation Administration explanation of red-letter fully digital invoices: https://www.chinatax.gov.cn/chinatax/n810356/n3010387/c5236346/content.html
- WeChat Pay official payment success callback documentation: https://pay.wechatpay.cn/doc/v3/merchant/4012791902
- WeChat Pay Native order SDK mapping reference with official-doc link: https://wechatpay.js.org/openapi/v3/pay/transactions/native
- Alipay trade query official documentation: https://iopenhome.alipay.com/docs/ac/solution_api/trade-query
- Alipay asynchronous notification guidance: https://global.alipay.com/developer/helpcenter/detail?_route=sg&categoryId=67617&knowId=201602452303&sceneCode=AC_DEV
