CREATE TABLE IF NOT EXISTS prompt_ratings (
  id uuid PRIMARY KEY,
  prompt_id uuid NOT NULL REFERENCES prompts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_ratings_value_check CHECK (rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_ratings_prompt_user_uidx
  ON prompt_ratings (prompt_id, user_id);

INSERT INTO prompt_ratings (id, prompt_id, user_id, rating, created_at, updated_at)
SELECT
  gen_random_uuid(),
  link.prompt_id,
  link.user_id,
  link.rating,
  link.created_at,
  link.updated_at
FROM prompt_user_links link
WHERE link.rating IS NOT NULL
ON CONFLICT (prompt_id, user_id) DO UPDATE
SET rating = EXCLUDED.rating,
    updated_at = EXCLUDED.updated_at;

UPDATE prompts prompt
SET rating_sum = totals.rating_sum,
    rating_count = totals.rating_count
FROM (
  SELECT
    prompt_id,
    COALESCE(sum(rating), 0)::int AS rating_sum,
    count(*)::int AS rating_count
  FROM prompt_ratings
  GROUP BY prompt_id
) totals
WHERE prompt.id = totals.prompt_id;

UPDATE prompts prompt
SET rating_sum = 0,
    rating_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_ratings rating WHERE rating.prompt_id = prompt.id
);

ALTER TABLE prompt_user_links
  DROP CONSTRAINT IF EXISTS prompt_user_links_rating_check;

ALTER TABLE prompt_user_links
  DROP COLUMN IF EXISTS rating;
