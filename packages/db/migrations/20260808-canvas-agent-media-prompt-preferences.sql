CREATE TABLE IF NOT EXISTS canvas_agent_media_prompt_preferences (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  actor_team_member_id uuid NULL REFERENCES team_members(id),
  media_kind text NOT NULL,
  preference_key text NOT NULL,
  instruction_text text NOT NULL,
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_canvas_id uuid NULL REFERENCES creator_canvas_projects(id) ON DELETE SET NULL,
  source_conversation_id uuid NULL REFERENCES canvas_agent_conversations(id) ON DELETE SET NULL,
  source_task_id uuid NULL REFERENCES canvas_agent_tasks(id) ON DELETE SET NULL,
  source_step_id uuid NULL REFERENCES canvas_agent_steps(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT canvas_agent_media_prompt_preferences_kind_check
    CHECK (media_kind IN ('image','video','audio')),
  CONSTRAINT canvas_agent_media_prompt_preferences_key_check
    CHECK (preference_key ~ '^[A-Za-z0-9_.:-]{1,120}$'),
  CONSTRAINT canvas_agent_media_prompt_preferences_instruction_check
    CHECK (char_length(instruction_text) BETWEEN 1 AND 4000),
  CONSTRAINT canvas_agent_media_prompt_preferences_tags_check
    CHECK (jsonb_typeof(tags_json) = 'array'),
  CONSTRAINT canvas_agent_media_prompt_preferences_status_check
    CHECK (status IN ('active','revoked'))
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_agent_media_prompt_preferences_actor_key_unique
  ON canvas_agent_media_prompt_preferences (
    owner_user_id,
    COALESCE(actor_team_member_id, '00000000-0000-0000-0000-000000000000'::uuid),
    media_kind,
    preference_key
  )
  WHERE status='active';

CREATE INDEX IF NOT EXISTS canvas_agent_media_prompt_preferences_actor_recent_idx
  ON canvas_agent_media_prompt_preferences (
    owner_user_id,
    actor_team_member_id,
    updated_at DESC
  )
  WHERE status='active';
