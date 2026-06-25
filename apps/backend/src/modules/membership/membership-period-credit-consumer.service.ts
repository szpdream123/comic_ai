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

interface MembershipPeriodStartedPayload {
  membership_period_id: string;
  order_id: string;
  plan_id: string;
  gift_credits: number;
  period_end_at: string;
}

interface MembershipPeriodRow {
  id: string;
  organization_id: string;
  order_id: string;
  plan_id: string;
  tier: string;
  period_end_at: Date | string;
  gift_credits: number;
  order_no: string | null;
  order_status: string | null;
  plan_code: string | null;
}

export async function consumeMembershipPeriodCreditGrant(
  db: SqlDatabase,
  input: { event: OutboxEventRecord; now: Date },
): Promise<
  | { kind: "applied"; creditGrant: CreditLedgerEntryRecord }
  | { kind: "duplicate" }
  | { kind: "ignored" }
> {
  if (input.event.eventType !== eventTypes.membershipPeriodStarted) {
    throw new Error(`unsupported_event_type:${input.event.eventType}`);
  }

  const consumed = await consumeOutboxEventWithIdempotentEffect(new SqlInbox(db), {
    consumerName: "credit.membership-period-started",
    outboxEventId: input.event.id,
    effect: async () => {
      await db.query("BEGIN");
      try {
        const payload = assertMembershipPeriodStartedPayload(input.event.payload);
        const period = await findMembershipPeriodForCreditGrant(db, payload.membership_period_id);
        if (!period || period.organization_id !== input.event.organizationId) {
          throw new Error("membership_period_not_found");
        }
        assertPayloadMatchesPeriod(payload, period);
        if (period.order_status !== "paid") {
          throw new Error("membership_period_payment_not_confirmed");
        }

        if (period.gift_credits <= 0) {
          await db.query("COMMIT");
          return { kind: "ignored" as const };
        }

        const grant = await grantCreditsInTransaction(db, {
          organizationId: period.organization_id,
          amount: period.gift_credits,
          sourceType: "membership_gift",
          sourceId: period.id,
          reason: "membership period gifted credits",
          metadata: {
            orderId: period.order_id,
            orderNo: period.order_no,
            planId: period.plan_id,
            planCode: period.plan_code,
            tier: period.tier,
          },
          lot: {
            sourceType: "membership_gift",
            sourceId: period.id,
            expiresAt: new Date(period.period_end_at),
            metadata: {
              tier: period.tier,
              orderId: period.order_id,
              planId: period.plan_id,
            },
          },
          createdByUserId: null,
          now: input.now,
        });
        await markBillingOrderCreditGranted(db, {
          organizationId: period.organization_id,
          orderId: period.order_id,
          ledgerEntryId: grant.id,
          now: input.now,
        });
        await db.query("COMMIT");
        return { kind: "applied" as const, creditGrant: grant };
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
  return {
    kind: "applied",
    creditGrant: consumed.result.creditGrant,
  };
}

async function findMembershipPeriodForCreditGrant(
  db: SqlDatabase,
  membershipPeriodId: string,
) {
  return queryOne<MembershipPeriodRow>(
    db,
    `
      SELECT
        mp.id,
        mp.organization_id,
        mp.order_id,
        mp.plan_id,
        mp.tier,
        mp.period_end_at,
        mp.gift_credits,
        bo.order_no,
        bo.status AS order_status,
        mplan.code AS plan_code
      FROM membership_periods mp
      LEFT JOIN billing_orders bo
        ON bo.organization_id = mp.organization_id
       AND bo.id = mp.order_id
      LEFT JOIN membership_plans mplan
        ON mplan.id = mp.plan_id
      WHERE mp.id = $1
      LIMIT 1
    `,
    [membershipPeriodId],
  );
}

async function markBillingOrderCreditGranted(
  db: SqlDatabase,
  input: {
    organizationId: string;
    orderId: string;
    ledgerEntryId: string;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE billing_orders
      SET credit_grant_ledger_entry_id = $3,
          updated_at = $4
      WHERE organization_id = $1
        AND id = $2
        AND product_type = 'membership_plan'
        AND credit_grant_ledger_entry_id IS NULL
    `,
    [input.organizationId, input.orderId, input.ledgerEntryId, input.now],
  );
}

function assertMembershipPeriodStartedPayload(
  payload: Record<string, unknown>,
): MembershipPeriodStartedPayload {
  if (
    typeof payload.membership_period_id !== "string" ||
    typeof payload.order_id !== "string" ||
    typeof payload.plan_id !== "string" ||
    typeof payload.gift_credits !== "number" ||
    typeof payload.period_end_at !== "string"
  ) {
    throw new Error("invalid_membership_period_started_payload");
  }
  return {
    membership_period_id: payload.membership_period_id,
    order_id: payload.order_id,
    plan_id: payload.plan_id,
    gift_credits: payload.gift_credits,
    period_end_at: payload.period_end_at,
  };
}

function assertPayloadMatchesPeriod(
  payload: MembershipPeriodStartedPayload,
  period: MembershipPeriodRow,
) {
  if (
    payload.membership_period_id !== period.id ||
    payload.order_id !== period.order_id ||
    payload.plan_id !== period.plan_id ||
    payload.gift_credits !== period.gift_credits ||
    payload.period_end_at !== new Date(period.period_end_at).toISOString()
  ) {
    throw new Error("membership_period_started_payload_mismatch");
  }
}
