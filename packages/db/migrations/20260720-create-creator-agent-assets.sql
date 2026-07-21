CREATE TABLE IF NOT EXISTS creator_agent_assets (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  agent_type text NOT NULL DEFAULT 'director',
  instructions text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_agent_assets_type_check CHECK (agent_type = 'director'),
  CONSTRAINT creator_agent_assets_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT creator_agent_assets_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT creator_agent_assets_description_check CHECK (length(description) <= 1000),
  CONSTRAINT creator_agent_assets_instructions_check CHECK (length(instructions) <= 20000)
);

CREATE INDEX IF NOT EXISTS creator_agent_assets_admin_updated_idx
  ON creator_agent_assets (admin_user_id, updated_at DESC, id DESC)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS creator_agent_assets_admin_name_uidx
  ON creator_agent_assets (admin_user_id, lower(btrim(name)))
  WHERE status = 'active';
