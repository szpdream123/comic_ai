-- Scripts are user-owned resources. Preserve script and reader content while
-- removing the legacy project/episode ownership columns.
CREATE TABLE IF NOT EXISTS resource_decoupling_audit (
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  legacy_links_json jsonb NOT NULL,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

DO $capture_shells$
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
$capture_shells$;

DO $preserve_script_assignments$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'team_member_scripts'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'imported_script_team_assignment',
        assignment.id,
        jsonb_build_object(
          'projectId', assignment.project_id::text,
          'scriptId', shell.legacy_links_json->>'scriptId',
          'memberId', assignment.member_id::text,
          'action', 'copied_to_direct_script_assignment'
        )
      FROM team_member_projects assignment
      JOIN resource_decoupling_audit shell
        ON shell.entity_type = 'imported_script_project_shell'
       AND shell.entity_id = assignment.project_id
      WHERE NOT EXISTS (
        SELECT 1
        FROM team_member_scripts direct_assignment
        WHERE direct_assignment.member_id = assignment.member_id
          AND direct_assignment.script_id = (shell.legacy_links_json->>'scriptId')::uuid
      )
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;

    EXECUTE $sql$
      INSERT INTO team_member_scripts (
        id,
        member_id,
        user_id,
        project_id,
        script_id,
        created_at
      )
      SELECT
        md5(assignment.id::text || ':' || (shell.legacy_links_json->>'scriptId'))::uuid,
        assignment.member_id,
        assignment.user_id,
        assignment.project_id,
        (shell.legacy_links_json->>'scriptId')::uuid,
        assignment.created_at
      FROM team_member_projects assignment
      JOIN resource_decoupling_audit shell
        ON shell.entity_type = 'imported_script_project_shell'
       AND shell.entity_id = assignment.project_id
      ON CONFLICT (member_id, script_id) DO NOTHING
    $sql$;
  END IF;
END
$preserve_script_assignments$;

DO $audit$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scripts'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'script',
        id,
        jsonb_build_object('projectId', project_id::text)
      FROM scripts
      WHERE project_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'script_reader_sections'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'script_section',
        id,
        jsonb_build_object(
          'projectId', project_id::text,
          'episodeId', episode_id::text
        )
      FROM script_reader_sections
      WHERE project_id IS NOT NULL
         OR episode_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'team_member_scripts'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'team_member_script',
        id,
        jsonb_build_object('projectId', project_id::text)
      FROM team_member_scripts
      WHERE project_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;
END
$audit$;

ALTER TABLE scripts ADD COLUMN IF NOT EXISTS owner_user_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'scripts'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      UPDATE scripts script
      SET owner_user_id = project.owner_user_id
      FROM projects project
      WHERE script.project_id = project.id
        AND script.owner_user_id IS NULL
    $sql$;
  END IF;
END;
$$;

UPDATE scripts
SET owner_user_id = created_by_user_id
WHERE owner_user_id IS NULL
  AND created_by_user_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM scripts WHERE owner_user_id IS NULL) THEN
    RAISE EXCEPTION 'scripts_owner_user_id_backfill_incomplete';
  END IF;
END;
$$;

ALTER TABLE scripts
  ALTER COLUMN owner_user_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'script_reader_sections'
      AND column_name = 'project_id'
  ) THEN
    IF EXISTS (SELECT 1 FROM script_reader_sections WHERE script_id IS NULL) THEN
      RAISE EXCEPTION 'script_reader_sections_script_id_backfill_incomplete';
    END IF;
  END IF;
END;
$$;

ALTER TABLE script_reader_sections
  DROP CONSTRAINT IF EXISTS script_reader_sections_project_id_fkey,
  DROP CONSTRAINT IF EXISTS script_reader_sections_episode_id_fkey;

ALTER TABLE scripts
  DROP CONSTRAINT IF EXISTS scripts_project_id_fkey;

ALTER TABLE team_member_scripts
  DROP CONSTRAINT IF EXISTS team_member_scripts_project_id_fkey;

