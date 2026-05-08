# P0 Implementation Baseline

> Status: Draft
> Purpose: turn the architecture into a concrete default stack and module layout before writing implementation plans.
> State dictionary: `docs/architecture/p0-state-dictionary.md`

## 1. Default Stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Frontend | Next.js web app | Strong product velocity for a desktop-first web workspace and admin console. |
| Backend API | NestJS with Fastify adapter | NestJS gives module boundaries, DI, guards, pipes, and worker-friendly structure; Fastify keeps HTTP runtime lean. |
| Backend language | TypeScript | Shared contracts and one language across frontend/backend/workers. |
| Database | PostgreSQL | Source of truth for tenants, workflows, tasks, attempts, assets, ledgers, and audit. |
| Query layer | SQL migrations plus Kysely-style typed query builder | The schema needs explicit constraints, row locks, composite tenant keys, and reconciliation queries. Avoid hiding critical SQL behind a too-magical ORM. |
| Queue | Redis + BullMQ | Dispatch, retries, priority, delayed jobs, and worker concurrency. |
| Storage | MinIO in development, object storage in production | Storage adapter hides provider details. |
| Validation | Zod or equivalent schema validation at API and worker command boundaries | Prevents unsafe untyped payloads entering long-running workflows. |
| Observability | Structured logs, metrics, error tracking | Required for commercial beta operations. |

This stack is a baseline, not a preference contest. It is chosen because it supports the architecture invariants with the least ceremony.

## 2. Repository Shape

Recommended monorepo:

```text
apps/
  web/
    src/
      app/
      features/
      lib/
  backend/
    src/
      entrypoints/
        api.ts
        worker.ts
        dispatcher.ts
      modules/
      shared/
      infrastructure/
packages/
  db/
    migrations/
    schema/
    queries/
  contracts/
    api/
    events/
    workflow/
  config/
docker/
docs/
```

One backend codebase has three process entrypoints:

- API process.
- Worker process.
- Outbox dispatcher/scheduler process.

## 3. Backend Module Layout

Each backend module follows the same shape:

```text
modules/<module-name>/
  <module-name>.module.ts
  commands/
  queries/
  domain/
  infra/
  events/
  tests/
```

Rules:

- Controllers call commands/queries.
- Commands own write transactions.
- Queries own read models and always require tenant scope.
- Domain code does not import provider SDKs, BullMQ, or object storage SDKs directly.
- Infra adapters are the only place for external SDK calls.
- Cross-module writes happen through commands or outbox/inbox events, not direct table mutation from another module.

## 4. Module Boundaries

### `identity`

Owns:

- Users.
- Sessions.
- Email-code auth for P0.
- Auth adapter boundary for future OAuth/SSO.

Does not own:

- Organization membership policy.
- Project permissions.

### `organization`

Owns:

- Organizations.
- Workspaces.
- Memberships.
- Role/capability resolution.

Key service:

```ts
resolveActorContext(request): ActorContext
assertCapability(actorContext, capability, scope): void
```

### `project`

Owns:

- Projects.
- Scripts.
- Episodes.
- Project stage transitions.

Does not call providers. It creates workflows for script parsing, asset extraction, and shot splitting.

### `asset`

Owns:

- Assets.
- Asset versions.
- Current version movement for asset-owned pointers.
- Storage metadata.

It uses `storage` adapter for signed URLs and object metadata, but does not expose raw storage SDKs.

### `shot`

Owns:

- Shots.
- Shot content revisions.
- Shot asset links.
- Image/video current pointer rules.

It creates generation workflows through `workflow-task`, but does not call ModelGateway.

### `workflow-task`

Owns:

- Workflows.
- Tasks.
- Attempts.
- State transitions.
- Task claim protocol.
- Finalization transaction coordination.

This module is the spine of long-running work.

### `model-gateway`

Owns:

- Provider adapters.
- Provider capability matrix.
- Provider requests.
- Routing and fallback.
- Provider error normalization.

It never mutates shot/project state directly.

### `commerce-payment`

Owns:

