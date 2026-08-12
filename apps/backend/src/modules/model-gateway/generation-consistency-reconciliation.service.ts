import type { SqlDatabase } from "../shared/db/sql.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";

const terminalTaskStatuses = [
  "succeeded",
  "failed",
  "canceled",
  "result_unknown",
  "manual_review_required",
] as const;

export async function reconcileGenerationSurfaceConsistency(
  db: SqlDatabase,
  input: { now: Date; limit?: number },
) {
  const limit = Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)));
  const providerRequestIds = await reconcileProviderRequestTerminalStates(db, input.now, limit);
  const ambiguousTaskIds = await reconcileAmbiguousLocalTerminalStates(db, input.now, limit);
  const snapshotTaskIds = await reconcileGenerationTaskSnapshots(db, input.now, limit);
  const canvasRunIds = await reconcileCanvasNodeRuns(db, input.now, limit);
  const agentTaskIds = await reconcileCanvasAgentTasks(db, input.now, limit);
  const agentStepIds = await reconcileCanvasAgentSteps(db, input.now, limit);
  const workflowIds = await reconcileWorkflowStatuses(db, limit);
  return {
    providerRequestIds,
    ambiguousTaskIds,
    snapshotTaskIds,
    canvasRunIds,
    agentTaskIds,
    agentStepIds,
    workflowIds,
  };
}

async function reconcileAmbiguousLocalTerminalStates(db: SqlDatabase, now: Date, limit: number) {
  const result = await db.query<{ id: string; workflow_id: string; next_status: "result_unknown" | "manual_review_required" }>(`
    WITH candidates AS (
      SELECT task.id, task.workflow_id,
             CASE
               WHEN request.status = 'manual_review_required' THEN 'manual_review_required'
               ELSE 'result_unknown'
             END AS next_status
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      WHERE request.external_submission_started_at IS NOT NULL
        AND request.status IN ('submitted','accepted','running','result_unknown','manual_review_required')
        AND task.status IN ('failed','canceled')
        AND COALESCE(task.failure_code, '') NOT LIKE 'provider_output_%'
        AND COALESCE(task.failure_code, '') NOT IN ('task_timeout','provider_poll_timeout','generation_queue_lease_expired')
        AND NOT (
          COALESCE(request.response_redacted_json->'diagnostics'->>'httpStatus', request.response_redacted_json->>'httpStatus', '') ~ '^[45][0-9]{2}$'
          AND COALESCE(request.response_redacted_json->'diagnostics'->>'httpStatus', request.response_redacted_json->>'httpStatus') NOT IN ('408','429')
        )
        AND NOT (
          COALESCE(request.response_redacted_json->'diagnostics'->>'httpStatus', request.response_redacted_json->>'httpStatus', '') ~ '^2[0-9]{2}$'
          AND task.failure_code IN ('provider_failed','provider_submission_failed','cumob_image_failed','global_ai_opc_image_failed')
        )
      ORDER BY task.updated_at ASC, task.id ASC
      LIMIT $1
      FOR UPDATE OF task SKIP LOCKED
    )
    UPDATE tasks task
    SET status = candidates.next_status,
        failure_code = 'provider_result_unknown',
        locked_by = NULL,
        locked_until = NULL,
        heartbeat_at = NULL,
        updated_at = $2
    FROM candidates
    WHERE task.id = candidates.id
    RETURNING task.id, task.workflow_id, candidates.next_status
  `, [limit, now]);
  for (const row of result.rows) {
    await db.query(
      `UPDATE task_attempts
       SET status = $2,
           failure_code = 'provider_result_unknown',
           locked_by = NULL, locked_until = NULL, heartbeat_at = NULL,
           finished_at = COALESCE(finished_at, $3), updated_at = $3
       WHERE task_id = $1 AND status IN ('created','running','failed','canceled','result_unknown')`,
      [row.id, row.next_status, now],
    );
    await aggregateWorkflowStatus(db, row.workflow_id);
  }
  return result.rows.map((row) => row.id);
}

