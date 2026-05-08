# AI Comic Platform P0 System Architecture

> Status: Draft
> Primary PRD: `docs/product/reelmate-core-replication-prd.md`
> Decision log: `docs/architecture/decision-log.md`
> Schema draft: `docs/architecture/p0-data-schema-draft.md`
> Execution spec: `docs/architecture/p0-execution-and-recovery-spec.md`
> Implementation baseline: `docs/architecture/p0-implementation-baseline.md`
> State dictionary: `docs/architecture/p0-state-dictionary.md`

## 1. Architecture Goal

Build a phased AI comic drama creation platform. P0-A is an internal alpha for validating the creator loop. P0-B is the commercial beta reliability gate.

1. Script to parsed episodes, assets, storyboard shots, generated images, generated videos, and export packages.
2. An internal video/image model gateway abstraction in P0-A, with at least two routable providers from P0-B.
3. Durable long-running task execution with cost tracking, retry, failure recovery, and operations visibility from the P0-B commercial beta gate.

The phased P0 optimizes for creator workflow learning first, then commercial-beta reliability. It deliberately avoids becoming a public model relay product in the first release, while keeping the model gateway separable for future externalization.

## 2. First Principles

### 2.1 Durable Truth Beats Fast Dispatch

PostgreSQL is the truth source for task state, business ownership, costs, audit, inputs, and outputs. Redis/BullMQ is only the execution dispatcher.

If Redis is lost, the system must be able to rebuild executable work from PostgreSQL.

### 2.2 Business State and Execution State Are Different

Workflow/Task records describe execution. Project, Asset, Shot, Export, and Credit records describe business facts.

Execution success may trigger business state changes, but execution state must not be the only place where product state lives.

### 2.3 Expensive Work Must Be Idempotent

AI generation is costly, slow, and failure-prone. Every workflow creation, task execution, provider request, asset version creation, credit consumption, and export package generation needs an idempotency strategy.

### 2.4 Versions Over Mutation

Generated assets are immutable versions. Regeneration creates a new version and moves a current pointer. Historical versions remain available for audit, debugging, and future rollback.

### 2.5 Modular Monolith First, Service Extraction Later

The P0 backend is one deployable modular monolith with hard internal domain boundaries. Services are extracted only after operational pressure proves the boundary is worth the cost.

## 3. Recommended Architecture Approach

### 3.1 Options Considered

| Option | Shape | Strength | Weakness | Verdict |
| --- | --- | --- | --- | --- |
| Single app, thin modules | One backend with mostly shared services | Fastest initial coding | Long-term boundaries collapse; model calls and task state leak everywhere | Reject |
| Microservices from day one | Separate services for auth, project, task, gateway, billing, asset | Clean deployment boundaries | Too much operational complexity for P0 | Reject |
| Modular monolith plus scalable workers | One API, domain modules, separate worker processes, shared DB, queues | Strong boundaries with manageable operations | Requires discipline in module ownership | Choose |

### 3.2 Chosen Shape

```text
Frontend Web App
  -> Backend API Modular Monolith
    -> PostgreSQL
    -> Redis/BullMQ
    -> Object Storage
    -> Model Providers

Worker Processes
  -> PostgreSQL
  -> Redis/BullMQ
  -> Object Storage
  -> Model Providers via ModelGateway module

Outbox Dispatcher
  -> PostgreSQL
  -> Redis/BullMQ
```

The backend API, workers, and outbox dispatcher can share the same codebase and modules, but run as different processes.

## 4. Product Surfaces

### 4.1 Creator Workspace

Primary user-facing surface for creators and production teams.

P0 areas:

- Project list.
- Project workspace.
- Script input and parsing.
- Public assets: characters, scenes, props.
- Storyboard shots.
- Style calibration.
- Shot image generation.
- Shot image-to-video generation.
- Export packages.

### 4.2 Operations/Admin Console

Operational surface required for commercial beta reliability.

P0 areas:

- Organizations and quota.
- Workflow and task search.
- Failed and stuck task diagnosis.
- Provider health.
- Provider request history.
- Cost and margin views.
- Abnormal event audit.

The public developer console for the model gateway is not P0.

## 5. Backend Modules

### 5.1 Module Map

