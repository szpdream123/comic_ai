ALTER TABLE credit_packages
  ADD COLUMN IF NOT EXISTS subtitle text NULL,
  ADD COLUMN IF NOT EXISTS gift_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge text NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE credit_packages
  DROP CONSTRAINT IF EXISTS credit_packages_gift_credits_check,
  ADD CONSTRAINT credit_packages_gift_credits_check
    CHECK (gift_credits >= 0);

ALTER TABLE credit_packages
  DROP CONSTRAINT IF EXISTS credit_packages_validity_window_check,
  ADD CONSTRAINT credit_packages_validity_window_check
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);

DROP INDEX IF EXISTS credit_packages_active_idx;

CREATE INDEX IF NOT EXISTS credit_packages_active_idx
  ON credit_packages (status, sort_order, amount_minor, valid_from, valid_until);

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
        'transfer_in'
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
        AND available_delta = -amount
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
    );

CREATE TABLE IF NOT EXISTS credit_wallet_transfers (
  id uuid PRIMARY KEY,
  source_organization_id uuid NOT NULL REFERENCES organizations(id),
  target_organization_id uuid NOT NULL REFERENCES organizations(id),
  operator_user_id uuid NOT NULL REFERENCES users(id),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  source_ledger_entry_id uuid NULL REFERENCES credit_ledger_entries(id),
  target_ledger_entry_id uuid NULL REFERENCES credit_ledger_entries(id),
  idempotency_key text NOT NULL,
  failure_code text NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_organization_id <> target_organization_id),
  UNIQUE (source_organization_id, operator_user_id, idempotency_key),
  CONSTRAINT credit_wallet_transfers_source_ledger_fk
    FOREIGN KEY (source_organization_id, source_ledger_entry_id)
    REFERENCES credit_ledger_entries (organization_id, id),
  CONSTRAINT credit_wallet_transfers_target_ledger_fk
    FOREIGN KEY (target_organization_id, target_ledger_entry_id)
    REFERENCES credit_ledger_entries (organization_id, id)
);

CREATE INDEX IF NOT EXISTS credit_wallet_transfers_source_idx
  ON credit_wallet_transfers (source_organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_wallet_transfers_target_idx
  ON credit_wallet_transfers (target_organization_id, created_at DESC);
