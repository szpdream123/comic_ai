ALTER TABLE generation_queue_job_cancellations
  ADD COLUMN IF NOT EXISTS origin_assignment_status text,
  ADD COLUMN IF NOT EXISTS publish_fence_until timestamp with time zone;

UPDATE generation_queue_job_cancellations
SET origin_assignment_status = COALESCE(origin_assignment_status, 'admitted'),
    publish_fence_until = COALESCE(publish_fence_until, created_at)
WHERE origin_assignment_status IS NULL
   OR publish_fence_until IS NULL;

ALTER TABLE generation_queue_job_cancellations
  ALTER COLUMN origin_assignment_status SET NOT NULL,
  ALTER COLUMN publish_fence_until SET NOT NULL;

ALTER TABLE generation_queue_job_cancellations
  DROP CONSTRAINT IF EXISTS generation_queue_job_cancellations_origin_status_check;
ALTER TABLE generation_queue_job_cancellations
  ADD CONSTRAINT generation_queue_job_cancellations_origin_status_check
    CHECK (origin_assignment_status IN ('publishing', 'admitted', 'released'));

CREATE OR REPLACE FUNCTION release_generation_queue_assignments_before_task_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE selected record;
DECLARE cancellation_now timestamp with time zone := now();
BEGIN
  INSERT INTO generation_queue_job_cancellations (
    assignment_key,
    shard_id,
    queue_name,
    redis_job_id,
    status,
    origin_assignment_status,
    publish_fence_until,
    created_at,
    updated_at
  )
  SELECT
    assignment.assignment_key,
    assignment.shard_id,
    shard.queue_name,
    assignment.redis_job_id,
    'pending',
    CASE
      WHEN assignment.status = 'released' AND assignment.published_at IS NULL THEN 'publishing'
      ELSE assignment.status
    END,
    CASE
      WHEN assignment.status = 'publishing'
        OR (assignment.status = 'released' AND assignment.published_at IS NULL)
        THEN cancellation_now + interval '2 minutes'
      ELSE cancellation_now
    END,
    cancellation_now,
    cancellation_now
  FROM generation_queue_stage_assignments assignment
  JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
  WHERE assignment.task_id = OLD.id
    AND assignment.redis_job_id IS NOT NULL
  ON CONFLICT (assignment_key) DO UPDATE
  SET status = 'pending',
      shard_id = EXCLUDED.shard_id,
      queue_name = EXCLUDED.queue_name,
      redis_job_id = EXCLUDED.redis_job_id,
      origin_assignment_status = EXCLUDED.origin_assignment_status,
      publish_fence_until = EXCLUDED.publish_fence_until,
      locked_until = NULL,
      last_error = NULL,
      completed_at = NULL,
      updated_at = EXCLUDED.updated_at;

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
      cancellation_now,
      300
    );
  END LOOP;

  DELETE FROM generation_queue_stage_assignments assignment
  WHERE assignment.task_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION mark_generation_queue_stage_published(
  p_assignment_key text,
  p_redis_job_id text,
  p_now timestamp with time zone
)
RETURNS TABLE (
  assignment_key text,
  assignment_status text,
  redis_job_id text,
  published_at timestamp with time zone
)
LANGUAGE plpgsql
AS $$
DECLARE selected_assignment generation_queue_stage_assignments%ROWTYPE;
DECLARE selected_cancellation generation_queue_job_cancellations%ROWTYPE;
BEGIN
  IF p_redis_job_id IS NULL OR length(btrim(p_redis_job_id)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_redis_job_id_required';
  END IF;

  SELECT assignment.* INTO selected_assignment
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT cancellation.* INTO selected_cancellation
    FROM generation_queue_job_cancellations cancellation
    WHERE cancellation.assignment_key = p_assignment_key
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    IF selected_cancellation.redis_job_id IS DISTINCT FROM p_redis_job_id THEN
      RAISE EXCEPTION 'generation_queue_assignment_redis_job_id_mismatch';
    END IF;

    UPDATE generation_queue_job_cancellations cancellation
    SET status = 'pending',
        publish_fence_until = p_now,
        locked_until = NULL,
        last_error = NULL,
        completed_at = NULL,
        updated_at = p_now
    WHERE cancellation.assignment_key = p_assignment_key;

    RETURN QUERY SELECT p_assignment_key, 'canceled'::text, p_redis_job_id, NULL::timestamptz;
    RETURN;
  END IF;

  IF selected_assignment.redis_job_id IS DISTINCT FROM p_redis_job_id THEN
    RAISE EXCEPTION 'generation_queue_assignment_redis_job_id_mismatch';
  END IF;
  IF selected_assignment.status = 'released' THEN
    RETURN QUERY SELECT
      selected_assignment.assignment_key,
      selected_assignment.status,
      selected_assignment.redis_job_id,
      selected_assignment.published_at;
    RETURN;
  END IF;

  UPDATE generation_queue_stage_assignments assignment
  SET status = 'admitted',
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
