import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { grantCredits } from "../credit-ledger.service.ts";
import {
  createCreditRechargeCenterService,
  CreditRechargeCenterError,
} from "../credit-recharge-center.service.ts";

const userId = "00000000-0000-4000-8000-000000001001";
const personalOrganizationId = "10000000-0000-4000-8000-000000001001";
const personalWorkspaceId = "20000000-0000-4000-8000-000000001001";
const teamOrganizationId = "10000000-0000-4000-8000-000000001002";
const teamWorkspaceId = "20000000-0000-4000-8000-000000001002";
const subaccountId = "32000000-0000-4000-8000-000000001101";

describe("credit recharge center service", { concurrency: false }, () => {
  it("summarizes personal wallet and hides team transfer when there is no real team", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedRechargeFixture(db, { realTeam: false });
      await grantCredits(db, {
        userId,
        amount: 180,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001001",
        reason: "seed personal credits",
        now: new Date("2026-06-16T01:00:00.000Z"),
      });
      const service = createCreditRechargeCenterService({ db, workspaceId: personalWorkspaceId });

      const response = await service.getRechargeCenter({
        user: { sessionToken: session.token },
        now: new Date("2026-06-16T01:05:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.wallets.personal.accountId, userId);
      assert.equal(response.body.wallets.personal.availableCredits, 180);
      assert.equal(response.body.wallets.subaccount, null);
      assert.equal(response.body.transfer.canTransferToTeamPool, false);
      assert.equal(response.body.transfer.reason, "no_real_team");
    } finally {
      await db.close();
    }
  });

  it("lets a team owner transfer personal credits into a real team pool idempotently", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedRechargeFixture(db, { realTeam: true });
      await grantCredits(db, {
        userId,
        amount: 220,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001002",
        reason: "seed personal credits",
        now: new Date("2026-06-16T02:00:00.000Z"),
      });
      const service = createCreditRechargeCenterService({ db, workspaceId: personalWorkspaceId });

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
      assert.equal(first.body.transfer.status, "succeeded");
      assert.equal(first.body.transfer.amount, 75);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.transfer.id, first.body.transfer.id);
      assert.equal(replay.body.wallets.personal.availableCredits, 145);
      assert.equal(replay.body.wallets.subaccount?.availableCredits, 75);

      const balances = await db.query<{
        id: string;
        credit_balance_cached: number;
      }>(
        `
          SELECT id, credit_balance_cached
          FROM users
          WHERE id = $1
          UNION ALL
          SELECT id, member_credits AS credit_balance_cached
          FROM team_members
          WHERE id = $2
          ORDER BY id
        `,
        [userId, subaccountId],
      );
      const ledger = await db.query<{ entry_type: string; available_delta: number }>(
        `
          SELECT entry_type, available_delta
          FROM credit_ledger_entries
          WHERE source_type = 'credit_wallet_transfer'
          ORDER BY entry_type
        `,
      );
      const transfers = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_wallet_transfers",
      );

      assert.deepEqual(
        Object.fromEntries(balances.rows.map((row) => [row.id, row.credit_balance_cached])),
        {
          [subaccountId]: 75,
          [userId]: 145,
        },
      );
      assert.deepEqual(ledger.rows, [
        { entry_type: "transfer_in", available_delta: 75 },
        { entry_type: "transfer_out", available_delta: -75 },
      ]);
      assert.equal(transfers.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("rejects transfer when the actor is not a team owner or admin", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedRechargeFixture(db, { realTeam: true, teamRole: "creator" });
      const service = createCreditRechargeCenterService({ db, workspaceId: personalWorkspaceId });

      await assert.rejects(
        () =>
          service.transferToTeamPool({
            user: { sessionToken: session.token },
            body: { amount: 10 },
            idempotencyKey: "transfer-key-no-permission",
            now: new Date("2026-06-16T03:00:00.000Z"),
          }),
        (error: unknown) =>
          error instanceof CreditRechargeCenterError &&
          error.code === "team_transfer_permission_missing",
      );
    } finally {
      await db.close();
    }
  });

  it("hides team transfer when professional membership has expired despite stale payment entitlement rows", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedRechargeFixture(db, {
        realTeam: true,
        activeProfessional: false,
        stalePaymentEntitlement: true,
      });
      await grantCredits(db, {
        userId,
        amount: 120,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001004",
        reason: "seed personal credits",
        now: new Date("2026-06-16T05:00:00.000Z"),
      });
      const service = createCreditRechargeCenterService({ db, workspaceId: personalWorkspaceId });

      const response = await service.getRechargeCenter({
        user: { sessionToken: session.token },
        now: new Date("2026-06-16T05:05:00.000Z"),
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.wallets.subaccount, null);
      assert.equal(response.body.transfer.canTransferToTeamPool, false);
      assert.equal(response.body.transfer.reason, "no_real_team");
    } finally {
      await db.close();
    }
  });

  it("rejects transfer larger than the personal available balance", async () => {
    const db = await createMigratedTestDb();
    try {
      const session = await seedRechargeFixture(db, { realTeam: true });
      await grantCredits(db, {
        userId,
        amount: 25,
        sourceType: "test",
        sourceId: "90000000-0000-4000-8000-000000001003",
        reason: "seed personal credits",
        now: new Date("2026-06-16T04:00:00.000Z"),
      });
      const service = createCreditRechargeCenterService({ db, workspaceId: personalWorkspaceId });

      await assert.rejects(
        () =>
          service.transferToTeamPool({
            user: { sessionToken: session.token },
            body: { amount: 26 },
            idempotencyKey: "transfer-key-over-balance",
            now: new Date("2026-06-16T04:05:00.000Z"),
          }),
        (error: unknown) =>
          error instanceof CreditRechargeCenterError &&
          error.code === "insufficient_personal_credits",
      );
    } finally {
      await db.close();
    }
  });
});

