CREATE TABLE IF NOT EXISTS marketing_brand_profiles (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES marketing_projects(id) ON DELETE CASCADE,
  version text NOT NULL,
  profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_by_admin_id uuid NOT NULL REFERENCES admin_accounts(id),
  activated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  activated_at timestamptz NULL,
  superseded_at timestamptz NULL,
  revoked_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_brand_profiles_status_check CHECK (status IN ('draft', 'active', 'superseded', 'revoked')),
  CONSTRAINT marketing_brand_profiles_version_unique UNIQUE (project_id, version)
);

ALTER TABLE marketing_projects
  ADD COLUMN IF NOT EXISTS active_brand_profile_id uuid NULL;
ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid NULL;
ALTER TABLE marketing_content_variants
  ADD COLUMN IF NOT EXISTS brand_profile_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_projects_active_brand_profile_fkey'
  ) THEN
    ALTER TABLE marketing_projects
      ADD CONSTRAINT marketing_projects_active_brand_profile_fkey
      FOREIGN KEY (active_brand_profile_id) REFERENCES marketing_brand_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_campaigns_brand_profile_fkey'
  ) THEN
    ALTER TABLE marketing_campaigns
      ADD CONSTRAINT marketing_campaigns_brand_profile_fkey
      FOREIGN KEY (brand_profile_id) REFERENCES marketing_brand_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_content_variants_brand_profile_fkey'
  ) THEN
    ALTER TABLE marketing_content_variants
      ADD CONSTRAINT marketing_content_variants_brand_profile_fkey
      FOREIGN KEY (brand_profile_id) REFERENCES marketing_brand_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO marketing_brand_profiles (
  id, project_id, version, profile_json, status, created_by_admin_id, activated_by_admin_id, activated_at
)
SELECT gen_random_uuid(), project.id, 'legacy-v1', project.brand_profile_json, 'active',
       project.created_by_admin_id, project.created_by_admin_id, now()
FROM marketing_projects AS project
WHERE NOT EXISTS (
  SELECT 1 FROM marketing_brand_profiles AS profile WHERE profile.project_id = project.id
);

UPDATE marketing_projects AS project
SET active_brand_profile_id = profile.id
FROM marketing_brand_profiles AS profile
WHERE project.id = profile.project_id
  AND profile.status = 'active'
  AND project.active_brand_profile_id IS NULL;

UPDATE marketing_campaigns AS campaign
SET brand_profile_id = project.active_brand_profile_id
FROM marketing_projects AS project
WHERE campaign.project_id = project.id
  AND campaign.brand_profile_id IS NULL;

UPDATE marketing_content_variants AS variant
SET brand_profile_id = campaign.brand_profile_id
FROM marketing_campaigns AS campaign
WHERE variant.campaign_id = campaign.id
  AND variant.brand_profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_brand_profiles_one_active_idx
  ON marketing_brand_profiles (project_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS marketing_brand_profiles_project_status_idx
  ON marketing_brand_profiles (project_id, status, created_at DESC);
