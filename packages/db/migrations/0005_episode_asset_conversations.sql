CREATE TABLE IF NOT EXISTS episode_asset_conversation_threads (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  episode_id uuid NOT NULL REFERENCES episodes(id),
  asset_id uuid NOT NULL,
  media_mode text NOT NULL CHECK (media_mode IN ('image', 'video')),
  latest_message_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, project_id, episode_id, asset_id, media_mode),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id)
);

CREATE INDEX IF NOT EXISTS episode_asset_conversation_threads_lookup_idx
  ON episode_asset_conversation_threads (
    organization_id,
    project_id,
    episode_id,
    asset_id,
    media_mode,
    latest_message_at DESC
  );

CREATE TABLE IF NOT EXISTS episode_asset_conversation_messages (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL REFERENCES episode_asset_conversation_threads(id) ON DELETE CASCADE,
  turn_id text NOT NULL,
  message_key text NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('user_request', 'task_status', 'result')),
  status text NOT NULL DEFAULT 'running',
  task_id text NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, message_key)
);

CREATE INDEX IF NOT EXISTS episode_asset_conversation_messages_thread_idx
  ON episode_asset_conversation_messages (thread_id, created_at ASC, id ASC);
