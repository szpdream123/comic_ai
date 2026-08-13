ALTER TABLE geo_generation_runs
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_token uuid;

UPDATE geo_generation_runs
   SET lease_expires_at = COALESCE(lease_expires_at, '-infinity'::timestamptz)
 WHERE status = 'running';

CREATE INDEX IF NOT EXISTS geo_generation_runs_recovery_idx
  ON geo_generation_runs (lease_expires_at, id)
  WHERE status = 'running';
