ALTER TABLE team_assets
  ADD COLUMN IF NOT EXISTS folder_name text NOT NULL DEFAULT '';

ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_folder_name_length_check;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_folder_name_length_check
  CHECK (char_length(folder_name) <= 64);

CREATE INDEX IF NOT EXISTS team_assets_admin_folder_idx
  ON team_assets (admin_user_id, folder_name, asset_status, updated_at DESC);
