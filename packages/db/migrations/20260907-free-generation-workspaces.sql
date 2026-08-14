ALTER TABLE creator_canvas_projects
  ADD COLUMN IF NOT EXISTS is_free_generation_workspace boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_projects_free_generation_workspace_owner_idx
  ON creator_canvas_projects (created_by_user_id)
  WHERE is_free_generation_workspace = true AND deleted_at IS NULL;
