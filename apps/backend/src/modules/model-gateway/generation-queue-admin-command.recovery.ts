import { randomUUID } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  claimGenerationQueueAdminCommand,
  completeGenerationQueueAdminCommand,
  failGenerationQueueAdminCommand,
  listDueGenerationQueueAdminCommandIds,
  readGenerationQueueAdminCommand,
  saveGenerationQueueAdminCommandCheckpoint,
} from "./generation-queue-admin-command.store.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import {
  createBullMQGenerationQueueJobOpsService,
  type GenerationQueueJobOpsService,
  type GenerationQueueReplayValidationInput,
} from "./generation-queue-job-ops.service.ts";

export async function recoverGenerationQueueAdminCommands(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    workerId: string;
    jobOps: GenerationQueueJobOpsService;
    leaseMs?: number;
    retryDelayMs?: number;
  },
) {
  const commandIds = await listDueGenerationQueueAdminCommandIds(db, input);
  const recoveredCommandIds: string[] = [];
  const terminalCommandIds: string[] = [];
  const retryableCommandIds: string[] = [];
  for (const commandId of commandIds) {
    const claimed = await claimGenerationQueueAdminCommand(db, {
      commandId,
      workerId: input.workerId,
      now: new Date(),
      leaseMs: input.leaseMs,
    });
    if (!claimed) continue;
    try {
      const result = await input.jobOps.operate({
        queueName: claimed.queueName,
        jobId: claimed.jobId,
        action: claimed.action,
        journal: {
          load: async () => (await readGenerationQueueAdminCommand(db, claimed.id))
            ?.checkpoint ?? claimed.checkpoint,
          save: async (checkpoint) => {
            await saveGenerationQueueAdminCommandCheckpoint(db, {
              commandId: claimed.id,
              workerId: input.workerId,
              checkpoint,
              now: new Date(),
              leaseMs: input.leaseMs,
            });
          },
        },
      });
      if (result.status !== 200) {
        await failGenerationQueueAdminCommand(db, {
          commandId: claimed.id,
          workerId: input.workerId,
          error: result.body.error,
          terminal: true,
          now: new Date(),
        });
        terminalCommandIds.push(claimed.id);
        continue;
      }

      await db.query("BEGIN");
      try {
        const completedAt = new Date();
        await appendAuditEvent(db, {
          actorUserId: null,
          actorAdminAccountId: claimed.adminAccountId,
          eventType: "admin.ops.generation_queue_job_operated",
          targetType: "generation_queue_job",
          targetId: randomUUID(),
          reason: claimed.reason,
          sensitive: true,
          metadata: {
            ...result.body,
            actorAdminAccountId: claimed.adminAccountId,
            recoveredBy: input.workerId,
          },
          occurredAt: completedAt,
        });
        await completeGenerationQueueAdminCommand(db, {
          commandId: claimed.id,
          workerId: input.workerId,
          result: result.body,
          now: completedAt,
        });
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      recoveredCommandIds.push(claimed.id);
    } catch (error) {
      await failGenerationQueueAdminCommand(db, {
        commandId: claimed.id,
        workerId: input.workerId,
        error: error instanceof Error ? error.message : String(error),
        now: new Date(),
      }).catch(() => undefined);
      retryableCommandIds.push(claimed.id);
    }
  }
  return { recoveredCommandIds, terminalCommandIds, retryableCommandIds };
}

export function createGenerationQueueAdminRecoveryJobOps(
  db: SqlDatabase,
  config: GenerationQueueConfig,
) {
  return createBullMQGenerationQueueJobOpsService(
    config,
    (input) => validateGenerationQueueReplay(db, input),
  );
}

async function validateGenerationQueueReplay(
  db: SqlDatabase,
  input: GenerationQueueReplayValidationInput,
) {
  const taskId = readString(input.sourceJobData.taskId);
  if (!taskId) return false;
  const task = await queryOne<{
    status: string;
    external_submission_started: boolean;
    pollable_provider_request: boolean;
  }>(
    db,
    `
      SELECT task.status,
        EXISTS (
          SELECT 1 FROM provider_requests request
          WHERE request.task_id = task.id
            AND (request.external_submission_started_at IS NOT NULL OR request.external_request_id IS NOT NULL)
        ) AS external_submission_started,
        EXISTS (
          SELECT 1 FROM provider_requests request
          WHERE request.task_id = task.id
            AND task.current_attempt_id IS NOT NULL
            AND request.attempt_id = task.current_attempt_id
            AND request.external_submission_started_at IS NOT NULL
            AND request.external_request_id IS NOT NULL
            AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown')
        ) AS pollable_provider_request
      FROM tasks task
      WHERE task.id = $1
        AND task.task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
      LIMIT 1
    `,
    [taskId],
  );
  if (!task) return false;
  if (input.sourceJobName.includes(".submit")) {
    return task.status === "queued" && !task.external_submission_started;
  }
  if (input.sourceJobName.includes(".poll")) {
    return task.status === "running" && task.pollable_provider_request;
  }
  return false;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
