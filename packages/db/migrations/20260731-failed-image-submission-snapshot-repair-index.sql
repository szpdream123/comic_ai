CREATE INDEX CONCURRENTLY IF NOT EXISTS generation_snapshots_failed_image_submission_repair_idx
  ON ai_generation_task_snapshots (updated_at, task_id)
  WHERE status IN ('queued', 'running', 'result_unknown');
