import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminUserService } from "./admin-user.service.ts";

test("admin user service collapses multiple memberships into one preferred user row", async () => {
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
        INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
        VALUES
          ('91000000-0000-4000-8000-000000001010', 'Primary Org', 'active', 6000, 20),
          ('91000000-0000-4000-8000-000000001011', 'Admin Org', 'active', 3200, 15),
          ('91000000-0000-4000-8000-000000001012', 'Secondary Org', 'active', 1800, 0)
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES
          ('92000000-0000-4000-8000-000000001010', '91000000-0000-4000-8000-000000001010', 'Primary Workspace', 'active'),
          ('92000000-0000-4000-8000-000000001011', '91000000-0000-4000-8000-000000001011', 'Admin Workspace', 'active'),
          ('92000000-0000-4000-8000-000000001012', '91000000-0000-4000-8000-000000001012', 'Secondary Workspace', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status, created_at)
        VALUES
          (
            '94000000-0000-4000-8000-000000001010',
            '91000000-0000-4000-8000-000000001010',
            '92000000-0000-4000-8000-000000001010',
            '93000000-0000-4000-8000-000000001010',
            'owner_admin',
            'active',
            '2026-06-01T08:00:00.000Z'
          ),
          (
            '94000000-0000-4000-8000-000000001011',
            '91000000-0000-4000-8000-000000001011',
            '92000000-0000-4000-8000-000000001011',
            '93000000-0000-4000-8000-000000001010',
            'sub_account',
            'active',
            '2026-06-10T08:00:00.000Z'
          ),
          (
            '94000000-0000-4000-8000-000000001012',
            '91000000-0000-4000-8000-000000001012',
            '92000000-0000-4000-8000-000000001012',
            '93000000-0000-4000-8000-000000001010',
            'sub_account',
            'disabled',
            '2026-06-15T08:00:00.000Z'
          )
      `,
    );
    await db.query(
      `
        INSERT INTO team_member_groups (id, organization_id, workspace_id, name, status, created_by_user_id)
        VALUES (
          '95000000-0000-4000-8000-000000001010',
          '91000000-0000-4000-8000-000000001011',
          '92000000-0000-4000-8000-000000001011',
          'Admin Group',
          'active',
          '93000000-0000-4000-8000-000000001010'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO team_member_profiles (
          id,
          organization_id,
          workspace_id,
          membership_id,
          team_account,
          display_name,
          business_role,
          member_group_id,
          credit_balance_cached,
          credit_used_cached,
          created_by_user_id
        )
        VALUES (
          '96000000-0000-4000-8000-000000001010',
          '91000000-0000-4000-8000-000000001011',
          '92000000-0000-4000-8000-000000001011',
          '94000000-0000-4000-8000-000000001011',
          'repeat-admin',
          'Repeat Admin',
          'group_admin',
          '95000000-0000-4000-8000-000000001010',
          900,
          50,
          '93000000-0000-4000-8000-000000001010'
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
      organizationId: "91000000-0000-4000-8000-000000001011",
      organizationName: "Admin Org",
      workspaceId: "92000000-0000-4000-8000-000000001011",
      membershipId: "94000000-0000-4000-8000-000000001011",
      membershipRole: "sub_account",
      accountType: "team_permission_account",
      teamRole: "group_admin",
      teamGroupId: "95000000-0000-4000-8000-000000001010",
      teamGroupName: "Admin Group",
      availableCredits: 900,
      reservedCredits: 0,
      frozenCredits: 0,
      displayCreditBalance: 900,
      usedCredits: 50,
      subaccountCount: 0,
    });
  } finally {
    await db.close();
  }
});