- Credit packages.
- Orders.
- Payment intents.
- Payment provider events.
- Refund facts.
- Invoice request/record metadata.
- Payment risk and reconciliation records.

Does not own:

- Credit balance.
- Generation consumption.
- Provider model calls.
- Tax policy decisions.

It publishes payment facts to `credit-billing` through outbox events. It never updates credit balance tables directly.

### `credit-billing`

Owns:

- Credit ledger.
- Credit reservations.
- Provider cost entries.
- Balance read model.
- Reconciliation queries.

All reservations and conversions happen in PostgreSQL transactions.

### `quality-review`

Owns:

- Validation facts.
- Review-required flags.
- Quality failure reasons.

It starts lightweight but is not optional, because PRD quality requirements are P0.

### `export`

Owns:

- Export workflows.
- Export manifests.
- Export package assets.

### `admin-ops`

Owns:

- Cross-module operational read models.
- Safe operational commands such as retry, provider disable, manual resolution.

It must call domain commands for writes.

### `audit`

Owns:

- Audit event creation.
- Sensitive operation trails.

Audit is not the economic ledger.

### `storage`

Owns:

- Storage adapter.
- Signed URL creation after tenant authorization.
- MinIO/object storage provider implementation.

## 5. Queue Baseline

P0 queues:

| Queue | Tasks |
| --- | --- |
| `workflow-control` | aggregate workflow status, repair dispatch, cancellation coordination. |
| `script` | parse script, extract assets, split shots. |
| `image` | calibration images and shot images. |
| `video` | image-to-video tasks. |
| `export` | package generation. |
| `quality` | validation and review support tasks. |
| `maintenance` | reconciliation, stale task repair, balance reconciliation. |

Concurrency is configured by queue and provider capability. Video workers should scale separately from script and export workers.

## 6. Task Claim Protocol

Workers claim with a conditional database transaction. The transaction creates the attempt and lease together.

```sql
BEGIN;

SELECT *
FROM tasks
WHERE id = $task_id
  AND organization_id = $organization_id
  AND status = 'queued'
FOR UPDATE;

INSERT INTO task_attempts (
  id,
  organization_id,
  workspace_id,
  project_id,
  workflow_id,
  task_id,
  attempt_number,
  status,
  locked_by,
  locked_until,
  heartbeat_at,
  started_at
)
VALUES (
  $attempt_id,
  $organization_id,
  $workspace_id,
  $project_id,
  $workflow_id,
  $task_id,
  $next_attempt_number,
  'running',
  $worker_id,
  now() + interval '2 minutes',
  now(),
  now()
);

UPDATE tasks
SET status = 'running',
    current_attempt_id = $attempt_id,
    locked_by = $worker_id,
    locked_until = now() + interval '2 minutes',
    heartbeat_at = now(),
    updated_at = now()
WHERE id = $task_id
  AND organization_id = $organization_id
  AND status = 'queued';

COMMIT;
```

If no row returns, another worker already claimed or canceled the task. The BullMQ job exits without side effects.

Workers heartbeat while doing pre-provider and provider work:

```sql
UPDATE tasks
SET heartbeat_at = now(),
    locked_until = now() + interval '2 minutes'
WHERE id = $task_id
  AND current_attempt_id = $attempt_id
  AND locked_by = $worker_id
  AND status = 'running';

UPDATE task_attempts
SET heartbeat_at = now(),
    locked_until = now() + interval '2 minutes'
WHERE id = $attempt_id
  AND locked_by = $worker_id
  AND status = 'running';
```

Repair rules:

- `running` task with expired `locked_until` and no provider request: mark attempt failed retryable and requeue task.
- `running` task with expired `locked_until` and provider request whose `external_submission_started_at` is null: mark attempt failed retryable and requeue task.
- `running` task with expired `locked_until` and provider request whose `external_submission_started_at` is set but no terminal provider status: move task/attempt to `result_unknown` and reconcile.
- `running` task with expired `locked_until` and provider request `accepted/running/result_unknown`: move task/attempt to `result_unknown` and reconcile.
- `running` task with expired `locked_until` and provider request `succeeded`: run finalization.
- `running` task with expired `locked_until` and provider request `failed`: fail or retry according to normalized provider error.

