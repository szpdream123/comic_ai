# Developer A Task Pack: Platform / Reliability

> Date: 2026-05-09  
> Owner: Developer A  
> Role: Platform / Reliability Owner  
> Mission: 让 P0 的登录、租户、权限、审计、长任务、幂等、存储、Provider、Repair、Credit、Payment 都有可信基础。

## 1. Can A Start Now?

Yes. A can start immediately.

Start with A0 and A1. These are on the critical path and do not require B/C implementation to exist.

A must not wait for UI or creator-domain code. A's first job is to make the platform foundation impossible to fake.

## 2. Non-Negotiable Rules

- P0 auth is China phone-code login, not email-code login.
- Current test command is `npm test -- <target...>`.
- M1 cannot exit on pure function tests. Auth/session, actor context, tenant-safe query, and audit need persistence-backed or migration-backed evidence.
- Do not implement Project/Shot business rules. Provide the platform boundary B must use.
- No full phone number, plaintext code, plaintext session token, provider secret, or sensitive payment payload may enter logs.

## 3. Outputs A Owes Other Developers

| Consumer | A must provide | Blocks |
| --- | --- | --- |
| B | ActorContext, capability checks, tenant-safe query, audit helper | B1 Project/CreateProject |
| B | Workflow/Task/Attempt execution spine | B2 Script Parse, B7 Generate Image, B9 Export |
| B/C | Storage adapter and signed URL service | AssetVersion, Export UI |
| B/C | Idempotency helper and command semantics | duplicate submit/refresh behavior |
| B/C/Ops | repair jobs, manual review semantics, trace/log IDs | M4-M6 reliability |
| C | stable auth/session APIs and error codes | C1 Auth UI/E2E |

## 4. Task A0: M1 Schema and Persistence Test Harness

| Field | Content |
| --- | --- |
| Background | M1 must prove real login, tenant scope, permission, and audit. Without schema and persistence tests, the system can pass pure utilities while still being unsafe. |
| Capability | Add `login_challenges`, `auth_sessions`, `memberships`, and `audit_events` schema surface plus persistence-backed test harness. |
| Prerequisites | M0.1 foundation SQL; Node test runner. |
| Verification | `npm test -- apps/backend/src/modules/shared/db/tests/foundation-schema.spec.ts` |
| Failure Handling | If schema/harness cannot prove persistence, M1 stays open and B/C can only prepare tests, contracts, and fixtures. |
| Main Loop | Yes. It is the real data prerequisite for login -> project creation. |

Implementation notes:

- Keep this task limited to platform facts.
- Do not add Project/Script/Shot tables here.
- Prove plaintext auth secrets are not modeled as persisted columns.

## 5. Task A1: Phone-Code Auth and Server Session

| Field | Content |
| --- | --- |
| Background | Every P0 command must run under a real user and real session. China-first users expect phone-code login. |
| Capability | China mainland phone-code challenge, verification, server-side session creation, session revoke/expiry. |
| Prerequisites | A0; `users`, `login_challenges`, `auth_sessions`. |
| Verification | `npm test -- apps/backend/src/modules/identity`; M1-AUTH-001 and M1-AUTH-002. |
| Failure Handling | `invalid_phone`, `phone_mismatch`, `code_expired`, `code_consumed`, `code_invalid`, `user_disabled`; rate-limit resend/verify; lock challenges after max attempts. |
| Main Loop | Yes. It is the login -> project entry. |

Implementation notes:

- Normalize mainland phone numbers to `+86` E.164.
- Store code/session token hashes only.
- Logs may contain masked phone or phone hash, never full phone.
- Development-only debug code endpoint must be gated and unavailable in production mode.

## 6. Task A2: ActorContext, Capability, Tenant-Safe Query

| Field | Content |
| --- | --- |
| Background | Multi-tenant leaks are existential. UI hiding is not permission enforcement. |
| Capability | Resolve ActorContext from session; enforce membership/capability; provide tenant-safe query helper. |
| Prerequisites | A1; users, organizations, workspaces, memberships. |
| Verification | M1-ORG-001, M1-ORG-002, M1-DB-001; `npm test -- apps/backend/src/modules/organization apps/backend/src/modules/shared/db`. |
| Failure Handling | Reject before domain writes; stable 401/403; structured logs with `traceId/userId/organizationId/reason`. |
| Main Loop | Yes. It unlocks Project/Script/Shot commands. |

Implementation notes:

- Tenant-owned reads require `organizationId`.
- Project-owned reads require `organizationId` and `projectId`.
- Cross-org negative tests are mandatory.

## 7. Task A3: Audit Append Helper

| Field | Content |
| --- | --- |
| Background | Calibration skip, export, Admin/Ops, refunds, and manual settlement need accountability. Audit cannot be bolted on later. |
| Capability | Append-only audit event builder/repository with actor, scope, target, event type, reason, redacted metadata. |
| Prerequisites | A2 ActorContext. |
| Verification | M1-AUDIT-001; `npm test -- apps/backend/src/modules/audit`. |
| Failure Handling | Sensitive commands without reason fail. High-risk audit failure blocks command success. |
| Main Loop | Yes. It supports calibration skip, export, and Ops. |

