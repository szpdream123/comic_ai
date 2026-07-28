ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_style_code text;

UPDATE projects
SET project_style_code = 'animation'
WHERE project_style_code IS NULL OR btrim(project_style_code) = '';

ALTER TABLE projects
  ALTER COLUMN project_style_code SET DEFAULT 'animation',
  ALTER COLUMN project_style_code SET NOT NULL;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_style_code_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_project_style_code_check
  CHECK (project_style_code ~ '^[a-z0-9_-]+$');
