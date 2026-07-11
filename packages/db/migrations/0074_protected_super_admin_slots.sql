ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS super_admin_slot integer NULL;

ALTER TABLE admin_accounts
  DROP CONSTRAINT IF EXISTS admin_accounts_super_admin_slot_check,
  ADD CONSTRAINT admin_accounts_super_admin_slot_check
    CHECK (super_admin_slot IS NULL OR super_admin_slot > 0);

CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_super_admin_slot_unique
  ON admin_accounts (super_admin_slot)
  WHERE super_admin_slot IS NOT NULL;
