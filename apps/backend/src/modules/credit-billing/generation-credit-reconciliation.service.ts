import type { SqlDatabase } from "../shared/db/sql.ts";
import { settleReservationAllocationInTransaction } from "./credit-ledger.service.ts";

const generationTaskTypes = ["episode_generate_image", "episode_generate_video", "episode_generate_audio"];
const terminalTaskStatuses = ["succeeded", "failed", "canceled"];
const reconciliationVersion = "generation_credit_reconciliation_v1";

export type GenerationCreditReconciliationAction = "consume" | "release" | "manual_review";

interface ProviderEvidence {
  id: string;
  status: string;
  externalStarted: boolean;
  externalRequestId: string | null;
  responsePresent: boolean;
  logStatus: string | null;
  logFailureCode: string | null;
  logResponseText: string | null;
}

interface CandidateRow {
  task_id: string;
  task_type: string;
  task_status: string;
  task_failure_code: string | null;
  current_attempt_id: string | null;
  attempt_status: string | null;
  attempt_failure_code: string | null;
  snapshot_status: string | null;
  snapshot_credit_status: string | null;
  result_asset_count: number | string;
  reservation_id: string;
  reservation_status: string;
  amount_total: number | string;
  amount_reserved: number | string;
  amount_consumed: number | string;
  amount_released: number | string;
  provider_id: string | null;
  provider_status: string | null;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
  response_present: boolean | null;
  log_status: string | null;
  log_failure_code: string | null;
  log_response_text: string | null;
}

export interface GenerationCreditReconciliationDecision {
  taskId: string;
  taskType: string;
  taskStatus: string;
  reservationId: string;
  reservationStatus: string;
  amount: number;
  action: GenerationCreditReconciliationAction;
  reason: string;
  providerRequestId: string | null;
  definitiveHttpStatuses: number[];
}

export interface GenerationCreditReconciliationReport {
  mode: "dry-run" | "apply";
  inspectedAt: string;
  decisions: GenerationCreditReconciliationDecision[];
  counts: Record<GenerationCreditReconciliationAction | "applied" | "skipped", number>;
}

export async function inspectGenerationCreditReconciliation(
  db: SqlDatabase,
  input: { taskIds?: string[]; limit?: number } = {},
): Promise<GenerationCreditReconciliationDecision[]> {
  const rows = await readCandidateRows(db, input);
  return groupCandidateRows(rows).map(classifyGenerationCreditCandidate);
}

export async function reconcileGenerationCredits(
  db: SqlDatabase,
  input: { apply?: boolean; now?: Date; taskIds?: string[]; limit?: number } = {},
): Promise<GenerationCreditReconciliationReport> {
  const now = input.now ?? new Date();
  const decisions = await inspectGenerationCreditReconciliation(db, input);
  let applied = 0;
  let skipped = 0;

  if (input.apply === true) {
    for (const planned of decisions) {
      if (planned.action === "manual_review") continue;
      const result = await applyDecision(db, planned, now);
      if (result === "applied") applied += 1;
      else skipped += 1;
    }
  }

  return {
    mode: input.apply === true ? "apply" : "dry-run",
    inspectedAt: now.toISOString(),
    decisions,
    counts: {
      consume: decisions.filter((item) => item.action === "consume").length,
      release: decisions.filter((item) => item.action === "release").length,
      manual_review: decisions.filter((item) => item.action === "manual_review").length,
      applied,
      skipped,
    },
  };
}

