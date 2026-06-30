import { randomUUID } from "node:crypto";

import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { consumeOutboxEventWithIdempotentEffect } from "../shared/outbox/outbox-repair.contract.ts";
import { SqlInbox } from "../shared/outbox/sql-inbox.service.ts";
import { calculateMembershipWindow } from "./membership-period.service.ts";

interface PaymentSucceededPayload {
  order_id: string;
  payment_intent_id: string;
  payment_provider_event_id: string;
  amount_minor: number;
  currency: string;
}

interface PaidOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  product_type: string;
  membership_plan_id: string | null;
  product_snapshot_json: unknown;
  amount_minor: number;
  currency: string;
  status: string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  intent_amount_minor: number | null;
  intent_currency: string | null;
  provider_event_id: string | null;
  provider_event_order_id: string | null;
  provider_event_payment_intent_id: string | null;
  provider_event_type: string | null;
  provider_event_processing_status: string | null;
}

interface SubscriptionRow {
  user_id: string;
  membership_tier: string | null;
  purchase_at: Date | string | null;
  expires_at: Date | string | null;
  gift_credits: number;
}

interface NormalizedMembershipPlanSnapshot extends Record<string, unknown> {
  id: string;
  code: string;
  tier: string;
  periodUnit: string;
  periodCount: number;
  giftCredits: number;
  seatLimit: number;
  entitlements: string[];
}

