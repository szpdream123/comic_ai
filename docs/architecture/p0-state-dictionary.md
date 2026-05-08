# P0 State Dictionary

> Status: M0 frozen canonical dictionary
> Purpose: define canonical states so PRD, database enums, API schemas, worker code, UI labels, and tests do not drift.

## 1. Rule

Implementation must treat this file as the canonical state dictionary.

Generated or manually synchronized artifacts should include:

- Database enum/check constraints.
- API response schemas.
- Frontend TypeScript types.
- Worker transition tests.
- Test fixtures.

PRD labels may remain user-readable, but backend state values should not fork across modules.

## 2. Identity and Tenant Status

### User

| Canonical | Meaning |
| --- | --- |
| `active` | User can authenticate and use memberships subject to org/member status. |
| `disabled` | User cannot authenticate or act. |

### Login Code

| Canonical | Meaning |
| --- | --- |
| `issued` | Code issued and may be verified before expiry. |
| `consumed` | Code was successfully used. |
| `expired` | Code expired and cannot be used. |
| `revoked` | Code was invalidated before use. |

### Auth Session

| Canonical | Meaning |
| --- | --- |
| `active` | Session can authenticate requests. |
| `revoked` | Session was explicitly logged out or invalidated. |
| `expired` | Session expired by lifecycle policy. |

### Organization

| Canonical | Meaning |
| --- | --- |
| `active` | Organization can use platform capabilities subject to quota and permissions. |
| `suspended` | Organization is blocked from new paid/expensive actions and may have read-only access. |
| `archived` | Organization is no longer active in normal product flows. |

### Workspace

| Canonical | Meaning |
| --- | --- |
| `active` | Workspace can contain active projects. |
| `archived` | Workspace is hidden or read-only according to product policy. |

### Membership

| Canonical | Meaning |
| --- | --- |
| `active` | Membership grants capabilities. |
| `invited` | Invitation exists but has not been accepted. |
| `disabled` | Membership no longer grants capabilities. |

## 3. Workflow Status

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `queued` | Workflow created but no child task running. | No |
| `running` | At least one child task is running. | No |
| `partial_succeeded` | Batch workflow has both success and failure/cancel states. | Yes for that run |
| `succeeded` | All required child tasks succeeded. | Yes |
| `failed` | Workflow cannot progress without new workflow/tasks. | Yes |
| `cancel_requested` | Cancel requested; running work may still finish. | No |
| `canceled` | Cancel completed for cancelable work. | Yes |
| `result_unknown` | At least one child task has unresolved provider side effect; reconciliation required. | No |
| `manual_review_required` | At least one child task requires human settlement before the workflow can close. | No |

Aggregation rule:

- If any child task is `manual_review_required`, workflow status is `manual_review_required`.
- Else if any child task is `result_unknown`, workflow status is `result_unknown`.
- Else terminal aggregation may produce `succeeded`, `partial_succeeded`, `failed`, or `canceled`.
- A workflow must not enter a terminal status while any child task has unsettled credits, provider result, or provider cost.

## 4. Task Status

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `queued` | Task is durable and dispatchable. | No |
| `running` | Worker has claimed task and lease is active. | No |
| `succeeded` | Task finalized successfully. | Yes |
| `failed` | Task failed after retry/recovery policy. | Yes |
| `cancel_requested` | Cancellation requested; provider may still succeed. | No |
| `canceled` | Task canceled without billable output. | Yes |
| `result_unknown` | Provider side effect may exist; reconciliation required. | No |
| `manual_review_required` | Automated reconciliation exhausted; human settlement required. | No |

## 5. Attempt Status

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `created` | Attempt row created but not yet executing. | No |
| `running` | Attempt lease active. | No |
| `succeeded` | Attempt produced accepted output. | Yes |
| `failed` | Attempt failed with normalized reason. | Yes |
| `canceled` | Attempt canceled before billable output. | Yes |
| `result_unknown` | Provider result/cost uncertain. | No |
| `manual_review_required` | Human settlement required. | No |

