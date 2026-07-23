ALTER TABLE ai_generation_task_snapshots
  ADD COLUMN IF NOT EXISTS provider_config_revision_id text,
  ADD COLUMN IF NOT EXISTS credential_version_ref text;

ALTER TABLE provider_requests
  ADD COLUMN IF NOT EXISTS provider_config_revision_id text,
  ADD COLUMN IF NOT EXISTS credential_version_ref text;

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS generation_stage text,
  ADD COLUMN IF NOT EXISTS provider_route_key text,
  ADD COLUMN IF NOT EXISTS provider_config_revision_id text,
  ADD COLUMN IF NOT EXISTS credential_version_ref text;

CREATE INDEX IF NOT EXISTS outbox_events_generation_route_stage_idx
  ON outbox_events (generation_stage, provider_route_key, available_at, id)
  WHERE event_type LIKE 'generation.task.%'
    AND status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS provider_requests_config_revision_idx
  ON provider_requests (provider_config_revision_id, created_at DESC)
  WHERE provider_config_revision_id IS NOT NULL;
