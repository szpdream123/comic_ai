# Payment Provider Integration Design

> Date: 2026-05-25  
> Status: PayLab-first provider architecture with open-source research and local fallback direction
> Scope: Payment provider integration for one-time credit package purchases; PayLab first, WeChat Pay and Alipay later
> Non-scope: Object storage, text model gateway, subscriptions, revenue sharing, auto-renewal, postpaid billing

## 1. Goal

The payment provider integration must help the team test the real platform payment lifecycle before WeChat Pay and Alipay are connected.

PayLab is the recommended first external test provider. A first-party local mock remains a fallback for deterministic edge cases, but neither PayLab nor the mock can become a shortcut that directly marks orders paid or grants credits. The platform backend must keep exercising the same boundaries it will use in production:

```text
Platform creates order
  -> Platform creates payment intent through a provider adapter
  -> Provider returns a provider-like pay action
  -> Provider sends an async callback to the platform
  -> Commerce/Payment verifies and records the provider event
  -> Commerce/Payment marks the payment intent/order according to verified facts
  -> Commerce/Payment emits payment.succeeded through outbox
  -> Credit/Billing consumes payment.succeeded and grants credits
```

Recommended shape: platform-owned payment domain plus replaceable provider adapters. PayLab is the first provider adapter for test environments; the local mock adapter is used only when PayLab cannot cover a required scenario.

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

The existing `/api/billing/payment-callback/mock` route is useful for tests, but it is not the long-term provider boundary. It lets tests inject a callback directly into the platform. The long-term test flow should use PayLab first, and only use a local fallback mock when PayLab cannot cover a required scenario.

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

### 3.3 Provider And Fallback Mock Provider

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

Rule: PayLab, WeChat Pay, Alipay, and the fallback mock all behave as external providers from the platform's point of view. They should only communicate through provider adapter calls and callback HTTP calls.

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
        -> PayLab / WeChat Pay / Alipay / Fallback Mock
          -> async callback back to Platform Backend
    -> Payment provider event records
    -> Outbox
  -> Credit/Billing consumer
    -> Credit ledger
```

The adapter boundary is the replaceable part. The platform should be able to switch from `paylab` to `wechat_pay` or `alipay` by changing provider adapter implementation and runtime configuration, without changing order, provider event, outbox, or credit ledger ownership.

### 4.1 Payment Service Model Recommendation

Recommended architecture: **platform-owned payment domain + provider registry + PayLab as the first external test provider**.

PayLab should be treated as a real provider from the platform's point of view, not as a helper function inside `Commerce/Payment`. The first production-shaped test flow should therefore be:

```text
Creator Web
  -> POST /api/billing/orders
  -> POST /api/billing/payment-intents { provider: "paylab" }
Platform Backend
  -> Commerce/Payment creates payment_intents row
  -> PaymentProviderRegistry resolves PayLabAdapter
  -> PayLabAdapter calls PayLab Mock PSP
PayLab
  -> Sends signed webhook to /api/payment-provider-callbacks/paylab
Platform Backend
  -> PayLabAdapter verifies + normalizes callback
  -> Commerce/Payment stores payment_provider_events first
  -> Commerce/Payment updates intent/order only after platform validation
  -> Commerce/Payment emits payment.succeeded outbox
Credit/Billing
  -> consumes payment.succeeded
  -> writes credit_ledger_entries
```

This keeps the adapter replaceable while making the test environment exercise the same asynchronous shape that WeChat Pay and Alipay will use later.

#### 4.1.1 Provider Submission State Machine

Provider creation has two sources of truth: our database and the external provider. The design must not hide the gap between them.

Rules:

1. Do not hold a database transaction open while calling PayLab, WeChat Pay, or Alipay.
2. Create or reuse a platform `payment_intents` row in `created` state before the provider call.
3. Call the provider with a deterministic provider idempotency key derived from the platform idempotency record or payment intent ID.
4. If the provider accepts the request, update the intent to `submitted`, store provider-safe metadata, `provider_payload_hash`, `submitted_at`, and the returned `ProviderPayAction`.
5. If the provider call times out or returns an ambiguous error, mark the intent `unknown`, return a retryable response, and rely on `queryPaymentStatus` reconciliation.
6. If the provider accepts the request but our update fails, the next retry must use the same provider idempotency key and repair local state through provider query rather than creating a second provider payment.
7. Only provider callback or reconciliation can move an intent to `succeeded`, `failed`, or `closed`.

```text
created
  -> submitted       provider create accepted and local update committed
  -> unknown         provider outcome uncertain
submitted
  -> succeeded       verified callback or reconciliation confirms success
  -> failed          verified callback or reconciliation confirms failure
  -> closed          verified callback, close call, or reconciliation confirms close
unknown
  -> submitted       provider query finds a live provider payment
  -> succeeded       provider query finds completed payment
  -> failed/closed   provider query finds terminal non-success
  -> expired         platform timeout with no provider evidence
