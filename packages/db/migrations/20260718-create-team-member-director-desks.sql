CREATE TABLE IF NOT EXISTS team_member_director_desks (
  id uuid NOT NULL,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  director_desk_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT team_member_director_desks_pkey PRIMARY KEY (id),
  CONSTRAINT team_member_director_desks_member_id_director_desk_id_key UNIQUE (member_id, director_desk_id),
  CONSTRAINT team_member_director_desks_member_id_user_id_fkey
    FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id),
  CONSTRAINT team_member_director_desks_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT team_member_director_desks_director_desk_id_fkey FOREIGN KEY (director_desk_id) REFERENCES director_desks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS team_member_director_desks_member_idx
  ON team_member_director_desks (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_director_desks_user_desk_idx
  ON team_member_director_desks (user_id, director_desk_id);
