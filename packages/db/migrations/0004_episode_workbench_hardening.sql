ALTER TABLE shots
  ADD COLUMN IF NOT EXISTS scene_analysis text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS plot_preview text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_draft text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tts_draft text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS shots_episode_sort_idx
  ON shots (organization_id, episode_id, sort_order ASC, created_at ASC)
  WHERE episode_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_episode_lookup_idx
  ON tasks (organization_id, project_id, task_type, created_at DESC);

CREATE TABLE IF NOT EXISTS episode_generation_drafts (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  episode_id uuid NOT NULL REFERENCES episodes(id),
  target_type text NOT NULL CHECK (target_type IN ('asset', 'storyboard')),
  target_id uuid NOT NULL,
  prompt text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'image' CHECK (mode IN ('image', 'video', 'lip_sync')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, episode_id, target_type, target_id),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id)
);

CREATE INDEX IF NOT EXISTS episode_generation_drafts_episode_idx
  ON episode_generation_drafts (organization_id, episode_id, target_type, updated_at DESC);

ALTER TABLE export_records
  ADD COLUMN IF NOT EXISTS episode_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'export_records_episode_fk'
  ) THEN
    ALTER TABLE export_records
      ADD CONSTRAINT export_records_episode_fk
      FOREIGN KEY (organization_id, episode_id)
      REFERENCES episodes (organization_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS export_records_episode_idx
  ON export_records (organization_id, episode_id, created_at DESC)
  WHERE episode_id IS NOT NULL;
