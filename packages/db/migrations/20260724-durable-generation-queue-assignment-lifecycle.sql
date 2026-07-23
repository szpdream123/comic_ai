ALTER TABLE generation_queue_stage_assignments
  ADD COLUMN IF NOT EXISTS redis_job_id text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE generation_queue_stage_assignments
SET published_at = admitted_at
WHERE status = 'admitted'
  AND published_at IS NULL;

ALTER TABLE generation_queue_stage_assignments
  DROP CONSTRAINT IF EXISTS generation_queue_stage_assignments_release_check;
ALTER TABLE generation_queue_stage_assignments
  DROP CONSTRAINT IF EXISTS generation_queue_stage_assignments_status_check;
ALTER TABLE generation_queue_stage_assignments
  ADD CONSTRAINT generation_queue_stage_assignments_status_check
    CHECK (status IN ('publishing', 'admitted', 'released'));
ALTER TABLE generation_queue_stage_assignments
  ADD CONSTRAINT generation_queue_stage_assignments_release_check CHECK (
    (
      status IN ('publishing', 'admitted')
      AND released_at IS NULL
      AND release_reason IS NULL
    )
    OR (
      status = 'released'
      AND released_at IS NOT NULL
      AND length(btrim(release_reason)) > 0
    )
  );
ALTER TABLE generation_queue_stage_assignments
  DROP CONSTRAINT IF EXISTS generation_queue_stage_assignments_redis_job_id_check;
ALTER TABLE generation_queue_stage_assignments
  ADD CONSTRAINT generation_queue_stage_assignments_redis_job_id_check
    CHECK (redis_job_id IS NULL OR length(btrim(redis_job_id)) > 0);

DROP INDEX IF EXISTS generation_queue_stage_assignments_admitted_idx;
CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_active_idx
  ON generation_queue_stage_assignments (admitted_at, assignment_key)
  WHERE status IN ('publishing', 'admitted');

DO $migration$
BEGIN
  IF to_regprocedure(
    'assign_generation_queue_stage_with_limits(text,uuid,text,text,text,text,timestamp with time zone,integer,integer)'
  ) IS NOT NULL THEN
    IF to_regprocedure(
      'assign_generation_queue_stage_with_limits_legacy_20260724(text,uuid,text,text,text,text,timestamp with time zone,integer,integer)'
    ) IS NULL THEN
      ALTER FUNCTION assign_generation_queue_stage_with_limits(
        text, uuid, text, text, text, text, timestamptz, integer, integer
      ) RENAME TO assign_generation_queue_stage_with_limits_legacy_20260724;
    ELSE
      DROP FUNCTION assign_generation_queue_stage_with_limits(
        text, uuid, text, text, text, text, timestamptz, integer, integer
      );
    END IF;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION assign_generation_queue_stage_with_limits(
  p_assignment_key text,
  p_task_id uuid,
  p_media_type text,
  p_stage text,
  p_route_key text,
  p_route_code text,
  p_now timestamptz,
  p_max_active_shards integer DEFAULT 256,
  p_reopen_threshold integer DEFAULT 300
)
RETURNS TABLE (
  assignment_key text, task_id uuid, media_type text, stage text,
  route_key text, route_code text, shard_id uuid, shard_no integer,
  queue_name text, capacity integer, rate_limit_max integer,
  rate_limit_duration_ms integer, admitted_count integer,
  shard_state text, assignment_status text
)
LANGUAGE plpgsql
AS $$
DECLARE assigned record;
BEGIN
  SELECT * INTO assigned
  FROM assign_generation_queue_stage_with_limits_legacy_20260724(
    p_assignment_key,
    p_task_id,
    p_media_type,
    p_stage,
    p_route_key,
    p_route_code,
    p_now,
    p_max_active_shards,
    p_reopen_threshold
  );
  IF assigned.assignment_status = 'released' THEN
    RAISE EXCEPTION 'generation_queue_assignment_already_released';
  END IF;
  RETURN QUERY SELECT
    assigned.assignment_key, assigned.task_id, assigned.media_type, assigned.stage,
    assigned.route_key, assigned.route_code, assigned.shard_id, assigned.shard_no,
    assigned.queue_name, assigned.capacity, assigned.rate_limit_max,
    assigned.rate_limit_duration_ms, assigned.admitted_count,
    assigned.shard_state, assigned.assignment_status;
