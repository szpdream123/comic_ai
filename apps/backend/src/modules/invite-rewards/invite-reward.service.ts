import { randomUUID } from "node:crypto";

import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import {
  grantCreditsInTransaction,
  type CreditLedgerEntryRecord,
} from "../credit-billing/credit-ledger.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { consumeOutboxEventWithIdempotentEffect } from "../shared/outbox/outbox-repair.contract.ts";
import { SqlInbox } from "../shared/outbox/sql-inbox.service.ts";
import { calculateMembershipWindow } from "../membership/membership-period.service.ts";

interface UserRow {
  id: string;
  invite_code: string;
  status: string;
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

interface InviteBindingRow {
  id: string;
  invited_user_id: string;
  inviter_user_id: string;
  invite_code: string;
  bound_at: Date | string;
  rebate_valid_until: Date | string;
  status: string;
  config_snapshot_json: unknown;
}

interface PaidOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
}

interface MembershipPlanRow {
  id: string;
  code: string;
  tier: string;
  period_unit: string;
  period_count: number;
  gift_credits: number;
  status: string;
  visibility: string;
}

interface PaymentSucceededPayload {
  order_id: string;
  payment_intent_id: string;
  payment_provider_event_id: string;
  amount_minor: number;
  currency: string;
}

export type InviteBindingResult =
  | { kind: "bound"; bindingId: string }
  | { kind: "ignored"; reason: string };

