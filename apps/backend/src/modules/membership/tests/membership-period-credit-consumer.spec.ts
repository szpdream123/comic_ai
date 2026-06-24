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
const paymentIntentId = "99000000-0000-4000-8000-000000060001";

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
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [orderId],
      );
      const ledger = await db.query<{
        id: string;
        order_no: string | null;
        plan_code: string | null;
      }>(
        `
          SELECT
            id,
            metadata_json->>'orderNo' AS order_no,
            metadata_json->>'planCode' AS plan_code
          FROM credit_ledger_entries
          WHERE source_type = 'membership_gift'
            AND source_id = $1
        `,
        [periodId],
      );

      assert.equal(first.kind, "applied");
      assert.equal(first.creditGrant.amount, 800);
      assert.equal(replay.kind, "duplicate");
      assert.equal(organization.rows[0]?.credit_balance_cached, 800);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, first.creditGrant.id);
      assert.equal(ledger.rows[0]?.id, first.creditGrant.id);
      assert.equal(ledger.rows[0]?.order_no, "ORD-MEMBERSHIP-PERIOD-CREDIT");
      assert.equal(ledger.rows[0]?.plan_code, "experience_weekly_credit");
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

  it("does not grant membership gift credits unless the membership order is paid", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedMembershipPeriod(db, { giftCredits: 800, orderStatus: "pending_payment" });
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

      await assert.rejects(
        () =>
          consumeMembershipPeriodCreditGrant(db, {
            event,
            now: new Date("2026-06-08T08:01:00.000Z"),
          }),
        /membership_period_payment_not_confirmed/,
      );

      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );
      const order = await db.query<{ credit_grant_ledger_entry_id: string | null }>(
        "SELECT credit_grant_ledger_entry_id FROM billing_orders WHERE id = $1",
        [orderId],
      );
      const ledger = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'membership_gift'",
      );

      assert.equal(organization.rows[0]?.credit_balance_cached, 0);
      assert.equal(order.rows[0]?.credit_grant_ledger_entry_id, null);
      assert.equal(ledger.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedMembershipPeriod(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { giftCredits: number; orderStatus?: "paid" | "pending_payment" },
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
        paid_at,
        successful_payment_intent_id,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'ORD-MEMBERSHIP-PERIOD-CREDIT',
        'membership_plan',
        $4,
        '{}'::jsonb,
        '{}'::jsonb,
        $5,
        9900,
        'CNY',
        $6,
        CASE WHEN $6 = 'paid' THEN '2026-06-08T08:00:00.000Z'::timestamptz ELSE NULL END,
        CASE WHEN $6 = 'paid' THEN $7::uuid ELSE NULL END,
        '2026-06-08T08:30:00.000Z'
      )
    `,
    [orderId, organizationId, userId, planId, input.giftCredits, input.orderStatus ?? "paid", paymentIntentId],
  );
  if ((input.orderStatus ?? "paid") === "paid") {
    await db.query(
      `
        INSERT INTO payment_intents (
          id,
          organization_id,
          order_id,
          provider,
          product_mode,
          status,
          amount_minor,
          currency,
          merchant_order_no,
          provider_trade_id,
          provider_payload_hash,
          provider_safe_metadata_json,
          submitted_at,
          succeeded_at,
          expires_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'wechat_pay',
          'native_qr',
          'succeeded',
          9900,
          'CNY',
          'ORD-MEMBERSHIP-PERIOD-CREDIT',
          'wx-membership-period-credit',
          'payload-hash',
          '{}'::jsonb,
          '2026-06-08T07:59:00.000Z',
          '2026-06-08T08:00:00.000Z',
          '2026-06-08T08:30:00.000Z'
        )
      `,
      [paymentIntentId, organizationId, orderId],
    );
  }
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
      VALUES ($1, $2, $3, $4, 'experience', '2026-06-08T08:00:00.000Z', '2026-06-15T08:00:00.000Z', $5, '{"tier":"experience","code":"experience_weekly_credit"}'::jsonb, 'active', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z')
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
