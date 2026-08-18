CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS marketing_projects (
  id uuid PRIMARY KEY,
  owner_user_id uuid NULL REFERENCES users(id),
  source_type text NOT NULL,
  source_namespace text NOT NULL,
  source_record_id text NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  name text NOT NULL,
  brand_profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_projects_source_type_check CHECK (source_type IN ('comic_internal', 'external_api', 'manual', 'knowledge_base')),
  CONSTRAINT marketing_projects_status_check CHECK (status IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS marketing_sources (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
  source_namespace text NOT NULL,
  source_record_id text NOT NULL,
  source_version text NOT NULL,
  source_snapshot jsonb NOT NULL,
  source_url text NULL,
  content_hash text NULL,
  authorization_status text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  CONSTRAINT marketing_sources_authorization_check CHECK (authorization_status IN ('owned', 'authorized', 'unknown', 'revoked')),
  CONSTRAINT marketing_sources_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT marketing_sources_version_unique UNIQUE (project_id, source_namespace, source_record_id, source_version)
);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL,
  audience_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  prohibited_expressions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  schedule_window_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_campaigns_status_check CHECK (status IN ('draft', 'active', 'paused', 'archived'))
);

CREATE TABLE IF NOT EXISTS marketing_content_variants (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  platform text NOT NULL,
  content_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_manifest_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  compliance_report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  tracking_key text NOT NULL,
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  approved_at timestamptz NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_content_variants_type_check CHECK (content_type IN ('image', 'video')),
  CONSTRAINT marketing_content_variants_status_check CHECK (status IN ('draft', 'manual_review_required', 'approved', 'rejected', 'stale', 'published')),
  CONSTRAINT marketing_content_variants_tracking_unique UNIQUE (tracking_key)
);

CREATE TABLE IF NOT EXISTS marketing_publish_jobs (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE RESTRICT,
  content_variant_id uuid NOT NULL REFERENCES marketing_content_variants(id) ON DELETE RESTRICT,
  platform text NOT NULL,
  executor_account_ref text NOT NULL,
  idempotency_key text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  not_before timestamptz NOT NULL,
  execute_deadline timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  canceled_at timestamptz NULL,
  cancel_reason text NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_publish_jobs_status_check CHECK (status IN ('preparing_assets', 'scheduled', 'leased', 'downloading', 'downloaded', 'queued', 'running', 'succeeded', 'failed', 'needs_attention', 'canceled', 'result_unknown', 'stale')),
  CONSTRAINT marketing_publish_jobs_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT marketing_publish_jobs_window_check CHECK (not_before <= scheduled_at AND scheduled_at < execute_deadline)
);

CREATE TABLE IF NOT EXISTS marketing_publish_deliveries (
  id uuid PRIMARY KEY,
  publish_job_id uuid NOT NULL REFERENCES marketing_publish_jobs(id) ON DELETE CASCADE,
  executor_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'leased',
  acknowledged_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  platform_content_id text NULL,
  publish_url text NULL,
  published_at timestamptz NULL,
  failure_code text NULL,
  failure_message text NULL,
  raw_result_ref text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_publish_deliveries_status_check CHECK (status IN ('leased', 'downloading', 'downloaded', 'queued', 'running', 'succeeded', 'failed', 'needs_attention', 'canceled', 'result_unknown')),
  CONSTRAINT marketing_publish_deliveries_attempt_unique UNIQUE (attempt_id)
);

CREATE TABLE IF NOT EXISTS marketing_delivery_assets (
  id uuid PRIMARY KEY,
  publish_job_id uuid NOT NULL REFERENCES marketing_publish_jobs(id) ON DELETE CASCADE,
  content_variant_id uuid NOT NULL REFERENCES marketing_content_variants(id) ON DELETE RESTRICT,
  owner_user_id uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
  asset_type text NOT NULL,
  storage_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  delivery_bucket text NULL,
  delivery_object_key text NULL,
  delivery_url text NULL,
  sha256 text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NULL,
  expires_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL,
  delivery_state text NOT NULL DEFAULT 'available',
  delete_attempts integer NOT NULL DEFAULT 0,
  last_delete_attempt_at timestamptz NULL,
  last_delete_error text NULL,
  deleted_at timestamptz NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_delivery_assets_type_check CHECK (asset_type IN ('video', 'image', 'cover', 'subtitle', 'document')),
  CONSTRAINT marketing_delivery_assets_state_check CHECK (delivery_state IN ('copying', 'available', 'copy_failed', 'deleting', 'delete_failed', 'deleted')),
  CONSTRAINT marketing_delivery_assets_source_check CHECK (
    storage_object_id IS NOT NULL
    AND delivery_bucket IS NOT NULL
    AND delivery_object_key LIKE 'marketing-delivery/%'
  ),
  CONSTRAINT marketing_delivery_assets_delete_attempts_check CHECK (delete_attempts >= 0),
  CONSTRAINT marketing_delivery_assets_object_unique UNIQUE (delivery_bucket, delivery_object_key)
);

CREATE TABLE IF NOT EXISTS marketing_executors (
  id uuid PRIMARY KEY,
  worker_id text NOT NULL UNIQUE,
  version text NOT NULL,
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_executors_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS marketing_executor_keys (
  id uuid PRIMARY KEY,
  executor_id uuid NOT NULL REFERENCES marketing_executors(id) ON DELETE CASCADE,
  key_id text NOT NULL,
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  valid_until timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_executor_keys_status_check CHECK (status IN ('active', 'retired')),
  CONSTRAINT marketing_executor_keys_unique UNIQUE (executor_id, key_id)
);

CREATE TABLE IF NOT EXISTS marketing_request_nonces (
  worker_id text NOT NULL,
  key_id text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, key_id, nonce)
);

CREATE TABLE IF NOT EXISTS marketing_publish_events (
  id uuid PRIMARY KEY,
  publish_job_id uuid NOT NULL REFERENCES marketing_publish_jobs(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES marketing_publish_deliveries(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  status text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_publish_events_unique UNIQUE (delivery_id, event_id)
);

CREATE TABLE IF NOT EXISTS marketing_audit_events (
  id uuid PRIMARY KEY,
  project_id uuid NULL REFERENCES marketing_projects(id) ON DELETE SET NULL,
  campaign_id uuid NULL REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  content_variant_id uuid NULL REFERENCES marketing_content_variants(id) ON DELETE SET NULL,
  publish_job_id uuid NULL REFERENCES marketing_publish_jobs(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_audit_events_actor_type_check CHECK (actor_type IN ('admin', 'executor', 'system'))
);

CREATE TABLE IF NOT EXISTS marketing_knowledge_documents (
  id uuid PRIMARY KEY,
  project_id uuid NULL REFERENCES marketing_projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  document_type text NOT NULL,
  source_id uuid NULL REFERENCES marketing_sources(id) ON DELETE SET NULL,
  authorization_status text NOT NULL,
  version text NOT NULL,
  applicable_platforms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence_score integer NOT NULL DEFAULT 50,
  collected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_knowledge_documents_status_check CHECK (status IN ('draft', 'approved', 'rejected', 'revoked', 'superseded')),
  CONSTRAINT marketing_knowledge_documents_confidence_check CHECK (confidence_score BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS marketing_knowledge_segments (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES marketing_knowledge_documents(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL,
  content text NOT NULL,
  summary text NOT NULL DEFAULT '',
  tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_locator text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_knowledge_segments_sequence_unique UNIQUE (document_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS marketing_platform_capability_profiles (
  id uuid PRIMARY KEY,
  platform text NOT NULL,
  version text NOT NULL,
  capability_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  effective_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_platform_capability_status_check CHECK (status IN ('active', 'retired')),
  CONSTRAINT marketing_platform_capability_version_unique UNIQUE (platform, version)
);

CREATE TABLE IF NOT EXISTS marketing_compliance_checks (
  id uuid PRIMARY KEY,
  content_variant_id uuid NOT NULL REFERENCES marketing_content_variants(id) ON DELETE CASCADE,
  platform_profile_id uuid NULL REFERENCES marketing_platform_capability_profiles(id) ON DELETE SET NULL,
  status text NOT NULL,
  risk_level text NOT NULL,
  findings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_compliance_checks_status_check CHECK (status IN ('passed', 'manual_review_required', 'blocked')),
  CONSTRAINT marketing_compliance_checks_risk_check CHECK (risk_level IN ('low', 'medium', 'high'))
);

CREATE TABLE IF NOT EXISTS marketing_content_manual_reviews (
  id uuid PRIMARY KEY,
  content_variant_id uuid NOT NULL REFERENCES marketing_content_variants(id) ON DELETE CASCADE,
  compliance_check_id uuid NOT NULL REFERENCES marketing_compliance_checks(id) ON DELETE RESTRICT,
  decision text NOT NULL,
  review_dimensions_json jsonb NOT NULL,
  notes text NOT NULL,
  evidence_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  reviewed_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_content_manual_reviews_decision_check CHECK (decision IN ('approve', 'reject')),
  CONSTRAINT marketing_content_manual_reviews_notes_check CHECK (length(btrim(notes)) > 0),
  CONSTRAINT marketing_content_manual_reviews_dimensions_check CHECK (
    jsonb_typeof(review_dimensions_json) = 'object'
    AND jsonb_typeof(review_dimensions_json -> 'facts') = 'boolean'
    AND jsonb_typeof(review_dimensions_json -> 'assetRights') = 'boolean'
    AND jsonb_typeof(review_dimensions_json -> 'disclosure') = 'boolean'
    AND jsonb_typeof(review_dimensions_json -> 'platformRules') = 'boolean'
  ),
  CONSTRAINT marketing_content_manual_reviews_approval_check CHECK (
    decision <> 'approve'
    OR (
      review_dimensions_json ->> 'facts' = 'true'
      AND review_dimensions_json ->> 'assetRights' = 'true'
      AND review_dimensions_json ->> 'disclosure' = 'true'
      AND review_dimensions_json ->> 'platformRules' = 'true'
    )
  ),
  CONSTRAINT marketing_content_manual_reviews_idempotency_unique UNIQUE (content_variant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS marketing_attention_cases (
  id uuid PRIMARY KEY,
  publish_job_id uuid NOT NULL REFERENCES marketing_publish_jobs(id) ON DELETE CASCADE,
  delivery_id uuid NULL REFERENCES marketing_publish_deliveries(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  owner_admin_id uuid NULL REFERENCES admin_accounts(id),
  due_at timestamptz NULL,
  resolution text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT marketing_attention_cases_status_check CHECK (status IN ('open', 'resolved')),
  CONSTRAINT marketing_attention_cases_job_unique UNIQUE (publish_job_id)
);

CREATE TABLE IF NOT EXISTS marketing_trend_patterns (
  id uuid PRIMARY KEY,
  project_id uuid NULL REFERENCES marketing_projects(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES marketing_sources(id) ON DELETE RESTRICT,
  title text NOT NULL,
  platform text NOT NULL,
  pattern_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  authorization_status text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NULL,
  CONSTRAINT marketing_trend_patterns_authorization_check CHECK (authorization_status IN ('owned', 'authorized', 'unknown', 'revoked')),
  CONSTRAINT marketing_trend_patterns_status_check CHECK (status IN ('draft', 'approved', 'rejected', 'revoked'))
);

CREATE TABLE IF NOT EXISTS marketing_metric_observations (
  id uuid PRIMARY KEY,
  publish_job_id uuid NOT NULL REFERENCES marketing_publish_jobs(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_value numeric NULL,
  metric_source text NOT NULL,
  observed_at timestamptz NOT NULL,
  observation_window_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_id uuid NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_metric_source_check CHECK (metric_source IN ('platform_api', 'manual', 'executor_observed', 'unavailable')),
  CONSTRAINT marketing_metric_event_unique UNIQUE (publish_job_id, event_id)
);

CREATE TABLE IF NOT EXISTS marketing_research_briefs (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  brief_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reviewed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  review_notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NULL,
  reviewed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_research_briefs_status_check CHECK (status IN ('draft', 'approved', 'rejected', 'stale'))
);

CREATE TABLE IF NOT EXISTS marketing_research_source_policies (
  id uuid PRIMARY KEY,
  domain text NOT NULL UNIQUE,
  purpose text NOT NULL,
  max_requests_per_hour integer NOT NULL DEFAULT 60,
  allow_full_text boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  owner_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_research_source_policy_status_check CHECK (status IN ('active', 'disabled')),
  CONSTRAINT marketing_research_source_policy_limit_check CHECK (max_requests_per_hour BETWEEN 1 AND 3600),
  CONSTRAINT marketing_research_source_policy_domain_check CHECK (domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')
);

CREATE TABLE IF NOT EXISTS marketing_agent_runs (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  current_stage text NOT NULL DEFAULT 'research',
  data_classification text NOT NULL DEFAULT 'internal',
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_code text NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_agent_runs_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT marketing_agent_runs_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'manual_review_required', 'canceled')),
  CONSTRAINT marketing_agent_runs_stage_check CHECK (current_stage IN ('research', 'strategy', 'copy', 'media', 'compliance')),
  CONSTRAINT marketing_agent_runs_classification_check CHECK (data_classification IN ('public', 'internal', 'restricted'))
);

CREATE TABLE IF NOT EXISTS marketing_agent_steps (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES marketing_agent_runs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input_summary text NOT NULL DEFAULT '',
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_name text NULL,
  source_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_segment_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_agent_steps_stage_check CHECK (stage IN ('research', 'strategy', 'copy', 'media', 'compliance')),
  CONSTRAINT marketing_agent_steps_status_check CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'manual_review_required', 'skipped')),
  CONSTRAINT marketing_agent_steps_unique UNIQUE (run_id, stage)
);

CREATE INDEX IF NOT EXISTS marketing_publish_jobs_claim_idx
  ON marketing_publish_jobs (status, not_before, execute_deadline, platform, executor_account_ref);
CREATE INDEX IF NOT EXISTS marketing_publish_deliveries_job_idx
  ON marketing_publish_deliveries (publish_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_publish_deliveries_lease_idx
  ON marketing_publish_deliveries (lease_until, publish_job_id)
  WHERE status IN ('leased', 'downloading', 'downloaded', 'queued', 'running');
CREATE INDEX IF NOT EXISTS marketing_delivery_assets_job_idx
  ON marketing_delivery_assets (publish_job_id, expires_at);
CREATE INDEX IF NOT EXISTS marketing_delivery_assets_cleanup_idx
  ON marketing_delivery_assets (delivery_state, retention_until, last_delete_attempt_at)
  WHERE delivery_object_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_compliance_checks_variant_idx
  ON marketing_compliance_checks (content_variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_content_manual_reviews_variant_idx
  ON marketing_content_manual_reviews (content_variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_attention_cases_open_idx
  ON marketing_attention_cases (status, due_at);
CREATE INDEX IF NOT EXISTS marketing_metric_observations_job_idx
  ON marketing_metric_observations (publish_job_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS marketing_knowledge_documents_lookup_idx
  ON marketing_knowledge_documents (project_id, status, document_type, confidence_score DESC);
CREATE INDEX IF NOT EXISTS marketing_agent_runs_campaign_idx
  ON marketing_agent_runs (campaign_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS marketing_agent_runs_claim_idx
  ON marketing_agent_runs (created_at, id)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS marketing_agent_steps_claim_idx
  ON marketing_agent_steps (run_id, stage, status, started_at);
CREATE INDEX IF NOT EXISTS marketing_research_source_policies_active_idx
  ON marketing_research_source_policies (status, domain);
CREATE INDEX IF NOT EXISTS marketing_research_briefs_campaign_idx
  ON marketing_research_briefs (campaign_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS marketing_active_account_delivery_unique
  ON marketing_publish_jobs (platform, executor_account_ref)
  WHERE status IN ('leased', 'downloading', 'downloaded', 'queued', 'running');
CREATE INDEX IF NOT EXISTS marketing_request_nonces_expiry_idx
  ON marketing_request_nonces (expires_at);
CREATE INDEX IF NOT EXISTS marketing_audit_events_job_idx
  ON marketing_audit_events (publish_job_id, created_at DESC);
DO $$
DECLARE trgm_schema text;
BEGIN
  SELECT namespace.nspname INTO trgm_schema
  FROM pg_extension AS extension
  JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'pg_trgm';
  IF trgm_schema IS NULL THEN
    RAISE EXCEPTION 'marketing_pg_trgm_extension_missing';
  END IF;
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS marketing_knowledge_segments_content_trgm_idx ON marketing_knowledge_segments USING gin (content %I.gin_trgm_ops)',
    trgm_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS marketing_knowledge_documents_title_trgm_idx ON marketing_knowledge_documents USING gin (title %I.gin_trgm_ops)',
    trgm_schema
  );
END $$;
