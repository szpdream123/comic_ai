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
  product_type: string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
}

interface MembershipPlanRow {
  id: string;
  code: string;
  display_name: string;
  tier: string;
  period_unit: string;
  period_count: number;
  amount_minor: number;
  currency: string;
  gift_credits: number;
  seat_limit: number;
  entitlements_json: unknown;
  priority_rules_json: unknown;
  display_metadata_json: unknown;
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

export async function grantNewUserBenefits(
  db: SqlDatabase,
  input: { userId: string; now: Date },
): Promise<{ kind: "applied" | "duplicate" | "ignored" }> {
  await db.query("BEGIN");
  try {
    const config = await findActiveInviteRewardConfig(db);
    if (!config) {
      await db.query("COMMIT");
      return { kind: "ignored" };
    }
    const snapshot = configSnapshot(config);
    const plan = snapshot.newUserPlanId
      ? await findInternalMembershipPlan(db, snapshot.newUserPlanId)
      : null;
    const rewardCredits = plan ? Number(plan.gift_credits) : snapshot.newUserGiftCredits;
    if (!plan && rewardCredits <= 0) {
      await db.query("COMMIT");
      return { kind: "ignored" };
    }

    const existing = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM billing_orders
        WHERE created_by_user_id = $1
          AND idempotency_key = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.userId, `new_user_reward:${input.userId}`],
    );
    const existingLedger = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM credit_ledger_entries
        WHERE user_id = $1
          AND source_type = 'new_user_reward'
          AND source_id = $1
        LIMIT 1
      `,
      [input.userId],
    );
    if (existing || existingLedger) {
      await db.query("COMMIT");
      return { kind: "duplicate" };
    }

    const organizationId = await resolveUserCompatibilityOrganizationId(db, input.userId);
    const membershipApplication = plan
      ? await applyInternalMembershipPlan(db, {
          userId: input.userId,
          plan,
          rewardSourceType: "new_user_reward",
          rewardSourceId: input.userId,
          now: input.now,
        })
      : null;
    if (rewardCredits > 0) {
      const ledgerEntry = await grantCreditsInTransaction(db, {
        compatibilityOrganizationId: membershipApplication?.organizationId ?? organizationId,
        userId: input.userId,
        amount: rewardCredits,
        sourceType: "new_user_reward",
        sourceId: input.userId,
        reason: "新用户体验积分",
        createdByUserId: input.userId,
        metadata: {
          rewardType: "new_user_trial",
          configId: snapshot.id,
          planId: plan?.id ?? null,
          planCode: plan?.code ?? null,
        },
        lot: membershipApplication
          ? {
              sourceType: "new_user_reward",
              sourceId: input.userId,
              expiresAt: membershipApplication.periodEndAt,
              metadata: { rewardType: "new_user_trial", planId: plan?.id ?? null },
            }
          : undefined,
        now: input.now,
      });
      if (membershipApplication) {
        await linkMembershipOrderCreditGrant(db, {
          organizationId: membershipApplication.organizationId,
          orderId: membershipApplication.orderId,
          ledgerEntryId: ledgerEntry.id,
          now: input.now,
        });
      }
    }

    await db.query("COMMIT");
    return { kind: "applied" };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

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
      reason: "新用户体验积分",
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
            SELECT id, organization_id, created_by_user_id, order_no, product_type, credits, amount_minor, currency, status, paid_at, successful_payment_intent_id
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
        if (order.product_type !== "credit_package" || order.credits <= 0) {
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
        if (paidAt < new Date(binding.bound_at) || paidAt > new Date(binding.rebate_valid_until)) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const inviter = await queryOne<{ status: string }>(
          db,
          "SELECT status FROM users WHERE id = $1 LIMIT 1 FOR UPDATE",
          [binding.inviter_user_id],
        );
        if (inviter?.status !== "active") {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const snapshot = normalizeConfigSnapshot(binding.config_snapshot_json);
        const desiredRebateAmountMinor = Math.floor(order.amount_minor * snapshot.rebatePercent / 100);
        const desiredRebateCredits = Math.floor(order.credits * snapshot.rebatePercent / 100);
        const invitedUserRebateAmountMinor = await sumGrantedRebateAmountMinor(db, {
          bindingId: binding.id,
        });
        const inviterPeriodRebateAmountMinor = await sumGrantedRebateAmountMinor(db, {
          recipientUserId: binding.inviter_user_id,
          configId: snapshot.id,
        });
        const invitedUserRemainingAmountMinor = remainingRebateAmountMinor(
          snapshot.perInvitedUserRebateCapMinor,
          invitedUserRebateAmountMinor,
        );
        const inviterPeriodRemainingAmountMinor = remainingRebateAmountMinor(
          snapshot.perInviterPeriodRebateCapMinor,
          inviterPeriodRebateAmountMinor,
        );
        const rebateAmountMinor = Math.min(
          desiredRebateAmountMinor,
          invitedUserRemainingAmountMinor,
          inviterPeriodRemainingAmountMinor,
        );
        const rebateCredits = desiredRebateAmountMinor > 0
          ? Math.floor(desiredRebateCredits * rebateAmountMinor / desiredRebateAmountMinor)
          : invitedUserRemainingAmountMinor > 0 && inviterPeriodRemainingAmountMinor > 0
            ? desiredRebateCredits
            : 0;
        if (rebateCredits <= 0) {
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
            orderCredits: order.credits,
            rebateAmountMinor,
            desiredRebateCredits,
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
  const plan = input.planId ? await findInternalMembershipPlan(db, input.planId) : null;
  const rewardCredits = plan ? Number(plan.gift_credits) : input.credits;
  const grant = await insertGrantRow(db, {
    bindingId: input.binding.id,
    recipientUserId: input.recipientUserId,
    rewardType: input.rewardType,
    sourceType: "invite_binding",
    sourceId: input.sourceId,
    amountMinor: null,
    credits: rewardCredits,
    status: rewardCredits > 0 || plan ? "pending" : "skipped",
    reason: rewardCredits > 0 || plan ? null : "no_configured_benefit",
    configSnapshot: input.configSnapshot,
    now: input.now,
  });
  if (!grant.inserted) {
    return;
  }

  const membershipApplication = plan
      ? await applyInternalMembershipPlan(db, {
          userId: input.recipientUserId,
          plan,
          rewardSourceType: "invite_reward",
          rewardSourceId: grant.id,
          now: input.now,
        })
    : null;
  if (rewardCredits <= 0) {
    await markGrantGranted(db, {
      grantId: grant.id,
      ledgerEntryId: null,
      membershipPeriodId: membershipApplication?.membershipPeriodId ?? null,
      now: input.now,
    });
    return;
  }

  const compatibilityOrganizationId = membershipApplication?.organizationId
    ?? await resolveUserCompatibilityOrganizationId(db, input.recipientUserId);
  const ledgerEntry = await grantCreditsInTransaction(db, {
    compatibilityOrganizationId,
    userId: input.recipientUserId,
    amount: rewardCredits,
    sourceType: "invite_reward",
    sourceId: grant.id,
    reason: input.reason,
    createdByUserId: input.recipientUserId,
    metadata: {
      bindingId: input.binding.id,
      rewardType: input.rewardType,
      inviteCode: input.binding.invite_code,
      planId: plan?.id ?? null,
      planCode: plan?.code ?? null,
    },
    lot: membershipApplication
      ? {
          sourceType: "invite_reward",
          sourceId: grant.id,
          expiresAt: membershipApplication.periodEndAt,
          metadata: {
            bindingId: input.binding.id,
            rewardType: input.rewardType,
            planId: plan?.id ?? null,
          },
        }
      : undefined,
    now: input.now,
  });
  if (membershipApplication) {
    await linkMembershipOrderCreditGrant(db, {
      organizationId: membershipApplication.organizationId,
      orderId: membershipApplication.orderId,
      ledgerEntryId: ledgerEntry.id,
      now: input.now,
    });
  }
  await markGrantGranted(db, {
    grantId: grant.id,
    ledgerEntryId: ledgerEntry.id,
    membershipPeriodId: membershipApplication?.membershipPeriodId ?? null,
    now: input.now,
  });
}

async function findInternalMembershipPlan(db: SqlDatabase, planId: string) {
  return queryOne<MembershipPlanRow>(
    db,
    `
      SELECT id, code, display_name, tier, period_unit, period_count, amount_minor, currency,
             gift_credits, seat_limit, entitlements_json, priority_rules_json,
             display_metadata_json, status, visibility
      FROM membership_plans
      WHERE id = $1
        AND status = 'active'
        AND visibility = 'internal'
      LIMIT 1
    `,
    [planId],
  );
}

async function applyInternalMembershipPlan(
  db: SqlDatabase,
  input: {
    userId: string;
    plan: MembershipPlanRow;
    rewardSourceType: "invite_reward" | "new_user_reward";
    rewardSourceId: string;
    now: Date;
  },
) {
  const plan = input.plan;
  const organizationId = await resolveUserCompatibilityOrganizationId(db, input.userId);
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
  const activeMembership = await queryOne<{
    membership_tier: string | null;
    purchase_at: Date | string | null;
    expires_at: Date | string | null;
    gift_credits: number | string;
  }>(
    db,
    `
      SELECT membership_tier, purchase_at, expires_at, gift_credits
      FROM memberships
      WHERE user_id = $1
        AND membership_tier IN ('experience', 'professional')
        AND expires_at > $2
      ORDER BY expires_at DESC, updated_at DESC
      LIMIT 1
    `,
    [input.userId, input.now],
  );
  const higherMembershipToKeep = activeMembership
    && membershipTierRank(activeMembership.membership_tier) > membershipTierRank(plan.tier)
    ? activeMembership
    : null;
  const planSnapshot = {
    id: plan.id,
    code: plan.code,
    displayName: plan.display_name,
    tier: plan.tier,
    periodUnit: plan.period_unit,
    periodCount: Number(plan.period_count),
    amountMinor: Number(plan.amount_minor),
    currency: plan.currency,
    giftCredits: Number(plan.gift_credits),
    seatLimit: Number(plan.seat_limit),
    entitlements: normalizeStringArray(plan.entitlements_json),
    priorityRules: normalizeObject(plan.priority_rules_json),
    displayMetadata: normalizeObject(plan.display_metadata_json),
    rewardSourceType: input.rewardSourceType,
    rewardSourceId: input.rewardSourceId,
  };
  const orderId = randomUUID();
  const membershipPeriodId = randomUUID();

  await db.query(
    `
      INSERT INTO billing_orders (
        id, organization_id, created_by_user_id, order_no, product_type,
        membership_plan_id, package_snapshot_json, product_snapshot_json,
        credits, amount_minor, currency, status, idempotency_key, expires_at,
        paid_at, successful_payment_intent_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, 'membership_plan', $5, $6::jsonb, $6::jsonb,
        $7, $8, $9, 'closed', $10, $11, NULL, NULL, $11, $11
      )
    `,
    [
      orderId,
      organizationId,
      input.userId,
      `REWARD-${input.rewardSourceType}-${input.rewardSourceId}`,
      plan.id,
      JSON.stringify(planSnapshot),
      Number(plan.gift_credits),
      Number(plan.amount_minor),
      plan.currency,
      `${input.rewardSourceType}:${input.rewardSourceId}`,
      input.now,
    ],
  );
  await db.query(
    `
      INSERT INTO membership_periods (
        id, organization_id, order_id, plan_id, tier, period_start_at,
        period_end_at, gift_credits, plan_snapshot_json, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'active', $10, $10)
    `,
    [
      membershipPeriodId,
      organizationId,
      orderId,
      plan.id,
      plan.tier,
      window.periodStartAt,
      window.periodEndAt,
      Number(plan.gift_credits),
      JSON.stringify(planSnapshot),
      input.now,
    ],
  );

  await db.query(
    `
      UPDATE memberships
      SET membership_tier = $2,
          purchase_at = $3,
          expires_at = $4,
          gift_credits = $5,
          updated_at = $6
      WHERE user_id = $1
    `,
    [
      input.userId,
      higherMembershipToKeep?.membership_tier ?? plan.tier,
      higherMembershipToKeep?.purchase_at ?? window.periodStartAt,
      higherMembershipToKeep?.expires_at ?? window.periodEndAt,
      higherMembershipToKeep?.gift_credits ?? Number(plan.gift_credits),
      input.now,
    ],
  );
  if (!higherMembershipToKeep) {
    await db.query(
      "UPDATE users SET team_seat_limit = $2, updated_at = $3 WHERE id = $1",
      [input.userId, Number(plan.seat_limit), input.now],
    );
    if (plan.tier === "professional") {
      await upsertTrialEntitlements(db, {
        organizationId,
        entitlements: planSnapshot.entitlements,
        periodEndAt: window.periodEndAt,
        now: input.now,
      });
    }
  }

  return { organizationId, orderId, membershipPeriodId, periodEndAt: window.periodEndAt };
}

async function linkMembershipOrderCreditGrant(
  db: SqlDatabase,
  input: { organizationId: string; orderId: string; ledgerEntryId: string; now: Date },
) {
  await db.query(
    `
      UPDATE billing_orders
      SET credit_grant_ledger_entry_id = $3,
          updated_at = $4
      WHERE organization_id = $1
        AND id = $2
        AND credit_grant_ledger_entry_id IS NULL
    `,
    [input.organizationId, input.orderId, input.ledgerEntryId, input.now],
  );
}

async function upsertTrialEntitlements(
  db: SqlDatabase,
  input: { organizationId: string; entitlements: string[]; periodEndAt: Date; now: Date },
) {
  for (const entitlement of input.entitlements) {
    await db.query(
      `
        INSERT INTO organization_entitlements (
          id, organization_id, entitlement_key, status, source, expires_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'active', 'trial', $4, $5, $5)
        ON CONFLICT (organization_id, entitlement_key)
        DO UPDATE SET
          status = 'active',
          source = CASE
            WHEN organization_entitlements.status = 'active'
              AND organization_entitlements.source = 'payment'
              AND (organization_entitlements.expires_at IS NULL OR organization_entitlements.expires_at >= EXCLUDED.expires_at)
            THEN organization_entitlements.source
            ELSE EXCLUDED.source
          END,
          expires_at = CASE
            WHEN organization_entitlements.status = 'active' AND organization_entitlements.expires_at IS NULL THEN NULL
            ELSE GREATEST(organization_entitlements.expires_at, EXCLUDED.expires_at)
          END,
          updated_at = EXCLUDED.updated_at
      `,
      [randomUUID(), input.organizationId, entitlement, input.periodEndAt, input.now],
    );
  }
}

function membershipTierRank(tier: string | null | undefined) {
  if (tier === "professional") return 2;
  if (tier === "experience") return 1;
  return 0;
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

async function sumGrantedRebateAmountMinor(
  db: SqlDatabase,
  input: { bindingId?: string; recipientUserId?: string; configId?: string },
) {
  const row = await queryOne<{ amount_minor: number | string }>(
    db,
    `
      SELECT COALESCE(sum(amount_minor), 0)::int AS amount_minor
      FROM invite_reward_grants
      WHERE reward_type = 'inviter_rebate'
        AND status IN ('pending', 'granted')
        AND ($1::uuid IS NULL OR binding_id = $1)
        AND ($2::uuid IS NULL OR recipient_user_id = $2)
        AND ($3::text IS NULL OR config_snapshot_json->>'id' = $3)
    `,
    [input.bindingId ?? null, input.recipientUserId ?? null, input.configId ?? null],
  );
  return Number(row?.amount_minor ?? 0);
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

function remainingRebateAmountMinor(capMinor: number | null, grantedAmountMinor: number) {
  if (capMinor === null) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, capMinor - grantedAmountMinor);
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

function normalizeStringArray(value: unknown): string[] {
  const normalized = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(normalized)) return [];
  return normalized.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
