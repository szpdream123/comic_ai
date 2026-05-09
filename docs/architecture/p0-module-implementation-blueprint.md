# P0 Module Implementation Blueprint

> Status: M0 frozen / Engineering Landing Blueprint
> Date: 2026-05-08
> Inputs: PRD, system architecture, state dictionary, schema draft, execution/recovery spec, commerce/payment design
> Purpose: turn architecture into a module-level implementation blueprint that developers can build, test, and coordinate against.
> Freeze record: `docs/architecture/p0-m0-contract-freeze.md`

This document is not another architecture overview. It is the bridge from architecture to development.

It answers:

- Who owns which business facts?
- Which modules exist and what do they not own?
- Which flows must work first?
- Which data can be written by whom?
- Which interfaces and events are the module contracts?
- How do failures, retries, duplicate calls, and repairs behave?
- What should be built first, and how do we know it is done?

## 0. Engineering Principles

1. One business fact has one owner.
2. Cross-module writes happen through domain commands or durable events, not direct table mutation.
3. PostgreSQL owns durable truth; Redis/BullMQ are dispatch mechanisms.
4. UI hiding is not authorization.
5. Frontend success states are never financial or execution truth.
6. Every expensive or external side effect has an idempotency strategy.
7. Every P0-B commercial path must have Admin/Ops visibility.
8. P0-A optimizes for core creation loop learning; P0-B adds commercial/reliability guarantees.

## 1. Domain Dictionary

| Term | What It Is | What It Is Not | Created By | Modified By | Key States | Relationships |
| --- | --- | --- | --- | --- | --- | --- |
| User | Human login identity. | Organization, payer, creator role. | Identity/Auth. | Identity/Auth. | `active`, `disabled`. | May have memberships in organizations/workspaces. |
| Organization | Tenant and billing/quota boundary. | User profile. | Organization. | Organization/Admin-Ops. | `active`, `suspended`, `archived`. | Owns workspaces, projects, credits, orders. |
| Workspace | Work grouping inside an organization. | Tenant boundary by itself. | Organization. | Organization. | `active`, `archived`. | Contains projects; memberships may be scoped to it. |
| Membership | User's role in an organization/workspace. | Authentication session. | Organization. | Organization. | `active`, `invited`, `disabled`. | Grants capabilities through role/capability rules. |
| Capability | Concrete permission checked at command/query boundaries. | UI flag. | Organization/Auth policy. | Code/config by platform. | N/A. | Used by `assertCapability()`. |
| Project | Creator-facing work container and lifecycle aggregate. | Workflow execution record. | Project. | Project. | `project_phase` plus readiness flags. | Owns scripts, episodes, assets, shots, exports. |
| Script | Source story input and parsed structure input. | Raw file storage object. | Project. | Project. | `draft`, `ready`, `parsing`, `parsed`, `failed`, `archived`. | Produces episodes, assets, shots through workflows. |
| Episode | Parsed narrative section. | Workflow state. | Project. | Project. | Mostly immutable after parse unless edited. | Contains shots. |
| Asset | Business meaning of a reusable or generated media object. | Binary blob. | Asset. | Asset. | `draft`, `pending`, `confirmed`, `needs_fix`, `archived`. | Points to immutable asset versions. |
| AssetVersion | Immutable binary/versioned output metadata. | Current business asset state. | Asset/Worker finalization. | Only safe metadata enrichment/soft-delete. | Immutable. | Linked to source task/attempt/provider request. |
| Shot | Storyboard unit and generation intent target. | Image/video file. | Shot. | Shot. | `content_status`, `image_status`, `video_status`. | References assets and current image/video versions. |
| Workflow | Business-level long-running process. | One provider call. | Workflow/Task. | Workflow/Task aggregation. | `queued`, `running`, `succeeded`, `failed`, `partial_succeeded`, `result_unknown`, `manual_review_required`, etc. | Contains tasks. |
| Task | Logical executable unit inside a workflow. | Concrete provider attempt. | Workflow/Task. | Workflow/Task. | Canonical task states. | Has attempts; may reserve/consume credits. |
| Attempt | One concrete execution try. | Business task intent. | Workflow/Task worker claim. | Worker finalization/recovery. | `running`, `succeeded`, `failed`, `result_unknown`, etc. | Links to provider request and asset output. |
| ProviderRequest | Durable record of an external model provider call. | Task truth. | ModelGateway before external submission. | ModelGateway/reconciliation. | `submitted`, `accepted`, `succeeded`, `failed`, `result_unknown`, `manual_review_required`. | Links attempt to provider IDs/cost. |
| CreditPackage | Sellable one-time credit SKU. | Subscription plan. | Commerce/Payment. | Commerce/Payment/Admin. | `active`, `inactive`, `archived`. | Snapshotted into orders. |
| Order | Organization's purchase intent for a credit package. | Payment provider request or credit balance. | Commerce/Payment. | Commerce/Payment. | `pending_payment`, `paid`, `closed`, `expired`, refund states. | Has payment intents; causes credit grant event after paid. |
| PaymentIntent | One attempt to pay an order through WeChat Pay/Alipay. | Order, invoice, or credit grant. | Commerce/Payment. | Commerce/Payment callback/reconciliation. | `created`, `submitted`, `succeeded`, `failed`, `closed`, `expired`, `unknown`. | Belongs to one order. |
| PaymentProviderEvent | Raw/normalized provider callback fact. | User-facing payment status by itself. | Commerce/Payment webhook. | Commerce/Payment processing metadata only. | `received`, `processed`, `duplicate`, `rejected`, `unmatched`, `manual_review_required`. | Drives payment state after verification. |
| Refund | Cash reversal fact. | Credit reversal by itself. | Commerce/Payment Admin/Ops or provider event. | Commerce/Payment. | `pending`, `submitted`, `succeeded`, `failed`, `unknown`, `manual_review_required`. | May require credit reversal and invoice red-letter handling. |
| InvoiceRequest | Customer invoice/fapiao request. | Tax authority invoice record. | Commerce/Payment. | Commerce/Payment/Admin/Ops. | `requested`, `issued`, `rejected`, `red_letter_required`, `red_letter_issued`. | Links to paid order. |
| InvoiceRecord | Platform metadata for issued/reversed invoice. | Payment or credit fact. | Commerce/Payment/Admin/Ops. | Commerce/Payment/Admin/Ops. | `issued`, `red_letter_issued`, `voided`, `manual_review_required`. | Blocks/flags refunds. |
| CreditLedgerEntry | Append-only user-facing credit accounting fact. | Order/payment/cost record. | Credit/Billing. | Append-only. | `grant`, `reservation`, `consume`, `release`, `adjustment`. | Source may be payment order, admin grant, task allocation. |
| CreditReservation | Workflow-level credit hold envelope. | Cash charge. | Credit/Billing. | Credit/Billing. | `active`, `partially_settled`, `settled`, `released`, `manual_review_required`. | Contains task allocations. |
| ProviderCostEntry | Internal provider cost fact. | User-facing credit charge. | Credit/Billing/ModelGateway fact ingestion. | Append-only. | normal/abnormal. | Links provider request/attempt. |
| Export | Package generation intent and manifest. | Object storage implementation. | Export. | Export/Worker. | queued/running/succeeded/failed family. | Produces export package asset. |
| AuditEvent | Who did what, when, to what target. | Economic ledger. | Audit module through domain calls. | Append-only. | Immutable. | Links actor, org, target, event type. |
| OutboxEvent | Durable cross-module event to deliver. | Direct synchronous RPC guarantee. | Domain transaction. | Dispatcher metadata. | `pending`, `published`, `failed`. | Consumed through inbox. |
| InboxEvent | Consumer-side duplicate guard. | Business fact by itself. | Event consumer. | Append-only/no-op on duplicate. | consumed. | Unique `(consumer_name, outbox_event_id)`. |

