import assert from "node:assert/strict";
import { test } from "node:test";

import { createMembershipPlanService } from "../membership-plan.service.ts";

test("membership plan service keeps one public default recommendation", async () => {
  const memory = createMemoryMembershipDatabase();
  const service = createMembershipPlanService({ db: memory.db });

  const first = await service.savePlan(validPlanInput("recommended_first", "首选"));
  const second = await service.savePlan(validPlanInput("recommended_second", "推荐"));
  const listed = await service.listPlans({
    includeArchived: false,
    now: new Date("2026-07-10T08:00:00.000Z"),
  });
  const recommended = listed.data.plans.filter(
    (plan) => plan.displayMetadata.isRecommended === true,
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(recommended.length, 1);
  assert.equal(recommended[0]?.id, second.body.plan.id);
  assert.equal(
    listed.data.plans.find((plan) => plan.id === first.body.plan.id)?.displayMetadata.isRecommended,
    undefined,
  );
  assert.equal(
    memory.revisions.filter((revision) => revision.planId === first.body.plan.id).length,
    2,
  );
  assert.equal(memory.recommendationLockCount, 2);
});

function validPlanInput(code: string, recommendationLabel: string) {
  return {
    code,
    displayName: code,
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 100,
    currency: "CNY",
    giftCredits: 0,
    seatLimit: 1,
    entitlements: [],
    priorityRules: {},
    displayMetadata: { recommendationLabel, isRecommended: true },
    visibility: "public",
    usageScene: "purchase",
    status: "active",
    validFrom: null,
    validUntil: null,
    actorAdminAccountId: null,
    reason: `Configure ${code}`,
    now: new Date("2026-07-10T08:00:00.000Z"),
  };
}

function createMemoryMembershipDatabase() {
  const plans: MembershipPlanRow[] = [];
  const revisions: Array<{ planId: string; snapshot: unknown }> = [];
  let recommendationLockCount = 0;

  const db = {
    async query(sql: string, params: unknown[] = []) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalizedSql)) {
        return { rows: [], rowCount: 0 };
      }
      if (normalizedSql.includes("pg_advisory_xact_lock")) {
        recommendationLockCount += 1;
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.includes("SELECT id FROM membership_plans")) {
        const code = String(params[0] ?? "");
        const excludedId = params[1] ? String(params[1]) : null;
        const row = plans.find((plan) => plan.code === code && plan.id !== excludedId);
        return { rows: row ? [{ id: row.id }] : [], rowCount: row ? 1 : 0 };
      }
      if (normalizedSql.includes("INSERT INTO membership_plans")) {
        const existing = plans.find((plan) => plan.id === String(params[0]));
        const row: MembershipPlanRow = {
          id: String(params[0]),
          code: String(params[1]),
          display_name: String(params[2]),
          tier: String(params[3]),
          period_unit: String(params[4]),
          period_count: Number(params[5]),
          amount_minor: Number(params[6]),
          currency: String(params[7]),
          gift_credits: Number(params[8]),
          seat_limit: Number(params[9]),
          entitlements_json: JSON.parse(String(params[10])),
          priority_rules_json: JSON.parse(String(params[11])),
          display_metadata_json: JSON.parse(String(params[12])),
          visibility: String(params[13]),
          usage_scene: String(params[14]),
          status: String(params[15]),
          valid_from: params[16] as Date | null,
          valid_until: params[17] as Date | null,
          created_at: existing?.created_at ?? (params[19] as Date),
          updated_at: params[19] as Date,
        };
        if (existing) Object.assign(existing, row);
        else plans.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (
        normalizedSql.includes("UPDATE membership_plans")
        && normalizedSql.includes("- 'isRecommended'")
      ) {
        const excludedId = String(params[0]);
        const updated = plans.filter((plan) => {
          const metadata = plan.display_metadata_json as Record<string, unknown>;
          return plan.id !== excludedId
            && plan.visibility === "public"
            && metadata.isRecommended === true;
        });
        for (const plan of updated) {
          const metadata = { ...(plan.display_metadata_json as Record<string, unknown>) };
          delete metadata.isRecommended;
          plan.display_metadata_json = metadata;
          plan.updated_at = params[2] as Date;
        }
        return { rows: updated, rowCount: updated.length };
      }
      if (normalizedSql.includes("INSERT INTO membership_plan_revisions")) {
        revisions.push({
          planId: String(params[1]),
          snapshot: JSON.parse(String(params[2])),
        });
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.includes("SELECT * FROM membership_plans")) {
        return { rows: plans, rowCount: plans.length };
      }
      throw new Error(`Unexpected SQL in membership recommendation test: ${normalizedSql}`);
    },
  };

  return {
    db: db as never,
    revisions,
    get recommendationLockCount() {
      return recommendationLockCount;
    },
  };
}

interface MembershipPlanRow {
  id: string;
  code: string;
  display_name: string;
  tier: string;
  period_unit: string;
  period_count: number;
  amount_minor: number;
  currency: string;
  gift_credits: number;
  seat_limit: number;
  entitlements_json: unknown;
  priority_rules_json: unknown;
  display_metadata_json: unknown;
  visibility: string;
  usage_scene: string;
  status: string;
  valid_from: Date | null;
  valid_until: Date | null;
  created_at: Date;
  updated_at: Date;
}
