CREATE TABLE IF NOT EXISTS canvas_character_assets (
  id uuid PRIMARY KEY,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  scope text NOT NULL,
  canvas_id uuid NULL REFERENCES creator_canvas_projects(id) ON DELETE CASCADE,
  principal_key text NULL,
  name text NOT NULL,
  description_text text NOT NULL DEFAULT '',
  prompt_text text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  created_by_principal_key text NOT NULL,
  created_by_team_member_id uuid NULL REFERENCES team_members(id),
  updated_by_principal_key text NOT NULL,
  updated_by_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT canvas_character_assets_scope_check CHECK (scope IN ('canvas','global')),
  CONSTRAINT canvas_character_assets_scope_binding_check CHECK (
    (scope='canvas' AND canvas_id IS NOT NULL AND principal_key IS NULL)
    OR (scope='global' AND canvas_id IS NULL AND principal_key IS NOT NULL)
  ),
  CONSTRAINT canvas_character_assets_principal_key_check CHECK (
    principal_key IS NULL OR principal_key ~ '^(owner|member):[0-9a-fA-F-]{36}$'
  ),
  CONSTRAINT canvas_character_assets_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT canvas_character_assets_description_check CHECK (char_length(description_text) <= 4000),
  CONSTRAINT canvas_character_assets_prompt_check CHECK (char_length(prompt_text) <= 20000),
  CONSTRAINT canvas_character_assets_revision_check CHECK (revision >= 1)
);

CREATE INDEX IF NOT EXISTS canvas_character_assets_canvas_list_idx
  ON canvas_character_assets (owner_user_id,canvas_id,updated_at DESC,id DESC)
  WHERE scope='canvas' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS canvas_character_assets_global_list_idx
  ON canvas_character_assets (owner_user_id,principal_key,updated_at DESC,id DESC)
  WHERE scope='global' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS canvas_character_asset_references (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES canvas_character_assets(id) ON DELETE CASCADE,
  position integer NOT NULL,
  usage text NOT NULL DEFAULT 'reference',
  prompt_text text NOT NULL DEFAULT '',
  crop_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  is_avatar boolean NOT NULL DEFAULT false,
  storage_object_id uuid NULL REFERENCES storage_objects(id),
  asset_id uuid NULL REFERENCES assets(id),
  asset_version_id uuid NULL REFERENCES asset_versions(id),
  source_node_id text NULL,
  source_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_principal_key text NOT NULL,
  created_by_team_member_id uuid NULL REFERENCES team_members(id),
  updated_by_principal_key text NOT NULL,
  updated_by_team_member_id uuid NULL REFERENCES team_members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT canvas_character_asset_references_position_check CHECK (position >= 0),
  CONSTRAINT canvas_character_asset_references_usage_check CHECK (char_length(btrim(usage)) BETWEEN 1 AND 80),
  CONSTRAINT canvas_character_asset_references_prompt_check CHECK (char_length(prompt_text) <= 20000),
  CONSTRAINT canvas_character_asset_references_crop_check CHECK (jsonb_typeof(crop_json)='object'),
  CONSTRAINT canvas_character_asset_references_source_node_check CHECK (
    source_node_id IS NULL OR char_length(btrim(source_node_id)) BETWEEN 1 AND 160
  ),
  CONSTRAINT canvas_character_asset_references_source_snapshot_check CHECK (
    jsonb_typeof(source_snapshot_json)='object'
  ),
  CONSTRAINT canvas_character_asset_references_media_check CHECK (
    num_nonnulls(storage_object_id,asset_id,asset_version_id) >= 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS canvas_character_asset_references_position_uidx
  ON canvas_character_asset_references (character_id,position)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS canvas_character_asset_references_primary_uidx
  ON canvas_character_asset_references (character_id)
  WHERE is_primary=true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS canvas_character_asset_references_avatar_uidx
  ON canvas_character_asset_references (character_id)
  WHERE is_avatar=true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS canvas_character_asset_references_list_idx
  ON canvas_character_asset_references (character_id,position,id)
  WHERE deleted_at IS NULL;
