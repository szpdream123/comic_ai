DO $migration$
BEGIN
  IF to_regprocedure(
    'reserve_generation_queue_stage_for_publish(text,uuid,text,text,text,text,text,timestamp with time zone,integer,integer)'
  ) IS NOT NULL THEN
    IF to_regprocedure(
      'reserve_generation_queue_stage_for_publish_legacy_20261026(text,uuid,text,text,text,text,text,timestamp with time zone,integer,integer)'
    ) IS NULL THEN
      ALTER FUNCTION reserve_generation_queue_stage_for_publish(
        text, uuid, text, text, text, text, text, timestamptz, integer, integer
      ) RENAME TO reserve_generation_queue_stage_for_publish_legacy_20261026;
    ELSE
      DROP FUNCTION reserve_generation_queue_stage_for_publish(
        text, uuid, text, text, text, text, text, timestamptz, integer, integer
      );
    END IF;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION reserve_generation_queue_stage_for_publish(
  p_assignment_key text,
  p_task_id uuid,
  p_media_type text,
  p_stage text,
  p_route_key text,
  p_route_code text,
  p_redis_job_id text,
  p_now timestamptz,
  p_max_active_shards integer DEFAULT 256,
  p_reopen_threshold integer DEFAULT 300
)
RETURNS TABLE (
  assignment_key text, task_id uuid, media_type text, stage text,
  route_key text, route_code text, shard_id uuid, shard_no integer,
  queue_name text, capacity integer, rate_limit_max integer,
  rate_limit_duration_ms integer, admitted_count integer,
  shard_state text, assignment_status text, redis_job_id text,
  published_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('generation-active-task|' || p_task_id::text, 0)
  );

  IF p_stage IN ('submit', 'poll')
    AND p_assignment_key NOT LIKE 'generation.repair.poll:%'
    AND EXISTS (
      SELECT 1
      FROM generation_queue_stage_assignments assignment
      WHERE assignment.task_id = p_task_id
        AND assignment.stage = 'poll'
        AND assignment.assignment_key LIKE 'generation.repair.poll:%'
        AND assignment.status IN ('publishing', 'admitted')
    ) THEN
    RAISE EXCEPTION 'generation_queue_repair_assignment_active';
  END IF;

  RETURN QUERY
  SELECT *
  FROM reserve_generation_queue_stage_for_publish_legacy_20261026(
    p_assignment_key,
    p_task_id,
    p_media_type,
    p_stage,
    p_route_key,
    p_route_code,
    p_redis_job_id,
    p_now,
    p_max_active_shards,
    p_reopen_threshold
  );
END;
$$;

CREATE OR REPLACE FUNCTION reserve_generation_queue_repair_poll_for_publish(
  p_assignment_key text,
  p_task_id uuid,
  p_media_type text,
  p_stage text,
  p_route_key text,
  p_route_code text,
  p_redis_job_id text,
  p_now timestamptz,
  p_max_active_shards integer DEFAULT 256,
  p_reopen_threshold integer DEFAULT 300
)
RETURNS TABLE (
  assignment_key text, task_id uuid, media_type text, stage text,
  route_key text, route_code text, shard_id uuid, shard_no integer,
  queue_name text, capacity integer, rate_limit_max integer,
  rate_limit_duration_ms integer, admitted_count integer,
  shard_state text, assignment_status text, redis_job_id text,
  published_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_stage IS DISTINCT FROM 'poll'
    OR p_assignment_key NOT LIKE 'generation.repair.poll:%' THEN
    RAISE EXCEPTION 'generation_queue_repair_poll_identity_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('generation-active-task|' || p_task_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM generation_queue_stage_assignments assignment
    WHERE assignment.task_id = p_task_id
      AND assignment.assignment_key <> p_assignment_key
      AND assignment.stage IN ('submit', 'poll')
      AND assignment.status IN ('publishing', 'admitted')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM reserve_generation_queue_stage_for_publish(
    p_assignment_key,
    p_task_id,
    p_media_type,
    p_stage,
    p_route_key,
    p_route_code,
    p_redis_job_id,
    p_now,
    p_max_active_shards,
    p_reopen_threshold
  );
END;
$$;
