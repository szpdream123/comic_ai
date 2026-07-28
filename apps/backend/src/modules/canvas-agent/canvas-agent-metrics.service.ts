import type { SqlDatabase } from "../shared/db/sql.ts";

interface CanvasAgentMetricsRow {
  total_tasks: number | string;
  queued_tasks: number | string;
  running_tasks: number | string;
  waiting_approval_tasks: number | string;
  waiting_external_tasks: number | string;
  succeeded_tasks: number | string;
  failed_tasks: number | string;
  uncertain_tasks: number | string;
  model_round_count: number | string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  total_tokens: number | string;
  model_duration_ms: number | string;
  tool_call_count: number | string;
  tool_duration_ms: number | string;
  policy_deny_count: number | string;
  approval_request_count: number | string;
  interjection_count: number | string;
  pending_approvals: number | string;
}

export async function inspectCanvasAgentMetrics(
  db: SqlDatabase,
  input: { now: Date; windowHours?: number; failureLimit?: number },
) {
  const windowHours = boundedInteger(input.windowHours, 24, 1, 24 * 30);
  const failureLimit = boundedInteger(input.failureLimit, 20, 1, 100);
  const since = new Date(input.now.getTime() - windowHours * 60 * 60 * 1_000);
  const [summaryResult, modesResult, modelsResult, failuresResult] = await Promise.all([
    db.query<CanvasAgentMetricsRow>(`
      SELECT
        COUNT(*)::int AS total_tasks,
        COUNT(*) FILTER (WHERE status='queued')::int AS queued_tasks,
        COUNT(*) FILTER (WHERE status='running')::int AS running_tasks,
        COUNT(*) FILTER (WHERE status='waiting_approval')::int AS waiting_approval_tasks,
        COUNT(*) FILTER (WHERE status='waiting_external')::int AS waiting_external_tasks,
        COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded_tasks,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed_tasks,
        COUNT(*) FILTER (WHERE status IN ('result_unknown','manual_review_required'))::int AS uncertain_tasks,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'modelRoundCount','') ~ '^[0-9]+$' THEN (metrics_json->>'modelRoundCount')::bigint ELSE 0 END),0)::bigint AS model_round_count,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'promptTokens','') ~ '^[0-9]+$' THEN (metrics_json->>'promptTokens')::bigint ELSE 0 END),0)::bigint AS prompt_tokens,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'completionTokens','') ~ '^[0-9]+$' THEN (metrics_json->>'completionTokens')::bigint ELSE 0 END),0)::bigint AS completion_tokens,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'totalTokens','') ~ '^[0-9]+$' THEN (metrics_json->>'totalTokens')::bigint ELSE 0 END),0)::bigint AS total_tokens,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'modelDurationMs','') ~ '^[0-9]+$' THEN (metrics_json->>'modelDurationMs')::bigint ELSE 0 END),0)::bigint AS model_duration_ms,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'toolCallCount','') ~ '^[0-9]+$' THEN (metrics_json->>'toolCallCount')::bigint ELSE 0 END),0)::bigint AS tool_call_count,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'toolDurationMs','') ~ '^[0-9]+$' THEN (metrics_json->>'toolDurationMs')::bigint ELSE 0 END),0)::bigint AS tool_duration_ms,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'policyDenyCount','') ~ '^[0-9]+$' THEN (metrics_json->>'policyDenyCount')::bigint ELSE 0 END),0)::bigint AS policy_deny_count,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'approvalRequestCount','') ~ '^[0-9]+$' THEN (metrics_json->>'approvalRequestCount')::bigint ELSE 0 END),0)::bigint AS approval_request_count,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'interjectionCount','') ~ '^[0-9]+$' THEN (metrics_json->>'interjectionCount')::bigint ELSE 0 END),0)::bigint AS interjection_count,
        (SELECT COUNT(*)::int FROM canvas_agent_approvals approval
          JOIN canvas_agent_tasks approval_task ON approval_task.id=approval.task_id
          WHERE approval.status='pending' AND approval_task.created_at >= $1) AS pending_approvals
      FROM canvas_agent_tasks
      WHERE created_at >= $1
    `, [since]),
    db.query<{ mode: string; task_count: number | string }>(`
      SELECT mode,COUNT(*)::int AS task_count
      FROM canvas_agent_tasks
      WHERE created_at >= $1
      GROUP BY mode
      ORDER BY task_count DESC,mode ASC
    `, [since]),
    db.query<{
      model_code: string;
      task_count: number | string;
      succeeded_count: number | string;
      failed_count: number | string;
      total_tokens: number | string;
    }>(`
      SELECT model_code,COUNT(*)::int AS task_count,
        COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded_count,
        COUNT(*) FILTER (WHERE status IN ('failed','result_unknown','manual_review_required'))::int AS failed_count,
        COALESCE(SUM(CASE WHEN COALESCE(metrics_json->>'totalTokens','') ~ '^[0-9]+$' THEN (metrics_json->>'totalTokens')::bigint ELSE 0 END),0)::bigint AS total_tokens
      FROM canvas_agent_tasks
      WHERE created_at >= $1
      GROUP BY model_code
      ORDER BY task_count DESC,model_code ASC
      LIMIT 50
    `, [since]),
    db.query<{
      id: string;
      canvas_id: string;
      mode: string;
      status: string;
      model_code: string;
      failure_code: string | null;
      metrics_json: Record<string, unknown> | string;
      updated_at: Date | string;
    }>(`
      SELECT id,canvas_id,mode,status,model_code,failure_code,metrics_json,updated_at
      FROM canvas_agent_tasks
      WHERE created_at >= $1 AND status IN ('failed','result_unknown','manual_review_required')
      ORDER BY updated_at DESC,id DESC
      LIMIT $2
    `, [since, failureLimit]),
  ]);
  const summary = summaryResult.rows[0] ?? emptySummaryRow();
  const totalTasks = numberValue(summary.total_tasks);
  const succeededTasks = numberValue(summary.succeeded_tasks);
  return {
    generatedAt: input.now.toISOString(),
    windowHours,
    since: since.toISOString(),
    summary: {
      totalTasks,
      queuedTasks: numberValue(summary.queued_tasks),
      runningTasks: numberValue(summary.running_tasks),
      waitingApprovalTasks: numberValue(summary.waiting_approval_tasks),
      waitingExternalTasks: numberValue(summary.waiting_external_tasks),
      succeededTasks,
      failedTasks: numberValue(summary.failed_tasks),
      uncertainTasks: numberValue(summary.uncertain_tasks),
      successRate: totalTasks ? succeededTasks / totalTasks : 0,
      modelRoundCount: numberValue(summary.model_round_count),
      promptTokens: numberValue(summary.prompt_tokens),
      completionTokens: numberValue(summary.completion_tokens),
      totalTokens: numberValue(summary.total_tokens),
      modelDurationMs: numberValue(summary.model_duration_ms),
      toolCallCount: numberValue(summary.tool_call_count),
      toolDurationMs: numberValue(summary.tool_duration_ms),
      policyDenyCount: numberValue(summary.policy_deny_count),
      approvalRequestCount: numberValue(summary.approval_request_count),
      interjectionCount: numberValue(summary.interjection_count),
      pendingApprovals: numberValue(summary.pending_approvals),
    },
    modes: modesResult.rows.map((row) => ({ mode: row.mode, taskCount: numberValue(row.task_count) })),
    models: modelsResult.rows.map((row) => ({
      modelCode: row.model_code,
      taskCount: numberValue(row.task_count),
      succeededCount: numberValue(row.succeeded_count),
      failedCount: numberValue(row.failed_count),
      totalTokens: numberValue(row.total_tokens),
    })),
    recentFailures: failuresResult.rows.map((row) => ({
      taskId: row.id,
      canvasId: row.canvas_id,
      mode: row.mode,
      status: row.status,
      modelCode: row.model_code,
      failureCode: row.failure_code,
      metrics: readRecord(row.metrics_json),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
  };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { return readRecord(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function emptySummaryRow(): CanvasAgentMetricsRow {
  return {
    total_tasks: 0, queued_tasks: 0, running_tasks: 0, waiting_approval_tasks: 0,
    waiting_external_tasks: 0, succeeded_tasks: 0, failed_tasks: 0, uncertain_tasks: 0,
    model_round_count: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
    model_duration_ms: 0, tool_call_count: 0, tool_duration_ms: 0, policy_deny_count: 0,
    approval_request_count: 0, interjection_count: 0, pending_approvals: 0,
  };
}
