ALTER TABLE provider_requests
  ADD COLUMN IF NOT EXISTS created_by_admin_id uuid NULL;

ALTER TABLE provider_requests
  DROP CONSTRAINT IF EXISTS provider_requests_created_by_admin_id_fkey;

ALTER TABLE provider_requests
  ADD CONSTRAINT provider_requests_created_by_admin_id_fkey
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE user_model_request_logs
  ADD COLUMN IF NOT EXISTS admin_account_id uuid NULL;

ALTER TABLE user_model_request_logs
  DROP CONSTRAINT IF EXISTS user_model_request_logs_admin_account_id_fkey;

ALTER TABLE user_model_request_logs
  ADD CONSTRAINT user_model_request_logs_admin_account_id_fkey
  FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id);

CREATE TABLE IF NOT EXISTS marketing_agent_provider_approvals (
  id uuid PRIMARY KEY,
  provider_name text NOT NULL,
  model_code text NOT NULL,
  stage text NOT NULL,
  approval_reference text NOT NULL,
  data_classifications_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_input_paths_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  approved_at timestamptz NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_agent_provider_approvals_stage_check
    CHECK (stage IN ('strategy', 'copy', 'compliance')),
  CONSTRAINT marketing_agent_provider_approvals_status_check
    CHECK (status IN ('draft', 'approved', 'disabled')),
  CONSTRAINT marketing_agent_provider_approvals_reference_check
    CHECK (btrim(approval_reference) <> ''),
  CONSTRAINT marketing_agent_provider_approvals_unique
    UNIQUE (provider_name, model_code, stage)
);

CREATE INDEX IF NOT EXISTS marketing_agent_provider_approvals_active_idx
  ON marketing_agent_provider_approvals (stage, model_code)
  WHERE status = 'approved';
