CREATE TABLE IF NOT EXISTS resource_decoupling_audit (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  legacy_links_json jsonb NOT NULL,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

DO $audit$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_node_runs'
      AND column_name = 'episode_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'canvas_node_run',
        id,
        jsonb_build_object('episodeId', episode_id::text)
      FROM creator_canvas_node_runs
      WHERE episode_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;
END
$audit$;

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE task_attempts ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE ai_generation_task_snapshots ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE provider_requests ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE storage_objects ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE assets ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE credit_reservations ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE project_upload_records ADD COLUMN IF NOT EXISTS canvas_project_id uuid;
ALTER TABLE user_model_request_logs ADD COLUMN IF NOT EXISTS canvas_project_id uuid;

ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_canvas_project_id_fkey;
ALTER TABLE workflows ADD CONSTRAINT workflows_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_single_owner_scope_check;
ALTER TABLE workflows ADD CONSTRAINT workflows_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_canvas_project_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_single_owner_scope_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE task_attempts DROP CONSTRAINT IF EXISTS task_attempts_canvas_project_id_fkey;
ALTER TABLE task_attempts ADD CONSTRAINT task_attempts_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE task_attempts DROP CONSTRAINT IF EXISTS task_attempts_single_owner_scope_check;
ALTER TABLE task_attempts ADD CONSTRAINT task_attempts_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE ai_generation_task_snapshots DROP CONSTRAINT IF EXISTS generation_snapshots_canvas_project_fkey;
ALTER TABLE ai_generation_task_snapshots ADD CONSTRAINT generation_snapshots_canvas_project_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE ai_generation_task_snapshots DROP CONSTRAINT IF EXISTS generation_snapshots_single_owner_scope_check;
ALTER TABLE ai_generation_task_snapshots ADD CONSTRAINT generation_snapshots_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE provider_requests DROP CONSTRAINT IF EXISTS provider_requests_canvas_project_id_fkey;
ALTER TABLE provider_requests ADD CONSTRAINT provider_requests_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE provider_requests DROP CONSTRAINT IF EXISTS provider_requests_single_owner_scope_check;
ALTER TABLE provider_requests ADD CONSTRAINT provider_requests_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_canvas_project_id_fkey;
ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE storage_objects DROP CONSTRAINT IF EXISTS storage_objects_single_owner_scope_check;
ALTER TABLE storage_objects ADD CONSTRAINT storage_objects_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_canvas_project_id_fkey;
ALTER TABLE assets ADD CONSTRAINT assets_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_single_owner_scope_check;
ALTER TABLE assets ADD CONSTRAINT assets_single_owner_scope_check
  CHECK (
    (project_id IS NOT NULL AND canvas_project_id IS NULL)
    OR (project_id IS NULL AND canvas_project_id IS NOT NULL)
  );

ALTER TABLE credit_reservations DROP CONSTRAINT IF EXISTS credit_reservations_canvas_project_id_fkey;
ALTER TABLE credit_reservations ADD CONSTRAINT credit_reservations_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE credit_reservations DROP CONSTRAINT IF EXISTS credit_reservations_single_owner_scope_check;
ALTER TABLE credit_reservations ADD CONSTRAINT credit_reservations_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE project_upload_records DROP CONSTRAINT IF EXISTS project_upload_records_canvas_project_id_fkey;
ALTER TABLE project_upload_records ADD CONSTRAINT project_upload_records_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE project_upload_records DROP CONSTRAINT IF EXISTS project_upload_records_single_owner_scope_check;
ALTER TABLE project_upload_records ADD CONSTRAINT project_upload_records_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE user_model_request_logs DROP CONSTRAINT IF EXISTS user_model_request_logs_canvas_project_id_fkey;
ALTER TABLE user_model_request_logs ADD CONSTRAINT user_model_request_logs_canvas_project_id_fkey
  FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);
