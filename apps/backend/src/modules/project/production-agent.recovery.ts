import type { TaskStatus } from "../../../../../packages/contracts/domain/states.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { aggregateWorkflowStatus, claimQueuedTask } from "../workflow-task/workflow-task.service.ts";
import {
  productionAgentTaskType,
  productionAgentType,
  productionAgentWorkflowType,
} from "./production-agent.types.ts";

interface ProductionRecoveryRoute {
  workflow_id: string;
  task_id: string;
  task_status: TaskStatus;
  current_attempt_id: string | null;
}

export interface ProductionAgentRecoveryResult {
  workflowId: string;
  taskId: string;
  projectId: string;
  status: TaskStatus;
  attemptId: string | null;
  attemptNumber: number | null;
}

export class ProductionAgentRecoveryError extends Error {
  constructor(
    public readonly code:
      | "production_agent_task_route_mismatch"
      | "production_agent_task_not_cancelable"
      | "production_agent_task_not_recoverable"
      | "production_agent_task_recovery_conflict",
  ) {
    super(code);
    this.name = "ProductionAgentRecoveryError";
  }
}

export async function cancelProductionAgentTask(
  db: SqlDatabase,
  input: { taskId: string; projectId: string; now: Date },
): Promise<ProductionAgentRecoveryResult> {
  await db.query("BEGIN");
  let route: ProductionRecoveryRoute;
  try {
    route = await requireProductionRecoveryRoute(db, input);
    if (route.task_status === "succeeded") {
      throw new ProductionAgentRecoveryError("production_agent_task_not_cancelable");
    }
    if (route.task_status !== "canceled") {
      if (route.current_attempt_id) {
        await db.query(
          `
            UPDATE task_attempts
            SET status = 'canceled',
                failure_code = 'user_canceled',
                locked_by = NULL,
                locked_until = NULL,
                heartbeat_at = NULL,
                finished_at = COALESCE(finished_at, $3),
                updated_at = $3
            WHERE id = $1
              AND task_id = $2
              AND status IN ('created', 'running', 'result_unknown', 'manual_review_required')
          `,
          [route.current_attempt_id, route.task_id, input.now],
        );
      }
      await db.query(
        `
          UPDATE tasks
          SET status = 'canceled',
              failure_code = 'user_canceled',
              locked_by = NULL,
              locked_until = NULL,
              heartbeat_at = NULL,
              updated_at = $2
          WHERE id = $1
        `,
        [route.task_id, input.now],
      );
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  await aggregateWorkflowStatus(db, route.workflow_id);
  const attemptNumber = route.current_attempt_id
    ? await findAttemptNumber(db, route.current_attempt_id)
    : null;
  return {
    workflowId: route.workflow_id,
    taskId: route.task_id,
    projectId: input.projectId,
    status: "canceled",
    attemptId: route.current_attempt_id,
    attemptNumber,
  };
}

export async function retryProductionAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    projectId: string;
    workerId: string;
    leaseMs: number;
    deferClaim?: boolean;
    now: Date;
  },
): Promise<ProductionAgentRecoveryResult> {
  return recoverProductionAgentTask(db, input);
}

export async function resumeProductionAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    projectId: string;
    workerId: string;
    leaseMs: number;
    deferClaim?: boolean;
    now: Date;
  },
): Promise<ProductionAgentRecoveryResult> {
  return recoverProductionAgentTask(db, input);
}

