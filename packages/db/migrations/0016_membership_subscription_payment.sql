CREATE TABLE IF NOT EXISTS membership_plans (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('experience', 'professional')),
  period_unit text NOT NULL CHECK (period_unit IN ('day', 'month', 'quarter', 'year')),
  period_count integer NOT NULL CHECK (period_count > 0),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY')),
  gift_credits integer NOT NULL DEFAULT 0 CHECK (gift_credits >= 0),
  seat_limit integer NOT NULL DEFAULT 1 CHECK (seat_limit >= 1),
  entitlements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority_rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  valid_from timestamptz NULL,
  valid_until timestamptz NULL,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS membership_plans_active_idx
  ON membership_plans (tier, period_unit, period_count, valid_from, valid_until)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS membership_plan_revisions (
  id uuid PRIMARY KEY,
  plan_id uuid NOT NULL REFERENCES membership_plans(id),
  snapshot_json jsonb NOT NULL,
  changed_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_plan_revisions_plan_idx
  ON membership_plan_revisions (plan_id, created_at DESC);

ALTER TABLE billing_orders
  ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'credit_package',
  ADD COLUMN IF NOT EXISTS membership_plan_id uuid NULL,
  ADD COLUMN IF NOT EXISTS product_snapshot_json jsonb DEFAULT '{}'::jsonb;

UPDATE billing_orders
SET product_type = 'credit_package'
WHERE product_type IS NULL;

UPDATE billing_orders
SET product_snapshot_json = package_snapshot_json
WHERE product_type = 'credit_package'
  AND package_snapshot_json IS NOT NULL
  AND (
    product_snapshot_json IS NULL
    OR product_snapshot_json = '{}'::jsonb
  );

UPDATE billing_orders
SET product_snapshot_json = '{}'::jsonb
WHERE product_snapshot_json IS NULL;

ALTER TABLE billing_orders
  ALTER COLUMN product_type SET DEFAULT 'credit_package',
  ALTER COLUMN product_type SET NOT NULL,
  ALTER COLUMN product_snapshot_json SET DEFAULT '{}'::jsonb,
  ALTER COLUMN product_snapshot_json SET NOT NULL,
  ALTER COLUMN credit_package_id DROP NOT NULL;

ALTER TABLE billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_membership_plan_id_fkey,
  ADD CONSTRAINT billing_orders_membership_plan_id_fkey
    FOREIGN KEY (membership_plan_id)
    REFERENCES membership_plans(id);

ALTER TABLE billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_product_type_check,
  ADD CONSTRAINT billing_orders_product_type_check
    CHECK (product_type IN ('credit_package', 'membership_plan'));

ALTER TABLE billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_product_shape_check,
  ADD CONSTRAINT billing_orders_product_shape_check
    CHECK (
      (
        product_type = 'credit_package'
        AND credit_package_id IS NOT NULL
        AND membership_plan_id IS NULL
      )
      OR
      (
        product_type = 'membership_plan'
        AND membership_plan_id IS NOT NULL
        AND credit_package_id IS NULL
      )
    );

ALTER TABLE billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_credits_check;

ALTER TABLE billing_orders
  DROP CONSTRAINT IF EXISTS billing_orders_credits_product_shape_check,
  ADD CONSTRAINT billing_orders_credits_product_shape_check
    CHECK (
      (
        product_type = 'credit_package'
        AND credits > 0
      )
      OR
      (
        product_type = 'membership_plan'
        AND credits >= 0
      )
    );

DROP INDEX IF EXISTS billing_orders_paid_without_credit_idx;

CREATE INDEX IF NOT EXISTS billing_orders_paid_without_credit_idx
  ON billing_orders (organization_id, paid_at DESC)
  WHERE status = 'paid'
    AND product_type = 'credit_package'
    AND credit_grant_ledger_entry_id IS NULL;

CREATE TABLE IF NOT EXISTS organization_membership_subscriptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  status text NOT NULL CHECK (
    status IN (
      'none',
      'experience_active',
      'professional_active',
      'expired'
    )
  ),
  current_tier text NULL CHECK (
    current_tier IS NULL
    OR current_tier IN ('experience', 'professional')
  ),
  current_period_start_at timestamptz NULL,
  current_period_end_at timestamptz NULL,
  latest_order_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id),
  CHECK (
    current_period_end_at IS NULL
    OR current_period_start_at IS NULL
    OR current_period_end_at > current_period_start_at
  )
);

CREATE INDEX IF NOT EXISTS organization_membership_subscriptions_status_idx
  ON organization_membership_subscriptions (status, current_period_end_at);

ALTER TABLE organization_membership_subscriptions
  DROP CONSTRAINT IF EXISTS organization_membership_subscriptions_latest_order_id_fkey,
  DROP CONSTRAINT IF EXISTS organization_membership_subscriptions_latest_order_fk,
  ADD CONSTRAINT organization_membership_subscriptions_latest_order_fk
    FOREIGN KEY (organization_id, latest_order_id)
    REFERENCES billing_orders (organization_id, id);

