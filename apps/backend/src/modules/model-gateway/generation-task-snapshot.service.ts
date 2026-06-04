import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export async function upsertQueuedGenerationTaskSnapshot(
  db: SqlDatabase,
  input: {
    organizationId: string;
    workspaceId: string | null;
    projectId: string | null;
    episodeId: string | null;
    targetType: string;
    targetId: string;
    workflowId: string;
    taskId: string;
    modelConfigId: string | null;
    creditReservationId: string | null;
    modelCode: string;
    mediaType: "image" | "video" | "audio" | "text" | "multimodal";
    taskMode: string;
    estimatedCredits: number;
    requestSummary: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO ai_generation_task_snapshots (
        id,
        organization_id,
        workspace_id,
        project_id,
        episode_id,
        target_type,
        target_id,
        workflow_id,
        task_id,
        model_config_id,
        credit_reservation_id,
        model_code,
        media_type,
        task_mode,
        status,
        progress_stage,
        request_summary_json,
        estimated_credits,
        credit_status,
        credit_summary_json,
        submitted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        'queued', 'queued', $15::jsonb, $16, 'reserved', $17::jsonb, $18, $18, $18
      )
      ON CONFLICT (organization_id, task_id)
      DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        project_id = EXCLUDED.project_id,
        episode_id = EXCLUDED.episode_id,
        target_type = EXCLUDED.target_type,
        target_id = EXCLUDED.target_id,
        workflow_id = EXCLUDED.workflow_id,
        model_config_id = EXCLUDED.model_config_id,
        credit_reservation_id = EXCLUDED.credit_reservation_id,
        model_code = EXCLUDED.model_code,
        media_type = EXCLUDED.media_type,
        task_mode = EXCLUDED.task_mode,
        status = 'queued',
        progress_stage = 'queued',
        request_summary_json = EXCLUDED.request_summary_json,
        estimated_credits = EXCLUDED.estimated_credits,
        credit_status = 'reserved',
        credit_summary_json = EXCLUDED.credit_summary_json,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      randomUUID(),
      input.organizationId,
      input.workspaceId,
      input.projectId,
      input.episodeId,
      input.targetType,
      input.targetId,
      input.workflowId,
      input.taskId,
      input.modelConfigId,
      input.creditReservationId,
      input.modelCode,
      input.mediaType,
      input.taskMode,
      JSON.stringify(input.requestSummary),
      input.estimatedCredits,
      JSON.stringify(input.creditSummary ?? {}),
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotSucceeded(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    resultAssets: Array<Record<string, unknown>>;
    providerStatus?: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'succeeded',
          progress_stage = 'completed',
          progress_percent = 100,
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($4::jsonb, provider_status_json),
          result_assets_json = $5::jsonb,
          failure_json = NULL,
          credit_status = 'consumed',
          credit_summary_json = COALESCE($6::jsonb, credit_summary_json),
          completed_at = $7,
          updated_at = $7
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.providerStatus ? JSON.stringify(input.providerStatus) : null,
      JSON.stringify(input.resultAssets),
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotRunning(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    progressStage?: string;
    progressPercent?: number | null;
    providerStatus?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'running',
          progress_stage = $4,
          progress_percent = $5,
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($6::jsonb, provider_status_json),
          started_at = COALESCE(started_at, $7),
          last_polled_at = $7,
          updated_at = $7
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.progressStage ?? "running",
      input.progressPercent ?? null,
      input.providerStatus ? JSON.stringify(input.providerStatus) : null,
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotResultUnknown(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    failure: Record<string, unknown>;
    providerStatus?: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'result_unknown',
          progress_stage = 'result_unknown',
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($4::jsonb, provider_status_json),
          failure_json = $5::jsonb,
          credit_status = 'manual_review_required',
          credit_summary_json = COALESCE($6::jsonb, credit_summary_json),
          failed_at = $7,
          updated_at = $7
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.providerStatus ? JSON.stringify(input.providerStatus) : null,
      JSON.stringify(withDefaultNoticeType(input.failure, "manual_review")),
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotManualReviewRequired(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    progressStage?: string;
    failure: Record<string, unknown>;
    providerStatus?: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'manual_review_required',
          progress_stage = $4,
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($5::jsonb, provider_status_json),
          failure_json = $6::jsonb,
          credit_status = 'manual_review_required',
          credit_summary_json = COALESCE($7::jsonb, credit_summary_json),
          failed_at = $8,
          updated_at = $8
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.progressStage ?? "manual_review_required",
      input.providerStatus ? JSON.stringify(input.providerStatus) : null,
      JSON.stringify(withDefaultNoticeType(input.failure, "manual_review")),
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotFailed(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    failure: Record<string, unknown>;
    providerStatus?: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    creditStatus?: "released" | "manual_review_required" | "reserved";
    now: Date;
  },
) {
  const creditStatus = input.creditStatus ?? "released";
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'failed',
          progress_stage = 'failed',
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($4::jsonb, provider_status_json),
          failure_json = $5::jsonb,
          credit_status = $6,
          credit_summary_json = COALESCE($7::jsonb, credit_summary_json),
          failed_at = $8,
          updated_at = $8
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.providerStatus ? JSON.stringify(input.providerStatus) : null,
      JSON.stringify(withDefaultNoticeType(input.failure, noticeTypeForFailure(input.failure))),
      creditStatus,
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
}

function withDefaultNoticeType(
  failure: Record<string, unknown>,
  noticeType: string,
): Record<string, unknown> {
  if (typeof failure.noticeType === "string" && failure.noticeType.trim()) {
    return failure;
  }
  return { ...failure, noticeType };
}

function noticeTypeForFailure(failure: Record<string, unknown>) {
  const failureCode = typeof failure.failureCode === "string" ? failure.failureCode : "";
  if (
    failureCode === "provider_api_key_env_required" ||
    failureCode === "provider_api_key_missing" ||
    failureCode === "provider_adapter_missing" ||
    failureCode === "provider_circuit_open"
  ) {
    return "admin_action_required";
  }
  if (
    failureCode === "insufficient_credits" ||
    failureCode.startsWith("model_")
  ) {
    return "warning";
  }
  return "error";
}
