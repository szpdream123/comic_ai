ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cover_storage_object_id uuid NULL REFERENCES storage_objects(id);

CREATE INDEX IF NOT EXISTS projects_cover_storage_object_idx
  ON projects (cover_storage_object_id)
  WHERE cover_storage_object_id IS NOT NULL;
