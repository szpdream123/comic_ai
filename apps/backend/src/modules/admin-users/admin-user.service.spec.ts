import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminUserService } from "./admin-user.service.ts";

test("admin user service lists each user once", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001010', 'repeat@example.test', '13800100010', 'Repeat User', 'active')
      `,
    );


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
          '96000000-0000-4000-8000-000000001010',
          '93000000-0000-4000-8000-000000001010',
          'repeat-admin',
          'u01010',
          'repeat-admin@u01010',
          'Repeat Admin Member',
          'hashed-member-password',
          900,
          'active'
        )
      `,
    );

    const result = await service.listUsers({ pageSize: 20 });

    assert.equal(result.meta.total, 1);
    assert.equal(result.data.length, 1);
    assert.match(result.data[0]?.inviteCode ?? "", /^[0-9A-Z]{10}$/);
    assert.deepEqual({ ...result.data[0], inviteCode: "<invite-code>" }, {
      userId: "93000000-0000-4000-8000-000000001010",
      inviteCode: "<invite-code>",
      displayName: "Repeat User",
      phone: "13800100010",
      email: "re***@example.test",
      lastLoginAt: null,
      status: "active",
      accountName: "Repeat User",
      membershipId: "93000000-0000-4000-8000-000000001010",
      membershipRole: "owner",
      membershipTier: null,
      membershipExpiresAt: null,
      accountType: "owner_account",
      teamRole: null,
      teamGroupId: null,
      teamGroupName: null,
      availableCredits: 0,
      reservedCredits: 0,
      frozenCredits: 0,
      displayCreditBalance: 0,
      usedCredits: 0,
      subaccountCount: 1,
    });
  } finally {
    await db.close();
  }
});

test("admin user list reads the user's personal credit wallet", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001020', 'personal@example.test', '13800100020', 'Personal Wallet User', 'active')
      `,
    );



    const result = await service.listUsers({ keyword: "Personal Wallet User", pageSize: 20 });

    assert.equal(result.meta.total, 1);
    assert.match(result.data[0]?.inviteCode ?? "", /^[0-9A-Z]{10}$/);
    assert.deepEqual({ ...result.data[0], inviteCode: "<invite-code>" }, {
      userId: "93000000-0000-4000-8000-000000001020",
      inviteCode: "<invite-code>",
      displayName: "Personal Wallet User",
      phone: "13800100020",
      email: "pe***@example.test",
      lastLoginAt: null,
      status: "active",
      accountName: "Personal Wallet User",
      membershipId: "93000000-0000-4000-8000-000000001020",
      membershipRole: "owner",
      membershipTier: null,
      membershipExpiresAt: null,
      accountType: "owner_account",
      teamRole: null,
      teamGroupId: null,
      teamGroupName: null,
      availableCredits: 0,
      reservedCredits: 0,
      frozenCredits: 0,
      displayCreditBalance: 0,
      usedCredits: 0,
      subaccountCount: 0,
    });
  } finally {
    await db.close();
  }
});

test("admin user list keeps credits on the selected user", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedAdminAccount(db, "97000000-0000-4000-8000-000000001030");
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001030', 'shared@example.test', '13800100030', 'Shared Credit User', 'active')
      `,
    );



    const result = await service.listUsers({ keyword: "Shared Credit User", pageSize: 20 });
    const grantResponse = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000001030",
      amount: 100,
      reason: "Should not write shared wallet",
      idempotencyKey: "admin-credit-shared-wallet-blocked",
      actorAdminAccountId: "97000000-0000-4000-8000-000000001030",
      now: new Date("2026-06-24T08:00:00.000Z"),
    });

    assert.equal(result.data[0]?.availableCredits, 0);
    assert.equal(result.data[0]?.reservedCredits, 0);
    assert.equal(result.data[0]?.displayCreditBalance, 0);
    assert.equal(grantResponse.status, 200);
  } finally {
    await db.close();
  }
});

test("admin credit grants update the selected team member without legacy team tables", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    const input = {
      userId: "93000000-0000-4000-8000-000000002003",
      amount: 25,
      reason: "Team member compensation",
      idempotencyKey: "admin-team-member-credit-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-24T08:00:00.000Z"),
    };

    const first = await service.grantUserCredits(input);
    const replay = await service.grantUserCredits(input);
    const member = await db.query<{ member_credits: number }>(
      "SELECT member_credits FROM team_members WHERE id = $1",
      [input.userId],
    );
    const ledger = await db.query<{ user_id: string; team_member_id: string; amount: number; balance_after: number }>(
      `
        SELECT user_id, team_member_id, amount, balance_after
        FROM credit_ledger_entries
        WHERE source_type = 'admin_manual_grant'
          AND reason = $1
      `,
      [input.reason],
    );

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(member.rows[0]?.member_credits, 705);
    assert.deepEqual(ledger.rows, [{
      user_id: "93000000-0000-4000-8000-000000002001",
      team_member_id: input.userId,
      amount: 25,
      balance_after: 705,
    }]);
  } finally {
    await db.close();
  }
});

