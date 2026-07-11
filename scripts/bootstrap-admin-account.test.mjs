import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAdminAuthService } from "../apps/backend/src/modules/admin-auth/admin-auth.service.ts";
import { applySqlMigration } from "../apps/backend/src/modules/shared/db/migrations.ts";
import { runWithDatabaseContext } from "../apps/backend/src/modules/shared/db/dev-db.ts";
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
      assert.deepEqual(roles.rows.map((row) => row.role_code), ["ops_admin"]);
      assert.equal(login.status, 200);
    } finally {
      await db.close?.();
    }
  });

  it("creates or updates an ordinary admin account without duplicating rows", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      const first = await bootstrapAdminAccount({
        db,
        loginName: "root_admin",
        password: "Root-Admin-12345",
        displayName: "Root Admin",
        roles: ["ops_admin"],
        status: "active",
        remark: "initial bootstrap",
        now: new Date("2026-06-04T00:00:00.000Z"),
      });
      const second = await bootstrapAdminAccount({
        db,
        loginName: "root_admin",
        password: "Root-Admin-67890",
        displayName: "Root Admin Updated",
        roles: ["ops_admin", "audit_viewer"],
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
      assert.deepEqual(roles.rows.map((row) => row.role_code), ["audit_viewer", "ops_admin"]);
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

  it("rejects super-admin roles through the legacy bootstrap boundary", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      await assert.rejects(
        bootstrapAdminAccount({
          db,
          loginName: "unprotected_super",
          password: "Unprotected-Super-12345",
          displayName: "Unprotected Super",
          roles: ["super_admin"],
          now: new Date("2026-07-11T00:00:00.000Z"),
        }),
        /legacy bootstrap cannot create or update super_admin roles/,
      );
      const accounts = await db.query(
        "SELECT count(*)::int AS count FROM admin_accounts WHERE login_name = 'unprotected_super'",
      );
      assert.equal(accounts.rows[0].count, 0);
    } finally {
      await db.close?.();
    }
  });

  it("rolls back an ordinary bootstrap when role persistence fails", async () => {
    const db = await createAdminBootstrapTestDb();
    const failingDb = {
      query(sql, params) {
        if (String(sql).includes("INSERT INTO admin_account_roles")) {
          throw new Error("injected role persistence failure");
        }
        return db.query(sql, params);
      },
    };

    try {
      await assert.rejects(
        bootstrapAdminAccount({
          db: failingDb,
          loginName: "rollback_admin",
          password: "Rollback-Admin-12345",
          displayName: "Rollback Admin",
          roles: ["ops_admin"],
          now: new Date("2026-07-11T00:00:00.000Z"),
        }),
        /injected role persistence failure/,
      );
      const accounts = await db.query(
        "SELECT count(*)::int AS count FROM admin_accounts WHERE login_name = 'rollback_admin'",
      );
      assert.equal(accounts.rows[0].count, 0);
    } finally {
      await db.close?.();
    }
  });

  it("cannot mutate a protected account through the legacy bootstrap boundary", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      await bootstrapProtectedSuperAdmins({
        db,
        accounts: [
          {
            slot: 1,
            loginName: "admin1",
            displayName: "First Admin",
            password: "Protected-Admin-One-12345",
          },
          {
            slot: 2,
            loginName: "admin2",
            displayName: "Second Admin",
            password: "Protected-Admin-Two-12345",
          },
        ],
        now: new Date("2026-07-11T00:00:00.000Z"),
      });
      const before = await db.query(`
        SELECT password_hash, display_name, status
        FROM admin_accounts
        WHERE super_admin_slot = 1
      `);

      await assert.rejects(
        bootstrapAdminAccount({
          db,
          loginName: "admin1",
          password: "Legacy-Overwrite-12345",
          displayName: "Overwritten",
          roles: ["ops_admin"],
          status: "disabled",
          now: new Date("2026-07-11T00:01:00.000Z"),
        }),
        /legacy bootstrap cannot modify a protected super admin/,
      );

      const after = await db.query(`
        SELECT a.password_hash, a.display_name, a.status,
               array_agg(r.role_code ORDER BY r.role_code) AS roles
        FROM admin_accounts a
        JOIN admin_account_roles r ON r.admin_account_id = a.id
        WHERE a.super_admin_slot = 1
        GROUP BY a.id
      `);
      assert.deepEqual(after.rows, [{
        ...before.rows[0],
        roles: ["super_admin"],
      }]);
    } finally {
      await db.close?.();
    }
  });

  it("requires exactly the current protected slots 1 and 2", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      for (const accounts of [
        [
          { slot: 1, loginName: "admin1", displayName: "First", password: "First-Admin-12345" },
          { slot: 2, loginName: "admin2", displayName: "Second", password: "Second-Admin-12345" },
          { slot: 3, loginName: "admin3", displayName: "Third", password: "Third-Admin-12345" },
        ],
        [
          { slot: 1, loginName: "admin1", displayName: "First", password: "First-Admin-12345" },
          { slot: 3, loginName: "admin3", displayName: "Third", password: "Third-Admin-12345" },
        ],
      ]) {
        await assert.rejects(
          bootstrapProtectedSuperAdmins({
            db,
            accounts,
            now: new Date("2026-07-11T00:00:00.000Z"),
          }),
          /protected super admin bootstrap requires exactly slots 1 and 2/,
        );
      }
      const accounts = await db.query(
        "SELECT count(*)::int AS count FROM admin_accounts WHERE super_admin_slot IS NOT NULL",
      );
      assert.equal(accounts.rows[0].count, 0);
    } finally {
      await db.close?.();
    }
  });

  it("refuses to reconcile while a historical unsupported protected slot exists", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
      await db.query(`
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status, super_admin_slot
        ) VALUES (
          '73000000-0000-4000-8000-000000000003',
          'historical_admin3',
          'plain:Historical-Admin-12345',
          'Historical Admin 3',
          'active',
          3
        )
      `);
      await assert.rejects(
        bootstrapProtectedSuperAdmins({
          db,
          accounts: [
            { slot: 1, loginName: "admin1", displayName: "First", password: "First-Admin-12345" },
            { slot: 2, loginName: "admin2", displayName: "Second", password: "Second-Admin-12345" },
          ],
          now: new Date("2026-07-11T00:00:00.000Z"),
        }),
        /unsupported protected super admin slot 3 exists/,
      );
      const accounts = await db.query(
        "SELECT super_admin_slot FROM admin_accounts ORDER BY super_admin_slot",
      );
      assert.deepEqual(accounts.rows, [{ super_admin_slot: 3 }]);
    } finally {
      await db.close?.();
    }
  });

  it("reconciles two protected super admins and preserves self-managed fields", async () => {
    const db = await createAdminBootstrapTestDb();

    try {
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
        now: new Date("2026-07-11T00:00:00.000Z"),
      });

      assert.deepEqual(first.accounts.map((account) => account.slot), [1, 2]);
      assert.equal(
        (await db.query("SELECT count(*)::int AS count FROM admin_accounts WHERE super_admin_slot IS NOT NULL")).rows[0].count,
        2,
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
          accounts: [
            { slot: 1, loginName: "new_admin", displayName: "新管理员" },
            {
              slot: 2,
              loginName: "second_admin",
              displayName: "第二管理员",
              password: "Second-Admin-12345",
            },
          ],
          now: new Date("2026-07-11T00:00:00.000Z"),
        }),
        /ADMIN_SUPER_1_PASSWORD is required for a new protected account/,
      );
    } finally {
      await db.close?.();
    }
  });

  it("serializes concurrent first-time protected account bootstraps", async () => {
    const db = await createAdminBootstrapTestDb();
    await db.query(`
      INSERT INTO organizations (id, name, status)
      VALUES ('10000000-0000-4000-8000-000000000001', 'Existing Admin Scope', 'active')
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001',
        'Existing Admin Workspace',
        'active'
      )
      ON CONFLICT (id) DO NOTHING;
    `);
    const input = {
      accounts: [
        {
          slot: 1,
          loginName: "admin1",
          displayName: "First Admin",
          password: "Concurrent-Admin-One-12345",
        },
        {
          slot: 2,
          loginName: "admin2",
          displayName: "Second Admin",
          password: "Concurrent-Admin-Two-12345",
        },
      ],
      now: new Date("2026-07-11T00:00:00.000Z"),
    };
    const delayedFirstInsertDb = {
      async query(sql, params) {
        if (/INSERT INTO admin_accounts\s*\(/.test(sql)) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        return db.query(sql, params);
      },
    };

    try {
      const results = await Promise.all([
        runWithDatabaseContext(() => bootstrapProtectedSuperAdmins({ ...input, db: delayedFirstInsertDb })),
        runWithDatabaseContext(() => bootstrapProtectedSuperAdmins({ ...input, db })),
      ]);
      assert.equal(results.length, 2);

      const accounts = await db.query(`
        SELECT a.super_admin_slot, a.login_name, array_agg(r.role_code ORDER BY r.role_code) AS roles
        FROM admin_accounts a
        JOIN admin_account_roles r ON r.admin_account_id = a.id
        WHERE a.super_admin_slot IS NOT NULL
        GROUP BY a.id
        ORDER BY a.super_admin_slot
      `);
      assert.deepEqual(accounts.rows, [
        { super_admin_slot: 1, login_name: "admin1", roles: ["super_admin"] },
        { super_admin_slot: 2, login_name: "admin2", roles: ["super_admin"] },
      ]);
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
