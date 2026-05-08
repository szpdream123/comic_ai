# Architecture Consistency Checklist

> Status: Draft
> Purpose: prevent PRD, architecture, schema, state, API, worker, and verification docs from drifting before implementation starts.

## 1. Release Gate Vocabulary

All documents must use the same stage meanings:

| Stage | Meaning | May Use Real Paid Providers? | May Serve Commercial Beta? |
| --- | --- | --- | --- |
| P0-A | Internal Alpha / core creator loop validation. | Only with minimum provider side-effect protection; otherwise mock/stub only. | No |
| P0-B | Commercial Beta Gate / reliability and operations baseline. | Yes | Yes, small scale |
| P0-C | Commercial Ops Hardening / cost, quality, and provider operations. | Yes | Yes |

Checks:

- [ ] No document describes P0-A as commercial beta.
- [ ] Any P0-A real provider usage requires pre-call ProviderRequest persistence, `external_submission_started_at`, minimum `result_unknown`, and no blind retry.
- [ ] P0-B is the first stage allowed to claim Redis recovery, Worker lease repair, full credit reservation, and Admin/Ops settlement.
- [ ] P0-C is the first stage allowed to claim provider cost optimization and quality-review hardening.

## 2. State Dictionary Alignment

`docs/architecture/p0-state-dictionary.md` is the canonical state source.

Checks:

- [ ] Project uses `project_phase` plus readiness flags, not a single overloaded `status`.
- [ ] PRD project labels map to project phase plus readiness flags.
- [ ] Shot uses separate `content_status`, `image_status`, and `video_status`.
- [ ] Any document using `revision` for shots clarifies whether it means `content_revision`, image generation intent, or video generation intent.
- [ ] Workflow, task, attempt, provider request, calibration, quality review, export, and credit statuses all appear in the state dictionary.
- [ ] Database constraints, API schemas, frontend types, and worker transition tests are generated from or manually checked against the same values.

## 3. Schema Alignment

Checks:

- [ ] `projects` contains `project_phase` and recomputable readiness cache fields.
- [ ] `shots` contains `content_status`, `content_revision`, `image_status`, `video_status`, active task IDs, and current asset version pointers.
- [ ] Provider requests contain enough fields for P0-A side-effect protection before any real provider call.
- [ ] P0-B credit ledger tables support reservation envelopes, per-task allocations, and one-time settlement.
- [ ] Tenant-owned tables include non-null `organization_id`.
- [ ] High-risk project-owned records include `workspace_id` and `project_id` where applicable.

## 4. Reliability Alignment

Checks:

- [ ] P0-A tests prove duplicate user commands do not create duplicate workflows/tasks.
- [ ] P0-A tests prove a provider request that started external submission is not blindly retried.
- [ ] P0-B tests prove Redis job loss can be rebuilt from PostgreSQL.
- [ ] P0-B tests prove two workers cannot claim the same task.
- [ ] P0-B tests prove provider timeout after accept becomes `result_unknown`, not ordinary `failed`.
- [ ] P0-B tests prove `manual_review_required` blocks workflow terminal aggregation.
- [ ] P0-B tests prove Worker finalization is atomic.

## 5. Credit and Cost Alignment

Checks:

- [ ] P0-A documentation says synchronous balance check only; it does not claim 100% concurrent oversell prevention.
- [ ] P0-B documentation says credit reservation, allocation, consume, and release occur transactionally.
- [ ] Any failure/unknown/cancel path has an explicit credit behavior.
- [ ] Provider abnormal cost is recorded internally and not silently charged to the user unless policy explicitly changes.
- [ ] Balance caches are documented as read models, with reconciliation queries before commercial beta.

## 6. Operations Alignment

Checks:

- [ ] P0-A Admin Lite is read-only and intended for internal diagnosis.
- [ ] P0-B Admin/Ops supports stuck-task search, retry, manual settlement, provider status, and provider disable.
- [ ] Any manual operation emits an audit event with actor, reason, target, and timestamp.
- [ ] Dashboards can answer where a task failed: API, Workflow/Task, Model-Gateway, Provider, Credit-Billing, Storage, PostgreSQL, or Redis.

## 7. Module Implementation Blueprint Alignment

Checks:

