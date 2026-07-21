CREATE TABLE IF NOT EXISTS creator_tool_presets (
  id uuid PRIMARY KEY,
  admin_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'custom',
  status text NOT NULL DEFAULT 'active',
  current_version_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_tool_presets_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT creator_tool_presets_description_check CHECK (length(description) <= 1000),
  CONSTRAINT creator_tool_presets_category_check CHECK (length(btrim(category)) BETWEEN 1 AND 50),
  CONSTRAINT creator_tool_presets_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT creator_tool_presets_version_check CHECK (current_version_number >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_tool_presets_admin_name_uidx
  ON creator_tool_presets (admin_user_id, lower(btrim(name)))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS creator_tool_presets_admin_updated_idx
  ON creator_tool_presets (admin_user_id, updated_at DESC, id DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS creator_tool_preset_versions (
  id uuid PRIMARY KEY,
  preset_id uuid NOT NULL REFERENCES creator_tool_presets(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  created_by_member_id uuid REFERENCES team_members(id) ON DELETE SET NULL,
  topology_json jsonb NOT NULL,
  node_count integer NOT NULL,
  edge_count integer NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_tool_preset_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT creator_tool_preset_versions_topology_check CHECK (
    jsonb_typeof(topology_json) = 'object'
    AND topology_json ->> 'schemaVersion' = '1'
    AND jsonb_typeof(topology_json -> 'nodes') = 'array'
    AND jsonb_typeof(topology_json -> 'connections') = 'array'
    AND jsonb_array_length(topology_json -> 'nodes') = node_count
    AND jsonb_array_length(topology_json -> 'connections') = edge_count
  ),
  CONSTRAINT creator_tool_preset_versions_node_count_check CHECK (node_count BETWEEN 1 AND 100),
  CONSTRAINT creator_tool_preset_versions_edge_count_check CHECK (edge_count BETWEEN 0 AND 300),
  CONSTRAINT creator_tool_preset_versions_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT creator_tool_preset_versions_number_unique UNIQUE (preset_id, version_number)
);

CREATE INDEX IF NOT EXISTS creator_tool_preset_versions_preset_created_idx
  ON creator_tool_preset_versions (preset_id, version_number DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'creator_tool_presets_current_version_fkey'
      AND conrelid = 'creator_tool_presets'::regclass
  ) THEN
    ALTER TABLE creator_tool_presets
      ADD CONSTRAINT creator_tool_presets_current_version_fkey
      FOREIGN KEY (id, current_version_number)
      REFERENCES creator_tool_preset_versions(preset_id, version_number)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$$;
