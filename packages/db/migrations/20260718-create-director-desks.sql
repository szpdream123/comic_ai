CREATE TABLE IF NOT EXISTS director_desks (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_by_member_id uuid,
  desk_key text NOT NULL,
  name text NOT NULL,
  scene_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_opened_at timestamptz,
  CONSTRAINT director_desks_pkey PRIMARY KEY (id),
  CONSTRAINT director_desks_user_desk_key_key UNIQUE (user_id, desk_key),
  CONSTRAINT director_desks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT director_desks_created_by_member_id_user_id_fkey
    FOREIGN KEY (created_by_member_id, user_id) REFERENCES team_members(id, user_id),
  CONSTRAINT director_desks_desk_key_check CHECK (btrim(desk_key) <> ''),
  CONSTRAINT director_desks_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT director_desks_scene_json_check CHECK (jsonb_typeof(scene_json) = 'object'::text),
  CONSTRAINT director_desks_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT director_desks_status_check CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]))
);

CREATE INDEX IF NOT EXISTS director_desks_user_status_updated_idx
  ON director_desks (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS director_desks_member_updated_idx
  ON director_desks (created_by_member_id, updated_at DESC)
  WHERE created_by_member_id IS NOT NULL;
