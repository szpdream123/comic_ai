import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySqlMigration } from "../../modules/shared/db/migrations.ts";
import { createEmptyTestDb } from "../../modules/shared/db/test-db.ts";
import { createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

describe("protected super admin HTTP boundaries", () => {
  it("derives the actor from the session and only permits self-service profile changes", async () => {
    const db = await createHttpTestDb();
    const server = createPhoneAuthDevServer({ db });

    try {
      await server.listen(0);
      const login = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginName: "codex_admin", password: "Codex-Admin-12345" }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie") ?? "";

      const editOther = await fetch(
        `${server.origin}/api/admin/admin-accounts/85000000-0000-4000-8000-000000000002`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "idempotency-key": "http-edit-other-protected",
            cookie,
          },
          body: JSON.stringify({
            displayName: "Other Admin",
            roles: ["super_admin"],
            status: "active",
            reason: "attempt cross-account edit",
          }),
        },
      );
      assert.equal(editOther.status, 403);
      assert.equal((await editOther.json()).error.code, "protected_super_admin_self_only");

      const overwriteOther = await fetch(`${server.origin}/api/admin/admin-accounts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-overwrite-other-protected",
          cookie,
        },
        body: JSON.stringify({
          loginName: "admin",
          password: "Overwrite-Admin-12345",
          displayName: "Overwrite Other Admin",
          roles: ["ops_admin"],
        }),
      });
      assert.equal(overwriteOther.status, 409);
      assert.equal((await overwriteOther.json()).error.code, "protected_super_admin_immutable");

      const updateSelf = await fetch(`${server.origin}/api/admin/auth/profile`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-update-protected-self",
          cookie,
        },
        body: JSON.stringify({ loginName: "renamed_codex_admin", displayName: "Renamed Admin" }),
      });
      assert.equal(updateSelf.status, 200);
      assert.equal((await updateSelf.json()).data.account.loginName, "renamed_codex_admin");

      const me = await fetch(`${server.origin}/api/admin/auth/me`, { headers: { cookie } });
      assert.equal(me.status, 200);
      assert.equal((await me.json()).data.account.loginName, "renamed_codex_admin");

      const historicalLogin = await fetch(`${server.origin}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          loginName: "historical_admin3",
          password: "Historical-Admin-12345",
        }),
      });
      assert.equal(historicalLogin.status, 200);
      assert.deepEqual((await historicalLogin.json()).data.roles, []);
    } finally {
      await server.close();
    }
  });
});

async function createHttpTestDb() {
  const db = await createEmptyTestDb();
  for (const migration of [
    "0001_foundation.sql",
    "0007_ai_model_configs.sql",
    "0010_admin_management_platform.sql",
    "0074_protected_super_admin_slots.sql",
  ]) {
    await applySqlMigration(db, process.cwd(), migration);
  }
  await db.query(`
    INSERT INTO organizations (id, name, status)
    VALUES ('10000000-0000-4000-8000-000000000001', 'HTTP Admin Test', 'active')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO workspaces (id, organization_id, name, status)
    VALUES (
      '20000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'HTTP Admin Workspace',
      'active'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO admin_accounts (
      id, login_name, password_hash, display_name, status, super_admin_slot
    ) VALUES
      (
        '85000000-0000-4000-8000-000000000001', 'codex_admin',
        'plain:Codex-Admin-12345', 'Codex Admin', 'active', 1
      ),
      (
        '85000000-0000-4000-8000-000000000002', 'admin',
        'plain:Second-Admin-12345', 'Second Admin', 'active', 2
      ),
      (
        '85000000-0000-4000-8000-000000000003', 'historical_admin3',
        'plain:Historical-Admin-12345', 'Historical Admin 3', 'active', 3
      );

    INSERT INTO admin_account_roles (id, admin_account_id, role_code) VALUES
      ('86000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', 'super_admin'),
      ('86000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000002', 'super_admin'),
      ('86000000-0000-4000-8000-000000000003', '85000000-0000-4000-8000-000000000003', 'super_admin');
  `);
  return db;
}
