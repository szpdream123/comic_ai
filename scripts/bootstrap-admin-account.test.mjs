import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdminAuthService } from "../apps/backend/src/modules/admin-auth/admin-auth.service.ts";
import { applySqlMigration } from "../apps/backend/src/modules/shared/db/migrations.ts";
import { createEmptyTestDb } from "../apps/backend/src/modules/shared/db/test-db.ts";
import {
  bootstrapAdminAccount,
  bootstrapProtectedSuperAdmins,
} from "./bootstrap-admin-account.mjs";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("bootstrap-admin-account script", () => {
  it("creates the default admin login when an explicit bootstrap password is provided", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      const result = await bootstrapAdminAccount({
        db,
        password: "Admin-Bootstrap-123",
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
        password: "Admin-Bootstrap-123",
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
    const db = await createAdminBootstrapTestDb();

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

  it("reconciles two protected super admins and removes only the approved unused account", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      await db.query(
        `
          INSERT INTO admin_accounts (
            id, login_name, password_hash, display_name, status, created_at, updated_at
          )
          VALUES (
            '73000000-0000-4000-8000-000000000003',
            'accept_admin_0624120228',
            'plain:acceptance-password',
            '验收管理员',
            'active',
            now(),
            now()
          )
        `,
      );
      await db.query(
        `
          INSERT INTO admin_account_roles (id, admin_account_id, role_code)
          VALUES (
            '74000000-0000-4000-8000-000000000003',
            '73000000-0000-4000-8000-000000000003',
            'super_admin'
          )
        `,
      );
      await db.query(
        `
          INSERT INTO admin_auth_sessions (
            id, admin_account_id, session_token_hash, expires_at
          )
          VALUES (
            '75000000-0000-4000-8000-000000000003',
            '73000000-0000-4000-8000-000000000003',
            'acceptance-session',
            now() + interval '1 day'
          )
        `,
      );

      const first = await bootstrapProtectedSuperAdmins({
        db,
        accounts: [
          {
            slot: 1,
            loginName: "codex_admin",
            displayName: "Codex 管理员",
            password: "First-Admin-12345",
          },
          {
            slot: 2,
            loginName: "admin",
            displayName: "后台管理员",
            password: "Second-Admin-12345",
          },
        ],
        cleanupLoginNames: ["accept_admin_0624120228"],
        now: new Date("2026-07-11T00:00:00.000Z"),
      });

      assert.deepEqual(first.accounts.map((account) => account.slot), [1, 2]);
      assert.equal(
        (await db.query("SELECT count(*)::int AS count FROM admin_accounts WHERE super_admin_slot IS NOT NULL")).rows[0].count,
        2,
      );
      assert.equal(
        (await db.query("SELECT count(*)::int AS count FROM admin_accounts WHERE login_name = 'accept_admin_0624120228'")).rows[0].count,
        0,
      );

      await db.query(
        `
          UPDATE admin_accounts
          SET login_name = 'renamed_codex_admin',
              display_name = '后台修改后的名称',
              password_hash = 'plain:changed-in-admin-ui'
          WHERE super_admin_slot = 1
        `,
      );
      await bootstrapProtectedSuperAdmins({
        db,
        accounts: [
          { slot: 1, loginName: "codex_admin", displayName: "Codex 管理员" },
          { slot: 2, loginName: "admin", displayName: "后台管理员" },
        ],
        cleanupLoginNames: [],
        now: new Date("2026-07-11T00:01:00.000Z"),
      });

      const preserved = await db.query(
        `
          SELECT login_name, display_name, password_hash, status
          FROM admin_accounts
          WHERE super_admin_slot = 1
        `,
      );
      const roles = await db.query(
        `
          SELECT r.role_code
          FROM admin_account_roles r
          JOIN admin_accounts a ON a.id = r.admin_account_id
          WHERE a.super_admin_slot = 1
          ORDER BY r.role_code
        `,
      );
      assert.deepEqual(preserved.rows, [{
        login_name: "renamed_codex_admin",
        display_name: "后台修改后的名称",
        password_hash: "plain:changed-in-admin-ui",
        status: "active",
      }]);
      assert.deepEqual(roles.rows, [{ role_code: "super_admin" }]);
    } finally {
      await db.close?.();
    }
  });

  it("requires a password when a protected slot must create a new account", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      await assert.rejects(
        bootstrapProtectedSuperAdmins({
          db,
          accounts: [{ slot: 1, loginName: "new_admin", displayName: "新管理员" }],
          now: new Date("2026-07-11T00:00:00.000Z"),
        }),
        /ADMIN_SUPER_1_PASSWORD is required for a new protected account/,
      );
    } finally {
      await db.close?.();
    }
  });
});

async function createAdminBootstrapTestDb() {
  const db = await createEmptyTestDb();
  for (const migration of [
    "0001_foundation.sql",
    "0007_ai_model_configs.sql",
    "0010_admin_management_platform.sql",
    "0074_protected_super_admin_slots.sql",
  ]) {
    await applySqlMigration(db, process.cwd(), migration);
  }
  return db;
}
