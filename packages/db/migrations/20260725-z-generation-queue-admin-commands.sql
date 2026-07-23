CREATE TABLE IF NOT EXISTS generation_queue_admin_commands (
  id uuid PRIMARY KEY,
  admin_account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  resource_key text NOT NULL,
  queue_name text NOT NULL,
  job_id text NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  request_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  checkpoint_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  result_json jsonb,
  status text DEFAULT 'pending' NOT NULL,
  locked_by text,
  locked_until timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT generation_queue_admin_commands_action_check
    CHECK (action IN ('retry', 'promote', 'remove', 'replay')),
  CONSTRAINT generation_queue_admin_commands_status_check
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed_retryable', 'failed_terminal')),
  CONSTRAINT generation_queue_admin_commands_idempotency_unique
    UNIQUE (admin_account_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS generation_queue_admin_commands_due_idx
  ON generation_queue_admin_commands (status, locked_until, created_at)
  WHERE status IN ('pending', 'processing', 'failed_retryable');

CREATE INDEX IF NOT EXISTS generation_queue_admin_commands_resource_idx
  ON generation_queue_admin_commands (resource_key, status, locked_until);
