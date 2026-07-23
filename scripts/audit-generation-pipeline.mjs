import { pathToFileURL } from "node:url";

import pg from "pg";

const { Pool } = pg;
const generationTaskTypes = ["episode_generate_image", "episode_generate_video", "episode_generate_audio"];

export async function auditGenerationPipeline(db, now = new Date()) {
  const taskTypeParams = [generationTaskTypes];
  const nowParams = [now];
  const checks = await Promise.all([
    runCheck(db, "active_duplicate_outbox_events", `
      WITH grouped_events AS (
        SELECT payload_json->>'taskId' AS task_id,
               event_type,
               coalesce(payload_json->>'finalizeMode', '') AS stage,
               count(*)::int AS occurrences,
               count(*) FILTER (WHERE status IN ('pending', 'processing', 'failed'))::int AS active_occurrences,
               count(*) FILTER (WHERE status = 'processed')::int AS historical_occurrences
        FROM outbox_events
        WHERE event_type IN (
          'generation.task.created',
          'generation.task.poll_requested',
          'generation.task.finalize_requested'
        )
          AND payload_json->>'taskId' IS NOT NULL
        GROUP BY payload_json->>'taskId', event_type, coalesce(payload_json->>'finalizeMode', '')
      )
      SELECT *
      FROM grouped_events
      WHERE occurrences > 1
        AND active_occurrences > 0
      ORDER BY active_occurrences DESC, occurrences DESC
    `, [], { severity: "actionable" }),
    runCheck(db, "historical_duplicate_outbox_events", `
      WITH grouped_events AS (
        SELECT payload_json->>'taskId' AS task_id,
               event_type,
               coalesce(payload_json->>'finalizeMode', '') AS stage,
               count(*)::int AS occurrences,
               count(*) FILTER (WHERE status IN ('pending', 'processing', 'failed'))::int AS active_occurrences,
               count(*) FILTER (WHERE status = 'processed')::int AS historical_occurrences
        FROM outbox_events
        WHERE event_type IN (
          'generation.task.created',
          'generation.task.poll_requested',
          'generation.task.finalize_requested'
        )
          AND payload_json->>'taskId' IS NOT NULL
        GROUP BY payload_json->>'taskId', event_type, coalesce(payload_json->>'finalizeMode', '')
      )
      SELECT *
      FROM grouped_events
      WHERE occurrences > 1
        AND active_occurrences = 0
      ORDER BY occurrences DESC
    `, [], { severity: "info" }),
    runCheck(db, "undispatched_queued_tasks", `
      SELECT task.id AS task_id,
             task.task_type,
             task.status,
             task.created_at,
             task.last_dispatched_at
      FROM tasks task
      WHERE task.task_type = ANY($1::text[])
        AND task.status = 'queued'
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events event
          WHERE event.payload_json->>'taskId' = task.id::text
            AND event.event_type = 'generation.task.created'
            AND event.status IN ('pending', 'processing', 'failed')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM provider_requests request
          WHERE request.task_id = task.id
            AND request.external_submission_started_at IS NOT NULL
        )
      ORDER BY task.created_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "active_generation_tasks_without_successor", `
      SELECT task.id AS task_id,
             task.task_type,
             task.status,
             task.updated_at,
             task.locked_until
      FROM tasks task
      WHERE task.task_type = ANY($1::text[])
        AND task.status IN ('queued', 'running', 'result_unknown')
        AND task.updated_at < $2::timestamptz - interval '2 minutes'
        AND (task.locked_until IS NULL OR task.locked_until <= $2)
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events event
          WHERE event.payload_json->>'taskId' = task.id::text
            AND event.event_type LIKE 'generation.task.%'
            AND event.status IN ('pending', 'processing', 'failed')
        )
        AND NOT EXISTS (
          SELECT 1
          FROM provider_requests request
          WHERE request.task_id = task.id
            AND request.next_poll_at IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM generation_queue_stage_assignments assignment
          WHERE assignment.task_id = task.id
            AND assignment.status = 'admitted'
        )
      ORDER BY task.updated_at ASC
    `, [generationTaskTypes, now], { severity: "actionable" }),
    runCheck(db, "stale_processing_idempotency", `
      SELECT record.id,
             record.operation_name,
             record.response_resource_id AS task_id,
             record.updated_at
      FROM idempotency_records record
      WHERE record.status = 'processing'
        AND record.updated_at < $1::timestamptz - interval '24 hours'
        AND (
          record.response_resource_type = 'generation_task'
          OR record.operation_name ILIKE '%generate%'
        )
      ORDER BY record.updated_at ASC
    `, nowParams, { severity: "actionable" }),
    runCheck(db, "terminal_tasks_with_unsettled_credits", `
      SELECT task.id AS task_id,
             task.status AS task_status,
             reservation.id AS reservation_id,
             reservation.status AS reservation_status,
             reservation.amount_reserved
      FROM tasks task
      JOIN credit_reservations reservation ON reservation.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND task.status IN ('succeeded', 'failed', 'canceled')
        AND reservation.status IN ('active', 'partially_settled', 'manual_review_required')
        AND reservation.amount_reserved > 0
      ORDER BY task.updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "ambiguous_provider_submission_terminal", `
      SELECT task.id AS task_id,
             task.status AS task_status,
             task.failure_code AS task_failure_code,
             request.id AS provider_request_id,
             request.status AS provider_status,
             request.external_request_id,
             coalesce(
               request.response_redacted_json->'diagnostics'->>'httpStatus',
               request.response_redacted_json->>'httpStatus'
             ) AS provider_http_status,
             snapshot.status AS snapshot_status,
             snapshot.failure_json->>'failureCode' AS snapshot_failure_code,
             'ambiguous_provider_submission_terminal' AS classification
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND request.external_submission_started_at IS NOT NULL
        AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        AND task.status IN ('failed', 'canceled')
        AND task.failure_code NOT LIKE 'provider_output_%'
        AND task.failure_code NOT IN ('task_timeout', 'provider_poll_timeout', 'generation_queue_lease_expired')
        AND NOT (
          (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^[45][0-9]{2}$'
            AND coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus'
            ) NOT IN ('408', '429')
          )
          OR (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^2[0-9]{2}$'
            AND task.failure_code IN (
              'provider_failed',
              'provider_submission_failed',
              'cumob_image_failed',
              'global_ai_opc_image_failed'
            )
          )
        )
      ORDER BY request.updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "external_submission_terminal_timeout", `
      SELECT task.id AS task_id,
             task.status AS task_status,
             task.failure_code AS task_failure_code,
             request.id AS provider_request_id,
             request.status AS provider_status,
             request.external_request_id,
             coalesce(
               request.response_redacted_json->'diagnostics'->>'httpStatus',
               request.response_redacted_json->>'httpStatus'
             ) AS provider_http_status,
             snapshot.status AS snapshot_status,
             snapshot.failure_json->>'failureCode' AS snapshot_failure_code,
             'external_submission_terminal_timeout' AS classification
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND request.external_submission_started_at IS NOT NULL
        AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        AND task.status IN ('failed', 'canceled')
        AND task.failure_code IN ('task_timeout', 'provider_poll_timeout', 'generation_queue_lease_expired')
        AND NOT (
          (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^[45][0-9]{2}$'
            AND coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus'
            ) NOT IN ('408', '429')
          )
          OR (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^2[0-9]{2}$'
            AND task.failure_code IN (
              'provider_failed',
              'provider_submission_failed',
              'cumob_image_failed',
              'global_ai_opc_image_failed'
            )
          )
        )
      ORDER BY request.updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "artifact_transfer_failure_provider_state_stale", `
      SELECT task.id AS task_id,
             task.status AS task_status,
             task.failure_code AS task_failure_code,
             request.id AS provider_request_id,
             request.status AS provider_status,
             request.external_request_id,
             coalesce(
               request.response_redacted_json->'diagnostics'->>'httpStatus',
               request.response_redacted_json->>'httpStatus'
             ) AS provider_http_status,
             snapshot.status AS snapshot_status,
             snapshot.failure_json->>'failureCode' AS snapshot_failure_code,
             'artifact_transfer_failure_provider_state_stale' AS classification
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND request.external_submission_started_at IS NOT NULL
        AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        AND task.status IN ('failed', 'canceled')
        AND task.failure_code LIKE 'provider_output_%'
        AND NOT (
          (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^[45][0-9]{2}$'
            AND coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus'
            ) NOT IN ('408', '429')
          )
          OR (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^2[0-9]{2}$'
            AND task.failure_code IN (
              'provider_failed',
              'provider_submission_failed',
              'cumob_image_failed',
              'global_ai_opc_image_failed'
            )
          )
        )
      ORDER BY request.updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "provider_terminal_failures_with_stale_request_state", `
      SELECT task.id AS task_id,
             task.task_type,
             task.failure_code AS task_failure_code,
             request.id AS provider_request_id,
             request.status AS provider_status,
             coalesce(
               request.response_redacted_json->'diagnostics'->>'httpStatus',
               request.response_redacted_json->>'httpStatus'
             ) AS provider_http_status,
             snapshot.status AS snapshot_status,
             snapshot.failure_json->>'failureCode' AS snapshot_failure_code,
             'definitive_http_response_terminal' AS classification
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND request.external_submission_started_at IS NOT NULL
        AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        AND task.status = 'failed'
        AND (
          (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^[45][0-9]{2}$'
            AND coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus'
            ) NOT IN ('408', '429')
          )
          OR (
            coalesce(
              request.response_redacted_json->'diagnostics'->>'httpStatus',
              request.response_redacted_json->>'httpStatus',
              ''
            ) ~ '^2[0-9]{2}$'
            AND task.failure_code IN (
              'provider_failed',
              'provider_submission_failed',
              'cumob_image_failed',
              'global_ai_opc_image_failed'
            )
          )
        )
      ORDER BY request.updated_at ASC
    `, taskTypeParams, { severity: "info" }),
    runCheck(db, "provider_success_without_persisted_asset", `
      WITH provider_success AS (
        SELECT task.id AS task_id,
               task.task_type,
               task.status AS task_status,
               task.failure_code AS task_failure_code,
               snapshot.status AS snapshot_status,
               snapshot.progress_stage,
               request.id AS provider_request_id,
               request.updated_at AS provider_updated_at,
               coalesce(
                 nullif(request.response_redacted_json#>>'{artifact,url}', ''),
                 nullif(request.response_redacted_json#>>'{artifact,b64Json}', ''),
                 nullif(request.response_redacted_json->>'videoUrl', '')
               ) IS NOT NULL AS has_provider_artifact_source,
               EXISTS (
                 SELECT 1 FROM asset_versions version WHERE version.source_task_id = task.id
               ) AS has_asset_version,
               EXISTS (
                 SELECT 1 FROM storage_objects object
                 WHERE object.metadata_json->>'taskId' = task.id::text
                   AND object.status = 'available'
               ) AS has_available_storage
        FROM tasks task
        JOIN provider_requests request ON request.task_id = task.id
        LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        WHERE task.task_type = ANY($1::text[])
          AND request.status = 'succeeded'
          AND (snapshot.id IS NULL OR snapshot.status <> 'succeeded')
      )
      SELECT *,
             CASE
               WHEN has_provider_artifact_source THEN 'retry_artifact_transfer_from_provider_source'
               ELSE 'provider_success_without_recovery_source'
             END AS classification
      FROM provider_success
      WHERE NOT has_asset_version
        AND NOT has_available_storage
      ORDER BY provider_updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "provider_success_recoverable_from_persisted_evidence", `
      WITH provider_success AS (
        SELECT task.id AS task_id,
               task.task_type,
               task.status AS task_status,
               task.failure_code AS task_failure_code,
               snapshot.status AS snapshot_status,
               snapshot.progress_stage,
               request.id AS provider_request_id,
               request.updated_at AS provider_updated_at,
               coalesce(
                 nullif(request.response_redacted_json#>>'{artifact,url}', ''),
                 nullif(request.response_redacted_json#>>'{artifact,b64Json}', ''),
                 nullif(request.response_redacted_json->>'videoUrl', '')
               ) IS NOT NULL AS has_provider_artifact_source,
               EXISTS (
                 SELECT 1 FROM asset_versions version WHERE version.source_task_id = task.id
               ) AS has_asset_version,
               EXISTS (
                 SELECT 1 FROM storage_objects object
                 WHERE object.metadata_json->>'taskId' = task.id::text
                   AND object.status = 'available'
               ) AS has_available_storage
        FROM tasks task
        JOIN provider_requests request ON request.task_id = task.id
        LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
        WHERE task.task_type = ANY($1::text[])
          AND request.status = 'succeeded'
          AND task.status <> 'succeeded'
          AND (snapshot.id IS NULL OR snapshot.status <> 'succeeded')
      )
      SELECT *, 'recover_from_persisted_evidence' AS classification
      FROM provider_success
      WHERE has_asset_version OR has_available_storage
      ORDER BY provider_updated_at ASC
    `, taskTypeParams, { severity: "actionable" }),
    runCheck(db, "historical_provider_success_missing_snapshot", `
      SELECT task.id AS task_id,
             task.task_type,
             task.status AS task_status,
             request.id AS provider_request_id,
             request.updated_at AS provider_updated_at,
             EXISTS (
               SELECT 1 FROM asset_versions version WHERE version.source_task_id = task.id
             ) AS has_asset_version,
             EXISTS (
               SELECT 1 FROM storage_objects object
               WHERE object.metadata_json->>'taskId' = task.id::text
                 AND object.status = 'available'
             ) AS has_available_storage,
             EXISTS (
               SELECT 1
               FROM project_upload_records upload
               JOIN storage_objects object ON object.id = upload.storage_object_id
               WHERE object.metadata_json->>'taskId' = task.id::text
                 AND upload.status = 'uploaded'
             ) AS has_upload_record,
             'legacy_missing_snapshot_with_persisted_evidence' AS classification
      FROM tasks task
      JOIN provider_requests request ON request.task_id = task.id
      LEFT JOIN ai_generation_task_snapshots snapshot ON snapshot.task_id = task.id
      WHERE task.task_type = ANY($1::text[])
        AND request.status = 'succeeded'
        AND task.status = 'succeeded'
        AND snapshot.id IS NULL
        AND (
          EXISTS (SELECT 1 FROM asset_versions version WHERE version.source_task_id = task.id)
          OR EXISTS (
            SELECT 1 FROM storage_objects object
            WHERE object.metadata_json->>'taskId' = task.id::text
              AND object.status = 'available'
          )
        )
      ORDER BY request.updated_at ASC
    `, taskTypeParams, { severity: "info" }),
  ]);

  const totalActionableFindings = sumCheckCounts(checks, "actionable");
  const totalInformationalFindings = sumCheckCounts(checks, "info");
  return {
    mode: "dry-run",
    inspectedAt: now.toISOString(),
    taskTypes: generationTaskTypes,
    checks,
    totalFindings: totalActionableFindings + totalInformationalFindings,
    totalActionableFindings,
    totalInformationalFindings,
  };
}

async function runCheck(db, name, sql, params = [], options = {}) {
  const result = await db.query(`
    SELECT audit_row.*,
           count(*) OVER()::int AS audit_total_count,
           sum(coalesce((to_jsonb(audit_row)->>'occurrences')::int, 1)) OVER()::int AS audit_occurrence_count
    FROM (${sql}) audit_row
    LIMIT 50
  `, params);
  return {
    name,
    severity: options.severity ?? "actionable",
    count: Number(result.rows[0]?.audit_total_count ?? 0),
    occurrenceCount: Number(result.rows[0]?.audit_occurrence_count ?? 0),
    samples: result.rows.map(({
      audit_total_count: _auditTotalCount,
      audit_occurrence_count: _auditOccurrenceCount,
      ...row
    }) => row),
  };
}

function sumCheckCounts(checks, severity) {
  return checks
    .filter((check) => check.severity === severity)
    .reduce((total, check) => total + check.count, 0);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const report = await auditGenerationPipeline(pool);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.totalActionableFindings > 0 && process.argv.includes("--fail-on-findings")) {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`generation pipeline audit failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
