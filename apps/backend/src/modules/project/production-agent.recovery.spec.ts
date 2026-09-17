import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { aggregateWorkflowStatus, createWorkflowWithTasks } from "../workflow-task/workflow-task.service.ts";
import {
  createOrReuseProductionAgentExecution,
  finalizeProductionAgentTask,
} from "./production-agent.adapter.ts";
import {
  cancelProductionAgentTask,
  resumeProductionAgentTask,
  retryProductionAgentTask,
} from "./production-agent.recovery.ts";
import { createProjectDraft } from "./project.service.ts";
import { SqlProjectStore } from "./sql-project.store.ts";

describe("production agent recovery", { concurrency: false }, () => {
  it("cancels, retries, and resumes with new attempts without changing canvas state", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000093";
    const canvasId = "00000000-0000-4000-8000-000000000193";
    try {
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138093', 'active')",
        [userId],
      );
      const project = await createProjectDraft(new SqlProjectStore(db), {
        userId,
        createdByUserId: userId,
        name: "Production recovery",
        scriptInput: "Recovery script.",
        aspectRatio: "9:16",
        resolution: "1080p",
        projectType: "animation",
        idempotencyKey: "production-recovery-project",
      });
      await db.query(
        `
          INSERT INTO creator_canvas_projects (
            id, title, status, server_revision, created_by_user_id, updated_by_user_id
          )
          VALUES ($1, 'Recovery isolation canvas', 'active', 7, $2, $2)
        `,
        [canvasId, userId],
      );
      const beforeCanvas = await canvasState(db, canvasId);
      const execution = await createOrReuseProductionAgentExecution(db, {
        userId,
        projectId: project.project.id,
        idempotencyKey: "production-recovery-preview",
        requestFingerprint: "production-recovery-preview-v1",
        stages: ["script", "asset", "shot"],
        leaseMs: 60_000,
        now: new Date("2026-09-16T03:00:00.000Z"),
      });

      const canceled = await cancelProductionAgentTask(db, {
        taskId: execution.taskId,
        projectId: project.project.id,
        now: new Date("2026-09-16T03:01:00.000Z"),
      });
      const retried = await retryProductionAgentTask(db, {
        taskId: execution.taskId,
        projectId: project.project.id,
        workerId: "production-recovery-test-retry",
        leaseMs: 60_000,
        now: new Date("2026-09-16T03:02:00.000Z"),
      });
      await finalizeProductionAgentTask(db, {
        taskId: retried.taskId,
        attemptId: retried.attemptId!,
        projectId: project.project.id,
        status: "failed",
        failureCode: "test_failure_after_retry",
        now: new Date("2026-09-16T03:03:00.000Z"),
      });
      await aggregateWorkflowStatus(db, execution.workflowId);
      const resumed = await resumeProductionAgentTask(db, {
        taskId: execution.taskId,
        projectId: project.project.id,
        workerId: "production-recovery-test-resume",
        leaseMs: 60_000,
        now: new Date("2026-09-16T03:04:00.000Z"),
      });
      await cancelProductionAgentTask(db, {
        taskId: execution.taskId,
        projectId: project.project.id,
        now: new Date("2026-09-16T03:05:00.000Z"),
      });

      const state = await db.query<{
        task_status: string;
        workflow_status: string;
        attempt_count: number;
        attempt_statuses: string[];
      }>(
        `
          SELECT task.status AS task_status,
                 workflow.status AS workflow_status,
                 task.attempt_count,
                 ARRAY(
                   SELECT attempt.status
                   FROM task_attempts attempt
                   WHERE attempt.task_id = task.id
                   ORDER BY attempt.attempt_number
                 ) AS attempt_statuses
          FROM tasks task
          JOIN workflows workflow ON workflow.id = task.workflow_id
          WHERE task.id = $1
        `,
        [execution.taskId],
      );

      assert.equal(canceled.attemptId, execution.attemptId);
      assert.equal(canceled.attemptNumber, 1);
      assert.equal(retried.attemptNumber, 2);
      assert.notEqual(retried.attemptId, execution.attemptId);
      assert.equal(resumed.attemptNumber, 3);
      assert.notEqual(resumed.attemptId, retried.attemptId);
      assert.deepEqual(state.rows[0], {
        task_status: "canceled",
        workflow_status: "canceled",
        attempt_count: 3,
        attempt_statuses: ["canceled", "failed", "canceled"],
      });
      assert.deepEqual(await canvasState(db, canvasId), beforeCanvas);
    } finally {
      await db.close();
    }
  });

  it("rejects Canvas tasks and altered Production routing snapshots", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000094";
    const canvasId = "00000000-0000-4000-8000-000000000194";
    try {
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138094', 'active')",
        [userId],
      );
      await db.query(
        `INSERT INTO creator_canvas_projects (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
         VALUES ($1, 'Foreign Canvas task', 'active', 4, $2, $2)`,
        [canvasId, userId],
      );
      const canvasWorkflow = await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId: canvasId,
        workflowType: "canvas_agent",
        inputSnapshot: { agentType: "canvas", scopeType: "canvas", scopeId: canvasId },
        tasks: [{
          taskType: "canvas_agent.execute",
          queueName: "task-center",
          targetEntityType: "canvas",
          targetEntityId: canvasId,
          inputSnapshot: { agentType: "canvas", scopeType: "canvas", scopeId: canvasId },
        }],
      });
      const beforeCanvas = await canvasState(db, canvasId);

      for (const operation of [cancelProductionAgentTask, retryProductionAgentTask, resumeProductionAgentTask]) {
        await assert.rejects(
          operation(db, {
            taskId: canvasWorkflow.tasks[0]!.id,
            projectId: canvasId,
            workerId: "production-recovery-isolation-test",
            leaseMs: 60_000,
            now: new Date("2026-09-16T04:00:00.000Z"),
          }),
          /production_agent_task_route_mismatch/,
        );
      }
      const canvasTask = await db.query<{ status: string; attempt_count: number }>(
        "SELECT status, attempt_count FROM tasks WHERE id = $1",
        [canvasWorkflow.tasks[0]!.id],
      );
      assert.deepEqual(canvasTask.rows[0], { status: "queued", attempt_count: 0 });
      assert.deepEqual(await canvasState(db, canvasId), beforeCanvas);
    } finally {
      await db.close();
    }
  });
});

async function canvasState(db: Awaited<ReturnType<typeof createMigratedTestDb>>, canvasId: string) {
  const state = await db.query<{
    server_revision: number;
    node_count: number;
    message_count: number;
  }>(
    `
      SELECT canvas.server_revision,
             (SELECT count(*)::int FROM creator_canvas_nodes node WHERE node.canvas_project_id = canvas.id) AS node_count,
             (SELECT count(*)::int FROM canvas_agent_messages) AS message_count
      FROM creator_canvas_projects canvas
      WHERE canvas.id = $1
    `,
    [canvasId],
  );
  return state.rows[0];
}