interface MembershipPeriodRow {
  id: string;
  organization_id: string;
  order_id: string;
  plan_id: string;
  tier: string;
  period_start_at: Date | string;
  period_end_at: Date | string;
  gift_credits: number;
  plan_snapshot_json: unknown;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ActiveProfessionalPeriodRow {
  id: string;
  organization_id: string;
  order_id: string;
  plan_snapshot_json: unknown;
  period_start_at: Date | string;
  period_end_at: Date | string;
}

export interface MembershipPeriodRecord {
  id: string;
  organizationId: string;
  orderId: string;
  planId: string;
  tier: string;
  periodStartAt: string;
  periodEndAt: string;
  giftCredits: number;
  planSnapshot: Record<string, unknown>;
  status: string;
}

export type MembershipPaymentConsumeResult =
  | { kind: "applied"; period: MembershipPeriodRecord }
  | { kind: "duplicate" }
  | { kind: "ignored" };

export async function repairPaidProfessionalMembershipActivationByOrderNo(
  db: SqlDatabase,
  input: { orderNo: string; now: Date },
): Promise<{ repaired: boolean; orderNo: string; organizationId?: string; entitlements?: string[] }> {
  const order = await queryOne<PaidOrderRow>(
    db,
    `
      SELECT
        bo.*,
        pi.amount_minor AS intent_amount_minor,
        pi.currency AS intent_currency,
        NULL::uuid AS provider_event_id,
        NULL::uuid AS provider_event_order_id,
        NULL::uuid AS provider_event_payment_intent_id,
        NULL::text AS provider_event_type,
        NULL::text AS provider_event_processing_status
      FROM billing_orders bo
      LEFT JOIN payment_intents pi
        ON pi.organization_id = bo.organization_id
       AND pi.id = bo.successful_payment_intent_id
      WHERE bo.order_no = $1
        AND bo.status = 'paid'
        AND bo.product_type = 'membership_plan'
      LIMIT 1
    `,
    [input.orderNo],
  );
  if (!order || !order.membership_plan_id) {
    return { repaired: false, orderNo: input.orderNo };
  }

  const planSnapshot = professionalCompatibilitySnapshot(
    await resolveEffectivePlanSnapshot(db, order),
  );
  if (planSnapshot.tier !== "professional") {
    return { repaired: false, orderNo: input.orderNo, organizationId: order.organization_id };
  }

  const paidAt = assertPaidAt(order.paid_at);
  const existingPeriod = await queryOne<{ period_end_at: Date | string }>(
    db,
    `
      SELECT period_end_at
      FROM membership_periods
      WHERE organization_id = $1
        AND order_id = $2
        AND tier = 'professional'
      ORDER BY period_end_at DESC, created_at DESC
      LIMIT 1
    `,
    [order.organization_id, order.id],
  );
  const periodEndAt = existingPeriod
    ? new Date(existingPeriod.period_end_at)
    : calculateMembershipWindow({
        paidAt,
        currentPeriodEndAt: null,
        periodUnit: planSnapshot.periodUnit,
        periodCount: planSnapshot.periodCount,
      }).periodEndAt;

  await db.query("BEGIN");
  try {
    await repairExistingProfessionalActivation(db, {
      order,
      planSnapshot,
      periodEndAt,
      now: input.now,
    });
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  return {
    repaired: true,
    orderNo: input.orderNo,
    organizationId: order.organization_id,
    entitlements: planSnapshot.entitlements,
  };
}

export async function enqueueMissingMembershipActivationForPaidOrder(
  db: SqlDatabase,
  input: { orderNo: string; now: Date },
): Promise<
  | { kind: "enqueued"; outboxEventId: string; orderNo: string }
  | { kind: "not_needed"; orderNo: string }
  | { kind: "not_found"; orderNo: string }
> {
  const order = await queryOne<PaidOrderRow>(
    db,
    `
      SELECT
        bo.*,
        pi.amount_minor AS intent_amount_minor,
        pi.currency AS intent_currency,
        ppe.id AS provider_event_id,
        ppe.order_id AS provider_event_order_id,
        ppe.payment_intent_id AS provider_event_payment_intent_id,
        ppe.event_type AS provider_event_type,
        ppe.processing_status AS provider_event_processing_status
      FROM billing_orders bo
      LEFT JOIN payment_intents pi
        ON pi.organization_id = bo.organization_id
       AND pi.id = bo.successful_payment_intent_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM payment_provider_events
        WHERE organization_id = bo.organization_id
          AND order_id = bo.id
          AND payment_intent_id = bo.successful_payment_intent_id
          AND event_type = 'payment_succeeded'
          AND processing_status = 'processed'
        ORDER BY processed_at DESC, received_at DESC
        LIMIT 1
      ) ppe ON true
      WHERE bo.order_no = $1
        AND bo.status = 'paid'
        AND bo.product_type = 'membership_plan'
      LIMIT 1
    `,
    [input.orderNo],
  );
  if (!order || !order.membership_plan_id || !order.successful_payment_intent_id || !order.provider_event_id) {
    return { kind: "not_found", orderNo: input.orderNo };
  }

  const planSnapshot = await resolveEffectivePlanSnapshot(db, order);
  if (await membershipActivationSideEffectsComplete(db, { order, planSnapshot, now: input.now })) {
    return { kind: "not_needed", orderNo: input.orderNo };
  }

  const outboxEventId = await appendPaymentSucceededMembershipOutboxEvent(db, {
    order,
    paymentIntentId: order.successful_payment_intent_id,
    providerEventId: order.provider_event_id,
    now: input.now,
  });

  return { kind: "enqueued", orderNo: input.orderNo, outboxEventId };
}

export async function consumePaymentSucceededMembershipActivation(
  db: SqlDatabase,
  input: {
    event: OutboxEventRecord;
    now: Date;
  },
): Promise<MembershipPaymentConsumeResult> {
  if (input.event.eventType !== eventTypes.paymentSucceeded) {
    throw new Error(`unsupported_event_type:${input.event.eventType}`);
  }

  const consumed = await consumeOutboxEventWithIdempotentEffect(new SqlInbox(db), {
    consumerName: "membership.payment-succeeded",
    outboxEventId: input.event.id,
    effect: async () => {
      await db.query("BEGIN");
      try {
        const payload = assertPaymentSucceededPayload(input.event.payload);
        if (!input.event.organizationId) {
          throw new Error("payment_succeeded_payload_mismatch");
        }

        const order = await findPaidOrder(db, {
          payload,
          organizationId: input.event.organizationId,
        });
        if (!order) {
          throw new Error("paid_order_not_found");
        }
        assertPaymentSucceededPayloadMatchesOrder(payload, order);

        if (order.product_type !== "membership_plan") {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }
        if (!order.membership_plan_id) {
          throw new Error("membership_order_missing_plan");
        }

        const planSnapshot = await resolveEffectivePlanSnapshot(db, order);
        const paidAt = assertPaidAt(order.paid_at);
        const activeProfessionalPeriod = await findActiveProfessionalPeriod(db, {
          organizationId: order.organization_id,
          now: input.now,
        });
        const keepCurrentProfessionalSubscription =
          planSnapshot.tier !== "professional" &&
          activeProfessionalPeriod !== null;
        const currentSameTier = await findCurrentSameTierSubscription(db, {
          userId: order.created_by_user_id,
          tier: planSnapshot.tier,
        });
        const currentPeriodEndAt = currentSameTier?.expires_at
          ? new Date(currentSameTier.expires_at)
          : null;
        const baseWindow = calculateMembershipWindow({
          paidAt,
          currentPeriodEndAt,
          periodUnit: planSnapshot.periodUnit,
          periodCount: planSnapshot.periodCount,
        });
        const window = keepCurrentProfessionalSubscription && activeProfessionalPeriod
          ? {
              periodStartAt: baseWindow.periodStartAt,
              periodEndAt: new Date(activeProfessionalPeriod.period_end_at),
            }
          : baseWindow;
        const insertedPeriod = await insertMembershipPeriod(db, {
          order,
          planSnapshot,
          periodStartAt: window.periodStartAt,
          periodEndAt: window.periodEndAt,
          now: input.now,
        });

        if (!insertedPeriod) {
          const existingPeriod = await findExistingMembershipPeriodForOrder(db, {
            organizationId: order.organization_id,
            orderId: order.id,
          });
          if (existingPeriod) {
            await reconcileMembershipActivationForPeriod(db, {
              order,
              period: existingPeriod,
              planSnapshot,
              now: input.now,
            });
          }
          await db.query("COMMIT");
          return { kind: "duplicate" as const };
        }

        await applyMembershipPeriodEffects(db, {
          order,
          period: insertedPeriod,
          planSnapshot,
          keepCurrentProfessionalSubscription,
          activeProfessionalPeriod,
          now: input.now,
        });
        await db.query("COMMIT");
        return {
          kind: "applied" as const,
          period: periodRecordFromRow(insertedPeriod),
        };
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    },
  });

  if (consumed.kind === "duplicate") {
    return { kind: "duplicate" };
  }
  if (consumed.result.kind === "ignored") {
    return { kind: "ignored" };
  }
  if (consumed.result.kind === "duplicate") {
    return { kind: "duplicate" };
  }
  return {
    kind: "applied",
    period: consumed.result.period,
  };
}

async function findPaidOrder(
  db: SqlDatabase,
  input: { payload: PaymentSucceededPayload; organizationId: string },
) {
  return queryOne<PaidOrderRow>(
    db,
    `
      SELECT
        bo.*,
        pi.amount_minor AS intent_amount_minor,
        pi.currency AS intent_currency,
        ppe.id AS provider_event_id,
        ppe.order_id AS provider_event_order_id,
        ppe.payment_intent_id AS provider_event_payment_intent_id,
        ppe.event_type AS provider_event_type,
        ppe.processing_status AS provider_event_processing_status
      FROM billing_orders bo
      LEFT JOIN payment_intents pi
        ON pi.organization_id = bo.organization_id
       AND pi.id = bo.successful_payment_intent_id
      LEFT JOIN payment_provider_events ppe
        ON ppe.organization_id = bo.organization_id
       AND ppe.id = $3
      WHERE bo.organization_id = $2
        AND bo.id = $1
        AND bo.status = 'paid'
      LIMIT 1
      FOR UPDATE OF bo
    `,
    [input.payload.order_id, input.organizationId, input.payload.payment_provider_event_id],
  );
}

async function resolveEffectivePlanSnapshot(
  db: SqlDatabase,
  order: PaidOrderRow,
): Promise<NormalizedMembershipPlanSnapshot> {
  const snapshot = assertMembershipPlanSnapshot(order.product_snapshot_json);
  if (!order.membership_plan_id) {
    return snapshot;
  }

  const livePlan = await queryOne<{ seat_limit: number | string }>(
    db,
    `
      SELECT seat_limit
      FROM membership_plans
      WHERE id = $1
      LIMIT 1
    `,
    [order.membership_plan_id],
  );
  const liveSeatLimit = Number(livePlan?.seat_limit);
  if (!Number.isInteger(liveSeatLimit) || liveSeatLimit < 0) {
    return snapshot;
  }

  return {
    ...snapshot,
    seatLimit: liveSeatLimit,
  };
}

async function membershipActivationSideEffectsComplete(
  db: SqlDatabase,
  input: { order: PaidOrderRow; planSnapshot: NormalizedMembershipPlanSnapshot; now: Date },
) {
  const period = await queryOne<{
    id: string;
    period_end_at: Date | string;
    gift_credits: number;
  }>(
    db,
    `
      SELECT id, period_end_at, gift_credits
      FROM membership_periods
      WHERE organization_id = $1
        AND order_id = $2
        AND tier = $3
        AND status = 'active'
      LIMIT 1
    `,
    [input.order.organization_id, input.order.id, input.planSnapshot.tier],
  );
  if (!period) {
    return false;
  }

  const expectedPeriodEndAt = new Date(period.period_end_at);
  const subscription = await queryOne<{ membership_tier: string | null; expires_at: Date | string | null }>(
    db,
    `
      SELECT membership_tier, expires_at
      FROM memberships
      WHERE user_id = $1
        AND membership_tier = $2
        AND expires_at = $3
      LIMIT 1
    `,
    [
      input.order.created_by_user_id,
      input.planSnapshot.tier,
      expectedPeriodEndAt,
    ],
  );
  if (!subscription && input.planSnapshot.tier === "professional") {
    return false;
  }

  if (input.planSnapshot.tier === "professional") {
    const activeEntitlements = await db.query<{ entitlement_key: string }>(
      `
        SELECT entitlement_key
        FROM organization_entitlements
        WHERE organization_id = $1
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > $2)
      `,
      [input.order.organization_id, input.now],
    );
    const activeEntitlementSet = new Set(activeEntitlements.rows.map((row) => row.entitlement_key));
    for (const entitlement of normalizeStringArray(input.planSnapshot.entitlements)) {
      if (!activeEntitlementSet.has(entitlement)) {
        return false;
      }
    }
    const teamLimit = await queryOne<{ team_seat_limit: number | string }>(
      db,
      "SELECT team_seat_limit FROM users WHERE id = $1 LIMIT 1",
      [input.order.created_by_user_id],
    );
    if (Number(teamLimit?.team_seat_limit ?? -1) !== input.planSnapshot.seatLimit) {
      return false;
    }
  }

  if (Number(period.gift_credits) > 0) {
    const grant = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND source_type = 'membership_gift'
          AND source_id = $2
          AND entry_type = 'grant'
          AND amount = $3
        LIMIT 1
      `,
      [input.order.organization_id, period.id, Number(period.gift_credits)],
    );
    if (!grant) {
      return false;
    }
  }

  return true;
}

async function findCurrentSameTierSubscription(
  db: SqlDatabase,
  input: { userId: string; tier: string },
) {
  return queryOne<SubscriptionRow>(
    db,
    `
      SELECT user_id, membership_tier, purchase_at, expires_at, gift_credits
      FROM memberships
      WHERE user_id = $1
        AND membership_tier = $2
      LIMIT 1
    `,
    [input.userId, input.tier],
  );
}

async function repairExistingProfessionalActivation(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    planSnapshot: NormalizedMembershipPlanSnapshot;
    periodEndAt: Date;
    now: Date;
  },
) {
  await upsertProfessionalEntitlements(db, {
    organizationId: input.order.organization_id,
    entitlements: input.planSnapshot.entitlements,
    periodEndAt: input.periodEndAt,
    now: input.now,
  });
  await updateUserTeamSeatLimit(db, {
    userId: input.order.created_by_user_id,
    seatLimit: input.planSnapshot.seatLimit,
    now: input.now,
  });
  await db.query(
    `
      UPDATE membership_periods
      SET plan_snapshot_json = $3::jsonb,
          updated_at = $4
      WHERE organization_id = $1
        AND order_id = $2
        AND tier = 'professional'
    `,
    [
      input.order.organization_id,
      input.order.id,
      JSON.stringify(input.planSnapshot),
      input.now,
    ],
  );
}

async function findExistingMembershipPeriodForOrder(
  db: SqlDatabase,
  input: { organizationId: string; orderId: string },
) {
  return queryOne<MembershipPeriodRow>(
    db,
    `
      SELECT *
      FROM membership_periods
      WHERE organization_id = $1
        AND order_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [input.organizationId, input.orderId],
  );
}

async function reconcileMembershipActivationForPeriod(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    period: MembershipPeriodRow;
    planSnapshot: NormalizedMembershipPlanSnapshot;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE membership_periods
      SET plan_id = $3,
          tier = $4,
          gift_credits = $5,
          plan_snapshot_json = $6::jsonb,
          status = 'active',
          updated_at = $7
      WHERE organization_id = $1
        AND id = $2
    `,
    [
      input.period.organization_id,
      input.period.id,
      input.planSnapshot.id,
      input.planSnapshot.tier,
      input.planSnapshot.giftCredits,
      JSON.stringify(input.planSnapshot),
      input.now,
    ],
  );

  const period: MembershipPeriodRow = {
    ...input.period,
    plan_id: input.planSnapshot.id,
    tier: input.planSnapshot.tier,
    gift_credits: input.planSnapshot.giftCredits,
    plan_snapshot_json: input.planSnapshot,
    status: "active",
    updated_at: input.now,
  };
  const activeProfessionalPeriod = await findActiveProfessionalPeriod(db, {
    organizationId: input.order.organization_id,
    now: input.now,
  });
  const keepCurrentProfessionalSubscription =
    input.planSnapshot.tier !== "professional" &&
    activeProfessionalPeriod !== null;

  await applyMembershipPeriodEffects(db, {
    order: input.order,
    period,
    planSnapshot: input.planSnapshot,
    keepCurrentProfessionalSubscription,
    activeProfessionalPeriod,
    now: input.now,
  });
}

async function applyMembershipPeriodEffects(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    period: MembershipPeriodRow;
    planSnapshot: NormalizedMembershipPlanSnapshot;
    keepCurrentProfessionalSubscription: boolean;
    activeProfessionalPeriod: ActiveProfessionalPeriodRow | null;
    now: Date;
  },
) {
  const periodStartAt = new Date(input.period.period_start_at);
  const periodEndAt = new Date(input.period.period_end_at);

  if (input.keepCurrentProfessionalSubscription && input.activeProfessionalPeriod) {
    await restoreProfessionalSubscription(db, {
      userId: input.order.created_by_user_id,
      period: input.activeProfessionalPeriod,
      now: input.now,
    });
    const professionalPlanSnapshot = assertMembershipPlanSnapshot(
      input.activeProfessionalPeriod.plan_snapshot_json,
    );
    await upsertProfessionalEntitlements(db, {
      organizationId: input.order.organization_id,
      entitlements: professionalPlanSnapshot.entitlements,
      periodEndAt: new Date(input.activeProfessionalPeriod.period_end_at),
      now: input.now,
    });
    await updateUserTeamSeatLimit(db, {
      userId: input.order.created_by_user_id,
      seatLimit: professionalPlanSnapshot.seatLimit,
      now: input.now,
    });
  } else {
    await upsertSubscription(db, {
      order: input.order,
      planSnapshot: input.planSnapshot,
      periodStartAt,
      periodEndAt,
      now: input.now,
    });
  }

  if (!input.keepCurrentProfessionalSubscription) {
    await expirePaymentProfessionalEntitlementsOutsidePlan(db, {
      organizationId: input.order.organization_id,
      entitlements: input.planSnapshot.tier === "professional" ? input.planSnapshot.entitlements : [],
      now: input.now,
    });
  }

  if (input.planSnapshot.tier === "professional") {
    await upsertProfessionalEntitlements(db, {
      organizationId: input.order.organization_id,
      entitlements: input.planSnapshot.entitlements,
      periodEndAt,
      now: input.now,
    });
    await updateUserTeamSeatLimit(db, {
      userId: input.order.created_by_user_id,
      seatLimit: input.planSnapshot.seatLimit,
      now: input.now,
    });
  }

  await extendUnexpiredMembershipGiftLots(db, {
    organizationId: input.order.organization_id,
    tier: input.planSnapshot.tier,
    periodEndAt,
    now: input.now,
  });

  await appendMembershipPeriodStartedOutboxEvent(db, {
    period: input.period,
    now: input.now,
  });
}

async function findActiveProfessionalPeriod(
  db: SqlDatabase,
  input: { organizationId: string; now: Date },
) {
  return queryOne<ActiveProfessionalPeriodRow>(
    db,
    `
      SELECT id, organization_id, order_id, plan_snapshot_json, period_start_at, period_end_at
      FROM membership_periods
      WHERE organization_id = $1
        AND tier = 'professional'
        AND status = 'active'
        AND period_end_at > $2
      ORDER BY period_end_at DESC, created_at DESC
      LIMIT 1
    `,
    [input.organizationId, input.now],
  );
}

async function restoreProfessionalSubscription(
  db: SqlDatabase,
  input: { userId: string; period: ActiveProfessionalPeriodRow; now: Date },
) {
  await db.query(
    `
      UPDATE memberships
      SET membership_tier = 'professional',
          purchase_at = $2,
          expires_at = $3,
          updated_at = $4
      WHERE user_id = $1
    `,
    [
      input.userId,
      input.period.period_start_at,
      input.period.period_end_at,
      input.now,
    ],
  );
}

async function insertMembershipPeriod(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    planSnapshot: NormalizedMembershipPlanSnapshot;
    periodStartAt: Date;
    periodEndAt: Date;
    now: Date;
  },
) {
  return queryOne<MembershipPeriodRow>(
    db,
    `
      INSERT INTO membership_periods (
        id,
        organization_id,
        order_id,
        plan_id,
        tier,
        period_start_at,
        period_end_at,
        gift_credits,
        plan_snapshot_json,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        'active',
        $10,
        $10
      )
      ON CONFLICT (organization_id, order_id) DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.order.organization_id,
      input.order.id,
      input.planSnapshot.id,
      input.planSnapshot.tier,
      input.periodStartAt,
      input.periodEndAt,
      input.planSnapshot.giftCredits,
      JSON.stringify(input.planSnapshot),
      input.now,
    ],
  );
}

async function upsertSubscription(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    planSnapshot: NormalizedMembershipPlanSnapshot;
    periodStartAt: Date;
    periodEndAt: Date;
    now: Date;
  },
) {
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
      input.order.created_by_user_id,
      input.planSnapshot.tier,
      input.periodStartAt,
      input.periodEndAt,
      input.planSnapshot.giftCredits,
      input.now,
    ],
  );
  await updateUserTeamSeatLimit(db, {
    userId: input.order.created_by_user_id,
    seatLimit: input.planSnapshot.seatLimit,
    now: input.now,
  });
}