test("admin can gift a membership plan to a personal user without marking the order paid", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
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
          visibility,
          usage_scene,
          status
        )
        VALUES (
          '95000000-0000-4000-8000-000000002001',
          'admin_gift_professional_service',
          '后台赠送专业版',
          'professional',
          'month',
          1,
          100,
          'CNY',
          88,
          1,
          '["priority_generation","team_asset_library","team_dashboard","team_member_management","full_flow_agent"]'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          'public',
          'manual_gift',
          'active'
        )
      `,
    );

    const response = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002001",
      reason: "ignored custom reason",
      idempotencyKey: "admin-membership-gift-service-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:30:00.000Z"),
    });
    const replay = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002001",
      reason: "replay reason ignored",
      idempotencyKey: "admin-membership-gift-service-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:30:00.000Z"),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(replay, response);
    if (!("data" in response.body)) {
      throw new Error("membership gift response missing data");
    }

    const membership = await db.query<{
      membership_tier: string | null;
      gift_credits: number | string;
    }>(
      "SELECT membership_tier, gift_credits FROM user_memberships WHERE user_id = '93000000-0000-4000-8000-000000002001'",
    );
    const ledger = await db.query<{
      amount: number | string;
      reason: string | null;
      source_type: string;
      metadata_json: { adminGift?: boolean } | null;
    }>(
      "SELECT amount, reason, source_type, metadata_json FROM credit_ledger_entries WHERE source_type = 'membership_gift'",
    );
    const order = await db.query<{
      status: string;
      paid_at: Date | string | null;
      successful_payment_intent_id: string | null;
    }>(
      "SELECT status, paid_at, successful_payment_intent_id FROM billing_orders WHERE id = $1",
      [response.body.data.orderId],
    );
    const entitlements = await db.query<{ entitlement_key: string; status: string; source: string }>(
      `
        SELECT entitlement_key, status, source
        FROM user_entitlements
        WHERE user_id = '93000000-0000-4000-8000-000000002001'
        ORDER BY entitlement_key
      `,
    );
    const seatLimit = await db.query<{ team_seat_limit: number | string }>(
      "SELECT team_seat_limit FROM users WHERE id = '93000000-0000-4000-8000-000000002001'",
    );

    assert.equal(response.body.data.giftCredits, 88);
    assert.equal(membership.rows[0]?.membership_tier, "professional");
    assert.equal(Number(membership.rows[0]?.gift_credits), 88);
    assert.deepEqual(ledger.rows, [
      {
        amount: 88,
        reason: "会员赠送",
        source_type: "membership_gift",
        metadata_json: {
          orderId: response.body.data.orderId,
          planId: "95000000-0000-4000-8000-000000002001",
          planCode: "admin_gift_professional_service",
          tier: "professional",
          adminGift: true,
          actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
        },
      },
    ]);
    assert.deepEqual(order.rows, [
      {
        status: "closed",
        paid_at: null,
        successful_payment_intent_id: null,
      },
    ]);
    assert.deepEqual(entitlements.rows, [
      {
        entitlement_key: "full_flow_agent",
        status: "active",
        source: "manual",
      },
      {
        entitlement_key: "priority_generation",
        status: "active",
        source: "manual",
      },
      {
        entitlement_key: "team_asset_library",
        status: "active",
        source: "manual",
      },
      {
        entitlement_key: "team_dashboard",
        status: "active",
        source: "manual",
      },
      {
        entitlement_key: "team_member_management",
        status: "active",
        source: "manual",
      },
    ]);
    assert.equal(Number(seatLimit.rows[0]?.team_seat_limit ?? 0), 1);
  } finally {
    await db.close();
  }
});

test("admin membership gift opens the user's membership even when legacy professional periods exist", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
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
          visibility,
          usage_scene,
          status
        )
        VALUES
          (
            '95000000-0000-4000-8000-000000002010',
            'legacy_professional_period',
            '历史专业版',
            'professional',
            'month',
            1,
            100,
            'CNY',
            0,
            1,
            '[]'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,
            'public',
            'manual_gift',
            'active'
          ),
          (
            '95000000-0000-4000-8000-000000002011',
            'admin_gift_experience_service',
            '体验版7天',
            'experience',
            'day',
            7,
            100,
            'CNY',
            300,
            1,
            '[]'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,
            'public',
            'manual_gift',
            'active'
          )
      `,
    );
    await db.query(
      `
        INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        product_type,
        credit_package_id,
        membership_plan_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        idempotency_key,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
        VALUES ('98000000-0000-4000-8000-000000002010', '93000000-0000-4000-8000-000000002001', 'LEGACY-PRO-001', 'membership_plan', NULL, '95000000-0000-4000-8000-000000002010', '{}'::jsonb, '{}'::jsonb, 0, 100, 'CNY', 'closed', 'legacy-professional-period', '2026-06-01T00:00:00.000Z', NULL, NULL)
      `,
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
        VALUES ('99000000-0000-4000-8000-000000002010', '93000000-0000-4000-8000-000000002001', '98000000-0000-4000-8000-000000002010', '95000000-0000-4000-8000-000000002010', 'professional', '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 0, '{}'::jsonb, 'active')
      `,
    );

    const response = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002011",
      reason: "ignored custom reason",
      idempotencyKey: "admin-membership-gift-legacy-period-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:30:00.000Z"),
    });
    assert.equal(response.status, 200);

    const membership = await db.query<{
      membership_tier: string | null;
      expires_at: Date | string | null;
      gift_credits: number | string;
    }>(
      "SELECT membership_tier, expires_at, gift_credits FROM user_memberships WHERE user_id = '93000000-0000-4000-8000-000000002001'",
    );
    const ledger = await db.query<{
      amount: number | string;
      reason: string | null;
      source_type: string;
    }>("SELECT amount, reason, source_type FROM credit_ledger_entries WHERE source_type = 'membership_gift'");

    assert.equal(membership.rows[0]?.membership_tier, "experience");
    assert.equal(new Date(membership.rows[0]?.expires_at ?? 0).toISOString(), "2026-06-12T08:30:00.000Z");
    assert.equal(Number(membership.rows[0]?.gift_credits), 300);
    assert.deepEqual(ledger.rows, [
      {
        amount: 300,
        reason: "会员赠送",
        source_type: "membership_gift",
      },
    ]);
  } finally {
    await db.close();
  }
});

test("admin membership gift extends the same tier and never downgrades a higher tier", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
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
          visibility,
          usage_scene,
          status
        )
        VALUES (
          '95000000-0000-4000-8000-000000002050',
          'admin_gift_experience_extend',
          '体验版7天',
          'experience',
          'day',
          7,
          100,
          'CNY',
          30,
          1,
          '[]'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          'public',
          'manual_gift',
          'active'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO user_memberships (
          id, user_id, membership_tier, purchase_at, expires_at, gift_credits, status
        )
        VALUES (
          '94000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002001',
          'experience',
          '2026-07-01T08:00:00.000Z',
          '2026-07-10T08:00:00.000Z',
          30,
          'active'
        )
      `,
    );

    const extendResponse = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002050",
      reason: "ignored custom reason",
      idempotencyKey: "admin-membership-gift-extend-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-07-07T08:30:00.000Z"),
    });
    assert.equal(extendResponse.status, 200);
    const extended = await db.query<{ membership_tier: string | null; expires_at: Date | string | null }>(
      "SELECT membership_tier, expires_at FROM user_memberships WHERE user_id = '93000000-0000-4000-8000-000000002001'",
    );
    assert.equal(extended.rows[0]?.membership_tier, "experience");
    assert.equal(new Date(extended.rows[0]?.expires_at ?? 0).toISOString(), "2026-07-17T08:00:00.000Z");

    await db.query(
      `
        UPDATE user_memberships
        SET membership_tier = 'professional',
            purchase_at = '2026-07-01T08:00:00.000Z',
            expires_at = '2026-08-01T08:00:00.000Z',
            gift_credits = 3000
        WHERE user_id = '93000000-0000-4000-8000-000000002001'
      `,
    );
    const lowerTierResponse = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002050",
      reason: "ignored custom reason",
      idempotencyKey: "admin-membership-gift-no-downgrade-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-07-08T08:30:00.000Z"),
    });
    assert.equal(lowerTierResponse.status, 200);
    const kept = await db.query<{ membership_tier: string | null; expires_at: Date | string | null }>(
      "SELECT membership_tier, expires_at FROM user_memberships WHERE user_id = '93000000-0000-4000-8000-000000002001'",
    );
    const ledger = await db.query<{ amount: number | string }>(
      "SELECT amount FROM credit_ledger_entries WHERE source_type = 'membership_gift' ORDER BY created_at ASC",
    );

    assert.equal(kept.rows[0]?.membership_tier, "professional");
    assert.equal(new Date(kept.rows[0]?.expires_at ?? 0).toISOString(), "2026-08-01T08:00:00.000Z");
    assert.deepEqual(ledger.rows.map((row) => Number(row.amount)), [30, 30]);
  } finally {
    await db.close();
  }
});