## 6. Provider Request Status

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `submitted` | Request sent locally. | No |
| `accepted` | Provider accepted work. | No |
| `running` | Provider reports in progress. | No |
| `succeeded` | Provider reports success or output retrieved. | Yes |
| `failed` | Provider reports failure. | Yes |
| `canceled` | Provider confirms cancellation. | Yes |
| `result_unknown` | Provider status uncertain. | No |
| `manual_review_required` | Human settlement required. | No |

## 7. Project Phase and Readiness

Project implementation stores coarse workflow phase separately from derived readiness flags. This avoids a single overloaded project status such as `image_partial_failed` vs `exportable`.

### Project Phase

| Canonical | Meaning |
| --- | --- |
| `script_input` | Project needs script input, script editing, parsing, or parse retry. |
| `asset_review` | Script has produced candidate assets and key public assets need confirmation. |
| `shot_generation` | Shots and calibration drive the main work; images/videos can be generated or repaired. |
| `export` | At least one exportable asset exists and export is the earliest primary action. |

Phase transition rule:

```text
script_input -> asset_review -> shot_generation -> export
```

Users may intentionally return to an earlier phase, such as replacing the script or fixing public assets. A local failure should expose a blocking reason and repair action; it should not collapse the whole project to a generic `failed`.

### Project Readiness Flags

Readiness flags are derived read-model values used for routing, CTA selection, and blocking reasons. They are not the accounting or execution truth.

| Flag | Meaning | Source of Truth |
| --- | --- | --- |
| `has_completed_images` | At least one shot image is completed. | `shots.image_status` and current image pointer. |
| `has_completed_videos` | At least one shot video is completed. | `shots.video_status` and current video pointer. |
| `has_exportable_assets` | Project has enough completed outputs to start export or export-incomplete flow. | Shot/export readiness query. |
| `has_partial_failures` | At least one local task or shot generation failed while other work can continue. | Task, workflow, and shot statuses. |
| `calibration_required` | Batch image generation requires calibration pass or authorized skip. | Calibration session and project policy. |
| `calibration_passed` | Latest active calibration session is passed, skipped, or overridden by an authorized decision. | `calibration_sessions` and `calibration_decisions`. |

### PRD/UI Legacy Mapping

The PRD may continue to use user-readable labels from the older single-status flow. Backend/API implementations should map them to phase plus readiness.

| PRD/UI Label | Canonical Representation |
| --- | --- |
| `project_draft` | No persisted project or draft creation form. |
| `script_input` | `project_phase = script_input`. |
| `parsing` | `project_phase = script_input` plus active script parse workflow/task. |
| `assets_pending` | `project_phase = asset_review` plus unconfirmed extracted assets. |
| `assets_reviewing` | `project_phase = asset_review`. |
| `shots_ready` | `project_phase = shot_generation` plus shots exist and calibration not passed. |
| `calibration_pending` | `project_phase = shot_generation` plus active/ready calibration session not passed. |
| `calibration_passed` | `project_phase = shot_generation` plus `calibration_passed = true`. |
| `image_generating` | `project_phase = shot_generation` plus active image workflow/task. |
| `image_partial_failed` | `project_phase = shot_generation` plus `has_partial_failures = true`. |
| `exportable` | `project_phase = export` or `has_exportable_assets = true`. |

## 8. Shot Status

Implementation stores content, image, and video status separately.

### Content Status

| Canonical DB/API | Meaning |
| --- | --- |
| `draft` | Shot is incomplete and cannot generate image yet. |
| `ready` | Shot has core message and visual description; image generation can start when gates pass. |
| `stale` | Shot content changed after prior generated outputs; existing outputs may remain viewable but should be treated as outdated. |

Content transition rule:

```text
draft -> ready
ready -> stale
stale -> ready
```

`content_revision` increments on meaningful edits to core message, visual description, dialogue, prompt, camera type, or attached references.

