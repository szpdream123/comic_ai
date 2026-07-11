CREATE TABLE IF NOT EXISTS team_assets (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id),
  asset_name text NOT NULL,
  asset_prompt text NULL,
  asset_category text NOT NULL CHECK (asset_category IN ('character', 'scene', 'prop', 'voice')),
  asset_status text NOT NULL CHECK (asset_status IN ('active', 'generating', 'archived', 'failed')),
  asset_url text NULL CHECK (asset_url IS NULL OR asset_url ~ '^https://'),
  resource_type text NOT NULL,
  resource_size bigint NOT NULL DEFAULT 0 CHECK (resource_size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_name text NOT NULL,
  updated_by_name text NOT NULL,
  is_admin_created boolean NOT NULL DEFAULT true,
  created_user_id uuid NOT NULL,
  CHECK (asset_status <> 'active' OR asset_url ~ '^https://')
);

CREATE INDEX IF NOT EXISTS team_assets_admin_category_idx
  ON team_assets (admin_user_id, asset_category, asset_status, updated_at DESC);
