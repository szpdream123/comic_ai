ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_asset_status_check,
  DROP CONSTRAINT IF EXISTS team_assets_asset_url_check,
  DROP CONSTRAINT IF EXISTS team_assets_active_url_check;

ALTER TABLE team_assets
  ALTER COLUMN asset_url DROP NOT NULL,
  ADD CONSTRAINT team_assets_asset_status_check
    CHECK (asset_status IN ('active', 'generating', 'archived', 'failed')),
  ADD CONSTRAINT team_assets_asset_url_check
    CHECK (asset_url IS NULL OR asset_url ~ '^https://'),
  ADD CONSTRAINT team_assets_active_url_check
    CHECK (asset_status <> 'active' OR asset_url ~ '^https://');
