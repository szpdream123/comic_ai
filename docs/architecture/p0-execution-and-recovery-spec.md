# P0 Execution and Recovery Spec

> Status: Draft
> Depends on: `docs/architecture/p0-system-architecture.md`, `docs/architecture/p0-data-schema-draft.md`

This document defines P0 execution state machines, provider adapter requirements, and failure recovery tests. Its job is to prevent expensive long-running AI work from becoming ambiguous.

## 1. Execution Invariants

1. PostgreSQL is the source of truth for workflow, task, attempt, provider request, credit, asset, and audit facts.
2. BullMQ jobs are dispatch hints. A BullMQ job never proves business state.
3. A task describes intent. An attempt describes one execution try.
4. Provider fallback creates a new attempt.
5. Unknown provider results are represented as `result_unknown`.
6. Worker finalization is one PostgreSQL transaction for local facts.
7. Current asset pointers update only when the completing attempt still matches the active generation intent.
8. Credit reservations are created before dispatch and converted or released during finalization.
9. Task claim creates an attempt and lease in the same transaction.
10. Stale running recovery is driven by lease expiry plus provider request state.
11. Provider request intent is durable before any external provider submission.

## 2. Workflow State Machine

| Current | Event | Next | Notes |
| --- | --- | --- | --- |
| `queued` | first child task starts | `running` | Stored for fast project/task lists. |
| `queued` | cancel before work starts | `canceled` | Release reservations. |
| `running` | all child tasks succeeded | `succeeded` | Trigger business completion event. |
| `running` | some child tasks succeeded and some failed | `partial_succeeded` | Used for batch shot generation. |
| `running` | all child tasks failed | `failed` | Workflow-level failure reason is aggregate. |
| `running` | user requests cancel | `cancel_requested` | Child queued tasks should cancel; running tasks may continue. |
| `cancel_requested` | all cancelable tasks canceled | `canceled` | Release reservations for canceled work. |
| `cancel_requested` | running task succeeds | `partial_succeeded` or `succeeded` | Charge only successful work. |
| any non-terminal | any child task enters `result_unknown` | `result_unknown` | Reconciliation blocks terminal aggregation. |
| any non-terminal | any child task enters `manual_review_required` | `manual_review_required` | Human settlement blocks terminal aggregation. |
| `result_unknown` | all unknown child tasks reconciled | aggregate from child task states | May become running, partial_succeeded, succeeded, failed, or canceled. |
| `manual_review_required` | all manual-review child tasks settled | aggregate from child task states | May become running, partial_succeeded, succeeded, failed, or canceled. |
| any terminal | retry | new workflow or new child tasks | Terminal records are not reopened. |

Terminal workflow states:

- `succeeded`
- `partial_succeeded`
- `failed`
- `canceled`

A workflow cannot enter a terminal state while any child task is `result_unknown` or `manual_review_required`, or while any reservation allocation is unsettled.

## 3. Task State Machine

| Current | Event | Next | Notes |
| --- | --- | --- | --- |
| `queued` | worker claims task | `running` | Claim must be conditional on current status. |
| `queued` | user/system cancels | `canceled` | No attempt should start. |
| `running` | attempt succeeded | `succeeded` | Finalization transaction applies business changes. |
| `running` | attempt failed retryable and attempts remain | `queued` | Create next attempt on next claim or immediately before dispatch. |
| `running` | attempt failed not retryable | `failed` | Release or settle credits according to policy. |
| `running` | provider result unknown | `result_unknown` | Reconciliation required before retry. |
| `running` | user requests cancel | `cancel_requested` | Attempt may continue depending provider capability. |
| `cancel_requested` | provider cancel succeeds | `canceled` | Release reservation if no output/cost. |
| `cancel_requested` | provider succeeds anyway | `succeeded` | Convert reservation to consumption. |
| `result_unknown` | reconciliation finds success | `succeeded` | Finalize once. |
| `result_unknown` | reconciliation finds failure | `failed` or `queued` | Retry only if adapter says safe. |
| `result_unknown` | lookup TTL expires | `manual_review_required` | Keep reservation unresolved; Admin/Ops must decide output and cost. |
| `manual_review_required` | manual resolution finds success/output | `succeeded` | Finalize once, consume the linked reservation allocation. |
| `manual_review_required` | manual resolution confirms no output/no billable cost | `failed` or `queued` | Release allocation or retry only when safe. |
| `manual_review_required` | manual resolution confirms provider cost but unusable output | `failed` | Release user credits unless policy says otherwise; record abnormal provider cost. |

