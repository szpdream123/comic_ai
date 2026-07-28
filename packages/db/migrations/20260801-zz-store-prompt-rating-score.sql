ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS rating_score numeric(3, 2) NOT NULL DEFAULT 5.00;

UPDATE prompts prompt
SET rating_score = totals.rating_score,
    rating_count = totals.rating_count
FROM (
  SELECT
    prompt_id,
    round(avg(rating)::numeric, 2) AS rating_score,
    count(*)::int AS rating_count
  FROM prompt_ratings
  GROUP BY prompt_id
) totals
WHERE prompt.id = totals.prompt_id;

UPDATE prompts prompt
SET rating_score = 5.00,
    rating_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_ratings rating WHERE rating.prompt_id = prompt.id
);

ALTER TABLE prompts
  DROP CONSTRAINT IF EXISTS prompts_rating_check;

ALTER TABLE prompts
  DROP COLUMN IF EXISTS rating_sum;

ALTER TABLE prompts
  DROP CONSTRAINT IF EXISTS prompts_rating_score_check;

ALTER TABLE prompts
  ADD CONSTRAINT prompts_rating_score_check CHECK (rating_score BETWEEN 1 AND 5);
