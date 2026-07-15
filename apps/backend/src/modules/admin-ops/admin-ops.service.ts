import { createHash } from "node:crypto";

import {
  adminRecoverTaskCommand,
  adminRetryFinalizeCommand,
  adminRetryPersistAssetCommand,
  adminRetryTaskCommand,
  manualSettleUnknownTaskCommand,
  markPaymentRiskReviewedCommand,
  repairPaidWithoutCreditCommand,
} from "../../../../../packages/contracts/api/admin-ops.commands.ts";
import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import {
  assertUserCapability as assertCapability,
  UserAuthorizationError as AuthorizationError,
  type UserActorContext as ActorContext,
  resolveUserActorContext as resolveActorContext,
} from "../identity/user-actor-context.service.ts";
import {
  grantCreditsInTransaction,
  settleReservationAllocationInTransaction,
  type CreditAllocationOutcome,
} from "../credit-billing/credit-ledger.service.ts";
import {
  runIdempotentCommand,
  type AdminCommandActor,
} from "../shared/command/platform-command-runtime.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import {
  appendGenerationTaskCreatedOutboxEvent,
  appendGenerationTaskFinalizeRequestedOutboxEvent,
  appendGenerationTaskPollRequestedOutboxEvent,
} from "../model-gateway/generation-outbox.service.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";

type AdminOpsResponse<T> = {
  status: number;
  body: T;
};

type AdminOpsError =
  | "ops_forbidden"
  | "reason_required"
  | "task_not_found"
  | "task_not_settleable"
  | "task_not_retryable"
  | "task_recovery_action_invalid"
  | "task_recovery_not_allowed"
  | "payment_risk_not_found"
  | "payment_risk_not_reviewable"
  | "payment_issue_not_found"
  | "payment_issue_not_repairable"
  | "idempotency_conflict"
  | "idempotency_processing";

interface AuthenticatedAdminOpsUser {
  sessionToken?: string;
  actor?: ActorContext;
  adminActor?: AdminCommandActor;
}

interface AdminTaskRow {
  id: string;
  project_id: string | null;
  workflow_id: string;
  task_type: string;
  status: string;
  queue_name: string;
  attempt_count: number;
  max_attempts: number;
  failure_code: string | null;
  updated_at: Date | string;
  provider_status: string | null;
  provider_name: string | null;
  provider_operation: string | null;
  external_request_id: string | null;
  external_submission_started_at: Date | string | null;
  provider_updated_at: Date | string | null;
  last_dispatched_at: Date | string | null;
  scheduled_at: Date | string | null;
  outbox_event_type: string | null;
  outbox_status: string | null;
  outbox_error_message: string | null;
  progress_stage: string | null;
  snapshot_credit_status: string | null;
  reservation_status: string | null;
  amount_reserved: number | string | null;
}

interface AdminTaskSnapshotRow {
  model_code: string | null;
  media_type: string | null;
  failure_json: Record<string, unknown> | string | null;
  result_assets_json: unknown;
}

interface GenerationRetryTaskRow {
  id: string;
  workflow_id: string;
  task_type: string;
  queue_name: string;
  input_snapshot_json: Record<string, unknown> | string;
  target_entity_type: string;
  target_entity_id: string;
}

export interface AdminTaskView {
  id: string;
  workflowId: string;
  projectId: string | null;
  taskType: string;
  status: string;
  queueName: string;
  attemptCount: number;
  maxAttempts: number;
  failureCode: string | null;
  updatedAt: string;
  providerStatus: string | null;
  providerName: string | null;
  providerOperation: string | null;
  externalRequestId: string | null;
  externalSubmissionStartedAt: string | null;
  providerUpdatedAt: string | null;
  lastDispatchedAt: string | null;
  scheduledAt: string | null;
  outboxEventType: string | null;
  outboxStatus: string | null;
  outboxErrorMessage: string | null;
  progressStage: string | null;
  creditStatus: string | null;
  reservationStatus: string | null;
  reservedCredits: number;
}

type AdminTaskRecoveryAction =
  | "redispatch"
  | "resume_provider_poll"
  | "rebuild_finalize";

interface ProviderRequestOpsRow {
  id: string;
  attempt_id: string | null;
  status: string;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
}

