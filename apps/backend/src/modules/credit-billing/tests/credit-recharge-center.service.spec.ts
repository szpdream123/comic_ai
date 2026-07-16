import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { grantCredits } from "../credit-ledger.service.ts";
import { createCreditRechargeCenterService } from "../credit-recharge-center.service.ts";

const userId = "00000000-0000-4000-8000-000000001001";
const memberId = "32000000-0000-4000-8000-000000001101";

describe("credit recharge center service", { concurrency: false }, () => {
  it("summarizes the authenticated user's wallet without a team", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedUserSession(db, "credit-recharge-no-team");
      await grantCredits(db, {
        userId,
        amount: 180,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001001",
        reason: "seed personal credits",
        now: new Date("2026-06-16T01:00:00.000Z"),
      });
      const response = await createCreditRechargeCenterService({ db }).getRechargeCenter({
        user: { sessionToken: session.token },
        now: new Date("2026-06-16T01:05:00.000Z"),
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.wallets.personal.accountId, userId);
      assert.equal(response.body.wallets.personal.availableCredits, 180);
      assert.equal(response.body.wallets.subaccount, null);
      assert.equal(response.body.transfer.canTransferToTeamPool, false);
    } finally {
      await db.close();
    }
  });

  it("transfers user credits to an active assigned team member idempotently", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedUserSession(db, "credit-recharge-team");
      await seedActiveTeam(db);
      await grantCredits(db, {
        userId,
        amount: 220,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001002",
        reason: "seed personal credits",
        now: new Date("2026-06-16T02:00:00.000Z"),
      });
      const service = createCreditRechargeCenterService({ db });
      const first = await service.transferToTeamPool({
        user: { sessionToken: session.token },
        body: { amount: 75 },
        idempotencyKey: "transfer-key-owner",
        now: new Date("2026-06-16T02:05:00.000Z"),
      });
      const replay = await service.transferToTeamPool({
        user: { sessionToken: session.token },
        body: { amount: 75 },
        idempotencyKey: "transfer-key-owner",
        now: new Date("2026-06-16T02:06:00.000Z"),
      });
      assert.equal(first.status, 200);
      assert.equal(replay.body.transfer.id, first.body.transfer.id);
      assert.equal(replay.body.wallets.personal.availableCredits, 145);
      assert.equal(replay.body.wallets.subaccount?.availableCredits, 75);
      const rows = await db.query<{ credit_balance_cached: number; member_credits: number }>(
        `SELECT u.credit_balance_cached, m.member_credits FROM users u JOIN team_members m ON m.user_id = u.id WHERE u.id = $1 AND m.id = $2`,
        [userId, memberId],
      );
      assert.deepEqual(rows.rows[0], { credit_balance_cached: 145, member_credits: 75 });
      const ledger = await db.query<{ team_member_id: string | null; balance_after: number }>(
        `
          SELECT team_member_id::text, balance_after
          FROM credit_ledger_entries
          WHERE source_type = 'credit_wallet_transfer'
          ORDER BY team_member_id NULLS FIRST
        `,
      );
      assert.deepEqual(ledger.rows, [
        { team_member_id: null, balance_after: 145 },
        { team_member_id: memberId, balance_after: 75 },
      ]);
    } finally {
      await db.close();
    }
  });
});

async function seedUserSession(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  token: string,
) {
  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800199001', 'active')", [userId]);
  const session = await createAuthSession({ userId, token, now: new Date("2026-06-16T00:00:00.000Z") });
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, status, session_token_hash, session_token_hash_version, expires_at, last_seen_at, revoked_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [session.session.id, session.session.userId, session.session.status, session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion, session.session.expiresAt, session.session.lastSeenAt,
      session.session.revokedAt, new Date("2026-06-16T00:00:00.000Z")],
  );
  return session;
}

async function seedActiveTeam(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `INSERT INTO team_members (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, member_credits, status)
     VALUES ($1, $2, 'member001', 'u00101', 'member001@u00101', 'Member', 'hashed-password', 0, 'active')`,
    [memberId, userId],
  );
  await db.query(`
    INSERT INTO membership_plans (id, code, display_name, tier, period_unit, period_count, amount_minor, currency, gift_credits, seat_limit, entitlements_json, priority_rules_json, display_metadata_json, status)
    VALUES ('35000000-0000-4000-8000-000000001001', 'team_professional', 'Team Professional', 'professional', 'month', 1, 29900, 'CNY', 0, 50, '["team_member_management"]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'active')
  `);
  await db.query(
    `INSERT INTO billing_orders (id, created_by_user_id, order_no, product_type, membership_plan_id, package_snapshot_json, product_snapshot_json, credits, amount_minor, currency, status, expires_at, paid_at)
     VALUES ('36000000-0000-4000-8000-000000001001', $1, 'TEAM-ORDER', 'membership_plan', '35000000-0000-4000-8000-000000001001', '{}'::jsonb, '{}'::jsonb, 0, 29900, 'CNY', 'pending_payment', $2, NULL)`,
    [userId, new Date("2026-07-16T00:00:00.000Z")],
  );
  await db.query(
    `INSERT INTO membership_periods (id, user_id, order_id, plan_id, tier, period_start_at, period_end_at, gift_credits, plan_snapshot_json, status)
     VALUES ('37000000-0000-4000-8000-000000001001', $1, '36000000-0000-4000-8000-000000001001', '35000000-0000-4000-8000-000000001001', 'professional', $2, $3, 0, '{"entitlements":["team_member_management"]}'::jsonb, 'active')`,
    [userId, new Date("2026-06-16T00:00:00.000Z"), new Date("2026-07-16T00:00:00.000Z")],
  );
}
