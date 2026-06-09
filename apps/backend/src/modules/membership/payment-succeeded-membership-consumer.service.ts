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
  current_tier: string | null;
  current_period_end_at: Date | string | null;
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

const professionalEntitlementKeys = new Set([
  "priority_generation",
  "team_asset_library",
  "team_dashboard",
  "team_member_management",
]);

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

        const planSnapshot = assertMembershipPlanSnapshot(order.product_snapshot_json);
        const currentSameTier = await findCurrentSameTierSubscription(db, {
          organizationId: order.organization_id,
          tier: planSnapshot.tier,
        });
        const currentPeriodEndAt = currentSameTier?.current_period_end_at
          ? new Date(currentSameTier.current_period_end_at)
          : null;
        const window = calculateMembershipWindow({
          paidAt: input.now,
          currentPeriodEndAt,
          periodUnit: planSnapshot.periodUnit,
          periodCount: planSnapshot.periodCount,
        });
        const insertedPeriod = await insertMembershipPeriod(db, {
          order,
          planSnapshot,
          periodStartAt: window.periodStartAt,
          periodEndAt: window.periodEndAt,
          now: input.now,
        });

        if (!insertedPeriod) {
          await db.query("COMMIT");
          return { kind: "duplicate" as const };
        }

        await upsertSubscription(db, {
          order,
          planSnapshot,
          periodStartAt: window.periodStartAt,
          periodEndAt: window.periodEndAt,
          now: input.now,
        });

        if (planSnapshot.tier === "professional") {
          await upsertProfessionalEntitlements(db, {
            organizationId: order.organization_id,
            entitlements: planSnapshot.entitlements,
            periodEndAt: window.periodEndAt,
            now: input.now,
          });
          await upsertTeamPlanLimit(db, {
            organizationId: order.organization_id,
            seatLimit: planSnapshot.seatLimit,
            now: input.now,
          });
        }

        await extendUnexpiredMembershipGiftLots(db, {
          organizationId: order.organization_id,
          tier: planSnapshot.tier,
          periodEndAt: window.periodEndAt,
          now: input.now,
        });

        await appendMembershipPeriodStartedOutboxEvent(db, {
          period: insertedPeriod,
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

async function findCurrentSameTierSubscription(
  db: SqlDatabase,
  input: { organizationId: string; tier: string },
) {
  return queryOne<SubscriptionRow>(
    db,
    `
      SELECT current_tier, current_period_end_at
      FROM organization_membership_subscriptions
      WHERE organization_id = $1
        AND current_tier = $2
      LIMIT 1
    `,
    [input.organizationId, input.tier],
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
      INSERT INTO organization_membership_subscriptions (
        id,
        organization_id,
        status,
        current_tier,
        current_period_start_at,
        current_period_end_at,
        latest_order_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (organization_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        current_tier = EXCLUDED.current_tier,
        current_period_start_at = EXCLUDED.current_period_start_at,
        current_period_end_at = EXCLUDED.current_period_end_at,
        latest_order_id = EXCLUDED.latest_order_id,
        updated_at = EXCLUDED.updated_at
    `,
    [
      randomUUID(),
      input.order.organization_id,
      `${input.planSnapshot.tier}_active`,
      input.planSnapshot.tier,
      input.periodStartAt,
      input.periodEndAt,
      input.order.id,
      input.now,
    ],
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
  for (const entitlement of input.entitlements.filter((key) => professionalEntitlementKeys.has(key))) {
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

async function upsertTeamPlanLimit(
  db: SqlDatabase,
  input: { organizationId: string; seatLimit: number; now: Date },
) {
  await db.query(
    `
      INSERT INTO team_plan_limits (
        id,
        organization_id,
        seat_limit,
        single_account_concurrency_limit,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 1, $4, $4)
      ON CONFLICT (organization_id)
      DO UPDATE SET
        seat_limit = EXCLUDED.seat_limit,
        updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), input.organizationId, input.seatLimit, input.now],
  );
}

async function appendMembershipPeriodStartedOutboxEvent(
  db: SqlDatabase,
  input: { period: MembershipPeriodRow; now: Date },
) {
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
  if (!Number.isInteger(seatLimit) || seatLimit < 1) {
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
