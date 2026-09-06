CREATE TABLE IF NOT EXISTS skill_favorites (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_favorites_unique UNIQUE (skill_id, user_id)
);

CREATE INDEX IF NOT EXISTS skill_favorites_user_idx
  ON skill_favorites (user_id, created_at DESC);
