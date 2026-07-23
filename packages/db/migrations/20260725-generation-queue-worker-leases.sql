CREATE TABLE IF NOT EXISTS generation_queue_worker_leases (
  queue_name text PRIMARY KEY REFERENCES generation_queue_shards(queue_name) ON DELETE CASCADE,
  owner_id text NOT NULL,
  lease_until timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT generation_queue_worker_leases_owner_check CHECK (length(btrim(owner_id)) > 0)
);

CREATE INDEX IF NOT EXISTS generation_queue_worker_leases_expiry_idx
  ON generation_queue_worker_leases (lease_until);

CREATE OR REPLACE FUNCTION reconcile_generation_queue_worker_leases(
  p_owner_id text,
  p_candidate_queue_names text[],
  p_limit integer,
  p_now timestamp with time zone,
  p_lease_ms integer
)
RETURNS TABLE (queue_name text)
LANGUAGE plpgsql
AS $$
DECLARE
  candidate_queue_name text;
  claimed_queue_name text;
  claimed_queue_names text[] := ARRAY[]::text[];
BEGIN
  IF p_owner_id IS NULL OR length(btrim(p_owner_id)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_worker_lease_owner_required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'generation_queue_worker_lease_limit_invalid';
  END IF;
  IF p_lease_ms IS NULL OR p_lease_ms < 5000 OR p_lease_ms > 300000 THEN
    RAISE EXCEPTION 'generation_queue_worker_lease_duration_invalid';
  END IF;

  DELETE FROM generation_queue_worker_leases lease
  WHERE lease.lease_until <= p_now;

  FOREACH candidate_queue_name IN ARRAY COALESCE(p_candidate_queue_names, ARRAY[]::text[])
  LOOP
    EXIT WHEN cardinality(claimed_queue_names) >= p_limit;
    CONTINUE WHEN candidate_queue_name IS NULL
      OR length(btrim(candidate_queue_name)) = 0
      OR candidate_queue_name = ANY(claimed_queue_names);

    claimed_queue_name := NULL;
    INSERT INTO generation_queue_worker_leases (
      queue_name, owner_id, lease_until, created_at, updated_at
    )
    SELECT
      shard.queue_name,
      p_owner_id,
      p_now + (p_lease_ms * interval '1 millisecond'),
      p_now,
      p_now
    FROM generation_queue_shards shard
    WHERE shard.queue_name = candidate_queue_name
      AND shard.state <> 'retired'
    ON CONFLICT ON CONSTRAINT generation_queue_worker_leases_pkey DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        lease_until = EXCLUDED.lease_until,
        updated_at = EXCLUDED.updated_at
    WHERE generation_queue_worker_leases.owner_id = p_owner_id
       OR generation_queue_worker_leases.lease_until <= p_now
    RETURNING generation_queue_worker_leases.queue_name INTO claimed_queue_name;

    IF claimed_queue_name IS NOT NULL THEN
      claimed_queue_names := array_append(claimed_queue_names, claimed_queue_name);
    END IF;
  END LOOP;

  DELETE FROM generation_queue_worker_leases lease
  WHERE lease.owner_id = p_owner_id
    AND NOT (lease.queue_name = ANY(claimed_queue_names));

  RETURN QUERY SELECT unnest(claimed_queue_names);
END;
$$;

CREATE OR REPLACE FUNCTION release_generation_queue_worker_leases(
  p_owner_id text
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  released_count integer;
BEGIN
  IF p_owner_id IS NULL OR length(btrim(p_owner_id)) = 0 THEN
    RAISE EXCEPTION 'generation_queue_worker_lease_owner_required';
  END IF;
  DELETE FROM generation_queue_worker_leases lease
  WHERE lease.owner_id = p_owner_id;
  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;
