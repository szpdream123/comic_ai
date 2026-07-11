UPDATE invite_reward_configs
SET per_invited_user_rebate_cap_minor = per_inviter_period_rebate_cap_minor,
    per_inviter_period_rebate_cap_minor = NULL,
    updated_at = now()
WHERE per_invited_user_rebate_cap_minor IS NULL
  AND per_inviter_period_rebate_cap_minor IS NOT NULL;

UPDATE user_invite_bindings
SET config_snapshot_json = jsonb_set(
      jsonb_set(
        config_snapshot_json,
        '{perInvitedUserRebateCapMinor}',
        config_snapshot_json->'perInviterPeriodRebateCapMinor',
        true
      ),
      '{perInviterPeriodRebateCapMinor}',
      'null'::jsonb,
      true
    ),
    updated_at = now()
WHERE (NOT config_snapshot_json ? 'perInvitedUserRebateCapMinor'
       OR config_snapshot_json->'perInvitedUserRebateCapMinor' = 'null'::jsonb)
  AND config_snapshot_json->'perInviterPeriodRebateCapMinor' IS NOT NULL
  AND config_snapshot_json->'perInviterPeriodRebateCapMinor' <> 'null'::jsonb;
