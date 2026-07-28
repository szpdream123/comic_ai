CREATE TABLE IF NOT EXISTS creator_canvas_media_derivations (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  derivation_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  base_canvas_revision integer NOT NULL,
  source_asset_id uuid NULL REFERENCES assets(id),
  source_asset_version_id uuid NULL REFERENCES asset_versions(id),
  source_storage_object_id uuid NULL REFERENCES storage_objects(id),
  source_binding_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_id uuid NULL REFERENCES tasks(id),
  output_artifact_id uuid NULL REFERENCES creator_canvas_node_artifacts(id),
  detached_reason text NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT creator_canvas_media_derivations_type_check CHECK (
    derivation_type IN ('crop','outpaint','slice','composite','remove_background','free_view','camera_studio','screenshot')
  ),
  CONSTRAINT creator_canvas_media_derivations_status_check CHECK (
    status IN ('queued','running','succeeded','detached','failed','canceled')
  )
);

CREATE INDEX IF NOT EXISTS creator_canvas_media_derivations_canvas_idx
  ON creator_canvas_media_derivations (canvas_project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS creator_canvas_media_derivations_task_idx
  ON creator_canvas_media_derivations (task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_image_batch_groups (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  source_run_id uuid NULL REFERENCES creator_canvas_node_runs(id),
  status text NOT NULL DEFAULT 'active',
  selected_artifact_id uuid NULL REFERENCES creator_canvas_node_artifacts(id),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_canvas_image_batch_groups_status_check CHECK (status IN ('active','completed','canceled'))
);

CREATE TABLE IF NOT EXISTS creator_canvas_image_batch_items (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES creator_canvas_image_batch_groups(id) ON DELETE CASCADE,
  artifact_id uuid NOT NULL REFERENCES creator_canvas_node_artifacts(id) ON DELETE CASCADE,
  batch_index integer NOT NULL,
  parameters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_canvas_image_batch_items_index_check CHECK (batch_index >= 0),
  CONSTRAINT creator_canvas_image_batch_items_index_uidx UNIQUE (group_id, batch_index),
  CONSTRAINT creator_canvas_image_batch_items_artifact_uidx UNIQUE (group_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS creator_canvas_image_batch_groups_canvas_idx
  ON creator_canvas_image_batch_groups (canvas_project_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS creator_canvas_annotation_layers (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  layer_kind text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source_asset_id uuid NULL REFERENCES assets(id),
  source_asset_version_id uuid NULL REFERENCES asset_versions(id),
  layer_asset_id uuid NULL REFERENCES assets(id),
  layer_asset_version_id uuid NULL REFERENCES asset_versions(id),
  layer_storage_object_id uuid NULL REFERENCES storage_objects(id),
  projection_policy text NOT NULL DEFAULT 'retain',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_canvas_annotation_layers_kind_check CHECK (layer_kind IN ('mask','raster_annotation','vector_annotation')),
  CONSTRAINT creator_canvas_annotation_layers_status_check CHECK (status IN ('active','reprojected','discarded','deleted')),
  CONSTRAINT creator_canvas_annotation_layers_projection_check CHECK (projection_policy IN ('retain','reproject','discard')),
  CONSTRAINT creator_canvas_annotation_layers_reference_check CHECK (
    layer_asset_version_id IS NOT NULL OR layer_storage_object_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS creator_canvas_annotation_layers_node_idx
  ON creator_canvas_annotation_layers (canvas_project_id, node_key, created_at DESC)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS creator_canvas_card_snapshots (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  canvas_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  storage_object_id uuid NULL REFERENCES storage_objects(id),
  width integer NULL,
  height integer NULL,
  error_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT creator_canvas_card_snapshots_status_check CHECK (status IN ('pending','ready','failed')),
  CONSTRAINT creator_canvas_card_snapshots_revision_uidx UNIQUE (canvas_project_id, canvas_revision)
);

CREATE INDEX IF NOT EXISTS creator_canvas_card_snapshots_latest_idx
  ON creator_canvas_card_snapshots (canvas_project_id, canvas_revision DESC, created_at DESC);
