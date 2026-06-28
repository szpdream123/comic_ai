CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  member_account text NOT NULL,
  member_account_suffix text NOT NULL,
  member_login_account text NOT NULL UNIQUE,
  member_name text NOT NULL,
  member_password_hash text NOT NULL,
  member_credits integer NOT NULL DEFAULT 0 CHECK (member_credits >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
  disabled_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (member_account ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  CHECK (member_account_suffix ~ '^[a-z0-9][a-z0-9_-]{5,31}$'),
  CHECK (member_login_account = member_account || '@' || member_account_suffix),
  UNIQUE (user_id, member_account),
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS team_members_user_idx
  ON team_members (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS team_members_login_account_idx
  ON team_members (member_login_account);

CREATE TABLE IF NOT EXISTS team_member_projects (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, project_id),
  FOREIGN KEY (member_id, user_id)
    REFERENCES team_members (id, user_id)
);

CREATE INDEX IF NOT EXISTS team_member_projects_member_idx
  ON team_member_projects (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_projects_user_project_idx
  ON team_member_projects (user_id, project_id);