## 2. Module Boundary Map

Modules are business capability modules, not controller/service/DAO layers.

```text
Identity/Auth -> Organization -> Application Commands
Application Commands -> Project / Asset / Shot / Workflow-Task / Commerce-Payment
Workflow-Task -> ModelGateway / Credit-Billing / Asset / Shot / Export / Quality-Review
Commerce-Payment -> Credit-Billing via outbox events
All modules -> Audit for sensitive events
Admin-Ops -> domain commands for writes, read models for diagnosis
Storage and provider SDKs remain infrastructure adapters only
```

## 3. Module Responsibility Cards

| Module | Core Responsibility | Non-Responsibility | Owns Data | Depends On | Provides |
| --- | --- | --- | --- | --- | --- |
| Identity/Auth | Login, sessions, auth adapter boundary. | Org policy, project permissions. | `users`, sessions, credentials/auth events. | None for core auth. | `resolveAuthenticatedUser`, session guards. |
| Organization | Tenant hierarchy, memberships, capabilities. | Workflow/project state. | `organizations`, `workspaces`, `memberships`, invites later. | Identity/Auth. | `resolveActorContext`, `assertCapability`. |
| Project | Project lifecycle, scripts, episodes. | Provider calls, task execution. | `projects`, `scripts`, `episodes`. | Organization, Workflow/Task. | Project commands/queries, parse/split workflow creation. |
| Asset | Business asset records and immutable versions. | Binary storage SDK ownership. | `assets`, `asset_versions`. | Storage, Workflow/Task facts. | Create asset/version, move current pointer safely. |
| Shot | Storyboard content, shot status, current image/video pointers. | Model provider calls, binary storage. | `shots`, `shot_asset_links`. | Asset, Workflow/Task. | Shot edit, generation intent, pointer finalization. |
| Workflow/Task | Long-running workflow/task/attempt execution truth. | Final business state truth. | `workflows`, `tasks`, `task_attempts`. | Project/Shot/Asset/Credit by command/event. | Task claim, attempt lifecycle, finalization coordination. |
| ModelGateway | Model provider adapters, provider requests, routing/error normalization. | Creator state, credit policy. | `provider_requests`, `provider_capabilities`. | Workflow/Task. | Submit/lookup/cancel provider requests. |
| Commerce/Payment | Credit package purchase, orders, payment intents, callbacks, refunds, invoice metadata, payment risk/reconciliation. | Credit balance, generation consumption, tax policy decisions. | Commerce/payment tables. | Organization, Credit via events, Audit. | Create order/payment intent, process callback, reconcile payment. |
| Credit/Billing | User-facing credits, reservations, provider cost ledger, balance read model. | Payment callbacks, provider HTTP calls. | `credit_ledger_entries`, reservations, allocations, provider costs. | Workflow/Task, Commerce events, ModelGateway facts. | Reserve, consume, release, grant, adjust, reconcile balance. |
| Quality/Review | Quality facts and review requirements. | Provider routing, storage. | `quality_reviews`, calibration review facts. | Asset/Shot/Workflow. | Mark review result, gate calibration. |
| Export | Export workflows/manifests/package facts. | Storage implementation. | `exports`, manifests, export asset links. | Project/Asset/Storage/Workflow. | Create/export package workflow. |
| Admin/Ops | Operational diagnosis and controlled actions. | Owning domain facts. | Read models, admin action metadata if needed. | All domain commands/queries. | Retry, manual settlement, provider disable, payment review. |
| Audit | Sensitive operation trail. | Economic accounting. | `audit_events`. | Actor context/domain events. | Append audit record. |
| Storage | Signed URLs and storage adapter. | Business asset meaning. | Storage config/metadata helpers. | Organization authorization. | Upload/download signed URL after tenant check. |
| Notification | Future user notifications. | Workflow truth. | Notification records future. | Domain events. | Send task/payment/export notifications later. |

