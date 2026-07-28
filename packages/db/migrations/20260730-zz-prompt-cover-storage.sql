ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS cover_storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prompts_cover_storage_object_idx
  ON prompts (cover_storage_object_id)
  WHERE cover_storage_object_id IS NOT NULL;