DROP INDEX IF EXISTS script_reader_sections_project_sequence_uidx;
DROP INDEX IF EXISTS script_reader_sections_script_sequence_idx;
DROP INDEX IF EXISTS scripts_project_active_idx;
DROP INDEX IF EXISTS team_member_scripts_user_project_idx;

ALTER TABLE script_reader_sections
  DROP COLUMN IF EXISTS project_id,
  DROP COLUMN IF EXISTS episode_id,
  ALTER COLUMN script_id SET NOT NULL;

ALTER TABLE scripts
  DROP COLUMN IF EXISTS project_id;

ALTER TABLE team_member_scripts
  DROP COLUMN IF EXISTS project_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scripts_owner_user_id_fkey'
      AND conrelid = 'scripts'::regclass
  ) THEN
    ALTER TABLE scripts
      ADD CONSTRAINT scripts_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES users(id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS script_reader_sections_script_sequence_uidx
  ON script_reader_sections (script_id, sequence);

CREATE INDEX IF NOT EXISTS scripts_owner_active_idx
  ON scripts (owner_user_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS team_member_scripts_user_script_idx
  ON team_member_scripts (user_id, script_id);

INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'imported_script_storage_object',
  object.id,
  jsonb_build_object(
    'projectId', object.project_id::text,
    'scriptId', shell.legacy_links_json->>'scriptId'
  )
FROM storage_objects object
JOIN resource_decoupling_audit shell
  ON shell.entity_type = 'imported_script_project_shell'
 AND shell.entity_id = object.project_id
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'imported_script_upload_session',
  session.id,
  jsonb_build_object(
    'projectId', session.project_id::text,
    'scriptId', shell.legacy_links_json->>'scriptId'
  )
FROM storage_upload_sessions session
JOIN resource_decoupling_audit shell
  ON shell.entity_type = 'imported_script_project_shell'
 AND shell.entity_id = session.project_id
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'imported_script_upload_record',
  upload_record.id,
  jsonb_build_object(
    'projectId', upload_record.project_id::text,
    'scriptId', shell.legacy_links_json->>'scriptId'
  )
FROM project_upload_records upload_record
JOIN resource_decoupling_audit shell
  ON shell.entity_type = 'imported_script_project_shell'
 AND shell.entity_id = upload_record.project_id
ON CONFLICT (entity_type, entity_id) DO NOTHING;

UPDATE storage_objects object
SET project_id = NULL
FROM resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND object.project_id = shell.entity_id;

UPDATE storage_upload_sessions session
SET project_id = NULL
FROM resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND session.project_id = shell.entity_id;

UPDATE project_upload_records upload_record
SET project_id = NULL
FROM resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND upload_record.project_id = shell.entity_id;

UPDATE audit_events event
SET project_id = NULL
FROM resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND event.project_id = shell.entity_id;

DELETE FROM team_member_project_records record
USING resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND record.project_id = shell.entity_id;

DELETE FROM team_member_projects assignment
USING resource_decoupling_audit shell
WHERE shell.entity_type = 'imported_script_project_shell'
  AND assignment.project_id = shell.entity_id;

DO $cleanup_shells$
DECLARE
  reference_row record;
  unsafe_count bigint;
BEGIN
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
      'SELECT count(*) FROM %I.%I referenced JOIN resource_decoupling_audit shell ON shell.entity_type = ''imported_script_project_shell'' AND referenced.%I = shell.entity_id',
      reference_row.table_schema,
      reference_row.table_name,
      reference_row.column_name
    ) INTO unsafe_count;

    IF unsafe_count > 0 THEN
      RAISE EXCEPTION 'imported_script_project_shell_contains_business_content:%', reference_row.table_name;
    END IF;
  END LOOP;

  DELETE FROM projects project
  USING resource_decoupling_audit shell
  WHERE shell.entity_type = 'imported_script_project_shell'
    AND project.id = shell.entity_id;
END
$cleanup_shells$;
