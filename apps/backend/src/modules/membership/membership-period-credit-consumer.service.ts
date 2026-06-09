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
            planId: period.plan_id,
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
      SELECT id, organization_id, order_id, plan_id, tier, period_end_at, gift_credits
      FROM membership_periods
      WHERE id = $1
      LIMIT 1
    `,
    [membershipPeriodId],
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
