import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import { createMigratedTestDb } from "../shared/db/test-db.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import type { OutboxEventRecord } from "../shared/outbox/outbox-dispatch-repair.service.ts";
import { createInviteRewardAdminService } from "./invite-reward-admin.service.ts";
import {
  bindInviteForNewUser,
  consumeInviteRebateForPaymentSucceeded,
  grantNewUserBenefits,
} from "./invite-reward.service.ts";

describe("invite reward service", () => {
  it("saves configurable gift credits and inviter rebate percent", async () => {
    const db = await createMigratedTestDb();

    try {
      const service = createInviteRewardAdminService({ db });
      const saved = await service.saveConfig({
        newUserGiftCredits: 88,
        inviterGiftCredits: 66,
        rebatePercent: 5.5,
        rebateWindowDays: 45,
        rebateCreditRate: 100,
        perInvitedUserRebateCapMinor: 1234,
        perInviterPeriodRebateCapMinor: 5678,
        now: new Date("2026-06-30T08:00:00.000Z"),
      });
      const loaded = await service.getConfig();

      assert.equal(saved.status, 200);
      assert.equal(loaded.data.config.newUserGiftCredits, 88);
      assert.equal(loaded.data.config.inviterGiftCredits, 66);
      assert.equal(loaded.data.config.rebatePercent, 5.5);
      assert.equal(loaded.data.config.rebateWindowDays, 45);
      assert.equal(loaded.data.config.perInvitedUserRebateCapMinor, 1234);
      assert.equal(loaded.data.config.perInviterPeriodRebateCapMinor, 5678);
    } finally {
      await db.close();
    }
  });

  it("binds a new invited user and writes configured credit rewards to the ledger", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-06-30T08:00:00.000Z");

    try {
      const inviterId = randomUUID();
      const invitedUserId = randomUUID();
      const newUserPlanId = randomUUID();
      const inviterPlanId = randomUUID();
      await seedUser(db, { id: inviterId, phone: "13900000001" });
      await seedUser(db, { id: invitedUserId, phone: "13900000002" });
      await seedMembership(db, invitedUserId);
      await seedMembership(db, inviterId);
      await seedInternalMembershipPlan(db, {
        id: newUserPlanId,
        code: "invite_new_user_trial",
        giftCredits: 5000,
        seatLimit: 1,
        usageScene: "invite_new_user",
      });
      await seedInternalMembershipPlan(db, {
        id: inviterPlanId,
        code: "invite_inviter_trial",
        giftCredits: 3000,
        seatLimit: 50,
        usageScene: "invite_inviter",
      });
      await seedInviteConfig(db, {
        newUserGiftCredits: 30,
        inviterGiftCredits: 40,
        newUserPlanId,
        inviterPlanId,
      });

      const result = await bindInviteForNewUser(db, {
        invitedUserId,
        inviteCode: "INVITE0001",
        now,
      });
      const grants = await db.query<{ reward_type: string; recipient_user_id: string; credits: number; status: string }>(
        `
          SELECT reward_type, recipient_user_id, credits, status
          FROM invite_reward_grants
          ORDER BY reward_type
        `,
      );
      const ledger = await db.query<{ user_id: string; amount: number; source_type: string; reason: string }>(
        `
          SELECT user_id, amount, source_type, reason
          FROM credit_ledger_entries
          ORDER BY amount
        `,
      );
      const memberships = await db.query<{ user_id: string; membership_tier: string; gift_credits: number }>(
        `
          SELECT user_id, membership_tier, gift_credits
          FROM memberships
          WHERE user_id IN ($1, $2)
          ORDER BY gift_credits
        `,
        [invitedUserId, inviterId],
      );
      const periods = await db.query<{ plan_id: string; gift_credits: number; status: string }>(
        "SELECT plan_id, gift_credits, status FROM membership_periods ORDER BY gift_credits",
      );

      assert.equal(result.kind, "bound");
      assert.deepEqual(grants.rows, [
        { reward_type: "inviter_trial", recipient_user_id: inviterId, credits: 3000, status: "granted" },
        { reward_type: "new_user_trial", recipient_user_id: invitedUserId, credits: 5000, status: "granted" },
      ]);
      assert.deepEqual(ledger.rows, [
        { user_id: inviterId, amount: 3000, source_type: "invite_reward", reason: "邀请注册奖励积分" },
        { user_id: invitedUserId, amount: 5000, source_type: "invite_reward", reason: "新用户体验积分" },
      ]);
      assert.deepEqual(memberships.rows, [
        { user_id: inviterId, membership_tier: "experience", gift_credits: 3000 },
        { user_id: invitedUserId, membership_tier: "experience", gift_credits: 5000 },
      ]);
      assert.deepEqual(periods.rows, [
        { plan_id: inviterPlanId, gift_credits: 3000, status: "active" },
        { plan_id: newUserPlanId, gift_credits: 5000, status: "active" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("grants configured new user benefits without an invite code only once", async () => {
    const db = await createMigratedTestDb();
    const now = new Date("2026-06-30T08:00:00.000Z");

    try {
      const userId = randomUUID();
      const planId = randomUUID();
      await seedUser(db, { id: userId, phone: "13900000022" });
      await seedMembership(db, userId);
      await seedInternalMembershipPlan(db, {
        id: planId,
        code: "new_user_without_invite",
        giftCredits: 5000,
        seatLimit: 1,
        usageScene: "invite_new_user",
      });
      await seedInviteConfig(db, {
        newUserGiftCredits: 0,
        inviterGiftCredits: 0,
        newUserPlanId: planId,
      });

      const first = await grantNewUserBenefits(db, { userId, now });
      const second = await grantNewUserBenefits(db, { userId, now });
      const ledger = await db.query<{ amount: number; reason: string }>(
        "SELECT amount, reason FROM credit_ledger_entries WHERE user_id = $1 AND source_type = 'new_user_reward'",
        [userId],
      );
      const periods = await db.query<{ plan_id: string; gift_credits: number }>(
        "SELECT plan_id, gift_credits FROM membership_periods",
      );
      const bindings = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM user_invite_bindings WHERE invited_user_id = $1",
        [userId],
      );

      assert.equal(first.kind, "applied");
      assert.equal(second.kind, "duplicate");
      assert.deepEqual(ledger.rows, [{ amount: 5000, reason: "新用户体验积分" }]);
      assert.deepEqual(periods.rows, [{ plan_id: planId, gift_credits: 5000 }]);
      assert.equal(bindings.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("grants inviter rebate credits for paid orders inside the configured window only once", async () => {
    const db = await createMigratedTestDb();
    const boundAt = new Date("2026-06-30T08:00:00.000Z");
    const paidAt = new Date("2026-07-01T08:00:00.000Z");

    try {
      const inviterId = randomUUID();
      const invitedUserId = randomUUID();
      const organizationId = randomUUID();
      const orderId = randomUUID();
      const paymentIntentId = randomUUID();
      await seedUser(db, { id: inviterId, phone: "13900000011" });
      await seedUser(db, { id: invitedUserId, phone: "13900000012" });
      await seedMembership(db, invitedUserId);
      await seedMembership(db, inviterId);
      await seedInviteConfig(db, { newUserGiftCredits: 0, inviterGiftCredits: 0, rebatePercent: 3, rebateCreditRate: 1000 });
      const bound = await bindInviteForNewUser(db, {
        invitedUserId,
        inviteCode: "INVITE0001",
        now: boundAt,
      });
      assert.equal(bound.kind, "bound");

      await seedPaidOrder(db, {
        organizationId,
        orderId,
        userId: invitedUserId,
        paymentIntentId,
        amountMinor: 19990,
        credits: 204000,
        paidAt,
      });
      const event = paymentEvent({
        id: randomUUID(),
        organizationId,
        orderId,
        paymentIntentId,
        amountMinor: 19990,
        now: paidAt,
      });
      await seedOutboxEvent(db, event);

      const first = await consumeInviteRebateForPaymentSucceeded(db, { event, now: paidAt });
      const second = await consumeInviteRebateForPaymentSucceeded(db, { event, now: paidAt });
      const outsideOrderId = randomUUID();
      const outsidePaymentIntentId = randomUUID();
      const outsidePaidAt = new Date("2026-07-30T08:00:00.000Z");
      await seedPaidOrder(db, {
        organizationId,
        orderId: outsideOrderId,
        userId: invitedUserId,
        paymentIntentId: outsidePaymentIntentId,
        amountMinor: 19990,
        credits: 204000,
        paidAt: outsidePaidAt,
      });
      const outsideEvent = paymentEvent({
        id: randomUUID(),
        organizationId,
        orderId: outsideOrderId,
        paymentIntentId: outsidePaymentIntentId,
        amountMinor: 19990,
        now: outsidePaidAt,
      });
      await seedOutboxEvent(db, outsideEvent);
      const outside = await consumeInviteRebateForPaymentSucceeded(db, { event: outsideEvent, now: outsidePaidAt });
      const grant = await queryOne<{ credits: number; amount_minor: number; status: string }>(
        db,
        "SELECT credits, amount_minor, status FROM invite_reward_grants WHERE reward_type = 'inviter_rebate'",
      );
      const ledger = await queryOne<{ amount: number; reason: string }>(
        db,
        "SELECT amount, reason FROM credit_ledger_entries WHERE reason = '邀请充值返利积分'",
      );

      assert.equal(first.kind, "applied");
      assert.equal(second.kind, "duplicate");
      assert.equal(outside.kind, "ignored");
      assert.deepEqual(grant, { credits: 6120, amount_minor: 599, status: "granted" });
      assert.deepEqual(ledger, { amount: 6120, reason: "邀请充值返利积分" });
    } finally {
      await db.close();
    }
  });

  it("caps rebate per invited user without affecting other invited users", async () => {
    const db = await createMigratedTestDb();
    const boundAt = new Date("2026-06-30T08:00:00.000Z");
    const paidAt = new Date("2026-07-01T08:00:00.000Z");

    try {
      const inviterId = randomUUID();
      const firstInvitedUserId = randomUUID();
      const secondInvitedUserId = randomUUID();
      await seedUser(db, { id: inviterId, phone: "13900000031" });
      await seedUser(db, { id: firstInvitedUserId, phone: "13900000032" });
      await seedUser(db, { id: secondInvitedUserId, phone: "13900000033" });
      await seedMembership(db, inviterId);
      await seedMembership(db, firstInvitedUserId);
      await seedMembership(db, secondInvitedUserId);
      await seedInviteConfig(db, {
        newUserGiftCredits: 0,
        inviterGiftCredits: 0,
        rebatePercent: 3,
        rebateCreditRate: 1000,
        perInvitedUserRebateCapMinor: 1000,
        perInviterPeriodRebateCapMinor: 1000,
      });

      const firstBinding = await bindInviteForNewUser(db, {
        invitedUserId: firstInvitedUserId,
        inviteCode: "INVITE0001",
        now: boundAt,
      });
      const secondBinding = await bindInviteForNewUser(db, {
        invitedUserId: secondInvitedUserId,
        inviteCode: "INVITE0001",
        now: boundAt,
      });
      assert.equal(firstBinding.kind, "bound");
      assert.equal(secondBinding.kind, "bound");
      if (firstBinding.kind !== "bound" || secondBinding.kind !== "bound") return;

      await db.query(
        `
          INSERT INTO invite_reward_grants (
            id, binding_id, recipient_user_id, reward_type, source_type, source_id,
            amount_minor, credits, status, config_snapshot_json
          )
          SELECT $1, id, inviter_user_id, 'inviter_rebate', 'billing_order', $2,
                 900, 900, 'granted', config_snapshot_json
          FROM user_invite_bindings
          WHERE id = $3
        `,
        [randomUUID(), randomUUID(), firstBinding.bindingId],
      );

      const firstResult = await consumeSeededPayment(db, {
        userId: firstInvitedUserId,
        amountMinor: 10000,
        credits: 10000,
        paidAt,
      });
      const firstAfterCap = await consumeSeededPayment(db, {
        userId: firstInvitedUserId,
        amountMinor: 10000,
        credits: 10000,
        paidAt,
      });
      const secondResult = await consumeSeededPayment(db, {
        userId: secondInvitedUserId,
        amountMinor: 10000,
        credits: 10000,
        paidAt,
      });
      const totals = await db.query<{ binding_id: string; amount_minor: number; credits: number }>(
        `
          SELECT binding_id, sum(amount_minor)::int AS amount_minor, sum(credits)::int AS credits
          FROM invite_reward_grants
          WHERE reward_type = 'inviter_rebate'
            AND status IN ('pending', 'granted')
          GROUP BY binding_id
          ORDER BY binding_id
        `,
      );

      assert.equal(firstResult.kind, "applied");
      assert.equal(firstAfterCap.kind, "ignored");
      assert.equal(secondResult.kind, "applied");
      assert.deepEqual(
        new Map(totals.rows.map((row) => [row.binding_id, { amountMinor: row.amount_minor, credits: row.credits }])),
        new Map([
          [firstBinding.bindingId, { amountMinor: 1000, credits: 1000 }],
          [secondBinding.bindingId, { amountMinor: 300, credits: 300 }],
        ]),
      );
    } finally {
      await db.close();
    }
  });
});

async function seedUser(
  db: SqlDatabase,
  input: { id: string; phone: string },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, invite_code, status)
      VALUES ($1, $2, $3, 'active')
    `,
    [input.id, input.phone, input.phone.endsWith("1") ? "INVITE0001" : `U${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`],
  );
}

async function seedMembership(db: SqlDatabase, userId: string) {
  const organizationId = randomUUID();
  const workspaceId = randomUUID();
  await db.query(
    "INSERT INTO organizations (id, name, status) VALUES ($1, 'Invite Test Org', 'active')",
    [organizationId],
  );
  await db.query(
    "INSERT INTO workspaces (id, organization_id, name, status) VALUES ($1, $2, 'Invite Test Workspace', 'active')",
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
    `,
    [randomUUID(), organizationId, workspaceId, userId],
  );
}

async function seedInviteConfig(
  db: SqlDatabase,
  input: {
    newUserGiftCredits: number;
    inviterGiftCredits: number;
    rebatePercent?: number;
    rebateCreditRate?: number;
    perInvitedUserRebateCapMinor?: number;
    perInviterPeriodRebateCapMinor?: number;
    newUserPlanId?: string;
    inviterPlanId?: string;
  },
) {
  await db.query(
    `
      INSERT INTO invite_reward_configs (
        id,
        status,
        new_user_plan_id,
        new_user_gift_credits,
        inviter_plan_id,
        inviter_gift_credits,
        rebate_percent,
        rebate_window_days,
        rebate_credit_rate,
        per_invited_user_rebate_cap_minor,
        per_inviter_period_rebate_cap_minor
      )
      VALUES ($1, 'active', $2, $3, $4, $5, $6, 30, $7, $8, $9)
    `,
    [
      randomUUID(),
      input.newUserPlanId ?? null,
      input.newUserGiftCredits,
      input.inviterPlanId ?? null,
      input.inviterGiftCredits,
      input.rebatePercent ?? 3,
      input.rebateCreditRate ?? 100,
      input.perInvitedUserRebateCapMinor ?? null,
      input.perInviterPeriodRebateCapMinor ?? null,
    ],
  );
}

async function consumeSeededPayment(
  db: SqlDatabase,
  input: { userId: string; amountMinor: number; credits: number; paidAt: Date },
) {
  const organizationId = randomUUID();
  const orderId = randomUUID();
  const paymentIntentId = randomUUID();
  await seedPaidOrder(db, {
    organizationId,
    orderId,
    userId: input.userId,
    paymentIntentId,
    amountMinor: input.amountMinor,
    credits: input.credits,
    paidAt: input.paidAt,
  });
  const event = paymentEvent({
    id: randomUUID(),
    organizationId,
    orderId,
    paymentIntentId,
    amountMinor: input.amountMinor,
    now: input.paidAt,
  });
  await seedOutboxEvent(db, event);
  return consumeInviteRebateForPaymentSucceeded(db, { event, now: input.paidAt });
}

async function seedPaidOrder(
  db: SqlDatabase,
  input: {
    organizationId: string;
    orderId: string;
    userId: string;
    paymentIntentId: string;
    amountMinor: number;
    credits?: number;
    paidAt: Date;
  },
) {
  const packageId = randomUUID();
  await db.query(
    "INSERT INTO organizations (id, name, status) VALUES ($1, 'Invite Payment Org', 'active') ON CONFLICT (id) DO NOTHING",
    [input.organizationId],
  );
  await db.query(
    `
      INSERT INTO credit_packages (id, code, display_name, credits, amount_minor, currency, status)
      VALUES ($1, $2, 'Invite Payment Package', 100, $3, 'CNY', 'active')
    `,
    [packageId, `invite_pkg_${randomUUID().slice(0, 8)}`, input.amountMinor],
  );
  await db.query(
    `
      INSERT INTO billing_orders (
        id,
        organization_id,
        created_by_user_id,
        order_no,
        product_type,
        credit_package_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
      VALUES ($1, $2, $3, $4, 'credit_package', $5, '{}'::jsonb, '{}'::jsonb, $6, $7, 'CNY', 'paid', $8, $8, $9)
    `,
    [
      input.orderId,
      input.organizationId,
      input.userId,
      `ORD-INVITE-${randomUUID()}`,
      packageId,
      input.credits ?? 100,
      input.amountMinor,
      input.paidAt,
      input.paymentIntentId,
    ],
  );
}

async function seedInternalMembershipPlan(
  db: SqlDatabase,
  input: { id: string; code: string; giftCredits: number; seatLimit: number; usageScene: string },
) {
  await db.query(
    `
      INSERT INTO membership_plans (
        id,
        code,
        display_name,
        tier,
        period_unit,
        period_count,
        amount_minor,
        currency,
        gift_credits,
        seat_limit,
        entitlements_json,
        priority_rules_json,
        display_metadata_json,
        status,
        visibility,
        usage_scene
      )
      VALUES ($1, $2, $2, 'experience', 'day', 3, 0, 'CNY', $3, $4, '["canvas_access","priority_generation"]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'active', 'internal', $5)
    `,
    [input.id, input.code, input.giftCredits, input.seatLimit, input.usageScene],
  );
}

async function seedOutboxEvent(db: SqlDatabase, event: OutboxEventRecord) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'processing', $5, $5, $5)
    `,
    [
      event.id,
      event.organizationId,
      event.eventType,
      JSON.stringify(event.payload),
      event.createdAt,
    ],
  );
}

function paymentEvent(input: {
  id: string;
  organizationId: string;
  orderId: string;
  paymentIntentId: string;
  amountMinor: number;
  now: Date;
}): OutboxEventRecord {
  return {
    id: input.id,
    organizationId: input.organizationId,
    eventType: eventTypes.paymentSucceeded,
    payload: {
      order_id: input.orderId,
      payment_intent_id: input.paymentIntentId,
      payment_provider_event_id: randomUUID(),
      amount_minor: input.amountMinor,
      currency: "CNY",
    },
    status: "processing",
    availableAt: input.now,
    processedAt: null,
    errorMessage: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
