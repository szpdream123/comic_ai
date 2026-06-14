CREATE TABLE IF NOT EXISTS creator_canvas_projects (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  server_revision integer NOT NULL DEFAULT 1 CHECK (server_revision >= 1),
  latest_document_id uuid NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_projects_project_uidx
  ON creator_canvas_projects (organization_id, project_id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_projects_owner_idx
  ON creator_canvas_projects (organization_id, created_by_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_projects_workspace_idx
  ON creator_canvas_projects (organization_id, workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_documents (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version >= 1),
  server_revision integer NOT NULL DEFAULT 1 CHECK (server_revision >= 1),
  document_json jsonb NOT NULL,
  x6_graph_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewport_json jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  node_count integer NOT NULL DEFAULT 0 CHECK (node_count >= 0),
  edge_count integer NOT NULL DEFAULT 0 CHECK (edge_count >= 0),
  content_hash text NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, server_revision),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_canvas_projects_latest_document_fk'
  ) THEN
    ALTER TABLE creator_canvas_projects
      ADD CONSTRAINT creator_canvas_projects_latest_document_fk
      FOREIGN KEY (organization_id, latest_document_id)
      REFERENCES creator_canvas_documents (organization_id, id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS creator_canvas_documents_latest_idx
  ON creator_canvas_documents (organization_id, canvas_project_id, server_revision DESC);

CREATE TABLE IF NOT EXISTS creator_canvas_nodes (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  node_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idle',
  media_kind text NULL,
  source_kind text NULL,
  model_code text NULL,
  position_x numeric NOT NULL DEFAULT 0,
  position_y numeric NOT NULL DEFAULT 0,
  width numeric NOT NULL DEFAULT 360,
  height numeric NOT NULL DEFAULT 240,
  z_index integer NOT NULL DEFAULT 0,
  group_key text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  port_schema_json jsonb NOT NULL DEFAULT '{"inputs":[],"outputs":[]}'::jsonb,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  runtime_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (canvas_project_id, node_key),
  UNIQUE (organization_id, canvas_project_id, node_key),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_nodes_canvas_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, sort_order, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_nodes_type_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, node_type, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_nodes_group_idx
  ON creator_canvas_nodes (organization_id, canvas_project_id, group_key, position_x, position_y)
  WHERE deleted_at IS NULL AND group_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_edges (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  edge_key text NOT NULL,
  source_node_key text NOT NULL,
  source_port_id text NOT NULL,
  target_node_key text NOT NULL,
  target_port_id text NOT NULL,
  edge_kind text NOT NULL DEFAULT 'any',
  status text NOT NULL DEFAULT 'idle',
  router_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  updated_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (canvas_project_id, edge_key),
  UNIQUE (organization_id, canvas_project_id, edge_key),
  UNIQUE (canvas_project_id, source_node_key, source_port_id, target_node_key, target_port_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id, source_node_key)
    REFERENCES creator_canvas_nodes (organization_id, canvas_project_id, node_key),
  FOREIGN KEY (organization_id, canvas_project_id, target_node_key)
    REFERENCES creator_canvas_nodes (organization_id, canvas_project_id, node_key)
);

CREATE INDEX IF NOT EXISTS creator_canvas_edges_source_idx
  ON creator_canvas_edges (organization_id, canvas_project_id, source_node_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_edges_target_idx
  ON creator_canvas_edges (organization_id, canvas_project_id, target_node_key)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_node_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  run_no integer NOT NULL CHECK (run_no >= 1),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (
    status IN ('created', 'queued', 'running', 'succeeded', 'failed', 'canceled', 'result_unknown', 'manual_review_required')
  ),
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'audio', 'text', 'multimodal')),
  model_code text NULL,
  episode_id uuid NULL REFERENCES episodes(id),
  target_type text NULL,
  target_id text NULL,
  composed_prompt_hash text NULL,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_id uuid NULL REFERENCES tasks(id),
  attempt_id uuid NULL REFERENCES task_attempts(id),
  provider_request_id uuid NULL REFERENCES provider_requests(id),
  generation_snapshot_id uuid NULL REFERENCES ai_generation_task_snapshots(id),
  failure_json jsonb NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (canvas_project_id, node_key, run_no),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id, node_key)
    REFERENCES creator_canvas_nodes (organization_id, canvas_project_id, node_key),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES task_attempts (organization_id, id),
  FOREIGN KEY (organization_id, provider_request_id)
    REFERENCES provider_requests (organization_id, id),
  FOREIGN KEY (organization_id, generation_snapshot_id)
    REFERENCES ai_generation_task_snapshots (organization_id, id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_node_runs_node_idx
  ON creator_canvas_node_runs (organization_id, canvas_project_id, node_key, run_no DESC);

CREATE INDEX IF NOT EXISTS creator_canvas_node_runs_task_idx
  ON creator_canvas_node_runs (organization_id, task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_node_artifacts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  node_key text NOT NULL,
  run_id uuid NULL REFERENCES creator_canvas_node_runs(id),
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('image', 'video', 'audio', 'text', 'asset', 'unknown')),
  asset_id uuid NULL REFERENCES assets(id),
  asset_version_id uuid NULL REFERENCES asset_versions(id),
  storage_object_id uuid NULL REFERENCES storage_objects(id),
  url text NULL,
  thumbnail_url text NULL,
  selected boolean NOT NULL DEFAULT false,
  selection_role text NOT NULL DEFAULT 'current',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id, node_key)
    REFERENCES creator_canvas_nodes (organization_id, canvas_project_id, node_key),
  FOREIGN KEY (organization_id, run_id)
    REFERENCES creator_canvas_node_runs (organization_id, id),
  FOREIGN KEY (organization_id, asset_id)
    REFERENCES assets (organization_id, id),
  FOREIGN KEY (organization_id, asset_version_id)
    REFERENCES asset_versions (organization_id, id),
  FOREIGN KEY (organization_id, storage_object_id)
    REFERENCES storage_objects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_node_artifacts_node_idx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, node_key, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_node_artifacts_selected_idx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, selected, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_node_artifacts_selected_role_uidx
  ON creator_canvas_node_artifacts (organization_id, canvas_project_id, node_key, selection_role)
  WHERE deleted_at IS NULL AND selected = true;

CREATE TABLE IF NOT EXISTS creator_canvas_sessions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  user_id uuid NOT NULL REFERENCES users(id),
  viewport_json jsonb NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}'::jsonb,
  selected_node_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_edge_keys_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ui_state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, user_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id)
);

CREATE TABLE IF NOT EXISTS creator_canvas_revisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  server_revision integer NOT NULL CHECK (server_revision >= 1),
  operation text NOT NULL,
  document_json jsonb NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, canvas_project_id, server_revision),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_revisions_canvas_idx
  ON creator_canvas_revisions (organization_id, canvas_project_id, server_revision DESC);

CREATE TABLE IF NOT EXISTS creator_canvas_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id),
  server_revision integer NOT NULL,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_key text NULL,
  patch_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, canvas_project_id)
    REFERENCES creator_canvas_projects (organization_id, id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_events_canvas_idx
  ON creator_canvas_events (organization_id, canvas_project_id, server_revision DESC, created_at DESC);