ALTER TABLE user_model_request_logs DROP CONSTRAINT IF EXISTS user_model_request_logs_single_owner_scope_check;
ALTER TABLE user_model_request_logs ADD CONSTRAINT user_model_request_logs_single_owner_scope_check
  CHECK (project_id IS NULL OR canvas_project_id IS NULL);

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM creator_canvas_node_runs
    WHERE task_id IS NOT NULL
    GROUP BY task_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_runs run
    JOIN tasks task ON task.id = run.task_id
    WHERE run.task_id IS NOT NULL
    GROUP BY task.workflow_id
    HAVING count(DISTINCT run.canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_runs
    WHERE attempt_id IS NOT NULL
    GROUP BY attempt_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_runs
    WHERE provider_request_id IS NOT NULL
    GROUP BY provider_request_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_runs
    WHERE generation_snapshot_id IS NOT NULL
    GROUP BY generation_snapshot_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_artifacts
    WHERE storage_object_id IS NOT NULL
    GROUP BY storage_object_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) OR EXISTS (
    SELECT 1
    FROM creator_canvas_node_artifacts
    WHERE asset_id IS NOT NULL
    GROUP BY asset_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous_canvas_generation_scope';
  END IF;
END
$migration$;

WITH task_scope AS (
  SELECT task_id, min(canvas_project_id::text)::uuid AS canvas_project_id
  FROM creator_canvas_node_runs
  WHERE task_id IS NOT NULL
  GROUP BY task_id
)
UPDATE tasks task
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL,
    target_entity_type = 'canvas',
    target_entity_id = scope.canvas_project_id
FROM task_scope scope
WHERE task.id = scope.task_id;

WITH workflow_scope AS (
  SELECT task.workflow_id, min(task.canvas_project_id::text)::uuid AS canvas_project_id
  FROM tasks task
  WHERE task.canvas_project_id IS NOT NULL
  GROUP BY task.workflow_id
  HAVING count(DISTINCT task.canvas_project_id) = 1
)
UPDATE workflows workflow
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL
FROM workflow_scope scope
WHERE workflow.id = scope.workflow_id;

UPDATE task_attempts attempt
SET canvas_project_id = task.canvas_project_id,
    project_id = NULL
FROM tasks task
WHERE task.id = attempt.task_id
  AND task.canvas_project_id IS NOT NULL;

WITH snapshot_scope AS (
  SELECT snapshot.id, task.canvas_project_id
  FROM ai_generation_task_snapshots snapshot
  JOIN tasks task ON task.id = snapshot.task_id
  WHERE task.canvas_project_id IS NOT NULL
)
UPDATE ai_generation_task_snapshots snapshot
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL,
    episode_id = NULL,
    target_type = 'canvas',
    target_id = scope.canvas_project_id
FROM snapshot_scope scope
WHERE snapshot.id = scope.id;

WITH request_scope AS (
  SELECT request.id, task.canvas_project_id
  FROM provider_requests request
  JOIN tasks task ON task.id = request.task_id
  WHERE task.canvas_project_id IS NOT NULL
)
UPDATE provider_requests request
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL
FROM request_scope scope
WHERE request.id = scope.id;

UPDATE credit_reservations reservation
SET canvas_project_id = task.canvas_project_id,
    project_id = NULL
FROM tasks task
WHERE task.id = reservation.task_id
  AND task.canvas_project_id IS NOT NULL;

UPDATE credit_reservations reservation
SET canvas_project_id = workflow.canvas_project_id,
    project_id = NULL
FROM workflows workflow
WHERE workflow.id = reservation.workflow_id
  AND workflow.canvas_project_id IS NOT NULL
  AND reservation.canvas_project_id IS NULL;

UPDATE user_model_request_logs request_log
SET canvas_project_id = request.canvas_project_id,
    project_id = NULL
FROM provider_requests request
WHERE request.id = request_log.provider_request_id
  AND request.canvas_project_id IS NOT NULL;

WITH storage_scope AS (
  SELECT storage_object_id, min(canvas_project_id::text)::uuid AS canvas_project_id
  FROM creator_canvas_node_artifacts
  WHERE storage_object_id IS NOT NULL
  GROUP BY storage_object_id
)
UPDATE storage_objects object
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL
FROM storage_scope scope
WHERE object.id = scope.storage_object_id;

DO $document_storage_scope$
BEGIN
  IF EXISTS (
    WITH raw_reference AS (
      SELECT document.canvas_project_id, value
      FROM creator_canvas_documents document
      CROSS JOIN LATERAL jsonb_path_query(document.document_json, '$.**.storageObjectId') value
      UNION ALL
      SELECT revision.canvas_project_id, value
      FROM creator_canvas_revisions revision
      CROSS JOIN LATERAL jsonb_path_query(revision.document_json, '$.**.storageObjectId') value
    ), valid_reference AS (
      SELECT DISTINCT canvas_project_id, (value #>> '{}')::uuid AS storage_object_id
      FROM raw_reference
      WHERE jsonb_typeof(value) = 'string'
        AND (value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    SELECT 1
    FROM valid_reference
    GROUP BY storage_object_id
    HAVING count(DISTINCT canvas_project_id) > 1
  ) THEN
    RAISE EXCEPTION 'ambiguous_canvas_document_storage_scope';
  END IF;

  IF EXISTS (
    WITH raw_reference AS (
      SELECT document.canvas_project_id, value
      FROM creator_canvas_documents document
      CROSS JOIN LATERAL jsonb_path_query(document.document_json, '$.**.storageObjectId') value
      UNION ALL
      SELECT revision.canvas_project_id, value
      FROM creator_canvas_revisions revision
      CROSS JOIN LATERAL jsonb_path_query(revision.document_json, '$.**.storageObjectId') value
    ), valid_reference AS (
      SELECT DISTINCT canvas_project_id, (value #>> '{}')::uuid AS storage_object_id
      FROM raw_reference
      WHERE jsonb_typeof(value) = 'string'
        AND (value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    SELECT 1
    FROM valid_reference reference
    JOIN storage_objects object ON object.id = reference.storage_object_id
    WHERE object.canvas_project_id IS NOT NULL
      AND object.canvas_project_id <> reference.canvas_project_id
  ) THEN
    RAISE EXCEPTION 'conflicting_canvas_document_storage_scope';
  END IF;
END
$document_storage_scope$;

WITH raw_reference AS (
  SELECT document.canvas_project_id, value
  FROM creator_canvas_documents document
  CROSS JOIN LATERAL jsonb_path_query(document.document_json, '$.**.storageObjectId') value
  UNION ALL
  SELECT revision.canvas_project_id, value
  FROM creator_canvas_revisions revision
  CROSS JOIN LATERAL jsonb_path_query(revision.document_json, '$.**.storageObjectId') value
), valid_reference AS (
  SELECT DISTINCT canvas_project_id, (value #>> '{}')::uuid AS storage_object_id
  FROM raw_reference
  WHERE jsonb_typeof(value) = 'string'
    AND (value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'canvas_storage_object',
  object.id,
  jsonb_build_object(
    'projectId', object.project_id::text,
    'canvasProjectId', reference.canvas_project_id::text,
    'source', 'canvas_document_or_revision'
  )
FROM valid_reference reference
JOIN storage_objects object ON object.id = reference.storage_object_id
WHERE object.project_id IS NOT NULL
  AND object.canvas_project_id IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

WITH raw_reference AS (
  SELECT document.canvas_project_id, value
  FROM creator_canvas_documents document
  CROSS JOIN LATERAL jsonb_path_query(document.document_json, '$.**.storageObjectId') value
  UNION ALL
  SELECT revision.canvas_project_id, value
  FROM creator_canvas_revisions revision
  CROSS JOIN LATERAL jsonb_path_query(revision.document_json, '$.**.storageObjectId') value
), valid_reference AS (
  SELECT DISTINCT canvas_project_id, (value #>> '{}')::uuid AS storage_object_id
  FROM raw_reference
  WHERE jsonb_typeof(value) = 'string'
    AND (value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
UPDATE storage_objects object
SET canvas_project_id = reference.canvas_project_id,
    project_id = NULL
FROM valid_reference reference
WHERE object.id = reference.storage_object_id
  AND object.project_id IS NOT NULL
  AND object.canvas_project_id IS NULL;

UPDATE project_upload_records upload_record
SET canvas_project_id = object.canvas_project_id,
    project_id = NULL
FROM storage_objects object
WHERE object.id = upload_record.storage_object_id
  AND object.canvas_project_id IS NOT NULL;

WITH asset_scope AS (
  SELECT asset_id, min(canvas_project_id::text)::uuid AS canvas_project_id
  FROM creator_canvas_node_artifacts
  WHERE asset_id IS NOT NULL
  GROUP BY asset_id
)
UPDATE assets asset
SET canvas_project_id = scope.canvas_project_id,
    project_id = NULL
FROM asset_scope scope
WHERE asset.id = scope.asset_id;

ALTER TABLE creator_canvas_node_runs
  DROP CONSTRAINT IF EXISTS creator_canvas_node_runs_episode_id_fkey;
ALTER TABLE creator_canvas_node_runs DROP COLUMN IF EXISTS episode_id;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      DELETE FROM team_member_projects assignment
      USING creator_canvas_projects canvas, team_member_canvases canvas_assignment
      WHERE canvas.is_standalone = true
        AND canvas.project_id = assignment.project_id
        AND canvas_assignment.canvas_id = canvas.id
        AND canvas_assignment.member_id = assignment.member_id
        AND canvas_assignment.user_id = assignment.user_id
    $sql$;
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS workflows_canvas_created_idx
  ON workflows (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_canvas_status_idx
  ON tasks (canvas_project_id, status, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS generation_snapshots_canvas_created_idx
  ON ai_generation_task_snapshots (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS provider_requests_canvas_created_idx
  ON provider_requests (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS storage_objects_canvas_created_idx
  ON storage_objects (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS assets_canvas_created_idx
  ON assets (canvas_project_id, asset_type, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS assets_canvas_type_key_uidx
  ON assets (canvas_project_id, asset_type, asset_key)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS credit_reservations_canvas_created_idx
  ON credit_reservations (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_upload_records_canvas_created_idx
  ON project_upload_records (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_model_request_logs_canvas_created_idx
  ON user_model_request_logs (canvas_project_id, created_at DESC)
  WHERE canvas_project_id IS NOT NULL;