```

Crash recovery expectations:

- Platform intent exists but provider call was never attempted: reconciliation may attempt provider creation once with the original idempotency key, or expire the intent if the order is no longer payable.
- Provider payment exists but local intent is still `created` or `unknown`: reconciliation updates the platform intent and never creates a second provider payment.
- Provider callback arrives before the local `submitted` update: callback lookup by `(provider, merchantOrderNo)` must still find the intent and process normally.

### 4.2 Bounded Contexts

| Context | Owns | Must not own |
| --- | --- | --- |
| `Commerce/Payment` | package catalog, `billing_orders`, payment intent state, provider event ingestion, validation, risk events, payment outbox | credit ledger mutation, provider SDK details, frontend-only success |
| `PaymentProviderIntegration` | provider registry, adapter contracts, provider clients, provider-specific signing/verification, provider query/close/refund APIs | platform order lifecycle, credits, admin repair decisions |
| `Credit/Billing` | append-only credit ledger, payment success credit grants, reservation/consume/release | provider payload parsing, provider signatures, payment callback routing |
| `Admin/Ops` | risk review, paid-without-credit repair, callback/reconciliation observability | silent record mutation that bypasses domain commands |
| `Provider` (`paylab`, `wechat_pay`, `alipay`) | payment action generation, provider trade IDs, async events, queryable provider status | platform truth tables and credit accounting |

First-principles boundary: the provider can report facts, but only the platform decides whether those facts are sufficient to mark an order paid and emit `payment.succeeded`.

### 4.3 Domain Data Model

The current tables are the right core model. The main change is to make them provider-extensible:

| Table | Role | Required change for PayLab first |
| --- | --- | --- |
| `billing_orders` | Business order for a one-time credit package purchase. | No PayLab-specific fields. |
| `payment_intents` | One provider attempt for one order. | Extend provider constraint/type from `wechat_pay | alipay` to `paylab | wechat_pay | alipay`; store PayLab payment intent/payment ID only in provider metadata and `provider_trade_id`. |
| `payment_provider_events` | Immutable inbound provider facts. | Extend provider constraint/type; preserve raw payload hash; store normalized safe payload; dedup by `(provider, provider_event_dedup_key)`. |
| `payment_risk_events` | Manual review and fraud/integrity queue. | Add risk rows for signature failure, amount/currency mismatch, merchant mismatch, duplicate trade, unknown event, and callback/reconciliation disagreement. |
| `outbox_events` | Durable bridge from payment truth to downstream consumers. | Keep `payment.succeeded` as the only credit grant trigger. |
| `credit_ledger_entries` | Credit accounting truth. | No provider-specific fields. Credit grant links back to the platform order/source. |

P0 can keep provider credentials and endpoint URLs in environment config. Add a `payment_provider_accounts` table only when we need multiple merchant accounts, per-organization provider routing, or admin-editable credentials.

### 4.4 Provider Registry

The registry is the only place that knows how to choose a provider adapter.

```ts
type PaymentProvider = "paylab" | "wechat_pay" | "alipay";

