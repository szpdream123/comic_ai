CREATE TABLE IF NOT EXISTS admin_secret_values (
  id uuid PRIMARY KEY,
  secret_ref text NOT NULL UNIQUE,
  secret_key text NOT NULL UNIQUE,
  secret_value text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  provider_name text NULL,
  status text NOT NULL DEFAULT 'configured',
  last_checked_at timestamptz NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('configured', 'missing', 'unknown')),
  CHECK (btrim(secret_value) <> '')
);

CREATE INDEX IF NOT EXISTS admin_secret_values_status_key_idx
  ON admin_secret_values (status, secret_key);

INSERT INTO admin_secret_values (
  id,
  secret_ref,
  secret_key,
  secret_value,
  purpose,
  provider_name,
  status,
  last_checked_at,
  created_by_admin_id,
  created_at,
  updated_at
)
SELECT
  id,
  secret_ref,
  env_name,
  secret_value,
  purpose,
  provider_name,
  CASE
    WHEN secret_value IS NOT NULL AND btrim(secret_value) <> '' THEN 'configured'
    ELSE 'missing'
  END,
  last_checked_at,
  created_by_admin_id,
  created_at,
  updated_at
FROM admin_secret_references
WHERE secret_value IS NOT NULL
  AND btrim(secret_value) <> ''
ON CONFLICT (secret_key)
DO UPDATE SET
  secret_ref = EXCLUDED.secret_ref,
  secret_value = EXCLUDED.secret_value,
  purpose = EXCLUDED.purpose,
  provider_name = EXCLUDED.provider_name,
  status = EXCLUDED.status,
  last_checked_at = EXCLUDED.last_checked_at,
  updated_at = EXCLUDED.updated_at;
