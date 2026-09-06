import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { agentExecutionMetadata } from "../../shared/db/agent-execution-scope.ts";
import { createWorkflowWithTasks, claimQueuedTask } from "../../workflow-task/workflow-task.service.ts";
import { CanvasAgentWorker } from "../canvas-agent.worker.ts";
import { CanvasAgentOutboxService } from "../canvas-agent-outbox.service.ts";
import { CanvasAgentRepairService } from "../canvas-agent-repair.service.ts";
import { createCanvasAgentTask, createCanvasAgentStep, updateCanvasAgentStep, transitionCanvasAgentTask } from "../canvas-agent-task.service.ts";

test("scoped Agent wakes after media completion and preserves worker audit across released attempts", async () => {
  const db = await createMigratedTestDb();
  const now = new Date(Date.now() + 60_000);
  const owner = randomUUID(), canvas = randomUUID(), conversation = randomUUID();
  const metadata = agentExecutionMetadata();
  try {
    await db.query("INSERT INTO users(id,status) VALUES ($1,'active')", [owner]);
    await db.query("INSERT INTO creator_canvas_projects(id,title,status,server_revision,created_by_user_id,updated_by_user_id) VALUES ($1,'Isolation lifecycle','active',1,$2,$2)", [canvas, owner]);
    await db.query("INSERT INTO canvas_agent_conversations(id,canvas_id,owner_user_id,title,shard_id) VALUES ($1,$2,$3,'Isolation lifecycle',0)", [conversation, canvas, owner]);
    const task = await createCanvasAgentTask(db, {
      canvasId: canvas, conversationId: conversation,
      actor: { ownerUserId: owner, actorTeamMemberId: null, capabilities: new Set(["canvas:run"]) },
      mode: "b", modelCode: "test-planner", modelConfigSnapshot: {}, baseRevision: 1,
      userMessage: { text: "Draw a character" }, now,
    });
    let generationId = "";
    let executions = 0;
    const worker = new CanvasAgentWorker({
      db, workerId: "verified-local-worker", now: () => now,
      executor: { async execute(taskId) {
        executions += 1;
        if (executions === 1) {
          const step = await createCanvasAgentStep(db, { taskId, kind: "tool", effect: "media_generation", input: {}, toolId: "generation.create", now });
          const media = await createWorkflowWithTasks(db, {
            userId: owner, projectId: null, canvasProjectId: canvas, workflowType: "image_generation", inputSnapshot: metadata,
            tasks: [{ taskType: "episode_generate_image", queueName: "generation-submit", targetEntityType: "canvas_agent_conversation", targetEntityId: conversation, inputSnapshot: { ...metadata, agentTaskId: taskId } }],
          });
          generationId = media.tasks[0].id;
          await updateCanvasAgentStep(db, { stepId: step.id, status: "waiting_external", generationTaskId: generationId, now });
          return transitionCanvasAgentTask(db, { taskId, from: ["running"], to: "waiting_external", now });
        }
        return transitionCanvasAgentTask(db, { taskId, from: ["running"], to: "succeeded", now });
      } },
    });
    const published: string[] = [];
    const outbox = new CanvasAgentOutboxService({ db, workerId: "verified-local-worker", now: () => now,
      publisher: { async publish(event) { published.push(event.taskId); } } });

    // Old worker SQL must fail at the generic claim, before any attempt exists.
    await db.query("SELECT set_config('comic_ai.agent_execution_scope','',false)");
    assert.equal(await claimQueuedTask(db, { taskId: task.workflowTaskId, workerId: "old-worker", leaseMs: 60000, now }), undefined);
    assert.deepEqual(await worker.runQueuedOnce(), []);
    assert.equal((await worker.processTask(task.id)).status, "skipped");
    assert.equal((await outbox.dispatchBatch()).claimed, 0);
    await db.query("SELECT set_config('comic_ai.agent_execution_scope',$1,false)", [metadata.agentExecutionScope]);
    assert.equal((await outbox.dispatchBatch()).dispatched, 1);
    assert.deepEqual(published, [task.id]);
    const waiting = (await worker.runQueuedOnce())[0];
    assert.equal(waiting.status, "waiting_external", JSON.stringify(waiting));
    await db.query("UPDATE tasks SET status='succeeded' WHERE id=$1", [generationId]);
    const repair = new CanvasAgentRepairService({ db, now: () => now });
    assert.equal((await repair.resumeCompletedGenerations()).resumed, 1);
    assert.equal((await repair.resumeCompletedGenerations()).resumed, 0);
    assert.equal((await worker.runQueuedOnce())[0].status, "succeeded");
    assert.equal(executions, 2);
    const audit = await db.query<{ event_json: Record<string, unknown> }>("SELECT event_json FROM canvas_agent_events WHERE task_id=$1 AND event_type='task.started' ORDER BY sequence", [task.id]);
    assert.equal(audit.rows.length, 2);
    for (const row of audit.rows) {
      assert.equal(row.event_json.workerId, "verified-local-worker");
      assert.equal(row.event_json.agentExecutionScope, metadata.agentExecutionScope);
    }
    const attempts = await db.query<{ locked_by: string | null }>("SELECT locked_by FROM task_attempts WHERE task_id=$1 ORDER BY attempt_number", [task.workflowTaskId]);
    assert.equal(attempts.rows[0].locked_by, null);
  } finally { await db.close(); }
});
