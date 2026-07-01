ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credit_balance_cached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_reserved_cached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_frozen_cached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_frozen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS credit_frozen_until timestamptz NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_credit_balance_cached_check,
  ADD CONSTRAINT users_credit_balance_cached_check
    CHECK (credit_balance_cached >= 0);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_credit_reserved_cached_check,
  ADD CONSTRAINT users_credit_reserved_cached_check
    CHECK (credit_reserved_cached >= 0);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_credit_frozen_cached_check,
  ADD CONSTRAINT users_credit_frozen_cached_check
    CHECK (credit_frozen_cached >= 0);

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_credit_frozen_window_check,
  ADD CONSTRAINT users_credit_frozen_window_check
    CHECK (
      (credit_frozen_cached = 0 AND credit_frozen_at IS NULL AND credit_frozen_until IS NULL)
      OR
      (credit_frozen_cached > 0 AND credit_frozen_at IS NOT NULL AND credit_frozen_until IS NOT NULL AND credit_frozen_until > credit_frozen_at)
    );

ALTER TABLE credit_reservations
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id);

ALTER TABLE credit_reservation_allocations
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id);

ALTER TABLE credit_ledger_entries
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id);

ALTER TABLE credit_lots
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id);

ALTER TABLE credit_reservation_lot_allocations
  ADD COLUMN IF NOT EXISTS user_id uuid NULL REFERENCES users(id);

ALTER TABLE credit_reservation_lot_allocations
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE credit_reservation_lot_allocations
  DROP CONSTRAINT IF EXISTS credit_reservation_lot_allocations_organization_id_fkey;

ALTER TABLE credit_reservation_lot_allocations
  DROP CONSTRAINT IF EXISTS credit_reservation_lot_allocations_organization_id_check;

UPDATE credit_reservation_lot_allocations
SET organization_id = NULL
WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_reservation_lot_allocations_user_reservation_idx
  ON credit_reservation_lot_allocations (user_id, reservation_id, status)
  WHERE user_id IS NOT NULL;

WITH personal_wallets AS (
  SELECT
    m.user_id,
    sum(o.credit_balance_cached)::int AS available,
    sum(o.credit_reserved_cached)::int AS reserved,
    sum(COALESCE(o.credit_frozen_cached, 0))::int AS frozen,
    min(o.credit_frozen_at) FILTER (WHERE COALESCE(o.credit_frozen_cached, 0) > 0) AS frozen_at,
    max(o.credit_frozen_until) FILTER (WHERE COALESCE(o.credit_frozen_cached, 0) > 0) AS frozen_until
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  LEFT JOIN team_member_profiles tp ON tp.membership_id = m.id
  WHERE o.name = 'Personal Creator Workspace'
    AND m.role = 'owner_admin'
    AND tp.id IS NULL
  GROUP BY m.user_id
),
member_wallets AS (
  SELECT
    m.user_id,
    sum(tp.credit_balance_cached)::int AS available
  FROM memberships m
  JOIN team_member_profiles tp ON tp.membership_id = m.id
  GROUP BY m.user_id
),
wallets AS (
  SELECT
    u.id AS user_id,
    COALESCE(p.available, 0) + COALESCE(t.available, 0) AS available,
    COALESCE(p.reserved, 0) AS reserved,
    COALESCE(p.frozen, 0) AS frozen,
    p.frozen_at,
    p.frozen_until
  FROM users u
  LEFT JOIN personal_wallets p ON p.user_id = u.id
  LEFT JOIN member_wallets t ON t.user_id = u.id
)
UPDATE users u
SET credit_balance_cached = wallets.available,
    credit_reserved_cached = wallets.reserved,
    credit_frozen_cached = wallets.frozen,
    credit_frozen_at = CASE WHEN wallets.frozen > 0 THEN wallets.frozen_at ELSE NULL END,
    credit_frozen_until = CASE WHEN wallets.frozen > 0 THEN wallets.frozen_until ELSE NULL END,
    updated_at = now()
FROM wallets
WHERE wallets.user_id = u.id;