interface AdminPaymentRiskRow {
  id: string;
  user_id: string | null;
  order_id: string | null;
  payment_intent_id: string | null;
  provider_event_id: string | null;
  risk_type: string;
  severity: string;
  decision: string;
  status: string;
  metadata_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface AdminPaymentRiskView {
  id: string;
  orderId: string | null;
  paymentIntentId: string | null;
  providerEventId: string | null;
  riskType: string;
  severity: string;
  decision: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface AdminPaymentIssueRow {
  order_id: string;
  order_no: string;
  status: string;
  credits: number;
  amount_minor: number;
  currency: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
}

interface VerifiedPaidCreditOrderRow extends AdminBillingOrderRow {
  intent_amount_minor: number | string | null;
  intent_currency: string | null;
  provider_event_id: string | null;
}

export interface AdminPaymentIssueView {
  issueType: "paid_without_credit";
  orderId: string;
  orderNo: string;
  status: "open" | "resolved";
  credits: number;
  amountMinor: number;
  currency: string;
  paidAt: string | null;
  successfulPaymentIntentId: string | null;
}

interface AdminBillingOrderRow {
  id: string;
  created_by_user_id: string;
  order_no: string;
  credit_package_id: string;
  package_snapshot_json: Record<string, unknown> | string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  idempotency_record_id: string | null;
  idempotency_key: string | null;
  expires_at: Date | string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AdminOpsServiceDeps {
  db: SqlDatabase;
}

class AdminOpsBusinessError extends Error {
  constructor(readonly code: Exclude<AdminOpsError, "ops_forbidden">) {
    super(code);
  }
}

export function createAdminOpsService(deps: AdminOpsServiceDeps) {
  async function resolveOpsActor(input: {
    user: AuthenticatedAdminOpsUser;
    now: Date;
  }) {
    if (input.user.adminActor) {
      assertCapabilityGranted(input.user.adminActor, capabilities.opsSettle);
      return input.user.adminActor;
    }
    if (input.user.actor) {
      assertCapability(input.user.actor, capabilities.opsSettle);
      return input.user.actor;
    }
    if (!input.user.sessionToken) {
      throw new AuthorizationError("unauthenticated");
    }
    return resolveActorContext(deps.db, {
      sessionToken: input.user.sessionToken,
      capability: capabilities.opsSettle,
      now: input.now,
    });
  }

  async function resolveCommandActor(
    db: SqlDatabase,
    input: {
      user: AuthenticatedAdminOpsUser;
      capability: typeof capabilities[keyof typeof capabilities];
      now: Date;
    },
  ) {
    if (input.user.adminActor) {
      assertCapabilityGranted(input.user.adminActor, input.capability);
      return input.user.adminActor;
    }
    if (input.user.actor) {
      assertCapability(input.user.actor, input.capability);
      return input.user.actor;
    }
    if (!input.user.sessionToken) {
      throw new AuthorizationError("unauthenticated");
    }
    return resolveActorContext(db, {
      sessionToken: input.user.sessionToken,
      capability: input.capability,
      now: input.now,
    });
  }

  async function retryFinalizeStage(input: {
    command: typeof adminRetryFinalizeCommand | typeof adminRetryPersistAssetCommand;
    finalizeMode: "retry_finalize" | "retry_persist_asset";
    retryableFailureCodes: Set<string>;
    input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        reason: string;
      };
      now: Date;
    };
  }): Promise<AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>> {
    const reason = input.input.body.reason.trim();
    if (!reason) {
      return { status: 400, body: { error: "reason_required" } };
    }

    try {
      const executed = await runIdempotentCommand({
        db: deps.db,
        operationName: input.command.operationName,
        capability: input.command.capability,
        idempotencyKey: input.input.idempotencyKey,
        requestHash: hashJson(input.input.body),
        now: input.input.now,
        resolveActor: (db) =>
          resolveCommandActor(db, {
            user: input.input.user,
            capability: input.command.capability,
            now: input.input.now,
          }),
        replay: async ({ actor, idempotencyRecord }) => {
          const task = await getTaskForOps(deps.db, {
            taskId: idempotencyRecord.responseResourceId,
          });
          if (!task) {
            throw new Error("ops_finalize_retry_replay_missing_task");
          }
          return { task };
        },
        execute: async ({ actor }) => {
          const task = await getTaskForOps(deps.db, {
            taskId: input.input.body.taskId,
          });
          if (!task) {
            throw new AdminOpsBusinessError("task_not_found");
          }
          if (!task.failureCode || !input.retryableFailureCodes.has(task.failureCode)) {
            throw new AdminOpsBusinessError("task_not_retryable");
          }

          const snapshot = await getGenerationSnapshotForTask(deps.db, {
            taskId: task.id,
          });
          const mediaType = readGenerationKind(snapshot?.media_type, task.taskType);
          const providerExecutor = providerExecutorForRetry(task, snapshot);
          if (!mediaType || !providerExecutor) {
            throw new AdminOpsBusinessError("task_not_retryable");
          }
          if (
            input.finalizeMode === "retry_persist_asset" &&
            !storageObjectKeyFromSnapshot(snapshot)
          ) {
            throw new AdminOpsBusinessError("task_not_retryable");
          }

          await deps.db.query(
            `
              UPDATE tasks
              SET status = 'manual_review_required',
                  locked_by = NULL,
                  locked_until = NULL,
                  heartbeat_at = NULL,
                  scheduled_at = $2,
                  updated_at = $2
              WHERE id = $1
                AND status IN ('failed', 'manual_review_required', 'result_unknown')
            `,
            [task.id, input.input.now],
          );
          await appendGenerationTaskFinalizeRequestedOutboxEvent(deps.db, {
            workflowId: task.workflowId,
            taskId: task.id,
            kind: mediaType,
            modelCode: snapshot?.model_code ?? null,
            providerExecutor,
            storageBucket: storageBucketFromSnapshot(snapshot),
            finalizeMode: input.finalizeMode,
            availableAt: input.input.now,
          });

          const updated = await getTaskForOps(deps.db, {
            taskId: task.id,
          });
          if (!updated) {
            throw new Error("ops_finalize_retry_missing_updated_task");
          }

          return {
            result: { task: updated },
            responseResourceType: "task",
            responseResourceId: updated.id,
            responseSnapshot: { task: updated },
            audit: {
              eventType: input.command.auditEvent,
              targetType: "task",
              targetId: updated.id,
              projectId: updated.projectId,
              reason,
              sensitive: true,
              metadata: {
                previousStatus: task.status,
                failureCode: task.failureCode,
                finalizeMode: input.finalizeMode,
              },
            },
          };
        },
      });

      return { status: 200, body: executed.result };
    } catch (error) {
      return authErrorResponse(error);
    }
  }

  return {
    async listItems(input: {
      user: AuthenticatedAdminOpsUser;
      now: Date;
    }): Promise<
      AdminOpsResponse<
        | {
            tasks: AdminTaskView[];
            paymentRisks: AdminPaymentRiskView[];
            paymentIssues: AdminPaymentIssueView[];
          }
        | { error: AdminOpsError }
      >
    > {
      try {
        const actor = await resolveOpsActor(input);
        const result = await deps.db.query<AdminTaskRow>(
          `
            SELECT
              t.id,
              t.project_id,
              t.workflow_id,
              t.task_type,
              t.status,
              t.queue_name,
              t.attempt_count,
              t.max_attempts,
              t.failure_code,
              t.updated_at,
              t.last_dispatched_at,
              t.scheduled_at,
              pr.status AS provider_status,
              pr.provider_name,
              pr.provider_operation,
              pr.external_request_id,
              pr.external_submission_started_at,
              pr.updated_at AS provider_updated_at,
              outbox.event_type AS outbox_event_type,
              outbox.status AS outbox_status,
              outbox.error_message AS outbox_error_message,
              snapshot.progress_stage,
              snapshot.credit_status AS snapshot_credit_status,
              reservation.status AS reservation_status,
              reservation.amount_reserved
            FROM tasks t
            LEFT JOIN LATERAL (
              SELECT *
              FROM provider_requests pr
              WHERE pr.task_id = t.id
              ORDER BY pr.updated_at DESC, pr.id DESC
              LIMIT 1
            ) pr ON true
            LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
            LEFT JOIN LATERAL (
              SELECT status, amount_reserved
              FROM credit_reservations reservation
              WHERE reservation.task_id = t.id
              ORDER BY reservation.created_at DESC, reservation.id DESC
              LIMIT 1
            ) reservation ON true
            LEFT JOIN LATERAL (
              SELECT event_type, status, error_message
              FROM outbox_events outbox
              WHERE outbox.payload_json->>'taskId' = t.id::text
                AND outbox.event_type IN (
                  'generation.task.created',
                  'generation.task.poll_requested',
                  'generation.task.finalize_requested'
                )
              ORDER BY outbox.updated_at DESC, outbox.id DESC
              LIMIT 1
            ) outbox ON true
            WHERE t.status IN ('result_unknown', 'manual_review_required', 'failed', 'canceled')
               OR (
                 t.status = 'queued'
                 AND t.scheduled_at <= $1
                 AND (t.last_dispatched_at IS NULL OR t.last_dispatched_at < $1 - INTERVAL '2 minutes')
               )
               OR (
                 t.status = 'running'
                 AND t.task_type = 'episode_generate_video'
                 AND pr.external_request_id IS NOT NULL
                 AND pr.status IN ('submitted', 'accepted', 'running', 'result_unknown')
                 AND t.updated_at < $1 - INTERVAL '2 minutes'
               )
            ORDER BY t.updated_at DESC, t.id ASC
            LIMIT 50
          `,
          [input.now],
        );
        const paymentRisks = await listPaymentRisksForOps(deps.db, {
        });
        const paymentIssues = await listPaymentIssuesForOps(deps.db, {
        });

        return {
          status: 200,
          body: {
            tasks: result.rows.map(taskViewFromRow),
            paymentRisks,
            paymentIssues,
          },
        };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async manualSettleTask(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        decision: "consume" | "release" | "mark_abnormal_cost";
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: manualSettleUnknownTaskCommand.operationName,
          capability: manualSettleUnknownTaskCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveCommandActor(db, {
              user: input.user,
              capability: manualSettleUnknownTaskCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const task = await getTaskForOps(deps.db, {
              taskId: idempotencyRecord.responseResourceId,
            });
            if (!task) {
              throw new Error("ops_manual_settle_replay_missing_task");
            }
            return { task };
          },
          execute: async ({ actor }) => {
            const task = await getTaskForOps(deps.db, {
              taskId: input.body.taskId,
            });
            if (!task) {
              throw new AdminOpsBusinessError("task_not_found");
            }

            const providerRequest = await getLatestProviderRequestForTask(deps.db, {
              taskId: task.id,
            });
            const reservation = await getActiveReservationForTask(deps.db, {
              taskId: task.id,
            });
            const finalStatus =
              input.body.decision === "mark_abnormal_cost"
                ? "manual_review_required"
                : "succeeded";
            const updatedTask = await queryOne<{ id: string }>(
              deps.db,
              `
                UPDATE tasks
                SET status = $2,
                    failure_code = NULL,
                    locked_by = NULL,
                    locked_until = NULL,
                    heartbeat_at = NULL,
                    updated_at = $3
                WHERE id = $1
                  AND status IN ('result_unknown', 'manual_review_required')
                RETURNING id
              `,
              [
                task.id,
                finalStatus,
                input.now,
              ],
            );
            if (!updatedTask) {
              throw new AdminOpsBusinessError("task_not_settleable");
            }

            if (reservation && reservation.amount_reserved > 0) {
              await settleReservationAllocationInTransaction(deps.db, {
                reservationId: reservation.id,
                allocationKey: `${task.id}:manual-settlement`,
                amount: reservation.amount_reserved,
                outcome: settlementOutcomeForDecision(input.body.decision),
                taskId: task.id,
                attemptId: providerRequest?.attempt_id ?? null,
                providerRequestId: providerRequest?.id ?? null,
                metadata: {
                  decision: input.body.decision,
                  reason,
                },
                now: input.now,
              });
            }

            await deps.db.query(
              `
                UPDATE task_attempts
                SET status = $2,
                    failure_code = NULL,
                    finished_at = COALESCE(finished_at, $3),
                    updated_at = $3
                WHERE task_id = $1
                  AND status IN ('result_unknown', 'manual_review_required')
              `,
              [
                task.id,
                finalStatus,
                input.now,
              ],
            );
            await deps.db.query(
              `
                UPDATE provider_requests
                SET status = $2,
                    failure_code = NULL,
                    updated_at = $3
                WHERE task_id = $1
                  AND status IN ('result_unknown', 'manual_review_required')
              `,
              [
                task.id,
                finalStatus,
                input.now,
              ],
            );
            if (task.workflowId) {
              await aggregateWorkflowStatus(deps.db, task.workflowId);
            }

            const updated = await getTaskForOps(deps.db, {
              taskId: input.body.taskId,
            });
            if (!updated) {
              throw new Error("ops_manual_settle_missing_updated_task");
            }

            return {
              result: { task: updated },
              responseResourceType: "task",
              responseResourceId: updated.id,
              responseSnapshot: { task: updated },
              audit: {
                eventType: manualSettleUnknownTaskCommand.auditEvent,
                targetType: "task",
                targetId: updated.id,
                projectId: updated.projectId,
                reason,
                sensitive: true,
                metadata: {
                  decision: input.body.decision,
                  previousStatus: task.status,
                  taskType: task.taskType,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async retryTask(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: adminRetryTaskCommand.operationName,
          capability: adminRetryTaskCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveCommandActor(db, {
              user: input.user,
              capability: adminRetryTaskCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const task = await getTaskForOps(deps.db, {
              taskId: idempotencyRecord.responseResourceId,
            });
            if (!task) {
              throw new Error("ops_retry_replay_missing_task");
            }
            return { task };
          },
          execute: async ({ actor }) => {
            const task = await getTaskForOps(deps.db, {
              taskId: input.body.taskId,
            });
            if (!task) {
              throw new AdminOpsBusinessError("task_not_found");
            }

            const updatedTask = await queryOne<{ id: string }>(
              deps.db,
              `
                UPDATE tasks
                SET status = 'queued',
                    failure_code = NULL,
                    locked_by = NULL,
                    locked_until = NULL,
                    heartbeat_at = NULL,
                    scheduled_at = $2,
                    updated_at = $2
                WHERE id = $1
                  AND status IN ('failed', 'canceled')
                  AND attempt_count < max_attempts
                RETURNING id
              `,
              [task.id, input.now],
            );
            if (!updatedTask) {
              throw new AdminOpsBusinessError("task_not_retryable");
            }

            await deps.db.query(
              `
                UPDATE workflows
                SET status = 'queued',
                    failure_code = NULL,
                    finished_at = NULL,
                    updated_at = $2
                WHERE id = $1
              `,
              [task.workflowId, input.now],
            );
            await appendRetryGenerationOutboxIfNeeded(deps.db, {
              taskId: task.id,
              availableAt: input.now,
            });

            const updated = await getTaskForOps(deps.db, {
              taskId: input.body.taskId,
            });
            if (!updated) {
              throw new Error("ops_retry_missing_updated_task");
            }

            return {
              result: { task: updated },
              responseResourceType: "task",
              responseResourceId: updated.id,
              responseSnapshot: { task: updated },
              audit: {
                eventType: adminRetryTaskCommand.auditEvent,
                targetType: "task",
                targetId: updated.id,
                projectId: updated.projectId,
                reason,
                sensitive: true,
                metadata: {
                  previousStatus: task.status,
                  taskType: task.taskType,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async recoverTask(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        action: AdminTaskRecoveryAction;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }
      if (!isAdminTaskRecoveryAction(input.body.action)) {
        return { status: 400, body: { error: "task_recovery_action_invalid" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: adminRecoverTaskCommand.operationName,
          capability: adminRecoverTaskCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveCommandActor(db, {
              user: input.user,
              capability: adminRecoverTaskCommand.capability,
              now: input.now,
            }),
          replay: async ({ idempotencyRecord }) => {
            const task = await getTaskForOps(deps.db, {
              taskId: idempotencyRecord.responseResourceId,
            });
            if (!task) {
              throw new Error("ops_recover_replay_missing_task");
            }
            return { task };
          },
          execute: async () => {
            const task = await getTaskForOps(deps.db, { taskId: input.body.taskId });
            if (!task) {
              throw new AdminOpsBusinessError("task_not_found");
            }
            const providerRequest = await getLatestProviderRequestForTask(deps.db, {
              taskId: task.id,
            });
            const snapshot = await getGenerationSnapshotForTask(deps.db, {
              taskId: task.id,
            });

            if (input.body.action === "redispatch") {
              if (!canRedispatchTask(task, providerRequest)) {
                throw new AdminOpsBusinessError("task_recovery_not_allowed");
              }
              if (task.status !== "queued") {
                const requeued = await queryOne<{ id: string }>(
                  deps.db,
                  `
                    UPDATE tasks
                    SET status = 'queued',
                        failure_code = NULL,
                        locked_by = NULL,
                        locked_until = NULL,
                        heartbeat_at = NULL,
                        scheduled_at = $2,
                        updated_at = $2
                    WHERE id = $1
                      AND status IN ('failed', 'canceled')
                      AND attempt_count < max_attempts
                    RETURNING id
                  `,
                  [task.id, input.now],
                );
                if (!requeued) {
                  throw new AdminOpsBusinessError("task_recovery_not_allowed");
                }
              } else {
                await deps.db.query(
                  `
                    UPDATE tasks
                    SET last_dispatched_at = NULL,
                        scheduled_at = $2,
                        updated_at = $2
                    WHERE id = $1
                      AND status = 'queued'
                  `,
                  [task.id, input.now],
                );
              }
              await deps.db.query(
                `
                  UPDATE workflows
                  SET status = 'queued',
                      failure_code = NULL,
                      finished_at = NULL,
                      updated_at = $2
                  WHERE id = $1
                `,
                [task.workflowId, input.now],
              );
              await appendRetryGenerationOutboxIfNeeded(deps.db, {
                taskId: task.id,
                availableAt: input.now,
                dispatchToken: input.idempotencyKey,
              });
            } else if (input.body.action === "resume_provider_poll") {
              if (!canResumeProviderPoll(task, providerRequest)) {
                throw new AdminOpsBusinessError("task_recovery_not_allowed");
              }
              await deps.db.query(
                `
                  UPDATE tasks
                  SET status = 'running',
                      failure_code = NULL,
                      locked_by = NULL,
                      locked_until = NULL,
                      heartbeat_at = NULL,
                      scheduled_at = $2,
                      updated_at = $2
                  WHERE id = $1
                    AND status IN ('running', 'result_unknown', 'manual_review_required')
                `,
                [task.id, input.now],
              );
              await deps.db.query(
                `
                  UPDATE task_attempts
                  SET status = 'running',
                      failure_code = NULL,
                      finished_at = NULL,
                      updated_at = $2
                  WHERE id = $1
                    AND status IN ('result_unknown', 'manual_review_required')
                `,
                [providerRequest?.attempt_id, input.now],
              );
              await deps.db.query(
                `
                  UPDATE workflows
                  SET status = 'running',
                      failure_code = NULL,
                      finished_at = NULL,
                      updated_at = $2
                  WHERE id = $1
                `,
                [task.workflowId, input.now],
              );
              await appendGenerationTaskPollRequestedOutboxEvent(deps.db, {
                workflowId: task.workflowId,
                taskId: task.id,
                modelCode: snapshot?.model_code ?? null,
                providerExecutor: providerExecutorForRetry(task, snapshot) ?? "seedance",
                availableAt: input.now,
              });
            } else {
              if (!canRebuildFinalize(task, providerRequest)) {
                throw new AdminOpsBusinessError("task_recovery_not_allowed");
              }
              const mediaType = readGenerationKind(snapshot?.media_type, task.taskType);
              const providerExecutor = providerExecutorForRetry(task, snapshot);
              if (!mediaType || !providerExecutor) {
                throw new AdminOpsBusinessError("task_recovery_not_allowed");
              }
              await deps.db.query(
                `
                  UPDATE tasks
                  SET status = 'manual_review_required',
                      locked_by = NULL,
                      locked_until = NULL,
                      heartbeat_at = NULL,
                      scheduled_at = $2,
                      updated_at = $2
                  WHERE id = $1
                    AND status IN ('queued', 'running', 'failed', 'result_unknown', 'manual_review_required')
                `,
                [task.id, input.now],
              );
              await appendGenerationTaskFinalizeRequestedOutboxEvent(deps.db, {
                workflowId: task.workflowId,
                taskId: task.id,
                kind: mediaType,
                modelCode: snapshot?.model_code ?? null,
                providerExecutor,
                storageBucket: storageBucketFromSnapshot(snapshot),
                finalizeMode: "retry_finalize",
                availableAt: input.now,
              });
            }

            const updated = await getTaskForOps(deps.db, { taskId: task.id });
            if (!updated) {
              throw new Error("ops_recover_missing_updated_task");
            }
            return {
              result: { task: updated },
              responseResourceType: "task",
              responseResourceId: updated.id,
              responseSnapshot: { task: updated },
              audit: {
                eventType: adminRecoverTaskCommand.auditEvent,
                targetType: "task",
                targetId: updated.id,
                projectId: updated.projectId,
                reason,
                sensitive: true,
                metadata: {
                  action: input.body.action,
                  previousStatus: task.status,
                  failureCode: task.failureCode,
                  providerStatus: providerRequest?.status ?? null,
                  externalRequestId: providerRequest?.external_request_id ?? null,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async retryFinalize(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      return retryFinalizeStage({
        command: adminRetryFinalizeCommand,
        finalizeMode: "retry_finalize",
        retryableFailureCodes: new Set([
          "provider_output_storage_failed",
          "provider_output_download_failed",
          "provider_output_upload_failed",
        ]),
        input,
      });
    },

    async retryPersistAsset(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        taskId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ task: AdminTaskView } | { error: AdminOpsError }>
    > {
      return retryFinalizeStage({
        command: adminRetryPersistAssetCommand,
        finalizeMode: "retry_persist_asset",
        retryableFailureCodes: new Set(["provider_output_persist_failed"]),
        input,
      });
    },

    async markPaymentRiskReviewed(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        riskEventId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<{ risk: AdminPaymentRiskView } | { error: AdminOpsError }>
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: markPaymentRiskReviewedCommand.operationName,
          capability: markPaymentRiskReviewedCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveCommandActor(db, {
              user: input.user,
              capability: markPaymentRiskReviewedCommand.capability,
              now: input.now,
            }),
          replay: async ({ actor, idempotencyRecord }) => {
            const risk = await getPaymentRiskForOps(deps.db, {
              riskEventId: idempotencyRecord.responseResourceId,
            });
            if (!risk) {
              throw new Error("ops_payment_risk_replay_missing_risk");
            }
            return { risk };
          },
          execute: async ({ actor }) => {
            const risk = await getPaymentRiskForOps(deps.db, {
              riskEventId: input.body.riskEventId,
            });
            if (!risk) {
              throw new AdminOpsBusinessError("payment_risk_not_found");
            }

            const reviewed = await queryOne<AdminPaymentRiskRow>(
              deps.db,
              `
                UPDATE payment_risk_events
                SET status = 'reviewed',
                    reviewed_by_user_id = $2,
                    reviewed_by_admin_account_id = $3,
                    reviewed_at = $4,
                    review_reason = $5,
                    updated_at = $4
                WHERE id = $1
                  AND status = 'open'
                RETURNING *
              `,
              [
                input.body.riskEventId,
                actor.userId,
                "adminAccountId" in actor ? actor.adminAccountId : null,
                input.now,
                reason,
              ],
            );
            if (!reviewed) {
              throw new AdminOpsBusinessError("payment_risk_not_reviewable");
            }

            const riskView = paymentRiskViewFromRow(reviewed);
            return {
              result: { risk: riskView },
              responseResourceType: "payment_risk_event",
              responseResourceId: reviewed.id,
              responseSnapshot: { risk: riskView },
              audit: {
                eventType: markPaymentRiskReviewedCommand.auditEvent,
                targetType: "payment_risk_event",
                targetId: reviewed.id,
                reason,
                sensitive: true,
                metadata: {
                  riskType: reviewed.risk_type,
                  previousStatus: risk.status,
                  orderId: reviewed.order_id,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },

    async repairPaidWithoutCredit(input: {
      user: AuthenticatedAdminOpsUser;
      idempotencyKey: string;
      body: {
        orderId: string;
        reason: string;
      };
      now: Date;
    }): Promise<
      AdminOpsResponse<
        | {
            issue: AdminPaymentIssueView;
            creditGrant: { id: string; amount: number };
          }
        | { error: AdminOpsError }
      >
    > {
      const reason = input.body.reason.trim();
      if (!reason) {
        return { status: 400, body: { error: "reason_required" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: repairPaidWithoutCreditCommand.operationName,
          capability: repairPaidWithoutCreditCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson(input.body),
          now: input.now,
          resolveActor: (db) =>
            resolveCommandActor(db, {
              user: input.user,
              capability: repairPaidWithoutCreditCommand.capability,
              now: input.now,
            }),
          replay: async ({ idempotencyRecord }) => {
            if (!idempotencyRecord.responseSnapshot) {
              throw new Error("ops_repair_replay_missing_snapshot");
            }
            return idempotencyRecord.responseSnapshot as {
              issue: AdminPaymentIssueView;
              creditGrant: { id: string; amount: number };
            };
          },
          execute: async ({ actor }) => {
            const baseOrder = await getBillingOrderForOps(deps.db, {
              orderId: input.body.orderId,
            });
            if (!baseOrder) {
              throw new AdminOpsBusinessError("payment_issue_not_found");
            }
            const order = await getVerifiedPaidCreditOrderForOps(deps.db, {
              orderId: input.body.orderId,
            });
            if (!order || order.status !== "paid" || order.credit_grant_ledger_entry_id) {
              throw new AdminOpsBusinessError("payment_issue_not_repairable");
            }

            const creditGrant = await grantCreditsInTransaction(deps.db, {
              userId: order.created_by_user_id,
              amount: order.credits,
              sourceType: "payment_order",
              sourceId: order.id,
              reason,
              createdByUserId: actor.userId,
              metadata: {
                orderNo: order.order_no,
                paymentIntentId: order.successful_payment_intent_id,
              },
              now: input.now,
            });

            const updatedOrder = await queryOne<AdminBillingOrderRow>(
              deps.db,
              `
                UPDATE billing_orders
                SET credit_grant_ledger_entry_id = $2,
                    updated_at = $3
                WHERE id = $1
                  AND product_type = 'credit_package'
                  AND status = 'paid'
                  AND credit_grant_ledger_entry_id IS NULL
                RETURNING *
              `,
              [order.id, creditGrant.id, input.now],
            );
            if (!updatedOrder) {
              throw new AdminOpsBusinessError("payment_issue_not_repairable");
            }

            const result = {
              issue: paymentIssueViewFromOrder(
                updatedOrder,
                "resolved",
              ),
              creditGrant: {
                id: creditGrant.id,
                amount: creditGrant.amount,
              },
            };

            return {
              result,
              responseResourceType: "credit_ledger_entry",
              responseResourceId: creditGrant.id,
              responseSnapshot: result,
              audit: {
                eventType: repairPaidWithoutCreditCommand.auditEvent,
                targetType: "billing_order",
                targetId: order.id,
                reason,
                sensitive: true,
                metadata: {
                  orderNo: order.order_no,
                  creditGrantLedgerEntryId: creditGrant.id,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return authErrorResponse(error);
      }
    },
  };
}

function assertCapabilityGranted(
  actor: AdminCommandActor,
  capability: typeof capabilities[keyof typeof capabilities],
) {
  if (!actor.capabilities.includes(capability)) {
    throw new AuthorizationError("capability_missing");
  }
}

export async function listAdminOpsItems(
  deps: AdminOpsServiceDeps,
): Promise<{
  tasks: AdminTaskView[];
  paymentRisks: AdminPaymentRiskView[];
  paymentIssues: AdminPaymentIssueView[];
}> {
  const result = await deps.db.query<AdminTaskRow>(
    `
      SELECT
        t.id,
        t.project_id,
        t.workflow_id,
        t.task_type,
        t.status,
        t.queue_name,
        t.attempt_count,
        t.max_attempts,
        t.failure_code,
        t.updated_at,
        t.last_dispatched_at,
        t.scheduled_at,
        pr.status AS provider_status,
        pr.provider_name,
        pr.provider_operation,
        pr.external_request_id,
        pr.external_submission_started_at,
        pr.updated_at AS provider_updated_at,
        outbox.event_type AS outbox_event_type,
        outbox.status AS outbox_status,
        outbox.error_message AS outbox_error_message,
        snapshot.progress_stage,
        snapshot.credit_status AS snapshot_credit_status,
        reservation.status AS reservation_status,
        reservation.amount_reserved
      FROM tasks t
      LEFT JOIN LATERAL (
        SELECT *
        FROM provider_requests pr
        WHERE pr.task_id = t.id
        ORDER BY pr.updated_at DESC, pr.id DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
      LEFT JOIN LATERAL (
        SELECT status, amount_reserved
        FROM credit_reservations reservation
        WHERE reservation.task_id = t.id
        ORDER BY reservation.created_at DESC, reservation.id DESC
        LIMIT 1
      ) reservation ON true
      LEFT JOIN LATERAL (
        SELECT event_type, status, error_message
        FROM outbox_events outbox
        WHERE outbox.payload_json->>'taskId' = t.id::text
          AND outbox.event_type IN (
            'generation.task.created',
            'generation.task.poll_requested',
            'generation.task.finalize_requested'
          )
        ORDER BY outbox.updated_at DESC, outbox.id DESC
        LIMIT 1
      ) outbox ON true
      WHERE t.status IN ('result_unknown', 'manual_review_required', 'failed', 'canceled')
         OR (
           t.status = 'queued'
           AND t.scheduled_at <= NOW()
           AND (t.last_dispatched_at IS NULL OR t.last_dispatched_at < NOW() - INTERVAL '2 minutes')
         )
         OR (
           t.status = 'running'
           AND t.task_type = 'episode_generate_video'
           AND pr.external_request_id IS NOT NULL
           AND pr.status IN ('submitted', 'accepted', 'running', 'result_unknown')
           AND t.updated_at < NOW() - INTERVAL '2 minutes'
         )
      ORDER BY t.updated_at DESC, t.id ASC
      LIMIT 50
    `,
  );
  const paymentRisks = await listPaymentRisksForOps(deps.db, {
  });
  const paymentIssues = await listPaymentIssuesForOps(deps.db, {
  });

  return {
    tasks: result.rows.map(taskViewFromRow),
    paymentRisks,
    paymentIssues,
  };
}

async function getTaskForOps(
  db: SqlDatabase,
  input: {
    taskId: string;
  },
): Promise<AdminTaskView | undefined> {
  const row = await queryOne<AdminTaskRow>(
    db,
    `
      SELECT
        t.id,
        t.project_id,
        t.workflow_id,
        t.task_type,
        t.status,
        t.queue_name,
        t.attempt_count,
        t.max_attempts,
        t.failure_code,
        t.updated_at,
        t.last_dispatched_at,
        t.scheduled_at,
        pr.status AS provider_status,
        pr.provider_name,
        pr.provider_operation,
        pr.external_request_id,
        pr.external_submission_started_at,
        pr.updated_at AS provider_updated_at,
        outbox.event_type AS outbox_event_type,
        outbox.status AS outbox_status,
        outbox.error_message AS outbox_error_message,
        snapshot.progress_stage,
        snapshot.credit_status AS snapshot_credit_status,
        reservation.status AS reservation_status,
        reservation.amount_reserved
      FROM tasks t
      LEFT JOIN LATERAL (
        SELECT *
        FROM provider_requests pr
        WHERE pr.task_id = t.id
        ORDER BY pr.updated_at DESC, pr.id DESC
        LIMIT 1
      ) pr ON true
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = t.id
      LEFT JOIN LATERAL (
        SELECT status, amount_reserved
        FROM credit_reservations reservation
        WHERE reservation.task_id = t.id
        ORDER BY reservation.created_at DESC, reservation.id DESC
        LIMIT 1
      ) reservation ON true
      LEFT JOIN LATERAL (
        SELECT event_type, status, error_message
        FROM outbox_events outbox
        WHERE outbox.payload_json->>'taskId' = t.id::text
          AND outbox.event_type IN (
            'generation.task.created',
            'generation.task.poll_requested',
            'generation.task.finalize_requested'
          )
        ORDER BY outbox.updated_at DESC, outbox.id DESC
        LIMIT 1
      ) outbox ON true
      WHERE t.id = $1
      LIMIT 1
    `,
    [input.taskId],
  );

  return row ? taskViewFromRow(row) : undefined;
}

async function getLatestProviderRequestForTask(
  db: SqlDatabase,
  input: {
    taskId: string;
  },
) {
  return queryOne<ProviderRequestOpsRow>(
    db,
    `
      SELECT
        id,
        attempt_id,
        status,
        external_submission_started_at,
        external_request_id
      FROM provider_requests
      WHERE task_id = $1
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [input.taskId],
  );
}

async function getActiveReservationForTask(
  db: SqlDatabase,
  input: {
    taskId: string;
  },
) {
  return queryOne<{ id: string; amount_reserved: number }>(
    db,
    `
      SELECT id, amount_reserved
      FROM credit_reservations
      WHERE task_id = $1
        AND status IN ('active', 'partially_settled')
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.taskId],
  );
}

async function getGenerationSnapshotForTask(
  db: SqlDatabase,
  input: {
    taskId: string;
  },
) {
  return queryOne<AdminTaskSnapshotRow>(
    db,
    `
      SELECT model_code, media_type, failure_json, result_assets_json
      FROM ai_generation_task_snapshots
      WHERE task_id = $1
      LIMIT 1
    `,
    [input.taskId],
  );
}

function providerExecutorForRetry(
  task: AdminTaskView,
  snapshot: AdminTaskSnapshotRow | undefined,
) {
  const failure = normalizeJson(snapshot?.failure_json ?? null);
  return (
    readNonEmptyString(failure.providerExecutor) ??
    readNonEmptyString(failure.provider_executor) ??
    providerExecutorFromTask(task)
  );
}

function providerExecutorFromTask(task: AdminTaskView) {
  if (task.providerName?.includes("seedance") || task.taskType.includes("video")) {
    return "seedance";
  }
  if (task.providerName?.includes("gpt") || task.taskType.includes("image")) {
    return "gpt-image-2";
  }
  return undefined;
}

function storageBucketFromSnapshot(snapshot: AdminTaskSnapshotRow | undefined) {
  const failure = normalizeJson(snapshot?.failure_json ?? null);
  return (
    readNonEmptyString(failure.storageBucket) ??
    readNonEmptyString(failure.storage_bucket) ??
    null
  );
}

function storageObjectKeyFromSnapshot(snapshot: AdminTaskSnapshotRow | undefined) {
  const failure = normalizeJson(snapshot?.failure_json ?? null);
  return (
    readNonEmptyString(failure.storageObjectKey) ??
    readNonEmptyString(failure.storage_object_key) ??
    null
  );
}

function settlementOutcomeForDecision(
  decision: "consume" | "release" | "mark_abnormal_cost",
): CreditAllocationOutcome {
  if (decision === "consume") {
    return "consumed";
  }
  if (decision === "release") {
    return "released";
  }
  return "manual_review_required";
}

function taskViewFromRow(row: AdminTaskRow): AdminTaskView {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    projectId: row.project_id,
    taskType: row.task_type,
    status: row.status,
    queueName: row.queue_name,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    failureCode: row.failure_code,
    updatedAt: new Date(row.updated_at).toISOString(),
    providerStatus: row.provider_status,
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    externalRequestId: row.external_request_id,
    externalSubmissionStartedAt: optionalIsoDate(row.external_submission_started_at),
    providerUpdatedAt: optionalIsoDate(row.provider_updated_at),
    lastDispatchedAt: optionalIsoDate(row.last_dispatched_at),
    scheduledAt: optionalIsoDate(row.scheduled_at),
    outboxEventType: row.outbox_event_type,
    outboxStatus: row.outbox_status,
    outboxErrorMessage: row.outbox_error_message,
    progressStage: row.progress_stage,
    creditStatus: row.snapshot_credit_status,
    reservationStatus: row.reservation_status,
    reservedCredits: Number(row.amount_reserved ?? 0),
  };
}

function optionalIsoDate(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function isAdminTaskRecoveryAction(value: string): value is AdminTaskRecoveryAction {
  return value === "redispatch"
    || value === "resume_provider_poll"
    || value === "rebuild_finalize";
}

function canRedispatchTask(
  task: AdminTaskView,
  providerRequest: ProviderRequestOpsRow | undefined,
) {
  if (!readGenerationKind(undefined, task.taskType)) {
    return false;
  }
  const taskCanQueue = task.status === "queued"
    || (
      (task.status === "failed" || task.status === "canceled")
      && task.attemptCount < task.maxAttempts
    );
  if (!taskCanQueue) {
    return false;
  }
  if (!providerRequest?.external_submission_started_at) {
    return true;
  }
  return providerRequest.status === "failed" || providerRequest.status === "canceled";
}

function canResumeProviderPoll(
  task: AdminTaskView,
  providerRequest: ProviderRequestOpsRow | undefined,
) {
  return task.taskType === "episode_generate_video"
    && ["running", "result_unknown", "manual_review_required"].includes(task.status)
    && Boolean(providerRequest?.external_submission_started_at)
    && Boolean(providerRequest?.external_request_id)
    && ["submitted", "accepted", "running", "result_unknown"].includes(
      providerRequest?.status ?? "",
    );
}

function canRebuildFinalize(
  task: AdminTaskView,
  providerRequest: ProviderRequestOpsRow | undefined,
) {
  return ["queued", "running", "failed", "result_unknown", "manual_review_required"].includes(
    task.status,
  )
    && providerRequest?.status === "succeeded"
    && Boolean(providerRequest.external_request_id);
}

async function listPaymentRisksForOps(
  db: SqlDatabase,
  _input: Record<string, never>,
): Promise<AdminPaymentRiskView[]> {
  const result = await db.query<AdminPaymentRiskRow>(
    `
      SELECT *
      FROM payment_risk_events
      WHERE status = 'open'
      ORDER BY created_at DESC, id ASC
      LIMIT 50
    `,
  );

  return result.rows.map(paymentRiskViewFromRow);
}

async function listPaymentIssuesForOps(
  db: SqlDatabase,
  _input: Record<string, never>,
): Promise<AdminPaymentIssueView[]> {
  const result = await db.query<AdminPaymentIssueRow>(
    `
      SELECT
        bo.id AS order_id,
        bo.order_no,
        bo.status,
        bo.credits,
        bo.amount_minor,
        bo.currency,
        bo.paid_at,
        bo.successful_payment_intent_id,
        bo.credit_grant_ledger_entry_id
      FROM billing_orders bo
      JOIN payment_intents pi
        ON pi.id = bo.successful_payment_intent_id
       AND pi.order_id = bo.id
       AND pi.status = 'succeeded'
       AND pi.amount_minor = bo.amount_minor
       AND pi.currency = bo.currency
      LEFT JOIN credit_ledger_entries cle
        ON cle.user_id = bo.created_by_user_id
       AND cle.source_type = 'payment_order'
       AND cle.source_id = bo.id
       AND cle.entry_type = 'grant'
      WHERE bo.product_type = 'credit_package'
        AND bo.status = 'paid'
        AND bo.credit_grant_ledger_entry_id IS NULL
        AND cle.id IS NULL
        AND EXISTS (
          SELECT 1
          FROM payment_provider_events ppe
          WHERE ppe.order_id = bo.id
            AND ppe.payment_intent_id = pi.id
            AND ppe.event_type = 'payment_succeeded'
            AND ppe.processing_status = 'processed'
        )
      ORDER BY bo.paid_at DESC NULLS LAST, bo.updated_at DESC
      LIMIT 50
    `,
  );

  return result.rows.map(paymentIssueViewFromRow);
}

async function getPaymentRiskForOps(
  db: SqlDatabase,
  input: { riskEventId: string },
) {
  const row = await queryOne<AdminPaymentRiskRow>(
    db,
    `
      SELECT *
      FROM payment_risk_events
      WHERE id = $1
      LIMIT 1
    `,
    [input.riskEventId],
  );

  return row ? paymentRiskViewFromRow(row) : undefined;
}

async function getBillingOrderForOps(
  db: SqlDatabase,
  input: { orderId: string },
) {
  return queryOne<AdminBillingOrderRow>(
    db,
    `
      SELECT *
      FROM billing_orders
      WHERE id = $1
        AND product_type = 'credit_package'
      LIMIT 1
    `,
    [input.orderId],
  );
}

async function getVerifiedPaidCreditOrderForOps(
  db: SqlDatabase,
  input: { orderId: string },
) {
  return queryOne<VerifiedPaidCreditOrderRow>(
    db,
    `
      SELECT
        bo.*,
        pi.amount_minor AS intent_amount_minor,
        pi.currency AS intent_currency,
        ppe.id AS provider_event_id
      FROM billing_orders bo
      JOIN payment_intents pi
        ON pi.id = bo.successful_payment_intent_id
       AND pi.order_id = bo.id
       AND pi.status = 'succeeded'
       AND pi.amount_minor = bo.amount_minor
       AND pi.currency = bo.currency
      JOIN payment_provider_events ppe
        ON ppe.order_id = bo.id
       AND ppe.payment_intent_id = pi.id
       AND ppe.event_type = 'payment_succeeded'
       AND ppe.processing_status = 'processed'
      WHERE bo.id = $1
        AND bo.product_type = 'credit_package'
        AND bo.status = 'paid'
      LIMIT 1
      FOR UPDATE OF bo
    `,
    [input.orderId],
  );
}

async function getPaymentIssueForOps(
  db: SqlDatabase,
  input: { orderId: string },
) {
  const row = await queryOne<AdminPaymentIssueRow>(
    db,
    `
      SELECT
        bo.id AS order_id,
        bo.order_no,
        bo.status,
        bo.credits,
        bo.amount_minor,
        bo.currency,
        bo.paid_at,
        bo.successful_payment_intent_id,
        bo.credit_grant_ledger_entry_id
      FROM billing_orders bo
      WHERE bo.id = $1
        AND bo.product_type = 'credit_package'
      LIMIT 1
    `,
    [input.orderId],
  );

  if (!row) {
    return undefined;
  }

  return paymentIssueViewFromRow({
    ...row,
    status: row.credit_grant_ledger_entry_id ? "resolved" : row.status,
  });
}

function paymentRiskViewFromRow(row: AdminPaymentRiskRow): AdminPaymentRiskView {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentIntentId: row.payment_intent_id,
    providerEventId: row.provider_event_id,
    riskType: row.risk_type,
    severity: row.severity,
    decision: row.decision,
    status: row.status,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function paymentIssueViewFromRow(row: AdminPaymentIssueRow): AdminPaymentIssueView {
  return {
    issueType: "paid_without_credit",
    orderId: row.order_id,
    orderNo: row.order_no,
    status: row.credit_grant_ledger_entry_id ? "resolved" : "open",
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
  };
}

function paymentIssueViewFromOrder(
  row: AdminBillingOrderRow,
  status: "open" | "resolved",
): AdminPaymentIssueView {
  return {
    issueType: "paid_without_credit",
    orderId: row.id,
    orderNo: row.order_no,
    status,
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
  };
}

function normalizeJson(value: Record<string, unknown> | string | null) {
  if (!value) {
    return {};
  }
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function appendRetryGenerationOutboxIfNeeded(
  db: SqlDatabase,
  input: {
    taskId: string;
    availableAt: Date;
    dispatchToken?: string;
  },
) {
  const row = await queryOne<GenerationRetryTaskRow>(
    db,
    `
      SELECT
        id,
        workflow_id,
        task_type,
        queue_name,
        input_snapshot_json,
        target_entity_type,
        target_entity_id
      FROM tasks
      WHERE id = $1
        AND status = 'queued'
        AND task_type IN ('episode_generate_image', 'episode_generate_video')
      LIMIT 1
    `,
    [input.taskId],
  );
  if (!row) {
    return;
  }

  const snapshot = normalizeJson(row.input_snapshot_json);
  const providerExecutor = readNonEmptyString(snapshot.providerExecutor);
  if (!providerExecutor || providerExecutor === "mock") {
    return;
  }

  const kind = readGenerationKind(snapshot.kind, row.task_type);
  if (!kind) {
    return;
  }

  await appendGenerationTaskCreatedOutboxEvent(db, {
    workflowId: row.workflow_id,
    taskId: row.id,
    kind,
    modelCode: readNonEmptyString(snapshot.model) ?? null,
    queueName: row.queue_name,
    targetType: readNonEmptyString(snapshot.targetType) ?? row.target_entity_type,
    targetId: readNonEmptyString(snapshot.targetId) ?? row.target_entity_id,
    providerExecutor,
    dispatchToken: input.dispatchToken,
    availableAt: input.availableAt,
  });
}

function readGenerationKind(
  value: unknown,
  taskType: string,
): "image" | "video" | undefined {
  if (value === "image" || value === "video") {
    return value;
  }
  if (taskType === "episode_generate_image") {
    return "image";
  }
  if (taskType === "episode_generate_video") {
    return "video";
  }
  return undefined;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function authErrorResponse(error: unknown): AdminOpsResponse<{ error: AdminOpsError }> {
  if (error instanceof AuthorizationError) {
    return {
      status: error.code === "unauthenticated" ? 401 : 403,
      body: { error: "ops_forbidden" },
    };
  }

  if (error instanceof AdminOpsBusinessError) {
    return {
      status: adminOpsBusinessErrorStatus(error.code),
      body: { error: error.code },
    };
  }

  if (error instanceof IdempotencyConflictError) {
    return {
      status: 409,
      body: { error: error.code },
    };
  }

  if (error instanceof IdempotencyProcessingError) {
    return {
      status: 202,
      body: { error: error.code },
    };
  }

  throw error;
}

function adminOpsBusinessErrorStatus(error: Exclude<AdminOpsError, "ops_forbidden">) {
  if (
    error === "task_not_found" ||
    error === "payment_risk_not_found" ||
    error === "payment_issue_not_found"
  ) {
    return 404;
  }
  if (error === "reason_required") {
    return 400;
  }
  if (error === "idempotency_processing") {
    return 202;
  }
  return 409;
}
