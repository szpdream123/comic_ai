ALTER TABLE IF EXISTS team_member_profiles
  ADD COLUMN IF NOT EXISTS script_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS canvas_ids text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS team_member_scripts (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  project_id uuid NULL REFERENCES projects(id),
  script_id uuid NOT NULL REFERENCES scripts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, script_id),
  FOREIGN KEY (member_id, user_id)
    REFERENCES team_members (id, user_id)
);

CREATE INDEX IF NOT EXISTS team_member_scripts_member_idx
  ON team_member_scripts (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_scripts_user_project_idx
  ON team_member_scripts (user_id, project_id, script_id);

CREATE TABLE IF NOT EXISTS team_member_canvases (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  project_id uuid NULL REFERENCES projects(id),
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, canvas_id),
  FOREIGN KEY (member_id, user_id)
    REFERENCES team_members (id, user_id)
);

CREATE INDEX IF NOT EXISTS team_member_canvases_member_idx
  ON team_member_canvases (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_canvases_user_project_idx
  ON team_member_canvases (user_id, project_id, canvas_id);
