# M0.1 Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the P0 architecture blueprint into generated contracts, migration-ready schema, executable verification gates, and collaboration scaffolding.

**Architecture:** M0.1 keeps the modular monolith direction. It creates shared contracts first, then migrations/tests, so P0-A modules implement against stable command, event, state, and idempotency boundaries.

**Tech Stack:** TypeScript, Zod or equivalent schema validation, PostgreSQL migrations, NestJS module structure, Vitest/Jest-style tests, Playwright for E2E later.

---

## File Structure

Create or modify these files during implementation:

- Create: `packages/contracts/domain/states.ts`
- Create: `packages/contracts/domain/operation-names.ts`
- Create: `packages/contracts/domain/capabilities.ts`
- Create: `packages/contracts/domain/event-types.ts`
- Create: `packages/contracts/api/project.commands.ts`
- Create: `packages/contracts/api/shot.commands.ts`
- Create: `packages/contracts/api/calibration.commands.ts`
- Create: `packages/contracts/api/export.commands.ts`
- Create: `packages/contracts/api/billing.commands.ts`
- Create: `packages/contracts/events/workflow.events.ts`
- Create: `packages/contracts/events/task.events.ts`
- Create: `packages/contracts/events/payment.events.ts`
- Create: `packages/contracts/events/credit.events.ts`
- Create: `packages/db/migrations/0001_foundation.sql`
- Create: `apps/backend/src/modules/shared/idempotency/idempotency.service.ts`
- Create: `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts`
- Create: `apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts`
- Create: `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`
- Create: `.github/pull_request_template.md`
- Create or update: `.github/CODEOWNERS`
- Modify: `docs/architecture/p0-m0-1-contract-hardening.md`
- Modify: `docs/architecture/p0-verification-plan.md`

## Task 1: Shared State Constants

**Files:**
- Create: `packages/contracts/domain/states.ts`
- Test: `apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts`

- [ ] **Step 1: Write the failing consistency test**

```ts
import { providerRequestStatuses } from '../../../../../packages/contracts/domain/states';

describe('state dictionary consistency', () => {
  it('uses result_unknown for provider requests and never unknown', () => {
    expect(providerRequestStatuses).toContain('result_unknown');
    expect(providerRequestStatuses).not.toContain('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts`

Expected: FAIL because `states.ts` does not exist.

- [ ] **Step 3: Add state constants from `p0-state-dictionary.md`**

