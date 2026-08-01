import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { settleReservationAllocationInTransaction } from "../credit-billing/credit-ledger.service.ts";
import {
  refundTeamMemberGenerationCreditsInTransaction,
  resolveGenerationBillingAmount,
} from "../credit-billing/team-member-generation-credit.service.ts";
import { aggregateWorkflowStatus } from "../workflow-task/workflow-task.service.ts";
import {
  buildGenerationBullMQJobId,
  type GenerationBullMQPublisher,
} from "./generation-bullmq.publisher.ts";
import type { GenerationQueueConfig } from "./generation-queue.config.ts";
import {
  markGenerationTaskSnapshotManualReviewRequired,
  markGenerationTaskSnapshotFailed,
  markGenerationTaskSnapshotResultUnknown,
} from "./generation-task-snapshot.service.ts";
import {
  appendGenerationTaskCreatedOutboxEvent,
  appendGenerationTaskFinalizeRequestedOutboxEvent,
} from "./generation-outbox.service.ts";
import { failSeedanceVideoTaskBeforeProviderSubmission } from "./seedance-video.worker.ts";
import { createGenerationProviderRouteIdentity } from "./generation-model-config-snapshot.ts";
import {
  hasRecoverableGenerationQueueSuccessor,
  markGenerationQueueStagePublished,
  releaseGenerationQueueStage,
} from "./generation-queue-shard.store.ts";

interface GenerationRepairTaskRow {
  task_id: string;
  user_id: string;
  workflow_id: string;
  task_type: string;
  queue_name: string;
  input_snapshot_json: Record<string, unknown> | string;
  target_entity_type: string;
  target_entity_id: string;
}

interface RunningSeedancePollRepairRow {
  task_id: string;
  user_id: string;
  workflow_id: string;
  task_type: string;
  input_snapshot_json: Record<string, unknown> | string;
  poll_sequence: number | string;
}

interface GenerationQueueFailureTaskRow {
  task_id: string;
  workflow_id: string;
  current_attempt_id: string | null;
  reservation_id: string | null;
  amount_reserved: number | string | null;
  input_snapshot_json: Record<string, unknown> | string;
}

interface ExpiredGenerationSubmitLeaseRow {
  id: string;
  task_type: string;
  workflow_id: string;
  current_attempt_id: string | null;
  provider_request_id: string | null;
  provider_status: string | null;
  external_submission_started_at: Date | string | null;
  external_request_id: string | null;
}

const defaultStaleDispatchMs = 2 * 60 * 1000;
const defaultPreSubmissionTimeoutMs = 5 * 60 * 1000;
const defaultStaleAssignmentMs = 15 * 60 * 1000;

export interface GenerationQueueAssignmentLiveInspector {
  listLiveAssignmentKeys(queueName: string): Promise<ReadonlySet<string>>;
  inspectJobState?(
    queueName: string,
    jobId: string,
  ): Promise<GenerationQueueAssignmentJobState>;
}

export type GenerationQueueAssignmentJobState =
  | "waiting"
  | "active"
  | "delayed"
  | "prioritized"
  | "waiting-children"
  | "paused"
  | "completed"
  | "failed"
  | "unknown"
  | "missing";

interface StaleGenerationQueueAssignmentRow {
  assignment_key: string;
  queue_name: string;
  admitted_at: Date | string;
  assignment_status: "publishing" | "admitted";
  redis_job_id: string | null;
  has_active_outbox: boolean;
}

interface StaleGenerationQueueAssignmentCursor {
  admittedAt: Date | string;
  assignmentKey: string;
}

const staleAssignmentCursorByDatabase = new WeakMap<
  SqlDatabase,
  StaleGenerationQueueAssignmentCursor
>();