### Image Status

| Canonical DB/API | PRD/UI Label |
| --- | --- |
| `draft` | `draft` |
| `ready` | `ready` |
| `generating` | `image_generating` |
| `completed` | `image_completed` |
| `failed` | `image_failed` |
| `stale` | `image_stale` |

Image transition rule:

```text
draft -> ready -> generating -> completed
ready -> generating -> failed
completed -> stale -> generating
failed -> generating
```

Only the active image generation intent, represented by `active_image_task_id` and/or `content_revision`, may move `current_image_asset_version_id`. Late completions create historical asset versions but do not become current.

### Video Status

| Canonical DB/API | PRD/UI Label |
| --- | --- |
| `not_ready` | no video entry |
| `ready` | `video_ready` |
| `generating` | `video_generating` |
| `completed` | `video_completed` |
| `failed` | `video_failed` |
| `stale` | `video_stale` |

`video_ready` is a derived PRD/UI label when video status is `ready`.

Video transition rule:

```text
not_ready -> ready
ready -> generating -> completed
ready -> generating -> failed
completed -> stale -> generating
failed -> generating
```

`video_status = ready` is derived when a usable current image exists. If the current image changes or content/reference changes, a completed video becomes `stale` unless product policy explicitly allows it to remain current.

## 9. Calibration Status

### Calibration Session

| Canonical | Meaning |
| --- | --- |
| `draft` | Three shots not fully selected. |
| `generating` | Calibration item tasks running. |
| `ready_for_review` | Items generated and awaiting decision. |
| `passed` | Authorized pass decision recorded. |
| `failed` | User or quality review rejected session. |
| `skipped` | Authorized skip decision recorded with reason. |
| `archived` | Superseded session. |

### Calibration Item

| Canonical | Meaning |
| --- | --- |
| `pending` | Selected but not queued. |
| `generating` | Item image generation running. |
| `succeeded` | Item image generated. |
| `failed` | Item generation failed. |
| `review_required` | Item needs human or model-assisted review. |

## 10. Quality Review Result

| Canonical | Meaning |
| --- | --- |
| `passed` | Output is accepted for its gate. |
| `failed` | Output is not usable. |
| `review_required` | Human/model-assisted review needed. |
| `not_checked` | Quality result intentionally not evaluated yet. |

## 11. Credit Reservation Status

### Reservation Envelope

| Canonical | Meaning |
| --- | --- |
| `active` | Reservation has unsettled allocations. |
| `partially_settled` | Some allocations consumed/released. |
| `settled` | All allocations consumed. |
| `released` | All allocations released. |
| `manual_review_required` | At least one allocation awaits settlement. |

### Allocation

| Canonical | Meaning |
| --- | --- |
| `reserved` | Held and unsettled. |
| `consumed` | Converted to spent credits. |
| `released` | Returned to available balance. |
| `manual_review_required` | Awaiting provider output/cost decision. |

## 12. Export Status

| Canonical | Meaning |
| --- | --- |
| `preparing` | Export task running. |
| `ready` | Package available. |
| `failed` | Export failed and can be retried. |
| `expired` | Download link or package expired by lifecycle policy. |

## 13. Commerce and Payment Status

### Credit Package

| Canonical | Meaning |
| --- | --- |
| `active` | Package can be purchased. |
| `inactive` | Package is hidden/unavailable for new orders. |
| `archived` | Package is no longer used except historical order references. |

### Order

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `pending_payment` | Order created and waiting for payment. | No |
| `paid` | Verified provider callback or reconciliation proves payment succeeded. | No |
| `closed` | Order was closed before successful payment. | Yes unless provider reconciliation proves earlier success. |
| `expired` | Order payment window expired. | Yes unless provider reconciliation proves earlier success. |
| `refund_pending` | Refund workflow has started but provider result is not final. | No |
| `partially_refunded` | Part of the paid amount has been refunded. | No |
| `refunded` | Full paid amount has been refunded. | Yes |

