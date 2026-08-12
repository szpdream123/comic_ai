CREATE TABLE IF NOT EXISTS provider_material_assets (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  provider_account_hash text NOT NULL,
  source_key text NOT NULL,
  storage_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE SET NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('Image', 'Video', 'Audio')),
  provider_asset_id text NULL,
  provider_status text NOT NULL,
  provider_error text NULL,
  last_checked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_material_assets_identity_unique UNIQUE (
    provider, provider_account_hash, source_key, asset_type
  )
);

CREATE INDEX IF NOT EXISTS provider_material_assets_storage_object_idx
  ON provider_material_assets (storage_object_id)
  WHERE storage_object_id IS NOT NULL;
