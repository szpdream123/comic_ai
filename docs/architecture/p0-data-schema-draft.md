# P0 Data Schema Draft

> Status: M0 frozen schema draft; physical migrations not generated
> Depends on: `docs/architecture/p0-system-architecture.md` and `docs/architecture/decision-log.md`

This document turns the architecture invariants into a first-pass PostgreSQL schema shape. It is not a migration file. It defines table ownership, required columns, critical constraints, and the data relationships that must exist before implementation starts.

Canonical status values are defined in `docs/architecture/p0-state-dictionary.md`. Table sections below repeat key values for readability, but implementation should generate or validate enums/check constraints from the state dictionary.

## 1. Schema Principles

1. Tenant-owned tables include non-null `organization_id`.
2. Workspace/project-owned tables include non-null `workspace_id` and `project_id` where applicable.
3. Expensive operations have operation-scoped idempotency records and unique constraints.
4. Execution facts are append-friendly: attempts, provider requests, ledgers, audit events, and outbox events are not rewritten as mutable logs.
5. Generated assets are immutable versions. Business records point to the selected current version.
6. Balance snapshots are read models. Credit ledger entries are the accounting truth.
7. Provider result uncertainty is represented explicitly with `result_unknown`, not hidden as a generic failure.

## 2. Common Columns

Most tables use:

| Column | Notes |
| --- | --- |
| `id` | UUID or sortable UUID/ULID. |
| `organization_id` | Non-null on tenant-owned records. |
| `workspace_id` | Non-null on workspace-owned records. |
| `project_id` | Non-null on project-owned records. |
| `created_at` | Server timestamp. |
| `updated_at` | Server timestamp for mutable records. |
| `created_by_user_id` | Required for user-created records where applicable. |

Recommended indexes:

- Tenant-owned high-volume tables: `(organization_id, created_at DESC)`.
- Project-owned tables: `(organization_id, project_id, created_at DESC)`.
- Queue tables: `(status, scheduled_at)` and `(organization_id, status)`.

## 3. Identity and Tenant Tables

### `users`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `email` | Nullable normalized email for invoice/notification/future overseas adapters. |
| `phone_e164` | Unique normalized China phone login identity. |
| `display_name` | Nullable. |
| `password_hash` | Nullable. P0 uses phone-code login; password is a future credential adapter. |
| `status` | `active`, `disabled`. |
| `last_login_at` | Nullable. |

### `login_challenges`

P0 China phone-code login challenges.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `phone_e164` | Normalized China phone number. |
| `code_hash` | Hash of one-time code. |
| `purpose` | `login`. |
| `status` | `issued`, `consumed`, `expired`, `revoked`, `locked`. |
| `expires_at` | Required short TTL. |
| `attempt_count` | Failed verification attempts. |
| `created_ip_hash` | Nullable safe abuse metadata. |
| `created_user_agent_hash` | Nullable safe abuse metadata. |

Constraints:

- Code values are never stored in plaintext.
- Active code issuance is rate-limited by phone and IP bucket.
- Consuming a code is a single row-locked transition from `issued` to `consumed`.

### `auth_sessions`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `user_id` | Required. |
| `status` | `active`, `revoked`, `expired`. |
| `created_at` | Required. |
| `expires_at` | Required. |
| `last_seen_at` | Nullable. |
| `revoked_at` | Nullable. |
| `session_token_hash` | Required. |

Constraints:

- Session tokens are never stored in plaintext.
- Logout/revoke is a server-side state transition.

### `organizations`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `name` | Required. |
| `status` | `active`, `suspended`, `archived`. |
| `credit_balance_cached` | Read model derived from ledger. |
| `credit_reserved_cached` | Read model derived from reservation ledger. |

### `workspaces`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `name` | Required. |
| `status` | `active`, `archived`. |

Constraints:

- Unique `(organization_id, id)` for composite tenant foreign keys.

### `memberships`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Nullable for organization-level membership. |
| `user_id` | Required. |
| `role` | `owner_admin`, `producer`, `creator`, `viewer`. |
| `status` | `active`, `invited`, `disabled`. |

Constraints:

- Unique active membership per `(organization_id, workspace_id, user_id)`.