export function classifyGenerationCreditCandidate(input: {
  taskId: string;
  taskType: string;
  taskStatus: string;
  taskFailureCode: string | null;
  currentAttemptId: string | null;
  attemptStatus: string | null;
  attemptFailureCode: string | null;
  snapshotStatus: string | null;
  snapshotCreditStatus: string | null;
  resultAssetCount: number;
  reservationId: string;
  reservationStatus: string;
  amountTotal: number;
  amountReserved: number;
  amountConsumed: number;
  amountReleased: number;
  providers: ProviderEvidence[];
}): GenerationCreditReconciliationDecision {
  const base = {
    taskId: input.taskId,
    taskType: input.taskType,
    taskStatus: input.taskStatus,
    reservationId: input.reservationId,
    reservationStatus: input.reservationStatus,
    amount: input.amountReserved,
  };
  const manual = (reason: string): GenerationCreditReconciliationDecision => ({
    ...base,
    action: "manual_review",
    reason,
    providerRequestId: null,
    definitiveHttpStatuses: [],
  });

  if (!generationTaskTypes.includes(input.taskType) || !terminalTaskStatuses.includes(input.taskStatus)) {
    return manual("task_not_supported_terminal_generation");
  }
  if (
    input.amountReserved <= 0 ||
    input.amountTotal !== input.amountReserved + input.amountConsumed + input.amountReleased
  ) {
    return manual("reservation_amounts_inconsistent");
  }

  const succeededProviders = input.providers.filter((provider) =>
    provider.status === "succeeded" &&
    provider.externalStarted &&
    Boolean(provider.externalRequestId) &&
    provider.responsePresent
  );
  if (succeededProviders.length === 1) {
    const successful = succeededProviders[0]!;
    const otherExternalRequests = input.providers.filter((provider) =>
      provider.id !== successful.id && (provider.externalStarted || Boolean(provider.externalRequestId))
    );
    if (otherExternalRequests.length > 0) {
      return manual("multiple_external_provider_submissions");
    }
    return {
      ...base,
      action: "consume",
      reason: input.resultAssetCount > 0
        ? "provider_succeeded_and_asset_persisted"
        : "provider_succeeded_platform_output_unavailable",
      providerRequestId: successful.id,
      definitiveHttpStatuses: [],
    };
  }
  if (succeededProviders.length > 1) {
    return manual("multiple_successful_provider_requests");
  }
  if (input.providers.length === 0) {
    return manual("provider_evidence_missing");
  }
  if (input.resultAssetCount > 0 || input.snapshotStatus === "succeeded" || input.taskStatus === "succeeded") {
    return manual("local_success_without_provider_success_evidence");
  }

  const definitiveStatuses = input.providers.map(definitiveProviderHttpStatus);
  const everyProviderDefinitivelyRejected = definitiveStatuses.every((status) => status !== null) &&
    input.providers.every((provider) => !provider.externalRequestId && provider.logStatus === "failed");
  if (everyProviderDefinitivelyRejected) {
    return {
      ...base,
      action: "release",
      reason: "provider_definitively_rejected_submission",
      providerRequestId: input.providers.length === 1 ? input.providers[0]!.id : null,
      definitiveHttpStatuses: definitiveStatuses as number[],
    };
  }
  return manual("provider_submission_outcome_ambiguous");
}

function definitiveProviderHttpStatus(provider: ProviderEvidence): number | null {
  const text = `${provider.logFailureCode ?? ""} ${provider.logResponseText ?? ""}`;
  const matches = [...text.matchAll(/(?:^|[^0-9])([45][0-9]{2})(?=[:_\s)-]|$)/g)];
  for (const match of matches) {
    const status = Number(match[1]);
    if (status === 408 || status === 429) continue;
    if ((status >= 400 && status <= 407) || (status >= 410 && status <= 428) || status >= 430) {
      return status;
    }
  }
  return null;
}