test("admin user list prefers the personal credit workspace over the shared project workspace", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001020', 'personal@example.test', '13800100020', 'Personal Wallet User', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
        VALUES
          ('10000000-0000-4000-8000-000000000001', 'Comic AI Studio', 'active', 155346, 1270),
          ('91000000-0000-4000-8000-000000001020', 'Personal Creator Workspace', 'active', 0, 0)
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES
          ('92000000-0000-4000-8000-000000001020', '10000000-0000-4000-8000-000000000001', 'Personal Project Workspace', 'active'),
          ('92000000-0000-4000-8000-000000001021', '91000000-0000-4000-8000-000000001020', 'Personal Workspace', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status, created_at)
        VALUES
          (
            '94000000-0000-4000-8000-000000001020',
            '10000000-0000-4000-8000-000000000001',
            '92000000-0000-4000-8000-000000001020',
            '93000000-0000-4000-8000-000000001020',
            'owner_admin',
            'active',
            '2026-06-17T04:09:26.831Z'
          ),
          (
            '94000000-0000-4000-8000-000000001021',
            '91000000-0000-4000-8000-000000001020',
            '92000000-0000-4000-8000-000000001021',
            '93000000-0000-4000-8000-000000001020',
            'owner_admin',
            'active',
            '2026-06-17T04:09:26.627Z'
          )
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
      organizationId: "91000000-0000-4000-8000-000000001020",
      organizationName: "Personal Creator Workspace",
      workspaceId: "92000000-0000-4000-8000-000000001021",
      membershipId: "94000000-0000-4000-8000-000000001021",
      membershipRole: "owner_admin",
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

test("admin user list does not expose shared organization credits as user credits", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES ('93000000-0000-4000-8000-000000001030', 'shared@example.test', '13800100030', 'Shared Credit User', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Comic AI Studio', 'active', 158506, 1270)
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES ('92000000-0000-4000-8000-000000001030', '10000000-0000-4000-8000-000000000001', 'Shared Workspace', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status, created_at)
        VALUES (
          '94000000-0000-4000-8000-000000001030',
          '10000000-0000-4000-8000-000000000001',
          '92000000-0000-4000-8000-000000001030',
          '93000000-0000-4000-8000-000000001030',
          'owner_admin',
          'active',
          '2026-06-17T04:09:26.831Z'
        )
      `,
    );

    const result = await service.listUsers({ keyword: "Shared Credit User", pageSize: 20 });
    const grantResponse = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000001030",
      amount: 100,
      reason: "Should not write shared wallet",
      idempotencyKey: "admin-credit-shared-wallet-blocked",
      actorAdminAccountId: "97000000-0000-4000-8000-000000001030",
      auditOrganizationId: "10000000-0000-4000-8000-000000000001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000001030",
      now: new Date("2026-06-24T08:00:00.000Z"),
    });

    assert.equal(result.data[0]?.availableCredits, 0);
    assert.equal(result.data[0]?.reservedCredits, 0);
    assert.equal(result.data[0]?.displayCreditBalance, 0);
    assert.equal(grantResponse.status, 409);
    assert.equal("error" in grantResponse.body && grantResponse.body.error.code, "credit_account_not_found");
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
          ('93000000-0000-4000-8000-000000001001', 'owner@example.test', '13800100001', 'Owner Admin', 'active'),
          ('93000000-0000-4000-8000-000000001002', 'lead@example.test', '13800100002', 'Storyboard Lead', 'active'),
          ('93000000-0000-4000-8000-000000001003', 'artist@example.test', '13800100003', 'Storyboard Artist', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
        VALUES ('91000000-0000-4000-8000-000000001001', 'Team Permission Org', 'active', 8000, 120)
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '92000000-0000-4000-8000-000000001001',
          '91000000-0000-4000-8000-000000001001',
          'Team Permission Workspace',
          'active'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
        VALUES
          (
            '94000000-0000-4000-8000-000000001001',
            '91000000-0000-4000-8000-000000001001',
            '92000000-0000-4000-8000-000000001001',
            '93000000-0000-4000-8000-000000001001',
            'owner_admin',
            'active'
          ),
          (
            '94000000-0000-4000-8000-000000001002',
            '91000000-0000-4000-8000-000000001001',
            '92000000-0000-4000-8000-000000001001',
            '93000000-0000-4000-8000-000000001002',
            'sub_account',
            'active'
          ),
          (
            '94000000-0000-4000-8000-000000001003',
            '91000000-0000-4000-8000-000000001001',
            '92000000-0000-4000-8000-000000001001',
            '93000000-0000-4000-8000-000000001003',
            'sub_account',
            'active'
          )
      `,
    );
    await db.query(
      `
        INSERT INTO team_member_groups (id, organization_id, workspace_id, name, status, created_by_user_id)
        VALUES (
          '95000000-0000-4000-8000-000000001001',
          '91000000-0000-4000-8000-000000001001',
          '92000000-0000-4000-8000-000000001001',
          'Storyboard Team',
          'active',
          '93000000-0000-4000-8000-000000001001'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO team_member_profiles (
          id,
          organization_id,
          workspace_id,
          membership_id,
          team_account,
          display_name,
          business_role,
          member_group_id,
          credit_balance_cached,
          credit_used_cached,
          created_by_user_id
        )
        VALUES
          (
            '96000000-0000-4000-8000-000000001001',
            '91000000-0000-4000-8000-000000001001',
            '92000000-0000-4000-8000-000000001001',
            '94000000-0000-4000-8000-000000001002',
            'storyboard-lead',
            'Storyboard Lead',
            'group_admin',
            '95000000-0000-4000-8000-000000001001',
            2100,
            300,
            '93000000-0000-4000-8000-000000001001'
          ),
          (
            '96000000-0000-4000-8000-000000001002',
            '91000000-0000-4000-8000-000000001001',
            '92000000-0000-4000-8000-000000001001',
            '94000000-0000-4000-8000-000000001003',
            'storyboard-artist',
            'Storyboard Artist',
            'animator',
            '95000000-0000-4000-8000-000000001001',
            680,
            90,
            '93000000-0000-4000-8000-000000001001'
          )
      `,
    );

    const result = await service.listTeamPermissionAccounts({ pageSize: 20 });

    assert.equal(result.meta.total, 1);
    assert.deepEqual(
      result.data.map((account) => ({
        displayName: account.displayName,
        accountType: account.accountType,
        teamRole: account.teamRole,
        teamGroupName: account.teamGroupName,
        subaccountCount: account.subaccountCount,
        availableCredits: account.availableCredits,
      })),
      [
        {
          displayName: "Storyboard Lead",
          accountType: "team_permission_account",
          teamRole: "group_admin",
          teamGroupName: "Storyboard Team",
          subaccountCount: 1,
          availableCredits: 2100,
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
      ["credit_reservation_allocation", "credit_reservation", "admin_manual_deduct", "admin_manual_grant"],
    );
    assert.deepEqual(
      result.data.map((entry) => entry.userId),
      [null, null, null, null],
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
      organizationAvailableCredits: 8000,
      organizationReservedCredits: 120,
      organizationFrozenCredits: 0,
      organizationFrozenAt: null,
      organizationFrozenUntil: null,
      memberAvailableCredits: 680,
      memberUsedCredits: 90,
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

test("admin user credit ledger can be scoped to a specific creator organization and workspace", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);
    await seedExplicitCreatorLedgerFixture(db);

    const result = await service.listUserCreditLedger({
      userId: "4af8d99f-a74d-4a80-a610-3c0e725d420b",
      organizationId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "caf8d99f-a74d-4a80-8610-3c0e725d420b",
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

test("admin user credit ledger includes user wallet entries from project organizations", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedExplicitCreatorLedgerFixture(db);
    await seedPersonalCreatorMembershipFixture(db);
    await db.query(
      `
        INSERT INTO credit_ledger_entries (
          id,
          organization_id,
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
        VALUES (
          '98000000-0000-4000-8000-000000003003',
          '10000000-0000-4000-8000-000000000001',
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          'consume',
          201,
          0,
          -201,
          201,
          'episode_generation_task',
          '99000000-0000-4000-8000-000000003003',
          'AI storyboard generation',
          '{"taskId":"11cac812-37b1-4d50-abb0-fc046d52259f"}'::jsonb,
          '4af8d99f-a74d-4a80-a610-3c0e725d420b',
          '2026-06-05T08:02:00.000Z'
        )
      `,
    );

    const result = await service.listUserCreditLedger({
      userId: "4af8d99f-a74d-4a80-a610-3c0e725d420b",
      organizationId: "20000000-0000-4000-8000-000000000001",
      workspaceId: "daf8d99f-a74d-4a80-8610-3c0e725d420b",
      pageSize: 10,
    });

    assert.equal(result.data[0]?.sourceType, "episode_generation_task");
    assert.equal(result.data[0]?.entryType, "consume");
    assert.equal(result.data[0]?.amount, 201);
    assert.equal(result.data[0]?.organizationId, "10000000-0000-4000-8000-000000000001");
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
        UPDATE organizations
        SET credit_balance_cached = 0,
            credit_reserved_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '91000000-0000-4000-8000-000000002001'
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
          organization_id,
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
        VALUES (
          '98000000-0000-4000-8000-000000002099',
          '91000000-0000-4000-8000-000000002001',
          'grant',
          30,
          30,
          0,
          0,
          'membership_gift',
          '99000000-0000-4000-8000-000000002099',
          'Membership gift credits',
          '{}'::jsonb,
          NULL,
          '2026-06-05T07:15:00.000Z'
        )
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
        UPDATE organizations
        SET credit_balance_cached = 0,
            credit_reserved_cached = 120,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '91000000-0000-4000-8000-000000002001'
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
        UPDATE organizations
        SET credit_balance_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '91000000-0000-4000-8000-000000002001'
      `,
    );

    const response = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 200,
      reason: "Admin support grant while frozen",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-frozen-owner-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
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
        INSERT INTO provider_requests (
          id,
          organization_id,
          workspace_id,
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
        VALUES (
          '99000000-0000-4000-8000-000000002101',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          'deepseek',
          'llm.chat.completions',
          'scope-model-log-1',
          'req-hash-scope-1',
          'text-gateway://scope-model-log-1',
          'payload-hash-scope-1',
          '{"model":"deepseek-chat"}'::jsonb,
          'succeeded',
          '2026-06-05T09:00:00.000Z',
          '{"usageSource":"provider"}'::jsonb,
          '93000000-0000-4000-8000-000000002003',
          '2026-06-05T09:00:00.000Z',
          '2026-06-05T09:00:10.000Z'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO user_model_request_logs (
          id,
          provider_request_id,
          organization_id,
          workspace_id,
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
        VALUES (
          '99000000-0000-4000-8000-000000002102',
          '99000000-0000-4000-8000-000000002101',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          'deepseek',
          'llm.chat.completions',
          'deepseek-chat',
          'deepseek-chat',
          'scope-model-log-1',
          'req-hash-scope-1',
          'payload-hash-scope-1',
          'storyboard prompt',
          '{"model":"deepseek-chat","max_tokens":384000}'::jsonb,
          '[user]\n角色模板 任小野',
          '{"characters":[{"name":"任小野"}]}',
          '{"prompt_tokens":101,"completion_tokens":55,"total_tokens":156}'::jsonb,
          '["stop"]'::jsonb,
          'succeeded',
          '2026-06-05T09:00:00.000Z',
          '2026-06-05T09:00:10.000Z',
          '2026-06-05T09:00:00.000Z',
          '2026-06-05T09:00:10.000Z'
        )
      `,
    );

    const result = await service.listUserModelRequestLogs({
      userId: "93000000-0000-4000-8000-000000002003",
      pageSize: 20,
    });

    assert.equal("status" in result, false);
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0]?.modelId, "deepseek-chat");
    assert.equal(result.data[0]?.providerRequestId, "99000000-0000-4000-8000-000000002101");
    assert.equal(result.data[0]?.organizationId, "91000000-0000-4000-8000-000000002001");
    assert.equal(result.data[0]?.workspaceId, "92000000-0000-4000-8000-000000002001");
    assert.equal(result.data[0]?.requestHash, "req-hash-scope-1");
    assert.equal(result.data[0]?.payloadHash, "payload-hash-scope-1");
    assert.match(result.data[0]?.requestText ?? "", /角色模板 任小野/);
    assert.match(result.data[0]?.responseText ?? "", /任小野/);
    assert.equal(result.data[0]?.responseUsage?.total_tokens, 156);
    assert.equal(result.meta.pageSize, 20);
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
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
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
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });
    const deductResponse = await service.deductUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 10,
      reason: "Correction without ticket",
      adjustmentScenario: "correction",
      idempotencyKey: "admin-credit-no-work-order-deduct",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
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
        UPDATE organizations
        SET credit_balance_cached = 0,
            credit_frozen_cached = 18800,
            credit_frozen_at = '2026-06-24T07:10:00.000Z',
            credit_frozen_until = '2027-06-24T07:10:00.000Z'
        WHERE id = '91000000-0000-4000-8000-000000002001'
      `,
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
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (
          '97000000-0000-4000-8000-000000002099',
          '91000000-0000-4000-8000-000000002001',
          'payment_order',
          '99000000-0000-4000-8000-000000002099',
          '98000000-0000-4000-8000-000000002001',
          18800,
          18800,
          0,
          0,
          0,
          'frozen',
          '2026-06-24T07:10:00.000Z',
          '2027-06-24T07:10:00.000Z',
          '{"kind":"direct_recharge"}'::jsonb,
          '2026-06-05T07:00:00.000Z',
          '2026-06-24T07:10:00.000Z'
        )
      `,
    );

    const response = await service.restoreFrozenUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      reason: "Admin force restore for support ticket",
      idempotencyKey: "admin-credit-force-restore-owner",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-24T08:00:00.000Z"),
    });
    const organization = await db.query<{
      credit_balance_cached: number;
      credit_frozen_cached: number;
      credit_frozen_at: Date | null;
      credit_frozen_until: Date | null;
    }>(
      `
        SELECT credit_balance_cached, credit_frozen_cached, credit_frozen_at, credit_frozen_until
        FROM organizations
        WHERE id = '91000000-0000-4000-8000-000000002001'
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
    assert.equal(Number(organization.rows[0]?.credit_balance_cached ?? 0), 18800);
    assert.equal(Number(organization.rows[0]?.credit_frozen_cached ?? 0), 0);
    assert.equal(organization.rows[0]?.credit_frozen_at, null);
    assert.equal(organization.rows[0]?.credit_frozen_until, null);
    assert.equal(lot.rows[0]?.status, "active");
    assert.equal(lot.rows[0]?.frozen_at, null);
    assert.equal(lot.rows[0]?.frozen_until, null);
    assert.deepEqual(audit.rows, [{ event_type: "admin.credit.frozen_restored", restored_amount: "18800" }]);
  } finally {
    await db.close();
  }
});

test("admin user service manages per-organization team subaccount limits", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await seedCreditScopeFixture(db);

    const defaultResponse = await service.getTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000002001",
    });
    assert.equal(defaultResponse.status, 200);
    assert.deepEqual(defaultResponse.body.data, {
      organizationId: "91000000-0000-4000-8000-000000002001",
      organizationName: "Personal Creator Workspace",
      defaultSeatLimit: 50,
      effectiveSeatLimit: 50,
      overrideSeatLimit: null,
      limitSource: "default",
      usedSeats: 2,
      remainingSeats: 48,
    });

    const overrideResponse = await service.updateTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000002001",
      seatLimit: 120,
      reason: "Enterprise team expansion",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:30:00.000Z"),
    });
    assert.equal(overrideResponse.status, 200);
    assert.equal(overrideResponse.body.data.effectiveSeatLimit, 120);
    assert.equal(overrideResponse.body.data.overrideSeatLimit, 120);
    assert.equal(overrideResponse.body.data.limitSource, "override");

    const lowerThanUsedResponse = await service.updateTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000002001",
      seatLimit: 1,
      reason: "Downgrade after contract change",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:35:00.000Z"),
    });
    assert.equal(lowerThanUsedResponse.status, 200);
    assert.equal(lowerThanUsedResponse.body.data.effectiveSeatLimit, 1);
    assert.equal(lowerThanUsedResponse.body.data.usedSeats, 2);
    assert.equal(lowerThanUsedResponse.body.data.remainingSeats, 0);

    const clearResponse = await service.updateTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000002001",
      seatLimit: null,
      reason: "Restore default plan",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:40:00.000Z"),
    });
    assert.equal(clearResponse.status, 200);
    assert.equal(clearResponse.body.data.effectiveSeatLimit, 50);
    assert.equal(clearResponse.body.data.overrideSeatLimit, null);
    assert.equal(clearResponse.body.data.limitSource, "default");

    const storedLimit = await db.query<{ count: string | number }>(
      "SELECT COUNT(*) AS count FROM team_plan_limits WHERE organization_id = '91000000-0000-4000-8000-000000002001'",
    );
    const auditEvents = await db.query<{ event_type: string }>(
      `
        SELECT event_type
        FROM audit_events
        WHERE event_type IN ('admin.team_plan_limit.updated', 'admin.team_plan_limit.cleared')
        ORDER BY created_at ASC
      `,
    );

    assert.equal(Number(storedLimit.rows[0]?.count ?? 0), 0);
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
      organizationId: "91000000-0000-4000-8000-000000002001",
      seatLimit: 20,
      reason: " ",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:45:00.000Z"),
    });
    const invalidLimit = await service.updateTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000002001",
      seatLimit: -1,
      reason: "Invalid negative limit",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:50:00.000Z"),
    });
    const unknownOrg = await service.getTeamPlanLimit({
      organizationId: "91000000-0000-4000-8000-000000009999",
    });

    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.body.error.code, "reason_required");
    assert.equal(invalidLimit.status, 400);
    assert.equal(invalidLimit.body.error.code, "invalid_team_seat_limit");
    assert.equal(unknownOrg.status, 404);
    assert.equal(unknownOrg.body.error.code, "admin_organization_not_found");
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
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:00:00.000Z"),
    });
    const grantResponse = await service.grantUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 30,
      reason: "Should not grant while disabled",
      adjustmentScenario: "compensation",
      idempotencyKey: "admin-credit-disabled-grant",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:05:00.000Z"),
    });
    const deductResponse = await service.deductUserCredits({
      userId: "93000000-0000-4000-8000-000000002001",
      amount: 10,
      reason: "Should not deduct while disabled",
      adjustmentScenario: "correction",
      idempotencyKey: "admin-credit-disabled-deduct",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:10:00.000Z"),
    });
    const profileResponse = await service.updateUserProfile({
      userId: "93000000-0000-4000-8000-000000002001",
      displayName: "Disabled Owner",
      reason: "Should not edit while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:15:00.000Z"),
    });
    const revealResponse = await service.revealUserContact({
      userId: "93000000-0000-4000-8000-000000002001",
      reason: "Should not reveal while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
    });
    const archiveResponse = await service.updateUserStatus({
      userId: "93000000-0000-4000-8000-000000002001",
      status: "archived",
      reason: "Should not archive while disabled",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
      now: new Date("2026-06-05T08:20:00.000Z"),
    });
    const enableResponse = await service.updateUserStatus({
      userId: "93000000-0000-4000-8000-000000002001",
      status: "active",
      reason: "Risk hold cleared",
      actorAdminAccountId: "97000000-0000-4000-8000-000000002001",
      auditOrganizationId: "91000000-0000-4000-8000-000000002001",
      auditWorkspaceId: "92000000-0000-4000-8000-000000002001",
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

async function seedCreditScopeFixture(db: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) {
  await db.query(
    `
      INSERT INTO users (id, email, phone_e164, display_name, status)
      VALUES
        ('93000000-0000-4000-8000-000000002001', 'owner-scope@example.test', '13800200001', 'Scope Owner', 'active'),
        ('93000000-0000-4000-8000-000000002002', 'lead-scope@example.test', '13800200002', 'Scope Lead', 'active'),
        ('93000000-0000-4000-8000-000000002003', 'artist-scope@example.test', '13800200003', 'Scope Artist', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
      VALUES ('91000000-0000-4000-8000-000000002001', 'Personal Creator Workspace', 'active', 8000, 120)
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '92000000-0000-4000-8000-000000002001',
        '91000000-0000-4000-8000-000000002001',
        'Credit Scope Workspace',
        'active'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES
        (
          '94000000-0000-4000-8000-000000002001',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002001',
          'owner_admin',
          'active'
        ),
        (
          '94000000-0000-4000-8000-000000002002',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002002',
          'sub_account',
          'active'
        ),
        (
          '94000000-0000-4000-8000-000000002003',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '93000000-0000-4000-8000-000000002003',
          'sub_account',
          'active'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO team_member_groups (id, organization_id, workspace_id, name, status, created_by_user_id)
      VALUES (
        '95000000-0000-4000-8000-000000002001',
        '91000000-0000-4000-8000-000000002001',
        '92000000-0000-4000-8000-000000002001',
        'Credit Scope Team',
        'active',
        '93000000-0000-4000-8000-000000002001'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO team_member_profiles (
        id,
        organization_id,
        workspace_id,
        membership_id,
        team_account,
        display_name,
        business_role,
        member_group_id,
        credit_balance_cached,
        credit_used_cached,
        created_by_user_id
      )
      VALUES
        (
          '96000000-0000-4000-8000-000000002001',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '94000000-0000-4000-8000-000000002002',
          'scope-lead',
          'Scope Lead',
          'group_admin',
          '95000000-0000-4000-8000-000000002001',
          2100,
          300,
          '93000000-0000-4000-8000-000000002001'
        ),
        (
          '96000000-0000-4000-8000-000000002002',
          '91000000-0000-4000-8000-000000002001',
          '92000000-0000-4000-8000-000000002001',
          '94000000-0000-4000-8000-000000002003',
          'scope-artist',
          'Scope Artist',
          'animator',
          '95000000-0000-4000-8000-000000002001',
          680,
          90,
          '93000000-0000-4000-8000-000000002001'
        )
    `,
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
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES
        (
          '98000000-0000-4000-8000-000000002001',
          '91000000-0000-4000-8000-000000002001',
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
          '91000000-0000-4000-8000-000000002001',
          'grant',
          50,
          50,
          0,
          0,
          'admin_manual_grant',
          '99000000-0000-4000-8000-000000002002',
          'Compensation',
          '{"targetUserId":"93000000-0000-4000-8000-000000002003","targetMembershipId":"94000000-0000-4000-8000-000000002003","workOrderNo":"CS-20260605-002","adjustmentScenario":"compensation"}'::jsonb,
          NULL,
          '2026-06-05T07:05:00.000Z'
        ),
        (
          '98000000-0000-4000-8000-000000002006',
          '91000000-0000-4000-8000-000000002001',
          'consume',
          10,
          0,
          -10,
          10,
          'admin_manual_deduct',
          '99000000-0000-4000-8000-000000002003',
          'Correction',
          '{"adjustmentScenario":"correction"}'::jsonb,
          '93000000-0000-4000-8000-000000002003',
          '2026-06-05T07:10:00.000Z'
        )
    `,
  );
  await db.query(
    `
      INSERT INTO workflows (
        id,
        organization_id,
        workspace_id,
        project_id,
        workflow_type,
        status,
        input_snapshot_json,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        '97000000-0000-4000-8000-000000002001',
        '91000000-0000-4000-8000-000000002001',
        '92000000-0000-4000-8000-000000002001',
        NULL,
        'image_generation',
        'failed',
        '{}'::jsonb,
        '93000000-0000-4000-8000-000000002003',
        '2026-06-05T07:11:00.000Z',
        '2026-06-05T07:12:00.000Z'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO credit_reservations (
        id,
        organization_id,
        workspace_id,
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
      VALUES (
        '97000000-0000-4000-8000-000000002002',
        '91000000-0000-4000-8000-000000002001',
        '92000000-0000-4000-8000-000000002001',
        NULL,
        '97000000-0000-4000-8000-000000002001',
        NULL,
        80,
        0,
        0,
        80,
        'released',
        'episode_generation_task',
        '97000000-0000-4000-8000-000000002003',
        'Image generation failed and refunded',
        '{"targetUserId":"93000000-0000-4000-8000-000000002003","targetMembershipId":"94000000-0000-4000-8000-000000002003"}'::jsonb,
        '93000000-0000-4000-8000-000000002003',
        '2026-06-05T07:11:00.000Z',
        '2026-06-05T07:12:00.000Z'
      )
    `,
  );
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        organization_id,
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
          '91000000-0000-4000-8000-000000002001',
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
          '91000000-0000-4000-8000-000000002001',
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
          '91000000-0000-4000-8000-000000002001',
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
      INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Comic AI Studio', 'active', 158506, 0)
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ('caf8d99f-a74d-4a80-8610-3c0e725d420b', '10000000-0000-4000-8000-000000000001', 'Scoped Workspace', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '5af8d99f-a74d-4a80-8610-3c0e725d420b',
        '10000000-0000-4000-8000-000000000001',
        'caf8d99f-a74d-4a80-8610-3c0e725d420b',
        '4af8d99f-a74d-4a80-a610-3c0e725d420b',
        'creator',
        'active'
      )
    `,
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
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES
        (
          '98000000-0000-4000-8000-000000003001',
          '10000000-0000-4000-8000-000000000001',
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
          '10000000-0000-4000-8000-000000000001',
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
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
      VALUES ('20000000-0000-4000-8000-000000000001', 'Personal Creator Workspace', 'active', 0, 0)
    `,
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ('daf8d99f-a74d-4a80-8610-3c0e725d420b', '20000000-0000-4000-8000-000000000001', 'Personal Credit Workspace', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES (
        '6af8d99f-a74d-4a80-8610-3c0e725d420b',
        '20000000-0000-4000-8000-000000000001',
        'daf8d99f-a74d-4a80-8610-3c0e725d420b',
        '4af8d99f-a74d-4a80-a610-3c0e725d420b',
        'owner_admin',
        'active'
      )
    `,
  );
}