Terminal task states:

- `succeeded`
- `failed`
- `canceled`

`result_unknown` and `manual_review_required` are non-terminal settlement states. They block automatic duplicate generation and block ordinary failure release until provider output and cost are known enough to settle.

### 3.1 Lease and Stale Running Repair

Task and attempt leases use:

- `locked_by`
- `locked_until`
- `heartbeat_at`
- `current_attempt_id`

Repair rules:

| Condition | Repair |
| --- | --- |
| `running` expired lease, no provider request exists | Mark attempt failed retryable and requeue task if attempts remain. |
| `running` expired lease, provider request exists but `external_submission_started_at` is null | Mark attempt failed retryable and requeue task if attempts remain; no external provider call was attempted. |
| `running` expired lease, provider request has `external_submission_started_at` but no provider terminal status | Move task and attempt to `result_unknown`; reconciliation owns next step. |
| `running` expired lease, provider request accepted/running | Move task and attempt to `result_unknown`; reconciliation owns next step. |
| `running` expired lease, provider request succeeded | Run finalization transaction exactly once. |
| `running` expired lease, provider request failed retryable | Mark attempt failed and requeue or fallback if safe. |
| `running` expired lease, provider request failed non-retryable | Fail task and settle allocation according to policy. |

### 3.2 Provider Request Pre-Call Persistence

Before a worker submits to a provider:

1. Generate a stable `clientRequestId` for the attempt/provider/capability.
2. Insert `provider_requests` with `status = submitted`, `attempt_id`, `client_request_id`, `request_hash`, and adapter policy snapshot.
3. Commit the local transaction.
4. Immediately before the external call, set `external_submission_started_at = now()`.
5. Submit to the provider using the same `clientRequestId`.
6. Update `provider_requests` with accepted/running/succeeded/failed/result_unknown after the provider response.

If the worker crashes after step 3 but before step 4, stale lease repair can safely requeue according to retry policy. If it crashes after step 4, recovery conservatively treats provider side effect as possible and uses the durable local request record for provider lookup, manual settlement, and cost reconciliation.

## 4. Attempt State Machine

| Current | Event | Next | Notes |
| --- | --- | --- | --- |
| `created` | worker starts attempt | `running` | Attempt number is immutable. |
| `running` | provider returns success | `succeeded` | Finalization transaction follows. |
| `running` | provider returns retryable failure | `failed` | Task may enqueue another attempt. |
| `running` | provider returns non-retryable failure | `failed` | Task fails. |
| `running` | provider accepted but local status unknown | `result_unknown` | Provider reconciliation needed. |
| `running` | cancellation confirmed | `canceled` | Only if provider cancel or no provider call occurred. |
| `result_unknown` | reconciliation success | `succeeded` | Store provider output and finalize. |
| `result_unknown` | reconciliation failure with known no-output/no-cost | `failed` | Retry only if safe. |
| `result_unknown` | lookup TTL expires | `manual_review_required` | Attempt remains unresolved for settlement. |
| `result_unknown` | manual resolution | `succeeded` or `failed` | Admin action is audited. |

Attempt records are historical execution facts. A failed attempt is not changed back to running.

`manual_review_required` must not be treated as failure by credit settlement. A reservation allocation linked to this attempt remains held until manual resolution consumes, releases, or records abnormal internal cost.

## 5. Shot State Transitions

### 5.1 Content State

| Current | Event | Next | Guard |
| --- | --- | --- | --- |
| `draft` | required fields completed | `ready` | Shot has core message and visual description. |
| `ready` | meaningful shot content/reference/prompt changes | `stale` | Increment `content_revision`. |
| `stale` | user saves valid content | `ready` | Required fields remain complete. |

