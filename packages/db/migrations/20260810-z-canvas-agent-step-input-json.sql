ALTER TABLE canvas_agent_steps
  ADD COLUMN IF NOT EXISTS input_json jsonb NOT NULL DEFAULT '{}'::jsonb;
