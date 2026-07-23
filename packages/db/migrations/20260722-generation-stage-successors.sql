CREATE TABLE IF NOT EXISTS generation_stage_successors (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  stage text NOT NULL,
  poll_attempt integer NOT NULL DEFAULT 0,
  skip_reason text NOT NULL,
  next_action text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  successor_assignment_key text,
  first_observed_at timestamptz NOT NULL,
  last_observed_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  CONSTRAINT generation_stage_successors_stage_check
    CHECK (stage IN ('submit', 'poll', 'fetch', 'persist')),
  CONSTRAINT generation_stage_successors_poll_attempt_check CHECK (poll_attempt >= 0),
  CONSTRAINT generation_stage_successors_next_action_check
    CHECK (next_action IN ('submit', 'poll', 'finalize', 'stop')),
  CONSTRAINT generation_stage_successors_status_check
    CHECK (status IN ('scheduled', 'confirmed', 'terminal', 'failed')),
  CONSTRAINT generation_stage_successors_unique_stage UNIQUE (task_id, stage, poll_attempt)
);

CREATE INDEX IF NOT EXISTS generation_stage_successors_orphan_idx
  ON generation_stage_successors (status, last_observed_at, task_id)
  WHERE status = 'scheduled';
