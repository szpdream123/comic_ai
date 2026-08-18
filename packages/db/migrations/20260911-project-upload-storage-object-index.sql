CREATE INDEX CONCURRENTLY IF NOT EXISTS project_upload_records_storage_object_created_id_idx
  ON project_upload_records (storage_object_id, created_at DESC, id DESC);
