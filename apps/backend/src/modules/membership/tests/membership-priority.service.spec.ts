import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { resolveMembershipGenerationPriority } from "../membership-priority.service.ts";

describe("membership priority service", { concurrency: false }, () => {
  it("grants priority for active professional membership and an eligible configured model family", async () => {
    const db = await createMigratedTestDb();

    try {
      const professionalUserId = await seedProfessionalMembership(db, {
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-07-08T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "seedance-i2v-pro", {
        modelFamily: "seedance",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        userId: professionalUserId,
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
      const experienceUserId = await seedExperienceMembership(db, {
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-06-15T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "seedance-i2v-pro", {
        modelFamily: "seedance",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        userId: experienceUserId,
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

  it("keeps professional priority when a later experience subscription overwrote the current tier", async () => {
    const db = await createMigratedTestDb();

    try {
      const professionalUserId = await seedProfessionalMembership(db, {
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-07-08T00:00:00.000Z",
      });
      await overwriteSubscriptionTier(db, {
        userId: professionalUserId,
        tier: "experience",
        periodEndAt: "2026-06-15T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "seedance-i2v-pro", {
        modelFamily: "seedance",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        userId: professionalUserId,
        modelCode: "seedance-i2v-pro",
        now: new Date("2026-06-09T00:00:00.000Z"),
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
      const professionalUserId = await seedProfessionalMembership(db, {
        priorityRules: { modelFamilies: ["seedance"] },
        periodEndAt: "2026-07-08T00:00:00.000Z",
      });
      await configureModelCapabilities(db, "gpt-image-2-cn", {
        modelFamily: "seedream",
        membershipPriorityEligible: true,
      });

      const priority = await resolveMembershipGenerationPriority(db, {
        userId: professionalUserId,
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

async function seedProfessionalMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    priorityRules: Record<string, unknown>;
    periodEndAt: string;
  },
) {
  return seedMembership(db, {
    tier: "professional",
    entitlementKeys: ["priority_generation"],
    priorityRules: input.priorityRules,
    periodEndAt: input.periodEndAt,
  });
}

async function seedExperienceMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    priorityRules: Record<string, unknown>;
    periodEndAt: string;
  },
) {
  return seedMembership(db, {
    tier: "experience",
    entitlementKeys: ["priority_generation"],
    priorityRules: input.priorityRules,
    periodEndAt: input.periodEndAt,
  });
}

async function seedMembership(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    tier: "experience" | "professional";
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
    [userId, input.tier === "experience" ? "13800199001" : "13800199002"],
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
      VALUES ($1, $2, $3, 'membership_plan', $4, $5::jsonb, $5::jsonb, $6, $7, 'CNY', 'pending_payment', $8)
    `,
    [
      orderId,
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
      VALUES (
        $1,
        $2,
        $3,
        '2026-06-08T00:00:00.000Z',
        $4,
        0,
        'active',
        '2026-06-08T00:00:00.000Z',
        '2026-06-08T00:00:00.000Z'
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        membership_tier = EXCLUDED.membership_tier,
        purchase_at = EXCLUDED.purchase_at,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at
    `,
    [randomUUID(), userId, input.tier, input.periodEndAt],
  );
  await db.query(
    `
      INSERT INTO membership_periods (
        id,
        user_id,
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
      userId,
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
        INSERT INTO user_entitlements (
          id,
          user_id,
          entitlement_key,
          status,
          source,
          expires_at
        )
        VALUES ($1, $2, $3, 'active', 'payment', $4)
      `,
      [randomUUID(), userId, entitlementKey, input.periodEndAt],
    );
  }

  return userId;
}

async function overwriteSubscriptionTier(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    userId: string;
    tier: "experience" | "professional";
    periodEndAt: string;
  },
) {
  await db.query(
    `
      UPDATE user_memberships
      SET membership_tier = $2,
          expires_at = $3,
          updated_at = '2026-06-09T00:00:00.000Z'
      WHERE user_id = $1
    `,
    [input.userId, input.tier, input.periodEndAt],
  );
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
