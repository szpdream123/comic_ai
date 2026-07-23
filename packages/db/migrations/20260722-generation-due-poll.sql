ALTER TABLE provider_requests
  ADD COLUMN IF NOT EXISTS next_poll_at timestamptz,
  ADD COLUMN IF NOT EXISTS poll_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS poll_sequence integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'provider_requests_poll_sequence_check'
  ) THEN
    ALTER TABLE provider_requests
      ADD CONSTRAINT provider_requests_poll_sequence_check
      CHECK (poll_sequence >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS provider_requests_due_poll_idx
  ON provider_requests (next_poll_at, id)
  WHERE next_poll_at IS NOT NULL
    AND status IN ('submitted', 'accepted', 'running', 'result_unknown');
