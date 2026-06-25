import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { consumePaymentSucceededMembershipActivation } from "../payment-succeeded-membership-consumer.service.ts";

const organizationId = "10000000-0000-4000-8000-000000030001";
const workspaceId = "20000000-0000-4000-8000-000000030001";
const userId = "30000000-0000-4000-8000-000000030001";
const professionalPlanId = "95000000-0000-4000-8000-000000030001";
const experiencePlanId = "95000000-0000-4000-8000-000000030002";

describe("payment succeeded membership consumer", { concurrency: false }, () => {
  it("activates professional membership, entitlements, team limits, and emits a period event", async () => {
    const db = await createMigratedTestDb();

    try {
      const fixture = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030001",
        paymentIntentId: "97000000-0000-4000-8000-000000030001",
        providerEventId: "98000000-0000-4000-8000-000000030001",
        outboxEventId: "99000000-0000-4000-8000-000000030001",
        plan: professionalPlan(),
        amountMinor: 500000,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });

      const result = await consumePaymentSucceededMembershipActivation(db, {
        event: fixture.event,
        now: new Date("2026-06-08T08:05:00.000Z"),
      });

      const subscription = await db.query<{
        status: string;
        current_tier: string | null;
        current_period_end_at: Date | string | null;
      }>(
        `
          SELECT status, current_tier, current_period_end_at
          FROM organization_membership_subscriptions
          WHERE organization_id = $1
        `,
        [organizationId],
      );
      const entitlements = await db.query<{ entitlement_key: string; status: string }>(
        `
          SELECT entitlement_key, status
          FROM organization_entitlements
          WHERE organization_id = $1
          ORDER BY entitlement_key
        `,
        [organizationId],
      );
      const limits = await db.query<{ seat_limit: number }>(
        "SELECT seat_limit FROM team_plan_limits WHERE organization_id = $1",
        [organizationId],
      );
      const outbox = await db.query<{ event_type: string; payload_json: Record<string, unknown> }>(
        "SELECT event_type, payload_json FROM outbox_events WHERE event_type = 'membership.period.started'",
      );

      assert.equal(result.kind, "applied");
      assert.equal(result.period.tier, "professional");
      assert.equal(result.period.periodStartAt, "2026-06-08T08:00:00.000Z");
      assert.equal(result.period.periodEndAt, "2026-07-08T08:00:00.000Z");
      assert.equal(subscription.rows[0]?.status, "professional_active");
      assert.equal(subscription.rows[0]?.current_tier, "professional");
      assert.equal(
        new Date(subscription.rows[0]!.current_period_end_at!).toISOString(),
        "2026-07-08T08:00:00.000Z",
      );
      assert.deepEqual(entitlements.rows, [
        { entitlement_key: "priority_generation", status: "active" },
        { entitlement_key: "team_asset_library", status: "active" },
        { entitlement_key: "team_member_management", status: "active" },
      ]);
      assert.equal(Number(limits.rows[0]?.seat_limit), 50);
      assert.equal(outbox.rows.length, 1);
      assert.equal(outbox.rows[0]?.event_type, "membership.period.started");
      assert.equal(outbox.rows[0]?.payload_json.gift_credits, 51000);
      assert.equal(outbox.rows[0]?.payload_json.order_id, fixture.orderId);
    } finally {
      await db.close();
    }
  });

  it("activates every professional entitlement configured on the paid plan snapshot", async () => {
    const db = await createMigratedTestDb();

    try {
      const fixture = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030041",
        paymentIntentId: "97000000-0000-4000-8000-000000030041",
        providerEventId: "98000000-0000-4000-8000-000000030041",
        outboxEventId: "99000000-0000-4000-8000-000000030041",
        plan: {
          ...professionalPlan(),
          entitlements: [
            "canvas_access",
            "priority_generation",
            "team_asset_library",
            "team_member_management",
            "full_flow_agent",
          ],
        },
        amountMinor: 29900,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });

      await consumePaymentSucceededMembershipActivation(db, {
        event: fixture.event,
        now: new Date("2026-06-08T08:05:00.000Z"),
      });

      const entitlements = await db.query<{ entitlement_key: string; status: string }>(
        `
          SELECT entitlement_key, status
          FROM organization_entitlements
          WHERE organization_id = $1
          ORDER BY entitlement_key
        `,
        [organizationId],
      );

      assert.deepEqual(entitlements.rows, [
        { entitlement_key: "canvas_access", status: "active" },
        { entitlement_key: "full_flow_agent", status: "active" },
        { entitlement_key: "priority_generation", status: "active" },
        { entitlement_key: "team_asset_library", status: "active" },
        { entitlement_key: "team_member_management", status: "active" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("keeps professional entitlements limited to the paid plan configuration", async () => {
    const db = await createMigratedTestDb();

    try {
      const limitedPlan = {
        ...professionalPlan(),
        entitlements: ["team_member_management", "priority_generation"],
      };
      const fixture = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030051",
        paymentIntentId: "97000000-0000-4000-8000-000000030051",
        providerEventId: "98000000-0000-4000-8000-000000030051",
        outboxEventId: "99000000-0000-4000-8000-000000030051",
        plan: limitedPlan,
        amountMinor: 29900,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });

      await consumePaymentSucceededMembershipActivation(db, {
        event: fixture.event,
        now: new Date("2026-06-08T08:05:00.000Z"),
      });

      const entitlements = await db.query<{ entitlement_key: string; status: string }>(
        `
          SELECT entitlement_key, status
          FROM organization_entitlements
          WHERE organization_id = $1
          ORDER BY entitlement_key
        `,
        [organizationId],
      );

      assert.deepEqual(entitlements.rows, [
        { entitlement_key: "priority_generation", status: "active" },
        { entitlement_key: "team_member_management", status: "active" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("extends repeat experience purchases without opening professional entitlements", async () => {
    const db = await createMigratedTestDb();

    try {
      const first = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030101",
        paymentIntentId: "97000000-0000-4000-8000-000000030101",
        providerEventId: "98000000-0000-4000-8000-000000030101",
        outboxEventId: "99000000-0000-4000-8000-000000030101",
        plan: experiencePlan(),
        amountMinor: 9900,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });
      const second = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030102",
        paymentIntentId: "97000000-0000-4000-8000-000000030102",
        providerEventId: "98000000-0000-4000-8000-000000030102",
        outboxEventId: "99000000-0000-4000-8000-000000030102",
        plan: experiencePlan(),
        amountMinor: 9900,
        paidAt: new Date("2026-06-10T08:00:00.000Z"),
      });

      const firstResult = await consumePaymentSucceededMembershipActivation(db, {
        event: first.event,
        now: new Date("2026-06-08T08:00:00.000Z"),
      });
      assert.equal(firstResult.kind, "applied");
      await grantCredits(db, {
        organizationId,
        amount: 800,
        sourceType: "membership_gift",
        sourceId: firstResult.period.id,
        reason: "seed first membership gift lot",
        metadata: { tier: "experience" },
        lot: {
          sourceType: "membership_gift",
          sourceId: firstResult.period.id,
          expiresAt: new Date(firstResult.period.periodEndAt),
          metadata: { tier: "experience" },
        },
        now: new Date("2026-06-08T08:01:00.000Z"),
      });
      const secondResult = await consumePaymentSucceededMembershipActivation(db, {
        event: second.event,
        now: new Date("2026-06-10T08:00:00.000Z"),
      });

      const subscription = await db.query<{ current_tier: string; current_period_end_at: Date | string }>(
        "SELECT current_tier, current_period_end_at FROM organization_membership_subscriptions WHERE organization_id = $1",
        [organizationId],
      );
      const professionalEntitlements = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM organization_entitlements WHERE organization_id = $1 AND entitlement_key IN ('priority_generation', 'team_asset_library', 'team_member_management')",
        [organizationId],
      );
      const limits = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM team_plan_limits WHERE organization_id = $1",
        [organizationId],
      );
      const giftLot = await db.query<{ expires_at: Date | string; metadata_json: Record<string, unknown> }>(
        "SELECT expires_at, metadata_json FROM credit_lots WHERE organization_id = $1 AND source_type = 'membership_gift'",
        [organizationId],
      );

      assert.equal(secondResult.kind, "applied");
      assert.equal(subscription.rows[0]?.current_tier, "experience");
      assert.equal(
        new Date(subscription.rows[0]!.current_period_end_at).toISOString(),
        "2026-06-22T08:00:00.000Z",
      );
      assert.equal(professionalEntitlements.rows[0]?.count, 0);
      assert.equal(limits.rows[0]?.count, 0);
      assert.equal(new Date(giftLot.rows[0]!.expires_at).toISOString(), "2026-06-22T08:00:00.000Z");
      assert.equal(giftLot.rows[0]?.metadata_json.tier, "experience");
    } finally {
      await db.close();
    }
  });

  it("keeps active professional membership current when a later experience payment succeeds", async () => {
    const db = await createMigratedTestDb();

    try {
      const professional = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030201",
        paymentIntentId: "97000000-0000-4000-8000-000000030201",
        providerEventId: "98000000-0000-4000-8000-000000030201",
        outboxEventId: "99000000-0000-4000-8000-000000030201",
        plan: professionalPlan(),
        amountMinor: 500000,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });
      const experience = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030202",
        paymentIntentId: "97000000-0000-4000-8000-000000030202",
        providerEventId: "98000000-0000-4000-8000-000000030202",
        outboxEventId: "99000000-0000-4000-8000-000000030202",
        plan: experiencePlan(),
        amountMinor: 9900,
        paidAt: new Date("2026-06-09T08:00:00.000Z"),
      });

      await consumePaymentSucceededMembershipActivation(db, {
        event: professional.event,
        now: new Date("2026-06-08T08:05:00.000Z"),
      });
      await consumePaymentSucceededMembershipActivation(db, {
        event: experience.event,
        now: new Date("2026-06-09T08:05:00.000Z"),
      });

      const subscription = await db.query<{
        status: string;
        current_tier: string | null;
        current_period_end_at: Date | string | null;
      }>(
        "SELECT status, current_tier, current_period_end_at FROM organization_membership_subscriptions WHERE organization_id = $1",
        [organizationId],
      );
      const activeProfessionalEntitlements = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM organization_entitlements
          WHERE organization_id = $1
            AND entitlement_key IN ('priority_generation', 'team_asset_library', 'team_member_management')
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > $2)
        `,
        [organizationId, new Date("2026-06-09T08:05:00.000Z")],
      );
      const periods = await db.query<{ tier: string; status: string; period_end_at: Date | string }>(
        `
          SELECT tier, status, period_end_at
          FROM membership_periods
          WHERE organization_id = $1
          ORDER BY tier
        `,
        [organizationId],
      );
      assert.equal(subscription.rows[0]?.status, "professional_active");
      assert.equal(subscription.rows[0]?.current_tier, "professional");
      assert.equal(
        new Date(subscription.rows[0]!.current_period_end_at!).toISOString(),
        "2026-07-08T08:00:00.000Z",
      );
      assert.equal(activeProfessionalEntitlements.rows[0]?.count, 3);
      assert.deepEqual(
        periods.rows.map((period) => ({
          tier: period.tier,
          status: period.status,
          periodEndAt: new Date(period.period_end_at).toISOString(),
        })),
        [
          { tier: "experience", status: "active", periodEndAt: "2026-07-08T08:00:00.000Z" },
          { tier: "professional", status: "active", periodEndAt: "2026-07-08T08:00:00.000Z" },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("restores frozen wallet credits when a new membership payment activates", async () => {
    const db = await createMigratedTestDb();

    try {
      const experience = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030211",
        paymentIntentId: "97000000-0000-4000-8000-000000030211",
        providerEventId: "98000000-0000-4000-8000-000000030211",
        outboxEventId: "99000000-0000-4000-8000-000000030211",
        plan: experiencePlan(),
        amountMinor: 9900,
        paidAt: new Date("2026-06-10T08:00:00.000Z"),
      });
      await db.query(
        `
          UPDATE organizations
          SET credit_balance_cached = 0,
              credit_frozen_cached = 420,
              credit_frozen_at = '2026-06-09T08:00:00.000Z',
              credit_frozen_until = '2027-06-09T08:00:00.000Z'
          WHERE id = $1
        `,
        [organizationId],
      );
      await db.query(
        `
          INSERT INTO credit_ledger_entries (
            id,
            organization_id,
            entry_type,
            amount,
            available_delta,
            reserved_delta,
            consumed_delta,
            source_type,
            source_id,
            reason,
            metadata_json
          )
          VALUES (
            '93000000-0000-4000-8000-000000030211',
            $1,
            'grant',
            420,
            420,
            0,
            0,
            'payment_order',
            '94000000-0000-4000-8000-000000030211',
            'seed frozen direct recharge',
            '{}'::jsonb
          )
        `,
        [organizationId],
      );
      await db.query(
        `
          INSERT INTO credit_lots (
            id,
            organization_id,
            source_type,
            source_id,
            grant_ledger_entry_id,
            total_amount,
            available_amount,
            reserved_amount,
            consumed_amount,
            expired_amount,
            status,
            frozen_at,
            frozen_until,
            metadata_json
          )
          VALUES (
            '94000000-0000-4000-8000-000000030211',
            $1,
            'payment_order',
            '94000000-0000-4000-8000-000000030211',
            '93000000-0000-4000-8000-000000030211',
            420,
            420,
            0,
            0,
            0,
            'frozen',
            '2026-06-09T08:00:00.000Z',
            '2027-06-09T08:00:00.000Z',
            '{"kind":"direct_recharge"}'::jsonb
          )
        `,
        [organizationId],
      );

      await consumePaymentSucceededMembershipActivation(db, {
        event: experience.event,
        now: new Date("2026-06-10T08:05:00.000Z"),
      });

      const organization = await db.query<{ credit_balance_cached: number; credit_frozen_cached: number }>(
        "SELECT credit_balance_cached, credit_frozen_cached FROM organizations WHERE id = $1",
        [organizationId],
      );
      const lot = await db.query<{ status: string; frozen_at: Date | string | null; frozen_until: Date | string | null }>(
        "SELECT status, frozen_at, frozen_until FROM credit_lots WHERE id = '94000000-0000-4000-8000-000000030211'",
      );
      const restoreLedger = await db.query<{ entry_type: string; amount: number; available_delta: number }>(
        "SELECT entry_type, amount, available_delta FROM credit_ledger_entries WHERE source_type = 'membership_wallet_restore'",
      );

      assert.equal(organization.rows[0]?.credit_balance_cached, 420);
      assert.equal(organization.rows[0]?.credit_frozen_cached, 0);
      assert.equal(lot.rows[0]?.status, "active");
      assert.equal(lot.rows[0]?.frozen_at, null);
      assert.equal(lot.rows[0]?.frozen_until, null);
      assert.deepEqual(restoreLedger.rows, [{ entry_type: "restore", amount: 420, available_delta: 420 }]);
    } finally {
      await db.close();
    }
  });

  it("does not keep downgrading an organization that already has a professional period but an experience current tier", async () => {
    const db = await createMigratedTestDb();

    try {
      const professional = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030301",
        paymentIntentId: "97000000-0000-4000-8000-000000030301",
        providerEventId: "98000000-0000-4000-8000-000000030301",
        outboxEventId: "99000000-0000-4000-8000-000000030301",
        plan: professionalPlan(),
        amountMinor: 500000,
        paidAt: new Date("2026-06-08T08:00:00.000Z"),
      });
      const experience = await seedPaidMembershipOrderWithOutbox(db, {
        orderId: "96000000-0000-4000-8000-000000030302",
        paymentIntentId: "97000000-0000-4000-8000-000000030302",
        providerEventId: "98000000-0000-4000-8000-000000030302",
        outboxEventId: "99000000-0000-4000-8000-000000030302",
        plan: experiencePlan(),
        amountMinor: 9900,
        paidAt: new Date("2026-06-10T08:00:00.000Z"),
      });

      await consumePaymentSucceededMembershipActivation(db, {
        event: professional.event,
        now: new Date("2026-06-08T08:05:00.000Z"),
      });
      await db.query(
        `
          UPDATE organization_membership_subscriptions
          SET status = 'experience_active',
              current_tier = 'experience',
              current_period_end_at = '2026-06-16T08:00:00.000Z'
          WHERE organization_id = $1
        `,
        [organizationId],
      );
      await db.query(
        `
          UPDATE organization_entitlements
          SET status = 'expired',
              expires_at = '2026-06-09T08:00:00.000Z'
          WHERE organization_id = $1
            AND source = 'payment'
        `,
        [organizationId],
      );

      await consumePaymentSucceededMembershipActivation(db, {
        event: experience.event,
        now: new Date("2026-06-10T08:05:00.000Z"),
      });

      const subscription = await db.query<{
        status: string;
        current_tier: string | null;
        current_period_end_at: Date | string | null;
      }>(
        "SELECT status, current_tier, current_period_end_at FROM organization_membership_subscriptions WHERE organization_id = $1",
        [organizationId],
      );
      const periods = await db.query<{ tier: string; status: string }>(
        `
          SELECT tier, status
          FROM membership_periods
          WHERE organization_id = $1
          ORDER BY tier, period_end_at
        `,
        [organizationId],
      );
      const activeProfessionalEntitlements = await db.query<{ count: number }>(
        `
          SELECT count(*)::int AS count
          FROM organization_entitlements
          WHERE organization_id = $1
            AND entitlement_key IN ('priority_generation', 'team_asset_library', 'team_member_management')
            AND status = 'active'
            AND (expires_at IS NULL OR expires_at > $2)
        `,
        [organizationId, new Date("2026-06-10T08:05:00.000Z")],
      );

      assert.equal(subscription.rows[0]?.status, "professional_active");
      assert.equal(subscription.rows[0]?.current_tier, "professional");
      assert.equal(
        new Date(subscription.rows[0]!.current_period_end_at!).toISOString(),
        "2026-07-08T08:00:00.000Z",
      );
      assert.deepEqual(periods.rows, [
        { tier: "experience", status: "active" },
        { tier: "professional", status: "active" },
      ]);
      assert.equal(activeProfessionalEntitlements.rows[0]?.count, 3);
    } finally {
      await db.close();
    }
  });
});

function professionalPlan() {
  return {
    id: professionalPlanId,
    code: "professional_monthly",
    displayName: "Professional Monthly",
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 500000,
    giftCredits: 51000,
    seatLimit: 50,
    entitlements: ["team_member_management", "team_asset_library", "priority_generation"],
    priorityRules: { modelFamilies: ["seedance"] },
    displayMetadata: { sortOrder: 20 },
  };
}

function experiencePlan() {
  return {
    id: experiencePlanId,
    code: "experience_weekly",
    displayName: "Experience Weekly",
    tier: "experience",
    periodUnit: "day",
    periodCount: 7,
    amountMinor: 9900,
    giftCredits: 800,
    seatLimit: 0,
    entitlements: [],
    priorityRules: {},
    displayMetadata: { sortOrder: 10 },
  };
}

async function seedPaidMembershipOrderWithOutbox(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    orderId: string;
    paymentIntentId: string;
    providerEventId: string;
    outboxEventId: string;
    plan: ReturnType<typeof professionalPlan>;
    amountMinor: number;
    paidAt: Date;
  },
) {
  await seedTenant(db);
  await seedPlan(db, input.plan);

  const orderNo = `ORD-${input.orderId.slice(-8)}`;
  const planSnapshot = {
    id: input.plan.id,
    code: input.plan.code,
    displayName: input.plan.displayName,
    tier: input.plan.tier,
    periodUnit: input.plan.periodUnit,
    periodCount: input.plan.periodCount,
    amountMinor: input.plan.amountMinor,
    currency: "CNY",
    giftCredits: input.plan.giftCredits,
    seatLimit: input.plan.seatLimit,
    entitlements: input.plan.entitlements,
    priorityRules: input.plan.priorityRules,
    displayMetadata: input.plan.displayMetadata,
  };

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
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'membership_plan',
        $5,
        $6::jsonb,
        $6::jsonb,
        $7,
        $8,
        'CNY',
        'paid',
        $9,
        $10,
        $11
      )
    `,
    [
      input.orderId,
      organizationId,
      userId,
      orderNo,
      input.plan.id,
      JSON.stringify(planSnapshot),
      input.plan.giftCredits,
      input.amountMinor,
      new Date(input.paidAt.getTime() + 30 * 60 * 1000),
      input.paidAt,
      input.paymentIntentId,
    ],
  );
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
        $4,
        'CNY',
        $5,
        $6,
        'payload-hash',
        '{}'::jsonb,
        $7,
        $8,
        $9
      )
    `,
    [
      input.paymentIntentId,
      organizationId,
      input.orderId,
      input.amountMinor,
      orderNo,
      `wx-${input.paymentIntentId.slice(-8)}`,
      new Date(input.paidAt.getTime() - 60_000),
      input.paidAt,
      new Date(input.paidAt.getTime() + 30 * 60 * 1000),
    ],
  );
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        organization_id,
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'wechat_pay',
        $5,
        $6,
        $7,
        'payment_succeeded',
        'verified',
        'processed',
        'payload-hash',
        '{}'::jsonb,
        'sent_success',
        NULL,
        $8,
        $8,
        $8,
        $8
      )
    `,
    [
      input.providerEventId,
      organizationId,
      input.orderId,
      input.paymentIntentId,
      `dedup-${input.providerEventId.slice(-8)}`,
      orderNo,
      `wx-${input.paymentIntentId.slice(-8)}`,
      input.paidAt,
    ],
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
      VALUES ($1, $2, 'payment.succeeded', $3::jsonb, 'pending', $4, $4, $4)
    `,
    [
      input.outboxEventId,
      organizationId,
      JSON.stringify({
        order_id: input.orderId,
        payment_intent_id: input.paymentIntentId,
        payment_provider_event_id: input.providerEventId,
        amount_minor: input.amountMinor,
        currency: "CNY",
      }),
      new Date(input.paidAt.getTime() + 60_000),
    ],
  );

  return {
    orderId: input.orderId,
    event: {
      id: input.outboxEventId,
      organizationId,
      eventType: "payment.succeeded",
      payload: {
        order_id: input.orderId,
        payment_intent_id: input.paymentIntentId,
        payment_provider_event_id: input.providerEventId,
        amount_minor: input.amountMinor,
        currency: "CNY",
      },
      status: "pending" as const,
      availableAt: new Date(input.paidAt.getTime() + 60_000),
      processedAt: null,
      errorMessage: null,
      createdAt: new Date(input.paidAt.getTime() + 60_000),
      updatedAt: new Date(input.paidAt.getTime() + 60_000),
    },
  };
}

async function seedTenant(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800338001', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Membership Consumer Org', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Membership Consumer Workspace', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [workspaceId, organizationId],
  );
}

async function seedPlan(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  plan: ReturnType<typeof professionalPlan>,
) {
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
        'CNY',
        $8,
        $9,
        $10::jsonb,
        $11::jsonb,
        $12::jsonb,
        'active',
        $13,
        $13
      )
      ON CONFLICT (id) DO NOTHING
    `,
    [
      plan.id,
      plan.code,
      plan.displayName,
      plan.tier,
      plan.periodUnit,
      plan.periodCount,
      plan.amountMinor,
      plan.giftCredits,
      plan.seatLimit,
      JSON.stringify(plan.entitlements),
      JSON.stringify(plan.priorityRules),
      JSON.stringify(plan.displayMetadata),
      new Date("2026-06-08T07:00:00.000Z"),
    ],
  );
}