## 3.1 Cross-Cutting Idempotency Table

### `idempotency_records`

Canonical contract: `docs/architecture/p0-idempotency-contract.md`.

This table is the authoritative duplicate-request guard for expensive API commands, Admin/Ops actions, and other user/system commands that can create durable side effects.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `operation_name` | Required stable operation name, such as `shot.image.generate`. |
| `idempotency_key` | Required caller/client/job key. |
| `request_hash` | Required hash of canonicalized business-impacting request payload. |
| `resource_scope_type` | Nullable scope type such as `project`, `shot`, `order`, `task`. |
| `resource_scope_id` | Nullable scope id; must be paired with scope type. |
| `response_resource_type` | Nullable response resource type such as `workflow`, `task`, `order`. |
| `response_resource_id` | Nullable response resource id; must be paired with response type. |
| `status` | `processing`, `succeeded`, `failed_retryable`, `failed_terminal`, `expired`. |
| `response_snapshot_json` | Nullable safe response snapshot for replay. |
| `failure_code` | Nullable stable failure code. |
| `expires_at` | Required expiry/retention boundary. |
| `locked_until` | Nullable command-processing lease for concurrent first requests. |
| `created_by_user_id` | Nullable for system/repair actions. |

Constraints:

- Unique `(organization_id, operation_name, idempotency_key)`.
- Same `(organization_id, operation_name, idempotency_key)` with different `request_hash` returns `409 idempotency_conflict`.
- Scope type/id and response type/id must be null together or non-null together.
- Records should be marked `expired` before physical deletion; payment/provider callback dedup records retain longer than ordinary creator commands.

## 4. Project and Story Tables

### `projects`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `name` | 1-60 chars. |
| `aspect_ratio` | `9:16`, `16:9`. |
| `resolution` | `720p`, `1080p`. |
| `visual_style` | Text or preset reference. |
| `budget_credit_limit` | Nullable project budget. |
| `project_phase` | `script_input`, `asset_review`, `shot_generation`, `export`. |
| `readiness_flags_json` | Cached read model for flags such as `has_completed_images`, `has_partial_failures`, and `calibration_passed`; recomputable from source tables. |
| `archived_at` | Nullable. |

Constraints:

- Unique `(organization_id, workspace_id, id)`.
- Index `(organization_id, workspace_id, updated_at DESC)`.

### `scripts`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `source_asset_version_id` | Nullable uploaded file version. |
| `text_snapshot` | Optional sanitized text snapshot or object reference. |
| `content_hash` | For dedupe and audit without logging raw text everywhere. |
| `status` | `draft`, `ready`, `parsing`, `parsed`, `failed`, `archived`. |

### `episodes`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `script_id` | Required. |
| `episode_index` | Required integer. |
| `title` | Nullable. |
| `summary` | Nullable. |

Constraints:

- Unique `(organization_id, project_id, episode_index)`.

## 5. Asset Tables

### `assets`

Asset describes business meaning.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `asset_type` | `script`, `character`, `scene`, `prop`, `calibration_image`, `shot_image`, `shot_video`, `export_package`. |
| `name` | Required for public assets, generated for shot outputs. |
| `description` | Nullable. |
| `status` | `draft`, `pending`, `confirmed`, `needs_fix`, `archived`. |
| `current_version_id` | Nullable pointer to `asset_versions`. |
| `is_key_asset` | For key character/scene/prop. |

### `asset_versions`

AssetVersion describes immutable binary or generated output.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `asset_id` | Required. |
| `version_number` | Monotonic per asset. |
| `storage_bucket` | Required. |
| `storage_key` | Required. |
| `content_type` | Required. |
| `size_bytes` | Nullable. |
| `checksum` | Nullable. |
| `source_task_id` | Nullable. |
| `source_attempt_id` | Nullable. |
| `source_provider_request_id` | Nullable. |
| `metadata_json` | Dimensions, duration, prompt hash, provider output metadata. |
| `deleted_at` | Soft-delete for user content where allowed. |

Constraints:

- Unique `(organization_id, asset_id, version_number)`.
- Unique `(storage_bucket, storage_key)`.
- Asset versions are not updated except safe metadata enrichment and soft-delete fields.