| Module | Owns | Does Not Own |
| --- | --- | --- |
| Identity/Auth | users, login, sessions, auth adapters | organization quota, project permissions |
| Organization | organizations, workspaces, memberships, roles | project workflow state |
| Project | projects, scripts, episodes, project lifecycle | model provider calls |
| Asset | assets, asset versions, object metadata | provider routing |
| Shot | storyboard shots, shot status, shot references | binary storage |
| Workflow/Task | workflows, tasks, attempts, execution state | business state as final product truth |
| ModelGateway | provider adapters, provider requests, routing, provider error normalization | creator workflow state, credit policy |
| Commerce/Payment | credit packages, orders, payment intents, payment provider events, refunds, invoice metadata | credit balance, generation consumption, provider model calls |
| Credit/Billing | credit ledger, provider cost ledger, balance read models | provider HTTP calls |
| Quality/Review | validation results, review requirements, quality failure reasons | provider routing, asset storage |
| Export | export jobs, package manifests, download metadata | object storage implementation |
| Admin/Ops | operational queries and actions | domain ownership |
| Audit | important user and system events | economic ledger truth |
| Storage | storage adapter, signed URLs, object metadata helpers | business asset meaning |
| Notification | future task completion notifications | workflow execution truth |

### 5.2 Dependency Direction

```text
API Controllers
  -> Application Commands / Queries
    -> Domain Modules
      -> Infrastructure Adapters
```

Rules:

- Creation modules do not import provider SDKs.
- ModelGateway does not own creator domain state.
- Commerce/Payment owns cash/payment facts, but not credit balance.
- Credit/Billing consumes task and provider facts, but does not execute provider calls.
- Storage is an adapter, not a business module.
- Admin/Ops reads across modules, but writes only through domain commands.

## 6. Tenant and Permission Model

### 6.1 Tenant Hierarchy

```text
Organization
  -> Workspace
    -> Project
      -> Script
      -> Episode
      -> Asset
      -> Shot
      -> Workflow
      -> Export
```

Core records include non-null `organization_id`. Workspace/project-scoped records include non-null `workspace_id` and `project_id` where applicable.

Database constraints should carry tenant scope, not only application convention:

- Business foreign keys include tenant context where practical, such as `(organization_id, project_id)`.
- High-risk tables use composite indexes that begin with `organization_id`.
- Repository/query helpers require tenant scope inputs.
- PostgreSQL RLS should be evaluated before production; if not enabled in P0, the codebase must still be structured so RLS can be added without rewriting all queries.
- Object storage signed URL creation is a backend command that checks tenant authorization before issuing a URL.

### 6.2 Roles

P0 roles follow the PRD:

- Owner/Admin.
- Producer.
- Creator.
- Viewer.

Authorization is enforced server-side at command and query boundaries. UI hiding is only a usability layer.

### 6.3 Permission Rule

Every request resolves:

```text
actor
organization
workspace
role/capability
```

No list or detail query should be written without tenant scope. This is a core data safety invariant.

## 7. Workflow and Task Architecture

### 7.1 Three-Layer Model

```text
Workflow
  -> Task
    -> Attempt
```

Workflow examples:

- Script parsing workflow.
- Asset extraction workflow.
- Style calibration workflow.
- Batch shot image generation workflow.
- Single shot video generation workflow.
- Export package workflow.

Task examples:

- Generate calibration image for shot 3.
- Generate image for shot 12.
- Generate video for shot 12.
- Package project export.

Attempt examples:

- First try on primary provider.
- Retry on same provider.
- Fallback try on backup provider.

### 7.2 State Ownership

Workflow/Task owns execution states. Canonical values are defined in `docs/architecture/p0-state-dictionary.md`.

```text
queued
running
succeeded
failed
canceled
cancel_requested
partial_succeeded
result_unknown
manual_review_required
```

Workflow aggregation gives `manual_review_required` and `result_unknown` precedence over terminal states. A workflow must not be marked `succeeded`, `failed`, `partial_succeeded`, or `canceled` while any child task or reservation allocation is unresolved.

Shot owns content, image, and video states. PRD labels such as `image_generating` map to canonical DB/API values in `docs/architecture/p0-state-dictionary.md`.

```text
draft
ready
generating
completed
failed
stale
not_ready
```

`video_ready` is a PRD/UI label that maps to canonical video status `ready`.

Project owns `project_phase` and derived readiness flags. Older PRD project labels map to phase plus readiness in `docs/architecture/p0-state-dictionary.md`.

### 7.3 Dispatch Flow

