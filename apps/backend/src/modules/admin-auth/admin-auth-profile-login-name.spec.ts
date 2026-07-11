import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySqlMigration } from "../shared/db/migrations.ts";
import { createEmptyTestDb } from "../shared/db/test-db.ts";
import { createAdminAuthService } from "./admin-auth.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("admin self profile login name", () => {
  it("changes the current login name and rejects a duplicate", async () => {
    const db = await createAdminAuthTestDb();
    const service = createAdminAuthService({ db, organizationId, workspaceId });

    try {
      const login = await service.login({
        loginName: "codex_admin",
        password: "Current-Admin-12345",
        now: new Date("2026-07-11T00:00:00.000Z"),
      });
      assert.equal(login.status, 200);
      const sessionToken = sessionTokenFromCookies(login.cookies);

      const updated = await service.updateProfile({
        sessionToken,
        loginName: "renamed_codex_admin",
        displayName: "重命名管理员",
        idempotencyKey: "rename-current-admin",
        now: new Date("2026-07-11T00:01:00.000Z"),
      });
      assert.equal(updated.status, 200);
      assert.equal("data" in updated.body && updated.body.data.account.loginName, "renamed_codex_admin");

      const current = await service.me({
        sessionToken,
        now: new Date("2026-07-11T00:02:00.000Z"),
      });
      assert.equal(current.status, 200);
      assert.equal("data" in current.body && current.body.data.account.loginName, "renamed_codex_admin");

      const oldLogin = await service.login({
        loginName: "codex_admin",
        password: "Current-Admin-12345",
        now: new Date("2026-07-11T00:03:00.000Z"),
      });
      const newLogin = await service.login({
        loginName: "renamed_codex_admin",
        password: "Current-Admin-12345",
        now: new Date("2026-07-11T00:04:00.000Z"),
      });
      assert.equal(oldLogin.status, 401);
      assert.equal(newLogin.status, 200);

      const duplicate = await service.updateProfile({
        sessionToken,
        loginName: "admin",
        displayName: "重命名管理员",
        idempotencyKey: "duplicate-current-admin",
        now: new Date("2026-07-11T00:05:00.000Z"),
      });
      assert.equal(duplicate.status, 409);
      assert.equal("error" in duplicate.body && duplicate.body.error.code, "admin_login_name_conflict");
    } finally {
      await db.close?.();
    }
  });
});

function sessionTokenFromCookies(cookies: string[] | undefined) {
  const match = cookies?.[0]?.match(/admin_session=([^;]+)/);
  assert.ok(match?.[1]);
  return match[1];
}

async function createAdminAuthTestDb() {
  const db = await createEmptyTestDb();
  for (const migration of [
    "0001_foundation.sql",
    "0007_ai_model_configs.sql",
    "0010_admin_management_platform.sql",
    "0074_protected_super_admin_slots.sql",
  ]) {
    await applySqlMigration(db, process.cwd(), migration);
  }
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Admin Auth Test', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Admin Auth Workspace', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status, super_admin_slot
      )
      VALUES
        (
          '83000000-0000-4000-8000-000000000001',
          'codex_admin',
          'plain:Current-Admin-12345',
          'Codex 管理员',
          'active',
          1
        ),
        (
          '83000000-0000-4000-8000-000000000002',
          'admin',
          'plain:Second-Admin-12345',
          '后台管理员',
          'active',
          2
        )
    `,
  );
  await db.query(
    `
      INSERT INTO admin_account_roles (id, admin_account_id, role_code)
      VALUES
        (
          '84000000-0000-4000-8000-000000000001',
          '83000000-0000-4000-8000-000000000001',
          'super_admin'
        ),
        (
          '84000000-0000-4000-8000-000000000002',
          '83000000-0000-4000-8000-000000000002',
          'super_admin'
        )
    `,
  );
  return db;
}
