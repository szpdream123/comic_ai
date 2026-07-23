-- Canvases are account-owned resources. Preserve canvas content while removing
-- the legacy project ownership columns and access paths.
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
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'canvas',
        id,
        jsonb_build_object(
          'projectId', project_id::text,
          'isStandalone', is_standalone
        )
      FROM creator_canvas_projects
      WHERE project_id IS NOT NULL
         OR is_standalone IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_documents'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'canvas_document',
        id,
        jsonb_build_object('projectId', project_id::text)
      FROM creator_canvas_documents
      WHERE project_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'team_member_canvases'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE $sql$
      INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
      SELECT
        'team_member_canvas',
        id,
        jsonb_build_object('projectId', project_id::text)
      FROM team_member_canvases
      WHERE project_id IS NOT NULL
      ON CONFLICT (entity_type, entity_id) DO NOTHING
    $sql$;
  END IF;
END
$audit$;

INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'canvas_document_script_links',
  document.id,
  jsonb_build_object(
    'sourceScriptIds', COALESCE((
      SELECT jsonb_agg(source_id ORDER BY source_id)
      FROM (
        SELECT DISTINCT node->'data'->>'sourceScriptId' AS source_id
        FROM jsonb_array_elements(document.document_json->'nodes') node
        WHERE COALESCE(node->'data'->>'sourceScriptId', '') <> ''
      ) script_ids
    ), '[]'::jsonb),
    'sourceEpisodeIds', COALESCE((
      SELECT jsonb_agg(source_id ORDER BY source_id)
      FROM (
        SELECT DISTINCT node->'data'->>'sourceEpisodeId' AS source_id
        FROM jsonb_array_elements(document.document_json->'nodes') node
        WHERE COALESCE(node->'data'->>'sourceEpisodeId', '') <> ''
      ) episode_ids
    ), '[]'::jsonb)
  )
FROM creator_canvas_documents document
WHERE jsonb_typeof(document.document_json->'nodes') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(document.document_json->'nodes') node
    WHERE node->'data' ? 'sourceScriptId'
       OR node->'data' ? 'sourceEpisodeId'
       OR node->'data'->>'source' IN ('project_script', 'project_script_episode')
  )
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO resource_decoupling_audit (entity_type, entity_id, legacy_links_json)
SELECT
  'canvas_revision_script_links',
  revision.id,
  jsonb_build_object(
    'sourceScriptIds', COALESCE((
      SELECT jsonb_agg(source_id ORDER BY source_id)
      FROM (
        SELECT DISTINCT node->'data'->>'sourceScriptId' AS source_id
        FROM jsonb_array_elements(revision.document_json->'nodes') node
        WHERE COALESCE(node->'data'->>'sourceScriptId', '') <> ''
      ) script_ids
    ), '[]'::jsonb),
    'sourceEpisodeIds', COALESCE((
      SELECT jsonb_agg(source_id ORDER BY source_id)
      FROM (
        SELECT DISTINCT node->'data'->>'sourceEpisodeId' AS source_id
        FROM jsonb_array_elements(revision.document_json->'nodes') node
        WHERE COALESCE(node->'data'->>'sourceEpisodeId', '') <> ''
      ) episode_ids
    ), '[]'::jsonb)
  )
FROM creator_canvas_revisions revision
WHERE jsonb_typeof(revision.document_json->'nodes') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(revision.document_json->'nodes') node
    WHERE node->'data' ? 'sourceScriptId'
       OR node->'data' ? 'sourceEpisodeId'
       OR node->'data'->>'source' IN ('project_script', 'project_script_episode')
  )
ON CONFLICT (entity_type, entity_id) DO NOTHING;

UPDATE creator_canvas_documents document
SET document_json = jsonb_set(
  document.document_json,
  '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(node->'data') = 'object' THEN
          jsonb_set(
            node,
            '{data}',
            ((node->'data') - ARRAY['sourceScriptId', 'sourceEpisodeId']::text[])
              || CASE
                WHEN node->'data'->>'source' IN ('project_script', 'project_script_episode')
                  THEN jsonb_build_object('source', 'manual_copy')
                ELSE '{}'::jsonb
              END,
            true
          )
        ELSE node
      END
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(document.document_json->'nodes') WITH ORDINALITY AS nodes(node, ordinal)
  ),
  true
)
WHERE jsonb_typeof(document.document_json->'nodes') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(document.document_json->'nodes') node
    WHERE node->'data' ? 'sourceScriptId'
       OR node->'data' ? 'sourceEpisodeId'
       OR node->'data'->>'source' IN ('project_script', 'project_script_episode')
  );

UPDATE creator_canvas_revisions revision
SET document_json = jsonb_set(
  revision.document_json,
  '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN jsonb_typeof(node->'data') = 'object' THEN
          jsonb_set(
            node,
            '{data}',
            ((node->'data') - ARRAY['sourceScriptId', 'sourceEpisodeId']::text[])
              || CASE
                WHEN node->'data'->>'source' IN ('project_script', 'project_script_episode')
                  THEN jsonb_build_object('source', 'manual_copy')
                ELSE '{}'::jsonb
              END,
            true
          )
        ELSE node
      END
      ORDER BY ordinal
    )
    FROM jsonb_array_elements(revision.document_json->'nodes') WITH ORDINALITY AS nodes(node, ordinal)
  ),
  true
)
WHERE jsonb_typeof(revision.document_json->'nodes') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(revision.document_json->'nodes') node
    WHERE node->'data' ? 'sourceScriptId'
       OR node->'data' ? 'sourceEpisodeId'
       OR node->'data'->>'source' IN ('project_script', 'project_script_episode')
  );

UPDATE creator_canvas_documents document
SET document_json = jsonb_set(
  COALESCE(document.document_json, '{}'::jsonb) - 'projectId'::text,
  '{canvasProjectId}',
  to_jsonb(document.canvas_project_id::text),
  true
)
WHERE document.document_json IS NOT NULL;

UPDATE creator_canvas_revisions revision
SET document_json = jsonb_set(
  COALESCE(revision.document_json, '{}'::jsonb) - 'projectId'::text,
  '{canvasProjectId}',
  to_jsonb(revision.canvas_project_id::text),
  true
)
WHERE revision.document_json IS NOT NULL;

ALTER TABLE creator_canvas_documents
  DROP CONSTRAINT IF EXISTS creator_canvas_documents_project_id_fkey;

ALTER TABLE creator_canvas_projects
  DROP CONSTRAINT IF EXISTS creator_canvas_projects_project_id_fkey;

ALTER TABLE team_member_canvases
  DROP CONSTRAINT IF EXISTS team_member_canvases_project_id_fkey;

DROP INDEX IF EXISTS creator_canvas_projects_project_active_idx;
DROP INDEX IF EXISTS team_member_canvases_user_project_idx;

ALTER TABLE creator_canvas_documents DROP COLUMN IF EXISTS project_id;
ALTER TABLE creator_canvas_projects DROP COLUMN IF EXISTS project_id;
ALTER TABLE creator_canvas_projects DROP COLUMN IF EXISTS is_standalone;
ALTER TABLE team_member_canvases DROP COLUMN IF EXISTS project_id;

CREATE INDEX IF NOT EXISTS creator_canvas_projects_user_created_idx
  ON creator_canvas_projects (created_by_user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS team_member_canvases_member_idx
  ON team_member_canvases (member_id, created_at DESC);
