CREATE INDEX CONCURRENTLY IF NOT EXISTS provider_requests_task_center_diagnostics_idx
  ON provider_requests (task_id, updated_at DESC, created_at DESC, id DESC)
  WHERE task_id IS NOT NULL
    AND task_center_diagnostics_json IS NOT NULL
    AND task_center_diagnostics_json <> '{}'::jsonb;
