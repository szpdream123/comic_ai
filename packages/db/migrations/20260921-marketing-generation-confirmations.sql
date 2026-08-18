ALTER TABLE marketing_generation_runs
  ADD COLUMN IF NOT EXISTS media_asset_manifest_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE marketing_generation_runs
  DROP CONSTRAINT IF EXISTS marketing_generation_runs_status_check;

ALTER TABLE marketing_generation_runs
  ADD CONSTRAINT marketing_generation_runs_status_check
  CHECK (status IN (
    'queued', 'knowledge', 'plan_ready', 'planning', 'generating', 'media_ready',
    'scheduled', 'publishing', 'succeeded', 'failed', 'canceled'
  ));
