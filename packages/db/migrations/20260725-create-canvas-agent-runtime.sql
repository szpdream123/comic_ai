CREATE TABLE IF NOT EXISTS canvas_agent_conversations (
  id uuid PRIMARY KEY,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT canvas_agent_conversations_status_check
    CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS canvas_agent_conversations_canvas_idx
  ON canvas_agent_conversations (canvas_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS canvas_agent_tasks (
  id uuid PRIMARY KEY,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflows(id),
  workflow_task_id uuid NOT NULL REFERENCES tasks(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  model_code text NOT NULL,
  model_config_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  budget_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step_id uuid NULL,
  base_revision integer NOT NULL,
  event_sequence bigint NOT NULL DEFAULT 0,
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  heartbeat_at timestamptz NULL,
  failure_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT canvas_agent_tasks_mode_check CHECK (mode IN ('b', 'c', 'plan', 'expert')),
  CONSTRAINT canvas_agent_tasks_status_check CHECK (status IN (
    'queued', 'running', 'waiting_approval', 'waiting_external', 'paused',
    'succeeded', 'failed', 'cancel_requested', 'canceled',
    'result_unknown', 'manual_review_required'
  )),
  CONSTRAINT canvas_agent_tasks_workflow_task_unique UNIQUE (workflow_task_id)
);

CREATE INDEX IF NOT EXISTS canvas_agent_tasks_conversation_idx
  ON canvas_agent_tasks (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS canvas_agent_tasks_repair_idx
  ON canvas_agent_tasks (status, lease_expires_at)
  WHERE status IN ('running', 'cancel_requested');

CREATE TABLE IF NOT EXISTS canvas_agent_steps (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES canvas_agent_tasks(id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'created',
  tool_id text NULL,
  call_id text NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_fingerprint text NOT NULL,
  effect text NOT NULL,
  approval_id uuid NULL,
  provider_request_id uuid NULL REFERENCES provider_requests(id),
  generation_task_id uuid NULL REFERENCES tasks(id),
  credit_reservation_id uuid NULL REFERENCES credit_reservations(id),
  checkpoint_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary text NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT canvas_agent_steps_status_check CHECK (status IN (
    'created', 'running', 'waiting_approval', 'waiting_external',
    'succeeded', 'failed', 'canceled', 'result_unknown', 'manual_review_required'
  )),
  CONSTRAINT canvas_agent_steps_task_number_unique UNIQUE (task_id, step_no),
  CONSTRAINT canvas_agent_steps_task_call_unique UNIQUE (task_id, call_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_agent_steps_effect_fingerprint_unique
  ON canvas_agent_steps (task_id, input_fingerprint)
  WHERE effect <> 'read';

ALTER TABLE canvas_agent_steps
  ADD COLUMN IF NOT EXISTS input_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE canvas_agent_tasks
  DROP CONSTRAINT IF EXISTS canvas_agent_tasks_current_step_id_fkey;
ALTER TABLE canvas_agent_tasks
  ADD CONSTRAINT canvas_agent_tasks_current_step_id_fkey
  FOREIGN KEY (current_step_id) REFERENCES canvas_agent_steps(id);

CREATE TABLE IF NOT EXISTS canvas_agent_events (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES canvas_agent_tasks(id) ON DELETE CASCADE,
  sequence bigint NOT NULL,
  event_type text NOT NULL,
  event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_events_task_sequence_unique UNIQUE (task_id, sequence)
);

CREATE INDEX IF NOT EXISTS canvas_agent_events_resume_idx
  ON canvas_agent_events (task_id, sequence ASC);

CREATE TABLE IF NOT EXISTS canvas_agent_approvals (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES canvas_agent_tasks(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES canvas_agent_steps(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  effect text NOT NULL,
  reason text NOT NULL,
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  requested_by_team_member_id uuid NULL REFERENCES team_members(id),
  decided_by_user_id uuid NULL REFERENCES users(id),
  decided_by_team_member_id uuid NULL REFERENCES team_members(id),
  decision_reason text NULL,
  expires_at timestamptz NULL,
  decided_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'canceled')),
  CONSTRAINT canvas_agent_approvals_step_unique UNIQUE (step_id)
);

ALTER TABLE canvas_agent_steps
  DROP CONSTRAINT IF EXISTS canvas_agent_steps_approval_id_fkey;
ALTER TABLE canvas_agent_steps
  ADD CONSTRAINT canvas_agent_steps_approval_id_fkey
  FOREIGN KEY (approval_id) REFERENCES canvas_agent_approvals(id);

CREATE TABLE IF NOT EXISTS canvas_agent_messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES canvas_agent_tasks(id) ON DELETE SET NULL,
  sequence bigint NOT NULL,
  role text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_messages_role_check
    CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  CONSTRAINT canvas_agent_messages_conversation_sequence_unique
    UNIQUE (conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS canvas_agent_file_grants (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_file_grants_status_check
    CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS canvas_agent_file_grants_active_idx
  ON canvas_agent_file_grants (conversation_id, expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS canvas_agent_outbox (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES canvas_agent_tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'canvas.agent.task.wakeup',
  event_key text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text NULL,
  locked_at timestamptz NULL,
  dispatched_at timestamptz NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_outbox_status_check
    CHECK (status IN ('pending', 'dispatching', 'dispatched')),
  CONSTRAINT canvas_agent_outbox_event_key_unique UNIQUE (event_key)
);

CREATE INDEX IF NOT EXISTS canvas_agent_outbox_dispatch_idx
  ON canvas_agent_outbox (status, available_at, created_at)
  WHERE status <> 'dispatched';

ALTER TABLE provider_requests
  ADD COLUMN IF NOT EXISTS agent_task_id uuid NULL,
  ADD COLUMN IF NOT EXISTS agent_step_id uuid NULL;
ALTER TABLE provider_requests
  DROP CONSTRAINT IF EXISTS provider_requests_agent_task_id_fkey;
ALTER TABLE provider_requests
  ADD CONSTRAINT provider_requests_agent_task_id_fkey
  FOREIGN KEY (agent_task_id) REFERENCES canvas_agent_tasks(id);
ALTER TABLE provider_requests
  DROP CONSTRAINT IF EXISTS provider_requests_agent_step_id_fkey;
ALTER TABLE provider_requests
  ADD CONSTRAINT provider_requests_agent_step_id_fkey
  FOREIGN KEY (agent_step_id) REFERENCES canvas_agent_steps(id);
CREATE INDEX IF NOT EXISTS provider_requests_agent_scope_idx
  ON provider_requests (agent_task_id, agent_step_id, created_at DESC)
  WHERE agent_task_id IS NOT NULL;

ALTER TABLE user_model_request_logs
  ADD COLUMN IF NOT EXISTS agent_task_id uuid NULL,
  ADD COLUMN IF NOT EXISTS agent_step_id uuid NULL;
ALTER TABLE user_model_request_logs
  DROP CONSTRAINT IF EXISTS user_model_request_logs_agent_task_id_fkey;
ALTER TABLE user_model_request_logs
  ADD CONSTRAINT user_model_request_logs_agent_task_id_fkey
  FOREIGN KEY (agent_task_id) REFERENCES canvas_agent_tasks(id);
ALTER TABLE user_model_request_logs
  DROP CONSTRAINT IF EXISTS user_model_request_logs_agent_step_id_fkey;
ALTER TABLE user_model_request_logs
  ADD CONSTRAINT user_model_request_logs_agent_step_id_fkey
  FOREIGN KEY (agent_step_id) REFERENCES canvas_agent_steps(id);
CREATE INDEX IF NOT EXISTS user_model_request_logs_agent_scope_idx
  ON user_model_request_logs (agent_task_id, agent_step_id, created_at DESC)
  WHERE agent_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS canvas_agent_memories (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  memory_key text NOT NULL,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  source_task_id uuid NULL REFERENCES canvas_agent_tasks(id) ON DELETE SET NULL,
  source_step_id uuid NULL REFERENCES canvas_agent_steps(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT canvas_agent_memories_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT canvas_agent_memories_key_check CHECK (memory_key ~ '^[A-Za-z0-9_.:-]{1,120}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_agent_memories_actor_key_unique
  ON canvas_agent_memories (
    owner_user_id,
    COALESCE(actor_team_member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    canvas_id,
    conversation_id,
    memory_key
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS canvas_agent_memories_context_idx
  ON canvas_agent_memories (conversation_id, updated_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS canvas_agent_citations (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  task_id uuid NULL REFERENCES canvas_agent_tasks(id) ON DELETE SET NULL,
  step_id uuid NULL REFERENCES canvas_agent_steps(id) ON DELETE SET NULL,
  source_type text NOT NULL,
  source_key text NOT NULL,
  title text NOT NULL,
  canonical_url text NULL,
  accessed_at timestamptz NOT NULL,
  excerpt text NOT NULL,
  excerpt_hash text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_citations_source_type_check CHECK (source_type IN ('provider_docs', 'web')),
  CONSTRAINT canvas_agent_citations_excerpt_size_check CHECK (octet_length(excerpt) <= 16384)
);

CREATE INDEX IF NOT EXISTS canvas_agent_citations_conversation_idx
  ON canvas_agent_citations (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS canvas_agent_provider_documents (
  id uuid PRIMARY KEY,
  provider_name text NOT NULL,
  document_key text NOT NULL,
  title text NOT NULL,
  canonical_url text NULL,
  content_text text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_provider_documents_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT canvas_agent_provider_documents_key_unique UNIQUE (provider_name, document_key)
);

CREATE TABLE IF NOT EXISTS canvas_agent_external_tool_policies (
  id uuid PRIMARY KEY,
  tool_kind text NOT NULL,
  target_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  allowed_domains_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_operations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_agent_external_tool_policies_kind_check CHECK (tool_kind IN ('web', 'mcp')),
  CONSTRAINT canvas_agent_external_tool_policies_target_unique UNIQUE (tool_kind, target_id)
);
