import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export function createInviteRewardAdminService(deps: { db: SqlDatabase }) {
  async function getConfig() {
    const row = await queryOne<InviteRewardConfigRow>(
      deps.db,
      `
        SELECT *
        FROM invite_reward_configs
        WHERE status = 'active'
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1
      `,
    );
    return { data: { config: row ? configFromRow(row) : defaultConfig() } };
  }

  async function saveConfig(input: SaveInviteRewardConfigInput) {
    const parsed = parseSaveInput(input);
    if ("error" in parsed) {
      return parsed.error;
    }

    const current = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM invite_reward_configs WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1",
    );
    const id = current?.id ?? randomUUID();
    const row = await queryOne<InviteRewardConfigRow>(
      deps.db,
      `
        INSERT INTO invite_reward_configs (
          id,
          status,
          new_user_plan_id,
          new_user_gift_credits,
          inviter_plan_id,
          inviter_gift_credits,
          rebate_percent,
          rebate_window_days,
          rebate_credit_rate,
          per_invited_user_rebate_cap_minor,
          per_inviter_period_rebate_cap_minor,
          updated_by_admin_id,
          created_at,
          updated_at
        )
        VALUES ($1, 'active', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
        ON CONFLICT (id)
        DO UPDATE SET
          status = 'active',
          new_user_plan_id = EXCLUDED.new_user_plan_id,
          new_user_gift_credits = EXCLUDED.new_user_gift_credits,
          inviter_plan_id = EXCLUDED.inviter_plan_id,
          inviter_gift_credits = EXCLUDED.inviter_gift_credits,
          rebate_percent = EXCLUDED.rebate_percent,
          rebate_window_days = EXCLUDED.rebate_window_days,
          rebate_credit_rate = EXCLUDED.rebate_credit_rate,
          per_invited_user_rebate_cap_minor = EXCLUDED.per_invited_user_rebate_cap_minor,
          per_inviter_period_rebate_cap_minor = EXCLUDED.per_inviter_period_rebate_cap_minor,
          updated_by_admin_id = EXCLUDED.updated_by_admin_id,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `,
      [
        id,
        parsed.value.newUserPlanId,
        parsed.value.newUserGiftCredits,
        parsed.value.inviterPlanId,
        parsed.value.inviterGiftCredits,
        parsed.value.rebatePercent,
        parsed.value.rebateWindowDays,
        parsed.value.rebateCreditRate,
        parsed.value.perInvitedUserRebateCapMinor,
        parsed.value.perInviterPeriodRebateCapMinor,
        parsed.value.actorAdminAccountId,
        parsed.value.now,
      ],
    );

    return { status: 200, body: { config: configFromRow(row!) } };
  }

  return { getConfig, saveConfig };
}

export interface SaveInviteRewardConfigInput {
  newUserPlanId?: string | null;
  newUserGiftCredits: number;
  inviterPlanId?: string | null;
  inviterGiftCredits: number;
  rebatePercent: number;
  rebateWindowDays: number;
  rebateCreditRate: number;
  perInvitedUserRebateCapMinor?: number | null;
  perInviterPeriodRebateCapMinor?: number | null;
  actorAdminAccountId?: string | null;
  now: Date;
}

interface ParsedSaveInput {
  newUserPlanId: string | null;
  newUserGiftCredits: number;
  inviterPlanId: string | null;
  inviterGiftCredits: number;
  rebatePercent: number;
  rebateWindowDays: number;
  rebateCreditRate: number;
  perInvitedUserRebateCapMinor: number | null;
  perInviterPeriodRebateCapMinor: number | null;
  actorAdminAccountId: string | null;
  now: Date;
}

