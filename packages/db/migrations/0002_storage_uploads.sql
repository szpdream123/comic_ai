ALTER TABLE storage_objects
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS etag text NULL,
  ADD COLUMN IF NOT EXISTS version_id text NULL,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS storage_objects_status_idx
  ON storage_objects (status, created_at DESC);

ALTER TABLE asset_versions
  ADD COLUMN IF NOT EXISTS storage_object_id uuid NULL REFERENCES storage_objects(id);

CREATE INDEX IF NOT EXISTS asset_versions_storage_object_idx
  ON asset_versions (storage_object_id)
  WHERE storage_object_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS storage_upload_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id),
  purpose text NOT NULL,
  status text NOT NULL,
  content_type text NOT NULL,
  expected_size_bytes bigint NULL CHECK (expected_size_bytes IS NULL OR expected_size_bytes >= 0),
  original_file_name text NOT NULL,
  checksum text NULL,
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, created_by_user_id, idempotency_key),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, storage_object_id)
    REFERENCES storage_objects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS storage_upload_sessions_scope_idx
  ON storage_upload_sessions (organization_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_upload_sessions_status_idx
  ON storage_upload_sessions (status, expires_at ASC);