test("admin membership gift updates the same personal membership row shown in the user list", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        UPDATE user_memberships
        SET created_at = '2026-06-01T08:00:00.000Z'
        WHERE user_id = '93000000-0000-4000-8000-000000002001'
      `,
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
          visibility,
          usage_scene,
          status
        )
        VALUES (
          '95000000-0000-4000-8000-000000002090',
          'admin_gift_experience_latest_row',
          '体验版7天',
          'experience',
          'day',
          7,
          100,
          'CNY',
          300,
          1,
          '[]'::jsonb,
          '{}'::jsonb,
          '{}'::jsonb,
          'public',
          'manual_gift',
          'active'
        )
      `,
    );

    const beforeGift = await service.listUsers({ keyword: "Scope Owner", pageSize: 20 });
    const response = await service.grantUserMembership({
      userId: "93000000-0000-4000-8000-000000002001",
      membershipPlanId: "95000000-0000-4000-8000-000000002090",
      reason: "ignored custom reason",
      idempotencyKey: "admin-membership-gift-latest-row-test",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2099-06-07T08:30:00.000Z"),
    });
    assert.equal(response.status, 200);

    const memberships = await db.query<{
      id: string;
      membership_tier: string | null;
    }>(
      `
        SELECT id, membership_tier
        FROM user_memberships
        WHERE user_id = '93000000-0000-4000-8000-000000002001'
        ORDER BY created_at ASC
      `,
    );
    const afterGift = await service.listUsers({ keyword: "Scope Owner", pageSize: 20 });

    assert.equal(beforeGift.data[0]?.membershipId, "93000000-0000-4000-8000-000000002001");
    assert.equal(memberships.rows.length, 1);
    assert.equal(memberships.rows[0]?.membership_tier, "experience");
    assert.equal(afterGift.data[0]?.membershipId, "93000000-0000-4000-8000-000000002001");
    assert.equal(afterGift.data[0]?.membershipTier, "experience");
  } finally {
    await db.close();
  }
});

test("admin user service lists only team permission accounts with subaccount totals", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES
          ('93000000-0000-4000-8000-000000001001', 'owner@example.test', '13800100001', 'Owner Admin', 'active')
      `,
    );


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
          status,
          created_at,
          updated_at
        )
        VALUES
          (
            '96000000-0000-4000-8000-000000001001',
            '93000000-0000-4000-8000-000000001001',
            'storyboard-lead',
            'u01001',
            'storyboard-lead@u01001',
            'Storyboard Lead',
            'hashed-member-password',
            2100,
            'active',
            '2026-06-30T03:36:50.017Z',
            '2026-07-02T04:12:21.760Z'
          ),
          (
            '96000000-0000-4000-8000-000000001002',
            '93000000-0000-4000-8000-000000001001',
            'storyboard-artist',
            'u01001',
            'storyboard-artist@u01001',
            'Storyboard Artist',
            'hashed-member-password',
            680,
            'active',
            '2026-06-30T02:02:54.337Z',
            '2026-06-30T03:09:31.912Z'
          )
      `,
    );

    const result = await service.listTeamPermissionAccounts({ pageSize: 20 });
    const subaccounts = await service.listSubaccounts({
      userId: "93000000-0000-4000-8000-000000001001",
    });

    assert.equal(result.meta.total, 2);
    assert.deepEqual(
      result.data.map((account) => ({
        displayName: account.displayName,
        accountType: account.accountType,
        membershipRole: account.membershipRole,
        availableCredits: account.availableCredits,
      })),
      [
        {
          displayName: "Storyboard Lead",
          accountType: "subaccount",
          membershipRole: "team_member",
          availableCredits: 2100,
        },
        {
          displayName: "Storyboard Artist",
          accountType: "subaccount",
          membershipRole: "team_member",
          availableCredits: 680,
        },
      ],
    );
    assert.deepEqual(
      subaccounts.data.map((account) => ({
        memberAccount: account.memberAccount,
        displayName: account.displayName,
        loginName: account.loginName,
        memberLoginAccount: account.memberLoginAccount,
        memberCredits: account.memberCredits,
        creditBalance: account.creditBalance,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
      [
        {
          memberAccount: "storyboard-lead",
          displayName: "Storyboard Lead",
          loginName: "storyboard-lead@u01001",
          memberLoginAccount: "storyboard-lead@u01001",
          memberCredits: 2100,
          creditBalance: 2100,
          createdAt: "2026-06-30T03:36:50.017Z",
          updatedAt: "2026-07-02T04:12:21.760Z",
        },
        {
          memberAccount: "storyboard-artist",
          displayName: "Storyboard Artist",
          loginName: "storyboard-artist@u01001",
          memberLoginAccount: "storyboard-artist@u01001",
          memberCredits: 680,
          creditBalance: 680,
          createdAt: "2026-06-30T02:02:54.337Z",
          updatedAt: "2026-06-30T03:09:31.912Z",
        },
      ],
    );
  } finally {
    await db.close();
  }
});

