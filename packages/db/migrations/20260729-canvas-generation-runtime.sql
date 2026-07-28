ALTER TABLE creator_canvas_node_runs
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_node_runs_history_cursor_idx
  ON creator_canvas_node_runs (canvas_project_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_generation_batches (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  principal_key text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  total_items integer NOT NULL,
  succeeded_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  canceled_items integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  canceled_at timestamptz NULL,
  CONSTRAINT creator_canvas_generation_batches_status_check CHECK (
    status IN ('created', 'running', 'cancel_requested', 'succeeded', 'partial', 'failed', 'canceled')
  ),
  CONSTRAINT creator_canvas_generation_batches_principal_idempotency_uidx
    UNIQUE (canvas_project_id, principal_key, idempotency_key),
  CONSTRAINT creator_canvas_generation_batches_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS creator_canvas_generation_batch_items (
  id uuid PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES creator_canvas_generation_batches(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  media_kind text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  depends_on_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_id uuid NULL REFERENCES tasks(id),
  credit_reservation_id uuid NULL REFERENCES credit_reservations(id),
  credit_allocation_id uuid NULL REFERENCES credit_reservation_allocations(id),
  failure_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT creator_canvas_generation_batch_items_status_check CHECK (
    status IN ('pending', 'dispatching', 'queued', 'running', 'cancel_requested',
               'succeeded', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT creator_canvas_generation_batch_items_batch_node_uidx UNIQUE (batch_id, node_key)
);

CREATE INDEX IF NOT EXISTS creator_canvas_generation_batches_canvas_idx
  ON creator_canvas_generation_batches (canvas_project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS creator_canvas_generation_batch_items_ready_idx
  ON creator_canvas_generation_batch_items (batch_id, status, sort_order, id);
CREATE INDEX IF NOT EXISTS creator_canvas_generation_batch_items_task_idx
  ON creator_canvas_generation_batch_items (task_id)
  WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS creator_canvas_upload_fingerprints (
  id uuid PRIMARY KEY,
  canvas_project_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  fingerprint text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reused_at timestamptz NOT NULL DEFAULT now(),
  reuse_count integer NOT NULL DEFAULT 0,
  CONSTRAINT creator_canvas_upload_fingerprints_hash_check CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT creator_canvas_upload_fingerprints_size_check CHECK (size_bytes >= 0),
  CONSTRAINT creator_canvas_upload_fingerprints_scope_uidx
    UNIQUE (canvas_project_id, fingerprint, content_type, size_bytes)
);

CREATE INDEX IF NOT EXISTS creator_canvas_upload_fingerprints_storage_idx
  ON creator_canvas_upload_fingerprints (storage_object_id);