export async function bindInviteForNewUser(
  db: SqlDatabase,
  input: {
    invitedUserId: string;
    inviteCode: string | null | undefined;
    now: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<InviteBindingResult> {
  const inviteCode = normalizeInviteCode(input.inviteCode);
  if (!inviteCode) {
    return { kind: "ignored", reason: "missing_invite_code" };
  }

  await db.query("BEGIN");
  try {
    const config = await findActiveInviteRewardConfig(db);
    if (!config) {
      await db.query("COMMIT");
      return { kind: "ignored", reason: "invite_reward_config_inactive" };
    }

    const inviter = await queryOne<UserRow>(
      db,
      `
        SELECT id, invite_code, status
        FROM users
        WHERE invite_code = $1
        LIMIT 1
      `,
      [inviteCode],
    );
    if (!inviter || inviter.status !== "active" || inviter.id === input.invitedUserId) {
      await db.query("COMMIT");
      return { kind: "ignored", reason: "invalid_inviter" };
    }

    const snapshot = configSnapshot(config);
    const rebateValidUntil = addDays(input.now, snapshot.rebateWindowDays);
    const binding = await queryOne<InviteBindingRow>(
      db,
      `
        INSERT INTO user_invite_bindings (
          id,
          invited_user_id,
          inviter_user_id,
          invite_code,
          bound_at,
          rebate_valid_until,
          status,
          config_snapshot_json,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, $8::jsonb, $5, $5)
        ON CONFLICT (invited_user_id) DO NOTHING
        RETURNING *
      `,
      [
        randomUUID(),
        input.invitedUserId,
        inviter.id,
        inviteCode,
        input.now,
        rebateValidUntil,
        JSON.stringify(snapshot),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    if (!binding) {
      await db.query("COMMIT");
      return { kind: "ignored", reason: "already_bound" };
    }

    await grantBindingCredits(db, {
      binding,
      rewardType: "new_user_trial",
      recipientUserId: input.invitedUserId,
      credits: snapshot.newUserGiftCredits,
      planId: snapshot.newUserPlanId,
      sourceId: binding.id,
      reason: "邀请新用户体验积分",
      configSnapshot: snapshot,
      now: input.now,
    });
    await grantBindingCredits(db, {
      binding,
      rewardType: "inviter_trial",
      recipientUserId: inviter.id,
      credits: snapshot.inviterGiftCredits,
      planId: snapshot.inviterPlanId,
      sourceId: binding.id,
      reason: "邀请注册奖励积分",
      configSnapshot: snapshot,
      now: input.now,
    });

    await db.query("COMMIT");
    return { kind: "bound", bindingId: binding.id };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function consumeInviteRebateForPaymentSucceeded(
  db: SqlDatabase,
  input: {
    event: OutboxEventRecord;
    now: Date;
  },
): Promise<
  | { kind: "applied"; ledgerEntry: CreditLedgerEntryRecord | null }
  | { kind: "duplicate" }
  | { kind: "ignored" }
> {
  if (input.event.eventType !== eventTypes.paymentSucceeded) {
    throw new Error(`unsupported_event_type:${input.event.eventType}`);
  }

  const consumed = await consumeOutboxEventWithIdempotentEffect(new SqlInbox(db), {
    consumerName: "invite-reward.payment-succeeded",
    outboxEventId: input.event.id,
    effect: async () => {
      await db.query("BEGIN");
      try {
        const payload = assertPaymentSucceededPayload(input.event.payload);
        if (!input.event.organizationId) {
          throw new Error("payment_succeeded_payload_mismatch");
        }

        const order = await queryOne<PaidOrderRow>(
          db,
          `
            SELECT id, organization_id, created_by_user_id, order_no, amount_minor, currency, status, paid_at, successful_payment_intent_id
            FROM billing_orders
            WHERE organization_id = $2
              AND id = $1
              AND status = 'paid'
            LIMIT 1
            FOR UPDATE
          `,
          [payload.order_id, input.event.organizationId],
        );
        if (!order) {
          throw new Error("paid_order_not_found");
        }
        if (
          order.successful_payment_intent_id !== payload.payment_intent_id ||
          order.amount_minor !== payload.amount_minor ||
          order.currency !== payload.currency
        ) {
          throw new Error("payment_succeeded_payload_mismatch");
        }
        if (!order.paid_at || order.amount_minor <= 0) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const binding = await queryOne<InviteBindingRow>(
          db,
          `
            SELECT *
            FROM user_invite_bindings
            WHERE invited_user_id = $1
              AND status = 'active'
            LIMIT 1
            FOR UPDATE
          `,
          [order.created_by_user_id],
        );
        if (!binding) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const paidAt = new Date(order.paid_at);
        if (paidAt > new Date(binding.rebate_valid_until)) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const snapshot = normalizeConfigSnapshot(binding.config_snapshot_json);
        const amountMinor = applyRebateCap(order.amount_minor, snapshot.perInvitedUserRebateCapMinor);
        const rebateAmountMinor = Math.floor(amountMinor * snapshot.rebatePercent / 100);
        const rebateCredits = Math.floor(rebateAmountMinor * snapshot.rebateCreditRate / 100);
        if (rebateAmountMinor <= 0 || rebateCredits <= 0) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const grant = await insertGrantRow(db, {
          bindingId: binding.id,
          recipientUserId: binding.inviter_user_id,
          rewardType: "inviter_rebate",
          sourceType: "billing_order",
          sourceId: order.id,
          amountMinor: rebateAmountMinor,
          credits: rebateCredits,
          status: "pending",
          reason: null,
          configSnapshot: snapshot,
          now: input.now,
        });
        if (!grant.inserted) {
          await db.query("COMMIT");
          return { kind: "duplicate" as const };
        }

        const compatibilityOrganizationId = await resolveUserCompatibilityOrganizationId(db, binding.inviter_user_id);
        const ledgerEntry = await grantCreditsInTransaction(db, {
          compatibilityOrganizationId,
          userId: binding.inviter_user_id,
          amount: rebateCredits,
          sourceType: "invite_reward",
          sourceId: grant.id,
          reason: "邀请充值返利积分",
          createdByUserId: binding.inviter_user_id,
          metadata: {
            bindingId: binding.id,
            invitedUserId: binding.invited_user_id,
            orderId: order.id,
            orderNo: order.order_no,
            rebateAmountMinor,
            rebatePercent: snapshot.rebatePercent,
          },
          now: input.now,
        });
        await markGrantGranted(db, {
          grantId: grant.id,
          ledgerEntryId: ledgerEntry.id,
          now: input.now,
        });

        await db.query("COMMIT");
        return { kind: "applied" as const, ledgerEntry };
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    },
  });

  if (consumed.kind === "duplicate" || consumed.result.kind === "duplicate") {
    return { kind: "duplicate" };
  }
  if (consumed.result.kind === "ignored") {
    return { kind: "ignored" };
  }
  return { kind: "applied", ledgerEntry: consumed.result.ledgerEntry };
}

async function grantBindingCredits(
  db: SqlDatabase,
  input: {
    binding: InviteBindingRow;
    rewardType: "new_user_trial" | "inviter_trial";
    recipientUserId: string;
    credits: number;
    planId: string | null;
    sourceId: string;
    reason: string;
    configSnapshot: InviteRewardConfigSnapshot;
    now: Date;
  },
) {
  const grant = await insertGrantRow(db, {
    bindingId: input.binding.id,
    recipientUserId: input.recipientUserId,
    rewardType: input.rewardType,
    sourceType: "invite_binding",
    sourceId: input.sourceId,
    amountMinor: null,
    credits: input.credits,
    status: input.credits > 0 || input.planId ? "pending" : "skipped",
    reason: input.credits > 0 || input.planId ? null : "no_configured_benefit",
    configSnapshot: input.configSnapshot,
    now: input.now,
  });
  if (!grant.inserted || input.credits <= 0) {
    if (grant.inserted && input.planId) {
      const membershipPeriodId = await applyInternalMembershipPlan(db, {
        userId: input.recipientUserId,
        planId: input.planId,
        now: input.now,
      });
      await markGrantGranted(db, {
        grantId: grant.id,
        ledgerEntryId: null,
        membershipPeriodId,
        now: input.now,
      });
    }
    return;
  }

  const membershipPeriodId = input.planId
    ? await applyInternalMembershipPlan(db, {
        userId: input.recipientUserId,
        planId: input.planId,
        now: input.now,
      })
    : null;
  const compatibilityOrganizationId = await resolveUserCompatibilityOrganizationId(db, input.recipientUserId);
  const ledgerEntry = await grantCreditsInTransaction(db, {
    compatibilityOrganizationId,
    userId: input.recipientUserId,
    amount: input.credits,
    sourceType: "invite_reward",
    sourceId: grant.id,
    reason: input.reason,
    createdByUserId: input.recipientUserId,
    metadata: {
      bindingId: input.binding.id,
      rewardType: input.rewardType,
      inviteCode: input.binding.invite_code,
    },
    now: input.now,
  });
  await markGrantGranted(db, {
    grantId: grant.id,
    ledgerEntryId: ledgerEntry.id,
    membershipPeriodId,
    now: input.now,
  });
}

async function applyInternalMembershipPlan(
  db: SqlDatabase,
  input: { userId: string; planId: string; now: Date },
) {
  const plan = await queryOne<MembershipPlanRow>(
    db,
    `
      SELECT id, code, tier, period_unit, period_count, gift_credits, status, visibility
      FROM membership_plans
      WHERE id = $1
        AND status = 'active'
        AND visibility = 'internal'
      LIMIT 1
    `,
    [input.planId],
  );
  if (!plan) {
    return null;
  }

  const current = await queryOne<{ expires_at: Date | string | null }>(
    db,
    `
      SELECT expires_at
      FROM memberships
      WHERE user_id = $1
        AND membership_tier = $2
      ORDER BY expires_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `,
    [input.userId, plan.tier],
  );
  const window = calculateMembershipWindow({
    paidAt: input.now,
    currentPeriodEndAt: current?.expires_at ? new Date(current.expires_at) : null,
    periodUnit: plan.period_unit,
    periodCount: Number(plan.period_count),
  });

  await db.query(
    `
      UPDATE memberships
      SET membership_tier = $2,
          purchase_at = $3,
          expires_at = $4,
          gift_credits = $5,
          updated_at = $3
      WHERE user_id = $1
    `,
    [input.userId, plan.tier, input.now, window.periodEndAt, Number(plan.gift_credits ?? 0)],
  );

  return null;
}

async function resolveUserCompatibilityOrganizationId(db: SqlDatabase, userId: string) {
  const membership = await queryOne<{ organization_id: string }>(
    db,
    `
      SELECT organization_id
      FROM memberships
      WHERE user_id = $1
        AND status = 'active'
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
    [userId],
  );
  if (membership?.organization_id) {
    return membership.organization_id;
  }
  const fallback = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM organizations
      WHERE status = 'active'
      ORDER BY created_at ASC
      LIMIT 1
    `,
  );
  if (!fallback) {
    throw new Error("invite_reward_missing_compatibility_organization");
  }
  return fallback.id;
}

async function findActiveInviteRewardConfig(db: SqlDatabase) {
  return queryOne<InviteRewardConfigRow>(
    db,
    `
      SELECT *
      FROM invite_reward_configs
      WHERE status = 'active'
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
  );
}

async function insertGrantRow(
  db: SqlDatabase,
  input: {
    bindingId: string;
    recipientUserId: string;
    rewardType: "new_user_trial" | "inviter_trial" | "inviter_rebate";
    sourceType: "invite_binding" | "billing_order";
    sourceId: string;
    amountMinor: number | null;
    credits: number;
    status: "pending" | "granted" | "skipped";
    reason: string | null;
    configSnapshot: InviteRewardConfigSnapshot;
    now: Date;
  },
) {
  const grantId = randomUUID();
  const row = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO invite_reward_grants (
        id,
        binding_id,
        recipient_user_id,
        reward_type,
        source_type,
        source_id,
        amount_minor,
        credits,
        status,
        reason,
        config_snapshot_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $12)
      ON CONFLICT (binding_id, reward_type, source_type, source_id, recipient_user_id) DO NOTHING
      RETURNING id
    `,
    [
      grantId,
      input.bindingId,
      input.recipientUserId,
      input.rewardType,
      input.sourceType,
      input.sourceId,
      input.amountMinor,
      input.credits,
      input.status,
      input.reason,
      JSON.stringify(input.configSnapshot),
      input.now,
    ],
  );

  return { id: row?.id ?? grantId, inserted: Boolean(row) };
}

async function markGrantGranted(
  db: SqlDatabase,
  input: { grantId: string; ledgerEntryId: string | null; membershipPeriodId?: string | null; now: Date },
) {
  await db.query(
    `
      UPDATE invite_reward_grants
      SET status = 'granted',
          credit_ledger_entry_id = $2,
          membership_period_id = $3,
          updated_at = $4
      WHERE id = $1
    `,
    [input.grantId, input.ledgerEntryId, input.membershipPeriodId ?? null, input.now],
  );
}

interface InviteRewardConfigSnapshot {
  id: string;
  newUserPlanId: string | null;
  newUserGiftCredits: number;
  inviterPlanId: string | null;
  inviterGiftCredits: number;
  rebatePercent: number;
  rebateWindowDays: number;
  rebateCreditRate: number;
  perInvitedUserRebateCapMinor: number | null;
  perInviterPeriodRebateCapMinor: number | null;
}

function configSnapshot(row: InviteRewardConfigRow): InviteRewardConfigSnapshot {
  return {
    id: row.id,
    newUserPlanId: row.new_user_plan_id,
    newUserGiftCredits: nonNegativeInteger(row.new_user_gift_credits),
    inviterPlanId: row.inviter_plan_id,
    inviterGiftCredits: nonNegativeInteger(row.inviter_gift_credits),
    rebatePercent: nonNegativeNumber(row.rebate_percent),
    rebateWindowDays: nonNegativeInteger(row.rebate_window_days),
    rebateCreditRate: nonNegativeInteger(row.rebate_credit_rate),
    perInvitedUserRebateCapMinor: optionalNonNegativeInteger(row.per_invited_user_rebate_cap_minor),
    perInviterPeriodRebateCapMinor: optionalNonNegativeInteger(row.per_inviter_period_rebate_cap_minor),
  };
}

function normalizeConfigSnapshot(value: unknown): InviteRewardConfigSnapshot {
  const object = normalizeObject(value);
  return {
    id: stringField(object.id),
    newUserPlanId: nullableStringField(object.newUserPlanId),
    newUserGiftCredits: nonNegativeInteger(object.newUserGiftCredits),
    inviterPlanId: nullableStringField(object.inviterPlanId),
    inviterGiftCredits: nonNegativeInteger(object.inviterGiftCredits),
    rebatePercent: nonNegativeNumber(object.rebatePercent),
    rebateWindowDays: nonNegativeInteger(object.rebateWindowDays),
    rebateCreditRate: nonNegativeInteger(object.rebateCreditRate),
    perInvitedUserRebateCapMinor: optionalNonNegativeInteger(object.perInvitedUserRebateCapMinor),
    perInviterPeriodRebateCapMinor: optionalNonNegativeInteger(object.perInviterPeriodRebateCapMinor),
  };
}

function assertPaymentSucceededPayload(payload: Record<string, unknown>): PaymentSucceededPayload {
  if (
    typeof payload.order_id !== "string" ||
    typeof payload.payment_intent_id !== "string" ||
    typeof payload.payment_provider_event_id !== "string" ||
    typeof payload.amount_minor !== "number" ||
    typeof payload.currency !== "string"
  ) {
    throw new Error("invalid_payment_succeeded_payload");
  }

  return {
    order_id: payload.order_id,
    payment_intent_id: payload.payment_intent_id,
    payment_provider_event_id: payload.payment_provider_event_id,
    amount_minor: payload.amount_minor,
    currency: payload.currency,
  };
}

function normalizeInviteCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function applyRebateCap(amountMinor: number, capMinor: number | null) {
  if (capMinor === null) return amountMinor;
  return Math.min(amountMinor, capMinor);
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function optionalNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return nonNegativeInteger(value);
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableStringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  const normalized = typeof value === "string" ? parseJson(value) : value;
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, unknown>;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