## 6. Shot Tables

### `shots`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `episode_id` | Required. |
| `shot_index` | Required integer. |
| `core_message` | One information point. |
| `visual_description` | Editable. |
| `dialogue` | Editable; over 40 chars triggers split warning. |
| `camera_type` | Full shot, medium, close-up, etc. |
| `content_status` | `draft`, `ready`, `stale`. |
| `content_revision` | Incremented on meaningful shot edits. |
| `image_status` | `draft`, `ready`, `generating`, `completed`, `failed`, `stale`. |
| `video_status` | `not_ready`, `ready`, `generating`, `completed`, `failed`, `stale`. |
| `active_image_task_id` | Nullable current generation intent. |
| `active_video_task_id` | Nullable current generation intent. |
| `current_image_asset_version_id` | Nullable. |
| `current_video_asset_version_id` | Nullable. |

Constraints:

- Unique `(organization_id, project_id, episode_id, shot_index)`.
- A task may update current pointers only when task ID or `content_revision` matches the active generation intent.

### `shot_asset_links`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `project_id` | Required. |
| `shot_id` | Required. |
| `asset_id` | Required. |
| `link_type` | `character`, `scene`, `prop`, `reference`. |

Constraints:

- Unique `(organization_id, shot_id, asset_id, link_type)`.

## 7. Workflow and Task Tables

### `workflows`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Nullable for org-level operations. |
| `workflow_type` | `script_parse`, `asset_extract`, `shot_split`, `calibration`, `batch_shot_image`, `shot_video`, `export_package`. |
| `status` | `queued`, `running`, `partial_succeeded`, `succeeded`, `failed`, `cancel_requested`, `canceled`, `result_unknown`, `manual_review_required`. |
| `idempotency_record_id` | Nullable for system workflows; required for user-triggered idempotent workflows. |
| `idempotency_key` | Denormalized debug/reference key for user-triggered workflows. Replay semantics are owned by `idempotency_records`. |
| `input_snapshot_json` | Durable input at creation time. |
| `created_by_user_id` | Required for user-triggered workflows. |
| `started_at` | Nullable. |
| `finished_at` | Nullable. |
| `failure_code` | Nullable. |
| `failure_message` | Nullable safe message. |

Constraints:

- Index `(organization_id, idempotency_record_id)` where `idempotency_record_id is not null`.
- Do not use operationless unique `(organization_id, idempotency_key)` as the replay guard. If a workflow-level uniqueness constraint is retained, it must include `workflow_type` or reference `idempotency_record_id`.
- Index `(organization_id, status, created_at DESC)`.

### `tasks`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Nullable. |
| `workflow_id` | Required. |
| `task_type` | `parse_script`, `extract_assets`, `split_shots`, `generate_image`, `generate_video`, `package_export`, `quality_check`. |
| `status` | `queued`, `running`, `succeeded`, `failed`, `cancel_requested`, `canceled`, `result_unknown`, `manual_review_required`. |
| `idempotency_record_id` | Nullable for system-created child tasks; required when the task is directly created by an idempotent command. |
| `idempotency_key` | Denormalized debug/reference key. Worker duplicate safety also depends on task status and attempt lease. |
| `queue_name` | Required. |
| `priority` | Integer. |
| `scheduled_at` | Required. |
| `locked_by` | Nullable worker ID for active lease. |
| `locked_until` | Nullable lease expiry. |
| `heartbeat_at` | Nullable latest worker heartbeat. |
| `current_attempt_id` | Nullable active attempt. |
| `input_snapshot_json` | Required. |
| `target_entity_type` | `project`, `script`, `asset`, `shot`, `export`. |
| `target_entity_id` | Required. |
| `max_attempts` | Required. |
| `attempt_count` | Cached count. |
| `failure_code` | Nullable. |

Constraints:

- Index `(organization_id, idempotency_record_id)` where `idempotency_record_id is not null`.
- Direct task uniqueness must be operation/type scoped or anchored by `idempotency_record_id`; never rely on operationless `(organization_id, idempotency_key)` alone.
- Index `(status, scheduled_at)`.
- Index `(organization_id, workflow_id, status)`.