CREATE TABLE IF NOT EXISTS membership_periods (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  order_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES membership_plans(id),
  tier text NOT NULL CHECK (tier IN ('experience', 'professional')),
  period_start_at timestamptz NOT NULL,
  period_end_at timestamptz NOT NULL,
  gift_credits integer NOT NULL DEFAULT 0 CHECK (gift_credits >= 0),
  plan_snapshot_json jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'manually_revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_id),
  CHECK (period_end_at > period_start_at)
);

CREATE INDEX IF NOT EXISTS membership_periods_org_status_idx
  ON membership_periods (organization_id, status, period_end_at DESC);

ALTER TABLE membership_periods
  DROP CONSTRAINT IF EXISTS membership_periods_order_id_fkey,
  DROP CONSTRAINT IF EXISTS membership_periods_order_fk,
  ADD CONSTRAINT membership_periods_order_fk
    FOREIGN KEY (organization_id, order_id)
    REFERENCES billing_orders (organization_id, id);

CREATE TABLE IF NOT EXISTS credit_lots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  grant_ledger_entry_id uuid NOT NULL,
  total_amount integer NOT NULL CHECK (total_amount > 0),
  available_amount integer NOT NULL DEFAULT 0 CHECK (available_amount >= 0),
  reserved_amount integer NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  consumed_amount integer NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0),
  expired_amount integer NOT NULL DEFAULT 0 CHECK (expired_amount >= 0),
  expires_at timestamptz NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, source_type, source_id, grant_ledger_entry_id),
  CONSTRAINT credit_lots_amounts_match
    CHECK (
      total_amount = available_amount + reserved_amount + consumed_amount + expired_amount
    )
);

CREATE INDEX IF NOT EXISTS credit_lots_spend_order_idx
  ON credit_lots (organization_id, expires_at ASC, created_at ASC)
  WHERE available_amount > 0;

ALTER TABLE credit_lots
  DROP CONSTRAINT IF EXISTS credit_lots_grant_ledger_entry_id_fkey,
  DROP CONSTRAINT IF EXISTS credit_lots_grant_ledger_entry_fk,
  ADD CONSTRAINT credit_lots_grant_ledger_entry_fk
    FOREIGN KEY (organization_id, grant_ledger_entry_id)
    REFERENCES credit_ledger_entries (organization_id, id);

CREATE TABLE IF NOT EXISTS credit_reservation_lot_allocations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reservation_id uuid NOT NULL REFERENCES credit_reservations(id),
  credit_lot_id uuid NOT NULL REFERENCES credit_lots(id),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (
    status IN (
      'reserved',
      'consumed',
      'released',
      'manual_review_required'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (reservation_id, credit_lot_id),
  FOREIGN KEY (organization_id, reservation_id)
    REFERENCES credit_reservations (organization_id, id),
  FOREIGN KEY (organization_id, credit_lot_id)
    REFERENCES credit_lots (organization_id, id)
);

CREATE INDEX IF NOT EXISTS credit_reservation_lot_allocations_reservation_idx
  ON credit_reservation_lot_allocations (organization_id, reservation_id, status);

ALTER TABLE credit_ledger_entries
  DROP CONSTRAINT IF EXISTS credit_ledger_entries_entry_type_check,
  ADD CONSTRAINT credit_ledger_entries_entry_type_check
    CHECK (entry_type IN ('grant', 'reservation', 'consume', 'release', 'expire'));

ALTER TABLE credit_ledger_entries
  DROP CONSTRAINT IF EXISTS credit_ledger_entries_delta_shape,
  ADD CONSTRAINT credit_ledger_entries_delta_shape
    CHECK (
      (
        entry_type = 'grant'
        AND available_delta = amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'reservation'
        AND available_delta = -amount
        AND reserved_delta = amount
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'consume'
        AND available_delta = 0
        AND reserved_delta = -amount
        AND consumed_delta = amount
      )
      OR
      (
        entry_type = 'release'
        AND available_delta = amount
        AND reserved_delta = -amount
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'expire'
        AND available_delta = -amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
    );

CREATE TABLE IF NOT EXISTS membership_reminders (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  membership_period_id uuid NOT NULL REFERENCES membership_periods(id),
  reminder_key text NOT NULL,
  remind_at timestamptz NOT NULL,
  delivered_at timestamptz NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, membership_period_id, reminder_key),
  FOREIGN KEY (organization_id, membership_period_id)
    REFERENCES membership_periods (organization_id, id)
);

CREATE INDEX IF NOT EXISTS membership_reminders_due_idx
  ON membership_reminders (remind_at, organization_id)
  WHERE delivered_at IS NULL;
