# Payment Mock Provider Design

> Date: 2026-05-25  
> Status: Design baseline for open-source research and local integration  
> Scope: Local payment provider simulation for one-time credit package purchases  
> Non-scope: Object storage, text model gateway, subscriptions, revenue sharing, auto-renewal, postpaid billing

## 1. Goal

The local payment mock must help the team test the real platform payment lifecycle before WeChat Pay and Alipay are connected.

It should not be a shortcut that directly marks orders paid or grants credits. It should behave like a local provider, so that the platform backend still exercises the same boundaries it will use in production:

```text
Platform creates order
  -> Platform creates payment intent through a provider adapter
  -> Mock provider returns a provider-like pay action
  -> Mock provider sends an async callback to the platform
  -> Commerce/Payment verifies and records the provider event
  -> Commerce/Payment marks the payment intent/order according to verified facts
  -> Commerce/Payment emits payment.succeeded through outbox
  -> Credit/Billing consumes payment.succeeded and grants credits
```

Recommended shape: an independent local provider simulator. It should run beside the backend, expose provider-like endpoints, sign callback payloads, and support scenario injection.

## 2. Current Project Context

The current project already has the core payment and credit facts in place:

| Fact | Current owner | Current records |
| --- | --- | --- |
| Sellable package | `Commerce/Payment` | `credit_packages` |
| Purchase order | `Commerce/Payment` | `billing_orders` |
| Provider attempt | `Commerce/Payment` | `payment_intents` |
| Provider callback | `Commerce/Payment` | `payment_provider_events` |
| Payment risk/manual review | `Commerce/Payment` + `Admin/Ops` | `payment_risk_events` |
| Credit accounting | `Credit/Billing` | `credit_ledger_entries` |
| Async success bridge | `Commerce/Payment` -> `Credit/Billing` | `outbox_events`, `inbox_events` |

The existing `/api/billing/payment-callback/mock` route is useful for tests, but it is not the long-term mock boundary. It lets tests inject a callback directly into the platform. The long-term local mock should instead simulate a provider outside the platform and call back into the platform through the same callback contract that real providers will use.

## 3. Boundary And Ownership

### 3.1 Commerce/Payment

Owns:

- Credit package catalog.
- Billing order creation and package snapshot.
- Payment intent creation.
- Provider adapter selection.
- Provider callback verification and normalization.
- Provider event deduplication.
- Payment risk events.
- `payment.succeeded` outbox event.

Does not own:

- Credit balance mutation.
- Generation credit reservation or consumption.
- AI provider cost accounting.
- UI-only payment success assumptions.

Rule: `Commerce/Payment` can say "money was verified as received." It cannot directly say "credits were granted."

### 3.2 Credit/Billing

Owns:

- Append-only credit ledger entries.
- Credit grants from `payment.succeeded`.
- Credit reservations, allocations, consumption, and release.
- Cached balance reconciliation.

Does not own:

- Payment provider callbacks.
- Payment signatures.
- Payment order state transitions.
- Provider merchant order mapping.

Rule: `Credit/Billing` consumes durable payment facts. It must never parse WeChat Pay or Alipay payloads.

### 3.3 Mock Provider

Owns:

- Provider-like order submission response.
- Provider trade ID generation.
- Callback payload generation.
- Callback signing.
- Payment scenario timing.
- Duplicate callback replay.
- Failure and mismatch injection.
- Provider-like query responses.

Does not own:

- Platform `billing_orders`.
- Platform `payment_intents`.
- Platform `credit_ledger_entries`.
- Platform user, organization, or membership data.
- Admin/Ops repair decisions.

Rule: the mock provider simulates an external system. It should only communicate through provider adapter calls and callback HTTP calls.

### 3.4 Admin/Ops

Owns:

- Viewing stuck or risky payment states.
- Reviewing `payment_risk_events`.
- Repairing paid orders that did not grant credits.
- Audited manual decisions.

Does not own:

