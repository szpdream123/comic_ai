CREATE INDEX IF NOT EXISTS canvas_agent_tasks_queue_idx
  ON canvas_agent_tasks (created_at, id)
  WHERE status = 'queued'
     OR (status = 'cancel_requested' AND lease_owner IS NULL);

CREATE INDEX IF NOT EXISTS canvas_agent_tasks_waiting_external_idx
  ON canvas_agent_tasks (updated_at, id)
  INCLUDE (current_step_id, conversation_id)
  WHERE status = 'waiting_external';
