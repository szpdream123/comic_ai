CREATE TABLE IF NOT EXISTS model_service_requests (
  id text PRIMARY KEY,
  product_id text NOT NULL,
  subject_id text NOT NULL,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('text', 'video', 'speech', 'transcription')),
  model_json jsonb NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'submitting', 'running', 'succeeded', 'failed', 'result_unknown')),
  external_id text,
  result_json jsonb,
  error text,
  lease_token text,
  lease_until timestamptz,
  next_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (product_id, subject_id, request_key),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (lease_token IS NULL OR status IN ('submitting', 'running'))
);

CREATE INDEX IF NOT EXISTS model_service_requests_pending_idx
  ON model_service_requests (next_run_at, created_at, id)
  WHERE status IN ('queued', 'running') AND lease_token IS NULL;

CREATE INDEX IF NOT EXISTS model_service_requests_expired_idx
  ON model_service_requests (lease_until)
  WHERE lease_token IS NOT NULL AND status IN ('submitting', 'running');

CREATE TABLE IF NOT EXISTS model_service_nonces (
  product_id text NOT NULL,
  key_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (product_id, key_id, nonce)
);

CREATE INDEX IF NOT EXISTS model_service_nonces_expiry_idx
  ON model_service_nonces (expires_at);
