import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { CanvasAgentActor } from "../canvas-agent.types.ts";
import { grantCredits } from "../../credit-billing/credit-ledger.service.ts";
import { createCanvasAgentWorkerRuntime, quoteCanvasAgentGeneration } from "../canvas-agent-runtime.factory.ts";
import type { CanvasAgentToolRegistry } from "../canvas-agent-tool.registry.ts";
import {
  CanvasAgentStateConflictError,
  CanvasAgentStepSkipError,
  createCanvasAgentStep,
  createCanvasAgentTask,
  decideCanvasAgentApproval,
  requestCanvasAgentApproval,
  skipCanvasAgentStep,
  updateCanvasAgentStep,
} from "../canvas-agent-task.service.ts";

describe("Canvas Agent step skip", { concurrency: false }, () => {
  it("binds approval to persisted generation input and real credits, rejects stale quotes before spending, and replays once", async () => {
    const fixture = await createFixture();
    try {
      const unavailableInput = { kind: "image", request: { model: "approval-image", prompt: "报价缺失时的独立片段", parameters: {} } };
      const unavailableStep = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "generation.create", callId: "unavailable-image",
        effect: "media_generation", input: unavailableInput, now: fixture.now,
      });
      const unavailableApproval = await requestCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, stepId: unavailableStep.id, actor: fixture.actor,
        effect: "media_generation", reason: "generation_confirmation_required", now: fixture.now,
      });
      const modelId = randomUUID();
      await fixture.db.query(`INSERT INTO ai_model_configs (
        id,model_code,display_name,provider_name,provider_model,provider_protocol,invocation_mode,media_type,
        task_modes_json,capabilities_json,parameter_schema_json,default_params_json,provider_config_json,pricing_json,limits_json,ui_config_json,status
      ) VALUES ($1,'approval-image','Approval image','test','approval-image','openai_images','sync','image',
        '["image.generate"]','{}','{}','{"resolution":"2K"}','{}','{"baseCredits":3}','{}','{}','active')`, [modelId]);
      // Restoring the model does not make a previously unavailable quote valid.
      await assert.rejects(decideCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, approvalId: unavailableApproval.id, actor: fixture.actor, decision: "approved", now: fixture.now,
      }), CanvasAgentStateConflictError);
      assert.equal((await fixture.db.query<{ status: string }>("SELECT status FROM canvas_agent_approvals WHERE id=$1", [unavailableApproval.id])).rows[0]?.status, "pending");
      const input = { kind: "image", request: { model: "approval-image", prompt: "人物站在书店窗前", parameters: {} } };
      const step = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "generation.create", callId: "approved-image",
        effect: "media_generation", input, now: fixture.now,
      });
      const approval = await requestCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, stepId: step.id, actor: fixture.actor,
        effect: "media_generation", reason: "generation_confirmation_required", now: fixture.now,
      });
      const events = await fixture.db.query<{ event_json: { input: unknown; quote: Record<string, unknown> } }>(
        "SELECT event_json FROM canvas_agent_events WHERE task_id=$1 AND event_type='approval.requested' AND event_json->>'stepId'=$2", [fixture.taskId, step.id]);
      assert.deepEqual(events.rows[0]?.event_json.input, input);
      assert.equal(events.rows[0]?.event_json.quote.status, "available");
      assert.equal(events.rows[0]?.event_json.quote.estimatedCredits, 3);
      assert.deepEqual(events.rows[0]?.event_json.quote.parameters, { resolution: "2K" });
      assert.equal((await fixture.db.query("SELECT id FROM credit_reservations")).rows.length, 0);
      await fixture.db.query("UPDATE ai_model_configs SET pricing_json=$2::jsonb WHERE id=$1", [modelId, JSON.stringify({ baseCredits: 4 })]);
      await requestCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, stepId: step.id, actor: fixture.actor,
        effect: "media_generation", reason: "generation_confirmation_required", now: fixture.now,
      });
      const saved = await fixture.db.query<{ checkpoint_json: { generationApprovalQuote: { estimatedCredits: number } } }>(
        "SELECT checkpoint_json FROM canvas_agent_steps WHERE id=$1", [step.id]);
      assert.equal(saved.rows[0]?.checkpoint_json.generationApprovalQuote.estimatedCredits, 3);
      await decideCanvasAgentApproval(fixture.db, { taskId: fixture.taskId, approvalId: approval.id, actor: fixture.actor, decision: "approved", now: fixture.now });
      await assert.rejects(decideCanvasAgentApproval(fixture.db, { taskId: fixture.taskId, approvalId: approval.id, actor: fixture.actor, decision: "approved", now: fixture.now }), CanvasAgentStateConflictError);
      await fixture.db.query(`INSERT INTO user_memberships (id,user_id,membership_tier,purchase_at,expires_at,gift_credits,status)
        VALUES ($1,$2,'professional',$3,$4,0,'active')`, [randomUUID(), fixture.actor.ownerUserId, fixture.now, new Date(fixture.now.getTime() + 86400000)]);
      await grantCredits(fixture.db, { userId: fixture.actor.ownerUserId, amount: 100, sourceType: "test", sourceId: randomUUID(), reason: "approval test", createdByUserId: fixture.actor.ownerUserId, now: fixture.now });
      const runtime = createCanvasAgentWorkerRuntime({ db: fixture.db, env: { ...process.env, BULLMQ_WORKERS_ENABLED: "true", BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true" }, workerId: "approval-test", now: () => fixture.now });
      const registry = Reflect.get(runtime.executor, "deps").tools as CanvasAgentToolRegistry;
      const context = { canvasId: fixture.canvasId, conversationId: fixture.conversationId, agentTaskId: fixture.taskId, agentStepId: step.id, actor: fixture.actor, callId: "approved-image", capabilityProfile: "media_generation_only" as const };
      await assert.rejects(registry.execute("generation.create", unavailableInput, {
        ...context, agentStepId: unavailableStep.id, callId: "unavailable-image",
      }), /canvas_agent_generation_quote_unavailable/);
      assert.equal((await fixture.db.query("SELECT id FROM tasks WHERE task_type='episode_generate_image'")).rows.length, 0);
      await assert.rejects(registry.execute("generation.create", input, context), /generation_quote_stale/);
      assert.equal((await fixture.db.query("SELECT id FROM credit_reservations")).rows.length, 0);
      await fixture.db.query("UPDATE ai_model_configs SET pricing_json=$2::jsonb WHERE id=$1", [modelId, JSON.stringify({ baseCredits: 3 })]);
      const generated = await registry.execute("generation.create", input, context);
      const replayed = await registry.execute("generation.create", input, context);
      assert.equal(generated.generationTaskId, replayed.generationTaskId);
      assert.equal((await fixture.db.query("SELECT id FROM credit_reservations WHERE task_id=$1", [generated.generationTaskId])).rows.length, 1);
      assert.deepEqual(await quoteCanvasAgentGeneration(fixture.db, { kind: "image", request: { model: "missing-model" } }), { status: "unavailable", reason: "canvas_agent_generation_model_not_configured" });
    } finally {
      await fixture.db.close();
    }
  });

  it("cancels the generic workflow when an approval is rejected", async () => {
    const fixture = await createFixture();
    try {
      const step = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "canvas.write", callId: "write-reject-1",
        effect: "canvas_write", input: { nodeId: "node-1" }, now: fixture.now,
      });
      const approval = await requestCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, stepId: step.id, actor: fixture.actor,
        effect: "canvas_write", reason: "canvas write", now: fixture.now,
      });

      await decideCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, approvalId: approval.id, actor: fixture.actor,
        decision: "rejected", now: fixture.later,
      });

      const state = await fixture.db.query<{
        agent_status: string;
        workflow_task_status: string;
        workflow_status: string;
      }>(`
        SELECT agent.status AS agent_status, task.status AS workflow_task_status,
               workflow.status AS workflow_status
        FROM canvas_agent_tasks agent
        JOIN tasks task ON task.id=agent.workflow_task_id
        JOIN workflows workflow ON workflow.id=agent.workflow_id
        WHERE agent.id=$1
      `, [fixture.taskId]);
      assert.deepEqual(state.rows[0], {
        agent_status: "canceled",
        workflow_task_status: "canceled",
        workflow_status: "canceled",
      });
    } finally {
      await fixture.db.close();
    }
  });

  it("persists an approval-waiting skip and prevents later approval or execution", async () => {
    const fixture = await createFixture();
    try {
      const step = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "canvas.write", callId: "write-1",
        effect: "canvas_write", input: { nodeId: "node-1" }, now: fixture.now,
      });
      const approval = await requestCanvasAgentApproval(fixture.db, {
        taskId: fixture.taskId, stepId: step.id, actor: fixture.actor,
        effect: "canvas_write", reason: "canvas write", now: fixture.now,
      });

      const skipped = await skipCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, actor: fixture.actor, reason: "not needed", now: fixture.later,
      });

      assert.equal(skipped.status, "skipped");
      assert.equal(skipped.errorCode, "user_skipped");
      const state = await fixture.db.query(`
        SELECT task.status AS task_status,step.status AS step_status,approval.status AS approval_status
        FROM canvas_agent_tasks task
        JOIN canvas_agent_steps step ON step.id=task.current_step_id
        JOIN canvas_agent_approvals approval ON approval.step_id=step.id
        WHERE task.id=$1
      `, [fixture.taskId]);
      assert.deepEqual(state.rows[0], { task_status: "queued", step_status: "skipped", approval_status: "rejected" });
      await assert.rejects(
        decideCanvasAgentApproval(fixture.db, {
          taskId: fixture.taskId, approvalId: approval.id, actor: fixture.actor,
          decision: "approved", now: new Date("2026-07-27T00:00:02.000Z"),
        }),
        CanvasAgentStateConflictError,
      );
      await assert.rejects(
        updateCanvasAgentStep(fixture.db, {
          stepId: step.id, status: "running", fromStatuses: ["created"], now: fixture.later,
        }),
        CanvasAgentStateConflictError,
      );
      const events = await fixture.db.query<{ event_type: string }>(
        "SELECT event_type FROM canvas_agent_events WHERE task_id=$1 ORDER BY sequence",
        [fixture.taskId],
      );
      assert.ok(events.rows.some((event) => event.event_type === "step.skipped"));
    } finally {
      await fixture.db.close();
    }
  });

  it("skips an unstarted queued step and leaves a paused task paused", async () => {
    const fixture = await createFixture();
    try {
      const step = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "canvas.read", callId: "read-1",
        effect: "read", input: {}, now: fixture.now,
      });
      await fixture.db.query("UPDATE canvas_agent_tasks SET status='paused' WHERE id=$1", [fixture.taskId]);
      const skipped = await skipCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, stepId: step.id, actor: fixture.actor, now: fixture.later,
      });
      assert.equal(skipped.status, "skipped");
      const task = await fixture.db.query<{ status: string }>("SELECT status FROM canvas_agent_tasks WHERE id=$1", [fixture.taskId]);
      assert.equal(task.rows[0]?.status, "paused");
    } finally {
      await fixture.db.close();
    }
  });

  it("refuses to relabel a running side-effect step as skipped", async () => {
    const fixture = await createFixture();
    try {
      const step = await createCanvasAgentStep(fixture.db, {
        taskId: fixture.taskId, kind: "tool", toolId: "media.generate", callId: "media-1",
        effect: "media_generation", input: {}, now: fixture.now,
      });
      await fixture.db.query("UPDATE canvas_agent_tasks SET status='running' WHERE id=$1", [fixture.taskId]);
      await updateCanvasAgentStep(fixture.db, {
        stepId: step.id, status: "running", fromStatuses: ["created"], now: fixture.later,
      });
      await assert.rejects(
        skipCanvasAgentStep(fixture.db, { taskId: fixture.taskId, actor: fixture.actor, now: fixture.later }),
        (error) => error instanceof CanvasAgentStepSkipError && error.code === "canvas_agent_step_skip_unsafe_running",
      );
      const current = await fixture.db.query<{ status: string }>("SELECT status FROM canvas_agent_steps WHERE id=$1", [step.id]);
      assert.equal(current.rows[0]?.status, "running");
    } finally {
      await fixture.db.close();
    }
  });
});

