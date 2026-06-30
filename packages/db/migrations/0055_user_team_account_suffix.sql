ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team_account_suffix text;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_team_account_suffix_format_check;

ALTER TABLE users
  ADD CONSTRAINT users_team_account_suffix_format_check
  CHECK (team_account_suffix IS NULL OR team_account_suffix ~ '^[a-z0-9]{6}$');

CREATE UNIQUE INDEX IF NOT EXISTS users_team_account_suffix_key
  ON users (team_account_suffix)
  WHERE team_account_suffix IS NOT NULL;
