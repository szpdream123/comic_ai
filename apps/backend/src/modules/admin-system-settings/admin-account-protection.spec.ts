import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { createMigratedTestDb, type TestDatabase } from "../shared/db/test-db.ts";
import { createAdminSystemSettingsService } from "./admin-system-settings.service.ts";

const firstProtectedId = "81000000-0000-4000-8000-000000000001";
const secondProtectedId = "81000000-0000-4000-8000-000000000002";
const ordinaryAdminId = "81000000-0000-4000-8000-000000000003";

describe("protected super admin account management", () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createAdminSettingsTestDb();
  });

  it("lists protected slots without changing ordinary administrator data", async (context) => {
    context.after(async () => db.close?.());
    const service = createAdminSystemSettingsService({ db });

    const result = await service.listAdminAccounts();
    const first = result.data.find((account) => account.id === firstProtectedId);
    const ordinary = result.data.find((account) => account.id === ordinaryAdminId);

    assert.equal(first?.superAdminSlot, 1);
    assert.equal(first?.isProtectedSuperAdmin, true);
    assert.equal(ordinary?.superAdminSlot, null);
    assert.equal(ordinary?.isProtectedSuperAdmin, false);
  });

  it("rejects creating or promoting another super admin but keeps ordinary creation", async (context) => {
    context.after(async () => db.close?.());
    const service = createAdminSystemSettingsService({ db });
    const common = {
      actorAdminAccountId: firstProtectedId,
      now: new Date("2026-07-11T00:00:00.000Z"),
    };

    const createSuper = await service.createAdminAccount({
      ...common,
      loginName: "third_super",
      password: "Third-Super-12345",
      displayName: "第三个超级管理员",
      roles: ["super_admin"],
      idempotencyKey: "create-third-super",
    });
    assert.equal(createSuper.status, 409);
    assert.equal(createSuper.body.error.code, "protected_super_admin_creation_forbidden");

    const overwriteProtected = await service.createAdminAccount({
      ...common,
      loginName: "admin",
      password: "Overwrite-Admin-12345",
      displayName: "试图覆盖超级管理员",
      roles: ["ops_admin"],
      idempotencyKey: "overwrite-protected-admin",
    });
    assert.equal(overwriteProtected.status, 409);
    assert.equal(overwriteProtected.body.error.code, "protected_super_admin_immutable");

    const promoteOrdinary = await service.updateAdminAccount({
      ...common,
      accountId: ordinaryAdminId,
      displayName: "普通管理员",
      roles: ["super_admin"],
      status: "active",
      reason: "attempt promotion",
      idempotencyKey: "promote-ordinary",
    });
    assert.equal(promoteOrdinary.status, 409);
    assert.equal(promoteOrdinary.body.error.code, "protected_super_admin_promotion_forbidden");

    const createOrdinary = await service.createAdminAccount({
      ...common,
      loginName: "future_ops_admin",
      password: "Future-Ops-12345",
      displayName: "未来运营管理员",
      roles: ["ops_admin"],
      idempotencyKey: "create-future-ops",
    });
    assert.equal(createOrdinary.status, 200);
    assert.deepEqual(createOrdinary.body.data.roles, ["ops_admin"]);
  });

  it("allows only self edits that preserve a protected identity", async (context) => {
    context.after(async () => db.close?.());
    const service = createAdminSystemSettingsService({ db });
    const common = {
      accountId: secondProtectedId,
      displayName: "第二超级管理员",
      roles: ["super_admin"],
      status: "active",
      reason: "profile maintenance",
      now: new Date("2026-07-11T00:00:00.000Z"),
    };

    const editOther = await service.updateAdminAccount({
      ...common,
      actorAdminAccountId: firstProtectedId,
      idempotencyKey: "edit-other-protected",
    });
    assert.equal(editOther.status, 403);
    assert.equal(editOther.body.error.code, "protected_super_admin_self_only");

    const disableSelf = await service.updateAdminAccount({
      ...common,
      actorAdminAccountId: secondProtectedId,
      status: "disabled",
      idempotencyKey: "disable-protected-self",
    });
    assert.equal(disableSelf.status, 409);
    assert.equal(disableSelf.body.error.code, "protected_super_admin_immutable");

    for (const [roles, idempotencyKey] of [
      [["ops_admin"], "remove-protected-role"],
      [["super_admin", "ops_admin"], "add-protected-role"],
    ] as const) {
      const changeRole = await service.updateAdminAccount({
        ...common,
        actorAdminAccountId: secondProtectedId,
        roles: [...roles],
        idempotencyKey,
      });
      assert.equal(changeRole.status, 409);
      assert.equal(changeRole.body.error.code, "protected_super_admin_immutable");
    }

    const keepProtected = await service.updateAdminAccount({
      ...common,
      actorAdminAccountId: secondProtectedId,
      idempotencyKey: "edit-protected-self",
    });
    assert.equal(keepProtected.status, 200);
    assert.deepEqual(keepProtected.body.data.roles, ["super_admin"]);
    assert.equal(keepProtected.body.data.status, "active");
  });

  it("requires protected accounts to use the authenticated self-password flow", async (context) => {
    context.after(async () => db.close?.());
    const service = createAdminSystemSettingsService({ db });

    const result = await service.resetAdminAccountPassword({
      accountId: secondProtectedId,
      newPassword: "Replacement-Password-12345",
      reason: "attempt protected reset",
      idempotencyKey: "reset-protected-password",
      actorAdminAccountId: firstProtectedId,
      now: new Date("2026-07-11T00:00:00.000Z"),
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, "protected_super_admin_self_only");

    const selfReset = await service.resetAdminAccountPassword({
      accountId: secondProtectedId,
      newPassword: "Replacement-Password-12345",
      reason: "attempt protected self reset",
      idempotencyKey: "reset-protected-password-self",
      actorAdminAccountId: secondProtectedId,
      now: new Date("2026-07-11T00:01:00.000Z"),
    });
    assert.equal(selfReset.status, 409);
    assert.equal(selfReset.body.error.code, "protected_super_admin_password_self_service_required");

    const stored = await db.query(
      "SELECT password_hash FROM admin_accounts WHERE id = $1",
      [secondProtectedId],
    );
    assert.equal(stored.rows[0].password_hash, "plain:admin-password");
  });
});

async function createAdminSettingsTestDb() {
  const db = await createMigratedTestDb();
  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status, super_admin_slot
      )
      VALUES
        ($1, 'codex_admin', 'plain:codex-password', 'Codex 管理员', 'active', 1),
        ($2, 'admin', 'plain:admin-password', '后台管理员', 'active', 2),
        ($3, 'ops_admin', 'plain:ops-password', '普通管理员', 'active', NULL)
    `,
    [firstProtectedId, secondProtectedId, ordinaryAdminId],
  );
  await db.query(
    `
      INSERT INTO admin_account_roles (id, admin_account_id, role_code)
      VALUES
        ('82000000-0000-4000-8000-000000000001', $1, 'super_admin'),
        ('82000000-0000-4000-8000-000000000002', $2, 'super_admin'),
        ('82000000-0000-4000-8000-000000000003', $3, 'ops_admin')
    `,
    [firstProtectedId, secondProtectedId, ordinaryAdminId],
  );
  return db;
}
