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

  it("binds pre-created provider requests when the task attempt is claimed", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUser(db);
      const created = await createWorkflowWithTasks(db, {
        userId: "00000000-0000-4000-8000-000000000001",
        projectId: null,
        workflowType: "video_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_video",
          queueName: "generation-submit-video",
          targetEntityType: "storyboard",
          targetEntityId: "50000000-0000-4000-8000-000000000003",
          inputSnapshot: {},
        }],
      });
      const taskId = created.tasks[0]!.id;
      const providerRequestId = "70000000-0000-4000-8000-000000000003";
      await db.query(
        `
          INSERT INTO provider_requests (
            id, task_id, provider_name, provider_operation, request_key,
            request_hash, payload_ref, payload_hash, payload_redacted_json,
            status, created_by_user_id
          ) VALUES ($1, $2, 'test-provider', 'episode.video.generate', $3,
                    'request-hash', 'payload-ref', 'payload-hash', '{}'::jsonb,
                    'created', $4)
        `,
        [providerRequestId, taskId, `request:${taskId}`, "00000000-0000-4000-8000-000000000001"],
      );
      await db.query(
        `
          INSERT INTO user_model_request_logs (
            id, provider_request_id, task_id, user_id, provider_name,
            provider_operation, model_id, provider_model, request_key,
            request_hash, payload_hash, request_body_json, status,
            started_at, created_at, updated_at
          ) VALUES ('71000000-0000-4000-8000-000000000003', $1, $2, $3,
                    'test-provider', 'episode.video.generate', 'test-model',
                    'test-provider-model', $4, 'request-hash', 'payload-hash',
                    '{}'::jsonb, 'submitted', $5, $5, $5)
        `,
        [providerRequestId, taskId, "00000000-0000-4000-8000-000000000001", `request:${taskId}`, new Date("2026-05-09T10:00:00.000Z")],
      );

      const claimed = await claimQueuedTask(db, {
        taskId,
        workerId: "worker-a",
        now: new Date("2026-05-09T10:00:00.000Z"),
        leaseMs: 60_000,
      });
      assert.ok(claimed);

      const state = await db.query<{ provider_attempt_id: string; log_attempt_id: string }>(
        `
          SELECT request.attempt_id AS provider_attempt_id,
                 log.attempt_id AS log_attempt_id
          FROM provider_requests request
          JOIN user_model_request_logs log ON log.provider_request_id = request.id
          WHERE request.id = $1
        `,
        [providerRequestId],
      );
      assert.deepEqual(state.rows[0], {
        provider_attempt_id: claimed!.attempt.id,
        log_attempt_id: claimed!.attempt.id,
      });
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
