ALTER TABLE marketing_executors
  DROP CONSTRAINT IF EXISTS marketing_executors_status_check;

ALTER TABLE marketing_executors
  ADD CONSTRAINT marketing_executors_status_check
  CHECK (status IN ('active', 'degraded', 'offline', 'disabled'));

CREATE INDEX IF NOT EXISTS marketing_executors_status_heartbeat_idx
  ON marketing_executors (status, last_heartbeat_at DESC);
