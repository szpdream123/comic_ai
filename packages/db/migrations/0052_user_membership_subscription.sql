ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS membership_tier text NULL CHECK (
    membership_tier IS NULL
    OR membership_tier IN ('none', 'experience', 'professional')
  ),
  ADD COLUMN IF NOT EXISTS purchase_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS gift_credits integer NOT NULL DEFAULT 0 CHECK (gift_credits >= 0);

UPDATE memberships
SET
  membership_tier = COALESCE(membership_tier, 'none'),
  gift_credits = COALESCE(gift_credits, 0)
WHERE membership_tier IS NULL;

CREATE INDEX IF NOT EXISTS memberships_user_tier_expiry_idx
  ON memberships (user_id, membership_tier, expires_at DESC, updated_at DESC);
