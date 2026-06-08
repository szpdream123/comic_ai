import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createMembershipPlanService } from "../membership-plan.service.ts";

const adminAccountId = "81000000-0000-4000-8000-000000010001";
const organizationId = "91000000-0000-4000-8000-000000010001";

test("membership plan service creates, updates, lists, archives, and records revisions", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });
  const now = new Date("2026-06-09T09:00:00.000Z");

  try {
    await seedAdminAccount(db);

    const experience = await service.savePlan({
      code: `experience_7_days_${randomUUID().slice(0, 8)}`,
      displayName: "Experience 7 Days",
      tier: "experience",
      periodUnit: "day",
      periodCount: 7,
      amountMinor: 9900,
      currency: "CNY",
      giftCredits: 0,
      seatLimit: null,
      entitlements: ["priority_generation"],
      priorityRules: { modelFamilies: ["seedance-lite"] },
      displayMetadata: { sortOrder: 30 },
      status: "active",
      validFrom: null,
      validUntil: null,
      actorAdminAccountId: adminAccountId,
      reason: "Create experience plan",
      idempotencyKey: "membership-plan-experience-create",
      idempotencyOrganizationId: organizationId,
      now,
    });
    const starter = await service.savePlan({
      code: `professional_starter_${randomUUID().slice(0, 8)}`,
      displayName: "Professional Starter",
      tier: "professional",
      periodUnit: "month",
      periodCount: 1,
      amountMinor: 12900,
      currency: "CNY",
      giftCredits: 25,
      seatLimit: 10,
      entitlements: ["team_member_management"],
      priorityRules: { modelFamilies: ["seedream"] },
      displayMetadata: { sortOrder: 20 },
      status: "active",
      actorAdminAccountId: adminAccountId,
      reason: "Create starter plan",
      idempotencyKey: "membership-plan-starter-create",
      idempotencyOrganizationId: organizationId,
      now,
    });
    const monthly = await service.savePlan({
      code: `professional_monthly_${randomUUID().slice(0, 8)}`,
      displayName: "Professional Monthly",
      tier: "professional",
      periodUnit: "month",
      periodCount: 1,
      amountMinor: 19900,
      currency: "CNY",
      giftCredits: 100,
      seatLimit: 50,
      entitlements: ["team_member_management", "priority_generation"],
      priorityRules: { modelFamilies: ["seedance"] },
      displayMetadata: { sortOrder: 20 },
      status: "active",
      actorAdminAccountId: adminAccountId,
      reason: "Create monthly plan",
      idempotencyKey: "membership-plan-monthly-create",
      idempotencyOrganizationId: organizationId,
      now,
    });

    assert.equal(experience.status, 200);
    assert.equal(experience.body.plan.displayName, "Experience 7 Days");
    assert.equal(experience.body.plan.giftCredits, 0);
    assert.equal(experience.body.plan.seatLimit, 1);
    assert.deepEqual(experience.body.plan.entitlements, ["priority_generation"]);
    assert.deepEqual(experience.body.plan.priorityRules, { modelFamilies: ["seedance-lite"] });
    assert.deepEqual(experience.body.plan.displayMetadata, { sortOrder: 30 });

    const archivedExperience = await service.savePlan({
      id: experience.body.plan.id,
      code: experience.body.plan.code,
      displayName: "Experience 7 Days Archived",
      tier: "experience",
      periodUnit: "day",
      periodCount: 7,
      amountMinor: 9900,
      currency: "CNY",
      giftCredits: 0,
      seatLimit: undefined,
      entitlements: ["priority_generation"],
      priorityRules: { modelFamilies: ["seedance-lite"] },
      displayMetadata: { sortOrder: 5 },
      status: "archived",
      actorAdminAccountId: adminAccountId,
      reason: "Archive experience plan",
      idempotencyKey: "membership-plan-experience-archive",
      idempotencyOrganizationId: organizationId,
      now: new Date("2026-06-09T10:00:00.000Z"),
    });
    const nonArchived = await service.listPlans({ includeArchived: false, now });
    const withArchived = await service.listPlans({ includeArchived: true, now });
    const revisions = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plan_revisions WHERE plan_id = $1",
      [experience.body.plan.id],
    );

    assert.equal(archivedExperience.status, 200);
    assert.equal(archivedExperience.body.plan.status, "archived");
    assert.equal(archivedExperience.body.plan.seatLimit, 1);
    assert.deepEqual(revisions.rows, [{ count: 2 }]);
    assert.deepEqual(
      nonArchived.data.plans.map((plan) => plan.id),
      [starter.body.plan.id, monthly.body.plan.id],
    );
    assert.deepEqual(
      withArchived.data.plans.map((plan) => plan.id),
      [experience.body.plan.id, starter.body.plan.id, monthly.body.plan.id],
    );
  } finally {
    await db.close();
  }
});

