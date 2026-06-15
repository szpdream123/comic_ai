CREATE TABLE IF NOT EXISTS storyboard_prompt_packages (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  package_type text NOT NULL,
  audience text NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_content text NOT NULL,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_prompt text NULL,
  applicable_genres jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_scene jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_type text NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  can_stack boolean NOT NULL DEFAULT true,
  max_select_count integer NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_global_default boolean NOT NULL DEFAULT false,
  is_recommended boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  remark text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (package_type IN ('genre', 'emotion', 'taboo')),
  CHECK (status IN ('enabled', 'disabled')),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS storyboard_prompt_packages_type_status_idx
  ON storyboard_prompt_packages (package_type, status, sort_order DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS storyboard_prompt_templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  base_prompt text NOT NULL,
  genre_package_id uuid NOT NULL REFERENCES storyboard_prompt_packages(id),
  emotion_package_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  camera_package_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_package_id uuid NULL REFERENCES storyboard_prompt_packages(id),
  taboo_package_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  remark text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (status IN ('enabled', 'disabled')),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS storyboard_prompt_templates_status_idx
  ON storyboard_prompt_templates (status, sort_order DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS storyboard_prompt_package_versions (
  id uuid PRIMARY KEY,
  package_id uuid NOT NULL REFERENCES storyboard_prompt_packages(id),
  version_no integer NOT NULL,
  snapshot_json jsonb NOT NULL,
  change_reason text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, version_no)
);

CREATE INDEX IF NOT EXISTS storyboard_prompt_package_versions_package_idx
  ON storyboard_prompt_package_versions (package_id, version_no DESC);
