ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_status_check,
  ADD CONSTRAINT users_status_check
    CHECK (status IN ('active', 'disabled', 'archived'));

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check,
  ADD CONSTRAINT memberships_status_check
    CHECK (status IN ('active', 'invited', 'disabled', 'archived'));

CREATE TABLE IF NOT EXISTS admin_accounts (
  id uuid PRIMARY KEY,
  user_id uuid NULL REFERENCES users(id),
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz NULL,
  remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('active', 'disabled', 'archived'))
);

ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL;

CREATE INDEX IF NOT EXISTS admin_accounts_status_login_idx
  ON admin_accounts (status, login_name);

CREATE TABLE IF NOT EXISTS admin_account_roles (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
  role_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_account_id, role_code),
  CHECK (role_code IN (
    'super_admin',
    'ops_admin',
    'model_admin',
    'finance_admin',
    'support_admin',
    'audit_viewer'
  ))
);

CREATE INDEX IF NOT EXISTS admin_account_roles_account_idx
  ON admin_account_roles (admin_account_id, role_code);

CREATE TABLE IF NOT EXISTS admin_auth_sessions (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
  session_token_hash text NOT NULL UNIQUE,
  ip_address text NULL,
  user_agent text NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_auth_sessions_account_expiry_idx
  ON admin_auth_sessions (admin_account_id, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS runtime_config_entries (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  value_type text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  description text NULL,
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (value_type IN ('string', 'number', 'boolean', 'json', 'string_array')),
  CHECK (scope IN ('global', 'admin', 'creator', 'model', 'billing', 'risk'))
);

CREATE TABLE IF NOT EXISTS runtime_config_revisions (
  id uuid PRIMARY KEY,
  config_key text NOT NULL,
  previous_value_json jsonb NULL,
  next_value_json jsonb NOT NULL,
  changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_config_revisions_key_created_idx
  ON runtime_config_revisions (config_key, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_secret_references (
  id uuid PRIMARY KEY,
  secret_ref text NOT NULL UNIQUE,
  env_name text NOT NULL UNIQUE,
  purpose text NOT NULL,
  provider_name text NULL,
  status text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('configured', 'missing', 'unknown'))
);

CREATE INDEX IF NOT EXISTS admin_secret_references_env_status_idx
  ON admin_secret_references (env_name, status);

CREATE TABLE IF NOT EXISTS ai_model_config_revisions (
  id uuid PRIMARY KEY,
  model_config_id uuid NOT NULL REFERENCES ai_model_configs(id),
  snapshot_json jsonb NOT NULL,
  changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_model_config_revisions_model_created_idx
  ON ai_model_config_revisions (model_config_id, created_at DESC);
