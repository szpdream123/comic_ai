CREATE TABLE IF NOT EXISTS character_prompt_templates (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  stage text NOT NULL,
  model_family text NOT NULL DEFAULT 'general',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  chunk_min_chars integer NOT NULL DEFAULT 0,
  chunk_max_chars integer NOT NULL DEFAULT 0,
  overlap_chars integer NOT NULL DEFAULT 0,
  json_schema text NULL,
  prompt_content text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  remark text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (stage IN ('extract')),
  CHECK (model_family IN ('general', 'doubao', 'seedream')),
  CHECK (status IN ('enabled', 'disabled')),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS character_prompt_templates_stage_status_idx
  ON character_prompt_templates (stage, status, sort_order DESC)
  WHERE deleted_at IS NULL;