## 4. Core Business Flows

### 4.1 Login and Authorization Context

Normal path:

1. User authenticates through Identity/Auth.
2. API guard resolves user session.
3. Organization resolves actor context: organization, workspace, role, capabilities.
4. Command/query calls `assertCapability()` before reading/writing scoped data.
5. Repository/query helper receives explicit tenant scope.

Failure path:

- No session -> `401 unauthenticated`.
- No membership/capability -> `403 forbidden`.
- Disabled user/org/member -> `403 forbidden` or org suspended business error.
- Direct object URL access -> backend denies signed URL creation.

Acceptance:

- Every command has a capability.
- Every tenant-owned query requires `organization_id`.
- UI hiding is not counted as security coverage.

### 4.2 Creator Core Loop: Project to Storyboard Assets

Normal path:

1. Project creates project/script.
2. Project creates script parse workflow with idempotency key.
3. Workflow/Task persists workflow/tasks and dispatches through outbox.
4. Worker claims task and creates attempt.
5. ModelGateway creates provider request before external call if provider is used.
6. Worker finalizes in one transaction: task/attempt state, generated facts, asset versions, shot/project updates, credit events/outbox, audit.
7. UI queries PostgreSQL state, never BullMQ-only state.

Failure path:

- Duplicate request -> return existing workflow/task.
- Provider accepted then timeout/crash -> `result_unknown`, no blind retry.
- Worker crash before finalization -> lease repair.
- Partial batch failure -> child task state drives workflow aggregation.

Acceptance:

- Refreshing page never creates duplicate expensive work.
- Regeneration creates new versions and does not overwrite old assets.
- A workflow cannot be terminal while child task/credit/provider settlement is unresolved.

### 4.3 Generation Credit Reservation and Settlement

Normal path:

1. Generation command estimates credits.
2. P0-A checks available balance synchronously.
3. P0-B creates reservation envelope and task allocations in the same transaction as workflow/task creation.
4. On task success, Credit consumes the task allocation once.
5. On safe failure/cancel, Credit releases the allocation once.
6. Unknown/manual review keeps allocation reserved until settlement.

Failure path:

- Insufficient credits -> no task is created.
- Duplicate finalization -> unique settlement constraint prevents double consume/release.
- Balance read model drift -> reconciliation recomputes from ledger.

Acceptance:

- Concurrent generation cannot oversell in P0-B.
- Each task allocation has exactly one final settlement.

### 4.4 Credit Purchase and Payment-to-Grant

Normal path:

1. User with `billing:purchase` chooses credit package.
2. Commerce creates order with package snapshot and idempotency key.
3. Commerce creates payment intent for WeChat Pay or Alipay.
4. Provider callback is verified and normalized.
5. Commerce marks order paid and emits `payment.succeeded`.
6. Credit consumes event idempotently and writes `grant` ledger entry.
7. Balance read model updates.

Failure path:

- Frontend success redirect without callback -> no credit grant.
- Duplicate callback -> provider event/inbox/ledger uniqueness prevents duplicate grant.
- Paid order but Credit consumer crashes -> paid-without-credit repair reprocesses idempotently.
- Amount/currency/merchant mismatch -> risk event + manual review, no paid transition.

Acceptance:

- One paid order creates at most one credit grant.
- Provider callback can be replayed safely.

### 4.5 Refund, Invoice, and Payment Reconciliation

Normal path:

1. Admin/Ops requests refund with reason.
2. Commerce checks order, payment, credit grant, available credits, invoice state.
3. If credits are unused/recoverable, Credit writes append-only reversal/adjustment.
4. Commerce submits refund and records provider result.
5. Refund success emits `payment.refund.succeeded`.

Failure path:

- Consumed credits and insufficient available balance -> manual review or partial refund only.
- Invoice issued -> refund blocked/flagged until red-letter/reversal handling.
- Provider refund unknown -> query provider, no blind resubmit.
- Daily provider report mismatch -> reconciliation item, not silent correction.

Acceptance:

- Refund never creates automatic negative balance in P0-B.
- Issued invoice blocks automatic refund until finance-approved reversal state exists.

### 4.6 Admin/Ops Recovery

Normal path:

1. Admin/Ops reads cross-module diagnosis views.
2. Operator executes a domain command: retry task, settle unknown, disable provider, reconcile payment, refund order.
3. Domain module writes authoritative facts and audit event.

Failure path:

- Operator lacks capability -> denied.
- Manual action conflicts with current state -> rejected or manual review remains.
- Repair job repeats -> idempotent no-op or same outcome.

Acceptance:

- No Admin/Ops write bypasses domain modules.
- Every manual settlement/refund/provider disable has audit trail.

