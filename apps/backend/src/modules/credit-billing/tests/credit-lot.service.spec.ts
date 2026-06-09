import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  reserveCredits,
  settleReservationAllocation,
} from "../credit-ledger.service.ts";
import { expireAvailableCreditLots } from "../credit-lot.service.ts";

const organizationId = "10000000-0000-4000-8000-000000050001";
const lotSoon = "90000000-0000-4000-8000-000000050001";
const lotLater = "90000000-0000-4000-8000-000000050002";
const lotOnly = "90000000-0000-4000-8000-000000050003";
const expiredLot = "90000000-0000-4000-8000-000000050004";
const reservationSourceId = "40000000-0000-4000-8000-000000050001";
const secondReservationSourceId = "40000000-0000-4000-8000-000000050002";

describe("credit lots", { concurrency: false }, () => {
  it("reserves from the earliest expiring credit lots first", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db, 120);
      await seedLot(db, {
        id: lotSoon,
        amount: 40,
        expiresAt: new Date("2026-06-10T00:00:00.000Z"),
      });
      await seedLot(db, {
        id: lotLater,
        amount: 80,
        expiresAt: new Date("2026-07-10T00:00:00.000Z"),
      });

      const reserved = await reserveCredits(db, {
        organizationId,
        amount: 90,
        sourceType: "generation_task",
        sourceId: reservationSourceId,
        reason: "lot allocation test",
        now: new Date("2026-06-08T00:00:00.000Z"),
      });

      const allocations = await db.query<{ credit_lot_id: string; amount: number }>(
        `
          SELECT credit_lot_id, amount
          FROM credit_reservation_lot_allocations
          WHERE reservation_id = $1
          ORDER BY created_at ASC
        `,
        [reserved.reservation.id],
      );
      const lots = await db.query<{
        id: string;
        available_amount: number;
        reserved_amount: number;
      }>(
        `
          SELECT id, available_amount, reserved_amount
          FROM credit_lots
          ORDER BY expires_at ASC
        `,
      );

      assert.equal(reserved.reservation.amountTotal, 90);
      assert.deepEqual(
        allocations.rows.map((row) => ({
          credit_lot_id: row.credit_lot_id,
          amount: Number(row.amount),
        })),
        [
          { credit_lot_id: lotSoon, amount: 40 },
          { credit_lot_id: lotLater, amount: 50 },
        ],
      );
      assert.deepEqual(lots.rows, [
        { id: lotSoon, available_amount: 0, reserved_amount: 40 },
        { id: lotLater, available_amount: 30, reserved_amount: 50 },
      ]);
    } finally {
      await db.close();
    }
  });

  it("updates allocated lots when reservation allocation is consumed or released", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db, 50);
      await seedLot(db, {
        id: lotOnly,
        amount: 50,
        expiresAt: new Date("2026-06-20T00:00:00.000Z"),
      });

      const reserved = await reserveCredits(db, {
        organizationId,
        amount: 50,
        sourceType: "generation_task",
        sourceId: reservationSourceId,
        reason: "lot settlement test",
        now: new Date("2026-06-08T00:00:00.000Z"),
      });
      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        amount: 30,
        outcome: "consumed",
        allocationKey: "provider-success",
        now: new Date("2026-06-08T00:01:00.000Z"),
      });
      await settleReservationAllocation(db, {
        reservationId: reserved.reservation.id,
        amount: 20,
        outcome: "released",
        allocationKey: "provider-release",
        now: new Date("2026-06-08T00:02:00.000Z"),
      });

      const lot = await readLot(db, lotOnly);

      assert.equal(lot.available_amount, 20);
      assert.equal(lot.reserved_amount, 0);
      assert.equal(lot.consumed_amount, 30);
    } finally {
      await db.close();
    }
  });

  it("expires available credit lots idempotently", async () => {
    const db = await createMigratedTestDb();

    try {
      await seedOrganization(db, 100);
      await seedLot(db, {
        id: expiredLot,
        amount: 100,
        expiresAt: new Date("2026-06-08T00:00:00.000Z"),
        metadata: { tier: "experience" },
      });

      const first = await expireAvailableCreditLots(db, {
        organizationId,
        now: new Date("2026-06-09T00:00:00.000Z"),
        limit: 20,
      });
      const replay = await expireAvailableCreditLots(db, {
        organizationId,
        now: new Date("2026-06-09T00:00:00.000Z"),
        limit: 20,
      });
      const lot = await readLot(db, expiredLot);
      const ledger = await db.query<{ entry_type: string; amount: number }>(
        "SELECT entry_type, amount FROM credit_ledger_entries WHERE entry_type = 'expire'",
      );
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );

      assert.equal(first.expiredAmount, 100);
      assert.equal(replay.expiredAmount, 0);
      assert.equal(lot.available_amount, 0);
      assert.equal(lot.expired_amount, 100);
      assert.deepEqual(ledger.rows, [{ entry_type: "expire", amount: 100 }]);
      assert.equal(organization.rows[0]?.credit_balance_cached, 0);
    } finally {
      await db.close();
    }
  });
});

async function seedOrganization(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  balance: number,
) {
  await db.query(
    `
      INSERT INTO organizations (id, name, status, credit_balance_cached)
      VALUES ($1, 'Credit Lot Org', 'active', $2)
    `,
    [organizationId, balance],
  );
}

async function seedLot(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: {
    id: string;
    amount: number;
    expiresAt: Date | null;
    metadata?: Record<string, unknown>;
  },
) {
  const grantLedgerEntryId = input.id.replace("90000000", "91000000");
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        organization_id,
        reservation_id,
        allocation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, NULL, NULL, 'grant', $3, $3, 0, 0, 'seed_lot', $4, 'seed lot', '{}'::jsonb, NULL, '2026-06-01T00:00:00.000Z')
    `,
    [grantLedgerEntryId, organizationId, input.amount, input.id],
  );
  await db.query(
    `
      INSERT INTO credit_lots (
        id,
        organization_id,
        source_type,
        source_id,
        grant_ledger_entry_id,
        total_amount,
        available_amount,
        reserved_amount,
        consumed_amount,
        expired_amount,
        expires_at,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'seed_lot', $1, $3, $4, $4, 0, 0, 0, $5, $6::jsonb, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
    `,
    [
      input.id,
      organizationId,
      grantLedgerEntryId,
      input.amount,
      input.expiresAt,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

async function readLot(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  lotId: string,
) {
  const result = await db.query<{
    available_amount: number;
    reserved_amount: number;
    consumed_amount: number;
    expired_amount: number;
  }>(
    `
      SELECT available_amount, reserved_amount, consumed_amount, expired_amount
      FROM credit_lots
      WHERE id = $1
    `,
    [lotId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return row;
}
