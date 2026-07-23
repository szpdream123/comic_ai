import { randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";

export type GenerationStage = "submit" | "poll" | "fetch" | "persist";
export type GenerationSuccessorAction = "submit" | "poll" | "finalize" | "stop";

export async function recordGenerationSkippedSuccessor(
  db: SqlDatabase,
  input: {
    taskId: string;
    stage: GenerationStage;
    pollAttempt?: number;
    skipReason: string;
    nextAction: GenerationSuccessorAction;
    successorAssignmentKey?: string | null;
    now: Date;
  },
) {
  const pollAttempt = Math.max(0, Math.floor(input.pollAttempt ?? 0));
  await db.query(
    `
      INSERT INTO generation_stage_successors (
        id, task_id, stage, poll_attempt, skip_reason, next_action, status,
        successor_assignment_key, first_observed_at, last_observed_at, confirmed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)
      ON CONFLICT (task_id, stage, poll_attempt)
      DO UPDATE SET
        skip_reason = EXCLUDED.skip_reason,
        next_action = EXCLUDED.next_action,
        status = EXCLUDED.status,
        successor_assignment_key = COALESCE(
          EXCLUDED.successor_assignment_key,
          generation_stage_successors.successor_assignment_key
        ),
        last_observed_at = EXCLUDED.last_observed_at,
        confirmed_at = COALESCE(EXCLUDED.confirmed_at, generation_stage_successors.confirmed_at)
    `,
    [
      randomUUID(),
      input.taskId,
      input.stage,
      pollAttempt,
      requiredText(input.skipReason, "generation_skip_reason_required"),
      input.nextAction,
      input.nextAction === "stop" ? "terminal" : input.successorAssignmentKey ? "confirmed" : "scheduled",
      input.successorAssignmentKey ?? null,
      input.now,
      input.nextAction === "stop" || input.successorAssignmentKey ? input.now : null,
    ],
  );
}

export async function confirmGenerationStageSuccessor(
  db: SqlDatabase,
  input: {
    taskId: string;
    stage: GenerationStage;
    pollAttempt?: number;
    successorAssignmentKey?: string | null;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE generation_stage_successors
      SET status = 'confirmed',
          successor_assignment_key = COALESCE($4, successor_assignment_key),
          confirmed_at = $5,
          last_observed_at = $5
      WHERE task_id = $1
        AND stage = $2
        AND poll_attempt = $3
    `,
    [
      input.taskId,
      input.stage,
      Math.max(0, Math.floor(input.pollAttempt ?? 0)),
      input.successorAssignmentKey ?? null,
      input.now,
    ],
  );
}

export async function countMissingGenerationStageSuccessors(
  db: SqlDatabase,
  input: { staleBefore: Date },
) {
  const result = await db.query<{ count: number | string }>(
    `
      SELECT count(*) AS count
      FROM generation_stage_successors successor
      JOIN tasks task ON task.id = successor.task_id
      WHERE successor.status = 'scheduled'
        AND successor.last_observed_at < $1
        AND task.status IN ('queued', 'running', 'result_unknown')
    `,
    [input.staleBefore],
  );
  return Number(result.rows[0]?.count ?? 0);
}

function requiredText(value: string, code: string) {
  const text = value.trim();
  if (!text) throw new Error(code);
  return text;
}