test("admin user service tolerates legacy missing phone values in user lists", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001099', NULL, NULL, 'Legacy Phone User', 'active')
      `,
    );

    const result = await service.listUsers({ keyword: "Legacy Phone User", pageSize: 20 });

    assert.equal(result.meta.total, 1);
    assert.equal(result.data[0]?.userId, "93000000-0000-4000-8000-000000001099");
    assert.equal(result.data[0]?.phone, null);
  } finally {
    await db.close();
  }
});

test("admin user credit ledger keeps subaccount ledger scoped to the target user", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002003",
      pageSize: 20,
    });

    assert.deepEqual(
      result.data.map((entry) => entry.sourceType),
      ["credit_reservation_allocation", "credit_reservation", "admin_manual_deduct", "admin_manual_grant"],
    );
    assert.deepEqual(
      result.data.map((entry) => entry.metadata.adjustmentScenario),
      [undefined, undefined, "correction", "compensation"],
    );
    assert.deepEqual(
      result.data.map((entry) => entry.content),
      ["任务返还积分", "生图扣减", "手动扣减积分", "手动增加积分"],
    );
    assert.equal(result.accountType, "子账户");
    assert.deepEqual(
      result.data
        .filter((entry) => ["credit_reservation", "credit_reservation_allocation"].includes(entry.sourceType))
        .filter((entry) => ["reservation", "consume"].includes(entry.entryType))
        .map((entry) => entry.reservationId),
      ["97000000-0000-4000-8000-000000002002"],
    );
  } finally {
    await db.close();
  }
});

test("admin user credit ledger lets team admins see their managed subaccount ledger", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002002",
      pageSize: 20,
    });

    assert.deepEqual(
      result.data.map((entry) => entry.sourceType),
      [],
    );
    assert.deepEqual(
      result.data.map((entry) => entry.userId),
      [],
    );
  } finally {
    await db.close();
  }
});

test("admin user credit ledger lets owner accounts see all subaccount ledger", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002001",
      pageSize: 20,
    });

    assert.ok(result.data.some((entry) => entry.metadata.adjustmentScenario === "compensation"));
    assert.ok(result.data.some((entry) => entry.sourceType === "credit_reservation"));
  } finally {
    await db.close();
  }
});

test("admin user credit ledger returns balance and usage summary for account details", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002003",
      pageSize: 20,
    });

    assert.deepEqual(result.summary, {
      balanceScope: "member",
      userAvailableCredits: 0,
      userReservedCredits: 0,
      userFrozenCredits: 0,
      userFrozenAt: null,
      userFrozenUntil: null,
      memberAvailableCredits: 680,
      memberUsedCredits: null,
      displayAvailableCredits: 680,
      displayCreditBalance: 680,
      frozenCredits: 0,
      displayReservedCredits: 0,
      totalGrantedCredits: 50,
      totalConsumedCredits: 10,
      totalReleasedCredits: 80,
      activeReservationCount: 0,
      manualReviewReservationCount: 0,
    });
  } finally {
    await db.close();
  }
});

test("admin user credit ledger can be filtered to a specific creator", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await seedExplicitCreatorLedgerFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "4af8d99f-a74d-4a80-a610-3c0e725d420b",
      pageSize: 10,
    });

    assert.deepEqual(
      result.data.slice(0, 2).map((entry) => ({
        sourceType: entry.sourceType,
        entryType: entry.entryType,
        amount: entry.amount,
        taskId: entry.metadata.taskId,
      })),
      [
        {
          sourceType: "credit_reservation_allocation",
          entryType: "release",
          amount: 99,
          taskId: "11cac812-37b1-4d50-abb0-fc046d52259e",
        },
        {
          sourceType: "episode_generation_task",
          entryType: "reservation",
          amount: 99,
          taskId: "11cac812-37b1-4d50-abb0-fc046d52259e",
        },
      ],
    );
  } finally {
    await db.close();
  }
});

test("admin user credit ledger includes project-related user wallet entries", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedExplicitCreatorLedgerFixture(db);
    await seedPersonalCreatorMembershipFixture(db);
    await db.query(
      `
        INSERT INTO credit_ledger_entries (
        id,
        user_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
        VALUES ('98000000-0000-4000-8000-000000003003', '4af8d99f-a74d-4a80-a610-3c0e725d420b', 'consume', 201, 0, -201, 201, 'episode_generation_task', '99000000-0000-4000-8000-000000003003', 'AI storyboard generation', '{"taskId":"11cac812-37b1-4d50-abb0-fc046d52259f"}'::jsonb, '4af8d99f-a74d-4a80-a610-3c0e725d420b', '2026-06-05T08:02:00.000Z')
      `,
    );

    const result = await service.listUserCreditLedger({
      userId: "4af8d99f-a74d-4a80-a610-3c0e725d420b",
      pageSize: 10,
    });

    assert.equal(result.data[0]?.sourceType, "episode_generation_task");
    assert.equal(result.data[0]?.entryType, "consume");
    assert.equal(result.data[0]?.amount, 201);
    assert.equal(result.data[0]?.userId, "4af8d99f-a74d-4a80-a610-3c0e725d420b");
    assert.equal(result.summary.totalConsumedCredits, 201);
  } finally {
    await db.close();
  }
});

test("admin user credit ledger summary separates frozen credits from available credits", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = 0,
            credit_reserved_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '93000000-0000-4000-8000-000000002001'
      `,
    );

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002001",
      pageSize: 20,
    });

    assert.equal(result.summary.displayAvailableCredits, 0);
    assert.equal(result.summary.frozenCredits, 18800);
    assert.equal(result.summary.displayCreditBalance, 18800);
  } finally {
    await db.close();
  }
});

test("admin user credit ledger includes membership gift grants for the owner account", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        INSERT INTO credit_ledger_entries (
        id,
        user_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
        VALUES ('98000000-0000-4000-8000-000000002099', '93000000-0000-4000-8000-000000002001', 'grant', 30, 30, 0, 0, 'membership_gift', '99000000-0000-4000-8000-000000002099', 'Membership gift credits', '{}'::jsonb, NULL, '2026-06-05T07:15:00.000Z')
      `,
    );

    const result = await service.listUserCreditLedger({
      userId: "93000000-0000-4000-8000-000000002001",
      pageSize: 20,
    });

    const membershipGift = result.data.find((entry) => entry.sourceType === "membership_gift");
    assert.equal(membershipGift?.amount, 30);
  } finally {
    await db.close();
  }
});

test("admin user list exposes frozen credits separately from reserved credits", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = 0,
            credit_reserved_cached = 120,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '93000000-0000-4000-8000-000000002001'
      `,
    );

    const result = await service.listUsers({ keyword: "Scope Owner", pageSize: 20 });
    const owner = result.data.find((user) => user.userId === "93000000-0000-4000-8000-000000002001");

    assert.equal(owner?.availableCredits, 0);
    assert.equal(owner?.reservedCredits, 120);
    assert.equal(owner?.frozenCredits, 18800);
    assert.equal(owner?.displayCreditBalance, 18800);
  } finally {
    await db.close();
  }
});

