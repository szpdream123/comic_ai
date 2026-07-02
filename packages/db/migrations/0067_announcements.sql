CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  action_label text NOT NULL DEFAULT '',
  action_url text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  sort_order integer NOT NULL DEFAULT 100,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_active_window_idx
  ON announcements (status, starts_at, ends_at, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS announcements_admin_list_idx
  ON announcements (status, sort_order, updated_at DESC);
