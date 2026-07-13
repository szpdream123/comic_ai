import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { runMembershipMaintenance } from "../membership-maintenance.service.ts";

const userId = "30000000-0000-4000-8000-000000070001";
const planId = "95000000-0000-4000-8000-000000070001";
const orderId = "96000000-0000-4000-8000-000000070001";
const periodId = "97000000-0000-4000-8000-000000070001";
const lotId = "98000000-0000-4000-8000-000000070001";

describe("membership maintenance", { concurrency: false }, () => {
  it("creates due reminders at threshold windows idempotently", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProfessionalPeriod(db, {
        periodEndAt: "2026-06-15T08:00:00.000Z",
      });

      const first = await runMembershipMaintenance(db, {
        now: new Date("2026-06-08T08:00:00.000Z"),
        limit: 50,
      });
      const replay = await runMembershipMaintenance(db, {
        now: new Date("2026-06-08T08:00:00.000Z"),
        limit: 50,
      });
      const reminders = await db.query<{
        reminder_key: string;
        delivered_at: Date | string | null;
      }>(
        "SELECT reminder_key, delivered_at FROM membership_reminders WHERE user_id = $1",
        [userId],
      );

      assert.equal(first.createdReminderCount, 1);
      assert.equal(first.deliveredReminderCount, 1);
      assert.equal(replay.createdReminderCount, 0);
      assert.equal(replay.deliveredReminderCount, 0);
      assert.deepEqual(reminders.rows.map((row) => row.reminder_key), [
        "membership_expires_in_7d",
      ]);
      assert.ok(reminders.rows[0]?.delivered_at);
    } finally {
      await db.close();
    }
  });

  it("does not remind for superseded periods after a renewal extends the subscription", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProfessionalPeriod(db, {
        periodEndAt: "2026-06-15T08:00:00.000Z",
      });
      const renewalPeriodId = await seedRenewedProfessionalPeriod(db, {
        periodStartAt: "2026-06-15T08:00:00.000Z",
        periodEndAt: "2026-07-15T08:00:00.000Z",
      });

      const oldWindow = await runMembershipMaintenance(db, {
        now: new Date("2026-06-08T08:00:00.000Z"),
        limit: 50,
      });
      const oldReminders = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM membership_reminders WHERE user_id = $1",
        [userId],
      );

      const currentWindow = await runMembershipMaintenance(db, {
        now: new Date("2026-07-08T08:00:00.000Z"),
        limit: 50,
      });
      const currentReminders = await db.query<{
        membership_period_id: string;
        reminder_key: string;
      }>(
        "SELECT membership_period_id, reminder_key FROM membership_reminders WHERE user_id = $1",
        [userId],
      );

      assert.equal(oldWindow.createdReminderCount, 0);
      assert.equal(oldReminders.rows[0]?.count, 0);
      assert.equal(currentWindow.createdReminderCount, 1);
      assert.deepEqual(currentReminders.rows, [
        {
          membership_period_id: renewalPeriodId,
          reminder_key: "membership_expires_in_7d",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("expires membership and entitlements without freezing wallet credits at period end", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProfessionalPeriod(db, {
        periodEndAt: "2026-06-08T08:00:00.000Z",
        availableCredits: 120,
      });
      await db.query("UPDATE credit_lots SET expires_at = NULL WHERE id = $1", [lotId]);

      const result = await runMembershipMaintenance(db, {
        now: new Date("2026-06-08T08:00:01.000Z"),
        limit: 50,
      });
      const subscription = await db.query<{ membership_tier: string; status: string; expires_at: Date | string }>(
        "SELECT membership_tier, status, expires_at FROM user_memberships WHERE user_id = $1",
        [userId],
      );
      const period = await db.query<{ status: string }>(
        "SELECT status FROM membership_periods WHERE id = $1",
        [periodId],
      );
      const entitlement = await db.query<{ status: string }>(
        "SELECT status FROM user_entitlements WHERE user_id = $1 AND entitlement_key = 'priority_generation'",
        [userId],
      );
      const lot = await db.query<{ available_amount: number; expired_amount: number }>(
        "SELECT available_amount, expired_amount FROM credit_lots WHERE id = $1",
        [lotId],
      );
      const user = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [userId],
      );
      const freezeLedger = await db.query<{ entry_type: string; amount: number; available_delta: number }>(
        "SELECT entry_type, amount, available_delta FROM credit_ledger_entries WHERE source_type = 'membership_wallet_freeze'",
      );

      assert.equal(result.expiredMembershipCount, 1);
      assert.equal(result.expiredCreditAmount, 0);
      assert.equal(subscription.rows[0]?.membership_tier, "professional");
      assert.equal(subscription.rows[0]?.status, "expired");
      assert.equal(new Date(subscription.rows[0]!.expires_at).toISOString(), "2026-06-08T08:00:00.000Z");
      assert.equal(period.rows[0]?.status, "expired");
      assert.equal(entitlement.rows[0]?.status, "expired");
      assert.equal(lot.rows[0]?.available_amount, 120);
      assert.equal(lot.rows[0]?.expired_amount, 0);
      assert.equal(user.rows[0]?.credit_balance_cached, 120);
      assert.deepEqual(freezeLedger.rows, []);
    } finally {
      await db.close();
    }
  });

  it("keeps unused membership gift credits when the membership period expires", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedProfessionalPeriod(db, {
        periodEndAt: "2026-06-08T08:00:00.000Z",
        availableCredits: 120,
      });

      const result = await runMembershipMaintenance(db, {
        now: new Date("2026-06-08T08:00:01.000Z"),
        limit: 50,
      });
      const lot = await db.query<{ available_amount: number; expired_amount: number }>(
        "SELECT available_amount, expired_amount FROM credit_lots WHERE id = $1",
        [lotId],
      );
      const user = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM users WHERE id = $1",
        [userId],
      );

      assert.equal(result.expiredCreditAmount, 0);
      assert.equal(lot.rows[0]?.available_amount, 120);
      assert.equal(lot.rows[0]?.expired_amount, 0);
      assert.equal(user.rows[0]?.credit_balance_cached, 120);
    } finally {
      await db.close();
    }
  });
});

