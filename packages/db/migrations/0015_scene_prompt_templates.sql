CREATE TABLE IF NOT EXISTS scene_prompt_templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  stage text NOT NULL,
  model_family text NOT NULL DEFAULT 'general',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  json_schema text NOT NULL DEFAULT '',
  prompt_content text NOT NULL,
  negative_prompt text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  is_default boolean NOT NULL DEFAULT false,
  remark text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (stage IN ('split', 'extract', 'merge', 'detail', 'image')),
  CHECK (model_family IN ('general', 'doubao', 'seedream')),
  CHECK (status IN ('enabled', 'disabled')),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS scene_prompt_templates_lookup_idx
  ON scene_prompt_templates (stage, model_family, status, sort_order DESC)
  WHERE deleted_at IS NULL;
