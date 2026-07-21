import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { settleReservationAllocationInTransaction } from "../credit-billing/credit-ledger.service.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";
import {
  buildGenerationBullMQJobId,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import { markGenerationTaskSnapshotFailed } from "./generation-task-snapshot.service.ts";
import {
  appendGenerationTaskCreatedOutboxEvent,
  appendGenerationTaskFinalizeRequestedOutboxEvent,
} from "./generation-outbox.service.ts";
import { failSeedanceVideoTaskBeforeProviderSubmission } from "./seedance-video.worker.ts";

interface GenerationRepairTaskRow {
  task_id: string;
  user_id: string;
  workflow_id: string;
  queue_name: string;
  input_snapshot_json: Record<string, unknown> | string;
  target_entity_type: string;
  target_entity_id: string;
}

interface RunningSeedancePollRepairRow {
  task_id: string;
  user_id: string;
  workflow_id: string;
  input_snapshot_json: Record<string, unknown> | string;
}

interface GenerationQueueFailureTaskRow {
  task_id: string;
  workflow_id: string;
  current_attempt_id: string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
}

const defaultStaleDispatchMs = 2 * 60 * 1000;
const defaultPreSubmissionTimeoutMs = 5 * 60 * 1000;

export async function failStaleGenerationTasksBeforeProviderSubmission(
  db: SqlDatabase,
  input: { now: Date; limit: number; timeoutMs?: number },
): Promise<{ failedTaskIds: string[] }> {
  const cutoff = new Date(input.now.getTime() - (input.timeoutMs ?? defaultPreSubmissionTimeoutMs));
  const candidates = await db.query<{ id: string }>(
    `
      SELECT t.id
      FROM tasks t
      WHERE (
          t.status = 'running'
          OR (
            t.status = 'result_unknown'
            AND t.failure_code = 'lease_expired_after_external_start'
          )
        )
        AND t.task_type = 'episode_generate_video'
        AND t.updated_at < $1
        AND NOT EXISTS (
          SELECT 1 FROM provider_requests pr
          WHERE pr.task_id = t.id
            AND pr.external_submission_started_at IS NOT NULL
        )
      ORDER BY t.updated_at ASC, t.id ASC
      LIMIT $2
    `,
    [cutoff, input.limit],
  );
  const failedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    if (await failSeedanceVideoTaskBeforeProviderSubmission(db, {
      taskId: candidate.id,
      failureCode: "provider_submission_not_started_timeout",
      now: input.now,
    })) {
      failedTaskIds.push(candidate.id);
    }
  }
  return { failedTaskIds };
}

export async function repairQueuedGenerationTaskOutbox(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleDispatchMs?: number;
  },
): Promise<{ repairedTaskIds: string[] }> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleDispatchMs ?? defaultStaleDispatchMs),
  );
  const candidates = await db.query<GenerationRepairTaskRow>(
    `
      SELECT
        t.id AS task_id,
        COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
        t.workflow_id,
        t.queue_name,
        t.input_snapshot_json,
        t.target_entity_type,
        t.target_entity_id
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      JOIN projects project ON project.id = t.project_id
      WHERE t.status = 'queued'
        AND t.task_type = 'episode_generate_video'
        AND t.scheduled_at <= $1
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          t.last_dispatched_at IS NULL
          OR t.last_dispatched_at < $2
        )
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events oe
          WHERE oe.user_id = COALESCE(workflow.created_by_user_id, project.owner_user_id)
            AND oe.event_type = 'generation.task.created'
            AND oe.payload_json->>'taskId' = t.id::text
            AND oe.status IN ('pending', 'processing', 'failed')
          LIMIT 1
        )
      ORDER BY t.scheduled_at ASC, t.id ASC
      LIMIT $3
    `,
    [input.now, staleCutoff, input.limit],
  );

  const repairedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const claimed = await markGenerationTaskRedisRepairClaimed(db, {
      taskId: candidate.task_id,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    await appendGenerationTaskCreatedOutboxEvent(db, {
      userId: candidate.user_id,
      workflowId: candidate.workflow_id,
      taskId: candidate.task_id,
      kind: "video",
      modelCode: readString(snapshot.model) || "seedance-i2v-pro",
      queueName: candidate.queue_name,
      targetType: readString(snapshot.targetType) || candidate.target_entity_type,
      targetId: readString(snapshot.targetId) || candidate.target_entity_id,
      providerExecutor: "seedance",
      ...generationPriorityFromSnapshot(snapshot),
      availableAt: input.now,
    });
    repairedTaskIds.push(candidate.task_id);
  }

  return { repairedTaskIds };
}

