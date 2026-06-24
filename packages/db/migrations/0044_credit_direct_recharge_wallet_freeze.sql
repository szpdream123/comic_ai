ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS credit_frozen_cached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_frozen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS credit_frozen_until timestamptz NULL;

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_credit_frozen_cached_check,
  ADD CONSTRAINT organizations_credit_frozen_cached_check
    CHECK (credit_frozen_cached >= 0);

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_credit_frozen_window_check,
  ADD CONSTRAINT organizations_credit_frozen_window_check
    CHECK (
      (credit_frozen_cached = 0 AND credit_frozen_at IS NULL AND credit_frozen_until IS NULL)
      OR
      (credit_frozen_cached > 0 AND credit_frozen_at IS NOT NULL AND credit_frozen_until IS NOT NULL AND credit_frozen_until > credit_frozen_at)
    );

ALTER TABLE credit_lots
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS frozen_until timestamptz NULL;

ALTER TABLE credit_lots
  DROP CONSTRAINT IF EXISTS credit_lots_status_check,
  ADD CONSTRAINT credit_lots_status_check
    CHECK (status IN ('active', 'frozen', 'expired'));

ALTER TABLE credit_lots
  DROP CONSTRAINT IF EXISTS credit_lots_frozen_window_check,
  ADD CONSTRAINT credit_lots_frozen_window_check
    CHECK (
      (status <> 'frozen' AND frozen_at IS NULL AND frozen_until IS NULL)
      OR
      (status = 'frozen' AND frozen_at IS NOT NULL AND frozen_until IS NOT NULL AND frozen_until > frozen_at)
    );

ALTER TABLE credit_ledger_entries
  DROP CONSTRAINT IF EXISTS credit_ledger_entries_entry_type_check,
  ADD CONSTRAINT credit_ledger_entries_entry_type_check
    CHECK (
      entry_type IN (
        'grant',
        'reservation',
        'consume',
        'release',
        'expire',
        'transfer_out',
        'transfer_in',
        'freeze',
        'restore'
      )
    );

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
        AND available_delta IN (-amount, 0)
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'transfer_out'
        AND available_delta = -amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'transfer_in'
        AND available_delta = amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'freeze'
        AND available_delta = -amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
      OR
      (
        entry_type = 'restore'
        AND available_delta = amount
        AND reserved_delta = 0
        AND consumed_delta = 0
      )
    );

DROP INDEX IF EXISTS credit_lots_spend_order_idx;

CREATE INDEX IF NOT EXISTS credit_lots_spend_order_idx
  ON credit_lots (organization_id, expires_at ASC, created_at ASC)
  WHERE available_amount > 0 AND status = 'active';

CREATE INDEX IF NOT EXISTS credit_lots_frozen_expiry_idx
  ON credit_lots (frozen_until ASC, created_at ASC)
  WHERE status = 'frozen' AND available_amount > 0;