async function expirePaymentProfessionalEntitlementsOutsidePlan(
  db: SqlDatabase,
  input: {
    organizationId: string;
    entitlements: string[];
    now: Date;
  },
) {
  const activePaymentEntitlements = await db.query<{ entitlement_key: string }>(
    `
      SELECT entitlement_key
      FROM organization_entitlements
      WHERE organization_id = $1
        AND status = 'active'
        AND source = 'payment'
    `,
    [input.organizationId],
  );
  const allowedEntitlements = new Set(normalizeStringArray(input.entitlements));
  const entitlementsToExpire = activePaymentEntitlements.rows
    .map((row) => row.entitlement_key)
    .filter((key) => !allowedEntitlements.has(key));
  if (entitlementsToExpire.length === 0) {
    return;
  }

  await db.query(
    `
      UPDATE organization_entitlements
      SET status = 'expired',
          expires_at = CASE
            WHEN expires_at IS NULL OR expires_at > $3 THEN $3
            ELSE expires_at
          END,
          updated_at = $3
      WHERE organization_id = $1
        AND entitlement_key = ANY($2::text[])
        AND status = 'active'
        AND source = 'payment'
    `,
    [input.organizationId, entitlementsToExpire, input.now],
  );
}

async function upsertProfessionalEntitlements(
  db: SqlDatabase,
  input: {
    organizationId: string;
    entitlements: string[];
    periodEndAt: Date;
    now: Date;
  },
) {
  for (const entitlement of normalizeStringArray(input.entitlements)) {
    await db.query(
      `
        INSERT INTO organization_entitlements (
          id,
          organization_id,
          entitlement_key,
          status,
          source,
          expires_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'active', 'payment', $4, $5, $5)
        ON CONFLICT (organization_id, entitlement_key)
        DO UPDATE SET
          status = 'active',
          source = 'payment',
          expires_at = EXCLUDED.expires_at,
          updated_at = EXCLUDED.updated_at
      `,
      [randomUUID(), input.organizationId, entitlement, input.periodEndAt, input.now],
    );
  }
}

