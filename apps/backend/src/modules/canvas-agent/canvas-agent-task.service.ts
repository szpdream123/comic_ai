import { createHash, randomUUID } from "node:crypto";

import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { agentExecutionMetadata, agentExecutionScopePredicate } from "../shared/db/agent-execution-scope.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
} from "../workflow-task/workflow-task.service.ts";
import { sanitizeCanvasAgentValue } from "./canvas-agent-sensitive-data.ts";
import { canvasAgentShardQueueName, loadCanvasAgentShardConfig } from "./canvas-agent-shard.config.ts";
import { assignCanvasAgentConversationShard } from "./canvas-agent-shard.service.ts";
import type {
  CanvasAgentActor,
  CanvasAgentEventRecord,
  CanvasAgentMode,
  CanvasAgentStepRecord,
  CanvasAgentTaskRecord,
  CanvasAgentTaskStatus,
  CanvasAgentToolEffect,
} from "./canvas-agent.types.ts";

interface AgentTaskRow {
  id: string;
  canvas_id: string;
  conversation_id: string;
  workflow_id: string;
  workflow_task_id: string;
  owner_user_id: string;
  actor_team_member_id: string | null;
  mode: CanvasAgentMode;
  status: CanvasAgentTaskStatus;
  model_code: string;
  model_config_snapshot_json: Record<string, unknown>;
  budget_json: Record<string, unknown>;
  metrics_json: Record<string, unknown>;
  current_step_id: string | null;
  base_revision: number | string;
  event_sequence: number | string;
  failure_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface AgentStepRow {
  id: string;
  task_id: string;
  step_no: number | string;
  kind: string;
  status: CanvasAgentStepRecord["status"];
  tool_id: string | null;
  call_id: string | null;
  input_json: Record<string, unknown>;
  input_fingerprint: string;
  effect: CanvasAgentToolEffect;
  approval_id: string | null;
  provider_request_id: string | null;
  generation_task_id: string | null;
  credit_reservation_id: string | null;
  checkpoint_json: Record<string, unknown>;
  output_summary: string | null;
  error_code: string | null;
}

interface AgentEventRow {
  id: string;
  task_id: string;
  sequence: number | string;
  event_type: string;
  event_json: Record<string, unknown>;
  created_at: Date | string;
}

export class CanvasAgentStateConflictError extends Error {
  readonly code = "canvas_agent_state_conflict";

  constructor() {
    super("canvas_agent_state_conflict");
  }
}

export class CanvasAgentStepSkipError extends Error {
  constructor(readonly code: "canvas_agent_step_not_found" | "canvas_agent_step_skip_unsafe_running" | "canvas_agent_step_skip_state_conflict") {
    super(code);
  }
}

export interface CanvasAgentMetricIncrements {
  modelRoundCount?: number;
  modelDurationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCallCount?: number;
  toolDurationMs?: number;
  policyDenyCount?: number;
  approvalRequestCount?: number;
  interjectionCount?: number;
}

export async function incrementCanvasAgentMetrics(
  db: SqlDatabase,
  input: {
    taskId: string;
    increments: CanvasAgentMetricIncrements;
    now: Date;
  },
) {
  const delta = input.increments;
  const row = await queryOne<{ metrics_json: Record<string, unknown> }>(
    db,
    `
      UPDATE canvas_agent_tasks
      SET metrics_json = COALESCE(metrics_json, '{}'::jsonb) || jsonb_build_object(
            'modelRoundCount', COALESCE((metrics_json->>'modelRoundCount')::bigint, 0) + $2,
            'modelDurationMs', COALESCE((metrics_json->>'modelDurationMs')::bigint, 0) + $3,
            'promptTokens', COALESCE((metrics_json->>'promptTokens')::bigint, 0) + $4,
            'completionTokens', COALESCE((metrics_json->>'completionTokens')::bigint, 0) + $5,
            'totalTokens', COALESCE((metrics_json->>'totalTokens')::bigint, 0) + $6,
            'toolCallCount', COALESCE((metrics_json->>'toolCallCount')::bigint, 0) + $7,
            'toolDurationMs', COALESCE((metrics_json->>'toolDurationMs')::bigint, 0) + $8,
            'policyDenyCount', COALESCE((metrics_json->>'policyDenyCount')::bigint, 0) + $9,
            'approvalRequestCount', COALESCE((metrics_json->>'approvalRequestCount')::bigint, 0) + $10,
            'interjectionCount', COALESCE((metrics_json->>'interjectionCount')::bigint, 0) + $11
          ),
          updated_at = $12
      WHERE id = $1
      RETURNING metrics_json
    `,
    [
      input.taskId,
      metricDelta(delta.modelRoundCount),
      metricDelta(delta.modelDurationMs),
      metricDelta(delta.promptTokens),
      metricDelta(delta.completionTokens),
      metricDelta(delta.totalTokens),
      metricDelta(delta.toolCallCount),
      metricDelta(delta.toolDurationMs),
      metricDelta(delta.policyDenyCount),
      metricDelta(delta.approvalRequestCount),
      metricDelta(delta.interjectionCount),
      input.now,
    ],
  );
  if (!row) throw new CanvasAgentStateConflictError();
  return row.metrics_json;
}

export async function createCanvasAgentConversation(
  db: SqlDatabase,
  input: {
    canvasId: string;
    actor: CanvasAgentActor;
    title?: string;
    now: Date;
  },
) {
  const row = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO canvas_agent_conversations (
        id, canvas_id, owner_user_id, actor_team_member_id, title, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      RETURNING id
    `,
    [
      randomUUID(),
      input.canvasId,
      input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null,
      input.title?.trim() ?? "",
      input.now,
    ],
  );
  return row!;
}

export async function listCanvasAgentConversations(
  db: SqlDatabase,
  input: {
    canvasId: string;
    actor: CanvasAgentActor;
    limit?: number;
  },
) {
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const result = await db.query<{
    id: string;
    canvas_id: string;
    owner_user_id: string;
    actor_team_member_id: string | null;
    title: string;
    status: "active" | "archived";
    pinned: boolean;
    task_id: string | null;
    task_status: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT conversation.id, conversation.canvas_id, conversation.owner_user_id,
             conversation.actor_team_member_id, conversation.title, conversation.status, conversation.pinned,
             conversation.created_at, conversation.updated_at,
             active_task.id AS task_id, active_task.status AS task_status
      FROM canvas_agent_conversations conversation
      LEFT JOIN LATERAL (
        SELECT task.id, task.status
        FROM canvas_agent_tasks task
        WHERE task.conversation_id = conversation.id
        ORDER BY task.updated_at DESC, task.id DESC
        LIMIT 1
      ) active_task ON TRUE
      WHERE conversation.canvas_id = $1 AND conversation.owner_user_id = $2
        AND conversation.actor_team_member_id IS NOT DISTINCT FROM $3
        AND conversation.deleted_at IS NULL
      ORDER BY conversation.pinned DESC, conversation.updated_at DESC, conversation.id DESC
      LIMIT $4
    `,
    [input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, limit],
  );
  return result.rows.map((row) => serializeCanvasAgentConversation(row));
}

export async function updateCanvasAgentConversation(
  db: SqlDatabase,
  input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    title?: string;
    status?: "active" | "archived";
    pinned?: boolean;
    now: Date;
  },
) {
  const title = input.title === undefined ? null : input.title.trim().slice(0, 200);
  const status = input.status ?? null;
  const pinned = input.pinned === undefined ? null : input.pinned;
  const row = await queryOne<{
    id: string;
    canvas_id: string;
    owner_user_id: string;
    actor_team_member_id: string | null;
    title: string;
    status: "active" | "archived";
    pinned: boolean;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    db,
    `
      UPDATE canvas_agent_conversations
      SET title = COALESCE($5, title),
          status = COALESCE($6, status),
          pinned = COALESCE($7, pinned),
          updated_at = $8
      WHERE id = $1 AND canvas_id = $2 AND owner_user_id = $3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
        AND deleted_at IS NULL
      RETURNING id, canvas_id, owner_user_id, actor_team_member_id, title, status,
                pinned, created_at, updated_at
    `,
    [
      input.conversationId,
      input.canvasId,
      input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null,
      title,
      status,
      pinned,
      input.now,
    ],
  );
  if (!row) throw new Error("canvas_agent_conversation_not_found");
  return serializeCanvasAgentConversation(row);
}