test("membership plan service lists only currently purchasable active plans", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });
  const now = new Date("2026-06-09T09:00:00.000Z");

  try {
    await seedAdminAccount(db);
    const active = await saveValidPlan(service, {
      code: "active_current",
      status: "active",
      validFrom: "2026-06-08T00:00:00.000Z",
      validUntil: "2026-06-10T00:00:00.000Z",
      idempotencyKey: "membership-plan-active-current",
    });
    await saveValidPlan(service, {
      code: "inactive_current",
      status: "inactive",
      idempotencyKey: "membership-plan-inactive-current",
    });
    await saveValidPlan(service, {
      code: "archived_current",
      status: "archived",
      idempotencyKey: "membership-plan-archived-current",
    });
    await saveValidPlan(service, {
      code: "active_future",
      status: "active",
      validFrom: "2026-06-10T00:00:00.000Z",
      idempotencyKey: "membership-plan-active-future",
    });
    await saveValidPlan(service, {
      code: "active_expired",
      status: "active",
      validUntil: "2026-06-09T09:00:00.000Z",
      idempotencyKey: "membership-plan-active-expired",
    });

    const purchasable = await service.listPurchasablePlans({ now });

    assert.deepEqual(
      purchasable.data.plans.map((plan) => plan.id),
      [active.body.plan.id],
    );
  } finally {
    await db.close();
  }
});

test("membership plan service validates save input", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });

  try {
    await seedAdminAccount(db);

    const cases = [
      {
        name: "blank reason",
        overrides: { reason: " " },
        code: "reason_required",
      },
      {
        name: "invalid period",
        overrides: { periodCount: 0 },
        code: "invalid_period",
      },
      {
        name: "negative gift credits",
        overrides: { giftCredits: -1 },
        code: "invalid_gift_credits",
      },
      {
        name: "invalid seat limit",
        overrides: { seatLimit: 0 },
        code: "invalid_seat_limit",
      },
    ];

    for (const validationCase of cases) {
      const result = await service.savePlan({
        ...validPlanInput(validationCase.name.replaceAll(" ", "_")),
        ...validationCase.overrides,
      });
      assert.equal(result.status, 400, validationCase.name);
      assert.equal(result.body.error.code, validationCase.code, validationCase.name);
    }
  } finally {
    await db.close();
  }
});

test("membership plan service validates plan ids before writing", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });

  try {
    await seedAdminAccount(db);

    const result = await service.savePlan({
      ...validPlanInput("invalid_id"),
      id: "not-a-uuid",
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, "invalid_plan_id");
  } finally {
    await db.close();
  }
});