async function seedRechargeFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  options: {
    realTeam: boolean;
    teamRole?: "owner_admin" | "creator";
    activeProfessional?: boolean;
    stalePaymentEntitlement?: boolean;
  },
) {
  const now = new Date("2026-06-16T00:00:00.000Z");
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '13800199001', 'active')
    `,
    [userId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES
        ($1, 'Account Compatibility Shell', 'active'),
        ($2, 'Personal Wallet', 'active'),
        ($3, 'Real Team Wallet', 'active')
    `,
    [userId, personalOrganizationId, teamOrganizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES
        ($1, $2, 'Personal Workspace', 'active'),
        ($3, $4, 'Team Workspace', 'active')
    `,
    [personalWorkspaceId, personalOrganizationId, teamWorkspaceId, teamOrganizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES
        ('30000000-0000-4000-8000-000000001001', $1, $2, $3, 'owner_admin', 'active'),
        ('30000000-0000-4000-8000-000000001002', $4, $5, $3, $6, 'active')
    `,
    [
      personalOrganizationId,
      personalWorkspaceId,
      userId,
      teamOrganizationId,
      teamWorkspaceId,
      options.teamRole ?? "owner_admin",
    ],
  );
  if (options.activeProfessional !== false) {
    await seedTeamProfessionalPeriod(db, {
      periodStartAt: "2026-06-16T00:00:00.000Z",
      periodEndAt: "2026-07-16T00:00:00.000Z",
      entitlementId: "31000000-0000-4000-8000-000000001002",
      periodId: "33000000-0000-4000-8000-000000001002",
      orderId: "34000000-0000-4000-8000-000000001002",
    });
  }
  if (options.stalePaymentEntitlement === true) {
    await seedTeamProfessionalPeriod(db, {
      periodStartAt: "2026-06-01T00:00:00.000Z",
      periodEndAt: "2026-06-15T00:00:00.000Z",
      entitlementId: "31000000-0000-4000-8000-000000001012",
      periodId: "33000000-0000-4000-8000-000000001012",
      orderId: "34000000-0000-4000-8000-000000001012",
      entitlementExpiresAt: null,
    });
  }

  if (options.realTeam) {
    await db.query(
      `
        INSERT INTO team_members (
          id,
          user_id,
          member_account,
          member_account_suffix,
          member_login_account,
          member_name,
          member_password_hash,
          member_credits,
          status
        )
        VALUES (
          $2,
          $1,
          'member001',
          'u00101',
          'member001@u00101',
          'Member',
          'hashed-member-password',
          0,
          'active'
        )
      `,
      [userId, subaccountId],
    );
  }

  const session = await createAuthSession({
    userId,
    token: "credit-recharge-session",
    now,
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
      now,
    ],
  );

  return session;
}

async function seedTeamProfessionalPeriod(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    periodStartAt: string;
    periodEndAt: string;
    entitlementId: string;
    periodId: string;
    orderId: string;
    entitlementExpiresAt?: string | null;
  },
) {
  const planSnapshot = {
    tier: "professional",
    entitlements: ["team_member_management"],
  };
  const planId = input.periodId.replace("33000000", "35000000");
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
      VALUES (
        $1,
        $2,
        'Team Professional Test',
        'professional',
        'month',
        1,
        29900,
        'CNY',
        3000,
        50,
        '["team_member_management"]'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        'active'
      )
    `,
    [planId, `team_professional_${input.periodId.slice(-4)}`],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        organization_id,
        created_by_user_id,
        order_no,
        membership_plan_id,
        product_type,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'membership_plan',
        $6::jsonb,
        $6::jsonb,
        3000,
        29900,
        'CNY',
        'pending_payment',
        $7
      )
    `,
    [
      input.orderId,
      teamOrganizationId,
      userId,
      `ORD-TEAM-${input.periodId.slice(-4)}`,
      planId,
      JSON.stringify(planSnapshot),
      input.periodEndAt,
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
      VALUES ($1, $2, $3, $4, 'professional', $5, $6, 3000, $7::jsonb, 'active', $5, $5)
    `,
    [
      input.periodId,
      teamOrganizationId,
      input.orderId,
      planId,
      input.periodStartAt,
      input.periodEndAt,
      JSON.stringify(planSnapshot),
    ],
  );
  await db.query(
    `
      INSERT INTO organization_entitlements (
        id,
        organization_id,
        entitlement_key,
        status,
        source,
        expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'team_member_management', 'active', 'payment', $3, $4, $4)
    `,
    [
      input.entitlementId,
      teamOrganizationId,
      input.entitlementExpiresAt === undefined ? input.periodEndAt : input.entitlementExpiresAt,
      input.periodStartAt,
    ],
  );
}
