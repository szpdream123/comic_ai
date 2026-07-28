ALTER TABLE team_assets
  ADD COLUMN IF NOT EXISTS storage_object_id uuid;

ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_storage_object_id_fkey;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_storage_object_id_fkey
  FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS team_assets_storage_object_uidx
  ON team_assets (storage_object_id)
  WHERE storage_object_id IS NOT NULL;