Attempt creation must be inside the claim transaction, not an untracked in-memory action.

Before any provider call, the worker creates the provider request intent in PostgreSQL:

```sql
BEGIN;

INSERT INTO provider_requests (
  id,
  organization_id,
  workspace_id,
  project_id,
  workflow_id,
  task_id,
  attempt_id,
  provider,
  capability,
  model,
  client_request_id,
  status,
  request_hash,
  adapter_policy_snapshot_json,
  submitted_at,
  external_submission_started_at
)
VALUES (
  $provider_request_id,
  $organization_id,
  $workspace_id,
  $project_id,
  $workflow_id,
  $task_id,
  $attempt_id,
  $provider,
  $capability,
  $model,
  $client_request_id,
  'submitted',
  $request_hash,
  $adapter_policy_snapshot_json,
  now(),
  null
);

COMMIT;
```

Only after this commit may the worker mark external submission start and submit to the external provider with the same `client_request_id`:

```sql
UPDATE provider_requests
SET external_submission_started_at = now()
WHERE id = $provider_request_id
  AND organization_id = $organization_id
  AND attempt_id = $attempt_id
  AND external_submission_started_at IS NULL;
```

If `external_submission_started_at` is null during stale lease repair, no external provider call was attempted. Once it is set, recovery treats provider side effect as possible and uses the request row as the anchor for provider lookup, manual settlement, and abnormal cost reconciliation.

## 7. Finalization Protocol

Worker success finalization:

1. Begin transaction.
2. Lock task and attempt.
3. Lock target row such as shot/export.
4. Validate active generation intent.
5. Insert immutable asset version if output exists.
6. Update current pointer only if intent matches.
7. Insert initial quality review fact or completed validation result.
8. Convert or release credit reservation.
9. Insert provider cost entry.
10. Update attempt/task/workflow.
11. Insert audit event.
12. Insert outbox events.
13. Commit.

No worker should mark a task successful before this transaction commits.

## 8. API Boundary

Use command-style endpoints for expensive operations:

```text
POST /projects/:projectId/script/parse
POST /projects/:projectId/assets/confirm
POST /projects/:projectId/shots/split
POST /projects/:projectId/calibration/generate
POST /projects/:projectId/shots/:shotId/image/generate
POST /projects/:projectId/shots/:shotId/video/generate
POST /projects/:projectId/export
```

Each command accepts or derives an idempotency key.

Read endpoints return durable state from PostgreSQL, never BullMQ-only state.

## 9. Testing Baseline

Required test categories before beta:

- Contract tests that ensure state values match `docs/architecture/p0-state-dictionary.md`.
- Unit tests for state transition functions.
- Integration tests for credit reservation concurrency.
- Integration tests for task claim concurrency.
- Integration tests for finalization transaction rollback.
- Integration tests that provider request rows are committed before external provider submission.
- Integration tests that one credit allocation cannot be both consumed and released.
- Integration tests for workflow aggregation when child tasks are `result_unknown` or `manual_review_required`.
- Integration tests for tenant-scoped queries and signed URL auth.
- Provider adapter contract tests with fake providers.
- Recovery tests from `docs/architecture/p0-execution-and-recovery-spec.md`.

## 10. Confidence Gate

Architecture can enter implementation planning when these docs exist:

- System architecture.
- Decision log.
- Data schema draft.
- Execution and recovery spec.
- Implementation baseline.

Implementation can enter beta only when these tests pass:

- Credit reservation cannot oversell under concurrency.
- Redis job loss can be repaired from PostgreSQL.
- Provider unknown result does not blindly duplicate generation.
- Provider submission always has a pre-existing durable `provider_requests` row.
- Worker finalization is atomic.
- Credit allocation settlement is single-outcome under concurrency.
- Tenant-scoped query tests and signed URL auth tests pass.
- Concurrent regeneration cannot move stale output to current.
