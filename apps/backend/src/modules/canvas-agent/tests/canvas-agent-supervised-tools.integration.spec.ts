import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { restoreCanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { getCanvasSettings } from "../../project/canvas-settings.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { CanvasAgentExecutor } from "../canvas-agent-executor.ts";
import { CanvasAgentKnowledgeAdminService } from "../canvas-agent-knowledge.service.ts";
import { CanvasAgentMcpToolService } from "../canvas-agent-mcp.service.ts";
import { CanvasAgentPolicyService } from "../canvas-agent-policy.service.ts";
import { CanvasAgentProviderConfigService } from "../canvas-agent-provider-config.service.ts";
import { CanvasAgentPromptPreferenceService } from "../canvas-agent-prompt-preference.service.ts";
import {
  createCanvasAgentStep,
  createCanvasAgentTask,
  decideCanvasAgentApproval,
  requestCanvasAgentApproval,
} from "../canvas-agent-task.service.ts";
import { createDefaultCanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";
import type { CanvasAgentActor, CanvasAgentToolEffect } from "../canvas-agent.types.ts";
import { CanvasAgentWorker } from "../canvas-agent.worker.ts";

const now = new Date("2026-07-26T08:00:00.000Z");

test("Worker executes approved provider config and MCP tools through the supervised runtime", async () => {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const modelId = randomUUID();
  const actor: CanvasAgentActor = {
    ownerUserId,
    actorTeamMemberId: null,
    capabilities: new Set([
      capabilities.canvasView,
      capabilities.canvasEdit,
      capabilities.canvasRun,
      capabilities.canvasManage,
    ]),
  };
  const mcpRequests: Array<Record<string, unknown>> = [];
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Supervised Tools Canvas','active',1,$2,$2)
    `, [canvasId, ownerUserId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Supervised tools',now(),now())
    `, [conversationId, canvasId, ownerUserId]);
    await db.query(`
      INSERT INTO ai_model_configs (
        id,model_code,display_name,provider_name,provider_model,provider_protocol,
        invocation_mode,media_type,task_modes_json,capabilities_json,parameter_schema_json,
        default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
      ) VALUES ($1,'supervised-image-model','Supervised Image','test','supervised-image','openai_images',
        'sync','image','["image.generate"]'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
        '{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'active')
    `, [modelId]);
    await new CanvasAgentKnowledgeAdminService(db).setExternalPolicy({
      kind: "mcp",
      targetId: "asset-server",
      enabled: true,
      allowedDomains: ["mcp.example.test"],
      allowedOperations: ["asset.read"],
      now,
    });

    const providerConfig = new CanvasAgentProviderConfigService(db);
    const promptPreferences = new CanvasAgentPromptPreferenceService(db);
    const mcp = new CanvasAgentMcpToolService(
      db,
      (async (_url, init) => {
        mcpRequests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: "mcp-result", result: { assets: ["asset-1"] } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
      (async () => [{ address: "93.184.216.34", family: 4 }]) as typeof import("node:dns/promises").lookup,
    );
    const tools = createDefaultCanvasAgentToolRegistry({
      readCanvas: async () => ({ canvasId }),
      patchCanvas: async () => ({ revision: 1 }),
      generationIntake: { create: async () => ({ generationTaskId: randomUUID() }) },
      createProviderConfigDraft: (request) => providerConfig.createDraft({ ...request, now }),
      applyProviderConfigDraft: (request) => providerConfig.applyDraft({ ...request, now }),
      promptPreferences,
      mcpCall: (request) => mcp.call(request),
      now: () => now,
    });
    const executor = new CanvasAgentExecutor({
      db,
      textGateway: finalTextGateway(),
      context: { build: async () => ({ canvasId, conversationId }) } as never,
      policy: new CanvasAgentPolicyService({ mcpServerAllowlist: ["asset-server"] }),
      tools,
      billing: noOpBilling(),
      resolveActor: async (task) => {
        const scope = await restoreCanvasActorScope(db, task);
        return {
          ownerUserId: scope.ownerUserId,
          actorTeamMemberId: scope.actorTeamMemberId,
          capabilities: new Set(scope.capabilities),
        };
      },
      now: () => now,
    });
    const worker = new CanvasAgentWorker({ db, executor, workerId: "supervised-tools-worker", now: () => now });

    const draftTask = await createApprovedToolTask({
      db, canvasId, conversationId, actor,
      toolId: "provider.config_draft",
      effect: "config_write",
      input: {
        modelCode: "supervised-image-model",
        mediaKind: "image",
        generation: { imageAspectRatio: "16:9", imageSize: "2K" },
      },
      callId: "provider-draft-call",
    });
    assert.equal((await worker.processTask(draftTask.id)).status, "succeeded");
    const draftRows = await db.query<{ id: string; status: string }>(
      "SELECT id,status FROM canvas_agent_provider_config_drafts WHERE task_id=$1",
      [draftTask.id],
    );
    assert.equal(draftRows.rows[0]?.status, "draft");

    const applyTask = await createApprovedToolTask({
      db, canvasId, conversationId, actor,
      toolId: "provider.config_apply",
      effect: "config_write",
      input: { draftId: draftRows.rows[0]?.id },
      callId: "provider-apply-call",
    });
    assert.equal((await worker.processTask(applyTask.id)).status, "succeeded");
    const settings = await getCanvasSettings(db, {
      actorScope: await restoreCanvasActorScope(db, { canvasId, ownerUserId, actorTeamMemberId: null }),
    });
    assert.equal(settings.revision, 2);
    assert.equal(settings.settings.defaultModels.image, "supervised-image-model");
    assert.equal(settings.settings.generation.imageAspectRatio, "16:9");

    const mcpTask = await createApprovedToolTask({
      db, canvasId, conversationId, actor,
      toolId: "mcp.call",
      effect: "mcp",
      input: {
        serverId: "asset-server",
        endpoint: "https://mcp.example.test/rpc",
        operation: "asset.read",
        arguments: { query: "hero" },
      },
      callId: "mcp-call",
    });
    assert.equal((await worker.processTask(mcpTask.id)).status, "succeeded");
    assert.equal(mcpRequests.length, 1);
    assert.equal(mcpRequests[0]?.method, "asset.read");
    const toolMessages = await db.query<{ content_json: Record<string, unknown> }>(`
      SELECT content_json FROM canvas_agent_messages
      WHERE task_id=$1 AND role='tool'
      ORDER BY created_at ASC
    `, [mcpTask.id]);
    assert.match(JSON.stringify(toolMessages.rows[0]?.content_json), /asset-1/);
    const auditEvents = await db.query<{ event_type: string }>(`
      SELECT event_type FROM canvas_agent_events
      WHERE task_id = ANY($1::uuid[]) AND event_type IN ('approval.requested','approval.approved','policy.decided','task.succeeded')
    `, [[draftTask.id, applyTask.id, mcpTask.id]]);
    assert.equal(auditEvents.rows.filter((event) => event.event_type === "approval.requested").length, 3);
    assert.equal(auditEvents.rows.filter((event) => event.event_type === "approval.approved").length, 3);
    assert.equal(auditEvents.rows.filter((event) => event.event_type === "policy.decided").length, 3);
    assert.equal(auditEvents.rows.filter((event) => event.event_type === "task.succeeded").length, 3);

    const modelDrivenTask = await createCanvasAgentTask(db, {
      canvasId,
      conversationId,
      actor,
      mode: "b",
      modelCode: "agent-test",
      modelConfigSnapshot: agentModelSnapshot(),
      baseRevision: 1,
      userMessage: { text: "让模型修改默认图片尺寸" },
      now,
    });
    const modelExecutor = new CanvasAgentExecutor({
      db,
      textGateway: sequencedTextGateway([
        {
          kind: "tool_call",
          toolId: "provider.config_draft",
          callId: "model-provider-draft",
          input: {
            modelCode: "supervised-image-model",
            mediaKind: "image",
            generation: { imageSize: "4K" },
          },
        },
        { kind: "final", message: "配置草稿已经创建" },
      ]),
      context: { build: async () => ({ canvasId, conversationId }) } as never,
      policy: new CanvasAgentPolicyService({ mcpServerAllowlist: ["asset-server"] }),
      tools,
      billing: noOpBilling(),
      resolveActor: async (task) => {
        const scope = await restoreCanvasActorScope(db, task);
        return {
          ownerUserId: scope.ownerUserId,
          actorTeamMemberId: scope.actorTeamMemberId,
          capabilities: new Set(scope.capabilities),
        };
      },
      now: () => now,
    });
    const modelWorker = new CanvasAgentWorker({
      db,
      executor: modelExecutor,
      workerId: "model-tool-loop-worker",
      now: () => now,
    });
    assert.equal((await modelWorker.processTask(modelDrivenTask.id)).status, "waiting_approval");
    const pendingApproval = await db.query<{ id: string; step_id: string }>(`
      SELECT id,step_id FROM canvas_agent_approvals
      WHERE task_id=$1 AND status='pending'
      LIMIT 1
    `, [modelDrivenTask.id]);
    assert.ok(pendingApproval.rows[0]?.id);
    await decideCanvasAgentApproval(db, {
      taskId: modelDrivenTask.id,
      approvalId: pendingApproval.rows[0]!.id,
      actor,
      decision: "approved",
      now,
    });
    assert.equal((await modelWorker.processTask(modelDrivenTask.id)).status, "succeeded");
    const modelDrafts = await db.query<{ status: string; settings_patch_json: Record<string, unknown> }>(`
      SELECT status,settings_patch_json FROM canvas_agent_provider_config_drafts
      WHERE task_id=$1
    `, [modelDrivenTask.id]);
    assert.equal(modelDrafts.rows.length, 1);
    assert.equal(modelDrafts.rows[0]?.status, "draft");
    assert.match(JSON.stringify(modelDrafts.rows[0]?.settings_patch_json), /4K/);
    const modelMessages = await db.query<{ role: string; content_json: Record<string, unknown> }>(`
      SELECT role,content_json FROM canvas_agent_messages
      WHERE task_id=$1 ORDER BY sequence ASC
    `, [modelDrivenTask.id]);
    assert.equal(modelMessages.rows.filter((message) => message.role === "tool").length, 1);
    assert.match(JSON.stringify(modelMessages.rows.find((message) => message.role === "assistant")?.content_json), /配置草稿已经创建/);

    const preferenceTask = await createCanvasAgentTask(db, {
      canvasId,
      conversationId,
      actor,
      mode: "b",
      modelCode: "agent-test",
      modelConfigSnapshot: agentModelSnapshot(),
      baseRevision: 1,
      userMessage: { text: "记住我确认过的视频提示词偏好" },
      now,
    });
    const preferenceExecutor = new CanvasAgentExecutor({
      db,
      textGateway: sequencedTextGateway([
        {
          kind: "tool_call",
          toolId: "preference.learn_media_prompt",
          callId: "learn-video-preference",
          input: {
            mediaKind: "video",
            preferenceKey: "video.camera.motion",
            instruction: "镜头运动保持缓慢稳定",
            tags: ["camera", "stable"],
            confirmed: true,
          },
        },
        { kind: "final", message: "已经记住你确认的视频偏好" },
      ]),
      context: { build: async () => ({ canvasId, conversationId }) } as never,
      policy: new CanvasAgentPolicyService(),
      tools,
      billing: noOpBilling(),
      resolveActor: async (task) => {
        const scope = await restoreCanvasActorScope(db, task);
        return {
          ownerUserId: scope.ownerUserId,
          actorTeamMemberId: scope.actorTeamMemberId,
          capabilities: new Set(scope.capabilities),
        };
      },
      now: () => now,
    });
    const preferenceWorker = new CanvasAgentWorker({
      db,
      executor: preferenceExecutor,
      workerId: "prompt-preference-worker",
      now: () => now,
    });
    assert.equal((await preferenceWorker.processTask(preferenceTask.id)).status, "waiting_approval");
    const preferenceApproval = await db.query<{ id: string }>(`
      SELECT id FROM canvas_agent_approvals
      WHERE task_id=$1 AND status='pending'
      LIMIT 1
    `, [preferenceTask.id]);
    await decideCanvasAgentApproval(db, {
      taskId: preferenceTask.id,
      approvalId: preferenceApproval.rows[0]!.id,
      actor,
      decision: "approved",
      now,
    });
    assert.equal((await preferenceWorker.processTask(preferenceTask.id)).status, "succeeded");
    const learnedPreferences = await promptPreferences.list({ canvasId, actor });
    assert.deepEqual(learnedPreferences.map((item) => item.preferenceKey), ["video.camera.motion"]);
    assert.equal(learnedPreferences[0]?.instruction, "镜头运动保持缓慢稳定");
  } finally {
    await db.close();
  }
});

async function createApprovedToolTask(input: {
  db: Awaited<ReturnType<typeof createMigratedTestDb>>;
  canvasId: string;
  conversationId: string;
  actor: CanvasAgentActor;
  toolId: string;
  effect: CanvasAgentToolEffect;
  input: Record<string, unknown>;
  callId: string;
}) {
  const task = await createCanvasAgentTask(input.db, {
    canvasId: input.canvasId,
    conversationId: input.conversationId,
    actor: input.actor,
    mode: "b",
    modelCode: "agent-test",
    modelConfigSnapshot: agentModelSnapshot(),
    baseRevision: 1,
    userMessage: { text: input.callId },
    now,
  });
  const step = await createCanvasAgentStep(input.db, {
    taskId: task.id,
    kind: "tool",
    toolId: input.toolId,
    callId: input.callId,
    effect: input.effect,
    input: input.input,
    now,
  });
  const approval = await requestCanvasAgentApproval(input.db, {
    taskId: task.id,
    stepId: step.id,
    actor: input.actor,
    effect: input.effect,
    reason: "supervised integration approval",
    now,
  });
  await decideCanvasAgentApproval(input.db, {
    taskId: task.id,
    approvalId: approval.id,
    actor: input.actor,
    decision: "approved",
    now,
  });
  return task;
}

function finalTextGateway() {
  return sequencedTextGateway([{ kind: "final", message: "done" }], true);
}

function sequencedTextGateway(turns: Array<Record<string, unknown>>, repeatLast = false) {
  let index = 0;
  return {
    chat: {
      completions: {
        async create() {
          const turn = turns[Math.min(index, turns.length - 1)] ?? { kind: "final", message: "done" };
          if (index < turns.length - 1 || !repeatLast) index += 1;
          return {
            providerRequestId: null,
            stream: (async function* () {
              yield { choices: [{ delta: { content: JSON.stringify(turn) } }] };
            })(),
            abort() {},
            completed: Promise.resolve({
              status: "succeeded" as const,
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              usageSource: "provider" as const,
            }),
          };
        },
      },
    },
  } as never;
}

function agentModelSnapshot() {
  return {
    version: 1,
    modelConfigId: randomUUID(),
    modelCode: "agent-test",
    providerName: "test",
    providerModel: "test",
    providerProtocol: "openai_compatible_chat",
    providerConfigRevisionId: "revision:test",
    credentialVersionRef: "credential:test",
    capabilities: {},
    pricing: { baseCredits: 1 },
    limits: {},
    providerConfig: {},
  };
}

function noOpBilling() {
  return {
    estimateRound: () => 1,
    reserveRound: async () => ({ kind: "reservation" as const, reservationId: null, amount: 1 }),
    settleRound: async () => ({ consumed: 1, released: 0 }),
    settleTask: async () => ({ consumed: 1, totalTokens: 1 }),
  } as never;
}