## 8. Task A4: Workflow/Task/Attempt Execution Spine

| Field | Content |
| --- | --- |
| Background | P0's hard problem is durable long-running work. Redis/BullMQ is dispatch, not truth. |
| Capability | Durable workflow/task/attempt create, claim, status query, finalization skeleton. |
| Prerequisites | A2, A3, M0.1 contracts, foundation SQL. |
| Verification | `npm test -- apps/backend/src/modules/workflow-task`; R-003, R-010, R-018/R-029. |
| Failure Handling | Worker crash handled by lease repair; finalization rollback; `result_unknown` and `manual_review_required` do not aggregate to terminal success. |
| Main Loop | Yes. Script parse, image generation, video, and export depend on it. |

## 9. Task A-S1: Storage Adapter and Signed URL

| Field | Content |
| --- | --- |
| Background | AssetVersion and Export must not invent storage URLs or bypass tenant checks. |
| Capability | Server-only storage adapter, scoped object keys, metadata validation, short-lived signed URLs. |
| Prerequisites | A2; AssetVersion/Export schema draft. |
| Verification | `npm test -- apps/backend/src/modules/storage`; tenant-auth signed URL tests. |
| Failure Handling | Storage write failure is retryable infrastructure error; incomplete metadata blocks AssetVersion; cross-tenant download is 403 and logged. |
| Main Loop | Yes. It unlocks generated output and export package download. |

## 10. Task A5: Operation-Scoped Idempotency Hardening

| Field | Content |
| --- | --- |
| Background | Refresh, double-click, and retry must not create duplicate expensive work. |
| Capability | Idempotency replay/conflict for CreateProject, ParseScript, GenerateShotImage, CreateExport. |
| Prerequisites | A2, A4, B1/B2/B7/B9 command implementations. |
| Verification | IDEMP-003, IDEMP-004, R-002. |
| Failure Handling | Same key/different hash -> `409 idempotency_conflict`; running command returns existing workflow/task. |
| Main Loop | Yes. It protects the main loop from duplicate side effects. |

## 11. Task A6: ProviderRequest Side-Effect Protection

| Field | Content |
| --- | --- |
| Background | Real providers can charge money or produce outputs. After external submission starts, blind retry is unsafe. |
| Capability | Persist provider request before call; set `external_submission_started_at`; conservative recovery policy. |
| Prerequisites | A4; B7 mock ModelGateway interface. |
| Verification | A-001, R-026, R-027. |
| Failure Handling | Before external start: safe retry. After external start: lookup/manual review/result_unknown, no duplicate request. |
| Main Loop | Yes. It is the hard gate before real provider dogfood. |

## 12. Task A7: Queue/Worker/Outbox Repair

| Field | Content |
| --- | --- |
| Background | Redis loss, worker crash, and outbox replay are normal beta incidents. |
| Capability | Queued task dispatch repair, stale running lease repair, outbox dispatch repair. |
| Prerequisites | A4, A6, outbox/inbox. |
| Verification | R-001, R-004, R-014, R-021. |
| Failure Handling | Duplicate repair is no-op; provider ambiguity becomes `result_unknown`; repair scans use small locked batches. |
| Main Loop | No direct. It serves M4 reliability gate. |

## 13. Task A8: Credit Ledger and Reservation

| Field | Content |
| --- | --- |
| Background | Commercial beta cannot oversell credits or settle one allocation twice. |
| Capability | Append-only credit ledger, reservation envelope, allocation single settlement, balance drift repair. |
| Prerequisites | A4, A7, B7 generate task. |
| Verification | R-008, R-009, R-015, R-028. |
| Failure Handling | Single settlement constraint; read model repair from ledger; abnormal provider cost does not auto-charge user. |
| Main Loop | Yes for P0-B commercial loop. |

## 14. Task A9: Commerce/Payment Gate

| Field | Content |
| --- | --- |
| Background | Payment mistakes are financial and compliance incidents. Do not implement before credit/outbox reliability is stable. |
| Capability | Package/order/payment intent/callback/payment-to-credit/refund gate. |
| Prerequisites | A8, official payment fields, merchant account capability, finance/tax confirmation. |
| Verification | Callback signature, callback dedup, amount mismatch, frontend return no grant, paid-without-credit repair. |
| Failure Handling | Signature/amount/currency/merchant mismatch -> risk/manual review; duplicate callback ACK but no duplicate grant. |
| Main Loop | No for P0-A; Yes for P0-B commercial loop. |

## 15. First Week Plan

| Day | Focus | Expected Evidence |
| --- | --- | --- |
| Day 1 | A0 schema/test harness | failing then passing foundation schema test |
| Day 2 | A1 phone challenge/session tests | identity tests cover phone normalize/hash/consume/revoke |
| Day 3 | A1 HTTP/session integration | auth handler tests pass; no plaintext leakage |
| Day 4 | A2 red tests | organization/tenant tests fail for missing services |
| Day 5 | A2 minimal implementation or clear blocker | org/tenant tests pass or blocker is specific |

## 16. Confidence Check

I am 100% confident A can start now because A owns the critical path and its first tasks do not depend on B or C. The only unacceptable path is letting M1 pass without persistence-backed proof.
