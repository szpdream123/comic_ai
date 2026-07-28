import type { SqlDatabase } from "../shared/db/sql.ts";
import { settleReservationAllocationInTransaction } from "../credit-billing/credit-ledger.service.ts";
import { refundTeamMemberGenerationCreditsInTransaction } from "../credit-billing/team-member-generation-credit.service.ts";
import {
  appendCanvasAgentEvent,
  appendCanvasAgentMessage,
  enqueueCanvasAgentWakeup,
  updateCanvasAgentStep,
} from "./canvas-agent-task.service.ts";

export class CanvasAgentRepairService {
  constructor(
    private readonly deps: {
      db: SqlDatabase;
      now?: () => Date;
    },
  ) {}

  async repairExpiredLeases(limit = 100) {
    const now = (this.deps.now ?? (() => new Date()))();
    const candidates = await this.deps.db.query<{
      id: string;
      workflow_task_id: string;
      workflow_id: string;
      current_attempt_id: string | null;
      owner_user_id: string;
      actor_team_member_id: string | null;
      status: string;
      provider_started: boolean;
    }>(
      `
        SELECT task.id, task.workflow_task_id, task.workflow_id, task.status,
          task.owner_user_id, task.actor_team_member_id,
          workflow_task.current_attempt_id,
          EXISTS (
            SELECT 1 FROM provider_requests request
            WHERE request.agent_task_id = task.id
              AND request.external_submission_started_at IS NOT NULL
              AND request.status NOT IN ('succeeded','failed','canceled')
          ) AS provider_started
        FROM canvas_agent_tasks task
        JOIN tasks workflow_task ON workflow_task.id = task.workflow_task_id
        WHERE task.status='running' AND task.lease_expires_at < $1
        ORDER BY task.lease_expires_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      `,
      [now, Math.min(Math.max(limit, 1), 500)],
    );
    let repaired = 0;
    for (const candidate of candidates.rows) {
      await this.deps.db.query("BEGIN");
      try {
        const updated = await this.deps.db.query<{ id: string }>(
          `
            UPDATE canvas_agent_tasks
            SET status=$3, failure_code=$4, lease_owner=NULL,
                lease_expires_at=NULL, heartbeat_at=NULL, updated_at=$2
            WHERE id=$1 AND status='running' AND lease_expires_at < $2
            RETURNING id
          `,
          [
            candidate.id,
            now,
            candidate.provider_started ? "manual_review_required" : "queued",
            candidate.provider_started ? "agent_lease_expired_after_provider_start" : null,
          ],
        );
        if (!updated.rows[0]) {
          await this.deps.db.query("ROLLBACK");
          continue;
        }
        if (candidate.provider_started) {
          await this.deps.db.query(
            `
              UPDATE task_attempts
              SET status='manual_review_required', failure_code='agent_lease_expired_after_provider_start',
                  locked_by=NULL, locked_until=NULL, heartbeat_at=NULL,
                  finished_at=$3, updated_at=$3
              WHERE id=$1 AND task_id=$2 AND status='running'
            `,
            [candidate.current_attempt_id, candidate.workflow_task_id, now],
          );
          await this.deps.db.query(
            `
              UPDATE tasks
              SET status='manual_review_required', failure_code='agent_lease_expired_after_provider_start',
                  locked_by=NULL, locked_until=NULL, heartbeat_at=NULL, updated_at=$2
              WHERE id=$1 AND status='running'
            `,
            [candidate.workflow_task_id, now],
          );
          await this.deps.db.query(
            "UPDATE workflows SET status='manual_review_required', failure_code='agent_lease_expired_after_provider_start', updated_at=$2 WHERE id=$1 AND status IN ('queued','running')",
            [candidate.workflow_id, now],
          );
          await appendCanvasAgentEvent(this.deps.db, {
            taskId: candidate.id,
            eventType: "task.manual_review_required",
            event: { reason: "agent_lease_expired_after_provider_start" },
            now,
          });
        } else {
          await releaseInterruptedModelRounds(this.deps.db, {
            taskId: candidate.id,
            workflowTaskId: candidate.workflow_task_id,
            ownerUserId: candidate.owner_user_id,
            actorTeamMemberId: candidate.actor_team_member_id,
            now,
          });
          await this.deps.db.query(
            `
              UPDATE task_attempts
              SET status='failed', failure_code='agent_lease_expired_before_provider_start',
                  locked_by=NULL, locked_until=NULL, heartbeat_at=NULL,
                  finished_at=$3, updated_at=$3
              WHERE id=$1 AND task_id=$2 AND status='running'
            `,
            [candidate.current_attempt_id, candidate.workflow_task_id, now],
          );
          await this.deps.db.query(
            `
              UPDATE tasks
              SET status='queued', current_attempt_id=NULL, failure_code=NULL,
                  locked_by=NULL, locked_until=NULL, heartbeat_at=NULL, updated_at=$2
              WHERE id=$1 AND status IN ('running','result_unknown','manual_review_required')
            `,
            [candidate.workflow_task_id, now],
          );
          await appendCanvasAgentEvent(this.deps.db, {
            taskId: candidate.id,
            eventType: "task.requeued_after_lease_expiry",
            event: { reason: "no_external_provider_submission" },
            now,
          });
          await enqueueCanvasAgentWakeup(this.deps.db, {
            taskId: candidate.id,
            reason: "lease_repaired",
            eventKey: `canvas-agent:${candidate.id}:lease-repair:${now.getTime()}`,
            now,
          });
        }
        await this.deps.db.query("COMMIT");
        repaired += 1;
      } catch (error) {
        await this.deps.db.query("ROLLBACK");
        throw error;
      }
    }
    return { inspected: candidates.rows.length, repaired };
  }

