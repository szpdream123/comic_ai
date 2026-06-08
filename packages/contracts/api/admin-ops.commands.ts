import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const manualSettleUnknownTaskCommand: ApiCommandContract = {
  name: "ManualSettleUnknownTask",
  operationName: operationNames.opsManualSettleTask,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    taskId: "uuid",
    decision: "consume|release|mark_abnormal_cost",
    reason: "required text",
  },
  responseSchema: { taskId: "uuid", taskStatus: "task status" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.status in result_unknown|manual_review_required",
    "actor has ops settlement capability",
  ],
  businessErrors: ["task_not_settleable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_manually_settled",
  verificationIds: ["R-018", "R-023"],
};

export const adminRetryTaskCommand: ApiCommandContract = {
  name: "AdminRetryTask",
  operationName: operationNames.opsRetryTask,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: { taskId: "uuid", reason: "required text" },
  responseSchema: { taskId: "uuid", taskStatus: "queued|running" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.status in failed|canceled",
    "retry policy permits another attempt",
  ],
  businessErrors: ["task_not_retryable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_retry_requested",
  verificationIds: ["R-020"],
};

export const adminRetryFinalizeCommand: ApiCommandContract = {
  name: "AdminRetryFinalize",
  operationName: operationNames.opsRetryFinalize,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: { taskId: "uuid", reason: "required text" },
  responseSchema: { taskId: "uuid", taskStatus: "running|manual_review_required" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.failure_code = provider_output_download_failed|provider_output_upload_failed",
    "actor has ops settlement capability",
  ],
  businessErrors: ["task_not_retryable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_finalize_retry_requested",
  verificationIds: ["AI-finalize-retry"],
};

export const adminRetryPersistAssetCommand: ApiCommandContract = {
  name: "AdminRetryPersistAsset",
  operationName: operationNames.opsRetryPersistAsset,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: { taskId: "uuid", reason: "required text" },
  responseSchema: { taskId: "uuid", taskStatus: "manual_review_required|running" },
  resourceScope: "task:{task_id}",
  statePreconditions: [
    "task.failure_code = provider_output_persist_failed",
    "actor has ops settlement capability",
  ],
  businessErrors: ["task_not_retryable", "reason_required", "ops_forbidden"],
  auditEvent: "ops.task_persist_asset_retry_requested",
  verificationIds: ["AI-persist-asset-retry"],
};

export const markPaymentRiskReviewedCommand: ApiCommandContract = {
  name: "MarkPaymentRiskReviewed",
  operationName: operationNames.opsMarkPaymentRiskReviewed,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    riskEventId: "uuid",
    reason: "required text",
  },
  responseSchema: { riskEventId: "uuid", status: "reviewed" },
  resourceScope: "payment_risk_event:{risk_event_id}",
  statePreconditions: [
    "payment_risk_event.status = open",
    "actor has ops settlement capability",
  ],
  businessErrors: [
    "payment_risk_not_found",
    "payment_risk_not_reviewable",
    "reason_required",
    "ops_forbidden",
  ],
  auditEvent: "ops.payment_risk_reviewed",
  verificationIds: ["PAY-risk-review", "C10-payment-risk-ops"],
};

export const repairPaidWithoutCreditCommand: ApiCommandContract = {
  name: "RepairPaidWithoutCredit",
  operationName: operationNames.opsRepairPaidWithoutCredit,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    orderId: "uuid",
    reason: "required text",
  },
  responseSchema: {
    orderId: "uuid",
    issueStatus: "resolved",
    creditGrantLedgerEntryId: "uuid",
  },
  resourceScope: "order:{order_id}",
  statePreconditions: [
    "order.status = paid",
    "order.credit_grant_ledger_entry_id is null",
    "actor has ops settlement capability",
  ],
  businessErrors: [
    "payment_issue_not_found",
    "payment_issue_not_repairable",
    "reason_required",
    "ops_forbidden",
  ],
  auditEvent: "ops.payment_paid_without_credit_repaired",
  verificationIds: ["PAY-paid-without-credit-repair", "C10-payment-ops"],
};

export const operateGenerationQueueJobCommand: ApiCommandContract = {
  name: "OperateGenerationQueueJob",
  operationName: operationNames.opsGenerationQueueJobOperate,
  capability: capabilities.opsSettle,
  idempotencyRequired: true,
  requestSchema: {
    queueName: "required text",
    jobId: "required text",
    action: "retry|promote|remove",
    reason: "required text",
  },
  responseSchema: {
    queueName: "string",
    jobId: "string",
    jobName: "string",
    action: "retry|promote|remove",
    previousState: "string",
  },
  resourceScope: "generation_queue_job:{queue_name}:{job_id}",
  statePreconditions: [
    "actor has ops settlement capability",
    "queue is configured for generation jobs",
  ],
  businessErrors: [
    "generation_queue_not_allowed",
    "generation_queue_job_action_invalid",
    "generation_queue_job_not_found",
    "generation_queue_job_state_mismatch",
    "generation_queue_job_action_unsupported",
    "reason_required",
  ],
  auditEvent: "admin.ops.generation_queue_job_operated",
  verificationIds: ["OPS-generation-queue-job-operate"],
};

export const adminOpsCommandContracts = [
  manualSettleUnknownTaskCommand,
  adminRetryTaskCommand,
  adminRetryFinalizeCommand,
  adminRetryPersistAssetCommand,
  markPaymentRiskReviewedCommand,
  repairPaidWithoutCreditCommand,
  operateGenerationQueueJobCommand,
];
