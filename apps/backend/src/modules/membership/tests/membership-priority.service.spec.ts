import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { resolveMembershipGenerationPriority } from "../membership-priority.service.ts";

describe("membership priority service", { concurrency: false }, () => {
  it("grants priority for active professional membership and an eligible configured model family", async () => {
    const db = await createMigratedTestDb();

    try {
      const organizationId = await seedOrganization(db);
      await seedProfessionalMembership(db, {
        organizationId,
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-07-08T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "seedance-i2v-pro", {
        modelFamily: "seedance",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        organizationId,
        modelCode: "seedance-i2v-pro",
        now: new Date("2026-06-08T00:00:00.000Z"),
      });

      assert.deepEqual(priority, {
        enabled: true,
        priority: 1,
        reason: "professional_membership_model_family_priority",
      });
    } finally {
      await db.close();
    }
  });

  it("does not grant priority for experience membership", async () => {
    const db = await createMigratedTestDb();

    try {
      const organizationId = await seedOrganization(db);
      await seedExperienceMembership(db, {
        organizationId,
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-06-15T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "seedance-i2v-pro", {
        modelFamily: "seedance",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        organizationId,
        modelCode: "seedance-i2v-pro",
        now: new Date("2026-06-08T00:00:00.000Z"),
      });

      assert.deepEqual(priority, {
        enabled: false,
        priority: 5,
        reason: "not_membership_priority_eligible",
      });
    } finally {
      await db.close();
    }
  });

  it("does not grant priority when the model family is outside the plan priority rules", async () => {
    const db = await createMigratedTestDb();

    try {
      const organizationId = await seedOrganization(db);
      await seedProfessionalMembership(db, {
        organizationId,
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-07-08T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "gpt-image-2-cn", {
        modelFamily: "seedream",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        organizationId,
        modelCode: "gpt-image-2-cn",
        now: new Date("2026-06-08T00:00:00.000Z"),
      });

      assert.deepEqual(priority, {
        enabled: false,
        priority: 5,
        reason: "not_membership_priority_eligible",
      });
    } finally {
      await db.close();
    }
  });
});

async function seedOrganization(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
) {
  const organizationId = randomUUID();
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Membership Priority Org', 'active')
    `,
    [organizationId],
  );
  return organizationId;
}

async function seedProfessionalMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    organizationId: string;
    priorityRules: Record<string, unknown>;
    periodEndAt: string;
  },
) {
  await seedMembership(db, {
    organizationId: input.organizationId,
    tier: "professional",
    status: "professional_active",
    entitlementKeys: ["priority_generation"],
    priorityRules: input.priorityRules,
    periodEndAt: input.periodEndAt,
  });
}

async function seedExperienceMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    organizationId: string;
    priorityRules: Record<string, unknown>;
    periodEndAt: string;
  },
) {
  await seedMembership(db, {
    organizationId: input.organizationId,
    tier: "experience",
    status: "experience_active",
    entitlementKeys: ["priority_generation"],
    priorityRules: input.priorityRules,
    periodEndAt: input.periodEndAt,
  });
}

async function seedMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    organizationId: string;
    tier: "experience" | "professional";
    status: "experience_active" | "professional_active";
    entitlementKeys: string[];
    priorityRules: Record<string, unknown>;
    periodEndAt: string;
  },
) {
  const userId = randomUUID();
  const planId = randomUUID();
  const orderId = randomUUID();
  const periodId = randomUUID();
  const planSnapshot = {
    id: planId,
    code: `${input.tier}_priority_test`,
    displayName: `${input.tier} priority test`,
    tier: input.tier,
    periodUnit: input.tier === "experience" ? "day" : "month",
    periodCount: input.tier === "experience" ? 7 : 1,
    amountMinor: input.tier === "experience" ? 9900 : 29900,
    currency: "CNY",
    giftCredits: 100,
    seatLimit: input.tier === "experience" ? 1 : 50,
    entitlements: input.entitlementKeys,
    priorityRules: input.priorityRules,
    displayMetadata: {},
  };

  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, $2, 'active')
    `,
    [userId, input.tier === "experience" ? "+8613800990101" : "+8613800990102"],
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'CNY', $8, $9, $10::jsonb, $11::jsonb, '{}'::jsonb, 'active')
    `,
    [
      planId,
      planSnapshot.code,
      planSnapshot.displayName,
      input.tier,
      planSnapshot.periodUnit,
      planSnapshot.periodCount,
      planSnapshot.amountMinor,
      planSnapshot.giftCredits,
      planSnapshot.seatLimit,
      JSON.stringify(input.entitlementKeys),
      JSON.stringify(input.priorityRules),
    ],
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
      VALUES ($1, $2, $3, $4, 'membership_plan', $5, $6::jsonb, $6::jsonb, $7, $8, 'CNY', 'pending_payment', $9)
    `,
    [
      orderId,
      input.organizationId,
      userId,
      `ORD-${orderId.slice(0, 8)}`,
      planId,
      JSON.stringify(planSnapshot),
      planSnapshot.giftCredits,
      planSnapshot.amountMinor,
      "2026-06-08T00:30:00.000Z",
    ],
  );
  await db.query(
    `
      INSERT INTO organization_membership_subscriptions (
        id,
        organization_id,
        status,
        current_tier,
        current_period_start_at,
        current_period_end_at,
        latest_order_id
      )
      VALUES ($1, $2, $3, $4, '2026-06-08T00:00:00.000Z', $5, $6)
    `,
    [randomUUID(), input.organizationId, input.status, input.tier, input.periodEndAt, orderId],
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
        status
      )
      VALUES ($1, $2, $3, $4, $5, '2026-06-08T00:00:00.000Z', $6, $7, $8::jsonb, 'active')
    `,
    [
      periodId,
      input.organizationId,
      orderId,
      planId,
      input.tier,
      input.periodEndAt,
      planSnapshot.giftCredits,
      JSON.stringify(planSnapshot),
    ],
  );

  for (const entitlementKey of input.entitlementKeys) {
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
      [randomUUID(), input.organizationId, entitlementKey, input.periodEndAt],
    );
  }
}

async function configureModelCapabilities(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  modelCode: string,
  capabilities: Record<string, unknown>,
) {
  await db.query(
    `
      UPDATE ai_model_configs
      SET capabilities_json = capabilities_json || $2::jsonb
      WHERE model_code = $1
    `,
    [modelCode, JSON.stringify(capabilities)],
  );
}
