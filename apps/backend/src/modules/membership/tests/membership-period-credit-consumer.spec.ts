import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { consumeMembershipPeriodCreditGrant } from "../membership-period-credit-consumer.service.ts";

const organizationId = "10000000-0000-4000-8000-000000060001";
const userId = "30000000-0000-4000-8000-000000060001";
const planId = "95000000-0000-4000-8000-000000060001";
const orderId = "96000000-0000-4000-8000-000000060001";
const periodId = "97000000-0000-4000-8000-000000060001";
const outboxEventId = "98000000-0000-4000-8000-000000060001";

describe("membership period credit consumer", { concurrency: false }, () => {
  it("grants membership gift credits into an expiring credit lot idempotently", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedMembershipPeriod(db, { giftCredits: 800 });
      const event = {
        id: outboxEventId,
        organizationId,
        eventType: "membership.period.started",
        payload: {
          membership_period_id: periodId,
          order_id: orderId,
          plan_id: planId,
          gift_credits: 800,
          period_end_at: "2026-06-15T08:00:00.000Z",
        },
        status: "pending" as const,
        availableAt: new Date("2026-06-08T08:00:00.000Z"),
        processedAt: null,
        errorMessage: null,
        createdAt: new Date("2026-06-08T08:00:00.000Z"),
        updatedAt: new Date("2026-06-08T08:00:00.000Z"),
      };

      const first = await consumeMembershipPeriodCreditGrant(db, {
        event,
        now: new Date("2026-06-08T08:01:00.000Z"),
      });
      const replay = await consumeMembershipPeriodCreditGrant(db, {
        event,
        now: new Date("2026-06-08T08:02:00.000Z"),
      });

      const lot = await db.query<{
        source_type: string;
        source_id: string;
        available_amount: number;
        expires_at: Date | string | null;
        metadata_json: Record<string, unknown>;
      }>("SELECT source_type, source_id, available_amount, expires_at, metadata_json FROM credit_lots");
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );

      assert.equal(first.kind, "applied");
      assert.equal(first.creditGrant.amount, 800);
      assert.equal(replay.kind, "duplicate");
      assert.equal(organization.rows[0]?.credit_balance_cached, 800);
      assert.deepEqual(lot.rows.map((row) => ({
        source_type: row.source_type,
        source_id: row.source_id,
        available_amount: Number(row.available_amount),
        expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        tier: row.metadata_json.tier,
      })), [
        {
          source_type: "membership_gift",
          source_id: periodId,
          available_amount: 800,
          expires_at: "2026-06-15T08:00:00.000Z",
          tier: "experience",
        },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function seedMembershipPeriod(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { giftCredits: number },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800638001', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Membership Period Credit Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO membership_plans (
        id,
        code,
        display_name,
        tier,
        period_unit,
        period_count,
        amount_minor,
        currency,
        gift_credits,
        seat_limit,
        entitlements_json,
        priority_rules_json,
        display_metadata_json,
        status
      )
      VALUES ($1, 'experience_weekly_credit', 'Experience Weekly Credit', 'experience', 'day', 7, 9900, 'CNY', $2, 1, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'active')
    `,
    [planId, input.giftCredits],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        organization_id,
        created_by_user_id,
        order_no,
        product_type,
        membership_plan_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at
      )
      VALUES ($1, $2, $3, 'ORD-MEMBERSHIP-PERIOD-CREDIT', 'membership_plan', $4, '{}'::jsonb, '{}'::jsonb, $5, 9900, 'CNY', 'pending_payment', '2026-06-08T08:30:00.000Z')
    `,
    [orderId, organizationId, userId, planId, input.giftCredits],
  );
  await db.query(
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
      VALUES ($1, $2, $3, $4, 'experience', '2026-06-08T08:00:00.000Z', '2026-06-15T08:00:00.000Z', $5, '{"tier":"experience"}'::jsonb, 'active', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z')
    `,
    [periodId, organizationId, orderId, planId, input.giftCredits],
  );
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
      VALUES ($1, $2, 'membership.period.started', $3::jsonb, 'pending', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z')
    `,
    [
      outboxEventId,
      organizationId,
      JSON.stringify({
        membership_period_id: periodId,
        order_id: orderId,
        plan_id: planId,
        gift_credits: input.giftCredits,
        period_end_at: "2026-06-15T08:00:00.000Z",
      }),
    ],
  );
}
