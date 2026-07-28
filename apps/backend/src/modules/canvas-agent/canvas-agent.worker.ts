import { setTimeout as sleep } from "node:timers/promises";

import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  aggregateWorkflowStatus,
  finalizeTaskAttempt,
  releaseTaskAttemptForWait,
  type AttemptRecord,
} from "../workflow-task/workflow-task.service.ts";
import {
  claimCanvasAgentTask,
  claimCanvasAgentConversationLock,
  heartbeatCanvasAgentTask,
  heartbeatCanvasAgentConversationLock,
  findCanvasAgentTask,
  releaseCanvasAgentConversationLock,
  transitionCanvasAgentTask,
} from "./canvas-agent-task.service.ts";
import { CanvasAgentRepairService } from "./canvas-agent-repair.service.ts";
import type { CanvasAgentExecutor } from "./canvas-agent-executor.ts";
import type { CanvasAgentTaskRecord } from "./canvas-agent.types.ts";

const defaultLeaseMs = 60_000;
const defaultHeartbeatIntervalMs = 15_000;
const defaultPollIntervalMs = 1_000;

export interface CanvasAgentWorkerProcessResult {
  taskId: string;
  status: "claimed" | "skipped" | "queued" | "running" | "succeeded" | "failed" | "canceled"
    | "waiting_approval" | "waiting_external" | "paused"
    | "result_unknown" | "manual_review_required";
  failureCode?: string | null;
}

export interface CanvasAgentWorkerCycleResult {
  repaired: number;
  inspected: number;
  processed: CanvasAgentWorkerProcessResult[];
}

export interface CanvasAgentWorkerDependencies {
  db: SqlDatabase;
  executor: Pick<CanvasAgentExecutor, "execute">;
  workerId: string;
  leaseMs?: number;
  heartbeatIntervalMs?: number;
  now?: () => Date;
  repair?: Pick<CanvasAgentRepairService, "repairExpiredLeases"> & Partial<Pick<CanvasAgentRepairService, "resumeCompletedGenerations">>;
  claimTask?: typeof claimCanvasAgentTask;
  claimConversationLock?: typeof claimCanvasAgentConversationLock;
  heartbeatTask?: typeof heartbeatCanvasAgentTask;
  heartbeatConversationLock?: typeof heartbeatCanvasAgentConversationLock;
  releaseConversationLock?: typeof releaseCanvasAgentConversationLock;
  findTask?: typeof findCanvasAgentTask;
  finalizeAttempt?: typeof finalizeTaskAttempt;
  releaseAttempt?: typeof releaseTaskAttemptForWait;
  transitionTask?: typeof transitionCanvasAgentTask;
  aggregateWorkflow?: typeof aggregateWorkflowStatus;
  listQueuedTaskIds?: (limit: number) => Promise<string[]>;
  hasExternalSubmission?: (taskId: string) => Promise<boolean>;
}

/**
 * Durable Canvas Agent runner. The worker owns only orchestration state;
 * provider calls, media generation and billing remain behind the executor.
 */
export class CanvasAgentWorker {
  private readonly now: () => Date;
  private readonly leaseMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly repair: Pick<CanvasAgentRepairService, "repairExpiredLeases"> & Partial<Pick<CanvasAgentRepairService, "resumeCompletedGenerations">>;
  private readonly claimTask: typeof claimCanvasAgentTask;
  private readonly claimConversationLock: typeof claimCanvasAgentConversationLock;
  private readonly heartbeatTask: typeof heartbeatCanvasAgentTask;
  private readonly heartbeatConversationLock: typeof heartbeatCanvasAgentConversationLock;
  private readonly releaseConversationLock: typeof releaseCanvasAgentConversationLock;
  private readonly findTask: typeof findCanvasAgentTask;
  private readonly finalizeAttempt: typeof finalizeTaskAttempt;
  private readonly releaseAttempt: typeof releaseTaskAttemptForWait;
  private readonly transitionTask: typeof transitionCanvasAgentTask;
  private readonly aggregateWorkflow: typeof aggregateWorkflowStatus;