test("admin manual credit grant can add available credits while wallet credits are frozen", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '93000000-0000-4000-8000-000000002001'
      `,
    );

    const response = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 200,
      reason: "Admin support grant while frozen",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-frozen-owner-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-24T08:00:00.000Z"),
    });
    const result = await service.listUsers({ keyword: "Scope Owner", pageSize: 20 });
    const owner = result.data.find((user) => user.userId === "93000000-0000-4000-8000-000000002001");

    assert.equal(response.status, 200);
    assert.equal("data" in response.body && response.body.data.availableCredits, 200);
    assert.equal(owner?.availableCredits, 200);
    assert.equal(owner?.frozenCredits, 18800);
    assert.equal(owner?.displayCreditBalance, 19000);
  } finally {
    await db.close();
  }
});

test("admin user service lists model request logs by user", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        INSERT INTO ai_model_configs (
          id,
          model_code,
          display_name,
          provider_name,
          provider_model,
          provider_protocol,
          invocation_mode,
          media_type,
          provider_config_json
        )
        VALUES (
          '99000000-0000-4000-8000-000000002100',
          'deepseek-chat',
          'DeepSeek Chat',
          'deepseek',
          'deepseek-chat',
          'openai_compatible_chat',
          'sync',
          'text',
          '{"baseURL":"https://api.example.com/v1/","requestPath":"/chat/completions","createTaskEndpoint":"/ignored"}'::jsonb
        )
      `,
    );
    await db.query(
      `
        INSERT INTO provider_requests (
        id,
        provider_name,
        provider_operation,
        request_key,
        request_hash,
        payload_ref,
        payload_hash,
        payload_redacted_json,
        status,
        external_submission_started_at,
        response_redacted_json,
        created_by_user_id,
        created_at,
        updated_at
      )
        VALUES ('99000000-0000-4000-8000-000000002101', 'deepseek', 'llm.chat.completions', 'scope-model-log-1', 'req-hash-scope-1', 'text-gateway://scope-model-log-1', 'payload-hash-scope-1', '{"model":"deepseek-chat"}'::jsonb, 'succeeded', '2026-06-05T09:00:00.000Z', '{"usageSource":"provider","providerRawResponse":"{\"code\":\"insufficient_user_quota\",\"message\":\"quota exhausted\",\"data\":null}","diagnostics":{"responseBodyPreview":"{\"code\":\"filtered\"}"},"redactedRequest":{"model":"deepseek-chat","max_tokens":128000}}'::jsonb, '93000000-0000-4000-8000-000000002001', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z')
      `,
    );
    await db.query(
      `
        INSERT INTO user_model_request_logs (
        id,
        provider_request_id,
        user_id,
        provider_name,
        provider_operation,
        model_id,
        provider_model,
        request_key,
        request_hash,
        payload_hash,
        payload_summary,
        request_body_json,
        request_text,
        response_text,
        response_usage_json,
        response_finish_reasons_json,
        status,
        started_at,
        completed_at,
        created_at,
        updated_at
      )
        VALUES ('99000000-0000-4000-8000-000000002102', '99000000-0000-4000-8000-000000002101', '93000000-0000-4000-8000-000000002001', 'deepseek', 'llm.chat.completions', 'deepseek-chat', 'deepseek-chat', 'scope-model-log-1', 'req-hash-scope-1', 'payload-hash-scope-1', 'storyboard prompt', '{"model":"deepseek-chat","max_tokens":384000}'::jsonb, '[user]\n角色模板 任小野', '{"characters":[{"name":"任小野"}]}', '{"prompt_tokens":101,"completion_tokens":55,"total_tokens":156}'::jsonb, '["stop"]'::jsonb, 'succeeded', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z', '2026-06-05T09:00:00.000Z', '2026-06-05T09:00:10.000Z')
      `,
    );

    const result = await service.listUserModelRequestLogs({
      userId: "93000000-0000-4000-8000-000000002001",
      page: 1,
      pageSize: 15,
      modelType: "text",
    });

    assert.equal("status" in result, false);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.modelId, "deepseek-chat");
    assert.equal(result.data[0]?.modelType, "text");
    assert.equal(result.data[0]?.modelName, "deepseek-chat");
    assert.equal(result.data[0]?.creditsCost, 0);
    assert.equal(result.data[0]?.providerRequestId, "99000000-0000-4000-8000-000000002101");
    assert.equal(result.data[0]?.requestHash, "req-hash-scope-1");
    assert.equal(result.data[0]?.payloadHash, "payload-hash-scope-1");
    assert.equal(result.data[0]?.requestFormat, "openai_chat_completions");
    assert.deepEqual(result.data[0]?.businessRequestBody, { model: "deepseek-chat" });
    assert.deepEqual(result.data[0]?.providerRequestBody, {
      model: "deepseek-chat",
      max_tokens: 128000,
    });
    assert.equal(result.data[0]?.providerRequestUrl, "https://api.example.com/v1/chat/completions");
    assert.equal(
      result.data[0]?.providerResponseBody,
      '{"code":"insufficient_user_quota","message":"quota exhausted","data":null}',
    );
    assert.equal(result.data[0]?.providerRequestStatus, "succeeded");
    assert.equal(result.data[0]?.providerFailureCode, null);
    assert.equal(result.data[0]?.externalSubmissionStartedAt, "2026-06-05T09:00:00.000Z");
    assert.equal(result.data[0]?.externalRequestId, null);
    assert.equal(result.data[0]?.taskStatus, null);
    assert.equal(result.data[0]?.taskFailureCode, null);
    assert.match(result.data[0]?.requestText ?? "", /角色模板 任小野/);
    assert.match(result.data[0]?.responseText ?? "", /任小野/);
    assert.equal(result.data[0]?.responseUsage?.total_tokens, 156);
    assert.equal(result.meta.page, 1);
    assert.equal(result.meta.pageSize, 15);
    assert.equal(result.meta.total, 1);
    assert.equal(result.meta.totalPages, 1);
  } finally {
    await db.close();
  }
});