async function updateUserTeamSeatLimit(
  db: SqlDatabase,
  input: { userId: string; seatLimit: number; now: Date },
) {
  await db.query(
    `
      UPDATE users
      SET team_seat_limit = $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.userId, input.seatLimit, input.now],
  );
}

async function appendMembershipPeriodStartedOutboxEvent(
  db: SqlDatabase,
  input: { period: MembershipPeriodRow; now: Date },
) {
  const existing = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM outbox_events
      WHERE organization_id = $1
        AND event_type = $2
        AND payload_json ->> 'membership_period_id' = $3
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.period.organization_id, eventTypes.membershipPeriodStarted, input.period.id],
  );
  if (existing) {
    return;
  }

  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $5, $5)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      randomUUID(),
      input.period.organization_id,
      eventTypes.membershipPeriodStarted,
      JSON.stringify({
        membership_period_id: input.period.id,
        order_id: input.period.order_id,
        plan_id: input.period.plan_id,
        gift_credits: input.period.gift_credits,
        period_end_at: new Date(input.period.period_end_at).toISOString(),
      }),
      input.now,
    ],
  );
}

async function appendPaymentSucceededMembershipOutboxEvent(
  db: SqlDatabase,
  input: {
    order: PaidOrderRow;
    paymentIntentId: string;
    providerEventId: string;
    now: Date;
  },
) {
  const existing = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM outbox_events
      WHERE organization_id = $1
        AND event_type = $2
        AND payload_json ->> 'order_id' = $3
        AND payload_json ->> 'payment_intent_id' = $4
        AND payload_json ->> 'payment_provider_event_id' = $5
        AND status IN ('pending', 'processing', 'failed')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [
      input.order.organization_id,
      eventTypes.paymentSucceeded,
      input.order.id,
      input.paymentIntentId,
      input.providerEventId,
    ],
  );
  if (existing) {
    return existing.id;
  }

  const outboxEventId = randomUUID();
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $5, $5)
    `,
    [
      outboxEventId,
      input.order.organization_id,
      eventTypes.paymentSucceeded,
      JSON.stringify({
        order_id: input.order.id,
        payment_intent_id: input.paymentIntentId,
        payment_provider_event_id: input.providerEventId,
        amount_minor: input.order.amount_minor,
        currency: input.order.currency,
      }),
      input.now,
    ],
  );
  return outboxEventId;
}

