CREATE TABLE IF NOT EXISTS canvas_agent_provider_config_drafts (
  id uuid PRIMARY KEY,
  canvas_id uuid NOT NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES canvas_agent_conversations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  task_id uuid NOT NULL REFERENCES canvas_agent_tasks(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES canvas_agent_steps(id) ON DELETE CASCADE,
  model_config_id uuid NOT NULL REFERENCES ai_model_configs(id),
  model_code text NOT NULL,
  media_kind text NOT NULL,
  base_settings_revision integer NOT NULL,
  settings_patch_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  applied_settings_revision integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NULL,
  CONSTRAINT canvas_agent_provider_config_drafts_media_check
    CHECK (media_kind IN ('text','image','video','audio')),
  CONSTRAINT canvas_agent_provider_config_drafts_status_check
    CHECK (status IN ('draft','applied','rejected')),
  CONSTRAINT canvas_agent_provider_config_drafts_revision_check
    CHECK (base_settings_revision >= 1 AND (applied_settings_revision IS NULL OR applied_settings_revision >= 1)),
  CONSTRAINT canvas_agent_provider_config_drafts_step_unique UNIQUE (step_id)
);

CREATE INDEX IF NOT EXISTS canvas_agent_provider_config_drafts_scope_idx
  ON canvas_agent_provider_config_drafts (canvas_id, conversation_id, created_at DESC);