test("admin user service marks queued generation logs as not submitted to the provider", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        INSERT INTO tasks (
          id,
          workflow_id,
          task_type,
          status,
          queue_name,
          input_snapshot_json,
          target_entity_type,
          target_entity_id,
          failure_code,
          created_at,
          updated_at
        )
        VALUES (
          '99000000-0000-4000-8000-000000002103',
          '97000000-0000-4000-8000-000000002001',
          'episode_generate_image',
          'failed',
          'generation-submit-image',
          '{}'::jsonb,
          'episode',
          '99000000-0000-4000-8000-000000002106',
          'task_timeout',
          '2026-06-05T09:20:00.000Z',
          '2026-06-05T09:21:00.000Z'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO provider_requests (
          id,
          workflow_id,
          task_id,
          provider_name,
          provider_operation,
          request_key,
          request_hash,
          payload_ref,
          payload_hash,
          payload_redacted_json,
          status,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          '99000000-0000-4000-8000-000000002104',
          '97000000-0000-4000-8000-000000002001',
          '99000000-0000-4000-8000-000000002103',
          'cumob',
          'episode.image.generate',
          'scope-model-log-unsent',
          'req-hash-scope-unsent',
          'creator://scope-model-log-unsent',
          'payload-hash-scope-unsent',
          '{"prompt":"角色立绘","parameters":{"aspectRatio":"1:1"}}'::jsonb,
          'created',
          '93000000-0000-4000-8000-000000002001',
          '2026-06-05T09:20:00.000Z',
          '2026-06-05T09:21:00.000Z'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO user_model_request_logs (
          id,
          provider_request_id,
          task_id,
          user_id,
          provider_name,
          provider_operation,
          model_id,
          provider_model,
          request_key,
          request_hash,
          payload_hash,
          request_format,
          request_body_json,
          status,
          failure_code,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES (
          '99000000-0000-4000-8000-000000002105',
          '99000000-0000-4000-8000-000000002104',
          '99000000-0000-4000-8000-000000002103',
          '93000000-0000-4000-8000-000000002001',
          'cumob',
          'episode.image.generate',
          'gpt-image-1.5',
          'gpt-image-1.5',
          'scope-model-log-unsent',
          'req-hash-scope-unsent',
          'payload-hash-scope-unsent',
          'generation_task',
          '{"prompt":"角色立绘","parameters":{"aspectRatio":"1:1"}}'::jsonb,
          'failed',
          'task_timeout',
          '2026-06-05T09:20:00.000Z',
          '2026-06-05T09:21:00.000Z',
          '2026-06-05T09:20:00.000Z',
          '2026-06-05T09:21:00.000Z'
        )
      `,
    );

    const result = await service.listUserModelRequestLogs({
      userId: "93000000-0000-4000-8000-000000002001",
      modelType: "image",
    });

    assert.equal("status" in result, false);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.requestFormat, "generation_task");
    assert.deepEqual(result.data[0]?.businessRequestBody, {
      prompt: "角色立绘",
      parameters: { aspectRatio: "1:1" },
    });
    assert.equal(result.data[0]?.providerRequestBody, null);
    assert.equal(result.data[0]?.providerRequestStatus, "created");
    assert.equal(result.data[0]?.externalSubmissionStartedAt, null);
    assert.equal(result.data[0]?.externalRequestId, null);
    assert.equal(result.data[0]?.taskStatus, "failed");
    assert.equal(result.data[0]?.taskFailureCode, "task_timeout");
  } finally {
    await db.close();
  }
});

test("admin manual credit grant stores adjustment scenario metadata for future credit policies", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const response = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 30,
      reason: "Support compensation",
      workOrderNo: "CS-20260605-030",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-scenario-compensation",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });

    const ledger = await db.query<{ adjustment_scenario: string | null }>(
      `
        SELECT metadata_json->>'adjustmentScenario' AS adjustment_scenario
        FROM credit_ledger_entries
        WHERE source_type = 'admin_manual_grant'
          AND metadata_json->>'workOrderNo' = 'CS-20260605-030'
      `,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(ledger.rows, [{ adjustment_scenario: "compensation" }]);
  } finally {
    await db.close();
  }
});

test("admin manual credit adjustments accept omitted work order metadata", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const grantResponse = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 30,
      reason: "Support compensation without ticket",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-no-work-order-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });
    const deductResponse = await service.deductUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 10,
      reason: "Correction without ticket",
      adjustmentScenario: "correction",
      idempotencyKey: "admin-credit-no-work-order-deduct",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:05:00.000Z"),
    });
    const metadata = await db.query<{ source_type: string; work_order_no: string | null }>(
      `
        SELECT source_type, metadata_json->>'workOrderNo' AS work_order_no
        FROM credit_ledger_entries
        WHERE source_type IN ('admin_manual_grant', 'admin_manual_deduct')
          AND reason IN ('Support compensation without ticket', 'Correction without ticket')
        ORDER BY created_at ASC
      `,
    );

    assert.equal(grantResponse.status, 200);
    assert.equal(deductResponse.status, 200);
    assert.deepEqual(metadata.rows, [
      { source_type: "admin_manual_grant", work_order_no: null },
      { source_type: "admin_manual_deduct", work_order_no: null },
    ]);
  } finally {
    await db.close();
  }
});

test("admin can force restore frozen wallet credits without membership renewal", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '93000000-0000-4000-8000-000000002001'
      `,
    );
    await db.query(
      `
        INSERT INTO credit_lots (
        id,
        user_id,
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
        metadata_json,
        created_at,
        updated_at
      )
        VALUES ('97000000-0000-4000-8000-000000002099', '93000000-0000-4000-8000-000000002001', 'payment_order', '99000000-0000-4000-8000-000000002099', '98000000-0000-4000-8000-000000002001', 18800, 18800, 0, 0, 0, 'frozen', '2026-06-24T07:10:00.000Z', '2027-06-24T07:10:00.000Z', '{"kind":"direct_recharge"}'::jsonb, '2026-06-05T07:00:00.000Z', '2026-06-24T07:10:00.000Z')
      `,
    );

    const response = await service.restoreFrozenUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      reason: "Admin force restore for support ticket",
      idempotencyKey: "admin-credit-force-restore-owner",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-24T08:00:00.000Z"),
    });
    const user = await db.query<{
      credit_balance_cached: number;
      credit_frozen_cached: number;
      credit_frozen_at: Date | null;
      credit_frozen_until: Date | null;
    }>(
      `
        SELECT credit_balance_cached, credit_frozen_cached, credit_frozen_at, credit_frozen_until
        FROM users
        WHERE id = '93000000-0000-4000-8000-000000002001'
      `,
    );
    const lot = await db.query<{ status: string; frozen_at: Date | null; frozen_until: Date | null }>(
      `
        SELECT status, frozen_at, frozen_until
        FROM credit_lots
        WHERE id = '97000000-0000-4000-8000-000000002099'
      `,
    );
    const audit = await db.query<{ event_type: string; restored_amount: string | null }>(
      `
        SELECT event_type, metadata_json->>'restoredAmount' AS restored_amount
        FROM audit_events
        WHERE event_type = 'admin.credit.frozen_restored'
      `,
    );

    assert.equal(response.status, 200);
    assert.equal("data" in response.body && response.body.data.restoredAmount, 18800);
    assert.equal(Number(user.rows[0]?.credit_balance_cached ?? 0), 18800);
    assert.equal(Number(user.rows[0]?.credit_frozen_cached ?? 0), 0);
    assert.equal(user.rows[0]?.credit_frozen_at, null);
    assert.equal(user.rows[0]?.credit_frozen_until, null);
    assert.equal(lot.rows[0]?.status, "active");
    assert.equal(lot.rows[0]?.frozen_at, null);
    assert.equal(lot.rows[0]?.frozen_until, null);
    assert.deepEqual(audit.rows, [{ event_type: "admin.credit.frozen_restored", restored_amount: "18800" }]);
  } finally {
    await db.close();
  }
});

