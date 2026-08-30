import type { SqlDatabase } from "../shared/db/sql.ts";
import { countMissingGenerationStageSuccessors } from "./generation-stage-successor.store.ts";
import { inspectTaskCenterRuntimeMetrics } from "./task-center-observability.ts";

export async function inspectGenerationPlatformMetrics(
  db: SqlDatabase,
  input: { now: Date; successorStaleMs?: number; outboxStaleMs?: number },
) {
  const outboxStaleMs = input.outboxStaleMs ?? 120_000;
  const outboxStaleBefore = new Date(input.now.getTime() - outboxStaleMs);
  const [outbox, polls, webhooks, tasks, latency, stageLatency, missingSuccessors] = await Promise.all([
    db.query<{
      pending_count: number | string;
      ready_count: number | string;
      processing_count: number | string;
      stale_processing_count: number | string;
      oldest_available_at: Date | string | null;
      oldest_ready_at: Date | string | null;
    }>(`
      SELECT
        count(*) FILTER (WHERE status IN ('pending', 'failed')) AS pending_count,
        count(*) FILTER (
          WHERE status IN ('pending', 'failed') AND available_at <= $1
        ) AS ready_count,
        count(*) FILTER (WHERE status = 'processing') AS processing_count,
        count(*) FILTER (
          WHERE status = 'processing' AND updated_at <= $2
        ) AS stale_processing_count,
        min(available_at) FILTER (WHERE status IN ('pending', 'failed')) AS oldest_available_at,
        min(available_at) FILTER (
          WHERE status IN ('pending', 'failed') AND available_at <= $1
        ) AS oldest_ready_at
      FROM outbox_events
      WHERE event_type LIKE 'generation.task.%'
    `, [input.now, outboxStaleBefore]),
    db.query<{ due_count: number | string; overdue_deadline_count: number | string }>(`
      SELECT
        count(*) FILTER (WHERE next_poll_at IS NOT NULL AND next_poll_at <= $1) AS due_count,
        count(*) FILTER (WHERE poll_deadline_at IS NOT NULL AND poll_deadline_at <= $1
          AND status IN ('submitted', 'accepted', 'running', 'result_unknown')) AS overdue_deadline_count
      FROM provider_requests
    `, [input.now]),
    db.query<{ pending_count: number | string; unmatched_count: number | string; oldest_received_at: Date | string | null }>(`
      SELECT
        count(*) FILTER (WHERE status IN ('received', 'failed')) AS pending_count,
        count(*) FILTER (WHERE status = 'unmatched') AS unmatched_count,
        min(received_at) FILTER (WHERE status IN ('received', 'failed')) AS oldest_received_at
      FROM provider_webhook_inbox
    `),
    db.query<{ active_count: number | string; result_unknown_count: number | string }>(`
      SELECT
        count(*) FILTER (WHERE status IN ('queued', 'running')) AS active_count,
        count(*) FILTER (WHERE status = 'result_unknown') AS result_unknown_count
      FROM tasks
      WHERE task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
    `),
    db.query<{ p95_ms: number | string | null; p99_ms: number | string | null; sample_count: number | string }>(`
      SELECT
        percentile_cont(0.95) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (request.external_submission_started_at - task.created_at)) * 1000
        ) AS p95_ms,
        percentile_cont(0.99) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (request.external_submission_started_at - task.created_at)) * 1000
        ) AS p99_ms,
        count(*) AS sample_count
      FROM provider_requests request
      JOIN tasks task ON task.id = request.task_id
      WHERE request.external_submission_started_at IS NOT NULL
        AND task.created_at >= $1::timestamptz - interval '24 hours'
    `, [input.now]),
    db.query<{
      result_fetch_p95_ms: number | string | null;
      result_fetch_p99_ms: number | string | null;
      result_fetch_count: number | string;
      fetch_persist_p95_ms: number | string | null;
      fetch_persist_p99_ms: number | string | null;
      fetch_persist_count: number | string;
    }>(`
      WITH handoffs AS (
        SELECT snapshot.task_id,
          CASE
            WHEN snapshot.provider_status_json#>>'{artifactHandoff,fetchedAt}'
              ~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}'
            THEN (snapshot.provider_status_json#>>'{artifactHandoff,fetchedAt}')::timestamptz
            ELSE NULL
          END AS fetched_at
        FROM ai_generation_task_snapshots snapshot
        WHERE snapshot.updated_at >= $1::timestamptz - interval '24 hours'
      ),
      result_fetch AS (
        SELECT EXTRACT(EPOCH FROM (handoff.fetched_at - request.updated_at)) * 1000 AS duration_ms
        FROM handoffs handoff
        JOIN LATERAL (
          SELECT provider_request.updated_at
          FROM provider_requests provider_request
          WHERE provider_request.task_id = handoff.task_id
            AND provider_request.status = 'succeeded'
          ORDER BY provider_request.updated_at DESC
          LIMIT 1
        ) request ON true
        WHERE handoff.fetched_at IS NOT NULL
          AND handoff.fetched_at >= request.updated_at
      ),
      fetch_persist AS (
        SELECT EXTRACT(EPOCH FROM (version.created_at - handoff.fetched_at)) * 1000 AS duration_ms
        FROM handoffs handoff
        JOIN asset_versions version ON version.source_task_id = handoff.task_id
        WHERE handoff.fetched_at IS NOT NULL
          AND version.created_at >= handoff.fetched_at
      )
      SELECT
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM result_fetch) AS result_fetch_p95_ms,
        (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) FROM result_fetch) AS result_fetch_p99_ms,
        (SELECT count(*) FROM result_fetch) AS result_fetch_count,
        (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM fetch_persist) AS fetch_persist_p95_ms,
        (SELECT percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) FROM fetch_persist) AS fetch_persist_p99_ms,
        (SELECT count(*) FROM fetch_persist) AS fetch_persist_count
    `, [input.now]),
    countMissingGenerationStageSuccessors(db, {
      staleBefore: new Date(input.now.getTime() - (input.successorStaleMs ?? 120_000)),
    }),
  ]);
  const outboxRow = outbox.rows[0];
  const pollRow = polls.rows[0];
  const webhookRow = webhooks.rows[0];
  const taskRow = tasks.rows[0];
  const latencyRow = latency.rows[0];
  const stageLatencyRow = stageLatency.rows[0];
  const oldestReadyAgeMs = ageMs(outboxRow?.oldest_ready_at, input.now);
  const readyCount = Number(outboxRow?.ready_count ?? 0);
  const staleProcessingCount = Number(outboxRow?.stale_processing_count ?? 0);
  const outboxIssues = [
    readyCount > 0 && oldestReadyAgeMs != null && oldestReadyAgeMs >= outboxStaleMs
      ? `outbox_ready_stale:${readyCount}`
      : null,
    staleProcessingCount > 0
      ? `outbox_processing_stale:${staleProcessingCount}`
      : null,
  ].filter((issue): issue is string => Boolean(issue));
  return {
    status: outboxIssues.length ? "degraded" : "healthy",
    issues: outboxIssues,
    collectedAt: input.now.toISOString(),
    outbox: {
      pendingCount: Number(outboxRow?.pending_count ?? 0),
      oldestAgeMs: ageMs(outboxRow?.oldest_available_at, input.now),
      readyCount,
      processingCount: Number(outboxRow?.processing_count ?? 0),
      staleProcessingCount,
      oldestReadyAgeMs,
      staleAfterMs: outboxStaleMs,
      status: outboxIssues.length ? "degraded" : "healthy",
      issues: outboxIssues,
    },
    polls: {
      dueCount: Number(pollRow?.due_count ?? 0),
      overdueDeadlineCount: Number(pollRow?.overdue_deadline_count ?? 0),
    },
    webhooks: {
      pendingCount: Number(webhookRow?.pending_count ?? 0),
      unmatchedCount: Number(webhookRow?.unmatched_count ?? 0),
      oldestLagMs: ageMs(webhookRow?.oldest_received_at, input.now),
    },
    tasks: {
      activeCount: Number(taskRow?.active_count ?? 0),
      resultUnknownCount: Number(taskRow?.result_unknown_count ?? 0),
      missingSuccessorCount: missingSuccessors,
    },
    commitToProviderStart: {
      p95Ms: nullableNumber(latencyRow?.p95_ms),
      p99Ms: nullableNumber(latencyRow?.p99_ms),
      sampleCount: Number(latencyRow?.sample_count ?? 0),
    },
    providerResultToFetch: {
      p95Ms: nullableNumber(stageLatencyRow?.result_fetch_p95_ms),
      p99Ms: nullableNumber(stageLatencyRow?.result_fetch_p99_ms),
      sampleCount: Number(stageLatencyRow?.result_fetch_count ?? 0),
    },
    fetchToPersist: {
      p95Ms: nullableNumber(stageLatencyRow?.fetch_persist_p95_ms),
      p99Ms: nullableNumber(stageLatencyRow?.fetch_persist_p99_ms),
      sampleCount: Number(stageLatencyRow?.fetch_persist_count ?? 0),
    },
    taskCenter: inspectTaskCenterRuntimeMetrics(input.now),
  };
}

function ageMs(value: Date | string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : null;
}

function nullableNumber(value: number | string | null | undefined) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
