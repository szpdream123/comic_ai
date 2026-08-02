ALTER TABLE provider_requests
  ADD COLUMN IF NOT EXISTS task_center_diagnostics_json jsonb,
  ADD COLUMN IF NOT EXISTS task_center_diagnostics_backfilled_at timestamptz;

ALTER TABLE ai_generation_task_snapshots
  ADD COLUMN IF NOT EXISTS task_center_diagnostics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_center_diagnostics_backfilled_at timestamptz;

CREATE OR REPLACE FUNCTION task_center_truncate_utf8(value text, maximum_bytes integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  truncated text := left(value, GREATEST(maximum_bytes, 0));
BEGIN
  WHILE octet_length(truncated) > maximum_bytes LOOP
    truncated := left(
      truncated,
      GREATEST(
        0,
        char_length(truncated) - GREATEST(1, CEIL((octet_length(truncated) - maximum_bytes) / 4.0)::integer)
      )
    );
  END LOOP;
  RETURN truncated;
END
$$;

CREATE OR REPLACE FUNCTION task_center_nested_provider_diagnostics_summary(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN value IS NULL OR jsonb_typeof(value) <> 'object' THEN NULL::jsonb
    ELSE jsonb_strip_nulls(jsonb_build_object(
      'httpStatus', value->'httpStatus',
      'status', value->'status',
      'statusCode', value->'statusCode',
      'requestId', to_jsonb(task_center_truncate_utf8(value->>'requestId', 128)),
      'request_id', to_jsonb(task_center_truncate_utf8(value->>'request_id', 128)),
      'providerErrorCode', to_jsonb(task_center_truncate_utf8(value->>'providerErrorCode', 128)),
      'errorCode', to_jsonb(task_center_truncate_utf8(value->>'errorCode', 128)),
      'code', to_jsonb(task_center_truncate_utf8(value->>'code', 128)),
      'failureCode', to_jsonb(task_center_truncate_utf8(value->>'failureCode', 128)),
      'providerMessage', to_jsonb(task_center_truncate_utf8(value->>'providerMessage', 256)),
      'errorMessage', to_jsonb(task_center_truncate_utf8(value->>'errorMessage', 256)),
      'message', to_jsonb(task_center_truncate_utf8(value->>'message', 256)),
      'reason', to_jsonb(task_center_truncate_utf8(value->>'reason', 256)),
      'displayMessage', to_jsonb(task_center_truncate_utf8(value->>'displayMessage', 256)),
      'details', to_jsonb(task_center_truncate_utf8(value->>'details', 256)),
      'providerRawResponse', to_jsonb(task_center_truncate_utf8(value->>'providerRawResponse', 512)),
      'responseBodyPreview', to_jsonb(task_center_truncate_utf8(value->>'responseBodyPreview', 1024)),
      'responseBody', to_jsonb(task_center_truncate_utf8(value->>'responseBody', 512)),
      'body', to_jsonb(task_center_truncate_utf8(value->>'body', 512)),
      'statusText', to_jsonb(task_center_truncate_utf8(value->>'statusText', 128)),
      'contentType', to_jsonb(task_center_truncate_utf8(value->>'contentType', 128))
    ))
  END
$$;

CREATE OR REPLACE FUNCTION task_center_provider_diagnostics_summary(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH summary AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'diagnostics', task_center_nested_provider_diagnostics_summary(value->'diagnostics'),
      'providerDiagnostics', task_center_nested_provider_diagnostics_summary(value->'providerDiagnostics'),
      'error', task_center_nested_provider_diagnostics_summary(value->'error'),
      'response', task_center_nested_provider_diagnostics_summary(value->'response'),
      'httpStatus', value->'httpStatus',
      'status', value->'status',
      'statusCode', value->'statusCode',
      'requestId', to_jsonb(task_center_truncate_utf8(value->>'requestId', 128)),
      'request_id', to_jsonb(task_center_truncate_utf8(value->>'request_id', 128)),
      'providerErrorCode', to_jsonb(task_center_truncate_utf8(value->>'providerErrorCode', 128)),
      'errorCode', to_jsonb(task_center_truncate_utf8(value->>'errorCode', 128)),
      'code', to_jsonb(task_center_truncate_utf8(value->>'code', 128)),
      'failureCode', to_jsonb(task_center_truncate_utf8(value->>'failureCode', 128)),
      'providerMessage', to_jsonb(task_center_truncate_utf8(value->>'providerMessage', 256)),
      'errorMessage', to_jsonb(task_center_truncate_utf8(value->>'errorMessage', 256)),
      'message', to_jsonb(task_center_truncate_utf8(value->>'message', 256)),
      'reason', to_jsonb(task_center_truncate_utf8(value->>'reason', 256)),
      'displayMessage', to_jsonb(task_center_truncate_utf8(value->>'displayMessage', 256)),
      'details', to_jsonb(task_center_truncate_utf8(value->>'details', 256)),
      'providerRawResponse', to_jsonb(task_center_truncate_utf8(value->>'providerRawResponse', 1024)),
      'responseBodyPreview', to_jsonb(task_center_truncate_utf8(value->>'responseBodyPreview', 1024)),
      'responseBody', to_jsonb(task_center_truncate_utf8(value->>'responseBody', 512)),
      'body', to_jsonb(task_center_truncate_utf8(value->>'body', 512)),
      'statusText', to_jsonb(task_center_truncate_utf8(value->>'statusText', 128)),
      'contentType', to_jsonb(task_center_truncate_utf8(value->>'contentType', 128))
    )) AS value
  )
  SELECT CASE
    WHEN value IS NULL OR jsonb_typeof(value) <> 'object' THEN NULL::jsonb
    WHEN octet_length(summary.value::text) <= 8192 THEN summary.value
    ELSE jsonb_build_object('omitted', true, 'reason', 'oversized_provider_diagnostics')
  END
  FROM summary
