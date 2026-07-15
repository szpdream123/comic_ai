import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  claimQueuedTask,
  createWorkflowWithTasks,
} from "../workflow-task.service.ts";

describe("workflow task claiming", { concurrency: false }, () => {
  it("allows only one worker to claim a queued task", { timeout: 30000 }, async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const created = await createWorkflowWithTasks(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "script_parse",
        inputSnapshot: { scriptId: "script_1" },
        tasks: [
          {
            taskType: "parse_script",
            queueName: "workflow-control",
            targetEntityType: "script",
            targetEntityId: "50000000-0000-4000-8000-000000000001",
            inputSnapshot: { scriptId: "script_1" },
          },
        ],
      });

      const first = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });
      const second = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-b",
        now: new Date("2026-05-09T10:00:01.000Z"),
        leaseMs: 60_000,
      });

      assert.equal(first?.task.status, "running");
      assert.equal(first?.attempt.attemptNumber, 1);
      assert.equal(second, undefined);
    } finally {
      await db.close();
    }
  });

  it("does not claim a queued task after its attempt limit is exhausted", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const created = await createWorkflowWithTasks(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "image_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "asset",
          targetEntityId: "50000000-0000-4000-8000-000000000002",
          inputSnapshot: {},
          maxAttempts: 1,
        }],
      });
      await db.query("UPDATE tasks SET attempt_count = max_attempts WHERE id = $1", [created.tasks[0]!.id]);

      const claimed = await claimQueuedTask(db, {
        taskId: created.tasks[0]!.id,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });

      assert.equal(claimed, undefined);
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