```text
API command
  -> PostgreSQL transaction
    -> create workflow/task records
    -> create outbox event
  -> Outbox dispatcher
    -> enqueue BullMQ job
  -> Worker
    -> claim task/attempt in PostgreSQL
    -> call domain handler
    -> call ModelGateway if needed
    -> finalize in one PostgreSQL transaction
      -> update attempt/task state
      -> create asset versions
      -> update current pointers when generation intent still matches
      -> create credit ledger entries
      -> create audit events
      -> create outbox events
```

Worker finalization must be atomic for local facts. A worker must not mark an attempt `succeeded` in one transaction and update shot/assets/credits in later unrelated transactions.

Cross-module event consumers use an inbox or processed-event table keyed by event ID so replayed outbox events do not duplicate side effects.

### 7.4 Recovery Flow

If Redis loses jobs:

1. Scan PostgreSQL for queued tasks with no active BullMQ job.
2. Recreate outbox events or enqueue jobs.
3. Workers claim tasks idempotently.
4. Duplicate jobs are ignored through task and attempt state checks.

If a worker may call a provider:

1. The worker must create a durable `provider_requests` row before the external call.
2. The row records `status = submitted`, `attempt_id`, `client_request_id`, `request_hash`, capability, model, and the adapter policy snapshot used for this call.
3. Immediately before the external provider call, the worker sets `external_submission_started_at`.
4. Only after that update commits may the worker submit to the provider.
5. If the process crashes after provider acceptance, recovery has a stable local request record and client request ID for lookup or manual settlement. If it crashes before `external_submission_started_at`, repair can safely requeue because no external call was attempted.

If a worker crashes after provider success:

1. Provider request remains recorded because it was created before the provider call.
2. A recovery job inspects attempt/provider state.
3. If provider output exists, store output metadata and finish business state transitions.
4. If status is unknown, move the attempt to `result_unknown`.
5. A reconciliation worker uses the provider adapter status lookup contract when available.
6. If lookup is unavailable or TTL expires, surface the attempt in Admin/Ops for manual resolution.

Unknown provider results are not blindly retried. Retrying is allowed only when the provider adapter declares the failure mode safe for retry and the task idempotency key prevents duplicate business side effects.

## 8. Model Gateway Architecture

### 8.1 Capability-Oriented Interface

Creation modules request capabilities, not vendors.

Examples:

```text
generate_image
generate_video_from_image
parse_script
extract_assets
split_storyboard_shots
moderate_input
```

The gateway maps capabilities to provider adapters.

### 8.1.1 Provider Adapter Contract

Every provider adapter declares operational capabilities:

- `supportsClientRequestId`
- `supportsStatusLookup`
- `supportsCancel`
- `billingTrigger`: `on_accept`, `on_success`, `on_output`, or `unknown`
- `retrySafety`
- `safeRetryModes`
- `outputLookupTtlSeconds`

The gateway uses this contract to decide whether an unknown result can be reconciled, retried, canceled, or must be escalated to operations.

Provider capability policy is persisted in `provider_capabilities`. Each `provider_requests` row snapshots the policy used at submission time so recovery and manual settlement use the decision rules that were active for that request, even if adapters or admin configuration change later.

### 8.2 Provider Request Records

Every provider interaction records:

- Provider.
- Capability.
- Model.
- Request payload hash or snapshot.
- Client request ID generated before submission.
- Adapter policy snapshot used for retry/recovery decisions.
- Provider request ID.
- Attempt ID.
- Status.
- Error code.
- Raw cost when available.
- Normalized cost.
- Output object references.

### 8.3 Routing

P0-B uses health-aware primary/backup routing:

- Each capability has a primary and backup provider.
- Provider health, rate limits, and recent failures influence routing.
- Fallback creates a new attempt.
- Content safety failures do not silently fallback.
- Admin/Ops can disable a provider.

### 8.4 Normalized Errors

The gateway normalizes provider errors into platform error codes:

- `provider_timeout`
- `provider_rate_limited`
- `provider_rejected_content`
- `provider_failed`
- `provider_output_invalid`
- `provider_cost_unknown`
- `provider_result_unknown`

Business modules should not parse provider-specific error bodies.

## 8.4 Quality and Review Architecture

The PRD requires generated outputs to be usable, not merely completed. P0 therefore needs a lightweight Quality/Review module.

Quality/Review records:

