CREATE TABLE IF NOT EXISTS image_prompt_styles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'official',
  model_family text NOT NULL DEFAULT 'doubao',
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_image_url text NULL,
  prompt_content text NOT NULL,
  negative_prompt text NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  remark text NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CHECK (category IN ('official', 'custom')),
  CHECK (model_family IN ('doubao', 'seedream', 'general')),
  CHECK (status IN ('enabled', 'disabled')),
  CHECK (code ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS image_prompt_styles_lookup_idx
  ON image_prompt_styles (category, model_family, status, sort_order DESC)
  WHERE deleted_at IS NULL;
