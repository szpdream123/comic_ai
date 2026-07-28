import type { SqlDatabase } from "../shared/db/sql.ts";
import { inspectCanvasAgentMetrics } from "../canvas-agent/canvas-agent-metrics.service.ts";

type CanvasRuntimeMetric = "save_attempt" | "save_conflict" | "sse_connect" | "sse_resume" | "frontend_error";

const runtimeStartedAt = new Date();
const runtimeCounters: Record<CanvasRuntimeMetric, number> = {
  save_attempt: 0,
  save_conflict: 0,
  sse_connect: 0,
  sse_resume: 0,
  frontend_error: 0,
};

export function recordCanvasCanaryRuntimeMetric(metric: CanvasRuntimeMetric) {
  runtimeCounters[metric] += 1;
}

export function resetCanvasCanaryRuntimeMetricsForTest() {
  for (const metric of Object.keys(runtimeCounters) as CanvasRuntimeMetric[]) runtimeCounters[metric] = 0;
}

export async function inspectCanvasCanaryMetrics(
  db: SqlDatabase,
  input: { now: Date; windowHours?: number },
) {
  const windowHours = boundedInteger(input.windowHours, 24, 1, 24 * 30);
  const since = new Date(input.now.getTime() - windowHours * 60 * 60 * 1_000);
  const [batchResult, recoveryResult, integrityResult, agentMetrics] = await Promise.all([
    db.query<{
      total_batches: number | string;
      succeeded_batches: number | string;
      partial_batches: number | string;
      failed_batches: number | string;
      active_batches: number | string;
    }>(`
      SELECT COUNT(*)::int AS total_batches,
        COUNT(*) FILTER (WHERE status='succeeded')::int AS succeeded_batches,
        COUNT(*) FILTER (WHERE status='partial')::int AS partial_batches,
        COUNT(*) FILTER (WHERE status='failed')::int AS failed_batches,
        COUNT(*) FILTER (WHERE status IN ('created','running','cancel_requested'))::int AS active_batches
      FROM creator_canvas_generation_batches
      WHERE created_at >= $1
    `, [since]),
    db.query<{ retried_tasks: number | string; recovered_tasks: number | string }>(`
      WITH canvas_attempts AS (
        SELECT task.id,task.status,COUNT(attempt.id)::int AS attempt_count
        FROM tasks task
        JOIN task_attempts attempt ON attempt.task_id=task.id
        WHERE task.canvas_project_id IS NOT NULL AND task.created_at >= $1
        GROUP BY task.id,task.status
      )
      SELECT COUNT(*) FILTER (WHERE attempt_count > 1)::int AS retried_tasks,
        COUNT(*) FILTER (WHERE attempt_count > 1 AND status='succeeded')::int AS recovered_tasks
      FROM canvas_attempts
    `, [since]),
    db.query<{
      duplicate_provider_keys: number | string;
      unsettled_reservations: number | string;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM (
          SELECT request_key FROM provider_requests
          WHERE canvas_project_id IS NOT NULL AND created_at >= $1
          GROUP BY request_key HAVING COUNT(*) > 1
        ) duplicate_keys) AS duplicate_provider_keys,
        (SELECT COUNT(*)::int FROM credit_reservations
          WHERE source_type='canvas_generation_batch'
            AND status IN ('active','partially_settled','manual_review_required')
            AND created_at < $2) AS unsettled_reservations
    `, [since, new Date(input.now.getTime() - 5 * 60_000)]),
    inspectCanvasAgentMetrics(db, { now: input.now, windowHours, failureLimit: 1 }),
  ]);
  const batch = batchResult.rows[0] ?? {};
  const recovery = recoveryResult.rows[0] ?? {};
  const integrity = integrityResult.rows[0] ?? {};
  const totalBatches = numberValue(batch.total_batches);
  const succeededBatches = numberValue(batch.succeeded_batches);
  const retriedTasks = numberValue(recovery.retried_tasks);
  const recoveredTasks = numberValue(recovery.recovered_tasks);
  return {
    generatedAt: input.now.toISOString(),
    since: since.toISOString(),
    windowHours,
    runtime: {
      instanceStartedAt: runtimeStartedAt.toISOString(),
      saveAttempts: runtimeCounters.save_attempt,
      saveConflicts: runtimeCounters.save_conflict,
      saveConflictRate: runtimeCounters.save_attempt ? runtimeCounters.save_conflict / runtimeCounters.save_attempt : 0,
      sseConnections: runtimeCounters.sse_connect,
      sseResumes: runtimeCounters.sse_resume,
      sseResumeRate: runtimeCounters.sse_connect ? runtimeCounters.sse_resume / runtimeCounters.sse_connect : 0,
      frontendErrors: runtimeCounters.frontend_error,
    },
    batches: {
      total: totalBatches,
      succeeded: succeededBatches,
      partial: numberValue(batch.partial_batches),
      failed: numberValue(batch.failed_batches),
      active: numberValue(batch.active_batches),
      successRate: totalBatches ? succeededBatches / totalBatches : 0,
    },
    recovery: {
      retriedTasks,
      recoveredTasks,
      recoveryRate: retriedTasks ? recoveredTasks / retriedTasks : 0,
    },
    integrity: {
      duplicateProviderRequestKeys: numberValue(integrity.duplicate_provider_keys),
      unsettledReservations: numberValue(integrity.unsettled_reservations),
    },
    agent: {
      policyDenyCount: agentMetrics.summary.policyDenyCount,
      uncertainTasks: agentMetrics.summary.uncertainTasks,
    },
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