- [ ] `p0-module-implementation-blueprint.md` is the coordination baseline for module detailed design.
- [ ] `p0-m0-contract-freeze.md` is used as the single entry point for frozen M0 contracts.
- [ ] Every module in the system architecture module map has a responsibility card in the blueprint.
- [ ] Every business fact in the domain dictionary has one writing owner.
- [ ] Detailed module designs do not add cross-module writes that bypass domain commands or outbox/inbox events.
- [ ] Development tasks map to blueprint tracks A-F or explicitly document why they are outside P0.
- [ ] Milestone exit criteria are executable tests or operational checks, not prose-only acceptance.
- [ ] Cross-module PRs answer the blueprint §14 change protocol questions.
- [ ] M0 Contract Freeze artifacts in blueprint §15 are complete before parallel module implementation starts.
- [ ] Verification scenarios in blueprint §16 are mapped to executable test files during implementation planning.
- [ ] Remaining risks in blueprint §17 have owners or explicit gates before the relevant milestone.

## 8. M0 Contract Freeze Alignment

Checks:

- [ ] M0 freeze record marks document-level freeze separately from code/migration/provider readiness.
- [ ] Frozen artifact register covers domain dictionary, module boundaries, data ownership, states, commands, events, idempotency, outbox/inbox, repair jobs, verification matrix, and payment design.
- [ ] Frozen decisions include P0 email-code auth, one-time credit purchase, WeChat Pay + Alipay, payment-to-credit event boundary, refund policy, invoice/fapiao workflow, payment risk, reconciliation, and provider adapter normalization.
- [ ] Frozen command classes include auth, project/workflow, generation, credit settlement, provider submission, order/payment, callback, credit grant, refund, and repair/reconciliation.
- [ ] Frozen event classes include workflow/task lifecycle, provider results, payment/refund success, credit grant, invoice issued, and audit events.
- [ ] Non-frozen gates are explicit and assigned to the milestone they block.
- [ ] Any post-M0 state/owner/command/event change includes a contract-change record and updates the decision log when the tradeoff changes.

## 9. Commerce and Payment Alignment

Checks:

- [ ] Commerce/Payment appears in the module map, implementation baseline, data schema, and blueprint.
- [ ] Payment success can only grant credits through `payment.succeeded` consumed by Credit/Billing.
- [ ] Frontend payment success/return URLs never grant credits.
- [ ] Duplicate provider callbacks cannot create duplicate credit grants.
- [ ] Refunds for consumed credits do not automatically create negative balances in P0-B.
- [ ] Issued invoices/fapiao block or flag automatic refund until finance-approved reversal/red-letter handling.
- [ ] Payment adapter implementation verifies official WeChat Pay and Alipay field mappings before coding.

## 10. Implementation Readiness

Before freezing Schema/API contracts:

- [ ] D.1 State dictionary final version is complete.
- [ ] D.3 Idempotency protocol has DDL, request hashing, conflict semantics, and expiry policy in `p0-idempotency-contract.md`.
- [ ] Schema draft references the final state dictionary.
- [ ] API command list references idempotency semantics.
- [ ] M0.1 contract package in `p0-m0-1-contract-hardening.md` has an exit owner and checklist.

Before P0-A core module coding:

- [ ] P0-A provider side-effect protection is specified and testable.
- [ ] P0-A acceptance tests R-002, R-011, R-012, R-013, R-016, R-017, and A-001 are mapped in `p0-verification-plan.md` and implemented before M2 exit.

Before P0-B reliability coding:

- [ ] D.2 recovery decision table is complete.
- [ ] D.4 provider async strategy is complete.
- [ ] D.5 credit settlement matrix is complete.
- [ ] P0-B repair jobs have scan conditions and idempotent actions in `p0-repair-job-spec.md`.
- [ ] Admin/Ops manual settlement UI and audit semantics are specified.

## 11. M0.1 Contract Hardening Alignment

Checks:

- [ ] M0.1 defines allowed work before exit and rejects broad P0-A/P0-B module coding before contracts are hardened.
- [ ] API commands declare operation name, capability, idempotency, state preconditions, errors, audit event, and verification IDs.
- [ ] Events declare `event_id`, `event_type`, `schema_version`, producer, source IDs, and dedup/replay semantics.
- [ ] Verification plan maps every PRD TC-P0 test and architecture R/A test to a proposed test file and CI gate.
- [ ] Collaboration contract defines module labels, review roles, PR template, contract-change record, and parallel lanes.
- [ ] Data schema draft includes `idempotency_records` and does not rely on operationless `(organization_id, idempotency_key)` as the core replay guard.
