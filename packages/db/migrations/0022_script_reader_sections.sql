CREATE TABLE IF NOT EXISTS script_reader_sections (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  script_id uuid NULL REFERENCES scripts(id),
  episode_id uuid NULL REFERENCES episodes(id),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  sequence integer NOT NULL CHECK (sequence >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'archived')),
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, project_id, sequence),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, script_id)
    REFERENCES scripts (organization_id, id),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id)
);

CREATE INDEX IF NOT EXISTS script_reader_sections_project_idx
  ON script_reader_sections (organization_id, project_id, sequence ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS script_reader_sections_script_idx
  ON script_reader_sections (organization_id, script_id, sequence ASC)
  WHERE script_id IS NOT NULL;