Changing content or references increments `content_revision` and marks completed image/video outputs stale when they depend on the prior content revision.

### 5.2 Image State

| Current | Event | Next | Guard |
| --- | --- | --- | --- |
| `draft` | content becomes ready | `ready` | `content_status = ready`. |
| `ready` | image workflow created | `generating` | Credit reservation succeeds. |
| `generating` | active image task succeeds | `completed` | Attempt matches `active_image_task_id` or `content_revision`. |
| `generating` | active image task fails | `failed` | Failure is user-repairable or retryable. |
| `completed` | shot content/reference/prompt changes | `stale` | Increment `content_revision`. |
| `failed` | user edits or retries | `generating` | New active task. |
| `stale` | regenerate image | `generating` | New active task. |

Late success from a stale image task:

- Create historical `asset_version`.
- Do not update `current_image_asset_version_id`.
- Audit as stale completion if useful for Ops.

### 5.3 Video State

| Current | Event | Next | Guard |
| --- | --- | --- | --- |
| `not_ready` | image completed | `ready` | This may be a derived API state. |
| `ready` | video workflow created | `generating` | Credit reservation succeeds. |
| `generating` | active video task succeeds | `completed` | Attempt matches `active_video_task_id` or `content_revision`. |
| `generating` | active video task fails | `failed` | Show repair guidance. |
| `completed` | image or video prompt changes | `stale` | Increment `content_revision` or create a new video generation intent. |
| `failed` | user edits or retries | `generating` | New active task. |
| `stale` | regenerate video | `generating` | New active task. |

## 6. Credit Reservation State

| Event | Ledger Entry | Effect |
| --- | --- | --- |
| Organization receives credits | `grant` | Increases available balance. |
| Workflow created | `reservation` | Reduces available balance and increases reserved balance. |
| Task succeeds | `consume` | Converts reservation to spent credits. |
| Task fails before billable success | `release` | Releases reservation allocation back to available balance. |
| Task canceled while queued | `release` | Releases reservation. |
| Task enters `result_unknown` / `manual_review_required` | no release or consume yet | Reservation allocation remains held until settlement. |
| Provider abnormal cost | provider cost entry | Internal cost only unless policy changes. |
| Manual correction | `adjustment` | Audited admin action. |

Required invariant:

```text
available = sum(available_delta)
reserved = sum(reserved_delta)
consumed = sum(consumed_delta)
available + reserved + consumed = total granted credits + net adjustments
```

No implementation should infer reservation state from task status alone. The ledger is the accounting truth; workflow/task state only explains why a ledger entry exists.

### 6.1 Per-Task Reservation Allocation

Batch workflows reserve at workflow creation, but settle at task granularity.

Required flow:

1. Create `credit_reservations` for the workflow.
2. Create one `credit_reservation_allocations` row per billable task.
3. Insert `reservation` ledger entries that reference the reservation and allocation.
4. On task success, insert one `consume` ledger entry for that allocation.
5. On task failure or queued cancellation, insert one `release` ledger entry for that allocation.
6. On `result_unknown` or `manual_review_required`, keep the allocation reserved until reconciliation or manual settlement.

Settlement is a row-locked state transition on `credit_reservation_allocations`. The transaction locks the allocation, verifies it is still unsettled, inserts exactly one settlement ledger entry (`consume` or `release`), and updates the allocation status. A partial unique index on settlement ledger rows prevents an allocation from being both consumed and released.

## 7. Calibration Gate

Batch shot image generation is allowed only when durable calibration facts permit it.

Valid gates:

- Latest active `calibration_session.status = passed`.
- Latest active `calibration_session.status = skipped` with authorized decision and reason.
- Explicit authorized override decision recorded in `calibration_decisions`.

Invalid gates:

- UI-only flag.
- Quality review rows without a calibration session.
- Three generated images with no pass/skip decision.

Calibration item failures keep the session in `failed` or `ready_for_review` and block batch generation until the user fixes, regenerates, skips, or overrides with permission.

## 8. ProviderAdapter Interface

