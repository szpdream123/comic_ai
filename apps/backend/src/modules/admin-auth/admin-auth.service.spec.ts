import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { allAdminPermissions, createAdminAuthService } from "./admin-auth.service.ts";

test("admin auth grants risk export only through the super admin permission set", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminAuthService({
    db,
    organizationId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
  });

  try {
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Admin Auth Org', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Admin Auth Workspace',
          'active'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO admin_accounts (
          id,
          login_name,
          password_hash,
          display_name,
          status
        ) VALUES (
          '81000000-0000-4000-8000-000000009001',
          'export_guard_admin',
          'plain:Export-Guard-12345',
          'Export Guard Admin',
          'active'
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

    const login = await service.login({
      loginName: "export_guard_admin",
      password: "Export-Guard-12345",
      now: new Date("2026-06-05T02:00:00.000Z"),
    });

    assert.ok(allAdminPermissions.includes("risk.export"));
    assert.equal(login.status, 200);
    assert.equal("data" in login.body, true);
    if ("data" in login.body) {
      assert.equal(login.body.data.permissions.includes("risk.export"), true);
    }
  } finally {
    await db.close();
  }
});