async function extendUnexpiredMembershipGiftLots(
  db: SqlDatabase,
  input: {
    organizationId: string;
    tier: string;
    periodEndAt: Date;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE credit_lots
      SET expires_at = $3,
          updated_at = $4
      WHERE organization_id = $1
        AND source_type = 'membership_gift'
        AND metadata_json ->> 'tier' = $2
        AND expires_at IS NOT NULL
        AND expires_at > $4
        AND expires_at < $3
        AND (available_amount > 0 OR reserved_amount > 0)
    `,
    [input.organizationId, input.tier, input.periodEndAt, input.now],
  );
}

function periodRecordFromRow(row: MembershipPeriodRow): MembershipPeriodRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    orderId: row.order_id,
    planId: row.plan_id,
    tier: row.tier,
    periodStartAt: new Date(row.period_start_at).toISOString(),
    periodEndAt: new Date(row.period_end_at).toISOString(),
    giftCredits: row.gift_credits,
    planSnapshot: normalizeObject(normalizeJson(row.plan_snapshot_json)),
    status: row.status,
  };
}

function assertPaymentSucceededPayload(
  payload: Record<string, unknown>,
): PaymentSucceededPayload {
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

function assertPaymentSucceededPayloadMatchesOrder(
  payload: PaymentSucceededPayload,
  order: PaidOrderRow,
): void {
  if (
    order.successful_payment_intent_id !== payload.payment_intent_id ||
    order.amount_minor !== payload.amount_minor ||
    order.currency !== payload.currency ||
    order.intent_amount_minor !== payload.amount_minor ||
    order.intent_currency !== payload.currency ||
    order.provider_event_id !== payload.payment_provider_event_id ||
    order.provider_event_order_id !== payload.order_id ||
    order.provider_event_payment_intent_id !== payload.payment_intent_id ||
    order.provider_event_type !== "payment_succeeded" ||
    order.provider_event_processing_status !== "processed"
  ) {
    throw new Error("payment_succeeded_payload_mismatch");
  }
}

function assertMembershipPlanSnapshot(value: unknown): NormalizedMembershipPlanSnapshot {
  const snapshot = normalizeObject(normalizeJson(value));
  const id = stringField(snapshot, "id");
  const tier = stringField(snapshot, "tier");
  const periodUnit = stringField(snapshot, "periodUnit");
  const periodCount = numberField(snapshot, "periodCount");
  const giftCredits = numberField(snapshot, "giftCredits");
  const seatLimit = numberField(snapshot, "seatLimit");

  if (!id || !["experience", "professional"].includes(tier)) {
    throw new Error("invalid_membership_plan_snapshot");
  }
  if (!["day", "month", "quarter", "year"].includes(periodUnit)) {
    throw new Error("invalid_membership_plan_snapshot");
  }
  if (!Number.isInteger(periodCount) || periodCount <= 0) {
    throw new Error("invalid_membership_plan_snapshot");
  }
  if (!Number.isInteger(giftCredits) || giftCredits < 0) {
    throw new Error("invalid_membership_plan_snapshot");
  }
  if (!Number.isInteger(seatLimit) || seatLimit < 0) {
    throw new Error("invalid_membership_plan_snapshot");
  }

  return {
    ...snapshot,
    id,
    code: stringField(snapshot, "code"),
    tier,
    periodUnit,
    periodCount,
    giftCredits,
    seatLimit,
    entitlements: normalizeStringArray(snapshot.entitlements),
  };
}

function professionalCompatibilitySnapshot(
  snapshot: NormalizedMembershipPlanSnapshot,
): NormalizedMembershipPlanSnapshot {
  if (snapshot.tier !== "professional") {
    return snapshot;
  }
  const entitlements = normalizeProfessionalCompatibilityEntitlements(snapshot.entitlements);
  return {
    ...snapshot,
    entitlements,
  };
}

function normalizeProfessionalCompatibilityEntitlements(entitlements: string[]) {
  const normalized = normalizeStringArray(entitlements);
  if (
    normalized.includes("team_member_management") &&
    !normalized.includes("team_asset_library")
  ) {
    return [...normalized, "team_asset_library"];
  }
  return normalized;
}

function assertPaidAt(value: Date | string | null): Date {
  if (!value) {
    throw new Error("membership_order_missing_paid_at");
  }
  const paidAt = new Date(value);
  if (!Number.isFinite(paidAt.getTime())) {
    throw new Error("membership_order_invalid_paid_at");
  }
  return paidAt;
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function numberField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "number" ? field : Number.NaN;
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function normalizeObject(value: unknown): Record<string, unknown> {
  const normalized = normalizeJson(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return {};
  }
  return normalized as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  const normalized = normalizeJson(value);
  if (!Array.isArray(normalized)) return [];
  return normalized.map((item) => String(item).trim()).filter(Boolean);
}
