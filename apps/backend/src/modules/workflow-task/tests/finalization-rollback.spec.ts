import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
  finalizeTaskAttempt,
} from "../workflow-task.service.ts";

describe("workflow task finalization", { concurrency: false }, () => {
  it("rolls back task and attempt state when local finalization fails", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const created = await createWorkflowWithTasks(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "script_parse",
        inputSnapshot: {},
        tasks: [
          {
            taskType: "parse_script",
            queueName: "workflow-control",
            targetEntityType: "script",
            targetEntityId: "50000000-0000-4000-8000-000000000001",
            inputSnapshot: {},
          },
        ],
      });
      const claimed = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });

      await assert.rejects(
        finalizeTaskAttempt(db, {
          taskId: claimed!.task.id,
          attemptId: claimed!.attempt.id,
          status: "succeeded",
          now: new Date("2026-05-09T10:01:00.000Z"),
          finalize: async () => {
            throw new Error("business_finalization_failed");
          },
        }),
        /business_finalization_failed/,
      );

      const task = await db.query<{ status: string }>(
        "SELECT status FROM tasks WHERE id = $1",
        [claimed!.task.id],
      );
      const attempt = await db.query<{ status: string }>(
        "SELECT status FROM task_attempts WHERE id = $1",
        [claimed!.attempt.id],
      );

      assert.equal(task.rows[0]?.status, "running");
      assert.equal(attempt.rows[0]?.status, "running");
    } finally {
      await db.close();
    }
  });

  it("does not run finalization or overwrite a task already settled by timeout", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const created = await createWorkflowWithTasks(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "batch_image",
        inputSnapshot: {},
        tasks: [
          {
            taskType: "generate_image",
            queueName: "image-generation",
            targetEntityType: "shot",
            targetEntityId: "50000000-0000-4000-8000-000000000002",
            inputSnapshot: {},
          },
        ],
      });
      const claimed = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });
      const timedOutAt = new Date("2026-05-09T11:00:00.000Z");
      await db.query(
        "UPDATE tasks SET status = 'failed', failure_code = 'task_timeout', updated_at = $2 WHERE id = $1",
        [claimed!.task.id, timedOutAt],
      );
      await db.query(
        "UPDATE task_attempts SET status = 'failed', failure_code = 'task_timeout', finished_at = $2, updated_at = $2 WHERE id = $1",
        [claimed!.attempt.id, timedOutAt],
      );

      let finalizationRan = false;
      await assert.rejects(
        finalizeTaskAttempt(db, {
          taskId: claimed!.task.id,
          attemptId: claimed!.attempt.id,
          status: "succeeded",
          now: new Date("2026-05-09T11:01:00.000Z"),
          finalize: async () => {
            finalizationRan = true;
          },
        }),
        /task_finalization_state_conflict/,
      );

      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [claimed!.task.id],
      );
      const attempt = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM task_attempts WHERE id = $1",
        [claimed!.attempt.id],
      );
      assert.equal(finalizationRan, false);
      assert.deepEqual(task.rows[0], { status: "failed", failure_code: "task_timeout" });
      assert.deepEqual(attempt.rows[0], { status: "failed", failure_code: "task_timeout" });
    } finally {
      await db.close();
    }
  });
});

async function seedUser(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ('00000000-0000-4000-8000-000000000001', '13800138001', 'active')",
  );
}