test("admin user service manages per-user team subaccount limits", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const defaultResponse = await service.getTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
    });
    assert.equal(defaultResponse.status, 200);
    assert.deepEqual(defaultResponse.body.data, {
      userName: "Scope Owner",
      defaultSeatLimit: 50,
      effectiveSeatLimit: 50,
      overrideSeatLimit: null,
      limitSource: "default",
      usedSeats: 2,
      remainingSeats: 48,
    });

    const overrideResponse = await service.updateTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
      seatLimit: 120,
      reason: "Enterprise team expansion",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:30:00.000Z"),
    });
    assert.equal(overrideResponse.status, 200);
    assert.equal(overrideResponse.body.data.effectiveSeatLimit, 120);
    assert.equal(overrideResponse.body.data.overrideSeatLimit, 120);
    assert.equal(overrideResponse.body.data.limitSource, "override");

    const lowerThanUsedResponse = await service.updateTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
      seatLimit: 1,
      reason: "Downgrade after contract change",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:35:00.000Z"),
    });
    assert.equal(lowerThanUsedResponse.status, 200);
    assert.equal(lowerThanUsedResponse.body.data.effectiveSeatLimit, 1);
    assert.equal(lowerThanUsedResponse.body.data.usedSeats, 2);
    assert.equal(lowerThanUsedResponse.body.data.remainingSeats, 0);

    const clearResponse = await service.updateTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
      seatLimit: null,
      reason: "Restore default plan",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:40:00.000Z"),
    });
    assert.equal(clearResponse.status, 200);
    assert.equal(clearResponse.body.data.effectiveSeatLimit, 50);
    assert.equal(clearResponse.body.data.overrideSeatLimit, null);
    assert.equal(clearResponse.body.data.limitSource, "default");

    const storedLimit = await db.query<{ team_seat_limit: string | number }>(
      "SELECT team_seat_limit FROM users WHERE id = '93000000-0000-4000-8000-000000002001'",
    );
    const auditEvents = await db.query<{ event_type: string }>(
      `
        SELECT event_type
        FROM audit_events
        WHERE event_type IN ('admin.team_plan_limit.updated', 'admin.team_plan_limit.cleared')
        ORDER BY created_at ASC
      `,
    );

    assert.equal(Number(storedLimit.rows[0]?.team_seat_limit ?? 0), 0);
    assert.deepEqual(auditEvents.rows.map((row) => row.event_type), [
      "admin.team_plan_limit.updated",
      "admin.team_plan_limit.updated",
      "admin.team_plan_limit.cleared",
    ]);
  } finally {
    await db.close();
  }
});

test("admin user service validates team subaccount limit input", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const missingReason = await service.updateTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
      seatLimit: 20,
      reason: " ",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:45:00.000Z"),
    });
    const invalidLimit = await service.updateTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000002001",
      seatLimit: -1,
      reason: "Invalid negative limit",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:50:00.000Z"),
    });
    const unknownUser = await service.getTeamPlanLimit({
      userId: "93000000-0000-4000-8000-000000009999",
    });

    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.body.error.code, "reason_required");
    assert.equal(invalidLimit.status, 400);
    assert.equal(invalidLimit.body.error.code, "invalid_team_seat_limit");
    assert.equal(unknownUser.status, 404);
    assert.equal(unknownUser.body.error.code, "admin_user_not_found");
  } finally {
    await db.close();
  }
});

test("admin user service blocks disabled user mutations except re-enable", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const disabledResponse = await service.updateUserStatus({
      userId: "93000000-0000-4000-8000-000000002001",
      status: "disabled",
      reason: "Risk hold",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });
    const grantResponse = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 30,
      reason: "Should not grant while disabled",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-disabled-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:05:00.000Z"),
    });
    const deductResponse = await service.deductUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 10,
      reason: "Should not deduct while disabled",
      adjustmentScenario: "correction",
      idempotencyKey: "admin-credit-disabled-deduct",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:10:00.000Z"),
    });
    const profileResponse = await service.updateUserProfile({
      userId: "93000000-0000-4000-8000-000000002001",
      displayName: "Disabled Owner",
      reason: "Should not edit while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:15:00.000Z"),
    });
    const revealResponse = await service.revealUserContact({
      userId: "93000000-0000-4000-8000-000000002001",
      reason: "Should not reveal while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
    });
    const archiveResponse = await service.updateUserStatus({
      userId: "93000000-0000-4000-8000-000000002001",
      status: "archived",
      reason: "Should not archive while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:20:00.000Z"),
    });
    const enableResponse = await service.updateUserStatus({
      userId: "93000000-0000-4000-8000-000000002001",
      status: "active",
      reason: "Risk hold cleared",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:25:00.000Z"),
    });

    assert.equal(disabledResponse.status, 200);
    for (const response of [grantResponse, deductResponse, profileResponse, revealResponse, archiveResponse]) {
      assert.equal(response.status, 409);
      assert.equal("error" in response.body && response.body.error.code, "inactive_user_operation_blocked");
    }
    assert.equal(enableResponse.status, 200);
    assert.equal("data" in enableResponse.body && enableResponse.body.data.status, "active");
  } finally {
    await db.close();
  }
});