  constructor(private readonly deps: CanvasAgentWorkerDependencies) {
    this.now = deps.now ?? (() => new Date());
    this.leaseMs = positiveInteger(deps.leaseMs, defaultLeaseMs);
    this.heartbeatIntervalMs = positiveInteger(
      deps.heartbeatIntervalMs,
      Math.min(defaultHeartbeatIntervalMs, Math.max(1_000, Math.floor(this.leaseMs / 3))),
    );
    this.repair = deps.repair ?? new CanvasAgentRepairService({ db: deps.db, now: this.now });
    this.claimTask = deps.claimTask ?? claimCanvasAgentTask;
    this.claimConversationLock = deps.claimConversationLock ?? claimCanvasAgentConversationLock;
    this.heartbeatTask = deps.heartbeatTask ?? heartbeatCanvasAgentTask;
    this.heartbeatConversationLock = deps.heartbeatConversationLock ?? heartbeatCanvasAgentConversationLock;
    this.releaseConversationLock = deps.releaseConversationLock ?? releaseCanvasAgentConversationLock;
    this.findTask = deps.findTask ?? findCanvasAgentTask;
    this.finalizeAttempt = deps.finalizeAttempt ?? finalizeTaskAttempt;
    this.releaseAttempt = deps.releaseAttempt ?? releaseTaskAttemptForWait;
    this.transitionTask = deps.transitionTask ?? transitionCanvasAgentTask;
    this.aggregateWorkflow = deps.aggregateWorkflow ?? aggregateWorkflowStatus;
  }

