import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createCommercePaymentService } from "../../commerce-payment/commerce-payment.service.ts";
import {
  createStaticPaymentProviderRegistry,
  type PaymentProviderAdapter,
} from "../../commerce-payment/payment-provider-adapter.ts";
import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createMembershipOrderService } from "../membership-order.service.ts";

const organizationId = "91000000-0000-4000-8000-000000020001";
const workspaceId = "92000000-0000-4000-8000-000000020001";
const ownerUserId = "93000000-0000-4000-8000-000000020001";
const membershipId = "94000000-0000-4000-8000-000000020001";

describe("membership order service", { concurrency: false }, () => {
  it("creates a product-aware membership billing order with a plan snapshot", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      const planId = await seedPlan(db, {
        code: "professional_monthly",
        displayName: "Professional Monthly",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        giftCredits: 51000,
        amountMinor: 500000,
        seatLimit: 50,
        entitlements: ["team_member_management", "priority_generation"],
        priorityRules: { modelFamilies: ["seedance"] },
        displayMetadata: { sortOrder: 20, badge: "popular" },
      });
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.createMembershipOrder({
        user: { sessionToken: session.token },
        body: { membershipPlanId: planId },
        idempotencyKey: "membership-order-pro-month",
        now: new Date("2026-06-08T08:00:00.000Z"),
      });
      const replay = await service.createMembershipOrder({
        user: { sessionToken: session.token },
        body: { membershipPlanId: planId },
        idempotencyKey: "membership-order-pro-month",
        now: new Date("2026-06-08T08:00:01.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.order.productType, "membership_plan");
      assert.equal(response.body.order.membershipPlanId, planId);
      assert.equal(response.body.order.creditPackageId, null);
      assert.equal(response.body.order.amountMinor, 500000);
      assert.equal(response.body.order.currency, "CNY");
      assert.equal(response.body.order.credits, 51000);
      assert.equal(response.body.order.productSnapshot.code, "professional_monthly");
      assert.equal(response.body.order.productSnapshot.displayName, "Professional Monthly");
      assert.deepEqual(response.body.order.productSnapshot.priorityRules, {
        modelFamilies: ["seedance"],
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.body.order.id, response.body.order.id);

      const order = await db.query<{
        organization_id: string;
        created_by_user_id: string;
        product_type: string;
        membership_plan_id: string;
        credit_package_id: string | null;
        product_snapshot_json: Record<string, unknown>;
        package_snapshot_json: Record<string, unknown>;
        expires_at: Date;
      }>(
        `
          SELECT
            organization_id,
            created_by_user_id,
            product_type,
            membership_plan_id,
            credit_package_id,
            product_snapshot_json,
            package_snapshot_json,
            expires_at
          FROM billing_orders
          WHERE id = $1
        `,
        [response.body.order.id],
      );

      assert.deepEqual(order.rows[0], {
        organization_id: organizationId,
        created_by_user_id: ownerUserId,
        product_type: "membership_plan",
        membership_plan_id: planId,
        credit_package_id: null,
        product_snapshot_json: response.body.order.productSnapshot,
        package_snapshot_json: response.body.order.productSnapshot,
        expires_at: new Date("2026-06-08T08:15:00.000Z"),
      });
    } finally {
      await db.close();
    }
  });

  it("rejects inactive or out-of-window membership plans", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      const inactivePlanId = await seedPlan(db, {
        code: "inactive_professional_monthly",
        status: "inactive",
      });
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.createMembershipOrder({
        user: { sessionToken: session.token },
        body: { membershipPlanId: inactivePlanId },
        idempotencyKey: "membership-order-inactive-plan",
        now: new Date("2026-06-08T08:00:00.000Z"),
      });

      assert.equal(response.status, 404);
      assert.equal(response.body.error, "membership_plan_not_available");
    } finally {
      await db.close();
    }
  });

  it("creates payment intents for membership orders with product-aware metadata", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      const planId = await seedPlan(db, {
        code: "experience_weekly",
        displayName: "Experience Weekly",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        giftCredits: 800,
        amountMinor: 9900,
        seatLimit: 1,
      });
      const membershipOrders = createMembershipOrderService({ db, workspaceId });
      const orderResponse = await membershipOrders.createMembershipOrder({
        user: { sessionToken: session.token },
        body: { membershipPlanId: planId },
        idempotencyKey: "membership-order-experience-weekly",
        now: new Date("2026-06-08T08:00:00.000Z"),
      });
      const providerCalls: Parameters<PaymentProviderAdapter["createPaymentIntent"]>[0][] = [];
      const commerce = createCommercePaymentService({
        db,
        workspaceId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createRecordingPaymentProviderAdapter(providerCalls),
        }),
      });

      const intentResponse = await commerce.createPaymentIntent({
        user: { sessionToken: session.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "membership-payment-intent-experience-weekly",
        now: new Date("2026-06-08T08:01:00.000Z"),
      });

      assert.equal(intentResponse.status, 200);
      assert.equal(providerCalls.length, 1);
      assert.equal(providerCalls[0]?.subject, "Membership experience_weekly");
      const safeMetadata = providerCalls[0]?.safeMetadata ?? {};
      assert.equal(typeof safeMetadata.idempotencyRecordId, "string");
      assert.deepEqual(safeMetadata, {
        orderId: orderResponse.body.order.id,
        productType: "membership_plan",
        creditPackageId: null,
        membershipPlanId: planId,
        idempotencyRecordId: safeMetadata.idempotencyRecordId,
      });
    } finally {
      await db.close();
    }
  });

  it("returns current membership status placeholder before activation exists", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-08T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.membership, {
        status: "none",
        currentTier: null,
        currentPeriodEndAt: null,
        entitlements: {
          canvasAccess: false,
          fullFlowAgent: false,
          priorityGeneration: false,
          teamAssetLibrary: false,
          teamDashboard: false,
          teamMemberManagement: false,
        },
        team: {
          seatLimit: null,
        },
      });
    } finally {
      await db.close();
    }
  });

  it("returns active membership status with entitlement and team summaries", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedActiveProfessionalStatus(db);
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-08T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.membership, {
        status: "professional_active",
        currentTier: "professional",
        currentPeriodEndAt: "2026-07-08T08:00:00.000Z",
        entitlements: {
          canvasAccess: false,
          fullFlowAgent: false,
          priorityGeneration: true,
          teamAssetLibrary: true,
          teamDashboard: true,
          teamMemberManagement: true,
        },
        team: {
          seatLimit: 50,
        },
      });
    } finally {
      await db.close();
    }
  });

  it("prefers an unexpired professional period over a later experience subscription", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedActiveProfessionalStatus(db, { subscriptionTier: "experience" });
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-09T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.membership.status, "professional_active");
      assert.equal(response.body.membership.currentTier, "professional");
      assert.equal(response.body.membership.currentPeriodEndAt, "2026-07-08T08:00:00.000Z");
      assert.equal(response.body.membership.entitlements.teamAssetLibrary, true);
      assert.equal(response.body.membership.entitlements.teamMemberManagement, true);
      assert.equal(response.body.membership.team.seatLimit, 50);
    } finally {
      await db.close();
    }
  });

  it("derives professional entitlements from the active professional period when entitlement rows were expired by a later experience purchase", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedActiveProfessionalStatus(db, { subscriptionTier: "experience" });
      await db.query(
        `
          UPDATE organization_entitlements
          SET status = 'expired',
              expires_at = '2026-06-09T07:00:00.000Z'
          WHERE organization_id = $1
            AND source = 'payment'
        `,
        [organizationId],
      );
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-09T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.membership.status, "professional_active");
      assert.equal(response.body.membership.currentTier, "professional");
      assert.equal(response.body.membership.entitlements.priorityGeneration, true);
      assert.equal(response.body.membership.entitlements.teamAssetLibrary, true);
      assert.equal(response.body.membership.entitlements.teamDashboard, true);
      assert.equal(response.body.membership.entitlements.teamMemberManagement, true);
      assert.equal(response.body.membership.team.seatLimit, 50);
    } finally {
      await db.close();
    }
  });

  it("derives team entitlement and seat limit from the current professional plan when the paid period snapshot is stale", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedProfessionalPeriodWithCurrentPlanEntitlements(db, {
        snapshotEntitlements: ["priority_generation"],
        currentPlanEntitlements: [
          "priority_generation",
          "team_asset_library",
          "team_dashboard",
          "team_member_management",
        ],
        seatLimit: 36,
      });
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-09T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.membership.status, "professional_active");
      assert.equal(response.body.membership.currentTier, "professional");
      assert.equal(response.body.membership.entitlements.teamAssetLibrary, true);
      assert.equal(response.body.membership.entitlements.teamDashboard, true);
      assert.equal(response.body.membership.entitlements.teamMemberManagement, true);
      assert.equal(response.body.membership.team.seatLimit, 36);
    } finally {
      await db.close();
    }
  });

  it("falls back to active experience after professional expires without team entitlements", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedActiveProfessionalStatus(db, {
        periodStartAt: "2026-06-01T08:00:00.000Z",
        periodEndAt: "2026-06-08T07:59:59.000Z",
        subscriptionTier: "experience",
      });
      await seedActiveExperiencePeriod(db, {
        periodStartAt: "2026-06-08T08:00:00.000Z",
        periodEndAt: "2026-06-15T08:00:00.000Z",
        entitlements: ["canvas_access", "team_member_management", "team_asset_library"],
      });
      await db.query(
        `
          INSERT INTO organization_entitlements (
            id,
            organization_id,
            entitlement_key,
            status,
            source,
            expires_at
          )
          VALUES (
            $1,
            $2,
            'team_member_management',
            'active',
            'payment',
            '2026-06-15T08:00:00.000Z'
          )
          ON CONFLICT (organization_id, entitlement_key)
          DO UPDATE SET
            status = EXCLUDED.status,
            source = EXCLUDED.source,
            expires_at = EXCLUDED.expires_at
        `,
        [randomUUID(), organizationId],
      );
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-09T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.membership.status, "experience_active");
      assert.equal(response.body.membership.currentTier, "experience");
      assert.equal(response.body.membership.currentPeriodEndAt, "2026-06-15T08:00:00.000Z");
      assert.equal(response.body.membership.entitlements.canvasAccess, true);
      assert.equal(response.body.membership.entitlements.teamAssetLibrary, false);
      assert.equal(response.body.membership.entitlements.teamDashboard, false);
      assert.equal(response.body.membership.entitlements.teamMemberManagement, false);
      assert.equal(response.body.membership.team.seatLimit, null);
    } finally {
      await db.close();
    }
  });

  it("ignores stale payment entitlement rows after the current membership period expires", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await db.query(
        `
          INSERT INTO organization_membership_subscriptions (
            id,
            organization_id,
            status,
            current_tier,
            current_period_start_at,
            current_period_end_at,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            'professional_active',
            'professional',
            '2026-06-01T08:00:00.000Z',
            '2026-06-08T07:59:59.000Z',
            '2026-06-01T08:00:00.000Z',
            '2026-06-01T08:00:00.000Z'
          )
        `,
        [randomUUID(), organizationId],
      );
      await db.query(
        `
          INSERT INTO organization_entitlements (
            id,
            organization_id,
            entitlement_key,
            status,
            source,
            expires_at
          )
          VALUES
            ($1, $2, 'canvas_access', 'active', 'payment', '2026-06-15T08:00:00.000Z'),
            ($3, $2, 'team_member_management', 'active', 'payment', '2026-06-15T08:00:00.000Z'),
            ($4, $2, 'priority_generation', 'active', 'payment', '2026-06-15T08:00:00.000Z')
        `,
        [randomUUID(), organizationId, randomUUID(), randomUUID()],
      );
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-09T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.membership.status, "expired");
      assert.equal(response.body.membership.currentTier, null);
      assert.equal(response.body.membership.entitlements.canvasAccess, false);
      assert.equal(response.body.membership.entitlements.priorityGeneration, false);
      assert.equal(response.body.membership.entitlements.teamMemberManagement, false);
      assert.equal(response.body.membership.team.seatLimit, null);
    } finally {
      await db.close();
    }
  });

  it("derives expired membership status before the maintenance worker catches up", async () => {
    const db = await createMigratedTestDb();

    try {
      const session = await seedCreator(db);
      await seedActiveProfessionalStatus(db, {
        periodStartAt: "2026-06-08T07:00:00.000Z",
        periodEndAt: "2026-06-08T07:59:59.000Z",
      });
      const service = createMembershipOrderService({ db, workspaceId });

      const response = await service.getMembershipStatus({
        user: { sessionToken: session.token },
        now: new Date("2026-06-08T08:00:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.body.membership, {
        status: "expired",
        currentTier: null,
        currentPeriodEndAt: "2026-06-08T07:59:59.000Z",
        entitlements: {
          canvasAccess: false,
          fullFlowAgent: false,
          priorityGeneration: false,
          teamAssetLibrary: false,
          teamDashboard: false,
          teamMemberManagement: false,
        },
        team: {
          seatLimit: null,
        },
      });
    } finally {
      await db.close();
    }
  });
});

