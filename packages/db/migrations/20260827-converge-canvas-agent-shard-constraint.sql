UPDATE canvas_agent_conversations
SET shard_id = ((hashtextextended(id::text, 0) % 16 + 16) % 16)::integer
WHERE shard_id IS NULL;

DO $$
DECLARE
  target_table regclass := to_regclass(current_schema() || '.canvas_agent_conversations');
BEGIN
  IF target_table IS NULL THEN
    RAISE EXCEPTION 'canvas_agent_conversations table is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = target_table
      AND conname = 'canvas_agent_conversations_shard_id_check'
      AND pg_get_constraintdef(oid, true) <> 'CHECK (shard_id IS NULL OR shard_id >= 0)'
  ) THEN
    ALTER TABLE canvas_agent_conversations
      DROP CONSTRAINT canvas_agent_conversations_shard_id_check;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = target_table
      AND conname = 'canvas_agent_conversations_shard_id_check'
  ) THEN
    ALTER TABLE canvas_agent_conversations
      ADD CONSTRAINT canvas_agent_conversations_shard_id_check
      CHECK (shard_id IS NULL OR shard_id >= 0) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE canvas_agent_conversations
  VALIDATE CONSTRAINT canvas_agent_conversations_shard_id_check;
