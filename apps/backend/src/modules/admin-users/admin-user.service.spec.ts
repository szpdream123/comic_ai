import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminUserService } from "./admin-user.service.ts";

test("admin user service lists only team permission accounts with subaccount totals", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminUserService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, email, phone_e164, display_name, status)
        VALUES
          ('93000000-0000-4000-8000-000000001001', 'owner@example.test', '+8613800100001', 'Owner Admin', 'active'),
          ('93000000-0000-4000-8000-000000001002', 'lead@example.test', '+8613800100002', 'Storyboard Lead', 'active'),
          ('93000000-0000-4000-8000-000000001003', 'artist@example.test', '+8613800100003', 'Storyboard Artist', 'active')
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
      memberAvailableCredits: 680,
      memberUsedCredits: 90,
      displayAvailableCredits: 680,
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
      organizationName: "Credit Scope Org",
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
        ('93000000-0000-4000-8000-000000002001', 'owner-scope@example.test', '+8613800200001', 'Scope Owner', 'active'),
        ('93000000-0000-4000-8000-000000002002', 'lead-scope@example.test', '+8613800200002', 'Scope Lead', 'active'),
        ('93000000-0000-4000-8000-000000002003', 'artist-scope@example.test', '+8613800200003', 'Scope Artist', 'active')
    `,
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached, credit_reserved_cached)
      VALUES ('91000000-0000-4000-8000-000000002001', 'Credit Scope Org', 'active', 8000, 120)
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
