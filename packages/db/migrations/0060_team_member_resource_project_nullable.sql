ALTER TABLE IF EXISTS team_member_scripts
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE IF EXISTS team_member_canvases
  ALTER COLUMN project_id DROP NOT NULL;
