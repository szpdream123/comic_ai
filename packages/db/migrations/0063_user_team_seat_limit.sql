ALTER TABLE users
  ADD COLUMN IF NOT EXISTS team_seat_limit integer NOT NULL DEFAULT 0 CHECK (team_seat_limit >= 0);

UPDATE users u
SET team_seat_limit = legacy_limits.seat_limit
FROM (
  SELECT
    m.user_id,
    MAX(tpl.seat_limit) AS seat_limit
  FROM memberships m
  JOIN team_plan_limits tpl
    ON tpl.organization_id = m.organization_id
  WHERE m.status = 'active'
  GROUP BY m.user_id
) legacy_limits
WHERE u.id = legacy_limits.user_id
  AND u.team_seat_limit = 0
  AND legacy_limits.seat_limit > 0;
