import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { CanvasAgentActor } from "../canvas-agent.types.ts";
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
  return { db, actor, taskId: task.id, now, later: new Date("2026-07-27T00:00:01.000Z") };
}

function uniquePhone() {
  return `136${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}