export async function repairStaleGenerationQueueStageAssignments(
  db: SqlDatabase,
  input: {
    now: Date;
    limit: number;
    inspector: GenerationQueueAssignmentLiveInspector;
    staleAssignmentMs?: number;
    reopenThreshold?: number;
  },
): Promise<{
  releasedAssignmentKeys: string[];
  liveAssignmentKeys: string[];
  inspectionFailedQueueNames: string[];
}> {
  const staleBefore = new Date(
    input.now.getTime() - (input.staleAssignmentMs ?? defaultStaleAssignmentMs),
  );
  const cursor = staleAssignmentCursorByDatabase.get(db);
  let candidates = await listStaleGenerationQueueAssignmentCandidates(db, {
    staleBefore,
    now: input.now,
    limit: input.limit,
    cursor,
  });
  if (candidates.rows.length === 0 && cursor) {
    staleAssignmentCursorByDatabase.delete(db);
    candidates = await listStaleGenerationQueueAssignmentCandidates(db, {
      staleBefore,
      now: input.now,
      limit: input.limit,
    });
  }
  const lastCandidate = candidates.rows.at(-1);
  if (lastCandidate) {
    staleAssignmentCursorByDatabase.set(db, {
      admittedAt: lastCandidate.admitted_at,
      assignmentKey: lastCandidate.assignment_key,
    });
  }

  const liveByQueue = new Map<string, ReadonlySet<string>>();
  const failedQueues = new Set<string>();
  const legacyQueueNames = new Set(candidates.rows
    .filter((candidate) => !candidate.redis_job_id || !input.inspector.inspectJobState)
    .map((candidate) => candidate.queue_name));
  for (const queueName of legacyQueueNames) {
    try {
      liveByQueue.set(queueName, await input.inspector.listLiveAssignmentKeys(queueName));
    } catch {
      failedQueues.add(queueName);
    }
  }

  const releasedAssignmentKeys: string[] = [];
  const liveAssignmentKeys: string[] = [];
  for (const candidate of candidates.rows) {
    if (failedQueues.has(candidate.queue_name)) continue;
    if (candidate.redis_job_id && input.inspector.inspectJobState) {
      let jobState: GenerationQueueAssignmentJobState;
      try {
        jobState = await input.inspector.inspectJobState(candidate.queue_name, candidate.redis_job_id);
      } catch {
        failedQueues.add(candidate.queue_name);
        continue;
      }
      if (isLiveGenerationAssignmentJobState(jobState)) {
        if (candidate.assignment_status === "publishing") {
          try {
            await markGenerationQueueStagePublished(db, {
              assignmentKey: candidate.assignment_key,
              redisJobId: candidate.redis_job_id,
              now: input.now,
            });
          } catch {
            failedQueues.add(candidate.queue_name);
            continue;
          }
        }
        liveAssignmentKeys.push(candidate.assignment_key);
        continue;
      }
      if (jobState === "unknown") {
        failedQueues.add(candidate.queue_name);
        continue;
      }
      const requireNoActiveOutbox = jobState === "missing";
      if (requireNoActiveOutbox && candidate.has_active_outbox) continue;
      if (await releaseStaleGenerationQueueAssignmentIfStageExited(db, {
        assignmentKey: candidate.assignment_key,
        now: input.now,
        reopenThreshold: input.reopenThreshold,
        allowNonTerminalTask: true,
        requireNoActiveOutbox,
        reason: `auto_repair_redis_${jobState}`,
      })) {
        releasedAssignmentKeys.push(candidate.assignment_key);
      }
      continue;
    }
    if (liveByQueue.get(candidate.queue_name)?.has(candidate.assignment_key)) {
      liveAssignmentKeys.push(candidate.assignment_key);
      continue;
    }
    if (await releaseStaleGenerationQueueAssignmentIfStageExited(db, {
      assignmentKey: candidate.assignment_key,
      now: input.now,
      reopenThreshold: input.reopenThreshold,
      allowNonTerminalTask: false,
      requireNoActiveOutbox: true,
      reason: "auto_repair_stage_exited",
    })) {
      releasedAssignmentKeys.push(candidate.assignment_key);
    }
  }

  return {
    releasedAssignmentKeys,
    liveAssignmentKeys,
    inspectionFailedQueueNames: [...failedQueues],
  };
}

