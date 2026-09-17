import { randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { agentExecutionMetadata } from "../shared/db/agent-execution-scope.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  createWorkflowWithTasks,
} from "../workflow-task/workflow-task.service.ts";
import {
  productionAgentTaskType,
  productionAgentType,
  productionAgentWorkflowType,
} from "./production-agent.types.ts";
import type {
  ProductionAgentConversationRecord,
  ProductionAgentSessionActor,
  ProductionAgentSessionEventRecord,
  ProductionAgentSessionMessageRecord,
  ProductionAgentSessionMode,
  ProductionAgentSessionTaskRecord,
  ProductionAgentSessionTaskStatus,
  ProductionAgentSkillCatalogItem,
  ProductionAgentWorkspace,
} from "./production-agent-session.types.ts";

interface ConversationRow {
  id: string;
  owner_user_id: string;
  actor_team_member_id: string | null;
  title: string;
  status: "active" | "archived";
  mode: ProductionAgentSessionMode;
  model_code: string;
  source_json: Record<string, unknown>;
  skill_catalog_json: ProductionAgentSkillCatalogItem[] | unknown;
  workspace_json: ProductionAgentWorkspace | Record<string, unknown>;
  created_project_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  task_id?: string | null;
  task_status?: ProductionAgentSessionTaskStatus | null;
}

