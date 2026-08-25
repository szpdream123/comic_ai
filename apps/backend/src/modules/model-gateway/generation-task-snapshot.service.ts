import { randomUUID } from "node:crypto";

import { attachCanvasTaskResultToHistory } from "../project/creator-canvas-record.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { translateProviderErrorMessageField } from "./provider-error-message.ts";
import { compactProviderAuditValue } from "./provider-response-diagnostics.ts";
import { buildTaskCenterProviderDiagnostics } from "./task-center-provider-diagnostics.ts";

export async function upsertQueuedGenerationTaskSnapshot(
  db: SqlDatabase,
  input: {
    projectId: string | null;
    canvasProjectId?: string | null;
    episodeId: string | null;
    targetType: string;
    targetId: string;
    workflowId: string;
    taskId: string;
    modelConfigId: string | null;
    providerConfigRevisionId?: string | null;
    credentialVersionRef?: string | null;
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
        user_id,
        project_id,
        canvas_project_id,
        episode_id,
        target_type,
        target_id,
        workflow_id,
        task_id,
        model_config_id,
        provider_config_revision_id,
        credential_version_ref,
        credit_reservation_id,
        model_code,
        media_type,
        task_mode,
        status,
        progress_stage,
        progress_percent,
        request_summary_json,
        estimated_credits,
        credit_status,
        credit_summary_json,
        submitted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        COALESCE(
          (SELECT owner_user_id FROM projects WHERE id = $2),
          (SELECT created_by_user_id FROM workflows WHERE id = $7)
        ),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15,
        'queued', 'task_created', 10, $16::jsonb, $17, 'reserved', $18::jsonb, $19, $19, $19
      )
      ON CONFLICT (task_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        project_id = EXCLUDED.project_id,
        canvas_project_id = EXCLUDED.canvas_project_id,
        episode_id = EXCLUDED.episode_id,
        target_type = EXCLUDED.target_type,
        target_id = EXCLUDED.target_id,
        workflow_id = EXCLUDED.workflow_id,
        model_config_id = EXCLUDED.model_config_id,
        provider_config_revision_id = EXCLUDED.provider_config_revision_id,
        credential_version_ref = EXCLUDED.credential_version_ref,
        credit_reservation_id = EXCLUDED.credit_reservation_id,
        model_code = EXCLUDED.model_code,
        media_type = EXCLUDED.media_type,
        task_mode = EXCLUDED.task_mode,
        status = 'queued',
        progress_stage = 'task_created',
        progress_percent = 10,
        request_summary_json = EXCLUDED.request_summary_json,
        estimated_credits = EXCLUDED.estimated_credits,
        credit_status = 'reserved',
        credit_summary_json = EXCLUDED.credit_summary_json,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = EXCLUDED.updated_at
    `,
    [
      randomUUID(),
      input.projectId,
      input.canvasProjectId ?? null,
      input.episodeId,
      input.targetType,
      input.targetId,
      input.workflowId,
      input.taskId,
      input.modelConfigId,
      input.providerConfigRevisionId ?? null,
      input.credentialVersionRef ?? null,
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

export async function markGenerationTaskSnapshotQueued(
  db: SqlDatabase,
  input: {
    taskId: string;
    progressStage: string;
    progressPercent: number;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'queued',
          progress_stage = $2,
          progress_percent = $3,
          updated_at = $4
      WHERE task_id = $1
    `,
    [
      input.taskId,
      input.progressStage,
      input.progressPercent,
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
  const snapshot = await queryOne<{
    canvas_project_id: string | null;
    target_type: string;
    target_id: string;
    media_type: string;
    user_id: string;
    request_summary_json: Record<string, unknown> | string | null;
  }>(db,
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'succeeded',
          progress_stage = 'completed',
          progress_percent = 100,
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($4::jsonb, provider_status_json),
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          result_assets_json = $6::jsonb,
          failure_json = NULL,
          credit_status = 'consumed',
          credit_summary_json = COALESCE($7::jsonb, credit_summary_json),
          completed_at = $8,
          updated_at = $8
      WHERE task_id = $1
        AND EXISTS (
          SELECT 1 FROM tasks task
          WHERE task.id = $1
            AND task.status = 'succeeded'
            AND (
              ($2::uuid IS NOT NULL AND task.current_attempt_id = $2::uuid)
              OR ($2::uuid IS NULL AND task.current_attempt_id IS NULL AND task.attempt_count = 0)
            )
        )
      RETURNING canvas_project_id, target_type, target_id, media_type, user_id, request_summary_json
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
      JSON.stringify(input.resultAssets),
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
  if (snapshot?.canvas_project_id && snapshot.target_type === "canvas") {
    const nodeKey = snapshotCanvasNodeKey(snapshot.request_summary_json)
      ?? (await queryOne<{ node_key: string }>(
        db,
        `
          SELECT node_key
          FROM creator_canvas_node_runs
          WHERE canvas_project_id = $1
            AND task_id = $2
          ORDER BY run_no DESC
          LIMIT 1
        `,
        [snapshot.canvas_project_id, input.taskId],
      ))?.node_key;
    if (!nodeKey) return;
    await attachCanvasTaskResultToHistory(db, {
      canvasProjectId: snapshot.canvas_project_id,
      nodeKey,
      taskId: input.taskId,
      mediaKind: snapshot.media_type,
      result: input.resultAssets[0] ?? {},
      userId: snapshot.user_id,
      now: input.now,
    });
  }
}

function snapshotCanvasNodeKey(value: Record<string, unknown> | string | null) {
  const summary = typeof value === "string"
    ? (() => {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : {};
      } catch {
        return {};
      }
    })()
    : value ?? {};
  const nodeKey = String(summary.canvasNodeId ?? summary.nodeKey ?? "").trim();
  return nodeKey || null;
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
          task_center_diagnostics_json = COALESCE($7::jsonb, task_center_diagnostics_json),
          started_at = COALESCE(started_at, $8),
          last_polled_at = $8,
          updated_at = $8
      WHERE task_id = $1
        AND status IN ('queued', 'running', 'result_unknown', 'manual_review_required')
        AND (
          ($2::uuid IS NULL AND EXISTS (
            SELECT 1 FROM tasks task
            WHERE task.id = $1
              AND task.current_attempt_id IS NULL
              AND task.attempt_count = 0
              AND task.status IN ('running', 'result_unknown')
          ))
          OR EXISTS (
            SELECT 1
            FROM tasks task
            JOIN task_attempts attempt
              ON attempt.id = $2::uuid
             AND attempt.task_id = task.id
            WHERE task.id = $1
              AND task.current_attempt_id = $2::uuid
              AND task.status IN ('running', 'result_unknown')
              AND attempt.status IN ('running', 'result_unknown')
          )
        )
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.progressStage ?? "running",
      input.progressPercent ?? null,
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
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
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          failure_json = $6::jsonb,
          credit_status = 'manual_review_required',
          credit_summary_json = COALESCE($7::jsonb, credit_summary_json),
          failed_at = $8,
          updated_at = $8
      WHERE task_id = $1
        AND EXISTS (
          SELECT 1 FROM tasks task
          WHERE task.id = $1
            AND task.status = 'result_unknown'
            AND (
              ($2::uuid IS NOT NULL AND task.current_attempt_id = $2::uuid)
              OR ($2::uuid IS NULL AND task.current_attempt_id IS NULL AND task.attempt_count = 0)
            )
        )
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
      JSON.stringify(sanitizeGenerationSnapshotRecord(withDefaultNoticeType(input.failure, "manual_review"))),
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
          task_center_diagnostics_json = COALESCE($6::jsonb, task_center_diagnostics_json),
          failure_json = $7::jsonb,
          credit_status = 'manual_review_required',
          credit_summary_json = COALESCE($8::jsonb, credit_summary_json),
          failed_at = $9,
          updated_at = $9
      WHERE task_id = $1
        AND EXISTS (
          SELECT 1 FROM tasks task
          WHERE task.id = $1
            AND task.status = 'manual_review_required'
            AND (
              ($2::uuid IS NOT NULL AND task.current_attempt_id = $2::uuid)
              OR ($2::uuid IS NULL AND task.current_attempt_id IS NULL AND task.attempt_count = 0)
            )
        )
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      input.progressStage ?? "manual_review_required",
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
      JSON.stringify(sanitizeGenerationSnapshotRecord(withDefaultNoticeType(input.failure, "manual_review"))),
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
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          failure_json = $6::jsonb,
          credit_status = $7,
          credit_summary_json = COALESCE($8::jsonb, credit_summary_json),
          failed_at = $9,
          updated_at = $9
      WHERE task_id = $1
          AND EXISTS (
          SELECT 1 FROM tasks task
          WHERE task.id = $1
            AND task.status IN ('queued', 'running', 'failed')
            AND (
              ($2::uuid IS NOT NULL AND task.current_attempt_id = $2::uuid)
              OR ($2::uuid IS NULL AND task.current_attempt_id IS NULL AND task.attempt_count = 0)
            )
        )
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
      JSON.stringify(sanitizeGenerationSnapshotRecord(withDefaultNoticeType(input.failure, noticeTypeForFailure(input.failure)))),
      creditStatus,
      input.creditSummary ? JSON.stringify(input.creditSummary) : null,
      input.now,
    ],
  );
}