- validation target: calibration image, shot image, or shot video.
- validation source: automated rule, model-assisted review, human review, or provider metadata.
- validation result: `passed`, `failed`, `review_required`, or `not_checked`.
- failure reason: role inconsistency, scene inconsistency, unreadable shot, motion failure, style mismatch, safety concern, or provider artifact.
- reviewer when human review is involved.

P0 does not need a perfect automated quality scorer. It does need durable validation facts so calibration pass, batch release, retry guidance, and operations diagnosis are based on recorded state rather than visual guesswork in the UI.

## 9. Asset Architecture

### 9.1 Asset Types

P0 asset types:

- Script source file.
- Character reference.
- Scene reference.
- Prop reference.
- Calibration image.
- Shot image.
- Shot video.
- Export package.

### 9.2 Asset and Version Split

```text
Asset
  -> AssetVersion
```

Asset describes business meaning. AssetVersion describes immutable binary output.

Example:

```text
Shot 12 current image -> asset_version_id
Shot 12 previous image versions remain stored
```

Current pointer updates must be protected against concurrent regeneration:

- A shot has a current generation intent, represented by `active_generation_task_id` or `content_revision`.
- A completed attempt can update `current_asset_version_id` only if it matches the active generation intent.
- Late results from stale attempts are stored as historical asset versions but do not become current.
- Editing shot text, references, or prompt increments `content_revision` and marks existing generated outputs stale.

### 9.3 Storage

Development uses MinIO. Production uses object storage behind the same adapter.

Database stores:

- object key.
- bucket.
- content type.
- size.
- checksum if available.
- storage provider.
- visibility.

Database does not store binary media.

## 10. Credit and Cost Architecture

### 10.1 User-Facing Credits

Creators see quota/credits, not provider-specific costs.

Before generation:

- Estimate credits.
- Check organization quota and optional project budget.
- Reserve/hold estimated credits in the same PostgreSQL transaction that creates the workflow/tasks.
- Allocate the reservation per billable task.
- Reject if insufficient.

After success:

- Convert reserved credits into consumption.
- Record provider cost.

After failure:

- Release reserved credits only when provider output/cost is known enough to settle.
- Keep allocations held for `result_unknown` and `manual_review_required`.
- Provider abnormal cost can still be recorded internally.

### 10.2 Ledger Records

Use append-only ledgers:

- Credit grants.
- Credit reservations.
- Credit reservation allocations.
- Credit consumption.
- Credit reservation releases.
- Credit adjustments.
- Provider costs.
- Abnormal cost events.

Balance fields are read models derived from ledgers.

### 10.3 Links

Economic records link to:

- Organization.
- Workspace/project when applicable.
- Workflow.
- Task.
- Attempt.
- Provider request.

This prevents cost drift during retries and provider fallback.

## 11. Data Model Sketch

This is a conceptual sketch. The detailed schema draft is in `docs/architecture/p0-data-schema-draft.md`.

```text
users
organizations
workspaces
memberships
projects
scripts
episodes
assets
asset_versions
shots
calibration_sessions
calibration_items
calibration_decisions
workflows
tasks
task_attempts
provider_requests
provider_capabilities
credit_ledger_entries
credit_reservations
credit_reservation_allocations
provider_cost_entries
quality_reviews
exports
export_items
audit_events
outbox_events
inbox_events
```

Important constraints:

- Unique idempotency keys for workflow/task creation.
- Unique provider request linkage where provider supports request IDs.
- Immutable ledger and attempt records.
- Tenant fields indexed on high-volume tables.
- Tenant-scoped foreign keys or composite uniqueness for project/workspace-owned records.
- Queue lookup indexes on task status and scheduled time.

## 12. Frontend Architecture

### 12.1 App Areas

```text
/app
  /projects
  /projects/:projectId
  /projects/:projectId/script
  /projects/:projectId/assets
  /projects/:projectId/shots
  /projects/:projectId/calibration
  /projects/:projectId/export

/admin
  /organizations
  /tasks
  /providers
  /costs
  /audit
```

### 12.2 UI Principles

- Project workspace is state-driven and shows the earliest blocking step.
- Long tasks show durable status from PostgreSQL-backed APIs.
- Refreshing the page must not create duplicate tasks.
- Failed tasks always expose retry or repair paths.
- Creator UI hides provider complexity.
- Admin UI exposes enough provider and task detail to debug failures.

## 13. Deployment Architecture

### 13.1 Local Development

Docker Compose:

- frontend.
- backend API.
- worker.
- outbox dispatcher.
- PostgreSQL.
- Redis.
- MinIO.