async function seedCreator(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800238001', 'active')
    `,
    [ownerUserId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Membership Order Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Membership Order Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
    `,
    [membershipId, organizationId, workspaceId, ownerUserId],
  );

  const session = await createAuthSession({
    userId: ownerUserId,
    token: "membership-owner-session",
    now: new Date("2026-06-08T07:00:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-06-08T07:00:00.000Z"),
    ],
  );

  return session;
}

async function seedPlan(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: Partial<{
    code: string;
    displayName: string;
    tier: string;
    periodUnit: string;
    periodCount: number;
    giftCredits: number;
    amountMinor: number;
    seatLimit: number;
    entitlements: string[];
    priorityRules: Record<string, unknown>;
    displayMetadata: Record<string, unknown>;
    status: string;
    validFrom: Date | null;
    validUntil: Date | null;
  }> = {},
) {
  const planId = randomUUID();
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
        valid_from,
        valid_until,
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
        $13,
        $14,
        $15,
        $16,
        $16
      )
    `,
    [
      planId,
      input.code ?? `professional_monthly_${randomUUID().slice(0, 8)}`,
      input.displayName ?? "Professional Monthly",
      input.tier ?? "professional",
      input.periodUnit ?? "month",
      input.periodCount ?? 1,
      input.amountMinor ?? 29900,
      input.giftCredits ?? 3000,
      input.seatLimit ?? 50,
      JSON.stringify(input.entitlements ?? ["team_member_management"]),
      JSON.stringify(input.priorityRules ?? { modelFamilies: ["seedance"] }),
      JSON.stringify(input.displayMetadata ?? { sortOrder: 20 }),
      input.status ?? "active",
      input.validFrom ?? null,
      input.validUntil ?? null,
      new Date("2026-06-08T07:30:00.000Z"),
    ],
  );

  return planId;
}

async function seedActiveProfessionalStatus(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { periodStartAt?: string; periodEndAt?: string; subscriptionTier?: "professional" | "experience" } = {},
) {
  const periodStartAt = input.periodStartAt ?? "2026-06-08T08:00:00.000Z";
  const periodEndAt = input.periodEndAt ?? "2026-07-08T08:00:00.000Z";
  const subscriptionTier = input.subscriptionTier ?? "professional";
  const planSnapshot = {
    tier: "professional",
    entitlements: [
      "priority_generation",
      "team_asset_library",
      "team_dashboard",
      "team_member_management",
    ],
  };
  const planId = await seedPlan(db, {
    code: `professional_status_${randomUUID().slice(0, 8)}`,
    tier: "professional",
    giftCredits: 3000,
    entitlements: planSnapshot.entitlements,
    seatLimit: 50,
  });
  const orderId = await seedMembershipBillingOrder(db, {
    planId,
    credits: 3000,
    amountMinor: 29900,
    productSnapshot: planSnapshot,
    createdAt: periodStartAt,
  });
  await db.query(
    `
      INSERT INTO organization_membership_subscriptions (
        id,
        organization_id,
        status,
        current_tier,
        current_period_start_at,
        current_period_end_at,
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
        '2026-06-08T08:00:00.000Z',
        '2026-06-08T08:00:00.000Z'
      )
    `,
    [
      randomUUID(),
      organizationId,
      `${subscriptionTier}_active`,
      subscriptionTier,
      subscriptionTier === "professional" ? periodStartAt : "2026-06-09T08:00:00.000Z",
      subscriptionTier === "professional" ? periodEndAt : "2026-06-16T08:00:00.000Z",
    ],
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'professional',
        $5,
        $6,
        3000,
        '{"tier":"professional","entitlements":["priority_generation","team_asset_library","team_dashboard","team_member_management"]}'::jsonb,
        'active',
        '2026-06-08T08:00:00.000Z',
        '2026-06-08T08:00:00.000Z'
      )
    `,
    [randomUUID(), organizationId, orderId, planId, periodStartAt, periodEndAt],
  );
  await db.query(
    `
      INSERT INTO team_plan_limits (
        id,
        organization_id,
        seat_limit,
        single_account_concurrency_limit
      )
      VALUES ($1, $2, 50, 1)
    `,
    [randomUUID(), organizationId],
  );

  for (const entitlementKey of [
    "priority_generation",
    "team_asset_library",
    "team_dashboard",
    "team_member_management",
  ]) {
    await db.query(
      `
        INSERT INTO organization_entitlements (
          id,
          organization_id,
          entitlement_key,
          status,
          source,
          expires_at
        )
        VALUES ($1, $2, $3, 'active', 'payment', $4)
      `,
      [randomUUID(), organizationId, entitlementKey, periodEndAt],
    );
  }
}

