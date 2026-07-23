-- Remove only the synthetic project/episode shells historically created for
-- standalone canvas runs. Canvas content and generation records must already
-- be rebound by 20260722-canvas-generation-scope.sql.
CREATE TABLE IF NOT EXISTS resource_decoupling_audit (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  legacy_links_json jsonb NOT NULL,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- Capture imported-script shells while both legacy script and canvas project
-- links still exist. The script migration removes the shell only after its
-- project_id columns have been dropped and all remaining FKs have been checked.
DO $capture_script_shells$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scripts'
      AND column_name = 'project_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'imported_script_project_shell',
        project.id,
        jsonb_build_object(
          'projectId', project.id::text,
          'scriptId', script.id::text,
          'action', 'synthetic_shell_removed'
        )
      FROM projects project
      JOIN scripts script
        ON script.project_id = project.id
       AND script.deleted_at IS NULL
       AND script.title IS NOT NULL
      WHERE project.phase = 'script_input'
        AND project.name = script.title
        AND project.cover_image_url IS NULL
        AND project.cover_storage_object_id IS NULL
        AND (
          SELECT count(*)
          FROM scripts candidate_script
          WHERE candidate_script.project_id = project.id
            AND candidate_script.deleted_at IS NULL
        ) = 1
        AND NOT EXISTS (SELECT 1 FROM episodes row WHERE row.project_id = project.id)
        AND NOT EXISTS (SELECT 1 FROM shots row WHERE row.project_id = project.id)
        AND NOT EXISTS (SELECT 1 FROM assets row WHERE row.project_id = project.id)
        AND NOT EXISTS (SELECT 1 FROM workflows row WHERE row.project_id = project.id)
        AND NOT EXISTS (
          SELECT 1
          FROM creator_canvas_projects row
          WHERE row.project_id = project.id
        )
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;
END
$capture_script_shells$;

DO $cleanup$
DECLARE
  unsafe_count bigint;
  reference_row record;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'project_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'is_standalone'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE TEMP TABLE standalone_canvas_project_shells ON COMMIT DROP AS
    SELECT project.id AS project_id
    FROM projects project
    WHERE project.name LIKE '画布生成 - %'
      AND EXISTS (
        SELECT 1
        FROM creator_canvas_projects canvas
        WHERE canvas.project_id = project.id
      )
  $sql$;

  IF NOT EXISTS (SELECT 1 FROM standalone_canvas_project_shells) THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    SELECT count(*)
    FROM standalone_canvas_project_shells shell
    JOIN projects project ON project.id = shell.project_id
    WHERE project.phase <> 'shot_generation'
       OR project.cover_storage_object_id IS NOT NULL
       OR (
         SELECT count(*)
         FROM creator_canvas_projects canvas
         WHERE canvas.project_id = shell.project_id
       ) <> 1
       OR (
         SELECT count(*)
         FROM episodes episode
         WHERE episode.project_id = shell.project_id
       ) <> 1
       OR (
         SELECT count(*)
         FROM episodes episode
         WHERE episode.project_id = shell.project_id
           AND episode.title = '画布生成'
       ) <> 1
  $sql$ INTO unsafe_count;

  IF unsafe_count > 0 THEN
    RAISE EXCEPTION 'standalone_canvas_project_shell_shape_invalid';
  END IF;

  EXECUTE $sql$
    UPDATE workflows workflow
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE workflow.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE tasks task
    SET canvas_project_id = canvas.id,
        project_id = NULL,
        target_entity_type = 'canvas',
        target_entity_id = canvas.id
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE task.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE task_attempts attempt
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE attempt.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE ai_generation_task_snapshots snapshot
    SET canvas_project_id = canvas.id,
        project_id = NULL,
        episode_id = NULL,
        target_type = 'canvas',
        target_id = canvas.id
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE snapshot.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE provider_requests request
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE request.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE storage_objects object
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE object.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE assets asset
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE asset.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE credit_reservations reservation
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE reservation.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE project_upload_records upload_record
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE upload_record.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE user_model_request_logs request_log
    SET canvas_project_id = canvas.id,
        project_id = NULL
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    WHERE request_log.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    SELECT count(*)
    FROM standalone_canvas_project_shells shell
    WHERE EXISTS (SELECT 1 FROM workflows row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM tasks row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM task_attempts row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM ai_generation_task_snapshots row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM provider_requests row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM storage_objects row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM assets row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM credit_reservations row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM project_upload_records row WHERE row.project_id = shell.project_id)
       OR EXISTS (SELECT 1 FROM user_model_request_logs row WHERE row.project_id = shell.project_id)
  $sql$ INTO unsafe_count;

  IF unsafe_count > 0 THEN
    RAISE EXCEPTION 'standalone_canvas_generation_scope_incomplete';
  END IF;

  EXECUTE $sql$
    INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
    SELECT
      'canvas',
      canvas.id,
      jsonb_build_object(
        'projectId', canvas.project_id::text,
        'isStandalone', canvas.is_standalone
      )
    FROM creator_canvas_projects canvas
    JOIN standalone_canvas_project_shells shell ON shell.project_id = canvas.project_id
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  $sql$;

  EXECUTE $sql$
    INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
    SELECT
      'canvas_document',
      document.id,
      jsonb_build_object('projectId', document.project_id::text)
    FROM creator_canvas_documents document
    JOIN standalone_canvas_project_shells shell ON shell.project_id = document.project_id
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  $sql$;

  EXECUTE $sql$
    INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
    SELECT
      'team_member_canvas',
      assignment.id,
      jsonb_build_object('projectId', assignment.project_id::text)
    FROM team_member_canvases assignment
    JOIN standalone_canvas_project_shells shell ON shell.project_id = assignment.project_id
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  $sql$;

  EXECUTE $sql$
    INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
    SELECT
      'standalone_canvas_project_shell',
      shell.project_id,
      jsonb_build_object(
        'canvasProjectId', canvas.id::text,
        'episodeId', episode.id::text,
        'action', 'synthetic_shell_removed'
      )
    FROM standalone_canvas_project_shells shell
    JOIN creator_canvas_projects canvas ON canvas.project_id = shell.project_id
    JOIN episodes episode ON episode.project_id = shell.project_id
    ON CONFLICT (entity_type, entity_id) DO NOTHING
  $sql$;

  UPDATE audit_events event
  SET project_id = NULL
  FROM standalone_canvas_project_shells shell
  WHERE event.project_id = shell.project_id;

  DELETE FROM team_member_project_records record
  USING standalone_canvas_project_shells shell
  WHERE record.project_id = shell.project_id;

  DELETE FROM team_member_projects assignment
  USING standalone_canvas_project_shells shell
  WHERE assignment.project_id = shell.project_id;

  EXECUTE $sql$
    UPDATE creator_canvas_documents document
    SET project_id = NULL
    FROM standalone_canvas_project_shells shell
    WHERE document.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE team_member_canvases assignment
    SET project_id = NULL
    FROM standalone_canvas_project_shells shell
    WHERE assignment.project_id = shell.project_id
  $sql$;

  EXECUTE $sql$
    UPDATE creator_canvas_projects canvas
    SET project_id = NULL
    FROM standalone_canvas_project_shells shell
    WHERE canvas.project_id = shell.project_id
  $sql$;

  DELETE FROM episodes episode
  USING standalone_canvas_project_shells shell
  WHERE episode.project_id = shell.project_id
    AND episode.title = '画布生成';

  FOR reference_row IN
    SELECT
      namespace.nspname AS table_schema,
      relation.relname AS table_name,
      attribute.attname AS column_name
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN unnest(constraint_record.conkey) WITH ORDINALITY key_column(attnum, ordinal) ON true
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_record.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE constraint_record.contype = 'f'
      AND constraint_record.confrelid = 'projects'::regclass
      AND array_length(constraint_record.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I referenced JOIN standalone_canvas_project_shells shell ON referenced.%I = shell.project_id',
      reference_row.table_schema,
      reference_row.table_name,
      reference_row.column_name
    ) INTO unsafe_count;

    IF unsafe_count > 0 THEN
      RAISE EXCEPTION 'standalone_canvas_project_shell_contains_business_content:%', reference_row.table_name;
    END IF;
  END LOOP;

  DELETE FROM projects project
  USING standalone_canvas_project_shells shell
  WHERE project.id = shell.project_id;
END
$cleanup$;

UPDATE workflows
SET input_snapshot_json = jsonb_set(
  input_snapshot_json - 'projectId'::text - 'episodeId'::text,
  '{canvasProjectId}',
  to_jsonb(canvas_project_id::text),
  true
)
WHERE canvas_project_id IS NOT NULL
  AND jsonb_typeof(input_snapshot_json) = 'object';

UPDATE tasks
SET input_snapshot_json = jsonb_set(
  input_snapshot_json - 'projectId'::text - 'episodeId'::text,
  '{canvasProjectId}',
  to_jsonb(canvas_project_id::text),
  true
)
WHERE canvas_project_id IS NOT NULL
  AND jsonb_typeof(input_snapshot_json) = 'object';

UPDATE ai_generation_task_snapshots
SET request_summary_json = jsonb_set(
  request_summary_json - 'projectId'::text - 'episodeId'::text,
  '{canvasProjectId}',
  to_jsonb(canvas_project_id::text),
  true
)
WHERE canvas_project_id IS NOT NULL
  AND jsonb_typeof(request_summary_json) = 'object';

UPDATE creator_canvas_node_runs
SET input_snapshot_json = jsonb_set(
      input_snapshot_json - 'projectId'::text - 'episodeId'::text,
      '{canvasProjectId}',
      to_jsonb(canvas_project_id::text),
      true
    ),
    output_snapshot_json = jsonb_set(
      output_snapshot_json - 'projectId'::text - 'episodeId'::text,
      '{canvasProjectId}',
      to_jsonb(canvas_project_id::text),
      true
    )
WHERE canvas_project_id IS NOT NULL
  AND jsonb_typeof(input_snapshot_json) = 'object'
  AND jsonb_typeof(output_snapshot_json) = 'object';
