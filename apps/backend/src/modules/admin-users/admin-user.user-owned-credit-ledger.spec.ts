import assert from "node:assert/strict";
import { test } from "node:test";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { createAdminUserService } from "./admin-user.service.ts";

const userId = "93000000-0000-4000-8000-000000001050";

test("credit ledger resolves a real user without organization membership filtering", async () => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []) {
      statements.push({ sql, params });
      const normalized = sql.replace(/\s+/g, " ").trim();
      let rows: unknown[] = [];

      if (normalized.includes("FROM users u")) {
        rows = [{
          user_id: userId,
          user_status: "active",
          organization_id: null,
          organization_name: null,
          workspace_id: null,
          membership_id: null,
          membership_role: null,
          membership_tier: null,
          membership_expires_at: null,
          team_profile_id: null,
          team_role: null,
          team_group_id: null,
          created_by_user_id: null,
        }];
      } else if (normalized.includes("credit_balance_cached") && normalized.includes("FROM users")) {
        rows = [{
          credit_balance_cached: 25,
          credit_reserved_cached: 0,
          credit_frozen_cached: 0,
          credit_frozen_at: null,
          credit_frozen_until: null,
        }];
      } else if (normalized.includes("total_granted")) {
        rows = [{ total_granted: 0, total_released: 0 }];
      } else if (normalized.includes("SUM(r.amount_consumed)")) {
        rows = [{ total_consumed: 0 }];
      } else if (normalized.includes("AS total_consumed")) {
        rows = [{ total_consumed: 0 }];
      } else if (normalized.includes("active_count")) {
        rows = [{ active_count: 0, manual_review_count: 0, active_reserved: 0 }];
      }

      return { rows: rows as T[] };
    },
  };
  const service = createAdminUserService({ db });

  const result = await service.listUserCreditLedger({
    userId,
    organizationId: "10000000-0000-4000-8000-000000000099",
    workspaceId: "20000000-0000-4000-8000-000000000099",
    page: 1,
    pageSize: 10,
  });

  assert.equal("status" in result, false);
  assert.equal(result.accountType, "管理员账户");
  assert.equal(result.summary.displayAvailableCredits, 25);
  const targetQuery = statements.find(({ sql }) => /FROM\s+users\s+u/i.test(sql));
  assert.ok(targetQuery);
  assert.deepEqual(targetQuery.params, [userId]);
  assert.doesNotMatch(targetQuery.sql, /WHERE\s+m\.organization_id\s*=/i);
  assert.doesNotMatch(targetQuery.sql, /WHERE\s+m\.workspace_id\s*=/i);
  const unboundedLedgerRead = statements.find(({ sql }) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    return /^SELECT \* FROM credit_ledger_entries/i.test(normalized)
      && !/\bLIMIT\b/i.test(normalized);
  });
  assert.equal(
    unboundedLedgerRead,
    undefined,
    "ledger pagination must not transfer the user's full history to Node just to count rows",
  );

  statements.length = 0;
  const creatorResult = await service.listCreatorUserCreditLedger({
    userId,
    page: 1,
    pageSize: 10,
  });
  assert.equal("status" in creatorResult, false);
  const creatorPageQuery = statements.find(({ sql }) => /COUNT\(\*\) OVER\(\) AS total_count/i.test(sql));
  assert.ok(creatorPageQuery);
  assert.match(creatorPageQuery.sql, /reservation_keys AS/i);
  assert.match(creatorPageQuery.sql, /source_type = 'credit_reservation_allocation'/i);
  assert.match(creatorPageQuery.sql, /entry_type <> 'release'/i);
});

