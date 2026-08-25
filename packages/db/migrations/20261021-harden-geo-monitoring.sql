ALTER TABLE geo_monitor_runs
  ADD COLUMN IF NOT EXISTS content_version_id uuid;

UPDATE geo_monitor_runs run
   SET content_version_id = item.current_published_version_id
  FROM geo_content_items item
 WHERE run.content_item_id = item.id
   AND run.content_version_id IS NULL;

ALTER TABLE geo_monitor_runs
  ALTER COLUMN content_version_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'geo_monitor_runs_content_version_id_fkey'
       AND conrelid = 'geo_monitor_runs'::regclass
  ) THEN
    ALTER TABLE geo_monitor_runs
      ADD CONSTRAINT geo_monitor_runs_content_version_id_fkey
      FOREIGN KEY (content_version_id) REFERENCES geo_content_versions(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'geo_monitor_runs_completion_state_check'
       AND conrelid = 'geo_monitor_runs'::regclass
  ) THEN
    ALTER TABLE geo_monitor_runs
      ADD CONSTRAINT geo_monitor_runs_completion_state_check CHECK (
        (status = 'running' AND completed_at IS NULL)
        OR (status <> 'running' AND completed_at IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_geo_monitor_result_raw_evidence_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'geo_monitor_results raw evidence is immutable';
  END IF;
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
BEFORE UPDATE OR DELETE ON geo_monitor_results
FOR EACH ROW
EXECUTE FUNCTION prevent_geo_monitor_result_raw_evidence_update();

CREATE INDEX IF NOT EXISTS geo_monitor_runs_content_version_created_idx
  ON geo_monitor_runs (content_version_id, created_at DESC);

CREATE OR REPLACE FUNCTION protect_geo_monitor_run_attribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'geo_monitor_runs audit history is immutable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM geo_content_versions version
     WHERE version.id = NEW.content_version_id
       AND version.content_item_id = NEW.content_item_id
  ) THEN
    RAISE EXCEPTION 'geo_monitor_runs content version does not belong to content item';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.content_item_id IS DISTINCT FROM OLD.content_item_id
    OR NEW.content_version_id IS DISTINCT FROM OLD.content_version_id
    OR NEW.platform_id IS DISTINCT FROM OLD.platform_id
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.model_code IS DISTINCT FROM OLD.model_code
    OR NEW.created_by_admin_id IS DISTINCT FROM OLD.created_by_admin_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR OLD.status <> 'running'
  ) THEN
    RAISE EXCEPTION 'geo_monitor_runs audit attribution is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS geo_monitor_runs_audit_immutable ON geo_monitor_runs;
CREATE TRIGGER geo_monitor_runs_audit_immutable
BEFORE INSERT OR UPDATE OR DELETE ON geo_monitor_runs
FOR EACH ROW
EXECUTE FUNCTION protect_geo_monitor_run_attribution();
