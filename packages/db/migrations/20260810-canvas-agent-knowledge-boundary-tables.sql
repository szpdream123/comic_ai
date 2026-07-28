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