test("membership administration treats a real user without memberships as a personal owner", async () => {
  const db: SqlDatabase = {
    async query<T>(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      const rows = normalized.includes("FROM users u")
        ? [{
            user_id: userId,
            user_status: "active",
            organization_id: null,
            organization_name: null,
            workspace_id: null,
            membership_id: null,
            membership_role: null,
            membership_tier: null,
            membership_expires_at: null,
            team_profile_id: null,
            team_role: null,
            team_group_id: null,
            created_by_user_id: null,
          }]
        : [];
      return { rows: rows as T[] };
    },
  };
  const service = createAdminUserService({ db });

  const result = await service.grantUserMembership({
    userId,
    membershipPlanId: "94000000-0000-4000-8000-000000001051",
    reason: "test",
    idempotencyKey: "user-owned-membership-test",
    actorAdminAccountId: "95000000-0000-4000-8000-000000001052",
    auditOrganizationId: "96000000-0000-4000-8000-000000001053",
    auditWorkspaceId: "97000000-0000-4000-8000-000000001054",
    now: new Date("2026-07-10T00:00:00.000Z"),
  });

  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, "membership_plan_not_available");
});

test("admin credit writes provision compatibility rows for a real user without memberships", async () => {
  const statements: string[] = [];
  let provisioned = false;
  const organizationId = "93000000-0000-1000-8000-000000001050";
  const workspaceId = "93000000-0000-2000-8000-000000001050";
  const membershipId = "93000000-0000-4000-8000-000000001051";
  const now = new Date("2026-07-10T00:00:00.000Z");
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []) {
      statements.push(sql);
      const normalized = sql.replace(/\s+/g, " ").trim();
      let rows: unknown[] = [];
      if (normalized.includes("FROM users u")) {
        rows = [{
          user_id: userId,
          user_status: "active",
          organization_id: provisioned ? organizationId : null,
          organization_name: provisioned ? "Personal Creator Workspace" : null,
          workspace_id: provisioned ? workspaceId : null,
          membership_id: provisioned ? membershipId : null,
          membership_role: provisioned ? "owner_admin" : null,
          membership_tier: null,
          membership_expires_at: null,
          team_profile_id: null,
          team_role: null,
          team_group_id: null,
          created_by_user_id: null,
        }];
      } else if (normalized.startsWith("INSERT INTO memberships")) {
        provisioned = true;
      } else if (normalized.startsWith("INSERT INTO credit_ledger_entries")) {
        rows = [{
          id: String(params[0]),
          organization_id: String(params[1]),
          user_id: String(params[2]),
          reservation_id: null,
          allocation_id: null,
          entry_type: "grant",
          amount: Number(params[6]),
          available_delta: Number(params[7]),
          reserved_delta: 0,
          consumed_delta: 0,
          source_type: String(params[10]),
          source_id: String(params[11]),
          reason: String(params[12]),
          metadata_json: {},
          created_by_user_id: userId,
          created_at: now,
        }];
      } else if (normalized.startsWith("INSERT INTO credit_lots")) {
        rows = [{
          id: String(params[0]),
          organization_id: String(params[1]),
          user_id: String(params[2]),
          source_type: String(params[3]),
          source_id: String(params[4]),
          grant_ledger_entry_id: String(params[5]),
          total_amount: Number(params[6]),
          available_amount: Number(params[6]),
          reserved_amount: 0,
          consumed_amount: 0,
          expired_amount: 0,
          expires_at: null,
          frozen_at: null,
          frozen_until: null,
          metadata_json: {},
          created_at: now,
          updated_at: now,
        }];
      } else if (normalized.includes("credit_balance_cached") && normalized.includes("FROM users")) {
        rows = [{
          credit_balance_cached: 10,
          credit_reserved_cached: 0,
          credit_frozen_cached: 0,
        }];
      }
      return { rows: rows as T[] };
    },
  };
  const service = createAdminUserService({ db });

  const result = await service.grantUserCredits({
    userId,
    amount: 10,
    reason: "test grant",
    idempotencyKey: "user-owned-credit-write",
    actorAdminAccountId: "95000000-0000-4000-8000-000000001052",
    auditOrganizationId: "96000000-0000-4000-8000-000000001053",
    auditWorkspaceId: "97000000-0000-4000-8000-000000001054",
    now,
  });

  assert.equal(result.status, 200);
  assert.equal(provisioned, true);
  const membershipInsertIndex = statements.findIndex((sql) => /INSERT INTO memberships/i.test(sql));
  const ledgerInsertIndex = statements.findIndex((sql) => /INSERT INTO credit_ledger_entries/i.test(sql));
  assert.ok(membershipInsertIndex >= 0 && ledgerInsertIndex > membershipInsertIndex);
});
