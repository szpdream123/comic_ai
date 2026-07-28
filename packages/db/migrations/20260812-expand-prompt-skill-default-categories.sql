ALTER TABLE prompt_official_defaults
  DROP CONSTRAINT prompt_official_defaults_category_check;

ALTER TABLE prompt_official_defaults
  ADD CONSTRAINT prompt_official_defaults_category_check CHECK (
    prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract', 'image_style', 'storyboard', 'other')
  );

ALTER TABLE prompt_user_defaults
  DROP CONSTRAINT prompt_user_defaults_category_check;

ALTER TABLE prompt_user_defaults
  ADD CONSTRAINT prompt_user_defaults_category_check CHECK (
    prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract', 'image_style', 'storyboard', 'other')
  );

WITH ranked_defaults AS (
  SELECT
    prompt_category,
    id AS prompt_id,
    row_number() OVER (
      PARTITION BY prompt_category
      ORDER BY updated_at DESC, id ASC
    ) AS position
  FROM prompts
  WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract', 'image_style', 'storyboard', 'other')
    AND is_official = true
    AND status = 'enabled'
    AND is_published = true
    AND deleted_at IS NULL
)
INSERT INTO prompt_official_defaults (prompt_category, prompt_id)
SELECT prompt_category, prompt_id
FROM ranked_defaults
WHERE position = 1
ON CONFLICT (prompt_category) DO NOTHING;
