import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  reserveCredits,
  settleReservationAllocation,
} from "./credit-ledger.service.ts";

export class MembershipCreditGateError extends Error {
  constructor(
    readonly code: "membership_required" | "membership_expired" | "insufficient_credits",
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function verifyMembershipAndConsumeCredits(
  db: SqlDatabase,
  input: {
    userId: string;
    requiredCredits: number;
    organizationId?: string | null;
    workspaceId?: string | null;
    projectId?: string | null;
    idempotencyKey?: string | null;
    sourceType: string;
    sourceId?: string | null;
    reason: string;
    allocationKey: string;
    metadata?: Record<string, unknown>;
    now: Date;
  },
) {
  const amount = Number(input.requiredCredits);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const scope = input.organizationId
    ? {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId ?? null,
      }
    : await resolveUserCreditScope(db, input.userId);
  if (!scope) {
    throw new MembershipCreditGateError("membership_required", "请充值会员。", 403);
  }

  const membershipStatus = await resolveMembershipStatus(db, {
    userId: input.userId,
    now: input.now,
  });
  if (membershipStatus === "none") {
    throw new MembershipCreditGateError("membership_required", "请充值会员。", 403);
  }
  if (membershipStatus === "expired") {
    throw new MembershipCreditGateError("membership_expired", "您的会员已过期，请前往续充。", 403);
  }

  try {
    const reservation = await reserveCredits(db, {
      organizationId: scope.organizationId,
      userId: input.userId,
      workspaceId: scope.workspaceId,
      projectId: input.projectId ?? null,
      amount: Math.round(amount),
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? sourceIdFromKey(input.idempotencyKey),
      reason: input.reason,
      metadata: input.metadata ?? {},
      createdByUserId: input.userId,
      now: input.now,
    });
    await settleReservationAllocation(db, {
      reservationId: reservation.reservation.id,
      allocationKey: input.allocationKey,
      amount: Math.round(amount),
      outcome: "consumed",
      metadata: input.metadata ?? {},
      now: input.now,
    });
    return reservation;
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: unknown }).code === "insufficient_credits") {
      throw new MembershipCreditGateError("insufficient_credits", "积分不足，请前往充值积分。", 402);
    }
    throw error;
  }
}

async function resolveUserCreditScope(db: SqlDatabase, userId: string) {
  const row = await queryOne<{
    organization_id: string;
    workspace_id: string | null;
  }>(
    db,
    `
      SELECT m.organization_id, m.workspace_id
      FROM memberships m
      WHERE m.user_id = $1
        AND m.status = 'active'
      ORDER BY
        CASE WHEN m.role = 'owner_admin' THEN 0 ELSE 1 END,
        m.created_at ASC
      LIMIT 1
    `,
    [userId],
  );
  return row
    ? {
        organizationId: row.organization_id,
        workspaceId: row.workspace_id,
      }
    : null;
}

async function resolveMembershipStatus(
  db: SqlDatabase,
  input: { userId: string; now: Date },
): Promise<"active" | "expired" | "none"> {
  const activePeriod = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM memberships
      WHERE user_id = $1
        AND membership_tier IN ('experience', 'professional')
        AND expires_at > $2
      LIMIT 1
    `,
    [input.userId, input.now],
  );
  if (activePeriod) {
    return "active";
  }

  const anyPeriod = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM memberships
      WHERE user_id = $1
        AND membership_tier IN ('experience', 'professional')
      LIMIT 1
    `,
    [input.userId],
  );
  return anyPeriod ? "expired" : "none";
}

function sourceIdFromKey(idempotencyKey: string | null | undefined) {
  const normalized = idempotencyKey?.trim();
  if (!normalized) {
    return randomUUID();
  }
  const hex = createHash("sha256").update(normalized).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
