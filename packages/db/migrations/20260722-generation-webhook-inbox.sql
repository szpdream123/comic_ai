CREATE TABLE IF NOT EXISTS provider_webhook_inbox (
  id uuid PRIMARY KEY,
  provider_name text NOT NULL,
  event_key text NOT NULL,
  external_request_id text NOT NULL,
  payload_hash text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'received',
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT provider_webhook_inbox_status_check
    CHECK (status IN ('received', 'dispatched', 'unmatched', 'failed')),
  CONSTRAINT provider_webhook_inbox_provider_event_key UNIQUE (provider_name, event_key)
);

CREATE INDEX IF NOT EXISTS provider_webhook_inbox_external_request_idx
  ON provider_webhook_inbox (provider_name, external_request_id, received_at DESC);

CREATE INDEX IF NOT EXISTS provider_webhook_inbox_pending_idx
  ON provider_webhook_inbox (status, received_at, id)
  WHERE status IN ('received', 'failed');
