import { createHash, randomUUID } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { reserveCreditsInTransaction } from "../credit-billing/credit-ledger.service.ts";
import { findActiveAiModelConfigByCode, findActiveAiModelDispatchPolicyByModelCode } from "../model-catalog/ai-model-config.store.ts";
import { resolveGenerationModelExecution } from "../model-catalog/generation-model-execution.resolver.ts";
import { validateGenerationModelRequest } from "../model-catalog/generation-model-request.validator.ts";
import { createGenerationModelConfigSnapshotForTask, createGenerationProviderRouteIdentity } from "../model-gateway/generation-model-config-snapshot.ts";
import { appendGenerationTaskCreatedOutboxEvent } from "../model-gateway/generation-outbox.service.ts";
import { loadGenerationQueueConfig } from "../model-gateway/generation-queue.config.ts";
import { OpenAICompatibleTextAdapter } from "../model-gateway/openai-compatible-text.adapter.ts";
import { TextModelGatewayService } from "../model-gateway/text-model-gateway.service.ts";
import { upsertQueuedGenerationTaskSnapshot } from "../model-gateway/generation-task-snapshot.service.ts";
import {
  CanvasConflictError,
  createCanvasNodeRun,
  findCanvasByCanvasProjectId,
  saveCanvasByCanvasProjectId,
  selectCanvasNodeArtifact,
  type CanvasDocument,
} from "../project/creator-canvas-record.service.ts";
import { listCanvasGenerationHistory } from "../project/canvas-generation-history.service.ts";
import { listCanvasUserConfigs } from "../project/canvas-user-config.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import { createWorkflowWithTasks } from "../workflow-task/workflow-task.service.ts";
import { AdminBackedTextModelResolver } from "./admin-backed-text-model.resolver.ts";
import { CanvasAgentBillingService } from "./canvas-agent-billing.service.ts";
import { CanvasAgentCheckpointService } from "./canvas-agent-checkpoint.service.ts";
import { CanvasAgentContextService } from "./canvas-agent-context.service.ts";
import { CanvasAgentExecutor } from "./canvas-agent-executor.ts";
import { CanvasAgentKnowledgeService } from "./canvas-agent-knowledge.service.ts";
import { CanvasAgentPolicyService } from "./canvas-agent-policy.service.ts";
import { CanvasAgentWebToolService } from "./canvas-agent-web.service.ts";
import { CanvasAgentMcpToolService } from "./canvas-agent-mcp.service.ts";
import { CanvasAgentProviderConfigService } from "./canvas-agent-provider-config.service.ts";
import { CanvasAgentPromptPreferenceService } from "./canvas-agent-prompt-preference.service.ts";
import { createDefaultCanvasAgentToolRegistry } from "./canvas-agent-tool.registry.ts";
import type { CanvasAgentActor, CanvasAgentGenerationIntake } from "./canvas-agent.types.ts";
import { CanvasAgentWorker } from "./canvas-agent.worker.ts";

/**
 * Production composition root for the durable Canvas Agent worker.  It uses
 * the platform text gateway and generation outbox rather than creating an
 * Agent-specific provider, billing, or queue path.
 */
