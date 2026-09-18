ALTER TABLE skill_categories
  ADD COLUMN IF NOT EXISTS allow_user_create boolean NOT NULL DEFAULT true;

UPDATE skill_categories
SET allow_user_create = false
WHERE code IN ('recommended', 'project-workflow');