### 13.2 Production P0

Recommended:

- Containerized frontend.
- Containerized backend API.
- Containerized workers.
- Containerized dispatcher/scheduler.
- Managed PostgreSQL.
- Managed Redis.
- Managed object storage.

Workers scale independently by queue and capability.

## 14. Observability

### 14.1 Structured Logs

Include IDs where available:

- request_id.
- actor_id.
- organization_id.
- workspace_id.
- project_id.
- workflow_id.
- task_id.
- attempt_id.
- provider_request_id.

### 14.2 Metrics

Track:

- API latency and errors.
- queue depth.
- queue latency.
- task duration.
- attempt success/failure count.
- provider latency.
- provider failure rate.
- provider cost.
- credit consumption.
- export success/failure.

### 14.3 Operations Views

P0-A Admin Lite must answer the read-only subset needed for internal dogfood.

P0-B Admin/Ops must answer and act on the full commercial beta set:

- Which tasks are stuck?
- Which provider is failing?
- Which organization is consuming quota fastest?
- Which attempts incurred provider cost?
- Which failures are retryable?
- Which workflows are partially successful?

## 15. Security and Safety

### 15.1 Tenant Safety

- Tenant checks are mandatory on every command and query.
- Admin/Ops capabilities are separate from creator capabilities.
- Sensitive operations emit audit events.

### 15.2 Model Safety

- Explicit content safety boundary before provider submission.
- Normalize provider safety failures.
- Do not bypass safety failures through provider fallback.

### 15.3 Secrets

- Provider API keys live in server-side secret management.
- Provider keys never reach frontend.
- Logs must avoid raw prompts, files, and secrets unless explicitly redacted and access-controlled.

### 15.4 Deletion and Retention Boundary

Retention-first does not mean all user content is kept forever.

P0 data classes:

- Financial and audit records: retained for integrity and reconciliation.
- Provider request metadata: retained, with sensitive payloads redacted or hashed where possible.
- User content such as scripts, prompts, images, and videos: supports archive and soft delete in P0, with hard-delete/legal-hold policy designed before enterprise rollout.
- Logs: do not store raw sensitive prompts or media by default.

## 16. Scale Path

P0-B supports commercial beta by:

- Scaling workers horizontally.
- Separating queues by capability.
- Limiting concurrency per provider.
- Rebuilding Redis dispatch from PostgreSQL.
- Keeping object storage outside local disk.
- Using append-only cost and task facts.

Future extraction order if needed:

1. Worker pools by task type.
2. ModelGateway as separate internal service.
3. Export packaging service.
4. Analytics/cost reporting pipeline.
5. Public model gateway API and developer console.

## 17. Known Risks and Mitigations

| Risk | Why It Matters | Mitigation |
| --- | --- | --- |
| Duplicate task execution | Can duplicate cost and outputs | Idempotency keys, unique constraints, attempt records |
| Redis/PostgreSQL split-brain | Tasks disappear or duplicate | Transactional outbox, repair dispatcher |
| Provider result unknown | Worker crash or provider timeout after accepted work | Provider request records, status reconciliation, safe retry policy |
| Tenant data leak | Catastrophic trust failure | Server-side authorization and scoped queries |
| Cost drift | Business cannot understand margin | Append-only ledgers linked to attempts and provider requests |
| Asset overwrite | User loses generation history | Immutable asset versions |
| Gateway too thin | Future model relay becomes rewrite | Capability-based gateway, normalized errors and costs |
| Ops tooling postponed | Beta failures become invisible | P0-A Admin Lite for read-only internal diagnosis; P0-B Admin/Ops for retry, settlement, and provider controls |

## 18. Confidence Assessment

I am not at 100% implementation confidence yet because implementation details are still unset: real migrations, concrete provider APIs, deployment target, and executable recovery tests are not implemented.

I am confident enough to proceed from architecture discovery to detailed implementation planning because the hard system invariants are now clear:

- PostgreSQL owns truth.
- Redis/BullMQ owns dispatch.
- Workflow/Task/Attempt separates intent from execution.
- Assets and economic events are immutable.
- Provider calls flow through ModelGateway.
- Authorization is server-side and tenant-scoped.
- Operations visibility is part of P0.

The next design step is to turn this architecture into:

1. A concrete backend module layout.
2. A migration-ready database schema.
3. A task claim and finalization transaction prototype.
4. Provider adapter stubs for failure simulation.
5. A P0 implementation plan.