WITH reservation_user_candidates AS (
  SELECT
    r.id,
    COALESCE(
      CASE
        WHEN NULLIF(r.metadata_json->>'targetUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NULLIF(r.metadata_json->>'targetUserId', '')::uuid
        ELSE NULL
      END,
      r.created_by_user_id,
      workflow_owner.created_by_user_id,
      task_owner.created_by_user_id,
      membership_owner.user_id
    ) AS user_id
  FROM credit_reservations r
  LEFT JOIN workflows workflow_owner
    ON workflow_owner.organization_id = r.organization_id
   AND workflow_owner.id = r.workflow_id
  LEFT JOIN tasks task
    ON task.organization_id = r.organization_id
   AND task.id = r.task_id
  LEFT JOIN workflows task_owner
    ON task_owner.organization_id = task.organization_id
   AND task_owner.id = task.workflow_id
  LEFT JOIN LATERAL (
    SELECT user_id
    FROM memberships
    WHERE organization_id = r.organization_id
      AND role = 'owner_admin'
    ORDER BY created_at ASC
    LIMIT 1
  ) membership_owner ON true
  WHERE r.user_id IS NULL
)
UPDATE credit_reservations r
SET user_id = reservation_user_candidates.user_id
FROM reservation_user_candidates
WHERE reservation_user_candidates.id = r.id
  AND reservation_user_candidates.user_id IS NOT NULL;

UPDATE credit_reservation_allocations allocation
SET user_id = reservation.user_id
FROM credit_reservations reservation
WHERE allocation.reservation_id = reservation.id
  AND allocation.user_id IS NULL;

WITH ledger_user_candidates AS (
  SELECT
    ledger.id,
    COALESCE(
      CASE
        WHEN NULLIF(ledger.metadata_json->>'targetUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NULLIF(ledger.metadata_json->>'targetUserId', '')::uuid
        ELSE NULL
      END,
      ledger.created_by_user_id,
      reservation.user_id,
      billing_order.created_by_user_id,
      membership_order.created_by_user_id,
      membership_owner.user_id
    ) AS user_id
  FROM credit_ledger_entries ledger
  LEFT JOIN credit_reservations reservation
    ON reservation.organization_id = ledger.organization_id
   AND reservation.id = ledger.reservation_id
  LEFT JOIN billing_orders billing_order
    ON ledger.source_type = 'payment_order'
   AND billing_order.id = ledger.source_id
  LEFT JOIN membership_periods membership_period
    ON ledger.source_type = 'membership_gift'
   AND membership_period.id = ledger.source_id
  LEFT JOIN billing_orders membership_order
    ON membership_order.organization_id = membership_period.organization_id
   AND membership_order.id = membership_period.order_id
  LEFT JOIN LATERAL (
    SELECT user_id
    FROM memberships
    WHERE organization_id = ledger.organization_id
      AND role = 'owner_admin'
    ORDER BY created_at ASC
    LIMIT 1
  ) membership_owner ON true
  WHERE ledger.user_id IS NULL
)
UPDATE credit_ledger_entries ledger
SET user_id = ledger_user_candidates.user_id
FROM ledger_user_candidates
WHERE ledger_user_candidates.id = ledger.id
  AND ledger_user_candidates.user_id IS NOT NULL;

UPDATE credit_lots lot
SET user_id = ledger.user_id
FROM credit_ledger_entries ledger
WHERE lot.grant_ledger_entry_id = ledger.id
  AND lot.user_id IS NULL;

UPDATE credit_reservation_lot_allocations allocation
SET user_id = reservation.user_id
FROM credit_reservations reservation
WHERE allocation.reservation_id = reservation.id
  AND allocation.user_id IS NULL;

WITH reserved_by_user AS (
  SELECT
    user_id,
    COALESCE(sum(amount_reserved), 0)::int AS reserved
  FROM credit_reservations
  WHERE user_id IS NOT NULL
    AND status = 'active'
  GROUP BY user_id
)
UPDATE users u
SET credit_reserved_cached = COALESCE(reserved_by_user.reserved, 0),
    updated_at = now()
FROM reserved_by_user
WHERE reserved_by_user.user_id = u.id;

UPDATE users u
SET credit_reserved_cached = 0,
    updated_at = now()
WHERE credit_reserved_cached <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM credit_reservations r
    WHERE r.user_id = u.id
      AND r.status = 'active'
  );

CREATE INDEX IF NOT EXISTS credit_reservations_user_status_idx
  ON credit_reservations (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_reservation_allocations_user_status_idx
  ON credit_reservation_allocations (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_entries_user_created_idx
  ON credit_ledger_entries (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_lots_user_spend_order_idx
  ON credit_lots (user_id, expires_at ASC, created_at ASC)
  WHERE user_id IS NOT NULL AND available_amount > 0;
