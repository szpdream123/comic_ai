import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { settleReservationAllocationInTransaction } from "../credit-billing/credit-ledger.service.ts";
import { resolveGenerationBillingAmount } from "../credit-billing/team-member-generation-credit.service.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";
import {
  parseGptImageArtifactRecoveryState,
  planGptImageArtifactRecovery,
  serializeGptImageArtifactRecoveryState,
} from "./gpt-image-artifact-recovery.policy.ts";

interface GptImageArtifactRecoveryTaskRow {
  task_id: string;
  workflow_id: string;
  task_status: string;
  current_attempt_id: string | null;
  input_snapshot_json: Record<string, unknown> | string;
  provider_request_id: string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
  provider_status_json: Record<string, unknown> | string | null;
}

export async function handleGptImageArtifactQueueExhaustion(
  db: SqlDatabase,
  input: {
    taskId: string;
    expectedAttemptId?: string | null;
    error: unknown;
    now: Date;
  },
): Promise<"retry_pending" | "manual_review_required" | "skipped"> {
  await db.query("BEGIN");
  try {
    const enforceExpectedAttempt = Object.prototype.hasOwnProperty.call(input, "expectedAttemptId");
    const row = await queryOne<GptImageArtifactRecoveryTaskRow>(
      db,
      `
        SELECT
          task.id AS task_id,
          task.workflow_id,
          task.status AS task_status,
          task.current_attempt_id,
          task.input_snapshot_json,
          provider_request.id AS provider_request_id,
          reservation.id AS reservation_id,
          reservation.amount_reserved,
          snapshot.provider_status_json
        FROM tasks task
        LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        LEFT JOIN LATERAL (
          SELECT request.id
          FROM provider_requests request
          WHERE request.task_id = task.id
            AND request.status = 'succeeded'
            AND (
              request.attempt_id = task.current_attempt_id
              OR (request.attempt_id IS NULL AND task.attempt_count = 1)
            )
          ORDER BY request.updated_at DESC, request.created_at DESC
          LIMIT 1
        ) provider_request ON true
        LEFT JOIN generation_task_credit_reservations task_reservation
          ON task_reservation.task_id = task.id
        LEFT JOIN credit_reservations reservation
          ON reservation.id = task_reservation.id
        WHERE task.id = $1
          AND (
            $2::boolean = false
            OR ($3::uuid IS NOT NULL AND task.current_attempt_id = $3)
            OR ($3::uuid IS NULL AND task.attempt_count = 1)
          )
          AND task.task_type = 'episode_generate_image'
          AND task.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http')
        LIMIT 1
        FOR UPDATE OF task
      `,
      [input.taskId, enforceExpectedAttempt, input.expectedAttemptId ?? null],
    );
    if (!row || !row.provider_request_id || ["succeeded", "canceled"].includes(row.task_status)) {
      await db.query("COMMIT");
      return "skipped";
    }

    const providerStatus = readRecord(row.provider_status_json);
    const previous = parseGptImageArtifactRecoveryState(providerStatus.artifactRecovery);
    if (
      previous?.state === "manual_review"
      || (
        previous?.state === "retry_pending"
        && previous.nextRetryAt
        && previous.nextRetryAt.getTime() > input.now.getTime()
      )
    ) {
      await db.query("COMMIT");
      return "skipped";
    }
    const decision = planGptImageArtifactRecovery({
      now: input.now,
      previous,
      failure: input.error,
    });
    const serializedRecovery = JSON.stringify(serializeGptImageArtifactRecoveryState(decision));

    if (decision.action === "retry") {
      await db.query(
        `
          UPDATE tasks task
          SET status = 'running',
              failure_code = NULL,
              locked_by = NULL,
              locked_until = NULL,
              heartbeat_at = NULL,
              updated_at = $2
          WHERE task.id = $1
            AND task.status IN ('running', 'failed', 'result_unknown', 'manual_review_required')
        `,
        [row.task_id, input.now],
      );
      if (row.current_attempt_id) {
        await db.query(
          `
            UPDATE task_attempts attempt
            SET status = 'running',
                failure_code = NULL,
                locked_by = NULL,
                locked_until = NULL,
                heartbeat_at = NULL,
                finished_at = NULL,
                updated_at = $3
            WHERE attempt.id = $2
              AND attempt.task_id = $1
              AND attempt.status IN ('running', 'failed', 'result_unknown', 'manual_review_required')
          `,
          [row.task_id, row.current_attempt_id, input.now],
        );
      }
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'running',
              progress_stage = 'asset_transfer_retry_pending',
              progress_percent = 75,
              provider_status_json = jsonb_set(
                COALESCE(provider_status_json, '{}'::jsonb),
                '{artifactRecovery}',
                $2::jsonb,
                true
              ) || jsonb_build_object(
                'providerSucceeded', true,
                'transferStatus', 'retry_pending',
                'transferFailureCode', $3::text
              ),
              failure_json = NULL,
              credit_status = 'reserved',
              failed_at = NULL,
              updated_at = $4
          WHERE task_id = $1
            AND status <> 'succeeded'
        `,
        [row.task_id, serializedRecovery, decision.lastFailureCode, input.now],
      );
      await reopenManualReviewReservation(db, row.reservation_id, input.now);
      await aggregateWorkflowStatus(db, row.workflow_id);
      await db.query("COMMIT");
      return "retry_pending";
    }

    const failure = JSON.stringify({
      failureCode: "provider_output_storage_failed",
      lastFailureCode: decision.lastFailureCode,
      displayMessage: "供应商已完成图片生成，但平台未能在自动恢复窗口内保存结果，正在等待后台处理。",
      recoveryReason: decision.reason,
      noticeType: "admin_action_required",
    });
    await db.query(
      `
        UPDATE tasks task
        SET status = 'manual_review_required',
            failure_code = 'provider_output_storage_failed',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            updated_at = $2
        WHERE task.id = $1
          AND task.status IN ('running', 'failed', 'result_unknown', 'manual_review_required')
      `,
      [row.task_id, input.now],
    );
    if (row.current_attempt_id) {
      await db.query(
        `
          UPDATE task_attempts attempt
          SET status = 'manual_review_required',
              failure_code = 'provider_output_storage_failed',
              locked_by = NULL,
              locked_until = NULL,
              heartbeat_at = NULL,
              finished_at = NULL,
              updated_at = $3
          WHERE attempt.id = $2
            AND attempt.task_id = $1
            AND attempt.status IN ('running', 'failed', 'result_unknown', 'manual_review_required')
        `,
        [row.task_id, row.current_attempt_id, input.now],
      );
    }
    await db.query(
      `
        UPDATE ai_generation_task_snapshots
        SET status = 'manual_review_required',
            progress_stage = 'asset_transfer_manual_review',
            progress_percent = 100,
            provider_status_json = jsonb_set(
              COALESCE(provider_status_json, '{}'::jsonb),
              '{artifactRecovery}',
              $2::jsonb,
              true
            ) || jsonb_build_object(
              'providerSucceeded', true,
              'transferStatus', 'manual_review_required',
              'transferFailureCode', $4::text
            ),
            failure_json = $3::jsonb,
            credit_status = 'manual_review_required',
            failed_at = $5,
            updated_at = $5
        WHERE task_id = $1
          AND status <> 'succeeded'
      `,
      [row.task_id, serializedRecovery, failure, decision.lastFailureCode, input.now],
    );
    const snapshot = readRecord(row.input_snapshot_json);
    const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
    if (row.reservation_id && amount > 0) {
      await settleReservationAllocationInTransaction(db, {
        reservationId: row.reservation_id,
        allocationKey: "provider_output_storage_failed",
        amount,
        outcome: "manual_review_required",
        taskId: row.task_id,
        attemptId: row.current_attempt_id,
        providerRequestId: row.provider_request_id,
        metadata: {
          failureCode: "provider_output_storage_failed",
          lastFailureCode: decision.lastFailureCode,
          recoveryReason: decision.reason,
        },
        now: input.now,
      });
    }
    await aggregateWorkflowStatus(db, row.workflow_id);
    await db.query("COMMIT");
    return "manual_review_required";
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function reopenManualReviewReservation(
  db: SqlDatabase,
  reservationId: string | null,
  now: Date,
) {
  if (!reservationId) return;
  await db.query(
    `
      UPDATE credit_reservations
      SET status = 'active',
          updated_at = $2
      WHERE id = $1
        AND status = 'manual_review_required'
        AND amount_reserved > 0
    `,
    [reservationId, now],
  );
}

function readRecord(value: Record<string, unknown> | string | null): Record<string, unknown> {
  if (typeof value !== "string") return value ?? {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
