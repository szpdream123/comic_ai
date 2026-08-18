CREATE TABLE IF NOT EXISTS marketing_research_request_log (
  id uuid PRIMARY KEY,
  domain text NOT NULL,
  run_id uuid NULL REFERENCES marketing_agent_runs(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_research_request_log_domain_requested_idx
  ON marketing_research_request_log (domain, requested_at DESC);
