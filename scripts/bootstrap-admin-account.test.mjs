import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdminAuthService } from "../apps/backend/src/modules/admin-auth/admin-auth.service.ts";
import { createMigratedTestDb } from "../apps/backend/src/modules/shared/db/test-db.ts";
import { bootstrapAdminAccount } from "./bootstrap-admin-account.mjs";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("bootstrap-admin-account script", () => {
  it("uses admin/admin123 as the default bootstrap account when env values are missing", async () => {
    const db = await createMigratedTestDb();

    try {
      const result = await bootstrapAdminAccount({
        db,
        now: new Date("2026-06-04T00:00:00.000Z"),
      });

      const account = await db.query(
        `
          SELECT login_name, display_name, status
          FROM admin_accounts
          WHERE login_name = 'admin'
        `,
      );
      const roles = await db.query(
        `
          SELECT role_code
          FROM admin_account_roles
          WHERE admin_account_id = $1
        `,
        [result.accountId],
      );

      const auth = createAdminAuthService({ db, organizationId, workspaceId });
      const login = await auth.login({
        loginName: "admin",
        password: "admin123",
        now: new Date("2026-06-04T00:01:00.000Z"),
      });

      assert.equal(result.created, true);
      assert.equal(result.loginName, "admin");
      assert.deepEqual(account.rows, [
        {
          login_name: "admin",
          display_name: "后台管理员",
          status: "active",
        },
      ]);
      assert.deepEqual(roles.rows.map((row) => row.role_code), ["super_admin"]);
      assert.equal(login.status, 200);
    } finally {
      await db.close?.();
    }
  });

  it("creates or updates a super admin account without duplicating rows", async () => {
    const db = await createMigratedTestDb();

    try {
      const first = await bootstrapAdminAccount({
        db,
        loginName: "root_admin",
        password: "Root-Admin-12345",
        displayName: "Root Admin",
        roles: ["super_admin"],
        status: "active",
        remark: "initial bootstrap",
        now: new Date("2026-06-04T00:00:00.000Z"),
      });
      const second = await bootstrapAdminAccount({
        db,
        loginName: "root_admin",
        password: "Root-Admin-67890",
        displayName: "Root Admin Updated",
        roles: ["super_admin", "ops_admin"],
        status: "active",
        remark: "rotate bootstrap password",
        now: new Date("2026-06-04T00:01:00.000Z"),
      });

      const accounts = await db.query(
        `
          SELECT login_name, display_name, status, remark
          FROM admin_accounts
          WHERE login_name = 'root_admin'
        `,
      );
      const roles = await db.query(
        `
          SELECT role_code
          FROM admin_account_roles
          WHERE admin_account_id = $1
          ORDER BY role_code ASC
        `,
        [first.accountId],
      );
      const audit = await db.query(
        `
          SELECT event_type, reason
          FROM audit_events
          WHERE event_type IN ('admin.account.bootstrapped', 'admin.account.bootstrap_updated')
          ORDER BY created_at ASC, event_type ASC
        `,
      );

      const auth = createAdminAuthService({ db, organizationId, workspaceId });
      const oldPasswordLogin = await auth.login({
        loginName: "root_admin",
        password: "Root-Admin-12345",
        now: new Date("2026-06-04T00:02:00.000Z"),
      });
      const newPasswordLogin = await auth.login({
        loginName: "root_admin",
        password: "Root-Admin-67890",
        now: new Date("2026-06-04T00:03:00.000Z"),
      });

      assert.equal(first.created, true);
      assert.equal(second.created, false);
      assert.equal(second.accountId, first.accountId);
      assert.deepEqual(accounts.rows, [
        {
          login_name: "root_admin",
          display_name: "Root Admin Updated",
          status: "active",
          remark: "rotate bootstrap password",
        },
      ]);
      assert.deepEqual(roles.rows.map((row) => row.role_code), ["ops_admin", "super_admin"]);
      assert.equal(oldPasswordLogin.status, 401);
      assert.equal(newPasswordLogin.status, 200);
      assert.deepEqual(audit.rows, [
        { event_type: "admin.account.bootstrapped", reason: "initial bootstrap" },
        { event_type: "admin.account.bootstrap_updated", reason: "rotate bootstrap password" },
      ]);
    } finally {
      await db.close?.();
    }
  });
});
