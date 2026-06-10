ALTER TABLE scripts
  ADD COLUMN IF NOT EXISTS title text NULL,
  ADD COLUMN IF NOT EXISTS cover_image_url text NULL,
  ADD COLUMN IF NOT EXISTS cover_storage_object_id uuid NULL REFERENCES storage_objects(id),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS scripts_active_project_idx
  ON scripts (organization_id, project_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