export async function markGenerationTaskSnapshotCanceled(
  db: SqlDatabase,
  input: {
    taskId: string;
    attemptId?: string | null;
    providerRequestId?: string | null;
    providerStatus?: Record<string, unknown>;
    creditSummary?: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE ai_generation_task_snapshots
      SET status = 'canceled',
          progress_stage = 'canceled',
          progress_percent = 100,
          attempt_id = COALESCE($2, attempt_id),
          provider_request_id = COALESCE($3, provider_request_id),
          provider_status_json = COALESCE($4::jsonb, provider_status_json),
          task_center_diagnostics_json = COALESCE($5::jsonb, task_center_diagnostics_json),
          failure_json = $6::jsonb,
          credit_status = 'released',
          credit_summary_json = COALESCE($7::jsonb, credit_summary_json),
          failed_at = $8,
          updated_at = $8
      WHERE task_id = $1
        AND EXISTS (
          SELECT 1 FROM tasks task
          WHERE task.id = $1
            AND task.status = 'canceled'
            AND (
              ($2::uuid IS NOT NULL AND task.current_attempt_id = $2::uuid)
              OR ($2::uuid IS NULL AND task.current_attempt_id IS NULL AND task.attempt_count = 0)
            )
        )
    `,
    [
      input.taskId,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      serializeGenerationProviderStatus(input.providerStatus),
      serializeGenerationTaskCenterProviderDiagnostics(input.providerStatus),
      JSON.stringify({
        failureCode: "user_canceled",
        displayMessage: "生成任务已取消，未消耗的预留积分已释放。",
        noticeType: "warning",
      }),
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

function sanitizeGenerationSnapshotRecord(value: Record<string, unknown>): Record<string, unknown> {
  return sanitizeGenerationSnapshotValue(value) as Record<string, unknown>;
}

export function serializeGenerationProviderStatus(value: Record<string, unknown> | undefined): string | null {
  return value
    ? JSON.stringify(sanitizeGenerationSnapshotRecord(
        compactProviderAuditValue(value) as Record<string, unknown>,
      ))
    : null;
}

export function serializeGenerationTaskCenterProviderDiagnostics(
  value: Record<string, unknown> | undefined,
): string | null {
  const diagnostics = value
    ? buildTaskCenterProviderDiagnostics(sanitizeGenerationSnapshotRecord(value))
    : null;
  return diagnostics ? JSON.stringify(diagnostics) : null;
}

function sanitizeGenerationSnapshotValue(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGenerationSnapshotValue(item, parentKey));
  }
  if (typeof value === "string") {
    return parentKey === "model"
      ? value
      : translateProviderErrorMessageField(parentKey, sanitizeProviderIdentityString(value));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "providerName" && key !== "provider" && key !== "providerLabel")
      .map(([key, entryValue]) => [key, sanitizeGenerationSnapshotValue(entryValue, key)]),
  );
}

function sanitizeProviderIdentityString(value: string): string {
  return value
    .replace(/\b(OpenAI|Volcengine|Lingdong|Aliyun|DashScope|DeepSeek|Qwen)\b/gi, "[provider]")
    .replace(/\bExtra\s+Token\b/gi, "[provider]");
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