async function createFixture() {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const actor: CanvasAgentActor = { ownerUserId, actorTeamMemberId: null, capabilities: new Set(["canvas:view", "canvas:run"]) };
  const now = new Date("2026-07-27T00:00:00.000Z");
  await db.query("INSERT INTO users (id,phone_e164,status) VALUES ($1,$2,'active')", [ownerUserId, uniquePhone()]);
  await db.query(`
    INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
    VALUES ($1,'Skip canvas','active',1,$2,$2)
  `, [canvasId, ownerUserId]);
  await db.query(`
    INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
    VALUES ($1,$2,$3,'Skip conversation',$4,$4)
  `, [conversationId, canvasId, ownerUserId, now]);
  const task = await createCanvasAgentTask(db, {
    canvasId, conversationId, actor, mode: "b", modelCode: "agent-test",
    modelConfigSnapshot: {
      version: 1, modelConfigId: randomUUID(), modelCode: "agent-test",
      providerName: "test", providerModel: "test", providerProtocol: "openai_compatible_chat",
      providerConfigRevisionId: "revision:test", credentialVersionRef: "credential:test",
      capabilities: {}, pricing: {}, limits: {}, providerConfig: {},
    },
    baseRevision: 1, userMessage: { text: "skip" }, now,
  });
  return { db, actor, canvasId, conversationId, taskId: task.id, now, later: new Date("2026-07-27T00:00:01.000Z") };
}

function uniquePhone() {
  return `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}