async function reconcileProviderRequestTerminalStates(db: SqlDatabase, now: Date, limit: number) {
  const result = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT request.id, task.status AS task_status, task.failure_code
      FROM provider_requests request
      JOIN tasks task ON task.id = request.task_id
      WHERE (
        task.status = 'succeeded'
        AND request.status NOT IN ('succeeded','failed','canceled')
      ) OR (
        COALESCE(request.external_request_id, '') = ''
        AND request.external_submission_started_at IS NULL
        AND task.status IN ('failed','canceled')
        AND request.status NOT IN ('succeeded','failed','canceled')
      )
      ORDER BY request.updated_at ASC, request.id ASC
      LIMIT $1
      FOR UPDATE OF request SKIP LOCKED
    )
    UPDATE provider_requests request
    SET status = CASE
          WHEN candidates.task_status = 'succeeded' THEN 'succeeded'
          ELSE candidates.task_status
        END,
        failure_code = CASE
          WHEN candidates.task_status = 'succeeded' THEN NULL
          ELSE COALESCE(request.failure_code, candidates.failure_code, candidates.task_status)
        END,
        updated_at = $2
    FROM candidates
    WHERE request.id = candidates.id
    RETURNING request.id
  `, [limit, now]);
  return result.rows.map((row) => row.id);
}

async function reconcileGenerationTaskSnapshots(db: SqlDatabase, now: Date, limit: number) {
  const result = await db.query<{ task_id: string }>(`
    WITH candidates AS (
      SELECT snapshot.task_id, task.status AS task_status, task.failure_code, task.updated_at AS task_updated_at
      FROM ai_generation_task_snapshots snapshot
      JOIN tasks task ON task.id = snapshot.task_id
      WHERE task.status = ANY($1::text[])
        AND snapshot.status IS DISTINCT FROM task.status
      ORDER BY task.updated_at ASC, snapshot.task_id ASC
      LIMIT $2
      FOR UPDATE OF snapshot SKIP LOCKED
    )
    UPDATE ai_generation_task_snapshots snapshot
    SET status = candidates.task_status,
        progress_stage = CASE WHEN candidates.task_status = 'succeeded' THEN 'completed' ELSE candidates.task_status END,
        progress_percent = 100,
        failure_json = CASE
          WHEN candidates.task_status = 'succeeded' THEN NULL
          ELSE COALESCE(
            NULLIF(snapshot.failure_json, '{}'::jsonb),
            jsonb_build_object(
              'failureCode', COALESCE(candidates.failure_code, candidates.task_status),
              'displayMessage', '生成任务已结束。'
            )
          )
        END,
        completed_at = CASE
          WHEN candidates.task_status = 'succeeded' THEN COALESCE(snapshot.completed_at, candidates.task_updated_at)
          ELSE snapshot.completed_at
        END,
        failed_at = CASE
          WHEN candidates.task_status <> 'succeeded' THEN COALESCE(snapshot.failed_at, candidates.task_updated_at)
          ELSE snapshot.failed_at
        END,
        updated_at = GREATEST(snapshot.updated_at, candidates.task_updated_at, $3::timestamptz)
    FROM candidates
    WHERE snapshot.task_id = candidates.task_id
    RETURNING snapshot.task_id
  `, [terminalTaskStatuses, limit, now]);
  return result.rows.map((row) => row.task_id);
}

async function reconcileCanvasNodeRuns(db: SqlDatabase, now: Date, limit: number) {
  const result = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT run.id, task.status AS task_status, task.failure_code, snapshot.result_assets_json
      FROM creator_canvas_node_runs run
      JOIN tasks task ON task.id = run.task_id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE run.status IN ('created','queued','running')
        AND task.status = ANY($1::text[])
      ORDER BY run.updated_at ASC, run.id ASC
      LIMIT $2
      FOR UPDATE OF run SKIP LOCKED
    )
    UPDATE creator_canvas_node_runs run
    SET status = candidates.task_status,
        output_snapshot_json = CASE
          WHEN candidates.task_status = 'succeeded'
            AND run.output_snapshot_json = '{}'::jsonb
            AND candidates.result_assets_json IS NOT NULL
          THEN jsonb_build_object('resultAssets', candidates.result_assets_json)
          ELSE run.output_snapshot_json
        END,
        failure_json = CASE
          WHEN candidates.task_status = 'succeeded' THEN run.failure_json
          ELSE COALESCE(
            run.failure_json,
            jsonb_build_object('failureCode', COALESCE(candidates.failure_code, candidates.task_status))
          )
        END,
        completed_at = COALESCE(run.completed_at, $3),
        updated_at = $3
    FROM candidates
    WHERE run.id = candidates.id
    RETURNING run.id
  `, [terminalTaskStatuses, limit, now]);
  return result.rows.map((row) => row.id);
}

