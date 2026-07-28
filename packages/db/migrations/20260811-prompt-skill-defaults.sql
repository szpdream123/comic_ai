CREATE TABLE prompt_official_defaults (
  prompt_category text PRIMARY KEY,
  prompt_id uuid NOT NULL UNIQUE REFERENCES prompts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_official_defaults_category_check CHECK (
    prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract', 'image_style', 'storyboard', 'other')
  )
);

CREATE TABLE prompt_user_defaults (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_category text NOT NULL,
  prompt_id uuid NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prompt_category),
  CONSTRAINT prompt_user_defaults_category_check CHECK (
    prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract', 'image_style', 'storyboard', 'other')
  )
);

CREATE INDEX prompt_user_defaults_prompt_idx
  ON prompt_user_defaults (prompt_id, user_id);

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
WHERE position = 1;
