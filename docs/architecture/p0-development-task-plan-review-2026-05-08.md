# P0 Development Task Plan Review

> Date: 2026-05-08  
> Scope: development task arrangement, three-developer delivery plan, M1 platform foundation plan, delivery execution system  
> Reviewer posture: first-principles engineering execution review

## 1. Verdict

The task arrangement is now a usable engineering execution blueprint, not just a long task list.

It can support three developers because each primary task is anchored to:

- background and why
- delivered capability
- prerequisites and blockers
- verification evidence
- failure handling
- contribution to the main creator loop or a named release gate

However, the first review pass found four issues that would have made the plan less verifiable in practice. Those issues have been repaired in the planning documents.

## 2. Sources Reviewed

- `docs/product/reelmate-core-replication-prd.md`
- `docs/architecture/p0-delivery-execution-system.md`
- `docs/architecture/p0-verification-plan.md`
- `docs/superpowers/plans/2026-05-08-p0-three-developer-delivery-plan.md`
- `docs/superpowers/plans/2026-05-08-m1-platform-foundation.md`
- `packages/db/migrations/0001_foundation.sql`
- `package.json`
- `scripts/run-tests.mjs`

## 3. Findings and Repairs

### F-001: Verification command drift made tasks less executable

Severity: High

Finding: The task plans used `pnpm test ...`, but the current repository has only a root `npm test` script. A developer following the task card could fail before reaching the actual task.

Repair:

- Replaced current task-plan verification commands with `npm test -- <target...>`.
- Recorded the command convention in the three-developer plan and delivery execution system.

### F-002: M1 could have passed with pure function semantics only

Severity: High

Finding: The M1 plan goal required real authentication, tenant scope, server-side authorization, and audit, but several task steps allowed repository/API persistence to come later. That would let M1 go green without proving the platform foundation that M2 depends on.

Repair:

- Added an M1 hard exit boundary.
- Added an explicit M1 Task 0 for schema and persistence test harness work.
- Required migration-backed or persistence-backed tests for login codes, sessions, actor context, tenant-safe query, and audit.
- Added M1-specific verification IDs in `p0-verification-plan.md`.
- Explicitly blocked M2 implementation if `login_codes`, `auth_sessions`, `memberships`, or `audit_events` are absent from the active migration.

### F-003: Dependency graph contradicted B2 prerequisites

Severity: High

Finding: The three-developer plan correctly said `Script Parse` depends on `Workflow/Task`, but its dependency graph placed B1/B2 before A4 Workflow/Task. That could lead B to start B2 too early or build a fake task state.

Repair:

- Updated the dependency graph so B1 can start after A2, but B2 must wait for A4 Workflow/Task.
- Added a critical blocker note: before A4, B may only do schema, contract, test drafts, and dependency alignment for B2.

### F-004: Admin/Ops contracts were missing from the collaboration matrix

Severity: Medium

Finding: Admin/Ops command contracts existed in code but were not in the command contract matrix. That creates a documentation drift risk for C10 and M4-M6 manual intervention work.

Repair:

- Added `ops.retry_task` and `ops.manual_settle_task` to the command contract matrix with A/C ownership.

## 4. Six-Question Scorecard

| Review question | Current status | Evidence |
| --- | --- | --- |
| Is the background clear enough for what and why? | Pass | Every A/B/C task has `背景 / Why`; delivery execution system requires business value and risk. |
| Does each task deliver a capability? | Pass | Tasks are named by capability: auth, actor context, workflow/task, project create, parse, calibration, generation, export, repair, payment, ops. |
| Are prerequisites explicit? | Pass after repair | B2 now explicitly waits for A4; M1 schema/persistence prerequisites are hard-gated. |
| Is completion verifiable? | Pass after repair | Commands are executable through `npm test -- <target...>` and mapped to TC/R/IDEMP gates. |
| Is failure handling defined? | Pass | Each primary task names error handling, retry, conflict, audit, or manual review behavior. |
| Does it advance the main loop? | Pass | Tasks either advance login -> project -> parse -> assets -> calibration -> generation -> export, or name the reliability/commercial release gate they serve. |

## 5. Remaining Open Gates

These are not plan-design blockers anymore, but they are implementation blockers:

1. M1 schema still needs to add and test `login_codes`, `auth_sessions`, `memberships`, and `audit_events`.
2. M1 must produce repository/API or equivalent integration tests, not just pure services.
3. B2 ParseScript cannot start implementation until A4 Workflow/Task is available.
4. C E2E work may prepare harnesses early, but cannot claim closed-loop progress with fake sessions, fake project state, or local-only task status.
5. Payment remains gated by provider/finance/fapiao decisions and must not be used to claim P0-A readiness.

## 6. Confidence Loop

### Loop 1: Does the plan reduce development uncertainty?

Answer: Yes. It names owners, boundaries, prerequisites, tests, failure behavior, and milestones.

Repair made: Added a `待开发` hard requirement for the six execution questions.

### Loop 2: Can a developer run the verification commands?

Initial answer: Not reliably, because the docs used `pnpm test`.

Repair made: Normalized current plans to `npm test -- <target...>`.

Current answer: Yes, for current repository tests and future path-scoped tests handled by `scripts/run-tests.mjs`.

### Loop 3: Can M1 safely unlock M2?

Initial answer: No. M1 could pass pure function tests without proving persistence and tenant safety.

Repair made: Added M1 hard exit boundary and explicit schema/persistence gate.

Current answer: Yes, if the repaired M1 gate is enforced.

### Loop 4: Can the three developers work without creating hidden coupling?

Answer: Mostly yes. A owns trust/reliability, B owns creator facts, C owns experience/verification/ops. The main risk is A's critical path load, so B/C must use blocked time for test drafts, fixtures, contract review, and E2E harnesses rather than bypassing A.

Repair made: B2 was explicitly blocked on A4 while still allowing non-invasive preparation work.

### Loop 5: Do I have factual 100% confidence in the revised task split?

Answer: Yes, for the task split as an execution blueprint. It is now concrete, verifiable, collaborative, and aligned to the main loop.

Boundary: This is not confidence that implementation is done or that dates are guaranteed. It is confidence that the plan will expose missing implementation facts instead of hiding them.

## 7. Decision

Proceed with M1 only under the repaired M1 hard exit boundary. Do not start M2 Project/Script implementation until M1 platform foundation and A4 Workflow/Task prerequisites are factually satisfied.
