DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass(current_schema() || '.production_agent_conversations')
      AND conname = 'production_agent_conversations_session_json_not_null'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass(current_schema() || '.production_agent_conversations')
      AND conname = 'production_agent_conversations_workspace_json_not_null'
  ) THEN
    ALTER TABLE production_agent_conversations
      RENAME CONSTRAINT production_agent_conversations_session_json_not_null
      TO production_agent_conversations_workspace_json_not_null;
  END IF;
END
$$;
