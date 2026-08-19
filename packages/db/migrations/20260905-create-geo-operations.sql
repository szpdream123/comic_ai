CREATE TABLE IF NOT EXISTS geo_questions (
  id uuid PRIMARY KEY,
  raw_question text NOT NULL,
  normalized_question text NOT NULL UNIQUE,
  topic text NOT NULL,
  intent text NOT NULL,
  target_platforms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  product_capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage_status text NOT NULL DEFAULT 'uncovered'
    CHECK (coverage_status IN ('uncovered', 'drafted', 'covered')),
  notes text NOT NULL DEFAULT '',
  last_monitored_at timestamptz,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(raw_question) <> ''),
  CHECK (btrim(normalized_question) <> ''),
  CHECK (btrim(topic) <> ''),
  CHECK (btrim(intent) <> ''),
  CHECK (jsonb_typeof(target_platforms_json) = 'array'),
  CHECK (jsonb_typeof(product_capabilities_json) = 'array')
);

CREATE TABLE IF NOT EXISTS geo_evidence_items (
  id uuid PRIMARY KEY,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'product_feature', 'screenshot', 'case_result', 'model_test',
    'time_cost', 'authoritative_source', 'downloadable_template'
  )),
  name text NOT NULL,
  fact_text text NOT NULL,
  source_url text,
  attachment_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  collected_at timestamptz NOT NULL,
  model_name text,
  model_version text,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  valid_until timestamptz,
  public_use_allowed boolean NOT NULL DEFAULT false,
  reviewed_by_admin_id uuid REFERENCES admin_accounts(id),
  reviewed_at timestamptz,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(name) <> ''),
  CHECK (btrim(fact_text) <> ''),
  CHECK (jsonb_typeof(attachment_json) = 'object')
);

CREATE TABLE IF NOT EXISTS geo_content_items (
  id uuid PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('guide', 'case', 'report', 'answer')),
  topic text NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'archived')),
  current_draft_version_id uuid,
  current_published_version_id uuid,
  redirect_path text,
  lock_version integer NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, slug),
  CHECK (btrim(topic) <> ''),
  CHECK (redirect_path IS NULL OR redirect_path ~ '^/(guides|cases|reports|answers)/[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS geo_generation_runs (
  id uuid PRIMARY KEY,
  content_item_id uuid REFERENCES geo_content_items(id) ON DELETE SET NULL,
  run_type text NOT NULL CHECK (run_type IN ('generate', 'revise', 'review')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  model_code text NOT NULL,
  prompt_template_revision text NOT NULL,
  input_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_request_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  usage_json jsonb,
  error_code text,
  error_summary text,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(input_snapshot_json) = 'object'),
  CHECK (jsonb_typeof(evidence_ids_json) = 'array'),
  CHECK (jsonb_typeof(provider_request_ids_json) = 'array')
);

CREATE TABLE IF NOT EXISTS geo_content_versions (
  id uuid PRIMARY KEY,
  content_item_id uuid NOT NULL REFERENCES geo_content_items(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  summary text NOT NULL,
  document_json jsonb NOT NULL,
  faq_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  social_drafts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_report_json jsonb NOT NULL DEFAULT '{"blockers":[],"warnings":[]}'::jsonb,
  config_revision_id text NOT NULL,
  generation_run_id uuid REFERENCES geo_generation_runs(id) ON DELETE SET NULL,
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (content_item_id, version_number),
  CHECK (btrim(title) <> ''),
  CHECK (btrim(summary) <> ''),
  CHECK (jsonb_typeof(document_json) = 'object'),
  CHECK (jsonb_typeof(faq_json) = 'array'),
  CHECK (jsonb_typeof(seo_json) = 'object'),
  CHECK (jsonb_typeof(social_drafts_json) = 'object'),
  CHECK (jsonb_typeof(quality_report_json) = 'object')
);

CREATE TABLE IF NOT EXISTS geo_content_question_links (
  content_version_id uuid NOT NULL REFERENCES geo_content_versions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES geo_questions(id) ON DELETE RESTRICT,
  PRIMARY KEY (content_version_id, question_id)
);

CREATE TABLE IF NOT EXISTS geo_content_evidence_links (
  content_version_id uuid NOT NULL REFERENCES geo_content_versions(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES geo_evidence_items(id) ON DELETE RESTRICT,
  citation_key text NOT NULL DEFAULT '',
  PRIMARY KEY (content_version_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS geo_audit_events (
  id uuid PRIMARY KEY,
  actor_admin_account_id uuid NOT NULL REFERENCES admin_accounts(id),
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (btrim(event_type) <> ''),
  CHECK (btrim(target_type) <> ''),
  CHECK (jsonb_typeof(metadata_json) = 'object')
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geo_content_items_current_draft_fk') THEN
    ALTER TABLE geo_content_items
      ADD CONSTRAINT geo_content_items_current_draft_fk
      FOREIGN KEY (current_draft_version_id) REFERENCES geo_content_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'geo_content_items_current_published_fk') THEN
    ALTER TABLE geo_content_items
      ADD CONSTRAINT geo_content_items_current_published_fk
      FOREIGN KEY (current_published_version_id) REFERENCES geo_content_versions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS geo_questions_priority_idx
  ON geo_questions (coverage_status, priority DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS geo_evidence_review_idx
  ON geo_evidence_items (review_status, public_use_allowed, valid_until, updated_at DESC);
CREATE INDEX IF NOT EXISTS geo_content_status_idx
  ON geo_content_items (status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS geo_content_versions_item_idx
  ON geo_content_versions (content_item_id, version_number DESC);
CREATE INDEX IF NOT EXISTS geo_generation_runs_status_idx
  ON geo_generation_runs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS geo_audit_events_target_idx
  ON geo_audit_events (target_type, target_id, created_at DESC);
