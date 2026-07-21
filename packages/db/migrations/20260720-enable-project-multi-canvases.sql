DROP INDEX IF EXISTS creator_canvas_projects_project_uidx;

CREATE INDEX IF NOT EXISTS creator_canvas_projects_project_active_idx
  ON creator_canvas_projects (project_id, created_at, id)
  WHERE deleted_at IS NULL AND project_id IS NOT NULL;