Include identity, tenant, workflow, task, attempt, provider request, project phase, shot content/image/video, calibration, quality, credit, export, and commerce/payment statuses.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/domain/states.ts apps/backend/src/modules/shared/contracts/tests/state-dictionary-consistency.spec.ts
git commit -m "feat: add shared P0 state constants"
```

## Task 2: Idempotency Contract Implementation

**Files:**
- Create: `packages/contracts/domain/operation-names.ts`
- Create: `packages/db/migrations/0001_foundation.sql`
- Create: `apps/backend/src/modules/shared/idempotency/idempotency.service.ts`
- Test: `apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts`

- [ ] **Step 1: Write failing tests for replay and conflict**

```ts
describe('idempotency records', () => {
  it('returns an existing record for same org operation key and hash', async () => {});
  it('rejects same org operation key with different hash', async () => {});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts`

Expected: FAIL because service/table do not exist.

- [ ] **Step 3: Add `idempotency_records` migration**

Use the DDL from `docs/architecture/p0-idempotency-contract.md`.

- [ ] **Step 4: Add operation name constants**

Export all operation names listed in `p0-idempotency-contract.md`, including `shot.image.generate`, `billing.create_order`, and `ops.manual_settle_task`.

- [ ] **Step 5: Implement idempotency helper**

Implement `beginOrReplayCommand()` with request hash compare, response resource replay, `409 idempotency_conflict`, and processing replay behavior.

- [ ] **Step 6: Run tests**

Run: `npm test -- apps/backend/src/modules/shared/idempotency/tests/idempotency-records.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/domain/operation-names.ts packages/db/migrations/0001_foundation.sql apps/backend/src/modules/shared/idempotency
git commit -m "feat: add operation-scoped idempotency"
```

## Task 3: API Command Contracts

**Files:**
- Create: `packages/contracts/domain/capabilities.ts`
- Create: `packages/contracts/api/project.commands.ts`
- Create: `packages/contracts/api/shot.commands.ts`
- Create: `packages/contracts/api/calibration.commands.ts`
- Create: `packages/contracts/api/export.commands.ts`
- Create: `packages/contracts/api/billing.commands.ts`
- Test: `packages/contracts/api/contracts.spec.ts`

- [ ] **Step 1: Write failing schema metadata tests**

Assert every command exports `operationName`, `capability`, `idempotencyRequired`, `statePreconditions`, `businessErrors`, and `verificationIds`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/contracts/api/contracts.spec.ts`

Expected: FAIL because contracts do not exist.

- [ ] **Step 3: Implement command schemas**

Use `docs/architecture/p0-m0-1-contract-hardening.md` and `p0-module-implementation-blueprint.md` §6.1 as the source.

- [ ] **Step 4: Run tests**

Run: `npm test -- packages/contracts/api/contracts.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/domain/capabilities.ts packages/contracts/api
git commit -m "feat: add P0 API command contracts"
```

## Task 4: Event Contracts

**Files:**
- Create: `packages/contracts/domain/event-types.ts`
- Create: `packages/contracts/events/workflow.events.ts`
- Create: `packages/contracts/events/task.events.ts`
- Create: `packages/contracts/events/payment.events.ts`
- Create: `packages/contracts/events/credit.events.ts`
- Test: `packages/contracts/events/contracts.spec.ts`

- [ ] **Step 1: Write failing event envelope tests**

Assert every event schema includes `event_id`, `event_type`, `schema_version`, `producer`, `occurred_at`, `organization_id`, and source IDs.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- packages/contracts/events/contracts.spec.ts`

Expected: FAIL because event schemas do not exist.

- [ ] **Step 3: Implement event schemas**

Use `docs/architecture/p0-m0-1-contract-hardening.md` §5 as the required minimum.

- [ ] **Step 4: Run tests**

Run: `npm test -- packages/contracts/events/contracts.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/domain/event-types.ts packages/contracts/events
git commit -m "feat: add P0 event contracts"
```

## Task 5: Repair Job Contract Tests

**Files:**
- Create: `apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts`
- Create: `apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts`
- Create: `apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts`
- Modify: `docs/architecture/p0-verification-plan.md`

- [ ] **Step 1: Write failing tests for the three foundation repair paths**

Cover outbox duplicate delivery, Redis queued job loss, and credit balance drift.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- apps/backend/src/modules/shared/outbox/tests/inbox-dedup.spec.ts apps/backend/src/modules/workflow-task/tests/redis-loss-repair.spec.ts apps/backend/src/modules/credit-billing/tests/balance-drift-repair.spec.ts`

Expected: FAIL because implementations do not exist.

- [ ] **Step 3: Implement minimal repair job interfaces**

Create scheduler interfaces only if needed to satisfy contract tests; keep domain behavior in owning modules.

- [ ] **Step 4: Run tests**

Run: same command.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/shared/outbox apps/backend/src/modules/workflow-task apps/backend/src/modules/credit-billing docs/architecture/p0-verification-plan.md
git commit -m "feat: add repair job contract tests"
```

## Task 6: Collaboration Scaffolding

**Files:**
- Create: `.github/pull_request_template.md`
- Create or update: `.github/CODEOWNERS`
- Modify: `docs/architecture/p0-collaboration-contract.md`

- [ ] **Step 1: Add PR template from collaboration contract**

Use the template in `docs/architecture/p0-collaboration-contract.md`.

- [ ] **Step 2: Add CODEOWNERS placeholder**

Use placeholder owners until real GitHub teams exist.

- [ ] **Step 3: Run repository validation**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Commit**

```bash
git add .github/pull_request_template.md .github/CODEOWNERS docs/architecture/p0-collaboration-contract.md
git commit -m "chore: add P0 collaboration scaffolding"
```

## Task 7: M0.1 Exit Review

**Files:**
- Modify: `docs/architecture/p0-m0-1-contract-hardening.md`
- Modify: `docs/architecture/decision-log.md`
- Modify: `docs/architecture/p0-architecture-blueprint-review.md`

- [ ] **Step 1: Re-run contract, unit, and integration gates available at this stage**

Run:

```bash
npm test -- packages/contracts
npm test -- apps/backend/src/modules/shared
git diff --check
```

Expected: all available checks pass.

- [ ] **Step 2: Update M0.1 checklist**

Mark only verified items as complete. Do not mark implementation code complete unless commands above pass.

- [ ] **Step 3: Update decision log**

Record whether M0.1 exited cleanly or which gates remain open.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/p0-m0-1-contract-hardening.md docs/architecture/decision-log.md docs/architecture/p0-architecture-blueprint-review.md
git commit -m "docs: record M0.1 exit review"
```
