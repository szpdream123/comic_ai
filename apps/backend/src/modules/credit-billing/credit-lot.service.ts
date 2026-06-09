import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

interface CreditLotRow {
  id: string;
  organization_id: string;
  source_type: string;
  source_id: string;
  grant_ledger_entry_id: string;
  total_amount: number;
  available_amount: number;
  reserved_amount: number;
  consumed_amount: number;
  expired_amount: number;
  expires_at: Date | string | null;
  metadata_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CreditReservationLotAllocationRow {
  id: string;
  organization_id: string;
  reservation_id: string;
  credit_lot_id: string;
  amount: number;
  status: "reserved" | "consumed" | "released" | "manual_review_required";
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreditLotRecord {
  id: string;
  organizationId: string;
  sourceType: string;
  sourceId: string;
  grantLedgerEntryId: string;
  totalAmount: number;
  availableAmount: number;
  reservedAmount: number;
  consumedAmount: number;
  expiredAmount: number;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
}

export async function createCreditLotInTransaction(
  db: SqlDatabase,
  input: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
    grantLedgerEntryId: string;
    amount: number;
    expiresAt: Date | null;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  const row = await queryOne<CreditLotRow>(
    db,
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
      VALUES ($1, $2, $3, $4, $5, $6, $6, 0, 0, 0, $7, $8::jsonb, $9, $9)
      ON CONFLICT (organization_id, source_type, source_id, grant_ledger_entry_id)
      DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.organizationId,
      input.sourceType,
      input.sourceId,
      input.grantLedgerEntryId,
      input.amount,
      input.expiresAt,
      JSON.stringify(input.metadata),
      input.now,
    ],
  );

  if (row) {
    return lotFromRow(row);
  }

  const existing = await queryOne<CreditLotRow>(
    db,
    `
      SELECT *
      FROM credit_lots
      WHERE organization_id = $1
        AND source_type = $2
        AND source_id = $3
        AND grant_ledger_entry_id = $4
      LIMIT 1
    `,
    [
      input.organizationId,
      input.sourceType,
      input.sourceId,
      input.grantLedgerEntryId,
    ],
  );
  if (!existing) {
    throw new Error("credit_lot_create_failed");
  }
  return lotFromRow(existing);
}

export async function allocateCreditLotsForReservation(
  db: SqlDatabase,
  input: {
    organizationId: string;
    reservationId: string;
    amount: number;
    now: Date;
  },
) {
  let remaining = input.amount;
  const allocations: Array<{ creditLotId: string; amount: number }> = [];
  const lots = await db.query<CreditLotRow>(
    `
      SELECT *
      FROM credit_lots
      WHERE organization_id = $1
        AND available_amount > 0
        AND (expires_at IS NULL OR expires_at > $2)
      ORDER BY expires_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    `,
    [input.organizationId, input.now],
  );

  for (const lot of lots.rows) {
    if (remaining <= 0) break;
    const amount = Math.min(Number(lot.available_amount), remaining);
    if (amount <= 0) continue;

    const updated = await queryOne<{ id: string }>(
      db,
      `
        UPDATE credit_lots
        SET available_amount = available_amount - $3,
            reserved_amount = reserved_amount + $3,
            updated_at = $4
        WHERE organization_id = $1
          AND id = $2
          AND available_amount >= $3
        RETURNING id
      `,
      [input.organizationId, lot.id, amount, input.now],
    );
    if (!updated) {
      continue;
    }

    await db.query(
      `
        INSERT INTO credit_reservation_lot_allocations (
          id,
          organization_id,
          reservation_id,
          credit_lot_id,
          amount,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'reserved', $6, $6)
        ON CONFLICT (reservation_id, credit_lot_id)
        DO UPDATE SET
          amount = credit_reservation_lot_allocations.amount + EXCLUDED.amount,
          status = 'reserved',
          updated_at = EXCLUDED.updated_at
      `,
      [
        randomUUID(),
        input.organizationId,
        input.reservationId,
        lot.id,
        amount,
        input.now,
      ],
    );
    allocations.push({ creditLotId: lot.id, amount });
    remaining -= amount;
  }

  return {
    allocatedAmount: input.amount - remaining,
    allocations,
  };
}

export async function applyLotSettlement(
  db: SqlDatabase,
  input: {
    organizationId: string;
    reservationId: string;
    amount: number;
    outcome: "consumed" | "released";
    now: Date;
  },
) {
  let remaining = input.amount;
  const allocations = await db.query<
    CreditReservationLotAllocationRow & {
      lot_reserved_amount: number;
    }
  >(
    `
      SELECT
        allocation.*,
        lot.reserved_amount AS lot_reserved_amount
      FROM credit_reservation_lot_allocations allocation
      JOIN credit_lots lot
        ON lot.organization_id = allocation.organization_id
       AND lot.id = allocation.credit_lot_id
      WHERE allocation.organization_id = $1
        AND allocation.reservation_id = $2
        AND lot.reserved_amount > 0
      ORDER BY allocation.created_at ASC
      FOR UPDATE OF allocation, lot
    `,
    [input.organizationId, input.reservationId],
  );

  for (const allocation of allocations.rows) {
    if (remaining <= 0) break;
    const amount = Math.min(Number(allocation.lot_reserved_amount), remaining);
    if (amount <= 0) continue;

    if (input.outcome === "consumed") {
      await db.query(
        `
          UPDATE credit_lots
          SET reserved_amount = reserved_amount - $3,
              consumed_amount = consumed_amount + $3,
              updated_at = $4
          WHERE organization_id = $1
            AND id = $2
            AND reserved_amount >= $3
        `,
        [input.organizationId, allocation.credit_lot_id, amount, input.now],
      );
    } else {
      await db.query(
        `
          UPDATE credit_lots
          SET reserved_amount = reserved_amount - $3,
              available_amount = available_amount + $3,
              updated_at = $4
          WHERE organization_id = $1
            AND id = $2
            AND reserved_amount >= $3
        `,
        [input.organizationId, allocation.credit_lot_id, amount, input.now],
      );
    }

    remaining -= amount;
  }

  if (remaining > 0) {
    throw new Error("credit_lot_reservation_balance_error");
  }
}

export async function expireAvailableCreditLots(
  db: SqlDatabase,
  input: {
    organizationId?: string;
    now: Date;
    limit: number;
  },
) {
  await db.query("BEGIN");
  try {
    const result = await expireAvailableCreditLotsInTransaction(db, input);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function expireAvailableCreditLotsInTransaction(
  db: SqlDatabase,
  input: {
    organizationId?: string;
    now: Date;
    limit: number;
  },
) {
  const organizationWhere = input.organizationId ? "AND organization_id = $3" : "";
  const params = input.organizationId
    ? [input.now, input.limit, input.organizationId]
    : [input.now, input.limit];
  const lots = await db.query<CreditLotRow>(
    `
      SELECT *
      FROM credit_lots
      WHERE available_amount > 0
        AND expires_at IS NOT NULL
        AND expires_at <= $1
        ${organizationWhere}
      ORDER BY expires_at ASC, created_at ASC
      LIMIT $2
      FOR UPDATE
    `,
    params,
  );
  let expiredAmount = 0;
  const expiredLotIds: string[] = [];

  for (const lot of lots.rows) {
    const amount = Number(lot.available_amount);
    if (amount <= 0) continue;
    const ledger = await queryOne<{ id: string }>(
      db,
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
        VALUES ($1, $2, NULL, NULL, 'expire', $3, ($3::int * -1), 0, 0, 'credit_lot_expiry', $4, 'credit lot expired', $5::jsonb, NULL, $6)
        ON CONFLICT (organization_id, source_type, source_id, entry_type)
        DO NOTHING
        RETURNING id
      `,
      [
        randomUUID(),
        lot.organization_id,
        amount,
        lot.id,
        JSON.stringify({
          creditLotId: lot.id,
          sourceType: lot.source_type,
          sourceId: lot.source_id,
          expiresAt: lot.expires_at ? new Date(lot.expires_at).toISOString() : null,
        }),
        input.now,
      ],
    );
    if (!ledger) {
      continue;
    }

    await db.query(
      `
        UPDATE credit_lots
        SET available_amount = available_amount - $3,
            expired_amount = expired_amount + $3,
            updated_at = $4
        WHERE organization_id = $1
          AND id = $2
          AND available_amount >= $3
      `,
      [lot.organization_id, lot.id, amount, input.now],
    );
    await db.query(
      `
        UPDATE organizations
        SET credit_balance_cached = credit_balance_cached - $2,
            updated_at = $3
        WHERE id = $1
      `,
      [lot.organization_id, amount, input.now],
    );
    expiredAmount += amount;
    expiredLotIds.push(lot.id);
  }

  return { expiredAmount, expiredLotIds };
}

function lotFromRow(row: CreditLotRow): CreditLotRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    grantLedgerEntryId: row.grant_ledger_entry_id,
    totalAmount: row.total_amount,
    availableAmount: row.available_amount,
    reservedAmount: row.reserved_amount,
    consumedAmount: row.consumed_amount,
    expiredAmount: row.expired_amount,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    metadata: normalizeObject(row.metadata_json),
  };
}

function normalizeObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return normalizeObject(parsed);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}
