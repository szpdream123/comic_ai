CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_admitted_idx
  ON generation_queue_stage_assignments (admitted_at, assignment_key)
  WHERE status = 'admitted';

CREATE OR REPLACE FUNCTION assign_generation_queue_stage_with_limits(
  p_assignment_key text,
  p_task_id uuid,
  p_media_type text,
  p_stage text,
  p_route_key text,
  p_route_code text,
  p_now timestamp with time zone,
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
DECLARE
  existing_assignment generation_queue_stage_assignments%ROWTYPE;
  selected_route generation_queue_routes%ROWTYPE;
  selected_shard generation_queue_shards%ROWTYPE;
  next_shard_no integer;
  active_shards integer;
BEGIN
  IF p_max_active_shards IS NULL OR p_max_active_shards < 1 THEN
    RAISE EXCEPTION 'generation_queue_max_active_shards_invalid';
  END IF;
  IF p_reopen_threshold IS NULL OR p_reopen_threshold < 0 OR p_reopen_threshold >= 600 THEN
    RAISE EXCEPTION 'generation_queue_reopen_threshold_invalid';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('generation-assignment|' || p_assignment_key, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('generation-shard|' || p_media_type || '|' || p_stage || '|' || p_route_key, 0));

  SELECT assignment.* INTO existing_assignment
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;
  IF FOUND THEN
    IF existing_assignment.task_id IS DISTINCT FROM p_task_id
      OR existing_assignment.media_type IS DISTINCT FROM p_media_type
      OR existing_assignment.stage IS DISTINCT FROM p_stage
      OR existing_assignment.route_key IS DISTINCT FROM p_route_key THEN
      RAISE EXCEPTION 'generation_queue_assignment_identity_mismatch';
    END IF;
    SELECT * INTO selected_shard FROM generation_queue_shards WHERE id = existing_assignment.shard_id;
    RETURN QUERY SELECT existing_assignment.assignment_key, existing_assignment.task_id,
      existing_assignment.media_type, existing_assignment.stage, existing_assignment.route_key,
      selected_shard.route_code, selected_shard.id, selected_shard.shard_no, selected_shard.queue_name,
      selected_shard.capacity, selected_shard.rate_limit_max, selected_shard.rate_limit_duration_ms,
      selected_shard.admitted_count, selected_shard.state, existing_assignment.status;
    RETURN;
  END IF;

  INSERT INTO generation_queue_routes(route_key, route_code, created_at, updated_at)
  VALUES (p_route_key, p_route_code, p_now, p_now)
  ON CONFLICT ON CONSTRAINT generation_queue_routes_pkey DO NOTHING;
  SELECT route.* INTO selected_route FROM generation_queue_routes route WHERE route.route_key = p_route_key;
  IF selected_route.route_code IS DISTINCT FROM p_route_code THEN
    RAISE EXCEPTION 'generation_queue_route_code_mismatch';
  END IF;

  SELECT shard.* INTO selected_shard
  FROM generation_queue_shards shard
  WHERE shard.media_type = p_media_type AND shard.stage = p_stage AND shard.route_key = p_route_key
    AND shard.state = 'accepting' AND shard.admitted_count < shard.capacity
  ORDER BY shard.shard_no DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    SELECT count(*)::integer INTO active_shards
    FROM generation_queue_shards shard
    WHERE shard.media_type = p_media_type AND shard.stage = p_stage AND shard.route_key = p_route_key
      AND shard.state <> 'retired';
    IF active_shards >= p_max_active_shards THEN
      RAISE EXCEPTION 'generation_queue_active_shard_limit_reached';
    END IF;

    SELECT shard.* INTO selected_shard
    FROM generation_queue_shards shard
    WHERE shard.media_type = p_media_type AND shard.stage = p_stage AND shard.route_key = p_route_key
      AND shard.state = 'retired'
      AND shard.admitted_count = 0
    ORDER BY shard.shard_no DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE generation_queue_shards shard
      SET state = 'accepting', updated_at = p_now
      WHERE shard.id = selected_shard.id
      RETURNING * INTO selected_shard;
    ELSE
      SELECT coalesce(max(shard.shard_no), -1) + 1 INTO next_shard_no
      FROM generation_queue_shards shard
      WHERE shard.media_type = p_media_type AND shard.stage = p_stage AND shard.route_key = p_route_key;
      INSERT INTO generation_queue_shards(
        id, media_type, stage, route_key, route_code, shard_no, queue_name,
        capacity, rate_limit_max, rate_limit_duration_ms, admitted_count, state, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_media_type, p_stage, p_route_key, selected_route.route_code, next_shard_no,
        'generation-' || p_media_type || '-' || p_stage || '-' || selected_route.route_code || '-' || lpad(next_shard_no::text, 3, '0'),
        600, 5, 1000, 0, 'accepting', p_now, p_now
      ) RETURNING * INTO selected_shard;
    END IF;
  END IF;

  UPDATE generation_queue_shards shard
  SET admitted_count = shard.admitted_count + 1,
      state = CASE WHEN shard.admitted_count + 1 >= shard.capacity THEN 'full' ELSE shard.state END,
      updated_at = p_now
  WHERE shard.id = selected_shard.id AND shard.state = 'accepting' AND shard.admitted_count < shard.capacity
  RETURNING * INTO selected_shard;
  IF NOT FOUND THEN RAISE EXCEPTION 'generation_queue_shard_capacity_race'; END IF;

  INSERT INTO generation_queue_stage_assignments(
    assignment_key, task_id, media_type, stage, route_key, shard_id,
    status, admitted_at, created_at, updated_at
  ) VALUES (p_assignment_key, p_task_id, p_media_type, p_stage, p_route_key,
            selected_shard.id, 'admitted', p_now, p_now, p_now)
  RETURNING * INTO existing_assignment;
  RETURN QUERY SELECT existing_assignment.assignment_key, existing_assignment.task_id,
    existing_assignment.media_type, existing_assignment.stage, existing_assignment.route_key,
    selected_shard.route_code, selected_shard.id, selected_shard.shard_no, selected_shard.queue_name,
    selected_shard.capacity, selected_shard.rate_limit_max, selected_shard.rate_limit_duration_ms,
    selected_shard.admitted_count, selected_shard.state, existing_assignment.status;
END;
$$;

CREATE OR REPLACE FUNCTION release_generation_queue_stage_with_threshold(
  p_assignment_key text,
  p_release_reason text,
  p_now timestamp with time zone,
  p_reopen_threshold integer DEFAULT 300
)
RETURNS TABLE (assignment_key text, shard_id uuid, admitted_count integer, shard_state text, released boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_assignment generation_queue_stage_assignments%ROWTYPE;
  selected_shard generation_queue_shards%ROWTYPE;
  was_released boolean := false;
BEGIN
  IF p_reopen_threshold IS NULL OR p_reopen_threshold < 0 OR p_reopen_threshold >= 600 THEN
    RAISE EXCEPTION 'generation_queue_reopen_threshold_invalid';
  END IF;
  SELECT assignment.* INTO selected_assignment FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF selected_assignment.status = 'admitted' THEN
    UPDATE generation_queue_stage_assignments assignment SET status = 'released', released_at = p_now,
      release_reason = p_release_reason, updated_at = p_now
    WHERE assignment.assignment_key = p_assignment_key AND assignment.status = 'admitted'
    RETURNING * INTO selected_assignment;
    UPDATE generation_queue_shards shard
    SET admitted_count = shard.admitted_count - 1,
        state = CASE WHEN shard.state = 'full' THEN 'accepting' ELSE shard.state END,
        updated_at = p_now
    WHERE shard.id = selected_assignment.shard_id AND shard.admitted_count > 0
    RETURNING * INTO selected_shard;
    IF NOT FOUND THEN RAISE EXCEPTION 'generation_queue_shard_release_underflow'; END IF;
    was_released := true;
  ELSE
    SELECT shard.* INTO selected_shard FROM generation_queue_shards shard WHERE shard.id = selected_assignment.shard_id;
  END IF;
  RETURN QUERY SELECT selected_assignment.assignment_key, selected_shard.id,
    selected_shard.admitted_count, selected_shard.state, was_released;
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
    WHERE shard.state IN ('accepting', 'draining') AND shard.admitted_count = 0
      AND shard.updated_at <= p_idle_before
      AND NOT EXISTS (
        SELECT 1
        FROM generation_queue_stage_assignments assignment
        WHERE assignment.shard_id = shard.id
          AND assignment.status = 'admitted'
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE generation_queue_shards shard SET state = 'retired', updated_at = now()
  FROM candidates WHERE shard.id = candidates.id;
  GET DIAGNOSTICS retired_count = ROW_COUNT;
  RETURN retired_count;
END;
$$;
