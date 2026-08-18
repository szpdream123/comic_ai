CREATE TABLE IF NOT EXISTS marketing_executor_alerts (
  id uuid PRIMARY KEY,
  executor_id uuid NOT NULL REFERENCES marketing_executors(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_executor_alerts_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS marketing_executor_alerts_open_reason_unique_idx
  ON marketing_executor_alerts (executor_id, reason)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS marketing_executor_alerts_status_detected_idx
  ON marketing_executor_alerts (status, detected_at DESC);