### `task_attempts`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Nullable. |
| `workflow_id` | Required. |
| `task_id` | Required. |
| `attempt_number` | Required. |
| `status` | `created`, `running`, `succeeded`, `failed`, `canceled`, `result_unknown`, `manual_review_required`. |
| `provider` | Nullable until routed. |
| `capability` | Nullable until routed. |
| `started_at` | Nullable. |
| `finished_at` | Nullable. |
| `locked_by` | Nullable worker ID for active lease. |
| `locked_until` | Nullable lease expiry. |
| `heartbeat_at` | Nullable latest worker heartbeat. |
| `failure_code` | Nullable normalized platform error. |
| `failure_message` | Nullable safe message. |
| `retry_classification` | `retryable`, `not_retryable`, `unknown`, `manual_review`. |

Constraints:

- Unique `(organization_id, task_id, attempt_number)`.
- Attempts are historical execution facts; do not mutate successful or failed attempts except safe reconciliation metadata.
- Stale `running` attempts with expired lease are repaired according to provider request state, not blindly retried.

## 8. Provider Gateway Tables

### `provider_requests`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required where applicable. |
| `project_id` | Required where applicable. |
| `workflow_id` | Required. |
| `task_id` | Required. |
| `attempt_id` | Required. |
| `provider` | Required. |
| `capability` | Required. |
| `model` | Required. |
| `client_request_id` | Required local stable request ID generated before submission; provider may ignore it if unsupported. |
| `provider_request_id` | Nullable until known. |
| `status` | `submitted`, `accepted`, `running`, `succeeded`, `failed`, `canceled`, `result_unknown`, `manual_review_required`. |
| `request_hash` | Hash of normalized payload. |
| `request_snapshot_json` | Redacted snapshot or object reference. |
| `response_snapshot_json` | Redacted response or object reference. |
| `cost_amount` | Nullable. |
| `cost_currency` | Nullable. |
| `billing_trigger` | Copied from adapter at request time. |
| `retry_safety` | Copied from provider capability at request time. |
| `safe_retry_modes_json` | Copied from provider capability at request time. |
| `output_lookup_ttl_seconds` | Copied from provider capability at request time. |
| `adapter_policy_snapshot_json` | Immutable snapshot of retry, lookup, cancel, and billing policy used for this request. |
| `submitted_at` | Required. |
| `external_submission_started_at` | Nullable; set immediately before attempting the provider call. If set, recovery treats provider side effect as possible. |
| `finished_at` | Nullable. |

Constraints:

- Unique `(provider, client_request_id)`.
- Index `(organization_id, provider, status, submitted_at DESC)`.

### `provider_capabilities`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `provider` | Required. |
| `capability` | Required. |
| `model` | Required. |
| `enabled` | Boolean. |
| `is_primary` | Boolean. |
| `is_backup` | Boolean. |
| `supports_client_request_id` | Boolean. |
| `supports_status_lookup` | Boolean. |
| `supports_cancel` | Boolean. |
| `billing_trigger` | `on_accept`, `on_success`, `on_output`, `unknown`. |
| `retry_safety` | `safe_without_provider_side_effect`, `safe_with_client_request_id`, `unsafe_may_duplicate_cost_or_output`, `manual_review_required`. |
| `safe_retry_modes_json` | Provider/capability-specific normalized error modes that allow automatic retry or fallback. |
| `output_lookup_ttl_seconds` | Required timeout before unresolved lookup moves to `manual_review_required`. |
| `rate_limit_config_json` | Nullable. |

Constraints:

- Unique `(provider, capability, model)`.
- Routing and recovery must use persisted provider capability rows, not only in-memory adapter defaults.

## 9. Commerce and Payment Tables

Commerce/payment tables are required for P0-B self-service credit package purchase. They are separate from credit ledgers: payment records explain cash facts, while credit ledger entries remain the user-facing balance truth.

### `credit_packages`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `code` | Stable SKU code. |
| `display_name` | User-visible package name. |
| `credits` | Positive integer. |
| `amount_minor` | Positive integer in minor currency unit. |
| `currency` | `CNY` for P0-B. |
| `status` | `active`, `inactive`, `archived`. |
| `valid_from` | Nullable. |
| `valid_until` | Nullable. |

