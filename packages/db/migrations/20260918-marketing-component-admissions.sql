CREATE TABLE IF NOT EXISTS marketing_component_admissions (
  id uuid PRIMARY KEY,
  component_type text NOT NULL,
  component_name text NOT NULL,
  component_version text NOT NULL,
  approval_reference text NOT NULL,
  license_summary text NOT NULL,
  commercial_use_terms text NOT NULL,
  data_processing_location text NOT NULL,
  security_summary text NOT NULL,
  upgrade_plan text NOT NULL,
  removal_plan text NOT NULL,
  owner_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  status text NOT NULL DEFAULT 'draft',
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_component_admissions_type_check
    CHECK (component_type IN ('model', 'provider', 'data_service', 'open_source')),
  CONSTRAINT marketing_component_admissions_status_check
    CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  CONSTRAINT marketing_component_admissions_reference_check
    CHECK (btrim(approval_reference) <> ''),
  CONSTRAINT marketing_component_admissions_unique
    UNIQUE (component_type, component_name, component_version)
);

CREATE INDEX IF NOT EXISTS marketing_component_admissions_model_active_idx
  ON marketing_component_admissions (component_name, component_version)
  WHERE component_type = 'model' AND status = 'approved';
