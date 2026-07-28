-- Keep Canvas ownership on users while recording the team member that actually
-- performed an operation. Assignment rows remain access grants, not ownership.
ALTER TABLE creator_canvas_events
  ADD COLUMN IF NOT EXISTS actor_team_member_id uuid;

ALTER TABLE creator_canvas_revisions
  ADD COLUMN IF NOT EXISTS actor_team_member_id uuid;

ALTER TABLE creator_canvas_node_runs
  ADD COLUMN IF NOT EXISTS actor_team_member_id uuid;

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_team_member_id uuid;

ALTER TABLE creator_canvas_sessions
  ADD COLUMN IF NOT EXISTS team_member_id uuid,
  ADD COLUMN IF NOT EXISTS principal_key text;

UPDATE creator_canvas_sessions
SET principal_key = 'owner:' || user_id::text
WHERE principal_key IS NULL OR btrim(principal_key) = '';

ALTER TABLE creator_canvas_sessions
  ALTER COLUMN principal_key SET NOT NULL;

DROP INDEX IF EXISTS creator_canvas_sessions_user_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_sessions_principal_uidx
  ON creator_canvas_sessions (canvas_project_id, user_id, principal_key);

CREATE INDEX IF NOT EXISTS creator_canvas_events_actor_team_member_idx
  ON creator_canvas_events (actor_team_member_id, created_at DESC)
  WHERE actor_team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_revisions_actor_team_member_idx
  ON creator_canvas_revisions (actor_team_member_id, created_at DESC)
  WHERE actor_team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_node_runs_actor_team_member_idx
  ON creator_canvas_node_runs (actor_team_member_id, created_at DESC)
  WHERE actor_team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_actor_team_member_idx
  ON audit_events (actor_team_member_id, created_at DESC)
  WHERE actor_team_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS creator_canvas_sessions_team_member_idx
  ON creator_canvas_sessions (team_member_id, updated_at DESC)
  WHERE team_member_id IS NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_canvas_events_actor_team_member_id_fkey'
      AND conrelid = 'creator_canvas_events'::regclass
  ) THEN
    ALTER TABLE creator_canvas_events
      ADD CONSTRAINT creator_canvas_events_actor_team_member_id_fkey
      FOREIGN KEY (actor_team_member_id) REFERENCES team_members(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_canvas_revisions_actor_team_member_id_fkey'
      AND conrelid = 'creator_canvas_revisions'::regclass
  ) THEN
    ALTER TABLE creator_canvas_revisions
      ADD CONSTRAINT creator_canvas_revisions_actor_team_member_id_fkey
      FOREIGN KEY (actor_team_member_id) REFERENCES team_members(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_canvas_node_runs_actor_team_member_id_fkey'
      AND conrelid = 'creator_canvas_node_runs'::regclass
  ) THEN
    ALTER TABLE creator_canvas_node_runs
      ADD CONSTRAINT creator_canvas_node_runs_actor_team_member_id_fkey
      FOREIGN KEY (actor_team_member_id) REFERENCES team_members(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_events_actor_team_member_id_fkey'
      AND conrelid = 'audit_events'::regclass
  ) THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT audit_events_actor_team_member_id_fkey
      FOREIGN KEY (actor_team_member_id) REFERENCES team_members(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'creator_canvas_sessions_team_member_user_id_fkey'
      AND conrelid = 'creator_canvas_sessions'::regclass
  ) THEN
    ALTER TABLE creator_canvas_sessions
      ADD CONSTRAINT creator_canvas_sessions_team_member_user_id_fkey
      FOREIGN KEY (team_member_id, user_id) REFERENCES team_members(id, user_id);
  END IF;
END
$constraints$;