END;
$$;

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
DECLARE assigned record;
DECLARE selected_assignment generation_queue_stage_assignments%ROWTYPE;
BEGIN
  IF p_redis_job_id IS NULL OR length(btrim(p_redis_job_id)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_redis_job_id_required';
  END IF;
  SELECT * INTO assigned
  FROM assign_generation_queue_stage_with_limits(
    p_assignment_key,
    p_task_id,
    p_media_type,
    p_stage,
    p_route_key,
    p_route_code,
    p_now,
    p_max_active_shards,
    p_reopen_threshold
  );

  SELECT assignment.* INTO selected_assignment
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;

  IF selected_assignment.status = 'publishing' THEN
    IF selected_assignment.redis_job_id IS DISTINCT FROM p_redis_job_id THEN
      RAISE EXCEPTION 'generation_queue_assignment_redis_job_id_mismatch';
    END IF;
  ELSIF selected_assignment.status = 'admitted' THEN
    IF selected_assignment.redis_job_id IS NOT NULL
      AND selected_assignment.redis_job_id IS DISTINCT FROM p_redis_job_id THEN
      RAISE EXCEPTION 'generation_queue_assignment_redis_job_id_mismatch';
    END IF;
    IF selected_assignment.published_at IS NULL
      AND selected_assignment.redis_job_id IS NULL THEN
      UPDATE generation_queue_stage_assignments assignment
      SET status = 'publishing',
          redis_job_id = p_redis_job_id,
          updated_at = p_now
      WHERE assignment.assignment_key = p_assignment_key
      RETURNING * INTO selected_assignment;
    ELSE
      UPDATE generation_queue_stage_assignments assignment
      SET redis_job_id = COALESCE(assignment.redis_job_id, p_redis_job_id),
          updated_at = p_now
      WHERE assignment.assignment_key = p_assignment_key
      RETURNING * INTO selected_assignment;
    END IF;
  ELSE
    RAISE EXCEPTION 'generation_queue_assignment_already_released';
  END IF;

  RETURN QUERY SELECT
    assigned.assignment_key, assigned.task_id, assigned.media_type, assigned.stage,
    assigned.route_key, assigned.route_code, assigned.shard_id, assigned.shard_no,
    assigned.queue_name, assigned.capacity, assigned.rate_limit_max,
    assigned.rate_limit_duration_ms, assigned.admitted_count,
    assigned.shard_state, selected_assignment.status,
    selected_assignment.redis_job_id, selected_assignment.published_at;
END;
$$;

CREATE OR REPLACE FUNCTION mark_generation_queue_stage_published(
  p_assignment_key text,
  p_redis_job_id text,
  p_now timestamptz
)
RETURNS TABLE (
  assignment_key text,
  assignment_status text,
  redis_job_id text,
  published_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE selected_assignment generation_queue_stage_assignments%ROWTYPE;
BEGIN
  IF p_redis_job_id IS NULL OR length(btrim(p_redis_job_id)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_redis_job_id_required';
  END IF;
  SELECT assignment.* INTO selected_assignment
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF selected_assignment.status = 'released' THEN
    RAISE EXCEPTION 'generation_queue_assignment_already_released';
  END IF;
  IF selected_assignment.redis_job_id IS NOT NULL
    AND selected_assignment.redis_job_id IS DISTINCT FROM p_redis_job_id THEN
    RAISE EXCEPTION 'generation_queue_assignment_redis_job_id_mismatch';
  END IF;

  UPDATE generation_queue_stage_assignments assignment
  SET status = 'admitted',
      redis_job_id = COALESCE(assignment.redis_job_id, p_redis_job_id),
      published_at = COALESCE(assignment.published_at, p_now),
      updated_at = p_now
  WHERE assignment.assignment_key = p_assignment_key
  RETURNING * INTO selected_assignment;

  RETURN QUERY SELECT
    selected_assignment.assignment_key,
    selected_assignment.status,
    selected_assignment.redis_job_id,
    selected_assignment.published_at;
END;
$$;

DO $migration$
BEGIN
  IF to_regprocedure(
    'release_generation_queue_stage_with_threshold(text,text,timestamp with time zone,integer)'
  ) IS NOT NULL THEN
    IF to_regprocedure(
      'release_generation_queue_stage_with_threshold_legacy_20260724(text,text,timestamp with time zone,integer)'
    ) IS NULL THEN
      ALTER FUNCTION release_generation_queue_stage_with_threshold(
        text, text, timestamptz, integer
      ) RENAME TO release_generation_queue_stage_with_threshold_legacy_20260724;
    ELSE
      DROP FUNCTION release_generation_queue_stage_with_threshold(
        text, text, timestamptz, integer
      );
    END IF;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION release_generation_queue_stage_with_threshold(
  p_assignment_key text,
  p_release_reason text,
  p_now timestamptz,
  p_reopen_threshold integer DEFAULT 300
)
RETURNS TABLE (
  assignment_key text,
  shard_id uuid,
  admitted_count integer,
  shard_state text,
  released boolean
)
LANGUAGE plpgsql
AS $$
DECLARE selected_status text;
BEGIN
  SELECT assignment.status INTO selected_status
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF selected_status = 'publishing' THEN
    UPDATE generation_queue_stage_assignments assignment
    SET status = 'admitted', updated_at = p_now
    WHERE assignment.assignment_key = p_assignment_key;
  END IF;
  RETURN QUERY
  SELECT *
  FROM release_generation_queue_stage_with_threshold_legacy_20260724(
    p_assignment_key,
    p_release_reason,
    p_now,
    p_reopen_threshold
  );
END;
$$;

CREATE OR REPLACE FUNCTION release_generation_queue_assignments_for_project(
  p_project_id uuid,
  p_release_reason text,
  p_now timestamptz
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE selected record;
DECLARE release_result record;
DECLARE released_count integer := 0;
BEGIN
  FOR selected IN
    SELECT assignment.assignment_key
    FROM generation_queue_stage_assignments assignment
    JOIN tasks task ON task.id = assignment.task_id
    WHERE task.project_id = p_project_id
      AND assignment.status IN ('publishing', 'admitted')
    ORDER BY assignment.assignment_key
  LOOP
    SELECT * INTO release_result
    FROM release_generation_queue_stage_with_threshold(
      selected.assignment_key,
      p_release_reason,
      p_now,
      300
    );
    IF release_result.released IS TRUE THEN
      released_count := released_count + 1;
    END IF;
  END LOOP;
  RETURN released_count;
END;
$$;

CREATE OR REPLACE FUNCTION release_generation_queue_assignments_before_task_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE selected record;
BEGIN
  FOR selected IN
    SELECT assignment.assignment_key
    FROM generation_queue_stage_assignments assignment
    WHERE assignment.task_id = OLD.id
      AND assignment.status IN ('publishing', 'admitted')
    ORDER BY assignment.assignment_key
  LOOP
    PERFORM release_generation_queue_stage_with_threshold(
      selected.assignment_key,
      'task_deleted',
      now(),
      300
    );
  END LOOP;
  DELETE FROM generation_queue_stage_assignments assignment
  WHERE assignment.task_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS release_generation_queue_assignments_before_task_delete_trigger ON tasks;
CREATE TRIGGER release_generation_queue_assignments_before_task_delete_trigger
BEFORE DELETE ON tasks
FOR EACH ROW
EXECUTE FUNCTION release_generation_queue_assignments_before_task_delete();

DO $migration$
DECLARE selected record;
BEGIN
  FOR selected IN
    SELECT assignment.assignment_key
    FROM generation_queue_stage_assignments assignment
    LEFT JOIN tasks task ON task.id = assignment.task_id
    WHERE task.id IS NULL
      AND assignment.status IN ('publishing', 'admitted')
    ORDER BY assignment.assignment_key
  LOOP
    PERFORM release_generation_queue_stage_with_threshold(
      selected.assignment_key,
      'migration_orphan_task_missing',
      now(),
      300
    );
  END LOOP;
  DELETE FROM generation_queue_stage_assignments assignment
  WHERE NOT EXISTS (
    SELECT 1 FROM tasks task WHERE task.id = assignment.task_id
  );
END;
$migration$;

ALTER TABLE generation_queue_stage_assignments
  DROP CONSTRAINT IF EXISTS generation_queue_stage_assignments_task_id_fkey;
ALTER TABLE generation_queue_stage_assignments
  ADD CONSTRAINT generation_queue_stage_assignments_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT;