- Silent ledger mutation.
- Unverified provider callback acceptance.
- Bypassing domain commands.

## 4. Ideal Architecture

```text
Creator Web
  -> Platform Backend
    -> Commerce/Payment
      -> PaymentProviderAdapter
        -> Local Mock Provider
          -> async callback back to Platform Backend
    -> Payment provider event records
    -> Outbox
  -> Credit/Billing consumer
    -> Credit ledger
```

The adapter boundary is the replaceable part. The platform should be able to switch from `mock_provider` to `wechat_pay` or `alipay` by changing provider adapter implementation and runtime configuration, without changing order, provider event, outbox, or credit ledger ownership.

## 5. Provider Adapter Contract

The provider adapter should normalize provider differences before data crosses into `Commerce/Payment`.

```ts
type PaymentProvider = "mock_provider" | "wechat_pay" | "alipay";

type PaymentProductMode =
  | "wechat_native_qr"
  | "alipay_pc_page"
  | "alipay_qr_code";

type ProviderPayAction =
  | {
      kind: "qr_code";
      provider: PaymentProvider;
      codeUrl: string;
      expiresAt: string;
      safeMetadata: Record<string, unknown>;
    }
  | {
      kind: "redirect";
      provider: PaymentProvider;
      redirectUrl: string;
      expiresAt: string;
      safeMetadata: Record<string, unknown>;
    };

interface CreateProviderPaymentIntentInput {
  provider: PaymentProvider;
  productMode: PaymentProductMode;
  merchantOrderNo: string;
  amountMinor: number;
  currency: "CNY";
  subject: string;
  notifyUrl: string;
  returnUrl?: string;
  expiresAt: Date;
  safeMetadata: Record<string, unknown>;
}

interface CreateProviderPaymentIntentResult {
  providerPayloadHash: string;
  providerSafeMetadata: Record<string, unknown>;
  payAction: ProviderPayAction;
}

interface VerifyCallbackResult {
  signatureStatus: "verified" | "invalid";
  rawPayloadHash: string;
}

interface NormalizedPaymentEvent {
  provider: PaymentProvider;
  merchantOrderNo: string;
  providerTradeId: string;
  eventType:
    | "payment_succeeded"
    | "payment_failed"
    | "payment_closed"
    | "refund_succeeded"
    | "unknown";
  amountMinor: number;
  currency: "CNY";
  merchantId: string;
  providerEventDedupKey: string;
  rawPayloadHash: string;
  signatureStatus: "verified" | "invalid";
  safeMetadata: Record<string, unknown>;
}

interface PaymentProviderAdapter {
  createPaymentIntent(
    input: CreateProviderPaymentIntentInput,
  ): Promise<CreateProviderPaymentIntentResult>;

  verifyCallback(rawBody: unknown, headers: Record<string, string>): VerifyCallbackResult;

  normalizeCallback(rawBody: unknown): NormalizedPaymentEvent | null;

  buildAckResponse(
    result: "accepted" | "rejected",
  ): { status: number; body: string | Record<string, unknown> };

  queryPaymentStatus(input: {
    merchantOrderNo: string;
  }): Promise<NormalizedPaymentEvent | { status: "not_found" | "unknown" }>;
}
```

This contract is intentionally provider-shaped but platform-owned. Real WeChat Pay and Alipay SDKs can help implement adapters, but they must not define platform domain objects.

## 6. Mock Provider Scenario Model

The mock provider should expose scenario controls instead of requiring engineers to edit platform records by hand.

```ts
type MockProviderScenario =
  | "success"
  | "failure"
  | "closed"
  | "refund"
  | "amount_mismatch"
  | "duplicate_notify"
  | "invalid_signature"
  | "delayed_notify"
  | "unknown";

interface MockScenarioConfig {
  scenario: MockProviderScenario;
  delayMs?: number;
  duplicateCount?: number;
  amountDeltaMinor?: number;
  callbackEventDedupKey?: string;
  providerTradeId?: string;
}
```

Minimum required behavior:

