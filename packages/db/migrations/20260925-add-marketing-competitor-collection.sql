CREATE TABLE IF NOT EXISTS marketing_competitor_collection_jobs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
  campaign_id uuid NULL REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  name text NOT NULL,
  collection_mode text NOT NULL,
  query_text text NOT NULL,
  crawler_base_url text NOT NULL,
  max_items integer NOT NULL DEFAULT 30,
  include_comments boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 360,
  status text NOT NULL DEFAULT 'active',
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_competitor_collection_jobs_mode_check CHECK (collection_mode IN ('keyword', 'creator')),
  CONSTRAINT marketing_competitor_collection_jobs_max_items_check CHECK (max_items BETWEEN 1 AND 100),
  CONSTRAINT marketing_competitor_collection_jobs_interval_check CHECK (interval_minutes BETWEEN 15 AND 10080),
  CONSTRAINT marketing_competitor_collection_jobs_status_check CHECK (status IN ('active', 'paused', 'disabled'))
);

CREATE INDEX IF NOT EXISTS marketing_competitor_collection_jobs_due_idx
  ON marketing_competitor_collection_jobs (status, next_run_at, created_at);

CREATE TABLE IF NOT EXISTS marketing_competitor_collection_runs (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES marketing_competitor_collection_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  crawler_file_path text NULL,
  raw_payload_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  research_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_package_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_code text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_competitor_collection_runs_status_check CHECK (status IN ('queued', 'collecting', 'analyzing', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS marketing_competitor_collection_runs_status_created_idx
  ON marketing_competitor_collection_runs (status, created_at);
