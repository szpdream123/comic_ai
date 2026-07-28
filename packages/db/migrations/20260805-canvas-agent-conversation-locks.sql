CREATE TABLE IF NOT EXISTS canvas_agent_conversation_locks (
  conversation_id uuid PRIMARY KEY REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL,
  lease_expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS canvas_agent_conversation_locks_expiry_idx
  ON canvas_agent_conversation_locks (lease_expires_at);
