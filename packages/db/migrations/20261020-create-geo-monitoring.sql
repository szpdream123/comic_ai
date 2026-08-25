CREATE TABLE IF NOT EXISTS geo_monitor_runs (
  id uuid PRIMARY KEY,
  content_item_id uuid NOT NULL REFERENCES geo_content_items(id),
  platform_id text NOT NULL,
  source_type text NOT NULL
    CHECK (source_type IN ('official_api', 'manual_import')),
  status text NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed')),
  model_code text,
  error_code text,
  error_summary text,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(platform_id) <> ''),
  CHECK (
    (source_type = 'official_api' AND model_code IS NOT NULL AND btrim(model_code) <> '')
    OR (source_type = 'manual_import' AND model_code IS NULL)
  ),
  CHECK ((status = 'running' AND completed_at IS NULL) OR status <> 'running')
);

CREATE TABLE IF NOT EXISTS geo_monitor_results (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES geo_monitor_runs(id),
  question_id uuid NOT NULL REFERENCES geo_questions(id),
  raw_question text NOT NULL,
  raw_answer text NOT NULL,
  cited_urls_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_mentioned boolean NOT NULL,
  article_cited boolean NOT NULL,
  result_status text NOT NULL
    CHECK (result_status IN ('not_mentioned', 'mentioned', 'cited')),
  analysis_version text NOT NULL,
  provider_request_id uuid REFERENCES provider_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id),
  CHECK (btrim(raw_question) <> ''),
  CHECK (btrim(raw_answer) <> ''),
  CHECK (jsonb_typeof(cited_urls_json) = 'array'),
  CHECK (btrim(analysis_version) <> ''),
  CHECK (
    (result_status = 'cited' AND article_cited)
    OR (result_status = 'mentioned' AND brand_mentioned AND NOT article_cited)
    OR (result_status = 'not_mentioned' AND NOT brand_mentioned AND NOT article_cited)
  )
);

CREATE OR REPLACE FUNCTION prevent_geo_monitor_result_raw_evidence_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.raw_question IS DISTINCT FROM OLD.raw_question
     OR NEW.raw_answer IS DISTINCT FROM OLD.raw_answer
     OR NEW.cited_urls_json IS DISTINCT FROM OLD.cited_urls_json
     OR NEW.provider_request_id IS DISTINCT FROM OLD.provider_request_id
  THEN
    RAISE EXCEPTION 'geo_monitor_results raw evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS geo_monitor_results_raw_evidence_immutable ON geo_monitor_results;
CREATE TRIGGER geo_monitor_results_raw_evidence_immutable
BEFORE UPDATE ON geo_monitor_results
FOR EACH ROW
EXECUTE FUNCTION prevent_geo_monitor_result_raw_evidence_update();

CREATE INDEX IF NOT EXISTS geo_monitor_runs_content_created_idx
  ON geo_monitor_runs (content_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS geo_monitor_runs_platform_created_idx
  ON geo_monitor_runs (platform_id, created_at DESC);

CREATE INDEX IF NOT EXISTS geo_monitor_results_question_created_idx
  ON geo_monitor_results (question_id, created_at DESC);