async function seedProfessionalPeriod(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { periodEndAt: string; availableCredits?: number },
) {
  const now = "2026-06-08T07:00:00.000Z";
  const planSnapshot = {
    id: planId,
    code: "professional_monthly_maintenance",
    displayName: "Professional Monthly Maintenance",
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 29900,
    currency: "CNY",
    giftCredits: input.availableCredits ?? 3000,
    seatLimit: 50,
    entitlements: ["priority_generation", "team_member_management"],
    priorityRules: { modelFamilies: ["seedance"] },
    displayMetadata: {},
  };
  await db.query(
    "INSERT INTO users (id, phone_e164, status, credit_balance_cached) VALUES ($1, '13800138001', 'active', $2)",
    [userId, input.availableCredits ?? 0],
  );
  await db.query(
    `
      INSERT INTO membership_plans (
        id, code, display_name, tier, period_unit, period_count, amount_minor, currency,
        gift_credits, seat_limit, entitlements_json, priority_rules_json, display_metadata_json, status
      )
      VALUES ($1, 'professional_monthly_maintenance', 'Professional Monthly Maintenance', 'professional', 'month', 1, 29900, 'CNY',
        $2, 50, $3::jsonb, $4::jsonb, '{}'::jsonb, 'active')
    `,
    [
      planId,
      planSnapshot.giftCredits,
      JSON.stringify(planSnapshot.entitlements),
      JSON.stringify(planSnapshot.priorityRules),
    ],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id, created_by_user_id, order_no, product_type, membership_plan_id,
        package_snapshot_json, product_snapshot_json, credits, amount_minor, currency, status, expires_at
      )
      VALUES ($1, $2, 'ORD-MAINTENANCE', 'membership_plan', $3, $4::jsonb, $4::jsonb, $5, 29900, 'CNY', 'pending_payment', $6)
    `,
    [
      orderId,
      userId,
      planId,
      JSON.stringify(planSnapshot),
      planSnapshot.giftCredits,
      input.periodEndAt,
    ],
  );
  await db.query(
    `
      INSERT INTO membership_periods (
        id, user_id, order_id, plan_id, tier, period_start_at, period_end_at,
        gift_credits, plan_snapshot_json, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'professional', $5, $6, $7, $8::jsonb, 'active', $5, $5)
    `,
    [
      periodId,
      userId,
      orderId,
      planId,
      now,
      input.periodEndAt,
      planSnapshot.giftCredits,
      JSON.stringify(planSnapshot),
    ],
  );
  await db.query(
    `
      INSERT INTO user_memberships (
        id,
        user_id,
        membership_tier,
        purchase_at,
        expires_at,
        gift_credits,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'professional', $3, $4, $5, 'active', $3, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        membership_tier = EXCLUDED.membership_tier,
        purchase_at = EXCLUDED.purchase_at,
        expires_at = EXCLUDED.expires_at,
        gift_credits = EXCLUDED.gift_credits,
        updated_at = EXCLUDED.updated_at
    `,
    [
      randomUUID(),
      userId,
      now,
      input.periodEndAt,
      planSnapshot.giftCredits,
    ],
  );

  for (const entitlementKey of planSnapshot.entitlements) {
    await db.query(
      `
        INSERT INTO user_entitlements (
          id, user_id, entitlement_key, status, source, expires_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, 'active', 'payment', $4, $5, $5)
      `,
      [randomUUID(), userId, entitlementKey, input.periodEndAt, now],
    );
  }

  if (!input.availableCredits) {
    return;
  }

  const grantLedgerEntryId = randomUUID();
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id, user_id, team_member_id, reservation_id, allocation_id, entry_type, amount,
        available_delta, reserved_delta, consumed_delta, source_type, source_id,
        reason, metadata_json, created_by_user_id, created_at
      )
      VALUES ($1, $2, NULL, NULL, NULL, 'grant', $3, $3, 0, 0, 'membership_gift', $4, '会员赠送积分', '{}'::jsonb, $5, $6)
    `,
    [grantLedgerEntryId, userId, input.availableCredits, periodId, userId, now],
  );
  await db.query(
    `
      INSERT INTO credit_lots (
        id, user_id, source_type, source_id, grant_ledger_entry_id,
        total_amount, available_amount, reserved_amount, consumed_amount, expired_amount,
        expires_at, metadata_json, created_at, updated_at
      )
      VALUES ($1, $2, 'membership_gift', $3, $4, $5, $5, 0, 0, 0, $6, $7::jsonb, $8, $8)
    `,
    [
      lotId,
      userId,
      periodId,
      grantLedgerEntryId,
      input.availableCredits,
      input.periodEndAt,
      JSON.stringify({ tier: "professional", membershipPeriodId: periodId }),
      now,
    ],
  );
}

