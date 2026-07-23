CREATE TABLE IF NOT EXISTS generation_queue_routes (
  route_key text PRIMARY KEY,
  route_code text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT generation_queue_routes_key_check CHECK (length(btrim(route_key)) > 0),
  CONSTRAINT generation_queue_routes_code_check CHECK (route_code ~ '^[a-z0-9]+$')
);

CREATE TABLE IF NOT EXISTS generation_queue_shards (
  id uuid PRIMARY KEY,
  media_type text NOT NULL,
  stage text NOT NULL,
  route_key text NOT NULL REFERENCES generation_queue_routes(route_key),
  route_code text NOT NULL,
  shard_no integer NOT NULL,
  queue_name text NOT NULL UNIQUE,
  capacity integer DEFAULT 600 NOT NULL,
  rate_limit_max integer DEFAULT 5 NOT NULL,
  rate_limit_duration_ms integer DEFAULT 1000 NOT NULL,
  admitted_count integer DEFAULT 0 NOT NULL,
  state text DEFAULT 'accepting' NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT generation_queue_shards_scope_key UNIQUE (media_type, stage, route_key, shard_no),
  CONSTRAINT generation_queue_shards_media_type_check CHECK (media_type IN ('image', 'video', 'audio')),
  CONSTRAINT generation_queue_shards_stage_check CHECK (stage IN ('submit', 'poll', 'fetch', 'persist')),
  CONSTRAINT generation_queue_shards_route_code_check CHECK (route_code ~ '^[a-z0-9]+$'),
  CONSTRAINT generation_queue_shards_queue_name_check CHECK (queue_name ~ '^[a-z0-9-]+$'),
  CONSTRAINT generation_queue_shards_shard_no_check CHECK (shard_no >= 0),
  CONSTRAINT generation_queue_shards_capacity_check CHECK (capacity = 600),
  CONSTRAINT generation_queue_shards_rate_limit_check CHECK (rate_limit_max = 5 AND rate_limit_duration_ms = 1000),
  CONSTRAINT generation_queue_shards_admitted_count_check CHECK (admitted_count >= 0 AND admitted_count <= capacity),
  CONSTRAINT generation_queue_shards_state_check CHECK (state IN ('accepting', 'full', 'draining', 'retired'))
);

