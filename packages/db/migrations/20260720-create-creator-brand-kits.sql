CREATE TABLE IF NOT EXISTS creator_brand_kits (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '未命名',
  is_default boolean NOT NULL DEFAULT false,
  guidance_text text,
  cover_storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_brand_kits_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT creator_brand_kits_guidance_check CHECK (guidance_text IS NULL OR length(guidance_text) <= 5000)
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_brand_kits_admin_default_uidx
  ON creator_brand_kits (admin_user_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS creator_brand_kits_admin_created_idx
  ON creator_brand_kits (admin_user_id, created_at, id);

CREATE TABLE IF NOT EXISTS creator_brand_kit_assets (
  id uuid PRIMARY KEY,
  kit_id uuid NOT NULL REFERENCES creator_brand_kits(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text,
  sort_order integer NOT NULL DEFAULT 0,
  text_content text,
  storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_brand_kit_assets_type_check CHECK (asset_type IN ('color', 'font', 'logo', 'image')),
  CONSTRAINT creator_brand_kit_assets_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  CONSTRAINT creator_brand_kit_assets_role_check CHECK (role IS NULL OR length(role) <= 100),
  CONSTRAINT creator_brand_kit_assets_sort_check CHECK (sort_order >= 0),
  CONSTRAINT creator_brand_kit_assets_text_check CHECK (text_content IS NULL OR length(text_content) <= 1000)
);

CREATE INDEX IF NOT EXISTS creator_brand_kit_assets_kit_type_sort_idx
  ON creator_brand_kit_assets (kit_id, asset_type, sort_order, created_at, id);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES creator_brand_kits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_brand_kit_idx
  ON projects (brand_kit_id)
  WHERE brand_kit_id IS NOT NULL;
