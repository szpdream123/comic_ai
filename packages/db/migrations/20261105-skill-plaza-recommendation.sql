ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

UPDATE skills
SET is_recommended = true,
    category = CASE WHEN category = 'recommended' THEN 'general' ELSE category END
WHERE category = 'recommended' OR is_recommended = true;

CREATE INDEX IF NOT EXISTS skills_recommended_catalog_idx
  ON skills (status, visibility, is_recommended, usage_count DESC, updated_at DESC)
  WHERE is_recommended = true;