export async function repairExpiredGenerationSubmitLeases(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
  },
): Promise<{
  requeuedTaskIds: string[];
  resultUnknownTaskIds: string[];
  repairedTaskIds: string[];
}> {
  const candidates = await db.query<{ id: string }>(
    `
      SELECT id
      FROM tasks
      WHERE status = 'running'
        AND locked_until IS NOT NULL
        AND locked_until < $1
        AND task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
      ORDER BY locked_until ASC, id ASC
      LIMIT $2
    `,
    [input.now, input.limit],
  );

  const failedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    if (await failGenerationTaskAfterQueueError(db, {
      taskId: candidate.id,
      failureCode: "generation_queue_lease_expired",
      displayMessage: "生成队列执行超时，任务已停止自动重试并按失败处理，积分已返还。",
      now: input.now,
    })) {
      failedTaskIds.push(candidate.id);
    }
  }

  return {
    requeuedTaskIds: [],
    resultUnknownTaskIds: [],
    repairedTaskIds: failedTaskIds,
  };
}

export async function failGenerationTaskAfterQueueError(
  db: SqlDatabase,
  input: {
    taskId: string;
    failureCode: string;
    displayMessage: string;
    creditOutcome?: "released" | "manual_review_required";
    now: Date;
  },
): Promise<boolean> {
  await db.query("BEGIN");
  try {
    const row = await queryOne<GenerationQueueFailureTaskRow>(
      db,
      `
      SELECT
        task.id AS task_id,
        task.workflow_id,
        task.current_attempt_id,
        reservation.id AS reservation_id,
        reservation.amount_reserved
      FROM tasks task
      LEFT JOIN credit_reservations reservation
        ON reservation.task_id = task.id
       AND reservation.status IN ('active', 'partially_settled')
      WHERE task.id = $1
        AND task.task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
        AND task.status IN ('queued', 'running', 'result_unknown')
      LIMIT 1
    `,
      [input.taskId],
    );
    if (!row) {
      await db.query("COMMIT");
      return false;
    }

    const failed = await queryOne<{ id: string }>(
      db,
      `
      UPDATE tasks
      SET status = 'failed',
          failure_code = $2,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $3
      WHERE id = $1
        AND status IN ('queued', 'running', 'result_unknown')
      RETURNING id
    `,
      [row.task_id, input.failureCode, input.now],
    );
    if (!failed) {
      await db.query("COMMIT");
      return false;
    }

    if (row.current_attempt_id) {
      await db.query(
        `
        UPDATE task_attempts
        SET status = 'failed',
            failure_code = $3,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = $4,
            updated_at = $4
        WHERE id = $1
          AND task_id = $2
          AND status IN ('queued', 'running', 'result_unknown')
      `,
        [row.current_attempt_id, row.task_id, input.failureCode, input.now],
      );
    }

    const amount = Number(row.amount_reserved ?? 0);
    const creditOutcome = input.creditOutcome ?? "released";
    if (row.reservation_id && amount > 0) {
      await settleReservationAllocationInTransaction(db, {
        reservationId: row.reservation_id,
        allocationKey: input.failureCode,
        amount,
        outcome: creditOutcome,
        taskId: row.task_id,
        attemptId: row.current_attempt_id,
        metadata: { failureCode: input.failureCode },
        now: input.now,
      });
    }
    await markGenerationTaskSnapshotFailed(db, {
      taskId: row.task_id,
      attemptId: row.current_attempt_id,
      failure: {
        failureCode: input.failureCode,
        displayMessage: input.displayMessage,
        noticeType: creditOutcome === "manual_review_required" ? "admin_action_required" : "error",
      },
      creditStatus: creditOutcome,
      creditSummary: {
        ...(creditOutcome === "released" ? { released: amount } : { reserved: amount }),
        settledAt: input.now.toISOString(),
      },
      now: input.now,
    });
    await aggregateWorkflowStatus(db, row.workflow_id);
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function repairRunningSeedancePollJobs(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    staleDispatchMs?: number;
    config: GenerationQueueConfig;
    publisher: GenerationBullMQPublisher;
  },
): Promise<{ repairedTaskIds: string[] }> {
  const staleCutoff = new Date(
    input.now.getTime() - (input.staleDispatchMs ?? defaultStaleDispatchMs),
  );
  const candidates = await db.query<RunningSeedancePollRepairRow>(
    `
      SELECT
        t.id AS task_id,
        COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
        t.workflow_id,
        t.input_snapshot_json
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      JOIN projects project ON project.id = t.project_id
      WHERE t.status = 'running'
        AND t.task_type = 'episode_generate_video'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
        AND EXISTS (
          SELECT 1
          FROM provider_requests pr
          WHERE pr.task_id = t.id
            AND (t.current_attempt_id IS NULL OR pr.attempt_id = t.current_attempt_id)
            AND pr.external_submission_started_at IS NOT NULL
            AND pr.external_request_id IS NOT NULL
            AND pr.status IN ('submitted', 'accepted', 'running', 'result_unknown')
          LIMIT 1
        )
        AND (
          t.last_dispatched_at IS NULL
          OR t.last_dispatched_at < $2
        )
      ORDER BY t.updated_at ASC, t.id ASC
      LIMIT $1
    `,
    [input.limit, staleCutoff],
  );

  const repairedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const claimed = await markRunningPollRepairClaimed(db, {
      taskId: candidate.task_id,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    await input.publisher.add(
      input.config.queues.pollVideo,
      "generation.video.poll.repair",
      {
        taskId: candidate.task_id,
        workflowId: candidate.workflow_id,
        mediaType: "video",
        modelCode: readString(snapshot.model) || "seedance-i2v-pro",
        providerExecutor: "seedance",
        pollAttempt: 1,
      },
      {
        jobId: buildGenerationBullMQJobId(
          "generation.video.poll.repair",
          candidate.task_id,
          input.now.getTime(),
        ),
        delay: 0,
        attempts: 1,
        removeOnComplete: {
          age: 86400,
          count: 10000,
        },
        removeOnFail: {
          age: 604800,
          count: 50000,
        },
      },
    );
    repairedTaskIds.push(candidate.task_id);
  }

  const finalizeCandidates = await db.query<RunningSeedancePollRepairRow>(
    `
      SELECT
        t.id AS task_id,
        COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
        t.workflow_id,
        t.input_snapshot_json
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      JOIN projects project ON project.id = t.project_id
      WHERE t.status IN ('running', 'manual_review_required', 'result_unknown')
        AND t.task_type = 'episode_generate_video'
        AND t.input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          t.locked_until IS NULL
          OR t.locked_until < $3
        )
        AND EXISTS (
          SELECT 1
          FROM provider_requests pr
          WHERE pr.task_id = t.id
            AND (t.current_attempt_id IS NULL OR pr.attempt_id = t.current_attempt_id)
            AND pr.external_request_id IS NOT NULL
            AND pr.status = 'succeeded'
          LIMIT 1
        )
        AND NOT EXISTS (
          SELECT 1
          FROM outbox_events oe
          WHERE oe.user_id = COALESCE(workflow.created_by_user_id, project.owner_user_id)
            AND oe.event_type = 'generation.task.finalize_requested'
            AND oe.payload_json->>'taskId' = t.id::text
            AND oe.status IN ('pending', 'processing', 'failed')
          LIMIT 1
        )
        AND (
          t.last_dispatched_at IS NULL
          OR t.last_dispatched_at < $2
        )
      ORDER BY t.updated_at ASC, t.id ASC
      LIMIT $1
    `,
    [input.limit, staleCutoff, input.now],
  );

  for (const candidate of finalizeCandidates.rows) {
    const claimed = await markRunningFinalizeRepairClaimed(db, {
      taskId: candidate.task_id,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    await appendGenerationTaskFinalizeRequestedOutboxEvent(db, {
      userId: candidate.user_id,
      workflowId: candidate.workflow_id,
      taskId: candidate.task_id,
      kind: "video",
      modelCode: readString(snapshot.model) || "seedance-i2v-pro",
      providerExecutor: "seedance",
      finalizeMode: "retry_finalize",
      availableAt: input.now,
    });
    repairedTaskIds.push(candidate.task_id);
  }

  return { repairedTaskIds };
}

async function markGenerationTaskRedisRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND status = 'queued'
        AND task_type = 'episode_generate_video'
        AND input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

async function markRunningPollRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND (
          status = 'running'
          OR (
            status = 'result_unknown'
            AND failure_code = 'lease_expired_after_external_start'
          )
        )
        AND task_type = 'episode_generate_video'
        AND input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

async function markRunningFinalizeRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET last_dispatched_at = $2,
          updated_at = $2
      WHERE id = $1
        AND status IN ('running', 'manual_review_required', 'result_unknown')
        AND task_type = 'episode_generate_video'
        AND input_snapshot_json->>'providerExecutor' = 'seedance'
        AND (
          locked_until IS NULL
          OR locked_until < $2
        )
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff],
  );

  return Boolean(row);
}

function parseSnapshot(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) as Record<string, unknown> : value;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function generationPriorityFromSnapshot(snapshot: Record<string, unknown>) {
  if (snapshot.membershipPriority !== true) {
    return {};
  }
  const queuePriority = readPositiveInteger(snapshot.queuePriority);
  if (queuePriority === null) {
    return {};
  }

  return {
    membershipPriority: true,
    queuePriority,
    priorityReason: readString(snapshot.priorityReason) || "membership_priority",
  };
}

function readPositiveInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return null;
  }
  return numberValue;
}