## 5. Data Ownership Matrix

| Data / Fact | Owner | Writers | Readers | Consistency |
| --- | --- | --- | --- | --- |
| Users/sessions | Identity/Auth | Identity/Auth | API guards, Organization | Strong for auth. |
| Organizations/workspaces/memberships | Organization | Organization/Admin domain commands | All modules through actor context | Strong for permission checks. |
| Projects/scripts/episodes | Project | Project | Shot, Workflow, Export, Admin/Ops | Strong within command transaction. |
| Assets/asset versions | Asset | Asset/Worker finalization via Asset commands | Shot, Export, UI, Admin/Ops | Strong for pointer updates. |
| Shots/status/current pointers | Shot | Shot/Worker finalization via Shot commands | Project, Workflow, UI | Strong for current pointer safety. |
| Workflows/tasks/attempts | Workflow/Task | Workflow/Task workers/repair | Project, Shot, Admin/Ops | Strong execution truth. |
| Provider requests | ModelGateway | ModelGateway | Workflow/Task, Credit, Admin/Ops | Strong before external side effect. |
| Credit packages/orders/payment intents/events/refunds/invoices | Commerce/Payment | Commerce/Payment | Credit via events, Admin/Ops, UI queries | Strong cash/payment truth; credit grant eventual. |
| Credit ledger/reservations/provider costs | Credit/Billing | Credit/Billing only | Commerce, Workflow, Admin/Ops, UI | Strong ledger; read models derived. |
| Quality reviews/calibration decisions | Quality/Review | Quality/Review | Shot, Project, Admin/Ops | Strong gating facts. |
| Export manifests/packages | Export | Export | Project, Asset, UI | Strong export facts. |
| Audit events | Audit | Audit via domain calls | Admin/Ops/security | Append-only. |
| Outbox/inbox | Shared infrastructure with domain ownership of event content | Domain transaction / consumer | Dispatcher/consumers | At-least-once delivery, idempotent effects. |

Rule: modules may read through sanctioned queries/read models, but only owner modules write authoritative facts.

## 6. Interface Contract Inventory

### 6.1 Command Contracts

| Command | Provider | Callers | Idempotency | Permission | Output |
| --- | --- | --- | --- | --- | --- |
| `CreateProject` | Project | Web API | `project.create` key | `project:create` | `project_id`. |
| `ParseScript` | Project -> Workflow/Task | Web API | `script.parse` key | `project:edit` | `workflow_id`. |
| `SplitShots` | Project/Shot -> Workflow/Task | Web API | `shots.split` key | `project:edit` | `workflow_id`. |
| `GenerateShotImage` | Shot -> Workflow/Task/Credit | Web API | `shot.image.generate` key | `generation:start` | `workflow_id/task_id`. |
| `GenerateShotVideo` | Shot -> Workflow/Task/Credit | Web API | `shot.video.generate` key | `generation:start` | `workflow_id/task_id`. |
| `CreateExport` | Export -> Workflow/Task | Web API | `export.create` key | `export:create` | `export_id/workflow_id`. |
| `CreateBillingOrder` | Commerce/Payment | Web API | `billing.create_order` key | `billing:purchase` | `order_id`. |
| `CreatePaymentIntent` | Commerce/Payment | Web API | order/provider/mode reuse + optional key | `billing:purchase` | `payment_intent_id`, `payAction`. |
| `ProcessPaymentCallback` | Commerce/Payment | Webhook | provider dedup key | provider signature | normalized transition + outbox. |
| `GrantCreditsFromPayment` | Credit/Billing | `payment.succeeded` consumer | inbox + source unique | system event | credit ledger entry. |
| `RequestRefund` | Commerce/Payment | Admin/Ops | refund command key | `billing:refund` | `refund_id` or manual review. |
| `ManualSettleUnknownTask` | Workflow/Task/Credit | Admin/Ops | action key | `ops:settle` | settled task/allocation. |

### 6.2 Event Contracts

| Event | Publisher | Consumer | Criticality | Idempotency |
| --- | --- | --- | --- | --- |
| `workflow.completed` | Workflow/Task | Project | P0-B | Inbox unique. |
| `task.succeeded` | Workflow/Task | Shot, Credit/Billing | P0-A/P0-B | Task/attempt/source unique. |
| `asset.version.created` | Asset | Quality/Review | P0-B/P0-C | Asset version immutable. |
| `calibration.passed` | Project/Quality | Shot | P0-A | Calibration decision unique. |
| `payment.succeeded` | Commerce/Payment | Credit/Billing | P0-B critical | Inbox + payment grant source unique. |
| `credit.grant.created` | Credit/Billing | Commerce/Payment, Notification future | P0-B | Grant ledger ID unique. |
| `payment.refund.succeeded` | Commerce/Payment | Credit/Billing/Admin-Ops | P0-B/P1 | Refund provider/source unique. |
| `invoice.issued` | Commerce/Payment | Notification/Admin-Ops | P0-B manual | Invoice record unique. |
| `export.ready` | Export | Notification future | P1 | Export ID unique. |

### 6.3 Versioning Rules

- API request/response schemas live in `packages/contracts` when implementation starts.
- Event schemas are versioned with `event_type` + `schema_version`.
- Breaking event changes require new event type or versioned consumer handling.
- Provider-specific payloads never leak into public application contracts.

## 7. Exception, Idempotency, and Consistency Rules

