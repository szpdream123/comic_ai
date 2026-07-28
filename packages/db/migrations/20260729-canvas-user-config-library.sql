CREATE TABLE IF NOT EXISTS canvas_user_configs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  config_type text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_version_id uuid NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT canvas_user_configs_type_check CHECK (config_type IN ('style','skill','toolbar')),
  CONSTRAINT canvas_user_configs_status_check CHECK (status IN ('active','archived')),
  CONSTRAINT canvas_user_configs_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120)
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_user_configs_active_name_uidx
  ON canvas_user_configs (user_id, config_type, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS canvas_user_configs_list_idx
  ON canvas_user_configs (user_id, config_type, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS canvas_user_config_versions (
  id uuid PRIMARY KEY,
  config_id uuid NOT NULL REFERENCES canvas_user_configs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  manifest_json jsonb NOT NULL,
  content_hash text NOT NULL,
  created_by_user_id uuid NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT canvas_user_config_versions_number_check CHECK (version >= 1),
  CONSTRAINT canvas_user_config_versions_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT canvas_user_config_versions_unique UNIQUE (config_id, version)
);

ALTER TABLE canvas_user_configs
  DROP CONSTRAINT IF EXISTS canvas_user_configs_current_version_fkey;
ALTER TABLE canvas_user_configs
  ADD CONSTRAINT canvas_user_configs_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES canvas_user_config_versions(id);

CREATE INDEX IF NOT EXISTS canvas_user_config_versions_list_idx
  ON canvas_user_config_versions (config_id, version DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_canvas_user_config_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'canvas_user_config_version_immutable';
END;
$$;

DROP TRIGGER IF EXISTS canvas_user_config_versions_immutable ON canvas_user_config_versions;
CREATE TRIGGER canvas_user_config_versions_immutable
BEFORE UPDATE ON canvas_user_config_versions
FOR EACH ROW EXECUTE FUNCTION reject_canvas_user_config_version_mutation();