export function createCanvasAgentWorkerRuntime(input: {
  db: SqlDatabase;
  env?: NodeJS.ProcessEnv;
  workerId: string;
  now?: () => Date;
  policy?: ConstructorParameters<typeof CanvasAgentPolicyService>[0];
  webSearchModelCode?: string | null;
  maxRounds?: number;
  maxToolCalls?: number;
}) {
  const env = input.env ?? process.env;
  const now = input.now ?? (() => new Date());
  const actorScope = (canvasId: string, actor: CanvasAgentActor) => ({
    canvasId,
    ownerUserId: actor.ownerUserId,
    principal: actor.actorTeamMemberId ? "team_member" as const : "owner" as const,
    actorTeamMemberId: actor.actorTeamMemberId ?? null,
    principalKey: actor.actorTeamMemberId ? `member:${actor.actorTeamMemberId}` : `owner:${actor.ownerUserId}`,
    capabilities: actor.actorTeamMemberId
      ? [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]
      : [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  });
  const readCanvas = async ({ canvasId, actor }: { canvasId: string; actor: CanvasAgentActor }) => {
    const canvas = await findCanvasByCanvasProjectId(input.db, {
      canvasProjectId: canvasId,
      actorScope: actorScope(canvasId, actor),
    });
    if (!canvas) throw new Error("canvas_agent_canvas_not_found");
    return canvas as unknown as Record<string, unknown>;
  };
  const patchCanvas = async (patch: {
    canvasId: string;
    actor: CanvasAgentActor;
    expectedRevision: number;
    operations: unknown[];
    clientMutationId: string;
  }) => {
    const current = await findCanvasByCanvasProjectId(input.db, {
      canvasProjectId: patch.canvasId,
      actorScope: actorScope(patch.canvasId, patch.actor),
    });
    if (!current) throw new Error("canvas_agent_canvas_not_found");
    const document = applyCanvasPatch(current.document, patch.operations);
    const saved = await saveCanvasByCanvasProjectId(input.db, {
      canvasProjectId: patch.canvasId,
      actorScope: actorScope(patch.canvasId, patch.actor),
      clientRevision: patch.expectedRevision,
      document,
      events: [{ type: "canvas_agent.patch", clientMutationId: patch.clientMutationId }],
      now: now(),
    });
    return { revision: saved.serverRevision, summary: { operationCount: patch.operations.length } };
  };
  const generationIntake = new PlatformGenerationIntake({ db: input.db, env, now });
  const knowledge = new CanvasAgentKnowledgeService(input.db);
  const web = new CanvasAgentWebToolService(input.db, fetch, now, undefined, {
    searchModelCode: input.webSearchModelCode,
  });
  const mcp = new CanvasAgentMcpToolService(input.db);
  const providerConfig = new CanvasAgentProviderConfigService(input.db);
  const promptPreferences = new CanvasAgentPromptPreferenceService(input.db);
  const context = new CanvasAgentContextService({
    db: input.db,
    loadCanvasContext: readCanvas,
    knowledge,
    promptPreferences,
    now,
  });
  const tools = createDefaultCanvasAgentToolRegistry({
    readCanvas,
    patchCanvas,
    generationIntake,
    now,
    context,
    knowledge,
    promptPreferences,
    readHistory: async ({ canvasId, actor, nodeKey, search, limit }) => listCanvasGenerationHistory(input.db, {
      canvasProjectId: canvasId,
      actorScope: actorScope(canvasId, actor),
      nodeKey: nodeKey ?? null,
      search: search ?? null,
      limit,
    }),
    searchAssets: async ({ canvasId, actor, search, limit }) => listCanvasGenerationHistory(input.db, {
      canvasProjectId: canvasId,
      actorScope: actorScope(canvasId, actor),
      search: search ?? null,
      limit,
    }),
    selectArtifact: async ({ canvasId, actor, artifactId, selectionRole }) => ({
      artifact: await selectCanvasNodeArtifact(input.db, {
        canvasProjectId: canvasId,
        artifactId,
        selectionRole,
        actorScope: actorScope(canvasId, actor),
        now: now(),
      }),
    }),
    listPresets: async ({ actor, type, limit }) => ({
      configs: await listCanvasUserConfigs(input.db, {
        userId: actor.ownerUserId,
        type: type === "style" || type === "skill" || type === "toolbar" ? type : undefined,
        includeArchived: false,
        limit,
      }),
    }),
    webExtract: (request) => web.extract(request),
    webSearch: input.webSearchModelCode ? (request) => web.search(request) : undefined,
    webSearchProviderId: input.webSearchModelCode ?? undefined,
    mcpCall: (request) => mcp.call(request),
    createProviderConfigDraft: (request) => providerConfig.createDraft({ ...request, now: now() }),
    applyProviderConfigDraft: (request) => providerConfig.applyDraft({ ...request, now: now() }),
    now,
  });
  const checkpoint = new CanvasAgentCheckpointService({
    db: input.db,
    canvas: {
      async readRevision({ canvasId, actor }) {
        const canvas = await findCanvasByCanvasProjectId(input.db, {
          canvasProjectId: canvasId,
          actorScope: actorScope(canvasId, actor),
        });
        if (!canvas) throw new Error("canvas_agent_canvas_not_found");
        return canvas.serverRevision;
      },
      async restoreRevision({ canvasId, actor, checkpointRevision, expectedRevision, reason }) {
        const revision = await input.db.query<{ document_json: CanvasDocument }>(
          "SELECT document_json FROM creator_canvas_revisions WHERE canvas_project_id=$1 AND server_revision=$2 LIMIT 1",
          [canvasId, checkpointRevision],
        );
        if (!revision.rows[0]) throw new Error("canvas_agent_checkpoint_not_found");
        const saved = await saveCanvasByCanvasProjectId(input.db, {
          canvasProjectId: canvasId,
          actorScope: actorScope(canvasId, actor),
          clientRevision: expectedRevision,
          document: revision.rows[0].document_json,
          events: [{ type: "canvas_agent.rewind", reason }],
          now: now(),
        });
        return { revision: saved.serverRevision };
      },
    },
  });
  const textGateway = new TextModelGatewayService({
    db: input.db,
    adapter: new OpenAICompatibleTextAdapter(),
    resolver: new AdminBackedTextModelResolver(input.db),
    env,
    now,
  });
  const executor = new CanvasAgentExecutor({
    db: input.db,
    textGateway,
    context,
    policy: new CanvasAgentPolicyService(input.policy),
    tools,
    billing: new CanvasAgentBillingService(input.db),
    checkpoint,
    knowledge,
    resolveActor: (task) => resolveRuntimeActor(input.db, {
      canvasId: task.canvasId,
      ownerUserId: task.ownerUserId,
      actorTeamMemberId: task.actorTeamMemberId,
    }),
    now,
    maxRounds: input.maxRounds,
    maxToolCalls: input.maxToolCalls,
  });
  return {
    executor,
    worker: new CanvasAgentWorker({ db: input.db, executor, workerId: input.workerId, now }),
  };
}

async function resolveRuntimeActor(
  db: SqlDatabase,
  input: { canvasId: string; ownerUserId: string; actorTeamMemberId: string | null },
): Promise<CanvasAgentActor> {
  if (!input.actorTeamMemberId) {
    const canvas = await queryOne<{ id: string }>(db,
      `SELECT canvas.id
       FROM creator_canvas_projects canvas
       JOIN users owner ON owner.id=canvas.created_by_user_id AND owner.status='active'
       WHERE canvas.id=$1 AND canvas.created_by_user_id=$2 AND canvas.deleted_at IS NULL
       LIMIT 1`,
      [input.canvasId, input.ownerUserId]);
    if (!canvas) throw new Error("canvas_agent_actor_access_revoked");
    return {
      ownerUserId: input.ownerUserId,
      actorTeamMemberId: null,
      capabilities: new Set([capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage]),
    };
  }
  const assignment = await queryOne<{ id: string }>(db, `
    SELECT member.id
    FROM team_members member
    JOIN users owner
      ON owner.id=member.user_id AND owner.status='active'
    JOIN team_member_canvases assignment
      ON assignment.member_id=member.id AND assignment.user_id=member.user_id
    JOIN creator_canvas_projects canvas
      ON canvas.id=assignment.canvas_id AND canvas.created_by_user_id=member.user_id
    WHERE member.id=$1 AND member.user_id=$2 AND member.status='active'
      AND member.deleted_at IS NULL AND canvas.id=$3 AND canvas.deleted_at IS NULL
    LIMIT 1
  `, [input.actorTeamMemberId, input.ownerUserId, input.canvasId]);
  if (!assignment) throw new Error("canvas_agent_actor_access_revoked");
  return {
    ownerUserId: input.ownerUserId,
    actorTeamMemberId: input.actorTeamMemberId,
    capabilities: new Set([capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]),
  };
}

class PlatformGenerationIntake implements CanvasAgentGenerationIntake {
  constructor(private readonly deps: { db: SqlDatabase; env: NodeJS.ProcessEnv; now: () => Date }) {}

  async create(input: Parameters<CanvasAgentGenerationIntake["create"]>[0]) {
    const existing = await queryOne<{
      id: string;
      workflow_id: string;
      input_snapshot_json: Record<string, unknown> | string;
    }>(this.deps.db,
      "SELECT id, workflow_id, input_snapshot_json FROM tasks WHERE idempotency_key=$1 ORDER BY created_at ASC LIMIT 1", [input.idempotencyKey]);
    if (existing) {
      const existingSnapshot = readRecord(existing.input_snapshot_json);
      const existingNodeKey = readString(existingSnapshot.targetId);
      if (existingNodeKey && existingNodeKey !== input.canvasId) {
        await upsertCanvasAgentGenerationNode(this.deps.db, {
          ...input,
          kind: readGenerationKind(existingSnapshot.kind, input.kind),
          taskId: existing.id,
          nodeKey: existingNodeKey,
          modelCode: readString(existingSnapshot.model),
          prompt: readString(existingSnapshot.prompt ?? existingSnapshot.text),
          now: this.deps.now(),
        });
      }
      return { generationTaskId: existing.id, workflowId: existing.workflow_id };
    }

    const modelCode = readString(input.request.model ?? input.request.modelCode);
    if (!modelCode) throw new Error("canvas_agent_generation_model_required");
    const model = await findActiveAiModelConfigByCode(this.deps.db, modelCode);
    const policy = await findActiveAiModelDispatchPolicyByModelCode(this.deps.db, modelCode);
    const queueConfig = loadGenerationQueueConfig(this.deps.env);
    const fallbackQueue = input.kind === "video" ? queueConfig.queues.submitVideo : queueConfig.queues.submitImage;
    const rawParameters = asRecord(input.request.parameters);
    const execution = resolveGenerationModelExecution({
      kind: input.kind,
      modelCode,
      modelConfig: model,
      dispatchPolicy: policy,
      parameters: rawParameters,
      fallbackQueueName: fallbackQueue,
    });
    if (!model) throw new Error("canvas_agent_generation_model_not_configured");
    const executionParameters = execution.parameters;
    const prompt = readString(input.request.prompt ?? input.request.text ?? input.request.motionPrompt);
    validateGenerationModelRequest({ kind: input.kind, modelCode, modelConfig: model, parameters: executionParameters, prompt });
    if (!queueConfig.outboxDispatcherEnabled || !queueConfig.workersEnabled) {
      throw new Error("canvas_agent_generation_queue_unavailable");
    }
    const now = this.deps.now();
    const membership = await queryOne<{ id: string }>(this.deps.db, `
      SELECT id FROM user_memberships
      WHERE user_id=$1 AND status='active'
        AND membership_tier IN ('experience','professional')
        AND expires_at>$2
      LIMIT 1
    `, [input.ownerUserId, now]);
    if (!membership) throw new Error("membership_required");
    const estimatedCredits = generationCredits(model.pricing, { ...model.defaultParams, ...executionParameters }, input.kind);
    const snapshot = await createGenerationModelConfigSnapshotForTask(this.deps.db, model);
    const generationTaskId = randomUUID();
    const { nodeKey, scopeTargetId } = resolveCanvasAgentGenerationTargets(input);
    await upsertCanvasAgentGenerationNode(this.deps.db, {
      ...input,
      taskId: generationTaskId,
      nodeKey,
      modelCode,
      prompt,
      now,
    });
    await this.deps.db.query("BEGIN");
    try {
      const duplicate = await queryOne<{ id: string; workflow_id: string }>(this.deps.db,
        "SELECT id, workflow_id FROM tasks WHERE idempotency_key=$1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE", [input.idempotencyKey]);
      if (duplicate) {
        await this.deps.db.query("COMMIT");
        return { generationTaskId: duplicate.id, workflowId: duplicate.workflow_id };
      }
      const requestSnapshot = {
        kind: input.kind,
        canvasProjectId: input.canvasId,
        targetType: "canvas",
        targetId: nodeKey,
        canvasNodeId: nodeKey,
        prompt,
        text: input.kind === "audio" ? prompt : undefined,
        model: modelCode,
        parameters: executionParameters,
        sourceSurface: "canvas_agent",
        agentTaskId: input.agentTaskId,
        agentStepId: input.agentStepId,
        teamMemberId: input.actorTeamMemberId,
      };
      const workflow = await createWorkflowWithTasks(this.deps.db, {
        userId: input.ownerUserId,
        projectId: null,
        canvasProjectId: input.canvasId,
        workflowType: input.kind === "image"
          ? "episode.image.generate"
          : input.kind === "video"
            ? "episode.video.generate"
            : "canvas.audio.generate",
        inputSnapshot: { ...requestSnapshot, modelConfigSnapshot: snapshot, providerExecutor: execution.providerExecutor },
        tasks: [{
          id: generationTaskId,
          taskType: input.kind === "image"
            ? "episode_generate_image"
            : input.kind === "video"
              ? "episode_generate_video"
              : "episode_generate_audio",
          queueName: execution.queueName,
          targetEntityType: "canvas",
          targetEntityId: input.canvasId,
          inputSnapshot: { ...requestSnapshot, cost: estimatedCredits, modelConfigSnapshot: snapshot, providerExecutor: execution.providerExecutor },
        }],
      });
      const task = workflow.tasks[0]!;
      await this.deps.db.query("UPDATE workflows SET idempotency_key=$2 WHERE id=$1", [workflow.workflow.id, input.idempotencyKey]);
      await this.deps.db.query("UPDATE tasks SET idempotency_key=$2 WHERE id=$1", [task.id, input.idempotencyKey]);
      await createCanvasNodeRun(this.deps.db, {
        canvasProjectId: input.canvasId,
        nodeKey,
        idempotencyKey: input.idempotencyKey,
        status: "queued",
        mediaKind: input.kind,
        modelCode,
        targetType: "canvas",
        targetId: nodeKey,
        inputSnapshot: requestSnapshot,
        taskId: task.id,
        actorScope: canvasAgentGenerationActorScope(input),
        now,
      });
      let creditReservationId: string | null = null;
      if (input.actorTeamMemberId) {
        const member = await queryOne<{ member_credits: number | string }>(this.deps.db,
          "UPDATE team_members SET member_credits=member_credits-$2, updated_at=$3 WHERE id=$1 AND user_id=$4 AND status='active' AND deleted_at IS NULL AND member_credits >= $2 RETURNING member_credits",
          [input.actorTeamMemberId, estimatedCredits, now, input.ownerUserId]);
        if (!member) throw new Error("insufficient_credits");
        await this.deps.db.query(
          "INSERT INTO credit_ledger_entries (id,user_id,team_member_id,entry_type,amount,available_delta,reserved_delta,consumed_delta,balance_after,source_type,source_id,reason,metadata_json,created_by_user_id,created_at) VALUES ($1,$2,$3,'transfer_out',$4,-$4,0,0,$5,'team_member_generation_task',$6,'Canvas Agent generation',$7::jsonb,$2,$8)",
          [randomUUID(), input.ownerUserId, input.actorTeamMemberId, estimatedCredits, Number(member.member_credits), task.id, JSON.stringify({ canvasId: input.canvasId, agentTaskId: input.agentTaskId, agentStepId: input.agentStepId }), now],
        );
      } else {
        const reservation = await reserveCreditsInTransaction(this.deps.db, {
          userId: input.ownerUserId,
          amount: estimatedCredits,
          sourceType: "generation_task",
          sourceId: task.id,
          reason: `${input.kind} generation`,
          canvasProjectId: input.canvasId,
          workflowId: workflow.workflow.id,
          taskId: task.id,
          metadata: { canvasId: input.canvasId, agentTaskId: input.agentTaskId, agentStepId: input.agentStepId, billingEvent: "reserved" },
          createdByUserId: input.ownerUserId,
          now,
        });
        creditReservationId = reservation.reservation.id;
      }
      await upsertQueuedGenerationTaskSnapshot(this.deps.db, {
        projectId: null, canvasProjectId: input.canvasId, episodeId: null,
        targetType: "canvas", targetId: scopeTargetId, workflowId: workflow.workflow.id, taskId: task.id,
        modelConfigId: model.id, providerConfigRevisionId: String(snapshot.providerConfigRevisionId ?? "") || null,
        credentialVersionRef: String(snapshot.credentialVersionRef ?? "") || null,
        creditReservationId, modelCode, mediaType: input.kind, taskMode: execution.taskMode,
        estimatedCredits, requestSummary: { prompt, parameters: executionParameters, agentTaskId: input.agentTaskId, agentStepId: input.agentStepId },
        creditSummary: input.actorTeamMemberId ? { consumed: estimatedCredits, memberId: input.actorTeamMemberId } : { reservationId: creditReservationId, reserved: estimatedCredits }, now,
      });
      await appendGenerationTaskCreatedOutboxEvent(this.deps.db, {
        userId: input.ownerUserId, workflowId: workflow.workflow.id, taskId: task.id, kind: input.kind,
        modelCode, queueName: execution.queueName, targetType: "canvas", targetId: nodeKey,
        providerExecutor: execution.providerExecutor,
        providerRouteIdentity: createGenerationProviderRouteIdentity({ modelConfigSnapshot: snapshot }) ?? null,
        providerConfigRevisionId: String(snapshot.providerConfigRevisionId ?? "") || null,
        credentialVersionRef: String(snapshot.credentialVersionRef ?? "") || null,
        availableAt: now,
      });
      await this.deps.db.query("COMMIT");
      return { generationTaskId: task.id, workflowId: workflow.workflow.id };
    } catch (error) {
      await this.deps.db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}

type CanvasAgentGenerationInput = Parameters<CanvasAgentGenerationIntake["create"]>[0];

const CANVAS_AGENT_GENERATION_NODE = {
  image: {
    type: "ai-image",
    title: "AI 图片",
    size: { width: 420, height: 378 },
    inputPort: { id: "in_asset", kind: "any", accepts: ["text", "image"], label: "文本/图片" },
    outputPort: { id: "out_image", kind: "image", label: "图片" },
  },
  video: {
    type: "ai-video",
    title: "AI 视频",
    size: { width: 420, height: 378 },
    inputPort: { id: "in_asset", kind: "any", accepts: ["text", "image", "video", "audio"], label: "素材" },
    outputPort: { id: "out_video", kind: "video", label: "视频" },
  },
  audio: {
    type: "ai-audio",
    title: "AI 音频",
    size: { width: 390, height: 220 },
    inputPort: { id: "in_text", kind: "text", accepts: ["text", "audio"], label: "文本/音频" },
    outputPort: { id: "out_audio", kind: "audio", label: "音频" },
  },
} as const;

async function upsertCanvasAgentGenerationNode(
  db: SqlDatabase,
  input: CanvasAgentGenerationInput & {
    taskId: string;
    nodeKey: string;
    modelCode: string;
    prompt: string;
    now: Date;
  },
) {
  const actorScope = canvasAgentGenerationActorScope(input);
  const targetNodeId = readString(input.targetNodeId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const canvas = await findCanvasByCanvasProjectId(db, {
      canvasProjectId: input.canvasId,
      actorScope,
    });
    if (!canvas) throw new Error("canvas_agent_canvas_not_found");
    const existingIndex = canvas.document.nodes.findIndex((node) => node.id === input.nodeKey);
    const existingNode = existingIndex >= 0 ? canvas.document.nodes[existingIndex] : null;
    if (readString(existingNode?.data?.taskId) === input.taskId) return existingNode;
    if (targetNodeId && !existingNode) throw new Error("canvas_agent_generation_target_node_not_found");

    const spec = CANVAS_AGENT_GENERATION_NODE[input.kind];
    if (targetNodeId && existingNode && !isCanvasAgentGenerationTargetCompatible(existingNode.type, input.kind)) {
      throw new Error("canvas_agent_generation_target_kind_mismatch");
    }
    const node: CanvasDocument["nodes"][number] = {
      id: input.nodeKey,
      type: existingNode?.type ?? spec.type,
      position: existingNode?.position ?? resolveCanvasAgentGenerationNodePosition(canvas.document, spec.size),
      size: existingNode?.size ?? spec.size,
      zIndex: existingNode?.zIndex ?? nextCanvasAgentGenerationNodeZIndex(canvas.document),
      data: {
        ...(existingNode?.data ?? {}),
        title: readString(existingNode?.data?.title) || spec.title,
        status: "queued",
        mediaKind: input.kind,
        modelCode: input.modelCode,
        prompt: input.prompt,
        taskId: input.taskId,
        lastTaskId: input.taskId,
        generationTaskId: input.taskId,
        generationProgress: 5,
        generationStage: "task_created",
        source: "canvas_agent",
        agentTaskId: input.agentTaskId,
        agentStepId: input.agentStepId,
        ports: { inputs: [spec.inputPort], outputs: [spec.outputPort] },
      },
    };
    const nodes = [...canvas.document.nodes];
    if (existingIndex >= 0) nodes[existingIndex] = node;
    else nodes.push(node);
    try {
      await saveCanvasByCanvasProjectId(db, {
        canvasProjectId: input.canvasId,
        actorScope,
        clientRevision: canvas.serverRevision,
        document: { ...canvas.document, nodes },
        events: [{
          type: "canvas_agent.generation_node_created",
          nodeKey: input.nodeKey,
          taskId: input.taskId,
          agentTaskId: input.agentTaskId,
          agentStepId: input.agentStepId,
        }],
        now: input.now,
      });
      return node;
    } catch (error) {
      if (error instanceof CanvasConflictError && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("canvas_agent_generation_node_conflict");
}

function canvasAgentGenerationActorScope(input: Pick<CanvasAgentGenerationInput, "canvasId" | "ownerUserId" | "actorTeamMemberId">) {
  return {
    canvasId: input.canvasId,
    ownerUserId: input.ownerUserId,
    principal: input.actorTeamMemberId ? "team_member" as const : "owner" as const,
    actorTeamMemberId: input.actorTeamMemberId ?? null,
    principalKey: input.actorTeamMemberId ? `member:${input.actorTeamMemberId}` : `owner:${input.ownerUserId}`,
    capabilities: input.actorTeamMemberId
      ? [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun]
      : [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
  };
}

function resolveCanvasAgentGenerationTargets(
  input: Pick<CanvasAgentGenerationInput, "canvasId" | "kind" | "agentStepId" | "targetNodeId">,
) {
  const targetNodeId = readString(input.targetNodeId);
  return {
    scopeTargetId: input.canvasId,
    nodeKey: targetNodeId || `canvas-agent-${input.kind}-${input.agentStepId}`,
  };
}

function isCanvasAgentGenerationTargetCompatible(nodeType: string, kind: CanvasAgentGenerationInput["kind"]) {
  const type = nodeType.trim().toLowerCase();
  if (kind === "image") return ["send", "image", "ai-image", "source-image"].includes(type);
  if (kind === "video") return ["video", "ai-video", "source-video"].includes(type);
  return ["audio", "ai-audio", "source-audio"].includes(type);
}

function resolveCanvasAgentGenerationNodePosition(document: CanvasDocument, size: { width: number; height: number }) {
  const gap = 24;
  const stepX = size.width + 48;
  const stepY = size.height + 48;
  for (let row = 0; row < 40; row += 1) {
    for (let column = 0; column < 40; column += 1) {
      const position = { x: 220 + column * stepX, y: 180 + row * stepY };
      const free = document.nodes.every((node) => {
        const left = Number(node.position?.x ?? 0);
        const top = Number(node.position?.y ?? 0);
        const width = Math.max(1, Number(node.size?.width ?? 420));
        const height = Math.max(1, Number(node.size?.height ?? 378));
        return position.x + size.width + gap <= left
          || position.x >= left + width + gap
          || position.y + size.height + gap <= top
          || position.y >= top + height + gap;
      });
      if (free) return position;
    }
  }
  return { x: 220, y: 180 + document.nodes.length * stepY };
}

function nextCanvasAgentGenerationNodeZIndex(document: CanvasDocument) {
  return document.nodes.reduce((maximum, node) => Math.max(maximum, Number(node.zIndex ?? 0)), 0) + 1;
}

function readGenerationKind(value: unknown, fallback: CanvasAgentGenerationInput["kind"]) {
  return value === "image" || value === "video" || value === "audio" ? value : fallback;
}

function applyCanvasPatch(document: CanvasDocument, operations: unknown[]) {
  const next = structuredClone(document) as Record<string, unknown>;
  for (const rawOperation of operations) {
    const operation = asRecord(rawOperation);
    if (readString(operation.type) === "addEdge") {
      const edge = asRecord(operation.edge);
      if (!Object.keys(edge).length || !Array.isArray(next.edges)) {
        throw new Error("canvas_agent_patch_operation_invalid");
      }
      next.edges.push(structuredClone(edge));
      continue;
    }
    const op = readString(operation.op);
    const path = readString(operation.path);
    if (!path.startsWith("/") || !["add", "replace", "remove"].includes(op)) {
      throw new Error("canvas_agent_patch_operation_invalid");
    }
    const segments = path.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
    let parent: Record<string, unknown> | unknown[] = next;
    for (const segment of segments.slice(0, -1)) {
      const child = Array.isArray(parent)
        ? parent[resolveCanvasPatchArrayIndex(parent, segment)]
        : parent[segment];
      if (!child || typeof child !== "object") throw new Error("canvas_agent_patch_path_not_found");
      parent = child as Record<string, unknown> | unknown[];
    }
    const key = segments.at(-1)!;
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : resolveCanvasPatchArrayIndex(parent, key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length || (op !== "add" && index >= parent.length)) throw new Error("canvas_agent_patch_path_not_found");
      if (op === "remove") parent.splice(index, 1);
      else if (op === "add") parent.splice(index, 0, operation.value);
      else parent[index] = operation.value;
    } else if (op === "remove") {
      if (!(key in parent)) throw new Error("canvas_agent_patch_path_not_found");
      delete parent[key];
    } else {
      parent[key] = operation.value;
    }
  }
  return next;
}

function resolveCanvasPatchArrayIndex(items: unknown[], segment: string) {
  const numericIndex = Number(segment);
  if (Number.isInteger(numericIndex) && numericIndex >= 0) return numericIndex;
  return items.findIndex((item) => readString(asRecord(item).id) === segment);
}

function generationCredits(
  pricing: Record<string, unknown>,
  parameters: Record<string, unknown> = {},
  mediaType: "image" | "video" | "audio" = "image",
) {
  const base = Number(pricing.baseCredits ?? pricing.credits ?? pricing.creditCost ?? pricing.minimumCredits ?? 1);
  const baseCredits = Number.isFinite(base) && base >= 0 ? base : 1;
  const resolution = readString(parameters.resolution ?? parameters.quality ?? parameters.ratio ?? parameters.aspectRatio);
  const resolutionCredits = asRecord(pricing.resolutionCredits);
  const configured = resolution ? Number(resolutionCredits[resolution]) : Number.NaN;
  const unitCredits = Number.isFinite(configured) && configured >= 0 ? configured : baseCredits;
  const duration = Number(parameters.durationSec ?? 1);
  const cost = readString(pricing.billingMode) === "duration" && mediaType === "video"
    ? unitCredits * (Number.isFinite(duration) && duration > 0 ? duration : 1)
    : unitCredits;
  return cost > 0 && cost < 1 ? 1 : Math.max(1, Math.round(cost));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return asRecord(value);
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

export const __canvasAgentRuntimeTestUtils = {
  applyCanvasPatch,
  generationCredits,
  resolveCanvasAgentGenerationTargets,
  resolveRuntimeActor,
  upsertCanvasAgentGenerationNode,
};
