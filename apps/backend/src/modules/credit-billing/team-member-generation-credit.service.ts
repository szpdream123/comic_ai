import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const TEAM_MEMBER_GENERATION_REFUND_SOURCE_TYPE = "team_member_generation_refund";

export function resolveGenerationBillingAmount(
  amountReserved: number | string | null | undefined,
  snapshot: Record<string, unknown>,
) {
  const batchBilling = snapshot.billing;
  if (batchBilling && typeof batchBilling === "object" && !Array.isArray(batchBilling)
    && (batchBilling as Record<string, unknown>).mode === "batch_reservation") {
    const batchAmount = Number(snapshot.cost ?? snapshot.estimatedCredits ?? snapshot.amount ?? 0);
    if (Number.isFinite(batchAmount) && batchAmount > 0) return batchAmount;
  }
  const reserved = Number(amountReserved ?? 0);
  if (Number.isFinite(reserved) && reserved > 0) {
    return reserved;
  }
  const snapshotAmount = Number(snapshot.cost ?? snapshot.estimatedCredits ?? snapshot.amount ?? 0);
  return Number.isFinite(snapshotAmount) && snapshotAmount > 0 ? snapshotAmount : 0;
}

export async function refundTeamMemberGenerationCredits(
  db: SqlDatabase,
  input: {
    teamMemberId: string;
    amount: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { refunded: false, amount: 0 };
  }
  await db.query("BEGIN");
  try {
    const result = await refundTeamMemberGenerationCreditsInTransaction(db, input);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function refundTeamMemberGenerationCreditsInTransaction(
  db: SqlDatabase,
  input: {
    teamMemberId: string;
    amount: number;
    sourceId: string;
    reason: string;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { refunded: false, amount: 0 };
  }
  const member = await queryOne<{ user_id: string; member_credits: number | string }>(
    db,
    `
      SELECT user_id, member_credits
      FROM team_members
      WHERE id = $1
        AND status <> 'deleted'
      FOR UPDATE
    `,
    [input.teamMemberId],
  );
  if (!member) {
    throw new Error("team_member_refund_target_missing");
  }
  const existing = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM credit_ledger_entries
      WHERE user_id = $1
        AND team_member_id = $2
        AND source_type = $3
        AND source_id = $4
        AND entry_type = 'grant'
      LIMIT 1
    `,
    [member.user_id, input.teamMemberId, TEAM_MEMBER_GENERATION_REFUND_SOURCE_TYPE, input.sourceId],
  );
  if (existing) {
    return { refunded: false, amount: 0 };
  }
  const updatedMember = await queryOne<{ member_credits: number | string }>(
    db,
    `
      UPDATE team_members
      SET member_credits = member_credits + $2,
          updated_at = $3
      WHERE id = $1
      RETURNING member_credits
    `,
    [input.teamMemberId, input.amount, input.now],
  );
  if (!updatedMember) {
    throw new Error("team_member_refund_target_missing");
  }
  await db.query(
    `
      INSERT INTO credit_ledger_entries (
        id,
        user_id,
        team_member_id,
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
      VALUES ($1, $2, $3, NULL, NULL, 'grant', $4, $4, 0, 0, $9, $5, $6, $7, $8::jsonb, NULL, $10)
    `,
    [
      randomUUID(),
      member.user_id,
      input.teamMemberId,
      input.amount,
      TEAM_MEMBER_GENERATION_REFUND_SOURCE_TYPE,
      input.sourceId,
      input.reason,
      JSON.stringify({ ...input.metadata, memberId: input.teamMemberId }),
      Number(updatedMember.member_credits),
      input.now,
    ],
  );
  return { refunded: true, amount: input.amount };
}
