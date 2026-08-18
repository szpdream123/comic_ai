-- Marketing runs use the existing generation and storage infrastructure, which
-- requires a real product user as resource owner. This is configuration only;
-- project ownership remains on marketing_projects.owner_user_id.
CREATE TABLE IF NOT EXISTS marketing_execution_owner_bindings (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL UNIQUE REFERENCES admin_accounts(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  configured_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_execution_owner_bindings_owner_idx
  ON marketing_execution_owner_bindings (owner_user_id);
