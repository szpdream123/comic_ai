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
