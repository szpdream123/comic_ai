DROP INDEX IF EXISTS creator_canvas_projects_project_uidx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'creator_canvas_projects'
      AND column_name = 'project_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS creator_canvas_projects_project_active_idx
      ON creator_canvas_projects (project_id, created_at, id)
      WHERE deleted_at IS NULL AND project_id IS NOT NULL';
  END IF;
END;
$$;