async function seedProfessionalPeriodWithCurrentPlanEntitlements(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    snapshotEntitlements: string[];
    currentPlanEntitlements: string[];
    seatLimit: number;
  },
) {
  const periodSnapshot = {
    tier: "professional",
    entitlements: input.snapshotEntitlements,
    seatLimit: 0,
  };
  const planId = await seedPlan(db, {
    code: `professional_current_${randomUUID().slice(0, 8)}`,
    tier: "professional",
    seatLimit: input.seatLimit,
    entitlements: input.currentPlanEntitlements,
  });
  const orderId = await seedMembershipBillingOrder(db, {
    planId,
    credits: 3000,
    amountMinor: 29900,
    productSnapshot: periodSnapshot,
    createdAt: "2026-06-08T08:00:00.000Z",
  });
  await db.query(
    `
      INSERT INTO organization_membership_subscriptions (
        id,
        organization_id,
        status,
        current_tier,
        current_period_start_at,
        current_period_end_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        'professional_active',
        'professional',
        '2026-06-08T08:00:00.000Z',
        '2026-07-08T08:00:00.000Z',
        '2026-06-08T08:00:00.000Z',
        '2026-06-08T08:00:00.000Z'
      )
    `,
    [randomUUID(), organizationId],
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'professional',
        '2026-06-08T08:00:00.000Z',
        '2026-07-08T08:00:00.000Z',
        3000,
        $5::jsonb,
        'active',
        '2026-06-08T08:00:00.000Z',
        '2026-06-08T08:00:00.000Z'
      )
    `,
    [
      randomUUID(),
      organizationId,
      orderId,
      planId,
      JSON.stringify(periodSnapshot),
    ],
  );
}

async function seedActiveExperiencePeriod(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: { periodStartAt: string; periodEndAt: string; entitlements?: string[] },
) {
  const entitlements = input.entitlements ?? ["canvas_access"];
  const planSnapshot = {
    tier: "experience",
    entitlements,
  };
  const planId = await seedPlan(db, {
    code: `experience_status_${randomUUID().slice(0, 8)}`,
    displayName: "Experience Weekly",
    tier: "experience",
    periodUnit: "day",
    periodCount: 7,
    giftCredits: 300,
    amountMinor: 990,
    seatLimit: 0,
    entitlements,
  });
  const orderId = await seedMembershipBillingOrder(db, {
    planId,
    credits: 300,
    amountMinor: 990,
    productSnapshot: planSnapshot,
    createdAt: input.periodStartAt,
  });
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
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'experience',
        $5,
        $6,
        300,
        $7::jsonb,
        'active',
        $5,
        $5
      )
    `,
    [
      randomUUID(),
      organizationId,
      orderId,
      planId,
      input.periodStartAt,
      input.periodEndAt,
      JSON.stringify(planSnapshot),
    ],
  );
}

