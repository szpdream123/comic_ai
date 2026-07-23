CREATE TABLE IF NOT EXISTS generation_queue_job_cancellations (
  assignment_key text PRIMARY KEY,
  shard_id uuid NOT NULL REFERENCES generation_queue_shards(id) ON DELETE CASCADE,
  queue_name text NOT NULL,
  redis_job_id text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  locked_until timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  CONSTRAINT generation_queue_job_cancellations_status_check
    CHECK (status IN ('pending', 'processing', 'completed')),
  CONSTRAINT generation_queue_job_cancellations_attempts_check CHECK (attempts >= 0),
  CONSTRAINT generation_queue_job_cancellations_queue_name_check CHECK (length(btrim(queue_name)) > 0),
  CONSTRAINT generation_queue_job_cancellations_redis_job_id_check CHECK (length(btrim(redis_job_id)) > 0)
);

CREATE INDEX IF NOT EXISTS generation_queue_job_cancellations_due_idx
  ON generation_queue_job_cancellations (status, locked_until, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS generation_queue_job_cancellations_shard_pending_idx
  ON generation_queue_job_cancellations (shard_id)
  WHERE status IN ('pending', 'processing');

CREATE OR REPLACE FUNCTION release_generation_queue_assignments_before_task_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE selected record;
BEGIN
  INSERT INTO generation_queue_job_cancellations (
    assignment_key,
    shard_id,
    queue_name,
    redis_job_id,
    status,
    created_at,
    updated_at
  )
  SELECT
    assignment.assignment_key,
    assignment.shard_id,
    shard.queue_name,
    assignment.redis_job_id,
    'pending',
    now(),
    now()
  FROM generation_queue_stage_assignments assignment
  JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
  WHERE assignment.task_id = OLD.id
    AND assignment.redis_job_id IS NOT NULL
  ON CONFLICT (assignment_key) DO NOTHING;

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

CREATE OR REPLACE FUNCTION retire_idle_generation_queue_shards(
  p_idle_before timestamp with time zone
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE retired_count integer;
BEGIN
  WITH candidates AS (
    SELECT shard.id
    FROM generation_queue_shards shard
    WHERE shard.state IN ('accepting', 'draining')
      AND shard.admitted_count = 0
      AND shard.updated_at <= p_idle_before
      AND NOT EXISTS (
        SELECT 1
        FROM generation_queue_stage_assignments assignment
        WHERE assignment.shard_id = shard.id
          AND assignment.status IN ('publishing', 'admitted')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM generation_queue_job_cancellations cancellation
        WHERE cancellation.shard_id = shard.id
          AND cancellation.status IN ('pending', 'processing')
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE generation_queue_shards shard
  SET state = 'retired', updated_at = now()
  FROM candidates
  WHERE shard.id = candidates.id;
  GET DIAGNOSTICS retired_count = ROW_COUNT;
  RETURN retired_count;
END;
$$;
