ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_active_dedupe_idx
  ON outbox_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL
    AND status IN ('pending', 'processing', 'failed');