export async function deleteCanvasAgentConversation(
  db: SqlDatabase,
  input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const conversation = await queryOne<{ id: string }>(
      db,
      `
        SELECT id
        FROM canvas_agent_conversations
        WHERE id = $1 AND canvas_id = $2 AND owner_user_id = $3
          AND actor_team_member_id IS NOT DISTINCT FROM $4
          AND deleted_at IS NULL
        FOR UPDATE
      `,
      [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
    );
    if (!conversation) throw new Error("canvas_agent_conversation_not_found");
    const tasks = await db.query<{ id: string }>(
      `
        UPDATE canvas_agent_tasks
        SET status = CASE
              WHEN status IN ('queued','running','waiting_approval','waiting_external','paused','cancel_requested')
                THEN 'cancel_requested'
              ELSE status
            END,
            updated_at = $2
        WHERE conversation_id = $1
        RETURNING id
      `,
      [input.conversationId, input.now],
    );
    await db.query(
      `
        UPDATE canvas_agent_file_grants
        SET status = 'revoked', revoked_at = $2
        WHERE conversation_id = $1 AND status = 'active'
      `,
      [input.conversationId, input.now],
    );
    await db.query(
      `
        UPDATE canvas_agent_conversations
        SET status = 'archived', deleted_at = $2, updated_at = $2
        WHERE id = $1
      `,
      [input.conversationId, input.now],
    );
    for (const task of tasks.rows) {
      await appendCanvasAgentEvent(db, {
        taskId: task.id,
        eventType: "conversation.deleted",
        event: { conversationId: input.conversationId },
        now: input.now,
      });
    }
    await db.query("COMMIT");
    return { id: input.conversationId, status: "archived" as const };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function createCanvasAgentTask(
  db: SqlDatabase,
  input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    mode: CanvasAgentMode;
    modelCode: string;
    modelConfigSnapshot: Record<string, unknown>;
    budget?: Record<string, unknown>;
    baseRevision: number;
    userMessage: Record<string, unknown>;
    queueName?: string;
    now: Date;
  },
): Promise<CanvasAgentTaskRecord> {
  const agentTaskId = randomUUID();
  await db.query("BEGIN");
  try {
    const conversation = await queryOne<{ id: string; shard_id: number | string | null }>(
      db,
      `
        SELECT id, shard_id
        FROM canvas_agent_conversations
        WHERE id = $1 AND canvas_id = $2 AND owner_user_id = $3
          AND actor_team_member_id IS NOT DISTINCT FROM $4
          AND status = 'active' AND deleted_at IS NULL
        FOR UPDATE
      `,
      [
        input.conversationId,
        input.canvasId,
        input.actor.ownerUserId,
        input.actor.actorTeamMemberId ?? null,
      ],
    );
    if (!conversation) {
      throw new Error("canvas_agent_conversation_not_found");
    }
    const shardConfig = loadCanvasAgentShardConfig(process.env);
    const shardId = conversation.shard_id === null
      ? await assignCanvasAgentConversationShard(db, {
        conversationId: input.conversationId,
        config: shardConfig,
        now: input.now,
      })
      : Number(conversation.shard_id);
    const queueName = canvasAgentShardQueueName(shardConfig.baseQueueName, shardId, shardConfig.enabled);
    if (input.queueName !== undefined && input.queueName !== queueName) {
      throw new Error("canvas_agent_queue_name_shard_mismatch");
    }

    const workflow = await createWorkflowWithTasks(db, {
      userId: input.actor.ownerUserId,
      projectId: null,
      canvasProjectId: input.canvasId,
      workflowType: "canvas_agent",
      inputSnapshot: {
        ...agentExecutionMetadata(),
        agentTaskId,
        conversationId: input.conversationId,
        mode: input.mode,
        modelCode: input.modelCode,
        actorTeamMemberId: input.actor.actorTeamMemberId ?? null,
      },
      tasks: [{
        taskType: "canvas_agent.execute",
        queueName,
        targetEntityType: "canvas_agent_task",
        targetEntityId: agentTaskId,
        inputSnapshot: {
          ...agentExecutionMetadata(),
          agentTaskId,
          canvasId: input.canvasId,
          conversationId: input.conversationId,
        },
        // A deliberate approval/external wait creates a new audited attempt on
        // wakeup, so the limit must cover the tool budget rather than only
        // transient worker retries.
        maxAttempts: 100,
      }],
    });
    const workflowTask = workflow.tasks[0]!;
    const row = await queryOne<AgentTaskRow>(
      db,
      `
        INSERT INTO canvas_agent_tasks (
          id, canvas_id, conversation_id, workflow_id, workflow_task_id,
          owner_user_id, actor_team_member_id, mode, status, model_code,
          model_config_snapshot_json, budget_json, base_revision, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9,
          $10::jsonb, $11::jsonb, $12, $13, $13
        )
        RETURNING *
      `,
      [
        agentTaskId,
        input.canvasId,
        input.conversationId,
        workflow.workflow.id,
        workflowTask.id,
        input.actor.ownerUserId,
        input.actor.actorTeamMemberId ?? null,
        input.mode,
        input.modelCode,
        JSON.stringify(sanitizeCanvasAgentValue(input.modelConfigSnapshot)),
        JSON.stringify(input.budget ?? {}),
        input.baseRevision,
        input.now,
      ],
    );
    await appendCanvasAgentMessage(db, {
      conversationId: input.conversationId,
      taskId: agentTaskId,
      role: "user",
      content: input.userMessage,
      actor: input.actor,
      now: input.now,
    });
    await appendCanvasAgentEvent(db, {
      taskId: agentTaskId,
      eventType: "task.created",
      event: {
        status: "queued",
        workflowId: workflow.workflow.id,
        workflowTaskId: workflowTask.id,
      },
      now: input.now,
    });
    await enqueueCanvasAgentWakeup(db, {
      taskId: agentTaskId,
      reason: "task_created",
      eventKey: `canvas-agent:${agentTaskId}:created`,
      now: input.now,
    });
    await db.query("COMMIT");
    return taskFromRow(row!);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function claimCanvasAgentTask(
  db: SqlDatabase,
  input: { taskId: string; workerId: string; leaseMs: number; now: Date },
) {
  if (!await ownsCanvasAgentTask(db, input.taskId)) return undefined;
  const agentTask = await findCanvasAgentTask(db, input.taskId);
  if (!agentTask || agentTask.status !== "queued") return undefined;
  // Approval/external waits release the generic task lease. A fresh attempt is
  // created by claimQueuedTask; the previous attempt remains an audit record.
  await db.query(
    `
      UPDATE tasks
      SET status='queued', current_attempt_id=NULL, locked_by=NULL,
          locked_until=NULL, heartbeat_at=NULL, updated_at=$2
      WHERE id=$1 AND status <> 'queued'
    `,
    [agentTask.workflowTaskId, input.now],
  );
  const claimed = await claimQueuedTask(db, {
    taskId: agentTask.workflowTaskId,
    workerId: input.workerId,
    leaseMs: input.leaseMs,
    now: input.now,
  });
  if (!claimed) return undefined;
  const row = await queryOne<AgentTaskRow>(
    db,
    `
      UPDATE canvas_agent_tasks
      SET status = 'running', lease_owner = $2, lease_expires_at = $3,
          heartbeat_at = $4, updated_at = $4
      WHERE id = $1 AND status = 'queued'
      RETURNING *
    `,
    [input.taskId, input.workerId, new Date(input.now.getTime() + input.leaseMs), input.now],
  );
  if (!row) throw new CanvasAgentStateConflictError();
  await appendCanvasAgentEvent(db, {
    taskId: input.taskId,
    eventType: "task.started",
    event: { attemptId: claimed.attempt.id, workerId: input.workerId, ...agentExecutionMetadata() },
    now: input.now,
  });
  return { task: taskFromRow(row), attempt: claimed.attempt };
}

export async function ownsCanvasAgentTask(db: SqlDatabase, taskId: string) {
  const result = await db.query<{ id: string }>(`
    SELECT agent.id FROM canvas_agent_tasks agent
    JOIN tasks workflow_task ON workflow_task.id = agent.workflow_task_id
    WHERE agent.id = $1 AND ${agentExecutionScopePredicate("workflow_task")}
  `, [taskId]);
  return result.rows.length > 0;
}

export async function claimCanvasAgentConversationLock(
  db: SqlDatabase,
  input: { conversationId: string; workerId: string; leaseMs: number; now: Date },
) {
  const row = await queryOne<{ conversation_id: string }>(db, `
    INSERT INTO canvas_agent_conversation_locks (
      conversation_id, locked_by, locked_at, lease_expires_at
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (conversation_id) DO UPDATE
      SET locked_by = EXCLUDED.locked_by,
          locked_at = EXCLUDED.locked_at,
          lease_expires_at = EXCLUDED.lease_expires_at
      WHERE canvas_agent_conversation_locks.lease_expires_at <= EXCLUDED.locked_at
         OR canvas_agent_conversation_locks.locked_by = EXCLUDED.locked_by
    RETURNING conversation_id
  `, [
    input.conversationId,
    input.workerId,
    input.now,
    new Date(input.now.getTime() + input.leaseMs),
  ]);
  return Boolean(row);
}

export async function heartbeatCanvasAgentConversationLock(
  db: SqlDatabase,
  input: { conversationId: string; workerId: string; leaseMs: number; now: Date },
) {
  const row = await queryOne<{ conversation_id: string }>(db, `
    UPDATE canvas_agent_conversation_locks
    SET locked_at = $4, lease_expires_at = $5
    WHERE conversation_id = $1 AND locked_by = $2 AND lease_expires_at > $3
    RETURNING conversation_id
  `, [
    input.conversationId,
    input.workerId,
    input.now,
    input.now,
    new Date(input.now.getTime() + input.leaseMs),
  ]);
  return Boolean(row);
}

export async function releaseCanvasAgentConversationLock(
  db: SqlDatabase,
  input: { conversationId: string; workerId: string },
) {
  await db.query(
    "DELETE FROM canvas_agent_conversation_locks WHERE conversation_id=$1 AND locked_by=$2",
    [input.conversationId, input.workerId],
  );
}

export async function heartbeatCanvasAgentTask(
  db: SqlDatabase,
  input: { taskId: string; workerId: string; leaseMs: number; now: Date },
) {
  const row = await queryOne<{ id: string }>(
    db,
    `
      UPDATE canvas_agent_tasks
      SET heartbeat_at = $3, lease_expires_at = $4, updated_at = $3
      WHERE id = $1 AND lease_owner = $2 AND status = 'running'
      RETURNING id
    `,
    [input.taskId, input.workerId, input.now, new Date(input.now.getTime() + input.leaseMs)],
  );
  return Boolean(row);
}

export async function createCanvasAgentStep(
  db: SqlDatabase,
  input: {
    taskId: string;
    kind: string;
    effect: CanvasAgentToolEffect;
    input: Record<string, unknown>;
    toolId?: string | null;
    callId?: string | null;
    now: Date;
  },
): Promise<CanvasAgentStepRecord> {
  const sanitizedInput = sanitizeCanvasAgentValue(input.input);
  const fingerprint = fingerprintJson({ toolId: input.toolId, input: sanitizedInput });
  const row = await queryOne<AgentStepRow>(
    db,
    `
      WITH next_step AS (
        SELECT COALESCE(MAX(step_no), 0) + 1 AS step_no
        FROM canvas_agent_steps WHERE task_id = $2
      ), inserted AS (
        INSERT INTO canvas_agent_steps (
          id, task_id, step_no, kind, status, tool_id, call_id,
          input_json, input_fingerprint, effect, created_at, updated_at
        )
        SELECT $1, $2, next_step.step_no, $3, 'created', $4, $5, $6::jsonb, $7, $8, $9, $9
        FROM next_step
        RETURNING *
      )
      SELECT * FROM inserted
    `,
    [
      randomUUID(), input.taskId, input.kind, input.toolId ?? null,
      input.callId ?? null, JSON.stringify(sanitizedInput), fingerprint, input.effect, input.now,
    ],
  );
  if (!row) throw new CanvasAgentStateConflictError();
  await db.query(
    "UPDATE canvas_agent_tasks SET current_step_id = $2, updated_at = $3 WHERE id = $1",
    [input.taskId, row.id, input.now],
  );
  await appendCanvasAgentEvent(db, {
    taskId: input.taskId,
    eventType: "step.created",
    event: { stepId: row.id, kind: input.kind, toolId: input.toolId ?? null },
    now: input.now,
  });
  return stepFromRow(row);
}

export async function updateCanvasAgentStep(
  db: SqlDatabase,
  input: {
    stepId: string;
    status: CanvasAgentStepRecord["status"];
    providerRequestId?: string | null;
    generationTaskId?: string | null;
    creditReservationId?: string | null;
    checkpoint?: Record<string, unknown>;
    outputSummary?: string | null;
    errorCode?: string | null;
    fromStatuses?: CanvasAgentStepRecord["status"][];
    now: Date;
  },
) {
  const row = await queryOne<AgentStepRow>(
    db,
    `
      UPDATE canvas_agent_steps
      SET status = $2,
          provider_request_id = COALESCE($3, provider_request_id),
          generation_task_id = COALESCE($4, generation_task_id),
          credit_reservation_id = COALESCE($5, credit_reservation_id),
          checkpoint_json = COALESCE($6::jsonb, checkpoint_json),
          output_summary = COALESCE($7, output_summary), error_code = $8,
          completed_at = CASE WHEN $2 IN ('succeeded','failed','canceled','skipped','result_unknown','manual_review_required') THEN $9 ELSE completed_at END,
          updated_at = $9
      WHERE id = $1
        AND ($10::text[] IS NULL OR status = ANY($10::text[]))
      RETURNING *
    `,
    [
      input.stepId, input.status, input.providerRequestId ?? null,
      input.generationTaskId ?? null, input.creditReservationId ?? null,
      input.checkpoint ? JSON.stringify(sanitizeCanvasAgentValue(input.checkpoint)) : null,
      input.outputSummary == null ? null : sanitizeCanvasAgentValue(input.outputSummary),
      input.errorCode == null ? null : sanitizeCanvasAgentValue(input.errorCode), input.now,
      input.fromStatuses?.length ? input.fromStatuses : null,
    ],
  );
  if (!row) throw new CanvasAgentStateConflictError();
  await appendCanvasAgentEvent(db, {
    taskId: row.task_id,
    eventType: `step.${input.status}`,
    event: { stepId: row.id, errorCode: input.errorCode ?? null },
    now: input.now,
  });
  return stepFromRow(row);
}

export async function transitionCanvasAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    from: CanvasAgentTaskStatus[];
    to: CanvasAgentTaskStatus;
    failureCode?: string | null;
    eventType?: string;
    event?: Record<string, unknown>;
    wakeup?: boolean;
    now: Date;
  },
) {
  const row = await queryOne<AgentTaskRow>(
    db,
    `
      UPDATE canvas_agent_tasks
      SET status = $2, failure_code = $3,
          lease_owner = CASE WHEN $2 = 'running' THEN lease_owner ELSE NULL END,
          lease_expires_at = CASE WHEN $2 = 'running' THEN lease_expires_at ELSE NULL END,
          heartbeat_at = CASE WHEN $2 = 'running' THEN heartbeat_at ELSE NULL END,
          completed_at = CASE WHEN $2 IN ('succeeded','failed','canceled') THEN $5 ELSE completed_at END,
          updated_at = $5
      WHERE id = $1 AND status = ANY($4::text[])
      RETURNING *
    `,
    [
      input.taskId, input.to,
      input.failureCode == null ? null : sanitizeCanvasAgentValue(input.failureCode),
      input.from, input.now,
    ],
  );
  if (!row) throw new CanvasAgentStateConflictError();
  await appendCanvasAgentEvent(db, {
    taskId: input.taskId,
    eventType: input.eventType ?? `task.${input.to}`,
    event: input.event ?? { status: input.to, failureCode: input.failureCode ?? null },
    now: input.now,
  });
  if (input.wakeup) {
    await enqueueCanvasAgentWakeup(db, {
      taskId: input.taskId,
      reason: input.eventType ?? input.to,
      eventKey: `canvas-agent:${input.taskId}:${input.eventType ?? input.to}:${Date.now()}`,
      now: input.now,
    });
  }
  return taskFromRow(row);
}

export async function pauseCanvasAgentTask(db: SqlDatabase, input: { taskId: string; now: Date }) {
  return transitionCanvasAgentTask(db, {
    taskId: input.taskId,
    from: ["queued", "running", "waiting_external"],
    to: "paused",
    eventType: "task.paused",
    now: input.now,
  });
}

export async function resumeCanvasAgentTask(db: SqlDatabase, input: { taskId: string; now: Date }) {
  const task = await transitionCanvasAgentTask(db, {
    taskId: input.taskId,
    from: ["paused", "waiting_approval", "waiting_external"],
    to: "queued",
    eventType: "task.resumed",
    wakeup: true,
    now: input.now,
  });
  await db.query(
    `
      UPDATE tasks
      SET status='queued', current_attempt_id=NULL, locked_by=NULL,
          locked_until=NULL, heartbeat_at=NULL, updated_at=$2
      WHERE id=$1
    `,
    [task.workflowTaskId, input.now],
  );
  return task;
}

export async function stopCanvasAgentTask(db: SqlDatabase, input: { taskId: string; now: Date }) {
  return transitionCanvasAgentTask(db, {
    taskId: input.taskId,
    from: ["queued", "running", "waiting_approval", "waiting_external", "paused"],
    to: "cancel_requested",
    eventType: "task.stop_requested",
    wakeup: true,
    now: input.now,
  });
}

export async function replanCanvasAgentTask(db: SqlDatabase, input: { taskId: string; reason?: string; now: Date }) {
  await appendCanvasAgentEvent(db, {
    taskId: input.taskId,
    eventType: "task.replanned",
    event: { reason: input.reason ?? "user_requested" },
    now: input.now,
  });
  await enqueueCanvasAgentWakeup(db, {
    taskId: input.taskId,
    reason: "replan",
    eventKey: `canvas-agent:${input.taskId}:replan:${input.now.getTime()}`,
    now: input.now,
  });
  return findCanvasAgentTask(db, input.taskId);
}

export async function skipCanvasAgentStep(
  db: SqlDatabase,
  input: {
    taskId: string;
    stepId?: string | null;
    actor: CanvasAgentActor;
    reason?: string | null;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const row = await queryOne<AgentStepRow & { task_status: CanvasAgentTaskStatus; current_step_id: string | null }>(db, `
      SELECT step.*, task.status AS task_status, task.current_step_id
      FROM canvas_agent_tasks task
      JOIN canvas_agent_steps step ON step.task_id=task.id
      WHERE task.id=$1 AND step.id=COALESCE($2::uuid,task.current_step_id)
      FOR UPDATE OF task,step
    `, [input.taskId, input.stepId ?? null]);
    if (!row) throw new CanvasAgentStepSkipError("canvas_agent_step_not_found");
    if (row.status === "running" || row.status === "waiting_external") {
      throw new CanvasAgentStepSkipError("canvas_agent_step_skip_unsafe_running");
    }
    const allowed = (row.status === "waiting_approval" && row.task_status === "waiting_approval")
      || (row.status === "created" && ["queued", "paused"].includes(row.task_status));
    if (!allowed) throw new CanvasAgentStepSkipError("canvas_agent_step_skip_state_conflict");

    if (row.approval_id) {
      await db.query(`
        UPDATE canvas_agent_approvals
        SET status=CASE WHEN status='pending' THEN 'rejected' ELSE status END,
            decided_by_user_id=CASE WHEN status='pending' THEN $3 ELSE decided_by_user_id END,
            decided_by_team_member_id=CASE WHEN status='pending' THEN $4 ELSE decided_by_team_member_id END,
            decision_reason=CASE WHEN status='pending' THEN $5 ELSE decision_reason END,
            decided_at=CASE WHEN status='pending' THEN $6 ELSE decided_at END,
            updated_at=$6
        WHERE id=$1 AND task_id=$2
      `, [row.approval_id, input.taskId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null, input.reason ?? "user_skipped", input.now]);
    }
    const step = await queryOne<AgentStepRow>(db, `
      UPDATE canvas_agent_steps
      SET status='skipped',output_summary=$3,error_code='user_skipped',completed_at=$4,updated_at=$4
      WHERE id=$1 AND task_id=$2 AND status IN ('created','waiting_approval')
      RETURNING *
    `, [row.id, input.taskId, sanitizeCanvasAgentValue(input.reason ?? "user_skipped"), input.now]);
    if (!step) throw new CanvasAgentStepSkipError("canvas_agent_step_skip_state_conflict");

    const shouldWake = row.task_status !== "paused";
    if (shouldWake) {
      await db.query(`
        UPDATE canvas_agent_tasks
        SET status='queued',lease_owner=NULL,lease_expires_at=NULL,heartbeat_at=NULL,updated_at=$2
        WHERE id=$1 AND status IN ('queued','waiting_approval')
      `, [input.taskId, input.now]);
      await db.query(`
        UPDATE tasks
        SET status='queued',current_attempt_id=NULL,locked_by=NULL,locked_until=NULL,heartbeat_at=NULL,updated_at=$2
        WHERE id=(SELECT workflow_task_id FROM canvas_agent_tasks WHERE id=$1)
      `, [input.taskId, input.now]);
    }
    await appendCanvasAgentEvent(db, {
      taskId: input.taskId,
      eventType: "step.skipped",
      event: { stepId: row.id, reason: input.reason ?? "user_skipped" },
      now: input.now,
    });
    if (shouldWake) {
      await enqueueCanvasAgentWakeup(db, {
        taskId: input.taskId,
        reason: "step_skipped",
        eventKey: `canvas-agent:${input.taskId}:step-skipped:${row.id}`,
        now: input.now,
      });
    }
    await db.query("COMMIT");
    return stepFromRow(step);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function interjectCanvasAgentTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    content: Record<string, unknown>;
    now: Date;
  },
) {
  const message = await appendCanvasAgentMessage(db, {
    conversationId: input.conversationId,
    taskId: input.taskId,
    role: "user",
    content: input.content,
    actor: input.actor,
    now: input.now,
  });
  await incrementCanvasAgentMetrics(db, {
    taskId: input.taskId,
    increments: { interjectionCount: 1 },
    now: input.now,
  });
  await appendCanvasAgentEvent(db, {
    taskId: input.taskId,
    eventType: "task.interjected",
    event: { messageId: message?.id ?? null },
    now: input.now,
  });
  await enqueueCanvasAgentWakeup(db, {
    taskId: input.taskId,
    reason: "interjection",
    eventKey: `canvas-agent:${input.taskId}:interjection:${message?.id ?? input.now.getTime()}`,
    now: input.now,
  });
  return message;
}

export async function requestCanvasAgentApproval(
  db: SqlDatabase,
  input: {
    taskId: string;
    stepId: string;
    actor: CanvasAgentActor;
    effect: CanvasAgentToolEffect;
    reason: string;
    expiresAt?: Date | null;
    now: Date;
  },
) {
  const approvalId = randomUUID();
  await db.query("BEGIN");
  try {
    const approval = await queryOne<{ id: string }>(
      db,
      `
        INSERT INTO canvas_agent_approvals (
          id, task_id, step_id, effect, reason, requested_by_user_id,
          requested_by_team_member_id, expires_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
        ON CONFLICT (step_id) DO UPDATE SET updated_at = EXCLUDED.updated_at
        RETURNING id
      `,
      [
        approvalId, input.taskId, input.stepId, input.effect, input.reason,
        input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null,
        input.expiresAt ?? null, input.now,
      ],
    );
    await db.query(
      "UPDATE canvas_agent_steps SET status='waiting_approval', approval_id=$2, updated_at=$3 WHERE id=$1 AND task_id=$4",
      [input.stepId, approval!.id, input.now, input.taskId],
    );
    await db.query(
      "UPDATE canvas_agent_tasks SET status='waiting_approval', lease_owner=NULL, lease_expires_at=NULL, heartbeat_at=NULL, updated_at=$2 WHERE id=$1",
      [input.taskId, input.now],
    );
    await db.query(
      `
        UPDATE tasks
        SET status='queued', current_attempt_id=NULL, locked_by=NULL,
            locked_until=NULL, heartbeat_at=NULL, updated_at=$2
        WHERE id=(SELECT workflow_task_id FROM canvas_agent_tasks WHERE id=$1)
      `,
      [input.taskId, input.now],
    );
    await appendCanvasAgentEvent(db, {
      taskId: input.taskId,
      eventType: "approval.requested",
      event: { approvalId: approval!.id, stepId: input.stepId, effect: input.effect, reason: input.reason },
      now: input.now,
    });
    await incrementCanvasAgentMetrics(db, {
      taskId: input.taskId,
      increments: { approvalRequestCount: 1 },
      now: input.now,
    });
    await db.query("COMMIT");
    return { id: approval!.id };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function decideCanvasAgentApproval(
  db: SqlDatabase,
  input: {
    taskId: string;
    approvalId: string;
    actor: CanvasAgentActor;
    decision: "approved" | "rejected";
    reason?: string | null;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const row = await queryOne<{ step_id: string }>(
      db,
      `
        UPDATE canvas_agent_approvals
        SET status=$3, decided_by_user_id=$4, decided_by_team_member_id=$5,
            decision_reason=$6, decided_at=$7, updated_at=$7
        WHERE id=$1 AND task_id=$2 AND status='pending'
          AND (expires_at IS NULL OR expires_at > $7)
        RETURNING step_id
      `,
      [
        input.approvalId, input.taskId, input.decision, input.actor.ownerUserId,
        input.actor.actorTeamMemberId ?? null, input.reason ?? null, input.now,
      ],
    );
    if (!row) throw new CanvasAgentStateConflictError();
    await db.query(
      "UPDATE canvas_agent_steps SET status=$2, updated_at=$3 WHERE id=$1",
      [row.step_id, input.decision === "approved" ? "created" : "canceled", input.now],
    );
    await db.query(
      "UPDATE canvas_agent_tasks SET status=$2, updated_at=$3 WHERE id=$1 AND status='waiting_approval'",
      [input.taskId, input.decision === "approved" ? "queued" : "canceled", input.now],
    );
    if (input.decision === "rejected") {
      await db.query(`
        UPDATE tasks
        SET status='canceled', failure_code='approval_rejected', current_attempt_id=NULL,
            locked_by=NULL, locked_until=NULL, heartbeat_at=NULL, updated_at=$2
        WHERE id=(SELECT workflow_task_id FROM canvas_agent_tasks WHERE id=$1)
          AND status IN ('queued','running','cancel_requested')
      `, [input.taskId, input.now]);
      await db.query(`
        UPDATE workflows
        SET status='canceled', failure_code='approval_rejected',
            finished_at=COALESCE(finished_at,$2), updated_at=$2
        WHERE id=(SELECT workflow_id FROM canvas_agent_tasks WHERE id=$1)
          AND status IN ('queued','running','cancel_requested')
      `, [input.taskId, input.now]);
    }
    await appendCanvasAgentEvent(db, {
      taskId: input.taskId,
      eventType: `approval.${input.decision}`,
      event: { approvalId: input.approvalId, stepId: row.step_id, reason: input.reason ?? null },
      now: input.now,
    });
    if (input.decision === "approved") {
      await enqueueCanvasAgentWakeup(db, {
        taskId: input.taskId,
        reason: "approval_granted",
        eventKey: `canvas-agent:${input.taskId}:approval:${input.approvalId}`,
        now: input.now,
      });
    }
    await db.query("COMMIT");
    return { stepId: row.step_id, status: input.decision };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function appendCanvasAgentEvent(
  db: SqlDatabase,
  input: { taskId: string; eventType: string; event: Record<string, unknown>; now: Date },
): Promise<CanvasAgentEventRecord> {
  const sequence = await queryOne<{ event_sequence: number | string }>(
    db,
    `UPDATE canvas_agent_tasks SET event_sequence=event_sequence+1, updated_at=$2 WHERE id=$1 RETURNING event_sequence`,
    [input.taskId, input.now],
  );
  if (!sequence) throw new CanvasAgentStateConflictError();
  const row = await queryOne<AgentEventRow>(
    db,
    `
      INSERT INTO canvas_agent_events (id, task_id, sequence, event_type, event_json, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      RETURNING *
    `,
    [
      randomUUID(), input.taskId, sequence.event_sequence, input.eventType,
      JSON.stringify(sanitizeCanvasAgentValue(input.event)), input.now,
    ],
  );
  return eventFromRow(row!);
}

export async function listCanvasAgentEvents(
  db: SqlDatabase,
  input: { taskId: string; afterSequence?: number; limit?: number },
) {
  const result = await db.query<AgentEventRow>(
    `
      SELECT * FROM canvas_agent_events
      WHERE task_id=$1 AND sequence > $2
      ORDER BY sequence ASC LIMIT $3
    `,
    [input.taskId, input.afterSequence ?? 0, Math.min(Math.max(input.limit ?? 200, 1), 1000)],
  );
  return result.rows.map(eventFromRow);
}

export async function listCanvasAgentEventsForActor(
  db: SqlDatabase,
  input: {
    taskId: string;
    canvasId: string;
    actor: CanvasAgentActor;
    afterSequence?: number;
    limit?: number;
  },
) {
  const task = await findCanvasAgentTaskForActor(db, input);
  if (!task) throw new Error("canvas_agent_task_not_found");
  return listCanvasAgentEvents(db, input);
}

export async function appendCanvasAgentMessage(
  db: SqlDatabase,
  input: {
    conversationId: string;
    taskId?: string | null;
    role: "system" | "user" | "assistant" | "tool";
    content: Record<string, unknown>;
    actor?: CanvasAgentActor;
    now: Date;
  },
) {
  return queryOne<{ id: string; sequence: number | string }>(
    db,
    `
      INSERT INTO canvas_agent_messages (
        id, conversation_id, task_id, sequence, role, content_json,
        created_by_user_id, actor_team_member_id, created_at
      )
      SELECT $1,$2,$3,next_sequence.sequence,$4,$5::jsonb,$6,$7,$8
      FROM (
        SELECT COALESCE(MAX(messages.sequence),0)+1 AS sequence
        FROM canvas_agent_messages messages
        JOIN (
          SELECT id FROM canvas_agent_conversations WHERE id=$2 FOR UPDATE
        ) locked ON locked.id=$2
        WHERE messages.conversation_id=$2
      ) next_sequence
      RETURNING id, sequence
    `,
    [
      randomUUID(), input.conversationId, input.taskId ?? null, input.role,
      JSON.stringify(sanitizeCanvasAgentValue(input.content)), input.actor?.ownerUserId ?? null,
      input.actor?.actorTeamMemberId ?? null, input.now,
    ],
  );
}

export async function listCanvasAgentMessages(
  db: SqlDatabase,
  input: {
    canvasId: string;
    conversationId: string;
    actor: CanvasAgentActor;
    limit?: number;
  },
) {
  const requestedLimit = Number(input.limit ?? 200);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(500, Math.trunc(requestedLimit)))
    : 200;
  const conversation = await queryOne<{ id: string }>(
    db,
    `
      SELECT id FROM canvas_agent_conversations
      WHERE id = $1 AND canvas_id = $2 AND owner_user_id = $3
        AND actor_team_member_id IS NOT DISTINCT FROM $4
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [input.conversationId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
  );
  if (!conversation) throw new Error("canvas_agent_conversation_not_found");
  const result = await db.query<{
    id: string;
    task_id: string | null;
    sequence: number | string;
    role: "system" | "user" | "assistant" | "tool";
    content_json: Record<string, unknown>;
    created_at: Date | string;
  }>(
    `
      SELECT messages.id, messages.task_id, messages.sequence, messages.role,
             CASE
               WHEN messages.role = 'tool' AND messages.content_json->>'toolId' = 'canvas.read'
                 THEN jsonb_set(
                   messages.content_json,
                   '{output}',
                   COALESCE(messages.content_json->'output', '{}'::jsonb) - 'document'
                 )
               ELSE messages.content_json
             END AS content_json,
             messages.created_at
      FROM canvas_agent_messages messages
      WHERE messages.conversation_id = $1
      ORDER BY messages.sequence DESC
      LIMIT $2
    `,
    [input.conversationId, limit],
  );
  return result.rows.reverse().map((row) => ({
    id: row.id,
    taskId: row.task_id,
    sequence: Number(row.sequence),
    role: row.role,
    content: sanitizeCanvasAgentValue(row.content_json ?? {}),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function findCanvasAgentTask(db: SqlDatabase, taskId: string) {
  const row = await queryOne<AgentTaskRow>(db, "SELECT * FROM canvas_agent_tasks WHERE id=$1", [taskId]);
  return row ? taskFromRow(row) : undefined;
}

export async function findCanvasAgentTaskForActor(
  db: SqlDatabase,
  input: { taskId: string; canvasId: string; actor: CanvasAgentActor },
) {
  const row = await queryOne<AgentTaskRow>(
    db,
    `
      SELECT * FROM canvas_agent_tasks
      WHERE id=$1 AND canvas_id=$2 AND owner_user_id=$3
        AND ($4::uuid IS NULL OR actor_team_member_id IS NOT DISTINCT FROM $4)
    `,
    [input.taskId, input.canvasId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
  );
  return row ? taskFromRow(row) : undefined;
}

export async function findCanvasAgentStep(db: SqlDatabase, stepId: string) {
  const row = await queryOne<AgentStepRow>(db, "SELECT * FROM canvas_agent_steps WHERE id=$1", [stepId]);
  return row ? stepFromRow(row) : undefined;
}

export async function enqueueCanvasAgentWakeup(
  db: SqlDatabase,
  input: { taskId: string; reason: string; eventKey: string; now: Date },
) {
  await db.query(
    `
      INSERT INTO canvas_agent_outbox (id, task_id, event_key, payload_json, created_at, updated_at)
      VALUES ($1,$2,$3,$4::jsonb,$5,$5)
      ON CONFLICT (event_key) DO NOTHING
    `,
    [randomUUID(), input.taskId, input.eventKey, JSON.stringify({ taskId: input.taskId, reason: input.reason }), input.now],
  );
}

export function fingerprintJson(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function metricDelta(value: number | undefined) {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}

function taskFromRow(row: AgentTaskRow): CanvasAgentTaskRecord {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    conversationId: row.conversation_id,
    workflowId: row.workflow_id,
    workflowTaskId: row.workflow_task_id,
    ownerUserId: row.owner_user_id,
    actorTeamMemberId: row.actor_team_member_id,
    mode: row.mode,
    status: row.status,
    modelCode: row.model_code,
    modelConfigSnapshot: sanitizeCanvasAgentValue(row.model_config_snapshot_json ?? {}),
    budget: row.budget_json ?? {},
    metrics: row.metrics_json ?? {},
    currentStepId: row.current_step_id,
    baseRevision: Number(row.base_revision),
    eventSequence: Number(row.event_sequence),
    failureCode: row.failure_code == null ? null : sanitizeCanvasAgentValue(row.failure_code),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function serializeCanvasAgentConversation(row: {
  id: string;
  canvas_id: string;
  owner_user_id: string;
  actor_team_member_id: string | null;
  title: string;
  status: "active" | "archived";
  pinned?: boolean;
  task_id?: string | null;
  task_status?: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}) {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    ownerUserId: row.owner_user_id,
    actorTeamMemberId: row.actor_team_member_id,
    title: row.title,
    status: row.status,
    pinned: Boolean(row.pinned),
    taskId: row.task_id ?? null,
    taskStatus: row.task_status ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function stepFromRow(row: AgentStepRow): CanvasAgentStepRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    stepNo: Number(row.step_no),
    kind: row.kind,
    status: row.status,
    toolId: row.tool_id,
    callId: row.call_id,
    input: sanitizeCanvasAgentValue(row.input_json),
    inputFingerprint: row.input_fingerprint,
    effect: row.effect,
    approvalId: row.approval_id,
    providerRequestId: row.provider_request_id,
    generationTaskId: row.generation_task_id,
    creditReservationId: row.credit_reservation_id,
    checkpoint: sanitizeCanvasAgentValue(row.checkpoint_json ?? {}),
    outputSummary: row.output_summary == null ? null : sanitizeCanvasAgentValue(row.output_summary),
    errorCode: row.error_code == null ? null : sanitizeCanvasAgentValue(row.error_code),
  };
}

function eventFromRow(row: AgentEventRow): CanvasAgentEventRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    sequence: Number(row.sequence),
    eventType: row.event_type,
    event: sanitizeCanvasAgentValue(row.event_json ?? {}),
    createdAt: new Date(row.created_at),
  };
}
