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

export const adminOpsCommandContracts = [
  manualSettleUnknownTaskCommand,
  adminRetryTaskCommand,
];
