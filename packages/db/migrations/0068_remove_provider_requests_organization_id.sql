ALTER TABLE provider_requests
  DROP COLUMN organization_id CASCADE;

ALTER TABLE provider_requests
  DROP CONSTRAINT IF EXISTS provider_requests_key_unique;

ALTER TABLE provider_requests
  ADD CONSTRAINT provider_requests_key_unique
    UNIQUE (provider_name, provider_operation, request_key);

CREATE INDEX IF NOT EXISTS provider_requests_task_idx
  ON provider_requests (task_id, attempt_id)
  WHERE task_id IS NOT NULL;

ALTER TABLE ai_generation_task_snapshots
  ADD CONSTRAINT ai_generation_task_snapshots_provider_request_id_fkey
    FOREIGN KEY (provider_request_id)
    REFERENCES provider_requests (id);
