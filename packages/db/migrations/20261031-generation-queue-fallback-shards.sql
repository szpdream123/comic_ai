-- Keep one non-retiring fallback shard for every media/stage pair. Dynamic
-- route shards continue to be allocated and retired as before.
DO $$
DECLARE
  p_media text;
  p_stage text;
  p_route_key text;
  p_route_code text;
BEGIN
  FOREACH p_media IN ARRAY ARRAY['image', 'video', 'audio']::text[] LOOP
    FOREACH p_stage IN ARRAY ARRAY['submit', 'poll', 'fetch', 'persist']::text[] LOOP
      p_route_key := 'fallback:' || p_media || ':' || p_stage;
      p_route_code := 'fallback' || p_media || p_stage;
      INSERT INTO generation_queue_routes (route_key, route_code, created_at, updated_at)
      VALUES (p_route_key, p_route_code, now(), now())
      ON CONFLICT (route_key) DO NOTHING;
      INSERT INTO generation_queue_shards (
        id, media_type, stage, route_key, route_code, shard_no, queue_name,
        capacity, rate_limit_max, rate_limit_duration_ms, admitted_count,
        state, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), p_media, p_stage, p_route_key, p_route_code, 0,
        'generation-' || p_media || '-' || p_stage || '-fallback-000',
        600, 5, 1000, 0, 'accepting', now(), now()
      )
      ON CONFLICT (media_type, stage, route_key, shard_no) DO NOTHING;
    END LOOP;
  END LOOP;
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
      AND shard.route_key NOT LIKE 'fallback:%'
      AND shard.updated_at <= p_idle_before
      AND NOT EXISTS (
        SELECT 1
        FROM generation_queue_stage_assignments assignment
        WHERE assignment.shard_id = shard.id
          AND assignment.status = 'admitted'
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
