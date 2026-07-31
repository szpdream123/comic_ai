CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_failed_image_submission_active_repair_idx
  ON tasks (updated_at, id)
  WHERE task_type = 'episode_generate_image'
    AND status IN ('running', 'result_unknown')
    AND input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http');
