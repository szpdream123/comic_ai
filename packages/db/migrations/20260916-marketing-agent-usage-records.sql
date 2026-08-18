CREATE TABLE IF NOT EXISTS marketing_agent_usage_records (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES marketing_agent_runs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES marketing_agent_steps(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  stage text NOT NULL,
  provider_name text NOT NULL,
  data_classification text NOT NULL,
  input_tokens integer NULL,
  output_tokens integer NULL,
  media_seconds numeric(12,3) NULL,
  estimated_cost numeric(14,6) NULL,
  usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_agent_usage_records_stage_check CHECK (stage IN ('research', 'strategy', 'copy', 'media', 'compliance')),
  CONSTRAINT marketing_agent_usage_records_classification_check CHECK (data_classification IN ('public', 'internal', 'restricted')),
  CONSTRAINT marketing_agent_usage_records_input_tokens_check CHECK (input_tokens IS NULL OR input_tokens >= 0),
  CONSTRAINT marketing_agent_usage_records_output_tokens_check CHECK (output_tokens IS NULL OR output_tokens >= 0),
  CONSTRAINT marketing_agent_usage_records_media_seconds_check CHECK (media_seconds IS NULL OR media_seconds >= 0),
  CONSTRAINT marketing_agent_usage_records_estimated_cost_check CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  CONSTRAINT marketing_agent_usage_records_step_unique UNIQUE (step_id)
);

CREATE INDEX IF NOT EXISTS marketing_agent_usage_records_campaign_recorded_idx
  ON marketing_agent_usage_records (campaign_id, recorded_at DESC);
