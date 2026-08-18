CREATE TABLE IF NOT EXISTS marketing_generation_runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  platform text NOT NULL,
  executor_account_ref text NOT NULL,
  direction text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_document_id uuid NULL REFERENCES marketing_knowledge_documents(id) ON DELETE SET NULL,
  derived_knowledge_document_id uuid NULL REFERENCES marketing_knowledge_documents(id) ON DELETE SET NULL,
  knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  plan_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_task_id uuid NULL REFERENCES tasks(id) ON DELETE SET NULL,
  content_variant_id uuid NULL REFERENCES marketing_content_variants(id) ON DELETE SET NULL,
  publish_job_id uuid NULL REFERENCES marketing_publish_jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  failure_code text NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_generation_runs_content_type_check CHECK (content_type IN ('image', 'video')),
  CONSTRAINT marketing_generation_runs_status_check CHECK (status IN ('queued', 'knowledge', 'planning', 'generating', 'media_ready', 'scheduled', 'publishing', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS marketing_generation_runs_status_created_idx
  ON marketing_generation_runs (status, created_at);

CREATE TABLE IF NOT EXISTS marketing_knowledge_lineage (
  id uuid PRIMARY KEY,
  source_document_id uuid NOT NULL REFERENCES marketing_knowledge_documents(id) ON DELETE CASCADE,
  derived_document_id uuid NOT NULL REFERENCES marketing_knowledge_documents(id) ON DELETE CASCADE,
  generation_run_id uuid NOT NULL REFERENCES marketing_generation_runs(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_knowledge_lineage_relationship_check CHECK (relationship IN ('project_snapshot', 'direction', 'model_optimized')),
  CONSTRAINT marketing_knowledge_lineage_unique UNIQUE (source_document_id, derived_document_id, generation_run_id, relationship)
);
