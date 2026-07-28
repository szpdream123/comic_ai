ALTER TABLE canvas_agent_steps
  DROP CONSTRAINT IF EXISTS canvas_agent_steps_status_check;

ALTER TABLE canvas_agent_steps
  ADD CONSTRAINT canvas_agent_steps_status_check CHECK (status IN (
    'created', 'running', 'waiting_approval', 'waiting_external',
    'succeeded', 'failed', 'canceled', 'skipped',
    'result_unknown', 'manual_review_required'
  ));