  async resumeExternalGeneration(input: {
    taskId: string;
    generationTaskId: string;
    now?: Date;
  }) {
    const now = input.now ?? (this.deps.now ?? (() => new Date()))();
    await this.deps.db.query(
      `
        UPDATE canvas_agent_tasks
        SET status='queued', failure_code=NULL, updated_at=$2
        WHERE id=$1 AND status='waiting_external'
      `,
      [input.taskId, now],
    );
    await appendCanvasAgentEvent(this.deps.db, {
      taskId: input.taskId,
      eventType: "generation.completed_wakeup",
      event: { generationTaskId: input.generationTaskId },
      now,
    });
    await enqueueCanvasAgentWakeup(this.deps.db, {
      taskId: input.taskId,
      reason: "generation_completed",
      eventKey: `canvas-agent:${input.taskId}:generation:${input.generationTaskId}`,
      now,
    });
  }

  async resumeCompletedGenerations(limit = 100) {
    const now = (this.deps.now ?? (() => new Date()))();
    const result = await this.deps.db.query<{
      agent_task_id: string;
      conversation_id: string;
      step_id: string;
      generation_task_id: string;
      generation_status: string;
      failure_code: string | null;
    }>(
      `
        SELECT agent.id AS agent_task_id, agent.conversation_id,
               step.id AS step_id, step.generation_task_id,
               generation.status AS generation_status, generation.failure_code
        FROM canvas_agent_tasks agent
        JOIN canvas_agent_steps step ON step.id = agent.current_step_id
        JOIN tasks generation ON generation.id = step.generation_task_id
        WHERE agent.status = 'waiting_external'
          AND step.status = 'waiting_external'
          AND generation.status IN ('succeeded','failed','canceled','result_unknown','manual_review_required')
        ORDER BY agent.updated_at ASC, agent.id ASC
        LIMIT $1
      `,
      [Math.min(Math.max(limit, 1), 500)],
    );
    let resumed = 0;
    for (const candidate of result.rows) {
      await this.deps.db.query("BEGIN");
      try {
        const claimed = await this.deps.db.query<{ id: string }>(
          "UPDATE canvas_agent_tasks SET status='queued', failure_code=NULL, updated_at=$2 WHERE id=$1 AND status='waiting_external' RETURNING id",
          [candidate.agent_task_id, now],
        );
        if (!claimed.rows[0]) {
          await this.deps.db.query("ROLLBACK");
          continue;
        }
        const stepStatus = candidate.generation_status === "succeeded" ? "succeeded" : "failed";
        await updateCanvasAgentStep(this.deps.db, {
          stepId: candidate.step_id,
          status: stepStatus,
          outputSummary: JSON.stringify({
            generationTaskId: candidate.generation_task_id,
            status: candidate.generation_status,
            failureCode: candidate.failure_code,
          }),
          errorCode: stepStatus === "failed" ? candidate.failure_code ?? `generation_${candidate.generation_status}` : null,
          now,
        });
        await appendCanvasAgentMessage(this.deps.db, {
          conversationId: candidate.conversation_id,
          taskId: candidate.agent_task_id,
          role: "tool",
          content: {
            generationTaskId: candidate.generation_task_id,
            status: candidate.generation_status,
            failureCode: candidate.failure_code,
          },
          now,
        });
        await appendCanvasAgentEvent(this.deps.db, {
          taskId: candidate.agent_task_id,
          eventType: "generation.completed_wakeup",
          event: {
            generationTaskId: candidate.generation_task_id,
            status: candidate.generation_status,
            failureCode: candidate.failure_code,
          },
          now,
        });
        await enqueueCanvasAgentWakeup(this.deps.db, {
          taskId: candidate.agent_task_id,
          reason: "generation_completed",
          eventKey: `canvas-agent:${candidate.agent_task_id}:generation:${candidate.generation_task_id}:${candidate.generation_status}`,
          now,
        });
        await this.deps.db.query("COMMIT");
        resumed += 1;
      } catch (error) {
        await this.deps.db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
    return { inspected: result.rows.length, resumed };
  }
}

async function releaseInterruptedModelRounds(
  db: SqlDatabase,
  input: {
    taskId: string;
    workflowTaskId: string;
    ownerUserId: string;
    actorTeamMemberId: string | null;
    now: Date;
  },
) {
  const steps = await db.query<{
    id: string;
    reservation_id: string | null;
    amount_total: number | string | null;
    amount_consumed: number | string | null;
    amount_released: number | string | null;
    member_source_id: string | null;
    member_amount: number | string | null;
  }>(
    `
      SELECT step.id,
        reservation.id AS reservation_id,
        reservation.amount_total,
        reservation.amount_consumed,
        reservation.amount_released,
        member_debit.source_id AS member_source_id,
        member_debit.amount AS member_amount
      FROM canvas_agent_steps step
      LEFT JOIN LATERAL (
        SELECT id, amount_total, amount_consumed, amount_released
        FROM credit_reservations
        WHERE user_id = $2
          AND source_type = 'canvas_agent_text_round'
          AND source_id = step.id
        LIMIT 1
      ) reservation ON TRUE
      LEFT JOIN LATERAL (
        SELECT source_id, amount
        FROM credit_ledger_entries
        WHERE user_id = $2
          AND team_member_id IS NOT DISTINCT FROM $3
          AND source_type = 'canvas_agent_text_round'
          AND entry_type = 'transfer_out'
          AND metadata_json->>'agentStepId' = step.id::text
        LIMIT 1
      ) member_debit ON TRUE
      WHERE step.task_id = $1 AND step.kind = 'model' AND step.status = 'running'
      ORDER BY step.step_no ASC
      FOR UPDATE OF step
    `,
    [input.taskId, input.ownerUserId, input.actorTeamMemberId],
  );

  for (const step of steps.rows) {
    if (step.reservation_id) {
      const remaining = Number(step.amount_total ?? 0)
        - Number(step.amount_consumed ?? 0)
        - Number(step.amount_released ?? 0);
      if (remaining > 0) {
        await settleReservationAllocationInTransaction(db, {
          reservationId: step.reservation_id,
          allocationKey: `${step.id}:repair-release`,
          amount: remaining,
          outcome: "released",
          taskId: input.workflowTaskId,
          metadata: {
            agentTaskId: input.taskId,
            agentStepId: step.id,
            reason: "agent_lease_expired_before_provider_start",
          },
          now: input.now,
        });
      }
    }
    if (input.actorTeamMemberId && step.member_source_id && Number(step.member_amount ?? 0) > 0) {
      await refundTeamMemberGenerationCreditsInTransaction(db, {
        teamMemberId: input.actorTeamMemberId,
        amount: Number(step.member_amount),
        sourceId: step.member_source_id,
        reason: "Canvas Agent text round interrupted before provider start",
        metadata: {
          canvasAgentTaskId: input.taskId,
          agentStepId: step.id,
        },
        now: input.now,
      });
    }
    await updateCanvasAgentStep(db, {
      stepId: step.id,
      status: "failed",
      errorCode: "agent_lease_expired_before_provider_start",
      now: input.now,
    });
  }
}