Provider adapters are capability-oriented. Creation modules never call provider SDKs.

```ts
type ModelCapability =
  | "parse_script"
  | "extract_assets"
  | "split_storyboard_shots"
  | "generate_image"
  | "generate_video_from_image"
  | "moderate_input"
  | "quality_review";

type BillingTrigger = "on_accept" | "on_success" | "on_output" | "unknown";

type RetrySafety =
  | "safe_without_provider_side_effect"
  | "safe_with_client_request_id"
  | "unsafe_may_duplicate_cost_or_output"
  | "manual_review_required";

interface ProviderAdapterCapabilities {
  provider: string;
  model: string;
  capability: ModelCapability;
  supportsClientRequestId: boolean;
  supportsStatusLookup: boolean;
  supportsCancel: boolean;
  billingTrigger: BillingTrigger;
  retrySafety: RetrySafety;
  outputLookupTtlSeconds: number;
}

interface ProviderAdapter<TInput, TOutput> {
  capabilities(): ProviderAdapterCapabilities;

  submit(input: {
    clientRequestId: string;
    payload: TInput;
    tenantContext: {
      organizationId: string;
      workspaceId?: string;
      projectId?: string;
    };
    traceContext: {
      workflowId: string;
      taskId: string;
      attemptId: string;
    };
  }): Promise<ProviderSubmitResult<TOutput>>;

  lookup?(input: {
    clientRequestId?: string;
    providerRequestId?: string;
  }): Promise<ProviderLookupResult<TOutput>>;

  cancel?(input: {
    clientRequestId?: string;
    providerRequestId?: string;
  }): Promise<ProviderCancelResult>;
}
```

These capability fields are persisted in `provider_capabilities`. When a provider request is created, the worker copies the relevant retry, lookup, cancel, and billing policy into the `provider_requests` policy snapshot. Reconciliation uses the request snapshot first, not whatever the adapter reports at a later time.

### 8.1 Normalized Submit Result

```ts
type ProviderSubmitResult<TOutput> =
  | {
      status: "succeeded";
      providerRequestId?: string;
      output: TOutput;
      cost?: ProviderCost;
      rawResponseRef?: string;
    }
  | {
      status: "accepted" | "running";
      providerRequestId?: string;
      cost?: ProviderCost;
      rawResponseRef?: string;
    }
  | {
      status: "failed";
      providerRequestId?: string;
      error: NormalizedProviderError;
      cost?: ProviderCost;
      rawResponseRef?: string;
    }
  | {
      status: "result_unknown";
      providerRequestId?: string;
      error: NormalizedProviderError;
      cost?: ProviderCost;
      rawResponseRef?: string;
    };
```

### 8.2 Normalized Error Codes

| Code | Retry Policy |
| --- | --- |
| `provider_timeout_before_accept` | Retry if no provider side effect. |
| `provider_timeout_after_accept` | Move to `result_unknown`; reconcile. |
| `provider_rate_limited` | Retry later or fallback. |
| `provider_rejected_content` | Do not fallback automatically. |
| `provider_failed_retryable` | Retry or fallback. |
| `provider_failed_non_retryable` | Fail task. |
| `provider_output_invalid` | Fail or quality review depending output. |
| `provider_cost_unknown` | Continue business flow but flag Ops if output succeeded. |
| `provider_result_unknown` | Reconcile or manual review. |

## 9. Worker Finalization Transaction

A successful generation attempt finalizes with one database transaction:

1. Lock task row.
2. Verify task is still the active generation intent for the target shot or export.
3. Lock relevant business row, such as shot.
4. Insert asset version if output exists.
5. Update current pointer only if active intent matches.
6. Insert initial quality review fact, such as `not_checked` / `review_required`, or a completed validation result.
7. Insert provider cost entry if known.
8. Convert or release credit reservation.
9. Update attempt and task status.
10. Update workflow aggregate status.
11. Insert audit event.
12. Insert outbox event for UI notification or downstream work.

If any step fails, the transaction rolls back. The task remains recoverable from the previous state.

## 10. Recovery and Failure Test Matrix

These tests are architecture acceptance tests. They should become automated integration tests once implementation starts.

