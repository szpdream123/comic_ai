-- Project source text belongs to the project workflow, not to the independent
-- script library. Backfill legacy untitled project inputs before project_id is
-- removed from scripts by the following migration.

CREATE TABLE IF NOT EXISTS project_source_documents (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'parsed'::text, 'failed'::text])),
  input_text text NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS project_source_documents_project_uidx
  ON project_source_documents (project_id);

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
      INSERT INTO project_source_documents (
        id,
        project_id,
        status,
        input_text,
        created_by_user_id,
        created_at,
        updated_at
      )
      SELECT
        script.id,
        script.project_id,
        script.status,
        script.input_text,
        COALESCE(script.created_by_user_id, project.created_by_user_id, project.owner_user_id),
        script.created_at,
        script.updated_at
      FROM scripts script
      JOIN projects project ON project.id = script.project_id
      WHERE script.title IS NULL
        AND script.deleted_at IS NULL
      ON CONFLICT (project_id) DO NOTHING
    $sql$;
  END IF;
END;
$$;
