import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import { dispatchGenerationOutboxBatch } from "../../model-gateway/generation-outbox.dispatcher.ts";
import { loadGenerationQueueConfig } from "../../model-gateway/generation-queue.config.ts";
import { repairExpiredGenerationSubmitLeases } from "../../model-gateway/generation-redis-repair.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import { agentExecutionMetadata } from "../../shared/db/agent-execution-scope.ts";
import { createCanvasAgentWorkerRuntime } from "../canvas-agent-runtime.factory.ts";
import type { CanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";

test("Agent generation reaches the configured environment's dispatcher without duplicate billing", async () => {
  const db = await createMigratedTestDb();
  const now = new Date();
  const ownerUserId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const modelId = randomUUID();
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
    await db.query(`INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Dispatch test','active',1,$2,$2)`, [canvasId, ownerUserId]);
    await db.query(`INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title)
      VALUES ($1,$2,$3,'Dispatch test')`, [conversationId, canvasId, ownerUserId]);
    await db.query(`INSERT INTO user_memberships (id,user_id,membership_tier,purchase_at,expires_at,gift_credits,status)
      VALUES ($1,$2,'professional',$3,$4,0,'active')`,
    [randomUUID(), ownerUserId, now, new Date(now.getTime() + 86400000)]);
    await grantCredits(db, { userId: ownerUserId, amount: 100, sourceType: "test", sourceId: randomUUID(), reason: "Dispatch test", createdByUserId: ownerUserId, now });
    await db.query(`INSERT INTO ai_model_configs (
      id,model_code,display_name,provider_name,provider_model,provider_protocol,invocation_mode,media_type,
      task_modes_json,capabilities_json,parameter_schema_json,default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
    ) VALUES ($1,'dispatch-test-image','Dispatch image','test','dispatch-image','openai_images','sync','image',
      '["image.generate"]','{}','{}','{}','{}','{"baseCredits":1}','{}','{}','active')`, [modelId]);
    for (const [workerEnvironment, environmentConfig] of [
      ["production", { WORKER_ENVIRONMENT: "production" }],
      ["local", { WORKER_ENVIRONMENT: "local" }],
      ["staging", { WORKER_ENVIRONMENT: "staging" }],
      ["local", { HOST: "127.0.0.1", NODE_ENV: "production" }],
      ["production", { NODE_ENV: "production" }],
    ] as const) {
      const env = { ...environmentConfig, BULLMQ_WORKERS_ENABLED: "true", BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true", GENERATION_SUBMIT_QUEUE: "acceptance-submit" };
      // A foreign deployment's older event for the same user must not block
      // this deployment's later event in any level of fair dispatch selection.
      const foreignScope = "f".repeat(32);
      await db.query("SELECT set_config('comic_ai.agent_execution_scope',$1,false)", [foreignScope]);
      const foreign = await createWorkflowWithTasks(db, {
        userId: ownerUserId, projectId: null, canvasProjectId: canvasId, workflowType: "image_generation",
        inputSnapshot: { workerEnvironment, agentExecutionScope: foreignScope },
        tasks: [{ taskType: "episode_generate_image", queueName: "acceptance-submit", targetEntityType: "canvas_agent_conversation", targetEntityId: conversationId,
          inputSnapshot: { workerEnvironment, agentExecutionScope: foreignScope } }],
      });
      await db.query("INSERT INTO outbox_events(id,user_id,event_type,payload_json,status,available_at,created_at) VALUES ($1,$2,'generation.task.created',$3,'pending',$4,$4)",
        [randomUUID(), ownerUserId, { taskId: foreign.tasks[0].id, workflowId: foreign.workflow.id, mediaType: "image" }, new Date(now.getTime() - 60000)]);
      // Each environment simulates a separate runtime on this serial fixture.
      await db.query("SELECT set_config('comic_ai.agent_execution_scope',$1,false)", [agentExecutionMetadata(env).agentExecutionScope]);
      const runtime = createCanvasAgentWorkerRuntime({ db, env, workerId: "dispatch-test", now: () => now });
      // Exercise the real production registry/intake without invoking a paid text model.
      const tools = Reflect.get(runtime.executor, "deps").tools as CanvasAgentToolRegistry;
      const generate = tools.get("generation.create")!;
      const context = { canvasId, conversationId, agentTaskId: randomUUID(), agentStepId: randomUUID(), actor: { ownerUserId, actorTeamMemberId: null, capabilities: new Set(["canvas:run"]) }, callId: randomUUID(), capabilityProfile: "media_generation_only" as const };
      const request = { kind: "image", request: { model: "dispatch-test-image", prompt: "A school character", parameters: {} } };
      const created = await generate.execute(request, context);
      const replayed = await generate.execute(request, context);
      assert.equal(replayed.generationTaskId, created.generationTaskId);
      const published: Array<{ queue: string; data: Record<string, unknown> }> = [];
      const snapshot = await db.query<{ environment: string; workflow_environment: string }>(`
        SELECT task.input_snapshot_json->>'workerEnvironment' AS environment,
          workflow.input_snapshot_json->>'workerEnvironment' AS workflow_environment
        FROM tasks task JOIN workflows workflow ON workflow.id=task.workflow_id WHERE task.id=$1
      `, [created.generationTaskId]);
      assert.equal(snapshot.rows[0]?.environment, workerEnvironment);
      assert.equal(snapshot.rows[0]?.workflow_environment, workerEnvironment);
      const otherEnvironment = await dispatchGenerationOutboxBatch(db, {
        now: new Date(now.getTime() + 60000), limit: 10,
        config: loadGenerationQueueConfig({ ...env, WORKER_ENVIRONMENT: workerEnvironment === "local" ? "production" : "local" }),
        publisher: { async add() { assert.fail("another environment must not receive this task"); } },
      });
      assert.equal(otherEnvironment.processedEventIds.length, 0);
      const dispatched = await dispatchGenerationOutboxBatch(db, {
        now: new Date(now.getTime() + 60000), limit: 10, config: loadGenerationQueueConfig({ ...env, WORKER_ENVIRONMENT: workerEnvironment }),
        publisher: { async add(queue, _name, data) { published.push({ queue, data }); } },
      });
      assert.equal(dispatched.processedEventIds.length, 1, `${workerEnvironment} must claim the Agent task`);
      assert.equal(published[0]?.queue, `agent-${agentExecutionMetadata(env).agentExecutionScope}-acceptance-submit`);
      assert.equal(published[0]?.data.taskId, created.generationTaskId);
      const reservation = await db.query<{ count: string }>("SELECT count(*) FROM credit_reservations WHERE task_id=$1", [created.generationTaskId]);
      assert.equal(Number(reservation.rows[0]?.count), 1);
    }
    // Execute the real recovery SQL: a mock query cannot detect invalid SELECT syntax.
    assert.deepEqual(await repairExpiredGenerationSubmitLeases(db, { now, limit: 10 }), {
      requeuedTaskIds: [], resultUnknownTaskIds: [], repairedTaskIds: [],
    });
  } finally {
    await db.close();
  }
});
