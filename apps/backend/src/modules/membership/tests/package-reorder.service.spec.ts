import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { createCreditPackageService } from "../../commerce-payment/credit-package.service.ts";
import { createMembershipPlanService } from "../membership-plan.service.ts";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-10T08:00:00.000Z");

test("membership reorder updates only sort metadata in one transaction", async () => {
  const memory = createReorderDatabase();
  const service = createMembershipPlanService({ db: memory.db });

  const result = await service.reorderPlans({
    items: [{ id: secondId, sortOrder: 10 }, { id: firstId, sortOrder: 20 }],
    actorAdminAccountId: null,
    reason: "后台拖拽调整套餐顺序",
    idempotencyKey: "membership-reorder-test",
    now,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(memory.transactions, ["BEGIN", "COMMIT"]);
  assert.equal(memory.membershipRows[0].amount_minor, 990);
  assert.equal(memory.membershipRows[0].display_metadata_json.note, "keep me");
  assert.equal(memory.membershipRows[0].display_metadata_json.sortOrder, 20);
  assert.equal(memory.membershipRows[1].display_metadata_json.sortOrder, 10);
  assert.match(memory.membershipUpdateSql, /jsonb_set/);
  assert.match(memory.membershipUpdateSql, /requested\."sortOrder"/);
  assert.doesNotMatch(memory.membershipUpdateSql, /amount_minor\s*=/);
});

test("direct recharge reorder updates only sort order in one transaction", async () => {
  const memory = createReorderDatabase();
  const service = createCreditPackageService({ db: memory.db });

  const result = await service.reorderPackages({
    items: [{ id: secondId, sortOrder: 10 }, { id: firstId, sortOrder: 20 }],
    metadataKind: "direct_recharge",
    now,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(memory.transactions, ["BEGIN", "COMMIT"]);
  assert.equal(memory.creditRows[0].amount_minor, 990);
  assert.equal(memory.creditRows[0].sort_order, 20);
  assert.equal(memory.creditRows[1].sort_order, 10);
  assert.match(memory.creditUpdateSql, /SET sort_order = requested\."sortOrder"/);
  assert.doesNotMatch(memory.creditUpdateSql, /amount_minor\s*=/);
});

test("admin routes expose authenticated sort-only reorder endpoints", async () => {
  const source = await readFile(
    resolve(process.cwd(), "apps/backend/src/entrypoints/phone-auth-dev-server.ts"),
    "utf8",
  );

  assert.match(source, /pathname === "\/api\/admin\/membership\/plans\/reorder"/);
  assert.match(source, /membershipPlans\.reorderPlans\(\{/);
  assert.match(source, /pathname === "\/api\/admin\/direct-recharge\/packages\/reorder"/);
  assert.match(source, /creditPackages\.reorderPackages\(\{/);
});

function createReorderDatabase() {
  const membershipRows = [membershipRow(firstId, "first"), membershipRow(secondId, "second")];
  const creditRows = [creditRow(firstId, "first"), creditRow(secondId, "second")];
  const transactions: string[] = [];
  let membershipUpdateSql = "";
  let creditUpdateSql = "";

  const db = {
    async query(sql: string, params: unknown[] = []) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalizedSql)) {
        transactions.push(normalizedSql);
        return { rows: [], rowCount: 0 };
      }
      if (normalizedSql.includes("UPDATE membership_plans AS plan")) {
        membershipUpdateSql = normalizedSql;
        const items = JSON.parse(String(params[0])) as Array<{ id: string; sortOrder: number }>;
        for (const item of items) {
          const row = membershipRows.find((candidate) => candidate.id === item.id);
          if (row) row.display_metadata_json = { ...row.display_metadata_json, sortOrder: item.sortOrder };
        }
        return { rows: membershipRows.filter((row) => items.some((item) => item.id === row.id)), rowCount: items.length };
      }
      if (normalizedSql.includes("INSERT INTO membership_plan_revisions")) {
        return { rows: [], rowCount: 1 };
      }
      if (normalizedSql.includes("UPDATE credit_packages AS package")) {
        creditUpdateSql = normalizedSql;
        const items = JSON.parse(String(params[0])) as Array<{ id: string; sortOrder: number }>;
        for (const item of items) {
          const row = creditRows.find((candidate) => candidate.id === item.id);
          if (row) row.sort_order = item.sortOrder;
        }
        return { rows: creditRows.filter((row) => items.some((item) => item.id === row.id)), rowCount: items.length };
      }
      throw new Error(`Unexpected reorder SQL: ${normalizedSql}`);
    },
  };

  return {
    db: db as never,
    membershipRows,
    creditRows,
    transactions,
    get membershipUpdateSql() { return membershipUpdateSql; },
    get creditUpdateSql() { return creditUpdateSql; },
  };
}

function membershipRow(id: string, code: string) {
  return {
    id,
    code,
    display_name: code,
    tier: "experience",
    period_unit: "month",
    period_count: 1,
    amount_minor: 990,
    currency: "CNY",
    gift_credits: 100,
    seat_limit: 1,
    entitlements_json: [],
    priority_rules_json: {},
    display_metadata_json: { note: "keep me", sortOrder: 10 },
    visibility: "public",
    usage_scene: "purchase",
    status: "active",
    valid_from: null,
    valid_until: null,
    created_at: now,
    updated_at: now,
  };
}

function creditRow(id: string, code: string) {
  return {
    id,
    code,
    display_name: code,
    subtitle: "keep me",
    credits: 1000,
    gift_credits: 0,
    amount_minor: 990,
    currency: "CNY",
    badge: null,
    sort_order: 10,
    metadata_json: { kind: "direct_recharge" },
    status: "active",
    valid_from: null,
    valid_until: null,
    created_at: now,
    updated_at: now,
  };
}