Constraints:

- Unique `code`.
- `credits > 0`.
- `amount_minor > 0`.
- Price or credit changes that affect historical meaning should create a new package/version instead of mutating existing orders.

### `orders`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `created_by_user_id` | Required. |
| `order_no` | Public merchant order number sent to providers. |
| `package_id` | Required. |
| `package_snapshot_json` | Credits, price, currency, and display name at order time. |
| `credits` | Positive integer copied from package snapshot. |
| `amount_minor` | Positive integer copied from package snapshot. |
| `currency` | `CNY`. |
| `status` | `pending_payment`, `paid`, `closed`, `expired`, `refund_pending`, `partially_refunded`, `refunded`. |
| `idempotency_record_id` | Required for API-created orders. References `idempotency_records.id` for `billing.create_order`. |
| `idempotency_key` | Denormalized debug/reference key copied from `idempotency_records`; not the replay guard. |
| `expires_at` | Required. |
| `paid_at` | Nullable. |
| `successful_payment_intent_id` | Nullable read model pointer. |
| `credit_grant_ledger_entry_id` | Nullable read model pointer; ledger remains the truth. |

Constraints:

- Unique `order_no`.
- Unique `(organization_id, idempotency_record_id)` where `idempotency_record_id is not null`.
- `amount_minor > 0`.
- `credits > 0`.
- No physical delete after provider interaction.

### `payment_intents`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `order_id` | Required. |
| `provider` | `wechat_pay`, `alipay`. |
| `provider_mode` | Provider-specific product mode, such as `native_qr`, `pc_page`, or `qr_code`. |
| `status` | `created`, `submitted`, `succeeded`, `failed`, `closed`, `expired`, `unknown`. |
| `amount_minor` | Copied from order. |
| `currency` | Copied from order. |
| `merchant_order_no` | Merchant order number sent to provider. |
| `provider_trade_id` | Nullable until provider returns it. |
| `provider_payload_hash` | Hash of provider request payload for audit. |
| `provider_safe_metadata_json` | Safe provider response metadata such as WeChat `code_url` hash or Alipay generated form hash; no secrets. |
| `submitted_at` | Nullable. |
| `succeeded_at` | Nullable. |
| `expires_at` | Required. |
| `idempotency_record_id` | Nullable; required if payment intent creation is exposed as an idempotent API command. |
| `idempotency_key` | Denormalized debug/reference key when `idempotency_record_id` is present. |

Constraints:

- Unique `(provider, merchant_order_no)`.
- Unique `(provider, provider_trade_id)` where `provider_trade_id is not null`.
- Partial unique `(organization_id, order_id)` where `status = 'succeeded'`.
- Payment intent amount and currency must match the order snapshot.
- State transitions happen through domain commands only.

### `payment_provider_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `provider` | `wechat_pay`, `alipay`. |
| `provider_event_dedup_key` | Provider notification ID if available; otherwise normalized deterministic dedup key. |
| `merchant_order_no` | Nullable until normalized. |
| `provider_trade_id` | Nullable. |
| `event_type` | `payment_succeeded`, `payment_failed`, `payment_closed`, `refund_succeeded`, `unknown`. |
| `signature_status` | `unverified`, `verified`, `invalid`. |
| `processing_status` | `received`, `processed`, `duplicate`, `rejected`, `unmatched`, `manual_review_required`. |
| `raw_payload_hash` | Required. |
| `normalized_payload_json` | Nullable until verified/normalized. |
| `ack_status` | Nullable: `not_sent`, `sent_success`, `sent_failure`. |
| `failure_code` | Nullable. |
| `received_at` | Required. |
| `processed_at` | Nullable. |

Constraints:

- Unique `(provider, provider_event_dedup_key)`.
- Provider events are append-only except processing metadata.
- Invalid or suspicious callbacks do not mutate order, payment intent, or credit state.

### `payment_refunds`