CREATE TABLE IF NOT EXISTS generation_queue_stage_assignments (
  assignment_key text PRIMARY KEY,
  task_id uuid NOT NULL,
  media_type text NOT NULL,
  stage text NOT NULL,
  route_key text NOT NULL,
  shard_id uuid NOT NULL REFERENCES generation_queue_shards(id),
  status text DEFAULT 'admitted' NOT NULL,
  admitted_at timestamp with time zone NOT NULL,
  released_at timestamp with time zone,
  release_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT generation_queue_stage_assignments_key_check CHECK (length(btrim(assignment_key)) > 0),
  CONSTRAINT generation_queue_stage_assignments_media_type_check CHECK (media_type IN ('image', 'video', 'audio')),
  CONSTRAINT generation_queue_stage_assignments_stage_check CHECK (stage IN ('submit', 'poll', 'fetch', 'persist')),
  CONSTRAINT generation_queue_stage_assignments_status_check CHECK (status IN ('admitted', 'released')),
  CONSTRAINT generation_queue_stage_assignments_release_check CHECK (
    (status = 'admitted' AND released_at IS NULL AND release_reason IS NULL)
    OR (status = 'released' AND released_at IS NOT NULL AND length(btrim(release_reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS generation_queue_shards_accepting_idx
  ON generation_queue_shards (media_type, stage, route_key, shard_no DESC)
  WHERE state = 'accepting';

CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_shard_status_idx
  ON generation_queue_stage_assignments (shard_id, status);

CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_task_idx
  ON generation_queue_stage_assignments (task_id, stage, created_at DESC);

CREATE OR REPLACE FUNCTION assign_generation_queue_stage(
  p_assignment_key text,
  p_task_id uuid,
  p_media_type text,
  p_stage text,
  p_route_key text,
  p_route_code text,
  p_now timestamp with time zone
)
RETURNS TABLE (
  assignment_key text,
  task_id uuid,
  media_type text,
  stage text,
  route_key text,
  route_code text,
  shard_id uuid,
  shard_no integer,
  queue_name text,
  capacity integer,
  rate_limit_max integer,
  rate_limit_duration_ms integer,
  admitted_count integer,
  shard_state text,
  assignment_status text
)
LANGUAGE plpgsql
AS $$
DECLARE
  existing_assignment generation_queue_stage_assignments%ROWTYPE;
  selected_route generation_queue_routes%ROWTYPE;
  selected_shard generation_queue_shards%ROWTYPE;
  next_shard_no integer;
BEGIN
  IF p_assignment_key IS NULL OR length(btrim(p_assignment_key)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_assignment_key_required';
  END IF;

  -- Serialize the idempotency key first, then the route scope, so retries cannot occupy two shards.
  PERFORM pg_advisory_xact_lock(hashtextextended('generation-assignment|' || p_assignment_key, 0));
  PERFORM pg_advisory_xact_lock(
    hashtextextended('generation-shard|' || p_media_type || '|' || p_stage || '|' || p_route_key, 0)
  );

  SELECT assignment.*
  INTO existing_assignment
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
    SELECT shard.*
    INTO selected_shard
    FROM generation_queue_shards shard
    WHERE shard.id = existing_assignment.shard_id;

    RETURN QUERY SELECT
      existing_assignment.assignment_key,
      existing_assignment.task_id,
      existing_assignment.media_type,
      existing_assignment.stage,
      existing_assignment.route_key,
      selected_shard.route_code,
      selected_shard.id,
      selected_shard.shard_no,
      selected_shard.queue_name,
      selected_shard.capacity,
      selected_shard.rate_limit_max,
      selected_shard.rate_limit_duration_ms,
      selected_shard.admitted_count,
      selected_shard.state,
      existing_assignment.status;
    RETURN;
  END IF;

  INSERT INTO generation_queue_routes (route_key, route_code, created_at, updated_at)
  VALUES (p_route_key, p_route_code, p_now, p_now)
  ON CONFLICT ON CONSTRAINT generation_queue_routes_pkey DO NOTHING;

  SELECT route.*
  INTO selected_route
  FROM generation_queue_routes route
  WHERE route.route_key = p_route_key;

  IF selected_route.route_code IS DISTINCT FROM p_route_code THEN
    RAISE EXCEPTION 'generation_queue_route_code_mismatch';
  END IF;

  SELECT shard.*
  INTO selected_shard
  FROM generation_queue_shards shard
  WHERE shard.media_type = p_media_type
    AND shard.stage = p_stage
    AND shard.route_key = p_route_key
    AND shard.state = 'accepting'
    AND shard.admitted_count < shard.capacity
  ORDER BY shard.shard_no DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    SELECT COALESCE(max(shard.shard_no), -1) + 1
    INTO next_shard_no
    FROM generation_queue_shards shard
    WHERE shard.media_type = p_media_type
      AND shard.stage = p_stage
      AND shard.route_key = p_route_key;

    INSERT INTO generation_queue_shards (
      id,
      media_type,
      stage,
      route_key,
      route_code,
      shard_no,
      queue_name,
      capacity,
      rate_limit_max,
      rate_limit_duration_ms,
      admitted_count,
      state,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_media_type,
      p_stage,
      p_route_key,
      selected_route.route_code,
      next_shard_no,
      'generation-' || p_media_type || '-' || p_stage || '-' || selected_route.route_code || '-' || lpad(next_shard_no::text, 3, '0'),
      600,
      5,
      1000,
      0,
      'accepting',
      p_now,
      p_now
    )
    RETURNING * INTO selected_shard;
  END IF;

  UPDATE generation_queue_shards shard
  SET admitted_count = shard.admitted_count + 1,
      state = CASE
        WHEN shard.admitted_count + 1 >= shard.capacity THEN 'full'
        ELSE shard.state
      END,
      updated_at = p_now
  WHERE shard.id = selected_shard.id
    AND shard.state = 'accepting'
    AND shard.admitted_count < shard.capacity
  RETURNING * INTO selected_shard;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'generation_queue_shard_capacity_race';
  END IF;

  INSERT INTO generation_queue_stage_assignments (
    assignment_key,
    task_id,
    media_type,
    stage,
    route_key,
    shard_id,
    status,
    admitted_at,
    created_at,
    updated_at
  )
  VALUES (
    p_assignment_key,
    p_task_id,
    p_media_type,
    p_stage,
    p_route_key,
    selected_shard.id,
    'admitted',
    p_now,
    p_now,
    p_now
  )
  RETURNING * INTO existing_assignment;

  RETURN QUERY SELECT
    existing_assignment.assignment_key,
    existing_assignment.task_id,
    existing_assignment.media_type,
    existing_assignment.stage,
    existing_assignment.route_key,
    selected_shard.route_code,
    selected_shard.id,
    selected_shard.shard_no,
    selected_shard.queue_name,
    selected_shard.capacity,
    selected_shard.rate_limit_max,
    selected_shard.rate_limit_duration_ms,
    selected_shard.admitted_count,
    selected_shard.state,
    existing_assignment.status;
END;
$$;

CREATE OR REPLACE FUNCTION release_generation_queue_stage(
  p_assignment_key text,
  p_release_reason text,
  p_now timestamp with time zone
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
DECLARE
  selected_assignment generation_queue_stage_assignments%ROWTYPE;
  selected_shard generation_queue_shards%ROWTYPE;
  was_released boolean := false;
BEGIN
  IF p_release_reason IS NULL OR length(btrim(p_release_reason)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_release_reason_required';
  END IF;

  SELECT assignment.*
  INTO selected_assignment
  FROM generation_queue_stage_assignments assignment
  WHERE assignment.assignment_key = p_assignment_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF selected_assignment.status = 'admitted' THEN
    UPDATE generation_queue_stage_assignments assignment
    SET status = 'released',
        released_at = p_now,
        release_reason = p_release_reason,
        updated_at = p_now
    WHERE assignment.assignment_key = p_assignment_key
      AND assignment.status = 'admitted'
    RETURNING * INTO selected_assignment;

    UPDATE generation_queue_shards shard
    SET admitted_count = shard.admitted_count - 1,
        state = CASE
          WHEN shard.state = 'full' THEN 'accepting'
          ELSE shard.state
        END,
        updated_at = p_now
    WHERE shard.id = selected_assignment.shard_id
      AND shard.admitted_count > 0
    RETURNING * INTO selected_shard;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'generation_queue_shard_release_underflow';
    END IF;
    was_released := true;
  ELSE
    SELECT shard.*
    INTO selected_shard
    FROM generation_queue_shards shard
    WHERE shard.id = selected_assignment.shard_id;
  END IF;

  RETURN QUERY SELECT
    selected_assignment.assignment_key,
    selected_shard.id,
    selected_shard.admitted_count,
    selected_shard.state,
    was_released;
END;
$$;

-- Limit-aware assignment used by the runtime. The legacy function above remains
-- available for older callers; this variant prevents unbounded shard creation.
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
  ORDER BY shard.shard_no DESC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    SELECT count(*)::integer INTO active_shards
    FROM generation_queue_shards shard
    WHERE shard.media_type = p_media_type AND shard.stage = p_stage AND shard.route_key = p_route_key
      AND shard.state <> 'retired';
    IF active_shards >= p_max_active_shards THEN
      RAISE EXCEPTION 'generation_queue_active_shard_limit_reached';
    END IF;
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
        state = CASE WHEN shard.state = 'full' AND shard.admitted_count - 1 <= p_reopen_threshold THEN 'accepting' ELSE shard.state END,
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
      AND EXISTS (
        SELECT 1 FROM generation_queue_shards newer
        WHERE newer.media_type = shard.media_type AND newer.stage = shard.stage
          AND newer.route_key = shard.route_key AND newer.shard_no > shard.shard_no
          AND newer.state <> 'retired'
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE generation_queue_shards shard SET state = 'retired', updated_at = now()
  FROM candidates WHERE shard.id = candidates.id;
  GET DIAGNOSTICS retired_count = ROW_COUNT;
  RETURN retired_count;
END;
$$;

CREATE OR REPLACE FUNCTION drain_generation_queue_shard(
  p_shard_id uuid,
  p_now timestamp with time zone
)
RETURNS boolean
LANGUAGE sql
AS $$
  UPDATE generation_queue_shards
  SET state = 'draining', updated_at = p_now
  WHERE id = p_shard_id AND state IN ('accepting', 'full')
  RETURNING true;
$$;
