ALTER TABLE team_assets
  ADD COLUMN IF NOT EXISTS tags_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_tags_json_array_check;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_tags_json_array_check
  CHECK (jsonb_typeof(tags_json) = 'array');