Refund automation is not fully designed for P0-B, but refund facts need a placeholder table if provider callbacks can report refunds.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `order_id` | Required. |
| `payment_intent_id` | Required. |
| `provider` | `wechat_pay`, `alipay`. |
| `provider_refund_id` | Nullable until provider returns it. |
| `amount_minor` | Positive integer. |
| `currency` | `CNY`. |
| `status` | `pending`, `submitted`, `succeeded`, `failed`, `unknown`, `manual_review_required`. |
| `reason` | Required for platform-initiated refunds. |
| `created_by_user_id` | Nullable for provider-originated events. |
| `credit_reversal_ledger_entry_id` | Nullable link to credit reversal/adjustment. |
| `invoice_record_id` | Nullable link to issued invoice if refund requires invoice reversal. |

Constraints:

- Unique `(provider, provider_refund_id)` where `provider_refund_id is not null`.
- Total refunded amount for an order must not exceed paid amount.
- Total reversed credits for an order must not exceed granted credits.
- Refunds never physically delete or rewrite original order/payment facts.

### `invoice_requests`

P0-B supports manual/offline invoice issuance tracking. Automated tax platform integration is not required for P0-B.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `order_id` | Required paid order. |
| `requested_by_user_id` | Required. |
| `buyer_type` | `individual`, `enterprise`. |
| `buyer_name` | Required. |
| `taxpayer_id` | Required for enterprise if finance policy requires it. |
| `email` | Nullable delivery email. |
| `amount_minor` | Positive integer, not greater than paid invoiceable amount. |
| `currency` | `CNY`. |
| `status` | `requested`, `issued`, `rejected`, `red_letter_required`, `red_letter_issued`. |
| `metadata_json` | Safe extra invoice fields required by finance. |

Constraints:

- Unique `(organization_id, order_id)` for P0-B unless finance approves multiple partial invoices.
- Invoice request amount must not exceed the paid order amount.
- Invoice state changes require audit events.

### `invoice_records`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `invoice_request_id` | Required. |
| `order_id` | Required. |
| `invoice_no` | Nullable until issued. |
| `invoice_type` | `digital_e_invoice`, `paper`, `other`. |
| `issued_amount_minor` | Required after issued. |
| `currency` | `CNY`. |
| `issued_at` | Nullable until issued. |
| `red_letter_of_invoice_id` | Nullable. |
| `status` | `issued`, `red_letter_issued`, `voided`, `manual_review_required`. |

Constraints:

- Unique `(organization_id, invoice_no)` where `invoice_no is not null`.
- Red-letter records link to the original invoice through `red_letter_of_invoice_id`.
- Invoice records are not physically deleted in normal product flows.

### `payment_risk_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Nullable if unmatched. |
| `user_id` | Nullable. |
| `order_id` | Nullable. |
| `payment_intent_id` | Nullable. |
| `provider_event_id` | Nullable. |
| `risk_type` | `rate_limited`, `signature_invalid`, `amount_mismatch`, `currency_mismatch`, `merchant_mismatch`, `duplicate_trade`, `refund_requires_review`, `high_value_first_purchase`. |
| `severity` | `info`, `warning`, `critical`. |
| `decision` | `allow`, `block`, `manual_review`. |
| `metadata_json` | Safe metadata only. |

Constraints:

- Risk events are append-only.
- Risk events do not replace audit events.

### `payment_reconciliation_runs`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `provider` | `wechat_pay`, `alipay`, `all`. |
| `run_type` | `recent`, `expiry`, `paid_without_credit`, `daily_settlement`. |
| `status` | `running`, `succeeded`, `failed`, `partial_failed`. |
| `started_at` | Required. |
| `finished_at` | Nullable. |
| `summary_json` | Safe aggregate metadata. |

### `payment_reconciliation_items`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `run_id` | Required. |
| `order_id` | Nullable. |
| `payment_intent_id` | Nullable. |
| `provider_trade_id` | Nullable. |
| `issue_type` | `missing_callback`, `paid_without_credit`, `amount_mismatch`, `provider_paid_platform_unpaid`, `platform_paid_provider_unpaid`, `refund_mismatch`, `invoice_refund_mismatch`. |
| `status` | `open`, `resolved`, `manual_review_required`, `ignored_with_reason`. |
| `resolution_json` | Safe metadata. |

