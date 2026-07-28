import { createHash, randomUUID } from "node:crypto";

import type {
  CreditReservationAllocationStatus,
  CreditReservationStatus,
} from "../../../../../packages/contracts/domain/states.ts";
import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type { RecomputedCreditBalance } from "./credit-balance-reconciliation.contract.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  allocateCreditLotsForReservation,
  applyLotSettlement,
  createCreditLotInTransaction,
} from "./credit-lot.service.ts";

type CreditLedgerEntryType =
  | "grant"
  | "reservation"
  | "consume"
  | "release"
  | "expire"
  | "transfer_out"
  | "transfer_in"
  | "freeze"
  | "restore";
export type CreditAllocationOutcome = Extract<
  CreditReservationAllocationStatus,
  "consumed" | "released" | "manual_review_required"
>;

interface CreditGrantLotInput {
  sourceType: string;
  sourceId: string;
  expiresAt: Date | null;
  metadata?: Record<string, unknown>;
}

export interface CreditLedgerEntryRecord {
  id: string;
  userId: string;
  teamMemberId: string | null;
  reservationId: string | null;
  allocationId: string | null;
  entryType: CreditLedgerEntryType;
  amount: number;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
}

export interface CreditReservationRecord {
  id: string;
  userId: string;
  projectId: string | null;
  canvasProjectId?: string;
  workflowId: string | null;
  taskId: string | null;
  amountTotal: number;
  amountReserved: number;
  amountConsumed: number;
  amountReleased: number;
  status: CreditReservationStatus;
  sourceType: string;
  sourceId: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditReservationAllocationRecord {
  id: string;
  reservationId: string;
  userId: string;
  taskId: string | null;
  attemptId: string | null;
  providerRequestId: string | null;
  allocationKey: string;
  amount: number;
  status: CreditReservationAllocationStatus;
  settledLedgerEntryId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface CreditLedgerEntryRow {
  id: string;
  user_id: string;
  team_member_id: string | null;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: CreditLedgerEntryType;
  amount: number;
  available_delta: number;
  reserved_delta: number;
  consumed_delta: number;
  balance_after: number;
  source_type: string;
  source_id: string;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
}

interface CreditReservationRow {
  id: string;
  user_id: string;
  project_id: string | null;
  canvas_project_id: string | null;
  workflow_id: string | null;
  task_id: string | null;
  amount_total: number;
  amount_reserved: number;
  amount_consumed: number;
  amount_released: number;
  status: CreditReservationStatus;
  source_type: string;
  source_id: string;
  reason: string | null;
  metadata_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CreditReservationAllocationRow {
  id: string;
  reservation_id: string;
  user_id: string;
  task_id: string | null;
  attempt_id: string | null;
  provider_request_id: string | null;
  allocation_key: string;
  amount: number;
  status: CreditReservationAllocationStatus;
  settled_ledger_entry_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

export class InvalidCreditAmountError extends Error {
  readonly code = "invalid_credit_amount";

  constructor() {
    super("Credit amount must be a positive integer.");
  }
}

export class CreditLedgerConflictError extends Error {
  readonly code = "credit_ledger_conflict";

  constructor() {
    super("Credit ledger source was replayed with conflicting facts.");
  }
}

export class CreditReasonRequiredError extends Error {
  readonly code = "credit_reason_required";

  constructor() {
    super("Credit ledger facts require a non-empty reason.");
  }
}

export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits";

  constructor() {
    super("User does not have enough available credits to reserve.");
  }
}

export class CreditReservationNotFoundError extends Error {
  readonly code = "credit_reservation_not_found";

  constructor() {
    super("Credit reservation was not found.");
  }
}

export class CreditReservationAllocationConflictError extends Error {
  readonly code = "credit_reservation_allocation_conflict";

  constructor() {
    super("Credit reservation allocation key was replayed with conflicting facts.");
  }
}

export class CreditReservationBalanceError extends Error {
  readonly code = "credit_reservation_balance_error";

  constructor() {
    super("Credit reservation does not have enough reserved credits to settle.");
  }
}

export async function grantCredits(
  db: SqlDatabase,
  input: {
    userId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    lot?: CreditGrantLotInput;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<CreditLedgerEntryRecord> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);

  await db.query("BEGIN");
  try {
    const entry = await grantCreditsInTransaction(db, {
      ...input,
      reason,
    });

    await db.query("COMMIT");
    return entry;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function grantCreditsInTransaction(
  db: SqlDatabase,
  input: {
    userId: string;
    amount: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    lot?: CreditGrantLotInput;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<CreditLedgerEntryRecord> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);
  const walletUserId = input.userId;
  const wallet = await findCreditWalletForUpdate(db, { userId: walletUserId });
  if (!wallet) {
    throw new CreditLedgerConflictError();
  }
  const inserted = await insertLedgerEntry(db, {
    userId: walletUserId,
    reservationId: null,
    allocationId: null,
    entryType: "grant",
    amount: input.amount,
    availableDelta: input.amount,
    reservedDelta: 0,
    consumedDelta: 0,
    balanceAfter: Number(wallet.credit_balance_cached) + input.amount,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    reason,
    metadata: input.metadata ?? {},
    createdByUserId: input.createdByUserId ?? walletUserId,
    now: input.now,
  });

  if (inserted.kind === "inserted") {
    await incrementCreditWallet(db, {
      userId: walletUserId,
      availableDelta: input.amount,
      reservedDelta: 0,
      now: input.now,
    });
    await appendCreditGrantCreatedOutboxEvent(db, {
      userId: walletUserId,
      ledgerEntry: inserted.entry,
      now: input.now,
    });
    await createCreditLotInTransaction(db, {
      userId: walletUserId,
      sourceType: input.lot?.sourceType ?? input.sourceType,
      sourceId: input.lot?.sourceId ?? input.sourceId,
      grantLedgerEntryId: inserted.entry.id,
      amount: input.amount,
      expiresAt: input.lot?.expiresAt ?? null,
      metadata: input.lot?.metadata ?? {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      },
      now: input.now,
    });
  }

  return inserted.entry;
}

export async function grantPromptSkillUsageCredits(
  db: SqlDatabase,
  input: PromptSkillUsageCreditInput,
) {
  if (!shouldGrantPromptSkillUsageCredits(input)) return null;
  return grantCredits(db, buildPromptSkillUsageGrant(input));
}

export async function grantPromptSkillUsageCreditsInTransaction(
  db: SqlDatabase,
  input: PromptSkillUsageCreditInput,
) {
  if (!shouldGrantPromptSkillUsageCredits(input)) return null;
  return grantCreditsInTransaction(db, buildPromptSkillUsageGrant(input));
}

interface PromptSkillUsageCreditInput {
  skill: {
    id?: unknown;
    category?: unknown;
    title?: unknown;
    priceCredits?: unknown;
    official?: unknown;
    ownerUserId?: unknown;
  } | null | undefined;
  sourceId: string;
  payerUserId: string;
  teamMemberId?: string | null;
  projectId?: string | null;
  modelCode?: string | null;
  now: Date;
}

function shouldGrantPromptSkillUsageCredits(input: PromptSkillUsageCreditInput) {
  return input.skill?.official === false
    && Boolean(String(input.skill?.ownerUserId ?? "").trim())
    && Math.round(Number(input.skill?.priceCredits) || 0) > 0;
}

function buildPromptSkillUsageGrant(input: PromptSkillUsageCreditInput) {
  const skill = input.skill!;
  const amount = Math.max(0, Math.round(Number(skill.priceCredits) || 0));
  return {
    userId: String(skill.ownerUserId),
    amount,
    sourceType: "prompt_skill_usage_earning",
    sourceId: input.sourceId,
    reason: "私人提示词技能使用分成",
    metadata: {
      skillId: String(skill.id ?? ""),
      skillCategory: String(skill.category ?? ""),
      skillTitle: String(skill.title ?? ""),
      payerUserId: input.payerUserId,
      teamMemberId: input.teamMemberId ?? null,
      projectId: input.projectId ?? null,
      modelCode: input.modelCode ?? null,
      skillCreditCost: amount,
    },
    createdByUserId: input.payerUserId,
    now: input.now,
  };
}

export async function grantPromptSkillsUsageCredits(
  db: SqlDatabase,
  input: Omit<PromptSkillUsageCreditInput, "skill"> & {
    skills: Array<NonNullable<PromptSkillUsageCreditInput["skill"]>>;
  },
) {
  const skills = input.skills.filter((skill, index, items) => {
    const skillId = String(skill?.id ?? "").trim();
    return skillId && items.findIndex((item) => String(item?.id ?? "").trim() === skillId) === index;
  });
  const results = [];
  for (const skill of skills) {
    const sourceId = skills.length === 1
      ? input.sourceId
      : stablePromptSkillUsageSourceId(input.sourceId, String(skill.id));
    results.push(await grantPromptSkillUsageCredits(db, {
      ...input,
      skill,
      sourceId,
    }));
  }
  return results;
}

function stablePromptSkillUsageSourceId(taskId: string, skillId: string) {
  const hex = createHash("sha256").update(`prompt-skill-usage:${taskId}:${skillId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export class WalletFrozenMembershipRequiredError extends Error {
  readonly code = "wallet_frozen_membership_required";

  constructor() {
    super("Membership renewal is required before frozen wallet credits can be used.");
  }
}

export async function transferCreditsBetweenUsersInTransaction(
  db: SqlDatabase,
  input: {
    sourceUserId: string;
    targetUserId: string;
    amount: number;
    sourceId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  sourceLedgerEntry: CreditLedgerEntryRecord;
  targetLedgerEntry: CreditLedgerEntryRecord;
}> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);
  if (input.sourceUserId === input.targetUserId) {
    throw new CreditLedgerConflictError();
  }

  const wallets = new Map<string, Awaited<ReturnType<typeof findCreditWalletForUpdate>>>();
  for (const userId of [input.sourceUserId, input.targetUserId].sort()) {
    wallets.set(userId, await findCreditWalletForUpdate(db, { userId }));
  }
  const sourceWallet = wallets.get(input.sourceUserId);
  const targetWallet = wallets.get(input.targetUserId);
  if (!sourceWallet || !targetWallet) {
    throw new CreditLedgerConflictError();
  }

  const sourceEntry = await insertLedgerEntry(db, {
    userId: input.sourceUserId,
    reservationId: null,
    allocationId: null,
    entryType: "transfer_out",
    amount: input.amount,
    availableDelta: -input.amount,
    reservedDelta: 0,
    consumedDelta: 0,
    balanceAfter: Number(sourceWallet.credit_balance_cached) - input.amount,
    sourceType: "credit_wallet_transfer",
    sourceId: input.sourceId,
    reason,
    metadata: input.metadata ?? {},
    createdByUserId: input.createdByUserId ?? null,
    now: input.now,
  });
  const targetEntry = await insertLedgerEntry(db, {
    userId: input.targetUserId,
    reservationId: null,
    allocationId: null,
    entryType: "transfer_in",
    amount: input.amount,
    availableDelta: input.amount,
    reservedDelta: 0,
    consumedDelta: 0,
    balanceAfter: Number(targetWallet.credit_balance_cached) + input.amount,
    sourceType: "credit_wallet_transfer",
    sourceId: input.sourceId,
    reason,
    metadata: input.metadata ?? {},
    createdByUserId: input.createdByUserId ?? null,
    now: input.now,
  });

  if (sourceEntry.kind === "inserted") {
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = credit_balance_cached - $2,
            updated_at = $3
        WHERE id = $1
      `,
      [input.sourceUserId, input.amount, input.now],
    );
  }

  if (targetEntry.kind === "inserted") {
    await db.query(
      `
        UPDATE users
        SET credit_balance_cached = credit_balance_cached + $2,
            updated_at = $3
        WHERE id = $1
      `,
      [input.targetUserId, input.amount, input.now],
    );
  }

  return {
    sourceLedgerEntry: sourceEntry.entry,
    targetLedgerEntry: targetEntry.entry,
  };
}

export async function reserveCredits(
  db: SqlDatabase,
  input: {
    userId?: string | null;
    amount: number;
    sourceType: string;
    sourceId: string;
    reason?: string | null;
    projectId?: string | null;
    canvasProjectId?: string | null;
    workflowId?: string | null;
    taskId?: string | null;
    metadata?: Record<string, unknown>;
    createdByUserId?: string | null;
    now: Date;
  },
): Promise<{
  reservation: CreditReservationRecord;
  ledgerEntry: CreditLedgerEntryRecord;
}> {
  await db.query("BEGIN");
  try {
    const result = await reserveCreditsInTransaction(db, input);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function reserveCreditsInTransaction(
  db: SqlDatabase,
  input: Parameters<typeof reserveCredits>[1],
): ReturnType<typeof reserveCredits> {
  assertPositiveAmount(input.amount);
  const reason = requireCreditReason(input.reason);
  const walletUserId = resolveCreditWalletUserId(input.userId, input.createdByUserId, input.metadata);
  const existing = await findReservationBySource(db, {
    userId: walletUserId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (existing) {
    if (existing.amountTotal !== input.amount) {
      throw new CreditLedgerConflictError();
    }
    const existingLedger = await findLedgerEntryBySource(db, {
      userId: walletUserId,
      entryType: "reservation",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    });
    if (!existingLedger || existing.userId !== walletUserId) {
      throw new CreditLedgerConflictError();
    }
    return { reservation: existing, ledgerEntry: existingLedger };
  }

  const wallet = await findCreditWalletForUpdate(db, { userId: walletUserId });
  if (Number(wallet?.credit_frozen_cached ?? 0) > 0) {
    throw new WalletFrozenMembershipRequiredError();
  }
  if (!wallet || Number(wallet.credit_balance_cached ?? 0) < input.amount) {
    throw new InsufficientCreditsError();
  }

  const reservationId = randomUUID();
  const reservationRow = await queryOne<CreditReservationRow>(
    db,
    `
      INSERT INTO credit_reservations (
        id, user_id, project_id, canvas_project_id, workflow_id, task_id,
        amount_total, amount_reserved, amount_consumed, amount_released, status,
        source_type, source_id, reason, metadata_json, created_by_user_id, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $7, 0, 0, 'active',
        $8, $9, $10, $11::jsonb, $12, $13, $13
      )
      RETURNING *
    `,
    [
      reservationId,
      walletUserId,
      input.projectId ?? null,
      input.canvasProjectId ?? null,
      input.workflowId ?? null,
      input.taskId ?? null,
      input.amount,
      input.sourceType,
      input.sourceId,
      reason,
      JSON.stringify(input.metadata ?? {}),
      input.createdByUserId ?? walletUserId,
      input.now,
    ],
  );

  await allocateCreditLotsForReservation(db, {
    userId: walletUserId,
    reservationId,
    amount: input.amount,
    now: input.now,
  });
  await incrementCreditWallet(db, {
    userId: walletUserId,
    availableDelta: -input.amount,
    reservedDelta: input.amount,
    now: input.now,
  });
  const ledger = await insertLedgerEntry(db, {
    userId: walletUserId,
    reservationId,
    allocationId: null,
    entryType: "reservation",
    amount: input.amount,
    availableDelta: -input.amount,
    reservedDelta: input.amount,
    consumedDelta: 0,
    balanceAfter: Number(wallet.credit_balance_cached) - input.amount,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    reason,
    metadata: input.metadata ?? {},
    createdByUserId: input.createdByUserId ?? walletUserId,
    now: input.now,
  });
  return {
    reservation: reservationFromRow(reservationRow!),
    ledgerEntry: ledger.entry,
  };
}

export async function settleReservationAllocation(
  db: SqlDatabase,
  input: {
    reservationId: string;
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    now: Date;
  },
): Promise<{
  allocation: CreditReservationAllocationRecord;
  ledgerEntry: CreditLedgerEntryRecord | null;
  reservation: CreditReservationRecord;
}> {
  await db.query("BEGIN");
  try {
    const result = await settleReservationAllocationInTransaction(db, input);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function settleReservationAllocationInTransaction(
  db: SqlDatabase,
  input: {
    reservationId: string;
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    now: Date;
  },
): Promise<{
  allocation: CreditReservationAllocationRecord;
  ledgerEntry: CreditLedgerEntryRecord | null;
  reservation: CreditReservationRecord;
}> {
  assertPositiveAmount(input.amount);

  const reservation = await findReservationById(db, input.reservationId);
  if (!reservation) {
    throw new CreditReservationNotFoundError();
  }
  const allocationKey = reservation.sourceType === "canvas_generation_batch"
    && !reservation.taskId && input.taskId
    ? `${input.taskId}:${input.allocationKey}`
    : input.allocationKey;
  const normalizedInput = { ...input, allocationKey };

  const existingAllocation = await findAllocationByKey(db, {
    reservationId: input.reservationId,
    allocationKey,
  });

  if (existingAllocation) {
    assertAllocationReplayMatches(existingAllocation, normalizedInput);

    const ledgerEntry = existingAllocation.settledLedgerEntryId
      ? await findLedgerEntryById(db, existingAllocation.settledLedgerEntryId)
      : null;

    return {
      allocation: existingAllocation,
      ledgerEntry,
      reservation,
    };
  }

  const allocationId = randomUUID();
  const allocationRow = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      INSERT INTO credit_reservation_allocations (
        id,
        reservation_id,
        user_id,
        task_id,
        attempt_id,
        provider_request_id,
        allocation_key,
        amount,
        status,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
      RETURNING *
    `,
    [
      allocationId,
      reservation.id,
      reservation.userId,
      input.taskId ?? null,
      input.attemptId ?? null,
      input.providerRequestId ?? null,
      allocationKey,
      input.amount,
      input.outcome,
      JSON.stringify(input.metadata ?? {}),
      input.now,
    ],
  );

  if (input.outcome === "manual_review_required") {
    const reviewedReservation = await markReservationManualReviewRequired(db, {
      reservationId: reservation.id,
      now: input.now,
    });

    return {
      allocation: allocationFromRow(allocationRow!),
      ledgerEntry: null,
      reservation: reviewedReservation,
    };
  }

  const ledgerEntryType = input.outcome === "consumed" ? "consume" : "release";
  const deltas =
    input.outcome === "consumed"
      ? {
          availableDelta: 0,
          reservedDelta: -input.amount,
          consumedDelta: input.amount,
        }
      : {
          availableDelta: input.amount,
          reservedDelta: -input.amount,
          consumedDelta: 0,
        };

  const updatedReservation = await applyReservationSettlement(db, {
    reservationId: reservation.id,
    amount: input.amount,
    outcome: input.outcome,
    now: input.now,
  });
  await applyLotSettlement(db, {
    userId: reservation.userId,
    reservationId: reservation.id,
    amount: input.amount,
    outcome: input.outcome,
    now: input.now,
  });

  const wallet = await findCreditWalletForUpdate(db, { userId: reservation.userId });
  if (!wallet) {
    throw new CreditLedgerConflictError();
  }

  const ledger = await insertLedgerEntry(db, {
    userId: reservation.userId,
    reservationId: reservation.id,
    allocationId,
    entryType: ledgerEntryType,
    amount: input.amount,
    ...deltas,
    balanceAfter: Number(wallet.credit_balance_cached) + deltas.availableDelta,
    sourceType: "credit_reservation_allocation",
    sourceId: allocationId,
    reason: `reservation allocation ${input.outcome}`,
    metadata: input.metadata ?? {},
    createdByUserId: null,
    now: input.now,
  });

  await incrementCreditWallet(db, {
    userId: reservation.userId,
    availableDelta: input.outcome === "released" ? input.amount : 0,
    reservedDelta: -input.amount,
    now: input.now,
  });

  const settledAllocation = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      UPDATE credit_reservation_allocations
      SET settled_ledger_entry_id = $2,
          updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [allocationId, ledger.entry.id, input.now],
  );

  return {
    allocation: allocationFromRow(settledAllocation!),
    ledgerEntry: ledger.entry,
    reservation: updatedReservation,
  };
}

export async function assertExternalCreditReservationInTransaction(
  db: SqlDatabase,
  input: {
    reservationId: string;
    userId: string;
    canvasProjectId: string;
    amount: number;
  },
) {
  assertPositiveAmount(input.amount);
  const row = await queryOne<CreditReservationRow>(db, `
    SELECT * FROM credit_reservations WHERE id=$1 FOR UPDATE
  `, [input.reservationId]);
  const reservation = row ? reservationFromRow(row) : undefined;
  if (
    !reservation
    || reservation.userId !== input.userId
    || reservation.canvasProjectId !== input.canvasProjectId
    || reservation.sourceType !== "canvas_generation_batch"
    || !["active", "partially_settled"].includes(reservation.status)
    || reservation.amountReserved < input.amount
  ) {
    throw new CreditLedgerConflictError();
  }
  return reservation;
}

export async function repairCreditBalanceCache(
  db: SqlDatabase,
  input: { userId: string },
): Promise<RecomputedCreditBalance> {
  const balance = await queryOne<{
    available: number;
    reserved: number;
    consumed: number;
    frozen: number;
    frozen_at: Date | string | null;
    frozen_until: Date | string | null;
  }>(
    db,
    `
      WITH ledger_balance AS (
        SELECT
          COALESCE(sum(available_delta), 0)::int AS available,
          COALESCE(sum(reserved_delta), 0)::int AS reserved,
          COALESCE(sum(consumed_delta), 0)::int AS consumed
        FROM credit_ledger_entries
        WHERE user_id = $1
          AND team_member_id IS NULL
          AND source_type <> 'credit_lot_expiry'
      )
      SELECT
        ledger_balance.available,
        ledger_balance.reserved,
        ledger_balance.consumed,
        0::int AS frozen,
        NULL::timestamptz AS frozen_at,
        NULL::timestamptz AS frozen_until
      FROM ledger_balance
    `,
    [input.userId],
  );

  const frozen = Number(balance?.frozen ?? 0);
  const recomputed = {
    userId: input.userId,
    available: balance?.available ?? 0,
    reserved: balance?.reserved ?? 0,
    consumed: balance?.consumed ?? 0,
    frozen,
  };

  await db.query(
    `
      UPDATE users
      SET credit_balance_cached = $2,
          credit_reserved_cached = $3,
          credit_frozen_cached = $4,
          credit_frozen_at = $5,
          credit_frozen_until = $6,
          updated_at = now()
      WHERE id = $1
    `,
    [
      input.userId,
      recomputed.available,
      recomputed.reserved,
      recomputed.frozen,
      recomputed.frozen > 0 ? (balance?.frozen_at ?? null) : null,
      recomputed.frozen > 0 ? (balance?.frozen_until ?? null) : null,
    ],
  );

  return recomputed;
}

async function insertLedgerEntry(
  db: SqlDatabase,
  input: {
    userId: string;
    reservationId: string | null;
    allocationId: string | null;
    entryType: CreditLedgerEntryType;
    amount: number;
    availableDelta: number;
    reservedDelta: number;
    consumedDelta: number;
    balanceAfter: number;
    sourceType: string;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    createdByUserId: string | null;
    now: Date;
  },
): Promise<{ kind: "inserted" | "reused"; entry: CreditLedgerEntryRecord }> {
  const row = await queryOne<CreditLedgerEntryRow>(
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
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14::jsonb, $15, $16
      )
      ON CONFLICT (user_id, source_type, source_id, entry_type)
      DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.userId,
      input.reservationId,
      input.allocationId,
      input.entryType,
      input.amount,
      input.availableDelta,
      input.reservedDelta,
      input.consumedDelta,
      input.balanceAfter,
      input.sourceType,
      input.sourceId,
      input.reason,
      JSON.stringify(input.metadata),
      input.createdByUserId,
      input.now,
    ],
  );

  if (row) {
    return {
      kind: "inserted",
      entry: ledgerEntryFromRow(row),
    };
  }

  const existing = await findLedgerEntryBySource(db, {
    userId: input.userId,
    entryType: input.entryType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });

  if (
    !existing ||
    existing.amount !== input.amount ||
    existing.availableDelta !== input.availableDelta ||
    existing.reservedDelta !== input.reservedDelta ||
    existing.consumedDelta !== input.consumedDelta ||
    existing.reservationId !== input.reservationId ||
    existing.allocationId !== input.allocationId ||
    existing.userId !== input.userId
  ) {
    throw new CreditLedgerConflictError();
  }

  return {
    kind: "reused",
    entry: existing,
  };
}

function resolveCreditWalletUserId(
  userId: string | null | undefined,
  createdByUserId: string | null | undefined,
  metadata: Record<string, unknown> | undefined,
) {
  const explicit = String(userId ?? "").trim();
  if (explicit) return explicit;
  const targetUserId = String(metadata?.targetUserId ?? metadata?.target_user_id ?? "").trim();
  if (targetUserId) return targetUserId;
  const creator = String(createdByUserId ?? "").trim();
  if (!creator) {
    throw new CreditLedgerConflictError();
  }
  return creator;
}

async function findCreditWalletForUpdate(
  db: SqlDatabase,
  input: { userId: string },
) {
  return queryOne<{
    id: string;
    credit_balance_cached: number;
    credit_reserved_cached: number;
    credit_frozen_cached: number;
  }>(
    db,
    `
      SELECT id, credit_balance_cached, credit_reserved_cached, credit_frozen_cached
      FROM users
      WHERE id = $1
      FOR UPDATE
    `,
    [input.userId],
  );
}

async function incrementCreditWallet(
  db: SqlDatabase,
  input: {
    userId: string;
    availableDelta: number;
    reservedDelta: number;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE users
      SET credit_balance_cached = credit_balance_cached + $2,
          credit_reserved_cached = GREATEST(0, credit_reserved_cached + $3),
          updated_at = $4
      WHERE id = $1
    `,
    [input.userId, input.availableDelta, input.reservedDelta, input.now],
  );
}

async function appendCreditGrantCreatedOutboxEvent(
  db: SqlDatabase,
  input: {
    userId: string;
    ledgerEntry: CreditLedgerEntryRecord;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        user_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $5, $5)
    `,
    [
      randomUUID(),
      input.userId,
      eventTypes.creditGrantCreated,
      JSON.stringify({
        ledger_entry_id: input.ledgerEntry.id,
        source_type: input.ledgerEntry.sourceType,
        source_id: input.ledgerEntry.sourceId,
        amount: input.ledgerEntry.amount,
      }),
      input.now,
    ],
  );
}

async function applyReservationSettlement(
  db: SqlDatabase,
  input: {
    reservationId: string;
    amount: number;
    outcome: Exclude<CreditAllocationOutcome, "manual_review_required">;
    now: Date;
  },
): Promise<CreditReservationRecord> {
  const consumedDelta = input.outcome === "consumed" ? input.amount : 0;
  const releasedDelta = input.outcome === "released" ? input.amount : 0;
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      UPDATE credit_reservations
      SET amount_reserved = amount_reserved - $2,
          amount_consumed = amount_consumed + $3,
          amount_released = amount_released + $4,
          status = CASE
            WHEN amount_reserved - $2 = 0
              AND amount_consumed + $3 = 0
              AND amount_released + $4 = amount_total THEN 'released'
            WHEN amount_reserved - $2 = 0
              AND amount_consumed + $3 + amount_released + $4 = amount_total THEN 'settled'
            WHEN amount_reserved - $2 = 0 AND amount_consumed + $3 = 0 THEN 'released'
            ELSE 'partially_settled'
          END,
          updated_at = $5
      WHERE id = $1
        AND amount_reserved >= $2
        AND status IN ('active', 'partially_settled')
      RETURNING *
    `,
    [
      input.reservationId,
      input.amount,
      consumedDelta,
      releasedDelta,
      input.now,
    ],
  );

  if (!row) {
    throw new CreditReservationBalanceError();
  }

  return reservationFromRow(row);
}

async function markReservationManualReviewRequired(
  db: SqlDatabase,
  input: { reservationId: string; now: Date },
): Promise<CreditReservationRecord> {
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      UPDATE credit_reservations
      SET status = 'manual_review_required',
          updated_at = $2
      WHERE id = $1
      RETURNING *
    `,
    [input.reservationId, input.now],
  );

  return reservationFromRow(row!);
}

async function findLedgerEntryBySource(
  db: SqlDatabase,
  input: {
    userId: string;
    entryType: CreditLedgerEntryType;
    sourceType: string;
    sourceId: string;
  },
): Promise<CreditLedgerEntryRecord | undefined> {
  const row = await queryOne<CreditLedgerEntryRow>(
    db,
    `
      SELECT *
      FROM credit_ledger_entries
      WHERE user_id = $1
        AND entry_type = $2
        AND source_type = $3
        AND source_id = $4
      LIMIT 1
    `,
    [
      input.userId,
      input.entryType,
      input.sourceType,
      input.sourceId,
    ],
  );

  return row ? ledgerEntryFromRow(row) : undefined;
}

async function findLedgerEntryById(
  db: SqlDatabase,
  ledgerEntryId: string,
): Promise<CreditLedgerEntryRecord | null> {
  const row = await queryOne<CreditLedgerEntryRow>(
    db,
    "SELECT * FROM credit_ledger_entries WHERE id = $1",
    [ledgerEntryId],
  );

  return row ? ledgerEntryFromRow(row) : null;
}

async function findReservationBySource(
  db: SqlDatabase,
  input: { userId: string; sourceType: string; sourceId: string },
): Promise<CreditReservationRecord | undefined> {
  const row = await queryOne<CreditReservationRow>(
    db,
    `
      SELECT *
      FROM credit_reservations
      WHERE user_id = $1
        AND source_type = $2
        AND source_id = $3
      LIMIT 1
    `,
    [input.userId, input.sourceType, input.sourceId],
  );

  return row ? reservationFromRow(row) : undefined;
}

async function findReservationById(
  db: SqlDatabase,
  reservationId: string,
): Promise<CreditReservationRecord | undefined> {
  const row = await queryOne<CreditReservationRow>(
    db,
    "SELECT * FROM credit_reservations WHERE id = $1",
    [reservationId],
  );

  return row ? reservationFromRow(row) : undefined;
}

async function findAllocationByKey(
  db: SqlDatabase,
  input: { reservationId: string; allocationKey: string },
): Promise<CreditReservationAllocationRecord | undefined> {
  const row = await queryOne<CreditReservationAllocationRow>(
    db,
    `
      SELECT *
      FROM credit_reservation_allocations
      WHERE reservation_id = $1
        AND allocation_key = $2
      LIMIT 1
    `,
    [input.reservationId, input.allocationKey],
  );

  return row ? allocationFromRow(row) : undefined;
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidCreditAmountError();
  }
}

function requireCreditReason(reason: string | null | undefined): string {
  const normalized = reason?.trim();
  if (!normalized) {
    throw new CreditReasonRequiredError();
  }
  return normalizeCreditLedgerReason(normalized);
}

function normalizeCreditLedgerReason(reason: string): string {
  const normalized = reason.trim().toLowerCase();
  if (!normalized) {
    return reason.trim();
  }
  const aliases: Record<string, string> = {
    "membership period gifted credits": "会员赠送积分",
    "wallet freeze removed and credits released": "会员续费解冻积分",
    "membership lapsed wallet frozen": "会员到期冻结积分",
    "membership frozen credits expired": "会员冻结积分过期失效",
    "credit lot expired": "积分批次过期失效",
  };
  return aliases[normalized] ?? reason.trim();
}

function assertAllocationReplayMatches(
  existing: CreditReservationAllocationRecord,
  input: {
    allocationKey: string;
    amount: number;
    outcome: CreditAllocationOutcome;
    taskId?: string | null;
    attemptId?: string | null;
    providerRequestId?: string | null;
  },
): void {
  if (
    existing.amount !== input.amount ||
    existing.status !== input.outcome ||
    existing.taskId !== (input.taskId ?? null) ||
    existing.attemptId !== (input.attemptId ?? null) ||
    existing.providerRequestId !== (input.providerRequestId ?? null)
  ) {
    throw new CreditReservationAllocationConflictError();
  }
}

function ledgerEntryFromRow(row: CreditLedgerEntryRow): CreditLedgerEntryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    teamMemberId: row.team_member_id,
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: row.amount,
    availableDelta: row.available_delta,
    reservedDelta: row.reserved_delta,
    consumedDelta: row.consumed_delta,
    balanceAfter: row.balance_after,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
  };
}

function reservationFromRow(row: CreditReservationRow): CreditReservationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    ...(row.canvas_project_id ? { canvasProjectId: row.canvas_project_id } : {}),
    workflowId: row.workflow_id,
    taskId: row.task_id,
    amountTotal: row.amount_total,
    amountReserved: row.amount_reserved,
    amountConsumed: row.amount_consumed,
    amountReleased: row.amount_released,
    status: row.status,
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: row.metadata_json,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function allocationFromRow(
  row: CreditReservationAllocationRow,
): CreditReservationAllocationRecord {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    userId: row.user_id,
    taskId: row.task_id,
    attemptId: row.attempt_id,
    providerRequestId: row.provider_request_id,
    allocationKey: row.allocation_key,
    amount: row.amount,
    status: row.status,
    settledLedgerEntryId: row.settled_ledger_entry_id,
    metadata: row.metadata_json,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
