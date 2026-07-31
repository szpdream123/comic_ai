ALTER TABLE canvas_agent_conversations
  ADD COLUMN IF NOT EXISTS shard_id integer NULL;

UPDATE canvas_agent_conversations
SET shard_id = ((hashtextextended(id::text, 0) % 16 + 16) % 16)::integer
WHERE shard_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'canvas_agent_conversations_shard_id_check'
  ) THEN
    ALTER TABLE canvas_agent_conversations
      ADD CONSTRAINT canvas_agent_conversations_shard_id_check
      CHECK (shard_id IS NULL OR shard_id >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS canvas_agent_conversations_shard_idx
  ON canvas_agent_conversations (shard_id, id)
  WHERE shard_id IS NOT NULL;