  async processTask(taskId: string): Promise<CanvasAgentWorkerProcessResult> {
    const current = await this.findTask(this.deps.db, taskId);
    if (current?.status === "cancel_requested") {
      return this.cancelUnclaimedTask(current);
    }
    if (!current?.conversationId) return { taskId, status: "skipped" };
    const lockHeld = await this.claimConversationLock(this.deps.db, {
      conversationId: current.conversationId,
      workerId: this.deps.workerId,
      leaseMs: this.leaseMs,
      now: this.now(),
    });
    if (!lockHeld) return { taskId, status: "skipped" };
    const claimed = await this.claimTask(this.deps.db, {
      taskId,
      workerId: this.deps.workerId,
      leaseMs: this.leaseMs,
      now: this.now(),
    });
    if (!claimed) {
      await this.releaseConversationLock(this.deps.db, {
        conversationId: current.conversationId,
        workerId: this.deps.workerId,
      });
      return { taskId, status: "skipped" };
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    heartbeatTimer = setInterval(() => {
      void this.heartbeatTask(this.deps.db, {
        taskId,
        workerId: this.deps.workerId,
        leaseMs: this.leaseMs,
        now: this.now(),
      }).catch(() => undefined);
      void this.heartbeatConversationLock(this.deps.db, {
        conversationId: current.conversationId,
        workerId: this.deps.workerId,
        leaseMs: this.leaseMs,
        now: this.now(),
      }).catch(() => undefined);
    }, this.heartbeatIntervalMs);
    heartbeatTimer.unref?.();

    try {
      try {
        const result = await this.deps.executor.execute(taskId, { attemptId: claimed.attempt.id });
        return await this.settleClaim(claimed.attempt, taskId, result);
      } catch (error) {
        return await this.handleExecutionError(claimed.attempt, taskId, error);
      }
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      await this.releaseConversationLock(this.deps.db, {
        conversationId: current.conversationId,
        workerId: this.deps.workerId,
      });
    }
  }

  async runOnce(limit = 10): Promise<CanvasAgentWorkerCycleResult> {
    const repairedResult = await this.repair.repairExpiredLeases(limit);
    const resumed = await this.repair.resumeCompletedGenerations?.(limit);
    const taskIds = this.deps.listQueuedTaskIds
      ? await this.deps.listQueuedTaskIds(Math.min(Math.max(limit, 1), 100))
      : await this.readQueuedTaskIds(Math.min(Math.max(limit, 1), 100));
    const processed: CanvasAgentWorkerProcessResult[] = [];
    for (const taskId of taskIds) {
      processed.push(await this.processTask(taskId));
    }
    return {
      repaired: repairedResult.repaired + (resumed?.resumed ?? 0),
      inspected: repairedResult.inspected,
      processed,
    };
  }

  async runUntilStopped(input: {
    signal?: AbortSignal;
    pollIntervalMs?: number;
    batchSize?: number;
  } = {}) {
    const pollIntervalMs = positiveInteger(input.pollIntervalMs, defaultPollIntervalMs);
    const batchSize = positiveInteger(input.batchSize, 10);
    while (!input.signal?.aborted) {
      await this.runOnce(batchSize);
      if (input.signal?.aborted) break;
      await sleep(pollIntervalMs);
    }
  }

  private async settleClaim(
    attempt: AttemptRecord,
    taskId: string,
    result: CanvasAgentTaskRecord | undefined,
  ): Promise<CanvasAgentWorkerProcessResult> {
    const task = result ?? await this.findTask(this.deps.db, taskId);
    if (!task) {
      await this.finalizeAttempt(this.deps.db, {
        taskId: attempt.taskId,
        attemptId: attempt.id,
        status: "result_unknown",
        failureCode: "canvas_agent_task_missing_after_execution",
        now: this.now(),
      });
      return { taskId, status: "result_unknown", failureCode: "canvas_agent_task_missing_after_execution" };
    }

    if (task.status === "cancel_requested") {
      await this.transitionTask(this.deps.db, {
        taskId: task.id,
        from: ["cancel_requested"],
        to: "canceled",
        failureCode: "cancel_requested",
        now: this.now(),
      });
      await this.finalizeAttempt(this.deps.db, {
        taskId: task.workflowTaskId,
        attemptId: attempt.id,
        status: "canceled",
        failureCode: "cancel_requested",
        now: this.now(),
      });
      await this.aggregateWorkflow(this.deps.db, task.workflowId);
      return { taskId: task.id, status: "canceled", failureCode: "cancel_requested" };
    }

    if (isTerminalStatus(task.status)) {
      await this.finalizeAttempt(this.deps.db, {
        taskId: task.workflowTaskId,
        attemptId: attempt.id,
        status: task.status,
        failureCode: task.failureCode,
        now: this.now(),
      });
      await this.aggregateWorkflow(this.deps.db, task.workflowId);
      return { taskId: task.id, status: task.status, failureCode: task.failureCode };
    }

    await this.releaseAttempt(this.deps.db, {
      taskId: task.workflowTaskId,
      attemptId: attempt.id,
      reason: task.status === "waiting_approval"
        ? "canvas_agent_waiting_approval"
        : task.status === "waiting_external"
          ? "canvas_agent_waiting_external"
          : "canvas_agent_execution_released",
      now: this.now(),
    });
    return { taskId: task.id, status: task.status };
  }

  private async handleExecutionError(
    attempt: AttemptRecord,
    taskId: string,
    error: unknown,
  ): Promise<CanvasAgentWorkerProcessResult> {
    const current = await this.findTask(this.deps.db, taskId);
    if (current && (isTerminalStatus(current.status) || isWaitingStatus(current.status))) {
      return this.settleClaim(attempt, taskId, current);
    }
    const externallyStarted = this.deps.hasExternalSubmission
      ? await this.deps.hasExternalSubmission(taskId)
      : await this.readExternalSubmission(taskId);
    const failureCode = externallyStarted
      ? "canvas_agent_worker_result_unknown"
      : redactFailureCode(error, "canvas_agent_worker_error");
    const status = externallyStarted ? "result_unknown" : "failed";
    const transitioned = await this.transitionTask(this.deps.db, {
      taskId,
      from: ["running", "queued"],
      to: status,
      failureCode,
      now: this.now(),
    }).catch(() => undefined);
    if (transitioned) {
      await this.finalizeAttempt(this.deps.db, {
        taskId: transitioned.workflowTaskId,
        attemptId: attempt.id,
        status,
        failureCode,
        now: this.now(),
      });
      await this.aggregateWorkflow(this.deps.db, transitioned.workflowId);
    } else {
      await this.finalizeAttempt(this.deps.db, {
        taskId: attempt.taskId,
        attemptId: attempt.id,
        status,
        failureCode,
        now: this.now(),
      }).catch(() => undefined);
    }
    return { taskId, status, failureCode };
  }

  private async readQueuedTaskIds(limit: number) {
    const result = await this.deps.db.query<{ id: string }>(
      `
        SELECT id
        FROM canvas_agent_tasks
        WHERE status = 'queued'
           OR (status = 'cancel_requested' AND lease_owner IS NULL)
        ORDER BY created_at ASC, id ASC
        LIMIT $1
      `,
      [limit],
    );
    return result.rows.map((row) => row.id);
  }

  private async cancelUnclaimedTask(task: CanvasAgentTaskRecord): Promise<CanvasAgentWorkerProcessResult> {
    const canceled = await this.transitionTask(this.deps.db, {
      taskId: task.id,
      from: ["cancel_requested"],
      to: "canceled",
      failureCode: "cancel_requested",
      now: this.now(),
    });
    await this.deps.db.query("BEGIN");
    try {
      await this.deps.db.query(
        `
          UPDATE task_attempts
          SET status='canceled', failure_code='cancel_requested',
              locked_by=NULL, locked_until=NULL, heartbeat_at=NULL,
              finished_at=$2, updated_at=$2
          WHERE task_id=$1 AND status='running'
        `,
        [task.workflowTaskId, this.now()],
      );
      await this.deps.db.query(
        `
          UPDATE tasks
          SET status='canceled', failure_code='cancel_requested',
              locked_by=NULL, locked_until=NULL, heartbeat_at=NULL, updated_at=$2
          WHERE id=$1 AND status IN ('queued','running','cancel_requested')
        `,
        [task.workflowTaskId, this.now()],
      );
      await this.deps.db.query(
        "UPDATE workflows SET status='canceled', failure_code='cancel_requested', finished_at=COALESCE(finished_at,$2), updated_at=$2 WHERE id=$1 AND status IN ('queued','running','cancel_requested')",
        [task.workflowId, this.now()],
      );
      await this.deps.db.query("COMMIT");
    } catch (error) {
      await this.deps.db.query("ROLLBACK");
      throw error;
    }
    return { taskId: canceled.id, status: "canceled", failureCode: "cancel_requested" };
  }

  private async readExternalSubmission(taskId: string) {
    const result = await this.deps.db.query<{ started: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM provider_requests
          WHERE agent_task_id = $1
            AND external_submission_started_at IS NOT NULL
            AND status NOT IN ('succeeded', 'failed', 'canceled')
        ) AS started
      `,
      [taskId],
    );
    return result.rows[0]?.started === true;
  }
}

function isTerminalStatus(status: CanvasAgentTaskRecord["status"]): status is
  "succeeded" | "failed" | "canceled" | "result_unknown" | "manual_review_required" {
  return ["succeeded", "failed", "canceled", "result_unknown", "manual_review_required"].includes(status);
}

function isWaitingStatus(status: CanvasAgentTaskRecord["status"]): status is
  "waiting_approval" | "waiting_external" | "paused" {
  return ["waiting_approval", "waiting_external", "paused"].includes(status);
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : fallback;
}

function redactFailureCode(error: unknown, fallback: string) {
  const value = error instanceof Error ? error.message : String(error);
  const normalized = value.trim().replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 120);
  return normalized || fallback;
}

export const __canvasAgentWorkerTestUtils = {
  isTerminalStatus,
  isWaitingStatus,
  redactFailureCode,
};