| Scenario | Provider behavior | Platform expectation |
| --- | --- | --- |
| `success` | Sends verified `payment_succeeded` callback with matching amount/currency/order. | Order becomes `paid`; one `payment.succeeded` outbox event; credits grant only after credit consumer runs. |
| `failure` | Sends verified `payment_failed` callback. | Intent becomes `failed`; order stays `pending_payment`; no credit grant. |
| `closed` | Sends verified `payment_closed` callback. | Intent becomes `closed`; order is not paid; no credit grant. |
| `refund` | Sends refund callback. | Event is recorded and routed to manual review unless refund automation is explicitly implemented later. |
| `amount_mismatch` | Sends verified success with wrong amount. | Provider event and risk event are recorded; no paid order; no credit grant. |
| `duplicate_notify` | Replays the same callback identity. | Provider event dedup returns duplicate; no duplicate order transition or outbox event. |
| `invalid_signature` | Sends payload with invalid signature. | Risk event is recorded; no trusted payment transition. |
| `delayed_notify` | Sends callback after a configured delay. | Platform remains pending until callback; late callback still processes if order is payable. |
| `unknown` | Query returns unknown or callback uses unknown event type. | Provider event is recorded for manual review; no automatic credit grant. |

## 7. Mock Provider HTTP Surface

The exact routes can change during implementation, but any open-source candidate should support these capabilities.

```text
POST /mock-payments/intents
GET  /mock-payments/intents/:merchantOrderNo
POST /mock-payments/intents/:merchantOrderNo/scenario
POST /mock-payments/intents/:merchantOrderNo/notify
POST /mock-payments/intents/:merchantOrderNo/replay-notify
```

Recommended local flow:

1. Platform calls `POST /mock-payments/intents` through `PaymentProviderAdapter.createPaymentIntent`.
2. Mock provider stores a provider-side payment record keyed by `merchantOrderNo`.
3. Mock provider returns a QR or redirect action.
4. Test or local UI chooses a `MockProviderScenario`.
5. Mock provider sends a signed async callback to the platform `notifyUrl`.
6. Platform records and processes the callback through the same `processPaymentCallback` path used by real providers.

The mock provider must persist enough local state for query and replay during a local process lifetime. It does not need production-grade durability.

## 8. Platform Interface Constraints

These rules are non-negotiable for both mock and real providers:

1. `POST /api/billing/orders` and payment intent creation continue to require `Idempotency-Key`.
2. Provider callback processing stores `payment_provider_events` before trusting side effects.
3. Success callback emits `payment.succeeded` through outbox; it does not directly write `credit_ledger_entries`.
4. Frontend redirect state, QR page state, or local UI success cannot grant credits.
5. Provider event deduplication is based on provider event identity.
6. Provider trade ID reuse must become `payment_risk_events` and manual review, not a rollback that hides evidence.
7. Amount, currency, merchant ID, merchant order number, and provider trade ID must be validated before marking an order paid.
8. Refund callbacks are payment facts. They must not delete original payment or credit ledger facts.
9. Provider raw payloads may be hashed and redacted. Safe metadata can be stored, but secrets and full sensitive payloads should not leak into UI responses.

## 9. Open-Source Screening Matrix

R&D should use this matrix when looking for open-source projects to embed or adapt.

| Dimension | Must have | Strong signal | Reject if |
| --- | --- | --- | --- |
| Boundary fit | Can run as independent simulator or adapter helper. | Does not require owning our order/credit tables. | Forces a full ecommerce/payment domain model into our backend. |
| Provider simulation | Can simulate async webhook/callback flow. | Supports replay, delayed callback, and failure injection. | Only returns "paid" synchronously with no webhook model. |
| Signature model | Supports configurable signing or can be extended. | Lets us mimic WeChat/Alipay callback verification shape. | Requires disabling signature checks for local success. |
| Scenario control | Supports success/failure/mismatch/duplicate cases. | Has API or config-driven scenarios. | Only supports happy path. |
| Adapter value | Helps implement provider request/callback mapping. | Official SDK or thin wrapper around official API semantics. | Hides provider fields behind opaque business objects. |
| Tech fit | Works well with Node.js local dev or simple HTTP container. | Easy to run beside `npm run dev`. | Requires heavy unrelated infrastructure. |
| Long-term safety | Can be removed when real providers are enabled. | Keeps platform interfaces stable. | Pollutes platform domain with mock-only fields. |