| Scenario | Idempotency Key / Guard | State Preconditions | Failure Behavior | Repair |
| --- | --- | --- | --- | --- |
| Duplicate project/script/generation command | `(org, operation, key)` + request hash | Resource visible to actor | Return existing result or 409 conflict | None. |
| BullMQ duplicate delivery | Task status/attempt lease | Task `queued` or lease expired | Second worker claim fails | Lease repair. |
| Provider call after acceptance times out | ProviderRequest persisted before call | `external_submission_started_at` set | `result_unknown`, no blind retry | Provider lookup/manual review. |
| Worker finalization crash | Transaction boundary | Attempt running | Transaction rollback or incomplete state visible | Repair job finalizes/marks unknown. |
| Duplicate task settlement | Partial unique settlement index | Allocation unsettled | Second settlement rejected/no-op | Reconciliation alerts if drift. |
| Payment duplicate callback | Provider event dedup key + provider trade unique | Payment not already conflicting | Return provider success ACK, no duplicate grant | None. |
| Payment callback amount mismatch | Amount/currency check | Any | Reject transition, risk event | Admin/Ops review. |
| Paid without credit grant | Order paid, no grant source ledger | Paid order | No user balance yet | 5-minute repair uses `payment.succeeded`. |
| Refund consumed credits | Available credits check | Paid + grant exists | Manual review/partial refund | Admin/Ops policy. |
| Invoice issued then refund | Invoice state check | Invoice issued | Block/flag refund | Red-letter/finance process. |
| Redis lost | PostgreSQL durable truth | Queued/running facts exist | BullMQ jobs lost | Repair dispatcher rebuilds jobs. |

## 8. Development Task Breakdown

Tasks are grouped by delivery dependency, not by team ownership. Each task must include tests, observability, and documentation updates where relevant.

### Track A: Contract and Database Skeleton

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| A1 Generate/define DB migrations for identity/org/project/workflow/task core. | State dictionary freeze. | Initial migrations and constraints. | Migration applies cleanly; tenant columns/indexes present. |
| A2 Define contract package for API/events/enums. | A1/state dictionary. | Shared TypeScript schemas. | API/events compile and have schema tests. |
| A3 Implement idempotency record protocol. | A1. | Idempotency table + helper. | Same key/hash returns same result; different hash returns 409. |
| A4 Implement outbox/inbox infrastructure. | A1/A2. | Durable event tables, dispatcher, consumer guard. | Duplicate event delivery is safe. |

### Track B: Access and Tenant Foundation

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| B1 Identity/Auth minimal login/session. | A1/A2. | User/session APIs and guards. | 401/active/disabled paths tested. |
| B2 Organization/workspace/membership/capability resolver. | B1. | `resolveActorContext`, `assertCapability`. | 403 and tenant leak tests pass. |
| B3 Audit append helper. | B1/B2. | Domain audit API. | Sensitive commands write audit. |

### Track C: Creator P0-A Core Loop

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| C1 Project/script/episode commands and queries. | A/B. | Project creation and script storage. | Project lifecycle tests pass. |
| C2 Workflow/task/attempt skeleton and task claim protocol. | A4/B. | Durable workflow/task execution records. | Duplicate worker claim impossible. |
| C3 Asset/asset version module. | A/B/C2. | Immutable version creation and signed URL flow. | Regeneration never overwrites versions. |
| C4 Shot module and content/image/video status rules. | C1/C3. | Shot CRUD/status/current pointer safety. | Out-of-order generation cannot move current pointer. |
| C5 ModelGateway minimal provider adapter/mock and ProviderRequest pre-call persistence. | C2. | Provider request records and mock/real adapter boundary. | Crash after external submission enters `result_unknown`/no blind retry. |
| C6 Export package workflow. | C1/C3/C2. | Export facts and manifest. | Missing assets handled explicitly. |

### Track D: Credit and Reliability P0-B

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| D1 Credit ledger grant/adjustment baseline. | A/B. | Append-only ledger + balance read model. | Balance recomputes from ledger. |
| D2 Reservation envelope/allocation and settlement. | D1/C2. | P0-B reservation/consume/release. | Concurrent generation cannot oversell. |
| D3 Worker lease recovery and Redis repair dispatcher. | C2/A4. | Stale running/queued repair. | Redis loss recovery test passes. |
| D4 Provider unknown/manual review settlement. | C5/D2/Admin. | `result_unknown` operational closure. | Unknown never silently fails/releases credits. |
| D5 Admin/Ops core operational commands. | B3/C2/D2. | Retry, settle, provider disable. | Every action audited. |

### Track E: Commerce/Payment P0-B

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| E1 Credit package/order/payment intent tables and commands. | A/B/D1. | Create order/intent APIs. | Price snapshotted server-side; idempotency works. |
| E2 WeChat Pay adapter. | E1. | `native_qr` create/callback/query/close/refund gates. | Adapter verification checklist passes with sandbox/mocked official payloads. |
| E3 Alipay adapter. | E1. | `pc_page` and optional `qr_code` mapping. | Decimal conversion and callback ACK tests pass. |
| E4 Payment-to-credit event flow. | E1/D1/A4. | `payment.succeeded` -> credit grant. | Duplicate callback creates one grant. |
| E5 Refund/invoice/risk/reconciliation records and jobs. | E4/D1/B3. | Admin refund, invoice metadata, risk events, reconciliation jobs. | Verification scenarios in commerce doc pass. |

### Track F: Observability and Release Gates