test("membership plan service rolls back plan writes when revision insertion fails", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });
  const createInput = validPlanInput("atomic_create");

  try {
    await seedAdminAccount(db);
    await db.query(
      "ALTER TABLE membership_plan_revisions ADD CONSTRAINT membership_plan_revisions_reason_not_rejected CHECK (reason <> 'reject revision')",
    );

    await assert.rejects(
      service.savePlan({
        ...createInput,
        reason: "reject revision",
      }),
    );
    const rowsAfterCreateFailure = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plans WHERE code = $1",
      [createInput.code],
    );
    assert.deepEqual(rowsAfterCreateFailure.rows, [{ count: 0 }]);

    const created = await service.savePlan(validPlanInput("atomic_update"));
    assert.equal(created.status, 200);
    await assert.rejects(
      service.savePlan({
        ...validPlanInput("atomic_update_changed"),
        id: created.body.plan.id,
        code: created.body.plan.code,
        displayName: "Professional Monthly Changed",
        amountMinor: 29900,
        reason: "reject revision",
      }),
    );
    const rowAfterUpdateFailure = await db.query<{ display_name: string; amount_minor: number }>(
      "SELECT display_name, amount_minor FROM membership_plans WHERE id = $1",
      [created.body.plan.id],
    );
    const revisionsAfterUpdateFailure = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plan_revisions WHERE plan_id = $1",
      [created.body.plan.id],
    );

    assert.deepEqual(rowAfterUpdateFailure.rows, [
      { display_name: "Professional Monthly", amount_minor: 19900 },
    ]);
    assert.deepEqual(revisionsAfterUpdateFailure.rows, [{ count: 1 }]);
  } finally {
    await db.close();
  }
});

test("membership plan service rejects idempotency key reuse with a different request body", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });

  try {
    await seedAdminAccount(db);
    const input = validPlanInput("idempotency_conflict");
    const created = await service.savePlan(input);
    const replay = await service.savePlan(input);
    const conflict = await service.savePlan({
      ...input,
      amountMinor: input.amountMinor + 1000,
    });
    const revisions = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plan_revisions WHERE plan_id = $1",
      [created.body.plan.id],
    );

    assert.equal(created.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.plan.id, created.body.plan.id);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "idempotency_conflict");
    assert.deepEqual(revisions.rows, [{ count: 1 }]);
  } finally {
    await db.close();
  }
});

test("membership plan service returns a stable conflict for duplicate plan codes", async () => {
  const db = await createMigratedTestDb();
  const service = createMembershipPlanService({ db });

  try {
    await seedAdminAccount(db);
    const input = validPlanInput("duplicate_code");
    const created = await service.savePlan(input);
    const conflict = await service.savePlan({
      ...validPlanInput("duplicate_code_second"),
      code: input.code,
    });
    const matchingPlans = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plans WHERE code = $1",
      [input.code],
    );
    const matchingRevisions = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM membership_plan_revisions WHERE plan_id = $1",
      [created.body.plan.id],
    );

    assert.equal(created.status, 200);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, "membership_plan_code_conflict");
    assert.deepEqual(matchingPlans.rows, [{ count: 1 }]);
    assert.deepEqual(matchingRevisions.rows, [{ count: 1 }]);
  } finally {
    await db.close();
  }
});

async function saveValidPlan(
  service: ReturnType<typeof createMembershipPlanService>,
  overrides: Partial<ReturnType<typeof validPlanInput>>,
) {
  return service.savePlan({
    ...validPlanInput(overrides.code ?? randomUUID()),
    ...overrides,
  });
}

function validPlanInput(suffix: string) {
  return {
    code: `plan_${suffix}_${randomUUID().slice(0, 8)}`,
    displayName: "Professional Monthly",
    tier: "professional",
    periodUnit: "month",
    periodCount: 1,
    amountMinor: 19900,
    currency: "CNY",
    giftCredits: 100,
    seatLimit: 50,
    entitlements: ["team_member_management", "priority_generation"],
    priorityRules: { modelFamilies: ["seedance"] },
    displayMetadata: { sortOrder: 20 },
    status: "active",
    validFrom: null,
    validUntil: null,
    actorAdminAccountId: adminAccountId,
    reason: "Configure membership plan",
    idempotencyKey: `membership-plan-${suffix}`,
    idempotencyOrganizationId: organizationId,
    now: new Date("2026-06-09T09:00:00.000Z"),
  };
}

async function seedAdminAccount(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Membership Plan Test Org', 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO admin_accounts (
        id, login_name, password_hash, display_name, status
      )
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (id) DO NOTHING
    `,
    [adminAccountId, `membership_admin_${randomUUID().slice(0, 8)}`, "plain:Admin-Test-12345", "Membership Admin"],
  );
}
