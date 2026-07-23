CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_user_updated_task_idx
  ON ai_generation_task_snapshots (user_id, updated_at DESC, task_id DESC);

CREATE INDEX IF NOT EXISTS provider_requests_creator_updated_id_idx
  ON provider_requests (created_by_user_id, updated_at DESC, id DESC);
