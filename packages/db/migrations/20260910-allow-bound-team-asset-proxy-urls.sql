ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_active_url_check;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_active_url_check
  CHECK (
    asset_status <> 'active'::text
    OR asset_url ~ '^https://'::text
    OR (
      storage_object_id IS NOT NULL
      AND asset_url = '/api/storage/objects/' || storage_object_id::text || '/content?proxy=1'
    )
  );

ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_asset_url_check;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_asset_url_check
  CHECK (
    asset_url IS NULL
    OR asset_url ~ '^https://'::text
    OR (
      storage_object_id IS NOT NULL
      AND asset_url = '/api/storage/objects/' || storage_object_id::text || '/content?proxy=1'
    )
  );
