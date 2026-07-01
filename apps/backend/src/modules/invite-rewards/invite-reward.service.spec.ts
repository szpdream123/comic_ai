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
        now: new Date("2026-06-30T08:00:00.000Z"),
      });
      const loaded = await service.getConfig();

      assert.equal(saved.status, 200);
      assert.equal(loaded.data.config.newUserGiftCredits, 88);
      assert.equal(loaded.data.config.inviterGiftCredits, 66);
      assert.equal(loaded.data.config.rebatePercent, 5.5);
      assert.equal(loaded.data.config.rebateWindowDays, 45);
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
      await seedUser(db, { id: inviterId, phone: "13900000001" });
      await seedUser(db, { id: invitedUserId, phone: "13900000002" });
      await seedMembership(db, invitedUserId);
      await seedMembership(db, inviterId);
      await seedInviteConfig(db, { newUserGiftCredits: 30, inviterGiftCredits: 40 });

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

      assert.equal(result.kind, "bound");
      assert.deepEqual(grants.rows, [
        { reward_type: "inviter_trial", recipient_user_id: inviterId, credits: 40, status: "granted" },
        { reward_type: "new_user_trial", recipient_user_id: invitedUserId, credits: 30, status: "granted" },
      ]);
      assert.deepEqual(ledger.rows, [
        { user_id: invitedUserId, amount: 30, source_type: "invite_reward", reason: "邀请新用户体验积分" },
        { user_id: inviterId, amount: 40, source_type: "invite_reward", reason: "邀请注册奖励积分" },
      ]);
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
      await seedInviteConfig(db, { newUserGiftCredits: 0, inviterGiftCredits: 0, rebatePercent: 3, rebateCreditRate: 100 });
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
        amountMinor: 10000,
        paidAt,
      });
      const event = paymentEvent({
        id: randomUUID(),
        organizationId,
        orderId,
        paymentIntentId,
        amountMinor: 10000,
        now: paidAt,
      });
      await seedOutboxEvent(db, event);

      const first = await consumeInviteRebateForPaymentSucceeded(db, { event, now: paidAt });
      const second = await consumeInviteRebateForPaymentSucceeded(db, { event, now: paidAt });
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
      assert.deepEqual(grant, { credits: 300, amount_minor: 300, status: "granted" });
      assert.deepEqual(ledger, { amount: 300, reason: "邀请充值返利积分" });
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
  },
) {
  await db.query(
    `
      INSERT INTO invite_reward_configs (
        id,
        status,
        new_user_gift_credits,
        inviter_gift_credits,
        rebate_percent,
        rebate_window_days,
        rebate_credit_rate
      )
      VALUES ($1, 'active', $2, $3, $4, 30, $5)
    `,
    [
      randomUUID(),
      input.newUserGiftCredits,
      input.inviterGiftCredits,
      input.rebatePercent ?? 3,
      input.rebateCreditRate ?? 100,
    ],
  );
}

async function seedPaidOrder(
  db: SqlDatabase,
  input: {
    organizationId: string;
    orderId: string;
    userId: string;
    paymentIntentId: string;
    amountMinor: number;
    paidAt: Date;
  },
) {
  const packageId = randomUUID();
  await db.query(
    "INSERT INTO organizations (id, name, status) VALUES ($1, 'Invite Payment Org', 'active')",
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
      VALUES ($1, $2, $3, $4, 'credit_package', $5, '{}'::jsonb, '{}'::jsonb, 100, $6, 'CNY', 'paid', $7, $7, $8)
    `,
    [
      input.orderId,
      input.organizationId,
      input.userId,
      `ORD-INVITE-${randomUUID()}`,
      packageId,
      input.amountMinor,
      input.paidAt,
      input.paymentIntentId,
    ],
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
