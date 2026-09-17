import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { aggregateWorkflowStatus, finalizeTaskAttempt } from "../workflow-task/workflow-task.service.ts";
import { claimProductionAgentTask, createOrReuseProductionAgentExecution } from "./production-agent.adapter.ts";
import { createWorkflowWithTasks } from "../workflow-task/workflow-task.service.ts";
import { createProjectDraft } from "./project.service.ts";
import { SqlProjectStore } from "./sql-project.store.ts";

describe("production agent execution", { concurrency: false }, () => {
  it("reuses one workflow and task for the same idempotency key", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000091";

    try {
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138091', 'active')",
        [userId],
      );
      const created = await createProjectDraft(new SqlProjectStore(db), {
        userId,
        createdByUserId: userId,
        name: "Production Agent idempotency",
        scriptInput: "A short script.",
        aspectRatio: "9:16",
        resolution: "1080p",
        projectType: "animation",
        idempotencyKey: "production-agent-project",
      });
      const input = {
        userId,
        projectId: created.project.id,
        idempotencyKey: "production-agent-preview",
        requestFingerprint: "production-agent-preview-request-v1",
        stages: ["script", "shot"],
        leaseMs: 60_000,
        now: new Date("2026-09-16T00:00:00.000Z"),
      };

      const first = await createOrReuseProductionAgentExecution(db, input);
      const replay = await createOrReuseProductionAgentExecution(db, input);
      await finalizeTaskAttempt(db, {
        taskId: first.taskId,
        attemptId: first.attemptId!,
        status: "failed",
        failureCode: "model_failed",
        now: new Date("2026-09-16T00:01:00.000Z"),
      });
      await aggregateWorkflowStatus(db, first.workflowId);
      const retryAfterFailure = await createOrReuseProductionAgentExecution(db, {
        ...input,
        now: new Date("2026-09-16T00:02:00.000Z"),
      });
      const counts = await db.query<{ workflows: number; tasks: number; attempts: number }>(
        `
          SELECT
            (SELECT count(*)::int FROM workflows WHERE workflow_type = 'production_agent') AS workflows,
            (SELECT count(*)::int FROM tasks WHERE task_type = 'production_agent.execute') AS tasks,
            (SELECT count(*)::int FROM task_attempts WHERE task_id = $1) AS attempts
        `,
        [first.taskId],
      );

      assert.equal(first.finished, false);
      assert.ok(first.attemptId);
      assert.equal(replay.workflowId, first.workflowId);
      assert.equal(replay.taskId, first.taskId);
      assert.equal(replay.finished, true);
      assert.equal(retryAfterFailure.workflowId, first.workflowId);
      assert.equal(retryAfterFailure.taskId, first.taskId);
      assert.equal(retryAfterFailure.finished, false);
      assert.notEqual(retryAfterFailure.attemptId, first.attemptId);
      assert.deepEqual(counts.rows[0], { workflows: 1, tasks: 1, attempts: 2 });
      await assert.rejects(
        createOrReuseProductionAgentExecution(db, {
          ...input,
          requestFingerprint: "production-agent-preview-request-v2",
          now: new Date("2026-09-16T00:03:00.000Z"),
        }),
        (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "idempotency_conflict"),
      );
    } finally {
      await db.close();
    }
  });

  it("refuses to claim a canvas task through the Production Agent executor", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000092";
    try {
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138092', 'active')",
        [userId],
      );
      const canvasProjectId = "00000000-0000-4000-8000-000000000192";
      await db.query(
        `INSERT INTO creator_canvas_projects (id, title, status, created_by_user_id, updated_by_user_id)
         VALUES ($1, '隔离画布', 'active', $2, $2)`,
        [canvasProjectId, userId],
      );
      const foreign = await createWorkflowWithTasks(db, {
        userId,
        projectId: null,
        canvasProjectId,
        workflowType: "canvas_agent",
        inputSnapshot: { agentType: "canvas", scopeType: "canvas", scopeId: canvasProjectId },
        tasks: [{
          taskType: "canvas_agent.execute",
          queueName: "task-center",
          targetEntityType: "canvas",
          targetEntityId: canvasProjectId,
          inputSnapshot: { agentType: "canvas", scopeType: "canvas", scopeId: canvasProjectId },
        }],
      });

      await assert.rejects(
        claimProductionAgentTask(db, {
          taskId: foreign.tasks[0]!.id,
          projectId: canvasProjectId,
          workerId: "production-agent-test",
          now: new Date("2026-09-16T02:00:00.000Z"),
          leaseMs: 60_000,
        }),
        /production_agent_task_route_mismatch/,
      );
      const task = await db.query<{ status: string; attempt_count: number }>(
        "SELECT status, attempt_count FROM tasks WHERE id = $1",
        [foreign.tasks[0]!.id],
      );
      assert.deepEqual(task.rows[0], { status: "queued", attempt_count: 0 });
    } finally {
      await db.close();
    }
  });

  it("does not reset a failed Production task after its immutable route is altered", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000095";
    try {
      await db.query(
        "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138095', 'active')",
        [userId],
      );
      const created = await createProjectDraft(new SqlProjectStore(db), {
        userId,
        createdByUserId: userId,
        name: "Production route mutation guard",
        scriptInput: "A short script.",
        aspectRatio: "9:16",
        resolution: "1080p",
        projectType: "animation",
        idempotencyKey: "production-route-mutation-project",
      });
      const input = {
        userId,
        projectId: created.project.id,
        idempotencyKey: "production-route-mutation-preview",
        requestFingerprint: "production-route-mutation-v1",
        stages: ["script"],
        leaseMs: 60_000,
        now: new Date("2026-09-16T05:00:00.000Z"),
      };
      const execution = await createOrReuseProductionAgentExecution(db, input);
      await finalizeTaskAttempt(db, {
        taskId: execution.taskId,
        attemptId: execution.attemptId!,
        status: "failed",
        failureCode: "test_failure",
        now: new Date("2026-09-16T05:01:00.000Z"),
      });
      await db.query(
        "UPDATE tasks SET input_snapshot_json = jsonb_set(input_snapshot_json, '{scopeType}', '\"canvas\"'::jsonb) WHERE id = $1",
        [execution.taskId],
      );

      await assert.rejects(
        createOrReuseProductionAgentExecution(db, {
          ...input,
          now: new Date("2026-09-16T05:02:00.000Z"),
        }),
        /production_agent_task_route_mismatch/,
      );
      const task = await db.query<{ status: string; attempt_count: number }>(
        "SELECT status, attempt_count FROM tasks WHERE id = $1",
        [execution.taskId],
      );
      assert.deepEqual(task.rows[0], { status: "failed", attempt_count: 1 });
    } finally {
      await db.close();
    }
  });
});
