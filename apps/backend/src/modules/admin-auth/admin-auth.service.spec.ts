import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import {
  allAdminPermissions,
  createAdminAuthService,
  permissionsForRoles,
} from "./admin-auth.service.ts";

test("admin auth grants membership plan write to finance admins without system settings write", () => {
  const permissions = permissionsForRoles(["finance_admin"]);

  assert.ok(allAdminPermissions.includes("membership.plan.write"));
  assert.equal(permissions.includes("membership.plan.write"), true);
  assert.equal(permissions.includes("settings.write"), false);
});

test("admin auth grants risk export only through the super admin permission set", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminAuthService({
    db,
  });

  try {


    await db.query(
      `
        INSERT INTO admin_accounts (
          id,
          login_name,
          password_hash,
          display_name,
          status,
          super_admin_slot
        ) VALUES (
          '81000000-0000-4000-8000-000000009001',
          'export_guard_admin',
          'plain:Export-Guard-12345',
          'Export Guard Admin',
          'active',
          1
        )
      `,
    );
    await db.query(
      `
        INSERT INTO admin_account_roles (
          id,
          admin_account_id,
          role_code
        ) VALUES (
          '82000000-0000-4000-8000-000000009001',
          '81000000-0000-4000-8000-000000009001',
          'super_admin'
        )
      `,
    );

    const failedLogin = await service.login({
      loginName: "export_guard_admin",
      password: "wrong-password",
      now: new Date("2026-06-05T01:59:00.000Z"),
    });
    assert.equal(failedLogin.status, 401);
    const failedAudit = await db.query<{
      actor_user_id: string | null;
      actor_admin_account_id: string | null;
    }>(
      `
        SELECT actor_user_id, actor_admin_account_id
        FROM audit_events
        WHERE event_type = 'admin.auth.login_failed'
          AND target_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      ["81000000-0000-4000-8000-000000009001"],
    );
    assert.deepEqual(failedAudit.rows[0], {
      actor_user_id: null,
      actor_admin_account_id: null,
    });

    const login = await service.login({
      loginName: "export_guard_admin",
      password: "Export-Guard-12345",
      now: new Date("2026-06-05T02:00:00.000Z"),
    });

    assert.ok(allAdminPermissions.includes("risk.export"));
    assert.equal(login.status, 200);
    assert.equal("data" in login.body, true);
    const successAudit = await db.query<{
      actor_user_id: string | null;
      actor_admin_account_id: string | null;
    }>(
      `
        SELECT actor_user_id, actor_admin_account_id
        FROM audit_events
        WHERE event_type = 'admin.auth.login_succeeded'
          AND target_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      ["81000000-0000-4000-8000-000000009001"],
    );
    assert.deepEqual(successAudit.rows[0], {
      actor_user_id: null,
      actor_admin_account_id: "81000000-0000-4000-8000-000000009001",
    });
    if ("data" in login.body) {
      assert.equal(login.body.data.permissions.includes("risk.export"), true);
    }
  } finally {
    await db.close();
  }
});