async function seedRenewedProfessionalPeriod(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { periodStartAt: string; periodEndAt: string },
) {
  const renewalOrderId = "96000000-0000-4000-8000-000000070002";
  const renewalPeriodId = "97000000-0000-4000-8000-000000070002";
  const planSnapshot = {
    id: planId,
    code: "professional_monthly_maintenance",
    displayName: "Professional Monthly Maintenance",
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 29900,
    currency: "CNY",
    giftCredits: 3000,
    seatLimit: 50,
    entitlements: ["priority_generation", "team_member_management"],
    priorityRules: { modelFamilies: ["seedance"] },
    displayMetadata: {},
  };

  await db.query(
    `
      INSERT INTO billing_orders (
        id, created_by_user_id, order_no, product_type, membership_plan_id,
        package_snapshot_json, product_snapshot_json, credits, amount_minor, currency, status, expires_at
      )
      VALUES ($1, $2, 'ORD-MAINTENANCE-RENEWAL', 'membership_plan', $3, $4::jsonb, $4::jsonb, 3000, 29900, 'CNY', 'pending_payment', $5)
    `,
    [
      renewalOrderId,
      userId,
      planId,
      JSON.stringify(planSnapshot),
      input.periodEndAt,
    ],
  );
  await db.query(
    `
      INSERT INTO membership_periods (
        id, user_id, order_id, plan_id, tier, period_start_at, period_end_at,
        gift_credits, plan_snapshot_json, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, 'professional', $5, $6, 3000, $7::jsonb, 'active', $5, $5)
    `,
    [
      renewalPeriodId,
      userId,
      renewalOrderId,
      planId,
      input.periodStartAt,
      input.periodEndAt,
      JSON.stringify(planSnapshot),
    ],
  );
  await db.query(
    `
      UPDATE user_memberships
      SET expires_at = $2,
          updated_at = $1
      WHERE user_id = $3
    `,
    [input.periodStartAt, input.periodEndAt, userId],
  );

  return renewalPeriodId;
}
