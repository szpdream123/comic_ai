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
  totalTokens: number;
}

export class CanvasAgentBillingService {
  constructor(private readonly db: SqlDatabase) {}

  estimateRound(input: {
    pricing: Record<string, unknown>;
    maxTokens?: number;
  }) {
    const baseCredits = positiveNumber(input.pricing.baseCredits);
    const maxTokens = positiveNumber(input.maxTokens) || positiveNumber(input.pricing.maxTokens) || 2_048;
    const inputRate = positiveNumber(input.pricing.inputCreditsPerMillion)
      || positiveNumber(input.pricing.inputCreditsPer1M)
      || positiveNumber(input.pricing.promptCreditsPerMillion);
    const outputRate = positiveNumber(input.pricing.outputCreditsPerMillion)
      || positiveNumber(input.pricing.outputCreditsPer1M)
      || positiveNumber(input.pricing.completionCreditsPerMillion);
    const tokenEstimate = Math.ceil((maxTokens * (inputRate + outputRate)) / 1_000_000);
    return Math.max(1, Math.ceil(baseCredits || tokenEstimate || positiveNumber(input.pricing.minimumCredits) || 1));
  }

  async reserveRound(input: {
    ownerUserId: string;
    actorTeamMemberId?: string | null;
    canvasId: string;
    agentTaskId: string;
    workflowId?: string | null;
    workflowTaskId?: string | null;
    stepId: string;
    amount: number;
    now: Date;
  }) {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("canvas_agent_credit_amount_invalid");
    const metadata = {
      canvasId: input.canvasId,
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
        reason: "Canvas Agent text round",
        canvasProjectId: input.canvasId,
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
          Number(updatedMember.member_credits), sourceId, "Canvas Agent text round",
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
    canvasId: string;
    agentTaskId: string;
    workflowTaskId?: string | null;
    stepId: string;
    reservationId: string | null;
    reservedAmount: number;
    usage: CanvasAgentTextUsage | null;
    pricing: Record<string, unknown>;
    providerRequestId?: string | null;
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
        metadata: { canvasId: input.canvasId, agentStepId: input.stepId, usage: input.usage },
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
          metadata: { canvasId: input.canvasId, agentStepId: input.stepId },
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
        reason: "Canvas Agent text round unused reservation",
        metadata: { canvasId: input.canvasId, agentTaskId: input.agentTaskId, agentStepId: input.stepId },
        now: input.now,
      });
    }
    return { consumed, released: input.reservedAmount - consumed };
  }

  private usageCost(pricing: Record<string, unknown>, usage: CanvasAgentTextUsage) {
    const inputRate = positiveNumber(pricing.inputCreditsPerMillion)
      || positiveNumber(pricing.inputCreditsPer1M)
      || positiveNumber(pricing.promptCreditsPerMillion);
    const outputRate = positiveNumber(pricing.outputCreditsPerMillion)
      || positiveNumber(pricing.outputCreditsPer1M)
      || positiveNumber(pricing.completionCreditsPerMillion);
    const tokenCost = Math.ceil((usage.promptTokens * inputRate + usage.completionTokens * outputRate) / 1_000_000);
    return Math.max(1, tokenCost || positiveNumber(pricing.baseCredits) || 1);
  }
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uuidFromStableId(value: string) {
  const hex = value.replace(/[^0-9a-f]/gi, "").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
