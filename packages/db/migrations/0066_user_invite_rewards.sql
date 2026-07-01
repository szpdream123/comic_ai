ALTER TABLE membership_plans
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS usage_scene text NOT NULL DEFAULT 'purchase';

ALTER TABLE membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_visibility_check,
  ADD CONSTRAINT membership_plans_visibility_check
    CHECK (visibility IN ('public', 'internal'));

ALTER TABLE membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_usage_scene_check,
  ADD CONSTRAINT membership_plans_usage_scene_check
    CHECK (usage_scene IN ('purchase', 'invite_new_user', 'invite_inviter', 'manual_gift', 'test'));

CREATE INDEX IF NOT EXISTS membership_plans_visibility_status_idx
  ON membership_plans (visibility, status, usage_scene);

CREATE TABLE IF NOT EXISTS invite_reward_configs (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  new_user_plan_id uuid NULL REFERENCES membership_plans(id),
  new_user_gift_credits integer NOT NULL DEFAULT 0 CHECK (new_user_gift_credits >= 0),
  inviter_plan_id uuid NULL REFERENCES membership_plans(id),
  inviter_gift_credits integer NOT NULL DEFAULT 0 CHECK (inviter_gift_credits >= 0),
  rebate_percent numeric(6, 3) NOT NULL DEFAULT 3.000 CHECK (rebate_percent >= 0),
  rebate_window_days integer NOT NULL DEFAULT 30 CHECK (rebate_window_days >= 0),
  rebate_credit_rate integer NOT NULL DEFAULT 100 CHECK (rebate_credit_rate >= 0),
  per_invited_user_rebate_cap_minor integer NULL CHECK (per_invited_user_rebate_cap_minor IS NULL OR per_invited_user_rebate_cap_minor >= 0),
  per_inviter_period_rebate_cap_minor integer NULL CHECK (per_inviter_period_rebate_cap_minor IS NULL OR per_inviter_period_rebate_cap_minor >= 0),
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invite_reward_configs_single_active_idx
  ON invite_reward_configs (status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS user_invite_bindings (
  id uuid PRIMARY KEY,
  invited_user_id uuid NOT NULL REFERENCES users(id),
  inviter_user_id uuid NOT NULL REFERENCES users(id),
  invite_code text NOT NULL,
  bound_at timestamptz NOT NULL DEFAULT now(),
  rebate_valid_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'invalid', 'revoked')),
  config_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invited_user_id),
  CHECK (invited_user_id <> inviter_user_id)
);

CREATE INDEX IF NOT EXISTS user_invite_bindings_inviter_idx
  ON user_invite_bindings (inviter_user_id, bound_at DESC);

CREATE INDEX IF NOT EXISTS user_invite_bindings_rebate_window_idx
  ON user_invite_bindings (invited_user_id, status, rebate_valid_until);

CREATE TABLE IF NOT EXISTS invite_reward_grants (
  id uuid PRIMARY KEY,
  binding_id uuid NOT NULL REFERENCES user_invite_bindings(id),
  recipient_user_id uuid NOT NULL REFERENCES users(id),
  reward_type text NOT NULL CHECK (reward_type IN ('new_user_trial', 'inviter_trial', 'inviter_rebate')),
  source_type text NOT NULL CHECK (source_type IN ('invite_binding', 'billing_order')),
  source_id uuid NOT NULL,
  membership_period_id uuid NULL,
  credit_ledger_entry_id uuid NULL,
  amount_minor integer NULL CHECK (amount_minor IS NULL OR amount_minor >= 0),
  credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'granted', 'skipped', 'failed', 'revoked')),
  reason text NULL,
  config_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (binding_id, reward_type, source_type, source_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS invite_reward_grants_recipient_idx
  ON invite_reward_grants (recipient_user_id, created_at DESC);
