CREATE TABLE IF NOT EXISTS project_upload_records (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  storage_object_id uuid NULL REFERENCES storage_objects(id),
  upload_session_id uuid NULL REFERENCES storage_upload_sessions(id),
  actor_user_id uuid NULL REFERENCES users(id),
  actor_display_name text NULL,
  actor_phone_e164 text NULL,
  project_name text NULL,
  page_key text NOT NULL,
  page_url text NULL,
  source_action text NOT NULL,
  file_name text NOT NULL,
  object_key text NULL,
  bucket text NULL,
  provider text NULL,
  content_type text NULL,
  size_bytes bigint NULL CHECK (size_bytes IS NULL OR size_bytes >= 0),
  public_url text NULL,
  status text NOT NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, storage_object_id)
    REFERENCES storage_objects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS project_upload_records_project_idx
  ON project_upload_records (organization_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_upload_records_actor_idx
  ON project_upload_records (organization_id, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_upload_records_status_idx
  ON project_upload_records (status, created_at DESC);