Constraints:

- Daily settlement differences create reconciliation items, not silent corrections.
- Reconciliation jobs must reuse the same payment transition commands as callbacks.

## 10. Credit and Cost Tables

### `credit_ledger_entries`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Nullable. |
| `project_id` | Nullable. |
| `entry_type` | `grant`, `reservation`, `consume`, `release`, `adjustment`. |
| `available_delta` | Signed credit delta for spendable balance. |
| `reserved_delta` | Signed credit delta for held balance. |
| `consumed_delta` | Signed credit delta for permanently consumed credits. |
| `currency` | `credit`. |
| `workflow_id` | Nullable. |
| `task_id` | Nullable. |
| `attempt_id` | Nullable. |
| `provider_request_id` | Nullable. |
| `dedup_key` | Required ledger-local duplicate guard generated from source facts. |
| `reason` | Required. |
| `created_by_user_id` | Nullable for system events. |
| `reservation_id` | Nullable. Required for `reservation`, `consume`, and `release`. |
| `reservation_allocation_id` | Nullable. Required for task-level `reservation`, `consume`, and `release`. |
| `source_type` | Nullable for legacy/internal entries; required for payment grants. Examples: `payment_order`, `admin_grant`, `promotion`, `migration`. |
| `source_id` | Nullable unless `source_type` is set. |
| `source_event_id` | Nullable outbox event ID that caused the ledger entry. |

Constraints:

- Unique `(organization_id, dedup_key)`.
- Ledger-local duplicate guard only. This key must be generated from source facts such as `entry_type`, `source_type`, `source_id`, `reservation_allocation_id`, or `provider_request_id`; it must not be a raw client API idempotency key.
- Unique settlement per allocation: partial unique `(organization_id, reservation_allocation_id)` where `entry_type in ('consume', 'release')`.
- Unique reservation ledger per allocation: partial unique `(organization_id, reservation_allocation_id)` where `entry_type = 'reservation'`.
- Unique payment grant per source: partial unique `(organization_id, source_type, source_id, entry_type)` where `entry_type = 'grant'` and `source_type is not null`.
- Ledger entries are append-only.
- `grant`: positive `available_delta`, zero `reserved_delta`, zero `consumed_delta`.
- `reservation`: negative `available_delta`, positive `reserved_delta`, zero `consumed_delta`.
- `consume`: zero `available_delta`, negative `reserved_delta`, positive `consumed_delta`.
- `release`: positive `available_delta`, negative `reserved_delta`, zero `consumed_delta`.
- `adjustment`: explicit signed deltas with required admin reason.

Settlement transaction rule:

1. Lock `credit_reservation_allocations` by `(organization_id, id)` with `FOR UPDATE`.
2. Require current `status = reserved` or `manual_review_required` before settlement.
3. Insert exactly one `consume` or `release` ledger row for that allocation.
4. Update allocation to `consumed` or `released` in the same transaction.
5. Recompute or update the reservation envelope status in the same transaction.

### `credit_reservations`

Workflow-level reservation envelope.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Nullable. |
| `project_id` | Nullable. |
| `workflow_id` | Required. |
| `status` | `active`, `partially_settled`, `settled`, `released`, `manual_review_required`. |
| `estimated_total` | Required. |
| `dedup_key` | Internal reservation duplicate guard derived from `workflow_id`; user/API replay semantics are owned by `idempotency_records`. |

Constraints:

- Unique `(organization_id, workflow_id)`.
- Unique `(organization_id, dedup_key)`.

### `credit_reservation_allocations`

Task-level settlement unit for batch workflows.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `reservation_id` | Required. |
| `workflow_id` | Required. |
| `task_id` | Required. |
| `estimated_amount` | Required. |
| `settled_amount` | Nullable until consumed or released. |
| `status` | `reserved`, `consumed`, `released`, `manual_review_required`. |
| `settled_by_attempt_id` | Nullable. |

Constraints:

- Unique `(organization_id, task_id)`.
- A task allocation is either consumed or released once; this is enforced by the partial unique settlement index on ledger entries and by row-locked allocation state transitions.