interface TaskRow {
  id: string;
  conversation_id: string;
  workflow_id: string;
  workflow_task_id: string;
  owner_user_id: string;
  actor_team_member_id: string | null;
  mode: ProductionAgentSessionMode;
  status: ProductionAgentSessionTaskStatus;
  model_code: string;
  model_config_snapshot_json: Record<string, unknown>;
  current_step_id: string | null;
  event_sequence: number | string;
  failure_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface EventRow {
  id: string;
  task_id: string;
  sequence: number | string;
  event_type: string;
  event_json: Record<string, unknown>;
  created_at: Date | string;
}

export async function createProductionAgentConversation(
  db: SqlDatabase,
  input: {
    actor: ProductionAgentSessionActor;
    title?: string;
    mode: ProductionAgentSessionMode;
    modelCode: string;
    source: Record<string, unknown>;
    skillCatalog: ProductionAgentSkillCatalogItem[];
    now: Date;
  },
) {
  assertProductionCapability(input.actor, capabilities.productionRun);
  const id = randomUUID();
  const row = await queryOne<ConversationRow>(
    db,
    `
      INSERT INTO production_agent_conversations (
        id, owner_user_id, actor_team_member_id, title, status, mode, model_code,
        source_json, skill_catalog_json, workspace_json, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,'active',$5,$6,$7::jsonb,$8::jsonb,'{}'::jsonb,$9,$9)
      RETURNING *
    `,
    [
      id,
      input.actor.ownerUserId,
      input.actor.actorTeamMemberId ?? null,
      input.title?.trim() || "项目制作会话",
      input.mode,
      input.modelCode,
      JSON.stringify(input.source ?? {}),
      JSON.stringify(input.skillCatalog ?? []),
      input.now,
    ],
  );
  return conversationFromRow(row!);
}

export async function getProductionAgentConversation(
  db: SqlDatabase,
  input: { conversationId: string; actor: ProductionAgentSessionActor; includeSourceText?: boolean },
) {
  const row = await queryOne<ConversationRow>(
    db,
    `
      SELECT conversation.*, active_task.id AS task_id, active_task.status AS task_status
      FROM production_agent_conversations conversation
      LEFT JOIN LATERAL (
        SELECT task.id, task.status
        FROM production_agent_tasks task
        WHERE task.conversation_id = conversation.id
        ORDER BY task.updated_at DESC, task.id DESC
        LIMIT 1
      ) active_task ON TRUE
      WHERE conversation.id = $1
        AND conversation.owner_user_id = $2
        AND conversation.actor_team_member_id IS NOT DISTINCT FROM $3
        AND conversation.deleted_at IS NULL
      LIMIT 1
    `,
    [input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
  );
  if (!row) throw new Error("production_agent_conversation_not_found");
  return conversationFromRow(row, { includeSourceText: input.includeSourceText !== false });
}

export async function readProductionAgentSourceSlice(
  db: SqlDatabase,
  input: { conversationId: string; actor: ProductionAgentSessionActor; offset?: number; limit?: number },
) {
  const conversation = await getProductionAgentConversation(db, {
    ...input,
    includeSourceText: true,
  });
  const text = String(conversation.source.text ?? "");
  const offset = Math.max(0, Math.trunc(Number(input.offset ?? 0)));
  const limit = Math.min(20_000, Math.max(1, Math.trunc(Number(input.limit ?? 8_000))));
  return {
    path: String(conversation.source.fileName ?? conversation.source.scriptFileName ?? "source.txt"),
    offset,
    limit,
    totalChars: text.length,
    text: text.slice(offset, offset + limit),
    truncated: offset + limit < text.length,
  };
}

export async function createProductionAgentSessionTask(
  db: SqlDatabase,
  input: {
    conversationId: string;
    actor: ProductionAgentSessionActor;
    mode?: ProductionAgentSessionMode;
    modelCode: string;
    modelConfigSnapshot: Record<string, unknown>;
    userMessage: Record<string, unknown>;
    now: Date;
  },
): Promise<ProductionAgentSessionTaskRecord> {
  assertProductionCapability(input.actor, capabilities.productionRun);
  const agentTaskId = randomUUID();
  await db.query("BEGIN");
  try {
    const conversation = await queryOne<ConversationRow>(
      db,
      `
        SELECT *
        FROM production_agent_conversations
        WHERE id = $1 AND owner_user_id = $2
          AND actor_team_member_id IS NOT DISTINCT FROM $3
          AND status = 'active' AND deleted_at IS NULL
        FOR UPDATE
      `,
      [input.conversationId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
    );
    if (!conversation) throw new Error("production_agent_conversation_not_found");
    const mode = input.mode ?? conversation.mode;
    const workflow = await createWorkflowWithTasks(db, {
      userId: input.actor.ownerUserId,
      projectId: conversation.created_project_id,
      canvasProjectId: null,
      workflowType: productionAgentWorkflowType,
      inputSnapshot: {
        ...agentExecutionMetadata(),
        agentType: productionAgentType,
        scopeType: "session",
        scopeId: input.conversationId,
        conversationId: input.conversationId,
        agentTaskId,
        mode,
        modelCode: input.modelCode,
      },
      tasks: [{
        taskType: productionAgentTaskType,
        queueName: "production-agent-session",
        targetEntityType: "production_agent_session",
        targetEntityId: agentTaskId,
        inputSnapshot: {
          ...agentExecutionMetadata(),
          agentType: productionAgentType,
          scopeType: "session",
          scopeId: input.conversationId,
          conversationId: input.conversationId,
          agentTaskId,
        },
        maxAttempts: 20,
      }],
    });
    const workflowTask = workflow.tasks[0]!;
    const row = await queryOne<TaskRow>(
      db,
      `
        INSERT INTO production_agent_tasks (
          id, conversation_id, workflow_id, workflow_task_id,
          owner_user_id, actor_team_member_id, mode, status, model_code,
          model_config_snapshot_json, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,'queued',$8,$9::jsonb,$10,$10
        )
        RETURNING *
      `,
      [
        agentTaskId,
        input.conversationId,
        workflow.workflow.id,
        workflowTask.id,
        input.actor.ownerUserId,
        input.actor.actorTeamMemberId ?? null,
        mode,
        input.modelCode,
        JSON.stringify(input.modelConfigSnapshot ?? {}),
        input.now,
      ],
    );
    await appendProductionAgentMessage(db, {
      conversationId: input.conversationId,
      taskId: agentTaskId,
      role: "user",
      content: input.userMessage,
      actor: input.actor,
      now: input.now,
    });
    await appendProductionAgentEvent(db, {
      taskId: agentTaskId,
      eventType: "task.created",
      event: { status: "queued", workflowId: workflow.workflow.id, workflowTaskId: workflowTask.id },
      now: input.now,
    });
    await db.query("COMMIT");
    return taskFromRow(row!);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

export async function findProductionAgentSessionTask(db: SqlDatabase, taskId: string) {
  const row = await queryOne<TaskRow>(db, "SELECT * FROM production_agent_tasks WHERE id=$1", [taskId]);
  return row ? taskFromRow(row) : undefined;
}

export async function findProductionAgentSessionTaskForActor(
  db: SqlDatabase,
  input: { taskId: string; actor: ProductionAgentSessionActor },
) {
  const row = await queryOne<TaskRow>(
    db,
    `
      SELECT * FROM production_agent_tasks
      WHERE id=$1 AND owner_user_id=$2
        AND actor_team_member_id IS NOT DISTINCT FROM $3
    `,
    [input.taskId, input.actor.ownerUserId, input.actor.actorTeamMemberId ?? null],
  );
  return row ? taskFromRow(row) : undefined;
}

export async function listQueuedProductionAgentSessionTaskIds(db: SqlDatabase, limit = 20) {
  const result = await db.query<{ id: string }>(
    `
      SELECT id FROM production_agent_tasks
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT $1
    `,
    [Math.max(1, Math.min(100, limit))],
  );
  return result.rows.map((row) => row.id);
}

export async function transitionProductionAgentSessionTask(
  db: SqlDatabase,
  input: {
    taskId: string;
    from: ProductionAgentSessionTaskStatus[];
    to: ProductionAgentSessionTaskStatus;
    failureCode?: string | null;
    event?: Record<string, unknown>;
    now: Date;
  },
) {
  const row = await queryOne<TaskRow>(
    db,
    `
      UPDATE production_agent_tasks
      SET status = $3,
          failure_code = $4,
          completed_at = CASE WHEN $3 IN ('succeeded','failed','canceled') THEN $5 ELSE completed_at END,
          updated_at = $5
      WHERE id = $1 AND status = ANY($2::text[])
      RETURNING *
    `,
    [input.taskId, input.from, input.to, input.failureCode ?? null, input.now],
  );
  if (!row) throw new Error("production_agent_task_transition_conflict");
  if (input.event) {
    await appendProductionAgentEvent(db, {
      taskId: input.taskId,
      eventType: "task.status",
      event: { status: input.to, failureCode: input.failureCode ?? null, ...input.event },
      now: input.now,
    });
  }
  return taskFromRow(row);
}

export async function createProductionAgentStep(
  db: SqlDatabase,
  input: {
    taskId: string;
    kind: string;
    toolId?: string | null;
    callId?: string | null;
    input?: Record<string, unknown>;
    now: Date;
  },
) {
  const row = await queryOne<{ id: string; step_no: number | string }>(
    db,
    `
      INSERT INTO production_agent_steps (
        id, task_id, step_no, kind, status, tool_id, call_id, input_json, created_at, updated_at
      )
      SELECT $1,$2,COALESCE((SELECT MAX(step_no) FROM production_agent_steps WHERE task_id=$2),0)+1,$3,'created',$4,$5,$6::jsonb,$7,$7
      RETURNING id, step_no
    `,
    [
      randomUUID(),
      input.taskId,
      input.kind,
      input.toolId ?? null,
      input.callId ?? null,
      JSON.stringify(input.input ?? {}),
      input.now,
    ],
  );
  await db.query(
    "UPDATE production_agent_tasks SET current_step_id=$2, updated_at=$3 WHERE id=$1",
    [input.taskId, row!.id, input.now],
  );
  return { id: row!.id, stepNo: Number(row!.step_no) };
}

export async function updateProductionAgentStep(
  db: SqlDatabase,
  input: {
    stepId: string;
    status: string;
    output?: Record<string, unknown>;
    errorCode?: string | null;
    now: Date;
  },
) {
  await db.query(
    `
      UPDATE production_agent_steps
      SET status=$2,
          output_json=COALESCE($3::jsonb, output_json),
          error_code=$4,
          completed_at=CASE WHEN $2 IN ('succeeded','failed','canceled') THEN $5 ELSE completed_at END,
          updated_at=$5
      WHERE id=$1
    `,
    [input.stepId, input.status, input.output ? JSON.stringify(input.output) : null, input.errorCode ?? null, input.now],
  );
}

export async function appendProductionAgentEvent(
  db: SqlDatabase,
  input: { taskId: string; eventType: string; event: Record<string, unknown>; now: Date },
) {
  const sequence = await queryOne<{ event_sequence: number | string }>(
    db,
    `
      UPDATE production_agent_tasks
      SET event_sequence = event_sequence + 1, updated_at = $2
      WHERE id = $1
      RETURNING event_sequence
    `,
    [input.taskId, input.now],
  );
  const row = await queryOne<EventRow>(
    db,
    `
      INSERT INTO production_agent_events (id, task_id, sequence, event_type, event_json, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      RETURNING *
    `,
    [
      randomUUID(),
      input.taskId,
      Number(sequence?.event_sequence ?? 1),
      input.eventType,
      JSON.stringify(input.event ?? {}),
      input.now,
    ],
  );
  return eventFromRow(row!);
}

export async function listProductionAgentEvents(
  db: SqlDatabase,
  input: { taskId: string; actor: ProductionAgentSessionActor; afterSequence?: number; limit?: number },
) {
  const task = await findProductionAgentSessionTaskForActor(db, input);
  if (!task) throw new Error("production_agent_task_not_found");
  const result = await db.query<EventRow>(
    `
      SELECT * FROM production_agent_events
      WHERE task_id=$1 AND sequence > $2
      ORDER BY sequence ASC LIMIT $3
    `,
    [input.taskId, input.afterSequence ?? 0, Math.min(Math.max(input.limit ?? 200, 1), 1000)],
  );
  return result.rows.map(eventFromRow);
}

export async function appendProductionAgentMessage(
  db: SqlDatabase,
  input: {
    conversationId: string;
    taskId?: string | null;
    role: "system" | "user" | "assistant" | "tool";
    content: Record<string, unknown>;
    actor?: ProductionAgentSessionActor;
    now: Date;
  },
) {
  return queryOne<{ id: string; sequence: number | string }>(
    db,
    `
      INSERT INTO production_agent_messages (
        id, conversation_id, task_id, sequence, role, content_json, created_by_user_id, created_at
      )
      SELECT $1,$2,$3,COALESCE((SELECT MAX(sequence) FROM production_agent_messages WHERE conversation_id=$2),0)+1,$4,$5::jsonb,$6,$7
      RETURNING id, sequence
    `,
    [
      randomUUID(),
      input.conversationId,
      input.taskId ?? null,
      input.role,
      JSON.stringify(input.content ?? {}),
      input.actor?.ownerUserId ?? null,
      input.now,
    ],
  );
}

export async function listProductionAgentMessages(
  db: SqlDatabase,
  input: { conversationId: string; actor: ProductionAgentSessionActor; limit?: number },
) {
  await getProductionAgentConversation(db, input);
  const limit = Math.max(1, Math.min(500, Math.trunc(Number(input.limit ?? 200))));
  const result = await db.query<{
    id: string;
    task_id: string | null;
    sequence: number | string;
    role: "system" | "user" | "assistant" | "tool";
    content_json: Record<string, unknown>;
    created_at: Date | string;
  }>(
    `
      SELECT id, task_id, sequence, role, content_json, created_at
      FROM production_agent_messages
      WHERE conversation_id=$1
      ORDER BY sequence DESC
      LIMIT $2
    `,
    [input.conversationId, limit],
  );
  return result.rows.reverse().map((row): ProductionAgentSessionMessageRecord => ({
    id: row.id,
    taskId: row.task_id,
    sequence: Number(row.sequence),
    role: row.role,
    content: row.content_json ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function requestProductionAgentApproval(
  db: SqlDatabase,
  input: { taskId: string; stepId: string; toolId: string; reason: string; now: Date },
) {
  const row = await queryOne<{ id: string }>(
    db,
    `
      INSERT INTO production_agent_approvals (id, task_id, step_id, status, tool_id, reason, created_at, updated_at)
      VALUES ($1,$2,$3,'pending',$4,$5,$6,$6)
      RETURNING id
    `,
    [randomUUID(), input.taskId, input.stepId, input.toolId, input.reason, input.now],
  );
  await appendProductionAgentEvent(db, {
    taskId: input.taskId,
    eventType: "approval.requested",
    event: { approvalId: row!.id, stepId: input.stepId, toolId: input.toolId, reason: input.reason },
    now: input.now,
  });
  return row!.id;
}

export async function decideProductionAgentApproval(
  db: SqlDatabase,
  input: {
    taskId: string;
    actor: ProductionAgentSessionActor;
    approvalId: string;
    decision: "approved" | "rejected";
    now: Date;
  },
) {
  assertProductionCapability(input.actor, capabilities.productionRun);
  const task = await findProductionAgentSessionTaskForActor(db, input);
  if (!task) throw new Error("production_agent_task_not_found");
  const updated = await queryOne<{ id: string; step_id: string; tool_id: string }>(
    db,
    `
      UPDATE production_agent_approvals
      SET status=$3, decided_at=$4, updated_at=$4
      WHERE id=$1 AND task_id=$2 AND status='pending'
      RETURNING id, step_id, tool_id
    `,
    [input.approvalId, input.taskId, input.decision, input.now],
  );
  if (!updated) throw new Error("production_agent_approval_not_found");
  await appendProductionAgentEvent(db, {
    taskId: input.taskId,
    eventType: "approval.decided",
    event: { approvalId: updated.id, decision: input.decision, toolId: updated.tool_id, stepId: updated.step_id },
    now: input.now,
  });
  if (input.decision === "rejected") {
    await updateProductionAgentStep(db, {
      stepId: updated.step_id,
      status: "canceled",
      errorCode: "user_rejected",
      now: input.now,
    });
    return transitionProductionAgentSessionTask(db, {
      taskId: input.taskId,
      from: ["waiting_approval", "running"],
      to: "canceled",
      failureCode: "user_rejected",
      event: { approvalId: updated.id },
      now: input.now,
    });
  }
  return transitionProductionAgentSessionTask(db, {
    taskId: input.taskId,
    from: ["waiting_approval"],
    to: "queued",
    event: { approvalId: updated.id, resumed: true },
    now: input.now,
  });
}

export async function stopProductionAgentSessionTask(
  db: SqlDatabase,
  input: { taskId: string; actor: ProductionAgentSessionActor; now: Date },
) {
  assertProductionCapability(input.actor, capabilities.productionRun);
  const task = await findProductionAgentSessionTaskForActor(db, input);
  if (!task) throw new Error("production_agent_task_not_found");
  if (["succeeded", "failed", "canceled"].includes(task.status)) return task;
  await db.query(
    `
      UPDATE production_agent_approvals
      SET status='canceled', updated_at=$2
      WHERE task_id=$1 AND status='pending'
    `,
    [input.taskId, input.now],
  );
  const next = await transitionProductionAgentSessionTask(db, {
    taskId: input.taskId,
    from: ["queued", "running", "waiting_approval", "paused"],
    to: "canceled",
    failureCode: "user_canceled",
    event: { reason: "user_canceled" },
    now: input.now,
  });
  await db.query(
    `
      UPDATE tasks
      SET status = 'canceled',
          failure_code = 'user_canceled',
          locked_by = NULL,
          locked_until = NULL,
          heartbeat_at = NULL,
          updated_at = $2
      WHERE id = $1 AND status IN ('queued','running','waiting_external','paused')
    `,
    [task.workflowTaskId, input.now],
  );
  return next;
}

export async function updateProductionAgentWorkspace(
  db: SqlDatabase,
  input: { conversationId: string; workspace: ProductionAgentWorkspace; now: Date },
) {
  await db.query(
    `
      UPDATE production_agent_conversations
      SET workspace_json=$2::jsonb, updated_at=$3
      WHERE id=$1
    `,
    [input.conversationId, JSON.stringify(input.workspace), input.now],
  );
}

export async function markProductionAgentProjectCreated(
  db: SqlDatabase,
  input: { conversationId: string; projectId: string; now: Date },
) {
  await db.query(
    `
      UPDATE production_agent_conversations
      SET created_project_id=$2, updated_at=$3
      WHERE id=$1
    `,
    [input.conversationId, input.projectId, input.now],
  );
}

function conversationFromRow(
  row: ConversationRow,
  options: { includeSourceText?: boolean } = {},
): ProductionAgentConversationRecord {
  const workspace = (row.workspace_json ?? {}) as ProductionAgentWorkspace;
  const source = { ...(row.source_json ?? {}) };
  const text = String(source.text ?? "");
  if (options.includeSourceText !== true) {
    source.previewText = text.slice(0, 4_000);
    source.totalChars = text.length;
    delete source.text;
  }
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    actorTeamMemberId: row.actor_team_member_id,
    title: row.title,
    status: row.status,
    mode: row.mode,
    modelCode: row.model_code,
    source,
    skillCatalog: Array.isArray(row.skill_catalog_json) ? row.skill_catalog_json as ProductionAgentSkillCatalogItem[] : [],
    workspace: {
      artifacts: workspace.artifacts && typeof workspace.artifacts === "object" ? workspace.artifacts : {},
      projectJson: workspace.projectJson ?? null,
      reshapePending: workspace.reshapePending === true,
    },
    createdProjectId: row.created_project_id,
    taskId: row.task_id ?? null,
    taskStatus: row.task_status ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function taskFromRow(row: TaskRow): ProductionAgentSessionTaskRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    workflowId: row.workflow_id,
    workflowTaskId: row.workflow_task_id,
    ownerUserId: row.owner_user_id,
    actorTeamMemberId: row.actor_team_member_id,
    mode: row.mode,
    status: row.status,
    modelCode: row.model_code,
    modelConfigSnapshot: row.model_config_snapshot_json ?? {},
    currentStepId: row.current_step_id,
    eventSequence: Number(row.event_sequence ?? 0),
    failureCode: row.failure_code,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function eventFromRow(row: EventRow): ProductionAgentSessionEventRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    sequence: Number(row.sequence),
    eventType: row.event_type,
    event: row.event_json ?? {},
    createdAt: new Date(row.created_at),
  };
}

function assertProductionCapability(actor: ProductionAgentSessionActor, capability: string) {
  if (!actor.capabilities.has(capability)) {
    throw new Error("capability_missing");
  }
}
