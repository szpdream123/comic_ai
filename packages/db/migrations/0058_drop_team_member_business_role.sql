ALTER TABLE team_member_profiles
  DROP COLUMN IF EXISTS business_role;

DROP INDEX IF EXISTS team_member_profiles_scope_idx;

CREATE INDEX IF NOT EXISTS team_member_profiles_scope_idx
  ON team_member_profiles (organization_id, workspace_id, member_group_id);
