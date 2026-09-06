CREATE TABLE IF NOT EXISTS skills (
  id uuid PRIMARY KEY,
  owner_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  author_name text NOT NULL DEFAULT '',
  author_avatar_url text NULL,
  cover_storage_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE SET NULL,
  preview_storage_object_id uuid NULL REFERENCES storage_objects(id) ON DELETE SET NULL,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'published',
  visibility text NOT NULL DEFAULT 'public',
  usage_count integer NOT NULL DEFAULT 0,
  favorite_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skills_status_check CHECK (status IN ('draft', 'published', 'disabled')),
  CONSTRAINT skills_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT skills_counts_check CHECK (usage_count >= 0 AND favorite_count >= 0)
);

CREATE INDEX IF NOT EXISTS skills_catalog_idx
  ON skills (status, visibility, category, usage_count DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS skill_files (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_kind text NOT NULL DEFAULT 'instruction',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT skill_files_kind_check CHECK (file_kind IN ('instruction', 'template', 'example', 'script', 'other')),
  CONSTRAINT skill_files_order_check CHECK (sort_order >= 0),
  CONSTRAINT skill_files_unique_name UNIQUE (skill_id, file_name)
);

CREATE INDEX IF NOT EXISTS skill_files_skill_order_idx
  ON skill_files (skill_id, sort_order, file_name);

CREATE TABLE IF NOT EXISTS skill_library (
  id uuid PRIMARY KEY,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NULL,
  CONSTRAINT skill_library_unique UNIQUE (skill_id, user_id)
);

CREATE INDEX IF NOT EXISTS skill_library_user_idx
  ON skill_library (user_id, created_at DESC);