async function applyDecision(
  db: SqlDatabase,
  planned: GenerationCreditReconciliationDecision,
  now: Date,
): Promise<"applied" | "skipped"> {
  await db.query("BEGIN");
  try {
    await db.query(
      `
        SELECT task.id
        FROM tasks task
        JOIN credit_reservations reservation ON reservation.task_id = task.id
        WHERE task.id = $1 AND reservation.id = $2
        FOR UPDATE OF task, reservation
      `,
      [planned.taskId, planned.reservationId],
    );
    await db.query("SELECT id FROM provider_requests WHERE task_id = $1 FOR UPDATE", [planned.taskId]);
    const current = (await inspectGenerationCreditReconciliation(db, { taskIds: [planned.taskId], limit: 1 }))[0];
    if (!current || !sameActionableDecision(planned, current)) {
      await db.query("ROLLBACK");
      return "skipped";
    }

    if (current.reservationStatus === "manual_review_required") {
      const reopened = await db.query<{ id: string }>(
        `
          UPDATE credit_reservations
          SET status = CASE WHEN amount_consumed > 0 OR amount_released > 0 THEN 'partially_settled' ELSE 'active' END,
              updated_at = $3
          WHERE id = $1
            AND amount_reserved = $2
            AND status = 'manual_review_required'
          RETURNING id
        `,
        [current.reservationId, current.amount, now],
      );
      if (!reopened.rows[0]) {
        await db.query("ROLLBACK");
        return "skipped";
      }
    }

    const outcome = current.action === "consume" ? "consumed" : "released";
    await settleReservationAllocationInTransaction(db, {
      reservationId: current.reservationId,
      allocationKey: `${reconciliationVersion}:${outcome}`,
      amount: current.amount,
      outcome,
      taskId: current.taskId,
      providerRequestId: current.providerRequestId,
      metadata: {
        reconciliationVersion,
        reason: current.reason,
        taskStatus: current.taskStatus,
        definitiveHttpStatuses: current.definitiveHttpStatuses,
      },
      now,
    });
    await db.query(
      `
        UPDATE ai_generation_task_snapshots
        SET credit_status = $2,
            credit_summary_json = credit_summary_json || jsonb_build_object(
              'historicalReconciliation', jsonb_build_object(
                'version', $3::text,
                'outcome', $2::text,
                'amount', $4::int,
                'settledAt', $5::timestamptz
              )
            ),
            updated_at = $5
        WHERE task_id = $1
      `,
      [current.taskId, outcome, reconciliationVersion, current.amount, now],
    );
    await db.query("COMMIT");
    return "applied";
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function sameActionableDecision(
  planned: GenerationCreditReconciliationDecision,
  current: GenerationCreditReconciliationDecision,
) {
  return planned.action === current.action &&
    current.action !== "manual_review" &&
    planned.taskId === current.taskId &&
    planned.reservationId === current.reservationId &&
    planned.amount === current.amount &&
    planned.providerRequestId === current.providerRequestId &&
    planned.reason === current.reason;
}

async function readCandidateRows(
  db: SqlDatabase,
  input: { taskIds?: string[]; limit?: number },
): Promise<CandidateRow[]> {
  const taskIds = input.taskIds?.filter(Boolean) ?? [];
  const limit = Math.max(1, Math.min(1000, input.limit ?? 100));
  const result = await db.query<CandidateRow>(
    `
      WITH candidates AS (
        SELECT task.id
        FROM tasks task
        JOIN credit_reservations reservation ON reservation.task_id = task.id
        WHERE task.task_type = ANY($1::text[])
          AND task.status = ANY($2::text[])
          AND reservation.status IN ('active', 'partially_settled', 'manual_review_required')
          AND reservation.amount_reserved > 0
          AND (cardinality($3::uuid[]) = 0 OR task.id = ANY($3::uuid[]))
        ORDER BY task.updated_at ASC, task.id ASC
        LIMIT $4
      )
      SELECT
        task.id AS task_id, task.task_type, task.status AS task_status,
        task.failure_code AS task_failure_code, task.current_attempt_id,
        attempt.status AS attempt_status, attempt.failure_code AS attempt_failure_code,
        snapshot.status AS snapshot_status, snapshot.credit_status AS snapshot_credit_status,
        jsonb_array_length(COALESCE(snapshot.result_assets_json, '[]'::jsonb)) AS result_asset_count,
        reservation.id AS reservation_id, reservation.status AS reservation_status,
        reservation.amount_total, reservation.amount_reserved,
        reservation.amount_consumed, reservation.amount_released,
        provider.id AS provider_id, provider.status AS provider_status,
        provider.external_submission_started_at, provider.external_request_id,
        provider.response_redacted_json IS NOT NULL AS response_present,
        request_log.status AS log_status, request_log.failure_code AS log_failure_code,
        request_log.response_text AS log_response_text
      FROM candidates candidate
      JOIN tasks task ON task.id = candidate.id
      LEFT JOIN task_attempts attempt ON attempt.id = task.current_attempt_id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      JOIN credit_reservations reservation ON reservation.task_id = task.id
      LEFT JOIN provider_requests provider ON provider.task_id = task.id
      LEFT JOIN LATERAL (
        SELECT log.status, log.failure_code, log.response_text
        FROM user_model_request_logs log
        WHERE log.provider_request_id = provider.id
        ORDER BY log.updated_at DESC, log.id DESC
        LIMIT 1
      ) request_log ON true
      ORDER BY task.updated_at ASC, task.id ASC, provider.created_at ASC, provider.id ASC
    `,
    [generationTaskTypes, terminalTaskStatuses, taskIds, limit],
  );
  return result.rows;
}

function groupCandidateRows(rows: CandidateRow[]) {
  const grouped = new Map<string, Parameters<typeof classifyGenerationCreditCandidate>[0]>();
  for (const row of rows) {
    let item = grouped.get(row.task_id);
    if (!item) {
      item = {
        taskId: row.task_id,
        taskType: row.task_type,
        taskStatus: row.task_status,
        taskFailureCode: row.task_failure_code,
        currentAttemptId: row.current_attempt_id,
        attemptStatus: row.attempt_status,
        attemptFailureCode: row.attempt_failure_code,
        snapshotStatus: row.snapshot_status,
        snapshotCreditStatus: row.snapshot_credit_status,
        resultAssetCount: Number(row.result_asset_count ?? 0),
        reservationId: row.reservation_id,
        reservationStatus: row.reservation_status,
        amountTotal: Number(row.amount_total),
        amountReserved: Number(row.amount_reserved),
        amountConsumed: Number(row.amount_consumed),
        amountReleased: Number(row.amount_released),
        providers: [],
      };
      grouped.set(row.task_id, item);
    }
    if (row.provider_id) {
      item.providers.push({
        id: row.provider_id,
        status: row.provider_status ?? "",
        externalStarted: Boolean(row.external_submission_started_at),
        externalRequestId: row.external_request_id,
        responsePresent: row.response_present === true,
        logStatus: row.log_status,
        logFailureCode: row.log_failure_code,
        logResponseText: row.log_response_text,
      });
    }
  }
  return [...grouped.values()];
}