| Task | Depends On | Output | Done When |
| --- | --- | --- | --- |
| F1 Structured logs and trace context. | A/B/C2/E1. | request/workflow/task/payment trace IDs. | Failure triage has IDs. |
| F2 Metrics and dashboards. | C/D/E. | API, worker, provider, credit, payment metrics. | Ops can localize failure layer in 5 minutes. |
| F3 Acceptance test suite. | C/D/E. | Happy + failure path tests. | P0-A/P0-B gates are executable. |
| F4 Deployment/runbook baseline. | F1/F2/F3. | Env/config/rollback/runbooks. | Staging dry-run passes. |

## 9. Milestones and Acceptance Gates

| Milestone | Scope | Entry Criteria | Exit Criteria |
| --- | --- | --- | --- |
| M0 Contract Freeze | State dictionary, schema draft, idempotency, outbox/inbox contracts. | Architecture docs reviewed. | Contracts compile; DB constraints reviewed; no ownerless fact. |
| M1 Platform Foundation | Identity, organization, audit, tenant-safe queries. | M0. | Auth/RBAC/tenant leak tests pass. |
| M2 P0-A Creator Loop | Project -> script -> shots -> image/video/mock provider -> export. | M1. | Internal alpha can complete core loop; no duplicate expensive task on refresh. |
| M3 P0-A Real Provider Safety | ProviderRequest pre-call persistence and minimal `result_unknown` handling. | M2. | Crash/timeout after external submission cannot blind retry. |
| M4 P0-B Reliability | Outbox recovery, leases, reservations, manual review, Admin/Ops. | M3. | Redis loss recovery; credit no-oversell; unknown settlement. |
| M5 P0-B Commerce Gate | One-time credit purchase via WeChat/Alipay, payment-to-credit, refund/invoice/reconciliation. | M4 plus provider sandbox readiness. | Duplicate callback one grant; paid-without-credit repaired; refund/invoice gates pass. |
| M6 Commercial Beta Readiness | Observability, runbooks, release gates. | M5. | Ops can diagnose core failure layer in 5 minutes; acceptance suite green. |

## 10. Acceptance Standard by Capability

| Capability | Functional | Failure/Idempotency | Security | Observability |
| --- | --- | --- | --- | --- |
| Auth/Org | Login and actor context. | Disabled user/org denied. | Tenant query tests. | user/org IDs in logs. |
| Project/Shot | Create/edit/query project/shots. | Duplicate commands safe. | Project capability checks. | project/workflow IDs in logs. |
| Workflow/Task | Claims and finalization. | Duplicate delivery/worker crash safe. | Worker uses scoped facts. | task/attempt lease metrics. |
| ModelGateway | Submit/lookup provider. | Accepted-timeout -> unknown. | Provider secrets server-only. | provider_request_id in logs. |
| Asset | Immutable versions. | Out-of-order finalization safe. | Signed URL tenant auth. | asset_version_id traceable. |
| Credit | Reserve/consume/release/grant. | One settlement per allocation. | Admin adjustment permission. | balance drift metric. |
| Commerce/Payment | Order/intent/callback/grant. | Duplicate callback one grant. | Signature/amount/merchant checks. | order/payment/provider event IDs. |
| Refund/Invoice | Admin refund and invoice metadata. | Consumed credits manual review. | Admin capability + audit. | refund/invoice reconciliation items. |
| Admin/Ops | Retry/settle/disable/reconcile. | Commands state-checked. | Ops-specific capabilities. | every action audited. |

## 11. Development Order

Recommended order:

1. M0: freeze language, enums, schema constraints, idempotency, event contracts.
2. M1: implement auth/org/capability/audit before any tenant-owned feature.
3. M2: build creator loop with mock/stub provider and durable workflow/task truth.
4. M3: add real provider side-effect safety before any paid provider dogfood.
5. M4: add P0-B reliability: leases, outbox recovery, reservations, Admin/Ops.
6. M5: add Commerce/Payment once credit ledger and outbox are stable.
7. M6: harden observability/runbooks before commercial beta.

Do not start with UI breadth or non-core surfaces. The first usable product should be a thin but durable vertical slice.

## 12. Implementation Readiness Checklist

- [ ] Domain dictionary reviewed by product and engineering.
- [ ] Module map includes Commerce/Payment and has no ownerless business fact.
- [ ] Every table has a writing owner.
- [ ] M0.1 Contract Hardening exit criteria in `docs/architecture/p0-m0-1-contract-hardening.md` are satisfied.
- [ ] Every command has permission, idempotency, state preconditions, error semantics, and verification IDs.
- [ ] Every critical event has a schema version, producer, source IDs, and replay/dedup semantics.
- [ ] Every external side effect has pre-call persistence or a documented safe retry policy.
- [ ] Every cross-module write is a domain command or outbox event.
- [ ] Every P0-B repair job has a scan condition and idempotent action.
- [ ] P0-A and P0-B acceptance gates are mapped to test files in `docs/architecture/p0-verification-plan.md`.
- [ ] Collaboration rules in `docs/architecture/p0-collaboration-contract.md` are reflected in PR templates or implementation plans.
- [ ] Finance/tax has reviewed invoice/refund operational policy before commercial payment launch.
- [ ] Provider official docs have been verified before writing payment adapters.

## 13. Known Remaining Uncertainty

Current confidence is not 100%.

Remaining risks:

