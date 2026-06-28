CREATE TABLE IF NOT EXISTS team_member_auth_sessions (
  id uuid PRIMARY KEY,
  auth_session_id uuid NOT NULL REFERENCES auth_sessions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  member_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auth_session_id),
  FOREIGN KEY (member_id, user_id)
    REFERENCES team_members (id, user_id)
);

CREATE INDEX IF NOT EXISTS team_member_auth_sessions_member_idx
  ON team_member_auth_sessions (user_id, member_id, status, expires_at);

CREATE TABLE IF NOT EXISTS team_member_project_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  member_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES projects(id),
  record_type text NOT NULL,
  record_status text NOT NULL DEFAULT 'recorded'
    CHECK (record_status IN ('recorded', 'running', 'succeeded', 'failed')),
  record_title text NOT NULL,
  record_detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table text NULL,
  source_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (member_id, user_id)
    REFERENCES team_members (id, user_id),
  FOREIGN KEY (member_id, project_id)
    REFERENCES team_member_projects (member_id, project_id)
);

CREATE INDEX IF NOT EXISTS team_member_project_records_member_idx
  ON team_member_project_records (user_id, member_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_project_records_project_idx
  ON team_member_project_records (user_id, project_id, created_at DESC);