async function seedMembershipBillingOrder(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    planId: string;
    credits: number;
    amountMinor: number;
    productSnapshot: Record<string, unknown>;
    createdAt: string;
  },
) {
  const orderId = randomUUID();
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        organization_id,
        created_by_user_id,
        order_no,
        credit_package_id,
        membership_plan_id,
        product_type,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NULL,
        $5,
        'membership_plan',
        $6::jsonb,
        $6::jsonb,
        $7,
        $8,
        'CNY',
        'pending_payment',
        $9::timestamptz + interval '15 minutes',
        $9,
        $9
      )
    `,
    [
      orderId,
      organizationId,
      ownerUserId,
      `ORD-TEST-${randomUUID()}`,
      input.planId,
      JSON.stringify(input.productSnapshot),
      input.credits,
      input.amountMinor,
      input.createdAt,
    ],
  );
  return orderId;
}

function createRecordingPaymentProviderAdapter(
  calls: Parameters<PaymentProviderAdapter["createPaymentIntent"]>[0][],
): PaymentProviderAdapter {
  return {
    provider: "paylab",
    async createPaymentIntent(input) {
      calls.push(input);
      return {
        kind: "submitted",
        providerIntentId: "pi_membership_test",
        providerPaymentId: "pay_membership_test",
        providerPayloadHash: "provider-membership-test-hash",
        providerSafeMetadata: {
          providerIntentId: "pi_membership_test",
          providerPaymentId: "pay_membership_test",
        },
        payAction: {
          kind: "provider_console",
          provider: "paylab",
          merchantOrderNo: input.merchantOrderNo,
          amountMinor: input.amountMinor,
          currency: input.currency,
          url: "https://paylab.test/membership/pi_membership_test",
        },
      };
    },
    verifyCallback() {
      return {
        signatureStatus: "unverified",
        signatureAlgorithm: "test",
        replayWindowStatus: "not_applicable",
      };
    },
    normalizeCallback() {
      return null;
    },
    buildAckResponse(result) {
      return {
        status: result === "accepted" ? 200 : 400,
        body: { received: result === "accepted" },
      };
    },
    async queryPaymentStatus() {
      return {
        status: "unknown",
        providerPayloadHash: "provider-membership-status-hash",
        providerSafeMetadata: {},
      };
    },
  };
}