### Good candidate types

- Local webhook simulators that can sign and replay callbacks.
- Payment sandbox harnesses that expose provider-like endpoints.
- Official SDKs used only inside provider adapters.
- Small HTTP services that can be embedded as a local dev dependency or run through npm scripts.

### Bad candidate types

- Full ecommerce/payment systems that own orders, users, accounts, or balances.
- SDK wrappers that require replacing our payment tables.
- Mock libraries that only return synchronous success.
- Projects that cannot generate duplicate, invalid, delayed, or mismatched notifications.

## 10. Provider-Specific Direction

### 10.1 WeChat Pay

Target first product mode: Native QR.

The future WeChat adapter should map platform payment intents to WeChat-style native QR payment creation and async notification processing. The local mock should therefore be able to return a QR-like `codeUrl`, generate provider trade IDs, and send signed callback events.

Use official APIv3 semantics and official SDK repositories as the source of truth for real adapter design. Node community libraries may be useful as implementation references, but they must not decide our domain model.

### 10.2 Alipay

Target first product modes: PC page pay first, QR code fallback if account/API constraints make QR pre-create more suitable.

The future Alipay adapter should map platform payment intents to Alipay page/QR payment creation and async notification processing. The local mock should therefore support redirect-like actions and callback notification simulation.

Prefer the official Node SDK `alipay-sdk-nodejs-all` for real adapter research. Keep SDK-specific request names and signature handling inside the Alipay adapter.

## 11. Acceptance Checklist For This Design

Before an open-source project is accepted for local integration, the reviewer must answer:

- What part of the desired mock provider does it implement?
- Does it run outside the platform backend, or can it be wrapped to behave that way?
- How does it create a provider-like payment action?
- How does it send async callbacks?
- How does it sign callbacks?
- How does it replay duplicate callbacks?
- How does it simulate amount mismatch and invalid signatures?
- Does it leave `billing_orders`, `payment_intents`, `payment_provider_events`, `payment_risk_events`, and `credit_ledger_entries` owned by our platform?
- What code must be deleted or swapped when real WeChat Pay or Alipay is enabled?
- What test proves paid-without-credit can still be detected and repaired?

If any answer requires "the mock directly updates platform records," the candidate fails the boundary test.

## 12. Recommended First Integration Slice

The first implementation should be small:

1. Introduce a `PaymentProviderAdapter` interface inside `Commerce/Payment`.
2. Move current `mock_qr` generation behind a `MockPaymentProviderAdapter`.
3. Add runtime config for mock provider base URL and callback secret.
4. Add a minimal independent mock provider script or service.
5. Keep `/api/billing/payment-callback/mock` only as a compatibility/testing route.
6. Add HTTP smoke that proves order -> intent -> mock callback -> outbox -> credit consumer.
7. Add scenario tests for duplicate callback, invalid signature, amount mismatch, payment failure, and paid-without-credit repair visibility.

Do not integrate a large open-source payment system before this adapter seam exists. The seam is the architecture; the open-source project is only an implementation aid.

## 13. References For Research

- [Alipay official Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all)
- [WeChat Pay official APIv3 GitHub organization](https://github.com/wechatpay-apiv3)
- [WeChat Pay official Go SDK](https://github.com/wechatpay-apiv3/wechatpay-go)
- [WeChat Pay official PHP SDK](https://github.com/wechatpay-apiv3/wechatpay-php)
- Current design baseline: `docs/architecture/p0-commerce-payment-design.md`
- Current payment service: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Current credit consumer: `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts`