1. Email-code delivery provider, abuse thresholds, and rate-limit buckets must be configured before Identity/Auth implementation.
2. Exact provider production account capabilities for WeChat Pay/Alipay must be verified.
3. Finance/tax must confirm invoice category, tax rate, red-letter workflow, and retention.
4. Detailed API schemas are specified as M0.1 outputs and still need to be generated/validated in code from the domain contracts.
5. The team must decide whether customer-facing order history and credit ledger pages are P0-B.

Mitigation:

- Treat this blueprint as the coordination baseline.
- Do not let module detailed design change data ownership without updating this file and `decision-log.md`.
- Convert each milestone into implementation plans only after its entry criteria are true.

## 14. Collaboration Model

The blueprint is useful only if it changes how teams coordinate. The collaboration rule is simple: modules can move independently only after their contracts and owned facts are explicit.

### 14.1 Module Ownership Roles

| Role | Responsibility | Can Approve |
| --- | --- | --- |
| Domain owner | Business rules, state machine, data ownership, command semantics. | Module behavior changes. |
| Contract owner | API/event schemas, versioning, compatibility. | Cross-module contract changes. |
| Data owner | Table ownership, migrations, indexes, constraints, retention. | Writes to owned data. |
| Reliability owner | Idempotency, retry, repair jobs, consistency tests. | Failure-path readiness. |
| Security/Ops reviewer | Capabilities, tenant scope, audit, Admin/Ops visibility. | P0-B operational gates. |

In a small team, one person may hold multiple roles. The roles still need to be named in implementation plans and PRs.

### 14.2 Cross-Module Change Protocol

Any change that crosses a module boundary must answer these questions in its PR or implementation plan:

1. Which module owns the business fact being changed?
2. Is the change a command, query, event, or read-model dependency?
3. What is the idempotency key or duplicate-handling rule?
4. What happens if the caller times out after the callee succeeds?
5. What happens if the event is delivered twice or not delivered yet?
6. Which audit event or operational view proves the change happened?
7. Does this require updating the domain dictionary, schema draft, event contract, or decision log?

### 14.3 PR Boundary Checklist

Every implementation PR touching P0 core modules must include:

- [ ] Module owner and affected facts.
- [ ] New/changed commands, queries, events, or tables.
- [ ] Permission/capability checks.
- [ ] Idempotency and retry behavior.
- [ ] Failure/repair path.
- [ ] Tests proving at least one happy path and one meaningful failure path.
- [ ] Observability IDs added to logs/metrics where applicable.
- [ ] Documentation updated if boundary, state, or ownership changed.

PRs that directly write another module's owned table should be rejected unless they are migration-only changes approved by the data owner.

## 15. M0 Contract Freeze Package

M0 exists to make later work parallelizable. Without M0, teams will build against shifting language, state values, and event meanings.

The formal freeze record is `docs/architecture/p0-m0-contract-freeze.md`. This section defines what must be frozen; the freeze record captures the current frozen baseline and the remaining non-frozen gates.

### 15.1 Required Artifacts

| Artifact | Source Document | Implementation Output | Owner | Freeze Criteria |
| --- | --- | --- | --- | --- |
| Domain dictionary | This blueprint §1 | `packages/contracts/domain` enums/types later | Architecture + module owners | No duplicate/ambiguous core term. |
| State dictionary | `p0-state-dictionary.md` | generated/manual DB/API/frontend enum set | Domain owners | DB/API/UI state names mapped. |
| Schema ownership map | This blueprint §5 + schema draft | migration ownership labels/comments later | Data owners | Every table has one writer. |
| Idempotency protocol | `system-architecture-design.md` §7.1.3 | idempotency table + helper contract | Reliability owner | key/hash/conflict/expiry semantics frozen. |
| Event contract inventory | This blueprint §6.2 + architecture §7.5 | event schemas with `schema_version` | Contract owner | critical events have payload and consumer. |
| Command contract inventory | This blueprint §6.1 | API/command schemas | Contract owner | each command has permission + idempotency. |
| Repair job inventory | This blueprint §7 + commerce design §18 | scheduler job specs | Reliability owner | each repair has scan condition and idempotent action. |
| Acceptance matrix | This blueprint §10 and §16 | test plan | QA/reliability owner | P0-A/P0-B gates are executable. |

### 15.2 M0 Freeze Rules

- State names cannot be changed casually after M0. Changes require migration mapping and contract version update.
- New tables after M0 must name a writing module.
- New cross-module events after M0 must declare publisher, consumer, payload, idempotency, and replay behavior.
- New commands after M0 must declare capability, idempotency, state preconditions, error semantics, and audit requirement.
- P0-B commercial payment code cannot start until Commerce/Payment table ownership, event contracts, and Credit grant source constraints are frozen.

### 15.3 M0 Exit Review

M0 is complete only when the team can answer, without opening implementation code:

1. Which module writes each table?
2. Which command starts each core business flow?
3. Which event crosses each asynchronous boundary?
4. Which state values can appear in DB/API/UI?
5. Which test proves duplicate side effects are prevented?
6. Which repair job fixes each known eventual-consistency gap?

### 15.4 M0.1 Implementation-Readiness Package

M0.1 converts this blueprint into implementation contracts.

