import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createCreditPackageService } from "../credit-package.service.ts";

const organizationId = "91000000-0000-4000-8000-000000020001";

test("credit package service archives a deleted package and hides it from default lists", async () => {
  const db = await createMigratedTestDb();
  const service = createCreditPackageService({ db });
  const now = new Date("2026-06-09T09:00:00.000Z");

  try {
    await seedOrganization(db);
    const created = await service.savePackage({
      code: `direct_recharge_${randomUUID().slice(0, 8)}`,
      displayName: "500 积分直充",
      subtitle: "仅增加积分",
      credits: 500,
      giftCredits: 0,
      amountMinor: 19900,
      currency: "CNY",
      badge: "推荐",
      sortOrder: 20,
      metadata: { kind: "direct_recharge" },
      status: "active",
      idempotencyKey: "credit-package-delete-create",
      idempotencyOrganizationId: organizationId,
      now,
    });
    assert.equal(created.status, 200);

    const deleted = await service.deletePackage({
      id: created.body.package.id,
      idempotencyKey: "credit-package-delete-archive",
      idempotencyOrganizationId: organizationId,
      now,
    });
    const nonArchived = await service.listPackages({ includeArchived: false, now });
    const withArchived = await service.listPackages({ includeArchived: true, now });

    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.package.id, created.body.package.id);
    assert.equal(deleted.body.package.status, "archived");
    assert.equal(nonArchived.data.packages.some((item) => item.id === created.body.package.id), false);
    assert.equal(withArchived.data.packages.some((item) => item.id === created.body.package.id), true);
  } finally {
    await db.close();
  }
});

test("credit package service validates delete ids before archiving", async () => {
  const db = await createMigratedTestDb();
  const service = createCreditPackageService({ db });

  try {
    await seedOrganization(db);
    const result = await service.deletePackage({
      id: "not-a-uuid",
      idempotencyKey: "credit-package-delete-invalid-id",
      idempotencyOrganizationId: organizationId,
      now: new Date("2026-06-09T09:00:00.000Z"),
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "invalid_credit_package_id");
  } finally {
    await db.close();
  }
});

async function seedOrganization(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Credit Package Test Org', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [organizationId],
  );
}
