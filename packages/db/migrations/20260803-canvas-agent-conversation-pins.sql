ALTER TABLE canvas_agent_conversations
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS canvas_agent_conversations_pinned_idx
  ON canvas_agent_conversations (canvas_id, owner_user_id, actor_team_member_id, pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;