async function listStaleGenerationQueueAssignmentCandidates(
  db: SqlDatabase,
  input: {
    staleBefore: Date;
    now: Date;
    limit: number;
    cursor?: StaleGenerationQueueAssignmentCursor;
  },
) {
  return db.query<StaleGenerationQueueAssignmentRow>(
    `
      SELECT assignment.assignment_key,
             shard.queue_name,
             assignment.admitted_at,
             assignment.status AS assignment_status,
             assignment.redis_job_id,
             EXISTS (
               SELECT 1
               FROM outbox_events event
               WHERE event.payload_json->>'taskId' = task.id::text
                 AND event.status IN ('pending', 'processing', 'failed')
                 AND (
                   (assignment.stage = 'submit' AND event.event_type = 'generation.task.created')
                   OR (assignment.stage = 'poll' AND event.event_type = 'generation.task.poll_requested')
                   OR (
                     assignment.stage = 'fetch'
                     AND event.event_type = 'generation.task.finalize_requested'
                     AND event.payload_json->>'artifactStage' = 'fetch'
                   )
                   OR (
                     assignment.stage = 'persist'
                     AND event.event_type = 'generation.task.finalize_requested'
                     AND COALESCE(event.payload_json->>'artifactStage', 'persist') <> 'fetch'
                   )
                 )
             ) AS has_active_outbox
      FROM generation_queue_stage_assignments assignment
      JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
      JOIN tasks task ON task.id = assignment.task_id
      WHERE assignment.status IN ('publishing', 'admitted')
        AND assignment.admitted_at <= $1
        AND (
          $4::timestamptz IS NULL
          OR (assignment.admitted_at, assignment.assignment_key) > ($4::timestamptz, $5::text)
        )
        AND (task.locked_until IS NULL OR task.locked_until <= $3)
      ORDER BY assignment.admitted_at ASC, assignment.assignment_key ASC
      LIMIT $2
    `,
    [
      input.staleBefore,
      Math.max(1, Math.floor(input.limit)),
      input.now,
      input.cursor?.admittedAt ?? null,
      input.cursor?.assignmentKey ?? "",
    ],
  );
}

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
        t.task_type,
        t.queue_name,
        t.input_snapshot_json,
        t.target_entity_type,
        t.target_entity_id
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      LEFT JOIN projects project ON project.id = t.project_id
      WHERE t.status = 'queued'
        AND t.task_type IN ('episode_generate_video', 'episode_generate_image', 'episode_generate_audio')
        AND t.scheduled_at <= $1
        AND (
          (t.task_type = 'episode_generate_video' AND t.input_snapshot_json->>'providerExecutor' = 'seedance')
          OR (t.task_type = 'episode_generate_image' AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
          OR (t.task_type = 'episode_generate_audio' AND t.input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
        )
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
      taskType: candidate.task_type,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    const mediaType = candidate.task_type === "episode_generate_image"
      ? "image"
      : candidate.task_type === "episode_generate_audio" ? "audio" : "video";
    await appendGenerationTaskCreatedOutboxEvent(db, {
      userId: candidate.user_id,
      workflowId: candidate.workflow_id,
      taskId: candidate.task_id,
      kind: mediaType,
      modelCode: readString(snapshot.model) || (mediaType === "image" ? "gpt-image-2" : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance-i2v-pro"),
      queueName: candidate.queue_name,
      targetType: readString(snapshot.targetType) || candidate.target_entity_type,
      targetId: readString(snapshot.targetId) || candidate.target_entity_id,
      providerExecutor: readString(snapshot.providerExecutor) || (mediaType === "image" ? "gpt-image-2" : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance"),
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
  const candidates = await db.query<ExpiredGenerationSubmitLeaseRow>(
    `
      SELECT
        task.id,
        task.task_type,
        task.workflow_id,
        task.current_attempt_id,
        provider.id AS provider_request_id,
        provider.status AS provider_status,
        provider.external_submission_started_at,
        provider.external_request_id
      FROM tasks task
      LEFT JOIN LATERAL (
        SELECT
          request.id,
          request.status,
          request.external_submission_started_at,
          request.external_request_id
        FROM provider_requests request
        WHERE request.task_id = task.id
          AND (task.current_attempt_id IS NULL OR request.attempt_id = task.current_attempt_id)
          AND (
            request.external_submission_started_at IS NOT NULL
            OR request.external_request_id IS NOT NULL
          )
        ORDER BY request.updated_at DESC, request.id DESC
        LIMIT 1
      ) provider ON TRUE
      WHERE task.status = 'running'
        AND task.locked_until IS NOT NULL
        AND task.locked_until < $1
        AND task.task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
      ORDER BY task.locked_until ASC, task.id ASC
      LIMIT $2
    `,
    [input.now, input.limit],
  );

  const requeuedTaskIds: string[] = [];
  const resultUnknownTaskIds: string[] = [];
  const failedTaskIds: string[] = [];
  for (const candidate of candidates.rows) {
    const providerStarted = Boolean(
      candidate.external_submission_started_at || candidate.external_request_id,
    );
    if (providerStarted) {
      const canResumePollResult = (candidate.task_type === "episode_generate_video"
        || candidate.task_type === "episode_generate_image"
        || candidate.task_type === "episode_generate_audio")
        && Boolean(candidate.external_request_id)
        && ["submitted", "accepted", "running", "result_unknown", "succeeded"]
          .includes(candidate.provider_status ?? "");
      if (canResumePollResult) {
        if (await clearExpiredGenerationSubmitLease(db, {
          taskId: candidate.id,
          attemptId: candidate.current_attempt_id,
          now: input.now,
        })) {
          requeuedTaskIds.push(candidate.id);
        }
      } else if (await markExpiredGenerationSubmitLeaseResultUnknown(db, {
        taskId: candidate.id,
        workflowId: candidate.workflow_id,
        attemptId: candidate.current_attempt_id,
        providerRequestId: candidate.provider_request_id,
        now: input.now,
      })) {
        resultUnknownTaskIds.push(candidate.id);
      }
      continue;
    }

    if (await failGenerationTaskAfterQueueError(db, {
      taskId: candidate.id,
      failureCode: "generation_queue_lease_expired",
      displayMessage: "生成队列执行超时，任务已停止自动重试并按失败处理，积分已返还。",
      requireProviderSubmissionNotStarted: true,
      now: input.now,
    })) {
      failedTaskIds.push(candidate.id);
    }
  }

  return {
    requeuedTaskIds,
    resultUnknownTaskIds,
    repairedTaskIds: failedTaskIds,
  };
}

async function clearExpiredGenerationSubmitLease(
  db: SqlDatabase,
  input: { taskId: string; attemptId: string | null; now: Date },
): Promise<boolean> {
  const task = await queryOne<{ id: string }>(
    db,
    `
      UPDATE tasks
      SET locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $2
      WHERE id = $1
        AND status = 'running'
        AND locked_until IS NOT NULL
        AND locked_until < $2
        AND EXISTS (
          SELECT 1
          FROM provider_requests request
          WHERE request.task_id = tasks.id
            AND ($3::uuid IS NULL OR request.attempt_id = $3)
            AND request.external_submission_started_at IS NOT NULL
            AND request.external_request_id IS NOT NULL
            AND request.status IN ('submitted', 'accepted', 'running', 'result_unknown', 'succeeded')
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.attemptId],
  );
  if (!task) {
    return false;
  }

  if (input.attemptId) {
    await db.query(
      `
        UPDATE task_attempts
        SET locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            updated_at = $3
        WHERE id = $1
          AND task_id = $2
          AND status = 'running'
      `,
      [input.attemptId, input.taskId, input.now],
    );
  }
  return true;
}

async function markExpiredGenerationSubmitLeaseResultUnknown(
  db: SqlDatabase,
  input: {
    taskId: string;
    workflowId: string;
    attemptId: string | null;
    providerRequestId: string | null;
    now: Date;
  },
): Promise<boolean> {
  await db.query("BEGIN");
  try {
    const task = await queryOne<{ id: string }>(
      db,
      `
        UPDATE tasks
        SET status = 'result_unknown',
            failure_code = 'lease_expired_after_external_start',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            updated_at = $2
        WHERE id = $1
          AND status = 'running'
          AND locked_until IS NOT NULL
          AND locked_until < $2
          AND EXISTS (
            SELECT 1
            FROM provider_requests request
            WHERE request.task_id = tasks.id
              AND ($3::uuid IS NULL OR request.attempt_id = $3)
              AND (
                request.external_submission_started_at IS NOT NULL
                OR request.external_request_id IS NOT NULL
              )
          )
        RETURNING id
      `,
      [input.taskId, input.now, input.attemptId],
    );
    if (!task) {
      await db.query("COMMIT");
      return false;
    }

    if (input.providerRequestId) {
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'result_unknown',
              failure_code = 'lease_expired_after_external_start',
              updated_at = $2
          WHERE id = $1
            AND status NOT IN ('succeeded', 'failed', 'canceled')
        `,
        [input.providerRequestId, input.now],
      );
    }
    if (input.attemptId) {
      await db.query(
        `
          UPDATE task_attempts
          SET status = 'result_unknown',
              failure_code = 'lease_expired_after_external_start',
              locked_by = NULL,
              locked_until = NULL,
              heartbeat_at = NULL,
              finished_at = $3,
              updated_at = $3
          WHERE id = $1
            AND task_id = $2
            AND status = 'running'
        `,
        [input.attemptId, input.taskId, input.now],
      );
    }
    await markGenerationTaskSnapshotResultUnknown(db, {
      taskId: input.taskId,
      attemptId: input.attemptId,
      providerRequestId: input.providerRequestId,
      failure: {
        failureCode: "lease_expired_after_external_start",
        displayMessage: "供应商请求已经开始，但当前缺少可恢复的轮询信息，需要后台复核。",
      },
      now: input.now,
    });
    await aggregateWorkflowStatus(db, input.workflowId);
    await db.query("COMMIT");
    return true;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function failGenerationTaskAfterQueueError(
  db: SqlDatabase,
  input: {
    taskId: string;
    failureCode: string;
    displayMessage: string;
    creditOutcome?: "released" | "manual_review_required";
    sourceAssignmentKey?: string;
    requireProviderSubmissionNotStarted?: boolean;
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
        task.input_snapshot_json,
        reservation.id AS reservation_id,
        reservation.amount_reserved
      FROM tasks task
      LEFT JOIN generation_task_credit_reservations reservation
        ON reservation.task_id = task.id
       AND reservation.status IN ('active', 'partially_settled')
      WHERE task.id = $1
        AND task.task_type IN ('episode_generate_image', 'episode_generate_video', 'episode_generate_audio')
        AND task.status IN ('queued', 'running', 'result_unknown')
      LIMIT 1
      FOR UPDATE OF task
    `,
      [input.taskId],
    );
    if (!row) {
      await db.query("COMMIT");
      return false;
    }

    if (input.sourceAssignmentKey && await hasRecoverableGenerationQueueSuccessor(db, {
      taskId: row.task_id,
      sourceAssignmentKey: input.sourceAssignmentKey,
    })) {
      await db.query("COMMIT");
      return false;
    }

    if (input.requireProviderSubmissionNotStarted) {
      const externalSubmission = await queryOne<{ id: string }>(
        db,
        `
          SELECT id
          FROM provider_requests
          WHERE task_id = $1
            AND (
              external_submission_started_at IS NOT NULL
              OR external_request_id IS NOT NULL
            )
          LIMIT 1
        `,
        [input.taskId],
      );
      if (externalSubmission) {
        await db.query("COMMIT");
        return false;
      }
    }

    const creditOutcome = input.creditOutcome ?? "released";
    const failed = await queryOne<{ id: string }>(
      db,
      `
      UPDATE tasks
      SET status = $4,
          failure_code = $2,
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $3
      WHERE id = $1
        AND status IN ('queued', 'running', 'result_unknown')
      RETURNING id
    `,
      [
        row.task_id,
        input.failureCode,
        input.now,
        creditOutcome === "manual_review_required" ? "manual_review_required" : "failed",
      ],
    );
    if (!failed) {
      await db.query("COMMIT");
      return false;
    }

    if (row.current_attempt_id) {
      await db.query(
        `
        UPDATE task_attempts
        SET status = $5,
            failure_code = $3,
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = CASE WHEN $5 = 'failed' THEN $4::timestamptz ELSE NULL END,
            updated_at = $4
        WHERE id = $1
          AND task_id = $2
          AND status IN ('queued', 'running', 'result_unknown')
      `,
        [
          row.current_attempt_id,
          row.task_id,
          input.failureCode,
          input.now,
          creditOutcome === "manual_review_required" ? "manual_review_required" : "failed",
        ],
      );
    }

    const snapshot = parseSnapshot(row.input_snapshot_json);
    const amount = resolveGenerationBillingAmount(row.amount_reserved, snapshot);
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
    const teamMemberId = readString(snapshot.teamMemberId) ?? readString(snapshot.memberId);
    if (!row.reservation_id && teamMemberId && amount > 0 && creditOutcome === "released") {
      await refundTeamMemberGenerationCreditsInTransaction(db, {
        teamMemberId,
        amount,
        sourceId: row.task_id,
        reason: "生成失败返还积分",
        metadata: { failureCode: input.failureCode },
        now: input.now,
      });
    }
    const snapshotFailure = {
      failureCode: input.failureCode,
      displayMessage: input.displayMessage,
      noticeType: creditOutcome === "manual_review_required" ? "admin_action_required" : "error",
    };
    const creditSummary = {
      ...(creditOutcome === "released" ? { released: amount } : { reserved: amount }),
      settledAt: input.now.toISOString(),
    };
    if (creditOutcome === "manual_review_required") {
      await markGenerationTaskSnapshotManualReviewRequired(db, {
        taskId: row.task_id,
        attemptId: row.current_attempt_id,
        failure: snapshotFailure,
        creditSummary,
        now: input.now,
      });
    } else {
      await markGenerationTaskSnapshotFailed(db, {
        taskId: row.task_id,
        attemptId: row.current_attempt_id,
        failure: snapshotFailure,
        creditStatus: creditOutcome,
        creditSummary,
        now: input.now,
      });
    }
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
    shardStore?: {
      reserve(
        db: SqlDatabase,
        assignment: {
          assignmentKey: string;
          taskId: string;
          mediaType: "image" | "video" | "audio";
          stage: "poll";
          routeKey: string;
          redisJobId: string;
          now: Date;
          maxActiveShardsPerStage?: number;
          reopenThreshold?: number;
        },
      ): Promise<{ assignmentKey: string; queueName: string }>;
      markPublished(
        db: SqlDatabase,
        input: { assignmentKey: string; redisJobId: string; now: Date },
      ): Promise<unknown>;
    };
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
        t.task_type,
        t.input_snapshot_json,
        COALESCE((
          SELECT pr.poll_sequence
          FROM provider_requests pr
          WHERE pr.task_id = t.id
            AND (t.current_attempt_id IS NULL OR pr.attempt_id = t.current_attempt_id)
            AND pr.external_submission_started_at IS NOT NULL
            AND pr.external_request_id IS NOT NULL
            AND pr.status IN ('submitted', 'accepted', 'running', 'result_unknown')
          ORDER BY pr.updated_at DESC, pr.created_at DESC
          LIMIT 1
        ), 0) AS poll_sequence
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      LEFT JOIN projects project ON project.id = t.project_id
      WHERE (
          t.status = 'running'
          OR (
            t.status = 'result_unknown'
            AND t.failure_code = 'lease_expired_after_external_start'
          )
        )
        AND (
          (t.task_type = 'episode_generate_video' AND t.input_snapshot_json->>'providerExecutor' = 'seedance')
          OR (t.task_type = 'episode_generate_image' AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
          OR (t.task_type = 'episode_generate_audio' AND t.input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
        )
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
      taskType: candidate.task_type,
      now: input.now,
      staleCutoff,
    });
    if (!claimed) {
      continue;
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    const mediaType = candidate.task_type === "episode_generate_image"
      ? "image"
      : candidate.task_type === "episode_generate_audio" ? "audio" : "video";
    const modelCode = readString(snapshot.model) || (mediaType === "image"
      ? "gpt-image-2"
      : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance-i2v-pro");
    const providerExecutor = readString(snapshot.providerExecutor)
      || (mediaType === "video" ? "seedance" : mediaType === "image" ? "gpt-image-2" : "aliyun-bailian-audio");
    const pollAttempt = Math.max(1, Math.floor(Number(candidate.poll_sequence) || 0));
    const repairToken = input.now.getTime();
    let redisJobId = buildGenerationBullMQJobId(
      `generation.${mediaType}.poll`,
      candidate.task_id,
      pollAttempt,
      "repair",
      repairToken,
    );
    let queueName = mediaType === "image"
      ? input.config.queues.pollImage
      : mediaType === "audio" ? input.config.queues.pollAudio : input.config.queues.pollVideo;
    let queueAssignmentKey: string | undefined;
    if (input.config.sharding.enabled && input.shardStore) {
      const existing = await queryOne<{ assignment_key: string; queue_name: string; redis_job_id: string }>(
        db,
        `
          SELECT assignment.assignment_key, shard.queue_name, assignment.redis_job_id
          FROM generation_queue_stage_assignments assignment
          JOIN generation_queue_shards shard ON shard.id = assignment.shard_id
          WHERE assignment.task_id = $1
            AND assignment.stage = 'poll'
            AND assignment.assignment_key LIKE $2
            AND assignment.redis_job_id IS NOT NULL
            AND assignment.status = 'publishing'
          ORDER BY assignment.created_at ASC
          LIMIT 1
        `,
        [candidate.task_id, `generation.repair.poll:${candidate.task_id}:%`],
      );
      redisJobId = existing?.redis_job_id ?? redisJobId;
      const assignment = existing ? null : await input.shardStore.reserve(db, {
          assignmentKey: `generation.repair.poll:${candidate.task_id}:${repairToken}`,
          taskId: candidate.task_id,
          mediaType,
          stage: "poll",
          routeKey: [
            providerExecutor,
            modelCode,
            createGenerationProviderRouteIdentity(snapshot),
          ].filter(Boolean).join(":"),
          redisJobId,
          now: input.now,
          maxActiveShardsPerStage: input.config.sharding.maxActiveShardsPerStage,
          reopenThreshold: input.config.sharding.reopenThreshold,
        });
      queueName = existing?.queue_name ?? assignment!.queueName;
      queueAssignmentKey = existing?.assignment_key ?? assignment!.assignmentKey;
    }
    await input.publisher.add(
      queueName,
      `generation.${mediaType}.poll.repair`,
      {
        taskId: candidate.task_id,
        workflowId: candidate.workflow_id,
        mediaType,
        modelCode,
        providerExecutor,
        pollAttempt,
        ...(queueAssignmentKey ? { queueAssignmentKey } : {}),
      },
      {
        jobId: redisJobId,
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
    if (queueAssignmentKey && input.shardStore) {
      await input.shardStore.markPublished(db, {
        assignmentKey: queueAssignmentKey,
        redisJobId,
        now: input.now,
      });
    }
    repairedTaskIds.push(candidate.task_id);
  }

  const finalizeCandidates = await db.query<RunningSeedancePollRepairRow>(
    `
      SELECT
        t.id AS task_id,
        COALESCE(workflow.created_by_user_id, project.owner_user_id) AS user_id,
        t.workflow_id,
        t.task_type,
        t.input_snapshot_json
      FROM tasks t
      JOIN workflows workflow ON workflow.id = t.workflow_id
      LEFT JOIN projects project ON project.id = t.project_id
      WHERE (
          t.status IN ('running', 'manual_review_required', 'result_unknown')
          OR (t.status = 'failed' AND t.failure_code = 'generation_queue_error')
        )
        AND (
          (t.task_type = 'episode_generate_video' AND t.input_snapshot_json->>'providerExecutor' = 'seedance')
          OR (t.task_type = 'episode_generate_image' AND t.input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
          OR (t.task_type = 'episode_generate_audio' AND t.input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
        )
        AND (
          t.locked_until IS NULL
          OR t.locked_until < $3
        )
        AND EXISTS (
          SELECT 1
          FROM provider_requests pr
          WHERE pr.task_id = t.id
            AND (t.current_attempt_id IS NULL OR pr.attempt_id = t.current_attempt_id)
            AND pr.status = 'succeeded'
            AND (
              t.task_type = 'episode_generate_image'
              OR pr.external_request_id IS NOT NULL
            )
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
    const claim = await markRunningFinalizeRepairClaimed(db, {
      taskId: candidate.task_id,
      taskType: candidate.task_type,
      now: input.now,
      staleCutoff,
    });
    if (!claim.claimed) {
      continue;
    }
    if (claim.recoveredQueueFailure) {
      await db.query(
        `
          UPDATE ai_generation_task_snapshots
          SET status = 'manual_review_required',
              progress_stage = 'manual_review_required',
              credit_status = 'manual_review_required',
              updated_at = $2
          WHERE task_id = $1
            AND status = 'failed'
        `,
        [candidate.task_id, input.now],
      );
    }

    const snapshot = parseSnapshot(candidate.input_snapshot_json);
    const mediaType = candidate.task_type === "episode_generate_image"
      ? "image"
      : candidate.task_type === "episode_generate_audio" ? "audio" : "video";
    await appendGenerationTaskFinalizeRequestedOutboxEvent(db, {
      userId: candidate.user_id,
      workflowId: candidate.workflow_id,
      taskId: candidate.task_id,
      kind: mediaType,
      modelCode: readString(snapshot.model) || (mediaType === "image" ? "gpt-image-2" : mediaType === "audio" ? "aliyun-bailian-audio" : "seedance-i2v-pro"),
      providerExecutor: readString(snapshot.providerExecutor) || (mediaType === "video" ? "seedance" : mediaType === "image" ? "gpt-image-2" : "aliyun-bailian-audio"),
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
    taskType: string;
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
      AND task_type = $4
      AND (
        (task_type = 'episode_generate_video' AND input_snapshot_json->>'providerExecutor' = 'seedance')
        OR (task_type = 'episode_generate_image' AND input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
        OR (task_type = 'episode_generate_audio' AND input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
      )
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff, input.taskType],
  );

  return Boolean(row);
}

async function markRunningPollRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    taskType: string;
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
        AND task_type = $4
        AND (
          (task_type = 'episode_generate_video' AND input_snapshot_json->>'providerExecutor' = 'seedance')
          OR (task_type = 'episode_generate_image' AND input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
          OR (task_type = 'episode_generate_audio' AND input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
        )
        AND (
          last_dispatched_at IS NULL
          OR last_dispatched_at < $3
        )
      RETURNING id
    `,
    [input.taskId, input.now, input.staleCutoff, input.taskType],
  );

  return Boolean(row);
}

async function markRunningFinalizeRepairClaimed(
  db: SqlDatabase,
  input: {
    taskId: string;
    taskType: string;
    now: Date;
    staleCutoff: Date;
  },
): Promise<{ claimed: boolean; recoveredQueueFailure: boolean }> {
  const row = await queryOne<{ id: string; recovered_queue_failure: boolean }>(
    db,
    `
      WITH candidate AS (
        SELECT
          id,
          current_attempt_id,
          (status = 'failed' AND failure_code = 'generation_queue_error') AS recovered_queue_failure
        FROM tasks
        WHERE id = $1
          AND (
            status IN ('running', 'manual_review_required', 'result_unknown')
            OR (status = 'failed' AND failure_code = 'generation_queue_error')
          )
          AND task_type = $4
          AND (
            (task_type = 'episode_generate_video' AND input_snapshot_json->>'providerExecutor' = 'seedance')
            OR (task_type = 'episode_generate_image' AND input_snapshot_json->>'providerExecutor' IN ('gpt-image-2', 'image-http'))
            OR (task_type = 'episode_generate_audio' AND input_snapshot_json->>'providerExecutor' IN ('aliyun-bailian-audio', 'apimart-audio'))
          )
          AND (
            locked_until IS NULL
            OR locked_until < $2
          )
          AND (
            last_dispatched_at IS NULL
            OR last_dispatched_at < $3
          )
        FOR UPDATE
      ),
      reopened_attempt AS (
        UPDATE task_attempts attempt
        SET status = 'manual_review_required',
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            finished_at = NULL,
            updated_at = $2
        FROM candidate
        WHERE candidate.recovered_queue_failure
          AND attempt.id = candidate.current_attempt_id
          AND attempt.task_id = candidate.id
          AND attempt.status = 'failed'
          AND attempt.failure_code = 'generation_queue_error'
        RETURNING attempt.id
      )
      UPDATE tasks task
      SET status = CASE
            WHEN candidate.recovered_queue_failure
              THEN 'manual_review_required'
            ELSE task.status
          END,
          last_dispatched_at = $2,
          updated_at = $2
      FROM candidate
      WHERE task.id = candidate.id
        AND (
          NOT candidate.recovered_queue_failure
          OR EXISTS (SELECT 1 FROM reopened_attempt)
        )
      RETURNING task.id, candidate.recovered_queue_failure
    `,
    [input.taskId, input.now, input.staleCutoff, input.taskType],
  );

  return {
    claimed: Boolean(row),
    recoveredQueueFailure: row?.recovered_queue_failure === true,
  };
}

async function releaseStaleGenerationQueueAssignmentIfStageExited(
  db: SqlDatabase,
  input: {
    assignmentKey: string;
    now: Date;
    reopenThreshold?: number;
    allowNonTerminalTask: boolean;
    requireNoActiveOutbox: boolean;
    reason: string;
  },
) {
  await db.query("BEGIN");
  try {
    const releasable = await queryOne<{ assignment_key: string }>(
      db,
      `
        SELECT assignment.assignment_key
        FROM generation_queue_stage_assignments assignment
        JOIN tasks task ON task.id = assignment.task_id
        WHERE assignment.assignment_key = $1
          AND assignment.status IN ('publishing', 'admitted')
          AND (task.locked_until IS NULL OR task.locked_until <= $2)
          AND ($3::boolean OR task.status IN ('succeeded', 'failed', 'canceled'))
          AND (NOT $4::boolean OR NOT EXISTS (
            SELECT 1
            FROM outbox_events event
            WHERE event.payload_json->>'taskId' = task.id::text
              AND event.status IN ('pending', 'processing', 'failed')
              AND (
                (assignment.stage = 'submit' AND event.event_type = 'generation.task.created')
                OR (assignment.stage = 'poll' AND event.event_type = 'generation.task.poll_requested')
                OR (
                  assignment.stage = 'fetch'
                  AND event.event_type = 'generation.task.finalize_requested'
                  AND event.payload_json->>'artifactStage' = 'fetch'
                )
                OR (
                  assignment.stage = 'persist'
                  AND event.event_type = 'generation.task.finalize_requested'
                  AND COALESCE(event.payload_json->>'artifactStage', 'persist') <> 'fetch'
                )
              )
          ))
        FOR UPDATE OF assignment
      `,
      [input.assignmentKey, input.now, input.allowNonTerminalTask, input.requireNoActiveOutbox],
    );
    if (!releasable) {
      await db.query("COMMIT");
      return false;
    }

    const released = await releaseGenerationQueueStage(db, {
      assignmentKey: input.assignmentKey,
      reason: input.reason,
      now: input.now,
      reopenThreshold: input.reopenThreshold,
    });
    await db.query("COMMIT");
    return released?.released === true;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function isLiveGenerationAssignmentJobState(state: GenerationQueueAssignmentJobState) {
  return state === "waiting"
    || state === "active"
    || state === "delayed"
    || state === "prioritized"
    || state === "waiting-children"
    || state === "paused";
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