async function recoverProductionAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    projectId: string;
    workerId: string;
    leaseMs: number;
    deferClaim?: boolean;
    now: Date;
  },
): Promise<ProductionAgentRecoveryResult> {
  await db.query("BEGIN");
  let route: ProductionRecoveryRoute;
  try {
    route = await requireProductionRecoveryRoute(db, input);
    if (!["failed", "canceled", "result_unknown", "manual_review_required"].includes(route.task_status)) {
      throw new ProductionAgentRecoveryError("production_agent_task_not_recoverable");
    }
    await db.query(
      `
        UPDATE tasks
        SET status = 'queued',
            current_attempt_id = NULL,
            failure_code = NULL,
            max_attempts = GREATEST(max_attempts, attempt_count + 1),
            locked_by = NULL,
            locked_until = NULL,
            heartbeat_at = NULL,
            scheduled_at = $2,
            updated_at = $2
        WHERE id = $1
      `,
      [route.task_id, input.now],
    );
    await db.query(
      `
        UPDATE workflows
        SET status = 'queued',
            finished_at = NULL,
            failure_code = NULL,
            failure_message = NULL,
            updated_at = $2
        WHERE id = $1
      `,
      [route.workflow_id, input.now],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  if (input.deferClaim) {
    return {
      workflowId: route.workflow_id,
      taskId: route.task_id,
      projectId: input.projectId,
      status: "queued",
      attemptId: null,
      attemptNumber: null,
    };
  }

  const claimed = await claimProductionRecoveryTask(db, input);
  const concurrentlyClaimed = claimed
    ? null
    : await queryOne<ProductionRecoveryRoute>(
        db,
        productionRouteSql(),
        productionRouteParameters(input),
      );
  const attemptId = claimed?.attempt.id ?? concurrentlyClaimed?.current_attempt_id ?? null;
  const attemptNumber = claimed?.attempt.attemptNumber
    ?? (attemptId ? await findAttemptNumber(db, attemptId) : null);
  if (!attemptId || attemptNumber == null || (!claimed && concurrentlyClaimed?.task_status !== "running")) {
    throw new ProductionAgentRecoveryError("production_agent_task_recovery_conflict");
  }
  return {
    workflowId: route.workflow_id,
    taskId: route.task_id,
    projectId: input.projectId,
    status: "running",
    attemptId,
    attemptNumber,
  };
}

async function claimProductionRecoveryTask(
  db: SqlDatabase,
  input: { taskId: string; projectId: string; workerId: string; leaseMs: number; now: Date },
) {
  const route = await queryOne<{ id: string }>(
    db,
    productionRouteSql(),
    productionRouteParameters(input),
  );
  if (!route) {
    throw new ProductionAgentRecoveryError("production_agent_task_route_mismatch");
  }
  return claimQueuedTask(db, input);
}

async function requireProductionRecoveryRoute(
  db: SqlDatabase,
  input: { taskId: string; projectId: string },
): Promise<ProductionRecoveryRoute> {
  const route = await queryOne<ProductionRecoveryRoute>(
    db,
    `${productionRouteSql()} FOR UPDATE OF task, workflow`,
    productionRouteParameters(input),
  );
  if (!route) {
    throw new ProductionAgentRecoveryError("production_agent_task_route_mismatch");
  }
  return route;
}

function productionRouteSql() {
  return `
    SELECT workflow.id AS workflow_id,
           task.id AS task_id,
           task.status AS task_status,
           task.current_attempt_id
    FROM tasks task
    JOIN workflows workflow ON workflow.id = task.workflow_id
    WHERE task.id = $1
      AND workflow.project_id = $2
      AND task.project_id = $2
      AND workflow.canvas_project_id IS NULL
      AND task.canvas_project_id IS NULL
      AND workflow.workflow_type = $3
      AND task.task_type = $4
      AND task.queue_name = 'task-center'
      AND task.target_entity_type = 'project'
      AND task.target_entity_id::text = $2::text
      AND workflow.input_snapshot_json->>'agentType' = $5
      AND workflow.input_snapshot_json->>'scopeType' = 'project'
      AND workflow.input_snapshot_json->>'scopeId' = $2::text
      AND task.input_snapshot_json->>'agentType' = $5
      AND task.input_snapshot_json->>'scopeType' = 'project'
      AND task.input_snapshot_json->>'scopeId' = $2::text
    LIMIT 1
  `;
}

function productionRouteParameters(input: { taskId: string; projectId: string }) {
  return [
    input.taskId,
    input.projectId,
    productionAgentWorkflowType,
    productionAgentTaskType,
    productionAgentType,
  ];
}

async function findAttemptNumber(db: SqlDatabase, attemptId: string) {
  const attempt = await queryOne<{ attempt_number: number }>(
    db,
    "SELECT attempt_number FROM task_attempts WHERE id = $1",
    [attemptId],
  );
  return attempt?.attempt_number ?? null;
}