interface PaymentProviderRegistry {
  get(provider: PaymentProvider): PaymentProviderAdapter;
  listEnabled(): Array<{
    provider: PaymentProvider;
    productModes: PaymentProductMode[];
    environment: "test" | "sandbox" | "production";
  }>;
}
```

Recommended rollout:

1. `paylab` enabled in local/test/staging.
2. `wechat_pay` and `alipay` disabled until credentials and adapter contract tests pass.
3. Feature flag selects enabled providers per environment; frontend only renders enabled provider modes.

### 4.5 Architecture Options

| Option | What | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| A. PayLab-first provider registry | Add `paylab` as the first external provider adapter, then add WeChat/Alipay adapters to the same seam. | Exercises realistic provider behavior early; keeps platform model stable; fastest path to test env. | PayLab maturity risk; PayLab event model is not identical to WeChat/Alipay. | Recommended. |
| B. First-party local mock only | Build and use only our own local mock provider. | Full control; deterministic; no external dependency. | Less realistic provider console/lifecycle; more custom simulator code. | Keep as fallback or unit-test harness. |
| C. Full payment gateway | Embed a complete gateway/payment system. | Many features already exist. | Owns too much domain; conflicts with our order/credit model; high long-term coupling. | Reject for P0. |

The recommended model is Option A with Option B as a safety valve. PayLab should be easy to replace in one adapter directory; that is the confidence mechanism.

### 4.6 Confidence And Optimization Loop

I am confident in the boundary design. I am not 100% confident that PayLab itself should become a long-term dependency until a spike proves it can satisfy our callback, signing, replay, and CI requirements. The repair is to turn every uncertainty into an adapter contract or acceptance test.

| Hole | Why it can break us | Required repair before implementation is considered solid |
| --- | --- | --- |
| Current code/SQL only allow `wechat_pay` and `alipay`. | `paylab` cannot be stored or routed without weakening constraints. | Migration and TS domain update must add `paylab` everywhere provider values are checked. |
| Current callback parser accepts a platform-shaped JSON body. | WeChat/Alipay/PayLab each send different raw payloads and headers. | Callback endpoint must pass raw body + headers to adapter `verifyCallback` and `normalizeCallback`. |
| Current signature is a single HMAC helper. | Real providers have provider-specific signature/ack rules. | Signature verification and ack response move behind `PaymentProviderAdapter`. |
| PayLab hosted API may be early/unstable. | Test environment can become blocked by third-party changes. | Adapter contract tests, timeout/retry policy, and optional first-party fallback mock. |
| PayLab's canonical model may not match WeChat/Alipay exactly. | We could accidentally design to PayLab rather than real payment providers. | Keep normalized event model provider-neutral; write separate real-provider RFC mappings before enabling real money. |
| Frontend pay action could be treated as success. | Credits could be granted before verified funds. | UI can only show pending/success hints; order paid state must come from callback or reconciliation. |
| Duplicate webhook can double grant credits. | Providers retry; PayLab can deliberately duplicate. | Dedup `payment_provider_events`, outbox unique semantics, and credit consumer inbox idempotency. |
| Paid-without-credit can be hidden. | Async consumer failures become financial support issues. | Admin/Ops paid-without-credit view and repair flow remain required. |
| Provider query/reconciliation missing. | Missed callbacks leave orders stuck. | Add `queryPaymentStatus`, service-level reconciliation, and a scheduled/ops runner before real provider launch. |

After these repairs, the architecture can reach practical 100% confidence: provider uncertainty is contained behind adapters, and money/credit truth remains platform-owned.

## 5. Provider Adapter Contract

The provider adapter should normalize provider differences before data crosses into `Commerce/Payment`.

```ts
type PaymentProvider = "paylab" | "wechat_pay" | "alipay";

type PaymentProductMode =
  | "paylab_card"
  | "paylab_redirect"
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
    }
  | {
      kind: "provider_console";
      provider: PaymentProvider;
      consoleUrl: string;
      expiresAt: string;
      safeMetadata: Record<string, unknown>;
    }
  | {
      kind: "manual_confirm";
      provider: PaymentProvider;
      confirmationMode: "test_api" | "provider_console";
      expiresAt: string;
      safeMetadata: Record<string, unknown>;
    };

interface CreateProviderPaymentIntentInput {
  provider: PaymentProvider;
  productMode: PaymentProductMode;
  merchantOrderNo: string;
  providerIdempotencyKey: string;
  amountMinor: number;
  currency: "CNY";
  subject: string;
  notifyUrl: string;
  returnUrl?: string;
  expiresAt: Date;
  safeMetadata: Record<string, unknown>;
}

interface CreateProviderPaymentIntentResult {
  providerIntentId: string;
  providerPaymentId?: string;
  providerTradeId?: string;
  providerPayloadHash: string;
  providerSafeMetadata: Record<string, unknown>;
  payAction: ProviderPayAction;
}

interface VerifyCallbackResult {
  signatureStatus: "verified" | "invalid";
  rawPayloadHash: string;
  signatureAlgorithm: string;
  signatureTimestamp?: string;
  replayWindowStatus: "within_window" | "outside_window" | "not_applicable";
  providerAccountRef?: string;
  failureCode?: "signature_invalid" | "timestamp_outside_window" | "missing_signature" | "malformed_payload";
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
  providerAccountRef: string;
  providerEventDedupKey: string;
  rawPayloadHash: string;
  signatureStatus: "verified" | "invalid";
  eventOccurredAt?: string;
  safeMetadata: Record<string, unknown>;
}

type NormalizedPaymentStatus =
  | {
      status: "pending" | "succeeded" | "failed" | "closed" | "expired" | "unknown";
      provider: PaymentProvider;
      merchantOrderNo: string;
      providerIntentId?: string;
      providerPaymentId?: string;
      providerTradeId?: string;
      amountMinor?: number;
      currency?: "CNY";
      providerAccountRef?: string;
      observedAt: string;
      safeMetadata: Record<string, unknown>;
    }
  | {
      status: "not_found";
      provider: PaymentProvider;
      merchantOrderNo: string;
      observedAt: string;
    };

interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;

  createPaymentIntent(
    input: CreateProviderPaymentIntentInput,
  ): Promise<CreateProviderPaymentIntentResult>;

  verifyCallback(rawBody: Buffer | string, headers: Record<string, string>): VerifyCallbackResult;

  normalizeCallback(
    rawBody: Buffer | string,
    headers: Record<string, string>,
    verification: VerifyCallbackResult,
  ): NormalizedPaymentEvent | null;

  buildAckResponse(
    result: "accepted" | "rejected",
  ): { status: number; body: string | Record<string, unknown> };

  queryPaymentStatus(input: {
    merchantOrderNo: string;
    providerIntentId?: string;
    providerPaymentId?: string;
    providerTradeId?: string;
  }): Promise<NormalizedPaymentStatus>;

  closePaymentIntent?(input: {
    merchantOrderNo: string;
    providerTradeId?: string;
  }): Promise<{ status: "closed" | "already_final" | "not_found" | "unknown" }>;

  refundPayment?(input: {
    merchantOrderNo: string;
    providerTradeId: string;
    amountMinor: number;
    reason: string;
  }): Promise<{ providerRefundId: string; status: "submitted" | "succeeded" | "failed" | "unknown" }>;
}
```

This contract is intentionally provider-shaped but platform-owned. PayLab, WeChat Pay, and Alipay SDKs can help implement adapters, but they must not define platform domain objects.

`providerIdempotencyKey` is mandatory. It is not the browser's raw `Idempotency-Key`; it is a stable platform-derived key. Preferred sources, in order:

1. Platform idempotency record ID when one exists.
2. Platform payment intent ID.
3. A deterministic hash of `(provider, merchantOrderNo)` only for repair flows where the original record ID is unavailable.

`providerIntentId`, `providerPaymentId`, and `providerTradeId` are provider-side identities. Store the safest durable identity available for future query/reconciliation. For PayLab this will usually be its payment intent/payment ID; for WeChat/Alipay it may be provider transaction IDs that appear only after payment succeeds.

`NormalizedPaymentStatus` is deliberately separate from `NormalizedPaymentEvent`. Query/reconciliation returns observed provider state, not a provider webhook event, so it must not pretend a webhook was received. If reconciliation needs to transition platform money state, the platform records an internal provider fact with a deterministic `reconciliation:{provider}:{merchantOrderNo}:{status}:{providerPayloadHash}` key and `signatureStatus = "unverified"`, then still reuses the same amount/currency/trade validation, risk, outbox, and credit-consumer boundaries. This keeps credit grants tied to durable payment evidence without confusing it with provider-signed callback evidence.

`ProviderPayAction` describes the next user/test action, not proof of payment:

- `qr_code` is expected for WeChat Native QR and any future QR flow.
- `redirect` is expected for Alipay PC Page and any hosted checkout redirect.
- `provider_console` is allowed for PayLab when a hosted developer console or provider payment page should be opened.
- `manual_confirm` is allowed for PayLab/test-only flows where the tester or test harness must confirm/simulate the payment through PayLab APIs or console.

No pay action can mark an order paid. Only verified callback or reconciliation can do that.

Callback verification rules:

- The HTTP route selects the adapter from the route/configured provider, then passes raw body bytes and headers unchanged.
- Each adapter owns canonicalization, signature algorithm, timestamp validation, replay window validation, and ack response format.
- `normalizeCallback` receives `VerifyCallbackResult` so normalized events cannot silently ignore failed verification.
- `providerAccountRef` is the normalized merchant/app/account identity. PayLab, WeChat Pay, and Alipay may derive it from different provider fields.
- Platform validation compares `providerAccountRef`, amount, currency, merchant order number, and provider trade ID before any paid transition.

## 6. Fallback Mock Provider Scenario Model

The fallback mock provider should expose scenario controls instead of requiring engineers to edit platform records by hand.

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

## 7. Fallback Mock Provider HTTP Surface

This section is for a first-party fallback mock provider. PayLab has its own provider-specific API surface and should be accessed only through `PayLabAdapter`. If PayLab satisfies the required scenarios, these routes are optional for P0; if PayLab cannot satisfy a required scenario, the fallback mock should support these capabilities.

```text
POST /mock-payments/intents
GET  /mock-payments/intents/:merchantOrderNo
POST /mock-payments/intents/:merchantOrderNo/scenario
POST /mock-payments/intents/:merchantOrderNo/notify
POST /mock-payments/intents/:merchantOrderNo/replay-notify
```

Recommended local flow:

1. Platform calls `POST /mock-payments/intents` through `PaymentProviderAdapter.createPaymentIntent` only when the active provider is the first-party fallback mock.
2. Mock provider stores a provider-side payment record keyed by `merchantOrderNo`.
3. Mock provider returns a QR or redirect action.
4. Test or local UI chooses a `MockProviderScenario`.
5. Mock provider sends a signed async callback to the platform `notifyUrl`.
6. Platform records and processes the callback through the same `processPaymentCallback` path used by real providers.

The fallback mock provider must persist enough local state for query and replay during a local process lifetime. It does not need production-grade durability.

## 8. Platform Interface Constraints

These rules are non-negotiable for both mock and real providers:

1. `POST /api/billing/orders` and payment intent creation continue to require `Idempotency-Key`.
2. Provider callback processing stores `payment_provider_events` before trusting side effects.
3. Success callback emits `payment.succeeded` through outbox; it does not directly write `credit_ledger_entries`.
4. Frontend redirect state, QR page state, or local UI success cannot grant credits.
5. Provider event deduplication is based on provider event identity.
6. Provider trade ID reuse must become `payment_risk_events` and manual review, not a rollback that hides evidence.
7. Amount, currency, provider account identity, merchant order number, and provider trade ID must be validated before marking an order paid.
8. Refund callbacks are payment facts. They must not delete original payment or credit ledger facts.
9. Provider raw payloads may be hashed and redacted. Safe metadata can be stored, but secrets and full sensitive payloads should not leak into UI responses.
10. Provider callback HTTP handlers must preserve raw body bytes and headers until the selected adapter finishes signature verification and normalization.

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

## 10. Open-Source Research Result

Research date: 2026-05-29.

First-principles conclusion: our core problem is not "find a payment project." It is "preserve the future production boundary while we simulate an external provider locally." A candidate is valuable only if it helps us exercise provider-like HTTP calls, signed callbacks, async delivery, replay, and failure injection without taking ownership of our order, intent, provider event, risk, outbox, or credit ledger records.

No reviewed open-source project is a perfect local WeChat Pay/Alipay simulator for this project. PayLab is still the best first provider candidate because it is explicitly a Mock PSP, exposes stateful payment intents, sends webhooks, supports idempotency, and is designed for testing payment flows. The long-term recommendation is therefore:

1. Add PayLab as the first external test provider through `PayLabAdapter`.
2. Keep a first-party thin mock only as fallback or low-level unit-test harness.
3. Keep official provider SDKs inside future `wechat_pay` and `alipay` adapters.
4. Reject any candidate that forces a second payment domain model into the platform.

### 10.1 Candidate Shortlist

| Candidate | Category | Useful for | Fit | Main risk | Verdict |
| --- | --- | --- | --- | --- | --- |
| [PayLab Mock PSP API](https://github.com/yilin-sai/paylab-ui) | Payment Service Provider simulator | Payment intents, payments, webhooks, idempotency, configurable webhook delay/repeat. | High conceptual fit. | Early project: no releases and no community signal at review time. Need hosted/self-host/API audit before relying on it. | Use as first replaceable test provider behind `PayLabAdapter`; do not treat it as production backbone. |
| [WireMock](https://wiremock.org/) | Generic HTTP/service simulator | Provider-like endpoints, webhooks/callbacks, templating, delays, stateful scenarios, fault simulation. | Strong transport fit. | Java-based; payment signatures and provider-specific payloads still need our code/extensions. | Best generic OSS harness if the team wants an off-the-shelf simulator shell. |
| [MockServer](https://www.mock-server.com/) | Generic HTTP/HTTPS mock and proxy | Expectations, callbacks, invalid responses, request verification, record/replay. | Medium-high test fit. | Heavier than our P0 need; domain behavior remains custom. | Good CI/test-infra candidate, not the payment mock domain itself. |
| [Mockoon](https://mockoon.com/) | Local mock API tool | Fast local HTTP mock APIs, CLI-friendly developer workflow. | Medium DX fit. | Async signed callback/replay behavior likely needs custom glue. | Good for demos and local endpoints; weaker for payment lifecycle correctness. |
| [Svix](https://github.com/svix/svix-webhooks) | Open-source webhook service | Webhook signing, delivery, retry, replay, operational UI patterns. | Medium future fit. | Solves "we send webhooks to others," while provider callbacks are "provider sends webhooks to us." Operationally larger than P0. | Reference for webhook durability/replay; not P0 mock provider. |
| [Convoy](https://github.com/frain-dev/convoy) | Open-source webhook gateway | Webhook routing/delivery gateway patterns. | Medium future fit. | Same direction mismatch as Svix; adds infrastructure weight. | Reference only unless we later expose outbound webhooks. |
| [stripe-mock](https://github.com/stripe/stripe-mock) | Official Stripe API mock | Shape of an official provider API mock and fast deterministic test server. | Low provider fit. | Stripe-specific; not WeChat/Alipay; cannot decide our payment model. | Design reference only. |
| [DaxPay](https://github.com/dromara/dax-pay) | Full payment gateway | Real payment gateway patterns, channel abstraction, merchant/admin features. | Low boundary fit for P0. | Owns too much payment domain: merchants, gateway payment records, refunds, reconciliation, admin workflows. | Do not embed as local mock. Only consider later as a separate external gateway strategy. |
| [Yansongda Pay](https://github.com/yansongda/pay) | Multi-provider payment SDK | WeChat/Alipay request and callback implementation ideas. | Medium adapter-reference fit. | PHP ecosystem; SDK wrapper must not leak into platform domain. | Adapter reference only when official SDKs are insufficient. |
| [IJPay](https://github.com/Javen205/IJPay) | Multi-provider payment utility | WeChat/Alipay integration examples. | Medium adapter-reference fit. | Java ecosystem; not a mock provider. | Adapter reference only. |
| [Alipay official Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all) | Official provider SDK | Real Alipay adapter implementation, signing, verification, page pay. | High real-provider fit. | Not a simulator. | Primary source for future Alipay adapter. |
| [WeChat Pay APIv3 official SDKs](https://github.com/wechatpay-apiv3) | Official provider SDKs/spec examples | Real WeChat APIv3 adapter implementation, signing, notification verification semantics. | High real-provider fit. | Official Node coverage may be weaker than Go/PHP/Java examples; still not a simulator. | Primary source for future WeChat adapter semantics. |

### 10.2 Recommended Options

#### Option A: PayLab-first provider adapter

Recommendation: choose this for P0.

What:

- Add `paylab` as a first-class `PaymentProvider`.
- Implement `PayLabAdapter` behind `PaymentProviderAdapter`.
- Use PayLab to create provider-side payment intents, confirm/simulate payments, receive webhooks, and test duplicate/delayed delivery.
- Keep PayLab payloads and Stripe-like event names inside the adapter.

Why:

- It exercises the external-provider shape before real WeChat/Alipay credentials exist.
- It tests the async webhook path instead of a fake synchronous success path.
- It keeps `billing_orders`, `payment_intents`, `payment_provider_events`, `payment_risk_events`, `outbox_events`, and `credit_ledger_entries` platform-owned.
- It creates a provider seam that WeChat Pay and Alipay can later reuse.

Pros:

- Most realistic test-environment provider candidate.
- Gives QA and developers a provider console/lifecycle instead of only direct callback injection.
- Tests idempotent provider calls, stateful provider status, and webhook behavior early.
- Forces us to design raw callback verification and normalization correctly.

Cons:

- PayLab is early and may change.
- Its current public examples are Stripe-like, not WeChat/Alipay-like.
- Hosted API usage may require care around test data and availability.
- Some edge cases may still require our own fallback mock.

How:

1. Add the `PaymentProviderAdapter` seam first.
2. Add `paylab` to provider schema constraints, TypeScript types, and API validation.
3. Implement `PayLabAdapter.createPaymentIntent`, `verifyCallback`, `normalizeCallback`, `buildAckResponse`, and `queryPaymentStatus`.
4. Register PayLab webhook endpoint as `/api/payment-provider-callbacks/paylab`.
5. Keep `/api/billing/payment-callback/mock` only as a compatibility route that exercises callback processing, not as the normal test-environment flow.

PayLab admission gate:

- Create provider intent with platform idempotency key and safely retry without duplicate provider payments.
- Confirm or simulate payment in PayLab.
- Receive and verify a signed webhook from PayLab.
- Replay the same webhook and prove platform dedup prevents duplicate outbox/credit grants.
- Trigger delayed webhook delivery.
- Query provider status and repair a local `unknown` intent.
- Run the flow in CI or a documented test environment with isolated test data.

If any gate cannot be passed within a bounded spike, keep the adapter seam and switch the test environment to the first-party fallback mock until PayLab is mature enough.

#### Option B: First-party thin local provider simulator

Recommendation: keep as fallback, not as the primary P0 provider.

What:

- A small local service, for example `apps/mock-payment-provider` or `apps/backend/src/entrypoints/mock-payment-provider-dev-server.ts`.
- Exposes the mock HTTP surface from section 7.
- Stores provider-side intents in memory or a local dev file.
- Signs callbacks with the same callback secret/config shape used by `Commerce/Payment`.
- Implements required edge scenarios directly when PayLab cannot.

Why:

- It prevents PayLab maturity or availability from blocking development.
- It gives us exact control over negative cases such as amount mismatch and invalid signature.

Pros:

- Highest local determinism.
- Easy to run in CI with no external dependency.
- Can target current risk tests precisely.

Cons:

- Less realistic than PayLab as a PSP.
- More custom simulator behavior to maintain.

How:

1. Implement only if PayLab cannot satisfy a required edge case within a bounded spike.
2. Keep it behind the same adapter interface.
3. Never let it write platform tables directly.

#### Option C: WireMock or MockServer as the simulator shell

Recommendation: useful later if we need a generic external-service simulator platform.

What:

- WireMock or MockServer handles endpoint stubs, state, delays, failure responses, request verification, and async callbacks.
- Our repository still owns provider payload builders, signature helpers, and scenario definitions.

Why:

- It can speed up HTTP-level simulation and CI isolation if we later simulate many providers.

Pros:

- Mature generic mocking ecosystem.
- Good callback, delay, state, and fault primitives.
- Can be reused for other future provider simulations.

Cons:

- Extra runtime and configuration surface.
- Provider-specific signing still requires our code.
- Less natural for a TypeScript-only payment-domain workflow than PayLab.

How:

1. Spike only after PayLabAdapter exists.
2. Use it as transport infrastructure only.
3. Do not let it decide payment domain events.

#### Option D: Full payment gateway such as DaxPay

Recommendation: reject for P0 local mock.

What:

- A full payment gateway with its own payment records, merchant/admin concepts, channel management, refunds, reconciliation, and operations UI.

Why not:

- It solves a larger problem than our P0 mock. If embedded now, it would compete with our platform's commerce/payment and credit boundaries.

Pros:

- Rich real-world payment gateway ideas.
- Useful as a reference if the company later wants a standalone payment gateway strategy.

Cons:

- Too much domain gravity.
- Higher operational cost.
- Easy to let gateway objects leak into platform records.
- Does not improve the key local guarantee: our platform must process provider callbacks and outbox/credit grants through its own domain model.

How:

- Do not embed. Read only for channel abstraction, admin UX, and reconciliation ideas.

### 10.3 Open-Source Selection Gates

Before any candidate is embedded, it must pass these gates:

1. License allows commercial internal use and source redistribution as needed.
2. Can run locally without cloud signup, or cloud usage is optional and not required for CI.
3. Can be launched from an npm script, Docker Compose service, or documented one-command dev flow.
4. Does not require owning `billing_orders`, `payment_intents`, `payment_provider_events`, `payment_risk_events`, `credit_ledger_entries`, user, organization, or package tables.
5. Can generate or delegate custom callback signatures.
6. Can simulate delayed callback, duplicate callback, invalid signature, amount mismatch, provider query, and provider-side unknown state.
7. Supports deterministic tests and isolated state reset between tests.
8. Lets the platform keep `PaymentProviderAdapter` as the only provider-facing boundary.
9. Has enough maintenance signal for the role it plays. For a production backbone, require releases, recent commits, and issue responsiveness. For PayLab as a replaceable test provider, require the PayLab admission gate above. For reference-only usage, a weaker signal is acceptable.
10. Can be removed without changing platform order, payment event, outbox, or credit ledger semantics.

Hard fail: if the candidate's easiest integration path is "mock marks our order paid" or "mock writes our ledger," it is disqualified.

### 10.4 Confidence Loop

I do not claim 100% confidence by assuming a third-party project will fit. I reach practical 100% confidence in this design by narrowing the claim: this document is sufficient for open-source screening and prevents the dangerous integration mistakes for the current codebase.

| Potential hole | Why it matters | Repair in this design | Required proof |
| --- | --- | --- | --- |
| Full gateway gets embedded and owns payment domain. | It would split source of truth between the gateway and our `Commerce/Payment`. | Hard fail selection gate; DaxPay-class systems are reference-only for P0. | Architecture review shows platform tables remain authoritative. |
| Mock success becomes synchronous frontend state. | Real payments are async; frontend success is not money received. | Mock provider must send async callback; UI state is UX only. | Smoke test proves no credits before callback and credit consumer. |
| Signature path differs from production. | A mock that bypasses signing cannot catch real callback integration mistakes. | Mock must sign callbacks; invalid signature is a required scenario. | Tests cover verified and invalid signatures. |
| Duplicate callbacks create duplicate credits. | Providers retry notifications; this is a common production failure. | Provider event dedup key and outbox/inbox idempotency stay platform-owned. | Duplicate notify test yields one paid transition and one credit grant. |
| Amount mismatch marks order paid. | Money integrity failure. | Amount/currency/order/provider trade ID validation is non-negotiable. | Amount mismatch test records risk and does not mark paid. |
| Provider trade ID is reused across orders. | Could indicate replay, provider bug, or fraud. | Reuse enters `payment_risk_events` and manual review. | Duplicate trade test records risk. |
| Paid-without-credit is hidden. | Admin cannot repair failed async grant. | Commerce emits outbox only; Credit/Billing writes ledger; Admin/Ops sees paid-without-credit. | Fault-injection test leaves paid order visible without ledger. |
| Open-source project leaks mock-only fields into domain. | Future real adapter becomes harder. | Only `PaymentProviderAdapter` sees provider-specific fields; domain stores normalized event and safe metadata. | Type/API review shows mock-only data is confined to adapter/safe metadata. |
| Official provider semantics are guessed. | WeChat/Alipay callback and signing details are sharp edges. | Use official SDKs/docs as adapter source of truth; community SDKs are implementation references only. | Real adapter RFC maps every provider field to `NormalizedPaymentEvent`. |

After these repairs, the recommended P0 path is stable: use PayLab as the first external test provider, keep a first-party fallback mock for deterministic edge cases, and keep real provider details inside adapters.

## 11. Provider-Specific Direction

### 11.1 WeChat Pay

Target first product mode: Native QR.

The future WeChat adapter should map platform payment intents to WeChat-style native QR payment creation and async notification processing. The PayLab adapter does not need to mimic every WeChat field; it needs to prove that the platform callback, dedup, risk, outbox, and credit-grant chain is provider-agnostic.

Use official APIv3 semantics and official SDK repositories as the source of truth for real adapter design. Node community libraries may be useful as implementation references, but they must not decide our domain model.

### 11.2 Alipay

Target first product modes: PC page pay first, QR code fallback if account/API constraints make QR pre-create more suitable.

The future Alipay adapter should map platform payment intents to Alipay page/QR payment creation and async notification processing. The PayLab adapter should normalize a redirect/card-like payment action in the same `ProviderPayAction` shape, without leaking PayLab or Stripe-like event names into platform domain code.

Prefer the official Node SDK `alipay-sdk-nodejs-all` for real adapter research. Keep SDK-specific request names and signature handling inside the Alipay adapter.

## 12. Acceptance Checklist For This Design

Before an open-source project is accepted for local integration, the reviewer must answer:

- What part of the desired provider or fallback mock capability does it implement?
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

## 13. Recommended First Integration Slice

The first implementation should be small:

1. Introduce `PaymentProviderAdapter` and `PaymentProviderRegistry` inside `Commerce/Payment`.
2. Add provider `paylab` to schema constraints, TypeScript types, and API validation.
3. Add runtime config for PayLab base URL, API key, webhook signing secret, and callback URL.
4. Implement `PayLabAdapter` for create intent, verify callback, normalize callback, ack response, and query status.
5. Add provider callback route `/api/payment-provider-callbacks/:provider` that passes raw body and headers to the adapter.
6. Keep `/api/billing/payment-callback/mock` only as a compatibility/testing route.
7. Add HTTP smoke that proves order -> intent -> PayLab callback -> provider event -> outbox -> credit consumer.
8. Add scenario tests for duplicate callback, invalid signature, amount mismatch, payment failure, query/reconciliation, and paid-without-credit repair visibility.
9. Add provider-create failure tests:
   - provider create timeout or ambiguous response marks intent `unknown`;
   - retry uses the same `providerIdempotencyKey` and does not create a second provider payment;
   - provider accepted but local update failed is repaired by `queryPaymentStatus` using `providerIntentId` or the original idempotency key.

Current implementation status: items 1-6 and the service-level query/reconciliation part of item 8 are implemented. Reconciliation now covers missed success callback recovery, amount mismatch risk routing, and already-paid idempotency. Remaining before real provider launch: HTTP smoke for full browser/test-provider flow, scheduled or ops-triggered reconciliation runner, and a live PayLab admission gate.

Do not integrate PayLab or any other provider before this adapter seam exists. The seam is the architecture; PayLab is the first adapter implementation, not the payment domain.

Recommended spike order:

1. Implement the seam and `paylab` provider value end to end.
2. Run a bounded PayLab spike: create intent -> confirm/simulate payment -> signed webhook -> duplicate/delayed webhook -> provider query.
3. Stop or fall back to first-party mock if PayLab cannot produce a signed delayed callback and duplicate replay against our callback endpoint within one development day.

## 14. References For Research

- [PayLab homepage](https://www.paylabo.dev/)
- [PayLab quick start](https://www.paylabo.dev/docs/quickstart)
- [PayLab webhook guide](https://www.paylabo.dev/docs/webhook)
- [PayLab Mock PSP API](https://github.com/yilin-sai/paylab-ui)
- [WireMock webhooks and callbacks](https://wiremock.org/docs/webhooks-and-callbacks/)
- [WireMock stateful behavior](https://wiremock.org/docs/stateful-behaviour/)
- [WireMock simulating faults](https://wiremock.org/docs/simulating-faults/)
- [MockServer](https://www.mock-server.com/)
- [Mockoon](https://mockoon.com/)
- [Svix open-source webhooks service](https://github.com/svix/svix-webhooks)
- [Convoy webhook gateway](https://github.com/frain-dev/convoy)
- [Stripe mock server](https://github.com/stripe/stripe-mock)
- [DaxPay open-source payment gateway](https://github.com/dromara/dax-pay)
- [Yansongda Pay](https://github.com/yansongda/pay)
- [IJPay](https://github.com/Javen205/IJPay)
- [Alipay official Node SDK](https://github.com/alipay/alipay-sdk-nodejs-all)
- [WeChat Pay official APIv3 GitHub organization](https://github.com/wechatpay-apiv3)
- [WeChat Pay official Go SDK](https://github.com/wechatpay-apiv3/wechatpay-go)
- [WeChat Pay official PHP SDK](https://github.com/wechatpay-apiv3/wechatpay-php)
- Current design baseline: `docs/architecture/p0-commerce-payment-design.md`
- Current payment service: `apps/backend/src/modules/commerce-payment/commerce-payment.service.ts`
- Current credit consumer: `apps/backend/src/modules/credit-billing/payment-succeeded-credit-consumer.service.ts`
