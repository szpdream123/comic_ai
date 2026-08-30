-- Retire drained shards as soon as their admitted work is gone.
-- Accepting shards retain the existing idle grace period. Fallback shards never retire.
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
      AND (shard.state = 'draining' OR shard.updated_at <= p_idle_before)
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