### `provider_cost_entries`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workflow_id` | Required. |
| `task_id` | Required. |
| `attempt_id` | Required. |
| `provider_request_id` | Required. |
| `provider` | Required. |
| `amount` | Required. |
| `currency` | Required. |
| `cost_source` | `provider_actual`, `estimated`, `manual_adjustment`, `unknown`. |
| `abnormal` | Boolean. |
| `notes` | Nullable. |

Constraints:

- Unique `(organization_id, provider_request_id, cost_source)` unless manual adjustments allow multiple entries with unique ids.

## 11. Quality, Export, Audit, and Outbox

### `quality_reviews`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `target_type` | `calibration_image`, `shot_image`, `shot_video`. |
| `target_asset_version_id` | Required. |
| `source` | `automated_rule`, `model_review`, `human_review`, `provider_metadata`. |
| `result` | `passed`, `failed`, `review_required`, `not_checked`. |
| `failure_reason` | Nullable normalized reason. |
| `reviewer_user_id` | Nullable. |

### `calibration_sessions`

One style calibration run for a project.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `workflow_id` | Nullable until generation workflow is created. |
| `status` | `draft`, `generating`, `ready_for_review`, `passed`, `failed`, `skipped`, `archived`. |
| `selected_by_user_id` | Required. |
| `decision_by_user_id` | Nullable. |
| `decision_reason` | Nullable; required for skip/override. |
| `decided_at` | Nullable. |

Constraints:

- Only one active non-archived calibration session per project.
- Batch image generation guard checks this table, not UI-only state.

### `calibration_items`

The three selected representative shots and their generated calibration outputs.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `calibration_session_id` | Required. |
| `shot_id` | Required. |
| `slot_type` | `medium`, `close_up`, `mood`. |
| `task_id` | Nullable generation task. |
| `asset_version_id` | Nullable generated calibration image. |
| `status` | `pending`, `generating`, `succeeded`, `failed`, `review_required`. |

Constraints:

- Unique `(organization_id, calibration_session_id, slot_type)`.
- Unique `(organization_id, calibration_session_id, shot_id)`.

### `calibration_decisions`

Immutable decision history for pass/fail/skip/override.

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `calibration_session_id` | Required. |
| `decision` | `pass`, `fail`, `skip`, `override_pass`. |
| `reason` | Required for `skip` and `override_pass`. |
| `decided_by_user_id` | Required. |
| `created_at` | Required. |

### `exports`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Required. |
| `project_id` | Required. |
| `workflow_id` | Required. |
| `status` | `preparing`, `ready`, `failed`, `expired`. |
| `package_asset_version_id` | Nullable. |
| `manifest_json` | Required. |
| `expires_at` | Nullable. |

### `audit_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required. |
| `workspace_id` | Nullable. |
| `project_id` | Nullable. |
| `actor_user_id` | Nullable for system events. |
| `event_type` | Required. |
| `target_type` | Required. |
| `target_id` | Required. |
| `metadata_json` | Redacted metadata. |
| `created_at` | Required. |

### `outbox_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `organization_id` | Required where event is tenant-owned. |
| `event_type` | Required. |
| `payload_json` | Required. |
| `status` | `pending`, `processing`, `processed`, `failed`. |
| `available_at` | Required. |
| `processed_at` | Nullable. |
| `error_message` | Nullable. |

### `inbox_events`

| Column | Notes |
| --- | --- |
| `id` | Primary key. |
| `consumer_name` | Required. |
| `outbox_event_id` | Required. |
| `processed_at` | Required. |

Constraints:

- Unique `(consumer_name, outbox_event_id)`.

## 12. P0 Schema Risks Still To Validate

| Risk | Required Validation |
| --- | --- |
| RLS complexity | Prototype one project-scoped query path with and without RLS before production choice. |
| Balance cached fields drift | Define a reconciliation query that recomputes balances from ledger entries. |
| Provider request payload privacy | Decide which raw payloads can be stored and which must be hashed or object-stored with restricted access. |
| Composite FK ergonomics | Validate ORM/query builder support before committing to every composite FK. |
| Asset version volume | Add retention/lifecycle strategy before high-volume customer rollout. |
