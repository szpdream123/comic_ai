CREATE TABLE IF NOT EXISTS home_background_settings (
  id text PRIMARY KEY CHECK (id = 'homepage'),
  video_url text NOT NULL DEFAULT '',
  poster_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO home_background_settings (id)
VALUES ('homepage')
ON CONFLICT (id) DO NOTHING;
