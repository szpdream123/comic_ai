CREATE TABLE IF NOT EXISTS user_model_request_logs (
  id uuid PRIMARY KEY,
  provider_request_id uuid NOT NULL REFERENCES provider_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL REFERENCES workspaces(id),
  project_id uuid NULL REFERENCES projects(id),
  workflow_id uuid NULL REFERENCES workflows(id),
  task_id uuid NULL REFERENCES tasks(id),
  attempt_id uuid NULL REFERENCES task_attempts(id),
  user_id uuid NULL REFERENCES users(id),
  provider_name text NOT NULL,
  provider_operation text NOT NULL,
  model_id text NOT NULL,
  provider_model text NOT NULL,
  request_key text NOT NULL,
  request_hash text NOT NULL,
  payload_hash text NOT NULL,
  payload_summary text NULL,
  request_format text NOT NULL DEFAULT 'openai_chat_completions',
  request_body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_text text NULL,
  response_text text NULL,
  response_usage_json jsonb NULL,
  response_finish_reasons_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL CHECK (
    status IN ('created', 'submitted', 'succeeded', 'failed', 'canceled')
  ),
  failure_code text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_request_id),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES task_attempts (organization_id, id)
);

CREATE INDEX IF NOT EXISTS user_model_request_logs_user_created_idx
  ON user_model_request_logs (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_model_request_logs_org_created_idx
  ON user_model_request_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_model_request_logs_provider_request_idx
  ON user_model_request_logs (provider_request_id);