$$;

CREATE OR REPLACE FUNCTION sync_provider_request_task_center_diagnostics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  should_refresh boolean := false;
BEGIN
  IF NEW.status IN ('failed', 'result_unknown', 'manual_review_required', 'canceled')
    AND NEW.response_redacted_json IS NOT NULL
  THEN
    IF TG_OP = 'INSERT' THEN
      should_refresh := NEW.task_center_diagnostics_json IS NULL;
    ELSE
      should_refresh := NEW.task_center_diagnostics_json IS NULL OR (
        NEW.task_center_diagnostics_json IS NOT DISTINCT FROM OLD.task_center_diagnostics_json
        AND (
          NEW.response_redacted_json IS DISTINCT FROM OLD.response_redacted_json
          OR NEW.status IS DISTINCT FROM OLD.status
        )
      );
    END IF;
    IF should_refresh THEN
      NEW.task_center_diagnostics_json := COALESCE(
        task_center_provider_diagnostics_summary(NEW.response_redacted_json),
        '{}'::jsonb
      );
      NEW.task_center_diagnostics_backfilled_at := now();
    END IF;
  END IF;
  IF NEW.task_center_diagnostics_json IS NOT NULL THEN
    NEW.task_center_diagnostics_backfilled_at := COALESCE(
      NEW.task_center_diagnostics_backfilled_at,
      now()
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS provider_requests_task_center_diagnostics_sync
  ON provider_requests;
CREATE TRIGGER provider_requests_task_center_diagnostics_sync
BEFORE INSERT OR UPDATE OF status, response_redacted_json, task_center_diagnostics_json
ON provider_requests
FOR EACH ROW
EXECUTE FUNCTION sync_provider_request_task_center_diagnostics();

CREATE OR REPLACE FUNCTION sync_generation_snapshot_task_center_diagnostics()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  should_refresh boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_refresh := NEW.task_center_diagnostics_json = '{}'::jsonb
      AND NEW.provider_status_json <> '{}'::jsonb;
  ELSE
    should_refresh := (
      NEW.task_center_diagnostics_json = '{}'::jsonb
      AND NEW.provider_status_json <> '{}'::jsonb
    ) OR (
      NEW.task_center_diagnostics_json IS NOT DISTINCT FROM OLD.task_center_diagnostics_json
      AND NEW.provider_status_json IS DISTINCT FROM OLD.provider_status_json
    );
  END IF;
  IF should_refresh THEN
    NEW.task_center_diagnostics_json := COALESCE(
      task_center_provider_diagnostics_summary(NEW.provider_status_json),
      '{}'::jsonb
    );
    NEW.task_center_diagnostics_backfilled_at := now();
  END IF;
  IF NEW.task_center_diagnostics_json <> '{}'::jsonb THEN
    NEW.task_center_diagnostics_backfilled_at := COALESCE(
      NEW.task_center_diagnostics_backfilled_at,
      now()
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS generation_snapshots_task_center_diagnostics_sync
  ON ai_generation_task_snapshots;
CREATE TRIGGER generation_snapshots_task_center_diagnostics_sync
BEFORE INSERT OR UPDATE OF provider_status_json, task_center_diagnostics_json
ON ai_generation_task_snapshots
FOR EACH ROW
EXECUTE FUNCTION sync_generation_snapshot_task_center_diagnostics();

CREATE OR REPLACE FUNCTION backfill_provider_request_task_center_diagnostics_batch(
  after_id uuid,
  batch_size integer
)
RETURNS TABLE(processed_count integer, next_id uuid)
LANGUAGE sql
VOLATILE
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT id
    FROM provider_requests
    WHERE (after_id IS NULL OR id > after_id)
      AND task_center_diagnostics_backfilled_at IS NULL
      AND task_center_diagnostics_json IS NULL
      AND response_redacted_json IS NOT NULL
      AND status IN ('failed', 'result_unknown', 'manual_review_required', 'canceled')
    ORDER BY id
    LIMIT LEAST(GREATEST(batch_size, 1), 1000)
    FOR UPDATE
  ), updated AS (
    UPDATE provider_requests request
    SET task_center_diagnostics_json = COALESCE(
          task_center_provider_diagnostics_summary(request.response_redacted_json),
          '{}'::jsonb
        ),
        task_center_diagnostics_backfilled_at = now()
    FROM candidates
    WHERE request.id = candidates.id
    RETURNING request.id
  )
  SELECT COUNT(*)::integer, (SELECT id FROM updated ORDER BY id DESC LIMIT 1)
  FROM updated
$$;

CREATE OR REPLACE FUNCTION backfill_generation_snapshot_task_center_diagnostics_batch(
  after_id uuid,
  batch_size integer
)
RETURNS TABLE(processed_count integer, next_id uuid)
LANGUAGE sql
VOLATILE
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT id
    FROM ai_generation_task_snapshots
    WHERE (after_id IS NULL OR id > after_id)
      AND task_center_diagnostics_backfilled_at IS NULL
      AND task_center_diagnostics_json = '{}'::jsonb
      AND provider_status_json <> '{}'::jsonb
    ORDER BY id
    LIMIT LEAST(GREATEST(batch_size, 1), 1000)
    FOR UPDATE
  ), updated AS (
    UPDATE ai_generation_task_snapshots snapshot
    SET task_center_diagnostics_json = COALESCE(
          task_center_provider_diagnostics_summary(snapshot.provider_status_json),
          '{}'::jsonb
        ),
        task_center_diagnostics_backfilled_at = now()
    FROM candidates
    WHERE snapshot.id = candidates.id
    RETURNING snapshot.id
  )
  SELECT COUNT(*)::integer, (SELECT id FROM updated ORDER BY id DESC LIMIT 1)
  FROM updated
$$;