interface InviteRewardConfigRow {
  id: string;
  status: string;
  new_user_plan_id: string | null;
  new_user_gift_credits: number | string;
  inviter_plan_id: string | null;
  inviter_gift_credits: number | string;
  rebate_percent: number | string;
  rebate_window_days: number | string;
  rebate_credit_rate: number | string;
  per_invited_user_rebate_cap_minor: number | string | null;
  per_inviter_period_rebate_cap_minor: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parseSaveInput(input: SaveInviteRewardConfigInput):
  | { value: ParsedSaveInput }
  | { error: { status: number; body: { error: { code: string; message: string } } } } {
  const newUserGiftCredits = Number(input.newUserGiftCredits);
  const inviterGiftCredits = Number(input.inviterGiftCredits);
  const rebatePercent = Number(input.rebatePercent);
  const rebateWindowDays = Number(input.rebateWindowDays);
  const rebateCreditRate = Number(input.rebateCreditRate);
  const perInvitedUserRebateCapMinor = optionalNonNegativeInteger(input.perInvitedUserRebateCapMinor);
  const perInviterPeriodRebateCapMinor = optionalNonNegativeInteger(input.perInviterPeriodRebateCapMinor);

  if (!Number.isInteger(newUserGiftCredits) || newUserGiftCredits < 0) {
    return error(400, "invalid_new_user_gift_credits", "new user gift credits must be non-negative");
  }
  if (!Number.isInteger(inviterGiftCredits) || inviterGiftCredits < 0) {
    return error(400, "invalid_inviter_gift_credits", "inviter gift credits must be non-negative");
  }
  if (!Number.isFinite(rebatePercent) || rebatePercent < 0 || rebatePercent > 100) {
    return error(400, "invalid_rebate_percent", "rebate percent must be between 0 and 100");
  }
  if (!Number.isInteger(rebateWindowDays) || rebateWindowDays < 0) {
    return error(400, "invalid_rebate_window_days", "rebate window days must be non-negative");
  }
  if (!Number.isInteger(rebateCreditRate) || rebateCreditRate < 0) {
    return error(400, "invalid_rebate_credit_rate", "rebate credit rate must be non-negative");
  }

  return {
    value: {
      newUserPlanId: nullableUuid(input.newUserPlanId),
      newUserGiftCredits,
      inviterPlanId: nullableUuid(input.inviterPlanId),
      inviterGiftCredits,
      rebatePercent,
      rebateWindowDays,
      rebateCreditRate,
      perInvitedUserRebateCapMinor,
      perInviterPeriodRebateCapMinor,
      actorAdminAccountId: input.actorAdminAccountId?.trim() || null,
      now: input.now,
    },
  };
}

function configFromRow(row: InviteRewardConfigRow) {
  return {
    id: row.id,
    status: row.status,
    newUserPlanId: row.new_user_plan_id,
    newUserGiftCredits: Number(row.new_user_gift_credits ?? 0),
    inviterPlanId: row.inviter_plan_id,
    inviterGiftCredits: Number(row.inviter_gift_credits ?? 0),
    rebatePercent: Number(row.rebate_percent ?? 0),
    rebateWindowDays: Number(row.rebate_window_days ?? 0),
    rebateCreditRate: Number(row.rebate_credit_rate ?? 0),
    perInvitedUserRebateCapMinor: optionalNonNegativeInteger(row.per_invited_user_rebate_cap_minor),
    perInviterPeriodRebateCapMinor: optionalNonNegativeInteger(row.per_inviter_period_rebate_cap_minor),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function defaultConfig() {
  return {
    id: null,
    status: "inactive",
    newUserPlanId: null,
    newUserGiftCredits: 30,
    inviterPlanId: null,
    inviterGiftCredits: 30,
    rebatePercent: 3,
    rebateWindowDays: 30,
    rebateCreditRate: 100,
    perInvitedUserRebateCapMinor: null,
    perInviterPeriodRebateCapMinor: null,
    createdAt: null,
    updatedAt: null,
  };
}

function optionalNonNegativeInteger(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableUuid(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized && isUuid(normalized) ? normalized : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function error(status: number, code: string, message: string) {
  return { error: { status, body: { error: { code, message } } } };
}
