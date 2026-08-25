WITH duplicate_running AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY content_version_id, platform_id
           ORDER BY started_at ASC, created_at ASC, id ASC
         ) AS position
    FROM geo_monitor_runs
   WHERE status = 'running' AND source_type = 'official_api'
)
UPDATE geo_monitor_runs run
   SET status = 'failed',
       error_code = 'geo_monitor_duplicate_running_reconciled',
       error_summary = '部署迁移时发现重复运行任务，已保留最早的一条。',
       completed_at = COALESCE(run.completed_at, now()),
       updated_at = now()
  FROM duplicate_running duplicate
 WHERE run.id = duplicate.id
   AND duplicate.position > 1;

DROP INDEX IF EXISTS geo_monitor_runs_one_running_platform_idx;
CREATE UNIQUE INDEX geo_monitor_runs_one_running_platform_idx
  ON geo_monitor_runs (content_version_id, platform_id)
  WHERE status = 'running' AND source_type = 'official_api';

CREATE OR REPLACE FUNCTION prevent_geo_monitor_result_raw_evidence_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  run_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT run.status INTO run_status
      FROM geo_monitor_runs run
      JOIN geo_content_question_links link
        ON link.content_version_id = run.content_version_id
       AND link.question_id = NEW.question_id
      JOIN geo_questions question
        ON question.id = NEW.question_id
       AND question.raw_question = NEW.raw_question
     WHERE run.id = NEW.run_id;
    IF run_status IS NULL THEN
      RAISE EXCEPTION 'geo_monitor_results question does not belong to run content version';
    END IF;
    IF run_status <> 'running' THEN
      RAISE EXCEPTION 'geo_monitor_results cannot be appended after run completion';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'geo_monitor_results raw evidence is immutable';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.question_id IS DISTINCT FROM OLD.question_id
     OR NEW.raw_question IS DISTINCT FROM OLD.raw_question
     OR NEW.raw_answer IS DISTINCT FROM OLD.raw_answer
     OR NEW.cited_urls_json IS DISTINCT FROM OLD.cited_urls_json
     OR NEW.provider_request_id IS DISTINCT FROM OLD.provider_request_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'geo_monitor_results raw evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS geo_monitor_results_raw_evidence_immutable ON geo_monitor_results;
CREATE TRIGGER geo_monitor_results_raw_evidence_immutable
BEFORE INSERT OR UPDATE OR DELETE ON geo_monitor_results
FOR EACH ROW
EXECUTE FUNCTION prevent_geo_monitor_result_raw_evidence_update();

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
