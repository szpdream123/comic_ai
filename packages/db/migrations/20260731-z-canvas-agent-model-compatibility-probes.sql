CREATE TABLE IF NOT EXISTS canvas_agent_model_compatibility_probes (
  model_config_id uuid PRIMARY KEY REFERENCES ai_model_configs(id) ON DELETE CASCADE,
  status text NOT NULL,
  failure_code text NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  checks_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  checked_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT canvas_agent_model_compatibility_probes_status_check
    CHECK (status IN ('passed', 'failed')),
  CONSTRAINT canvas_agent_model_compatibility_probes_latency_check
    CHECK (latency_ms >= 0),
  CONSTRAINT canvas_agent_model_compatibility_probes_checks_check
    CHECK (jsonb_typeof(checks_json) = 'array')
);

CREATE INDEX IF NOT EXISTS canvas_agent_model_compatibility_probes_status_idx
  ON canvas_agent_model_compatibility_probes (status, checked_at DESC);