### Payment Intent

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `created` | Local payment attempt exists but provider submission not completed. | No |
| `submitted` | Provider payment request was submitted or payment action generated. | No |
| `succeeded` | Provider confirms payment succeeded. | Yes |
| `failed` | Provider confirms failure or local validation failed before side effect. | Yes |
| `closed` | Payment attempt closed before success. | Yes |
| `expired` | Payment attempt expired. | Yes unless provider reconciliation proves earlier success. |
| `unknown` | Provider result is uncertain and requires query or manual review. | No |

### Payment Provider Event

| Canonical | Meaning |
| --- | --- |
| `received` | Raw provider callback/event was durably received. |
| `processed` | Event was verified, normalized, and applied or safely no-op'd. |
| `duplicate` | Event duplicates a previously processed provider event. |
| `rejected` | Event failed signature, amount, currency, merchant, or state validation. |
| `unmatched` | Event could not be matched to a local order/payment intent. |
| `manual_review_required` | Event conflicts with local facts and needs human decision. |

### Payment Event Type

| Canonical | Meaning |
| --- | --- |
| `payment_succeeded` | Provider indicates payment success. |
| `payment_failed` | Provider indicates payment failure. |
| `payment_closed` | Provider indicates the payment was closed/canceled. |
| `refund_succeeded` | Provider indicates refund success. |
| `unknown` | Event type cannot be safely normalized. |

### Refund

| Canonical | Meaning | Terminal |
| --- | --- | --- |
| `pending` | Refund requested locally but not submitted or accepted by provider. | No |
| `submitted` | Refund request submitted to provider. | No |
| `succeeded` | Provider confirms refund success. | Yes |
| `failed` | Provider confirms refund failure or local validation failed before side effect. | Yes |
| `unknown` | Provider refund result is uncertain. | No |
| `manual_review_required` | Refund cannot proceed automatically because of consumed credits, invoice state, or provider conflict. | No |

### Invoice Request

| Canonical | Meaning |
| --- | --- |
| `requested` | Customer requested invoice/fapiao metadata handling. |
| `issued` | Invoice was issued and recorded. |
| `rejected` | Invoice request was rejected or canceled before issuance. |
| `red_letter_required` | Refund/correction requires red-letter or finance reversal workflow. |
| `red_letter_issued` | Red-letter/reversal invoice metadata recorded. |

### Invoice Record

| Canonical | Meaning |
| --- | --- |
| `issued` | Invoice metadata has been recorded as issued. |
| `red_letter_issued` | This record represents or links to a red-letter/reversal invoice. |
| `voided` | Invoice is voided according to finance policy. |
| `manual_review_required` | Invoice state needs finance review. |

### Risk Event Severity and Decision

| Canonical | Meaning |
| --- | --- |
| `info` | Informational risk event. |
| `warning` | Suspicious but not immediately critical. |
| `critical` | Requires urgent review or blocking action. |
| `allow` | Risk decision allowed the action. |
| `block` | Risk decision blocked the action. |
| `manual_review` | Risk decision requires human review. |

### Reconciliation Run and Item

| Canonical | Meaning |
| --- | --- |
| `running` | Reconciliation run is active. |
| `succeeded` | Reconciliation run completed successfully. |
| `failed` | Reconciliation run failed. |
| `partial_failed` | Run completed with some failed items. |
| `open` | Reconciliation item is unresolved. |
| `resolved` | Reconciliation item has been resolved. |
| `manual_review_required` | Reconciliation item requires human review before resolution. |
| `ignored_with_reason` | Reconciliation item intentionally ignored with an auditable reason. |

## 14. Enforcement

Before implementation starts:

1. Create shared TypeScript constants/types from this dictionary.
2. Reference the constants in API schemas and worker transition tests.
3. Use database check constraints or enums generated from the same source.
4. Add a documentation check that flags state strings not present in this dictionary.
