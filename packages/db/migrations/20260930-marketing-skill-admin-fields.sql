ALTER TABLE marketing_generation_skills
  ADD COLUMN IF NOT EXISTS uploaded_file_name text NULL,
  ADD COLUMN IF NOT EXISTS content_sha256 text NULL;

CREATE INDEX IF NOT EXISTS marketing_generation_skills_kind_status_name_idx
  ON marketing_generation_skills (skill_kind, status, name);
