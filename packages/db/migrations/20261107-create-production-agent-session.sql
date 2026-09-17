CREATE TABLE IF NOT EXISTS production_agent_conversations (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  mode text NOT NULL DEFAULT 'ask',
  model_code text NOT NULL DEFAULT '',
  source_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  skill_catalog_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  workspace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_project_id uuid NULL REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT production_agent_conversations_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT production_agent_conversations_mode_check
    CHECK (mode IN ('ask', 'auto'))
);

CREATE INDEX IF NOT EXISTS production_agent_conversations_owner_idx
  ON production_agent_conversations (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS production_agent_tasks (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES production_agent_conversations(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  workflow_task_id uuid NOT NULL REFERENCES tasks(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  model_code text NOT NULL,
  model_config_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step_id uuid NULL,
  event_sequence bigint NOT NULL DEFAULT 0,
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT production_agent_tasks_mode_check CHECK (mode IN ('ask', 'auto')),
  CONSTRAINT production_agent_tasks_status_check CHECK (status IN (
    'queued', 'running', 'waiting_approval', 'paused',
    'succeeded', 'failed', 'canceled'
  )),
  CONSTRAINT production_agent_tasks_workflow_task_unique UNIQUE (workflow_task_id)
);

CREATE INDEX IF NOT EXISTS production_agent_tasks_conversation_idx
  ON production_agent_tasks (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS production_agent_steps (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES production_agent_tasks(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  tool_id text NULL,
  call_id text NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT production_agent_steps_status_check CHECK (status IN (
    'created', 'running', 'waiting_approval', 'succeeded', 'failed', 'canceled'
  )),
  CONSTRAINT production_agent_steps_task_number_unique UNIQUE (task_id, step_no)
);

ALTER TABLE production_agent_tasks
  DROP CONSTRAINT IF EXISTS production_agent_tasks_current_step_id_fkey;
ALTER TABLE production_agent_tasks
  ADD CONSTRAINT production_agent_tasks_current_step_id_fkey
  FOREIGN KEY (current_step_id) REFERENCES production_agent_steps(id);

CREATE TABLE IF NOT EXISTS production_agent_events (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES production_agent_tasks(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_agent_events_task_sequence_unique UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS production_agent_events_resume_idx
  ON production_agent_events (task_id, sequence ASC);

CREATE TABLE IF NOT EXISTS production_agent_approvals (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES production_agent_tasks(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES production_agent_steps(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  tool_id text NOT NULL,
  reason text NOT NULL DEFAULT '',
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_agent_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  CONSTRAINT production_agent_approvals_step_unique UNIQUE (step_id)
);

CREATE TABLE IF NOT EXISTS production_agent_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES production_agent_conversations(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES production_agent_tasks(id) ON DELETE SET NULL,
  sequence bigint NOT NULL,
  role text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_agent_messages_role_check
    CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  CONSTRAINT production_agent_messages_conversation_sequence_unique
    UNIQUE (conversation_id, sequence)
);
