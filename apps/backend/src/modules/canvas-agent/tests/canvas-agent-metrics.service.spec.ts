import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import { inspectCanvasAgentMetrics } from "../canvas-agent-metrics.service.ts";
import {
  createCanvasAgentStep,
  createCanvasAgentTask,
  requestCanvasAgentApproval,
} from "../canvas-agent-task.service.ts";

const now = new Date("2026-07-26T10:00:00.000Z");

test("Canvas Agent metrics aggregate bounded operational data without message content", async () => {
  const db = await createMigratedTestDb();
  const ownerUserId = randomUUID();
  const canvasId = randomUUID();
  const conversationId = randomUUID();
  const actor = {
    ownerUserId,
    actorTeamMemberId: null,
    capabilities: new Set([
      capabilities.canvasView,
      capabilities.canvasEdit,
      capabilities.canvasRun,
      capabilities.canvasManage,
    ]),
  };
  try {
    await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
    await db.query(`
      INSERT INTO creator_canvas_projects (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
      VALUES ($1,'Metrics Canvas','active',1,$2,$2)
    `, [canvasId, ownerUserId]);
    await db.query(`
      INSERT INTO canvas_agent_conversations (id,canvas_id,owner_user_id,title,created_at,updated_at)
      VALUES ($1,$2,$3,'Metrics',now(),now())
    `, [conversationId, canvasId, ownerUserId]);
    const succeeded = await createTask("b", "agent-a", "success");
    const failed = await createTask("c", "agent-b", "failure");
    const pending = await createTask("b", "agent-a", "approval");
    await db.query(`
      UPDATE canvas_agent_tasks
      SET status='succeeded',metrics_json=$2::jsonb,updated_at=$3
      WHERE id=$1
    `, [succeeded.id, JSON.stringify({
      modelRoundCount: 2, promptTokens: 10, completionTokens: 5, totalTokens: 15,
      modelDurationMs: 120, toolCallCount: 1, toolDurationMs: 20,
      policyDenyCount: 0, approvalRequestCount: 1, interjectionCount: 1,
    }), now]);
    await db.query(`
      UPDATE canvas_agent_tasks
      SET status='failed',failure_code='provider_stream_error',metrics_json=$2::jsonb,updated_at=$3
      WHERE id=$1
    `, [failed.id, JSON.stringify({
      modelRoundCount: 1, promptTokens: 4, completionTokens: 0, totalTokens: 4,
      modelDurationMs: 80, toolCallCount: 0, toolDurationMs: 0,
      policyDenyCount: 1, approvalRequestCount: 0, interjectionCount: 0,
    }), now]);
    const step = await createCanvasAgentStep(db, {
      taskId: pending.id,
      kind: "tool",
      toolId: "canvas.patch",
      callId: "metrics-approval",
      effect: "canvas_write",
      input: { expectedRevision: 1, operations: [] },
      now,
    });
    await requestCanvasAgentApproval(db, {
      taskId: pending.id,
      stepId: step.id,
      actor,
      effect: "canvas_write",
      reason: "metrics pending approval",
      now,
    });

    const metrics = await inspectCanvasAgentMetrics(db, {
      now: new Date(now.getTime() + 60_000),
      windowHours: 24,
      failureLimit: 10,
    });
    assert.equal(metrics.summary.totalTasks, 3);
    assert.equal(metrics.summary.succeededTasks, 1);
    assert.equal(metrics.summary.failedTasks, 1);
    assert.equal(metrics.summary.waitingApprovalTasks, 1);
    assert.equal(metrics.summary.pendingApprovals, 1);
    assert.equal(metrics.summary.totalTokens, 19);
    assert.equal(metrics.summary.modelDurationMs, 200);
    assert.equal(metrics.summary.policyDenyCount, 1);
    assert.equal(metrics.summary.successRate, 1 / 3);
    assert.deepEqual(metrics.modes, [
      { mode: "b", taskCount: 2 },
      { mode: "c", taskCount: 1 },
    ]);
    assert.equal(metrics.models.find((model) => model.modelCode === "agent-a")?.taskCount, 2);
    assert.deepEqual(metrics.recentFailures.map((item) => [item.taskId, item.failureCode]), [
      [failed.id, "provider_stream_error"],
    ]);
    assert.equal("messages" in metrics, false);
  } finally {
    await db.close();
  }

  async function createTask(mode: "b" | "c", modelCode: string, text: string) {
    return createCanvasAgentTask(db, {
      canvasId,
      conversationId,
      actor,
      mode,
      modelCode,
      modelConfigSnapshot: {},
      baseRevision: 1,
      userMessage: { text },
      now,
    });
  }
});
