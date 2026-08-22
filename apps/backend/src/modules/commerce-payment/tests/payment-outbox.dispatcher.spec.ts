import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { dispatchPaymentOutboxBatch } from "../payment-outbox.dispatcher.ts";

const userId = "30000000-0000-4000-8000-000000040001";
const creditPackageId = "90000000-0000-4000-8000-000000040001";
const membershipPlanId = "95000000-0000-4000-8000-000000040001";

describe("payment outbox dispatcher", { concurrency: false }, () => {
  it("dispatches payment success events to membership and credit consumers", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      await seedPaidCreditOrder(db, {
        orderId: "91000000-0000-4000-8000-000000040001",
        paymentIntentId: "92000000-0000-4000-8000-000000040001",
        providerEventId: "93000000-0000-4000-8000-000000040001",
        outboxEventId: "94000000-0000-4000-8000-000000040001",
        paidAmountMinor: 9800,
        discountAmountMinor: 100,
      });
      await seedPaidMembershipOrder(db, {
        orderId: "96000000-0000-4000-8000-000000040001",
        paymentIntentId: "97000000-0000-4000-8000-000000040001",
        providerEventId: "98000000-0000-4000-8000-000000040001",
        outboxEventId: "99000000-0000-4000-8000-000000040001",
        paidAmountMinor: 29700,
        discountAmountMinor: 200,
      });

      const result = await dispatchPaymentOutboxBatch(db, {
        now: new Date("2026-06-08T08:05:00.000Z"),
        limit: 10,
      });

      const outbox = await db.query<{ id: string; status: string }>(
        "SELECT id, status FROM outbox_events WHERE event_type = 'payment.succeeded' ORDER BY id ASC",
      );
      const membershipPeriods = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM membership_periods",
      );
      const creditLedger = await db.query<{ source_id: string; amount: number }>(
        "SELECT source_id, amount FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const membershipGiftLots = await db.query<{ available_amount: number; expires_at: Date | string | null }>(
        "SELECT available_amount, expires_at FROM credit_lots WHERE source_type = 'membership_gift'",
      );
      const user = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [userId],
      );

      assert.deepEqual(result, {
        processedEventIds: [
          "94000000-0000-4000-8000-000000040001",
          "99000000-0000-4000-8000-000000040001",
        ],
        failedEventIds: [],
      });
      assert.deepEqual(outbox.rows, [
        { id: "94000000-0000-4000-8000-000000040001", status: "processed" },
        { id: "99000000-0000-4000-8000-000000040001", status: "processed" },
      ]);
      assert.equal(membershipPeriods.rows[0]?.count, 1);
      assert.deepEqual(creditLedger.rows, [
        { source_id: "91000000-0000-4000-8000-000000040001", amount: 120 },
      ]);
      assert.equal(membershipGiftLots.rows.length, 1);
      assert.equal(Number(membershipGiftLots.rows[0]?.available_amount), 3000);
      assert.equal(
        new Date(membershipGiftLots.rows[0]!.expires_at!).toISOString(),
        "2026-07-08T08:00:00.000Z",
      );
      assert.equal(user.rows[0]?.credit_balance_cached, 3120);
      const payloads = await db.query<{ payload_json: Record<string, unknown> }>(
        "SELECT payload_json FROM outbox_events WHERE event_type = 'payment.succeeded' ORDER BY id ASC",
      );
      assert.deepEqual(
        payloads.rows.map((row) => ({
          amount: row.payload_json.amount_minor,
          paid: row.payload_json.paid_amount_minor,
          discount: row.payload_json.discount_amount_minor,
        })),
        [
          { amount: 9900, paid: 9800, discount: 100 },
          { amount: 29900, paid: 29700, discount: 200 },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("marks payment outbox events failed when a consumer rejects the payload", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      await db.query(
        `
          INSERT INTO outbox_events (
        id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
          VALUES ('94000000-0000-4000-8000-000000040999', 'payment.succeeded', '{"bad":true}'::jsonb, 'pending', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z')
        `,
    [],
      );

      const result = await dispatchPaymentOutboxBatch(db, {
        now: new Date("2026-06-08T08:05:00.000Z"),
        limit: 10,
        retryDelayMs: 60_000,
      });
      const failed = await db.query<{
        status: string;
        error_message: string | null;
        available_at: Date | string;
      }>(
        "SELECT status, error_message, available_at FROM outbox_events WHERE id = '94000000-0000-4000-8000-000000040999'",
      );

      assert.deepEqual(result, {
        processedEventIds: [],
        failedEventIds: ["94000000-0000-4000-8000-000000040999"],
      });
      assert.equal(failed.rows[0]?.status, "failed");
      assert.match(failed.rows[0]?.error_message ?? "", /invalid_payment_succeeded_payload/);
      assert.equal(
        new Date(failed.rows[0]!.available_at).toISOString(),
        "2026-06-08T08:06:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("skips every payment benefit when the provider event has duplicate trade risk", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedUser(db);
      const orderId = "91000000-0000-4000-8000-000000040010";
      const paymentIntentId = "92000000-0000-4000-8000-000000040010";
      const providerEventId = "93000000-0000-4000-8000-000000040010";
      const outboxEventId = "94000000-0000-4000-8000-000000040010";
      await seedPaidCreditOrder(db, {
        orderId,
        paymentIntentId,
        providerEventId,
        outboxEventId,
      });
      await db.query(
        `
          INSERT INTO payment_risk_events (
            id, user_id, order_id, payment_intent_id, provider_event_id,
            risk_type, severity, decision, status, metadata_json, created_at, updated_at
          )
          VALUES (
            '95000000-0000-4000-8000-000000040010', $1, $2, $3, $4,
            'duplicate_trade', 'critical', 'manual_review', 'open', '{}'::jsonb,
            '2026-06-08T08:02:00.000Z', '2026-06-08T08:02:00.000Z'
          )
        `,
        [userId, orderId, paymentIntentId, providerEventId],
      );

      const result = await dispatchPaymentOutboxBatch(db, {
        now: new Date("2026-06-08T08:05:00.000Z"),
        limit: 10,
      });
      const outbox = await db.query<{ status: string }>(
        "SELECT status FROM outbox_events WHERE id = $1",
        [outboxEventId],
      );
      const ledger = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_id = $1",
        [orderId],
      );
      const inbox = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM inbox_events
          WHERE outbox_event_id = $1
            AND consumer_name IN (
              'membership.payment-succeeded',
              'credit.payment-succeeded',
              'invite-reward.payment-succeeded'
            )
        `,
        [outboxEventId],
      );

      assert.deepEqual(result, { processedEventIds: [outboxEventId], failedEventIds: [] });
      assert.equal(outbox.rows[0]?.status, "processed");
      assert.equal(ledger.rows[0]?.count, 0);
      assert.equal(inbox.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedUser(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800438001', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [userId],
  );


}

async function seedPaidCreditOrder(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    orderId: string;
    paymentIntentId: string;
    providerEventId: string;
    outboxEventId: string;
    paidAmountMinor?: number;
    discountAmountMinor?: number;
  },
) {
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status
      )
      VALUES ($1, 'dispatcher_120', 'Dispatcher 120', 120, 9900, 'CNY', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [creditPackageId],
  );
  await seedPaidOrderFacts(db, {
    ...input,
    orderNo: "ORD-DISPATCH-CREDIT",
    productColumns: `
      product_type,
      credit_package_id,
      package_snapshot_json,
      product_snapshot_json,
    `,
    productValues: `
      'credit_package',
      '${creditPackageId}',
      '{"code":"dispatcher_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb,
      '{"code":"dispatcher_120","credits":120,"amountMinor":9900,"currency":"CNY"}'::jsonb,
    `,
    amountMinor: 9900,
    credits: 120,
  });
}

async function seedPaidMembershipOrder(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    orderId: string;
    paymentIntentId: string;
    providerEventId: string;
    outboxEventId: string;
    paidAmountMinor?: number;
    discountAmountMinor?: number;
  },
) {
  const planSnapshot = {
    id: membershipPlanId,
    code: "dispatcher_professional_monthly",
    displayName: "Dispatcher Professional Monthly",
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 29900,
    currency: "CNY",
    giftCredits: 3000,
    seatLimit: 50,
    entitlements: ["team_member_management", "priority_generation"],
  };
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
      VALUES ($1, 'dispatcher_professional_monthly', 'Dispatcher Professional Monthly', 'professional', 'month', 1, 29900, 'CNY', 3000, 50, '["team_member_management","priority_generation"]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [membershipPlanId],
  );
  await seedPaidOrderFacts(db, {
    ...input,
    orderNo: "ORD-DISPATCH-MEMBERSHIP",
    productColumns: `
      product_type,
      membership_plan_id,
      package_snapshot_json,
      product_snapshot_json,
    `,
    productValues: `
      'membership_plan',
      '${membershipPlanId}',
      '${JSON.stringify(planSnapshot)}'::jsonb,
      '${JSON.stringify(planSnapshot)}'::jsonb,
    `,
    amountMinor: 29900,
    credits: 3000,
  });
}

async function seedPaidOrderFacts(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    orderId: string;
    paymentIntentId: string;
    providerEventId: string;
    outboxEventId: string;
    orderNo: string;
    productColumns: string;
    productValues: string;
    amountMinor: number;
    credits: number;
    paidAmountMinor?: number;
    discountAmountMinor?: number;
  },
) {
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        ${input.productColumns}
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ($1, $2, $3, ${input.productValues}
        $4, $5, 'CNY', 'paid', '2026-06-08T08:30:00.000Z', '2026-06-08T08:00:00.000Z', $6)
    `,
    [input.orderId,
      userId,
      input.orderNo,
      input.credits,
      input.amountMinor,
      input.paymentIntentId,
      ],
  );
  await db.query(
    `
      INSERT INTO payment_intents (
        id,
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
      VALUES ($1, $2, 'wechat_pay', 'native_qr', 'succeeded', $3, 'CNY', $4, $5, 'payload-hash', '{}'::jsonb, '2026-06-08T07:59:00.000Z', '2026-06-08T08:00:00.000Z', '2026-06-08T08:30:00.000Z')
    `,
    [input.paymentIntentId,
      input.orderId,
      input.amountMinor,
      input.orderNo,
      `wx-${input.orderNo}`,
      ],
  );
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'wechat_pay', $4, $5, $6, 'payment_succeeded', 'verified', 'processed', 'payload-hash', '{}'::jsonb, 'sent_success', NULL, '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z', '2026-06-08T08:00:00.000Z')
    `,
    [input.providerEventId,
      input.orderId,
      input.paymentIntentId,
      `dedup-${input.orderNo}`,
      input.orderNo,
      `wx-${input.orderNo}`,
      ],
  );
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        user_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'payment.succeeded', $3::jsonb, 'pending', '2026-06-08T08:01:00.000Z', '2026-06-08T08:01:00.000Z', '2026-06-08T08:01:00.000Z')
    `,
    [input.outboxEventId,
      userId,
      JSON.stringify({
        order_id: input.orderId,
        payment_intent_id: input.paymentIntentId,
        payment_provider_event_id: input.providerEventId,
        amount_minor: input.amountMinor,
        ...(input.paidAmountMinor !== undefined
          ? { paid_amount_minor: input.paidAmountMinor }
          : {}),
        ...(input.discountAmountMinor !== undefined
          ? { discount_amount_minor: input.discountAmountMinor }
          : {}),
        currency: "CNY",
      }),
      ],
  );
}