| Artifact | Path | Purpose |
| --- | --- | --- |
| M0.1 gate | `docs/architecture/p0-m0-1-contract-hardening.md` | Defines the implementation-readiness artifact register and exit checklist. |
| Idempotency contract | `docs/architecture/p0-idempotency-contract.md` | Defines `idempotency_records`, operation names, helper semantics, and tests. |
| Verification plan | `docs/architecture/p0-verification-plan.md` | Maps PRD and architecture acceptance scenarios to test files and CI gates. |
| Repair job spec | `docs/architecture/p0-repair-job-spec.md` | Defines scan conditions, idempotent actions, and repair tests. |
| Collaboration contract | `docs/architecture/p0-collaboration-contract.md` | Defines module labels, review roles, PR template, contract-change records, and parallel lanes. |

Broad P0-A/P0-B module coding starts after M0.1 exit, not merely after M0 document freeze.

## 16. Executable Verification Matrix

This matrix turns the blueprint into tests. Exact test file paths are mapped in `docs/architecture/p0-verification-plan.md`; the scenarios below remain the compact blueprint view.

| Scenario | Stage | Test Type | Must Prove |
| --- | --- | --- | --- |
| Unauthenticated request to tenant resource | M1 | API integration | Returns `401`, no data leak. |
| Authenticated user without membership | M1 | API integration | Returns `403`, no data leak. |
| Tenant-scoped list/detail query | M1 | Integration/property test | Cannot read another organization's data. |
| Duplicate command with same key/hash | M0/M2 | Unit + API integration | Returns existing resource. |
| Duplicate command with same key/different hash | M0/M2 | Unit + API integration | Returns `409 idempotency_conflict`. |
| Worker double claim | M2 | DB transaction test | Only one attempt is created. |
| Provider external submission started then worker crashes | M3 | Integration/failure test | Enters `result_unknown`; no blind retry. |
| Asset regeneration finishes out of order | M2 | Domain test | Current pointer remains on active task/revision. |
| Credit reservation under concurrency | M4 | DB concurrency test | Cannot oversell available balance. |
| Allocation double settlement | M4 | DB constraint test | Cannot both consume and release. |
| Redis job loss | M4 | Failure drill | Dispatcher rebuilds from PostgreSQL. |
| Payment duplicate callback | M5 | Webhook integration | One paid transition and one credit grant. |
| Payment amount mismatch | M5 | Webhook integration | No paid transition; risk event created. |
| Frontend payment return without callback | M5 | API integration | No credit grant. |
| Paid order with credit consumer crash | M5 | Repair job test | Paid-without-credit repair grants once. |
| Refund consumed credits | M5 | Domain/Admin test | Manual review or partial refund; no automatic negative balance. |
| Issued invoice then refund | M5 | Domain/Admin test | Refund blocked/flagged until reversal state. |
| Admin manual settlement | M4/M5 | Admin integration | Capability checked and audit event written. |
| Ops failure triage | M6 | Observability drill | Can identify API/worker/provider/credit/payment/storage layer in 5 minutes. |

## 17. Risk Burn-Down Table

Current confidence is high for architecture direction, but not 100% for implementation readiness. The remaining work is concrete and burn-downable.

| Risk | Why It Matters | Burn-Down Action | Gate |
| --- | --- | --- | --- |
| Phone-code delivery and abuse controls | Auth method is frozen as China phone-code login, but SMS provider delivery, TTL, resend limits, IP/phone buckets, and lockout thresholds affect security and UX. | Choose delivery provider/config; implement normalized phone identity, hashed codes, row-locked consume, resend/verify rate limits, and audit/risk events. | Before M1 auth implementation. |
| State dictionary drift | DB/API/UI/worker can disagree. | Generate or manually validate all enums/check constraints from `p0-state-dictionary.md`. | Before M0 exit. |
| API/event contracts too informal | Teams cannot parallelize safely. | Create contract package and schema tests. | Before M2 parallel work. |
| Provider side-effect ambiguity | Real provider calls can double-charge or duplicate expensive work. | Implement ProviderRequest pre-call persistence and `result_unknown` handling tests. | Before real paid provider dogfood. |
| Credit/payment double grant | Commercial trust failure. | Enforce source unique ledger grant + inbox + callback dedup tests. | Before M5. |
| Refund after consumed credits | Negative balances or off-ledger receivables. | Keep Admin/Ops-only refund and manual/partial policy. | Before M5. |
| Invoice/fapiao process mismatch | Compliance and refund blockers. | Finance/tax review of invoice type, red-letter process, retention. | Before commercial payment launch. |
| Ops visibility postponed | Beta failures become invisible. | Admin/Ops and dashboards in M4/M6, not after beta. | Before M5/M6. |
| Module boundary erosion | Code becomes untestable monolith internals. | PR checklist rejects cross-module table writes. | Every PR. |

## 18. Blueprint Definition of Done

The architecture is considered converged into a module implementation blueprint when all of these are true:

- [x] Core domain language is defined.
- [x] Business modules and non-responsibilities are explicit.
- [x] Core flows include normal and failure paths.
- [x] Data ownership has a single writing owner per business fact.
- [x] Command and event contract inventory exists.
- [x] Idempotency, consistency, and repair rules exist for core failures.
- [x] Development tasks are split by dependency tracks.
- [x] Milestones and acceptance gates are defined.
- [x] Collaboration and PR boundary rules are defined.
- [x] Verification matrix maps architecture claims to executable tests.
- [x] Remaining uncertainty is explicit and mapped to burn-down gates.
- [x] M0.1 hardening documents define idempotency DDL, verification mapping, repair jobs, and collaboration rules.

The blueprint is not "implementation complete." It is now the M0 coordination baseline plus M0.1 implementation-readiness gate for generated contracts, migrations, verification work, and parallel module implementation.
