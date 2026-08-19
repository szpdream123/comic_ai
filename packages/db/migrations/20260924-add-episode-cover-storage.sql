ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_storage_object_id uuid;

ALTER TABLE episodes
  DROP CONSTRAINT IF EXISTS episodes_cover_storage_object_id_fkey;

ALTER TABLE episodes
  ADD CONSTRAINT episodes_cover_storage_object_id_fkey
  FOREIGN KEY (cover_storage_object_id) REFERENCES storage_objects(id);

CREATE INDEX IF NOT EXISTS episodes_cover_storage_object_idx
  ON episodes (cover_storage_object_id)
  WHERE cover_storage_object_id IS NOT NULL;
