import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

interface CreditLotRow {
  id: string;
  user_id: string;
  source_type: string;
  source_id: string;
  grant_ledger_entry_id: string;
  total_amount: number;
  available_amount: number;
  reserved_amount: number;
  consumed_amount: number;
  expired_amount: number;
  status: "active" | "frozen" | "expired";
  expires_at: Date | string | null;
  frozen_at: Date | string | null;
  frozen_until: Date | string | null;
  metadata_json: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CreditReservationLotAllocationRow {
  id: string;
  user_id: string;
  reservation_id: string;
  credit_lot_id: string;
  amount: number;
  status: "reserved" | "consumed" | "released" | "manual_review_required";
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CreditLotRecord {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string;
  grantLedgerEntryId: string;
  totalAmount: number;
  availableAmount: number;
  reservedAmount: number;
  consumedAmount: number;
  expiredAmount: number;
  status: "active" | "frozen" | "expired";
  expiresAt: string | null;
  frozenAt: string | null;
  frozenUntil: string | null;
  metadata: Record<string, unknown>;
}

export async function createCreditLotInTransaction(
  db: SqlDatabase,
  input: {
    userId: string;
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
        user_id,
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
      ON CONFLICT (user_id, source_type, source_id, grant_ledger_entry_id)
      DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.userId,
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
      WHERE user_id = $1
        AND source_type = $2
        AND source_id = $3
        AND grant_ledger_entry_id = $4
      LIMIT 1
    `,
    [
      input.userId,
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
    userId: string;
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
      WHERE user_id = $1
        AND available_amount > 0
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $2)
      ORDER BY expires_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    `,
    [input.userId, input.now],
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
        WHERE user_id = $1
          AND id = $2
          AND available_amount >= $3
        RETURNING id
      `,
      [input.userId, lot.id, amount, input.now],
    );
    if (!updated) {
      continue;
    }

    await db.query(
      `
        INSERT INTO credit_reservation_lot_allocations (
          id,
          user_id,
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
        input.userId,
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
    userId: string;
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
        ON lot.user_id = allocation.user_id
       AND lot.id = allocation.credit_lot_id
      WHERE allocation.user_id = $1
        AND allocation.reservation_id = $2
        AND lot.reserved_amount > 0
      ORDER BY allocation.created_at ASC
      FOR UPDATE OF allocation, lot
    `,
    [input.userId, input.reservationId],
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
          WHERE user_id = $1
            AND id = $2
            AND reserved_amount >= $3
        `,
        [input.userId, allocation.credit_lot_id, amount, input.now],
      );
    } else {
      await db.query(
        `
          UPDATE credit_lots
          SET reserved_amount = reserved_amount - $3,
              available_amount = available_amount + $3,
              updated_at = $4
          WHERE user_id = $1
            AND id = $2
            AND reserved_amount >= $3
        `,
        [input.userId, allocation.credit_lot_id, amount, input.now],
      );
    }

    remaining -= amount;
  }

  // The user wallet balance is the source of truth for spending. Credit lots are
  // only an internal expiry/freeze aid, so missing lot rows must not block a
  // reservation that was already accepted against the wallet balance.
}

export async function expireAvailableCreditLots(
  db: SqlDatabase,
  input: {
    userId?: string;
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
    userId?: string;
    now: Date;
    limit: number;
  },
) {
  const userWhere = input.userId ? "AND user_id = $3" : "";
  const params = input.userId ? [input.now, input.limit, input.userId] : [input.now, input.limit];
  const lots = await db.query<CreditLotRow>(
    `
      SELECT *
        FROM credit_lots
        WHERE available_amount > 0
          AND status = 'active'
          AND expires_at IS NOT NULL
          AND expires_at <= $1
        ${userWhere}
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
          user_id,
          reservation_id,
          allocation_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          balance_after,
          source_type,
          source_id,
          reason,
          metadata_json,
          created_by_user_id,
          created_at
        )
      VALUES ($1, $2, NULL, NULL, 'expire', $3, 0, 0, 0, (SELECT credit_balance_cached FROM users WHERE id = $2), 'credit_lot_expiry', $4, '积分批次过期失效', $5::jsonb, $2, $6)
      ON CONFLICT (user_id, source_type, source_id, entry_type)
      DO NOTHING
      RETURNING id
    `,
      [
        randomUUID(),
        lot.user_id,
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
      WHERE user_id = $1
          AND id = $2
          AND available_amount >= $3
      `,
      [lot.user_id, lot.id, amount, input.now],
    );
    expiredAmount += amount;
    expiredLotIds.push(lot.id);
  }

  return { expiredAmount, expiredLotIds };
}

export async function freezeUserWalletCreditsInTransaction(
  db: SqlDatabase,
  input: {
    userId: string;
    now: Date;
  },
) {
  const wallet = await queryOne<{
    credit_balance_cached: number;
    credit_reserved_cached: number;
    credit_frozen_cached: number;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [input.userId],
  );
  const amount = Number(wallet?.credit_balance_cached ?? 0);
  if (!wallet || amount <= 0 || Number(wallet.credit_frozen_cached ?? 0) > 0) {
    return { frozenAmount: 0 };
  }

  const frozenUntil = addYears(input.now, 1);
  const ledger = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        reservation_id,
        allocation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        balance_after,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, NULL, NULL, 'freeze', $3, ($3::int * -1), 0, 0, 0, 'membership_wallet_freeze', $6, '会员到期冻结积分', $4::jsonb, $2, $5)
      ON CONFLICT (user_id, source_type, source_id, entry_type)
      DO NOTHING
      RETURNING id
    `,
    [
      randomUUID(),
      input.userId,
      amount,
      JSON.stringify({
        frozenAt: input.now.toISOString(),
        frozenUntil: frozenUntil.toISOString(),
      }),
      input.now,
      randomUUID(),
    ],
  );
  if (!ledger) {
    return { frozenAmount: 0 };
  }

  await db.query(
    `
      UPDATE credit_lots
      SET status = 'frozen',
          frozen_at = $2,
          frozen_until = $3,
          updated_at = $2
      WHERE user_id = $1
        AND status = 'active'
        AND available_amount > 0
    `,
    [input.userId, input.now, frozenUntil],
  );
  await db.query(
    `
      UPDATE users
      SET credit_balance_cached = credit_balance_cached - $2,
          credit_frozen_cached = credit_frozen_cached + $2,
          credit_frozen_at = $3,
          credit_frozen_until = $4,
          updated_at = $3
      WHERE id = $1
    `,
    [input.userId, amount, input.now, frozenUntil],
  );

  return { frozenAmount: amount };
}

export async function restoreUserWalletCreditsInTransaction(
  db: SqlDatabase,
  input: {
    userId: string;
    sourceType?: string;
    sourceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    now: Date;
  },
) {
  const wallet = await queryOne<{
    credit_balance_cached: number;
    credit_frozen_cached: number;
    credit_frozen_until: Date | string | null;
  }>(
    db,
    `
      SELECT credit_balance_cached, credit_frozen_cached, credit_frozen_until
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [input.userId],
  );
  const amount = Number(wallet?.credit_frozen_cached ?? 0);
  if (!wallet || amount <= 0) {
    return { restoredAmount: 0 };
  }
  const frozenUntil = wallet.credit_frozen_until ? new Date(wallet.credit_frozen_until) : null;
  if (frozenUntil && frozenUntil <= input.now) {
    return { restoredAmount: 0 };
  }
  const sourceType = input.sourceType ?? "membership_wallet_restore";
  const sourceId = input.sourceId ?? randomUUID();
  const reason = input.reason ?? "会员续费解冻积分";

  const ledger = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        reservation_id,
        allocation_id,
        entry_type,
        amount,
        available_delta,
        reserved_delta,
        consumed_delta,
        balance_after,
        source_type,
        source_id,
        reason,
        metadata_json,
        created_by_user_id,
        created_at
      )
      VALUES ($1, $2, NULL, NULL, 'restore', $3, $3, 0, 0, $9, $6, $7, $8, $4::jsonb, $2, $5)
      ON CONFLICT (user_id, source_type, source_id, entry_type)
      DO NOTHING
      RETURNING id
    `,
    [
      randomUUID(),
      input.userId,
      amount,
      JSON.stringify({
        restoredAt: input.now.toISOString(),
        previousFrozenUntil: frozenUntil ? frozenUntil.toISOString() : null,
        ...(input.metadata ?? {}),
      }),
      input.now,
      sourceType,
      sourceId,
      reason,
      Number(wallet.credit_balance_cached) + amount,
    ],
  );
  if (!ledger) {
    return { restoredAmount: 0 };
  }

  await db.query(
    `
      UPDATE credit_lots
      SET status = 'active',
          frozen_at = NULL,
          frozen_until = NULL,
          updated_at = $2
      WHERE user_id = $1
        AND status = 'frozen'
        AND available_amount > 0
        AND (frozen_until IS NULL OR frozen_until > $2)
    `,
    [input.userId, input.now],
  );
  await db.query(
    `
      UPDATE users
      SET credit_balance_cached = credit_balance_cached + $2,
          credit_frozen_cached = 0,
          credit_frozen_at = NULL,
          credit_frozen_until = NULL,
          updated_at = $3
      WHERE id = $1
    `,
    [input.userId, amount, input.now],
  );

  return { restoredAmount: amount };
}

export async function expireFrozenWalletCreditsInTransaction(
  db: SqlDatabase,
  input: { now: Date; limit: number },
) {
  const users = await db.query<{
    id: string;
    credit_balance_cached: number;
    credit_frozen_cached: number;
    credit_frozen_until: Date | string;
  }>(
    `
      SELECT id, credit_balance_cached, credit_frozen_cached, credit_frozen_until
      FROM users
      WHERE credit_frozen_cached > 0
        AND credit_frozen_until IS NOT NULL
        AND credit_frozen_until <= $1
      ORDER BY credit_frozen_until ASC, updated_at ASC
      LIMIT $2
      FOR UPDATE
    `,
    [input.now, input.limit],
  );
  let expiredAmount = 0;

  for (const user of users.rows) {
    const amount = Number(user.credit_frozen_cached ?? 0);
    if (amount <= 0) continue;
    const ledger = await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO credit_ledger_entries (
          id,
          user_id,
          reservation_id,
          allocation_id,
          entry_type,
          amount,
          available_delta,
          reserved_delta,
          consumed_delta,
          balance_after,
          source_type,
          source_id,
          reason,
          metadata_json,
          created_by_user_id,
          created_at
        )
        VALUES ($1, $2, NULL, NULL, 'expire', $3, 0, 0, 0, $7, 'membership_frozen_credit_expiry', $6, '会员冻结积分过期失效', $4::jsonb, $2, $5)
        ON CONFLICT (user_id, source_type, source_id, entry_type)
        DO NOTHING
        RETURNING id
      `,
      [
        randomUUID(),
        user.id,
        amount,
        JSON.stringify({
          frozenUntil: new Date(user.credit_frozen_until).toISOString(),
        }),
        input.now,
        randomUUID(),
        Number(user.credit_balance_cached),
      ],
    );
    if (!ledger) {
      continue;
    }

    await db.query(
      `
        UPDATE credit_lots
        SET available_amount = 0,
            expired_amount = expired_amount + available_amount,
            status = 'expired',
            frozen_at = NULL,
            frozen_until = NULL,
            updated_at = $2
        WHERE user_id = $1
          AND status = 'frozen'
          AND available_amount > 0
          AND frozen_until <= $2
      `,
      [user.id, input.now],
    );
    await db.query(
      `
        UPDATE users
        SET credit_frozen_cached = 0,
            credit_frozen_at = NULL,
            credit_frozen_until = NULL,
            updated_at = $2
        WHERE id = $1
      `,
      [user.id, input.now],
    );
    expiredAmount += amount;
  }

  return { expiredAmount };
}

function lotFromRow(row: CreditLotRow): CreditLotRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    grantLedgerEntryId: row.grant_ledger_entry_id,
    totalAmount: row.total_amount,
    availableAmount: row.available_amount,
    reservedAmount: row.reserved_amount,
    consumedAmount: row.consumed_amount,
    expiredAmount: row.expired_amount,
    status: row.status,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    frozenAt: row.frozen_at ? new Date(row.frozen_at).toISOString() : null,
    frozenUntil: row.frozen_until ? new Date(row.frozen_until).toISOString() : null,
    metadata: normalizeObject(row.metadata_json),
  };
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
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
