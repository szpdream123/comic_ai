DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'production_agent_conversations'
      AND column_name = 'session_json'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'production_agent_conversations'
      AND column_name = 'workspace_json'
  ) THEN
    ALTER TABLE production_agent_conversations
      RENAME COLUMN session_json TO workspace_json;
  END IF;
END
$$;

ALTER TABLE production_agent_conversations
  ADD COLUMN IF NOT EXISTS workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb;