| ID | Scenario | Expected Result |
| --- | --- | --- |
| R-001 | Redis loses queued jobs after workflow creation | Repair dispatcher rebuilds BullMQ jobs from PostgreSQL queued tasks. |
| R-002 | User double-clicks batch generate | Same idempotency key returns existing workflow; no duplicate reservation. |
| R-003 | Two API servers create same workflow concurrently | Operation-scoped `idempotency_records` allows only one command winner; concurrent callers receive the same workflow result. |
| R-004 | Two workers claim same task | Conditional update lets one worker claim; the other exits safely. |
| R-005 | Worker crashes before provider call after claim | Lease expires; repair marks attempt failed retryable and requeues task; no provider cost. |
| R-006 | Worker crashes after provider accept before local success | Attempt becomes or remains `result_unknown`; reconciliation handles it. |
| R-007 | Provider timeout before accept | Retry is allowed if adapter marks no side effect. |
| R-008 | Provider timeout after accept | No blind retry; status lookup or Ops review required. |
| R-009 | Provider succeeds but cost missing | Business output can finalize; provider cost entry uses `unknown` or `estimated` and flags Ops. |
| R-010 | Primary provider rate limited | Fallback attempt is created if backup supports capability and retry is safe. |
| R-011 | Provider content safety rejection | No automatic fallback; task fails with content safety reason. |
| R-012 | Credit balance changes while workflow is being created | Reservation transaction uses row lock or serializable check; cannot oversell. |
| R-013 | Batch has partial success | Successful tasks consume reservations; failed tasks release reservations; workflow is `partial_succeeded`. |
| R-014 | Queued task canceled | Task is `canceled`; reservation released. |
| R-015 | Running task cancel requested but provider succeeds | Task finalizes success; reservation converts to consumption. |
| R-016 | Shot edited while image generation running | `content_revision` increments; late generation stores asset version but does not become current. |
| R-017 | Two regenerations finish out of order | Only active task or matching `content_revision` updates current pointer. |
| R-018 | Export starts with missing assets | Export workflow is not created unless user explicitly confirms incomplete export. |
| R-019 | Signed URL requested by viewer from another org | Backend denies before object storage URL creation. |
| R-020 | Admin/Ops retries failed task | New attempt is created; old attempt remains immutable. |
| R-021 | Outbox event dispatched twice | Inbox/processed-event constraint prevents duplicate side effects. |
| R-022 | Balance cached field drifts | Reconciliation query detects drift from ledger and repairs read model. |
| R-023 | Provider lookup TTL expires for unknown result | Attempt/task move to `manual_review_required`; reservation allocation remains held; no automatic duplicate generation. |
| R-024 | Quality review fails calibration image | Calibration cannot pass until fixed, regenerated, or explicitly overridden by authorized role. |
| R-025 | Hard deletion requested for project | P0 archives or soft deletes user content; financial/audit records remain retained. |
| R-026 | Worker crashes after provider request row commit but before `external_submission_started_at` | Stale lease repair sees no external submission start and can safely requeue or retry according to persisted policy. |
| R-027 | Worker crashes after `external_submission_started_at` but before local response handling | Recovery treats provider side effect as possible and uses persisted `provider_requests.client_request_id` and policy snapshot for lookup or manual review; no blind retry. |
| R-028 | Same allocation receives concurrent consume and release attempts | One transaction wins; the other fails on row state or partial unique settlement constraint. |
| R-029 | Child task enters `manual_review_required` inside batch workflow | Parent workflow becomes `manual_review_required` and cannot enter terminal aggregate status until settlement completes. |

## 11. Remaining Confidence Gaps

This spec closes the highest-risk architecture gaps, but implementation still needs proof through:

1. A real migration set with constraints and indexes.
2. A task claim query and worker finalization transaction prototype.
3. A provider adapter stub that simulates timeout-before-accept, timeout-after-accept, success, cost missing, and content rejection.
4. A credit reservation concurrency test.
5. A tenant-scope query test and signed URL authorization test.

Until those exist and pass, implementation confidence cannot honestly be 100%.