async function seedAdminAccount(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  adminAccountId: string,
) {
  const loginSuffix = adminAccountId.replaceAll("-", "").slice(-12);
  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status
      )
      VALUES ($1, $2, 'plain:test-password', 'Admin User Service Test', 'active')
    `,
    [adminAccountId, `admin_user_${loginSuffix}`],
  );
}

async function seedCreditScopeFixture(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await seedAdminAccount(db, "97000000-0000-4000-8000-000000002001");
  await db.query(
    `
      INSERT INTO users (id, email, phone_e164, display_name, status)
      VALUES
        ('93000000-0000-4000-8000-000000002001', 'owner-scope@example.test', '13800200001', 'Scope Owner', 'active')
    `,
  );


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
      VALUES
        (
          '93000000-0000-4000-8000-000000002002',
          '93000000-0000-4000-8000-000000002001',
          'scope-lead',
          'u02001',
          'scope-lead@u02001',
          'Scope Lead',
          'hashed-member-password',
          2100,
          'active'
        ),
        (
          '93000000-0000-4000-8000-000000002003',
          '93000000-0000-4000-8000-000000002001',
          'scope-artist',
          'u02001',
          'scope-artist@u02001',
          'Scope Artist',
          'hashed-member-password',
          680,
          'active'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        team_member_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES
        (
          '98000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002001',
          NULL,
          'grant',
          120,
          120,
          0,
          0,
          'payment_order',
          '99000000-0000-4000-8000-000000002001',
          'Paid order',
          '{}'::jsonb,
          NULL,
          '2026-06-05T07:00:00.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000002002',
          '93000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          'grant',
          50,
          50,
          0,
          0,
          'admin_manual_grant',
          '99000000-0000-4000-8000-000000002002',
          'Compensation',
          '{"targetUserId":"93000000-0000-4000-8000-000000002003","targetMembershipId":"93000000-0000-4000-8000-000000002003","workOrderNo":"CS-20260605-002","adjustmentScenario":"compensation"}'::jsonb,
          NULL,
          '2026-06-05T07:05:00.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000002006',
          '93000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          'consume',
          10,
          0,
          -10,
          10,
          'admin_manual_deduct',
          '99000000-0000-4000-8000-000000002003',
          'Correction',
          '{"adjustmentScenario":"correction","targetUserId":"93000000-0000-4000-8000-000000002003","targetMembershipId":"93000000-0000-4000-8000-000000002003"}'::jsonb,
          '93000000-0000-4000-8000-000000002001',
          '2026-06-05T07:10:00.000Z'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ('97000000-0000-4000-8000-000000002001', NULL, 'image_generation', 'failed', '{}'::jsonb, '93000000-0000-4000-8000-000000002001', '2026-06-05T07:11:00.000Z', '2026-06-05T07:12:00.000Z')
    `,
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        user_id,
        project_id,
        workflow_id,
        task_id,
        amount_total,
        amount_reserved,
        amount_consumed,
        amount_released,
        status,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ('97000000-0000-4000-8000-000000002002', '93000000-0000-4000-8000-000000002001', NULL, '97000000-0000-4000-8000-000000002001', NULL, 80, 0, 0, 80, 'released', 'episode_generation_task', '97000000-0000-4000-8000-000000002003', 'Image generation failed and refunded', '{"targetUserId":"93000000-0000-4000-8000-000000002003","targetMembershipId":"93000000-0000-4000-8000-000000002003"}'::jsonb, '93000000-0000-4000-8000-000000002001', '2026-06-05T07:11:00.000Z', '2026-06-05T07:12:00.000Z')
    `,
  );
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        team_member_id,
        reservation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES
        (
          '98000000-0000-4000-8000-000000002003',
          '93000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          '97000000-0000-4000-8000-000000002002',
          'reservation',
          80,
          -80,
          80,
          0,
          'credit_reservation',
          '97000000-0000-4000-8000-000000002002',
          'Image generation failed and refunded',
          '{"billingEvent":"reserved","taskId":"97000000-0000-4000-8000-000000002003"}'::jsonb,
          NULL,
          '2026-06-05T07:11:00.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000002004',
          '93000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          '97000000-0000-4000-8000-000000002002',
          'consume',
          80,
          0,
          -80,
          80,
          'credit_reservation_allocation',
          '99000000-0000-4000-8000-000000002004',
          'reservation allocation consumed',
          '{"billingEvent":"consumed"}'::jsonb,
          NULL,
          '2026-06-05T07:11:30.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000002005',
          '93000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          '97000000-0000-4000-8000-000000002002',
          'release',
          80,
          80,
          -80,
          0,
          'credit_reservation_allocation',
          '99000000-0000-4000-8000-000000002005',
          'reservation allocation released',
          '{"billingEvent":"released","failureCode":"task_timeout"}'::jsonb,
          NULL,
          '2026-06-05T07:12:00.000Z'
        )
    `,
  );
}

async function seedExplicitCreatorLedgerFixture(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `
      INSERT INTO users (id, email, phone_e164, display_name, status)
      VALUES ('4af8d99f-a74d-4a80-a610-3c0e725d420b', 'scoped@example.test', '13800109999', 'Scoped Creator', 'active')
    `,
  );


    await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES
        (
          '98000000-0000-4000-8000-000000003001',
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          'release',
          99,
          99,
          -99,
          0,
          'credit_reservation_allocation',
          '99000000-0000-4000-8000-000000003001',
          'Scoped release',
          '{"taskId":"11cac812-37b1-4d50-abb0-fc046d52259e"}'::jsonb,
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          '2026-06-05T08:01:00.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000003002',
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          'reservation',
          99,
          -99,
          99,
          0,
          'episode_generation_task',
          '99000000-0000-4000-8000-000000003002',
          'Scoped reservation',
          '{"taskId":"11cac812-37b1-4d50-abb0-fc046d52259e"}'::jsonb,
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          '2026-06-05T08:00:00.000Z'
        )
    `,
  );
}

async function seedPersonalCreatorMembershipFixture(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {


  }