async function reconcileCanvasAgentTasks(db: SqlDatabase, now: Date, limit: number) {
  const result = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT agent.id, task.status AS task_status, task.failure_code
      FROM canvas_agent_tasks agent
      JOIN tasks task ON task.id = agent.workflow_task_id
      WHERE agent.status IN ('queued','running','waiting_approval','waiting_external','paused','cancel_requested')
        AND task.status = ANY($1::text[])
      ORDER BY agent.updated_at ASC, agent.id ASC
      LIMIT $2
      FOR UPDATE OF agent SKIP LOCKED
    )
    UPDATE canvas_agent_tasks agent
    SET status = candidates.task_status,
        failure_code = CASE
          WHEN candidates.task_status = 'succeeded' THEN agent.failure_code
          ELSE COALESCE(agent.failure_code, candidates.failure_code, candidates.task_status)
        END,
        lease_owner = NULL,
        lease_expires_at = NULL,
        heartbeat_at = NULL,
        completed_at = COALESCE(agent.completed_at, $3),
        updated_at = $3
    FROM candidates
    WHERE agent.id = candidates.id
    RETURNING agent.id
  `, [terminalTaskStatuses, limit, now]);
  return result.rows.map((row) => row.id);
}

async function reconcileCanvasAgentSteps(db: SqlDatabase, now: Date, limit: number) {
  const generationResult = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT step.id, task.status AS task_status, task.failure_code
      FROM canvas_agent_steps step
      JOIN tasks task ON task.id = step.generation_task_id
      WHERE step.status IN ('created','running','waiting_approval','waiting_external')
        AND task.status = ANY($1::text[])
      ORDER BY step.updated_at ASC, step.id ASC
      LIMIT $2
      FOR UPDATE OF step SKIP LOCKED
    )
    UPDATE canvas_agent_steps step
    SET status = candidates.task_status,
        error_code = CASE
          WHEN candidates.task_status = 'succeeded' THEN step.error_code
          ELSE COALESCE(step.error_code, candidates.failure_code, candidates.task_status)
        END,
        completed_at = COALESCE(step.completed_at, $3),
        updated_at = $3
    FROM candidates
    WHERE step.id = candidates.id
    RETURNING step.id
  `, [terminalTaskStatuses, limit, now]);

  const parentResult = await db.query<{ id: string }>(`
    WITH candidates AS (
      SELECT step.id, agent.status AS agent_status, agent.failure_code
      FROM canvas_agent_steps step
      JOIN canvas_agent_tasks agent ON agent.id = step.task_id
      WHERE step.status IN ('created','running','waiting_approval','waiting_external')
        AND agent.status IN ('failed','canceled','result_unknown','manual_review_required')
      ORDER BY step.updated_at ASC, step.id ASC
      LIMIT $1
      FOR UPDATE OF step SKIP LOCKED
    )
    UPDATE canvas_agent_steps step
    SET status = candidates.agent_status,
        error_code = COALESCE(step.error_code, candidates.failure_code, candidates.agent_status),
        completed_at = COALESCE(step.completed_at, $2),
        updated_at = $2
    FROM candidates
    WHERE step.id = candidates.id
    RETURNING step.id
  `, [limit, now]);
  return Array.from(new Set([
    ...generationResult.rows.map((row) => row.id),
    ...parentResult.rows.map((row) => row.id),
  ]));
}

async function reconcileWorkflowStatuses(db: SqlDatabase, limit: number) {
  const candidates = await db.query<{ id: string }>(`
    WITH aggregated AS (
      SELECT workflow.id,
        CASE
          WHEN bool_or(task.status = 'manual_review_required') THEN 'manual_review_required'
          WHEN bool_or(task.status = 'result_unknown') THEN 'result_unknown'
          WHEN bool_or(task.status IN ('running','cancel_requested')) THEN 'running'
          WHEN bool_and(task.status = 'queued') THEN 'queued'
          WHEN bool_and(task.status = 'succeeded') THEN 'succeeded'
          WHEN bool_and(task.status = 'failed') THEN 'failed'
          WHEN bool_and(task.status = 'canceled') THEN 'canceled'
          ELSE 'partial_succeeded'
        END AS expected_status
      FROM workflows workflow
      JOIN tasks task ON task.workflow_id = workflow.id
      GROUP BY workflow.id
    )
    SELECT workflow.id
    FROM workflows workflow
    JOIN aggregated ON aggregated.id = workflow.id
    WHERE workflow.status IS DISTINCT FROM aggregated.expected_status
    ORDER BY workflow.updated_at ASC, workflow.id ASC
    LIMIT $1
  `, [limit]);
  for (const row of candidates.rows) {
    await aggregateWorkflowStatus(db, row.id);
  }
  return candidates.rows.map((row) => row.id);
}
