import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  reserveCredits,
  settleReservationAllocation,
} from "../credit-billing/credit-ledger.service.ts";
import { refundTeamMemberGenerationCredits } from "../credit-billing/team-member-generation-credit.service.ts";

export interface CanvasAgentTextUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  totalTokens: number;
}

export const CANVAS_AGENT_CREDIT_REASON = "画布协作Agent操作消耗";
const CANVAS_AGENT_BILLING_MODE = "token";

export class CanvasAgentBillingService {
  constructor(private readonly db: SqlDatabase) {}

  async settleTask(input: {
    ownerUserId: string;
    actorTeamMemberId?: string | null;
    canvasId?: string | null;
    agentTaskId: string;
    workflowId?: string | null;
    workflowTaskId?: string | null;
    usage: CanvasAgentTextUsage;
    pricing: Record<string, unknown>;
    now: Date;
  }) {
    const totalTokens = positiveNumber(input.usage.totalTokens);
    const amount = totalTokens > 0
      ? Math.max(1, Math.ceil((totalTokens * canvasAgentTokenRate(input.pricing)) / 1_000_000))
      : 0;
    if (amount <= 0) {
      return { consumed: 0, totalTokens: 0 };
    }
    const metadata = {
      canvasId: input.canvasId ?? null,
      agentTaskId: input.agentTaskId,
      billingEvent: "actual_usage",
      usage: input.usage,
      actorTeamMemberId: input.actorTeamMemberId ?? null,
    };
    if (!input.actorTeamMemberId) {
      const reservation = await reserveCredits(this.db, {
        userId: input.ownerUserId,
        amount,
        sourceType: "canvas_agent_text_task",
        sourceId: input.agentTaskId,
        reason: CANVAS_AGENT_CREDIT_REASON,
        canvasProjectId: input.canvasId ?? null,
        workflowId: input.workflowId ?? null,
        taskId: input.workflowTaskId ?? null,
        metadata,
        createdByUserId: input.ownerUserId,
        now: input.now,
      });
      await settleReservationAllocation(this.db, {
        reservationId: reservation.reservation.id,
        allocationKey: `${input.agentTaskId}:consume`,
        amount,
        outcome: "consumed",
        taskId: input.workflowTaskId ?? null,
        metadata,
        now: input.now,
      });
      return { consumed: amount, totalTokens: input.usage.totalTokens };
    }

    await this.db.query("BEGIN");
    try {
      const existing = await queryOne<{ amount: number | string }>(
        this.db,
        `
          SELECT amount
          FROM credit_ledger_entries
          WHERE user_id = $1 AND team_member_id = $2
            AND source_type = 'canvas_agent_text_task' AND source_id = $3
            AND entry_type = 'transfer_out'
          LIMIT 1
        `,
        [input.ownerUserId, input.actorTeamMemberId, input.agentTaskId],
      );
      if (existing) {
        if (Number(existing.amount) !== amount) {
          throw new Error("canvas_agent_credit_settlement_conflict");
        }
        await this.db.query("COMMIT");
        return { consumed: amount, totalTokens: input.usage.totalTokens };
      }

      const member = await queryOne<{ member_credits: number | string }>(
        this.db,
        `
          SELECT member_credits
          FROM team_members
          WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL
          FOR UPDATE
        `,
        [input.actorTeamMemberId, input.ownerUserId],
      );
      if (!member || Number(member.member_credits) < amount) throw new Error("insufficient_credits");

      const updatedMember = await queryOne<{ member_credits: number | string }>(
        this.db,
        `
          UPDATE team_members
          SET member_credits = member_credits - $2::integer, updated_at = $3
          WHERE id = $1 AND user_id = $4 AND status = 'active' AND deleted_at IS NULL
          RETURNING member_credits
        `,
        [input.actorTeamMemberId, amount, input.now, input.ownerUserId],
      );
      if (!updatedMember) throw new Error("insufficient_credits");
      await this.db.query(
        `
          INSERT INTO credit_ledger_entries (
            id,user_id,team_member_id,entry_type,amount,available_delta,reserved_delta,
            consumed_delta,balance_after,source_type,source_id,reason,metadata_json,
            created_by_user_id,created_at
          ) VALUES ($1,$2,$3,'transfer_out',$4::integer,-($4::integer),0,0,$5,'canvas_agent_text_task',$6,$7,$8::jsonb,$2,$9)
        `,
        [
          randomUUID(), input.ownerUserId, input.actorTeamMemberId, amount,
          Number(updatedMember.member_credits), input.agentTaskId, CANVAS_AGENT_CREDIT_REASON,
          JSON.stringify(metadata), input.now,
        ],
      );
      await this.db.query("COMMIT");
      return { consumed: amount, totalTokens: input.usage.totalTokens };
    } catch (error) {
      await this.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  estimateRound(input: {
    pricing: Record<string, unknown>;
    maxTokens?: number;
    contextWindow?: number;
    maxPromptTokens?: number;
  }) {
    const maxTokens = positiveNumber(input.maxTokens) || positiveNumber(input.pricing.maxTokens) || 2_048;
    const contextWindow = positiveNumber(input.contextWindow);
    const maxPromptTokens = positiveNumber(input.maxPromptTokens);
    const totalTokenLimit = contextWindow || maxPromptTokens + maxTokens;
    const tokenEstimate = Math.ceil((totalTokenLimit * canvasAgentTokenRate(input.pricing)) / 1_000_000);
    return Math.max(1, tokenEstimate, Math.ceil(positiveNumber(input.pricing.minimumCredits)));
  }

  async reserveRound(input: {
    ownerUserId: string;
    actorTeamMemberId?: string | null;
    canvasId?: string | null;
    agentTaskId: string;
    workflowId?: string | null;
    workflowTaskId?: string | null;
    stepId: string;
    amount: number;
    reason?: string;
    metadata?: Record<string, unknown>;
    now: Date;
  }) {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("canvas_agent_credit_amount_invalid");
    const reason = input.reason?.trim() || CANVAS_AGENT_CREDIT_REASON;
    const metadata = {
      ...(input.metadata ?? {}),
      canvasId: input.canvasId ?? null,
      agentTaskId: input.agentTaskId,
      agentStepId: input.stepId,
      actorTeamMemberId: input.actorTeamMemberId ?? null,
      billingEvent: "reserved",
    };
    if (!input.actorTeamMemberId) {
      const result = await reserveCredits(this.db, {
        userId: input.ownerUserId,
        amount: input.amount,
        sourceType: "canvas_agent_text_round",
        sourceId: input.stepId,
        reason,
        canvasProjectId: input.canvasId ?? null,
        workflowId: input.workflowId ?? null,
        taskId: input.workflowTaskId ?? null,
        metadata,
        createdByUserId: input.ownerUserId,
        now: input.now,
      });
      return { kind: "reservation" as const, reservationId: result.reservation.id, amount: input.amount };
    }

    const sourceId = uuidFromStableId(input.stepId);
    await this.db.query("BEGIN");
    try {
      const member = await queryOne<{ member_credits: number | string }>(
        this.db,
        `
          SELECT member_credits
          FROM team_members
          WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL
          FOR UPDATE
        `,
        [input.actorTeamMemberId, input.ownerUserId],
      );
      if (!member) throw new Error("insufficient_credits");

      const existing = await queryOne<{ amount: number | string }>(
        this.db,
        `
          SELECT amount
          FROM credit_ledger_entries
          WHERE user_id = $1 AND team_member_id = $2
            AND source_type = 'canvas_agent_text_round' AND source_id = $3
            AND entry_type = 'transfer_out'
          LIMIT 1
        `,
        [input.ownerUserId, input.actorTeamMemberId, sourceId],
      );
      if (existing) {
        if (Number(existing.amount) !== input.amount) {
          throw new Error("canvas_agent_credit_reservation_conflict");
        }
        await this.db.query("COMMIT");
        return {
          kind: "team_member" as const,
          reservationId: null,
          amount: input.amount,
          sourceId,
        };
      }
      if (Number(member.member_credits) < input.amount) throw new Error("insufficient_credits");

      const updatedMember = await queryOne<{ member_credits: number | string }>(
        this.db,
        `
          UPDATE team_members
          SET member_credits = member_credits - $2::integer, updated_at = $3
          WHERE id = $1 AND user_id = $4 AND status = 'active' AND deleted_at IS NULL
          RETURNING member_credits
        `,
        [input.actorTeamMemberId, input.amount, input.now, input.ownerUserId],
      );
      if (!updatedMember) throw new Error("insufficient_credits");
      await this.db.query(
        `
          INSERT INTO credit_ledger_entries (
            id,user_id,team_member_id,entry_type,amount,available_delta,reserved_delta,
            consumed_delta,balance_after,source_type,source_id,reason,metadata_json,
            created_by_user_id,created_at
          ) VALUES ($1,$2,$3,'transfer_out',$4::integer,-($4::integer),0,0,$5,'canvas_agent_text_round',$6,$7,$8::jsonb,$2,$9)
        `,
        [
          randomUUID(), input.ownerUserId, input.actorTeamMemberId, input.amount,
          Number(updatedMember.member_credits), sourceId, reason,
          JSON.stringify(metadata), input.now,
        ],
      );
      await this.db.query("COMMIT");
      return {
        kind: "team_member" as const,
        reservationId: null,
        amount: input.amount,
        sourceId,
      };
    } catch (error) {
      await this.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }

  async settleRound(input: {
    ownerUserId: string;
    actorTeamMemberId?: string | null;
    canvasId?: string | null;
    agentTaskId: string;
    workflowTaskId?: string | null;
    stepId: string;
    reservationId: string | null;
    reservedAmount: number;
    usage: CanvasAgentTextUsage | null;
    pricing: Record<string, unknown>;
    providerRequestId?: string | null;
    reason?: string;
    metadata?: Record<string, unknown>;
    now: Date;
  }) {
    const actual = input.usage
      ? this.usageCost(input.pricing, input.usage)
      : input.reservedAmount;
    const consumed = Math.min(input.reservedAmount, Math.max(1, actual));
    if (input.reservationId) {
      await settleReservationAllocation(this.db, {
        reservationId: input.reservationId,
        allocationKey: `${input.stepId}:consume`,
        amount: consumed,
        outcome: "consumed",
        taskId: input.workflowTaskId ?? null,
        providerRequestId: input.providerRequestId ?? null,
        metadata: { ...(input.metadata ?? {}), canvasId: input.canvasId ?? null, agentStepId: input.stepId, usage: input.usage },
        now: input.now,
      });
      if (input.reservedAmount > consumed) {
        await settleReservationAllocation(this.db, {
          reservationId: input.reservationId,
          allocationKey: `${input.stepId}:release`,
          amount: input.reservedAmount - consumed,
          outcome: "released",
          taskId: input.workflowTaskId ?? null,
          providerRequestId: input.providerRequestId ?? null,
          metadata: { ...(input.metadata ?? {}), canvasId: input.canvasId ?? null, agentStepId: input.stepId },
          now: input.now,
        });
      }
      return { consumed, released: input.reservedAmount - consumed };
    }
    if (input.actorTeamMemberId && input.reservedAmount > consumed) {
      await refundTeamMemberGenerationCredits(this.db, {
        teamMemberId: input.actorTeamMemberId,
        amount: input.reservedAmount - consumed,
        sourceId: uuidFromStableId(input.stepId),
        reason: input.reason?.trim() || CANVAS_AGENT_CREDIT_REASON,
        metadata: { ...(input.metadata ?? {}), canvasId: input.canvasId ?? null, agentTaskId: input.agentTaskId, agentStepId: input.stepId },
        now: input.now,
      });
    }
    return { consumed, released: input.reservedAmount - consumed };
  }

  async releaseRound(input: {
    ownerUserId: string;
    actorTeamMemberId?: string | null;
    canvasId?: string | null;
    agentTaskId: string;
    workflowTaskId?: string | null;
    stepId: string;
    reservationId: string | null;
    reservedAmount: number;
    failureCode: string;
    reason?: string;
    metadata?: Record<string, unknown>;
    now: Date;
  }) {
    if (input.reservationId) {
      await settleReservationAllocation(this.db, {
        reservationId: input.reservationId,
        allocationKey: `${input.stepId}:release`,
        amount: input.reservedAmount,
        outcome: "released",
        taskId: input.workflowTaskId ?? null,
        metadata: {
          ...(input.metadata ?? {}),
          canvasId: input.canvasId ?? null,
          agentTaskId: input.agentTaskId,
          agentStepId: input.stepId,
          failureCode: input.failureCode,
        },
        now: input.now,
      });
      return { released: input.reservedAmount };
    }
    if (input.actorTeamMemberId) {
      await refundTeamMemberGenerationCredits(this.db, {
        teamMemberId: input.actorTeamMemberId,
        amount: input.reservedAmount,
        sourceId: uuidFromStableId(input.stepId),
        reason: input.reason?.trim() || CANVAS_AGENT_CREDIT_REASON,
        metadata: {
          ...(input.metadata ?? {}),
          canvasId: input.canvasId ?? null,
          agentTaskId: input.agentTaskId,
          agentStepId: input.stepId,
          failureCode: input.failureCode,
        },
        now: input.now,
      });
    }
    return { released: input.reservedAmount };
  }

  private usageCost(pricing: Record<string, unknown>, usage: CanvasAgentTextUsage) {
    const reportedComponents = positiveNumber(usage.promptTokens)
      + positiveNumber(usage.completionTokens)
      + positiveNumber(usage.cachedTokens);
    const totalTokens = reportedComponents || positiveNumber(usage.totalTokens);
    if (totalTokens <= 0) return 0;
    const tokenCost = Math.ceil((totalTokens * canvasAgentTokenRate(pricing)) / 1_000_000);
    return Math.max(1, tokenCost);
  }
}

function canvasAgentTokenRate(pricing: Record<string, unknown>) {
  const mode = String(pricing.canvasAgentBillingMode ?? CANVAS_AGENT_BILLING_MODE).trim().toLowerCase();
  if (mode !== CANVAS_AGENT_BILLING_MODE) {
    throw new Error("canvas_agent_token_billing_mode_invalid");
  }
  const rate = positiveNumber(pricing.canvasAgentTokenCreditsPerMillion)
    || positiveNumber(pricing.tokenCreditsPerMillion);
  if (!rate) {
    throw new Error("canvas_agent_token_price_missing");
  }
  return rate;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uuidFromStableId(value: string) {
  const hex = value.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
